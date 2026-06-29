const fs = require('fs');
let html = fs.readFileSync('server/public/index.html', 'utf8');

const regex = /<label class="toggle-row"><span>Federation Sync<\/span><input type="checkbox" id="tog-federationSync" checked onchange="saveSettings\(\)" \/><\/label>/;
const replacement = `<label class="toggle-row"><span>Federation Sync</span><input type="checkbox" id="tog-federationSync" checked onchange="saveSettings()" /></label>
              <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);">
                 <label style="display:flex; flex-direction:column; gap:5px; margin-bottom:10px;">
                    <span style="font-size:11px; color:var(--text-2);">Supabase URL</span>
                    <input type="text" id="cfg-supabaseUrl" onchange="saveSettings()" style="background:var(--bg-3); border:1px solid var(--border); color:var(--text); padding:5px; border-radius:4px; font-family:var(--mono); font-size:11px;" placeholder="https://..." />
                 </label>
                 <label style="display:flex; flex-direction:column; gap:5px;">
                    <span style="font-size:11px; color:var(--text-2);">Supabase Key</span>
                    <input type="password" id="cfg-supabaseKey" onchange="saveSettings()" style="background:var(--bg-3); border:1px solid var(--border); color:var(--text); padding:5px; border-radius:4px; font-family:var(--mono); font-size:11px;" placeholder="ey..." />
                 </label>
              </div>`;

html = html.replace(regex, replacement);

fs.writeFileSync('server/public/index.html', html, 'utf8');
console.log('Updated index.html settings');
