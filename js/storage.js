/* Storage module — single localStorage namespace, JSON backup/restore */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'dbp_data_v1';
  const MIGRATION_KEY = 'dbp_migration_v2';

  // One-time pre-launch data wipe. Runs at most once per browser:
  //   - first load ever: flag absent → wipe dbp_data_v1, set flag, continue with empty defaults.
  //   - any later load:  flag present → no-op. User data is preserved forever after.
  try {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(MIGRATION_KEY)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(MIGRATION_KEY, 'done');
    }
  } catch (e) { /* storage may be unavailable; ignore */ }

  const CATEGORIES = ['food', 'vet', 'grooming', 'toys', 'meds', 'other'];
  const ALLOWED_CURRENCIES = ['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'EUR', 'GBP'];
  const ALLOWED_THEMES = ['light', 'dark'];

  // Exact shape written on first load.
  const DEFAULT_DATA = {
    dog: { name: '', breed: '', ageYears: null, weightKg: null, photo: '' },
    currency: 'USD',
    budgets: { food: 0, vet: 0, grooming: 0, toys: 0, meds: 0, other: 0 },
    expenses: [],
    goals: [],
    settings: { theme: 'light', installPromptDismissed: false }
  };

  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function deepMergeDefaults(target, defaults) {
    if (target === null || target === undefined) return clone(defaults);
    if (typeof defaults !== 'object' || Array.isArray(defaults)) return target;
    const out = { ...defaults, ...target };
    for (const key of Object.keys(defaults)) {
      if (defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
        out[key] = deepMergeDefaults(target[key], defaults[key]);
      }
    }
    return out;
  }

  // Normalize unsupported legacy values (currency outside whitelist, theme 'auto')
  // and silently drop removed fields (e.g. legacy `reminders` array).
  // Returns true if any migration actually changed the data (so callers can persist).
  function normalize(data) {
    let dirty = false;
    if (!ALLOWED_CURRENCIES.includes(data.currency)) { data.currency = 'USD'; dirty = true; }
    if (!ALLOWED_THEMES.includes(data.settings.theme)) { data.settings.theme = 'light'; dirty = true; }
    if ('reminders' in data) { delete data.reminders; dirty = true; }
    return dirty;
  }

  let cache = null;

  function isStorageAvailable() {
    try {
      const k = '__dbp_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function load() {
    if (cache) return cache;
    if (!isStorageAvailable()) {
      console.warn('localStorage unavailable — running in-memory only');
      cache = clone(DEFAULT_DATA);
      return cache;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        cache = clone(DEFAULT_DATA);
        save();
        return cache;
      }
      const parsed = JSON.parse(raw);
      cache = deepMergeDefaults(parsed, DEFAULT_DATA);
      // Persist immediately if any migration cleanup ran (e.g. dropping legacy reminders).
      if (normalize(cache)) save();
      return cache;
    } catch (e) {
      console.error('Failed to load storage, resetting', e);
      cache = clone(DEFAULT_DATA);
      return cache;
    }
  }

  function save() {
    if (!cache) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      return true;
    } catch (e) {
      console.error('Storage quota exceeded or unavailable', e);
      try {
        window.dispatchEvent(new CustomEvent('dbp:storage-error', { detail: { error: e.message } }));
      } catch (_) {}
      return false;
    }
  }

  function reset() {
    cache = clone(DEFAULT_DATA);
    save();
    return cache;
  }

  function getAll() {
    return load();
  }

  function update(mutator) {
    const data = load();
    mutator(data);
    save();
    return data;
  }

  // ---- Expense helpers ----
  function addExpense(exp) {
    return update((d) => {
      d.expenses.unshift({
        id: uid(),
        amount: Number(exp.amount) || 0,
        category: CATEGORIES.includes(exp.category) ? exp.category : 'other',
        note: String(exp.note || ''),
        date: exp.date || new Date().toISOString().slice(0, 10),
        recurring: !!exp.recurring
      });
    });
  }

  function updateExpense(id, patch) {
    return update((d) => {
      const i = d.expenses.findIndex((e) => e.id === id);
      if (i >= 0) {
        d.expenses[i] = {
          ...d.expenses[i],
          ...patch,
          amount: patch.amount != null ? Number(patch.amount) : d.expenses[i].amount
        };
      }
    });
  }

  function deleteExpense(id) {
    return update((d) => {
      d.expenses = d.expenses.filter((e) => e.id !== id);
    });
  }

  // ---- Goal helpers ----
  function addGoal(goal) {
    return update((d) => {
      d.goals.push({
        id: uid(),
        name: String(goal.name || ''),
        target: Number(goal.target) || 0,
        saved: 0,
        targetDate: goal.targetDate || '',
        contributions: []
      });
    });
  }

  function addContribution(goalId, amount, date) {
    return update((d) => {
      const g = d.goals.find((x) => x.id === goalId);
      if (!g) return;
      const amt = Number(amount) || 0;
      g.contributions.push({ amount: amt, date: date || new Date().toISOString().slice(0, 10) });
      g.saved = +(g.saved + amt).toFixed(2);
    });
  }

  function deleteGoal(id) {
    return update((d) => {
      d.goals = d.goals.filter((g) => g.id !== id);
    });
  }

  // ---- Settings & profile ----
  function setSettings(patch) {
    return update((d) => {
      d.settings = { ...d.settings, ...patch };
      normalize(d); // ignore return; update() will save afterward
    });
  }

  function setDog(patch) {
    return update((d) => {
      d.dog = { ...d.dog, ...patch };
    });
  }

  function setBudgets(patch) {
    return update((d) => {
      d.budgets = { ...d.budgets, ...patch };
    });
  }

  function setCurrency(code) {
    return update((d) => {
      d.currency = ALLOWED_CURRENCIES.includes(code) ? code : 'USD';
    });
  }

  // ---- Backup / restore ----
  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
      const merged = deepMergeDefaults(parsed, DEFAULT_DATA);
      normalize(merged); // strips legacy fields (e.g. reminders)
      cache = merged;
      save();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function exportExpensesCSV() {
    const d = load();
    const header = ['date', 'category', 'amount', 'note', 'recurring'];
    const rows = d.expenses.map((e) => [
      e.date,
      e.category,
      e.amount,
      '"' + String(e.note || '').replace(/"/g, '""') + '"',
      e.recurring ? 'yes' : 'no'
    ]);
    return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  global.DBPStorage = {
    CATEGORIES,
    ALLOWED_CURRENCIES,
    uid,
    load,
    save,
    reset,
    getAll,
    update,
    addExpense,
    updateExpense,
    deleteExpense,
    addGoal,
    addContribution,
    deleteGoal,
    setSettings,
    setDog,
    setBudgets,
    setCurrency,
    exportJSON,
    importJSON,
    exportExpensesCSV,
    isStorageAvailable
  };
})(window);
