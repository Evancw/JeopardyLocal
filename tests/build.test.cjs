const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { inlineSource, packageHTML, splitViews } = require('../scratch/build.js');
test('package preserves source literally, including currency templates', () => {
  const source = fs.readFileSync('index.html', 'utf8'), inline = inlineSource(source);
  const packaged = packageHTML(inline);
  const base64 = packaged.match(/atob\('([^']+)'\)/)[1];
  assert.equal(zlib.gunzipSync(Buffer.from(base64, 'base64')).toString('utf8'), inline);
  assert.ok(inline.includes('`$${clue.value}`'));
  for (const [, script] of inline.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(script));
  assert.ok(!inline.includes('fonts.googleapis.com'));
});
test('split entry points use the unified template and only their own controller', () => {
  const views = splitViews(fs.readFileSync('index.html', 'utf8'));
  assert.ok(views.host.includes('host-font-scale-slider'));
  assert.ok(views.host.includes('dd-wager-error'));
  assert.ok(!views.host.includes('src/js/board-ui.js'));
  assert.ok(!views.board.includes('src/js/host-ui.js'));
  assert.ok(views.board.includes('clue-answer-text'));
});
