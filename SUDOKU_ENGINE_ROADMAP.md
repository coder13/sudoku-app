# Sudoku engine roadmap

The engine serves players, learners, and puzzle authors. Players need several hints that are easy to find. Learners need explanations that they can follow on the grid. Authors need exact validation, repeatable generation, and ratings under a named technique order.

This roadmap defines priorities and completion criteria. The [TODO](SUDOKU_ENGINE_TODO.md) records implementation work. The [engine guide](crates/engine/README.md) describes the available APIs.

## Current integration state

This inventory uses main at `1c0e2a2`, the Windoku merge. The foundation from `codex/sudoku-engine-rd` is an ancestor of that commit. The original worktree still contains development changes that must remain available.

| Work | State | Next integration step |
| --- | --- | --- |
| Classic solving, scoring, proofs, hints, generation, and browser worker | In main | Preserve the public contracts and versioned ratings |
| Windoku | In main through [PR 93](https://github.com/coder13/sudoku-app/pull/93) | Maintain its import, play, save, hint, and generation coverage |
| Mixed rules in existing app-supported families | In progress on `codex/sudoku-combined-rules` | Finish import, display, persistence, and combined-rule regressions in [issue 87](https://github.com/coder13/sudoku-app/issues/87) |
| Additional rule families and shading | Research on `codex/sudoku-engine-integration` | Port one app-ready family from current main through [issue 35](https://github.com/coder13/sudoku-app/issues/35) |
| Proof explorer and expert lesson work | Open in [PR 14](https://github.com/coder13/sudoku-app/pull/14) | Reconcile its diff with current main and the research branch before integration |
| Uncommitted proof, technique, and lesson edits | Preserved in the original R&D worktree | Compare each change with current main and the research branch before porting it |

The research branch contains five commits beyond its common history with this main snapshot. It also predates changes to the ten difficulty levels. Its earlier test results do not establish compatibility with current main. Each port needs current scoring, proof, import, and app tests.

## Build only the required capabilities

A Cargo feature selects code for compilation. A solver profile selects techniques and their order inside the compiled engine. An app capability describes a complete player flow. Keep these three controls separate in code, documentation, and saved data.

The current build boundaries are `variants`, `generation`, and `teaching`. The default preserves the existing Rust API. Browser builds explicitly select their features with `--no-default-features`. The [build guide](crates/engine/BUILD_FEATURES.md) describes each profile and its commands.

Classic solving, ratings, hints, and rank proofs remain one shared foundation. These functions share candidate links, proof types, and detector searches. Split another capability when a real client can omit it and measurements show a useful saving. Possible next boundaries include rank discovery, large expert detector families, and individual variant constraint families.

Every split needs an inventory of callers, an explicit dependency graph, and behavior tests for retained operations. Measure both raw and compressed Wasm size. Keep the production app on a declared profile that supports every operation it uses. A disabled technique still exists in the package unless a Cargo feature omits its implementation.

## Priorities and completion criteria

Work proceeds in this order. A correctness failure or a measured regression can move ahead of the current milestone. Keep research available in separate worktrees while each integration becomes reviewable.

| Priority | Outcome | Evidence of completion |
| --- | --- | --- |
| 1. Finish integration | Existing rules work together throughout the app | Full rule parameters survive import, preview, play, hints, save/reload, and sharing |
| 2. Complete Coach interchange | Every supported Coach puzzle preserves its meaning | Real export fixtures cover each rule, mixed rules, negative markers, regions, encoded formats, and links |
| 3. Improve hint choices | Players receive several distinct, easy-to-find moves | Held-out positions compare the returned choices, proof complexity, and request latency |
| 4. Stabilize ratings | Scores describe a reproducible logical path | Results include the scoring version and technique order, with comparisons across a fixed corpus |
| 5. Improve performance and packaging | Clients pay for the capabilities they use | Repeatable size, latency, memory, and generation-yield measurements support each change |
| 6. Expand research coverage | New techniques or rules solve a documented gap | Published examples, independent truth checks, near misses, bounded searches, and usable proofs pass |

The import work remains open in [issue 7](https://github.com/coder13/sudoku-app/issues/7). The rule integration queue remains open in [issue 35](https://github.com/coder13/sudoku-app/issues/35). The performance audit remains open in [issue 88](https://github.com/coder13/sudoku-app/issues/88).

## Keep hint ease separate from puzzle points

Puzzle points describe a completed path under a selected technique order. A hint score describes the effort of finding and understanding one proof in the current position. These scores answer different questions and need separate calibration. Removing more candidates does not establish that a hint is easier to find.

Preserve several distinct moves and use stable ordering for equal scores. Record the cheapest valid proof for each move. Compare technique cost, cells and houses to inspect, chain length, branching, and proof assumptions against worked human explanations. Evaluate placement progress as a separate experiment with an explicit policy.

A hint response must distinguish fewer available choices from a budget-limited scan. A stalled logical path must remain distinct from an impossible puzzle. Exact search must keep separate outcomes for conflict, no solution, a unique solution, multiple solutions, and exhausted search.

## Keep ratings and generation reproducible

Persist the scoring version, technique order, active rules, and search configuration with comparisons. Change the scoring version when point costs, difficulty boundaries, or default path behavior changes. Compare ratings on fixed easy, sparse, expert, and mixed-rule puzzle sets. Keep human difficulty claims separate from the exact solution count.

Generation can target givens, score ranges, technique use, and an exclusive opening. Return exhausted searches honestly. A verified 17-given template can produce equivalent puzzles through valid transformations. That result does not demonstrate fresh discovery of a new 17-given puzzle.

Measure rating and uniqueness work separately from the total generation search. Reuse compiled rules, proven templates, or candidate state when correctness permits. Add a pruning table or cache only after a profile identifies the repeated work and a benchmark demonstrates the benefit. Include memory cost and cache invalidation in that comparison.

## Preserve the architecture

Each layer owns one source of truth. Rule enforcement remains active when a solver profile disables a technique that explains that rule. Technique proofs remain specific enough for the app to display and replay them.

| Layer | Responsibility | Current location |
| --- | --- | --- |
| Puzzle and position model | Givens, placements, removals, rule definitions, regions, format validation | `lib.rs`, `position.rs`, `variant.rs`, `variant/wire.rs` |
| Constraint and exact search | Legal candidates, shared houses and peers, satisfiability, solution counting | `lib.rs`, `variant/search.rs`, rule modules |
| Detectors and proofs | Sound deductions with named evidence and explicit assumptions | `hints.rs`, `patterns/`, `proofs.rs`, `rank/`, `variant/logical.rs` |
| Policies | Ordered solving, score totals, ranked hints, generation targets | `logical/`, `generation/`, `variant/generation/` |
| Host interface | Stable requests, capability reporting, errors, search budgets | `protocol/`, Wasm exports |
| App integration | Worker scheduling, preferences, import/export, display, accessibility | `src/sudoku/`, `src/components/` |

Prefer shared constraint primitives when several rule families need the same operation. Keep specialized optimizations behind the same validated behavior. Introduce another crate when an ownership or distribution boundary justifies it. Preserve one deterministic, testable engine across native and Wasm hosts.

The research branch also models shading alongside digits. A domain is a set of allowed values. Keep digit domains and shade domains separate, and require each proof to identify the domain that it changes. Add shared model features when multiple published puzzles need them, such as connectivity or linked unknown clue values.

A new domain needs a versioned format, exact validation, proof replay, and a complete app representation. Keep its code outside the shipping app profile until that representation is ready. Treat larger grids and linked grids as separate model proposals with their own compatibility and performance evidence.

## Evaluate an addition before implementing it

Start each addition with a tracked issue and a concrete gap. Record the fixture, expected result, and current behavior. Use this proposal template:

1. Describe the player or author task that fails today.
2. Name the source puzzle, rule specification, or worked proof and its provenance.
3. State the proposed rule, detector, or policy change and why existing primitives cannot express it.
4. Define the expected placements, removals, conflict outcomes, and assumptions.
5. Identify the public APIs, build capabilities, formats, and scoring versions that the change affects.
6. Record the time, memory, size, and search budgets to measure before and after the change.
7. List the app rendering, explanation, accessibility, persistence, and sharing work needed for release.
8. State the completion criteria and the remaining research limits.

## Release one complete addition at a time

A rule enters main with its complete app flow. A new deduction enters main with a proof that existing or new renderers can explain. Keep experimental rules and incomplete teaching work in research branches. Preserve their fixtures so that later ports remain reproducible.

Tests assert the intended Sudoku behavior. Include independent positive examples, near misses that break a necessary premise, malformed definitions, and interactions with other rules. Check deductions against known solutions or independent constraint checks. Test the public requests, trace replay, persistence, and actual Wasm artifact.

Run the capability matrix for a build-boundary change. Run the production app build for a shipping integration. Compare warmed and cold latency, p95 latency, size, and memory on the same hardware where applicable. For generation, also compare success rate, attempts, and distinct puzzle yield under equal budgets.

Merge a focused change after its checks pass. Update the TODO and its issue as the work finishes. Record the merged commit and any limits in the issue. Recheck the next addition against current main before starting its port.
