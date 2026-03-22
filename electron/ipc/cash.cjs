const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')
const { requirePermission, getAuditActor } = require('../auth/helpers.cjs')
const { logAudit } = require('../audit.cjs')

function getRangeClause(column, closedAt) {
  if (closedAt) {
    return `${column} >= ? AND ${column} <= ?`
  }

  return `${column} >= ?`
}

function getRangeParams(openedAt, closedAt) {
  return closedAt ? [openedAt, closedAt] : [openedAt]
}

function getSessionSalesSummary(db, openedAt, closedAt = null) {
  const rangeClause = getRangeClause('s.created_at', closedAt)
  return db.prepare(`
    WITH payment_stats AS (
      SELECT
        sale_id,
        COALESCE(SUM(CASE WHEN COALESCE(is_initial, 0) = 1 THEN amount ELSE 0 END), 0) as initial_amount,
        COUNT(*) as total_payments
      FROM sale_payments
      GROUP BY sale_id
    )
    SELECT
      COUNT(*) as total_sales,
      COALESCE(SUM(total), 0) as total_sales_amount,
      COALESCE(SUM(credit_used), 0) as total_credit_used,
      COALESCE(SUM(total + credit_used), 0) as gross_sales_amount,
      COALESCE(SUM(CASE
        WHEN s.payment_method = 'cash' THEN
          CASE
            WHEN COALESCE(ps.total_payments, 0) > 0 THEN COALESCE(ps.initial_amount, 0)
            ELSE CASE WHEN COALESCE(s.payment_status, 'paid') = 'paid' THEN COALESCE(s.total, 0) ELSE 0 END
          END
        ELSE 0
      END), 0) as cash_sales_amount,
      COALESCE(SUM(CASE
        WHEN s.payment_method = 'card' THEN
          CASE
            WHEN COALESCE(ps.total_payments, 0) > 0 THEN COALESCE(ps.initial_amount, 0)
            ELSE CASE WHEN COALESCE(s.payment_status, 'paid') = 'paid' THEN COALESCE(s.total, 0) ELSE 0 END
          END
        ELSE 0
      END), 0) as card_sales_amount,
      COALESCE(SUM(CASE
        WHEN s.payment_method NOT IN ('cash', 'card') THEN
          CASE
            WHEN COALESCE(ps.total_payments, 0) > 0 THEN COALESCE(ps.initial_amount, 0)
            ELSE CASE WHEN COALESCE(s.payment_status, 'paid') = 'paid' THEN COALESCE(s.total, 0) ELSE 0 END
          END
        ELSE 0
      END), 0) as other_sales_amount
    FROM sales s
    LEFT JOIN payment_stats ps ON ps.sale_id = s.id
    WHERE s.deleted_at IS NULL
      AND ${rangeClause}
  `).get(...getRangeParams(openedAt, closedAt))
}

function getSessionReceivablePaymentsSummary(db, openedAt, closedAt = null) {
  const rangeClause = getRangeClause('sp.created_at', closedAt)
  return db.prepare(`
    SELECT
      COALESCE(SUM(sp.amount), 0) as receivable_total_amount,
      COALESCE(SUM(CASE WHEN sp.payment_method = 'cash' THEN sp.amount ELSE 0 END), 0) as receivable_cash_amount,
      COALESCE(SUM(CASE WHEN sp.payment_method = 'card' THEN sp.amount ELSE 0 END), 0) as receivable_card_amount,
      COALESCE(SUM(CASE WHEN sp.payment_method NOT IN ('cash', 'card') THEN sp.amount ELSE 0 END), 0) as receivable_other_amount,
      COUNT(*) as receivable_payments_count
    FROM sale_payments sp
    WHERE ${rangeClause}
      AND COALESCE(sp.is_initial, 0) = 0
  `).get(...getRangeParams(openedAt, closedAt))
}

function getSessionPreorderPaymentsSummary(db, openedAt, closedAt = null) {
  const rangeClause = getRangeClause('pp.created_at', closedAt)
  return db.prepare(`
    SELECT
      COALESCE(SUM(pp.amount), 0) as preorder_total_amount,
      COALESCE(SUM(CASE WHEN pp.payment_method = 'cash' THEN pp.amount ELSE 0 END), 0) as preorder_cash_amount,
      COALESCE(SUM(CASE WHEN pp.payment_method = 'card' THEN pp.amount ELSE 0 END), 0) as preorder_card_amount,
      COALESCE(SUM(CASE WHEN pp.payment_method NOT IN ('cash', 'card') THEN pp.amount ELSE 0 END), 0) as preorder_other_amount,
      COUNT(*) as preorder_payments_count
    FROM preorder_payments pp
    WHERE ${rangeClause}
  `).get(...getRangeParams(openedAt, closedAt))
}

function buildCashSummary(openSession, salesSummary, receivablePaymentsSummary, preorderPaymentsSummary, closingAmount = null) {
  const expectedAmount =
    Number(openSession.opening_amount || 0) +
    Number(salesSummary.cash_sales_amount || 0) +
    Number(receivablePaymentsSummary.receivable_cash_amount || 0) +
    Number(preorderPaymentsSummary.preorder_cash_amount || 0)

  const difference = closingAmount === null
    ? null
    : Number(closingAmount || 0) - Number(expectedAmount || 0)

  return {
    sessionId: Number(openSession.id),
    openedAt: String(openSession.opened_at || ''),
    closedAt: String(openSession.closed_at || ''),
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
    preorderPaymentsCount: Number(preorderPaymentsSummary.preorder_payments_count || 0),
    preorderTotalAmount: Number(preorderPaymentsSummary.preorder_total_amount || 0),
    preorderCashAmount: Number(preorderPaymentsSummary.preorder_cash_amount || 0),
    preorderCardAmount: Number(preorderPaymentsSummary.preorder_card_amount || 0),
    preorderOtherAmount: Number(preorderPaymentsSummary.preorder_other_amount || 0),
    expectedAmount: Number(expectedAmount || 0),
    closingAmount: closingAmount === null ? null : Number(closingAmount || 0),
    difference: difference === null ? null : Number(difference || 0),
    notes: String(openSession.notes || ''),
  }
}

function getSummaryForSession(db, session, closingAmount = null) {
  const salesSummary = getSessionSalesSummary(db, session.opened_at, session.closed_at || null)
  const receivablePaymentsSummary = getSessionReceivablePaymentsSummary(db, session.opened_at, session.closed_at || null)
  const preorderPaymentsSummary = getSessionPreorderPaymentsSummary(db, session.opened_at, session.closed_at || null)

  return buildCashSummary(
    session,
    salesSummary,
    receivablePaymentsSummary,
    preorderPaymentsSummary,
    closingAmount
  )
}

function registerCashHandlers() {
  ipcMain.handle('cash:getOpenSession', () => {
    requirePermission('cash', 'consultar caja')
    const db = getDb()

    const session = db.prepare(`
      SELECT *
      FROM cash_sessions
      WHERE status = 'open'
        AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `).get()

    return session || null
  })

  ipcMain.handle('cash:openSession', (event, openingAmount) => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('cash', 'abrir caja')

    const existing = db.prepare(`
      SELECT id
      FROM cash_sessions
      WHERE status = 'open'
        AND deleted_at IS NULL
      LIMIT 1
    `).get()

    if (existing) {
      throw new Error('Ya existe una caja abierta.')
    }

    const result = db.prepare(`
      INSERT INTO cash_sessions (
        opened_at,
        opening_amount,
        status,
        opened_by_user_id,
        updated_at,
        updated_by_user_id
      ) VALUES (
        CURRENT_TIMESTAMP,
        ?,
        'open',
        ?,
        CURRENT_TIMESTAMP,
        ?
      )
    `).run(Number(openingAmount || 0), actor.userId || null, actor.userId || null)

    const sessionId = Number(result.lastInsertRowid)

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'cash_session',
      entityId: sessionId,
      action: 'open',
      description: `Caja ${sessionId} abierta`,
      payloadJson: { openingAmount: Number(openingAmount || 0) },
    })

    return {
      success: true,
      sessionId,
    }
  })

  ipcMain.handle('cash:closeSession', (event, payload) => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('cash', 'cerrar caja')

    const { closingAmount = 0, notes = '' } = payload || {}

    const openSession = db.prepare(`
      SELECT *
      FROM cash_sessions
      WHERE status = 'open'
        AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `).get()

    if (!openSession) {
      throw new Error('No hay una caja abierta.')
    }

    const closedAt = new Date().toISOString()
    const sessionForSummary = { ...openSession, closed_at: closedAt, notes: String(notes || '') }
    const summary = getSummaryForSession(db, sessionForSummary, Number(closingAmount || 0))

    db.prepare(`
      UPDATE cash_sessions
      SET
        closed_at = ?,
        closing_amount = ?,
        expected_amount = ?,
        difference = ?,
        notes = ?,
        status = 'closed',
        closed_by_user_id = ?,
        updated_at = CURRENT_TIMESTAMP,
        updated_by_user_id = ?
      WHERE id = ?
    `).run(
      closedAt,
      Number(closingAmount || 0),
      Number(summary.expectedAmount || 0),
      Number(summary.difference || 0),
      String(notes || ''),
      actor.userId || null,
      actor.userId || null,
      Number(openSession.id)
    )

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'cash_session',
      entityId: Number(openSession.id),
      action: 'close',
      description: `Caja ${openSession.id} cerrada`,
      payloadJson: {
        closingAmount: Number(closingAmount || 0),
        expectedAmount: Number(summary.expectedAmount || 0),
        difference: Number(summary.difference || 0),
      },
    })

    return {
      success: true,
      summary,
    }
  })

  ipcMain.handle('cash:getCurrentSummary', () => {
    requirePermission('cash', 'consultar resumen de caja')
    const db = getDb()

    const openSession = db.prepare(`
      SELECT *
      FROM cash_sessions
      WHERE status = 'open'
        AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `).get()

    if (!openSession) {
      return null
    }

    return getSummaryForSession(db, openSession, null)
  })

  ipcMain.handle('cash:listSessions', () => {
    requirePermission('cash', 'consultar cierres de caja')
    const db = getDb()

    return db.prepare(`
      SELECT *
      FROM cash_sessions
      WHERE deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 120
    `).all().map((row) => ({
      id: Number(row.id),
      openedAt: String(row.opened_at || ''),
      closedAt: String(row.closed_at || ''),
      openingAmount: Number(row.opening_amount || 0),
      closingAmount: Number(row.closing_amount || 0),
      expectedAmount: Number(row.expected_amount || 0),
      difference: Number(row.difference || 0),
      notes: String(row.notes || ''),
      status: String(row.status || ''),
    }))
  })

  ipcMain.handle('cash:updateSession', (event, payload) => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('cash', 'editar cierres de caja')
    const sessionId = Number(payload?.id || 0)

    if (!sessionId) {
      throw new Error('Cierre de caja invalido.')
    }

    const session = db.prepare(`
      SELECT *
      FROM cash_sessions
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `).get(sessionId)

    if (!session || String(session.status || '') !== 'closed') {
      throw new Error('Solo puedes editar cierres de caja ya cerrados.')
    }

    const closingAmount = Number(payload?.closingAmount ?? session.closing_amount ?? 0)
    const notes = String(payload?.notes ?? session.notes ?? '')
    const summary = getSummaryForSession(db, { ...session, notes }, closingAmount)

    db.prepare(`
      UPDATE cash_sessions
      SET
        closing_amount = ?,
        expected_amount = ?,
        difference = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP,
        updated_by_user_id = ?
      WHERE id = ?
    `).run(
      closingAmount,
      Number(summary.expectedAmount || 0),
      Number(summary.difference || 0),
      notes,
      actor.userId || null,
      sessionId
    )

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'cash_session',
      entityId: sessionId,
      action: 'update',
      description: `Cierre de caja ${sessionId} actualizado`,
      payloadJson: { closingAmount, notes },
    })

    return { success: true, summary }
  })

  ipcMain.handle('cash:deleteSession', (event, payload) => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('cash', 'eliminar cierres de caja')
    const sessionId = Number(payload?.id || payload || 0)

    if (!sessionId) {
      throw new Error('Cierre de caja invalido.')
    }

    const session = db.prepare(`
      SELECT *
      FROM cash_sessions
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `).get(sessionId)

    if (!session || String(session.status || '') !== 'closed') {
      throw new Error('Solo puedes eliminar cierres de caja cerrados.')
    }

    db.prepare(`
      UPDATE cash_sessions
      SET
        deleted_at = CURRENT_TIMESTAMP,
        deleted_by_user_id = ?,
        updated_at = CURRENT_TIMESTAMP,
        updated_by_user_id = ?
      WHERE id = ?
    `).run(actor.userId || null, actor.userId || null, sessionId)

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'cash_session',
      entityId: sessionId,
      action: 'delete',
      description: `Cierre de caja ${sessionId} eliminado`,
      payloadJson: { reason: String(payload?.reason || '') },
    })

    return { success: true, id: sessionId }
  })
}

module.exports = { registerCashHandlers }
