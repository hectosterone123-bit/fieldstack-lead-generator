const fetch = require('node-fetch');

// Map service types to OSM craft/shop tags
const SERVICE_TAGS = {
  hvac:        [['craft', 'hvac'], ['shop', 'hvac'], ['craft', 'air_conditioning']],
  plumbing:    [['craft', 'plumber'], ['shop', 'plumber']],
  electrical:  [['craft', 'electrician']],
  roofing:     [['craft', 'roofer']],
  landscaping: [['craft', 'gardener'], ['shop', 'garden_centre']],
  pest_control:[['craft', 'pest_control']],
  general:     [['craft', 'hvac'], ['craft', 'plumber'], ['craft', 'electrician'], ['craft', 'roofer']],
};

// Fallback name patterns for regex-based search
const NAME_PATTERNS = {
  hvac:        'HVAC|Air Condition|Heating|Cooling|Furnace|AC Repair',
  plumbing:    'Plumb|Drain|Pipe|Sewer|Water Heater',
  electrical:  'Electri|Wiring|Electric Panel',
  roofing:     'Roof|Gutter|Shingle',
  landscaping: 'Landscap|Lawn|Garden',
  pest_control:'Pest|Exterminator|Bug Control',
  general:     'HVAC|Plumb|Electri|Roof',
};

async function geocodeCity(city, state, country = 'USA') {
  const q = encodeURIComponent(`${city}, ${state}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'FieldstackLeadGenerator/1.0 (contact@fieldstack.com)' }
  });

  if (!res.ok) throw new Error(`Nominatim geocoding failed: ${res.status}`);
  const data = await res.json();
  if (!data || data.length === 0) throw new Error(`Could not geocode "${city}, ${state}"`);

  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

function buildOverpassQuery(serviceType, lat, lon, radiusMeters) {
  const tags = SERVICE_TAGS[serviceType] || SERVICE_TAGS.hvac;
  const namePattern = NAME_PATTERNS[serviceType] || serviceType;

  const tagUnions = tags.map(([k, v]) => `
    node["${k}"="${v}"](around:${radiusMeters},${lat},${lon});
    way["${k}"="${v}"](around:${radiusMeters},${lat},${lon});
  `).join('\n');

  return `
    [out:json][timeout:30];
    (
      ${tagUnions}
      node["name"~"${namePattern}",i]["name"](around:${radiusMeters},${lat},${lon});
      way["name"~"${namePattern}",i]["name"](around:${radiusMeters},${lat},${lon});
    );
    out body;
    >;
    out skel qt;
  `;
}

function normalizeOSMResult(element, serviceType) {
  const t = element.tags || {};
  const lat = element.lat || (element.center && element.center.lat) || null;
  const lon = element.lon || (element.center && element.center.lon) || null;

  const addrParts = [t['addr:housenumber'], t['addr:street']].filter(Boolean);

  return {
    osm_id: `${element.type}/${element.id}`,
    osm_type: element.type,
    business_name: t.name || t.operator || 'Unknown Business',
    phone: t.phone || t['contact:phone'] || t['phone:mobile'] || null,
    website: t.website || t['contact:website'] || t.url || null,
    email: t.email || t['contact:email'] || null,
    address: addrParts.join(' ') || null,
    city: t['addr:city'] || null,
    state: t['addr:state'] || null,
    zip: t['addr:postcode'] || null,
    latitude: lat,
    longitude: lon,
    google_maps_url: lat && lon ? `https://maps.google.com/?q=${lat},${lon}` : null,
    service_type: serviceType,
    has_website: !!(t.website || t['contact:website'] || t.url),
    source: 'osm_finder',
  };
}

async function searchBusinesses(serviceType, city, state, radiusKm = 10, country = 'USA') {
  // Step 1: geocode
  const { lat, lon } = await geocodeCity(city, state, country);
  const radiusMeters = radiusKm * 1000;

  // Step 2: query Overpass
  const query = buildOverpassQuery(serviceType, lat, lon, radiusMeters);
  const overpassUrl = 'https://overpass-api.de/api/interpreter';

  const res = await fetch(overpassUrl, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'FieldstackLeadGenerator/1.0' }
  });

  if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);
  const data = await res.json();

  // Step 3: normalize, filter out unnamed elements, deduplicate by name+city
  const elements = (data.elements || []).filter(e => e.tags && e.tags.name);
  const seen = new Set();
  const results = [];

  for (const el of elements) {
    const normalized = normalizeOSMResult(el, serviceType);
    const key = `${normalized.business_name.toLowerCase()}|${normalized.city || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(normalized);
    }
  }

  return { results, geocoded: { lat, lon, city, state } };
}

module.exports = { searchBusinesses, geocodeCity };
