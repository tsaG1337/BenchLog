// Lightweight localStorage persistence for the active wiring project.
// Server-side persistence (multi-project, DB-backed) will replace this
// in Task 11 of the implementation plan.

const PROJECT_KEY = 'benchlog.wiring.project.v1';

export function saveProjectLocal(json: string): void {
  try {
    localStorage.setItem(PROJECT_KEY, json);
  } catch (err) {
    console.error('Failed to save wiring project:', err);
  }
}

export function loadProjectLocal(): string | null {
  try {
    return localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

export function clearProjectLocal(): void {
  try { localStorage.removeItem(PROJECT_KEY); } catch {}
}
