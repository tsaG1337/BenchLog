import { useEffect } from 'react';

/**
 * Handles cross-subdomain login redirects.
 *
 * When a user logs in at another subdomain (e.g. pbihn.benchlog.build) but
 * their account lives on a different subdomain (e.g. admin.benchlog.build),
 * the login flow redirects here with ?token=<jwt>.
 *
 * This page saves the token to localStorage, then does a hard reload to
 * /tracker so that AuthContext picks it up fresh from localStorage on boot.
 */
export default function AuthCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      // Validate token looks like a JWT (3 base64url segments) AND has a future exp claim
      const jwtRegex = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
      if (jwtRegex.test(token)) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload?.exp && payload.exp * 1000 > Date.now()) {
            localStorage.setItem('auth_token', token);
          }
        } catch {
          // Malformed payload — ignore
        }
      }
    }
    // Hard redirect — forces AuthContext to reinitialize with the new token
    window.location.replace('/tracker');
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Signing you in…</p>
    </div>
  );
}
