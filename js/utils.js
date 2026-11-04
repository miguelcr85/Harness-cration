/* ============================================================
   utils.js · Helpers compartidos
   ============================================================ */
window.Harness = window.Harness || {};

(function (H) {
  'use strict';

  const imageCache = new Map();

  const Utils = {
    uid(prefix) {
      const p = prefix || 'id';
      return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },

    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },

    round(value, digits) {
      const f = Math.pow(10, digits == null ? 0 : digits);
      return Math.round(value * f) / f;
    },

    /** 1 -> A, 26 -> Z, 27 -> AA */
    toAlpha(n) {
      let num = Math.max(1, Math.floor(n));
      let out = '';
      while (num > 0) {
        const rem = (num - 1) % 26;
        out = String.fromCharCode(65 + rem) + out;
        num = Math.floor((num - 1) / 26);
      }
      return out;
    },

    debounce(fn, wait) {
      let timer = null;
      const wrapped = function () {
        const args = arguments;
        const ctx = this;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 250);
      };
      wrapped.cancel = function () { clearTimeout(timer); };
      return wrapped;
    },

    $(selector, root) { return (root || document).querySelector(selector); },
    $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); },

    formatMoney(value) {
      const num = Number(value) || 0;
      try {
        return num.toLocaleString('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
      } catch (err) {
        return '$' + num.toFixed(2);
      }
    },

    formatNumber(value, digits) {
      const num = Number(value) || 0;
      const d = digits == null ? 0 : digits;
      return num.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
    },

    dist(a, b) {
      if (!a || !b) return 0;
      return Math.hypot(b.x - a.x, b.y - a.y);
    },

    lerp(a, b, t) {
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    },

    polylineLength(points) {
      let total = 0;
      for (let i = 1; i < points.length; i++) total += Utils.dist(points[i - 1], points[i]);
      return total;
    },

    /** Punto a una fracción t (0..1) del recorrido de una polilínea. */
    pointAt(points, t) {
      if (!points || !points.length) return { x: 0, y: 0 };
      if (points.length === 1) return { x: points[0].x, y: points[0].y };
      const total = Utils.polylineLength(points);
      const target = Utils.clamp(t, 0, 1) * total;
      let acc = 0;
      for (let i = 1; i < points.length; i++) {
        const seg = Utils.dist(points[i - 1], points[i]);
        if (acc + seg >= target) {
          const local = seg === 0 ? 0 : (target - acc) / seg;
          return Utils.lerp(points[i - 1], points[i], local);
        }
        acc += seg;
      }
      return { x: points[points.length - 1].x, y: points[points.length - 1].y };
    },

    /** Punto del borde de un rectángulo (x,y = esquina sup. izq.) en dirección a target. */
    rectBorderPoint(rect, target) {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const dx = target.x - cx;
      const dy = target.y - cy;
      if (dx === 0 && dy === 0) return { x: cx, y: cy };
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;
      const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
      return { x: cx + dx * scale, y: cy + dy * scale };
    },

    /** Ruteo automático tipo codo ortogonal: devuelve sólo los puntos interiores. */
    autoRoutePoints(start, end) {
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);
      if (dx < 2 || dy < 2) return [];
      if (dx >= dy) {
        const midX = (start.x + end.x) / 2;
        return [{ x: midX, y: start.y }, { x: midX, y: end.y }];
      }
      const midY = (start.y + end.y) / 2;
      return [{ x: start.x, y: midY }, { x: end.x, y: midY }];
    },

    /** Convierte un File de imagen en DataURL redimensionado (maxSize = lado mayor). */
    fileToDataURL(file, maxSize) {
      const limit = maxSize || 560;
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
        reader.onload = function () {
          const dataUrl = String(reader.result || '');
          const img = new Image();
          img.onerror = function () { reject(new Error('La imagen no es válida.')); };
          img.onload = function () {
            const ratio = Math.min(1, limit / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * ratio));
            const h = Math.max(1, Math.round(img.height * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            let out = dataUrl;
            try { out = canvas.toDataURL('image/jpeg', 0.82); } catch (err) { out = dataUrl; }
            const cached = new Image();
            cached.onload = function () { imageCache.set(out, cached); resolve(out); };
            cached.onerror = function () { resolve(out); };
            cached.src = out;
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
    },

    download(filename, content, mime) {
      const blob = new Blob([content], { type: mime || 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    },

    readFileText(file) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
        reader.readAsText(file);
      });
    },

    hashHue(text) {
      const str = String(text || '');
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % 360;
      return hash;
    },

    initials(text) {
      const clean = String(text || '').trim();
      if (!clean) return 'C';
      const parts = clean.split(/\s+/).filter(Boolean);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    },

    escapeHtml(text) {
      return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    },

    deepClone(value) {
      return JSON.parse(JSON.stringify(value));
    },

    roundRectPath(ctx, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(w - radius, 0);
      ctx.quadraticCurveTo(w, 0, w, radius);
      ctx.lineTo(w, h - radius);
      ctx.quadraticCurveTo(w, h, w - radius, h);
      ctx.lineTo(radius, h);
      ctx.quadraticCurveTo(0, h, 0, h - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
    },

    getImage(src) {
      if (!src) return null;
      if (imageCache.has(src)) return imageCache.get(src);
      const img = new Image();
      img.src = src;
      imageCache.set(src, img);
      return img;
    },

    isImageReady(img) {
      return !!(img && img.complete && img.naturalWidth > 0);
    },

    /** Genera las etiquetas de una matriz de pines (filas × columnas). */
    buildSubgroupPins(sg) {
      const rows = Utils.clamp(Math.round(Number(sg.rows) || 1), 1, 30);
      const cols = Utils.clamp(Math.round(Number(sg.cols) || 1), 1, 30);
      const start = Number.isFinite(Number(sg.start)) ? Math.round(Number(sg.start)) : 1;
      const prefix = String(sg.prefix || '');
      const descriptions = sg.descriptions || {};
      const pins = [];
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const index = (r - 1) * cols + (c - 1);
          let label;
          switch (sg.numbering) {
            case 'alpha':
              label = Utils.toAlpha(start + index);
              break;
            case 'row-alpha':
              label = Utils.toAlpha(r) + String(start + c - 1);
              break;
            case 'col-alpha':
              label = Utils.toAlpha(c) + String(start + r - 1);
              break;
            case 'numbered-prefix':
              label = prefix + String(start + index);
              break;
            case 'numeric':
            default:
              label = String(start + index);
          }
          if (sg.numbering !== 'numbered-prefix' && prefix) label = prefix + label;
          const id = sg.id + '_r' + r + 'c' + c;
          pins.push({
            id: id,
            label: label,
            row: r,
            col: c,
            description: String(descriptions[id] || '').slice(0, 40)
          });
        }
      }
      return pins;
    },

    /** Devuelve los subgrupos enriquecidos con sus pines y la lista plana. */
    buildPins(subgroups) {
      const groups = [];
      const flat = [];
      (subgroups || []).forEach(function (sg) {
        const pins = Utils.buildSubgroupPins(sg);
        groups.push(Object.assign({}, sg, {
          rows: Utils.clamp(Math.round(Number(sg.rows) || 1), 1, 30),
          cols: Utils.clamp(Math.round(Number(sg.cols) || 1), 1, 30),
          descriptions: sg.descriptions || {},
          pins: pins
        }));
        pins.forEach(function (pin) {
          flat.push({
            id: pin.id,
            label: pin.label,
            row: pin.row,
            col: pin.col,
            description: pin.description || '',
            subgroupId: sg.id,
            subgroupName: sg.name || 'Sección'
          });
        });
      });
      return { subgroups: groups, pins: flat };
    },

    /** Paleta para chicotes nuevos. */
    wirePalette: ['#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#0891b2', '#0f172a', '#db2777']

  };

  H.Utils = Utils;
})(window.Harness);
