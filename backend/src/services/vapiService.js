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
  };
}

async function startCall(lead, renderedScript) {
  if (!isConfigured()) return { success: false, error: 'VAPI not configured — set VAPI_API_KEY in .env' };

  const settings = getSettings();
  if (!settings.phoneNumberId) return { success: false, error: 'VAPI phone number not configured — set it in Settings' };

  const phone = normalizePhone(lead.phone);
  if (!phone) return { success: false, error: 'Invalid phone number' };

  const assistantConfig = {
    firstMessage: null,
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
    monitorPlan: {
      listenEnabled: true,
      controlEnabled: true,
    },
  };

  if (settings.voiceId && settings.voiceId.length > 10) {
    assistantConfig.voice = {
      provider: '11labs',
      voiceId: settings.voiceId,
    };
  }

  if (settings.fallbackPhone) {
    assistantConfig.model.tools = [
      {
        type: 'transferCall',
        destinations: [
          {
            type: 'number',
            number: settings.fallbackPhone,
            message: 'Let me connect you with someone who can help right away.',
          },
        ],
      },
    ];
  }

  try {
    const res = await fetch(`${VAPI_BASE}/call/phone`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: settings.phoneNumberId,
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
