# AI Cold Caller — Feature Roadmap

> Last updated: 2026-03-30
> Status key: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Already Built

- [x] VAPI outbound calls with Claude Haiku
- [x] Voicemail drop (configurable message, plays + hangs up)
- [x] Best time windows (8–10 AM, 4–6 PM in lead's local timezone)
- [x] Local presence dialing (state → phone number ID map)
- [x] Max call duration cap (configurable, default 3 min)
- [x] reportOutcome tool (AI logs outcome + next step + key intel during call)
- [x] Listen In (real-time audio via Twilio Media Stream WebSocket + Web Audio API)
- [x] Jump In / takeover (transfer to fallback phone via VAPI control message)
- [x] Auto-advance queue (8s countdown after each call)
- [x] Post-call outcome buttons (manual override)
- [x] Post-call email + SMS follow-up (auto-sent on voicemail, no_answer, interested, callback)
- [x] Call notes (saved to activities during or after call)
- [x] DNC marking (per lead, session-local feedback)
- [x] AI Report panel (next step + key intel from AI)
- [x] Call timer + today's stats

---

## Tier 1 — High Impact, Low Effort

### [ ] Recording Playback
Play back `recording_url` directly in the call history row.
- Add an audio `<audio>` element or a custom play button in "Today's Calls"
- `recording_url` is already stored in DB after every call
- No backend changes

### [ ] Live Transcript During Call
Show words appearing in real-time instead of "Transcript will appear after call ends."
- VAPI sends `transcript` events via the same monitor WebSocket alongside `media` frames
- Parse `{ event: 'transcript', transcript: { text, role, isFinal } }` messages
- Append to a `liveLines` state array, render in the transcript box
- No backend changes

### [ ] firstMessage — Configurable AI Opener
Right now `firstMessage: null` means the AI waits silently for the lead to speak first. Awkward.
- Add a "First Message" textarea in Settings → AI Cold Caller
- Seed `vapi_first_message` setting (default: `"Hey, is this {business_name}?"`)
- Read in `vapiService.js`, set `assistantConfig.firstMessage`
- Cuts dead air at the start of every call → better lead experience

### [ ] No-Answer Retry Cap
After N no-answers/voicemails on same lead, auto-DNC or auto-pause.
- Add `vapi_max_no_answer_attempts` setting (default: 3)
- In `webhooks.js` `end-of-call-report`, count no-answer outcomes for this lead
- If count >= cap, set `dnc_at = CURRENT_TIMESTAMP` and log activity
- Prevents burning your number's reputation on dead numbers

### [ ] Call Retry Auto-Schedule
After no_answer or voicemail, automatically re-add the lead to the queue for the next calling window.
- In `webhooks.js` after logging outcome, if `no_answer` or `voicemail` and contact_count < N:
  - Calculate next window start (next 8 AM or 4 PM in lead's timezone)
  - Insert into `call_queue` with a `scheduled_for` column
  - Queue processor skips items where `scheduled_for > now`
- Removes the need to manually re-queue no-answers

---

## Tier 2 — High Impact, Medium Effort

### [ ] Whisper Coaching (Mid-Call Inject)
Inject a text message to the AI mid-call without the lead hearing it.
- Add a text input + "Whisper" button in the active call panel
- POST to `/api/calls/:id/whisper` → sends `{ type: 'add-message', message: { role: 'system', content: '...' } }` to `monitor_control_url`
- Use cases: "Wrap up now", "Ask about their AC brand", "They seem interested, push for a meeting"

### [ ] Scheduled Campaign Mode
Run X calls/day automatically on a schedule, no manual clicking.
- Add a `campaign_mode_enabled` setting + `campaign_calls_per_day` limit
- Backend cron (every minute): if campaign mode on, it's within calling windows, and `active_calls_today < limit` → trigger next queue item automatically
- Fully autopilot — come back to check results

### [ ] Script A/B Stats
Track pickup rate, connection rate, and interest rate per call script template.
- Add aggregated stats to `/api/calls/history` or a new `/api/calls/stats-by-template` endpoint
- Show a mini table below call queue: Script name | Calls | Pickup % | Interested %
- Lets you retire bad scripts and double down on winners

### [ ] Speed-to-Lead Auto-Dial
When a new lead is imported or manually created, auto-trigger a call immediately.
- Add `speed_to_lead_enabled` setting
- In leads `POST /` route, if enabled + lead has phone + within calling window → auto-insert into `call_queue` at position 0
- First to call = first to close; the whole point of the platform

### [ ] Phone Number Validation (Pre-Call)
Validate numbers before dialing to avoid wasted calls on disconnected/invalid numbers.
- Use Twilio Lookup API: `POST /api/leads/:id/validate-phone`
- Store result in a `phone_valid` column
- Skip invalid numbers in queue processor
- Costs ~$0.005/lookup but saves a full VAPI call on bad numbers

---

## Tier 3 — Medium Impact, Low Effort

### [ ] Daily Call Goal + Progress Bar
Set a daily target (e.g., 50 calls) and show a progress bar in the Caller header.
- Add `daily_call_goal` setting (default: 50)
- Count today's calls from history, show `X / Y calls` with a bar
- Simple motivational UI, 30 min work

### [ ] Retry Count Badge in Queue
Show how many times each lead in the queue has already been called.
- `call_queue` already joins to `leads` which has `contact_count`
- Add a small badge next to each queue item: "Called 2x"

### [ ] Outcome Color Coding in History
Color-code call history rows by outcome instead of just a text label.
- `interested` → emerald background tint
- `callback_requested` → amber tint
- `not_interested` → no tint (default)
- One-line CSS change

### [ ] Bulk Outcome Override
Select multiple calls from history and bulk-set outcome.
- Same pattern as bulk lead status update already in Leads page
- Useful after a dialing session when you want to quickly triage results

---

## Tier 4 — Analytics & Reporting

### [ ] Calling Performance Dashboard
Week/month view: calls dialed, pickup rate, interest rate, cost estimate.
- New section in Dashboard page (or a tab in Caller)
- Backend: `/api/calls/stats?range=7d|30d`
- Charts: calls per day bar chart, outcome breakdown pie

### [ ] Best Hours Heatmap
Show which hours historically get the best pickup rates.
- Parse `started_at` from call history, group by hour + outcome
- Display as a simple 24-column heatmap: green = good pickup, red = dead zone
- Helps you manually tune the best-time windows setting

### [ ] Cost Tracker
Estimate VAPI cost per session and per qualified lead.
- VAPI pricing: ~$0.05/min transport + model tokens (Haiku = cheap)
- Track `sum(duration_seconds)` for the day → estimate dollar cost
- Show "Today: ~$X.XX | Cost per interested: ~$X.XX" in Today's stats panel

### [ ] Script Performance Comparison
Side-by-side stats for all scripts: avg duration, pickup %, interest %, outcome breakdown.
- Table in Templates page for call scripts
- Data from calls table joined to template_id

---

## Tier 5 — Big Swings

### [ ] Parallel / Power Dialer
Dial 2–3 leads simultaneously. Connect to the first human that picks up. Drop the others.
- VAPI supports multiple concurrent calls
- Start N calls at once, listen for `in_progress` status on all of them
- When first real human detected → route to primary, end the others
- 2–3x throughput vs. sequential dialing

### [ ] Inbound Call Handler
When someone calls back on your VAPI number, have the AI handle it (or route to you).
- Set up VAPI inbound call assistant config
- AI recognizes "oh you called earlier" context by phone number lookup
- Logs inbound call activity to the lead record
- Webhook already has `inbound` call type from Twilio

### [ ] AI Objection Library
Pre-load the AI with contractor-specific objections and vetted rebuttals.
- "I already have a marketing company" → "Most of our clients said the same thing before they saw the ROI..."
- Store in a `call_objections` table, inject as part of system prompt
- Settings UI to add/edit/delete objections

### [ ] Dynamic Script Variables from Lead Enrichment
Inject live data into call scripts: Google review count, last contacted date, website status.
- `{review_count}`, `{days_since_last_contact}`, `{has_website}`
- Already tracked in leads table — just expose them as template variables
- Makes every call feel researched and personal

---

## Cost Reduction Checklist

- [ ] **Clear ElevenLabs Voice ID** in Settings → uses VAPI built-in voice (free)
- [ ] **Set max duration to 150–180s** — already configurable
- [ ] **Enable voicemail drop** — cap voicemail calls at ~20s instead of 3 min
- [ ] **Set no-answer retry cap to 3** — stop burning minutes on dead numbers
- [ ] **Phone number validation** — $0.005/lookup saves a full call on bad numbers
- [ ] **Tighter system prompt** — every token costs; audit scripts for verbosity
- [ ] **Campaign mode off-peak** — call during windows only (already built)

---

## Notes

- VAPI pricing: ~$0.05/min (transport) + LLM tokens. Haiku is ~$0.001/min at avg call length.
- Twilio Lookup: $0.005 per number. Worth it at any volume.
- Power dialer requires careful "call drop" handling — FCC rules on abandoned calls (<3% drop rate for ATDS).
- Speed-to-lead matters most for web leads (people who just filled out a form). Less critical for cold outreach.
