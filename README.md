# Local Jeopardy

Open `index.html` in a modern browser, import a CSV, register teams, and use **Open Board Window** for the spectator display. No server or installation is needed for gameplay. The host and board must stay open in the same browser session. Click the spectator window once to enable sound.

CSV columns: `Round,Category,Value,Question,Answer,IsDailyDouble,MediaType,MediaURL`. Rounds may be Single, Double, or Final; unused rounds are skipped. Grid clues require positive whole-point values. UTF-8 is recommended; use the import encoding selector for legacy files. Quote fields containing commas, quotes, or line breaks, and double embedded quotes. Images can use local paths relative to the application or web URLs. Web images require internet access.

The host sidebar includes undo/redo, session backup/restore, timer pause/resume, and a lower-effects setting. Use **Edit loaded deck** to revise clue text, category names, values, Daily Doubles, and image paths; save changes or download the revised CSV. Editing preserves scores and spent clues and clears undo history. Backups include game state and history, while image files remain separate.

Clue cards support keyboard activation with Enter/Space. During a clue: 1–4 selects a team, C/I grades, R reveals, S skips, and P pauses/resumes. Ctrl/Cmd+Z undoes; Shift+Ctrl/Cmd+Z redoes. Shortcuts do not intercept text entry.

See [implementation and verification](docs/IMPLEMENTATION.md) for the reviewable commit sequence and measured limits.

See [source refactors and measured size reductions](docs/CODE_SIZE_REDUCTIONS_2026-10-09.md) for the subsequent five cleanup commits and regression results.

See [build optimizations and release verification](docs/BUILD_OPTIMIZATION_2026-10-09.md) for the current **37,306-byte** standalone release, reduced by **31.6%** with every feature retained.

The source of both screens is `index.html`. `host.html` and `board.html` are generated compatibility entry points; edit the shared template and regenerate them.

Build with Node 18 or newer. Install the pinned development tools once:

```sh
npm ci
npm run build
```

This generates the standalone `dist/jeopardy_all_in_one.html` and both split pages. The build minifies HTML/CSS/JavaScript, combines application scripts, and packages stronger gzip with a validated Base85 payload. The tools are development dependencies only; gameplay remains offline and needs no installation. The standalone edition uses native browser decompression. For browsers without it, open the source entry point or build a readable uncompressed single file (this option needs only Node):

```sh
node scratch/build.js --plain
```

Run core and packaging regressions:

```sh
npm test
npm run test:package-core
```

Browser checks require Playwright and Chrome as development tools, with no gameplay dependencies:

```sh
node --test tests/browser.test.cjs
TEST_ENTRY=dist/jeopardy_all_in_one.html node --test tests/browser.test.cjs
```

Set `PLAYWRIGHT_MODULE_PATH` if Playwright is installed outside the project, and `BROWSER_CHANNEL` to use another supported installed channel.
