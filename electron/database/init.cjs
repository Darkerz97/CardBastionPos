const { getDb, getDatabasePath } = require('./db.cjs')
const { schemaStatements } = require('./schema.cjs')

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

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN customer_id INTEGER`).run()
    console.log('Columna customer_id agregada a sales')
  } catch (error) {
    console.log('customer_id ya existe en sales')
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
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
}

module.exports = { initializeDatabase }
