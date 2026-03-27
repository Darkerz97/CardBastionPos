const { ipcMain, dialog } = require('electron')
const path = require('path')
const XLSX = require('xlsx')
const { getDb } = require('../database/db.cjs')

function n(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function t(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function normalizeDate(value) {
  if (!value) return null
  return String(value)
}

function generatePreorderNumber() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const rand = Math.floor(Math.random() * 900 + 100)
  return `PRE-${yyyy}${mm}${dd}-${hh}${mi}${ss}-${rand}`
}

function normalizePreorderNumber(value) {
  return t(value).replace(/\s+/g, '-').toUpperCase()
}

function normalizePaymentMethod(value) {
  const method = t(value || 'cash', 'cash').toLowerCase()
  if (['cash', 'efectivo'].includes(method)) return 'cash'
  if (['card', 'tarjeta'].includes(method)) return 'card'
  if (['transfer', 'transferencia', 'bank', 'bank_transfer'].includes(method)) return 'transfer'
  return 'cash'
}

function resolvePreorderStatus(amountPaid, amountDue, fallback = 'active') {
  const paid = n(amountPaid)
  const due = n(amountDue)

  if (due <= 0) return 'paid'
  if (paid > 0) return 'partial'

  if (fallback === 'draft') return 'draft'
  return 'active'
}

function mapPreorderRow(row) {
  return {
    id: Number(row.id),
    preorderNumber: String(row.preorder_number || ''),
    customerId: Number(row.customer_id),
    preorderCatalogId: row.preorder_catalog_id ? Number(row.preorder_catalog_id) : null,
    catalogCode: String(row.catalog_code || ''),
    catalogName: String(row.catalog_name || ''),
    category: String(row.catalog_category || ''),
    image: String(row.catalog_image || ''),
    description: String(row.catalog_description || ''),
    customerName: String(row.customer_name || ''),
    customerPhone: String(row.customer_phone || ''),
    customerEmail: String(row.customer_email || ''),
    status: String(row.status || 'active'),
    totalAmount: n(row.total_amount),
    amountPaid: n(row.amount_paid),
    amountDue: n(row.amount_due),
    currency: String(row.currency || 'MXN'),
    dueDate: String(row.due_date || ''),
    releaseDate: String(row.release_date || ''),
    notes: String(row.notes || ''),
    linkedSaleId: row.linked_sale_id ? Number(row.linked_sale_id) : null,
    emailSentCreated: Number(row.email_sent_created || 0) === 1,
    emailSentPaid: Number(row.email_sent_paid || 0) === 1,
    emailSentFulfilled: Number(row.email_sent_fulfilled || 0) === 1,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }
}

function mapCatalogRow(row) {
  return {
    id: Number(row.id),
    code: String(row.code || ''),
    name: String(row.name || ''),
    category: String(row.category || ''),
    description: String(row.description || ''),
    productId: row.product_id ? Number(row.product_id) : null,
    productName: String(row.product_name || ''),
    sku: String(row.sku || ''),
    image: String(row.image || ''),
    releaseDate: String(row.release_date || ''),
    dueDate: String(row.due_date || ''),
    unitPrice: n(row.unit_price),
    quantityDefault: n(row.quantity_default || 1, 1),
    currency: String(row.currency || 'MXN'),
    active: Number(row.active || 0) === 1,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }
}

function buildCatalogFilter(filters = {}, alias = 'pc') {
  const where = [`COALESCE(${alias}.active, 1) = 1`]
  const params = []
  const query = t(filters.query).toLowerCase()
  const category = t(filters.category)
  const dateFrom = t(filters.dateFrom)
  const dateTo = t(filters.dateTo)

  if (category) {
    where.push(`${alias}.category = ?`)
    params.push(category)
  }

  if (dateFrom) {
    where.push(`date(${alias}.release_date, 'localtime') >= date(?)`)
    params.push(dateFrom)
  }

  if (dateTo) {
    where.push(`date(${alias}.release_date, 'localtime') <= date(?)`)
    params.push(dateTo)
  }

  if (query) {
    where.push(`(
      lower(COALESCE(${alias}.code, '')) LIKE ? OR
      lower(COALESCE(${alias}.name, '')) LIKE ? OR
      lower(COALESCE(${alias}.category, '')) LIKE ? OR
      lower(COALESCE(${alias}.product_name, '')) LIKE ? OR
      lower(COALESCE(${alias}.sku, '')) LIKE ?
    )`)
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`)
  }

  return {
    whereSql: `WHERE ${where.join(' AND ')}`,
    params,
  }
}

function normalizeSheetRows(rows = []) {
  return rows.map((row) => {
    const normalized = {}
    for (const [key, value] of Object.entries(row || {})) {
      normalized[key] = value === null || value === undefined ? '' : value
    }
    return normalized
  })
}

function appendSheet(workbook, name, rows) {
  const sheet = XLSX.utils.json_to_sheet(normalizeSheetRows(rows))
  XLSX.utils.book_append_sheet(workbook, sheet, name)
}

function buildListFilter(filters = {}, alias = 'p') {
  const where = []
  const params = []

  const status = t(filters.status)
  const customerId = Number(filters.customerId || 0)
  const query = t(filters.query).toLowerCase()
  const dateFrom = t(filters.dateFrom)
  const dateTo = t(filters.dateTo)
  const productQuery = t(filters.productQuery).toLowerCase()

  if (status) {
    where.push(`${alias}.status = ?`)
    params.push(status)
  }

  if (customerId > 0) {
    where.push(`${alias}.customer_id = ?`)
    params.push(customerId)
  }

  if (dateFrom) {
    where.push(`date(${alias}.created_at, 'localtime') >= date(?)`)
    params.push(dateFrom)
  }

  if (dateTo) {
    where.push(`date(${alias}.created_at, 'localtime') <= date(?)`)
    params.push(dateTo)
  }

  if (Boolean(filters.overdueOnly)) {
    where.push(`${alias}.amount_due > 0`)
    where.push(`${alias}.release_date IS NOT NULL`)
    where.push(`datetime(${alias}.release_date) < datetime('now')`)
    where.push(`${alias}.status NOT IN ('fulfilled', 'cancelled')`)
  }

  if (query) {
    where.push(`(
      lower(${alias}.preorder_number) LIKE ? OR
      lower(c.name) LIKE ? OR
      lower(COALESCE(pc.name, '')) LIKE ? OR
      lower(COALESCE(pc.category, '')) LIKE ?
    )`)
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`)
  }

  if (productQuery) {
    where.push(`EXISTS (
      SELECT 1
      FROM preorder_items pi
      WHERE pi.preorder_id = ${alias}.id
        AND (
          lower(pi.product_name) LIKE ? OR
          lower(COALESCE(pi.sku, '')) LIKE ?
        )
    )`)
    params.push(`%${productQuery}%`, `%${productQuery}%`)
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  }
}

function getEmailConfig(db) {
  const rows = db.prepare(`
    SELECT key, value
    FROM settings
    WHERE key IN (
      'preorders.email.mode',
      'preorders.email.from',
      'preorders.email.webhook_url',
      'preorders.email.webhook_token'
    )
  `).all()

  const map = new Map((rows || []).map((row) => [row.key, row.value]))

  return {
    mode: t(map.get('preorders.email.mode') || 'log', 'log'),
    from: t(map.get('preorders.email.from') || 'no-reply@cardbastion.local', 'no-reply@cardbastion.local'),
    webhookUrl: t(map.get('preorders.email.webhook_url')),
    webhookToken: t(map.get('preorders.email.webhook_token')),
  }
}

function buildItemsText(items = []) {
  if (!items.length) return '- Sin items'
  return items
    .map((item) => `- ${item.productName} x${Number(item.quantity || 0)} ($${n(item.unitPrice).toFixed(2)})`)
    .join('\n')
}

function findOrCreateImportCustomer(db, row = {}) {
  const customerId = Number(row.customer_id || row.customerId || 0)
  const customerName = t(row.customer_name || row.customerName || row.cliente || row.nombre_cliente)
  const customerPhone = t(row.customer_phone || row.customerPhone || row.telefono || row.phone)
  const customerEmail = t(row.customer_email || row.customerEmail || row.email)

  if (customerId > 0) {
    const byId = db.prepare(`SELECT id FROM customers WHERE id = ? LIMIT 1`).get(customerId)
    if (byId) return Number(byId.id)
  }

  if (customerEmail) {
    const byEmail = db.prepare(`SELECT id FROM customers WHERE lower(COALESCE(email, '')) = lower(?) LIMIT 1`).get(customerEmail)
    if (byEmail) return Number(byEmail.id)
  }

  if (customerPhone) {
    const byPhone = db.prepare(`SELECT id FROM customers WHERE COALESCE(phone, '') = ? LIMIT 1`).get(customerPhone)
    if (byPhone) return Number(byPhone.id)
  }

  if (customerName) {
    const byName = db.prepare(`SELECT id FROM customers WHERE lower(name) = lower(?) LIMIT 1`).get(customerName)
    if (byName) return Number(byName.id)
  }

  if (!customerName) {
    throw new Error('Cada preventa importada debe incluir cliente o customer_id.')
  }

  const result = db.prepare(`
    INSERT INTO customers (name, phone, email, created_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(customerName, customerPhone || null, customerEmail || null)

  return Number(result.lastInsertRowid)
}

function findImportProduct(db, row = {}) {
  const productId = Number(row.product_id || row.productId || 0)
  const sku = t(row.product_sku || row.sku || row.codigo || row.productCode)
  const productName = t(row.product_name || row.productName || row.nombre_producto || row.producto)

  if (productId > 0) {
    const byId = db.prepare(`SELECT id, sku, name FROM products WHERE id = ? LIMIT 1`).get(productId)
    if (byId) return byId
  }

  if (sku) {
    const bySku = db.prepare(`SELECT id, sku, name FROM products WHERE lower(COALESCE(sku, '')) = lower(?) LIMIT 1`).get(sku)
    if (bySku) return bySku
  }

  if (productName) {
    const byName = db.prepare(`SELECT id, sku, name FROM products WHERE lower(name) = lower(?) LIMIT 1`).get(productName)
    if (byName) return byName
  }

  return null
}

function createCatalogItemRecord(db, payload = {}) {
  const code = normalizePreorderNumber(payload.code || payload.catalogCode || payload.name)
  const name = t(payload.name)
  const category = t(payload.category)
  const description = t(payload.description || payload.notes)
  const productId = Number(payload.productId || 0) || null
  const releaseDate = normalizeDate(payload.releaseDate)
  const dueDate = normalizeDate(payload.dueDate)
  const unitPrice = Math.max(n(payload.unitPrice, 0), 0)
  const quantityDefault = Math.max(n(payload.quantityDefault || payload.quantity, 1), 0.01)
  const currency = t(payload.currency || 'MXN', 'MXN')
  const image = t(payload.image)

  if (!name) throw new Error('El nombre de la preventa es obligatorio.')

  let product = null
  if (productId) {
    product = db.prepare(`SELECT id, name, sku, category, image FROM products WHERE id = ? LIMIT 1`).get(productId)
    if (!product) throw new Error('Producto no encontrado para la preventa.')
  }

  const existing = db.prepare(`SELECT id FROM preorder_catalog WHERE code = ? LIMIT 1`).get(code)
  if (existing) {
    throw new Error(`Ya existe una preventa base con el codigo ${code}.`)
  }

  const result = db.prepare(`
    INSERT INTO preorder_catalog (
      code, name, category, description, product_id, product_name, sku, image,
      release_date, due_date, unit_price, quantity_default, currency, active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
  `).run(
    code,
    name,
    category || t(product?.category),
    description,
    productId,
    t(payload.productName || product?.name),
    t(payload.sku || product?.sku),
    image || t(product?.image),
    releaseDate,
    dueDate,
    unitPrice,
    quantityDefault,
    currency
  )

  return Number(result.lastInsertRowid)
}

function updateCatalogItemRecord(db, payload = {}) {
  const catalogId = Number(payload.id || payload.catalogId || 0)
  if (!catalogId) throw new Error('ID de preventa base invalido.')

  const current = db.prepare(`SELECT * FROM preorder_catalog WHERE id = ? LIMIT 1`).get(catalogId)
  if (!current) throw new Error('Preventa base no encontrada.')

  const code = normalizePreorderNumber(payload.code || current.code || payload.name)
  const name = t(payload.name ?? current.name)
  const category = t(payload.category ?? current.category)
  const description = t(payload.description ?? current.description)
  const productId = payload.productId === null || payload.productId === '' ? null : (Number(payload.productId || current.product_id || 0) || null)
  const releaseDate = normalizeDate(payload.releaseDate ?? current.release_date)
  const dueDate = normalizeDate(payload.dueDate ?? current.due_date)
  const unitPrice = Math.max(n(payload.unitPrice ?? current.unit_price, 0), 0)
  const quantityDefault = Math.max(n(payload.quantityDefault ?? current.quantity_default, 1), 0.01)
  const currency = t(payload.currency ?? current.currency ?? 'MXN', 'MXN')
  const active = payload.active === undefined ? Number(current.active || 0) === 1 : Boolean(payload.active)
  const imageValue = t(payload.image ?? current.image)

  const duplicate = db.prepare(`SELECT id FROM preorder_catalog WHERE code = ? AND id != ? LIMIT 1`).get(code, catalogId)
  if (duplicate) throw new Error(`Ya existe otra preventa base con el codigo ${code}.`)

  let product = null
  if (productId) {
    product = db.prepare(`SELECT id, name, sku, category, image FROM products WHERE id = ? LIMIT 1`).get(productId)
    if (!product) throw new Error('Producto no encontrado para la preventa.')
  }

  db.prepare(`
    UPDATE preorder_catalog
    SET
      code = ?,
      name = ?,
      category = ?,
      description = ?,
      product_id = ?,
      product_name = ?,
      sku = ?,
      image = ?,
      release_date = ?,
      due_date = ?,
      unit_price = ?,
      quantity_default = ?,
      currency = ?,
      active = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    code,
    name,
    category || t(product?.category),
    description,
    productId,
    productId ? t(payload.productName || product?.name) : t(payload.productName ?? current.product_name),
    productId ? t(payload.sku || product?.sku) : t(payload.sku ?? current.sku),
    imageValue || t(product?.image),
    releaseDate,
    dueDate,
    unitPrice,
    quantityDefault,
    currency,
    active ? 1 : 0,
    catalogId
  )

  return catalogId
}

function createPreorderRecord(db, payload = {}, options = {}) {
  const customerId = Number(payload.customerId || 0)
  const preorderCatalogId = Number(payload.preorderCatalogId || payload.catalogId || 0) || null
  const items = Array.isArray(payload.items) ? payload.items : []
  const notes = t(payload.notes)
  const dueDate = normalizeDate(payload.dueDate)
  const releaseDate = normalizeDate(payload.releaseDate)
  const currency = t(payload.currency || 'MXN', 'MXN')
  const initialPaymentAmount = Math.max(n(payload.initialPaymentAmount, 0), 0)
  const initialPaymentMethod = normalizePaymentMethod(payload.initialPaymentMethod || 'cash')
  const initialPaymentNotes = t(payload.initialPaymentNotes || 'Abono inicial preventa')
  const requestedStatus = t(payload.status)
  const requestedPreorderNumber = normalizePreorderNumber(options.preorderNumber || payload.preorderNumber)

  if (!customerId) throw new Error('Debes seleccionar cliente para crear una preventa.')
  const customer = db.prepare(`SELECT id FROM customers WHERE id = ? LIMIT 1`).get(customerId)
  if (!customer) throw new Error('Cliente no encontrado.')
  if (!items.length) throw new Error('La preventa debe incluir al menos un item.')

  const normalizedItems = items.map((item) => {
    const quantity = n(item.quantity, 0)
    const unitPrice = n(item.unitPrice, 0)
    const lineTotal = n(item.lineTotal, quantity * unitPrice)
    if (quantity <= 0) throw new Error('Cantidad invalida en items de preventa.')
    if (unitPrice < 0) throw new Error('Precio unitario invalido en preventa.')
    return {
      productId: item.productId ? Number(item.productId) : null,
      productName: t(item.productName || item.name),
      sku: t(item.sku),
      quantity,
      unitPrice,
      lineTotal,
      notes: t(item.notes),
    }
  })
  if (normalizedItems.some((item) => !item.productName)) throw new Error('Todos los items deben tener nombre de producto.')

  const totalAmount = normalizedItems.reduce((acc, row) => acc + n(row.lineTotal), 0)
  if (initialPaymentAmount > totalAmount + 0.01) throw new Error('El abono inicial no puede ser mayor al total de la preventa.')

  const amountPaid = initialPaymentAmount
  const amountDue = Math.max(totalAmount - amountPaid, 0)
  const status = resolvePreorderStatus(amountPaid, amountDue, requestedStatus === 'draft' ? 'draft' : 'active')
  const preorderNumber = requestedPreorderNumber || generatePreorderNumber()

  const existingPreorder = db.prepare(`SELECT id FROM preorders WHERE preorder_number = ? LIMIT 1`).get(preorderNumber)
  if (existingPreorder) {
    throw new Error(`Ya existe una preventa con el numero ${preorderNumber}.`)
  }

  const tx = db.transaction(() => {
    const preorderResult = db.prepare(`
      INSERT INTO preorders (
        preorder_number, customer_id, preorder_catalog_id, status, total_amount, amount_paid, amount_due,
        currency, due_date, release_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(preorderNumber, customerId, preorderCatalogId, status, totalAmount, amountPaid, amountDue, currency, dueDate, releaseDate, notes)

    const preorderId = Number(preorderResult.lastInsertRowid)

    const insertItem = db.prepare(`
      INSERT INTO preorder_items (
        preorder_id, product_id, product_name, sku, quantity, unit_price, line_total, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const item of normalizedItems) {
      insertItem.run(preorderId, item.productId, item.productName, item.sku, item.quantity, item.unitPrice, item.lineTotal, item.notes)
    }

    if (amountPaid > 0) {
      db.prepare(`
        INSERT INTO preorder_payments (preorder_id, customer_id, amount, payment_method, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(preorderId, customerId, amountPaid, initialPaymentMethod, initialPaymentNotes)
    }

    db.prepare(`
      INSERT INTO preorder_status_history (preorder_id, old_status, new_status, notes)
      VALUES (?, NULL, ?, ?)
    `).run(preorderId, status, 'Creacion de preventa')

    return { preorderId, preorderNumber, totalAmount, amountPaid, amountDue, status }
  })

  return tx()
}

function buildAssignedPreorderFromCatalog(db, payload = {}) {
  const catalogId = Number(payload.catalogId || payload.preorderCatalogId || 0)
  const customerId = Number(payload.customerId || 0)
  const initialPaymentAmount = Math.max(n(payload.initialPaymentAmount, 0), 0)
  const initialPaymentMethod = normalizePaymentMethod(payload.initialPaymentMethod || 'cash')
  const notes = t(payload.notes)

  if (!catalogId) throw new Error('Debes seleccionar una preventa base.')
  if (!customerId) throw new Error('Debes seleccionar un cliente.')

  const catalogItem = db.prepare(`
    SELECT *
    FROM preorder_catalog
    WHERE id = ?
      AND COALESCE(active, 1) = 1
    LIMIT 1
  `).get(catalogId)

  if (!catalogItem) throw new Error('Preventa base no encontrada.')

  return {
    customerId,
    preorderCatalogId: catalogId,
    releaseDate: normalizeDate(payload.releaseDate || catalogItem.release_date),
    dueDate: normalizeDate(payload.dueDate || catalogItem.due_date),
    initialPaymentAmount,
    initialPaymentMethod,
    notes: notes || t(catalogItem.description),
    items: [
      {
        productId: catalogItem.product_id ? Number(catalogItem.product_id) : null,
        productName: t(catalogItem.product_name || catalogItem.name),
        sku: t(catalogItem.sku),
        quantity: Math.max(n(payload.quantity || catalogItem.quantity_default, 1), 0.01),
        unitPrice: Math.max(n(payload.unitPrice || catalogItem.unit_price, 0), 0),
        lineTotal: Math.max(n(payload.quantity || catalogItem.quantity_default, 1), 0.01) * Math.max(n(payload.unitPrice || catalogItem.unit_price, 0), 0),
        notes: t(catalogItem.description),
      },
    ],
  }
}

function buildEmailTemplate(type, context) {
  const baseInfo =
    `Preventa: ${context.preorderNumber}\n` +
    `Cliente: ${context.customerName}\n` +
    `Total: $${n(context.totalAmount).toFixed(2)}\n` +
    `Pagado: $${n(context.amountPaid).toFixed(2)}\n` +
    `Pendiente: $${n(context.amountDue).toFixed(2)}\n` +
    (context.releaseDate ? `Salida estimada: ${context.releaseDate}\n` : '')

  if (type === 'created') {
    return {
      subject: 'Tu preventa en Card Bastion ha sido registrada',
      body:
        `Hola ${context.customerName},\n\n` +
        `Tu preventa fue registrada correctamente.\n\n` +
        `${baseInfo}\n` +
        `Items:\n${context.itemsText}\n\n` +
        `Gracias por tu compra en Card Bastion.`,
    }
  }

  if (type === 'payment') {
    return {
      subject: 'Hemos registrado tu abono de preventa',
      body:
        `Hola ${context.customerName},\n\n` +
        `Registramos tu abono de $${n(context.paymentAmount).toFixed(2)} (${context.paymentMethod}).\n\n` +
        `${baseInfo}\n` +
        `Items:\n${context.itemsText}\n\n` +
        `Gracias por seguir tu preventa con Card Bastion.`,
    }
  }

  if (type === 'paid') {
    return {
      subject: 'Tu preventa en Card Bastion ha sido liquidada',
      body:
        `Hola ${context.customerName},\n\n` +
        `Tu preventa ya quedo liquidada.\n\n` +
        `${baseInfo}\n` +
        `Items:\n${context.itemsText}\n\n` +
        `Te contactaremos para coordinar entrega/surtido.`,
    }
  }

  if (type === 'fulfilled') {
    return {
      subject: 'Tu preventa ya fue surtida',
      body:
        `Hola ${context.customerName},\n\n` +
        `Tu preventa fue marcada como surtida.\n\n` +
        `${baseInfo}\n` +
        `Items:\n${context.itemsText}\n\n` +
        `Gracias por confiar en Card Bastion.`,
    }
  }

  return {
    subject: 'Actualizacion de preventa',
    body: `${baseInfo}\nItems:\n${context.itemsText}`,
  }
}

async function sendPreorderEmail(db, payload) {
  const preorderId = Number(payload.preorderId || 0)
  const type = t(payload.type)

  const preorder = db.prepare(`
    SELECT
      p.*,
      c.name as customer_name,
      c.email as customer_email
    FROM preorders p
    INNER JOIN customers c ON c.id = p.customer_id
    WHERE p.id = ?
    LIMIT 1
  `).get(preorderId)

  if (!preorder) {
    throw new Error('Preventa no encontrada para envio de correo.')
  }

  const items = db.prepare(`
    SELECT product_name, quantity, unit_price
    FROM preorder_items
    WHERE preorder_id = ?
    ORDER BY id ASC
  `).all(preorderId)

  const recipient = t(preorder.customer_email)
  const context = {
    preorderNumber: preorder.preorder_number,
    customerName: t(preorder.customer_name || 'Cliente'),
    totalAmount: n(preorder.total_amount),
    amountPaid: n(preorder.amount_paid),
    amountDue: n(preorder.amount_due),
    releaseDate: t(preorder.release_date),
    paymentAmount: n(payload.paymentAmount),
    paymentMethod: t(payload.paymentMethod || ''),
    itemsText: buildItemsText(
      (items || []).map((row) => ({
        productName: row.product_name,
        quantity: row.quantity,
        unitPrice: row.unit_price,
      }))
    ),
  }

  const template = buildEmailTemplate(type, context)
  const cfg = getEmailConfig(db)

  let status = 'sent'
  let errorMessage = ''

  if (!recipient) {
    status = 'failed'
    errorMessage = 'Cliente sin email registrado.'
  } else if (cfg.mode === 'webhook') {
    try {
      if (!cfg.webhookUrl) {
        throw new Error('Webhook de correo no configurado.')
      }

      const response = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.webhookToken ? { Authorization: `Bearer ${cfg.webhookToken}` } : {}),
        },
        body: JSON.stringify({
          from: cfg.from,
          to: recipient,
          subject: template.subject,
          body: template.body,
          entityType: 'preorder',
          entityId: preorderId,
          emailType: type,
        }),
      })

      if (!response.ok) {
        throw new Error(`Webhook respondio ${response.status}`)
      }
    } catch (error) {
      status = 'failed'
      errorMessage = error?.message || 'No se pudo enviar correo por webhook.'
    }
  }

  db.prepare(`
    INSERT INTO email_notifications_log (
      entity_type,
      entity_id,
      email_type,
      recipient_email,
      subject,
      body,
      status,
      error_message
    ) VALUES ('preorder', ?, ?, ?, ?, ?, ?, ?)
  `).run(preorderId, type, recipient || '(sin email)', template.subject, template.body, status, errorMessage || null)

  if (status === 'sent') {
    if (type === 'created') db.prepare(`UPDATE preorders SET email_sent_created = 1 WHERE id = ?`).run(preorderId)
    if (type === 'paid') db.prepare(`UPDATE preorders SET email_sent_paid = 1 WHERE id = ?`).run(preorderId)
    if (type === 'fulfilled') db.prepare(`UPDATE preorders SET email_sent_fulfilled = 1 WHERE id = ?`).run(preorderId)
  }

  return {
    success: status === 'sent',
    status,
    errorMessage,
    recipient,
    subject: template.subject,
  }
}

async function safeAutoEmail(db, payload) {
  try {
    await sendPreorderEmail(db, payload)
  } catch (error) {
    console.error('Error correo preventa:', error)
  }
}

function registerPreorderHandlers() {
  ipcMain.handle('preorders:listCatalog', (event, filters = {}) => {
    const db = getDb()
    const { whereSql, params } = buildCatalogFilter(filters, 'pc')

    const rows = db.prepare(`
      SELECT
        pc.*,
        COUNT(p.id) as assigned_count
      FROM preorder_catalog pc
      LEFT JOIN preorders p ON p.preorder_catalog_id = pc.id
      ${whereSql}
      GROUP BY pc.id
      ORDER BY date(pc.release_date, 'localtime') ASC, pc.name ASC, pc.id DESC
      LIMIT 800
    `).all(...params)

    return (rows || []).map((row) => ({
      ...mapCatalogRow(row),
      assignedCount: Number(row.assigned_count || 0),
    }))
  })

  ipcMain.handle('preorders:createCatalogItem', (event, payload = {}) => {
    const db = getDb()
    const catalogId = createCatalogItemRecord(db, payload)
    return { success: true, catalogId }
  })

  ipcMain.handle('preorders:updateCatalogItem', (event, payload = {}) => {
    const db = getDb()
    const catalogId = updateCatalogItemRecord(db, payload)
    return { success: true, catalogId }
  })

  ipcMain.handle('preorders:deleteCatalogItem', (event, payload = {}) => {
    const db = getDb()
    const catalogId = Number(payload.id || payload.catalogId || payload || 0)
    if (!catalogId) throw new Error('ID de preventa base invalido.')

    db.prepare(`
      UPDATE preorder_catalog
      SET active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(catalogId)

    return { success: true, catalogId }
  })

  ipcMain.handle('preorders:assignCatalogItem', async (event, payload = {}) => {
    const db = getDb()
    const preorderPayload = buildAssignedPreorderFromCatalog(db, payload)
    const result = createPreorderRecord(db, preorderPayload)
    const { preorderId, preorderNumber, totalAmount, amountPaid, amountDue, status } = result

    await safeAutoEmail(db, { preorderId, type: 'created' })
    if (status === 'paid') await safeAutoEmail(db, { preorderId, type: 'paid' })

    return { success: true, preorderId, preorderNumber, totalAmount, amountPaid, amountDue, status }
  })

  ipcMain.handle('preorders:list', (event, filters = {}) => {
    const db = getDb()
    const { whereSql, params } = buildListFilter(filters, 'p')

    const rows = db.prepare(`
      SELECT
        p.*,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        pc.code as catalog_code,
        pc.name as catalog_name,
        pc.category as catalog_category,
        pc.image as catalog_image,
        pc.description as catalog_description,
        (SELECT COUNT(*) FROM preorder_items pi WHERE pi.preorder_id = p.id) as items_count
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
      LEFT JOIN preorder_catalog pc ON pc.id = p.preorder_catalog_id
      ${whereSql}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 800
    `).all(...params)

    return (rows || []).map((row) => ({
      ...mapPreorderRow(row),
      itemsCount: Number(row.items_count || 0),
      isOverdue: Boolean(
        row.release_date &&
          n(row.amount_due) > 0 &&
          !['fulfilled', 'cancelled'].includes(String(row.status || '')) &&
          new Date(row.release_date).getTime() < Date.now()
      ),
    }))
  })

  ipcMain.handle('preorders:getById', (event, preorderId) => {
    const db = getDb()
    const id = Number(preorderId)
    if (!id) throw new Error('ID de preventa invalido.')

    const preorder = db.prepare(`
      SELECT
        p.*,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        pc.code as catalog_code,
        pc.name as catalog_name,
        pc.category as catalog_category,
        pc.image as catalog_image,
        pc.description as catalog_description
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
      LEFT JOIN preorder_catalog pc ON pc.id = p.preorder_catalog_id
      WHERE p.id = ?
      LIMIT 1
    `).get(id)
    if (!preorder) throw new Error('Preventa no encontrada.')

    const items = db.prepare(`
      SELECT id, preorder_id, product_id, product_name, sku, quantity, unit_price, line_total, notes, created_at
      FROM preorder_items
      WHERE preorder_id = ?
      ORDER BY id ASC
    `).all(id)

    const payments = db.prepare(`
      SELECT id, preorder_id, customer_id, amount, payment_method, notes, created_at
      FROM preorder_payments
      WHERE preorder_id = ?
      ORDER BY id ASC
    `).all(id)

    const statuses = db.prepare(`
      SELECT id, old_status, new_status, notes, created_at
      FROM preorder_status_history
      WHERE preorder_id = ?
      ORDER BY id ASC
    `).all(id)

    const emails = db.prepare(`
      SELECT id, email_type, recipient_email, subject, status, error_message, created_at
      FROM email_notifications_log
      WHERE entity_type = 'preorder' AND entity_id = ?
      ORDER BY id DESC
      LIMIT 50
    `).all(id)

    return {
      success: true,
      preorder: mapPreorderRow(preorder),
      items: (items || []).map((row) => ({
        id: Number(row.id),
        preorderId: Number(row.preorder_id),
        productId: row.product_id ? Number(row.product_id) : null,
        productName: String(row.product_name || ''),
        sku: String(row.sku || ''),
        quantity: n(row.quantity),
        unitPrice: n(row.unit_price),
        lineTotal: n(row.line_total),
        notes: String(row.notes || ''),
        createdAt: String(row.created_at || ''),
      })),
      payments: (payments || []).map((row) => ({
        id: Number(row.id),
        preorderId: Number(row.preorder_id),
        customerId: Number(row.customer_id),
        amount: n(row.amount),
        paymentMethod: String(row.payment_method || ''),
        notes: String(row.notes || ''),
        createdAt: String(row.created_at || ''),
      })),
      statusHistory: (statuses || []).map((row) => ({
        id: Number(row.id),
        oldStatus: String(row.old_status || ''),
        newStatus: String(row.new_status || ''),
        notes: String(row.notes || ''),
        createdAt: String(row.created_at || ''),
      })),
      emailLog: (emails || []).map((row) => ({
        id: Number(row.id),
        emailType: String(row.email_type || ''),
        recipientEmail: String(row.recipient_email || ''),
        subject: String(row.subject || ''),
        status: String(row.status || ''),
        errorMessage: String(row.error_message || ''),
        createdAt: String(row.created_at || ''),
      })),
    }
  })

  ipcMain.handle('preorders:create', async (event, payload = {}) => {
    const db = getDb()
    const result = createPreorderRecord(db, payload)
    const { preorderId, preorderNumber, totalAmount, amountPaid, amountDue, status } = result
    await safeAutoEmail(db, { preorderId, type: 'created' })
    if (status === 'paid') await safeAutoEmail(db, { preorderId, type: 'paid' })

    return { success: true, preorderId, preorderNumber, totalAmount, amountPaid, amountDue, status }
  })

  ipcMain.handle('preorders:update', (event, payload = {}) => {
    const db = getDb()
    const preorderId = Number(payload.id || payload.preorderId || 0)
    if (!preorderId) throw new Error('ID de preventa invalido.')

    const current = db.prepare(`SELECT * FROM preorders WHERE id = ? LIMIT 1`).get(preorderId)
    if (!current) throw new Error('Preventa no encontrada.')
    if (['fulfilled', 'cancelled'].includes(String(current.status || ''))) {
      throw new Error('No se puede editar una preventa cancelada o surtida.')
    }

    const items = Array.isArray(payload.items) ? payload.items : []
    if (!items.length) throw new Error('La preventa debe tener al menos un item.')

    const normalizedItems = items.map((item) => {
      const quantity = n(item.quantity, 0)
      const unitPrice = n(item.unitPrice, 0)
      const lineTotal = n(item.lineTotal, quantity * unitPrice)
      if (quantity <= 0) throw new Error('Cantidad invalida en item de preventa.')
      if (unitPrice < 0) throw new Error('Precio unitario invalido en item de preventa.')
      return {
        productId: item.productId ? Number(item.productId) : null,
        productName: t(item.productName || item.name),
        sku: t(item.sku),
        quantity,
        unitPrice,
        lineTotal,
        notes: t(item.notes),
      }
    })
    if (normalizedItems.some((row) => !row.productName)) throw new Error('Todos los items deben tener nombre de producto.')

    const totalAmount = normalizedItems.reduce((acc, row) => acc + n(row.lineTotal), 0)
    const amountPaid = n(current.amount_paid)
    const amountDue = Math.max(totalAmount - amountPaid, 0)
    const status = resolvePreorderStatus(amountPaid, amountDue)

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE preorders
        SET total_amount = ?, amount_due = ?, status = ?, due_date = ?, release_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(totalAmount, amountDue, status, normalizeDate(payload.dueDate), normalizeDate(payload.releaseDate), t(payload.notes), preorderId)

      db.prepare(`DELETE FROM preorder_items WHERE preorder_id = ?`).run(preorderId)
      const insertItem = db.prepare(`
        INSERT INTO preorder_items (
          preorder_id, product_id, product_name, sku, quantity, unit_price, line_total, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const item of normalizedItems) {
        insertItem.run(preorderId, item.productId, item.productName, item.sku, item.quantity, item.unitPrice, item.lineTotal, item.notes)
      }

      if (status !== String(current.status || '')) {
        db.prepare(`
          INSERT INTO preorder_status_history (preorder_id, old_status, new_status, notes)
          VALUES (?, ?, ?, ?)
        `).run(preorderId, String(current.status || ''), status, 'Actualizacion de preventa')
      }
    })
    tx()

    return { success: true, preorderId, totalAmount, amountPaid, amountDue, status }
  })
  ipcMain.handle('preorders:cancel', (event, payload = {}) => {
    const db = getDb()
    const preorderId = Number(payload.preorderId || payload.id || 0)
    const notes = t(payload.notes)
    if (!preorderId) throw new Error('ID de preventa invalido.')
    if (!notes) throw new Error('Debes capturar motivo de cancelacion.')

    const current = db.prepare(`SELECT id, status FROM preorders WHERE id = ? LIMIT 1`).get(preorderId)
    if (!current) throw new Error('Preventa no encontrada.')
    if (String(current.status || '') === 'cancelled') return { success: true, preorderId, status: 'cancelled' }

    const tx = db.transaction(() => {
      db.prepare(`UPDATE preorders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP, notes = ? WHERE id = ?`).run(notes, preorderId)
      db.prepare(`
        INSERT INTO preorder_status_history (preorder_id, old_status, new_status, notes)
        VALUES (?, ?, 'cancelled', ?)
      `).run(preorderId, String(current.status || ''), notes)
    })
    tx()
    return { success: true, preorderId, status: 'cancelled' }
  })

  ipcMain.handle('preorders:addPayment', async (event, payload = {}) => {
    const db = getDb()
    const preorderId = Number(payload.preorderId || 0)
    const amount = n(payload.amount, 0)
    const paymentMethod = t(payload.paymentMethod || 'cash', 'cash')
    const notes = t(payload.notes)

    if (!preorderId) throw new Error('ID de preventa invalido.')
    if (amount <= 0) throw new Error('El abono debe ser mayor a 0.')

    const current = db.prepare(`
      SELECT id, customer_id, status, total_amount, amount_paid, amount_due
      FROM preorders
      WHERE id = ?
      LIMIT 1
    `).get(preorderId)
    if (!current) throw new Error('Preventa no encontrada.')
    if (['cancelled', 'fulfilled'].includes(String(current.status || ''))) throw new Error('No se pueden registrar abonos en esta preventa.')
    if (amount > n(current.amount_due) + 0.01) throw new Error('El abono no puede ser mayor al saldo pendiente.')

    const nextPaid = n(current.amount_paid) + amount
    const nextDue = Math.max(n(current.total_amount) - nextPaid, 0)
    const nextStatus = resolvePreorderStatus(nextPaid, nextDue)

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO preorder_payments (preorder_id, customer_id, amount, payment_method, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(preorderId, Number(current.customer_id), amount, paymentMethod, notes || 'Abono preventa')

      db.prepare(`
        UPDATE preorders
        SET amount_paid = ?, amount_due = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextPaid, nextDue, nextStatus, preorderId)

      if (nextStatus !== String(current.status || '')) {
        db.prepare(`
          INSERT INTO preorder_status_history (preorder_id, old_status, new_status, notes)
          VALUES (?, ?, ?, ?)
        `).run(preorderId, String(current.status || ''), nextStatus, 'Cambio de estado por abono')
      }
    })
    tx()

    await safeAutoEmail(db, { preorderId, type: 'payment', paymentAmount: amount, paymentMethod })
    if (nextStatus === 'paid') await safeAutoEmail(db, { preorderId, type: 'paid' })

    return { success: true, preorderId, amount, amountPaid: nextPaid, amountDue: nextDue, status: nextStatus }
  })

  ipcMain.handle('preorders:markFulfilled', async (event, payload = {}) => {
    const db = getDb()
    const preorderId = Number(payload.preorderId || 0)
    const deductStock = Boolean(payload.deductStock)
    const createSale = Boolean(payload.createSale)
    const allowUnpaid = Boolean(payload.allowUnpaid)
    const notes = t(payload.notes || 'Preventa surtida')

    if (!preorderId) throw new Error('ID de preventa invalido.')

    const preorder = db.prepare(`SELECT * FROM preorders WHERE id = ? LIMIT 1`).get(preorderId)
    if (!preorder) throw new Error('Preventa no encontrada.')
    if (String(preorder.status || '') === 'cancelled') throw new Error('No se puede surtir una preventa cancelada.')
    if (!allowUnpaid && n(preorder.amount_due) > 0) throw new Error('La preventa debe estar liquidada antes de surtir.')

    const items = db.prepare(`
      SELECT id, product_id, product_name, sku, quantity, unit_price, line_total
      FROM preorder_items
      WHERE preorder_id = ?
      ORDER BY id ASC
    `).all(preorderId)
    if (!items.length) throw new Error('La preventa no tiene items.')

    const tx = db.transaction(() => {
      let linkedSaleId = preorder.linked_sale_id ? Number(preorder.linked_sale_id) : null

      if (deductStock) {
        for (const item of items) {
          const productId = item.product_id ? Number(item.product_id) : 0
          const qty = n(item.quantity)
          if (!productId || qty <= 0) continue

          const product = db.prepare(`SELECT id, name, stock FROM products WHERE id = ? LIMIT 1`).get(productId)
          if (!product) throw new Error(`Producto no encontrado para surtir: ${item.product_name}`)
          if (n(product.stock) < qty) throw new Error(`Stock insuficiente para ${product.name}. Disponible: ${n(product.stock)}`)

          const stockBefore = n(product.stock)
          const stockAfter = stockBefore - qty
          db.prepare(`UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(stockAfter, productId)
          db.prepare(`
            INSERT INTO inventory_movements (
              product_id, type, quantity, stock_before, stock_after, reference_type, reference_id, notes
            ) VALUES (?, 'sale', ?, ?, ?, 'preorder_fulfilled', ?, ?)
          `).run(productId, qty, stockBefore, stockAfter, preorderId, `Surtido preventa ${preorder.preorder_number}`)
        }
      }

      if (createSale && !linkedSaleId) {
        const saleInsert = db.prepare(`
          INSERT INTO sales (
            folio, subtotal, discount, total, payment_method, cash_received, change_given, status,
            customer_id, credit_used, payment_status, amount_paid, amount_due, payment_notes, preorder_id
          ) VALUES (?, 0, 0, 0, 'preorder', 0, 0, 'completed', ?, 0, 'paid', 0, 0, ?, ?)
        `).run(
          `${String(preorder.preorder_number || 'PRE')}-FUL`,
          Number(preorder.customer_id),
          `Venta de entrega para preventa ${preorder.preorder_number}`,
          preorderId
        )
        linkedSaleId = Number(saleInsert.lastInsertRowid)

        const insertSaleItem = db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, sku, product_name, qty, unit_price, unit_cost, line_total)
          VALUES (?, ?, ?, ?, ?, ?, 0, 0)
        `)
        for (const item of items) {
          insertSaleItem.run(linkedSaleId, item.product_id ? Number(item.product_id) : null, t(item.sku), t(item.product_name), n(item.quantity), 0)
        }
      }

      db.prepare(`
        UPDATE preorders
        SET status = 'fulfilled', linked_sale_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(linkedSaleId, preorderId)

      db.prepare(`
        INSERT INTO preorder_status_history (preorder_id, old_status, new_status, notes)
        VALUES (?, ?, 'fulfilled', ?)
      `).run(preorderId, String(preorder.status || ''), notes)
    })
    tx()

    await safeAutoEmail(db, { preorderId, type: 'fulfilled' })
    return { success: true, preorderId, status: 'fulfilled' }
  })

  ipcMain.handle('preorders:reopen', (event, payload = {}) => {
    const db = getDb()
    const preorderId = Number(payload.preorderId || 0)
    const notes = t(payload.notes || 'Reapertura manual')
    if (!preorderId) throw new Error('ID de preventa invalido.')

    const current = db.prepare(`
      SELECT id, status, amount_paid, amount_due
      FROM preorders
      WHERE id = ?
      LIMIT 1
    `).get(preorderId)
    if (!current) throw new Error('Preventa no encontrada.')

    const nextStatus = resolvePreorderStatus(n(current.amount_paid), n(current.amount_due))
    db.prepare(`UPDATE preorders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(nextStatus, preorderId)
    db.prepare(`
      INSERT INTO preorder_status_history (preorder_id, old_status, new_status, notes)
      VALUES (?, ?, ?, ?)
    `).run(preorderId, String(current.status || ''), nextStatus, notes)

    return { success: true, preorderId, status: nextStatus }
  })

  ipcMain.handle('preorders:importExcel', async () => {
    const db = getDb()

    const fileResult = await dialog.showOpenDialog({
      title: 'Seleccionar archivo de catalogo de preventas',
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }],
    })

    if (fileResult.canceled || !fileResult.filePaths?.length) {
      return { success: false, canceled: true }
    }

    const filePath = fileResult.filePaths[0]
    const workbook = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    let created = 0
    let updated = 0
    let skipped = 0
    const errors = []

    const transaction = db.transaction(() => {
      rows.forEach((row, index) => {
        try {
          const product = findImportProduct(db, row)
          const payload = {
            code: normalizePreorderNumber(row.code || row.codigo || row.preorder_code || row.preorderCode || row.nombre),
            name: t(row.name || row.nombre || row.preorder_name || row.preorderName || product?.name),
            category: t(row.category || row.categoria || product?.category),
            description: t(row.description || row.descripcion || row.notes || row.notas),
            productId: product?.id ? Number(product.id) : null,
            productName: t(row.product_name || row.productName || product?.name),
            sku: t(row.product_sku || row.sku || product?.sku),
            image: t(row.image || row.imagen || product?.image),
            releaseDate: normalizeDate(row.release_date || row.releaseDate || row.fecha_salida),
            dueDate: normalizeDate(row.due_date || row.dueDate || row.fecha_limite),
            unitPrice: n(row.unit_price || row.unitPrice || row.precio || row.price, 0),
            quantityDefault: n(row.quantity_default || row.quantityDefault || row.cantidad || row.quantity, 1),
            currency: t(row.currency || row.moneda || 'MXN', 'MXN'),
          }

          const existing = payload.code
            ? db.prepare(`SELECT id FROM preorder_catalog WHERE code = ? LIMIT 1`).get(payload.code)
            : null

          if (existing) {
            updateCatalogItemRecord(db, { ...payload, id: Number(existing.id), active: true })
            updated += 1
          } else {
            createCatalogItemRecord(db, payload)
            created += 1
          }
        } catch (error) {
          skipped += 1
          errors.push({
            preorderNumber: t(row.code || row.codigo || row.name || row.nombre || `Fila ${index + 1}`),
            message: error?.message || 'Error al importar preventa base.',
          })
        }
      })
    })

    transaction()

    return {
      success: true,
      filePath,
      created,
      updated,
      skipped,
      totalRows: rows.length,
      totalPreorders: rows.length,
      errors: errors.slice(0, 50),
    }
  })

  ipcMain.handle('preorders:exportTemplate', async () => {
    const templateRows = [
      {
        code: 'SWQ-001',
        name: 'Pokemon Scarlet & Violet Journey Together ETB',
        category: 'Pokemon',
        description: 'Caja de preorden con fecha estimada de entrega.',
        product_sku: 'PKM-ETB-JT-001',
        product_name: 'Pokemon Journey Together ETB',
        image: '',
        release_date: '2026-03-30',
        due_date: '',
        unit_price: 1299,
        quantity_default: 1,
        currency: 'MXN',
      },
      {
        code: 'MTG-002',
        name: 'Magic Final Fantasy Collector Booster',
        category: 'Magic',
        description: 'Preventa especial limitada.',
        product_sku: '',
        product_name: 'Magic Final Fantasy Collector Booster',
        image: '',
        release_date: '2026-04-05',
        due_date: '',
        unit_price: 350,
        quantity_default: 1,
        currency: 'MXN',
      },
      {
        code: 'YGO-003',
        name: 'Yu-Gi-Oh Structure Deck Import',
        category: 'Yu-Gi-Oh',
        description: 'Incluye imagen opcional y categoria.',
        product_sku: '',
        product_name: 'Yu-Gi-Oh Structure Deck Import',
        image: '',
        release_date: '2026-04-12',
        due_date: '',
        unit_price: 350,
        quantity_default: 1,
        currency: 'MXN',
      },
    ]

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(templateRows)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Preventas')

    const saveResult = await dialog.showSaveDialog({
      title: 'Guardar plantilla de catalogo de preventas',
      defaultPath: path.join(process.cwd(), 'plantilla_catalogo_preventas_cardbastion.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true }
    }

    XLSX.writeFile(workbook, saveResult.filePath)

    return {
      success: true,
      filePath: saveResult.filePath,
    }
  })

  ipcMain.handle('preorders:exportPurchaseList', async () => {
    const db = getDb()

    const rows = db.prepare(`
      SELECT
        COALESCE(pc.id, 0) as catalog_id,
        COALESCE(pc.code, '') as catalog_code,
        COALESCE(pc.name, p.preorder_number) as preorder_name,
        COALESCE(pc.category, '') as category,
        p.id as preorder_id,
        p.preorder_number,
        COALESCE(c.name, '') as customer_name,
        COALESCE(c.phone, '') as customer_phone,
        COALESCE(c.email, '') as customer_email,
        COALESCE(p.status, '') as status,
        COALESCE(p.release_date, '') as release_date,
        COALESCE(p.amount_due, 0) as amount_due,
        COALESCE(p.total_amount, 0) as total_amount,
        COALESCE(pi.quantity, 0) as quantity,
        COALESCE(pi.product_name, COALESCE(pc.product_name, '')) as product_name,
        COALESCE(pi.sku, COALESCE(pc.sku, '')) as sku
      FROM preorders p
      LEFT JOIN preorder_catalog pc ON pc.id = p.preorder_catalog_id
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN preorder_items pi ON pi.preorder_id = p.id
      WHERE p.status NOT IN ('cancelled')
      ORDER BY COALESCE(pc.name, p.preorder_number) ASC, c.name ASC, p.id ASC
    `).all()

    const summaryMap = new Map()
    for (const row of rows || []) {
      const key = `${row.catalog_id}-${row.preorder_name}`
      const existing = summaryMap.get(key) || {
        catalogId: Number(row.catalog_id || 0) || '',
        catalogCode: String(row.catalog_code || ''),
        preorderName: String(row.preorder_name || ''),
        category: String(row.category || ''),
        productName: String(row.product_name || ''),
        sku: String(row.sku || ''),
        totalReservedQty: 0,
        totalPreorders: 0,
        customers: [],
      }

      existing.totalReservedQty += Number(row.quantity || 0)
      existing.totalPreorders += 1
      existing.customers.push(String(row.customer_name || 'Sin cliente'))
      summaryMap.set(key, existing)
    }

    const summaryRows = Array.from(summaryMap.values()).map((row) => ({
      catalog_id: row.catalogId,
      codigo: row.catalogCode,
      preventa: row.preorderName,
      categoria: row.category,
      producto: row.productName,
      sku: row.sku,
      cantidad_reservada: row.totalReservedQty,
      total_preventas: row.totalPreorders,
      clientes: row.customers.join(', '),
    }))

    const detailRows = (rows || []).map((row) => ({
      preorder_id: Number(row.preorder_id || 0),
      preorder_number: String(row.preorder_number || ''),
      catalog_id: Number(row.catalog_id || 0) || '',
      catalog_code: String(row.catalog_code || ''),
      preorder_name: String(row.preorder_name || ''),
      category: String(row.category || ''),
      customer_name: String(row.customer_name || ''),
      customer_phone: String(row.customer_phone || ''),
      customer_email: String(row.customer_email || ''),
      status: String(row.status || ''),
      release_date: String(row.release_date || ''),
      product_name: String(row.product_name || ''),
      sku: String(row.sku || ''),
      quantity: Number(row.quantity || 0),
      total_amount: Number(row.total_amount || 0),
      amount_due: Number(row.amount_due || 0),
    }))

    const saveResult = await dialog.showSaveDialog({
      title: 'Guardar lista de compra de preventas',
      defaultPath: path.join(process.cwd(), 'lista_compra_preventas.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true }
    }

    const workbook = XLSX.utils.book_new()
    appendSheet(workbook, 'ResumenCompra', summaryRows)
    appendSheet(workbook, 'DetalleClientes', detailRows)
    XLSX.writeFile(workbook, saveResult.filePath)

    return {
      success: true,
      filePath: saveResult.filePath,
      rows: detailRows.length,
      groups: summaryRows.length,
    }
  })

  ipcMain.handle('preorders:getByCustomer', (event, customerId) => {
    const db = getDb()
    const id = Number(customerId)
    if (!id) throw new Error('ID de cliente invalido.')

    const rows = db.prepare(`
      SELECT
        p.*,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        pc.code as catalog_code,
        pc.name as catalog_name,
        pc.category as catalog_category,
        pc.image as catalog_image,
        pc.description as catalog_description
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
      LEFT JOIN preorder_catalog pc ON pc.id = p.preorder_catalog_id
      WHERE p.customer_id = ?
      ORDER BY p.created_at DESC
    `).all(id)

    return { success: true, customerId: id, preorders: (rows || []).map(mapPreorderRow) }
  })

  ipcMain.handle('preorders:getSummary', () => {
    const db = getDb()

    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_preorders,
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active_preorders,
        COALESCE(SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END), 0) as partial_preorders,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) as paid_preorders,
        COALESCE(SUM(CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END), 0) as fulfilled_preorders,
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled_preorders,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(amount_paid), 0) as total_paid,
        COALESCE(SUM(amount_due), 0) as total_due,
        COALESCE(SUM(CASE WHEN amount_due > 0 AND release_date IS NOT NULL AND datetime(release_date) < datetime('now') AND status NOT IN ('fulfilled', 'cancelled') THEN 1 ELSE 0 END), 0) as overdue_preorders
      FROM preorders
    `).get()

    const paymentsToday = db.prepare(`
      SELECT
        COUNT(*) as total_payments,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0) as cash_amount,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END), 0) as card_amount,
        COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount ELSE 0 END), 0) as transfer_amount
      FROM preorder_payments
      WHERE date(created_at, 'localtime') = date('now', 'localtime')
    `).get()

    const topCustomers = db.prepare(`
      SELECT c.id as customer_id, c.name as customer_name, COUNT(p.id) as preorder_count, COALESCE(SUM(p.amount_due), 0) as pending_balance
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
      GROUP BY c.id, c.name
      ORDER BY pending_balance DESC, preorder_count DESC
      LIMIT 20
    `).all()

    const byProduct = db.prepare(`
      SELECT pi.product_name, COALESCE(pi.sku, '') as sku, COALESCE(SUM(pi.quantity), 0) as total_qty, COALESCE(SUM(pi.line_total), 0) as total_amount
      FROM preorder_items pi
      INNER JOIN preorders p ON p.id = pi.preorder_id
      WHERE p.status != 'cancelled'
      GROUP BY pi.product_name, COALESCE(pi.sku, '')
      ORDER BY total_qty DESC, total_amount DESC
      LIMIT 30
    `).all()

    return {
      success: true,
      summary: {
        totalPreorders: n(summary?.total_preorders),
        activePreorders: n(summary?.active_preorders),
        partialPreorders: n(summary?.partial_preorders),
        paidPreorders: n(summary?.paid_preorders),
        fulfilledPreorders: n(summary?.fulfilled_preorders),
        cancelledPreorders: n(summary?.cancelled_preorders),
        totalAmount: n(summary?.total_amount),
        totalPaid: n(summary?.total_paid),
        totalDue: n(summary?.total_due),
        overduePreorders: n(summary?.overdue_preorders),
      },
      paymentsToday: {
        totalPayments: n(paymentsToday?.total_payments),
        totalAmount: n(paymentsToday?.total_amount),
        cashAmount: n(paymentsToday?.cash_amount),
        cardAmount: n(paymentsToday?.card_amount),
        transferAmount: n(paymentsToday?.transfer_amount),
      },
      byCustomer: (topCustomers || []).map((row) => ({
        customerId: Number(row.customer_id),
        customerName: String(row.customer_name || ''),
        preorderCount: n(row.preorder_count),
        pendingBalance: n(row.pending_balance),
      })),
      byProduct: (byProduct || []).map((row) => ({
        productName: String(row.product_name || ''),
        sku: String(row.sku || ''),
        totalQty: n(row.total_qty),
        totalAmount: n(row.total_amount),
      })),
    }
  })

  ipcMain.handle('preorders:getPending', () => {
    const db = getDb()
    return db.prepare(`
      SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
      WHERE p.amount_due > 0 AND p.status NOT IN ('cancelled', 'fulfilled')
      ORDER BY p.created_at DESC
    `).all().map(mapPreorderRow)
  })

  ipcMain.handle('preorders:getPaid', () => {
    const db = getDb()
    return db.prepare(`
      SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
      WHERE p.amount_due <= 0 AND p.status IN ('paid', 'fulfilled')
      ORDER BY p.created_at DESC
    `).all().map(mapPreorderRow)
  })

  ipcMain.handle('preorders:getOverdue', () => {
    const db = getDb()
    return db.prepare(`
      SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
      WHERE p.amount_due > 0
        AND p.release_date IS NOT NULL
        AND datetime(p.release_date) < datetime('now')
        AND p.status NOT IN ('cancelled', 'fulfilled')
      ORDER BY p.release_date ASC
    `).all().map(mapPreorderRow)
  })

  ipcMain.handle('preorders:sendCreatedEmail', async (event, payload = {}) => {
    const db = getDb()
    return sendPreorderEmail(db, { preorderId: Number(payload.preorderId || payload.id || 0), type: 'created' })
  })

  ipcMain.handle('preorders:sendPaymentEmail', async (event, payload = {}) => {
    const db = getDb()
    return sendPreorderEmail(db, {
      preorderId: Number(payload.preorderId || payload.id || 0),
      type: 'payment',
      paymentAmount: n(payload.paymentAmount),
      paymentMethod: t(payload.paymentMethod),
    })
  })

  ipcMain.handle('preorders:sendPaidEmail', async (event, payload = {}) => {
    const db = getDb()
    return sendPreorderEmail(db, { preorderId: Number(payload.preorderId || payload.id || 0), type: 'paid' })
  })
}

module.exports = { registerPreorderHandlers }
