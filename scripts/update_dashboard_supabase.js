const fs = require('fs');
let js = fs.readFileSync('server/public/dashboard.js', 'utf8');

const regex1 = /\]\.forEach\(k => \{\s*const el = document\.getElementById\('tog-' \+ k\);\s*if \(el\) settings\[k\] = el\.checked;\s*\}\);/;
const replacement1 = `].forEach(k => {
      const el = document.getElementById('tog-' + k);
      if (el) settings[k] = el.checked;
    });
    ['supabaseUrl', 'supabaseKey'].forEach(k => {
      const el = document.getElementById('cfg-' + k);
      if (el) settings[k] = el.value;
    });`;

js = js.replace(regex1, replacement1);

const regex2 = /Object\.entries\(saved\)\.forEach\(\(\[k, v\]\) => \{\s*const el = document\.getElementById\('tog-' \+ k\);\s*if \(el\) el\.checked = !!v;\s*\}\);/;
const replacement2 = `Object.entries(saved).forEach(([k, v]) => {
      const togEl = document.getElementById('tog-' + k);
      if (togEl) togEl.checked = !!v;
      const cfgEl = document.getElementById('cfg-' + k);
      if (cfgEl) cfgEl.value = v;
    });`;

js = js.replace(regex2, replacement2);

fs.writeFileSync('server/public/dashboard.js', js, 'utf8');
console.log('Updated dashboard.js settings');
