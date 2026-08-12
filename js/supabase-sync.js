// supabase-sync.js — Sincroniza la lista de precios con Supabase para que
// se vea igual en cualquier dispositivo (compu, celu). Solo la LISTA DE
// PRECIOS se sincroniza; los presupuestos en curso siguen siendo locales
// a cada dispositivo (no hace falta compartirlos entre compu y celu).
//
// Requiere el cliente de Supabase cargado antes (CDN, ver index.html).
// Si no hay internet, todas las funciones fallan silenciosamente / lanzan
// error y app.js sigue funcionando con la copia en localStorage.

(function () {
  'use strict';

  const URL_PROYECTO = 'https://mnypuogxgozyysptmcvw.supabase.co';
  const CLAVE_PUBLICA = 'sb_publishable_F7MUjt4jrMY04cwjzgEtfw_gU37p7JP';

  let cliente = null;
  function obtenerCliente() {
    if (!cliente && window.supabase && typeof window.supabase.createClient === 'function') {
      cliente = window.supabase.createClient(URL_PROYECTO, CLAVE_PUBLICA);
    }
    return cliente;
  }

  function _aFila(p) {
    return {
      id: String(p.id), cod: String(p.cod), nom: p.nom, precio: Math.round(Number(p.precio) || 0),
      cat: p.cat || 'SIN CATEGORÍA', importado: !!p.importado, iva: !!p.iva, actualizado_en: new Date().toISOString(),
    };
  }

  // El proyecto de Supabase limita cada consulta a 1000 filas (config del
  // servidor, no algo que se pueda pedir distinto desde el cliente), así
  // que paginamos hasta traer el catálogo completo.
  async function cargarCatalogoRemoto() {
    const sb = obtenerCliente();
    if (!sb) throw new Error('Cliente de Supabase no disponible');
    const TAMANO_PAGINA = 1000;
    let desde = 0;
    let todas = [];
    for (;;) {
      const { data, error } = await sb
        .from('productos')
        .select('id, cod, nom, precio, cat, importado, iva')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas = todas.concat(data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas.map((p) => ({ id: p.id, cod: p.cod, nom: p.nom, precio: p.precio, cat: p.cat, importado: p.importado, iva: !!p.iva }));
  }

  async function guardarProductoRemoto(p) {
    const sb = obtenerCliente();
    if (!sb) throw new Error('Cliente de Supabase no disponible');
    const { error } = await sb.from('productos').upsert(_aFila(p));
    if (error) throw error;
  }

  async function guardarProductosRemoto(lista) {
    const sb = obtenerCliente();
    if (!sb || lista.length === 0) return;
    const { error } = await sb.from('productos').upsert(lista.map(_aFila));
    if (error) throw error;
  }

  async function eliminarProductoRemoto(id) {
    const sb = obtenerCliente();
    if (!sb) throw new Error('Cliente de Supabase no disponible');
    const { error } = await sb.from('productos').delete().eq('id', String(id));
    if (error) throw error;
  }

  // onCambio recibe el payload crudo de Supabase Realtime: { eventType, new, old }
  function suscribirCambios(onCambio) {
    const sb = obtenerCliente();
    if (!sb) return null;
    return sb
      .channel('productos-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, onCambio)
      .subscribe();
  }

  // La copia manual (botón "Guardar copia en la nube") y la automática (cron
  // semanal, ver migración `backup_automatico_semanal`) rotan por separado:
  // así un dueño que guarda copias seguido no le come lugar a la que corre
  // sola todos los domingos, ni al revés.
  async function guardarBackupRemoto(catalogo) {
    const sb = obtenerCliente();
    if (!sb) throw new Error('Cliente de Supabase no disponible');
    const { error } = await sb.from('backups').insert({
      cantidad_productos: catalogo.length,
      datos: catalogo,
      tipo: 'manual',
    });
    if (error) throw error;
    // Mantener solo las últimas 15 copias manuales
    const { data: todas } = await sb.from('backups').select('id').eq('tipo', 'manual').order('created_at', { ascending: false });
    if (todas && todas.length > 15) {
      const viejas = todas.slice(15).map((r) => r.id);
      await sb.from('backups').delete().in('id', viejas);
    }
  }

  async function listarBackupsRemotos() {
    const sb = obtenerCliente();
    if (!sb) throw new Error('Cliente de Supabase no disponible');
    const { data, error } = await sb
      .from('backups')
      .select('id, created_at, cantidad_productos, tipo')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return data;
  }

  async function obtenerBackupRemoto(id) {
    const sb = obtenerCliente();
    if (!sb) throw new Error('Cliente de Supabase no disponible');
    const { data, error } = await sb.from('backups').select('datos, cantidad_productos, created_at, tipo').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async function eliminarBackupRemoto(id) {
    const sb = obtenerCliente();
    if (!sb) throw new Error('Cliente de Supabase no disponible');
    const { error } = await sb.from('backups').delete().eq('id', id);
    if (error) throw error;
  }

  window.SupabaseSync = {
    cargarCatalogoRemoto, guardarProductoRemoto, guardarProductosRemoto,
    eliminarProductoRemoto, suscribirCambios,
    guardarBackupRemoto, listarBackupsRemotos, obtenerBackupRemoto, eliminarBackupRemoto,
  };
})();
