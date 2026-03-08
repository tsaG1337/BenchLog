import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings, Wifi, WifiOff, Send } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMqttSettings, updateMqttSettings, testMqttPublish, MqttSettings } from '@/lib/api';

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<MqttSettings>({
    enabled: false,
    brokerUrl: 'mqtt://localhost:1883',
    username: '',
    password: '',
    topicPrefix: 'rv10/stats',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchMqttSettings()
        .then(setSettings)
        .catch(() => toast.error('Failed to load MQTT settings'));
    }
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMqttSettings(settings);
      toast.success('MQTT settings saved');
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" /> Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* MQTT Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {settings.enabled ? (
                  <Wifi className="w-4 h-4 text-primary" />
                ) : (
                  <WifiOff className="w-4 h-4 text-muted-foreground" />
                )}
                <Label className="text-sm font-medium">MQTT Publishing</Label>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
              />
            </div>

            {settings.enabled && (
              <div className="space-y-3 pl-6 border-l-2 border-border">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Broker URL</Label>
                  <Input
                    placeholder="mqtt://192.168.1.2:1883"
                    value={settings.brokerUrl}
                    onChange={(e) => setSettings({ ...settings, brokerUrl: e.target.value })}
                    className="bg-secondary border-border font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Username</Label>
                    <Input
                      placeholder="(optional)"
                      value={settings.username}
                      onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                      className="bg-secondary border-border text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Password</Label>
                    <Input
                      type="password"
                      placeholder="(optional)"
                      value={settings.password}
                      onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                      className="bg-secondary border-border text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Topic Prefix</Label>
                  <Input
                    placeholder="rv10/stats"
                    value={settings.topicPrefix}
                    onChange={(e) => setSettings({ ...settings, topicPrefix: e.target.value })}
                    className="bg-secondary border-border font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Topics: {settings.topicPrefix || 'rv10/stats'}/total_hours, …/fuselage, …/wings, etc.
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
            {settings.enabled && (
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
