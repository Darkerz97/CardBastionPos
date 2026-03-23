const WINDOW_DEFINITIONS = [
  { key: 'pos', label: 'POS / Nueva venta' },
  { key: 'history', label: 'Historial de ventas' },
  { key: 'cash', label: 'Caja' },
  { key: 'products', label: 'Productos' },
  { key: 'backup', label: 'Respaldos' },
  { key: 'reports', label: 'Reportes' },
  { key: 'settings', label: 'Configuracion del POS' },
  { key: 'customers', label: 'Clientes' },
  { key: 'customer-history', label: 'Historial por cliente' },
  { key: 'receivables', label: 'Cuentas por cobrar' },
  { key: 'preorders', label: 'Preventas' },
  { key: 'tournaments', label: 'Torneos' },
  { key: 'users', label: 'Usuarios y permisos' },
]

function getWindowDefinitions() {
  return WINDOW_DEFINITIONS.map((item) => ({ ...item }))
}

module.exports = {
  WINDOW_DEFINITIONS,
  getWindowDefinitions,
}
