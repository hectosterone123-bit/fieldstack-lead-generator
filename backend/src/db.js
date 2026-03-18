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

  // Migration: unsubscribe support
  try { db.run('ALTER TABLE leads ADD COLUMN unsubscribed_at DATETIME'); } catch(e) {}
  try { db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('app_url', '')"); } catch(e) {}

  // Migration: re-seed templates if they don't have niche variables
  migrateTemplatesToNiche();

  // Migration: re-seed loom scripts if they still use placeholder variables
  migrateLoomScripts();

  // Migration: add direct loom delivery email templates if missing
  migrateDirectLoomEmails();

  // Migration: add 4 new high-impact loom scripts (v2)
  migrateLoomScriptsV2();

  // Seed default templates if table is empty
  seedDefaultTemplates();

  // Seed default sequence if table is empty
  seedDefaultSequence();

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

I submitted a service request to {business_name} last week — same way a homeowner in {city} would. I recorded what happened and turned it into a 90-second Loom video. No sales pitch in it. Just timestamps and data.

Here it is: [INSERT LOOM LINK HERE]

The short version: there's a gap between when leads hit your site and when they hear back. I show exactly what that costs in bookings — and one fix that closes it in under 72 hours.

Worth a watch. If anything lands, reply and we can talk through it.

[Your Name]
Fieldstack`
  ]);
  db.run(stmt, [
    'Reveal — Direct Loom (Competitor)', 'email', 'contacted', 2,
    'Built this for {business_name} — 90 seconds',
    `{first_name},

I tested lead response times across {service_type} companies in {city} last week — submitted identical requests to {business_name} and three competitors and timed every response.

Made a short video showing the results side by side: [INSERT LOOM LINK HERE]

Not sending this to criticize. Sending it because the gap is fixable in 72 hours and most owners don't know it exists until they see the timestamps.

Watch the part at the 0:45 mark. That's where it gets expensive.

[Your Name]
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

I submitted a service request to {business_name} last week — same way a homeowner in {city} would. I recorded what happened and turned it into a 90-second Loom video. No sales pitch in it. Just timestamps and data.

Here it is: [INSERT LOOM LINK HERE]

The short version: there's a gap between when leads hit your site and when they hear back. I show exactly what that costs in bookings — and one fix that closes it in under 72 hours.

Worth a watch. If anything lands, reply and we can talk through it.

[Your Name]
Fieldstack`,
    },

    // --- Direct Loom Delivery B: Competitor Angle ---
    {
      name: 'Reveal — Direct Loom (Competitor)',
      channel: 'email',
      status_stage: 'contacted',
      step_order: 2,
      subject: 'Built this for {business_name} — 90 seconds',
      body: `{first_name},

I tested lead response times across {service_type} companies in {city} last week — submitted identical requests to {business_name} and three competitors and timed every response.

Made a short video showing the results side by side: [INSERT LOOM LINK HERE]

Not sending this to criticize. Sending it because the gap is fixable in 72 hours and most owners don't know it exists until they see the timestamps.

Watch the part at the 0:45 mark. That's where it gets expensive.

[Your Name]
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

Not a sales pitch. Just your data.

Want me to send it over? Reply "yes" and I'll drop the link.

[Your Name]
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

[Your Name]
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

No sales pitch in the video. Literally just data and math.

Want me to send the link? Just reply "show me."

[Your Name]
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

[INSERT LOOM LINK HERE]

What you'll see in 3 minutes:
1. The exact response time when I submitted a lead to {business_name}
2. Side-by-side comparison with other {service_type} companies in {city}
3. Three specific fixes — the first one takes about 10 minutes

One thing to watch for: at the 1:45 mark I show what a homeowner sees when they're waiting for a callback. It changes how you think about every lead sitting in your inbox.

After you watch, I'm happy to jump on a 15-minute call to talk through what makes sense for {business_name} specifically. No pressure — just want to make sure the video makes sense.

[Your Name]
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

Here's your Loom: [INSERT LOOM LINK HERE]

I walk through:
• Your actual response data (timestamp and all)
• The exact moment a homeowner in {city} would have moved on to your competitor
• A side-by-side with the fastest {service_type} responder in your area
• What I'd change first, second, and third — with specific steps

I spent about 45 minutes putting this together because the data told a clear story. {business_name} is doing a lot of things right — the lead generation is clearly working. The gap is what happens after the lead comes in.

Worth a watch. If anything clicks, reply and we can talk through it.

[Your Name]
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

Here's your speed test video: [INSERT LOOM LINK HERE]

Fair warning: most {service_type} owners who watch this end up making changes the same day. Not because I'm persuasive — because the data is hard to unsee.

Here's my prediction: you'll fix problem #2 before the video even finishes. It's that obvious once you see it.

The three things I cover:
1. Your response time vs. the {city} average (spoiler: there's a gap)
2. A dead-simple settings change that most {service_type} companies miss
3. The follow-up sequence your competitors are running that you aren't

Total watch time: 3 minutes and 12 seconds.

If I'm wrong and none of it is useful, tell me. I'll buy you a coffee for wasting your time.

[Your Name]
Fieldstack`,
    },

    // --- SMS variants ---
    {
      name: 'Video Delivery — SMS',
      channel: 'sms',
      status_stage: 'qualified',
      step_order: 3,
      subject: null,
      body: `{first_name}, here's your {business_name} speed test video: [LOOM LINK] — watch the part at 1:45, that's where it gets interesting. 3 min total.`,
    },
    {
      name: 'Video Delivery — SMS Challenge',
      channel: 'sms',
      status_stage: 'qualified',
      step_order: 3,
      subject: null,
      body: `Your video is ready: [LOOM LINK]. My prediction: you'll want to fix problem #2 before it's even done playing. Let me know what you think, {first_name}.`,
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
      subject: 'Quick thought on {business_name} (+ the video link again)',
      body: `{first_name},

Following up on the speed test video. In case it got buried: [INSERT LOOM LINK]

One thing I didn't mention in the video that's worth knowing:

Google's own data shows that 60% of mobile searchers call a business directly from search results — and if nobody picks up, they immediately call the next result. They don't leave voicemails. They don't wait. They just move on.

For a {service_type} company in {city}, that means every missed call during business hours is essentially a donated lead to whoever ranks below you.

The fix isn't complicated. Happy to walk through it in a 15-minute call if you're interested.

Either way, the video has the full breakdown.

[Your Name]`,
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

I put together that Loom video showing where {business_name} stands on this. If you haven't watched it yet: [INSERT LOOM LINK]

And if you have watched it — what did you think? Anything surprise you?

[Your Name]`,
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

I showed this in the Loom video I sent: [INSERT LOOM LINK]

Right now, {business_name} has a window to fix the response gap before {busy_season}. Once the rush hits, you'll be too busy to change anything.

15-minute call this week? I'll show you exactly what to set up.

[Your Name]
Fieldstack`,
    },

    // --- SMS ---
    {
      name: 'Follow-Up #1 — SMS',
      channel: 'sms',
      status_stage: 'proposal_sent',
      step_order: 4,
      subject: null,
      body: `Hey {first_name}, did the {business_name} video come through? Here it is again: [LOOM LINK]. One thing that surprised most owners — the part at 1:45. Worth 3 min.`,
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

I think {business_name} has the same gap. The video I sent shows exactly where: [INSERT LOOM LINK]

Worth a 15-minute call?

[Your Name]
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
I showed your specific data in the video I sent last week: [INSERT LOOM LINK]

This isn't about working harder. It's about setting up a system so leads get a response in under a minute — whether you're on a job site, eating dinner, or sleeping.

That's what we build at Fieldstack. Happy to show you how it works in 15 minutes.

[Your Name]`,
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

I laid out the specifics for {business_name} in the video: [INSERT LOOM LINK]

Want to get ahead of this? Let's talk this week.

[Your Name]
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

And if the answer is "I've been meaning to reply" — here's the video one more time: [INSERT LOOM LINK]. It's 3 minutes and it shows exactly what's happening with {business_name}'s lead response time.

Either way, one number to remember:

Every hour you wait to respond to a new lead, your chance of booking that job drops by 80%. That's the difference between a {avg_job_single} job booked and a {avg_job_single} job lost.

Your call, {first_name}.

[Your Name]
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

These are all in the video I made: [INSERT LOOM LINK]

If you ever want to automate this stuff properly, you know where to find me.

[Your Name]
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

I know because I tested it: [INSERT LOOM LINK]

Whenever you're ready, I'm here. No expiration date on this.

[Your Name]
Fieldstack`,
    },

    // --- SMS ---
    {
      name: 'Breakup — SMS',
      channel: 'sms',
      status_stage: 'proposal_sent',
      step_order: 6,
      subject: null,
      body: `{first_name}, last note from me. Your {business_name} speed test data: [LOOM LINK]. No expiration — watch it whenever. Here if you need me.`,
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

It's been a while. I ran a new speed test on {business_name} — curious if anything had changed since we last spoke.

Here's what I found: [one sentence summary — better/worse/same].

A lot has happened in the {service_type} space in {state} since we last talked. The contractors who locked in automated lead response early are now pulling ahead in a way that's getting harder to catch.

I'm not sending a new video (unless you want one). But if things have shifted on your end and you want a fresh look at where {business_name} stands today — happy to jump on a call.

No re-pitch. Just an honest update.

Worth 15 minutes?

[Your Name]
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

[Your Name]
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

[Your Name]
Fieldstack`,
    },

    // --- SMS ---
    {
      name: 'Re-engage — SMS',
      channel: 'sms',
      status_stage: 'lost',
      step_order: 7,
      subject: null,
      body: `Hey {first_name}, it's [Your Name] from Fieldstack. Been a while. We built some new tools for {service_type} companies — thought of {business_name}. Worth a fresh look? No rehash, just what's new.`,
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
    db.run(
      "INSERT INTO sequences (name, description, steps, is_active) VALUES (?, ?, ?, 1)",
      [
        '7-Step Outreach',
        'Default outreach sequence: mystery shopper test → reveal → video delivery → follow-ups → breakup → re-engagement.',
        JSON.stringify(steps),
      ]
    );
  }
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
