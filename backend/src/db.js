const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// On Railway, RAILWAY_VOLUME_MOUNT_PATH is auto-set to the volume mount (e.g. /data)
// Locally, store DB in user's home directory (outside OneDrive) to prevent sync corruption
const os = require('os');
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  || process.env.FIELDSTACK_DB_DIR
  || path.join(os.homedir(), '.fieldstack');
const DB_PATH = path.join(DB_DIR, 'leads.db');

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name    TEXT NOT NULL,
  first_name       TEXT,
  last_name        TEXT,
  email            TEXT,
  phone            TEXT,
  address          TEXT,
  city             TEXT,
  state            TEXT,
  zip              TEXT,
  latitude         REAL,
  longitude        REAL,
  service_type     TEXT NOT NULL DEFAULT 'hvac',
  status           TEXT NOT NULL DEFAULT 'new',
  heat_score       INTEGER NOT NULL DEFAULT 0,
  estimated_value  REAL DEFAULT 2000,
  website          TEXT,
  has_website      INTEGER DEFAULT 0,
  website_live     INTEGER DEFAULT 0,
  google_maps_url  TEXT,
  source           TEXT DEFAULT 'manual',
  osm_id           TEXT UNIQUE,
  osm_type         TEXT,
  contact_count    INTEGER DEFAULT 0,
  first_contacted_at DATETIME,
  last_contacted_at DATETIME,
  next_followup_at  DATETIME,
  notes            TEXT,
  email_opened_at  DATETIME,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  metadata    TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leads_status       ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_service_type ON leads(service_type);
CREATE INDEX IF NOT EXISTS idx_leads_heat_score   ON leads(heat_score);
CREATE INDEX IF NOT EXISTS idx_leads_city         ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_osm_id       ON leads(osm_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead_id ON activities(lead_id);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  status_stage TEXT NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  subject TEXT,
  body TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_templates_channel ON templates(channel);
CREATE INDEX IF NOT EXISTS idx_templates_status_stage ON templates(status_stage);

CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT DEFAULT 'New conversation',
  context     TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  tool_name       TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);

CREATE TABLE IF NOT EXISTS sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  steps TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  auto_send INTEGER DEFAULT 0,
  auto_send_after_step INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  sequence_id INTEGER NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  paused_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lead_sequences_lead_id ON lead_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_sequences_status ON lead_sequences(status);

CREATE TABLE IF NOT EXISTS sms_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER,
  direction   TEXT NOT NULL DEFAULT 'outbound',
  from_number TEXT NOT NULL,
  to_number   TEXT NOT NULL,
  body        TEXT NOT NULL,
  twilio_sid  TEXT UNIQUE,
  status      TEXT DEFAULT 'queued',
  error_code  TEXT,
  error_message TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id ON sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_twilio_sid ON sms_messages(twilio_sid);
CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction);

CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone      TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS scheduled_emails (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL,
  template_id INTEGER NOT NULL,
  scheduled_at DATETIME NOT NULL,
  sent_at     DATETIME,
  cancelled_at DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_lead_id ON scheduled_emails(lead_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_at ON scheduled_emails(scheduled_at);

CREATE TABLE IF NOT EXISTS review_requests (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id          INTEGER NOT NULL,
  phone            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  rating           INTEGER,
  outcome          TEXT,
  feedback         TEXT,
  initial_sms_sid  TEXT,
  followup_sms_sid TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  rated_at         DATETIME,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_review_requests_lead_id ON review_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_phone ON review_requests(phone);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests(status);
`;

async function initDb() {
  const SQL = await initSqlJs();

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    const leadCount = db.exec('SELECT COUNT(*) FROM leads');
    console.log(`[DB] Loaded existing database from ${DB_PATH} (${leadCount[0]?.values[0][0] || 0} leads)`);
  } else {
    db = new SQL.Database();
    console.log(`[DB] Created new database at ${DB_PATH}`);
  }

  db.run(SCHEMA);

  // Migrations: add Google Places columns
  try { db.run('ALTER TABLE leads ADD COLUMN google_place_id TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN rating REAL'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN review_count INTEGER'); } catch(e) {}
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_google_place_id ON leads(google_place_id)');

  // Migrations: add enrichment columns
  try { db.run('ALTER TABLE leads ADD COLUMN enrichment_data TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN enriched_at DATETIME'); } catch(e) {}

  // Migrations: add tags column
  try { db.run('ALTER TABLE leads ADD COLUMN tags TEXT'); } catch(e) {}

  // Migrations: add first_contacted_at for speed-to-lead tracking
  try { db.run('ALTER TABLE leads ADD COLUMN first_contacted_at DATETIME'); } catch(e) {}

  // Migrations: deal tracking columns
  try { db.run('ALTER TABLE leads ADD COLUMN proposal_amount REAL'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN proposal_date TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN close_date TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN won_amount REAL'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN lost_reason TEXT'); } catch(e) {}

  // Migration: auto_send toggle for sequences
  try { db.run('ALTER TABLE sequences ADD COLUMN auto_send INTEGER DEFAULT 0'); } catch(e) {}
  // Migration: auto_send_after_step — manual steps 1-N, auto steps (N+1)+
  try { db.run('ALTER TABLE sequences ADD COLUMN auto_send_after_step INTEGER DEFAULT 0'); } catch(e) {}

  // Migration: outreach tracking fields
  try { db.run('ALTER TABLE leads ADD COLUMN loom_url TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN ghost_time TEXT'); } catch(e) {}

  // Migration: response time tracker
  try { db.run('ALTER TABLE leads ADD COLUMN test_submitted_at DATETIME'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN test_responded_at DATETIME'); } catch(e) {}

  // Migration: email open tracking
  try { db.run('ALTER TABLE leads ADD COLUMN email_opened_at DATETIME'); } catch(e) {}

  // Migration: per-enrollment auto_send flag
  try { db.run('ALTER TABLE lead_sequences ADD COLUMN auto_send INTEGER DEFAULT 0'); } catch(e) {}
  try { db.run('ALTER TABLE lead_sequences ADD COLUMN last_sent_at DATETIME'); } catch(e) {}

  // Migration: auto_flush_overdue — auto-send overdue email/sms steps for opted-in sequences
  try { db.run('ALTER TABLE sequences ADD COLUMN auto_flush_overdue INTEGER DEFAULT 0'); } catch(e) {}

  // Migration: unsubscribe support
  try { db.run('ALTER TABLE leads ADD COLUMN unsubscribed_at DATETIME'); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('app_url', '')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('sender_name', 'Hector')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('sender_phone', '')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('sender_website', 'fieldstack.co')"); } catch(e) {}

  // Migration: email bounce tracking + hot lead alert phone
  try { db.run('ALTER TABLE leads ADD COLUMN email_invalid_at DATETIME'); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('alert_phone', '')"); } catch(e) {}

  // Migration: DNC (Do Not Call) flag
  try { db.run('ALTER TABLE leads ADD COLUMN dnc_at DATETIME'); } catch(e) {}

  // Migration: callback alarm dedup
  try { db.run('ALTER TABLE leads ADD COLUMN callback_alerted_at DATETIME'); } catch(e) {}

  // Migration: daily send limits + domain warmup
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_send_limit', '20')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('warmup_start_date', '')"); } catch(e) {}

  // Migration: set auto_send_after_step=1 on default sequence + seed default_sequence_id
  try {
    const defSeq = get("SELECT id FROM sequences WHERE name = '7-Step Outreach' LIMIT 1");
    if (defSeq) {
      db.run("UPDATE sequences SET auto_send_after_step = 1, auto_send = 1 WHERE id = ? AND auto_send_after_step = 0", [defSeq.id]);
      db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_sequence_id', ?)", [String(defSeq.id)]);
    }
  } catch(e) {}

  // Migration: re-seed templates if they don't have niche variables
  migrateTemplatesToNiche();

  // Migration: re-seed loom scripts if they still use placeholder variables
  migrateLoomScripts();

  // Migration: add direct loom delivery email templates if missing
  migrateDirectLoomEmails();

  // Migration: add 4 new high-impact loom scripts (v2)
  migrateLoomScriptsV2();

  // Migration: fix loom link placeholders + improve copy across steps 2-7
  migrateTemplatesV3();

  // Migration: add cold call sales scripts (Sandler, Challenger, etc.)
  migrateColdCallScripts();

  // Migration: smart re-queue settings + requeue_count column
  try { db.run('ALTER TABLE leads ADD COLUMN requeue_count INTEGER DEFAULT 0'); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('requeue_enabled', '0')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('requeue_delay_days', '30')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('requeue_sequence_id', '')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('requeue_max_times', '2')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('cockpit_monthly_goal', '5')"); } catch(e) {}

  // Migration: voicemail drop, best time windows, local presence dialing
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_voicemail_message', '')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_best_time_enabled', '0')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_local_numbers', '{}')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_max_duration_seconds', '180')"); } catch(e) {}

  // Migration: AI call report — next step + key intel from reportOutcome tool
  try { db.run('ALTER TABLE calls ADD COLUMN ai_next_step TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE calls ADD COLUMN ai_key_intel TEXT'); } catch(e) {}

  // Migration: AI Cold Caller (VAPI) tables + settings
  db.run(`CREATE TABLE IF NOT EXISTS calls (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id          INTEGER NOT NULL,
    template_id      INTEGER,
    vapi_call_id     TEXT UNIQUE,
    status           TEXT NOT NULL DEFAULT 'queued',
    duration_seconds INTEGER,
    outcome          TEXT,
    transcript       TEXT,
    summary          TEXT,
    recording_url    TEXT,
    started_at       DATETIME,
    ended_at         DATETIME,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)');

  db.run(`CREATE TABLE IF NOT EXISTS call_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id     INTEGER NOT NULL,
    template_id INTEGER NOT NULL,
    position    INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  )`);

  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_phone_number_id', '')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_voice_id', '')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_fallback_phone', '')"); } catch(e) {}
  try { db.run('ALTER TABLE calls ADD COLUMN monitor_listen_url TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE calls ADD COLUMN monitor_control_url TEXT'); } catch(e) {}

  // Migration: configurable AI first message + no-answer retry cap + scheduled retry queue
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_first_message', 'Hey, is this {business_name}?')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_max_no_answer_attempts', '3')"); } catch(e) {}
  try { db.run('ALTER TABLE call_queue ADD COLUMN scheduled_for DATETIME'); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_call_goal', '50')"); } catch(e) {}

  // Migration: speed-to-lead, phone validation, campaign mode
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('speed_to_lead_enabled', '0')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('speed_to_lead_template_id', '')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_campaign_enabled', '0')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapi_campaign_calls_per_day', '0')"); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN phone_valid INTEGER DEFAULT NULL'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN phone_line_type TEXT DEFAULT NULL'); } catch(e) {}

  // Migration: missed call text-back
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('missed_call_textback_enabled', '0')"); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('missed_call_textback_message', '')"); } catch(e) {}

  // Migration: manual call source tracking
  try { db.run("ALTER TABLE calls ADD COLUMN source TEXT DEFAULT 'ai'"); } catch(e) {}

  // Migration: gatekeeper tracking — owner contact info + gatekeeper hit count
  try { db.run('ALTER TABLE leads ADD COLUMN owner_name TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN direct_phone TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE leads ADD COLUMN gatekeeper_count INTEGER DEFAULT 0'); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('booking_link', '')"); } catch(e) {}

  // Seed default templates if table is empty
  seedDefaultTemplates();

  // Seed default sequence if table is empty
  seedDefaultSequence();

  // Migration: seed cold outreach templates + sequence
  seedColdOutreachSequence();

  // Migration: seed 5-step auto outreach sequence
  seedAutoOutreachSequence();

  // Migration: seed post-call email follow-up templates
  migratePostCallEmailTemplates();
  migratePostCallEmailSignatures();

  // Migration: seed post-call SMS follow-up templates
  migratePostCallSmsTemplates();

  saveDb();
  return db;
}

function migrateTemplatesToNiche() {
  const sample = get("SELECT body FROM templates WHERE is_default = 1 AND step_order = 1 LIMIT 1");
  if (!sample) return; // no templates yet, seedDefaultTemplates will handle it
  if (sample.body && sample.body.includes('{scenario_')) return; // already migrated
  console.log('[DB] Migrating templates to niche-specific variables...');
  db.run("DELETE FROM templates WHERE is_default = 1");
  // seedDefaultTemplates() will re-insert them on the next call
}

function getLoomScriptTemplates() {
  return [
    // --- Script 1: The "Live Demo" Loom ---
    {
      name: 'Loom — The Live Demo',
      channel: 'loom_script',
      status_stage: 'contacted',
      step_order: 2,
      subject: null,
      body: `THE "LIVE DEMO" LOOM SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): Their website contact form — you submitted it 20 minutes ago.
Tab 2 (Open): The Sam AI dashboard with their logo and the live SMS thread.

0:00 - 0:15: THE HOOK
"Hey {first_name}, this is [Your Name] from Fieldstack. I'm on your website right now — I submitted a quote request about 20 minutes ago. No callback yet. I want to show you what that looks like from a homeowner's perspective, and then what happens when Sam is running."

0:15 - 0:40: THE PAIN
"Homeowners searching for {service_type} in {city} are calling the first three companies on Google. If they don't hear back in under 5 minutes, most move on. They don't leave a second voicemail. They just call the next number. Every unanswered lead is a direct donation to your competitor."

0:40 - 1:05: THE REVEAL (Switch to Tab 2 — Sam dashboard, live SMS thread)
"This is Sam. Watch what happened when I submitted that same form last week — with Sam running. Within 18 seconds, Sam texted the homeowner from a local 512 Austin number. Asked what the issue was, what kind of roof, their timeline. When they described storm damage, Sam asked them to send photos of the damage. The homeowner sent two MMS photos. Sam acknowledged them, checked the Google Calendar, and offered two inspection slots — all in the same SMS thread. The homeowner booked their own appointment. I never touched anything."

1:05 - 1:20: THE ASK
"I'm setting this up for one {service_type} company per city. {city} is still open. If Sam doesn't book you 5 qualified estimates this month, you don't pay. I take all the risk."

1:20 - 1:30: THE CLOSER
"Reply to this and I'll have {business_name} live in 72 hours. Worth a 5-minute chat?"

TIPS:
• Zoom in on the 18-second timestamp on Sam's first reply — that number lands hard
• Point your mouse at the MMS photo thumbnails in the thread — visuals sell faster than words
• Let the homeowner "Tuesday works" reply sit on screen for a beat before moving on — silence is powerful
• Smile at the start — Loom shows a tiny circle of your face`,
    },

    // --- Script 2: The "Voice + Text" Loom ---
    {
      name: 'Loom — Voice + Text',
      channel: 'loom_script',
      status_stage: 'contacted',
      step_order: 2,
      subject: null,
      body: `THE "VOICE + TEXT" LOOM SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): Sam AI dashboard — Vapi call transcript view for a qualified lead.
Tab 2 (Open): Same dashboard — SMS conversation view for that same lead.

0:00 - 0:15: THE HOOK
"Hey {first_name}, this is [Your Name] from Fieldstack. Most {service_type} leads in {city} don't text first — they call. I want to show you what Sam does when a homeowner calls your number and nobody picks up."

0:15 - 0:40: THE DATA (Tab 1 — call transcript)
"This is a real call transcript from Sam. A homeowner called outside business hours. Sam picked up in a real voice — ElevenLabs voice synthesis, local 512 area code — and handled the full qualification on the phone. Asked about the issue type, the roof material, the timeline, got the address. You can see right here: by the end of the 4-minute call, the lead was fully qualified. Storm damage, shingle roof, urgent timeline, address logged."

0:40 - 1:05: THE REVEAL (Switch to Tab 2 — SMS, same lead)
"The moment that call ended, Sam automatically sent a follow-up SMS with two inspection time slots. The homeowner replied 'Tuesday works.' Sam confirmed, created the Google Calendar event, and sent them a calendar invite — without any human involvement. The owner got an SMS notification the second the appointment was booked. That's it."

1:05 - 1:20: THE ASK
"SMS plus voice, working together, 24/7. One {service_type} company per market. {city} is open. Five booked quotes this month or you don't pay a cent."

1:20 - 1:30: THE CLOSER
"Reply and I'll have {business_name} running both channels in 72 hours. Talk soon, {first_name}."

TIPS:
• Zoom in on the call transcript timestamps — show the qualification happened in one call
• Zoom in on the SMS thread — show it continued from where the call left off
• Highlight the calendar invite confirmation — that's the moment people lean forward
• Keep narration calm — the product sells itself once they see the thread`,
    },

    // --- Script 3: The "No-Lead-Left-Behind" Loom ---
    {
      name: 'Loom — No-Lead-Left-Behind',
      channel: 'loom_script',
      status_stage: 'qualified',
      step_order: 3,
      subject: null,
      body: `THE "NO-LEAD-LEFT-BEHIND" LOOM SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): Sam AI dashboard — a lead with the full follow-up event timeline visible.

0:00 - 0:15: THE HOOK
"Hey {first_name}, this is [Your Name] from Fieldstack. Most {service_type} companies lose leads not because they miss the first call — but because they give up after one unanswered text. I want to show you the follow-up engine inside Sam."

0:15 - 0:40: THE TIMELINE (Show the event log, scroll through it slowly)
"Here's a real lead timeline. Homeowner submitted a form at 9:17 AM. Sam texted them from a local 512 number at 9:17 AM — 18 seconds later. No reply. Most systems stop there. Not Sam. At 1:17 PM — exactly 4 hours later — Sam sent a follow-up SMS nudge. Still no reply. At 9:17 AM two days later — 48 hours in — Sam placed an outbound voice call using ElevenLabs voice, picked up exactly where the SMS conversation left off, and asked about scheduling. The homeowner picked up, said Tuesday worked, and booked on the spot."

0:40 - 1:05: THE REVEAL
"Sam runs 3 touches over 72 hours — SMS at 18 seconds, SMS nudge at 4 hours, voice call at 48 hours. It only calls during business hours, 8 AM to 8 PM in the homeowner's local timezone. After 72 hours with no response it marks the lead as no-response and stops. The owner gets an SMS alert when the lead qualifies and another when they book. Zero leads lost to ghosting."

1:05 - 1:20: THE ASK
"Your competitors send one text and move on. Sam runs three touches across two channels, timed to match how homeowners actually respond. One {service_type} company per market. {city} is still open."

1:20 - 1:30: THE CLOSER
"If Sam doesn't book you 5 qualified estimates this month, you don't pay. Reply back and I'll have {business_name} live in 72 hours."

TIPS:
• Zoom in on the timestamp gaps in the log — 9:17, 1:17, next-day 9:17 — the visual tells the story
• Pause on the "48h voice call" entry — that's the differentiator most competitors don't have
• Show the lead status flip to "booked" at the end — that's the payoff moment
• Keep a calm, matter-of-fact tone — you're not selling, you're showing math`,
    },
  ];
}

function migrateDirectLoomEmails() {
  const exists = get("SELECT id FROM templates WHERE name = 'Reveal — Direct Loom (Speed Test)' AND is_default = 1 LIMIT 1");
  if (exists) return;
  console.log('[DB] Adding direct loom delivery email templates...');
  const stmt = "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)";
  db.run(stmt, [
    'Reveal — Direct Loom (Speed Test)', 'email', 'contacted', 2,
    "I tested {business_name}'s response time — made you a 90-second video",
    `{first_name},

I submitted a service request to {business_name} last week — same way a homeowner in {city} would. Turned what happened into a 90-second Loom. Just timestamps and data.

Here it is: {loom_url}

I show exactly what that costs in bookings — and the one fix that closes the gap in under 72 hours.

Worth a watch. Reply and we'll talk through what to fix first.

{sender_name}
Fieldstack`
  ]);
  db.run(stmt, [
    'Reveal — Direct Loom (Competitor)', 'email', 'contacted', 2,
    'I compared {business_name} to 3 competitors — 90 seconds',
    `{first_name},

I tested lead response times across {service_type} companies in {city} last week — submitted identical requests to {business_name} and three competitors and timed every response.

Here are the results: {loom_url}

The gap is fixable in 72 hours. Most owners don't know it exists until they see the timestamps.

Watch the 0:45 mark. That's where it gets expensive.

{sender_name}
Fieldstack`
  ]);
}

function migrateLoomScripts() {
  const sample = get("SELECT body FROM templates WHERE channel = 'loom_script' AND is_default = 1 LIMIT 1");
  if (!sample) return; // no loom scripts yet, seedDefaultTemplates will handle it
  // Markers of the updated scripts (real Sam capabilities)
  if (sample.body && (sample.body.includes('ElevenLabs') || sample.body.includes('photos of the damage'))) return;
  console.log('[DB] Migrating loom scripts to reflect real Sam AI capabilities...');
  db.run("DELETE FROM templates WHERE channel = 'loom_script' AND is_default = 1");
  // Insert updated scripts directly since seedDefaultTemplates() won't run (other templates exist)
  const scripts = getLoomScriptTemplates();
  const stmt = "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)";
  scripts.forEach(t => db.run(stmt, [t.name, t.channel, t.status_stage, t.step_order, t.subject, t.body]));
}

function migrateLoomScriptsV2() {
  const exists = get("SELECT id FROM templates WHERE name = 'Loom — The 11:47 PM' AND is_default = 1 LIMIT 1");
  if (exists) return;
  console.log('[DB] Adding 4 new Loom scripts (v2)...');
  const stmt = "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)";
  const scripts = getNewLoomScripts();
  scripts.forEach(t => db.run(stmt, [t.name, t.channel, t.status_stage, t.step_order, t.subject, t.body]));
}

function migrateTemplatesV3() {
  // Check if migration needed: follow-up templates still using [INSERT LOOM LINK]
  const sample = get("SELECT body FROM templates WHERE name = 'Follow-Up #1 — Soft + Insight' AND is_default = 1 LIMIT 1");
  if (!sample || !sample.body?.includes('[INSERT LOOM LINK]')) return;
  console.log('[DB] Migrating templates v3: fixing loom links + improving copy...');

  const u = (name, subject, body) => {
    if (subject !== null) {
      db.run('UPDATE templates SET subject = ?, body = ? WHERE name = ? AND is_default = 1', [subject, body, name]);
    } else {
      db.run('UPDATE templates SET body = ? WHERE name = ? AND is_default = 1', [body, name]);
    }
  };

  // ── Step 2 reveals: remove "no sales pitch" disclaimers + tighten CTAs ──

  u('Reveal — Direct Loom (Speed Test)',
    "I tested {business_name}'s response time — made you a 90-second video",
    `{first_name},

I submitted a service request to {business_name} last week — same way a homeowner in {city} would. Turned what happened into a 90-second Loom. Just timestamps and data.

Here it is: {loom_url}

I show exactly what that costs in bookings — and the one fix that closes the gap in under 72 hours.

Worth a watch. Reply and we'll talk through what to fix first.

{sender_name}
Fieldstack`);

  u('Reveal — Direct Loom (Competitor)',
    'I compared {business_name} to 3 competitors — 90 seconds',
    `{first_name},

I tested lead response times across {service_type} companies in {city} last week — submitted identical requests to {business_name} and three competitors and timed every response.

Here are the results: {loom_url}

The gap is fixable in 72 hours. Most owners don't know it exists until they see the timestamps.

Watch the 0:45 mark. That's where it gets expensive.

{sender_name}
Fieldstack`);

  u('Reveal — Curiosity Hook', null,
    `{first_name},

Last week, I submitted a service request to {business_name} — the exact same way a homeowner in {city} would.

I wasn't a real customer. I was testing something.

See, I work with {service_type} contractors across {state}, and I've noticed a pattern: the companies that respond first win the job. Not sometimes. Almost every time.

InsideSales research put a number on it: contractors who respond within 5 minutes are 21x more likely to book the job than those who wait 30 minutes.

I recorded what happened with {business_name}'s response — the timing, the follow-up (or lack of it), and how it stacks up against other {service_type} companies in {city}. Put it all in a short Loom video.

Just your data.

Want me to send it over? Reply "yes" and I'll drop the link.

{sender_name}
Fieldstack | Speed-to-Lead for Contractors`);

  u('Reveal — Lost Revenue Angle', null,
    `{first_name},

Quick math that might ruin your morning (sorry in advance):

The average {service_type} job in {city} is worth {avg_job_value}. If {business_name} gets {monthly_leads_single} leads a month and your close rate is around {close_rate_slow}, you're leaving a lot on the table.

But here's the thing — industry data shows contractors who respond in under 5 minutes close at {close_rate_fast}. Same leads. Same market. Same prices. Just faster follow-up.

That's the gap between your current bookings and what you should be closing. From leads you already paid for.

I tested {business_name}'s actual response time last week. Submitted a real-looking service request and timed it. Then I compared it to other {service_type} companies near {city}.

I broke down the numbers in a short Loom video — what I found, what it's costing you, and the three things I'd change this week.

3 minutes. Just timestamps and math.

Want me to send the link? Just reply "show me."

{sender_name}
Fieldstack`);

  // ── Step 3 video delivery: remove weak close ──

  u('Video — Challenge Angle', null,
    `{first_name},

Here's your speed test video: {loom_url}

Fair warning: most {service_type} owners who watch this end up making changes the same day. Not because I'm persuasive — because the data is hard to unsee.

Here's my prediction: you'll fix problem #2 before the video even finishes. It's that obvious once you see it.

The three things I cover:
1. Your response time vs. the {city} average (spoiler: there's a gap)
2. A dead-simple settings change that most {service_type} companies miss
3. The follow-up sequence your competitors are running that you aren't

Total watch time: 3 minutes and 12 seconds.

If I'm wrong and none of it is useful, reply and tell me what I missed.

{sender_name}
Fieldstack`);

  // ── Step 4 follow-ups: fix loom links + sharpen ──

  u('Follow-Up #1 — Soft + Insight',
    "One thing I didn't mention, {first_name}",
    `{first_name},

Following up on the speed test video. In case it got buried: {loom_url}

One thing I didn't mention that's worth knowing:

Google's own data shows that 60% of mobile searchers call a business directly from search results — and if nobody picks up, they immediately call the next result. They don't leave voicemails. They don't wait. They just move on.

For a {service_type} company in {city}, every missed call during business hours is a donated lead to whoever ranks below you.

The fix isn't complicated. Reply and I'll walk you through exactly what to change — takes 15 minutes.

{sender_name}`);

  u('Follow-Up #1 — Quick Question', null,
    `{first_name},

Honest question — when a new lead comes in through your website or Google listing, what happens next?

Does it go to an email inbox? A CRM? Someone's phone? A shared voicemail?

I ask because the #1 predictor of whether a {service_type} company books the job isn't pricing, reviews, or reputation. It's how fast the lead gets to a human who can respond.

I put together that Loom video showing where {business_name} stands: {loom_url}

What did you think? Anything surprise you?

{sender_name}`);

  u('Follow-Up #1 — Seasonal Timing', null,
    `{first_name},

Heads up: search volume for "{service_type} near me" in the {city} area is climbing. Every year it follows the same pattern — slow build, then a flood right when {seasonal_trigger}.

The contractors who win that surge aren't the ones with the biggest ad budgets. They're the ones who respond in under 5 minutes while everyone else is taking 2-4 hours.

I showed this in the Loom video I sent: {loom_url}

Right now, {business_name} has a window to fix the response gap before {busy_season}. Once the rush hits, you'll be too busy to change anything.

15-minute call this week? I'll show you exactly what to set up.

{sender_name}
Fieldstack`);

  // ── Step 5 social proof: fix loom links ──

  u('Follow-Up #2 — Case Study', null,
    `{first_name},

Short story — then I'll leave you alone.

We started working with a {service_type} contractor in {state} about four months ago. Similar size to {business_name}. Decent reviews, steady lead flow, but their close rate was stuck around 23%.

Turned out their average response time was 3 hours and 47 minutes. By the time they called back, homeowners had already booked someone else.

We set up automated speed-to-lead response. Under 20 seconds, every time — nights, weekends, holidays.

Within 60 days:
• Close rate: 23% → 58%
• New bookings: +11 per month
• Revenue increase: $14,300/mo
• Additional ad spend: $0

They didn't get more leads. They just stopped losing the ones they already had.

I think {business_name} has the same gap. The video I sent shows exactly where: {loom_url}

Worth a 15-minute call?

{sender_name}
Fieldstack`);

  u('Follow-Up #2 — Industry Data', null,
    `{first_name},

I've been digging into response time data across {service_type} companies and wanted to share what I'm seeing:

The numbers:
• Average {service_type} company responds to a web lead in 3-5 hours
• 48% never respond at all (the lead just dies)
• Companies that respond in under 5 minutes are 21x more likely to book
• 78% of homeowners hire whoever calls back first

The trend:
The top 10% of contractors are getting faster while everyone else stays the same. This means the gap is widening. The fast companies are pulling further ahead every month.

Where {business_name} fits:
I showed your specific data in the video I sent last week: {loom_url}

This isn't about working harder. It's about setting up a system so leads get a response in under a minute — whether you're on a job site, eating dinner, or sleeping.

That's what we build at Fieldstack. Happy to show you how it works in 15 minutes.

{sender_name}`);

  u('Follow-Up #2 — Competitor Pressure', null,
    `{first_name},

Figured you should know: we've been getting more calls from {service_type} companies in the {city} / {state} area lately.

Not sharing this to create pressure — sharing it because the math changes when your competitors get faster and you don't.

Right now, if {business_name} and a competitor both get the same lead, and they respond in 60 seconds while you respond in 2 hours — they book the job 9 times out of 10. Not because they're better. Because they're there.

The good news: you can flip that equation. The setup takes about a week, and once it's running, every lead gets a response in under a minute without you lifting a finger.

I laid out the specifics for {business_name} in the video: {loom_url}

Want to get ahead of this? Let's talk this week.

{sender_name}
Fieldstack`);

  // ── Step 6 breakup: fix loom links ──

  u('Breakup — Honest & Direct', null,
    `{first_name},

I've sent a few emails about the speed test I ran for {business_name}. Haven't heard back, which is totally fine — I know you're running a business, not checking your inbox.

I'll keep this simple: should I close your file?

If the answer is "yes, not interested" — no hard feelings. I'll stop emailing today.

If the answer is "not right now" — just say when and I'll follow up then. No pressure.

And if the answer is "I've been meaning to reply" — here's the video one more time: {loom_url}. It's 3 minutes and it shows exactly what's happening with {business_name}'s lead response time.

Either way, one number to remember:

Every hour you wait to respond to a new lead, your chance of booking that job drops by 80%. That's the difference between a {avg_job_single} job booked and a {avg_job_single} job lost.

Your call, {first_name}.

{sender_name}
Fieldstack`);

  u('Breakup — Value Gift', null,
    `{first_name},

This is my last email about the speed test. But I don't want to leave empty-handed, so here's a few things that'll help {business_name} regardless of whether we ever talk:

3 things you can do this week for free:

1. Turn on Google Business messaging. Most {service_type} companies in {city} don't have it enabled. Takes 5 minutes. Lets homeowners text you straight from your Google listing.

2. Set up a simple auto-reply. When a lead emails or fills out your form, send an instant reply: "Got it — we'll call you within 15 minutes." Even that small step cuts your lead loss in half.

3. Check your voicemail. Seriously. Call your own number. Is the voicemail full? Does it sound professional? Does it give them a reason to leave a message? 40% of {service_type} companies have a full or generic voicemail box.

The biggest thing: {pain_point}. If you're not responding fast, someone else is.

These are all in the video I made: {loom_url}

If you ever want to automate this stuff properly, you know where to find me.

{sender_name}
Fieldstack`);

  u("Breakup — Numbers Don't Lie", null,
    `{first_name},

Last email. Just want to leave you with the math.

If {business_name} gets {monthly_leads_single} leads per month (pretty standard for {service_type} in {city}):
• At a {close_rate_slow} close rate — you're leaving jobs on the table
• At a {close_rate_fast} close rate — that's what speed-to-lead gets you
• Average job value in your area: ~{avg_job_single}

That gap is {lost_revenue_monthly} per month. Same leads. Same ads. Same team.

The only variable? How fast you respond.

I know because I tested it: {loom_url}

Whenever you're ready, I'm here. No expiration date on this.

{sender_name}
Fieldstack`);

  // ── Step 7 re-engage: fix placeholder ──

  u('Re-engage — Fresh Data', null,
    `{first_name},

It's been a while. I ran a new speed test on {business_name} — curious if anything had changed.

Response time this time: {response_time}.

The {service_type} companies that locked in automated lead response early are pulling ahead in a way that's getting harder to catch. Whether things have improved since we last talked or the gap is still there — either way, there's a window right now to close it.

Not sending a new video unless you want one. But if you're open to a quick call, I'll show you exactly where things stand and what I'd change today.

No re-pitch. Just the data.

Worth 15 minutes?

{sender_name}
Fieldstack`);

  // ── Also fix [Your Name] → {sender_name} in remaining email templates ──

  u('Reveal — Competitor Angle', null,
    `{first_name},

I'm going to share something that might sting — but I think you'd rather hear it from me than figure it out after another slow quarter.

I tested the lead response time of several {service_type} companies in the {city} area. I submitted identical service requests and timed the responses.

Your fastest local competitor responded in under 2 minutes.

{business_name}? I'll save the exact number for the video.

Here's the thing — this isn't about effort. You're probably spending real money on ads, SEO, or Google Business to get those leads. But if a homeowner fills out your form and hears back from someone else first, that ad spend is a donation to your competitor.

I made a 3-minute Loom video that shows the full breakdown — {business_name} vs. competitors, side by side. No opinions, just timestamps.

Want to see it? Reply "send it" and it's yours.

{sender_name}
Fieldstack`);

  u('Video — Clean Delivery', null,
    `{first_name},

As promised. Here's the Loom video I made for {business_name}:

{loom_url}

What you'll see in 3 minutes:
1. The exact response time when I submitted a lead to {business_name}
2. Side-by-side comparison with other {service_type} companies in {city}
3. Three specific fixes — the first one takes about 10 minutes

One thing to watch for: at the 1:45 mark I show what a homeowner sees when they're waiting for a callback. It changes how you think about every lead sitting in your inbox.

After you watch, I'm happy to jump on a 15-minute call to talk through what makes sense for {business_name} specifically.

{sender_name}
Fieldstack`);

  u('Video — Personalized Audit', null,
    `{first_name},

I don't send generic videos. This one was built specifically for {business_name}.

Here's your Loom: {loom_url}

I walk through:
• Your actual response data (timestamp and all)
• The exact moment a homeowner in {city} would have moved on to your competitor
• A side-by-side with the fastest {service_type} responder in your area
• What I'd change first, second, and third — with specific steps

I spent about 45 minutes putting this together because the data told a clear story. {business_name} is doing a lot of things right — the lead generation is clearly working. The gap is what happens after the lead comes in.

Worth a watch. If anything clicks, reply and we can talk through it.

{sender_name}
Fieldstack`);

  u('Re-engage — Seasonal', null,
    `{first_name},

Every year it's the same cycle: {seasonal_trigger}, phones start ringing, and {service_type} companies scramble to keep up.

Last time we talked, {business_name} was leaving some response time on the table. The leads were there — they just weren't getting caught fast enough.

Right now, before the rush hits, is the best time to fix this. Once you're knee-deep in jobs, there's no bandwidth to change anything.

Here's what the setup looks like:
• Week 1: We map your lead sources and response flow
• Week 2: Automated speed-to-lead goes live (under 60 seconds, every time)
• Week 3+: You stop losing leads to slower competitors

The contractors who set this up before their busy season see results within the first 2 weeks. The ones who wait usually reach out mid-season, frustrated, wishing they'd done it sooner.

Up to you, {first_name}. But the window is now.

{sender_name}
Fieldstack`);

  u("Re-engage — What's New", null,
    `{first_name},

Quick update — we've added some things at Fieldstack since we last talked, and {business_name} was one of the first companies I thought of.

What's new:
• AI that responds in under 20 seconds and sounds like a real local person — not a bot
• Voice calls via a local area code number, plus SMS in the same conversation thread
• Asks homeowners to send damage photos via text, qualifies the job, and books your Google Calendar automatically
• Follow-up engine: SMS nudge at 4 hours, outbound voice call at 48 hours, 3 touches total before marking a lead dead
• Contractor SMS alerts the moment a lead qualifies and again when they book

Why I thought of you: when I tested {business_name}'s response time, the gap wasn't about effort — your team was just busy doing actual work. These tools fix the gap without adding anything to your plate.

We're doing a limited rollout in {state} right now. If you want an early look, I'll set up a 15-minute demo.

No pressure, no pitch history to rehash. Fresh start.

Interested?

{sender_name}
Fieldstack`);
}

function migrateColdCallScripts() {
  const existing = get("SELECT id FROM templates WHERE name = 'Cold Call — The Lost Lead' AND is_default = 1 LIMIT 1");
  if (existing) return;
  console.log('[DB] Adding cold call sales scripts...');

  const stmt = "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, 'call_script', 'new', ?, NULL, ?, 1)";
  const templates = getColdCallScriptTemplates();
  templates.forEach(t => db.run(stmt, [t.name, t.step_order, t.body]));
}

function getColdCallScriptTemplates() {
  return [
    {
      name: 'Cold Call — Objection Handling & Pre-Call Checklist',
      step_order: 0,
      body: `OBJECTION HANDLING — MASTER REFERENCE CARD

"I'm not interested"
→ "Totally fair — most guys say that before they see it. What if I just send you a 2-min video and you decide from there?"

"Send me an email"
→ "For sure. Quick question so I send the right thing — are you getting website leads right now, or is it mostly referrals?"

"I'm busy"
→ "I know you are, that's literally why this exists. What's a better time — before 8 AM or after 5?"

"How much?"
→ "Depends on volume, but the guarantee is the real answer — 5 booked quotes or you don't pay. Worth seeing how it works?"

"I already have something for that"
→ "Nice — what are you using? (listen) Got it. Does it respond to leads at 10 PM on a Saturday?"

"Is this AI? I don't trust that"
→ "That's the most common thing I hear. Then I show them a screenshot of an actual conversation and they can't tell it's not a person. Can I send you one?"

"We're good on leads"
→ "Good to hear. So you're responding to every single one within 5 minutes? Because that's the bar — anything slower and homeowners move on."

"I need to think about it"
→ "For sure. Real quick though — how many leads came in this week you didn't get back to same day? That's the money sitting on the table."

---

PRE-CALL CHECKLIST

1. Look up their website. Do they have a contact form? → "I saw your website, you've got a form... what happens when someone fills it out?"
2. Check Google reviews. 50+ reviews and 4.8 rating = busy and probably missing leads. 5 reviews = needs more leads.
3. Note their trade and city. Use it in the opener. "{service_type} contractors in {city}" hits different than "contractors."
4. Have your calendar open. When they say yes, book it immediately. Don't say "I'll send you a link." Say "How's Thursday at 4?"
5. Set a number goal, not a time goal. "I'm making 15 calls" beats "I'm calling for an hour."

---

VOICEMAIL SCRIPT (15 seconds max):
"Hey {first_name}, Hector here, quick message for you — I'll shoot you an email right now."

Then immediately email:
Subject: Just tried calling you
"Hey {first_name}, just left you a quick voicemail. I help {service_type} contractors stop losing website leads. Got a 2-min video if you're curious. No pressure."

---

MINDSET:
• They need you more than you need them. A $15K job lost because nobody texted back — that's real money they bleed every week.
• Rejection is data. Track which objection you hear most and adjust.
• Call in batches. 10-15 calls per block. First 3 are warmup. Stride hits at call 5.
• Stand up when you call. Your voice changes — more energy, more confidence.`,
    },
    {
      name: 'Cold Call — The Lost Lead',
      step_order: 1,
      body: `GOAL: Book a 10-minute demo by making them feel the pain of lost leads.

OPENING:
"Hey {first_name}, this is {sender_name}. I know you're probably on a job site so I'll be quick — do you have 30 seconds?"

HOOK:
"I work with {service_type} contractors here in Texas, and the number one thing I hear is website leads come in but nobody can get back to them fast enough. By the time you call back, they already hired someone else. Sound familiar?"

PITCH:
"We built an AI assistant called Sam that responds to your leads within 60 seconds — texts them, qualifies them, books the estimate. Works 24/7, even when you're on a roof or under a house."

CLOSE:
"Here's the deal — if Sam doesn't book you 5 qualified quotes this month, you don't pay. Can I show you how it works? Takes 10 minutes."

OBJECTION HANDLING:

"I'm too busy right now"
→ "Totally get it. That's exactly why this exists — you're too busy to chase leads. When's a good 10 minutes this week? I can call you after 5."

"I already have a girl/guy answering phones"
→ "That's great for business hours. What happens at 9 PM on a Tuesday when someone fills out your website form? Sam catches those."

"How much is it?"
→ "Depends on volume, but the guarantee is what matters — 5 booked quotes or you don't pay. Worth a 10-minute look?"`,
    },
    {
      name: 'Cold Call — The Competitor Proof',
      step_order: 1,
      body: `GOAL: Book a demo by proving this already works for someone nearby.

OPENING:
"Hey {first_name}, {sender_name} here. Quick question before I take any of your time — are you getting leads from your website right now?"

IF YES:
"How fast are you getting back to them? Be honest."

IF NO:
"Got it. That's a different problem." [End call or pivot.]

HOOK (after they admit slow response):
"Yeah, that's what I hear from every contractor I talk to. You're running crews, you're on job sites, and some homeowner fills out a form at 2 PM and doesn't hear back until the next morning. By then they called three other guys."

PITCH:
"I set up AI assistants for contractors that text leads back in under a minute. It sounds like a real person — asks what they need, qualifies the job, books the estimate on your calendar. One of my guys in {city} went from closing 2 jobs a month off web leads to 7, just because he stopped ghosting people."

CLOSE:
"If it doesn't book you 5 qualified quotes this month, you pay nothing. Can I walk you through it Wednesday or Thursday?"

OBJECTION HANDLING:

"Sounds like a robot"
→ "That's the first thing everyone says. I'll send you a screenshot of an actual conversation Sam had. People don't know. They think it's a receptionist."

"I don't trust AI with my customers"
→ "You're not handing over your business — Sam just handles the first 2-3 texts to qualify and book. You take over from there. Think of it like a really fast receptionist who never misses a message."`,
    },
    {
      name: 'Cold Call — The Math Problem',
      step_order: 1,
      body: `GOAL: Make them calculate their own lost revenue out loud.

OPENING:
"Hey {first_name}, this is {sender_name}. I'll be real quick — I help contractors stop losing money on leads they already paid for. Got 30 seconds?"

HOOK:
"Let me ask you something. What's your average job worth?"
[Let them answer — $5K, $8K, $15K, etc.]

"OK so if you're losing even 2-3 leads a month because you couldn't text back fast enough, that's [do the math out loud] — $15K, $20K just walking out the door. And you already paid for those leads."

PITCH:
"I built a system that responds to every single lead in under a minute. Day, night, weekends. It texts them like a real person, asks what they need, and books them on your calendar. You just show up to the estimate."

CLOSE:
"And I guarantee it — if we don't book you at least 5 qualified estimates this month, you pay zero. Can I show you how it works? 10 minutes, that's it."

OBJECTION HANDLING:

"I get my leads from referrals, not the website"
→ "Referrals are great, but they don't scale. What happens when you want to add a crew or hit a slow month? This makes your website leads actually convert instead of sitting there."

"Let me think about it"
→ "For sure. But real quick — how many leads came in this week that you didn't get back to same-day? That's the money we're talking about. Let me send you a 2-minute video and we can talk Friday."`,
    },
    {
      name: 'Cold Call — The Permission Opener',
      step_order: 1,
      body: `GOAL: Lowest-pressure opener. Use when nervous — you're asking them to tell you to stop.

OPENING:
"Hey {first_name}, this is {sender_name}. I help {service_type} contractors with lead follow-up. I have no idea if this is relevant to you — can I take 30 seconds to explain and you tell me if it's worth talking about?"

[They almost always say "yeah go ahead" because you gave them the exit.]

PITCH:
"When contractors I work with get a website lead, it usually sits in their inbox for a few hours because they're on a job. By then the homeowner called someone else. I built a system that responds in under a minute and books the estimate for you. Is that a problem you're running into, or are you pretty good on response time?"

IF YES, IT'S A PROBLEM:
"When's a good 10 minutes this week to show you how it works?"

IF NO:
"Fair enough. If it ever becomes one, I'm easy to find. Have a good one."

WHY THIS WORKS:
You gave them an exit. Most people won't take it — but knowing they can makes them listen. This is the Sandler "upfront contract." The key is you're not selling, you're asking if they have a problem. If they do, you offer to show the solution. If they don't, you leave gracefully.

IF THEY SAY "WHO ARE YOU WITH?":
"My name's {sender_name}, I'm local here in Texas. I work with {service_type} contractors on their lead follow-up. I literally just had a 30-second question — is now OK or should I call back?"`,
    },
    {
      name: 'Cold Call — The Teaching Call',
      step_order: 1,
      body: `GOAL: Lead with data that reframes their problem as urgent. Position yourself as expert, not salesperson.

OPENING:
"Hey {first_name}, {sender_name} here — quick question. Do you know what your average response time is on website leads?"

[They'll say "uh, couple hours maybe" or "I don't know."]

TEACH:
"Yeah, most contractors tell me the same thing. Here's the thing though — there's a Harvard study that says if you respond to a lead within 5 minutes, you're 100x more likely to actually get them on the phone than if you wait 30 minutes. After an hour, it's basically over. And most contractors are on a roof or under a house, so it's not like you can text back instantly."

[Let them react. They'll usually say "yeah, that's true."]

PITCH:
"That's why I built this — it's an AI that responds to your leads in under 60 seconds. Sounds like a real person, qualifies the job, books the estimate. And if it doesn't book you 5 qualified quotes this month, you don't pay anything. Can I show you how it works? Takes 10 minutes."

WHY THIS WORKS:
You led with data, not a pitch. You taught them something (100x stat) that makes their problem feel urgent. Now your product is the obvious solution to a problem they just learned is worse than they thought.

IF THEY SEEM SKEPTICAL:
"Look, I get it. I'm not asking you to buy anything right now. I'm asking for 10 minutes to show you what your leads look like from the homeowner's side. If it's not useful, I'll never call again."`,
    },
    {
      name: 'Cold Call — The Neighbor Script',
      step_order: 1,
      body: `GOAL: Trigger competitive instinct by referencing a nearby contractor.

OPENING:
"Hey {first_name}, this is {sender_name}. I work with a {service_type} contractor over in {city} — they were losing a ton of website leads because they couldn't respond fast enough. Sounded familiar so I figured I'd reach out to you. Got 30 seconds?"

[If "who are you with?" or "yeah go ahead":]

PITCH:
"I built an AI lead responder specifically for {service_type} contractors. It texts back every website lead in under a minute, qualifies the job, books the estimate. My guy in {city} went from maybe 2 jobs a month off his website to 7, just by not ghosting people. Are you getting website leads right now?"

IF YES:
"How fast are you typically getting back to them?"

IF NO:
"Got it — that's a different conversation. Appreciate your time."

AFTER THEY ADMIT IT'S SLOW:
"Yeah, that's the gap. Can I show you how the system works? 10 minutes, and if it's not relevant I'll never call again."

WHY THIS WORKS:
"A contractor near you" triggers competitive instinct. They don't want to be the one losing business while their competitor figured it out. The "2 jobs to 7" number is concrete and believable.

IF THEY'RE CLEARLY ANNOYED:
"Hey I can tell I caught you at a bad time. I'll email you what this is about — takes 10 seconds to read. Sound fair?"
Then email: Subject "Just tried calling you" with a 3-line pitch and booking link.`,
    },
  ];
}

function getNewLoomScripts() {
  return [
    {
      name: 'Loom — The 11:47 PM',
      channel: 'loom_script',
      status_stage: 'contacted',
      step_order: 2,
      subject: null,
      body: `LOOM — "THE 11:47 PM" SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): {business_name}'s Google Business listing or website.
Tab 2 (Open): Sam dashboard — SMS thread from a late-night lead, timestamped 11:47 PM.

0:00 - 0:12: THE SETUP
"Hey {first_name}, real quick — it's a Wednesday night. 11:47 PM. A homeowner in {city} just got hit by a hail storm. Roof is leaking. They're scared. They grab their phone and search for {service_type} near me."

0:12 - 0:28: THE MOMENT (Point mouse at their Google listing)
"They find {business_name}. Great reviews. They fill out your contact form — or they call and get voicemail. And then they wait.

[PAUSE 2 seconds — let the silence sit]

Most {service_type} companies don't respond until 9 AM the next morning. By then, that homeowner has already booked someone else."

0:28 - 0:55: THE REVEAL (Switch to Tab 2 — scroll the SMS thread slowly)
"Here's what happens when Sam is running. Same lead. Same 11:47 PM. Sam picks up in 18 seconds — texts from a local {city} number, asks about the damage, asks them to send photos. The homeowner sends two pictures of the leak. Sam qualifies the job, offers two inspection times for tomorrow morning, and books it. Your calendar invite is already sent.

You were asleep. You woke up to a booked job."

0:55 - 1:10: THE MATH
"Storms don't follow business hours. Every after-hours lead you miss is {avg_job_single} walking to your competitor. Sam catches every one. 24 hours a day, 7 days a week, under 20 seconds every time."

1:10 - 1:25: THE ASK
"One {service_type} company per market. {city} is open. If Sam doesn't book you 5 qualified estimates this month, you pay nothing. I take the risk.

Reply back and I'll have {business_name} live in 72 hours."

TIPS:
• Start recording in the evening if possible — Loom shows your timestamp, it adds credibility
• Scroll the SMS thread slowly at 0:28 — let them read every message themselves
• Pause hard after "and then they wait" — 2 full seconds of silence hits harder than any statistic
• End on the calendar invite confirmation — that's the "aha" visual
• Your energy should be: calm and matter-of-fact, not excited. You're showing a problem, not selling.`,
    },
    {
      name: 'Loom — The Money Calculator',
      channel: 'loom_script',
      status_stage: 'contacted',
      step_order: 2,
      subject: null,
      body: `LOOM — "THE MONEY CALCULATOR" SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): Notepad/sheet with their revenue math pre-filled (monthly leads × avg job × close rate gap).
Tab 2 (Open): Sam dashboard — completed SMS booking thread showing a qualified lead.

0:00 - 0:12: THE HOOK (On camera, before showing screen)
"Hey {first_name}, I did some math on {business_name} before making this video. The number I got surprised me. Let me show you."

0:12 - 0:45: THE MATH (Switch to Tab 1 — walk through it line by line, slowly)
"{loom_math_intro}

Here's the math I ran. {city} {service_type} companies in your market are getting roughly {monthly_leads_single} leads a month — web forms, Google calls, referrals. At a typical close rate for companies that respond slowly — around {close_rate_slow} — you're booking maybe 6 or 7 of those jobs.

But here's what the data shows: contractors who respond in under 5 minutes close at {close_rate_fast}. Same leads. Same market. Same pricing.

[Point mouse to the gap line in the math]

That gap — those extra jobs you're not closing — works out to roughly {lost_revenue_monthly} every month. Not from new leads. From the ones you already paid to get.

[Pause 2 seconds]

That's the number I wanted you to see."

0:45 - 1:05: THE REVEAL (Switch to Tab 2 — Sam SMS thread)
"This is Sam. Every lead that comes into {business_name} — web form, missed call, Google message — Sam responds in under 20 seconds. Qualifies the job in the same text thread. Books your Google Calendar automatically. No human in the loop.

The {close_rate_fast} close rate isn't a theory. It's what happens when the homeowner hears back before they've even put their phone down."

1:05 - 1:20: THE CLOSE
"One {service_type} company per city. {city} is still open. Five booked quotes this month or you pay nothing.

Worth a 5-minute call? Just reply."

TIPS:
• Write the math on screen BEFORE recording — don't calculate live, it kills the pace
• Use their actual estimated lead volume if you know it — the more specific, the harder it lands
• Pause after showing the monthly gap number — let them do the multiplication themselves
• The key moment is "from the ones you already paid to get" — slow down here
• Keep the calculator simple: 3 lines max. Complexity kills the point.`,
    },
    {
      name: 'Loom — The Race',
      channel: 'loom_script',
      status_stage: 'qualified',
      step_order: 3,
      subject: null,
      body: `LOOM — "THE RACE" SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): Two-column comparison layout — "{business_name}" vs "Fastest Competitor in {city}" with timestamps.
Tab 2 (Open): Sam dashboard — SMS thread with 18-second response timestamp visible.

0:00 - 0:14: THE SETUP
"Hey {first_name}, last week I did something a lot of {service_type} companies ask us not to do after they see the results. I submitted identical service requests to {business_name} and three of your competitors in {city}. I used the same homeowner scenario. And I timed every single response."

0:14 - 0:38: THE DATA (Switch to Tab 1 — reveal each row slowly)
"Here's what I found.

[Reveal competitor 1 row] The first company responded in 4 minutes. Text message. Friendly. Tried to book on the spot.

[Reveal competitor 2 row] Second company — 11 minutes. Phone call. Professional. Got my address.

[Reveal competitor 3 row] Third — 2 hours 40 minutes. Email. By then I'd already talked to two other people.

[Pause. Reveal {business_name} row last.]

{business_name}: [their actual response time, or 'I'm still waiting.']

[Hold that on screen for 3 seconds without speaking.]

I'm not showing you this to be harsh. I'm showing you because this is exactly what a homeowner in {city} experiences right now, every time they fill out your form."

0:38 - 1:00: THE FIX (Switch to Tab 2 — Sam SMS thread)
"This is what it looks like when Sam is running. Same form submit. 18 seconds later, the homeowner gets a text from a local {city} number. Within 4 minutes, the job is qualified and two inspection slots are on the table. No competitor can beat that. Not manually."

1:00 - 1:15: THE ASK
"You're already spending money to get these leads. The race starts the second they hit send — and right now, {business_name} is starting it late.

One {service_type} company per market. Five booked quotes this month or you pay nothing. Reply and I'll flip this for {business_name} in 72 hours."

TIPS:
• The 3-second pause after revealing {business_name}'s time is the most important moment in the video — do NOT fill it
• If you actually submitted their form and they didn't respond, use the real data — authenticity is everything
• Don't trash competitors by name — show timestamps, let the numbers do the work
• Your tone should be: a friend sharing uncomfortable data, not a salesperson
• If they're actually fast (rare), pivot: "You responded in 8 minutes — faster than most. But your #1 competitor was under 2."`,
    },
    {
      name: 'Loom — The Homeowner',
      channel: 'loom_script',
      status_stage: 'qualified',
      step_order: 3,
      subject: null,
      body: `LOOM — "THE HOMEOWNER" SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): Google search — "{service_type} near me {city}" — {business_name} visible in results.
Tab 2 (Open): Their website contact form.
Tab 3 (Open): Sam dashboard — completed SMS thread, homeowner booked.

0:00 - 0:10: THE FRAME
"Hey {first_name}, for the next 90 seconds I want you to forget you're the business owner. I want you to be the homeowner."

0:10 - 0:32: THE JOURNEY (Tab 1 — show the search results)
"It's a Tuesday afternoon. Your {loom_pain} — it's urgent, it's stressful, you need someone today.

You Google {service_type} near me in {city}. You see {business_name}. Good reviews. You click.

[Switch to Tab 2 — their contact form]

You fill out the form. Name, phone, what's going on. You hit submit.

[Stop typing. Go still on screen. Don't speak.]

[5 seconds of silence while a cursor blinks on an empty page]

And you wait."

0:32 - 0:52: THE DECISION
"Most homeowners wait about 3 minutes before they open a new tab. They don't leave a voicemail. They don't send a follow-up email. They just go back to Google and call the next number.

By the time {business_name} calls back — whether that's 2 hours or 2 days — that homeowner is already booked with someone else. They're not being rude. They're just scared and they needed help fast."

0:52 - 1:12: THE FLIP (Switch to Tab 3 — Sam thread, scroll it slowly)
"This is the same homeowner. Same form. Same Tuesday afternoon. Except Sam is running.

18 seconds after they hit submit — before they've even put their phone down — they get a text from a local {city} number. Sam asks what's going on. They explain. Sam asks a follow-up. They answer. Within 4 minutes, they've got two appointment slots and they pick one.

They never opened that second tab."

1:12 - 1:25: THE CLOSE
"That homeowner experience — the waiting, the silence, the second tab — that's happening to {business_name}'s leads right now. Sam ends it.

One {service_type} company per market. {city} is open. Five booked quotes or you don't pay. Reply and I'll fix this in 72 hours."

TIPS:
• The 5-second silence at "and you wait" is non-negotiable — it's the entire emotional core of the video
• Move your mouse slowly during the silence, like you're actually waiting. Don't freeze.
• Scroll the Sam thread slowly at 0:52 — let them read the conversation as a homeowner, not as a business owner
• Your tone in the first half: tired, stressed homeowner energy. Second half: calm relief.
• This script works best for skeptical owners — it bypasses the "I respond fast" defense by making them feel what their customers feel`,
    },
  ];
}

function seedDefaultTemplates() {
  const count = get('SELECT COUNT(*) as c FROM templates WHERE is_default = 1');
  if (count && count.c > 0) return;

  const templates = [

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: MYSTERY SHOPPER TEST (status: new)
    // Purpose: Submit a realistic inquiry to test how fast they respond.
    // The response time becomes the data point for the entire sequence.
    // ═══════════════════════════════════════════════════════════════════════

    // --- Angle A: Standard Homeowner (Google search) ---
    {
      name: 'Speed Test — Standard Homeowner',
      channel: 'email',
      status_stage: 'new',
      step_order: 1,
      subject: '{scenario_subject}',
      body: `Hi,

I found {business_name} while looking for {service_type} companies in {city} and your reviews looked solid.

Here's what's going on: {scenario_standard}

Thanks,
Alex Thompson
{city}, {state}`,
    },

    // --- Angle B: Urgent / After-Hours ---
    {
      name: 'Speed Test — Urgent Request',
      channel: 'email',
      status_stage: 'new',
      step_order: 1,
      subject: 'Urgent {service_type} issue — {city} — need help ASAP',
      body: `Hi {business_name},

{scenario_urgent}

We found you on Google and saw you serve the {city} area. Can someone come out today or first thing tomorrow?

Happy to pay for emergency service if needed. Just need someone reliable.

Please call or text back as soon as you can: (555) 012-3456

Thank you,
Jordan Rivera
{city}, {state}`,
    },

    // --- Angle C: Referral-Based ---
    {
      name: 'Speed Test — Referral Inquiry',
      channel: 'email',
      status_stage: 'new',
      step_order: 1,
      subject: 'Neighbor recommended {business_name}',
      body: `Hi there,

My neighbor on Elm Street {scenario_referral}

Are you booking estimates for the {city} area this week?

Thanks,
Sam Mitchell
{city}, {state}`,
    },

    // --- SMS variants ---
    {
      name: 'Speed Test — SMS Standard',
      channel: 'sms',
      status_stage: 'new',
      step_order: 1,
      subject: null,
      body: `Hi, found {business_name} on Google. Need {service_type} help in {city} — {scenario_sms} Thanks - Alex`,
    },
    {
      name: 'Speed Test — SMS Urgent',
      channel: 'sms',
      status_stage: 'new',
      step_order: 1,
      subject: null,
      body: `{scenario_sms_urgent} We're in {city}. Can {business_name} send someone today or tomorrow AM? Please call back ASAP.`,
    },

    // --- Call Script ---
    {
      name: 'Speed Test — Call Script',
      channel: 'call_script',
      status_stage: 'new',
      step_order: 1,
      subject: null,
      body: `GOAL: Test response speed, professionalism, and follow-up behavior.

OPENING:
"Hi, I'm looking for {service_type} help. I found {business_name} online — do you guys service the {city} area?"

SCENARIO (pick one):
A) "{scenario_call_a}"
B) "{scenario_call_b}"
C) "{scenario_call_c}"

WHAT TO TRACK:
• Did they answer the phone? (or voicemail?)
• How many rings?
• Did they ask qualifying questions or just say "we'll call you back"?
• Did they try to book an appointment on the spot?
• Professionalism / friendliness (1-10)

CLOSE:
"That sounds great — let me talk to my [spouse/partner] and I'll call you right back."

AFTER THE CALL:
• Start a timer. How long until they follow up?
• Do they text? Email? Call back?
• Do they follow up at all?

This data becomes the centerpiece of Step 2.`,
    },

    // --- Cold Call Sales Scripts (from getColdCallScriptTemplates) ---
    ...getColdCallScriptTemplates().map(t => ({
      name: t.name,
      channel: 'call_script',
      status_stage: 'new',
      step_order: t.step_order,
      subject: null,
      body: t.body,
    })),

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: PROBLEM REVEAL — LOOM VIDEO TEASE (status: contacted)
    // Purpose: Reveal the test. Create curiosity about results.
    // Get permission to send the Loom video. Build trust through honesty.
    // ═══════════════════════════════════════════════════════════════════════

    // --- Direct Loom Delivery A: Mystery Shopper ---
    {
      name: 'Reveal — Direct Loom (Speed Test)',
      channel: 'email',
      status_stage: 'contacted',
      step_order: 2,
      subject: 'I tested {business_name}\'s response time — made you a 90-second video',
      body: `{first_name},

I submitted a service request to {business_name} last week — same way a homeowner in {city} would. Turned what happened into a 90-second Loom. Just timestamps and data.

Here it is: {loom_url}

I show exactly what that costs in bookings — and the one fix that closes the gap in under 72 hours.

Worth a watch. Reply and we'll talk through what to fix first.

{sender_name}
Fieldstack`,
    },

    // --- Direct Loom Delivery B: Competitor Angle ---
    {
      name: 'Reveal — Direct Loom (Competitor)',
      channel: 'email',
      status_stage: 'contacted',
      step_order: 2,
      subject: 'I compared {business_name} to 3 competitors — 90 seconds',
      body: `{first_name},

I tested lead response times across {service_type} companies in {city} last week — submitted identical requests to {business_name} and three competitors and timed every response.

Here are the results: {loom_url}

The gap is fixable in 72 hours. Most owners don't know it exists until they see the timestamps.

Watch the 0:45 mark. That's where it gets expensive.

{sender_name}
Fieldstack`,
    },

    // --- Angle A: Curiosity + Data ---
    {
      name: 'Reveal — Curiosity Hook',
      channel: 'email',
      status_stage: 'contacted',
      step_order: 2,
      subject: 'I sent {business_name} a lead request last week. Here\'s what happened.',
      body: `{first_name},

Last week, I submitted a service request to {business_name} — the exact same way a homeowner in {city} would.

I wasn't a real customer. I was testing something.

See, I work with {service_type} contractors across {state}, and I've noticed a pattern: the companies that respond first win the job. Not sometimes. Almost every time.

InsideSales research put a number on it: contractors who respond within 5 minutes are 21x more likely to book the job than those who wait 30 minutes.

I recorded what happened with {business_name}'s response — the timing, the follow-up (or lack of it), and how it stacks up against other {service_type} companies in {city}. Put it all in a short Loom video.

Just your data.

Want me to send it over? Reply "yes" and I'll drop the link.

{sender_name}
Fieldstack | Speed-to-Lead for Contractors`,
    },

    // --- Angle B: Competitor Comparison ---
    {
      name: 'Reveal — Competitor Angle',
      channel: 'email',
      status_stage: 'contacted',
      step_order: 2,
      subject: 'Your #1 competitor in {city} responds 47x faster than {business_name}',
      body: `{first_name},

I'm going to share something that might sting — but I think you'd rather hear it from me than figure it out after another slow quarter.

I tested the lead response time of several {service_type} companies in the {city} area. I submitted identical service requests and timed the responses.

Your fastest local competitor responded in under 2 minutes.

{business_name}? I'll save the exact number for the video.

Here's the thing — this isn't about effort. You're probably spending real money on ads, SEO, or Google Business to get those leads. But if a homeowner fills out your form and hears back from someone else first, that ad spend is a donation to your competitor.

I made a 3-minute Loom video that shows the full breakdown — {business_name} vs. competitors, side by side. No opinions, just timestamps.

Want to see it? Reply "send it" and it's yours.

{sender_name}
Fieldstack`,
    },

    // --- Angle C: Lost Revenue / Money ---
    {
      name: 'Reveal — Lost Revenue Angle',
      channel: 'email',
      status_stage: 'contacted',
      step_order: 2,
      subject: '{first_name}, I think {business_name} left {lost_revenue_monthly} on the table last month',
      body: `{first_name},

Quick math that might ruin your morning (sorry in advance):

The average {service_type} job in {city} is worth {avg_job_value}. If {business_name} gets {monthly_leads_single} leads a month and your close rate is around {close_rate_slow}, you're leaving a lot on the table.

But here's the thing — industry data shows contractors who respond in under 5 minutes close at {close_rate_fast}. Same leads. Same market. Same prices. Just faster follow-up.

That's the gap between your current bookings and what you should be closing. From leads you already paid for.

I tested {business_name}'s actual response time last week. Submitted a real-looking service request and timed it. Then I compared it to other {service_type} companies near {city}.

I broke down the numbers in a short Loom video — what I found, what it's costing you, and the three things I'd change this week.

3 minutes. Just timestamps and math.

Want me to send the link? Just reply "show me."

{sender_name}
Fieldstack`,
    },

    // --- SMS variants ---
    {
      name: 'Reveal — SMS Curiosity',
      channel: 'sms',
      status_stage: 'contacted',
      step_order: 2,
      subject: null,
      body: `{first_name}, I tested {business_name}'s response time like a real customer in {city}. Recorded the results in a 3-min Loom video. No pitch — just your data. Want me to send it?`,
    },
    {
      name: 'Reveal — SMS Competitor',
      channel: 'sms',
      status_stage: 'contacted',
      step_order: 2,
      subject: null,
      body: `{first_name}, I tested lead response times for {service_type} companies in {city}. Your top competitor responded 47x faster than {business_name}. Made a short video showing the gap. Want to see it?`,
    },

    // --- Call Script ---
    {
      name: 'Reveal — Call Script',
      channel: 'call_script',
      status_stage: 'contacted',
      step_order: 2,
      subject: null,
      body: `OPENING:
"Hi {first_name}, this is [Your Name] from Fieldstack. Got 90 seconds? I have something about {business_name} that I think you'll want to hear."

IF YES — THE REVEAL:
"So here's the deal. Last week I submitted a service request to {business_name} — a realistic one, the same way a real homeowner in {city} would. I wanted to test how fast your team responds."

PAUSE. Let them react.

"I'm not calling to criticize. I do this for {service_type} companies because I've seen the data — 78% of homeowners hire whoever responds first. Not the cheapest, not the best-reviewed. The fastest."

THE VALUE:
"I put together a short Loom video — about 3 minutes — that walks through what I found. Your actual response time, how it compares to competitors in {city}, and three things I'd fix right away. One of them takes about 10 minutes."

THE ASK:
"Can I send it to your email? No strings, no follow-up pitch in the video. Just the data."

IF THEY SAY YES:
"Perfect — what's the best email? I'll send it within the hour."

IF PUSHBACK / "NOT INTERESTED":
"I get it. Quick question though — do you know what your current average response time is to a new lead? ... Most owners don't, and that's the whole problem. The video is 3 minutes. If it's not useful, delete it. But I think you'll be surprised."

IF HARD NO:
"No problem at all. If you ever want to revisit, my info is [Your Name] at Fieldstack. Take care, {first_name}."`,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: LOOM VIDEO DELIVERY (status: qualified)
    // Purpose: Deliver the video. Set expectations. Make the CTA easy.
    // ═══════════════════════════════════════════════════════════════════════

    // --- Angle A: Clean Delivery ---
    {
      name: 'Video — Clean Delivery',
      channel: 'email',
      status_stage: 'qualified',
      step_order: 3,
      subject: 'Your {business_name} speed test — here\'s the video',
      body: `{first_name},

As promised. Here's the Loom video I made for {business_name}:

{loom_url}

What you'll see in 3 minutes:
1. The exact response time when I submitted a lead to {business_name}
2. Side-by-side comparison with other {service_type} companies in {city}
3. Three specific fixes — the first one takes about 10 minutes

One thing to watch for: at the 1:45 mark I show what a homeowner sees when they're waiting for a callback. It changes how you think about every lead sitting in your inbox.

After you watch, I'm happy to jump on a 15-minute call to talk through what makes sense for {business_name} specifically.

{sender_name}
Fieldstack`,
    },

    // --- Angle B: Personalized Audit ---
    {
      name: 'Video — Personalized Audit',
      channel: 'email',
      status_stage: 'qualified',
      step_order: 3,
      subject: 'Built this for you, {first_name} — {business_name} lead audit [3 min]',
      body: `{first_name},

I don't send generic videos. This one was built specifically for {business_name}.

Here's your Loom: {loom_url}

I walk through:
• Your actual response data (timestamp and all)
• The exact moment a homeowner in {city} would have moved on to your competitor
• A side-by-side with the fastest {service_type} responder in your area
• What I'd change first, second, and third — with specific steps

I spent about 45 minutes putting this together because the data told a clear story. {business_name} is doing a lot of things right — the lead generation is clearly working. The gap is what happens after the lead comes in.

Worth a watch. If anything clicks, reply and we can talk through it.

{sender_name}
Fieldstack`,
    },

    // --- Angle C: Challenge / Dare ---
    {
      name: 'Video — Challenge Angle',
      channel: 'email',
      status_stage: 'qualified',
      step_order: 3,
      subject: 'I bet you fix problem #2 before the video ends',
      body: `{first_name},

Here's your speed test video: {loom_url}

Fair warning: most {service_type} owners who watch this end up making changes the same day. Not because I'm persuasive — because the data is hard to unsee.

Here's my prediction: you'll fix problem #2 before the video even finishes. It's that obvious once you see it.

The three things I cover:
1. Your response time vs. the {city} average (spoiler: there's a gap)
2. A dead-simple settings change that most {service_type} companies miss
3. The follow-up sequence your competitors are running that you aren't

Total watch time: 3 minutes and 12 seconds.

If I'm wrong and none of it is useful, reply and tell me what I missed.

{sender_name}
Fieldstack`,
    },

    // --- SMS variants ---
    {
      name: 'Video Delivery — SMS',
      channel: 'sms',
      status_stage: 'qualified',
      step_order: 3,
      subject: null,
      body: `{first_name}, here's your {business_name} speed test video: {loom_url} — watch the part at 1:45, that's where it gets interesting. 3 min total.`,
    },
    {
      name: 'Video Delivery — SMS Challenge',
      channel: 'sms',
      status_stage: 'qualified',
      step_order: 3,
      subject: null,
      body: `Your video is ready: {loom_url}. My prediction: you'll want to fix problem #2 before it's even done playing. Let me know what you think, {first_name}.`,
    },

    // --- Call Script ---
    {
      name: 'Video Delivery — Call Script',
      channel: 'call_script',
      status_stage: 'qualified',
      step_order: 3,
      subject: null,
      body: `PURPOSE: Follow up to confirm they received and watched the video.

OPENING:
"Hey {first_name}, it's [Your Name] from Fieldstack. I sent over that Loom video for {business_name} yesterday — did it come through okay?"

IF THEY WATCHED:
"Great — what stood out to you? ... Yeah, that's the part that gets most people. The response time gap is usually the biggest eye-opener."

"So here's what I'd suggest as a next step: a 15-minute call where I walk you through exactly how we'd close that gap for {business_name}. We've done it for [X] {service_type} companies in {state} — it's not complicated, it just needs to be set up right."

IF THEY HAVEN'T WATCHED:
"No worries at all. Quick highlight: I found that {business_name} has a [X-minute/hour] gap between when a lead comes in and when they hear back. Your fastest competitor in {city} is responding in under 2 minutes. That gap is where you're losing bookable jobs."

"The video walks through three specific fixes. The first one takes about 10 minutes. Worth a watch when you get a chance — it's only 3 minutes."

IF THEY'RE INTERESTED IN A CALL:
"Perfect. I have [two times] open this week. Which works better for you?"`,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: FOLLOW-UP #1 (status: proposal_sent)
    // Purpose: Re-engage without being pushy. Add new value.
    // Timing: 2-3 days after video delivery.
    // ═══════════════════════════════════════════════════════════════════════

    // --- Angle A: Soft Check-In + New Insight ---
    {
      name: 'Follow-Up #1 — Soft + Insight',
      channel: 'email',
      status_stage: 'proposal_sent',
      step_order: 4,
      subject: "One thing I didn't mention, {first_name}",
      body: `{first_name},

Following up on the speed test video. In case it got buried: {loom_url}

One thing I didn't mention that's worth knowing:

Google's own data shows that 60% of mobile searchers call a business directly from search results — and if nobody picks up, they immediately call the next result. They don't leave voicemails. They don't wait. They just move on.

For a {service_type} company in {city}, every missed call during business hours is a donated lead to whoever ranks below you.

The fix isn't complicated. Reply and I'll walk you through exactly what to change — takes 15 minutes.

{sender_name}`,
    },

    // --- Angle B: Quick Question (Low Commitment) ---
    {
      name: 'Follow-Up #1 — Quick Question',
      channel: 'email',
      status_stage: 'proposal_sent',
      step_order: 4,
      subject: 'Quick question, {first_name}',
      body: `{first_name},

Honest question — when a new lead comes in through your website or Google listing, what happens next?

Does it go to an email inbox? A CRM? Someone's phone? A shared voicemail?

I ask because the #1 predictor of whether a {service_type} company books the job isn't their pricing, their reviews, or even their reputation. It's how fast the lead gets to a human who can respond.

I put together that Loom video showing where {business_name} stands: {loom_url}

What did you think? Anything surprise you?

{sender_name}`,
    },

    // --- Angle C: Seasonal Urgency ---
    {
      name: 'Follow-Up #1 — Seasonal Timing',
      channel: 'email',
      status_stage: 'proposal_sent',
      step_order: 4,
      subject: '{city} {service_type} searches are spiking — is {business_name} ready?',
      body: `{first_name},

Heads up: search volume for "{service_type} near me" in the {city} area is climbing. Every year it follows the same pattern — slow build, then a flood right when {seasonal_trigger}.

The contractors who win that surge aren't the ones with the biggest ad budgets. They're the ones who respond in under 5 minutes while everyone else is taking 2-4 hours.

I showed this in the Loom video I sent: {loom_url}

Right now, {business_name} has a window to fix the response gap before {busy_season}. Once the rush hits, you'll be too busy to change anything.

15-minute call this week? I'll show you exactly what to set up.

{sender_name}
Fieldstack`,
    },

    // --- SMS ---
    {
      name: 'Follow-Up #1 — SMS',
      channel: 'sms',
      status_stage: 'proposal_sent',
      step_order: 4,
      subject: null,
      body: `Hey {first_name}, did the {business_name} video come through? Here it is again: {loom_url}. One thing that surprised most owners — the part at 1:45. Worth 3 min.`,
    },
    {
      name: 'Follow-Up #1 — SMS Question',
      channel: 'sms',
      status_stage: 'proposal_sent',
      step_order: 4,
      subject: null,
      body: `Quick Q {first_name} — when a new lead hits {business_name}, how long until someone calls back? Most owners guess 30 min but the real number is usually 3-4 hours.`,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: FOLLOW-UP #2 — SOCIAL PROOF (status: proposal_sent)
    // Purpose: Prove it works. Use specific numbers and real stories.
    // Timing: 3-4 days after Follow-Up #1.
    // ═══════════════════════════════════════════════════════════════════════

    // --- Angle A: Case Study with Specifics ---
    {
      name: 'Follow-Up #2 — Case Study',
      channel: 'email',
      status_stage: 'proposal_sent',
      step_order: 5,
      subject: 'This {service_type} company added 11 jobs/mo without new ads',
      body: `{first_name},

Short story — then I'll leave you alone.

We started working with a {service_type} contractor in {state} about four months ago. Similar size to {business_name}. Decent reviews, steady lead flow, but their close rate was stuck around 23%.

Turned out their average response time was 3 hours and 47 minutes. By the time they called back, homeowners had already booked someone else.

We set up automated speed-to-lead response. Under 20 seconds, every time — nights, weekends, holidays.

Within 60 days:
• Close rate: 23% → 58%
• New bookings: +11 per month
• Revenue increase: $14,300/mo
• Additional ad spend: $0

They didn't get more leads. They just stopped losing the ones they already had.

I think {business_name} has the same gap. The video I sent shows exactly where: {loom_url}

Worth a 15-minute call?

{sender_name}
Fieldstack`,
    },

    // --- Angle B: Industry Data / Market Trend ---
    {
      name: 'Follow-Up #2 — Industry Data',
      channel: 'email',
      status_stage: 'proposal_sent',
      step_order: 5,
      subject: 'The data on {service_type} response times is brutal',
      body: `{first_name},

I've been digging into response time data across {service_type} companies and wanted to share what I'm seeing:

The numbers:
• Average {service_type} company responds to a web lead in 3-5 hours
• 48% never respond at all (the lead just dies)
• Companies that respond in under 5 minutes are 21x more likely to book
• 78% of homeowners hire whoever calls back first

The trend:
The top 10% of contractors are getting faster while everyone else stays the same. This means the gap is widening. The fast companies are pulling further ahead every month.

Where {business_name} fits:
I showed your specific data in the video I sent last week: {loom_url}

This isn't about working harder. It's about setting up a system so leads get a response in under a minute — whether you're on a job site, eating dinner, or sleeping.

That's what we build at Fieldstack. Happy to show you how it works in 15 minutes.

{sender_name}`,
    },

    // --- Angle C: Competitor Movement ---
    {
      name: 'Follow-Up #2 — Competitor Pressure',
      channel: 'email',
      status_stage: 'proposal_sent',
      step_order: 5,
      subject: 'Other {service_type} companies in {city} are fixing this',
      body: `{first_name},

Figured you should know: we've been getting more calls from {service_type} companies in the {city} / {state} area lately.

Not sharing this to create pressure — sharing it because the math changes when your competitors get faster and you don't.

Right now, if {business_name} and a competitor both get the same lead, and they respond in 60 seconds while you respond in 2 hours — they book the job 9 times out of 10. Not because they're better. Because they're there.

The good news: you can flip that equation. The setup takes about a week, and once it's running, every lead gets a response in under a minute without you lifting a finger.

I laid out the specifics for {business_name} in the video: {loom_url}

Want to get ahead of this? Let's talk this week.

{sender_name}
Fieldstack`,
    },

    // --- SMS ---
    {
      name: 'Follow-Up #2 — SMS Social Proof',
      channel: 'sms',
      status_stage: 'proposal_sent',
      step_order: 5,
      subject: null,
      body: `{first_name}, quick stat: a {service_type} company like {business_name} went from 23% to 58% close rate just by responding to leads in under 60 seconds. Same leads, no new ads. Worth a call?`,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: BREAKUP (status: proposal_sent)
    // Purpose: Last touch. Leave value. Keep the door open.
    // Timing: 4-5 days after Follow-Up #2.
    // ═══════════════════════════════════════════════════════════════════════

    // --- Angle A: Honest / Direct ---
    {
      name: 'Breakup — Honest & Direct',
      channel: 'email',
      status_stage: 'proposal_sent',
      step_order: 6,
      subject: 'Should I close your file, {first_name}?',
      body: `{first_name},

I've sent a few emails about the speed test I ran for {business_name}. Haven't heard back, which is totally fine — I know you're running a business, not checking your inbox.

I'll keep this simple: should I close your file?

If the answer is "yes, not interested" — no hard feelings. I'll stop emailing today.

If the answer is "not right now" — just say when and I'll follow up then. No pressure.

And if the answer is "I've been meaning to reply" — here's the video one more time: {loom_url}. It's 3 minutes and it shows exactly what's happening with {business_name}'s lead response time.

Either way, one number to remember:

Every hour you wait to respond to a new lead, your chance of booking that job drops by 80%. That's the difference between a {avg_job_single} job booked and a {avg_job_single} job lost.

Your call, {first_name}.

{sender_name}
Fieldstack`,
    },

    // --- Angle B: Resource Dump (Value on Exit) ---
    {
      name: 'Breakup — Value Gift',
      channel: 'email',
      status_stage: 'proposal_sent',
      step_order: 6,
      subject: 'Free resources for {business_name} (no strings)',
      body: `{first_name},

This is my last email about the speed test. But I don't want to leave empty-handed, so here's a few things that'll help {business_name} regardless of whether we ever talk:

3 things you can do this week for free:

1. Turn on Google Business messaging. Most {service_type} companies in {city} don't have it enabled. Takes 5 minutes. Lets homeowners text you straight from your Google listing.

2. Set up a simple auto-reply. When a lead emails or fills out your form, send an instant reply: "Got it — we'll call you within 15 minutes." Even that small step cuts your lead loss in half.

3. Check your voicemail. Seriously. Call your own number. Is the voicemail full? Does it sound professional? Does it give them a reason to leave a message? 40% of {service_type} companies have a full or generic voicemail box.

The biggest thing: {pain_point}. If you're not responding fast, someone else is.

These are all in the video I made: {loom_url}

If you ever want to automate this stuff properly, you know where to find me.

{sender_name}
Fieldstack`,
    },

    // --- Angle C: Straight Math ---
    {
      name: 'Breakup — Numbers Don\'t Lie',
      channel: 'email',
      status_stage: 'proposal_sent',
      step_order: 6,
      subject: 'Last note — the math on {business_name}\'s leads',
      body: `{first_name},

Last email. Just want to leave you with the math.

If {business_name} gets {monthly_leads_single} leads per month (pretty standard for {service_type} in {city}):
• At a {close_rate_slow} close rate — you're leaving jobs on the table
• At a {close_rate_fast} close rate — that's what speed-to-lead gets you
• Average job value in your area: ~{avg_job_single}

That gap is {lost_revenue_monthly} per month. Same leads. Same ads. Same team.

The only variable? How fast you respond.

I know because I tested it: {loom_url}

Whenever you're ready, I'm here. No expiration date on this.

{sender_name}
Fieldstack`,
    },

    // --- SMS ---
    {
      name: 'Breakup — SMS',
      channel: 'sms',
      status_stage: 'proposal_sent',
      step_order: 6,
      subject: null,
      body: `{first_name}, last note from me. Your {business_name} speed test data: {loom_url}. No expiration — watch it whenever. Here if you need me.`,
    },
    {
      name: 'Breakup — SMS Direct',
      channel: 'sms',
      status_stage: 'proposal_sent',
      step_order: 6,
      subject: null,
      body: `Hey {first_name}, should I close your file or follow up later? Either way is fine. Just don't want to be that annoying text.`,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: RE-ENGAGEMENT (status: lost)
    // Purpose: Reconnect after 30-90 days. New angle, new value.
    // ═══════════════════════════════════════════════════════════════════════

    // --- Angle A: Fresh Data ---
    {
      name: 'Re-engage — Fresh Data',
      channel: 'email',
      status_stage: 'lost',
      step_order: 7,
      subject: '{first_name}, I ran a new test on {business_name}',
      body: `{first_name},

It's been a while. I ran a new speed test on {business_name} — curious if anything had changed.

Response time this time: {response_time}.

The {service_type} companies that locked in automated lead response early are pulling ahead in a way that's getting harder to catch. Whether things have improved since we last talked or the gap is still there — either way, there's a window right now to close it.

Not sending a new video unless you want one. But if you're open to a quick call, I'll show you exactly where things stand and what I'd change today.

No re-pitch. Just the data.

Worth 15 minutes?

{sender_name}
Fieldstack`,
    },

    // --- Angle B: Seasonal Trigger ---
    {
      name: 'Re-engage — Seasonal',
      channel: 'email',
      status_stage: 'lost',
      step_order: 7,
      subject: '{busy_season} is about to hit {city} — is {business_name} ready?',
      body: `{first_name},

Every year it's the same cycle: {seasonal_trigger}, phones start ringing, and {service_type} companies scramble to keep up.

Last time we talked, {business_name} was leaving some response time on the table. The leads were there — they just weren't getting caught fast enough.

Right now, before the rush hits, is the best time to fix this. Once you're knee-deep in jobs, there's no bandwidth to change anything.

Here's what the setup looks like:
• Week 1: We map your lead sources and response flow
• Week 2: Automated speed-to-lead goes live (under 60 seconds, every time)
• Week 3+: You stop losing leads to slower competitors

The contractors who set this up before their busy season see results within the first 2 weeks. The ones who wait usually reach out mid-season, frustrated, wishing they'd done it sooner.

Up to you, {first_name}. But the window is now.

{sender_name}
Fieldstack`,
    },

    // --- Angle C: New Capability ---
    {
      name: 'Re-engage — What\'s New',
      channel: 'email',
      status_stage: 'lost',
      step_order: 7,
      subject: 'We built something new — thought of {business_name}',
      body: `{first_name},

Quick update — we've added some things at Fieldstack since we last talked, and {business_name} was one of the first companies I thought of.

What's new:
• AI that responds in under 20 seconds and sounds like a real local person — not a bot
• Voice calls via a local area code number, plus SMS in the same conversation thread
• Asks homeowners to send damage photos via text, qualifies the job, and books your Google Calendar automatically
• Follow-up engine: SMS nudge at 4 hours, outbound voice call at 48 hours, 3 touches total before marking a lead dead
• Contractor SMS alerts the moment a lead qualifies and again when they book

Why I thought of you: when I tested {business_name}'s response time, the gap wasn't about effort — your team was just busy doing actual work. These tools fix the gap without adding anything to your plate.

We're doing a limited rollout in {state} right now. If you want an early look, I'll set up a 15-minute demo.

No pressure, no pitch history to rehash. Fresh start.

Interested?

{sender_name}
Fieldstack`,
    },

    // --- SMS ---
    {
      name: 'Re-engage — SMS',
      channel: 'sms',
      status_stage: 'lost',
      step_order: 7,
      subject: null,
      body: `Hey {first_name}, it's {sender_name} from Fieldstack. Been a while. We built some new tools for {service_type} companies — thought of {business_name}. Worth a fresh look? No rehash, just what's new.`,
    },
    {
      name: 'Re-engage — SMS Seasonal',
      channel: 'sms',
      status_stage: 'lost',
      step_order: 7,
      subject: null,
      body: `{first_name}, {busy_season} is ramping up in {city}. The speed test data I pulled for {business_name} is still relevant. Want a fresh look before things get crazy?`,
    },

    ...getLoomScriptTemplates(),
    ...getNewLoomScripts(),
  ];

  const stmt = `INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)`;
  templates.forEach(t => {
    db.run(stmt, [t.name, t.channel, t.status_stage, t.step_order, t.subject, t.body]);
  });
}

function seedDefaultSequence() {
  const count = get('SELECT COUNT(*) as c FROM sequences');
  if (count && count.c > 0) return;

  // Find the first email template for each step_order (1-7) to build the default sequence
  const steps = [];
  const delayDays = [0, 3, 5, 8, 12, 17, 45];
  const stepLabels = [
    'Mystery Shopper Test',
    'Problem Reveal — Loom Tease',
    'Loom Video Delivery',
    'Follow-Up #1',
    'Follow-Up #2 — Social Proof',
    'Breakup Email',
    'Re-engagement',
  ];

  for (let i = 1; i <= 7; i++) {
    const tpl = get(
      "SELECT id, name FROM templates WHERE step_order = ? AND channel = 'email' AND is_default = 1 ORDER BY id ASC",
      [i]
    );
    if (tpl) {
      steps.push({
        order: i,
        delay_days: delayDays[i - 1],
        channel: 'email',
        template_id: tpl.id,
        label: stepLabels[i - 1],
      });
    }
  }

  if (steps.length > 0) {
    const result = db.run(
      "INSERT INTO sequences (name, description, steps, is_active, auto_send, auto_send_after_step) VALUES (?, ?, ?, 1, 1, 1)",
      [
        '7-Step Outreach',
        'Default outreach sequence: mystery shopper test → reveal → video delivery → follow-ups → breakup → re-engagement.',
        JSON.stringify(steps),
      ]
    );
    // Set as default sequence for auto-enrollment
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_sequence_id', ?)", [String(result.lastInsertRowid)]);
  }
}

function seedColdOutreachSequence() {
  // Only seed once — check if cold outreach sequence already exists
  const existing = get("SELECT id FROM sequences WHERE name = 'Cold Outreach (3-Step)'");
  if (existing) return;

  console.log('[DB] Seeding cold outreach email templates + sequence...');

  // Step 1: Hook email (Day 0)
  const t1 = db.run(
    "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [
      'Cold Outreach — Hook',
      'email',
      'new',
      1,
      'quick question, {first_name}',
      `Hey {first_name},

Do you have a system that texts back website leads within 5 minutes when you're on a job site?

Most {service_type} contractors in {city} don't — which means they lose jobs to whoever answers first. The average contractor takes 47 hours to respond to a web lead.

We built an AI that texts every new lead within 90 seconds, 24/7. Most of our clients book 3-5 extra jobs the first month from the same traffic they already have.

Worth a 15-minute call this week? I can show you exactly how it works for {service_type} companies.

— {sender_name}
FieldStack`,
    ]
  );

  // Step 2: Proof email (Day 4)
  const t2 = db.run(
    "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [
      'Cold Outreach — Proof',
      'email',
      'new',
      2,
      'Re: quick question',
      `Hey {first_name},

Wanted to follow up on this. One of our {service_type} clients went from missing 60% of their web leads to booking 4-5 extra quotes per week in the first month — all from the same website traffic they already had.

The difference was responding in 90 seconds instead of the next morning.

Still interested in a quick look? Takes 15 minutes and you'll know right away if it makes sense for {business_name}.

{booking_link}

— {sender_name}`,
    ]
  );

  // Step 3: Breakup email (Day 9)
  const t3 = db.run(
    "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [
      'Cold Outreach — Breakup',
      'email',
      'new',
      3,
      'closing the loop',
      `{first_name}, I'll leave you alone after this.

If you ever want to see how {service_type} contractors are automating lead response without hiring anyone, just reply "interested" and I'll send the info.

No pressure either way. Good luck this season.

— {sender_name}
FieldStack`,
    ]
  );

  // Create the sequence
  const steps = [
    { order: 1, delay_days: 0, channel: 'email', template_id: Number(t1.lastInsertRowid), label: 'Cold Hook' },
    { order: 2, delay_days: 4, channel: 'email', template_id: Number(t2.lastInsertRowid), label: 'Social Proof' },
    { order: 3, delay_days: 9, channel: 'email', template_id: Number(t3.lastInsertRowid), label: 'Breakup' },
  ];

  db.run(
    "INSERT INTO sequences (name, description, steps, is_active, auto_send, auto_send_after_step, auto_flush_overdue) VALUES (?, ?, ?, 1, 1, 0, 1)",
    [
      'Cold Outreach (3-Step)',
      'Top-of-funnel cold email sequence: hook → proof → breakup. Auto-sends all 3 steps. Replies feed into Loom workflow.',
      JSON.stringify(steps),
    ]
  );
}

function seedAutoOutreachSequence() {
  const existing = get("SELECT id FROM sequences WHERE name = 'Auto Outreach (5-Step)'");
  if (existing) return;

  console.log('[DB] Seeding 5-step auto outreach templates + sequence...');

  const t1 = db.run(
    "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [
      'Auto Outreach — Hook',
      'email',
      'new',
      1,
      'question for {business_name}',
      `Hey {first_name},

Quick question — when a homeowner fills out your contact form at 7pm on a Tuesday, how fast does {business_name} follow up?

Most {service_type} contractors take 12–47 hours. By that time, the homeowner has called two other companies.

I built an AI that texts back every new lead within 90 seconds, books the appointment, and works 24/7 while you're on job sites. Worth a 15-minute call this week?

— {sender_name}
FieldStack`,
    ]
  );

  const t2 = db.run(
    "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [
      'Auto Outreach — Proof',
      'email',
      'new',
      2,
      'Re: question for {business_name}',
      `{first_name}, following up —

One of my {service_type} clients in Texas was leaving roughly $8,000/month on the table from unanswered web leads. We turned on the AI response system and they booked 6 extra jobs the first month — same website traffic, zero extra ad spend.

Happy to show you what that looks like for {business_name}: {booking_link}

— {sender_name}`,
    ]
  );

  const t3 = db.run(
    "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [
      'Auto Outreach — Audit',
      'email',
      'new',
      3,
      'free lead-response audit for {business_name}',
      `{first_name}, different ask this time —

I'll run a free lead-response audit for {business_name}. I'll test your contact form, measure the response time, and show you exactly how many leads you're likely losing per week.

Takes 10 minutes to set up, no pitch. Want me to run it?

— {sender_name}
FieldStack`,
    ]
  );

  const t4 = db.run(
    "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [
      'Auto Outreach — Scarcity',
      'email',
      'new',
      4,
      'one spot left in {city}',
      `{first_name}, I keep my contractor count small by market so results stay strong.

I have one open spot for {city} this month. If {business_name} wants it before another {service_type} company grabs it: {booking_link}

If not, no hard feelings.

— {sender_name}`,
    ]
  );

  const t5 = db.run(
    "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [
      'Auto Outreach — Breakup',
      'email',
      'new',
      5,
      'closing your file',
      `{first_name}, I'll stop reaching out after this.

If {business_name} ever decides to stop losing jobs to slow response times, I'm one reply away.

— {sender_name}
FieldStack`,
    ]
  );

  const steps = [
    { order: 1, delay_days: 0, channel: 'email', template_id: Number(t1.lastInsertRowid), label: 'Hook' },
    { order: 2, delay_days: 3, channel: 'email', template_id: Number(t2.lastInsertRowid), label: 'Social Proof' },
    { order: 3, delay_days: 7, channel: 'email', template_id: Number(t3.lastInsertRowid), label: 'Free Audit' },
    { order: 4, delay_days: 14, channel: 'email', template_id: Number(t4.lastInsertRowid), label: 'Scarcity' },
    { order: 5, delay_days: 21, channel: 'email', template_id: Number(t5.lastInsertRowid), label: 'Breakup' },
  ];

  db.run(
    "INSERT INTO sequences (name, description, steps, is_active, auto_send, auto_send_after_step, auto_flush_overdue) VALUES (?, ?, ?, 1, 1, 0, 1)",
    [
      'Auto Outreach (5-Step)',
      'Fully automated 5-email sequence: hook → proof → audit offer → scarcity → breakup. All steps auto-send over 21 days. No Loom or manual setup required.',
      JSON.stringify(steps),
    ]
  );
}

function migratePostCallEmailTemplates() {
  const existing = get("SELECT id FROM templates WHERE name = 'Post-Call — Voicemail Follow-Up' AND is_default = 1 LIMIT 1");
  if (existing) return;
  console.log('[DB] Adding post-call email follow-up templates...');

  const stmt = "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, 'email', 'post_call', ?, ?, ?, 1)";

  db.run(stmt, [
    'Post-Call — Voicemail Follow-Up',
    1,
    'Just tried reaching you',
    `Hey {first_name},

Tried calling {business_name} just now but didn't want to leave a long voicemail.

Quick version: I help {service_type} contractors in {city} make sure every website lead gets a text back within 90 seconds — even at 10 PM on a Saturday.

Worth a 2-minute look?

{sender_name}
FieldStack | {sender_website}
{sender_phone}`,
  ]);

  db.run(stmt, [
    'Post-Call — Callback Requested',
    2,
    'Following up — {business_name}',
    `Hey {first_name},

We just spoke briefly — you mentioned catching up at a better time. Here's the short version:

I help {service_type} contractors in {city} stop losing website leads to slow response times. The system texts every new lead within 90 seconds. Guarantee: 5 booked quotes in 30 days or you don't pay.

What day and time works best for a quick 10-minute call?

{sender_name}
FieldStack | {sender_website}
{sender_phone}`,
  ]);

  db.run(stmt, [
    'Post-Call — Interest Follow-Up',
    3,
    'Next steps — {business_name}',
    `Hey {first_name},

Great speaking with you just now.

The system texts every new lead within 90 seconds, handles the back-and-forth, and books the appointment — while you're on the job site. Guarantee: 5 booked quotes in 30 days or you don't pay.

Book a 15-minute call to see it live: {booking_link}

Talk soon,
{sender_name}
FieldStack | {sender_website}
{sender_phone}`,
  ]);
}

function migratePostCallEmailSignatures() {
  // Patch existing post-call templates to include phone + website in signature
  const voicemail = get("SELECT id, body FROM templates WHERE name = 'Post-Call — Voicemail Follow-Up' LIMIT 1");
  if (voicemail && !voicemail.body.includes('{sender_website}')) {
    db.run("UPDATE templates SET body = replace(body, '{sender_name}\nFieldStack', '{sender_name}\nFieldStack | {sender_website}\n{sender_phone}') WHERE name LIKE 'Post-Call%'");
    // Handle the "Talk soon," variant in Interest Follow-Up
    db.run("UPDATE templates SET body = replace(body, 'Talk soon,\n{sender_name}\nFieldStack | {sender_website}', 'Talk soon,\n{sender_name}\nFieldStack | {sender_website}') WHERE name = 'Post-Call — Interest Follow-Up'");
    console.log('[DB] Updated post-call email signatures with phone + website');
  }
}

function migratePostCallSmsTemplates() {
  const existing = get("SELECT id FROM templates WHERE name = 'Post-Call SMS — No Answer' LIMIT 1");
  if (existing) return;
  console.log('[DB] Adding post-call SMS templates...');
  const stmt = "INSERT INTO templates (name, channel, status_stage, step_order, subject, body, is_default) VALUES (?, 'sms', 'post_call', ?, NULL, ?, 1)";
  db.run(stmt, [
    'Post-Call SMS — No Answer', 1,
    "Hey {first_name}, I just tried calling {business_name} — didn't want to leave a voicemail. Do you have 2 minutes to connect this week?",
  ]);
  db.run(stmt, [
    'Post-Call SMS — Voicemail', 2,
    "Hey {first_name}, just left a voicemail for {business_name}. Quick version: I help {service_type} contractors get back to every website lead in 90 seconds. Worth a call this week?",
  ]);
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  // Keep a rolling backup to prevent data loss from sql.js in-memory overwrites
  if (fs.existsSync(DB_PATH)) {
    const backupPath = DB_PATH + '.bak';
    try { fs.copyFileSync(DB_PATH, backupPath); } catch {}
  }
  fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// Helper: run a query and return all rows as objects
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run a query and return the first row as an object
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

// Helper: run an insert/update/delete, save to disk, return lastInsertRowid
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  const rowId = db.exec('SELECT last_insert_rowid() as id')[0];
  const lastId = rowId ? rowId.values[0][0] : null;
  return { lastInsertRowid: lastId };
}

// Helper: run multiple statements (for bulk ops)
function runBatch(statements) {
  statements.forEach(({ sql, params }) => db.run(sql, params));
  saveDb();
}

module.exports = { initDb, getDb, saveDb, all, get, run, runBatch };
