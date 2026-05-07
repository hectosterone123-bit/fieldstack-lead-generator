const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeInitialHeatScore } = require('../services/heatScoreService');
const eventBus = require('../services/eventBus');

// Inline widget script — served as JS file so contractors paste one <script> tag
const WIDGET_SCRIPT = `(function(){
  var s=document.currentScript;
  var apiKey=s&&s.getAttribute('data-key')||'';
  var serviceDefault=s&&s.getAttribute('data-service')||'hvac';
  var base=s&&s.src.replace('/api/widget/embed.js','') || '';

  var css=document.createElement('style');
  css.textContent=[
    '#fs-btn{position:fixed;bottom:24px;right:24px;z-index:99999;background:#f97316;color:#fff;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;border:none;border-radius:9999px;padding:12px 20px;cursor:pointer;box-shadow:0 4px 20px rgba(249,115,22,.4);}',
    '#fs-btn:hover{background:#ea6c0b;}',
    '#fs-overlay{display:none;position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);}',
    '#fs-modal{display:none;position:fixed;bottom:80px;right:24px;z-index:99999;background:#18181b;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:24px;width:320px;font-family:system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.5);}',
    '#fs-modal h3{color:#f4f4f5;font-size:16px;font-weight:600;margin:0 0 4px 0;}',
    '#fs-modal p{color:#71717a;font-size:12px;margin:0 0 16px 0;}',
    '#fs-modal input,#fs-modal select{width:100%;box-sizing:border-box;background:#27272a;border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#f4f4f5;font-size:13px;padding:8px 12px;margin-bottom:8px;outline:none;}',
    '#fs-modal input::placeholder{color:#52525b;}',
    '#fs-modal select option{background:#27272a;}',
    '#fs-submit{width:100%;background:#f97316;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;margin-top:4px;}',
    '#fs-submit:hover{background:#ea6c0b;}',
    '#fs-submit:disabled{background:#52525b;cursor:not-allowed;}',
    '#fs-success{color:#34d399;font-size:13px;text-align:center;padding:16px 0;}',
  ].join('');
  document.head.appendChild(css);

  var btn=document.createElement('button');
  btn.id='fs-btn';
  btn.textContent='Get a Free Quote';
  document.body.appendChild(btn);

  var overlay=document.createElement('div');
  overlay.id='fs-overlay';
  document.body.appendChild(overlay);

  var modal=document.createElement('div');
  modal.id='fs-modal';
  modal.innerHTML='<h3>Request a Free Quote</h3><p>We\\'ll call you within minutes.</p>'
    +'<form id="fs-form">'
    +'<input name="first_name" placeholder="First name"/>'
    +'<input name="phone" placeholder="Phone number *" type="tel" required/>'
    +'<input name="email" placeholder="Email address" type="email"/>'
    +'<input name="city" placeholder="City"/>'
    +'<select name="service_type">'
    +'<option value="hvac">HVAC</option>'
    +'<option value="roofing">Roofing</option>'
    +'<option value="plumbing">Plumbing</option>'
    +'<option value="electrical">Electrical</option>'
    +'<option value="landscaping">Landscaping</option>'
    +'<option value="general">Other</option>'
    +'</select>'
    +'<button id="fs-submit" type="submit">Request Quote</button>'
    +'</form>';
  document.body.appendChild(modal);

  // Pre-select the data-service attribute
  var sel=modal.querySelector('select[name=service_type]');
  if(sel && serviceDefault){
    var opt=sel.querySelector('option[value="'+serviceDefault+'"]');
    if(opt) opt.selected=true;
  }

  function openModal(){overlay.style.display='block';modal.style.display='block';}
  function closeModal(){overlay.style.display='none';modal.style.display='none';}

  btn.addEventListener('click',openModal);
  overlay.addEventListener('click',closeModal);

  document.getElementById('fs-form').addEventListener('submit',function(e){
    e.preventDefault();
    var el=this.elements;
    var sub=document.getElementById('fs-submit');
    sub.disabled=true;
    sub.textContent='Sending...';
    fetch(base+'/api/widget/submit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        api_key:apiKey,
        first_name:el.first_name.value.trim(),
        phone:el.phone.value.trim(),
        email:el.email.value.trim(),
        city:el.city.value.trim(),
        service_type:el.service_type.value
      })
    })
    .then(function(r){return r.json();})
    .then(function(r){
      if(r.success){
        document.getElementById('fs-form').innerHTML='<div id="fs-success">Got it! We\\'ll call you shortly.</div>';
        setTimeout(closeModal,3000);
      } else {
        sub.disabled=false;
        sub.textContent='Request Quote';
      }
    })
    .catch(function(){
      sub.disabled=false;
      sub.textContent='Request Quote';
    });
  });
})();`;

// GET /api/widget/embed.js — serve the injectable widget script
router.get('/embed.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(WIDGET_SCRIPT);
});

// POST /api/widget/submit — public, secured by api_key in request body
router.post('/submit', async (req, res) => {
  const widgetEnabled = db.get("SELECT value FROM settings WHERE key = 'widget_enabled'")?.value;
  if (widgetEnabled === '0') return res.status(403).json({ error: 'Widget is disabled' });

  const storedKey = db.get("SELECT value FROM settings WHERE key = 'widget_api_key'")?.value;
  if (storedKey && req.body.api_key !== storedKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const { first_name, last_name, phone, email, service_type = 'hvac', city } = req.body;
  if (!phone && !email) return res.status(400).json({ error: 'phone or email is required' });

  const businessName = [first_name, last_name].filter(Boolean).join(' ').trim() || 'Website Lead';
  const heatScore = computeInitialHeatScore({
    phone: phone || null, email: email || null,
    has_website: 0, website_live: 0, rating: null, review_count: null
  });

  const result = db.run(
    `INSERT INTO leads (business_name, first_name, last_name, phone, email, city, service_type, status, heat_score, estimated_value, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, 2000, 'website')`,
    [businessName, first_name || null, last_name || null, phone || null, email || null,
     city || null, service_type, heatScore]
  );

  const lead = db.get('SELECT * FROM leads WHERE id = ?', [result.lastInsertRowid]);
  if (!lead) return res.status(500).json({ error: 'Failed to create lead' });

  // Speed-to-lead: auto-queue for immediate calling if enabled + business hours
  try {
    const speedEnabled = db.get("SELECT value FROM settings WHERE key = 'speed_to_lead_enabled'")?.value === '1';
    const speedTemplateId = parseInt(db.get("SELECT value FROM settings WHERE key = 'speed_to_lead_template_id'")?.value);
    if (speedEnabled && speedTemplateId && lead.phone) {
      const localHour = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', hour12: false
      }).format(new Date()));
      if (localHour >= 8 && localHour < 20) {
        db.run("UPDATE call_queue SET position = position + 1 WHERE status = 'pending'");
        db.run("INSERT INTO call_queue (lead_id, template_id, position, status) VALUES (?, ?, 1, 'pending')", [lead.id, speedTemplateId]);
      }
    }
  } catch {}

  db.run(
    "INSERT INTO activities (lead_id, type, title, description) VALUES (?, 'import', 'Website lead', 'Lead submitted via website contact form')",
    [lead.id]
  );

  eventBus.emit({ type: 'new_lead', id: lead.id, name: lead.business_name });

  res.json({ success: true });
});

module.exports = router;
