/* ============================================================
   store.js · Modelo de datos, validaciones y persistencia
   ============================================================ */
(function (H) {
  'use strict';

  const STORAGE_KEY = 'harnessStudio.state.v1';
  const listeners = [];

  function createInitialState() {
    return {
      meta: { name: 'Arnés sin título', createdAt: Date.now(), updatedAt: Date.now() },
      settings: { showGrid: true },
      view: { mode: 'schema', scale: 1, x: 40, y: 40 },
      library: [],
      components: [],
      wires: [],
      branches: [],
      taps: [],
      routes: {},
      selection: { type: null, id: null }
    };
  }

  const state = createInitialState();
  let persistTimer = null;

  function emit(reason) {
    listeners.forEach(function (fn) {
      try { fn(reason || 'all', state); } catch (err) { console.error('[store] listener error', err); }
    });
  }

  const Store = {
    state: state,
    STORAGE_KEY: STORAGE_KEY,

    onChange(fn) { if (typeof fn === 'function') listeners.push(fn); },

    /** Persiste (debounce) y notifica a los suscriptores. */
    commit(reason) {
      state.meta.updatedAt = Date.now();
      Store.persist();
      emit(reason || 'all');
    },

    snapshot() {
      return {
        app: 'Harness Studio',
        version: 1,
        meta: state.meta,
        settings: state.settings,
        view: state.view,
        library: state.library,
        components: state.components,
        wires: state.wires,
        branches: state.branches,
        taps: state.taps,
        routes: state.routes
      };
    },

    persist() {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(function () { Store.persistNow(); }, 400);
    },

    persistNow() {
      clearTimeout(persistTimer);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Store.snapshot()));
        return true;
      } catch (err) {
        console.warn('[store] No se pudo guardar en localStorage', err);
        if (H.App && H.App.toast) {
          H.App.toast('No se pudo guardar en el navegador (espacio insuficiente). Usa Exportar JSON.', 'warn', 5200);
        }
        return false;
      }
    },

    load() {
      let raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch (err) { raw = null; }
      if (!raw) return false;
      try {
        const data = JSON.parse(raw);
        return Store.hydrate(data, { silent: true });
      } catch (err) {
        console.warn('[store] Datos locales corruptos, se ignoran.', err);
        return false;
      }
    },

    hydrate(data, options) {
      if (!data || typeof data !== 'object') return false;
      const opts = options || {};
      if (!Array.isArray(data.library) || !Array.isArray(data.components)) return false;

      state.meta = Object.assign(createInitialState().meta, data.meta || {});
      state.settings = Object.assign({ showGrid: true }, data.settings || {});
      delete state.settings.mmPerPx;
      state.view = Object.assign({ mode: 'schema', scale: 1, x: 40, y: 40 }, data.view || {});
      state.library = data.library.filter(function (def) { return def && def.id; });
      state.components = data.components.filter(function (comp) {
        return comp && comp.id && state.library.some(function (d) { return d.id === comp.defId; });
      });
      state.wires = Array.isArray(data.wires) ? data.wires.filter(function (w) {
        return w && w.id && w.fromPinId && w.toPinId;
      }) : [];
      state.branches = Array.isArray(data.branches) ? data.branches.filter(function (b) {
        return b && b.id && b.targetCompId && b.fromCompId && b.toCompId;
      }) : [];
      state.taps = Array.isArray(data.taps) ? data.taps.filter(function (tap) {
        return tap && tap.id && tap.pinId && tap.wireId;
      }) : [];
      state.wires.forEach(function (wire) {
        wire.length = Math.max(0, Number(wire.length) || 0);
        if (!Array.isArray(wire.points)) wire.points = [];
      });
      state.branches.forEach(function (branch) {
        branch.length = Math.max(0, Number(branch.length) || 0);
        branch.atMidpoint = !!branch.atMidpoint;
      });
      state.taps.forEach(function (tap) {
        const rawT = Number(tap.t);
        tap.t = H.Utils.clamp(Number.isFinite(rawT) ? rawT : 0.5, 0.02, 0.98);
        tap.length = Math.max(0, Number(tap.length) || 0);
        if (!tap.color) tap.color = '#475569';
      });
      state.routes = {};
      if (data.routes && typeof data.routes === 'object') {
        Object.keys(data.routes).forEach(function (key) {
          const route = data.routes[key];
          if (route && Number.isFinite(Number(route.x)) && Number.isFinite(Number(route.y))) {
            state.routes[key] = { x: Number(route.x), y: Number(route.y) };
          }
        });
      }
      state.selection = { type: null, id: null };
      Store.pruneInvalidWires();
      if (!opts.silent) emit('all');
      return true;
    },

    /* --------------------------- Consultas --------------------------- */
    findDef(id) {
      return state.library.find(function (def) { return def.id === id; }) || null;
    },

    findComponent(id) {
      return state.components.find(function (comp) { return comp.id === id; }) || null;
    },

    compData(compOrId) {
      const comp = typeof compOrId === 'string' ? Store.findComponent(compOrId) : compOrId;
      if (!comp) return null;
      const def = Store.findDef(comp.defId);
      if (!def) return null;
      return { comp: comp, def: def };
    },

    pinKey(compId, pinId) { return compId + '|' + pinId; },

    splitKey(fullKey) {
      const raw = String(fullKey || '');
      const idx = raw.indexOf('|');
      if (idx < 0) return null;
      return { compId: raw.slice(0, idx), pinId: raw.slice(idx + 1) };
    },

    findPin(fullKey) {
      const ref = Store.splitKey(fullKey);
      if (!ref) return null;
      const data = Store.compData(ref.compId);
      if (!data) return null;
      const pin = (data.def.pins || []).find(function (p) { return p.id === ref.pinId; });
      if (!pin) return null;
      return {
        comp: data.comp,
        def: data.def,
        pin: pin,
        compName: data.def.name,
        fullKey: fullKey
      };
    },

    pinLabel(fullKey) {
      const found = Store.findPin(fullKey);
      if (!found) return '—';
      return found.compName + ' · ' + found.pin.label;
    },

    isPinConnected(fullKey) {
      return state.wires.some(function (w) {
        return w.fromPinId === fullKey || w.toPinId === fullKey;
      }) || state.taps.some(function (tap) {
        return tap.pinId === fullKey;
      });
    },

    /** Devuelve el chicote o empalme que ocupa un pin, si existe. */
    connectionOfPin(fullKey) {
      const wire = state.wires.find(function (w) {
        return w.fromPinId === fullKey || w.toPinId === fullKey;
      });
      if (wire) return { kind: 'wire', wire: wire };
      const tap = state.taps.find(function (item) { return item.pinId === fullKey; });
      if (tap) {
        return {
          kind: 'tap',
          tap: tap,
          wire: state.wires.find(function (w) { return w.id === tap.wireId; }) || null
        };
      }
      return null;
    },

    wiresOfComponent(compId) {
      return state.wires.filter(function (w) {
        const a = Store.splitKey(w.fromPinId);
        const b = Store.splitKey(w.toPinId);
        return (a && a.compId === compId) || (b && b.compId === compId);
      });
    },

    findTap(tapId) {
      return state.taps.find(function (tap) { return tap.id === tapId; }) || null;
    },

    tapsOfPin(fullKey) {
      return state.taps.filter(function (tap) { return tap.pinId === fullKey; });
    },

    tapsOfWire(wireId) {
      return state.taps.filter(function (tap) { return tap.wireId === wireId; });
    },

    tapsOfComponent(compId) {
      return state.taps.filter(function (tap) {
        const ref = Store.splitKey(tap.pinId);
        return ref && ref.compId === compId;
      });
    },

    bundleKey(compA, compB) {
      return [compA, compB].sort().join('|');
    },

    getSelection() {
      return state.selection;
    },

    select(type, id) {
      state.selection = { type: type || null, id: id || null };
      emit('selection');
    },

    clearSelection() {
      if (!state.selection.type && !state.selection.id) return;
      state.selection = { type: null, id: null };
      emit('selection');
    },

    setSettings(patch) {
      state.settings = Object.assign({}, state.settings, patch || {});
      Store.commit('settings');
    },

    setView(patch) {
      state.view = Object.assign({}, state.view, patch || {});
      Store.persist();
    },

    /* --------------------------- Definiciones --------------------------- */
    addDefinition(def) {
      const built = H.Utils.buildPins(def.subgroups || []);
      const record = {
        id: def.id || H.Utils.uid('def'),
        name: def.name,
        company: def.company || '',
        cost: Number(def.cost) || 0,
        image: def.image || '',
        subgroups: built.subgroups,
        pins: built.pins,
        createdAt: Date.now()
      };
      state.library.push(record);
      Store.commit('all');
      return record;
    },

    updateDefinition(defId, patch) {
      const def = Store.findDef(defId);
      if (!def) return null;
      const next = Object.assign({}, def, patch);
      const built = H.Utils.buildPins(next.subgroups || []);
      next.subgroups = built.subgroups;
      next.pins = built.pins;
      next.cost = Number(next.cost) || 0;
      state.library = state.library.map(function (item) { return item.id === defId ? next : item; });
      Store.pruneInvalidWires();
      Store.commit('all');
      return next;
    },

    removeDefinition(defId) {
      const used = state.components.some(function (comp) { return comp.defId === defId; });
      if (used) return { error: 'El componente está colocado en el lienzo. Elimina sus instancias primero.' };
      state.library = state.library.filter(function (def) { return def.id !== defId; });
      Store.commit('all');
      return { ok: true };
    },

    /* --------------------------- Instancias --------------------------- */
    addComponent(defId, x, y, options) {
      const def = Store.findDef(defId);
      if (!def) return null;
      const opts = options || {};
      const comp = {
        id: H.Utils.uid('comp'),
        defId: defId,
        x: Math.round(Number(x) || 0),
        y: Math.round(Number(y) || 0),
        layoutX: Math.round(Number(opts.layoutX) || Number(x) || 0),
        layoutY: Math.round(Number(opts.layoutY) || Number(y) || 0)
      };
      state.components.push(comp);
      Store.commit('all');
      return comp;
    },

    moveComponent(compId, x, y, view) {
      const comp = Store.findComponent(compId);
      if (!comp) return;
      if (view === 'layout') {
        comp.layoutX = Math.round(x);
        comp.layoutY = Math.round(y);
      } else {
        comp.x = Math.round(x);
        comp.y = Math.round(y);
      }
    },

    removeComponent(compId) {
      const comp = Store.findComponent(compId);
      if (!comp) return { error: 'Componente no encontrado.' };
      state.components = state.components.filter(function (item) { return item.id !== compId; });
      state.wires = state.wires.filter(function (wire) {
        const a = Store.splitKey(wire.fromPinId);
        const b = Store.splitKey(wire.toPinId);
        return !(a && a.compId === compId) && !(b && b.compId === compId);
      });
      state.branches = state.branches.filter(function (branch) {
        return branch.fromCompId !== compId && branch.toCompId !== compId && branch.targetCompId !== compId;
      });
      Store.pruneOrphanTaps();
      Store.pruneOrphanRoutes();
      if (state.selection.type === 'component' && state.selection.id === compId) {
        state.selection = { type: null, id: null };
      }
      Store.commit('all');
      return { ok: true };
    },

    /* --------------------------- Chicotes --------------------------- */
    nextWireColor() {
      const palette = H.Utils.wirePalette;
      return palette[(state.wires.length + state.taps.length) % palette.length];
    },

    addWire(fromKey, toKey, color) {
      if (!fromKey || !toKey) return { error: 'Selecciona dos pines para crear el chicote.' };
      if (fromKey === toKey) return { error: 'Un pin no puede conectarse consigo mismo.' };
      const a = Store.findPin(fromKey);
      const b = Store.findPin(toKey);
      if (!a || !b) return { error: 'Los pines seleccionados ya no existen.' };
      if (Store.isPinConnected(fromKey)) {
        return { error: 'El pin ' + a.pin.label + ' de ' + a.compName + ' ya tiene una conexión (1 a 1).' };
      }
      if (Store.isPinConnected(toKey)) {
        return { error: 'El pin ' + b.pin.label + ' de ' + b.compName + ' ya tiene una conexión (1 a 1).' };
      }
      const wire = {
        id: H.Utils.uid('wire'),
        fromPinId: fromKey,
        toPinId: toKey,
        color: color || Store.nextWireColor(),
        length: 0,
        points: [],
        createdAt: Date.now()
      };
      state.wires.push(wire);
      Store.commit('all');
      return { wire: wire };
    },

    updateWire(wireId, patch, reason) {
      const wire = state.wires.find(function (w) { return w.id === wireId; });
      if (!wire) return null;
      Object.assign(wire, patch || {});
      if (Object.prototype.hasOwnProperty.call(patch || {}, 'length')) {
        wire.length = Math.max(0, Number(wire.length) || 0);
      }
      Store.commit(reason || 'all');
      return wire;
    },

    removeWire(wireId) {
      const wire = state.wires.find(function (w) { return w.id === wireId; });
      state.wires = state.wires.filter(function (item) { return item.id !== wireId; });
      Store.pruneOrphanTaps();
      Store.pruneOrphanBranches();
      Store.pruneOrphanRoutes();
      if (state.selection.type === 'wire' && state.selection.id === wireId) {
        state.selection = { type: null, id: null };
      }
      Store.commit('all');
      return wire;
    },

    /* --------------------------- Empalmes pin → cable --------------------------- */
    addTap(pinId, wireId, t, options) {
      const opts = options || {};
      const pin = Store.findPin(pinId);
      if (!pin) return { error: 'El pin del empalme ya no existe.' };
      const wire = state.wires.find(function (w) { return w.id === wireId; });
      if (!wire) return { error: 'El cable de destino ya no existe.' };
      if (Store.isPinConnected(pinId)) {
        return { error: 'El pin ' + pin.pin.label + ' de ' + pin.compName + ' ya tiene una conexión.' };
      }
      if (!Store.findPin(wire.fromPinId) || !Store.findPin(wire.toPinId)) {
        return { error: 'El cable de destino no es válido.' };
      }
      const rawT = Number(t);
      const tap = {
        id: H.Utils.uid('tap'),
        pinId: pinId,
        wireId: wireId,
        t: H.Utils.clamp(Number.isFinite(rawT) ? rawT : 0.5, 0.02, 0.98),
        color: opts.color || wire.color || '#475569',
        length: Math.max(0, Number(opts.length) || 0),
        createdAt: Date.now()
      };
      state.taps.push(tap);
      Store.commit('all');
      return { tap: tap };
    },

    updateTap(tapId, patch, reason) {
      const tap = Store.findTap(tapId);
      if (!tap) return null;
      const next = patch || {};
      Object.assign(tap, next);
      if (Object.prototype.hasOwnProperty.call(next, 't')) {
        const rawT = Number(tap.t);
        tap.t = H.Utils.clamp(Number.isFinite(rawT) ? rawT : 0.5, 0.02, 0.98);
      }
      if (Object.prototype.hasOwnProperty.call(next, 'length')) {
        tap.length = Math.max(0, Number(tap.length) || 0);
      }
      Store.commit(reason || 'all');
      return tap;
    },

    removeTap(tapId) {
      const tap = Store.findTap(tapId);
      if (!tap) return null;
      state.taps = state.taps.filter(function (item) { return item.id !== tapId; });
      if (state.selection.type === 'tap' && state.selection.id === tapId) {
        state.selection = { type: null, id: null };
      }
      Store.commit('all');
      return tap;
    },

    /* --------------------------- Ramificaciones --------------------------- */
    addBranch(payload) {
      const data = payload || {};
      const from = Store.findComponent(data.fromCompId);
      const to = Store.findComponent(data.toCompId);
      const target = Store.findComponent(data.targetCompId);
      if (!from || !to || !target) return { error: 'Componentes inválidos para la ramificación.' };
      if (target.id === from.id || target.id === to.id) {
        return { error: 'La ramificación debe apuntar a un componente distinto del haz.' };
      }
      const branch = {
        id: H.Utils.uid('branch'),
        fromCompId: from.id,
        toCompId: to.id,
        targetCompId: target.id,
        t: H.Utils.clamp(Number(data.t) || 0.5, 0.08, 0.92),
        color: data.color || '#475569',
        length: Math.max(0, Number(data.length) || 0),
        atMidpoint: !!data.atMidpoint,
        createdAt: Date.now()
      };
      state.branches.push(branch);
      Store.commit('all');
      return { branch: branch };
    },

    updateBranch(branchId, patch, reason) {
      const branch = state.branches.find(function (b) { return b.id === branchId; });
      if (!branch) return null;
      Object.assign(branch, patch || {});
      if (Object.prototype.hasOwnProperty.call(patch || {}, 'length')) {
        branch.length = Math.max(0, Number(branch.length) || 0);
      }
      Store.commit(reason || 'all');
      return branch;
    },

    removeBranch(branchId) {
      state.branches = state.branches.filter(function (branch) { return branch.id !== branchId; });
      if (state.selection.type === 'branch' && state.selection.id === branchId) {
        state.selection = { type: null, id: null };
      }
      Store.commit('all');
    },

    branchesForBundle(compA, compB) {
      return state.branches.filter(function (branch) {
        return Store.bundleKey(branch.fromCompId, branch.toCompId) === Store.bundleKey(compA, compB);
      });
    },

    /* --------------------------- Rutas de layout --------------------------- */
    bundleExists(key) {
      return state.wires.some(function (wire) {
        const a = Store.splitKey(wire.fromPinId);
        const b = Store.splitKey(wire.toPinId);
        if (!a || !b) return false;
        return Store.bundleKey(a.compId, b.compId) === key;
      });
    },

    getRoute(key) {
      const route = state.routes[key];
      if (!route) return null;
      if (!Number.isFinite(Number(route.x)) || !Number.isFinite(Number(route.y))) return null;
      return { x: Number(route.x), y: Number(route.y) };
    },

    setRoute(key, x, y) {
      if (!key) return;
      state.routes[key] = { x: Math.round(Number(x) || 0), y: Math.round(Number(y) || 0) };
    },

    setRoutes(keys, x, y) {
      (keys || []).forEach(function (key) { Store.setRoute(key, x, y); });
    },

    clearRoute(key) {
      if (key && state.routes[key]) delete state.routes[key];
    },

    /** Claves de haces que comparten exactamente el mismo punto de unión. */
    joinedRouteKeys(key) {
      const route = Store.getRoute(key);
      if (!route) return [key];
      return Object.keys(state.routes).filter(function (otherKey) {
        if (!Store.bundleExists(otherKey)) return false;
        const other = state.routes[otherKey];
        return Math.abs(Number(other.x) - route.x) < 0.75 &&
          Math.abs(Number(other.y) - route.y) < 0.75;
      }).sort();
    },

    pruneOrphanRoutes() {
      Object.keys(state.routes).forEach(function (key) {
        if (!Store.bundleExists(key)) delete state.routes[key];
      });
    },

    pruneInvalidWires() {
      state.wires = state.wires.filter(function (wire) {
        return Store.findPin(wire.fromPinId) && Store.findPin(wire.toPinId);
      });
      Store.pruneOrphanTaps();
      Store.pruneOrphanBranches();
      Store.pruneOrphanRoutes();
    },

    /** Elimina empalmes cuyo pin o cable ya no existe. */
    pruneOrphanTaps() {
      state.taps = state.taps.filter(function (tap) {
        if (!Store.findPin(tap.pinId)) return false;
        return state.wires.some(function (wire) { return wire.id === tap.wireId; });
      });
      if (state.selection.type === 'tap' && !Store.findTap(state.selection.id)) {
        state.selection = { type: null, id: null };
      }
    },

    /** Elimina ramificaciones cuyo componente destino o cuyo haz ya no existe. */
    pruneOrphanBranches() {
      state.branches = state.branches.filter(function (branch) {
        if (!Store.findComponent(branch.targetCompId)) return false;
        return state.wires.some(function (wire) {
          const a = Store.splitKey(wire.fromPinId);
          const b = Store.splitKey(wire.toPinId);
          if (!a || !b) return false;
          return Store.bundleKey(a.compId, b.compId) === Store.bundleKey(branch.fromCompId, branch.toCompId);
        });
      });
    },

    /* --------------------------- Importar / Exportar --------------------------- */
    exportJSON() {
      return JSON.stringify(Store.snapshot(), null, 2);
    },

    importJSON(text) {
      let data;
      try { data = JSON.parse(text); } catch (err) { return { error: 'El archivo no es un JSON válido.' }; }
      const result = Store.hydrate(data, { silent: true });
      if (!result) return { error: 'El JSON no tiene el formato de un arnés válido.' };
      Store.commit('all');
      return { ok: true };
    },

    clear() {
      const keepView = state.view;
      const fresh = createInitialState();
      fresh.view = keepView;
      Object.keys(fresh).forEach(function (key) { state[key] = fresh[key]; });
      Store.commit('all');
    },

    /* --------------------------- Proyecto de ejemplo --------------------------- */
    loadDemo() {
      const svgImage = function (title, hue) {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220">' +
          '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="hsl(' + hue + ',65%,50%)"/>' +
          '<stop offset="1" stop-color="hsl(' + hue + ',70%,28%)"/></linearGradient></defs>' +
          '<rect width="360" height="220" fill="#1e293b"/>' +
          '<rect x="30" y="46" width="300" height="128" rx="18" fill="url(#g)"/>' +
          '<rect x="30" y="46" width="300" height="128" rx="18" fill="none" stroke="#e2e8f0" stroke-opacity=".35" stroke-width="3"/>' +
          '<rect x="56" y="78" width="248" height="64" rx="10" fill="#0f172a" fill-opacity=".55"/>' +
          '<text x="180" y="118" font-family="Segoe UI,Arial" font-size="19" font-weight="700" fill="#f8fafc" text-anchor="middle">' + title + '</text>' +
          '<text x="180" y="152" font-family="Segoe UI,Arial" font-size="11" fill="#e2e8f0" text-anchor="middle" opacity=".8">HARNESS DEMO</text>' +
          '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      };

      const withPins = function (def) {
        const built = H.Utils.buildPins(def.subgroups);
        return Object.assign({}, def, { subgroups: built.subgroups, pins: built.pins, createdAt: Date.now() });
      };

      const ecuDef = withPins({
        id: 'def_demo_ecu', name: 'ECU Motor', company: 'Bosch', cost: 48.5,
        image: svgImage('ECU MOTOR', 212),
        subgroups: [
          {
            id: 'sg_ecu_a', name: 'Sección A', rows: 2, cols: 4, numbering: 'numeric', prefix: '', start: 1,
            descriptions: {
              sg_ecu_a_r1c1: '12V BAT', sg_ecu_a_r1c2: 'GND', sg_ecu_a_r1c3: '5V REF', sg_ecu_a_r1c4: 'CAN H',
              sg_ecu_a_r2c1: 'CAN L', sg_ecu_a_r2c2: 'INJ 1', sg_ecu_a_r2c3: 'INJ 2', sg_ecu_a_r2c4: 'INJ 3'
            }
          },
          {
            id: 'sg_ecu_b', name: 'Sección B', rows: 1, cols: 4, numbering: 'numeric', prefix: '', start: 9,
            descriptions: {
              sg_ecu_b_r1c1: 'GND', sg_ecu_b_r1c2: '12V', sg_ecu_b_r1c3: 'IGN', sg_ecu_b_r1c4: 'STARTER'
            }
          }
        ]
      });

      const sensorDef = withPins({
        id: 'def_demo_sensor', name: 'Sensor MAP', company: 'Delphi', cost: 22.75,
        image: svgImage('SENSOR MAP', 152),
        subgroups: [
          {
            id: 'sg_sensor_a', name: 'Pines', rows: 1, cols: 4, numbering: 'row-alpha', prefix: '', start: 1,
            descriptions: {
              sg_sensor_a_r1c1: '5V', sg_sensor_a_r1c2: 'GND', sg_sensor_a_r1c3: 'SIGNAL', sg_sensor_a_r1c4: 'SHIELD'
            }
          }
        ]
      });

      const fuseDef = withPins({
        id: 'def_demo_fuse', name: 'Caja de Fusibles', company: 'TE Connectivity', cost: 64.2,
        image: svgImage('FUSE BOX', 28),
        subgroups: [
          {
            id: 'sg_fuse_a', name: 'Principal', rows: 2, cols: 3, numbering: 'numeric', prefix: 'F', start: 1,
            descriptions: {
              sg_fuse_a_r1c1: 'MAIN', sg_fuse_a_r1c2: 'FUEL', sg_fuse_a_r1c3: 'ABS',
              sg_fuse_a_r2c1: 'SPARE', sg_fuse_a_r2c2: 'SPARE', sg_fuse_a_r2c3: 'SPARE'
            }
          }
        ]
      });

      state.library = [ecuDef, sensorDef, fuseDef];
      state.components = [
        { id: 'comp_demo_ecu', defId: 'def_demo_ecu', x: 80, y: 80, layoutX: 110, layoutY: 150 },
        { id: 'comp_demo_sensor', defId: 'def_demo_sensor', x: 560, y: 80, layoutX: 640, layoutY: 150 },
        { id: 'comp_demo_fuse', defId: 'def_demo_fuse', x: 320, y: 420, layoutX: 700, layoutY: 430 }
      ];

      const wire = function (fromKey, toKey, color, length) {
        return {
          id: H.Utils.uid('wire'), fromPinId: fromKey, toPinId: toKey,
          color: color, length: Number(length) || 0, points: [], createdAt: Date.now()
        };
      };
      const ecuA = function (col) { return 'comp_demo_ecu|sg_ecu_a_r1c' + col; };
      const ecuB = function (col) { return 'comp_demo_ecu|sg_ecu_b_r1c' + col; };
      const sensorPin = function (col) { return 'comp_demo_sensor|sg_sensor_a_r1c' + col; };
      const fusePin = function (row, col) { return 'comp_demo_fuse|sg_fuse_a_r' + row + 'c' + col; };

      state.wires = [
        wire(ecuA(1), sensorPin(1), '#ef4444', 320),
        wire(ecuA(2), sensorPin(2), '#2563eb', 330),
        wire(ecuA(3), sensorPin(3), '#16a34a', 340),
        wire(ecuA(4), sensorPin(4), '#f59e0b', 350),
        wire(ecuB(1), fusePin(1, 1), '#9333ea', 420),
        wire(ecuB(2), fusePin(1, 2), '#0891b2', 430),
        wire(ecuB(3), fusePin(1, 3), '#0f172a', 440)
      ];

      state.branches = [{
        id: H.Utils.uid('branch'),
        fromCompId: 'comp_demo_ecu',
        toCompId: 'comp_demo_sensor',
        targetCompId: 'comp_demo_fuse',
        t: 0.55,
        color: '#475569',
        length: 260,
        atMidpoint: true,
        createdAt: Date.now()
      }];

      state.taps = [{
        id: H.Utils.uid('tap'),
        pinId: fusePin(2, 1),
        wireId: state.wires[0].id,
        t: 0.6,
        color: '#ef4444',
        length: 180,
        createdAt: Date.now()
      }];

      state.selection = { type: null, id: null };
      state.routes = {};
      Store.commit('all');
    }
  };

  H.store = Store;
})(window.Harness);
