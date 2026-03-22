import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Plus, Download, Pencil, Trash2, Filter, ShieldCheck, Loader2, Menu, Timer, NotebookPen, Settings, LogOut, Paperclip, FileText, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { fetchExpenses, fetchExpenseStats, createExpense, updateExpense, deleteExpense, updateExpenseBudgets, EXPENSE_CATEGORIES, CURRENCIES, Expense, ExpenseStats } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

const API_URL = import.meta.env.VITE_API_URL || '';

function fmtEur(amount: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function CategoryBadge({ category }: { category: string }) {
  const cat = EXPENSE_CATEGORIES.find(c => c.id === category);
  return <span className="inline-flex items-center gap-1 text-xs">{cat?.icon} {cat?.label ?? category}</span>;
}

export default function ExpensesPage() {
  const { sections, labels, icons } = useSections();
  const { demoMode, logout } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>();
  const [filters, setFilters] = useState<{ category?: string; section?: string; certification?: string }>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [exp, st] = await Promise.all([fetchExpenses(filters), fetchExpenseStats()]);
      setExpenses(exp);
      setStats(st);
      const draft: Record<string, string> = {};
      for (const cat of EXPENSE_CATEGORIES) draft[cat.id] = st.budgets[cat.id] ? String(st.budgets[cat.id]) : '';
      setBudgetDraft(draft);
    } catch (err: any) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Omit<Expense, 'id' | 'amountEur' | 'createdAt' | 'updatedAt'>) => {
    if (editingExpense) {
      await updateExpense(editingExpense.id, data);
      toast.success('Expense updated');
    } else {
      await createExpense(data);
      toast.success('Expense added');
    }
    setEditingExpense(undefined);
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    await deleteExpense(id);
    toast.success('Expense deleted');
    load();
  };

  const handleSaveBudgets = async () => {
    const budgets: Record<string, number> = {};
    for (const [k, v] of Object.entries(budgetDraft)) {
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) budgets[k] = n;
    }
    await updateExpenseBudgets(budgets);
    toast.success('Budgets saved');
    load();
  };

  const openEdit = (expense: Expense) => { setEditingExpense(expense); setShowForm(true); };
  const openNew = () => { setEditingExpense(undefined); setShowForm(true); };

  const totalBudget = EXPENSE_CATEGORIES.reduce((s, c) => s + (parseFloat(budgetDraft[c.id] || '0') || 0), 0);

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleExportPdf = async () => {
    setGeneratingPdf(true);
    try {
      const [allExpenses, expStats] = await Promise.all([fetchExpenses({}), fetchExpenseStats()]);
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      const checkPage = (needed: number) => {
        if (y + needed > pageHeight - margin) { doc.addPage(); y = margin; }
      };

      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Expense Report', margin, y + 7);
      y += 12;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy HH:mm')}`, margin, y);
      y += 10;
      doc.setTextColor(0);

      // Summary
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', margin, y);
      y += 7;

      const lbaTotal = allExpenses.filter(e => e.isCertificationRelevant).reduce((s, e) => s + e.amountEur, 0);
      const rows: [string, string][] = [
        ['Total Spent', new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(expStats.totalEur)],
        ['Number of Entries', String(expStats.count)],
        ['LBA/EASA Relevant', new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(lbaTotal)],
      ];
      doc.setFontSize(10);
      for (const [label, value] of rows) {
        checkPage(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        doc.text(label, margin + 2, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(value, pageWidth - margin, y, { align: 'right' });
        y += 6;
      }
      y += 4;

      // By Category
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      checkPage(10);
      doc.text('By Category', margin, y);
      y += 7;
      doc.setFontSize(10);
      for (const cat of EXPENSE_CATEGORIES) {
        const spent = expStats.byCategory[cat.id] ?? 0;
        if (spent === 0) continue;
        checkPage(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60);
        doc.text(`${cat.icon} ${cat.label}`, margin + 2, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(spent), pageWidth - margin, y, { align: 'right' });
        y += 6;
      }
      checkPage(8);
      y += 2;
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL', margin + 2, y);
      doc.text(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(expStats.totalEur), pageWidth - margin, y, { align: 'right' });
      y += 12;

      // Itemized list
      checkPage(14);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('All Expenses', margin, y);
      y += 8;

      const sorted = [...allExpenses].sort((a, b) => a.date.localeCompare(b.date));
      doc.setFontSize(9);
      for (const exp of sorted) {
        checkPage(10);
        const cur = CURRENCIES.find(c => c.code === exp.currency);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(exp.description, margin + 2, y);
        doc.text(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(exp.amountEur), pageWidth - margin, y, { align: 'right' });
        y += 4.5;

        checkPage(5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        const cat = EXPENSE_CATEGORIES.find(c => c.id === exp.category);
        const meta = [
          format(new Date(exp.date), 'dd.MM.yyyy'),
          cat?.label,
          exp.vendor || null,
          exp.currency !== 'EUR' ? `${cur?.symbol}${exp.amount.toFixed(2)} ${exp.currency}` : null,
          exp.isCertificationRelevant ? 'LBA/EASA' : null,
        ].filter(Boolean).join(' · ');
        doc.text(meta, margin + 2, y);
        y += 4;

        doc.setDrawColor(230);
        doc.line(margin + 2, y, pageWidth - margin - 2, y);
        y += 4;
      }

      doc.save(`expenses-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (err: any) {
      toast.error('PDF generation failed: ' + err.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 sticky top-0 z-30">
        <div className="container max-w-7xl py-4 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5 text-primary" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground tracking-tight">Expense Tracker</h1>
          </div>
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Expense
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={generatingPdf} className="gap-1.5">
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`${API_URL}/api/expenses/export/csv`} download="expenses.csv" className="gap-1.5 flex items-center">
              <Download className="w-4 h-4" /> CSV
            </a>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
                <Menu className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {/* Navigation */}
              <DropdownMenuItem asChild>
                <Link to="/" className="flex items-center w-full">
                  <Timer className="w-4 h-4 mr-2" /> Build Tracker
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/blog" className="flex items-center w-full">
                  <NotebookPen className="w-4 h-4 mr-2" /> Build Blog
                </Link>
              </DropdownMenuItem>
              {/* Settings */}
              {!demoMode && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/tracker" state={{ openSettings: true }} className="flex items-center w-full">
                      <Settings className="w-4 h-4 mr-2" /> Settings
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              {/* Sign out */}
              {!demoMode && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="container max-w-7xl py-6">
        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="expenses">All Expenses</TabsTrigger>
            <TabsTrigger value="budgets">Budgets</TabsTrigger>
          </TabsList>

          {/* ── Overview ───────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
                <p className="text-2xl font-bold text-foreground">{fmtEur(stats?.totalEur ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats?.count ?? 0} entries</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Budget</p>
                <p className="text-2xl font-bold text-foreground">{fmtEur(totalBudget)}</p>
                <p className="text-xs text-muted-foreground mt-1">across all categories</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                <p className={`text-2xl font-bold ${totalBudget > 0 && (stats?.totalEur ?? 0) > totalBudget ? 'text-destructive' : 'text-foreground'}`}>
                  {fmtEur(Math.max(0, totalBudget - (stats?.totalEur ?? 0)))}
                </p>
                {totalBudget > 0 && <p className="text-xs text-muted-foreground mt-1">{Math.round(((stats?.totalEur ?? 0) / totalBudget) * 100)}% used</p>}
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">LBA Relevant</p>
                <p className="text-2xl font-bold text-foreground">
                  {fmtEur(expenses.filter(e => e.isCertificationRelevant).reduce((s, e) => s + e.amountEur, 0))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{expenses.filter(e => e.isCertificationRelevant).length} entries</p>
              </div>
            </div>

            {/* By Category */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-4">By Category</h2>
              <div className="space-y-3">
                {EXPENSE_CATEGORIES.map(cat => {
                  const spent = stats?.byCategory[cat.id] ?? 0;
                  const budget = stats?.budgets[cat.id] ?? 0;
                  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
                  const overBudget = budget > 0 && spent > budget;
                  if (spent === 0 && budget === 0) return null;
                  return (
                    <div key={cat.id}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-1.5">{cat.icon} {cat.label}</span>
                        <span className="text-muted-foreground">
                          {fmtEur(spent)}{budget > 0 && <span className={overBudget ? 'text-destructive' : ''}> / {fmtEur(budget)}</span>}
                        </span>
                      </div>
                      {budget > 0 && (
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${overBudget ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Monthly trend */}
            {(stats?.monthly?.length ?? 0) > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold mb-4">Monthly Spend</h2>
                <div className="space-y-2">
                  {[...(stats?.monthly ?? [])].reverse().map(m => {
                    const maxMonth = Math.max(...(stats?.monthly ?? []).map(x => x.total));
                    const pct = maxMonth > 0 ? (m.total / maxMonth) * 100 : 0;
                    return (
                      <div key={m.month} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">{m.month}</span>
                        <div className="flex-1 h-5 bg-secondary rounded overflow-hidden">
                          <div className="h-full bg-primary/60 rounded transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-20 text-right shrink-0">{fmtEur(m.total)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── All Expenses ───────────────────────────────────────── */}
          <TabsContent value="expenses" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select value={filters.category ?? ''} onChange={e => setFilters(f => ({ ...f, category: e.target.value || undefined }))}
                className="h-8 rounded-md border border-border bg-secondary px-2 text-xs">
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
              <select value={filters.section ?? ''} onChange={e => setFilters(f => ({ ...f, section: e.target.value || undefined }))}
                className="h-8 rounded-md border border-border bg-secondary px-2 text-xs">
                <option value="">All sections</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
              </select>
              <button onClick={() => setFilters(f => ({ ...f, certification: f.certification ? undefined : '1' }))}
                className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs transition-all ${filters.certification ? 'bg-primary/15 border-primary text-primary' : 'border-border bg-secondary text-muted-foreground hover:border-muted-foreground/50'}`}>
                <ShieldCheck className="w-3.5 h-3.5" /> LBA only
              </button>
              {(filters.category || filters.section || filters.certification) && (
                <button onClick={() => setFilters({})} className="text-xs text-muted-foreground hover:text-foreground">Clear filters</button>
              )}
            </div>

            {/* Table */}
            {loading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-lg">No expenses yet</p>
                <p className="text-sm mt-1">Add your first expense to start tracking build costs.</p>
                <Button className="mt-4" onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Add Expense</Button>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Date</th>
                      <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Description</th>
                      <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Category</th>
                      <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Section</th>
                      <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">Amount</th>
                      <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium">EUR</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(exp => {
                      const cur = CURRENCIES.find(c => c.code === exp.currency);
                      return (
                        <tr key={exp.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{format(new Date(exp.date), 'dd.MM.yyyy')}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{exp.description}</div>
                            {exp.vendor && <div className="text-xs text-muted-foreground">{exp.vendor}</div>}
                            {exp.isCertificationRelevant && <span className="inline-flex items-center gap-1 text-xs text-primary mt-0.5"><ShieldCheck className="w-3 h-3" />LBA</span>}
                          </td>
                          <td className="px-4 py-3"><CategoryBadge category={exp.category} /></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{exp.assemblySection ? `${icons[exp.assemblySection] || ''} ${labels[exp.assemblySection] || exp.assemblySection}` : '—'}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">{cur?.symbol}{exp.amount.toFixed(2)} {exp.currency !== 'EUR' && <span className="text-xs text-muted-foreground">{exp.currency}</span>}</td>
                          <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{fmtEur(exp.amountEur)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {exp.receiptUrls.length > 0 && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="p-1 text-muted-foreground hover:text-foreground transition-colors relative">
                                      <Paperclip className="w-3.5 h-3.5" />
                                      <span className="absolute -top-1 -right-1 text-[9px] leading-none bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                                        {exp.receiptUrls.length}
                                      </span>
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    {exp.receiptUrls.map(url => {
                                      const isPdf = url.toLowerCase().endsWith('.pdf');
                                      const name = decodeURIComponent(url.split('/').pop()?.replace(/^[^-]+-/, '') ?? url);
                                      return (
                                        <DropdownMenuItem key={url} asChild={!isPdf} onClick={isPdf ? async () => {
                                          const token = localStorage.getItem('auth_token');
                                          const res = await fetch(`${API_URL}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
                                          if (!res.ok) { toast.error('Could not open file'); return; }
                                          window.open(URL.createObjectURL(await res.blob()), '_blank');
                                        } : undefined}>
                                          {isPdf
                                            ? <span className="flex items-center gap-2 w-full"><FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate text-xs">{name}</span></span>
                                            : <a href={`${API_URL}${url}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 w-full"><Image className="w-3.5 h-3.5 shrink-0" /><span className="truncate text-xs">{name}</span></a>
                                          }
                                        </DropdownMenuItem>
                                      );
                                    })}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              <button onClick={() => openEdit(exp)} className="p-1 text-muted-foreground hover:text-foreground transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDelete(exp.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-secondary/50">
                      <td colSpan={5} className="px-4 py-2.5 text-xs text-muted-foreground font-medium text-right">Total</td>
                      <td className="px-4 py-2.5 text-right font-bold">{fmtEur(expenses.reduce((s, e) => s + e.amountEur, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ── Budgets ────────────────────────────────────────────── */}
          <TabsContent value="budgets" className="space-y-4">
            <p className="text-sm text-muted-foreground">Set a target budget per category. Leave blank for no budget.</p>
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              {EXPENSE_CATEGORIES.map(cat => {
                const spent = stats?.byCategory[cat.id] ?? 0;
                const budget = parseFloat(budgetDraft[cat.id] || '0') || 0;
                const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
                const overBudget = budget > 0 && spent > budget;
                return (
                  <div key={cat.id} className="grid grid-cols-[1fr_180px] gap-4 items-center">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-1.5">{cat.icon} {cat.label}</span>
                        <span className={`text-xs ${overBudget ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {fmtEur(spent)}{budget > 0 && ` / ${fmtEur(budget)}`}
                        </span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${overBudget ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                      <input type="number" min="0" step="100" value={budgetDraft[cat.id] ?? ''}
                        onChange={e => setBudgetDraft(d => ({ ...d, [cat.id]: e.target.value }))}
                        className="w-full h-9 rounded-md border border-border bg-secondary pl-6 pr-3 text-sm"
                        placeholder="No budget" />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-medium">Total budget: {fmtEur(totalBudget)}</span>
                <Button onClick={handleSaveBudgets}>Save Budgets</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {showForm && (
        <ExpenseForm expense={editingExpense} onSave={handleSave} onClose={() => { setShowForm(false); setEditingExpense(undefined); }} />
      )}
    </div>
  );
}
