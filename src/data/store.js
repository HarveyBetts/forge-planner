// Storage adapter. The UI only ever talks to this interface, so LocalStore (now) and SupabaseStore
// (Phase 4) are interchangeable. Every method is async so the Supabase version can drop in unchanged.
//
// Interface (both stores implement exactly this):
//   listScenarios()            -> [{ id, name, updatedAt }]         newest first
//   getScenario(id)            -> scenario | null
//   saveScenario(scenario)     -> saved scenario (id + updatedAt filled in)
//   deleteScenario(id)         -> boolean (true if something was deleted)
//   listSnapshots()            -> [{ at:'YYYY-MM', pots:{...}, total, note? }]  oldest first
//   saveSnapshot(snapshot)     -> saved snapshot (one per month: same `at` replaces)
//   getSettings()              -> settings object ({} when none)
//   saveSettings(patch)        -> merged settings
//   exportAll()                -> JSON string (a full backup, incl. onboarding answers)
//   importAll(json)            -> { scenarios, snapshots, settings, onboarding } counts; replaces everything
//   clearAll()                 -> wipes everything this app stores
//   persistent                 -> false once a write failed (iOS private mode, quota): UI should warn
//
// Storage errors never throw out of LocalStore: we keep working in memory and flip `persistent`.

import { migrateScenario, validateScenario } from '../engine/schema.js';

export const KEYS = {
  scenarios: 'forge.scenarios.v1',
  snapshots: 'forge.snapshots.v1',
  settings: 'forge.settings.v1',
  onboarding: 'forge.onboarding.v1', // owned by src/onboarding/state.js; included in backups
};
export const BACKUP_KIND = 'full-backup';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

function defaultId() {
  try { if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch { /* fall through */ }
  return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// opts.storage: a Storage-like object (getItem/setItem/removeItem). Defaults to localStorage, or
//   memory-only if that is unavailable. Pass null to force memory-only.
// opts.now(): ISO timestamp source (injected for tests). opts.id(): id generator.
export function createLocalStore(opts = {}) {
  let backend = opts.storage;
  if (backend === undefined) {
    try { backend = globalThis.localStorage || null; } catch { backend = null; }
  }
  const now = opts.now || (() => new Date().toISOString());
  const newId = opts.id || defaultId;
  const mem = {}; // key -> parsed value (cache + fallback)

  const store = { persistent: !!backend };

  function read(key, fallback) {
    if (key in mem) return clone(mem[key]);
    let raw = null;
    try { raw = backend ? backend.getItem(key) : null; } catch { store.persistent = false; }
    let val = fallback;
    if (raw != null) {
      try { val = JSON.parse(raw); } catch { val = fallback; } // corrupt -> start that collection fresh
    }
    mem[key] = val;
    return clone(val);
  }
  function write(key, val) {
    mem[key] = clone(val);
    if (!backend) { store.persistent = false; return; }
    try { backend.setItem(key, JSON.stringify(val)); } catch { store.persistent = false; }
  }
  function remove(key) {
    delete mem[key];
    try { if (backend) backend.removeItem(key); } catch { store.persistent = false; }
  }

  const scenarios = () => { const s = read(KEYS.scenarios, {}); return isObj(s) ? s : {}; };
  const snapshots = () => { const s = read(KEYS.snapshots, []); return Array.isArray(s) ? s.filter((x) => isObj(x) && MONTH_RE.test(x.at)) : []; };
  const settings = () => { const s = read(KEYS.settings, {}); return isObj(s) ? s : {}; };

  Object.assign(store, {
    async listScenarios() {
      return Object.values(scenarios())
        .filter(isObj)
        .map((s) => ({ id: s.id, name: s.name || 'Untitled', updatedAt: s.updatedAt || null }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },
    async getScenario(id) {
      const s = scenarios()[id];
      return isObj(s) ? s : null;
    },
    async saveScenario(scenario) {
      if (!isObj(scenario)) throw new TypeError('saveScenario needs a scenario object');
      const all = scenarios();
      const saved = { ...clone(scenario), id: scenario.id || newId(), updatedAt: now() };
      all[saved.id] = saved;
      write(KEYS.scenarios, all);
      return clone(saved);
    },
    async deleteScenario(id) {
      const all = scenarios();
      if (!(id in all)) return false;
      delete all[id];
      write(KEYS.scenarios, all);
      return true;
    },
    async listSnapshots() {
      return snapshots().sort((a, b) => a.at.localeCompare(b.at));
    },
    async saveSnapshot(snap) {
      if (!isObj(snap) || !MONTH_RE.test(snap.at)) throw new TypeError('Snapshot needs at: "YYYY-MM"');
      const list = snapshots().filter((s) => s.at !== snap.at);
      const saved = { ...clone(snap), savedAt: now() };
      list.push(saved);
      list.sort((a, b) => a.at.localeCompare(b.at));
      write(KEYS.snapshots, list);
      return clone(saved);
    },
    async getSettings() {
      return settings();
    },
    async saveSettings(patch) {
      if (!isObj(patch)) throw new TypeError('saveSettings needs an object');
      const merged = { ...settings(), ...clone(patch) };
      write(KEYS.settings, merged);
      return clone(merged);
    },
    async exportAll() {
      const onboarding = read(KEYS.onboarding, null);
      return JSON.stringify({
        app: 'forge', kind: BACKUP_KIND, v: 1, exportedAt: now(),
        scenarios: Object.values(scenarios()).filter(isObj),
        snapshots: snapshots(),
        settings: settings(),
        onboarding: isObj(onboarding) ? onboarding : null,
      }, null, 2);
    },
    async importAll(text) {
      const data = parseBackup(text);
      const byId = {};
      for (const s of data.scenarios) byId[s.id] = s;
      write(KEYS.scenarios, byId);
      write(KEYS.snapshots, data.snapshots);
      write(KEYS.settings, data.settings);
      if (data.onboarding) write(KEYS.onboarding, data.onboarding); else remove(KEYS.onboarding);
      return {
        scenarios: data.scenarios.length, snapshots: data.snapshots.length,
        settings: Object.keys(data.settings).length, onboarding: !!data.onboarding,
      };
    },
    async clearAll() {
      Object.values(KEYS).forEach(remove);
    },
  });
  return store;
}

// Validate a backup before anything is written. Throws a readable Error; never half-imports.
export function parseBackup(text) {
  let data;
  try { data = typeof text === 'string' ? JSON.parse(text) : text; } catch { throw new Error('That file isn’t valid JSON.'); }
  if (!isObj(data) || data.app !== 'forge' || data.kind !== BACKUP_KIND) throw new Error('That isn’t a Forge backup file.');
  if (data.v !== 1) throw new Error(`This backup is from a newer version of Forge (v${data.v}).`);
  const scenarios = (Array.isArray(data.scenarios) ? data.scenarios : []).map((s, i) => {
    if (!isObj(s) || typeof s.id !== 'string' || !s.id) throw new Error(`Scenario ${i + 1} in the backup has no id.`);
    // SECURITY.md rule 7: imported JSON is validated against the scenario schema (and migrated) first.
    let m;
    try { m = migrateScenario(s); } catch (e) { throw new Error(`Scenario ${i + 1} (“${s.name || s.id}”): ${e.message}`); }
    const errs = validateScenario(m);
    if (errs.length) throw new Error(`Scenario ${i + 1} (“${s.name || s.id}”): ${errs[0].message}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''}`);
    return m;
  });
  const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
  snapshots.forEach((s, i) => {
    if (!isObj(s) || !MONTH_RE.test(s.at)) throw new Error(`Check-in ${i + 1} in the backup has a bad month.`);
  });
  const settings = isObj(data.settings) ? data.settings : {};
  const onboarding = isObj(data.onboarding) && isObj(data.onboarding.answers) ? data.onboarding : null;
  return { scenarios, snapshots, settings, onboarding };
}

// In-memory Storage double for tests and for "storage unavailable" fallback scenarios.
export function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    get size() { return m.size; },
    _map: m,
  };
}
