const Anthropic = require('@anthropic-ai/sdk');
const { AuthenticationError, RateLimitError, APIConnectionError } = Anthropic;
const db = require('../db');
const { renderTemplate } = require('./templateService');
const { recomputeHeatScore } = require('./heatScoreService');

const client = new Anthropic();

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

Guidelines:
- Be concise and actionable. Contractors are busy.
- When discussing leads, mention specific business names and key data points.
- When drafting outreach, be direct, value-focused, no fluff.
- Use the tools to look up real data before answering questions about leads.
- Heat score guide: 0-30 = cold, 31-60 = warm, 61-85 = hot, 86-100 = on fire.
- Status pipeline: new → contacted → qualified → proposal_sent → booked → closed_won (or lost).
- Always recommend a next concrete action (e.g., "call them today", "send the Step 2 email").
- Format responses with markdown for readability.`;

const tools = [
  {
    name: 'get_lead',
    description: 'Get detailed info about a specific lead by ID, including recent activities and enrichment data.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer', description: 'The lead ID' }
      },
      required: ['lead_id']
    }
  },
  {
    name: 'search_leads',
    description: 'Search and filter leads. Use for questions like "which leads are new", "show me hot leads", "leads in Dallas", etc.',
    input_schema: {
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
  },
  {
    name: 'get_followups',
    description: 'Get leads with follow-ups due today and overdue follow-ups.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_stats',
    description: 'Get dashboard statistics: total leads, pipeline value, conversion rate, leads by status and service type.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_templates',
    description: 'Get outreach templates. Filter by channel (email/sms/call_script) and/or status stage.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['email', 'sms', 'call_script'] },
        status_stage: { type: 'string', enum: ['new', 'contacted', 'qualified', 'proposal_sent', 'booked', 'lost', 'closed_won'] }
      }
    }
  },
  {
    name: 'preview_template',
    description: 'Render a template with a specific lead\'s data, replacing variables like {business_name}, {city}, etc. Returns the filled-in subject and body.',
    input_schema: {
      type: 'object',
      properties: {
        template_id: { type: 'integer' },
        lead_id: { type: 'integer' }
      },
      required: ['template_id', 'lead_id']
    }
  },
  {
    name: 'update_lead_status',
    description: 'Change a lead\'s pipeline status. Use when the user says things like "mark as contacted", "move to qualified", "close the deal", "mark as lost". This also auto-schedules a follow-up and recomputes the heat score.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer', description: 'The lead ID' },
        status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'proposal_sent', 'booked', 'lost', 'closed_won'] }
      },
      required: ['lead_id', 'status']
    }
  },
  {
    name: 'log_activity',
    description: 'Log a call attempt, email sent, SMS sent, or note on a lead. Use when the user says "log a call", "I emailed them", "sent a text", or "add a note".',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer', description: 'The lead ID' },
        type: { type: 'string', enum: ['note', 'call_attempt', 'email_sent', 'sms_sent'], description: 'Activity type (default: note)' },
        title: { type: 'string', description: 'Short title for the activity' },
        description: { type: 'string', description: 'Optional longer description' }
      },
      required: ['lead_id', 'title']
    }
  },
  {
    name: 'set_followup',
    description: 'Schedule a follow-up reminder for a lead N days from now. Use when the user says "remind me in 3 days", "follow up next week", "snooze this lead".',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer', description: 'The lead ID' },
        days: { type: 'integer', description: 'Number of days from now (minimum 1)' }
      },
      required: ['lead_id', 'days']
    }
  },
  {
    name: 'update_heat_score',
    description: 'Manually set a lead\'s heat score (0-100). Use when the user says "set heat to 80", "this lead is hot", "cool down this lead".',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer', description: 'The lead ID' },
        heat_score: { type: 'integer', description: 'New heat score (0-100)' }
      },
      required: ['lead_id', 'heat_score']
    }
  },
  {
    name: 'add_note',
    description: 'Add a note to a lead\'s notes field. Appends to existing notes. Use when the user says "note that...", "remember that...", "jot down...".',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'integer', description: 'The lead ID' },
        note: { type: 'string', description: 'The note text to add' }
      },
      required: ['lead_id', 'note']
    }
  }
];

function executeTool(toolName, input) {
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

      // Auto-schedule follow-up or clear for terminal statuses
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

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
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

function convertToClaudeMessages(dbMessages) {
  const messages = [];
  for (const msg of dbMessages) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      messages.push({ role: 'assistant', content: msg.content });
    }
  }
  return messages;
}

const MAX_TOOL_ROUNDS = 5;

async function streamChat(dbMessages, context, onEvent) {
  const systemPrompt = SYSTEM_PROMPT + (context ? `\n\nCurrent session context:\n${buildContextString(context)}` : '');
  let claudeMessages = convertToClaudeMessages(dbMessages);
  let toolRounds = 0;

  try {
    while (true) {
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: claudeMessages,
        tools,
      });

      let fullText = '';
      let toolUseBlocks = [];
      let currentToolUse = null;

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = { id: event.content_block.id, name: event.content_block.name, inputJson: '' };
            onEvent({ type: 'tool_call', tool: event.content_block.name });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            onEvent({ type: 'text', text: event.delta.text });
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.inputJson += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            let input = {};
            try { input = JSON.parse(currentToolUse.inputJson); } catch {}
            toolUseBlocks.push({ ...currentToolUse, input });
            currentToolUse = null;
          }
        }
      }

      const finalMessage = await stream.finalMessage();

      // If no tool calls or we've hit the limit, we're done
      if (finalMessage.stop_reason !== 'tool_use' || toolRounds >= MAX_TOOL_ROUNDS) {
        return fullText;
      }

      // Execute tools and continue the conversation
      toolRounds++;

      // Build the assistant message with all content blocks
      const assistantContent = finalMessage.content.map(block => {
        if (block.type === 'text') return { type: 'text', text: block.text };
        if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
        return block;
      });

      claudeMessages.push({ role: 'assistant', content: assistantContent });

      // Execute each tool and build tool results
      const toolResults = toolUseBlocks.map(tool => {
        const result = executeTool(tool.name, tool.input);
        onEvent({ type: 'tool_done', tool: tool.name });
        return {
          type: 'tool_result',
          tool_use_id: tool.id,
          content: JSON.stringify(result),
        };
      });

      claudeMessages.push({ role: 'user', content: toolResults });

      // Reset for next round
      fullText = '';
      toolUseBlocks = [];
    }
  } catch (err) {
    if (err instanceof AuthenticationError) {
      throw new Error('AI copilot is not configured. Please set ANTHROPIC_API_KEY.');
    }
    if (err instanceof RateLimitError) {
      throw new Error('AI is temporarily busy. Please wait a moment and try again.');
    }
    if (err instanceof APIConnectionError) {
      throw new Error('Could not connect to AI service. Check your internet connection.');
    }
    throw err;
  }
}

async function generateTitle(userMessage, assistantResponse) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 30,
    messages: [{
      role: 'user',
      content: `Generate a short title (max 6 words) for this conversation. Reply with ONLY the title, no quotes or punctuation.\n\nUser: ${userMessage}\n\nAssistant: ${assistantResponse.slice(0, 300)}`
    }]
  });
  return response.content[0]?.text?.trim() || userMessage.slice(0, 50);
}

module.exports = { streamChat, generateTitle };
