const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function toSqlDate(value) {
  if (!value) return null
  return String(value).slice(0, 10)
}

function mapPaymentStatus(amountPaid, amountDue) {
  if (Number(amountDue || 0) <= 0) return 'paid'
  if (Number(amountPaid || 0) <= 0) return 'pending'
  return 'partial'
}

function buildReceivablesFilter(filters = {}, alias = 's') {
  const where = [`${alias}.deleted_at IS NULL`]
  const params = []

  const status = toText(filters.status)
  const customerId = Number(filters.customerId || 0)
  const dateFrom = toSqlDate(filters.dateFrom)
  const dateTo = toSqlDate(filters.dateTo)

  if (status === 'pending' || status === 'partial' || status === 'paid') {
    where.push(`${alias}.payment_status = ?`)
    params.push(status)
  }

  if (customerId > 0) {
    where.push(`${alias}.customer_id = ?`)
    params.push(customerId)
  }

  if (dateFrom) {
    where.push(`date(${alias}.created_at, 'localtime') >= ?`)
    params.push(dateFrom)
  }

  if (dateTo) {
    where.push(`date(${alias}.created_at, 'localtime') <= ?`)
    params.push(dateTo)
  }

  if (Boolean(filters.overdueOnly)) {
    where.push(`${alias}.amount_due > 0`)
    where.push(`${alias}.due_date IS NOT NULL`)
    where.push(`datetime(${alias}.due_date) < datetime('now')`)
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  }
}

function registerReceivableHandlers() {
  ipcMain.handle('receivables:list', (event, filters = {}) => {
    const db = getDb()
    const { whereSql, params } = buildReceivablesFilter(filters, 's')

    const rows = db.prepare(`
      SELECT
        s.id,
        s.folio,
        s.customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        s.created_at,
        s.total,
        COALESCE(s.amount_paid, 0) as amount_paid,
        COALESCE(s.amount_due, 0) as amount_due,
        COALESCE(s.payment_status, 'paid') as payment_status,
        s.payment_method,
        s.credit_used,
        s.due_date,
        s.payment_notes
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${whereSql}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT 600
    `).all(...params)

    return (rows || []).map((row) => ({
      id: Number(row.id),
      folio: String(row.folio || ''),
      customerId: row.customer_id ? Number(row.customer_id) : null,
      customerName: String(row.customer_name || ''),
      customerPhone: String(row.customer_phone || ''),
      createdAt: String(row.created_at || ''),
      total: Number(row.total || 0),
      amountPaid: Number(row.amount_paid || 0),
      amountDue: Number(row.amount_due || 0),
      paymentStatus: String(row.payment_status || 'paid'),
      paymentMethod: String(row.payment_method || ''),
      creditUsed: Number(row.credit_used || 0),
      dueDate: String(row.due_date || ''),
      paymentNotes: String(row.payment_notes || ''),
      isOverdue: Boolean(row.due_date && Number(row.amount_due || 0) > 0 && new Date(row.due_date).getTime() < Date.now()),
    }))
  })

  ipcMain.handle('receivables:getById', (event, receivableId) => {
    const db = getDb()
    const id = Number(receivableId)

    if (!id) {
      throw new Error('ID de cuenta por cobrar invalido.')
    }

    const sale = db.prepare(`
      SELECT
        s.id,
        s.folio,
        s.customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        s.created_at,
        s.subtotal,
        s.discount,
        s.total,
        s.payment_method,
        s.credit_used,
        COALESCE(s.amount_paid, 0) as amount_paid,
        COALESCE(s.amount_due, 0) as amount_due,
        COALESCE(s.payment_status, 'paid') as payment_status,
        s.due_date,
        s.payment_notes
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = ?
        AND s.deleted_at IS NULL
      LIMIT 1
    `).get(id)

    if (!sale) {
      throw new Error('Cuenta por cobrar no encontrada.')
    }

    const items = db.prepare(`
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
    `).all(id)

    const payments = db.prepare(`
      SELECT
        id,
        sale_id,
        customer_id,
        amount,
        payment_method,
        notes,
        is_initial,
        created_at
      FROM sale_payments
      WHERE sale_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(id)

    return {
      success: true,
      receivable: {
        id: Number(sale.id),
        folio: String(sale.folio || ''),
        customerId: sale.customer_id ? Number(sale.customer_id) : null,
        customerName: String(sale.customer_name || ''),
        customerPhone: String(sale.customer_phone || ''),
        createdAt: String(sale.created_at || ''),
        subtotal: Number(sale.subtotal || 0),
        discount: Number(sale.discount || 0),
        total: Number(sale.total || 0),
        paymentMethod: String(sale.payment_method || ''),
        creditUsed: Number(sale.credit_used || 0),
        amountPaid: Number(sale.amount_paid || 0),
        amountDue: Number(sale.amount_due || 0),
        paymentStatus: String(sale.payment_status || 'paid'),
        dueDate: String(sale.due_date || ''),
        paymentNotes: String(sale.payment_notes || ''),
      },
      items: (items || []).map((item) => ({
        id: Number(item.id),
        saleId: Number(item.sale_id),
        productId: Number(item.product_id || 0),
        sku: String(item.sku || ''),
        productName: String(item.product_name || ''),
        qty: Number(item.qty || 0),
        unitPrice: Number(item.unit_price || 0),
        lineTotal: Number(item.line_total || 0),
      })),
      payments: (payments || []).map((payment) => ({
        id: Number(payment.id),
        saleId: Number(payment.sale_id),
        customerId: payment.customer_id ? Number(payment.customer_id) : null,
        amount: Number(payment.amount || 0),
        paymentMethod: String(payment.payment_method || ''),
        notes: String(payment.notes || ''),
        isInitial: Number(payment.is_initial || 0) === 1,
        createdAt: String(payment.created_at || ''),
      })),
    }
  })

  ipcMain.handle('receivables:getByCustomer', (event, customerId) => {
    const db = getDb()
    const id = Number(customerId)

    if (!id) {
      throw new Error('ID de cliente invalido.')
    }

    const receivables = db.prepare(`
      SELECT
        s.id,
        s.folio,
        s.created_at,
        s.total,
        COALESCE(s.amount_paid, 0) as amount_paid,
        COALESCE(s.amount_due, 0) as amount_due,
        COALESCE(s.payment_status, 'paid') as payment_status,
        s.due_date,
        s.payment_method,
        s.payment_notes
      FROM sales s
      WHERE s.customer_id = ?
        AND s.deleted_at IS NULL
      ORDER BY s.created_at DESC, s.id DESC
    `).all(id)

    const payments = db.prepare(`
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
        AND s.deleted_at IS NULL
      ORDER BY sp.created_at DESC, sp.id DESC
    `).all(id)

    return {
      success: true,
      customerId: id,
      receivables: (receivables || []).map((row) => ({
        id: Number(row.id),
        folio: String(row.folio || ''),
        createdAt: String(row.created_at || ''),
        total: Number(row.total || 0),
        amountPaid: Number(row.amount_paid || 0),
        amountDue: Number(row.amount_due || 0),
        paymentStatus: String(row.payment_status || 'paid'),
        dueDate: String(row.due_date || ''),
        paymentMethod: String(row.payment_method || ''),
        paymentNotes: String(row.payment_notes || ''),
      })),
      payments: (payments || []).map((row) => ({
        id: Number(row.id),
        saleId: Number(row.sale_id),
        folio: String(row.folio || ''),
        amount: Number(row.amount || 0),
        paymentMethod: String(row.payment_method || ''),
        notes: String(row.notes || ''),
        isInitial: Number(row.is_initial || 0) === 1,
        createdAt: String(row.created_at || ''),
      })),
    }
  })

  ipcMain.handle('receivables:addPayment', (event, payload) => {
    const db = getDb()

    const saleId = Number(payload?.saleId)
    const amount = toNumber(payload?.amount, 0)
    const paymentMethod = toText(payload?.paymentMethod || 'cash')
    const notes = toText(payload?.notes)

    if (!saleId) {
      throw new Error('Venta invalida para registrar abono.')
    }

    if (amount <= 0) {
      throw new Error('El abono debe ser mayor a 0.')
    }

    const sale = db.prepare(`
      SELECT
        id,
        customer_id,
        total,
        COALESCE(amount_paid, 0) as amount_paid,
        COALESCE(amount_due, 0) as amount_due,
        COALESCE(payment_status, 'paid') as payment_status
      FROM sales
      WHERE id = ?
      LIMIT 1
    `).get(saleId)

    if (!sale) {
      throw new Error('Venta no encontrada.')
    }

    if (Number(sale.amount_due || 0) <= 0) {
      throw new Error('La venta ya esta liquidada.')
    }

    if (amount > Number(sale.amount_due || 0)) {
      throw new Error('El abono no puede ser mayor al saldo pendiente.')
    }

    const nextAmountPaid = Number(sale.amount_paid || 0) + amount
    const nextAmountDue = Math.max(Number(sale.total || 0) - nextAmountPaid, 0)
    const nextStatus = mapPaymentStatus(nextAmountPaid, nextAmountDue)

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO sale_payments (
          sale_id,
          customer_id,
          amount,
          payment_method,
          notes,
          is_initial
        ) VALUES (?, ?, ?, ?, ?, 0)
      `).run(
        saleId,
        sale.customer_id ? Number(sale.customer_id) : null,
        amount,
        paymentMethod,
        notes || 'Abono'
      )

      db.prepare(`
        UPDATE sales
        SET
          amount_paid = ?,
          amount_due = ?,
          payment_status = ?
        WHERE id = ?
      `).run(
        nextAmountPaid,
        nextAmountDue,
        nextStatus,
        saleId
      )
    })

    transaction()

    return {
      success: true,
      saleId,
      amount,
      amountPaid: nextAmountPaid,
      amountDue: nextAmountDue,
      paymentStatus: nextStatus,
    }
  })

  ipcMain.handle('receivables:addCustomerPayment', (event, payload) => {
    const db = getDb()

    const customerId = Number(payload?.customerId)
    const amount = toNumber(payload?.amount, 0)
    const paymentMethod = toText(payload?.paymentMethod || 'cash')
    const notes = toText(payload?.notes)

    if (!customerId) {
      throw new Error('Cliente invalido para registrar abono global.')
    }

    if (amount <= 0) {
      throw new Error('El abono debe ser mayor a 0.')
    }

    const receivables = db.prepare(`
      SELECT
        id,
        folio,
        total,
        COALESCE(amount_paid, 0) as amount_paid,
        COALESCE(amount_due, 0) as amount_due
      FROM sales
      WHERE customer_id = ?
        AND COALESCE(amount_due, 0) > 0
      ORDER BY datetime(created_at) ASC, id ASC
    `).all(customerId)

    if (!receivables.length) {
      throw new Error('El cliente no tiene cuentas pendientes.')
    }

    const totalDue = (receivables || []).reduce((acc, row) => acc + Number(row.amount_due || 0), 0)

    if (amount > totalDue + 0.01) {
      throw new Error('El abono no puede ser mayor al saldo total pendiente del cliente.')
    }

    const inserts = db.prepare(`
      INSERT INTO sale_payments (
        sale_id,
        customer_id,
        amount,
        payment_method,
        notes,
        is_initial
      ) VALUES (?, ?, ?, ?, ?, 0)
    `)

    const updateSale = db.prepare(`
      UPDATE sales
      SET
        amount_paid = ?,
        amount_due = ?,
        payment_status = ?
      WHERE id = ?
    `)

    let remaining = Number(amount || 0)
    const applied = []

    const transaction = db.transaction(() => {
      for (const sale of receivables) {
        if (remaining <= 0) break

        const due = Number(sale.amount_due || 0)
        if (due <= 0) continue

        const pay = Math.min(due, remaining)
        const nextAmountPaid = Number(sale.amount_paid || 0) + pay
        const nextAmountDue = Math.max(Number(sale.total || 0) - nextAmountPaid, 0)
        const nextStatus = mapPaymentStatus(nextAmountPaid, nextAmountDue)

        inserts.run(
          Number(sale.id),
          customerId,
          pay,
          paymentMethod,
          notes || `Abono global cliente (${String(sale.folio || '')})`
        )

        updateSale.run(
          nextAmountPaid,
          nextAmountDue,
          nextStatus,
          Number(sale.id)
        )

        applied.push({
          saleId: Number(sale.id),
          folio: String(sale.folio || ''),
          amount: Number(pay || 0),
          amountDueAfter: Number(nextAmountDue || 0),
          paymentStatus: String(nextStatus || 'paid'),
        })

        remaining = Math.max(remaining - pay, 0)
      }
    })

    transaction()

    return {
      success: true,
      customerId,
      requestedAmount: Number(amount || 0),
      appliedAmount: Number(amount || 0) - Number(remaining || 0),
      unappliedAmount: Number(remaining || 0),
      totalDueBefore: Number(totalDue || 0),
      totalDueAfter: Math.max(Number(totalDue || 0) - Number(amount || 0), 0),
      applied,
    }
  })

  ipcMain.handle('receivables:getSummary', () => {
    const db = getDb()

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN amount_due > 0 THEN 1 ELSE 0 END), 0) as open_receivables,
        COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END), 0) as pending_sales,
        COALESCE(SUM(CASE WHEN payment_status = 'partial' THEN 1 ELSE 0 END), 0) as partial_sales,
        COALESCE(SUM(amount_due), 0) as total_due,
        COALESCE(SUM(CASE WHEN amount_due > 0 AND due_date IS NOT NULL AND datetime(due_date) < datetime('now') THEN 1 ELSE 0 END), 0) as overdue_count,
        COALESCE(SUM(CASE WHEN amount_due > 0 AND due_date IS NOT NULL AND datetime(due_date) < datetime('now') THEN amount_due ELSE 0 END), 0) as overdue_amount
      FROM sales
    `).get()

    const paymentsToday = db.prepare(`
      SELECT
        COALESCE(SUM(sp.amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN sp.payment_method = 'cash' THEN sp.amount ELSE 0 END), 0) as cash_amount,
        COALESCE(SUM(CASE WHEN sp.payment_method = 'card' THEN sp.amount ELSE 0 END), 0) as card_amount,
        COUNT(*) as total_payments
      FROM sale_payments sp
      WHERE date(sp.created_at, 'localtime') = date('now', 'localtime')
        AND sp.is_initial = 0
    `).get()

    const topCustomers = db.prepare(`
      SELECT
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        COALESCE(SUM(s.amount_due), 0) as pending_balance,
        COALESCE(SUM(CASE WHEN s.amount_due > 0 THEN 1 ELSE 0 END), 0) as open_tickets
      FROM sales s
      INNER JOIN customers c ON c.id = s.customer_id
      WHERE s.amount_due > 0
      GROUP BY c.id, c.name, c.phone
      ORDER BY pending_balance DESC
      LIMIT 20
    `).all()

    return {
      success: true,
      summary: {
        openReceivables: Number(summary?.open_receivables || 0),
        pendingSales: Number(summary?.pending_sales || 0),
        partialSales: Number(summary?.partial_sales || 0),
        totalDue: Number(summary?.total_due || 0),
        overdueCount: Number(summary?.overdue_count || 0),
        overdueAmount: Number(summary?.overdue_amount || 0),
      },
      paymentsToday: {
        totalAmount: Number(paymentsToday?.total_amount || 0),
        cashAmount: Number(paymentsToday?.cash_amount || 0),
        cardAmount: Number(paymentsToday?.card_amount || 0),
        totalPayments: Number(paymentsToday?.total_payments || 0),
      },
      topCustomers: (topCustomers || []).map((row) => ({
        customerId: Number(row.customer_id),
        customerName: String(row.customer_name || ''),
        customerPhone: String(row.customer_phone || ''),
        pendingBalance: Number(row.pending_balance || 0),
        openTickets: Number(row.open_tickets || 0),
      })),
    }
  })

  ipcMain.handle('receivables:getOverdue', () => {
    const db = getDb()

    const rows = db.prepare(`
      SELECT
        s.id,
        s.folio,
        s.customer_id,
        c.name as customer_name,
        s.total,
        COALESCE(s.amount_paid, 0) as amount_paid,
        COALESCE(s.amount_due, 0) as amount_due,
        s.due_date,
        s.created_at
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.amount_due > 0
        AND s.due_date IS NOT NULL
        AND datetime(s.due_date) < datetime('now')
      ORDER BY s.due_date ASC, s.id DESC
    `).all()

    return (rows || []).map((row) => ({
      id: Number(row.id),
      folio: String(row.folio || ''),
      customerId: row.customer_id ? Number(row.customer_id) : null,
      customerName: String(row.customer_name || ''),
      total: Number(row.total || 0),
      amountPaid: Number(row.amount_paid || 0),
      amountDue: Number(row.amount_due || 0),
      dueDate: String(row.due_date || ''),
      createdAt: String(row.created_at || ''),
    }))
  })

  ipcMain.handle('receivables:getCustomerBalance', (event, customerId) => {
    const db = getDb()
    const id = Number(customerId)

    if (!id) {
      throw new Error('ID de cliente invalido.')
    }

    const balance = db.prepare(`
      SELECT
        COALESCE(SUM(amount_due), 0) as total_due,
        COALESCE(SUM(CASE WHEN amount_due > 0 THEN 1 ELSE 0 END), 0) as open_receivables,
        COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END), 0) as pending_sales,
        COALESCE(SUM(CASE WHEN payment_status = 'partial' THEN 1 ELSE 0 END), 0) as partial_sales
      FROM sales
      WHERE customer_id = ?
    `).get(id)

    const lastPayments = db.prepare(`
      SELECT
        sp.id,
        sp.sale_id,
        s.folio,
        sp.amount,
        sp.payment_method,
        sp.notes,
        sp.created_at
      FROM sale_payments sp
      INNER JOIN sales s ON s.id = sp.sale_id
      WHERE sp.customer_id = ?
      ORDER BY sp.created_at DESC, sp.id DESC
      LIMIT 50
    `).all(id)

    return {
      success: true,
      customerId: id,
      totalDue: Number(balance?.total_due || 0),
      openReceivables: Number(balance?.open_receivables || 0),
      pendingSales: Number(balance?.pending_sales || 0),
      partialSales: Number(balance?.partial_sales || 0),
      lastPayments: (lastPayments || []).map((row) => ({
        id: Number(row.id),
        saleId: Number(row.sale_id),
        folio: String(row.folio || ''),
        amount: Number(row.amount || 0),
        paymentMethod: String(row.payment_method || ''),
        notes: String(row.notes || ''),
        createdAt: String(row.created_at || ''),
      })),
    }
  })
}

module.exports = { registerReceivableHandlers }
