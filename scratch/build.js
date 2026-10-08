/* Build portable HTML using unchanged source and native gzip. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const scripts = ['deck', 'app', 'session-tools', 'audio', 'board-ui', 'deck-editor', 'host-ui'];

function inlineSource(html, directory = root) {
  html = html.replace('<link rel="stylesheet" href="src/css/style.css">', () =>
    `<style>\n${fs.readFileSync(path.join(directory, 'src/css/style.css'), 'utf8')}\n</style>`);
  for (const name of scripts) {
    const code = fs.readFileSync(path.join(directory, `src/js/${name}.js`), 'utf8').replace(/<\/script/gi, '<\\/script');
    // A callback preserves literal dollars, strings, templates, and regular expressions.
    html = html.replace(`<script src="src/js/${name}.js"></script>`, () => `<script>\n${code}\n</script>`);
  }
  if (/<script\s+src=|<link\s+rel="stylesheet"/.test(html)) throw new Error('An asset was not inlined.');
  return html;
}

function splitViews(html) {
  const hostStart = html.indexOf('  <!-- ==================== HOST');
  const boardStart = html.indexOf('  <!-- ==================== SPECTATOR');
  const scriptsStart = html.indexOf('  <!-- State & Audio Script Links -->');
  if (hostStart < 0 || boardStart < 0 || scriptsStart < 0) throw new Error('View boundaries not found.');
  const head = html.slice(0, hostStart), tail = html.slice(scriptsStart);
  return {
    host: head + html.slice(hostStart, boardStart) + tail.replace('  <script src="src/js/board-ui.js"></script>\n', ''),
    board: head + html.slice(boardStart, scriptsStart) + tail.replace('  <script src="src/js/host-ui.js"></script>\n', '').replace('  <script src="src/js/deck-editor.js"></script>\n', '')
  };
}

function packageHTML(html) {
  const payload = zlib.gzipSync(Buffer.from(html, 'utf8'), { level: 9 }).toString('base64');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jeopardy</title></head>
<body style="background:#0c101b;color:#fff;font-family:system-ui;margin:40px">
<p id="loader" role="status">Loading Jeopardy…</p>
<script>
(async () => {
  try {
    if (!('DecompressionStream' in window)) throw new Error('This browser needs the uncompressed edition. Use index.html or build with --plain.');
    const bytes = Uint8Array.from(atob('${payload}'), c => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const html = await new Response(stream).text();
    document.open(); document.write(html); document.close();
  } catch (error) { document.getElementById('loader').textContent = 'Unable to load: ' + error.message; }
})();
</script></body></html>`;
}

function build() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const views = splitViews(html);
  fs.writeFileSync(path.join(root, 'host.html'), views.host);
  fs.writeFileSync(path.join(root, 'board.html'), views.board);
  const inline = inlineSource(html);
  const plain = process.argv.includes('--plain');
  const output = plain ? inline : packageHTML(inline);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const file = path.join(root, 'dist', plain ? 'jeopardy_uncompressed.html' : 'jeopardy_all_in_one.html');
  fs.writeFileSync(file, output);
  console.log(`Built ${path.basename(file)}: ${Buffer.byteLength(output)} bytes (source: ${Buffer.byteLength(inline)} bytes).`);
}
if (require.main === module) build();
module.exports = { inlineSource, packageHTML, splitViews };
