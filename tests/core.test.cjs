const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function engine() {
  const storage = new Map();
  const ctx = vm.createContext({ console, Date, setTimeout, clearTimeout, BroadcastChannel: class { postMessage() {} },
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) } });
  for (const file of ['deck', 'app', 'session-tools', 'deck-editor']) vm.runInContext(fs.readFileSync(`src/js/${file}.js`, 'utf8'), ctx);
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
test('all normal grading paths enforce lockouts and one-time scoring', () => {
  const e = engine();
  vm.runInContext(`gameState.deck = processCSVDeck(${JSON.stringify(header + row)}); gameState.teams = [{id:1,score:0},{id:2,score:0}]; beginRound('single_jeopardy'); openGameClue(gameState.deck.singleJeopardy.categories[0].clues[0]);`, e);
  assert.equal(e.gradeClue(1, 'incorrect').keepOpen, true);
  assert.equal(e.gradeClue(1, 'correct'), null);
  assert.equal(e.gradeClue(2, 'correct').keepOpen, false);
  assert.equal(e.gradeClue(2, 'correct'), null);
  assert.equal(vm.runInContext('gameState.teams[0].score', e), -200);
  assert.equal(vm.runInContext('gameState.spentClues.length', e), 1);
});
test('Daily Double rejects other teams and invalid wagers', () => {
  const e = engine();
  vm.runInContext(`gameState.deck = processCSVDeck(${JSON.stringify(header + row.replace('FALSE', 'TRUE'))}); gameState.teams = [{id:1,score:0},{id:2,score:0}]; beginRound('single_jeopardy'); openGameClue(gameState.deck.singleJeopardy.categories[0].clues[0]);`, e);
  assert.equal(e.setDailyDoubleWager(1, 201), false);
  assert.equal(e.setDailyDoubleWager(1, 100), true);
  assert.equal(e.gradeClue(2, 'correct'), null);
  assert.equal(e.gradeClue(1, 'incorrect').keepOpen, false);
});
test('Final participants remain judgeable at zero and completion is guarded', () => {
  const e = engine();
  vm.runInContext(`gameState.deck = processCSVDeck(${JSON.stringify(header + row + '\nfinal,Final,,Q,A,FALSE,none,')}); gameState.teams = [{id:1,score:100},{id:2,score:0}]; beginRound('final_jeopardy'); gameState.teams[0].finalWager = 100; gameState.finalStage = 'judging';`, e);
  assert.equal(e.beginRound('completed'), false);
  assert.equal(e.gradeFinal(1, 'incorrect'), true);
  assert.equal(vm.runInContext('gameState.teams[0].score', e), 0);
  assert.equal(e.gradeFinal(1, 'correct'), true);
  assert.equal(vm.runInContext('gameState.teams[0].score', e), 200);
  assert.equal(e.beginRound('completed'), true);
});
test('shared timer pauses and resumes without extending elapsed time', () => {
  const e = engine();
  e.startGameTimer('final', 1000);
  assert.equal(e.timerRemaining(undefined, 1500), 29500);
  assert.equal(e.toggleGameTimer(1500), true);
  assert.equal(e.timerRemaining(undefined, 8000), 29500);
  assert.equal(e.toggleGameTimer(8000), true);
  assert.equal(e.timerRemaining(undefined, 9000), 28500);
  assert.equal(e.timerRemaining(undefined, 100000), 0);
});
test('autosave writes immutable deck once and recovers compact session state', () => {
  const e = engine();
  const writes = [], original = e.localStorage.setItem;
  e.localStorage.setItem = (key, value) => { writes.push(key); original(key, value); };
  vm.runInContext(`gameState.deck = processCSVDeck(${JSON.stringify(header + row)});`, e);
  e.saveStateToStorage(); e.saveStateToStorage();
  assert.equal(writes.filter(key => key.startsWith('jeopardy_deck:')).length, 1);
  const saved = JSON.parse(e.localStorage.getItem('jeopardy_local_state'));
  assert.equal(saved.deck, undefined);
  assert.ok(saved.deckId);
  assert.equal(e.loadStateFromStorage(), true);
  assert.equal(vm.runInContext('gameState.deck.singleJeopardy.categories[0].clues[0].value', e), 200);
});
test('undo/redo and portable backup preserve scoring, spent IDs and history', () => {
  const e = engine();
  vm.runInContext(`gameState.deck = processCSVDeck(${JSON.stringify(header + row)}); gameState.teams = [{id:1,name:'A',color:'#112233',score:0},{id:2,name:'B',color:'#aabbcc',score:0}]; beginRound('single_jeopardy'); gameState.categoryIntroIndex = null; openGameClue(gameState.deck.singleJeopardy.categories[0].clues[0]);`, e);
  e.gradeClue(1, 'correct');
  assert.equal(e.undoGameChange(), true);
  assert.equal(vm.runInContext('gameState.teams[0].score', e), 0);
  assert.equal(vm.runInContext('gameState.currentClue.question', e), 'Question?');
  assert.equal(e.redoGameChange(), true);
  const restored = e.parseSessionBackup(e.exportSessionBackup());
  assert.equal(restored.teams[0].score, 200);
  assert.equal(restored.spentClues.length, 1);
  assert.equal(restored.undoStack.length, 1);
  assert.equal(restored.scoreEvents.length, 3);
  const broken = JSON.parse(e.exportSessionBackup());
  broken.state.spentClues = ['unknown'];
  assert.throws(() => e.parseSessionBackup(JSON.stringify(broken)));
  assert.equal(vm.runInContext('gameState.teams[0].score', e), 200);
});
test('deck edits preserve identities and spent state, validate changes, and export CSV', () => {
  const e = engine();
  vm.runInContext(`gameState.deck = processCSVDeck(${JSON.stringify(header + row + '\n' + row.replace('200','400').replace('Question?','Other?'))}); gameState.teams = [{id:1,name:'A',color:'#112233',score:0},{id:2,name:'B',color:'#aabbcc',score:0}]; beginRound('single_jeopardy'); gameState.categoryIntroIndex = null; openGameClue(gameState.deck.singleJeopardy.categories[0].clues[0]);`, e);
  const id = vm.runInContext('gameState.currentClue.id', e);
  assert.throws(() => e.editDeckClue(id, {}));
  e.gradeClue(1, 'correct');
  e.editDeckClue(id, { category: 'Café 🎬', value: '600', question: 'Literal <b>text</b>\nNext line', answer: 'A, B', isDailyDouble: false, mediaType: 'none', mediaUrl: '' });
  assert.equal(vm.runInContext('gameState.teams[0].score', e), 200);
  assert.equal(vm.runInContext('gameState.spentClues[0]', e), id);
  assert.equal(vm.runInContext('gameState.undoStack.length', e), 0);
  const imported = e.processCSVDeck(e.deckToCSV(vm.runInContext('gameState.deck', e)));
  assert.equal(imported.singleJeopardy.categories[0].clues[1].question, 'Literal <b>text</b>\nNext line');
  assert.equal(e.parseSessionBackup(e.exportSessionBackup()).spentClues[0], id);
});
test('CRLF diagnostics and legacy session migration remain valid', () => {
  const e = engine();
  assert.throws(() => e.processCSVDeck((header + row + '\n' + row.replace('200','oops')).replaceAll('\n','\r\n')), /Line 3/);
  const deck = e.processCSVDeck(header + row + '\nfinal,Final,,Q,A,FALSE,none,');
  delete deck.id; delete deck.singleJeopardy.categories[0].id;
  const clue = deck.singleJeopardy.categories[0].clues[0]; delete clue.id;
  delete deck.finalJeopardy.value; delete deck.finalJeopardy.isDailyDouble; delete deck.finalJeopardy.id;
  e.localStorage.setItem('jeopardy_local_state', JSON.stringify({ deck, teams:[{id:1,name:'A',color:'#112233',score:200},{id:2,name:'B',color:'#aabbcc',score:0}],
    gamePhase:'single_jeopardy', spentClues:['single_jeopardy-Science-200'], currentClue:null, currentWager:null, activeBuzzedTeamId:null, categoryIntroIndex:null, settings:{soundEnabled:false,clueFontSizeMultiplier:1} }));
  assert.equal(e.loadStateFromStorage(), true);
  assert.equal(vm.runInContext('gameState.spentClues[0] === gameState.deck.singleJeopardy.categories[0].clues[0].id', e), true);
});
test('legacy decomposed Unicode titles retain their spent state after normalization', () => {
  const e = engine();
  const deck = e.processCSVDeck(header + row);
  deck.singleJeopardy.categories[0].name = 'Cafe\u0301';
  deck.singleJeopardy.categories[0].clues[0].category = 'Cafe\u0301';
  e.localStorage.setItem('jeopardy_local_state', JSON.stringify({ deck, teams:[], gamePhase:'setup', spentClues:['single_jeopardy-Cafe\u0301-200'] }));
  assert.equal(e.loadStateFromStorage(), true);
  assert.equal(vm.runInContext('gameState.deck.singleJeopardy.categories[0].name', e), 'Café');
  assert.equal(vm.runInContext('gameState.spentClues.length', e), 1);
});
test('Final music schedules the configured duration with one oscillator', () => {
  const e = engine(), stops = []; let oscillators = 0;
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  e.window = { AudioContext: class {
    constructor() { this.state = 'running'; this.currentTime = 100; this.destination = {}; }
    createOscillator() { oscillators++; return { frequency:param(), connect(){}, disconnect(){}, start(){}, stop(time){stops.push(time);} }; }
    createGain() { return { gain:param(), connect(){}, disconnect(){} }; }
  } };
  vm.runInContext(fs.readFileSync('src/js/audio.js', 'utf8'), e);
  vm.runInContext('gameAudio.playFinalJeopardy(10)', e);
  assert.equal(oscillators, 1);
  assert.equal(stops[0], 110.8);
});
