# Production Board performance comparison

This harness compares the complete production `Board` before and after the React optimizations. It does not use a reduced board implementation.

The baseline is commit `a2d91e72c15845d3a308effb84860e15973ddeea`. The `baseline` directory contains that commit's `Board.tsx`, `BoardMarks.tsx`, and `BoardAnnotations.tsx`. Only relative imports change. The manifest records original and adjusted source hashes. The runner checks them before each comparison.

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

Fixtures cover every `VariantRule` type, combined rules, jigsaw regions, 4×4 and both 6×6 box shapes, center and corner notes, candidate previews, player colors, annotations, links, highlighting modes, cropped regions, guides, overlays, and mode badges. Input data is frozen.

Interaction checks compare callback arguments, current targets, callback replacement, candidate focus and keyboard navigation, mouse and touch hover, painting priority, refs, link selection, and native element changes when callbacks appear or disappear.

Separate normal-motion checks compare retained exit marks, inert semantics, cleanup, and multiple synchronous updates. Returning to the original value or candidate state in one turn must not leave ghost values.

## Timing limits

The four timed workloads are cell selection, candidate changes, value entry, and digit highlighting across a dense board. Full DOM comparisons happen outside timed spans.

- `dispatchMs` measures synchronous DOM event dispatch.
- `commitMs` measures dispatch start to a mutation observer that sees the expected visible DOM. It includes framework scheduling delay.
- `nextFrameMs` measures dispatch start to the next frame callback after DOM readiness. It is not a paint timestamp or INP.

The mobile profile uses desktop Chromium at 390×844 with fourfold CPU throttling. It does not measure a physical phone. These measurements exclude solver work, startup, navigation, and complete app responsiveness.

Reports include raw samples, median and p95 results, per-round variation, browser and dependency versions, source hashes, baseline identity, regression outcomes, and exact run settings.
