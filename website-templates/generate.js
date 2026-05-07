// ============================================================
// FIELDSTACK — Page Generator
// Run: node generate.js
// Generates all service + area pages from templates
// ============================================================
const fs = require('fs');
const path = require('path');

const base = __dirname;
const svcTemplate  = fs.readFileSync(path.join(base, '_service-template.html'), 'utf8');
const areaTemplate = fs.readFileSync(path.join(base, '_area-template.html'), 'utf8');

// Service slugs — must match config.js
const serviceSlugs = ['ac-repair','heating-repair','installation','maintenance','emergency','air-quality'];

// Area slugs — must match config.js
const areaSlugs = ['austin','round-rock','cedar-park','pflugerville','georgetown','kyle','buda','lakeway','leander','manor'];

// Ensure dirs exist
fs.mkdirSync(path.join(base,'services'), { recursive:true });
fs.mkdirSync(path.join(base,'areas'),    { recursive:true });

serviceSlugs.forEach(slug => {
  const dest = path.join(base,'services',`${slug}.html`);
  fs.writeFileSync(dest, svcTemplate);
  console.log('✓ services/' + slug + '.html');
});

areaSlugs.forEach(slug => {
  const dest = path.join(base,'areas',`${slug}.html`);
  fs.writeFileSync(dest, areaTemplate);
  console.log('✓ areas/' + slug + '.html');
});

console.log('\nDone. ' + (serviceSlugs.length + areaSlugs.length) + ' pages generated.');
