const fetch = require('node-fetch');
const cheerio = require('cheerio');

const FAKE_EMAILS = new Set([
  'example@example.com', 'test@test.com', 'noreply@', 'no-reply@',
  'info@example.com', 'admin@example.com', 'webmaster@example.com',
  'email@example.com', 'name@example.com', 'support@example.com',
]);

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function isFakeEmail(email) {
  const lower = email.toLowerCase();
  if (FAKE_EMAILS.has(lower)) return true;
  if (lower.includes('example.com') || lower.includes('test.com')) return true;
  if (lower.startsWith('noreply@') || lower.startsWith('no-reply@')) return true;
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif')) return true;
  return false;
}

function extractEmails($) {
  const emails = new Set();

  // From mailto links
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace('mailto:', '').split('?')[0].trim();
    if (email && !isFakeEmail(email)) emails.add(email.toLowerCase());
  });

  // From page text via regex
  const bodyText = $('body').text();
  const matches = bodyText.match(EMAIL_REGEX) || [];
  for (const email of matches) {
    if (!isFakeEmail(email)) emails.add(email.toLowerCase());
  }

  return [...emails];
}

function extractTeamNames($) {
  const names = new Set();

  // Check meta author
  const author = $('meta[name="author"]').attr('content');
  if (author && author.length > 2 && author.length < 60) {
    names.add(author.trim());
  }

  // Look for sections about team/owner
  const teamKeywords = /about|team|staff|owner|meet|leadership|people|who we are/i;

  $('h1, h2, h3, h4, h5, h6').each((_, heading) => {
    const text = $(heading).text().trim();
    if (!teamKeywords.test(text)) return;

    // Get the parent section or next siblings
    const parent = $(heading).parent();
    const section = parent.is('section, div, article') ? parent : $(heading).closest('section, div');

    // Look for structured name patterns in the section
    section.find('h3, h4, h5, .name, .team-member-name, [class*="name"]').each((_, el) => {
      const name = $(el).text().trim();
      if (name.length > 2 && name.length < 50 && /^[A-Z]/.test(name) && !/</.test(name)) {
        names.add(name);
      }
    });

    // Check for "Owner: Name" or "Founder: Name" patterns
    const sectionText = section.text();
    const ownerPatterns = /(?:owner|founder|president|ceo|manager|director|principal)[:\s–-]+([A-Z][a-z]+ [A-Z][a-z]+)/gi;
    let match;
    while ((match = ownerPatterns.exec(sectionText)) !== null) {
      if (match[1].length < 50) names.add(match[1].trim());
    }
  });

  return [...names].slice(0, 10);
}

function extractServices($) {
  const services = new Set();
  const serviceKeywords = /service|what we do|our work|specialt|we offer|capabilities/i;

  $('h1, h2, h3, h4, h5, h6').each((_, heading) => {
    const text = $(heading).text().trim();
    if (!serviceKeywords.test(text)) return;

    const parent = $(heading).parent();
    const section = parent.is('section, div, article') ? parent : $(heading).closest('section, div');

    // List items in service sections
    section.find('li').each((_, li) => {
      const item = $(li).text().trim();
      if (item.length > 2 && item.length < 80) {
        services.add(item);
      }
    });

    // Sub-headings as services
    section.find('h3, h4, h5').each((_, el) => {
      if (el === heading) return;
      const item = $(el).text().trim();
      if (item.length > 2 && item.length < 80) {
        services.add(item);
      }
    });
  });

  // If nothing found from headings, try common page patterns
  if (services.size === 0) {
    $('[class*="service"], [class*="Service"]').each((_, el) => {
      const headings = $(el).find('h3, h4, h5');
      headings.each((_, h) => {
        const item = $(h).text().trim();
        if (item.length > 2 && item.length < 80) services.add(item);
      });
    });
  }

  return [...services].slice(0, 15);
}

function detectTechStack($, html) {
  // Meta generator tag
  const generator = $('meta[name="generator"]').attr('content') || '';
  if (/wordpress/i.test(generator)) return 'WordPress';
  if (/joomla/i.test(generator)) return 'Joomla';
  if (/drupal/i.test(generator)) return 'Drupal';
  if (/wix/i.test(generator)) return 'Wix';

  // Script/link URL patterns
  if (/wp-content|wp-includes/i.test(html)) return 'WordPress';
  if (/static\.wixstatic\.com|wix\.com/i.test(html)) return 'Wix';
  if (/squarespace\.com|squarespace-cdn/i.test(html)) return 'Squarespace';
  if (/cdn\.shopify\.com|shopify/i.test(html)) return 'Shopify';
  if (/webflow\.com/i.test(html)) return 'Webflow';
  if (/weebly\.com/i.test(html)) return 'Weebly';
  if (/godaddy\.com|secureserver\.net/i.test(html)) return 'GoDaddy';

  // Framework hints
  if ($('meta[name="next-head-count"]').length || /__NEXT_DATA__/.test(html)) return 'Next.js';
  if (/__NUXT__/.test(html)) return 'Nuxt.js';
  if (/gatsby/i.test(generator)) return 'Gatsby';

  return 'Custom / Unknown';
}

function detectContactForm($) {
  return $('form').filter((_, el) => {
    const action = ($(el).attr('action') || '').toLowerCase();
    const cls = ($(el).attr('class') || '').toLowerCase();
    const id = ($(el).attr('id') || '').toLowerCase();
    if (action.includes('search') || cls.includes('search') || id.includes('search')) return false;
    return true;
  }).length > 0;
}

async function scrapePageEmails(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    return extractEmails($);
  } catch {
    return [];
  }
}

async function scrapeWebsite(url) {
  if (!url) return { error: 'No website URL provided' };

  const normalized = url.startsWith('http') ? url : `https://${url}`;

  let html;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(normalized, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
    clearTimeout(timer);

    if (!res.ok) return { error: `Website returned ${res.status}` };
    html = await res.text();
  } catch (err) {
    return { error: `Could not reach website: ${err.message}` };
  }

  const $ = cheerio.load(html);

  const rootEmails = extractEmails($);

  // If root has no emails, try /contact and /about pages in parallel
  let allEmails = rootEmails;
  if (rootEmails.length === 0) {
    try {
      const base = new URL(normalized).origin;
      const subpages = ['/contact', '/contact-us', '/about', '/about-us'];
      const subResults = await Promise.all(subpages.map(p => scrapePageEmails(base + p)));
      allEmails = [...new Set(subResults.flat())];
    } catch {}
  }

  const googleAds = /gtag\/js\?id=AW-|googleadservices\.com|google_conversion|gtag\('config',\s*'AW-/i.test(html);

  return {
    emails: allEmails,
    team_names: extractTeamNames($),
    services: extractServices($),
    tech_stack: detectTechStack($, html),
    has_contact_form: detectContactForm($),
    google_ads: googleAds,
    detected_tools: detectContractorTools(html),
    scraped_at: new Date().toISOString(),
  };
}

function detectContractorTools(html) {
  const h = html || '';
  return {
    ai_receptionist:
      /cdn\.podium\.com|go\.podium\.com|podium-widget/i.test(h)    ? 'Podium' :
      /embed\.go\.smith\.ai|smith\.ai\/chat/i.test(h)              ? 'Smith.ai' :
      /chat\.callruby\.com|rubyreceptionists\.com/i.test(h)        ? 'Ruby' :
      /answerconnect\.com\/widget/i.test(h)                        ? 'AnswerConnect' :
      /app\.heyrosie\.com|rosie\.ai/i.test(h)                      ? 'Rosie AI' :
      null,

    review_platform:
      /cdn\.birdeye\.com|widget\.birdeye\.com/i.test(h)            ? 'Birdeye' :
      /cdn\.nicejob\.co|nicejob\.com\/widget/i.test(h)             ? 'NiceJob' :
      /grade\.us\/widget|gradeus\.com/i.test(h)                    ? 'Grade.us' :
      null,

    booking_widget:
      /assets\.calendly\.com/i.test(h)                             ? 'Calendly' :
      /app\.housecallpro\.com\/book|housecallpro.*widget/i.test(h) ? 'Housecall Pro' :
      /booking\.servicetitan\.io/i.test(h)                         ? 'ServiceTitan' :
      /app\.setmore\.com|setmore\.com\/embed/i.test(h)             ? 'Setmore' :
      null,

    crm_fsm:
      /servicetitan\.com/i.test(h)                                 ? 'ServiceTitan' :
      /housecallpro\.com/i.test(h)                                 ? 'Housecall Pro' :
      /getjobber\.com|jobber\.com/i.test(h)                        ? 'Jobber' :
      /workiz\.com/i.test(h)                                       ? 'Workiz' :
      null,

    chat_widget:
      /js\.driftt\.com|drift\.com\/messaging/i.test(h)             ? 'Drift' :
      /js\.intercomcdn\.com|widget\.intercom\.io/i.test(h)         ? 'Intercom' :
      /code\.tidio\.co/i.test(h)                                   ? 'Tidio' :
      /cdn\.livechatinc\.com/i.test(h)                             ? 'LiveChat' :
      /client\.crisp\.chat/i.test(h)                               ? 'Crisp' :
      null,
  };
}

async function extractRecentHighlights($, websiteUrl) {
  const highlights = [];
  const bodyText = $('body').text().replace(/\s+/g, ' ');

  // Expansion / new location signals
  const expansionMatch = bodyText.match(
    /(?:new|second|third|additional)\s+location|now\s+serving\s+[A-Z][a-z]+|(?:grand\s+)?opening\s+(?:in|at)\s+[A-Z][a-z]+|expanded?\s+(?:to|into|our\s+service\s+area)/i
  );
  if (expansionMatch) highlights.push(`New location or expansion: "${expansionMatch[0].trim().slice(0, 80)}"`);

  // Award / recognition signals with a year
  const awardMatch = bodyText.match(/(?:voted|award|recognized|#1|top\s+rated|best\s+[a-z ]{1,30}in)\s*[^.]{0,60}(?:2024|2025|2026)/i);
  if (awardMatch) highlights.push(`Award or recognition: "${awardMatch[0].trim().slice(0, 80)}"`);

  // Years in business
  const yearsMatch = bodyText.match(/(\d+)\s*\+?\s*years?\s+(?:in\s+business|of\s+(?:experience|service|serving))/i);
  if (yearsMatch) highlights.push(`Years in business: "${yearsMatch[0].trim()}"`);

  // Blog/news page — try 2 subpages max
  if (websiteUrl) {
    let baseUrl;
    try { baseUrl = new URL(websiteUrl).origin; } catch { baseUrl = null; }
    if (baseUrl) {
      const blogPaths = ['/blog', '/news', '/updates', '/articles'];
      for (const path of blogPaths.slice(0, 2)) {
        try {
          const r = await fetch(baseUrl + path, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FieldStack/1.0)' },
            signal: AbortSignal.timeout(4000),
          });
          if (!r.ok) continue;
          const html = await r.text();
          const $b = cheerio.load(html);
          const titles = [];
          $b('h2, h3, article h1').each((_, el) => {
            const t = $b(el).text().trim();
            if (t.length > 15 && t.length < 120) titles.push(t);
          });
          if (titles.length > 0) {
            highlights.push(`Recent blog post: "${titles[0]}"`);
            break;
          }
        } catch { /* skip — non-fatal */ }
      }
    }
  }

  return highlights.slice(0, 5);
}

module.exports = { scrapeWebsite, extractRecentHighlights };
