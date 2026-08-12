// calc.js — Funciones PURAS (sin DOM, sin window salvo el export final).
// Reciben datos y devuelven resultados. Toda cuenta crítica del presupuesto
// vive acá para poder testearse sin abrir el navegador.
//
// Convención: cuando un cálculo puede no ser válido, se devuelve
//   { ok: false, motivo: '...' }  en vez de tirar excepción o un número raro.

/** Formatea un entero con separador de miles: 12345 -> "12.345". Vacío si no es número. */
function formatearMiles(n) {
  if (n === '' || n === null || n === undefined) return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  const entero = Math.round(num);
  const signo = entero < 0 ? '-' : '';
  const abs = Math.abs(entero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return signo + abs;
}

/** Formatea un número como pesos argentinos: 12345 -> "$ 12.345". */
function formatearPesos(n) {
  const m = formatearMiles(n);
  return '$ ' + (m === '' ? '0' : m);
}

/**
 * Convierte lo tipeado en un campo (con o sin puntos de miles) a un entero.
 * "3.102" -> 3102 · "1.000.000" -> 1000000 · "" -> NaN.
 */
function parseNumero(str) {
  if (typeof str === 'number') return Number.isFinite(str) ? Math.round(str) : NaN;
  const soloDigitos = String(str == null ? '' : str).replace(/[^\d]/g, '');
  return soloDigitos === '' ? NaN : parseInt(soloDigitos, 10);
}

/** Normaliza texto para buscar sin acentos ni mayúsculas. */
function normalizar(texto) {
  return String(texto == null ? '' : texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // saca tildes
}

/**
 * Importe de una línea del presupuesto.
 * @returns {{ok:true, importe:number} | {ok:false, motivo:string}}
 */
function calcularLinea(cantidad, precio) {
  const cant = Number(cantidad);
  const pu = Number(precio);
  if (!Number.isFinite(cant) || cant <= 0) return { ok: false, motivo: 'La cantidad tiene que ser mayor que cero' };
  if (!Number.isFinite(pu) || pu < 0) return { ok: false, motivo: 'El precio no es válido' };
  return { ok: true, importe: Math.round(cant * pu) };
}

/**
 * Total del presupuesto a partir de una lista de items.
 * @param {Array<{cantidad:number, precio:number}>} items
 * @returns {{ok:true, total:number, importes:number[]} | {ok:false, motivo:string}}
 */
function calcularPresupuesto(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, motivo: 'El presupuesto está vacío' };
  }
  const importes = [];
  let total = 0;
  for (const it of items) {
    const linea = calcularLinea(it.cantidad, it.precio);
    if (!linea.ok) return { ok: false, motivo: linea.motivo };
    importes.push(linea.importe);
    total += linea.importe;
  }
  return { ok: true, total, importes };
}

/**
 * Aplica un aumento (o descuento con % negativo) a un precio y redondea.
 * @returns {{ok:true, nuevo:number} | {ok:false, motivo:string}}
 */
function aplicarAumento(precio, porcentaje) {
  const p = Number(precio);
  const pct = Number(porcentaje);
  if (!Number.isFinite(p) || p < 0) return { ok: false, motivo: 'El precio no es válido' };
  if (!Number.isFinite(pct)) return { ok: false, motivo: 'El porcentaje no es válido' };
  if (pct <= -100) return { ok: false, motivo: 'Un descuento de 100% o más dejaría el precio en cero o negativo' };
  const nuevo = Math.round(p * (1 + pct / 100));
  return { ok: true, nuevo };
}

/**
 * Aplica un descuento a un subtotal. El descuento puede ser por porcentaje
 * ('pct') o por monto fijo ('monto'). Nunca deja el total en negativo.
 * @returns {{ok:true, descuento:number, total:number} | {ok:false, motivo:string}}
 */
function calcularDescuento(subtotal, modo, valor) {
  const s = Number(subtotal);
  if (!Number.isFinite(s) || s < 0) return { ok: false, motivo: 'Subtotal inválido' };
  const sub = Math.round(s);
  const v = Number(valor);
  // Sin descuento (vacío, cero o inválido) -> total = subtotal
  if (valor === '' || valor === null || valor === undefined || !Number.isFinite(v) || v <= 0) {
    return { ok: true, descuento: 0, total: sub };
  }
  let descuento;
  if (modo === 'monto') {
    descuento = Math.min(Math.round(v), sub);        // no puede superar el subtotal
  } else {
    const pct = Math.min(v, 100);                     // tope 100%
    descuento = Math.round(sub * pct / 100);
  }
  return { ok: true, descuento, total: sub - descuento };
}

/**
 * Filtra el catálogo por nombre, código o categoría. Búsqueda por palabras
 * (todas las palabras tienen que aparecer). Devuelve como mucho `limite`.
 * @param {Array<{cod:string, nom:string, cat:string}>} catalogo
 */
function buscarProductos(catalogo, consulta, limite = 40) {
  if (!Array.isArray(catalogo)) return [];
  const q = normalizar(consulta).trim();
  if (!q) return [];
  const palabras = q.split(/\s+/);
  const res = [];
  for (const p of catalogo) {
    const heno = normalizar(`${p.cod} ${p.nom} ${p.cat}`);
    if (palabras.every((w) => heno.includes(w))) {
      res.push(p);
      if (res.length >= limite) break;
    }
  }
  return res;
}

// Export dual: navegador (window) y Node (tests con require).
const API = { formatearPesos, formatearMiles, parseNumero, normalizar, calcularLinea, calcularPresupuesto, calcularDescuento, aplicarAumento, buscarProductos };
if (typeof window !== 'undefined') Object.assign(window, API);
if (typeof module !== 'undefined' && module.exports) module.exports = API;
