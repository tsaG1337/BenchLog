import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { SectionsProvider } from "@/contexts/SectionsContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { fetchGeneralSettings } from "@/lib/api";
import { useTheme } from "@/contexts/ThemeContext";
import Index from "./pages/Index";
import BlogPage from "./pages/BlogPage";
import ExpensesPage from "./pages/ExpensesPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ThemeSyncer() {
  const { setTheme } = useTheme();
  useEffect(() => {
    fetchGeneralSettings()
      .then(s => { if (s.theme) setTheme(s.theme); })
      .catch(() => {});
  }, []);
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, demoMode } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!isAuthenticated && !demoMode) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role !== 'admin') return <Navigate to="/tracker" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (isAuthenticated) return <Navigate to={(location.state as any)?.from || '/tracker'} replace />;
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
      .catch(() => navigate('/tracker', { replace: true }))
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
            <ThemeSyncer />
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginRoute />} />
                <Route path="/" element={<RootRedirect />} />
                <Route path="/tracker" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/:postId" element={<BlogPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </SectionsProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
