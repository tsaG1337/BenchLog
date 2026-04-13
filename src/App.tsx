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

const queryClient = new QueryClient();

function TenantGuard({ children }: { children: React.ReactNode }) {
  const { tenantNotFound, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (tenantNotFound) return <SubdomainNotFoundPage />;
  return <>{children}</>;
}

function SubdomainGuard() {
  const { isAuthenticated, isLoading, slug } = useAuth();
  useEffect(() => {
    if (isLoading || !isAuthenticated || !slug) return;
    const parts = window.location.hostname.split('.');
    if (parts.length < 3) return;
    const currentSlug = parts[0];
    if (['www', 'account', 'demo'].includes(currentSlug)) return;
    if (currentSlug !== slug && /^[a-z0-9-]+$/i.test(slug)) {
      // Clear the stale token from this origin before leaving — otherwise future visits
      // here would still see the wrong slug and trigger another redirect loop.
      localStorage.removeItem('auth_token');
      const baseDomain = parts.slice(1).join('.');
      window.location.href = `${window.location.protocol}//${slug}.${baseDomain}/tracker`;
    }
  }, [isAuthenticated, isLoading, slug]);
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
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role !== 'admin') return <Navigate to="/tracker" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>;
  const rawFrom = (location.state as any)?.from;
  const safeTo = typeof rawFrom === 'string' && rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : '/tracker';
  if (isAuthenticated) return <Navigate to={safeTo} replace />;
  return <LoginPage />;
}

function getSubdomainSlug(): string | null {
  const parts = window.location.hostname.split('.');
  if (parts.length < 3) return null;
  const slug = parts[0];
  if (['www', 'account', 'demo'].includes(slug)) return null;
  return slug;
}

function RootRedirect() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (getSubdomainSlug() && !isAuthenticated) {
      navigate('/blog', { replace: true });
      setReady(true);
      return;
    }
    fetchGeneralSettings()
      .then(s => navigate(s.landingPage === 'blog' ? '/blog' : '/tracker', { replace: true }))
      .catch(() => navigate('/blog', { replace: true }))
      .finally(() => setReady(true));
  }, [navigate, isAuthenticated, isLoading]);

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
                  <Route path="/tracker" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><Index /></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/expenses" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><ExpensesPage /></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/inventory" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><InventoryPage /></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/inspections" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><InspectionsPage /></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
                  <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                  <Route path="/blog" element={<MaintenanceGuard><BlogPage /></MaintenanceGuard>} />
                  <Route path="/blog/:postId" element={<MaintenanceGuard><BlogPage /></MaintenanceGuard>} />
                  <Route path="/dashboard" element={<MaintenanceGuard><DeactivatedGuard><ProtectedRoute><DashboardPage /></ProtectedRoute></DeactivatedGuard></MaintenanceGuard>} />
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
