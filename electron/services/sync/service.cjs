const { BrowserWindow } = require('electron')
const { pushServerEvents, pullServerChanges, authenticateWithServer } = require('./client.cjs')
const { writeSyncLog, listSyncLogs } = require('./logger.cjs')
const {
  getServerSyncSettings,
  updateServerSyncSettings,
  updateServerSyncCursor,
} = require('./settings-store.cjs')
const {
  DEFAULT_MAX_SYNC_ATTEMPTS,
  DEFAULT_RETRY_BASE_MS,
  SYNC_SOURCE,
} = require('./constants.cjs')

let syncTimer = null
let syncInFlight = false

function sanitizePayload(payload) {
  return JSON.parse(JSON.stringify(payload ?? null))
}

function computeNextRetryAt(attempts, retryBaseMs) {
  const cappedAttempts = Math.min(Math.max(Number(attempts || 1), 1), 8)
  const delayMs = Math.min(Number(retryBaseMs || DEFAULT_RETRY_BASE_MS) * Math.pow(2, cappedAttempts - 1), 6 * 60 * 60 * 1000)
  return new Date(Date.now() + delayMs).toISOString()
}

function notifyRendererChannels(payload) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('server-sync:status-changed', payload)
    }
  }
}

function buildEventEnvelope(row) {
  const payload = JSON.parse(String(row.payload_json || '{}'))
  return {
    queue_id: Number(row.id),
    event_id: Number(row.id),
    event_type: String(row.event_type || ''),
    entity_type: String(row.entity_type || ''),
    entity_id: row.entity_id === null || row.entity_id === undefined ? null : Number(row.entity_id),
    action: String(row.action || ''),
    source: SYNC_SOURCE,
    queued_at: String(row.created_at || ''),
    payload,
  }
}

function getQueueRows(db, limit, maxAttempts) {
  return db.prepare(`
    SELECT *
    FROM server_sync_queue
    WHERE status IN ('pending', 'failed')
      AND attempts < ?
      AND (
        next_attempt_at IS NULL
        OR datetime(next_attempt_at) <= datetime('now')
      )
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).all(Number(maxAttempts), Number(limit))
}

function setQueueRowsSending(db, rows) {
  const markSending = db.prepare(`
    UPDATE server_sync_queue
    SET
      status = 'sending',
      last_attempt_at = CURRENT_TIMESTAMP,
      attempts = attempts + 1,
      locked_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    for (const row of rows) {
      markSending.run(Number(row.id))
    }
  })

  transaction()
}

function markQueueRowsSynced(db, rows, resultsMap = new Map()) {
  const statement = db.prepare(`
    UPDATE server_sync_queue
    SET
      status = 'synced',
      synced_at = CURRENT_TIMESTAMP,
      last_error = NULL,
      last_status_code = 200,
      response_json = ?,
      locked_at = NULL,
      next_attempt_at = NULL
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    for (const row of rows) {
      const responseJson = resultsMap.get(Number(row.id)) || null
      statement.run(responseJson ? JSON.stringify(responseJson) : null, Number(row.id))
    }
  })

  transaction()
}

function markQueueRowsFailed(db, rows, error, retryBaseMs) {
  const statusCode = Number(error?.statusCode || 0) || null
  const message = String(error?.message || 'Error desconocido de sincronizacion')
  const responseBody = error?.responseBody ? JSON.stringify(error.responseBody) : null
  const statement = db.prepare(`
    UPDATE server_sync_queue
    SET
      status = 'failed',
      last_error = ?,
      last_status_code = ?,
      response_json = ?,
      next_attempt_at = ?,
      locked_at = NULL
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    for (const row of rows) {
      const nextAttemptAt = computeNextRetryAt(Number(row.attempts || 0) + 1, retryBaseMs)
      statement.run(message, statusCode, responseBody, nextAttemptAt, Number(row.id))
    }
  })

  transaction()
}

function enqueueServerSync(db, event = {}) {
  const normalized = {
    eventType: String(event.eventType || '').trim(),
    entityType: String(event.entityType || '').trim(),
    entityId: event.entityId === null || event.entityId === undefined || event.entityId === ''
      ? null
      : Number(event.entityId),
    action: String(event.action || '').trim(),
    payload: sanitizePayload(event.payload),
  }

  if (!normalized.eventType || !normalized.entityType || !normalized.action) {
    throw new Error('Evento de sincronizacion incompleto.')
  }

  const result = db.prepare(`
    INSERT INTO server_sync_queue (
      event_type,
      entity_type,
      entity_id,
      action,
      payload_json,
      status,
      next_attempt_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
  `).run(
    normalized.eventType,
    normalized.entityType,
    normalized.entityId,
    normalized.action,
    JSON.stringify(normalized.payload)
  )

  return Number(result.lastInsertRowid)
}

function extractResultsMap(responseData) {
  const items = responseData?.results || responseData?.data?.results || responseData?.acknowledged_events || []
  const map = new Map()

  for (const item of items) {
    const queueId = Number(item?.queue_id || item?.queueId || item?.event_id || item?.eventId || 0)
    if (queueId > 0) {
      map.set(queueId, item)
    }
  }

  return map
}

function normalizeRemoteChanges(responseData) {
  const changes = responseData?.changes || responseData?.data?.changes || responseData?.events || responseData?.data?.events || []
  return Array.isArray(changes) ? changes : []
}

function applyCustomerChange(db, data = {}) {
  const remoteId = String(data.remote_id || data.remoteId || data.id || '').trim()
  const name = String(data.name || '').trim()

  if (!remoteId || !name) return false

  const email = String(data.email || '').trim()
  const phone = String(data.phone || '').trim()
  const existing = db.prepare(`
    SELECT id
    FROM customers
    WHERE remote_id = ?
       OR (email = ? AND ? != '')
       OR (phone = ? AND ? != '')
    LIMIT 1
  `).get(remoteId, email, email, phone, phone)

  if (String(data.deleted_at || '').trim()) {
    if (existing?.id) {
      db.prepare(`
        UPDATE customers
        SET
          remote_id = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(remoteId, 'Registro desactivado remotamente', Number(existing.id))
    }
    return true
  }

  if (existing?.id) {
    db.prepare(`
      UPDATE customers
      SET
        remote_id = ?,
        name = ?,
        phone = ?,
        email = ?,
        notes = ?,
        store_credit = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      remoteId,
      name,
      phone,
      email,
      String(data.notes || '').trim(),
      Number(data.store_credit || data.storeCredit || 0),
      Number(existing.id)
    )
  } else {
    db.prepare(`
      INSERT INTO customers (
        remote_id,
        name,
        phone,
        email,
        notes,
        store_credit,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      remoteId,
      name,
      phone,
      email,
      String(data.notes || '').trim(),
      Number(data.store_credit || data.storeCredit || 0)
    )
  }

  return true
}

function applyProductChange(db, data = {}) {
  const remoteId = String(data.remote_id || data.remoteId || data.id || '').trim()
  const name = String(data.name || data.card_name || '').trim()

  if (!remoteId || !name) return false

  const sku = String(data.sku || '').trim()
  const barcode = String(data.barcode || '').trim()
  const existing = db.prepare(`
    SELECT id
    FROM products
    WHERE remote_id = ?
       OR (sku = ? AND ? != '')
       OR (barcode = ? AND ? != '')
    LIMIT 1
  `).get(remoteId, sku, sku, barcode, barcode)

  if (String(data.deleted_at || '').trim() || Number(data.active) === 0) {
    if (existing?.id) {
      db.prepare(`
        UPDATE products
        SET active = 0, remote_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(remoteId, Number(existing.id))
    }
    return true
  }

  const values = [
    remoteId,
    sku,
    barcode,
    name,
    String(data.category || '').trim(),
    Number(data.price || 0),
    Number(data.cost || 0),
    Number(data.stock || 0),
    Number(data.min_stock || data.minStock || 0),
    String(data.image || '').trim(),
    Number(data.active === undefined ? 1 : data.active ? 1 : 0),
    String(data.product_type || data.productType || 'normal').trim() || 'normal',
    String(data.game || '').trim(),
    String(data.card_name || data.cardName || name).trim(),
    String(data.set_name || data.setName || '').trim(),
    String(data.set_code || data.setCode || '').trim(),
    String(data.collector_number || data.collectorNumber || '').trim(),
    String(data.finish || '').trim(),
    String(data.language || '').trim(),
    String(data.card_condition || data.cardCondition || '').trim(),
  ]

  if (existing?.id) {
    db.prepare(`
      UPDATE products
      SET
        remote_id = ?,
        sku = ?,
        barcode = ?,
        name = ?,
        category = ?,
        price = ?,
        cost = ?,
        stock = ?,
        min_stock = ?,
        image = ?,
        active = ?,
        product_type = ?,
        game = ?,
        card_name = ?,
        set_name = ?,
        set_code = ?,
        collector_number = ?,
        finish = ?,
        language = ?,
        card_condition = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(...values, Number(existing.id))
  } else {
    db.prepare(`
      INSERT INTO products (
        remote_id,
        sku,
        barcode,
        name,
        category,
        price,
        cost,
        stock,
        min_stock,
        image,
        active,
        product_type,
        game,
        card_name,
        set_name,
        set_code,
        collector_number,
        finish,
        language,
        card_condition,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(...values)
  }

  return true
}

function applyRemoteChanges(db, responseData) {
  const changes = normalizeRemoteChanges(responseData)
  let applied = 0

  for (const change of changes) {
    const entityType = String(change?.entity_type || change?.entityType || '').trim()
    const data = change?.data || change?.payload || change
    let handled = false

    if (entityType === 'customer') {
      handled = applyCustomerChange(db, data)
    } else if (entityType === 'product') {
      handled = applyProductChange(db, data)
    }

    if (handled) {
      applied += 1
    }
  }

  const cursor = String(responseData?.cursor || responseData?.next_cursor || responseData?.data?.cursor || '').trim()
  if (cursor) {
    updateServerSyncCursor(db, cursor)
  }

  return {
    received: changes.length,
    applied,
    cursor,
  }
}

function getServerSyncStatus(db) {
  const settings = getServerSyncSettings(db)
  const counts = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
      COALESCE(SUM(CASE WHEN status = 'sending' THEN 1 ELSE 0 END), 0) AS sending_count,
      COALESCE(SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END), 0) AS synced_count,
      MAX(synced_at) AS last_synced_at,
      (
        SELECT last_error
        FROM server_sync_queue sq2
        WHERE sq2.status = 'failed'
          AND COALESCE(sq2.last_error, '') != ''
        ORDER BY sq2.last_attempt_at DESC, sq2.id DESC
        LIMIT 1
      ) AS last_error
    FROM server_sync_queue
  `).get()

  return {
    enabled: settings.enabled,
    configured: Boolean(settings.apiBaseUrl && settings.pushPath),
    apiBaseUrl: settings.apiBaseUrl,
    authPath: settings.authPath,
    pushPath: settings.pushPath,
    pullPath: settings.pullPath,
    authEmail: settings.authEmail,
    authenticatedEmail: settings.authenticatedEmail,
    deviceName: settings.deviceName,
    storeId: settings.storeId,
    timeoutMs: settings.timeoutMs,
    batchSize: settings.batchSize,
    retryBaseMs: settings.retryBaseMs,
    syncIntervalMs: settings.syncIntervalMs,
    autoSync: settings.autoSync,
    pullEnabled: settings.pullEnabled,
    hasSavedPassword: settings.hasSavedPassword,
    hasAccessToken: settings.hasAccessToken,
    lastAuthAt: settings.lastAuthAt,
    lastCursor: settings.lastCursor,
    pendingCount: Number(counts?.pending_count || 0),
    failedCount: Number(counts?.failed_count || 0),
    sendingCount: Number(counts?.sending_count || 0),
    syncedCount: Number(counts?.synced_count || 0),
    lastSyncedAt: String(counts?.last_synced_at || ''),
    lastError: String(counts?.last_error || ''),
    syncInFlight,
  }
}

async function flushPendingServerSync(db, options = {}) {
  const settings = getServerSyncSettings(db)

  if (!settings.enabled) {
    return {
      success: false,
      skipped: true,
      reason: 'disabled',
      status: getServerSyncStatus(db),
    }
  }

  if (!settings.apiBaseUrl || !settings.pushPath) {
    return {
      success: false,
      skipped: true,
      reason: 'missing_config',
      status: getServerSyncStatus(db),
    }
  }

  const limit = Math.max(Number(options.limit || settings.batchSize || 25), 1)
  const maxAttempts = Math.max(Number(options.maxAttempts || settings.maxAttempts || DEFAULT_MAX_SYNC_ATTEMPTS), 1)
  const retryBaseMs = Math.max(Number(options.retryBaseMs || settings.retryBaseMs || DEFAULT_RETRY_BASE_MS), 1000)
  const rows = getQueueRows(db, limit, maxAttempts)

  if (!rows.length) {
    return {
      success: true,
      processed: 0,
      synced: 0,
      failed: 0,
      status: getServerSyncStatus(db),
    }
  }

  setQueueRowsSending(db, rows)
  const envelopes = rows.map((row) => buildEventEnvelope(row))

  try {
    const responseData = await pushServerEvents(db, envelopes)
    markQueueRowsSynced(db, rows, extractResultsMap(responseData))

    writeSyncLog(db, {
      level: 'info',
      scope: 'push',
      message: `Se sincronizaron ${rows.length} evento(s) con el backend.`,
      payload: {
        queueIds: rows.map((row) => Number(row.id)),
      },
    })

    return {
      success: true,
      processed: rows.length,
      synced: rows.length,
      failed: 0,
      response: responseData,
      status: getServerSyncStatus(db),
    }
  } catch (error) {
    markQueueRowsFailed(db, rows, error, retryBaseMs)
    writeSyncLog(db, {
      level: 'error',
      scope: 'push',
      message: 'Error enviando cola al backend.',
      payload: {
        error: String(error?.message || 'error_desconocido'),
        statusCode: Number(error?.statusCode || 0) || null,
        queueIds: rows.map((row) => Number(row.id)),
      },
    })

    return {
      success: false,
      processed: rows.length,
      synced: 0,
      failed: rows.length,
      error: String(error?.message || 'Error de sincronizacion'),
      status: getServerSyncStatus(db),
    }
  }
}

async function runPullSync(db, options = {}) {
  const settings = getServerSyncSettings(db)
  if (!settings.enabled || !settings.pullEnabled || !settings.apiBaseUrl || !settings.pullPath) {
    return {
      success: true,
      skipped: true,
      reason: !settings.enabled ? 'disabled' : !settings.pullEnabled ? 'pull_disabled' : 'missing_config',
      applied: 0,
      received: 0,
    }
  }

  try {
    const responseData = await pullServerChanges(db, {
      cursor: options.cursor,
      limit: options.limit || settings.batchSize,
    })
    const result = applyRemoteChanges(db, responseData)

    writeSyncLog(db, {
      level: 'info',
      scope: 'pull',
      message: `Pull sync completado: ${result.applied}/${result.received} cambio(s) aplicados.`,
      payload: result,
    })

    return {
      success: true,
      ...result,
    }
  } catch (error) {
    writeSyncLog(db, {
      level: 'error',
      scope: 'pull',
      message: 'Error realizando pull sync.',
      payload: {
        error: String(error?.message || 'error_desconocido'),
        statusCode: Number(error?.statusCode || 0) || null,
      },
    })

    return {
      success: false,
      error: String(error?.message || 'Error de pull sync'),
      applied: 0,
      received: 0,
    }
  }
}

async function runServerSyncCycle(db, options = {}) {
  if (syncInFlight) {
    return {
      success: false,
      skipped: true,
      reason: 'already_running',
      status: getServerSyncStatus(db),
    }
  }

  syncInFlight = true
  notifyRendererChannels(getServerSyncStatus(db))

  try {
    const pushResult = await flushPendingServerSync(db, options)
    const pullResult = options.includePull === false ? {
      success: true,
      skipped: true,
      reason: 'pull_skipped',
      applied: 0,
      received: 0,
    } : await runPullSync(db, options)

    return {
      success: Boolean(pushResult?.success) && Boolean(pullResult?.success),
      pushResult,
      pullResult,
      status: getServerSyncStatus(db),
    }
  } finally {
    syncInFlight = false
    notifyRendererChannels(getServerSyncStatus(db))
  }
}

async function enqueueAndFlushServerSync(db, event = {}, options = {}) {
  const queueId = enqueueServerSync(db, event)
  const cycleResult = await runServerSyncCycle(db, {
    ...options,
    includePull: false,
  })

  return {
    queueId,
    flushResult: cycleResult?.pushResult || cycleResult,
    status: getServerSyncStatus(db),
  }
}

function startServerSyncScheduler(db) {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }

  syncTimer = setInterval(() => {
    const settings = getServerSyncSettings(db)
    if (!settings.enabled || !settings.autoSync) return
    runServerSyncCycle(db, { limit: settings.batchSize }).catch((error) => {
      writeSyncLog(db, {
        level: 'error',
        scope: 'scheduler',
        message: 'El scheduler de sincronizacion fallo.',
        payload: { error: String(error?.message || 'error_desconocido') },
      })
    })
  }, Math.max(Number(getServerSyncSettings(db).syncIntervalMs || 60000), 5000))
}

function stopServerSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}

module.exports = {
  authenticateWithServer,
  enqueueServerSync,
  enqueueAndFlushServerSync,
  flushPendingServerSync,
  getServerSyncSettings,
  getServerSyncStatus,
  listSyncLogs,
  runPullSync,
  runServerSyncCycle,
  startServerSyncScheduler,
  stopServerSyncScheduler,
  updateServerSyncSettings,
}
