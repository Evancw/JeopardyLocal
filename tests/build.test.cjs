const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { BASE85_ALPHABET, encodeBase85, decodeBase85 } = require('../scratch/payload.js');
const { payloadMetadata, unpackPackage } = require('./package-helper.cjs');
const { inlineSource, optimizeJavaScript, optimizeHTML, packageHTML, splitViews } = require('../scratch/build.js');
test('package preserves source literally, including currency templates', async () => {
  const source = fs.readFileSync('index.html', 'utf8'), inline = inlineSource(source);
  const packaged = await packageHTML(inline);
  assert.equal(unpackPackage(packaged), inline);
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
  const originalDeck = vm.createContext({});
  vm.runInContext(fs.readFileSync('src/js/deck.js', 'utf8'), originalDeck);
  for (const file of ['demo_board.csv', 'demo2_board 2.csv']) {
    const csv = fs.readFileSync(file, 'utf8');
    assert.equal(JSON.stringify(ctx.processCSVDeck(csv)), JSON.stringify(originalDeck.processCSVDeck(csv)), file);
  }
  for (const id of ['csv-encoding', 'csv-delimiter', 'deck-editor', 'undo-score', 'timer-toggle', 'host-sound-toggle-btn']) assert.ok(html.includes(`id="${id}"`), id);
  const packaged = await packageHTML(html);
  assert.equal(unpackPackage(packaged), html);
  assert.ok(Buffer.byteLength(packaged) < Buffer.byteLength(await packageHTML(inline)) * 0.9);
});
test('Base85 roundtrips byte values and every partial block length', () => {
  assert.equal(new Set(BASE85_ALPHABET).size, 85);
  const inputs = [Uint8Array.from({ length: 256 }, (_, i) => i), Uint8Array.from({ length: 65537 }, (_, i) => (i * 73) % 256)];
  for (let length = 0; length <= 40; length++) inputs.push(Uint8Array.from({ length }, (_, i) => (i * 131 + 255) % 256));
  for (const bytes of inputs) {
    const text = encodeBase85(bytes);
    assert.deepEqual(decodeBase85(text, bytes.length), bytes);
    assert.ok([...text].every(char => BASE85_ALPHABET.includes(char)));
  }
});
test('Base85 rejects damaged lengths, unknown digits, overflow and nonzero padding', () => {
  for (const length of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => decodeBase85('', length));
  assert.throws(() => decodeBase85('', 1));
  assert.throws(() => decodeBase85('~~~~~', 4));
  assert.throws(() => decodeBase85(BASE85_ALPHABET[84].repeat(5), 4));
  assert.throws(() => decodeBase85(encodeBase85(Uint8Array.of(0, 0, 0, 1)), 1));
  assert.throws(() => encodeBase85('not bytes'));
});
test('both payload encodings retain Unicode, decode exactly and build deterministically', async () => {
  const html = '<!doctype html><p>Café 🎬 你好\n$200 & literal &lt;b&gt;</p>';
  for (const encoding of ['base85', 'base64']) {
    const first = await packageHTML(html, { encoding });
    assert.equal(payloadMetadata(first).encoding, encoding);
    assert.equal(unpackPackage(first), html);
    assert.equal(await packageHTML(html, { encoding }), first);
    for (const [, code] of first.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(code));
  }
  await assert.rejects(packageHTML(html, { encoding: 'unknown' }));
});
test('split entry points use the unified template and only their own controller', () => {
  const views = splitViews(fs.readFileSync('index.html', 'utf8'));
  assert.ok(views.host.includes('host-font-scale-slider'));
  assert.ok(views.host.includes('dd-wager-error'));
  assert.ok(!views.host.includes('src/js/board-ui.js'));
  assert.ok(!views.board.includes('src/js/host-ui.js'));
  assert.ok(views.board.includes('clue-answer-text'));
});
