const fs = require('fs');
let html = fs.readFileSync('server/public/index.html', 'utf8');

const regex = /<input type="checkbox" class="panel-toggle"([^>]*)>\s*<div class="item-label">([\s\S]*?)<\/div>/g;
html = html.replace(regex, '<div class="item-label">$2</div>\n          <input type="checkbox" class="panel-toggle"$1>');

fs.writeFileSync('server/public/index.html', html, 'utf8');
console.log('Reordered checkbox to the right');
