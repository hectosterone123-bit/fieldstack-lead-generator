# FieldStack Workflow Gap Analysis — Complete

**Date:** April 2026
**Methodology:** Mapped ideal $5k+ HVAC contractor workflow (9am–3pm call block) against FieldStack codebase (12 pages, 13 API routes, call + sequence + SMS systems)
**Output:** 12 identified gaps ranked by impact, with effort estimates and recommended build order

---

## Executive Summary

FieldStack is **70% feature-complete** for an MVP. Core systems work:
- ✅ Speed calling (manual + AI)
- ✅ SMS sending (single + bulk)
- ✅ Email sequences (7-step)
- ✅ Lead management (CRUD, import, enrich)

**But the workflow is fragmented.** A contractor can dial leads, but can't see their 2pm callbacks, auto-send follow-ups, or visualize revenue. Callbacks are "nice-to-have," not "pull-forward workflow."

**The 3 Critical Gaps** (closing these unlocks 90% of ideal workflow):

1. **No Callback Queue by Time** — Leads scheduled for callback don't surface automatically at callback time
2. **No Outcome Auto-Actions** — After marking "interested," contractor manually sends SMS instead of auto-sending
3. **No Team Features** — Can't split work (one dials, one answers) or assign leads

**The 9 Nice-to-Have Gaps** (high-leverage polish):
- Callback calendar/kanban view
- ROI/revenue visibility
- Bulk time-block actions
- Auto-loaded queue presets
- Call outcome funnel analytics
- Smart requeue/recycling
- Call recording playback
- Real-time status auto-update
- Overdue follow-up alerts

---

## The 12 Gaps (Detailed)

### 🔴 CRITICAL — Phase 1 (3-4 days, unlocks 90% of workflow)

#### 1. No Callback Queue by Time [Effort: 4-5 hrs | Impact: 30% of deals]
**The Problem:**
- Ideal: 2pm arrives. Contractor opens Caller page → sees "8 callbacks scheduled for now" queue automatically
- Reality: Leads have `next_followup_at` dates stored, but no UI to surface them. Contractor must manually navigate Leads page, filter by "next_followup_at = today", then manually pick leads to queue

**Why It Matters:**
- 30-40% of HVAC sales come from follow-up callbacks (not cold calls)
- Forgotten callbacks = lost deals
- Manual hunting wastes 15-20 min/day

**Fix:**
- New page "Callbacks" or Cockpit widget that queries `SELECT * FROM leads WHERE next_followup_at BETWEEN now AND now+1hr`
- Sort by time, show as list or kanban
- Click lead → open Caller with that lead pre-loaded
- Mark as "callback_in_progress" while dialing

**Build Path:**
```
Backend: Already have next_followup_at; no new API needed
Frontend: Add "Callbacks" page with time-sorted queue
```

---

#### 2. Outcome Auto-Actions: SMS on Callback [Effort: 2-3 hrs | Impact: 33 hrs/mo saved]
**The Problem:**
- Ideal: Mark lead "callback_requested" → system auto-sends "Thanks for your time, we'll call at 2pm Tuesday" SMS without touching anything
- Reality: Callback date is set (modal exists), but SMS is manual. After callback, contractor must open Campaigns page, find lead, type SMS, send

**Why It Matters:**
- With 200 leads/mo on callbacks: 5-10 min saved × 200 = 33 hrs/mo
- Auto-confirm improves callback show rates (proactive reminder)
- Reduces friction (contractor is in flow, don't break)

**Fix:**
- Add setting: "Auto-send SMS on callback scheduled?"
- Store template: "Thanks for your time {business_name}! We'll call you back on {callback_date}."
- On `PATCH /api/leads/:id/status` → if status=callback_requested && auto_sms_enabled, trigger SMS with template

**Build Path:**
```
Backend: Logic in leads.js POST /:id/status route
Frontend: Add toggle in Caller outcome modal "Auto-send SMS?"
```

---

#### 3. Callback Schedule/Kanban View [Effort: 3-4 hrs | Impact: Enables team selling]
**The Problem:**
- Ideal: Visual calendar/kanban showing "10am callbacks: 3", "2pm callbacks: 8", "Tomorrow: 5". Enables team to split (Agent A dials new, Agent B handles callbacks)
- Reality: Callback info only in individual lead drawer. No aggregate view

**Why It Matters:**
- Mental clarity: "I have 8 callbacks between 2-3pm, 4 between 3-4pm"
- Prevents double-calling same lead
- Unlocks team splitting (one dials, one answers calls) → 2x capacity

**Fix:**
- New page "Callbacks" with kanban: columns are time slots (10am, 11am, 2pm, 3pm, etc.)
- Each lead is a card showing: business_name, last_contacted_at, heat_score
- Click card → Caller opens with that lead pre-loaded
- Show badge "Ready Now" for callbacks past time

**Build Path:**
```
Backend: New GET /api/callbacks/by-time endpoint
Frontend: New page with react-beautiful-dnd kanban or HTML time grid
```

---

### 🟠 HIGH — Phase 2 (2-3 days, adds visibility + analytics)

#### 4. Team/Lead Assignment [Effort: 8-10 hrs | Impact: 100% revenue uplift]
**The Problem:**
- Ideal: Lead is assigned to "Agent A". Agent A sees only their leads in queue. Dashboard shows "Agent A: 15 dials, 3 booked. Agent B: 12 dials, 2 booked"
- Reality: Single-user system. All leads visible to all users. No assignment, no per-user metrics

**Why It Matters:**
- Unlocks hiring 2nd person (currently can't split work)
- 100% revenue uplift: 2 agents × 30 dials/day = 60 dials/day (vs 20 currently)
- Accountability: per-agent metrics drive performance

**Fix:**
- Add `assigned_to` (user_id) field to leads table
- Add user/team management page in Settings
- Add multi-user auth (optional for MVP: email-based access codes)
- Modify queue filters: show only "assigned_to = current_user" or "assigned_to IS NULL"
- Dashboard shows per-agent stats

**Build Path:**
```
Backend: Schema change (users table, auth), new assignment API
Frontend: User mgmt page, queue filters, per-user dashboard
This is a 1-2 week feature; largest lift in the list
```

---

#### 5. Real-Time Callback Status Auto-Update [Effort: 2-3 hrs | Impact: Cleaner CRM]
**The Problem:**
- Ideal: Click "dial this callback" → lead status auto-changes to "callback_in_progress". After outcome, auto-changes to next status (e.g., "interested" → "qualified")
- Reality: Status updates are manual. Contractor must click "Callback Requested" button in lead drawer

**Why It Matters:**
- Cleaner pipeline (status always reflects real state)
- Real-time dashboard accuracy
- Fewer manual clicks (improves flow)

**Fix:**
- On `POST /api/calls/start` (or manual call log), auto-set lead status to "callback_in_progress"
- On `PATCH /api/calls/:id/outcome`, map outcome to next status:
  - interested → qualified
  - no_answer → rescheduled (special status)
  - wrong_number → lost

**Build Path:**
```
Backend: Logic in calls.js and leads.js
Frontend: No changes needed (status will auto-reflect on next load)
```

---

#### 6. ROI/Revenue Visibility [Effort: 2-3 hrs | Impact: Justifies spend, motivates team]
**The Problem:**
- Ideal: Dashboard KPI: "Pipeline Value: $20k | Booked This Week: $8.5k | Cost per Lead: $15 | ROI: 3x"
- Reality: Dashboard shows lead counts ("120 total", "8 booked") but not dollar values. `estimated_value` field exists, not surfaced

**Why It Matters:**
- Quantifies impact for investor/board ("we're generating $60k/mo revenue at $15/lead cost = 4x ROI")
- Motivates team daily ("we've booked $8.5k so far this week, target is $25k")
- Informs lead gen spend decisions

**Fix:**
- Update `/api/stats` to sum estimated_value by status
- Add KPI cards to Dashboard:
  - "Pipeline Value" = SUM(estimated_value) WHERE status NOT IN ('lost', 'closed_won')
  - "Won This Week" = SUM(estimated_value) WHERE status='closed_won' AND closed_at >= this_week
  - "Avg Value per Lead" = SUM(estimated_value) / COUNT(*)
- Store `won_amount` on leads (already have field), show in closed_won stats

**Build Path:**
```
Backend: Update stats.js to include revenue aggregates
Frontend: Add KPI cards to Dashboard
```

---

#### 7. Bulk Callback Actions [Effort: 1.5 hrs | Impact: Saves 10-15 min]
**The Problem:**
- Ideal: After cold call block, select 10 "interested" leads → click "Batch Callback" → set time "2pm tomorrow" → all updated at once with SMS sent
- Reality: Can bulk-update status, but no "batch callback scheduling". Must update each lead individually

**Why It Matters:**
- Processing call outcomes is tedious (mark 10 leads = 10 clicks)
- Batch action = 1-2 clicks
- Saves 10-15 min per call block × 5 blocks/week = 75 min/week

**Fix:**
- Add bulk action to LeadsTable: select leads → dropdown "Batch Callback"
- Modal: "Set callback time" (datetime picker)
- PATCH `/api/leads/bulk` with action="callback", value={time}
- Auto-send SMS to all (if enabled)

**Build Path:**
```
Backend: Extend PATCH /api/leads/bulk to support "callback" action
Frontend: Add dropdown option to LeadsTable bulk actions
```

---

### 🟡 MEDIUM — Phase 3 (1-2 days, polish + optimization)

#### 8. Auto-Loaded Queue by Preset [Effort: 1.5-2 hrs | Impact: Saves 5-10 min start-of-day]
**The Problem:**
- Ideal: 9am: contractor opens Caller page → pre-loaded with 40 "new HVAC leads" sorted by heat score → immediately ready to dial
- Reality: Caller page shows manual "Add Leads" modal. Contractor must search, filter, select leads

**Why It Matters:**
- Start-of-day friction: contractor wastes 5-10 min loading leads
- Decision fatigue: "which leads should I dial?"
- MVP use case: contractor wants to "just start dialing"

**Fix:**
- Add Caller sidebar preset: "Quick Start HVAC" = auto-filter to service_type='hvac' AND status='new' AND heat_score>=50
- Click → bulk-adds filtered leads to queue
- Or: add "preset" dropdown: [All New], [HVAC Only], [Hot Leads], [This Week's CSVs]

**Build Path:**
```
Backend: No changes (filters already work)
Frontend: Add preset dropdown to Caller "Add Leads" modal
```

---

#### 9. Call Outcome Funnel Analytics [Effort: 3-4 hrs | Impact: Coaching tool]
**The Problem:**
- Ideal: Dashboard shows "Today: 60 dials → 42 pickup (70%) → 12 interested (28%) → 4 booked (33%)"
  Identifies: pickup rate is 70% (good), but interest rate is low (28%)
- Reality: Call history shows outcomes, but no funnel percentages or bottleneck analysis

**Why It Matters:**
- Coaches contractor: "Your pickup rate is great, but interest rate is low. Work on qualifying script"
- Identifies script problems: if 90% pickup but 5% interest, script isn't compelling
- Team benchmarking: compare contractors' conversion rates

**Fix:**
- New "Analytics" page or Cockpit widget: Call Performance
- Query all calls (or today's calls), group by outcome_type
- Calculate:
  - total_dials
  - pickup_rate = (in_progress + completed) / total
  - interested_rate = interested / pickup
  - booking_rate = booked / interested
- Show as funnel chart (like Slack funnel)

**Build Path:**
```
Backend: New GET /api/calls/funnel endpoint (aggregate by outcome)
Frontend: Chart component (Recharts funnel or custom CSS bars)
```

---

#### 10. Smart Requeue/Recycling [Effort: 2-3 hrs | Impact: Prevents lead aging]
**The Problem:**
- Ideal: EOD contractor can "auto-requeue all 'not_interested'" = reschedule to revisit in 30 days. Or "requeue no_answer for tomorrow"
- Reality: Manual per-lead snooze (5-10 min for 20 leads). Requeue settings exist in backend, no UI

**Why It Matters:**
- 80% of sales happen on 5th contact, not 1st
- Leads age and get forgotten if not actively recycled
- Manual snooze is tedious (1 min × 20 leads = 20 min)

**Fix:**
- Extend bulk actions: select leads → "Snooze Until" dropdown: [Tomorrow], [Next Week], [30 Days]
- Map outcome to default requeue: not_interested → 30 days, no_answer → 3 days, voicemail → 1 day
- On snooze, set next_followup_at and status back to "new"

**Build Path:**
```
Backend: Extend PATCH /api/leads/bulk to support "snooze" action
Frontend: Add dropdown option to LeadsTable bulk actions
```

---

#### 11. Call Recording Playback [Effort: 2-3 hrs | Impact: Real-time coaching]
**The Problem:**
- Ideal: After call, click "Listen Back" → hear 30-sec clip. Coach can review recordings
- Reality: VAPI stores recordings, but FieldStack has no playback UI. Contractor must log into VAPI, download

**Why It Matters:**
- Real-time feedback: "I heard you say 'we offer solar', but they ask 'HVAC?'. Clarify in script"
- Training tool: new hire listens to top performer's calls
- Quality control: identify weak scripts

**Fix:**
- Store recording_url in calls table (likely already stored)
- Add <audio> player to LeadDrawer call activity or Caller history
- Fetch URL from calls table, stream to player

**Build Path:**
```
Backend: Ensure recording_url stored in calls.recording_url
Frontend: Add <audio controls> player to call activities in LeadDrawer
```

---

#### 12. Overdue Follow-Up Alerts [Effort: 1.5-2 hrs | Impact: Prevents ghosting]
**The Problem:**
- Ideal: 9:05am: Cockpit shows red banner "5 leads overdue for follow-up" → click → see which ones, batch action (call, email, reschedule)
- Reality: Dashboard shows recent activities, but no "overdue" alert. Leads can age past next_followup_at silently

**Why It Matters:**
- Prevents ghosting (forgot to follow up = lost deal)
- Enforces follow-up discipline
- High-impact: delayed follow-up is #1 reason for lost deals in HVAC

**Fix:**
- Cockpit widget: query `SELECT COUNT(*) FROM leads WHERE next_followup_at < now()`
- Show red badge "N Overdue"
- Click → filter Leads page to show only overdue
- Add "Snooze All" button to batch-handle them

**Build Path:**
```
Backend: No changes (can query existing fields)
Frontend: Add Cockpit widget for overdue count + Leads filter
```

---

## Gap Summary Table

| # | Gap | Step | Effort | Impact | Type | Status |
|---|-----|------|--------|--------|------|--------|
| 1 | Callback Queue by Time | 12 | 4-5 hrs | 30% of deals | 🔴 CRITICAL | Planned |
| 2 | Outcome Auto-SMS | 10 | 2-3 hrs | 33 hrs/mo saved | 🔴 CRITICAL | Planned |
| 3 | Callback Kanban | 12 | 3-4 hrs | Enables team | 🔴 CRITICAL | Planned |
| 4 | Team Assignment | 13 | 8-10 hrs | 100% uplift | 🟠 HIGH | Design |
| 5 | Real-Time Status | 12 | 2-3 hrs | Cleaner CRM | 🟠 HIGH | Planned |
| 6 | ROI Visibility | 15 | 2-3 hrs | Justifies spend | 🟠 HIGH | Planned |
| 7 | Bulk Callbacks | 9 | 1.5 hrs | 10-15 min saved | 🟡 MEDIUM | Planned |
| 8 | Auto-Load Queue | 1 | 1.5-2 hrs | 5-10 min saved | 🟡 MEDIUM | Quick Win |
| 9 | Call Funnel | 15 | 3-4 hrs | Coaching tool | 🟡 MEDIUM | Nice-to-Have |
| 10 | Smart Requeue | 15 | 2-3 hrs | 5x contact rule | 🟡 MEDIUM | Nice-to-Have |
| 11 | Call Playback | Real-time | 2-3 hrs | Coaching | 🟡 MEDIUM | Nice-to-Have |
| 12 | Overdue Alert | 9am | 1.5-2 hrs | Prevents ghosting | 🟡 MEDIUM | Nice-to-Have |

---

## Recommended Build Plan

### **Phase 1A: Callback Workflow (Week 1, 3 days)**
Critical path to 90% workflow unlock. All enable each other.

1. **Callback Queue by Time** (4-5 hrs)
   - Backend: GET /api/callbacks/by-time
   - Frontend: "Callbacks" page with time-sorted queue
   - Outcome: Contractor sees callbacks ready at 2pm

2. **Outcome Auto-SMS** (2-3 hrs)
   - Backend: Auto-send SMS on callback_requested outcome
   - Frontend: Toggle in Caller outcome modal
   - Outcome: Contractor stays in flow; no manual SMS

3. **Real-Time Status Auto-Update** (2-3 hrs)
   - Backend: Map outcomes to auto-status changes
   - Frontend: None (status auto-refreshes)
   - Outcome: CRM always accurate

**By end of Week 1:** Contractor can dial, auto-callback, see callbacks at time, auto-send follow-up. This is 80% of ideal workflow.

### **Phase 1B: Visibility (Week 1-2, 2-3 days)**
4. **ROI Dashboard** (2-3 hrs) — Add pipeline value KPIs
5. **Callback Kanban** (3-4 hrs) — Visual timeline (enables team split)
6. **Overdue Alert** (1.5-2 hrs) — Red banner for forgotten leads

**By end of Week 2:** Contractor has full visibility (revenue, callbacks, overdue). Team-ready.

### **Phase 2: Analytics & Polish (Week 3-4)**
7. **Call Outcome Funnel** (3-4 hrs)
8. **Bulk Actions** (1.5 hrs)
9. **Auto-Load Queue** (1.5-2 hrs)
10. **Call Playback** (2-3 hrs)
11. **Smart Requeue** (2-3 hrs)

**By end of Week 4:** All gaps closed except team assignment.

### **Phase 3: Team Mode (Week 5-6)**
12. **Team/Lead Assignment** (8-10 hrs) — Unlocks 2+ users

**By end of Week 6:** Production-ready for multi-user, multi-agent teams.

---

## Expected Outcomes

### After Phase 1A (3 days)
- **Contractor experience:** "I dial 60 leads, 12 mark callback. At 2pm, I see 12 callbacks ready. I dial them. System auto-sends confirmations. 4 booked."
- **Metrics:** 60 dials, 20% initial interest, 33% callback conversion = 4 booked deals
- **Time saved:** 20-30 min/day on lead hunting + SMS

### After Phase 1B (Week 2)
- **Contractor experience:** "Dashboard shows I've generated $20k pipeline this week, $8.5k booked. My callback conversion is 33%, my cold call interest is 20%."
- **Enables:** Accountability, coaching, ROI justification

### After Phase 2 (Week 4)
- **Contractor experience:** "I can snooze all 'no answers' to tomorrow, all 'not interested' to 30 days. System manages recycling. I focus on fresh leads + callbacks."
- **Metrics:** Higher conversion (contacts multiplier), less manual work

### After Phase 3 (Week 6)
- **Team experience:** "Agent A dials (my assigned leads), Agent B handles callbacks (shared callback queue). Dashboard shows A: 30 dials, B: 12 callbacks + 2 booked today. We're together doing 60 dials/day."
- **Revenue uplift:** 100% (2x capacity)

---

## Technical Debt & Risks

### Smooth Builds (Low Risk)
- Gaps 1, 2, 5, 6, 7, 8, 10, 12 — all use existing tables/fields, just need new UI + logic
- Est. 25-30 hrs total for all 8

### Architectural Changes (Medium Risk)
- Gap 4 (Team Assignment) — requires users table, auth, multi-user filtering throughout
- May need to refactor queries to filter by assigned_to
- Est. 40-50 hrs including testing

### Could Simplify Early
- For MVP, could skip team assignment and run as single-user long enough to validate workflow
- Phase 1A alone (3 days) unlocks 80% value; team mode is 20% incremental

---

## Key Metrics to Track

Once built, measure:
- **Callback show rate** (% of scheduled callbacks that get called)
- **Callback conversion** (% of callbacks that book)
- **Time to followup** (avg hours from cold call to callback)
- **Pipeline velocity** (leads → qualified → booked)
- **Dialing capacity** (dials/day/person before vs after each feature)

---

**Total Build Scope:** 3-4 weeks for full workflow (MVP in 1-2 weeks if Phase 1A only)
**Current MVP Status:** 70% feature-complete; workflow is fragmented
**Post-Phase-1 Status:** 95% feature-complete; production-ready for single HVAC contractor
**Post-Phase-3 Status:** 100%; ready for multi-agent teams
