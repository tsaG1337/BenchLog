import { useState, useEffect, useCallback } from 'react';
import { Plus, Download, Pencil, Trash2, ShieldCheck, Loader2, Paperclip, FileText, Image, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { fetchExpenses, fetchExpenseStats, createExpense, updateExpense, deleteExpense, CURRENCIES, Expense, ExpenseStats } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { AppShell, MIcon } from '@/components/AppShell';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { getCategoryIds } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '';

function fmtEur(amount: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

export default function ExpensesPage() {
  const { sections, labels, icons } = useSections();
  const { demoMode } = useAuth();
  const readOnly = demoMode;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>();
  const [filters, setFilters] = useState<{ category?: string; section?: string; certification?: string }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('BenchLog');
  const [waf, setWaf] = useState(100);

  const load = useCallback(async () => {
    try {
      const [exp, st] = await Promise.all([fetchExpenses(filters), fetchExpenseStats()]);
      setExpenses(exp);
      setStats(st);
    } catch (err: any) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    import('@/lib/api').then(({ fetchGeneralSettings }) =>
      fetchGeneralSettings().then(s => {
        setProjectName(s.projectName);
        setWaf(s.wafPercent ?? 100);
      }).catch(() => {})
    );
  }, []);

  /** Apply WAF scaling to an amount */
  const w = (amount: number) => amount * (waf / 100);

  const handleSave = async (data: Omit<Expense, 'id' | 'amountHome' | 'createdAt' | 'updatedAt'>) => {
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
    if (readOnly) { toast.error('Deleting is disabled in demo mode'); return; }
    if (!confirm('Delete this expense?')) return;
    await deleteExpense(id);
    toast.success('Expense deleted');
    load();
  };

  const openEdit = (expense: Expense) => { setEditingExpense(expense); setShowForm(true); };
  const openNew = () => { setEditingExpense(undefined); setShowForm(true); };

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

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', margin, y);
      y += 7;

      const partTotal = allExpenses.filter(e => e.isCertificationRelevant).reduce((s, e) => s + e.amountHome, 0);
      const rows: [string, string][] = [
        ['Total Spent', fmtEur(w(expStats.totalHome))],
        ['Number of Entries', String(expStats.count)],
        ['Aircraft Parts', fmtEur(w(partTotal))],
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

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      checkPage(10);
      doc.text('By Category', margin, y);
      y += 7;
      doc.setFontSize(10);
      for (const sec of sections) {
        const spent = expStats.byCategory[sec.id] ?? 0;
        if (spent === 0) continue;
        checkPage(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60);
        doc.text(sec.label, margin + 2, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(fmtEur(w(spent)), pageWidth - margin, y, { align: 'right' });
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
      doc.text(fmtEur(w(expStats.totalHome)), pageWidth - margin, y, { align: 'right' });
      y += 12;

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
        doc.text(fmtEur(w(exp.amountHome)), pageWidth - margin, y, { align: 'right' });
        y += 4.5;

        checkPage(5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        const catLabel = getCategoryIds(exp.category).map(c => labels[c] || c.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())).join(' + ');
        const meta = [
          format(new Date(exp.date), 'dd.MM.yyyy'),
          catLabel,
          exp.vendor || null,
          exp.currency !== 'EUR' ? `${cur?.symbol}${exp.amount.toFixed(2)} ${exp.currency}` : null,
          exp.isCertificationRelevant ? 'Aircraft Part' : null,
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

  const aircraftPartTotal = expenses.filter(e => e.isCertificationRelevant).reduce((s, e) => s + e.amountHome, 0);

  // Client-side search filtering
  const filteredExpenses = searchQuery.trim()
    ? expenses.filter(exp => {
        const q = searchQuery.trim().toLowerCase();
        return (
          exp.description.toLowerCase().includes(q) ||
          (exp.vendor || '').toLowerCase().includes(q) ||
          (exp.invoiceNumber || '').toLowerCase().includes(q) ||
          getCategoryIds(exp.category).some(c => (labels[c] || c).toLowerCase().includes(q)) ||
          exp.amount.toFixed(2).includes(q) ||
          exp.date.includes(q)
        );
      })
    : expenses;

  const headerActions = (
    <button
      onClick={openNew}
      className="font-label text-[10px] font-bold py-2 px-4 rounded hover:opacity-90 transition-colors flex items-center gap-2 uppercase tracking-wider shadow-sm bg-primary text-primary-foreground"
    >
      <Plus className="w-4 h-4" />
      <span className="hidden sm:inline">Add Expense</span>
    </button>
  );

  return (
    <AppShell activePage="expenses" projectName={projectName} headerRight={headerActions}>
      <div className="space-y-8">
        {/* ── Top Metrics ─────────────────────────────────────── */}
        <div className="flex justify-end gap-4">
          <div className="bg-card p-5 rounded-lg border-b-2 border-primary min-w-[180px] shadow-sm">
            <p className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">Total Spend</p>
            <p className="font-headline font-black text-2xl text-foreground mt-1">{fmtEur(w(stats?.totalHome ?? 0))}</p>
          </div>
          <div className="bg-card p-5 rounded-lg border-b-2 border-amber-500 min-w-[180px] shadow-sm">
            <p className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">Aircraft Parts</p>
            <p className="font-headline font-black text-2xl text-amber-600 mt-1">{fmtEur(w(aircraftPartTotal))}</p>
          </div>
        </div>

        {/* ── Toolbar & Filters ───────────────────────────────── */}
        <div>
          <div className="bg-muted/50 p-4 rounded-t-lg flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="bg-card px-3 py-2 rounded flex items-center gap-2 border border-border/30">
                <MIcon name="search" className="text-sm text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-xs font-medium focus:ring-0 focus:outline-none p-0 w-32 sm:w-44 placeholder:text-muted-foreground/50"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                    <MIcon name="close" className="text-sm" />
                  </button>
                )}
              </div>
              {/* Category filter */}
              <div className="bg-card px-3 py-2 rounded flex items-center gap-2 border border-border/30">
                <span className="font-label text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Filter:</span>
                <select
                  value={filters.category ?? ''}
                  onChange={e => setFilters(f => ({ ...f, category: e.target.value || undefined }))}
                  className="bg-transparent border-none text-xs font-medium focus:ring-0 p-0 pr-6 cursor-pointer"
                >
                  <option value="">All Categories</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              {/* Aircraft Parts toggle */}
              <div className="flex items-center gap-2 ml-2">
                <span className="font-label text-[10px] uppercase tracking-tight text-muted-foreground">Aircraft Parts Only</span>
                <button
                  onClick={() => setFilters(f => ({ ...f, certification: f.certification ? undefined : '1' }))}
                  className={`w-10 h-5 rounded-full relative transition-colors ${filters.certification ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${filters.certification ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              {(filters.category || filters.certification) && (
                <button onClick={() => setFilters({})} className="text-xs text-muted-foreground hover:text-foreground ml-2">Clear</button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportPdf}
                disabled={generatingPdf}
                className="flex items-center gap-2 px-4 py-2 bg-card text-foreground font-label text-[10px] font-bold rounded border border-border/30 hover:bg-muted transition-colors uppercase tracking-wider"
              >
                {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <MIcon name="picture_as_pdf" className="text-sm" />}
                Export PDF
              </button>
              <button
                onClick={async () => {
                  try {
                    const token = localStorage.getItem('auth_token');
                    const res = await fetch(`${API_URL}/api/expenses/export/csv`, {
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    if (!res.ok) throw new Error('CSV export failed');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'expenses.csv'; a.click();
                    URL.revokeObjectURL(url);
                  } catch (err: any) {
                    toast.error(err.message || 'CSV export failed');
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-card text-foreground font-label text-[10px] font-bold rounded border border-border/30 hover:bg-muted transition-colors uppercase tracking-wider"
              >
                <MIcon name="csv" className="text-sm" />
                Export CSV
              </button>
            </div>
          </div>

          {/* ── Table ──────────────────────────────────────────── */}
          {loading ? (
            <div className="bg-card rounded-b-lg text-center py-16 text-muted-foreground text-sm">Loading...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="bg-card rounded-b-lg text-center py-16 text-muted-foreground">
              {searchQuery ? (
                <>
                  <p className="text-lg">No results found</p>
                  <p className="text-sm mt-1">No expenses match "{searchQuery}"</p>
                  <button onClick={() => setSearchQuery('')} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-muted text-foreground font-label text-xs font-bold rounded">
                    Clear Search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-lg">No expenses yet</p>
                  <p className="text-sm mt-1">Add your first expense to start tracking build costs.</p>
                  <button onClick={openNew} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-label text-xs font-bold rounded">
                    <Plus className="w-4 h-4" /> Add Expense
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Mobile card layout */}
              <div className="space-y-3 md:hidden">
                {filteredExpenses.map(exp => {
                  const cur = CURRENCIES.find(c => c.code === exp.currency);
                  return (
                    <div key={exp.id} className="bg-card rounded-lg p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <span className="block font-medium text-sm line-clamp-2 break-words" title={exp.description}>{exp.description}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{format(new Date(exp.date), 'dd.MM.yyyy')}</span>
                            <span>·</span>
                            <span className="uppercase text-[10px] font-bold tracking-wider">{getCategoryIds(exp.category).map(c => labels[c] || c).join(' + ')}</span>
                          </div>
                          {exp.vendor && <div className="text-xs text-muted-foreground mt-0.5">{exp.vendor}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-sm">{fmtEur(w(exp.amountHome))}</div>
                          {exp.currency !== 'EUR' && <div className="text-xs text-muted-foreground">{cur?.symbol}{exp.amount.toFixed(2)}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 pt-2">
                        {exp.isCertificationRelevant ? (
                          <span className="inline-flex items-center gap-1 text-xs text-primary mr-auto"><ShieldCheck className="w-3 h-3" />Aircraft Part</span>
                        ) : <span className="mr-auto" />}
                        {exp.link && /^https?:\/\//i.test(exp.link) && (
                          <a href={exp.link} target="_blank" rel="noreferrer" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {exp.receiptUrls.length > 0 && (
                          <ReceiptDropdown exp={exp} />
                        )}
                        {<>
                          <button onClick={() => openEdit(exp)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(exp.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="bg-card shadow-sm rounded-b-lg overflow-hidden hidden md:block">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="px-6 py-4 font-label text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold">Date</th>
                      <th className="px-6 py-4 font-label text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold">Description</th>
                      <th className="px-6 py-4 font-label text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold">Category</th>
                      <th className="px-6 py-4 font-label text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold text-right">Amount</th>
                      <th className="px-6 py-4 font-label text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold">Status</th>
                      <th className="px-6 py-4 font-label text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-border/50">
                    {filteredExpenses.map(exp => {
                      const cur = CURRENCIES.find(c => c.code === exp.currency);
                      const catLabel = getCategoryIds(exp.category).map(c => (labels[c] || c.replace(/-/g, ' '))).join(' + ').toUpperCase();
                      return (
                        <tr key={exp.id} className="hover:bg-muted/30 transition-colors group">
                          <td className="px-6 py-5 font-label text-muted-foreground whitespace-nowrap">
                            {format(new Date(exp.date), 'yyyy-MM-dd')}
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col">
                              <span className="font-bold text-foreground">{exp.description}</span>
                              {exp.vendor && (
                                <span className="text-[10px] text-muted-foreground font-label uppercase mt-0.5">{exp.vendor}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className="px-2.5 py-1 bg-muted text-muted-foreground text-[10px] font-bold rounded uppercase tracking-wider">
                              {catLabel}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-right font-bold">
                            <div className="flex flex-col">
                              <span>{fmtEur(w(exp.amountHome))}</span>
                              {exp.currency !== 'EUR' && (
                                <span className="text-[10px] text-muted-foreground font-label font-normal mt-0.5">
                                  {cur?.symbol}{exp.amount.toFixed(2)} {exp.currency}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${exp.isCertificationRelevant ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                              <span className={`text-xs font-label uppercase font-bold ${exp.isCertificationRelevant ? 'text-primary' : 'text-muted-foreground'}`}>
                                {exp.isCertificationRelevant ? 'Aircraft Part' : 'Internal Only'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {exp.link && /^https?:\/\//i.test(exp.link) && (
                                <a href={exp.link} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-muted rounded text-muted-foreground" title="Open link">
                                  <ExternalLink className="w-[18px] h-[18px]" />
                                </a>
                              )}
                              {exp.receiptUrls.length > 0 && (
                                <ReceiptDropdown exp={exp} />
                              )}
                              {<>
                                <button onClick={() => openEdit(exp)} className="p-1.5 hover:bg-muted rounded text-muted-foreground" title="Edit">
                                  <MIcon name="edit" className="text-[18px]" />
                                </button>
                                <button onClick={() => handleDelete(exp.id)} className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded text-muted-foreground" title="Delete">
                                  <MIcon name="delete" className="text-[18px]" />
                                </button>
                              </>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Footer */}
                <div className="px-6 py-4 bg-muted/30 border-t border-border/50 flex items-center justify-between">
                  <p className="font-label text-xs text-muted-foreground">
                    Showing {filteredExpenses.length} transaction{filteredExpenses.length !== 1 ? 's' : ''}{searchQuery && ` of ${expenses.length}`} &middot; Total: <span className="font-bold text-foreground">{fmtEur(w(filteredExpenses.reduce((s, e) => s + e.amountHome, 0)))}</span>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Spend by Category ────────────────────────────────── */}
        {stats && Object.values(stats.byCategory).some(v => v > 0) && (() => {
          const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'];
          const catData = sections
            .filter(sec => (stats.byCategory[sec.id] ?? 0) > 0)
            .sort((a, b) => (stats.byCategory[b.id] ?? 0) - (stats.byCategory[a.id] ?? 0))
            .map((sec, i) => ({ id: sec.id, label: sec.label, spent: stats.byCategory[sec.id] ?? 0, color: PIE_COLORS[i % PIE_COLORS.length] }));
          const totalSpent = catData.reduce((s, c) => s + c.spent, 0);
          // Build SVG pie slices
          let cumAngle = -Math.PI / 2;
          const slices = catData.map(c => {
            const angle = totalSpent > 0 ? (c.spent / totalSpent) * 2 * Math.PI : 0;
            const startAngle = cumAngle;
            cumAngle += angle;
            const endAngle = cumAngle;
            const largeArc = angle > Math.PI ? 1 : 0;
            const x1 = 50 + 40 * Math.cos(startAngle), y1 = 50 + 40 * Math.sin(startAngle);
            const x2 = 50 + 40 * Math.cos(endAngle), y2 = 50 + 40 * Math.sin(endAngle);
            const path = catData.length === 1
              ? `M 50 10 A 40 40 0 1 1 49.99 10 Z`
              : `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;
            return { ...c, path, pct: totalSpent > 0 ? (c.spent / totalSpent) * 100 : 0 };
          });
          return (
            <div className="bg-card p-8 rounded-lg shadow-sm">
              <p className="font-label text-[10px] uppercase tracking-widest text-muted-foreground mb-6 font-bold">Spend by Category</p>
              <div className="flex flex-col md:flex-row items-center gap-8">
                <svg viewBox="0 0 100 100" className="w-48 h-48 shrink-0">
                  {slices.map(s => (
                    <path key={s.id} d={s.path} fill={s.color} stroke="hsl(var(--card))" strokeWidth="0.5" />
                  ))}
                </svg>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {slices.map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between font-label text-[10px] uppercase font-bold text-foreground">
                          <span className="truncate">{s.label}</span>
                          <span className="ml-2 shrink-0">{fmtEur(w(s.spent))}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{s.pct.toFixed(1)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Monthly Spend ───────────────────────────────────── */}
        {(stats?.monthly?.length ?? 0) > 0 && (
          <div className="bg-card p-8 rounded-lg shadow-sm">
            <p className="font-label text-[10px] uppercase tracking-widest text-muted-foreground mb-6 font-bold">Monthly Spend</p>
            <div className="space-y-3">
              {[...(stats?.monthly ?? [])].reverse().map(m => {
                const maxMonth = Math.max(...(stats?.monthly ?? []).map(x => x.total));
                const pct = maxMonth > 0 ? (m.total / maxMonth) * 100 : 0;
                return (
                  <div key={m.month}>
                    <div className="flex justify-between font-label text-[10px] uppercase font-bold text-foreground mb-1">
                      <span>{m.month}</span>
                      <span>{fmtEur(w(m.total))}</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <ExpenseForm expense={editingExpense} onSave={handleSave} onClose={() => { setShowForm(false); setEditingExpense(undefined); }} readOnly={readOnly} />
      )}
    </AppShell>
  );
}

/* ── Receipt dropdown (shared between mobile + desktop) ── */
function ReceiptDropdown({ exp }: { exp: Expense }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors relative hover:bg-muted rounded" title="View receipts">
          <Paperclip className="w-[18px] h-[18px]" />
          <span className="absolute -top-0.5 -right-0.5 text-[9px] leading-none bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
            {exp.receiptUrls.length}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {exp.receiptUrls.map(url => {
          const isPdf = url.toLowerCase().endsWith('.pdf');
          const rawName = url.split('/').pop() ?? '';
          const stripped = rawName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, '');
          const name = decodeURIComponent(stripped || rawName);
          const isSafeUrl = /^https?:\/\//i.test(url) || url.startsWith('/');
          const fileUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
          return (
            <DropdownMenuItem key={url} onSelect={() => {
              if (!isSafeUrl) return;
              if (isPdf && !url.startsWith('http')) {
                const token = localStorage.getItem('auth_token');
                fetch(fileUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                  .then(r => r.ok ? r.blob() : Promise.reject('Could not open file'))
                  .then(blob => { const blobUrl = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = blobUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click(); setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); })
                  .catch(e => toast.error(String(e)));
              } else {
                const a = document.createElement('a'); a.href = fileUrl; a.target = '_blank'; a.rel = 'noreferrer'; a.click();
              }
            }}>
              <span className="flex items-center gap-2 w-full">
                {isPdf ? <FileText className="w-3.5 h-3.5 shrink-0" /> : <Image className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate text-xs">{name}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
