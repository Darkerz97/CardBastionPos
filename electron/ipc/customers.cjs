const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function registerCustomerHandlers() {

  // Agregar crédito a un cliente

    ipcMain.handle('customers:addCredit', (event, payload) => {
    const db = getDb()

    const customerId = Number(payload?.customerId)
    const amount = Number(payload?.amount || 0)
    const reason = String(payload?.reason || '').trim()

    if (!customerId) {
      throw new Error('Cliente inválido.')
    }

    if (amount <= 0) {
      throw new Error('El monto de crédito debe ser mayor a 0.')
    }

    const customer = db.prepare(`
      SELECT id, store_credit
      FROM customers
      WHERE id = ?
      LIMIT 1
    `).get(customerId)

    if (!customer) {
      throw new Error('Cliente no encontrado.')
    }

    const newBalance = Number(customer.store_credit || 0) + amount

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE customers
        SET
          store_credit = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newBalance, customerId)

      db.prepare(`
        INSERT INTO customer_credit_movements (
          customer_id,
          type,
          amount,
          balance_after,
          reason,
          reference_type,
          reference_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        customerId,
        'earn',
        amount,
        newBalance,
        reason || 'Abono manual',
        'manual',
        null
      )
    })

    transaction()

    return {
      success: true,
      customerId,
      amount,
      newBalance,
    }
  })

//historial de clientes
    ipcMain.handle('customers:getHistory', (event, customerId) => {
    const db = getDb()
    const id = Number(customerId)

    if (!id) {
      throw new Error('ID de cliente inválido.')
    }

    const customer = db.prepare(`
      SELECT
        id,
        name,
        phone,
        email,
        notes,
        points,
        store_credit,
        created_at,
        updated_at
      FROM customers
      WHERE id = ?
      LIMIT 1
    `).get(id)

    if (!customer) {
      throw new Error('Cliente no encontrado.')
    }

    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(total), 0) as total_spent,
        COALESCE(SUM(credit_used), 0) as total_credit_used,
        COALESCE(SUM(total + credit_used), 0) as gross_spent,
        COALESCE(SUM(CASE WHEN credit_used > 0 THEN 1 ELSE 0 END), 0) as sales_with_credit,
        COALESCE(SUM(CASE WHEN payment_status = 'partial' THEN 1 ELSE 0 END), 0) as partial_sales,
        COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END), 0) as pending_sales,
        COALESCE(SUM(COALESCE(amount_due, 0)), 0) as total_pending_balance,
        COALESCE(AVG(total), 0) as average_ticket,
        MAX(created_at) as last_purchase_at
      FROM sales
      WHERE customer_id = ?
    `).get(id)

    const creditSummary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'earn' THEN amount ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(CASE WHEN type = 'use' THEN amount ELSE 0 END), 0) as total_used
      FROM customer_credit_movements
      WHERE customer_id = ?
    `).get(id)

    const sales = db.prepare(`
      SELECT
        id,
        folio,
        subtotal,
        discount,
        total,
        credit_used,
        COALESCE(amount_paid, 0) as amount_paid,
        COALESCE(amount_due, 0) as amount_due,
        COALESCE(payment_status, 'paid') as payment_status,
        due_date,
        payment_notes,
        payment_method,
        cash_received,
        change_given,
        status,
        created_at
      FROM sales
      WHERE customer_id = ?
      ORDER BY created_at DESC
    `).all(id)

    const receivablePayments = db.prepare(`
      SELECT
        sp.id,
        sp.sale_id,
        s.folio,
        sp.amount,
        sp.payment_method,
        sp.notes,
        sp.is_initial,
        sp.created_at
      FROM sale_payments sp
      INNER JOIN sales s ON s.id = sp.sale_id
      WHERE sp.customer_id = ?
      ORDER BY sp.created_at DESC, sp.id DESC
    `).all(id)

    const creditMovements = db.prepare(`
      SELECT
        id,
        type,
        amount,
        balance_after,
        reason,
        reference_type,
        reference_id,
        created_at
      FROM customer_credit_movements
      WHERE customer_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(id)

    return {
      success: true,
      customer: {
        id: Number(customer.id),
        name: String(customer.name || ''),
        phone: String(customer.phone || ''),
        email: String(customer.email || ''),
        notes: String(customer.notes || ''),
        points: Number(customer.points || 0),
        storeCredit: Number(customer.store_credit || 0),
        createdAt: String(customer.created_at || ''),
        updatedAt: String(customer.updated_at || ''),
      },
      summary: {
        totalSales: Number(summary?.total_sales || 0),
        totalSpent: Number(summary?.total_spent || 0),
        totalCreditUsed: Number(summary?.total_credit_used || 0),
        grossSpent: Number(summary?.gross_spent || 0),
        salesWithCredit: Number(summary?.sales_with_credit || 0),
        partialSales: Number(summary?.partial_sales || 0),
        pendingSales: Number(summary?.pending_sales || 0),
        totalPendingBalance: Number(summary?.total_pending_balance || 0),
        totalCreditEarned: Number(creditSummary?.total_earned || 0),
        totalCreditMovementUsed: Number(creditSummary?.total_used || 0),
        averageTicket: Number(summary?.average_ticket || 0),
        lastPurchaseAt: String(summary?.last_purchase_at || ''),
      },
      sales: (sales || []).map(row => ({
        id: Number(row.id),
        folio: String(row.folio || ''),
        subtotal: Number(row.subtotal || 0),
        discount: Number(row.discount || 0),
        total: Number(row.total || 0),
        creditUsed: Number(row.credit_used || 0),
        totalBeforeCredit: Number(row.total || 0) + Number(row.credit_used || 0),
        amountPaid: Number(row.amount_paid || 0),
        amountDue: Number(row.amount_due || 0),
        paymentStatus: String(row.payment_status || 'paid'),
        dueDate: String(row.due_date || ''),
        paymentNotes: String(row.payment_notes || ''),
        paymentMethod: String(row.payment_method || ''),
        cashReceived: Number(row.cash_received || 0),
        changeGiven: Number(row.change_given || 0),
        status: String(row.status || ''),
        createdAt: String(row.created_at || ''),
      })),
      receivablePayments: (receivablePayments || []).map(row => ({
        id: Number(row.id),
        saleId: Number(row.sale_id),
        folio: String(row.folio || ''),
        amount: Number(row.amount || 0),
        paymentMethod: String(row.payment_method || ''),
        notes: String(row.notes || ''),
        isInitial: Number(row.is_initial || 0) === 1,
        createdAt: String(row.created_at || ''),
      })),
      creditMovements: (creditMovements || []).map(row => ({
        id: Number(row.id),
        type: String(row.type || ''),
        amount: Number(row.amount || 0),
        balanceAfter: Number(row.balance_after || 0),
        reason: String(row.reason || ''),
        referenceType: String(row.reference_type || ''),
        referenceId: row.reference_id ? Number(row.reference_id) : null,
        createdAt: String(row.created_at || ''),
      })),
    }
  })
    
  ipcMain.handle('customers:list', () => {
    const db = getDb()

    return db.prepare(`
      SELECT
        id,
        name,
        phone,
        email,
        notes,
        points,
        store_credit,
        created_at,
        updated_at
      FROM customers
      ORDER BY name ASC
    `).all()
  })

    ipcMain.handle('customers:getById', (event, customerId) => {
    const db = getDb()
    const id = Number(customerId)

    if (!id) {
      throw new Error('ID de cliente inválido.')
    }

    const customer = db.prepare(`
      SELECT
        id,
        name,
        phone,
        email,
        notes,
        points,
        store_credit,
        created_at,
        updated_at
      FROM customers
      WHERE id = ?
      LIMIT 1
    `).get(id)

    if (!customer) {
      throw new Error('Cliente no encontrado.')
    }

    return {
      id: Number(customer.id),
      name: String(customer.name || ''),
      phone: String(customer.phone || ''),
      email: String(customer.email || ''),
      notes: String(customer.notes || ''),
      points: Number(customer.points || 0),
      store_credit: Number(customer.store_credit || 0),
      created_at: String(customer.created_at || ''),
      updated_at: String(customer.updated_at || ''),
    }
  })

    ipcMain.handle('customers:useCredit', (event, payload) => {
    const db = getDb()

    const customerId = Number(payload?.customerId)
    const amount = Number(payload?.amount || 0)
    const reason = String(payload?.reason || '').trim()
    const referenceType = String(payload?.referenceType || 'sale').trim()
    const referenceId = payload?.referenceId ? Number(payload.referenceId) : null

    if (!customerId) {
      throw new Error('Cliente inválido.')
    }

    if (amount <= 0) {
      throw new Error('El monto a usar debe ser mayor a 0.')
    }

    const customer = db.prepare(`
      SELECT id, store_credit
      FROM customers
      WHERE id = ?
      LIMIT 1
    `).get(customerId)

    if (!customer) {
      throw new Error('Cliente no encontrado.')
    }

    const currentBalance = Number(customer.store_credit || 0)

    if (amount > currentBalance) {
      throw new Error('El cliente no tiene suficiente crédito.')
    }

    const newBalance = currentBalance - amount

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE customers
        SET
          store_credit = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newBalance, customerId)

      db.prepare(`
        INSERT INTO customer_credit_movements (
          customer_id,
          type,
          amount,
          balance_after,
          reason,
          reference_type,
          reference_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        customerId,
        'use',
        amount,
        newBalance,
        reason || 'Crédito usado en venta',
        referenceType,
        referenceId
      )
    })

    transaction()

    return {
      success: true,
      customerId,
      amount,
      newBalance,
    }
  })

  ipcMain.handle('customers:create', (event, payload) => {
    const db = getDb()

    const customer = {
      name: normalizeText(payload?.name),
      phone: normalizeText(payload?.phone),
      email: normalizeText(payload?.email),
      notes: normalizeText(payload?.notes),
      storeCredit: Number(payload?.storeCredit) || 0,
    }

    if (!customer.name) {
      throw new Error('El nombre del cliente es obligatorio.')
    }

    const result = db.prepare(`
      INSERT INTO customers (
        name, phone, email, notes, store_credit
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      customer.name,
      customer.phone,
      customer.email,
      customer.notes,
      customer.storeCredit
    )

    return {
      success: true,
      id: Number(result.lastInsertRowid),
    }
  })

  ipcMain.handle('customers:update', (event, payload) => {
    const db = getDb()
    const customerId = Number(payload?.id)

    if (!customerId) {
      throw new Error('ID de cliente inválido.')
    }

    const customer = {
      name: normalizeText(payload?.name),
      phone: normalizeText(payload?.phone),
      email: normalizeText(payload?.email),
      notes: normalizeText(payload?.notes),
    }

    if (!customer.name) {
      throw new Error('El nombre del cliente es obligatorio.')
    }

    db.prepare(`
      UPDATE customers
      SET
        name = ?,
        phone = ?,
        email = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      customer.name,
      customer.phone,
      customer.email,
      customer.notes,
      customerId
    )

    return {
      success: true,
      id: customerId,
    }
  })

  ipcMain.handle('customers:search', (event, query) => {
    const db = getDb()
    const term = `%${normalizeText(query)}%`

    return db.prepare(`
      SELECT
        id,
        name,
        phone,
        email,
        notes,
        points,
        store_credit,
        created_at,
        updated_at
      FROM customers
      WHERE
        name LIKE ?
        OR phone LIKE ?
        OR email LIKE ?
      ORDER BY name ASC
      LIMIT 20
    `).all(term, term, term)
  })

  ipcMain.handle('customers:delete', (event, customerId) => {
    const db = getDb()
    const id = Number(customerId)

    if (!id) {
      throw new Error('ID de cliente inválido.')
    }

    db.prepare(`
      DELETE FROM customers
      WHERE id = ?
    `).run(id)

    return {
      success: true,
      id,
    }
  })
}

module.exports = { registerCustomerHandlers }
