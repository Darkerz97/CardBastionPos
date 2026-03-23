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

## Acceso inicial
- Usuario: `admin`
- NIP: `1234`
