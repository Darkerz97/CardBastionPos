const { ipcMain } = require('electron')
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
      lower(c.name) LIKE ?
    )`)
    params.push(`%${query}%`, `%${query}%`)
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
  ipcMain.handle('preorders:list', (event, filters = {}) => {
    const db = getDb()
    const { whereSql, params } = buildListFilter(filters, 'p')

    const rows = db.prepare(`
      SELECT
        p.*,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        (SELECT COUNT(*) FROM preorder_items pi WHERE pi.preorder_id = p.id) as items_count
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
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
      SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
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
    const customerId = Number(payload.customerId || 0)
    const items = Array.isArray(payload.items) ? payload.items : []
    const notes = t(payload.notes)
    const dueDate = normalizeDate(payload.dueDate)
    const releaseDate = normalizeDate(payload.releaseDate)
    const currency = t(payload.currency || 'MXN', 'MXN')
    const initialPaymentAmount = Math.max(n(payload.initialPaymentAmount, 0), 0)
    const initialPaymentMethod = t(payload.initialPaymentMethod || 'cash', 'cash')
    const initialPaymentNotes = t(payload.initialPaymentNotes || 'Abono inicial preventa')
    const requestedStatus = t(payload.status)

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
    const preorderNumber = generatePreorderNumber()

    const tx = db.transaction(() => {
      const preorderResult = db.prepare(`
        INSERT INTO preorders (
          preorder_number, customer_id, status, total_amount, amount_paid, amount_due,
          currency, due_date, release_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(preorderNumber, customerId, status, totalAmount, amountPaid, amountDue, currency, dueDate, releaseDate, notes)

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

      return preorderId
    })

    const preorderId = tx()
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

  ipcMain.handle('preorders:getByCustomer', (event, customerId) => {
    const db = getDb()
    const id = Number(customerId)
    if (!id) throw new Error('ID de cliente invalido.')

    const rows = db.prepare(`
      SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
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
