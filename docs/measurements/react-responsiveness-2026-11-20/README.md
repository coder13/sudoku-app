# React responsiveness measurements

Measured on 20 November 2026 for [PR #327](https://github.com/coder13/sudoku-app/pull/327).

Measured application source: [`92f0b21`](https://github.com/coder13/sudoku-app/commit/92f0b21eb456077980c497e39f9fc898246ae730).

Later main-branch integrations added sized Jigsaw layouts, labeled dots, boxless grids, Killer cages, pinned rule highlights, linked Double Arrows, play controls, and single-search import verification. The integrations preserve the performance changes and owned generation sessions. The regression fixtures cover the new layouts, rule captions, region replacement, peer highlighting, and candidate actions. The current harness baseline is `9b4e635752819d6045d96d602af3dc639622fbfa`. CI checks the integrated source. The timing tables below remain pinned to `92f0b21`; they have not been relabeled as measurements of the later merges.

The changes reduce ordinary board update work, dense highlight painting, and mobile drag style work. They also prevent slow solver jobs from blocking candidate requests and prevent late results from changing an outdated or paused puzzle. These measurements do not establish native-app smoothness on a physical phone. Resize release and large simultaneous removals still have long frame gaps in some runs.

## Changes

- Memoize individual cells, marks, static clues, and annotation routes. Keep event wrappers stable while calling the latest committed handler. Cache unchanged candidate elements and geometry.
- Update cell colors, shadows, and SVG highlight strokes directly. Keep mark entry and exit fades, with one shared fallback timer and batched transition completion.
- Isolate candidate and singles requests from expensive hints, ratings, and traces. Keep only the latest queued candidate refresh for each caller.
- Give hints, generation, and other cancellable searches owned workers. Closing their UI terminates the work. Check the current board revision and play state before applying results, including after note edits and undo/redo.
- Preserve completed exhaustive hint collections across color edits. Note, rule, session, and play-state changes close the old collection. A canceled pending hint also closes its loading card.
- Share action classification between history and technique progress. Finish a valid history batch before processing newly appended actions.
- Update ordinary clock ticks in memory. Save elapsed time at five-second checkpoints and on pause, navigation, and page hide. Moves and undo history still save immediately. Read each library sort key once per sort pass.
- Keep board content size fixed during a mobile resize preview. Block inherited panel sizing variables at the board-content boundary, scale the content, and skip fit-observer reads during the drag. Restore prior inline styles when canceled.

## Full Board update comparison

The baseline is the complete production `Board`, `BoardMarks`, and `BoardAnnotations` from `55067cc61d09e4e953f9d7fc6d599be4d8a01a5e`. Only fixture import paths change. Both implementations share current CSS and all other app dependencies.

Settings: Chromium 153.0.8010.0, React 19.3.1, Vite 8.3.8, production build, reduced motion, three alternating rounds, 20 warmup actions and 60 measured actions per round. Each table entry has 180 measured actions. Desktop is 1440×1000 at normal CPU speed. Mobile is desktop Chromium at 390×844 with fourfold CPU throttling.

Times are milliseconds from event dispatch to a mutation observer seeing the expected DOM. This includes React scheduling. It is not paint latency or INP.

| Profile | Action | Baseline median / p95 | Current median / p95 |
|---|---|---:|---:|
| Desktop | Selection | 1.20 / 1.80 | 1.00 / 1.40 |
| Desktop | Candidate edit | 1.35 / 2.50 | 0.60 / 0.90 |
| Desktop | Number entry | 1.30 / 2.00 | 0.60 / 0.90 |
| Desktop | Dense digit highlight | 2.20 / 3.01 | 1.90 / 2.91 |
| Mobile, CPU 4× | Selection | 5.50 / 7.71 | 4.10 / 6.00 |
| Mobile, CPU 4× | Candidate edit | 5.50 / 7.71 | 2.65 / 3.81 |
| Mobile, CPU 4× | Number entry | 5.80 / 8.31 | 2.80 / 4.60 |
| Mobile, CPU 4× | Dense digit highlight | 10.80 / 15.83 | 9.90 / 13.01 |

Candidate edits and number entry use about half the median update time in the throttled mobile profile. Dense highlights improve less. The report includes every sample, dispatch and next-frame times, and variation between rounds.

## Normal-motion painting and cleanup

The highlight comparison uses the same current Board with either the previous paint transitions or current direct highlights. A pinned CSS overlay restores the earlier declarations, and computed-style checks verify that they apply to cells, candidates, glyphs, lines, polylines, and SVG markers.

Each round toggles all 729 candidate highlights and matching cell fills 15 times over roughly three seconds. This is a deliberate dense stress case. Paint and style figures below are medians of three per-round Chromium trace totals. Frame figures are the p95 of pooled animation-frame callback gaps.

| Profile | Measurement | Previous transitions | Current transitions |
|---|---|---:|---:|
| Desktop | Paint work | 78.67 ms | 42.82 ms |
| Desktop | Style work | 318.96 ms | 207.88 ms |
| Desktop | Frame callback gap, p95 | 16.8 ms | 16.7 ms |
| Mobile, CPU 4× | Paint work | 286.22 ms | 189.25 ms |
| Mobile, CPU 4× | Style work | 1545.06 ms | 1154.87 ms |
| Mobile, CPU 4× | Frame callback gap, p95 | 166.7 ms | 83.4 ms |

Bulk removal compares the pinned old Board with the current Board under the same current CSS. Peak simultaneous fallback timers fell from **729 to 1** in both profiles. All exits cleared, all 729 restored marks remained live, and no timers remained. Reduced motion scheduled no fallback timers. A rapid remove, restore, and remove check also verifies that an old transition completion cannot remove a newer exit of the same cached element.

Bulk removal is still expensive. In the normal mobile removal case, pooled p95 frame gaps remained about 367 ms, and the first callback did not consistently arrive sooner. The timer change removes duplicated scheduling; it does not make every mass removal smooth. The report separates its 800 ms observation window from a bounded cleanup drain. Trace totals cover the marked observation window; broader counters also include surrounding calls and the drain.

## Mobile resize

This comparison uses resize JavaScript and the board-content sizing rule from `7e8979c43f13c6238dc0a5c20a0ccbe3c85d4272` as its baseline. Both conditions use the same current Board, controls, font, and unrelated CSS. The fixture uses real layout and resize components, without Worktable, routing, or solver work.

Settings: Chromium 153, 390×844 touch viewport, normal motion, normal CPU speed, 729 candidates, a 72 px drag in 18 steps, two rounds with reversed condition order.

| Measurement | Baseline rounds 1 / 2 | Current rounds 1 / 2 |
|---|---:|---:|
| Drag style work | 815 / 677 ms | 64 / 332 ms |
| Drag frame gaps above 25 ms | 18 / 17 | 1 / 8 |
| Release style work | 92 / 84 ms | 79 / 156 ms |
| Release layout work | 25 / 16 ms | 17 / 50 ms |
| Longest release frame gap | 133 / 100 ms | 100 / 217 ms |

Drag style work fell by 92% and 51% in the two matched rounds. Both versions still performed 18 layouts during the drag and one on release. Both performed 164 style passes on release. The second current release was slower, so these results support reduced drag work, not a reliably smoother release. These runs do not identify the cause of that variation.

An earlier implementation deferred more outer sizing work until release and increased release cost. The final code keeps outer card sizing current throughout the gesture and uses the CSS inheritance boundary to reduce work inside the board.

Functional checks passed for portrait layout, reversed panel order, an open hint, an interrupted drag after a viewport change, and side, top, and diagonal outside clues. They check cancellation, keyboard reset, gradual expansion, committed width, centering, width limits, clue containment, and the reachable mode badge. With outside clues, the full frame remained 252 px wide at release. Fixed-size coordinate labels reflow inside that frame, as in the existing scaling approach.

## Validation at the measured source

- Repository type check and component catalog check passed. The catalog covers 184 named components.
- All **848 repository tests** passed, with no failures, skips, or cancellations.
- Harness type check and **320 full Board browser checks** passed across desktop, throttled mobile, and normal motion. Coverage includes all variant rule types, mixed rules, jigsaw regions, smaller grids, Arrow and Region Sum clues, input callbacks, keyboard focus, annotations, colors, and fade behavior.
- **Seven additional motion regressions**, all **36 timed motion runs**, and **five resize scenarios** passed.
- **Seven real-app lifecycle scenarios** passed: closing and restarting a hint, pausing candidate generation, editing notes during Solve Singles, paging an exhaustive hint after coloring, coloring during a pending hint, leaving a hint, and leaving generation.

The exhaustive-hint regression loaded 1,446 real hints, made a color edit with undo history, and fetched a later eight-hint page from the same worker. A subsequent note edit closed the worker and cleared the hint. The lifecycle script runs the real development app and native WASM workers, delaying selected successful replies. It is a functional check, not a production performance measurement.

Storage tests cover no persistence reads or writes inside ordinary clock updates, checkpoint flushing, immediate move durability, remote updates and deletion, failed writes, and a 150-puzzle sort that reads each eligible timestamp once per pass. Worker tests cover queue separation, latest-request replacement, cancellation, classification sharing, and generation retry cancellation.

## Evidence and reproduction

[The manifest](manifest.json) records the compressed and original report hashes. Each report retains its original measured commit and working-tree status. Every recorded source-file hash was verified against published source commit `92f0b21`. This includes runs made before that GitHub commit existed; their metadata has not been rewritten to claim they ran on it.

- [Full Board samples and checks](board.json.gz)
- [Normal-motion trace totals, counters, frame intervals, and timer observations](motion.json.gz)
- [Resize timings and geometry checks](resize.json.gz)
- [Live app lifecycle checks](lifecycle.json.gz)

The local lifecycle run used the real app-profile WASM from the successful Pages build of `55067cc`. The Rust inputs and build scripts are unchanged in the published source. Its deployment URL and SHA-256 are in the manifest. CI builds WASM from source before running the repository and browser checks.

Use a separate checkout of `92f0b21` to reproduce the recorded comparisons with their original baseline and source. See the [harness instructions](../../../tools/react-board-performance/README.md) for setup and commands; the current harness follows the newer main baseline described above. The browser scripts accept `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when Chromium is installed outside Playwright's cache. CI uses its installed Playwright browser and functional checks rather than timing thresholds.

These results come from one headless Linux browser environment. They do not measure a physical phone, startup, network delay, complete application latency, raster completion, or display latency. Ordinary moves remain immediately durable; elapsed time alone is checkpointed, so an abrupt process exit can lose time since the last checkpoint.
