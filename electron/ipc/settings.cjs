const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')

function getSettingValue(db, key, defaultValue = null) {
  const row = db.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
    LIMIT 1
  `).get(String(key))

  if (!row) return defaultValue
  return row.value
}

function setSettingValue(db, key, value) {
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(key), String(value))
}

function registerSettingsHandlers() {
  ipcMain.handle('settings:getPrintTicketsEnabled', () => {
    const db = getDb()
    const value = getSettingValue(db, 'print_tickets_enabled', '1')
    return value === '1'
  })

  ipcMain.handle('settings:setPrintTicketsEnabled', (event, enabled) => {
    const db = getDb()
    setSettingValue(db, 'print_tickets_enabled', enabled ? '1' : '0')
    return { success: true, enabled: !!enabled }
  })
}

module.exports = { registerSettingsHandlers }