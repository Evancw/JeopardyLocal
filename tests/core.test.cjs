const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function engine() {
  const storage = new Map();
  const ctx = vm.createContext({ console, Date, setTimeout, clearTimeout, BroadcastChannel: class { postMessage() {} },
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) } });
  for (const file of ['deck', 'app']) vm.runInContext(fs.readFileSync(`src/js/${file}.js`, 'utf8'), ctx);
  return ctx;
}
const header = 'Round,Category,Value,Question,Answer,IsDailyDouble,MediaType,MediaURL\n';
const row = 'single,Science,200,Question?,Answer,FALSE,none,';
test('demo decks and stable identities', () => {
  const e = engine();
  for (const file of ['demo_board.csv', 'demo2_board 2.csv']) {
    const text = fs.readFileSync(file, 'utf8'), a = e.processCSVDeck(text), b = e.processCSVDeck(text);
    assert.equal(a.importSummary.count, 61);
    assert.equal(a.id, b.id);
    assert.equal(new Set(a.singleJeopardy.categories.flatMap(c => c.clues.map(q => q.id))).size, 30);
  }
});
test('Unicode normalization, quotes, multiline, BOM and alternate delimiters', () => {
  const e = engine();
  const a = e.processCSVDeck('\uFEFF' + header + 'single,Café 🎬,200,"Line 1, ""你好""\nLine 2",A,FALSE,none,\nsingle,Café 🎬,400,Q,A,FALSE,none,');
  assert.equal(a.singleJeopardy.categories.length, 1);
  assert.equal(a.singleJeopardy.categories[0].clues[0].question, 'Line 1, "你好"\nLine 2');
  assert.equal(e.processCSVDeck((header + row).replaceAll(',', ';')).importSummary.count, 1);
});
test('invalid imports fail without silently losing rows', () => {
  const e = engine();
  for (const text of [header + row.replace('single', 'round1'), header + row.replace('200', '-200'), header + row.replace('200', '200pts'),
    header + row.replace('Answer', ''), header + row.replace('FALSE', 'YES'), header + row.replace('none', 'video'),
    header + 'single,Science,200,"unclosed,A', header + row + '\nfinal,F,,Q,A,FALSE,none,\nfinal,F,,Q,A,FALSE,none,',
    header.replace('Round', '\u200BRound') + row, header + row.replace('Science', 'Caf�')]) {
    assert.throws(() => e.processCSVDeck(text));
  }
});
test('money is validated and repeated values have separate IDs', () => {
  const e = engine();
  assert.equal(e.parsePoints('$1,000'), 1000);
  for (const value of ['1,00', '1e3', '100oops', '100.9', '-200', '', '9007199254740992']) assert.equal(e.parsePoints(value), null);
  const deck = e.processCSVDeck(header + row + '\n' + row.replace('Question?', 'Other?'));
  assert.notEqual(deck.singleJeopardy.categories[0].clues[0].id, deck.singleJeopardy.categories[0].clues[1].id);
  assert.equal(deck.importSummary.warnings.length, 1);
});
module.exports = { engine };
