# Documentacion GitHub

Fecha: 2026-03-25

## Alcance de esta actualización

Se integró una capa completa de control operativo para el POS:

- usuarios con NIP
- permisos por ventana
- sesión activa en app
- bitácora firmada por usuario
- edición y eliminación de ventas
- edición y eliminación de cierres de caja
- eliminación segura de productos
- dropdowns en formularios de productos usando valores ya existentes en BD
- respaldo completo del sistema
- exportación operativa multihoja en Excel
- pantalla de configuración y personalización del POS
- retiros de efectivo auditados dentro de caja
- edición temporal de precios en el carrito
- sidebar persistente en todas las vistas autenticadas
- limpieza de botones internos para volver al POS
- SKU secuencial sugerido al crear productos
- módulo completo de preventas con vista, IPC, resumen y correos
- historial de clientes enriquecido con preventas y pagos asociados
- empaquetado de Windows con Electron Builder

## Usuarios y permisos

### Qué se agregó

- Tabla `users`
- Tabla `user_window_permissions`
- Panel `Usuarios y permisos`
- Ruta protegida `/users`
- Guardas de navegación por permiso
- Validación de permisos en IPC

### Usuario inicial

- Usuario: `admin`
- NIP: `1234`

### Ventanas controladas

- POS
- Historial de ventas
- Caja
- Productos
- Respaldo
- Reportes
- Configuración
- Clientes
- Historial por cliente
- Cuentas por cobrar
- Preventas
- Torneos
- Usuarios

## Respaldo completo

### Qué cambió

- El respaldo dejó de ser una copia simple del archivo `.sqlite`.
- Ahora se genera un respaldo completo con:
  - snapshot seguro de SQLite,
  - carpeta de imagenes de productos,
  - manifest de respaldo,
  - compatibilidad hacia atrás con respaldos `.sqlite`.

### Beneficio

- Reduce el riesgo de respaldos incompletos cuando la base trabaja con WAL.
- Permite restaurar tambien recursos visuales del catálogo.

## Reporte operativo en Excel

### Qué cambió

- La exportación de ventas ahora genera un `.xlsx` en lugar de un CSV simple.
- Se agregaron hojas con:
  - `Resumen`
  - `Ventas`
  - `PartidasVenta`
  - `PagosVenta`
  - `CierresCaja`
  - `MovInventario`
  - `Auditoria`

### Alcance operativo

- Ya salen cierres de caja.
- Ya salen movimientos firmados desde bitácora.
- Ya salen ingresos, ajustes y egresos de inventario.

## Configuración y personalización del POS

### Nueva pantalla

- Se agregó la ruta `/settings`.
- La configuración se guarda en la tabla `settings`.

### Ajustes disponibles

- nombre de tienda
- subtítulo del POS
- texto del banner principal
- etiqueta del banner
- color principal
- mostrar u ocultar banner
- modo compacto

### Impacto visual

- El POS consume esta configuración en tiempo real al cargar.
- El color principal se aplica a varios elementos clave de la interfaz.

## Navegación persistente

### Qué cambió

- La barra lateral del POS se movió a un layout compartido.
- Ahora permanece visible en todas las vistas autenticadas.
- La navegación lateral respeta permisos por ventana y mantiene visible la identidad visual configurada.

### Ajuste adicional

- Se retiraron botones redundantes de "Volver al POS" dentro de vistas secundarias.
- Se conservó solo la navegación contextual que sigue aportando valor, como volver a clientes desde historial por cliente.

## Caja: retiros de efectivo

### Qué se agregó

- Tabla `cash_movements`
- Registro de retiros de efectivo en caja abierta
- Captura de:
  - monto,
  - motivo,
  - firma,
  - notas,
  - usuario que registra

### Regla operativa

- El retiro reduce el efectivo esperado de la caja.
- Se valida que no exceda el efectivo esperado disponible.
- También queda auditado en `audit_logs`.

## POS: edición temporal de precio

### Comportamiento

- Desde el carrito se puede cambiar el precio de una línea solo para la venta actual.
- El precio original del producto no se modifica en catálogo.
- La línea queda marcada visualmente como precio temporal.

## Bitácora firmada

Se agregó la tabla `audit_logs` para registrar:

- usuario
- entidad afectada
- acción realizada
- descripción
- payload opcional
- fecha y hora

Quedan registrados movimientos de usuarios, ventas, productos y caja.

## Ventas editables y eliminables

### Comportamiento

- La edición recrea el detalle de la venta respetando inventario y pagos iniciales.
- La eliminación es lógica: la venta queda marcada como eliminada y deja de aparecer en vistas/reportes operativos.
- Al editar o eliminar:
  - se revierte inventario,
  - se revierte crédito aplicado,
  - se escribe bitácora.

### Restricción importante

Si una venta ya tiene abonos posteriores en `sale_payments`, se bloquea su edición o eliminación para no romper la cuenta por cobrar.

## Cierres de caja editables y eliminables

### Qué cambió

- Se agregó listado de sesiones de caja.
- Los cierres en estado `closed` pueden editarse.
- También pueden eliminarse de forma lógica.
- Todas esas acciones quedan auditadas.

## Productos

### Eliminación

- Se agregó eliminación física segura para productos sin historial.
- Si el producto ya tiene referencias en ventas, preventas o movimientos de inventario, el sistema no lo borra y pide desactivarlo.

### Dropdowns basados en BD

En el formulario de productos se añadieron opciones reutilizando valores ya registrados:

- categorías
- juego
- set
- finish
- idioma
- condición

### SKU secuencial por defecto

- En el alta de producto nuevo se propone automáticamente un SKU con formato `CB-00000`.
- El siguiente valor se calcula a partir del mayor consecutivo encontrado en productos activos e inactivos.
- El campo sigue siendo editable antes de guardar.

## Preventas

### Qué se agregó

- Vista `Preventas` dentro del flujo autenticado.
- Handlers IPC dedicados en `electron/ipc/preorders.cjs`.
- Exposición completa en `window.posAPI` para:
  - listado,
  - detalle,
  - alta,
  - edición,
  - cancelación,
  - abonos,
  - reapertura,
  - surtido,
  - resumen operativo,
  - consultas de pendientes, pagadas y vencidas,
  - reenvío de correos.

### Flujo operativo

- La preventa se crea con cliente, items, notas, fecha estimada y abono inicial opcional.
- El estado se calcula automáticamente entre `active`, `partial`, `paid`, `fulfilled` y `cancelled`.
- Los abonos actualizan saldo pendiente y generan historial de cambios.
- El surtido puede descontar stock y opcionalmente ligar una venta de entrega.
- Se guarda bitácora interna del estado y log de correos enviados.

### Correos

- Se soportan plantillas para:
  - preventa creada,
  - abono registrado,
  - preventa liquidada,
  - preventa surtida.
- El modo de envío puede trabajar con webhook configurable o solo registrar en log.

## Historial por cliente

### Qué cambió

- `getCustomerById` ahora devuelve:
  - listado de preventas del cliente,
  - pagos de preventa,
  - resumen agregado de saldo y conteos por estado.
- Esto permite que la vista de historial muestre ventas, fiado, crédito y preventas en un solo lugar.

## Ejecutable de Windows

### Qué cambió

- Se agregó `electron-builder` a `devDependencies`.
- Se definieron scripts:
  - `npm run dist`
  - `npm run dist:dir`
- Se añadió configuración `build` en `package.json` para generar salida Windows x64 en `release/`.
- `vite.config.js` ahora usa `base: './'` para que la app empaquetada cargue assets locales correctamente.

### Resultado actual

- El build deja lista la carpeta `release/win-unpacked`.
- El ejecutable principal queda en `release/win-unpacked/Card Bastion POS.exe`.
- El instalador NSIS puede requerir privilegios adicionales de Windows por el paso de `winCodeSign`.

## Archivos principales tocados

- `electron/database/init.cjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `electron/ipc/preorders.cjs`
- `electron/ipc/users.cjs`
- `electron/ipc/sales-service.cjs`
- `electron/ipc/history.cjs`
- `electron/ipc/cash.cjs`
- `electron/ipc/settings.cjs`
- `electron/ipc/backup.cjs`
- `electron/ipc/reports.cjs`
- `electron/ipc/products.cjs`
- `electron/ipc/customers.cjs`
- `src/App.vue`
- `src/session.js`
- `src/router/index.js`
- `src/components/AppShell.vue`
- `src/stores/cartStore.js`
- `src/views/UsersAdminView.vue`
- `src/views/SalesHistoryView.vue`
- `src/views/CashView.vue`
- `src/views/ProductsView.vue`
- `src/views/PosView.vue`
- `src/views/BackupView.vue`
- `src/views/ReportsView.vue`
- `src/views/SettingsView.vue`
- `src/views/PreordersView.vue`
- `vite.config.js`
- `package.json`
