# Media performance check — October 8, 2026

An isolated Chrome 154.0.8037.98 session exercised a 61-image deck at 1920×1080 with 4× CPU throttling. Each synthetic PNG was 2048×1536 pixels. A full deck transfer was forced so shared browser storage could not hide preload work. The server delayed image responses by 80 ms.

| Preloader | Eager image requests | Maximum simultaneous network requests |
| --- | ---: | ---: |
| Before the budget change (`4dbbc9a`) | 61 | 6 |
| Active-round budget | 6 | 2 |

The new preloader requests at most six upcoming image clues from the current round, with two active loads/decodes. It refreshes its queue as clues are spent or rounds change. Selected clues still load their actual asset directly. Failed assets show a readable fallback.

Other changes avoid rewriting the immutable deck on each score/settings change, debounce settings persistence, skip unchanged spectator sections, remove persistent compositing hints from every glass card, and offer lower visual effects. Final music now uses one oscillator rather than one per note.

This is a repeatable browser lab, not a physical projector or GPU frame-rate measurement. Real projector/laptop testing remains useful; no FPS or memory savings are claimed from these request counts.

Run the lab with Playwright and installed Chrome:

```sh
node tests/profile-media.cjs
```

To compare the earlier controller, save its source and pass the path:

```sh
git show 4dbbc9a:src/js/board-ui.js > /tmp/jeopardy-before-performance.js
node tests/profile-media.cjs /tmp/jeopardy-before-performance.js
```

Set `PLAYWRIGHT_MODULE_PATH` when Playwright lives outside the project.
