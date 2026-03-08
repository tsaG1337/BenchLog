const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const multer = require('multer');
const { Client: MinioClient } = require('minio');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const mqtt = require('mqtt');

// ─── Config via environment variables ───────────────────────────────
const PORT = process.env.PORT || 3001;
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000');
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'session-images';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'rv10.db');

// ─── Express setup ──────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
// Serve frontend build
app.use(express.static(path.join(__dirname, "../dist")));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── SQLite setup ───────────────────────────────────────────────────
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

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
    console.log('MQTT: connected');
    // Publish initial stats on connect
    publishMqttStats();
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err.message);
  });

  mqttClient.on('offline', () => {
    console.log('MQTT: offline');
  });
}

function publishMqttStats() {
  const settings = getMqttSettings();
  if (!settings.enabled || !mqttClient || !mqttClient.connected) return;

  const prefix = settings.topicPrefix || 'mybuild/stats';

  // Compute stats from DB
  const rows = db.prepare('SELECT section, duration_minutes FROM sessions').all();
  const sectionTotals = {};
  let totalMinutes = 0;

  for (const row of rows) {
    const sec = row.section;
    if (!sectionTotals[sec]) sectionTotals[sec] = 0;
    sectionTotals[sec] += row.duration_minutes;
    totalMinutes += row.duration_minutes;
  }

  const totalHours = (totalMinutes / 60).toFixed(1);
  const sessionCount = rows.length;

  // Publish total
  mqttClient.publish(`${prefix}/total_hours`, totalHours, { retain: true });
  mqttClient.publish(`${prefix}/total_sessions`, String(sessionCount), { retain: true });

  // Publish per section using dynamic sections
  const sectionConfigs = getSetting('sections', DEFAULT_SECTIONS);
  for (const sec of sectionConfigs) {
    const hours = ((sectionTotals[sec.id] || 0) / 60).toFixed(1);
    mqttClient.publish(`${prefix}/${sec.id}`, hours, { retain: true });
  }

  // Publish HA discovery if enabled
  if (settings.haDiscovery) {
    publishHaDiscovery(settings, sectionConfigs, prefix);
  }

  console.log(`MQTT: published stats (total: ${totalHours}h, ${sessionCount} sessions)`);
}

function publishHaDiscovery(settings, sectionConfigs, prefix) {
  if (!mqttClient || !mqttClient.connected) return;

  const discoveryPrefix = settings.haDiscoveryPrefix || 'homeassistant';
  const deviceId = (settings.topicPrefix || 'mybuild_stats').replace(/[^a-z0-9]/gi, '_');
  const deviceName = getSetting('general', { projectName: 'Build Tracker' }).projectName || 'Build Tracker';

  const device = {
    identifiers: [deviceId],
    name: deviceName,
    manufacturer: 'Build Tracker',
    model: 'MQTT Stats',
  };

  function publishSensor(objectId, name, stateTopic, unit, icon) {
    const uniqueId = `${deviceId}_${objectId}`;
    const configTopic = `${discoveryPrefix}/sensor/${uniqueId}/config`;
    const payload = {
      name,
      state_topic: stateTopic,
      unique_id: uniqueId,
      object_id: uniqueId,
      device,
      icon,
      ...(unit ? { unit_of_measurement: unit } : {}),
    };
    mqttClient.publish(configTopic, JSON.stringify(payload), { retain: true });
  }

  publishSensor('total_hours', `${deviceName} Total Hours`, `${prefix}/total_hours`, 'h', 'mdi:clock-outline');
  publishSensor('total_sessions', `${deviceName} Total Sessions`, `${prefix}/total_sessions`, '', 'mdi:counter');

  for (const sec of sectionConfigs) {
    const label = sec.label || sec.id;
    publishSensor(sec.id, `${deviceName} ${label}`, `${prefix}/${sec.id}`, 'h', 'mdi:tools');
  }

  console.log(`MQTT: published HA discovery configs to ${discoveryPrefix}/sensor/...`);
}

// Connect on startup
connectMqtt();

// ─── MinIO setup ────────────────────────────────────────────────────
const minio = new MinioClient({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

// Ensure bucket exists on startup
(async () => {
  try {
    const exists = await minio.bucketExists(MINIO_BUCKET);
    if (!exists) {
      await minio.makeBucket(MINIO_BUCKET);
      const policy = {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${MINIO_BUCKET}/*`],
        }],
      };
      await minio.setBucketPolicy(MINIO_BUCKET, JSON.stringify(policy));
      console.log(`Created bucket: ${MINIO_BUCKET}`);
    }
  } catch (err) {
    console.error('MinIO bucket setup error:', err.message);
  }
})();

// ─── Helper: build public URL for MinIO object ─────────────────────
function getPublicUrl(objectName) {
  return `/files/${objectName}`;
}

// ─── API Routes ─────────────────────────────────────────────────────

// GET /api/sessions — list all sessions
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

// POST /api/sessions — create a session
app.post('/api/sessions', (req, res) => {
  const { id, section, startTime, endTime, durationMinutes, notes, plansReference, imageUrls } = req.body;
  db.prepare(`
    INSERT INTO sessions (id, section, start_time, end_time, duration_minutes, notes, plans_reference, image_urls)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, section, startTime, endTime, durationMinutes, notes || '', plansReference || null, JSON.stringify(imageUrls || []));
  publishMqttStats();
  res.json({ ok: true });
});

// PUT /api/sessions/:id — update a session
app.put('/api/sessions/:id', (req, res) => {
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

// DELETE /api/sessions/:id — delete a session and its images
app.delete('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;

  const row = db.prepare('SELECT image_urls FROM sessions WHERE id = ?').get(id);
  if (row) {
    const imageUrls = JSON.parse(row.image_urls || '[]');
    for (const url of imageUrls) {
      try {
        const objectName = url.replace(/^\/files\//, '');
        if (objectName) await minio.removeObject(MINIO_BUCKET, objectName);
      } catch (err) {
        console.error('Failed to delete image from MinIO:', err.message);
      }
    }
  }

  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  publishMqttStats();
  res.json({ ok: true });
});

// POST /api/upload — upload images to MinIO
app.post('/api/upload', upload.array('files', 10), async (req, res) => {
  const sessionId = req.body.sessionId || 'unknown';
  const urls = [];

  try {
    for (const file of req.files) {
      const ext = file.originalname.split('.').pop();
      const objectName = `${sessionId}/${uuidv4()}.${ext}`;
      await minio.putObject(MINIO_BUCKET, objectName, file.buffer, file.size, {
        'Content-Type': file.mimetype,
      });
      urls.push(getPublicUrl(objectName));
    }
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/upload — delete an image from MinIO
app.delete('/api/upload', async (req, res) => {
  const { url } = req.body;
  try {
    const parts = url.split(`/${MINIO_BUCKET}/`);
    if (parts.length > 1) {
      const objectName = decodeURIComponent(parts[1]);
      await minio.removeObject(MINIO_BUCKET, objectName);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── General Settings API ────────────────────────────────────────────
app.get('/api/settings/general', (req, res) => {
  const settings = getSetting('general', { projectName: 'RV-10 Build Tracker' });
  res.json(settings);
});

app.put('/api/settings/general', (req, res) => {
  const current = getSetting('general', { projectName: 'RV-10 Build Tracker' });
  const updates = req.body;
  const newSettings = {
    projectName: updates.projectName !== undefined ? updates.projectName : current.projectName,
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

app.put('/api/settings/mqtt', (req, res) => {
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

app.post('/api/settings/mqtt/test', (req, res) => {
  if (!mqttClient || !mqttClient.connected) {
    return res.status(400).json({ error: 'MQTT not connected' });
  }
  publishMqttStats();
  res.json({ ok: true, message: 'Stats published' });
});

// ─── Sections API ───────────────────────────────────────────────────
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

app.get('/api/sections', (req, res) => {
  const sections = getSetting('sections', DEFAULT_SECTIONS);
  res.json(sections);
});

app.put('/api/sections', (req, res) => {
  const sections = req.body;
  if (!Array.isArray(sections)) return res.status(400).json({ error: 'Expected array' });
  setSetting('sections', sections);
  res.json({ ok: true });
});

// ─── Proxy MinIO files ──────────────────────────────────────────────
app.get('/files/*', async (req, res) => {
  const key = req.params[0];
  try {
    const stat = await minio.statObject(MINIO_BUCKET, key);
    if (stat.metaData && stat.metaData['content-type']) {
      res.setHeader('Content-Type', stat.metaData['content-type']);
    }
    const stream = await minio.getObject(MINIO_BUCKET, key);
    stream.pipe(res);
  } catch (err) {
    console.error('File proxy error:', err.message);
    res.status(404).send('File not found');
  }
});

// ─── Start ──────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});
app.listen(PORT, () => {
  console.log(`RV-10 Build Tracker API running on port ${PORT}`);
  console.log(`MinIO: ${MINIO_ENDPOINT}:${MINIO_PORT} bucket=${MINIO_BUCKET}`);
  console.log(`SQLite: ${DB_PATH}`);
});
