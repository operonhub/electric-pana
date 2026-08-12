// xlsx.js — Generador de archivos .xlsx MÍNIMO, sin dependencias.
// Un .xlsx es un ZIP con XML adentro. Acá se arma ese ZIP a mano (método
// "store", sin compresión) para no sumar librerías. Funciones puras, sin DOM.
//
//   construirXlsxBytes(filas, nombreHoja) -> Uint8Array (bytes del .xlsx)
//   filas: Array<Fila>
//   Fila = Array<string|number>                  fila normal
//        | { cells: Array<string|number>, negrita: true }   fila título (bold + fondo gris)
//
// Validado abriéndolo con Excel / openpyxl. Ver README.

(function () {
  'use strict';

  // ---- CRC32 (requerido por el formato ZIP) ----
  let _tabla = null;
  function _crc32(bytes) {
    if (!_tabla) {
      _tabla = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        _tabla[n] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = _tabla[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  const pushU16 = (arr, v) => { arr.push(v & 0xFF, (v >>> 8) & 0xFF); };
  const pushU32 = (arr, v) => { arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); };

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // saca caracteres inválidos en XML
  }

  // Letra de columna: 0 -> A, 1 -> B, 26 -> AA ...
  function _col(n) {
    let s = ''; n++;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  // Acepta filas como array plano (fila normal) u objeto {cells, negrita}.
  function _normalizarFila(fila) {
    if (Array.isArray(fila)) return { cells: fila, negrita: false };
    return { cells: fila.cells || [], negrita: !!fila.negrita };
  }

  function _sheetXml(filas) {
    let rows = '';
    for (let r = 0; r < filas.length; r++) {
      const { cells: celdas, negrita } = _normalizarFila(filas[r]);
      const estilo = negrita ? ' s="1"' : '';
      let cs = '';
      for (let c = 0; c < celdas.length; c++) {
        const ref = _col(c) + (r + 1);
        const v = celdas[c];
        if (typeof v === 'number' && Number.isFinite(v)) {
          cs += `<c r="${ref}"${estilo}><v>${v}</v></c>`;
        } else {
          cs += `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${_esc(v)}</t></is></c>`;
        }
      }
      rows += `<row r="${r + 1}">${cs}</row>`;
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${rows}</sheetData></worksheet>`;
  }

  // styles.xml mínimo: xf 0 = normal, xf 1 = negrita + fondo gris claro (para títulos de categoría).
  const STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE0E0E0"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function construirXlsxBytes(filas, nombreHoja) {
    const hoja = _esc((nombreHoja || 'Hoja1').slice(0, 31));
    const enc = new TextEncoder();

    const files = {
      '[Content_Types].xml':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
      '_rels/.rels':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
      'xl/workbook.xml':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${hoja}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
      'xl/styles.xml': STYLES_XML,
      'xl/worksheets/sheet1.xml': _sheetXml(filas),
    };

    const chunks = [];      // datos (local headers + nombre + contenido)
    const central = [];     // central directory
    const entradas = [];
    let offset = 0;

    for (const name of Object.keys(files)) {
      const data = enc.encode(files[name]);
      const nameBytes = enc.encode(name);
      const crc = _crc32(data);

      const lh = [];
      pushU32(lh, 0x04034b50); pushU16(lh, 20); pushU16(lh, 0); pushU16(lh, 0);
      pushU16(lh, 0); pushU16(lh, 0);                 // hora/fecha 0
      pushU32(lh, crc); pushU32(lh, data.length); pushU32(lh, data.length);
      pushU16(lh, nameBytes.length); pushU16(lh, 0);
      const lhBytes = Uint8Array.from(lh);

      chunks.push(lhBytes, nameBytes, data);
      entradas.push({ nameBytes, crc, size: data.length, offset });
      offset += lhBytes.length + nameBytes.length + data.length;
    }

    const cdStart = offset;
    for (const e of entradas) {
      const ch = [];
      pushU32(ch, 0x02014b50); pushU16(ch, 20); pushU16(ch, 20); pushU16(ch, 0); pushU16(ch, 0);
      pushU16(ch, 0); pushU16(ch, 0);                 // hora/fecha 0
      pushU32(ch, e.crc); pushU32(ch, e.size); pushU32(ch, e.size);
      pushU16(ch, e.nameBytes.length); pushU16(ch, 0); pushU16(ch, 0); pushU16(ch, 0); pushU16(ch, 0);
      pushU32(ch, 0); pushU32(ch, e.offset);
      const chBytes = Uint8Array.from(ch);
      central.push(chBytes, e.nameBytes);
      offset += chBytes.length + e.nameBytes.length;
    }
    const cdSize = offset - cdStart;

    const eocd = [];
    pushU32(eocd, 0x06054b50); pushU16(eocd, 0); pushU16(eocd, 0);
    pushU16(eocd, entradas.length); pushU16(eocd, entradas.length);
    pushU32(eocd, cdSize); pushU32(eocd, cdStart); pushU16(eocd, 0);

    const partes = chunks.concat(central, [Uint8Array.from(eocd)]);
    const total = partes.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of partes) { out.set(p, pos); pos += p.length; }
    return out;
  }

  const API = { construirXlsxBytes };
  if (typeof window !== 'undefined') Object.assign(window, API);
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
