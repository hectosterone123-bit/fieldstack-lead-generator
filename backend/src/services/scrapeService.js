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

  return {
    emails: extractEmails($),
    team_names: extractTeamNames($),
    services: extractServices($),
    tech_stack: detectTechStack($, html),
    scraped_at: new Date().toISOString(),
  };
}

module.exports = { scrapeWebsite };
