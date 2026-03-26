'use strict';

/**
 * initMasterSchema(masterSqlite)
 * Creates the tenants table in the master SQLite database.
 * Accepts the raw better-sqlite3 Database object (not a wrapper).
 */
function initMasterSchema(masterSqlite) {
  masterSqlite.exec(`
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
      public_blog   INTEGER NOT NULL DEFAULT 1,
      role          TEXT NOT NULL DEFAULT 'user'
    )
  `);
}

/**
 * initTenantSchema(tenantSqlite, tenantId)
 * Creates all per-tenant tables in a tenant SQLite database.
 * Accepts the raw better-sqlite3 Database object.
 *
 * All tables carry a tenant_id column so that the query interface
 * stays identical to the PostgreSQL backend.
 */
function initTenantSchema(tenantSqlite, tenantId) {
  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id               TEXT NOT NULL,
      tenant_id        TEXT NOT NULL DEFAULT '',
      section          TEXT NOT NULL,
      start_time       TEXT NOT NULL,
      end_time         TEXT NOT NULL,
      duration_minutes REAL NOT NULL,
      notes            TEXT DEFAULT '',
      plans_reference  TEXT,
      image_urls       TEXT DEFAULT '[]',
      created_at       TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (id, tenant_id)
    )
  `);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key       TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT '',
      value     TEXT NOT NULL,
      PRIMARY KEY (key, tenant_id)
    )
  `);

  // active_timer uses tenant_id as the singleton PK (one active timer per tenant)
  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS active_timer (
      tenant_id  TEXT PRIMARY KEY,
      section    TEXT NOT NULL,
      start_time TEXT NOT NULL,
      image_urls TEXT DEFAULT '[]'
    )
  `);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id           TEXT NOT NULL,
      tenant_id    TEXT NOT NULL DEFAULT '',
      title        TEXT NOT NULL,
      content      TEXT NOT NULL DEFAULT '',
      section      TEXT,
      image_urls   TEXT DEFAULT '[]',
      published_at TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (id, tenant_id)
    )
  `);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id                       TEXT NOT NULL,
      tenant_id                TEXT NOT NULL DEFAULT '',
      date                     TEXT NOT NULL,
      amount                   REAL NOT NULL,
      currency                 TEXT NOT NULL DEFAULT 'EUR',
      exchange_rate            REAL NOT NULL DEFAULT 1.0,
      amount_home              REAL NOT NULL,
      description              TEXT NOT NULL,
      vendor                   TEXT DEFAULT '',
      category                 TEXT NOT NULL DEFAULT 'other',
      assembly_section         TEXT DEFAULT '',
      part_number              TEXT DEFAULT '',
      is_certification_relevant INTEGER DEFAULT 0,
      receipt_urls             TEXT DEFAULT '[]',
      notes                    TEXT DEFAULT '',
      tags                     TEXT DEFAULT '[]',
      link                     TEXT DEFAULT '',
      created_at               TEXT DEFAULT (datetime('now')),
      updated_at               TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (id, tenant_id)
    )
  `);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS expense_budgets (
      category      TEXT NOT NULL,
      tenant_id     TEXT NOT NULL DEFAULT '',
      budget_amount REAL NOT NULL,
      PRIMARY KEY (category, tenant_id)
    )
  `);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS visitor_stats (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL DEFAULT '',
      ts        INTEGER NOT NULL,
      path      TEXT NOT NULL,
      country   TEXT NOT NULL DEFAULT 'XX',
      referrer  TEXT DEFAULT '',
      post_id   TEXT DEFAULT ''
    )
  `);
  tenantSqlite.exec(`CREATE INDEX IF NOT EXISTS idx_visitor_stats_ts ON visitor_stats (ts)`);
  tenantSqlite.exec(`CREATE INDEX IF NOT EXISTS idx_visitor_stats_tenant ON visitor_stats (tenant_id)`);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS sign_offs (
      id                    TEXT NOT NULL,
      tenant_id             TEXT NOT NULL DEFAULT '',
      package_id            TEXT NOT NULL,
      package_label         TEXT NOT NULL,
      section_id            TEXT NOT NULL,
      date                  TEXT NOT NULL,
      inspector_name        TEXT DEFAULT '',
      inspection_completed  INTEGER DEFAULT 0,
      no_critical_issues    INTEGER DEFAULT 0,
      execution_satisfactory INTEGER DEFAULT 0,
      rework_needed         INTEGER DEFAULT 0,
      comments              TEXT DEFAULT '',
      signature_png         TEXT NOT NULL,
      created_at            TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (id, tenant_id)
    )
  `);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS image_annotations (
      image_url        TEXT NOT NULL,
      tenant_id        TEXT NOT NULL DEFAULT '',
      annotations_json TEXT NOT NULL DEFAULT '[]',
      updated_at       TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (image_url, tenant_id)
    )
  `);
}

/**
 * initPostgresSchema(pool)
 * Creates all tables in PostgreSQL (master + tenant tables).
 * Uses TEXT for timestamps to match SQLite behaviour.
 */
async function initPostgresSchema(pool) {
  const NOW_TEXT = `to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

  const statements = [
    `CREATE TABLE IF NOT EXISTS tenants (
      id            TEXT PRIMARY KEY,
      slug          TEXT NOT NULL UNIQUE,
      email         TEXT,
      display_name  TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      created_at    TEXT DEFAULT (${NOW_TEXT}),
      is_active     INTEGER NOT NULL DEFAULT 1,
      plan          TEXT NOT NULL DEFAULT 'free',
      project_name  TEXT NOT NULL DEFAULT 'My Build',
      aircraft_type TEXT NOT NULL DEFAULT 'RV-10',
      public_blog   INTEGER NOT NULL DEFAULT 1,
      role          TEXT NOT NULL DEFAULT 'user'
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id               TEXT NOT NULL,
      tenant_id        TEXT NOT NULL DEFAULT '',
      section          TEXT NOT NULL,
      start_time       TEXT NOT NULL,
      end_time         TEXT NOT NULL,
      duration_minutes REAL NOT NULL,
      notes            TEXT DEFAULT '',
      plans_reference  TEXT,
      image_urls       TEXT DEFAULT '[]',
      created_at       TEXT DEFAULT (${NOW_TEXT}),
      PRIMARY KEY (id, tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key       TEXT NOT NULL,
      tenant_id TEXT NOT NULL DEFAULT '',
      value     TEXT NOT NULL,
      PRIMARY KEY (key, tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS active_timer (
      tenant_id  TEXT PRIMARY KEY,
      section    TEXT NOT NULL,
      start_time TEXT NOT NULL,
      image_urls TEXT DEFAULT '[]'
    )`,
    `CREATE TABLE IF NOT EXISTS blog_posts (
      id           TEXT NOT NULL,
      tenant_id    TEXT NOT NULL DEFAULT '',
      title        TEXT NOT NULL,
      content      TEXT NOT NULL DEFAULT '',
      section      TEXT,
      image_urls   TEXT DEFAULT '[]',
      published_at TEXT DEFAULT (${NOW_TEXT}),
      updated_at   TEXT DEFAULT (${NOW_TEXT}),
      PRIMARY KEY (id, tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id                        TEXT NOT NULL,
      tenant_id                 TEXT NOT NULL DEFAULT '',
      date                      TEXT NOT NULL,
      amount                    REAL NOT NULL,
      currency                  TEXT NOT NULL DEFAULT 'EUR',
      exchange_rate             REAL NOT NULL DEFAULT 1.0,
      amount_home               REAL NOT NULL,
      description               TEXT NOT NULL,
      vendor                    TEXT DEFAULT '',
      category                  TEXT NOT NULL DEFAULT 'other',
      assembly_section          TEXT DEFAULT '',
      part_number               TEXT DEFAULT '',
      is_certification_relevant INTEGER DEFAULT 0,
      receipt_urls              TEXT DEFAULT '[]',
      notes                     TEXT DEFAULT '',
      tags                      TEXT DEFAULT '[]',
      link                      TEXT DEFAULT '',
      created_at                TEXT DEFAULT (${NOW_TEXT}),
      updated_at                TEXT DEFAULT (${NOW_TEXT}),
      PRIMARY KEY (id, tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS expense_budgets (
      category      TEXT NOT NULL,
      tenant_id     TEXT NOT NULL DEFAULT '',
      budget_amount REAL NOT NULL,
      PRIMARY KEY (category, tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS visitor_stats (
      id        BIGSERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      ts        BIGINT NOT NULL,
      path      TEXT NOT NULL,
      country   TEXT NOT NULL DEFAULT 'XX',
      referrer  TEXT DEFAULT '',
      post_id   TEXT DEFAULT ''
    )`,
    `CREATE INDEX IF NOT EXISTS idx_visitor_stats_ts     ON visitor_stats (ts)`,
    `CREATE INDEX IF NOT EXISTS idx_visitor_stats_tenant ON visitor_stats (tenant_id)`,
    `CREATE TABLE IF NOT EXISTS sign_offs (
      id                     TEXT NOT NULL,
      tenant_id              TEXT NOT NULL DEFAULT '',
      package_id             TEXT NOT NULL,
      package_label          TEXT NOT NULL,
      section_id             TEXT NOT NULL,
      date                   TEXT NOT NULL,
      inspector_name         TEXT DEFAULT '',
      inspection_completed   INTEGER DEFAULT 0,
      no_critical_issues     INTEGER DEFAULT 0,
      execution_satisfactory INTEGER DEFAULT 0,
      rework_needed          INTEGER DEFAULT 0,
      comments               TEXT DEFAULT '',
      signature_png          TEXT NOT NULL,
      created_at             TEXT DEFAULT (${NOW_TEXT}),
      PRIMARY KEY (id, tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS image_annotations (
      image_url        TEXT NOT NULL,
      tenant_id        TEXT NOT NULL DEFAULT '',
      annotations_json TEXT NOT NULL DEFAULT '[]',
      updated_at       TEXT DEFAULT (${NOW_TEXT}),
      PRIMARY KEY (image_url, tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS pending_uploads (
      url         TEXT NOT NULL,
      tenant_id   TEXT NOT NULL DEFAULT '',
      uploaded_at BIGINT NOT NULL,
      PRIMARY KEY (url, tenant_id)
    )`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`,
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }
  console.log('[init] PostgreSQL schema ready');
}

module.exports = { initMasterSchema, initTenantSchema, initPostgresSchema };
