import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Expense, CURRENCIES, uploadReceipts, deleteReceipt, fetchGeneralSettings } from '@/lib/api';
import { useSections } from '@/contexts/SectionsContext';
import { parseCategorySplits, serializeCategorySplits, type CategorySplit } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, X, Paperclip, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ExpenseFormProps {
  expense?: Expense;
  onSave: (data: Omit<Expense, 'id' | 'amountHome' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
}

const makeDefaultForm = (homeCurrency = 'EUR') => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  amount: '',
  currency: homeCurrency,
  exchangeRate: '1.0',
  description: '',
  vendor: '',
  category: 'other',
  assemblySection: '',  // kept for API compat but no longer user-facing
  partNumber: '',
  isCertificationRelevant: true,
  receiptUrls: [] as string[],
  notes: '',
  tags: [] as string[],
  link: '',
});

export function ExpenseForm({ expense, onSave, onClose, readOnly }: ExpenseFormProps) {
  const { sections } = useSections();
  const [homeCurrency, setHomeCurrency] = useState('EUR');
  const [conversionMode, setConversionMode] = useState<'rate' | 'total'>('rate');
  const [totalInHome, setTotalInHome] = useState('');

  useEffect(() => {
    fetchGeneralSettings().then(s => {
      const hc = s.homeCurrency || 'EUR';
      setHomeCurrency(hc);
      if (!expense) setForm(f => ({ ...f, currency: hc }));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState(() => expense ? {
    date: expense.date,
    amount: String(expense.amount),
    currency: expense.currency,
    exchangeRate: String(expense.exchangeRate),
    description: expense.description,
    vendor: expense.vendor,
    category: expense.category,
    assemblySection: expense.assemblySection,
    partNumber: expense.partNumber,
    isCertificationRelevant: expense.isCertificationRelevant,
    receiptUrls: expense.receiptUrls,
    notes: expense.notes,
    tags: expense.tags,
    link: expense.link,
  } : makeDefaultForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const [pendingUploads, setPendingUploads] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const selectedCurrency = CURRENCIES.find(c => c.code === form.currency);

  const isForeign = form.currency !== homeCurrency;

  const handleCurrencyChange = (code: string) => {
    set('currency', code);
    if (code === homeCurrency) {
      set('exchangeRate', '1.0');
      setConversionMode('rate');
      setTotalInHome('');
    }
  };

  // When in 'total' mode, derive exchange rate from the entered home-currency total
  const effectiveRate = (() => {
    if (!isForeign) return 1;
    if (conversionMode === 'total') {
      const total = parseFloat(totalInHome);
      const amt = parseFloat(form.amount);
      if (total > 0 && amt > 0) return total / amt;
      return parseFloat(form.exchangeRate || '1') || 1;
    }
    return parseFloat(form.exchangeRate || '1') || 1;
  })();
  const amountHome = parseFloat(form.amount || '0') * effectiveRate;

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    for (const f of Array.from(e.target.files)) {
      if (f.size > MAX_FILE_SIZE) { toast.error(`"${f.name}" exceeds 25 MB limit`); return; }
    }
    setUploading(true);
    try {
      const urls = await uploadReceipts(e.target.files);
      set('receiptUrls', [...form.receiptUrls, ...urls]);
      setPendingUploads(p => [...p, ...urls]);
      toast.success(`${urls.length} receipt(s) uploaded`);
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemoveReceipt = (url: string) => {
    set('receiptUrls', form.receiptUrls.filter(u => u !== url));
    if (pendingUploads.includes(url)) {
      // Uploaded this session — delete immediately, no need to defer
      setPendingUploads(p => p.filter(u => u !== url));
      deleteReceipt(url).catch(err => console.warn('Receipt cleanup failed (will be pruned by cleanupPendingUploads job):', err.message));
    } else {
      // Defer deletion until save is confirmed
      setPendingDeletes(p => [...p, url]);
    }
  };

  const handleCancel = () => {
    // Clean up any files uploaded during this session that won't be saved
    for (const url of pendingUploads) deleteReceipt(url).catch(err => console.warn('Receipt cleanup failed (will be pruned by cleanupPendingUploads job):', err.message));
    onClose();
  };

  const handleSave = async () => {
    if (!form.description.trim()) { toast.error('Description is required'); return; }
    if (!form.amount || isNaN(parseFloat(form.amount))) { toast.error('Valid amount is required'); return; }
    if (parseFloat(form.amount) <= 0) { toast.error('Amount must be greater than zero'); return; }
    // Validate category split totals
    const splits = parseCategorySplits(form.category);
    if (splits.length > 1) {
      const totalPct = splits.reduce((s, sp) => s + sp.pct, 0);
      if (totalPct < 99 || totalPct > 101) { toast.error(`Category split adds up to ${Math.round(totalPct)}% — must be 100%`); return; }
    }
    setSaving(true);
    try {
      // Now confirmed — delete the removed receipts
      for (const url of pendingDeletes) deleteReceipt(url).catch(err => console.warn('Receipt cleanup failed (will be pruned by cleanupPendingUploads job):', err.message));
      await onSave({
        date: form.date,
        amount: parseFloat(form.amount),
        currency: form.currency,
        exchangeRate: effectiveRate,
        description: form.description.trim(),
        vendor: form.vendor.trim(),
        category: form.category,
        assemblySection: form.assemblySection,
        partNumber: form.partNumber.trim(),
        isCertificationRelevant: form.isCertificationRelevant,
        receiptUrls: form.receiptUrls,
        notes: form.notes.trim(),
        tags: form.tags,
        link: form.link.trim(),
      });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={handleCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined} onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Date + Amount + Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="bg-accent border-border h-9" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Amount</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{selectedCurrency?.symbol}</span>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} className="bg-accent border-border pl-7" placeholder="0.00" />
              </div>
            </div>
            <div className="sm:col-span-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Currency</Label>
              <select value={form.currency} onChange={e => handleCurrencyChange(e.target.value)} className="w-full h-9 rounded-md border border-border bg-accent px-3 text-sm">
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Conversion — only when foreign currency selected */}
          {isForeign && (
            <div className="space-y-2">
              {/* Mode toggle */}
              <div className="flex gap-1">
                <button type="button"
                  onClick={() => setConversionMode('rate')}
                  className={`flex-1 h-7 rounded-md border text-xs transition-colors ${conversionMode === 'rate' ? 'bg-primary/15 border-primary text-primary' : 'bg-accent border-border text-muted-foreground hover:border-muted-foreground/50'}`}>
                  Exchange rate
                </button>
                <button type="button"
                  onClick={() => setConversionMode('total')}
                  className={`flex-1 h-7 rounded-md border text-xs transition-colors ${conversionMode === 'total' ? 'bg-primary/15 border-primary text-primary' : 'bg-accent border-border text-muted-foreground hover:border-muted-foreground/50'}`}>
                  Total in {homeCurrency}
                </button>
              </div>
              <div className="flex items-end gap-3">
                {conversionMode === 'rate' ? (
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">1 {form.currency} = ? {homeCurrency}</Label>
                    <Input type="number" min="0" step="0.0001" value={form.exchangeRate}
                      onChange={e => set('exchangeRate', e.target.value)}
                      className="bg-accent border-border" placeholder="e.g. 0.92" />
                  </div>
                ) : (
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">Amount charged in {homeCurrency}</Label>
                    <Input type="number" min="0" step="0.01" value={totalInHome}
                      onChange={e => setTotalInHome(e.target.value)}
                      className="bg-accent border-border" placeholder={`e.g. 1250.00`} />
                  </div>
                )}
                <div className="pb-2 text-sm text-muted-foreground whitespace-nowrap">
                  = <span className="font-medium text-foreground">{CURRENCIES.find(c => c.code === homeCurrency)?.symbol}{amountHome.toFixed(2)}</span>
                  {conversionMode === 'total' && parseFloat(form.amount) > 0 && parseFloat(totalInHome) > 0 && (
                    <span className="ml-2 text-xs opacity-60">(rate: {effectiveRate.toFixed(4)})</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Description + Vendor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Description *</Label>
              <Input value={form.description} maxLength={500} onChange={e => set('description', e.target.value)} className="bg-accent border-border" placeholder="What was purchased?" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Vendor / Supplier</Label>
              <Input value={form.vendor} onChange={e => set('vendor', e.target.value)} className="bg-accent border-border" placeholder="e.g. Aircraft Spruce" />
            </div>
          </div>

          {/* Category (uses configurable sections — multi-select with custom split) */}
          {(() => {
            const splits = parseCategorySplits(form.category);
            const selectedIds = splits.map(s => s.id);
            const isMulti = splits.length > 1;
            const amt = parseFloat(form.amount || '0') * effectiveRate;

            const toggleSection = (id: string) => {
              if (selectedIds.includes(id)) {
                if (selectedIds.length > 1) {
                  const next = splits.filter(s => s.id !== id);
                  const perCat = Math.round(10000 / next.length) / 100;
                  set('category', serializeCategorySplits(next.map(s => ({ ...s, pct: perCat }))));
                }
              } else {
                const next = [...splits, { id, pct: 0 }];
                const perCat = Math.round(10000 / next.length) / 100;
                set('category', serializeCategorySplits(next.map(s => ({ ...s, pct: perCat }))));
              }
            };

            const updatePct = (id: string, newPct: number) => {
              const clamped = Math.max(0, Math.min(100, newPct));
              const others = splits.filter(s => s.id !== id);
              const othersTotal = 100 - clamped;
              const currentOthersTotal = others.reduce((s, o) => s + o.pct, 0);
              const updated = splits.map(s => {
                if (s.id === id) return { ...s, pct: Math.round(clamped * 100) / 100 };
                if (currentOthersTotal > 0) return { ...s, pct: Math.round((s.pct / currentOthersTotal) * othersTotal * 100) / 100 };
                return { ...s, pct: Math.round(othersTotal / others.length * 100) / 100 };
              });
              set('category', serializeCategorySplits(updated));
            };

            const resetEqual = () => {
              const perCat = Math.round(10000 / splits.length) / 100;
              set('category', serializeCategorySplits(splits.map(s => ({ ...s, pct: perCat }))));
            };

            return (
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">
                  Category
                  {isMulti ? (
                    <span className="ml-2 text-primary font-normal">— split across {splits.length} categories</span>
                  ) : (
                    <span className="ml-2 text-muted-foreground/70 font-normal italic">— tap multiple to split the cost</span>
                  )}
                </Label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {sections.map(s => (
                    <button key={s.id} type="button" onClick={() => toggleSection(s.id)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-md text-xs border transition-all ${selectedIds.includes(s.id) ? 'bg-primary/15 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/50'}`}>
                      <span className="text-base">{s.icon}</span>
                      <span className="leading-tight text-center">{s.label}</span>
                    </button>
                  ))}
                </div>

                {/* Split controls — shown when multiple categories selected */}
                {isMulti && (
                  <div className="mt-3 p-3 rounded-md bg-muted/30 border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cost Split</span>
                      <button type="button" onClick={resetEqual}
                        className="text-[10px] text-primary hover:text-primary/80 font-medium transition-colors">
                        Reset to equal
                      </button>
                    </div>
                    {splits.map(sp => {
                      const sec = sections.find(s => s.id === sp.id);
                      const splitAmt = amt * sp.pct / 100;
                      return (
                        <div key={sp.id} className="flex items-center gap-2">
                          <span className="text-xs w-6 text-center">{sec?.icon || ''}</span>
                          <span className="text-xs text-foreground w-24 truncate">{sec?.label || sp.id}</span>
                          <input type="range" min={0} max={100} step={1}
                            value={Math.round(sp.pct)}
                            onChange={e => updatePct(sp.id, Number(e.target.value))}
                            className="flex-1 h-1.5 accent-primary cursor-pointer" />
                          <input type="number" min={0} max={100} step={1}
                            value={Math.round(sp.pct)}
                            onChange={e => updatePct(sp.id, Number(e.target.value))}
                            className="w-12 px-1.5 py-0.5 rounded bg-accent border border-border text-xs text-center font-mono" />
                          <span className="text-[10px] text-muted-foreground w-3">%</span>
                          {amt > 0 && (
                            <span className="text-[10px] text-muted-foreground w-16 text-right font-mono">
                              {splitAmt.toFixed(2)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {Math.abs(splits.reduce((s, sp) => s + sp.pct, 0) - 100) > 0.5 && (
                      <p className="text-[10px] text-destructive font-medium">
                        Split adds up to {Math.round(splits.reduce((s, sp) => s + sp.pct, 0))}% — should be 100%
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Part Number + Certification */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Part Number</Label>
              <Input value={form.partNumber} onChange={e => set('partNumber', e.target.value)} className="bg-accent border-border font-mono" placeholder="e.g. AN3-4A" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={form.isCertificationRelevant} onChange={e => set('isCertificationRelevant', e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm text-muted-foreground">Aircraft Part</span>
            </label>
          </div>

          {/* Link */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Link (URL)</Label>
            <Input value={form.link} onChange={e => set('link', e.target.value)} className="bg-accent border-border" placeholder="https://..." type="url" />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Notes</Label>
            <Textarea value={form.notes} maxLength={5000} onChange={e => set('notes', e.target.value)} className="bg-accent border-border min-h-[60px]" placeholder="Any additional notes..." />
          </div>

          {/* Receipts */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Receipts</Label>
            {form.receiptUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {form.receiptUrls.map(url => (
                  <div key={url} className="relative group flex items-center gap-1.5 bg-accent border border-border rounded-md px-2 py-1.5">
                    {url.toLowerCase().endsWith('.pdf') ? (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
                        onClick={async () => {
                          const API_URL = import.meta.env.VITE_API_URL || '';
                          const isSafeUrl = /^https?:\/\//i.test(url) || url.startsWith('/');
                          if (!isSafeUrl) return;
                          const fileUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
                          if (url.startsWith('http')) {
                            // R2 public URL — open directly
                            const a = document.createElement('a');
                            a.href = fileUrl;
                            a.target = '_blank';
                            a.rel = 'noreferrer';
                            a.click();
                          } else {
                            // Local storage — fetch with auth
                            const token = localStorage.getItem('auth_token');
                            const res = await fetch(fileUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
                            if (!res.ok) { toast.error('Could not open PDF'); return; }
                            const blob = await res.blob();
                            const blobUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = blobUrl;
                            a.target = '_blank';
                            a.rel = 'noopener noreferrer';
                            a.click();
                            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                          }
                        }}
                      >
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground truncate max-w-[80px]">{(() => { const r = url.split('/').pop() ?? ''; const s = r.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, ''); return decodeURIComponent(s || r); })()}</span>
                      </button>
                    ) : (
                      <a href={/^https?:\/\//i.test(url) || url.startsWith('/') ? url : '#'} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:opacity-70 transition-opacity">
                        <img src={url} alt="" className="w-8 h-8 object-cover rounded"
                          onError={e => { const t = e.currentTarget; t.style.display = 'none'; t.nextElementSibling?.classList.remove('hidden'); }}
                        />
                        <FileText className="w-4 h-4 text-muted-foreground hidden" />
                        <span className="text-xs text-muted-foreground truncate max-w-[80px]">{(() => { const r = url.split('/').pop() ?? ''; const s = r.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, ''); return decodeURIComponent(s || r); })()}</span>
                      </a>
                    )}
                    <button onClick={() => handleRemoveReceipt(url)} aria-label="Remove receipt" className="ml-1 text-muted-foreground hover:text-destructive transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleUpload} />
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading…' : 'Attach Receipt'}
            </Button>
          </div>
        </div>

        <DialogFooter>
          {readOnly && <p className="text-xs text-muted-foreground mr-auto">Saving is disabled in demo mode.</p>}
          <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || readOnly}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {expense ? 'Save Changes' : 'Add Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
