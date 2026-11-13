// SupabaseStore (T4.1): the same interface as LocalStore (src/data/store.js), backed by the signed-in user's `user_docs`.
// Each collection is one document: scenarios → 'scenarios' ({ id: scenario }), snapshots → 'snapshots' ([…]),
// settings → 'settings' ({…}), budget → 'budget', onboarding → 'onboarding'. Same validation, same copies-out semantics.
// The app itself stays local-first (LocalStore + src/data/sync.js); this adapter is what the cloud copy looks like.
import { parseBackup, BACKUP_KIND } from './store.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export function createSupabaseStore(sb, { now = () => new Date().toISOString(), id } = {}) {
  const newId = id || (() => 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));
  let cache = null;
  const docs = async () => (cache ||= await sb.listDocs());
  const get = async (key, fallback) => { const d = (await docs())[key]; return d ? clone(d.data) : fallback; };
  const put = async (key, data) => { const at = await sb.putDoc(key, data); (await docs())[key] = { data: clone(data), updatedAt: at }; };

  const scenarios = async () => { const s = await get('scenarios', {}); return isObj(s) ? s : {}; };
  const snapshots = async () => { const s = await get('snapshots', []); return Array.isArray(s) ? s.filter((x) => isObj(x) && MONTH_RE.test(x.at)) : []; };
  const settings = async () => { const s = await get('settings', {}); return isObj(s) ? s : {}; };

  return {
    persistent: true,
    refresh() { cache = null; },
    async listScenarios() {
      return Object.values(await scenarios()).filter(isObj).map((s) => ({ id: s.id, name: s.name || 'Untitled', updatedAt: s.updatedAt || null }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },
    async getScenario(i) { const s = (await scenarios())[i]; return isObj(s) ? s : null; },
    async saveScenario(scenario) {
      if (!isObj(scenario)) throw new TypeError('saveScenario needs a scenario object');
      const all = await scenarios();
      const saved = { ...clone(scenario), id: scenario.id || newId(), updatedAt: now() };
      all[saved.id] = saved;
      await put('scenarios', all);
      return clone(saved);
    },
    async deleteScenario(i) { const all = await scenarios(); if (!(i in all)) return false; delete all[i]; await put('scenarios', all); return true; },
    async listSnapshots() { return (await snapshots()).sort((a, b) => a.at.localeCompare(b.at)); },
    async saveSnapshot(snap) {
      if (!isObj(snap) || !MONTH_RE.test(snap.at)) throw new TypeError('Snapshot needs at: "YYYY-MM"');
      const list = (await snapshots()).filter((s) => s.at !== snap.at);
      const saved = { ...clone(snap), savedAt: now() };
      list.push(saved); list.sort((a, b) => a.at.localeCompare(b.at));
      await put('snapshots', list);
      return clone(saved);
    },
    async getSettings() { return settings(); },
    async saveSettings(patch) {
      if (!isObj(patch)) throw new TypeError('saveSettings needs an object');
      const merged = { ...(await settings()), ...clone(patch) };
      await put('settings', merged);
      return clone(merged);
    },
    async getBudget() { const b = await get('budget', null); return isObj(b) && b.v === 1 ? b : null; },
    async saveBudget(b) { if (!isObj(b) || b.v !== 1) throw new TypeError('saveBudget needs a v1 budget'); await put('budget', b); return clone(b); },
    async removeBudget() { await put('budget', { v: 0, removed: true }); },
    async exportAll() {
      const onboarding = await get('onboarding', null);
      const budget = await this.getBudget();
      return JSON.stringify({ app: 'forge', kind: BACKUP_KIND, v: 1, exportedAt: now(), scenarios: Object.values(await scenarios()).filter(isObj),
        snapshots: await snapshots(), settings: await settings(), budget, onboarding: isObj(onboarding) ? onboarding : null }, null, 2);
    },
    async importAll(text) {
      const data = parseBackup(text);
      await put('scenarios', Object.fromEntries(data.scenarios.map((s) => [s.id, s])));
      await put('snapshots', data.snapshots);
      await put('settings', data.settings);
      await put('budget', data.budget || { v: 0, removed: true });
      if (data.onboarding) await put('onboarding', data.onboarding);
      return { scenarios: data.scenarios.length, snapshots: data.snapshots.length, settings: Object.keys(data.settings).length, onboarding: !!data.onboarding, budget: !!data.budget };
    },
    async clearAll() { await sb.removeAllDocs(); cache = {}; },
  };
}
