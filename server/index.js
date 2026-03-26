'use strict';
const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const { v4: uuidv4 } = require('uuid');
const path       = require('path');
const fs         = require('fs');
const mqtt       = require('mqtt');
const crypto     = require('crypto');
const sharp      = require('sharp');
const heicConvert = require('heic-convert');
const archiver   = require('archiver');
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
  setTenantPassword,
  runMigrationIfNeeded,
  getMasterSqlite,
  openSqlite,
  tenantDbPath,
  listTenants,
  createTenantRow,
  updateTenantRow,
  deleteTenantRow,
} = require('./db');
const { initMasterSchema, initTenantSchema, initPostgresSchema } = require('./schema');

// ─── Auth helpers ────────────────────────────────────────────────────
function loadOrCreateJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(DATA_DIR, '.jwt_secret');
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  console.log('[auth] Generated JWT secret →', secretFile);
  return secret;
}
const JWT_SECRET = loadOrCreateJwtSecret();
const TOKEN_EXPIRY_HOURS = 72;

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
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function requireAuth(req, res, next) {
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
  req.db = getTenantDb(req.tenantId);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireServiceKey(req, res, next) {
  const configured = process.env.INTERNAL_API_KEY;
  if (!configured) return res.status(503).json({ error: 'Internal API not enabled — set INTERNAL_API_KEY' });
  const key = req.headers['x-service-key'];
  if (!key || key !== configured) return res.status(401).json({ error: 'Invalid or missing X-Service-Key header' });
  next();
}

function requirePostgres(req, res, next) {
  if (DB_BACKEND !== 'postgres') return res.status(400).json({ error: 'Internal API requires DB_BACKEND=postgres' });
  next();
}

async function requireWebhookKey(req, res, next) {
  const key = req.query.key || req.headers['x-webhook-key'];
  if (!key) return res.status(401).json({ error: 'Missing webhook key' });
  try {
    const tenants = await listTenants();
    for (const { id } of tenants) {
      const db = getTenantDb(id);
      const stored = await getSetting(db, 'webhook_api_key', null);
      if (stored && key === stored) {
        req.tenantId = id;
        req.db = db;
        return next();
      }
    }
    return res.status(401).json({ error: 'Invalid webhook key' });
  } catch {
    res.status(500).json({ error: 'Internal error' });
  }
}

// ─── Config via environment variables ──────────────────────────────
const PORT       = process.env.PORT || 3001;
const DIST_PATH  = process.env.DIST_PATH || path.join(__dirname, '../dist');
const TEMPLATES_WP_PATH = path.join(__dirname, '../templates/work-packages');
const DEMO_MODE  = process.env.DEMO_MODE === 'true';
if (DEMO_MODE) console.log('[demo] Demo mode enabled — all write operations are blocked');

// Legacy DB_PATH kept for compatibility (used for upload dirs)
const DB_PATH    = process.env.DB_PATH || path.join(DATA_DIR, 'database.db');
const UPLOADS_DIR  = path.join(path.dirname(DB_PATH), 'uploads', 'sessions');
const RECEIPTS_DIR = path.join(path.dirname(DB_PATH), 'uploads', 'receipts');

// Default general settings
const DEFAULT_GENERAL = {
  projectName: 'Build Tracker', targetHours: 2500, progressMode: 'time',
  imageResizing: true, imageMaxWidth: 1920, timeFormat: '24h',
  landingPage: 'blog', homeCurrency: 'EUR',
  blogShowActivity: true, blogShowStats: true, blogShowProgress: true,
};

const DEFAULT_SECTIONS = [
  { id: 'empennage',     label: 'Empennage',     icon: '🔺' },
  { id: 'wings',         label: 'Wings',          icon: '✈️' },
  { id: 'fuselage',      label: 'Fuselage',       icon: '🛩️' },
  { id: 'finishing-kit', label: 'Finishing Kit',  icon: '🔧' },
  { id: 'engine',        label: 'Engine',         icon: '⚙️' },
  { id: 'avionics',      label: 'Avionics',       icon: '📡' },
  { id: 'paint',         label: 'Paint & Finish', icon: '🎨' },
  { id: 'other',         label: 'Other',          icon: '📋' },
];

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

function createStorage(namespace) {
  const localDir    = namespace === 'receipts' ? RECEIPTS_DIR : UPLOADS_DIR;
  const localPrefix = namespace === 'receipts' ? '/receipts'  : '/files';
  if (STORAGE_BACKEND === 'r2') {
    const r2Key = fn => `${namespace}/${fn}`;
    return {
      async save(filename, buffer, contentType = 'image/jpeg') {
        await r2Client.send(new S3Put({ Bucket: R2_BUCKET, Key: r2Key(filename), Body: buffer, ContentType: contentType }));
        return `${R2_PUBLIC_URL}/${namespace}/${filename}`;
      },
      async delete(url, deleteThumb = false) {
        const fn = path.basename(url);
        await r2Client.send(new S3Delete({ Bucket: R2_BUCKET, Key: r2Key(fn) })).catch(() => {});
        if (deleteThumb) await r2Client.send(new S3Delete({ Bucket: R2_BUCKET, Key: r2Key(thumbFilename(fn)) })).catch(() => {});
      },
      async readBuffer(url) {
        const res = await r2Client.send(new S3Get({ Bucket: R2_BUCKET, Key: r2Key(path.basename(url)) }));
        const chunks = []; for await (const chunk of res.Body) chunks.push(chunk); return Buffer.concat(chunks);
      },
      async deleteAll() {
        let token;
        do {
          const listed = await r2Client.send(new S3List({ Bucket: R2_BUCKET, Prefix: `${namespace}/`, ContinuationToken: token }));
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
    async save(filename, buffer) {
      fs.writeFileSync(path.join(localDir, filename), buffer);
      return `${localPrefix}/${filename}`;
    },
    async delete(url, deleteThumb = false) {
      const fn = path.basename(url);
      const fp = path.join(localDir, fn);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      if (deleteThumb) { const tp = path.join(localDir, thumbFilename(fn)); if (fs.existsSync(tp)) fs.unlinkSync(tp); }
    },
    async readBuffer(url) { return fs.readFileSync(path.join(localDir, path.basename(url))); },
    async deleteAll() {
      if (fs.existsSync(localDir)) for (const f of fs.readdirSync(localDir)) try { fs.unlinkSync(path.join(localDir, f)); } catch {}
    },
    async addToArchive(archive, url, archivePath) {
      const fp = path.join(localDir, path.basename(url));
      if (fs.existsSync(fp)) archive.file(fp, { name: archivePath });
    },
  };
}

const imageStore   = createStorage('sessions');
const receiptStore = createStorage('receipts');

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
    .then(() => startServer())
    .catch(err => {
      console.error('[init] PostgreSQL init failed:', err.message);
      process.exit(1);
    });
} else {
  // SQLite: synchronous setup
  runMigrationIfNeeded();
  initMasterSchema(getMasterSqlite());

  ensureFirstTenant({
    initSchema(sqlite, tenantId) {
      initTenantSchema(sqlite, tenantId);
      try {
        const cols = sqlite.prepare('PRAGMA table_info(expenses)').all().map(c => c.name);
        if (!cols.includes('link')) sqlite.exec(`ALTER TABLE expenses ADD COLUMN link TEXT DEFAULT ''`);
        if (cols.includes('amount_eur') && !cols.includes('amount_home')) {
          sqlite.exec('ALTER TABLE expenses ADD COLUMN amount_home REAL NOT NULL DEFAULT 0');
          sqlite.exec('UPDATE expenses SET amount_home = amount_eur');
          console.log('[migration] Copied amount_eur → amount_home');
        }
      } catch (e) {
        console.warn('[init] Schema migration warning:', e.message);
      }
    },
  })
    .then(() => startServer())
    .catch(e => {
      console.warn('[init] Tenant schema init warning:', e.message);
      startServer();
    });
}

// ─── Express setup ───────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));

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
          if (tenant) { req.tenantId = tenant.id; req.db = getTenantDb(tenant.id); }
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

app.use(express.static(DIST_PATH));

// Local file serving (R2 URLs are served directly by Cloudflare)
if (STORAGE_BACKEND === 'local') {
  app.use('/files', express.static(UPLOADS_DIR));
  app.get('/receipts/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(RECEIPTS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
    if (path.extname(filename).toLowerCase() === '.pdf') {
      const auth    = req.headers.authorization;
      const payload = auth && auth.startsWith('Bearer ') ? verifyToken(auth.slice(7)) : null;
      if (!payload) return res.status(401).send('Unauthorized');
    }
    res.sendFile(filePath);
  });
}

// ─── Multer (memory storage — works for both local and R2) ───────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
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
    console.log(`MQTT [${tenantId}]: disabled or no broker configured`);
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

// ─── Prune visitor stats ─────────────────────────────────────────────
async function pruneVisitorStats() {
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  try {
    const db = getDefaultDb();
    const { changes } = await db.run(
      'DELETE FROM visitor_stats WHERE ts < ? AND tenant_id = ?',
      [cutoff, db.tenantId]
    );
    if (changes > 0) console.log(`[visitor-stats] Pruned ${changes} entries older than 1 year`);
  } catch (e) {
    console.warn('[visitor-stats] prune error:', e.message);
  }
}

// ─── Auth Routes ─────────────────────────────────────────────────────

app.post('/api/auth/setup', async (req, res) => {
  try {
    const tenant = await getFirstTenant();
    if (!tenant) return res.status(500).json({ error: 'No tenant found' });
    if (tenant.password_hash) return res.status(400).json({ error: 'Password already set' });

    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    const hash = crypto.createHash('sha256').update(password).digest('hex');

    await setTenantPassword(tenant.id, hash);
    const db = getTenantDb(tenant.id);
    await setSetting(db, 'auth_password_hash', hash);

    const token = createToken({ role: 'admin', tenantId: tenant.id });
    res.json({ ok: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { password, username } = req.body;
    let tenant = null;
    if (DB_BACKEND === 'postgres') {
      if (!username) return res.status(400).json({ error: 'Username is required' });
      tenant = await getTenantBySlug(username);
    } else {
      tenant = await getFirstTenant();
    }
    if (!tenant) return res.status(400).json({ error: 'User not found' });
    if (!tenant.password_hash) return res.status(400).json({ error: 'No password set. Please set up first.' });
    const hash = crypto.createHash('sha256').update(password || '').digest('hex');
    if (hash !== tenant.password_hash) return res.status(401).json({ error: 'Incorrect password' });
    const token = createToken({ role: tenant.role || 'user', tenantId: tenant.id });
    res.json({ ok: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/status', async (req, res) => {
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
    res.json({
      hasPassword:   DEMO_MODE ? true : hasPassword,
      authenticated: DEMO_MODE ? true : authenticated,
      demoMode:      DEMO_MODE,
      multiTenant:   DB_BACKEND === 'postgres',
      role:          DEMO_MODE ? 'admin' : role,
    });
  } catch {
    res.json({ hasPassword: false, authenticated: false, demoMode: DEMO_MODE });
  }
});

// ─── Public Stats API ────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
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
    res.status(500).json({ error: err.message });
  }
});

// ─── Sessions API ────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const db   = getDefaultDb();
    const rows = await db.all(
      'SELECT * FROM sessions WHERE tenant_id = ? ORDER BY start_time DESC',
      [db.tenantId]
    );
    res.json(rows.map(row => ({
      id: row.id, section: row.section,
      startTime: row.start_time, endTime: row.end_time,
      durationMinutes: row.duration_minutes, notes: row.notes,
      plansReference: row.plans_reference,
      imageUrls: JSON.parse(row.image_urls || '[]'),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', requireAuth, async (req, res) => {
  try {
    const { id, section, startTime, endTime, durationMinutes, notes, plansReference, imageUrls } = req.body;
    await req.db.run(
      `INSERT INTO sessions (id, tenant_id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.tenantId, section, startTime, endTime, durationMinutes, notes || '', plansReference || null, JSON.stringify(imageUrls || [])]
    );
    publishMqttStats(req.db);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
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
    res.status(500).json({ error: err.message });
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
        try {
          const filename = path.basename(url);
          const filePath = path.join(UPLOADS_DIR, filename);
          if (filename && fs.existsSync(filePath)) fs.unlinkSync(filePath);
          const tPath = path.join(UPLOADS_DIR, thumbFilename(filename));
          if (fs.existsSync(tPath)) fs.unlinkSync(tPath);
        } catch (err) { console.error('Failed to delete image file:', err.message); }
      }
    }
    await req.db.run('DELETE FROM sessions WHERE id = ? AND tenant_id = ?', [id, req.tenantId]);
    publishMqttStats(req.db);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Upload API ──────────────────────────────────────────────────────

app.post('/api/upload', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    const generalSettings = await getSetting(req.db, 'general', DEFAULT_GENERAL);
    const resizingEnabled = generalSettings.imageResizing !== false;
    const maxWidth        = generalSettings.imageMaxWidth || DEFAULT_GENERAL.imageMaxWidth;
    const thumbWidth      = 400;
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
      const url = await imageStore.save(filename, buf);
      await imageStore.save(thumbFilename(filename), thumbBuf);
      urls.push(url);
      await req.db.run('INSERT OR REPLACE INTO pending_uploads (url, tenant_id, uploaded_at) VALUES (?, ?, ?)', [url, req.tenantId, Date.now()]);
      const activeTimer = await req.db.get('SELECT image_urls FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
      if (activeTimer) {
        const existing = JSON.parse(activeTimer.image_urls || '[]');
        await req.db.run('UPDATE active_timer SET image_urls = ? WHERE tenant_id = ?', [JSON.stringify([...existing, url]), req.tenantId]);
      }
    }
    res.json({ urls });
  } catch (err) {
    console.error('[upload] error:', err.message, err.$metadata || '');
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// ─── General Settings API ────────────────────────────────────────────

app.get('/api/settings/general', async (req, res) => {
  try {
    const db       = req.db || getDefaultDb();
    const settings = await getSetting(db, 'general', DEFAULT_GENERAL);
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
      landingPage:  updates.landingPage  !== undefined ? updates.landingPage  : (current.landingPage || 'tracker'),
      homeCurrency: updates.homeCurrency !== undefined ? updates.homeCurrency : (current.homeCurrency || 'EUR'),
    };
    await setSetting(req.db, 'general', newSettings);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MQTT Settings API ───────────────────────────────────────────────

app.get('/api/settings/mqtt', async (req, res) => {
  try {
    const db       = getDefaultDb();
    const settings = await getMqttSettings(db);
    res.json({ ...settings, password: settings.password ? '••••••••' : '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
              res.status(500).json({ error: 'Authentication failed: ' + err.message });
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
      if (!responded) { responded = true; clearTimeout(timeout); testClient.end(); res.status(500).json({ error: err.message }); }
    });
    testClient.on('close', () => {
      if (!responded) { responded = true; clearTimeout(timeout); res.status(500).json({ error: 'Connection closed unexpectedly (possible authentication failure)' }); }
    });
  } catch (err) {
    if (!responded) { responded = true; clearTimeout(timeout); res.status(500).json({ error: err.message }); }
  }
});

// ─── Sections API ────────────────────────────────────────────────────

app.get('/api/sections', async (req, res) => {
  try {
    const db       = getDefaultDb();
    const sections = await getSetting(db, 'sections', DEFAULT_SECTIONS);
    res.json(sections);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/sections', requireAuth, async (req, res) => {
  try {
    const sections = req.body;
    if (!Array.isArray(sections)) return res.status(400).json({ error: 'Expected array' });
    await setSetting(req.db, 'sections', sections);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sections/:id/usage', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const sessions  = await req.db.get('SELECT COUNT(*) as n FROM sessions   WHERE section = ? AND tenant_id = ?', [id, req.tenantId]);
    const blogPosts = await req.db.get('SELECT COUNT(*) as n FROM blog_posts WHERE section = ? AND tenant_id = ?', [id, req.tenantId]);
    res.json({ sessions: sessions.n, blogPosts: blogPosts.n });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sections/reassign', requireAuth, async (req, res) => {
  try {
    const { fromId, toId } = req.body;
    if (!fromId || !toId) return res.status(400).json({ error: 'fromId and toId are required' });
    const s = await req.db.run('UPDATE sessions   SET section = ? WHERE section = ? AND tenant_id = ?', [toId, fromId, req.tenantId]);
    const b = await req.db.run('UPDATE blog_posts SET section = ? WHERE section = ? AND tenant_id = ?', [toId, fromId, req.tenantId]);
    res.json({ sessionsUpdated: s.changes, blogPostsUpdated: b.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/timer/stop', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get('SELECT * FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    if (!row) return res.status(404).json({ error: 'No active timer' });
    const endTime        = new Date();
    const startTime      = new Date(row.start_time);
    const durationMinutes = (endTime - startTime) / (1000 * 60);
    const { notes, plansReference, imageUrls } = req.body;
    const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await req.db.run(
      `INSERT INTO sessions (id, tenant_id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, req.tenantId, row.section, row.start_time, endTime.toISOString(), durationMinutes, notes || '', plansReference || null, JSON.stringify(imageUrls || [])]
    );
    await req.db.run('DELETE FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    publishMqttStats(req.db);
    res.json({ ok: true, sessionId, durationMinutes, section: row.section });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/timer/status', async (req, res) => {
  try {
    const db  = getDefaultDb();
    const row = await db.get('SELECT * FROM active_timer WHERE tenant_id = ?', [db.tenantId]);
    if (!row) return res.json({ running: false });
    res.json({ running: true, section: row.section, startedAt: row.start_time });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Export / Import ─────────────────────────────────────────────────

app.get('/api/export', requireAuth, async (req, res) => {
  try {
    const includeSettings     = req.query.settings     !== '0';
    const includeSessions     = req.query.sessions     !== '0';
    const includeExpenses     = req.query.expenses     !== '0';
    const includeBlog         = req.query.blog         !== '0';
    const includeWorkPackages = req.query.workPackages !== '0';
    const includeSignOffs     = req.query.signOffs     !== '0';

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="benchlog-backup-${dateStr}.zip"`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { console.error('[export] archive error:', err.message); res.end(); });
    archive.pipe(res);

    const data       = { version: 2, exportedAt: new Date().toISOString() };
    const addedFiles = new Set();
    const addFile    = (dir, filename, archiveFolder) => {
      if (!filename || addedFiles.has(filename)) return;
      const fp = path.join(dir, filename);
      if (fs.existsSync(fp)) { archive.file(fp, { name: `uploads/${archiveFolder}/${filename}` }); addedFiles.add(filename); }
    };

    if (includeSettings) {
      data.settings = {
        general:        await getSetting(req.db, 'general',           DEFAULT_GENERAL),
        mqtt:           await getMqttSettings(req.db),
        sections:       await getSetting(req.db, 'sections',          DEFAULT_SECTIONS),
        flowchartStatus:await getSetting(req.db, 'flowchart_status',  {}),
      };
    }
    if (includeWorkPackages) data.workPackages = await getSetting(req.db, 'flowchart_packages', {});

    if (includeSessions) {
      const rows = await req.db.all(
        'SELECT * FROM sessions WHERE tenant_id = ? ORDER BY start_time DESC',
        [req.tenantId]
      );
      data.sessions = rows.map(row => {
        const imageUrls = JSON.parse(row.image_urls || '[]');
        imageUrls.forEach(u => addFile(UPLOADS_DIR, path.basename(u), 'sessions'));
        return { id: row.id, section: row.section, startTime: row.start_time, endTime: row.end_time,
          durationMinutes: row.duration_minutes, notes: row.notes, plansReference: row.plans_reference, imageUrls };
      });
    }

    if (includeExpenses) {
      const rows = await req.db.all(
        'SELECT * FROM expenses WHERE tenant_id = ? ORDER BY date DESC',
        [req.tenantId]
      );
      data.expenses = rows.map(row => {
        const receiptUrls = JSON.parse(row.receipt_urls || '[]');
        receiptUrls.forEach(u => addFile(RECEIPTS_DIR, path.basename(u), 'receipts'));
        return expenseRow(row);
      });
    }

    if (includeBlog) {
      const rows = await req.db.all(
        'SELECT * FROM blog_posts WHERE tenant_id = ? ORDER BY published_at DESC',
        [req.tenantId]
      );
      data.blogPosts = rows.map(row => {
        const imageUrls = JSON.parse(row.image_urls || '[]');
        imageUrls.forEach(u => addFile(UPLOADS_DIR, path.basename(u), 'sessions'));
        return { id: row.id, title: row.title, content: row.content, section: row.section,
          imageUrls, publishedAt: row.published_at, updatedAt: row.updated_at };
      });
    }

    if (includeSignOffs) {
      const rows = await req.db.all(
        'SELECT * FROM sign_offs WHERE tenant_id = ? ORDER BY date DESC',
        [req.tenantId]
      );
      data.signOffs = rows.map(r => ({
        id: r.id, packageId: r.package_id, packageLabel: r.package_label, sectionId: r.section_id,
        date: r.date, inspectorName: r.inspector_name,
        inspectionCompleted: !!r.inspection_completed, noCriticalIssues: !!r.no_critical_issues,
        executionSatisfactory: !!r.execution_satisfactory, reworkNeeded: !!r.rework_needed,
        comments: r.comments, signaturePng: r.signature_png, createdAt: r.created_at,
      }));
    }

    const annRows = await req.db.all(
      'SELECT * FROM image_annotations WHERE tenant_id = ?',
      [req.tenantId]
    );
    data.annotations = annRows.map(r => ({
      imageUrl: r.image_url, annotations: JSON.parse(r.annotations_json || '[]'), updatedAt: r.updated_at,
    }));

    archive.append(JSON.stringify(data, null, 2), { name: 'data.json' });
    await archive.finalize();
  } catch (err) {
    console.error('[export]', err.message);
    res.status(500).json({ error: err.message });
  }
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

async function applyImportData(db, tenantId, data, results) {
  if (data.settings)     { await applySettings(db, data.settings); results.settingsImported = true; }
  if (data.workPackages) { await setSetting(db, 'flowchart_packages', data.workPackages); results.workPackagesImported = true; }

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
        `UPDATE blog_posts SET title=?,content=?,section=?,image_urls=?,updated_at=? WHERE id=? AND tenant_id=?`,
        [post.title, post.content, post.section||'', iUrls, post.updatedAt, post.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO blog_posts(id,tenant_id,title,content,section,image_urls,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
        [post.id, tenantId, post.title, post.content, post.section||'', iUrls, post.publishedAt, post.updatedAt]
      );
    }
    results.blogPostsImported++;
  }

  for (const s of (data.signOffs || [])) {
    const existing = await db.get('SELECT id FROM sign_offs WHERE id = ? AND tenant_id = ?', [s.id, tenantId]);
    if (existing) {
      await db.run(
        `UPDATE sign_offs SET package_id=?,package_label=?,section_id=?,date=?,inspector_name=?,inspection_completed=?,no_critical_issues=?,execution_satisfactory=?,rework_needed=?,comments=?,signature_png=? WHERE id=? AND tenant_id=?`,
        [s.packageId, s.packageLabel, s.sectionId||'', s.date, s.inspectorName||'', s.inspectionCompleted?1:0, s.noCriticalIssues?1:0, s.executionSatisfactory?1:0, s.reworkNeeded?1:0, s.comments||'', s.signaturePng, s.id, tenantId]
      );
    } else {
      await db.run(
        `INSERT INTO sign_offs(id,tenant_id,package_id,package_label,section_id,date,inspector_name,inspection_completed,no_critical_issues,execution_satisfactory,rework_needed,comments,signature_png,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [s.id, tenantId, s.packageId, s.packageLabel, s.sectionId||'', s.date, s.inspectorName||'', s.inspectionCompleted?1:0, s.noCriticalIssues?1:0, s.executionSatisfactory?1:0, s.reworkNeeded?1:0, s.comments||'', s.signaturePng, s.createdAt]
      );
    }
    results.signOffsImported++;
  }

  for (const a of (data.annotations || [])) {
    if (!a.imageUrl) continue;
    await db.run(
      `INSERT OR REPLACE INTO image_annotations (image_url, tenant_id, annotations_json, updated_at) VALUES (?, ?, ?, ?)`,
      [a.imageUrl, tenantId, JSON.stringify(a.annotations || []), a.updatedAt || new Date().toISOString()]
    );
  }

  publishMqttStats(db);
}

app.post('/api/import', requireAuth, backupUpload.single('backup'), async (req, res) => {
  const results = { settingsImported: false, sessionsImported: 0, expensesImported: 0, blogPostsImported: 0, filesImported: 0, workPackagesImported: false, signOffsImported: 0 };
  if (!req.file) {
    try {
      const data = req.body;
      if (!data || !data.version) return res.status(400).json({ error: 'No backup file provided' });
      await applyImportData(req.db, req.tenantId, data, results);
      return res.json({ ok: true, ...results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  const zipPath   = req.file.path;
  const extractDir = path.join(DATA_DIR, `tmp_extract_${Date.now()}`);
  try {
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();
    const dataJsonPath = path.join(extractDir, 'data.json');
    if (!fs.existsSync(dataJsonPath)) throw new Error('Invalid backup: data.json not found in ZIP');
    const data = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
    const sessDir = path.join(extractDir, 'uploads', 'sessions');
    if (fs.existsSync(sessDir)) {
      for (const file of fs.readdirSync(sessDir)) {
        const dst = path.join(UPLOADS_DIR, file);
        if (!fs.existsSync(dst)) { fs.copyFileSync(path.join(sessDir, file), dst); results.filesImported++; }
      }
    }
    const recDir = path.join(extractDir, 'uploads', 'receipts');
    if (fs.existsSync(recDir)) {
      for (const file of fs.readdirSync(recDir)) {
        const dst = path.join(RECEIPTS_DIR, file);
        if (!fs.existsSync(dst)) { fs.copyFileSync(path.join(recDir, file), dst); results.filesImported++; }
      }
    }
    await applyImportData(req.db, req.tenantId, data, results);
    res.json({ ok: true, ...results });
  } catch (err) {
    console.error('[import]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
  }
});

// ─── Admin Routes ────────────────────────────────────────────────────

app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tables = ['sessions', 'blog_posts', 'expenses', 'expense_budgets', 'sign_offs', 'image_annotations', 'visitor_stats', 'pending_uploads'];
    const stats = [];
    for (const table of tables) {
      try {
        const row = await req.db.get(`SELECT COUNT(*) as count FROM ${table} WHERE tenant_id = ?`, [req.tenantId]);
        stats.push({ table, count: Number(row?.count || 0) });
      } catch { stats.push({ table, count: 0 }); }
    }
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await listTenants();
    res.json(users.map(u => ({
      id: u.id, slug: u.slug, displayName: u.display_name,
      email: u.email, role: u.role || 'user',
      createdAt: u.created_at, isActive: u.is_active !== 0,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { slug, displayName, password, role, email } = req.body;
    if (!slug || !displayName) return res.status(400).json({ error: 'slug and displayName are required' });
    if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    const tenantId = uuidv4();
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    await createTenantRow({ id: tenantId, slug, display_name: displayName, email, role: role || 'user', password_hash: hash });
    if (DB_BACKEND === 'sqlite') {
      const sqlite = openSqlite(tenantDbPath(tenantId));
      initTenantSchema(sqlite, tenantId);
    }
    res.json({ ok: true, id: tenantId });
  } catch (err) {
    if (err.message?.includes('UNIQUE') || err.message?.includes('unique') || err.message?.includes('duplicate')) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, displayName, role, password, email } = req.body;
    const fields = {};
    if (slug !== undefined) fields.slug = slug;
    if (displayName !== undefined) fields.display_name = displayName;
    if (role !== undefined) fields.role = role;
    if (email !== undefined) fields.email = email;
    if (password) {
      if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
      fields.password_hash = crypto.createHash('sha256').update(password).digest('hex');
    }
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });
    await updateTenantRow(id, fields);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.tenantId) return res.status(400).json({ error: 'Cannot delete your own account' });
    await deleteTenantRow(id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/internal/tenants', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const { slug, displayName, password, passwordHash, role, email } = req.body;
    if (!slug) return res.status(400).json({ error: 'slug is required' });
    if (!displayName) return res.status(400).json({ error: 'displayName is required' });
    if (!password && !passwordHash) return res.status(400).json({ error: 'password or passwordHash is required' });
    if (password && password.length < 4) return res.status(400).json({ error: 'password must be at least 4 characters' });
    const existing = await getTenantBySlug(slug);
    if (existing) return res.status(409).json({ error: `Username "${slug}" is already taken` });
    const tenantId = uuidv4();
    const hash = passwordHash || crypto.createHash('sha256').update(password).digest('hex');
    await createTenantRow({ id: tenantId, slug, display_name: displayName, email: email || null, role: role || 'user', password_hash: hash });
    res.status(201).json({ id: tenantId, slug, displayName, role: role || 'user' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/internal/tenants/:id', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, displayName, password, role, email, isActive } = req.body;
    const fields = {};
    if (slug !== undefined) {
      const existing = await getTenantBySlug(slug);
      if (existing && existing.id !== id) return res.status(409).json({ error: `Username "${slug}" is already taken` });
      fields.slug = slug;
    }
    if (displayName !== undefined) fields.display_name = displayName;
    if (role !== undefined) fields.role = role;
    if (email !== undefined) fields.email = email;
    if (isActive !== undefined) fields.is_active = isActive ? 1 : 0;
    if (password !== undefined) {
      if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
      fields.password_hash = crypto.createHash('sha256').update(password).digest('hex');
    }
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });
    await updateTenantRow(id, fields);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/internal/tenants/:id', requireServiceKey, requirePostgres, async (req, res) => {
  try {
    await deleteTenantRow(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Blog Posts API ──────────────────────────────────────────────────

app.get('/api/blog', async (req, res) => {
  try {
    const db = req.db || getDefaultDb();
    const { section, year, month, plansSection } = req.query;

    const blogPosts = plansSection ? [] : await (async () => {
      let sql = 'SELECT * FROM blog_posts WHERE tenant_id = ?';
      const params = [db.tenantId];
      if (section)      { sql += ' AND section = ?';                            params.push(section); }
      if (year)         { sql += ' AND substr(published_at, 1, 4) = ?';            params.push(year); }
      if (month)        { sql += ' AND substr(published_at, 6, 2) = ?';            params.push(month.padStart(2, '0')); }
      const rows = await db.all(sql, params);
      return rows.map(row => ({
        id: row.id, title: row.title, content: row.content, section: row.section,
        imageUrls: JSON.parse(row.image_urls || '[]'),
        publishedAt: row.published_at, updatedAt: row.updated_at, source: 'blog',
      }));
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
        content: row.notes || '', section: row.section,
        imageUrls: JSON.parse(row.image_urls || '[]'),
        publishedAt: row.start_time, updatedAt: row.start_time, source: 'session',
        plansReference: row.plans_reference, durationMinutes: row.duration_minutes,
      };
    });

    const all = [...blogPosts, ...sessionPosts].sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    res.json(all);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/blog/archive', async (req, res) => {
  try {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/blog/:id', async (req, res) => {
  try {
    const db  = req.db || getDefaultDb();
    const row = await db.get(
      'SELECT * FROM blog_posts WHERE id = ? AND tenant_id = ?',
      [req.params.id, db.tenantId]
    );
    if (!row) return res.status(404).json({ error: 'Post not found' });
    res.json({
      id: row.id, title: row.title, content: row.content, section: row.section,
      imageUrls: JSON.parse(row.image_urls || '[]'),
      publishedAt: row.published_at, updatedAt: row.updated_at,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/blog', requireAuth, async (req, res) => {
  try {
    const { id, title, content, section, imageUrls, publishedAt } = req.body;
    const postId = id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now    = new Date().toISOString();
    await req.db.run(
      `INSERT INTO blog_posts (id, tenant_id, title, content, section, image_urls, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [postId, req.tenantId, title, content || '', section || null, JSON.stringify(imageUrls || []), publishedAt || now, now]
    );
    res.json({ ok: true, id: postId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/blog/:id', requireAuth, async (req, res) => {
  try {
    const { id }  = req.params;
    const updates = req.body;
    const fields  = [];
    const values  = [];
    if (updates.title      !== undefined) { fields.push('title = ?');       values.push(updates.title); }
    if (updates.content    !== undefined) { fields.push('content = ?');     values.push(updates.content); }
    if (updates.section    !== undefined) { fields.push('section = ?');     values.push(updates.section); }
    if (updates.imageUrls  !== undefined) { fields.push('image_urls = ?');  values.push(JSON.stringify(updates.imageUrls)); }
    if (updates.publishedAt !== undefined){ fields.push('published_at = ?');values.push(updates.publishedAt); }
    fields.push('updated_at = ?'); values.push(new Date().toISOString());
    if (fields.length > 0) {
      values.push(id, req.tenantId);
      await req.db.run(`UPDATE blog_posts SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/blog/:id', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get(
      'SELECT image_urls, content FROM blog_posts WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (row) {
      const imageUrls     = JSON.parse(row.image_urls || '[]');
      const contentMatches = [...(row.content || '').matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]);
      const allUrls        = [...new Set([...imageUrls, ...contentMatches])].filter(u => u.startsWith('/files/'));
      for (const url of allUrls) {
        try {
          const filename = path.basename(url);
          const filePath = path.join(UPLOADS_DIR, filename);
          if (filename && fs.existsSync(filePath)) fs.unlinkSync(filePath);
          const tPath = path.join(UPLOADS_DIR, thumbFilename(filename));
          if (fs.existsSync(tPath)) fs.unlinkSync(tPath);
        } catch (err) { console.error('Failed to delete blog image file:', err.message); }
      }
    }
    await req.db.run('DELETE FROM blog_posts WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Flowchart Status API ─────────────────────────────────────────────

app.get('/api/flowchart-status', async (req, res) => {
  try {
    const db   = getDefaultDb();
    const data = await getSetting(db, 'flowchart_status', {});
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/flowchart-status', requireAuth, async (req, res) => {
  try {
    await setSetting(req.db, 'flowchart_status', req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/flowchart-packages', async (req, res) => {
  try {
    const db   = getDefaultDb();
    const data = await getSetting(db, 'flowchart_packages', {});
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/flowchart-packages', requireAuth, async (req, res) => {
  try {
    if (typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Expected object' });
    }
    await setSetting(req.db, 'flowchart_packages', req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

const EXPENSE_CATEGORIES = ['airframe','engine','avionics','landing-gear','paint','tools','certification','insurance','hangar','other'];

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
    if (category)        { sql += ' AND category = ?';                           params.push(category); }
    if (section)         { sql += ' AND assembly_section = ?';                   params.push(section); }
    if (year)            { sql += ' AND substr(date, 1, 4) = ?';                  params.push(year); }
    if (month)           { sql += ' AND substr(date, 6, 2) = ?';                  params.push(month.padStart(2, '0')); }
    if (certification === '1') { sql += ' AND is_certification_relevant = 1'; }
    sql += ' ORDER BY date DESC, created_at DESC';
    const rows = await req.db.all(sql, params);
    res.json(rows.map(expenseRow));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses/stats', requireAuth, async (req, res) => {
  try {
    const rows      = await req.db.all('SELECT * FROM expenses WHERE tenant_id = ?', [req.tenantId]);
    const totalHome = rows.reduce((s, r) => s + r.amount_home, 0);
    const byCategory = {};
    const bySection  = {};
    for (const cat of EXPENSE_CATEGORIES) byCategory[cat] = 0;
    for (const r of rows) {
      byCategory[r.category] = (byCategory[r.category] || 0) + r.amount_home;
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses/budgets', requireAuth, async (req, res) => {
  try {
    const rows    = await req.db.all('SELECT * FROM expense_budgets WHERE tenant_id = ?', [req.tenantId]);
    const budgets = {};
    for (const r of rows) budgets[r.category] = r.budget_amount;
    res.json(budgets);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/expenses/budgets', requireAuth, async (req, res) => {
  try {
    const budgets = req.body;
    for (const cat of EXPENSE_CATEGORIES) {
      if (budgets[cat] != null && budgets[cat] > 0) {
        await req.db.run(
          'INSERT OR REPLACE INTO expense_budgets (category, tenant_id, budget_amount) VALUES (?, ?, ?)',
          [cat, req.tenantId, budgets[cat]]
        );
      } else {
        await req.db.run(
          'DELETE FROM expense_budgets WHERE category = ? AND tenant_id = ?',
          [cat, req.tenantId]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get('SELECT * FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(expenseRow(row));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
  try {
    const { date, amount, currency, exchangeRate, description, vendor, category, assemblySection, partNumber, isCertificationRelevant, receiptUrls, notes, tags, link } = req.body;
    if (!date || !amount || !description) return res.status(400).json({ error: 'date, amount and description are required' });
    const id   = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const rate = exchangeRate || 1.0;
    const now  = new Date().toISOString();
    await req.db.run(
      `INSERT INTO expenses (id, tenant_id, date, amount, currency, exchange_rate, amount_home, description, vendor, category, assembly_section, part_number, is_certification_relevant, receipt_urls, notes, tags, link, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.tenantId, date, amount, currency || 'EUR', rate, amount * rate, description, vendor || '', category || 'other', assemblySection || '', partNumber || '', isCertificationRelevant ? 1 : 0, JSON.stringify(receiptUrls || []), notes || '', JSON.stringify(tags || []), link || '', now, now]
    );
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const existing = await req.db.get('SELECT * FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { date, amount, currency, exchangeRate, description, vendor, category, assemblySection, partNumber, isCertificationRelevant, receiptUrls, notes, tags, link } = req.body;
    const rate = exchangeRate ?? existing.exchange_rate;
    const amt  = amount      ?? existing.amount;
    await req.db.run(
      `UPDATE expenses SET date=?, amount=?, currency=?, exchange_rate=?, amount_home=?, description=?, vendor=?, category=?, assembly_section=?, part_number=?, is_certification_relevant=?, receipt_urls=?, notes=?, tags=?, link=?, updated_at=? WHERE id=? AND tenant_id=?`,
      [date ?? existing.date, amt, currency ?? existing.currency, rate, amt * rate,
       description ?? existing.description, vendor ?? existing.vendor, category ?? existing.category,
       assemblySection ?? existing.assembly_section, partNumber ?? existing.part_number,
       isCertificationRelevant != null ? (isCertificationRelevant ? 1 : 0) : existing.is_certification_relevant,
       JSON.stringify(receiptUrls ?? JSON.parse(existing.receipt_urls)),
       notes ?? existing.notes, JSON.stringify(tags ?? JSON.parse(existing.tags)), link ?? existing.link ?? '',
       new Date().toISOString(), req.params.id, req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const row = await req.db.get('SELECT receipt_urls FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    for (const url of JSON.parse(row.receipt_urls || '[]')) {
      try { const fp = path.join(RECEIPTS_DIR, path.basename(url)); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
    }
    await req.db.run('DELETE FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses/upload', requireAuth, receiptUpload.array('files', 10), async (req, res) => {
  try {
    const urls = [];
    for (const file of req.files) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      let receiptUrl;
      if (file.mimetype === 'application/pdf') {
        const filename = `${uuidv4()}-${safeName}`;
        receiptUrl = await receiptStore.save(filename, file.buffer, 'application/pdf');
      } else {
        const filename = `${uuidv4()}-${safeName.replace(/\.[^.]+$/, '.jpg')}`;
        const buf = await sharp(file.buffer).rotate().resize(1920, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        receiptUrl = await receiptStore.save(filename, buf);
      }
      urls.push(receiptUrl);
      await req.db.run('INSERT OR REPLACE INTO pending_uploads (url, tenant_id, uploaded_at) VALUES (?, ?, ?)', [receiptUrl, req.tenantId, Date.now()]);
    }
    res.json({ urls });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/expenses/upload', requireAuth, async (req, res) => {
  const { url } = req.body;
  try {
    if (url) {
      await receiptStore.delete(url);
      await req.db.run('DELETE FROM pending_uploads WHERE url = ? AND tenant_id = ?', [url, req.tenantId]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Factory Reset ────────────────────────────────────────────────────

app.post('/api/reset', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM sessions WHERE tenant_id = ?',           [req.tenantId]);
    await req.db.run('DELETE FROM blog_posts WHERE tenant_id = ?',         [req.tenantId]);
    await req.db.run('DELETE FROM expenses WHERE tenant_id = ?',           [req.tenantId]);
    await req.db.run('DELETE FROM sign_offs WHERE tenant_id = ?',          [req.tenantId]);
    await req.db.run('DELETE FROM image_annotations WHERE tenant_id = ?',  [req.tenantId]);
    await req.db.run('DELETE FROM active_timer WHERE tenant_id = ?',       [req.tenantId]);
    await req.db.run("DELETE FROM settings WHERE key != ? AND tenant_id = ?", ['auth_password_hash', req.tenantId]);
    [UPLOADS_DIR, RECEIPTS_DIR].forEach(dir => {
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
          try { fs.unlinkSync(path.join(dir, file)); } catch {}
        }
      }
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── OpenGraph meta tag injection ────────────────────────────────────
const distIndexPath = path.join(DIST_PATH, 'index.html');

function injectOgTags(html, { title, description, imageUrl, pageUrl }) {
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    pageUrl  ? `<meta property="og:url" content="${pageUrl}" />` : '',
    imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : '',
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    imageUrl ? `<meta name="twitter:image" content="${imageUrl}" />` : '',
  ].filter(Boolean).join('\n    ');
  return html.replace('</head>', `  ${tags}\n  </head>`);
}

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.get('host');
  return `${proto}://${host}`;
}

app.get('/blog', async (req, res) => {
  if (!fs.existsSync(distIndexPath)) return res.sendFile(distIndexPath);
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
  if (!fs.existsSync(distIndexPath)) return res.sendFile(distIndexPath);
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/signoffs', requireAuth, async (req, res) => {
  try {
    const { id, packageId, packageLabel, sectionId, date, inspectorName,
      inspectionCompleted, noCriticalIssues, executionSatisfactory, reworkNeeded,
      comments, signaturePng } = req.body;
    if (!packageId || !packageLabel || !date || !signaturePng) return res.status(400).json({ error: 'Missing required fields' });
    await req.db.run(
      `INSERT INTO sign_offs (id,tenant_id,package_id,package_label,section_id,date,inspector_name,inspection_completed,no_critical_issues,execution_satisfactory,rework_needed,comments,signature_png) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id || uuidv4(), req.tenantId, packageId, packageLabel, sectionId || '', date,
       inspectorName || '', inspectionCompleted?1:0, noCriticalIssues?1:0,
       executionSatisfactory?1:0, reworkNeeded?1:0, comments || '', signaturePng]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/signoffs/:id', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM sign_offs WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Image Annotations ────────────────────────────────────────────────

app.get('/api/annotations', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.json({ annotations: [] });
    const db  = getDefaultDb();
    const row = await db.get(
      'SELECT annotations_json FROM image_annotations WHERE image_url = ? AND tenant_id = ?',
      [imageUrl, db.tenantId]
    );
    res.json({ annotations: row ? JSON.parse(row.annotations_json) : [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/annotations', requireAuth, async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'url query param required' });
    const { annotations = [] } = req.body;
    await req.db.run(
      `INSERT OR REPLACE INTO image_annotations (image_url, tenant_id, annotations_json, updated_at) VALUES (?, ?, ?, datetime('now'))`,
      [imageUrl, req.tenantId, JSON.stringify(annotations)]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Visitor tracking ─────────────────────────────────────────────────

app.post('/api/track', async (req, res) => {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (/bot|crawler|spider|scraper|headless|prerender|curl|wget/.test(ua)) return res.json({ ok: true });
  try {
    const db      = getDefaultDb();
    const country = ((req.headers['cf-ipcountry'] || 'XX') + '').toUpperCase().slice(0, 2);
    const { path: pagePath = '/blog', postId = '', referrer: clientReferrer = '' } = req.body || {};
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
      [db.tenantId, Date.now(), pagePath, country, referrer, postId || '']
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stats/visitors', requireAuth, async (req, res) => {
  try {
    await req.db.run('DELETE FROM visitor_stats WHERE tenant_id = ?', [req.tenantId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Debug / Diagnostics ─────────────────────────────────────────────

app.get('/api/debug/stats', requireAuth, async (req, res) => {
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
      },
      node: { version: process.version, platform: process.platform, arch: process.arch },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/debug/logs', requireAuth, (req, res) => {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/webhook-key/regenerate', requireAuth, async (req, res) => {
  try {
    const key = crypto.randomBytes(32).toString('hex');
    await setSetting(req.db, 'webhook_api_key', key);
    console.log('[webhook] Regenerated API key');
    res.json({ key });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.all('/api/webhook/timer/stop', requireWebhookKey, async (req, res) => {
  try {
    const row = await req.db.get('SELECT * FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    if (!row) return res.status(404).json({ error: 'No active timer' });
    const endTime         = new Date();
    const startTime       = new Date(row.start_time);
    const durationMinutes = (endTime - startTime) / (1000 * 60);
    const sessionId       = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await req.db.run(
      `INSERT INTO sessions (id, tenant_id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, req.tenantId, row.section, row.start_time, endTime.toISOString(), durationMinutes, '', null, '[]']
    );
    await req.db.run('DELETE FROM active_timer WHERE tenant_id = ?', [req.tenantId]);
    publishMqttStats(req.db);
    console.log(`[webhook] Timer stopped — section: ${row.section}, duration: ${durationMinutes.toFixed(1)} min`);
    res.json({ ok: true, sessionId, durationMinutes, section: row.section });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SPA fallback ─────────────────────────────────────────────────────

app.get('*', async (_req, res) => {
  if (!fs.existsSync(distIndexPath)) return res.sendFile(distIndexPath);
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
  res.status(500).json({ error: err.message });
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

  // Prune old visitor stats daily
  pruneVisitorStats();
  setInterval(pruneVisitorStats, 24 * 60 * 60 * 1000);
}
