# Instrucciones para Claude Code — Electric Pana (Presupuestos)

## Sincronización en la nube (Supabase)
- Solo la **lista de precios** se sincroniza entre dispositivos (compu/celu); los presupuestos en
  curso siguen siendo locales a cada uno (no hacía falta compartirlos).
- Proyecto Supabase: `electric-pana` (id `mnypuogxgozyysptmcvw`), tabla `productos`, RLS con
  política pública de lectura/escritura (sin login: es una lista de precios, no hay datos
  sensibles). Cliente cargado por CDN (`@supabase/supabase-js@2`) — única dependencia externa
  además de Google Fonts, justificada porque no hay otra forma de sincronizar sin backend.
- `js/supabase-sync.js`: capa de datos aislada (`cargarCatalogoRemoto`, `guardarProductoRemoto`,
  `guardarProductosRemoto` para lotes, `eliminarProductoRemoto`, `suscribirCambios` para Realtime).
  **Ojo:** Supabase limita cada consulta a 1000 filas (config del proyecto) — `cargarCatalogoRemoto`
  pagina en bloques de 1000 para traer el catálogo completo (hoy 1352).
- `app.js`: al iniciar, `iniciarSyncNube()` trae el catálogo remoto (si hay internet) y se suscribe
  a cambios en tiempo real de otros dispositivos. Cada edición local (precio, alta/baja de producto,
  aumento por %, restaurar backup) se guarda primero en localStorage y DESPUÉS se empuja a Supabase
  con `sincronizarProducto`/`sincronizarLote`/`sincronizarBorrado` — si falla (sin internet), avisa
  con un toast pero el cambio ya quedó guardado localmente, nada se pierde.

## Contexto del proyecto
App web para **Electric Pana**, un mayorista de materiales eléctricos. El dueño hoy hace los
presupuestos **a mano** y tiene su lista de precios en un Excel (`14 JULIO 2026.xls`, ~1.352
productos en 217 categorías, cada uno con código + nombre + precio).

La app le permite:
1. **Armar un presupuesto**: buscar productos, poner cantidades, aplicar un **descuento** (por %
   o por monto fijo) y ver subtotal/descuento/total calculados solo.
2. **Enviarlo**: como **PDF por WhatsApp** (botón principal), como resumen de texto por WhatsApp,
   o **imprimirlo/PDF** con el formato de presupuesto. En los tres, cada ítem muestra su
   **categoría** (chica, debajo del nombre) — se guarda en el ítem al agregarlo desde el catálogo.
3. **Administrar la lista de precios**: editar precios, agregar/borrar productos, aumentos por %,
   e **imprimir / exportar a Excel / enviar Excel o PDF por WhatsApp** la lista (completa o
   filtrada) para mandarle a un cliente.
4. **Marcar productos importados / atados al dólar**: en el Excel original, esos productos tenían
   el nombre con texto en color (rojo/azul/etc.) — la app lo detecta al importar y muestra un
   chip **"USD"** junto al nombre, SOLO dentro de la lista de precios de la app (para que el dueño
   los identifique). Este chip **nunca** sale en el Excel exportado, el PDF ni la impresión que se
   comparten con un cliente — es información interna. Se puede togglear por producto desde el
   modal de editar/nuevo producto. *(Pendiente: el dueño todavía tiene que confirmar si algún día
   quiere que se muestre también al cliente — por ahora, no.)*

El campo de cliente dice **"Cliente"**, no "Señores" (así lo pidió Tomi — sacar esa palabra de
todos lados: label del formulario, mensaje de WhatsApp y documento impreso).

Es un **proyecto externo** (para el suegro del cliente de Operon). **NO lleva marca Operon** —
ni badge, ni "un producto de Operon". Identidad propia: "Electric Pana".

El usuario final es una **persona grande**: la UI es simple, con texto y botones grandes,
tono directo y sin tecnicismos.

## Filosofía de desarrollo
1. **Iterar simple antes que complejo** — sin build step, sin framework, sin dependencias npm.
   Única dependencia externa aprobada: Google Fonts.
2. **Lenguaje del usuario, no del programador** — todo el copy en español rioplatense (voseo),
   sin jerga. "Precio unit.", "Vaciar", "Copia de seguridad", no "reset" ni "backup".
3. **Separación de responsabilidades** — datos / fórmulas / DOM en archivos distintos (ver abajo).

## Estructura del código
```
electric-pana/
├── index.html          → Markup. Lo dinámico (resultados, ítems, filas) lo llena app.js.
├── css/styles.css      → Todo el CSS + sistema de temas claro/oscuro en variables.
├── js/
│   ├── data.js         → window.CATALOGO_SEED: el catálogo original. SOLO datos, nada de lógica.
│   ├── calc.js         → Funciones PURAS y testeables (sin DOM): totales, formato, descuentos,
│   │                     aumentos, búsqueda. Incluye `formatearMiles`/`parseNumero` (separador de
│   │                     miles en los inputs) y `calcularDescuento` (por % o por monto, con tope).
│   ├── calc.test.js    → Tests de calc.js. Correr: `node js/calc.test.js`
│   ├── xlsx.js         → Generador de archivos .xlsx SIN dependencias (arma el ZIP a mano).
│   │                     Función pura: `construirXlsxBytes(filas, nombreHoja) -> Uint8Array`.
│   ├── pdf.js          → Generador de PDFs SIN dependencias (arma el PDF a mano: objetos, xref,
│   │                     fuentes estándar Helvetica). Dos funciones puras:
│   │                     `construirPdfListaPrecios({items, filtro, fecha})` y
│   │                     `construirPdfPresupuesto({cliente, domicilio, fecha, items, subtotal,
│   │                     descuento, total, etiquetaDescuento})` -> Uint8Array.
│   │                     Se usan para "Enviar PDF por WhatsApp": con Web Share API (móvil) el
│   │                     PDF se manda directo a la app elegida; si el navegador no lo soporta
│   │                     (ej. escritorio), se descarga para adjuntarlo a mano en WhatsApp Web.
│   │                     **Ojo con las columnas de precio (P. Unit./Importe):** van alineadas a
│   │                     la derecha, así que necesitan un ANCHO RESERVADO propio (`ANCHO_COL_PRECIO`),
│   │                     no solo un margen medido desde su borde derecho — un precio corto empieza
│   │                     más a la izquierda de lo que parece. Si "Detalle" no respeta esa reserva,
│   │                     un nombre de producto largo se superpone con el precio (bug real que pasó).
│   └── app.js          → Wiring del DOM: eventos, render, localStorage, tema. NADA de fórmulas acá.
├── assets/favicon.svg
├── vercel.json
├── CLAUDE.md
└── README.md
```

## Datos y persistencia
- `data.js` es la **semilla** (el Excel original convertido). No se toca en runtime.
- En el primer uso, `app.js` copia la semilla a `localStorage` (`ep_catalogo_v1`). Desde ahí,
  toda edición de precios/productos vive en localStorage. La semilla queda como respaldo de fábrica.
- El presupuesto en curso se guarda en `ep_presupuesto_v1` (así no se pierde si cierra la pestaña).
- Como todo vive en el navegador, hay **backup/restore a archivo JSON** (botones en Lista de precios).
  Es la red de seguridad ante un borrado de datos del navegador o cambio de dispositivo.
- Los **códigos NO son únicos** (hay ~33 repetidos): la clave interna es `id`, no `cod`.
- Cada producto tiene un campo `importado` (boolean): 758 de 1.352 vinieron marcados así desde el
  Excel original (texto en color dentro del nombre = importado / depende del dólar). Ver punto 4
  de arriba — se muestra solo en la app, nunca en exportaciones a clientes.
- Cuando un producto entra al presupuesto, se guarda un **snapshot** de su precio: cambiar el
  precio en la lista después NO altera un presupuesto ya armado.

## Sistema de temas
- Atributo `data-theme` en `<html>` (`light` por defecto | `dark`).
- `:root` = claro; `[data-theme="dark"]` sólo redefine ~14 variables de color.
- `app.js` persiste la elección en `localStorage` (`ep_tema`) y respeta `prefers-color-scheme`
  en la primera visita.
- **Regla de oro: nunca hardcodear un color.** Siempre `var(--...)`.

## Convenciones de UI
- Color primario: `var(--primario)` (azul #1D4E89). Acento: `var(--acento)` (amarillo #F5B301).
- Tipografía de dos fuentes: **Plus Jakarta Sans** para títulos/precios (`var(--serif)`),
  **Inter** para el resto (`var(--sans)`). Nunca hardcodear el nombre de la fuente.
- Mobile-first, probado a 375px. Border-radius 10-14px. Botones y texto grandes (persona grande).
- Impresión: **NO se usa `window.print()`**. "Imprimir / PDF" genera el PDF real con `pdf.js`
  (los mismos `construirPdfPresupuesto`/`construirPdfListaPrecios` que usa "Enviar PDF por
  WhatsApp") y lo abre en una pestaña nueva (`_abrirPdfEnPestana`). Es a propósito: si se imprime
  la página HTML con `window.print()`, el navegador le agrega su propio encabezado/pie con el
  título y la URL del sitio — abriendo un PDF ya armado eso nunca pasa.
- Cantidad de un ítem del presupuesto: arranca **vacía** (no en `1`) al agregar un producto, para
  que el usuario tipee la cantidad real sin tener que borrar nada primero. Al perder el foco, si
  quedó vacía o inválida, se deja vacía (ya NO se fuerza a `1`) — `calcularLinea`/`calcularPresupuesto`
  ya manejan cantidad inválida devolviendo `ok:false`, así que el total muestra "—" hasta completarla.

## Cosas que NO hay que hacer
- **No** agregar la marca Operon (badge, "Nodo suelto", etc.). Es proyecto de tercero.
- **No** agregar dependencias sin justificación fuerte. Nada de frameworks ni build step.
- **No** hardcodear colores ni fuentes fuera de las variables CSS.
- **No** mezclar lógica de cálculo dentro de `app.js`: va en `calc.js`, con su test.
- **No** usar `innerHTML` con texto del usuario sin pasar por `escapeHtml()`.

## Cómo correr / deployar
- Local: abrir `index.html` en el navegador (no necesita servidor). Para probar como en producción,
  cualquier server estático sirve.
- Tests: `node js/calc.test.js`.
- Deploy: Vercel como sitio estático. **Ojo:** deployar sin `.git` o con el autor del commit
  habilitado en el team, porque Vercel bloquea deploys de autores no autorizados.

## Trabajos pendientes / ideas futuras
- [ ] Numeración de presupuestos (Nº correlativo) y quizás guardar historial de presupuestos.
- [ ] Descuento global por presupuesto (además del aumento por % en la lista).
- [ ] Exportar el presupuesto a PDF directo (hoy es vía "Imprimir → Guardar como PDF").
- [ ] Si algún día quiere usarlo en varios dispositivos sincronizados: migrar el storage a
      Supabase sin tocar la UI (la capa de datos ya está aislada en app.js).
