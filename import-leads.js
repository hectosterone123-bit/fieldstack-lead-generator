const https = require('https');
const BASE = 'https://fieldstack-lead-gen-production.up.railway.app';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(BASE + path, {
      method: 'POST', headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}
    }, res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve(JSON.parse(b))); });
    req.on('error', reject); req.write(data); req.end();
  });
}

function get(path) {
  return new Promise((resolve) => {
    https.get(BASE + path, res => {
      let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve(JSON.parse(b)));
    });
  });
}

(async () => {
  const hvac = await post('/api/finder/search', {service_type:'hvac',city:'Austin',state:'TX',radius:10});
  console.log('HVAC found:', hvac.data ? hvac.data.length : 0);

  const roofing = await post('/api/finder/search', {service_type:'roofing',city:'Austin',state:'TX',radius:10,source:'google'});
  console.log('Roofing found:', roofing.data ? roofing.data.length : 0);

  if (hvac.data && hvac.data.length > 0) {
    const r1 = await post('/api/finder/import', {leads: hvac.data});
    console.log('HVAC imported:', r1.data ? r1.data.imported : r1.error);
  }

  if (roofing.data && roofing.data.length > 0) {
    const r2 = await post('/api/finder/import', {leads: roofing.data});
    console.log('Roofing imported:', r2.data ? r2.data.imported : r2.error);
  }

  const stats = await get('/api/stats');
  console.log('Total leads now:', stats.data.total_leads);
})();
