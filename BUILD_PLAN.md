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

- [ ] **4A. Call outcome funnel** (3-4 hrs)
  - New widget in Dashboard or `/analytics` page
  - Shows: Total Dials → Pickups → Interested → Booked (with %)
  - Backend: `GET /api/calls/funnel` aggregates by outcome_type
  - Frontend: simple funnel bars (no heavy chart library needed)

- [ ] **4B. Sequence funnel analytics** (3-4 hrs)
  - Per-sequence: Step 1 sent → opened → clicked → replied (%)
  - Backend: query `email_events` grouped by `sequence_step`
  - Frontend: table view in `Campaigns.tsx` or new Analytics tab

---

## Sprint 5 — Polish (est. ~5 hrs total)

- [ ] **5A. Caller queue presets** (1.5-2 hrs)
  - Quick-start presets in Caller "Add Leads" modal: [All New], [HVAC Hot], [Callbacks Due], [This Week]
  - Frontend: preset chips above lead list in Add Leads modal
  - No backend changes needed

- [ ] **5B. Call recording playback** (2-3 hrs)
  - If `recording_url` exists on call activity → show `<audio>` player
  - Check if VAPI stores this; if yes, fetch + render in `LeadDrawer.tsx`
  - No backend changes if URL is already stored in activities metadata

- [ ] **5C. Missed call text-back** (2 hrs)
  - When Twilio reports a missed inbound call → auto-send SMS to that number
  - "Hey, I just tried to reach you about your [service] request — good time to talk?"
  - Backend: Twilio voice webhook handler → detect `CallStatus=no-answer` on inbound

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
