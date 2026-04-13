import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wrench, Lock, User, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const RATE_LIMIT_SECONDS = 15 * 60;

export default function LoginPage() {
  const { needsSetup, multiTenant, maintenanceMode, login, setup } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.title = needsSetup ? 'Set password — BenchLog' : 'Log in — BenchLog';
  }, [needsSetup]);

  useEffect(() => {
    if (!rateLimitedUntil) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [rateLimitedUntil]);

  const rateLimitActive = rateLimitedUntil !== null && rateLimitedUntil > now;
  const secondsRemaining = rateLimitActive ? Math.ceil((rateLimitedUntil! - now) / 1000) : 0;
  const mm = Math.floor(secondsRemaining / 60);
  const ss = secondsRemaining % 60;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rateLimitActive) return;
    if (needsSetup && password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      if (needsSetup) {
        await setup(password);
        toast.success('Password set successfully!');
      } else {
        await login(password, multiTenant ? username : undefined);
      }
    } catch (err: any) {
      if (err?.status === 429) {
        setRateLimitedUntil(Date.now() + RATE_LIMIT_SECONDS * 1000);
      } else {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4 glow-amber">
            <Wrench className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">BenchLog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {needsSetup ? 'Set up your admin password' : 'Sign in to continue'}
          </p>
        </div>

        {maintenanceMode && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Maintenance Mode Active</p>
              <p className="text-xs text-muted-foreground mt-0.5">The server is undergoing scheduled maintenance. Only administrators can sign in at this time.</p>
            </div>
          </div>
        )}

        {rateLimitActive && (
          <div
            role="alert"
            className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-4"
          >
            <Clock className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Too many login attempts</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                For your security, sign-in is temporarily locked. Try again in{' '}
                <span className="font-mono">{mm}:{ss.toString().padStart(2, '0')}</span>.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          {multiTenant && !needsSetup && (
            <div className="space-y-2">
              <label htmlFor="login-username" className="text-sm font-medium text-foreground">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="pl-10"
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="login-password" className="text-sm font-medium text-foreground">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={needsSetup ? 'Choose a password' : 'Enter password'}
                className="pl-10"
                required
                minLength={8}
                autoFocus={!multiTenant || needsSetup}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
              />
            </div>
          </div>

          {needsSetup && (
            <div className="space-y-2">
              <label htmlFor="login-confirm-password" className="text-sm font-medium text-foreground">Confirm Password</label>
              <Input
                id="login-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || rateLimitActive}>
            {loading ? 'Please wait...' : rateLimitActive ? `Locked · ${mm}:${ss.toString().padStart(2, '0')}` : needsSetup ? 'Set Password' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
