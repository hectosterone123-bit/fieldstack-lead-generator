const fetch = require('node-fetch');

function getCalendarSettings(db) {
  const get = (key) => db.get("SELECT value FROM settings WHERE key = ?", [key])?.value || '';
  return {
    enabled: get('google_calendar_enabled') === '1',
    clientId: get('google_calendar_client_id'),
    clientSecret: get('google_calendar_client_secret'),
    refreshToken: get('google_calendar_refresh_token'),
    redirectUri: get('google_calendar_redirect_uri'),
  };
}

async function getAccessToken(db) {
  const { clientId, clientSecret, refreshToken } = getCalendarSettings(db);
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

async function createCalendarEvent(db, { summary, description, startTime, durationMinutes = 15 }) {
  const settings = getCalendarSettings(db);
  if (!settings.enabled) return null;

  const accessToken = await getAccessToken(db);
  if (!accessToken) return null;

  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60000);

  const event = {
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone: 'America/Chicago' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Chicago' },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[calendar] Failed to create event:', err);
    return null;
  }

  const created = await res.json();
  return created;
}

function getAuthUrl(db) {
  const { clientId, redirectUri } = getCalendarSettings(db);
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(db, code) {
  const { clientId, clientSecret, redirectUri } = getCalendarSettings(db);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (data.refresh_token) {
    db.run("UPDATE settings SET value = ? WHERE key = 'google_calendar_refresh_token'", [data.refresh_token]);
    db.run("UPDATE settings SET value = '1' WHERE key = 'google_calendar_enabled'");
  }
  return data;
}

module.exports = { createCalendarEvent, getAuthUrl, exchangeCode, getCalendarSettings };
