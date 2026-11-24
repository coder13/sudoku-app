# Production Board performance comparison

This harness compares the complete production `Board` before and after the React optimizations. It does not use a reduced board implementation.

The baseline is commit `9b4e635752819d6045d96d602af3dc639622fbfa`. The `baseline` directory contains that commit's `Board.tsx`, `BoardMarks.tsx`, and `BoardAnnotations.tsx`. Only relative imports change. The manifest records original and adjusted source hashes. The runner checks them before each comparison.

Both versions use the same React runtime, production CSS, other app dependencies, input path, fixtures, and browser settings.

## Run

Install the repository dependencies first. Install this directory's pinned Playwright dependency with `npm ci`, or set `PLAYWRIGHT_MODULE_PATH` to an existing Playwright installation. If Chromium is not in the Playwright cache, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable.

```sh
cd tools/react-board-performance
npm ci
npm run check
npm run benchmark
```

The benchmark command builds the production page, starts its server, runs Chromium, and closes the server. The server and browser stay in the same process tree.

For a short parity and timing smoke check:

```sh
npm run benchmark -- --profile desktop --samples 2 --rounds 1 --warmup 0 --output results/smoke.json
```

Use `--regression-only` to omit timed workloads. Use `--profile mobile` for the mobile emulation. The default checks both profiles. The default timing sequence has 20 warmup actions and 60 measured actions per workload, repeated in three rounds with alternating implementation order.

## Regression checks

The browser compares normalized DOM trees after each update. This includes tags, text, classes, styles, accessibility attributes, and SVG geometry. Generated SVG IDs use local aliases that preserve references.

The regression also checks theme fills independently for diagonal, Windoku, and Jigsaw cells. It omits the superseded baseline diagonal lines and Windoku outlines from the comparison when those rules are out of focus. Focused outlines and other clues still go through the full geometry comparison.

The regression checks the candidate tints and accessible labels in mixed cells in Any mode. For DOM parity, it maps those verified highlights back to the pinned grid's light cell fill. Other cells and candidates go through the full comparison.

Grouped chain behavior postdates the pinned baseline. Before the DOM comparison, the current Board must match the supplied group identities, outline geometry, colors, opacity, labels, complete accessible description, and selected candidates. The comparison then omits only those checked group outlines and descriptions and restores the baseline's single-candidate selection state. Link geometry, existing description references, and other candidate attributes remain in the comparison. Fixtures cover linked groups, explicit groups, mixed-digit groups, selection changes, and cleanup. The pinned baseline files and hashes stay unchanged.

Fixtures cover every `VariantRule` type, combined rules, jigsaw regions, 4×4 and both 6×6 box shapes, center and corner notes, candidate previews, player colors, annotations, links, highlighting modes, cropped regions, guides, overlays, and mode badges. Input data is frozen.

Interaction checks compare callback arguments, current targets, callback replacement, candidate focus and keyboard navigation, mouse and touch hover, painting priority, refs, link selection, and native element changes when callbacks appear or disappear.

Separate normal-motion checks compare retained exit marks, inert semantics, cleanup, and multiple synchronous updates. Returning to the original value or candidate state in one turn must not leave ghost values.

## Normal motion and app lifecycles

Run these commands from the repository root after installing the harness dependency and Chromium:

```sh
node tools/react-board-performance/scripts/motion.mjs
node scripts/check-mobile-resize.mjs --compare 7e8979c43f13c6238dc0a5c20a0ccbe3c85d4272 --rounds 3
node --experimental-strip-types scripts/check-worktable-lifecycle.mjs
node --experimental-sqlite --experimental-strip-types scripts/check-startup-loading.mjs
```

The motion comparison uses the same optimized Board with either the previous paint transitions or the current direct highlights. A pinned, hashed fixture contains the earlier transition declarations. It records Chromium paint, style, and layout events, frame intervals, and the full observation window. Bulk-removal runs compare the pinned old Board with the current Board under the same current CSS. They also count fallback timers and check exit cleanup, reduced motion, and rapid restore/remove sequences.

The mobile resize comparison builds both resize implementations with the same current Board, controls, font, and unrelated CSS. It uses the old resize sizing rule with the old implementation. It records drag and release separately. The optional historical comparison needs the named Git commit; `--regression-only` tests current behavior without repository history.

The lifecycle script runs the real development app, stores, router, and WASM. It holds selected native worker replies to check pause, note edits, hint closure, navigation, and generation cancellation. It is a functional check, not a performance measurement. Generate the normal app WASM assets before running it.

The startup script runs the real server HTML, client router, and sync Worker with an isolated SQLite database. It delays puzzle and settings responses to check the blank loading page, immediate cached play, remote completion, and failure recovery. It checks desktop and mobile geometry and records even brief Puzzles page mounts. Its offline case supplies local app assets while Chromium reports an offline network. It does not test service-worker installation. Use `--screenshots results/startup-screenshots` to capture the loading line and cached play during sync.

CI runs the motion and resize scripts with `--regression-only`, plus the lifecycle and startup scripts. Timing thresholds are not used as a CI gate. Final reports include source hashes; raw results go in the ignored `results` directory.

## Timing limits

The four timed workloads are cell selection, candidate changes, value entry, and digit highlighting across a dense board. Full DOM comparisons happen outside timed spans.

- `dispatchMs` measures synchronous DOM event dispatch.
- `commitMs` measures dispatch start to a mutation observer that sees the expected visible DOM. It includes framework scheduling delay.
- `nextFrameMs` measures dispatch start to the next frame callback after DOM readiness. It is not a paint timestamp or INP.

The mobile profile uses desktop Chromium at 390×844 with fourfold CPU throttling. It does not measure a physical phone. These measurements exclude solver work, startup, navigation, and complete app responsiveness.

Reports include raw samples, median and p95 results, per-round variation, browser and dependency versions, source hashes, baseline identity, regression outcomes, and exact run settings.
