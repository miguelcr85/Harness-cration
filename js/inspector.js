/* ============================================================
   inspector.js · Panel de propiedades, medición y resumen
   ============================================================ */
(function (H) {
  'use strict';

  const U = H.Utils;
  let body = null;

  function manualLength(value) {
    const num = Math.max(0, Number(value) || 0);
    return num > 0 ? U.formatNumber(num, 0) + ' mm' : '— mm';
  }

  function totalWiresLength(wires) {
    return (wires || []).reduce(function (sum, wire) {
      return sum + Math.max(0, Number(wire.length) || 0);
    }, 0);
  }

  function selectionHead(icon, title, subtitle) {
    return '<div class="selection-head">' +
      '<div class="selection-head__icon">' + icon + '</div>' +
      '<div class="selection-head__text">' +
        '<div class="selection-head__title">' + U.escapeHtml(title) + '</div>' +
        '<div class="selection-head__sub">' + U.escapeHtml(subtitle || '') + '</div>' +
      '</div>' +
    '</div>';
  }

  function row(label, value) {
    return '<div class="prop-row"><dt>' + U.escapeHtml(label) + '</dt><dd>' + U.escapeHtml(value) + '</dd></div>';
  }

  function emptyMessage() {
    return '<p class="muted">Selecciona un componente, un pin, un chicote, un haz o una ramificación para ver sus propiedades.</p>' +
      '<p class="hint" style="margin-top:8px">Los elementos seleccionados se resaltan en el lienzo. Doble clic en un chicote agrega un punto de ruteo; en layout, doble clic sobre un haz o ramificación permite escribir su longitud manual.</p>';
  }

  function bundleComps(key) {
    const parts = String(key || '').split('|');
    if (parts.length !== 2) return null;
    const a = H.store.findComponent(parts[0]);
    const b = H.store.findComponent(parts[1]);
    if (!a || !b) return null;
    return { a: a, b: b, defA: H.store.findDef(a.defId), defB: H.store.findDef(b.defId) };
  }

  function renderComponent(comp) {
    const data = H.store.compData(comp);
    if (!data) return emptyMessage();
    const def = data.def;
    const pinCount = (def.pins || []).length;
    const connected = H.store.wiresOfComponent(comp.id).length;
    const totalLength = totalWiresLength(H.store.wiresOfComponent(comp.id));
    return selectionHead('▣', def.name, (def.company || 'Sin fabricante') + ' · ' + pinCount + ' pines') +
      '<dl class="prop-list">' +
        row('Costo unitario', U.formatMoney(def.cost)) +
        row('Chicotes conectados', String(connected)) +
        row('Longitud manual de sus cables', manualLength(totalLength)) +
        row('Subgrupos', (def.subgroups || []).length + '') +
      '</dl>' +
      '<div class="form-grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
        '<label class="field"><span>Posición X (esquema)</span><input type="number" data-field="x" value="' + comp.x + '" /></label>' +
        '<label class="field"><span>Posición Y (esquema)</span><input type="number" data-field="y" value="' + comp.y + '" /></label>' +
        '<label class="field"><span>Posición X (layout)</span><input type="number" data-field="layoutX" value="' + Math.round(comp.layoutX || 0) + '" /></label>' +
        '<label class="field"><span>Posición Y (layout)</span><input type="number" data-field="layoutY" value="' + Math.round(comp.layoutY || 0) + '" /></label>' +
      '</div>' +
      '<div class="actions-row">' +
        '<button class="btn btn--sm" type="button" data-action="edit-def">Editar definición</button>' +
        '<button class="btn btn--sm btn--danger-ghost" type="button" data-action="delete-component">Eliminar del lienzo</button>' +
      '</div>';
  }

  function renderWire(wire) {
    const from = H.store.pinLabel(wire.fromPinId);
    const to = H.store.pinLabel(wire.toPinId);
    const length = Math.max(0, Number(wire.length) || 0);
    return selectionHead('〜', from + ' → ' + to, 'Chicote individual') +
      '<dl class="prop-list">' +
        row('Origen', from) +
        row('Destino', to) +
        row('Puntos de ruteo', String((wire.points || []).length)) +
      '</dl>' +
      '<div class="color-row">' +
        '<input type="color" data-field="color" value="' + (wire.color || '#334155') + '" />' +
        '<span>Color del chicote</span>' +
      '</div>' +
      '<label class="field field--flush"><span>Longitud manual (mm)</span>' +
        '<input type="number" min="0" step="10" data-field="length" value="' + (length || '') + '" placeholder="Ej: 350" />' +
      '</label>' +
      '<p class="hint length-hint">Longitud representativa: se escribe a mano y no se calcula del lienzo.</p>' +
      '<div class="actions-row">' +
        '<button class="btn btn--sm" type="button" data-action="reset-wire">Restablecer ruteo</button>' +
        '<button class="btn btn--sm btn--danger-ghost" type="button" data-action="delete-wire">Eliminar</button>' +
      '</div>' +
      '<p class="hint" style="margin-top:8px">Doble clic sobre el cable agrega un punto de control.</p>';
  }

  function renderBundle(key) {
    const comps = bundleComps(key);
    if (!comps) return emptyMessage();
    const wires = H.store.state.wires.filter(function (wire) {
      const a = H.store.splitKey(wire.fromPinId);
      const b = H.store.splitKey(wire.toPinId);
      return a && b && H.store.bundleKey(a.compId, b.compId) === key;
    });
    const branches = H.store.branchesForBundle(comps.a.id, comps.b.id);
    const total = totalWiresLength(wires);
    const route = H.store.getRoute(key);
    const joined = H.store.joinedRouteKeys(key);
    const list = wires.map(function (wire) {
      return '<div class="wire-item">' +
        '<span class="wire-item__swatch" style="background:' + U.escapeHtml(wire.color || '#334155') + '"></span>' +
        '<span class="wire-item__text">' + U.escapeHtml(H.store.pinLabel(wire.fromPinId)) + ' → ' + U.escapeHtml(H.store.pinLabel(wire.toPinId)) + '</span>' +
        '<span class="wire-item__len">' + manualLength(wire.length) + '</span>' +
      '</div>';
    }).join('');

    return selectionHead('≋', (comps.defA ? comps.defA.name : 'Componente') + ' ↔ ' + (comps.defB ? comps.defB.name : 'Componente'), 'Haz de cables') +
      '<dl class="prop-list">' +
        row('Cables en el haz', String(wires.length)) +
        row('Ramificaciones', String(branches.length)) +
        row('Longitud manual total', manualLength(total)) +
        row('Punto de unión', route ? Math.round(route.x) + ', ' + Math.round(route.y) : 'Automático (punto medio)') +
        (joined.length > 1 ? row('Haces unidos', String(joined.length)) : '') +
      '</dl>' +
      '<div class="wire-list">' + (list || '<p class="muted">Sin cables.</p>') + '</div>' +
      '<label class="field field--flush"><span>Longitud para todo el haz (mm)</span>' +
        '<input type="number" min="0" step="10" data-field="bundleLength" placeholder="Ej: 350" />' +
      '</label>' +
      '<p class="hint length-hint">Se aplica a cada cable del haz. También puedes hacer doble clic sobre el haz en el lienzo.</p>' +
      '<div class="actions-row">' +
        '<button class="btn btn--sm" type="button" data-action="apply-bundle-length">Aplicar longitud</button>' +
        (route ? '<button class="btn btn--sm" type="button" data-action="reset-route">Quitar unión</button>' : '') +
        '<button class="btn btn--sm btn--danger-ghost" type="button" data-action="delete-bundle">Eliminar haz</button>' +
      '</div>' +
      '<p class="hint" style="margin-top:8px">Arrastra el punto medio para moverlo; suéltalo sobre otro haz para unirlos o sobre un componente para ramificar.</p>';
  }

  function renderBranch(branch) {
    const target = H.store.findComponent(branch.targetCompId);
    const targetDef = target ? H.store.findDef(target.defId) : null;
    const fromComp = H.store.findComponent(branch.fromCompId);
    const toComp = H.store.findComponent(branch.toCompId);
    const fromDef = fromComp ? H.store.findDef(fromComp.defId) : null;
    const toDef = toComp ? H.store.findDef(toComp.defId) : null;
    const length = Math.max(0, Number(branch.length) || 0);

    return selectionHead('⑂', (targetDef ? targetDef.name : 'Componente') + ' · ramificación', 'Derivación del haz') +
      '<dl class="prop-list">' +
        row('Haz', (fromDef ? fromDef.name : '—') + ' ↔ ' + (toDef ? toDef.name : '—')) +
        row('Posición en el haz', Math.round(branch.t * 100) + '%') +
      '</dl>' +
      '<div class="color-row">' +
        '<input type="color" data-field="color" value="' + (branch.color || '#475569') + '" />' +
        '<span>Color de la ramificación</span>' +
      '</div>' +
      '<label class="field field--flush"><span>Longitud manual (mm)</span>' +
        '<input type="number" min="0" step="10" data-field="length" value="' + (length || '') + '" placeholder="Ej: 250" />' +
      '</label>' +
      '<p class="hint length-hint">También puedes hacer doble clic sobre la ramificación en el lienzo.</p>' +
      '<div class="actions-row">' +
        '<button class="btn btn--sm btn--danger-ghost" type="button" data-action="delete-branch">Eliminar ramificación</button>' +
      '</div>';
  }

  function renderPin(fullKey) {
    const found = H.store.findPin(fullKey);
    if (!found) return emptyMessage();
    const wire = H.store.state.wires.find(function (w) {
      return w.fromPinId === fullKey || w.toPinId === fullKey;
    });
    const other = wire
      ? H.store.pinLabel(wire.fromPinId === fullKey ? wire.toPinId : wire.fromPinId)
      : '';
    const actions = wire
      ? '<div class="actions-row">' +
          '<button class="btn btn--sm" type="button" data-action="select-wire" data-wire-id="' + wire.id + '">Ver chicote</button>' +
          '<button class="btn btn--sm btn--danger-ghost" type="button" data-action="delete-wire" data-wire-id="' + wire.id + '">Eliminar chicote</button>' +
        '</div>'
      : '<p class="hint" style="margin-top:8px">Pin libre: arrástralo hasta otro pin del lienzo para crear un chicote.</p>';

    return selectionHead('⊙', found.compName + ' · pin ' + found.pin.label, found.pin.subgroupName || 'Pin') +
      '<dl class="prop-list">' +
        row('Componente', found.compName) +
        row('Subgrupo', found.pin.subgroupName || '—') +
        row('Descripción', found.pin.description || '—') +
        row('Estado', wire ? 'Conectado' : 'Libre') +
        (wire ? row('Conectado a', other) + row('Longitud manual', manualLength(wire.length)) : '') +
      '</dl>' +
      actions +
      '<div class="actions-row" style="margin-top:8px">' +
        '<button class="btn btn--sm btn--ghost" type="button" data-action="select-component" data-comp-id="' + found.comp.id + '">Seleccionar componente</button>' +
      '</div>';
  }

  H.Inspector = {
    init() {
      body = U.$('#selectionBody');
      if (!body) return;

      body.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const selection = H.store.state.selection;
        const action = btn.dataset.action;

        if (action === 'edit-def') {
          const comp = H.store.findComponent(selection.id);
          if (comp) H.ComponentModal.open(comp.defId);
        } else if (action === 'delete-component') {
          const comp = H.store.findComponent(selection.id);
          if (comp && window.confirm('¿Eliminar el componente del lienzo y todos sus chicotes?')) {
            H.store.removeComponent(comp.id);
            H.App.toast('Componente eliminado.', 'ok');
          }
        } else if (action === 'delete-wire') {
          const wireId = btn.dataset.wireId || selection.id;
          H.store.removeWire(wireId);
          H.App.toast('Chicote eliminado.', 'ok');
        } else if (action === 'select-wire') {
          if (btn.dataset.wireId) H.store.select('wire', btn.dataset.wireId);
        } else if (action === 'select-component') {
          if (btn.dataset.compId) H.store.select('component', btn.dataset.compId);
        } else if (action === 'reset-wire') {
          H.store.updateWire(selection.id, { points: [] });
          H.App.toast('Ruteo restablecido.', 'ok');
        } else if (action === 'apply-bundle-length') {
          if (selection.type !== 'bundle') return;
          const input = body.querySelector('[data-field="bundleLength"]');
          const value = Math.max(0, Number(input && input.value) || 0);
          if (!value) {
            H.App.toast('Escribe una longitud en milímetros mayor que 0.', 'warn');
            return;
          }
          H.store.state.wires.forEach(function (wire) {
            const a = H.store.splitKey(wire.fromPinId);
            const b = H.store.splitKey(wire.toPinId);
            if (a && b && H.store.bundleKey(a.compId, b.compId) === selection.id) {
              wire.length = value;
            }
          });
          H.store.commit('all');
          H.App.toast('Longitud manual aplicada a los cables del haz.', 'ok');
        } else if (action === 'reset-route') {
          if (selection.type !== 'bundle') return;
          H.store.clearRoute(selection.id);
          H.store.commit('all');
          H.App.toast('Unión eliminada: el haz vuelve a su punto medio.', 'ok');
        } else if (action === 'delete-bundle') {
          const comps = bundleComps(selection.id);
          if (!comps) return;
          if (!window.confirm('¿Eliminar todos los chicotes de este haz?')) return;
          H.store.state.wires.slice().forEach(function (wire) {
            const a = H.store.splitKey(wire.fromPinId);
            const b = H.store.splitKey(wire.toPinId);
            if (a && b && H.store.bundleKey(a.compId, b.compId) === selection.id) H.store.removeWire(wire.id);
          });
          H.store.clearSelection();
          H.App.toast('Haz eliminado.', 'ok');
        } else if (action === 'delete-branch') {
          H.store.removeBranch(selection.id);
          H.App.toast('Ramificación eliminada.', 'ok');
        }
      });

      body.addEventListener('input', function (e) {
        const field = e.target.dataset ? e.target.dataset.field : null;
        if (field !== 'color') return;
        const selection = H.store.state.selection;
        if (selection.type === 'wire') {
          H.store.updateWire(selection.id, { color: e.target.value }, 'geometry');
        } else if (selection.type === 'branch') {
          const branch = H.store.state.branches.find(function (b) { return b.id === selection.id; });
          if (branch) {
            branch.color = e.target.value;
            H.Layout.drawWires();
            H.store.persist();
          }
        }
      });

      body.addEventListener('change', function (e) {
        const field = e.target.dataset ? e.target.dataset.field : null;
        const selection = H.store.state.selection;

        if (field === 'length') {
          const value = Math.max(0, Number(e.target.value) || 0);
          if (selection.type === 'wire') {
            H.store.updateWire(selection.id, { length: value });
            H.App.toast('Longitud manual del chicote actualizada.', 'ok', 1800);
          } else if (selection.type === 'branch') {
            H.store.updateBranch(selection.id, { length: value });
            H.App.toast('Longitud manual de la ramificación actualizada.', 'ok', 1800);
          }
          return;
        }

        if (field !== 'x' && field !== 'y' && field !== 'layoutX' && field !== 'layoutY') return;
        if (selection.type !== 'component') return;
        const comp = H.store.findComponent(selection.id);
        if (!comp) return;
        comp[field] = Math.round(Number(e.target.value) || 0);
        H.store.commit('all');
      });
    },

    render() {
      if (!body) body = U.$('#selectionBody');
      if (!body) return;
      const selection = H.store.state.selection;
      if (selection.type === 'component') {
        const comp = H.store.findComponent(selection.id);
        body.innerHTML = comp ? renderComponent(comp) : emptyMessage();
      } else if (selection.type === 'wire') {
        const wire = H.store.state.wires.find(function (w) { return w.id === selection.id; });
        body.innerHTML = wire ? renderWire(wire) : emptyMessage();
      } else if (selection.type === 'bundle') {
        body.innerHTML = renderBundle(selection.id);
      } else if (selection.type === 'branch') {
        const branch = H.store.state.branches.find(function (b) { return b.id === selection.id; });
        body.innerHTML = branch ? renderBranch(branch) : emptyMessage();
      } else if (selection.type === 'pin') {
        body.innerHTML = renderPin(selection.id);
      } else {
        body.innerHTML = emptyMessage();
      }
      H.Inspector.renderSummary();
    },

    renderSummary() {
      const state = H.store.state;
      let total = 0;
      state.wires.forEach(function (wire) { total += Math.max(0, Number(wire.length) || 0); });
      state.branches.forEach(function (branch) { total += Math.max(0, Number(branch.length) || 0); });
      const cost = state.components.reduce(function (sum, comp) {
        const def = H.store.findDef(comp.defId);
        return sum + (def ? Number(def.cost) || 0 : 0);
      }, 0);
      const values = {
        components: String(state.components.length),
        wires: String(state.wires.length),
        branches: String(state.branches.length),
        length: U.formatNumber(total, 0) + ' mm',
        cost: U.formatMoney(cost)
      };
      Object.keys(values).forEach(function (key) {
        const el = U.$('[data-summary="' + key + '"]');
        if (el) el.textContent = values[key];
      });
    },

    refreshLive() {
      H.Inspector.renderSummary();
      H.Measure.redraw();
    }
  };
})(window.Harness);
