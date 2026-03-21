const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')

function registerHistoryHandlers() {
  ipcMain.handle('sales:listToday', () => {
    const db = getDb()

    const sales = db.prepare(`
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
        s.status,
        s.created_at,
        s.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE date(s.created_at, 'localtime') = date('now', 'localtime')
      ORDER BY s.id DESC
    `).all()

    return (sales || []).map(row => ({
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
      status: String(row.status || ''),
      createdAt: String(row.created_at || ''),
      customerId: row.customer_id ? Number(row.customer_id) : null,
      customerName: String(row.customer_name || ''),
      customerPhone: String(row.customer_phone || ''),
    }))
  })

  ipcMain.handle('sales:getDetail', (event, saleId) => {
    const db = getDb()
    const id = Number(saleId)

    if (!id) {
      throw new Error('ID de venta inválido.')
    }

    const sale = db.prepare(`
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
        s.status,
        s.created_at,
        s.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = ?
      LIMIT 1
    `).get(id)

    if (!sale) {
      throw new Error('Venta no encontrada.')
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
        unit_cost,
        line_total
      FROM sale_items
      WHERE sale_id = ?
      ORDER BY id ASC
    `).all(id)

    return {
      sale: {
        id: Number(sale.id),
        folio: String(sale.folio || ''),
        subtotal: Number(sale.subtotal || 0),
        discount: Number(sale.discount || 0),
        total: Number(sale.total || 0),
        creditUsed: Number(sale.credit_used || 0),
        totalBeforeCredit: Number(sale.total || 0) + Number(sale.credit_used || 0),
        amountPaid: Number(sale.amount_paid || 0),
        amountDue: Number(sale.amount_due || 0),
        paymentStatus: String(sale.payment_status || 'paid'),
        paymentMethod: String(sale.payment_method || ''),
        cashReceived: Number(sale.cash_received || 0),
        changeGiven: Number(sale.change_given || 0),
        status: String(sale.status || ''),
        createdAt: String(sale.created_at || ''),
        customerId: sale.customer_id ? Number(sale.customer_id) : null,
        customerName: String(sale.customer_name || ''),
        customerPhone: String(sale.customer_phone || ''),
        customerEmail: String(sale.customer_email || ''),
      },
            items: (items || []).map(item => ({
        id: Number(item.id),
        saleId: Number(item.sale_id),
        productId: Number(item.product_id || 0),
        sku: String(item.sku || ''),
        productName: String(item.product_name || ''),
        qty: Number(item.qty || 0),
        unitPrice: Number(item.unit_price || 0),
        unitCost: Number(item.unit_cost || 0),
        lineTotal: Number(item.line_total || 0),
      })),
    }
  })
}

module.exports = { registerHistoryHandlers }
