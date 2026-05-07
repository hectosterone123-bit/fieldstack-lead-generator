# FieldStack Roadmap

## Status Legend
- ✅ Done
- 🔨 In Progress
- 🎯 Next Up
- 💡 Backlog

---

## ✅ Outreach Workflow (Done)

### 1. Bulk Enroll from Lead Table (~1.5 hrs)
**What:** Select N leads in the table → pick a sequence from dropdown → enroll all at once.

**Why:** Right now you have to open each lead individually. With 50 leads to load into a sequence, that's 50 clicks.

**How:**
- Add "Enroll in Sequence" button to the bulk action toolbar (only shows when leads are selected)
- Dropdown lists active sequences
- Calls existing `POST /api/sequences/enroll` with `lead_ids: Array.from(selected)`
- Toast: "Enrolled 47, skipped 3 (already active)"
- No backend changes needed — endpoint already supports bulk

**Files:** `frontend/src/pages/Leads.tsx`, `frontend/src/hooks/useSequences.ts`

---

### 2. Reply Detection — Resend Inbound (~3 hrs)
**What:** When a lead replies to a sequence email, automatically pause their sequence and mark them as `qualified`.

**Why:** Without this, the sequence keeps sending follow-ups to someone who already replied. That's the #1 way to burn a warm lead.

**How:**
- Resend supports inbound email routing (beta) — replies to `reply+{token}@mail.getfieldstack.com` hit a webhook
- Each outbound email gets a unique `reply-to` address with the lead ID encoded
- `POST /api/webhooks/resend-inbound` handler: decode lead ID → call mark-replied → pause all active enrollments → update lead status to `qualified`
- Manual fallback already exists (Mark Replied button in Campaigns queue)

**Files:** `backend/src/routes/webhooks.js`, `backend/src/services/emailService.js`, `frontend/src/pages/Settings.tsx`

**Note:** Resend inbound is in beta — need to enable it in dashboard and set MX records on `mail.getfieldstack.com`.

---

### 3. Auto-send After Step Config in Sequence UI
✅ Already existed — dropdown in SequenceBuilder (Manual / After step 1 / After step 2 / After step 3 / Auto all)

---

## 💡 Lead Generation

### Google Places Integration (~4 hrs)
**What:** Replace/supplement OSM Finder with Google Places API for richer lead data.

**Why:** Google Places returns phone numbers, ratings, review counts, and website URLs more reliably than OSM. The API key placeholder already exists in `.env`.

**How:**
- `POST /api/finder/search-google` endpoint using Google Places Text Search API
- Returns same shape as OSM finder results (drops into existing import flow)
- UI toggle in Finder page: "OSM (free)" vs "Google Places (quota)"
- Rate limit: 1 req/s, cap at 60 results per search

**Files:** `backend/src/routes/finder.js`, `backend/src/services/overpassService.js`, `frontend/src/pages/Finder.tsx`

---

### LinkedIn Profile Scraper (~3 hrs)
**What:** Given a business name + city, find the owner's LinkedIn profile URL.

**Why:** Personalized outreach ("I saw you posted about X on LinkedIn") gets 3x higher reply rates.

**How:**
- Use `serpapi` or `google-search-results` npm package to search `"business name" "city" HVAC site:linkedin.com`
- Store result in `enrichment_data` JSON on the lead
- Show in LeadDrawer under "Intel" section
- Button: "Find LinkedIn" (on-demand, not automatic)

**Files:** `backend/src/services/enrichService.js`, `frontend/src/components/leads/LeadDrawer.tsx`

---

## 💡 Product (Client-Facing)

### Booking Link Variable (~1 hr)
**What:** Add `{booking_url}` as a template variable that inserts a Calendly/Cal.com link.

**Why:** Every sequence should end with a CTA to book. Right now you hardcode the URL in each template.

**How:**
- Add `booking_url` to settings (Settings page, new field)
- Add to `templateService.js` variable rendering
- Add to template variables list (`GET /api/templates/variables`)

**Files:** `backend/src/services/templateService.js`, `backend/src/routes/templates.js`, `frontend/src/pages/Settings.tsx`

---

### Onboarding Checklist (~2 hrs)
**What:** First-time setup guide shown on Dashboard when key settings are missing.

**Why:** When you demo this to a client, they need to set up Twilio + Resend + verify domain + create a sequence. Without guidance they'll get stuck.

**Items:**
1. ✅ Connect Resend (RESEND_API_KEY set)
2. Connect Twilio (TWILIO_* vars set)
3. Verify sending domain (check via Resend API)
4. Create first sequence
5. Import first batch of leads
6. Enroll leads in sequence

**Files:** `frontend/src/pages/Dashboard.tsx`, new `frontend/src/components/OnboardingChecklist.tsx`

---

### Sequence Templates Library (~2 hrs)
**What:** Pre-built sequences for HVAC, roofing, plumbing — one click to clone and use.

**Why:** A new client account starts with zero sequences. Pre-built templates cut onboarding from 30 min to 5 min.

**Templates:**
- HVAC Cold Outreach (7 steps: Loom → email x3 → SMS → email x2)
- Roofing Storm Season (5 steps: urgent email x3 → SMS → email)
- Re-engagement (3 steps: breakup email → SMS → final email)

**Files:** `backend/src/db.js` (seed data), `frontend/src/pages/Sequences.tsx`

---

### White-label / Multi-tenant (~20+ hrs)
**What:** Per-client workspaces with separate lead databases, sequences, and settings.

**Why:** To sell FieldStack as a product (not just use it yourself), each client needs isolation.

**How:** Major architecture change — add `workspace_id` to all tables, auth layer, subdomain routing.

**Status:** Backlog. Build for yourself first, multi-tenant when you have 3+ paying clients.

---

## 💡 Reliability

### Webhook Signature Verification (~1 hr)
**What:** Verify Resend + Twilio webhook signatures before processing.

**Why:** Currently anyone who knows your webhook URL can trigger fake events.

**How:**
- Resend: verify `svix-signature` header using `svix` npm package
- Twilio: verify `X-Twilio-Signature` using `twilio` package's `validateRequest()`

**Files:** `backend/src/routes/webhooks.js`

---

### Error Alerting (~1 hr)
**What:** Email yourself when the scheduler fails to send or hits the daily limit.

**Why:** Right now failures only log to Railway console — you won't know unless you check.

**How:** Add error email via Resend in the scheduler's catch blocks and limit-reached path.

**Files:** `backend/src/services/sequenceScheduler.js`
