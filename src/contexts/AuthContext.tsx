import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { subdomainSlug } from '@/lib/hostname';
import { markNewsSeen as apiMarkNewsSeen, type LatestNews } from '@/lib/api';

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
  latestNews: LatestNews | null;
  hasUnseenNews: boolean;
  login: (password: string, username?: string, rememberMe?: boolean) => Promise<void>;
  setup: (password: string) => Promise<void>;
  logout: () => void;
  markNewsSeen: () => Promise<void>;
  /** Re-pull /api/auth/status. Needed after something changes state the
   *  status endpoint reports — setting the latest news item, for one:
   *  without it the What's New badge only appears after a full reload. */
  refreshAuth: () => Promise<void>;
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
  const [latestNews, setLatestNews] = useState<LatestNews | null>(null);
  const [hasUnseenNews, setHasUnseenNews] = useState(false);

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
      setLatestNews(data.latestNews || null);
      setHasUnseenNews(!!data.hasUnseenNews);
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

  const login = async (password: string, username?: string, rememberMe?: boolean) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, username, rememberMe }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Login failed' }));
      const error = new Error(err.error) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
    const data = await res.json();
    // Cross-subdomain redirect — only for multi-tenant deployments, where each
    // user lives on their own `<slug>.<domain>` subdomain. Single-tenant
    // deployments (and anything reached by a bare IP, which has no subdomain)
    // skip this: without the `multiTenant` guard an IP login mis-reads the
    // address octets as a subdomain and builds a broken URL such as
    // `http://admin.168.1.98/auth-callback`.
    // Checked BEFORE saving the token to this origin's localStorage — saving
    // first would strand a stale foreign token here, causing SubdomainGuard to
    // keep redirecting future visitors away from this subdomain.
    if (multiTenant && data.slug) {
      // `subdomainSlug` returns null for a bare IP / non-subdomain host, so an
      // IP login never mistakes an address octet (e.g. "192") for a subdomain.
      const currentSlug = subdomainSlug(window.location.hostname);
      // Only redirect if we're already on a user subdomain and it's the wrong one.
      // If currentSlug is null (IP, custom domain, system subdomain, localhost) stay put.
      if (currentSlug !== null && currentSlug !== data.slug) {
        // Validate slug is alphanumeric (with hyphens) to prevent open redirect
        if (/^[a-z0-9-]+$/i.test(data.slug)) {
          const baseDomain = window.location.hostname.split('.').slice(1).join('.');
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
    // Re-pull /auth/status so a demo deployment's demoMode flag flips to
    // `false` for an authenticated admin. Without this the frontend would
    // stay in read-only display until the next page reload.
    void checkAuth();
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
    setRole(null);
    // Re-pull status so a demo deployment switches back to demoMode:true
    // immediately — without this, the previous admin's flags would persist
    // until the next page load.
    void checkAuth();
  };

  const markNewsSeen = async () => {
    // Optimistic — the badge should disappear the instant they click,
    // not after a round-trip. Worst case on failure: it reappears on the
    // next status poll and they click again, not worth surfacing an error for.
    setHasUnseenNews(false);
    try {
      await apiMarkNewsSeen();
    } catch { /* see above — the optimistic update already stands */ }
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, isLoading, needsSetup, demoMode, maintenanceMode, multiTenant, tenantNotFound, isDeactivated, role, slug, latestNews, hasUnseenNews, login, setup, logout, markNewsSeen, refreshAuth: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
