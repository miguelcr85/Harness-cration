/* ============================================================
   library.js · Biblioteca lateral de componentes
   ============================================================ */
(function (H) {
  'use strict';

  const U = H.Utils;
  let listEl = null;
  let countEl = null;
  let searchEl = null;

  function cardHtml(def) {
    const totalPins = (def.pins || []).length;
    const thumb = def.image
      ? '<img src="' + def.image + '" alt="' + U.escapeHtml(def.name) + '" />'
      : '<span>' + U.escapeHtml(U.initials(def.name)) + '</span>';
    return '' +
      '<article class="lib-card" draggable="true" data-id="' + def.id + '" title="Arrastra al lienzo o haz doble clic para insertar">' +
        '<div class="lib-card__thumb">' + thumb + '</div>' +
        '<div class="lib-card__info">' +
          '<div class="lib-card__name">' + U.escapeHtml(def.name) + '</div>' +
          '<div class="lib-card__company">' + U.escapeHtml(def.company || 'Sin fabricante') + '</div>' +
          '<div class="lib-card__meta">' +
            '<span class="lib-card__chip">' + totalPins + ' pines</span>' +
            '<span>' + U.formatMoney(def.cost) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="lib-card__actions">' +
          '<button class="icon-btn" type="button" data-action="edit" title="Editar componente">✎</button>' +
          '<button class="icon-btn" type="button" data-action="delete" title="Eliminar de la biblioteca">🗑</button>' +
        '</div>' +
      '</article>';
  }

  function addToCenter(defId) {
    const center = H.App && H.App.getViewportCenter ? H.App.getViewportCenter() : { x: 120, y: 120 };
    const comp = H.store.addComponent(defId, Math.round(center.x - 90), Math.round(center.y - 70));
    if (comp && H.App && H.App.toast) {
      const def = H.store.findDef(defId);
      H.App.toast('“' + (def ? def.name : 'Componente') + '” colocado en el lienzo.', 'ok');
    }
  }

  const Library = {
    init() {
      listEl = U.$('#libraryList');
      countEl = U.$('#libraryCount');
      searchEl = U.$('#librarySearch');

      if (searchEl) {
        searchEl.addEventListener('input', Library.render);
      }

      if (!listEl) return;

      listEl.addEventListener('dragstart', function (e) {
        const card = e.target.closest('.lib-card');
        if (!card) return;
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-harness-def', card.dataset.id);
        e.dataTransfer.setData('text/plain', card.dataset.id);
      });

      listEl.addEventListener('dragend', function (e) {
        const card = e.target.closest('.lib-card');
        if (card) card.classList.remove('is-dragging');
      });

      listEl.addEventListener('dblclick', function (e) {
        const card = e.target.closest('.lib-card');
        if (card) addToCenter(card.dataset.id);
      });

      listEl.addEventListener('click', function (e) {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        const card = actionBtn.closest('.lib-card');
        if (!card) return;
        const defId = card.dataset.id;
        const def = H.store.findDef(defId);
        if (!def) return;

        if (actionBtn.dataset.action === 'edit') {
          H.ComponentModal.open(defId);
        } else if (actionBtn.dataset.action === 'delete') {
          const used = H.store.state.components.filter(function (comp) { return comp.defId === defId; }).length;
          if (used > 0) {
            H.App.toast('No se puede eliminar: hay ' + used + ' instancia(s) en el lienzo.', 'error');
            return;
          }
          if (window.confirm('¿Eliminar “' + def.name + '” de la biblioteca?')) {
            const res = H.store.removeDefinition(defId);
            if (res && res.error) H.App.toast(res.error, 'error');
            else H.App.toast('Componente eliminado.', 'ok');
          }
        }
      });
    },

    render() {
      if (!listEl) return;
      const query = (searchEl && searchEl.value ? searchEl.value : '').trim().toLowerCase();
      const all = H.store.state.library;
      const filtered = !query ? all : all.filter(function (def) {
        return String(def.name).toLowerCase().indexOf(query) >= 0 ||
          String(def.company || '').toLowerCase().indexOf(query) >= 0;
      });

      if (countEl) {
        countEl.textContent = all.length + (all.length === 1 ? ' componente definido' : ' componentes definidos');
      }

      if (!filtered.length) {
        listEl.innerHTML = '<div class="library__empty">' +
          (all.length ? 'Sin resultados para “' + U.escapeHtml(query) + '”.' :
            'Aún no hay componentes.<br />Usa <strong>Agregar Componente</strong> para crear el primero.') +
          '</div>';
        return;
      }

      listEl.innerHTML = filtered.map(cardHtml).join('');
    }
  };

  H.Library = Library;
})(window.Harness);
