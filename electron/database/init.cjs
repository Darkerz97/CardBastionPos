const { getDb, getDatabasePath } = require('./db.cjs')
const { schemaStatements } = require('./schema.cjs')
const { hashPin } = require('../auth/helpers.cjs')
const { WINDOW_DEFINITIONS } = require('../auth/permissions.cjs')

function seedProducts(db) {
  const countRow = db.prepare('SELECT COUNT(*) as total FROM products').get()

  if (countRow.total > 0) return

  const insert = db.prepare(`
    INSERT INTO products (sku, barcode, name, category, price, cost, stock, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const demoProducts = [
    ['PKM-001', '750100001', 'Booster Pokemon Surging Sparks', 'Pokemon', 129, 90, 15, 1],
    ['MTG-001', '750100002', 'Play Booster MTG Final Fantasy', 'Magic', 139, 100, 10, 1],
    ['ACC-001', '750100003', 'Micas Standard Card Bastion', 'Accesorios', 89, 45, 25, 1],
    ['ACC-002', '750100004', 'Deck Box Negro', 'Accesorios', 120, 65, 12, 1],
  ]

  const transaction = db.transaction(() => {
    for (const product of demoProducts) {
      insert.run(...product)
    }
  })

  transaction()
  console.log('Productos demo insertados correctamente.')
}

function initializeDatabase() {
  const db = getDb()

  console.log('Inicializando base de datos...')
  console.log('DB path real:', getDatabasePath())

  // Ejecutar schema base por compatibilidad
  for (const statement of schemaStatements) {
    db.prepare(statement).run()
  }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      notes TEXT,
      points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_window_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      view_key TEXT NOT NULL,
      can_access INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, view_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      display_name TEXT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      description TEXT,
      payload_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN customer_id INTEGER`).run()
    console.log('Columna customer_id agregada a sales')
  } catch (error) {
    console.log('customer_id ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN created_by_user_id INTEGER`).run()
    console.log('Columna created_by_user_id agregada a sales')
  } catch (error) {
    console.log('created_by_user_id ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN updated_at DATETIME`).run()
    console.log('Columna updated_at agregada a sales')
  } catch (error) {
    console.log('updated_at ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN updated_by_user_id INTEGER`).run()
    console.log('Columna updated_by_user_id agregada a sales')
  } catch (error) {
    console.log('updated_by_user_id ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN deleted_at DATETIME`).run()
    console.log('Columna deleted_at agregada a sales')
  } catch (error) {
    console.log('deleted_at ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN deleted_by_user_id INTEGER`).run()
    console.log('Columna deleted_by_user_id agregada a sales')
  } catch (error) {
    console.log('deleted_by_user_id ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sale_items ADD COLUMN unit_cost REAL DEFAULT 0`).run()
    console.log('Columna unit_cost agregada a sale_items')
  } catch (error) {
    console.log('unit_cost ya existe en sale_items')
  }

  try {
    db.prepare(`ALTER TABLE customers ADD COLUMN store_credit REAL DEFAULT 0`).run()
    console.log('Columna store_credit agregada a customers')
  } catch (error) {
    console.log('store_credit ya existe en customers')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN credit_used REAL DEFAULT 0`).run()
    console.log('Columna credit_used agregada a sales')
  } catch (error) {
    console.log('credit_used ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN payment_status TEXT DEFAULT 'paid'`).run()
    console.log('Columna payment_status agregada a sales')
  } catch (error) {
    console.log('payment_status ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN amount_paid REAL DEFAULT 0`).run()
    console.log('Columna amount_paid agregada a sales')
  } catch (error) {
    console.log('amount_paid ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN amount_due REAL DEFAULT 0`).run()
    console.log('Columna amount_due agregada a sales')
  } catch (error) {
    console.log('amount_due ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN due_date DATETIME`).run()
    console.log('Columna due_date agregada a sales')
  } catch (error) {
    console.log('due_date ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN payment_notes TEXT`).run()
    console.log('Columna payment_notes agregada a sales')
  } catch (error) {
    console.log('payment_notes ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN min_stock REAL DEFAULT 0`).run()
    console.log('Columna min_stock agregada a products')
  } catch (error) {
    console.log('min_stock ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0`).run()
    console.log('Columna cost agregada a products')
  } catch (error) {
    console.log('cost ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN updated_at DATETIME`).run()
    console.log('Columna updated_at agregada a products')
  } catch (error) {
    console.log('updated_at ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE cash_sessions ADD COLUMN opened_by_user_id INTEGER`).run()
    console.log('Columna opened_by_user_id agregada a cash_sessions')
  } catch (error) {
    console.log('opened_by_user_id ya existe en cash_sessions')
  }

  try {
    db.prepare(`ALTER TABLE cash_sessions ADD COLUMN closed_by_user_id INTEGER`).run()
    console.log('Columna closed_by_user_id agregada a cash_sessions')
  } catch (error) {
    console.log('closed_by_user_id ya existe en cash_sessions')
  }

  try {
    db.prepare(`ALTER TABLE cash_sessions ADD COLUMN updated_at DATETIME`).run()
    console.log('Columna updated_at agregada a cash_sessions')
  } catch (error) {
    console.log('updated_at ya existe en cash_sessions')
  }

  try {
    db.prepare(`ALTER TABLE cash_sessions ADD COLUMN updated_by_user_id INTEGER`).run()
    console.log('Columna updated_by_user_id agregada a cash_sessions')
  } catch (error) {
    console.log('updated_by_user_id ya existe en cash_sessions')
  }

  try {
    db.prepare(`ALTER TABLE cash_sessions ADD COLUMN deleted_at DATETIME`).run()
    console.log('Columna deleted_at agregada a cash_sessions')
  } catch (error) {
    console.log('deleted_at ya existe en cash_sessions')
  }

  try {
    db.prepare(`ALTER TABLE cash_sessions ADD COLUMN deleted_by_user_id INTEGER`).run()
    console.log('Columna deleted_by_user_id agregada a cash_sessions')
  } catch (error) {
    console.log('deleted_by_user_id ya existe en cash_sessions')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN product_type TEXT DEFAULT 'normal'`).run()
    console.log('Columna product_type agregada a products')
  } catch (error) {
    console.log('product_type ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN game TEXT`).run()
    console.log('Columna game agregada a products')
  } catch (error) {
    console.log('game ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN card_name TEXT`).run()
    console.log('Columna card_name agregada a products')
  } catch (error) {
    console.log('card_name ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN set_name TEXT`).run()
    console.log('Columna set_name agregada a products')
  } catch (error) {
    console.log('set_name ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN set_code TEXT`).run()
    console.log('Columna set_code agregada a products')
  } catch (error) {
    console.log('set_code ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN collector_number TEXT`).run()
    console.log('Columna collector_number agregada a products')
  } catch (error) {
    console.log('collector_number ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN finish TEXT`).run()
    console.log('Columna finish agregada a products')
  } catch (error) {
    console.log('finish ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN language TEXT`).run()
    console.log('Columna language agregada a products')
  } catch (error) {
    console.log('language ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN card_condition TEXT`).run()
    console.log('Columna card_condition agregada a products')
  } catch (error) {
    console.log('card_condition ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN scryfall_id TEXT`).run()
    console.log('Columna scryfall_id agregada a products')
  } catch (error) {
    console.log('scryfall_id ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN starcity_url TEXT`).run()
    console.log('Columna starcity_url agregada a products')
  } catch (error) {
    console.log('starcity_url ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN starcity_variant_key TEXT`).run()
    console.log('Columna starcity_variant_key agregada a products')
  } catch (error) {
    console.log('starcity_variant_key ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN starcity_price_usd REAL DEFAULT 0`).run()
    console.log('Columna starcity_price_usd agregada a products')
  } catch (error) {
    console.log('starcity_price_usd ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN starcity_last_sync DATETIME`).run()
    console.log('Columna starcity_last_sync agregada a products')
  } catch (error) {
    console.log('starcity_last_sync ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN pricing_mode TEXT DEFAULT 'manual'`).run()
    console.log('Columna pricing_mode agregada a products')
  } catch (error) {
    console.log('pricing_mode ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN pricing_formula_type TEXT`).run()
    console.log('Columna pricing_formula_type agregada a products')
  } catch (error) {
    console.log('pricing_formula_type ya existe en products')
  }

  try {
    db.prepare(`ALTER TABLE products ADD COLUMN pricing_formula_value REAL DEFAULT 0`).run()
    console.log('Columna pricing_formula_value agregada a products')
  } catch (error) {
    console.log('pricing_formula_value ya existe en products')
  }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS customer_credit_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      reason TEXT,
      reference_type TEXT,
      reference_id INTEGER,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      stock_before REAL NOT NULL,
      stock_after REAL NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS single_market_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'starcity',
      source_url TEXT,
      source_variant_key TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      price REAL NOT NULL DEFAULT 0,
      last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      raw_payload TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS sale_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      customer_id INTEGER,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      notes TEXT,
      is_initial INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cash_session_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      signature TEXT NOT NULL,
      notes TEXT,
      created_by_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE
    )
  `).run()

  try {
    db.prepare(`ALTER TABLE sale_payments ADD COLUMN is_initial INTEGER NOT NULL DEFAULT 0`).run()
    console.log('Columna is_initial agregada a sale_payments')
  } catch (error) {
    console.log('is_initial ya existe en sale_payments')
  }

  try {
    db.prepare(`ALTER TABLE customer_credit_movements ADD COLUMN user_id INTEGER`).run()
    console.log('Columna user_id agregada a customer_credit_movements')
  } catch (error) {
    console.log('user_id ya existe en customer_credit_movements')
  }

  try {
    db.prepare(`ALTER TABLE inventory_movements ADD COLUMN user_id INTEGER`).run()
    console.log('Columna user_id agregada a inventory_movements')
  } catch (error) {
    console.log('user_id ya existe en inventory_movements')
  }

  try {
    db.prepare(`ALTER TABLE sale_payments ADD COLUMN user_id INTEGER`).run()
    console.log('Columna user_id agregada a sale_payments')
  } catch (error) {
    console.log('user_id ya existe en sale_payments')
  }

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN preorder_id INTEGER`).run()
    console.log('Columna preorder_id agregada a sales')
  } catch (error) {
    console.log('preorder_id ya existe en sales')
  }

  try {
    db.prepare(`ALTER TABLE preorders ADD COLUMN preorder_catalog_id INTEGER`).run()
    console.log('Columna preorder_catalog_id agregada a preorders')
  } catch (error) {
    console.log('preorder_catalog_id ya existe en preorders')
  }

  // Backfill seguro para ventas existentes antes de cuentas por cobrar.
  db.prepare(`
    UPDATE sales
    SET amount_paid = total
    WHERE amount_paid IS NULL
  `).run()

  db.prepare(`
    UPDATE sales
    SET amount_due = 0
    WHERE amount_due IS NULL
  `).run()

  db.prepare(`
    UPDATE sales
    SET payment_status = CASE
      WHEN COALESCE(amount_due, 0) <= 0 THEN 'paid'
      WHEN COALESCE(amount_paid, 0) <= 0 THEN 'pending'
      ELSE 'partial'
    END
    WHERE payment_status IS NULL OR trim(payment_status) = ''
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      game_type TEXT,
      season TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS preorder_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      product_id INTEGER,
      product_name TEXT,
      sku TEXT,
      image TEXT,
      release_date DATETIME,
      due_date DATETIME,
      unit_price REAL NOT NULL DEFAULT 0,
      quantity_default REAL NOT NULL DEFAULT 1,
      currency TEXT DEFAULT 'MXN',
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS preorders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      preorder_number TEXT UNIQUE,
      customer_id INTEGER NOT NULL,
      preorder_catalog_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      total_amount REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      amount_due REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'MXN',
      due_date DATETIME,
      release_date DATETIME,
      notes TEXT,
      linked_sale_id INTEGER,
      email_sent_created INTEGER DEFAULT 0,
      email_sent_paid INTEGER DEFAULT 0,
      email_sent_fulfilled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (preorder_catalog_id) REFERENCES preorder_catalog(id) ON DELETE SET NULL,
      FOREIGN KEY (linked_sale_id) REFERENCES sales(id) ON DELETE SET NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS preorder_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      preorder_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      sku TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (preorder_id) REFERENCES preorders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS preorder_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      preorder_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (preorder_id) REFERENCES preorders(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS preorder_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      preorder_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (preorder_id) REFERENCES preorders(id) ON DELETE CASCADE
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS email_notifications_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      email_type TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  try {
    db.prepare(`ALTER TABLE tournaments ADD COLUMN season TEXT`).run()
    console.log('Columna season agregada a tournaments')
  } catch (error) {
    console.log('season ya existe en tournaments')
  }

  try {
    db.prepare(`ALTER TABLE tournaments ADD COLUMN completed_at DATETIME`).run()
    console.log('Columna completed_at agregada a tournaments')
  } catch (error) {
    console.log('completed_at ya existe en tournaments')
  }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS tournament_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      customer_id INTEGER,
      display_name TEXT NOT NULL,
      seed INTEGER DEFAULT 0,
      final_place INTEGER,
      points REAL DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS tournament_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      round_number INTEGER NOT NULL DEFAULT 1,
      table_number INTEGER NOT NULL DEFAULT 1,
      table_size INTEGER NOT NULL DEFAULT 2,
      winner_player_id INTEGER,
      result_note TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (winner_player_id) REFERENCES tournament_players(id) ON DELETE SET NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS tournament_table_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      tournament_player_id INTEGER NOT NULL,
      seat INTEGER NOT NULL DEFAULT 1,
      score REAL DEFAULT 0,
      is_winner INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (table_id) REFERENCES tournament_tables(id) ON DELETE CASCADE,
      FOREIGN KEY (tournament_player_id) REFERENCES tournament_players(id) ON DELETE CASCADE
    )
  `).run()

  seedProducts(db)

  const adminExists = db.prepare(`
    SELECT id
    FROM users
    WHERE username = 'admin'
    LIMIT 1
  `).get()

  if (!adminExists) {
    const adminResult = db.prepare(`
      INSERT INTO users (
        username,
        display_name,
        pin_hash,
        is_admin,
        active
      ) VALUES (?, ?, ?, 1, 1)
    `).run('admin', 'Administrador', hashPin('1234'))

    const adminId = Number(adminResult.lastInsertRowid)
    const insertPermission = db.prepare(`
      INSERT OR REPLACE INTO user_window_permissions (
        user_id,
        view_key,
        can_access
      ) VALUES (?, ?, 1)
    `)

    for (const windowDef of WINDOW_DEFINITIONS) {
      insertPermission.run(adminId, windowDef.key)
    }

    console.log('Usuario administrador inicial creado: admin / 1234')
  }
}

module.exports = { initializeDatabase }
