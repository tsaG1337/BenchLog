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
const DEFAULT_GENERAL = { projectName: 'Build Tracker', targetHours: 2500, progressMode: 'time', imageResizing: true, imageMaxWidth: 1920 };

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

// ─── Express setup ──────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

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
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
// Serve uploaded images publicly (blog is public, so images are too)
app.use('/files', express.static(UPLOADS_DIR));

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

// GET /api/export?settings=1&sessions=1
app.get('/api/export', async (req, res) => {
  const includeSettings = req.query.settings === '1';
  const includeSessions = req.query.sessions === '1';

  if (!includeSettings && !includeSessions) {
    return res.status(400).json({ error: 'Nothing selected for export' });
  }

  const exportData = { version: 1, exportedAt: new Date().toISOString() };

  if (includeSettings) {
    exportData.settings = {
      general: getSetting('general', DEFAULT_GENERAL),
      mqtt: getMqttSettings(),
      sections: getSetting('sections', DEFAULT_SECTIONS),
      flowchartStatus: getSetting('flowchart_status', {}),
      flowchartPackages: getSetting('flowchart_packages', {}),
    };
  }

  if (includeSessions) {
    const rows = db.prepare('SELECT * FROM sessions ORDER BY start_time DESC').all();
    const sessions = [];

    for (const row of rows) {
      const session = {
        id: row.id,
        section: row.section,
        startTime: row.start_time,
        endTime: row.end_time,
        durationMinutes: row.duration_minutes,
        notes: row.notes,
        plansReference: row.plans_reference,
        imageUrls: JSON.parse(row.image_urls || '[]'),
        images: [],
      };

      // Embed images as base64
      const ctMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
      for (const url of session.imageUrls) {
        try {
          const filename = path.basename(url);
          const filePath = path.join(UPLOADS_DIR, filename);
          if (filename && fs.existsSync(filePath)) {
            const buffer = await fs.promises.readFile(filePath);
            const contentType = ctMap[path.extname(filename).toLowerCase()] || 'image/jpeg';
            session.images.push({ objectName: filename, contentType, data: buffer.toString('base64') });
          }
        } catch (err) {
          console.error(`Export: failed to read image ${url}:`, err.message);
        }
      }

      sessions.push(session);
    }

    exportData.sessions = sessions;
  }

  const filename = `benchlog-export-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(exportData);
});

// POST /api/import (auth required)
app.post('/api/import', requireAuth, express.json({ limit: '200mb' }), async (req, res) => {
  const { settings, sessions } = req.body;
  const results = { settingsImported: false, sessionsImported: 0, imagesImported: 0 };

  try {
    if (settings) {
      if (settings.general) setSetting('general', settings.general);
      if (settings.mqtt) {
        const currentMqtt = getMqttSettings();
        // Don't overwrite password if empty in import
        const newMqtt = { ...settings.mqtt };
        if (!newMqtt.password) newMqtt.password = currentMqtt.password;
        setSetting('mqtt', newMqtt);
      }
      if (settings.sections) setSetting('sections', settings.sections);
      if (settings.flowchartStatus) setSetting('flowchart_status', settings.flowchartStatus);
      if (settings.flowchartPackages) setSetting('flowchart_packages', settings.flowchartPackages);
      results.settingsImported = true;
      connectMqtt();
    }

    if (sessions && Array.isArray(sessions)) {
      for (const session of sessions) {
        // Check if session already exists
        const existing = db.prepare('SELECT id FROM sessions WHERE id = ?').get(session.id);
        
        // Write imported images to disk with fresh UUID filenames
        const imageUrls = [];
        if (session.images && Array.isArray(session.images)) {
          for (const img of session.images) {
            try {
              const buffer = Buffer.from(img.data, 'base64');
              const ext = path.extname(img.objectName || '').toLowerCase() || '.jpg';
              const filename = `${uuidv4()}${ext}`;
              fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
              imageUrls.push(`/files/${filename}`);
              results.imagesImported++;
            } catch (err) {
              console.error(`Import: failed to write image ${img.objectName}:`, err.message);
            }
          }
        }

        const finalImageUrls = imageUrls.length > 0 ? imageUrls : (session.imageUrls || []);

        if (existing) {
          // Update existing session
          db.prepare(`UPDATE sessions SET section=?, start_time=?, end_time=?, duration_minutes=?, notes=?, plans_reference=?, image_urls=? WHERE id=?`)
            .run(session.section, session.startTime, session.endTime, session.durationMinutes, session.notes || '', session.plansReference || null, JSON.stringify(finalImageUrls), session.id);
        } else {
          db.prepare(`INSERT INTO sessions (id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(session.id, session.section, session.startTime, session.endTime, session.durationMinutes, session.notes || '', session.plansReference || null, JSON.stringify(finalImageUrls));
        }
        results.sessionsImported++;
      }
      publishMqttStats();
    }

    res.json({ ok: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ─── Start ──────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});
app.listen(PORT, () => {
  console.log(`Benchlog API running on port ${PORT}`);
  console.log(`SQLite: ${DB_PATH}`);
  console.log(`Uploads: ${UPLOADS_DIR}`);
});
