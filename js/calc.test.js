// calc.test.js — Tests de las fórmulas críticas del presupuesto.
// Corre sin dependencias:  node js/calc.test.js
// Si algún cálculo se rompe, esto avisa antes de que un cliente reciba un
// presupuesto con el total mal.

const {
  formatearPesos, formatearMiles, parseNumero, normalizar, calcularLinea,
  calcularPresupuesto, calcularDescuento, aplicarAumento, buscarProductos,
} = require('./calc.js');

let pasaron = 0, fallaron = 0;
function ok(cond, nombre) {
  if (cond) { pasaron++; }
  else { fallaron++; console.error('  ✗ FALLÓ:', nombre); }
}
function igual(a, b, nombre) { ok(JSON.stringify(a) === JSON.stringify(b), `${nombre} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`); }

// --- formatearPesos ---
igual(formatearPesos(12345), '$ 12.345', 'formatea miles');
igual(formatearPesos(1000000), '$ 1.000.000', 'formatea millones');
igual(formatearPesos(0), '$ 0', 'formatea cero');
igual(formatearPesos(1704.6), '$ 1.705', 'redondea decimales');
igual(formatearPesos('abc'), '$ 0', 'texto inválido -> $ 0');

// --- formatearMiles ---
igual(formatearMiles(3102), '3.102', 'miles: 3.102');
igual(formatearMiles(1000000), '1.000.000', 'miles: millones');
igual(formatearMiles(500), '500', 'miles: menos de mil sin punto');
igual(formatearMiles(0), '0', 'miles: cero');
igual(formatearMiles(''), '', 'miles: vacío -> vacío');
igual(formatearMiles(1704.6), '1.705', 'miles: redondea');

// --- parseNumero ---
igual(parseNumero('3.102'), 3102, 'parse: saca puntos de miles');
igual(parseNumero('1.000.000'), 1000000, 'parse: millones');
igual(parseNumero('500'), 500, 'parse: simple');
igual(parseNumero(3102), 3102, 'parse: ya es número');
ok(Number.isNaN(parseNumero('')), 'parse: vacío -> NaN');
ok(Number.isNaN(parseNumero('abc')), 'parse: texto -> NaN');

// --- calcularLinea ---
igual(calcularLinea(3, 100), { ok: true, importe: 300 }, 'línea simple');
igual(calcularLinea(2, 1704.5), { ok: true, importe: 3409 }, 'línea con decimales redondea');
ok(calcularLinea(0, 100).ok === false, 'cantidad 0 no es válida');
ok(calcularLinea(-1, 100).ok === false, 'cantidad negativa no es válida');
ok(calcularLinea(2, -5).ok === false, 'precio negativo no es válido');

// --- calcularPresupuesto ---
igual(
  calcularPresupuesto([{ cantidad: 2, precio: 100 }, { cantidad: 1, precio: 50 }]),
  { ok: true, total: 250, importes: [200, 50] },
  'total de dos líneas',
);
ok(calcularPresupuesto([]).ok === false, 'presupuesto vacío no es válido');
ok(calcularPresupuesto([{ cantidad: 0, precio: 100 }]).ok === false, 'una línea inválida invalida el total');

// --- calcularDescuento ---
igual(calcularDescuento(10000, 'pct', 15), { ok: true, descuento: 1500, total: 8500 }, 'descuento 15%');
igual(calcularDescuento(10000, 'monto', 2500), { ok: true, descuento: 2500, total: 7500 }, 'descuento $2500');
igual(calcularDescuento(10000, 'pct', ''), { ok: true, descuento: 0, total: 10000 }, 'sin descuento (vacío)');
igual(calcularDescuento(10000, 'pct', 0), { ok: true, descuento: 0, total: 10000 }, 'sin descuento (cero)');
igual(calcularDescuento(10000, 'monto', 99999), { ok: true, descuento: 10000, total: 0 }, 'monto no supera el subtotal');
igual(calcularDescuento(10000, 'pct', 150), { ok: true, descuento: 10000, total: 0 }, 'porcentaje tope 100%');
igual(calcularDescuento(1704, 'pct', 10), { ok: true, descuento: 170, total: 1534 }, 'descuento redondea');

// --- aplicarAumento ---
igual(aplicarAumento(1000, 20), { ok: true, nuevo: 1200 }, 'aumento 20%');
igual(aplicarAumento(1000, -10), { ok: true, nuevo: 900 }, 'descuento 10%');
igual(aplicarAumento(1704, 15), { ok: true, nuevo: 1960 }, 'aumento con redondeo');
ok(aplicarAumento(1000, -100).ok === false, 'descuento 100% no es válido');

// --- normalizar / buscarProductos ---
igual(normalizar('Reducción É Ñ'), 'reduccion e n', 'saca tildes y baja a minúscula');
const cat = [
  { cod: '6', nom: 'Reducción Edison a Mignon', cat: 'ADAPTADOR LÁMPARA' },
  { cod: '5600', nom: 'Interior Avispa', cat: 'ANTENAS DE T.V' },
  { cod: '1075', nom: 'cable HDMI 19P 1,5 metros', cat: 'AUDIO Y VIDEO' },
];
igual(buscarProductos(cat, 'reduccion').length, 1, 'busca sin acento');
igual(buscarProductos(cat, '5600').length, 1, 'busca por código');
igual(buscarProductos(cat, 'cable hdmi').length, 1, 'busca por varias palabras');
igual(buscarProductos(cat, '').length, 0, 'búsqueda vacía no devuelve nada');
igual(buscarProductos(cat, 'antenas').length, 1, 'busca por categoría');

console.log(`\n${pasaron} pasaron, ${fallaron} fallaron`);
process.exit(fallaron ? 1 : 0);
