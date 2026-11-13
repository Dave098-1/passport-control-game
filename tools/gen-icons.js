// Renders the app icon SVG to PNGs in icons/. Run: node tools/gen-icons.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// A round entry stamp with a check mark on the night-booth blue.
const svg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
<rect width="100" height="100" fill="#0f1a24"/>
<g transform="translate(50 50) scale(${(100 - pad * 2) / 100}) rotate(-12) translate(-50 -50)">
<circle cx="50" cy="50" r="38" fill="none" stroke="#e9b44c" stroke-width="6"/>
<circle cx="50" cy="50" r="29" fill="none" stroke="#e9b44c" stroke-width="2" stroke-dasharray="4 3"/>
<path d="M35 51l10 10 21-23" fill="none" stroke="#3c9f6a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
</g></svg>`;

(async () => {
  const out = path.join(__dirname, '..', 'icons');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, pad] of [['icon-180', 180, 6], ['icon-192', 192, 6], ['icon-512', 512, 6], ['icon-maskable-512', 512, 16]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0}</style>${svg(size, pad)}`);
    await page.screenshot({ path: path.join(out, name + '.png'), omitBackground: false });
  }
  await browser.close();
  console.log('icons written to', out);
})();
