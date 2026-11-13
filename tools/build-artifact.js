// Makes the Claude artifact version of index.html: the artifact host supplies its own
// <html>/<head>/<body> wrapper, so this strips ours and the Pages-only install tags.
// Run: node tools/build-artifact.js <output.html>
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
if (!out) { console.error('usage: node tools/build-artifact.js <output.html>'); process.exit(1); }
let s = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
s = s
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '')
  .replace(/<meta (charset|name="viewport"|name="theme-color"|name="apple-[^"]*"|name="mobile-web-app-capable")[^>]*>\s*/g, '')
  .replace(/<link rel="(manifest|apple-touch-icon|icon)"[^>]*>\s*/g, '');
fs.writeFileSync(out, s);
console.log('artifact written to', out, `(${s.length} bytes)`);
