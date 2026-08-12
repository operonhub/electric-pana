# Electric Pana — Presupuestos

App web para armar presupuestos de **Electric Pana** (mayorista de materiales eléctricos) en
segundos, en vez de hacerlos a mano.

## Qué hace
- **Armar presupuesto**: buscás productos por nombre o código, ponés la cantidad, y calcula
  el importe de cada renglón y el total automáticamente. Podés aplicar un **descuento** por
  porcentaje o por monto fijo.
- **Enviar / imprimir**: mandás el presupuesto por **WhatsApp** o lo **imprimís / guardás como PDF**.
- **Lista de precios**: editás precios, agregás o borrás productos, aplicás **aumentos por
  porcentaje** (a todo o a una categoría), y podés **imprimir/PDF** o **descargar en Excel**
  la lista completa o filtrada, para mandarle a un cliente.
- **Modo claro y oscuro**, y todo guardado en el mismo dispositivo.

## Cómo se usa
1. Abrí la app.
2. En **Presupuesto**: escribí el cliente, buscá los productos y tocálos para agregarlos.
3. Ajustá cantidades. Cuando esté listo, tocá **Enviar por WhatsApp** o **Imprimir / PDF**.
4. En **Lista de precios**: buscá un producto y cambiá el precio; se guarda solo.

## Copia de seguridad
Los datos viven en el navegador de este dispositivo. Para no perderlos, en **Lista de precios**
usá **"Copia de seguridad"** cada tanto (te baja un archivo). Si cambiás de compu o se borran
los datos, usás **"Restaurar copia"** con ese archivo.

## Desarrollo
Es un sitio estático, sin build ni dependencias (salvo Google Fonts).

- Abrir local: abrí `index.html` en el navegador.
- Tests de las fórmulas: `node js/calc.test.js`
- Deploy: Vercel (sitio estático).

La guía técnica completa está en [`CLAUDE.md`](CLAUDE.md).
