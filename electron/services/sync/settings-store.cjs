const { safeStorage } = require('electron')
const {
  DEFAULT_API_BASE_URL,
  DEFAULT_AUTH_PATH,
  DEFAULT_DEVICE_NAME,
  DEFAULT_MAX_SYNC_ATTEMPTS,
  DEFAULT_PULL_CATALOG_PATH,
  DEFAULT_PULL_CUSTOMERS_PATH,
  DEFAULT_PULL_PRODUCTS_PATH,
  DEFAULT_PULL_PATH,
  DEFAULT_PUSH_PATH,
  DEFAULT_RETRY_BASE_MS,
  DEFAULT_SYNC_BATCH_SIZE,
  DEFAULT_SYNC_INTERVAL_MS,
  DEFAULT_SYNC_TIMEOUT_MS,
  DEFAULT_UPLOAD_CASH_CLOSURES_PATH,
  DEFAULT_UPLOAD_INVENTORY_MOVEMENTS_PATH,
  DEFAULT_UPLOAD_SALES_PATH,
} = require('./constants.cjs')

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
  `).run(String(key), String(value ?? ''))
}

function removeSettingValue(db, key) {
  db.prepare(`
    DELETE FROM settings
    WHERE key = ?
  `).run(String(key))
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toBooleanString(value) {
  return value ? '1' : '0'
}

function normalizePathSegment(value, fallback) {
  const cleanValue = String(value || fallback || '').trim().replace(/^\/+|\/+$/g, '')
  return cleanValue || String(fallback || '').trim().replace(/^\/+|\/+$/g, '')
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/g, '')
}

function encodeSecret(value) {
  const plainText = String(value || '')
  if (!plainText) return ''

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(plainText)
    return `safe:${encrypted.toString('base64')}`
  }

  return `plain:${Buffer.from(plainText, 'utf8').toString('base64')}`
}

function decodeSecret(value) {
  const encoded = String(value || '').trim()
  if (!encoded) return ''

  if (encoded.startsWith('safe:')) {
    const buffer = Buffer.from(encoded.slice(5), 'base64')
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buffer)
      }
    } catch (error) {
      return ''
    }
    return ''
  }

  if (encoded.startsWith('plain:')) {
    return Buffer.from(encoded.slice(6), 'base64').toString('utf8')
  }

  return encoded
}

function buildPublicSettings(db) {
  return {
    enabled: String(getSettingValue(db, 'server_sync_enabled', '0') || '0') === '1',
    apiBaseUrl: normalizeBaseUrl(getSettingValue(db, 'server_sync_api_base_url', DEFAULT_API_BASE_URL)),
    authPath: normalizePathSegment(getSettingValue(db, 'server_sync_auth_path', DEFAULT_AUTH_PATH), DEFAULT_AUTH_PATH),
    pushPath: normalizePathSegment(getSettingValue(db, 'server_sync_push_path', DEFAULT_PUSH_PATH), DEFAULT_PUSH_PATH),
    pullPath: normalizePathSegment(getSettingValue(db, 'server_sync_pull_path', DEFAULT_PULL_PATH), DEFAULT_PULL_PATH),
    uploadSalesPath: normalizePathSegment(getSettingValue(db, 'server_sync_upload_sales_path', DEFAULT_UPLOAD_SALES_PATH), DEFAULT_UPLOAD_SALES_PATH),
    uploadCashClosuresPath: normalizePathSegment(getSettingValue(db, 'server_sync_upload_cash_closures_path', DEFAULT_UPLOAD_CASH_CLOSURES_PATH), DEFAULT_UPLOAD_CASH_CLOSURES_PATH),
    uploadInventoryMovementsPath: normalizePathSegment(getSettingValue(db, 'server_sync_upload_inventory_movements_path', DEFAULT_UPLOAD_INVENTORY_MOVEMENTS_PATH), DEFAULT_UPLOAD_INVENTORY_MOVEMENTS_PATH),
    pullProductsPath: normalizePathSegment(getSettingValue(db, 'server_sync_pull_products_path', DEFAULT_PULL_PRODUCTS_PATH), DEFAULT_PULL_PRODUCTS_PATH),
    pullCustomersPath: normalizePathSegment(getSettingValue(db, 'server_sync_pull_customers_path', DEFAULT_PULL_CUSTOMERS_PATH), DEFAULT_PULL_CUSTOMERS_PATH),
    pullCatalogPath: normalizePathSegment(getSettingValue(db, 'server_sync_pull_catalog_path', DEFAULT_PULL_CATALOG_PATH), DEFAULT_PULL_CATALOG_PATH),
    authEmail: String(getSettingValue(db, 'server_sync_auth_email', '') || '').trim(),
    deviceName: String(getSettingValue(db, 'server_sync_device_name', DEFAULT_DEVICE_NAME) || DEFAULT_DEVICE_NAME).trim(),
    storeId: String(getSettingValue(db, 'server_sync_store_id', '') || '').trim(),
    timeoutMs: Math.max(toNumber(getSettingValue(db, 'server_sync_timeout_ms', DEFAULT_SYNC_TIMEOUT_MS), DEFAULT_SYNC_TIMEOUT_MS), 1000),
    batchSize: Math.max(toNumber(getSettingValue(db, 'server_sync_batch_size', DEFAULT_SYNC_BATCH_SIZE), DEFAULT_SYNC_BATCH_SIZE), 1),
    retryBaseMs: Math.max(toNumber(getSettingValue(db, 'server_sync_retry_base_ms', DEFAULT_RETRY_BASE_MS), DEFAULT_RETRY_BASE_MS), 1000),
    syncIntervalMs: Math.max(toNumber(getSettingValue(db, 'server_sync_interval_ms', DEFAULT_SYNC_INTERVAL_MS), DEFAULT_SYNC_INTERVAL_MS), 5000),
    maxAttempts: Math.max(toNumber(getSettingValue(db, 'server_sync_max_attempts', DEFAULT_MAX_SYNC_ATTEMPTS), DEFAULT_MAX_SYNC_ATTEMPTS), 1),
    autoSync: String(getSettingValue(db, 'server_sync_auto_sync', '1') || '1') === '1',
    pullEnabled: String(getSettingValue(db, 'server_sync_pull_enabled', '0') || '0') === '1',
    lastCursor: String(getSettingValue(db, 'server_sync_last_cursor', '') || '').trim(),
    hasSavedPassword: Boolean(getSettingValue(db, 'server_sync_auth_password', '')),
    hasAccessToken: Boolean(getSettingValue(db, 'server_sync_access_token', '')),
    lastAuthAt: String(getSettingValue(db, 'server_sync_last_auth_at', '') || ''),
    authenticatedEmail: String(getSettingValue(db, 'server_sync_authenticated_email', '') || '').trim(),
  }
}

function getServerSyncSettings(db) {
  return buildPublicSettings(db)
}

function getServerSyncSecrets(db) {
  return {
    authPassword: decodeSecret(getSettingValue(db, 'server_sync_auth_password', '')),
    accessToken: decodeSecret(getSettingValue(db, 'server_sync_access_token', '')),
  }
}

function updateServerSyncSettings(db, payload = {}) {
  const current = getServerSyncSettings(db)
  const next = {
    enabled: payload.enabled === undefined ? current.enabled : Boolean(payload.enabled),
    apiBaseUrl: payload.apiBaseUrl === undefined ? current.apiBaseUrl : normalizeBaseUrl(payload.apiBaseUrl),
    authPath: payload.authPath === undefined ? current.authPath : normalizePathSegment(payload.authPath, DEFAULT_AUTH_PATH),
    pushPath: payload.pushPath === undefined ? current.pushPath : normalizePathSegment(payload.pushPath, DEFAULT_PUSH_PATH),
    pullPath: payload.pullPath === undefined ? current.pullPath : normalizePathSegment(payload.pullPath, DEFAULT_PULL_PATH),
    uploadSalesPath: payload.uploadSalesPath === undefined ? current.uploadSalesPath : normalizePathSegment(payload.uploadSalesPath, DEFAULT_UPLOAD_SALES_PATH),
    uploadCashClosuresPath: payload.uploadCashClosuresPath === undefined ? current.uploadCashClosuresPath : normalizePathSegment(payload.uploadCashClosuresPath, DEFAULT_UPLOAD_CASH_CLOSURES_PATH),
    uploadInventoryMovementsPath: payload.uploadInventoryMovementsPath === undefined ? current.uploadInventoryMovementsPath : normalizePathSegment(payload.uploadInventoryMovementsPath, DEFAULT_UPLOAD_INVENTORY_MOVEMENTS_PATH),
    pullProductsPath: payload.pullProductsPath === undefined ? current.pullProductsPath : normalizePathSegment(payload.pullProductsPath, DEFAULT_PULL_PRODUCTS_PATH),
    pullCustomersPath: payload.pullCustomersPath === undefined ? current.pullCustomersPath : normalizePathSegment(payload.pullCustomersPath, DEFAULT_PULL_CUSTOMERS_PATH),
    pullCatalogPath: payload.pullCatalogPath === undefined ? current.pullCatalogPath : normalizePathSegment(payload.pullCatalogPath, DEFAULT_PULL_CATALOG_PATH),
    authEmail: payload.authEmail === undefined ? current.authEmail : String(payload.authEmail || '').trim(),
    deviceName: payload.deviceName === undefined ? current.deviceName : String(payload.deviceName || DEFAULT_DEVICE_NAME).trim(),
    storeId: payload.storeId === undefined ? current.storeId : String(payload.storeId || '').trim(),
    timeoutMs: payload.timeoutMs === undefined ? current.timeoutMs : Math.max(toNumber(payload.timeoutMs, DEFAULT_SYNC_TIMEOUT_MS), 1000),
    batchSize: payload.batchSize === undefined ? current.batchSize : Math.max(toNumber(payload.batchSize, DEFAULT_SYNC_BATCH_SIZE), 1),
    retryBaseMs: payload.retryBaseMs === undefined ? current.retryBaseMs : Math.max(toNumber(payload.retryBaseMs, DEFAULT_RETRY_BASE_MS), 1000),
    syncIntervalMs: payload.syncIntervalMs === undefined ? current.syncIntervalMs : Math.max(toNumber(payload.syncIntervalMs, DEFAULT_SYNC_INTERVAL_MS), 5000),
    maxAttempts: payload.maxAttempts === undefined ? current.maxAttempts : Math.max(toNumber(payload.maxAttempts, DEFAULT_MAX_SYNC_ATTEMPTS), 1),
    autoSync: payload.autoSync === undefined ? current.autoSync : Boolean(payload.autoSync),
    pullEnabled: payload.pullEnabled === undefined ? current.pullEnabled : Boolean(payload.pullEnabled),
    lastCursor: payload.lastCursor === undefined ? current.lastCursor : String(payload.lastCursor || '').trim(),
  }

  setSettingValue(db, 'server_sync_enabled', toBooleanString(next.enabled))
  setSettingValue(db, 'server_sync_api_base_url', next.apiBaseUrl)
  setSettingValue(db, 'server_sync_auth_path', next.authPath)
  setSettingValue(db, 'server_sync_push_path', next.pushPath)
  setSettingValue(db, 'server_sync_pull_path', next.pullPath)
  setSettingValue(db, 'server_sync_upload_sales_path', next.uploadSalesPath)
  setSettingValue(db, 'server_sync_upload_cash_closures_path', next.uploadCashClosuresPath)
  setSettingValue(db, 'server_sync_upload_inventory_movements_path', next.uploadInventoryMovementsPath)
  setSettingValue(db, 'server_sync_pull_products_path', next.pullProductsPath)
  setSettingValue(db, 'server_sync_pull_customers_path', next.pullCustomersPath)
  setSettingValue(db, 'server_sync_pull_catalog_path', next.pullCatalogPath)
  setSettingValue(db, 'server_sync_auth_email', next.authEmail)
  setSettingValue(db, 'server_sync_device_name', next.deviceName || DEFAULT_DEVICE_NAME)
  setSettingValue(db, 'server_sync_store_id', next.storeId)
  setSettingValue(db, 'server_sync_timeout_ms', String(next.timeoutMs))
  setSettingValue(db, 'server_sync_batch_size', String(next.batchSize))
  setSettingValue(db, 'server_sync_retry_base_ms', String(next.retryBaseMs))
  setSettingValue(db, 'server_sync_interval_ms', String(next.syncIntervalMs))
  setSettingValue(db, 'server_sync_max_attempts', String(next.maxAttempts))
  setSettingValue(db, 'server_sync_auto_sync', toBooleanString(next.autoSync))
  setSettingValue(db, 'server_sync_pull_enabled', toBooleanString(next.pullEnabled))
  setSettingValue(db, 'server_sync_last_cursor', next.lastCursor)

  if (Object.prototype.hasOwnProperty.call(payload, 'authPassword')) {
    const password = String(payload.authPassword || '')
    if (password) {
      setSettingValue(db, 'server_sync_auth_password', encodeSecret(password))
    } else if (payload.clearSavedPassword) {
      removeSettingValue(db, 'server_sync_auth_password')
    }
  } else if (payload.clearSavedPassword) {
    removeSettingValue(db, 'server_sync_auth_password')
  }

  if (payload.clearAccessToken) {
    removeSettingValue(db, 'server_sync_access_token')
    removeSettingValue(db, 'server_sync_last_auth_at')
    removeSettingValue(db, 'server_sync_authenticated_email')
  }

  return getServerSyncSettings(db)
}

function storeServerSyncAccessToken(db, accessToken, authenticatedEmail = '') {
  const token = String(accessToken || '').trim()

  if (!token) {
    removeSettingValue(db, 'server_sync_access_token')
    removeSettingValue(db, 'server_sync_last_auth_at')
    removeSettingValue(db, 'server_sync_authenticated_email')
    return
  }

  setSettingValue(db, 'server_sync_access_token', encodeSecret(token))
  setSettingValue(db, 'server_sync_last_auth_at', new Date().toISOString())
  setSettingValue(db, 'server_sync_authenticated_email', String(authenticatedEmail || '').trim())
}

function updateServerSyncCursor(db, cursor) {
  setSettingValue(db, 'server_sync_last_cursor', String(cursor || '').trim())
}

module.exports = {
  getSettingValue,
  setSettingValue,
  removeSettingValue,
  getServerSyncSettings,
  getServerSyncSecrets,
  updateServerSyncSettings,
  storeServerSyncAccessToken,
  updateServerSyncCursor,
}
