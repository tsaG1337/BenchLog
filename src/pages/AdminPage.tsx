import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAdminUsers, fetchAdminDbStats, createAdminUser, updateAdminUser, purgeAdminUserData, fetchAdminTableRows, deleteAdminTableRow, fetchAdminJobs, runAdminJob, fetchGeneralSettings, updateGeneralSettings, AdminUser, DbStat, AdminTableResult, JobInfo } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Plus, Pencil, Trash2, ShieldCheck, User, Database, RefreshCw, Search, ChevronLeft, ChevronRight, Eye, Activity, CheckCircle2, XCircle, Clock, Play, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const TABLE_LABELS: Record<string, string> = {
  sessions: 'Work Sessions',
  blog_posts: 'Blog Posts',
  expenses: 'Expenses',
  expense_budgets: 'Expense Budgets',
  sign_offs: 'Sign-offs',
  visitor_stats: 'Visitor Stats',
  pending_uploads: 'Pending Uploads',
  inventory_parts: 'Inventory Parts',
  inventory_stock: 'Inventory Stock',
  inventory_locations: 'Inventory Locations',
};

// Primary key column per table (must match server ADMIN_TABLE_PK)
const TABLE_PK: Record<string, string> = {
  sessions: 'id', blog_posts: 'id', expenses: 'id', expense_budgets: 'category',
  sign_offs: 'id', visitor_stats: 'id', pending_uploads: 'url',
  inventory_parts: 'id', inventory_stock: 'id', inventory_locations: 'id',
};

// Columns to show as summary in the browser (first = "title" column)
const TABLE_COLS: Record<string, string[]> = {
  sessions:              ['section', 'start_time', 'duration_minutes', 'notes'],
  blog_posts:            ['title', 'section', 'published_at'],
  expenses:              ['date', 'description', 'amount', 'currency'],
  expense_budgets:       ['category', 'budget_amount'],
  sign_offs:             ['package_label', 'section_id', 'date', 'inspector_name'],
  visitor_stats:         ['ts', 'path', 'country', 'referrer'],
  pending_uploads:       ['url', 'uploaded_at'],
  inventory_parts:       ['part_number', 'name', 'category', 'manufacturer'],
  inventory_stock:       ['part_id', 'quantity', 'location_id', 'condition', 'status'],
  inventory_locations:   ['name', 'parent_id'],
};

const PAGE_SIZE = 50;

function formatCellValue(col: string, val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (col === 'ts') return new Date(Number(val)).toLocaleString();
  if (col === 'image_urls' || col === 'receipt_urls') {
    try { const arr = JSON.parse(String(val)); return `${Array.isArray(arr) ? arr.length : '?'} file(s)`; } catch { return String(val); }
  }
  const s = String(val);
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

type DialogMode = 'create' | 'edit' | null;

interface UserForm {
  slug: string;
  displayName: string;
  email: string;
  password: string;
  role: string;
}

interface PurgeOptions {
  deleteSessions: boolean;
  deleteBlogPosts: boolean;
  deleteSignOffs: boolean;
  deleteExpenses: boolean;
  deleteInventory: boolean;
  deleteVisitorStats: boolean;
}

const emptyForm: UserForm = { slug: '', displayName: '', email: '', password: '', role: 'user' };
const defaultPurgeOptions: PurgeOptions = { deleteSessions: false, deleteBlogPosts: false, deleteSignOffs: false, deleteExpenses: false, deleteInventory: false, deleteVisitorStats: false };

function truncateId(id: string): string {
  if (!id) return '—';
  return id.length > 8 ? id.slice(0, 8) + '…' : id;
}

export default function AdminPage() {
  const { role: myRole } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<DbStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<AdminUser | null>(null);
  const [purgeOptions, setPurgeOptions] = useState<PurgeOptions>(defaultPurgeOptions);
  const [purging, setPurging] = useState(false);
  const [search, setSearch] = useState('');

  // Jobs
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Maintenance mode
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceToggling, setMaintenanceToggling] = useState(false);

  // Table browser
  const [browserTable, setBrowserTable] = useState<string | null>(null);
  const [browserData, setBrowserData] = useState<AdminTableResult | null>(null);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserPage, setBrowserPage] = useState(0);
  const [deletingRow, setDeletingRow] = useState<string | null>(null);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<{ pk: string; tenantId?: string } | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await fetchAdminUsers());
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await fetchAdminDbStats());
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      setJobs(await fetchAdminJobs());
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadMaintenance = useCallback(async () => {
    setMaintenanceLoading(true);
    try {
      const s = await fetchGeneralSettings();
      setMaintenanceMode(!!s.maintenanceMode);
    } catch {} finally { setMaintenanceLoading(false); }
  }, []);

  const toggleMaintenance = async (enabled: boolean) => {
    setMaintenanceToggling(true);
    try {
      await updateGeneralSettings({ maintenanceMode: enabled });
      setMaintenanceMode(enabled);
      toast.success(enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
    } catch (e: any) {
      toast.error(e.message);
    } finally { setMaintenanceToggling(false); }
  };

  useEffect(() => { loadUsers(); loadStats(); loadJobs(); loadMaintenance(); }, [loadUsers, loadStats, loadJobs, loadMaintenance]);

  const openTableBrowser = useCallback(async (table: string, page = 0) => {
    setBrowserTable(table);
    setBrowserPage(page);
    setBrowserLoading(true);
    setBrowserData(null);
    try {
      const data = await fetchAdminTableRows(table, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      setBrowserData(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBrowserLoading(false);
    }
  }, []);

  const handleDeleteRow = async () => {
    if (!confirmDeleteRow || !browserTable) return;
    setDeletingRow(confirmDeleteRow.pk);
    try {
      await deleteAdminTableRow(browserTable, confirmDeleteRow.pk, confirmDeleteRow.tenantId);
      toast.success('Row deleted');
      setConfirmDeleteRow(null);
      await openTableBrowser(browserTable, browserPage);
      loadStats();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeletingRow(null);
    }
  };

  const openCreate = () => { setForm(emptyForm); setEditTarget(null); setDialogMode('create'); };
  const openEdit = (u: AdminUser) => {
    setForm({ slug: u.slug, displayName: u.displayName, email: u.email || '', password: '', role: u.role });
    setEditTarget(u);
    setDialogMode('edit');
  };

  const openPurge = (u: AdminUser) => {
    setPurgeTarget(u);
    setPurgeOptions(defaultPurgeOptions);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (dialogMode === 'create') {
        await createAdminUser({ slug: form.slug, displayName: form.displayName, password: form.password, role: form.role, email: form.email || undefined });
        toast.success('User created');
      } else if (editTarget) {
        const update: any = { slug: form.slug, displayName: form.displayName, role: form.role, email: form.email || undefined };
        if (form.password) update.password = form.password;
        await updateAdminUser(editTarget.id, update);
        toast.success('User updated');
      }
      setDialogMode(null);
      loadUsers();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    setPurging(true);
    try {
      await purgeAdminUserData(purgeTarget.id, purgeOptions);
      toast.success('User data purged');
      setPurgeTarget(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPurging(false);
    }
  };

  const filteredUsers = search.trim()
    ? users.filter(u => {
        const q = search.trim().toLowerCase();
        return (
          u.slug.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q)
        );
      })
    : users;

  const anyPurgeSelected = purgeOptions.deleteSessions || purgeOptions.deleteBlogPosts || purgeOptions.deleteSignOffs || purgeOptions.deleteExpenses || purgeOptions.deleteInventory || purgeOptions.deleteVisitorStats;

  if (myRole !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/tracker"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-foreground">Admin Panel</h1>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ── Maintenance Mode ── */}
        {!maintenanceLoading && (
          <div className={`rounded-lg border p-4 mb-6 flex items-center justify-between gap-4 ${maintenanceMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-card border-border'}`}>
            <div className="flex items-center gap-3">
              <AlertTriangle className={`w-5 h-5 shrink-0 ${maintenanceMode ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-sm font-medium text-foreground">Maintenance Mode</p>
                <p className="text-xs text-muted-foreground">
                  {maintenanceMode
                    ? 'Active — non-admin users cannot log in or make changes. Public pages show a maintenance notice.'
                    : 'When enabled, only admins can access the application. Useful before server updates.'}
                </p>
              </div>
            </div>
            <Switch
              checked={maintenanceMode}
              onCheckedChange={toggleMaintenance}
              disabled={maintenanceToggling}
            />
          </div>
        )}

        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users"><User className="w-4 h-4 mr-2" />Users</TabsTrigger>
            <TabsTrigger value="database"><Database className="w-4 h-4 mr-2" />Database</TabsTrigger>
            <TabsTrigger value="jobs"><Activity className="w-4 h-4 mr-2" />Jobs</TabsTrigger>
          </TabsList>

          {/* ── Users tab ── */}
          <TabsContent value="users">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
              <h2 className="text-lg font-semibold shrink-0">User Accounts</h2>
              <div className="flex items-center gap-2 flex-1 sm:max-w-sm">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search by username, name, email…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button size="sm" onClick={openCreate} className="shrink-0"><Plus className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">New User</span></Button>
              </div>
            </div>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : (
              <div className="border border-border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24 hidden sm:table-cell">ID</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead className="hidden sm:table-cell">Display Name</TableHead>
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="hidden md:table-cell">Created</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="hidden sm:table-cell">
                          <span
                            className="font-mono text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                            title={u.id}
                            onClick={() => { navigator.clipboard.writeText(u.id); toast.success('UUID copied'); }}
                          >
                            {truncateId(u.id)}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{u.slug}</TableCell>
                        <TableCell className="hidden sm:table-cell">{u.displayName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm hidden md:table-cell">{u.email || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm hidden md:table-cell">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => openPurge(u)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredUsers.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {search ? 'No users match your search' : 'No users found'}
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Database tab ── */}
          <TabsContent value="database">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Table Overview</h2>
                <p className="text-xs text-muted-foreground">Click a row to browse and manage its contents</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadStats} disabled={statsLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${statsLoading ? 'animate-spin' : ''}`} />Refresh
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="hidden sm:table-cell">Description</TableHead>
                    <TableHead className="text-right">Row Count</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statsLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
                  ) : stats.map(s => (
                    <TableRow
                      key={s.table}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openTableBrowser(s.table)}
                    >
                      <TableCell className="font-mono text-sm">{s.table}</TableCell>
                      <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">{TABLE_LABELS[s.table] || s.table}</TableCell>
                      <TableCell className="text-right font-medium">{s.count.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Eye className="w-4 h-4 text-muted-foreground ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Jobs tab ── */}
          <TabsContent value="jobs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Scheduled Jobs</h2>
                <p className="text-xs text-muted-foreground">Background maintenance tasks running on the server</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadJobs} disabled={jobsLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${jobsLoading ? 'animate-spin' : ''}`} />Refresh
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead className="hidden sm:table-cell">Interval</TableHead>
                    <TableHead className="hidden md:table-cell">Last Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Result / Error</TableHead>
                    <TableHead className="hidden sm:table-cell">Next Run</TableHead>
                    <TableHead className="w-[1%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobsLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
                  ) : jobs.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No jobs registered</TableCell></TableRow>
                  ) : jobs.map(job => (
                    <TableRow key={job.key}>
                      <TableCell>
                        <div className="font-medium text-sm">{job.label}</div>
                        <div className="text-xs text-muted-foreground">{job.description}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {job.intervalMs === 0
                          ? 'One-time'
                          : job.intervalMs >= 3600000
                            ? `Every ${job.intervalMs / 3600000}h`
                            : `Every ${job.intervalMs / 60000}m`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap hidden md:table-cell">
                        {job.lastRun
                          ? <span title={job.lastRun}>{new Date(job.lastRun).toLocaleString()}</span>
                          : <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Not yet run</span>}
                      </TableCell>
                      <TableCell>
                        {job.lastStatus === 'ok' && (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-600 gap-1">
                            <CheckCircle2 className="w-3 h-3" />OK
                          </Badge>
                        )}
                        {job.lastStatus === 'error' && (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="w-3 h-3" />Error
                          </Badge>
                        )}
                        {!job.lastStatus && (
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="w-3 h-3" />Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate hidden md:table-cell">
                        {job.lastStatus === 'error' ? (
                          <span className="text-destructive" title={job.lastError ?? ''}>{job.lastError}</span>
                        ) : job.lastResult ? (
                          job.lastResult
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {job.nextRun
                          ? <span title={job.nextRun}>{new Date(job.nextRun).toLocaleString()}</span>
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={runningJob === job.key}
                          onClick={async () => {
                            setRunningJob(job.key);
                            try {
                              await runAdminJob(job.key);
                              toast.success(`Job "${job.label}" started`);
                              setTimeout(loadJobs, 3000);
                            } catch (e: any) {
                              toast.error(e.message || 'Failed to start job');
                            } finally {
                              setRunningJob(null);
                            }
                          }}
                        >
                          <Play className={`w-3.5 h-3.5 mr-1 ${runningJob === job.key ? 'animate-pulse' : ''}`} />
                          Run
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={dialogMode !== null} onOpenChange={o => { if (!o) setDialogMode(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'New User' : 'Edit User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Username</label>
              <Input placeholder="e.g. john" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} autoComplete="off" />
              <p className="text-xs text-muted-foreground">Used to log in. Lowercase letters, numbers and hyphens only.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Display Name</label>
              <Input placeholder="e.g. John Smith" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input type="email" placeholder="john@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Password {dialogMode === 'edit' && <span className="text-muted-foreground font-normal">(leave blank to keep current)</span>}</label>
              <Input type="password" placeholder={dialogMode === 'edit' ? 'New password (optional)' : 'Password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Role</label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Table Browser Dialog ── */}
      <Dialog open={browserTable !== null} onOpenChange={o => { if (!o) { setBrowserTable(null); setBrowserData(null); } }}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              {browserTable && (TABLE_LABELS[browserTable] || browserTable)}
              {browserData && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  — {browserData.total.toLocaleString()} row{browserData.total !== 1 ? 's' : ''}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto min-h-0">
            {browserLoading ? (
              <p className="text-center text-muted-foreground py-12 text-sm">Loading...</p>
            ) : browserData && browserTable ? (
              browserData.rows.length === 0 ? (
                <p className="text-center text-muted-foreground py-12 text-sm">No rows found.</p>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-xs">#</TableHead>
                        {browserData.rows[0]._tenantSlug !== undefined && <TableHead className="text-xs">User</TableHead>}
                        {(TABLE_COLS[browserTable] || Object.keys(browserData.rows[0]).filter(k => !k.startsWith('_') && k !== 'tenant_id')).map(col => (
                          <TableHead key={col} className="text-xs">{col}</TableHead>
                        ))}
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {browserData.rows.map((row, i) => {
                        const pk = String(row[TABLE_PK[browserTable] ?? 'id'] ?? '');
                        const tenantId = String(row.tenant_id ?? '');
                        const cols = TABLE_COLS[browserTable] || Object.keys(row).filter(k => !k.startsWith('_') && k !== 'tenant_id');
                        return (
                          <TableRow key={`${tenantId}-${pk}-${i}`}>
                            <TableCell className="text-xs text-muted-foreground">{browserPage * PAGE_SIZE + i + 1}</TableCell>
                            {row._tenantSlug !== undefined && (
                              <TableCell className="font-mono text-xs text-muted-foreground">{String(row._tenantSlug)}</TableCell>
                            )}
                            {cols.map(col => (
                              <TableCell key={col} className="text-xs max-w-[200px] truncate" title={String(row[col] ?? '')}>
                                {formatCellValue(col, row[col])}
                              </TableCell>
                            ))}
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive h-7 w-7"
                                disabled={deletingRow === pk}
                                onClick={() => setConfirmDeleteRow({ pk, tenantId: tenantId || undefined })}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : null}
          </div>

          {browserData && browserData.total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-3 border-t border-border mt-2 shrink-0">
              <span className="text-xs text-muted-foreground">
                {browserPage * PAGE_SIZE + 1}–{Math.min((browserPage + 1) * PAGE_SIZE, browserData.total)} of {browserData.total}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline" size="sm"
                  disabled={browserPage === 0 || browserLoading}
                  onClick={() => openTableBrowser(browserTable!, browserPage - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline" size="sm"
                  disabled={(browserPage + 1) * PAGE_SIZE >= browserData.total || browserLoading}
                  onClick={() => openTableBrowser(browserTable!, browserPage + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm delete row dialog ── */}
      <Dialog open={confirmDeleteRow !== null} onOpenChange={o => { if (!o) setConfirmDeleteRow(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete row?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete the row with key <span className="font-mono text-foreground break-all">{confirmDeleteRow?.pk}</span>.
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteRow(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRow} disabled={!!deletingRow}>
              {deletingRow ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Purge Data Dialog ── */}
      <Dialog open={purgeTarget !== null} onOpenChange={o => { if (!o) setPurgeTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Purge User Data</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              Clear data for <span className="font-medium text-foreground">{purgeTarget?.displayName}</span> ({purgeTarget?.slug}).
              The user account remains intact — only the selected data is removed.
            </p>
            <div className="space-y-3 rounded-md border border-border p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={purgeOptions.deleteSessions}
                  onCheckedChange={v => setPurgeOptions(o => ({ ...o, deleteSessions: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Work sessions + images</p>
                  <p className="text-xs text-muted-foreground">All logged sessions, timer state, and uploaded photos.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={purgeOptions.deleteBlogPosts}
                  onCheckedChange={v => setPurgeOptions(o => ({ ...o, deleteBlogPosts: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Blog posts + images</p>
                  <p className="text-xs text-muted-foreground">All blog entries and their uploaded photos.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={purgeOptions.deleteSignOffs}
                  onCheckedChange={v => setPurgeOptions(o => ({ ...o, deleteSignOffs: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Sign-offs + signatures</p>
                  <p className="text-xs text-muted-foreground">All inspector sign-off records and signature files.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={purgeOptions.deleteExpenses}
                  onCheckedChange={v => setPurgeOptions(o => ({ ...o, deleteExpenses: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Expenses + receipts</p>
                  <p className="text-xs text-muted-foreground">All expense entries, budgets, and uploaded receipts.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={purgeOptions.deleteInventory}
                  onCheckedChange={v => setPurgeOptions(o => ({ ...o, deleteInventory: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Inventory</p>
                  <p className="text-xs text-muted-foreground">All parts, stock, locations, and kit check sessions.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={purgeOptions.deleteVisitorStats}
                  onCheckedChange={v => setPurgeOptions(o => ({ ...o, deleteVisitorStats: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Visitor statistics</p>
                  <p className="text-xs text-muted-foreground">All page view tracking data.</p>
                </div>
              </label>
            </div>
            {anyPurgeSelected && (
              <p className="text-xs text-destructive font-medium">
                Selected data will be permanently deleted and cannot be recovered.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handlePurge} disabled={purging || !anyPurgeSelected}>
              {purging ? 'Purging…' : 'Purge selected data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
