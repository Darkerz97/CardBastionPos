# POS 2 CardBastion

Repositorio inicializado el 2026-03-21.

## Documentación
- Inventario de funciones: `REPOSITORIO_FUNCIONES.md`
- Guía de cambios para GitHub: `GITHUB_DOCUMENTACION.md`

## Cambios recientes
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
  - modo compacto.

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

## Acceso inicial
- Usuario: `admin`
- NIP: `1234`
