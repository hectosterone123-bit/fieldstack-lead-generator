// ============================================================
// FIELDSTACK — CLIENT CONFIG
// Edit this file once. Every page on the site updates.
// ============================================================

const CONFIG = {

  // ── Business basics ───────────────────────────────────────
  businessName:  "Peak Air HVAC",
  phone:         "(512) 555-0100",
  phoneRaw:      "5125550100",
  email:         "service@peakairhvac.com",
  address:       "4821 W Oltorf St",
  city:          "Austin",
  state:         "TX",
  zip:           "78745",
  licenseNum:    "TACLA12345C",

  // ── Brand / copy ─────────────────────────────────────────
  tagline:       "Austin's Most Trusted HVAC Company",
  subTagline:    "Same-Day AC Repair & Heating — Licensed, NATE Certified, 24/7 Emergency Response",
  yearFounded:   1998,
  rating:        4.9,
  reviewCount:   847,
  jobsCompleted: 12400,
  responseTime:  "Under 60 Min",
  guarantee:     "Same Day Or You Don't Pay",

  // ── Photos (swap Unsplash URLs for real photos) ──────────
  heroImage:  "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=1920&q=80",
  techPhoto:  "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80",
  ownerPhoto: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80",
  teamPhoto:  "https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?w=1200&q=80",

  // ── Integrations ─────────────────────────────────────────
  formspreeId:     "YOUR_FORM_ID",      // get free ID at formspree.io
  googleMapsEmbed: "",                  // paste Google Maps embed src URL here

  // ── Certifications ───────────────────────────────────────
  certifications: [
    "NATE Certified",
    "EPA 608 Certified",
    "BBB A+ Rated",
    "Carrier Authorized Dealer",
  ],

  // ── Financing ────────────────────────────────────────────
  financing: {
    offer:  "0% Financing for 18 Months",
    detail: "On qualifying HVAC systems. No money down. Apply in 60 seconds.",
  },

  // ── Homepage services grid ────────────────────────────────
  services: [
    { icon:"ac",        name:"AC Repair",           slug:"ac-repair",     desc:"Same-day diagnosis and repair on all makes and models. No overtime charges." },
    { icon:"heat",      name:"Heating Repair",      slug:"heating-repair",desc:"Furnace and heat pump repair before temperatures drop. Same-day available." },
    { icon:"install",   name:"System Installation", slug:"installation",  desc:"New HVAC systems with a 10-year parts warranty. Financing available." },
    { icon:"tune",      name:"Maintenance Plans",   slug:"maintenance",   desc:"Annual plans starting at $9.99/mo — prevent breakdowns before they happen." },
    { icon:"emergency", name:"24/7 Emergency",      slug:"emergency",     desc:"No overtime charges. We answer every call day or night, 365 days a year." },
    { icon:"air",       name:"Indoor Air Quality",  slug:"air-quality",   desc:"UV purifiers, filtration upgrades, and humidity control for healthier air." },
  ],

  // ── Service pages (full detail) ──────────────────────────
  servicePages: [
    {
      slug:       "ac-repair",
      name:       "AC Repair",
      icon:       "ac",
      heroHeadline: "AC Repair in Austin — Same Day, No Overtime",
      heroPara:   "Your air conditioner broke in the Texas heat. We dispatch within the hour, diagnose fast, and fix it right the first time.",
      heroImage:  "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=1920&q=80",
      priceRange: "Most repairs: $150–$450. Diagnostic fee: $89 (waived with repair).",
      whatsIncluded: [
        "Full system diagnostic — we find the real problem, not just symptoms",
        "Refrigerant check and recharge if needed",
        "Capacitor, contactor, and relay inspection",
        "Thermostat calibration and airflow check",
        "Written quote before any work begins",
        "Warranty on all parts and labor",
      ],
      process: [
        { step:"1", title:"You Call or Schedule",  desc:"We pick up — always. No call center, no voicemail hell." },
        { step:"2", title:"Tech Dispatched",        desc:"A NATE-certified tech heads your way, usually within 60 minutes." },
        { step:"3", title:"Diagnose & Quote",       desc:"We tell you exactly what's wrong and what it costs. No surprises." },
        { step:"4", title:"Fixed & Followed Up",   desc:"We fix it right, then check in 24 hours to make sure you're cool." },
      ],
      faq: [
        { q:"How much does AC repair cost in Austin?",       a:"Most repairs range from $150–$450. Common issues like capacitor replacement run $150–$250. Refrigerant recharges run $200–$400 depending on refrigerant type. We give you the exact price before starting." },
        { q:"Can you come today?",                            a:"Yes — same-day service is our standard, not an upgrade. Call before 3 PM and we'll have a tech out today." },
        { q:"Do you charge extra for evenings or weekends?", a:"Never. Our rate is the same at 10 PM Saturday as it is at 10 AM Tuesday." },
        { q:"What brands do you repair?",                     a:"All of them — Carrier, Trane, Lennox, Goodman, Rheem, York, American Standard, and more. Brand doesn't matter; we fix them all." },
        { q:"What if my AC can't be fixed?",                 a:"We'll tell you honestly. If a repair doesn't make financial sense, we'll give you a no-pressure quote on a new system with financing options." },
      ],
    },
    {
      slug:       "heating-repair",
      name:       "Heating Repair",
      icon:       "heat",
      heroHeadline: "Heating Repair in Austin — Furnace & Heat Pump",
      heroPara:   "Austin winters hit harder than people expect. When your heater fails, we get there fast and fix it right.",
      heroImage:  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1920&q=80",
      priceRange: "Most repairs: $150–$550. Diagnostic fee: $89 (waived with repair).",
      whatsIncluded: [
        "Full furnace or heat pump diagnostic",
        "Heat exchanger inspection (critical safety check)",
        "Igniter, flame sensor, and burner inspection",
        "Blower motor and belt check",
        "Carbon monoxide safety test",
        "Written quote before any work begins",
      ],
      process: [
        { step:"1", title:"Call Anytime",         desc:"24/7 — no overtime charge, no voicemail. We answer." },
        { step:"2", title:"Same-Day Dispatch",     desc:"Tech en route within 60 minutes for emergency calls." },
        { step:"3", title:"Safety First",          desc:"We check for CO leaks and heat exchanger cracks before anything else." },
        { step:"4", title:"Fixed with Warranty",  desc:"Every part and labor backed by our written warranty." },
      ],
      faq: [
        { q:"My heater is making a weird noise — should I be worried?",  a:"Possibly. Banging or rattling can mean a loose component. A sulfur or burning smell means shut it off and call us immediately. Don't ignore unusual noises from a furnace." },
        { q:"How long does a furnace repair take?",                       a:"Most repairs are completed in 1–2 hours on the first visit. We stock common parts on the truck to avoid second trips." },
        { q:"Is it better to repair or replace my furnace?",              a:"If your furnace is under 15 years old, repair usually makes sense. Over 15 years with frequent breakdowns — replacement is often cheaper long-term. We'll give you an honest recommendation." },
        { q:"Do you service heat pumps?",                                  a:"Yes. Heat pumps, furnaces, boilers, and dual-fuel systems — we work on all of them." },
        { q:"What's a heat exchanger and why does it matter?",            a:"The heat exchanger separates combustion gases from your home's air. A crack can leak carbon monoxide into your living space — it's a safety issue, not just a repair issue. We check it on every heating call." },
      ],
    },
    {
      slug:       "installation",
      name:       "System Installation",
      icon:       "install",
      heroHeadline: "HVAC Installation in Austin — Done Right",
      heroPara:   "A new HVAC system is a 15-year decision. We size it correctly, install it cleanly, and back it with a 10-year parts warranty.",
      heroImage:  "https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=1920&q=80",
      priceRange: "Most installs: $4,500–$12,000. 0% financing for 18 months available.",
      whatsIncluded: [
        "Full Manual J load calculation (correct sizing — not guessing)",
        "Removal and disposal of old equipment",
        "New system installation — indoor + outdoor units",
        "Refrigerant line set replacement if needed",
        "Thermostat upgrade (smart thermostat included on qualifying systems)",
        "10-year parts warranty + 1-year labor warranty",
        "City permit pulled and inspection scheduled",
      ],
      process: [
        { step:"1", title:"Free In-Home Estimate", desc:"We come out, measure your home, and give you an exact quote — not a range." },
        { step:"2", title:"Same-Week Install",     desc:"Most installs happen within 3–5 days of your approval." },
        { step:"3", title:"Clean Install",         desc:"Tarps down, work area protected. We leave cleaner than we arrived." },
        { step:"4", title:"Walk-Through & Warranty", desc:"We show you how everything works and register your warranty on the spot." },
      ],
      faq: [
        { q:"How do I know what size system I need?",       a:"Through a Manual J load calculation — the only correct way to size HVAC. We do this on every install quote. A system that's too big or too small will cost you in energy bills and repairs." },
        { q:"How long does installation take?",              a:"Most residential installs are completed in one day (4–8 hours). Large homes or complex systems may take two days." },
        { q:"What brands do you install?",                   a:"We're a Carrier Factory Authorized Dealer and also install Trane, Lennox, and Goodman. We'll recommend the right brand for your budget and home." },
        { q:"Do I need a permit?",                           a:"Yes, in Austin. We pull the permit and schedule the city inspection. It's included in our price — not an add-on." },
        { q:"What financing options are available?",         a:"We offer 0% financing for 18 months on qualifying systems through our financing partner. Apply in 60 seconds with no hard credit pull." },
      ],
    },
    {
      slug:       "maintenance",
      name:       "Maintenance Plans",
      icon:       "tune",
      heroHeadline: "HVAC Maintenance Plans — Prevent Breakdowns",
      heroPara:   "One annual tune-up prevents 80% of emergency repairs. Our maintenance plans start at $9.99/mo and pay for themselves every summer.",
      heroImage:  "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1920&q=80",
      priceRange: "Plans from $9.99/mo (annual) or $149 one-time tune-up.",
      whatsIncluded: [
        "Full system inspection — 21-point checklist",
        "Coil cleaning (indoor + outdoor)",
        "Filter replacement (standard 1\" filter included)",
        "Refrigerant level check",
        "Electrical connections tightened and tested",
        "Thermostat calibration",
        "Priority scheduling — plan members jump the queue",
        "10% discount on all repairs",
      ],
      process: [
        { step:"1", title:"Pick Your Plan",       desc:"Annual ($149), or monthly membership ($9.99/mo). Both include the same tune-up." },
        { step:"2", title:"Schedule Your Visit",  desc:"We come out at a time that works for you — evenings and Saturdays available." },
        { step:"3", title:"21-Point Tune-Up",     desc:"Thorough inspection and cleaning. Usually takes 45–75 minutes." },
        { step:"4", title:"Report + Priority",    desc:"You get a written report of everything checked. And priority service all year." },
      ],
      faq: [
        { q:"How often should I get my HVAC serviced?",     a:"Once a year minimum. Twice a year (spring for AC, fall for heating) is ideal. Most manufacturers require annual service to keep warranties valid." },
        { q:"What's the difference between a tune-up and a repair?", a:"A tune-up is preventive — we check and clean everything while it's working. A repair is reactive — fixing something that's already broken. Tune-ups prevent most repairs." },
        { q:"Can I cancel the monthly plan anytime?",       a:"Yes. No contracts, no cancellation fees. Cancel anytime with 30 days notice." },
        { q:"Do you remind me when it's time?",             a:"Yes. We reach out in spring and fall to schedule your visit. You don't have to remember." },
        { q:"Is the tune-up worth it for a newer system?",  a:"Yes. New systems need maintenance too — manufacturers require it for warranty validity. A $149 tune-up on a 2-year-old system can prevent a $400 repair at year 3." },
      ],
    },
    {
      slug:       "emergency",
      name:       "24/7 Emergency HVAC",
      icon:       "emergency",
      heroHeadline: "Emergency HVAC Repair — Austin, TX",
      heroPara:   "AC failed at midnight in July? Heater out on a cold Sunday? We're here. 24/7, no overtime charges, real techs — not answering services.",
      heroImage:  "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=1920&q=80",
      priceRange: "Same rate as daytime — no overtime surcharge, ever.",
      whatsIncluded: [
        "Live answer — real tech, not a call center",
        "Dispatch within 60 minutes of your call",
        "Full diagnostic on arrival",
        "Common parts stocked on every truck",
        "Same pricing as daytime service — guaranteed",
        "Written quote before any work begins",
      ],
      process: [
        { step:"1", title:"Call Now",              desc:"A real person answers. Tell us what's happening — we start dispatching immediately." },
        { step:"2", title:"Tech En Route",         desc:"Usually within 45–60 minutes anywhere in our service area." },
        { step:"3", title:"Diagnose on Arrival",   desc:"We find the problem fast. Most emergency repairs are fixed same visit." },
        { step:"4", title:"Fixed. Same Price.",    desc:"No emergency upcharge. Same rate as a Tuesday afternoon call." },
      ],
      faq: [
        { q:"Is there really no overtime charge?",           a:"Really. Our price is the same whether we come at 2 PM or 2 AM. We think that's the only fair way to do business." },
        { q:"How fast can you get here?",                    a:"Within 60 minutes for most of our service area. We'll give you an ETA when you call." },
        { q:"What qualifies as an emergency?",               a:"Anything that can't wait: no AC above 85°F inside, no heat below 55°F, refrigerant leak, electrical burning smell, or water actively leaking from your unit." },
        { q:"Do you stock parts on the truck?",              a:"Yes. We carry the most common capacitors, contactors, motors, and sensors. Most emergency repairs are resolved on the first visit." },
        { q:"What if it can't be fixed tonight?",            a:"We'll stabilize your system as much as possible and schedule a priority follow-up first thing in the morning with the needed part." },
      ],
    },
    {
      slug:       "air-quality",
      name:       "Indoor Air Quality",
      icon:       "air",
      heroHeadline: "Indoor Air Quality Solutions — Austin, TX",
      heroPara:   "You breathe indoor air 90% of the time. Texas homes trap dust, allergens, and humidity. We fix that.",
      heroImage:  "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=1920&q=80",
      priceRange: "Solutions from $299 (filtration upgrades) to $1,500 (whole-home systems).",
      whatsIncluded: [
        "Indoor air quality assessment",
        "HEPA or MERV-13 filtration upgrades",
        "UV germicidal light installation",
        "Whole-home dehumidifier or humidifier",
        "Duct cleaning and sanitization",
        "Carbon monoxide and VOC testing",
      ],
      process: [
        { step:"1", title:"Air Quality Assessment", desc:"We test your home's air — dust, humidity, allergens, CO levels." },
        { step:"2", title:"Custom Recommendation",  desc:"We recommend only what your home actually needs. No upselling." },
        { step:"3", title:"Professional Install",   desc:"Clean installation, integrated with your existing HVAC system." },
        { step:"4", title:"Ongoing Monitoring",    desc:"Filter replacement reminders and annual checks to keep it working." },
      ],
      faq: [
        { q:"How do I know if I have poor indoor air quality?",    a:"Common signs: allergy symptoms that improve when you leave home, musty smell, visible mold near vents, humidity above 60% in summer, or dusty surfaces that need frequent cleaning." },
        { q:"Does a UV light really work?",                         a:"Yes. UV-C germicidal lights installed in your air handler kill up to 99% of bacteria, mold, and viruses passing through your system. They're especially effective in humid climates like Austin." },
        { q:"What's the difference between a humidifier and dehumidifier?", a:"Austin summers are humid — you need a dehumidifier (reduces moisture). Austin winters can be dry — you may need a humidifier. We assess your home's actual humidity levels before recommending." },
        { q:"How often does duct cleaning need to happen?",         a:"Every 3–5 years under normal conditions. Sooner if you've had construction, a pest issue, mold, or moved into a home where the duct history is unknown." },
        { q:"Will better air quality reduce my energy bills?",      a:"Often yes. Clogged or dirty systems work harder. Clean filters and improved airflow can reduce energy use by 5–15%." },
      ],
    },
  ],

  // ── Why Us (homepage + shared) ───────────────────────────
  whyUs: [
    { icon:"clock",  title:"Same-Day Service",  desc:"We dispatch within the hour. No week-long wait windows." },
    { icon:"shield", title:"Upfront Pricing",   desc:"You get the exact price before we start. Zero surprises on the bill." },
    { icon:"star",   title:"4.9★ on Google",    desc:"Over 800 verified reviews from real homeowners in Austin." },
  ],

  // ── Testimonials ─────────────────────────────────────────
  testimonials: [
    { name:"Sarah M.", city:"Cedar Park", rating:5, text:"My AC went out at 9 PM on a Friday during a heat wave. Peak Air had someone out within 45 minutes and fixed it the same night. Absolutely incredible service." },
    { name:"James R.", city:"Austin",     rating:5, text:"Got 3 quotes for a new system. Peak Air was the only company that explained exactly what I needed and why. Fair price, clean install, no upselling." },
    { name:"Maria T.", city:"Round Rock", rating:5, text:"Been using them for 5 years for annual tune-ups. Never had a breakdown since. The maintenance plan pays for itself every summer." },
    { name:"David K.", city:"Georgetown", rating:5, text:"Called at 11 PM when my AC stopped working. Technician was here in under an hour, same price as daytime. Fixed in 30 minutes. These guys are the real deal." },
    { name:"Lisa P.",  city:"Kyle",       rating:5, text:"They installed a new Carrier system for us and the difference is night and day. House cools in half the time and our energy bill dropped $90/month." },
    { name:"Tom W.",   city:"Pflugerville",rating:5,text:"Used them for a maintenance plan for two years. When my neighbor had an AC breakdown last summer, I didn't. That plan is worth every penny." },
  ],

  // ── Service areas (homepage list) ───────────────────────
  serviceAreas: ["Austin","Round Rock","Cedar Park","Pflugerville","Georgetown","Kyle","Buda","Lakeway","Leander","Manor"],

  // ── Area pages (full detail for city landing pages) ──────
  areaPages: [
    { city:"Austin",       slug:"austin",       zip:"78701", localContext:"Austin summers regularly hit 105°F+ — your AC isn't optional. We've been keeping Austin homes cool since 1998 and know every neighborhood from South Congress to the Domain." },
    { city:"Round Rock",   slug:"round-rock",   zip:"78664", localContext:"Round Rock's rapid growth means more homes, more HVAC systems, and higher demand during summer peaks. We keep response times under 60 minutes to Round Rock year-round." },
    { city:"Cedar Park",   slug:"cedar-park",   zip:"78613", localContext:"Cedar Park homeowners face the same brutal central Texas heat with limestone soil that makes outdoor unit placement tricky. We know this market cold." },
    { city:"Pflugerville", slug:"pflugerville", zip:"78660", localContext:"Pflugerville's mix of new construction and older homes means we handle everything from warranty work on new systems to 20-year-old units that need replacing." },
    { city:"Georgetown",   slug:"georgetown",   zip:"78626", localContext:"Georgetown's historic district homes often have older ductwork that needs attention. We service everything from restored cottages to new builds in Wolf Ranch." },
    { city:"Kyle",         slug:"kyle",         zip:"78640", localContext:"Kyle is one of the fastest-growing cities in Texas — and one of the hottest. We have dedicated technicians covering Kyle and Buda year-round." },
    { city:"Buda",         slug:"buda",         zip:"78610", localContext:"Buda homeowners often share systems with Kyle service techs. We maintain full coverage in Buda with the same response times as our core Austin market." },
    { city:"Lakeway",      slug:"lakeway",      zip:"78734", localContext:"Lakeway homes on the Hill Country terrain often have complex two-story systems and zoning challenges. Our techs are trained for the specific challenges of the area." },
    { city:"Leander",      slug:"leander",      zip:"78641", localContext:"Leander's explosive growth has brought thousands of new HVAC installs. We're on the preferred installer list for several Leander builders and handle all service calls in the area." },
    { city:"Manor",        slug:"manor",        zip:"78653", localContext:"Manor is often overlooked by bigger HVAC companies — we've made it a priority market and maintain the same response times here as we do in central Austin." },
  ],

  // ── Homepage FAQ ─────────────────────────────────────────
  faq: [
    { q:"How quickly can you get here?",               a:"Emergency calls: within 60 minutes. Scheduled appointments: same-day or next-day with 2-hour arrival windows." },
    { q:"Do you charge extra for nights or weekends?", a:"Never. Our rate is the same at 11 PM Saturday as noon Tuesday — no exceptions." },
    { q:"What areas do you service?",                  a:"Austin, Round Rock, Cedar Park, Pflugerville, Georgetown, Kyle, Buda, Lakeway, Leander, and Manor." },
    { q:"Do you offer financing?",                     a:"Yes. 0% financing for 18 months on qualifying systems. Apply in 60 seconds, no hard credit pull." },
    { q:"Are you licensed and insured?",               a:"Yes. State-licensed (TX TACLA12345C), fully insured, NATE certified, EPA 608 certified." },
  ],

  // ── About page ───────────────────────────────────────────
  about: {
    ownerName:  "Mike Garza",
    ownerTitle: "Owner & Master HVAC Tech",
    story:      "I started Peak Air in 1998 with one truck, a full tool belt, and a simple rule: show up when you say you will, fix it right the first time, and charge a fair price. That rule hasn't changed. What started as a one-man operation in South Austin is now a team of 12 NATE-certified technicians covering the entire greater Austin area. We still answer our own phones. We still pull our own permits. And I still personally follow up on every install.",
    values: [
      { icon:"clock",  title:"Respect Your Time",   desc:"We give 30-minute arrival windows, not 4-hour windows. Your time matters." },
      { icon:"shield", title:"Honest Diagnosis",    desc:"We tell you what's actually wrong — not what costs the most to fix." },
      { icon:"star",   title:"Clean Work",          desc:"Tarps down, workspace protected. We leave cleaner than we arrived." },
    ],
    milestones: [
      { year:"1998", event:"Founded with one truck in South Austin" },
      { year:"2004", event:"Added heating services and second technician" },
      { year:"2010", event:"Became Carrier Factory Authorized Dealer" },
      { year:"2016", event:"Expanded to full team of 8 technicians" },
      { year:"2020", event:"Hit 10,000 completed jobs milestone" },
      { year:"2024", event:"12 techs, 10 service cities, 4.9★ Google rating" },
    ],
    team: [
      { name:"Mike G.",   role:"Owner / Master Tech",   years:26, photo:"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&q=80" },
      { name:"Carlos R.", role:"Lead Install Tech",     years:11, photo:"https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=300&q=80" },
      { name:"Jason T.",  role:"Senior Service Tech",   years:8,  photo:"https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&q=80" },
      { name:"Priya S.",  role:"Service Coordinator",   years:5,  photo:"https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300&q=80" },
    ],
  },
};
