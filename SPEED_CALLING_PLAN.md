# Speed Calling UX — Complete Implementation Plan

**Goal:** Transform the Caller page into a frictionless, flow-optimized calling machine. Minimize clicks, maximize rhythm.

---

## Phase 1: Lead Queue + Auto-Advance (High Impact, 2-3 hrs)

**What:** Queue of next 5 hot leads sorted by heat score. One-click dial, auto-loads next lead after outcome logged.

### Backend Changes

**`GET /api/calls/queue`** — New endpoint
```
Query params: service_type?, status?, limit=5, offset=0
Returns: { leads: Lead[] } sorted by heat_score DESC
```
- Filter by service_type if provided
- Filter by status (e.g., "new", "contacted")
- Sort by heat_score DESC
- Limit to 5 leads

**`POST /api/calls/log-and-advance`** — New endpoint (combines 2 steps)
```
Body: { call_id, outcome, lead_id, note? }
Returns: { next_lead: Lead }
```
- Log the call (existing logic from POST `/calls/log`)
- Log activity + update lead status
- Return next lead in queue (next by heat_score)

### Frontend Changes

**`Caller.tsx`:**
- Add "Queue Mode" toggle alongside existing AI/Manual mode
- Display next 5 leads in a sidebar or drawer:
  ```
  [Business Name] · Heat: 85 · City, State
  [Business Name] · Heat: 72 · City, State
  ...
  ```
- Click lead → dial + load script + show lead context card
- After logging outcome → auto-load next lead (no confirmation modal)
- Show current lead index: "3 of 5 in queue"

**Lead Context Card** (before dialing):
```
┌─────────────────────────────┐
│ ABC HVAC                    │
│ Austin, TX · Heat: 85       │
│ Last contacted: 2 days ago  │
│ Phone: (512) 555-1234       │
│ ─────────────────────────── │
│ [Dial] [Skip] [Notes]       │
└─────────────────────────────┘
```

---

## Phase 2: Speed Mode UI (High Impact, 2-3 hrs)

**What:** Fullscreen calling mode with big outcome buttons, minimal clutter.

### Frontend Changes

**`Caller.tsx` Speed Mode Layout:**
```
┌────────────────────────────────────────┐
│         [ABC HVAC · 512-555-1234]      │ (header)
├────────────────────────────────────────┤
│                                        │
│     [Script body in large text]        │ (70% of screen)
│     [Max 2-3 sentences, font 16px]     │
│                                        │ (show script + timer + pace)
├────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐     │ (outcome buttons, 50px tall each)
│ │ Interested   │ │   Callback   │     │
│ └──────────────┘ └──────────────┘     │
│ ┌──────────────┐ ┌──────────────┐     │
│ │  No Answer   │ │  Voicemail   │     │
│ └──────────────┘ └──────────────┘     │
│ ┌──────────────┐                       │
│ │Not Interested│                       │
│ └──────────────┘                       │
└────────────────────────────────────────┘
```

**Features:**
- Toggle button: "Speed Mode" (fullscreen) ↔ "Normal"
- Big outcome buttons (50px tall, tap-friendly)
- Script text large + readable from phone distance
- Call timer in header: "2:15 elapsed"
- Pace projection: "3/min · 45 by 12:30"
- Remove all other UI (sidebar, filters, etc.)

---

## Phase 3: Big Outcome Buttons + Voice Log (Medium Impact, 1.5-2 hrs)

**What:** Tap-to-log outcomes. Optional voice input to auto-log.

### Frontend Changes

**Outcome Buttons:**
- Color-coded: Interested (emerald), Callback (amber), No Answer (zinc), Voicemail (zinc-dark), Not Interested (red)
- On tap:
  1. Log outcome + activity
  2. Show optional note input (optional, can skip)
  3. Auto-load next lead in 500ms

**Voice Log (Optional Phase 3.5):**
- Mic button next to outcome buttons
- Record 10-15s voice note
- Send to Whisper API → transcribe → save to activity
- Lower priority; can defer

---

## Phase 4: Auto-SMS on Outcome (High Value, 2-3 hrs)

**What:** Log outcome → auto-send SMS based on result.

### Backend Changes

**`POST /api/calls/log-and-advance` enhancement:**
- After logging outcome, check lead phone number
- If outcome = "interested" → send SMS: `"Thanks for your time! Here's a link to book a demo: [Calendly/demo link]"`
- If outcome = "not_interested" → send SMS: `"No problem! If things change, save this link for later: [save-for-later link]"`
- If outcome = "voicemail" → send SMS: `"We'll try again soon. In the meantime: [info link]"`
- If outcome = "callback_requested" → send SMS: `"Great! Here's a link to schedule: [Calendly link]"`

**Requires:**
- Demo link (Calendly, Acuity, or custom scheduler)
- SMS sending via Twilio (existing)
- Logic to avoid duplicate SMS (track in `activities` table)

### Frontend Changes
- Show SMS sending status briefly: "SMS sent to (512) 555-1234" toast

---

## Phase 5: Pickup Rate Badge + Streak Counter (Gamification, 30 min)

**What:** Real-time motivation stats during calling session.

### Frontend Changes

**In Speed Mode header or floating widget:**
```
┌────────────────────────┐
│ 8 / 10 pickups · 80%   │  ← pickup rate updates live
│ 3 interested in a row  │  ← streak (resets on non-interested/no-answer)
│ 12 minutes elapsed     │  ← session timer
└────────────────────────┘
```

**Logic:**
- Pickup = interested + callback_requested + not_interested + transferred
- Recalculate on every outcome logged
- Streak = consecutive interested outcomes (reset on other outcome)

---

## Phase 6: Floating Call Widget (Nice-to-Have, 1-2 hrs)

**What:** Keep dialer accessible while taking notes or doing other tasks.

### Frontend Changes

**Floating Widget (bottom-right corner):**
```
┌──────────────┐
│ ABC HVAC     │ (collapsed)
│ 2:15 elapsed │
│ [Expand]     │
└──────────────┘
```

- Click expand → fullscreen Speed Mode
- Collapse → floating widget
- Show current time + lead name
- Shows toast notifications (SMS sent, outcome logged)

---

## Phase 7: Batch Mode + Pace Projection (2-3 hrs)

**What:** "I'm calling 40 leads today" mode. Optimized UI, clear goal.

### Backend Changes

**`POST /api/calls/start-batch`** — New endpoint
```
Body: { target_count: 40, service_type?, status? }
Returns: { batch_id, leads: Lead[5] }
```

### Frontend Changes

**Batch Start Screen:**
```
How many leads do you want to call? [40] ← input
Filter: [All] [HVAC only] [New leads]
[Start Batch]
```

**During Batch:**
```
6 / 40 calls · 15% complete
3.2 calls/min · pace: 48 by 12:30pm
[Skip Batch] or [Pause]
```

- Update pace every 10 seconds
- Show progress bar at top
- On completion or end time → "Batch Complete" screen with stats

---

## Phase 8: Call Timer + Pace Projection Live (1 hr)

**What:** Real-time tracking of speed and projected completion.

### Frontend Changes

**In Speed Mode header:**
```
┌─────────────────────────────┐
│ 2:15 elapsed · 3.2/min pace │
│ On pace for 48 by 12:30 PM  │
└─────────────────────────────┘
```

**Calculation:**
```javascript
const elapsedMinutes = (Date.now() - startTime) / 60000
const callsPerMinute = callsCompleted / elapsedMinutes
const remainingMinutes = (12.5 * 60) - elapsedMinutes  // 12:30 PM target
const projectedTotal = callsCompleted + (callsPerMinute * remainingMinutes)
```

---

## Phase 9: Callback Auto-Schedule (Medium, 2 hrs)

**What:** During call, rep says "call me back Thursday 10am" → auto-creates follow-up.

### Backend Changes

**`POST /api/calls/schedule-callback`** — New endpoint
```
Body: { lead_id, call_id, callback_datetime, notes? }
```
- Creates activity: type="callback_scheduled"
- Updates lead: next_followup_at
- Sends SMS: "Thanks! We'll call you on Thursday at 10 AM"

### Frontend Changes

**After logging "callback_requested" outcome:**
```
┌─────────────────────────┐
│ When should we call     │
│ them back?              │
│ ─────────────────────── │
│ [Thu 10am] [Fri 2pm]    │
│ [Custom date/time]      │
│ [Skip - I'll remember]  │
└─────────────────────────┘
```

- Quick preset buttons (common times)
- Or datepicker for custom
- Auto-sends SMS with callback time

---

## Phase 10: Voice Notes (Lower Priority, 2-3 hrs)

**What:** Tap mic → record note → auto-transcribe → save to activity.

### Backend Changes

**`POST /api/calls/voice-note`** — New endpoint
```
Body: { call_id, audio_blob, mime_type }
Returns: { transcription, activity_id }
```
- Save audio file to storage (or just transcription)
- Call Whisper API
- Create activity: type="note", description=transcription

### Frontend Changes

**During call:**
- Mic icon next to outcome buttons
- Tap → "Recording..." (3-15 sec)
- Release → sends to backend
- Shows: "Note saved: 'Customer interested in next month'"

---

## Database Schema Updates

**`calls` table additions:**
```sql
-- Already exists, but ensure:
outcome TEXT,
created_at TIMESTAMP,
lead_id INTEGER FK,
-- Add if not present:
duration_seconds INTEGER,
call_recording_url TEXT,
batch_id TEXT
```

**`activities` table:**
- Already has type="call_attempt"
- Add type="callback_scheduled", "voice_note"

**New table (optional, for batch tracking):**
```sql
CREATE TABLE call_batches (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  target_count INTEGER,
  completed_count INTEGER,
  service_type TEXT,
  created_at TIMESTAMP
)
```

---

## Implementation Order (MVP → Full)

### **Week 1: MVP (Phases 1-2)**
1. Lead queue endpoint + frontend queue UI (2 hrs)
2. Auto-advance on outcome (1 hr)
3. Speed mode UI — fullscreen, big buttons (2 hrs)
4. Test end-to-end flow: dial → speak → tap outcome → auto-load next

**Deliverable:** Working speed-calling loop, zero friction between calls.

### **Week 2: Polish (Phases 3-5)**
1. Voice log mic button (optional, can skip) (2 hrs)
2. Auto-SMS on outcome (2 hrs)
3. Pickup rate badge + streak (30 min)
4. Batch mode start screen (1 hr)

**Deliverable:** Gamification + persistence (SMS follow-up locked in immediately).

### **Week 3: Nice-to-Haves (Phases 6-10)**
1. Floating widget (1.5 hrs)
2. Pace projection + call timer (1 hr)
3. Callback auto-schedule (2 hrs)
4. Voice notes (2 hrs)

**Deliverable:** Full "pro mode" experience.

---

## Key Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `backend/src/routes/calls.js` | 1, 4, 9, 10 | Add queue, log-and-advance, voice-note, schedule-callback endpoints |
| `frontend/src/pages/Caller.tsx` | 1-9 | Lead queue, speed mode, outcome buttons, floats, batch mode |
| `frontend/src/hooks/useCalls.ts` | 1, 4, 9, 10 | New hooks: useQueue, useLogAndAdvance, useAutoSMS, useVoiceNote |
| `frontend/src/lib/api.ts` | 1, 4, 9, 10 | New API methods |
| `backend/src/db.js` | Schema | Add batch_id, duration_seconds to calls table |
| `backend/.env` | 4 | Calendly/demo link URL config |

---

## Unknowns / Questions for User

1. **Demo link:** What scheduler? (Calendly, Acuity, custom?)
2. **SMS messaging:** What exact copy for each outcome?
3. **Batch target time:** Always 12:30 PM, or configurable?
4. **Callback presets:** Which times? (e.g., "Thu 10am", "Fri 2pm", "Next week")
5. **Voice notes:** Optional or must-have?
6. **Analytics:** Track which features are used most? (batch mode vs normal, speed mode adoption)

---

## Success Metrics

- **Calls per session:** Increase from current baseline by 40-50%
- **Session duration:** Shorter, more focused 90-min sprints
- **Error rate:** Fewer missed SMS, callbacks, outcome logging
- **Flow state:** User reports "didn't check time once"
- **Adoption:** All features used within 2 weeks

---

## Estimated Total Time: 12-15 hours

- **MVP (Phases 1-2):** 5-6 hrs
- **Polish (Phases 3-5):** 4-5 hrs
- **Nice-to-Haves (Phases 6-10):** 5-6 hrs
- **Testing/fixes:** 2-3 hrs

**Recommended split:**
- **Day 1 (Build Block):** Phase 1 + 2 (5-6 hrs) → Deploy Friday morning ✅
- **Day 2 (Build Block):** Phase 3 + 4 + 5 (4-5 hrs) → Deploy by Monday ✅
- **Day 3+ (When bandwidth):** Phases 6-10 (nice-to-haves)

