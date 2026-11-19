# Sudoku engine roadmap

The engine serves players, learners, and puzzle authors. Players need several hints that are easy to find. Learners need explanations that they can follow on the grid. Authors need exact validation, repeatable generation, and ratings under a named technique order.

This roadmap defines priorities and completion criteria. The [TODO](SUDOKU_ENGINE_TODO.md) records implementation work. The [engine guide](crates/engine/README.md) describes the available APIs.

## Existing-variant quality priority

Inequality New Puzzle is released through [PR 306](https://github.com/coder13/sudoku-app/pull/306). Prioritize quality across existing 9×9 variants in [281](https://github.com/coder13/sudoku-app/issues/281), using the [review inventory](SUDOKU_VARIANT_USABILITY_AUDIT.md).
Review rendering, combined-rule fidelity, hints, Technique Finder, solutions and complete player flows.
Share actual app screenshots for user approval before merging broader visual changes. Keep additional variant rollouts in the backlog during this review.

## Current integration state

This 9×9 inventory uses main at `bb2458a`. All 27 native rule types plus Jigsaw layouts have app acceptance and UI: twenty-eight named variants plus Classic. New Puzzle offers twenty-five variants plus Classic. XV, Two-cell sums and Quadruple still need recipes and stay in the backlog during the quality review. Sized Sudoku and standalone puzzle families have separate inventories.

The [current parity inventory](SUDOKU_ENGINE_UI_PARITY.md) records each release and its validation. Capability packaging, mixed rules, earlier performance work and revised teaching remain integrated. Preserve the original R&D worktree and its unpublished development changes for later audited ports.

| Work | State | Next integration step |
| --- | --- | --- |
| Classic solving, scoring, proofs, hints, generation, and browser worker | In main | Preserve the public contracts and versioned ratings |
| Between, Region Sum, Clone, Sandwich, Little Killer, X-Sums and Skyscrapers app flows | In main through PRs 190, 193, 195, 199, 203, 206 and 208 | Preserve complete source definitions, combined rules, visible clues, history/sharing, several hints, exact solutions and honest human paths. Every family includes calibrated New Puzzle. Keep remaining source/human gaps in [7](https://github.com/coder13/sudoku-app/issues/7), [192](https://github.com/coder13/sudoku-app/issues/192) and [202](https://github.com/coder13/sudoku-app/issues/202). [Inventory and audits](SUDOKU_ENGINE_UI_PARITY.md) |
| New Puzzle coverage for older playable families | Ten of the original thirteen families are released, most recently Renban through [PR 269](https://github.com/coder13/sudoku-app/pull/269) and Inequality through [PR 306](https://github.com/coder13/sudoku-app/pull/306) | XV, Two-cell sums and Quadruple remain in [189](https://github.com/coder13/sudoku-app/issues/189), behind the current quality review. Preserve checked levels, fresh/fallback calls, unique rule-dependent results, several hints, complete generated replays, persistence and exclusions. [Inequality release and limits](SUDOKU_INEQUALITY_GENERATION_AUDIT.md). |
| Alternate witness order for dense Pattern Overlay support | In main through [PR 182](https://github.com/coder13/sudoku-app/pull/182) | Preserve the original quick path, complete support, full-scope witnesses and exhaustive fallback. The saved empty HCHW scan falls from 61.2–62.8 seconds to 18.9–26.0 ms; nearby warmed controls stay close to baseline. Retain all five positive widths and the slower CJhv rating control under [issue 88](https://github.com/coder13/sudoku-app/issues/88). [Issue 179](https://github.com/coder13/sudoku-app/issues/179) · [Measured package/memory costs](SUDOKU_OVERLAY_SUPPORT_AUDIT.md) |
| Packed guardian checks for Tridagon refutations | In main through [PR 150](https://github.com/coder13/sudoku-app/pull/150) | Preserve complete proofs and fresh artifact controls; continue the remaining expert rating, hint and worker audit in [issue 88](https://github.com/coder13/sudoku-app/issues/88) |
| Rectangle graph reuse across variant inference techniques | In main through [PR 180](https://github.com/coder13/sudoku-app/pull/180) | Preserve exact board/mask provenance, completed empty results, published positive proofs and traversal order. Retain A2s7/CJhv exact controls and the four-domain Quadruple guard. HCHW app rating falls about 31% in the broad paired run; keep package/memory costs explicit and the separate overlay search in [issue 179](https://github.com/coder13/sudoku-app/issues/179). [Final measurements](SUDOKU_RECTANGLE_GRAPH_AUDIT.md) |
| Cached source domains in forcing branches | In main through [PR 166](https://github.com/coder13/sudoku-app/pull/166) | Preserve complete proofs, rollback and scoring version 8. Hyk5 app rating falls to 798 ms and 63Jk to 3.67 s. Continue empty searches and real worker costs in [issue 88](https://github.com/coder13/sudoku-app/issues/88). Keep the separate human reasoning gaps in [issue 162](https://github.com/coder13/sudoku-app/issues/162). [Measurements and memory costs](SUDOKU_FORCING_PERFORMANCE_AUDIT.md) |
| Modular repeating groups, mixed imports and app help | In main through [PR 176](https://github.com/coder13/sudoku-app/pull/176) | Preserve independent paths, short walks, repeated references and all three complete controls. Keep the six companion/grid gaps explicit, including exact difference-three circles in [issue 85](https://github.com/coder13/sudoku-app/issues/85). Extend HCHW’s human path in [issue 175](https://github.com/coder13/sudoku-app/issues/175); rectangle graph reuse is released through [PR 180](https://github.com/coder13/sudoku-app/pull/180). [Sources, package costs and measurements](SUDOKU_MODULAR_AUDIT.md) |
| Global Entropy coverage, exact rules, 24-point proofs and mixed app play | In main through [PR 173](https://github.com/coder13/sudoku-app/pull/173) | Preserve all 64 areas, diagonal repeat safety, original clue indices and exact enforcement with disabled techniques. Keep the two Quadruple paths explicit in [issue 172](https://github.com/coder13/sudoku-app/issues/172), authored-rule gaps in [issue 168](https://github.com/coder13/sudoku-app/issues/168)/[issue 169](https://github.com/coder13/sudoku-app/issues/169), and live viewport review open. Easy/Medium New Puzzle and bounded history recovery are released through [PR 220](https://github.com/coder13/sudoku-app/pull/220). [Sources, package costs and measurements](SUDOKU_GLOBAL_ENTROPY_AUDIT.md) |
| Quadruple and Odd/Even coordinate transforms | In main through [PR 171](https://github.com/coder13/sudoku-app/pull/171) | Move every clue with the givens. Check all eight square transformations against independent published completions and exact Wasm results for each new family. |
| Entropic independent paths, closed walks and group proofs | In main through [PR 163](https://github.com/coder13/sudoku-app/pull/163) | Preserve complete Ksy3 companions, repeated references and full/partial human paths. Research Hyk5/Hafj in [issue 162](https://github.com/coder13/sudoku-app/issues/162), and continue rating/hint costs in [issue 88](https://github.com/coder13/sudoku-app/issues/88). Medium New Puzzle and private identity repairs are released through [PR 222](https://github.com/coder13/sudoku-app/pull/222). Live viewport review remains open. [Measurements and limits](tests/fixtures/README.md#entropic-lines-native-and-app-integration) |
| Renban connected sets, original paths and mixed-rule play | In main through [PR 157](https://github.com/coder13/sudoku-app/pull/157) | Preserve independent layers, exact completions and full/partial human paths. Research the stalled BSms path in [issue 158](https://github.com/coder13/sudoku-app/issues/158). Keep live viewport review open. Preserve Medium New Puzzle, private history repairs and complete-source controls through [PR 269](https://github.com/coder13/sudoku-app/pull/269). Track broader completion diversity in [262](https://github.com/coder13/sudoku-app/issues/262). [Measurements and limits](tests/fixtures/README.md#renban-app-integration) |
| General adjacent totals, including Roman XV meaning 15 | In main through [PR 153](https://github.com/coder13/sudoku-app/pull/153) | Preserve complete sources, negative-rule exemptions, proof provenance and exact generation targets. Finish live viewport review and New puzzle calibration. [Measurements and limits](tests/fixtures/README.md#general-adjacent-totals) |
| XV clues, independent negative flags, Coach sums and mixed-rule play | In main through [PR 148](https://github.com/coder13/sudoku-app/pull/148) | Preserve published complete/partial paths and companion rules; review live viewports, calibrate app presets and continue remaining performance work under [issue 88](https://github.com/coder13/sudoku-app/issues/88) |
| Sparse validation, hint paging, worker isolation, and batched singles | In main through [PR 100](https://github.com/coder13/sudoku-app/pull/100) | Preserve the measured improvements while extending the same app flows to every built-in variant |
| Additional completion witnesses for exhaustive variant hints | In main through [PR 107](https://github.com/coder13/sudoku-app/pull/107) | Preserve complete proofs, bounded probes and smaller profiles while measuring the remaining expert searches |
| Windoku | In main through [PR 93](https://github.com/coder13/sudoku-app/pull/93) | Maintain its import, play, save, hint, and generation coverage |
| Mixed rules across released native families | Foundation in [PR 95](https://github.com/coder13/sudoku-app/pull/95), expanded by later family integrations | Preserve full rules, regions and source indices across the complete player flow. Retain fixed-clue combination regressions and extend them with each family in [87](https://github.com/coder13/sudoku-app/issues/87). |
| Built-in variant hint and solution access | In main through [PR 98](https://github.com/coder13/sudoku-app/pull/98) and [PR 102](https://github.com/coder13/sudoku-app/pull/102) | Preserve visible controls, valid candidate assumptions, and independent workers in standard, advanced, and mobile play |
| Quadruple circles, proofs, imports, and teaching | In main through [PR 104](https://github.com/coder13/sudoku-app/pull/104) | Preserve repeated occurrences and combined clues; finish live mobile viewport review and calibrate generation recipes before offering app presets |
| Odd/Even markers, imports, proofs, practice and New Puzzle | In main through [PR 106](https://github.com/coder13/sudoku-app/pull/106) and [PR 214](https://github.com/coder13/sudoku-app/pull/214) | Preserve original/mixed sources, marker-specific help, calibrated Easy/Medium recipes, independent proof replays and played-puzzle exclusions. Live browser viewport review remains separate from verified static/component controls. [Generation and measurement audit](SUDOKU_PARITY_GENERATION_AUDIT.md) |
| Anti-King imports, corner peers, proofs, practice and New Puzzle | In main through [PR 108](https://github.com/coder13/sudoku-app/pull/108) and [PR 210](https://github.com/coder13/sudoku-app/pull/210) | Preserve corner feedback, combined rules, checked Easy/Medium recipes, complete independent replays and played-puzzle exclusions. [Generation and measurement audit](SUDOKU_ANTI_KING_GENERATION_AUDIT.md) |
| Consistent cell naming in hints and solutions | In main through [PR 110](https://github.com/coder13/sudoku-app/pull/110) | Preserve typed display context, lesson defaults and preference changes without new engine work |
| Non-Consecutive imports, edge exceptions, proofs and New Puzzle | In main through [PR 112](https://github.com/coder13/sudoku-app/pull/112) and [PR 212](https://github.com/coder13/sudoku-app/pull/212) | Preserve mixed white-dot exceptions, versioned profiles, checked Easy/Medium recipes and given bounds. Maintain full binary/exclusion replays and exclusions. [Generation and measurement audit](SUDOKU_NON_CONSECUTIVE_GENERATION_AUDIT.md) |
| Pattern Overlay support witnesses | In main through [PR 114](https://github.com/coder13/sudoku-app/pull/114) | Preserve bounded probes, geometry, complete proofs and the exact fallback; review latency, memory and package cost together |
| Non-Consecutive locks and candidate alternatives | In main through [PR 115](https://github.com/coder13/sudoku-app/pull/115) | Preserve versioned profiles, complete alternatives and independent case checks; expand training against published positions |
| Complete geometric candidate support | In main through [PR 118](https://github.com/coder13/sudoku-app/pull/118) | Preserve bounded support, singleton and uniqueness safety. Retain the broader expert-search and worker audit in [issue 88](https://github.com/coder13/sudoku-app/issues/88) |
| Earlier bounded uniqueness eligibility | In main through [PR 124](https://github.com/coder13/sudoku-app/pull/124) | Preserve complete proofs and cheap selected searches. Retain the broader detector and timing audit in [issue 88](https://github.com/coder13/sudoku-app/issues/88) |
| Shared partial geometric witnesses | In main through [PR 128](https://github.com/coder13/sudoku-app/pull/128) | Preserve complete proofs, position-local caches and checked symmetries from [PR 131](https://github.com/coder13/sudoku-app/pull/131). Profile remaining Tridagon and worker costs |
| Checked grid and digit witnesses | In main through [PR 131](https://github.com/coder13/sudoku-app/pull/131), with PR 132 app integration | Preserve actual geometry, bounded work and unknown-case fallback. [Measured results](tests/fixtures/README.md#checked-geometric-symmetries) |
| Whispers paths, shared-house deductions and New Puzzle | In main through [PR 121](https://github.com/coder13/sudoku-app/pull/121) and [PR 216](https://github.com/coder13/sudoku-app/pull/216) | Preserve German/Dutch numeric presets, custom/mixed minimums, closed walks, direct proofs, played-puzzle identity and complete generation/persistence flows. Keep the measured exclusion-key cost and Dutch tail explicit. Live browser review and exhaustive scans remain separate in [88](https://github.com/coder13/sudoku-app/issues/88). [Generation audit](SUDOKU_WHISPERS_GENERATION_AUDIT.md) |
| Palindrome imports, visible clues, mirrored proofs and mixed rules | In main through [PR 135](https://github.com/coder13/sudoku-app/pull/135) | Preserve Coach grouping, original segments and paired-cell explanations. Finish live viewport review and generation calibration. [Measurements and limits](tests/fixtures/README.md#palindrome-app-integration) |
| Bounded digit matching for geometric witnesses | In main through [PR 137](https://github.com/coder13/sudoku-app/pull/137) | Preserve all 112 enabled techniques, complete proofs and unknown-case fallback. [Measurements and limits](tests/fixtures/README.md#mask-constrained-digit-witnesses) |
| Tridagon eligibility and deferred proof data | In main through [PR 141](https://github.com/coder13/sudoku-app/pull/141) | Preserve complete proofs and original branch order. Continue latency and profile-specific package costs in [issue 88](https://github.com/coder13/sudoku-app/issues/88). [Measurements and limits](tests/fixtures/README.md#tridagon-eligibility-and-deferred-proof-data) |
| Inequality imports and directed signs | In main through [PR 145](https://github.com/coder13/sudoku-app/pull/145) | Preserve complete Coach companions and directed geometry. Calibrate New puzzle recipes and review live viewports. Keep FzzD's partial logical path explicit. [Measurements and limits](tests/fixtures/README.md#inequality-app-integration) |
| Sparse exact validation of Coach FzzD | In main through [PR 143](https://github.com/coder13/sudoku-app/pull/143) | Preserve public candidates, bounded hint eligibility and seeded sampling. Continue retained latency and variant-solver package costs in [issue 88](https://github.com/coder13/sudoku-app/issues/88). [Measurements and limits](tests/fixtures/README.md#exact-house-propagation-for-sparse-mixed-puzzles) |
| Earlier rule-family and shading research | Preserved on `codex/sudoku-engine-integration` | Compare its actual diff with current main, then port one complete app-ready family through [issue 35](https://github.com/coder13/sudoku-app/issues/35). |
| Proof explorer and expert lesson work | Open in [PR 14](https://github.com/coder13/sudoku-app/pull/14) | Reconcile its diff with current main and the research branch before integration |
| Uncommitted proof, technique, and lesson edits | Preserved in the original R&D worktree | Compare each change with current main and the research branch before porting it |

Mixed-rule coverage began with eight families and all 256 subsets of a representative fixed-clue fixture. Later integrations add complete source and combination controls, independent solution counts, rule-dependent uniqueness, hints, histories, persistence and sharing. Those checks establish their tested definitions and positions; they do not prove every possible clue layout or every Coach authored format. Current visual evidence includes component contracts and static light/dark narrow/wide SVG references; live browser interaction is not verified by those artifacts. Keep partial human paths, single-choice hints and incomplete scans explicit in their audits. [Fixture provenance and limits](tests/fixtures/README.md)

Research checkouts preserve work outside this release inventory. Compare each proposed port with current main and its actual callers; older test results do not establish current compatibility. Each port needs current difficulty labels, versioned scoring, proof, import, player-flow and generation checks.

## Build only the required capabilities

A Cargo feature selects code for compilation. A solver profile selects techniques and their order inside the compiled engine. An app capability describes a complete player flow. Keep these three controls separate in code, documentation, and saved data.

The current build boundaries are `variants`, `generation`, and `teaching`. The default preserves the existing Rust API. Browser builds explicitly select their features with `--no-default-features`. The [build guide](crates/engine/BUILD_FEATURES.md) describes each profile and its commands.

Classic solving, ratings, hints, and rank proofs remain one shared foundation. These functions share candidate links, proof types, and detector searches. Split another capability when a real client can omit it and measurements show a useful saving. Possible next boundaries include rank discovery, large expert detector families, and individual variant constraint families.

Every split needs an inventory of callers, an explicit dependency graph, and behavior tests for retained operations. Measure both raw and compressed Wasm size. Keep the production app on a declared profile that supports every operation it uses. A disabled technique still exists in the package unless a Cargo feature omits its implementation.

## Priorities and completion criteria

Work proceeds in this order. A correctness failure or a measured regression can move ahead of the current milestone. Keep research available in separate worktrees while each integration becomes reviewable.

Usable help for the variants already offered by the app comes before another rule family. Engine support alone does not complete this requirement. Each offered difficulty needs several sound hint choices when available, selectable technique proofs, and a complete solution walkthrough from the givens. Check the actual workspace controls as well as the worker APIs. Cache keys must include the full puzzle rules and regions, and background scans must leave requested hints responsive.

New rule families also need New Puzzle access with independently verified recipes before full app integration. Prioritize the existing generation backlog and rules that close documented complete-source gaps. Keep unshipped research in separate worktrees. Preserve complete author context and reject unsupported semantics as a whole source; a unique completion alone cannot prove faithful import.

| Priority | Outcome | Evidence of completion |
| --- | --- | --- |
| 1. Finish integration | Existing families work throughout the app and New Puzzle | Full parameters survive import, preview, play, hints, persistence and sharing; actual fresh/fallback generation gives independently unique, rule-dependent puzzles with complete advertised-level paths and played-puzzle exclusions |
| 2. Complete Coach interchange | Every supported Coach puzzle preserves its meaning | Real export fixtures cover each rule, mixed rules, negative markers, regions, encoded formats, and links |
| 3. Improve hint choices | Players receive several distinct, easy-to-find moves | Held-out positions compare the returned choices, proof complexity, and request latency |
| 4. Stabilize ratings | Scores describe a reproducible logical path | Results include the scoring version and technique order, with comparisons across a fixed corpus |
| 5. Improve performance and packaging | Clients pay for the capabilities they use | Repeatable size, latency, memory, and generation-yield measurements support each change |
| 6. Expand research coverage | New techniques or rules solve a documented gap | Published examples, independent truth checks, near misses, bounded searches, and usable proofs pass |

The Global Entropy source audit adds a stricter interchange requirement: complete encoded constraints do not always contain the author’s complete rules. LEjN omits forbidden spiral connections, 7nms stores mathematical order clues as cosmetic text, and K95q omits a stated negative black-dot flag. A future short-link resolver must retain author context and reject mathematical content it cannot express. Uniqueness and a custom-rule flag cannot establish completeness. Track these gaps in [issue 168](https://github.com/coder13/sudoku-app/issues/168), [issue 169](https://github.com/coder13/sudoku-app/issues/169) and [issue 7](https://github.com/coder13/sudoku-app/issues/7).

The import work remains open in [issue 7](https://github.com/coder13/sudoku-app/issues/7). The rule integration queue remains open in [issue 35](https://github.com/coder13/sudoku-app/issues/35). The performance audit remains open in [issue 88](https://github.com/coder13/sudoku-app/issues/88).

## Workstream ownership

Agent A owns 9×9 grids, variants, imports, hints, solutions, generation, scoring and performance. Before starting an issue, Agent A comments “agent A is picking this up” with the concrete scope. Current integration work stays in separate worktrees and merges one family at a time.

Agent B claimed non-9×9 work in [224](https://github.com/coder13/sudoku-app/issues/224). Its queue includes [6×6](https://github.com/coder13/sudoku-app/issues/230), [8×8](https://github.com/coder13/sudoku-app/issues/231), [12×12](https://github.com/coder13/sudoku-app/issues/232) and [16×16](https://github.com/coder13/sudoku-app/issues/233). Shared wire formats, dispatch and registries require coordination. Preserve the existing 9×9 backend and its performance contracts during sized-grid integration.

## Requested source: Algebraic Cages I

The user requested [Algebraic Cages I by zainasaur20](https://sudokupad.app/babxk5ixus) for the roadmap. It combines standard 4×4 Sudoku with nonrepeating cages whose totals share a positive integer `x`. The authored labels are `x`, `x+1` and `x-5`. Independent enumeration finds one solution among all 288 standard completed grids, with `x = 6`. [Complete source, coordinates and proof](SUDOKU_ALGEBRAIC_CAGES_RESEARCH.md).

| Planned capability | Scope and dependency | Completion evidence |
| --- | --- | --- |
| [Sized single grids, starting with 4×4](https://github.com/coder13/sudoku-app/issues/224) | Versioned size/digit/region model, starting with digits 1–4 and 2×2 boxes; preserve existing 9×9 contracts | Independent completed-grid counts, correct masks/coordinates, applicable techniques and complete app/help/storage/generation flows |
| [Algebraic Killer Cages](https://github.com/coder13/sudoku-app/issues/225) | Shared positive-integer variables and expression totals; this complete source depends on sized-grid support | Exact digit-plus-variable counting, independent cage/bound proofs, authored expression rendering and preservation, several hints, complete replay and checked generation |

Agent B owns the sized-grid foundation in parallel with Agent A’s 9×9 generation work. Build the sized single-grid foundation before releasing this combined source. Variables are not restricted to Sudoku digits: this puzzle uses 1–4 but requires `x = 6`. Preserve expressions and shared bindings through native/Wasm APIs, import/export, accessibility, persistence and scoring evidence. Require performance and package measurements before integration. Both additions remain planned and unsupported by the shipping profile.

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

Entropic and Modular Lines share one private six-order support kernel with separate fixed digit partitions. Preserve their original walks, independent source segments and phase-aware equal-digit exclusions. Global Entropy’s four-cell coverage table is private to its rule module. Reuse its group-membership primitive when a second family needs the same operation, after that family has independent rule/proof controls and a complete app representation. Keep group coverage separate from equal-digit peers, exact enforcement separate from enabled human techniques, and placed-digit Pencil cleanup separate from unexplained candidate deductions. A complete nine-house Disjoint Groups layout can share its existing typed houses while using an accurate global presentation.

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
