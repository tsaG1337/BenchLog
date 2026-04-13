'use strict';
const path = require('path');
const fs   = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_BACKEND = process.env.DB_BACKEND || 'sqlite';
const DATA_DIR   = process.env.DATA_DIR   || path.join(__dirname, 'data');
const MASTER_DB  = path.join(DATA_DIR, 'master.db');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const LEGACY_DB  = path.join(DATA_DIR, 'database.db');

// ─── Helpers ──────────────────────────────────────────────────────────

/** Convert ? placeholders to $1, $2, … for PostgreSQL */
function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Primary key columns per table — used to build ON CONFLICT clauses
const TABLE_PKS = {
  settings:          ['key', 'tenant_id'],
  active_timer:      ['tenant_id'],
  expense_budgets:   ['category', 'tenant_id'],
  pending_uploads:   ['url', 'tenant_id'],
  flowchart_status:  ['key', 'tenant_id'],
};

/**
 * Convert SQLite-specific syntax to PostgreSQL:
 *   INSERT OR REPLACE INTO t (cols) VALUES (...)
 *     → INSERT INTO t (cols) VALUES (...) ON CONFLICT (pks) DO UPDATE SET non_pks = EXCLUDED.non_pks
 *   datetime('now') → NOW()
 */
function adaptForPostgres(sql) {
  // datetime('now') → NOW()
  sql = sql.replace(/datetime\('now'\)/gi, 'NOW()');

  // INSERT OR REPLACE → INSERT ... ON CONFLICT DO UPDATE
  const match = sql.match(/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (match) {
    const table   = match[1];
    const cols    = match[2].split(',').map(c => c.trim());
    const pks     = TABLE_PKS[table];
    if (pks) {
      const nonPks   = cols.filter(c => !pks.includes(c));
      const updateSet = nonPks.length
        ? `DO UPDATE SET ${nonPks.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
        : 'DO NOTHING';
      sql = sql.replace(/INSERT\s+OR\s+REPLACE/i, 'INSERT')
               + ` ON CONFLICT (${pks.join(', ')}) ${updateSet}`;
    } else {
      // Unknown table — fall back to INSERT OR IGNORE equivalent
      sql = sql.replace(/INSERT\s+OR\s+REPLACE/i, 'INSERT') + ' ON CONFLICT DO NOTHING';
    }
  }

  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE/i.test(sql)) {
    sql = sql.replace(/INSERT\s+OR\s+IGNORE/i, 'INSERT') + ' ON CONFLICT DO NOTHING';
  }

  return sql;
}

/** Append RETURNING id to plain INSERT statements so Postgres returns the auto-increment ID.
 *  Skips ON CONFLICT variants (upsert tables like settings, active_timer, etc. that lack an id column). */
function pgRunWithReturning(sql) {
  const trimmed = sql.trimEnd().replace(/;$/, '');
  if (/^\s*INSERT\s+INTO\s+/i.test(trimmed) && !/RETURNING\s+/i.test(trimmed) && !/ON\s+CONFLICT/i.test(trimmed)) {
    return trimmed + ' RETURNING id';
  }
  return sql;
}

// ─── SQLite implementation ─────────────────────────────────────────────

let BetterSqlite;
const sqliteCache = new Map(); // dbPath → Database instance
const SQLITE_CACHE_MAX = 50;

function openSqlite(dbPath) {
  if (sqliteCache.has(dbPath)) return sqliteCache.get(dbPath);
  if (!BetterSqlite) BetterSqlite = require('better-sqlite3');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new BetterSqlite(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  if (sqliteCache.size >= SQLITE_CACHE_MAX) {
    const firstKey = sqliteCache.keys().next().value;
    try { sqliteCache.get(firstKey).close(); } catch {}
    sqliteCache.delete(firstKey);
  }
  sqliteCache.set(dbPath, db);
  return db;
}

function makeSqliteWrapper(sqlite, tenantId) {
  return {
    tenantId,
    backend: 'sqlite',

    get(sql, params = []) {
      return Promise.resolve(sqlite.prepare(sql).get(params));
    },

    all(sql, params = []) {
      return Promise.resolve(sqlite.prepare(sql).all(params));
    },

    run(sql, params = []) {
      const info = sqlite.prepare(sql).run(params);
      return Promise.resolve({ changes: info.changes, lastID: info.lastInsertRowid });
    },

    /** Run fn(wrapper) synchronously inside a SQLite transaction.
     *  Our wrappers return already-resolved Promises so this works
     *  as long as fn does not do real async I/O between db calls. */
    transaction(fn) {
      let syncResult, syncError;
      try {
        sqlite.prepare('BEGIN').run();
        const p = fn(this);
        p.then(r => { syncResult = r; }).catch(e => { syncError = e; });
        if (syncError) throw syncError;
        sqlite.prepare('COMMIT').run();
        return Promise.resolve(syncResult);
      } catch (e) {
        try { sqlite.prepare('ROLLBACK').run(); } catch {}
        return Promise.reject(e);
      }
    },
  };
}

// ─── Master DB (tenants table) ─────────────────────────────────────────

let _masterSqlite;
function getMasterSqlite() {
  if (!_masterSqlite) {
    _masterSqlite = openSqlite(MASTER_DB);
    _masterSqlite.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id            TEXT PRIMARY KEY,
        slug          TEXT NOT NULL UNIQUE,
        email         TEXT,
        display_name  TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL DEFAULT '',
        created_at    TEXT DEFAULT (datetime('now')),
        is_active     INTEGER NOT NULL DEFAULT 1,
        plan          TEXT NOT NULL DEFAULT 'free',
        project_name  TEXT NOT NULL DEFAULT 'My Build',
        aircraft_type TEXT NOT NULL DEFAULT 'RV-10',
        public_blog   INTEGER NOT NULL DEFAULT 1
      )
    `);
    // Migrate: add role column if not present, promote first tenant to admin
    try { _masterSqlite.exec(`ALTER TABLE tenants ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`); } catch {}
    const _ft = _masterSqlite.prepare('SELECT id FROM tenants WHERE role = ? ORDER BY created_at LIMIT 1').get('user');
    const _count = _masterSqlite.prepare('SELECT COUNT(*) as n FROM tenants').get();
    if (_ft && _count && _count.n <= 1) {
      _masterSqlite.prepare('UPDATE tenants SET role = ? WHERE id = ?').run('admin', _ft.id);
    }
  }
  return _masterSqlite;
}

/** Returns the master db wrapper (synchronous better-sqlite3, no tenantId). */
function masterDb() {
  const sqlite = getMasterSqlite();
  return makeSqliteWrapper(sqlite, null);
}

// ─── Tenant DB ─────────────────────────────────────────────────────────

function tenantDbPath(tenantId) {
  return path.join(TENANTS_DIR, tenantId, 'database.db');
}

/** Returns a db wrapper for the given tenant (SQLite mode). */
function getTenantDb(tenantId) {
  if (DB_BACKEND === 'postgres') return getPostgresDb(tenantId);
  const sqlite = openSqlite(tenantDbPath(tenantId));
  return makeSqliteWrapper(sqlite, tenantId);
}

// ─── First-tenant helpers ──────────────────────────────────────────────

let _firstTenantId = null;

/** Returns the ID of the first (and usually only) tenant. SQLite: reads master.db synchronously. */
function getDefaultTenantId() {
  if (_firstTenantId) return _firstTenantId;
  if (DB_BACKEND !== 'sqlite') return null; // Postgres: populated by ensureFirstTenant() at startup
  const master = getMasterSqlite();
  const row = master.prepare('SELECT id FROM tenants LIMIT 1').get();
  _firstTenantId = row ? row.id : null;
  return _firstTenantId;
}

function getDefaultDb() {
  const id = getDefaultTenantId();
  if (!id) throw new Error('No tenant found — database not initialised yet');
  return getTenantDb(id);
}

/**
 * Find-or-create the first tenant for both backends.
 * SQLite:    reads master.db; creates a tenant row if none exists.
 * PostgreSQL: queries the tenants table; creates one if empty.
 * Sets the internal cache so getDefaultTenantId() / getDefaultDb() work immediately after.
 *
 * @param {object} [opts]
 * @param {string} [opts.adminPassword]  Plain-text password to hash and store (postgres only).
 * @param {Function} [opts.initSchema]   Called with the raw sqlite db before returning (sqlite only).
 * @returns {Promise<string>} The tenant ID.
 */
async function ensureFirstTenant({ adminPassword, initSchema } = {}) {
  if (DB_BACKEND === 'postgres') {
    const pool = getPool();
    const { rows } = await pool.query('SELECT id, role FROM tenants LIMIT 1');
    let tenantId;
    if (rows.length === 0) {
      tenantId = uuidv4();
      const hash = adminPassword
        ? await require('bcrypt').hash(adminPassword, 12)
        : '';
      await pool.query(
        'INSERT INTO tenants (id, slug, display_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, 'admin', 'Admin', hash, 'admin']
      );
      console.log(adminPassword
        ? '[init] Created first tenant with preset password from ADMIN_PASSWORD'
        : '[init] Created first tenant — visit the app to set your password');
    } else {
      tenantId = rows[0].id;
      // Promote to admin if still 'user' (migration case: role column added after tenant was created)
      if (rows[0].role === 'user') {
        const { rows: cnt } = await pool.query('SELECT COUNT(*) as n FROM tenants');
        if (parseInt(cnt[0].n) <= 1) {
          await pool.query('UPDATE tenants SET role = $1 WHERE id = $2', ['admin', tenantId]);
          console.log('[init] Promoted first tenant to admin');
        }
      }
    }
    _firstTenantId = tenantId;
    return tenantId;
  }

  // SQLite
  const master = getMasterSqlite();
  let row = master.prepare('SELECT id FROM tenants LIMIT 1').get();
  if (!row) {
    const tenantId = uuidv4();
    master.prepare(
      'INSERT INTO tenants (id, slug, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    ).run(tenantId, 'admin', 'Admin', '', 'admin');
    console.log('[init] Created first tenant:', tenantId);
    row = { id: tenantId };
  }
  _firstTenantId = row.id;
  if (initSchema) {
    const sqlite = openSqlite(tenantDbPath(row.id));
    initSchema(sqlite, row.id);
  }
  return row.id;
}

// ─── Tenant auth helpers (backend-agnostic) ───────────────────────────

/** Returns { id, slug, password_hash, role, public_blog } for the first tenant from whichever backend. */
async function getFirstTenant() {
  if (DB_BACKEND === 'postgres') {
    const { rows } = await getPool().query('SELECT id, slug, password_hash, role, public_blog FROM tenants LIMIT 1');
    return rows[0] || null;
  }
  return getMasterSqlite().prepare('SELECT id, slug, password_hash, role, public_blog FROM tenants LIMIT 1').get() || null;
}

/** Returns { id, slug, password_hash, role, public_blog } for the tenant with the given slug. */
async function getTenantBySlug(slug) {
  if (DB_BACKEND === 'postgres') {
    const { rows } = await getPool().query('SELECT id, slug, password_hash, role, public_blog FROM tenants WHERE slug = $1', [slug]);
    return rows[0] || null;
  }
  return getMasterSqlite().prepare('SELECT id, slug, password_hash, role, public_blog FROM tenants WHERE slug = ?').get(slug) || null;
}

/** Returns full tenant profile { id, slug, display_name, email, password_hash, role, public_blog, is_active, created_at } by slug. */
async function getTenantProfileBySlug(slug) {
  if (DB_BACKEND === 'postgres') {
    const { rows } = await getPool().query('SELECT id, slug, display_name, email, password_hash, role, public_blog, is_active, created_at FROM tenants WHERE slug = $1', [slug]);
    return rows[0] || null;
  }
  return getMasterSqlite().prepare('SELECT id, slug, display_name, email, password_hash, role, public_blog, is_active, created_at FROM tenants WHERE slug = ?').get(slug) || null;
}

/** Returns all tenants matching an email (case-insensitive). */
async function getTenantsByEmail(email) {
  if (DB_BACKEND === 'postgres') {
    const { rows } = await getPool().query('SELECT id, slug, display_name, email, role, is_active, created_at FROM tenants WHERE LOWER(email) = LOWER($1)', [email]);
    return rows;
  }
  return getMasterSqlite().prepare('SELECT id, slug, display_name, email, role, is_active, created_at FROM tenants WHERE LOWER(email) = LOWER(?)').all(email);
}

/** Persists password_hash for a tenant in the master/tenants table. */
async function setTenantPassword(tenantId, hash) {
  if (DB_BACKEND === 'postgres') {
    await getPool().query('UPDATE tenants SET password_hash = $1 WHERE id = $2', [hash, tenantId]);
  } else {
    getMasterSqlite().prepare('UPDATE tenants SET password_hash = ? WHERE id = ?').run(hash, tenantId);
  }
}

// ─── Admin / tenant management helpers ────────────────────────────────

async function listTenants() {
  if (DB_BACKEND === 'postgres') {
    const { rows } = await getPool().query(
      'SELECT id, slug, display_name, email, role, created_at, is_active FROM tenants ORDER BY created_at'
    );
    return rows;
  }
  return getMasterSqlite().prepare(
    'SELECT id, slug, display_name, email, role, created_at, is_active FROM tenants ORDER BY created_at'
  ).all();
}

async function getTenantById(id) {
  if (DB_BACKEND === 'postgres') {
    const { rows } = await getPool().query(
      'SELECT id, slug, display_name, email, role, is_active FROM tenants WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }
  return getMasterSqlite().prepare(
    'SELECT id, slug, display_name, email, role, is_active FROM tenants WHERE id = ?'
  ).get(id) || null;
}

async function createTenantRow({ id, slug, display_name, email, role, password_hash }) {
  if (DB_BACKEND === 'postgres') {
    await getPool().query(
      'INSERT INTO tenants (id, slug, display_name, email, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, slug, display_name, email || null, role || 'user', password_hash || '']
    );
  } else {
    getMasterSqlite().prepare(
      'INSERT INTO tenants (id, slug, display_name, email, role, password_hash) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, slug, display_name, email || null, role || 'user', password_hash || '');
  }
}

const TENANT_UPDATABLE_COLS = new Set([
  'slug', 'email', 'display_name', 'password_hash', 'is_active',
  'plan', 'role', 'project_name', 'aircraft_type', 'public_blog',
]);

async function updateTenantRow(id, fields) {
  const entries = Object.entries(fields).filter(([k]) => TENANT_UPDATABLE_COLS.has(k));
  if (entries.length === 0) return;
  if (DB_BACKEND === 'postgres') {
    const setClauses = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
    await getPool().query(
      `UPDATE tenants SET ${setClauses} WHERE id = $1`,
      [id, ...entries.map(([, v]) => v)]
    );
  } else {
    const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
    getMasterSqlite().prepare(`UPDATE tenants SET ${setClauses} WHERE id = ?`)
      .run([...entries.map(([, v]) => v), id]);
  }
}

async function deleteTenantRow(id) {
  if (DB_BACKEND === 'postgres') {
    await getPool().query('DELETE FROM tenants WHERE id = $1', [id]);
  } else {
    getMasterSqlite().prepare('DELETE FROM tenants WHERE id = ?').run(id);
  }
}

// ─── Migration: legacy database.db → tenant layout ────────────────────

function runMigrationIfNeeded() {
  // Only applies to SQLite mode
  if (DB_BACKEND !== 'sqlite') return;

  const masterExists = fs.existsSync(MASTER_DB);
  const legacyExists = fs.existsSync(LEGACY_DB);

  if (!legacyExists || masterExists) return; // nothing to migrate

  console.log('[migration] Detected legacy database.db — starting one-time migration…');

  // 1. Ensure master.db and a default tenant
  const master = getMasterSqlite();
  const tenantId = uuidv4();
  // Carry over password hash from legacy settings table (open with better-sqlite3 directly)
  if (!BetterSqlite) BetterSqlite = require('better-sqlite3');
  const legacyDb = new BetterSqlite(LEGACY_DB);
  let passwordHash = '';
  try {
    const row = legacyDb.prepare("SELECT value FROM settings WHERE key = 'auth_password_hash'").get();
    if (row) passwordHash = JSON.parse(row.value);
  } catch {}
  legacyDb.close();

  master.prepare(`
    INSERT OR IGNORE INTO tenants (id, slug, password_hash, display_name)
    VALUES (?, ?, ?, ?)
  `).run(tenantId, 'default', passwordHash, 'Default');

  // 2. Copy legacy DB file to tenant location
  const destPath = tenantDbPath(tenantId);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(LEGACY_DB, destPath);

  // 3. Add tenant_id column to all tables in the copied DB
  const tenantSqlite = openSqlite(destPath);
  const tables = tenantSqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(r => r.name);

  for (const table of tables) {
    const cols = tenantSqlite.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes('tenant_id')) {
      try {
        tenantSqlite.prepare(
          `ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${tenantId}'`
        ).run();
      } catch (e) {
        console.warn(`[migration] Could not add tenant_id to ${table}:`, e.message);
      }
    }
  }

  // 4. Fix active_timer: change primary key from id INTEGER CHECK(id=1) to tenant_id TEXT
  //    Since SQLite can't drop columns easily, recreate the table
  try {
    const atCols = tenantSqlite.prepare('PRAGMA table_info(active_timer)').all().map(c => c.name);
    // Check if old schema (has `id` column that's the PK)
    if (atCols.includes('id')) {
      const rows = tenantSqlite.prepare('SELECT * FROM active_timer').all();
      tenantSqlite.exec(`
        DROP TABLE active_timer;
        CREATE TABLE IF NOT EXISTS active_timer (
          tenant_id  TEXT PRIMARY KEY,
          section    TEXT NOT NULL,
          start_time TEXT NOT NULL,
          image_urls TEXT DEFAULT '[]'
        );
      `);
      for (const r of rows) {
        tenantSqlite.prepare(
          'INSERT OR IGNORE INTO active_timer (tenant_id, section, start_time, image_urls) VALUES (?, ?, ?, ?)'
        ).run(tenantId, r.section, r.start_time, r.image_urls || '[]');
      }
    }
  } catch (e) {
    console.warn('[migration] active_timer migration warning:', e.message);
  }

  _firstTenantId = tenantId;
  console.log(`[migration] Migrated legacy database.db → tenants/${tenantId}/`);
}

// ─── PostgreSQL implementation ─────────────────────────────────────────

let pgPool;

function getPool() {
  if (!pgPool) {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pgPool;
}

function makePostgresWrapper(tenantId) {
  const pool = getPool();
  return {
    tenantId,
    backend: 'postgres',

    async get(sql, params = []) {
      const { rows } = await pool.query(toPostgres(adaptForPostgres(sql)), params);
      return rows[0];
    },

    async all(sql, params = []) {
      const { rows } = await pool.query(toPostgres(adaptForPostgres(sql)), params);
      return rows;
    },

    async run(sql, params = []) {
      const pgSql = toPostgres(adaptForPostgres(sql));
      const result = await pool.query(pgRunWithReturning(pgSql), params);
      const lastID = result.rows?.[0]?.id ?? undefined;
      return { changes: result.rowCount, lastID };
    },

    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const clientWrapper = {
          tenantId,
          backend: 'postgres',
          get:  (s, p=[]) => client.query(toPostgres(adaptForPostgres(s)), p).then(r => r.rows[0]),
          all:  (s, p=[]) => client.query(toPostgres(adaptForPostgres(s)), p).then(r => r.rows),
          run:  (s, p=[]) => { const q = pgRunWithReturning(toPostgres(adaptForPostgres(s))); return client.query(q, p).then(r => ({ changes: r.rowCount, lastID: r.rows?.[0]?.id })); },
          transaction: (f) => f(clientWrapper), // nested: reuse same client
        };
        const result = await fn(clientWrapper);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

function getPostgresDb(tenantId) {
  return makePostgresWrapper(tenantId);
}

// ─── Exports ───────────────────────────────────────────────────────────

module.exports = {
  DB_BACKEND,
  DATA_DIR,
  MASTER_DB,
  TENANTS_DIR,
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
};
