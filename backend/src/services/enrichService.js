const fetch = require('node-fetch');

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw;
}

async function checkWebsite(url) {
  if (!url) return { has_website: false, website_live: false, website: null };
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(normalized, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FieldstackBot/1.0)' }
    });
    clearTimeout(timer);
    return { has_website: true, website_live: res.ok || res.status < 400, website: normalized };
  } catch {
    return { has_website: true, website_live: false, website: normalized };
  }
}

async function enrichBatch(results) {
  // Run website checks concurrently, max 8 at a time to avoid hammering
  const CONCURRENCY = 8;
  const enriched = [...results];

  for (let i = 0; i < results.length; i += CONCURRENCY) {
    const chunk = results.slice(i, i + CONCURRENCY);
    const checks = await Promise.allSettled(
      chunk.map(r => checkWebsite(r.website))
    );

    checks.forEach((check, j) => {
      const idx = i + j;
      const websiteInfo = check.status === 'fulfilled'
        ? check.value
        : { has_website: false, website_live: false, website: results[idx].website };

      enriched[idx] = {
        ...enriched[idx],
        ...websiteInfo,
        phone: normalizePhone(results[idx].phone),
      };
    });
  }

  return enriched;
}

module.exports = { enrichBatch, normalizePhone, checkWebsite };
