
const { app, BrowserWindow, protocol, net } = require('electron')
const path = require('path')
const { initializeDatabase } = require('./database/init.cjs')
const { registerProductHandlers } = require('./ipc/products.cjs')
const { registerSalesHandlers } = require('./ipc/sales.cjs')
const { registerHistoryHandlers } = require('./ipc/history.cjs')
const { registerCashHandlers } = require('./ipc/cash.cjs')
const { registerPrintHandlers } = require('./ipc/print.cjs')
const { registerSettingsHandlers } = require('./ipc/settings.cjs')
const { pathToFileURL } = require('url')
const { registerBackupHandlers } = require('./ipc/backup.cjs')
const { registerReportHandlers } = require('./ipc/reports.cjs')
const {registerCustomerHandlers} = require('./ipc/customers.cjs')
const { registerTournamentHandlers } = require('./ipc/tournaments.cjs')
const { registerInventoryHandlers } = require('./ipc/inventory.cjs')
const { registerReceivableHandlers } = require('./ipc/receivables.cjs')
const { registerSinglesHandlers } = require('./ipc/singles.cjs')
const { registerPreorderHandlers } = require('./ipc/preorders.cjs')
const { registerUserHandlers } = require('./ipc/users.cjs')
const { runServerSyncCycle, startServerSyncScheduler, stopServerSyncScheduler } = require('./ipc/server-sync.cjs')
const { getDb } = require('./database/db.cjs')


const isDev = !app.isPackaged


function registerLocalFileProtocol() {
  protocol.handle('local-file', (request) => {
    const encodedPath = request.url.replace('local-file://', '')
    const filePath = decodeURIComponent(encodedPath)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1E1E1E',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  registerSettingsHandlers()
  initializeDatabase()
  registerProductHandlers()
  registerSalesHandlers()
  registerLocalFileProtocol()
  registerHistoryHandlers()
  registerPrintHandlers()
  registerCashHandlers()
  registerBackupHandlers()
  registerReportHandlers()
  registerCustomerHandlers()
  registerTournamentHandlers()
  registerInventoryHandlers()
  registerReceivableHandlers()
  registerSinglesHandlers()
  registerPreorderHandlers()
  registerUserHandlers()
  createWindow()
  startServerSyncScheduler(getDb())
  runServerSyncCycle(getDb(), { limit: 100 }).catch((error) => {
    console.error('No se pudo ejecutar el ciclo inicial de sincronizacion con el servidor:', error)
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopServerSyncScheduler()
})
