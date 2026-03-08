import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Settings, Wifi, WifiOff, Send, Type, Layers, Plus, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { SectionConfig } from '@/lib/types';
import { useSections } from '@/contexts/SectionsContext';
import {
  fetchMqttSettings, updateMqttSettings, testMqttPublish, MqttSettings,
  fetchGeneralSettings, updateGeneralSettings, GeneralSettings,
  fetchSections, updateSections,
} from '@/lib/api';

interface SettingsDialogProps {
  onProjectNameChange?: (name: string) => void;
}

export function SettingsDialog({ onProjectNameChange }: SettingsDialogProps) {
  const { sections: contextSections, reload: reloadSections } = useSections();
  const [open, setOpen] = useState(false);
  const [general, setGeneral] = useState<GeneralSettings>({ projectName: 'RV-10 Build Tracker' });
  const [mqtt, setMqtt] = useState<MqttSettings>({
    enabled: false,
    brokerUrl: 'mqtt://localhost:1883',
    username: '',
    password: '',
    topicPrefix: 'mybuild/stats',
    haDiscovery: false,
    haDiscoveryPrefix: 'homeassistant',
  });
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchGeneralSettings().then(setGeneral).catch(() => {});
      fetchMqttSettings().then(setMqtt).catch(() => toast.error('Failed to load MQTT settings'));
      fetchSections()
        .then(setSections)
        .catch(() => {
          // Fallback to context sections (which include defaults)
          setSections([...contextSections]);
        });
    }
  }, [open, contextSections]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        updateGeneralSettings(general),
        updateMqttSettings(mqtt),
        updateSections(sections),
      ]);
      onProjectNameChange?.(general.projectName);
      await reloadSections();
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await testMqttPublish();
      toast.success('Stats published to MQTT');
    } catch (err: any) {
      toast.error('MQTT publish failed: ' + err.message);
    }
    setTesting(false);
  };

  const addSection = () => {
    setSections([...sections, { id: `section-${Date.now()}`, label: '', icon: '📋' }]);
  };

  const updateSection = (index: number, field: keyof SectionConfig, value: string) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-generate id from label if it's a new section
    if (field === 'label' && updated[index].id.startsWith('section-')) {
      updated[index].id = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || updated[index].id;
    }
    setSections(updated);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sections.length) return;
    const updated = [...sections];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setSections(updated);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" /> Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* General Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">General</Label>
            </div>
            <div className="pl-6 border-l-2 border-border">
              <Label className="text-xs text-muted-foreground mb-1 block">Project Name</Label>
              <Input
                placeholder="RV-10 Build Tracker"
                value={general.projectName}
                onChange={(e) => setGeneral({ ...general, projectName: e.target.value })}
                className="bg-secondary border-border text-sm"
              />
            </div>
          </div>

          <Separator />

          {/* Assembly Sections */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Assembly Sections</Label>
              </div>
              <Button variant="outline" size="sm" onClick={addSection} className="gap-1 h-7 text-xs">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            <div className="space-y-2 pl-6 border-l-2 border-border">
              {sections.map((sec, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveSection(i, -1)}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs leading-none"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveSection(i, 1)}
                      disabled={i === sections.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-xs leading-none"
                    >
                      ▼
                    </button>
                  </div>
                  <Input
                    value={sec.icon}
                    onChange={(e) => updateSection(i, 'icon', e.target.value)}
                    className="w-12 bg-secondary border-border text-center text-sm px-1"
                    maxLength={4}
                  />
                  <Input
                    value={sec.label}
                    onChange={(e) => updateSection(i, 'label', e.target.value)}
                    placeholder="Section name"
                    className="flex-1 bg-secondary border-border text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSection(i)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {sections.length === 0 && (
                <p className="text-xs text-muted-foreground/60 py-2">No sections defined. Click "Add" to create one.</p>
              )}
            </div>
          </div>

          <Separator />

          {/* MQTT Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {mqtt.enabled ? (
                  <Wifi className="w-4 h-4 text-primary" />
                ) : (
                  <WifiOff className="w-4 h-4 text-muted-foreground" />
                )}
                <Label className="text-sm font-medium">MQTT Publishing</Label>
              </div>
              <Switch
                checked={mqtt.enabled}
                onCheckedChange={(checked) => setMqtt({ ...mqtt, enabled: checked })}
              />
            </div>

            {mqtt.enabled && (
              <div className="space-y-3 pl-6 border-l-2 border-border">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Broker URL</Label>
                  <Input
                    placeholder="mqtt://192.168.1.2:1883"
                    value={mqtt.brokerUrl}
                    onChange={(e) => setMqtt({ ...mqtt, brokerUrl: e.target.value })}
                    className="bg-secondary border-border font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Username</Label>
                    <Input
                      placeholder="(optional)"
                      value={mqtt.username}
                      onChange={(e) => setMqtt({ ...mqtt, username: e.target.value })}
                      className="bg-secondary border-border text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Password</Label>
                    <Input
                      type="password"
                      placeholder="(optional)"
                      value={mqtt.password}
                      onChange={(e) => setMqtt({ ...mqtt, password: e.target.value })}
                      className="bg-secondary border-border text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Topic Prefix</Label>
                  <Input
                    placeholder="mybuild/stats"
                    value={mqtt.topicPrefix}
                    onChange={(e) => setMqtt({ ...mqtt, topicPrefix: e.target.value })}
                    className="bg-secondary border-border font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Topics: {mqtt.topicPrefix || 'mybuild/stats'}/total_hours, …/fuselage, …/wings, etc.
                  </p>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Home Assistant Auto-Discovery</Label>
                    <p className="text-xs text-muted-foreground/60">
                      Publishes discovery configs so sensors appear automatically in HA
                    </p>
                  </div>
                  <Switch
                    checked={mqtt.haDiscovery}
                    onCheckedChange={(checked) => setMqtt({ ...mqtt, haDiscovery: checked })}
                  />
                </div>

                {mqtt.haDiscovery && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Discovery Prefix</Label>
                    <Input
                      placeholder="homeassistant"
                      value={mqtt.haDiscoveryPrefix}
                      onChange={(e) => setMqtt({ ...mqtt, haDiscoveryPrefix: e.target.value })}
                      className="bg-secondary border-border font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Default is "homeassistant". Only change if you customized HA's discovery prefix.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
            {mqtt.enabled && (
              <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2">
                <Send className="w-4 h-4" />
                {testing ? 'Publishing…' : 'Test'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
