/* Charts module — Chart.js wrappers with theme-aware re-rendering.
   Minimalist palette: teal accent, muted category tints, thin lines, no gradients. */
(function (global) {
  'use strict';

  const charts = { category: null, monthly: null, mom: null };

  function getCss(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function catColors() {
    return {
      food: getCss('--cat-food'),
      vet: getCss('--cat-vet'),
      grooming: getCss('--cat-grooming'),
      toys: getCss('--cat-toys'),
      meds: getCss('--cat-meds'),
      other: getCss('--cat-other')
    };
  }

  function baseOpts() {
    const text = getCss('--text');
    const muted = getCss('--text-muted');
    const border = getCss('--border');
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 4 },
      plugins: {
        legend: { labels: { color: text, font: { size: 12, family: 'inherit', weight: '500' }, boxWidth: 10, boxHeight: 10 } },
        tooltip: {
          backgroundColor: getCss('--surface'),
          borderColor: border,
          borderWidth: 1,
          titleColor: text,
          bodyColor: text,
          titleFont: { weight: '500' },
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: {
          ticks: { color: muted, font: { family: 'inherit', size: 11 } },
          grid: { display: false },
          border: { color: border }
        },
        y: {
          ticks: { color: muted, font: { family: 'inherit', size: 11 } },
          grid: { color: border, drawBorder: false },
          border: { display: false },
          beginAtZero: true
        }
      }
    };
  }

  function destroy(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function renderCategory(canvas, dataByCat, currencyFmt) {
    if (typeof Chart === 'undefined') return;
    destroy('category');
    const labels = Object.keys(dataByCat);
    const values = Object.values(dataByCat);
    const colors = catColors();
    const bg = labels.map((c) => colors[c] || colors.other);

    charts.category = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels.map((c) => c.charAt(0).toUpperCase() + c.slice(1)),
        datasets: [{
          data: values,
          backgroundColor: bg,
          borderWidth: 2,
          borderColor: getCss('--surface'),
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: getCss('--text'), padding: 12, font: { family: 'inherit', size: 12, weight: '500' }, boxWidth: 10, boxHeight: 10 } },
          tooltip: {
            backgroundColor: getCss('--surface'),
            borderColor: getCss('--border'),
            borderWidth: 1,
            titleColor: getCss('--text'),
            bodyColor: getCss('--text'),
            padding: 10,
            callbacks: { label: (ctx) => `${ctx.label}: ${currencyFmt(ctx.parsed)}` }
          }
        },
        cutout: '64%'
      }
    });
  }

  function renderMonthly(canvas, monthsData, currencyFmt) {
    if (typeof Chart === 'undefined') return;
    destroy('monthly');
    const opts = baseOpts();
    opts.plugins.legend.display = false;
    opts.plugins.tooltip.callbacks = { label: (ctx) => currencyFmt(ctx.parsed.y) };

    charts.monthly = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: monthsData.map((m) => m.label),
        datasets: [{
          data: monthsData.map((m) => m.total),
          backgroundColor: getCss('--accent'),
          borderRadius: 4,
          maxBarThickness: 32
        }]
      },
      options: opts
    });
  }

  function renderMoM(canvas, points, currencyFmt) {
    if (typeof Chart === 'undefined') return;
    destroy('mom');
    const opts = baseOpts();
    opts.plugins.legend.display = false;
    opts.plugins.tooltip.callbacks = { label: (ctx) => currencyFmt(ctx.parsed.y) };

    const accent = getCss('--accent');

    charts.mom = new Chart(canvas, {
      type: 'line',
      data: {
        labels: points.map((p) => p.label),
        datasets: [{
          data: points.map((p) => p.total),
          borderColor: accent,
          backgroundColor: 'transparent',
          tension: 0.25,
          fill: false,
          pointBackgroundColor: getCss('--surface'),
          pointBorderColor: accent,
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2
        }]
      },
      options: opts
    });
  }

  function destroyAll() {
    Object.keys(charts).forEach((k) => destroy(k));
  }

  global.DBPCharts = { renderCategory, renderMonthly, renderMoM, destroy, destroyAll };
})(window);
