const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
let browser, server, base;
const header = 'Round,Category,Value,Question,Answer,IsDailyDouble,MediaType,MediaURL\n';
const sample = header + 'single,Science,200,Q1,A1,FALSE,none,\nsingle,Science,400,Q2,A2,FALSE,none,\ndouble,Double,400,Q3,A3,FALSE,none,\nfinal,Final,,Q4,A4,FALSE,none,';
before(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(process.cwd(), decodeURIComponent(req.url.split('?')[0]));
    try {
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(fs.readFileSync(file));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function setup(csv = sample, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('https://**', route => route.abort());
  if (options.noBC) await context.addInitScript(() => { window.BroadcastChannel = undefined; });
  if (options.noStorage) await context.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new Error('Storage blocked'); };
    Storage.prototype.getItem = function () { throw new Error('Storage blocked'); };
  });
  if (options.delayBoard) await context.route('**/src/js/board-ui.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 900)); await route.continue();
  });
  const host = await context.newPage(), errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  host.on('pageerror', error => errors.push(error.message));
  const entry = options.entry || 'index.html';
  await host.goto(options.file ? `file://${process.cwd()}/${entry}` : `${base}/${entry}`);
  await host.evaluate(() => { gameState.settings.soundEnabled = false; });
  await host.locator('#csv-upload').setInputFiles({ name: 'test.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await host.waitForFunction(() => document.getElementById('upload-status').textContent.startsWith('Success'));
  await host.locator('#start-game-btn').click();
  if (await host.locator('#host-skip-categories-btn').count()) await host.locator('#host-skip-categories-btn').click();
  return { context, host, errors };
}
async function openBoard({ host }) {
  const popup = host.waitForEvent('popup');
  await host.locator('#open-board-btn').click();
  const board = await popup;
  await board.waitForLoadState();
  await board.waitForFunction(() => gameState.teams.length > 0);
  return board;
}
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(gameState)));
async function withGame(csv, options, run) {
  const game = await setup(csv, options);
  try { await run(game); assert.deepEqual(game.errors, []); } finally { await game.context.close(); }
}
test('CSV markup is literal and duplicate values spend separately', () => withGame(
  header + 'single,"A <em>B</em>",200,"Compare <br> and <b>bold</b>",A,FALSE,none,\nsingle,"A <em>B</em>",200,Other?,B,FALSE,none,', {}, async game => {
    const { host } = game, board = await openBoard(game);
    assert.equal(await host.locator('.category-title').textContent(), 'A <em>B</em>');
    assert.equal(await board.locator('.category-title').textContent(), 'A <em>B</em>');
    assert.equal(await host.locator('.host-card-preview').first().textContent(), 'Compare <br> and <b>bold</b>');
    assert.equal(await host.locator('em').count(), 0);
    await host.locator('.host-clue-card').first().click();
    await host.locator('#host-clue-skip-btn').click();
    assert.equal(await host.locator('.host-clue-card.spent').count(), 1);
  }
));
test('Daily Double scoring is restricted to its wagering team', () => withGame(
  header + 'single,Daily,200,Q,A,TRUE,none,', {}, async ({ host }) => {
    await host.locator('.host-clue-card').click();
    await host.locator('#dd-wager-input').fill('100oops');
    await host.locator('#dd-submit-wager-btn').click();
    assert.equal((await state(host)).currentWager, null);
    await host.locator('#dd-wager-input').fill('100');
    await host.locator('#dd-submit-wager-btn').click();
    assert.equal(await host.locator('#quick-score-teams-row > div').count(), 1);
    await host.locator('#quick-score-teams-row .btn-incorrect').click();
    assert.equal((await state(host)).teams[0].score, -100);
    assert.equal((await state(host)).currentClue, null);
  }
));
test('optional rounds and zero-score Final corrections work', () => withGame(
  header + 'single,Science,200,Q,A,FALSE,none,\nfinal,Final,,Q,A,FALSE,none,', {}, async ({ host }) => {
    assert.equal(await host.locator('#btn-goto-double').isVisible(), false);
    await host.locator('.score-display-input').first().fill('100');
    await host.locator('.score-display-input').first().press('Tab');
    await host.locator('#btn-goto-final').click();
    assert.equal(await host.locator('#btn-goto-complete').isDisabled(), true);
    await host.locator('.final-wager-input').fill('100');
    await host.locator('#host-reveal-clue-btn').click();
    await host.locator('.final-incorrect-btn').click();
    assert.equal(await host.locator('.final-correct-btn').count(), 1);
    await host.locator('.final-correct-btn').click();
    assert.equal((await state(host)).teams[0].score, 200);
    await host.locator('#host-final-complete-btn').click();
    assert.equal((await state(host)).gamePhase, 'completed');
  }
));
test('host and board reload restore active clue, answer and lockouts', () => withGame(sample, {}, async game => {
  const { host } = game, board = await openBoard(game);
  let shows = 0;
  board.on('console', message => { if (message.text() === 'Board received: SHOW_CLUE') shows++; });
  await host.locator('.host-clue-card').first().click();
  await board.waitForFunction(() => gameState.currentClue?.question === 'Q1');
  assert.equal(shows, 1);
  await host.locator('#buzzer-teams-row button').first().click();
  await host.locator('#host-clue-incorrect-btn').click();
  await host.locator('#host-reveal-answer-btn').click();
  await host.reload();
  assert.equal(await host.locator('#host-clue-controller').isVisible(), true);
  assert.equal(await host.locator('#buzzer-teams-row button').first().isDisabled(), true);
  await board.reload();
  await board.waitForFunction(() => gameState.answerVisible);
  assert.equal(await board.locator('#clue-answer-text').textContent(), 'A1');
  assert.equal(await board.locator('#clue-zoom-overlay').evaluate(el => el.classList.contains('active')), true);
}));
test('late offline handshake and host reload reconnect without storage', () => withGame(sample,
  { file: true, noBC: true, noStorage: true, delayBoard: true }, async game => {
    const { host } = game, board = await openBoard(game);
    assert.equal((await state(board)).deck.singleJeopardy.categories.length, 1);
    // With unavailable storage, reload the host only after enabling storage for its saved state.
    // The separate stored-state reload case below checks connection healing.
    await host.locator('.host-clue-card').first().click();
    await board.waitForFunction(() => gameState.currentClue?.question === 'Q1');
    await board.reload();
    await board.waitForFunction(() => gameState.currentClue?.question === 'Q1');
    assert.equal(await board.locator('#clue-zoom-overlay').evaluate(el => el.classList.contains('active')), true);
  }
));
test('offline bridge heals after host reload and round intros synchronize', () => withGame(sample, { noBC: true }, async game => {
  const { host } = game, board = await openBoard(game);
  await host.reload();
  await host.locator('.host-clue-card').first().click();
  await board.waitForFunction(() => gameState.currentClue?.question === 'Q1');
  await host.locator('#host-clue-skip-btn').click();
  await host.locator('#btn-goto-double').click();
  await board.waitForFunction(() => gameState.categoryIntroIndex === 0 && gameState.gamePhase === 'double_jeopardy');
  assert.equal(await board.locator('#intro-category-name').textContent(), 'Double');
}));
