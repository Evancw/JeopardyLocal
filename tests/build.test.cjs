const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { inlineSource, optimizeJavaScript, optimizeHTML, packageHTML, splitViews } = require('../scratch/build.js');
test('package preserves source literally, including currency templates', () => {
  const source = fs.readFileSync('index.html', 'utf8'), inline = inlineSource(source);
  const packaged = packageHTML(inline);
  const base64 = packaged.match(/atob\('([^']+)'\)/)[1];
  assert.equal(zlib.gunzipSync(Buffer.from(base64, 'base64')).toString('utf8'), inline);
  assert.ok(inline.includes('`$${clue.value}`'));
  for (const [, script] of inline.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(script));
  assert.ok(!inline.includes('fonts.googleapis.com'));
});
test('parser optimization preserves literal text, regexes, templates, and shared names', async () => {
  const fixture = [
    'const points = 200;',
    'const literal = { money: `$${points}`, html: "</script><b>literal</b>", text: "Café 🎬 你好\\nLine 2", comment: "https://example.com/a//b/*c*/" };',
    String.raw`const expression = /\/\/|\/\*|\$\d+/u;`,
    'function exportFixture() { return { literal, matched: expression.test(literal.money) }; }'
  ].join('\n');
  const original = vm.createContext({}), optimized = vm.createContext({});
  vm.runInContext(fixture, original);
  const code = await optimizeJavaScript(fixture);
  assert.ok(!code.toLowerCase().includes('</script'));
  vm.runInContext(code, optimized);
  assert.equal(typeof optimized.exportFixture, 'function');
  assert.equal(vm.runInContext('JSON.stringify(exportFixture())', optimized), vm.runInContext('JSON.stringify(exportFixture())', original));
});
test('optimized HTML retains the early router, public functions and controls', async () => {
  const inline = inlineSource(fs.readFileSync('index.html', 'utf8'));
  const html = await optimizeHTML(inline);
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 2);
  assert.ok(html.indexOf('<script>') < html.indexOf('id="host-app-root"'));
  assert.ok(html.lastIndexOf('<script>') > html.indexOf('id="board-app-root"'));
  for (const [, code] of blocks) assert.doesNotThrow(() => new vm.Script(code));
  const ctx = vm.createContext({ console, Date, setTimeout, clearTimeout,
    document: { readyState: 'loading', addEventListener() {} },
    BroadcastChannel: class { postMessage() {} }, localStorage: { getItem() {}, setItem() {} } });
  vm.runInContext(blocks[1][1], ctx);
  for (const name of ['exportSessionBackup', 'parseSessionBackup', 'processCSVDeck', 'gradeClue', 'editDeckClue']) assert.equal(typeof ctx[name], 'function', name);
  assert.equal(vm.runInContext('typeof gameState', ctx), 'object');
  for (const id of ['csv-encoding', 'csv-delimiter', 'deck-editor', 'undo-score', 'timer-toggle', 'host-sound-toggle-btn']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(Buffer.byteLength(packageHTML(html)) < 41000);
});
test('split entry points use the unified template and only their own controller', () => {
  const views = splitViews(fs.readFileSync('index.html', 'utf8'));
  assert.ok(views.host.includes('host-font-scale-slider'));
  assert.ok(views.host.includes('dd-wager-error'));
  assert.ok(!views.host.includes('src/js/board-ui.js'));
  assert.ok(!views.board.includes('src/js/host-ui.js'));
  assert.ok(views.board.includes('clue-answer-text'));
});
