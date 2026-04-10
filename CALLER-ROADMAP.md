# AI Cold Caller — Feature Roadmap

> Last updated: 2026-04-09
> Status key: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Already Built

- [x] VAPI outbound calls with Claude Haiku
- [x] Voicemail drop (configurable message, plays + hangs up)
- [x] Best time windows (8–10 AM, 4–6 PM in lead's local timezone)
- [x] Local presence dialing (state → phone number ID map)
- [x] Max call duration cap (configurable in Settings)
- [x] reportOutcome tool (AI logs outcome + next step + key intel during call)
- [x] Listen In (real-time audio via Twilio Media Stream WebSocket + Web Audio API)
- [x] Jump In / takeover (transfer to fallback phone via VAPI control message)
- [x] Auto-advance queue (8s countdown after each call)
- [x] Post-call outcome buttons (manual override)
- [x] Post-call SMS follow-up (auto-sent on voicemail, no_answer, interested, callback)
- [x] Call notes (saved to activities during or after call)
- [x] DNC marking
- [x] AI Report panel (next step + key intel from AI)
- [x] Call timer + today's stats
- [x] Whisper coaching backend (`POST /api/calls/:id/whisper` → injects system msg to AI mid-call)
- [x] Gatekeeper outcome + auto-schedule 7:30 AM callback next business day
- [x] Bulk outcome override (`PATCH /api/calls/bulk/outcome`)
- [x] Manual call logging (`POST /api/calls/log-manual`)
- [x] AI objection coach backend (`POST /api/calls/coach` → Claude Haiku returns 1-2 sentence rebuttal)
- [x] Callback scheduling with SMS confirmation (`POST /api/calls/schedule-callback`)
- [x] Outcome SMS sender (`POST /api/calls/outcome-sms`)
- [x] Auto-load queue from top leads by heat score (`POST /api/calls/queue/auto-load`)
- [x] Scheduled queue items (`scheduled_for` column — queue skips future-dated items)
- [x] Phone validation gating (`phone_valid != 0` check before queuing/calling)
- [x] Campaign mode setting (toggle + daily cap in Settings)
- [x] Speed-to-lead setting (toggle + script selector in Settings)
- [x] firstMessage setting (configurable AI opener in Settings)
- [x] No-answer retry cap setting (`vapi_max_no_answer_attempts` in Settings)
- [x] Daily call goal setting (in Settings)
- [x] Voice note transcription via Whisper (`POST /api/calls/voice-note`)

---

## Tier 1 — High Impact, Low Effort

### [ ] Whisper UI
Backend is done. Just need the frontend input + send button.
- Add a text input + "Whisper" button in the active call panel (only visible during `in_progress`)
- `POST /api/calls/:id/whisper` with `{ message }` — already works
- ~30 min work

### [ ] Recording Playback
Play back `recording_url` directly in the call history row.
- Add a play button in "Today's Calls" — clicking shows an `<audio>` element
- `recording_url` already stored in DB after every call
- No backend changes

### [ ] Live Transcript During Call
Show words appearing in real-time instead of "Transcript will appear after call ends."
- VAPI sends `{ event: 'transcript', transcript: { text, role, isFinal } }` over the monitor WebSocket alongside audio frames
- Parse these in the existing `ws.onmessage` handler (Listen In already connects to that WebSocket)
- Append final lines to a `liveLines` state array, render in the transcript box
- No backend changes — but requires Listen In to be active

### [ ] Campaign Mode Backend
Settings UI is done, but the cron that actually fires calls isn't wired up yet.
- Backend cron (every 5 min): check `vapi_campaign_enabled`, calling window, `active_calls_today < cap`, queue not empty → call `vapiService.startCall()`
- Use `node-cron` or a `setInterval` in `server.js`

### [ ] Speed-to-Lead Backend
Settings UI is done. The auto-queue trigger on lead creation isn't wired yet.
- In `POST /api/leads`, after insert: if `speed_to_lead_enabled === '1'` and lead has phone and within calling window → insert into `call_queue`

### [ ] firstMessage Backend
Settings UI is done. `vapiService.js` doesn't read it yet.
- In `vapiService.js`: read `vapi_first_message` from settings → if set, run `renderTemplate()` on it → set `assistantConfig.firstMessage`

### [ ] No-Answer Retry Cap Backend
Settings UI is done. The auto-DNC logic isn't wired yet.
- In `webhooks.js` `end-of-call-report`: if outcome is `no_answer` or `voicemail`, count how many times this lead has had that outcome → if >= cap, set `dnc_at`

---

## Tier 2 — High Impact, Medium Effort

### [ ] Objection Coach UI
Backend is done (`POST /api/calls/coach`). Need the frontend panel.
- Small expandable panel in the active call section
- Text input for the objection + "Coach me" button
- Shows Claude's 1-2 sentence rebuttal
- Works during live call or when reviewing

### [ ] Auto-Load Queue UI
Backend is done (`POST /api/calls/queue/auto-load`). Need a button in the Caller queue panel.
- "Auto-fill" button next to "+ Add Leads" that calls the endpoint with current script + optional service filter
- Fills queue with top N leads by heat score automatically

### [ ] Daily Call Goal Progress Bar
Setting is done. Need the UI.
- Read `daily_call_goal` from settings
- Show `X / Y` progress bar in Caller page header
- Green when >= goal, orange when < goal

### [ ] Script A/B Stats
Track pickup rate and interest rate per call script template.
- Backend: `/api/calls/stats-by-template` — group by `template_id`, count outcomes
- Frontend: mini table in Caller or Templates page showing Script | Calls | Pickup % | Interested %

### [ ] Call Retry Auto-Schedule
After `no_answer` or `voicemail`, auto-reschedule lead for next calling window.
- In `webhooks.js` after logging outcome: compute next window time (next 8 AM or 4 PM in lead's timezone), insert into `call_queue` with `scheduled_for` set
- Queue processor already skips `scheduled_for > now`

---

## Tier 3 — Medium Impact, Low Effort

### [ ] Outcome Color Coding in History
Color-tint call history rows by outcome.
- `interested` → emerald bg tint, `callback_requested` → amber, `not_interested` → red tint
- One-line CSS addition per row

### [ ] Retry Count Badge in Queue
Show how many times each queued lead has already been called.
- `contact_count` already returned by the queue query
- Add small badge: "Called 2x" next to the lead name in the queue list

### [ ] Gatekeeper Count Display
Show gatekeeper hit count on the lead info panel during a call.
- `gatekeeper_count` is tracked on leads — surface it in the active call lead info row
- Helps operator know to call before 8 AM next time

---

## Tier 4 — Analytics

### [ ] Calling Performance Dashboard
Week/month view: calls dialed, pickup rate, interest rate, cost estimate.
- New `/api/calls/stats?range=7d|30d` endpoint
- Cards + simple bar chart in Dashboard or Caller page

### [ ] Best Hours Heatmap
Show which hours historically get best pickup rates.
- Parse `started_at` from call history, group by local hour + outcome
- 24-column heatmap: green = good, grey = low volume

### [ ] Cost Tracker
Estimate VAPI cost per session.
- `sum(duration_seconds)` for today → `* $0.05/60` estimate
- Show "Today: ~$X.XX" in stats panel

---

## Tier 5 — Big Swings

### [ ] Power Dialer (Parallel Calls)
Dial 2–3 leads simultaneously, connect to first human answer.
- Start N VAPI calls at once, listen for `in_progress` status via polling
- When first real pickup detected → route to primary, end others
- 2–3x throughput vs. sequential dialing
- FCC note: <3% abandoned call rate required for ATDS compliance

### [ ] Inbound Call Handler
When someone calls back on the VAPI number, AI handles it with context.
- Set up VAPI inbound assistant config
- Look up lead by caller phone number, inject context into system prompt
- Logs inbound call to lead's activity timeline

### [ ] Dynamic Script Variables from Enrichment
Inject live lead data into call scripts.
- `{review_count}`, `{days_since_last_contact}`, `{has_website}`, `{gatekeeper_count}`
- Already tracked in DB — just expose as template variables in `templateService.js`

---

## Cost Reduction Checklist

- [ ] **Clear ElevenLabs Voice ID** → uses VAPI built-in voice (free)
- [x] **Max duration cap** — configurable, default 3 min
- [x] **Voicemail drop** — caps voicemail calls at ~20s
- [ ] **No-answer retry cap** — backend not wired yet (UI is done)
- [ ] **Phone validation** — `phone_valid` gate exists but Twilio Lookup not wired
- [x] **Best time windows** — only call during high-answer windows
- [x] **Claude Haiku** — cheapest model, already default