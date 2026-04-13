import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsSetup: boolean;
  demoMode: boolean;
  maintenanceMode: boolean;
  multiTenant: boolean;
  tenantNotFound: boolean;
  isDeactivated: boolean;
  role: string | null;
  slug: string | null;
  login: (password: string, username?: string) => Promise<void>;
  setup: (password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_URL = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [multiTenant, setMultiTenant] = useState(false);
  const [tenantNotFound, setTenantNotFound] = useState(false);
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(() => {
    try {
      const t = localStorage.getItem('auth_token');
      if (!t) return null;
      return JSON.parse(atob(t.split('.')[1])).slug || null;
    } catch { return null; }
  });

  const checkAuth = useCallback(async () => {
    const currentToken = localStorage.getItem('auth_token');
    try {
      const res = await fetch(`${API_URL}/api/auth/status`, {
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
      });
      const data = await res.json();
      if (data.tenantNotFound) { setTenantNotFound(true); return; }
      setDemoMode(!!data.demoMode);
      setMaintenanceMode(!!data.maintenanceMode);
      setMultiTenant(!!data.multiTenant);
      setIsDeactivated(!!data.isDeactivated);
      setNeedsSetup(!data.hasPassword);
      setIsAuthenticated(data.authenticated);
      setRole(data.role || null);
    } catch {
      // Server unavailable
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Detect deactivation from any API call returning 403 "Account deactivated"
  useEffect(() => {
    const handler = () => setIsDeactivated(true);
    window.addEventListener('accountDeactivated', handler);
    return () => window.removeEventListener('accountDeactivated', handler);
  }, []);

  const login = async (password: string, username?: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, username }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Login failed' }));
      const error = new Error(err.error) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
    const data = await res.json();
    // Check for cross-subdomain mismatch BEFORE saving the token to this origin's localStorage.
    // Saving first would leave a stale foreign token here, causing SubdomainGuard to
    // keep redirecting future visitors away from this subdomain.
    if (data.slug) {
      const parts = window.location.hostname.split('.');
      const currentSlug = parts.length >= 3 && !['www', 'account', 'demo'].includes(parts[0]) ? parts[0] : null;
      // Only redirect if we're already on a user subdomain and it's the wrong one.
      // If currentSlug is null (custom domain, system subdomain, localhost) stay put.
      if (currentSlug !== null && currentSlug !== data.slug) {
        // Validate slug is alphanumeric (with hyphens) to prevent open redirect
        if (/^[a-z0-9-]+$/i.test(data.slug)) {
          const baseDomain = parts.slice(1).join('.');
          window.location.href = `${window.location.protocol}//${data.slug}.${baseDomain}/auth-callback?token=${encodeURIComponent(data.token)}`;
          return;
        }
      }
    }
    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setIsAuthenticated(true);
    try {
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      setRole(payload.role || null);
      setSlug(payload.slug || null);
    } catch {}
  };

  const setup = async (password: string) => {
    const res = await fetch(`${API_URL}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Setup failed' }));
      throw new Error(err.error);
    }
    const data = await res.json();
    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setIsAuthenticated(true);
    setNeedsSetup(false);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setIsAuthenticated(false);
    setSlug(null);
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, isLoading, needsSetup, demoMode, maintenanceMode, multiTenant, tenantNotFound, isDeactivated, role, slug, login, setup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
