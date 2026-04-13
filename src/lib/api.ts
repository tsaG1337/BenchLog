import { WorkSession } from './types';

const API_URL = import.meta.env.VITE_API_URL || '';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Handle 401 responses consistently — clear token and redirect to login */
function handle401(res: Response) {
  if (res.status === 401 && localStorage.getItem('auth_token')) {
    localStorage.removeItem('auth_token');
    if (!window.location.pathname.startsWith('/login')) {
      window.location.replace('/login');
    }
  }
}

/** Handle 403 "Account deactivated" — notify AuthContext without wiping the token */
function handle403Deactivated(res: Response, body: string) {
  if (res.status === 403) {
    try {
      const msg = JSON.parse(body).error || '';
      if (msg.toLowerCase().includes('deactivated')) {
        window.dispatchEvent(new CustomEvent('accountDeactivated'));
      }
    } catch { /* not JSON */ }
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...options?.headers as Record<string, string>,
  };
  // Only set Content-Type for requests with a string body (not FormData)
  if (options?.body && typeof options.body === 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  if (!res.ok) {
    handle401(res);
    handle403Deactivated(res, text);
    let message = res.statusText;
    try { const parsed = JSON.parse(text).error; if (parsed) message = parsed; } catch { /* not JSON */ }
    throw new Error(message || `Request failed (${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected server response (${res.status})`);
  }
}

export interface SessionsPage {
  sessions: WorkSession[];
  total: number;
  hasMore: boolean;
}

export async function fetchSessions(opts?: { limit?: number; offset?: number }): Promise<SessionsPage> {
  const params = new URLSearchParams();
  if (opts?.limit  !== undefined) params.set('limit',  String(opts.limit));
  if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
  const qs = params.size ? `?${params}` : '';
  return request<SessionsPage>(`/api/sessions${qs}`);
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
    handle401(res);
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

// ─── OCR ────────────────────────────────────────────────────────────

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: number[][];
}

export interface OcrBarcode {
  data: string;
  type: string;
  bbox: number[];  // [left, top, width, height]
}

export interface OcrResult {
  lines: OcrLine[];
  barcodes: OcrBarcode[];
  full_text: string;
}

export async function runOcr(imageFile: File): Promise<OcrResult> {
  const formData = new FormData();
  formData.append('image', imageFile);

  const res = await fetch(`${API_URL}/api/ocr`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
    body: formData,
  });

  if (!res.ok) {
    handle401(res);
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  return res.json();
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
  blogShowSessionStats?: boolean;
  theme?: 'light' | 'dark' | 'system';
  inspectorName?: string;
  publicBlog?: boolean;
  wafPercent?: number;
  maintenanceMode?: boolean;
  ocrEnabled?: boolean;
  ocrVendor?: string;
  aircraftType?: string;
}

let _generalSettingsPromise: Promise<GeneralSettings> | null = null;
export function fetchGeneralSettings(): Promise<GeneralSettings> {
  if (!_generalSettingsPromise) {
    _generalSettingsPromise = request<GeneralSettings>('/api/settings/general')
      .finally(() => { setTimeout(() => { _generalSettingsPromise = null; }, 2000); });
  }
  return _generalSettingsPromise;
}

export async function updateGeneralSettings(settings: Partial<GeneralSettings>): Promise<void> {
  await request('/api/settings/general', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  _generalSettingsPromise = null;
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

export async function fetchSectionUsage(sectionId: string): Promise<{ sessions: number; blogPosts: number; expenses?: number }> {
  return request(`/api/sections/${encodeURIComponent(sectionId)}/usage`);
}

export async function reassignSection(fromId: string, toId: string): Promise<{ sessionsUpdated: number; blogPostsUpdated: number; expensesUpdated?: number }> {
  return request('/api/sections/reassign', {
    method: 'POST',
    body: JSON.stringify({ fromId, toId }),
  });
}

// ─── Timer API ──────────────────────────────────────────────────────
export interface TimerStatus {
  running: boolean;
  section?: string;
  startedAt?: string;
  imageUrls?: string[];
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
  workPackages?: boolean;
  workPackageStatus?: boolean;
  signOffs?: boolean;
  inventory?: boolean;
}

export interface ExportProgressEvent {
  type: 'start' | 'progress' | 'done' | 'error';
  stage?: string;
  label?: string;
  current?: number;
  total?: number;
  token?: string;
  filename?: string;
  message?: string;
}

function buildExportParams(options: ExportOptions): string {
  const params = new URLSearchParams();
  if (options.settings          === false) params.set('settings',          '0');
  if (options.sessions          === false) params.set('sessions',          '0');
  if (options.expenses          === false) params.set('expenses',          '0');
  if (options.blog              === false) params.set('blog',              '0');
  if (options.workPackages      === false) params.set('workPackages',      '0');
  if (options.workPackageStatus === false) params.set('workPackageStatus', '0');
  if (options.signOffs          === false) params.set('signOffs',          '0');
  if (options.inventory         === false) params.set('inventory',         '0');
  return params.toString();
}

export async function exportData(options: ExportOptions): Promise<Blob> {
  const qs = buildExportParams(options);
  const res = await fetch(`${API_URL}/api/export${qs ? `?${qs}` : ''}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    handle401(res);
    const text = await res.text();
    let message = res.statusText;
    try { message = JSON.parse(text).error || message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  return res.blob();
}

export async function exportDataStream(
  options: ExportOptions,
  onEvent: (ev: ExportProgressEvent) => void,
): Promise<void> {
  const qs = buildExportParams(options);
  const res = await fetch(`${API_URL}/api/export/stream${qs ? `?${qs}` : ''}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok || !res.body) {
    handle401(res);
    throw new Error(`Export stream failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { onEvent(JSON.parse(line.slice(6))); } catch { /* ignore malformed */ }
      }
    }
  }
}

export async function downloadExport(token: string, filename: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/export/download?token=${encodeURIComponent(token)}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) { handle401(res); throw new Error(`Download failed (${res.status})`); }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  ok: boolean;
  settingsImported: boolean;
  sessionsImported: number;
  expensesImported: number;
  blogPostsImported: number;
  filesImported: number;
  workPackagesImported: boolean;
  signOffsImported: number;
}

export async function importData(
  file: File,
  onUploadProgress?: (pct: number) => void,
): Promise<ImportResult> {
  const form = new FormData();
  form.append('backup', file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/import`);
    const token = localStorage.getItem('auth_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (onUploadProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onUploadProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid response from server')); }
      } else {
        if (xhr.status === 401 && localStorage.getItem('auth_token')) {
          localStorage.removeItem('auth_token');
          if (!window.location.pathname.startsWith('/login')) window.location.replace('/login');
        }
        let message = xhr.statusText || `Request failed (${xhr.status})`;
        try { message = JSON.parse(xhr.responseText).error || message; } catch { /* not JSON */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during import'));
    xhr.send(form);
  });
}

// ─── Blog Posts ─────────────────────────────────────────────────────
export interface BlogPost {
  id: string;
  title: string;
  content?: string;        // only present when fetching a single post
  excerpt?: string;        // plain-text summary, present in list responses
  contentImageUrls?: string[]; // image URLs extracted from content, present in list responses
  section?: string;
  plansSection?: string;
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

export interface BlogPageResponse {
  posts: BlogPost[];
  hasMore: boolean;
  total: number;
}

export async function fetchBlogPosts(filters?: { section?: string; year?: string; month?: string; plansSection?: string; page?: number; limit?: number }): Promise<BlogPageResponse> {
  const params = new URLSearchParams();
  if (filters?.section) params.set('section', filters.section);
  if (filters?.year) params.set('year', filters.year);
  if (filters?.month) params.set('month', filters.month);
  if (filters?.plansSection) params.set('plansSection', filters.plansSection);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return request<BlogPageResponse>(`/api/blog${qs ? `?${qs}` : ''}`);
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
  if (!res.ok) { handle401(res); const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || res.statusText); }
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
  storage: {
    backend: 'local' | 'r2';
    bucket: string | null;
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

// ─── Sign-offs ───────────────────────────────────────────────────────
export interface SignOff {
  id: string;
  packageId: string;
  packageLabel: string;
  sectionId: string;
  date: string;
  inspectorName: string;
  inspectionCompleted: boolean;
  noCriticalIssues: boolean;
  executionSatisfactory: boolean;
  reworkNeeded: boolean;
  comments: string;
  signaturePng: string;
  createdAt: string;
}

export async function fetchSignOffs(): Promise<SignOff[]> {
  return request<SignOff[]>('/api/signoffs');
}

export async function createSignOff(data: Omit<SignOff, 'createdAt'>): Promise<void> {
  await request('/api/signoffs', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteSignOff(id: string): Promise<void> {
  await request(`/api/signoffs/${id}`, { method: 'DELETE' });
}

// ─── Inspection Sessions ─────────────────────────────────────────────
export interface InspectionSubItem {
  id: string;
  label: string;
  outcome: 'ok' | 'partial' | 'rework' | 'na';
  notes: string;
  sortOrder: number;
}

export interface InspectionPackage {
  id: string;
  packageId: string;
  packageLabel: string;
  sectionId: string;
  outcome: 'ok' | 'partial' | 'rework' | 'na';
  notes: string;
  sortOrder: number;
  subItems: InspectionSubItem[];
}

export interface InspectionSession {
  id: string;
  sessionName: string;
  date: string;
  inspectorName: string;
  inspectorId: string;
  notes: string;
  signaturePng: string;
  packages: InspectionPackage[];
  createdAt: string;
}

export async function fetchInspectionSessions(): Promise<InspectionSession[]> {
  return request<InspectionSession[]>('/api/inspection-sessions');
}

export async function createInspectionSession(
  data: Omit<InspectionSession, 'id' | 'createdAt'>
): Promise<{ id: string }> {
  return request<{ id: string }>('/api/inspection-sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateInspectionSession(
  id: string,
  data: Omit<InspectionSession, 'id' | 'createdAt'>
): Promise<void> {
  await request(`/api/inspection-sessions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteInspectionSession(id: string): Promise<void> {
  await request(`/api/inspection-sessions/${id}`, { method: 'DELETE' });
}

export interface FlowItem { id: string; label: string; children?: FlowItem[] }
export type PackagesMap = Record<string, FlowItem[]>;

let _flowchartPackagesPromise: Promise<PackagesMap> | null = null;
export function fetchFlowchartPackages(): Promise<PackagesMap> {
  if (!_flowchartPackagesPromise) {
    _flowchartPackagesPromise = request<PackagesMap>('/api/flowchart-packages')
      .finally(() => { setTimeout(() => { _flowchartPackagesPromise = null; }, 2000); });
  }
  return _flowchartPackagesPromise;
}

export async function updateFlowchartPackages(packages: PackagesMap): Promise<void> {
  await request('/api/flowchart-packages', {
    method: 'PUT',
    body: JSON.stringify(packages),
  });
}

export type StatusMap = Record<string, string>;

export async function fetchFlowchartStatus(): Promise<StatusMap> {
  return request<StatusMap>('/api/flowchart-status');
}

export async function updateFlowchartStatus(statuses: StatusMap): Promise<void> {
  await request('/api/flowchart-status', {
    method: 'PUT',
    body: JSON.stringify(statuses),
  });
}

export interface WpTemplate { filename: string; name: string; }

export async function fetchWpTemplates(): Promise<WpTemplate[]> {
  return request<WpTemplate[]>('/api/templates/work-packages');
}

export async function fetchWpTemplate(filename: string): Promise<PackagesMap> {
  return request<PackagesMap>(`/api/templates/work-packages/${encodeURIComponent(filename)}`);
}

// ─── Visitor Stats ───────────────────────────────────────────────────
export interface VisitorStats {
  total: number;
  totalPeriod: number;
  days: number;
  countries: { country: string; count: number }[];
  referrers: { domain: string; count: number }[];
  topPosts: { post_id: string; title: string | null; count: number }[];
  daily: { date: string; count: number }[];
}

export async function fetchVisitorStats(days = 30): Promise<VisitorStats> {
  return request<VisitorStats>(`/api/stats/visitors?days=${days}`);
}

export async function clearVisitorStats(): Promise<void> {
  await request('/api/stats/visitors', { method: 'DELETE' });
}

export async function resetAllData(): Promise<void> {
  await request('/api/reset', { method: 'POST' });
}

export function trackPageView(pagePath: string, postId?: string, referrer?: string): void {
  // Fire-and-forget — never throws
  fetch(`${API_URL}/api/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: pagePath, postId: postId || '', referrer: referrer || '' }),
  }).catch(() => {});
}

// ─── Admin ──────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  slug: string;
  displayName: string;
  email?: string;
  role: 'admin' | 'user';
  createdAt: string;
  isActive: boolean;
}

export interface DbStat {
  table: string;
  count: number;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  return request<AdminUser[]>('/api/admin/users');
}

export async function fetchAdminDbStats(): Promise<DbStat[]> {
  return request<DbStat[]>('/api/admin/stats');
}

export async function createAdminUser(data: { slug: string; displayName: string; password: string; role: string; email?: string }): Promise<{ ok: boolean; id: string }> {
  return request('/api/admin/users', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateAdminUser(id: string, data: { displayName?: string; role?: string; password?: string; email?: string }): Promise<void> {
  await request(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function purgeAdminUserData(id: string, options?: { deleteSessions?: boolean; deleteBlogPosts?: boolean; deleteSignOffs?: boolean; deleteExpenses?: boolean; deleteInventory?: boolean; deleteVisitorStats?: boolean }): Promise<void> {
  await request(`/api/admin/users/${id}/purge`, { method: 'POST', body: JSON.stringify(options || {}) });
}

export interface AdminTableResult {
  rows: Record<string, unknown>[];
  total: number;
}

export async function fetchAdminTableRows(table: string, opts?: { tenantId?: string; limit?: number; offset?: number }): Promise<AdminTableResult> {
  const params = new URLSearchParams();
  if (opts?.tenantId) params.set('tenantId', opts.tenantId);
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return request<AdminTableResult>(`/api/admin/table/${encodeURIComponent(table)}${qs ? '?' + qs : ''}`);
}

export async function deleteAdminTableRow(table: string, pk: string, tenantId?: string): Promise<void> {
  await request(`/api/admin/table/${encodeURIComponent(table)}`, { method: 'DELETE', body: JSON.stringify({ pk, tenantId }) });
}

export interface JobInfo {
  key: string;
  label: string;
  description: string;
  intervalMs: number;
  lastRun: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastResult: string | null;
  lastError: string | null;
  nextRun: string | null;
}

export async function fetchAdminJobs(): Promise<JobInfo[]> {
  return request<JobInfo[]>('/api/admin/jobs');
}

export async function runAdminJob(key: string): Promise<{ ok: boolean; message: string }> {
  return request(`/api/admin/jobs/${key}/run`, { method: 'POST' });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INVENTORY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface InvLocation {
  id: number;
  name: string;
  description: string;
  parentId: number | null;
  sortOrder: number;
  createdAt: string;
}

export interface InvPart {
  id: number;
  partNumber: string;
  name: string;
  manufacturer: string;
  kit: string;
  subKit: string;
  category: string;
  mfgDate: string;
  bag: string;
  notes: string;
  createdAt: string;
}

export interface InvStock {
  id: number;
  partId: number;
  locationId: number;
  quantity: number;
  unit: string;
  status: 'in_stock' | 'installed' | 'reserved' | 'backordered';
  condition: 'new' | 'used' | 'damaged';
  batch: string;
  sourceKit: string;
  notes: string;
  updatedAt: string;
  // joined
  partNumber?: string;
  partName?: string;
  manufacturer?: string;
  locationName?: string;
  locationPath?: string;
}

export interface InvStats {
  totalParts: number;
  totalLocations: number;
  totalStock: number;
  backordered: number;
  installed: number;
  byCategory: { category: string; count: number }[];
}

// Locations
export const fetchInvLocations   = ()                                    => request<InvLocation[]>('/api/inventory/locations');
export const createInvLocation   = (data: Partial<InvLocation>)          => request<InvLocation>('/api/inventory/locations', { method: 'POST', body: JSON.stringify(data) });
export const updateInvLocation   = (id: number, data: Partial<InvLocation>) => request<InvLocation>(`/api/inventory/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteInvLocation   = (id: number, cascade = false)          => request<{ ok: boolean }>(`/api/inventory/locations/${id}${cascade ? '?cascade=true' : ''}`, { method: 'DELETE' });

// Parts
export const fetchInvParts       = (params?: Record<string, string>)     => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request<InvPart[]>(`/api/inventory/parts${q}`); };
export const createInvPart       = (data: Partial<InvPart>)              => request<InvPart>('/api/inventory/parts', { method: 'POST', body: JSON.stringify(data) });
export const updateInvPart       = (id: number, data: Partial<InvPart>)  => request<InvPart>(`/api/inventory/parts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteInvPart       = (id: number)                          => request<{ ok: boolean }>(`/api/inventory/parts/${id}`, { method: 'DELETE' });
export const ingestInvPart       = (data: Partial<InvPart> & { quantity?: number; unit?: string; status?: string; locationId?: number }) => request<{ part: InvPart; created: boolean }>('/api/inventory/parts/ingest', { method: 'POST', body: JSON.stringify(data) });

// Stock
export const fetchInvStock       = (params?: Record<string, string>)     => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request<InvStock[]>(`/api/inventory/stock${q}`); };
export const createInvStock      = (data: Partial<InvStock>)             => request<InvStock>('/api/inventory/stock', { method: 'POST', body: JSON.stringify(data) });
export const updateInvStock      = (id: number, data: Partial<InvStock>) => request<InvStock>(`/api/inventory/stock/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteInvStock      = (id: number)                          => request<{ ok: boolean }>(`/api/inventory/stock/${id}`, { method: 'DELETE' });

// Stats & Lookup
export const fetchInvStats       = ()                                    => request<InvStats>('/api/inventory/stats');
export const lookupInvPart       = (partNumber: string)                  => request<InvStock[]>(`/api/inventory/lookup/${encodeURIComponent(partNumber)}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INVENTORY CHECK SESSIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CheckItem {
  id: number;
  sessionId: number;
  partNumber: string;
  nomenclature: string;
  subKit: string;
  bag: string;
  qtyExpected: number;
  qtyFound: number;
  unit: string;
  status: 'pending' | 'verified' | 'missing';
  notes: string;
  scannedAt: string | null;
}

export interface CheckSession {
  id: number;
  aircraftType: string;
  kitId: string;
  kitLabel: string;
  status: 'active' | 'paused' | 'completed';
  totalItems: number;
  verifiedItems: number;
  missingItems: number;
  createdAt: string;
  updatedAt: string;
  items?: CheckItem[];
}

export const fetchCheckSessions = () =>
  request<CheckSession[]>('/api/inventory/checks');

export const createCheckSession = (data: {
  aircraftType: string; kitId: string; kitLabel?: string;
  items: { partNumber: string; nomenclature?: string; subKit?: string; bag?: string; qtyExpected?: number; unit?: string }[];
}) =>
  request<CheckSession>('/api/inventory/checks', { method: 'POST', body: JSON.stringify(data) });

export const fetchCheckSession = (id: number) =>
  request<CheckSession>('/api/inventory/checks/' + id);

export const updateCheckSession = (id: number, data: { status: string }) =>
  request<CheckSession>(`/api/inventory/checks/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteCheckSession = (id: number) =>
  request<{ ok: boolean }>(`/api/inventory/checks/${id}`, { method: 'DELETE' });

export const updateCheckItem = (sessionId: number, itemId: number, data: Partial<CheckItem>) =>
  request<CheckItem>(`/api/inventory/checks/${sessionId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) });

export const verifyCheckBatch = (sessionId: number, items: { partNumber: string; qtyFound: number; isShort?: boolean; bag?: string }[]) =>
  request<{ matched: number }>(`/api/inventory/checks/${sessionId}/verify-batch`, { method: 'POST', body: JSON.stringify({ items }) });
