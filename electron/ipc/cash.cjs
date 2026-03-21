const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')

function getSessionSalesSummary(db, openedAt) {
  return db.prepare(`
    WITH initial_payments AS (
      SELECT
        sale_id,
        COALESCE(SUM(amount), 0) as initial_amount
      FROM sale_payments
      WHERE COALESCE(is_initial, 0) = 1
      GROUP BY sale_id
    )
    SELECT
      COUNT(*) as total_sales,
      COALESCE(SUM(total), 0) as total_sales_amount,
      COALESCE(SUM(credit_used), 0) as total_credit_used,
      COALESCE(SUM(total + credit_used), 0) as gross_sales_amount,
      COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN COALESCE(ip.initial_amount, s.total) ELSE 0 END), 0) as cash_sales_amount,
      COALESCE(SUM(CASE WHEN s.payment_method = 'card' THEN COALESCE(ip.initial_amount, s.total) ELSE 0 END), 0) as card_sales_amount,
      COALESCE(SUM(CASE WHEN s.payment_method NOT IN ('cash', 'card') THEN COALESCE(ip.initial_amount, s.total) ELSE 0 END), 0) as other_sales_amount
    FROM sales s
    LEFT JOIN initial_payments ip ON ip.sale_id = s.id
    WHERE s.created_at >= ?
  `).get(openedAt)
}

function getSessionReceivablePaymentsSummary(db, openedAt) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(sp.amount), 0) as receivable_total_amount,
      COALESCE(SUM(CASE WHEN sp.payment_method = 'cash' THEN sp.amount ELSE 0 END), 0) as receivable_cash_amount,
      COALESCE(SUM(CASE WHEN sp.payment_method = 'card' THEN sp.amount ELSE 0 END), 0) as receivable_card_amount,
      COALESCE(SUM(CASE WHEN sp.payment_method NOT IN ('cash', 'card') THEN sp.amount ELSE 0 END), 0) as receivable_other_amount,
      COUNT(*) as receivable_payments_count
    FROM sale_payments sp
    WHERE sp.created_at >= ?
      AND COALESCE(sp.is_initial, 0) = 0
  `).get(openedAt)
}

function buildCashSummary(openSession, salesSummary, receivablePaymentsSummary, closingAmount = null) {
  const expectedAmount =
    Number(openSession.opening_amount || 0) +
    Number(salesSummary.cash_sales_amount || 0) +
    Number(receivablePaymentsSummary.receivable_cash_amount || 0)

  const difference = closingAmount === null
    ? null
    : Number(closingAmount || 0) - Number(expectedAmount || 0)

  return {
    sessionId: Number(openSession.id),
    openingAmount: Number(openSession.opening_amount || 0),
    totalSales: Number(salesSummary.total_sales || 0),
    totalSalesAmount: Number(salesSummary.total_sales_amount || 0),
    totalCreditUsed: Number(salesSummary.total_credit_used || 0),
    grossSalesAmount: Number(salesSummary.gross_sales_amount || 0),
    cashSalesAmount: Number(salesSummary.cash_sales_amount || 0),
    cardSalesAmount: Number(salesSummary.card_sales_amount || 0),
    otherSalesAmount: Number(salesSummary.other_sales_amount || 0),
    receivablePaymentsCount: Number(receivablePaymentsSummary.receivable_payments_count || 0),
    receivableTotalAmount: Number(receivablePaymentsSummary.receivable_total_amount || 0),
    receivableCashAmount: Number(receivablePaymentsSummary.receivable_cash_amount || 0),
    receivableCardAmount: Number(receivablePaymentsSummary.receivable_card_amount || 0),
    receivableOtherAmount: Number(receivablePaymentsSummary.receivable_other_amount || 0),
    expectedAmount: Number(expectedAmount || 0),
    closingAmount: closingAmount === null ? null : Number(closingAmount || 0),
    difference: difference === null ? null : Number(difference || 0),
  }
}

function registerCashHandlers() {
  ipcMain.handle('cash:getOpenSession', () => {
    const db = getDb()

    const session = db.prepare(`
      SELECT *
      FROM cash_sessions
      WHERE status = 'open'
      ORDER BY id DESC
      LIMIT 1
    `).get()

    return session || null
  })

  ipcMain.handle('cash:openSession', (event, openingAmount) => {
    const db = getDb()

    const existing = db.prepare(`
      SELECT id
      FROM cash_sessions
      WHERE status = 'open'
      LIMIT 1
    `).get()

    if (existing) {
      throw new Error('Ya existe una caja abierta.')
    }

    const result = db.prepare(`
      INSERT INTO cash_sessions (
        opened_at,
        opening_amount,
        status
      ) VALUES (
        CURRENT_TIMESTAMP,
        ?,
        'open'
      )
    `).run(Number(openingAmount || 0))

    return {
      success: true,
      sessionId: Number(result.lastInsertRowid),
    }
  })

  ipcMain.handle('cash:closeSession', (event, payload) => {
    const db = getDb()

    const {
      closingAmount = 0,
      notes = '',
    } = payload || {}

    const openSession = db.prepare(`
      SELECT *
      FROM cash_sessions
      WHERE status = 'open'
      ORDER BY id DESC
      LIMIT 1
    `).get()

    if (!openSession) {
      throw new Error('No hay una caja abierta.')
    }

    const salesSummary = getSessionSalesSummary(db, openSession.opened_at)
    const receivablePaymentsSummary = getSessionReceivablePaymentsSummary(db, openSession.opened_at)
    const summary = buildCashSummary(openSession, salesSummary, receivablePaymentsSummary, Number(closingAmount || 0))

    db.prepare(`
      UPDATE cash_sessions
      SET
        closed_at = CURRENT_TIMESTAMP,
        closing_amount = ?,
        expected_amount = ?,
        difference = ?,
        notes = ?,
        status = 'closed'
      WHERE id = ?
    `).run(
      Number(closingAmount || 0),
      Number(summary.expectedAmount || 0),
      Number(summary.difference || 0),
      String(notes || ''),
      Number(openSession.id)
    )

    return {
      success: true,
      summary,
    }
  })

  ipcMain.handle('cash:getCurrentSummary', () => {
    const db = getDb()

    const openSession = db.prepare(`
      SELECT *
      FROM cash_sessions
      WHERE status = 'open'
      ORDER BY id DESC
      LIMIT 1
    `).get()

    if (!openSession) {
      return null
    }

    const salesSummary = getSessionSalesSummary(db, openSession.opened_at)
    const receivablePaymentsSummary = getSessionReceivablePaymentsSummary(db, openSession.opened_at)
    const summary = buildCashSummary(openSession, salesSummary, receivablePaymentsSummary, null)

    return {
      ...summary,
      openedAt: openSession.opened_at,
    }
  })
}

module.exports = { registerCashHandlers }
