const fetch = require('node-fetch');

const VAPI_BASE = 'https://api.vapi.ai';

function isConfigured() {
  return !!process.env.VAPI_API_KEY;
}

function getSettings() {
  const db = require('../db');
  return {
    phoneNumberId: db.get("SELECT value FROM settings WHERE key = 'vapi_phone_number_id'")?.value,
    voiceId: db.get("SELECT value FROM settings WHERE key = 'vapi_voice_id'")?.value,
    fallbackPhone: db.get("SELECT value FROM settings WHERE key = 'vapi_fallback_phone'")?.value,
    firstMessage: db.get("SELECT value FROM settings WHERE key = 'vapi_first_message'")?.value || null,
  };
}

async function startCall(lead, renderedScript) {
  if (!isConfigured()) return { success: false, error: 'VAPI not configured — set VAPI_API_KEY in .env' };

  const settings = getSettings();

  // Local presence dialing: pick phone number by lead's state
  const db = require('../db');
  let phoneNumberId = settings.phoneNumberId;
  if (lead.state) {
    const localMapRaw = db.get("SELECT value FROM settings WHERE key = 'vapi_local_numbers'")?.value || '{}';
    try {
      const localMap = JSON.parse(localMapRaw);
      const stateKey = lead.state.toUpperCase();
      if (localMap[stateKey]) phoneNumberId = localMap[stateKey];
    } catch { /* malformed JSON — use default */ }
  }
  if (!phoneNumberId) return { success: false, error: 'VAPI phone number not configured — set it in Settings' };

  const phone = normalizePhone(lead.phone);
  if (!phone) return { success: false, error: 'Invalid phone number' };

  const assistantConfig = {
    firstMessage: settings.firstMessage
      ? settings.firstMessage.replace(/\{business_name\}/g, lead.business_name || '')
      : null,
    maxDurationSeconds: parseInt(db.get("SELECT value FROM settings WHERE key = 'vapi_max_duration_seconds'")?.value || '180', 10),
    model: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'system', content: renderedScript }],
    },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en-US',
    },
    endCallMessage: 'Alright, thanks for your time. Have a great day.',
    endCallPhrases: ['goodbye', 'not interested', 'do not call', 'stop calling'],
    voicemailDetection: {
      provider: 'twilio',
      voicemailDetectionTypes: ['machine_end_beep', 'machine_end_other'],
      enabled: true,
    },
    monitorPlan: {
      listenEnabled: true,
      controlEnabled: true,
    },
  };

  // Voicemail drop: play pre-recorded message then hang up
  const voicemailMsg = db.get("SELECT value FROM settings WHERE key = 'vapi_voicemail_message'")?.value;
  if (voicemailMsg) {
    assistantConfig.voicemailMessage = voicemailMsg;
  }

  if (settings.voiceId && settings.voiceId.length > 10) {
    assistantConfig.voice = {
      provider: '11labs',
      voiceId: settings.voiceId,
    };
  }

  // Build tools array
  const tools = [];

  // reportOutcome: AI calls this at the end of every conversation
  const appUrl = process.env.APP_URL || db.get("SELECT value FROM settings WHERE key = 'app_url'")?.value || '';
  if (appUrl) {
    tools.push({
      type: 'function',
      function: {
        name: 'reportOutcome',
        description: 'Call this at the END of every conversation — before saying goodbye — to log the outcome, your recommended next step, and any key intel gathered.',
        parameters: {
          type: 'object',
          properties: {
            outcome: {
              type: 'string',
              enum: ['interested', 'callback_requested', 'not_interested', 'no_answer', 'voicemail', 'wrong_number'],
              description: 'How the call ended',
            },
            next_step: {
              type: 'string',
              description: 'What should happen next with this lead (1-2 sentences)',
            },
            key_intel: {
              type: 'string',
              description: 'Key intel from the call: decision maker name, company size, objections raised, best time to call back, current vendors, etc. Leave blank if nothing notable.',
            },
          },
          required: ['outcome', 'next_step'],
        },
      },
      server: { url: `${appUrl}/api/webhooks/vapi` },
    });
  }

  if (settings.fallbackPhone) {
    tools.push({
      type: 'transferCall',
      destinations: [
        {
          type: 'number',
          number: settings.fallbackPhone,
          message: 'Let me connect you with someone who can help right away.',
        },
      ],
    });
  }

  if (tools.length > 0) {
    assistantConfig.model.tools = tools;
  }

  // Append reportOutcome instruction to system prompt
  const finalScript = appUrl
    ? renderedScript + '\n\nIMPORTANT: Before ending the call, you MUST call the reportOutcome function to log: (1) the outcome, (2) your recommended next action for this lead in 1-2 sentences, and (3) any useful intel gathered (decision maker, objections, company size, best callback time, etc.).'
    : renderedScript;
  assistantConfig.model.messages = [{ role: 'system', content: finalScript }];

  try {
    const res = await fetch(`${VAPI_BASE}/call/phone`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId,
        customer: { number: phone },
        assistant: assistantConfig,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.message || data.error || `VAPI error ${res.status}` };
    }

    return {
      success: true,
      callId: data.id,
      status: data.status || 'queued',
      listenUrl: data.monitor?.listenUrl || null,
      controlUrl: data.monitor?.controlUrl || null,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getCallStatus(callId) {
  if (!isConfigured()) return { success: false, error: 'VAPI not configured' };

  try {
    const res = await fetch(`${VAPI_BASE}/call/${callId}`, {
      headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}` },
    });

    if (!res.ok) return { success: false, error: `VAPI error ${res.status}` };

    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function endCall(callId) {
  if (!isConfigured()) return { success: false, error: 'VAPI not configured' };

  try {
    const res = await fetch(`${VAPI_BASE}/call/${callId}/stop`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}` },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.message || `VAPI error ${res.status}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return null;
}

module.exports = { isConfigured, startCall, getCallStatus, endCall, normalizePhone };
