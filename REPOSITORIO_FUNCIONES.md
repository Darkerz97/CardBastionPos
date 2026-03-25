# Repositorio de Funciones

Fecha de corte: 2026-03-25

Este archivo documenta las funciones expuestas en `window.posAPI` (fuente: `electron/preload.cjs`).

## Sesion / Usuarios
- listLoginUsers
- login
- logout
- getCurrentSession
- getUsers
- createUser
- updateUser
- getWindowDefinitions
- getAuditLogs

## Productos
- getProducts
- getInactiveProducts
- findProductByCode
- createProduct
- updateProduct
- deactivateProduct
- reactivateProduct
- deleteProduct
- getProductCatalogOptions
- importProductsFromExcel
- exportProductTemplate
- selectProductImage
- getProductImageUrl
- getProductImage

## Singles
- searchSinglesCatalog
- openStarCitySearch
- fetchSingleStarCityPriceFromUrl
- getSingles
- getSingleById
- createSingle
- updateSingle
- linkSingleStarCity
- updateSingleStarCityPrice
- updateSingleStarCityPricesBatch
- recalculateSingleSalePrice
- getSinglesPricingConfig
- updateSinglesPricingConfig

## Ventas
- createSale
- getTodaySales
- getSaleDetail
- updateSale
- deleteSale

## Caja
- getOpenCashSession
- openCashSession
- getCurrentCashSummary
- closeCashSession
- getCashSessions
- updateCashSession
- deleteCashSession
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
- getReceivablesDashboard
- getSinglesDashboard
- getPreordersDashboard

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

## Cuentas por Cobrar / Fiado
- getReceivables
- getReceivableById
- getReceivablesByCustomer
- addReceivablePayment
- addCustomerReceivablePayment
- getReceivablesSummary
- getOverdueReceivables
- getCustomerReceivableBalance

## Preventas
- getPreorders
- getPreorderById
- createPreorder
- updatePreorder
- cancelPreorder
- addPreorderPayment
- markPreorderFulfilled
- reopenPreorder
- getPreordersByCustomer
- getPreorderSummary
- getPendingPreorders
- getPaidPreorders
- getOverduePreorders
- sendPreorderCreatedEmail
- sendPreorderPaymentEmail
- sendPreorderPaidEmail

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

## Cambios Implementados (2026-03-25)

### Usuarios, permisos y sesión
- Se agregó autenticación local por usuario con NIP.
- Se creó la tabla `users` y la tabla `user_window_permissions`.
- Se agregó una sesión activa en memoria para validar acceso en IPC y frontend.
- Se creó un usuario inicial `admin` con NIP `1234`.

### Administración de permisos por ventana
- Se añadió un panel `Usuarios y permisos` para crear, editar y desactivar usuarios.
- Cada usuario puede tener acceso específico por ventana:
  - POS
  - historial
  - caja
  - productos
  - respaldo
  - reportes
  - clientes
  - historial por cliente
  - cuentas por cobrar
  - preventas
  - torneos
  - usuarios

### Bitácora firmada por usuario
- Se agregó la tabla `audit_logs`.
- Se registran movimientos clave con firma del usuario autenticado:
  - creación y actualización de usuarios
  - apertura y cierre de caja
  - edición y eliminación de cierres
  - creación, edición, desactivación, reactivación y eliminación de productos
  - creación, edición y eliminación de ventas

### Ventas editables y eliminables
- Se implementó un servicio central para recrear correctamente una venta al editarla.
- Al editar o eliminar una venta:
  - se revierte inventario,
  - se revierte crédito usado,
  - se preserva trazabilidad en bitácora.
- Se bloquea edición o eliminación si la venta ya tiene abonos posteriores para no romper cuentas por cobrar.

### Caja editable y eliminable
- Los cierres de caja ahora pueden consultarse en lista.
- Los cierres cerrados pueden editarse o eliminarse desde la interfaz.
- Cada operación queda auditada con usuario.

### Productos
- Se agregó eliminación física segura solo para productos sin historial relacionado.
- Si un producto ya tiene referencias, el sistema obliga a desactivarlo en lugar de borrarlo.
- El formulario ahora usa opciones dinámicas tomadas de BD para:
  - categorías
  - juegos
  - sets
  - finish
  - idioma
  - condición

### Preventas
- Se consolidó el módulo de preventas con funciones para listado, detalle, creación, edición, cancelación, abonos, reapertura y surtido.
- Se añadieron consultas rápidas para preventas pendientes, pagadas y vencidas.
- Se expusieron funciones para reenvío de correos de preventa creada, abono y liquidación.
- El resumen de preventas también queda disponible para dashboards y vistas operativas.

### Historial de cliente
- `getCustomerById` ahora incluye preventas, pagos de preventa y resumen agregado por estado para enriquecer la ficha del cliente.

### Empaquetado
- El proyecto ya incluye scripts de distribución para Windows:
  - `npm run dist`
  - `npm run dist:dir`
- Se agregó la configuración necesaria de `electron-builder` para generar el ejecutable de escritorio.
