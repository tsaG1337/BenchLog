import { WorkSession } from './types';

const API_URL = import.meta.env.VITE_API_URL || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function fetchSessions(): Promise<WorkSession[]> {
  return request<WorkSession[]>('/api/sessions');
}

export async function createSession(session: WorkSession): Promise<void> {
  await request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(session),
  });
}

export async function updateSessionApi(id: string, updates: Partial<WorkSession>): Promise<void> {
  await request(`/api/sessions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteSessionApi(id: string): Promise<void> {
  await request(`/api/sessions/${id}`, {
    method: 'DELETE',
  });
}

export async function uploadImages(sessionId: string, files: FileList): Promise<string[]> {
  const formData = new FormData();
  formData.append('sessionId', sessionId);
  for (const file of Array.from(files)) {
    formData.append('files', file);
  }

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  const data = await res.json();
  return data.urls;
}

export async function deleteImage(url: string): Promise<void> {
  await request('/api/upload', {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });
}

// ─── General Settings ───────────────────────────────────────────────
export interface GeneralSettings {
  projectName: string;
  targetHours: number;
}

export async function fetchGeneralSettings(): Promise<GeneralSettings> {
  return request<GeneralSettings>('/api/settings/general');
}

export async function updateGeneralSettings(settings: GeneralSettings): Promise<void> {
  await request('/api/settings/general', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ─── MQTT Settings ──────────────────────────────────────────────────
export interface MqttSettings {
  enabled: boolean;
  brokerUrl: string;
  username: string;
  password: string;
  topicPrefix: string;
  haDiscovery: boolean;
  haDiscoveryPrefix: string;
}

export async function fetchMqttSettings(): Promise<MqttSettings> {
  return request<MqttSettings>('/api/settings/mqtt');
}

export async function updateMqttSettings(settings: MqttSettings): Promise<void> {
  await request('/api/settings/mqtt', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function testMqttPublish(settings: Pick<MqttSettings, 'brokerUrl' | 'username' | 'password' | 'topicPrefix'>): Promise<void> {
  await request('/api/settings/mqtt/test', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

// ─── Sections ───────────────────────────────────────────────────────
import { SectionConfig } from './types';

export async function fetchSections(): Promise<SectionConfig[]> {
  return request<SectionConfig[]>('/api/sections');
}

export async function updateSections(sections: SectionConfig[]): Promise<void> {
  await request('/api/sections', {
    method: 'PUT',
    body: JSON.stringify(sections),
  });
}

// ─── Import / Export ────────────────────────────────────────────────
export async function exportData(includeSettings: boolean, includeSessions: boolean): Promise<Blob> {
  const params = new URLSearchParams();
  if (includeSettings) params.set('settings', '1');
  if (includeSessions) params.set('sessions', '1');

  const res = await fetch(`${API_URL}/api/export?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.blob();
}

export interface ImportResult {
  ok: boolean;
  settingsImported: boolean;
  sessionsImported: number;
  imagesImported: number;
}

export async function importData(data: object): Promise<ImportResult> {
  return request<ImportResult>('/api/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
