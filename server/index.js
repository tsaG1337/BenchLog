'use strict';
const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const { v4: uuidv4 } = require('uuid');
const path       = require('path');
const fs         = require('fs');
const mqtt       = require('mqtt');
const crypto     = require('crypto');
const bcrypt     = require('bcrypt');
const BCRYPT_ROUNDS = 12;
const sharp      = require('sharp');
const heicConvert = require('heic-convert');
const archiver   = require('archiver');
const os         = require('os');
const unzipper   = require('unzipper');

const {
  DB_BACKEND,
  DATA_DIR,
  masterDb,
  getTenantDb,
  getDefaultDb,
  getDefaultTenantId,
  ensureFirstTenant,
  getFirstTenant,
  getTenantBySlug,
  getTenantProfileBySlug,
  getTenantsByEmail,
  setTenantPassword,
  runMigrationIfNeeded,
  getMasterSqlite,
  openSqlite,
  tenantDbPath,
  listTenants,
  listPublicTenants,
  getOrCreateIndexNowKey,
  getTenantByIndexNowKey,
  getTenantById,
  createTenantRow,
  updateTenantRow,
  deleteTenantRow,
  getPlatformSetting,
  setPlatformSetting,
} = require('./db');
const { initMasterSchema, initTenantSchema, initPostgresSchema } = require('./schema');
const { DEFAULT_GENERAL, DEFAULT_SECTIONS, DEFAULT_AIRCRAFT_SLUG, DEFAULT_ONBOARDING, loadDefaultWorkPackages } = require('./tenant-defaults');
const indexNow = require('./indexnow');

// ─── Auth helpers ────────────────────────────────────────────────────
function loadOrCreateJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(DATA_DIR, '.jwt_secret');
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(secretFile, secret, { mode: 0o644 });
  console.log('[auth] Generated JWT secret →', secretFile);
  return secret;
}
const JWT_SECRET = loadOrCreateJwtSecret();

// ─── HTML escaping helper (XSS prevention for OG tags) ──────────────
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Login rate limiting (in-memory) ────────────────────────────────
const loginAttempts = new Map();
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW = 15 * 60 * 1000; // 15 minutes
const TOKEN_EXPIRY_HOURS = 24 * 14; // 14 days
const TOKEN_EXPIRY_HOURS_REMEMBER = 24 * 90; // 90 days — opt-in via "Remember me"
// Clean up expired login attempt entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now >= entry.resetTime) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000).unref();

function createToken(payload, hours = TOKEN_EXPIRY_HOURS) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + hours * 3600000 })).toString('base64url');
  const sig    = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (!sig || sig.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// Returns true if the hash looks like a bcrypt hash (starts with $2b$ or $2a$)
function isBcryptHash(h) { return typeof h === 'string' && (h.startsWith('$2b$') || h.startsWith('$2a$')); }

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Verifies password against stored hash. Supports both bcrypt and legacy SHA-256.
// Returns { ok, rehash } — rehash is the new bcrypt hash when the stored hash was
// legacy SHA-256 and the password was correct, so callers can upgrade it in place.
async function verifyPassword(password, storedHash) {
  if (isBcryptHash(storedHash)) {
    const ok = await bcrypt.compare(password, storedHash);
    return { ok, rehash: null };
  }
  // Legacy SHA-256 path (timing-safe comparison)
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  const legacyBuf = Buffer.from(legacyHash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (legacyBuf.length !== storedBuf.length || !crypto.timingSafeEqual(legacyBuf, storedBuf)) return { ok: false, rehash: null };
  // Correct password — upgrade to bcrypt on the fly
  const rehash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return { ok: true, rehash };
}

// Cache deactivated tenants for 60s to avoid DB lookups on every request
const _deactivatedTenants = new Map(); // tenantId → expiry timestamp
setInterval(() => { const now = Date.now(); for (const [k, v] of _deactivatedTenants) { if (v < now) _deactivatedTenants.delete(k); } }, 60000).unref();

async function requireAuth(req, res, next) {
  if (DEMO_MODE) {
    // Demo deployments accept a real Bearer token if one is presented (lets
    // the operator log in as admin without disabling DEMO_MODE on the server).
    // Anonymous visitors fall through with no `req.user` — every privileged
    // endpoint downstream still gates on `req.user.role === 'admin'`.
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const payload = verifyToken(auth.slice(7));
      if (payload) {
        req.user = payload;
        req.tenantId = payload.tenantId || getDefaultTenantId();
        try { req.db = getTenantDb(req.tenantId); } catch { req.db = getDefaultDb(); }
        return next();
      }
    }
    req.tenantId = getDefaultTenantId() || 'demo';
    try { req.db = getDefaultDb(); } catch { req.db = null; }
    return next();
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = payload;
  // Legacy tokens (no tenantId) fall back to the default/only tenant
  req.tenantId = payload.tenantId || getDefaultTenantId();
  // Check if tenant has been deactivated (in-memory cache, or DB fallback on cache miss)
  if (_deactivatedTenants.has(req.tenantId)) return res.status(403).json({ error: 'Account deactivated' });
  try {
    const tenant = await getTenantById(req.tenantId);
    if (tenant && (tenant.is_active === 0 || tenant.is_active === false)) {
      _deactivatedTenants.set(req.tenantId, Date.now() + 3600000); // cache for next requests
      return res.status(403).json({ error: 'Account deactivated. Please contact your administrator.' });
    }
  } catch { /* non-fatal: if DB check fails, allow request through */ }
  req.db = getTenantDb(req.tenantId);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Blocks writes when the server is running in demo mode. Demo tenants are
// shared across visitors, so we explicitly refuse mutations on endpoints that
// don't already have a per-feature read-only flag at the UI layer.
function requireNotDemo(req, res, next) {
  // Admins with a verified Bearer token bypass the demo gate so they can
  // administer the demo tenant in place. requireAuth runs upstream and sets
  // req.user when a valid token is presented.
  if (DEMO_MODE && !(req.user && req.user.role === 'admin')) {
    return res.status(403).json({ error: 'Demo mode is read-only — changes cannot be saved.' });
  }
  next();
}

// Blocks non-admin users from mutating data when maintenance mode is active.
async function requireNotMaintenance(req, res, next) {
  // Admins always pass; demo mode ignores maintenance
  if (DEMO_MODE || (req.user && req.user.role === 'admin')) return next();
  try {
    const db = req.db || getDefaultDb();
    const general = await getSetting(db, 'general', DEFAULT_GENERAL);
    if (general.maintenanceMode) {
      return res.status(503).json({ error: 'Server is in maintenance mode. Please try again later.' });
    }
  } catch {}
  next();
}

// Returns true if the request may read the blog.
// Returns false (and sends 403) when public_blog is disabled and the caller is not authenticated.
async function checkBlogAccess(req, res) {
  const tenant = req.tenant || await getFirstTenant();
  if (tenant && tenant.public_blog === 0) {
    const auth = req.headers.authorization;
    const payload = auth && auth.startsWith('Bearer ') ? verifyToken(auth.slice(7)) : null;
    if (!payload || payload.tenantId !== req.tenantId) {
      res.status(403).json({ error: 'This blog is private' });
      return false;
    }
  }
  return true;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Valid subdomain slug: lowercase alphanumeric + hyphens, 2–30 chars,
// must start and end with alphanumeric (no leading/trailing hyphen).
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/;
function validateSlug(slug) {
  if (!SLUG_RE.test(slug)) return 'slug must be 2–30 characters, lowercase letters/numbers/hyphens only, and cannot start or end with a hyphen';
  return null;
}
function serverError(res, err) {
  console.error('[server error]', err);
  const msg = IS_PRODUCTION ? 'Internal server error' : (err.message || String(err));
  res.status(500).json({ error: msg });
}

function requireServiceKey(req, res, next) {
  const configured = process.env.INTERNAL_API_KEY;
  if (!configured) return res.status(503).json({ error: 'Internal API not enabled — set INTERNAL_API_KEY' });
  const key = req.headers['x-service-key'];
  if (!key || typeof key !== 'string' || key.length !== configured.length ||
      !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(configured))) {
    return res.status(401).json({ error: 'Invalid or missing X-Service-Key header' });
  }
  next();
}

function requirePostgres(req, res, next) {
  if (DB_BACKEND !== 'postgres') return res.status(400).json({ error: 'Internal API requires DB_BACKEND=postgres' });
  next();
}

// Rate limiter for webhook key checks (prevent brute-force / DoS scanning all tenants)
const _webhookAttempts = new Map(); // ip → { count, resetAt }
const WEBHOOK_RATE_LIMIT = 20;
const WEBHOOK_RATE_WINDOW = 60 * 1000; // 1 minute
setInterval(() => { const now = Date.now(); for (const [k, v] of _webhookAttempts) { if (v.resetAt < now) _webhookAttempts.delete(k); } }, 60000).unref();

async function requireWebhookKey(req, res, next) {
  const key = req.query.key || req.headers['x-webhook-key'];
  if (!key) return res.status(401).json({ error: 'Missing webhook key' });

  // Rate limit webhook auth attempts
  const ip = req.ip;
  const now = Date.now();
  const attempt = _webhookAttempts.get(ip) || { count: 0, resetAt: now + WEBHOOK_RATE_WINDOW };
  if (attempt.resetAt < now) { attempt.count = 0; attempt.resetAt = now + WEBHOOK_RATE_WINDOW; }
  attempt.count++;
  _webhookAttempts.set(ip, attempt);
  if (attempt.count > WEBHOOK_RATE_LIMIT) return res.status(429).json({ error: 'Too many requests' });

  try {
    const tenants = await listTenants();
    for (const { id } of tenants) {
      const db = getTenantDb(id);
      const stored = await getSetting(db, 'webhook_api_key', null);
      if (stored && typeof key === 'string' && key.length === stored.length &&
          crypto.timingSafeEqual(Buffer.from(key), Buffer.from(stored))) {
        req.tenantId = id;
        req.db = db;
        return next();
      }
    }
    return res.status(401).json({ error: 'Invalid webhook key' });
  } catch (err) {
    serverError(res, err);
  }
}

// ─── Config via environment variables ──────────────────────────────
const PORT       = process.env.PORT || 3001;
const DIST_PATH  = process.env.DIST_PATH || path.join(__dirname, '../dist');
const DEMO_MODE  = process.env.DEMO_MODE === 'true';
if (DEMO_MODE) console.log('[demo] Demo mode enabled — all write operations are blocked');

// SINGLE_TENANT forces a Postgres deployment to behave as one user with no
// subdomain routing — for self-hosting a single build log reachable by raw IP
// or any domain. SQLite is already single-tenant, so the flag only changes
// Postgres behaviour. MULTI_TENANT is the derived "route by subdomain" switch,
// kept distinct from DB_BACKEND (which only selects the SQL dialect).
const SINGLE_TENANT = process.env.SINGLE_TENANT === 'true';
const MULTI_TENANT  = DB_BACKEND === 'postgres' && !SINGLE_TENANT;
if (SINGLE_TENANT) console.log('[init] SINGLE_TENANT enabled — subdomain routing off, serving one tenant');

/** True when `host` is a bare IP address rather than a domain name. IPv4
 *  octets ("192.168.1.22") look like a 4-label hostname to `.split('.')`, so
 *  without this guard the first octet gets mistaken for a tenant subdomain.
 *  `host` is expected to already have any :port stripped. */
function isBareIpHost(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;        // IPv4
  if (host.startsWith('[') || host.includes(':')) return true;  // IPv6 literal
  return false;
}
const OCR_URL    = process.env.OCR_URL || '';
if (OCR_URL) {
  try { const u = new URL(OCR_URL); if (!['http:', 'https:'].includes(u.protocol)) throw new Error('invalid'); }
  catch { console.error(`[ocr] Invalid OCR_URL: ${OCR_URL} — must be http(s)://`); process.exit(1); }
  console.log(`[ocr] OCR service configured at ${OCR_URL}`);
}

// Legacy DB_PATH kept for compatibility (used for upload dirs)
const DB_PATH    = process.env.DB_PATH || path.join(DATA_DIR, 'database.db');
const UPLOADS_DIR    = path.join(path.dirname(DB_PATH), 'uploads', 'sessions');
const RECEIPTS_DIR   = path.join(path.dirname(DB_PATH), 'uploads', 'receipts');
const SIGNATURES_DIR = path.join(path.dirname(DB_PATH), 'uploads', 'signatures');
const PLANS_DIR      = path.join(path.dirname(DB_PATH), 'uploads', 'plans');

// DEFAULT_GENERAL, DEFAULT_SECTIONS, and loadDefaultWorkPackages
// are imported from ./tenant-defaults.js — edit that file to change new-user defaults.

// ─── Storage backend ─────────────────────────────────────────────────
const STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'local';
if (STORAGE_BACKEND === 'r2') {
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) { console.error(`[storage] STORAGE_BACKEND=r2 but missing: ${missing.join(', ')}`); process.exit(1); }
  console.log('[storage] Using Cloudflare R2 object storage');
} else {
  console.log('[storage] Using local disk storage');
}

let r2Client, R2_BUCKET, R2_PUBLIC_URL;
let S3Put, S3Delete, S3Get, S3List, S3DeleteObjects;
if (STORAGE_BACKEND === 'r2') {
  const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand,
          ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
  S3Put = PutObjectCommand; S3Delete = DeleteObjectCommand;
  S3Get = GetObjectCommand; S3List = ListObjectsV2Command; S3DeleteObjects = DeleteObjectsCommand;
  r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY },
  });
  R2_BUCKET = process.env.R2_BUCKET;
  R2_PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
}

function createStorage(namespace, { forceLocal = false } = {}) {
  const dirMap    = { receipts: RECEIPTS_DIR, signatures: SIGNATURES_DIR, plans: PLANS_DIR };
  const prefixMap = { receipts: '/receipts',  signatures: '/signatures',  plans: '/plans-raw' };
  const localDir    = dirMap[namespace]    || UPLOADS_DIR;
  const localPrefix = prefixMap[namespace] || '/files';
  if (STORAGE_BACKEND === 'r2' && !forceLocal) {
    // Derive the exact R2 key from a stored URL so reads/deletes work regardless
    // of whether the file was saved under the old flat path (sessions/file.jpg) or
    // the tenanted path (slug/sessions/file.jpg).
    const r2KeyFor = url =>
      url.startsWith(R2_PUBLIC_URL + '/')
        ? url.slice(R2_PUBLIC_URL.length + 1)
        : `${namespace}/${path.basename(url)}`;
    return {
      async save(filename, buffer, contentType = 'image/jpeg', tenantSlug = null) {
        const key = tenantSlug ? `${tenantSlug}/${namespace}/${filename}` : `${namespace}/${filename}`;
        await r2Client.send(new S3Put({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
        return `${R2_PUBLIC_URL}/${key}`;
      },
      async delete(url, deleteThumb = false) {
        const key    = r2KeyFor(url);
        const keyDir = key.substring(0, key.lastIndexOf('/') + 1);
        const keyFn  = path.basename(key);
        await r2Client.send(new S3Delete({ Bucket: R2_BUCKET, Key: key })).catch(() => {});
        if (deleteThumb) await r2Client.send(new S3Delete({ Bucket: R2_BUCKET, Key: keyDir + thumbFilename(keyFn) })).catch(() => {});
      },
      async readBuffer(url) {
        const res = await r2Client.send(new S3Get({ Bucket: R2_BUCKET, Key: r2KeyFor(url) }));
        const chunks = []; for await (const chunk of res.Body) chunks.push(chunk); return Buffer.concat(chunks);
      },
      async deleteAll(tenantSlug = null) {
        const prefix = tenantSlug ? `${tenantSlug}/${namespace}/` : `${namespace}/`;
        let token;
        do {
          const listed = await r2Client.send(new S3List({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token }));
          if (listed.Contents?.length) await r2Client.send(new S3DeleteObjects({ Bucket: R2_BUCKET, Delete: { Objects: listed.Contents.map(o => ({ Key: o.Key })) } }));
          token = listed.NextContinuationToken;
        } while (token);
      },
      async addToArchive(archive, url, archivePath) {
        try { archive.append(await this.readBuffer(url), { name: archivePath }); } catch {}
      },
    };
  }
  return {
    async save(filename, buffer, contentType, tenantSlug = null) {
      const dir = tenantSlug ? path.join(localDir, tenantSlug) : localDir;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), buffer);
      return tenantSlug ? `${localPrefix}/${tenantSlug}/${filename}` : `${localPrefix}/${filename}`;
    },
    async delete(url, deleteThumb = false) {
      const fp = this._resolve(url);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      if (deleteThumb) { const tp = path.join(path.dirname(fp), thumbFilename(path.basename(fp))); if (fs.existsSync(tp)) fs.unlinkSync(tp); }
    },
    async readBuffer(url) { return fs.readFileSync(this._resolve(url)); },
    async deleteAll(tenantSlug = null) {
      const dir = tenantSlug ? path.join(localDir, tenantSlug) : localDir;
      if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) try { fs.unlinkSync(path.join(dir, f)); } catch {}
    },
    async addToArchive(archive, url, archivePath) {
      const fp = this._resolve(url);
      if (fs.existsSync(fp)) archive.file(fp, { name: archivePath });
    },
    // Resolve a stored URL to a local file path (handles both /prefix/slug/file and /prefix/file)
    _resolve(url) {
      const parts = url.replace(localPrefix + '/', '').split('/');
      return path.join(localDir, ...parts.map(p => path.basename(p)));
    },
  };
}

const imageStore     = createStorage('sessions');
const receiptStore   = createStorage('receipts', { forceLocal: true });  // Always local — receipts contain sensitive data (addresses, financial info)
const signatureStore = createStorage('signatures', { forceLocal: true }); // Always local — personal signatures
// Plan PDFs are copyrighted (Van's etc.) — keep them local-only by default,
// off R2's public bucket, so a tenant's plans aren't trivially URL-guessable.
const plansStore     = createStorage('plans', { forceLocal: true });

// ─── Server-side log capture ─────────────────────────────────────────
const SERVER_LOG_BUFFER = [];
const SERVER_LOG_LIMIT  = 500;

function safeStringify(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || a.message;
  try { return JSON.stringify(a); } catch { return String(a); }
}
function appendServerLog(level, args) {
  const message = args.map(safeStringify).join(' ');
  SERVER_LOG_BUFFER.push({ ts: Date.now(), level, message });
  if (SERVER_LOG_BUFFER.length > SERVER_LOG_LIMIT) SERVER_LOG_BUFFER.shift();
}
const _origLog   = console.log.bind(console);
const _origInfo  = console.info.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log   = (...a) => { _origLog(...a);   appendServerLog('log',   a); };
console.info  = (...a) => { _origInfo(...a);  appendServerLog('info',  a); };
console.warn  = (...a) => { _origWarn(...a);  appendServerLog('warn',  a); };
console.error = (...a) => { _origError(...a); appendServerLog('error', a); };

// ─── Initialise DB ───────────────────────────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
fs.mkdirSync(PLANS_DIR, { recursive: true });

// ─── Schema + tenant bootstrap ───────────────────────────────────────
if (DB_BACKEND === 'postgres') {
  // PostgreSQL: create all tables, then find-or-create the first tenant.
  // The app starts listening only after async init completes.
  const { pool: _pgPool } = (() => {
    const { Pool } = require('pg');
    return { pool: new Pool({ connectionString: process.env.DATABASE_URL }) };
  })();

  initPostgresSchema(_pgPool)
    .then(() => ensureFirstTenant({ adminPassword: process.env.ADMIN_PASSWORD }))
    .then(async () => {
      try {
        const _migrateDb = getDefaultDb();
        const _tenantId = getDefaultTenantId();
        if (_tenantId) await migrateSignOffsToSessions(_migrateDb, _tenantId);
      } catch {}
      startServer();
    })
    .catch(err => {
      console.error('[init] PostgreSQL init failed:', err.message);
      process.exit(1);
    });
} else {
  // SQLite: synchronous setup
  runMigrationIfNeeded();
  initMasterSchema(getMasterSqlite());

  function applyTenantMigrations(sqlite) {
    initTenantSchema(sqlite, null);
    try {
      const cols = sqlite.prepare('PRAGMA table_info(expenses)').all().map(c => c.name);
      if (!cols.includes('link')) sqlite.exec(`ALTER TABLE expenses ADD COLUMN link TEXT DEFAULT ''`);
      if (cols.includes('amount_eur') && !cols.includes('amount_home')) {
        sqlite.exec('ALTER TABLE expenses ADD COLUMN amount_home REAL NOT NULL DEFAULT 0');
        sqlite.exec('UPDATE expenses SET amount_home = amount_eur');
        console.log('[migration] Copied amount_eur → amount_home');
      }
      // Inventory: add sub_kit and mfg_date columns
      const partCols = sqlite.prepare('PRAGMA table_info(inventory_parts)').all().map(c => c.name);
      if (partCols.length > 0 && !partCols.includes('sub_kit')) {
        sqlite.exec(`ALTER TABLE inventory_parts ADD COLUMN sub_kit TEXT DEFAULT ''`);
        console.log('[migration] Added sub_kit column to inventory_parts');
      }
      // Move mfg_date from inventory_parts → inventory_stock — a date describes
      // a received batch, not the part type. Presence of inventory_parts.mfg_date
      // marks an un-migrated DB; backfill stock before dropping the source.
      if (partCols.length > 0 && partCols.includes('mfg_date')) {
        const stockCols = sqlite.prepare('PRAGMA table_info(inventory_stock)').all().map(c => c.name);
        if (!stockCols.includes('mfg_date')) {
          sqlite.exec(`ALTER TABLE inventory_stock ADD COLUMN mfg_date TEXT DEFAULT ''`);
        }
        sqlite.exec(`UPDATE inventory_stock SET mfg_date = COALESCE(
          (SELECT p.mfg_date FROM inventory_parts p
           WHERE p.id = inventory_stock.part_id AND p.tenant_id = inventory_stock.tenant_id), '')`);
        sqlite.exec(`ALTER TABLE inventory_parts DROP COLUMN mfg_date`);
        console.log('[migration] Moved mfg_date from inventory_parts to inventory_stock');
      }
      if (partCols.length > 0 && !partCols.includes('bag')) {
        sqlite.exec(`ALTER TABLE inventory_parts ADD COLUMN bag TEXT DEFAULT ''`);
        console.log('[migration] Added bag column to inventory_parts');
      }
      // Blog posts: add plans_section column
      const blogCols = sqlite.prepare('PRAGMA table_info(blog_posts)').all().map(c => c.name);
      if (blogCols.length > 0 && !blogCols.includes('plans_section')) {
        sqlite.exec(`ALTER TABLE blog_posts ADD COLUMN plans_section TEXT DEFAULT ''`);
        console.log('[migration] Added plans_section column to blog_posts');
      }
      // Migrate inventory_stock: add source_kit
      const stockCols = sqlite.prepare("PRAGMA table_info(inventory_stock)").all().map(c => c.name);
      if (stockCols.length > 0 && !stockCols.includes('source_kit')) {
        sqlite.exec(`ALTER TABLE inventory_stock ADD COLUMN source_kit TEXT DEFAULT ''`);
        console.log('[migration] Added source_kit column to inventory_stock');
      }
      // active_timer: add plans_section so the work-package number persists
      // across page reloads / navigation for the same active timer.
      const atCols = sqlite.prepare('PRAGMA table_info(active_timer)').all().map(c => c.name);
      if (atCols.length > 0 && !atCols.includes('plans_section')) {
        sqlite.exec(`ALTER TABLE active_timer ADD COLUMN plans_section TEXT DEFAULT ''`);
        console.log('[migration] Added plans_section column to active_timer');
      }
    } catch (e) {
      console.warn('[init] Schema migration warning:', e.message);
    }
  }

  ensureFirstTenant({
    adminPassword: process.env.ADMIN_PASSWORD,
    initSchema(sqlite, tenantId) { applyTenantMigrations(sqlite); },
  })
    .then(async () => {
      // Ensure all existing tenant DBs have up-to-date schema (handles imported / older DBs)
      const tenants = await listTenants();
      for (const tenant of tenants) {
        try {
          const sqlite = openSqlite(tenantDbPath(tenant.id));
          applyTenantMigrations(sqlite);
        } catch (e) {
          console.warn(`[init] Schema update warning for tenant ${tenant.slug}:`, e.message);
        }
      }
      // Migrate old sign_offs to inspection_sessions (idempotent)
      try {
        const _migrateDb = getDefaultDb();
        const _tenantId = getDefaultTenantId();
        if (_tenantId) await migrateSignOffsToSessions(_migrateDb, _tenantId);
      } catch {}
      startServer();
    })
    .catch(e => {
      console.warn('[init] Tenant schema init warning:', e.message);
      startServer();
    });
}

// ─── Express setup ───────────────────────────────────────────────────
const compression = require('compression');
const app = express();

app.use(compression());

// ─── Security headers ───────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
  // HSTS — only when the request itself arrived over HTTPS, so HTTP-only
  // localhost development isn't poisoned with a year-long HTTPS lock.
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  if (proto === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ─── CORS ───────────────────────────────────────────────────────────
const CORS_ORIGIN = process.env.CORS_ORIGIN; // e.g. "https://benchlog.build" or comma-separated list
app.use(cors({
  origin: CORS_ORIGIN
    ? (origin, cb) => {
        const allowed = CORS_ORIGIN.split(',').map(s => s.trim());
        // Allow requests with no origin (same-origin, curl, mobile apps)
        if (!origin || allowed.some(a => {
          if (origin === a) return true;
          if (a.startsWith('*.')) {
            try {
              const hostname = new URL(origin).hostname;
              const suffix = a.slice(1); // e.g. ".example.com"
              return hostname.endsWith(suffix) && hostname.length > suffix.length;
            } catch { return false; }
          }
          return false;
        })) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      }
    : true, // Self-hosted: reflect request origin (equivalent to allow the host itself)
  credentials: false,
}));

// Serve static assets BEFORE any middleware that hits the database.
// This ensures JS/CSS/font/image requests are never blocked by DB queries.
// Hashed assets (assets/) are safe to cache long-term; index.html must always be fresh
// so deploys take effect immediately instead of serving stale chunk references.
app.use('/assets', express.static(path.join(DIST_PATH, 'assets'), { maxAge: '7d', immutable: true }));

// IndexNow proof-of-ownership file. Each tenant has a 32-char hex key
// generated lazily on first POST/PUT/DELETE /api/blog; the corresponding
// /{key}.txt file must be served at the same host as the URLs being
// submitted. We match strictly to avoid colliding with any user-defined
// content path: 32 hex chars + ".txt", nothing else.
app.get(/^\/([a-f0-9]{32})\.txt$/, async (req, res) => {
  try {
    const key = req.params[0];
    const tenant = await getTenantByIndexNowKey(key);
    if (!tenant) return res.status(404).type('text/plain').send('Not found');
    res.type('text/plain').send(key);
  } catch (err) {
    res.status(500).type('text/plain').send('Error');
  }
});

/**
 * isParentHost(req) — true when the request targets the bare apex domain
 * or its www alias (e.g. `benchlog.build` or `www.benchlog.build`), as
 * opposed to a tenant subdomain like `pbihn.benchlog.build`. Used by
 * /robots.txt, /sitemap.xml, /llms.txt and /blogs to switch to the
 * cross-tenant ("parent") view: a sitemap-index that points at every
 * public tenant, a /blogs directory page, and an llms.txt that lists
 * those same blogs. SINGLE_TENANT deployments have no parent-host
 * concept — the one tenant owns whatever domain it's reached on.
 *
 * Production deployment requires Caddy to reverse-proxy these paths from
 * benchlog.build → the main-tool container, since the apex is normally
 * served by the account-frontend. See deploy notes / Caddyfile snippet.
 */
function isParentHost(req) {
  if (!MULTI_TENANT) return false;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  if (isBareIpHost(host)) return false;
  const parts = host.split('.');
  if (parts.length < 3) return true;                            // benchlog.build
  if (parts.length === 3 && parts[0] === 'www') return true;    // www.benchlog.build
  return false;
}

// Tenant-aware robots.txt — must run before express.static so the dynamic
// version wins over any baked-in public/robots.txt. Resolves tenant inline
// because this sits before the global subdomain resolver.
app.get('/robots.txt', async (req, res) => {
  res.type('text/plain');
  try {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];

    // Parent host (benchlog.build / www.benchlog.build): allow everything that
    // matters for discovery (the /blogs directory + each tenant's sitemap via
    // the sitemap-index) and disallow the obvious noise.
    if (isParentHost(req)) {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      return res.send([
        'User-agent: *',
        'Allow: /',
        'Allow: /blogs',
        '',
        `Sitemap: ${proto}://${host}/sitemap.xml`,
        '',
      ].join('\n'));
    }

    let tenant = null;
    if (MULTI_TENANT) {
      const parts = host.split('.');
      if (parts.length >= 3 && !isBareIpHost(host) && !['www', 'account', 'demo'].includes(parts[0])) {
        try { tenant = await getTenantBySlug(parts[0]); } catch {}
      }
    } else {
      try { tenant = await getFirstTenant(); } catch {}
    }
    if (tenant && tenant.public_blog === 0) {
      return res.send('User-agent: *\nDisallow: /\n');
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const sitemapUrl = `${proto}://${host}/sitemap.xml`;
    return res.send([
      'User-agent: *',
      'Allow: /blog',
      'Allow: /blog/',
      // /api/* is intentionally NOT blocked: Google must be able to fetch the
      // blog API endpoints at render time to see post content (this is an SPA).
      // JSON responses are not indexed as HTML pages, and auth-protected
      // endpoints return 401 to crawlers.
      'Disallow: /timer',
      'Disallow: /settings',
      'Disallow: /admin',
      'Disallow: /account',
      'Disallow: /dashboard',
      'Disallow: /sessions',
      'Disallow: /timeline',
      'Disallow: /inventory',
      'Disallow: /inspections',
      'Disallow: /expenses',
      'Disallow: /flowchart',
      '',
      `Sitemap: ${sitemapUrl}`,
      '',
    ].join('\n'));
  } catch {
    // Fail closed: if tenant lookup throws, default to disallowing everything.
    res.send('User-agent: *\nDisallow: /\n');
  }
});

// Tenant-aware /llms.txt — the well-known location LLM crawlers (ChatGPT,
// Perplexity, Claude, Google AI Overviews) look at for a markdown manifest
// of the site's indexable content. Mirrors the robots.txt tenant resolution.
app.get('/llms.txt', async (req, res) => {
  res.type('text/plain');
  try {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';

    // Parent host: enumerate public tenant blogs so AI agents (Perplexity,
    // ChatGPT search, Claude, AI Overviews) can crawl the community without
    // walking the parent sitemap-index first. No /blogs directory page exists
    // on the parent — discovery is sitemap-index + this manifest only.
    if (isParentHost(req)) {
      try {
        const tenants = await listPublicTenants();
        const baseDomain = host.split('.').slice(-2).join('.');  // e.g. benchlog.build
        const lines = [
          '# BenchLog',
          '',
          '> Community of build journals from experimental aircraft homebuilders. Each builder runs their own subdomain blog at {slug}.' + baseDomain + '/blog.',
          '',
          '## Individual build blogs',
          '',
        ];
        for (const t of tenants) {
          const label = t.projectName && t.projectName !== 'My Build' ? `${t.projectName} (${t.aircraftType})` : `${t.slug} (${t.aircraftType})`;
          lines.push(`- [${label}](https://${t.slug}.${baseDomain}/blog): ${t.postCount} post${t.postCount === 1 ? '' : 's'}`);
        }
        lines.push('', `## Sitemap`, '', `- [Sitemap index](${proto}://${host}/sitemap.xml): machine-readable URL list across all blogs`, '');
        return res.send(lines.join('\n'));
      } catch (err) {
        console.error('parent llms.txt error:', err.message);
        return res.status(500).send('# Error\n');
      }
    }

    let tenant = null;
    if (MULTI_TENANT) {
      const parts = host.split('.');
      if (parts.length >= 3 && !isBareIpHost(host) && !['www', 'account', 'demo'].includes(parts[0])) {
        try { tenant = await getTenantBySlug(parts[0]); } catch {}
      }
    } else {
      try { tenant = await getFirstTenant(); } catch {}
    }
    if (tenant && tenant.public_blog === 0) {
      return res.status(404).send('# Not available\n');
    }
    const base  = `${proto}://${host}`;
    const db    = tenant ? getTenantDb(tenant.id) : getDefaultDb();
    const general = await getSetting(db, 'general', DEFAULT_GENERAL);
    const projectName = general.projectName || 'Build Tracker';
    return res.send([
      `# ${projectName}`,
      '',
      `> Build journal for the ${projectName} aircraft homebuilt project.`,
      '',
      '## Blog',
      '',
      `- [${projectName} blog](${base}/blog): index of build journal posts and work sessions`,
      `- [Sitemap](${base}/sitemap.xml): complete list of indexable URLs`,
      '',
      '## Optional',
      '',
      `- [robots.txt](${base}/robots.txt)`,
      '',
    ].join('\n'));
  } catch {
    res.status(500).type('text/plain').send('# Error\n');
  }
});

// Per-tenant sitemap.xml — auto-generated from the tenant's public blog posts
// and work sessions. Private tenants (public_blog=0) return 404.
//
// Parent host (benchlog.build / www.benchlog.build) serves a sitemap-INDEX
// instead — one <sitemap> entry per public tenant pointing at that tenant's
// own /sitemap.xml. Requires a Caddy reverse-proxy rule because the parent
// apex is normally served by the account-frontend container. See deploy
// notes for the Caddyfile snippet.
app.get('/sitemap.xml', async (req, res) => {
  try {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];

    // Parent host — emit a sitemap-INDEX listing every public tenant's
    // per-tenant sitemap. Lets one GSC submission ("benchlog.build/sitemap.xml"
    // under a Domain property) cover every current and future tenant blog.
    if (isParentHost(req)) {
      try {
        const tenants    = await listPublicTenants();
        const baseDomain = host.split('.').slice(-2).join('.');
        const fmt        = (d) => (d ? String(d).slice(0, 10) : '');
        const entries    = tenants.map(t => {
          const loc     = `https://${t.slug}.${baseDomain}/sitemap.xml`;
          const lastmod = fmt(t.latestPostDate);
          return '  <sitemap>\n' +
                 `    <loc>${escapeHtml(loc)}</loc>\n` +
                 (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
                 '  </sitemap>';
        });
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          entries.join('\n') +
          '\n</sitemapindex>\n';
        res.set('Cache-Control', 'public, max-age=300');
        return res.type('application/xml').send(xml);
      } catch (err) {
        console.error('parent sitemap-index error:', err.message);
        return res.status(500).type('text/plain').send('Failed to generate sitemap index.');
      }
    }

    let tenant = null;
    if (MULTI_TENANT) {
      const parts = host.split('.');
      if (parts.length >= 3 && !isBareIpHost(host) && !['www', 'account', 'demo'].includes(parts[0])) {
        try { tenant = await getTenantBySlug(parts[0]); } catch {}
      }
    } else {
      try { tenant = await getFirstTenant(); } catch {}
    }
    if (tenant && tenant.public_blog === 0) {
      return res.status(404).type('text/plain').send('Sitemap not available for private blogs.');
    }

    const tenantId = tenant ? tenant.id : getDefaultTenantId();
    const db       = tenant ? getTenantDb(tenant.id) : getDefaultDb();
    const base     = baseUrl(req);

    // Blog posts — always include (authored content)
    const posts = await db.all(
      'SELECT id, published_at, updated_at FROM blog_posts WHERE tenant_id = ? ORDER BY published_at DESC',
      [tenantId]
    );
    // Work sessions — include only those with notes or images (skip thin content)
    const sessions = await db.all(
      `SELECT id, start_time, end_time FROM sessions WHERE tenant_id = ?
       AND ((notes IS NOT NULL AND notes != '') OR (image_urls IS NOT NULL AND image_urls != '[]'))
       ORDER BY start_time DESC`,
      [tenantId]
    );

    const fmt = (d) => (d ? String(d).slice(0, 10) : '');
    const entries = [];
    // Blog index — lastmod = most recent post's update time
    const latestMod = posts[0] ? (posts[0].updated_at || posts[0].published_at) : null;
    entries.push([`${base}/blog`, fmt(latestMod), 'weekly', '1.0']);
    for (const p of posts) {
      entries.push([`${base}/blog/${p.id}`, fmt(p.updated_at || p.published_at), 'monthly', '0.8']);
    }
    for (const s of sessions) {
      entries.push([`${base}/blog/session-${s.id}`, fmt(s.end_time || s.start_time), 'yearly', '0.6']);
    }

    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      entries.map(([loc, lastmod, cf, pr]) =>
        '  <url>\n' +
        `    <loc>${escapeHtml(loc)}</loc>\n` +
        (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
        `    <changefreq>${cf}</changefreq>\n` +
        `    <priority>${pr}</priority>\n` +
        '  </url>'
      ).join('\n') +
      '\n</urlset>\n';

    res.type('application/xml').send(xml);
  } catch (err) {
    console.error('sitemap.xml error:', err.message);
    res.status(500).type('text/plain').send('Failed to generate sitemap.');
  }
});

// Tenant root — must run BEFORE express.static, otherwise the static
// middleware serves the bare SPA shell (no og:* / canonical / JSON-LD) and
// the page is invisible to crawlers that happen to land on `/`. The SPA
// router still drives the in-browser experience; we only enrich the head.
app.get('/', async (req, res, next) => {
  if (!fs.existsSync(distIndexPath)) return next();
  try {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    let tenant = null;
    if (MULTI_TENANT) {
      const parts = host.split('.');
      if (parts.length >= 3 && !isBareIpHost(host) && !['www', 'account', 'demo'].includes(parts[0])) {
        try { tenant = await getTenantBySlug(parts[0]); } catch {}
      }
    } else {
      try { tenant = await getFirstTenant(); } catch {}
    }
    // No tenant resolved (apex, www, demo, etc.) — let express.static serve
    // the unmodified shell. Tenant subdomains get the enriched head.
    if (!tenant) return next();
    const db          = getTenantDb(tenant.id);
    const isPublic    = tenant.public_blog !== 0;
    const general     = await getSetting(db, 'general', DEFAULT_GENERAL);
    const projectName = general.projectName || 'Build Tracker';
    const base        = baseUrl(req);
    const html        = fs.readFileSync(distIndexPath, 'utf8');
    res.type('html').send(injectOgTags(html, {
      title:       `${projectName} — Build Journal`,
      description: `Follow along on this ${projectName} homebuilt aircraft build.`,
      imageUrl:    null,
      pageUrl:     `${base}/`,
      // Consolidate signal onto /blog — the actual indexable destination.
      canonical:   isPublic ? `${base}/blog` : undefined,
      noindex:     !isPublic,
    }));
  } catch {
    next();
  }
});

app.use(express.static(DIST_PATH, { maxAge: 0, etag: true, lastModified: true }));
app.use(express.json({ limit: '10mb' }));

// Resolve tenant from subdomain for public endpoints (multi-tenant mode only).
// Single-tenant deployments (SQLite, or Postgres with SINGLE_TENANT=true) skip
// this entirely and keep the default tenant set above.
app.use(async (req, res, next) => {
  try { req.db = getDefaultDb(); req.tenantId = getDefaultTenantId(); } catch {}
  if (MULTI_TENANT) {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    const parts = host.split('.');
    if (parts.length >= 3 && !isBareIpHost(host)) {
      const slug = parts[0];
      if (!['www', 'account', 'demo'].includes(slug)) {
        try {
          const tenant = await getTenantBySlug(slug);
          if (tenant) { req.tenantId = tenant.id; req.db = getTenantDb(tenant.id); req.tenant = tenant; }
          else { req.tenantNotFound = true; }
        } catch {}
      }
    }
  }
  next();
});

if (DEMO_MODE) {
  // Read-only by default. Two carve-outs:
  //   1. Auth endpoints must always pass so the admin can log in / check status.
  //   2. A request that presents a verifiably-admin Bearer token gets through
  //      — anonymous visitors and forged tokens still 403 here.
  app.use('/api', (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
    if (['/auth/login', '/auth/setup', '/auth/status'].includes(req.path)) return next();
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const payload = verifyToken(auth.slice(7));
      if (payload && payload.role === 'admin') return next();
    }
    return res.status(403).json({ error: 'Demo mode — read only' });
  });
}

// ─── Maintenance-mode gate (blocks non-admin mutations) ─────────────
// Applied globally so ALL POST/PUT/DELETE/PATCH endpoints are covered.
// Admin users (verified via JWT peek) are exempted.
if (!DEMO_MODE) {
  app.use('/api', async (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
    // Allow login, setup, and auth-status even during maintenance
    // Note: req.path is relative to the mount point (/api), so it's /auth/login not /api/auth/login
    if (['/auth/login', '/auth/setup', '/auth/status'].includes(req.path)) return next();
    try {
      const db = req.db || getDefaultDb();
      const general = await getSetting(db, 'general', DEFAULT_GENERAL);
      if (!general.maintenanceMode) return next();
      // Peek at JWT to check admin role
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        const payload = verifyToken(auth.slice(7));
        if (payload && payload.role === 'admin') return next();
      }
      return res.status(503).json({ error: 'Server is in maintenance mode. Please try again later.' });
    } catch { return res.status(503).json({ error: 'Service unavailable' }); }
  });
}

// ─── Feature-flag gate ───────────────────────────────────────────────
// Mirrors the frontend's FeatureRoute on the API. When the tenant has a
// feature toggled off in general settings, every relevant route returns 403
// unless the caller presents a verified admin token. Demo visitors (whose
// faked role='admin' is NOT backed by a token) hit the same 403, closing
// the gap where the UI hid a page but the API was still callable.
function requireFeature(key) {
  return async (req, res, next) => {
    // Real admin bypass — requires a verified Bearer token, not just the
    // demo-mode faked role. peekAuth returns null for anonymous demo
    // visitors and for missing/forged tokens.
    const payload = peekAuth(req);
    if (payload && payload.role === 'admin') return next();
    try {
      const tenantId = payload?.tenantId || req.tenantId || getDefaultTenantId();
      const db = (tenantId ? getTenantDb(tenantId) : null) || getDefaultDb();
      const settings = await getSetting(db, 'general', DEFAULT_GENERAL);
      if (settings?.featureFlags?.[key] === false) {
        return res.status(403).json({ error: `This feature is disabled.` });
      }
    } catch { /* fail-open on lookup error so a settings glitch doesn't lock everything down */ }
    next();
  };
}

// Register the gate as a path-prefix middleware for every feature-keyed
// API namespace. Sub-paths inherit automatically (so /api/wiring/library
// is covered by the '/api/wiring' prefix). Per-route requireAuth still
// runs afterwards and enforces authentication on writes.
app.use('/api/wiring',       requireFeature('wiring'));
app.use('/api/inventory',    requireFeature('inventory'));
app.use('/api/expenses',     requireFeature('expenses'));
app.use('/api/signoffs',     requireFeature('inspections'));
app.use('/api/inspection-sessions', requireFeature('inspections'));
app.use('/api/blog',         requireFeature('blog'));
app.use('/api/sessions',     requireFeature('tracker'));
app.use('/api/timer',        requireFeature('tracker'));
app.use('/api/plans',        requireFeature('plans'));

// Image proxy — lets the browser fetch R2 images server-side (avoids CORS restrictions in PDF export)
// No auth required: only proxies URLs from the configured storage backend (already public assets)
app.get('/api/image-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') return res.status(400).send('Missing url');
  // Validate URL to prevent SSRF — only allow URLs from our own storage backend
  let allowed = false;
  if (R2_PUBLIC_URL) {
    try {
      const parsed = new URL(url);
      const expectedOrigin = new URL(R2_PUBLIC_URL).origin;
      allowed = parsed.origin === expectedOrigin;
    } catch { /* invalid URL */ }
  } else {
    allowed = url.startsWith('/files/');
  }
  if (!allowed) return res.status(403).send('Forbidden');
  try {
    const upstream = await fetch(url, { redirect: 'error' });
    if (!upstream.ok) return res.status(upstream.status).send('Upstream error');
    const buf = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  } catch (err) {
    console.error('[image-proxy]', err.message);
    res.status(502).send('Proxy error');
  }
});

// ─── Authenticated file serving ─────────────────────────────────────
// Checks whether a filename is referenced by a given tenant across all tables.
// Returns true if the file belongs to that tenant (or is in a public blog post).
async function isFileOwnedByTenant(db, tenantId, filename, { checkPublicBlog = false } = {}) {
  const like = `%${filename}%`;
  // Check sessions
  const session = await db.get(
    'SELECT 1 FROM sessions WHERE tenant_id = ? AND image_urls LIKE ? LIMIT 1', [tenantId, like]);
  if (session) return true;
  // Check blog_posts (image_urls or embedded in content)
  const blog = await db.get(
    'SELECT 1 FROM blog_posts WHERE tenant_id = ? AND (image_urls LIKE ? OR content LIKE ?) LIMIT 1',
    [tenantId, like, like]);
  if (blog) return true;
  // Check expenses (receipt_urls)
  const expense = await db.get(
    'SELECT 1 FROM expenses WHERE tenant_id = ? AND receipt_urls LIKE ? LIMIT 1', [tenantId, like]);
  if (expense) return true;
  // Check active_timer
  const timer = await db.get(
    'SELECT 1 FROM active_timer WHERE tenant_id = ? AND image_urls LIKE ? LIMIT 1', [tenantId, like]);
  if (timer) return true;
  // Check pending_uploads (recently uploaded, not yet attached)
  const pending = await db.get(
    'SELECT 1 FROM pending_uploads WHERE tenant_id = ? AND url LIKE ? LIMIT 1', [tenantId, like]);
  if (pending) return true;
  return false;
}

// Returns the authenticated user payload from the Authorization header, or null.
function peekAuth(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return verifyToken(auth.slice(7));
  // Fallback: check query param (for <img> tags that can't send Authorization headers)
  if (req.query?.token) return verifyToken(req.query.token);
  return null;
}

// Local file serving (R2 URLs are served directly by Cloudflare)
// ── /receipts/* — expense attachments (ALWAYS local-disk + auth) ──
// Receipts and signatures are stored on the server's local disk
// regardless of STORAGE_BACKEND (see `forceLocal: true` on the storage
// stores) — they contain sensitive personal data that we don't push to
// object storage. So their serving routes must be mounted unconditionally;
// otherwise an R2/S3 deployment would have no route here and the request
// falls through to the SPA, which renders a 404.
app.get('/receipts/:slug/:filename', receiptsHandler);
app.get('/receipts/:filename', receiptsHandler);
async function receiptsHandler(req, res) {
  const filename = path.basename(req.params.filename);
  const slug = req.params.slug ? path.basename(req.params.slug) : null;
  const filePath = slug
    ? path.join(RECEIPTS_DIR, slug, filename)
    : path.join(RECEIPTS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  if (!DEMO_MODE) {
    const payload = peekAuth(req);
    if (!payload) return res.status(401).send('Unauthorized');

    // Multi-tenant: verify receipt belongs to the requesting tenant
    if (DB_BACKEND === 'postgres') {
      const payloadTenantId = payload.tenantId || (req.tenantId || getDefaultTenantId());
      const payloadDb = getTenantDb(payloadTenantId);
      const like = `%${filename}%`;
      const owned = await payloadDb.get(
        'SELECT 1 FROM expenses WHERE tenant_id = ? AND receipt_urls LIKE ? LIMIT 1',
        [payloadTenantId, like]);
      if (!owned) {
        // Also check pending_uploads (file just uploaded, not yet saved to expense)
        const pending = await payloadDb.get(
          'SELECT 1 FROM pending_uploads WHERE tenant_id = ? AND url LIKE ? LIMIT 1',
          [payloadTenantId, like]);
        if (!pending) return res.status(403).send('Forbidden');
      }
    }
  }
  res.sendFile(filePath);
}

// ── /signatures/* — sign-off signatures (ALWAYS local-disk + auth) ──
app.get('/signatures/:slug/:filename', signaturesHandler);
app.get('/signatures/:filename', signaturesHandler);
async function signaturesHandler(req, res) {
  const filename = path.basename(req.params.filename);
  const slug = req.params.slug ? path.basename(req.params.slug) : null;
  const filePath = slug
    ? path.join(SIGNATURES_DIR, slug, filename)
    : path.join(SIGNATURES_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  if (!DEMO_MODE) {
    const payload = peekAuth(req);
    if (!payload) return res.status(401).send('Unauthorized');

    if (DB_BACKEND === 'postgres') {
      const payloadTenantId = payload.tenantId || (req.tenantId || getDefaultTenantId());
      const payloadDb = getTenantDb(payloadTenantId);
      const like = `%${filename}%`;
      const owned = await payloadDb.get(
        'SELECT 1 FROM sign_offs WHERE tenant_id = ? AND signature_png LIKE ? LIMIT 1',
        [payloadTenantId, like]);
      if (!owned) return res.status(403).send('Forbidden');
    }
  }
  res.sendFile(filePath);
}

// /files/:filename serves session & blog images, which DO get pushed to
// object storage when STORAGE_BACKEND === 'r2'. So this route is only
// mounted when the backend is local — on R2 deployments those URLs are
// served by Cloudflare directly.
if (STORAGE_BACKEND === 'local') {

  // ── /files/:filename — session & blog images ──
  app.get('/files/:filename', async (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

    const db = req.db || getDefaultDb();
    const tenantId = req.tenantId || getDefaultTenantId();

    // Public blog: allow unauthenticated access to images referenced in blog posts
    const tenant = req.tenant || await getFirstTenant();
    if (tenant && tenant.public_blog !== 0) {
      const like = `%${filename}%`;
      const blogRef = await db.get(
        'SELECT 1 FROM blog_posts WHERE tenant_id = ? AND (image_urls LIKE ? OR content LIKE ?) LIMIT 1',
        [tenantId, like, like]);
      if (blogRef) return res.sendFile(filePath);
    }

    // Otherwise require authentication
    if (!DEMO_MODE) {
      const payload = peekAuth(req);
      if (!payload) return res.status(401).send('Unauthorized');

      // Multi-tenant: verify file belongs to the requesting tenant
      if (DB_BACKEND === 'postgres') {
        const payloadTenantId = payload.tenantId || tenantId;
        const payloadDb = getTenantDb(payloadTenantId);
        if (!(await isFileOwnedByTenant(payloadDb, payloadTenantId, filename))) {
          return res.status(403).send('Forbidden');
        }
      }
    }
    res.sendFile(filePath);
  });
}

// ─── Multer (memory storage — works for both local and R2) ───────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only image files are allowed'));
  },
});
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only images and PDFs are allowed'));
  },
});

const backupUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tmp = path.join(DATA_DIR, 'tmp_import');
      fs.mkdirSync(tmp, { recursive: true });
      cb(null, tmp);
    },
    filename: (_req, _file, cb) => cb(null, `import-${Date.now()}.zip`),
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
});

function thumbFilename(filename) {
  return filename.replace(/\.jpg$/, '_thumb.jpg');
}

// ─── Settings helpers (async, db-aware) ──────────────────────────────
async function getSetting(db, key, defaultValue = null) {
  const row = await db.get(
    'SELECT value FROM settings WHERE key = ? AND tenant_id = ?',
    [key, db.tenantId]
  );
  return row ? JSON.parse(row.value) : defaultValue;
}

async function setSetting(db, key, value) {
  await db.run(
    'INSERT OR REPLACE INTO settings (key, tenant_id, value) VALUES (?, ?, ?)',
    [key, db.tenantId, JSON.stringify(value)]
  );
}

// ─── Seed default settings for new tenants ──────────────────────────
// flowchart_packages is intentionally NOT seeded here — the onboarding
// wizard captures the aircraft type and writes the matching template
// atomically when the user finishes setup. Seeding RV-10 packages by
// default would lock in an assumption the user hasn't confirmed yet
// (and is why people have ended up with RV-10 trees on -7 builds).
async function seedTenantDefaults(tenantId) {
  try {
    const db = getTenantDb(tenantId);
    await setSetting(db, 'general', { ...DEFAULT_GENERAL });
    await setSetting(db, 'sections', [...DEFAULT_SECTIONS]);
    await setSetting(db, 'onboarding', { ...DEFAULT_ONBOARDING });
    console.log(`[init] Seeded default settings for tenant ${tenantId}`);
  } catch (err) {
    console.warn(`[init] Failed to seed defaults for tenant ${tenantId}:`, err.message);
  }
}

// ─── MQTT setup ──────────────────────────────────────────────────────
// Per-tenant map: tenantId → { client, pendingPublish }
const mqttClients = new Map();

async function getMqttSettings(db) {
  return getSetting(db, 'mqtt', {
    enabled: false,
    brokerUrl: 'mqtt://localhost:1883',
    username: '',
    password: '',
    topicPrefix: 'mybuild/stats',
    haDiscovery: false,
    haDiscoveryPrefix: 'homeassistant',
  });
}

async function connectMqtt(db) {
  const tenantId = db.tenantId;
  const existing = mqttClients.get(tenantId);
  if (existing) {
    try { existing.client.end(true); } catch {}
    mqttClients.delete(tenantId);
  }

  const settings = await getMqttSettings(db);
  if (!settings.enabled || !settings.brokerUrl) {
    return;
  }

  // Validate MQTT broker URL scheme
  if (!/^(mqtts?|wss?):\/\//i.test(settings.brokerUrl)) {
    console.error(`MQTT [${tenantId}]: invalid broker URL scheme — must be mqtt(s):// or ws(s)://`);
    return;
  }

  const opts = { reconnectPeriod: 5000, connectTimeout: 10000 };
  if (settings.username) opts.username = settings.username;
  if (settings.password) opts.password = settings.password;

  console.log(`MQTT [${tenantId}]: connecting to ${settings.brokerUrl}...`);
  const client = mqtt.connect(settings.brokerUrl, opts);
  const entry = { client, pendingPublish: false };
  mqttClients.set(tenantId, entry);

  client.on('connect', () => {
    console.log(`MQTT [${tenantId}]: connected to ${settings.brokerUrl}`);
    if (entry.pendingPublish) entry.pendingPublish = false;
    publishMqttStats(db);
  });
  client.on('error',     err => console.error(`MQTT [${tenantId}] error:`, err.message));
  client.on('offline',   ()  => console.log(`MQTT [${tenantId}]: offline`));
  client.on('reconnect', ()  => console.log(`MQTT [${tenantId}]: reconnecting...`));
  client.on('close',     ()  => console.log(`MQTT [${tenantId}]: connection closed`));
}

async function publishMqttStats(db) {
  try {
    if (!db) db = getDefaultDb();
    const tenantId = db.tenantId;
    const settings = await getMqttSettings(db);
    if (!settings.enabled) { console.log(`MQTT [${tenantId}]: publish skipped — disabled`); return; }

    const entry = mqttClients.get(tenantId);
    if (!entry || !entry.client.connected) {
      console.warn(`MQTT [${tenantId}]: not connected, skipping publish`);
      if (entry) entry.pendingPublish = true;
      return;
    }
    const client = entry.client;

    const prefix = settings.topicPrefix || 'mybuild/stats';
    const rows = await db.all(
      'SELECT section, duration_minutes FROM sessions WHERE tenant_id = ?',
      [tenantId]
    );
    const sectionConfigs = await getSetting(db, 'sections', DEFAULT_SECTIONS);
    const excludedSections = new Set(
      sectionConfigs.filter(s => s.countTowardsBuildHours === false).map(s => s.id)
    );

    const sectionTotals = {};
    let totalMinutes = 0;
    for (const row of rows) {
      if (!sectionTotals[row.section]) sectionTotals[row.section] = 0;
      sectionTotals[row.section] += row.duration_minutes;
      if (!excludedSections.has(row.section)) totalMinutes += row.duration_minutes;
    }

    const totalHours      = (totalMinutes / 60).toFixed(1);
    const sessionCount    = rows.length;
    const generalSettings = await getSetting(db, 'general', DEFAULT_GENERAL);
    const targetHours     = generalSettings.targetHours || 2500;
    const buildProgress   = Math.min(((totalMinutes / 60) / targetHours) * 100, 100).toFixed(1);

    const pub = (topic, value) =>
      client.publish(topic, value, { retain: true, qos: 1 }, err => {
        if (err) console.error(`MQTT publish error (${topic}):`, err.message);
      });

    pub(`${prefix}/total_hours`,    totalHours);
    pub(`${prefix}/total_sessions`, String(sessionCount));
    pub(`${prefix}/build_progress`, buildProgress);

    const lastRow = await db.get(
      'SELECT image_urls FROM sessions WHERE tenant_id = ? ORDER BY start_time DESC LIMIT 1',
      [tenantId]
    );
    if (lastRow) {
      pub(`${prefix}/last_session_images`, JSON.stringify(JSON.parse(lastRow.image_urls || '[]')));
    }

    for (const sec of sectionConfigs) {
      pub(`${prefix}/${sec.id}`, ((sectionTotals[sec.id] || 0) / 60).toFixed(1));
    }

    if (settings.haDiscovery) publishHaDiscovery(client, settings, sectionConfigs, prefix, generalSettings);

    console.log(`MQTT [${tenantId}]: published stats (total: ${totalHours}h, ${sessionCount} sessions)`);
  } catch (err) {
    console.error('MQTT publish error:', err.message || err);
  }
}

function publishHaDiscovery(client, settings, sectionConfigs, prefix, generalSettings) {
  if (!client || !client.connected) return;
  const discoveryPrefix = settings.haDiscoveryPrefix || 'homeassistant';
  const deviceId   = (settings.topicPrefix || 'mybuild_stats').replace(/[^a-z0-9]/gi, '_');
  const deviceName = (generalSettings && generalSettings.projectName) || DEFAULT_GENERAL.projectName;
  const device = { identifiers: [deviceId], name: deviceName, manufacturer: 'Benchlog', model: 'MQTT Stats' };

  function publishSensor(objectId, name, stateTopic, unit, icon, stateClass) {
    const uniqueId = `${deviceId}_${objectId}`;
    client.publish(
      `${discoveryPrefix}/sensor/${uniqueId}/config`,
      JSON.stringify({
        name, state_topic: stateTopic, unique_id: uniqueId, object_id: uniqueId,
        device, icon, value_template: '{{ value }}',
        ...(unit ? { unit_of_measurement: unit } : {}),
        ...(stateClass ? { state_class: stateClass } : {}),
      }),
      { retain: true, qos: 1 },
      err => { if (err) console.error(`MQTT HA discovery error (${objectId}):`, err.message); }
    );
  }

  publishSensor('total_hours',    `${deviceName} Total Hours`,    `${prefix}/total_hours`,    'h',        'mdi:clock-outline',  'measurement');
  publishSensor('total_sessions', `${deviceName} Total Sessions`, `${prefix}/total_sessions`, 'sessions', 'mdi:counter',        'measurement');
  publishSensor('build_progress', `${deviceName} Build Progress`, `${prefix}/build_progress`, '%',        'mdi:progress-check', 'measurement');

  const uid = `${deviceId}_last_session_images`;
  client.publish(
    `${discoveryPrefix}/sensor/${uid}/config`,
    JSON.stringify({
      name: `${deviceName} Last Session Images`,
      state_topic: `${prefix}/last_session_images`,
      unique_id: uid, object_id: uid, device,
      icon: 'mdi:image-multiple', value_template: '{{ value }}',
    }),
    { retain: true, qos: 1 }
  );

  for (const sec of sectionConfigs) {
    publishSensor(sec.id, `${deviceName} ${sec.label || sec.id}`, `${prefix}/${sec.id}`, 'h', 'mdi:tools', 'measurement');
  }
  console.log(`MQTT: published HA discovery configs to ${discoveryPrefix}/sensor/...`);
}

// ─── Job registry ────────────────────────────────────────────────────
const jobRegistry = {};

function registerJob(key, label, description, intervalMs) {
  jobRegistry[key] = { key, label, description, intervalMs, lastRun: null, lastStatus: null, lastResult: null, lastError: null, nextRun: null };
}

function recordJobStart(key) {
  if (jobRegistry[key]) jobRegistry[key].lastRun = new Date().toISOString();
}

function recordJobSuccess(key, result) {
  if (!jobRegistry[key]) return;
  jobRegistry[key].lastStatus = 'ok';
  jobRegistry[key].lastResult = result;
  jobRegistry[key].lastError  = null;
  jobRegistry[key].nextRun    = new Date(Date.now() + jobRegistry[key].intervalMs).toISOString();
}

function recordJobError(key, err) {
  if (!jobRegistry[key]) return;
  jobRegistry[key].lastStatus = 'error';
  jobRegistry[key].lastError  = err.message || String(err);
  jobRegistry[key].nextRun    = new Date(Date.now() + jobRegistry[key].intervalMs).toISOString();
}

// ─── Cleanup pending uploads ─────────────────────────────────────────
// Runs hourly. Removes pending_uploads rows older than 1 hour:
//   - If the URL is still referenced in sessions/blog_posts/expenses/active_timer → row removed, file kept.
//   - If the URL is not referenced anywhere → file deleted from storage + row removed (orphaned upload).

async function isPendingUrlReferenced(db, url, tenantId) {
  const like = `%${url}%`;
  // Check JSON columns in these tables
  const tables = [
    ['sessions',     'image_urls'],
    ['active_timer', 'image_urls'],
    ['expenses',     'receipt_urls'],
  ];
  for (const [table, col] of tables) {
    try {
      const row = await db.get(
        `SELECT 1 FROM ${table} WHERE tenant_id = ? AND ${col} LIKE ? LIMIT 1`,
        [tenantId, like]
      );
      if (row) return true;
    } catch { /* table may not exist in older dbs */ }
  }
  // Blog posts: check both image_urls JSON column and HTML content in one query
  try {
    const row = await db.get(
      `SELECT 1 FROM blog_posts WHERE tenant_id = ? AND (image_urls LIKE ? OR content LIKE ?) LIMIT 1`,
      [tenantId, like, like]
    );
    if (row) return true;
  } catch { /* table may not exist */ }
  return false;
}

async function cleanupPendingUploads() {
  const JOB = 'cleanupPendingUploads';
  recordJobStart(JOB);
  const cutoff = Date.now() - 60 * 60 * 1000;
  let claimed = 0, orphaned = 0;
  try {
    if (DB_BACKEND === 'postgres') {
      const db = getDefaultDb();
      const rows = await db.all('SELECT url, tenant_id FROM pending_uploads WHERE uploaded_at < ?', [cutoff]);
      for (const row of rows) {
        const referenced = await isPendingUrlReferenced(db, row.url, row.tenant_id);
        if (!referenced) {
          await imageStore.delete(row.url, true).catch(() => {});
          await receiptStore.delete(row.url).catch(() => {});
          orphaned++;
        } else {
          claimed++;
        }
        await db.run('DELETE FROM pending_uploads WHERE url = ? AND tenant_id = ?', [row.url, row.tenant_id]);
      }
    } else {
      const tenants = await listTenants();
      for (const tenant of tenants) {
        try {
          const db = getTenantDb(tenant.id);
          const rows = await db.all(
            'SELECT url FROM pending_uploads WHERE tenant_id = ? AND uploaded_at < ?',
            [tenant.id, cutoff]
          );
          for (const row of rows) {
            const referenced = await isPendingUrlReferenced(db, row.url, tenant.id);
            if (!referenced) {
              await imageStore.delete(row.url, true).catch(() => {});
              await receiptStore.delete(row.url).catch(() => {});
              orphaned++;
            } else {
              claimed++;
            }
            await db.run('DELETE FROM pending_uploads WHERE url = ? AND tenant_id = ?', [row.url, tenant.id]);
          }
        } catch (e) {
          console.warn(`[pending-uploads] error for tenant ${tenant.id}:`, e.message);
        }
      }
    }
    const summary = claimed + orphaned === 0
      ? 'Nothing to clean up'
      : `${claimed + orphaned} entries removed (${claimed} claimed, ${orphaned} orphaned files deleted from storage)`;
    if (claimed + orphaned > 0) console.log(`[pending-uploads] ${summary}`);
    recordJobSuccess(JOB, summary);
  } catch (e) {
    console.warn('[pending-uploads] cleanup error:', e.message);
    recordJobError(JOB, e);
  }
}

// ─── Prune visitor stats ─────────────────────────────────────────────
async function pruneVisitorStats() {
  const JOB = 'pruneVisitorStats';
  recordJobStart(JOB);
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  let totalChanges = 0;
  try {
    if (DB_BACKEND === 'postgres') {
      const db = getDefaultDb();
      const { changes } = await db.run('DELETE FROM visitor_stats WHERE ts < ?', [cutoff]);
      totalChanges = changes;
    } else {
      const tenants = await listTenants();
      for (const tenant of tenants) {
        try {
          const db = getTenantDb(tenant.id);
          const { changes } = await db.run(
            'DELETE FROM visitor_stats WHERE ts < ? AND tenant_id = ?',
            [cutoff, tenant.id]
          );
          totalChanges += changes;
        } catch { /* tenant db may not have this table */ }
      }
    }
    const summary = totalChanges > 0 ? `Pruned ${totalChanges} entries older than 1 year` : 'Nothing to prune';
    if (totalChanges > 0) console.log(`[visitor-stats] ${summary}`);
    recordJobSuccess(JOB, summary);
  } catch (e) {
    console.warn('[visitor-stats] prune error:', e.message);
    recordJobError(JOB, e);
  }
}

// ─── Migrate data:URI signatures to files ───────────────────────────
// One-time migration: converts existing base64 data:URI signatures in the DB
// to stored files, so local and R2 storage behave identically.

async function migrateDataUriSignatures() {
  const JOB = 'migrateDataUriSignatures';
  recordJobStart(JOB);
  let migrated = 0;
  try {
    const processDb = async (db, tenantId, tenantSlug) => {
      const rows = await db.all(
        "SELECT id, signature_png FROM sign_offs WHERE tenant_id = ? AND signature_png LIKE 'data:%'",
        [tenantId]
      );
      for (const row of rows) {
        try {
          const buf = Buffer.from(row.signature_png.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          const url = await signatureStore.save(`${row.id}.png`, buf, 'image/png', tenantSlug);
          await db.run('UPDATE sign_offs SET signature_png = ? WHERE id = ? AND tenant_id = ?', [url, row.id, tenantId]);
          migrated++;
        } catch (e) {
          console.warn(`[sig-migration] Failed to migrate signature ${row.id}:`, e.message);
        }
      }
    };

    if (DB_BACKEND === 'postgres') {
      const db = getDefaultDb();
      const tenants = await listTenants();
      for (const t of tenants) {
        try { await processDb(db, t.id, t.slug); } catch {}
      }
    } else {
      const tenants = await listTenants();
      for (const t of tenants) {
        try { await processDb(getTenantDb(t.id), t.id, t.slug); } catch {}
      }
    }

    const summary = migrated > 0 ? `Migrated ${migrated} data:URI signature(s) to file storage` : 'No data:URI signatures found';
    if (migrated > 0) console.log(`[sig-migration] ${summary}`);
    recordJobSuccess(JOB, summary);
  } catch (e) {
    console.warn('[sig-migration] error:', e.message);
    recordJobError(JOB, e);
  }
}

// ─── Migrate data:URI images in blog content to files ───────────────
// One-time migration: finds blog posts containing base64 embedded images
// in their content and uploads them as files.

async function migrateDataUriBlogImages() {
  const JOB = 'migrateDataUriBlogImages';
  recordJobStart(JOB);
  let migrated = 0;
  try {
    const processDb = async (db, tenantId, tenantSlug) => {
      // Find posts with data: URIs in content (both JSON and HTML)
      const rows = await db.all(
        "SELECT id, content FROM blog_posts WHERE tenant_id = ? AND content LIKE '%data:image/%'",
        [tenantId]
      );
      for (const row of rows) {
        try {
          const updated = await extractAndUploadBase64Images(row.content, tenantSlug);
          if (updated !== row.content) {
            const imageUrls = extractContentImageUrls(updated);
            await db.run(
              'UPDATE blog_posts SET content = ?, image_urls = ?, updated_at = ? WHERE id = ? AND tenant_id = ?',
              [updated, JSON.stringify(imageUrls), new Date().toISOString(), row.id, tenantId]
            );
            migrated++;
          }
        } catch (e) {
          console.warn(`[blog-migration] Failed to migrate blog post ${row.id}:`, e.message);
        }
      }
    };

    if (DB_BACKEND === 'postgres') {
      const db = getDefaultDb();
      const tenants = await listTenants();
      for (const t of tenants) {
        try { await processDb(db, t.id, t.slug); } catch {}
      }
    } else {
      const tenants = await listTenants();
      for (const t of tenants) {
        try { await processDb(getTenantDb(t.id), t.id, t.slug); } catch {}
      }
    }

    const summary = migrated > 0 ? `Migrated ${migrated} blog post(s) with embedded base64 images` : 'No embedded base64 images found';
    if (migrated > 0) console.log(`[blog-migration] ${summary}`);
    recordJobSuccess(JOB, summary);
  } catch (e) {
    console.warn('[blog-migration] error:', e.message);
    recordJobError(JOB, e);
  }
}

// ─── Cleanup orphaned tenant data ───────────────────────────────────
// Runs daily. For PostgreSQL: finds data in tables whose tenant_id no longer
// exists in the tenants table and removes it (including files from storage).
// For SQLite: each tenant has its own DB, so orphan risk is lower — we only
// check the master DB's tenants table against tenant-scoped data.

async function cleanupOrphanedTenantData() {
  const JOB = 'cleanupOrphanedTenantData';
  recordJobStart(JOB);
  try {
    const tenants    = await listTenants();
    const validIds   = new Set(tenants.map(t => t.id));
    let totalCleaned = 0;

    if (DB_BACKEND === 'postgres') {
      const db = getDefaultDb();

      // Find orphaned tenant_ids across all data tables
      const dataTables = ['sessions', 'blog_posts', 'expenses', 'active_timer', 'sign_offs',
                          'expense_budgets', 'pending_uploads', 'visitor_stats', 'settings'];
      const orphanedIds = new Set();
      for (const table of dataTables) {
        try {
          const rows = await db.all(`SELECT DISTINCT tenant_id FROM ${table}`);
          for (const r of rows) {
            if (r.tenant_id && !validIds.has(r.tenant_id)) orphanedIds.add(r.tenant_id);
          }
        } catch { /* table may not exist */ }
      }

      for (const orphanId of orphanedIds) {
        console.log(`[orphan-cleanup] Cleaning data for deleted tenant: ${orphanId}`);

        // Delete session images
        try {
          const sessRows = await db.all('SELECT image_urls FROM sessions WHERE tenant_id = ?', [orphanId]);
          for (const row of sessRows) {
            for (const url of JSON.parse(row.image_urls || '[]')) await imageStore.delete(url, true).catch(() => {});
          }
          const { changes } = await db.run('DELETE FROM sessions WHERE tenant_id = ?', [orphanId]);
          totalCleaned += changes;
        } catch {}

        // Delete blog post images (from column + content)
        try {
          const blogRows = await db.all('SELECT image_urls, content FROM blog_posts WHERE tenant_id = ?', [orphanId]);
          for (const row of blogRows) {
            const fromColumn  = JSON.parse(row.image_urls || '[]');
            const fromContent = extractContentImageUrls(row.content);
            for (const url of [...new Set([...fromColumn, ...fromContent])]) await imageStore.delete(url, true).catch(() => {});
          }
          const { changes } = await db.run('DELETE FROM blog_posts WHERE tenant_id = ?', [orphanId]);
          totalCleaned += changes;
        } catch {}

        // Delete expense receipts
        try {
          const expRows = await db.all('SELECT receipt_urls FROM expenses WHERE tenant_id = ?', [orphanId]);
          for (const row of expRows) {
            for (const url of JSON.parse(row.receipt_urls || '[]')) await receiptStore.delete(url).catch(() => {});
          }
          const { changes } = await db.run('DELETE FROM expenses WHERE tenant_id = ?', [orphanId]);
          totalCleaned += changes;
        } catch {}

        // Delete sign-off signatures
        try {
          const sigRows = await db.all('SELECT signature_png FROM sign_offs WHERE tenant_id = ?', [orphanId]);
          for (const row of sigRows) {
            if (row.signature_png && !row.signature_png.startsWith('data:')) await signatureStore.delete(row.signature_png).catch(() => {});
          }
          const { changes } = await db.run('DELETE FROM sign_offs WHERE tenant_id = ?', [orphanId]);
          totalCleaned += changes;
        } catch {}

        // Delete pending upload files
        try {
          const pendingRows = await db.all('SELECT url FROM pending_uploads WHERE tenant_id = ?', [orphanId]);
          for (const row of pendingRows) {
            await imageStore.delete(row.url, true).catch(() => {});
            await receiptStore.delete(row.url).catch(() => {});
          }
        } catch {}

        // Bulk-delete remaining orphaned rows from all tables
        for (const table of dataTables) {
          try {
            const { changes } = await db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [orphanId]);
            totalCleaned += changes;
          } catch {}
        }
      }
    }
    // SQLite: each tenant has its own DB file — no cross-tenant orphan risk.
    // If the master tenants table row is deleted, the per-tenant .db file
    // still exists on disk but won't be served. We don't delete .db files
    // automatically to avoid accidental data loss.

    const summary = totalCleaned > 0
      ? `Cleaned ${totalCleaned} orphaned rows from deleted tenants`
      : 'No orphaned tenant data found';
    if (totalCleaned > 0) console.log(`[orphan-cleanup] ${summary}`);
    recordJobSuccess(JOB, summary);
  } catch (e) {
    console.warn('[orphan-cleanup] error:', e.message);
    recordJobError(JOB, e);
  }
}

// ─── Auth Routes ─────────────────────────────────────────────────────

app.post('/api/auth/setup', async (req, res) => {
  try {
    const tenant = await getFirstTenant();
    if (!tenant) return res.status(503).json({ error: 'No tenant configured' });
    if (tenant.password_hash) return res.status(400).json({ error: 'Password already set' });

    const { password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const hash = await hashPassword(password);

    await setTenantPassword(tenant.id, hash);
    const db = getTenantDb(tenant.id);
    await setSetting(db, 'auth_password_hash', hash);

    const token = createToken({ role: 'admin', tenantId: tenant.id });
    res.json({ ok: true, token });
  } catch (err) {
    serverError(res, err);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    // Rate limiting
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (entry && now < entry.resetTime) {
      if (entry.count >= LOGIN_RATE_LIMIT) {
        return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
      }
      entry.count++;
    } else {
      loginAttempts.set(ip, { count: 1, resetTime: now + LOGIN_RATE_WINDOW });
    }

    const { password, username, rememberMe } = req.body;
    let tenant = null;
    if (MULTI_TENANT) {
      if (!username) return res.status(400).json({ error: 'Username is required' });
      tenant = await getTenantBySlug(username);
    } else {
      // Single-tenant (SQLite, or Postgres with SINGLE_TENANT=true): the sole
      // tenant is the only account — no username needed.
      tenant = await getFirstTenant();
    }
    if (!tenant) return res.status(400).json({ error: 'User not found' });
    if (tenant.is_active === 0 || tenant.is_active === false) return res.status(403).json({ error: 'Account deactivated. Please contact your administrator.' });
    if (!tenant.password_hash) return res.status(400).json({ error: 'No password set. Please set up first.' });
    const { ok, rehash } = await verifyPassword(password || '', tenant.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });
    // Silently upgrade legacy SHA-256 hash to bcrypt on first successful login
    if (rehash) {
      await setTenantPassword(tenant.id, rehash);
      const db = getTenantDb(tenant.id);
      await setSetting(db, 'auth_password_hash', rehash).catch(() => {});
    }
    // Block non-admin login when maintenance mode is active.
    // In a single-tenant deployment the sole user is always the admin.
    const role = tenant.role || (MULTI_TENANT ? 'user' : 'admin');
    if (role !== 'admin') {
      const db = getTenantDb(tenant.id);
      const general = await getSetting(db, 'general', DEFAULT_GENERAL);
      if (general.maintenanceMode) {
        return res.status(503).json({ error: 'Server is in maintenance mode. Please try again later.' });
      }
    }
    const token = createToken({ role, tenantId: tenant.id, slug: tenant.slug }, rememberMe === true ? TOKEN_EXPIRY_HOURS_REMEMBER : TOKEN_EXPIRY_HOURS);
    res.json({ ok: true, token, slug: tenant.slug });
  } catch (err) {
    serverError(res, err);
  }
});

app.get('/api/auth/status', async (req, res) => {
  if (req.tenantNotFound) return res.json({ tenantNotFound: true });
  try {
    const tenant = await getFirstTenant();
    const hasPassword = !!(tenant && tenant.password_hash);
    const auth = req.headers.authorization;
    let authenticated = false;
    let role = null;
    if (auth && auth.startsWith('Bearer ')) {
      const payload = verifyToken(auth.slice(7));
      if (payload) { authenticated = true; role = payload.role || null; }
    }
    // Check maintenance mode
    let maintenanceMode = false;
    if (!DEMO_MODE) {
      try {
        const db = req.db || getDefaultDb();
        const general = await getSetting(db, 'general', DEFAULT_GENERAL);
        maintenanceMode = !!general.maintenanceMode;
      } catch {}
    }
    // Check if tenant is deactivated (multi-tenant only)
    let isDeactivated = false;
    if (!DEMO_MODE && MULTI_TENANT && req.tenantId) {
      try {
        const tenantRow = await getTenantById(req.tenantId);
        if (tenantRow && (tenantRow.is_active === 0 || tenantRow.is_active === false)) {
          isDeactivated = true;
        }
      } catch {}
    }
    // Latest-news badge: only meaningful for a real authenticated session —
    // demo visitors and logged-out users never see it.
    let latestNews = null;
    let hasUnseenNews = false;
    if (!DEMO_MODE && authenticated) {
      try {
        latestNews = await getPlatformSetting('latestNews', null);
        if (latestNews && latestNews.slug) {
          const db = req.db || getDefaultDb();
          const newsSeen = await getSetting(db, 'newsSeen', { lastSeenSlug: null });
          hasUnseenNews = latestNews.slug !== newsSeen.lastSeenSlug;
        }
      } catch {}
    }
    // Admin-with-real-token override: when an admin presents a verified token
    // on a demo deployment, report `demoMode: false` for that session so the
    // frontend treats them as a regular admin (saves enabled, full nav, real
    // admin panel). Anonymous demo visitors continue to see demoMode:true,
    // role:'admin' (faked) so they can browse every page in read-only mode —
    // and the route gates that key off `demoMode` reject them appropriately.
    const adminOverride = DEMO_MODE && authenticated && role === 'admin';
    res.json({
      hasPassword:   DEMO_MODE ? true : hasPassword,
      authenticated: DEMO_MODE ? true : authenticated,
      demoMode:      adminOverride ? false : DEMO_MODE,
      multiTenant:   MULTI_TENANT,
      role:          DEMO_MODE ? 'admin' : role,
      maintenanceMode,
      isDeactivated,
      latestNews,
      hasUnseenNews,
    });
  } catch {
    res.json({ hasPassword: false, authenticated: false, demoMode: DEMO_MODE });
  }
});

app.post('/api/news/seen', requireAuth, async (req, res) => {
  try {
    const latestNews = await getPlatformSetting('latestNews', null);
    await setSetting(req.db, 'newsSeen', { lastSeenSlug: latestNews?.slug || null });
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Public Stats API ────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    if (!await checkBlogAccess(req, res)) return;
    const db = req.db || getDefaultDb();
    const rows = await db.all(
      'SELECT section, duration_minutes, start_time FROM sessions WHERE tenant_id = ?',
      [db.tenantId]
    );
    const generalSettings  = await getSetting(db, 'general', DEFAULT_GENERAL);
    const targetHours      = generalSettings.targetHours || 2500;
    const progressMode     = generalSettings.progressMode || 'time';
    const sectionConfigs   = await getSetting(db, 'sections', DEFAULT_SECTIONS);
    const excludedSections = new Set(
      sectionConfigs.filter(s => s.countTowardsBuildHours === false).map(s => s.id)
    );

    const countedRows  = rows.filter(r => !excludedSections.has(r.section));
    const totalMinutes = countedRows.reduce((sum, r) => sum + r.duration_minutes, 0);
    const totalHours   = totalMinutes / 60;
    const timePct      = Math.min((totalHours / targetHours) * 100, 100);

    let packagePct = 0;
    if (progressMode === 'packages') {
      const flowStatus   = await getSetting(db, 'flowchart_status', {});
      const flowPackages = await getSetting(db, 'flowchart_packages', {});
      function getAllPackageIds(items) {
        return items.flatMap(item => [item.id, ...getAllPackageIds(item.children || [])]);
      }
      const allIds   = Object.values(flowPackages).flatMap(items => getAllPackageIds(items));
      const doneCount = allIds.filter(id => flowStatus[id] === 'done').length;
      packagePct = allIds.length > 0 ? Math.min((doneCount / allIds.length) * 100, 100) : 0;
    }

    const progressPct = progressMode === 'packages' ? packagePct : timePct;

    let estimatedFinish = null;
    let hoursPerWeek    = null;
    if (countedRows.length >= 2) {
      const sorted    = [...countedRows].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      const firstDate = new Date(sorted[0].start_time);
      const lastDate  = new Date(sorted[sorted.length - 1].start_time);
      const spanWeeks = (lastDate - firstDate) / (7 * 24 * 60 * 60 * 1000);
      if (spanWeeks >= 0.5) {
        hoursPerWeek = totalHours / spanWeeks;
        const remaining = targetHours - totalHours;
        if (remaining > 0) {
          estimatedFinish = new Date(Date.now() + (remaining / hoursPerWeek) * 7 * 24 * 60 * 60 * 1000).toISOString();
        }
      }
    }

    const sectionHours = {};
    for (const row of rows) {
      if (!sectionHours[row.section]) sectionHours[row.section] = 0;
      sectionHours[row.section] += row.duration_minutes / 60;
    }
    for (const k of Object.keys(sectionHours)) sectionHours[k] = parseFloat(sectionHours[k].toFixed(1));

    res.json({
      totalHours:     parseFloat(totalHours.toFixed(1)),
      targetHours,
      progressPct:    parseFloat(progressPct.toFixed(1)),
      progressMode,
      sessionCount:   rows.length,
      estimatedFinish,
      hoursPerWeek:   hoursPerWeek ? parseFloat(hoursPerWeek.toFixed(1)) : null,
      projectName:    generalSettings.projectName,
      sectionHours,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Sessions API ────────────────────────────────────────────────────

app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const db     = req.db;
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    const [countRow, rows] = await Promise.all([
      db.get('SELECT COUNT(*) as total FROM sessions WHERE tenant_id = ?', [db.tenantId]),
      db.all(
        'SELECT * FROM sessions WHERE tenant_id = ? ORDER BY start_time DESC LIMIT ? OFFSET ?',
        [db.tenantId, limit, offset]
      ),
    ]);

    const total = countRow?.total ?? 0;
    res.json({
      sessions: rows.map(row => ({
        id: row.id, section: row.section,
        startTime: row.start_time, endTime: row.end_time,
        durationMinutes: row.duration_minutes, notes: row.notes,
        plansReference: row.plans_reference,
        imageUrls: JSON.parse(row.image_urls || '[]'),
      })),
      total,
      hasMore: offset + limit < total,
    });
  } catch (err) {
    serverError(res, err);
  }
});

app.post('/api/sessions', requireAuth, async (req, res) => {
  try {
    const { section, startTime, endTime, durationMinutes, notes, plansReference, imageUrls } = req.body;
    // Validate required fields
    if (!section || typeof section !== 'string' || !section.trim()) return res.status(400).json({ error: 'section is required and must be a non-empty string' });
    if (!startTime) return res.status(400).json({ error: 'startTime is required' });
    if (!endTime) return res.status(400).json({ error: 'endTime is required' });
    if (durationMinutes == null || !Number.isFinite(Number(durationMinutes)) || Number(durationMinutes) < 0 || Number(durationMinutes) > 525600) return res.status(400).json({ error: 'durationMinutes must be >= 0 and <= 525600 (1 year)' });
    // Always generate ID server-side (ignore client-supplied id)
    const id = uuidv4();
    await req.db.run(
      `INSERT INTO sessions (id, tenant_id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.tenantId, section, startTime, endTime, durationMinutes, notes || '', plansReference || null, JSON.stringify(imageUrls || [])]
    );
    publishMqttStats(req.db);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

app.put('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    // Validate update fields
    if (updates.section !== undefined && (!updates.section || typeof updates.section !== 'string' || !updates.section.trim())) return res.status(400).json({ error: 'section must be a non-empty string' });
    if (updates.durationMinutes !== undefined && (!Number.isFinite(Number(updates.durationMinutes)) || Number(updates.durationMinutes) < 0 || Number(updates.durationMinutes) > 525600)) return res.status(400).json({ error: 'durationMinutes must be >= 0 and <= 525600' });
    const fields = [];
    const values = [];
    if (updates.section          !== undefined) { fields.push('section = ?');          values.push(updates.section); }
    if (updates.startTime        !== undefined) { fields.push('start_time = ?');        values.push(updates.startTime); }
    if (updates.endTime          !== undefined) { fields.push('end_time = ?');          values.push(updates.endTime); }
    if (updates.durationMinutes  !== undefined) { fields.push('duration_minutes = ?');  values.push(updates.durationMinutes); }
    if (updates.notes            !== undefined) { fields.push('notes = ?');             values.push(updates.notes); }
    if (updates.plansReference   !== undefined) { fields.push('plans_reference = ?');   values.push(updates.plansReference); }
    if (updates.imageUrls        !== undefined) { fields.push('image_urls = ?');        values.push(JSON.stringify(updates.imageUrls)); }
    if (fields.length > 0) {
      values.push(id, req.tenantId);
      await req.db.run(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
    }
    publishMqttStats(req.db);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const row = await req.db.get(
      'SELECT image_urls FROM sessions WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    if (row) {
      for (const url of JSON.parse(row.image_urls || '[]')) {
        await imageStore.delete(url, true).catch(err => console.error('Failed to delete session image:', err.message));
      }
    }
    await req.db.run('DELETE FROM sessions WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    publishMqttStats(req.db);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Upload API ──────────────────────────────────────────────────────

app.post('/api/upload', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    const generalSettings = await getSetting(req.db, 'general', DEFAULT_GENERAL);
    const resizingEnabled = generalSettings.imageResizing !== false;
    const maxWidth        = generalSettings.imageMaxWidth || DEFAULT_GENERAL.imageMaxWidth;
    const thumbWidth      = 400;
    const isBlogUpload    = (req.body.sessionId || '').startsWith('blog-');
    const urls = [];
    for (const file of req.files) {
      const filename = `${uuidv4()}.jpg`;
      let buf = file.buffer;
      if (file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
        buf = Buffer.from(await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.95 }));
      }
      if (resizingEnabled) {
        buf = await sharp(buf).rotate().resize(maxWidth, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      } else {
        buf = await sharp(buf).rotate().jpeg({ quality: 90 }).toBuffer();
      }
      const thumbBuf = await sharp(buf).resize(thumbWidth, null, { withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
      const url = await imageStore.save(filename, buf, 'image/jpeg', req.user?.slug);
      await imageStore.save(thumbFilename(filename), thumbBuf, 'image/jpeg', req.user?.slug);
      urls.push(url);
      await req.db.run('INSERT OR REPLACE INTO pending_uploads (url, tenant_id, uploaded_at) VALUES (?, ?, ?)', [url, req.tenantId, Date.now()]);
      // Only attach to active timer for session uploads, not blog editor uploads
      if (!isBlogUpload) {
        const activeTimer = await req.db.get('SELECT image_urls FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
        if (activeTimer) {
          const existing = JSON.parse(activeTimer.image_urls || '[]');
          await req.db.run('UPDATE active_timer SET image_urls = ? WHERE tenant_id = ?', [JSON.stringify([...existing, url]), req.tenantId]);
        }
      }
    }
    res.json({ urls });
  } catch (err) {
    console.error('[upload] error:', err.message, err.$metadata || '');
    serverError(res, err);
  }
});

app.delete('/api/upload', requireAuth, async (req, res) => {
  const { url } = req.body;
  try {
    if (url) {
      await imageStore.delete(url, true);
      await req.db.run('DELETE FROM pending_uploads WHERE url = ? AND tenant_id = ?', [url, req.tenantId]);
      const activeTimer = await req.db.get('SELECT image_urls FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
      if (activeTimer) {
        const remaining = JSON.parse(activeTimer.image_urls || '[]').filter(u => u !== url);
        await req.db.run('UPDATE active_timer SET image_urls = ? WHERE tenant_id = ?', [JSON.stringify(remaining), req.tenantId]);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── OCR API ─────────────────────────────────────────────────────────

const ocrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif|gif|bmp|tiff)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.post('/api/ocr', requireAuth, ocrUpload.single('image'), async (req, res) => {
  if (!OCR_URL) return res.status(404).json({ error: 'OCR service not configured' });
  if (!req.file) return res.status(400).json({ error: 'No image provided' });

  try {
    // Forward the image to the OCR service using native FormData + Blob
    const form = new FormData();
    form.append('image', new Blob([req.file.buffer], { type: req.file.mimetype || 'image/jpeg' }), req.file.originalname || 'image.jpg');

    const response = await fetch(`${OCR_URL}/ocr`, {
      method: 'POST',
      body: form,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[ocr] OCR service error:', response.status, text);
      return res.status(502).json({ error: 'OCR service returned an error' });
    }

    const result = await response.json();
    res.json(result);
  } catch (err) {
    console.error('[ocr] Failed to reach OCR service:', err.message);
    res.status(502).json({ error: 'OCR service unavailable' });
  }
});

// ─── Plans API ───────────────────────────────────────────────────────
// PDF plan-drawings library. Each file is associated with a build phase +
// section ID (parsed from filename via the aircraft manufacturer's parser,
// or assigned manually). Annotations are per-file/per-page JSON overlays.
//
// Storage: PDFs land in PLANS_DIR (local-only by default, see plansStore).
// The DB stores metadata only. Files are served through an auth-gated
// streaming endpoint at /api/plans/:id/file — they never get a public URL.

const plansUpload = multer({
  storage: multer.memoryStorage(),
  // RV-10 sections range from ~800 KB to ~5 MB per file; allow generous
  // headroom for other manufacturers' larger PDFs.
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

function planRow(r) {
  return {
    id:           String(r.id),
    originalName: r.original_name,
    sectionId:    r.section_id || '',
    sectionTitle: r.section_title || '',
    phase:        r.phase || 'other',
    description:  r.description || '',
    fileSize:     Number(r.file_size) || 0,
    pageCount:    Number(r.page_count) || 0,
    pinned:       Number(r.pinned) === 1,
    uploadedAt:   r.uploaded_at,
    indexedAt:    r.indexed_at || null,
  };
}

function annoRow(r) {
  let data = {};
  try { data = JSON.parse(r.data || '{}'); } catch {}
  return {
    id:         String(r.id),
    fileId:     String(r.file_id),
    pageNumber: Number(r.page_number) || 1,
    kind:       r.kind || 'text',
    data,
    createdAt:  r.created_at,
    updatedAt:  r.updated_at,
  };
}

// List all plan files for the current tenant.
app.get('/api/plans', requireAuth, async (req, res) => {
  try {
    const rows = await req.db.all(
      'SELECT * FROM plan_files WHERE tenant_id = ? ORDER BY phase, section_id, original_name',
      [req.tenantId]
    );
    res.json(rows.map(planRow));
  } catch (err) { serverError(res, err); }
});

// Upload one or more PDFs. Each file is parsed by the active aircraft's
// filename parser; the client is expected to confirm/correct the section
// assignment via PUT /api/plans/:id afterwards if the parse missed.
app.post('/api/plans/upload', requireAuth, plansUpload.array('files', 50), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files provided' });
    const out = [];
    for (const file of req.files) {
      const id       = uuidv4();
      const filename = `${id}.pdf`;
      const url      = await plansStore.save(filename, file.buffer, 'application/pdf', req.user?.slug);
      // Filename parsing is done client-side after upload (the server is
      // aircraft-agnostic; the client has the active manufacturer's parser).
      // We persist the row with an empty section and let the client patch
      // it via PUT once it has classified the file.
      await req.db.run(
        `INSERT INTO plan_files (id, tenant_id, url, original_name, section_id, section_title, phase, description, file_size, page_count, pinned, uploaded_at)
         VALUES (?, ?, ?, ?, '', '', 'other', '', ?, 0, 0, ?)`,
        [id, req.tenantId, url, file.originalname, file.size || file.buffer.length, new Date().toISOString()]
      );
      const row = await req.db.get('SELECT * FROM plan_files WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
      out.push(planRow(row));
    }
    res.json({ uploaded: out });
  } catch (err) {
    console.error('[plans] upload error:', err.message);
    serverError(res, err);
  }
});

// Update a plan file's classification / pinned state.
app.put('/api/plans/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const current = await req.db.get('SELECT * FROM plan_files WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    if (!current) return res.status(404).json({ error: 'Plan file not found' });
    const fields = [];
    const values = [];
    if (req.body.sectionId    !== undefined) { fields.push('section_id = ?');    values.push(String(req.body.sectionId)); }
    if (req.body.sectionTitle !== undefined) { fields.push('section_title = ?'); values.push(String(req.body.sectionTitle)); }
    if (req.body.phase        !== undefined) { fields.push('phase = ?');         values.push(String(req.body.phase)); }
    if (req.body.description  !== undefined) { fields.push('description = ?');   values.push(String(req.body.description)); }
    if (req.body.pageCount    !== undefined) { fields.push('page_count = ?');    values.push(Number(req.body.pageCount) || 0); }
    if (req.body.pinned       !== undefined) { fields.push('pinned = ?');        values.push(req.body.pinned ? 1 : 0); }
    if (!fields.length) return res.json(planRow(current));
    values.push(id, req.tenantId);
    await req.db.run(`UPDATE plan_files SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
    const updated = await req.db.get('SELECT * FROM plan_files WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    res.json(planRow(updated));
  } catch (err) { serverError(res, err); }
});

// Delete a plan file + its annotations + the underlying PDF.
app.delete('/api/plans/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const row = await req.db.get('SELECT * FROM plan_files WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    if (!row) return res.status(404).json({ error: 'Plan file not found' });
    await plansStore.delete(row.url).catch(() => {});
    await req.db.run('DELETE FROM plan_annotations WHERE tenant_id = ? AND file_id = ?', [req.tenantId, id]);
    await req.db.run('DELETE FROM plan_part_refs   WHERE tenant_id = ? AND file_id = ?', [req.tenantId, id]);
    await req.db.run('DELETE FROM plan_files       WHERE id = ? AND tenant_id = ?',       [id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// Bulk-replace the part-number index for one plan file. Called by the
// client after PDF.js extracts text and the aircraft vendor patterns
// match part numbers. Server is dumb storage — the regex library lives
// in the frontend bundle and is per-aircraft.
app.post('/api/plans/:id/index', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const file = await req.db.get('SELECT 1 FROM plan_files WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    if (!file) return res.status(404).json({ error: 'Plan file not found' });
    const refs = Array.isArray(req.body?.refs) ? req.body.refs : [];
    // Replace, don't append — re-indexing a file should reflect current state.
    // Wrapped in a transaction so a mid-loop failure rolls back the DELETE
    // instead of silently dropping the file's existing refs.
    await req.db.transaction(async (tx) => {
      await tx.run('DELETE FROM plan_part_refs WHERE tenant_id = ? AND file_id = ?', [req.tenantId, id]);
      for (const r of refs) {
        const page = Math.floor(Number(r.pageNumber)) || 0;
        const pn = String(r.partNumber || '').trim();
        if (!pn || page <= 0) continue;
        await tx.run(
          `INSERT INTO plan_part_refs (tenant_id, file_id, page_number, part_number, snippet, bbox)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.tenantId, id, page, pn, String(r.snippet || '').slice(0, 200), r.bbox ? JSON.stringify(r.bbox) : null]
        );
      }
      await tx.run('UPDATE plan_files SET indexed_at = ? WHERE id = ? AND tenant_id = ?',
        [new Date().toISOString(), id, req.tenantId]);
    });
    res.json({ ok: true, count: refs.length });
  } catch (err) { serverError(res, err); }
});

// Search part-number refs across all plan files for the current tenant.
// Returns up to `limit` refs joined with their plan file's section metadata
// so the palette can show "AN3-5A · 14 Wing Ribs · p4" without extra lookups.
app.get('/api/plans/search', requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    // Clamp to a positive range — SQLite treats negative LIMIT as "no limit"
    // and Postgres outright rejects it; the bare `|| 500` also swallows 0.
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 500, 2000));
    const params = [req.tenantId];
    let where = 'r.tenant_id = ?';
    if (q) {
      // Escape LIKE metachars (%, _, \) so a user-supplied % doesn't match
      // everything and legitimate underscores in part numbers are literal.
      const escaped = q.toUpperCase().replace(/[\\%_]/g, ch => '\\' + ch);
      where += ` AND UPPER(r.part_number) LIKE ? ESCAPE '\\'`;
      params.push(`%${escaped}%`);
    }
    params.push(limit);
    const rows = await req.db.all(
      `SELECT r.file_id, r.page_number, r.part_number, r.snippet,
              f.original_name, f.section_id, f.section_title, f.phase
         FROM plan_part_refs r
         JOIN plan_files f ON f.id = r.file_id AND f.tenant_id = r.tenant_id
        WHERE ${where}
        ORDER BY r.part_number, f.section_id, r.page_number
        LIMIT ?`,
      params
    );
    res.json({
      refs: rows.map(r => ({
        fileId:       String(r.file_id),
        pageNumber:   Number(r.page_number) || 1,
        partNumber:   r.part_number,
        snippet:      r.snippet || '',
        file: {
          originalName: r.original_name,
          sectionId:    r.section_id || '',
          sectionTitle: r.section_title || '',
          phase:        r.phase || 'other',
        },
      })),
    });
  } catch (err) { serverError(res, err); }
});

// Stream the raw PDF (auth-gated — copyrighted content, never public).
app.get('/api/plans/:id/file', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get('SELECT * FROM plan_files WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!row) return res.status(404).json({ error: 'Plan file not found' });
    const buf = await plansStore.readBuffer(row.url);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Content-Disposition', `inline; filename="${row.original_name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
    // Prevent caching by intermediaries — copyrighted content + per-tenant scope.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buf);
  } catch (err) { serverError(res, err); }
});

// ─── Annotations ─────────────────────────────────────────────────────

// List all annotations for a plan file.
app.get('/api/plans/:id/annotations', requireAuth, async (req, res) => {
  try {
    // Verify file ownership first (avoid leaking via crafted file_id).
    const file = await req.db.get('SELECT 1 FROM plan_files WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!file) return res.status(404).json({ error: 'Plan file not found' });
    const rows = await req.db.all(
      'SELECT * FROM plan_annotations WHERE tenant_id = ? AND file_id = ? ORDER BY page_number, created_at',
      [req.tenantId, req.params.id]
    );
    res.json(rows.map(annoRow));
  } catch (err) { serverError(res, err); }
});

// Create one annotation.
app.post('/api/plans/:id/annotations', requireAuth, async (req, res) => {
  try {
    const file = await req.db.get('SELECT 1 FROM plan_files WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!file) return res.status(404).json({ error: 'Plan file not found' });
    const id = uuidv4();
    const kind = (req.body.kind === 'stroke') ? 'stroke' : 'text';
    const pageNumber = Math.max(1, Number(req.body.pageNumber) || 1);
    const data = req.body.data && typeof req.body.data === 'object' ? req.body.data : {};
    const now = new Date().toISOString();
    await req.db.run(
      `INSERT INTO plan_annotations (id, tenant_id, file_id, page_number, kind, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.tenantId, req.params.id, pageNumber, kind, JSON.stringify(data), now, now]
    );
    const row = await req.db.get('SELECT * FROM plan_annotations WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    res.json(annoRow(row));
  } catch (err) { serverError(res, err); }
});

// Update one annotation's data (text content, stroke geometry, position).
app.put('/api/plans/annotations/:annoId', requireAuth, async (req, res) => {
  try {
    const current = await req.db.get('SELECT * FROM plan_annotations WHERE id = ? AND tenant_id = ?', [req.params.annoId, req.tenantId]);
    if (!current) return res.status(404).json({ error: 'Annotation not found' });
    const fields = [];
    const values = [];
    if (req.body.data && typeof req.body.data === 'object') {
      fields.push('data = ?');
      values.push(JSON.stringify(req.body.data));
    }
    if (req.body.pageNumber !== undefined) {
      fields.push('page_number = ?');
      values.push(Math.max(1, Number(req.body.pageNumber) || 1));
    }
    if (!fields.length) return res.json(annoRow(current));
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.params.annoId, req.tenantId);
    await req.db.run(`UPDATE plan_annotations SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
    const row = await req.db.get('SELECT * FROM plan_annotations WHERE id = ? AND tenant_id = ?', [req.params.annoId, req.tenantId]);
    res.json(annoRow(row));
  } catch (err) { serverError(res, err); }
});

// Delete one annotation.
app.delete('/api/plans/annotations/:annoId', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM plan_annotations WHERE id = ? AND tenant_id = ?', [req.params.annoId, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── General Settings API ────────────────────────────────────────────

app.get('/api/settings/general', async (req, res) => {
  try {
    const db       = req.db || getDefaultDb();
    const settings = await getSetting(db, 'general', DEFAULT_GENERAL);
    const tenant   = req.tenant || await getFirstTenant();
    settings.publicBlog = tenant ? tenant.public_blog !== 0 : true;
    settings.ocrEnabled = !!OCR_URL;
    res.json(settings);
  } catch (err) { serverError(res, err); }
});

app.put('/api/settings/general', requireAuth, async (req, res) => {
  try {
    const current  = await getSetting(req.db, 'general', DEFAULT_GENERAL);
    const updates  = req.body;
    const newSettings = {
      projectName:  updates.projectName  !== undefined ? updates.projectName  : current.projectName,
      authorName:   updates.authorName   !== undefined ? updates.authorName   : (current.authorName || ''),
      targetHours:  updates.targetHours  !== undefined ? updates.targetHours  : current.targetHours,
      progressMode: updates.progressMode !== undefined ? updates.progressMode : (current.progressMode || 'time'),
      imageResizing:updates.imageResizing !== undefined ? updates.imageResizing : (current.imageResizing ?? true),
      imageMaxWidth:updates.imageMaxWidth !== undefined ? updates.imageMaxWidth : (current.imageMaxWidth || 1920),
      timeFormat:   updates.timeFormat   !== undefined ? updates.timeFormat   : (current.timeFormat || '24h'),
      landingPage:  updates.landingPage  !== undefined ? updates.landingPage  : (current.landingPage || 'blog'),
      homeCurrency: updates.homeCurrency !== undefined ? updates.homeCurrency : (current.homeCurrency || 'EUR'),
      wafPercent:   updates.wafPercent  !== undefined ? updates.wafPercent  : (current.wafPercent ?? 100),
      maintenanceMode: (updates.maintenanceMode !== undefined && req.user?.role === 'admin') ? updates.maintenanceMode : (current.maintenanceMode ?? false),
      blogShowSessionStats: updates.blogShowSessionStats !== undefined ? updates.blogShowSessionStats : (current.blogShowSessionStats ?? true),
      // Feature flags are admin-only writes. Merge so partial updates from the
      // admin panel don't wipe unrelated keys.
      featureFlags: (updates.featureFlags !== undefined && req.user?.role === 'admin')
        ? { ...(current.featureFlags ?? {}), ...updates.featureFlags }
        : (current.featureFlags ?? {}),
    };
    await setSetting(req.db, 'general', newSettings);
    // Persist publicBlog to tenants table (used by checkBlogAccess)
    if (updates.publicBlog !== undefined) {
      await updateTenantRow(req.tenantId, { public_blog: updates.publicBlog ? 1 : 0 });
    }
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── MQTT Settings API ───────────────────────────────────────────────

app.get('/api/settings/mqtt', requireAuth, async (req, res) => {
  try {
    const settings = await getMqttSettings(req.db);
    res.json({ ...settings, password: settings.password ? '••••••••' : '' });
  } catch (err) { serverError(res, err); }
});

app.put('/api/settings/mqtt', requireAuth, async (req, res) => {
  try {
    const current  = await getMqttSettings(req.db);
    const updates  = req.body;
    const newSettings = {
      enabled:         updates.enabled         !== undefined ? updates.enabled         : current.enabled,
      brokerUrl:       updates.brokerUrl        !== undefined ? updates.brokerUrl        : current.brokerUrl,
      username:        updates.username         !== undefined ? updates.username         : current.username,
      topicPrefix:     updates.topicPrefix      !== undefined ? updates.topicPrefix      : current.topicPrefix,
      password:        (updates.password && updates.password !== '••••••••') ? updates.password : current.password,
      haDiscovery:     updates.haDiscovery      !== undefined ? updates.haDiscovery      : current.haDiscovery,
      haDiscoveryPrefix: updates.haDiscoveryPrefix !== undefined ? updates.haDiscoveryPrefix : current.haDiscoveryPrefix,
    };
    await setSetting(req.db, 'mqtt', newSettings);
    await connectMqtt(req.db);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.post('/api/settings/mqtt/test', requireAuth, (req, res) => {
  const { brokerUrl, username, password } = req.body;
  if (!brokerUrl) return res.status(400).json({ error: 'Missing brokerUrl' });
  const url = /^mqtts?:\/\/|^wss?:\/\//.test(brokerUrl) ? brokerUrl : `mqtt://${brokerUrl}`;
  let responded = false;
  let testClient;
  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      try { if (testClient) testClient.end(true); } catch {}
      res.status(500).json({ error: 'Connection timed out after 5 seconds' });
    }
  }, 5000);
  try {
    const opts = { connectTimeout: 5000 };
    if (username) opts.username = username;
    if (password) opts.password = password;
    testClient = mqtt.connect(url, opts);
    testClient.on('connect', () => {
      if (!responded) {
        testClient.publish(`test/${Date.now()}`, 'test', { qos: 0 }, err => {
          if (!responded) {
            if (err) {
              responded = true; clearTimeout(timeout); testClient.end();
              serverError(res, err);
            } else {
              setTimeout(() => {
                if (!responded) {
                  responded = true; clearTimeout(timeout); testClient.end();
                  res.json({ success: true });
                }
              }, 200);
            }
          }
        });
      }
    });
    testClient.on('error', err => {
      if (!responded) { responded = true; clearTimeout(timeout); testClient.end(); serverError(res, err); }
    });
    testClient.on('close', () => {
      if (!responded) { responded = true; clearTimeout(timeout); res.status(500).json({ error: 'Connection closed unexpectedly (possible authentication failure)' }); }
    });
  } catch (err) {
    if (!responded) { responded = true; clearTimeout(timeout); serverError(res, err); }
  }
});

// ─── Sections API ────────────────────────────────────────────────────

app.get('/api/sections', async (req, res) => {
  try {
    const db       = req.db || getDefaultDb();
    const sections = await getSetting(db, 'sections', DEFAULT_SECTIONS);
    res.json(sections);
  } catch (err) { serverError(res, err); }
});

app.put('/api/sections', requireAuth, async (req, res) => {
  try {
    const sections = req.body;
    if (!Array.isArray(sections)) return res.status(400).json({ error: 'Expected array' });
    await setSetting(req.db, 'sections', sections);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.get('/api/sections/:id/usage', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const sessions  = await req.db.get('SELECT COUNT(*) as n FROM sessions   WHERE section = ? AND tenant_id = ?', [id, req.tenantId]);
    const blogPosts = await req.db.get('SELECT COUNT(*) as n FROM blog_posts WHERE section = ? AND tenant_id = ?', [id, req.tenantId]);
    // Count expenses where this section is the sole category OR part of a multi-category (handles weighted format "cat:60,cat2:40")
    const allExp = await req.db.all('SELECT category FROM expenses WHERE tenant_id = ?', [req.tenantId]);
    const expCount = allExp.filter(r => r.category && r.category.split(',').some(c => c.split(':')[0].trim() === id)).length;
    res.json({ sessions: sessions.n, blogPosts: blogPosts.n, expenses: expCount });
  } catch (err) { serverError(res, err); }
});

app.post('/api/sections/reassign', requireAuth, async (req, res) => {
  try {
    const { fromId, toId } = req.body;
    if (!fromId || !toId) return res.status(400).json({ error: 'fromId and toId are required' });
    const s = await req.db.run('UPDATE sessions   SET section = ? WHERE section = ? AND tenant_id = ?', [toId, fromId, req.tenantId]);
    const b = await req.db.run('UPDATE blog_posts SET section = ? WHERE section = ? AND tenant_id = ?', [toId, fromId, req.tenantId]);
    // Reassign expenses: handles both plain "cat1,cat2" and weighted "cat1:60,cat2:40" formats
    const allExp = await req.db.all('SELECT id, category FROM expenses WHERE tenant_id = ?', [req.tenantId]);
    let expUpdated = 0;
    for (const r of allExp) {
      if (!r.category) continue;
      const parts = r.category.split(',').map(c => c.trim());
      const catIds = parts.map(c => c.split(':')[0].trim());
      if (!catIds.includes(fromId)) continue;
      // Replace fromId with toId, preserving any weight suffix
      const newParts = parts.map(c => {
        const [id, weight] = c.split(':');
        if (id.trim() !== fromId) return c;
        return weight != null ? `${toId}:${weight}` : toId;
      });
      // Deduplicate if toId already exists (merge weights)
      const seen = new Map();
      for (const p of newParts) {
        const [id, w] = p.split(':');
        const key = id.trim();
        seen.set(key, (seen.get(key) || 0) + (w != null ? parseFloat(w) || 0 : 0));
      }
      const hasWeights = newParts.some(p => p.includes(':'));
      let newCategory;
      if (hasWeights) {
        newCategory = Array.from(seen.entries()).map(([id, w]) => `${id}:${w}`).join(',');
      } else {
        newCategory = Array.from(seen.keys()).join(',');
      }
      await req.db.run('UPDATE expenses SET category = ? WHERE id = ? AND tenant_id = ?', [newCategory, r.id, req.tenantId]);
      expUpdated++;
    }
    res.json({ sessionsUpdated: s.changes, blogPostsUpdated: b.changes, expensesUpdated: expUpdated });
  } catch (err) { serverError(res, err); }
});

// ─── Timer API ───────────────────────────────────────────────────────

app.post('/api/timer/start', requireAuth, async (req, res) => {
  try {
    const { section, plansSection } = req.body;
    if (!section) return res.status(400).json({ error: 'Section is required' });
    const startTime = new Date().toISOString();
    await req.db.run('DELETE FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    await req.db.run(
      'INSERT OR REPLACE INTO active_timer (tenant_id, section, start_time, image_urls, plans_section) VALUES (?, ?, ?, ?, ?)',
      [req.tenantId, section, startTime, '[]', plansSection || '']
    );
    res.json({ ok: true, section, plansSection: plansSection || '', startedAt: startTime });
  } catch (err) { serverError(res, err); }
});

app.post('/api/timer/stop', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get('SELECT * FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    if (!row) return res.status(404).json({ error: 'No active timer' });
    const endTime        = new Date();
    const startTime      = new Date(row.start_time);
    const durationMinutes = (endTime - startTime) / (1000 * 60);
    const { notes, plansReference, imageUrls: clientImages } = req.body;
    // Merge server-tracked images from the active_timer row with any client-supplied ones (deduplicate)
    const serverImages = JSON.parse(row.image_urls || '[]');
    const clientImgs   = Array.isArray(clientImages) ? clientImages : [];
    const mergedImages = [...new Set([...serverImages, ...clientImgs])];
    const sessionId = uuidv4();
    await req.db.run(
      `INSERT INTO sessions (id, tenant_id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, req.tenantId, row.section, row.start_time, endTime.toISOString(), durationMinutes, notes || '', plansReference || null, JSON.stringify(mergedImages)]
    );
    await req.db.run('DELETE FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    publishMqttStats(req.db);
    res.json({ ok: true, sessionId, durationMinutes, section: row.section });
  } catch (err) { serverError(res, err); }
});

app.get('/api/timer/status', requireAuth, async (req, res) => {
  try {
    const db  = req.db;
    const row = await db.get('SELECT * FROM active_timer WHERE tenant_id = ?', [db.tenantId]);
    if (!row) return res.json({ running: false });
    res.json({
      running: true,
      section: row.section,
      plansSection: row.plans_section || '',
      startedAt: row.start_time,
      imageUrls: JSON.parse(row.image_urls || '[]'),
    });
  } catch (err) { serverError(res, err); }
});

// ─── Export / Import ─────────────────────────────────────────────────

// Shared export builder — used by both the direct-download and SSE-stream endpoints.
// onProgress(event) is called after each item is processed; pass null to skip.
async function buildExport(archive, db, tenantId, options, onProgress) {
  const {
    includeSettings, includeSessions, includeExpenses, includeBlog,
    includeWorkPackages, includeWorkPackageStatus, includeSignOffs,
    includeInventory,
  } = options;
  const manifest = { version: 3, exportedAt: new Date().toISOString(), includes: {} };
  const prog = (ev) => { if (onProgress && !archive.destroyed) onProgress(ev); };

  if (includeSettings) {
    manifest.includes.settings = true;
    const settings = {
      general:         await getSetting(db, 'general',          DEFAULT_GENERAL),
      mqtt:            await getMqttSettings(db),
      sections:        await getSetting(db, 'sections',         DEFAULT_SECTIONS),
      flowchartStatus: await getSetting(db, 'flowchart_status', {}),
    };
    archive.append(JSON.stringify(settings, null, 2), { name: 'settings/settings.json' });
  }

  if (includeWorkPackages) {
    manifest.includes.workPackages = true;
    const wpData = { packages: await getSetting(db, 'flowchart_packages', {}) };
    if (includeWorkPackageStatus) {
      manifest.includes.workPackageStatus = true;
      wpData.status = await getSetting(db, 'flowchart_status', {});
    }
    archive.append(JSON.stringify(wpData, null, 2), { name: 'work_packages/packages.json' });
  }

  if (includeSessions) {
    manifest.includes.sessions = true;
    const rows = await db.all('SELECT * FROM sessions WHERE tenant_id = ? ORDER BY start_time DESC', [tenantId]);
    prog({ stage: 'sessions', label: 'Sessions', current: 0, total: rows.length });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const imageUrls = JSON.parse(row.image_urls || '[]');
      const imageFilenames = imageUrls.map(u => path.basename(u));
      for (let j = 0; j < imageUrls.length; j++) {
        await imageStore.addToArchive(archive, imageUrls[j], `sessions/${row.id}/${imageFilenames[j]}`);
      }
      archive.append(JSON.stringify({
        id: row.id, section: row.section, startTime: row.start_time, endTime: row.end_time,
        durationMinutes: row.duration_minutes, notes: row.notes, plansReference: row.plans_reference,
        imageFilenames, originalImageUrls: imageUrls,
      }, null, 2), { name: `sessions/${row.id}/session.json` });
      prog({ stage: 'sessions', label: 'Sessions', current: i + 1, total: rows.length });
    }
  }

  if (includeExpenses) {
    manifest.includes.expenses = true;
    const rows = await db.all('SELECT * FROM expenses WHERE tenant_id = ? ORDER BY date DESC', [tenantId]);
    prog({ stage: 'expenses', label: 'Expenses', current: 0, total: rows.length });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const receiptUrls = JSON.parse(row.receipt_urls || '[]');
      const receiptFilenames = receiptUrls.map(u => path.basename(u));
      for (let j = 0; j < receiptUrls.length; j++) {
        await receiptStore.addToArchive(archive, receiptUrls[j], `expenses/${row.id}/${receiptFilenames[j]}`);
      }
      archive.append(JSON.stringify({ ...expenseRow(row), receiptFilenames, originalReceiptUrls: receiptUrls }, null, 2), { name: `expenses/${row.id}/expense.json` });
      prog({ stage: 'expenses', label: 'Expenses', current: i + 1, total: rows.length });
    }
  }

  if (includeBlog) {
    manifest.includes.blog = true;
    const rows = await db.all('SELECT * FROM blog_posts WHERE tenant_id = ? ORDER BY published_at DESC', [tenantId]);
    prog({ stage: 'blog', label: 'Blog posts', current: 0, total: rows.length });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const imageUrls = JSON.parse(row.image_urls || '[]');
      const imageFilenames = imageUrls.map(u => path.basename(u));
      for (let j = 0; j < imageUrls.length; j++) {
        await imageStore.addToArchive(archive, imageUrls[j], `blog/${row.id}/${imageFilenames[j]}`);
      }
      // Extract images embedded in Quill HTML (stored URLs and inline base64 data URIs)
      const seenContent = new Set();
      const contentImageFilenames = [];
      const uniqueContentUrls = [];
      const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
      let m;
      while ((m = imgRe.exec(row.content || '')) !== null) {
        const src = m[1];
        if (seenContent.has(src)) continue;
        seenContent.add(src);
        if (src.startsWith('http')) {
          const archiveFilename = `content-${path.basename(src.split('?')[0])}`;
          await imageStore.addToArchive(archive, src, `blog/${row.id}/${archiveFilename}`);
          contentImageFilenames.push(archiveFilename);
          uniqueContentUrls.push(src);
        } else if (src.startsWith('/files/')) {
          // Local storage URLs produced by the upload API
          const archiveFilename = `content-${path.basename(src)}`;
          await imageStore.addToArchive(archive, src, `blog/${row.id}/${archiveFilename}`);
          contentImageFilenames.push(archiveFilename);
          uniqueContentUrls.push(src);
        } else if (src.startsWith('data:image/')) {
          const extMatch = src.match(/^data:image\/(\w+);base64,/);
          const ext = extMatch ? (extMatch[1] === 'jpeg' ? 'jpg' : extMatch[1]) : 'jpg';
          const b64 = src.split(',')[1];
          if (!b64) continue;
          const archiveFilename = `content-b64-${uuidv4()}.${ext}`;
          archive.append(Buffer.from(b64, 'base64'), { name: `blog/${row.id}/${archiveFilename}` });
          contentImageFilenames.push(archiveFilename);
          uniqueContentUrls.push(src);
        }
      }
      archive.append(JSON.stringify({
        id: row.id, title: row.title, content: row.content, section: row.section,
        plansSection: row.plans_section || '',
        imageFilenames, originalImageUrls: imageUrls,
        contentImageFilenames, originalContentImageUrls: uniqueContentUrls,
        publishedAt: row.published_at, updatedAt: row.updated_at,
      }, null, 2), { name: `blog/${row.id}/post.json` });
      prog({ stage: 'blog', label: 'Blog posts', current: i + 1, total: rows.length });
    }
  }

  if (includeSignOffs) {
    manifest.includes.signOffs = true;
    const rows = await db.all('SELECT * FROM sign_offs WHERE tenant_id = ? ORDER BY date DESC', [tenantId]);
    prog({ stage: 'signoffs', label: 'Sign-offs', current: 0, total: rows.length });
    const signOffs = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const sigFilename = r.signature_png ? `${r.id}.png` : null;
      if (r.signature_png && !r.signature_png.startsWith('data:')) {
        await signatureStore.addToArchive(archive, r.signature_png, `sign_offs/signatures/${sigFilename}`);
      } else if (r.signature_png?.startsWith('data:')) {
        // Legacy: base64 data URI still in DB (pre-migration)
        archive.append(Buffer.from(r.signature_png.replace(/^data:image\/\w+;base64,/, ''), 'base64'), { name: `sign_offs/signatures/${sigFilename}` });
      }
      signOffs.push({
        id: r.id, packageId: r.package_id, packageLabel: r.package_label, sectionId: r.section_id,
        date: r.date, inspectorName: r.inspector_name,
        inspectionCompleted: !!r.inspection_completed, noCriticalIssues: !!r.no_critical_issues,
        executionSatisfactory: !!r.execution_satisfactory, reworkNeeded: !!r.rework_needed,
        comments: r.comments, signatureFilename: sigFilename, createdAt: r.created_at,
      });
      prog({ stage: 'signoffs', label: 'Sign-offs', current: i + 1, total: rows.length });
    }
    archive.append(JSON.stringify(signOffs, null, 2), { name: 'sign_offs/signoffs.json' });

    // Also export new-style inspection sessions (same checkbox — same conceptual data).
    const iSessions = await db.all('SELECT * FROM inspection_sessions WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId]);
    if (iSessions.length > 0) {
      manifest.includes.inspectionSessions = true;
      const inspectionData = [];
      for (const s of iSessions) {
        const pkgRows = await db.all('SELECT * FROM inspection_packages WHERE session_id = ? AND tenant_id = ? ORDER BY sort_order', [s.id, tenantId]);
        const packages = [];
        for (const pkg of pkgRows) {
          const subRows = await db.all('SELECT * FROM inspection_sub_items WHERE package_id = ? AND tenant_id = ? ORDER BY sort_order', [pkg.id, tenantId]);
          packages.push({
            id: pkg.id, packageId: pkg.package_id, packageLabel: pkg.package_label,
            sectionId: pkg.section_id, outcome: pkg.outcome, notes: pkg.notes, sortOrder: pkg.sort_order,
            subItems: subRows.map(si => ({ id: si.id, label: si.label, outcome: si.outcome, notes: si.notes, sortOrder: si.sort_order })),
          });
        }
        inspectionData.push({
          id: s.id, sessionName: s.session_name, date: s.date,
          inspectorName: s.inspector_name, inspectorId: s.inspector_id,
          notes: s.notes, signaturePng: s.signature_png, createdAt: s.created_at,
          packages,
        });
      }
      archive.append(JSON.stringify(inspectionData, null, 2), { name: 'inspection_sessions/sessions.json' });
    }
  }

  if (includeInventory) {
    manifest.includes.inventory = true;
    const locations = await db.all('SELECT * FROM inventory_locations WHERE tenant_id = ? ORDER BY sort_order, name', [tenantId]);
    const parts     = await db.all('SELECT * FROM inventory_parts WHERE tenant_id = ? ORDER BY part_number', [tenantId]);
    const stock     = await db.all('SELECT * FROM inventory_stock WHERE tenant_id = ? ORDER BY id', [tenantId]);
    const checkSessions = await db.all('SELECT * FROM inventory_check_sessions WHERE tenant_id = ? ORDER BY id', [tenantId]);
    const checkItems    = await db.all('SELECT * FROM inventory_check_items WHERE tenant_id = ? ORDER BY id', [tenantId]);
    const budgets       = await db.all('SELECT * FROM expense_budgets WHERE tenant_id = ?', [tenantId]);
    prog({ stage: 'inventory', label: 'Inventory', current: 0, total: 1 });
    const inventoryData = {
      locations: locations.map(r => locationRow(r)),
      parts: parts.map(r => partRow(r)),
      stock: stock.map(r => ({
        id: Number(r.id), partId: Number(r.part_id), locationId: Number(r.location_id), quantity: r.quantity,
        unit: r.unit || 'pcs', status: r.status || 'in_stock', condition: r.condition || 'new',
        batch: r.batch || '', sourceKit: r.source_kit || '', mfgDate: r.mfg_date || '', notes: r.notes || '', updatedAt: r.updated_at,
      })),
      checkSessions: checkSessions.map(r => ({
        id: Number(r.id), aircraftType: r.aircraft_type, kitId: r.kit_id, kitLabel: r.kit_label || '',
        status: r.status, totalItems: r.total_items, verifiedItems: r.verified_items, missingItems: r.missing_items,
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
      checkItems: checkItems.map(r => ({
        id: Number(r.id), sessionId: Number(r.session_id), partNumber: r.part_number,
        nomenclature: r.nomenclature || '', subKit: r.sub_kit || '', bag: r.bag || '',
        qtyExpected: r.qty_expected, qtyFound: r.qty_found, unit: r.unit || 'pcs',
        status: r.status, notes: r.notes || '', scannedAt: r.scanned_at,
      })),
      expenseBudgets: budgets.map(r => ({ category: r.category, budgetAmount: r.budget_amount })),
    };
    archive.append(JSON.stringify(inventoryData, null, 2), { name: 'inventory/inventory.json' });
    prog({ stage: 'inventory', label: 'Inventory', current: 1, total: 1 });
  }

  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  await archive.finalize();
}

function parseExportQuery(q) {
  return {
    includeSettings:          q.settings          !== '0',
    includeSessions:          q.sessions          !== '0',
    includeExpenses:          q.expenses          !== '0',
    includeBlog:              q.blog              !== '0',
    includeWorkPackages:      q.workPackages      !== '0',
    includeWorkPackageStatus: q.workPackageStatus !== '0',
    includeSignOffs:          q.signOffs          !== '0',
    includeInventory:         q.inventory         !== '0',
  };
}

// Direct download (legacy / non-SSE clients)
app.get('/api/export', requireAuth, async (req, res) => {
  req.socket.setTimeout(0);
  try {
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="benchlog-backup-${dateStr}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { console.error('[export] archive error:', err.message); res.end(); });
    archive.pipe(res);
    await buildExport(archive, req.db, req.tenantId, parseExportQuery(req.query), null);
  } catch (err) {
    console.error('[export]', err.message);
    if (!res.headersSent) serverError(res, err);
  }
});

// Temp export job storage (token → { filePath, filename, created })
const exportJobs = new Map();
const _exportCleanup = setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [token, job] of exportJobs) {
    if (job.created < cutoff) {
      try { fs.unlinkSync(job.filePath); } catch {}
      exportJobs.delete(token);
    }
  }
}, 5 * 60 * 1000); _exportCleanup.unref();

// SSE progress stream — builds ZIP to temp file, streams progress events
app.get('/api/export/stream', requireAuth, async (req, res) => {
  req.socket.setTimeout(0);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = data => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };
  // Keepalive heartbeat so the connection stays alive during long R2 fetches
  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 15000);

  const tmpFile = path.join(os.tmpdir(), `benchlog-export-${uuidv4()}.zip`);
  try {
    send({ type: 'start' });
    const archive = archiver('zip', { zlib: { level: 6 } });
    const output  = fs.createWriteStream(tmpFile);
    archive.pipe(output);
    const outputClosed = new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });
    await buildExport(archive, req.db, req.tenantId, parseExportQuery(req.query),
      ev => send({ type: 'progress', ...ev }));
    await outputClosed;

    const token    = uuidv4();
    const dateStr  = new Date().toISOString().slice(0, 10);
    const filename = `benchlog-backup-${dateStr}.zip`;
    exportJobs.set(token, { filePath: tmpFile, filename, created: Date.now(), tenantId: req.tenantId });
    send({ type: 'done', token, filename });
  } catch (err) {
    console.error('[export/stream]', err.message);
    send({ type: 'error', message: IS_PRODUCTION ? 'Export failed' : (err.message || 'Export failed') });
    try { fs.unlinkSync(tmpFile); } catch {}
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// Download the pre-built ZIP produced by /api/export/stream
app.get('/api/export/download', requireAuth, (req, res) => {
  const job = exportJobs.get(String(req.query.token));
  if (!job || !fs.existsSync(job.filePath)) return res.status(404).json({ error: 'Export expired or not found' });
  if (job.tenantId && job.tenantId !== req.tenantId) return res.status(403).json({ error: 'Forbidden' });
  // Delete token immediately to prevent reuse (single-use download)
  exportJobs.delete(String(req.query.token));
  res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
  res.setHeader('Content-Type', 'application/zip');
  const stream = fs.createReadStream(job.filePath);
  stream.pipe(res);
  const cleanup = () => { try { fs.unlinkSync(job.filePath); } catch {} };
  stream.on('end', cleanup);
  stream.on('error', () => { res.end(); cleanup(); });
});

async function applySettings(db, settings) {
  if (settings.general) await setSetting(db, 'general', settings.general);
  if (settings.mqtt) {
    const cur = await getMqttSettings(db);
    const m   = { ...settings.mqtt };
    if (!m.password) m.password = cur.password;
    await setSetting(db, 'mqtt', m);
  }
  if (settings.sections)        await setSetting(db, 'sections',           settings.sections);
  if (settings.flowchartStatus) await setSetting(db, 'flowchart_status',   settings.flowchartStatus);
  if (settings.flowchartPackages) await setSetting(db, 'flowchart_packages', settings.flowchartPackages);
  await connectMqtt(db);
}

async function applyImportData(db, tenantId, data, results, tenantSlug = null) {
  if (data.settings)          { await applySettings(db, data.settings); results.settingsImported = true; }
  if (data.workPackages)      { await setSetting(db, 'flowchart_packages', data.workPackages); results.workPackagesImported = true; }
  if (data.workPackageStatus) { await setSetting(db, 'flowchart_status',   data.workPackageStatus); }

  for (const session of (data.sessions || [])) {
    const existing = await db.get('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?', [session.id, tenantId]);
    const urls = JSON.stringify(session.imageUrls || []);
    if (existing) {
      await db.run(
        `UPDATE sessions SET section=?,start_time=?,end_time=?,duration_minutes=?,notes=?,plans_reference=?,image_urls=? WHERE id=? AND tenant_id=?`,
        [session.section, session.startTime, session.endTime, session.durationMinutes, session.notes||'', session.plansReference||null, urls, session.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO sessions(id,tenant_id,section,start_time,end_time,duration_minutes,notes,plans_reference,image_urls) VALUES(?,?,?,?,?,?,?,?,?)`,
        [session.id, tenantId, session.section, session.startTime, session.endTime, session.durationMinutes, session.notes||'', session.plansReference||null, urls]
      );
    }
    results.sessionsImported++;
  }

  for (const exp of (data.expenses || [])) {
    const existing = await db.get('SELECT id FROM expenses WHERE id = ? AND tenant_id = ?', [exp.id, tenantId]);
    const rUrls = JSON.stringify(exp.receiptUrls || []);
    const tags  = JSON.stringify(exp.tags || []);
    if (existing) {
      await db.run(
        `UPDATE expenses SET date=?,amount=?,currency=?,exchange_rate=?,amount_home=?,description=?,vendor=?,category=?,assembly_section=?,part_number=?,is_certification_relevant=?,receipt_urls=?,notes=?,tags=?,link=?,updated_at=? WHERE id=? AND tenant_id=?`,
        [exp.date, exp.amount, exp.currency, exp.exchangeRate, exp.amountHome, exp.description, exp.vendor||'', exp.category, exp.assemblySection||'', exp.partNumber||'', exp.isCertificationRelevant?1:0, rUrls, exp.notes||'', tags, exp.link||'', exp.updatedAt, exp.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO expenses(id,tenant_id,date,amount,currency,exchange_rate,amount_home,description,vendor,category,assembly_section,part_number,is_certification_relevant,receipt_urls,notes,tags,link,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [exp.id, tenantId, exp.date, exp.amount, exp.currency, exp.exchangeRate, exp.amountHome, exp.description, exp.vendor||'', exp.category, exp.assemblySection||'', exp.partNumber||'', exp.isCertificationRelevant?1:0, rUrls, exp.notes||'', tags, exp.link||'', exp.createdAt, exp.updatedAt]
      );
    }
    results.expensesImported++;
  }

  for (const post of (data.blogPosts || [])) {
    const existing = await db.get('SELECT id FROM blog_posts WHERE id = ? AND tenant_id = ?', [post.id, tenantId]);
    const iUrls = JSON.stringify(post.imageUrls || []);
    if (existing) {
      await db.run(
        `UPDATE blog_posts SET title=?,content=?,section=?,plans_section=?,image_urls=?,updated_at=? WHERE id=? AND tenant_id=?`,
        [post.title, post.content, post.section||'', post.plansSection||'', iUrls, post.updatedAt, post.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO blog_posts(id,tenant_id,title,content,section,plans_section,image_urls,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,
        [post.id, tenantId, post.title, post.content, post.section||'', post.plansSection||'', iUrls, post.publishedAt, post.updatedAt]
      );
    }
    results.blogPostsImported++;
  }

  for (const s of (data.signOffs || [])) {
    let signatureValue = s.signaturePng || null;
    if (signatureValue?.startsWith('data:')) {
      const buf = Buffer.from(signatureValue.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      signatureValue = await signatureStore.save(`${s.id}.png`, buf, 'image/png', tenantSlug);
    }
    const existing = await db.get('SELECT id FROM sign_offs WHERE id = ? AND tenant_id = ?', [s.id, tenantId]);
    if (existing) {
      await db.run(
        `UPDATE sign_offs SET package_id=?,package_label=?,section_id=?,date=?,inspector_name=?,inspection_completed=?,no_critical_issues=?,execution_satisfactory=?,rework_needed=?,comments=?,signature_png=? WHERE id=? AND tenant_id=?`,
        [s.packageId, s.packageLabel, s.sectionId||'', s.date, s.inspectorName||'', s.inspectionCompleted?1:0, s.noCriticalIssues?1:0, s.executionSatisfactory?1:0, s.reworkNeeded?1:0, s.comments||'', signatureValue, s.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO sign_offs(id,tenant_id,package_id,package_label,section_id,date,inspector_name,inspection_completed,no_critical_issues,execution_satisfactory,rework_needed,comments,signature_png,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [s.id, tenantId, s.packageId, s.packageLabel, s.sectionId||'', s.date, s.inspectorName||'', s.inspectionCompleted?1:0, s.noCriticalIssues?1:0, s.executionSatisfactory?1:0, s.reworkNeeded?1:0, s.comments||'', signatureValue, s.createdAt]
      );
    }
    results.signOffsImported++;
  }

  for (const s of (data.inspectionSessions || [])) {
    const existing = await db.get('SELECT id FROM inspection_sessions WHERE id = ? AND tenant_id = ?', [s.id, tenantId]);
    if (existing) {
      await db.run(
        `UPDATE inspection_sessions SET session_name=?,date=?,inspector_name=?,inspector_id=?,notes=?,signature_png=? WHERE id=? AND tenant_id=?`,
        [s.sessionName, s.date, s.inspectorName||'', s.inspectorId||'', s.notes||'', s.signaturePng||'', s.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO inspection_sessions(id,tenant_id,session_name,date,inspector_name,inspector_id,notes,signature_png,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
        [s.id, tenantId, s.sessionName, s.date, s.inspectorName||'', s.inspectorId||'', s.notes||'', s.signaturePng||'', s.createdAt]
      );
    }
    await db.run('DELETE FROM inspection_sub_items WHERE tenant_id = ? AND package_id IN (SELECT id FROM inspection_packages WHERE session_id = ? AND tenant_id = ?)', [tenantId, s.id, tenantId]);
    await db.run('DELETE FROM inspection_packages WHERE session_id = ? AND tenant_id = ?', [s.id, tenantId]);
    for (const pkg of (s.packages || [])) {
      await db.run(
        `INSERT INTO inspection_packages(id,session_id,tenant_id,package_id,package_label,section_id,outcome,notes,sort_order) VALUES(?,?,?,?,?,?,?,?,?)`,
        [pkg.id, s.id, tenantId, pkg.packageId, pkg.packageLabel, pkg.sectionId||'', pkg.outcome||'ok', pkg.notes||'', pkg.sortOrder||0]
      );
      for (const si of (pkg.subItems || [])) {
        await db.run(
          `INSERT INTO inspection_sub_items(id,package_id,tenant_id,label,outcome,notes,sort_order) VALUES(?,?,?,?,?,?,?)`,
          [si.id, pkg.id, tenantId, si.label, si.outcome||'ok', si.notes||'', si.sortOrder||0]
        );
      }
    }
    results.inspectionSessionsImported = (results.inspectionSessionsImported || 0) + 1;
  }

  // Inventory data (locations, parts, stock, check sessions/items, expense budgets)
  if (data.inventory) await applyInventoryImport(db, tenantId, data.inventory, results);

  publishMqttStats(db);
}

async function applyInventoryImport(db, tenantId, inv, results) {
  // Disable foreign key checks during import to avoid ordering issues with remapped IDs
  try { await db.run('PRAGMA foreign_keys = OFF'); } catch { /* Postgres doesn't use PRAGMAs */ }
  try { // ensure foreign_keys re-enabled even on error

  // ID remapping: old export IDs → new auto-increment IDs
  const locIdMap = new Map();
  const partIdMap = new Map();
  const sessionIdMap = new Map();

  // Sort locations so parents come before children
  const sortedLocs = [...(inv.locations || [])].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
  for (const loc of sortedLocs) {
    const remappedParent = loc.parentId ? (locIdMap.get(loc.parentId) || loc.parentId) : null;
    let existing = await db.get('SELECT id FROM inventory_locations WHERE id = ? AND tenant_id = ?', [loc.id, tenantId]);
    if (!existing) {
      // Match by name + parent to handle same-named locations under different parents
      existing = remappedParent
        ? await db.get('SELECT id FROM inventory_locations WHERE name = ? AND parent_id = ? AND tenant_id = ?', [loc.name, remappedParent, tenantId])
        : await db.get('SELECT id FROM inventory_locations WHERE name = ? AND parent_id IS NULL AND tenant_id = ?', [loc.name, tenantId]);
    }
    if (existing) {
      await db.run(
        `UPDATE inventory_locations SET name=?,description=?,parent_id=?,sort_order=? WHERE id=? AND tenant_id=?`,
        [loc.name, loc.description||'', remappedParent, loc.sortOrder||0, existing.id, tenantId]
      );
      locIdMap.set(loc.id, existing.id);
    } else {
      const r = await db.run(
        `INSERT INTO inventory_locations(tenant_id,name,description,parent_id,sort_order,created_at) VALUES(?,?,?,?,?,?)`,
        [tenantId, loc.name, loc.description||'', remappedParent, loc.sortOrder||0, loc.createdAt||new Date().toISOString()]
      );
      let newId = r.lastID;
      if (!newId) {
        const row = remappedParent
          ? await db.get('SELECT id FROM inventory_locations WHERE tenant_id = ? AND name = ? AND parent_id = ? ORDER BY id DESC LIMIT 1', [tenantId, loc.name, remappedParent])
          : await db.get('SELECT id FROM inventory_locations WHERE tenant_id = ? AND name = ? AND parent_id IS NULL ORDER BY id DESC LIMIT 1', [tenantId, loc.name]);
        newId = row?.id;
      }
      locIdMap.set(loc.id, newId || loc.id);
    }
    results.inventoryImported = (results.inventoryImported || 0) + 1;
  }

  for (const part of (inv.parts || [])) {
    let existing = await db.get('SELECT id FROM inventory_parts WHERE id = ? AND tenant_id = ?', [part.id, tenantId]);
    if (!existing) existing = await db.get('SELECT id FROM inventory_parts WHERE part_number = ? AND tenant_id = ?', [part.partNumber, tenantId]);
    if (existing) {
      await db.run(
        `UPDATE inventory_parts SET part_number=?,name=?,manufacturer=?,kit=?,sub_kit=?,category=?,bag=?,notes=? WHERE id=? AND tenant_id=?`,
        [part.partNumber, part.name, part.manufacturer||'', part.kit||'', part.subKit||'', part.category||'other', part.bag||'', part.notes||'', existing.id, tenantId]
      );
      partIdMap.set(part.id, existing.id);
    } else {
      const r = await db.run(
        `INSERT INTO inventory_parts(tenant_id,part_number,name,manufacturer,kit,sub_kit,category,bag,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [tenantId, part.partNumber, part.name, part.manufacturer||'', part.kit||'', part.subKit||'', part.category||'other', part.bag||'', part.notes||'', part.createdAt||new Date().toISOString()]
      );
      let newId = r.lastID;
      if (!newId) {
        const row = await db.get('SELECT id FROM inventory_parts WHERE tenant_id = ? AND part_number = ? ORDER BY id DESC LIMIT 1', [tenantId, part.partNumber]);
        newId = row?.id;
      }
      partIdMap.set(part.id, newId || part.id);
    }
    results.inventoryImported = (results.inventoryImported || 0) + 1;
  }

  for (const s of (inv.stock || [])) {
    const newPartId = partIdMap.get(s.partId) || s.partId;
    const newLocId  = locIdMap.get(s.locationId) || s.locationId;
    let existing = await db.get('SELECT id FROM inventory_stock WHERE id = ? AND tenant_id = ?', [s.id, tenantId]);
    if (!existing) existing = await db.get('SELECT id FROM inventory_stock WHERE part_id = ? AND location_id = ? AND tenant_id = ?', [newPartId, newLocId, tenantId]);
    if (existing) {
      await db.run(
        `UPDATE inventory_stock SET part_id=?,location_id=?,quantity=?,unit=?,status=?,condition=?,batch=?,source_kit=?,mfg_date=?,notes=?,updated_at=? WHERE id=? AND tenant_id=?`,
        [newPartId, newLocId, s.quantity, s.unit||'pcs', s.status||'in_stock', s.condition||'new', s.batch||'', s.sourceKit||'', s.mfgDate||'', s.notes||'', s.updatedAt, existing.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO inventory_stock(tenant_id,part_id,location_id,quantity,unit,status,condition,batch,source_kit,mfg_date,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tenantId, newPartId, newLocId, s.quantity, s.unit||'pcs', s.status||'in_stock', s.condition||'new', s.batch||'', s.sourceKit||'', s.mfgDate||'', s.notes||'', s.updatedAt||new Date().toISOString()]
      );
    }
    results.inventoryImported = (results.inventoryImported || 0) + 1;
  }

  for (const cs of (inv.checkSessions || [])) {
    // Match by ID first, then by kit_id to avoid duplicates across backends
    let existing = await db.get('SELECT id FROM inventory_check_sessions WHERE id = ? AND tenant_id = ?', [cs.id, tenantId]);
    if (!existing) existing = await db.get('SELECT id FROM inventory_check_sessions WHERE kit_id = ? AND tenant_id = ?', [cs.kitId, tenantId]);
    if (existing) {
      await db.run(
        `UPDATE inventory_check_sessions SET aircraft_type=?,kit_id=?,kit_label=?,status=?,total_items=?,verified_items=?,missing_items=?,updated_at=? WHERE id=? AND tenant_id=?`,
        [cs.aircraftType, cs.kitId, cs.kitLabel||'', cs.status, cs.totalItems, cs.verifiedItems, cs.missingItems, cs.updatedAt, existing.id, tenantId]
      );
      sessionIdMap.set(cs.id, existing.id);
    } else {
      const r = await db.run(
        `INSERT INTO inventory_check_sessions(tenant_id,aircraft_type,kit_id,kit_label,status,total_items,verified_items,missing_items,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [tenantId, cs.aircraftType, cs.kitId, cs.kitLabel||'', cs.status, cs.totalItems, cs.verifiedItems, cs.missingItems, cs.createdAt, cs.updatedAt]
      );
      let newId = r.lastID;
      if (!newId) {
        const row = await db.get('SELECT id FROM inventory_check_sessions WHERE tenant_id = ? AND kit_id = ? ORDER BY id DESC LIMIT 1', [tenantId, cs.kitId]);
        newId = row?.id;
      }
      sessionIdMap.set(cs.id, newId || cs.id);
    }
    results.inventoryImported = (results.inventoryImported || 0) + 1;
  }

  for (const ci of (inv.checkItems || [])) {
    const newSessionId = sessionIdMap.get(ci.sessionId);
    if (!newSessionId) continue; // skip items whose parent session wasn't imported
    let existing = await db.get('SELECT id FROM inventory_check_items WHERE id = ? AND tenant_id = ?', [ci.id, tenantId]);
    if (!existing) existing = await db.get('SELECT id FROM inventory_check_items WHERE session_id = ? AND part_number = ? AND tenant_id = ?', [newSessionId, ci.partNumber, tenantId]);
    if (existing) {
      await db.run(
        `UPDATE inventory_check_items SET session_id=?,part_number=?,nomenclature=?,sub_kit=?,bag=?,qty_expected=?,qty_found=?,unit=?,status=?,notes=?,scanned_at=? WHERE id=? AND tenant_id=?`,
        [newSessionId, ci.partNumber, ci.nomenclature||'', ci.subKit||'', ci.bag||'', ci.qtyExpected, ci.qtyFound, ci.unit||'pcs', ci.status, ci.notes||'', ci.scannedAt, existing.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO inventory_check_items(tenant_id,session_id,part_number,nomenclature,sub_kit,bag,qty_expected,qty_found,unit,status,notes,scanned_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tenantId, newSessionId, ci.partNumber, ci.nomenclature||'', ci.subKit||'', ci.bag||'', ci.qtyExpected, ci.qtyFound, ci.unit||'pcs', ci.status, ci.notes||'', ci.scannedAt]
      );
    }
    results.inventoryImported = (results.inventoryImported || 0) + 1;
  }

  for (const b of (inv.expenseBudgets || [])) {
    await db.run(
      `INSERT OR REPLACE INTO expense_budgets(category,tenant_id,budget_amount) VALUES(?,?,?)`,
      [b.category, tenantId, b.budgetAmount]
    );
    results.inventoryImported = (results.inventoryImported || 0) + 1;
  }

  } finally {
    // Re-enable foreign key checks
    try { await db.run('PRAGMA foreign_keys = ON'); } catch { /* Postgres doesn't use PRAGMAs */ }
  }
}

async function applyNewImportFormat(db, tenantId, extractDir, results, tenantSlug = null) {
  const urlRemap   = new Map(); // oldUrl/filename → newUrl (for remapping blog content)
  const THUMB_WIDTH = 400;

  // Settings
  const settingsPath = path.join(extractDir, 'settings', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    await applySettings(db, settings);
    results.settingsImported = true;
  }

  // Work packages
  const wpPath = path.join(extractDir, 'work_packages', 'packages.json');
  if (fs.existsSync(wpPath)) {
    const wpData = JSON.parse(fs.readFileSync(wpPath, 'utf8'));
    if (wpData.packages) await setSetting(db, 'flowchart_packages', wpData.packages);
    if (wpData.status)   await setSetting(db, 'flowchart_status',   wpData.status);
    results.workPackagesImported = true;
  }

  // Sessions
  const sessionsDir = path.join(extractDir, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    for (const sessionId of fs.readdirSync(sessionsDir)) {
      const sessionDir = path.join(sessionsDir, sessionId);
      if (!fs.statSync(sessionDir).isDirectory()) continue;
      const sessionJsonPath = path.join(sessionDir, 'session.json');
      if (!fs.existsSync(sessionJsonPath)) continue;

      const session  = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
      const origUrls = session.originalImageUrls || [];
      const imageUrls = [];

      for (let i = 0; i < (session.imageFilenames || []).length; i++) {
        const filename = session.imageFilenames[i];
        const imgPath  = path.join(sessionDir, filename);
        if (!fs.existsSync(imgPath)) continue;
        const buf    = fs.readFileSync(imgPath);
        const newUrl = await imageStore.save(filename, buf, 'image/jpeg', tenantSlug);
        const thumbBuf = await sharp(buf).resize(THUMB_WIDTH, null, { withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
        await imageStore.save(thumbFilename(filename), thumbBuf, 'image/jpeg', tenantSlug);
        imageUrls.push(newUrl);
        if (origUrls[i]) urlRemap.set(origUrls[i], newUrl);
        urlRemap.set(filename, newUrl);
        results.filesImported++;
      }

      const urls = JSON.stringify(imageUrls);
      const existing = await db.get('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?', [session.id, tenantId]);
      if (existing) {
        await db.run(
          `UPDATE sessions SET section=?,start_time=?,end_time=?,duration_minutes=?,notes=?,plans_reference=?,image_urls=? WHERE id=? AND tenant_id=?`,
          [session.section, session.startTime, session.endTime, session.durationMinutes, session.notes||'', session.plansReference||null, urls, session.id, tenantId]
        );
      } else {
        await db.run(
          `INSERT INTO sessions(id,tenant_id,section,start_time,end_time,duration_minutes,notes,plans_reference,image_urls) VALUES(?,?,?,?,?,?,?,?,?)`,
          [session.id, tenantId, session.section, session.startTime, session.endTime, session.durationMinutes, session.notes||'', session.plansReference||null, urls]
        );
      }
      results.sessionsImported++;
    }
  }

  // Expenses
  const expensesDir = path.join(extractDir, 'expenses');
  if (fs.existsSync(expensesDir)) {
    for (const expId of fs.readdirSync(expensesDir)) {
      const expDir = path.join(expensesDir, expId);
      if (!fs.statSync(expDir).isDirectory()) continue;
      const expJsonPath = path.join(expDir, 'expense.json');
      if (!fs.existsSync(expJsonPath)) continue;

      const exp      = JSON.parse(fs.readFileSync(expJsonPath, 'utf8'));
      const origUrls = exp.originalReceiptUrls || [];
      const receiptUrls = [];

      for (let i = 0; i < (exp.receiptFilenames || []).length; i++) {
        const filename = exp.receiptFilenames[i];
        const imgPath  = path.join(expDir, filename);
        if (!fs.existsSync(imgPath)) continue;
        const buf    = fs.readFileSync(imgPath);
        const newUrl = await receiptStore.save(filename, buf, 'image/jpeg', tenantSlug);
        receiptUrls.push(newUrl);
        if (origUrls[i]) urlRemap.set(origUrls[i], newUrl);
        results.filesImported++;
      }

      const rUrls = JSON.stringify(receiptUrls);
      const tags  = JSON.stringify(exp.tags || []);
      const existing = await db.get('SELECT id FROM expenses WHERE id = ? AND tenant_id = ?', [exp.id, tenantId]);
      if (existing) {
        await db.run(
          `UPDATE expenses SET date=?,amount=?,currency=?,exchange_rate=?,amount_home=?,description=?,vendor=?,category=?,assembly_section=?,part_number=?,is_certification_relevant=?,receipt_urls=?,notes=?,tags=?,link=?,updated_at=? WHERE id=? AND tenant_id=?`,
          [exp.date, exp.amount, exp.currency, exp.exchangeRate, exp.amountHome, exp.description, exp.vendor||'', exp.category, exp.assemblySection||'', exp.partNumber||'', exp.isCertificationRelevant?1:0, rUrls, exp.notes||'', tags, exp.link||'', exp.updatedAt, exp.id, tenantId]
        );
      } else {
        await db.run(
          `INSERT INTO expenses(id,tenant_id,date,amount,currency,exchange_rate,amount_home,description,vendor,category,assembly_section,part_number,is_certification_relevant,receipt_urls,notes,tags,link,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [exp.id, tenantId, exp.date, exp.amount, exp.currency, exp.exchangeRate, exp.amountHome, exp.description, exp.vendor||'', exp.category, exp.assemblySection||'', exp.partNumber||'', exp.isCertificationRelevant?1:0, rUrls, exp.notes||'', tags, exp.link||'', exp.createdAt, exp.updatedAt]
        );
      }
      results.expensesImported++;
    }
  }

  // Blog posts
  const blogDir = path.join(extractDir, 'blog');
  if (fs.existsSync(blogDir)) {
    for (const postId of fs.readdirSync(blogDir)) {
      const postDir = path.join(blogDir, postId);
      if (!fs.statSync(postDir).isDirectory()) continue;
      const postJsonPath = path.join(postDir, 'post.json');
      if (!fs.existsSync(postJsonPath)) continue;

      const post     = JSON.parse(fs.readFileSync(postJsonPath, 'utf8'));
      const origUrls = post.originalImageUrls || [];
      const imageUrls = [];

      for (let i = 0; i < (post.imageFilenames || []).length; i++) {
        const filename = post.imageFilenames[i];
        const imgPath  = path.join(postDir, filename);
        if (!fs.existsSync(imgPath)) continue;
        const buf    = fs.readFileSync(imgPath);
        const newUrl = await imageStore.save(filename, buf, 'image/jpeg', tenantSlug);
        const thumbBuf = await sharp(buf).resize(THUMB_WIDTH, null, { withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
        await imageStore.save(thumbFilename(filename), thumbBuf, 'image/jpeg', tenantSlug);
        imageUrls.push(newUrl);
        if (origUrls[i]) urlRemap.set(origUrls[i], newUrl);
        urlRemap.set(filename, newUrl);
        results.filesImported++;
      }

      // Re-upload images embedded in Quill HTML content
      for (let i = 0; i < (post.contentImageFilenames || []).length; i++) {
        const filename = post.contentImageFilenames[i];
        const origUrl  = (post.originalContentImageUrls || [])[i];
        const imgPath  = path.join(postDir, filename);
        if (!fs.existsSync(imgPath)) continue;
        const buf    = fs.readFileSync(imgPath);
        const newUrl = await imageStore.save(filename, buf, 'image/jpeg', tenantSlug);
        const thumbBuf = await sharp(buf).resize(THUMB_WIDTH, null, { withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
        await imageStore.save(thumbFilename(filename), thumbBuf, 'image/jpeg', tenantSlug);
        if (origUrl) urlRemap.set(origUrl, newUrl);
        urlRemap.set(filename, newUrl);
        results.filesImported++;
      }

      // Remap any embedded image URLs/data-URIs in the post content
      let content = post.content || '';
      for (const [oldUrl, newUrl] of urlRemap) {
        if (oldUrl.startsWith('http') || oldUrl.startsWith('data:') || oldUrl.startsWith('/files/')) {
          content = content.split(oldUrl).join(newUrl);
        }
      }

      const iUrls = JSON.stringify(imageUrls);
      const existing = await db.get('SELECT id FROM blog_posts WHERE id = ? AND tenant_id = ?', [post.id, tenantId]);
      if (existing) {
        await db.run(
          `UPDATE blog_posts SET title=?,content=?,section=?,plans_section=?,image_urls=?,updated_at=? WHERE id=? AND tenant_id=?`,
          [post.title, content, post.section||'', post.plansSection||'', iUrls, post.updatedAt, post.id, tenantId]
        );
      } else {
        await db.run(
          `INSERT INTO blog_posts(id,tenant_id,title,content,section,plans_section,image_urls,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,
          [post.id, tenantId, post.title, content, post.section||'', post.plansSection||'', iUrls, post.publishedAt, post.updatedAt]
        );
      }
      results.blogPostsImported++;
    }
  }

  // Sign-offs
  const signOffsPath = path.join(extractDir, 'sign_offs', 'signoffs.json');
  if (fs.existsSync(signOffsPath)) {
    const signOffs = JSON.parse(fs.readFileSync(signOffsPath, 'utf8'));
    for (const s of signOffs) {
      let signatureValue = s.signaturePng || null; // legacy: base64 blob
      if (s.signatureFilename) {
        // New format: signature archived as a file
        const sigPath = path.join(extractDir, 'sign_offs', 'signatures', s.signatureFilename);
        if (fs.existsSync(sigPath)) {
          const buf = fs.readFileSync(sigPath);
          signatureValue = await signatureStore.save(s.signatureFilename, buf, 'image/png', tenantSlug);
          results.filesImported++;
        }
      } else if (signatureValue?.startsWith('data:')) {
        // Legacy base64 from old export — save as file
        const buf = Buffer.from(signatureValue.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        signatureValue = await signatureStore.save(`${s.id}.png`, buf, 'image/png', tenantSlug);
        results.filesImported++;
      }
      const existing = await db.get('SELECT id FROM sign_offs WHERE id = ? AND tenant_id = ?', [s.id, tenantId]);
      if (existing) {
        await db.run(
          `UPDATE sign_offs SET package_id=?,package_label=?,section_id=?,date=?,inspector_name=?,inspection_completed=?,no_critical_issues=?,execution_satisfactory=?,rework_needed=?,comments=?,signature_png=? WHERE id=? AND tenant_id=?`,
          [s.packageId, s.packageLabel, s.sectionId||'', s.date, s.inspectorName||'', s.inspectionCompleted?1:0, s.noCriticalIssues?1:0, s.executionSatisfactory?1:0, s.reworkNeeded?1:0, s.comments||'', signatureValue, s.id, tenantId]
        );
      } else {
        await db.run(
          `INSERT INTO sign_offs(id,tenant_id,package_id,package_label,section_id,date,inspector_name,inspection_completed,no_critical_issues,execution_satisfactory,rework_needed,comments,signature_png,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [s.id, tenantId, s.packageId, s.packageLabel, s.sectionId||'', s.date, s.inspectorName||'', s.inspectionCompleted?1:0, s.noCriticalIssues?1:0, s.executionSatisfactory?1:0, s.reworkNeeded?1:0, s.comments||'', signatureValue, s.createdAt]
        );
      }
      results.signOffsImported++;
    }
  }

  // Inspection sessions
  const inspectionSessionsPath = path.join(extractDir, 'inspection_sessions', 'sessions.json');
  if (fs.existsSync(inspectionSessionsPath)) {
    const inspSessions = JSON.parse(fs.readFileSync(inspectionSessionsPath, 'utf8'));
    for (const s of inspSessions) {
      const existing = await db.get('SELECT id FROM inspection_sessions WHERE id = ? AND tenant_id = ?', [s.id, tenantId]);
      if (existing) {
        await db.run(
          `UPDATE inspection_sessions SET session_name=?,date=?,inspector_name=?,inspector_id=?,notes=?,signature_png=? WHERE id=? AND tenant_id=?`,
          [s.sessionName, s.date, s.inspectorName||'', s.inspectorId||'', s.notes||'', s.signaturePng||'', s.id, tenantId]
        );
      } else {
        await db.run(
          `INSERT INTO inspection_sessions(id,tenant_id,session_name,date,inspector_name,inspector_id,notes,signature_png,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
          [s.id, tenantId, s.sessionName, s.date, s.inspectorName||'', s.inspectorId||'', s.notes||'', s.signaturePng||'', s.createdAt]
        );
      }
      await db.run('DELETE FROM inspection_sub_items WHERE tenant_id = ? AND package_id IN (SELECT id FROM inspection_packages WHERE session_id = ? AND tenant_id = ?)', [tenantId, s.id, tenantId]);
      await db.run('DELETE FROM inspection_packages WHERE session_id = ? AND tenant_id = ?', [s.id, tenantId]);
      for (const pkg of (s.packages || [])) {
        await db.run(
          `INSERT INTO inspection_packages(id,session_id,tenant_id,package_id,package_label,section_id,outcome,notes,sort_order) VALUES(?,?,?,?,?,?,?,?,?)`,
          [pkg.id, s.id, tenantId, pkg.packageId, pkg.packageLabel, pkg.sectionId||'', pkg.outcome||'ok', pkg.notes||'', pkg.sortOrder||0]
        );
        for (const si of (pkg.subItems || [])) {
          await db.run(
            `INSERT INTO inspection_sub_items(id,package_id,tenant_id,label,outcome,notes,sort_order) VALUES(?,?,?,?,?,?,?)`,
            [si.id, pkg.id, tenantId, si.label, si.outcome||'ok', si.notes||'', si.sortOrder||0]
          );
        }
      }
      results.inspectionSessionsImported = (results.inspectionSessionsImported || 0) + 1;
    }
  }

  // Inventory
  const inventoryPath = path.join(extractDir, 'inventory', 'inventory.json');
  if (fs.existsSync(inventoryPath)) {
    const inv = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    await applyInventoryImport(db, tenantId, inv, results);
  }

  publishMqttStats(db);
}

app.post('/api/import', requireAuth, backupUpload.single('backup'), async (req, res) => {
  const results = { settingsImported: false, sessionsImported: 0, expensesImported: 0, blogPostsImported: 0, filesImported: 0, workPackagesImported: false, signOffsImported: 0, inspectionSessionsImported: 0, inventoryImported: 0 };
  if (!req.file) {
    try {
      const data = req.body;
      if (!data || !data.version) return res.status(400).json({ error: 'No backup file provided' });
      await applyImportData(req.db, req.tenantId, data, results, req.user?.slug);
      return res.json({ ok: true, ...results });
    } catch (err) {
      return serverError(res, err);
    }
  }
  const zipPath    = req.file.path;
  const extractDir = path.join(DATA_DIR, `tmp_extract_${Date.now()}`);
  try {
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();

    const manifestPath = path.join(extractDir, 'manifest.json');
    const dataJsonPath = path.join(extractDir, 'data.json');

    if (fs.existsSync(manifestPath)) {
      // New format (v3+): structured folder layout with per-item subfolders
      await applyNewImportFormat(req.db, req.tenantId, extractDir, results, req.user?.slug);
    } else if (fs.existsSync(dataJsonPath)) {
      // Legacy format (v1/v2): single data.json + uploads/ folder
      const data = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
      const sessDir = path.join(extractDir, 'uploads', 'sessions');
      if (fs.existsSync(sessDir)) {
        for (const file of fs.readdirSync(sessDir)) {
          const safeName = path.basename(file); // Prevent path traversal
          const dst = path.join(UPLOADS_DIR, safeName);
          const src = path.join(sessDir, safeName);
          if (path.resolve(src).startsWith(path.resolve(sessDir)) && !fs.existsSync(dst)) {
            fs.copyFileSync(src, dst); results.filesImported++;
          }
        }
      }
      const recDir = path.join(extractDir, 'uploads', 'receipts');
      if (fs.existsSync(recDir)) {
        for (const file of fs.readdirSync(recDir)) {
          const safeName = path.basename(file); // Prevent path traversal
          const dst = path.join(RECEIPTS_DIR, safeName);
          const src = path.join(recDir, safeName);
          if (path.resolve(src).startsWith(path.resolve(recDir)) && !fs.existsSync(dst)) {
            fs.copyFileSync(src, dst); results.filesImported++;
          }
        }
      }
      await applyImportData(req.db, req.tenantId, data, results, req.user?.slug);
    } else {
      throw new Error('Invalid backup: no manifest.json or data.json found in ZIP');
    }

    res.json({ ok: true, ...results });
  } catch (err) {
    console.error('[import]', err.message);
    serverError(res, err);
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
  }
});

// ─── Admin Routes ────────────────────────────────────────────────────

app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tables = ADMIN_BROWSABLE_TABLES;
    const stats = [];
    if (DB_BACKEND === 'postgres') {
      // Postgres: all tenants share one database — query without tenant filter to get global totals
      for (const table of tables) {
        try {
          const row = await req.db.get(`SELECT COUNT(*) as count FROM ${table}`);
          stats.push({ table, count: Number(row?.count || 0) });
        } catch { stats.push({ table, count: 0 }); }
      }
    } else {
      // SQLite: each tenant has their own db — sum across all of them
      const tenants = await listTenants();
      for (const table of tables) {
        let total = 0;
        for (const tenant of tenants) {
          try {
            const db = getTenantDb(tenant.id);
            const row = await db.get(`SELECT COUNT(*) as count FROM ${table} WHERE tenant_id = ?`, [tenant.id]);
            total += Number(row?.count || 0);
          } catch { /* table may not exist in older tenant dbs */ }
        }
        stats.push({ table, count: total });
      }
    }
    res.json(stats);
  } catch (err) { serverError(res, err); }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await listTenants();
    res.json(users.map(u => ({
      id: u.id, slug: u.slug, displayName: u.display_name,
      email: u.email, role: u.role || 'user',
      createdAt: u.created_at, isActive: u.is_active !== 0,
    })));
  } catch (err) { serverError(res, err); }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { slug, displayName, password, role, email } = req.body;
    if (!slug || !displayName) return res.status(400).json({ error: 'slug and displayName are required' });
    const slugErr = validateSlug(slug);
    if (slugErr) return res.status(400).json({ error: slugErr });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const tenantId = uuidv4();
    const hash = await hashPassword(password);
    await createTenantRow({ id: tenantId, slug, display_name: displayName, email, role: role || 'user', password_hash: hash });
    if (DB_BACKEND === 'sqlite') {
      const sqlite = openSqlite(tenantDbPath(tenantId));
      initTenantSchema(sqlite, tenantId);
    }
    await seedTenantDefaults(tenantId);
    res.json({ ok: true, id: tenantId });
  } catch (err) {
    if (err.message?.includes('UNIQUE') || err.message?.includes('unique') || err.message?.includes('duplicate')) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    serverError(res, err);
  }
});

app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, displayName, role, password, email } = req.body;
    const fields = {};
    if (slug !== undefined) {
      const slugErr = validateSlug(slug);
      if (slugErr) return res.status(400).json({ error: slugErr });
      fields.slug = slug;
    }
    if (displayName !== undefined) fields.display_name = displayName;
    if (role !== undefined) fields.role = role;
    if (email !== undefined) fields.email = email;
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      fields.password_hash = await hashPassword(password);
    }
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });
    await updateTenantRow(id, fields);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// Admin tool: force the onboarding wizard (and tour) to re-run for a
// specific tenant. Writes `onboarding = { wizardCompleted: false,
// tourStatus: 'pending' }`. The target user sees the wizard on their
// next page load (no live push — they need to refresh).
//
// Optional `clearAircraft: true` in the body also unsets the tenant's
// general.aircraftType, which simulates a brand-new signup more
// faithfully. Without that flag, the wizard pre-fills with whatever
// the tenant already has and they can confirm or change.
app.post('/api/admin/users/:id/reset-onboarding', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { clearAircraft } = req.body || {};
    const tdb = getTenantDb(id);
    // setSetting requires a db object whose `tenantId` matches the
    // target. The getTenantDb helper already scopes by tenantId — but
    // the wrapper expects it on the db object itself for the WHERE
    // clause, so we stamp it in case any backend (Postgres) needs it.
    tdb.tenantId = id;
    await setSetting(tdb, 'onboarding', { wizardCompleted: false, tourStatus: 'pending' });
    if (clearAircraft) {
      const general = (await getSetting(tdb, 'general')) || { ...DEFAULT_GENERAL };
      const { aircraftType: _drop, ...rest } = general;
      await setSetting(tdb, 'general', rest);
    }
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.post('/api/admin/users/:id/purge', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { deleteSessions, deleteBlogPosts, deleteSignOffs, deleteExpenses, deleteInventory, deleteVisitorStats } = req.body || {};
    const tdb = getTenantDb(id);
    const purged = [];

    if (deleteSessions) {
      const rows = await tdb.all('SELECT image_urls FROM sessions WHERE tenant_id = ?', [id]);
      for (const row of rows) {
        for (const url of JSON.parse(row.image_urls || '[]')) {
          await imageStore.delete(url, true).catch(() => {});
        }
      }
      await tdb.run('DELETE FROM sessions WHERE tenant_id = ?', [id]);
      await tdb.run('DELETE FROM active_timer WHERE tenant_id = ?', [id]).catch(() => {});
      purged.push('sessions');
    }

    if (deleteBlogPosts) {
      const rows = await tdb.all('SELECT image_urls, content FROM blog_posts WHERE tenant_id = ?', [id]);
      for (const row of rows) {
        const fromColumn  = JSON.parse(row.image_urls || '[]');
        const fromContent = extractContentImageUrls(row.content);
        for (const url of [...new Set([...fromColumn, ...fromContent])]) {
          await imageStore.delete(url, true).catch(() => {});
        }
      }
      await tdb.run('DELETE FROM blog_posts WHERE tenant_id = ?', [id]);
      purged.push('blog_posts');
    }

    if (deleteSignOffs) {
      const sigRows = await tdb.all('SELECT signature_png FROM sign_offs WHERE tenant_id = ?', [id]);
      for (const row of sigRows) {
        if (row.signature_png && !row.signature_png.startsWith('data:')) await signatureStore.delete(row.signature_png).catch(() => {});
      }
      await tdb.run('DELETE FROM sign_offs WHERE tenant_id = ?', [id]);
      purged.push('sign_offs');
    }

    if (deleteExpenses) {
      const expRows = await tdb.all('SELECT receipt_urls FROM expenses WHERE tenant_id = ?', [id]).catch(() => []);
      for (const row of expRows) {
        for (const url of JSON.parse(row.receipt_urls || '[]')) {
          await receiptStore.delete(url).catch(() => {});
        }
      }
      await tdb.run('DELETE FROM expenses WHERE tenant_id = ?', [id]).catch(() => {});
      await tdb.run('DELETE FROM expense_budgets WHERE tenant_id = ?', [id]).catch(() => {});
      purged.push('expenses');
    }

    if (deleteInventory) {
      await tdb.run('DELETE FROM inventory_check_items WHERE tenant_id = ?', [id]).catch(() => {});
      await tdb.run('DELETE FROM inventory_check_sessions WHERE tenant_id = ?', [id]).catch(() => {});
      await tdb.run('DELETE FROM inventory_stock WHERE tenant_id = ?', [id]).catch(() => {});
      await tdb.run('DELETE FROM inventory_parts WHERE tenant_id = ?', [id]).catch(() => {});
      await tdb.run('DELETE FROM inventory_locations WHERE tenant_id = ?', [id]).catch(() => {});
      purged.push('inventory');
    }

    if (deleteVisitorStats) {
      await tdb.run('DELETE FROM visitor_stats WHERE tenant_id = ?', [id]).catch(() => {});
      purged.push('visitor_stats');
    }

    // Always clean up orphaned pending uploads when any data is purged
    if (purged.length > 0) {
      await tdb.run('DELETE FROM pending_uploads WHERE tenant_id = ?', [id]).catch(() => {});
    }

    console.log(`[admin] Purged data for tenant ${id}: ${purged.join(', ') || 'nothing selected'}`);
    res.json({ ok: true, purged });
  } catch (err) { serverError(res, err); }
});

// ─── Admin table browser ──────────────────────────────────────────────

const ADMIN_BROWSABLE_TABLES = ['sessions', 'blog_posts', 'expenses', 'expense_budgets', 'sign_offs', 'visitor_stats', 'pending_uploads', 'inventory_locations', 'inventory_parts', 'inventory_stock', 'inventory_check_sessions', 'inventory_check_items'];
const ADMIN_TABLE_PK = {
  sessions: 'id', blog_posts: 'id', expenses: 'id', expense_budgets: 'category',
  sign_offs: 'id', visitor_stats: 'id', pending_uploads: 'url',
  inventory_locations: 'id', inventory_parts: 'id', inventory_stock: 'id',
  inventory_check_sessions: 'id', inventory_check_items: 'id',
};
// Columns the admin table browser will search when a `q` query param is
// provided. Intentionally hand-picked rather than "every column" so we don't
// accidentally LIKE-scan blobs or huge text columns. All values are cast to
// text and lower-cased for case-insensitive substring match.
const ADMIN_TABLE_SEARCH_COLS = {
  sessions:                 ['section', 'notes'],
  blog_posts:               ['title', 'section', 'slug'],
  expenses:                 ['description', 'category', 'currency'],
  expense_budgets:          ['category'],
  sign_offs:                ['package_label', 'section_id', 'inspector_name', 'notes'],
  visitor_stats:            ['path', 'country', 'referrer'],
  pending_uploads:          ['url'],
  inventory_locations:      ['name'],
  inventory_parts:          ['part_number', 'name', 'category', 'manufacturer'],
  inventory_stock:          ['condition', 'status', 'notes'],
  inventory_check_sessions: ['kit_label', 'kit_id', 'aircraft_type', 'status'],
  inventory_check_items:    ['part_number', 'nomenclature', 'sub_kit', 'bag', 'status'],
};

// GET /api/admin/table/:table?tenantId=&limit=&offset=&q=
app.get('/api/admin/table/:table', requireAuth, requireAdmin, async (req, res) => {
  const { table } = req.params;
  if (!ADMIN_BROWSABLE_TABLES.includes(table)) return res.status(400).json({ error: 'Invalid table' });
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const tenantFilter = req.query.tenantId || null;
  const q = (req.query.q || '').toString().trim();
  const searchCols = q ? (ADMIN_TABLE_SEARCH_COLS[table] || []) : [];
  const pattern = q ? `%${q.toLowerCase()}%` : null;
  try {
    if (DB_BACKEND === 'postgres') {
      const whereParts = [];
      const params = [];
      if (tenantFilter) { params.push(tenantFilter); whereParts.push(`t.tenant_id = $${params.length}`); }
      if (searchCols.length) {
        const likes = searchCols.map(c => {
          params.push(pattern);
          return `LOWER(CAST(t.${c} AS TEXT)) LIKE $${params.length}`;
        });
        whereParts.push(`(${likes.join(' OR ')})`);
      }
      const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const countRow = await req.db.get(`SELECT COUNT(*) as count FROM ${table} t ${where}`, params);
      const rows = await req.db.all(
        `SELECT t.*, ten.slug as "_tenantSlug" FROM ${table} t LEFT JOIN tenants ten ON ten.id = t.tenant_id ${where} ORDER BY 1 LIMIT ${limit} OFFSET ${offset}`, params
      );
      res.json({ rows, total: Number(countRow.count) });
    } else {
      const tenants = tenantFilter
        ? (await listTenants()).filter(t => t.id === tenantFilter)
        : await listTenants();
      const allRows = [];
      let totalCount = 0;
      // Build the search-clause fragment once; it's stable across tenants.
      const searchClause = searchCols.length
        ? ` AND (${searchCols.map(c => `LOWER(CAST(${c} AS TEXT)) LIKE ?`).join(' OR ')})`
        : '';
      for (const tenant of tenants) {
        try {
          const tdb = getTenantDb(tenant.id);
          const baseParams = [tenant.id, ...searchCols.map(() => pattern)];
          const countRow = await tdb.get(`SELECT COUNT(*) as count FROM ${table} WHERE tenant_id = ?${searchClause}`, baseParams);
          totalCount += Number(countRow?.count || 0);
          const rows = await tdb.all(
            `SELECT * FROM ${table} WHERE tenant_id = ?${searchClause} LIMIT ? OFFSET ?`,
            [...baseParams, limit, offset]
          );
          for (const row of rows) allRows.push({ ...row, _tenantSlug: tenant.slug });
        } catch { /* table may not exist in older dbs */ }
      }
      res.json({ rows: allRows.slice(0, limit), total: totalCount });
    }
  } catch (err) { serverError(res, err); }
});

// DELETE /api/admin/table/:table  body: { pk, tenantId }
app.delete('/api/admin/table/:table', requireAuth, requireAdmin, async (req, res) => {
  const { table } = req.params;
  if (!ADMIN_BROWSABLE_TABLES.includes(table)) return res.status(400).json({ error: 'Invalid table' });
  const { pk, tenantId } = req.body || {};
  if (!pk) return res.status(400).json({ error: 'pk is required' });
  const pkCol = ADMIN_TABLE_PK[table];
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  try {
    if (DB_BACKEND === 'postgres') {
      await req.db.run(`DELETE FROM ${table} WHERE ${pkCol} = $1 AND tenant_id = $2`, [pk, tenantId]);
    } else {
      const tdb = getTenantDb(tenantId);
      await tdb.run(`DELETE FROM ${table} WHERE ${pkCol} = ? AND tenant_id = ?`, [String(pk), tenantId]);
    }
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// GET /api/admin/jobs
app.get('/api/admin/jobs', requireAuth, requireAdmin, (_req, res) => {
  res.json(Object.values(jobRegistry));
});

// POST /api/admin/jobs/:key/run — trigger a job immediately
const JOB_FUNCTIONS = {
  pruneVisitorStats,
  cleanupPendingUploads,
  cleanupOrphanedTenantData,
  migrateDataUriSignatures,
  migrateDataUriBlogImages,
};

app.post('/api/admin/jobs/:key/run', requireAuth, requireAdmin, async (req, res) => {
  const { key } = req.params;
  const fn = JOB_FUNCTIONS[key];
  if (!fn) return res.status(404).json({ error: `Unknown job: ${key}` });
  // Run in background so we can respond immediately
  fn().catch(e => console.warn(`[admin] Manual job run failed for ${key}:`, e.message));
  res.json({ ok: true, message: `Job "${key}" started` });
});

app.get('/api/admin/news', requireAuth, requireAdmin, async (req, res) => {
  try {
    const latestNews = await getPlatformSetting('latestNews', null);
    res.json({ latestNews });
  } catch (err) {
    serverError(res, err);
  }
});

// Same character class as the tenant SLUG_RE above, but without the
// length/leading-hyphen constraints — news slugs mirror blog post slugs,
// not tenant subdomains.
const NEWS_SLUG_RE = /^[a-z0-9-]+$/i;

app.put('/api/admin/news', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { slug, title, date, intro, body } = req.body || {};
    // `intro` and `body` feed the announcement dialog. Capped because
    // this lands in a single settings row and is rendered into a modal —
    // neither wants an unbounded blob.
    const strFields = { slug, title, date, intro, body };
    for (const [key, val] of Object.entries(strFields)) {
      if (val !== undefined && val !== null && typeof val !== 'string') {
        return res.status(400).json({ error: `${key} must be a string` });
      }
    }
    const trimmedSlug = typeof slug === 'string' ? slug.trim() : '';
    if (trimmedSlug && !NEWS_SLUG_RE.test(trimmedSlug)) {
      return res.status(400).json({ error: 'slug must contain only letters, numbers, and hyphens' });
    }
    const trimmedIntro = typeof intro === 'string' ? intro.trim() : '';
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedIntro.length > 300) {
      return res.status(400).json({ error: 'intro must be 300 characters or fewer' });
    }
    if (trimmedBody.length > 2000) {
      return res.status(400).json({ error: 'body must be 2000 characters or fewer' });
    }
    const value = trimmedSlug
      ? { slug: trimmedSlug, title: title || '', date: date || '', intro: trimmedIntro, body: trimmedBody }
      : null;
    await setPlatformSetting('latestNews', value);
    res.json({ ok: true, latestNews: value });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Reserved slugs ───────────────────────────────────────────────────
// Single source of truth — account-frontend fetches and caches this list.
// Add entries here to block usernames that would conflict with infrastructure
// or look misleading. Keep sorted for easy maintenance.

const RESERVED_SLUGS = new Set([
  'account', 'accounts', 'admin', 'api', 'app', 'assets',
  'auth', 'benchlog', 'beta', 'blog', 'build', 'callback',
  'cdn', 'demo', 'dev', 'docs', 'ftp', 'help',
  'home', 'imap', 'login', 'mail', 'me', 'my',
  'ns1', 'ns2', 'ns3', 'ns4', 'oauth', 'pop',
  'preview', 'register', 'signup', 'smtp', 'ssh', 'staging',
  'static', 'status', 'support', 'test', 'tracker', 'www',
]);

// GET /api/public/reserved-slugs — public, no auth required
app.get('/api/public/reserved-slugs', (_req, res) => {
  res.json([...RESERVED_SLUGS].sort());
});

// ─── Internal service-to-service API ─────────────────────────────────
// Protected by X-Service-Key header (INTERNAL_API_KEY env var).
// Intended for a separate registration/management container on the same
// Docker network. Only available when DB_BACKEND=postgres.

app.get('/api/internal/tenants', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const rows = await listTenants();
    res.json(rows.map(u => ({
      id: u.id, slug: u.slug, displayName: u.display_name,
      email: u.email || null, role: u.role, createdAt: u.created_at, isActive: u.is_active,
    })));
  } catch (err) { serverError(res, err); }
});

// Public tenants with blog metadata, for the parent benchlog.build sitemap-index
// and /blogs directory. No auth — same shape callers see at .../sitemap.xml, just
// aggregated server-side so the parent doesn't have to fan out one fetch per tenant.
// 5-min Cache-Control lets the account-frontend cache it in its own layer too.
app.get('/api/internal/tenants/public', requireServiceKey, async (req, res) => {
  try {
    const rows = await listPublicTenants();
    res.set('Cache-Control', 'public, max-age=300');
    res.json(rows);
  } catch (err) { serverError(res, err); }
});

// Get single tenant profile by slug
app.get('/api/internal/tenants/by-slug/:slug', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const tenant = await getTenantProfileBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json({
      id: tenant.id, slug: tenant.slug, displayName: tenant.display_name,
      email: tenant.email || null, role: tenant.role, createdAt: tenant.created_at, isActive: tenant.is_active,
    });
  } catch (err) { serverError(res, err); }
});

// Verify a tenant's password (used by account frontend for login delegation)
app.post('/api/internal/tenants/verify-password', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const { slug, password } = req.body;
    if (!slug || !password) return res.status(400).json({ error: 'slug and password are required' });
    const tenant = await getTenantProfileBySlug(slug);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!tenant.password_hash) return res.status(400).json({ error: 'No password set' });
    const { ok, rehash } = await verifyPassword(password, tenant.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });
    // Silently upgrade legacy hash
    if (rehash) {
      await setTenantPassword(tenant.id, rehash);
      const db = getTenantDb(tenant.id);
      await setSetting(db, 'auth_password_hash', rehash).catch(() => {});
    }
    res.json({
      ok: true, id: tenant.id, slug: tenant.slug, displayName: tenant.display_name,
      email: tenant.email || null, role: tenant.role,
    });
  } catch (err) { serverError(res, err); }
});

// Issue a short-lived token for a tenant (used by account frontend for proxied exports)
app.post('/api/internal/tenants/token/:slug', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const tenant = await getTenantProfileBySlug(req.params.slug);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    // 15-minute expiry — enough for a single export download
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body   = Buffer.from(JSON.stringify({ role: tenant.role, tenantId: tenant.id, slug: tenant.slug, exp: Date.now() + 15 * 60 * 1000 })).toString('base64url');
    const sig    = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    res.json({ token: `${header}.${body}.${sig}` });
  } catch (err) { serverError(res, err); }
});

// Look up tenants by email (used by account frontend for forgot-password)
app.get('/api/internal/tenants/by-email/:email', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const rows = await getTenantsByEmail(req.params.email);
    res.json(rows.map(t => ({
      id: t.id, slug: t.slug, displayName: t.display_name,
      email: t.email || null, role: t.role, isActive: t.is_active,
    })));
  } catch (err) { serverError(res, err); }
});

app.post('/api/internal/tenants', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const { slug, displayName, password, passwordHash, role, email } = req.body;
    if (!slug) return res.status(400).json({ error: 'slug is required' });
    const slugErr = validateSlug(slug);
    if (slugErr) return res.status(400).json({ error: slugErr });
    if (!displayName) return res.status(400).json({ error: 'displayName is required' });
    if (!password && !passwordHash) return res.status(400).json({ error: 'password or passwordHash is required' });
    if (password && password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
    if (passwordHash && !isBcryptHash(passwordHash)) return res.status(400).json({ error: 'passwordHash must be a valid bcrypt hash' });
    const validRoles = ['user', 'admin'];
    if (role && !validRoles.includes(role)) return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    if (RESERVED_SLUGS.has(slug)) return res.status(409).json({ error: `Username "${slug}" is reserved` });
    const existing = await getTenantBySlug(slug);
    if (existing) return res.status(409).json({ error: `Username "${slug}" is already taken` });
    const tenantId = uuidv4();
    const hash = passwordHash || await hashPassword(password);
    await createTenantRow({ id: tenantId, slug, display_name: displayName, email: email || null, role: role || 'user', password_hash: hash });
    await seedTenantDefaults(tenantId);
    res.status(201).json({ id: tenantId, slug, displayName, role: role || 'user' });
  } catch (err) { serverError(res, err); }
});

app.patch('/api/internal/tenants/:id', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, displayName, password, role, email, isActive } = req.body;
    const fields = {};
    if (slug !== undefined) {
      const slugErr = validateSlug(slug);
      if (slugErr) return res.status(400).json({ error: slugErr });
      const existing = await getTenantBySlug(slug);
      if (existing && existing.id !== id) return res.status(409).json({ error: `Username "${slug}" is already taken` });
      fields.slug = slug;
    }
    if (displayName !== undefined) fields.display_name = displayName;
    if (role !== undefined) {
      const validRoles = ['user', 'admin'];
      if (!validRoles.includes(role)) return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      fields.role = role;
    }
    if (email !== undefined) fields.email = email;
    if (isActive !== undefined) {
      fields.is_active = isActive ? 1 : 0;
      if (!isActive) _deactivatedTenants.set(id, Date.now() + 3600000);
      else _deactivatedTenants.delete(id);
    }
    if (password !== undefined) {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      fields.password_hash = await hashPassword(password);
    }
    if (req.body.passwordHash !== undefined) {
      if (!isBcryptHash(req.body.passwordHash)) return res.status(400).json({ error: 'passwordHash must be a valid bcrypt hash' });
      fields.password_hash = req.body.passwordHash;
    }
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });
    await updateTenantRow(id, fields);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.delete('/api/internal/tenants/:id', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const { id } = req.params;
    const tdb = getTenantDb(id);

    // Clean up all tenant data (images, receipts, signatures, etc.)
    // Sessions + images
    const sessionRows = await tdb.all('SELECT image_urls FROM sessions WHERE tenant_id = ?', [id]).catch(() => []);
    for (const row of sessionRows) {
      for (const url of JSON.parse(row.image_urls || '[]')) {
        await imageStore.delete(url, true).catch(() => {});
      }
    }
    await tdb.run('DELETE FROM sessions WHERE tenant_id = ?', [id]).catch(() => {});
    await tdb.run('DELETE FROM active_timer WHERE tenant_id = ?', [id]).catch(() => {});

    // Blog posts + images
    const blogRows = await tdb.all('SELECT image_urls, content FROM blog_posts WHERE tenant_id = ?', [id]).catch(() => []);
    for (const row of blogRows) {
      const fromColumn  = JSON.parse(row.image_urls || '[]');
      const fromContent = extractContentImageUrls(row.content);
      for (const url of [...new Set([...fromColumn, ...fromContent])]) {
        await imageStore.delete(url, true).catch(() => {});
      }
    }
    await tdb.run('DELETE FROM blog_posts WHERE tenant_id = ?', [id]).catch(() => {});

    // Sign-offs + signatures
    const sigRows = await tdb.all('SELECT signature_png FROM sign_offs WHERE tenant_id = ?', [id]).catch(() => []);
    for (const row of sigRows) {
      if (row.signature_png && !row.signature_png.startsWith('data:')) await signatureStore.delete(row.signature_png).catch(() => {});
    }
    await tdb.run('DELETE FROM sign_offs WHERE tenant_id = ?', [id]).catch(() => {});

    // Expenses + receipts
    const expRows = await tdb.all('SELECT receipt_urls FROM expenses WHERE tenant_id = ?', [id]).catch(() => []);
    for (const row of expRows) {
      for (const url of JSON.parse(row.receipt_urls || '[]')) {
        await receiptStore.delete(url).catch(() => {});
      }
    }
    await tdb.run('DELETE FROM expenses WHERE tenant_id = ?', [id]).catch(() => {});
    await tdb.run('DELETE FROM expense_budgets WHERE tenant_id = ?', [id]).catch(() => {});

    // Inventory
    await tdb.run('DELETE FROM inventory_check_items WHERE tenant_id = ?', [id]).catch(() => {});
    await tdb.run('DELETE FROM inventory_check_sessions WHERE tenant_id = ?', [id]).catch(() => {});
    await tdb.run('DELETE FROM inventory_stock WHERE tenant_id = ?', [id]).catch(() => {});
    await tdb.run('DELETE FROM inventory_parts WHERE tenant_id = ?', [id]).catch(() => {});
    await tdb.run('DELETE FROM inventory_locations WHERE tenant_id = ?', [id]).catch(() => {});

    // Remaining tenant data
    await tdb.run('DELETE FROM flowchart_status WHERE tenant_id = ?', [id]).catch(() => {});
    await tdb.run('DELETE FROM pending_uploads WHERE tenant_id = ?', [id]).catch(() => {});
    await tdb.run('DELETE FROM visitor_stats WHERE tenant_id = ?', [id]).catch(() => {});
    await tdb.run('DELETE FROM settings WHERE tenant_id = ?', [id]).catch(() => {});

    await deleteTenantRow(id);
    console.log(`[internal] Fully deleted tenant ${id} and all associated data`);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Blog Posts API ──────────────────────────────────────────────────

app.get('/api/blog', async (req, res) => {
  try {
    if (!await checkBlogAccess(req, res)) return;
    const db = req.db || getDefaultDb();
    const { section, year, month, plansSection } = req.query;

    const blogPosts = await (async () => {
      let sql = 'SELECT * FROM blog_posts WHERE tenant_id = ?';
      const params = [db.tenantId];
      if (section)      { sql += ' AND section = ?';                            params.push(section); }
      if (plansSection) { sql += ' AND plans_section = ?';                      params.push(plansSection); }
      if (year)         { sql += ' AND substr(published_at, 1, 4) = ?';            params.push(year); }
      if (month)        { sql += ' AND substr(published_at, 6, 2) = ?';            params.push(month.padStart(2, '0')); }
      const rows = await db.all(sql, params);
      return rows.map(row => {
        const contentImageUrls = extractContentImageUrlsForList(row.content);
        // Generate excerpt: try JSON text extraction first, fall back to HTML stripping
        const jsonText = extractTextFromJson(row.content);
        const excerpt = jsonText !== null
          ? jsonText.slice(0, 300)
          : (row.content || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 300);
        return {
          id: row.id, title: row.title, section: row.section,
          plansSection: row.plans_section || '',
          excerpt, contentImageUrls,
          imageUrls: JSON.parse(row.image_urls || '[]'),
          publishedAt: row.published_at, updatedAt: row.updated_at, source: 'blog',
        };
      });
    })();

    let sessSql = 'SELECT * FROM sessions WHERE tenant_id = ?';
    const sessParams = [db.tenantId];
    if (section)      { sessSql += ' AND section = ?';                           sessParams.push(section); }
    if (year)         { sessSql += ' AND substr(start_time, 1, 4) = ?';             sessParams.push(year); }
    if (month)        { sessSql += ' AND substr(start_time, 6, 2) = ?';             sessParams.push(month.padStart(2, '0')); }
    if (plansSection) { sessSql += ' AND plans_reference LIKE ?';                sessParams.push(`%Section ${plansSection}%`); }
    const sessRows     = await db.all(sessSql, sessParams);
    const sectionConfigs = await getSetting(db, 'sections', DEFAULT_SECTIONS);
    const sectionLabels  = {};
    for (const s of sectionConfigs) sectionLabels[s.id] = s.label;

    const sessionPosts = sessRows.map(row => {
      const label = sectionLabels[row.section] || row.section;
      const hours  = Math.floor(row.duration_minutes / 60);
      const mins   = Math.round(row.duration_minutes % 60);
      const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return {
        id: 'session-' + row.id, title: `${label} — Work Session (${durationStr})`,
        content: row.notes || '', excerpt: (row.notes || '').slice(0, 300), section: row.section,
        imageUrls: JSON.parse(row.image_urls || '[]'),
        publishedAt: row.start_time, updatedAt: row.start_time, source: 'session',
        plansReference: row.plans_reference, durationMinutes: row.duration_minutes,
      };
    });

    const all = [...blogPosts, ...sessionPosts].sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 24));
    const start = (page - 1) * limit;
    const paged = all.slice(start, start + limit);
    res.json({ posts: paged, hasMore: start + limit < all.length, total: all.length });
  } catch (err) { serverError(res, err); }
});

app.get('/api/blog/archive', async (req, res) => {
  try {
    if (!await checkBlogAccess(req, res)) return;
    const db = req.db || getDefaultDb();
    const rows = await db.all(`
      SELECT year, month, SUM(cnt) as count FROM (
        SELECT substr(published_at, 1, 4) as year, substr(published_at, 6, 2) as month, COUNT(*) as cnt
        FROM blog_posts WHERE tenant_id = ? GROUP BY year, month
        UNION ALL
        SELECT substr(start_time, 1, 4) as year, substr(start_time, 6, 2) as month, COUNT(*) as cnt
        FROM sessions WHERE tenant_id = ? GROUP BY year, month
      ) GROUP BY year, month ORDER BY year DESC, month DESC
    `, [db.tenantId, db.tenantId]);
    res.json(rows);
  } catch (err) { serverError(res, err); }
});

app.get('/api/blog/:id', async (req, res) => {
  try {
    if (!await checkBlogAccess(req, res)) return;
    const db  = req.db || getDefaultDb();
    const row = await db.get(
      'SELECT * FROM blog_posts WHERE id = ? AND tenant_id = ?',
      [req.params.id, db.tenantId]
    );
    if (!row) return res.status(404).json({ error: 'Post not found' });
    res.json({
      id: row.id, title: row.title, content: row.content, section: row.section,
      plansSection: row.plans_section || '',
      imageUrls: JSON.parse(row.image_urls || '[]'),
      publishedAt: row.published_at, updatedAt: row.updated_at,
    });
  } catch (err) { serverError(res, err); }
});

// Extract uploaded image URLs from HTML content so the cleanup job can find them.
// Matches both local (/files/...) and R2 (https://r2-public-url/...) URLs.
function extractContentImageUrls(content) {
  if (!content) return [];

  // Try JSON first (TipTap block format)
  try {
    const doc = JSON.parse(content);
    if (doc && doc.type === 'doc') {
      const urls = [];
      const walk = (node) => {
        if (node.type === 'imageBlock' && node.attrs && node.attrs.src) {
          const src = node.attrs.src;
          if (src.startsWith('/files/') || (R2_PUBLIC_URL && src.startsWith(R2_PUBLIC_URL))) urls.push(src);
        }
        if (node.content) node.content.forEach(walk);
      };
      walk(doc);
      return [...new Set(urls)];
    }
  } catch (_) { /* Not JSON — fall through to HTML parsing */ }

  // HTML fallback (legacy Quill content)
  const urls = [];
  const re = /<img[^>]+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const src = m[1];
    if (src.startsWith('/files/') || (R2_PUBLIC_URL && src.startsWith(R2_PUBLIC_URL))) urls.push(src);
  }
  return [...new Set(urls)];
}

/**
 * Extract plain text from TipTap JSON for excerpts.
 * Returns null if content is not valid TipTap JSON.
 */
function extractTextFromJson(content) {
  try {
    const doc = JSON.parse(content);
    if (!doc || doc.type !== 'doc') return null;
    const parts = [];
    const walk = (node) => {
      if (node.type === 'text' && node.text) parts.push(node.text);
      if (node.content) node.content.forEach(walk);
    };
    walk(doc);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  } catch (_) { return null; }
}

/**
 * Extract image URLs from content (JSON or HTML) for blog list responses.
 * Skips base64 data URIs.
 */
function extractContentImageUrlsForList(content) {
  if (!content) return [];
  // Try JSON
  try {
    const doc = JSON.parse(content);
    if (doc && doc.type === 'doc') {
      const urls = [];
      const walk = (node) => {
        if (node.type === 'imageBlock' && node.attrs && node.attrs.src) urls.push(node.attrs.src);
        if (node.content) node.content.forEach(walk);
      };
      walk(doc);
      return urls;
    }
  } catch (_) { /* Not JSON */ }
  // HTML fallback
  const urls = [];
  const imgRe = /<img[^>]+src="([^"]+)"/g;
  let m;
  while ((m = imgRe.exec(content)) !== null) {
    if (!m[1].startsWith('data:')) urls.push(m[1]);
  }
  return urls;
}

/**
 * Walk blog content (TipTap JSON or HTML) and replace any embedded base64 data:
 * URIs with uploaded file URLs. Returns the (possibly modified) content string.
 */
async function extractAndUploadBase64Images(content, tenantSlug) {
  if (!content) return content;

  // TipTap JSON
  try {
    const doc = JSON.parse(content);
    if (doc && doc.type === 'doc') {
      let changed = false;
      const walk = async (node) => {
        if (node.type === 'imageBlock' && node.attrs?.src?.startsWith('data:')) {
          const src = node.attrs.src;
          const extMatch = src.match(/^data:image\/(\w+);base64,/);
          const ext = extMatch ? (extMatch[1] === 'jpeg' ? 'jpg' : extMatch[1]) : 'jpg';
          const b64 = src.split(',')[1];
          if (b64) {
            const buf = Buffer.from(b64, 'base64');
            const url = await imageStore.save(`${uuidv4()}.${ext}`, buf, `image/${ext}`, tenantSlug);
            node.attrs.src = url;
            changed = true;
          }
        }
        if (node.content) {
          for (const child of node.content) await walk(child);
        }
      };
      await walk(doc);
      return changed ? JSON.stringify(doc) : content;
    }
  } catch { /* not JSON */ }

  // HTML fallback — replace <img src="data:..."> with uploaded file URLs
  const imgRe = /(<img[^>]+src=")data:image\/(\w+);base64,([^"]+)(")/g;
  let result = content;
  let match;
  const replacements = [];
  while ((match = imgRe.exec(content)) !== null) {
    const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
    const buf = Buffer.from(match[3], 'base64');
    const url = await imageStore.save(`${uuidv4()}.${ext}`, buf, `image/${ext}`, tenantSlug);
    replacements.push({ full: match[0], replacement: `${match[1]}${url}${match[4]}` });
  }
  for (const r of replacements) result = result.replace(r.full, r.replacement);
  return result;
}

app.post('/api/blog', requireAuth, async (req, res) => {
  try {
    const { id, title, section, plansSection, publishedAt } = req.body;
    if (!title || typeof title !== 'string' || title.length > 500) return res.status(400).json({ error: 'Title is required (max 500 chars)' });
    let content = req.body.content;
    if (content && typeof content === 'string' && content.length > 5_000_000) return res.status(400).json({ error: 'Content too large (max 5MB)' });
    const postId    = uuidv4();
    const now       = new Date().toISOString();
    // Extract embedded base64 images and upload them as files
    content = await extractAndUploadBase64Images(content, req.user?.slug);
    const imageUrls = extractContentImageUrls(content);
    await req.db.run(
      `INSERT INTO blog_posts (id, tenant_id, title, content, section, plans_section, image_urls, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [postId, req.tenantId, title, content || '', section || null, plansSection || '', JSON.stringify(imageUrls), publishedAt || now, now]
    );
    // Fire-and-forget IndexNow notification — Bing/Yandex/Seznam see new posts
    // within seconds. Host comes from the request itself so it works on any
    // deployment without env-var configuration.
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    indexNow.notifyForTenant({ getOrCreateIndexNowKey }, req.tenantId, host, ['/blog', `/blog/${postId}`]);
    res.json({ ok: true, id: postId });
  } catch (err) { serverError(res, err); }
});

app.put('/api/blog/:id', requireAuth, async (req, res) => {
  try {
    const { id }  = req.params;
    const updates = req.body;
    if (updates.title !== undefined && (typeof updates.title !== 'string' || updates.title.length > 500)) return res.status(400).json({ error: 'Title max 500 chars' });
    if (updates.content !== undefined && typeof updates.content === 'string' && updates.content.length > 5_000_000) return res.status(400).json({ error: 'Content too large (max 5MB)' });
    const fields  = [];
    const values  = [];
    if (updates.title       !== undefined) { fields.push('title = ?');       values.push(updates.title); }
    if (updates.content     !== undefined) {
      // Extract embedded base64 images and upload them as files
      const cleanContent = await extractAndUploadBase64Images(updates.content, req.user?.slug);
      fields.push('content = ?');     values.push(cleanContent);
      // Re-extract image URLs from updated content
      fields.push('image_urls = ?');  values.push(JSON.stringify(extractContentImageUrls(cleanContent)));
    }
    if (updates.section      !== undefined) { fields.push('section = ?');       values.push(updates.section); }
    if (updates.plansSection !== undefined) { fields.push('plans_section = ?'); values.push(updates.plansSection); }
    if (updates.publishedAt  !== undefined) { fields.push('published_at = ?');  values.push(updates.publishedAt); }
    fields.push('updated_at = ?'); values.push(new Date().toISOString());
    if (fields.length > 0) {
      values.push(id, req.tenantId);
      await req.db.run(`UPDATE blog_posts SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
    }
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    indexNow.notifyForTenant({ getOrCreateIndexNowKey }, req.tenantId, host, ['/blog', `/blog/${id}`]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.delete('/api/blog/:id', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get(
      'SELECT image_urls, content FROM blog_posts WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (row) {
      const fromColumn  = JSON.parse(row.image_urls || '[]');
      const fromContent = extractContentImageUrls(row.content);
      const allUrls     = [...new Set([...fromColumn, ...fromContent])];
      for (const url of allUrls) {
        await imageStore.delete(url, true).catch(err => console.error('Failed to delete blog image:', err.message));
      }
    }
    await req.db.run('DELETE FROM blog_posts WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    // IndexNow has no explicit "removed" verb — submitting the now-404 URL
    // tells search engines to re-crawl and discover the deletion.
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    indexNow.notifyForTenant({ getOrCreateIndexNowKey }, req.tenantId, host, ['/blog', `/blog/${req.params.id}`]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Flowchart Status API ─────────────────────────────────────────────

app.get('/api/flowchart-status', async (req, res) => {
  try {
    if (!await checkBlogAccess(req, res)) return;
    const db   = req.db || getDefaultDb();
    const data = await getSetting(db, 'flowchart_status', {});
    res.json(data);
  } catch (err) { serverError(res, err); }
});

app.put('/api/flowchart-status', requireAuth, async (req, res) => {
  try {
    if (typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Expected object' });
    if (JSON.stringify(req.body).length > 1_000_000) return res.status(400).json({ error: 'Payload too large' });
    await setSetting(req.db, 'flowchart_status', req.body);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.get('/api/flowchart-packages', async (req, res) => {
  try {
    if (!await checkBlogAccess(req, res)) return;
    const db   = req.db || getDefaultDb();
    const data = await getSetting(db, 'flowchart_packages', {});
    res.json(data);
  } catch (err) { serverError(res, err); }
});

app.put('/api/flowchart-packages', requireAuth, async (req, res) => {
  try {
    if (typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Expected object' });
    }
    if (JSON.stringify(req.body).length > 1_000_000) return res.status(400).json({ error: 'Payload too large' });
    await setSetting(req.db, 'flowchart_packages', req.body);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// Reset the tenant's work-packages tree back to the default template
// for whatever aircraft they currently have configured. Destructive —
// overwrites the existing `flowchart_packages` setting in full. The
// frontend prompts for confirmation before calling this; we don't
// soft-merge because the template's node IDs are stable and a merge
// would just produce duplicate sub-trees the user then has to clean up.
app.post('/api/work-packages/reset-to-default', requireAuth, requireNotDemo, async (req, res) => {
  try {
    const general = (await getSetting(req.db, 'general')) || {};
    const slug = general.aircraftType || DEFAULT_AIRCRAFT_SLUG;
    const template = loadDefaultWorkPackages(slug);
    if (!template) {
      return res.status(404).json({ error: `No work-packages template configured for aircraft "${slug}"` });
    }
    await setSetting(req.db, 'flowchart_packages', template);
    res.json({ ok: true, aircraftSlug: slug });
  } catch (err) { serverError(res, err); }
});

// ─── Onboarding ─────────────────────────────────────────────────────
// Two-state per tenant; see DEFAULT_ONBOARDING in tenant-defaults.js
// for the shape. The wizard is mandatory (we need an aircraft); the
// tour is optional and re-launchable from Settings.

/** Resolve the tenant's onboarding status, with a one-time fallback
 *  for tenants who existed before this feature shipped. If the
 *  setting is missing AND they already have an aircraft configured,
 *  treat them as fully-onboarded — they finished setup the old way
 *  and shouldn't be forced through a wizard now. New tenants land
 *  with `wizardCompleted: false` and see the modal on first login. */
async function getOnboardingStatus(db) {
  const stored = await getSetting(db, 'onboarding', null);
  if (stored) return stored;
  // No row → infer from general settings. An aircraft that's been
  // chosen at any point in the past = they've effectively onboarded.
  const general = (await getSetting(db, 'general')) || {};
  if (general.aircraftType) {
    return { wizardCompleted: true, tourStatus: 'skipped' };
  }
  return { ...DEFAULT_ONBOARDING };
}

app.get('/api/onboarding', requireAuth, async (req, res) => {
  try {
    const status = await getOnboardingStatus(req.db);
    res.json(status);
  } catch (err) { serverError(res, err); }
});

// Finish the wizard: atomically write the captured settings, seed
// the matching work-packages template, and mark wizardCompleted.
// The frontend has already prompted the user — we just persist.
app.post('/api/onboarding/wizard', requireAuth, requireNotDemo, async (req, res) => {
  try {
    const { projectName, aircraftType, targetHours, homeCurrency, timeFormat } = req.body ?? {};
    // Minimal validation — the UI enforces these, but never trust the wire.
    if (!aircraftType || typeof aircraftType !== 'string') {
      return res.status(400).json({ error: 'aircraftType is required' });
    }
    const template = loadDefaultWorkPackages(aircraftType);
    if (!template) {
      return res.status(400).json({ error: `Unknown aircraft "${aircraftType}"` });
    }
    const general = (await getSetting(req.db, 'general')) || { ...DEFAULT_GENERAL };
    const next = {
      ...general,
      ...(typeof projectName === 'string' && projectName.trim() ? { projectName: projectName.trim() } : {}),
      aircraftType,
      ...(Number.isFinite(Number(targetHours)) && Number(targetHours) > 0 ? { targetHours: Number(targetHours) } : {}),
      ...(typeof homeCurrency === 'string' && homeCurrency ? { homeCurrency } : {}),
      ...(timeFormat === '12h' || timeFormat === '24h' ? { timeFormat } : {}),
    };
    await setSetting(req.db, 'general', next);
    await setSetting(req.db, 'flowchart_packages', template);
    const status = await getOnboardingStatus(req.db);
    await setSetting(req.db, 'onboarding', { ...status, wizardCompleted: true });
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.post('/api/onboarding/tour/complete', requireAuth, requireNotDemo, async (req, res) => {
  try {
    const status = await getOnboardingStatus(req.db);
    await setSetting(req.db, 'onboarding', { ...status, tourStatus: 'completed' });
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.post('/api/onboarding/tour/skip', requireAuth, requireNotDemo, async (req, res) => {
  try {
    const status = await getOnboardingStatus(req.db);
    await setSetting(req.db, 'onboarding', { ...status, tourStatus: 'skipped' });
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// Used by Settings → "Show the welcome tour again". Pops tourStatus
// back to 'pending' so the next page load shows it.
app.post('/api/onboarding/tour/reset', requireAuth, requireNotDemo, async (req, res) => {
  try {
    const status = await getOnboardingStatus(req.db);
    await setSetting(req.db, 'onboarding', { ...status, tourStatus: 'pending' });
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Wiring editor (singleton project per tenant) ───────────────────
// Stores the entire editor state as one JSON blob. Small projects (~100 KB)
// comfortably fit a single row — revisit if the data balloons past a few MB.

app.get('/api/wiring', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get(
      'SELECT name, data, updated_at FROM wiring_projects WHERE tenant_id = ?',
      [req.tenantId]
    );
    if (!row) return res.json({ name: 'Wiring', data: null, updatedAt: null });
    let parsed = null;
    try { parsed = JSON.parse(row.data); } catch { parsed = null; }
    res.json({ name: row.name, data: parsed, updatedAt: row.updated_at });
  } catch (err) { serverError(res, err); }
});

app.put('/api/wiring', requireAuth, requireNotDemo, async (req, res) => {
  try {
    const { name, data, baseUpdatedAt } = req.body ?? {};
    if (data === undefined) return res.status(400).json({ error: 'Missing `data` field' });
    const serialized = JSON.stringify(data ?? {});
    if (serialized.length > 5_000_000) {
      return res.status(400).json({ error: 'Wiring project exceeds 5 MB — split into multiple projects or clean up unused elements' });
    }
    const projectName = (typeof name === 'string' && name.trim()) ? name.trim() : 'Wiring';

    // Optimistic-concurrency check: the client sends the `updatedAt` it last
    // loaded/saved (null when it loaded an empty project). If the stored row
    // has moved past that, another tab/device saved in between — reject with
    // 409 instead of silently clobbering their work. Clients that omit the
    // field (older builds) skip the check and keep last-write-wins.
    if (baseUpdatedAt !== undefined) {
      const existing = await req.db.get(
        'SELECT updated_at FROM wiring_projects WHERE tenant_id = ?', [req.tenantId]);
      const storedAt = existing ? existing.updated_at : null;
      if (storedAt !== (baseUpdatedAt ?? null)) {
        return res.status(409).json({
          error: 'Wiring project was modified in another tab or on another device',
          updatedAt: storedAt,
        });
      }
    }

    const nowIso = new Date().toISOString();
    // Single UPSERT — works in both SQLite (>=3.24) and Postgres.
    // Using ON CONFLICT also sidesteps the db-wrapper's auto-append of
    // "RETURNING id" (this table keys on tenant_id, not id).
    await req.db.run(
      `INSERT INTO wiring_projects (tenant_id, name, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (tenant_id) DO UPDATE
         SET name       = EXCLUDED.name,
             data       = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at`,
      [req.tenantId, projectName, serialized, nowIso]
    );
    res.json({ ok: true, updatedAt: nowIso });
  } catch (err) { serverError(res, err); }
});

app.delete('/api/wiring', requireAuth, requireNotDemo, async (req, res) => {
  try {
    await req.db.run('DELETE FROM wiring_projects WHERE tenant_id = ?', [req.tenantId]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Wiring user-library (row per custom device template) ───────────────
// Per-tenant CRUD. Each template is a DeviceTemplate JSON blob, keyed by its
// own id — lets us update/delete one template at a time instead of rewriting
// the whole library on every save.
//
// Template ids come from the client (random base36 in practice) so they're
// URL-safe. A PUT can either insert or update; the body's `id` must match the
// path `:id` so a stale client can't overwrite a different row.
const USER_TEMPLATE_MAX_BYTES = 500_000; // ~0.5 MB per template — plenty for pin lists + metadata

app.get('/api/wiring/library', requireAuth, async (req, res) => {
  try {
    const rows = await req.db.all(
      'SELECT template_id, data, updated_at FROM wiring_user_templates WHERE tenant_id = ? ORDER BY updated_at DESC',
      [req.tenantId]
    );
    const templates = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data);
        if (parsed && typeof parsed === 'object') templates.push(parsed);
      } catch {
        // Skip malformed rows rather than failing the whole fetch — they can
        // be re-saved from the client to repair themselves.
      }
    }
    res.json({ templates });
  } catch (err) { serverError(res, err); }
});

app.put('/api/wiring/library/:id', requireAuth, requireNotDemo, async (req, res) => {
  try {
    const pathId = String(req.params.id || '').trim();
    if (!pathId) return res.status(400).json({ error: 'Missing template id in path' });
    const body = req.body ?? {};
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body must be a template object' });
    if (typeof body.id !== 'string' || body.id.trim() !== pathId) {
      return res.status(400).json({ error: 'Body `id` must match path `:id`' });
    }
    const serialized = JSON.stringify(body);
    if (serialized.length > USER_TEMPLATE_MAX_BYTES) {
      return res.status(400).json({ error: `Template exceeds ${USER_TEMPLATE_MAX_BYTES} bytes` });
    }
    const nowIso = new Date().toISOString();
    await req.db.run(
      `INSERT INTO wiring_user_templates (tenant_id, template_id, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (tenant_id, template_id) DO UPDATE
         SET data       = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at`,
      [req.tenantId, pathId, serialized, nowIso]
    );
    res.json({ ok: true, updatedAt: nowIso });
  } catch (err) { serverError(res, err); }
});

app.delete('/api/wiring/library/:id', requireAuth, requireNotDemo, async (req, res) => {
  try {
    const pathId = String(req.params.id || '').trim();
    if (!pathId) return res.status(400).json({ error: 'Missing template id in path' });
    await req.db.run(
      'DELETE FROM wiring_user_templates WHERE tenant_id = ? AND template_id = ?',
      [req.tenantId, pathId]
    );
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});


// ─── Expenses API ─────────────────────────────────────────────────────


function expenseRow(row) {
  return {
    id: row.id, date: row.date, amount: row.amount, currency: row.currency,
    exchangeRate: row.exchange_rate, amountHome: row.amount_home,
    description: row.description, vendor: row.vendor || '',
    category: row.category, assemblySection: row.assembly_section || '',
    partNumber: row.part_number || '',
    isCertificationRelevant: !!row.is_certification_relevant,
    receiptUrls: JSON.parse(row.receipt_urls || '[]'),
    notes: row.notes || '', tags: JSON.parse(row.tags || '[]'),
    link: row.link || '',
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

app.get('/api/expenses', requireAuth, async (req, res) => {
  try {
    const { category, section, year, month, certification } = req.query;
    let sql    = 'SELECT * FROM expenses WHERE tenant_id = ?';
    const params = [req.tenantId];
    if (category)        { sql += " AND (category = ? OR category LIKE ? OR category LIKE ? OR category LIKE ? OR category LIKE ? OR category LIKE ? OR category LIKE ? OR category LIKE ?)"; params.push(category, `${category},%`, `%,${category}`, `%,${category},%`, `${category}:%`, `%,${category}:%`, `%,${category}:_%,%`, `%,${category}:_%`); }
    if (section)         { sql += ' AND assembly_section = ?';                   params.push(section); }
    if (year)            { sql += ' AND substr(date, 1, 4) = ?';                  params.push(year); }
    if (month)           { sql += ' AND substr(date, 6, 2) = ?';                  params.push(month.padStart(2, '0')); }
    if (certification === '1') { sql += ' AND is_certification_relevant = 1'; }
    sql += ' ORDER BY date DESC, created_at DESC';
    const rows = await req.db.all(sql, params);
    res.json(rows.map(expenseRow));
  } catch (err) { serverError(res, err); }
});

app.get('/api/expenses/stats', requireAuth, async (req, res) => {
  try {
    const rows      = await req.db.all('SELECT * FROM expenses WHERE tenant_id = ?', [req.tenantId]);
    const totalHome = rows.reduce((s, r) => s + r.amount_home, 0);
    const byCategory = {};
    const bySection  = {};
    for (const r of rows) {
      // Support weighted categories: "cat1:60,cat2:40" or equal split "cat1,cat2"
      const rawCats = r.category ? r.category.split(',').map(c => c.trim()).filter(Boolean) : ['other'];
      const hasWeights = rawCats.some(c => c.includes(':'));
      let catShares;
      if (hasWeights) {
        catShares = rawCats.map(c => { const [id, w] = c.split(':'); return { id: id.trim(), pct: parseFloat(w) || 0 }; });
      } else {
        const pct = 100 / rawCats.length;
        catShares = rawCats.map(id => ({ id, pct }));
      }
      for (const cs of catShares) byCategory[cs.id] = (byCategory[cs.id] || 0) + (r.amount_home * cs.pct / 100);
      if (r.assembly_section) bySection[r.assembly_section] = (bySection[r.assembly_section] || 0) + r.amount_home;
    }
    const budgetRows = await req.db.all('SELECT * FROM expense_budgets WHERE tenant_id = ?', [req.tenantId]);
    const budgets    = {};
    for (const b of budgetRows) budgets[b.category] = b.budget_amount;
    const monthly = await req.db.all(
      `SELECT substr(date, 1, 7) as month, SUM(amount_home) as total FROM expenses WHERE tenant_id = ? GROUP BY month ORDER BY month DESC LIMIT 12`,
      [req.tenantId]
    );
    res.json({ totalHome, byCategory, bySection, budgets, monthly, count: rows.length });
  } catch (err) { serverError(res, err); }
});

app.get('/api/expenses/export/csv', requireAuth, async (req, res) => {
  try {
    const rows   = await req.db.all('SELECT * FROM expenses WHERE tenant_id = ? ORDER BY date DESC', [req.tenantId]);
    const header = 'Date,Description,Vendor,Category,Section,Amount,Currency,Exchange Rate,Amount EUR,Part Number,Certification Relevant,Notes,Link';
    const lines  = rows.map(r => [
      r.date, `"${(r.description||'').replace(/"/g,'""')}"`, `"${(r.vendor||'').replace(/"/g,'""')}"`,
      r.category, r.assembly_section || '', r.amount, r.currency, r.exchange_rate, r.amount_home.toFixed(2),
      r.part_number || '', r.is_certification_relevant ? 'Yes' : 'No',
      `"${(r.notes||'').replace(/"/g,'""')}"`, r.link || ''
    ].join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (err) { serverError(res, err); }
});

app.get('/api/expenses/budgets', requireAuth, async (req, res) => {
  try {
    const rows    = await req.db.all('SELECT * FROM expense_budgets WHERE tenant_id = ?', [req.tenantId]);
    const budgets = {};
    for (const r of rows) budgets[r.category] = r.budget_amount;
    res.json(budgets);
  } catch (err) { serverError(res, err); }
});

app.put('/api/expenses/budgets', requireAuth, async (req, res) => {
  try {
    const budgets = req.body;
    // Clear existing budgets for this tenant, then insert the new ones
    const existing = await req.db.all('SELECT category FROM expense_budgets WHERE tenant_id = ?', [req.tenantId]);
    const existingCats = new Set(existing.map(r => r.category));
    const sentCats = new Set(Object.keys(budgets));
    // Delete budgets no longer present or zeroed out
    for (const cat of existingCats) {
      if (!sentCats.has(cat) || !(budgets[cat] > 0)) {
        await req.db.run('DELETE FROM expense_budgets WHERE category = ? AND tenant_id = ?', [cat, req.tenantId]);
      }
    }
    // Upsert sent budgets
    for (const [cat, amount] of Object.entries(budgets)) {
      if (amount != null && amount > 0) {
        await req.db.run(
          'INSERT OR REPLACE INTO expense_budgets (category, tenant_id, budget_amount) VALUES (?, ?, ?)',
          [cat, req.tenantId, amount]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.get('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get('SELECT * FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(expenseRow(row));
  } catch (err) { serverError(res, err); }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
  try {
    const { date, amount, currency, exchangeRate, description, vendor, category, assemblySection, partNumber, isCertificationRelevant, receiptUrls, notes, tags, link } = req.body;
    if (!date || !amount || !description) return res.status(400).json({ error: 'date, amount and description are required' });
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'amount must be a non-negative number' });
    if (exchangeRate !== undefined && (typeof exchangeRate !== 'number' || !Number.isFinite(exchangeRate) || exchangeRate <= 0)) return res.status(400).json({ error: 'exchangeRate must be a positive number' });
    const id   = uuidv4();
    const rate = exchangeRate || 1.0;
    const now  = new Date().toISOString();
    await req.db.run(
      `INSERT INTO expenses (id, tenant_id, date, amount, currency, exchange_rate, amount_home, description, vendor, category, assembly_section, part_number, is_certification_relevant, receipt_urls, notes, tags, link, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.tenantId, date, amount, currency || 'EUR', rate, amount * rate, description, vendor || '', category || 'other', assemblySection || '', partNumber || '', isCertificationRelevant ? 1 : 0, JSON.stringify(receiptUrls || []), notes || '', JSON.stringify(tags || []), link || '', now, now]
    );
    res.json({ ok: true, id });
  } catch (err) { serverError(res, err); }
});

app.put('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const existing = await req.db.get('SELECT * FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { date, amount, currency, exchangeRate, description, vendor, category, assemblySection, partNumber, isCertificationRelevant, receiptUrls, notes, tags, link } = req.body;
    if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)) return res.status(400).json({ error: 'amount must be a non-negative number' });
    if (exchangeRate !== undefined && (typeof exchangeRate !== 'number' || !Number.isFinite(exchangeRate) || exchangeRate <= 0)) return res.status(400).json({ error: 'exchangeRate must be a positive number' });
    const rate = exchangeRate ?? existing.exchange_rate;
    const amt  = amount      ?? existing.amount;
    // Clean up receipt files that were removed
    const oldUrls = JSON.parse(existing.receipt_urls || '[]');
    const newUrls = receiptUrls ?? oldUrls;
    const removed = oldUrls.filter(u => !newUrls.includes(u));
    for (const url of removed) await receiptStore.delete(url).catch(err => console.error('Failed to delete receipt:', err.message));

    await req.db.run(
      `UPDATE expenses SET date=?, amount=?, currency=?, exchange_rate=?, amount_home=?, description=?, vendor=?, category=?, assembly_section=?, part_number=?, is_certification_relevant=?, receipt_urls=?, notes=?, tags=?, link=?, updated_at=? WHERE id=? AND tenant_id=?`,
      [date ?? existing.date, amt, currency ?? existing.currency, rate, amt * rate,
       description ?? existing.description, vendor ?? existing.vendor, category ?? existing.category,
       assemblySection ?? existing.assembly_section, partNumber ?? existing.part_number,
       isCertificationRelevant != null ? (isCertificationRelevant ? 1 : 0) : existing.is_certification_relevant,
       JSON.stringify(newUrls),
       notes ?? existing.notes, JSON.stringify(tags ?? JSON.parse(existing.tags)), link ?? existing.link ?? '',
       new Date().toISOString(), req.params.id, req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get('SELECT receipt_urls FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    for (const url of JSON.parse(row.receipt_urls || '[]')) {
      await receiptStore.delete(url).catch(err => console.error('Failed to delete receipt:', err.message));
    }
    await req.db.run('DELETE FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.post('/api/expenses/upload', requireAuth, receiptUpload.array('files', 10), async (req, res) => {
  try {
    const urls = [];
    for (const file of req.files) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      let receiptUrl;
      if (file.mimetype === 'application/pdf') {
        const filename = `${uuidv4()}-${safeName}`;
        receiptUrl = await receiptStore.save(filename, file.buffer, 'application/pdf', req.user?.slug);
      } else {
        const filename = `${uuidv4()}-${safeName.replace(/\.[^.]+$/, '.jpg')}`;
        const buf = await sharp(file.buffer).rotate().resize(1920, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        receiptUrl = await receiptStore.save(filename, buf, 'image/jpeg', req.user?.slug);
      }
      urls.push(receiptUrl);
      await req.db.run('INSERT OR REPLACE INTO pending_uploads (url, tenant_id, uploaded_at) VALUES (?, ?, ?)', [receiptUrl, req.tenantId, Date.now()]);
    }
    res.json({ urls });
  } catch (err) { serverError(res, err); }
});

app.delete('/api/expenses/upload', requireAuth, async (req, res) => {
  const { url } = req.body;
  try {
    if (url) {
      await receiptStore.delete(url);
      await req.db.run('DELETE FROM pending_uploads WHERE url = ? AND tenant_id = ?', [url, req.tenantId]);
    }
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INVENTORY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Row mappers
function locationRow(r) {
  return { id: Number(r.id), name: r.name, description: r.description || '', parentId: r.parent_id ? Number(r.parent_id) : null, sortOrder: r.sort_order, createdAt: r.created_at };
}
function partRow(r) {
  return { id: Number(r.id), partNumber: r.part_number, name: r.name, manufacturer: r.manufacturer || '', kit: r.kit || '', subKit: r.sub_kit || '', category: r.category || 'other', bag: r.bag || '', notes: r.notes || '', createdAt: r.created_at };
}
function stockRow(r) {
  return {
    id: Number(r.id), partId: Number(r.part_id), locationId: Number(r.location_id), quantity: r.quantity,
    unit: r.unit || 'pcs', status: r.status || 'in_stock', condition: r.condition || 'new',
    batch: r.batch || '', sourceKit: r.source_kit || '', mfgDate: r.mfg_date || '', notes: r.notes || '', updatedAt: r.updated_at,
    // joined fields (optional, present in list queries)
    partNumber: r.part_number, partName: r.part_name, manufacturer: r.manufacturer,
    locationName: r.location_name, locationPath: r.location_path,
  };
}

// ─── Locations ───────────────────────────────────────────────────────

app.get('/api/inventory/locations', requireAuth, async (req, res) => {
  try {
    const rows = await req.db.all('SELECT * FROM inventory_locations WHERE tenant_id = ? ORDER BY sort_order, name', [req.tenantId]);
    res.json(rows.map(locationRow));
  } catch (err) { serverError(res, err); }
});

app.post('/api/inventory/locations', requireAuth, async (req, res) => {
  try {
    const { name, description, parentId, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    await req.db.run(
      'INSERT INTO inventory_locations (tenant_id, name, description, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)',
      [req.tenantId, name, description || '', parentId || null, sortOrder || 0]
    );
    const row = await req.db.get('SELECT * FROM inventory_locations WHERE tenant_id = ? ORDER BY id DESC LIMIT 1', [req.tenantId]);
    res.json(locationRow(row));
  } catch (err) { serverError(res, err); }
});

app.put('/api/inventory/locations/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, parentId, sortOrder } = req.body;
    await req.db.run(
      'UPDATE inventory_locations SET name = ?, description = ?, parent_id = ?, sort_order = ? WHERE id = ? AND tenant_id = ?',
      [name, description || '', parentId || null, sortOrder ?? 0, req.params.id, req.tenantId]
    );
    const row = await req.db.get('SELECT * FROM inventory_locations WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json(locationRow(row));
  } catch (err) { serverError(res, err); }
});

app.delete('/api/inventory/locations/:id', requireAuth, async (req, res) => {
  try {
    const cascade = req.query.cascade === 'true';
    if (cascade) {
      // Collect all descendant location IDs recursively
      const allIds = [Number(req.params.id)];
      const queue = [Number(req.params.id)];
      while (queue.length > 0) {
        const parentId = queue.shift();
        const children = await req.db.all('SELECT id FROM inventory_locations WHERE parent_id = ? AND tenant_id = ?', [parentId, req.tenantId]);
        for (const c of children) { allIds.push(c.id); queue.push(c.id); }
      }
      // Delete stock and locations for all collected IDs
      const placeholders = allIds.map(() => '?').join(',');
      await req.db.run(`DELETE FROM inventory_stock WHERE location_id IN (${placeholders}) AND tenant_id = ?`, [...allIds, req.tenantId]);
      await req.db.run(`DELETE FROM inventory_locations WHERE id IN (${placeholders}) AND tenant_id = ?`, [...allIds, req.tenantId]);
    } else {
      // Re-parent children to this location's parent
      const loc = await req.db.get('SELECT parent_id FROM inventory_locations WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
      if (loc) {
        await req.db.run('UPDATE inventory_locations SET parent_id = ? WHERE parent_id = ? AND tenant_id = ?', [loc.parent_id, req.params.id, req.tenantId]);
      }
      // Remove stock referencing this location
      await req.db.run('DELETE FROM inventory_stock WHERE location_id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
      await req.db.run('DELETE FROM inventory_locations WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    }
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Parts ───────────────────────────────────────────────────────────

app.get('/api/inventory/parts', requireAuth, async (req, res) => {
  try {
    const { search, category, kit, manufacturer } = req.query;
    let sql = 'SELECT * FROM inventory_parts WHERE tenant_id = ?';
    const params = [req.tenantId];
    if (search)       { sql += ' AND (part_number LIKE ? OR name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (category)     { sql += ' AND category = ?'; params.push(category); }
    if (kit)          { sql += ' AND kit = ?'; params.push(kit); }
    if (manufacturer) { sql += ' AND manufacturer = ?'; params.push(manufacturer); }
    sql += ' ORDER BY part_number, name';
    const rows = await req.db.all(sql, params);
    res.json(rows.map(partRow));
  } catch (err) { serverError(res, err); }
});

app.post('/api/inventory/parts', requireAuth, async (req, res) => {
  try {
    const { partNumber, name, manufacturer, kit, subKit, category, bag, notes } = req.body;
    if (!partNumber) return res.status(400).json({ error: 'Part number is required' });
    await req.db.run(
      'INSERT INTO inventory_parts (tenant_id, part_number, name, manufacturer, kit, sub_kit, category, bag, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, partNumber, name || partNumber, manufacturer || '', kit || '', subKit || '', category || 'other', bag || '', notes || '']
    );
    const row = await req.db.get('SELECT * FROM inventory_parts WHERE tenant_id = ? ORDER BY id DESC LIMIT 1', [req.tenantId]);
    res.json(partRow(row));
  } catch (err) { serverError(res, err); }
});

// Find-or-create part by part number (used by mass ingestion)
// Also creates a stock entry with the given quantity so the part appears in inventory.
app.post('/api/inventory/parts/ingest', requireAuth, async (req, res) => {
  try {
    const { partNumber, name, manufacturer, kit, subKit, category, mfgDate, bag, notes, quantity, unit, status: stockStatus, locationId: reqLocationId } = req.body;
    if (!partNumber) return res.status(400).json({ error: 'Part number is required' });

    // Try to find existing part by exact part_number (case-insensitive)
    let row = await req.db.get(
      'SELECT * FROM inventory_parts WHERE tenant_id = ? AND LOWER(part_number) = LOWER(?)',
      [req.tenantId, partNumber]
    );
    let created = false;
    if (row) {
      // Part already exists — don't overwrite kit/bag on the part (those belong on the stock entry)
    } else {
      // Create new part
      await req.db.run(
        'INSERT INTO inventory_parts (tenant_id, part_number, name, manufacturer, kit, sub_kit, category, bag, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.tenantId, partNumber, name || partNumber, manufacturer || '', kit || '', subKit || '', category || 'other', bag || '', notes || '']
      );
      row = await req.db.get('SELECT * FROM inventory_parts WHERE tenant_id = ? ORDER BY id DESC LIMIT 1', [req.tenantId]);
      created = true;
    }

    // Auto-create stock entry if quantity provided (mass ingestion flow)
    const qty = quantity != null ? Number(quantity) : null;
    if (qty != null && qty >= 0) {
      let locId = reqLocationId ? Number(reqLocationId) : null;

      // If no explicit location, find or create "Incoming"
      if (!locId) {
        let loc = await req.db.get(
          "SELECT id FROM inventory_locations WHERE tenant_id = ? AND LOWER(name) = 'incoming'",
          [req.tenantId]
        );
        if (!loc) {
          await req.db.run(
            "INSERT OR IGNORE INTO inventory_locations (tenant_id, name, description, sort_order) VALUES (?, 'Incoming', 'Default location for mass ingestion', 0)",
            [req.tenantId]
          );
          loc = await req.db.get("SELECT id FROM inventory_locations WHERE tenant_id = ? AND LOWER(name) = 'incoming'", [req.tenantId]);
        }
        locId = loc?.id ?? null;
      }

      if (locId) {
        const insertResult = await req.db.run(
          `INSERT INTO inventory_stock (tenant_id, part_id, location_id, quantity, unit, status, condition, batch, source_kit, mfg_date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.tenantId, row.id, locId, qty, unit || 'pcs', stockStatus || 'in_stock', 'new', bag || '', kit || '', mfgDate || '', notes || '']
        );
        // Return the new stock row's id so the client can undo (delete) this
        // specific row later — supports the mass-ingestion "delete scanned
        // item" affordance without ambiguity when the same part has multiple
        // stock entries across bags/locations.
        return res.json({ part: partRow(row), created, stockId: insertResult?.lastID ?? null });
      } else {
        console.warn('[ingest] Could not find or create location for tenant', req.tenantId);
      }
    }

    res.json({ part: partRow(row), created, stockId: null });
  } catch (err) { serverError(res, err); }
});

app.put('/api/inventory/parts/:id', requireAuth, async (req, res) => {
  try {
    const { partNumber, name, manufacturer, kit, subKit, category, bag, notes } = req.body;
    await req.db.run(
      'UPDATE inventory_parts SET part_number = ?, name = ?, manufacturer = ?, kit = ?, sub_kit = ?, category = ?, bag = ?, notes = ? WHERE id = ? AND tenant_id = ?',
      [partNumber, name, manufacturer || '', kit || '', subKit || '', category || 'other', bag || '', notes || '', req.params.id, req.tenantId]
    );
    const row = await req.db.get('SELECT * FROM inventory_parts WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json(partRow(row));
  } catch (err) { serverError(res, err); }
});

app.delete('/api/inventory/parts/:id', requireAuth, async (req, res) => {
  try {
    // Get the part number before deleting (to reset check session items)
    const part = await req.db.get('SELECT part_number FROM inventory_parts WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    await req.db.run('DELETE FROM inventory_stock WHERE part_id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    await req.db.run('DELETE FROM inventory_parts WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    // Reset matching check items in active/paused sessions back to pending
    if (part) {
      const sessions = await req.db.all(
        "SELECT id FROM inventory_check_sessions WHERE tenant_id = ? AND status IN ('active', 'paused')",
        [req.tenantId]
      );
      for (const s of sessions) {
        await req.db.run(
          `UPDATE inventory_check_items SET status = 'pending', qty_found = 0, scanned_at = NULL
           WHERE session_id = ? AND tenant_id = ? AND LOWER(part_number) = LOWER(?)`,
          [s.id, req.tenantId, part.part_number]
        );
        // Recompute session counts
        const counts = await req.db.get(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
                  SUM(CASE WHEN status = 'missing' THEN 1 ELSE 0 END) as missing
           FROM inventory_check_items WHERE session_id = ? AND tenant_id = ?`,
          [s.id, req.tenantId]
        );
        await req.db.run(
          `UPDATE inventory_check_sessions SET total_items = ?, verified_items = ?, missing_items = ?, updated_at = ?
           WHERE id = ? AND tenant_id = ?`,
          [counts.total, counts.verified, counts.missing, new Date().toISOString(), s.id, req.tenantId]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Stock ───────────────────────────────────────────────────────────

app.get('/api/inventory/stock', requireAuth, async (req, res) => {
  try {
    const { partId, locationId, status, search } = req.query;
    let sql = `SELECT s.*, p.part_number, p.name AS part_name, p.manufacturer, l.name AS location_name
               FROM inventory_stock s
               JOIN inventory_parts p ON p.id = s.part_id AND p.tenant_id = s.tenant_id
               JOIN inventory_locations l ON l.id = s.location_id AND l.tenant_id = s.tenant_id
               WHERE s.tenant_id = ?`;
    const params = [req.tenantId];
    if (partId)     { sql += ' AND s.part_id = ?'; params.push(partId); }
    if (locationId) { sql += ' AND s.location_id = ?'; params.push(locationId); }
    if (status)     { sql += ' AND s.status = ?'; params.push(status); }
    if (search)     { sql += ' AND (p.part_number LIKE ? OR p.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY p.part_number, l.name';
    const rows = await req.db.all(sql, params);
    res.json(rows.map(stockRow));
  } catch (err) { serverError(res, err); }
});

app.post('/api/inventory/stock', requireAuth, async (req, res) => {
  try {
    const { partId, locationId, quantity, unit, status, condition, batch, sourceKit, mfgDate, notes } = req.body;
    if (!partId || !locationId) return res.status(400).json({ error: 'Part and location are required' });
    await req.db.run(
      `INSERT INTO inventory_stock (tenant_id, part_id, location_id, quantity, unit, status, condition, batch, source_kit, mfg_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, partId, locationId, quantity ?? 0, unit || 'pcs', status || 'in_stock', condition || 'new', batch || '', sourceKit || '', mfgDate || '', notes || '']
    );
    const latest = await req.db.get('SELECT id FROM inventory_stock WHERE tenant_id = ? ORDER BY id DESC LIMIT 1', [req.tenantId]);
    const row = await req.db.get(
      `SELECT s.*, p.part_number, p.name AS part_name, p.manufacturer, l.name AS location_name
       FROM inventory_stock s
       JOIN inventory_parts p ON p.id = s.part_id AND p.tenant_id = s.tenant_id
       JOIN inventory_locations l ON l.id = s.location_id AND l.tenant_id = s.tenant_id
       WHERE s.id = ? AND s.tenant_id = ?`, [latest.id, req.tenantId]
    );
    res.json(stockRow(row));
  } catch (err) { serverError(res, err); }
});

app.put('/api/inventory/stock/:id', requireAuth, async (req, res) => {
  try {
    const fields = []; const values = [];
    if (req.body.partId     !== undefined) { fields.push('part_id = ?');     values.push(req.body.partId); }
    if (req.body.locationId !== undefined) { fields.push('location_id = ?'); values.push(req.body.locationId); }
    if (req.body.quantity   !== undefined) { fields.push('quantity = ?');     values.push(req.body.quantity ?? 0); }
    if (req.body.unit       !== undefined) { fields.push('unit = ?');         values.push(req.body.unit || 'pcs'); }
    if (req.body.status     !== undefined) { fields.push('status = ?');       values.push(req.body.status || 'in_stock'); }
    if (req.body.condition  !== undefined) { fields.push('condition = ?');    values.push(req.body.condition || 'new'); }
    if (req.body.batch      !== undefined) { fields.push('batch = ?');        values.push(req.body.batch || ''); }
    if (req.body.sourceKit  !== undefined) { fields.push('source_kit = ?');   values.push(req.body.sourceKit || ''); }
    if (req.body.mfgDate    !== undefined) { fields.push('mfg_date = ?');     values.push(req.body.mfgDate || ''); }
    if (req.body.notes      !== undefined) { fields.push('notes = ?');        values.push(req.body.notes || ''); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    await req.db.run(
      `UPDATE inventory_stock SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
      [...values, req.params.id, req.tenantId]
    );
    const row = await req.db.get(
      `SELECT s.*, p.part_number, p.name AS part_name, p.manufacturer, l.name AS location_name
       FROM inventory_stock s
       JOIN inventory_parts p ON p.id = s.part_id AND p.tenant_id = s.tenant_id
       JOIN inventory_locations l ON l.id = s.location_id AND l.tenant_id = s.tenant_id
       WHERE s.id = ? AND s.tenant_id = ?`, [req.params.id, req.tenantId]
    );
    res.json(stockRow(row));
  } catch (err) { serverError(res, err); }
});

app.delete('/api/inventory/stock/:id', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM inventory_stock WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Inventory Stats & Lookup ────────────────────────────────────────

app.get('/api/inventory/stats', requireAuth, async (req, res) => {
  try {
    const totalParts     = await req.db.get('SELECT COUNT(*) as count FROM inventory_parts WHERE tenant_id = ?', [req.tenantId]);
    const totalLocations = await req.db.get('SELECT COUNT(*) as count FROM inventory_locations WHERE tenant_id = ?', [req.tenantId]);
    const totalStock     = await req.db.get('SELECT COUNT(*) as count FROM inventory_stock WHERE tenant_id = ?', [req.tenantId]);
    const backordered    = await req.db.get("SELECT COUNT(*) as count FROM inventory_stock WHERE tenant_id = ? AND status = 'backordered'", [req.tenantId]);
    const installed      = await req.db.get("SELECT COUNT(*) as count FROM inventory_stock WHERE tenant_id = ? AND status = 'installed'", [req.tenantId]);
    const byCategory     = await req.db.all('SELECT category, COUNT(*) as count FROM inventory_parts WHERE tenant_id = ? GROUP BY category ORDER BY count DESC', [req.tenantId]);
    res.json({
      totalParts: totalParts.count, totalLocations: totalLocations.count,
      totalStock: totalStock.count, backordered: backordered.count,
      installed: installed.count, byCategory,
    });
  } catch (err) { serverError(res, err); }
});

app.get('/api/inventory/lookup/:partNumber', requireAuth, async (req, res) => {
  try {
    // Exact, case-insensitive match — the old substring `LIKE '%...%'`
    // meant looking up "AN3-3" also matched "AN3-3A", and a part with
    // zero stock rows was indistinguishable from a part that was never
    // imported at all (both returned `[]`). Starting from
    // inventory_parts with a LEFT JOIN fixes both: exact match, and a
    // part with no stock still comes back with `part` populated.
    const part = await req.db.get(
      'SELECT * FROM inventory_parts WHERE tenant_id = ? AND LOWER(part_number) = LOWER(?)',
      [req.tenantId, req.params.partNumber]
    );
    if (!part) return res.json({ part: null, stock: [] });

    const rows = await req.db.all(
      `SELECT s.*, p.part_number, p.name AS part_name, p.manufacturer, l.name AS location_name, l.id AS loc_id, l.parent_id AS loc_parent_id
       FROM inventory_stock s
       JOIN inventory_locations l ON l.id = s.location_id AND l.tenant_id = s.tenant_id
       WHERE s.tenant_id = ? AND s.part_id = ?
       ORDER BY l.name`,
      [req.tenantId, part.id]
    );
    // Build location paths
    const allLocs = await req.db.all('SELECT * FROM inventory_locations WHERE tenant_id = ?', [req.tenantId]);
    const locMap = Object.fromEntries(allLocs.map(l => [l.id, l]));
    function buildPath(locId) {
      const parts = [];
      let cur = locMap[locId];
      while (cur) { parts.unshift(cur.name); cur = cur.parent_id ? locMap[cur.parent_id] : null; }
      return parts.join(' → ');
    }
    res.json({
      part: partRow(part),
      stock: rows.map(r => ({ ...stockRow(r), locationPath: buildPath(r.location_id) })),
    });
  } catch (err) { serverError(res, err); }
});

// ─── Inventory Check Sessions ────────────────────────────────────────

// List all check sessions
app.get('/api/inventory/checks', requireAuth, async (req, res) => {
  try {
    const rows = await req.db.all(
      'SELECT * FROM inventory_check_sessions WHERE tenant_id = ? ORDER BY updated_at DESC',
      [req.tenantId]
    );
    res.json(rows.map(r => ({
      id: r.id, aircraftType: r.aircraft_type, kitId: r.kit_id, kitLabel: r.kit_label,
      status: r.status, totalItems: r.total_items, verifiedItems: r.verified_items,
      missingItems: r.missing_items, createdAt: r.created_at, updatedAt: r.updated_at,
    })));
  } catch (err) { serverError(res, err); }
});

// Create a new check session (pre-populates items from manifest)
app.post('/api/inventory/checks', requireAuth, async (req, res) => {
  try {
    const { aircraftType, kitId, kitLabel, items } = req.body;
    if (!aircraftType || !kitId || !items?.length) return res.status(400).json({ error: 'aircraftType, kitId, and items are required' });
    if (items.length > 50000) return res.status(400).json({ error: 'Too many items (max 50,000)' });

    await req.db.run(
      `INSERT INTO inventory_check_sessions (tenant_id, aircraft_type, kit_id, kit_label, status, total_items, verified_items, missing_items)
       VALUES (?, ?, ?, ?, 'active', ?, 0, 0)`,
      [req.tenantId, aircraftType, kitId, kitLabel || kitId, items.length]
    );
    const session = await req.db.get('SELECT * FROM inventory_check_sessions WHERE tenant_id = ? ORDER BY id DESC LIMIT 1', [req.tenantId]);

    // Bulk insert items
    for (const item of items) {
      await req.db.run(
        `INSERT INTO inventory_check_items (session_id, tenant_id, part_number, nomenclature, sub_kit, bag, qty_expected, unit, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [session.id, req.tenantId, item.partNumber, item.nomenclature || '', item.subKit || '', item.bag || '', item.qtyExpected ?? 1, item.unit || 'pcs']
      );
    }

    res.json({
      id: session.id, aircraftType, kitId, kitLabel: kitLabel || kitId,
      status: 'active', totalItems: items.length, verifiedItems: 0, missingItems: 0,
      createdAt: session.created_at, updatedAt: session.updated_at,
    });
  } catch (err) { serverError(res, err); }
});

// Get session detail with items
app.get('/api/inventory/checks/:id', requireAuth, async (req, res) => {
  try {
    const session = await req.db.get(
      'SELECT * FROM inventory_check_sessions WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const items = await req.db.all(
      'SELECT * FROM inventory_check_items WHERE session_id = ? AND tenant_id = ? ORDER BY sub_kit, part_number',
      [session.id, req.tenantId]
    );

    res.json({
      id: session.id, aircraftType: session.aircraft_type, kitId: session.kit_id,
      kitLabel: session.kit_label, status: session.status,
      totalItems: session.total_items, verifiedItems: session.verified_items,
      missingItems: session.missing_items,
      createdAt: session.created_at, updatedAt: session.updated_at,
      // Legacy rows written before 'partial' existed have status='pending'
      // even when qty_found > 0. Promote them on read so the user sees the
      // right tab without a one-shot migration. New writes already set
      // 'partial' directly — see verify-batch above.
      items: items.map(r => {
        const promoted = r.status === 'pending' && (r.qty_found || 0) > 0 && (r.qty_found || 0) < r.qty_expected
          ? 'partial'
          : r.status;
        return {
          id: r.id, partNumber: r.part_number, nomenclature: r.nomenclature,
          subKit: r.sub_kit, bag: r.bag, qtyExpected: r.qty_expected,
          qtyFound: r.qty_found, unit: r.unit, status: promoted,
          notes: r.notes, scannedAt: r.scanned_at,
        };
      }),
    });
  } catch (err) { serverError(res, err); }
});

// Update session status (pause/resume/complete)
app.put('/api/inventory/checks/:id', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'paused', 'completed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await req.db.run(
      "UPDATE inventory_check_sessions SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
      [status, new Date().toISOString(), req.params.id, req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// Delete a check session and its items
app.delete('/api/inventory/checks/:id', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM inventory_check_items WHERE session_id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    await req.db.run('DELETE FROM inventory_check_sessions WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// Update a check item (verify / mark missing / adjust qty)
app.put('/api/inventory/checks/:sessionId/items/:itemId', requireAuth, async (req, res) => {
  try {
    const { status, qtyFound, notes } = req.body;
    const fields = [];
    const params = [];
    if (status) { fields.push('status = ?'); params.push(status); }
    if (qtyFound != null) { fields.push('qty_found = ?'); params.push(qtyFound); }
    if (notes != null) { fields.push('notes = ?'); params.push(notes); }
    // Stamp scanned_at whenever the user touched the row in any meaningful
    // way (verified / missing / partial). Plain 'pending' resets don't get
    // a timestamp — that's how the reset-session endpoint clears it.
    if (status === 'verified' || status === 'missing' || status === 'partial') {
      fields.push("scanned_at = ?");
      params.push(new Date().toISOString());
    }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.itemId, req.params.sessionId, req.tenantId);
    await req.db.run(
      `UPDATE inventory_check_items SET ${fields.join(', ')} WHERE id = ? AND session_id = ? AND tenant_id = ?`,
      params
    );

    // Recompute session counts
    const counts = await req.db.get(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN status = 'missing' THEN 1 ELSE 0 END) as missing
       FROM inventory_check_items WHERE session_id = ? AND tenant_id = ?`,
      [req.params.sessionId, req.tenantId]
    );
    await req.db.run(
      "UPDATE inventory_check_sessions SET verified_items = ?, missing_items = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
      [counts.verified || 0, counts.missing || 0, new Date().toISOString(), req.params.sessionId, req.tenantId]
    );

    res.json({ ok: true, verified: counts.verified || 0, missing: counts.missing || 0 });
  } catch (err) { serverError(res, err); }
});

// Reconcile a check session against the actual inventory_stock totals.
// Use case: the user's mass-ingestion scans landed in inventory but earlier
// bugs (auto-sort flow not updating the session, kit-check writing to the
// wrong session, etc.) left the session items at 'pending' even though the
// physical parts are sitting in their crates and tracked in stock.
//
// For each non-verified session item we compute the matching in_stock
// quantity:
//   - if the item has a bag, only stock rows with batch=bag count
//     (so multi-bag parts don't double-promote)
//   - if the item has no bag, every in_stock row for that part number counts
// Then we set qty_found = min(stockTotal, qtyExpected) and:
//   stockTotal >= expected  → 'verified'
//   stockTotal > 0          → 'partial'
//   stockTotal == 0         → leave unchanged ('pending' / 'missing' stay)
// Missing items are left alone — they're a user-confirmed shortage, not
// something to silently overwrite from inventory.
app.post('/api/inventory/checks/:sessionId/reconcile', requireAuth, async (req, res) => {
  try {
    const items = await req.db.all(
      `SELECT id, part_number, COALESCE(bag, '') AS bag, qty_expected, qty_found, status
       FROM inventory_check_items
       WHERE session_id = ? AND tenant_id = ?`,
      [req.params.sessionId, req.tenantId]
    );

    let verifiedAdded = 0;
    let partialAdded = 0;
    let unchanged    = 0;
    const now = new Date().toISOString();

    for (const item of items) {
      // Don't second-guess already-verified or user-confirmed-missing rows
      if (item.status === 'verified' || item.status === 'missing') {
        unchanged++;
        continue;
      }

      const bag = item.bag || '';
      const totalRow = bag
        ? await req.db.get(
            `SELECT COALESCE(SUM(s.quantity), 0) AS total
             FROM inventory_stock s
             JOIN inventory_parts p ON p.id = s.part_id AND p.tenant_id = s.tenant_id
             WHERE s.tenant_id = ?
               AND UPPER(p.part_number) = UPPER(?)
               AND UPPER(COALESCE(s.batch, '')) = UPPER(?)
               AND s.status = 'in_stock'`,
            [req.tenantId, item.part_number, bag]
          )
        : await req.db.get(
            `SELECT COALESCE(SUM(s.quantity), 0) AS total
             FROM inventory_stock s
             JOIN inventory_parts p ON p.id = s.part_id AND p.tenant_id = s.tenant_id
             WHERE s.tenant_id = ?
               AND UPPER(p.part_number) = UPPER(?)
               AND s.status = 'in_stock'`,
            [req.tenantId, item.part_number]
          );
      const totalInStock = Number(totalRow?.total) || 0;

      // No stock found — leave 'pending' alone, that's the honest signal
      if (totalInStock <= 0) { unchanged++; continue; }

      const newQtyFound = Math.min(totalInStock, item.qty_expected);
      const newStatus   = newQtyFound >= item.qty_expected ? 'verified' : 'partial';

      // Already matches what's in inventory — nothing to update
      if (newStatus === item.status && Math.abs(newQtyFound - item.qty_found) < 0.001) {
        unchanged++;
        continue;
      }

      await req.db.run(
        `UPDATE inventory_check_items
         SET qty_found = ?, status = ?, scanned_at = ?
         WHERE id = ? AND session_id = ? AND tenant_id = ?`,
        [newQtyFound, newStatus, now, item.id, req.params.sessionId, req.tenantId]
      );
      if (newStatus === 'verified') verifiedAdded++;
      else                          partialAdded++;
    }

    // Recompute session-level rollups
    const counts = await req.db.get(
      `SELECT
         SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified,
         SUM(CASE WHEN status = 'missing'  THEN 1 ELSE 0 END) AS missing
       FROM inventory_check_items WHERE session_id = ? AND tenant_id = ?`,
      [req.params.sessionId, req.tenantId]
    );
    await req.db.run(
      "UPDATE inventory_check_sessions SET verified_items = ?, missing_items = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
      [counts.verified || 0, counts.missing || 0, now, req.params.sessionId, req.tenantId]
    );

    res.json({
      ok:             true,
      verifiedAdded,
      partialAdded,
      unchanged,
      totalItems:     items.length,
      verifiedTotal:  Number(counts.verified) || 0,
      missingTotal:   Number(counts.missing)  || 0,
    });
  } catch (err) { serverError(res, err); }
});

// Batch verify items (used by bag scanning in check mode)
// Accepts: { items: { partNumber: string, qtyFound: number, replace?: boolean }[] }
// Default: quantities ACCUMULATE across multiple scans (e.g., same rivet in
// multiple bags). When `replace: true` is set per item, qty_found is SET to
// qtyFound rather than added — used by the mass-scan tap-to-edit-quantity
// affordance where the user sets a known total in one shot instead of
// scanning the bag of 52 spacers 52 times.
//
// Status logic:
//   qty_found >= qty_expected  → 'verified'
//   qty_found > 0 but < expected → 'partial' (started, not done)
//   isShort=true                → 'missing' (user confirmed a shortage)
//   else                        → 'pending'
app.post('/api/inventory/checks/:sessionId/verify-batch', requireAuth, async (req, res) => {
  try {
    const { partNumbers, items } = req.body;
    // Normalize to { partNumber, qtyFound, replace } array
    const entries = items?.length
      ? items.map(i => ({ partNumber: i.partNumber, qtyFound: i.qtyFound, isShort: !!i.isShort, bag: i.bag || '', replace: !!i.replace }))
      : partNumbers?.length
        ? partNumbers.map(pn => ({ partNumber: pn, qtyFound: null, isShort: false, bag: '', replace: false }))  // null = use expected
        : [];
    if (entries.length === 0) return res.status(400).json({ error: 'partNumbers or items required' });
    if (entries.length > 10000) return res.status(400).json({ error: 'Too many items in batch (max 10,000)' });

    let matched = 0;
    for (const { partNumber, qtyFound, isShort, bag, replace } of entries) {
      // Match by part number + bag when bag is provided (parts can appear in multiple bags)
      let checkItem;
      if (bag) {
        checkItem = await req.db.get(
          `SELECT id, qty_expected, qty_found, status FROM inventory_check_items
           WHERE session_id = ? AND tenant_id = ? AND LOWER(part_number) = LOWER(?) AND LOWER(bag) = LOWER(?)`,
          [req.params.sessionId, req.tenantId, partNumber, bag]
        );
      }
      // Fallback: match by part number only (for single-part scans or items without bag)
      if (!checkItem) {
        checkItem = await req.db.get(
          `SELECT id, qty_expected, qty_found, status FROM inventory_check_items
           WHERE session_id = ? AND tenant_id = ? AND LOWER(part_number) = LOWER(?)`,
          [req.params.sessionId, req.tenantId, partNumber]
        );
      }
      if (!checkItem) continue;

      // qty_found:
      //   - normal scan        → accumulate (prev + new)
      //   - replace=true       → set directly (tap-to-edit-quantity path)
      const prevQty = checkItem.qty_found || 0;
      const addOrSet = qtyFound != null ? qtyFound : checkItem.qty_expected;
      const newTotal = replace ? Math.max(0, addOrSet) : prevQty + addOrSet;

      // Status:
      //   verified — total reached the expected quantity
      //   missing  — user explicitly flagged a shortage
      //   partial  — started, but qty_found < expected (visible as its own
      //              tab so half-scanned bags don't hide in 'pending')
      //   pending  — nothing scanned yet
      let newStatus;
      if (newTotal >= checkItem.qty_expected) {
        newStatus = 'verified';
      } else if (isShort) {
        newStatus = 'missing';
      } else if (checkItem.status === 'missing' && !replace) {
        // Preserve a previously-flagged shortage when accumulating new scans.
        // Replace mode is an explicit reset, so it gets re-classified normally.
        newStatus = 'missing';
      } else if (newTotal > 0) {
        newStatus = 'partial';
      } else {
        newStatus = 'pending';
      }

      const result = await req.db.run(
        `UPDATE inventory_check_items SET status = ?, qty_found = ?, scanned_at = ?
         WHERE id = ? AND session_id = ? AND tenant_id = ?`,
        [newStatus, newTotal, new Date().toISOString(), checkItem.id, req.params.sessionId, req.tenantId]
      );
      if (result.changes > 0) matched++;
    }

    // Recompute session counts
    const counts = await req.db.get(
      `SELECT
        SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN status = 'missing' THEN 1 ELSE 0 END) as missing
       FROM inventory_check_items WHERE session_id = ? AND tenant_id = ?`,
      [req.params.sessionId, req.tenantId]
    );
    await req.db.run(
      "UPDATE inventory_check_sessions SET verified_items = ?, missing_items = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
      [counts.verified || 0, counts.missing || 0, new Date().toISOString(), req.params.sessionId, req.tenantId]
    );

    res.json({ matched, verified: counts.verified || 0, missing: counts.missing || 0 });
  } catch (err) { serverError(res, err); }
});

// ─── Factory Reset ────────────────────────────────────────────────────

app.post('/api/reset', requireAuth, requireAdmin, async (req, res) => {
  try {
    await req.db.run('DELETE FROM sessions WHERE tenant_id = ?',           [req.tenantId]);
    await req.db.run('DELETE FROM blog_posts WHERE tenant_id = ?',         [req.tenantId]);
    await req.db.run('DELETE FROM expenses WHERE tenant_id = ?',           [req.tenantId]);
    await req.db.run('DELETE FROM sign_offs WHERE tenant_id = ?',          [req.tenantId]);
    await req.db.run('DELETE FROM active_timer WHERE tenant_id = ?',       [req.tenantId]);
    await req.db.run('DELETE FROM inventory_stock WHERE tenant_id = ?',    [req.tenantId]);
    await req.db.run('DELETE FROM inventory_parts WHERE tenant_id = ?',    [req.tenantId]);
    await req.db.run('DELETE FROM inventory_locations WHERE tenant_id = ?', [req.tenantId]);
    await req.db.run("DELETE FROM settings WHERE key != ? AND tenant_id = ?", ['auth_password_hash', req.tenantId]);
    if (STORAGE_BACKEND === 'r2') {
      await imageStore.deleteAll(req.user?.slug);
      await receiptStore.deleteAll(req.user?.slug);
      await signatureStore.deleteAll(req.user?.slug);
    } else {
      [UPLOADS_DIR, RECEIPTS_DIR, SIGNATURES_DIR].forEach(dir => {
        if (fs.existsSync(dir)) {
          for (const file of fs.readdirSync(dir)) {
            try { fs.unlinkSync(path.join(dir, file)); } catch {}
          }
        }
      });
    }
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── OpenGraph meta tag injection ────────────────────────────────────
const distIndexPath = path.join(DIST_PATH, 'index.html');

/** Prepend `base` to `raw` only when `raw` is a relative path. R2 / external
 *  image URLs come through already absolute; without this guard they get the
 *  tenant base URL concatenated in front, producing a double-`https://`. */
function resolveImageUrl(base, raw) {
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `${base}${raw}`;
}

/** Plain-text excerpt of a TipTap-style HTML blob — strip tags, collapse
 *  whitespace, and trim with an ellipsis. Used for crawler-readable
 *  index-page excerpts. */
function postExcerpt(html, maxLen = 200) {
  const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

/**
 * Walk a TipTap doc collecting text from every `text` node — for plain-text
 * excerpts and meta descriptions. `blog_posts.content` is stored as TipTap
 * JSON; without this we'd ship the raw JSON wrapper into the noscript /
 * meta description. Falls back to the HTML-strip path for legacy content.
 */
function tiptapToText(value, maxLen) {
  if (!value) return '';
  if (typeof value === 'string' && value[0] !== '{') return postExcerpt(value, maxLen);
  let doc;
  try { doc = typeof value === 'string' ? JSON.parse(value) : value; }
  catch { return postExcerpt(typeof value === 'string' ? value : '', maxLen); }
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n !== 'object') return;
    if (n.type === 'text' && typeof n.text === 'string') out.push(n.text);
    if (Array.isArray(n.content)) walk(n.content);
  };
  walk(doc);
  const text = out.join(' ').replace(/\s+/g, ' ').trim();
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

/** Render a single TipTap node (or array of nodes) to HTML. Unknown node
 *  types fall through to their children so we never leak raw JSON. */
function renderTiptapNode(node, opts = {}) {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(n => renderTiptapNode(n, opts)).join('');
  if (typeof node !== 'object') return '';
  const kids = Array.isArray(node.content) ? renderTiptapNode(node.content, opts) : '';
  switch (node.type) {
    case 'doc':         return kids;
    case 'paragraph':   return kids ? `<p>${kids}</p>\n` : '';
    case 'heading': {
      const level = Math.min(4, Math.max(2, node.attrs?.level || 2));
      return kids ? `<h${level}>${kids}</h${level}>\n` : '';
    }
    case 'bulletList':  return kids ? `<ul>${kids}</ul>\n` : '';
    case 'orderedList': return kids ? `<ol>${kids}</ol>\n` : '';
    case 'listItem':    return kids ? `<li>${kids}</li>` : '';
    case 'blockquote':  return kids ? `<blockquote>${kids}</blockquote>\n` : '';
    case 'hardBreak':   return '<br />';
    case 'text': {
      let t = escapeHtml(node.text || '');
      for (const m of (node.marks || [])) {
        if (m.type === 'bold')           t = `<strong>${t}</strong>`;
        else if (m.type === 'italic')    t = `<em>${t}</em>`;
        else if (m.type === 'underline') t = `<u>${t}</u>`;
        else if (m.type === 'strike')    t = `<s>${t}</s>`;
        else if (m.type === 'code')      t = `<code>${t}</code>`;
        else if (m.type === 'link' && m.attrs?.href) {
          const href = escapeHtml(m.attrs.href);
          t = `<a href="${href}" rel="nofollow noopener">${t}</a>`;
        }
      }
      return t;
    }
    case 'imageBlock':
    case 'image': {
      const src    = escapeHtml(node.attrs?.src || '');
      const rawAlt = (node.attrs?.alt || '').trim();
      // Fall back to a post-derived alt when the editor didn't capture one —
      // empty alts are an accessibility issue and an image-SEO loss. The
      // caller passes `opts.altFallback` (e.g. "Photo from: <post title>").
      const alt    = escapeHtml(rawAlt || opts.altFallback || '');
      return src ? `<img src="${src}" alt="${alt}" />\n` : '';
    }
    default:
      return kids;
  }
}

/** TipTap JSON → readable HTML for the noscript body. Legacy HTML content
 *  passes through unchanged. Unparseable JSON returns '' rather than
 *  leaking the raw blob into the page. */
function tiptapToHtml(value, opts = {}) {
  if (!value) return '';
  if (typeof value === 'string' && value[0] !== '{') return value;
  try {
    const doc = typeof value === 'string' ? JSON.parse(value) : value;
    return renderTiptapNode(doc, opts);
  } catch { return ''; }
}

/** First image URL inside a TipTap doc — used as an og:image fallback when
 *  the post has no separate `image_urls` entry. */
function tiptapFirstImage(value) {
  if (!value) return null;
  if (typeof value === 'string' && value[0] !== '{') return null;
  let doc;
  try { doc = typeof value === 'string' ? JSON.parse(value) : value; }
  catch { return null; }
  let found = null;
  const walk = (n) => {
    if (found) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n !== 'object' || !n) return;
    if ((n.type === 'imageBlock' || n.type === 'image') && n.attrs?.src) {
      found = n.attrs.src;
      return;
    }
    if (Array.isArray(n.content)) walk(n.content);
  };
  walk(doc);
  return found;
}

/**
 * Inject per-route SEO into the SPA's static index.html:
 *  - meta tags into `<head>` (OG, Twitter, canonical, robots, JSON-LD);
 *  - per-route `<title>` (the template ships with a generic title);
 *  - optional `bodyContent` rendered inside a `<noscript>` block — gives a
 *    crawler's first-pass HTML fetch the page text without waiting for the
 *    React app to mount. Google indexes `<noscript>` and browsers with JS
 *    enabled ignore it, so React renders normally for users.
 */
function injectOgTags(html, { title, description, imageUrl, pageUrl, noindex, canonical, jsonLd, ogType, bodyContent }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const p = escapeHtml(pageUrl);
  const i = escapeHtml(imageUrl);
  const c = escapeHtml(canonical);
  const tags = [
    noindex ? `<meta name="robots" content="noindex, nofollow" />` : '',
    canonical ? `<link rel="canonical" href="${c}" />` : '',
    `<meta property="og:type" content="${ogType || 'website'}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    pageUrl  ? `<meta property="og:url" content="${p}" />` : '',
    imageUrl ? `<meta property="og:image" content="${i}" />` : '',
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    imageUrl ? `<meta name="twitter:image" content="${i}" />` : '',
    // `jsonLd` may be a single object OR an array of objects (multiple
    // schemas per page, e.g. BlogPosting + BreadcrumbList). Emit one script
    // per item — preferred over a single `@graph` for indexing reliability.
    ...(Array.isArray(jsonLd) ? jsonLd : (jsonLd ? [jsonLd] : [])).map(item =>
      `<script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`),
  ].filter(Boolean).join('\n    ');
  let out = html.replace('</head>', `  ${tags}\n  </head>`);
  // Replace the static template `<title>` with the per-route title — og:title
  // alone doesn't update the tab / SERP-displayed title.
  if (title) {
    out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
  }
  // Replace the static template `<meta name="description">` with the per-route
  // description — Google's snippets prefer this over og:description.
  if (description) {
    out = out.replace(
      /<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/i,
      `<meta name="description" content="${d}" />`
    );
  }
  // Inject crawler-readable content into `<body>` so a crawler's first-pass
  // HTML fetch sees the page text rather than just the empty SPA root.
  if (bodyContent) {
    out = out.replace('</body>', `  <noscript>\n${bodyContent}\n  </noscript>\n  </body>`);
  }
  return out;
}

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  let host  = req.headers['x-forwarded-host']  || req.get('host');
  // Validate host to prevent host-header injection in OG tags
  if (!/^[a-zA-Z0-9._-]+(:\d+)?$/.test(host)) host = req.get('host') || 'localhost';
  return `${proto}://${host}`;
}

app.get('/blog', async (req, res) => {
  if (!fs.existsSync(distIndexPath)) return res.status(404).send('Not found');
  try {
    const html    = fs.readFileSync(distIndexPath, 'utf8');
    // Resolve the tenant from the subdomain — same pattern as /sitemap.xml.
    // The blog must serve the REQUESTED tenant's content. `getDefaultDb()`
    // returns the master table's first tenant — using it here would leak
    // that tenant's blog onto every other subdomain.
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    let tenant = null;
    if (MULTI_TENANT) {
      const parts = host.split('.');
      if (parts.length >= 3 && !isBareIpHost(host) && !['www', 'account', 'demo'].includes(parts[0])) {
        try { tenant = await getTenantBySlug(parts[0]); } catch {}
      }
    } else {
      try { tenant = await getFirstTenant(); } catch {}
    }
    const db       = tenant ? getTenantDb(tenant.id) : getDefaultDb();
    const isPublic = !tenant || tenant.public_blog !== 0;
    const general = await getSetting(db, 'general', DEFAULT_GENERAL);
    const projectName = general.projectName || 'Build Tracker';
    const totalRow    = await db.get(
      `SELECT COALESCE(SUM(duration_minutes),0) as total FROM sessions WHERE tenant_id = ?`,
      [db.tenantId]
    );
    const totalHours = Math.round((totalRow?.total || 0) / 60 * 10) / 10;
    const latestSession = await db.get(
      `SELECT image_urls FROM sessions WHERE tenant_id = ? AND image_urls != '[]' ORDER BY start_time DESC LIMIT 1`,
      [db.tenantId]
    );
    const imageUrls = latestSession ? JSON.parse(latestSession.image_urls || '[]') : [];
    const base      = baseUrl(req);
    const imageUrl  = resolveImageUrl(base, imageUrls[0]);
    const pageUrl   = `${base}/blog`;
    const title     = `${projectName} — Build Journal`;
    const description = `${totalHours}h logged so far. Follow along on this RV-10 homebuilt aircraft build.`;

    // Crawler-readable content + Blog JSON-LD only for indexable (public) blogs.
    let bodyContent;
    let jsonLd;
    if (isPublic) {
      const sectionConfigs = await getSetting(db, 'sections', DEFAULT_SECTIONS);
      const sectionLabel = (id) => (sectionConfigs.find(s => s.id === id)?.label) || id || '';
      const posts = await db.all(
        'SELECT id, title, content, published_at FROM blog_posts WHERE tenant_id = ? ORDER BY published_at DESC LIMIT 50',
        [db.tenantId]
      );
      const sessions = await db.all(
        `SELECT id, section, start_time, duration_minutes, notes FROM sessions
         WHERE tenant_id = ? ORDER BY start_time DESC LIMIT 50`,
        [db.tenantId]
      );
      const items = [
        ...posts.map(p => ({
          title: p.title, href: `/blog/${p.id}`, date: p.published_at, excerpt: tiptapToText(p.content, 200),
        })),
        ...sessions.map(s => {
          const hours = Math.floor(s.duration_minutes / 60);
          const mins  = Math.round(s.duration_minutes % 60);
          const dur   = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
          return {
            title: `${sectionLabel(s.section)} — Work Session (${dur})`,
            href: `/blog/session-${s.id}`,
            date: s.start_time,
            excerpt: postExcerpt(s.notes || ''),
          };
        }),
      ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const fmtDate = (iso) => iso ? new Date(iso).toISOString().slice(0, 10) : '';
      bodyContent =
        `    <header>\n` +
        `      <h1>${escapeHtml(title)}</h1>\n` +
        `      <p>${escapeHtml(description)}</p>\n` +
        `    </header>\n` +
        (items.length === 0
          ? `    <p>No posts yet.</p>\n`
          : `    <ul>\n` + items.map(item =>
              `      <li>\n` +
              `        <a href="${escapeHtml(item.href)}"><h2>${escapeHtml(item.title)}</h2></a>\n` +
              (item.date ? `        <time datetime="${escapeHtml(item.date)}">${escapeHtml(fmtDate(item.date))}</time>\n` : '') +
              (item.excerpt ? `        <p>${escapeHtml(item.excerpt)}</p>\n` : '') +
              `      </li>\n`
            ).join('') + `    </ul>\n`);

      jsonLd = items.length > 0 ? {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        url: pageUrl,
        name: title,
        description,
        blogPost: items.slice(0, 20).map(item => ({
          '@type': 'BlogPosting',
          headline: item.title,
          url: `${base}${item.href}`,
          ...(item.date ? { datePublished: item.date } : {}),
        })),
      } : undefined;
    }

    res.type('html').send(injectOgTags(html, {
      title, description, imageUrl, pageUrl,
      canonical: isPublic ? pageUrl : undefined,
      noindex: !isPublic,
      bodyContent, jsonLd,
    }));
  } catch { res.sendFile(distIndexPath); }
});

app.get('/blog/:postId', async (req, res) => {
  if (!fs.existsSync(distIndexPath)) return res.status(404).send('Not found');
  try {
    const html    = fs.readFileSync(distIndexPath, 'utf8');
    // Resolve the tenant from the subdomain — see the /blog handler above
    // for the rationale. Without this, every subdomain's posts route reads
    // the first tenant's blog_posts table.
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    let tenant = null;
    if (MULTI_TENANT) {
      const parts = host.split('.');
      if (parts.length >= 3 && !isBareIpHost(host) && !['www', 'account', 'demo'].includes(parts[0])) {
        try { tenant = await getTenantBySlug(parts[0]); } catch {}
      }
    } else {
      try { tenant = await getFirstTenant(); } catch {}
    }
    const db       = tenant ? getTenantDb(tenant.id) : getDefaultDb();
    const isPublic = !tenant || tenant.public_blog !== 0;
    const general = await getSetting(db, 'general', DEFAULT_GENERAL);
    const projectName = general.projectName || 'Build Tracker';
    const base    = baseUrl(req);
    const { postId } = req.params;
    let title, description, imageUrl, datePublished, dateModified, bodyHtml;

    if (postId.startsWith('session-')) {
      const sessionId = postId.replace('session-', '');
      const row       = await db.get('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?', [sessionId, db.tenantId]);
      if (row) {
        const sectionConfigs = await getSetting(db, 'sections', DEFAULT_SECTIONS);
        const label = (sectionConfigs.find(s => s.id === row.section)?.label) || row.section;
        const hours = Math.floor(row.duration_minutes / 60);
        const mins  = Math.round(row.duration_minutes % 60);
        const dur   = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        title       = `${label} — Work Session (${dur})`;
        description = row.notes || `${dur} build session logged on ${new Date(row.start_time).toLocaleDateString()}`;
        const imgs  = JSON.parse(row.image_urls || '[]');
        imageUrl    = resolveImageUrl(base, imgs[0]);
        datePublished = row.start_time;
        dateModified  = row.end_time || row.start_time;
        // Session notes are plain text — escape and wrap in <p>.
        bodyHtml = row.notes ? `<p>${escapeHtml(row.notes)}</p>` : '';
      }
    } else {
      const row = await db.get('SELECT * FROM blog_posts WHERE id = ? AND tenant_id = ?', [postId, db.tenantId]);
      if (row) {
        title = row.title;
        description = tiptapToText(row.content, 200) || `Build journal entry — ${projectName}`;
        const imgs  = JSON.parse(row.image_urls || '[]');
        const rawImg = imgs[0] || tiptapFirstImage(row.content);
        imageUrl    = resolveImageUrl(base, rawImg);
        datePublished = row.published_at;
        dateModified  = row.updated_at || row.published_at;
        // Content is TipTap JSON — render to readable HTML for the noscript
        // block so crawlers see prose instead of the raw JSON wrapper.
        // Pass an alt-text fallback so images without an editor-supplied
        // alt aren't left with `alt=""` (accessibility + image-SEO).
        bodyHtml = tiptapToHtml(row.content, { altFallback: `Photo from: ${row.title}` });
      }
    }

    if (!title) {
      // Honest 404 — return the status code, set noindex, and inject the
      // same hangar/rivet-styled body the SPA renders client-side so crawlers
      // see a real "not found" page instead of a duplicate of the blog index.
      const notFoundBody =
        `    <main>\n` +
        `      <p>404 — wrong heading</p>\n` +
        `      <h1>This page never made it out of the hangar.</h1>\n` +
        `      <p>Either the URL is misspelled, this logbook entry has been retired to a dusty hangar somewhere, or you followed a link to something that never got riveted into the build.</p>\n` +
        `      <p>The rest of the build log is still flying though — head back and pick something else to read.</p>\n` +
        `      <p><a href="/blog">Back to the build log →</a></p>\n` +
        `    </main>\n`;
      return res.status(404).type('html').send(injectOgTags(html, {
        title: `Wrong heading — ${projectName}`,
        description: `This page is not part of the ${projectName} build log.`,
        imageUrl: null, pageUrl: `${base}/blog/${postId}`,
        noindex: true,
        bodyContent: notFoundBody,
      }));
    }

    const pageUrl = `${base}/blog/${postId}`;
    const fmtDate = (iso) => iso ? new Date(iso).toISOString().slice(0, 10) : '';
    // Author resolution: explicit `authorName` setting overrides; otherwise
    // the tenant's username (subdomain slug) is used so we never leak the
    // real-name `display_name` to the public web. Self-hosted with no tenant
    // → Organization+projectName.
    const authorOverride = (general.authorName || '').trim();
    const authorUsername = (tenant?.slug || '').trim();
    const author = authorOverride
      ? { '@type': 'Person', name: authorOverride }
      : authorUsername
        ? { '@type': 'Person', name: authorUsername }
        : { '@type': 'Organization', name: projectName };
    const jsonLd = isPublic ? [
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: title,
        description,
        url: pageUrl,
        ...(datePublished ? { datePublished } : {}),
        ...(dateModified  ? { dateModified  } : {}),
        ...(imageUrl ? { image: imageUrl } : {}),
        author,
        publisher: { '@type': 'Organization', name: projectName },
        mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Blog', item: `${base}/blog` },
          { '@type': 'ListItem', position: 2, name: title, item: pageUrl },
        ],
      },
    ] : undefined;

    const bodyContent = isPublic
      ? `    <article>\n` +
        `      <h1>${escapeHtml(title)}</h1>\n` +
        (datePublished ? `      <time datetime="${escapeHtml(datePublished)}">${escapeHtml(fmtDate(datePublished))}</time>\n` : '') +
        (bodyHtml ? `      ${bodyHtml}\n` : '') +
        `    </article>\n`
      : undefined;

    res.type('html').send(injectOgTags(html, {
      title: `${title} — ${projectName}`, description, imageUrl,
      pageUrl, ogType: 'article',
      canonical: isPublic ? pageUrl : undefined,
      noindex: !isPublic,
      jsonLd, bodyContent,
    }));
  } catch { res.sendFile(distIndexPath); }
});

// ─── Sign-offs ────────────────────────────────────────────────────────

app.get('/api/signoffs', requireAuth, async (req, res) => {
  try {
    const rows = await req.db.all(
      'SELECT * FROM sign_offs WHERE tenant_id = ? ORDER BY date DESC, created_at DESC',
      [req.tenantId]
    );
    res.json(rows.map(r => ({
      id: r.id, packageId: r.package_id, packageLabel: r.package_label, sectionId: r.section_id,
      date: r.date, inspectorName: r.inspector_name,
      inspectionCompleted: !!r.inspection_completed, noCriticalIssues: !!r.no_critical_issues,
      executionSatisfactory: !!r.execution_satisfactory, reworkNeeded: !!r.rework_needed,
      comments: r.comments, signaturePng: r.signature_png, createdAt: r.created_at,
    })));
  } catch (err) { serverError(res, err); }
});

app.post('/api/signoffs', requireAuth, async (req, res) => {
  try {
    const { id, packageId, packageLabel, sectionId, date, inspectorName,
      inspectionCompleted, noCriticalIssues, executionSatisfactory, reworkNeeded,
      comments, signaturePng } = req.body;
    if (!packageId || !packageLabel || !date || !signaturePng) return res.status(400).json({ error: 'Missing required fields' });
    let signatureValue = signaturePng;
    if (signaturePng.startsWith('data:')) {
      const base64Data = signaturePng.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(base64Data, 'base64');
      signatureValue = await signatureStore.save(`${uuidv4()}.png`, buf, 'image/png', req.user?.slug);
    }
    await req.db.run(
      `INSERT INTO sign_offs (id,tenant_id,package_id,package_label,section_id,date,inspector_name,inspection_completed,no_critical_issues,execution_satisfactory,rework_needed,comments,signature_png) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.tenantId, packageId, packageLabel, sectionId || '', date,
       inspectorName || '', inspectionCompleted?1:0, noCriticalIssues?1:0,
       executionSatisfactory?1:0, reworkNeeded?1:0, comments || '', signatureValue]
    );
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.delete('/api/signoffs/:id', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get('SELECT signature_png FROM sign_offs WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (row?.signature_png && !row.signature_png.startsWith('data:')) {
      await signatureStore.delete(row.signature_png).catch(() => {});
    }
    await req.db.run('DELETE FROM sign_offs WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Inspection Sessions ───────────────────────────────────────────────

/** Idempotent migration: convert existing sign_offs rows to inspection_sessions + inspection_packages */
async function migrateSignOffsToSessions(db, tenantId) {
  try {
    const rows = await db.all('SELECT * FROM sign_offs WHERE tenant_id = ? ORDER BY date ASC, created_at ASC', [tenantId]);
    if (!rows.length) return;
    for (const r of rows) {
      const already = await db.get(
        "SELECT id FROM inspection_sessions WHERE tenant_id = ? AND notes LIKE ?",
        [tenantId, `%migrated:${r.id}%`]
      );
      if (already) continue;
      const sessionId = uuidv4();
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO inspection_sessions (id,tenant_id,session_name,date,inspector_name,inspector_id,notes,signature_png,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          [sessionId, tenantId, r.package_label || 'Inspection', r.date, r.inspector_name || '', '',
           `migrated:${r.id}`, r.signature_png || '', r.created_at || new Date().toISOString()]
        );
        const outcome = r.rework_needed ? 'rework' : (r.execution_satisfactory ? 'ok' : 'na');
        await tx.run(
          `INSERT INTO inspection_packages (id,session_id,tenant_id,package_id,package_label,section_id,outcome,notes,sort_order) VALUES (?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), sessionId, tenantId, r.package_id || '', r.package_label || '', r.section_id || '', outcome, r.comments || '', 0]
        );
      });
    }
    console.log(`[migration] Converted ${rows.length} sign_offs row(s) to inspection_sessions`);
  } catch (e) {
    console.warn('[migration] sign_offs migration warning:', e.message);
  }
}

app.get('/api/inspection-sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await req.db.all(
      'SELECT * FROM inspection_sessions WHERE tenant_id = ? ORDER BY date DESC, created_at DESC',
      [req.tenantId]
    );
    if (!sessions.length) return res.json([]);

    const sessionIds = sessions.map(s => s.id);
    const pkgPlaceholders = sessionIds.map(() => '?').join(',');
    const pkgs = await req.db.all(
      `SELECT * FROM inspection_packages WHERE tenant_id = ? AND session_id IN (${pkgPlaceholders}) ORDER BY sort_order ASC`,
      [req.tenantId, ...sessionIds]
    );

    const subItems = pkgs.length
      ? await req.db.all(
          `SELECT * FROM inspection_sub_items WHERE tenant_id = ? AND package_id IN (${pkgs.map(() => '?').join(',')}) ORDER BY sort_order ASC`,
          [req.tenantId, ...pkgs.map(p => p.id)]
        )
      : [];

    const subByPkg = {};
    for (const si of subItems) {
      if (!subByPkg[si.package_id]) subByPkg[si.package_id] = [];
      subByPkg[si.package_id].push({ id: si.id, label: si.label, outcome: si.outcome, notes: si.notes || '', sortOrder: si.sort_order });
    }
    const pkgBySession = {};
    for (const p of pkgs) {
      if (!pkgBySession[p.session_id]) pkgBySession[p.session_id] = [];
      pkgBySession[p.session_id].push({
        id: p.id, packageId: p.package_id, packageLabel: p.package_label,
        sectionId: p.section_id || '', outcome: p.outcome || 'ok', notes: p.notes || '',
        sortOrder: p.sort_order, subItems: subByPkg[p.id] || [],
      });
    }
    res.json(sessions.map(s => ({
      id: s.id, sessionName: s.session_name, date: s.date,
      inspectorName: s.inspector_name || '', inspectorId: s.inspector_id || '',
      notes: s.notes || '', signaturePng: s.signature_png || '',
      packages: pkgBySession[s.id] || [], createdAt: s.created_at,
    })));
  } catch (err) { serverError(res, err); }
});

app.post('/api/inspection-sessions', requireAuth, async (req, res) => {
  try {
    const { sessionName, date, inspectorName, inspectorId, notes, signaturePng, packages } = req.body;
    if (!sessionName || !date) return res.status(400).json({ error: 'sessionName and date are required' });
    let sigValue = signaturePng || '';
    if (sigValue.startsWith('data:')) {
      const base64 = sigValue.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(base64, 'base64');
      sigValue = await signatureStore.save(`${uuidv4()}.png`, buf, 'image/png', req.user?.slug);
    }
    const sessionId = uuidv4();
    await req.db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO inspection_sessions (id,tenant_id,session_name,date,inspector_name,inspector_id,notes,signature_png) VALUES (?,?,?,?,?,?,?,?)`,
        [sessionId, req.tenantId, sessionName, date, inspectorName || '', inspectorId || '', notes || '', sigValue]
      );
      for (let i = 0; i < (packages || []).length; i++) {
        const p = packages[i];
        const pkgId = uuidv4();
        await tx.run(
          `INSERT INTO inspection_packages (id,session_id,tenant_id,package_id,package_label,section_id,outcome,notes,sort_order) VALUES (?,?,?,?,?,?,?,?,?)`,
          [pkgId, sessionId, req.tenantId, p.packageId || '', p.packageLabel || '', p.sectionId || '', p.outcome || 'ok', p.notes || '', i]
        );
        for (let j = 0; j < (p.subItems || []).length; j++) {
          const si = p.subItems[j];
          await tx.run(
            `INSERT INTO inspection_sub_items (id,package_id,tenant_id,label,outcome,notes,sort_order) VALUES (?,?,?,?,?,?,?)`,
            [uuidv4(), pkgId, req.tenantId, si.label || '', si.outcome || 'ok', si.notes || '', j]
          );
        }
      }
    });
    res.json({ id: sessionId, ok: true });
  } catch (err) { serverError(res, err); }
});

app.put('/api/inspection-sessions/:id', requireAuth, async (req, res) => {
  try {
    const { sessionName, date, inspectorName, inspectorId, notes, signaturePng, packages } = req.body;
    const existing = await req.db.get('SELECT id, signature_png FROM inspection_sessions WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    let sigValue = signaturePng || '';
    if (sigValue.startsWith('data:')) {
      if (existing.signature_png && !existing.signature_png.startsWith('data:')) {
        await signatureStore.delete(existing.signature_png).catch(() => {});
      }
      const base64 = sigValue.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(base64, 'base64');
      sigValue = await signatureStore.save(`${uuidv4()}.png`, buf, 'image/png', req.user?.slug);
    } else if (!sigValue) {
      sigValue = existing.signature_png || '';
    }
    await req.db.transaction(async (tx) => {
      await tx.run(
        `UPDATE inspection_sessions SET session_name=?,date=?,inspector_name=?,inspector_id=?,notes=?,signature_png=? WHERE id=? AND tenant_id=?`,
        [sessionName, date, inspectorName || '', inspectorId || '', notes || '', sigValue, req.params.id, req.tenantId]
      );
      const oldPkgs = await tx.all('SELECT id FROM inspection_packages WHERE session_id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
      for (const op of oldPkgs) {
        await tx.run('DELETE FROM inspection_sub_items WHERE package_id = ? AND tenant_id = ?', [op.id, req.tenantId]);
      }
      await tx.run('DELETE FROM inspection_packages WHERE session_id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
      for (let i = 0; i < (packages || []).length; i++) {
        const p = packages[i];
        const pkgId = uuidv4();
        await tx.run(
          `INSERT INTO inspection_packages (id,session_id,tenant_id,package_id,package_label,section_id,outcome,notes,sort_order) VALUES (?,?,?,?,?,?,?,?,?)`,
          [pkgId, req.params.id, req.tenantId, p.packageId || '', p.packageLabel || '', p.sectionId || '', p.outcome || 'ok', p.notes || '', i]
        );
        for (let j = 0; j < (p.subItems || []).length; j++) {
          const si = p.subItems[j];
          await tx.run(
            `INSERT INTO inspection_sub_items (id,package_id,tenant_id,label,outcome,notes,sort_order) VALUES (?,?,?,?,?,?,?)`,
            [uuidv4(), pkgId, req.tenantId, si.label || '', si.outcome || 'ok', si.notes || '', j]
          );
        }
      }
    });
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.delete('/api/inspection-sessions/:id', requireAuth, async (req, res) => {
  try {
    const existing = await req.db.get('SELECT id, signature_png FROM inspection_sessions WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.signature_png && !existing.signature_png.startsWith('data:')) {
      await signatureStore.delete(existing.signature_png).catch(() => {});
    }
    const pkgs = await req.db.all('SELECT id FROM inspection_packages WHERE session_id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    for (const p of pkgs) {
      await req.db.run('DELETE FROM inspection_sub_items WHERE package_id = ? AND tenant_id = ?', [p.id, req.tenantId]);
    }
    await req.db.run('DELETE FROM inspection_packages WHERE session_id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    await req.db.run('DELETE FROM inspection_sessions WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Visitor tracking ─────────────────────────────────────────────────
const trackRateCache = new Map(); // ip → timestamp
setInterval(() => { const cutoff = Date.now() - 60000; for (const [k, v] of trackRateCache) { if (v < cutoff) trackRateCache.delete(k); } }, 60000).unref();

app.post('/api/track', async (req, res) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (/bot|crawler|spider|scraper|headless|prerender|curl|wget/.test(ua)) return res.json({ ok: true });
  // Rate limit: max 1 request per IP per 2 seconds
  const trackIp = req.ip || 'unknown';
  const lastTrack = trackRateCache.get(trackIp);
  if (lastTrack && Date.now() - lastTrack < 2000) return res.json({ ok: true });
  trackRateCache.set(trackIp, Date.now());
  try {
    const db      = req.db || getDefaultDb();
    const tenantId = req.tenantId || getDefaultTenantId();
    const country = ((req.headers['cf-ipcountry'] || 'XX') + '').toUpperCase().slice(0, 2);
    const body = req.body || {};
    const pagePath = String(body.path || '/blog').slice(0, 500);
    const postId = String(body.postId || '').slice(0, 100);
    const clientReferrer = String(body.referrer || '').slice(0, 500);
    let referrer = '';
    const refSource = clientReferrer || req.headers['referer'] || '';
    try {
      if (refSource) {
        const url  = new URL(refSource);
        const host = (req.headers['host'] || '').split(':')[0];
        if (host && !url.hostname.endsWith(host)) referrer = url.hostname;
      }
    } catch {}
    await db.run(
      'INSERT INTO visitor_stats (tenant_id, ts, path, country, referrer, post_id) VALUES (?, ?, ?, ?, ?, ?)',
      [tenantId, Date.now(), pagePath, country, referrer, postId || '']
    );
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

app.get('/api/stats/visitors', requireAuth, async (req, res) => {
  try {
    const days   = Math.min(parseInt(req.query.days) || 30, 365);
    const since  = Date.now() - days * 24 * 60 * 60 * 1000;
    const tid    = req.tenantId;

    const totalRow        = await req.db.get('SELECT COUNT(*) as n FROM visitor_stats WHERE tenant_id = ?', [tid]);
    const totalPeriodRow  = await req.db.get('SELECT COUNT(*) as n FROM visitor_stats WHERE tenant_id = ? AND ts > ?', [tid, since]);

    const countries = await req.db.all(
      `SELECT country, COUNT(*) as count FROM visitor_stats WHERE tenant_id = ? AND ts > ? AND country NOT IN ('XX','T1') GROUP BY country ORDER BY count DESC LIMIT 20`,
      [tid, since]
    );
    const referrers = await req.db.all(
      `SELECT referrer as domain, COUNT(*) as count FROM visitor_stats WHERE tenant_id = ? AND ts > ? AND referrer != '' GROUP BY referrer ORDER BY count DESC LIMIT 20`,
      [tid, since]
    );
    const topPosts = await req.db.all(
      `SELECT v.post_id, MIN(b.title) as title, COUNT(*) as count FROM visitor_stats v LEFT JOIN blog_posts b ON b.id = v.post_id AND b.tenant_id = ? WHERE v.tenant_id = ? AND v.ts > ? AND v.post_id != '' GROUP BY v.post_id ORDER BY count DESC LIMIT 10`,
      [tid, tid, since]
    );
    const daily = await req.db.all(
      DB_BACKEND === 'postgres'
        ? `SELECT to_char(to_timestamp(ts / 1000.0), 'YYYY-MM-DD') as date, COUNT(*) as count FROM visitor_stats WHERE tenant_id = ? AND ts > ? GROUP BY date ORDER BY date ASC`
        : `SELECT date(ts / 1000, 'unixepoch') as date, COUNT(*) as count FROM visitor_stats WHERE tenant_id = ? AND ts > ? GROUP BY date ORDER BY date ASC`,
      [tid, since]
    );
    res.json({ total: totalRow.n, totalPeriod: totalPeriodRow.n, countries, referrers, topPosts, daily, days });
  } catch (err) { serverError(res, err); }
});

app.delete('/api/stats/visitors', requireAuth, requireAdmin, async (req, res) => {
  try {
    await req.db.run('DELETE FROM visitor_stats WHERE tenant_id = ?', [req.tenantId]);
    res.json({ ok: true });
  } catch (err) { serverError(res, err); }
});

// ─── Debug / Diagnostics ─────────────────────────────────────────────

app.get('/api/debug/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const tid = req.tenantId;
    const sessRow    = await req.db.get('SELECT COUNT(*) as n FROM sessions WHERE tenant_id = ?',   [tid]);
    const expRow     = await req.db.get('SELECT COUNT(*) as n FROM expenses WHERE tenant_id = ?',   [tid]);
    const blogRow    = await req.db.get('SELECT COUNT(*) as n FROM blog_posts WHERE tenant_id = ?', [tid]);
    const countFiles = (dir, filter) => { try { const files = fs.readdirSync(dir); return filter ? files.filter(filter).length : files.length; } catch { return 0; } };
    res.json({
      timestamp: Date.now(), uptime: process.uptime(),
      memory: { rss: mem.rss, heapTotal: mem.heapTotal, heapUsed: mem.heapUsed, external: mem.external, arrayBuffers: mem.arrayBuffers },
      db: { backend: DB_BACKEND, sessions: sessRow.n, expenses: expRow.n, blogPosts: blogRow.n },
      uploads: {
        sessionImages: countFiles(UPLOADS_DIR, f => !f.includes('_thumb')),
        sessionThumbs: countFiles(UPLOADS_DIR, f => f.includes('_thumb')),
        receipts: countFiles(RECEIPTS_DIR),
        signatures: countFiles(SIGNATURES_DIR),
      },
      node: { version: process.version, platform: process.platform, arch: process.arch },
    });
  } catch (err) { serverError(res, err); }
});

app.get('/api/debug/logs', requireAuth, requireAdmin, (req, res) => {
  const since = parseInt(req.query.since) || 0;
  res.json(since ? SERVER_LOG_BUFFER.filter(e => e.ts > since) : SERVER_LOG_BUFFER);
});

// ─── Webhook API Key management ───────────────────────────────────────

app.get('/api/settings/webhook-key', requireAuth, async (req, res) => {
  try {
    let key = await getSetting(req.db, 'webhook_api_key', null);
    if (!key) {
      key = crypto.randomBytes(32).toString('hex');
      await setSetting(req.db, 'webhook_api_key', key);
      console.log('[webhook] Generated new API key');
    }
    res.json({ key });
  } catch (err) { serverError(res, err); }
});

app.post('/api/settings/webhook-key/regenerate', requireAuth, async (req, res) => {
  try {
    const key = crypto.randomBytes(32).toString('hex');
    await setSetting(req.db, 'webhook_api_key', key);
    console.log('[webhook] Regenerated API key');
    res.json({ key });
  } catch (err) { serverError(res, err); }
});

// ─── Webhook Timer endpoints ──────────────────────────────────────────

app.all('/api/webhook/timer/start', requireWebhookKey, async (req, res) => {
  try {
    const requestedSection = (req.query.section || req.body?.section || '').trim();
    let section = requestedSection;
    if (!section) {
      const lastSession = await req.db.get(
        'SELECT section FROM sessions WHERE tenant_id = ? ORDER BY end_time DESC LIMIT 1',
        [req.tenantId]
      );
      section = lastSession ? lastSession.section : 'empennage';
    }
    const startTime = new Date().toISOString();
    await req.db.run('DELETE FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    await req.db.run(
      'INSERT OR REPLACE INTO active_timer (tenant_id, section, start_time, image_urls) VALUES (?, ?, ?, ?)',
      [req.tenantId, section, startTime, '[]']
    );
    console.log(`[webhook] Timer started — section: ${section}`);
    res.json({ ok: true, section, startedAt: startTime });
  } catch (err) { serverError(res, err); }
});

app.all('/api/webhook/timer/stop', requireWebhookKey, async (req, res) => {
  try {
    const row = await req.db.get('SELECT * FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    if (!row) return res.status(404).json({ error: 'No active timer' });
    const endTime         = new Date();
    const startTime       = new Date(row.start_time);
    const durationMinutes = (endTime - startTime) / (1000 * 60);
    const sessionId       = uuidv4();
    await req.db.run(
      `INSERT INTO sessions (id, tenant_id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, req.tenantId, row.section, row.start_time, endTime.toISOString(), durationMinutes, '', null, '[]']
    );
    await req.db.run('DELETE FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    publishMqttStats(req.db);
    console.log(`[webhook] Timer stopped — section: ${row.section}, duration: ${durationMinutes.toFixed(1)} min`);
    res.json({ ok: true, sessionId, durationMinutes, section: row.section });
  } catch (err) { serverError(res, err); }
});

// ─── SPA fallback ─────────────────────────────────────────────────────

app.get('*', async (_req, res) => {
  if (!fs.existsSync(distIndexPath)) return res.status(404).send('Not found');
  try {
    const html    = fs.readFileSync(distIndexPath, 'utf8');
    const db      = getDefaultDb();
    const general = await getSetting(db, 'general', DEFAULT_GENERAL);
    const projectName = general.projectName || 'Build Tracker';
    const injected = injectOgTags(html, {
      title:       `${projectName} — BenchLog`,
      description: 'Track your build project — log sessions, visualize progress, document your journey.',
      imageUrl: null, pageUrl: null,
    });
    res.type('html').send(injected);
  } catch { res.sendFile(distIndexPath); }
});

// ─── Global error handler ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err.message, err.stack);
  serverError(res, err);
});

function startServer() {
  app.listen(PORT, () => {
    console.log(`Benchlog API running on port ${PORT}`);
    console.log(`DB backend: ${DB_BACKEND}`);
    if (DB_BACKEND === 'sqlite') console.log(`Data dir: ${DATA_DIR}`);
    const storageBackend = process.env.STORAGE_BACKEND || 'local';
    if (storageBackend === 'r2') {
      console.log(`Storage: Cloudflare R2 — bucket: ${process.env.R2_BUCKET}`);
    } else {
      console.log(`Storage: Local disk — ${UPLOADS_DIR}`);
    }
  });

  // Connect MQTT for every tenant after initialisation
  (async () => {
    try {
      const tenants = await listTenants();
      for (const { id } of tenants) {
        try {
          await connectMqtt(getTenantDb(id));
        } catch (e) {
          console.warn(`[mqtt] Startup connect failed for tenant ${id}:`, e.message);
        }
      }
    } catch (e) {
      console.warn('[mqtt] Could not enumerate tenants on startup:', e.message);
    }
  })();

  // Register scheduled jobs
  registerJob('pruneVisitorStats',         'Prune Visitor Stats',          'Deletes visitor stat entries older than 1 year',                        24 * 60 * 60 * 1000);
  registerJob('cleanupPendingUploads',     'Cleanup Pending Uploads',     'Removes orphaned uploaded files from storage and database',              60 * 60 * 1000);
  registerJob('cleanupOrphanedTenantData', 'Cleanup Orphaned Tenant Data','Removes data from tenants that no longer exist (PostgreSQL only)',       24 * 60 * 60 * 1000);
  registerJob('migrateDataUriSignatures', 'Migrate Signature Data URIs',  'Converts base64 data:URI signatures to stored files (one-time)',         0);
  registerJob('migrateDataUriBlogImages', 'Migrate Blog Image Data URIs', 'Converts base64 data:URI images in blog content to stored files (one-time)', 0);

  // Prune old visitor stats daily
  pruneVisitorStats();
  setInterval(pruneVisitorStats, 24 * 60 * 60 * 1000);

  // Clean up orphaned pending uploads hourly
  cleanupPendingUploads();
  setInterval(cleanupPendingUploads, 60 * 60 * 1000);

  // Clean up data from deleted tenants daily (delayed start — 5 min after boot)
  setTimeout(() => {
    cleanupOrphanedTenantData();
    setInterval(cleanupOrphanedTenantData, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);


  // One-time migrations: convert data:URIs to files (delayed start — 30s after boot)
  setTimeout(async () => {
    await migrateDataUriSignatures();
    await migrateDataUriBlogImages();
  }, 30 * 1000);
}
