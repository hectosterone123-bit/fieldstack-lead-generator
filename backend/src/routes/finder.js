const express = require('express');
const router = express.Router();
const db = require('../db');
const overpassService = require('../services/overpassService');
const googlePlacesService = require('../services/googlePlacesService');
const { enrichBatch } = require('../services/enrichService');
const { computeInitialHeatScore, recomputeHeatScore } = require('../services/heatScoreService');
const { computeProspectScore } = require('../services/prospectScoreService');
const { scrapeWebsite } = require('../services/scrapeService');
const { autoEnrollLeads, getDefaultSequenceId } = require('../services/enrollmentService');

function hasGoogleKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  return key && key !== 'YOUR_API_KEY_HERE';
}

// Shared: search a single city, returns raw results
async function searchCity(service_type, city, state, radius_km, source, country = 'USA') {
  let results = [];

  if (source === 'osm' || source === 'both') {
    const osm = await overpassService.searchBusinesses(service_type, city, state, parseInt(radius_km), country);
    results.push(...osm.results);
  }

  if (source === 'google' || source === 'both') {
    const google = await googlePlacesService.searchBusinesses(service_type, city, state, parseInt(radius_km), country);
    results.push(...google.results);
  }

  return results;
}

// Shared: deduplicate, enrich, score, mark imported
async function processResults(allResults) {
  // Deduplicate globally
  const seen = new Set();
  const deduped = [];
  for (const r of allResults) {
    const key = r.osm_id || r.google_place_id || `${r.business_name.toLowerCase()}|${(r.city || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  // Enrich with website checks + phone formatting
  const enriched = await enrichBatch(deduped);

  // Compute scores
  const scored = enriched.map(r => ({
    ...r,
    heat_score: computeInitialHeatScore(r),
    prospect_score: computeProspectScore(r),
  }));

  // Mark already-imported leads
  const existingOsmIds = new Set(
    db.all('SELECT osm_id FROM leads WHERE osm_id IS NOT NULL').map(r => r.osm_id)
  );
  const existingGoogleIds = new Set(
    db.all('SELECT google_place_id FROM leads WHERE google_place_id IS NOT NULL').map(r => r.google_place_id)
  );

  const final = scored.map(r => ({
    ...r,
    already_imported: !!(
      (r.osm_id && existingOsmIds.has(r.osm_id)) ||
      (r.google_place_id && existingGoogleIds.has(r.google_place_id))
    )
  }));

  // Sort: not-yet-imported first, then by prospect score desc
  final.sort((a, b) => {
    if (a.already_imported !== b.already_imported) return a.already_imported ? 1 : -1;
    return b.prospect_score - a.prospect_score;
  });

  return final;
}

// POST /api/finder/search — single city search
router.post('/search', async (req, res, next) => {
  try {
    const { service_type = 'hvac', city, state, radius_km = 10, source = 'osm', country = 'USA' } = req.body;

    if (!city || !state) {
      return res.status(400).json({ success: false, error: 'city and state are required' });
    }
    if ((source === 'google' || source === 'both') && !hasGoogleKey()) {
      return res.status(400).json({ success: false, error: 'Google Places API key not configured' });
    }

    console.log(`[Finder] Searching ${service_type} in ${city}, ${state}, ${country} (${radius_km}km, source: ${source})`);

    const rawResults = await searchCity(service_type, city, state, radius_km, source, country);
    console.log(`[Finder] Found ${rawResults.length} results`);

    const finalResults = await processResults(rawResults);

    res.json({
      success: true,
      data: finalResults,
      meta: { total: finalResults.length, new: finalResults.filter(r => !r.already_imported).length }
    });
  } catch (err) {
    console.error('[Finder] Search error:', err.message);
    next(err);
  }
});

// POST /api/finder/batch-search — multi-city search
router.post('/batch-search', async (req, res, next) => {
  try {
    const { service_type = 'hvac', cities = [], radius_km = 10, source = 'google', country = 'USA' } = req.body;

    if (!Array.isArray(cities) || cities.length === 0) {
      return res.status(400).json({ success: false, error: 'cities array is required' });
    }
    if (cities.length > 10) {
      return res.status(400).json({ success: false, error: 'Max 10 cities per batch' });
    }
    if ((source === 'google' || source === 'both') && !hasGoogleKey()) {
      return res.status(400).json({ success: false, error: 'Google Places API key not configured' });
    }

    console.log(`[Finder] Batch searching ${service_type} across ${cities.length} cities`);

    let allResults = [];
    const cityLog = [];

    for (let i = 0; i < cities.length; i++) {
      const { city, state } = cities[i];
      try {
        // Rate limit: 1.1s delay between cities for Nominatim
        if (i > 0 && (source === 'osm' || source === 'both')) {
          await new Promise(r => setTimeout(r, 1100));
        }

        const cityResults = await searchCity(service_type, city, state, radius_km, source, country);
        cityLog.push({ city, state, found: cityResults.length });
        allResults.push(...cityResults);
        console.log(`[Finder] ${city}, ${state}: ${cityResults.length} results`);
      } catch (err) {
        cityLog.push({ city, state, found: 0, error: err.message });
        console.error(`[Finder] ${city}, ${state}: error — ${err.message}`);
      }
    }

    const finalResults = await processResults(allResults);

    res.json({
      success: true,
      data: finalResults,
      meta: {
        city_log: cityLog,
        total: finalResults.length,
        new: finalResults.filter(r => !r.already_imported).length,
      }
    });
  } catch (err) {
    console.error('[Finder] Batch search error:', err.message);
    next(err);
  }
});

// POST /api/finder/import
// Body: { leads, auto_enrich?, auto_enroll?, sequence_id? }
router.post('/import', (req, res, next) => {
  try {
    const { leads, auto_enrich = false, auto_enroll = false, sequence_id = null } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, error: 'leads array is required' });
    }

    let imported = 0;
    let skipped = 0;
    const newLeadIds = [];

    for (const lead of leads) {
      if (!lead.business_name) continue;
      if (!lead.osm_id && !lead.google_place_id) continue;

      // Check for duplicates
      if (lead.osm_id) {
        const existing = db.get('SELECT id FROM leads WHERE osm_id = ?', [lead.osm_id]);
        if (existing) { skipped++; continue; }
      }
      if (lead.google_place_id) {
        const existing = db.get('SELECT id FROM leads WHERE google_place_id = ?', [lead.google_place_id]);
        if (existing) { skipped++; continue; }
      }

      const isGoogle = lead.source === 'google_places';
      const dbSource = isGoogle ? 'google_places' : 'osm_finder';

      db.run(
        `INSERT INTO leads (business_name, phone, email, website, address, city, state, zip, latitude, longitude, service_type, status, heat_score, estimated_value, has_website, website_live, google_maps_url, source, osm_id, osm_type, google_place_id, rating, review_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, 2000, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lead.business_name, lead.phone || null, lead.email || null, lead.website || null,
          lead.address || null, lead.city || null, lead.state || null, lead.zip || null,
          lead.latitude || null, lead.longitude || null, lead.service_type || 'hvac',
          lead.heat_score || 0, lead.has_website ? 1 : 0,
          lead.website_live ? 1 : 0, lead.google_maps_url || null,
          dbSource, lead.osm_id || null, lead.osm_type || null,
          lead.google_place_id || null, lead.rating || null, lead.review_count || null,
        ]
      );

      // Find the newly inserted lead
      const newLead = lead.osm_id
        ? db.get('SELECT id FROM leads WHERE osm_id = ?', [lead.osm_id])
        : db.get('SELECT id FROM leads WHERE google_place_id = ?', [lead.google_place_id]);

      if (newLead) {
        newLeadIds.push(newLead.id);
        const sourceLabel = isGoogle ? 'Google Places' : 'OpenStreetMap';
        db.run(
          `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'import', ?, ?)`,
          [newLead.id, `Lead imported from ${sourceLabel}`, `Discovered via ${sourceLabel}. Service: ${lead.service_type}. Location: ${lead.city || ''}, ${lead.state || ''}.`]
        );
      }

      // Speed-to-lead: auto-queue for immediate calling
      if (newLead) {
        const speedEnabled = db.get("SELECT value FROM settings WHERE key = 'speed_to_lead_enabled'")?.value === '1';
        const speedTemplateId = parseInt(db.get("SELECT value FROM settings WHERE key = 'speed_to_lead_template_id'")?.value);
        const fullLead = db.get('SELECT * FROM leads WHERE id = ?', [newLead.id]);
        if (speedEnabled && speedTemplateId && fullLead?.phone && !fullLead?.dnc_at) {
          db.run("UPDATE call_queue SET position = position + 1 WHERE status = 'pending'");
          db.run("INSERT INTO call_queue (lead_id, template_id, position, status) VALUES (?, ?, 1, 'pending')", [newLead.id, speedTemplateId]);
        }
      }

      imported++;
    }

    // Fire-and-forget: auto-enrich websites
    if (auto_enrich && newLeadIds.length > 0) {
      setImmediate(async () => {
        console.log(`[AutoEnrich] Starting enrichment for ${newLeadIds.length} leads`);
        for (const leadId of newLeadIds) {
          try {
            const lead = db.get('SELECT * FROM leads WHERE id = ?', [leadId]);
            if (!lead || !lead.website) continue;
            const scraped = await scrapeWebsite(lead.website);
            if (scraped.error) continue;
            db.run(
              `UPDATE leads SET enrichment_data = ?, enriched_at = CURRENT_TIMESTAMP, email = COALESCE(NULLIF(?, ''), email), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [JSON.stringify(scraped), scraped.emails?.[0] || null, leadId]
            );
            const updated = db.get('SELECT * FROM leads WHERE id = ?', [leadId]);
            if (updated) {
              db.run('UPDATE leads SET heat_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [recomputeHeatScore(updated), leadId]);
            }
            db.run(
              `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'enrichment', 'Auto-enriched', 'Website scraped via batch import')`,
              [leadId]
            );
          } catch (err) {
            console.error(`[AutoEnrich] Failed for lead ${leadId}:`, err.message);
          }
        }
        console.log(`[AutoEnrich] Done`);
      });
    }

    // Auto-enroll in sequence (explicit or default)
    const enrollSeqId = (auto_enroll && sequence_id) ? sequence_id : getDefaultSequenceId();
    if (enrollSeqId && newLeadIds.length > 0) {
      setImmediate(() => {
        autoEnrollLeads(newLeadIds, enrollSeqId);
      });
    }

    res.json({ success: true, data: { imported, skipped, auto_enrich, auto_enroll } });
  } catch (err) { next(err); }
});

// POST /scrape-emails — bulk scrape websites for emails
router.post('/scrape-emails', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'urls array is required' });
    }

    const { scrapeWebsite } = require('../services/scrapeService');
    const CONCURRENCY = 5;
    const results = [];

    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (url) => {
          try {
            const data = await scrapeWebsite(url);
            return { url, emails: data.emails || [], team_names: data.team_names || [] };
          } catch {
            return { url, emails: [], team_names: [] };
          }
        })
      );
      for (const r of batchResults) {
        results.push(r.status === 'fulfilled' ? r.value : { url: batch[0], emails: [], team_names: [] });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
