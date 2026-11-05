/* ============================================================
   app.js · Arranque, capas Konva, toolbar y atajos
   ============================================================ */
(function (H) {
  'use strict';

  const U = H.Utils;
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 2.5;

  const App = {
    stage: null,
    layers: {},
    mode: 'schema',
    panning: null,
    suppressClick: false,

    init() {
      H.store.load();
      App.buildStage();
      App.bindToolbar();
      App.bindCanvasDnD();
      App.bindShortcuts();
      App.bindStore();

      H.ComponentModal.init();
      H.Library.init();
      H.Inspector.init();
      H.Bom.init();
      H.Schema.mount({
        stage: App.stage,
        schemaLayer: App.layers.schema,
        schemaWireLayer: App.layers.schemaWire,
        overlayLayer: App.layers.overlay
      });
      H.Layout.mount({
        stage: App.stage,
        layoutLayer: App.layers.layout,
        layoutWireLayer: App.layers.layoutWire,
        overlayLayer: App.layers.overlay
      });

      App.applyViewFromState();
      App.setMode(['schema', 'layout', 'bom'].indexOf(H.store.state.view.mode) >= 0 ? H.store.state.view.mode : 'schema', true);
      App.refreshAll();
      App.updateZoomLabel();

      window.addEventListener('resize', U.debounce(function () {
        App.resize();
      }, 120));
    },

    buildStage() {
      const host = U.$('#stageHost');
      const stage = new Konva.Stage({
        container: host,
        width: host.clientWidth || 800,
        height: host.clientHeight || 600
      });

      App.stage = stage;
      App.layers = {
        grid: new Konva.Layer({ listening: true }),
        schemaWire: new Konva.Layer({ listening: true }),
        schema: new Konva.Layer({ listening: true }),
        layoutWire: new Konva.Layer({ listening: true }),
        layout: new Konva.Layer({ listening: true }),
        overlay: new Konva.Layer({ listening: false })
      };

      stage.add(App.layers.grid);
      stage.add(App.layers.schemaWire);
      stage.add(App.layers.schema);
      stage.add(App.layers.layoutWire);
      stage.add(App.layers.layout);
      stage.add(App.layers.overlay);

      App.gridShape = new Konva.Shape({
        name: 'grid-bg',
        fill: '#ffffff',
        sceneFunc: function (ctx) {
          const scale = stage.scaleX() || 1;
          const pos = stage.position();
          const width = stage.width();
          const height = stage.height();
          const worldLeft = -pos.x / scale;
          const worldTop = -pos.y / scale;
          const worldRight = worldLeft + width / scale;
          const worldBottom = worldTop + height / scale;
          const native = ctx._context;

          let spacing = 24;
          while (spacing * scale < 13) spacing *= 2;

          native.save();
          native.lineWidth = 1;

          native.strokeStyle = '#e6ecf4';
          native.beginPath();
          const startX = Math.floor(worldLeft / spacing) * spacing;
          const startY = Math.floor(worldTop / spacing) * spacing;
          for (let x = startX; x <= worldRight; x += spacing) {
            native.moveTo(x, worldTop);
            native.lineTo(x, worldBottom);
          }
          for (let y = startY; y <= worldBottom; y += spacing) {
            native.moveTo(worldLeft, y);
            native.lineTo(worldRight, y);
          }
          native.stroke();

          const major = spacing * 5;
          native.strokeStyle = '#d6e0ec';
          native.beginPath();
          const majorX = Math.floor(worldLeft / major) * major;
          const majorY = Math.floor(worldTop / major) * major;
          for (let x = majorX; x <= worldRight; x += major) {
            native.moveTo(x, worldTop);
            native.lineTo(x, worldBottom);
          }
          for (let y = majorY; y <= worldBottom; y += major) {
            native.moveTo(worldLeft, y);
            native.lineTo(worldRight, y);
          }
          native.stroke();
          native.restore();
        },
        hitFunc: function (ctx, shape) {
          ctx.beginPath();
          ctx.rect(-100000, -100000, 200000, 200000);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }
      });
      App.layers.grid.add(App.gridShape);

      H.Hit.mount(stage);

      stage.on('mousedown touchstart', function (e) {
        const target = e.target;
        const isBackground = target === stage || (target && target.hasName && target.hasName('grid-bg'));
        if (!isBackground) return;
        App.panning = {
          pointer: stage.getPointerPosition(),
          origin: stage.position(),
          moved: false
        };
        stage.container().style.cursor = 'grabbing';
      });

      stage.on('mousemove touchmove', function () {
        if (!App.panning) return;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const dx = pointer.x - App.panning.pointer.x;
        const dy = pointer.y - App.panning.pointer.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) App.panning.moved = true;
        stage.position({ x: App.panning.origin.x + dx, y: App.panning.origin.y + dy });
        App.layers.grid.batchDraw();
      });

      stage.on('mouseup touchend', function () {
        if (!App.panning) return;
        App.suppressClick = App.panning.moved;
        App.panning = null;
        stage.container().style.cursor = '';
        App.persistView();
        setTimeout(function () { App.suppressClick = false; }, 60);
      });

      stage.on('click tap', function (e) {
        if (App.suppressClick) return;
        const target = e.target;
        if (target === stage || (target && target.hasName && target.hasName('grid-bg'))) {
          H.store.clearSelection();
        }
      });

      stage.on('wheel', function (e) {
        e.evt.preventDefault();
        const oldScale = stage.scaleX() || 1;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const direction = e.evt.deltaY > 0 ? -1 : 1;
        const factor = 1.08;
        const nextScale = U.clamp(direction > 0 ? oldScale * factor : oldScale / factor, MIN_SCALE, MAX_SCALE);
        if (nextScale === oldScale) return;
        const worldPoint = {
          x: (pointer.x - stage.x()) / oldScale,
          y: (pointer.y - stage.y()) / oldScale
        };
        stage.scale({ x: nextScale, y: nextScale });
        stage.position({
          x: pointer.x - worldPoint.x * nextScale,
          y: pointer.y - worldPoint.y * nextScale
        });
        App.layers.grid.batchDraw();
        App.updateZoomLabel();
        App.persistView();
      });
    },

    bindToolbar() {
      ['#btnAddComponent', '#btnAddComponentSidebar', '#btnAddComponentEmpty'].forEach(function (selector) {
        const btn = U.$(selector);
        if (btn) btn.addEventListener('click', function () { H.ComponentModal.open(); });
      });

      const demoBtn = U.$('#btnLoadDemo');
      if (demoBtn) {
        demoBtn.addEventListener('click', function () {
          if (H.store.state.components.length &&
            !window.confirm('Se reemplazará el proyecto actual por el ejemplo. ¿Continuar?')) return;
          H.store.loadDemo();
          App.centerView();
          App.toast('Proyecto de ejemplo cargado: 3 conectores y chicotes.', 'ok', 4000);
        });
      }

      const schemaBtn = U.$('#btnViewSchema');
      if (schemaBtn) schemaBtn.addEventListener('click', function () { App.setMode('schema'); });
      const layoutBtn = U.$('#btnViewLayout');
      if (layoutBtn) layoutBtn.addEventListener('click', function () { App.setMode('layout'); });
      const bomBtn = U.$('#btnViewBom');
      if (bomBtn) bomBtn.addEventListener('click', function () { App.setMode('bom'); });

      const arrangeBtn = U.$('#btnAutoArrange');
      if (arrangeBtn) {
        arrangeBtn.addEventListener('click', function () {
          if (!H.store.state.components.length) {
            App.toast('Agrega componentes antes de organizar el layout.', 'warn');
            return;
          }
          if (App.mode !== 'layout') App.setMode('layout');
          H.Layout.autoArrange();
          App.centerView();
          App.toast('Distribución del layout recalculada.', 'ok');
        });
      }

      const zoomIn = U.$('#btnZoomIn');
      if (zoomIn) zoomIn.addEventListener('click', function () { App.zoomBy(1.15); });
      const zoomOut = U.$('#btnZoomOut');
      if (zoomOut) zoomOut.addEventListener('click', function () { App.zoomBy(1 / 1.15); });
      const zoomLabel = U.$('#zoomLabel');
      if (zoomLabel) zoomLabel.addEventListener('click', function () { App.zoomTo(1); });
      const centerBtn = U.$('#btnCenter');
      if (centerBtn) centerBtn.addEventListener('click', App.centerView);

      const saveBtn = U.$('#btnSave');
      if (saveBtn) saveBtn.addEventListener('click', App.saveNow);

      const exportBtn = U.$('#btnExport');
      if (exportBtn) {
        exportBtn.addEventListener('click', function () {
          U.download(App.fileName('json'), H.store.exportJSON(), 'application/json');
          App.toast('JSON exportado con ' + H.store.state.components.length + ' componentes.', 'ok');
        });
      }

      const importBtn = U.$('#btnImport');
      const importFile = U.$('#importFile');
      if (importBtn && importFile) {
        importBtn.addEventListener('click', function () { importFile.click(); });
        importFile.addEventListener('change', function (e) {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          U.readFileText(file).then(function (text) {
            const result = H.store.importJSON(text);
            if (result.error) {
              App.toast(result.error, 'error', 5000);
            } else {
              App.centerView();
              App.toast('Proyecto importado correctamente.', 'ok');
            }
          }).catch(function () {
            App.toast('No se pudo leer el archivo.', 'error');
          }).then(function () {
            e.target.value = '';
          });
        });
      }

      const pngBtn = U.$('#btnExportPng');
      if (pngBtn) pngBtn.addEventListener('click', App.exportPng);

      const newBtn = U.$('#btnNew');
      if (newBtn) {
        newBtn.addEventListener('click', function () {
          if (!H.store.state.components.length && !H.store.state.library.length) return;
          if (!window.confirm('¿Crear un proyecto nuevo? Se perderá el arnés actual.')) return;
          H.store.clear();
          App.toast('Proyecto nuevo.', 'ok');
        });
      }
    },

    bindCanvasDnD() {
      const host = U.$('#stageHost');
      if (!host) return;
      host.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        host.classList.add('is-dragover');
      });
      host.addEventListener('dragleave', function () {
        host.classList.remove('is-dragover');
      });
      host.addEventListener('drop', function (e) {
        e.preventDefault();
        host.classList.remove('is-dragover');
        const defId = e.dataTransfer.getData('application/x-harness-def') ||
          e.dataTransfer.getData('text/plain');
        const def = defId ? H.store.findDef(defId) : null;
        if (!def) return;
        const rect = host.getBoundingClientRect();
        const world = H.Schema.screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        const comp = H.store.addComponent(defId, world.x - 110, world.y - 70, {
          layoutX: world.x - 90,
          layoutY: world.y - 60
        });
        if (comp) App.toast('“' + def.name + '” colocado en el lienzo.', 'ok', 2200);
      });
    },

    bindShortcuts() {
      document.addEventListener('keydown', function (e) {
        const target = e.target || {};
        const tag = String(target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
        if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') {
          e.preventDefault();
          App.saveNow();
          return;
        }
        if (typing) return;
        if (e.key === 'Escape') {
          if (H.Schema.isConnecting && H.Schema.isConnecting()) return;
          H.store.clearSelection();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          App.deleteSelection();
        }
      });
    },

    bindStore() {
      H.store.onChange(function (reason) {
        App.updateEmptyState();
        App.updateSaveStatus();
        if (reason === 'geometry') {
          H.Schema.refreshWires();
          H.Schema.applyStyles();
          H.Layout.drawWires();
          H.Inspector.refreshLive();
          return;
        }
        if (reason === 'settings') {
          App.applySettings();
          return;
        }
        App.refreshAll();
      });
    },

    applyViewFromState() {
      const view = H.store.state.view || {};
      const stage = App.stage;
      const scale = U.clamp(Number(view.scale) || 1, MIN_SCALE, MAX_SCALE);
      stage.scale({ x: scale, y: scale });
      stage.position({
        x: Number.isFinite(Number(view.x)) ? Number(view.x) : 40,
        y: Number.isFinite(Number(view.y)) ? Number(view.y) : 40
      });
      App.layers.grid.batchDraw();
    },

    persistView: U.debounce(function () {
      if (!App.stage) return;
      H.store.setView({
        mode: App.mode,
        scale: App.stage.scaleX(),
        x: App.stage.x(),
        y: App.stage.y()
      });
    }, 250),

    resize() {
      if (!App.stage) return;
      const host = U.$('#stageHost');
      if (!host || host.hidden) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      App.stage.width(width);
      App.stage.height(height);
      App.layers.grid.batchDraw();
    },

    setMode(mode, silent) {
      const allowed = { schema: true, layout: true, bom: true };
      const next = allowed[mode] ? mode : 'schema';
      const isLayout = next === 'layout';
      const isBom = next === 'bom';

      App.mode = next;
      H.store.state.view.mode = next;
      document.body.classList.toggle('mode-bom', isBom);

      App.layers.schema.visible(next === 'schema');
      App.layers.schemaWire.visible(next === 'schema');
      App.layers.layout.visible(isLayout);
      App.layers.layoutWire.visible(isLayout);

      const stageHost = U.$('#stageHost');
      if (stageHost) stageHost.hidden = isBom;
      const bomView = U.$('#bomView');
      if (bomView) bomView.hidden = !isBom;

      U.$$('[data-mode]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.dataset.mode === next);
      });
      const modeLabel = U.$('#statusMode');
      if (modeLabel) {
        modeLabel.textContent = isBom ? 'Vista BOM' : (isLayout ? 'Vista layout' : 'Vista esquema');
      }
      const canvasHint = U.$('#canvasHintText');
      if (canvasHint) {
        canvasHint.textContent = isLayout
          ? 'Vista layout · arrastra el punto medio del haz para moverlo o unir haces · doble clic para longitud manual'
          : 'Vista esquema · arrastra pin→pin para crear un chicote o pin→cable para un empalme';
      }

      if (isBom) {
        H.store.state.selection = { type: null, id: null };
      } else {
        App.resize();
        App.stage.batchDraw();
      }

      App.setHint('');
      App.updateZoomLabel();
      H.store.persist();
      if (!silent) App.refreshAll();
      else H.Bom.render();
    },

    refreshAll() {
      if (!App.stage) return;
      H.Schema.render();
      H.Layout.render();
      H.Library.render();
      H.Inspector.render();
      H.Bom.render();
      App.updateEmptyState();
      App.updateSelectionStatus();
      App.persistView();
    },

    updateSelectionStatus() {
      const el = U.$('#statusSelection');
      if (!el) return;
      if (App.mode === 'bom') {
        el.textContent = 'BOM · cantidades y metros de cable';
        el.classList.remove('is-empty');
        return;
      }
      const selection = H.store.state.selection;
      const compName = function (id) {
        const data = H.store.compData(id);
        return data ? data.def.name : 'Componente';
      };
      let text = 'Sin selección';
      let empty = true;

      if (selection.type === 'component' && H.store.findComponent(selection.id)) {
        text = 'Selección: ' + compName(selection.id);
        empty = false;
      } else if (selection.type === 'wire') {
        const wire = H.store.state.wires.find(function (w) { return w.id === selection.id; });
        if (wire) {
          text = 'Selección: chicote ' + H.store.pinLabel(wire.fromPinId) + ' → ' + H.store.pinLabel(wire.toPinId);
          empty = false;
        }
      } else if (selection.type === 'pin') {
        const found = H.store.findPin(selection.id);
        if (found) {
          text = 'Selección: pin ' + found.compName + ' · ' + found.pin.label;
          empty = false;
        }
      } else if (selection.type === 'bundle') {
        const parts = String(selection.id).split('|');
        if (parts.length === 2 && H.store.findComponent(parts[0]) && H.store.findComponent(parts[1])) {
          text = 'Selección: haz ' + compName(parts[0]) + ' ↔ ' + compName(parts[1]);
          empty = false;
        }
      } else if (selection.type === 'branch') {
        const branch = H.store.state.branches.find(function (b) { return b.id === selection.id; });
        if (branch) {
          text = 'Selección: ramificación → ' + compName(branch.targetCompId);
          empty = false;
        }
      } else if (selection.type === 'tap') {
        const tap = H.store.findTap(selection.id);
        if (tap) {
          const pin = H.store.findPin(tap.pinId);
          text = 'Selección: empalme ' + (pin ? pin.compName + ' · ' + pin.pin.label : 'pin') + ' → cable';
          empty = false;
        }
      }

      el.textContent = text;
      el.classList.toggle('is-empty', empty);
    },

    applySettings() {
      const showGrid = H.store.state.settings.showGrid !== false;
      App.layers.grid.visible(showGrid);
      App.layers.grid.batchDraw();
      App.refreshAll();
    },

    updateEmptyState() {
      const empty = U.$('#emptyState');
      if (!empty) return;
      empty.hidden = App.mode === 'bom' || H.store.state.components.length > 0;
    },

    updateZoomLabel() {
      const label = U.$('#zoomLabel');
      if (!label || !App.stage) return;
      label.textContent = Math.round((App.stage.scaleX() || 1) * 100) + '%';
    },

    getViewportCenter() {
      const stage = App.stage;
      return H.Schema.screenToWorld({ x: stage.width() / 2, y: stage.height() / 2 });
    },

    centerView() {
      const stage = App.stage;
      if (!stage) return;
      const comps = H.store.state.components;
      if (!comps.length) {
        stage.scale({ x: 1, y: 1 });
        stage.position({ x: 40, y: 40 });
        App.layers.grid.batchDraw();
        App.updateZoomLabel();
        App.persistView();
        return;
      }

      const isLayout = App.mode === 'layout';
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      comps.forEach(function (comp) {
        const x = isLayout ? comp.layoutX : comp.x;
        const y = isLayout ? comp.layoutY : comp.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const w = isLayout ? 178 : 250;
        const h = isLayout ? 126 : 330;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
      });
      if (minX === Infinity) return;

      const contentW = Math.max(60, maxX - minX);
      const contentH = Math.max(60, maxY - minY);
      const scale = U.clamp(
        Math.min((stage.width() - 120) / contentW, (stage.height() - 120) / contentH, 1.25),
        MIN_SCALE,
        MAX_SCALE
      );
      stage.scale({ x: scale, y: scale });
      stage.position({
        x: (stage.width() - contentW * scale) / 2 - minX * scale,
        y: (stage.height() - contentH * scale) / 2 - minY * scale
      });
      App.layers.grid.batchDraw();
      App.updateZoomLabel();
      App.persistView();
    },

    zoomBy(factor) {
      const stage = App.stage;
      if (!stage) return;
      const current = stage.scaleX() || 1;
      const next = U.clamp(current * factor, MIN_SCALE, MAX_SCALE);
      App.zoomAroundCenter(next);
    },

    zoomTo(scale) {
      App.zoomAroundCenter(U.clamp(Number(scale) || 1, MIN_SCALE, MAX_SCALE));
    },

    zoomAroundCenter(next) {
      const stage = App.stage;
      const current = stage.scaleX() || 1;
      if (next === current) return;
      const cx = stage.width() / 2;
      const cy = stage.height() / 2;
      const world = { x: (cx - stage.x()) / current, y: (cy - stage.y()) / current };
      stage.scale({ x: next, y: next });
      stage.position({ x: cx - world.x * next, y: cy - world.y * next });
      App.layers.grid.batchDraw();
      App.updateZoomLabel();
      App.persistView();
    },

    saveNow() {
      const ok = H.store.persistNow();
      if (ok) {
        App.updateSaveStatus();
        App.toast('Proyecto guardado en el navegador.', 'ok', 2200);
      }
    },

    updateSaveStatus() {
      const el = U.$('#statusSave');
      if (!el) return;
      const date = new Date();
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      el.classList.remove('is-error');
      el.textContent = 'Guardado automático · ' + hh + ':' + mm;
    },

    exportPng() {
      if (App.mode === 'bom') {
        App.toast('Cambia a Vista Esquema o Layout para exportar el PNG.', 'warn');
        return;
      }
      try {
        const url = App.stage.toDataURL({ pixelRatio: 2 });
        const a = document.createElement('a');
        a.href = url;
        a.download = App.fileName('png');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        App.toast('Imagen PNG exportada.', 'ok');
      } catch (err) {
        App.toast('No se pudo exportar la imagen.', 'error');
      }
    },

    fileName(extension) {
      const now = new Date();
      const pad = function (n) { return String(n).padStart(2, '0'); };
      const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
        '-' + pad(now.getHours()) + pad(now.getMinutes());
      return 'arnes-' + stamp + '.' + extension;
    },

    deleteSelection() {
      const selection = H.store.state.selection;
      if (!selection.type) return;
      if (selection.type === 'component') {
        const comp = H.store.findComponent(selection.id);
        if (!comp) return;
        if (window.confirm('¿Eliminar el componente y todos sus chicotes?')) {
          H.store.removeComponent(selection.id);
          App.toast('Componente eliminado.', 'ok');
        }
      } else if (selection.type === 'wire') {
        H.store.removeWire(selection.id);
        App.toast('Chicote eliminado.', 'ok');
      } else if (selection.type === 'branch') {
        H.store.removeBranch(selection.id);
        App.toast('Ramificación eliminada.', 'ok');
      } else if (selection.type === 'tap') {
        H.store.removeTap(selection.id);
        App.toast('Empalme eliminado.', 'ok');
      } else if (selection.type === 'bundle') {
        const parts = String(selection.id).split('|');
        if (parts.length !== 2) return;
        if (!window.confirm('¿Eliminar todos los chicotes del haz?')) return;
        H.store.state.wires.slice().forEach(function (wire) {
          const a = H.store.splitKey(wire.fromPinId);
          const b = H.store.splitKey(wire.toPinId);
          if (a && b && H.store.bundleKey(a.compId, b.compId) === selection.id) {
            H.store.removeWire(wire.id);
          }
        });
        H.store.clearSelection();
      }
    },

    setHint(text) {
      const el = U.$('#statusHint');
      if (!el) return;
      if (text) {
        el.textContent = text;
        return;
      }
      if (App.mode === 'bom') {
        el.textContent = 'Las longitudes provienen de los valores manuales · Exporta el CSV desde la vista';
        return;
      }
      el.textContent = App.mode === 'layout'
        ? 'Layout: clic para seleccionar · arrastra el punto medio para moverlo · suéltalo sobre otro haz para unirlo · sobre un componente para ramificar · doble clic para longitud manual · Supr elimina'
        : 'Fondo: paneo · rueda: zoom · clic en un pin para seleccionarlo · arrastra pin→pin para un chicote · arrastra pin→cable para un empalme · Supr elimina';
    },

    toast(message, type, duration) {
      const wrap = U.$('#toasts');
      if (!wrap) return;
      const el = document.createElement('div');
      el.className = 'toast' + (type ? ' toast--' + type : '');
      el.textContent = message;
      wrap.appendChild(el);
      setTimeout(function () {
        el.style.transition = 'opacity .22s ease, transform .22s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateX(12px)';
        setTimeout(function () { el.remove(); }, 240);
      }, duration || 3200);
    }
  };

  H.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.init(); });
  } else {
    App.init();
  }
})(window.Harness);
