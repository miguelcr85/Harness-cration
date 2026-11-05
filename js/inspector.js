/* ============================================================
   inspector.js · Panel de propiedades y resumen
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
    return '<p class="muted">Selecciona un componente, un pin, un chicote, un empalme, un haz o una ramificación para ver sus propiedades.</p>' +
      '<p class="hint" style="margin-top:8px">Los elementos seleccionados se resaltan en el lienzo. Doble clic en un chicote agrega un punto de ruteo; en layout, doble clic sobre un haz, ramificación o empalme permite escribir su longitud manual.</p>';
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
    const wires = H.store.wiresOfComponent(comp.id);
    const taps = H.store.tapsOfComponent(comp.id);
    const totalLength = totalWiresLength(wires.concat(taps));
    return selectionHead('▣', def.name, (def.company || 'Sin fabricante') + ' · ' + pinCount + ' pines') +
      '<dl class="prop-list">' +
        row('Costo unitario', U.formatMoney(def.cost)) +
        row('Chicotes conectados', String(wires.length)) +
        row('Empalmes', String(taps.length)) +
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

  function pinParts(fullKey) {
    const found = H.store.findPin(fullKey);
    if (!found) return { comp: '—', pin: '—', value: '' };
    return {
      comp: found.compName,
      pin: found.pin.label,
      value: String(found.pin.description || '').trim()
    };
  }

  function renderWire(wire) {
    const from = pinParts(wire.fromPinId);
    const to = pinParts(wire.toPinId);
    const length = Math.max(0, Number(wire.length) || 0);
    return selectionHead('〜', from.comp + ' · ' + from.pin + ' → ' + to.comp + ' · ' + to.pin, 'Chicote individual') +
      '<dl class="prop-list">' +
        row('Componente origen', from.comp) +
        row('Pin origen', from.pin) +
        (from.value ? row('Valor pin origen', from.value) : '') +
        row('Componente destino', to.comp) +
        row('Pin destino', to.pin) +
        (to.value ? row('Valor pin destino', to.value) : '') +
        row('Empalmes', String(H.store.tapsOfWire(wire.id).length)) +
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
      '<p class="hint" style="margin-top:8px">Doble clic sobre el cable agrega un punto de control. Un pin libre puede soltarse sobre este cable para crear un empalme.</p>';
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
    const wireIds = wires.map(function (wire) { return wire.id; });
    const taps = H.store.state.taps.filter(function (tap) { return wireIds.indexOf(tap.wireId) !== -1; });
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
        row('Empalmes', String(taps.length)) +
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

  function renderTap(tap) {
    const found = H.store.findPin(tap.pinId);
    const wire = H.store.state.wires.find(function (w) { return w.id === tap.wireId; });
    const trunk = wire
      ? H.store.pinLabel(wire.fromPinId) + ' → ' + H.store.pinLabel(wire.toPinId)
      : 'Cable no disponible';
    const length = Math.max(0, Number(tap.length) || 0);
    const color = tap.color || (wire ? wire.color : '#475569') || '#475569';

    return selectionHead('⊤', (found ? found.compName + ' · pin ' + found.pin.label : 'Pin') + ' · empalme', 'Unión de un pin a un cable') +
      '<dl class="prop-list">' +
        row('Componente', found ? found.compName : '—') +
        row('Pin', found ? found.pin.label : '—') +
        (found && found.pin.description ? row('Valor del pin', found.pin.description) : '') +
        row('Cable destino', trunk) +
        row('Posición en el cable', Math.round((Number(tap.t) || 0) * 100) + '%') +
      '</dl>' +
      '<div class="color-row">' +
        '<input type="color" data-field="color" value="' + color + '" />' +
        '<span>Color del empalme</span>' +
      '</div>' +
      '<label class="field field--flush"><span>Longitud manual (mm)</span>' +
        '<input type="number" min="0" step="10" data-field="length" value="' + (length || '') + '" placeholder="Ej: 180" />' +
      '</label>' +
      '<p class="hint length-hint">También puedes hacer doble clic sobre el empalme en el lienzo.</p>' +
      '<div class="actions-row">' +
        (wire ? '<button class="btn btn--sm" type="button" data-action="select-wire" data-wire-id="' + wire.id + '">Ver cable</button>' : '') +
        '<button class="btn btn--sm btn--danger-ghost" type="button" data-action="delete-tap">Eliminar empalme</button>' +
      '</div>';
  }

  function renderPin(fullKey) {
    const found = H.store.findPin(fullKey);
    if (!found) return emptyMessage();
    const connection = H.store.connectionOfPin(fullKey);
    const wire = connection && connection.kind === 'wire' ? connection.wire : null;
    const tap = connection && connection.kind === 'tap' ? connection.tap : null;
    let other = '';
    if (wire) {
      other = H.store.pinLabel(wire.fromPinId === fullKey ? wire.toPinId : wire.fromPinId);
    } else if (tap) {
      const trunk = connection.wire;
      other = trunk
        ? 'Empalme sobre ' + H.store.pinLabel(trunk.fromPinId) + ' → ' + H.store.pinLabel(trunk.toPinId)
        : 'Empalme sobre un cable';
    }
    const actions = wire
      ? '<div class="actions-row">' +
          '<button class="btn btn--sm" type="button" data-action="select-wire" data-wire-id="' + wire.id + '">Ver chicote</button>' +
          '<button class="btn btn--sm btn--danger-ghost" type="button" data-action="delete-wire" data-wire-id="' + wire.id + '">Eliminar chicote</button>' +
        '</div>'
      : tap
        ? '<div class="actions-row">' +
            '<button class="btn btn--sm" type="button" data-action="select-tap" data-tap-id="' + tap.id + '">Ver empalme</button>' +
            '<button class="btn btn--sm btn--danger-ghost" type="button" data-action="delete-tap" data-tap-id="' + tap.id + '">Eliminar empalme</button>' +
          '</div>'
        : '<p class="hint" style="margin-top:8px">Pin libre: arrástralo hasta otro pin o suéltalo sobre un cable para crear un empalme.</p>';

    return selectionHead('⊙', found.compName + ' · pin ' + found.pin.label, found.pin.subgroupName || 'Pin') +
      '<dl class="prop-list">' +
        row('Componente', found.compName) +
        row('Subgrupo', found.pin.subgroupName || '—') +
        row('Valor del pin', found.pin.description || '—') +
        row('Estado', wire || tap ? 'Conectado' : 'Libre') +
        (wire ? row('Conectado a', other) + row('Longitud manual', manualLength(wire.length)) : '') +
        (tap ? row('Conectado a', other) + row('Longitud manual del empalme', manualLength(tap.length)) : '') +
        (tap ? row('Posición en el cable', Math.round((Number(tap.t) || 0) * 100) + '%') : '') +
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
        } else if (action === 'select-tap') {
          if (btn.dataset.tapId) H.store.select('tap', btn.dataset.tapId);
        } else if (action === 'delete-tap') {
          const tapId = btn.dataset.tapId || (selection.type === 'tap' ? selection.id : null);
          if (tapId && H.store.removeTap(tapId)) H.App.toast('Empalme eliminado.', 'ok');
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
        } else if (selection.type === 'tap') {
          H.store.updateTap(selection.id, { color: e.target.value }, 'geometry');
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
          } else if (selection.type === 'tap') {
            H.store.updateTap(selection.id, { length: value });
            H.App.toast('Longitud manual del empalme actualizada.', 'ok', 1800);
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
      } else if (selection.type === 'tap') {
        const tap = H.store.findTap(selection.id);
        body.innerHTML = tap ? renderTap(tap) : emptyMessage();
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
      state.taps.forEach(function (tap) { total += Math.max(0, Number(tap.length) || 0); });
      const cost = state.components.reduce(function (sum, comp) {
        const def = H.store.findDef(comp.defId);
        return sum + (def ? Number(def.cost) || 0 : 0);
      }, 0);
      const values = {
        components: String(state.components.length),
        wires: String(state.wires.length),
        branches: String(state.branches.length),
        taps: String(state.taps.length),
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
    }
  };
})(window.Harness);
