const { logAudit } = require('../audit.cjs')
const { enqueueAndFlushServerSync, enqueueServerSync } = require('./server-sync.cjs')

function getMexicoDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

function generateFolio() {
  const now = new Date()
  const parts = getMexicoDateParts(now)
  const yyyy = parts.year
  const mm = parts.month
  const dd = parts.day
  const hh = parts.hour
  const mi = parts.minute
  const ss = parts.second
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  const nonce = Math.floor(Math.random() * 1000).toString().padStart(3, '0')

  return `CB-${yyyy}${mm}${dd}-${hh}${mi}${ss}${ms}${nonce}`
}

function isDuplicateSaleFolioError(error) {
  return String(error?.message || '').includes('UNIQUE constraint failed: sales.folio')
}

function resolvePaymentStatus(amountPaid, amountDue) {
  if (Number(amountDue || 0) <= 0) return 'paid'
  if (Number(amountPaid || 0) <= 0) return 'pending'
  return 'partial'
}

function validateSalePayload(payload = {}) {
  const {
    items = [],
    subtotal = 0,
    discount = 0,
    total = 0,
    payment_method = 'cash',
    cash_received = 0,
    customerId = null,
    credit_used = 0,
    amount_paid,
    due_date = null,
    payment_notes = '',
  } = payload

  if (!items.length) {
    throw new Error('La venta no contiene productos.')
  }

  const subtotalValue = Number(subtotal || 0)
  const discountValue = Number(discount || 0)
  const totalValue = Number(total || 0)
  const creditToUse = Number(credit_used || 0)
  const baseTotal = Math.max(subtotalValue - discountValue, 0)
  const expectedTotal = Math.max(baseTotal - creditToUse, 0)

  if (creditToUse < 0) {
    throw new Error('El credito usado no puede ser menor a 0.')
  }

  if (Math.abs(totalValue - expectedTotal) > 0.01) {
    throw new Error('Total inconsistente con subtotal, descuento y credito aplicado.')
  }

  const hasAmountPaid = amount_paid !== null && amount_paid !== undefined && amount_paid !== ''
  const amountPaidValue = hasAmountPaid ? Number(amount_paid || 0) : Number(totalValue || 0)

  if (!Number.isFinite(amountPaidValue) || amountPaidValue < 0) {
    throw new Error('El monto pagado inicial es invalido.')
  }

  if (amountPaidValue > totalValue + 0.01) {
    throw new Error('El monto pagado no puede ser mayor al total neto a cobrar.')
  }

  const amountDueValue = Math.max(totalValue - amountPaidValue, 0)
  const paymentStatusValue = resolvePaymentStatus(amountPaidValue, amountDueValue)

  if ((paymentStatusValue === 'partial' || paymentStatusValue === 'pending') && !customerId) {
    throw new Error('Las ventas parciales o pendientes deben tener un cliente seleccionado.')
  }

  if (creditToUse > 0 && !customerId) {
    throw new Error('No puedes usar credito sin seleccionar un cliente.')
  }

  const paymentMethodValue = String(payment_method || 'cash')
  const cashReceivedValue = paymentMethodValue === 'cash' ? Number(cash_received || 0) : 0

  if (paymentMethodValue === 'cash' && amountPaidValue > 0 && cashReceivedValue < amountPaidValue) {
    throw new Error('El monto recibido en efectivo no puede ser menor al pago inicial.')
  }

  const changeGivenValue = paymentMethodValue === 'cash'
    ? Math.max(cashReceivedValue - amountPaidValue, 0)
    : 0

  return {
    items,
    subtotalValue,
    discountValue,
    totalValue,
    paymentMethodValue,
    cashReceivedValue,
    changeGivenValue,
    customerId: customerId ? Number(customerId) : null,
    creditToUse,
    amountPaidValue,
    amountDueValue,
    paymentStatusValue,
    dueDateValue: due_date || null,
    paymentNotesValue: String(payment_notes || ''),
  }
}

function getSaleSnapshot(db, saleId) {
  return db.prepare(`
    SELECT
      s.*,
      c.name AS customer_name
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.id = ?
    LIMIT 1
  `).get(Number(saleId))
}

function getSaleItems(db, saleId) {
  return db.prepare(`
    SELECT *
    FROM sale_items
    WHERE sale_id = ?
    ORDER BY id ASC
  `).all(Number(saleId))
}

function ensureSaleCanBeMutated(db, saleId) {
  const extraPayments = db.prepare(`
    SELECT COUNT(*) as total
    FROM sale_payments
    WHERE sale_id = ?
      AND COALESCE(is_initial, 0) = 0
  `).get(Number(saleId))

  if (Number(extraPayments?.total || 0) > 0) {
    throw new Error('La venta ya tiene abonos posteriores y no se puede editar o eliminar.')
  }
}

function adjustCustomerCredit(db, customerId, amount, saleId, folio, userId, type, reasonPrefix) {
  if (!customerId || Number(amount || 0) <= 0) return

  const customer = db.prepare(`
    SELECT id, store_credit
    FROM customers
    WHERE id = ?
    LIMIT 1
  `).get(Number(customerId))

  if (!customer) {
    throw new Error('Cliente no encontrado para ajustar credito.')
  }

  const currentBalance = Number(customer.store_credit || 0)
  const newBalance = type === 'use'
    ? currentBalance - Number(amount || 0)
    : currentBalance + Number(amount || 0)

  if (newBalance < -0.01) {
    throw new Error('El cliente no tiene suficiente credito disponible.')
  }

  db.prepare(`
    UPDATE customers
    SET
      store_credit = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newBalance, Number(customerId))

  db.prepare(`
    INSERT INTO customer_credit_movements (
      customer_id,
      type,
      amount,
      balance_after,
      reason,
      reference_type,
      reference_id,
      user_id
    ) VALUES (?, ?, ?, ?, ?, 'sale', ?, ?)
  `).run(
    Number(customerId),
    type,
    Number(amount || 0),
    newBalance,
    `${reasonPrefix} ${folio}`,
    Number(saleId),
    userId || null
  )
}

function applySaleItems(db, saleId, folio, items, userId) {
  const insertSaleItem = db.prepare(`
    INSERT INTO sale_items (
      sale_id, product_id, sku, product_name, qty, unit_price, unit_cost, line_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const updateStockWithValue = db.prepare(`
    UPDATE products
    SET stock = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)

  const insertInventoryMovement = db.prepare(`
    INSERT INTO inventory_movements (
      product_id,
      type,
      quantity,
      stock_before,
      stock_after,
      reference_type,
      reference_id,
      notes,
      user_id
    ) VALUES (?, 'sale', ?, ?, ?, 'sale', ?, ?, ?)
  `)

  for (const item of items) {
    const productId = Number(item.id || item.product_id || 0)
    const qty = Number(item.qty || 0)

    if (!productId || qty <= 0) {
      throw new Error('La venta contiene un item invalido.')
    }

    const currentProduct = db.prepare(`
      SELECT id, name, stock, cost
      FROM products
      WHERE id = ?
      LIMIT 1
    `).get(productId)

    if (!currentProduct) {
      throw new Error(`El producto ${item.name || productId} ya no existe.`)
    }

    if (Number(currentProduct.stock || 0) < qty) {
      throw new Error(`Stock insuficiente para ${currentProduct.name}.`)
    }

    const stockBefore = Number(currentProduct.stock || 0)
    const stockAfter = stockBefore - qty

    insertSaleItem.run(
      saleId,
      productId,
      String(item.sku || ''),
      String(item.name || item.product_name || currentProduct.name || ''),
      qty,
      Number(item.price || item.unit_price || 0),
      Number(currentProduct.cost || 0),
      Number(item.lineTotal || item.line_total || 0)
    )

    updateStockWithValue.run(stockAfter, productId)

    insertInventoryMovement.run(
      productId,
      qty,
      stockBefore,
      stockAfter,
      saleId,
      `Venta ${folio}`,
      userId || null
    )
  }
}

function getProductSyncSnapshot(db, productId) {
  if (!productId) return null

  return db.prepare(`
    SELECT
      id,
      COALESCE(remote_id, '') AS remote_id,
      COALESCE(sku, '') AS sku,
      COALESCE(barcode, '') AS barcode,
      name,
      COALESCE(category, '') AS category,
      price,
      cost,
      stock,
      active,
      COALESCE(product_type, 'normal') AS product_type,
      COALESCE(game, '') AS game,
      COALESCE(card_name, name) AS card_name,
      COALESCE(set_name, '') AS set_name,
      COALESCE(set_code, '') AS set_code,
      COALESCE(collector_number, '') AS collector_number,
      COALESCE(finish, '') AS finish,
      COALESCE(language, '') AS language,
      COALESCE(card_condition, '') AS card_condition
    FROM products
    WHERE id = ?
    LIMIT 1
  `).get(Number(productId))
}

function enqueueMissingProductsForSync(db, items = [], actor = null) {
  const alreadyQueued = new Set()
  const hasPendingProductEvent = db.prepare(`
    SELECT id
    FROM server_sync_queue
    WHERE entity_type = 'product'
      AND entity_id = ?
      AND status IN ('pending', 'failed', 'sending')
    LIMIT 1
  `)

  for (const item of items) {
    const productId = Number(item.id || item.product_id || 0)
    if (!productId || alreadyQueued.has(productId)) continue

    alreadyQueued.add(productId)
    const product = getProductSyncSnapshot(db, productId)

    if (!product) continue
    if (String(product.remote_id || '').trim()) continue
    if (hasPendingProductEvent.get(productId)) continue

    enqueueServerSync(db, {
      eventType: 'product.create',
      entityType: 'product',
      entityId: productId,
      action: 'create',
      payload: {
        actor: actor || null,
        product,
        source: 'sale_preflight',
      },
    })
  }
}

function revertSaleEffects(db, sale, items, userId, notePrefix = 'Reversion de venta') {
  const updateStockWithValue = db.prepare(`
    UPDATE products
    SET stock = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)

  const insertInventoryMovement = db.prepare(`
    INSERT INTO inventory_movements (
      product_id,
      type,
      quantity,
      stock_before,
      stock_after,
      reference_type,
      reference_id,
      notes,
      user_id
    ) VALUES (?, 'sale_revert', ?, ?, ?, 'sale', ?, ?, ?)
  `)

  for (const item of items) {
    if (!item.product_id) continue

    const product = db.prepare(`
      SELECT id, stock, name
      FROM products
      WHERE id = ?
      LIMIT 1
    `).get(Number(item.product_id))

    if (!product) continue

    const stockBefore = Number(product.stock || 0)
    const qty = Number(item.qty || 0)
    const stockAfter = stockBefore + qty

    updateStockWithValue.run(stockAfter, Number(item.product_id))
    insertInventoryMovement.run(
      Number(item.product_id),
      qty,
      stockBefore,
      stockAfter,
      Number(sale.id),
      `${notePrefix} ${sale.folio}`,
      userId || null
    )
  }

  if (Number(sale.credit_used || 0) > 0 && sale.customer_id) {
    adjustCustomerCredit(
      db,
      Number(sale.customer_id),
      Number(sale.credit_used || 0),
      Number(sale.id),
      String(sale.folio || ''),
      userId,
      'refund',
      'Reversion de credito en venta'
    )
  }

  db.prepare(`
    DELETE FROM sale_payments
    WHERE sale_id = ?
      AND COALESCE(is_initial, 0) = 1
  `).run(Number(sale.id))
}

function fetchSaleResult(db, saleId) {
  const savedSale = db.prepare(`
    SELECT
      id,
      folio,
      subtotal,
      discount,
      total,
      payment_method,
      cash_received,
      change_given,
      customer_id,
      created_at,
      credit_used,
      payment_status,
      amount_paid,
      amount_due,
      due_date,
      payment_notes
    FROM sales
    WHERE id = ?
  `).get(Number(saleId))

  const savedItems = db.prepare(`
    SELECT
      id,
      sale_id,
      product_id,
      sku,
      product_name,
      qty,
      unit_price,
      line_total
    FROM sale_items
    WHERE sale_id = ?
    ORDER BY id ASC
  `).all(Number(saleId))

  return {
    success: true,
    saleId: Number(savedSale.id),
    folio: String(savedSale.folio || ''),
    payment_status: String(savedSale.payment_status || ''),
    amount_paid: Number(savedSale.amount_paid || 0),
    amount_due: Number(savedSale.amount_due || 0),
    sale: {
      id: Number(savedSale.id),
      folio: String(savedSale.folio || ''),
      subtotal: Number(savedSale.subtotal || 0),
      discount: Number(savedSale.discount || 0),
      total: Number(savedSale.total || 0),
      total_before_credit: Number(savedSale.total || 0) + Number(savedSale.credit_used || 0),
      payment_method: String(savedSale.payment_method || ''),
      cash_received: Number(savedSale.cash_received || 0),
      change_given: Number(savedSale.change_given || 0),
      customer_id: savedSale.customer_id ? Number(savedSale.customer_id) : null,
      credit_used: Number(savedSale.credit_used || 0),
      payment_status: String(savedSale.payment_status || ''),
      amount_paid: Number(savedSale.amount_paid || 0),
      amount_due: Number(savedSale.amount_due || 0),
      due_date: String(savedSale.due_date || ''),
      payment_notes: String(savedSale.payment_notes || ''),
      created_at: String(savedSale.created_at || ''),
    },
    items: (savedItems || []).map((item) => ({
      id: Number(item.id),
      sale_id: Number(item.sale_id),
      product_id: Number(item.product_id || 0),
      sku: String(item.sku || ''),
      product_name: String(item.product_name || ''),
      qty: Number(item.qty || 0),
      unit_price: Number(item.unit_price || 0),
      line_total: Number(item.line_total || 0),
    })),
  }
}

async function syncSaleChange(db, action, saleResult, actor, extra = {}) {
  if (!saleResult?.sale) return

  try {
    await enqueueAndFlushServerSync(db, {
      eventType: `sale.${action}`,
      entityType: 'sale',
      entityId: saleResult.sale.id,
      action,
      payload: {
        actor: actor || null,
        sale: saleResult.sale,
        items: saleResult.items || [],
        ...extra,
      },
    })
  } catch (error) {
    console.error(`No se pudo sincronizar la venta ${saleResult.sale.folio}:`, error)
  }
}

async function createSaleRecord(db, payload, actor) {
  const openSession = db.prepare(`
    SELECT id
    FROM cash_sessions
    WHERE status = 'open'
      AND deleted_at IS NULL
    LIMIT 1
  `).get()

  if (!openSession) {
    throw new Error('No hay una caja abierta. Debes abrir caja antes de vender.')
  }

  const values = validateSalePayload(payload)
  enqueueMissingProductsForSync(db, values.items, actor)

  const transaction = db.transaction((folio) => {
    const saleResult = db.prepare(`
      INSERT INTO sales (
        folio,
        subtotal,
        discount,
        total,
        payment_method,
        cash_received,
        change_given,
        status,
        customer_id,
        credit_used,
        payment_status,
        amount_paid,
        amount_due,
        due_date,
        payment_notes,
        created_by_user_id,
        updated_at,
        updated_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).run(
      folio,
      values.subtotalValue,
      values.discountValue,
      values.totalValue,
      values.paymentMethodValue,
      values.cashReceivedValue,
      Number(values.changeGivenValue || 0),
      'completed',
      values.customerId,
      values.creditToUse,
      values.paymentStatusValue,
      values.amountPaidValue,
      values.amountDueValue,
      values.dueDateValue,
      values.paymentNotesValue,
      actor.userId || null,
      actor.userId || null
    )

    const saleId = Number(saleResult.lastInsertRowid)

    applySaleItems(db, saleId, folio, values.items, actor.userId)

    if (values.creditToUse > 0) {
      adjustCustomerCredit(
        db,
        values.customerId,
        values.creditToUse,
        saleId,
        folio,
        actor.userId,
        'use',
        'Uso de credito en venta'
      )
    }

    if (values.amountPaidValue > 0) {
      db.prepare(`
        INSERT INTO sale_payments (
          sale_id,
          customer_id,
          amount,
          payment_method,
          notes,
          is_initial,
          user_id
        ) VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(
        saleId,
        values.customerId,
        values.amountPaidValue,
        values.paymentMethodValue,
        'Pago inicial de venta',
        actor.userId || null
      )
    }

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'sale',
      entityId: saleId,
      action: 'create',
      description: `Venta ${folio} creada`,
      payloadJson: {
        total: values.totalValue,
        items: values.items.length,
        customerId: values.customerId,
      },
    })

    return saleId
  })

  // Reintentamos si un folio cae repetido por ventas casi simultaneas.
  let saleId = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const folio = generateFolio()
    try {
      saleId = transaction(folio)
      break
    } catch (error) {
      if (!isDuplicateSaleFolioError(error) || attempt === 4) {
        throw error
      }
    }
  }

  const saleResult = fetchSaleResult(db, saleId)
  await syncSaleChange(db, 'create', saleResult, actor, { request: payload })
  return saleResult
}

async function updateSaleRecord(db, saleId, payload, actor) {
  const existingSale = getSaleSnapshot(db, saleId)

  if (!existingSale || existingSale.deleted_at) {
    throw new Error('Venta no encontrada.')
  }

  ensureSaleCanBeMutated(db, saleId)
  const values = validateSalePayload(payload)

  const transaction = db.transaction(() => {
    revertSaleEffects(db, existingSale, getSaleItems(db, saleId), actor.userId, 'Reversion por edicion de venta')

    db.prepare(`DELETE FROM sale_items WHERE sale_id = ?`).run(Number(saleId))

    db.prepare(`
      UPDATE sales
      SET
        subtotal = ?,
        discount = ?,
        total = ?,
        payment_method = ?,
        cash_received = ?,
        change_given = ?,
        customer_id = ?,
        credit_used = ?,
        payment_status = ?,
        amount_paid = ?,
        amount_due = ?,
        due_date = ?,
        payment_notes = ?,
        updated_at = CURRENT_TIMESTAMP,
        updated_by_user_id = ?
      WHERE id = ?
    `).run(
      values.subtotalValue,
      values.discountValue,
      values.totalValue,
      values.paymentMethodValue,
      values.cashReceivedValue,
      Number(values.changeGivenValue || 0),
      values.customerId,
      values.creditToUse,
      values.paymentStatusValue,
      values.amountPaidValue,
      values.amountDueValue,
      values.dueDateValue,
      values.paymentNotesValue,
      actor.userId || null,
      Number(saleId)
    )

    applySaleItems(db, Number(saleId), String(existingSale.folio || ''), values.items, actor.userId)

    if (values.creditToUse > 0) {
      adjustCustomerCredit(
        db,
        values.customerId,
        values.creditToUse,
        Number(saleId),
        String(existingSale.folio || ''),
        actor.userId,
        'use',
        'Uso de credito en venta editada'
      )
    }

    if (values.amountPaidValue > 0) {
      db.prepare(`
        INSERT INTO sale_payments (
          sale_id,
          customer_id,
          amount,
          payment_method,
          notes,
          is_initial,
          user_id
        ) VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(
        Number(saleId),
        values.customerId,
        values.amountPaidValue,
        values.paymentMethodValue,
        'Pago inicial de venta editada',
        actor.userId || null
      )
    }

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'sale',
      entityId: Number(saleId),
      action: 'update',
      description: `Venta ${existingSale.folio} actualizada`,
      payloadJson: {
        total: values.totalValue,
        items: values.items.length,
        customerId: values.customerId,
      },
    })
  })

  transaction()
  const saleResult = fetchSaleResult(db, saleId)
  await syncSaleChange(db, 'update', saleResult, actor, { request: payload })
  return saleResult
}

async function deleteSaleRecord(db, saleId, actor, reason = '') {
  const existingSale = getSaleSnapshot(db, saleId)

  if (!existingSale || existingSale.deleted_at) {
    throw new Error('Venta no encontrada.')
  }

  ensureSaleCanBeMutated(db, saleId)

  const transaction = db.transaction(() => {
    revertSaleEffects(db, existingSale, getSaleItems(db, saleId), actor.userId, 'Reversion por eliminacion de venta')

    db.prepare(`
      UPDATE sales
      SET
        status = 'deleted',
        payment_status = 'deleted',
        deleted_at = CURRENT_TIMESTAMP,
        deleted_by_user_id = ?,
        updated_at = CURRENT_TIMESTAMP,
        updated_by_user_id = ?
      WHERE id = ?
    `).run(actor.userId || null, actor.userId || null, Number(saleId))

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'sale',
      entityId: Number(saleId),
      action: 'delete',
      description: `Venta ${existingSale.folio} eliminada`,
      payloadJson: { reason: String(reason || '') },
    })
  })

  transaction()

  enqueueServerSync(db, {
    eventType: 'sale.delete',
    entityType: 'sale',
    entityId: Number(saleId),
    action: 'delete',
    payload: {
      actor: actor || null,
      saleId: Number(saleId),
      folio: String(existingSale.folio || ''),
      reason: String(reason || ''),
    },
  })

  return { success: true, id: Number(saleId) }
}

module.exports = {
  createSaleRecord,
  updateSaleRecord,
  deleteSaleRecord,
}
