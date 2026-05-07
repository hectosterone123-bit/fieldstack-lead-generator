# FieldStack Ideal vs. Current Workflow Gaps

## Mapping: Ideal $5k+ HVAC Job Workflow vs. FieldStack Reality

### Ideal Journey (15-Step Process)
```
9:00 AM  [1] Wake up, check 8 new leads from website form → Load in system
9:05 AM  [2] Rank by heat score
9:10 AM  [3-8] Speed dial 20 leads in 1 hour (script prompts, listen, log outcome, auto-next)
9:30 AM  [9] Move "interested" to callback queue (follow up 2pm)
10:10 AM [10] System auto-sends "thanks for your time" SMS
         [11] Creates calendar invite for callbacks
2:00 PM  [12] Callback queue shows scheduled calls ready now
         [13] Team dial/answer (shared queue)
3:00 PM  [14] Send follow-up emails to "maybes"
         [15] Review: 60 dials, 12 interested, 4 booked (67% conversion), $20k pipeline
```

---

## 10 Critical Workflow Gaps

### 1. **No Callback Queue by Time** (Step 9→12)
- **Ideal behavior:** Leads marked "callback at 2pm" automatically surface in a dedicated queue at 2pm; contractor opens queue, all callbacks ready to dial
- **Current behavior:** Callback date is stored on lead, but no time-based queue. Contractor must manually navigate to Leads, filter by "next_followup_at = today", then manually pick leads to callback. No visual "callback queue ready now" dashboard
- **Workaround:** Set a reminder at 2pm, manually filter leads by status, remember which ones had callbacks
- **Effort to fix:** 4-5 hrs (new "Callbacks Today" page or Cockpit widget; real-time filtering by callback time; mark leads as "callback_in_progress" status)
- **Impact:** Saves 15-20 min/day of lead hunting. Prevents forgotten callbacks (lost deals). High contractors use callbacks for 30-40% of booked deals
- **Dependencies:** Callback time is already stored in `next_followup_at` field; just need UI to surface it

---

### 2. **No Outcome-Based Auto Actions** (Step 10)
- **Ideal behavior:** After marking lead "interested" or "callback_requested", system auto-sends "Thanks for your time, we'll call back at 2pm" SMS without contractor touching anything
- **Current behavior:** Callback is scheduled (modal), but SMS is optional/manual. No "outcome → auto-action" pipeline
- **Workaround:** Manual: open Campaigns, type SMS, send individually
- **Effort to fix:** 2-3 hrs (backend: store outcome→SMS template mapping in settings; frontend: add toggle on Caller outcomes modal "Auto-send SMS?"; logic: on outcome=interested/callback, send template if enabled)
- **Impact:** 5-10 min/day saved × 200 leads/mo = saves 16-33 hrs/mo on manual SMS. Improves callback rates (proactive confirmation)
- **Dependencies:** SMS infrastructure exists; just needs outcome trigger + template binding

---

### 3. **No Visual Callback Schedule/Kanban** (Step 12)
- **Ideal behavior:** See calendar view of all callbacks by time slot (10am, 11am, 2pm, etc.) or kanban by status (Ready Now, Later Today, Tomorrow). Click to dial, see who's calling, who's next
- **Current behavior:** No such view. Cockpit shows "hot leads" but not "hot callbacks". Callback queue is per-lead in drawer, not aggregated by time
- **Workaround:** Keep Google Calendar open side-by-side; manually check lead drawer for each callback time
- **Effort to fix:** 3-4 hrs (new page "Callbacks" with time-slot kanban or calendar view; show lead card with name/business/last call. Click = open Caller page with that lead pre-loaded)
- **Impact:** Enables team selling (one agent dials, another answers). Prevents double-calling same lead. Mental clarity: "I have 8 callbacks between 2-3pm, 4 between 3-4pm"
- **Dependencies:** Cockpit checklist + callback time field already exist; just missing visual aggregation

---

### 4. **No Team/Lead Assignment** (Step 13: "One agent dials, another answers")
- **Ideal behavior:** Team splits: Agent A dials new leads (queue mode), Agent B handles callbacks (2pm queue). Leads can be assigned to specific agent. Shared dashboards show "Agent A completed 15 dials, Agent B booked 2 today"
- **Current behavior:** Single-user only. No lead assignment, no per-agent metrics, no shared queue. All calls go to same phone/account
- **Workaround:** Manual: split leads CSV, import to separate instances or use separate logins
- **Effort to fix:** 8-10 hrs (add `assigned_to` field to leads table; add user/team management page; multi-user auth; per-user queue filters and stats)
- **Impact:** Unlocks team scaling. Enables 2-person teams to sell 60 dials/day instead of 20. High-leverage but large feature
- **Dependencies:** Requires database schema change + auth layer; significant architectural work

---

### 5. **No Real-Time Callback Status/CRM Sync** (Step 12 in progress)
- **Ideal behavior:** Contractor dials callback lead. As they dial, lead status auto-updates (clicking "dial" = status "callback_in_progress", outcome recorded = auto-updates to next status). No manual status clicking
- **Current behavior:** Status updates are manual. After outcome, contractor must click "Callback Requested" status button. Lead drawer only refreshes on re-open
- **Workaround:** Remember to manually update status after each callback; leads get stale
- **Effort to fix:** 2-3 hrs (add auto-status logic to Caller: dial = callback_in_progress, outcome (interested) = qualified, callback no-answer = rescheduled)
- **Impact:** Cleaner pipeline. Better conversion tracking. Real-time dashboard accuracy
- **Dependencies:** Status field exists; just needs automation rules

---

### 6. **No ROI/Revenue Visibility** (Step 15: "See $20k in pipeline today")
- **Ideal behavior:** Dashboard shows: "Pipeline value: $20k | Booked this week: $8.5k | Avg value per lead: $1,200 | ROI: 3x (60 dials = 3 booked = $15k revenue)"
- **Current behavior:** Dashboard shows lead counts and conversion %, but NOT dollar value. `estimated_value` field exists but not surfaced. No ROI metric
- **Workaround:** Manual: export leads to spreadsheet, sum estimated_value by status
- **Effort to fix:** 2-3 hrs (add to Dashboard KPI cards: "Pipeline Value: $X", "This Week Won: $Y", "Cost per Lead: $Z"; update stats endpoint to sum estimated_value)
- **Impact:** Quantifies impact for investor/business case. Motivates team daily. Shows ROI on lead gen spend
- **Dependencies:** estimated_value field exists; just needs UI aggregation

---

### 7. **No Bulk Time-Block Actions** (Step 9: "Move 10 interested leads to callback queue")
- **Ideal behavior:** Select 10 leads → click "Batch Callback" → set time "2pm" → all updated at once with SMS sent
- **Current behavior:** Can bulk-update status, but no "batch callback scheduling". Must update each lead individually via drawer or settings
- **Workaround:** Manual: open each lead, set callback time individually (10× actions)
- **Effort to fix:** 1.5 hrs (add bulk action to LeadsTable: select leads → dropdown "Batch Callback" → modal for time → bulk PATCH endpoint)
- **Impact:** Saves 10-15 min when processing cold call outcomes. Reduces errors (mismatched times)
- **Dependencies:** Callback scheduling already built; just needs bulk UI wrapper

---

### 8. **No Auto-Loaded Queue by Lead Source** (Step 1→3: "Load 40 leads, start dialing")
- **Ideal behavior:** 9am: contractor opens Caller page → queue pre-loads 40 "new" leads (sorted by heat score, filtered by service_type="hvac") → immediately ready to dial. No manual lead selection
- **Current behavior:** Caller page shows manual "Add Leads" modal. Contractor must search, filter, select leads to queue. Tedious. No preset queue by source
- **Workaround:** Import specific CSV, start dialing. Or manually add leads one-by-one via modal
- **Effort to fix:** 1.5-2 hrs (add sidebar preset: "Quick Start HVAC Pipeline" = auto-filter to service_type=hvac AND status=new AND heat_score>=50, bulk-add to queue)
- **Impact:** Saves 5-10 min at start of call block. Reduces decision fatigue. Enables contractors to "start dialing" immediately
- **Dependencies:** Queue system exists; just needs UI shortcut

---

### 9. **No Call Outcome Funnel Analytics** (Step 15: "67% conversion, 12 interested")
- **Ideal behavior:** Dashboard shows: "Today: 60 dials → 42 pickup (70%) → 12 interested (28% of pickup, 20% of dials) → 4 booked (33% of interested)". See conversion by outcome type. Identify bottlenecks
- **Current behavior:** Call history shows individual outcomes, but no funnel/conversion percentages. Stats dashboard has overall conversion %, but not call-outcome-specific breakdown
- **Workaround:** Manual spreadsheet analysis of call history
- **Effort to fix:** 3-4 hrs (add "Call Analytics" page or Cockpit widget; query call outcomes grouped by type, compute % of total; show funnel chart)
- **Impact:** Coaching tool. Identify where contractors lose deals (pickup rate vs interest rate). Optimize scripts
- **Dependencies:** Call history + outcomes exist; just needs aggregation view

---

### 10. **No Lead Recycling/Smart Requeue** (Step 15 continuation: "Plan tomorrow's follow-ups")
- **Ideal behavior:** At EOD, contractor can "auto-requeue" all "not_interested" leads to revisit in 30 days, or "no_answer" to retry tomorrow. System intelligently reschedules based on outcome type + contractor prefs
- **Current behavior:** Manual snooze per lead (5-10 min for 20 leads). No smart requeue logic. Leads marked "lost" are forgotten unless manually updated. Requeue settings exist in backend but no UI
- **Workaround:** Manual: snooze each lead individually or use backend requeue feature in settings
- **Effort to fix:** 2-3 hrs (add bulk snooze action: select leads → "Snooze until tomorrow" / "Snooze 30 days" / "Mark lost + requeue"; UI: select leads → bulk action → date picker)
- **Impact:** Saves 15-20 min EOD. Improves follow-up discipline. Increases conversion (80% of sales happen on 5th contact, not 1st)
- **Dependencies:** Snooze/requeue backend ready; just needs better UI

---

### 11. **No Call Recording Playback in UI** (Real-time coaching)
- **Ideal behavior:** During/after call, contractor can click "Listen Back" → hear 30-sec clip of call (what they said, lead's response). Immediate feedback. Coach can review recordings
- **Current behavior:** VAPI stores recordings, but FieldStack has no playback UI. Contractor can't hear calls within the app
- **Workaround:** Manual: log into VAPI dashboard separately, find call, download, listen
- **Effort to fix:** 2-3 hrs (add audio player to LeadDrawer activity timeline or Caller history; fetch recording URL from calls table, stream to <audio> element)
- **Impact:** Unlocks real-time coaching. Improves call quality fast. Training tool for team
- **Dependencies:** VAPI integration exists; just needs frontend audio player

---

### 12. **No Overdue Follow-Up Alerts** (Workflow continuity)
- **Ideal behavior:** 9:05am: Cockpit shows banner "5 leads overdue for follow-up" (red). Click → see which ones, why. Contractor can batch-action them (call, email, reschedule)
- **Current behavior:** Dashboard has "recent activities" but no "overdue follow-ups" alert. Leads can age past `next_followup_at` silently. Contractor discovers by manually sorting
- **Workaround:** Manual: go to Leads, sort by next_followup_at, check for past dates
- **Effort to fix:** 1.5-2 hrs (add Cockpit widget: query leads WHERE next_followup_at < now(); show count badge; click → filter Leads page to overdue only)
- **Impact:** Prevents ghosting. Forces timely follow-up discipline. High-impact for conversion (delays = lost deals)
- **Dependencies:** Follow-up date field exists; just needs alert UI

---

## Summary Table

| Gap | Step | Ideal | Current | Effort | Impact | Priority |
|-----|------|-------|---------|--------|--------|----------|
| 1. Callback Queue by Time | 12 | Time-sorted queue | Manual search | 4-5 hrs | Saves 15-20 min/day; 30% of deals | 🔴 CRITICAL |
| 2. Outcome Auto-Actions (SMS) | 10 | Auto-send "thanks" SMS | Manual SMS | 2-3 hrs | 5-10 min/day × 200 leads = 33 hrs/mo | 🔴 CRITICAL |
| 3. Callback Schedule/Kanban | 12 | Calendar/kanban view | Per-lead drawer | 3-4 hrs | Enables 2-person team selling | 🔴 CRITICAL |
| 4. Team/Lead Assignment | 13 | Multi-user, assigned leads | Single-user only | 8-10 hrs | Unlocks 2x dialing capacity | 🟠 HIGH |
| 5. Real-Time Callback Status | 12 | Auto-status on dial | Manual updates | 2-3 hrs | Cleaner pipeline, real-time dashboard | 🟠 HIGH |
| 6. ROI/Revenue Visibility | 15 | Dollar value on dashboard | Counts only | 2-3 hrs | Justifies spend, motivates team | 🟠 HIGH |
| 7. Bulk Callback Actions | 9 | Select 10, batch-set time | One-by-one | 1.5 hrs | Saves 10-15 min | 🟡 MEDIUM |
| 8. Auto-Loaded Queue | 1→3 | Pre-filter HVAC new leads | Manual selection | 1.5-2 hrs | Saves 5-10 min start-of-day | 🟡 MEDIUM |
| 9. Call Outcome Funnel | 15 | Conversion % by outcome | Individual only | 3-4 hrs | Coaching tool, identifies bottlenecks | 🟡 MEDIUM |
| 10. Smart Requeue/Recycling | 15 EOD | Auto-requeue by logic | Manual snooze | 2-3 hrs | Saves 15-20 min, 5x contact rule | 🟡 MEDIUM |
| 11. Call Playback UI | Real-time | Listen in app | VAPI dashboard only | 2-3 hrs | Real-time coaching | 🟡 MEDIUM |
| 12. Overdue Alert | 9:05am | Red banner + batch action | Silent aging | 1.5-2 hrs | Prevents ghosting | 🟡 MEDIUM |

---

## Recommended Build Order (by ROI)

### Phase 1: Callback Workflow (3-4 days) 🔴 CRITICAL
1. **Callback Queue by Time** (4-5 hrs) — Sort leads by `next_followup_at`, surface as dedicated queue
2. **Outcome Auto-SMS** (2-3 hrs) — Trigger SMS on callback_requested outcome
3. **Callback Schedule/Kanban** (3-4 hrs) — Visual calendar/kanban of callbacks by time slot

**Impact:** 30-50% of HVAC sales come from callbacks. This unlock is revenue-immediate.

### Phase 2: Analytics & Visibility (2-3 days) 🟠 HIGH
4. **ROI/Revenue Dashboard** (2-3 hrs) — Add pipeline value to KPI cards
5. **Call Outcome Funnel** (3-4 hrs) — Funnel chart of dials → pickups → interested → booked
6. **Overdue Follow-Up Alerts** (1.5-2 hrs) — Cockpit banner for leads past `next_followup_at`

**Impact:** Data-driven selling. Identifies where to coach contractors.

### Phase 3: Scaling/Team Features (1-2 weeks) 🔴 HIGH
7. **Team/Lead Assignment** (8-10 hrs) — Multi-user, per-agent queues, shared dashboards

**Impact:** Unlocks 2-person teams. 100% revenue uplift (2x dialing).

### Phase 4: Polish (1-2 days) 🟡 MEDIUM
8. **Real-Time Callback Status Auto-Update** (2-3 hrs)
9. **Bulk Callback Actions** (1.5 hrs)
10. **Auto-Loaded Queue Presets** (1.5-2 hrs)
11. **Smart Requeue** (2-3 hrs)
12. **Call Playback UI** (2-3 hrs)

---

## Key Insight

**The Ideal Workflow requires 3 critical features that unlock 90% of value:**
1. **Callback Queue by Time** — makes follow-ups automatic, not manual
2. **Outcome Auto-Actions** — turns cold calls into warm follow-ups
3. **Team/Lead Assignment** — 2x the revenue with same person (one dials, one handles callbacks)

All other gaps are high-leverage optimizations, but these 3 close the loop from "lead in → 60% conversion" to "lead in → contract signed."

---

**Total Implementation Time:** 3-4 weeks for all gaps (MVP phase 1 + 2 = 5-7 days, full suite = 3-4 weeks)
**Estimated ROI:** $5k+ per contractor per month (if 3-person team × 4 booked deals × $5k avg = $60k/mo revenue impact)
