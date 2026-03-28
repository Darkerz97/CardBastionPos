# POS 2 CardBastion

Repositorio inicializado el 2026-03-21.

## Documentación
- Inventario de funciones: `REPOSITORIO_FUNCIONES.md`
- Guía de cambios para GitHub: `GITHUB_DOCUMENTACION.md`

## Cambios recientes
- Integración base del POS local con backend Laravel mediante sincronización modular, login Sanctum, cola local, reintentos, logs persistentes y configuración centralizada.
- Catálogo de preventas con alta, edición, desactivación, asignación a cliente e importación/exportación en Excel.
- Historial de ventas con búsqueda por folio, cliente, teléfono, método de pago y rango de fechas.
- Cuentas por cobrar con resumen e items por venta dentro del detalle.
- Caja y reportes excluyen ventas de preventa para evitar duplicidad operativa.
- POS calcula cambio real cuando el pago es en efectivo.
- Inicio de sesión por usuario con NIP.
- Panel de administración de usuarios y permisos por ventana.
- Bitácora de movimientos firmada por usuario.
- Edición y eliminación controlada de ventas.
- Edición y eliminación de cierres de caja.
- Eliminación segura de productos y catálogos dinámicos en formularios.
- Respaldo completo del POS con SQLite e imagenes de productos.
- Exportación operativa en Excel con hojas de ventas, caja, inventario y auditoría.
- Personalización visual del POS desde pantalla de configuración.
- Retiros de efectivo en caja con motivo, firma y reflejo en el efectivo esperado.
- Edición temporal de precio por producto solo para el cobro actual.
- Menú lateral persistente en todas las vistas autenticadas.
- Limpieza de botones redundantes de "volver al POS" dentro de módulos.
- SKU inicial secuencial en productos con formato `CB-00000`.
- Módulo completo de preventas con abonos, liquidación, surtido y correos.
- Historial de cliente enriquecido con resumen y movimientos de preventas.
- Empaquetado de escritorio para Windows con `electron-builder`.

## Funcionalidades nuevas

### Respaldo completo
- El respaldo ya no copia solo la base SQLite.
- Ahora genera un respaldo completo que incluye:
  - base de datos,
  - imagenes de productos,
  - restauración compatible con respaldos SQLite anteriores.

### Reportes
- La exportación de reportes genera un archivo `.xlsx` con varias hojas.
- Incluye:
  - resumen,
  - ventas,
  - partidas de venta,
  - pagos,
  - cierres de caja,
  - movimientos de inventario,
  - auditoría.

### Configuración del POS
- Se agregó una pantalla de configuración del POS.
- Permite editar:
  - nombre de tienda,
  - subtítulo,
  - textos del banner,
  - color principal,
  - visibilidad del banner,
  - modo compacto,
  - integración Laravel.

### Sincronización Laravel
- Se agregó una capa dedicada de sincronización para conectar el POS local con un backend Laravel existente.
- La configuración se centraliza desde `Configuracion > Sincronizacion con servidor`.
- Parámetros principales:
  - `API_BASE_URL`
  - email de autenticación backend
  - password backend
  - `device_name`
  - rutas configurables para login, push y pull
  - tamaño de lote
  - timeout
  - intervalo de auto sync
  - base de reintento
- El login remoto usa `POST /auth/login` con:
  - `email`
  - `password`
  - `device_name`
- La sincronización incluye:
  - cola local `server_sync_queue`
  - logs persistentes `server_sync_logs`
  - reintentos con backoff
  - scheduler automático
  - sincronización manual desde pantalla de configuración
  - soporte para `push` y `pull`
- La autenticación remota guarda el token localmente para reutilizarlo en los ciclos de sincronización.
- Los cambios locales siguen funcionando aunque el servidor no esté disponible; la cola queda pendiente hasta poder reintentar.

### Caja
- Se agregó registro de retiros de efectivo.
- Cada retiro requiere:
  - monto,
  - motivo,
  - firma,
  - notas opcionales.
- Los retiros impactan el efectivo esperado de la caja abierta.

### POS
- Se mejoró la experiencia visual con animaciones y personalización.
- Se puede editar el precio de un producto en el carrito sin modificar el precio maestro del catálogo.
- El menú lateral queda fijo en todas las vistas con la misma navegación.
- Se retiraron los botones internos para volver al POS cuando la navegación lateral ya está visible.

### Productos
- Al crear un producto nuevo, el SKU se propone automáticamente con formato secuencial `CB-00000`.
- El consecutivo toma en cuenta productos activos e inactivos para evitar repetir claves.
- El usuario todavía puede editar manualmente el SKU antes de guardar.

### Preventas
- Se agregó una vista dedicada para crear y consultar preventas.
- Ahora también incluye un catálogo base de preventas reutilizables.
- El catálogo permite:
  - crear fichas base con código, nombre, categoría, imagen, fechas, precio y producto ligado,
  - editar o desactivar fichas existentes,
  - asignar una preventa base a un cliente con anticipo opcional,
  - importar catálogo desde Excel,
  - descargar plantilla de carga,
  - exportar lista de compra consolidada.
- Cada preventa permite:
  - capturar cliente,
  - definir salida estimada,
  - agregar items,
  - registrar abono inicial,
  - consultar detalle y pagos,
  - marcar como surtida o cancelada.
- El backend ya expone operaciones para:
  - listado con filtros,
  - catálogo base de preventas,
  - detalle,
  - creación,
  - actualización,
  - cancelación,
  - abonos,
  - reapertura,
  - surtido,
  - resúmenes y consultas por cliente,
  - importación y exportación operativa en Excel.
- También se registran y reenvían correos de preventa creada, abono y liquidación.

### Historial de ventas
- La vista de historial ya no se limita al día actual.
- Ahora permite:
  - búsqueda por folio, cliente, teléfono o método de pago,
  - filtros por fecha desde/hasta,
  - rangos rápidos de hoy, ayer, últimos 7 días o todo,
  - vista previa de artículos vendidos por ticket.

### Cuentas por cobrar
- El módulo ahora muestra el resumen de artículos por venta.
- El detalle de cada cuenta por cobrar ya incluye:
  - artículos de la venta,
  - SKU,
  - cantidades,
  - totales por línea.

### Caja y reportes
- Las ventas derivadas de preventas se excluyen de los cortes de caja y de los reportes de ventas.
- Esto evita contar dos veces operaciones que ya se controlan dentro del flujo de preventas.

### Cobro en efectivo
- En el POS, cuando el método de pago es efectivo, el campo de pago se interpreta como efectivo recibido.
- El sistema calcula automáticamente:
  - monto aplicado real,
  - saldo pendiente,
  - cambio a entregar.

### Historial de cliente
- El historial por cliente ahora muestra preventas, pagos de preventa y métricas agregadas de saldo pendiente y estados.

### Ejecutable de Windows
- Se agregó configuración de `electron-builder` en `package.json`.
- Nuevos scripts disponibles:
  - `npm run dist`
  - `npm run dist:dir`
- Para que la app empaquetada resuelva correctamente los assets, Vite ahora compila con `base: './'`.
- El ejecutable generado queda en `release/win-unpacked/Card Bastion POS.exe`.

## Acceso inicial
- Usuario: `admin`
- NIP: `1234`

## Backend Laravel esperado
- Base URL configurada como `https://TU_DOMINIO/api`
- Login remoto esperado:
  - `POST /auth/login`
- Payload:

```json
{
  "email": "admin@cardbastion.com",
  "password": "TU_PASSWORD",
  "device_name": "POS-LEON-01"
}
```
