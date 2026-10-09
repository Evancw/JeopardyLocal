# Build optimizations — October 9, 2026

The standalone release is **37,306 bytes (36.43 KiB)**, reduced from **54,560 bytes (53.28 KiB)** by **17,254 bytes / 31.6%**. Application source, features, storage formats, CSV options and generated host/spectator entry points remain unchanged. These changes affect the build and packaged release.

## Measured contributions

Sizes include the complete HTML file and loader. The first minification-only measurement comes from the preceding size review; bundling was then committed separately. Compression and encoding were measured with the same final loader to isolate their contributions.

| Step | Complete file | Change from preceding step |
| --- | ---: | ---: |
| Previous release | 54,560 bytes | — |
| Parser-based HTML, CSS and JavaScript minification | 40,580 bytes | −13,980 bytes |
| Combine application scripts before minification | 40,388 bytes | −192 bytes |
| Final loader structure and payload metadata, still native gzip/Base64 | 40,454 bytes | +66 bytes |
| Zopfli gzip, 15 iterations | 39,254 bytes | −1,200 bytes |
| Validated Base85 payload, including its decoder | **37,306 bytes** | **−1,948 bytes** |

The 66-byte loader cost buys separate inert payload storage, encoding/length metadata, and clearer failure handling. The Base85 result includes validation of encoded length, symbols, numeric overflow and padding. Damaged gzip data and unavailable browser decompression produce a visible error instead of leaving a silent loading screen.

## Implementation and compatibility

- Terser combines the seven application scripts in their original order. The early routing script retains its position. Global bindings, property names, DOM IDs and persisted data keys are preserved; unsafe transformations and top-level name shortening/removal are disabled.
- clean-css uses conservative level-one optimization. HTML minification conservatively collapses whitespace. Source strings, currency templates, regular expressions and Unicode are covered by regression checks.
- Build tools are pinned in `package-lock.json`: Terser 5.51.2, clean-css 5.3.3, html-minifier-terser 7.2.0 and @gfx/zopfli 1.0.15. They add no gameplay dependencies or network requirements.
- `npm ci` followed by `npm run build` creates the compressed release. Zopfli spends additional time during the build; browsers still decode standard gzip through the existing native decompression mechanism.
- `node scratch/build.js --plain` creates `dist/jeopardy_uncompressed.html` without third-party build tools. It preserves the readable inlined source at **167,344 bytes**. `index.html` also remains available as the source entry point.
- `node scratch/build.js --base64` provides an alternative payload encoding for diagnosis. It writes the same release path; run the default build afterward to restore the smaller Base85 release.

Every capability remains: encoding/separator selection, Unicode CSV handling, deck editing/export, images, category introductions, winner presentation, sound and music, timers, shortcuts, undo/redo, backups and spectator synchronization.

## Verification

All **50 automated checks passed**:

- 14 core logic checks against the original source.
- 7 build/codec checks, including literal preservation, both sample decks, byte/Unicode round trips, partial blocks, malformed payload rejection and deterministic packaging.
- The same 14 core logic checks against the actual optimized release bundle.
- 15 Chrome browser checks against the packaged release: existing gameplay and recovery flows plus invalid payload, damaged gzip and unavailable decompression handling.

Source and optimized computed appearance matched across **eight host states and seven spectator states** at 1280×800 with reduced motion. The pointer was placed consistently to avoid hover-state differences.

A clean installation from the lockfile succeeded, and rebuilding reproduced the release byte-for-byte. The decoded release exactly matches the optimized HTML, while the plain fallback exactly matches the inlined source. Release SHA-256:

```text
091aecd86246a0ce74a6bf69a0ae2a2193bc801951b999f774bac44593e4a1d2
```

Browser coverage used Chrome 154.0.8037.98. Safari/Firefox and physical audio/projector output were not assessed. Automated checks provide regression evidence for the tested flows; they do not establish universal browser compatibility.

Earlier source-refactor and optional-feature measurements remain historical records in [the source reduction report](CODE_SIZE_REDUCTIONS_2026-10-09.md) and [the size-options review](SIZE_OPTIONS_2026-10-09.md). No optional feature removals from those experiments are included in this release.
