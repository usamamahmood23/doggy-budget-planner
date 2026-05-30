/* Doggy Budget Planner — app logic, routing, rendering */
(function () {
  'use strict';

  const S = window.DBPStorage;
  const C = window.DBPCharts;

  const CAT_META = {
    food:     { label: 'Food' },
    vet:      { label: 'Vet' },
    grooming: { label: 'Grooming' },
    toys:     { label: 'Toys' },
    meds:     { label: 'Meds' },
    other:    { label: 'Other' }
  };

  let currentView = 'dashboard';
  let editingExpenseId = null;
  let deferredInstall = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // -------- Currency / formatting --------
  function formatCurrency(amount) {
    const data = S.getAll();
    const code = data.currency || 'USD';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 2
      }).format(amount || 0);
    } catch (e) {
      return `${code} ${Number(amount || 0).toLocaleString()}`;
    }
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function ymKey(d) { return d.slice(0, 7); }
  function thisMonth() { return todayISO().slice(0, 7); }

  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short', year: '2-digit' });
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const a = new Date(iso + 'T00:00:00');
    const b = new Date(); b.setHours(0, 0, 0, 0);
    return Math.ceil((a - b) / 86400000);
  }

  // -------- Toast --------
  function toast(msg, type = '') {
    const host = $('#toast-host');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // -------- Theme (light default; only light/dark, no auto) --------
  function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    const meta = $('#meta-theme-color');
    if (meta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
      meta.setAttribute('content', bg || '#ffffff');
    }
    if (currentView === 'analytics') renderAnalytics();
  }

  function initTheme() {
    const data = S.getAll();
    applyTheme(data.settings.theme || 'light');
  }

  // -------- Routing --------
  function navigate(view) {
    currentView = view;
    $$('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== view));
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderView(view);
  }

  function renderView(view) {
    switch (view) {
      case 'dashboard': renderDashboard(); break;
      case 'expenses': renderExpenses(); break;
      case 'savings': renderSavings(); break;
      case 'analytics': renderAnalytics(); break;
      case 'settings': renderSettings(); break;
    }
  }

  // -------- Dog chip in header --------
  function renderDogChip() {
    const d = S.getAll().dog;
    const chip = $('#dog-chip');
    if (!d.name) { chip.innerHTML = ''; return; }
    const img = d.photo ? `<img src="${d.photo}" alt="" />` : '';
    chip.innerHTML = `${img}<span>${escapeHtml(d.name)}</span>`;
  }

  // -------- Dashboard --------
  function thisMonthExpenses() {
    const ym = thisMonth();
    return S.getAll().expenses.filter((e) => e.date.startsWith(ym));
  }

  function renderDashboard() {
    const data = S.getAll();
    const monthExp = thisMonthExpenses();
    const totalSpent = monthExp.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalBudget = Object.values(data.budgets).reduce((s, v) => s + Number(v || 0), 0);
    const pct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;

    // Greeting
    const name = data.dog.name || 'friend';
    document.querySelector('[data-greeting]').textContent = `Saving for ${name}`;
    document.querySelector('[data-sub]').textContent = `Here's how this month is going.`;

    // Ring
    const ringFg = $('#ring-fg');
    const C_LEN = 2 * Math.PI * 52;
    ringFg.style.strokeDashoffset = String(C_LEN - (C_LEN * Math.min(100, totalBudget ? (totalSpent / totalBudget) * 100 : 0)) / 100);
    ringFg.classList.toggle('warn', pct >= 80 && pct < 100);
    ringFg.classList.toggle('over', pct >= 100 && totalBudget > 0);
    $('#ring-pct').textContent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) + '%' : '—';

    $('#hero-spent').textContent = formatCurrency(totalSpent);
    $('#hero-budget').textContent = totalBudget > 0 ? formatCurrency(totalBudget) : 'Not set';
    $('#hero-remaining').textContent = totalBudget > 0 ? formatCurrency(Math.max(0, totalBudget - totalSpent)) : '—';

    // Category bars
    const wrap = $('#category-bars');
    if (!totalBudget && monthExp.length === 0) {
      wrap.innerHTML = `<p class="empty">Set monthly budgets in Settings to see progress.</p>`;
    } else {
      wrap.innerHTML = Object.keys(CAT_META).map((cat) => {
        const spent = monthExp.filter((e) => e.category === cat).reduce((s, e) => s + Number(e.amount || 0), 0);
        const budget = Number(data.budgets[cat] || 0);
        const p = budget > 0 ? (spent / budget) * 100 : 0;
        const cls = p >= 100 ? 'over' : p >= 80 ? 'warn' : '';
        return `
          <div class="cat-row">
            <div class="cat-row__top">
              <span class="cat-row__label"><span class="cat-dot ${cat}"></span>${CAT_META[cat].label}</span>
              <span class="cat-row__values">${formatCurrency(spent)} / ${budget ? formatCurrency(budget) : '—'}</span>
            </div>
            <div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.min(100, p)}%"></div></div>
          </div>`;
      }).join('');
    }

    // Goals
    const goalHost = $('#dashboard-goals');
    if (data.goals.length === 0) {
      goalHost.innerHTML = `<p class="empty">No savings goals yet — create one in the Savings tab.</p>`;
    } else {
      goalHost.innerHTML = data.goals.slice(0, 4).map((g) => goalCardHTML(g, false)).join('');
    }

    renderDogChip();
  }

  // -------- Expenses --------
  function renderExpenses() {
    const form = $('#expense-form');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', onExpenseSubmit);
      $('#expense-cancel').addEventListener('click', resetExpenseForm);
      $('#expense-search').addEventListener('input', renderExpenseList);
      $('#expense-filter-cat').addEventListener('change', renderExpenseList);
      $('#expense-filter-month').addEventListener('change', renderExpenseList);
      $('#expense-sort').addEventListener('change', renderExpenseList);
    }
    if (!form.querySelector('[name="date"]').value) {
      form.querySelector('[name="date"]').value = todayISO();
    }
    populateMonthFilter();
    renderExpenseList();
  }

  function populateMonthFilter() {
    const sel = $('#expense-filter-month');
    const prev = sel.value;
    const data = S.getAll();
    const months = Array.from(new Set(data.expenses.map((e) => ymKey(e.date)))).sort().reverse();
    sel.innerHTML = `<option value="">All months</option>` + months.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join('');
    if (prev) sel.value = prev;
  }

  function renderExpenseList() {
    const data = S.getAll();
    const list = $('#expense-list');
    const search = $('#expense-search').value.toLowerCase().trim();
    const fc = $('#expense-filter-cat').value;
    const fm = $('#expense-filter-month').value;
    const sort = $('#expense-sort').value;

    let items = data.expenses.slice();
    if (search) items = items.filter((e) => (e.note || '').toLowerCase().includes(search));
    if (fc) items = items.filter((e) => e.category === fc);
    if (fm) items = items.filter((e) => e.date.startsWith(fm));

    items.sort((a, b) => {
      if (sort === 'date-asc') return a.date.localeCompare(b.date);
      if (sort === 'date-desc') return b.date.localeCompare(a.date);
      if (sort === 'amount-asc') return a.amount - b.amount;
      if (sort === 'amount-desc') return b.amount - a.amount;
      return 0;
    });

    if (items.length === 0) {
      list.innerHTML = `<li class="empty">No expenses yet — add your first one.</li>`;
      return;
    }
    list.innerHTML = items.map(expenseItemHTML).join('');
    list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editExpense(b.dataset.edit)));
    list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteExpense(b.dataset.del)));
  }

  function expenseItemHTML(e) {
    const meta = CAT_META[e.category] || CAT_META.other;
    const dateStr = new Date(e.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const rec = e.recurring ? ' <span class="muted">· recurring</span>' : '';
    return `
      <li class="expense-item">
        <span class="cat-chip"><span class="cat-dot ${e.category}"></span>${meta.label}</span>
        <div class="expense-meta">
          <div class="expense-note">${escapeHtml(e.note || meta.label)}${rec}</div>
          <div class="expense-date">${dateStr}</div>
        </div>
        <div class="expense-amount">${formatCurrency(e.amount)}</div>
        <div class="expense-actions">
          <button class="icon-btn" data-edit="${e.id}" aria-label="Edit"><svg><use href="#i-edit"/></svg></button>
          <button class="icon-btn" data-del="${e.id}" aria-label="Delete"><svg><use href="#i-trash"/></svg></button>
        </div>
      </li>`;
  }

  function onExpenseSubmit(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const amount = parseFloat(fd.get('amount'));
    const category = fd.get('category');
    const date = fd.get('date');
    const note = (fd.get('note') || '').toString().trim();
    const recurring = fd.get('recurring') === 'on';

    clearErrors(form);
    let ok = true;
    if (!(amount > 0)) { setError(form, 'amount', 'Enter a positive amount'); ok = false; }
    if (!date) { setError(form, 'date', 'Choose a date'); ok = false; }
    if (!ok) return;

    if (editingExpenseId) {
      S.updateExpense(editingExpenseId, { amount, category, date, note, recurring });
      toast('Expense updated', 'success');
    } else {
      S.addExpense({ amount, category, date, note, recurring });
      toast('Expense added', 'success');
    }
    resetExpenseForm();
    populateMonthFilter();
    renderExpenseList();
    if (currentView === 'dashboard') renderDashboard();
  }

  function editExpense(id) {
    const e = S.getAll().expenses.find((x) => x.id === id);
    if (!e) return;
    editingExpenseId = id;
    const form = $('#expense-form');
    form.querySelector('[name="amount"]').value = e.amount;
    form.querySelector('[name="category"]').value = e.category;
    form.querySelector('[name="date"]').value = e.date;
    form.querySelector('[name="note"]').value = e.note || '';
    form.querySelector('[name="recurring"]').checked = !!e.recurring;
    $('#expense-submit').textContent = 'Save changes';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
    S.deleteExpense(id);
    toast('Expense deleted');
    populateMonthFilter();
    renderExpenseList();
  }

  function resetExpenseForm() {
    editingExpenseId = null;
    const form = $('#expense-form');
    form.reset();
    form.querySelector('[name="date"]').value = todayISO();
    clearErrors(form);
    $('#expense-submit').textContent = 'Add expense';
  }

  // -------- Savings --------
  function renderSavings() {
    const form = $('#goal-form');
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', onGoalSubmit);
    }
    renderGoalList();
  }

  function renderGoalList() {
    const data = S.getAll();
    const host = $('#goal-list');
    if (data.goals.length === 0) {
      host.innerHTML = `<p class="empty">No goals yet — create one above to start saving.</p>`;
      return;
    }
    host.innerHTML = data.goals.map((g) => goalCardHTML(g, true)).join('');
    host.querySelectorAll('[data-contrib]').forEach((b) => b.addEventListener('click', () => contributeGoal(b.dataset.contrib)));
    host.querySelectorAll('[data-delgoal]').forEach((b) => b.addEventListener('click', () => deleteGoal(b.dataset.delgoal)));
  }

  function goalCardHTML(g, withActions) {
    const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    const days = daysUntil(g.targetDate);
    const dayLine = g.targetDate
      ? (days >= 0 ? `${days} day${days === 1 ? '' : 's'} left` : `${-days} days overdue`)
      : 'No deadline';
    const actions = withActions
      ? `<div class="goal-card__actions">
          <button class="btn btn-ghost btn-sm" data-contrib="${g.id}">Add contribution</button>
          <button class="btn btn-ghost btn-sm" data-delgoal="${g.id}">Delete</button>
        </div>`
      : '';
    return `
      <div class="goal-card">
        <div class="goal-card__head">
          <span class="goal-card__name">${escapeHtml(g.name)}</span>
          <span class="goal-card__pct">${Math.round(pct)}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="goal-card__sub">
          <span>${formatCurrency(g.saved)} / ${formatCurrency(g.target)}</span>
          <span>${dayLine}</span>
        </div>
        ${actions}
      </div>`;
  }

  function onGoalSubmit(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const name = (fd.get('name') || '').toString().trim();
    const target = parseFloat(fd.get('target'));
    const targetDate = fd.get('targetDate') || '';

    clearErrors(form);
    let ok = true;
    if (!name) { setError(form, 'name', 'Name is required'); ok = false; }
    if (!(target > 0)) { setError(form, 'target', 'Target must be > 0'); ok = false; }
    if (!ok) return;

    S.addGoal({ name, target, targetDate });
    toast('Goal created', 'success');
    form.reset();
    renderGoalList();
  }

  function contributeGoal(id) {
    const raw = prompt('Contribution amount:');
    if (raw === null) return;
    const amount = parseFloat(raw);
    if (!(amount > 0)) { toast('Enter a positive amount', 'error'); return; }
    const before = S.getAll().goals.find((g) => g.id === id);
    S.addContribution(id, amount);
    const after = S.getAll().goals.find((g) => g.id === id);
    renderGoalList();
    if (currentView === 'dashboard') renderDashboard();
    if (before && after && before.saved < before.target && after.saved >= after.target) {
      celebrate(`${after.name} reached 100%`);
    } else {
      toast('Contribution added', 'success');
    }
  }

  function deleteGoal(id) {
    if (!confirm('Delete this goal? Contributions cannot be recovered.')) return;
    S.deleteGoal(id);
    renderGoalList();
    if (currentView === 'dashboard') renderDashboard();
    toast('Goal deleted');
  }

  // -------- Confetti --------
  function celebrate(msg) {
    toast(msg, 'celebrate');
    const canvas = $('#confetti');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0d9488';
    const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent-hover').trim() || '#14b8a6';
    const colors = [accent, accent2, '#94a3b8', '#cbd5e1', '#0f172a'];
    const N = 120;
    const parts = [];
    for (let i = 0; i < N; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.3,
        vx: (Math.random() - 0.5) * 5,
        vy: 2 + Math.random() * 4,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    let start = performance.now();
    function frame(t) {
      const elapsed = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (elapsed < 3500) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(frame);
  }

  // -------- Analytics --------
  function renderAnalytics() {
    const data = S.getAll();
    const monthSel = $('#analytics-month');
    if (!monthSel.dataset.bound) {
      monthSel.dataset.bound = '1';
      monthSel.addEventListener('change', renderAnalytics);
    }
    const months = Array.from(new Set(data.expenses.map((e) => ymKey(e.date)))).sort().reverse();
    if (months.length === 0) months.push(thisMonth());
    const cur = monthSel.value && months.includes(monthSel.value) ? monthSel.value : months[0];
    monthSel.innerHTML = months.map((m) => `<option value="${m}" ${m === cur ? 'selected' : ''}>${monthLabel(m)}</option>`).join('');

    // by-category
    const byCat = {};
    Object.keys(CAT_META).forEach((c) => { byCat[c] = 0; });
    data.expenses.filter((e) => e.date.startsWith(cur)).forEach((e) => {
      byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
    });
    const hasAny = Object.values(byCat).some((v) => v > 0);
    $('#chart-category-empty').classList.toggle('hidden', hasAny);
    if (hasAny) {
      const filtered = {};
      Object.keys(byCat).forEach((k) => { if (byCat[k] > 0) filtered[k] = byCat[k]; });
      C.renderCategory($('#chart-category'), filtered, formatCurrency);
    }

    // monthly (last 6)
    const points = [];
    const now = new Date(); now.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now); d.setMonth(d.getMonth() - i);
      const ym = d.toISOString().slice(0, 7);
      const total = data.expenses.filter((e) => e.date.startsWith(ym)).reduce((s, e) => s + Number(e.amount || 0), 0);
      points.push({ label: monthLabel(ym), total: +total.toFixed(2), ym });
    }
    C.renderMonthly($('#chart-monthly'), points, formatCurrency);

    // mom
    const ymThis = thisMonth();
    const dPrev = new Date(); dPrev.setDate(1); dPrev.setMonth(dPrev.getMonth() - 1);
    const ymPrev = dPrev.toISOString().slice(0, 7);
    const totalThis = data.expenses.filter((e) => e.date.startsWith(ymThis)).reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalPrev = data.expenses.filter((e) => e.date.startsWith(ymPrev)).reduce((s, e) => s + Number(e.amount || 0), 0);
    C.renderMoM($('#chart-mom'), [
      { label: monthLabel(ymPrev), total: +totalPrev.toFixed(2) },
      { label: monthLabel(ymThis), total: +totalThis.toFixed(2) }
    ], formatCurrency);
  }

  // -------- Settings --------
  function renderSettings() {
    const data = S.getAll();

    const dogForm = $('#dog-form');
    if (!dogForm.dataset.bound) {
      dogForm.dataset.bound = '1';
      dogForm.addEventListener('submit', onDogSubmit);
      $('#dog-photo').addEventListener('change', onPhotoChange);
    }
    dogForm.querySelector('[name="name"]').value = data.dog.name || '';
    dogForm.querySelector('[name="breed"]').value = data.dog.breed || '';
    dogForm.querySelector('[name="ageYears"]').value = data.dog.ageYears || '';
    dogForm.querySelector('[name="weightKg"]').value = data.dog.weightKg || '';
    renderDogPhotoPreview(data.dog.photo);

    const budgetForm = $('#budget-form');
    if (!budgetForm.dataset.bound) {
      budgetForm.dataset.bound = '1';
      budgetForm.addEventListener('submit', onBudgetSubmit);
    }
    Object.keys(CAT_META).forEach((cat) => {
      const el = budgetForm.querySelector(`[name="${cat}"]`);
      if (el) el.value = data.budgets[cat] || '';
    });

    const curSel = $('#currency-select');
    if (!curSel.dataset.bound) {
      curSel.dataset.bound = '1';
      curSel.addEventListener('change', () => {
        S.setCurrency(curSel.value);
        toast('Currency updated', 'success');
        renderDogChip();
        if (currentView !== 'settings') renderView(currentView);
      });
    }
    curSel.value = data.currency || 'USD';

    $$('input[name="theme"]').forEach((r) => {
      r.checked = r.value === (data.settings.theme || 'light');
      if (!r.dataset.bound) {
        r.dataset.bound = '1';
        r.addEventListener('change', () => {
          S.setSettings({ theme: r.value });
          applyTheme(r.value);
          toast(`Theme set to ${r.value}`, 'success');
        });
      }
    });

    bindOnce($('#btn-export-json'), 'click', exportBackup);
    bindOnce($('#import-json-input'), 'change', importBackup);
    bindOnce($('#btn-export-csv'), 'click', exportCSV);
    bindOnce($('#btn-reset'), 'click', resetAll);
  }

  function bindOnce(el, ev, fn) {
    if (!el || el.dataset['b_' + ev]) return;
    el.dataset['b_' + ev] = '1';
    el.addEventListener(ev, fn);
  }

  function onDogSubmit(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    S.setDog({
      name: (fd.get('name') || '').toString().trim(),
      breed: (fd.get('breed') || '').toString().trim(),
      ageYears: fd.get('ageYears') ? Number(fd.get('ageYears')) : null,
      weightKg: fd.get('weightKg') ? Number(fd.get('weightKg')) : null
    });
    toast('Profile saved', 'success');
    renderDogChip();
    if (currentView === 'dashboard') renderDashboard();
  }

  function onBudgetSubmit(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const patch = {};
    Object.keys(CAT_META).forEach((cat) => {
      const v = fd.get(cat);
      patch[cat] = v ? Math.max(0, Number(v)) : 0;
    });
    S.setBudgets(patch);
    toast('Budgets saved', 'success');
  }

  function onPhotoChange(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('Image too large (max 10 MB)', 'error'); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 320;
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      S.setDog({ photo: dataUrl });
      renderDogPhotoPreview(dataUrl);
      renderDogChip();
      toast('Photo updated', 'success');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read image', 'error'); };
    img.src = url;
  }

  function renderDogPhotoPreview(src) {
    const host = $('#dog-photo-preview');
    host.innerHTML = src ? `<img src="${src}" alt="Dog photo" />` : '';
  }

  function exportBackup() {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    downloadBlob(blob, `doggy-budget-backup-${todayISO()}.json`);
    toast('Backup downloaded', 'success');
  }

  function importBackup(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!confirm('Importing will replace all current data. Continue?')) {
        ev.target.value = '';
        return;
      }
      const res = S.importJSON(reader.result);
      if (res.ok) {
        toast('Backup restored', 'success');
        renderView(currentView);
        renderDogChip();
        initTheme();
        renderSettings();
      } else {
        toast('Invalid backup file', 'error');
      }
      ev.target.value = '';
    };
    reader.onerror = () => toast('Could not read file', 'error');
    reader.readAsText(file);
  }

  function exportCSV() {
    const csv = S.exportExpensesCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `doggy-budget-expenses-${todayISO()}.csv`);
    toast('CSV downloaded', 'success');
  }

  function resetAll() {
    if (!confirm('This will erase ALL your data. Continue?')) return;
    if (!confirm('Really reset everything? This cannot be undone.')) return;
    S.reset();
    toast('All data reset', 'success');
    renderDogChip();
    applyTheme('light');
    navigate('dashboard');
    renderSettings();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // -------- Helpers --------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function setError(form, name, msg) {
    const el = form.querySelector(`[data-err="${name}"]`);
    if (el) el.textContent = msg;
  }
  function clearErrors(form) {
    form.querySelectorAll('.err').forEach((e) => (e.textContent = ''));
  }

  // -------- Install banner --------
  function setupInstallBanner() {
    const banner = $('#install-banner');
    const accept = $('#install-accept');
    const dismiss = $('#install-dismiss');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstall = e;
      const data = S.getAll();
      if (data.settings.installPromptDismissed) return;
      if (window.matchMedia('(display-mode: standalone)').matches) return;
      banner.classList.remove('hidden');
    });

    accept.addEventListener('click', async () => {
      if (!deferredInstall) { banner.classList.add('hidden'); return; }
      deferredInstall.prompt();
      const { outcome } = await deferredInstall.userChoice;
      banner.classList.add('hidden');
      if (outcome === 'accepted') toast('Installing…', 'success');
      deferredInstall = null;
    });

    dismiss.addEventListener('click', () => {
      banner.classList.add('hidden');
      S.setSettings({ installPromptDismissed: true });
    });

    window.addEventListener('appinstalled', () => {
      banner.classList.add('hidden');
      toast('App installed', 'success');
    });

    if (window.matchMedia('(display-mode: standalone)').matches) {
      banner.classList.add('hidden');
    }
  }

  // -------- Service worker --------
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('SW registration failed', err);
      });
    });
  }

  // -------- Boot --------
  function boot() {
    if (!S.isStorageAvailable()) {
      toast('Storage unavailable — data will not persist', 'error');
    }
    S.seedIfNeeded();
    initTheme();
    renderDogChip();

    $$('.nav-btn').forEach((b) => {
      b.addEventListener('click', () => navigate(b.dataset.nav));
    });
    $('#fab-add-expense').addEventListener('click', () => {
      navigate('expenses');
      setTimeout(() => {
        const el = $('#expense-form [name="amount"]');
        if (el) el.focus();
      }, 200);
    });

    window.addEventListener('dbp:storage-error', () => {
      toast('Storage full — try removing the dog photo', 'error');
    });

    setupInstallBanner();
    registerSW();

    // Old #reminders URLs (or any unknown view) → dashboard
    const validViews = ['dashboard', 'expenses', 'savings', 'analytics', 'settings'];
    const hash = (location.hash || '').replace('#', '');
    const initialView = validViews.includes(hash) ? hash : 'dashboard';
    if (hash && !validViews.includes(hash)) {
      try { history.replaceState(null, '', '#dashboard'); } catch (_) {}
    }
    navigate(initialView);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
