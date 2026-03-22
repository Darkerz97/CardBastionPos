const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')
const { requirePermission, getAuditActor } = require('../auth/helpers.cjs')
const { createSaleRecord } = require('./sales-service.cjs')

function registerSalesHandlers() {
  ipcMain.handle('sales:create', (event, payload) => {
    requirePermission('pos', 'registrar ventas')
    const db = getDb()
    return createSaleRecord(db, payload, getAuditActor())
  })
}

module.exports = { registerSalesHandlers }
