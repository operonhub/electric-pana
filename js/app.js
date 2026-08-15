// app.js — Wiring del DOM: eventos, render, localStorage, tema.
// NADA de fórmulas acá: toda la matemática vive en calc.js.
// Se apoya en window.CATALOGO_SEED (data.js) y en las funciones de calc.js.

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Claves de guardado y estado en memoria
  // ------------------------------------------------------------------
  const K_CATALOGO = 'ep_catalogo_v1';
  const K_PRESU = 'ep_presupuesto_v1';
  const K_TEMA = 'ep_tema';

  // Clientes habituales para autocompletar (no bloquea escribir uno nuevo).
  // Todo en mayúsculas: así lo pidió el dueño, para que quede prolijo en el
  // presupuesto sin importar cómo lo tipeen.
  const CLIENTES_CONOCIDOS = [
    'MS', 'LA ROSITA', 'ALVEAR', 'LOS TRONCOS', 'AVELLANEDA', 'EL ALEMAN',
    'ARIEL', 'CASA MARCELO', 'DANY', 'BRITOS', 'MAR', 'CENCI',
    'FEDERICO PEREZ', 'FERNANDITO 18', 'GO DAMIAN', 'KICO', 'LEO',
  ];

  // Localidad fija de cada cliente habitual: al elegirlos (o tipear el
  // nombre exacto), se completa solo el campo Localidad.
  const LOCALIDAD_AUTO = {
    MS: 'TIGRE',
    'LA ROSITA': 'SAN FERNANDO',
    ALVEAR: 'TIGRE',
    'LOS TRONCOS': 'TIGRE',
    AVELLANEDA: 'VIRREYES',
    'EL ALEMAN': 'PABLO PODESTA',
    ARIEL: 'LOMA HERMOSA',
    'CASA MARCELO': 'VILLA LIBERTAD',
    DANY: 'VILLA BOSCH',
    BRITOS: 'TIGRE',
    MAR: 'LOMA HERMOSA',
    CENCI: 'LOMA HERMOSA',
    'FEDERICO PEREZ': 'BARRIO LIBERTADOR',
    'FERNANDITO 18': 'CAÑUELAS',
    'GO DAMIAN': 'PABLO PODESTA',
    KICO: 'BARRIO LIBERTADOR',
    LEO: 'BARRIO LIBERTADOR',
  };

  const estado = {
    catalogo: [],   // productos editables { id, cod, nom, precio, cat }
    items: [],      // líneas del presupuesto { id, cod, nom, precio, cantidad }
    cliente: '', domicilio: '',
    descModo: 'pct', descValor: '',   // descuento: 'pct' | 'monto', y su valor (texto)
  };

  // null = comparación desactivada; Map<String, { tipo: 'sube'|'baja'|'nuevo', pct: number }>
  let modoComparacion = null;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Convierte a mayúsculas el valor de un input mientras se tipea, sin
  // perder la posición del cursor (Cliente y Localidad van siempre en mayúscula).
  function forzarMayus(input) {
    const pos = input.selectionStart;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(pos, pos);
  }

  // ------------------------------------------------------------------
  // Persistencia
  // ------------------------------------------------------------------
  function cargarCatalogo() {
    try {
      const raw = localStorage.getItem(K_CATALOGO);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignora datos corruptos */ }
    // Primera vez: copia del catálogo original (data.js)
    return (window.CATALOGO_SEED || []).map((p) => ({ ...p }));
  }
  function guardarCatalogo() {
    try { localStorage.setItem(K_CATALOGO, JSON.stringify(estado.catalogo)); }
    catch (e) { toast('No se pudo guardar (memoria llena)'); }
  }

  // Empuja un cambio a Supabase para que se vea en los demás dispositivos.
  // Falla en silencio (con un aviso corto) si no hay internet: el cambio
  // ya quedó guardado localmente, así que no se pierde nada.
  function sincronizarProducto(p) {
    if (!window.SupabaseSync) return;
    window.SupabaseSync.guardarProductoRemoto(p).catch(() => toast('Guardado en este dispositivo (sin conexión a la nube)'));
  }
  function sincronizarLote(lista) {
    if (!window.SupabaseSync) return;
    window.SupabaseSync.guardarProductosRemoto(lista).catch(() => toast('Guardado en este dispositivo (sin conexión a la nube)'));
  }
  function sincronizarBorrado(id) {
    if (!window.SupabaseSync) return;
    window.SupabaseSync.eliminarProductoRemoto(id).catch(() => toast('Borrado en este dispositivo (sin conexión a la nube)'));
  }
  function guardarPresu() {
    try {
      localStorage.setItem(K_PRESU, JSON.stringify({
        items: estado.items, cliente: estado.cliente,
        domicilio: estado.domicilio,
        descModo: estado.descModo, descValor: estado.descValor,
      }));
    } catch (e) { /* no crítico */ }
  }
  function cargarPresu() {
    try {
      const raw = localStorage.getItem(K_PRESU);
      if (raw) {
        const d = JSON.parse(raw);
        estado.items = Array.isArray(d.items) ? d.items : [];
        estado.cliente = d.cliente || '';
        estado.domicilio = d.domicilio || '';
        estado.descModo = d.descModo === 'monto' ? 'monto' : 'pct';
        estado.descValor = d.descValor || '';
      }
    } catch (e) { /* ignora */ }
  }

  // ------------------------------------------------------------------
  // Tema claro/oscuro
  // ------------------------------------------------------------------
  function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    $('.ico-sol').hidden = tema === 'dark';
    $('.ico-luna').hidden = tema !== 'dark';
    try { localStorage.setItem(K_TEMA, tema); } catch (e) {}
  }
  function initTema() {
    let tema = null;
    try { tema = localStorage.getItem(K_TEMA); } catch (e) {}
    if (!tema) tema = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    aplicarTema(tema);
    $('#btnTema').addEventListener('click', () => {
      aplicarTema(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  // ------------------------------------------------------------------
  // Aviso emergente (toast)
  // ------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('ver');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('ver'), 2600);
  }

  // ------------------------------------------------------------------
  // Tabs
  // ------------------------------------------------------------------
  function initTabs() {
    const tabs = [
      { btn: $('#tabPresu'), vista: $('#vistaPresu') },
      { btn: $('#tabCatalogo'), vista: $('#vistaCatalogo') },
    ];
    tabs.forEach(({ btn }, i) => btn.addEventListener('click', () => {
      tabs.forEach((t, j) => {
        t.btn.setAttribute('aria-selected', String(i === j));
        t.vista.hidden = i !== j;
      });
      if (i === 1) renderCatalogo();
    }));
  }

  // ==================================================================
  //  VISTA PRESUPUESTO
  // ==================================================================
  function initPresu() {
    // Datos del cliente (combo con sugerencias propias, no datalist nativo)
    const inpCliente = $('#inpCliente');
    inpCliente.addEventListener('input', (e) => {
      forzarMayus(e.target);
      estado.cliente = e.target.value; guardarPresu();
      renderSugerenciasClientes(e.target.value);
    });
    inpCliente.addEventListener('focus', () => renderSugerenciasClientes(inpCliente.value));
    inpCliente.addEventListener('focusout', () => aplicarLocalidadAuto(inpCliente.value));
    $('#resClientes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cliente]');
      if (!b) return;
      const valor = b.getAttribute('data-cliente');
      inpCliente.value = valor;
      estado.cliente = valor;
      aplicarLocalidadAuto(valor);
      guardarPresu();
      $('#resClientes').hidden = true;
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#inpCliente') && !e.target.closest('#resClientes')) $('#resClientes').hidden = true;
    });

    $('#inpDomicilio').addEventListener('input', (e) => {
      forzarMayus(e.target);
      estado.domicilio = e.target.value; guardarPresu();
    });

    // Ciertos clientes tienen localidad fija (ver LOCALIDAD_AUTO): al elegirlos
    // o tipear el nombre exacto, se completa sola el campo Localidad.
    function aplicarLocalidadAuto(nombreCliente) {
      const localidad = LOCALIDAD_AUTO[String(nombreCliente || '').trim().toUpperCase()];
      if (!localidad) return;
      estado.domicilio = localidad;
      $('#inpDomicilio').value = localidad;
      guardarPresu();
    }

    // Descuento (por % o por monto)
    $('#descModo').addEventListener('change', (e) => {
      estado.descModo = e.target.value === 'monto' ? 'monto' : 'pct';
      actualizarTotales(); guardarPresu();
    });
    $('#descValor').addEventListener('input', (e) => {
      estado.descValor = e.target.value; actualizarTotales(); guardarPresu();
    });
    $('#descValor').addEventListener('focusout', (e) => {
      const v = parseNumero(e.target.value);
      e.target.value = Number.isFinite(v) && v > 0 ? formatearMiles(v) : '';
      estado.descValor = e.target.value; actualizarTotales(); guardarPresu();
    });

    // Buscador para agregar productos
    const buscador = $('#buscaPresu');
    buscador.addEventListener('input', () => renderResultadosPresu(buscador.value));
    buscador.addEventListener('focus', () => { if (buscador.value) renderResultadosPresu(buscador.value); });

    // Delegación: agregar producto desde resultados
    $('#resPresu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]');
      if (!b) return;
      agregarItem(b.getAttribute('data-add'));
      buscador.value = '';
      $('#resPresu').hidden = true;
      buscador.focus();
    });

    // Delegación en la lista de ítems: cantidad, precio, borrar
    const lista = $('#listaItems');
    lista.addEventListener('input', (e) => {
      const fila = e.target.closest('[data-item]');
      if (!fila) return;
      const it = estado.items.find((x) => String(x.id) === fila.getAttribute('data-item'));
      if (!it) return;
      if (e.target.matches('[data-cant]')) it.cantidad = parseNumero(e.target.value);
      if (e.target.matches('[data-precio]')) it.precio = parseNumero(e.target.value);
      actualizarTotales();
      guardarPresu();
    });
    // Al salir del campo: reformatea con separador de miles si el valor es
    // válido. La cantidad, si queda vacía o inválida, se deja vacía (no se
    // fuerza a 1) para que el usuario pueda tipear el número que quiera sin
    // tener que borrar nada primero.
    lista.addEventListener('focusout', (e) => {
      const esCant = e.target.matches('[data-cant]');
      const esPrecio = e.target.matches('[data-precio]');
      if (!esCant && !esPrecio) return;
      const fila = e.target.closest('[data-item]');
      if (!fila) return;
      const it = estado.items.find((x) => String(x.id) === fila.getAttribute('data-item'));
      if (!it) return;
      if (esCant) {
        e.target.value = Number(it.cantidad) > 0 ? formatearMiles(it.cantidad) : '';
      } else {
        if (!(Number(it.precio) >= 0)) it.precio = 0;
        e.target.value = formatearMiles(it.precio);
      }
      actualizarTotales();
      guardarPresu();
    });
    lista.addEventListener('click', (e) => {
      const b = e.target.closest('[data-borrar]');
      if (!b) return;
      estado.items = estado.items.filter((x) => String(x.id) !== b.getAttribute('data-borrar'));
      renderItems();
      guardarPresu();
    });

    $('#btnLimpiar').addEventListener('click', vaciarPresu);
    $('#btnWpp').addEventListener('click', enviarWhatsApp);
    $('#btnPdfWpp').addEventListener('click', enviarPresupuestoPdfWhatsApp);
    $('#btnImprimir').addEventListener('click', imprimir);
  }

  function renderSugerenciasClientes(q) {
    const cont = $('#resClientes');
    const query = normalizar(q || '').trim();
    const items = CLIENTES_CONOCIDOS.filter((c) => !query || normalizar(c).includes(query));
    if (items.length === 0) { cont.hidden = true; cont.innerHTML = ''; return; }
    cont.innerHTML = items.map((c) => `
      <button class="resultado" type="button" data-cliente="${escapeHtml(c)}">
        <span class="r-info"><span class="r-nom">${escapeHtml(c)}</span></span>
      </button>`).join('');
    cont.hidden = false;
  }

  function renderResultadosPresu(q) {
    const cont = $('#resPresu');
    const query = (q || '').trim();
    if (!query) { cont.hidden = true; cont.innerHTML = ''; return; }
    const res = buscarProductos(estado.catalogo, query, 30);
    if (res.length === 0) {
      cont.innerHTML = '<div class="vacio">No se encontró ese producto.</div>';
      cont.hidden = false;
      return;
    }
    cont.innerHTML = res.map((p) => `
      <button class="resultado" type="button" data-add="${escapeHtml(p.id)}">
        <span class="cod-chip">${escapeHtml(p.cod)}</span>
        <span class="r-info">
          <span class="r-nom">${escapeHtml(p.nom)}</span>
          <span class="r-meta">${escapeHtml(p.cat)}</span>
        </span>
        <span class="r-precio">${formatearPesos(p.precio)}</span>
      </button>`).join('');
    cont.hidden = false;
  }

  function agregarItem(id) {
    const p = estado.catalogo.find((x) => String(x.id) === String(id));
    if (!p) return;
    // Si ya está en el presupuesto, sumamos una unidad. Si es nuevo, la
    // cantidad arranca vacía: así puede tipear directo el número que
    // necesita sin tener que borrar un "1" puesto por defecto.
    const ya = estado.items.find((x) => String(x.origen) === String(id));
    if (ya) { ya.cantidad = (Number(ya.cantidad) || 0) + 1; }
    else {
      estado.items.push({
        id: 'i' + Date.now() + Math.random().toString(36).slice(2, 6),
        origen: p.id, cod: p.cod, nom: p.nom, precio: p.precio, cantidad: '', cat: p.cat,
      });
    }
    renderItems();
    guardarPresu();
    toast('Agregado: ' + p.nom);
  }

  function renderItems() {
    const lista = $('#listaItems');
    const vacio = $('#itemsVacio');
    if (estado.items.length === 0) {
      lista.innerHTML = '';
      vacio.hidden = false;
      $('#resumen').hidden = true;
      return;
    }
    vacio.hidden = true;
    lista.innerHTML = estado.items.map((it) => {
      const linea = calcularLinea(it.cantidad, it.precio);
      const importe = linea.ok ? formatearPesos(linea.importe) : '—';
      return `
      <div class="item" data-item="${escapeHtml(it.id)}">
        <input class="cant" type="text" inputmode="numeric"
               value="${escapeHtml(formatearMiles(it.cantidad))}" data-cant aria-label="Cantidad" />
        <div>
          <div class="it-nom"><span class="cod-chip" style="margin-right:6px;font-size:0.75em;vertical-align:middle">${escapeHtml(it.cod)}</span>${escapeHtml(it.nom)}</div>
          <div class="it-precio-u">Precio unit.
            <input type="text" inputmode="numeric"
                   value="${escapeHtml(formatearMiles(it.precio))}" data-precio aria-label="Precio unitario" />
          </div>
        </div>
        <div class="it-der">
          <div class="it-importe" data-importe>${importe}</div>
          <button class="it-borrar" type="button" data-borrar="${escapeHtml(it.id)}" aria-label="Quitar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');
    actualizarTotales();
  }

  function actualizarTotales() {
    // Actualiza cada importe sin re-renderizar (para no perder foco en los inputs)
    $$('#listaItems [data-item]').forEach((fila) => {
      const it = estado.items.find((x) => String(x.id) === fila.getAttribute('data-item'));
      if (!it) return;
      const linea = calcularLinea(it.cantidad, it.precio);
      $('[data-importe]', fila).textContent = linea.ok ? formatearPesos(linea.importe) : '—';
    });
    const resumen = $('#resumen');
    const r = calcularPresupuesto(estado.items);
    if (!r.ok) {
      if (estado.items.length > 0) {
        resumen.hidden = false;
        $('#subtotalNum').textContent = '—';
        $('#descNum').textContent = '- $ 0';
        $('#totalNum').textContent = '—';
      } else { resumen.hidden = true; }
      return;
    }
    const d = calcularDescuento(r.total, estado.descModo, parseNumero(estado.descValor));
    resumen.hidden = false;
    $('#subtotalNum').textContent = formatearPesos(r.total);
    $('#descNum').textContent = '- ' + formatearPesos(d.descuento);
    $('#totalNum').textContent = formatearPesos(d.total);
  }

  // Subtotal, descuento y total actuales del presupuesto (para WhatsApp e impresión).
  function calcularResumen() {
    const r = calcularPresupuesto(estado.items);
    if (!r.ok) return { ok: false };
    const d = calcularDescuento(r.total, estado.descModo, parseNumero(estado.descValor));
    return { ok: true, subtotal: r.total, descuento: d.descuento, total: d.total };
  }

  // Texto legible del descuento aplicado, ej: "Descuento (15%)" o "Descuento".
  function etiquetaDescuento() {
    const v = parseNumero(estado.descValor);
    if (!Number.isFinite(v) || v <= 0) return 'Descuento';
    return estado.descModo === 'monto' ? 'Descuento' : `Descuento (${formatearMiles(Math.min(v, 100))}%)`;
  }

  function vaciarPresu() {
    if (estado.items.length === 0 && !estado.cliente) return;
    if (!confirm('¿Vaciar el presupuesto y empezar de cero?')) return;
    estado.items = [];
    estado.cliente = ''; estado.domicilio = '';
    estado.descValor = ''; estado.descModo = 'pct';
    $('#inpCliente').value = ''; $('#inpDomicilio').value = '';
    $('#descValor').value = ''; $('#descModo').value = 'pct';
    renderItems();
    guardarPresu();
    toast('Presupuesto vaciado');
  }

  // -------- Fecha helpers --------
  function fechaHoyISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function fechaLinda(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }

  // -------- WhatsApp --------
  function enviarWhatsApp() {
    const r = calcularPresupuesto(estado.items);
    if (!r.ok) { toast('Agregá al menos un producto'); return; }
    const L = [];
    L.push('*ELECTRIC PANA* — Presupuesto');
    L.push('Fecha: ' + fechaLinda(fechaHoyISO()));
    if (estado.cliente) L.push('Cliente: ' + estado.cliente);
    if (estado.domicilio) L.push('Localidad: ' + estado.domicilio);
    L.push('');
    estado.items.forEach((it) => {
      const linea = calcularLinea(it.cantidad, it.precio);
      const nomCat = it.cat ? `${it.nom} (${it.cat})` : it.nom;
      L.push(`${formatearMiles(it.cantidad)} x ${nomCat} = ${linea.ok ? formatearPesos(linea.importe) : '—'}`);
    });
    L.push('');
    const res = calcularResumen();
    if (res.ok && res.descuento > 0) {
      L.push('Subtotal: ' + formatearPesos(res.subtotal));
      L.push(etiquetaDescuento() + ': -' + formatearPesos(res.descuento));
    }
    L.push('*TOTAL: ' + formatearPesos(res.ok ? res.total : r.total) + '*');
    const url = 'https://wa.me/?text=' + encodeURIComponent(L.join('\n'));
    window.open(url, '_blank');
  }

  const K_NUM_PRESU = 'ep_num_presu';
  function siguienteNumeroPresu() {
    const n = (parseInt(localStorage.getItem(K_NUM_PRESU) || '0', 10) || 0) + 1;
    localStorage.setItem(K_NUM_PRESU, String(n));
    return n;
  }

  // Genera los bytes del PDF del presupuesto. Si se pasa `numero`, lo muestra
  // en el encabezado (solo al imprimir). Devuelve Uint8Array o null.
  function _pdfPresupuestoBytes(numero) {
    const r = calcularPresupuesto(estado.items);
    if (!r.ok) return null;
    const res = calcularResumen();
    const itemsPdf = estado.items.map((it) => {
      const linea = calcularLinea(it.cantidad, it.precio);
      return { cod: it.cod, nom: it.nom, cat: it.cat, precio: it.precio, cantidad: it.cantidad, importe: linea.ok ? linea.importe : 0 };
    });
    return construirPdfPresupuesto({
      cliente: estado.cliente, domicilio: estado.domicilio, fecha: fechaLinda(fechaHoyISO()),
      items: itemsPdf, subtotal: res.ok ? res.subtotal : r.total, descuento: res.ok ? res.descuento : 0,
      total: res.ok ? res.total : r.total, etiquetaDescuento: etiquetaDescuento(),
      numero,
    });
  }

  async function enviarPresupuestoPdfWhatsApp() {
    if (estado.items.length === 0) { toast('Agregá al menos un producto'); return; }
    if (typeof construirPdfPresupuesto !== 'function') { toast('No se pudo generar el PDF'); return; }
    const bytes = _pdfPresupuestoBytes();
    if (!bytes) { toast('Agregá al menos un producto'); return; }
    const nombre = `presupuesto-electric-pana-${fechaHoyISO()}.pdf`;
    const archivo = new File([bytes], nombre, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Presupuesto - Electric Pana' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('PDF descargado: adjuntalo en el chat de WhatsApp');
  }

  // -------- Imprimir / PDF --------
  // Abre el PDF que generamos nosotros mismos en una pestaña nueva: al ser un
  // PDF real (no la página web impresa con window.print()), el navegador
  // nunca le agrega el encabezado/pie con el título y la URL del sitio.
  function _abrirPdfEnPestana(bytes) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  function imprimir() {
    const r = calcularPresupuesto(estado.items);
    if (!r.ok) { toast('Agregá al menos un producto'); return; }
    const numero = siguienteNumeroPresu();
    const bytes = _pdfPresupuestoBytes(numero);
    _abrirPdfEnPestana(bytes);
    toast('Presupuesto N\xba ' + String(numero).padStart(3, '0'));
  }

  // ==================================================================
  //  VISTA LISTA DE PRECIOS (catálogo)
  // ==================================================================
  function initCatalogo() {
    const buscador = $('#buscaCatalogo');
    let t = null;
    buscador.addEventListener('input', () => { clearTimeout(t); t = setTimeout(renderCatalogo, 120); });

    // Delegación: editar precio, editar nombre, borrar
    const lista = $('#listaCatalogo');
    lista.addEventListener('change', (e) => {
      const fila = e.target.closest('[data-prod]');
      if (!fila || !e.target.matches('[data-precio-edit]')) return;
      const p = estado.catalogo.find((x) => String(x.id) === fila.getAttribute('data-prod'));
      if (!p) return;
      const v = parseNumero(e.target.value);
      if (!Number.isFinite(v) || v < 0) { e.target.value = formatearMiles(p.precio); toast('Precio no válido'); return; }
      p.precio = v;
      e.target.value = formatearMiles(v);
      guardarCatalogo();
      sincronizarProducto(p);
      toast('Precio actualizado');
    });
    lista.addEventListener('click', (e) => {
      const fila = e.target.closest('[data-prod]');
      if (!fila) return;
      const p = estado.catalogo.find((x) => String(x.id) === fila.getAttribute('data-prod'));
      if (!p) return;
      if (e.target.closest('[data-editar]')) modalProducto(p);
      if (e.target.closest('[data-eliminar]')) {
        if (confirm(`¿Borrar "${p.nom}" de la lista?`)) {
          estado.catalogo = estado.catalogo.filter((x) => x.id !== p.id);
          guardarCatalogo();
          sincronizarBorrado(p.id);
          renderCatalogo();
          toast('Producto borrado');
        }
      }
    });

    $('#btnNuevo').addEventListener('click', () => modalProducto(null));
    $('#btnListaImprimir').addEventListener('click', imprimirLista);
    $('#btnListaExcel').addEventListener('click', descargarExcel);
    $('#btnListaPdfWpp').addEventListener('click', enviarListaPdfWhatsApp);
    $('#btnAumento').addEventListener('click', modalAumento);
    $('#btnAumentoUSD').addEventListener('click', modalAumentoUSD);
    $('#btnBackup').addEventListener('click', guardarBackupNube);
    $('#btnRestore').addEventListener('click', toggleListaCopias);
    $('#listaCopias').addEventListener('click', (e) => {
      const btnRestaurar = e.target.closest('[data-restaurar]');
      if (btnRestaurar) restaurarDesdeCopia(btnRestaurar.getAttribute('data-restaurar'));
      const btnBorrar = e.target.closest('[data-borrar-copia]');
      if (btnBorrar) borrarCopia(btnBorrar.getAttribute('data-borrar-copia'));
    });
    $('#btnVerCambios').addEventListener('click', toggleComparacion);
    $('#btnEnviarCambios').addEventListener('click', enviarCambiosPdfWhatsApp);
  }

  // Porcentaje con decimales cuando hace falta (0,65% en vez de redondear a
  // 0% o 1%), sin decimales de sobra (15% no muestra "15,00%").
  function _formatearPct(n) {
    let s = (Math.round(Math.abs(n) * 100) / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
  }

  function _chipCambio(id) {
    if (!modoComparacion) return '';
    const c = modoComparacion.get(String(id));
    if (!c) return '';
    if (c.tipo === 'nuevo') return ' <span class="cambio-chip nuevo">NUEVO</span>';
    const txt = (c.tipo === 'sube' ? '+' : '-') + _formatearPct(c.pct) + '%';
    return ` <span class="cambio-chip ${c.tipo}">${escapeHtml(txt)}</span>`;
  }

  function renderCatalogo() {
    const q = $('#buscaCatalogo').value.trim();
    const lista = $('#listaCatalogo');
    let items = q ? buscarProductos(estado.catalogo, q, 400) : estado.catalogo;

    $('#contadorCatalogo').textContent = q
      ? `${items.length} resultado(s)`
      : `${estado.catalogo.length} productos en total`;

    if (items.length === 0) {
      lista.innerHTML = '';
      $('#catalogoVacio').hidden = false;
      return;
    }
    $('#catalogoVacio').hidden = true;

    // Agrupar por categoría y ordenar por código dentro de cada una
    const grupos = new Map();
    for (const p of items) {
      if (!grupos.has(p.cat)) grupos.set(p.cat, []);
      grupos.get(p.cat).push(p);
    }
    for (const prods of grupos.values()) prods.sort((a, b) => Number(a.cod) - Number(b.cod));
    const cats = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es'));
    let html = '';
    for (const cat of cats) {
      const prods = grupos.get(cat);
      html += `<div class="cat-grupo"><div class="cat-titulo">${escapeHtml(cat)}</div>`;
      for (const p of prods) {
        html += `
        <div class="fila" data-prod="${escapeHtml(p.id)}">
          <span class="cod-chip f-cod">${escapeHtml(p.cod)}</span>
          <div class="f-nom">${escapeHtml(p.nom)}${p.importado ? ' <span class="usd-chip" title="Importado / depende del dólar">USD</span>' : ''}${p.iva ? ' <span class="iva-chip" title="Tiene IVA 10,5%">IVA 10,5%</span>' : ''}${_chipCambio(p.id)}</div>
          <div class="f-precio">
            <input type="text" inputmode="numeric"
                   value="${escapeHtml(formatearMiles(p.precio))}" data-precio-edit aria-label="Precio de ${escapeHtml(p.nom)}" />
          </div>
          <div class="f-acc">
            <button class="icono-btn" type="button" data-editar aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            </button>
            <button class="icono-btn peligro" type="button" data-eliminar aria-label="Borrar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </div>`;
      }
      html += '</div>';
    }
    lista.innerHTML = html;
  }

  // -------- Compartir / imprimir la LISTA DE PRECIOS --------
  // Devuelve los productos actualmente visibles (según el buscador de la lista).
  function productosVisibles() {
    const q = $('#buscaCatalogo').value.trim();
    return q ? buscarProductos(estado.catalogo, q, 5000) : estado.catalogo;
  }
  function agruparPorCat(items) {
    const grupos = new Map();
    for (const p of items) {
      if (!grupos.has(p.cat)) grupos.set(p.cat, []);
      grupos.get(p.cat).push(p);
    }
    for (const prods of grupos.values()) prods.sort((a, b) => Number(a.cod) - Number(b.cod));
    return new Map([...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, 'es')));
  }

  function imprimirLista() {
    const items = productosVisibles();
    if (items.length === 0) { toast('No hay productos para imprimir'); return; }
    const q = $('#buscaCatalogo').value.trim();
    _abrirPdfEnPestana(_pdfListaBytes(items, q));
  }

  const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function _xlsxListaBytes(items) {
    const grupos = agruparPorCat(items);
    const filas = [{ cells: ['Código', 'Producto', 'Precio'], negrita: true }];
    for (const [cat, prods] of grupos) {
      filas.push({ cells: [cat, '', ''], negrita: true });
      prods.forEach((p) => filas.push([String(p.cod), p.nom, Number(p.precio)]));
    }
    return construirXlsxBytes(filas, 'Lista de precios');
  }

  function _nombreArchivoLista(q, ext) {
    return `electric-pana-lista${q ? '-' + q.replace(/\s+/g, '_') : ''}-${fechaHoyISO()}.${ext}`;
  }

  function descargarExcel() {
    const items = productosVisibles();
    if (items.length === 0) { toast('No hay productos para exportar'); return; }
    if (typeof construirXlsxBytes !== 'function') { toast('No se pudo generar el Excel'); return; }
    const q = $('#buscaCatalogo').value.trim();
    const bytes = _xlsxListaBytes(items);
    const blob = new Blob([bytes], { type: TIPO_XLSX });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = _nombreArchivoLista(q, 'xlsx');
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Excel descargado');
  }

  function _pdfListaBytes(items, q) {
    return construirPdfListaPrecios({ items, filtro: q, fecha: fechaLinda(fechaHoyISO()), cambios: modoComparacion || undefined });
  }

  async function enviarListaPdfWhatsApp() {
    const items = productosVisibles();
    if (items.length === 0) { toast('No hay productos para enviar'); return; }
    if (typeof construirPdfListaPrecios !== 'function') { toast('No se pudo generar el PDF'); return; }
    const q = $('#buscaCatalogo').value.trim();
    const nombre = _nombreArchivoLista(q, 'pdf');
    const bytes = _pdfListaBytes(items, q);
    const archivo = new File([bytes], nombre, { type: 'application/pdf' });

    // Móvil con menú nativo de compartir: manda el PDF directo a WhatsApp (u otra app).
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Lista de precios - Electric Pana' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // el usuario canceló el compartir
        // si falla por otro motivo, sigue al fallback de descarga
      }
    }
    // Sin ese menú (por ej. en la compu): descarga el PDF para adjuntarlo a mano en WhatsApp.
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('PDF descargado: adjuntalo en el chat de WhatsApp');
  }

  async function enviarCambiosPdfWhatsApp() {
    if (!modoComparacion || modoComparacion.size === 0) { toast('No hay cambios para enviar'); return; }
    const items = estado.catalogo.filter((p) => modoComparacion.has(String(p.id)));
    if (items.length === 0) { toast('No hay cambios para enviar'); return; }
    const nombre = `electric-pana-cambios-${fechaHoyISO()}.pdf`;
    const bytes = construirPdfListaPrecios({ items, filtro: 'Cambios de precio', fecha: fechaLinda(fechaHoyISO()), cambios: modoComparacion });
    const archivo = new File([bytes], nombre, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Cambios de precio - Electric Pana' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('PDF descargado: adjuntalo en el chat de WhatsApp');
  }

  // -------- Modal genérico --------
  function abrirModal(html) {
    const zona = $('#zonaModal');
    zona.innerHTML = `<div class="modal-fondo" data-cerrar>${html}</div>`;
    zona.querySelector('.modal-fondo').addEventListener('click', (e) => {
      if (e.target.matches('[data-cerrar]') || e.target.closest('[data-cancelar]')) cerrarModal();
    });
  }
  function cerrarModal() { $('#zonaModal').innerHTML = ''; }

  function modalProducto(p) {
    const esNuevo = !p;
    abrirModal(`
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${esNuevo ? 'Nuevo producto' : 'Editar producto'}</h3>
        <label class="campo"><span class="txt">Código</span>
          <input id="mCod" type="text" value="${escapeHtml(esNuevo ? '' : p.cod)}" placeholder="Ej: 5600" /></label>
        <label class="campo"><span class="txt">Nombre</span>
          <input id="mNom" type="text" value="${escapeHtml(esNuevo ? '' : p.nom)}" placeholder="Nombre del producto" /></label>
        <div class="grid-2">
          <label class="campo"><span class="txt">Precio</span>
            <input id="mPrecio" type="text" inputmode="numeric" value="${escapeHtml(esNuevo ? '' : formatearMiles(p.precio))}" /></label>
          <label class="campo"><span class="txt">Categoría</span>
            <input id="mCat" type="text" list="listaCats" value="${escapeHtml(esNuevo ? '' : p.cat)}" placeholder="Ej: CABLES" /></label>
        </div>
        <datalist id="listaCats">${[...new Set(estado.catalogo.map((x) => x.cat))].map((c) => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
        <label class="campo" style="display:flex; align-items:center; gap:8px; flex-direction:row">
          <input id="mImportado" type="checkbox" style="width:auto" ${!esNuevo && p.importado ? 'checked' : ''} />
          <span class="txt" style="margin:0">Importado / depende del dólar (solo lo ves vos, no sale en lo que se manda a clientes)</span>
        </label>
        <label class="campo" style="display:flex; align-items:center; gap:8px; flex-direction:row">
          <input id="mIva" type="checkbox" style="width:auto" ${!esNuevo && p.iva ? 'checked' : ''} />
          <span class="txt" style="margin:0">IVA 10,5% (solo lo ves vos, no sale en lo que se manda a clientes)</span>
        </label>
        <div class="acciones">
          <button class="btn btn-linea" type="button" data-cancelar>Cancelar</button>
          <button class="btn btn-primario" type="button" id="mGuardar">Guardar</button>
        </div>
      </div>`);
    $('#mGuardar').addEventListener('click', () => {
      const cod = $('#mCod').value.trim();
      const nom = $('#mNom').value.trim();
      const precio = parseNumero($('#mPrecio').value);
      const cat = $('#mCat').value.trim() || 'SIN CATEGORÍA';
      const importado = $('#mImportado').checked;
      const iva = $('#mIva').checked;
      if (!nom) { toast('Poné un nombre'); return; }
      if (!Number.isFinite(precio) || precio < 0) { toast('Precio no válido'); return; }
      let productoGuardado;
      if (esNuevo) {
        productoGuardado = { id: 'n' + Date.now(), cod: cod || '—', nom, precio, cat, importado, iva };
        estado.catalogo.push(productoGuardado);
      } else {
        Object.assign(p, { cod: cod || '—', nom, precio, cat, importado, iva });
        productoGuardado = p;
      }
      guardarCatalogo();
      sincronizarProducto(productoGuardado);
      cerrarModal();
      renderCatalogo();
      toast(esNuevo ? 'Producto agregado' : 'Producto actualizado');
    });
    setTimeout(() => $('#mNom') && $('#mNom').focus(), 50);
  }

  function modalAumentoUSD() {
    const usdProds = estado.catalogo.filter((x) => x.importado);
    if (usdProds.length === 0) { toast('No hay productos marcados como USD'); return; }
    abrirModal(`
      <div class="modal" role="dialog" aria-modal="true">
        <h3>Aumentar precios USD</h3>
        <p class="hint" style="margin-bottom:12px">Suma un % solo a los <strong>${usdProds.length}</strong> productos marcados como USD. Para bajar, poné número negativo.</p>
        <label class="campo"><span class="txt">Porcentaje (%)</span>
          <input id="aPct" type="number" step="0.1" placeholder="Ej: 15" /></label>
        <div class="acciones">
          <button class="btn btn-linea" type="button" data-cancelar>Cancelar</button>
          <button class="btn btn-acento" type="button" id="aAplicar">Aplicar</button>
        </div>
      </div>`);
    $('#aAplicar').addEventListener('click', () => {
      const pct = Number($('#aPct').value);
      const prueba = aplicarAumento(1000, pct);
      if (!prueba.ok) { toast(prueba.motivo); return; }
      if (!confirm(`¿Aplicar ${pct > 0 ? '+' : ''}${pct}% a los ${usdProds.length} productos USD?`)) return;
      usdProds.forEach((p) => { const r = aplicarAumento(p.precio, pct); if (r.ok) p.precio = r.nuevo; });
      guardarCatalogo();
      sincronizarLote(usdProds);
      cerrarModal();
      renderCatalogo();
      toast(`Precios USD actualizados (${usdProds.length})`);
    });
  }

  function modalAumento() {
    const cats = [...new Set(estado.catalogo.map((x) => x.cat))].sort();
    abrirModal(`
      <div class="modal" role="dialog" aria-modal="true">
        <h3>Aumentar precios</h3>
        <p class="hint" style="margin-bottom:12px">Suma un porcentaje a todos los productos elegidos. Para descuento, poné un número negativo.</p>
        <label class="campo"><span class="txt">Porcentaje (%)</span>
          <input id="aPct" type="number" step="0.1" placeholder="Ej: 15" /></label>
        <label class="campo"><span class="txt">Aplicar a</span>
          <select id="aCat">
            <option value="__todos">Todos los productos</option>
            ${cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select></label>
        <div class="acciones">
          <button class="btn btn-linea" type="button" data-cancelar>Cancelar</button>
          <button class="btn btn-acento" type="button" id="aAplicar">Aplicar</button>
        </div>
      </div>`);
    $('#aAplicar').addEventListener('click', () => {
      const pct = Number($('#aPct').value);
      const cat = $('#aCat').value;
      const prueba = aplicarAumento(1000, pct);
      if (!prueba.ok) { toast(prueba.motivo); return; }
      const objetivo = cat === '__todos' ? estado.catalogo : estado.catalogo.filter((x) => x.cat === cat);
      const cuantos = objetivo.length;
      const txt = cat === '__todos' ? 'TODOS los productos' : `la categoría "${cat}"`;
      if (!confirm(`¿Aplicar ${pct > 0 ? '+' : ''}${pct}% a ${txt} (${cuantos} productos)?`)) return;
      objetivo.forEach((p) => { const r = aplicarAumento(p.precio, pct); if (r.ok) p.precio = r.nuevo; });
      guardarCatalogo();
      sincronizarLote(objetivo);
      cerrarModal();
      renderCatalogo();
      toast(`Precios actualizados (${cuantos})`);
    });
  }

  // -------- Comparación de precios --------
  function toggleComparacion() {
    if (modoComparacion !== null) {
      modoComparacion = null;
      $('#btnVerCambios').classList.remove('activo');
      $('#btnEnviarCambios').hidden = true;
      renderCatalogo();
      toast('Comparación desactivada');
      return;
    }
    cargarListaParaComparacion();
  }

  async function cargarListaParaComparacion() {
    const btn = $('#btnVerCambios');
    btn.disabled = true;
    try {
      const copias = await window.SupabaseSync.listarBackupsRemotos();
      if (!copias || copias.length === 0) {
        toast('No hay copias guardadas. Guardá una copia primero.');
        return;
      }
      abrirModal(`
        <div class="modal" role="dialog" aria-modal="true">
          <h3>¿Con qué copia comparar?</h3>
          <p class="hint" style="margin-bottom:12px">Vas a ver en verde los productos que subieron de precio y en rojo los que bajaron.</p>
          ${copias.map((c) => `
            <div class="copia-fila">
              <div class="copia-info">
                ${_etiquetaCopia(c)}
                <span class="copia-cnt">${Number(c.cantidad_productos).toLocaleString('es')} productos</span>
              </div>
              <button class="btn btn-primario btn-chico" type="button" data-comparar="${escapeHtml(String(c.id))}">Comparar</button>
            </div>`).join('')}
          <div class="acciones" style="margin-top:12px">
            <button class="btn btn-linea" type="button" data-cancelar>Cancelar</button>
          </div>
        </div>`);
      $('#zonaModal').addEventListener('click', (e) => {
        const b = e.target.closest('[data-comparar]');
        if (b) { cerrarModal(); activarComparacion(b.getAttribute('data-comparar')); }
      });
    } catch (e) {
      toast('Sin conexión — no se pueden cargar las copias');
    } finally {
      btn.disabled = false;
    }
  }

  async function activarComparacion(backupId) {
    const btn = $('#btnVerCambios');
    btn.disabled = true;
    try {
      const copia = await window.SupabaseSync.obtenerBackupRemoto(Number(backupId));
      if (!copia || !Array.isArray(copia.datos)) throw new Error('formato');
      const mapaBackup = new Map();
      for (const p of copia.datos) mapaBackup.set(String(p.id), Number(p.precio) || 0);
      const mapa = new Map();
      for (const p of estado.catalogo) {
        const idStr = String(p.id);
        const precioAntes = mapaBackup.get(idStr);
        if (precioAntes === undefined) {
          mapa.set(idStr, { tipo: 'nuevo', pct: 0 });
        } else {
          const precioAhora = Number(p.precio) || 0;
          if (precioAntes === 0 || precioAhora === precioAntes) continue;
          const diff = ((precioAhora - precioAntes) / precioAntes) * 100;
          mapa.set(idStr, { tipo: diff > 0 ? 'sube' : 'baja', pct: Math.abs(diff) });
        }
      }
      modoComparacion = mapa;
      btn.classList.add('activo');
      $('#btnEnviarCambios').hidden = mapa.size === 0;
      renderCatalogo();
      const nCambios = [...mapa.values()].filter((x) => x.tipo !== 'nuevo').length;
      const nNuevos = [...mapa.values()].filter((x) => x.tipo === 'nuevo').length;
      const res = [nCambios && `${nCambios} con cambio de precio`, nNuevos && `${nNuevos} nuevo(s)`].filter(Boolean).join(', ');
      toast('Comparando: ' + (res || 'sin diferencias'));
    } catch (e) {
      toast('No se pudo cargar la copia para comparar');
    } finally {
      btn.disabled = false;
    }
  }

  // -------- Backup / Restore (nube) --------
  function fechaHoraLinda(iso) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // La copia automática corre los domingos (ver cron en Supabase): la
  // "semana" que resume es la que termina ese domingo, o sea del lunes
  // anterior al domingo en que se guardó.
  function _rangoSemana(iso) {
    const fin = new Date(iso);
    const inicio = new Date(fin);
    inicio.setDate(fin.getDate() - 6);
    const dia = (d) => String(d.getDate()).padStart(2, '0');
    const mes = (d) => d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
    if (inicio.getMonth() === fin.getMonth()) return `Semana del ${dia(inicio)} al ${dia(fin)} de ${mes(fin)}`;
    return `Semana del ${dia(inicio)} ${mes(inicio)} al ${dia(fin)} ${mes(fin)}`;
  }

  // Fila de fecha para una copia: rango de semana si es automática (cron
  // semanal), fecha y hora exacta si es manual.
  function _etiquetaCopia(c) {
    if (c.tipo === 'automatico') {
      return `<span class="copia-fecha">${escapeHtml(_rangoSemana(c.created_at))}</span>
        <span class="copia-tipo copia-tipo-auto">Automática</span>`;
    }
    return `<span class="copia-fecha">${escapeHtml(fechaHoraLinda(c.created_at))}</span>`;
  }

  async function guardarBackupNube() {
    const btn = $('#btnBackup');
    btn.disabled = true;
    try {
      await window.SupabaseSync.guardarBackupRemoto(estado.catalogo);
      toast('Copia guardada en la nube ✓');
    } catch (e) {
      toast('No se pudo guardar — sin conexión');
    } finally {
      btn.disabled = false;
    }
  }

  async function toggleListaCopias() {
    const panel = $('#panelCopias');
    const estabaOculto = panel.hidden;
    panel.hidden = !estabaOculto;
    if (estabaOculto) await cargarListaCopias();
  }

  async function cargarListaCopias() {
    const cont = $('#listaCopias');
    cont.innerHTML = '<p class="hint" style="padding:10px 0">Cargando copias...</p>';
    try {
      const copias = await window.SupabaseSync.listarBackupsRemotos();
      if (!copias || copias.length === 0) {
        cont.innerHTML = '<p class="hint" style="padding:10px 0">No hay copias guardadas todavía.</p>';
        return;
      }
      cont.innerHTML = copias.map((c) => `
        <div class="copia-fila">
          <div class="copia-info">
            ${_etiquetaCopia(c)}
            <span class="copia-cnt">${Number(c.cantidad_productos).toLocaleString('es')} productos</span>
          </div>
          <div class="copia-acc">
            <button class="btn btn-linea btn-chico" type="button" data-restaurar="${escapeHtml(String(c.id))}">Restaurar</button>
            <button class="icono-btn peligro" type="button" data-borrar-copia="${escapeHtml(String(c.id))}" aria-label="Borrar copia">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </div>`).join('');
    } catch (e) {
      cont.innerHTML = '<p class="hint" style="padding:10px 0">Sin conexión — no se pueden cargar las copias.</p>';
    }
  }

  async function borrarCopia(id) {
    if (!confirm('¿Borrar esta copia de seguridad? No se puede deshacer.')) return;
    const btn = document.querySelector(`[data-borrar-copia="${id}"]`);
    if (btn) btn.disabled = true;
    try {
      await window.SupabaseSync.eliminarBackupRemoto(Number(id));
      toast('Copia borrada');
      await cargarListaCopias();
    } catch (e) {
      toast('No se pudo borrar la copia');
      if (btn) btn.disabled = false;
    }
  }

  async function restaurarDesdeCopia(id) {
    const btn = document.querySelector(`[data-restaurar="${id}"]`);
    if (btn) btn.disabled = true;
    try {
      const copia = await window.SupabaseSync.obtenerBackupRemoto(Number(id));
      if (!copia || !Array.isArray(copia.datos)) throw new Error('formato');
      if (!confirm(`Reemplaza la lista actual por la copia del ${fechaHoraLinda(copia.created_at)} (${Number(copia.cantidad_productos).toLocaleString('es')} productos). ¿Seguir?`)) {
        if (btn) btn.disabled = false;
        return;
      }
      estado.catalogo = copia.datos.map((p) => ({ ...p }));
      guardarCatalogo();
      sincronizarLote(estado.catalogo);
      renderCatalogo();
      $('#panelCopias').hidden = true;
      toast('Lista restaurada ✓');
    } catch (e) {
      toast('No se pudo restaurar la copia');
      if (btn) btn.disabled = false;
    }
  }

  // -------- Sincronización con la nube (Supabase) --------
  // Solo la lista de precios se sincroniza entre dispositivos. Si no hay
  // internet, esto falla en silencio y la app sigue con la copia local.
  function listaDePreciosVisible() {
    const tab = $('#tabCatalogo');
    return tab && tab.getAttribute('aria-selected') === 'true';
  }

  function manejarCambioRemoto(payload) {
    const tipo = payload.eventType;
    const fila = payload.new || payload.old;
    if (!fila || !fila.id) return;
    if (tipo === 'DELETE') {
      estado.catalogo = estado.catalogo.filter((x) => String(x.id) !== String(fila.id));
    } else {
      const p = { id: fila.id, cod: fila.cod, nom: fila.nom, precio: fila.precio, cat: fila.cat, importado: fila.importado, iva: !!fila.iva };
      const idx = estado.catalogo.findIndex((x) => String(x.id) === String(p.id));
      if (idx >= 0) estado.catalogo[idx] = p; else estado.catalogo.push(p);
    }
    guardarCatalogo();
    if (listaDePreciosVisible()) { renderCatalogo(); toast('Lista actualizada (cambio desde otro dispositivo)'); }
  }

  async function iniciarSyncNube() {
    if (!window.SupabaseSync) return;
    try {
      const remoto = await window.SupabaseSync.cargarCatalogoRemoto();
      if (remoto.length > 0) {
        estado.catalogo = remoto;
        guardarCatalogo();
        if (listaDePreciosVisible()) renderCatalogo();
      }
    } catch (e) { /* sin internet: seguimos con la copia local */ }
    window.SupabaseSync.suscribirCambios(manejarCambioRemoto);
  }

  // ==================================================================
  //  ARRANQUE
  // ==================================================================
  function init() {
    estado.catalogo = cargarCatalogo();
    cargarPresu();
    initTema();
    initTabs();
    initPresu();
    initCatalogo();

    // Restaurar datos del presupuesto en pantalla
    $('#inpCliente').value = estado.cliente;
    $('#inpDomicilio').value = estado.domicilio;
    $('#descModo').value = estado.descModo;
    $('#descValor').value = formatearMiles(parseNumero(estado.descValor));
    renderItems();

    iniciarSyncNube();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
