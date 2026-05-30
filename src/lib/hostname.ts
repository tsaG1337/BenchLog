/**
 * Hostname parsing for subdomain-based multi-tenant routing.
 *
 * A user's tenant is identified by the first label of the hostname
 * (`<slug>.benchlog.build`). Two kinds of host are NOT subdomains and must
 * resolve to "no slug":
 *   • a bare IP literal — its dotted parts are address octets, not labels;
 *   • a reserved system subdomain (`www`, `account`, `demo`).
 *
 * Without the IP guard, an instance reached by `192.168.1.98` reads its first
 * octet (`192`) as a tenant slug and builds nonsense URLs like
 * `http://admin.168.1.98/…`.
 */

/** True when `hostname` is a bare IP literal rather than a domain name. */
export function isBareIpHost(hostname: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;            // IPv4
  if (hostname.startsWith('[') || hostname.includes(':')) return true;  // IPv6 literal
  return false;
}

/**
 * The tenant subdomain slug of `hostname`, or `null` when there is none —
 * a bare IP, a bare/2-label domain, `localhost`, or a reserved system
 * subdomain (`www`, `account`, `demo`).
 */
export function subdomainSlug(hostname: string): string | null {
  if (isBareIpHost(hostname)) return null;
  const parts = hostname.split('.');
  if (parts.length < 3) return null;
  const slug = parts[0];
  if (slug === 'www' || slug === 'account' || slug === 'demo') return null;
  return slug;
}
