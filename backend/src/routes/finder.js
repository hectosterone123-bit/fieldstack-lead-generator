const express = require('express');
const router = express.Router();
const db = require('../db');
const { searchBusinesses } = require('../services/overpassService');
const { enrichBatch } = require('../services/enrichService');
const { computeInitialHeatScore } = require('../services/heatScoreService');

// POST /api/finder/search
// Body: { service_type, city, state, radius_km }
router.post('/search', async (req, res, next) => {
  try {
    const { service_type = 'hvac', city, state, radius_km = 10 } = req.body;

    if (!city || !state) {
      return res.status(400).json({ success: false, error: 'city and state are required' });
    }

    console.log(`[Finder] Searching ${service_type} in ${city}, ${state} (${radius_km}km radius)`);

    const { results, geocoded } = await searchBusinesses(service_type, city, state, parseInt(radius_km));
    console.log(`[Finder] Found ${results.length} raw results from OSM`);

    // Enrich with website checks + phone formatting
    const enriched = await enrichBatch(results);

    // Compute initial heat scores
    const scored = enriched.map(r => ({ ...r, heat_score: computeInitialHeatScore(r) }));

    // Mark already-imported leads
    const existingOsmIds = new Set(
      db.all('SELECT osm_id FROM leads WHERE osm_id IS NOT NULL').map(r => r.osm_id)
    );

    const finalResults = scored.map(r => ({
      ...r,
      already_imported: !!(r.osm_id && existingOsmIds.has(r.osm_id))
    }));

    // Sort: not-yet-imported first, then by heat score desc
    finalResults.sort((a, b) => {
      if (a.already_imported !== b.already_imported) return a.already_imported ? 1 : -1;
      return b.heat_score - a.heat_score;
    });

    res.json({
      success: true,
      data: finalResults,
      meta: { geocoded, total: finalResults.length, new: finalResults.filter(r => !r.already_imported).length }
    });
  } catch (err) {
    console.error('[Finder] Search error:', err.message);
    next(err);
  }
});

// POST /api/finder/import
// Body: { leads: [{ osm_id, business_name, ... }] }
router.post('/import', (req, res, next) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, error: 'leads array is required' });
    }

    let imported = 0;
    let skipped = 0;

    for (const lead of leads) {
      if (!lead.osm_id || !lead.business_name) continue;

      const existing = db.get('SELECT id FROM leads WHERE osm_id = ?', [lead.osm_id]);
      if (existing) { skipped++; continue; }

      db.run(
        `INSERT INTO leads (business_name, phone, email, website, address, city, state, zip, latitude, longitude, service_type, status, heat_score, estimated_value, has_website, website_live, google_maps_url, source, osm_id, osm_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, 2000, ?, ?, ?, 'osm_finder', ?, ?)`,
        [
          lead.business_name, lead.phone, lead.email, lead.website,
          lead.address, lead.city, lead.state, lead.zip,
          lead.latitude, lead.longitude, lead.service_type || 'hvac',
          lead.heat_score || 0, lead.has_website ? 1 : 0,
          lead.website_live ? 1 : 0, lead.google_maps_url,
          lead.osm_id, lead.osm_type
        ]
      );

      const newLead = db.get('SELECT id FROM leads WHERE osm_id = ?', [lead.osm_id]);
      if (newLead) {
        db.run(
          `INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'import', 'Lead imported from OpenStreetMap', ?)`,
          [newLead.id, `Discovered via OSM search. Service: ${lead.service_type}. Location: ${lead.city || ''}, ${lead.state || ''}.`]
        );
      }

      imported++;
    }

    res.json({ success: true, data: { imported, skipped } });
  } catch (err) { next(err); }
});

module.exports = router;
