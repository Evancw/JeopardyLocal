# Standalone file size review — October 9, 2026

The implemented application was pushed to GitHub on `codex/jeopardy-enhancements` at `a12901c`. This review measures further packaging options without changing the released application or intentionally removing features. All candidate files are experiments; the tracked release remains 55,348 bytes.

## Measured results

Sizes include the complete offline HTML loader and its embedded payload, rather than just compressed JavaScript. KiB means 1,024 bytes. Savings compare with the current release. Each combined row includes the preceding optimizations; the individual rows do not add together.

| Build option | Complete file, bytes | KiB | Reduction |
| --- | ---: | ---: | ---: |
| Current source-preserving gzip package | 55,348 | 54.05 | — |
| JavaScript formatting/comments only | 47,584 | 46.47 | 14.0% |
| JavaScript compression and local-name shortening only | 42,968 | 41.96 | 22.4% |
| CSS minification only | 54,668 | 53.39 | 1.2% |
| Conservative HTML minification only | 54,224 | 52.95 | 2.0% |
| Combined JavaScript, CSS, and HTML minification | 41,044 | 40.08 | 25.8% |
| Combined minification + Zopfli gzip, 15 iterations | 39,796 | 38.86 | 28.1% |
| Same, 100 Zopfli iterations | 39,788 | 38.86 | 28.1% |
| Combined minification + 15-iteration Zopfli + custom Base85 payload | 37,571 | 36.69 | 32.1% |

The inlined source shrinks from 172,163 to 117,060 bytes with combined minification. Gzip shrinks from 40,853 to 30,124 bytes, or 29,189 bytes with 15-iteration Zopfli. Base64 adds roughly one-third to those compressed bytes. A Base85 representation adds roughly one-quarter, with a small decoding routine included in the final size above.

## Recommended implementation sequence

1. **Add parser-based minification to the release build.** Keep readable source and the uncompressed fallback. Minify each script with global names preserved, then CSS and HTML. This is the largest measured saving, and the existing gameplay suite passed against the candidate. Add build fixtures for currency templates, quotes, regex literals, closing-script strings, and Unicode before making it the default. Update the packaging tests to compare decoded output with the optimized build input while retaining a separate source-preservation check.
2. **Use Zopfli for release gzip compression.** This changes the encoder during building; the browser still receives standard gzip and uses the existing decoder. Both tested iteration counts decompressed byte-for-byte to the same optimized input. Use 15 iterations: 100 saved only eight additional file bytes here, with compression time rising from about 0.30 to 1.05 seconds in this lab. These are single-run timings, not a build-performance benchmark. See [Zopfli's implementation](https://github.com/google/zopfli) and [the tested WebAssembly binding](https://github.com/gfx/universal-zopfli-js).
3. **Consider Base85 for the smallest offline edition.** This saves another 2,225 bytes relative to the 15-iteration Zopfli/Base64 package. The experimental decoder reproduced the gzip bytes exactly and passed the same browser suite. It introduces custom runtime code, so adoption should also cover all byte values, partial final blocks, malformed payloads, loader errors, and supported browsers. The measured 36.69 KiB is an achievable candidate, not a proven minimum.

These build tools would be development dependencies only. Gameplay remains offline and does not need an installation or external service. Pin their versions and retain their required license notices when introducing them to the project.

## Other avenues and their limits

- **Consolidate repeated host rendering and inline styles.** `host-ui.js` is the largest source file at 58,256 bytes. Shared rendering helpers and CSS classes may shrink it further while retaining each control. Gzip already compresses repeated strings well, so measure the final package after each small refactor; a shorter source file does not always produce a smaller compressed release. Savings are unmeasured.
- **Shorten additional internal names after bundling.** Coordinated top-level name shortening might help, but the classic scripts share globals and the tests access them. Preserve public entry points, storage keys, packet fields, and backup/deck schemas. Avoid property-name shortening that can change those interfaces. The measured candidates preserve global names and do not use unsafe JavaScript transforms. [Terser's options](https://terser.org/docs/options/) explain these distinctions.
- **Trim the outer loader.** Its current overhead beyond the Base64 payload is 876 bytes. Parser minification could recover a fraction of this. Keep its loading status, viewport, unsupported-browser guidance, and error handling. The upside is much smaller than optimizing the payload.
- **Changing gzip to deflate offers negligible savings.** With the optimized input, the Base64 payload is 40,168 bytes for gzip, 40,152 for zlib-wrapped deflate, and 40,144 for raw deflate. Saving 16–24 payload bytes does not justify altering the format or reducing compatibility.
- **Brotli is smaller, but native decoding is not broadly interchangeable with gzip.** The optimized Brotli payload measured 25,513 bytes before encoding, versus 30,124 for gzip. However, the installed Chrome 154.0.8037.98 rejected `new DecompressionStream('brotli')`; gzip, deflate, and raw deflate worked. [MDN's compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/DecompressionStream.json) likewise records varying Brotli support. Requiring a different browser would change current usability. Including a fallback payload or JavaScript/Wasm decoder needs a full size calculation and may erase the saving.
- **HTTP compression can reduce hosted transfer size.** It avoids the embedded Base64 representation when serving an ordinary inlined page, but it does not shrink the downloadable offline file. A hosted edition would be additional packaging, not a substitute for direct-file gameplay.
- **Assets and repository files offer little release-file opportunity.** Remote fonts are already removed; clue images remain external; documentation, demos, tests, and Git history are not in the standalone file. Deleting them would not shrink this release. Dynamically downloading controllers or stripping recovery, editing, history, accessibility, or validation would conflict with retaining current capabilities.

## Experiment configuration and verification

The baseline was `a12901c`. Tools were installed in a temporary directory, without changing repository dependencies: Terser 5.51.2, clean-css 5.3.3, html-minifier-terser 7.2.0, and @gfx/zopfli 1.0.15.

- Each embedded classic script was processed independently. Terser used `compress: { passes: 2 }`, `mangle: { toplevel: false }`, `toplevel: false`, and `format: { comments: false, inline_script: true }`. The formatting-only comparison disabled both compression and name shortening. Console/error behavior and property names were retained. See [Terser](https://terser.org/docs/options/).
- CSS used clean-css level 1. HTML used `removeComments: true`, `collapseWhitespace: true`, and `conservativeCollapse: true`, with embedded JavaScript/CSS processing disabled because those had already been handled. No text processing was applied to CSV input, clue content, or JavaScript template strings. See [clean-css](https://github.com/clean-css/clean-css) and [html-minifier-terser](https://github.com/terser/html-minifier-terser).
- Packaging retained the existing loader and level-9 gzip except where the table explicitly changes compression or encoding. Both Zopfli streams were decoded with Node's gzip decoder and matched the optimized HTML exactly.
- The Base85 experiment encoded four compressed bytes as five symbols from a fixed 85-character printable ASCII alphabet excluding HTML/JavaScript delimiter characters. The final compressed length was retained to discard padding. Decoder output matched the original compressed bytes exactly.
- All **14 core regressions passed against minified logic**, including demo decks, Unicode normalization, malformed CSV, money values, stable IDs, scoring/Final rules, timers, autosave, history/backups, editing/export, legacy Unicode progress, and audio scheduling.
- All **11 browser flows passed against the combined-minification/Base64 candidate**, and all **11 passed again against the Zopfli/Base85 candidate**, including direct-file transport without BroadcastChannel/storage, reload recovery, literal clue markup, timers, long multiline clues, undo/backups, editor/keyboard actions, and missing images.

The browser runs used isolated installed Chrome. Safari and Firefox were not tested. Physical audio output, visual parity across every screen, malformed Base85 decoding, and a general startup-speed comparison were not assessed. Passing these regressions supports the candidates; it does not exhaustively prove compatibility.
