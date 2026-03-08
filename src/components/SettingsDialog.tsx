import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Settings, Wifi, WifiOff, Send, Type } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchMqttSettings, updateMqttSettings, testMqttPublish, MqttSettings,
  fetchGeneralSettings, updateGeneralSettings, GeneralSettings,
} from '@/lib/api';

interface SettingsDialogProps {
  onProjectNameChange?: (name: string) => void;
}

export function SettingsDialog({ onProjectNameChange }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [general, setGeneral] = useState<GeneralSettings>({ projectName: 'RV-10 Build Tracker' });
  const [mqtt, setMqtt] = useState<MqttSettings>({
    enabled: false,
    brokerUrl: 'mqtt://localhost:1883',
    username: '',
    password: '',
    topicPrefix: 'mybuild/stats',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchGeneralSettings().then(setGeneral).catch(() => {});
      fetchMqttSettings().then(setMqtt).catch(() => toast.error('Failed to load MQTT settings'));
    }
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        updateGeneralSettings(general),
        updateMqttSettings(mqtt),
      ]);
      onProjectNameChange?.(general.projectName);
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
