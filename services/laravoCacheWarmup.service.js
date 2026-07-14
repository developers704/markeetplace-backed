/**
 * Nightly Laravo Redis warmup.
 * Prefetches active-data + brand/product-type catalogs into Redis so user
 * requests are served from cache (ms) instead of hitting Laravo live.
 */
const { getClient } = require('../config/redis');
const laravoService = require('./laravo.service');

const PAGE_SIZE = Number(process.env.LARAVO_WARMUP_PAGE_SIZE) || laravoService.DEFAULT_CLIENT_PAGE_SIZE || 20;
const MAX_PAGES = Number(process.env.LARAVO_WARMUP_MAX_PAGES) || 100;
const WARMUP_META_KEY = 'laravo:v1:warmup:meta';
const DELAY_MS = Number(process.env.LARAVO_WARMUP_DELAY_MS) || 250;

let running = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveWarmupMeta(meta) {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.setex(WARMUP_META_KEY, laravoService.LARAVO_CACHE_TTL_SEC, JSON.stringify(meta));
  } catch (err) {
    console.warn('[LaravoWarmup] meta save failed:', err.message);
  }
}

async function warmListingPages(fetcher, label) {
  const first = await fetcher(1, true);
  const pageCount = Math.min(
    MAX_PAGES,
    Number(first?.pagination?.pageCount || first?.pageCount || 1),
  );

  let pagesWarmed = 1;
  for (let page = 2; page <= pageCount; page += 1) {
    await fetcher(page, false);
    pagesWarmed += 1;
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(`[LaravoWarmup] ${label}: warmed ${pagesWarmed}/${pageCount} pages`);
  return { pagesWarmed, pageCount, productCount: first?.groupedProductCount || first?.productCount || 0 };
}

/**
 * Force-refresh Laravo catalog into Redis.
 * @param {{ onBoot?: boolean }} opts
 */
async function warmLaravoCache(opts = {}) {
  if (running) {
    console.log('[LaravoWarmup] already running — skip');
    return { success: false, skipped: true, reason: 'already_running' };
  }

  if (!getClient()) {
    console.warn('[LaravoWarmup] Redis unavailable — skip');
    return { success: false, skipped: true, reason: 'redis_unavailable' };
  }

  if (!String(process.env.LARAVO_PRIVATE_KEY || '').trim()) {
    console.warn('[LaravoWarmup] LARAVO_PRIVATE_KEY missing — skip');
    return { success: false, skipped: true, reason: 'missing_private_key' };
  }

  running = true;
  const startedAt = new Date();
  const summary = {
    startedAt: startedAt.toISOString(),
    onBoot: !!opts.onBoot,
    brands: 0,
    productTypes: 0,
    listings: 0,
    errors: [],
  };

  console.log(`[LaravoWarmup] starting${opts.onBoot ? ' (boot)' : ' (midnight cron)'}…`);

  try {
    const active = await laravoService.getActiveData({ forceRefresh: true });
    const brands = Array.isArray(active?.summary) ? active.summary : [];
    summary.brands = brands.length;
    console.log(`[LaravoWarmup] active-data: ${brands.length} brands`);

    for (const brand of brands) {
      const brandId = brand.brandId;
      if (!brandId) continue;

      try {
        await warmListingPages(
          (page, force) =>
            laravoService.getBrandProducts(brandId, {
              page,
              limit: PAGE_SIZE,
              forceRefresh: force,
            }),
          `brand ${brand.brand || brandId}`,
        );
        summary.listings += 1;
      } catch (err) {
        const msg = `brand ${brandId}: ${err.message}`;
        summary.errors.push(msg);
        console.error(`[LaravoWarmup] ${msg}`);
      }

      const productTypes = Array.isArray(brand.productTypes) ? brand.productTypes : [];
      for (const pt of productTypes) {
        const productTypeId = pt.productTypeId ?? pt.fileId;
        if (!productTypeId) continue;
        summary.productTypes += 1;

        try {
          await warmListingPages(
            (page, force) =>
              laravoService.getBrandProductTypeProducts(brandId, productTypeId, {
                page,
                limit: PAGE_SIZE,
                forceRefresh: force,
              }),
            `brand ${brandId} type ${pt.productType || productTypeId}`,
          );
          summary.listings += 1;
        } catch (err) {
          const msg = `brand ${brandId} type ${productTypeId}: ${err.message}`;
          summary.errors.push(msg);
          console.error(`[LaravoWarmup] ${msg}`);
        }

        if (DELAY_MS > 0) await sleep(DELAY_MS);
      }

      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }

    const finishedAt = new Date();
    const meta = {
      ...summary,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      success: true,
      pageSize: PAGE_SIZE,
      maxPages: MAX_PAGES,
    };
    await saveWarmupMeta(meta);
    console.log(
      `[LaravoWarmup] done in ${Math.round(meta.durationMs / 1000)}s — brands=${meta.brands} types=${meta.productTypes} listings=${meta.listings} errors=${meta.errors.length}`,
    );
    return meta;
  } catch (err) {
    const finishedAt = new Date();
    const meta = {
      ...summary,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      success: false,
      fatalError: err.message,
    };
    await saveWarmupMeta(meta);
    console.error('[LaravoWarmup] failed:', err.message);
    return meta;
  } finally {
    running = false;
  }
}

function scheduleLaravoCacheWarmup() {
  const cron = require('node-cron');
  const timezone = process.env.LARAVO_WARMUP_TZ || process.env.TZ || 'Asia/Karachi';
  const expression = process.env.LARAVO_WARMUP_CRON || '0 0 * * *'; // midnight

  cron.schedule(
    expression,
    () => {
      warmLaravoCache({ onBoot: false }).catch((err) =>
        console.error('[LaravoWarmup] cron error:', err.message),
      );
    },
    { timezone },
  );

  console.log(`[LaravoWarmup] scheduled "${expression}" (${timezone})`);

  // Also warm shortly after boot so users never wait on a cold cache
  const bootDelayMs = Number(process.env.LARAVO_WARMUP_BOOT_DELAY_MS);
  const shouldWarmOnBoot = process.env.LARAVO_WARMUP_ON_BOOT !== '0';
  if (shouldWarmOnBoot) {
    const delay = Number.isFinite(bootDelayMs) ? bootDelayMs : 15_000;
    setTimeout(() => {
      warmLaravoCache({ onBoot: true }).catch((err) =>
        console.error('[LaravoWarmup] boot warmup error:', err.message),
      );
    }, delay);
    console.log(`[LaravoWarmup] boot warmup in ${Math.round(delay / 1000)}s`);
  }
}

module.exports = {
  warmLaravoCache,
  scheduleLaravoCacheWarmup,
};
