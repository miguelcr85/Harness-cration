/* ============================================================
   schema-view.js · Vista esquema (componentes, pines y chicotes)
   ============================================================ */
(function (H) {
  'use strict';

  const U = H.Utils;
  const PIN_R = 8;
  const CELL_W = 28;
  const CELL_H = 26;
  const IMAGE_H = 86;
  const FONT = 'Segoe UI, Arial, sans-serif';

  let stage = null;
  let compLayer = null;
  let wireLayer = null;
  let overlay = null;

  const metricsMap = new Map();   // compId -> métricas del card
  const compNodes = new Map();    // compId -> Konva.Group
  const wireNodes = new Map();    // wireId -> Konva.Line
  const tapNodes = new Map();     // tapId -> { line, marker, glow, tag }
  let connecting = null;          // { fromKey, from, line }

  function screenToWorld(pos) {
    const scale = stage.scaleX() || 1;
    return { x: (pos.x - stage.x()) / scale, y: (pos.y - stage.y()) / scale };
  }

  function cardMetrics(def) {
    const subgroups = def.subgroups || [];
    const maxCols = Math.max.apply(null, [1].concat(subgroups.map(function (sg) { return sg.cols; })));
    const nameLen = Math.max(String(def.name || '').length * 7.6, String(def.company || '').length * 6.2);
    const width = Math.round(Math.max(232, 44 + maxCols * CELL_W, Math.min(380, nameLen + 40)));
    let y = 14;
    const nameY = y; y += 18;
    const companyY = y; y += 15;
    const imageY = y; y += IMAGE_H + 12;
    const groups = [];
    subgroups.forEach(function (sg) {
      const headerY = y; y += 16;
      const gridY = y;
      const pins = (sg.pins || []).map(function (pin) {
        return {
          id: pin.id,
          label: pin.label,
          row: pin.row,
          col: pin.col,
          description: pin.description || '',
          x: 22 + (pin.col - 1) * CELL_W + CELL_W / 2,
          y: gridY + (pin.row - 1) * CELL_H + CELL_H / 2
        };
      });
      y += (sg.rows || 1) * CELL_H;
      groups.push({ sg: sg, headerY: headerY, pins: pins });
      y += 10;
    });
    const height = Math.round(y + 8);
    const pinMap = new Map();
    groups.forEach(function (group) {
      group.pins.forEach(function (pin) { pinMap.set(pin.id, pin); });
    });
    return {
      width: width, height: height, nameY: nameY, companyY: companyY,
      imageY: imageY, imageHeight: IMAGE_H, groups: groups, pinMap: pinMap
    };
  }

  function pinPos(fullKey) {
    const ref = H.store.splitKey(fullKey);
    if (!ref) return null;
    const comp = H.store.findComponent(ref.compId);
    const metrics = metricsMap.get(ref.compId);
    if (!comp || !metrics) return null;
    const pin = metrics.pinMap.get(ref.pinId);
    if (!pin) return null;
    return { x: comp.x + pin.x, y: comp.y + pin.y };
  }

  function autoLaneOffset(wire) {
    const a = H.store.splitKey(wire.fromPinId);
    const b = H.store.splitKey(wire.toPinId);
    if (!a || !b) return 0;
    const key = H.store.bundleKey(a.compId, b.compId);
    const siblings = H.store.state.wires.filter(function (other) {
      if (Array.isArray(other.points) && other.points.length) return false;
      const x = H.store.splitKey(other.fromPinId);
      const y = H.store.splitKey(other.toPinId);
      return x && y && H.store.bundleKey(x.compId, y.compId) === key;
    });
    if (siblings.length < 2) return 0;
    const index = siblings.findIndex(function (other) { return other.id === wire.id; });
    if (index < 0) return 0;
    return (index - (siblings.length - 1) / 2) * 9;
  }

  function wirePath(wire) {
    const start = pinPos(wire.fromPinId);
    const end = pinPos(wire.toPinId);
    if (!start || !end) return null;
    let interior = [];
    if (Array.isArray(wire.points) && wire.points.length) {
      interior = wire.points.map(function (pt) { return { x: pt.x, y: pt.y }; });
    } else {
      interior = U.autoRoutePoints(start, end);
      const offset = autoLaneOffset(wire);
      if (offset) {
        if (interior.length === 2) {
          const horizontalFirst = Math.abs(interior[0].y - start.y) < 0.5;
          interior.forEach(function (pt) {
            if (horizontalFirst) pt.x += offset;
            else pt.y += offset;
          });
        } else {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 20) {
            const dir = dx >= 0 ? 1 : -1;
            interior = [
              { x: start.x + dir * 18, y: start.y + offset },
              { x: end.x - dir * 18, y: end.y + offset }
            ];
          } else if (Math.abs(dy) > 20) {
            const dir = dy >= 0 ? 1 : -1;
            interior = [
              { x: start.x + offset, y: start.y + dir * 18 },
              { x: end.x + offset, y: end.y - dir * 18 }
            ];
          }
        }
      }
    }
    return [start].concat(interior, [end]);
  }

  /** Punto donde la línea pin→empalme sale de la tarjeta del componente. */
  function exitPointFromRect(rect, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let best = null;
    const test = function (t) {
      if (!(t > 0) || t > 1) return;
      const point = { x: from.x + dx * t, y: from.y + dy * t };
      const insideX = point.x >= rect.x - 0.01 && point.x <= rect.x + rect.width + 0.01;
      const insideY = point.y >= rect.y - 0.01 && point.y <= rect.y + rect.height + 0.01;
      if (insideX && insideY && (!best || t < best.t)) best = { t: t, point: point };
    };
    if (dx !== 0) {
      test((rect.x - from.x) / dx);
      test((rect.x + rect.width - from.x) / dx);
    }
    if (dy !== 0) {
      test((rect.y - from.y) / dy);
      test((rect.y + rect.height - from.y) / dy);
    }
    return best ? best.point : null;
  }

  /** Punto del cable donde se une el pin y el recorrido del empalme. */
  function tapPath(tap) {
    const wire = H.store.state.wires.find(function (w) { return w.id === tap.wireId; });
    const pinRef = H.store.splitKey(tap.pinId);
    const comp = pinRef ? H.store.findComponent(pinRef.compId) : null;
    const metrics = pinRef ? metricsMap.get(pinRef.compId) : null;
    const pin = pinPos(tap.pinId);
    const path = wire ? wirePath(wire) : null;
    if (!path || !pin) return null;
    const junction = U.pointAt(path, tap.t);
    let start = pin;
    if (comp && metrics) {
      const rect = { x: comp.x, y: comp.y, width: metrics.width, height: metrics.height };
      start = exitPointFromRect(rect, pin, junction) || pin;
    }
    return { wire: wire, pin: pin, start: start, junction: junction, points: [start, junction] };
  }

  function flatPoints(points) {
    const flat = [];
    points.forEach(function (pt) { flat.push(pt.x, pt.y); });
    return flat;
  }

  function pointSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return U.dist(p, a);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = U.clamp(t, 0, 1);
    return U.dist(p, { x: a.x + t * dx, y: a.y + t * dy });
  }

  /** Objetivo bajo el puntero: un pin o un cable existente. */
  function hitTargetAt(pointer) {
    if (!pointer) return null;
    let node = stage.getIntersection(pointer);
    while (node) {
      if (node.hasName && node.hasName('pin')) {
        const pinKey = node.getAttr('pinKey');
        if (pinKey) return { kind: 'pin', pinKey: pinKey };
      }
      if (node.hasName && node.hasName('wire')) {
        const wireId = node.getAttr('wireId');
        if (wireId) return { kind: 'wire', wireId: wireId };
      }
      node = node.getParent();
    }
    return null;
  }

  function wireTapCandidate(pointer) {
    if (!pointer) return null;
    const hit = hitTargetAt(pointer);
    if (!hit || hit.kind !== 'wire') return null;
    const wire = H.store.state.wires.find(function (w) { return w.id === hit.wireId; });
    const path = wire ? wirePath(wire) : null;
    const world = screenToWorld(pointer);
    const near = path ? H.Hit.nearestPointOnPolyline(world, path) : null;
    if (!wire || !near) return null;
    return { wire: wire, near: near };
  }

  H.Schema = {
    mount(ctx) {
      stage = ctx.stage;
      compLayer = ctx.schemaLayer;
      wireLayer = ctx.schemaWireLayer;
      overlay = ctx.overlayLayer;

      stage.on('mousemove touchmove', function () {
        if (connecting) H.Schema.updateConnect();
      });
      stage.on('mouseup touchend', function () {
        if (connecting) H.Schema.finishConnect();
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && connecting) H.Schema.cancelConnect();
      });
    },

    screenToWorld: screenToWorld,
    pinPos: pinPos,
    tapPath: tapPath,

    showPinTooltip(event, pin, def) {
      const tip = U.$('#pinTooltip');
      if (!tip) return;
      const description = String(pin.description || '');
      if (!description) { tip.hidden = true; return; }
      tip.textContent = 'Pin ' + pin.label + '\n' + description;
      const workspace = U.$('#workspace');
      const rect = workspace ? workspace.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const evt = event && event.evt;
      let left = 24;
      let top = 24;
      if (evt && Number.isFinite(evt.clientX)) {
        left = evt.clientX - rect.left + 14;
        top = evt.clientY - rect.top + 16;
      }
      tip.style.left = Math.max(8, Math.min(rect.width - 210, left)) + 'px';
      tip.style.top = Math.max(8, Math.min(rect.height - 64, top)) + 'px';
      tip.hidden = false;
    },

    hidePinTooltip() {
      const tip = U.$('#pinTooltip');
      if (tip) tip.hidden = true;
    },

    render() {
      H.Schema.hidePinTooltip();
      compLayer.destroyChildren();
      wireLayer.destroyChildren();
      H.Hit.clearLayer(compLayer);
      H.Hit.clearLayer(wireLayer);
      metricsMap.clear();
      compNodes.clear();
      wireNodes.clear();
      tapNodes.clear();

      H.store.state.components.forEach(function (comp) { H.Schema.buildComponent(comp); });
      H.store.state.wires.forEach(function (wire) { H.Schema.drawWire(wire); });
      H.store.state.taps.forEach(function (tap) { H.Schema.drawTap(tap); });

      const selection = H.store.state.selection;
      if (selection.type === 'wire') {
        const selectedLine = wireNodes.get(selection.id);
        if (selectedLine) selectedLine.moveToTop();
        const handles = wireLayer.findOne('.wire-handles');
        if (handles) handles.moveToTop();
      } else if (selection.type === 'tap') {
        const selectedTap = tapNodes.get(selection.id);
        if (selectedTap && selectedTap.line) selectedTap.line.moveToTop();
        if (selectedTap && selectedTap.marker) selectedTap.marker.moveToTop();
        if (selectedTap && selectedTap.tag) selectedTap.tag.moveToTop();
      }

      compLayer.batchDraw();
      wireLayer.batchDraw();
    },

    buildComponent(comp) {
      const data = H.store.compData(comp);
      if (!data) return;
      const def = data.def;
      const m = cardMetrics(def);
      metricsMap.set(comp.id, m);

      const selection = H.store.state.selection;
      const isSelected = selection.type === 'component' && selection.id === comp.id;
      const accent = 'hsl(' + U.hashHue(def.id) + ', 68%, 48%)';

      const group = new Konva.Group({ x: comp.x, y: comp.y, draggable: true, name: 'component' });
      group.setAttr('compId', comp.id);
      group.setAttr('cardSize', { width: m.width, height: m.height });

      const card = new Konva.Rect({
        width: m.width,
        height: m.height,
        fill: '#ffffff',
        stroke: isSelected ? '#2563eb' : '#dbe3ee',
        strokeWidth: isSelected ? 2.5 : 1,
        cornerRadius: 12,
        shadowColor: isSelected ? '#2563eb' : '#0f172a',
        shadowBlur: isSelected ? 22 : 12,
        shadowOpacity: isSelected ? 0.28 : 0.08,
        shadowOffsetY: 5,
        name: 'card-bg'
      });
      group.add(card);

      if (isSelected) {
        group.add(new Konva.Rect({
          x: -6, y: -6, width: m.width + 12, height: m.height + 12,
          stroke: '#2563eb', strokeWidth: 1.5, dash: [7, 5],
          cornerRadius: 16, listening: false
        }));
      }

      H.Hit.register(compLayer, card, function (point) {
        return H.Hit.pointInRect(point, comp.x, comp.y, m.width, m.height);
      });

      group.add(new Konva.Rect({
        width: m.width,
        height: 4,
        fill: accent,
        cornerRadius: [12, 12, 0, 0],
        listening: false
      }));

      group.add(new Konva.Text({
        text: def.name,
        x: 14,
        y: m.nameY,
        width: m.width - 28,
        fontFamily: FONT,
        fontSize: 13,
        fontStyle: 'bold',
        fill: '#0f172a',
        ellipsis: true,
        wrap: 'none',
        listening: false
      }));

      group.add(new Konva.Text({
        text: def.company || 'Sin fabricante',
        x: 14,
        y: m.companyY,
        width: m.width - 116,
        fontFamily: FONT,
        fontSize: 10.5,
        fill: '#64748b',
        ellipsis: true,
        wrap: 'none',
        listening: false
      }));

      group.add(new Konva.Text({
        text: U.formatMoney(def.cost),
        x: m.width - 112,
        y: m.companyY,
        width: 98,
        align: 'right',
        fontFamily: FONT,
        fontSize: 10.5,
        fontStyle: 'bold',
        fill: '#0f766e',
        listening: false
      }));

      H.Schema.buildPhoto(def, m, group);
      H.Schema.buildPins(comp, def, m, group);

      group.on('mouseenter', function () {
        if (stage) stage.container().style.cursor = 'pointer';
        card.stroke('#93c5fd');
        card.strokeWidth(isSelected ? 2.5 : 1.8);
        compLayer.batchDraw();
      });
      group.on('mouseleave', function () {
        if (stage) stage.container().style.cursor = '';
        card.stroke(isSelected ? '#2563eb' : '#dbe3ee');
        card.strokeWidth(isSelected ? 2.5 : 1);
        compLayer.batchDraw();
      });
      group.on('dragmove', function () {
        comp.x = Math.round(group.x());
        comp.y = Math.round(group.y());
        H.Schema.refreshWires();
      });
      group.on('dragend', function () {
        H.store.moveComponent(comp.id, group.x(), group.y(), 'schema');
        H.store.commit('geometry');
      });
      group.on('click tap', function (e) {
        if (e.target.hasName('pin')) return;
        H.store.select('component', comp.id);
      });
      group.on('dblclick dbltap', function (e) {
        e.cancelBubble = true;
        H.ComponentModal.open(comp.defId);
      });

      compLayer.add(group);
      compNodes.set(comp.id, group);
    },

    buildPhoto(def, m, group) {
      const padX = 14;
      const imgW = m.width - padX * 2;

      if (!def.image) {
        group.add(new Konva.Rect({
          x: padX, y: m.imageY, width: imgW, height: m.imageHeight,
          fill: '#f1f5f9', stroke: '#e2e8f0', strokeWidth: 1, dash: [6, 4],
          cornerRadius: 8, listening: false
        }));
        group.add(new Konva.Text({
          text: U.initials(def.name), x: padX, y: m.imageY + m.imageHeight / 2 - 15,
          width: imgW, align: 'center', fontFamily: FONT, fontSize: 20,
          fontStyle: 'bold', fill: '#94a3b8', listening: false
        }));
        group.add(new Konva.Text({
          text: 'Sin foto', x: padX, y: m.imageY + m.imageHeight / 2 + 9,
          width: imgW, align: 'center', fontFamily: FONT, fontSize: 9.5,
          fill: '#cbd5e1', listening: false
        }));
        return;
      }

      const img = U.getImage(def.image);
      const wrapper = new Konva.Group({
        x: padX, y: m.imageY, listening: false,
        clipFunc: function (ctx) {
          U.roundRectPath(ctx, imgW, m.imageHeight, 8);
          ctx.closePath();
        }
      });

      if (U.isImageReady(img)) {
        const ratio = Math.max(imgW / img.naturalWidth, m.imageHeight / img.naturalHeight);
        const cropW = imgW / ratio;
        const cropH = m.imageHeight / ratio;
        wrapper.add(new Konva.Image({
          image: img,
          width: imgW,
          height: m.imageHeight,
          crop: {
            x: (img.naturalWidth - cropW) / 2,
            y: (img.naturalHeight - cropH) / 2,
            width: cropW,
            height: cropH
          },
          listening: false
        }));
      } else {
        wrapper.add(new Konva.Rect({ width: imgW, height: m.imageHeight, fill: '#eef2f7', listening: false }));
        wrapper.add(new Konva.Text({
          text: 'Cargando foto…', width: imgW, y: m.imageHeight / 2 - 6,
          align: 'center', fontFamily: FONT, fontSize: 10, fill: '#94a3b8', listening: false
        }));
        if (!img.__harnessHooked) {
          img.__harnessHooked = true;
          img.addEventListener('load', function () {
            if (H.App) H.App.refreshAll();
          });
        }
      }

      group.add(wrapper);
    },

    buildPins(comp, def, m, group) {
      m.groups.forEach(function (entry) {
        const sg = entry.sg;
        group.add(new Konva.Line({
          points: [14, entry.headerY - 5, m.width - 14, entry.headerY - 5],
          stroke: '#eef2f7', strokeWidth: 1, listening: false
        }));
        group.add(new Konva.Text({
          text: sg.name + '  ·  ' + sg.cols + '×' + sg.rows,
          x: 14, y: entry.headerY, fontFamily: FONT, fontSize: 9.5,
          fontStyle: 'bold', fill: '#94a3b8', listening: false
        }));

        entry.pins.forEach(function (pin) {
          const fullKey = H.store.pinKey(comp.id, pin.id);
          const connected = H.store.isPinConnected(fullKey);
          const selection = H.store.state.selection;
          const isSelected = selection.type === 'pin' && selection.id === fullKey;

          const pinGroup = new Konva.Group({ x: pin.x, y: pin.y, name: 'pin-group' });

          const hit = new Konva.Circle({
            radius: 12.5,
            fill: '#ffffff',
            strokeEnabled: false,
            name: 'pin'
          });
          hit.setAttr('pinKey', fullKey);
          pinGroup.add(hit);

          const ring = new Konva.Circle({
            radius: PIN_R + 4.5,
            stroke: isSelected ? '#2563eb' : '#93c5fd',
            strokeWidth: isSelected ? 2.5 : 2,
            visible: isSelected,
            listening: false
          });
          pinGroup.add(ring);

          const circle = new Konva.Circle({
            radius: PIN_R,
            fill: connected ? '#dcfce7' : '#ffffff',
            stroke: connected ? '#16a34a' : '#94a3b8',
            strokeWidth: 1.8,
            listening: false
          });
          pinGroup.add(circle);

          const label = new Konva.Text({
            text: pin.label, x: -14, y: -4, width: 28, align: 'center',
            fontFamily: FONT, fontSize: 8, fontStyle: 'bold',
            fill: isSelected ? '#1d4ed8' : (connected ? '#15803d' : '#475569'),
            listening: false, wrap: 'none'
          });
          pinGroup.add(label);

          const description = String(pin.description || '');
          if (description) {
            pinGroup.add(new Konva.Text({
              text: description, x: -15, y: 9, width: 30, align: 'center',
              fontFamily: FONT, fontSize: 6.5, fill: '#94a3b8',
              ellipsis: true, wrap: 'none', listening: false
            }));
          }

          group.add(pinGroup);

          H.Hit.register(compLayer, hit, function (point) {
            const pos = pinPos(fullKey);
            return pos ? Math.hypot(point.x - pos.x, point.y - pos.y) <= 13 : false;
          });

          hit.on('mouseenter', function (e) {
            circle.stroke('#2563eb');
            if (!isSelected) {
              ring.visible(true);
              ring.stroke('#93c5fd');
            }
            label.fill('#1d4ed8');
            if (stage) stage.container().style.cursor = 'pointer';
            H.Schema.showPinTooltip(e, pin, def, connected);
            pinGroup.getLayer().batchDraw();
          });
          hit.on('mouseleave', function () {
            circle.stroke(connected ? '#16a34a' : '#94a3b8');
            ring.visible(isSelected);
            ring.stroke(isSelected ? '#2563eb' : '#93c5fd');
            label.fill(isSelected ? '#1d4ed8' : (connected ? '#15803d' : '#475569'));
            if (stage) stage.container().style.cursor = '';
            H.Schema.hidePinTooltip();
            pinGroup.getLayer().batchDraw();
          });
          hit.on('mousedown touchstart', function (e) {
            e.cancelBubble = true;
            H.Schema.startConnect(fullKey);
          });
          hit.on('click tap', function (e) {
            e.cancelBubble = true;
            H.store.select('pin', fullKey);
          });
        });
      });
    },

    drawWire(wire) {
      const pts = wirePath(wire);
      if (!pts) return;
      const selection = H.store.state.selection;
      const isSelected = selection.type === 'wire' && selection.id === wire.id;
      const manual = Math.max(0, Number(wire.length) || 0);

      if (isSelected) {
        wireLayer.add(new Konva.Line({
          points: flatPoints(pts),
          stroke: '#bfdbfe',
          strokeWidth: 14,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.85,
          listening: false
        }));
      }

      const line = new Konva.Line({
        points: flatPoints(pts),
        stroke: wire.color || '#334155',
        strokeWidth: isSelected ? 4 : 2.5,
        lineCap: 'round',
        lineJoin: 'round',
        hitStrokeWidth: 18,
        name: 'wire',
        tension: 0
      });
      line.setAttr('wireId', wire.id);

      line.on('mouseenter', function () {
        if (stage) stage.container().style.cursor = 'pointer';
        line.strokeWidth((isSelected ? 4 : 2.5) + 1.5);
        wireLayer.batchDraw();
      });
      line.on('mouseleave', function () {
        if (stage) stage.container().style.cursor = '';
        line.strokeWidth(isSelected ? 4 : 2.5);
        wireLayer.batchDraw();
      });
      line.on('click tap', function (e) {
        e.cancelBubble = true;
        H.store.select('wire', wire.id);
      });
      line.on('dblclick dbltap', function (e) {
        e.cancelBubble = true;
        const pointer = stage.getPointerPosition();
        if (pointer) H.Schema.addBend(wire, screenToWorld(pointer));
      });

      wireLayer.add(line);
      wireNodes.set(wire.id, line);

      H.Hit.register(wireLayer, line, function (point) {
        const current = H.store.state.wires.find(function (w) { return w.id === wire.id; });
        const path = current ? wirePath(current) : pts;
        return path ? H.Hit.distanceToPolyline(point, path) <= H.Hit.threshold(9) : false;
      });

      if (isSelected && manual > 0) {
        const mid = U.pointAt(pts, 0.5);
        const tag = new Konva.Label({ x: mid.x, y: mid.y - 12, listening: false });
        tag.add(new Konva.Tag({
          fill: '#1d4ed8', cornerRadius: 4,
          pointerDirection: 'down', pointerWidth: 6, pointerHeight: 4
        }));
        const tagText = new Konva.Text({
          text: U.formatNumber(manual, 0) + ' mm',
          fontSize: 9.5, padding: 4, fontFamily: FONT,
          fontStyle: 'bold', fill: '#ffffff'
        });
        tag.add(tagText);
        tag.offsetX(tagText.width() / 2 + 4);
        wireLayer.add(tag);
      }

      if (isSelected) H.Schema.drawHandles(wire, pts, line);
    },

    drawTap(tap) {
      const geo = tapPath(tap);
      if (!geo) return;
      const selection = H.store.state.selection;
      const isSelected = selection.type === 'tap' && selection.id === tap.id;
      const color = tap.color || (geo.wire && geo.wire.color) || '#475569';
      const length = Math.max(0, Number(tap.length) || 0);
      const flat = flatPoints(geo.points);

      let glow = null;
      if (isSelected) {
        glow = new Konva.Line({
          points: flat,
          stroke: '#bfdbfe',
          strokeWidth: 12,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.85,
          listening: false
        });
        wireLayer.add(glow);
      }

      const line = new Konva.Line({
        points: flat,
        stroke: color,
        strokeWidth: isSelected ? 4 : 2.5,
        lineCap: 'round',
        lineJoin: 'round',
        hitStrokeWidth: 18,
        name: 'tap'
      });
      line.setAttr('tapId', tap.id);

      line.on('mouseenter', function () {
        if (stage) stage.container().style.cursor = 'pointer';
        line.strokeWidth((isSelected ? 4 : 2.5) + 1.5);
        wireLayer.batchDraw();
      });
      line.on('mouseleave', function () {
        if (stage) stage.container().style.cursor = '';
        line.strokeWidth(isSelected ? 4 : 2.5);
        wireLayer.batchDraw();
      });
      line.on('click tap', function (e) {
        e.cancelBubble = true;
        H.store.select('tap', tap.id);
      });
      line.on('dblclick dbltap', function (e) {
        e.cancelBubble = true;
        H.Schema.promptTapLength(tap);
      });
      wireLayer.add(line);

      H.Hit.register(wireLayer, line, function (point) {
        const current = H.store.findTap(tap.id);
        const path = current ? tapPath(current) : null;
        return path ? H.Hit.distanceToPolyline(point, path.points) <= H.Hit.threshold(8) : false;
      });

      const marker = new Konva.Circle({
        x: geo.junction.x,
        y: geo.junction.y,
        radius: 4.5,
        fill: color,
        stroke: '#ffffff',
        strokeWidth: 1.6,
        listening: false
      });
      wireLayer.add(marker);

      let tag = null;
      if (isSelected && length > 0) {
        const mid = U.pointAt(geo.points, 0.5);
        tag = new Konva.Label({ x: mid.x, y: mid.y - 10, listening: false });
        tag.add(new Konva.Tag({
          fill: '#1d4ed8', cornerRadius: 4,
          pointerDirection: 'down', pointerWidth: 6, pointerHeight: 4
        }));
        const tagText = new Konva.Text({
          text: U.formatNumber(length, 0) + ' mm',
          fontSize: 9.5, padding: 4, fontFamily: FONT,
          fontStyle: 'bold', fill: '#ffffff'
        });
        tag.add(tagText);
        tag.offsetX(tagText.width() / 2 + 4);
        wireLayer.add(tag);
      }

      tapNodes.set(tap.id, { line: line, marker: marker, glow: glow, tag: tag });
    },

    promptTapLength(tap) {
      if (!tap) return;
      const current = Math.max(0, Number(tap.length) || 0);
      const answer = window.prompt(
        'Longitud manual del empalme (mm):\n' +
        'Es un valor representativo, no se calcula del lienzo.',
        current ? String(current) : ''
      );
      if (answer === null) return;
      const value = Math.max(0, Math.round(Number(String(answer).replace(',', '.')) || 0));
      H.store.updateTap(tap.id, { length: value });
      H.App.toast('Longitud manual del empalme actualizada.', 'ok');
    },

    drawHandles(wire, pts, line) {
      const handles = new Konva.Group({ name: 'wire-handles' });
      pts.slice(1, -1).forEach(function (pt, index) {
        const handle = new Konva.Circle({
          x: pt.x, y: pt.y, radius: 5.5,
          fill: '#ffffff', stroke: '#2563eb', strokeWidth: 2,
          draggable: true, name: 'handle'
        });

        handle.on('dragstart', function () {
          if (!Array.isArray(wire.points) || !wire.points.length) {
            const current = wirePath(wire);
            wire.points = current
              ? current.slice(1, -1).map(function (pt) { return { x: pt.x, y: pt.y }; })
              : [];
          }
        });
        handle.on('dragmove', function () {
          wire.points[index] = { x: handle.x(), y: handle.y() };
          const next = wirePath(wire);
          if (next) line.points(flatPoints(next));
          wireLayer.batchDraw();
        });
        handle.on('dragend', function () {
          H.store.commit('geometry');
        });
        handle.on('dblclick dbltap', function (e) {
          e.cancelBubble = true;
          wire.points.splice(index, 1);
          H.store.commit('all');
        });
        handles.add(handle);

        H.Hit.register(wireLayer, handle, function (point) {
          return Math.hypot(point.x - handle.x(), point.y - handle.y()) <= H.Hit.threshold(9);
        }, 1);
      });
      wireLayer.add(handles);
    },

    addBend(wire, worldPos) {
      if (!Array.isArray(wire.points) || !wire.points.length) {
        const current = wirePath(wire);
        wire.points = current
          ? current.slice(1, -1).map(function (pt) { return { x: pt.x, y: pt.y }; })
          : [];
      }
      const pts = wirePath(wire);
      if (!pts) return;
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let i = 1; i < pts.length; i++) {
        const d = pointSegmentDistance(worldPos, pts[i - 1], pts[i]);
        if (d < bestDist) { bestDist = d; bestIndex = i; }
      }
      wire.points.splice(Math.max(0, bestIndex - 1), 0, { x: worldPos.x, y: worldPos.y });
      H.store.commit('all');
      H.App.toast('Punto de control agregado. Arrástralo para ajustar el ruteo.', 'ok', 2600);
    },

    refreshWires() {
      wireNodes.forEach(function (line, wireId) {
        const wire = H.store.state.wires.find(function (w) { return w.id === wireId; });
        if (!wire) return;
        const pts = wirePath(wire);
        if (pts) line.points(flatPoints(pts));
      });
      tapNodes.forEach(function (entry, tapId) {
        const tap = H.store.findTap(tapId);
        const geo = tap ? tapPath(tap) : null;
        if (!geo) return;
        const flat = flatPoints(geo.points);
        entry.line.points(flat);
        if (entry.glow) entry.glow.points(flat);
        entry.marker.position(geo.junction);
        if (entry.tag) {
          const mid = U.pointAt(geo.points, 0.5);
          entry.tag.position({ x: mid.x, y: mid.y - 10 });
        }
      });
      const selection = H.store.state.selection;
      if (selection.type === 'wire') {
        const wire = H.store.state.wires.find(function (w) { return w.id === selection.id; });
        const pts = wire ? wirePath(wire) : null;
        const handles = wireLayer.find('.handle');
        if (pts) {
          pts.slice(1, -1).forEach(function (pt, index) {
            if (handles[index]) handles[index].position(pt);
          });
        }
      }
      wireLayer.batchDraw();
    },

    applyStyles() {
      wireNodes.forEach(function (line, wireId) {
        const wire = H.store.state.wires.find(function (w) { return w.id === wireId; });
        if (wire) line.stroke(wire.color || '#334155');
      });
      tapNodes.forEach(function (entry, tapId) {
        const tap = H.store.findTap(tapId);
        if (!tap) return;
        const color = tap.color || '#475569';
        entry.line.stroke(color);
        entry.marker.fill(color);
      });
      wireLayer.batchDraw();
    },

    startConnect(fullKey) {
      if (connecting) return;

      const ref = H.store.splitKey(fullKey);
      const cardNode = ref ? compNodes.get(ref.compId) : null;
      const wasDraggable = cardNode ? cardNode.draggable() : true;
      if (cardNode) cardNode.draggable(false);

      if (H.store.isPinConnected(fullKey)) {
        H.store.select('pin', fullKey);
        return;
      }
      const start = pinPos(fullKey);
      if (!start) {
        if (cardNode) cardNode.draggable(wasDraggable);
        return;
      }

      const line = new Konva.Line({
        points: [start.x, start.y, start.x, start.y],
        stroke: '#2563eb', strokeWidth: 2.5, dash: [9, 7],
        lineCap: 'round', listening: false, name: 'temp-wire'
      });
      overlay.add(line);
      connecting = {
        fromKey: fullKey,
        from: start,
        line: line,
        hover: null,
        moved: false,
        startPointer: stage.getPointerPosition(),
        cardNode: cardNode,
        wasDraggable: wasDraggable
      };
      if (stage) stage.container().style.cursor = 'crosshair';
      H.App.setHint('Arrastra hasta otro pin o suelta sobre un cable para empalmar · Esc para cancelar');
      overlay.batchDraw();
    },

    updateConnect() {
      if (!connecting) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      if (connecting.startPointer && !connecting.moved) {
        const dx = pointer.x - connecting.startPointer.x;
        const dy = pointer.y - connecting.startPointer.y;
        if (Math.sqrt(dx * dx + dy * dy) > 4) connecting.moved = true;
      }

      const world = screenToWorld(pointer);
      connecting.line.points([connecting.from.x, connecting.from.y, world.x, world.y]);

      if (connecting.hover) { connecting.hover.destroy(); connecting.hover = null; }
      const hit = hitTargetAt(pointer);
      const key = hit && hit.kind === 'pin' ? hit.pinKey : null;
      if (key && key !== connecting.fromKey) {
        const pos = pinPos(key);
        if (pos) {
          connecting.hover = new Konva.Circle({
            x: pos.x, y: pos.y, radius: PIN_R + 5,
            stroke: '#16a34a', strokeWidth: 2, dash: [3, 3], listening: false
          });
          overlay.add(connecting.hover);
        }
      } else if (hit && hit.kind === 'wire') {
        const candidate = wireTapCandidate(pointer);
        if (candidate) {
          connecting.hover = new Konva.Circle({
            x: candidate.near.x, y: candidate.near.y, radius: PIN_R + 3,
            stroke: '#16a34a', strokeWidth: 2, dash: [3, 3], listening: false
          });
          overlay.add(connecting.hover);
        }
      }
      overlay.batchDraw();
    },

    cancelConnect() {
      if (!connecting) return;
      if (connecting.line) connecting.line.destroy();
      if (connecting.hover) connecting.hover.destroy();
      if (connecting.cardNode) connecting.cardNode.draggable(connecting.wasDraggable !== false);
      connecting = null;
      if (stage) stage.container().style.cursor = '';
      overlay.batchDraw();
      H.App.setHint('');
    },

    finishConnect() {
      if (!connecting) return;
      const pointer = stage.getPointerPosition();
      const hit = pointer ? hitTargetAt(pointer) : null;
      const targetKey = hit && hit.kind === 'pin' ? hit.pinKey : null;
      const tapCandidate = hit && hit.kind === 'wire' ? wireTapCandidate(pointer) : null;
      const fromKey = connecting.fromKey;
      const moved = connecting.moved;
      H.Schema.cancelConnect();

      if (targetKey === fromKey) {
        if (!moved) H.store.select('pin', fromKey);
        return;
      }

      if (targetKey) {
        const result = H.store.addWire(fromKey, targetKey);
        if (result.error) H.App.toast(result.error, 'error', 4500);
        else H.App.toast('Chicote creado. Puedes escribir su longitud manual en Propiedades.', 'ok', 3200);
        return;
      }

      if (tapCandidate) {
        const result = H.store.addTap(fromKey, tapCandidate.wire.id, tapCandidate.near.t);
        if (result.error) {
          H.App.toast(result.error, 'error', 4500);
        } else {
          H.store.select('tap', result.tap.id);
          H.App.toast('Empalme creado sobre el cable. Asígnale longitud manual en Propiedades.', 'ok', 3800);
        }
        return;
      }

      if (!moved) H.store.select('pin', fromKey);
    },

    isConnecting() {
      return !!connecting;
    }
  };
})(window.Harness);
