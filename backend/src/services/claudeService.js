const fetch = require('node-fetch');
const db = require('../db');
const { renderTemplate } = require('./templateService');
const { recomputeHeatScore } = require('./heatScoreService');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const MODEL = 'gemini-2.5-flash';

const VALID_STATUSES = ['new', 'contacted', 'qualified', 'proposal_sent', 'booked', 'lost', 'closed_won'];
const FOLLOWUP_DAYS = { new: 1, contacted: 3, qualified: 2, proposal_sent: 5, booked: 1 };

function autoUpdateHeatScore(id) {
  const lead = db.get('SELECT * FROM leads WHERE id = ?', [id]);
  if (!lead) return;
  const newScore = recomputeHeatScore(lead);
  if (newScore !== lead.heat_score) {
    db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newScore, id]);
  }
}

const SYSTEM_PROMPT = `You are FieldStack AI, a sales copilot for HVAC and home service contractors. You help manage a lead generation CRM.

Your capabilities:
- Look up and analyze leads in the pipeline
- Recommend follow-up priorities based on heat scores and status
- Draft personalized outreach emails, SMS, and call scripts
- Provide sales coaching and strategy advice for the contractor services industry
- Suggest which templates to use for specific leads
- Analyze pipeline health and conversion metrics
- Update lead statuses through the pipeline (e.g., mark as contacted, qualified, booked)
- Log activities like calls, emails, SMS, and notes on leads
- Schedule follow-up reminders for leads
- Adjust heat scores manually
- Add notes to leads
- Send actual SMS text messages to leads via Twilio
- Enroll leads in automated outreach sequences
- List available sequences
- Send emails to individual leads using templates (Resend)
- Mass-email multiple leads matching a filter using a template

Guidelines:
- Be concise and actionable. Contractors are busy.
- When discussing leads, mention specific business names and key data points.
- When drafting outreach, be direct, value-focused, no fluff.
- Use the tools to look up real data before answering questions about leads.
- Heat score guide: 0-30 = cold, 31-60 = warm, 61-85 = hot, 86-100 = on fire.
- Status pipeline: new → contacted → qualified → proposal_sent → booked → closed_won (or lost).
- Always recommend a next concrete action (e.g., "call them today", "send the Step 2 email").
- Format responses with markdown for readability.

IMPORTANT RULES FOR ACTIONS:
- Before calling send_sms: tell the user exactly what message you will send and to which lead/number. Ask "Should I send this?" and wait for explicit confirmation (yes, send it, go ahead) before calling the tool.
- Before calling enroll_in_sequence: confirm which lead and which sequence. Ask "Should I enroll [Name] in [Sequence]?" and wait for confirmation.
- Before sending SMS, always check the lead has a phone number using get_lead. If no phone, tell the user.
- Keep all SMS messages under 160 characters. No emojis. Professional, direct tone.
- Before calling send_email: call preview_template first, show the user the subject and first ~150 chars of the body. Ask "Should I send this?" and wait for yes.
- Before calling bulk_send_email: call search_leads with the same status/service_type filter to show which leads will receive it and the count. Say "I'll send [template name] to X leads: [list names]. Should I proceed?" Wait for explicit confirmation before sending.
- Never bulk send email without confirming the count and template name first.
- Before calling bulk_personalized_send: call search_leads first to show the user which leads will be targeted. Say "I'll send personalized emails to X leads: [list names] using [template]. Each email will be uniquely written. Should I proceed?" Wait for explicit confirmation.
- Use personalize_email to preview a single personalized email before sending. Show the user the subject and first 200 chars of the body.`;

// Tool definitions (converted to OpenAI function format)
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_lead',
      description: 'Get detailed info about a specific lead by ID, including recent activities and enrichment data.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'The lead ID' }
        },
        required: ['lead_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_leads',
      description: 'Search and filter leads. Use for questions like "which leads are new", "show me hot leads", "leads in Dallas", etc.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'proposal_sent', 'booked', 'lost', 'closed_won'] },
          service_type: { type: 'string', enum: ['hvac', 'plumbing', 'electrical', 'roofing', 'landscaping', 'pest_control', 'general'] },
          search: { type: 'string', description: 'Search by business name, city, phone, or email' },
          sort: { type: 'string', enum: ['heat_score', 'created_at', 'updated_at', 'estimated_value', 'business_name'], description: 'Sort field (default: heat_score)' },
          order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order (default: desc)' },
          limit: { type: 'integer', description: 'Max results (default 10, max 25)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_followups',
      description: 'Get leads with follow-ups due today and overdue follow-ups.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description: 'Get dashboard statistics: total leads, pipeline value, conversion rate, leads by status and service type.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_templates',
      description: 'Get outreach templates. Filter by channel (email/sms/call_script) and/or status stage.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['email', 'sms', 'call_script'] },
          status_stage: { type: 'string', enum: ['new', 'contacted', 'qualified', 'proposal_sent', 'booked', 'lost', 'closed_won'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'preview_template',
      description: 'Render a template with a specific lead\'s data, replacing variables like {business_name}, {city}, etc. Returns the filled-in subject and body.',
      parameters: {
        type: 'object',
        properties: {
          template_id: { type: 'integer' },
          lead_id: { type: 'integer' }
        },
        required: ['template_id', 'lead_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_lead_status',
      description: 'Change a lead\'s pipeline status. Use when the user says things like "mark as contacted", "move to qualified", "close the deal", "mark as lost". This also auto-schedules a follow-up and recomputes the heat score.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'The lead ID' },
          status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'proposal_sent', 'booked', 'lost', 'closed_won'] }
        },
        required: ['lead_id', 'status']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_activity',
      description: 'Log a call attempt, email sent, SMS sent, or note on a lead. Use when the user says "log a call", "I emailed them", "sent a text", or "add a note".',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'The lead ID' },
          type: { type: 'string', enum: ['note', 'call_attempt', 'email_sent', 'sms_sent'], description: 'Activity type (default: note)' },
          title: { type: 'string', description: 'Short title for the activity' },
          description: { type: 'string', description: 'Optional longer description' }
        },
        required: ['lead_id', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_followup',
      description: 'Schedule a follow-up reminder for a lead N days from now. Use when the user says "remind me in 3 days", "follow up next week", "snooze this lead".',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'The lead ID' },
          days: { type: 'integer', description: 'Number of days from now (minimum 1)' }
        },
        required: ['lead_id', 'days']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_heat_score',
      description: 'Manually set a lead\'s heat score (0-100). Use when the user says "set heat to 80", "this lead is hot", "cool down this lead".',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'The lead ID' },
          heat_score: { type: 'integer', description: 'New heat score (0-100)' }
        },
        required: ['lead_id', 'heat_score']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_note',
      description: 'Add a note to a lead\'s notes field. Appends to existing notes. Use when the user says "note that...", "remember that...", "jot down...".',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'The lead ID' },
          note: { type: 'string', description: 'The note text to add' }
        },
        required: ['lead_id', 'note']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sequences',
      description: 'List all active outreach sequences available for enrollment. Use this before enrolling a lead to show the user what sequences exist and their step counts.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_sms',
      description: 'Send an actual SMS text message to a lead via Twilio. IMPORTANT: Always show the user the exact message content and get explicit confirmation before calling this tool. Verify the lead has a phone number first using get_lead.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'ID of the lead to text' },
          message: { type: 'string', description: 'The SMS message body. Max 160 characters. No emojis.' }
        },
        required: ['lead_id', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enroll_in_sequence',
      description: 'Enroll a lead in an automated outreach sequence. Use get_sequences first to find available sequences. Always get user confirmation before enrolling.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'ID of the lead to enroll' },
          sequence_id: { type: 'integer', description: 'ID of the sequence to enroll them in' }
        },
        required: ['lead_id', 'sequence_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Send an email to a single lead using a template via Resend. Use get_templates(channel: "email") to find templates, use preview_template to show the rendered content. IMPORTANT: Always show the user the email subject and first 150 chars of body and get explicit confirmation before calling this tool.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'ID of the lead to email' },
          template_id: { type: 'integer', description: 'ID of the email template to use' }
        },
        required: ['lead_id', 'template_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'personalize_email',
      description: 'Generate a truly personalized email for a specific lead using their website data, reviews, and business details. Returns a preview of the personalized subject and body. Use this before sending to show the user what will be sent.',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'integer', description: 'The lead ID' },
          template_id: { type: 'integer', description: 'The email template ID to base the personalization on' }
        },
        required: ['lead_id', 'template_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulk_personalized_send',
      description: 'Personalize and send unique emails to multiple leads. Each email is individually written based on the lead\'s business data, reviews, and website info. IMPORTANT: Call search_leads first to show the user which leads will be targeted, then get explicit confirmation before calling this tool.',
      parameters: {
        type: 'object',
        properties: {
          template_id: { type: 'integer', description: 'Base template ID to personalize from' },
          status: { type: 'string', description: 'Filter by lead status (optional)' },
          service_type: { type: 'string', description: 'Filter by service type (optional)' },
          limit: { type: 'integer', description: 'Max leads to email (default 10, max 25)' }
        },
        required: ['template_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulk_send_email',
      description: 'Send an email template to multiple leads matching a filter. IMPORTANT: Before calling this, use search_leads with the same filters to show how many leads will receive the email. Present the count and template name, then get explicit confirmation. Do NOT call without confirmed approval.',
      parameters: {
        type: 'object',
        properties: {
          template_id: { type: 'integer', description: 'ID of the email template to send' },
          status: { type: 'string', description: 'Filter by lead status (optional). E.g. "new", "contacted"' },
          service_type: { type: 'string', description: 'Filter by service type (optional). E.g. "hvac", "roofing"' }
        },
        required: ['template_id']
      }
    }
  }
];

async function executeTool(toolName, input) {
  switch (toolName) {
    case 'get_lead': {
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [input.lead_id]);
      if (!lead) return { error: 'Lead not found' };
      const activities = db.all(
        'SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT 20',
        [input.lead_id]
      );
      return { lead, activities };
    }

    case 'search_leads': {
      const conditions = [];
      const params = [];

      if (input.status) { conditions.push('status = ?'); params.push(input.status); }
      if (input.service_type) { conditions.push('service_type = ?'); params.push(input.service_type); }
      if (input.search) {
        conditions.push('(business_name LIKE ? OR city LIKE ? OR phone LIKE ? OR email LIKE ?)');
        const s = `%${input.search}%`;
        params.push(s, s, s, s);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sort = input.sort || 'heat_score';
      const order = input.order || 'desc';
      const limit = Math.min(input.limit || 10, 25);

      const leads = db.all(
        `SELECT id, business_name, phone, email, city, state, service_type, status, heat_score, estimated_value, contact_count, last_contacted_at, next_followup_at, rating, review_count, website, enriched_at FROM leads ${where} ORDER BY ${sort} ${order} LIMIT ?`,
        [...params, limit]
      );
      const total = db.get(`SELECT COUNT(*) as count FROM leads ${where}`, params)?.count || 0;
      return { leads, total };
    }

    case 'get_followups': {
      const all = db.all(
        `SELECT id, business_name, phone, email, city, status, heat_score, next_followup_at FROM leads WHERE next_followup_at IS NOT NULL AND date(next_followup_at) <= date('now') AND status NOT IN ('lost', 'closed_won') ORDER BY next_followup_at ASC`
      );
      const today = new Date().toISOString().slice(0, 10);
      const overdue = all.filter(l => l.next_followup_at && l.next_followup_at.slice(0, 10) < today);
      const due_today = all.filter(l => l.next_followup_at && l.next_followup_at.slice(0, 10) === today);
      return { overdue, due_today };
    }

    case 'get_stats': {
      const total_leads = db.get('SELECT COUNT(*) as count FROM leads')?.count || 0;
      const by_status = db.all('SELECT status, COUNT(*) as count FROM leads GROUP BY status ORDER BY count DESC');
      const by_service_type = db.all('SELECT service_type, COUNT(*) as count FROM leads GROUP BY service_type ORDER BY count DESC');
      const pipeline_value = db.get(`SELECT SUM(estimated_value) as total FROM leads WHERE status NOT IN ('lost')`)?.total || 0;
      const hot_leads_count = db.get('SELECT COUNT(*) as count FROM leads WHERE heat_score >= 70')?.count || 0;
      const booked_count = db.get(`SELECT COUNT(*) as count FROM leads WHERE status = 'booked' OR status = 'closed_won'`)?.count || 0;
      const conversion_rate = total_leads > 0 ? Math.round((booked_count / total_leads) * 100) : 0;
      return { total_leads, by_status, by_service_type, pipeline_value, hot_leads_count, conversion_rate };
    }

    case 'get_templates': {
      const conditions = [];
      const params = [];
      if (input.channel) { conditions.push('channel = ?'); params.push(input.channel); }
      if (input.status_stage) { conditions.push('status_stage = ?'); params.push(input.status_stage); }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.all(`SELECT id, name, channel, status_stage, step_order, subject FROM templates ${where} ORDER BY step_order, channel`, params);
    }

    case 'preview_template': {
      const template = db.get('SELECT * FROM templates WHERE id = ?', [input.template_id]);
      if (!template) return { error: 'Template not found' };
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [input.lead_id]);
      if (!lead) return { error: 'Lead not found' };
      return {
        name: template.name,
        channel: template.channel,
        subject: renderTemplate(template.subject, lead),
        body: renderTemplate(template.body, lead),
      };
    }

    case 'update_lead_status': {
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [input.lead_id]);
      if (!lead) return { error: 'Lead not found' };
      if (!VALID_STATUSES.includes(input.status)) return { error: `Invalid status: ${input.status}` };

      const oldStatus = lead.status;
      db.run('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [input.status, input.lead_id]);

      if (input.status === 'contacted') {
        db.run('UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP WHERE id = ?', [input.lead_id]);
      }

      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'status_change', ?, ?)`,
        [input.lead_id, `Status changed to ${input.status}`, `Was: ${oldStatus} → Now: ${input.status}`]
      );

      autoUpdateHeatScore(input.lead_id);

      if (['lost', 'closed_won'].includes(input.status)) {
        db.run('UPDATE leads SET next_followup_at = NULL WHERE id = ?', [input.lead_id]);
      } else if (FOLLOWUP_DAYS[input.status]) {
        const days = FOLLOWUP_DAYS[input.status];
        db.run(`UPDATE leads SET next_followup_at = datetime('now', '+' || ? || ' days') WHERE id = ?`, [days, input.lead_id]);
        db.run(
          `INSERT INTO activities (lead_id, type, title) VALUES (?, 'note', ?)`,
          [input.lead_id, `Auto-scheduled follow-up in ${days} day(s)`]
        );
      }

      const updated = db.get('SELECT * FROM leads WHERE id = ?', [input.lead_id]);
      return { success: true, lead: updated, message: `Status changed from ${oldStatus} to ${input.status}` };
    }

    case 'log_activity': {
      const lead = db.get('SELECT id FROM leads WHERE id = ?', [input.lead_id]);
      if (!lead) return { error: 'Lead not found' };

      const type = input.type || 'note';

      if (type === 'call_attempt') {
        db.run(
          'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [input.lead_id]
        );
        autoUpdateHeatScore(input.lead_id);
      }

      db.run(
        'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
        [input.lead_id, type, input.title, input.description || null]
      );

      const activity = db.get('SELECT * FROM activities WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [input.lead_id]);
      return { success: true, activity, message: `Logged ${type}: ${input.title}` };
    }

    case 'set_followup': {
      const lead = db.get('SELECT id, business_name FROM leads WHERE id = ?', [input.lead_id]);
      if (!lead) return { error: 'Lead not found' };

      const days = Math.max(1, parseInt(input.days) || 1);
      db.run(
        `UPDATE leads SET next_followup_at = datetime('now', '+' || ? || ' days'), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [days, input.lead_id]
      );
      db.run(
        `INSERT INTO activities (lead_id, type, title) VALUES (?, 'note', ?)`,
        [input.lead_id, `Follow-up scheduled in ${days} day(s)`]
      );

      const updated = db.get('SELECT * FROM leads WHERE id = ?', [input.lead_id]);
      return { success: true, lead: updated, message: `Follow-up for ${lead.business_name} set in ${days} day(s)` };
    }

    case 'update_heat_score': {
      const lead = db.get('SELECT id, business_name, heat_score FROM leads WHERE id = ?', [input.lead_id]);
      if (!lead) return { error: 'Lead not found' };

      const score = Math.max(0, Math.min(100, parseInt(input.heat_score) || 0));
      db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [score, input.lead_id]);
      db.run(
        `INSERT INTO activities (lead_id, type, title) VALUES (?, 'heat_update', ?)`,
        [input.lead_id, `Heat score updated to ${score}`]
      );

      return { success: true, old_score: lead.heat_score, new_score: score, message: `Heat score for ${lead.business_name} changed from ${lead.heat_score} to ${score}` };
    }

    case 'add_note': {
      const lead = db.get('SELECT id, business_name, notes FROM leads WHERE id = ?', [input.lead_id]);
      if (!lead) return { error: 'Lead not found' };

      const existingNotes = lead.notes || '';
      const newNotes = existingNotes ? `${existingNotes}\n${input.note}` : input.note;
      db.run('UPDATE leads SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newNotes, input.lead_id]);
      db.run(
        `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'note', 'Note added', ?)`,
        [input.lead_id, input.note]
      );

      return { success: true, message: `Note added to ${lead.business_name}` };
    }

    case 'get_sequences': {
      const sequences = db.all(
        'SELECT id, name, description, steps, auto_send FROM sequences WHERE is_active = 1 ORDER BY created_at DESC'
      );
      return {
        sequences: sequences.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description || '',
          steps_count: JSON.parse(s.steps || '[]').length,
          auto_send: !!s.auto_send,
        })),
      };
    }

    case 'send_sms': {
      const { lead_id, message } = input;
      if (!message || message.length > 160) {
        return { error: 'Message must be 1–160 characters' };
      }
      const lead = db.get('SELECT id, phone, business_name FROM leads WHERE id = ?', [lead_id]);
      if (!lead) return { error: 'Lead not found' };
      if (!lead.phone) return { error: 'Lead has no phone number on file' };

      const smsService = require('./smsService');
      const result = await smsService.sendSms(lead.phone, message);
      if (!result.success) return { error: result.error };

      db.run(
        'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
        [lead_id, 'sms_sent', 'SMS sent via Sam AI', message.substring(0, 100),
         JSON.stringify({ twilio_sid: result.sid, via: 'sam_ai' })]
      );
      const normalized = smsService.normalizePhone(lead.phone);
      db.run(
        "INSERT INTO sms_messages (lead_id, direction, from_number, to_number, body, twilio_sid, status) VALUES (?, 'outbound', ?, ?, ?, ?, 'sent')",
        [lead_id, process.env.TWILIO_PHONE_NUMBER || '', normalized, message, result.sid]
      );
      return { success: true, message: `SMS sent to ${lead.business_name} (${normalized})` };
    }

    case 'enroll_in_sequence': {
      const { lead_id, sequence_id } = input;
      const lead = db.get('SELECT id, business_name FROM leads WHERE id = ?', [lead_id]);
      if (!lead) return { error: 'Lead not found' };
      const sequence = db.get('SELECT * FROM sequences WHERE id = ?', [sequence_id]);
      if (!sequence) return { error: 'Sequence not found' };
      if (!sequence.is_active) return { error: `"${sequence.name}" is not active` };
      const existing = db.get(
        "SELECT id FROM lead_sequences WHERE lead_id = ? AND sequence_id = ? AND status IN ('active', 'paused')",
        [lead_id, sequence_id]
      );
      if (existing) return { error: `${lead.business_name} is already enrolled in "${sequence.name}"` };

      const steps = JSON.parse(sequence.steps || '[]');
      db.run(
        "INSERT INTO lead_sequences (lead_id, sequence_id, current_step, status) VALUES (?, ?, 1, 'active')",
        [lead_id, sequence_id]
      );
      db.run(
        'INSERT INTO activities (lead_id, type, title, description) VALUES (?, ?, ?, ?)',
        [lead_id, 'note', `Enrolled in sequence: ${sequence.name}`,
         `Started "${sequence.name}" (${steps.length} steps) via Sam AI`]
      );
      return { success: true, message: `${lead.business_name} enrolled in "${sequence.name}" (${steps.length} steps)` };
    }

    case 'send_email': {
      const { lead_id, template_id } = input;
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [lead_id]);
      if (!lead) return { error: 'Lead not found' };
      if (!lead.email) return { error: `${lead.business_name} has no email address on file` };

      const emailService = require('./emailService');
      if (!emailService.isConfigured()) return { error: 'Email not configured (missing RESEND_API_KEY)' };

      const template = db.get('SELECT * FROM templates WHERE id = ?', [template_id]);
      if (!template) return { error: 'Template not found' };
      if (template.channel !== 'email') return { error: 'Template is not an email template' };

      const rendered = renderTemplate(template, lead);
      const result = await emailService.sendEmail(lead.email, rendered.subject || template.subject || 'Follow-up', rendered.body);
      if (!result.success) return { error: result.error };

      db.run(
        'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
        [lead_id, 'email_sent', `Email sent: ${template.name}`, template.subject || '',
         JSON.stringify({ resend_message_id: result.messageId, template_id, via: 'sam_ai' })]
      );
      db.run(
        'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [lead_id]
      );
      if (lead.status === 'new') {
        db.run("UPDATE leads SET status = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [lead_id]);
      }
      return { success: true, message: `Email sent to ${lead.business_name} (${lead.email})` };
    }

    case 'personalize_email': {
      const { lead_id, template_id } = input;
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [lead_id]);
      if (!lead) return { error: 'Lead not found' };
      const template = db.get('SELECT * FROM templates WHERE id = ?', [template_id]);
      if (!template) return { error: 'Template not found' };
      if (template.channel !== 'email') return { error: 'Template is not an email template' };

      const personalized = await generatePersonalizedEmail(lead, template);
      return {
        lead_id,
        business_name: lead.business_name,
        email: lead.email || null,
        has_enrichment: !!lead.enrichment_data,
        subject: personalized.subject,
        body: personalized.body,
      };
    }

    case 'bulk_personalized_send': {
      const { template_id, status, service_type, limit } = input;

      const emailService = require('./emailService');
      if (!emailService.isConfigured()) return { error: 'Email not configured (missing RESEND_API_KEY)' };

      const template = db.get('SELECT * FROM templates WHERE id = ?', [template_id]);
      if (!template) return { error: 'Template not found' };
      if (template.channel !== 'email') return { error: 'Template is not an email template' };

      const conditions = ["email IS NOT NULL AND email != ''", "(unsubscribed_at IS NULL OR unsubscribed_at = '')"];
      const params = [];
      if (status) { conditions.push('status = ?'); params.push(status); }
      if (service_type) { conditions.push('service_type = ?'); params.push(service_type); }
      const maxLeads = Math.min(limit || 10, 25);
      const leads = db.all(
        `SELECT * FROM leads WHERE ${conditions.join(' AND ')} ORDER BY heat_score DESC LIMIT ?`,
        [...params, maxLeads]
      );

      if (leads.length === 0) return { error: 'No leads match that filter with a valid email address' };

      let sent = 0, failed = 0;
      for (const lead of leads) {
        try {
          const personalized = await generatePersonalizedEmail(lead, template);
          const result = await emailService.sendEmail(lead.email, personalized.subject, personalized.body);
          if (result.success) {
            sent++;
            db.run(
              'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
              [lead.id, 'email_sent', 'Personalized email sent', personalized.subject,
               JSON.stringify({ resend_message_id: result.messageId, template_id, via: 'sam_ai_personalized' })]
            );
            db.run(
              'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [lead.id]
            );
            if (lead.status === 'new') {
              db.run("UPDATE leads SET status = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [lead.id]);
            }
          } else { failed++; }
        } catch { failed++; }
      }

      return {
        success: true,
        message: `Sent ${sent} personalized email${sent !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}. New leads auto-advanced to "contacted".`,
      };
    }

    case 'bulk_send_email': {
      const { template_id, status, service_type } = input;

      const emailService = require('./emailService');
      if (!emailService.isConfigured()) return { error: 'Email not configured (missing RESEND_API_KEY)' };

      const template = db.get('SELECT * FROM templates WHERE id = ?', [template_id]);
      if (!template) return { error: 'Template not found' };
      if (template.channel !== 'email') return { error: 'Template is not an email template' };

      const conditions = ["email IS NOT NULL AND email != ''", "(unsubscribed_at IS NULL OR unsubscribed_at = '')"];
      const params = [];
      if (status) { conditions.push('status = ?'); params.push(status); }
      if (service_type) { conditions.push('service_type = ?'); params.push(service_type); }
      const leads = db.all(`SELECT * FROM leads WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`, params);

      if (leads.length === 0) return { error: 'No leads match that filter with a valid email address' };

      let sent = 0, failed = 0;
      for (const lead of leads) {
        try {
          const rendered = renderTemplate(template, lead);
          const result = await emailService.sendEmail(lead.email, rendered.subject || template.subject || 'Follow-up', rendered.body);
          if (result.success) {
            sent++;
            db.run(
              'INSERT INTO activities (lead_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?)',
              [lead.id, 'email_sent', `Email sent: ${template.name}`, template.subject || '',
               JSON.stringify({ resend_message_id: result.messageId, template_id, via: 'sam_ai_bulk' })]
            );
            db.run(
              'UPDATE leads SET contact_count = contact_count + 1, last_contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [lead.id]
            );
            if (lead.status === 'new') {
              db.run("UPDATE leads SET status = 'contacted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [lead.id]);
            }
          } else { failed++; }
        } catch { failed++; }
      }

      return { success: true, message: `Sent ${sent} email${sent !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}. New leads auto-advanced to "contacted".` };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function generatePersonalizedEmail(lead, template) {
  let enrichmentContext = '';
  if (lead.enrichment_data) {
    try {
      const enrichment = JSON.parse(lead.enrichment_data);
      const parts = [];
      if (enrichment.description) parts.push(`About: ${enrichment.description.slice(0, 200)}`);
      if (enrichment.services_offered?.length) parts.push(`Services: ${enrichment.services_offered.slice(0, 5).join(', ')}`);
      if (enrichment.team_names?.length) parts.push(`Team: ${enrichment.team_names.slice(0, 3).join(', ')}`);
      enrichmentContext = parts.join('. ');
    } catch {}
  }

  const context = [
    `Business: ${lead.business_name}`,
    `Location: ${[lead.city, lead.state].filter(Boolean).join(', ')}`,
    `Service: ${lead.service_type || 'home services'}`,
    lead.rating ? `Rating: ${lead.rating} stars (${lead.review_count || 0} reviews)` : '',
    lead.website ? `Website: ${lead.website}` : '',
    enrichmentContext,
  ].filter(Boolean).join('\n');

  const renderedSubject = renderTemplate(template.subject || '', lead);
  const renderedBody = renderTemplate(template.body || '', lead);

  const prompt = `You are an expert B2B cold email writer for home service contractors in the US.

Rewrite this email with a unique, specific opening (2-3 sentences) that references real details about this business. Keep the rest of the structure intact but make it flow naturally.

LEAD DETAILS:
${context}

BASE EMAIL:
Subject: ${renderedSubject}
Body:
${renderedBody}

RULES:
- Opening must feel researched and specific to THIS business (mention their rating, city, specialty, or something from their website)
- Under 200 words total
- No emojis. High urgency tone. Professional but direct.
- End with one clear CTA
- Return ONLY valid JSON with no markdown: {"subject": "...", "body": "..."}`;

  const data = await callGemini([{ role: 'user', content: prompt }], false);
  const raw = data.choices?.[0]?.message?.content?.trim() || '';

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    parsed = { subject: renderedSubject, body: renderedBody };
  }

  return {
    subject: parsed.subject || renderedSubject,
    body: parsed.body || renderedBody,
  };
}

function buildContextString(context) {
  if (!context) return '';
  const parts = [`The user is currently on the ${pageLabel(context.page)} page.`];
  if (context.lead_id) {
    const lead = db.get('SELECT * FROM leads WHERE id = ?', [context.lead_id]);
    if (lead) {
      parts.push(`They are viewing lead #${lead.id} "${lead.business_name}" (status: ${lead.status}, heat_score: ${lead.heat_score}, city: ${lead.city || 'unknown'}, service: ${lead.service_type}).`);
      if (lead.next_followup_at) parts.push(`Follow-up scheduled: ${lead.next_followup_at.slice(0, 10)}.`);
      if (lead.notes) parts.push(`Notes: ${lead.notes}`);
    }
  }
  return parts.join(' ');
}

function pageLabel(path) {
  const map = { '/': 'Dashboard', '/leads': 'Pipeline', '/finder': 'Find Leads', '/templates': 'Templates' };
  return map[path] || path;
}

async function callGemini(messages, useTools = true) {
  const body = {
    model: MODEL,
    max_tokens: 2048,
    messages,
  };
  if (useTools) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) throw new Error('AI copilot is not configured. Please set GEMINI_API_KEY.');
    if (res.status === 429) throw new Error('AI is temporarily busy. Please wait a moment and try again.');
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  return res.json();
}

const MAX_TOOL_ROUNDS = 5;

async function streamChat(dbMessages, context, onEvent) {
  const systemPrompt = SYSTEM_PROMPT + (context ? `\n\nCurrent session context:\n${buildContextString(context)}` : '');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...dbMessages.map(m => ({ role: m.role, content: m.content })),
  ];

  let toolRounds = 0;

  while (true) {
    const data = await callGemini(messages);
    const choice = data.choices?.[0];
    const message = choice?.message;

    if (!message) throw new Error('No response from Gemini');

    const finishReason = choice.finish_reason;
    const toolCalls = message.tool_calls;

    if (finishReason !== 'tool_calls' || !toolCalls?.length || toolRounds >= MAX_TOOL_ROUNDS) {
      const text = message.content || '';
      if (text) onEvent({ type: 'text', text });
      return text;
    }

    toolRounds++;

    messages.push({
      role: 'assistant',
      content: message.content || null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let input = {};
      try { input = JSON.parse(tc.function.arguments); } catch {}

      onEvent({ type: 'tool_call', tool: toolName });
      const result = await executeTool(toolName, input);
      onEvent({ type: 'tool_done', tool: toolName });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }
}

async function generateTitle(userMessage, assistantResponse) {
  const data = await callGemini([{
    role: 'user',
    content: `Generate a short title (max 6 words) for this conversation. Reply with ONLY the title, no quotes or punctuation.\n\nUser: ${userMessage}\n\nAssistant: ${assistantResponse.slice(0, 300)}`
  }], false);
  return data.choices?.[0]?.message?.content?.trim() || userMessage.slice(0, 50);
}

module.exports = { streamChat, generateTitle };
