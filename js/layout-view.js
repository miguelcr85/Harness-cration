/* ============================================================
   layout-view.js · Vista layout del arnés (haces y ramificaciones)
   ============================================================ */
(function (H) {
  'use strict';

  const U = H.Utils;
  const CARD_W = 178;
  const CARD_H = 126;
  const IMG_H = 72;
  const FONT = 'Segoe UI, Arial, sans-serif';

  let stage = null;
  let cardLayer = null;
  let wireLayer = null;
  let overlay = null;
  let midDrag = null;
  let redrawQueued = false;

  function layoutRect(comp) {
    return { x: Number(comp.layoutX) || 0, y: Number(comp.layoutY) || 0, width: CARD_W, height: CARD_H };
  }

  function ensurePositions() {
    H.store.state.components.forEach(function (comp, index) {
      if (!Number.isFinite(comp.layoutX) || !Number.isFinite(comp.layoutY)) {
        comp.layoutX = 120 + (index % 3) * 300;
        comp.layoutY = 130 + Math.floor(index / 3) * 210;
      }
    });
  }

  function computeBundles() {
    const map = new Map();
    H.store.state.wires.forEach(function (wire) {
      const a = H.store.splitKey(wire.fromPinId);
      const b = H.store.splitKey(wire.toPinId);
      if (!a || !b || a.compId === b.compId) return;
      if (!H.store.findComponent(a.compId) || !H.store.findComponent(b.compId)) return;
      const key = H.store.bundleKey(a.compId, b.compId);
      if (!map.has(key)) {
        map.set(key, { key: key, aCompId: a.compId, bCompId: b.compId, wires: [] });
      }
      map.get(key).wires.push(wire);
    });
    return Array.from(map.values());
  }

  function bundleGeometry(bundle) {
    const a = H.store.findComponent(bundle.aCompId);
    const b = H.store.findComponent(bundle.bCompId);
    if (!a || !b) return null;
    const ra = layoutRect(a);
    const rb = layoutRect(b);
    const ca = { x: ra.x + CARD_W / 2, y: ra.y + CARD_H / 2 };
    const cb = { x: rb.x + CARD_W / 2, y: rb.y + CARD_H / 2 };
    return {
      start: U.rectBorderPoint(ra, cb),
      end: U.rectBorderPoint(rb, ca),
      centerA: ca,
      centerB: cb
    };
  }

  function bundleColor(bundle) {
    const colors = bundle.wires.map(function (w) { return w.color || '#334155'; });
    const first = colors[0];
    const allSame = colors.every(function (c) { return c === first; });
    return allSame ? first : '#334155';
  }

  function labelAt(x, y, text, options) {
    const opts = options || {};
    const padding = opts.padding || 4;
    const label = new Konva.Label({ x: x, y: y, listening: false, opacity: opts.opacity == null ? 1 : opts.opacity });
    label.add(new Konva.Tag({
      fill: opts.fill || '#0f172a',
      cornerRadius: 4,
      pointerDirection: 'none'
    }));
    const textNode = new Konva.Text({
      text: text,
      fontSize: opts.fontSize || 9.5,
      padding: padding,
      fontFamily: FONT,
      fontStyle: 'bold',
      fill: opts.color || '#ffffff'
    });
    label.add(textNode);
    label.offsetX(textNode.width() / 2 + padding);
    label.offsetY(textNode.height() / 2 + padding);
    return label;
  }

  function bundlePath(bundle) {
    const geo = bundleGeometry(bundle);
    if (!geo) return null;
    const route = H.store.getRoute(bundle.key);
    return route ? [geo.start, route, geo.end] : [geo.start, geo.end];
  }

  function bundleByKey(key) {
    return computeBundles().find(function (bundle) { return bundle.key === key; }) || null;
  }

  /** Fracción del recorrido donde está el punto de unión (o 0.5 si es recto). */
  function waypointT(bundle, path) {
    const route = H.store.getRoute(bundle.key);
    if (!route || !path || path.length < 3) return 0.5;
    const total = U.polylineLength(path);
    return total > 0 ? U.dist(path[0], path[1]) / total : 0.5;
  }

  /** Agrupa los haces que comparten el mismo punto de unión. */
  function bundleHandleGroups(bundles) {
    const groups = new Map();
    bundles.forEach(function (bundle) {
      const path = bundlePath(bundle);
      if (!path) return;
      const route = H.store.getRoute(bundle.key);
      let x;
      let y;
      let groupKey;
      if (route) {
        x = route.x;
        y = route.y;
        groupKey = 'p:' + Math.round(x) + ':' + Math.round(y);
      } else {
        x = (path[0].x + path[path.length - 1].x) / 2;
        y = (path[0].y + path[path.length - 1].y) / 2;
        groupKey = 'b:' + bundle.key;
      }
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { x: x, y: y, keys: [], bundles: [], explicit: !!route });
      }
      const group = groups.get(groupKey);
      group.keys.push(bundle.key);
      group.bundles.push(bundle);
    });
    return Array.from(groups.values());
  }

  function startMidDrag(group, handle) {
    const origin = { x: handle.x(), y: handle.y() };
    const guide = new Konva.Line({
      points: [origin.x, origin.y, origin.x, origin.y],
      stroke: '#2563eb', strokeWidth: 2, dash: [8, 6],
      lineCap: 'round', listening: false, name: 'mid-guide'
    });
    overlay.add(guide);
    midDrag = { group: group, handle: handle, origin: origin, guide: guide };
    if (stage) stage.container().style.cursor = 'grabbing';
    H.App.setHint('Suelta para mover el punto · sobre otro haz para unirlo · sobre un componente para ramificar · Esc cancela');
    overlay.batchDraw();
  }

  function hitInfoAt(pointer) {
    let node = pointer ? stage.getIntersection(pointer) : null;
    let compId = null;
    let bundleKey = null;
    let handleKeys = null;
    while (node) {
      if (!compId && node.hasName && node.hasName('component')) compId = node.getAttr('compId');
      if (!bundleKey && node.hasName && node.hasName('bundle')) bundleKey = node.getAttr('bundleKey');
      if (!handleKeys && node.hasName && node.hasName('bundle-handle')) {
        const keys = node.getAttr('bundleKeys');
        if (keys && keys.length) handleKeys = keys;
      }
      node = node.getParent();
    }
    return { compId: compId, bundleKey: bundleKey, handleKeys: handleKeys };
  }

  function updateMidDrag() {
    if (!midDrag) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const world = H.Schema.screenToWorld(pointer);
    midDrag.guide.points([midDrag.origin.x, midDrag.origin.y, world.x, world.y]);

    const info = hitInfoAt(pointer);
    const member = midDrag.group.bundles[0];
    let kind = 'move';
    if (info.compId && member && info.compId !== member.aCompId && info.compId !== member.bCompId) {
      kind = 'branch';
    } else if ((info.handleKeys && !info.handleKeys.some(function (key) { return midDrag.group.keys.indexOf(key) !== -1; })) ||
      (info.bundleKey && midDrag.group.keys.indexOf(info.bundleKey) === -1)) {
      kind = 'join';
    }
    midDrag.guide.stroke(kind === 'branch' ? '#16a34a' : (kind === 'join' ? '#f59e0b' : '#2563eb'));
    overlay.batchDraw();
  }

  function resetHandle(state) {
    if (state.handle) state.handle.position(state.origin);
    if (wireLayer) wireLayer.batchDraw();
  }

  function finishMidDrag() {
    if (!midDrag) return;
    const drag = midDrag;
    midDrag = null;
    if (drag.guide) drag.guide.destroy();
    overlay.batchDraw();
    if (stage) stage.container().style.cursor = '';
    H.App.setHint('');

    const pointer = stage.getPointerPosition();
    if (!pointer) { resetHandle(drag); return; }
    const world = H.Schema.screenToWorld(pointer);
    const info = hitInfoAt(pointer);
    const member = drag.group.bundles[0];
    if (!member) { resetHandle(drag); return; }

    if (info.compId) {
      if (info.compId === member.aCompId || info.compId === member.bCompId) {
        resetHandle(drag);
        return;
      }
      const path = bundlePath(member);
      const result = H.store.addBranch({
        fromCompId: member.aCompId,
        toCompId: member.bCompId,
        targetCompId: info.compId,
        t: waypointT(member, path),
        atMidpoint: true
      });
      if (result.error) {
        H.App.toast(result.error, 'error');
        resetHandle(drag);
      } else {
        H.App.toast('Ramificación creada desde el punto del haz.', 'ok');
      }
      return;
    }

    if (info.handleKeys && info.handleKeys.length &&
      !info.handleKeys.some(function (key) { return drag.group.keys.indexOf(key) !== -1; })) {
      const target = { x: drag.handle.x(), y: drag.handle.y() };
      H.store.setRoutes(info.handleKeys, target.x, target.y);
      H.store.setRoutes(drag.group.keys, target.x, target.y);
      H.store.commit('all');
      H.App.toast('Haces unidos en un punto común.', 'ok');
      return;
    }

    if (info.bundleKey && drag.group.keys.indexOf(info.bundleKey) === -1) {
      const targetBundle = bundleByKey(info.bundleKey);
      let joinPoint = targetBundle ? H.store.getRoute(targetBundle.key) : null;
      if (!joinPoint && targetBundle) {
        const targetPath = bundlePath(targetBundle);
        joinPoint = targetPath ? H.Hit.nearestPointOnPolyline(world, targetPath) : world;
        H.store.setRoute(targetBundle.key, joinPoint.x, joinPoint.y);
      }
      joinPoint = joinPoint || world;
      H.store.setRoutes(drag.group.keys, joinPoint.x, joinPoint.y);
      H.store.commit('all');
      H.App.toast('Haces unidos en un punto común.', 'ok');
      return;
    }

    H.store.setRoutes(drag.group.keys, world.x, world.y);
    H.store.commit('all');
  }

  function cancelMidDrag() {
    if (!midDrag) return;
    const drag = midDrag;
    midDrag = null;
    if (drag.guide) drag.guide.destroy();
    overlay.batchDraw();
    if (stage) stage.container().style.cursor = '';
    H.App.setHint('');
    resetHandle(drag);
  }

  H.Layout = {
    mount(ctx) {
      stage = ctx.stage;
      cardLayer = ctx.layoutLayer;
      wireLayer = ctx.layoutWireLayer;
      overlay = ctx.overlayLayer;

      stage.on('mousemove touchmove', function () {
        if (midDrag) updateMidDrag();
      });
      stage.on('mouseup touchend', function () {
        if (midDrag) finishMidDrag();
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && midDrag) cancelMidDrag();
      });
    },

    render() {
      ensurePositions();
      cardLayer.destroyChildren();
      wireLayer.destroyChildren();
      H.Hit.clearLayer(cardLayer);
      H.Hit.clearLayer(wireLayer);
      midDrag = null;

      H.Layout.drawWires();
      H.store.state.components.forEach(function (comp) { H.Layout.buildCard(comp); });

      cardLayer.batchDraw();
      wireLayer.batchDraw();
    },

    scheduleWires() {
      if (redrawQueued) return;
      redrawQueued = true;
      requestAnimationFrame(function () {
        redrawQueued = false;
        H.Layout.drawWires();
      });
    },

    layoutRect: layoutRect,

    autoArrange() {
      const comps = H.store.state.components.slice();
      if (!comps.length) return false;
      const adjacency = new Map();
      comps.forEach(function (comp) { adjacency.set(comp.id, new Set()); });
      H.store.state.wires.forEach(function (wire) {
        const a = H.store.splitKey(wire.fromPinId);
        const b = H.store.splitKey(wire.toPinId);
        if (!a || !b || a.compId === b.compId) return;
        if (adjacency.has(a.compId) && adjacency.has(b.compId)) {
          adjacency.get(a.compId).add(b.compId);
          adjacency.get(b.compId).add(a.compId);
        }
      });

      const visited = new Set();
      let columnOffset = 0;
      comps.forEach(function (start) {
        if (visited.has(start.id)) return;
        const levels = new Map();
        const queue = [[start.id, 0]];
        visited.add(start.id);
        while (queue.length) {
          const item = queue.shift();
          const id = item[0];
          const depth = item[1];
          levels.set(id, depth);
          adjacency.get(id).forEach(function (neighbor) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push([neighbor, depth + 1]);
            }
          });
        }
        const byLevel = new Map();
        levels.forEach(function (depth, id) {
          if (!byLevel.has(depth)) byLevel.set(depth, []);
          byLevel.get(depth).push(id);
        });
        const depths = Array.from(byLevel.keys()).sort(function (a, b) { return a - b; });
        depths.forEach(function (depth, column) {
          const ids = byLevel.get(depth);
          ids.forEach(function (id, row) {
            const comp = H.store.findComponent(id);
            if (!comp) return;
            comp.layoutX = 120 + (columnOffset + column) * 300;
            comp.layoutY = 140 + row * 200;
          });
        });
        columnOffset += depths.length;
      });

      H.store.commit('all');
      return true;
    },

    drawWires() {
      wireLayer.destroyChildren();
      H.Hit.clearLayer(wireLayer);
      const bundles = computeBundles();
      bundles.forEach(function (bundle) { H.Layout.drawBundle(bundle); });
      H.store.state.branches.forEach(function (branch) { H.Layout.drawBranch(branch); });
      H.store.state.taps.forEach(function (tap) { H.Layout.drawTap(tap); });
      H.Layout.drawBundleHandles(bundleHandleGroups(bundles));
      wireLayer.batchDraw();
    },

    drawBundle(bundle) {
      const path = bundlePath(bundle);
      if (!path) return;
      const selection = H.store.state.selection;
      const isSelected = selection.type === 'bundle' && selection.id === bundle.key;
      const width = U.clamp(3.5 + bundle.wires.length * 1.5, 4, 16);
      const totalLength = bundle.wires.reduce(function (sum, wire) {
        return sum + Math.max(0, Number(wire.length) || 0);
      }, 0);
      const flat = [];
      path.forEach(function (point) { flat.push(point.x, point.y); });

      if (isSelected) {
        wireLayer.add(new Konva.Line({
          points: flat,
          stroke: '#bfdbfe',
          strokeWidth: width + 16,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.8,
          listening: false
        }));
      }

      const line = new Konva.Line({
        points: flat,
        stroke: bundleColor(bundle),
        strokeWidth: isSelected ? width + 3 : width,
        lineCap: 'round',
        lineJoin: 'round',
        hitStrokeWidth: Math.max(20, width + 10),
        name: 'bundle',
        opacity: isSelected ? 1 : 0.9,
        shadowColor: '#0f172a',
        shadowBlur: isSelected ? 12 : 0,
        shadowOpacity: 0.3
      });
      line.setAttr('bundleKey', bundle.key);
      line.on('mouseenter', function () {
        if (stage) stage.container().style.cursor = 'pointer';
        line.strokeWidth((isSelected ? width + 3 : width) + 2);
        line.opacity(1);
        wireLayer.batchDraw();
      });
      line.on('mouseleave', function () {
        if (stage) stage.container().style.cursor = '';
        line.strokeWidth(isSelected ? width + 3 : width);
        line.opacity(isSelected ? 1 : 0.9);
        wireLayer.batchDraw();
      });
      line.on('click tap', function (e) {
        e.cancelBubble = true;
        H.store.select('bundle', bundle.key);
      });
      line.on('dblclick dbltap', function (e) {
        e.cancelBubble = true;
        H.Layout.promptBundleLength(bundle);
      });
      wireLayer.add(line);

      H.Hit.register(wireLayer, line, function (point) {
        return H.Hit.distanceToPolyline(point, path) <= Math.max(width / 2 + 4, H.Hit.threshold(6));
      });

      const labelPos = U.pointAt(path, 0.5);
      const label = labelAt(
        labelPos.x,
        labelPos.y - (width / 2 + 14),
        bundle.wires.length + '× · ' + (totalLength > 0 ? U.formatNumber(totalLength, 0) + ' mm' : '— mm'),
        { fill: '#0f172a', opacity: totalLength > 0 ? 1 : 0.75 }
      );
      wireLayer.add(label);
    },

    drawBundleHandles(groups) {
      const selection = H.store.state.selection;
      groups.forEach(function (group) {
        const keys = group.keys.slice();
        const isSelected = keys.some(function (key) {
          return selection.type === 'bundle' && selection.id === key;
        });
        const isJunction = keys.length > 1;

        if (isJunction) {
          wireLayer.add(new Konva.Circle({
            x: group.x,
            y: group.y,
            radius: 10,
            fill: 'rgba(219, 234, 254, 0.9)',
            stroke: '#2563eb',
            strokeWidth: 2,
            dash: [3, 3],
            listening: false
          }));
        }

        const handle = new Konva.Circle({
          x: group.x,
          y: group.y,
          radius: isJunction ? 7 : 6,
          fill: '#ffffff',
          stroke: isSelected ? '#2563eb' : (isJunction ? '#2563eb' : '#94a3b8'),
          strokeWidth: 2.5,
          draggable: true,
          name: 'bundle-handle'
        });
        handle.setAttr('bundleKeys', keys);

        handle.on('click tap', function (e) {
          e.cancelBubble = true;
          H.store.select('bundle', keys[0]);
        });
        handle.on('mouseenter', function () {
          if (stage) stage.container().style.cursor = 'grab';
          handle.radius((isJunction ? 7 : 6) + 1.5);
          wireLayer.batchDraw();
        });
        handle.on('mouseleave', function () {
          if (stage) stage.container().style.cursor = '';
          handle.radius(isJunction ? 7 : 6);
          wireLayer.batchDraw();
        });
        handle.on('dragstart', function () {
          startMidDrag(group, handle);
        });
        handle.on('dragmove', function () {
          updateMidDrag();
        });
        handle.on('dragend', function () {
          finishMidDrag();
        });
        wireLayer.add(handle);

        H.Hit.register(wireLayer, handle, function (point) {
          return Math.hypot(point.x - group.x, point.y - group.y) <= H.Hit.threshold(isJunction ? 14 : 11);
        }, 1);
      });
    },

    drawBranch(branch) {
      const bundleRef = {
        aCompId: branch.fromCompId,
        bCompId: branch.toCompId,
        key: H.store.bundleKey(branch.fromCompId, branch.toCompId)
      };
      const path = bundlePath(bundleRef);
      if (!path) return;
      const targetComp = H.store.findComponent(branch.targetCompId);
      if (!targetComp) return;

      const route = H.store.getRoute(bundleRef.key);
      const from = (branch.atMidpoint && route)
        ? { x: route.x, y: route.y }
        : U.pointAt(path, branch.t);
      const rect = layoutRect(targetComp);
      const to = U.rectBorderPoint(rect, from);
      const selection = H.store.state.selection;
      const isSelected = selection.type === 'branch' && selection.id === branch.id;
      const color = branch.color || '#475569';
      const length = Math.max(0, Number(branch.length) || 0);

      if (isSelected) {
        wireLayer.add(new Konva.Line({
          points: [from.x, from.y, to.x, to.y],
          stroke: '#bfdbfe', strokeWidth: 14, lineCap: 'round',
          opacity: 0.8, listening: false
        }));
      }

      const line = new Konva.Line({
        points: [from.x, from.y, to.x, to.y],
        stroke: color,
        strokeWidth: isSelected ? 4 : 2.5,
        lineCap: 'round',
        hitStrokeWidth: 16,
        name: 'branch',
        shadowColor: '#0f172a',
        shadowBlur: isSelected ? 10 : 0,
        shadowOpacity: 0.25
      });
      line.setAttr('branchId', branch.id);
      line.on('mouseenter', function () {
        if (stage) stage.container().style.cursor = 'pointer';
        line.strokeWidth((isSelected ? 4 : 2.5) + 1.8);
        wireLayer.batchDraw();
      });
      line.on('mouseleave', function () {
        if (stage) stage.container().style.cursor = '';
        line.strokeWidth(isSelected ? 4 : 2.5);
        wireLayer.batchDraw();
      });
      line.on('click tap', function (e) {
        e.cancelBubble = true;
        H.store.select('branch', branch.id);
      });
      line.on('dblclick dbltap', function (e) {
        e.cancelBubble = true;
        H.Layout.promptBranchLength(branch);
      });
      wireLayer.add(line);

      H.Hit.register(wireLayer, line, function (point) {
        return H.Hit.distanceToSegment(point, from, to) <= H.Hit.threshold(9);
      });

      wireLayer.add(new Konva.Circle({
        x: from.x, y: from.y, radius: 3.6, fill: color, listening: false
      }));

      wireLayer.add(labelAt(
        U.lerp(from, to, 0.55).x,
        U.lerp(from, to, 0.55).y,
        length > 0 ? U.formatNumber(length, 0) + ' mm' : '— mm',
        { fill: '#475569', fontSize: 9, opacity: length > 0 ? 0.95 : 0.7 }
      ));
    },

    drawTap(tap) {
      const wire = H.store.state.wires.find(function (w) { return w.id === tap.wireId; });
      if (!wire) return;
      const a = H.store.splitKey(wire.fromPinId);
      const b = H.store.splitKey(wire.toPinId);
      const pin = H.store.findPin(tap.pinId);
      if (!a || !b || !pin) return;
      const targetComp = H.store.findComponent(pin.comp.id);
      if (!targetComp) return;
      const bundleRef = {
        aCompId: a.compId,
        bCompId: b.compId,
        key: H.store.bundleKey(a.compId, b.compId)
      };
      const path = bundlePath(bundleRef);
      if (!path) return;

      const from = U.pointAt(path, tap.t);
      const to = U.rectBorderPoint(layoutRect(targetComp), from);
      const selection = H.store.state.selection;
      const isSelected = selection.type === 'tap' && selection.id === tap.id;
      const color = tap.color || wire.color || '#475569';
      const length = Math.max(0, Number(tap.length) || 0);

      if (isSelected) {
        wireLayer.add(new Konva.Line({
          points: [from.x, from.y, to.x, to.y],
          stroke: '#bfdbfe', strokeWidth: 14, lineCap: 'round',
          opacity: 0.8, listening: false
        }));
      }

      const line = new Konva.Line({
        points: [from.x, from.y, to.x, to.y],
        stroke: color,
        strokeWidth: isSelected ? 4 : 2.5,
        lineCap: 'round',
        hitStrokeWidth: 16,
        name: 'tap',
        shadowColor: '#0f172a',
        shadowBlur: isSelected ? 10 : 0,
        shadowOpacity: 0.25
      });
      line.setAttr('tapId', tap.id);
      line.on('mouseenter', function () {
        if (stage) stage.container().style.cursor = 'pointer';
        line.strokeWidth((isSelected ? 4 : 2.5) + 1.8);
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
        H.Layout.promptTapLength(tap);
      });
      wireLayer.add(line);

      H.Hit.register(wireLayer, line, function (point) {
        return H.Hit.distanceToSegment(point, from, to) <= H.Hit.threshold(9);
      });

      wireLayer.add(new Konva.Circle({
        x: from.x, y: from.y, radius: 3.6, fill: color, listening: false
      }));

      wireLayer.add(labelAt(
        U.lerp(from, to, 0.55).x,
        U.lerp(from, to, 0.55).y,
        length > 0 ? U.formatNumber(length, 0) + ' mm' : '— mm',
        { fill: '#475569', fontSize: 9, opacity: length > 0 ? 0.95 : 0.7 }
      ));
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

    promptBundleLength(bundle) {
      if (!bundle || !bundle.wires.length) return;
      const current = Math.max(0, Number(bundle.wires[0].length) || 0);
      const answer = window.prompt(
        'Longitud manual de cada cable del haz (mm):\n' +
        'Es un valor representativo, no se calcula del lienzo.',
        current ? String(current) : ''
      );
      if (answer === null) return;
      const value = Math.max(0, Math.round(Number(String(answer).replace(',', '.')) || 0));
      if (!value) {
        H.App.toast('Escribe una longitud mayor que 0.', 'warn');
        return;
      }
      bundle.wires.forEach(function (wire) { wire.length = value; });
      H.store.commit('all');
      H.App.toast('Longitud manual aplicada a los ' + bundle.wires.length + ' cables del haz.', 'ok');
    },

    promptBranchLength(branch) {
      if (!branch) return;
      const current = Math.max(0, Number(branch.length) || 0);
      const answer = window.prompt(
        'Longitud manual de la ramificación (mm):\n' +
        'Es un valor representativo, no se calcula del lienzo.',
        current ? String(current) : ''
      );
      if (answer === null) return;
      const value = Math.max(0, Math.round(Number(String(answer).replace(',', '.')) || 0));
      H.store.updateBranch(branch.id, { length: value });
      H.App.toast('Longitud manual de la ramificación actualizada.', 'ok');
    },

    buildCard(comp) {
      const data = H.store.compData(comp);
      if (!data) return;
      const def = data.def;
      const selection = H.store.state.selection;
      const isSelected = selection.type === 'component' && selection.id === comp.id;
      const hue = U.hashHue(def.id);

      const group = new Konva.Group({ x: comp.layoutX, y: comp.layoutY, draggable: true, name: 'component' });
      group.setAttr('compId', comp.id);
      group.setAttr('cardSize', { width: CARD_W, height: CARD_H });

      const card = new Konva.Rect({
        width: CARD_W, height: CARD_H, fill: '#ffffff',
        stroke: isSelected ? '#2563eb' : '#dbe3ee',
        strokeWidth: isSelected ? 2.5 : 1,
        cornerRadius: 14,
        shadowColor: isSelected ? '#2563eb' : '#0f172a',
        shadowBlur: isSelected ? 24 : 14,
        shadowOpacity: isSelected ? 0.28 : 0.1,
        shadowOffsetY: 6
      });
      group.add(card);

      if (isSelected) {
        group.add(new Konva.Rect({
          x: -6, y: -6, width: CARD_W + 12, height: CARD_H + 12,
          stroke: '#2563eb', strokeWidth: 1.5, dash: [7, 5],
          cornerRadius: 18, listening: false
        }));
      }

      const imgWrap = new Konva.Group({
        listening: false,
        clipFunc: function (ctx) {
          U.roundRectPath(ctx, CARD_W, IMG_H + 2, 14);
          ctx.closePath();
        }
      });

      const img = def.image ? U.getImage(def.image) : null;
      if (img && U.isImageReady(img)) {
        const ratio = Math.max(CARD_W / img.naturalWidth, IMG_H / img.naturalHeight);
        const cropW = CARD_W / ratio;
        const cropH = IMG_H / ratio;
        imgWrap.add(new Konva.Image({
          image: img, width: CARD_W, height: IMG_H,
          crop: {
            x: (img.naturalWidth - cropW) / 2,
            y: (img.naturalHeight - cropH) / 2,
            width: cropW, height: cropH
          }
        }));
      } else {
        imgWrap.add(new Konva.Rect({
          width: CARD_W, height: IMG_H,
          fill: 'hsl(' + hue + ', 62%, 90%)', listening: false
        }));
        imgWrap.add(new Konva.Text({
          text: U.initials(def.name), width: CARD_W, y: IMG_H / 2 - 14,
          align: 'center', fontFamily: FONT, fontSize: 22, fontStyle: 'bold',
          fill: 'hsl(' + hue + ', 52%, 38%)', listening: false
        }));
        if (img && !img.__layoutHooked) {
          img.__layoutHooked = true;
          img.addEventListener('load', function () {
            if (H.App) H.App.refreshAll();
          });
        }
      }
      group.add(imgWrap);

      group.add(new Konva.Text({
        text: def.name, x: 12, y: 82, width: CARD_W - 24,
        fontFamily: FONT, fontSize: 12, fontStyle: 'bold',
        fill: '#0f172a', ellipsis: true, wrap: 'none', listening: false
      }));
      group.add(new Konva.Text({
        text: def.company || 'Sin fabricante', x: 12, y: 98, width: CARD_W - 24,
        fontFamily: FONT, fontSize: 9.5, fill: '#64748b',
        ellipsis: true, wrap: 'none', listening: false
      }));
      group.add(new Konva.Text({
        text: (def.pins || []).length + ' pines', x: 12, y: 111, width: 90,
        fontFamily: FONT, fontSize: 9, fontStyle: 'bold',
        fill: 'hsl(' + hue + ', 60%, 42%)', listening: false
      }));
      group.add(new Konva.Text({
        text: U.formatMoney(def.cost), x: CARD_W - 98, y: 111, width: 86, align: 'right',
        fontFamily: FONT, fontSize: 9, fontStyle: 'bold',
        fill: '#0f766e', listening: false
      }));

      group.on('mouseenter', function () {
        if (stage) stage.container().style.cursor = 'pointer';
        card.stroke('#93c5fd');
        card.strokeWidth(isSelected ? 2.5 : 1.8);
        cardLayer.batchDraw();
      });
      group.on('mouseleave', function () {
        if (stage) stage.container().style.cursor = '';
        card.stroke(isSelected ? '#2563eb' : '#dbe3ee');
        card.strokeWidth(isSelected ? 2.5 : 1);
        cardLayer.batchDraw();
      });
      group.on('dragmove', function () {
        comp.layoutX = Math.round(group.x());
        comp.layoutY = Math.round(group.y());
        H.Layout.scheduleWires();
      });
      group.on('dragend', function () {
        H.store.moveComponent(comp.id, group.x(), group.y(), 'layout');
        H.store.commit('geometry');
      });
      group.on('click tap', function () {
        H.store.select('component', comp.id);
      });
      group.on('dblclick dbltap', function (e) {
        e.cancelBubble = true;
        H.ComponentModal.open(comp.defId);
      });

      cardLayer.add(group);
      H.Hit.register(cardLayer, card, function (point) {
        return H.Hit.pointInRect(point, comp.layoutX, comp.layoutY, CARD_W, CARD_H);
      });
    }
  };
})(window.Harness);
