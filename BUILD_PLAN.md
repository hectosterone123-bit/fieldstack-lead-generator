# FieldStack Build Plan

Consolidated from workflow simulation + agent analysis.
Work through **one item at a time**. Mark done with ✅.

---

## Sprint 1 — Callback Workflow (est. ~10 hrs total)
*Closes the biggest gap: callbacks don't surface automatically*

- ✅ **1A. Callback Queue page** — `/callbacks` page with Overdue + Due Today sections; "Call Now" navigates to `/caller?lead_id=X`; sidebar badge count; Caller auto-loads lead from `?lead_id` param
- ✅ **1B. Outcome Auto-SMS on callback scheduled** — backend already sent SMS; wrapped in `callback_auto_sms_enabled` setting (default ON); toggle in Settings
- ✅ **1C. Overdue follow-up alert on Dashboard** — red banner at top links to `/callbacks` when any leads are overdue

---

## Sprint 2 — Visibility (est. ~5-7 hrs total)
*Contractors need to see revenue impact*

- ✅ **2A. ROI KPI cards on Dashboard** — Pipeline Value card already exists in Dashboard.tsx (stats.pipeline_value)
- ✅ **2B. Email tracking UI in Lead Drawer** — "Email Engagement" section already in LeadDrawer.tsx (lines 997-1067) with opens/clicks/bounces/replied
- ✅ **2C. Send limit display in Campaigns page** — sent_today / daily_limit counter + low-sends warning banner already in Campaigns.tsx

---

## Sprint 3 — Bulk Actions (est. ~4-5 hrs total)
*Save 10-15 min per call block*

- ✅ **3A. Bulk callback scheduling** — backend `action=callback` + inline datetime picker in LeadsTable bulk bar
- ✅ **3B. Bulk snooze/requeue** — backend `action=snooze` + "Snooze..." dropdown (1/3/7/14d) in LeadsTable bulk bar

---

## Sprint 4 — Analytics (est. ~5-7 hrs total)
*Coaching + accountability*

- ✅ **4A. Call outcome funnel** — `GET /api/calls/funnel` endpoint + `CallFunnel` widget on Dashboard (Dials → Pickups → Interested bars, Connect Rate / Interest Rate KPIs)
- ✅ **4B. Sequence funnel analytics** — Already built: Sequences page has full Analytics tab with per-step sent/opened/clicked/replied bars

---

## Sprint 5 — Polish (est. ~5 hrs total)

- ✅ **5A. Caller queue presets** — 4 preset chips (All New, HVAC Hot, Callbacks Due, This Week) in Add Leads modal; backend `auto-load` extended with `filter` param for callbacks_due/this_week queries
- ✅ **5B. Call recording playback** — `call_attempt` activities in LeadDrawer now show duration, outcome badge, and `<audio>` player if `recording_url` exists in activity metadata
- ✅ **5C. Missed call text-back** — Fixed webhook to use `smsService.sendSms()` instead of email; Settings UI + DB seed already existed

---

## Backlog (big lifts, do last)

- [ ] **Team/Lead Assignment** (8-10 hrs) — adds `assigned_to`, multi-user view, per-agent stats
- [ ] **Onboarding Checklist** (2 hrs) — first-time setup guide on Dashboard
- [ ] **Booking link variable** (1 hr) — `{booking_url}` in templates from settings
- [ ] **Webhook signature verification** (1 hr) — Resend/Twilio svix + validateRequest
- [ ] **Google Places integration** (4 hrs) — richer lead data than OSM
- [ ] **White-label / multi-tenant** (20+ hrs) — workspace isolation per client

---

## Done ✅

- ✅ Speed calling (manual + AI cold caller)
- ✅ SMS single + bulk
- ✅ Email sequences (7-step, auto-send)
- ✅ Phone validation + lead enrichment
- ✅ Scoring rules engine
- ✅ Manual caller lead browser modal + `fetchLead` fix
- ✅ Queue persistence on navigation (prevQueueLenRef fix)
- ✅ Clear button in manual caller queue
- ✅ `email_replied` scoring trigger in webhook handler
- ✅ `flushOverdueNow` skip vs fail classification fix
- ✅ Bulk enroll from lead table
- ✅ Reply detection (Resend inbound webhook)
