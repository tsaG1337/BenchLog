import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { SectionsProvider } from "@/contexts/SectionsContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { lazy, Suspense, useEffect, useState } from "react";
import { fetchGeneralSettings } from "@/lib/api";
import { useTheme } from "@/contexts/ThemeContext";
const BlogPage = lazy(() => import("./pages/BlogPage"));
import NotFound from "./pages/NotFound";
import SubdomainNotFoundPage from "./pages/SubdomainNotFoundPage";
import { subdomainSlug } from "@/lib/hostname";

// Lazy-loaded pages — only fetched when the route is visited
const Index = lazy(() => import("./pages/Index"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const InspectionsPage = lazy(() => import("./pages/InspectionsPage"));
const WiringPage = lazy(() => import("./pages/WiringPage"));
const PlansPage = lazy(() => import("./pages/PlansPage"));

const queryClient = new QueryClient();

function TenantGuard({ children }: { children: React.ReactNode }) {
  const { tenantNotFound, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (tenantNotFound) return <SubdomainNotFoundPage />;
  return <>{children}</>;
}

function SubdomainGuard() {
  const { isAuthenticated, isLoading, slug, multiTenant } = useAuth();
  useEffect(() => {
    // Single-tenant deployments have no subdomains — never redirect. Without
    // this, a single-tenant instance reached by IP (192.168.1.x) would try to
    // bounce to "<slug>.192.168.1.x".
    if (isLoading || !isAuthenticated || !slug || !multiTenant) return;
    // `subdomainSlug` is null for a bare IP / non-subdomain host — so an
    // IP-hosted instance never tries to bounce to "<slug>.192.168.1.x".
    const currentSlug = subdomainSlug(window.location.hostname);
    if (currentSlug === null) return;
    if (currentSlug !== slug && /^[a-z0-9-]+$/i.test(slug)) {
      // Clear the stale token from this origin before leaving — otherwise future visits
      // here would still see the wrong slug and trigger another redirect loop.
      localStorage.removeItem('auth_token');
      const baseDomain = window.location.hostname.split('.').slice(1).join('.');
      window.location.href = `${window.location.protocol}//${slug}.${baseDomain}/tracker`;
    }
  }, [isAuthenticated, isLoading, slug, multiTenant]);
  return null;
}

function ThemeSyncer() {
  const { setTheme } = useTheme();
  useEffect(() => {
    fetchGeneralSettings()
      .then(s => { if (s.theme) setTheme(s.theme); })
      .catch(() => {});
  }, []);
  return null;
}

function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const { maintenanceMode, role, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (maintenanceMode && role !== 'admin') return <MaintenancePage />;
  return <>{children}</>;
}

function DeactivatedGuard({ children }: { children: React.ReactNode }) {
  const { isDeactivated, isLoading, multiTenant } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (isDeactivated && multiTenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-semibold text-foreground">Your account is not active</h1>
          <p className="text-muted-foreground text-sm">
            To use the tracker, expenses, inventory, and other tools, please re-subscribe.
            Your public build blog will remain accessible if it was previously public.
          </p>
          <a
            href="https://benchlog.build/account"
            className="inline-block mt-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Manage subscription →
          </a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, demoMode } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!isAuthenticated && !demoMode) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, role, demoMode } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  // CRITICAL: in DEMO_MODE the server fakes role='admin' for anonymous
  // visitors so they can browse every page. The server only clears
  // `demoMode` when a verified admin token is presented — so `!demoMode` is
  // the authoritative "this is a real admin session" signal. Without this
  // check, an anonymous demo visitor could navigate to /admin via URL.
  if (role !== 'admin' || demoMode) return <Navigate to="/tracker" replace />;
  return <>{children}</>;
}

/**
 * Hide a route from non-admin users when its feature flag is disabled.
 * Loads featureFlags from generalSettings on mount; while loading we
 * render the children optimistically (admins always see everything anyway,
 * and non-admins are about to be redirected).
 */
type FeatureKey = 'dashboard' | 'blog' | 'tracker' | 'expenses' | 'inventory' | 'inspections' | 'wiring' | 'plans';
function FeatureRoute({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
  const { role, isLoading, demoMode } = useAuth();
  const [flags, setFlags] = useState<Partial<Record<FeatureKey, boolean>> | null>(null);
  useEffect(() => {
    fetchGeneralSettings()
      .then(s => setFlags(s.featureFlags ?? {}))
      .catch(() => setFlags({}));
  }, []);
  if (isLoading || flags === null) return <div className="min-h-screen bg-background" />;
  // Only REAL admin sessions bypass feature flags. Demo visitors get
  // `role: 'admin'` from the faked-auth path but `demoMode: true`, so the
  // additional `!demoMode` check enforces the toggles on them too. On a
  // normal deployment `demoMode` is always false, so real admins still
  // bypass as before.
  const isRealAdmin = role === 'admin' && !demoMode;
  if (!isRealAdmin && flags[feature] === false) {
    // Don't bounce to /dashboard if dashboard itself is disabled — that
    // would create a redirect loop. Fall back to /blog which is always
    // accessible (subject to its own public_blog setting).
    const fallback = flags.dashboard === false ? '/blog' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

function LoginRoute() {
  const { isAuthenticated, isLoading, demoMode } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>;
  const rawFrom = (location.state as any)?.from;
  const safeTo = typeof rawFrom === 'string' && rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : '/tracker';
  // Only redirect away when there's a real authenticated session. In demo
  // mode the server fakes isAuthenticated:true for anonymous visitors —
  // `demoMode` being true is the signal that the visitor is NOT actually
  // signed in, so render the login page in that case.
  if (isAuthenticated && !demoMode) return <Navigate to={safeTo} replace />;
  return <LoginPage />;
}

function getSubdomainSlug(): string | null {
  return subdomainSlug(window.location.hostname);
}

function RootRedirect() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, multiTenant } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    // On a multi-tenant subdomain, an anonymous visitor lands on the public
    // blog. Single-tenant deployments have no subdomains, so fall through to
    // the configured landing page instead.
    if (multiTenant && getSubdomainSlug() && !isAuthenticated) {
      navigate('/blog', { replace: true });
      setReady(true);
      return;
    }
    fetchGeneralSettings()
      .then(s => navigate(s.landingPage === 'blog' ? '/blog' : '/tracker', { replace: true }))
      .catch(() => navigate('/blog', { replace: true }))
      .finally(() => setReady(true));
  }, [navigate, isAuthenticated, isLoading, multiTenant]);

  if (!ready) return <div className="min-h-screen bg-background" />;
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <SectionsProvider>
          <AuthProvider>
            <TenantGuard>
            <SubdomainGuard />
            <ThemeSyncer />
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <Routes>
                  <Route path="/login" element={<LoginRoute />} />
                  <Route path="/" element={<MaintenanceGuard><RootRedirect /></MaintenanceGuard>} />
                  <Route path="/tracker" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><FeatureRoute feature="tracker"><Index /></FeatureRoute></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/expenses" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><FeatureRoute feature="expenses"><ExpensesPage /></FeatureRoute></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/inventory" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><FeatureRoute feature="inventory"><InventoryPage /></FeatureRoute></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/inspections" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><FeatureRoute feature="inspections"><InspectionsPage /></FeatureRoute></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/wiring" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><FeatureRoute feature="wiring"><WiringPage /></FeatureRoute></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/plans" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><FeatureRoute feature="plans"><PlansPage /></FeatureRoute></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/plans/:fileId" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><FeatureRoute feature="plans"><PlansPage /></FeatureRoute></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                  <Route path="/blog" element={<MaintenanceGuard><FeatureRoute feature="blog"><BlogPage /></FeatureRoute></MaintenanceGuard>} />
                  <Route path="/blog/:postId" element={<MaintenanceGuard><FeatureRoute feature="blog"><BlogPage /></FeatureRoute></MaintenanceGuard>} />
                  <Route path="/dashboard" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><FeatureRoute feature="dashboard"><DashboardPage /></FeatureRoute></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/auth-callback" element={<AuthCallbackPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            </TenantGuard>
          </AuthProvider>
        </SectionsProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
