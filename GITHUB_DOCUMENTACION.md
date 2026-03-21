# Documentacion GitHub

Fecha: 2026-03-21

## Singles MTG + Star City

Se implemento un flujo simplificado para registrar singles de `Magic: The Gathering` usando Star City Games.

### Flujo recomendado

1. Crear o editar un producto con `Tipo = Single`.
2. Capturar el nombre de la carta.
3. Abrir `Vincular SCG`.
4. Usar `Abrir en navegador`.
5. Buscar la carta correcta en Star City Games.
6. Pegar la URL exacta de la carta en el campo manual.
7. Usar `Importar URL`.

### Datos que se intentan autocompletar desde la URL

- nombre
- juego
- categoria
- set
- set code
- collector number
- finish
- idioma
- condicion
- precio USD
- precio MXN
- URL vinculada de Star City

### Regla de precio para Magic

Cuando el producto es un `single` y el juego es `Magic: The Gathering`, el POS usa esta conversion:

`precio_mxn = starcity_price_usd * 18`

Esto aplica tanto a la captura del producto como al cobro en el carrito/POS.

## Archivos principales tocados

- `electron/ipc/singles.cjs`
- `electron/preload.cjs`
- `src/views/ProductsView.vue`
- `src/views/PosView.vue`
- `src/stores/cartStore.js`

## Notas

- La busqueda automatica de Star City resulto poco estable, por eso se dejo el flujo manual con URL pegada.
- El formulario de singles se simplifico para mostrar primero el flujo rapido y dejar los detalles avanzados como opcion.
