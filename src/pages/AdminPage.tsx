import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAdminUsers, fetchAdminDbStats, createAdminUser, updateAdminUser, deleteAdminUser, AdminUser, DbStat } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Pencil, Trash2, ShieldCheck, User, Database, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const TABLE_LABELS: Record<string, string> = {
  sessions: 'Work Sessions',
  blog_posts: 'Blog Posts',
  expenses: 'Expenses',
  expense_budgets: 'Expense Budgets',
  sign_offs: 'Sign-offs',
  image_annotations: 'Image Annotations',
  visitor_stats: 'Visitor Stats',
  pending_uploads: 'Pending Uploads',
};

type DialogMode = 'create' | 'edit' | null;

interface UserForm {
  slug: string;
  displayName: string;
  email: string;
  password: string;
  role: string;
}

const emptyForm: UserForm = { slug: '', displayName: '', email: '', password: '', role: 'user' };

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
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

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

  useEffect(() => { loadUsers(); loadStats(); }, [loadUsers, loadStats]);

  const openCreate = () => { setForm(emptyForm); setEditTarget(null); setDialogMode('create'); };
  const openEdit = (u: AdminUser) => {
    setForm({ slug: u.slug, displayName: u.displayName, email: u.email || '', password: '', role: u.role });
    setEditTarget(u);
    setDialogMode('edit');
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAdminUser(deleteTarget.id);
      toast.success('User deleted');
      setDeleteTarget(null);
      loadUsers();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

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

      <div className="max-w-5xl mx-auto p-6">
        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users"><User className="w-4 h-4 mr-2" />Users</TabsTrigger>
            <TabsTrigger value="database"><Database className="w-4 h-4 mr-2" />Database</TabsTrigger>
          </TabsList>

          {/* ── Users tab ── */}
          <TabsContent value="users">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">User Accounts</h2>
              <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />New User</Button>
            </div>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-mono text-sm">{u.slug}</TableCell>
                        <TableCell>{u.displayName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{u.email || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(u)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Database tab ── */}
          <TabsContent value="database">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Table Overview</h2>
              <Button variant="outline" size="sm" onClick={loadStats} disabled={statsLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${statsLoading ? 'animate-spin' : ''}`} />Refresh
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Row Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statsLoading ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
                  ) : stats.map(s => (
                    <TableRow key={s.table}>
                      <TableCell className="font-mono text-sm">{s.table}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{TABLE_LABELS[s.table] || s.table}</TableCell>
                      <TableCell className="text-right font-medium">{s.count.toLocaleString()}</TableCell>
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

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteTarget !== null} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete <span className="font-medium text-foreground">{deleteTarget?.displayName}</span> ({deleteTarget?.slug})?
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
