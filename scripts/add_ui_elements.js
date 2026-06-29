const fs = require('fs');
let html = fs.readFileSync('server/public/index.html', 'utf8');

const topbarCenterReplacement = `<div class="topbar-center">
        <div class="engine-state-pill" id="engineStatePill">
          <span class="state-dot" id="stateDot"></span>
          <span id="engineStateLabel">CONNECTING</span>
        </div>
        <div id="topbarScanFile" style="display: none; margin-left: 15px; color: var(--text-2); font-family: var(--mono); font-size: 11px;">
           <span style="color: var(--text-3);">Scanning: </span>
           <span id="topbarScanFileName"></span>
        </div>
      </div>`;

html = html.replace(/<div class="topbar-center">\s*<div class="engine-state-pill" id="engineStatePill">\s*<span class="state-dot" id="stateDot"><\/span>\s*<span id="engineStateLabel">CONNECTING<\/span>\s*<\/div>\s*<\/div>/, topbarCenterReplacement);

const gaugeCard = `            <div class="stat-card" id="ov-gauge-card">
              <div class="stat-label" style="text-align: center;">Scan Progress</div>
              <div style="display: flex; align-items: center; justify-content: center; position: relative; margin-top: 5px;">
                 <svg viewBox="0 0 36 36" style="width: 50px; height: 50px; transform: rotate(-90deg);">
                   <path style="stroke: var(--border); stroke-width: 3; fill: none;" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                   <path id="topbarScanGaugePath" style="stroke: var(--accent); stroke-width: 3; fill: none; stroke-dasharray: 0, 100;" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                 </svg>
                 <div id="topbarScanGaugeText" style="position: absolute; font-size: 11px; font-weight: bold; color: var(--text); font-family: var(--mono);">0%</div>
              </div>
            </div>
          </div>`;

html = html.replace(/<\/div>\s*<\/div>\s*<div class="scan-progress-container"/, '</div>\n' + gaugeCard + '\n          <div class="scan-progress-container"');

fs.writeFileSync('server/public/index.html', html, 'utf8');
console.log('Updated index.html');
