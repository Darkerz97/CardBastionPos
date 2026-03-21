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
