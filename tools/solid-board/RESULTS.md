# First board comparison

Measured on 20 November 2026. **Improve the React board before committing to a framework migration.** Solid reduced selection update time in this run. The focused React prototype matched or beat Solid for candidate and digit edits. This Solid implementation was slower on dense highlights.

These are results from the three implementations in this prototype, not a general ranking of React and Solid.

## Mobile viewport with 4x CPU throttling

Each cell gives median / p95 DOM update time in milliseconds. Lower is better. This is desktop Chromium with a 390 x 844 viewport and CPU throttling, not a physical phone.

| Action | Current React | Memoized React | Solid 2.0.3 |
| --- | ---: | ---: | ---: |
| Selection | 6.10 / 12.80 | 5.20 / 8.82 | 4.10 / 6.20 |
| Candidate notes | 6.00 / 9.01 | 2.00 / 3.40 | 2.20 / 4.30 |
| Digit entry | 5.85 / 9.91 | 1.90 / 2.90 | 2.30 / 3.61 |
| Dense highlights | 10.75 / 14.43 | 10.90 / 15.21 | 14.05 / 20.62 |

Solid's median selection update took about 33% less time than the current board and 21% less than the focused React board. The focused React board took about 67% less time than the current board for candidate notes and 68% less for digit entry. Solid's dense highlight update took about 31% more time than the current board.

The dense fixture has all 729 candidate notes. It is a stress test, not a typical puzzle state.

## Desktop

Same metric, with a 1440 x 1000 viewport and no CPU throttling.

| Action | Current React | Memoized React | Solid 2.0.3 |
| --- | ---: | ---: | ---: |
| Selection | 1.40 / 2.20 | 1.30 / 2.51 | 1.00 / 1.50 |
| Candidate notes | 1.40 / 2.11 | 0.50 / 0.70 | 0.50 / 0.90 |
| Digit entry | 1.40 / 1.90 | 0.50 / 0.80 | 0.60 / 0.81 |
| Dense highlights | 2.30 / 4.20 | 2.10 / 2.91 | 2.60 / 4.40 |

Desktop selection and edit results all reached the next frame callback at roughly 17 ms. Lower DOM update times did not establish a visible improvement in animation smoothness.

## Method and checks

- Production build, React 19.3.1, Solid and `@solidjs/web` 2.0.3, Chromium 153.0.8010.0.
- Four workloads, three implementations, two profiles, and three rounds. Each round discarded 20 warmup actions and measured 60 actions per workload and implementation.
- 4,320 measured actions in total. Implementation order rotated between rounds. Only one board was mounted at a time.
- All 5,832 board snapshot checks passed. A separate normal-motion run passed 147 checks, including retained exit marks, cleanup, colors, and synchronous changes that reverse before commit.
- Pointer input, digit entry, clearing, arrow navigation, and active-cell focus also passed manual scripted checks for all three boards. Desktop and mobile screenshots were inspected.

DOM update time starts at a shared programmatic click and ends at a MutationObserver callback that sees the expected DOM. It includes shared state handling, toolbar changes, and framework scheduling. The [README](README.md) explains the full method.

## What this supports

The next step is to apply stable cell inputs and memoized cell rendering to the full React board, preserve its variant and teaching features, then measure that version. This experiment supports testing that smaller change before a migration.

The two focused boards support fewer features than the production Board. Their gains against the current board include the effects of that smaller implementation. They do not prove that adding `React.memo` alone would produce these gains in the full app.

The timing run used reduced motion. Normal-motion checks verified behavior, not animation frame rates. Programmatic clicks exclude hardware input delay. The next-frame metric is not paint latency or INP, and it also includes readiness-probe work before the frame callback. No conclusion about physical-phone smoothness, GPU work, solver speed, startup size, battery use, or a more native feel follows from this run.

This is one session on one host. The raw report retains every sample and each round's median. Repeat on target devices before treating small differences as reliable.

## Evidence and reproduction

- [Summary and environment](results/summary-2026-11-20.json)
- [Complete raw report, gzip](results/baseline-2026-11-20.json.gz)
- [Desktop screenshot](results/baseline-2026-11-20-desktop.png)
- [Mobile screenshot](results/baseline-2026-11-20-mobile.png)
- [Normal-motion screenshot](results/baseline-2026-11-20-motion.png)

The measured local commit was `d18f188464b6177b17d7f6711e15f9ad434f2b3f`. The published source commit is [f0bca286](https://github.com/coder13/sudoku-app/commit/f0bca2865c3de6147f8c634262c688d355445b7e). Both have the identical source tree `4605b3339fd9a3eefece9364f35d300f0e040d49`. The raw report preserves the original commit and source file hashes.

From `tools/solid-board`, after installing dependencies and Chromium:

```sh
npm run build
npm run benchmark -- --screenshots --output results/latest.json
```

The measured run used the same command with an explicit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium` and a dated output path. See the README for browser setup and all options.
