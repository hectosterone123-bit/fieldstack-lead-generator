const { isConfigured, getClient } = require('./smsService');

async function validatePhoneForLead(leadId, db) {
  if (!isConfigured()) return null;
  const lead = db.get(
    `SELECT id, phone FROM leads WHERE id = ? AND phone IS NOT NULL AND phone != ''`,
    [leadId]
  );
  if (!lead) return null;
  try {
    const client = getClient();
    const digits = lead.phone.replace(/\D/g, '');
    if (digits.length < 10) return null;
    const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    const lookup = await client.lookups.v2.phoneNumbers(e164).fetch({ fields: 'line_type_intelligence' });
    const lineType = lookup.lineTypeIntelligence?.type || null;
    const valid = lookup.valid !== false && !['voip', 'nonFixedVoip'].includes(lineType);
    db.run('UPDATE leads SET phone_valid = ?, phone_line_type = ? WHERE id = ?', [valid ? 1 : 0, lineType, lead.id]);
    return { valid, lineType };
  } catch (e) {
    console.warn(`[PhoneValidation] Lead ${leadId}:`, e.message);
    return null;
  }
}

async function validatePhonesAsync(leadIds, db) {
  if (!isConfigured() || !leadIds?.length) return;
  for (const leadId of leadIds) {
    await validatePhoneForLead(leadId, db);
    await new Promise(r => setTimeout(r, 120));
  }
}

module.exports = { validatePhoneForLead, validatePhonesAsync };
