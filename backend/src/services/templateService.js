const db = require('../db');

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

const NICHE_DATA = {
  hvac: {
    avg_job_value: '$4,500-$8,000',
    avg_job_single: '$6,000',
    monthly_leads_single: '30',
    close_rate_slow: '22%',
    close_rate_fast: '55%',
    lost_revenue_monthly: '$12,000-$20,000',
    pain_point: 'emergency no-cool/no-heat calls where homeowners hire whoever picks up first',
    busy_season: 'summer cooling and winter heating season',
    seasonal_trigger: 'temperatures shift',
    scenario_subject: 'AC issue at my home — need someone this week',
    scenario_standard: `our system has been running nonstop but the house won't get below 78. Started about three days ago. We've changed the filter and checked the thermostat — still the same.

We're home most days this week. Could someone come take a look? We'd love a free estimate if you offer one.`,
    scenario_urgent: `Our AC stopped working this afternoon. No air coming out at all. We have an elderly parent staying with us and need this resolved quickly.`,
    scenario_referral: `had you guys out last month for an AC tune-up and couldn't stop talking about the service. Said you were fast, fair, and actually showed up when you said you would (which apparently is rare).

We've been putting off getting our system looked at — it's probably 12-15 years old and we're not sure if it needs a repair or a full replacement. Would love to get a professional opinion before summer hits.`,
    scenario_sms: 'Need HVAC help — system isn\'t cooling right. Available for an estimate this week?',
    scenario_sms_urgent: 'AC just stopped working at our home. Elderly parent here. Can you send someone today or tomorrow AM?',
    scenario_call_a: 'Our system has been running but the house won\'t cool below 78. Started a few days ago.',
    scenario_call_b: 'We\'ve got an older unit, probably 12-15 years, and want someone to tell us if it\'s worth repairing or replacing.',
    scenario_call_c: 'System went out completely. No air at all. We need someone out fast.',
    loom_pain: 'For a $6,000 HVAC job, that\'s a lot of money left on the table.',
    loom_reveal: 'whenever a lead hits your site, Sam texts them in 20 seconds, qualifies their project size, and books them directly onto your calendar.',
    loom_math_intro: 'The average HVAC job runs about $4,500 to $8,000.',
  },
  roofing: {
    avg_job_value: '$8,000-$15,000',
    avg_job_single: '$12,000',
    monthly_leads_single: '20',
    close_rate_slow: '18%',
    close_rate_fast: '48%',
    lost_revenue_monthly: '$25,000-$45,000',
    pain_point: 'storm damage claims where the first roofer on-site usually wins the insurance job',
    busy_season: 'spring storm season and post-hurricane months',
    seasonal_trigger: 'storm season ramps up',
    scenario_subject: 'Roof damage after the storm — need an inspection',
    scenario_standard: `we noticed some shingles blew off during last week's storm and now there's a water stain spreading on our upstairs ceiling. We're worried it's going to get worse with more rain in the forecast.

We're home most days this week. Could someone come out for an inspection? We'd love a free estimate if you offer one.`,
    scenario_urgent: `We've got water coming through our ceiling after last night's storm. Looks like a big section of shingles got ripped off. We need someone out ASAP before it rains again.`,
    scenario_referral: `replaced your neighbor's roof last month after the hail damage and couldn't stop talking about the work. Said your crew was fast, clean, and handled the insurance paperwork.

We've been putting off a roof inspection — our roof is probably 15-20 years old and we've noticed a few missing shingles. Would love a professional opinion before storm season really kicks in.`,
    scenario_sms: 'Need a roof inspection — noticed missing shingles and a ceiling stain after the storm. Available this week?',
    scenario_sms_urgent: 'Water coming through our ceiling after last night\'s storm. Need emergency roof repair ASAP. Can you send someone today?',
    scenario_call_a: 'We noticed some shingles blew off after the last storm and there\'s a water stain on our ceiling.',
    scenario_call_b: 'Our roof is about 15-20 years old and we want someone to tell us if it needs repairs or a full replacement.',
    scenario_call_c: 'We\'ve got an active leak after last night\'s storm. Water is coming through the ceiling. We need someone out fast.',
    loom_pain: 'For a $12,000 roofing job, that\'s a lot of money left on the table.',
    loom_reveal: 'whenever a lead hits your site, Sam texts them in 20 seconds, qualifies the damage, gets photos, and books the inspection onto your calendar.',
    loom_math_intro: 'The average roofing job runs about $8,000 to $15,000.',
  },
  plumbing: {
    avg_job_value: '$500-$3,000',
    avg_job_single: '$1,800',
    monthly_leads_single: '35',
    close_rate_slow: '20%',
    close_rate_fast: '52%',
    lost_revenue_monthly: '$8,000-$15,000',
    pain_point: '24/7 emergency calls where homeowners hire the first plumber who answers',
    busy_season: 'winter freeze season and spring thaw',
    seasonal_trigger: 'pipes start freezing or spring storms hit',
    scenario_subject: 'Plumbing issue at my home — need someone this week',
    scenario_standard: `we've got a slow drain in the kitchen that's been getting worse over the past week. Tried drain cleaner twice but it keeps backing up. Now the bathroom sink is draining slow too.

We're home most days this week. Could someone come take a look? We'd love a free estimate if you offer one.`,
    scenario_urgent: `We've got a pipe that burst under our kitchen sink. Water is leaking everywhere and we've shut off the main valve but need someone out ASAP.`,
    scenario_referral: `fixed a leak at their place last month and couldn't stop talking about the service. Said you were fast, honest about the pricing, and actually showed up when you said you would.

We've been dealing with low water pressure for a while and our water heater is making weird noises — it's probably 10-12 years old. Would love a professional opinion.`,
    scenario_sms: 'Need a plumber — kitchen drain keeps backing up despite drain cleaner. Available for an estimate this week?',
    scenario_sms_urgent: 'Pipe burst under our kitchen sink. Water everywhere. Can you send someone today? Please call back ASAP.',
    scenario_call_a: 'Our kitchen drain has been backing up for about a week. Tried drain cleaner twice but it keeps coming back.',
    scenario_call_b: 'Our water heater is about 10-12 years old and making weird noises. Want someone to tell us if it\'s worth repairing or replacing.',
    scenario_call_c: 'We\'ve got a burst pipe under the kitchen sink. Water is everywhere. We need someone out fast.',
    loom_pain: 'For a $1,800 plumbing job, that\'s money left on the table — and plumbing leads are urgent, so speed matters even more.',
    loom_reveal: 'whenever a lead hits your site, Sam texts them in 20 seconds, qualifies the issue, and books the service call onto your calendar.',
    loom_math_intro: 'The average plumbing job runs about $500 to $3,000.',
  },
  electrical: {
    avg_job_value: '$1,500-$5,000',
    avg_job_single: '$3,000',
    monthly_leads_single: '25',
    close_rate_slow: '23%',
    close_rate_fast: '50%',
    lost_revenue_monthly: '$10,000-$18,000',
    pain_point: 'panel upgrades, EV charger installs, and outage calls where speed wins the job',
    busy_season: 'summer AC-load season and storm outage season',
    seasonal_trigger: 'power outages spike or summer electrical loads increase',
    scenario_subject: 'Electrical issue at my home — need someone this week',
    scenario_standard: `a couple of outlets in our living room stopped working and the breaker keeps tripping every time we reset it. We've tried unplugging everything but it still trips.

We're home most days this week. Could someone come take a look? We'd love a free estimate if you offer one.`,
    scenario_urgent: `Half our house lost power and the main breaker won't stay on. We've got a home office and kids doing remote school — need this fixed today if possible.`,
    scenario_referral: `did a panel upgrade for them last month and couldn't stop talking about the work. Said you were licensed, explained everything clearly, and finished ahead of schedule.

We've been having flickering lights and our panel is probably 25+ years old. We're also thinking about adding an EV charger. Would love a professional opinion on what we need.`,
    scenario_sms: 'Need an electrician — breaker keeps tripping and outlets stopped working. Available for an estimate this week?',
    scenario_sms_urgent: 'Half our house lost power, breaker won\'t stay on. Need emergency electrician today. Please call back ASAP.',
    scenario_call_a: 'A couple outlets stopped working and the breaker keeps tripping when we reset it.',
    scenario_call_b: 'Our electrical panel is about 25 years old and we want someone to tell us if it needs an upgrade. Also thinking about an EV charger.',
    scenario_call_c: 'Half the house lost power. Main breaker won\'t stay on. We need someone out fast.',
    loom_pain: 'For a $3,000 electrical job, that\'s a lot of money left on the table.',
    loom_reveal: 'whenever a lead hits your site, Sam texts them in 20 seconds, qualifies the issue, and books the service call onto your calendar.',
    loom_math_intro: 'The average electrical job runs about $1,500 to $5,000.',
  },
  landscaping: {
    avg_job_value: '$2,000-$8,000',
    avg_job_single: '$4,500',
    monthly_leads_single: '25',
    close_rate_slow: '25%',
    close_rate_fast: '55%',
    lost_revenue_monthly: '$10,000-$20,000',
    pain_point: 'seasonal design projects where homeowners get multiple quotes and book whoever responds first',
    busy_season: 'spring planting and fall cleanup season',
    seasonal_trigger: 'spring arrives and homeowners start planning outdoor projects',
    scenario_subject: 'Landscaping project — looking for estimates',
    scenario_standard: `our backyard is a mess — overgrown beds, dead patches in the lawn, and the patio area needs work. We're looking for a full cleanup and maybe some new plantings and mulch.

We're home most days this week. Could someone come take a look and give us an estimate?`,
    scenario_urgent: `We have a big outdoor event in two weeks and our yard is in rough shape. Need someone who can do a full cleanup, mulch the beds, and get the lawn looking presentable fast.`,
    scenario_referral: `did a full backyard redesign for them and it looks amazing. Said your crew was creative, showed up on time, and stayed within budget.

We've been wanting to redo our front yard — the shrubs are overgrown, the beds need reworking, and we want something that actually looks designed. Would love to get your ideas and a quote.`,
    scenario_sms: 'Need landscaping help — yard is overgrown and needs a full cleanup. Available for an estimate this week?',
    scenario_sms_urgent: 'Outdoor event in 2 weeks, yard needs a full cleanup ASAP. Can you send someone to take a look?',
    scenario_call_a: 'Our yard is really overgrown — beds, lawn, everything. We need a full cleanup and maybe some new plantings.',
    scenario_call_b: 'We want to redo our front yard landscaping. Looking for someone to design something that looks professional.',
    scenario_call_c: 'We have an event in two weeks and need an emergency cleanup. Mulch, mowing, trimming — the works.',
    loom_pain: 'For a $4,500 landscaping project, that\'s a lot of money left on the table.',
    loom_reveal: 'whenever a lead hits your site, Sam texts them in 20 seconds, qualifies the project scope, and books the consultation onto your calendar.',
    loom_math_intro: 'The average landscaping project runs about $2,000 to $8,000.',
  },
  pest_control: {
    avg_job_value: '$300-$1,500',
    avg_job_single: '$800',
    monthly_leads_single: '45',
    close_rate_slow: '28%',
    close_rate_fast: '60%',
    lost_revenue_monthly: '$6,000-$12,000',
    pain_point: 'urgent pest sightings where homeowners want someone out today, not tomorrow',
    busy_season: 'spring and summer when pest activity peaks',
    seasonal_trigger: 'temperatures warm up and pest activity spikes',
    scenario_subject: 'Pest problem at my home — need someone this week',
    scenario_standard: `we've been seeing roaches in the kitchen and bathroom for about two weeks now. Tried store-bought traps and spray but they keep coming back. Starting to see them during the day too.

We're home most days this week. Could someone come do an inspection? We'd love a free estimate if you offer one.`,
    scenario_urgent: `We found what looks like termite damage in our garage — soft wood, small holes, and sawdust piles. Need someone to inspect ASAP before it spreads further.`,
    scenario_referral: `did a full pest treatment at their place and the problem was gone within days. Said you were thorough, explained what was causing the issue, and set up a prevention plan.

We've been dealing with ants coming in through the kitchen for months. Store-bought stuff isn't cutting it anymore. Would love a professional assessment.`,
    scenario_sms: 'Seeing roaches in the kitchen and bathroom — tried sprays but they keep coming back. Available for an inspection this week?',
    scenario_sms_urgent: 'Found termite damage in our garage. Need emergency inspection ASAP. Can you send someone today?',
    scenario_call_a: 'We\'ve been seeing roaches in the kitchen for a couple weeks. Tried store-bought traps but they keep coming back.',
    scenario_call_b: 'We want a full pest inspection. We\'ve seen a few different bugs around the house and want to know what we\'re dealing with.',
    scenario_call_c: 'We found what looks like termite damage in the garage. Soft wood, sawdust piles. Need someone out fast.',
    loom_pain: 'For pest control, volume matters — losing even a few leads a week at $800 each adds up fast.',
    loom_reveal: 'whenever a lead hits your site, Sam texts them in 20 seconds, identifies the pest issue, and books the inspection onto your calendar.',
    loom_math_intro: 'The average pest control job runs about $300 to $1,500.',
  },
  general: {
    avg_job_value: '$1,500-$5,000',
    avg_job_single: '$3,000',
    monthly_leads_single: '25',
    close_rate_slow: '23%',
    close_rate_fast: '52%',
    lost_revenue_monthly: '$10,000-$18,000',
    pain_point: 'service calls where the homeowner hires whoever responds first',
    busy_season: 'peak season',
    seasonal_trigger: 'demand picks up',
    scenario_subject: 'Service issue at my home — need someone this week',
    scenario_standard: `we've got a couple of issues around the house that need professional attention. Things have been getting worse and we'd rather get it handled before it becomes a bigger problem.

We're home most days this week. Could someone come take a look? We'd love a free estimate if you offer one.`,
    scenario_urgent: `We've got an urgent issue at our home that needs immediate attention. Can someone come out today or first thing tomorrow?`,
    scenario_referral: `had work done by your company and couldn't stop talking about the service. Said you were reliable, fair, and actually showed up when you said you would.

We've been putting off some work around the house and would love to get a professional opinion.`,
    scenario_sms: 'Need help with a home service issue. Available for an estimate this week?',
    scenario_sms_urgent: 'Urgent issue at our home. Need someone out today. Please call back ASAP.',
    scenario_call_a: 'We\'ve got some issues around the house that need professional attention.',
    scenario_call_b: 'We\'re looking for someone to assess some work we need done and give us an honest opinion.',
    scenario_call_c: 'We\'ve got an urgent problem. We need someone out fast.',
    loom_pain: 'For a $3,000 job, that\'s a lot of money left on the table.',
    loom_reveal: 'whenever a lead hits your site, Sam texts them in 20 seconds, qualifies their project, and books them onto your calendar.',
    loom_math_intro: 'The average service job runs about $1,500 to $5,000.',
  },
};

function getSettingValue(key) {
  try {
    const row = db.get('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value || '';
  } catch { return ''; }
}

function renderTemplate(text, lead) {
  if (!text) return '';
  const nicheData = NICHE_DATA[lead.service_type] || NICHE_DATA.general;
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    const mapping = VARIABLE_MAP[key];
    if (mapping) {
      const value = lead[mapping.field];
      if (value == null || value === '') return mapping.fallback;
      if (key === 'service_type') return formatServiceType(value);
      if (key === 'estimated_value') return `$${Number(value).toLocaleString()}`;
      return String(value);
    }
    if (key === 'booking_link') {
      return getSettingValue('booking_link') || '[Set booking link in Settings]';
    }
    if (nicheData[key] !== undefined) {
      return nicheData[key];
    }
    return match;
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
  const standard = Object.entries(VARIABLE_MAP).map(([key, { fallback }]) => ({
    variable: `{${key}}`,
    description: key.replace(/_/g, ' '),
    fallback,
  }));
  standard.push({
    variable: '{booking_link}',
    description: 'booking link',
    fallback: '[Set booking link in Settings]',
  });
  const nicheVars = Object.keys(NICHE_DATA.general)
    .filter(k => !k.startsWith('scenario_') && !k.startsWith('loom_'))
    .map(key => ({
      variable: `{${key}}`,
      description: `Niche: ${key.replace(/_/g, ' ')}`,
      fallback: NICHE_DATA.general[key],
    }));
  return [...standard, ...nicheVars];
}

module.exports = { renderTemplate, getAvailableVariables, NICHE_DATA };
