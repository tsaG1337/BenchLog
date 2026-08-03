import type { Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';

/**
 * News update indicator — nav-rail badge that lights up when the admin
 * sets a new `latestNews` pointer, and clears once the tenant clicks
 * through. See docs/superpowers/plans/2026-07-29-news-update-indicator.md.
 */

type LatestNews = { slug: string; title: string; date: string } | null;

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
  // These tests all read/write the platform-wide `latestNews` pointer and
  // this tenant's `newsSeen` state, so they must not interleave with each
  // other — one test's cleanup PUT racing another's setup PUT would produce
  // flaky, confusing failures. `serial` mode guarantees that ordering for
  // whichever single Playwright project runs this file.
  //
  // It does NOT prevent two *different* projects (chromium + firefox, see
  // playwright.config.ts) from each running this file concurrently in their
  // own worker — that cross-process race is a real residual risk. We accept
  // it rather than building a cross-process lock for a 3-test file: the
  // beforeAll/afterAll below still guarantee the platform pointer is
  // captured before, and restored after, the whole suite regardless of how
  // many projects touched it in between.
  test.describe.configure({ mode: 'serial' });

  // The `latestNews` pointer is real, admin-set, global platform state —
  // not something these tests own. Every test clears it as part of its own
  // setup/cleanup (needed for test isolation between NEWS-E2E-01/02/03),
  // but that must not leak out of this file: capture whatever was there
  // before this suite ran, and restore it once every test (across the file)
  // has finished, so a legitimately-published news pointer isn't silently
  // dropped for every tenant.
  let savedLatestNews: LatestNews = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/tracker');
    const current = await authedFetch<{ latestNews: LatestNews }>(page, '/api/admin/news');
    if (current.ok) savedLatestNews = current.body?.latestNews ?? null;
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/tracker');
    await authedFetch(page, '/api/admin/news', { method: 'PUT', body: JSON.stringify(savedLatestNews ?? {}) });
    await page.close();
  });

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
    const cleared = await authedFetch(page, '/api/admin/news', { method: 'PUT', body: JSON.stringify({}) });
    expect(cleared.ok, `cleanup PUT /api/admin/news failed: ${cleared.status}`).toBe(true);
  });

  test('NEWS-E2E-02 unseen badge appears after admin sets a pointer and clears after marking seen', async ({ page }) => {
    // Start from a known state: no pointer set.
    await page.goto('/tracker');
    const cleared = await authedFetch(page, '/api/admin/news', { method: 'PUT', body: JSON.stringify({}) });
    expect(cleared.ok, `setup PUT /api/admin/news failed: ${cleared.status}`).toBe(true);

    let status = await authedFetch<{ hasUnseenNews: boolean }>(page, '/api/auth/status');
    expect(status.body?.hasUnseenNews).toBe(false);

    const set = await authedFetch(page, '/api/admin/news', {
      method: 'PUT',
      body: JSON.stringify({ slug: 'e2e-badge-post', title: 'Badge Post', date: '2026-07-29' }),
    });
    expect(set.ok, `PUT /api/admin/news failed: ${set.status}`).toBe(true);

    status = await authedFetch<{ hasUnseenNews: boolean }>(page, '/api/auth/status');
    expect(status.body?.hasUnseenNews).toBe(true);

    // Reload so AuthContext picks up the new status, then confirm the
    // rail icon is visible AND carries its unseen-badge dot. The link
    // itself renders whenever `latestNews` is set at all (see
    // AppShell.tsx — gated on `newsUrl`, not `hasUnseenNews`), so link
    // visibility alone doesn't prove the "unseen" badge behavior; the
    // badge dot (`span.rounded-full`, conditionally rendered on
    // `hasUnseenNews`) is the thing actually under test here.
    await page.reload();
    // Both the rail icon and the drawer entry render simultaneously (the
    // drawer is only translated off-canvas via CSS, not unmounted), so
    // this query matches 2 elements — .first() picks the rail one.
    const railIcon = page.getByRole('link', { name: "What's New" }).first();
    await expect(railIcon).toBeVisible();
    await expect(railIcon.locator('span.rounded-full')).toBeVisible();

    const seen = await authedFetch(page, '/api/news/seen', { method: 'POST' });
    expect(seen.ok, `POST /api/news/seen failed: ${seen.status}`).toBe(true);
    status = await authedFetch<{ hasUnseenNews: boolean }>(page, '/api/auth/status');
    expect(status.body?.hasUnseenNews).toBe(false);

    // Reload so AuthContext re-reads the now-seen status, and confirm the
    // badge dot is gone (the link itself may still render — that's fine,
    // `latestNews` is still set).
    await page.reload();
    const railIconAfter = page.getByRole('link', { name: "What's New" }).first();
    await expect(railIconAfter).toBeVisible();
    await expect(railIconAfter.locator('span.rounded-full')).toHaveCount(0);

    // Clean up.
    const cleanup = await authedFetch(page, '/api/admin/news', { method: 'PUT', body: JSON.stringify({}) });
    expect(cleanup.ok, `cleanup PUT /api/admin/news failed: ${cleanup.status}`).toBe(true);
  });

  test('NEWS-E2E-03 clicking the icon marks news as seen', async ({ page, context }) => {
    await page.goto('/tracker');
    const set = await authedFetch(page, '/api/admin/news', {
      method: 'PUT',
      body: JSON.stringify({ slug: 'e2e-click-post', title: 'Click Post', date: '2026-07-29' }),
    });
    expect(set.ok, `PUT /api/admin/news failed: ${set.status}`).toBe(true);
    await page.reload();

    // Both the rail icon and the drawer entry render simultaneously (the
    // drawer is only translated off-canvas via CSS, not unmounted), so
    // this query matches 2 elements — .first() picks the rail one.
    const railIcon = page.getByRole('link', { name: "What's New" }).first();
    await expect(railIcon).toBeVisible();
    await expect(railIcon.locator('span.rounded-full')).toBeVisible();

    // The link opens in a new tab (target="_blank") — don't wait on that
    // tab loading benchlog.build for real; just confirm the click fired
    // the mark-seen call by checking status afterward.
    const [popup] = await Promise.all([
      context.waitForEvent('page').catch(() => null),
      railIcon.click(),
    ]);
    if (popup) await popup.close();

    // markNewsSeen() flips AuthContext state optimistically on click (see
    // AuthContext.tsx), so the badge dot should disappear on the current
    // page without needing a reload.
    await expect(railIcon.locator('span.rounded-full')).toHaveCount(0);

    const status = await authedFetch<{ hasUnseenNews: boolean }>(page, '/api/auth/status');
    expect(status.body?.hasUnseenNews).toBe(false);

    // Clean up.
    const cleanup = await authedFetch(page, '/api/admin/news', { method: 'PUT', body: JSON.stringify({}) });
    expect(cleanup.ok, `cleanup PUT /api/admin/news failed: ${cleanup.status}`).toBe(true);
  });
});
