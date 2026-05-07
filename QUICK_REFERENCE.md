# FieldStack Workflow Gaps — Quick Reference

## 3 Critical Gaps (Do These First — 9-10 hrs)

| Gap | Problem | Fix | Time | Impact |
|-----|---------|-----|------|--------|
| **1. Callback Queue by Time** | Leads at 2pm don't auto-surface | Queries `next_followup_at`, shows time-sorted queue | 4-5 hrs | 30% of deals |
| **2. Outcome Auto-SMS** | After "callback" outcome, still manual SMS | Auto-send SMS template on callback_requested outcome | 2-3 hrs | 33 hrs/mo saved |
| **3. Callback Kanban** | Can't see 2pm callbacks visually | Calendar/kanban shows callbacks by time slot | 3-4 hrs | Enables 2-person team |

---

## 9 High-Impact Gaps (Nice-to-Have — 18-21 hrs)

### Must-Have Polish (8-9 hrs)
| Gap | Problem | Fix | Time |
|-----|---------|-----|------|
| **4. Real-Time Status** | Manual status updates | Auto-status on call outcome | 2-3 hrs |
| **5. ROI Dashboard** | No revenue visibility | Sum estimated_value by status | 2-3 hrs |
| **6. Bulk Callbacks** | Setting 10 callbacks = 10 clicks | Select → "Batch Callback" → time picker | 1.5 hrs |
| **7. Overdue Alert** | Leads age silently | Cockpit widget + Leads filter | 1.5-2 hrs |

### Nice-to-Have Optimization (10-12 hrs)
| Gap | Problem | Fix | Time |
|-----|---------|-----|------|
| **8. Auto-Load Queue** | Manual lead selection | Preset dropdown: "Quick Start HVAC" | 1.5-2 hrs |
| **9. Call Funnel** | No bottleneck visibility | Funnel chart: dials → pickup → interested → booked | 3-4 hrs |
| **10. Smart Requeue** | Manual per-lead snooze | Bulk snooze by days (1, 7, 30) | 2-3 hrs |
| **11. Call Playback** | Can't hear calls in app | Audio player in LeadDrawer | 2-3 hrs |

### Strategic Feature (8-10 hrs)
| Gap | Problem | Fix | Time |
|-----|---------|-----|------|
| **12. Team Assignment** | Single-user only | Multi-user auth + assigned_to field | 8-10 hrs |

---

## Quick Build Order

### Week 1 (Phase 1A: Critical Workflow) — 9-10 hrs
```
Day 1-2: Callback Queue by Time (4-5 hrs)
Day 2-3: Outcome Auto-SMS (2-3 hrs)
Day 3:   Real-Time Status Auto-Update (2-3 hrs)
```
**Outcome:** Contractor can dial 60 leads, auto-callback 12, auto-send SMS. 80% workflow unlock.

### Week 2 (Phase 1B: Visibility) — 7-8 hrs
```
Day 4:   ROI Dashboard (2-3 hrs)
Day 4-5: Callback Kanban (3-4 hrs)
Day 5:   Overdue Alert (1.5-2 hrs)
```
**Outcome:** Full pipeline visibility. Ready for 2-person team.

### Week 3-4 (Phase 2: Polish) — 10-12 hrs
```
Bulk Callbacks, Auto-Load Queue, Call Funnel, Smart Requeue, Call Playback
```
**Outcome:** All gaps except team mode closed.

### Week 5-6 (Phase 3: Team Mode) — 8-10 hrs
```
Team Assignment & Multi-User Auth
```
**Outcome:** 2-person teams, 2x dialing capacity.

---

## The Ideal vs. Current (Side-by-Side)

### Ideal: 9:00 AM → 9:10 AM (Prep)
```
1. Open system
2. See 40 pre-loaded HVAC "new" leads sorted by heat
3. Start dialing immediately
```
**Current:** ✗ Must manually search/select leads in modal

**Fix:** Auto-load queue preset (Gap 8) — 1.5 hrs

---

### Ideal: 9:10 AM → 10:10 AM (Speed Dial)
```
1. Dial lead
2. Script prompt on screen
3. Listen to lead
4. Click outcome (interested/callback/no-answer/etc)
5. Auto-next to lead #2
```
**Current:** ✓ WORKS

---

### Ideal: 10:10 AM (Post-Call)
```
1. Mark 10 leads "callback" → auto-sends "We'll call at 2pm" SMS
2. Status auto-updates
3. Leads surfaced in callback queue
```
**Current:** ✗ Must manually send SMS, status doesn't auto-update, no callback queue

**Fix:** Gaps 1, 2, 5 (9-10 hrs)

---

### Ideal: 2:00 PM (Callbacks)
```
1. Open "Callbacks" page
2. See all 12 callbacks scheduled for now
3. Dial them (one per agent if team)
4. All marked "callback_in_progress"
5. Outcomes recorded
```
**Current:** ✗ No callback page. Must manually search Leads for next_followup_at=now

**Fix:** Gaps 1, 3 (7-9 hrs)

---

### Ideal: 3:00 PM (Follow-Up)
```
1. Auto-send email to "maybes"
2. Auto-snooze "not interested" to 30 days
3. Auto-reschedule "no answer" to tomorrow
```
**Current:** ✗ Manual per-lead snooze, no bulk actions

**Fix:** Gaps 7, 10 (4 hrs)

---

### Ideal: 4:00 PM (EOD Dashboard)
```
1. See: "60 dials, 42 pickup (70%), 12 interested (20%), 4 booked"
2. See: "Pipeline: $20k, Won: $8.5k, Conversion: 33%"
3. See: "Callbacks show rate: 100%, conversion: 33%"
4. See: "5 leads overdue for follow-up — snooze all?"
```
**Current:** ✓ Stats exist (lead counts), ✗ No revenue, ✗ No funnel, ✗ No overdue alert

**Fix:** Gaps 5, 6, 9, 12 (9-10 hrs)

---

## Backend Checklist

### Already Built (No Changes Needed)
- ✅ `next_followup_at` field in leads table
- ✅ Call outcomes stored (interested, callback_requested, etc.)
- ✅ estimated_value field in leads table
- ✅ Callback scheduling logic (modal exists)
- ✅ SMS sending infrastructure
- ✅ Call recording in VAPI

### Need to Add
- ⚠️ **Gap 1:** GET /api/callbacks/by-time (query leads by next_followup_at range)
- ⚠️ **Gap 2:** Auto-SMS trigger on callback outcome (in leads.js PATCH status)
- ⚠️ **Gap 5:** Auto-status mapping (outcome → next status)
- ⚠️ **Gap 6:** Extend PATCH /api/leads/bulk for callback + snooze actions
- ⚠️ **Gap 9:** GET /api/calls/funnel (aggregate outcomes)

### Nice-to-Have
- ⚠️ **Gap 4:** users table + auth (team mode)

---

## Frontend Checklist

### Already Built (No Changes Needed)
- ✅ Caller page (dial, outcomes)
- ✅ LeadsTable (bulk select, filters)
- ✅ Lead drawer (status, notes, activities)
- ✅ Settings (config)
- ✅ Dashboard (KPIs)

### Need to Add
- ⚠️ **Gap 1:** "Callbacks" page (new route /callbacks)
- ⚠️ **Gap 3:** Callback kanban/timeline component
- ⚠️ **Gap 2:** Toggle in Caller outcome modal "Auto-send SMS?"
- ⚠️ **Gap 6:** Bulk action dropdown: "Batch Callback" + date picker
- ⚠️ **Gap 7:** Cockpit widget for overdue count + filter link
- ⚠️ **Gap 8:** Preset dropdown in Caller "Add Leads" modal
- ⚠️ **Gap 9:** Chart component (funnel)
- ⚠️ **Gap 10:** Bulk snooze dropdown
- ⚠️ **Gap 11:** <audio> player in LeadDrawer activities
- ⚠️ **Gap 5:** Update Dashboard KPI cards with SUM(estimated_value)

---

## Code Locations (Reference)

| Feature | Backend | Frontend |
|---------|---------|----------|
| Leads | `/backend/src/routes/leads.js` | `/frontend/src/pages/Leads.tsx` |
| Calls | `/backend/src/routes/calls.js` | `/frontend/src/pages/Caller.tsx` |
| Dashboard | `/backend/src/routes/stats.js` | `/frontend/src/pages/Dashboard.tsx` |
| LeadsTable | — | `/frontend/src/components/leads/LeadsTable.tsx` |
| LeadDrawer | — | `/frontend/src/components/leads/LeadDrawer.tsx` |
| Cockpit | `/backend/src/routes/cockpit.js` | `/frontend/src/pages/Cockpit.tsx` |
| Sequences | `/backend/src/routes/sequences.js` | `/frontend/src/pages/Sequences.tsx` |

---

## Risk Assessment

### Low Risk (Do First)
- Gaps 1, 2, 5, 6, 8, 10, 12 (overdue only) — query existing fields, add UI
- Tests: Filter by next_followup_at, verify SMS trigger, check status updates

### Medium Risk (Do Second)
- Gaps 3, 9, 11 — new components (kanban, chart, audio player)
- Tests: Kanban drag-drop, funnel calc, audio playback cross-browser

### High Risk (Strategic)
- Gap 4 (Team Mode) — auth + schema changes
- Tests: Multi-user permissions, query filtering, per-user stats

---

## Success Metrics (Post-Build)

### Phase 1A (Week 1)
- Callback show rate: 95%+ (was forgetting 30% before)
- Time-to-callback: avg 15 min (was 30-45 min manual)
- Dialing speed: 60-80 dials/day (was 20-30)

### Phase 1B (Week 2)
- Pipeline visibility: contractors quote ROI confidently
- Overdue reduction: 0 silent leads aging past followup date

### Phase 2 (Week 4)
- Conversion analysis: coaches identify script bottlenecks
- Lead recycling: 80%+ of "not interested" resurface in 30 days

### Phase 3 (Week 6)
- Team capacity: 100% uplift (2 agents doing work of 2.5-3 solo)
- Cost per lead: drops 30% (same spend, 2x dials)

---

## TL;DR

**What's Missing:** Callback workflow is the bottleneck. Leads are cold dialed, but follow-ups are manual, scattered, forgotten.

**Why It Matters:** 30-40% of HVAC revenue comes from callbacks, not cold dials. Automating callback→outcome→followup workflow is the highest ROI.

**What to Build (in order):**
1. **Callback Queue by Time** (9-10 hrs) — Leads scheduled for 2pm auto-surface at 2pm
2. **Outcome Auto-SMS** — Callback scheduled = auto-send confirmation SMS
3. **Callback Kanban** — Visual timeline of callbacks by time slot

**Timeline:** 9-10 hrs = 2 days of work. Then you have 80% of ideal workflow.

**Next:** Add visibility (ROI, funnel) and polish (bulk actions), then team mode.
