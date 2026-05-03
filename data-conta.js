'use strict';
// =====================================================
// data-conta.js — Capa de datos centralizada
// Comparte claves de localStorage con panel(34).html
// Sin dependencias externas. Sin pérdida de datos.
// =====================================================
var ContaData = (function () {

  var KEYS = {
    movimientos:    'mc_local',
    gastos:         'gm_local',
    gastosSS:       'gastos',
    cuentas:        'cuentasMemoria',
    transferencias: 'transferenciasMem',
    cuotas:         'cuotas_obligaciones',
    categorias:     'contabilidad_categorias'
  };

  // ─── Utilidades ──────────────────────────────────
  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function _pad(n) { return String(n).padStart(2, '0'); }

  // Fecha local YYYY-MM-DD. Jamás usa UTC para evitar el desfase de +1 día.
  function fechaLocalYMD(d) {
    d = (d instanceof Date) ? d : (d ? new Date(d) : new Date());
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate());
  }

  // ISO con offset local (no sufre de drift UTC)
  function fechaLocalISO(d) {
    d = (d instanceof Date) ? d : new Date();
    var tz = -d.getTimezoneOffset();
    var sign = tz >= 0 ? '+' : '-';
    var abs = Math.abs(tz);
    return fechaLocalYMD(d) + 'T' +
      _pad(d.getHours()) + ':' + _pad(d.getMinutes()) + ':' + _pad(d.getSeconds()) +
      sign + _pad(Math.floor(abs / 60)) + ':' + _pad(abs % 60);
  }

  // Normaliza cualquier string de fecha a YYYY-MM-DD local sin drift
  function parseFechaLocal(f) {
    if (!f) return fechaLocalYMD();
    f = String(f).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;   // ya es YYYY-MM-DD puro
    try {
      var d = new Date(f);
      return isNaN(d.getTime()) ? fechaLocalYMD() : fechaLocalYMD(d);
    } catch (e) { return fechaLocalYMD(); }
  }

  // ─── Storage bajo nivel ───────────────────────────
  function _read(key, fallback) {
    try {
      var r = localStorage.getItem(key);
      if (r === null || r === undefined || r === '') return fallback;
      var p = JSON.parse(r);
      return (p !== null && p !== undefined) ? p : fallback;
    } catch (e) { return fallback; }
  }

  function _write(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[ContaData] write error key=' + key, e);
      return false;
    }
  }

  // ─── CUENTAS ──────────────────────────────────────
  function getCuentas() {
    var d = _read(KEYS.cuentas, null);
    if (Array.isArray(d) && d.length > 0) {
      return d.map(function (c) {
        return c.id ? c : Object.assign({ id: _uid() }, c);
      });
    }
    return [
      { id: _uid(), nombre: 'CUENTA BANCOLOMBIA', tipo: 'CUENTA CORRIENTE', color: 'teal',   saldo: 0 },
      { id: _uid(), nombre: 'Efectivo',            tipo: 'EFECTIVO',         color: 'orange', saldo: 0 }
    ];
  }

  function saveCuentas(data) {
    if (!Array.isArray(data)) return false;
    for (var i = 0; i < data.length; i++) {
      var c = data[i];
      if (!c || typeof c.nombre !== 'string' || !c.nombre.trim()) return false;
      if (typeof c.saldo !== 'number') c.saldo = Number(c.saldo) || 0;
      if (!c.id) c.id = _uid();
    }
    return _write(KEYS.cuentas, data);
  }

  // ─── TRANSFERENCIAS ───────────────────────────────
  function getTransferencias() {
    var d = _read(KEYS.transferencias, []);
    return Array.isArray(d) ? d : [];
  }

  function saveTransferencias(data) {
    return Array.isArray(data) ? _write(KEYS.transferencias, data) : false;
  }

  function addTransferencia(origen, destino, monto) {
    var list = getTransferencias();
    var entry = {
      id: _uid(),
      origen: origen, destino: destino,
      monto: Number(monto) || 0,
      fecha: fechaLocalYMD(),
      timestamp: Date.now()
    };
    list.push(entry);
    saveTransferencias(list);
    return entry;
  }

  // ─── MOVIMIENTOS CONTABLES (ingresos manuales) ────
  function getMovimientos() {
    var d = _read(KEYS.movimientos, []);
    return Array.isArray(d) ? d : [];
  }

  function saveMovimientos(data) {
    return Array.isArray(data) ? _write(KEYS.movimientos, data) : false;
  }

  function addMovimiento(tipo, monto, descripcion, cuentaNombre, cuentaIdx, categoria) {
    if (!tipo || !(Number(monto) > 0) || !descripcion) return null;
    var arr = getMovimientos();
    var entry = {
      id: _uid(),
      tipo: tipo,
      monto: Number(monto),
      descripcion: String(descripcion).trim(),
      cuenta: cuentaNombre || 'Efectivo',
      cuentaIdx: cuentaIdx !== undefined ? Number(cuentaIdx) : -1,
      categoria: categoria || (tipo === 'ingreso' ? 'Ingreso' : 'Gasto'),
      fecha: fechaLocalYMD(),
      timestamp: Date.now()
    };
    arr.push(entry);
    saveMovimientos(arr);
    return entry;
  }

  function deleteMovimiento(id) {
    var arr = getMovimientos();
    var idx = -1;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return false;
    arr.splice(idx, 1);
    return saveMovimientos(arr);
  }

  // ─── GASTOS MANUALES ──────────────────────────────
  function getGastos() {
    var d = _read(KEYS.gastos, null);
    if (!Array.isArray(d) || d.length === 0) {
      try {
        var ss = sessionStorage.getItem(KEYS.gastosSS);
        if (ss) d = JSON.parse(ss);
      } catch (e) {}
    }
    return Array.isArray(d) ? d : [];
  }

  function saveGastos(data) {
    if (!Array.isArray(data)) return false;
    var ok = _write(KEYS.gastos, data);
    try { sessionStorage.setItem(KEYS.gastosSS, JSON.stringify(data)); } catch (e) {}
    return ok;
  }

  function addGasto(descripcion, categoria, monto, cuentaNombre, cuentaIdx) {
    if (!descripcion || !(Number(monto) > 0)) return null;
    var arr = getGastos();
    var entry = {
      id: _uid(),
      descripcion: String(descripcion).trim(),
      categoria: categoria || 'Gasto',
      monto: Number(monto),
      cuenta: cuentaNombre || 'Efectivo',
      cuentaIdx: cuentaIdx !== undefined ? Number(cuentaIdx) : -1,
      fecha: fechaLocalYMD(),
      timestamp: Date.now()
    };
    arr.push(entry);
    saveGastos(arr);
    return entry;
  }

  function deleteGasto(id) {
    var arr = getGastos();
    var idx = -1;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return false;
    arr.splice(idx, 1);
    return saveGastos(arr);
  }

  // ─── CUOTAS ───────────────────────────────────────
  function getCuotas() {
    var d = _read(KEYS.cuotas, []);
    return Array.isArray(d) ? d : [];
  }

  function saveCuotas(data) {
    return _write(KEYS.cuotas, Array.isArray(data) ? data : []);
  }

  // ─── CATEGORÍAS ───────────────────────────────────
  var CAT_DEFAULTS = {
    ingresos: [
      { nombre: 'Venta de Reparto', color: '#4ade80', icono: '🚚' },
      { nombre: 'Venta de Caja',    color: '#22d3ee', icono: '💵' },
      { nombre: 'Pago de Deuda',    color: '#fbbf24', icono: '💰' },
      { nombre: 'Rendimientos',     color: '#a855f7', icono: '📈' },
      { nombre: 'Otro Ingreso',     color: '#94a3b8', icono: '📥' }
    ],
    gastos: [
      { nombre: 'Nómina',        color: '#f59e0b', icono: '👷' },
      { nombre: 'Materia Prima', color: '#ef4444', icono: '🌾' },
      { nombre: 'Servicios',     color: '#8b5cf6', icono: '💡' },
      { nombre: 'Arriendo',      color: '#ec4899', icono: '🏠' },
      { nombre: 'Transporte',    color: '#06b6d4', icono: '🚗' },
      { nombre: 'Cuotas',        color: '#f97316', icono: '💳' },
      { nombre: 'Mantenimiento', color: '#14b8a6', icono: '🔧' },
      { nombre: 'Otro Gasto',    color: '#64748b', icono: '📤' }
    ],
    costos: [
      { nombre: 'Costo Producción', color: '#fb923c', icono: '🏭' },
      { nombre: 'Insumos',          color: '#a3e635', icono: '📦' },
      { nombre: 'Otro Costo',       color: '#94a3b8', icono: '⚙️' }
    ]
  };

  function getCategorias() {
    try {
      var d = _read(KEYS.categorias, null);
      if (d && Array.isArray(d.ingresos) && d.ingresos.length > 0) return d;
    } catch (e) {}
    return JSON.parse(JSON.stringify(CAT_DEFAULTS));
  }

  function saveCategorias(data) { return _write(KEYS.categorias, data); }

  // ─── HISTORIAL UNIFICADO ──────────────────────────
  // Recolecta gastos + movimientosContables sin duplicados
  function getHistorial() {
    var result = [];
    var seen = {};

    getMovimientos().forEach(function (m, idx) {
      var key = m.id || ('mov-' + m.descripcion + '|' + m.fecha + '|' + m.monto);
      if (seen[key]) return;
      seen[key] = true;
      result.push({
        id: m.id || null,
        fecha: parseFechaLocal(m.fecha),
        tipo: String(m.tipo || 'gasto').toLowerCase(),
        categoria: m.categoria || (m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'),
        descripcion: m.descripcion || '—',
        cuenta: m.cuenta || '—',
        monto: Number(m.monto) || 0,
        origen: 'movContable',
        origenIdx: idx,
        timestamp: m.timestamp || 0
      });
    });

    getGastos().forEach(function (g, idx) {
      var key = g.id || ('gas-' + g.descripcion + '|' + g.fecha + '|' + g.monto);
      if (seen[key]) return;
      // Evitar duplicados exactos ya cubiertos por movimientosContables
      var fLocal = parseFechaLocal(g.fecha);
      var dup = false;
      for (var i = 0; i < result.length; i++) {
        var r = result[i];
        if (r.descripcion === String(g.descripcion || '') &&
            r.monto === (Number(g.monto) || 0) &&
            r.fecha === fLocal) { dup = true; break; }
      }
      if (dup) return;
      seen[key] = true;
      result.push({
        id: g.id || null,
        fecha: fLocal,
        tipo: 'gasto',
        categoria: g.categoria || 'Gasto',
        descripcion: g.descripcion || '—',
        cuenta: g.cuenta || 'Efectivo',
        monto: Number(g.monto) || 0,
        origen: 'gastoManual',
        origenIdx: idx,
        timestamp: g.timestamp || 0
      });
    });

    result.sort(function (a, b) {
      var df = b.fecha.localeCompare(a.fecha);
      return df !== 0 ? df : (b.timestamp - a.timestamp);
    });
    return result;
  }

  // ─── HELPERS DE FORMATO ───────────────────────────
  function formatMoney(n) {
    return '$' + (Number(n) || 0).toLocaleString('es-CO');
  }

  function tipoEmoji(tipo) {
    var m = {
      'CUENTA CORRIENTE': '🏛️', 'CUENTA DE AHORRO': '🐖',
      'NEQUI': '📱', 'DAVIPLATA': '📱', 'EFECTIVO': '💵', 'OTRO': '💳'
    };
    return m[String(tipo || '').toUpperCase()] || '💳';
  }

  // Escucha cambios de otro tab/página en las mismas claves
  function onSync(callback) {
    var vals = Object.values ? Object.values(KEYS) : Object.keys(KEYS).map(function (k) { return KEYS[k]; });
    window.addEventListener('storage', function (e) {
      if (e.key && vals.indexOf(e.key) >= 0) callback(e.key);
    });
  }

  // ─── API PÚBLICA ──────────────────────────────────
  return {
    KEYS: KEYS,
    fechaLocalYMD: fechaLocalYMD,
    fechaLocalISO: fechaLocalISO,
    parseFechaLocal: parseFechaLocal,
    getCuentas: getCuentas,        saveCuentas: saveCuentas,
    getTransferencias: getTransferencias, saveTransferencias: saveTransferencias,
    addTransferencia: addTransferencia,
    getMovimientos: getMovimientos, saveMovimientos: saveMovimientos,
    addMovimiento: addMovimiento,   deleteMovimiento: deleteMovimiento,
    getGastos: getGastos,          saveGastos: saveGastos,
    addGasto: addGasto,            deleteGasto: deleteGasto,
    getCuotas: getCuotas,          saveCuotas: saveCuotas,
    getCategorias: getCategorias,  saveCategorias: saveCategorias,
    getHistorial: getHistorial,
    formatMoney: formatMoney,
    tipoEmoji: tipoEmoji,
    onSync: onSync
  };
})();
