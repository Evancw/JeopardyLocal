# Further size options and feature tradeoffs — October 9, 2026

The five implemented source refactors and refreshed standalone release are already on GitHub at `d9a6688`, on `codex/jeopardy-enhancements`. A further push confirmed the branch was up to date. The current standalone file is **54,560 bytes (53.28 KiB)**. This review changes documentation only; no feature removal or experimental build is shipped.

## Keeping the current features

Updated experiments against the latest source produced these complete standalone sizes, including the loader:

| Packaging option | File bytes | KiB | Saving from current release |
| --- | ---: | ---: | ---: |
| Current source-preserving gzip/Base64 build | 54,560 | 53.28 | — |
| Parser-based JavaScript, CSS and HTML minification | 40,580 | 39.63 | 13,980 bytes / 25.6% |
| Above, with 15-iteration Zopfli gzip | 39,328 | 38.41 | 15,232 bytes / 27.9% |
| Combine scripts before minification, preserve global names | 40,388 | 39.44 | 14,172 bytes / 26.0% |
| Combined script, retain shared entry points, shorten private names | 40,276 | 39.33 | 14,284 bytes / 26.2% |
| Above, with 15-iteration Zopfli gzip | 39,080 | 38.16 | 15,480 bytes / 28.4% |
| Above, with custom Base85 payload encoding | 36,901 | 36.04 | 17,659 bytes / 32.4% |

The rows represent distinct configurations, not independent additive savings. The main gain comes from parser-based minification. Combining the scripts adds only 192 bytes of saving compared with processing them separately; private-name optimization adds another 112 bytes in the configuration tested.

The aggressive configuration explicitly retains top-level functions/classes plus `gameState` and `gameAudio`. Property names, DOM IDs, storage keys and serialized data formats are preserved. Initially reserving a function name only for name shortening was insufficient: the compressor inlined and removed `exportSessionBackup`, causing a regression check to fail. Explicit retention corrected that issue. See [Terser's compression and name-shortening options](https://terser.org/docs/options/). Do not enable unrestricted top-level removal or property-name shortening in a release build.

**A further source-only opportunity:** reuse oscillator/gain setup across seven audio paths while retaining each cue's waveforms, notes, timing, ramps and cleanup. An experimental helper removed 898 source bytes but saved only **64 standalone bytes** (54,496 bytes). Ten mock scheduling comparisons matched the original, covering six cues and Final durations of 1, 10, 30 and 120 seconds, including node cleanup. This illustrates why additional source refactors will usually produce modest packaged savings.

A separate authoring tool could keep editing available in the project while making the game-only file smaller. That changes the one-file workflow: editing would require the additional tool. It is an option if the priority is the size of the gameplay download rather than every capability living in the same file.

Recommendation: adopt conservative minification and stronger gzip first. The custom Base85 decoder is a separate, more involved release change and needs payload-boundary, malformed-input, loader-error and cross-browser coverage. None of these build changes requires gameplay dependencies or network access.

## If some features are optional

Each row below independently removes or simplifies one capability from the current source, removes its relevant interface hooks, and rebuilds the package. The second savings column repeats that comparison with parser minification applied to both baseline and variant. Savings cannot simply be added because compression shares patterns between features.

| Optional change | Saving with current build | Saving after minification | Usability cost |
| --- | ---: | ---: | --- |
| Remove audio engine, cues and Final music | 3,356 bytes | 2,292 bytes | Timers and visual game flow remain; audible feedback and the game-show atmosphere disappear. Low impact only for hosts who normally mute the game. |
| Remove in-app clue/category editing, ordering and revised CSV export; keep CSV template | 3,300 bytes | 2,384 bytes | Prepare decks externally before play. No convenient mid-game clue correction. Suitable when the application is used purely for hosting. |
| Skip category introduction carousel | 1,640 bytes | 1,268 bytes | Start directly at the full board, whose category headers remain visible. Lose the staged introduction presentation. |
| Simplify decorative winner screen | 1,584 bytes | 1,136 bytes | Keep champion names, joint champions, scores, runner-up standings and ranks; remove the elaborate animated/glowing winner card. |
| Remove mid-game team name/color editing | 676 bytes | 484 bytes | Set team names and colors during setup; no later corrections. Team count and initial setup remain. |
| Remove global hosting shortcuts | 388 bytes | 336 bytes | Mouse controls remain; lose fast team selection, grading, reveal, skip, pause and undo shortcuts. Card Enter/Space and Final wager Enter navigation remain. |
| Remove CSV template download | 292 bytes | 244 bytes | New users need the documented schema or an existing CSV. |
| Remove manual separator selection; retain automatic comma/semicolon/tab detection | 140 bytes | 120 bytes | Lose the override for ambiguous or unusual input files. |
| Remove manual text-encoding selection | 108 bytes | 108 bytes | Lose manual legacy decoding overrides. UTF-8 Unicode input, normalization and diagnostics remain. |
| Remove both import selectors | 272 bytes | 232 bytes | Combines the preceding two limitations. |

Encoding selection is not a bundled encoding library: it passes a label to the browser's `FileReader`. Without that argument, the browser assumes UTF-8. Removing the selector therefore saves little; it does not mean removing Unicode support. See [MDN's readAsText documentation](https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsText).

Two combined configurations were also measured:

- **Simpler presentation:** remove category introductions and simplify the winner display. Result: **51,456 bytes**, saving **3,104 bytes** with the current packager; **38,196 bytes** after minification, saving **2,384 bytes** against the minified full-feature baseline.
- **Prepared-deck hosting:** make those presentation changes and remove the in-app deck editor/reordering/revised export, retaining the CSV template, audio, images and game controls. Result: **48,400 bytes**, saving **6,160 bytes**; **35,820 bytes** after minification, saving **4,760 bytes** against its full-feature baseline.

The strongest generally low-usability-impact cuts are the introduction carousel and winner decoration. Removing the deck editor is conditional on decks being prepared elsewhere. Removing sound is conditional on how the host runs games. Encoding and separator controls are tiny, so removing them is mainly an interface simplification rather than a meaningful size optimization.

Keep CSV validation, Unicode handling, stable clue identities, scoring rules, timers, synchronization/reload recovery, autosave, undo and portable backups. These directly protect the requested gameplay and state-tracking behavior. Backup/undo validators are also shared with autosave recovery and editing; deleting a whole module would remove more functionality than the apparent feature label suggests. Keyboard support is small and useful enough to retain unless a mouse-only edition is deliberately chosen.

## Experiment coverage and limits

- The corrected 36,901-byte full-feature bundle passed all **14 existing browser flows**, including direct-file transport without BroadcastChannel/storage, reload recovery, Unicode/literal text, Daily Doubles, Final corrections and timers, undo/backups, editing/export, keyboard hosting and missing images.
- Separately minified core logic passed all **14 core checks**. The previous release's 58-check verification remains recorded in [the source refactor report](CODE_SIZE_REDUCTIONS_2026-10-09.md).
- All **13 baseline/optional/combined variants** passed a smoke flow importing a Unicode category, starting the game, opening the board, grading a clue, wagering/grading Final and completing the game without script errors. The feature-reduced variants did not run the full suite because it intentionally exercises removed capabilities. These are prototypes, not approved releases.
- The source-only audio helper matched ten mock scheduling/cleanup traces. Actual audible output was not compared.
- Experiments used Terser 5.51.2, clean-css 5.3.3, html-minifier-terser 7.2.0 and @gfx/zopfli 1.0.15 in temporary directories. Browser checks used isolated Chrome 154.0.8037.98. Safari/Firefox and physical display/audio output were not assessed. The custom payload encoding also needs broader loader tests before adoption.

The application source and tracked standalone release remain unchanged by this review.
