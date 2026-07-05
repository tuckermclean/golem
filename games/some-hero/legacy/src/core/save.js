// Persistence for meta — the "knowledge is permanent" half of the design,
// now permanent across the tab too. Items stay temporary; only knowledge
// (deaths, day, credit, menace, credentials, the stamp ceremony) survives.
//
// Loading merges into fresh createMeta() defaults, so saves from older
// versions pick up new fields with their defaults and unknown fields are
// dropped — forward-compatible by construction.

import { createMeta } from './meta.js';

export const SAVE_KEY = 'sh-meta';
export const SAVE_V = 1;

const defaultStorage = () => {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
};

/** Persist meta. Quietly does nothing where storage is unavailable. */
export function saveMeta(meta, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_V, meta }));
    return true;
  } catch (e) { return false; }
}

/** Load meta merged over fresh defaults, or null (absent/corrupt). */
export function loadMeta(storage = defaultStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.meta) return null;
    const fresh = createMeta();
    const out = {};
    for (const k of Object.keys(fresh)) {
      const saved = data.meta[k];
      if (saved === undefined) { out[k] = fresh[k]; continue; }
      if (fresh[k] !== null && typeof fresh[k] === 'object' && !Array.isArray(fresh[k])) {
        // nested objects (credentials, credit): defaults filled, knowns kept
        out[k] = { ...fresh[k] };
        for (const kk of Object.keys(fresh[k])) {
          if (saved && saved[kk] !== undefined) out[k][kk] = saved[kk];
        }
      } else {
        out[k] = saved;
      }
    }
    return out;
  } catch (e) { return null; }
}

/** Forget everything. The Ledger pretends not to mind. */
export function wipeSave(storage = defaultStorage()) {
  if (!storage) return;
  try { storage.removeItem(SAVE_KEY); } catch (e) { /* fine */ }
}
