// Sync policy (T4.3): local-first, last write wins per document. PURE core (reconcile) + a small engine over Storage.
// The app always reads and writes the device (LocalStore + onboarding store); this mirrors the raw documents to `user_docs`.
//   - a local change is detected by fingerprinting the stored text (no need to hook every writer)
//   - a remote change is detected by its updated_at moving since the last sync
//   - both changed → the later edit wins (local edit time is recorded when the change is first noticed); reported as a conflict
//   - first sync on a device that already has different data from the cloud → the caller must choose (never silent overwrite)
export const SYNC_KEYS = { onboarding: 'forge.onboarding.v1', settings: 'forge.settings.v1', budget: 'forge.budget.v1', snapshots: 'forge.snapshots.v1', scenarios: 'forge.scenarios.v1' };
export const META_KEY = 'forge.sync.v1';
const REMOVED = { v: 0, removed: true };

export function fingerprint(text) {
  if (text == null || text === '') return '';
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + text.length;
}
const canon = (data) => (data == null || (data && data.removed) ? null : JSON.stringify(data));

// local: { doc: rawText|null }, remote: { doc: { data, updatedAt } }, meta: { docs: { doc: { hash, remoteAt, localAt } } }
// → { push: [doc], pull: [doc], conflicts: [{ doc, kept }], same: [doc], needsChoice: bool }
export function reconcile({ local, remote, meta, prefer = null }) {
  const out = { push: [], pull: [], conflicts: [], same: [], needsChoice: false };
  const m = (meta && meta.docs) || {};
  const firstSync = !meta || !meta.lastSyncAt;
  for (const doc of Object.keys(SYNC_KEYS)) {
    const l = local[doc] ?? null;
    const r = remote[doc] || null;
    const rText = r ? canon(r.data) : null;
    const known = m[doc] || {};
    const localChanged = fingerprint(l) !== (known.hash || '');
    const remoteChanged = !!r && r.updatedAt !== known.remoteAt;
    if (fingerprint(l) === fingerprint(rText)) { if (localChanged || remoteChanged) out.same.push(doc); continue; }
    if (!r) { if (l != null || localChanged) out.push.push(doc); continue; }
    if (firstSync && l != null && rText != null) {
      if (prefer === 'local') out.push.push(doc); else if (prefer === 'remote') out.pull.push(doc); else out.needsChoice = true;
      continue;
    }
    if (localChanged && !remoteChanged) out.push.push(doc);
    else if (!localChanged && remoteChanged) out.pull.push(doc);
    else if (localChanged && remoteChanged) {
      const localWins = (known.localAt || 0) >= Date.parse(r.updatedAt || 0);
      (localWins ? out.push : out.pull).push(doc);
      out.conflicts.push({ doc, kept: localWins ? 'this device' : 'other device' });
    }
  }
  if (out.needsChoice) { out.push = []; out.pull = []; }
  return out;
}

export function createSync({ sb, storage, now = () => Date.now() }) {
  const read = (k) => { try { return storage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { if (v == null) storage.removeItem(k); else storage.setItem(k, v); } catch { /* storage full/blocked */ } };
  const loadMeta = () => { try { return JSON.parse(read(META_KEY) || 'null') || { docs: {} }; } catch { return { docs: {} }; } };
  let meta = loadMeta();
  const status = { lastSyncAt: meta.lastSyncAt || null, error: null, running: false };
  const localDocs = () => Object.fromEntries(Object.entries(SYNC_KEYS).map(([d, k]) => [d, read(k)]));

  // Record when a local change was first noticed (that's its edit time for last-write-wins).
  function noteLocal() {
    const t = now();
    for (const [doc, text] of Object.entries(localDocs())) {
      const k = meta.docs[doc] || (meta.docs[doc] = {});
      const fp = fingerprint(text);
      if (fp !== (k.hash || '') && fp !== k.seen) { k.localAt = t; k.seen = fp; }
    }
    write(META_KEY, JSON.stringify(meta));
  }

  async function syncNow({ prefer = null } = {}) {
    if (!sb || !sb.signedIn()) return { skipped: 'signed out' };
    if (status.running) return { skipped: 'busy' };
    status.running = true;
    try {
      noteLocal();
      const remote = await sb.listDocs();
      const local = localDocs();
      const plan = reconcile({ local, remote, meta, prefer });
      if (plan.needsChoice) return { needsChoice: true };
      for (const doc of plan.push) {
        const text = local[doc];
        const data = text == null ? REMOVED : JSON.parse(text);
        const at = await sb.putDoc(doc, data, new Date(meta.docs[doc] && meta.docs[doc].localAt ? meta.docs[doc].localAt : now()).toISOString());
        meta.docs[doc] = { hash: fingerprint(text), remoteAt: at };
      }
      for (const doc of plan.pull) {
        const text = canon(remote[doc].data);
        write(SYNC_KEYS[doc], text);
        meta.docs[doc] = { hash: fingerprint(text), remoteAt: remote[doc].updatedAt };
      }
      for (const doc of plan.same) meta.docs[doc] = { hash: fingerprint(local[doc]), remoteAt: remote[doc] ? remote[doc].updatedAt : null };
      meta.lastSyncAt = now();
      write(META_KEY, JSON.stringify(meta));
      status.lastSyncAt = meta.lastSyncAt; status.error = null;
      return { pushed: plan.push, pulled: plan.pull, conflicts: plan.conflicts };
    } catch (e) {
      status.error = e && e.message ? e.message : 'Sync failed';
      return { error: status.error };
    } finally { status.running = false; }
  }
  function forget() { meta = { docs: {} }; write(META_KEY, null); status.lastSyncAt = null; }
  return { syncNow, noteLocal, status, forget, meta: () => meta };
}
