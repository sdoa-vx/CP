const fs = require('fs');

const htmlPath = 'c:/MCP/server/public/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace nav tag to add ID
html = html.replace('<nav class="sidenav">', '<nav class="sidenav" id="sidenav">');

// We need to replace each button block.
// A button block looks like:
// <button class="sidenav-item..." data-panel="..." onclick="...">
//   <svg ...>...</svg>
//   Label
//   (optional badge)
// </button>

const buttonRegex = /<button class="sidenav-item.*?" data-panel="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g;

html = html.replace(buttonRegex, (match, panelId, innerContent) => {
    // extract label text to check if we want it checked by default
    // maybe just overview is checked by default
    const isChecked = panelId === 'overview' ? 'checked' : '';
    
    return `        <div class="sidenav-item" data-panel="${panelId}" draggable="true">
          <input type="checkbox" class="panel-toggle" ${isChecked} />
          <div class="item-label">${innerContent.trim()}</div>
          <div class="drag-handle">☰</div>
        </div>`;
});

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Rewrote index.html navigation!');
