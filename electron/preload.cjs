const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('posAPI', {
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
  importProductsFromExcel: () => ipcRenderer.invoke('products:importExcel'),
  exportProductTemplate: () => ipcRenderer.invoke('products:exportTemplate'),
  selectProductImage: () => ipcRenderer.invoke('products:selectImage'),
  getProductImageUrl: (fileName) => ipcRenderer.invoke('products:getImageDataUrl', fileName),
  getProductImage: (fileName) => ipcRenderer.invoke('products:getImageDataUrl', fileName),

  // =========================
  // Ventas
  // =========================
  createSale: (payload) => ipcRenderer.invoke('sales:create', payload),
  getTodaySales: () => ipcRenderer.invoke('sales:listToday'),
  getSaleDetail: (saleId) => ipcRenderer.invoke('sales:getDetail', saleId),

  // =========================
  // Caja
  // =========================
  getOpenCashSession: () => ipcRenderer.invoke('cash:getOpenSession'),
  openCashSession: (openingAmount) => ipcRenderer.invoke('cash:openSession', openingAmount),
  getCurrentCashSummary: () => ipcRenderer.invoke('cash:getCurrentSummary'),
  closeCashSession: (payload) => ipcRenderer.invoke('cash:closeSession', payload),

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