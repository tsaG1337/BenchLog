import type { DeviceTemplate } from './types';
import {
  fetchUserLibrary,
  saveUserLibraryTemplate,
  deleteUserLibraryTemplate,
} from '@/lib/api';

// ── Main (BenchLog) library ─────────────────────────────────────────
// Every device file in `./devices/` is auto-picked up at build time.
// To add a new device: create a new .ts file in ./devices/ that default-exports
// a DeviceTemplate. Nothing else to wire up.
const deviceModules = import.meta.glob<{ default: DeviceTemplate }>('./devices/*.ts', { eager: true });

export const MAIN_LIBRARY: DeviceTemplate[] = Object.values(deviceModules)
  .map(m => m.default)
  .sort((a, b) => a.name.localeCompare(b.name));

// ── User library (server + localStorage cache) ──────────────────────
//
// Source of truth is the server (one row per template per tenant). We keep an
// in-memory cache seeded from localStorage so first render is synchronous,
// then `syncUserLibrary()` replaces it with the server's authoritative copy.
// Writes go to the server optimistically — we update the cache first so the
// UI feels instant, and fall back to retrying manually if the server rejects.
//
// Subscribers are notified whenever the cache changes so UIs can re-render
// without prop-drilling a version counter.
const USER_LIBRARY_KEY = 'benchlog.wiring.userLibrary.v1';

let cache: DeviceTemplate[] = seedFromLocalStorage();
const listeners = new Set<() => void>();

function seedFromLocalStorage(): DeviceTemplate[] {
  try {
    const raw = localStorage.getItem(USER_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLocal(): void {
  try {
    localStorage.setItem(USER_LIBRARY_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error('Failed to cache user library locally:', err);
  }
}

function notify(): void {
  for (const cb of listeners) cb();
}

/** Synchronous read from the in-memory cache. Use for render; call
 *  `syncUserLibrary()` once on mount to hydrate from the server. */
export function loadUserLibrary(): DeviceTemplate[] {
  return cache;
}

/** Subscribe to cache changes. Returns an unsubscribe fn. */
export function subscribeUserLibrary(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Pull the authoritative list from the server and replace the cache.
 *  Silent no-op on network/auth errors so the UI keeps working offline
 *  against the localStorage-seeded cache. */
export async function syncUserLibrary(): Promise<void> {
  try {
    const { templates } = await fetchUserLibrary();
    // Defensive: discard anything that doesn't look like a template.
    const valid: DeviceTemplate[] = [];
    for (const t of templates) {
      if (t && typeof t === 'object' && typeof (t as DeviceTemplate).id === 'string') {
        valid.push(t as DeviceTemplate);
      }
    }
    cache = valid;
    persistLocal();
    notify();
  } catch (err) {
    // Stay on the local cache — offline / unauthed / server down etc.
    console.warn('User library sync failed, staying on cached copy:', err);
  }
}

/** Upsert a single template. Applies to the local cache immediately so the
 *  UI updates without waiting for the round-trip, then writes to the server.
 *  Throws if the server save fails — caller decides how to surface that. */
export async function upsertUserDevice(device: DeviceTemplate): Promise<void> {
  const idx = cache.findIndex(d => d.id === device.id);
  cache = idx >= 0
    ? cache.map((d, i) => (i === idx ? device : d))
    : [...cache, device];
  persistLocal();
  notify();
  await saveUserLibraryTemplate(device.id, device);
}

/** Remove a template by id from cache + server. */
export async function removeUserDevice(id: string): Promise<void> {
  cache = cache.filter(d => d.id !== id);
  persistLocal();
  notify();
  await deleteUserLibraryTemplate(id);
}

/** Resolve a templateId to its template. Searches the main library first,
 *  then the user cache. Returns null if the template no longer exists (e.g.
 *  a user device was deleted but still has placed instances on the canvas). */
export function findTemplateById(templateId: string | undefined): DeviceTemplate | null {
  if (!templateId) return null;
  const main = MAIN_LIBRARY.find(t => t.id === templateId);
  if (main) return main;
  return cache.find(t => t.id === templateId) ?? null;
}

// ── Re-exports ──────────────────────────────────────────────────────
export * from './types';
