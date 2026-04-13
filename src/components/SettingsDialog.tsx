import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Settings, Wifi, Send, Type, Plus, Trash2, Sun, Moon, Monitor, Clock, ImageDown, Wallet, Database, Bug, Smartphone, Copy, RefreshCw, CheckCheck, BarChart3, Download, Upload, AlertTriangle, ExternalLink, Package } from 'lucide-react';
import { toast } from 'sonner';
import { ImportExportSection } from '@/components/ImportExportSection';
import { DiagnosticsPanel } from '@/components/DiagnosticsPanel';
import { useAuth } from '@/contexts/AuthContext';
import { VisitorStatsPanel } from '@/components/VisitorStatsPanel';
import { OCR_VENDORS } from '@/lib/ocrVendors';
import { AIRCRAFT_MANIFESTS } from '@/lib/kitManifest';
import { isElectron } from '@/lib/env';
import { useSections } from '@/contexts/SectionsContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  fetchMqttSettings, updateMqttSettings, testMqttPublish, MqttSettings,
  fetchGeneralSettings, updateGeneralSettings, GeneralSettings,
  CURRENCIES,
  fetchWebhookKey, regenerateWebhookKey,
  fetchFlowchartPackages, updateFlowchartPackages, PackagesMap,
  fetchWpTemplates, fetchWpTemplate, WpTemplate,
  resetAllData,
} from '@/lib/api';

interface SettingsDialogProps {
  onProjectNameChange?: (name: string) => void;
  onTargetHoursChange?: (hours: number) => void;
  onSettingsSaved?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type Tab = 'general' | 'appearance' | 'expenses' | 'inventory' | 'data' | 'integrations' | 'stats' | 'debug';

const ALL_TABS: { id: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: 'general',      label: 'General',      icon: Type },
  { id: 'appearance',   label: 'Appearance',   icon: Sun },
  { id: 'expenses',     label: 'Expenses',     icon: Wallet },
  { id: 'inventory',    label: 'Inventory',    icon: Package },
  { id: 'data',         label: 'Data',         icon: Database },
  { id: 'integrations', label: 'Integrations', icon: Smartphone },
  { id: 'stats',        label: 'Visitors',     icon: BarChart3 },
  { id: 'debug',        label: 'Debug',        icon: Bug,         adminOnly: true },
];

export function SettingsDialog({ onProjectNameChange, onTargetHoursChange, onSettingsSaved, open: controlledOpen, onOpenChange: controlledOnOpenChange }: SettingsDialogProps) {
  const { reload: reloadSections } = useSections();
  const { theme, setTheme } = useTheme();
  const { role, multiTenant } = useAuth();
  const isAdmin = !multiTenant || role === 'admin';
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [general, setGeneral] = useState<GeneralSettings>({ projectName: 'Build Tracker', targetHours: 2500, progressMode: 'time', imageResizing: true, imageMaxWidth: 1920, landingPage: 'tracker', homeCurrency: 'EUR', blogShowSessionStats: true });
  const [mqtt, setMqtt] = useState<MqttSettings>({
    enabled: false, brokerUrl: 'mqtt://localhost:1883', username: '', password: '',
    topicPrefix: 'mybuild/stats', haDiscovery: false, haDiscoveryPrefix: 'homeassistant',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [webhookKey, setWebhookKey] = useState('');
  const [webhookKeyLoading, setWebhookKeyLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [wpExporting, setWpExporting] = useState(false);
  const [wpImporting, setWpImporting] = useState(false);
  const [wpSelectedFile, setWpSelectedFile] = useState<File | null>(null);
  const [wpTemplates, setWpTemplates] = useState<WpTemplate[]>([]);
  const [wpSelectedTemplate, setWpSelectedTemplate] = useState('');
  const wpImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      fetchGeneralSettings().then(s => { setGeneral(s); if (s.theme) setTheme(s.theme); }).catch(() => {});
      fetchMqttSettings().then(setMqtt).catch(() => toast.error('Failed to load MQTT settings'));
      fetchWpTemplates().then(setWpTemplates).catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (open && activeTab === 'integrations' && !webhookKey) {
      setWebhookKeyLoading(true);
      fetchWebhookKey().then(setWebhookKey).catch(() => {}).finally(() => setWebhookKeyLoading(false));
    }
  }, [open, activeTab]);

  const handleRegenerateKey = async () => {
    setWebhookKeyLoading(true);
    try {
      const key = await regenerateWebhookKey();
      setWebhookKey(key);
      toast.success('Webhook key regenerated');
    } catch (err: any) {
      toast.error('Failed to regenerate key: ' + err.message);
    }
    setWebhookKeyLoading(false);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([updateGeneralSettings(general), updateMqttSettings(mqtt)]);
      onProjectNameChange?.(general.projectName);
      onTargetHoursChange?.(general.targetHours);
      onSettingsSaved?.();
      toast.success('Settings saved');
      setOpen(false);
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await testMqttPublish({ brokerUrl: mqtt.brokerUrl, username: mqtt.username, password: mqtt.password, topicPrefix: mqtt.topicPrefix });
      toast.success('MQTT connection successful');
    } catch (err: any) {
      toast.error('MQTT publish failed: ' + err.message);
    }
    setTesting(false);
  };

  const handleWpExport = async () => {
    setWpExporting(true);
    try {
      const data = await fetchFlowchartPackages();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `work-packages-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Work packages exported');
    } catch (err: any) {
      toast.error('Export failed: ' + err.message);
    }
    setWpExporting(false);
  };

  const handleWpFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWpSelectedFile(e.target.files?.[0] ?? null);
  };

  const validatePackagesMap = (data: unknown): data is PackagesMap => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const validateItem = (item: unknown): boolean => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const obj = item as Record<string, unknown>;
      if (typeof obj.id !== 'string' || typeof obj.label !== 'string') return false;
      if (obj.id.length > 200 || obj.label.length > 500) return false;
      // Reject HTML/script content in labels
      if (/<script|javascript:|on\w+\s*=/i.test(obj.label)) return false;
      if (obj.children !== undefined) {
        if (!Array.isArray(obj.children)) return false;
        if (!obj.children.every(validateItem)) return false;
      }
      return true;
    };
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof key !== 'string' || key.length > 200) return false;
      if (!Array.isArray(value)) return false;
      if (!value.every(validateItem)) return false;
    }
    return true;
  };

  const handleWpImport = async () => {
    if (!wpSelectedFile && !wpSelectedTemplate) return;
    setWpImporting(true);
    try {
      let data: PackagesMap;
      if (wpSelectedTemplate) {
        data = await fetchWpTemplate(wpSelectedTemplate);
      } else {
        const text = await wpSelectedFile!.text();
        if (text.length > 10 * 1024 * 1024) throw new Error('File too large (max 10 MB)');
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new Error('Invalid JSON file'); }
        if (!validatePackagesMap(parsed)) throw new Error('Invalid work package format. Expected { "Package Name": [{ id, label, children? }] }');
        data = parsed;
      }
      await updateFlowchartPackages(data);
      toast.success('Work packages loaded');
      setWpSelectedFile(null);
      setWpSelectedTemplate('');
      if (wpImportRef.current) wpImportRef.current.value = '';
    } catch (err: any) {
      toast.error('Import failed: ' + err.message);
    }
    setWpImporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <Settings className="w-4 h-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl h-[85vh] p-0 overflow-hidden flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" /> Settings
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <nav className="w-40 shrink-0 border-r border-border bg-secondary/30 p-2 flex flex-col gap-0.5">
            {ALL_TABS.filter(t => !(isElectron && t.id === 'stats') && (!t.adminOnly || isAdmin)).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left w-full ${
                  activeTab === id
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
            {multiTenant && (
              <>
                <div className="flex-1" />
                <a
                  href={(() => {
                    const parts = window.location.hostname.split('.');
                    return parts.length > 2
                      ? `https://${parts.slice(1).join('.')}/account`
                      : `${window.location.origin}/account`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left w-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  Account
                </a>
              </>
            )}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {/* ── General ─────────────────────────────────────── */}
            {activeTab === 'general' && <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Project Name</Label>
                <Input
                  placeholder="Build Tracker"
                  value={general.projectName}
                  onChange={e => setGeneral({ ...general, projectName: e.target.value })}
                  className="bg-muted/50 border-border text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Target Build Hours</Label>
                <Input
                  type="number"
                  placeholder="2500"
                  value={general.targetHours}
                  onChange={e => setGeneral({ ...general, targetHours: Number(e.target.value) || 0 })}
                  className="bg-muted/50 border-border text-sm"
                />
                <p className="text-xs text-muted-foreground/60 mt-1">Manufacturer-specified hours to complete the build (default: 2500)</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Progress Calculation</Label>
                <div className="flex gap-2">
                  {([
                    { value: 'time' as const, label: 'Time-based', desc: 'Build hours vs. target' },
                    { value: 'packages' as const, label: 'Package-based', desc: 'Completed work packages' },
                  ]).map(({ value, label, desc }) => (
                    <button key={value} onClick={() => setGeneral({ ...general, progressMode: value })}
                      className={`flex-1 text-left px-3 py-2 rounded-md border text-xs transition-colors ${
                        (general.progressMode || 'time') === value
                          ? 'bg-primary/15 border-primary text-primary'
                          : 'bg-muted/50 border-border text-muted-foreground hover:border-muted-foreground/50'
                      }`}>
                      <p className="font-medium">{label}</p>
                      <p className="text-[10px] opacity-70 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/60 mt-1">Controls the progress bar on the blog and tracker pages.</p>
              </div>
              {isAdmin && <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground block">Image Resizing</Label>
                  <p className="text-xs text-muted-foreground/60">Resize uploads to max width on the server (recommended)</p>
                </div>
                <Switch checked={general.imageResizing ?? true} onCheckedChange={checked => setGeneral({ ...general, imageResizing: checked })} />
              </div>
              {(general.imageResizing ?? true) && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                    <ImageDown className="w-3 h-3" /> Max image width (px)
                  </Label>
                  <Input
                    type="number" placeholder="1920"
                    value={general.imageMaxWidth ?? 1920}
                    onChange={e => setGeneral({ ...general, imageMaxWidth: Number(e.target.value) || 1920 })}
                    className="bg-muted/50 border-border text-sm"
                  />
                  <p className="text-xs text-muted-foreground/60 mt-1">Images wider than this are scaled down. Thumbnails (400 px) are always generated.</p>
                </div>
              )}
              </>}
            </>}

            {/* ── Appearance ──────────────────────────────────── */}
            {activeTab === 'appearance' && <>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Theme</Label>
                <div className="flex gap-2">
                  {([
                    { value: 'light' as const, icon: Sun, label: 'Light' },
                    { value: 'dark' as const, icon: Moon, label: 'Dark' },
                    { value: 'system' as const, icon: Monitor, label: 'Auto' },
                  ]).map(({ value, icon: Icon, label }) => (
                    <Button key={value} variant={theme === value ? 'default' : 'outline'} size="sm"
                      onClick={() => { setTheme(value); setGeneral(g => ({ ...g, theme: value })); }} className="gap-1.5 flex-1">
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </Button>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Time Format</Label>
                <div className="flex gap-2">
                  {([
                    { value: '24h' as const, label: '24h', example: '14:00' },
                    { value: '12h' as const, label: '12h', example: '2:00 PM' },
                  ]).map(({ value, label, example }) => (
                    <Button key={value} variant={(general.timeFormat || '24h') === value ? 'default' : 'outline'} size="sm"
                      onClick={() => setGeneral({ ...general, timeFormat: value })} className="gap-1.5 flex-1">
                      {label} <span className="text-xs opacity-60">({example})</span>
                    </Button>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Landing Page</Label>
                <div className="flex gap-2">
                  {([
                    { value: 'tracker' as const, label: 'Tracker', desc: '/tracker' },
                    { value: 'blog' as const, label: 'Blog', desc: '/blog' },
                  ]).map(({ value, label, desc }) => (
                    <button key={value} onClick={() => setGeneral({ ...general, landingPage: value })}
                      className={`flex-1 text-left px-3 py-2 rounded-md border text-xs transition-colors ${
                        (general.landingPage || 'tracker') === value
                          ? 'bg-primary/15 border-primary text-primary'
                          : 'bg-muted/50 border-border text-muted-foreground hover:border-muted-foreground/50'
                      }`}>
                      <p className="font-medium">{label}</p>
                      <p className="text-[10px] opacity-70 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/60 mt-1">Where visiting <span className="font-mono">/</span> redirects to.</p>
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Blog Access</Label>
                <div className="flex gap-2">
                  {([
                    { value: true, label: 'Public', desc: 'Anyone can view your blog' },
                    { value: false, label: 'Private', desc: 'Only you can view the blog' },
                  ] as const).map(({ value, label, desc }) => (
                    <button key={String(value)} onClick={() => setGeneral({ ...general, publicBlog: value })}
                      className={`flex-1 text-left px-3 py-2 rounded-md border text-xs transition-colors ${
                        (general.publicBlog ?? true) === value
                          ? 'bg-primary/15 border-primary text-primary'
                          : 'bg-muted/50 border-border text-muted-foreground hover:border-muted-foreground/50'
                      }`}>
                      <p className="font-medium">{label}</p>
                      <p className="text-[10px] opacity-70 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/60 mt-1">When private, visitors must log in to see blog posts.</p>
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-3 block">Blog Visibility</Label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs text-muted-foreground block">Build Session Statistics</Label>
                      <p className="text-xs text-muted-foreground/60">Show session count, hours/week, and completion velocity on the blog page</p>
                    </div>
                    <Switch checked={general.blogShowSessionStats ?? true} onCheckedChange={checked => setGeneral({ ...general, blogShowSessionStats: checked })} />
                  </div>
                </div>
              </div>
            </>}

            {/* ── Expenses ────────────────────────────────────── */}
            {activeTab === 'expenses' && <>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Home Currency</Label>
                <select
                  value={general.homeCurrency || 'EUR'}
                  onChange={e => setGeneral({ ...general, homeCurrency: e.target.value })}
                  className="h-9 rounded-md border border-border bg-muted/50 px-3 text-sm w-full"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground/60 mt-1.5">
                  Used as the default currency when adding expenses. Foreign currency entries show a conversion to this currency.
                  Changing this does not retroactively recalculate existing entries.
                </p>
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">WAF — Wife Acceptance Factor</Label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={general.wafPercent ?? 100}
                    onChange={e => setGeneral({ ...general, wafPercent: parseInt(e.target.value) })}
                    className="flex-1 h-2 accent-primary cursor-pointer"
                  />
                  <span className="text-sm font-bold w-12 text-right">{general.wafPercent ?? 100}%</span>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-1.5">
                  Scales all displayed expense amounts by this percentage. At 100% amounts are shown as-is. At 50% all displayed amounts are halved. Useful for... diplomatic purposes. Caution: incorrect calibration may affect long-term diplomatic relations with allied household members.
                </p>
              </div>

            </>}

            {/* ── Inventory ──────────────────────────────────── */}
            {activeTab === 'inventory' && <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Aircraft Type</Label>
                <select
                  value={general.aircraftType || 'vans-rv10'}
                  onChange={e => setGeneral({ ...general, aircraftType: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {AIRCRAFT_MANIFESTS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Determines which kit structure and parts manifest are used for inventory management and mass ingestion.
                </p>
              </div>
              {general.ocrEnabled && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Label Scanner — Recognition Scheme</Label>
                  <select
                    value={general.ocrVendor || 'vans'}
                    onChange={e => setGeneral({ ...general, ocrVendor: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {OCR_VENDORS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Selects which part-number patterns the label scanner uses. Each vendor defines its own part-number formats and sub-kit categories.
                  </p>
                </div>
              )}
            </>}

            {/* ── Integrations ────────────────────────────────── */}
            {activeTab === 'integrations' && (() => {
              const baseUrl = window.location.origin;
              const startUrl = `${baseUrl}/api/webhook/timer/start?key=${webhookKey}`;
              const stopUrl = `${baseUrl}/api/webhook/timer/stop?key=${webhookKey}`;
              const CopyBtn = ({ text, field }: { text: string; field: string }) => (
                <button
                  onClick={() => copyToClipboard(text, field)}
                  className="shrink-0 p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy"
                >
                  {copiedField === field ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              );
              return (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-1 flex items-center gap-2"><Smartphone className="w-4 h-4" /> Siri Shortcuts</h3>
                    <p className="text-xs text-muted-foreground mb-4">Use these URLs in iOS Shortcuts to start and stop the timer via Siri — no login required. The key is permanent and never expires.</p>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">API Key</Label>
                        <div className="flex items-center gap-1 bg-accent border border-border rounded-md px-2 py-1.5">
                          <code className="flex-1 text-xs font-mono break-all text-foreground">
                            {webhookKeyLoading ? 'Loading…' : (webhookKey || '—')}
                          </code>
                          <CopyBtn text={webhookKey} field="key" />
                          <button
                            onClick={handleRegenerateKey}
                            disabled={webhookKeyLoading}
                            className="shrink-0 p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            title="Regenerate key"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${webhookKeyLoading ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground/60 mt-1">Regenerating invalidates the old key immediately.</p>
                      </div>

                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Start Timer URL</Label>
                        <div className="flex items-center gap-1 bg-accent border border-border rounded-md px-2 py-1.5">
                          <code className="flex-1 text-xs font-mono break-all text-foreground">{webhookKey ? startUrl : '—'}</code>
                          {webhookKey && <CopyBtn text={startUrl} field="start" />}
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Stop Timer URL</Label>
                        <div className="flex items-center gap-1 bg-accent border border-border rounded-md px-2 py-1.5">
                          <code className="flex-1 text-xs font-mono break-all text-foreground">{webhookKey ? stopUrl : '—'}</code>
                          {webhookKey && <CopyBtn text={stopUrl} field="stop" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-sm font-medium mb-2">iOS Shortcut Setup</h3>
                    <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
                      <li>Open the <strong className="text-foreground">Shortcuts</strong> app on your iPhone or iPad.</li>
                      <li>Tap <strong className="text-foreground">+</strong> to create a new shortcut.</li>
                      <li>Add a <strong className="text-foreground">"Get Contents of URL"</strong> action.</li>
                      <li>Paste the <strong className="text-foreground">Start Timer URL</strong> above as the URL.</li>
                      <li>Tap <strong className="text-foreground">Add to Siri</strong> and record a phrase like <em>"Start build session"</em>.</li>
                      <li>Repeat steps 2–5 for the Stop Timer URL with a phrase like <em>"Stop build session"</em>.</li>
                    </ol>
                    <p className="text-xs text-muted-foreground/60 mt-3">The timer will start in the section used in the most recent session (or Empennage if no sessions exist). Fill in notes and details later from the computer.</p>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-sm font-medium mb-1 flex items-center gap-2"><Wifi className="w-4 h-4" /> MQTT Publishing</h3>
                    <p className="text-xs text-muted-foreground mb-4">Publish build stats to an MQTT broker after every session (e.g. Home Assistant).</p>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-xs text-muted-foreground block">Enable MQTT</Label>
                          <p className="text-xs text-muted-foreground/60">Publish stats after each session</p>
                        </div>
                        <Switch checked={mqtt.enabled} onCheckedChange={checked => setMqtt({ ...mqtt, enabled: checked })} />
                      </div>
                      {mqtt.enabled && <>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Broker URL</Label>
                          <Input placeholder="mqtt://192.168.1.2:1883" value={mqtt.brokerUrl}
                            onChange={e => setMqtt({ ...mqtt, brokerUrl: e.target.value })}
                            className="bg-muted/50 border-border font-mono text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Username</Label>
                            <Input placeholder="(optional)" value={mqtt.username}
                              onChange={e => setMqtt({ ...mqtt, username: e.target.value })}
                              className="bg-muted/50 border-border text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Password</Label>
                            <Input type="password" placeholder="(optional)" value={mqtt.password}
                              onChange={e => setMqtt({ ...mqtt, password: e.target.value })}
                              className="bg-muted/50 border-border text-sm" />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Topic Prefix</Label>
                          <Input placeholder="mybuild/stats" value={mqtt.topicPrefix}
                            onChange={e => setMqtt({ ...mqtt, topicPrefix: e.target.value })}
                            className="bg-muted/50 border-border font-mono text-sm" />
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            Topics: {mqtt.topicPrefix || 'mybuild/stats'}/total_hours, …/fuselage, …/wings, etc.
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-xs text-muted-foreground block">Home Assistant Auto-Discovery</Label>
                            <p className="text-xs text-muted-foreground/60">Sensors appear in HA automatically without YAML</p>
                          </div>
                          <Switch checked={mqtt.haDiscovery} onCheckedChange={checked => setMqtt({ ...mqtt, haDiscovery: checked })} />
                        </div>
                        {mqtt.haDiscovery && (
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Discovery Prefix</Label>
                            <Input placeholder="homeassistant" value={mqtt.haDiscoveryPrefix}
                              onChange={e => setMqtt({ ...mqtt, haDiscoveryPrefix: e.target.value })}
                              className="bg-muted/50 border-border font-mono text-sm" />
                            <p className="text-xs text-muted-foreground/60 mt-1">Default is "homeassistant". Only change if you customized HA's discovery prefix.</p>
                          </div>
                        )}
                      </>}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Stats ───────────────────────────────────────── */}
            {activeTab === 'stats' && <VisitorStatsPanel />}

            {/* ── Debug ───────────────────────────────────────── */}
            {activeTab === 'debug' && (
              <div className="space-y-6">
                <DiagnosticsPanel />
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Work Package Export</Label>
                  </div>
                  <div className="pl-6 border-l-2 border-border space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Export the current work package tree as a <span className="font-mono">.json</span> file.
                      Use this to create a reusable work package set for a specific aircraft type.
                    </p>
                    <Button variant="outline" size="sm" onClick={handleWpExport} disabled={wpExporting} className="gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      {wpExporting ? 'Exporting…' : 'Export work-packages.json'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Data ────────────────────────────────────────── */}
            {activeTab === 'data' && (
              <div className="space-y-6">
                <ImportExportSection onImportComplete={() => {
                  fetchGeneralSettings().then(s => { setGeneral(s); if (s.theme) setTheme(s.theme); }).catch(() => {});
                  fetchMqttSettings().then(setMqtt).catch(() => {});
                  reloadSections();
                }} />
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Work Package Set</Label>
                  </div>
                  <div className="pl-6 border-l-2 border-border space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Load a work package set to replace the current build progress structure.
                      Useful for applying a pre-built package set for a specific aircraft type.
                    </p>
                    <p className="text-xs text-amber-500 dark:text-amber-400">
                      ⚠ Loading a work package set will overwrite all custom changes you have made to your current work packages.
                    </p>

                    {/* Template dropdown */}
                    {wpTemplates.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Available templates</Label>
                        <select
                          value={wpSelectedTemplate}
                          onChange={e => { setWpSelectedTemplate(e.target.value); setWpSelectedFile(null); if (wpImportRef.current) wpImportRef.current.value = ''; }}
                          className="w-full h-9 rounded-md border border-border bg-background/50 px-3 text-sm text-foreground"
                        >
                          <option value="">— Select a template —</option>
                          {wpTemplates.map(t => (
                            <option key={t.filename} value={t.filename}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Custom file picker */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Or load from file</Label>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => wpImportRef.current?.click()} disabled={wpImporting} className="gap-1.5 shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          Choose file…
                        </Button>
                        {wpSelectedFile && (
                          <span className="text-xs text-muted-foreground truncate flex-1">{wpSelectedFile.name}</span>
                        )}
                      </div>
                      <input ref={wpImportRef} type="file" accept=".json" onChange={e => { handleWpFileSelect(e); setWpSelectedTemplate(''); }} className="hidden" />
                    </div>

                    {/* Confirm button — shown once something is selected */}
                    {(wpSelectedTemplate || wpSelectedFile) && (
                      <Button size="sm" onClick={handleWpImport} disabled={wpImporting} className="gap-1.5">
                        <Upload className="w-3.5 h-3.5" />
                        {wpImporting ? 'Loading…' : 'Load Work Packages'}
                      </Button>
                    )}
                  </div>
                </div>
                <Separator />
                {/* ── Danger Zone ── */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <Label className="text-sm font-medium text-destructive">Danger Zone</Label>
                  </div>
                  <div className="pl-6 border-l-2 border-destructive/40 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Permanently deletes all sessions, blog posts, expenses, photos and receipts.
                      Settings are reset to defaults. Your login credentials are kept.
                      <strong className="block mt-1 text-foreground">This cannot be undone.</strong>
                    </p>
                    {!confirmReset ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setConfirmReset(true)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Reset All Data…
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-destructive">Are you absolutely sure? This will wipe everything.</p>
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={resetting}
                            className="gap-1.5"
                            onClick={async () => {
                              setResetting(true);
                              try {
                                await resetAllData();
                                toast.success('All data has been reset');
                                setConfirmReset(false);
                                setOpen(false);
                                window.location.reload();
                              } catch (err: any) {
                                toast.error('Reset failed: ' + err.message);
                              } finally {
                                setResetting(false);
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {resetting ? 'Resetting…' : 'Yes, delete everything'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
          {mqtt.enabled && activeTab === 'integrations' && (
            <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2">
              <Send className="w-4 h-4" />
              {testing ? 'Publishing…' : 'Test MQTT'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
