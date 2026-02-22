const VARIABLE_MAP = {
  business_name: { field: 'business_name', fallback: 'your company' },
  first_name:    { field: 'first_name',    fallback: 'there' },
  last_name:     { field: 'last_name',     fallback: '' },
  email:         { field: 'email',         fallback: '' },
  phone:         { field: 'phone',         fallback: '' },
  city:          { field: 'city',          fallback: 'your area' },
  state:         { field: 'state',         fallback: '' },
  service_type:  { field: 'service_type',  fallback: 'home service' },
  estimated_value: { field: 'estimated_value', fallback: '' },
};

function renderTemplate(text, lead) {
  if (!text) return '';
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    const mapping = VARIABLE_MAP[key];
    if (!mapping) return match;
    const value = lead[mapping.field];
    if (value == null || value === '') return mapping.fallback;
    if (key === 'service_type') return formatServiceType(value);
    if (key === 'estimated_value') return `$${Number(value).toLocaleString()}`;
    return String(value);
  });
}

function formatServiceType(type) {
  const labels = {
    hvac: 'HVAC',
    plumbing: 'plumbing',
    electrical: 'electrical',
    roofing: 'roofing',
    landscaping: 'landscaping',
    pest_control: 'pest control',
    general: 'home service',
  };
  return labels[type] || type;
}

function getAvailableVariables() {
  return Object.entries(VARIABLE_MAP).map(([key, { fallback }]) => ({
    variable: `{${key}}`,
    description: key.replace(/_/g, ' '),
    fallback,
  }));
}

module.exports = { renderTemplate, getAvailableVariables };
