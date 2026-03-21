const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
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

function buildSalesFilter(filters = {}, tableAlias = 's') {
  const dateFrom = toSqlDate(filters.dateFrom)
  const dateTo = toSqlDate(filters.dateTo)

  const where = []
  const params = []

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

    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(CASE WHEN s.credit_used > 0 THEN 1 ELSE 0 END), 0) as sales_with_credit,
        COALESCE(SUM(CASE WHEN s.credit_used <= 0 THEN 1 ELSE 0 END), 0) as sales_without_credit,
        COALESCE(SUM(s.total), 0) as total_amount,
        COALESCE(SUM(s.credit_used), 0) as credit_used_amount,
        COALESCE(SUM(s.total + s.credit_used), 0) as gross_amount,
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total ELSE 0 END), 0) as cash_amount,
        COALESCE(SUM(CASE WHEN s.payment_method = 'card' THEN s.total ELSE 0 END), 0) as card_amount,
        COALESCE(AVG(s.total), 0) as average_ticket
      FROM sales s
      ${whereSql}
    `).get(...params)

    const byDay = db.prepare(`
      SELECT
        date(s.created_at, 'localtime') as sale_date,
        COUNT(*) as total_sales,
        COALESCE(SUM(s.total), 0) as total_amount,
        COALESCE(SUM(s.credit_used), 0) as credit_used_amount,
        COALESCE(SUM(s.total + s.credit_used), 0) as gross_amount,
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total ELSE 0 END), 0) as cash_amount,
        COALESCE(SUM(CASE WHEN s.payment_method = 'card' THEN s.total ELSE 0 END), 0) as card_amount
      FROM sales s
      ${whereSql}
      GROUP BY date(s.created_at, 'localtime')
      ORDER BY sale_date DESC
    `).all(...params)

    const byPayment = db.prepare(`
      SELECT
        s.payment_method,
        COUNT(*) as total_sales,
        COALESCE(SUM(s.total), 0) as total_amount,
        COALESCE(SUM(s.credit_used), 0) as credit_used_amount
      FROM sales s
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
        totalAmount: Number(summary?.total_amount || 0),
        creditUsedAmount: Number(summary?.credit_used_amount || 0),
        grossAmount: Number(summary?.gross_amount || 0),
        cashAmount: Number(summary?.cash_amount || 0),
        cardAmount: Number(summary?.card_amount || 0),
        averageTicket: Number(summary?.average_ticket || 0),
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

    const rows = db.prepare(`
      SELECT
        s.id,
        s.folio,
        s.created_at,
        s.payment_method,
        s.subtotal,
        s.discount,
        s.total,
        s.credit_used,
        s.cash_received,
        s.change_given,
        c.name as customer_name,
        si.product_name,
        si.sku,
        si.qty,
        si.unit_price,
        si.line_total
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      ${whereSql}
      ORDER BY s.created_at DESC, si.id ASC
    `).all(...params)

    const saveResult = await dialog.showSaveDialog({
      title: 'Guardar reporte de ventas',
      defaultPath: path.join(process.cwd(), 'reporte_ventas.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true }
    }

    const header = [
      'sale_id',
      'folio',
      'created_at',
      'payment_method',
      'subtotal',
      'discount',
      'total',
      'credit_used',
      'cash_received',
      'change_given',
      'customer_name',
      'product_name',
      'sku',
      'qty',
      'unit_price',
      'line_total',
    ]

    const lines = [header.join(',')]

    for (const row of rows) {
      lines.push([
        escapeCsv(row.id),
        escapeCsv(row.folio),
        escapeCsv(row.created_at),
        escapeCsv(row.payment_method),
        escapeCsv(row.subtotal),
        escapeCsv(row.discount),
        escapeCsv(row.total),
        escapeCsv(row.credit_used),
        escapeCsv(row.cash_received),
        escapeCsv(row.change_given),
        escapeCsv(row.customer_name),
        escapeCsv(row.product_name),
        escapeCsv(row.sku),
        escapeCsv(row.qty),
        escapeCsv(row.unit_price),
        escapeCsv(row.line_total),
      ].join(','))
    }

    fs.writeFileSync(saveResult.filePath, lines.join('\n'), 'utf8')

    return {
      success: true,
      filePath: saveResult.filePath,
      rows: rows.length,
    }
  })
}

module.exports = { registerReportHandlers }
