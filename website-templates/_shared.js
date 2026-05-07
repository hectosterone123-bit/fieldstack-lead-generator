// ============================================================
// FIELDSTACK — SHARED NAV + FOOTER + UTILITIES
// Included by every page. Requires config.js to be loaded first.
// ============================================================

// ── Shared SVG icons ──────────────────────────────────────
const ICONS = {
  phone:    '<path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  pin:      '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
  email:    '<path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>',
  shield:   '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>',
  check:    '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>',
  arrow:    '<path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/>',
  bulb:     '<path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>',
  star:     '<path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>',
  ac:       '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1M4.22 4.22l.707.707m12.728 12.728l.707.707M1 12h2m18 0h2M4.22 19.78l.707-.707m12.728-12.728l.707-.707M9 12a3 3 0 116 0 3 3 0 01-6 0z"/>',
  heat:     '<path stroke-linecap="round" stroke-linejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"/>',
  install:  '<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
  tune:     '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>',
  emergency:'<path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>',
  air:      '<path stroke-linecap="round" stroke-linejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>',
  clock2:   '<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>',
};

// ── Icon helper ──────────────────────────────────────────
function icon(name, cls = "w-5 h-5") {
  return `<svg class="${cls}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">${ICONS[name] || ICONS.bulb}</svg>`;
}

// ── Star HTML ────────────────────────────────────────────
function stars(n = 5, cls = "w-5 h-5") {
  return Array(n).fill(0).map(() =>
    `<svg class="${cls}" style="color:#FBBF24" viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
    </svg>`
  ).join('');
}

// ── Path helper (relative from any depth) ───────────────
// depth: 0 = root, 1 = services/ or areas/, etc.
let PAGE_DEPTH = 0;
function root(path = '') {
  const prefix = PAGE_DEPTH === 0 ? './' : '../';
  return prefix + path;
}

// ── Render NAV ───────────────────────────────────────────
function renderNav(opts = {}) {
  // opts.activePage: 'home'|'about'|'contact'|'services'|'areas'
  // opts.breadcrumb: [{label, href}]
  const phoneHref = `tel:${CONFIG.phoneRaw}`;
  const homePath  = root('index.html');

  document.getElementById('top-bar').innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between text-sm">
      <div class="flex items-center gap-5 text-gray-400">
        <span class="flex items-center gap-1.5">
          ${icon('clock','w-4 h-4 text-orange-500 flex-shrink-0')}
          Mon–Sat 7am–8pm · Emergency 24/7
        </span>
        <span class="hidden sm:flex items-center gap-1.5">
          ${icon('pin','w-4 h-4 text-orange-500 flex-shrink-0')}
          Serving ${CONFIG.city}, ${CONFIG.state}
        </span>
      </div>
      <a href="${phoneHref}" class="flex items-center gap-2 font-semibold text-orange-500 hover:text-orange-400 transition-colors">
        ${icon('phone','w-4 h-4')} ${CONFIG.phone}
      </a>
    </div>`;

  document.getElementById('nav-inner').innerHTML = `
    <div class="flex items-center justify-between h-16">
      <a href="${homePath}" class="flex items-center gap-2.5 flex-shrink-0">
        <div class="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
          ${icon('bulb','w-5 h-5 text-white')}
        </div>
        <span class="text-white font-bold text-lg leading-none">${CONFIG.businessName}</span>
      </a>
      <div class="hidden md:flex items-center gap-7 text-sm font-medium text-gray-400">
        <a href="${homePath}#services" class="hover:text-white transition-colors">Services</a>
        <a href="${root('about.html')}" class="hover:text-white transition-colors">About</a>
        <a href="${homePath}#reviews"  class="hover:text-white transition-colors">Reviews</a>
        <a href="${homePath}#areas"    class="hover:text-white transition-colors">Areas</a>
        <a href="${root('contact.html')}" class="hover:text-white transition-colors">Contact</a>
      </div>
      <div class="flex items-center gap-3">
        <a href="${phoneHref}" class="hidden md:flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-all shadow-lg shadow-orange-500/20">
          ${icon('phone','w-4 h-4')} ${CONFIG.phone}
        </a>
        <button id="hamburger" class="md:hidden p-2 text-gray-400 hover:text-white transition-colors rounded-lg" aria-label="Menu">
          <svg id="ham-open"  class="w-6 h-6"        fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
          <svg id="ham-close" class="w-6 h-6 hidden" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div id="mobile-menu" class="hidden md:hidden bg-navy-900 border-t border-white/[0.07] px-4 pt-2 pb-4">
      <div class="flex flex-col gap-0.5 text-sm font-medium">
        <a href="${homePath}#services" class="mob-link text-gray-400 hover:text-white py-2.5 transition-colors">Services</a>
        <a href="${root('about.html')}" class="mob-link text-gray-400 hover:text-white py-2.5 transition-colors">About</a>
        <a href="${homePath}#reviews"  class="mob-link text-gray-400 hover:text-white py-2.5 transition-colors">Reviews</a>
        <a href="${homePath}#areas"    class="mob-link text-gray-400 hover:text-white py-2.5 transition-colors">Areas</a>
        <a href="${root('contact.html')}" class="mob-link text-gray-400 hover:text-white py-2.5 transition-colors">Contact</a>
        <a href="${phoneHref}" class="mt-3 flex items-center justify-center gap-2 bg-orange-500 text-white font-bold py-3.5 rounded-xl">
          ${icon('phone','w-5 h-5')} Call Now — ${CONFIG.phone}
        </a>
      </div>
    </div>`;

  // Breadcrumb
  if (opts.breadcrumb && opts.breadcrumb.length) {
    const bc = document.getElementById('breadcrumb');
    if (bc) {
      bc.innerHTML = `<nav class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 text-sm text-gray-500">
        <a href="${homePath}" class="hover:text-orange-500 transition-colors">Home</a>
        ${opts.breadcrumb.map(b => `
          <span class="text-gray-600">›</span>
          ${b.href ? `<a href="${b.href}" class="hover:text-orange-500 transition-colors">${b.label}</a>` : `<span class="text-gray-300">${b.label}</span>`}
        `).join('')}
      </nav>`;
    }
  }

  // Hamburger toggle
  document.getElementById('hamburger').addEventListener('click', () => {
    const m = document.getElementById('mobile-menu');
    const open = m.classList.toggle('hidden');
    document.getElementById('ham-open').classList.toggle('hidden', !open);
    document.getElementById('ham-close').classList.toggle('hidden', open);
  });
  document.querySelectorAll('.mob-link').forEach(l => {
    l.addEventListener('click', () => {
      document.getElementById('mobile-menu').classList.add('hidden');
      document.getElementById('ham-open').classList.remove('hidden');
      document.getElementById('ham-close').classList.add('hidden');
    });
  });
}

// ── Render FOOTER ────────────────────────────────────────
function renderFooter() {
  const phoneHref = `tel:${CONFIG.phoneRaw}`;
  const homePath  = root('index.html');
  document.getElementById('footer-inner').innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
        <div class="col-span-2 md:col-span-1">
          <div class="flex items-center gap-2.5 mb-3">
            <div class="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center">
              ${icon('bulb','w-5 h-5 text-white')}
            </div>
            <span class="text-white font-bold text-lg">${CONFIG.businessName}</span>
          </div>
          <p class="text-gray-500 text-sm leading-relaxed">${CONFIG.city}'s trusted HVAC service since ${CONFIG.yearFounded}. Licensed, insured, NATE certified.</p>
        </div>
        <div>
          <h4 class="text-gray-300 font-semibold text-sm uppercase tracking-wider mb-4">Services</h4>
          <ul class="space-y-2.5 text-gray-500 text-sm">
            ${CONFIG.services.map(s => `<li><a href="${root('services/')}${s.slug}.html" class="hover:text-gray-300 transition-colors">${s.name}</a></li>`).join('')}
          </ul>
        </div>
        <div>
          <h4 class="text-gray-300 font-semibold text-sm uppercase tracking-wider mb-4">Company</h4>
          <ul class="space-y-2.5 text-gray-500 text-sm">
            <li><a href="${root('about.html')}"   class="hover:text-gray-300 transition-colors">About Us</a></li>
            <li><a href="${homePath}#reviews"     class="hover:text-gray-300 transition-colors">Reviews</a></li>
            <li><a href="${homePath}#areas"       class="hover:text-gray-300 transition-colors">Service Areas</a></li>
            <li><a href="${homePath}#faq"         class="hover:text-gray-300 transition-colors">FAQ</a></li>
            <li><a href="${root('contact.html')}" class="hover:text-gray-300 transition-colors">Contact</a></li>
            <li><a href="${root('privacy.html')}" class="hover:text-gray-300 transition-colors">Privacy Policy</a></li>
          </ul>
        </div>
        <div>
          <h4 class="text-gray-300 font-semibold text-sm uppercase tracking-wider mb-4">Contact</h4>
          <ul class="space-y-2.5 text-sm">
            <li><a href="${phoneHref}" class="text-orange-500 font-bold hover:text-orange-400 transition-colors">${CONFIG.phone}</a></li>
            <li><a href="mailto:${CONFIG.email}" class="text-gray-500 hover:text-gray-300 transition-colors text-xs break-all">${CONFIG.email}</a></li>
            <li><span class="text-gray-500 text-xs">${CONFIG.address}, ${CONFIG.city} ${CONFIG.state} ${CONFIG.zip}</span></li>
          </ul>
        </div>
      </div>
      <div class="border-t border-white/[0.07] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
        <p>© ${new Date().getFullYear()} ${CONFIG.businessName}. All rights reserved. TX License #${CONFIG.licenseNum}</p>
        <p>Powered by <a href="https://fieldstack.io" class="text-orange-500 hover:text-orange-400 transition-colors">FieldStack</a></p>
      </div>
    </div>`;
}

// ── Render MOBILE STICKY BAR ─────────────────────────────
function renderStickyBar(contactPath = 'contact.html') {
  const el = document.getElementById('sticky-bar');
  if (!el) return;
  el.innerHTML = `
    <div class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-navy-950/95 backdrop-blur-md border-t border-white/10 px-4 py-3 flex gap-3">
      <a href="tel:${CONFIG.phoneRaw}" class="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-orange-500/40">
        ${icon('phone','w-5 h-5')} Call Now
      </a>
      <a href="${root(contactPath)}" class="flex-1 flex items-center justify-center gap-2 bg-white/[0.08] border border-white/20 text-white font-semibold py-3.5 rounded-2xl transition-all">
        ${icon('calendar','w-5 h-5')} Get Estimate
      </a>
    </div>
    <div class="md:hidden h-20"></div>`;
}

// ── Render CONTACT FORM ──────────────────────────────────
function renderContactForm(containerId, redirectPath = 'thank-you.html') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <form id="contact-form" action="https://formspree.io/f/${CONFIG.formspreeId}" method="POST" class="space-y-4">
      <input type="hidden" name="_next" value="${root(redirectPath)}" />
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">First Name</label>
          <input type="text" name="firstName" required placeholder="John"
            class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Last Name</label>
          <input type="text" name="lastName" required placeholder="Smith"
            class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition" />
        </div>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
        <input type="tel" name="phone" required placeholder="(512) 555-0000"
          class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Service Needed</label>
        <select name="service" class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition">
          <option value="">Select a service...</option>
          ${CONFIG.services.map(s => `<option>${s.name}</option>`).join('')}
          <option>Other</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Message <span class="text-gray-400 font-normal">(optional)</span></label>
        <textarea name="message" rows="3" placeholder="Describe your issue..."
          class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition resize-none"></textarea>
      </div>
      <button type="submit" class="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl text-lg transition-all shadow-xl shadow-orange-500/30">
        Request Free Estimate
      </button>
      <p class="text-xs text-gray-400 text-center">We respond within 5 minutes. No spam, ever.</p>
    </form>
    <div id="form-success" class="hidden text-center py-10">
      <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <h4 class="text-xl font-black text-gray-900 mb-2">Request Sent!</h4>
      <p class="text-gray-500">We'll call you within 5 minutes. Check your texts for a confirmation.</p>
    </div>`;

  // Form submit handler
  document.getElementById('contact-form').addEventListener('submit', async e => {
    if (CONFIG.formspreeId === 'YOUR_FORM_ID') return;
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.textContent = 'Sending…';
    btn.disabled = true;
    try {
      const res = await fetch(e.target.action, {
        method: 'POST', body: new FormData(e.target),
        headers: { Accept: 'application/json' }
      });
      if (res.ok) {
        document.getElementById('contact-form').classList.add('hidden');
        document.getElementById('form-success').classList.remove('hidden');
      } else {
        btn.textContent = 'Error — Try Again';
        btn.disabled = false;
      }
    } catch {
      btn.textContent = 'Error — Try Again';
      btn.disabled = false;
    }
  });
}

// ── FAQ accordion (reusable) ─────────────────────────────
function renderFAQ(containerId, faqData) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = faqData.map((item, i) => `
    <div class="py-5 border-b border-gray-100 last:border-0">
      <button class="faq-btn w-full flex items-start justify-between text-left gap-4 group" data-i="${i}">
        <span class="font-bold text-gray-900 text-lg group-hover:text-orange-500 transition-colors">${item.q}</span>
        <svg class="faq-chevron w-5 h-5 text-gray-400 flex-shrink-0 mt-1 transition-transform duration-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div class="faq-body overflow-hidden transition-all duration-300 max-h-0">
        <p class="text-gray-500 pt-3 leading-relaxed pb-1">${item.a}</p>
      </div>
    </div>`).join('');

  el.addEventListener('click', e => {
    const btn = e.target.closest('.faq-btn');
    if (!btn) return;
    const i      = btn.dataset.i;
    const body   = btn.nextElementSibling;
    const chev   = btn.querySelector('.faq-chevron');
    const isOpen = body.style.maxHeight && body.style.maxHeight !== '0px';
    // close all
    el.querySelectorAll('.faq-body').forEach(b => { b.style.maxHeight = '0px'; });
    el.querySelectorAll('.faq-chevron').forEach(c => { c.style.transform = ''; });
    if (!isOpen) {
      body.style.maxHeight = body.scrollHeight + 'px';
      chev.style.transform = 'rotate(180deg)';
    }
  });
}

// ── Shared page shell (head boilerplate) ─────────────────
// Call this from <head> to inject Tailwind + fonts config
function injectHeadStyles() {
  // Tailwind config is injected via inline <script> in each page
}
