const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('posAPI', {
  // =========================
  // Sesion / usuarios
  // =========================
  listLoginUsers: () => ipcRenderer.invoke('auth:listUsers'),
  login: (payload) => ipcRenderer.invoke('auth:login', payload),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getCurrentSession: () => ipcRenderer.invoke('auth:getSession'),
  getUsers: () => ipcRenderer.invoke('users:list'),
  createUser: (payload) => ipcRenderer.invoke('users:create', payload),
  updateUser: (payload) => ipcRenderer.invoke('users:update', payload),
  getWindowDefinitions: () => ipcRenderer.invoke('users:getWindowDefinitions'),
  getAuditLogs: () => ipcRenderer.invoke('audit:list'),

  // =========================
  // Productos
  // =========================
  getProducts: () => ipcRenderer.invoke('products:list'),
  getInactiveProducts: () => ipcRenderer.invoke('products:listInactive'),
  findProductByCode: (code) => ipcRenderer.invoke('products:findByCode', code),
  createProduct: (payload) => ipcRenderer.invoke('products:create', payload),
  updateProduct: (payload) => ipcRenderer.invoke('products:update', payload),
  deactivateProduct: (productId) => ipcRenderer.invoke('products:deactivate', productId),
  reactivateProduct: (productId) => ipcRenderer.invoke('products:reactivate', productId),
  deleteProduct: (payload) => ipcRenderer.invoke('products:delete', payload),
  getProductCatalogOptions: () => ipcRenderer.invoke('products:getCatalogOptions'),
  importProductsFromExcel: () => ipcRenderer.invoke('products:importExcel'),
  exportProductTemplate: () => ipcRenderer.invoke('products:exportTemplate'),
  selectProductImage: () => ipcRenderer.invoke('products:selectImage'),
  getProductImageUrl: (fileName) => ipcRenderer.invoke('products:getImageDataUrl', fileName),
  getProductImage: (fileName) => ipcRenderer.invoke('products:getImageDataUrl', fileName),

  // =========================
  // Singles
  // =========================
  searchSinglesCatalog: (payload) => ipcRenderer.invoke('singles:searchCatalog', payload),
  openStarCitySearch: (payload) => ipcRenderer.invoke('singles:openStarCitySearch', payload),
  fetchSingleStarCityPriceFromUrl: (payload) => ipcRenderer.invoke('singles:fetchPriceFromUrl', payload),
  getSingles: (filters) => ipcRenderer.invoke('singles:list', filters),
  getSingleById: (productId) => ipcRenderer.invoke('singles:getById', productId),
  createSingle: (payload) => ipcRenderer.invoke('singles:create', payload),
  updateSingle: (payload) => ipcRenderer.invoke('singles:update', payload),
  linkSingleStarCity: (payload) => ipcRenderer.invoke('singles:linkStarCity', payload),
  updateSingleStarCityPrice: (payload) => ipcRenderer.invoke('singles:updateStarCityPrice', payload),
  updateSingleStarCityPricesBatch: (payload) => ipcRenderer.invoke('singles:updateStarCityPricesBatch', payload),
  recalculateSingleSalePrice: (payload) => ipcRenderer.invoke('singles:recalculateSalePrice', payload),
  getSinglesPricingConfig: () => ipcRenderer.invoke('singles:getPricingConfig'),
  updateSinglesPricingConfig: (payload) => ipcRenderer.invoke('singles:updatePricingConfig', payload),

  // =========================
  // Ventas
  // =========================
  createSale: (payload) => ipcRenderer.invoke('sales:create', payload),
  getTodaySales: () => ipcRenderer.invoke('sales:listToday'),
  getSalesHistory: (filters) => ipcRenderer.invoke('sales:listHistory', filters),
  getSaleDetail: (saleId) => ipcRenderer.invoke('sales:getDetail', saleId),
  updateSale: (payload) => ipcRenderer.invoke('sales:update', payload),
  deleteSale: (payload) => ipcRenderer.invoke('sales:delete', payload),

  // =========================
  // Caja
  // =========================
  getOpenCashSession: () => ipcRenderer.invoke('cash:getOpenSession'),
  openCashSession: (openingAmount) => ipcRenderer.invoke('cash:openSession', openingAmount),
  getCurrentCashSummary: () => ipcRenderer.invoke('cash:getCurrentSummary'),
  closeCashSession: (payload) => ipcRenderer.invoke('cash:closeSession', payload),
  getCashSessions: () => ipcRenderer.invoke('cash:listSessions'),
  getCashMovements: () => ipcRenderer.invoke('cash:listMovements'),
  addCashWithdrawal: (payload) => ipcRenderer.invoke('cash:addWithdrawal', payload),
  updateCashSession: (payload) => ipcRenderer.invoke('cash:updateSession', payload),
  deleteCashSession: (payload) => ipcRenderer.invoke('cash:deleteSession', payload),

  getCashStatus: async () => {
    const session = await ipcRenderer.invoke('cash:getOpenSession')
    return {
      isOpen: Boolean(session),
      session,
    }
  },

  // =========================
  // Tickets
  // =========================
  printTicket: (payload) => ipcRenderer.invoke('print:ticket', payload),
  getPrintTicketsEnabled: () => ipcRenderer.invoke('settings:getPrintTicketsEnabled'),
  setPrintTicketsEnabled: (enabled) => ipcRenderer.invoke('settings:setPrintTicketsEnabled', enabled),
  getPosCustomization: () => ipcRenderer.invoke('settings:getPosCustomization'),
  updatePosCustomization: (payload) => ipcRenderer.invoke('settings:updatePosCustomization', payload),
  getServerSync: () => ipcRenderer.invoke('settings:getServerSync'),
  updateServerSync: (payload) => ipcRenderer.invoke('settings:updateServerSync', payload),
  flushServerSync: () => ipcRenderer.invoke('settings:flushServerSync'),
  authenticateServerSync: (payload) => ipcRenderer.invoke('settings:authenticateServerSync', payload),
  getServerSyncLogs: (limit) => ipcRenderer.invoke('settings:getServerSyncLogs', limit),
  onServerSyncStatusChanged: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('server-sync:status-changed', listener)
    return () => ipcRenderer.removeListener('server-sync:status-changed', listener)
  },

  getPrintSettings: async () => {
    const enabled = await ipcRenderer.invoke('settings:getPrintTicketsEnabled')
    return { enabled: Boolean(enabled) }
  },

  setPrintSettings: async ({ enabled }) => {
    return ipcRenderer.invoke('settings:setPrintTicketsEnabled', Boolean(enabled))
  },

  // =========================
  // Respaldo
  // =========================
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  getDbInfo: () => ipcRenderer.invoke('backup:getDbInfo'),

  // =========================
  // Reportes
  // =========================
  getSalesSummary: (filters) => ipcRenderer.invoke('reports:salesSummary', filters),
  exportSalesCsv: (filters) => ipcRenderer.invoke('reports:exportSalesCsv', filters),
  exportCashCsv: (filters) => ipcRenderer.invoke('reports:exportCashCsv', filters),
  getSalesDashboard: (filters) => ipcRenderer.invoke('reports:salesDashboard', filters),
  getReceivablesDashboard: () => ipcRenderer.invoke('reports:receivablesDashboard'),
  getSinglesDashboard: (filters) => ipcRenderer.invoke('reports:singlesDashboard', filters),
  getPreordersDashboard: (filters) => ipcRenderer.invoke('reports:preordersDashboard', filters),

  // =========================
  // Clientes
  // =========================
  getCustomers: () => ipcRenderer.invoke('customers:list'),
  createCustomer: (payload) => ipcRenderer.invoke('customers:create', payload),
  updateCustomer: (payload) => ipcRenderer.invoke('customers:update', payload),
  searchCustomers: (query) => ipcRenderer.invoke('customers:search', query),
  deleteCustomer: (id) => ipcRenderer.invoke('customers:delete', id),
  getCustomerHistory: (customerId) => ipcRenderer.invoke('customers:getHistory', customerId),
  addCustomerCredit: (payload) => ipcRenderer.invoke('customers:addCredit', payload),
  useCustomerCredit: (payload) => ipcRenderer.invoke('customers:useCredit', payload),
  getCustomerById: (id) => ipcRenderer.invoke('customers:getById', id),

  // =========================
  // Torneos
  // =========================
  getTournaments: () => ipcRenderer.invoke('tournaments:list'),
  createTournament: (payload) => ipcRenderer.invoke('tournaments:create', payload),
  getTournamentDetail: (tournamentId) => ipcRenderer.invoke('tournaments:getDetail', tournamentId),
  updateTournament: (payload) => ipcRenderer.invoke('tournaments:update', payload),
  addTournamentPlayer: (payload) => ipcRenderer.invoke('tournaments:addPlayer', payload),
  removeTournamentPlayer: (payload) => ipcRenderer.invoke('tournaments:removePlayer', payload),
  setTournamentPlayerPlace: (payload) => ipcRenderer.invoke('tournaments:setPlayerPlace', payload),
  createTournamentRoundTables: (payload) => ipcRenderer.invoke('tournaments:createRoundTables', payload),
  saveTournamentTableResult: (payload) => ipcRenderer.invoke('tournaments:saveTableResult', payload),
  finalizeTournament: (payload) => ipcRenderer.invoke('tournaments:finalize', payload),
  getTournamentLeaderboard: (season) => ipcRenderer.invoke('tournaments:getLeaderboard', season),

  // =========================
  // Inventario
  // =========================
  getProductMovements: (productId) => ipcRenderer.invoke('inventory:getProductMovements', productId),
  adjustStock: (payload) => ipcRenderer.invoke('inventory:adjustStock', payload),
  addStockEntry: (payload) => ipcRenderer.invoke('inventory:addStockEntry', payload),
  getLowStockProducts: () => ipcRenderer.invoke('inventory:getLowStockProducts'),
  getInventorySummary: (payload) => ipcRenderer.invoke('inventory:getInventorySummary', payload),

  // =========================
  // Cuentas por cobrar / fiado
  // =========================
  getReceivables: (filters) => ipcRenderer.invoke('receivables:list', filters),
  getReceivableById: (saleId) => ipcRenderer.invoke('receivables:getById', saleId),
  getReceivablesByCustomer: (customerId) => ipcRenderer.invoke('receivables:getByCustomer', customerId),
  addReceivablePayment: (payload) => ipcRenderer.invoke('receivables:addPayment', payload),
  addCustomerReceivablePayment: (payload) => ipcRenderer.invoke('receivables:addCustomerPayment', payload),
  getReceivablesSummary: () => ipcRenderer.invoke('receivables:getSummary'),
  getOverdueReceivables: () => ipcRenderer.invoke('receivables:getOverdue'),
  getCustomerReceivableBalance: (customerId) => ipcRenderer.invoke('receivables:getCustomerBalance', customerId),

  // =========================
  // Preventas
  // =========================
  getPreorders: (filters) => ipcRenderer.invoke('preorders:list', filters),
  getPreorderCatalog: (filters) => ipcRenderer.invoke('preorders:listCatalog', filters),
  getPreorderById: (preorderId) => ipcRenderer.invoke('preorders:getById', preorderId),
  createPreorder: (payload) => ipcRenderer.invoke('preorders:create', payload),
  createPreorderCatalogItem: (payload) => ipcRenderer.invoke('preorders:createCatalogItem', payload),
  updatePreorderCatalogItem: (payload) => ipcRenderer.invoke('preorders:updateCatalogItem', payload),
  deletePreorderCatalogItem: (payload) => ipcRenderer.invoke('preorders:deleteCatalogItem', payload),
  assignPreorderCatalogItem: (payload) => ipcRenderer.invoke('preorders:assignCatalogItem', payload),
  updatePreorder: (payload) => ipcRenderer.invoke('preorders:update', payload),
  cancelPreorder: (payload) => ipcRenderer.invoke('preorders:cancel', payload),
  addPreorderPayment: (payload) => ipcRenderer.invoke('preorders:addPayment', payload),
  markPreorderFulfilled: (payload) => ipcRenderer.invoke('preorders:markFulfilled', payload),
  reopenPreorder: (payload) => ipcRenderer.invoke('preorders:reopen', payload),
  getPreordersByCustomer: (customerId) => ipcRenderer.invoke('preorders:getByCustomer', customerId),
  getPreorderSummary: () => ipcRenderer.invoke('preorders:getSummary'),
  getPendingPreorders: () => ipcRenderer.invoke('preorders:getPending'),
  getPaidPreorders: () => ipcRenderer.invoke('preorders:getPaid'),
  getOverduePreorders: () => ipcRenderer.invoke('preorders:getOverdue'),
  importPreordersFromExcel: () => ipcRenderer.invoke('preorders:importExcel'),
  exportPreorderTemplate: () => ipcRenderer.invoke('preorders:exportTemplate'),
  exportPreorderPurchaseList: () => ipcRenderer.invoke('preorders:exportPurchaseList'),
  sendPreorderCreatedEmail: (payload) => ipcRenderer.invoke('preorders:sendCreatedEmail', payload),
  sendPreorderPaymentEmail: (payload) => ipcRenderer.invoke('preorders:sendPaymentEmail', payload),
  sendPreorderPaidEmail: (payload) => ipcRenderer.invoke('preorders:sendPaidEmail', payload),

  // Aliases de compatibilidad
  listCustomers: () => ipcRenderer.invoke('customers:list'),
  list: () => ipcRenderer.invoke('customers:list'),
  getById: (id) => ipcRenderer.invoke('customers:getById', id),
  create: (payload) => ipcRenderer.invoke('customers:create', payload),
  update: (payload) => ipcRenderer.invoke('customers:update', payload),
  search: (query) => ipcRenderer.invoke('customers:search', query),
  delete: (id) => ipcRenderer.invoke('customers:delete', id),
  addCredit: (payload) => ipcRenderer.invoke('customers:addCredit', payload),
  useCredit: (payload) => ipcRenderer.invoke('customers:useCredit', payload),
  getHistory: (customerId) => ipcRenderer.invoke('customers:getHistory', customerId),
})
