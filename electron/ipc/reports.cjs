const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { getDb } = require('../database/db.cjs')

function toSqlDate(value) {
  if (!value) return null
  return String(value).slice(0, 10)
}

function escapeCsv(value) {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function buildDateWhereClause(column, filters = {}, params = []) {
  const dateFrom = toSqlDate(filters.dateFrom)
  const dateTo = toSqlDate(filters.dateTo)
  const where = []

  if (dateFrom) {
    where.push(`date(${column}, 'localtime') >= ?`)
    params.push(dateFrom)
  }

  if (dateTo) {
    where.push(`date(${column}, 'localtime') <= ?`)
    params.push(dateTo)
  }

  return where
}

function normalizeSheetRows(rows = []) {
  return rows.map((row) => {
    const normalized = {}
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = value === null || value === undefined ? '' : value
    }
    return normalized
  })
}

function appendSheet(workbook, name, rows) {
  const sheet = XLSX.utils.json_to_sheet(normalizeSheetRows(rows))
  XLSX.utils.book_append_sheet(workbook, sheet, name)
}

function buildSalesFilter(filters = {}, tableAlias = 's') {
  const dateFrom = toSqlDate(filters.dateFrom)
  const dateTo = toSqlDate(filters.dateTo)

  const where = []
  const params = []

  where.push(`${tableAlias}.deleted_at IS NULL`)

  if (dateFrom) {
    where.push(`date(${tableAlias}.created_at, 'localtime') >= ?`)
    params.push(dateFrom)
  }

  if (dateTo) {
    where.push(`date(${tableAlias}.created_at, 'localtime') <= ?`)
    params.push(dateTo)
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  }
}

function registerReportHandlers() {
  ipcMain.handle('reports:salesDashboard', (event, filters = {}) => {
    const db = getDb()
    const { whereSql, params } = buildSalesFilter(filters, 's')
    const initialPaymentsJoin = `
      LEFT JOIN (
        SELECT sale_id, COALESCE(SUM(amount), 0) as initial_amount
        FROM sale_payments
        WHERE COALESCE(is_initial, 0) = 1
        GROUP BY sale_id
      ) ip ON ip.sale_id = s.id
    `

    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(CASE WHEN s.credit_used > 0 THEN 1 ELSE 0 END), 0) as sales_with_credit,
        COALESCE(SUM(CASE WHEN s.credit_used <= 0 THEN 1 ELSE 0 END), 0) as sales_without_credit,
        COALESCE(SUM(CASE WHEN COALESCE(s.payment_status, 'paid') = 'partial' THEN 1 ELSE 0 END), 0) as partial_sales,
        COALESCE(SUM(CASE WHEN COALESCE(s.payment_status, 'paid') = 'pending' THEN 1 ELSE 0 END), 0) as pending_sales,
        COALESCE(SUM(s.total), 0) as total_amount,
        COALESCE(SUM(s.credit_used), 0) as credit_used_amount,
        COALESCE(SUM(COALESCE(s.amount_due, 0)), 0) as total_due_amount,
        COALESCE(SUM(s.total + s.credit_used), 0) as gross_amount,
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN COALESCE(ip.initial_amount, s.total) ELSE 0 END), 0) as cash_amount,
        COALESCE(SUM(CASE WHEN s.payment_method = 'card' THEN COALESCE(ip.initial_amount, s.total) ELSE 0 END), 0) as card_amount,
        COALESCE(AVG(s.total), 0) as average_ticket
      FROM sales s
      ${initialPaymentsJoin}
      ${whereSql}
    `).get(...params)

    const receivablePaymentsToday = db.prepare(`
      SELECT
        COALESCE(SUM(sp.amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN sp.payment_method = 'cash' THEN sp.amount ELSE 0 END), 0) as cash_amount,
        COALESCE(SUM(CASE WHEN sp.payment_method = 'card' THEN sp.amount ELSE 0 END), 0) as card_amount,
        COUNT(*) as total_payments
      FROM sale_payments sp
      WHERE date(sp.created_at, 'localtime') = date('now', 'localtime')
        AND COALESCE(sp.is_initial, 0) = 0
    `).get()

    const byDay = db.prepare(`
      SELECT
        date(s.created_at, 'localtime') as sale_date,
        COUNT(*) as total_sales,
        COALESCE(SUM(s.total), 0) as total_amount,
        COALESCE(SUM(s.credit_used), 0) as credit_used_amount,
        COALESCE(SUM(s.total + s.credit_used), 0) as gross_amount,
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN COALESCE(ip.initial_amount, s.total) ELSE 0 END), 0) as cash_amount,
        COALESCE(SUM(CASE WHEN s.payment_method = 'card' THEN COALESCE(ip.initial_amount, s.total) ELSE 0 END), 0) as card_amount
      FROM sales s
      ${initialPaymentsJoin}
      ${whereSql}
      GROUP BY date(s.created_at, 'localtime')
      ORDER BY sale_date DESC
    `).all(...params)

    const byPayment = db.prepare(`
      SELECT
        s.payment_method,
        COUNT(*) as total_sales,
        COALESCE(SUM(s.total), 0) as total_amount,
        COALESCE(SUM(s.credit_used), 0) as credit_used_amount,
        COALESCE(SUM(COALESCE(ip.initial_amount, s.total)), 0) as collected_amount
      FROM sales s
      ${initialPaymentsJoin}
      ${whereSql}
      GROUP BY s.payment_method
      ORDER BY total_amount DESC
    `).all(...params)

    const transactions = db.prepare(`
      SELECT
        s.id,
        s.folio,
        s.subtotal,
        s.discount,
        s.total,
        s.credit_used,
        COALESCE(s.amount_paid, 0) as amount_paid,
        COALESCE(s.amount_due, 0) as amount_due,
        COALESCE(s.payment_status, 'paid') as payment_status,
        s.payment_method,
        s.cash_received,
        s.change_given,
        s.created_at,
        s.customer_id,
        c.name as customer_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${whereSql}
      ORDER BY s.created_at DESC
      LIMIT 200
    `).all(...params)

    const topProducts = db.prepare(`
      SELECT
        si.product_id,
        si.product_name,
        si.sku,
        SUM(si.qty) as total_qty,
        SUM(si.line_total) as total_sales_amount,
        COALESCE(SUM(si.line_total - (si.qty * COALESCE(si.unit_cost, 0))), 0) as real_profit
      FROM sales s
      INNER JOIN sale_items si ON si.sale_id = s.id
      ${whereSql}
      GROUP BY si.product_id, si.product_name, si.sku
      ORDER BY total_qty DESC, total_sales_amount DESC
      LIMIT 20
    `).all(...params)

    const topCustomers = db.prepare(`
      SELECT
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        COUNT(s.id) as total_sales,
        COALESCE(SUM(s.total), 0) as total_spent,
        COALESCE(SUM(s.credit_used), 0) as total_credit_used,
        MAX(s.created_at) as last_purchase_at
      FROM sales s
      INNER JOIN customers c ON c.id = s.customer_id
      ${whereSql}
      GROUP BY c.id, c.name, c.phone
      ORDER BY total_spent DESC, total_sales DESC
      LIMIT 20
    `).all(...params)

    return {
      success: true,
      summary: {
        totalSales: Number(summary?.total_sales || 0),
        salesWithCredit: Number(summary?.sales_with_credit || 0),
        salesWithoutCredit: Number(summary?.sales_without_credit || 0),
        partialSales: Number(summary?.partial_sales || 0),
        pendingSales: Number(summary?.pending_sales || 0),
        totalAmount: Number(summary?.total_amount || 0),
        creditUsedAmount: Number(summary?.credit_used_amount || 0),
        totalDueAmount: Number(summary?.total_due_amount || 0),
        grossAmount: Number(summary?.gross_amount || 0),
        cashAmount: Number(summary?.cash_amount || 0),
        cardAmount: Number(summary?.card_amount || 0),
        averageTicket: Number(summary?.average_ticket || 0),
      },
      receivablePaymentsToday: {
        totalAmount: Number(receivablePaymentsToday?.total_amount || 0),
        cashAmount: Number(receivablePaymentsToday?.cash_amount || 0),
        cardAmount: Number(receivablePaymentsToday?.card_amount || 0),
        totalPayments: Number(receivablePaymentsToday?.total_payments || 0),
      },
      byDay: (byDay || []).map(row => ({
        saleDate: String(row.sale_date || ''),
        totalSales: Number(row.total_sales || 0),
        totalAmount: Number(row.total_amount || 0),
        creditUsedAmount: Number(row.credit_used_amount || 0),
        grossAmount: Number(row.gross_amount || 0),
        cashAmount: Number(row.cash_amount || 0),
        cardAmount: Number(row.card_amount || 0),
      })),
      byPayment: (byPayment || []).map(row => ({
        paymentMethod: String(row.payment_method || ''),
        totalSales: Number(row.total_sales || 0),
        totalAmount: Number(row.total_amount || 0),
        creditUsedAmount: Number(row.credit_used_amount || 0),
      })),
      transactions: (transactions || []).map(row => ({
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
        paymentMethod: String(row.payment_method || ''),
        cashReceived: Number(row.cash_received || 0),
        changeGiven: Number(row.change_given || 0),
        createdAt: String(row.created_at || ''),
        customerId: row.customer_id ? Number(row.customer_id) : null,
        customerName: String(row.customer_name || ''),
      })),
      topProducts: (topProducts || []).map(row => ({
        productId: row.product_id ? Number(row.product_id) : null,
        productName: String(row.product_name || ''),
        sku: String(row.sku || ''),
        totalQty: Number(row.total_qty || 0),
        totalSalesAmount: Number(row.total_sales_amount || 0),
        realProfit: Number(row.real_profit || 0),
      })),
      topCustomers: (topCustomers || []).map(row => ({
        customerId: Number(row.customer_id),
        customerName: String(row.customer_name || ''),
        customerPhone: String(row.customer_phone || ''),
        totalSales: Number(row.total_sales || 0),
        totalSpent: Number(row.total_spent || 0),
        totalCreditUsed: Number(row.total_credit_used || 0),
        lastPurchaseAt: String(row.last_purchase_at || ''),
      })),
    }
  })

  ipcMain.handle('reports:exportSalesCsv', async (event, filters = {}) => {
    const db = getDb()
    const { whereSql, params } = buildSalesFilter(filters, 's')

    const salesRows = db.prepare(`
      SELECT
        s.id as sale_id,
        s.folio,
        s.created_at,
        s.payment_method,
        s.subtotal,
        s.discount,
        s.total,
        s.credit_used,
        COALESCE(s.amount_paid, 0) as amount_paid,
        COALESCE(s.amount_due, 0) as amount_due,
        COALESCE(s.payment_status, 'paid') as payment_status,
        s.cash_received,
        s.change_given,
        c.name as customer_name,
        c.phone as customer_phone
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${whereSql}
      ORDER BY s.created_at DESC, s.id DESC
    `).all(...params)

    const saleItemRows = db.prepare(`
      SELECT
        s.id as sale_id,
        s.folio,
        s.created_at,
        s.payment_method,
        s.subtotal,
        s.discount,
        s.total,
        s.credit_used,
        COALESCE(s.amount_paid, 0) as amount_paid,
        COALESCE(s.amount_due, 0) as amount_due,
        COALESCE(s.payment_status, 'paid') as payment_status,
        s.cash_received,
        s.change_given,
        c.name as customer_name,
        si.product_name,
        si.sku,
        si.qty,
        si.unit_price,
        si.line_total,
        COALESCE(si.unit_cost, 0) as unit_cost
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      ${whereSql}
      ORDER BY s.created_at DESC, si.id ASC
    `).all(...params)

    const salePaymentsParams = []
    const salePaymentsWhere = buildDateWhereClause('sp.created_at', filters, salePaymentsParams)
    const salePaymentsWhereSql = salePaymentsWhere.length ? `WHERE ${salePaymentsWhere.join(' AND ')}` : ''

    const salePaymentsRows = db.prepare(`
      SELECT
        sp.id as payment_id,
        sp.sale_id,
        s.folio,
        sp.created_at,
        sp.amount,
        sp.payment_method,
        COALESCE(sp.is_initial, 0) as is_initial,
        COALESCE(sp.notes, '') as notes,
        COALESCE(sp.user_id, '') as user_id
      FROM sale_payments sp
      LEFT JOIN sales s ON s.id = sp.sale_id
      ${salePaymentsWhereSql}
      ORDER BY sp.created_at DESC, sp.id DESC
    `).all(...salePaymentsParams)

    const cashParams = []
    const cashWhere = ['cs.deleted_at IS NULL', ...buildDateWhereClause('cs.opened_at', filters, cashParams)]
    const cashWhereSql = cashWhere.length ? `WHERE ${cashWhere.join(' AND ')}` : ''

    const cashRows = db.prepare(`
      SELECT
        cs.id as cash_session_id,
        cs.opened_at,
        cs.closed_at,
        cs.opening_amount,
        cs.closing_amount,
        cs.expected_amount,
        cs.difference,
        cs.status,
        cs.notes,
        COALESCE(open_user.display_name, open_user.username, '') as opened_by,
        COALESCE(close_user.display_name, close_user.username, '') as closed_by,
        COALESCE(update_user.display_name, update_user.username, '') as updated_by
      FROM cash_sessions cs
      LEFT JOIN users open_user ON open_user.id = cs.opened_by_user_id
      LEFT JOIN users close_user ON close_user.id = cs.closed_by_user_id
      LEFT JOIN users update_user ON update_user.id = cs.updated_by_user_id
      ${cashWhereSql}
      ORDER BY cs.opened_at DESC, cs.id DESC
    `).all(...cashParams)

    const inventoryParams = []
    const inventoryWhere = buildDateWhereClause('im.created_at', filters, inventoryParams)
    const inventoryWhereSql = inventoryWhere.length ? `WHERE ${inventoryWhere.join(' AND ')}` : ''

    const inventoryRows = db.prepare(`
      SELECT
        im.id as movement_id,
        im.created_at,
        p.name as product_name,
        p.sku,
        im.type,
        im.quantity,
        im.stock_before,
        im.stock_after,
        im.reference_type,
        im.reference_id,
        im.notes
      FROM inventory_movements im
      LEFT JOIN products p ON p.id = im.product_id
      ${inventoryWhereSql}
      ORDER BY im.created_at DESC, im.id DESC
    `).all(...inventoryParams)

    const auditParams = []
    const auditWhere = buildDateWhereClause('al.created_at', filters, auditParams)
    const auditWhereSql = auditWhere.length ? `WHERE ${auditWhere.join(' AND ')}` : ''

    const auditRows = db.prepare(`
      SELECT
        al.id as audit_id,
        al.created_at,
        al.username,
        al.display_name,
        al.entity_type,
        al.entity_id,
        al.action,
        al.description,
        COALESCE(al.payload_json, '') as payload_json
      FROM audit_logs al
      ${auditWhereSql}
      ORDER BY al.created_at DESC, al.id DESC
    `).all(...auditParams)

    const saveResult = await dialog.showSaveDialog({
      title: 'Guardar reporte completo',
      defaultPath: path.join(process.cwd(), 'reporte_operativo.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true }
    }

    const summaryRows = [
      {
        reporte: 'Ventas',
        fecha_desde: toSqlDate(filters.dateFrom) || '',
        fecha_hasta: toSqlDate(filters.dateTo) || '',
        total_ventas: salesRows.length,
        total_partidas: saleItemRows.length,
        total_pagos_venta: salePaymentsRows.length,
        total_cierres_caja: cashRows.length,
        total_movimientos_inventario: inventoryRows.length,
        total_movimientos_firmados: auditRows.length,
      },
    ]

    const workbook = XLSX.utils.book_new()
    appendSheet(workbook, 'Resumen', summaryRows)
    appendSheet(workbook, 'Ventas', salesRows)
    appendSheet(workbook, 'PartidasVenta', saleItemRows)
    appendSheet(workbook, 'PagosVenta', salePaymentsRows)
    appendSheet(workbook, 'CierresCaja', cashRows)
    appendSheet(workbook, 'MovInventario', inventoryRows)
    appendSheet(workbook, 'Auditoria', auditRows)
    XLSX.writeFile(workbook, saveResult.filePath)

    return {
      success: true,
      filePath: saveResult.filePath,
      rows: salesRows.length,
      sheets: 7,
    }
  })

  ipcMain.handle('reports:receivablesDashboard', () => {
    const db = getDb()

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN amount_due > 0 THEN 1 ELSE 0 END), 0) as open_receivables,
        COALESCE(SUM(CASE WHEN COALESCE(payment_status, 'paid') = 'partial' THEN 1 ELSE 0 END), 0) as partial_sales,
        COALESCE(SUM(CASE WHEN COALESCE(payment_status, 'paid') = 'pending' THEN 1 ELSE 0 END), 0) as pending_sales,
        COALESCE(SUM(CASE WHEN amount_due > 0 THEN amount_due ELSE 0 END), 0) as total_due,
        COALESCE(SUM(CASE WHEN amount_due > 0 AND due_date IS NOT NULL AND datetime(due_date) < datetime('now') THEN 1 ELSE 0 END), 0) as overdue_count,
        COALESCE(SUM(CASE WHEN amount_due > 0 AND due_date IS NOT NULL AND datetime(due_date) < datetime('now') THEN amount_due ELSE 0 END), 0) as overdue_amount
      FROM sales
      WHERE deleted_at IS NULL
    `).get()

    const byCustomer = db.prepare(`
      SELECT
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        COALESCE(SUM(s.amount_due), 0) as pending_balance,
        COALESCE(SUM(CASE WHEN s.amount_due > 0 THEN 1 ELSE 0 END), 0) as open_sales
      FROM sales s
      INNER JOIN customers c ON c.id = s.customer_id
      WHERE s.deleted_at IS NULL
        AND s.amount_due > 0
      GROUP BY c.id, c.name, c.phone
      ORDER BY pending_balance DESC
      LIMIT 50
    `).all()

    const paymentsByDay = db.prepare(`
      SELECT
        date(sp.created_at, 'localtime') as pay_date,
        COUNT(*) as total_payments,
        COALESCE(SUM(sp.amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN sp.payment_method = 'cash' THEN sp.amount ELSE 0 END), 0) as cash_amount,
        COALESCE(SUM(CASE WHEN sp.payment_method = 'card' THEN sp.amount ELSE 0 END), 0) as card_amount
      FROM sale_payments sp
      WHERE COALESCE(sp.is_initial, 0) = 0
      GROUP BY date(sp.created_at, 'localtime')
      ORDER BY pay_date DESC
      LIMIT 30
    `).all()

    return {
      success: true,
      summary: {
        openReceivables: Number(summary?.open_receivables || 0),
        partialSales: Number(summary?.partial_sales || 0),
        pendingSales: Number(summary?.pending_sales || 0),
        totalDue: Number(summary?.total_due || 0),
        overdueCount: Number(summary?.overdue_count || 0),
        overdueAmount: Number(summary?.overdue_amount || 0),
      },
      byCustomer: (byCustomer || []).map((row) => ({
        customerId: Number(row.customer_id),
        customerName: String(row.customer_name || ''),
        customerPhone: String(row.customer_phone || ''),
        pendingBalance: Number(row.pending_balance || 0),
        openSales: Number(row.open_sales || 0),
      })),
      paymentsByDay: (paymentsByDay || []).map((row) => ({
        payDate: String(row.pay_date || ''),
        totalPayments: Number(row.total_payments || 0),
        totalAmount: Number(row.total_amount || 0),
        cashAmount: Number(row.cash_amount || 0),
        cardAmount: Number(row.card_amount || 0),
      })),
    }
  })

  ipcMain.handle('reports:singlesDashboard', (event, filters = {}) => {
    const db = getDb()
    const outdatedDays = Number(filters?.outdatedDays || 7)
    const limitTop = Number(filters?.topLimit || 20)

    const outdatedSingles = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.card_name,
        p.set_name,
        p.finish,
        p.language,
        p.card_condition,
        p.price,
        p.starcity_price_usd,
        p.starcity_last_sync
      FROM products p
      WHERE COALESCE(p.product_type, 'normal') = 'single'
        AND p.active = 1
        AND (
          p.starcity_last_sync IS NULL OR
          datetime(p.starcity_last_sync) <= datetime('now', ?)
        )
      ORDER BY p.starcity_last_sync ASC
      LIMIT 200
    `).all(`-${Math.max(outdatedDays, 1)} days`)

    const singlesWithoutLink = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.card_name,
        p.set_name,
        p.finish,
        p.language,
        p.card_condition,
        p.price
      FROM products p
      WHERE COALESCE(p.product_type, 'normal') = 'single'
        AND p.active = 1
        AND (p.starcity_url IS NULL OR trim(p.starcity_url) = '')
      ORDER BY p.name ASC
      LIMIT 200
    `).all()

    const recentPriceChanges = db.prepare(`
      SELECT
        p.id as product_id,
        p.name,
        p.card_name,
        p.set_name,
        newer.price as latest_price_usd,
        newer.last_checked_at as latest_checked_at,
        older.price as previous_price_usd,
        older.last_checked_at as previous_checked_at
      FROM products p
      INNER JOIN single_market_prices newer
        ON newer.id = (
          SELECT smp.id
          FROM single_market_prices smp
          WHERE smp.product_id = p.id
          ORDER BY smp.id DESC
          LIMIT 1
        )
      LEFT JOIN single_market_prices older
        ON older.id = (
          SELECT smp2.id
          FROM single_market_prices smp2
          WHERE smp2.product_id = p.id
          ORDER BY smp2.id DESC
          LIMIT 1 OFFSET 1
        )
      WHERE COALESCE(p.product_type, 'normal') = 'single'
      ORDER BY newer.id DESC
      LIMIT 100
    `).all()

    const topSinglesSold = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.card_name,
        p.set_name,
        p.finish,
        p.language,
        p.card_condition,
        COALESCE(SUM(si.qty), 0) as total_qty,
        COALESCE(SUM(si.line_total), 0) as total_sales,
        COALESCE(SUM(si.line_total - (si.qty * COALESCE(si.unit_cost, 0))), 0) as estimated_margin
      FROM sale_items si
      INNER JOIN products p ON p.id = si.product_id
      WHERE COALESCE(p.product_type, 'normal') = 'single'
      GROUP BY p.id, p.name, p.card_name, p.set_name, p.finish, p.language, p.card_condition
      ORDER BY total_qty DESC, total_sales DESC
      LIMIT ?
    `).all(Math.max(limitTop, 1))

    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN COALESCE(product_type, 'normal') = 'single' AND active = 1 THEN 1 ELSE 0 END), 0) as total_singles,
        COALESCE(SUM(CASE WHEN COALESCE(product_type, 'normal') = 'single' AND active = 1 THEN stock ELSE 0 END), 0) as total_units,
        COALESCE(SUM(CASE WHEN COALESCE(product_type, 'normal') = 'single' AND active = 1 THEN stock * cost ELSE 0 END), 0) as total_cost_value,
        COALESCE(SUM(CASE WHEN COALESCE(product_type, 'normal') = 'single' AND active = 1 THEN stock * price ELSE 0 END), 0) as total_sale_value
      FROM products
    `).get()

    return {
      success: true,
      summary: {
        totalSingles: Number(totals?.total_singles || 0),
        totalUnits: Number(totals?.total_units || 0),
        totalCostValue: Number(totals?.total_cost_value || 0),
        totalSaleValue: Number(totals?.total_sale_value || 0),
        outdatedCount: Number(outdatedSingles?.length || 0),
        withoutLinkCount: Number(singlesWithoutLink?.length || 0),
      },
      outdatedSingles: (outdatedSingles || []).map((row) => ({
        id: Number(row.id),
        name: String(row.name || ''),
        cardName: String(row.card_name || ''),
        setName: String(row.set_name || ''),
        finish: String(row.finish || ''),
        language: String(row.language || ''),
        cardCondition: String(row.card_condition || ''),
        priceMxn: Number(row.price || 0),
        starcityPriceUsd: Number(row.starcity_price_usd || 0),
        starcityLastSync: row.starcity_last_sync ? String(row.starcity_last_sync) : '',
      })),
      singlesWithoutLink: (singlesWithoutLink || []).map((row) => ({
        id: Number(row.id),
        name: String(row.name || ''),
        cardName: String(row.card_name || ''),
        setName: String(row.set_name || ''),
        finish: String(row.finish || ''),
        language: String(row.language || ''),
        cardCondition: String(row.card_condition || ''),
        priceMxn: Number(row.price || 0),
      })),
      recentPriceChanges: (recentPriceChanges || []).map((row) => {
        const latest = Number(row.latest_price_usd || 0)
        const previous = Number(row.previous_price_usd || 0)
        return {
          productId: Number(row.product_id),
          name: String(row.name || ''),
          cardName: String(row.card_name || ''),
          setName: String(row.set_name || ''),
          latestPriceUsd: latest,
          previousPriceUsd: previous,
          deltaUsd: latest - previous,
          latestCheckedAt: String(row.latest_checked_at || ''),
          previousCheckedAt: String(row.previous_checked_at || ''),
        }
      }),
      topSinglesSold: (topSinglesSold || []).map((row) => ({
        id: Number(row.id),
        name: String(row.name || ''),
        cardName: String(row.card_name || ''),
        setName: String(row.set_name || ''),
        finish: String(row.finish || ''),
        language: String(row.language || ''),
        cardCondition: String(row.card_condition || ''),
        totalQty: Number(row.total_qty || 0),
        totalSales: Number(row.total_sales || 0),
        estimatedMargin: Number(row.estimated_margin || 0),
      })),
    }
  })

  ipcMain.handle('reports:preordersDashboard', (event, filters = {}) => {
    const db = getDb()
    const dateFrom = toSqlDate(filters?.dateFrom)
    const dateTo = toSqlDate(filters?.dateTo)

    const where = []
    const params = []
    if (dateFrom) {
      where.push(`date(p.created_at, 'localtime') >= ?`)
      params.push(dateFrom)
    }
    if (dateTo) {
      where.push(`date(p.created_at, 'localtime') <= ?`)
      params.push(dateTo)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_preorders,
        COALESCE(SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END), 0) as active_preorders,
        COALESCE(SUM(CASE WHEN p.status = 'partial' THEN 1 ELSE 0 END), 0) as partial_preorders,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN 1 ELSE 0 END), 0) as paid_preorders,
        COALESCE(SUM(CASE WHEN p.status = 'fulfilled' THEN 1 ELSE 0 END), 0) as fulfilled_preorders,
        COALESCE(SUM(CASE WHEN p.status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled_preorders,
        COALESCE(SUM(p.total_amount), 0) as total_amount,
        COALESCE(SUM(p.amount_paid), 0) as total_paid,
        COALESCE(SUM(p.amount_due), 0) as total_due
      FROM preorders p
      ${whereSql}
    `).get(...params)

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

    const byCustomer = db.prepare(`
      SELECT
        c.id as customer_id,
        c.name as customer_name,
        COUNT(p.id) as total_preorders,
        COALESCE(SUM(p.amount_due), 0) as pending_balance,
        COALESCE(SUM(p.total_amount), 0) as total_amount
      FROM preorders p
      INNER JOIN customers c ON c.id = p.customer_id
      ${whereSql}
      GROUP BY c.id, c.name
      ORDER BY pending_balance DESC, total_preorders DESC
      LIMIT 20
    `).all(...params)

    const byProduct = db.prepare(`
      SELECT
        pi.product_name,
        COALESCE(pi.sku, '') as sku,
        COALESCE(SUM(pi.quantity), 0) as total_qty,
        COALESCE(SUM(pi.line_total), 0) as total_amount
      FROM preorder_items pi
      INNER JOIN preorders p ON p.id = pi.preorder_id
      ${whereSql}
      GROUP BY pi.product_name, COALESCE(pi.sku, '')
      ORDER BY total_qty DESC, total_amount DESC
      LIMIT 30
    `).all(...params)

    const byReleaseDate = db.prepare(`
      SELECT
        date(p.release_date, 'localtime') as release_date,
        COUNT(*) as total_preorders,
        COALESCE(SUM(p.total_amount), 0) as total_amount,
        COALESCE(SUM(p.amount_due), 0) as total_due
      FROM preorders p
      WHERE p.release_date IS NOT NULL
      GROUP BY date(p.release_date, 'localtime')
      ORDER BY release_date ASC
      LIMIT 60
    `).all()

    return {
      success: true,
      summary: {
        totalPreorders: Number(summary?.total_preorders || 0),
        activePreorders: Number(summary?.active_preorders || 0),
        partialPreorders: Number(summary?.partial_preorders || 0),
        paidPreorders: Number(summary?.paid_preorders || 0),
        fulfilledPreorders: Number(summary?.fulfilled_preorders || 0),
        cancelledPreorders: Number(summary?.cancelled_preorders || 0),
        totalAmount: Number(summary?.total_amount || 0),
        totalPaid: Number(summary?.total_paid || 0),
        totalDue: Number(summary?.total_due || 0),
      },
      paymentsToday: {
        totalPayments: Number(paymentsToday?.total_payments || 0),
        totalAmount: Number(paymentsToday?.total_amount || 0),
        cashAmount: Number(paymentsToday?.cash_amount || 0),
        cardAmount: Number(paymentsToday?.card_amount || 0),
        transferAmount: Number(paymentsToday?.transfer_amount || 0),
      },
      byCustomer: (byCustomer || []).map((row) => ({
        customerId: Number(row.customer_id),
        customerName: String(row.customer_name || ''),
        totalPreorders: Number(row.total_preorders || 0),
        pendingBalance: Number(row.pending_balance || 0),
        totalAmount: Number(row.total_amount || 0),
      })),
      byProduct: (byProduct || []).map((row) => ({
        productName: String(row.product_name || ''),
        sku: String(row.sku || ''),
        totalQty: Number(row.total_qty || 0),
        totalAmount: Number(row.total_amount || 0),
      })),
      byReleaseDate: (byReleaseDate || []).map((row) => ({
        releaseDate: String(row.release_date || ''),
        totalPreorders: Number(row.total_preorders || 0),
        totalAmount: Number(row.total_amount || 0),
        totalDue: Number(row.total_due || 0),
      })),
    }
  })
}

module.exports = { registerReportHandlers }
