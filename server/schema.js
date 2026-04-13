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
      section        TEXT,
      plans_section  TEXT DEFAULT '',
      image_urls     TEXT DEFAULT '[]',
      published_at   TEXT DEFAULT (datetime('now')),
      updated_at     TEXT DEFAULT (datetime('now')),
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
    CREATE TABLE IF NOT EXISTS inspection_sessions (
      id             TEXT NOT NULL,
      tenant_id      TEXT NOT NULL DEFAULT '',
      session_name   TEXT NOT NULL,
      date           TEXT NOT NULL,
      inspector_name TEXT DEFAULT '',
      inspector_id   TEXT DEFAULT '',
      notes          TEXT DEFAULT '',
      signature_png  TEXT DEFAULT '',
      created_at     TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (id, tenant_id)
    )
  `);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS inspection_packages (
      id            TEXT NOT NULL PRIMARY KEY,
      session_id    TEXT NOT NULL,
      tenant_id     TEXT NOT NULL DEFAULT '',
      package_id    TEXT NOT NULL,
      package_label TEXT NOT NULL,
      section_id    TEXT DEFAULT '',
      outcome       TEXT DEFAULT 'ok',
      notes         TEXT DEFAULT '',
      sort_order    INTEGER DEFAULT 0
    )
  `);
  tenantSqlite.exec(`CREATE INDEX IF NOT EXISTS idx_insp_pkg_session ON inspection_packages (session_id, tenant_id)`);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS inspection_sub_items (
      id         TEXT NOT NULL PRIMARY KEY,
      package_id TEXT NOT NULL,
      tenant_id  TEXT NOT NULL DEFAULT '',
      label      TEXT NOT NULL,
      outcome    TEXT DEFAULT 'ok',
      notes      TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);
  tenantSqlite.exec(`CREATE INDEX IF NOT EXISTS idx_insp_sub_pkg ON inspection_sub_items (package_id, tenant_id)`);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS pending_uploads (
      url         TEXT NOT NULL,
      tenant_id   TEXT NOT NULL DEFAULT '',
      uploaded_at BIGINT NOT NULL,
      PRIMARY KEY (url, tenant_id)
    )
  `);

  // ─── Inventory ───────────────────────────────────────────────────
  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS inventory_locations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id   TEXT NOT NULL DEFAULT '',
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      parent_id   INTEGER,
      sort_order  INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS inventory_parts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id    TEXT NOT NULL DEFAULT '',
      part_number  TEXT NOT NULL,
      name         TEXT NOT NULL,
      manufacturer TEXT DEFAULT '',
      kit          TEXT DEFAULT '',
      sub_kit      TEXT DEFAULT '',
      category     TEXT DEFAULT 'other',
      mfg_date     TEXT DEFAULT '',
      bag          TEXT DEFAULT '',
      notes        TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    )
  `);
  tenantSqlite.exec(`CREATE INDEX IF NOT EXISTS idx_inv_parts_pn ON inventory_parts (tenant_id, part_number)`);

  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS inventory_stock (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id   TEXT NOT NULL DEFAULT '',
      part_id     INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      quantity    REAL DEFAULT 0,
      unit        TEXT DEFAULT 'pcs',
      status      TEXT DEFAULT 'in_stock',
      condition   TEXT DEFAULT 'new',
      batch       TEXT DEFAULT '',
      source_kit  TEXT DEFAULT '',
      notes       TEXT DEFAULT '',
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `);
  tenantSqlite.exec(`CREATE INDEX IF NOT EXISTS idx_inv_stock_part ON inventory_stock (tenant_id, part_id)`);
  tenantSqlite.exec(`CREATE INDEX IF NOT EXISTS idx_inv_stock_loc  ON inventory_stock (tenant_id, location_id)`);

  // Inventory check sessions (kit verification)
  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS inventory_check_sessions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id      TEXT NOT NULL DEFAULT '',
      aircraft_type  TEXT NOT NULL,
      kit_id         TEXT NOT NULL,
      kit_label      TEXT NOT NULL DEFAULT '',
      status         TEXT NOT NULL DEFAULT 'active',
      total_items    INTEGER DEFAULT 0,
      verified_items INTEGER DEFAULT 0,
      missing_items  INTEGER DEFAULT 0,
      created_at     TEXT DEFAULT (datetime('now')),
      updated_at     TEXT DEFAULT (datetime('now'))
    )
  `);
  tenantSqlite.exec(`
    CREATE TABLE IF NOT EXISTS inventory_check_items (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id     INTEGER NOT NULL,
      tenant_id      TEXT NOT NULL DEFAULT '',
      part_number    TEXT NOT NULL,
      nomenclature   TEXT DEFAULT '',
      sub_kit        TEXT DEFAULT '',
      bag            TEXT DEFAULT '',
      qty_expected   REAL DEFAULT 1,
      qty_found      REAL DEFAULT 0,
      unit           TEXT DEFAULT 'pcs',
      status         TEXT NOT NULL DEFAULT 'pending',
      notes          TEXT DEFAULT '',
      scanned_at     TEXT,
      FOREIGN KEY (session_id) REFERENCES inventory_check_sessions(id)
    )
  `);
  tenantSqlite.exec(`CREATE INDEX IF NOT EXISTS idx_check_items_session ON inventory_check_items (session_id, tenant_id)`);
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
      section        TEXT,
      plans_section  TEXT DEFAULT '',
      image_urls     TEXT DEFAULT '[]',
      published_at   TEXT DEFAULT (${NOW_TEXT}),
      updated_at     TEXT DEFAULT (${NOW_TEXT}),
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
    `CREATE TABLE IF NOT EXISTS inspection_sessions (
      id             TEXT NOT NULL,
      tenant_id      TEXT NOT NULL DEFAULT '',
      session_name   TEXT NOT NULL,
      date           TEXT NOT NULL,
      inspector_name TEXT DEFAULT '',
      inspector_id   TEXT DEFAULT '',
      notes          TEXT DEFAULT '',
      signature_png  TEXT DEFAULT '',
      created_at     TEXT DEFAULT (${NOW_TEXT}),
      PRIMARY KEY (id, tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS inspection_packages (
      id            TEXT NOT NULL PRIMARY KEY,
      session_id    TEXT NOT NULL,
      tenant_id     TEXT NOT NULL DEFAULT '',
      package_id    TEXT NOT NULL,
      package_label TEXT NOT NULL,
      section_id    TEXT DEFAULT '',
      outcome       TEXT DEFAULT 'ok',
      notes         TEXT DEFAULT '',
      sort_order    INTEGER DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_insp_pkg_session ON inspection_packages (session_id, tenant_id)`,
    `CREATE TABLE IF NOT EXISTS inspection_sub_items (
      id         TEXT NOT NULL PRIMARY KEY,
      package_id TEXT NOT NULL,
      tenant_id  TEXT NOT NULL DEFAULT '',
      label      TEXT NOT NULL,
      outcome    TEXT DEFAULT 'ok',
      notes      TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_insp_sub_pkg ON inspection_sub_items (package_id, tenant_id)`,
    `CREATE TABLE IF NOT EXISTS pending_uploads (
      url         TEXT NOT NULL,
      tenant_id   TEXT NOT NULL DEFAULT '',
      uploaded_at BIGINT NOT NULL,
      PRIMARY KEY (url, tenant_id)
    )`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`,

    // ─── Inventory ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS inventory_locations (
      id          BIGSERIAL PRIMARY KEY,
      tenant_id   TEXT NOT NULL DEFAULT '',
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      parent_id   INTEGER,
      sort_order  INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (${NOW_TEXT})
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_parts (
      id           BIGSERIAL PRIMARY KEY,
      tenant_id    TEXT NOT NULL DEFAULT '',
      part_number  TEXT NOT NULL,
      name         TEXT NOT NULL,
      manufacturer TEXT DEFAULT '',
      kit          TEXT DEFAULT '',
      category     TEXT DEFAULT 'other',
      mfg_date     TEXT DEFAULT '',
      bag          TEXT DEFAULT '',
      notes        TEXT DEFAULT '',
      created_at   TEXT DEFAULT (${NOW_TEXT})
    )`,
    `CREATE INDEX IF NOT EXISTS idx_inv_parts_pn    ON inventory_parts (tenant_id, part_number)`,
    `CREATE TABLE IF NOT EXISTS inventory_stock (
      id          BIGSERIAL PRIMARY KEY,
      tenant_id   TEXT NOT NULL DEFAULT '',
      part_id     INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      quantity    REAL DEFAULT 0,
      unit        TEXT DEFAULT 'pcs',
      status      TEXT DEFAULT 'in_stock',
      condition   TEXT DEFAULT 'new',
      batch       TEXT DEFAULT '',
      source_kit  TEXT DEFAULT '',
      notes       TEXT DEFAULT '',
      updated_at  TEXT DEFAULT (${NOW_TEXT})
    )`,
    `CREATE INDEX IF NOT EXISTS idx_inv_stock_part ON inventory_stock (tenant_id, part_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inv_stock_loc  ON inventory_stock (tenant_id, location_id)`,
    `CREATE TABLE IF NOT EXISTS inventory_check_sessions (
      id             BIGSERIAL PRIMARY KEY,
      tenant_id      TEXT NOT NULL DEFAULT '',
      aircraft_type  TEXT NOT NULL,
      kit_id         TEXT NOT NULL,
      kit_label      TEXT NOT NULL DEFAULT '',
      status         TEXT NOT NULL DEFAULT 'active',
      total_items    INTEGER DEFAULT 0,
      verified_items INTEGER DEFAULT 0,
      missing_items  INTEGER DEFAULT 0,
      created_at     TEXT DEFAULT (${NOW_TEXT}),
      updated_at     TEXT DEFAULT (${NOW_TEXT})
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_check_items (
      id             BIGSERIAL PRIMARY KEY,
      session_id     INTEGER NOT NULL,
      tenant_id      TEXT NOT NULL DEFAULT '',
      part_number    TEXT NOT NULL,
      nomenclature   TEXT DEFAULT '',
      sub_kit        TEXT DEFAULT '',
      bag            TEXT DEFAULT '',
      qty_expected   REAL DEFAULT 1,
      qty_found      REAL DEFAULT 0,
      unit           TEXT DEFAULT 'pcs',
      status         TEXT NOT NULL DEFAULT 'pending',
      notes          TEXT DEFAULT '',
      scanned_at     TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_check_items_session ON inventory_check_items (session_id, tenant_id)`,
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }

  // Migrations for existing PG tables
  try {
    const { rows } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory_parts' AND table_schema = current_schema()`);
    const cols = rows.map(r => r.column_name);
    if (cols.length > 0 && !cols.includes('sub_kit')) await pool.query(`ALTER TABLE inventory_parts ADD COLUMN sub_kit TEXT DEFAULT ''`);
    if (cols.length > 0 && !cols.includes('mfg_date')) await pool.query(`ALTER TABLE inventory_parts ADD COLUMN mfg_date TEXT DEFAULT ''`);
    if (cols.length > 0 && !cols.includes('bag')) await pool.query(`ALTER TABLE inventory_parts ADD COLUMN bag TEXT DEFAULT ''`);
  } catch (e) { /* table may not exist yet — fine */ }

  // Migrate blog_posts: add plans_section column
  try {
    const { rows: blogCols } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'blog_posts' AND table_schema = current_schema()`);
    const bc = blogCols.map(r => r.column_name);
    if (bc.length > 0 && !bc.includes('plans_section')) await pool.query(`ALTER TABLE blog_posts ADD COLUMN plans_section TEXT DEFAULT ''`);
  } catch (e) { /* table may not exist yet — fine */ }

  // Migrate inventory_stock: add source_kit column
  try {
    const { rows: stockCols } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory_stock' AND table_schema = current_schema()`);
    const sc = stockCols.map(r => r.column_name);
    if (sc.length > 0 && !sc.includes('source_kit')) await pool.query(`ALTER TABLE inventory_stock ADD COLUMN source_kit TEXT DEFAULT ''`);
  } catch (e) { /* table may not exist yet — fine */ }

  console.log('[init] PostgreSQL schema ready');
}

module.exports = { initMasterSchema, initTenantSchema, initPostgresSchema };
