/* ============================================================
   bom-view.js · Lista de materiales (BOM)
   ============================================================ */
(function (H) {
  'use strict';

  const U = H.Utils;
  let root = null;

  function meters(mm) {
    return (Math.max(0, Number(mm) || 0) / 1000);
  }

  function buildData() {
    const state = H.store.state;
    const connectorMap = new Map();

    state.components.forEach(function (comp) {
      const def = H.store.findDef(comp.defId);
      if (!def) return;
      let row = connectorMap.get(def.id);
      if (!row) {
        row = {
          id: def.id,
          name: def.name,
          company: def.company || 'Sin fabricante',
          pins: (def.pins || []).length,
          unitCost: Number(def.cost) || 0,
          qty: 0
        };
        connectorMap.set(def.id, row);
      }
      row.qty += 1;
    });

    const connectors = Array.from(connectorMap.values()).map(function (row) {
      row.pinsTotal = row.pins * row.qty;
      row.subtotal = row.unitCost * row.qty;
      return row;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });

    const cableMap = new Map();
    function addCable(color, lengthMm, kind) {
      const key = String(color || '#475569').toLowerCase();
      let row = cableMap.get(key);
      if (!row) {
        row = { color: key, wires: 0, branches: 0, taps: 0, circuits: 0, mm: 0 };
        cableMap.set(key, row);
      }
      row.circuits += 1;
      if (kind === 'branch') row.branches += 1;
      else if (kind === 'tap') row.taps += 1;
      else row.wires += 1;
      row.mm += Math.max(0, Number(lengthMm) || 0);
    }

    state.wires.forEach(function (wire) {
      addCable(wire.color || '#334155', wire.length, 'wire');
    });
    state.branches.forEach(function (branch) {
      addCable(branch.color || '#475569', branch.length, 'branch');
    });
    state.taps.forEach(function (tap) {
      addCable(tap.color || '#475569', tap.length, 'tap');
    });

    const cables = Array.from(cableMap.values()).sort(function (a, b) {
      return b.mm - a.mm;
    });

    const totals = {
      distinct: connectors.length,
      instances: connectors.reduce(function (sum, row) { return sum + row.qty; }, 0),
      pins: connectors.reduce(function (sum, row) { return sum + row.pinsTotal; }, 0),
      wires: state.wires.length,
      branches: state.branches.length,
      taps: state.taps.length,
      cableMm: cables.reduce(function (sum, row) { return sum + row.mm; }, 0),
      cost: connectors.reduce(function (sum, row) { return sum + row.subtotal; }, 0)
    };
    totals.cableM = meters(totals.cableMm);

    return { connectors: connectors, cables: cables, totals: totals };
  }

  function stat(label, value, modifier) {
    return '<div class="bom-stat' + (modifier ? ' bom-stat--' + modifier : '') + '">' +
      '<span>' + U.escapeHtml(label) + '</span>' +
      '<strong>' + U.escapeHtml(value) + '</strong>' +
    '</div>';
  }

  function connectorsTable(data) {
    if (!data.connectors.length) {
      return '<div class="bom-empty"><strong>Sin conectores</strong><span>Agrega componentes al lienzo para verlos en el BOM.</span></div>';
    }
    const rows = data.connectors.map(function (row) {
      return '<tr>' +
        '<td>' + U.escapeHtml(row.name) + '</td>' +
        '<td>' + U.escapeHtml(row.company) + '</td>' +
        '<td class="num">' + row.pins + '</td>' +
        '<td class="num">' + row.qty + '</td>' +
        '<td class="num">' + row.pinsTotal + '</td>' +
        '<td class="num">' + U.formatMoney(row.unitCost) + '</td>' +
        '<td class="num">' + U.formatMoney(row.subtotal) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="bom-table-wrap"><table class="bom-table">' +
      '<thead><tr>' +
        '<th>Componente</th><th>Compañía</th><th class="num">Pines / conector</th>' +
        '<th class="num">Cantidad</th><th class="num">Pines totales</th>' +
        '<th class="num">Costo unitario</th><th class="num">Subtotal</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr>' +
        '<td colspan="3">Total</td>' +
        '<td class="num">' + data.totals.instances + '</td>' +
        '<td class="num">' + data.totals.pins + '</td>' +
        '<td class="num">—</td>' +
        '<td class="num">' + U.formatMoney(data.totals.cost) + '</td>' +
      '</tr></tfoot>' +
    '</table></div>';
  }

  function cablesTable(data) {
    if (!data.cables.length) {
      return '<div class="bom-empty"><strong>Sin cable</strong><span>Crea chicotes y asígnales longitud manual para calcular los metros.</span></div>';
    }
    const rows = data.cables.map(function (row) {
      return '<tr>' +
        '<td><span class="bom-swatch" style="background:' + U.escapeHtml(row.color) + '"></span>' + U.escapeHtml(row.color.toUpperCase()) + '</td>' +
        '<td class="num">' + row.wires + '</td>' +
        '<td class="num">' + row.branches + '</td>' +
        '<td class="num">' + row.taps + '</td>' +
        '<td class="num">' + row.circuits + '</td>' +
        '<td class="num">' + U.formatNumber(meters(row.mm), 2) + ' m</td>' +
      '</tr>';
    }).join('');

    return '<div class="bom-table-wrap"><table class="bom-table">' +
      '<thead><tr>' +
        '<th>Color de cable</th><th class="num">Chicotes</th><th class="num">Ramificaciones</th>' +
        '<th class="num">Empalmes</th><th class="num">Circuitos</th><th class="num">Longitud</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr>' +
        '<td>Total</td>' +
        '<td class="num">' + data.totals.wires + '</td>' +
        '<td class="num">' + data.totals.branches + '</td>' +
        '<td class="num">' + data.totals.taps + '</td>' +
        '<td class="num">' + (data.totals.wires + data.totals.branches + data.totals.taps) + '</td>' +
        '<td class="num">' + U.formatNumber(data.totals.cableM, 2) + ' m</td>' +
      '</tr></tfoot>' +
    '</table></div>';
  }

  function renderHtml(data) {
    const totals = data.totals;
    return '<div class="bom">' +
      '<header class="bom__head">' +
        '<div>' +
          '<h2>Lista de materiales (BOM)</h2>' +
          '<p>Conectores, cantidades y metros de cable del arnés. Las longitudes son los valores manuales asignados.</p>' +
        '</div>' +
        '<div class="bom__actions">' +
          '<button class="btn btn--primary" type="button" data-bom-action="export-csv">Exportar CSV</button>' +
        '</div>' +
      '</header>' +
      '<div class="bom__stats">' +
        stat('Conectores distintos', String(totals.distinct)) +
        stat('Instancias colocadas', String(totals.instances)) +
        stat('Pines totales', String(totals.pins)) +
        stat('Chicotes', String(totals.wires)) +
        stat('Ramificaciones', String(totals.branches)) +
        stat('Empalmes', String(totals.taps)) +
        stat('Cable total', U.formatNumber(totals.cableM, 2) + ' m', 'accent') +
        stat('Costo conectores', U.formatMoney(totals.cost), 'ok') +
      '</div>' +
      '<section class="bom-card">' +
        '<div class="bom-card__head"><h3>Conectores</h3><span>' + totals.distinct + ' referencia(s) · ' + totals.instances + ' pieza(s)</span></div>' +
        connectorsTable(data) +
      '</section>' +
      '<section class="bom-card">' +
        '<div class="bom-card__head"><h3>Cable por color</h3><span>' + U.formatNumber(totals.cableM, 2) + ' m en total</span></div>' +
        cablesTable(data) +
      '</section>' +
      '<p class="bom-note">El total de cable suma chicotes, ramificaciones y empalmes. Asigna o corrige longitudes en las propiedades de cada elemento del layout o esquema.</p>' +
    '</div>';
  }

  function csvField(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    const data = buildData();
    const rows = [];
    const push = function (values) { rows.push(values); };

    push(['BOM del arnés']);
    push([]);
    push(['Conectores']);
    push(['Componente', 'Compañía', 'Pines por conector', 'Cantidad', 'Pines totales', 'Costo unitario (USD)', 'Subtotal (USD)']);
    data.connectors.forEach(function (row) {
      push([row.name, row.company, row.pins, row.qty, row.pinsTotal, row.unitCost.toFixed(2), row.subtotal.toFixed(2)]);
    });
    push(['Total', '', '', data.totals.instances, data.totals.pins, '', data.totals.cost.toFixed(2)]);
    push([]);
    push(['Cable por color']);
    push(['Color', 'Chicotes', 'Ramificaciones', 'Empalmes', 'Circuitos', 'Longitud (m)']);
    data.cables.forEach(function (row) {
      push([row.color, row.wires, row.branches, row.taps, row.circuits, meters(row.mm).toFixed(3)]);
    });
    push(['Total', data.totals.wires, data.totals.branches, data.totals.taps,
      data.totals.wires + data.totals.branches + data.totals.taps, data.totals.cableM.toFixed(3)]);
    push([]);
    push(['Resumen']);
    push(['Conectores distintos', data.totals.distinct]);
    push(['Instancias colocadas', data.totals.instances]);
    push(['Pines totales', data.totals.pins]);
    push(['Chicotes', data.totals.wires]);
    push(['Ramificaciones', data.totals.branches]);
    push(['Empalmes', data.totals.taps]);
    push(['Cable total (m)', data.totals.cableM.toFixed(3)]);
    push(['Costo conectores (USD)', data.totals.cost.toFixed(2)]);

    const csv = rows.map(function (row) {
      return row.map(csvField).join(',');
    }).join('\r\n');

    U.download(H.App.fileName('csv'), '\uFEFF' + csv, 'text/csv;charset=utf-8');
    if (H.App) H.App.toast('BOM exportado en CSV.', 'ok');
  }

  const Bom = {
    init() {
      root = U.$('#bomView');
      if (!root) return;
      root.addEventListener('click', function (event) {
        const button = event.target.closest('[data-bom-action="export-csv"]');
        if (button) exportCsv();
      });
    },

    render() {
      if (!root) root = U.$('#bomView');
      if (!root) return;
      root.innerHTML = renderHtml(buildData());
    },

    buildData: buildData,
    exportCsv: exportCsv
  };

  H.Bom = Bom;
})(window.Harness);
