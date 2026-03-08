const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const multer = require('multer');
const { Client: MinioClient } = require('minio');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

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
      // Set bucket policy to public read
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
  res.json({ ok: true });
});

// PUT /api/sessions/:id — update a session
app.put('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Build dynamic SET clause
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
  res.json({ ok: true });
});

// DELETE /api/sessions/:id — delete a session and its images
app.delete('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;

  // Fetch image URLs before deleting
  const row = db.prepare('SELECT image_urls FROM sessions WHERE id = ?').get(id);
  if (row) {
    const imageUrls = JSON.parse(row.image_urls || '[]');
    for (const url of imageUrls) {
      try {
        // URLs are like /files/<objectName>
        const objectName = url.replace(/^\/files\//, '');
        if (objectName) await minio.removeObject(MINIO_BUCKET, objectName);
      } catch (err) {
        console.error('Failed to delete image from MinIO:', err.message);
      }
    }
  }

  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
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
