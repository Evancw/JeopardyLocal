/* Reproducible projection-sized media lab; not a physical projector/GPU benchmark. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), zlib = require('node:zlib');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
const width = 2048, height = 1536, header = Buffer.alloc(13);
header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
const pixels = Buffer.alloc((width * 3 + 1) * height, 100);
for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
(async () => {
  let requests = 0, active = 0, maximum = 0;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/media/')) {
      requests++; active++; maximum = Math.max(maximum, active);
      setTimeout(() => { res.setHeader('Content-Type', 'image/png'); res.end(png); active--; }, 80);
    } else {
      try { const file = path.join(process.cwd(), req.url.split('?')[0]);
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file));
      } catch { res.statusCode = 404; res.end(); }
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    // Compare cold board starts; a restored deck previously skipped preloading altogether.
    await context.addInitScript(() => { if (new URLSearchParams(location.search).get('view') === 'board') Storage.prototype.getItem = () => null; });
    if (process.argv[2]) await context.route('**/src/js/board-ui.js', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.argv[2], 'utf8') }));
    const host = await context.newPage(); await host.goto(`${base}/index.html`);
    await host.evaluate(() => { gameState.settings.soundEnabled = false; });
    const rows = ['Round,Category,Value,Question,Answer,IsDailyDouble,MediaType,MediaURL'];
    for (let i = 0; i < 60; i++) rows.push(`${i < 30 ? 'single' : 'double'},Category ${Math.floor(i / 5)},${(i % 5 + 1) * 200},Q${i},A,FALSE,image,${base}/media/${i}.png`);
    rows.push(`final,Final,,Q,A,FALSE,image,${base}/media/final.png`);
    await host.locator('#csv-upload').setInputFiles({ name: 'media.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
    await host.locator('#start-game-btn').click(); await host.locator('#host-skip-categories-btn').click();
    const pending = host.waitForEvent('popup'); await host.locator('#open-board-btn').click(); const board = await pending;
    await board.setViewportSize({ width: 1920, height: 1080 });
    const cdp = await context.newCDPSession(board); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await board.waitForFunction(() => gameState.teams.length > 0);
    // Exercise full deck transfer rather than relying on a browser's shared storage cache.
    await board.evaluate(() => {
      gameState.deck = { singleJeopardy: { categories: [] }, doubleJeopardy: { categories: [] }, finalJeopardy: null };
      opener.postMessage({ protocol: 1, role: 'board', action: 'SYNC_REQUEST', sessionId: gameState.sessionId, initial: true }, '*');
    });
    await board.waitForTimeout(3500);
    console.log(JSON.stringify({ variant: process.argv[2] ? 'previous preloader' : 'budgeted preloader', browser: browser.version(), viewport: '1920x1080', cpuThrottle: 4, imageDimensions: `${width}x${height}`, deckImages: 61, eagerRequests: requests, maxConcurrentNetworkRequests: maximum }));
    await context.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})();
