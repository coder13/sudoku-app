# Solid board prototype

This isolated tool compares the current Sudoku board with two focused classic-board implementations. The production app does not import it.

| Implementation | What it runs |
| --- | --- |
| Current React | The actual `src/components/Board.tsx`, with its production mark transitions. |
| Memoized React | A classic-board subset with memoized cells, stable mark arrays, and the production `BoardMarks` component. |
| Solid 2.0 | The same classic subset with per-cell reactive state and equivalent mark transitions. |

The two focused boards share the same cell projection, label calculation, candidate classes, and fixture state. All three use the production CSS and font. The tool supports values, grid notes, selection, peer and digit highlights, cell colors, candidate colors, and coordinate guides. Variants, teaching annotations, the solver, navigation, and the full workspace are outside this prototype.

## Try it

From the repository root:

```sh
npm ci
cd tools/solid-board
npm ci
npm run check
npm run build
npm run preview
```

Open `http://127.0.0.1:8775/`. Use the three implementation buttons to switch boards without losing the current position. The selector offers a normal classic puzzle and an empty stress board with all 729 candidate notes.

The input controls support Pen, Pencil, Highlight, and Color. Arrow keys move the active cell. Shift-click extends the selection. Ctrl/Cmd+digit toggles a candidate. Alt+digit colors a candidate. The shared zoom controls use direct DOM transforms, so they do not measure a framework-specific zoom implementation.

For development, use `npm run dev` at port 8774. The comparison button rejects development builds to avoid misleading timing results.

Pull request previews include this tool at `/experiments/solid-board/`. The workflow includes it only in pull request deployments.

## Run the comparison

Install a browser once:

```sh
npx playwright install chromium
```

Then run:

```sh
npm run build
npm run benchmark -- --screenshots
```

The command starts a production preview server, runs the checks, saves `results/latest.json`, and stops its server. Use `--url URL` to test an existing production preview instead. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing compatible Chromium binary.

A short correctness check:

```sh
npm run benchmark -- --samples 4 --rounds 1 --warmup 2 --profile desktop --output results/smoke.json
```

The default comparison measures four workloads:

1. Selection changes on the classic puzzle.
2. Candidate changes on the classic puzzle.
3. Digit entry and removal on the classic puzzle.
4. Digit highlighting across the dense stress board.

Each workload uses 20 warmup actions and 60 measured actions for each implementation. Three rounds rotate the implementation order. Only one board is mounted at a time. The browser script runs desktop Chromium, then a 390 × 844 mobile viewport with 4× CPU throttling. Mobile emulation is not a physical-phone test.

## Read the measurements

| Field | Meaning |
| --- | --- |
| `dispatchMs` | Synchronous duration of the shared programmatic click and event handler. It excludes scheduled framework work. |
| `commitMs` | Time from click dispatch to a MutationObserver callback that sees the expected live DOM. It includes shared state handling, toolbar updates, and framework scheduling. |
| `nextFrameMs` | Time from dispatch to the next animation-frame callback after DOM readiness. It is a rendering opportunity, not measured paint latency or INP. |

The report includes raw samples, median and p95 values, results for each round, viewport, CPU throttling, browser version, package versions, the source commit, and file hashes. Full DOM comparisons and fixture preparation occur outside the timed spans. Neither renderer uses `flushSync` or `flush` to force an update.

The primary timing run requests reduced motion. A separate normal-motion check compares live DOM, retained exit marks, and final cleanup. It also checks synchronous value and candidate reversals, so an intermediate state cannot leave a ghost fade. Multi-cell input sends one final state to each adapter. The Solid adapter coalesces synchronous updates before it advances its fade history.

The comparison stops on a mismatch. It checks cell structure, candidate and value content, classes, labels, grid roles, selection, active focus targets, colors, and candidate positions. It ignores class order, empty styles, and transient enter flags in live snapshots. Separate motion checks examine the retained fade nodes.

## Limits

The two prototypes support fewer features than the current Board. Their comparison with the current board measures a focused rewrite as well as changes to rendering. The comparison between memoized React and Solid is the closer framework comparison, but their state and transition implementations still differ.

These results do not measure physical input delay, GPU composition, actual paint completion, battery use, startup size, solver speed, or full-app responsiveness. Both frameworks are present in the lab bundle, so its download size is not a migration size estimate. Shared DOM zoom and resize controls cannot establish that Solid improves those paths.

Use the browser profiler and a physical phone before a migration decision. A lower DOM update time provides more time for other work in a frame. It does not guarantee a visible animation improvement.

## Package boundaries

This tool has its own package manifest, lock file, Vite configuration, and TypeScript check. React and React DOM match the app lock file at the source baseline: 19.3.1. Solid is 2.0.3, its renderer is `@solidjs/web` 2.0.3, and its Vite plugin is 3.0.1. The production dependencies and Vite configuration remain separate.

Solid JSX files end in `.solid.tsx`. The Solid plugin handles only those files. The React plugin handles the app and React prototype files. The Vite configuration deduplicates React so imports from the production component and the tool use the same runtime.

The prototype components are private to this tool. Use the production component catalog for app UI work.
