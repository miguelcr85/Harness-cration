/* ============================================================
   measure.js · Medición de distancia entre elementos
   ============================================================ */
(function (H) {
  'use strict';

  const U = H.Utils;
  let active = false;
  let pointA = null;
  let pointB = null;
  let overlay = null;

  function els() {
    return {
      badge: U.$('#measureBadge'),
      input: U.$('#distanceValue'),
      hint: U.$('#measureHint'),
      btn: U.$('#btnMeasure'),
      scale: U.$('#scaleInput')
    };
  }

  function stageScale() {
    const stage = H.App && H.App.stage;
    return stage ? stage.scaleX() || 1 : 1;
  }

  function worldOf(node, offset) {
    const stage = H.App.stage;
    const abs = node.getAbsolutePosition();
    const scale = stage.scaleX() || 1;
    const pos = { x: (abs.x - stage.x()) / scale, y: (abs.y - stage.y()) / scale };
    if (offset) { pos.x += offset.x; pos.y += offset.y; }
    return pos;
  }

  function resolve(ref) {
    if (!ref) return null;
    const registry = H.registry;
    if (ref.kind === 'card') {
      const node = registry.cards.get(ref.id);
      if (!node || !node.getStage()) return { pos: ref.fallback, label: ref.label };
      const size = node.getAttr('cardSize') || { width: 0, height: 0 };
      return { pos: worldOf(node, { x: size.width / 2, y: size.height / 2 }), label: ref.label };
    }
    if (ref.kind === 'pin') {
      const node = registry.pins.get(ref.id);
      if (!node || !node.getStage()) return { pos: ref.fallback, label: ref.label };
      return { pos: worldOf(node, null), label: ref.label };
    }
    return { pos: ref.fallback, label: ref.label };
  }

  function mmPerPx() {
    const value = Number(H.store.state.settings.mmPerPx);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function formatDistance(px, mm) {
    return U.formatNumber(px) + ' px · ' + U.formatNumber(mm, 1) + ' mm';
  }

  function drawOverlay(a, b) {
    if (!overlay) return;
    overlay.destroyChildren();
    if (!a || !b) { overlay.batchDraw(); return; }
    const scale = stageScale();
    const mid = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 };

    const line = new Konva.Line({
      points: [a.pos.x, a.pos.y, b.pos.x, b.pos.y],
      stroke: '#f97316',
      strokeWidth: 2 / scale,
      dash: [8 / scale, 6 / scale],
      lineCap: 'round',
      name: 'measure'
    });
    overlay.add(line);

    [a.pos, b.pos].forEach(function (pt) {
      overlay.add(new Konva.Circle({
        x: pt.x, y: pt.y, radius: 5 / scale,
        fill: '#fff9f0', stroke: '#f97316', strokeWidth: 2 / scale, name: 'measure'
      }));
    });

    const px = U.dist(a.pos, b.pos);
    const mm = px * mmPerPx();
    const label = new Konva.Label({ x: mid.x, y: mid.y, name: 'measure' });
    label.add(new Konva.Tag({
      fill: '#0f172a', cornerRadius: 5 / scale, opacity: 0.94,
      pointerDirection: 'down', pointerWidth: 6 / scale, pointerHeight: 4 / scale
    }));
    const textNode = new Konva.Text({
      text: formatDistance(px, mm),
      fontSize: 12 / scale,
      padding: 6 / scale,
      fontFamily: 'Segoe UI, Arial',
      fontStyle: 'bold',
      fill: '#fde68a'
    });
    label.add(textNode);
    label.y(mid.y - 6 / scale);
    label.offsetX(textNode.width() / 2);
    overlay.add(label);
    overlay.batchDraw();
  }

  function updateReadout() {
    const e = els();
    if (!pointA || !pointB) {
      if (e.input) e.input.value = '—';
      return;
    }
    const a = resolve(pointA);
    const b = resolve(pointB);
    if (!a || !b) return;
    const px = U.dist(a.pos, b.pos);
    if (e.input) e.input.value = formatDistance(px, px * mmPerPx());
    if (e.hint) e.hint.textContent = a.label + ' ↔ ' + b.label + ' · ' + U.formatNumber(px * mmPerPx(), 1) + ' mm';
    drawOverlay(a, b);
  }

  const Measure = {
    init() {
      overlay = H.App.layers.overlay;
      const e = els();
      if (e.btn) e.btn.addEventListener('click', function () { Measure.setActive(!active); });
      const stop = U.$('#btnMeasureStop');
      if (stop) stop.addEventListener('click', function () { Measure.setActive(false); });
      const clearBtn = U.$('#btnMeasureClear');
      if (clearBtn) clearBtn.addEventListener('click', function () { Measure.clear(); });
      if (e.scale) {
        e.scale.value = String(mmPerPx());
        e.scale.addEventListener('change', function () {
          const value = Number(e.scale.value);
          if (!Number.isFinite(value) || value <= 0) { e.scale.value = String(mmPerPx()); return; }
          H.store.setSettings({ mmPerPx: value });
          updateReadout();
        });
      }
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && active) Measure.setActive(false);
      });
    },

    isActive() { return active; },

    setActive(value) {
      active = !!value;
      const e = els();
      if (e.badge) e.badge.hidden = !active;
      if (e.btn) e.btn.textContent = active ? 'Cancelar medición' : 'Medir (2 clics)';
      if (e.hint) {
        e.hint.textContent = active
          ? 'Haz clic en el primer elemento a medir.'
          : 'Haz clic en dos pines o en dos tarjetas para medir.';
      }
      if (active) {
        pointA = null;
        pointB = null;
        if (overlay) { overlay.destroyChildren(); overlay.batchDraw(); }
      } else {
        updateReadout();
      }
    },

    /** Llamado por las vistas cuando el usuario hace clic sobre un elemento. */
    pick(ref) {
      if (!active || !ref) return;
      const e = els();
      if (!pointA) {
        pointA = ref;
        pointB = null;
        if (e.hint) e.hint.textContent = 'Primer punto: ' + ref.label + '. Elige el segundo.';
        const a = resolve(pointA);
        drawOverlay(a, { pos: a.pos });
        return;
      }
      if (pointA.kind === ref.kind && pointA.id === ref.id) {
        pointA = null;
        pointB = null;
        if (e.hint) e.hint.textContent = 'Medición reiniciada. Elige el primer elemento.';
        if (overlay) { overlay.destroyChildren(); overlay.batchDraw(); }
        return;
      }
      pointB = ref;
      updateReadout();
    },

    redraw() {
      if (pointA && pointB) updateReadout();
      else if (overlay) overlay.batchDraw();
    },

    clear() {
      pointA = null;
      pointB = null;
      const e = els();
      if (e.input) e.input.value = '—';
      if (e.hint) {
        e.hint.textContent = active
          ? 'Haz clic en el primer elemento a medir.'
          : 'Haz clic en dos pines o en dos tarjetas para medir.';
      }
      if (overlay) { overlay.destroyChildren(); overlay.batchDraw(); }
    },

    /** Distancia actual en px/mm. */
    value() {
      if (!pointA || !pointB) return null;
      const a = resolve(pointA);
      const b = resolve(pointB);
      if (!a || !b) return null;
      const px = U.dist(a.pos, b.pos);
      return { px: px, mm: px * mmPerPx(), text: formatDistance(px, px * mmPerPx()) };
    },

    worldOf: worldOf,
    stageScale: stageScale
  };

  H.Measure = Measure;
})(window.Harness);
