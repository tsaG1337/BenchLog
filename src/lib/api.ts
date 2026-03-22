import { WorkSession } from './types';

const API_URL = import.meta.env.VITE_API_URL || '';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let message = res.statusText;
    try { message = JSON.parse(text).error || message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 120).replace(/\n/g, ' ');
    throw new Error(`Server returned non-JSON (${res.status}): ${preview}`);
  }
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
    headers: { ...getAuthHeaders() },
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
  progressMode?: 'time' | 'packages';
  imageResizing?: boolean;
  imageMaxWidth?: number;
  timeFormat?: '24h' | '12h';
  landingPage?: 'tracker' | 'blog';
  homeCurrency?: string;
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

// ─── Timer API ──────────────────────────────────────────────────────
export interface TimerStatus {
  running: boolean;
  section?: string;
  startedAt?: string;
}

export async function startTimer(section: string): Promise<{ ok: boolean; section: string; startedAt: string }> {
  return request('/api/timer/start', {
    method: 'POST',
    body: JSON.stringify({ section }),
  });
}

export async function stopTimer(notes?: string, plansReference?: string, imageUrls?: string[]): Promise<{ ok: boolean; sessionId: string; durationMinutes: number; section: string }> {
  return request('/api/timer/stop', {
    method: 'POST',
    body: JSON.stringify({ notes, plansReference, imageUrls }),
  });
}

export async function getTimerStatus(): Promise<TimerStatus> {
  return request('/api/timer/status');
}

// ─── Import / Export ────────────────────────────────────────────────
export interface ExportOptions {
  settings?: boolean;
  sessions?: boolean;
  expenses?: boolean;
  blog?: boolean;
}

export async function exportData(options: ExportOptions): Promise<Blob> {
  const params = new URLSearchParams();
  if (options.settings === false) params.set('settings', '0');
  if (options.sessions === false) params.set('sessions', '0');
  if (options.expenses === false) params.set('expenses', '0');
  if (options.blog     === false) params.set('blog',     '0');
  const qs = params.toString();
  const res = await fetch(`${API_URL}/api/export${qs ? `?${qs}` : ''}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const text = await res.text();
    let message = res.statusText;
    try { message = JSON.parse(text).error || message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  return res.blob();
}

export interface ImportResult {
  ok: boolean;
  settingsImported: boolean;
  sessionsImported: number;
  expensesImported: number;
  blogPostsImported: number;
  filesImported: number;
}

export async function importData(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('backup', file);
  const res = await fetch(`${API_URL}/api/import`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    let message = res.statusText;
    try { message = JSON.parse(text).error || message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  return JSON.parse(text);
}

// ─── Blog Posts ─────────────────────────────────────────────────────
export interface BlogPost {
  id: string;
  title: string;
  content: string;
  section?: string;
  imageUrls?: string[];
  publishedAt: string;
  updatedAt: string;
  source?: 'blog' | 'session';
  plansReference?: string;
  durationMinutes?: number;
}

export interface BlogArchiveEntry {
  year: string;
  month: string;
  count: number;
}

export async function fetchBlogPosts(filters?: { section?: string; year?: string; month?: string; plansSection?: string }): Promise<BlogPost[]> {
  const params = new URLSearchParams();
  if (filters?.section) params.set('section', filters.section);
  if (filters?.year) params.set('year', filters.year);
  if (filters?.month) params.set('month', filters.month);
  if (filters?.plansSection) params.set('plansSection', filters.plansSection);
  const qs = params.toString();
  return request<BlogPost[]>(`/api/blog${qs ? `?${qs}` : ''}`);
}

export async function fetchBlogPost(id: string): Promise<BlogPost> {
  return request<BlogPost>(`/api/blog/${id}`);
}

export async function fetchBlogArchive(): Promise<BlogArchiveEntry[]> {
  return request<BlogArchiveEntry[]>('/api/blog/archive');
}

export async function createBlogPost(post: Partial<BlogPost>): Promise<{ ok: boolean; id: string }> {
  return request('/api/blog', { method: 'POST', body: JSON.stringify(post) });
}

export async function updateBlogPost(id: string, updates: Partial<BlogPost>): Promise<void> {
  await request(`/api/blog/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export async function deleteBlogPost(id: string): Promise<void> {
  await request(`/api/blog/${id}`, { method: 'DELETE' });
}

// ─── Public Stats ───────────────────────────────────────────────────
export interface BuildStats {
  totalHours: number;
  targetHours: number;
  progressPct: number;
  progressMode: 'time' | 'packages';
  sessionCount: number;
  estimatedFinish: string | null;
  hoursPerWeek: number | null;
  projectName: string;
  sectionHours: Record<string, number>;
}

export async function fetchBuildStats(): Promise<BuildStats> {
  return request<BuildStats>('/api/stats');
}

// ─── Expenses ────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  { id: 'airframe',      label: 'Airframe',      icon: '✈️' },
  { id: 'engine',        label: 'Engine',         icon: '⚙️' },
  { id: 'avionics',      label: 'Avionics',       icon: '📡' },
  { id: 'landing-gear',  label: 'Landing Gear',   icon: '🛞' },
  { id: 'paint',         label: 'Paint & Finish',  icon: '🎨' },
  { id: 'tools',         label: 'Tools',           icon: '🔧' },
  { id: 'certification', label: 'Certification',   icon: '📋' },
  { id: 'insurance',     label: 'Insurance',       icon: '🛡️' },
  { id: 'hangar',        label: 'Hangar',          icon: '🏠' },
  { id: 'other',         label: 'Other',           icon: '📦' },
] as const;

export const CURRENCIES = [
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'AU$', name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'Fr.', name: 'Swiss Franc' },
] as const;

export interface Expense {
  id: string;
  date: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  amountHome: number;
  description: string;
  vendor: string;
  category: string;
  assemblySection: string;
  partNumber: string;
  isCertificationRelevant: boolean;
  receiptUrls: string[];
  notes: string;
  tags: string[];
  link: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseStats {
  totalHome: number;
  byCategory: Record<string, number>;
  bySection: Record<string, number>;
  budgets: Record<string, number>;
  monthly: { month: string; total: number }[];
  count: number;
}

export async function fetchExpenses(filters?: { category?: string; section?: string; year?: string; month?: string; certification?: string }): Promise<Expense[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.section) params.set('section', filters.section);
  if (filters?.year) params.set('year', filters.year);
  if (filters?.month) params.set('month', filters.month);
  if (filters?.certification) params.set('certification', filters.certification);
  const qs = params.toString();
  return request<Expense[]>(`/api/expenses${qs ? `?${qs}` : ''}`);
}

export async function fetchExpenseStats(): Promise<ExpenseStats> {
  return request<ExpenseStats>('/api/expenses/stats');
}

export async function createExpense(expense: Omit<Expense, 'id' | 'amountHome' | 'createdAt' | 'updatedAt'>): Promise<{ ok: boolean; id: string }> {
  return request('/api/expenses', { method: 'POST', body: JSON.stringify(expense) });
}

export async function updateExpense(id: string, expense: Partial<Expense>): Promise<void> {
  await request(`/api/expenses/${id}`, { method: 'PUT', body: JSON.stringify(expense) });
}

export async function deleteExpense(id: string): Promise<void> {
  await request(`/api/expenses/${id}`, { method: 'DELETE' });
}

export async function fetchExpenseBudgets(): Promise<Record<string, number>> {
  return request<Record<string, number>>('/api/expenses/budgets');
}

export async function updateExpenseBudgets(budgets: Record<string, number>): Promise<void> {
  await request('/api/expenses/budgets', { method: 'PUT', body: JSON.stringify(budgets) });
}

export async function uploadReceipts(files: FileList): Promise<string[]> {
  const formData = new FormData();
  for (const file of Array.from(files)) formData.append('files', file);
  const res = await fetch(`${API_URL}/api/expenses/upload`, { method: 'POST', headers: { ...getAuthHeaders() }, body: formData });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || res.statusText); }
  return (await res.json()).urls;
}

export async function deleteReceipt(url: string): Promise<void> {
  await request('/api/expenses/upload', { method: 'DELETE', body: JSON.stringify({ url }) });
}

// ─── Debug / Diagnostics ─────────────────────────────────────────────

export interface DebugStats {
  timestamp: number;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  db: {
    path: string;
    sessions: number;
    expenses: number;
    blogPosts: number;
  };
  uploads: {
    sessionImages: number;
    sessionThumbs: number;
    receipts: number;
  };
  node: {
    version: string;
    platform: string;
    arch: string;
  };
}

export async function fetchDebugStats(): Promise<DebugStats> {
  return request<DebugStats>('/api/debug/stats');
}

export interface ServerLogEntry {
  ts: number;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
}

export async function fetchDebugLogs(since?: number): Promise<ServerLogEntry[]> {
  const qs = since ? `?since=${since}` : '';
  return request<ServerLogEntry[]>(`/api/debug/logs${qs}`);
}

// ─── Webhook / Integrations ──────────────────────────────────────────
export async function fetchWebhookKey(): Promise<string> {
  const data = await request<{ key: string }>('/api/settings/webhook-key');
  return data.key;
}

export async function regenerateWebhookKey(): Promise<string> {
  const data = await request<{ key: string }>('/api/settings/webhook-key/regenerate', { method: 'POST' });
  return data.key;
}
