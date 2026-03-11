const fetch = require('node-fetch');

async function geocodeWithGoogle(city, state, country = 'USA') {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const address = encodeURIComponent(`${city}, ${state}, ${country}`);
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${apiKey}`
  );
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`Could not geocode "${city}, ${state}"`);
  }
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lon: lng };
}

const QUERY_MAP = {
  hvac: 'HVAC contractor',
  plumbing: 'plumber',
  electrical: 'electrician',
  roofing: 'roofing contractor',
  landscaping: 'landscaping company',
  pest_control: 'pest control',
  general: 'home service contractor',
};

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
].join(',');

function parseAddress(formattedAddress) {
  if (!formattedAddress) return { address: null, city: null, state: null, zip: null };

  // Typical format: "123 Main St, Austin, TX 78701, USA"
  const parts = formattedAddress.split(',').map(s => s.trim());

  const address = parts[0] || null;
  const city = parts[1] || null;

  let state = null;
  let zip = null;
  if (parts[2]) {
    const stateZip = parts[2].trim().split(/\s+/);
    state = stateZip[0] || null;
    zip = stateZip[1] || null;
  }

  return { address, city, state, zip };
}

function normalizeGoogleResult(place, serviceType) {
  const parsed = parseAddress(place.formattedAddress);
  const lat = place.location?.latitude || null;
  const lon = place.location?.longitude || null;

  return {
    osm_id: null,
    osm_type: null,
    google_place_id: place.id,
    business_name: place.displayName?.text || 'Unknown Business',
    phone: place.nationalPhoneNumber || null,
    website: place.websiteUri || null,
    email: null,
    address: parsed.address,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    latitude: lat,
    longitude: lon,
    google_maps_url: place.googleMapsUri || (lat && lon ? `https://maps.google.com/?q=${lat},${lon}` : null),
    service_type: serviceType,
    has_website: !!place.websiteUri,
    rating: place.rating || null,
    review_count: place.userRatingCount || null,
    source: 'google_places',
  };
}

async function fetchPlacesPage(textQuery, locationBias, pageToken) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured. Add it to backend/.env');
  }

  const body = { textQuery, locationBias };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK + ',nextPageToken',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Places API error ${res.status}: ${errBody}`);
  }

  return res.json();
}

async function searchBusinesses(serviceType, city, state, radiusKm = 10, country = 'USA') {
  const { lat, lon } = await geocodeWithGoogle(city, state, country);
  const radiusMeters = radiusKm * 1000;

  const queryText = QUERY_MAP[serviceType] || QUERY_MAP.general;
  const countryLabel = country === 'Mexico' ? ', Mexico' : '';
  const textQuery = `${queryText} in ${city}, ${state}${countryLabel}`;

  const locationBias = {
    circle: {
      center: { latitude: lat, longitude: lon },
      radius: radiusMeters,
    },
  };

  // Fetch up to 2 pages
  const allPlaces = [];
  let pageToken = null;

  for (let page = 0; page < 2; page++) {
    const data = await fetchPlacesPage(textQuery, locationBias, pageToken);
    if (data.places) allPlaces.push(...data.places);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  // Normalize and deduplicate
  const seen = new Set();
  const results = [];

  for (const place of allPlaces) {
    const normalized = normalizeGoogleResult(place, serviceType);
    const key = `${normalized.business_name.toLowerCase()}|${(normalized.city || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(normalized);
    }
  }

  return { results, geocoded: { lat, lon, city, state } };
}

module.exports = { searchBusinesses };
