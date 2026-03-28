const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')
const {
  authenticateWithServer,
  getServerSyncSettings,
  getServerSyncStatus,
  listSyncLogs,
  runServerSyncCycle,
  startServerSyncScheduler,
  updateServerSyncSettings,
} = require('./server-sync.cjs')

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

const POS_CUSTOMIZATION_DEFAULTS = {
  store_name: 'Card Bastion',
  pos_subtitle: 'Point of Sale',
  hero_title: 'Ventas agiles con control visual y cobro flexible',
  hero_caption: 'Panel de cobro',
  accent_color: '#f2b138',
  show_hero_banner: '1',
  compact_mode: '0',
}

function getPosCustomization(db) {
  const result = {}

  for (const [key, defaultValue] of Object.entries(POS_CUSTOMIZATION_DEFAULTS)) {
    result[key] = getSettingValue(db, key, defaultValue)
  }

  return {
    storeName: String(result.store_name || POS_CUSTOMIZATION_DEFAULTS.store_name),
    posSubtitle: String(result.pos_subtitle || POS_CUSTOMIZATION_DEFAULTS.pos_subtitle),
    heroTitle: String(result.hero_title || POS_CUSTOMIZATION_DEFAULTS.hero_title),
    heroCaption: String(result.hero_caption || POS_CUSTOMIZATION_DEFAULTS.hero_caption),
    accentColor: String(result.accent_color || POS_CUSTOMIZATION_DEFAULTS.accent_color),
    showHeroBanner: String(result.show_hero_banner || '1') === '1',
    compactMode: String(result.compact_mode || '0') === '1',
  }
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

  ipcMain.handle('settings:getPosCustomization', () => {
    const db = getDb()
    return getPosCustomization(db)
  })

  ipcMain.handle('settings:getServerSync', () => {
    const db = getDb()
    return {
      settings: getServerSyncSettings(db),
      status: getServerSyncStatus(db),
    }
  })

  ipcMain.handle('settings:updateServerSync', async (event, payload = {}) => {
    const db = getDb()
    const settings = updateServerSyncSettings(db, payload)
    startServerSyncScheduler(db)
    const cycleResult = await runServerSyncCycle(db, { limit: 50 })

    return {
      success: true,
      settings,
      status: getServerSyncStatus(db),
      cycleResult,
    }
  })

  ipcMain.handle('settings:flushServerSync', async () => {
    const db = getDb()
    const cycleResult = await runServerSyncCycle(db, { limit: 100 })

    return {
      success: Boolean(cycleResult?.success),
      cycleResult,
      status: getServerSyncStatus(db),
    }
  })

  ipcMain.handle('settings:authenticateServerSync', async (event, payload = {}) => {
    const db = getDb()
    const result = await authenticateWithServer(db, payload)

    return {
      success: true,
      result,
      settings: getServerSyncSettings(db),
      status: getServerSyncStatus(db),
    }
  })

  ipcMain.handle('settings:getServerSyncLogs', (event, limit = 100) => {
    const db = getDb()

    return {
      success: true,
      logs: listSyncLogs(db, limit),
    }
  })

  ipcMain.handle('settings:updatePosCustomization', (event, payload = {}) => {
    const db = getDb()

    setSettingValue(db, 'store_name', String(payload.storeName || POS_CUSTOMIZATION_DEFAULTS.store_name))
    setSettingValue(db, 'pos_subtitle', String(payload.posSubtitle || POS_CUSTOMIZATION_DEFAULTS.pos_subtitle))
    setSettingValue(db, 'hero_title', String(payload.heroTitle || POS_CUSTOMIZATION_DEFAULTS.hero_title))
    setSettingValue(db, 'hero_caption', String(payload.heroCaption || POS_CUSTOMIZATION_DEFAULTS.hero_caption))
    setSettingValue(db, 'accent_color', String(payload.accentColor || POS_CUSTOMIZATION_DEFAULTS.accent_color))
    setSettingValue(db, 'show_hero_banner', payload.showHeroBanner ? '1' : '0')
    setSettingValue(db, 'compact_mode', payload.compactMode ? '1' : '0')

    return {
      success: true,
      customization: getPosCustomization(db),
    }
  })
}

module.exports = { registerSettingsHandlers }
