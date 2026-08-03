import type { Page } from '@playwright/test';
import { test, expect } from './helpers/fixtures';

/**
 * Plan reader — part-number link overlay + inventory popup.
 *
 * Part-number links are detected live, client-side, from whatever plan
 * PDF happens to be loaded — there's no fixture PDF with known content,
 * so this scans existing plan files for one with at least one detected
 * link, reads its part number out of the DOM, then drives the three
 * inventory states (not imported / no stock / in stock) by seeding and
 * tearing down real inventory rows via the API around that exact part
 * number. If that part number happens to already exist in this tenant's
 * real inventory data, the test skips rather than risk colliding with
 * real data or asserting a false "not imported" state.
 *
 * Auth here is a JWT in localStorage (not a cookie), so the plain
 * `request` fixture can't call authenticated endpoints — see the same
 * authedFetch() pattern in plans.spec.ts.
 */

async function authedFetch<T>(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; body: T | null }> {
  return page.evaluate(async ({ path, init }) => {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(path, {
      method: init?.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    let body = null;
    try { body = await res.json(); } catch { /* no/invalid body */ }
    return { ok: res.ok, status: res.status, body };
  }, { path, init });
}

async function firstFileWithPartLink(page: Page, files: any[]): Promise<{ file: any; partNumber: string } | null> {
  for (const file of files.slice(0, 10)) {
    await page.goto(`/plans/${file.id}`);
    const link = page.locator('[data-part-number]').first();
    try {
      await link.waitFor({ state: 'attached', timeout: 8_000 });
    } catch {
      continue;
    }
    const partNumber = await link.getAttribute('data-part-number');
    if (partNumber) return { file, partNumber };
  }
  return null;
}

test.describe('Plans reader — part info popup', () => {
  test('PART-POPUP-E2E-01 not-imported, no-stock, then in-stock states for the same part number', async ({ page }) => {
    await page.goto('/plans');
    const list = await authedFetch<any[]>(page, '/api/plans');
    test.skip(!list.ok || !list.body?.length, `/api/plans returned ${list.status} or was empty`);

    const found = await firstFileWithPartLink(page, list.body!);
    test.skip(!found, 'No plan file with a detected part-number link among the first 10 files');
    const { file, partNumber } = found!;

    const pre = await authedFetch<{ part: unknown }>(page, `/api/inventory/lookup/${encodeURIComponent(partNumber)}`);
    test.skip(
      !pre.ok || pre.body?.part != null,
      `Part ${partNumber} already exists in this tenant's real inventory — skipping to avoid colliding with real data`,
    );

    let partId: number | null = null;
    let locationId: number | null = null;
    let stockId: number | null = null;

    try {
      // 1. Not imported — nothing seeded yet.
      await page.goto(`/plans/${file.id}`);
      await page.locator(`[data-part-number="${partNumber}"]`).first().click();
      await expect(page.getByText('Not imported into inventory.')).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape');

      // 2. In inventory, no stock.
      const partRes = await authedFetch<{ id: number }>(page, '/api/inventory/parts', {
        method: 'POST',
        body: { partNumber, name: 'E2E Test Part' },
      });
      expect(partRes.ok).toBe(true);
      partId = partRes.body!.id;

      await page.goto(`/plans/${file.id}`);
      await page.locator(`[data-part-number="${partNumber}"]`).first().click();
      await expect(page.getByText('No stock.')).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape');

      // 3. In stock, with a location.
      const locRes = await authedFetch<{ id: number }>(page, '/api/inventory/locations', {
        method: 'POST',
        body: { name: 'E2E Test Shelf' },
      });
      expect(locRes.ok).toBe(true);
      locationId = locRes.body!.id;

      const stockRes = await authedFetch<{ id: number }>(page, '/api/inventory/stock', {
        method: 'POST',
        body: { partId, locationId, quantity: 4, unit: 'pcs' },
      });
      expect(stockRes.ok).toBe(true);
      stockId = stockRes.body!.id;

      await page.goto(`/plans/${file.id}`);
      await page.locator(`[data-part-number="${partNumber}"]`).first().click();
      await expect(page.getByText('E2E Test Shelf')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('4 pcs')).toBeVisible();
    } finally {
      // Clean up via the API directly so the test doesn't leave litter
      // on a shared tenant regardless of where it stopped.
      if (stockId) await authedFetch(page, `/api/inventory/stock/${stockId}`, { method: 'DELETE' });
      if (partId) await authedFetch(page, `/api/inventory/parts/${partId}`, { method: 'DELETE' });
      if (locationId) await authedFetch(page, `/api/inventory/locations/${locationId}`, { method: 'DELETE' });
    }
  });
});
