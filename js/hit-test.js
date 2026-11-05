/* ============================================================
   hit-test.js · Detección de impactos por geometría
   Evita depender del canvas de hit de Konva (getImageData),
   que Brave altera por la protección contra fingerprinting.
   ============================================================ */
(function (H) {
  'use strict';

  const layerItems = new Map(); // layer -> { high: [], normal: [] }
  let stageRef = null;

  function bucketFor(layer) {
    if (!layerItems.has(layer)) layerItems.set(layer, { high: [], normal: [] });
    return layerItems.get(layer);
  }

  function register(layer, node, test, priority) {
    if (!layer || !node || typeof test !== 'function') return;
    const bucket = bucketFor(layer);
    const entry = { node: node, test: test };
    if (priority) bucket.high.push(entry);
    else bucket.normal.push(entry);
  }

  function clearLayer(layer) {
    if (layer) layerItems.delete(layer);
  }

  function nodeActive(node, layer) {
    if (!node || !node.getStage() || !node.isVisible() || !node.isListening()) return false;
    let parent = node.getParent();
    while (parent && parent !== layer) {
      if (!parent.isVisible() || !parent.isListening()) return false;
      parent = parent.getParent();
    }
    return true;
  }

  function toWorld(pos) {
    const scale = stageRef.scaleX() || 1;
    return {
      x: (pos.x - stageRef.x()) / scale,
      y: (pos.y - stageRef.y()) / scale
    };
  }

  function testBucket(entries, world) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (!nodeActive(entry.node, entry.node.getLayer())) continue;
      try {
        if (entry.test(world)) return entry.node;
      } catch (err) {
        // una prueba inválida no debe bloquear el resto
      }
    }
    return null;
  }

  function getIntersection(pos) {
    if (!stageRef || !pos) return null;
    const world = toWorld(pos);
    const layers = stageRef.getLayers();
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible() || !layer.listening()) continue;
      const bucket = layerItems.get(layer);
      if (!bucket) continue;
      const high = testBucket(bucket.high, world);
      if (high) return high;
      const normal = testBucket(bucket.normal, world);
      if (normal) return normal;
    }
    return null;
  }

  function pointInRect(point, x, y, width, height) {
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  }

  function circleTest(cx, cy, radius) {
    return function (point) {
      return Math.hypot(point.x - cx, point.y - cy) <= radius;
    };
  }

  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
  }

  function distanceToPolyline(point, points) {
    if (!points || points.length === 0) return Infinity;
    if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
      const d = distanceToSegment(point, points[i - 1], points[i]);
      if (d < best) best = d;
    }
    return best;
  }

  function nearestPointOnPolyline(point, points) {
    if (!points || points.length === 0) return null;
    let total = 0;
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    let best = { x: points[0].x, y: points[0].y, distance: Infinity, t: 0 };
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let local = lenSq === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
      local = Math.max(0, Math.min(1, local));
      const candidate = { x: a.x + local * dx, y: a.y + local * dy };
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (distance < best.distance) {
        const seg = Math.sqrt(lenSq);
        best = {
          x: candidate.x,
          y: candidate.y,
          distance: distance,
          t: total > 0 ? (acc + local * seg) / total : 0
        };
      }
      acc += Math.sqrt(lenSq);
    }
    return best;
  }

  /** Umbral en píxeles de pantalla convertido a unidades del lienzo. */
  function threshold(pixels) {
    const scale = stageRef ? stageRef.scaleX() || 1 : 1;
    return pixels / scale;
  }

  H.Hit = {
    mount(stage) {
      stageRef = stage;
      // Sustituye la detección de Konva basada en el canvas de hit
      stage.getIntersection = getIntersection;
    },
    register: register,
    clearLayer: clearLayer,
    pointInRect: pointInRect,
    circleTest: circleTest,
    distanceToSegment: distanceToSegment,
    distanceToPolyline: distanceToPolyline,
    nearestPointOnPolyline: nearestPointOnPolyline,
    threshold: threshold,
    toWorld: toWorld
  };
})(window.Harness = window.Harness || {});
