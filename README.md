# Local Jeopardy

Open `index.html` in a modern browser, import a CSV, register teams, and use **Open Board Window** for the spectator display. No server or installation is needed for gameplay. The host and board must stay open in the same browser session.

CSV columns: `Round,Category,Value,Question,Answer,IsDailyDouble,MediaType,MediaURL`. Rounds may be Single, Double, or Final; unused rounds are skipped. Grid clues require positive whole-point values. UTF-8 is recommended; use the import encoding selector for legacy files. Quote fields containing commas, quotes, or line breaks, and double embedded quotes. Images can use local paths relative to the application or web URLs. Web images require internet access.

The source of both screens is `index.html`. `host.html` and `board.html` are generated compatibility entry points; edit the shared template and regenerate them.

Build with Node:

```sh
node scratch/build.js
```

This generates the standalone `dist/jeopardy_all_in_one.html` and both split pages. The standalone edition uses native browser decompression. For browsers without it, open the source entry point or build an uncompressed single file:

```sh
node scratch/build.js --plain
```

Run core and packaging regressions:

```sh
node --test tests/core.test.cjs tests/build.test.cjs
```

Browser checks require Playwright and Chrome as development tools, with no gameplay dependencies:

```sh
node --test tests/browser.test.cjs
TEST_ENTRY=dist/jeopardy_all_in_one.html node --test tests/browser.test.cjs
```

Set `PLAYWRIGHT_MODULE_PATH` if Playwright is installed outside the project, and `BROWSER_CHANNEL` to use another supported installed channel.
