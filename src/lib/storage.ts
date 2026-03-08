import { WorkSession } from './types';

const SESSIONS_KEY = 'rv10-build-sessions';

export function getSessions(): WorkSession[] {
  const raw = localStorage.getItem(SESSIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveSessions(sessions: WorkSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function addSession(session: WorkSession) {
  const sessions = getSessions();
  sessions.unshift(session);
  saveSessions(sessions);
}

export function deleteSession(id: string) {
  const sessions = getSessions().filter(s => s.id !== id);
  saveSessions(sessions);
}
