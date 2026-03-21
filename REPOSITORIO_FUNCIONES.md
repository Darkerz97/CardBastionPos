# Repositorio de Funciones

Fecha de corte: 2026-03-21

Este archivo documenta las funciones expuestas en `window.posAPI` (fuente: `electron/preload.cjs`).

## Productos
- getProducts
- getInactiveProducts
- findProductByCode
- createProduct
- updateProduct
- deactivateProduct
- reactivateProduct
- importProductsFromExcel
- exportProductTemplate
- selectProductImage
- getProductImageUrl
- getProductImage

## Ventas
- createSale
- getTodaySales
- getSaleDetail

## Caja
- getOpenCashSession
- openCashSession
- getCurrentCashSummary
- closeCashSession
- getCashStatus

## Tickets / Ajustes
- printTicket
- getPrintTicketsEnabled
- setPrintTicketsEnabled
- getPrintSettings
- setPrintSettings

## Respaldo
- createBackup
- restoreBackup
- getDbInfo

## Reportes
- getSalesSummary
- exportSalesCsv
- exportCashCsv
- getSalesDashboard

## Clientes
- getCustomers
- createCustomer
- updateCustomer
- searchCustomers
- deleteCustomer
- getCustomerHistory
- addCustomerCredit
- useCustomerCredit
- getCustomerById

## Torneos
- getTournaments
- createTournament
- getTournamentDetail
- updateTournament
- addTournamentPlayer
- removeTournamentPlayer
- setTournamentPlayerPlace
- createTournamentRoundTables
- saveTournamentTableResult
- finalizeTournament
- getTournamentLeaderboard

## Inventario
- getProductMovements
- adjustStock
- addStockEntry
- getLowStockProducts
- getInventorySummary

## Aliases de Compatibilidad
- listCustomers
- list
- getById
- create
- update
- search
- delete
- addCredit
- useCredit
- getHistory

## Nota
Si se agregan nuevas funciones en `electron/preload.cjs`, este archivo debe actualizarse con la nueva fecha de corte.

---

## Cambios Implementados (2026-03-21)

### Inventario profesional integrado
- Se agregó tabla `inventory_movements` con trazabilidad de entradas, ventas, ajustes y mermas.
- Se agregaron columnas/migraciones seguras para productos: `min_stock`, `cost`, `updated_at`.
- Se creó módulo IPC de inventario (`electron/ipc/inventory.cjs`) con:
  - consulta de movimientos por producto,
  - ajuste manual de stock (sumar/restar/fijar),
  - entradas de mercancía,
  - consulta de bajo stock,
  - resumen de inventario.

### Integración con ventas
- `sales:create` ahora descuenta inventario y registra movimientos `type='sale'` por cada item.
- Se mantiene transacción para evitar ventas parciales si falla inventario.
- Se conserva validación de no permitir stock negativo.

### Productos e inventario (UI)
- `ProductsView.vue` se amplió con:
  - visualización de stock mínimo,
  - alerta por stock bajo (`stock <= min_stock`),
  - modal de ajuste manual,
  - modal de entrada de mercancía,
  - modal de historial de movimientos.

### Reportes
- `ReportsView.vue` ahora incluye reportes de inventario:
  - productos bajo mínimo,
  - productos sin movimiento reciente,
  - productos más vendidos,
  - valor estimado del inventario.

### Torneos
- Se integraron handlers y vista de torneos con soporte para:
  - pareos/mesas por ronda,
  - captura de resultados y ganador por mesa,
  - finalización de torneo y leaderboard por temporada.
