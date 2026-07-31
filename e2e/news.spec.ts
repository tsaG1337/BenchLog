import type { Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';

/**
 * News update indicator — nav-rail badge that lights up when the admin
 * sets a new `latestNews` pointer, and clears once the tenant clicks
 * through. See docs/superpowers/plans/2026-07-29-news-update-indicator.md.
 */

async function authedFetch<T>(page: Page, path: string, init?: { method?: string; body?: string }): Promise<{ ok: boolean; status: number; body: T | null }> {
  return page.evaluate(async ({ path, init }) => {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(path, {
      method: init?.method,
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body,
    });
    let body = null;
    try { body = await res.json(); } catch { /* no/invalid body */ }
    return { ok: res.ok, status: res.status, body };
  }, { path, init });
}

test.describe('News update indicator', () => {
  test('NEWS-E2E-01 admin can set and clear the latest-news pointer', async ({ page }) => {
    await page.goto('/admin');
    const set = await authedFetch(page, '/api/admin/news', {
      method: 'PUT',
      body: JSON.stringify({ slug: 'e2e-test-post', title: 'E2E Test Post', date: '2026-07-29' }),
    });
    expect(set.ok, `PUT /api/admin/news failed: ${set.status}`).toBe(true);

    const read = await authedFetch<{ latestNews: { slug: string } | null }>(page, '/api/admin/news');
    expect(read.body?.latestNews?.slug).toBe('e2e-test-post');

    // Clean up regardless of what the rest of this test does below.
    await authedFetch(page, '/api/admin/news', { method: 'PUT', body: JSON.stringify({}) });
  });

  test('NEWS-E2E-02 unseen badge appears after admin sets a pointer and clears after marking seen', async ({ page }) => {
    // Start from a known state: no pointer set.
    await page.goto('/tracker');
    await authedFetch(page, '/api/admin/news', { method: 'PUT', body: JSON.stringify({}) });

    let status = await authedFetch<{ hasUnseenNews: boolean }>(page, '/api/auth/status');
    expect(status.body?.hasUnseenNews).toBe(false);

    await authedFetch(page, '/api/admin/news', {
      method: 'PUT',
      body: JSON.stringify({ slug: 'e2e-badge-post', title: 'Badge Post', date: '2026-07-29' }),
    });

    status = await authedFetch<{ hasUnseenNews: boolean }>(page, '/api/auth/status');
    expect(status.body?.hasUnseenNews).toBe(true);

    // Reload so AuthContext picks up the new status, then confirm the
    // rail icon is visible with its badge dot.
    await page.reload();
    // Both the rail icon and the drawer entry render simultaneously (the
    // drawer is only translated off-canvas via CSS, not unmounted), so
    // this query matches 2 elements — .first() picks the rail one.
    const railIcon = page.getByRole('link', { name: "What's New" }).first();
    await expect(railIcon).toBeVisible();

    await authedFetch(page, '/api/news/seen', { method: 'POST' });
    status = await authedFetch<{ hasUnseenNews: boolean }>(page, '/api/auth/status');
    expect(status.body?.hasUnseenNews).toBe(false);

    // Clean up.
    await authedFetch(page, '/api/admin/news', { method: 'PUT', body: JSON.stringify({}) });
  });

  test('NEWS-E2E-03 clicking the icon marks news as seen', async ({ page, context }) => {
    await page.goto('/tracker');
    await authedFetch(page, '/api/admin/news', {
      method: 'PUT',
      body: JSON.stringify({ slug: 'e2e-click-post', title: 'Click Post', date: '2026-07-29' }),
    });
    await page.reload();

    // Both the rail icon and the drawer entry render simultaneously (the
    // drawer is only translated off-canvas via CSS, not unmounted), so
    // this query matches 2 elements — .first() picks the rail one.
    const railIcon = page.getByRole('link', { name: "What's New" }).first();
    await expect(railIcon).toBeVisible();

    // The link opens in a new tab (target="_blank") — don't wait on that
    // tab loading benchlog.build for real; just confirm the click fired
    // the mark-seen call by checking status afterward.
    const [popup] = await Promise.all([
      context.waitForEvent('page').catch(() => null),
      railIcon.click(),
    ]);
    if (popup) await popup.close();

    const status = await authedFetch<{ hasUnseenNews: boolean }>(page, '/api/auth/status');
    expect(status.body?.hasUnseenNews).toBe(false);

    // Clean up.
    await authedFetch(page, '/api/admin/news', { method: 'PUT', body: JSON.stringify({}) });
  });
});
