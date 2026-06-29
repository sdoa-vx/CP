const fs = require('fs');
let js = fs.readFileSync('server/public/dashboard.js', 'utf8');

const regex = /if \(data\.type === 'scan:init'\) \{([\s\S]*?)else if \(data\.type === 'scan:progress'\) \{([\s\S]*?)else if \(data\.type === 'scan:complete'\) \{([\s\S]*?)\} else if \(data\.type\.startsWith\('detector:'\)\) \{/;

const replacement = `if (data.type === 'scan:init') {$1
            const tbFile = document.getElementById('topbarScanFile');
            if (tbFile) { tbFile.style.display = 'block'; document.getElementById('topbarScanFileName').textContent = 'Counting files...'; }
            const tbGaugePath = document.getElementById('topbarScanGaugePath');
            if (tbGaugePath) { tbGaugePath.style.strokeDasharray = '0, 100'; document.getElementById('topbarScanGaugeText').textContent = '0%'; }
          } else if (data.type === 'scan:progress') {$2
            const pct = Math.round((data.scannedCount / data.totalFiles) * 100) || 0;
            const tbFile = document.getElementById('topbarScanFile');
            if (tbFile) { tbFile.style.display = 'block'; document.getElementById('topbarScanFileName').textContent = data.currentFile; }
            const tbGaugePath = document.getElementById('topbarScanGaugePath');
            if (tbGaugePath) { tbGaugePath.style.strokeDasharray = pct + ', 100'; document.getElementById('topbarScanGaugeText').textContent = pct + '%'; }
          } else if (data.type === 'scan:complete') {$3
            const tbFile = document.getElementById('topbarScanFile');
            if (tbFile) setTimeout(() => tbFile.style.display = 'none', 3000);
            const tbGaugePath = document.getElementById('topbarScanGaugePath');
            if (tbGaugePath) { tbGaugePath.style.strokeDasharray = '100, 100'; document.getElementById('topbarScanGaugeText').textContent = '100%'; }
          } else if (data.type.startsWith('detector:')) {`;

js = js.replace(regex, replacement);

fs.writeFileSync('server/public/dashboard.js', js, 'utf8');
console.log('Updated dashboard.js');
