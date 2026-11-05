/* ============================================================
   component-modal.js · Alta y edición de conectores
   ============================================================ */
(function (H) {
  'use strict';

  const U = H.Utils;
  let modal = null;
  let draft = null;
  let editingId = null;

  const NUMBERING_OPTIONS = [
    { value: 'numeric', label: 'Numérica (1, 2, 3)' },
    { value: 'alpha', label: 'Alfabética (A, B, C)' },
    { value: 'row-alpha', label: 'Fila + número (A1, A2)' },
    { value: 'col-alpha', label: 'Columna + número (A1, B1)' },
    { value: 'numbered-prefix', label: 'Prefijo + número (J1, J2)' }
  ];

  function newSubgroup(index) {
    return {
      id: U.uid('sg'),
      name: 'Sección ' + U.toAlpha(index || 1),
      rows: 2,
      cols: 3,
      numbering: 'numeric',
      prefix: '',
      start: 1,
      descriptions: {}
    };
  }

  function getEls() {
    return {
      name: U.$('#compName'),
      company: U.$('#compCompany'),
      cost: U.$('#compCost'),
      photo: U.$('#compPhoto'),
      photoImage: U.$('#photoImage'),
      photoPlaceholder: U.$('#photoPlaceholder'),
      list: U.$('#subgroupList'),
      error: U.$('#modalError'),
      title: U.$('#componentModalTitle')
    };
  }

  function numberingOptionsHtml(current) {
    return NUMBERING_OPTIONS.map(function (opt) {
      return '<option value="' + opt.value + '"' + (opt.value === current ? ' selected' : '') + '>' + opt.label + '</option>';
    }).join('');
  }

  function subgroupCardHtml(sg) {
    return '' +
      '<article class="subgroup" data-id="' + sg.id + '">' +
        '<div class="subgroup__head">' +
          '<input class="subgroup__name" type="text" data-field="name" maxlength="40" value="' + U.escapeHtml(sg.name) + '" placeholder="Nombre del subgrupo" />' +
          '<button class="icon-btn" type="button" data-action="remove-subgroup" title="Eliminar subgrupo">✕</button>' +
        '</div>' +
        '<div class="subgroup__grid">' +
          '<label class="field"><span>Filas</span><input type="number" data-field="rows" min="1" max="30" value="' + sg.rows + '" /></label>' +
          '<label class="field"><span>Columnas</span><input type="number" data-field="cols" min="1" max="30" value="' + sg.cols + '" /></label>' +
          '<label class="field"><span>Numeración</span><select data-field="numbering">' + numberingOptionsHtml(sg.numbering) + '</select></label>' +
          '<label class="field"><span>Prefijo</span><input type="text" data-field="prefix" maxlength="4" value="' + U.escapeHtml(sg.prefix || '') + '" placeholder="—" /></label>' +
          '<label class="field"><span>Inicio</span><input type="number" data-field="start" min="1" max="999" value="' + (sg.start || 1) + '" /></label>' +
        '</div>' +
        '<div class="matrix-preview"></div>' +
        '<div class="pin-details-wrap" data-pin-details></div>' +
        '<div class="subgroup__foot"><span class="subgroup__count"></span><span>Vista previa de la matriz</span></div>' +
      '</article>';
  }

  function pinDetailsHtml(sg) {
    const pins = U.buildSubgroupPins({
      id: sg.id, rows: sg.rows, cols: sg.cols,
      numbering: sg.numbering, prefix: sg.prefix, start: sg.start,
      descriptions: sg.descriptions || {}
    });
    if (!pins.length) return '';
    return '<div class="pin-details__caption">Valor de cada pin (opcional: GND, 5V, señal…)</div>' +
      '<div class="pin-details">' +
        pins.map(function (pin) {
          const description = (sg.descriptions && sg.descriptions[pin.id]) || '';
          return '<label class="pin-detail">' +
            '<span class="pin-detail__label">' + U.escapeHtml(pin.label) + '</span>' +
            '<input type="text" data-pin-id="' + pin.id + '" maxlength="40" placeholder="GND, 5V, señal…" value="' + U.escapeHtml(description) + '" />' +
          '</label>';
        }).join('') +
      '</div>';
  }

  function refreshPinDetails(card, sg) {
    const container = U.$('[data-pin-details]', card);
    if (!container) return;
    container.innerHTML = pinDetailsHtml(sg);
  }

  function refreshPreview(card, sg) {
    const preview = U.$('.matrix-preview', card);
    const count = U.$('.subgroup__count', card);
    if (!preview) return;
    const rows = U.clamp(Math.round(Number(sg.rows) || 1), 1, 30);
    const cols = U.clamp(Math.round(Number(sg.cols) || 1), 1, 30);
    const pins = U.buildSubgroupPins({
      id: sg.id, rows: rows, cols: cols,
      numbering: sg.numbering, prefix: sg.prefix, start: sg.start,
      descriptions: sg.descriptions || {}
    });
    preview.style.gridTemplateColumns = 'repeat(' + cols + ', 34px)';
    preview.innerHTML = pins.map(function (pin) {
      const title = 'Fila ' + pin.row + ' · Columna ' + pin.col +
        (pin.description ? ' · ' + pin.description : '');
      return '<span class="matrix-cell" title="' + U.escapeHtml(title) + '">' + U.escapeHtml(pin.label) + '</span>';
    }).join('');
    if (count) count.textContent = pins.length + (pins.length === 1 ? ' pin' : ' pines');
  }

  function refreshAllPreviews() {
    if (!draft) return;
    U.$$('.subgroup', getEls().list).forEach(function (card) {
      const sg = draft.subgroups.find(function (item) { return item.id === card.dataset.id; });
      if (!sg) return;
      refreshPreview(card, sg);
      refreshPinDetails(card, sg);
    });
  }

  function renderSubgroups() {
    const els = getEls();
    els.list.innerHTML = draft.subgroups.map(subgroupCardHtml).join('');
    refreshAllPreviews();
  }

  function showPhoto() {
    const els = getEls();
    if (draft.image) {
      els.photoImage.src = draft.image;
      els.photoImage.hidden = false;
      els.photoPlaceholder.hidden = true;
    } else {
      els.photoImage.removeAttribute('src');
      els.photoImage.hidden = true;
      els.photoPlaceholder.hidden = false;
    }
  }

  function setError(message) {
    getEls().error.textContent = message || '';
  }

  const Modal = {
    init() {
      modal = U.$('#componentModal');
      if (!modal) return;

      U.$$('[data-close-modal]', modal).forEach(function (btn) {
        btn.addEventListener('click', Modal.close);
      });
      modal.addEventListener('mousedown', function (e) {
        if (e.target === modal) Modal.close();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.hidden) Modal.close();
      });

      U.$('#btnAddSubgroup').addEventListener('click', function () {
        if (!draft) return;
        const sg = newSubgroup(draft.subgroups.length + 1);
        draft.subgroups.push(sg);
        const wrap = document.createElement('div');
        wrap.innerHTML = subgroupCardHtml(sg);
        const card = wrap.firstElementChild;
        getEls().list.appendChild(card);
        refreshPreview(card, sg);
        refreshPinDetails(card, sg);
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      getEls().list.addEventListener('input', function (e) {
        const card = e.target.closest('.subgroup');
        if (!card || !draft) return;
        const sg = draft.subgroups.find(function (item) { return item.id === card.dataset.id; });
        if (!sg) return;

        const pinId = e.target.dataset ? e.target.dataset.pinId : null;
        if (pinId) {
          sg.descriptions = sg.descriptions || {};
          const text = e.target.value.slice(0, 40);
          if (text.trim()) sg.descriptions[pinId] = text;
          else delete sg.descriptions[pinId];
          return;
        }

        const field = e.target.dataset.field;
        if (!field) return;
        if (field === 'rows' || field === 'cols') {
          sg[field] = U.clamp(Math.round(Number(e.target.value) || 1), 1, 30);
        } else if (field === 'start') {
          sg.start = U.clamp(Math.round(Number(e.target.value) || 1), 1, 999);
        } else if (field === 'prefix') {
          sg.prefix = e.target.value.slice(0, 4);
        } else if (field === 'name') {
          sg.name = e.target.value;
        } else {
          sg[field] = e.target.value;
        }
        refreshPreview(card, sg);
        if (field !== 'name') refreshPinDetails(card, sg);
      });

      getEls().list.addEventListener('change', function (e) {
        if (e.target.dataset.field === 'numbering') {
          const card = e.target.closest('.subgroup');
          const sg = draft && draft.subgroups.find(function (item) { return item.id === card.dataset.id; });
          if (sg) {
            sg.numbering = e.target.value;
            refreshPreview(card, sg);
            refreshPinDetails(card, sg);
          }
        }
      });

      getEls().list.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-action="remove-subgroup"]');
        if (!btn || !draft) return;
        const card = btn.closest('.subgroup');
        draft.subgroups = draft.subgroups.filter(function (sg) { return sg.id !== card.dataset.id; });
        card.remove();
      });

      getEls().photo.addEventListener('change', function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file || !draft) return;
        setError('');
        U.fileToDataURL(file, 560).then(function (dataUrl) {
          draft.image = dataUrl;
          showPhoto();
        }).catch(function (err) {
          setError(err.message || 'No se pudo procesar la imagen.');
        }).then(function () {
          e.target.value = '';
        });
      });

      U.$('#btnRemovePhoto').addEventListener('click', function () {
        if (!draft) return;
        draft.image = '';
        showPhoto();
      });

      U.$('#btnSaveComponent').addEventListener('click', Modal.save);
    },

    open(defId) {
      if (!modal) modal = U.$('#componentModal');
      const els = getEls();
      editingId = defId || null;
      setError('');

      if (editingId) {
        const def = H.store.findDef(editingId);
        if (!def) return;
        draft = {
          id: def.id,
          name: def.name,
          company: def.company,
          cost: def.cost,
          image: def.image,
          subgroups: (def.subgroups || []).map(function (sg) {
            return {
              id: sg.id, name: sg.name, rows: sg.rows, cols: sg.cols,
              numbering: sg.numbering, prefix: sg.prefix || '', start: sg.start || 1,
              descriptions: Object.assign({}, sg.descriptions || {})
            };
          })
        };
        els.title.textContent = 'Editar componente';
      } else {
        draft = {
          id: U.uid('def'),
          name: '',
          company: '',
          cost: 0,
          image: '',
          subgroups: [newSubgroup(1)]
        };
        els.title.textContent = 'Agregar componente';
      }

      els.name.value = draft.name || '';
      els.company.value = draft.company || '';
      els.cost.value = draft.cost || '';
      renderSubgroups();
      showPhoto();

      modal.hidden = false;
      setTimeout(function () { els.name.focus(); }, 30);
    },

    close() {
      if (!modal) return;
      modal.hidden = true;
      draft = null;
      editingId = null;
      setError('');
    },

    save() {
      if (!draft) return;
      const els = getEls();
      const name = els.name.value.trim();
      if (!name) {
        setError('El nombre del conector es obligatorio.');
        els.name.focus();
        return;
      }
      const subgroups = draft.subgroups.map(function (sg) {
        const rows = U.clamp(Math.round(Number(sg.rows) || 1), 1, 30);
        const cols = U.clamp(Math.round(Number(sg.cols) || 1), 1, 30);
        const descriptions = {};
        const valid = U.buildSubgroupPins({
          id: sg.id, rows: rows, cols: cols,
          numbering: sg.numbering, prefix: sg.prefix || '', start: sg.start || 1
        });
        const validIds = new Set(valid.map(function (pin) { return pin.id; }));
        Object.keys(sg.descriptions || {}).forEach(function (pinId) {
          const text = String(sg.descriptions[pinId] || '').trim().slice(0, 40);
          if (text && validIds.has(pinId)) descriptions[pinId] = text;
        });
        return {
          id: sg.id,
          name: (sg.name || 'Sección').trim(),
          rows: rows,
          cols: cols,
          numbering: sg.numbering,
          prefix: sg.prefix || '',
          start: sg.start || 1,
          descriptions: descriptions
        };
      });

      const totalPins = subgroups.reduce(function (sum, sg) { return sum + sg.rows * sg.cols; }, 0);
      if (totalPins === 0) {
        setError('Define al menos un pin en la matriz.');
        return;
      }

      const payload = {
        name: name,
        company: els.company.value.trim(),
        cost: Number(els.cost.value) || 0,
        image: draft.image || '',
        subgroups: subgroups
      };

      let removedWires = 0;
      const wasEditing = !!editingId;
      if (editingId) {
        const before = H.store.state.wires.length;
        H.store.updateDefinition(editingId, payload);
        removedWires = before - H.store.state.wires.length;
      } else {
        H.store.addDefinition(Object.assign({ id: draft.id }, payload));
      }

      Modal.close();
      if (H.App && H.App.toast) {
        H.App.toast(wasEditing ? 'Componente actualizado.' : 'Componente “' + name + '” agregado a la biblioteca.', 'ok');
        if (removedWires > 0) {
          H.App.toast('Se eliminaron ' + removedWires + ' chicotes cuyos pines ya no existen.', 'warn', 5000);
        }
      }
    }
  };

  H.ComponentModal = Modal;
})(window.Harness);
