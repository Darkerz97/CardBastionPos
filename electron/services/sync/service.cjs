const crypto = require('crypto')
const { BrowserWindow } = require('electron')
const { postSyncFormPayload, postSyncPayload, postSyncStringifiedFormPayload, getSyncResource, authenticateWithServer } = require('./client.cjs')
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

function buildStableUuid(seed) {
  const hash = crypto.createHash('sha1').update(String(seed || '')).digest('hex')
  const part1 = hash.slice(0, 8)
  const part2 = hash.slice(8, 12)
  const part3 = `5${hash.slice(13, 16)}`
  const variantNibble = ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16)
  const part4 = `${variantNibble}${hash.slice(17, 20)}`
  const part5 = hash.slice(20, 32)
  return `${part1}-${part2}-${part3}-${part4}-${part5}`
}

function getProductSyncReference(db, item = {}) {
  const localProductId = Number(item.product_id || item.id || 0)
  let productRow = null

  if (localProductId > 0) {
    productRow = db.prepare(`
      SELECT
        id,
        remote_id,
        sku,
        barcode,
        name,
        category,
        price,
        cost,
        stock,
        active,
        product_type,
        game,
        card_name,
        set_name,
        set_code,
        collector_number,
        finish,
        language,
        card_condition
      FROM products
      WHERE id = ?
      LIMIT 1
    `).get(localProductId)
  }

  const remoteId = Number(productRow?.remote_id || 0)
  const sku = String(item.sku || productRow?.sku || '').trim()
  const barcode = String(item.barcode || productRow?.barcode || '').trim()

  const fallbackProduct = remoteId > 0 || !productRow
    ? null
    : {
        local_id: Number(productRow.id),
        remote_id: null,
        sku: sku || null,
        barcode: barcode || null,
        name: String(productRow.name || item.name || '').trim() || null,
        category: String(productRow.category || '').trim() || null,
        price: Number(productRow.price || item.price || 0),
        cost: Number(productRow.cost || 0),
        stock: Number(productRow.stock || 0),
        active: Number(productRow.active === undefined ? 1 : productRow.active ? 1 : 0),
        product_type: String(productRow.product_type || 'normal').trim() || 'normal',
        game: String(productRow.game || '').trim() || null,
        card_name: String(productRow.card_name || productRow.name || item.name || '').trim() || null,
        set_name: String(productRow.set_name || '').trim() || null,
        set_code: String(productRow.set_code || '').trim() || null,
        collector_number: String(productRow.collector_number || '').trim() || null,
        finish: String(productRow.finish || '').trim() || null,
        language: String(productRow.language || '').trim() || null,
        card_condition: String(productRow.card_condition || '').trim() || null,
      }

  return {
    product_id: remoteId > 0 ? remoteId : null,
    product_uuid: null,
    product_sku: sku || null,
    product_barcode: barcode || null,
    product_name: String(item.name || productRow?.name || '').trim() || null,
    product_payload: fallbackProduct,
  }
}

function getCustomerSyncReference(db, sale = {}) {
  const localCustomerId = Number(sale.customer_id || sale.customerId || 0)
  let customerRow = null

  if (localCustomerId > 0) {
    customerRow = db.prepare(`
      SELECT id, remote_id, email, phone
      FROM customers
      WHERE id = ?
      LIMIT 1
    `).get(localCustomerId)
  }

  const remoteId = Number(customerRow?.remote_id || 0)
  const email = String(customerRow?.email || '').trim()
  const phone = String(customerRow?.phone || '').trim()

  return {
    customer_id: remoteId > 0 ? remoteId : null,
    customer_uuid: null,
    customer_email: email || null,
    customer_phone: phone || null,
  }
}

function buildSaleUploadItem(db, entry) {
  const sale = entry?.payload?.sale || {}
  const items = Array.isArray(entry?.payload?.items) ? entry.payload.items : []
  const seed = sale.folio || sale.id || entry.entity_id || entry.event_id || Date.now()
  const amountPaid = Number(sale.amount_paid || 0)
  const paymentMethod = String(sale.payment_method || '').trim()
  const paymentAllowed = ['cash', 'card', 'transfer', 'credit', 'mixed'].includes(paymentMethod)
  const payments = amountPaid > 0 && paymentAllowed
    ? [{
        method: paymentMethod,
        amount: amountPaid,
        reference: sale.folio || null,
        notes: sale.payment_notes || '',
        paid_at: sale.created_at || entry.queued_at || null,
      }]
    : []

  return {
    uuid: buildStableUuid(`sale:${seed}`),
    ...getCustomerSyncReference(db, sale),
    user_id: null,
    user_uuid: null,
    sale_number: sale.folio || null,
    discount: Number(sale.discount || 0),
    status: 'completed',
    sold_at: sale.created_at || entry.queued_at || null,
    client_generated_at: sale.created_at || entry.queued_at || null,
    received_at: new Date().toISOString(),
    items: items.map((item) => ({
      ...getProductSyncReference(db, item),
      quantity: Number(item.qty || 0),
      unit_price: Number(item.unit_price || 0),
    })),
    payments,
  }
}

function buildClosureUploadItem(entry) {
  const payload = entry?.payload || {}
  const summary = payload.summary || {}
  const action = String(entry?.action || payload.action || '').trim()
  const eventType = String(entry?.event_type || '').trim()
  const resolvedSessionId = Number(summary.sessionId || payload.cashSessionId || entry?.entity_id || 0) || null
  const openingAmount = payload.openingAmount ?? summary.openingAmount ?? 0
  const closingAmount = payload.closingAmount ?? summary.closingAmount ?? 0
  const expectedAmount = summary.expectedAmount ?? payload.expectedAmount ?? null
  const difference = summary.difference ?? payload.difference ?? null
  const openedAt = summary.openedAt || payload.openedAt || null
  const closedAt = summary.closedAt || payload.closedAt || null

  return {
    local_id: entry.entity_id ?? null,
    cash_session_id: resolvedSessionId,
    event_type: eventType || null,
    action: action || null,
    status: action === 'delete' ? 'deleted' : 'closed',
    opening_amount: Number(openingAmount || 0),
    closing_amount: Number(closingAmount || 0),
    expected_amount: expectedAmount === null ? null : Number(expectedAmount || 0),
    difference: difference === null ? null : Number(difference || 0),
    notes: payload.notes || summary.notes || '',
    opened_at: openedAt,
    closed_at: closedAt,
    summary,
    created_at: entry.queued_at || null,
  }
}

function buildInventoryUploadItem(entry) {
  const payload = entry?.payload || {}
  return {
    local_id: entry.entity_id ?? null,
    event_type: entry.event_type || null,
    product_id: payload.productId || null,
    mode: payload.mode || payload.type || null,
    quantity: Number(payload.quantity || 0),
    cost: payload.cost === null || payload.cost === undefined ? null : Number(payload.cost),
    notes: payload.notes || '',
    reference: payload.reference || null,
    stock_before: payload.stockBefore === undefined ? null : Number(payload.stockBefore),
    stock_after: payload.stockAfter === undefined ? null : Number(payload.stockAfter),
    created_at: entry.queued_at || null,
  }
}

function buildProductUploadItem(entry) {
  const payload = entry?.payload || {}
  const product = payload.product || {}

  return {
    local_id: entry.entity_id ?? null,
    event_type: entry.event_type || null,
    action: entry.action || null,
    product: {
      remote_id: product.remote_id || null,
      sku: product.sku || null,
      barcode: product.barcode || null,
      name: product.name || product.card_name || null,
      category: product.category || null,
      price: Number(product.price || 0),
      cost: Number(product.cost || 0),
      stock: Number(product.stock || 0),
      min_stock: Number(product.min_stock || product.minStock || 0),
      image: product.image || null,
      active: Number(product.active === undefined ? 1 : product.active ? 1 : 0),
      product_type: product.product_type || product.productType || 'normal',
      game: product.game || null,
      card_name: product.card_name || product.cardName || product.name || null,
      set_name: product.set_name || product.setName || null,
      set_code: product.set_code || product.setCode || null,
      collector_number: product.collector_number || product.collectorNumber || null,
      finish: product.finish || null,
      language: product.language || null,
      card_condition: product.card_condition || product.cardCondition || null,
      created_at: product.created_at || null,
      updated_at: product.updated_at || null,
    },
  }
}

function getPushRouteForRow(settings, row) {
  const eventType = String(row.event_type || '').trim()
  const entityType = String(row.entity_type || '').trim()
  const action = String(row.action || '').trim()

  if (eventType.startsWith('sale.') || eventType.startsWith('receivable_payment.')) {
    return settings.uploadSalesPath
  }

  if (
    eventType === 'cash_session.close' ||
    eventType === 'cash_session.update' ||
    eventType === 'cash_session.delete'
  ) {
    return settings.uploadCashClosuresPath
  }

  if (eventType.startsWith('inventory.')) {
    return settings.uploadInventoryMovementsPath
  }

  if (eventType.startsWith('product.')) {
    return settings.uploadProductsPath || settings.pushPath
  }

  if (eventType.startsWith('product.') || eventType.startsWith('customer.')) {
    return settings.pushPath
  }

  if (entityType === 'sale') {
    return settings.uploadSalesPath
  }

  if (entityType === 'cash_session' && ['close', 'update', 'delete'].includes(action)) {
    return settings.uploadCashClosuresPath
  }

  if (entityType === 'product') {
    return settings.uploadProductsPath || settings.pushPath
  }

  if (entityType === 'product' || entityType === 'customer') {
    return settings.pushPath
  }

  return null
}

function groupRowsByPushRoute(settings, rows) {
  const groups = new Map()
  const unsupportedRows = []

  for (const row of rows) {
    const route = getPushRouteForRow(settings, row)
    if (!route) {
      unsupportedRows.push(row)
      continue
    }

    if (!groups.has(route)) {
      groups.set(route, [])
    }

    groups.get(route).push(row)
  }

  return { groups, unsupportedRows }
}

function markQueueRowsIgnored(db, rows, reason = 'ignored') {
  const statement = db.prepare(`
    UPDATE server_sync_queue
    SET
      status = 'synced',
      synced_at = CURRENT_TIMESTAMP,
      last_error = NULL,
      last_status_code = 204,
      response_json = ?,
      locked_at = NULL,
      next_attempt_at = NULL
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    for (const row of rows) {
      statement.run(JSON.stringify({ ignored: true, reason }), Number(row.id))
    }
  })

  transaction()
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

function extractUploadResults(responseData) {
  const directItems = responseData?.results || responseData?.data?.results || responseData?.acknowledged_events
  if (Array.isArray(directItems)) return directItems
  if (Array.isArray(responseData?.data)) return responseData.data
  return []
}

function buildQueueResultMap(rows, responseData) {
  const map = new Map()
  const results = extractUploadResults(responseData)

  rows.forEach((row, index) => {
    const result = results[index] || null
    map.set(Number(row.id), result)
  })

  return map
}

function classifyUploadResults(rows, responseData) {
  const resultMap = buildQueueResultMap(rows, responseData)
  const syncedRows = []
  const failedRows = []
  const skippedRows = []

  for (const row of rows) {
    const result = resultMap.get(Number(row.id))
    const status = String(result?.status || '').trim().toLowerCase()

    if (!result || !status || status === 'created' || status === 'updated' || status === 'success') {
      syncedRows.push(row)
      continue
    }

    if (status === 'skipped') {
      skippedRows.push(row)
      continue
    }

    if (status === 'failed' || status === 'conflict' || status === 'error') {
      failedRows.push({
        row,
        error: {
          message: String(result?.message || result?.code || 'Error de sincronizacion'),
          statusCode: 409,
          responseBody: result,
        },
      })
      continue
    }

    syncedRows.push(row)
  }

  return {
    resultMap,
    syncedRows,
    skippedRows,
    failedRows,
  }
}

function extractAcknowledgedEntityData(result = {}) {
  if (!result || typeof result !== 'object') return null

  return result.data || result.payload || result.product || result.customer || result.entity || result.record || null
}

function reconcileSyncedEntity(db, row, result) {
  const entityType = String(row?.entity_type || '').trim()
  const data = extractAcknowledgedEntityData(result)

  if (!data || typeof data !== 'object') return false

  if (entityType === 'product') {
    const remoteId = data.remote_id || data.remoteId || data.id || result?.remote_id || result?.remoteId || result?.id
    if (!remoteId) return false
    return applyProductChange(db, { ...data, remote_id: remoteId })
  }

  if (entityType === 'customer') {
    const remoteId = data.remote_id || data.remoteId || data.id || result?.remote_id || result?.remoteId || result?.id
    if (!remoteId) return false
    return applyCustomerChange(db, { ...data, remote_id: remoteId })
  }

  return false
}

function reconcileSyncedRows(db, rows, resultsMap = new Map()) {
  for (const row of rows) {
    const result = resultsMap.get(Number(row.id))
    if (!result) continue
    reconcileSyncedEntity(db, row, result)
  }
}

function normalizeRemoteChanges(responseData, entityType) {
  if (Array.isArray(responseData)) {
    return responseData.map((item) => ({ entity_type: entityType, data: item }))
  }

  const directChanges = responseData?.changes || responseData?.data?.changes || responseData?.events || responseData?.data?.events
  if (Array.isArray(directChanges)) {
    return directChanges
  }

  const directData = responseData?.data
  if (Array.isArray(directData)) {
    return directData.map((item) => ({ entity_type: entityType, data: item }))
  }

  const items = responseData?.items || responseData?.results
  if (Array.isArray(items)) {
    return items.map((item) => ({ entity_type: entityType, data: item }))
  }

  return []
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

function applyRemoteChanges(db, responseData, fallbackEntityType = '') {
  const changes = normalizeRemoteChanges(responseData, fallbackEntityType)
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

async function pushRowsToRoute(db, route, rows) {
  const envelopes = rows.map((row) => buildEventEnvelope(row))
  const lowerRoute = String(route || '').toLowerCase()
  let body = {}

  if (lowerRoute.includes('upload-sales')) {
    const sales = envelopes.map((entry) => buildSaleUploadItem(db, entry))
    body = { sales }
  } else if (lowerRoute.includes('upload-products')) {
    const products = envelopes.map(buildProductUploadItem)
    body = { products }
  } else if (lowerRoute.includes('upload-cash-closures')) {
    const closures = envelopes.map(buildClosureUploadItem)
    body = { closures }
  } else if (lowerRoute.includes('upload-inventory-movements')) {
    const movements = envelopes.map(buildInventoryUploadItem)
    body = { inventory_movements: movements }
  } else {
    body = { events: envelopes }
  }

  let responseData = null
  if (lowerRoute.includes('upload-cash-closures')) {
    responseData = await postSyncStringifiedFormPayload(db, route, body, ['closures'])
  } else {
    const useFormPayload = lowerRoute.includes('upload-sales') ||
      lowerRoute.includes('upload-products') ||
      lowerRoute.includes('upload-inventory-movements')
    responseData = useFormPayload
      ? await postSyncFormPayload(db, route, body)
      : await postSyncPayload(db, route, body)
  }

  return {
    responseData,
    requestBody: body,
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
    configured: Boolean(
      settings.apiBaseUrl &&
      settings.authPath &&
      settings.uploadSalesPath &&
      settings.uploadCashClosuresPath &&
      settings.uploadInventoryMovementsPath
    ),
    apiBaseUrl: settings.apiBaseUrl,
    authPath: settings.authPath,
    pushPath: settings.pushPath,
    pullPath: settings.pullPath,
    uploadSalesPath: settings.uploadSalesPath,
    uploadCashClosuresPath: settings.uploadCashClosuresPath,
    uploadInventoryMovementsPath: settings.uploadInventoryMovementsPath,
    pullProductsPath: settings.pullProductsPath,
    pullCustomersPath: settings.pullCustomersPath,
    pullCatalogPath: settings.pullCatalogPath,
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

  if (!settings.apiBaseUrl || !settings.uploadSalesPath || !settings.uploadCashClosuresPath || !settings.uploadInventoryMovementsPath) {
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

  const { groups, unsupportedRows } = groupRowsByPushRoute(settings, rows)
  const unsupportedIds = new Set(unsupportedRows.map((row) => Number(row.id)))
  setQueueRowsSending(db, rows)

  if (unsupportedRows.length) {
    markQueueRowsIgnored(db, unsupportedRows, 'no_upload_endpoint_for_entity')
    writeSyncLog(db, {
      level: 'info',
      scope: 'push',
      message: `Se ignoraron ${unsupportedRows.length} evento(s) sin endpoint de upload en Laravel.`,
      payload: {
        queueIds: unsupportedRows.map((row) => Number(row.id)),
      },
    })
  }

  try {
    let processed = unsupportedRows.length
    let synced = unsupportedRows.length
    let failed = 0
    let lastError = ''

    for (const [route, routeRows] of groups.entries()) {
      try {
        const { responseData } = await pushRowsToRoute(db, route, routeRows)
        const classified = classifyUploadResults(routeRows, responseData)

        if (classified.syncedRows.length) {
          reconcileSyncedRows(db, classified.syncedRows, classified.resultMap)
          markQueueRowsSynced(db, classified.syncedRows, classified.resultMap)
        }

        if (classified.skippedRows.length) {
          reconcileSyncedRows(db, classified.skippedRows, classified.resultMap)
          markQueueRowsSynced(db, classified.skippedRows, classified.resultMap)
        }

        if (classified.failedRows.length) {
          failed += classified.failedRows.length
          for (const item of classified.failedRows) {
            markQueueRowsFailed(db, [item.row], item.error, retryBaseMs)
          }

          writeSyncLog(db, {
            level: 'error',
            scope: 'push',
            message: `Laravel reporto ${classified.failedRows.length} conflicto(s) o fallo(s) en ${route}.`,
            payload: {
              queueIds: classified.failedRows.map((item) => Number(item.row.id)),
              results: classified.failedRows.map((item) => item.error.responseBody),
            },
          })
        }

        processed += routeRows.length
        synced += classified.syncedRows.length + classified.skippedRows.length
      } catch (error) {
        let requestBodyPreview = null
        try {
          const preview = await (async () => {
            const envelopes = routeRows.map((row) => buildEventEnvelope(row))
            if (String(route || '').toLowerCase().includes('upload-sales')) {
              return { sales: envelopes.map((entry) => buildSaleUploadItem(db, entry)) }
            }
            if (String(route || '').toLowerCase().includes('upload-cash-closures')) {
              return { closures: envelopes.map(buildClosureUploadItem) }
            }
            if (String(route || '').toLowerCase().includes('upload-inventory-movements')) {
              return { inventory_movements: envelopes.map(buildInventoryUploadItem) }
            }
            return { events: envelopes }
          })()
          requestBodyPreview = preview
        } catch (_innerError) {
          requestBodyPreview = null
        }

        markQueueRowsFailed(db, routeRows, error, retryBaseMs)
        failed += routeRows.length
        lastError = String(error?.message || 'Error de sincronizacion')

        writeSyncLog(db, {
          level: 'error',
          scope: 'push',
          message: `Error enviando lote a ${route}.`,
          payload: {
            error: lastError,
            statusCode: Number(error?.statusCode || 0) || null,
            queueIds: routeRows.map((row) => Number(row.id)),
            requestBodyPreview,
          },
        })
      }
    }

    writeSyncLog(db, {
      level: 'info',
      scope: 'push',
      message: `Se procesaron ${processed} evento(s) de sincronizacion.`,
      payload: {
        queueIds: rows.map((row) => Number(row.id)),
      },
    })

    return {
      success: failed === 0,
      processed: processed + failed,
      synced,
      failed,
      error: lastError || '',
      status: getServerSyncStatus(db),
    }
  } catch (error) {
    const routeRows = rows.filter((row) => !unsupportedIds.has(Number(row.id)))
    markQueueRowsFailed(db, routeRows, error, retryBaseMs)
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
      synced: unsupportedRows.length,
      failed: rows.length - unsupportedRows.length,
      error: String(error?.message || 'Error de sincronizacion'),
      status: getServerSyncStatus(db),
    }
  }
}

async function runPullSync(db, options = {}) {
  const settings = getServerSyncSettings(db)
  if (!settings.enabled || !settings.pullEnabled || !settings.apiBaseUrl) {
    return {
      success: true,
      skipped: true,
      reason: !settings.enabled ? 'disabled' : !settings.pullEnabled ? 'pull_disabled' : 'missing_config',
      applied: 0,
      received: 0,
    }
  }

  try {
    let applied = 0
    let received = 0
    const details = {}

    const pulls = [
      { key: 'products', path: settings.pullProductsPath, entityType: 'product' },
      { key: 'customers', path: settings.pullCustomersPath, entityType: 'customer' },
      { key: 'catalog', path: settings.pullCatalogPath, entityType: 'product' },
    ]

    for (const pull of pulls) {
      if (!pull.path) continue
      const responseData = await getSyncResource(db, pull.path, {
        limit: options.limit || settings.batchSize,
      })
      const result = applyRemoteChanges(db, responseData, pull.entityType)
      applied += Number(result.applied || 0)
      received += Number(result.received || 0)
      details[pull.key] = result
    }

    const result = { applied, received, details }

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
