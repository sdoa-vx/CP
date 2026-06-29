const fs = require('fs');
let css = fs.readFileSync('server/public/styles.css', 'utf8');

css = css.replace(/\.panel-container\s*\{[\s\S]*?\}/, `.panel-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg);
}`);

css = css.replace(/\.panel\s*\{\s*display:\s*none;\s*padding:\s*24px;\s*min-height:\s*100%;\s*animation:\s*fadeIn\s*0\.2s\s*ease;\s*\}/, `.panel {
  display: none;
  padding: 24px;
  animation: fadeIn 0.2s ease;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}`);

fs.writeFileSync('server/public/styles.css', css, 'utf8');
console.log('Fixed panel container CSS');
