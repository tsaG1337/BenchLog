import { describe, it, expect } from 'vitest';
import { isBareIpHost, subdomainSlug } from './hostname';

describe('isBareIpHost', () => {
  it('detects IPv4 literals', () => {
    expect(isBareIpHost('192.168.1.98')).toBe(true);
    expect(isBareIpHost('10.0.0.1')).toBe(true);
  });

  it('detects IPv6 literals', () => {
    expect(isBareIpHost('fe80::1')).toBe(true);
    expect(isBareIpHost('[::1]')).toBe(true);
  });

  it('does not flag domain names or localhost', () => {
    expect(isBareIpHost('pbihn.benchlog.build')).toBe(false);
    expect(isBareIpHost('benchlog.build')).toBe(false);
    expect(isBareIpHost('localhost')).toBe(false);
  });
});

describe('subdomainSlug', () => {
  it('returns null for a bare IP — its octets are not a subdomain', () => {
    // The bug: an IP login read "192" as a tenant slug and built
    // http://admin.168.1.98/auth-callback.
    expect(subdomainSlug('192.168.1.98')).toBe(null);
  });

  it('returns the first label of a real user subdomain', () => {
    expect(subdomainSlug('pbihn.benchlog.build')).toBe('pbihn');
  });

  it('returns null for non-subdomain hosts', () => {
    expect(subdomainSlug('localhost')).toBe(null);
    expect(subdomainSlug('benchlog.build')).toBe(null);
  });

  it('returns null for reserved system subdomains', () => {
    expect(subdomainSlug('www.benchlog.build')).toBe(null);
    expect(subdomainSlug('account.benchlog.build')).toBe(null);
    expect(subdomainSlug('demo.benchlog.build')).toBe(null);
  });
});
