const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')

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

    const salesSummary = db.prepare(`
      SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(total), 0) as total_sales_amount,
        COALESCE(SUM(credit_used), 0) as total_credit_used,
        COALESCE(SUM(total + credit_used), 0) as gross_sales_amount,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_sales_amount,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_sales_amount
      FROM sales
      WHERE created_at >= ?
    `).get(openSession.opened_at)

    const expectedAmount =
      Number(openSession.opening_amount || 0) +
      Number(salesSummary.cash_sales_amount || 0)

    const difference =
      Number(closingAmount || 0) - expectedAmount

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
      Number(expectedAmount || 0),
      Number(difference || 0),
      String(notes || ''),
      Number(openSession.id)
    )

    return {
      success: true,
      summary: {
        sessionId: Number(openSession.id),
        openingAmount: Number(openSession.opening_amount || 0),
        totalSales: Number(salesSummary.total_sales || 0),
        totalSalesAmount: Number(salesSummary.total_sales_amount || 0),
        totalCreditUsed: Number(salesSummary.total_credit_used || 0),
        grossSalesAmount: Number(salesSummary.gross_sales_amount || 0),
        cashSalesAmount: Number(salesSummary.cash_sales_amount || 0),
        cardSalesAmount: Number(salesSummary.card_sales_amount || 0),
        expectedAmount: Number(expectedAmount || 0),
        closingAmount: Number(closingAmount || 0),
        difference: Number(difference || 0),
      },
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

    const salesSummary = db.prepare(`
      SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(total), 0) as total_sales_amount,
        COALESCE(SUM(credit_used), 0) as total_credit_used,
        COALESCE(SUM(total + credit_used), 0) as gross_sales_amount,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_sales_amount,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_sales_amount
      FROM sales
      WHERE created_at >= ?
    `).get(openSession.opened_at)

    const expectedAmount =
      Number(openSession.opening_amount || 0) +
      Number(salesSummary.cash_sales_amount || 0)

    return {
      sessionId: Number(openSession.id),
      openedAt: openSession.opened_at,
      openingAmount: Number(openSession.opening_amount || 0),
      totalSales: Number(salesSummary.total_sales || 0),
      totalSalesAmount: Number(salesSummary.total_sales_amount || 0),
      totalCreditUsed: Number(salesSummary.total_credit_used || 0),
      grossSalesAmount: Number(salesSummary.gross_sales_amount || 0),
      cashSalesAmount: Number(salesSummary.cash_sales_amount || 0),
      cardSalesAmount: Number(salesSummary.card_sales_amount || 0),
      expectedAmount: Number(expectedAmount || 0),
    }
  })
}

module.exports = { registerCashHandlers }
