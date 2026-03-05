const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// On Railway, RAILWAY_VOLUME_MOUNT_PATH is auto-set to the volume mount (e.g. /data)
// Locally, fall back to backend/data/
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
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

  // Migration: re-seed templates if they don't have niche variables
  migrateTemplatesToNiche();

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

We set up automated speed-to-lead response. Under 60 seconds, every time — nights, weekends, holidays.

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
• AI-powered instant response that sounds like a real person (not a robot)
• Automatic follow-up sequences — if a lead doesn't book, the system follows up 3x over 7 days
• Real-time competitor speed tracking for {service_type} companies in {city}

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

    // ═══════════════════════════════════════════════════════════════════════
    // LOOM SCRIPTS — Video walkthroughs for personalized outreach
    // Purpose: Under-90-second scripts showing prospects how much money
    // they're losing. Not about how the code works — about the cost of inaction.
    // ═══════════════════════════════════════════════════════════════════════

    // --- Script 1: The "Anti-Ghosting" Loom ---
    {
      name: 'Loom — Anti-Ghosting Script',
      channel: 'loom_script',
      status_stage: 'contacted',
      step_order: 2,
      subject: null,
      body: `THE "ANTI-GHOSTING" LOOM SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): Their website contact form.
Tab 2 (Open): Your "Sam AI" dashboard (with their logo).

0:00 - 0:15: THE HOOK (The Ghost Test)
"Hey {first_name}, this is [Your Name] from Fieldstack. I'm looking at your website right now. I actually filled out your 'Request a Quote' form about 20 minutes ago, and I noticed I haven't received a text or a call back yet."

0:15 - 0:35: THE PAIN (The Leaky Bucket)
"I'm sure you're busy on a job site, but here's the problem: Most homeowners call the first 3 guys on Google. If you don't reply in under 5 minutes, you usually lose that lead to the guy who did pick up the phone. {loom_pain}"

0:35 - 1:00: THE REVEAL (Switch to Tab 2)
"That's why I built this for you. I've prepped a custom AI Sales Assistant named Sam. Look at my screen — {loom_reveal} It uses a local {city} number so it feels like a real neighbor is helping them out."

1:00 - 1:20: THE "NO-BRAINER" ASK
"I'm looking for just one partner in {city} to run this for. I'll do the full setup in 72 hours, and if Sam doesn't book you at least 5 qualified quotes this month, you don't pay me a cent. I take all the risk."

1:20 - 1:30: THE CLOSER
"If you want to stop those website leads from 'ghosting' you, just reply to this email or message me back. Worth a 5-minute chat? Thanks!"

TIPS:
• Smile at the start — Loom shows a tiny circle of your face
• Point your mouse at their logo on Tab 2 to prove it's custom
• Keep energy conversational, not salesy`,
    },

    // --- Script 2: The "Money Left on the Table" Loom ---
    {
      name: 'Loom — Money Left on the Table',
      channel: 'loom_script',
      status_stage: 'contacted',
      step_order: 2,
      subject: null,
      body: `THE "MONEY LEFT ON THE TABLE" LOOM SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): Google search results for "{service_type} near me {city}"
Tab 2 (Open): A simple calculator or notepad with their revenue math
Tab 3 (Open): Your "Sam AI" dashboard (with their logo)

0:00 - 0:15: THE HOOK (The Math Problem)
"Hey {first_name}, this is [Your Name] from Fieldstack. I did some quick math on {business_name} and I think you're leaving {lost_revenue_monthly} on the table every single month. Let me show you why."

0:15 - 0:40: THE PAIN (Switch to Tab 2 — The Calculator)
"Here's the math. {loom_math_intro} If {business_name} gets {monthly_leads_single} leads a month — which is pretty standard for your area — and you're closing around {close_rate_slow}, you're leaving a lot of jobs on the table. But here's what the data says: contractors who respond in under 5 minutes close at {close_rate_fast}. Same leads, same pricing. That gap is the money nobody sees walking out the door."

0:40 - 1:05: THE REVEAL (Switch to Tab 3)
"So I set this up for {business_name}. When a lead hits your website, your Google listing, or even calls and nobody picks up — {loom_reveal} You don't have to stop what you're doing on the job site."

1:05 - 1:20: THE ASK
"I'm rolling this out to one {service_type} company per market. {city} is open right now. If Sam doesn't add at least 5 extra bookings this month, you pay nothing. Zero risk on your end."

1:20 - 1:30: THE CLOSER
"Reply to this and I'll get {business_name} set up in 72 hours. Talk soon, {first_name}."

TIPS:
• Show the actual math on screen — visual proof > verbal claims
• Pause on the revenue gap number — let it sink in
• Keep your tone like you're sharing a discovery, not selling`,
    },

    // --- Script 3: The "Competitor Speed Test" Loom ---
    {
      name: 'Loom — Competitor Speed Test',
      channel: 'loom_script',
      status_stage: 'qualified',
      step_order: 3,
      subject: null,
      body: `THE "COMPETITOR SPEED TEST" LOOM SCRIPT
Runtime: Under 90 seconds
Tab 1 (Open): A stopwatch or timer app
Tab 2 (Open): Screenshots or notes showing competitor response times
Tab 3 (Open): Your "Sam AI" dashboard (with their logo)

0:00 - 0:15: THE HOOK (The Race They Don't Know They're In)
"Hey {first_name}, this is [Your Name] from Fieldstack. Last week I submitted service requests to {business_name} and three of your competitors in {city} — the exact same way a homeowner would. I timed every single response. The results are brutal, and I think you need to see this."

0:15 - 0:40: THE DATA (Switch between Tab 1 and Tab 2)
"Here's what happened. Competitor A — responded in 47 seconds. Text message, asked about the job, offered to schedule. Competitor B — 4 minutes, phone call, friendly, tried to book on the spot. Competitor C — 22 minutes, sent an email. And {business_name}? I'm going to be honest with you — [X hours/no response]. By the time your team got back to me, I'd already heard from two other companies and one had offered to come out the next morning. That's exactly what your real customers are experiencing right now."

0:40 - 1:05: THE REVEAL (Switch to Tab 3)
"Here's what I built for you. This is Sam — an AI assistant that responds to every single lead in under 20 seconds. Texts them from a local {city} number, qualifies the job, and books the estimate. Your competitors are winning right now because they're faster — not because they're better. This closes that gap overnight."

1:05 - 1:20: THE ASK
"I'm only setting this up for one {service_type} company per zip code so there's no conflict. If Sam doesn't book you 5 qualified estimates this month, you don't pay a dime. For {service_type} jobs averaging {avg_job_single}, that's real money."

1:20 - 1:30: THE CLOSER
"Reply back and I'll have {business_name} live in 72 hours. Your competitors are already fast — let's make you faster. Talk soon."

TIPS:
• Show real timestamps — specificity builds trust
• Don't trash competitors, just state the facts neutrally
• Reference their specific trade ({service_type}) — makes it feel personalized
• Let the gap speak for itself — the silence after their response time is powerful`,
    },
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
