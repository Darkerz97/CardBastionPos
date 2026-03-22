# Documentacion GitHub

Fecha: 2026-03-22

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
- Clientes
- Historial por cliente
- Cuentas por cobrar
- Preventas
- Torneos
- Usuarios

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

## Archivos principales tocados

- `electron/database/init.cjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `electron/ipc/users.cjs`
- `electron/ipc/sales-service.cjs`
- `electron/ipc/history.cjs`
- `electron/ipc/cash.cjs`
- `electron/ipc/products.cjs`
- `src/App.vue`
- `src/session.js`
- `src/router/index.js`
- `src/views/UsersAdminView.vue`
- `src/views/SalesHistoryView.vue`
- `src/views/CashView.vue`
- `src/views/ProductsView.vue`
- `src/views/PosView.vue`
