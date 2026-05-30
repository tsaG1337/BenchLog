'use strict';

/**
 * IndexNow notifier — pings api.indexnow.org so participating search engines
 * (Bing, Yandex, Seznam, Naver, Yep) discover new/updated/deleted URLs within
 * seconds rather than waiting weeks for sitemap polling. Google does not
 * participate; rely on GSC + sitemaps for Google.
 *
 * Protocol: https://www.indexnow.org/documentation
 *   - Each host owns a key file at https://{host}/{key}.txt with the key as body
 *   - POST { host, key, urlList } to https://api.indexnow.org/IndexNow
 *   - Fire-and-forget — never throws, never blocks the caller's response
 */

const ENDPOINT = 'https://api.indexnow.org/IndexNow';

/**
 * notifyForTenant({ getOrCreateIndexNowKey }, tenantId, host, urlPaths)
 *   tenantId: tenant UUID (used to look up / generate the IndexNow key)
 *   host:     bare hostname like "pbihn.benchlog.build" (derived from the
 *             request that triggered the mutation, so this works in prod,
 *             staging, and dev with no configuration)
 *   urlPaths: paths starting with '/' (e.g. ['/blog', '/blog/abc'])
 */
async function notifyForTenant(deps, tenantId, host, urlPaths) {
  if (!tenantId || !host || !urlPaths || urlPaths.length === 0) return;
  if (typeof fetch !== 'function') return; // older Node without global fetch
  try {
    const key  = await deps.getOrCreateIndexNowKey(tenantId);
    const urls = [...new Set(urlPaths.map(p => `https://${host}${p.startsWith('/') ? p : '/' + p}`))];
    const res  = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body:    JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls }),
    });
    // 200 = accepted, 202 = received but not yet validated. Anything else is informational.
    if (res.status !== 200 && res.status !== 202) {
      console.log(`[indexnow] ${host} → HTTP ${res.status} for ${urls.length} url(s)`);
    }
  } catch (err) {
    // Swallow — IndexNow failure must never break a blog post save
    console.log(`[indexnow] ${host} skipped: ${err.message}`);
  }
}

module.exports = { notifyForTenant };
