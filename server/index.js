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
  getTenantById,
  createTenantRow,
  updateTenantRow,
  deleteTenantRow,
} = require('./db');
const { initMasterSchema, initTenantSchema, initPostgresSchema } = require('./schema');
const { DEFAULT_GENERAL, DEFAULT_SECTIONS, loadDefaultWorkPackages } = require('./tenant-defaults');

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
const TOKEN_EXPIRY_HOURS = 72;
// Clean up expired login attempt entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now >= entry.resetTime) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000).unref();

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_EXPIRY_HOURS * 3600000 })).toString('base64url');
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
    // In demo mode, attach the default db so route handlers work
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
const TEMPLATES_WP_PATH = path.join(__dirname, '../templates/work-packages');
const DEMO_MODE  = process.env.DEMO_MODE === 'true';
if (DEMO_MODE) console.log('[demo] Demo mode enabled — all write operations are blocked');
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
  const dirMap    = { receipts: RECEIPTS_DIR, signatures: SIGNATURES_DIR };
  const prefixMap = { receipts: '/receipts',  signatures: '/signatures' };
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
      if (partCols.length > 0 && !partCols.includes('mfg_date')) {
        sqlite.exec(`ALTER TABLE inventory_parts ADD COLUMN mfg_date TEXT DEFAULT ''`);
        console.log('[migration] Added mfg_date column to inventory_parts');
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
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
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
app.use(express.static(DIST_PATH, { maxAge: 0, etag: true, lastModified: true }));
app.use(express.json({ limit: '10mb' }));

// Resolve tenant from subdomain for public endpoints (postgres multi-tenant mode)
app.use(async (req, res, next) => {
  try { req.db = getDefaultDb(); req.tenantId = getDefaultTenantId(); } catch {}
  if (DB_BACKEND === 'postgres') {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    const parts = host.split('.');
    if (parts.length >= 3) {
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
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return res.status(403).json({ error: 'Demo mode — read only' });
    }
    next();
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

  // ── /receipts/* — expense attachments (always require auth) ──
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

  // ── /signatures/* — sign-off signatures (always require auth) ──
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
async function seedTenantDefaults(tenantId) {
  try {
    const db = getTenantDb(tenantId);
    // Seed general settings
    await setSetting(db, 'general', { ...DEFAULT_GENERAL });
    // Seed sections
    await setSetting(db, 'sections', [...DEFAULT_SECTIONS]);
    // Seed work packages from template
    const packages = loadDefaultWorkPackages();
    if (packages) await setSetting(db, 'flowchart_packages', packages);
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

    const { password, username } = req.body;
    let tenant = null;
    if (DB_BACKEND === 'postgres') {
      if (!username) return res.status(400).json({ error: 'Username is required' });
      tenant = await getTenantBySlug(username);
    } else {
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
    // Block non-admin login when maintenance mode is active
    // In single-tenant (SQLite) mode the sole user is always the admin
    const role = tenant.role || (DB_BACKEND === 'postgres' ? 'user' : 'admin');
    if (role !== 'admin') {
      const db = getTenantDb(tenant.id);
      const general = await getSetting(db, 'general', DEFAULT_GENERAL);
      if (general.maintenanceMode) {
        return res.status(503).json({ error: 'Server is in maintenance mode. Please try again later.' });
      }
    }
    const token = createToken({ role, tenantId: tenant.id, slug: tenant.slug });
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
    if (!DEMO_MODE && DB_BACKEND === 'postgres' && req.tenantId) {
      try {
        const tenantRow = await getTenantById(req.tenantId);
        if (tenantRow && (tenantRow.is_active === 0 || tenantRow.is_active === false)) {
          isDeactivated = true;
        }
      } catch {}
    }
    res.json({
      hasPassword:   DEMO_MODE ? true : hasPassword,
      authenticated: DEMO_MODE ? true : authenticated,
      demoMode:      DEMO_MODE,
      multiTenant:   DB_BACKEND === 'postgres',
      role:          DEMO_MODE ? 'admin' : role,
      maintenanceMode,
      isDeactivated,
    });
  } catch {
    res.json({ hasPassword: false, authenticated: false, demoMode: DEMO_MODE });
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
    const { section } = req.body;
    if (!section) return res.status(400).json({ error: 'Section is required' });
    const startTime = new Date().toISOString();
    await req.db.run('DELETE FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    await req.db.run(
      'INSERT OR REPLACE INTO active_timer (tenant_id, section, start_time, image_urls) VALUES (?, ?, ?, ?)',
      [req.tenantId, section, startTime, '[]']
    );
    res.json({ ok: true, section, startedAt: startTime });
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
    res.json({ running: true, section: row.section, startedAt: row.start_time, imageUrls: JSON.parse(row.image_urls || '[]') });
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
        batch: r.batch || '', sourceKit: r.source_kit || '', notes: r.notes || '', updatedAt: r.updated_at,
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
        `UPDATE inventory_parts SET part_number=?,name=?,manufacturer=?,kit=?,sub_kit=?,category=?,mfg_date=?,bag=?,notes=? WHERE id=? AND tenant_id=?`,
        [part.partNumber, part.name, part.manufacturer||'', part.kit||'', part.subKit||'', part.category||'other', part.mfgDate||'', part.bag||'', part.notes||'', existing.id, tenantId]
      );
      partIdMap.set(part.id, existing.id);
    } else {
      const r = await db.run(
        `INSERT INTO inventory_parts(tenant_id,part_number,name,manufacturer,kit,sub_kit,category,mfg_date,bag,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [tenantId, part.partNumber, part.name, part.manufacturer||'', part.kit||'', part.subKit||'', part.category||'other', part.mfgDate||'', part.bag||'', part.notes||'', part.createdAt||new Date().toISOString()]
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
        `UPDATE inventory_stock SET part_id=?,location_id=?,quantity=?,unit=?,status=?,condition=?,batch=?,source_kit=?,notes=?,updated_at=? WHERE id=? AND tenant_id=?`,
        [newPartId, newLocId, s.quantity, s.unit||'pcs', s.status||'in_stock', s.condition||'new', s.batch||'', s.sourceKit||'', s.notes||'', s.updatedAt, existing.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO inventory_stock(tenant_id,part_id,location_id,quantity,unit,status,condition,batch,source_kit,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [tenantId, newPartId, newLocId, s.quantity, s.unit||'pcs', s.status||'in_stock', s.condition||'new', s.batch||'', s.sourceKit||'', s.notes||'', s.updatedAt||new Date().toISOString()]
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
    const tables = ['sessions', 'blog_posts', 'expenses', 'expense_budgets', 'sign_offs', 'visitor_stats', 'pending_uploads'];
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

const ADMIN_BROWSABLE_TABLES = ['sessions', 'blog_posts', 'expenses', 'expense_budgets', 'sign_offs', 'visitor_stats', 'pending_uploads', 'inventory_locations', 'inventory_parts', 'inventory_stock'];
const ADMIN_TABLE_PK = {
  sessions: 'id', blog_posts: 'id', expenses: 'id', expense_budgets: 'category',
  sign_offs: 'id', visitor_stats: 'id', pending_uploads: 'url',
  inventory_locations: 'id', inventory_parts: 'id', inventory_stock: 'id',
};

// GET /api/admin/table/:table?tenantId=&limit=&offset=
app.get('/api/admin/table/:table', requireAuth, requireAdmin, async (req, res) => {
  const { table } = req.params;
  if (!ADMIN_BROWSABLE_TABLES.includes(table)) return res.status(400).json({ error: 'Invalid table' });
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const tenantFilter = req.query.tenantId || null;
  try {
    if (DB_BACKEND === 'postgres') {
      const where  = tenantFilter ? 'WHERE t.tenant_id = $1' : '';
      const params = tenantFilter ? [tenantFilter] : [];
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
      for (const tenant of tenants) {
        try {
          const tdb = getTenantDb(tenant.id);
          const countRow = await tdb.get(`SELECT COUNT(*) as count FROM ${table} WHERE tenant_id = ?`, [tenant.id]);
          totalCount += Number(countRow?.count || 0);
          const rows = await tdb.all(`SELECT * FROM ${table} WHERE tenant_id = ? LIMIT ? OFFSET ?`, [tenant.id, limit, offset]);
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
  try {
    if (DB_BACKEND === 'postgres') {
      if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
      if (tenantId !== req.tenantId) return res.status(403).json({ error: 'Forbidden' });
      await req.db.run(`DELETE FROM ${table} WHERE ${pkCol} = $1 AND tenant_id = $2`, [pk, tenantId]);
    } else {
      if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
      if (tenantId !== req.tenantId) return res.status(403).json({ error: 'Forbidden' });
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

app.get('/api/templates/work-packages', (_req, res) => {
  try {
    const files = fs.readdirSync(TEMPLATES_WP_PATH)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ filename: f, name: f.replace(/\.json$/i, '').replace(/-/g, ' ') }));
    res.json(files);
  } catch { res.json([]); }
});

app.get('/api/templates/work-packages/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(TEMPLATES_WP_PATH, filename);
  if (!filePath.startsWith(TEMPLATES_WP_PATH) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.sendFile(filePath);
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
  return { id: Number(r.id), partNumber: r.part_number, name: r.name, manufacturer: r.manufacturer || '', kit: r.kit || '', subKit: r.sub_kit || '', category: r.category || 'other', mfgDate: r.mfg_date || '', bag: r.bag || '', notes: r.notes || '', createdAt: r.created_at };
}
function stockRow(r) {
  return {
    id: Number(r.id), partId: Number(r.part_id), locationId: Number(r.location_id), quantity: r.quantity,
    unit: r.unit || 'pcs', status: r.status || 'in_stock', condition: r.condition || 'new',
    batch: r.batch || '', sourceKit: r.source_kit || '', notes: r.notes || '', updatedAt: r.updated_at,
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
    const { partNumber, name, manufacturer, kit, subKit, category, mfgDate, bag, notes } = req.body;
    if (!partNumber) return res.status(400).json({ error: 'Part number is required' });
    await req.db.run(
      'INSERT INTO inventory_parts (tenant_id, part_number, name, manufacturer, kit, sub_kit, category, mfg_date, bag, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, partNumber, name || partNumber, manufacturer || '', kit || '', subKit || '', category || 'other', mfgDate || '', bag || '', notes || '']
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
        'INSERT INTO inventory_parts (tenant_id, part_number, name, manufacturer, kit, sub_kit, category, mfg_date, bag, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.tenantId, partNumber, name || partNumber, manufacturer || '', kit || '', subKit || '', category || 'other', mfgDate || '', bag || '', notes || '']
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
        await req.db.run(
          `INSERT INTO inventory_stock (tenant_id, part_id, location_id, quantity, unit, status, condition, batch, source_kit, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.tenantId, row.id, locId, qty, unit || 'pcs', stockStatus || 'in_stock', 'new', bag || '', kit || '', notes || '']
        );
      } else {
        console.warn('[ingest] Could not find or create location for tenant', req.tenantId);
      }
    }

    res.json({ part: partRow(row), created });
  } catch (err) { serverError(res, err); }
});

app.put('/api/inventory/parts/:id', requireAuth, async (req, res) => {
  try {
    const { partNumber, name, manufacturer, kit, subKit, category, mfgDate, bag, notes } = req.body;
    await req.db.run(
      'UPDATE inventory_parts SET part_number = ?, name = ?, manufacturer = ?, kit = ?, sub_kit = ?, category = ?, mfg_date = ?, bag = ?, notes = ? WHERE id = ? AND tenant_id = ?',
      [partNumber, name, manufacturer || '', kit || '', subKit || '', category || 'other', mfgDate || '', bag || '', notes || '', req.params.id, req.tenantId]
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
    const { partId, locationId, quantity, unit, status, condition, batch, sourceKit, notes } = req.body;
    if (!partId || !locationId) return res.status(400).json({ error: 'Part and location are required' });
    await req.db.run(
      `INSERT INTO inventory_stock (tenant_id, part_id, location_id, quantity, unit, status, condition, batch, source_kit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, partId, locationId, quantity ?? 0, unit || 'pcs', status || 'in_stock', condition || 'new', batch || '', sourceKit || '', notes || '']
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
    const rows = await req.db.all(
      `SELECT s.*, p.part_number, p.name AS part_name, p.manufacturer, l.name AS location_name, l.id AS loc_id, l.parent_id AS loc_parent_id
       FROM inventory_stock s
       JOIN inventory_parts p ON p.id = s.part_id AND p.tenant_id = s.tenant_id
       JOIN inventory_locations l ON l.id = s.location_id AND l.tenant_id = s.tenant_id
       WHERE s.tenant_id = ? AND p.part_number LIKE ?
       ORDER BY l.name`,
      [req.tenantId, `%${req.params.partNumber}%`]
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
    res.json(rows.map(r => ({ ...stockRow(r), locationPath: buildPath(r.location_id) })));
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
      items: items.map(r => ({
        id: r.id, partNumber: r.part_number, nomenclature: r.nomenclature,
        subKit: r.sub_kit, bag: r.bag, qtyExpected: r.qty_expected,
        qtyFound: r.qty_found, unit: r.unit, status: r.status,
        notes: r.notes, scannedAt: r.scanned_at,
      })),
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
    if (status === 'verified' || status === 'missing') {
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

// Batch verify items (used by bag scanning in check mode)
// Accepts: { items: { partNumber: string, qtyFound: number }[] }
// Quantities ACCUMULATE across multiple scans (e.g., same rivet in multiple bags).
// Status logic:
//   qty_found >= qty_expected  → 'verified'
//   qty_found > 0 but < expected → stays 'pending' (more bags to scan)
//   only manually marked → 'missing'
app.post('/api/inventory/checks/:sessionId/verify-batch', requireAuth, async (req, res) => {
  try {
    const { partNumbers, items } = req.body;
    // Normalize to { partNumber, qtyFound } array
    const entries = items?.length
      ? items.map(i => ({ partNumber: i.partNumber, qtyFound: i.qtyFound, isShort: !!i.isShort, bag: i.bag || '' }))
      : partNumbers?.length
        ? partNumbers.map(pn => ({ partNumber: pn, qtyFound: null, isShort: false, bag: '' }))  // null = use expected
        : [];
    if (entries.length === 0) return res.status(400).json({ error: 'partNumbers or items required' });
    if (entries.length > 10000) return res.status(400).json({ error: 'Too many items in batch (max 10,000)' });

    let matched = 0;
    for (const { partNumber, qtyFound, isShort, bag } of entries) {
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

      // Accumulate: add new qty to existing qty_found
      const prevQty = checkItem.qty_found || 0;
      const addQty = qtyFound != null ? qtyFound : checkItem.qty_expected;
      const newTotal = prevQty + addQty;

      // Determine status:
      // - verified: total qty meets or exceeds expected
      // - missing: user explicitly reduced qty below bag's expected (isShort=true)
      // - pending: normal accumulation, more bags to scan
      let newStatus;
      if (newTotal >= checkItem.qty_expected) {
        newStatus = 'verified';
      } else if (isShort) {
        // User explicitly confirmed a shortage for this item
        newStatus = 'missing';
      } else if (checkItem.status === 'missing') {
        // Keep existing missing status (manually set or from previous shortage)
        newStatus = 'missing';
      } else {
        // Normal partial accumulation — item may appear in other bags
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

function injectOgTags(html, { title, description, imageUrl, pageUrl }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const p = escapeHtml(pageUrl);
  const i = escapeHtml(imageUrl);
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    pageUrl  ? `<meta property="og:url" content="${p}" />` : '',
    imageUrl ? `<meta property="og:image" content="${i}" />` : '',
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    imageUrl ? `<meta name="twitter:image" content="${i}" />` : '',
  ].filter(Boolean).join('\n    ');
  return html.replace('</head>', `  ${tags}\n  </head>`);
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
    const db      = getDefaultDb();
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
    const imageUrl  = imageUrls[0] ? `${base}${imageUrls[0]}` : null;
    const injected  = injectOgTags(html, {
      title: `${projectName} — Build Journal`,
      description: `${totalHours}h logged so far. Follow along on this RV-10 homebuilt aircraft build.`,
      imageUrl, pageUrl: `${base}/blog`,
    });
    res.type('html').send(injected);
  } catch { res.sendFile(distIndexPath); }
});

app.get('/blog/:postId', async (req, res) => {
  if (!fs.existsSync(distIndexPath)) return res.status(404).send('Not found');
  try {
    const html    = fs.readFileSync(distIndexPath, 'utf8');
    const db      = getDefaultDb();
    const general = await getSetting(db, 'general', DEFAULT_GENERAL);
    const projectName = general.projectName || 'Build Tracker';
    const base    = baseUrl(req);
    const { postId } = req.params;
    let title, description, imageUrl;

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
        imageUrl    = imgs[0] ? `${base}${imgs[0]}` : null;
      }
    } else {
      const row = await db.get('SELECT * FROM blog_posts WHERE id = ? AND tenant_id = ?', [postId, db.tenantId]);
      if (row) {
        title = row.title;
        const text = row.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        description = text.slice(0, 200) || `Build journal entry — ${projectName}`;
        const imgs  = JSON.parse(row.image_urls || '[]');
        const match = row.content.match(/src="(\/files\/[^"]+)"/);
        imageUrl    = imgs[0] ? `${base}${imgs[0]}` : match ? `${base}${match[1]}` : null;
      }
    }

    if (!title) {
      return res.type('html').send(injectOgTags(html, {
        title: `${projectName} — Build Journal`,
        description: 'Follow along on this RV-10 homebuilt aircraft build.',
        imageUrl: null, pageUrl: `${base}/blog`,
      }));
    }
    res.type('html').send(injectOgTags(html, {
      title: `${title} — ${projectName}`, description, imageUrl,
      pageUrl: `${base}/blog/${postId}`,
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
