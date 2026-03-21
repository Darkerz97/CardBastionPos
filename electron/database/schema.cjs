const schemaStatements = [
  `
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    barcode TEXT,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folio TEXT UNIQUE NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL,
    cash_received REAL DEFAULT 0,
    change_given REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced INTEGER NOT NULL DEFAULT 0
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER,
    sku TEXT,
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
    opening_amount REAL NOT NULL DEFAULT 0,
    closed_at TEXT,
    closing_amount REAL DEFAULT 0,
    expected_amount REAL DEFAULT 0,
    difference REAL DEFAULT 0,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'open'
  )
  `,
  `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
  `
]

module.exports = { schemaStatements }