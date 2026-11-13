// Onboarding state: saved after every answer so Harvey can stop and resume.
// Storage is injected (defaults to localStorage) and every access is wrapped: iOS private mode,
// quota errors and corrupt JSON must never break boot — we fall back to in-memory state.
export const STORAGE_KEY = 'forge.onboarding.v1';

export function emptyState() {
  return { v: 1, mode: null, answers: {}, pos: null, startedAt: null, updatedAt: null, completedAt: null };
}

export function createStore(storage) {
  let mem = null;
  let backend = storage;
  if (backend === undefined) {
    try { backend = globalThis.localStorage; } catch { backend = null; }
  }
  // Probe once: blocked or full storage (private mode, quota) should warn from the very first screen.
  let canWrite = false;
  try { if (backend) { backend.setItem('forge.probe', '1'); backend.removeItem('forge.probe'); canWrite = true; } } catch { canWrite = false; }
  const store = {
    persistent: canWrite,
    load() {
      if (mem) return mem;
      let raw = null;
      try { raw = backend ? backend.getItem(STORAGE_KEY) : null; } catch { store.persistent = false; }
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.v === 1 && parsed.answers && typeof parsed.answers === 'object') {
            mem = { ...emptyState(), ...parsed };
            return mem;
          }
        } catch { /* corrupt: start fresh */ }
      }
      mem = emptyState();
      return mem;
    },
    save(state) {
      mem = { ...state, updatedAt: new Date().toISOString() };
      try {
        if (backend) backend.setItem(STORAGE_KEY, JSON.stringify(mem));
        else store.persistent = false;
      } catch { store.persistent = false; }
      return mem;
    },
    reset() {
      mem = emptyState();
      try { if (backend) backend.removeItem(STORAGE_KEY); } catch { store.persistent = false; }
      return mem;
    },
  };
  return store;
}

// Answer helpers (return new state objects; never mutate).
export function setAnswer(state, id, value) {
  return { ...state, answers: { ...state.answers, [id]: { v: value } }, pos: id };
}
export function setUnknown(state, id) {
  return { ...state, answers: { ...state.answers, [id]: { unknown: true } }, pos: id };
}

// Backup format for export/import (also how answers written in the intake doc can be loaded later).
export function exportAnswers(state) {
  return JSON.stringify({ app: 'forge', kind: 'onboarding-answers', v: 1, exportedAt: new Date().toISOString(),
    mode: state.mode, answers: state.answers }, null, 2);
}
export function importAnswers(text, knownIds) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file isn’t valid JSON.'); }
  if (!data || data.app !== 'forge' || data.kind !== 'onboarding-answers' || typeof data.answers !== 'object') {
    throw new Error('That isn’t a Forge answers backup.');
  }
  const answers = {};
  for (const [id, rec] of Object.entries(data.answers)) {
    if (!knownIds.has(id) || !rec || typeof rec !== 'object') continue;
    answers[id] = rec.unknown ? { unknown: true } : { v: rec.v };
  }
  return answers;
}
