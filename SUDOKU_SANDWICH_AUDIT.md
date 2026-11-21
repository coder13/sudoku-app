# Sandwich app integration

Worktree base: main `4b8cff4`. Native Sandwich solving, proofs, teaching, rating and generation already exist. This integration changes the app boundary and presentation. Rust, lockfiles and the app Wasm are unchanged.

## Sources and semantics

A Sandwich total is the sum strictly between the unique 1 and 9 in a full row or column. The two endpoint digits do not contribute. Either order is valid. Zero means adjacent endpoints. Unmarked rows and columns have no additional total. Direction preserves which grid edge contains the printed clue, even though reversing a Sandwich ray does not change its numeric condition.

| Complete source | Givens / Sandwich clues | Checked completion | App-order human path |
| --- | --- | --- | --- |
| Bill Murphy, [American Food](https://www.gmpuzzles.com/blog/2025/10/sandwich-sudoku-by-bill-murphy/), 2025-10-21 | 16 / 8 | Independent unique, one search node | Hard, 2,564 points, 87 steps |
| Philip Newman, [Leftovers](https://www.gmpuzzles.com/blog/2025/11/sandwich-sudoku-by-philip-newman/), 2025-11-30 | 24 / 9 | Independent unique, one search node | Hard, 1,886 points, 76 steps |
| CaroBaro, [Thermo Sandwich](https://sudoku.coach/en/s/9VLq) | 0 / 13, plus seven thermometers | Independent unique, seven search nodes | Very Hard, complete at 5,942 points in 163 steps with Thermometer and house |

The GMP fixtures preserve original grid/solution PDF links, their SHA-256 hashes, every printed given and outside total, and the printed completions. Both PDFs were rendered and checked. The Coach fixture preserves the complete original SCv7 code, decoded typed payload, published solution and metadata. No companion rule is removed. Removing Sandwich from any of these three controls produces multiple independent solutions.

The current Coach compiler uses empty segment `cells` and parameters `{side, index, value}`. Index is zero based and value is an integer from 0 through 35. All four sides are decoded into ordered native rays. The inspected official compiler is `https://sudoku.coach/js/jCfXtZs-1776367508519.js`, SHA-256 `567c7f9023cfff3a7f8feb4f8393d3b10a1f85f9539ef48f31c577b105ad521f`. Its Sandwich constructor and constraint builder confirm this mapping. Unknown semantic parameters, malformed rays, empty typed clues and unsupported outside-level settings fail explicitly.

An additional Jigsaw/Killer control derives four outside totals from the repository's independently solved Jigsaw/Killer benchmark. It is an authored regression control, not a published added-clue puzzle. It preserves all irregular regions and cages and its independently unique completion.

Terrain [D8HP](https://sudoku.coach/en/s/D8HP) remains an explicit negative control in [issue 196](https://github.com/coder13/sudoku-app/issues/196). Its colors change cell values, and its custom Sandwich rule chooses a maximum over multiple transformed endpoint pairs. Its complete payload and published description are retained. The standard importer continues to reject it. Likewise, the authored lettering and cosmetic clues in Coach ALYC are not silently converted into an ordinary numeric puzzle. Broader interchange remains in [issue 7](https://github.com/coder13/sudoku-app/issues/7).

## App behavior

- Strict native puzzle acceptance preserves each full ordered ray, direction and zero total through import, save, reload, sharing and square transforms. Companion rules and Jigsaw layouts retain their original meaning.
- The grid frame reserves separate cell-sized gutters on the required edges. Coordinates remain outside those gutters. Totals have accessible descriptions identifying their row or column; repeated clues at one position use separate lanes. Hidden coordinate guides preserve clues. Teaching crops expand to the full grid so a row or column clue never appears to constrain only a cropped fragment.
- Candidate buttons, cage/Clone caption insets, advanced candidate links and pointer cell coordinates remain local to the nine-by-nine grid. Static clue SVG renders were checked at 290px and 540px in light and dark themes. SSR exercises complete desktop/mobile compositions. This is static visual and contract validation, not a live browser interaction audit.
- Local input support enumerates possible endpoint positions and the 128 subsets of digits 2–8. It computes exact support from placed digits and a single row/column total without importing human candidate deductions. Impossible totals and repeated row digits identify conflicting placements. Individual and bulk input clean both Pencil modes; undo/redo restores their previous state. House-only masks remain separate for proof replay.
- App hint descriptions identify the covered row/column endpoints, printed total, excluded 1/9 and zero behavior. Multiple ordinary hints, selected Sandwich proofs, Finder action counts, retained collections, complete source solutions, disabled human techniques and explicit removals use the existing worker APIs.
- Existing Learn and all three practice examples now draw actual outside clues. Direct independent row permutations replay the domains cited by Sandwich proofs and verify their proposed actions. Fresh practice and incorrect solution-digit removals are checked.

Independent tests compare the local subset calculation against all 362,880 row permutations, grouped by all 36 totals, across varied partial rows and contradictory placements. A separate numeric oracle uses direct digit-set search and row assignment enumeration; it does not call native candidates, support tables, rating or search. Completion checks read every rule directly from its public definition.

## New Puzzle generation

Sandwich appears in New Puzzle with Hard, the level verified under the current 76-point native technique cost. Three bounded fallback recipes use the two published fixed layouts and completions. These are fresh clue-removal puzzles from fixed constraint layouts, not unconstrained construction of new outside-clue patterns.

Native calibration accepts twenty of twenty one-attempt Hard candidates per published template within 20,000 nodes. Murphy candidates have thirty givens; Newman candidates have twenty-nine or thirty. All forty are distinct within their source, independently unique and need Sandwich. The actual app New Puzzle path checks twenty distinct independently unique, Sandwich-dependent Hard puzzles. Repeats are deterministic; played puzzles, mixed aliases, reordered clues and square symmetries are excluded through the existing native exclusion mechanism.

## Validation and performance

Focused contracts pass: six import/input/math tests, six component tests, twelve Wasm app-flow tests and strict TypeScript checks for the new contracts. The app component catalog covers 123 named components. Full suites pass 589 app tests and 373 Wasm contracts. The production build generates all 171 routes; three actual-build offline contracts verify every shell, precache entry and the packaged Wasm. The rebuilt local app Wasm is byte-identical to main, as are all five generated JSON files. All exact-head CI and deployment gates pass; release evidence follows below.

The original research order placed Full House before Hidden Single (Box); the actual app order reverses those first two techniques. All remaining techniques match. Using the actual app order gives the Coach score of 17,026 consistently through direct protocol and app worker calls. The research score of 16,846 describes a different order, not the shipping app profile.

The current Play order uses the 64-point Thermometer and house technique before higher-tier deductions. It reaches the same published grid in 163 steps. The table below retains the original measurements from the 17,026-point path. [Thermometer and house replay and paired timings](SUDOKU_VARIANT_USABILITY_AUDIT.md#thermometer-deductions-with-a-shared-house)

### Controlled runtime samples

Darwin arm64, Node 26.13.0, local app Wasm SHA-256 `291a61e8b43a92921902173415725a098219e69a8582c8fa4cfc44ef926dc8f7`, 3,416,046 raw / 893,636 gzip bytes. No owned compiler, suite or other benchmark ran alongside these samples. Fast operations use five warmups/twenty samples; slow operations use two/five. Values are median/p95 milliseconds, including serialization and caller conversion. The in-process worker excludes worker startup, transfer, browser layout and paint; p95 of five is the maximum.

| Operation | Newman | Murphy | Complete Coach 9VLq |
| --- | --- | --- | --- |
| Raw candidates | 0.710 / 0.784 | 0.215 / 0.236 | 7.201 / 7.956 |
| Raw uniqueness | 1.138 / 1.243 | 0.855 / 0.910 | 26.803 / 30.304 |
| Raw exact solution | 1.136 / 1.204 | 0.892 / 1.713 | 25.615 / 26.046 |
| Native-default rating | 1.298 / 1.425 | 0.806 / 5.855 | 38.836 / 40.611 |
| Actual app-order rating | 1.596 / 2.513 | 1.252 / 1.433 | 454.116 / 469.455 |
| Raw ten hints, Medium | 1.691 / 2.206 | 56.933 / 62.105 | 147.233 / 151.794 |
| Raw exhaustive hints, Medium | 52.646 / 54.088 | 55.635 / 56.564 | 149.503 / 152.778 |
| Actual import preview with rating | 3.839 / 4.889 | 2.947 / 3.110 | 575.528 / 962.442 |
| Play candidates | 0.666 / 0.706 | 0.206 / 0.218 | 9.859 / 13.851 |
| Ordinary app hints | 2.027 / 2.896 | 55.614 / 59.859 | 319.049 / 394.590 |
| Human solution walkthrough | 3.266 / 3.426 | 2.773 / 4.887 | 465.944 / 477.740 |
| Input with both full Pencil modes | 0.105 / 0.176 | 0.107 / 0.147 | 0.200 / 0.267 |
| Grid SSR | 1.783 / 2.321 | 1.667 / 2.063 | 1.983 / 2.716 |

Ordinary app hint choices are ten/eight/eight. Raw exhaustive choices are forty-nine/eight/eight. The benchmark uses Medium for its raw hint requests; actual app hints use the imported difficulty. Retained raw-instance memory is 4,259,840 bytes after each source; these are capacity snapshots, not peak measurements.

Fixed-template generation accepts twenty of twenty distinct independently unique/Sandwich-dependent puzzles, at 13.680/16.361 ms, with six attempts and 20,000 nodes per exact check. Actual Hard New Puzzle generation measures 15.868/16.184 ms including its bounded recipe path. Generation timings exclude the independent assertion work. Slow Coach ratings, import previews, ordinary hints and Murphy hint scans are retained as follow-up work in [192](https://github.com/coder13/sudoku-app/issues/192).

### Existing-family checks and package cost

An alternating paired run compares the unchanged pre-integration shipping app against this integration on Between, Region Sum, Clone, Classic, Killer and Diagonal controls. Input positions match exactly. Each operation has ten warmups and forty samples. Input median deltas range from -0.0164 to +0.0211 ms; Region Sum increases 0.0900 to 0.1110 ms. SSR medians vary from -0.559 to +0.100 ms. Tails are noisy: Classic SSR p95 rises 3.709 to 7.173 ms and Clone 6.928 to 8.278 ms, while other controls improve. These samples do not establish a general performance gain. Full raw results are retained in the session `paired-app.json`; the added family does not change native Wasm work.

Relative to the pinned preceding shipping app, summed production `dist/client/assets` files (per-file Node gzip, default level) change JS from 6,255,947 / 2,067,557 to 6,263,040 / 2,069,934 raw/gzip bytes (+7,093 / +2,377). CSS changes from 300,068 / 41,361 to 301,232 / 41,633 (+1,164 / +272). Wasm changes by zero bytes. Service-worker and HTML files are excluded from this asset-only comparison.


## Release

[PR 199](https://github.com/coder13/sudoku-app/pull/199), reviewed head `0f04eab3641f10adf2f7109948992e461f321337`, merged into main as `57420a3d9c635b3e40674818120e821ee9030694`. Every required gate is green in [CI 44472589808](https://github.com/coder13/sudoku-app/actions/runs/44472589808): 369 native tests including seven Cargo examples, sixteen capability combinations, four Wasm profiles, strict full/core/variants Cargo docs, 589 app tests, 373 Wasm contracts, types and the 123-component catalog. Deployment/header checks pass on the exact reviewed head. Fetched main contains both the reviewed head and merge; all shipping sources match.

Read-only HTTP checks return 200 for the deployed shell, Sandwich lesson, service worker and packaged Wasm. The actual lesson contains two outside Sandwich labels. Deployed Linux Wasm SHA-256 `f4f2a123db3a51b2d7873dc8354098204637dd402efa60ebad58b0e9accdc149` is identical to the preceding released Linux artifact; its raw size is 3,416,046 bytes. The separate Darwin artifact above remains identical to its local baseline. No cross-host byte equality is asserted.

Issue 68 is closed. Main now accepts twenty-four native families, twenty-five named variants plus Classic, and offers twelve variants plus Classic in New Puzzle. Little Killer, X-Sums and Skyscrapers are the three remaining native UI families. Thirteen older playable families still need New Puzzle recipes in issue 189. Coach short-link resolution, additional formats and authored semantics remain in issue 7; this integration imports the complete original Coach puzzle code.
