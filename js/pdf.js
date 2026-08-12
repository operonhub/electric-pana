// pdf.js — Generador de un PDF de la LISTA DE PRECIOS, sin dependencias.
// Arma un PDF válido a mano (objetos, tabla xref, trailer) con texto plano en
// las fuentes estándar Helvetica/Helvetica-Bold (vienen incluidas en
// cualquier lector de PDF, no hay que "embeber" nada). Función pura, sin DOM.
//
//   construirPdfListaPrecios({ items, filtro, fecha }) -> Uint8Array
//
// Se usa para poder compartir la lista como PDF por WhatsApp (Web Share API),
// algo que "Imprimir" no permite porque no entrega los bytes del archivo.
// Validado con pypdf. Ver README.

(function () {
  'use strict';

  const PAGE_W = 595, PAGE_H = 842;          // A4 en puntos
  const MARGEN = 40;
  const ANCHO_UTIL = PAGE_W - MARGEN * 2;
  const COL_COD_X = MARGEN;
  const COL_PROD_X = MARGEN + 60;
  const COL_PROD_ANCHO = PAGE_W - MARGEN - 70 - COL_PROD_X;
  const ALTO_LINEA = 14;
  const TAM_TEXTO = 9;

  // Anchos EXACTOS (en 1/1000 em) de las tablas AFM estándar de Helvetica y
  // Helvetica-Bold. Hace falta la tabla completa (no un promedio) porque un
  // promedio parejo subestima texto en MAYÚSCULAS (nombres de producto) y
  // no distingue negrita de regular — eso causaba solapamientos con los
  // chips de cambio de precio y desalineación en el total (bold) del
  // presupuesto (bugs reales que pasaron).
  const ANCHO_REGULAR = {
    ' ':278,'!':278,'"':355,'#':556,'$':556,'%':889,'&':667,"'":191,'(':333,')':333,'*':389,'+':584,
    ',':278,'-':333,'.':278,'/':278,'0':556,'1':556,'2':556,'3':556,'4':556,'5':556,'6':556,'7':556,
    '8':556,'9':556,':':278,';':278,'<':584,'=':584,'>':584,'?':556,'@':1015,
    A:667,B:667,C:722,D:722,E:667,F:611,G:778,H:722,I:278,J:500,K:667,L:556,M:833,N:722,O:778,P:667,
    Q:778,R:722,S:667,T:611,U:722,V:667,W:944,X:667,Y:667,Z:611,
    '[':278,'\\':278,']':278,'^':469,'_':556,'`':333,
    a:556,b:556,c:500,d:556,e:556,f:278,g:556,h:556,i:222,j:222,k:500,l:222,m:833,n:556,o:556,p:556,
    q:556,r:333,s:500,t:278,u:556,v:500,w:722,x:500,y:500,z:500,'{':334,'|':260,'}':334,'~':584,
    'á':556,'é':556,'í':222,'ó':556,'ú':556,'ñ':556,'Ñ':722,'ü':556,'Ü':722,'¿':556,'¡':333,
  };
  const ANCHO_BOLD = {
    ' ':278,'!':333,'"':474,'#':556,'$':556,'%':889,'&':722,"'":238,'(':333,')':333,'*':389,'+':584,
    ',':278,'-':333,'.':278,'/':278,'0':556,'1':556,'2':556,'3':556,'4':556,'5':556,'6':556,'7':556,
    '8':556,'9':556,':':333,';':333,'<':584,'=':584,'>':584,'?':611,'@':975,
    A:722,B:722,C:722,D:722,E:667,F:611,G:778,H:722,I:278,J:556,K:722,L:611,M:833,N:722,O:778,P:667,
    Q:778,R:722,S:667,T:611,U:722,V:667,W:944,X:667,Y:667,Z:611,
    '[':333,'\\':278,']':333,'^':584,'_':556,'`':333,
    a:556,b:611,c:556,d:611,e:556,f:333,g:611,h:611,i:278,j:278,k:556,l:278,m:889,n:611,o:611,p:611,
    q:611,r:389,s:556,t:333,u:611,v:556,w:778,x:556,y:556,z:500,'{':389,'|':280,'}':389,'~':584,
    'á':556,'é':556,'í':278,'ó':611,'ú':611,'ñ':611,'Ñ':722,'ü':611,'Ü':722,'¿':611,'¡':333,
  };

  function _anchoAprox(texto, tam, negrita) {
    const tabla = negrita ? ANCHO_BOLD : ANCHO_REGULAR;
    let unidades = 0;
    for (const ch of String(texto)) unidades += tabla[ch] != null ? tabla[ch] : 600;
    return (unidades * tam) / 1000;
  }

  function _truncar(texto, anchoMax, tam, negrita) {
    let t = String(texto == null ? '' : texto);
    if (_anchoAprox(t, tam, negrita) <= anchoMax) return t;
    // "..." (tres puntos ASCII), no el carácter elipsis: ese queda fuera del
    // rango Latin-1/WinAnsi que soporta _escaparPdf y se vería como "?".
    while (t.length > 1 && _anchoAprox(t + '...', tam, negrita) > anchoMax) t = t.slice(0, -1);
    return t + '...';
  }

  // Porcentaje con decimales cuando hace falta (0,65% en vez de redondear a
  // 0% o 1%), sin decimales de sobra (15% no muestra "15,00%").
  function _formatearPct(n) {
    let s = (Math.round(Math.abs(n) * 100) / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
  }

  // WinAnsiEncoding coincide con Latin-1 para el rango que usamos (incluye
  // á é í ó ú ñ Ñ ¿ ¡ ü), así que un codePoint <= 255 se mapea directo a byte.
  function _escaparPdf(texto) {
    let out = '';
    for (const ch of String(texto == null ? '' : texto)) {
      out += ch.codePointAt(0) <= 255 ? ch : '?';
    }
    return out.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function _formatearMiles(n) {
    const entero = Math.round(Number(n) || 0);
    const abs = Math.abs(entero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (entero < 0 ? '-' : '') + abs;
  }
  function _formatearPesos(n) {
    return '$ ' + _formatearMiles(n);
  }

  function _texto(ops, x, y, texto, tam, negrita) {
    ops.push(`BT /${negrita ? 'F2' : 'F1'} ${tam} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${_escaparPdf(texto)}) Tj ET`);
  }
  function _textoDerecha(ops, xDerecha, y, texto, tam, negrita) {
    _texto(ops, xDerecha - _anchoAprox(texto, tam, negrita), y, texto, tam, negrita);
  }
  function _rectGris(ops, x, y, w, h, gris) {
    ops.push(`${gris} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  }
  function _textoColor(ops, x, y, texto, tam, negrita, r, g, b) {
    ops.push(
      `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ` +
      `BT /${negrita ? 'F2' : 'F1'} ${tam} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${_escaparPdf(texto)}) Tj ET ` +
      `0 0 0 rg`
    );
  }

  // Rayo ⚡ dibujado como path PDF (el carácter Unicode queda fuera de WinAnsiEncoding).
  // Vértices normalizados del SVG M13 2 4 14h6l-1 8 9-12h-6l1-8z, volteados a coords PDF
  // (y hacia arriba): bounding box 14×20. 'size' controla la altura en puntos.
  function _rayito(ops, x, y, size) {
    const s = size / 20;
    const p = (px, py) => `${(x + px * s).toFixed(2)} ${(y + py * s).toFixed(2)}`;
    ops.push(
      `q 0.961 0.702 0.004 rg ` +
      `${p(9, 20)} m ${p(0, 8)} l ${p(6, 8)} l ${p(5, 0)} l ${p(14, 12)} l ${p(8, 12)} l h f Q`
    );
  }

  function construirPdfListaPrecios({ items, filtro, fecha, cambios }) {
    // Agrupar por categoría, en el orden en que aparecen los productos.
    const grupos = new Map();
    for (const p of items) {
      if (!grupos.has(p.cat)) grupos.set(p.cat, []);
      grupos.get(p.cat).push(p);
    }
    for (const prods of grupos.values()) prods.sort((a, b) => Number(a.cod) - Number(b.cod));
    const gruposOrdenados = new Map([...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'es')));

    const paginas = [];
    let ops = null, y = 0, esPrimera = true;

    function encabezadoTabla() {
      _rectGris(ops, MARGEN - 4, y - 4, ANCHO_UTIL + 8, ALTO_LINEA, 0.85);
      _texto(ops, COL_COD_X, y, 'Código', TAM_TEXTO, true);
      _texto(ops, COL_PROD_X, y, 'Producto', TAM_TEXTO, true);
      _textoDerecha(ops, PAGE_W - MARGEN, y, 'Precio', TAM_TEXTO, true);
      y -= ALTO_LINEA;
    }

    function nuevaPagina() {
      ops = [];
      paginas.push(ops);
      y = PAGE_H - MARGEN;
      if (esPrimera) {
        _rayito(ops, MARGEN, y, 12);
        _texto(ops, MARGEN + 12, y, 'ELECTRIC PANA', 16, true);
        _textoDerecha(ops, PAGE_W - MARGEN, y, 'LISTA DE PRECIOS', 12, true);
        y -= 16;
        _texto(ops, MARGEN, y, 'Materiales Eléctricos', 9, false);
        y -= 16;
        _texto(ops, MARGEN, y, 'Fecha: ' + fecha, 9, false);
        y -= 12;
        if (filtro) { _texto(ops, MARGEN, y, 'Filtro: ' + filtro, 9, false); y -= 12; }
        _texto(ops, MARGEN, y, 'Productos: ' + items.length, 9, false);
        y -= 18;
        esPrimera = false;
      } else {
        _texto(ops, MARGEN, y, 'ELECTRIC PANA - Lista de precios (cont.)', 9, true);
        y -= 18;
      }
      encabezadoTabla();
    }

    function asegurarEspacio() {
      if (y < MARGEN + ALTO_LINEA) nuevaPagina();
    }

    nuevaPagina();
    for (const [cat, prods] of gruposOrdenados) {
      asegurarEspacio();
      _rectGris(ops, MARGEN - 4, y - 4, ANCHO_UTIL + 8, ALTO_LINEA, 0.92);
      _texto(ops, MARGEN, y, cat, TAM_TEXTO, true);
      y -= ALTO_LINEA;
      for (const p of prods) {
        asegurarEspacio();
        _texto(ops, COL_COD_X, y, String(p.cod), TAM_TEXTO, false);
        const cambio = cambios && cambios.get(String(p.id));
        const nomAncho = cambio ? COL_PROD_ANCHO - 38 : COL_PROD_ANCHO;
        const nomTruncado = _truncar(p.nom, nomAncho, TAM_TEXTO);
        _texto(ops, COL_PROD_X, y, nomTruncado, TAM_TEXTO, false);
        if (cambio) {
          const txt = cambio.tipo === 'nuevo' ? 'NUEVO' : (cambio.tipo === 'sube' ? '+' : '-') + _formatearPct(cambio.pct) + '%';
          const xChip = COL_PROD_X + _anchoAprox(nomTruncado, TAM_TEXTO) + 4;
          if (cambio.tipo === 'sube') _textoColor(ops, xChip, y, txt, 7, true, 0.1, 0.55, 0.2);
          else if (cambio.tipo === 'baja') _textoColor(ops, xChip, y, txt, 7, true, 0.78, 0.1, 0.1);
          else _textoColor(ops, xChip, y, txt, 7, true, 0.2, 0.35, 0.8);
        }
        _textoDerecha(ops, PAGE_W - MARGEN, y, _formatearPesos(p.precio), TAM_TEXTO, false);
        y -= ALTO_LINEA;
      }
    }

    return _ensamblarPdf(paginas);
  }

  // Columnas del presupuesto: Cant. | Código | Categoría | Detalle | P. Unit. | Importe.
  // P. Unit. e Importe se alinean a la derecha, así que necesitan un ANCHO
  // RESERVADO propio (no solo un margen desde su borde derecho): un precio
  // corto empieza más a la izquierda de lo que parece, y si Detalle no
  // respeta esa reserva, el texto largo se superpone con el precio.
  const COL_CANT_X = MARGEN;
  const COL_COD_X_PRESU = MARGEN + 30;
  const COL_CAT_X_PRESU = MARGEN + 68;
  const COL_DET_X_PRESU = MARGEN + 163;
  const ANCHO_COL_PRECIO = 80; // cubre cómodo hasta "$ 9.999.999"
  const X_IMPORTE_DER = PAGE_W - MARGEN;
  const X_PUNIT_DER = X_IMPORTE_DER - ANCHO_COL_PRECIO - 12;
  const COL_CAT_ANCHO_PRESU = COL_DET_X_PRESU - 10 - COL_CAT_X_PRESU;
  const COL_DET_ANCHO_PRESU = (X_PUNIT_DER - ANCHO_COL_PRECIO) - 10 - COL_DET_X_PRESU;

  // Construye el PDF de un presupuesto: cliente/domicilio/fecha, tabla de
  // ítems, y subtotal/descuento/total (si hay descuento aplicado).
  function construirPdfPresupuesto({ cliente, domicilio, fecha, items, subtotal, descuento, total, etiquetaDescuento, numero }) {
    const paginas = [];
    let ops = null, y = 0, esPrimera = true;

    function encabezadoTabla() {
      _rectGris(ops, MARGEN - 4, y - 4, ANCHO_UTIL + 8, ALTO_LINEA, 0.85);
      _texto(ops, COL_CANT_X, y, 'Cant.', TAM_TEXTO, true);
      _texto(ops, COL_COD_X_PRESU, y, 'Código', TAM_TEXTO, true);
      _texto(ops, COL_CAT_X_PRESU, y, 'Categoría', TAM_TEXTO, true);
      _texto(ops, COL_DET_X_PRESU, y, 'Detalle', TAM_TEXTO, true);
      _textoDerecha(ops, X_PUNIT_DER, y, 'P. Unit.', TAM_TEXTO, true);
      _textoDerecha(ops, PAGE_W - MARGEN, y, 'Importe', TAM_TEXTO, true);
      y -= ALTO_LINEA;
    }

    function nuevaPagina() {
      ops = [];
      paginas.push(ops);
      y = PAGE_H - MARGEN;
      if (esPrimera) {
        _rayito(ops, MARGEN, y, 12);
        _texto(ops, MARGEN + 12, y, 'ELECTRIC PANA', 16, true);
        _textoDerecha(ops, PAGE_W - MARGEN, y, 'PRESUPUESTO', 12, true);
        y -= 13;
        if (numero) _textoDerecha(ops, PAGE_W - MARGEN, y, 'N\xba ' + String(numero).padStart(3, '0'), 9, false);
        y -= 3;
        _texto(ops, MARGEN, y, 'Materiales Eléctricos', 9, false);
        y -= 16;
        _texto(ops, MARGEN, y, 'Fecha: ' + fecha, 9, false);
        y -= 12;
        if (cliente) { _texto(ops, MARGEN, y, 'Cliente: ' + cliente, 11, true); y -= 14; }
        if (domicilio) { _texto(ops, MARGEN, y, 'Domicilio: ' + domicilio, 9, false); y -= 12; }
        y -= 6;
        esPrimera = false;
      } else {
        _texto(ops, MARGEN, y, 'ELECTRIC PANA - Presupuesto (cont.)', 9, true);
        y -= 18;
      }
      encabezadoTabla();
    }

    function asegurarEspacio(lineasExtra) {
      if (y < MARGEN + ALTO_LINEA * (lineasExtra || 1)) nuevaPagina();
    }

    nuevaPagina();
    for (const it of items) {
      asegurarEspacio();
      _texto(ops, COL_CANT_X, y, _formatearMiles(it.cantidad), TAM_TEXTO, false);
      _texto(ops, COL_COD_X_PRESU, y, String(it.cod || ''), TAM_TEXTO, false);
      if (it.cat) _texto(ops, COL_CAT_X_PRESU, y, _truncar(it.cat, COL_CAT_ANCHO_PRESU, TAM_TEXTO), TAM_TEXTO, false);
      _texto(ops, COL_DET_X_PRESU, y, _truncar(it.nom, COL_DET_ANCHO_PRESU, TAM_TEXTO), TAM_TEXTO, false);
      _textoDerecha(ops, X_PUNIT_DER, y, _formatearPesos(it.precio), TAM_TEXTO, false);
      _textoDerecha(ops, PAGE_W - MARGEN, y, _formatearPesos(it.importe), TAM_TEXTO, false);
      y -= ALTO_LINEA;
    }

    const lineasTotal = descuento > 0 ? 3 : 1;
    asegurarEspacio(lineasTotal + 1);
    y -= 6;
    if (descuento > 0) {
      _textoDerecha(ops, PAGE_W - MARGEN, y, 'Subtotal: ' + _formatearPesos(subtotal), TAM_TEXTO, false);
      y -= ALTO_LINEA;
      _textoDerecha(ops, PAGE_W - MARGEN, y, etiquetaDescuento + ': -' + _formatearPesos(descuento), TAM_TEXTO, false);
      y -= ALTO_LINEA;
    }
    _textoDerecha(ops, PAGE_W - MARGEN, y, 'TOTAL: ' + _formatearPesos(total), 12, true);
    y -= ALTO_LINEA * 2;
    _texto(ops, MARGEN, y, 'Documento no válido como factura. Presupuesto sujeto a modificación sin previo aviso.', 7, false);

    return _ensamblarPdf(paginas);
  }

  function _ensamblarPdf(paginas) {
    const n = paginas.length;
    const idCatalogo = 1, idPages = 2;
    const idsPaginas = [];
    for (let i = 0; i < n; i++) idsPaginas.push(3 + i * 2);
    const idFontRegular = 3 + n * 2;
    const idFontBold = idFontRegular + 1;

    const objetos = [];
    objetos[idCatalogo] = `<< /Type /Catalog /Pages ${idPages} 0 R >>`;
    objetos[idPages] = `<< /Type /Pages /Kids [${idsPaginas.map((id) => id + ' 0 R').join(' ')}] /Count ${n} >>`;
    for (let i = 0; i < n; i++) {
      const idPagina = 3 + i * 2;
      const idContenido = idPagina + 1;
      objetos[idPagina] = `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${idFontRegular} 0 R /F2 ${idFontBold} 0 R >> >> /Contents ${idContenido} 0 R >>`;
      const stream = paginas[i].join('\n');
      objetos[idContenido] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }
    objetos[idFontRegular] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objetos[idFontBold] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    const totalObjetos = idFontBold;
    let out = '%PDF-1.4\n%âãÏÓ\n';
    const offsets = new Array(totalObjetos + 1).fill(0);
    for (let id = 1; id <= totalObjetos; id++) {
      offsets[id] = out.length;
      out += `${id} 0 obj\n${objetos[id]}\nendobj\n`;
    }
    const xrefOffset = out.length;
    out += `xref\n0 ${totalObjetos + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= totalObjetos; id++) out += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
    out += `trailer\n<< /Size ${totalObjetos + 1} /Root ${idCatalogo} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    // 1 carácter = 1 byte (todo el documento se construyó con códigos 0-255).
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
    return bytes;
  }

  const API = { construirPdfListaPrecios, construirPdfPresupuesto };
  if (typeof window !== 'undefined') Object.assign(window, API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
