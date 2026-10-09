# Source refactors and measured size reductions — October 9, 2026

All five requested opportunities were implemented in separate source commits. The standalone release shrank from **55,348 to 54,560 bytes**, saving **788 bytes (1.4%)**. Its uncompressed inlined source shrank from 172,163 to 167,344 bytes, saving 4,819 bytes (2.8%). No minifier, compression-format change, new dependency, or feature removal was introduced.

| Opportunity | Commit | Inlined source reduction | Standalone reduction | Standalone after change |
| --- | --- | ---: | ---: | ---: |
| Move repeated control styling into CSS | `d36db92` | 314 bytes | 52 bytes | 55,296 bytes |
| Share grading controls and dynamic event handlers | `f43db18` | 1,632 bytes | 24 bytes | 55,272 bytes |
| Share current-round and Daily Double calculations | `70a09ad` | 1,507 bytes | 372 bytes | 54,900 bytes |
| Centralize saving and board notification | `907ac49` | 727 bytes | 100 bytes | 54,800 bytes |
| Remove unused references, duplicate startup/download code, and superseded CSS | `854fe2d` | 639 bytes | 240 bytes | 54,560 bytes |
| **Total** | | **4,819 bytes** | **788 bytes** | **54,560 bytes** |

Each reduction is measured against the immediately preceding step, using the unchanged `scratch/build.js` packager and level-9 gzip. These are complete UTF-8 file sizes including the loader and Base64 payload. The baseline is `283c50a`, whose application source and release match `a12901c`. Source commits omit the compressed artifact so their diffs remain readable; a separate release commit refreshes it after verification.

## What changed

- Team edit inputs and quick-grading controls now use shared stylesheet rules. Reuse of the existing team-card header class preserves its layout. Broader style extraction was tried and narrowed when it increased the compressed output; all retained steps reduce the actual standalone file.
- Quick grading and Final grading share button generation. Names and colors remain escaped, wrong-answer lockouts remain enforced, and Final result highlighting/correction remains available. Grid actions use persistent delegated handlers for category introductions, Final controls, and grading. Final wager Enter navigation still advances focus and validates all wagers before revealing the clue. Existing sidebar score behavior was retained where changing it did not help file size.
- Host and spectator share current-round category lookup. The interface and core share maximum-clue and Daily Double limit calculations; the host's existing empty-round display fallback is retained.
- A shared presenter publisher saves and notifies in the same order. Gameplay still saves immediately; settings still use delayed saves; restore/edit still transfer the full deck. A redundant phase snapshot and redundant Daily Double assignment/save were removed because the preceding operations already include that state. Board action names and sound cues remain supported.
- The core owns the shared startup helper. The unused sidebar reference was removed. Backup downloads reuse the existing text-download helper. Effective clue, overlay, and timer CSS values were merged into their original rules, removing earlier declarations that were already overridden.

Gzip already compresses repeated source efficiently, so source cleanup produces much smaller packaged savings than minification. The larger packaging opportunities measured in [the earlier size review](SIZE_REVIEW_2026-10-09.md) remain separate future work.

## Verification

- **16 core and packaging checks passed.** Coverage includes both demo decks, malformed and Unicode CSV, currency and stable identities, scoring/lockouts, Daily Doubles, Final corrections, timers, compact autosave, history/backups, deck editing/export, legacy Unicode progress, source-preserving packaging, and Final audio scheduling.
- **14 browser flows passed for each of three editions:** source `index.html`, standalone `dist/jeopardy_all_in_one.html`, and generated `host.html`/`board.html`. This gives **42 browser checks and 58 final checks total**.
- Three added browser flows cover controls after redraw/undo with literal Unicode/markup team names; category next/back/disabled/full-board behavior; and multi-team Final wager Enter navigation, invalid-wager rejection, repeated correction, and guarded completion. Existing flows also cover skip introductions, offline transport, reload recovery, visible paused timers, long clues, exports, editing/keyboard actions, and missing images.
- Computed layout and appearance properties matched the baseline across **eight host states and seven spectator states** at 1280 × 800 with reduced motion. The host start button was excluded from that comparison because pointer hover varied between runs. Comparisons included colors, font sizing/weight, spacing, borders, dimensions, and flex/grid alignment.
- The uncompressed fallback was regenerated; the packaged output was verified by the same gameplay suite. Source diffs passed whitespace checks.

Browser verification used isolated Chrome 154.0.8037.98 sessions. Safari, Firefox, physical projector output, and audible speaker output were not tested. These checks found no regressions; they are not an exhaustive guarantee across every browser and device.
