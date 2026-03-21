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
    ['PKM-001', '750100001', 'Booster Pokémon Surging Sparks', 'Pokémon', 129, 90, 15, 1],
    ['MTG-001', '750100002', 'Play Booster MTG Final Fantasy', 'Magic', 139, 100, 10, 1],
    ['ACC-001', '750100003', 'Micas Standard Card Bastion', 'Accesorios', 89, 45, 25, 1],
    ['ACC-002', '750100004', 'Deck Box Negro', 'Accesorios', 120, 65, 12, 1]
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

  console.log('🧠 Inicializando base de datos...')
  console.log('📂 DB path real:', getDatabasePath())

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

  console.log('✅ Tabla customers intentada')

  try {
    db.prepare(`ALTER TABLE sales ADD COLUMN customer_id INTEGER`).run()
    console.log('✅ Columna customer_id agregada a sales')
  } catch (error) {
    console.log('ℹ️ No se agregó customer_id:', error.message)
  }

  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name
  `).all()

  console.log('📦 Tablas existentes AHORA:', tables)

  try {
  db.prepare(`ALTER TABLE sale_items ADD COLUMN unit_cost REAL DEFAULT 0`).run()
  console.log('✅ Columna unit_cost agregada a sale_items')
} catch (error) {
  console.log('ℹ️ unit_cost ya existe en sale_items')
}

// Agregar columna store_credit a customers

try {
  db.prepare(`ALTER TABLE customers ADD COLUMN store_credit REAL DEFAULT 0`).run()
  console.log('✅ Columna store_credit agregada a customers')
} catch (error) {
  console.log('ℹ️ store_credit ya existe en customers')
}

// Agregar columna credit_used a sales

try {
  db.prepare(`ALTER TABLE sales ADD COLUMN credit_used REAL DEFAULT 0`).run()
  console.log('✅ Columna credit_used agregada a sales')
} catch (error) {
  console.log('ℹ️ credit_used ya existe en sales')
}

// Crear tabla customer_credit_movements

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

}
module.exports = { initializeDatabase }