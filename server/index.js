const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const mqtt = require('mqtt');
const crypto = require('crypto');
const sharp = require('sharp');
const archiver = require('archiver');
const unzipper = require('unzipper');

// ─── Auth helpers ───────────────────────────────────────────────────
function loadOrCreateJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const dataDir = path.dirname(process.env.DB_PATH || path.join(__dirname, 'data', 'tracker.db'));
  const secretFile = path.join(dataDir, '.jwt_secret');
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  console.log('[auth] Generated JWT secret →', secretFile);
  return secret;
}
const JWT_SECRET = loadOrCreateJwtSecret();
const TOKEN_EXPIRY_HOURS = 72;

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_EXPIRY_HOURS * 3600000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
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
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = payload;
  next();
}

// ─── Config via environment variables ───────────────────────────────
const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'tracker.db');
const DEMO_MODE = process.env.DEMO_MODE === 'true';
if (DEMO_MODE) console.log('[demo] Demo mode enabled — all write operations are blocked');
const UPLOADS_DIR = path.join(path.dirname(DB_PATH), 'uploads', 'sessions');

// Default general settings — single source of truth used as fallback in all getSetting('general') calls
const DEFAULT_GENERAL = { projectName: 'Build Tracker', targetHours: 2500, progressMode: 'time', imageResizing: true, imageMaxWidth: 1920, timeFormat: '24h', landingPage: 'tracker', homeCurrency: 'EUR' };

// ─── Default sections configuration ─────────────────────────────────
const DEFAULT_SECTIONS = [
  { id: 'empennage', label: 'Empennage', icon: '🔺' },
  { id: 'wings', label: 'Wings', icon: '✈️' },
  { id: 'fuselage', label: 'Fuselage', icon: '🛩️' },
  { id: 'finishing-kit', label: 'Finishing Kit', icon: '🔧' },
  { id: 'engine', label: 'Engine', icon: '⚙️' },
  { id: 'avionics', label: 'Avionics', icon: '📡' },
  { id: 'paint', label: 'Paint & Finish', icon: '🎨' },
  { id: 'other', label: 'Other', icon: '📋' },
];

// ─── Server-side log capture ─────────────────────────────────────────
const SERVER_LOG_BUFFER = [];
const SERVER_LOG_LIMIT = 500;

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

// ─── Express setup ──────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));

// Demo mode: block all mutating API requests
if (DEMO_MODE) {
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return res.status(403).json({ error: 'Demo mode — read only' });
    }
    next();
  });
}

// Serve frontend build
app.use(express.static(path.join(__dirname, "../dist")));

// ─── SQLite setup ───────────────────────────────────────────────────
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// ─── Local file storage setup ───────────────────────────────────────
const RECEIPTS_DIR = path.join(path.dirname(DB_PATH), 'uploads', 'receipts');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
// Serve uploaded images publicly (blog is public, so images are too)
app.use('/files', express.static(UPLOADS_DIR));
// Serve receipts: PDFs require auth, images are public
app.get('/receipts/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(RECEIPTS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  if (path.extname(filename).toLowerCase() === '.pdf') {
    const auth = req.headers.authorization;
    const payload = auth && auth.startsWith('Bearer ') ? verifyToken(auth.slice(7)) : null;
    if (!payload) return res.status(401).send('Unauthorized');
  }
  res.sendFile(filePath);
});

// Multer: disk storage — always save as .jpg (sharp will process the content)
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}.jpg`),
});
const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // allow large originals; sharp will resize down
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Only image files are allowed'));
  },
});

// Multer for receipts — accepts images and PDFs
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RECEIPTS_DIR),
  filename: (req, file, cb) => {
    // Keep original filename but prefix with UUID to avoid collisions
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${uuidv4()}-${safeName}`);
  },
});
const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only images and PDFs are allowed'));
  },
});

// Derive thumbnail path/url from a main image filename
function thumbFilename(filename) {
  return filename.replace(/\.jpg$/, '_thumb.jpg');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    section TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_minutes REAL NOT NULL,
    notes TEXT DEFAULT '',
    plans_reference TEXT,
    image_urls TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS active_timer (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    section TEXT NOT NULL,
    start_time TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS blog_posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    section TEXT,
    image_urls TEXT DEFAULT '[]',
    published_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    exchange_rate REAL NOT NULL DEFAULT 1.0,
    amount_home REAL NOT NULL,
    description TEXT NOT NULL,
    vendor TEXT DEFAULT '',
    category TEXT NOT NULL DEFAULT 'other',
    assembly_section TEXT DEFAULT '',
    part_number TEXT DEFAULT '',
    is_certification_relevant INTEGER DEFAULT 0,
    receipt_urls TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    link TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);
try { db.exec(`ALTER TABLE expenses ADD COLUMN link TEXT DEFAULT ''`); } catch {} // no-op if already exists

// Migration: rename amount_eur → amount_home for existing databases
{
  const cols = db.prepare('PRAGMA table_info(expenses)').all().map(c => c.name);
  if (cols.includes('amount_eur') && !cols.includes('amount_home')) {
    db.exec('ALTER TABLE expenses ADD COLUMN amount_home REAL NOT NULL DEFAULT 0');
    db.exec('UPDATE expenses SET amount_home = amount_eur');
    console.log('[migration] Copied amount_eur → amount_home for', db.prepare('SELECT COUNT(*) as n FROM expenses').get().n, 'rows');
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS expense_budgets (
    category TEXT PRIMARY KEY,
    budget_amount REAL NOT NULL
  )
`);

// ─── Settings helpers ───────────────────────────────────────────────
function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : defaultValue;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

// ─── MQTT setup ─────────────────────────────────────────────────────
let mqttClient = null;
let mqttPendingPublish = false;

function getMqttSettings() {
  return getSetting('mqtt', {
    enabled: false,
    brokerUrl: 'mqtt://localhost:1883',
    username: '',
    password: '',
    topicPrefix: 'mybuild/stats',
    haDiscovery: false,
    haDiscoveryPrefix: 'homeassistant',
  });
}

function connectMqtt() {
  // Disconnect existing client
  if (mqttClient) {
    try { mqttClient.end(true); } catch (e) {}
    mqttClient = null;
  }

  const settings = getMqttSettings();
  if (!settings.enabled || !settings.brokerUrl) {
    console.log('MQTT: disabled or no broker configured');
    return;
  }

  const opts = {};
  if (settings.username) opts.username = settings.username;
  if (settings.password) opts.password = settings.password;
  opts.reconnectPeriod = 5000;
  opts.connectTimeout = 10000;

  console.log(`MQTT: connecting to ${settings.brokerUrl}...`);
  mqttClient = mqtt.connect(settings.brokerUrl, opts);

  mqttClient.on('connect', () => {
    console.log(`MQTT connected to ${settings.brokerUrl}`);
    // Publish any pending stats
    if (mqttPendingPublish) {
      mqttPendingPublish = false;
      publishMqttStats();
    } else {
      // Publish initial stats on connect
      publishMqttStats();
    }
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err.message);
  });

  mqttClient.on('offline', () => {
    console.log('MQTT: offline');
  });

  mqttClient.on('reconnect', () => {
    console.log('MQTT reconnecting...');
  });

  mqttClient.on('close', () => {
    console.log('MQTT connection closed');
  });
}

function publishMqttStats() {
  try {
    const settings = getMqttSettings();
    if (!settings.enabled) {
      console.log('MQTT: publish skipped — disabled');
      return;
    }
    if (!mqttClient || !mqttClient.connected) {
      console.warn('MQTT not connected, skipping publish');
      mqttPendingPublish = true;
      return;
    }

    const prefix = settings.topicPrefix || 'mybuild/stats';

    // Compute stats from DB
    const rows = db.prepare('SELECT section, duration_minutes FROM sessions').all();
    const sectionConfigs = getSetting('sections', DEFAULT_SECTIONS);
    const excludedSections = new Set(
      sectionConfigs.filter(s => s.countTowardsBuildHours === false).map(s => s.id)
    );

    const sectionTotals = {};
    let totalMinutes = 0;

    for (const row of rows) {
      const sec = row.section;
      if (!sectionTotals[sec]) sectionTotals[sec] = 0;
      sectionTotals[sec] += row.duration_minutes;
      if (!excludedSections.has(sec)) totalMinutes += row.duration_minutes;
    }

    const totalHours = (totalMinutes / 60).toFixed(1);
    const sessionCount = rows.length;

    // Get target hours for progress calculation
    const generalSettings = getSetting('general', DEFAULT_GENERAL);
    const targetHours = generalSettings.targetHours || 2500;
    const buildProgress = Math.min(((totalMinutes / 60) / targetHours) * 100, 100).toFixed(1);

    // Publish with error handling
    const publishOptions = { retain: true, qos: 1 };
    
    console.log(`MQTT publish → ${prefix}/total_hours`, totalHours);
    mqttClient.publish(`${prefix}/total_hours`, totalHours, publishOptions, (err) => {
      if (err) console.error('MQTT publish error (total_hours):', err.message);
    });
    
    console.log(`MQTT publish → ${prefix}/total_sessions`, sessionCount);
    mqttClient.publish(`${prefix}/total_sessions`, String(sessionCount), publishOptions, (err) => {
      if (err) console.error('MQTT publish error (total_sessions):', err.message);
    });

    console.log(`MQTT publish → ${prefix}/build_progress`, buildProgress);
    mqttClient.publish(`${prefix}/build_progress`, buildProgress, publishOptions, (err) => {
      if (err) console.error('MQTT publish error (build_progress):', err.message);
    });

    // Get the last session's images
    const lastSessionRow = db.prepare('SELECT image_urls FROM sessions ORDER BY start_time DESC LIMIT 1').get();
    if (lastSessionRow) {
      const lastSessionImages = JSON.parse(lastSessionRow.image_urls || '[]');
      const imageUrlsJson = JSON.stringify(lastSessionImages);
      console.log(`MQTT publish → ${prefix}/last_session_images`, imageUrlsJson);
      mqttClient.publish(`${prefix}/last_session_images`, imageUrlsJson, publishOptions, (err) => {
        if (err) console.error('MQTT publish error (last_session_images):', err.message);
      });
    }

    // Publish per section using dynamic sections
    for (const sec of sectionConfigs) {
      const hours = ((sectionTotals[sec.id] || 0) / 60).toFixed(1);
      console.log(`MQTT publish → ${prefix}/${sec.id}`, hours);
      mqttClient.publish(`${prefix}/${sec.id}`, hours, publishOptions, (err) => {
        if (err) console.error(`MQTT publish error (${sec.id}):`, err.message);
      });
    }

    // Publish HA discovery if enabled
    if (settings.haDiscovery) {
      publishHaDiscovery(settings, sectionConfigs, prefix);
    }

    console.log(`MQTT: published stats (total: ${totalHours}h, ${sessionCount} sessions)`);
  } catch (err) {
    console.error('MQTT publish error:', err.message || err);
  }
}

function publishHaDiscovery(settings, sectionConfigs, prefix) {
  if (!mqttClient || !mqttClient.connected) {
    console.log('MQTT: HA discovery skipped — not connected');
    return;
  }

  const discoveryPrefix = settings.haDiscoveryPrefix || 'homeassistant';
  const deviceId = (settings.topicPrefix || 'mybuild_stats').replace(/[^a-z0-9]/gi, '_');
  const deviceName = getSetting('general', DEFAULT_GENERAL).projectName || DEFAULT_GENERAL.projectName;

  const device = {
    identifiers: [deviceId],
    name: deviceName,
    manufacturer: 'Benchlog',
    model: 'MQTT Stats',
  };

  function publishSensor(objectId, name, stateTopic, unit, icon, stateClass) {
    const uniqueId = `${deviceId}_${objectId}`;
    const configTopic = `${discoveryPrefix}/sensor/${uniqueId}/config`;
    const payload = {
      name,
      state_topic: stateTopic,
      unique_id: uniqueId,
      object_id: uniqueId,
      device,
      icon,
      value_template: '{{ value }}',
      ...(unit ? { unit_of_measurement: unit } : {}),
      ...(stateClass ? { state_class: stateClass } : {}),
    };
    mqttClient.publish(configTopic, JSON.stringify(payload), { retain: true, qos: 1 }, (err) => {
      if (err) console.error(`MQTT HA discovery publish error (${objectId}):`, err.message);
    });
  }

  publishSensor('total_hours', `${deviceName} Total Hours`, `${prefix}/total_hours`, 'h', 'mdi:clock-outline', 'measurement');
  publishSensor('total_sessions', `${deviceName} Total Sessions`, `${prefix}/total_sessions`, 'sessions', 'mdi:counter', 'measurement');
  publishSensor('build_progress', `${deviceName} Build Progress`, `${prefix}/build_progress`, '%', 'mdi:progress-check', 'measurement');
  
  // Add last session images as a sensor (JSON array of image URLs)
  const lastSessionImagesTopic = `${prefix}/last_session_images`;
  const uniqueIdImages = `${deviceId}_last_session_images`;
  const configTopicImages = `${discoveryPrefix}/sensor/${uniqueIdImages}/config`;
  const payloadImages = {
    name: `${deviceName} Last Session Images`,
    state_topic: lastSessionImagesTopic,
    unique_id: uniqueIdImages,
    object_id: uniqueIdImages,
    device,
    icon: 'mdi:image-multiple',
    value_template: '{{ value }}',
  };
  mqttClient.publish(configTopicImages, JSON.stringify(payloadImages), { retain: true, qos: 1 }, (err) => {
    if (err) console.error('MQTT HA discovery publish error (last_session_images):', err.message);
  });

  for (const sec of sectionConfigs) {
    const label = sec.label || sec.id;
    publishSensor(sec.id, `${deviceName} ${label}`, `${prefix}/${sec.id}`, 'h', 'mdi:tools', 'measurement');
  }

  console.log(`MQTT: published HA discovery configs to ${discoveryPrefix}/sensor/...`);
}

// Connect on startup
connectMqtt();


// ─── Auth Routes ────────────────────────────────────────────────────

// POST /api/auth/setup — set initial password (only if none set)
app.post('/api/auth/setup', (req, res) => {
  const existing = getSetting('auth_password_hash', null);
  if (existing) return res.status(400).json({ error: 'Password already set' });
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  setSetting('auth_password_hash', hash);
  const token = createToken({ role: 'admin' });
  res.json({ ok: true, token });
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const stored = getSetting('auth_password_hash', null);
  if (!stored) return res.status(400).json({ error: 'No password set. Please set up first.' });
  const { password } = req.body;
  const hash = crypto.createHash('sha256').update(password || '').digest('hex');
  if (hash !== stored) return res.status(401).json({ error: 'Incorrect password' });
  const token = createToken({ role: 'admin' });
  res.json({ ok: true, token });
});

// GET /api/auth/status — check if password is set + if token is valid
app.get('/api/auth/status', (req, res) => {
  const hasPassword = !!getSetting('auth_password_hash', null);
  const auth = req.headers.authorization;
  let authenticated = false;
  if (auth && auth.startsWith('Bearer ')) {
    authenticated = !!verifyToken(auth.slice(7));
  }
  // In demo mode, treat as always authenticated so frontend skips login
  res.json({ hasPassword: DEMO_MODE ? true : hasPassword, authenticated: DEMO_MODE ? true : authenticated, demoMode: DEMO_MODE });
});

// ─── Public Stats API ───────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const rows = db.prepare('SELECT section, duration_minutes, start_time FROM sessions').all();
  const generalSettings = getSetting('general', DEFAULT_GENERAL);
  const targetHours = generalSettings.targetHours || 2500;
  const progressMode = generalSettings.progressMode || 'time';

  // Determine which sections count toward build hours
  const sectionConfigs = getSetting('sections', DEFAULT_SECTIONS);
  const excludedSections = new Set(
    sectionConfigs.filter(s => s.countTowardsBuildHours === false).map(s => s.id)
  );

  const countedRows = rows.filter(r => !excludedSections.has(r.section));
  const totalMinutes = countedRows.reduce((sum, r) => sum + r.duration_minutes, 0);
  const totalHours = totalMinutes / 60;

  // Calculate time-based progress
  const timePct = Math.min((totalHours / targetHours) * 100, 100);

  // Calculate package-based progress
  let packagePct = 0;
  if (progressMode === 'packages') {
    const flowStatus = getSetting('flowchart_status', {});
    const flowPackages = getSetting('flowchart_packages', {});
    function getAllPackageIds(items) {
      return items.flatMap(item => [item.id, ...getAllPackageIds(item.children || [])]);
    }
    const allIds = Object.values(flowPackages).flatMap(items => getAllPackageIds(items));
    const doneCount = allIds.filter(id => flowStatus[id] === 'done').length;
    packagePct = allIds.length > 0 ? Math.min((doneCount / allIds.length) * 100, 100) : 0;
  }

  const progressPct = progressMode === 'packages' ? packagePct : timePct;

  let estimatedFinish = null;
  let hoursPerWeek = null;
  if (countedRows.length >= 2) {
    const sorted = [...countedRows].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    const firstDate = new Date(sorted[0].start_time);
    const lastDate = new Date(sorted[sorted.length - 1].start_time);
    const spanWeeks = (lastDate - firstDate) / (7 * 24 * 60 * 60 * 1000);
    if (spanWeeks >= 0.5) {
      hoursPerWeek = totalHours / spanWeeks;
      const remaining = targetHours - totalHours;
      if (remaining > 0) {
        const remainingWeeks = remaining / hoursPerWeek;
        estimatedFinish = new Date(Date.now() + remainingWeeks * 7 * 24 * 60 * 60 * 1000).toISOString();
      }
    }
  }

  const sectionHours = {};
  for (const row of rows) {
    if (!sectionHours[row.section]) sectionHours[row.section] = 0;
    sectionHours[row.section] += row.duration_minutes / 60;
  }
  for (const k of Object.keys(sectionHours)) {
    sectionHours[k] = parseFloat(sectionHours[k].toFixed(1));
  }

  res.json({
    totalHours: parseFloat(totalHours.toFixed(1)),
    targetHours,
    progressPct: parseFloat(progressPct.toFixed(1)),
    progressMode,
    sessionCount: rows.length,
    estimatedFinish,
    hoursPerWeek: hoursPerWeek ? parseFloat(hoursPerWeek.toFixed(1)) : null,
    projectName: generalSettings.projectName,
    sectionHours,
  });
});

// ─── API Routes ─────────────────────────────────────────────────────

// GET /api/sessions — list all sessions (public read)
app.get('/api/sessions', (req, res) => {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY start_time DESC').all();
  const sessions = rows.map(row => ({
    id: row.id,
    section: row.section,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    plansReference: row.plans_reference,
    imageUrls: JSON.parse(row.image_urls || '[]'),
  }));
  res.json(sessions);
});

// POST /api/sessions — create a session (auth required)
app.post('/api/sessions', requireAuth, (req, res) => {
  const { id, section, startTime, endTime, durationMinutes, notes, plansReference, imageUrls } = req.body;
  db.prepare(`
    INSERT INTO sessions (id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, section, startTime, endTime, durationMinutes, notes || '', plansReference || null, JSON.stringify(imageUrls || []));
  publishMqttStats();
  res.json({ ok: true });
});

// PUT /api/sessions/:id — update a session (auth required)
app.put('/api/sessions/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const fields = [];
  const values = [];
  if (updates.section !== undefined) { fields.push('section = ?'); values.push(updates.section); }
  if (updates.startTime !== undefined) { fields.push('start_time = ?'); values.push(updates.startTime); }
  if (updates.endTime !== undefined) { fields.push('end_time = ?'); values.push(updates.endTime); }
  if (updates.durationMinutes !== undefined) { fields.push('duration_minutes = ?'); values.push(updates.durationMinutes); }
  if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
  if (updates.plansReference !== undefined) { fields.push('plans_reference = ?'); values.push(updates.plansReference); }
  if (updates.imageUrls !== undefined) { fields.push('image_urls = ?'); values.push(JSON.stringify(updates.imageUrls)); }

  if (fields.length > 0) {
    values.push(id);
    db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  publishMqttStats();
  res.json({ ok: true });
});

// DELETE /api/sessions/:id — delete a session (auth required)
app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const row = db.prepare('SELECT image_urls FROM sessions WHERE id = ?').get(id);
  if (row) {
    const imageUrls = JSON.parse(row.image_urls || '[]');
    for (const url of imageUrls) {
      try {
        const filename = path.basename(url);
        const filePath = path.join(UPLOADS_DIR, filename);
        if (filename && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        const tPath = path.join(UPLOADS_DIR, thumbFilename(filename));
        if (fs.existsSync(tPath)) fs.unlinkSync(tPath);
      } catch (err) {
        console.error('Failed to delete image file:', err.message);
      }
    }
  }

  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  publishMqttStats();
  res.json({ ok: true });
});

// POST /api/upload — upload images (auth required)
// Multer saves to disk, then sharp resizes the main image and generates a thumbnail.
app.post('/api/upload', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    const generalSettings = getSetting('general', DEFAULT_GENERAL);
    const resizingEnabled = generalSettings.imageResizing !== false;
    const maxWidth = generalSettings.imageMaxWidth || DEFAULT_GENERAL.imageMaxWidth;
    const thumbWidth = 400;

    const urls = [];
    for (const file of req.files) {
      const filePath = file.path;

      // Resize main image in-place if enabled
      if (resizingEnabled) {
        const buf = await sharp(filePath)
          .rotate() // auto-orient from EXIF
          .resize(maxWidth, null, { withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        fs.writeFileSync(filePath, buf);
      } else {
        // Still convert to JPEG and auto-orient even when resizing is off
        const buf = await sharp(filePath).rotate().jpeg({ quality: 90 }).toBuffer();
        fs.writeFileSync(filePath, buf);
      }

      // Always generate thumbnail
      const thumbPath = path.join(UPLOADS_DIR, thumbFilename(file.filename));
      await sharp(filePath)
        .rotate()
        .resize(thumbWidth, null, { withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toFile(thumbPath);

      urls.push(`/files/${file.filename}`);
    }
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/upload — delete an image and its thumbnail (auth required)
app.delete('/api/upload', requireAuth, (req, res) => {
  const { url } = req.body;
  try {
    const filename = path.basename(url || '');
    const filePath = path.join(UPLOADS_DIR, filename);
    if (filename && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const tPath = path.join(UPLOADS_DIR, thumbFilename(filename));
    if (fs.existsSync(tPath)) fs.unlinkSync(tPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── General Settings API ────────────────────────────────────────────
app.get('/api/settings/general', (req, res) => {
  const settings = getSetting('general', DEFAULT_GENERAL);
  res.json(settings);
});

app.put('/api/settings/general', requireAuth, (req, res) => {
  const current = getSetting('general', DEFAULT_GENERAL);
  const updates = req.body;
  const newSettings = {
    projectName: updates.projectName !== undefined ? updates.projectName : current.projectName,
    targetHours: updates.targetHours !== undefined ? updates.targetHours : current.targetHours,
    progressMode: updates.progressMode !== undefined ? updates.progressMode : (current.progressMode || 'time'),
    imageResizing: updates.imageResizing !== undefined ? updates.imageResizing : (current.imageResizing ?? true),
    imageMaxWidth: updates.imageMaxWidth !== undefined ? updates.imageMaxWidth : (current.imageMaxWidth || 1920),
    timeFormat: updates.timeFormat !== undefined ? updates.timeFormat : (current.timeFormat || '24h'),
    landingPage: updates.landingPage !== undefined ? updates.landingPage : (current.landingPage || 'tracker'),
    homeCurrency: updates.homeCurrency !== undefined ? updates.homeCurrency : (current.homeCurrency || 'EUR'),
  };
  setSetting('general', newSettings);
  res.json({ ok: true });
});

// ─── MQTT Settings API ──────────────────────────────────────────────
app.get('/api/settings/mqtt', (req, res) => {
  const settings = getMqttSettings();
  res.json({
    ...settings,
    password: settings.password ? '••••••••' : '',
  });
});

app.put('/api/settings/mqtt', requireAuth, (req, res) => {
  const current = getMqttSettings();
  const updates = req.body;
  const newSettings = {
    enabled: updates.enabled !== undefined ? updates.enabled : current.enabled,
    brokerUrl: updates.brokerUrl !== undefined ? updates.brokerUrl : current.brokerUrl,
    username: updates.username !== undefined ? updates.username : current.username,
    topicPrefix: updates.topicPrefix !== undefined ? updates.topicPrefix : current.topicPrefix,
    password: (updates.password && updates.password !== '••••••••') ? updates.password : current.password,
    haDiscovery: updates.haDiscovery !== undefined ? updates.haDiscovery : current.haDiscovery,
    haDiscoveryPrefix: updates.haDiscoveryPrefix !== undefined ? updates.haDiscoveryPrefix : current.haDiscoveryPrefix,
  };
  setSetting('mqtt', newSettings);
  connectMqtt();
  res.json({ ok: true });
});

app.post('/api/settings/mqtt/test', requireAuth, (req, res) => {
  const { brokerUrl, username, password } = req.body;
  if (!brokerUrl) {
    return res.status(400).json({ error: 'Missing brokerUrl' });
  }

  const url = brokerUrl.startsWith('mqtt://') || brokerUrl.startsWith('mqtts://') || brokerUrl.startsWith('ws://') || brokerUrl.startsWith('wss://')
    ? brokerUrl
    : `mqtt://${brokerUrl}`;

  let responded = false;
  let testClient;

  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      try { if (testClient) testClient.end(true); } catch (e) {}
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
        // Try to publish a test message to verify authentication
        const testTopic = `test/${Date.now()}`;
        testClient.publish(testTopic, 'test', { qos: 0 }, (err) => {
          if (!responded) {
            if (err) {
              responded = true;
              clearTimeout(timeout);
              testClient.end();
              res.status(500).json({ error: 'Authentication failed: ' + err.message });
            } else {
              // Wait a bit to ensure no delayed auth errors
              setTimeout(() => {
                if (!responded) {
                  responded = true;
                  clearTimeout(timeout);
                  testClient.end();
                  res.json({ success: true });
                }
              }, 200);
            }
          }
        });
      }
    });

    testClient.on('error', (err) => {
      if (!responded) {
        responded = true;
        clearTimeout(timeout);
        testClient.end();
        res.status(500).json({ error: err.message });
      }
    });

    testClient.on('close', () => {
      if (!responded) {
        responded = true;
        clearTimeout(timeout);
        res.status(500).json({ error: 'Connection closed unexpectedly (possible authentication failure)' });
      }
    });
  } catch (err) {
    if (!responded) {
      responded = true;
      clearTimeout(timeout);
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── Sections API ───────────────────────────────────────────────────

app.get('/api/sections', (req, res) => {
  const sections = getSetting('sections', DEFAULT_SECTIONS);
  res.json(sections);
});

// ─── Timer API ──────────────────────────────────────────────────────

// POST /api/timer/start — start the timer (auth required)
app.post('/api/timer/start', requireAuth, (req, res) => {
  const { section } = req.body;
  if (!section) {
    return res.status(400).json({ error: 'Section is required' });
  }

  const startTime = new Date().toISOString();
  
  // Delete any existing timer (only one active at a time)
  db.prepare('DELETE FROM active_timer').run();
  
  // Insert new timer
  db.prepare('INSERT INTO active_timer (id, section, start_time) VALUES (1, ?, ?)').run(section, startTime);
  
  res.json({ ok: true, section, startedAt: startTime });
});

// POST /api/timer/stop — stop the timer (auth required)
app.post('/api/timer/stop', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM active_timer WHERE id = 1').get();
  
  if (!row) {
    return res.status(404).json({ error: 'No active timer' });
  }

  const endTime = new Date();
  const startTime = new Date(row.start_time);
  const durationMinutes = (endTime - startTime) / (1000 * 60);
  
  const { notes, plansReference, imageUrls } = req.body;
  
  // Create session ID
  const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Save session
  db.prepare(`
    INSERT INTO sessions (id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, row.section, row.start_time, endTime.toISOString(), durationMinutes, notes || '', plansReference || null, JSON.stringify(imageUrls || []));
  
  // Delete active timer
  db.prepare('DELETE FROM active_timer WHERE id = 1').run();
  
  // Publish updated MQTT stats
  publishMqttStats();
  
  res.json({ 
    ok: true, 
    sessionId,
    durationMinutes,
    section: row.section
  });
});

// GET /api/timer/status — get current timer status
app.get('/api/timer/status', (req, res) => {
  const row = db.prepare('SELECT * FROM active_timer WHERE id = 1').get();
  
  if (!row) {
    return res.json({ running: false });
  }
  
  res.json({
    running: true,
    section: row.section,
    startedAt: row.start_time
  });
});

app.put('/api/sections', requireAuth, (req, res) => {
  const sections = req.body;
  if (!Array.isArray(sections)) return res.status(400).json({ error: 'Expected array' });
  setSetting('sections', sections);
  res.json({ ok: true });
});


// ─── Export / Import ────────────────────────────────────────────────

// Multer for ZIP backup uploads (disk storage, up to 4 GB)
const backupUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tmp = path.join(path.dirname(DB_PATH), 'tmp_import');
      fs.mkdirSync(tmp, { recursive: true });
      cb(null, tmp);
    },
    filename: (_req, _file, cb) => cb(null, `import-${Date.now()}.zip`),
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
});

// GET /api/export  — streams a ZIP archive
app.get('/api/export', requireAuth, async (req, res) => {
  const includeSettings = req.query.settings !== '0';
  const includeSessions = req.query.sessions !== '0';
  const includeExpenses = req.query.expenses !== '0';
  const includeBlog     = req.query.blog !== '0';

  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="benchlog-backup-${dateStr}.zip"`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => { console.error('[export] archive error:', err.message); res.end(); });
  archive.pipe(res);

  const data = { version: 2, exportedAt: new Date().toISOString() };
  const addedFiles = new Set();

  const addFile = (dir, filename, archiveFolder) => {
    if (!filename || addedFiles.has(filename)) return;
    const fp = path.join(dir, filename);
    if (fs.existsSync(fp)) {
      archive.file(fp, { name: `uploads/${archiveFolder}/${filename}` });
      addedFiles.add(filename);
    }
  };

  if (includeSettings) {
    data.settings = {
      general: getSetting('general', DEFAULT_GENERAL),
      mqtt: getMqttSettings(),
      sections: getSetting('sections', DEFAULT_SECTIONS),
      flowchartStatus: getSetting('flowchart_status', {}),
      flowchartPackages: getSetting('flowchart_packages', {}),
    };
  }

  if (includeSessions) {
    data.sessions = db.prepare('SELECT * FROM sessions ORDER BY start_time DESC').all().map(row => {
      const imageUrls = JSON.parse(row.image_urls || '[]');
      imageUrls.forEach(u => addFile(UPLOADS_DIR, path.basename(u), 'sessions'));
      return {
        id: row.id, section: row.section,
        startTime: row.start_time, endTime: row.end_time,
        durationMinutes: row.duration_minutes, notes: row.notes,
        plansReference: row.plans_reference, imageUrls,
      };
    });
  }

  if (includeExpenses) {
    data.expenses = db.prepare('SELECT * FROM expenses ORDER BY date DESC').all().map(row => {
      const receiptUrls = JSON.parse(row.receipt_urls || '[]');
      receiptUrls.forEach(u => addFile(RECEIPTS_DIR, path.basename(u), 'receipts'));
      return expenseRow(row);
    });
  }

  if (includeBlog) {
    data.blogPosts = db.prepare('SELECT * FROM blog_posts ORDER BY published_at DESC').all().map(row => {
      const imageUrls = JSON.parse(row.image_urls || '[]');
      imageUrls.forEach(u => addFile(UPLOADS_DIR, path.basename(u), 'sessions'));
      return {
        id: row.id, title: row.title, content: row.content,
        section: row.section, imageUrls,
        publishedAt: row.published_at, updatedAt: row.updated_at,
      };
    });
  }

  archive.append(JSON.stringify(data, null, 2), { name: 'data.json' });
  await archive.finalize();
});

// Helper: apply settings from import data
function applySettings(settings) {
  if (settings.general) setSetting('general', settings.general);
  if (settings.mqtt) {
    const cur = getMqttSettings();
    const m = { ...settings.mqtt };
    if (!m.password) m.password = cur.password;
    setSetting('mqtt', m);
  }
  if (settings.sections)          setSetting('sections', settings.sections);
  if (settings.flowchartStatus)   setSetting('flowchart_status', settings.flowchartStatus);
  if (settings.flowchartPackages) setSetting('flowchart_packages', settings.flowchartPackages);
  connectMqtt();
}

// Helper: import structured data object into the DB
function applyImportData(data, results) {
  if (data.settings) { applySettings(data.settings); results.settingsImported = true; }

  for (const session of (data.sessions || [])) {
    const existing = db.prepare('SELECT id FROM sessions WHERE id = ?').get(session.id);
    const urls = JSON.stringify(session.imageUrls || []);
    if (existing) {
      db.prepare(`UPDATE sessions SET section=?,start_time=?,end_time=?,duration_minutes=?,notes=?,plans_reference=?,image_urls=? WHERE id=?`)
        .run(session.section, session.startTime, session.endTime, session.durationMinutes, session.notes||'', session.plansReference||null, urls, session.id);
    } else {
      db.prepare(`INSERT INTO sessions(id,section,start_time,end_time,duration_minutes,notes,plans_reference,image_urls) VALUES(?,?,?,?,?,?,?,?)`)
        .run(session.id, session.section, session.startTime, session.endTime, session.durationMinutes, session.notes||'', session.plansReference||null, urls);
    }
    results.sessionsImported++;
  }

  for (const exp of (data.expenses || [])) {
    const existing = db.prepare('SELECT id FROM expenses WHERE id = ?').get(exp.id);
    const rUrls = JSON.stringify(exp.receiptUrls || []);
    const tags  = JSON.stringify(exp.tags || []);
    if (existing) {
      db.prepare(`UPDATE expenses SET date=?,amount=?,currency=?,exchange_rate=?,amount_home=?,description=?,vendor=?,category=?,assembly_section=?,part_number=?,is_certification_relevant=?,receipt_urls=?,notes=?,tags=?,link=?,updated_at=? WHERE id=?`)
        .run(exp.date, exp.amount, exp.currency, exp.exchangeRate, exp.amountHome, exp.description, exp.vendor||'', exp.category, exp.assemblySection||'', exp.partNumber||'', exp.isCertificationRelevant?1:0, rUrls, exp.notes||'', tags, exp.link||'', exp.updatedAt, exp.id);
    } else {
      db.prepare(`INSERT INTO expenses(id,date,amount,currency,exchange_rate,amount_home,description,vendor,category,assembly_section,part_number,is_certification_relevant,receipt_urls,notes,tags,link,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(exp.id, exp.date, exp.amount, exp.currency, exp.exchangeRate, exp.amountHome, exp.description, exp.vendor||'', exp.category, exp.assemblySection||'', exp.partNumber||'', exp.isCertificationRelevant?1:0, rUrls, exp.notes||'', tags, exp.link||'', exp.createdAt, exp.updatedAt);
    }
    results.expensesImported++;
  }

  for (const post of (data.blogPosts || [])) {
    const existing = db.prepare('SELECT id FROM blog_posts WHERE id = ?').get(post.id);
    const iUrls = JSON.stringify(post.imageUrls || []);
    if (existing) {
      db.prepare(`UPDATE blog_posts SET title=?,content=?,section=?,image_urls=?,updated_at=? WHERE id=?`)
        .run(post.title, post.content, post.section||'', iUrls, post.updatedAt, post.id);
    } else {
      db.prepare(`INSERT INTO blog_posts(id,title,content,section,image_urls,published_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
        .run(post.id, post.title, post.content, post.section||'', iUrls, post.publishedAt, post.updatedAt);
    }
    results.blogPostsImported++;
  }

  publishMqttStats();
}

// POST /api/import — accepts a .zip backup or legacy .json file
app.post('/api/import', requireAuth, backupUpload.single('backup'), async (req, res) => {
  const results = { settingsImported: false, sessionsImported: 0, expensesImported: 0, blogPostsImported: 0, filesImported: 0 };

  // Legacy JSON path (no file uploaded, body contains JSON)
  if (!req.file) {
    try {
      const data = req.body;
      if (!data || !data.version) return res.status(400).json({ error: 'No backup file provided' });
      applyImportData(data, results);
      return res.json({ ok: true, ...results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const zipPath = req.file.path;
  const extractDir = path.join(path.dirname(DB_PATH), `tmp_extract_${Date.now()}`);

  try {
    // Extract ZIP
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    // Parse data.json
    const dataJsonPath = path.join(extractDir, 'data.json');
    if (!fs.existsSync(dataJsonPath)) throw new Error('Invalid backup: data.json not found in ZIP');
    const data = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));

    // Copy session images
    const sessDir = path.join(extractDir, 'uploads', 'sessions');
    if (fs.existsSync(sessDir)) {
      for (const file of fs.readdirSync(sessDir)) {
        const dst = path.join(UPLOADS_DIR, file);
        if (!fs.existsSync(dst)) { fs.copyFileSync(path.join(sessDir, file), dst); results.filesImported++; }
      }
    }

    // Copy receipts
    const recDir = path.join(extractDir, 'uploads', 'receipts');
    if (fs.existsSync(recDir)) {
      for (const file of fs.readdirSync(recDir)) {
        const dst = path.join(RECEIPTS_DIR, file);
        if (!fs.existsSync(dst)) { fs.copyFileSync(path.join(recDir, file), dst); results.filesImported++; }
      }
    }

    applyImportData(data, results);
    res.json({ ok: true, ...results });
  } catch (err) {
    console.error('[import]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
  }
});

// ─── Blog Posts API ─────────────────────────────────────────────────

// GET /api/blog — list all blog posts + work sessions (with optional filters)
app.get('/api/blog', (req, res) => {
  const { section, year, month, plansSection } = req.query;

  // ── Blog posts — skipped when filtering by plansSection (manual posts have no plans reference) ──
  const blogPosts = plansSection ? [] : (() => {
    let blogSql = 'SELECT * FROM blog_posts';
    const blogConditions = [];
    const blogParams = [];
    if (section) { blogConditions.push('section = ?'); blogParams.push(section); }
    if (year) { blogConditions.push("strftime('%Y', published_at) = ?"); blogParams.push(year); }
    if (month) { blogConditions.push("strftime('%m', published_at) = ?"); blogParams.push(month.padStart(2, '0')); }
    if (blogConditions.length > 0) blogSql += ' WHERE ' + blogConditions.join(' AND ');
    return db.prepare(blogSql).all(...blogParams).map(row => ({
      id: row.id, title: row.title, content: row.content, section: row.section,
      imageUrls: JSON.parse(row.image_urls || '[]'),
      publishedAt: row.published_at, updatedAt: row.updated_at, source: 'blog',
    }));
  })();

  // ── Work sessions as posts ──
  let sessSql = 'SELECT * FROM sessions';
  const sessConditions = [];
  const sessParams = [];
  if (section) { sessConditions.push('section = ?'); sessParams.push(section); }
  if (year) { sessConditions.push("strftime('%Y', start_time) = ?"); sessParams.push(year); }
  if (month) { sessConditions.push("strftime('%m', start_time) = ?"); sessParams.push(month.padStart(2, '0')); }
  if (plansSection) { sessConditions.push("plans_reference LIKE ?"); sessParams.push(`%Section ${plansSection}%`); }
  if (sessConditions.length > 0) sessSql += ' WHERE ' + sessConditions.join(' AND ');

  const sessRows = db.prepare(sessSql).all(...sessParams);
  const sectionConfigs = getSetting('sections', DEFAULT_SECTIONS);
  const sectionLabels = {};
  for (const s of sectionConfigs) sectionLabels[s.id] = s.label;

  const sessionPosts = sessRows.map(row => {
    const label = sectionLabels[row.section] || row.section;
    const date = new Date(row.start_time);
    const hours = Math.floor(row.duration_minutes / 60);
    const mins = Math.round(row.duration_minutes % 60);
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    return {
      id: 'session-' + row.id,
      title: `${label} — Work Session (${durationStr})`,
      content: row.notes || '',
      section: row.section,
      imageUrls: JSON.parse(row.image_urls || '[]'),
      publishedAt: row.start_time,
      updatedAt: row.start_time,
      source: 'session',
      plansReference: row.plans_reference,
      durationMinutes: row.duration_minutes,
    };
  });

  // ── Merge and sort ──
  const all = [...blogPosts, ...sessionPosts].sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  res.json(all);
});

// GET /api/blog/archive — get archive tree (years → months → count) from both tables
app.get('/api/blog/archive', (req, res) => {
  const rows = db.prepare(`
    SELECT year, month, SUM(cnt) as count FROM (
      SELECT strftime('%Y', published_at) as year, strftime('%m', published_at) as month, COUNT(*) as cnt
      FROM blog_posts GROUP BY year, month
      UNION ALL
      SELECT strftime('%Y', start_time) as year, strftime('%m', start_time) as month, COUNT(*) as cnt
      FROM sessions GROUP BY year, month
    ) GROUP BY year, month
    ORDER BY year DESC, month DESC
  `).all();
  res.json(rows);
});

// GET /api/blog/:id — get single post
app.get('/api/blog/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Post not found' });
  res.json({
    id: row.id,
    title: row.title,
    content: row.content,
    section: row.section,
    imageUrls: JSON.parse(row.image_urls || '[]'),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  });
});

// POST /api/blog — create a blog post (auth required)
app.post('/api/blog', requireAuth, (req, res) => {
  const { id, title, content, section, imageUrls, publishedAt } = req.body;
  const postId = id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO blog_posts (id, title, content, section, image_urls, published_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(postId, title, content || '', section || null, JSON.stringify(imageUrls || []), publishedAt || now, now);
  res.json({ ok: true, id: postId });
});

// PUT /api/blog/:id — update a blog post (auth required)
app.put('/api/blog/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const fields = [];
  const values = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content); }
  if (updates.section !== undefined) { fields.push('section = ?'); values.push(updates.section); }
  if (updates.imageUrls !== undefined) { fields.push('image_urls = ?'); values.push(JSON.stringify(updates.imageUrls)); }
  if (updates.publishedAt !== undefined) { fields.push('published_at = ?'); values.push(updates.publishedAt); }
  fields.push('updated_at = ?'); values.push(new Date().toISOString());

  if (fields.length > 0) {
    values.push(id);
    db.prepare(`UPDATE blog_posts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  res.json({ ok: true });
});

// DELETE /api/blog/:id — delete a blog post (auth required)
app.delete('/api/blog/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT image_urls, content FROM blog_posts WHERE id = ?').get(req.params.id);
  if (row) {
    // Delete files stored in image_urls array
    const imageUrls = JSON.parse(row.image_urls || '[]');
    // Also extract any images embedded directly in the HTML content
    const contentMatches = [...(row.content || '').matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]);
    const allUrls = [...new Set([...imageUrls, ...contentMatches])].filter(u => u.startsWith('/files/'));
    for (const url of allUrls) {
      try {
        const filename = path.basename(url);
        const filePath = path.join(UPLOADS_DIR, filename);
        if (filename && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        const tPath = path.join(UPLOADS_DIR, thumbFilename(filename));
        if (fs.existsSync(tPath)) fs.unlinkSync(tPath);
      } catch (err) {
        console.error('Failed to delete blog image file:', err.message);
      }
    }
  }
  db.prepare('DELETE FROM blog_posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Flowchart Status API ───────────────────────────────────────────
// GET /api/flowchart-status — public read
app.get('/api/flowchart-status', (req, res) => {
  const data = getSetting('flowchart_status', {});
  res.json(data);
});

// PUT /api/flowchart-status — auth required, save all statuses
app.put('/api/flowchart-status', requireAuth, (req, res) => {
  setSetting('flowchart_status', req.body);
  res.json({ ok: true });
});

// GET /api/flowchart-packages — public read
app.get('/api/flowchart-packages', (req, res) => {
  const data = getSetting('flowchart_packages', {});
  res.json(data);
});

// PUT /api/flowchart-packages — auth required
app.put('/api/flowchart-packages', requireAuth, (req, res) => {
  if (typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Expected object' });
  }
  setSetting('flowchart_packages', req.body);
  res.json({ ok: true });
});

// ─── Expenses API ────────────────────────────────────────────────────

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

// GET /api/expenses
app.get('/api/expenses', requireAuth, (req, res) => {
  const { category, section, year, month, certification } = req.query;
  let sql = 'SELECT * FROM expenses WHERE 1=1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (section) { sql += ' AND assembly_section = ?'; params.push(section); }
  if (year) { sql += " AND strftime('%Y', date) = ?"; params.push(year); }
  if (month) { sql += " AND strftime('%m', date) = ?"; params.push(month.padStart(2, '0')); }
  if (certification === '1') { sql += ' AND is_certification_relevant = 1'; }
  sql += ' ORDER BY date DESC, created_at DESC';
  res.json(db.prepare(sql).all(...params).map(expenseRow));
});

// GET /api/expenses/stats
app.get('/api/expenses/stats', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM expenses').all();
  const totalHome = rows.reduce((s, r) => s + r.amount_home, 0);
  const byCategory = {};
  const bySection = {};
  for (const cat of EXPENSE_CATEGORIES) byCategory[cat] = 0;
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] || 0) + r.amount_home;
    if (r.assembly_section) bySection[r.assembly_section] = (bySection[r.assembly_section] || 0) + r.amount_home;
  }
  const budgets = {};
  for (const b of db.prepare('SELECT * FROM expense_budgets').all()) budgets[b.category] = b.budget_amount;
  // Monthly totals for last 12 months
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', date) as month, SUM(amount_home) as total
    FROM expenses GROUP BY month ORDER BY month DESC LIMIT 12
  `).all();
  res.json({ totalHome, byCategory, bySection, budgets, monthly, count: rows.length });
});

// GET /api/expenses/export/csv
app.get('/api/expenses/export/csv', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM expenses ORDER BY date DESC').all();
  const header = 'Date,Description,Vendor,Category,Section,Amount,Currency,Exchange Rate,Amount EUR,Part Number,Certification Relevant,Notes,Link';
  const lines = rows.map(r => [
    r.date, `"${(r.description||'').replace(/"/g,'""')}"`, `"${(r.vendor||'').replace(/"/g,'""')}"`,
    r.category, r.assembly_section || '', r.amount, r.currency, r.exchange_rate, r.amount_home.toFixed(2),
    r.part_number || '', r.is_certification_relevant ? 'Yes' : 'No',
    `"${(r.notes||'').replace(/"/g,'""')}"`, r.link || ''
  ].join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
  res.send([header, ...lines].join('\n'));
});

// GET /api/expenses/budgets
app.get('/api/expenses/budgets', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM expense_budgets').all();
  const budgets = {};
  for (const r of rows) budgets[r.category] = r.budget_amount;
  res.json(budgets);
});

// PUT /api/expenses/budgets
app.put('/api/expenses/budgets', requireAuth, (req, res) => {
  const budgets = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO expense_budgets (category, budget_amount) VALUES (?, ?)');
  const del = db.prepare('DELETE FROM expense_budgets WHERE category = ?');
  for (const cat of EXPENSE_CATEGORIES) {
    if (budgets[cat] != null && budgets[cat] > 0) upsert.run(cat, budgets[cat]);
    else del.run(cat);
  }
  res.json({ ok: true });
});

// GET /api/expenses/:id
app.get('/api/expenses/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(expenseRow(row));
});

// POST /api/expenses
app.post('/api/expenses', requireAuth, (req, res) => {
  const { date, amount, currency, exchangeRate, description, vendor, category, assemblySection, partNumber, isCertificationRelevant, receiptUrls, notes, tags, link } = req.body;
  if (!date || !amount || !description) return res.status(400).json({ error: 'date, amount and description are required' });
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const rate = exchangeRate || 1.0;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO expenses (id, date, amount, currency, exchange_rate, amount_home, description, vendor, category, assembly_section, part_number, is_certification_relevant, receipt_urls, notes, tags, link, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, date, amount, currency || 'EUR', rate, amount * rate, description, vendor || '', category || 'other', assemblySection || '', partNumber || '', isCertificationRelevant ? 1 : 0, JSON.stringify(receiptUrls || []), notes || '', JSON.stringify(tags || []), link || '', now, now);
  res.json({ ok: true, id });
});

// PUT /api/expenses/:id
app.put('/api/expenses/:id', requireAuth, (req, res) => {
  const { date, amount, currency, exchangeRate, description, vendor, category, assemblySection, partNumber, isCertificationRelevant, receiptUrls, notes, tags, link } = req.body;
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const rate = exchangeRate ?? existing.exchange_rate;
  const amt = amount ?? existing.amount;
  db.prepare(`UPDATE expenses SET date=?, amount=?, currency=?, exchange_rate=?, amount_home=?, description=?, vendor=?, category=?, assembly_section=?, part_number=?, is_certification_relevant=?, receipt_urls=?, notes=?, tags=?, link=?, updated_at=? WHERE id=?`)
    .run(date ?? existing.date, amt, currency ?? existing.currency, rate, amt * rate, description ?? existing.description, vendor ?? existing.vendor, category ?? existing.category, assemblySection ?? existing.assembly_section, partNumber ?? existing.part_number, isCertificationRelevant != null ? (isCertificationRelevant ? 1 : 0) : existing.is_certification_relevant, JSON.stringify(receiptUrls ?? JSON.parse(existing.receipt_urls)), notes ?? existing.notes, JSON.stringify(tags ?? JSON.parse(existing.tags)), link ?? existing.link ?? '', new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

// DELETE /api/expenses/:id
app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT receipt_urls FROM expenses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  for (const url of JSON.parse(row.receipt_urls || '[]')) {
    try { const fp = path.join(RECEIPTS_DIR, path.basename(url)); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
  }
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/expenses/upload — upload receipts (images + PDFs)
app.post('/api/expenses/upload', requireAuth, receiptUpload.array('files', 10), async (req, res) => {
  try {
    const urls = [];
    for (const file of req.files) {
      if (file.mimetype !== 'application/pdf') {
        const buf = await sharp(file.path).rotate().resize(1920, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        fs.writeFileSync(file.path, buf);
      }
      urls.push(`/receipts/${file.filename}`);
    }
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/upload
app.delete('/api/expenses/upload', requireAuth, (req, res) => {
  const { url } = req.body;
  try {
    const fp = path.join(RECEIPTS_DIR, path.basename(url || ''));
    if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── OpenGraph meta tag injection ───────────────────────────────────
const distIndexPath = path.join(__dirname, '../dist/index.html');

function injectOgTags(html, { title, description, imageUrl, pageUrl }) {
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    pageUrl ? `<meta property="og:url" content="${pageUrl}" />` : '',
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
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

app.get('/blog', (req, res) => {
  if (!fs.existsSync(distIndexPath)) return res.sendFile(distIndexPath);
  const html = fs.readFileSync(distIndexPath, 'utf8');
  const general = getSetting('general', DEFAULT_GENERAL);
  const projectName = general.projectName || 'Build Tracker';

  // Get total hours and latest session image
  const totalRow = db.prepare(`SELECT COALESCE(SUM(duration_minutes),0) as total FROM sessions`).get();
  const totalHours = Math.round((totalRow?.total || 0) / 60 * 10) / 10;
  const latestSession = db.prepare(`SELECT image_urls FROM sessions WHERE image_urls != '[]' ORDER BY start_time DESC LIMIT 1`).get();
  const imageUrls = latestSession ? JSON.parse(latestSession.image_urls || '[]') : [];
  const firstImage = imageUrls[0];
  const base = baseUrl(req);
  const imageUrl = firstImage ? `${base}${firstImage}` : null;

  const injected = injectOgTags(html, {
    title: `${projectName} — Build Journal`,
    description: `${totalHours}h logged so far. Follow along on this RV-10 homebuilt aircraft build.`,
    imageUrl,
    pageUrl: `${base}/blog`,
  });
  res.type('html').send(injected);
});

app.get('/blog/:postId', (req, res) => {
  if (!fs.existsSync(distIndexPath)) return res.sendFile(distIndexPath);
  const html = fs.readFileSync(distIndexPath, 'utf8');
  const general = getSetting('general', DEFAULT_GENERAL);
  const projectName = general.projectName || 'Build Tracker';
  const base = baseUrl(req);
  const { postId } = req.params;

  let title, description, imageUrl;

  if (postId.startsWith('session-')) {
    const sessionId = postId.replace('session-', '');
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (row) {
      const sectionConfigs = getSetting('sections', DEFAULT_SECTIONS);
      const label = (sectionConfigs.find(s => s.id === row.section)?.label) || row.section;
      const hours = Math.floor(row.duration_minutes / 60);
      const mins = Math.round(row.duration_minutes % 60);
      const dur = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      title = `${label} — Work Session (${dur})`;
      description = row.notes || `${dur} build session logged on ${new Date(row.start_time).toLocaleDateString()}`;
      const imgs = JSON.parse(row.image_urls || '[]');
      imageUrl = imgs[0] ? `${base}${imgs[0]}` : null;
    }
  } else {
    const row = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(postId);
    if (row) {
      title = row.title;
      const text = row.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      description = text.slice(0, 200) || `Build journal entry — ${projectName}`;
      const imgs = JSON.parse(row.image_urls || '[]');
      // Also check for inline images in content
      const match = row.content.match(/src="(\/files\/[^"]+)"/);
      imageUrl = imgs[0] ? `${base}${imgs[0]}` : match ? `${base}${match[1]}` : null;
    }
  }

  if (!title) {
    // Post not found — fall back to generic blog tags
    return res.type('html').send(injectOgTags(html, {
      title: `${projectName} — Build Journal`,
      description: 'Follow along on this RV-10 homebuilt aircraft build.',
      imageUrl: null, pageUrl: `${base}/blog`,
    }));
  }

  res.type('html').send(injectOgTags(html, {
    title: `${title} — ${projectName}`,
    description,
    imageUrl,
    pageUrl: `${base}/blog/${postId}`,
  }));
});

// ─── Debug / Diagnostics ────────────────────────────────────────────
app.get('/api/debug/stats', requireAuth, (req, res) => {
  const mem = process.memoryUsage();
  const counts = {
    sessions: db.prepare('SELECT COUNT(*) as n FROM sessions').get().n,
    expenses: db.prepare("SELECT COUNT(*) as n FROM expenses").get().n,
    blogPosts: db.prepare("SELECT COUNT(*) as n FROM blog_posts").get().n,
  };
  // Count files in upload directories
  const countFiles = (dir, filter) => { try { const files = fs.readdirSync(dir); return filter ? files.filter(filter).length : files.length; } catch { return 0; } };
  res.json({
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    },
    db: {
      path: DB_PATH,
      sessions: counts.sessions,
      expenses: counts.expenses,
      blogPosts: counts.blogPosts,
    },
    uploads: {
      sessionImages: countFiles(UPLOADS_DIR, f => !f.includes('_thumb')),
      sessionThumbs: countFiles(UPLOADS_DIR, f => f.includes('_thumb')),
      receipts: countFiles(RECEIPTS_DIR),
    },
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  });
});

// ─── Debug logs endpoint ─────────────────────────────────────────────
app.get('/api/debug/logs', requireAuth, (req, res) => {
  const since = parseInt(req.query.since) || 0;
  res.json(since ? SERVER_LOG_BUFFER.filter(e => e.ts > since) : SERVER_LOG_BUFFER);
});

// ─── Start ──────────────────────────────────────────────────────────
app.get("*", (_req, res) => {
  if (!fs.existsSync(distIndexPath)) return res.sendFile(distIndexPath);
  const html = fs.readFileSync(distIndexPath, 'utf8');
  const general = getSetting('general', DEFAULT_GENERAL);
  const projectName = general.projectName || 'Build Tracker';
  const injected = injectOgTags(html, {
    title: `${projectName} — BenchLog`,
    description: 'Track your build project — log sessions, visualize progress, document your journey.',
    imageUrl: null,
    pageUrl: null,
  });
  res.type('html').send(injected);
});

// ─── Global error handler (logs uncaught route errors) ───────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err.message, err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Benchlog API running on port ${PORT}`);
  console.log(`SQLite: ${DB_PATH}`);
  console.log(`Uploads: ${UPLOADS_DIR}`);
});
