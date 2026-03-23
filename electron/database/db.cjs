const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

function getDatabasePath() {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'cardbastion.sqlite')
}

let dbInstance = null

function getDb() {
  if (!dbInstance) {
    const dbPath = getDatabasePath()
    dbInstance = new Database(dbPath)
    dbInstance.pragma('journal_mode = WAL')
    dbInstance.pragma('foreign_keys = ON')
  }

  return dbInstance
}

function closeDb() {
  if (!dbInstance) return

  dbInstance.close()
  dbInstance = null
}

/**

 */
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
}
module.exports = { getDb, getDatabasePath, initializeDatabase, closeDb }


