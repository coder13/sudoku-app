# Mixed-rule app fixtures

These fixtures test the complete imported puzzle definition. They include authored combination puzzles and a published Quadruple puzzle, with known completions and source-format inputs. They are not a difficulty corpus or a claim of support for every Sudoku Coach rule.

## Sparse puzzles

`mixed-puzzles.json` contains two puzzles:

| Fixture | Givens | Active rules | Independent solution count |
| --- | ---: | --- | --- |
| `x-killer` | 8 | Both diagonals and 27 three-cell Killer cages | One; multiple without cages; multiple without diagonals |
| `jigsaw-killer` | 15 | Connected Jigsaw regions and 32 Killer cages | One; multiple without cages |

The Diagonal/Killer completion and cages were authored for this test. The Jigsaw/Killer definition comes from the repository's existing variant benchmark fixture. Both include Coach and f-puzzles source codes. On 2026-11-17, the Diagonal/Killer Coach code was loaded in the official Coach constructor and exported again. The committed code is that canonical export. Coach sorts each cage's cells; the expected definition and f-puzzles input use the same cell order. The app preserves decoded rule order and cell order.

The separate counter in `../helpers/mixed-oracle.ts` uses exhaustive row, column, region, diagonal, and cage assignments. It shares no candidate, propagation, exact-search, or codec code with the engine. It counts up to two completions and throws if its budget expires. It does not support other constraint families. App tests compare its result with the recorded completion; Wasm tests independently verify candidates, hint actions, full traces, step replay, and final completions.

## Representative family combinations

`combined-families.json` has five blanks, at most one per row. Its completion satisfies both standard boxes and the supplied Jigsaw regions, plus Killer cages, a thermometer, an extra region, a diagonal, an arrow, Anti-Knight, and white and black Kropki dots. Thus row rules establish uniqueness for all 256 subsets of the eight families. The tests independently check every primitive condition in the recorded completion before importing each subset through the app's preview service and real Wasm adapter.

The rule list deliberately interleaves families. White and black dots share an edge in separate entries, which tests rendering offsets and independent parameters. A sparse regression separately exercises native proof indices when an extra region follows a cage rule. Negative Kropki tests remove a required mark and check that only the corresponding negative setting causes a conflict. Actual all-family import, move, save, and reload checks protect the saved-title limit as well as the puzzle definition.

The near-complete fixture tests interchange and app integration. It does not establish how often every constraint is essential, cover every arrangement of clues, or represent hard mixed-rule solving. Only the sparse Diagonal/Killer code has been round-tripped through the external Coach constructor; the other source codes are authored format fixtures.

## Odd/Even sources and app coverage

`parity-big-eight.json` transcribes Thomas Snyder's [Big Eight](https://www.gmpuzzles.com/blog/2023/03/even-odd-sudoku-by-thomas-snyder-2/), published on 2023-03-28 from the 2022 US Sudoku Grand Prix. Its 16 givens, 13 odd circles, 10 even squares, and completion were checked visually against the linked puzzle and solution PDFs. The separate row/column/box counter in `../helpers/parity-oracle.ts` proves one completion with the markers and multiple completions without them. It shares no search, propagation, or codec implementation with the engine.

`parity-coach.json` preserves the unmodified Odd and Even examples embedded in Coach's public rule serializer, retrieved on 2026-11-17. Both examples are 3 × 3 rule illustrations, which the app correctly rejects. Decoder tests reuse their unchanged constraint payloads in a 9 × 9 envelope. The Big Eight Coach input is an authored format fixture, not a constructor roundtrip. Each source marker is a single-cell segment with empty parameters; one native parity rule groups the cells of each source constraint. Known cosmetic settings do not change the rule. Unknown semantic settings are rejected.

The Wasm tests check the published completion, exact candidates, multiple hints, scoring, full Play and solution replay, paged proofs, Technique Finder counts, checked practice moves, save/reload and undo/redo. Parity remains enforced when its deduction is disabled, and conflicting odd/even markers cannot produce a solution. Three generated puzzles independently satisfy the requested 30 givens, 81 derived markers and required parity dependency. A representative fixture combines parity with all 512 subsets of the nine previously rendered families, including Quadruple. This checks interchange and app services, not every clue arrangement or difficulty.

Rendered desktop/mobile components check all 23 published markers and their accessible cell labels, mixed-clue drawing order, sharing the starting definition after player progress, and the completion chooser. The production build renders the Odd/Even lesson with its markers. Live desktop/mobile viewport and interaction review remains a follow-up because browser tooling is unavailable. App generation presets remain unavailable until their difficulty recipes are calibrated.

The engine source and rebuilt app Wasm are unchanged from main at `44e734f` (3,284,973 raw bytes / 856,094 gzip bytes). On macOS arm64 with Node 26.13.0, five warmups and 40 samples measured the following milliseconds, median/p95, on 2026-11-17:

| Big Eight operation | Median/p95 |
| --- | --- |
| Candidates | 0.008/0.008 |
| Verify uniqueness | 0.171/0.177 |
| Exact solve | 0.049/0.052 |
| Native default rating | 0.115/0.121 |
| Native default ten hints | 0.037/0.040 |
| App-order rating | 0.163/0.170 |
| App-order ten hints | 0.074/0.123 |
| Exhaustive first page, 10 samples | 328.889/331.965 |
| Derived parity generation, 20 seeds | 0.420/0.439 |

Exhaustive collection scans all enabled techniques before transferring eight of 23 choices. Generation matched 20/20 seeds with 30 givens, markers on all 81 cells, six attempts and 20,000 nodes per attempt. These calls exclude browser startup, worker transfer and UI rendering; the timings do not establish human difficulty or calibrated app presets. Repeat with `node --experimental-strip-types scripts/bench-variants.mjs` after building the app Wasm.

## Anti-King sources and app coverage

`anti-king-newman.json` records Philip Newman's [King of Diamonds](https://www.gmpuzzles.com/blog/2025/07/anti-king-sudoku-by-philip-newman/), published on 2025-07-03. Its 24 givens and completion were checked visually against the linked puzzle and solution PDFs. The independent counter proves one completion with Anti-King and multiple completions without it. The Coach input is authored from the public serializer's `antiKing` mapping: a global rule with empty segments and settings. It is not a constructor roundtrip.

`anti-king-combined.json` contains two authored completion witnesses, one with Diagonal and one with Anti-Knight, each also satisfying connected Jigsaw regions and the local rendered clue families. A direct completed-grid checker evaluates every active rule without engine candidates or search. Tests cover all 1,024 selections of the ten previously rendered families: 768 compatible fixed-clue samples import, offer multiple hints and rate successfully. The remaining 256 samples preserve an added knight rule that conflicts with their fixed clues and reject correctly. Those outcomes describe these fixed clues; feasibility also depends on the active regions and clue parameters.

`../helpers/cell-rule-oracle.ts` shares a separate row/column/box backtracker between the parity and Anti-King tests. `../helpers/parity-oracle.ts` retains the existing parity test entry point. Neither uses engine propagation, peer tables or codec code. Further tests check all corner-neighbor coordinates, concrete conflicts across boxes, row-boundary near misses, both kinds of candidate removal, move history, enabled/disabled deductions, rule-cache separation, practice, paged proofs, Finder counts, complete logical Play, solution replay, actual storage reload, sharing and completion. Three generated puzzles independently meet 30-given and required-rule targets.

Rendered desktop/mobile grids check the Anti-King label, related-cell highlighting, conflict classes and accessible feedback. Workspace controls keep the named rules, hints, solutions and Finder accessible. The generated production lesson contains its rule explanation and checked practice positions. Live desktop/mobile viewport and interaction review remains open while browser tooling is unavailable. New puzzle presets remain unavailable until difficulty recipes are calibrated.

The Rust source and rebuilt app Wasm are unchanged from main at `4811a05`; the Wasm is byte-for-byte identical (3,291,239 raw / 857,637 gzip bytes). On macOS arm64 / Node 26.13.0 on 2026-11-17, the benchmark measured milliseconds, median/p95:

| King of Diamonds operation | Median/p95 |
| --- | ---: |
| Candidates | 0.006/0.007 |
| Verify uniqueness | 0.026/0.027 |
| Exact solve | 0.014/0.015 |
| Native default rating | 0.112/0.117 |
| Native default ten hints | 0.030/0.032 |
| App-order rating | 0.143/0.149 |
| App-order ten hints | 0.106/0.111 |
| Exhaustive first page | 95.539/95.698 |
| Generation with required Anti-King | 0.520/0.667; 20/20 matches |

Fixed operations use five warmups and 40 samples; exhaustive collection uses five warmups and ten samples, ranking 438 choices before transferring eight. Generation uses 20 seeds, 30 givens, the Anti-King rule required, six attempts and 20,000 nodes per attempt. Repeat with `node --experimental-strip-types scripts/bench-variants.mjs`. Direct Node/Wasm timings exclude browser startup, worker transfer and rendering. Local combined-tree checks pass 361 app tests, 220 Wasm tests, TypeScript and the production/offline build.

## Repeating the mixed-rule checks

Run `npm test` for decoder, independent-counter, and storage contracts. Run `npm run test:wasm` for the compiled browser engine, imported-game flow, and family-subset matrix. The original mixed-rule suite is `../variant-import-wasm.mts`; Quadruple and Odd/Even have separate suites. Browser verification of the original eight-family stage on 2026-11-17 covered desktop Play and preview, 390-by-844 preview and rule dialogs, overlapping dot visibility, move/undo/redo, reload, multiple hints, the full share payload, and completion returning to the puzzle chooser.

After building Wasm, run `node --experimental-strip-types scripts/bench-variants.mjs`. The script uses five warmup calls and 40 samples per fixed operation, plus 20 seeds for configured generation recipes. Generation allows six attempts and 20,000 search nodes per attempt. All-family generation has no configured recipe; imported combinations are not promised as generation presets.

On macOS arm64 with Node 26.13.0 on 2026-11-17, the unchanged app Wasm measured 3,741,413 raw bytes and 883,946 gzip bytes. Latencies below are milliseconds, median/p95:

| Fixture | Candidates | Verify uniqueness | Exact solve | Rate | Ten hints | Generate |
| --- | --- | --- | --- | --- | --- | --- |
| Diagonal/Killer | 0.053/0.057 | 1.456/1.529 | 0.176/0.190 | 0.665/0.760 | 0.114/0.120 | 6.927/52.727, 20/20 matches |
| All eight families | 0.102/0.125 | 0.098/0.101 | 0.102/0.118 | 0.140/0.151 | 0.136/0.163 | Not configured |

These are warmed request timings in Node, not browser cold-start or worker-transfer measurements. They extend the benchmark baseline. No native engine optimization or paired speed comparison is included in this app integration.

## Quadruple source fixtures

`quadruple-clover.json` records [Clover's published Quadruples Sudoku](https://www.gmpuzzles.com/blog/2025/07/quadruples-sudoku-by-clover/) from 2025-07-22. It has five givens and fourteen circles. The completion matches the publisher's linked solution. The committed Coach code was exported from the official constructor on 2026-11-17 after its circles were checked against the source image.

`quadruple-coach.json` is a real constructor export of the authored Diagonal/Killer fixture with a repeated `3, 3` circle. Coach represents each circle with one top-left cell and a string of one to four printed digits. Imports preserve repeated occurrences and reject malformed geometry or unsupported parameters.

The separate counter in `../helpers/quadruple-oracle.ts` enumerates four-cell assignments and searches rows, columns, and regions. It shares no rule, propagation, exact-search, or codec code with the engine. It proves that Clover's fixture has one completion and has multiple completions without its circles. Other contracts check repeated digits, circle-to-house locks, complete solution replay, and Quadruple combined with all 256 subsets of the eight existing rendered families.

Quadruple is available through Coach and native puzzle-link imports, preview, Play, hints, solution walkthroughs, and Learn. Its native generation API supports derived circles, repeated digits, rule-dependency targets, opening targets, and scores. App generation presets await checked difficulty recipes.

Desktop browser checks covered import preview, Play, hints, input, undo/redo, reload, and a checked practice removal. Server-rendered component contracts cover the actual mobile panel's fourteen circles and accessible labels, separate positions for repeated occurrences, the actual share dialog's full starting definition, and the completion action. A live mobile viewport check remains pending after the browser session ended; these component checks do not establish browser layout fidelity.

## Profiling exhaustive variant hints

Run `node --experimental-strip-types scripts/profile-variant-hints.mjs tests/fixtures/quadruple-clover.json results.json` to time each enabled app technique and retain its complete proofs. It records five measured calls per technique after one warmup. Compare the `proofs` objects before and after an optimization, including empty results.

The Quadruple audit identified Nested Forcing Net as the largest exhaustive-search cost. The variant bridge now uses a 512-node exact probe for a completion that respects the current grid and removals. That completion excludes assumptions it satisfies from contradiction search. Each remaining deduction still needs its original logical proof. If no completion is found within the probe budget, the original search runs. The test on AI Escargot preserves all twelve nested proofs and checks their actions against a completion.

On 2026-11-17, the final macOS arm64 / Node 26.13.0 app artifact measured 3,284,973 raw bytes and 856,094 gzip bytes. Main at `31573ea` measured 3,214,995 raw and 835,341 gzip bytes under the same build settings. The addition costs about 20.3 KiB gzip (2.5%). The paired runner preserved retained technique metadata and all candidate, status, completion, rating, hint, and trace fields on seven existing fixtures, apart from the intentional variant scoring-version change from 5 to 6.

The published Quadruple fixture measured the following warmed request times in milliseconds, median/p95. These are direct Node/Wasm calls; they exclude browser startup, worker transfer, and UI rendering.

| Operation | Median/p95 |
| --- | ---: |
| Candidate updates | 0.031/0.036 |
| Unique-solution check | 2.757/2.870 |
| Exact solve | 1.235/1.276 |
| Rating, native default order | 1.123/1.245 |
| Rating, app technique order | 1.161/1.302 |
| Ten hints, app order and progress policy | 0.207/0.224 |
| Exhaustive first page, app policy | 1,586.310/1,603.400 |
| Derived generation, six attempts and 20,000 nodes per attempt | 27.770/29.367; 20/20 matches |

Fixed operations use five warmups and forty samples. Exhaustive paging uses five warmups and ten samples; all 31 choices are ranked before eight proofs are transferred. Generation uses zero givens and 64 derived four-digit circles, with the Quadruple rule required. These are engine generation checks; they do not establish app difficulty recipes.

The witness optimization has a separate alternating comparison against the preceding Quadruple artifact: two warmup iterations and ten samples per engine. Exhaustive first-page median/p95 fell from 2,505.034/2,712.906 ms to 1,609.606/1,694.376 ms. Every per-technique proof on the published fixture, all twelve AI Escargot nested proofs, and all retained responses across eight fixtures matched. Run `scripts/compare-variant-engines.mjs` with the two Wasm paths to repeat the comparison. No scoring costs or enabled-technique policy change for this optimization.

### Additional completion witnesses

The next audit starts from main at `e43ae23`. The initial Big Eight profile spent 268.020 ms in Nested Forcing Net without finding a deduction. Additional bounded probes search the Classic houses and current candidate masks. Each successful completion witnesses both the digits it uses and the alternatives it omits. Only compatible assumptions are skipped; failed or unfinished probes retain the original logical contradiction search. The extra probes use at most 128 nodes each and 4,096 per scan. This implementation compiles only with the `variants` Cargo feature. A witness does not establish any additional variant rule, and variant-specific detectors keep enforcing their rules.

On macOS arm64, Node 26.13.0 and Rust 1.100.0, a quiet alternating comparison on 2026-11-17 measured these direct Wasm requests in milliseconds, median/p95. Each engine gets two warmup iterations and ten measured samples:

| Exhaustive first page | Main | Additional witnesses |
| --- | ---: | ---: |
| Clover Quadruple | 1,596.603/1,727.721 | 857.367/890.236 |
| Big Eight Odd/Even | 330.498/339.431 | 66.237/67.094 |

The retained API responses, ratings and traces match across nine fixtures, including complete Nested Forcing Net proofs. Separate profiles compare all 107 app-order technique outputs on both published puzzles, including empty results. All twelve AI Escargot nested proofs also match the unpruned reference. Scoring version remains 6; costs, technique order, hint choices and original logical evidence are unchanged. The final individual nested scans measured 217.002 ms for Quadruple and 4.107 ms for Big Eight. Other expert detectors account for the remaining exhaustive cost. These timings exclude browser startup, worker transfer and UI rendering; normal hints and ratings do not need exhaustive collection.

| Wasm profile | Main raw/gzip bytes | Additional witnesses raw/gzip bytes |
| --- | ---: | ---: |
| solver | 2,039,849 / 556,086 | 2,040,103 / 556,087 |
| variant-solver | 2,527,133 / 676,007 | 2,544,153 / 680,275 |
| classic | 2,539,310 / 668,892 | 2,555,726 / 662,305 |
| app | 3,284,973 / 856,094 | 3,291,239 / 857,637 |

The app adds 1,543 gzip bytes. All four profile contracts and all 16 native/wasm-api feature combinations pass. The optimized artifact also passes 253 Rust tests including doctests, 352 app tests, 214 Wasm tests, strict full/reduced Cargo docs, TypeScript and the production/offline build. Unit cases check positive and negative assumptions, candidate-mask restrictions, zero/exhausted budgets, incompatible domains, and reuse of an existing completion without new probes.

Repeat the paired comparison with `node --experimental-strip-types scripts/compare-variant-engines.mjs before.wasm after.wasm tests/fixtures/parity-big-eight.json`. Additional JSON fixture paths extend both the retained-response corpus and the exhaustive app comparison. Use `scripts/profile-variant-hints.mjs` to retain the full per-technique proofs when testing another optimization.

## Non-Consecutive sources and app coverage

`nonconsecutive-newman.json` records Philip Newman's [Literally No One](https://www.gmpuzzles.com/blog/2025/07/nonconsecutive-sudoku-by-philip-newman/), published 2025-07-09. Its 21 givens and completion were checked against both rendered publisher PDFs. The solution PDF's extracted text runs from bottom to top; the fixture follows the visible grid. A separate set-based counter proves the published unique completion in 176 nodes and multiple completions without Non-Consecutive.

`nonconsecutive-coach.json` retains unmodified SCv7 codes and independently decoded payloads from two public Coach pages. The 9 × 9 [Consecudoku](https://sudoku.coach/en/s/7RCb) has two givens and 38 white dots. The 6 × 6 [Non-consecutive Flockers](https://sudoku.coach/en/s/Cby7) remains an explicit unsupported-size fixture. Coach's [published rule compiler](https://sudoku.coach/js/jCfXtZs-1776367508519.js) exempts difference-marker pairs from its global Nonconsecutive relation. Imports therefore add explicit `except` edges to the native rule and preserve the separate positive Kropki constraints, in either source order. Black dots do not create exceptions. Native definitions keep their explicit semantics; no automatic exemption is inferred from a native dot.

The published 21-given puzzle completes logically under the app order. The two-given Coach puzzle imports with its published exact completion, while its current logical path stalls after 62 deductions. Both partial ratings remain marked as stalled. Missing locked and multi-candidate deductions, proof/training support and request performance are tracked in [issue 111](https://github.com/coder13/sudoku-app/issues/111).

`nonconsecutive-combined.json` contains two authored completion witnesses with 72 givens, connected Jigsaw regions and the previous rendered clue families. All 2,048 family selections retain every selected source rule. The 1,536 compatible samples pass import, hints and rating; 512 samples preserve an added knight rule and reject conflicting fixed clues. These counts concern these supplied givens and do not establish general feasibility of family combinations. A separate checker evaluates every active constraint directly on the completed digits.

App coverage includes both candidate styles, non-wrapping edge conflicts, 1/9 boundaries, explicit exceptions, undo/redo, batched singles, all grid symmetries, three checked practice positions, multiple hints, selected proofs, paging, Technique Finder, complete logical Play on the published puzzle, partial-path status, sharing and actual storage reload. Rendered desktop/mobile components preserve all 38 dots and their exception labels, conflict feedback, help controls and the completion chooser. Live viewport review and calibrated New puzzle presets remain separate follow-ups.

Warmed Node/Wasm timings on Darwin arm64, Node 26.13.0, milliseconds median/p95:

| Operation | Literally No One | Two-given Consecudoku |
| --- | ---: | ---: |
| Candidates | 0.014 / 0.016 | 0.043 / 0.056 |
| Uniqueness | 0.336 / 0.349 | 0.361 / 0.377 |
| Exact solve | 0.253 / 0.260 | 0.361 / 0.366 |
| Native default rating | 0.317 / 0.490 | 0.541 / 0.566, stalled |
| Native default ten hints | 0.050 / 0.058 | 0.073 / 0.084 |
| App-order rating | 0.345 / 0.431, solved Easy | 2,516.019 / 2,526.339, stalled |
| App-order ten hints | 0.083 / 0.093 | 1,428.987 / 1,438.757 |
| App exhaustive first page | 44.632 / 44.798 | 1,417.999 / 1,424.970 |

Fixed operations use five warmups and 40 samples; exhaustive collections use five warmups and ten samples. The published puzzle has 66 choices with eight transferred; Consecudoku has four choices, all transferred. The app order includes 107 techniques and the existing progress preference; the native default searches its smaller order. Run `node --experimental-strip-types scripts/bench-variants.mjs non-consecutive nc-white-dots` to repeat these cases. Other fixture names select narrower audits. These calls exclude worker startup, transfer and rendering.

Generation with required Non-Consecutive and 30 givens matched 17/20 seeds at 116.476/402.132 ms under six attempts and 20,000 nodes per attempt. Three separate generated puzzles pass independent clue-count, uniqueness and rule-dependency checks under 30 attempts and 50,000 nodes. A generated mixed template retains all 38 exceptions and its positive dots. These measurements do not establish human difficulty or calibrated app presets.

Against main at `cda93a3`, complete retained API responses and complete Nested Forcing Net proofs match on eleven fixtures, including the published Non-Consecutive puzzle. Paired exhaustive median/p95 times are 858.485/863.936 → 854.527/862.056 ms for Quadruple, 65.722/68.416 → 65.171/67.239 ms for Odd/Even, 96.658/97.845 → 95.858/96.315 ms for Anti-King and 44.832/45.865 → 44.542/46.881 ms for Non-Consecutive. No scoring version or technique cost changes.

App Wasm measures 3,292,003 raw / 851,248 gzip bytes, compared with main's 3,291,239 / 857,637. The solver-only and Classic profiles remain 2,040,103 / 556,087 and 2,555,726 / 662,305; variant-solver measures 2,537,575 / 678,728. Local gates pass 258 Rust tests including doctests, 379 app tests, 227 Wasm tests, all 16 capability combinations, four Wasm profiles, strict full/reduced Cargo documentation, TypeScript and the production/offline build.

The per-technique profile of Consecudoku's starting position uses one warmup and five measured calls per detector, retaining every proof. The largest medians are 750.684 ms for five-digit Pattern Overlay, 293.104 ms for four-digit Pattern Overlay and 237.137 ms for Nested Forcing Net; all three return no deductions. This identifies a follow-up search target, rather than a performance improvement in this integration. Normalize the stored Coach export with `detectPuzzle` and run `scripts/profile-variant-hints.mjs` on its native puzzle definition to repeat the profile.

## Pattern Overlay support performance

This comparison uses main at `8439f6d` and `codex/sudoku-pattern-overlay-pruning`. Bounded completions certify support for the overlay detector's candidate masks, houses and equal-digit exclusions. Restricting one completion to any selected digit group gives compatible, disjoint layouts for that group. Other numeric variant rules need not hold: these witnesses certify detector support and are never returned as puzzle solutions. Failed or exhausted probes certify nothing. The original exact layout search checks any remaining support. Checked digit permutations can extend a witness only when every supplied mask permits them.

The starting-position profile preserves all 107 per-technique proof lists. Five-digit Pattern Overlay falls from 750.684 to 0.577 ms median and four-digit from 293.104 to 0.569 ms. All return no deductions on this position. Seven added native cases check masks, renaming, Jigsaw geometry, extra houses and exclusions, incomplete budgets, fallback behavior and cache invalidation. Existing independent replay tests cover all five overlay sizes and published positive deductions.

Paired Node/Wasm requests on Darwin arm64, Node 26.13.0, use fresh instances for each fixture, two warmups and ten measured samples per engine, alternating execution order. Timing includes request encoding and decoding, and excludes comparison assertions, worker startup, transfer and rendering. Values are milliseconds median/p95.

| Exhaustive first hint page | Main | Support witnesses |
| --- | ---: | ---: |
| Quadruple | 858.868 / 865.300 | 566.594 / 585.301 |
| Odd/Even | 65.328 / 66.269 | 53.188 / 53.475 |
| Anti-King | 95.750 / 101.572 | 97.761 / 110.028 |
| Non-Consecutive | 44.336 / 44.685 | 41.299 / 41.728 |
| Two-given Consecudoku | 1,421.277 / 1,443.266 | 674.777 / 681.206 |

Consecudoku's app rating falls from 2,521.482/2,538.418 to 1,029.411/1,069.526 ms. Its ordinary ten-hint request falls from 1,423.073/1,435.236 to 673.679/686.600 ms. The same four hints and stalled status remain; missing human deductions are still tracked in [issue 111](https://github.com/coder13/sudoku-app/issues/111). Rating and ordinary hints for the other four fixtures remain below 2 ms in these samples. Anti-King has no demonstrated exhaustive speedup: a separate repeat measured 96.723/114.704 → 96.992/99.882 ms, with all 438 choices unchanged.

Committed Wasm linear memory after the measured requests falls from 10.81 to 6.56 MiB for Consecudoku and from 4.06 to 3.69 MiB for the published Non-Consecutive puzzle. Quadruple, Odd/Even and Anti-King remain at 5.88, 3.56 and 10.44 MiB. These are committed buffer sizes, not process RSS or live allocation measurements.

The complete differential corpus includes 30 positive practice positions and 13 Classic/variant positions. Comparisons preserve candidates, validation, exact completions, complete shared forcing and overlay proofs, app traces/ratings, catalogs, all ranked hints and every page, including scoring version 6. All 265 native tests including doctests, 379 app tests, 227 Wasm tests, TypeScript, all 16 capability combinations, four Wasm profile contracts, strict full/reduced Cargo documentation and the production/offline build pass locally.

| Wasm profile | Main raw/gzip bytes | Support witnesses raw/gzip bytes |
| --- | ---: | ---: |
| solver | 2,040,103 / 556,087 | 2,040,103 / 556,090 |
| variant-solver | 2,537,575 / 678,728 | 2,544,268 / 690,303 |
| classic | 2,555,726 / 662,305 | 2,555,726 / 662,307 |
| app | 3,292,003 / 851,248 | 3,314,899 / 881,343 |

The app adds 30,095 gzip bytes for the measured latency reduction. New probes compile only with `variants`; solver and Classic raw sizes are unchanged. Repeat the paired requests with `node --experimental-strip-types scripts/bench-overlay-engines.mjs before.wasm after.wasm`; optional fixture names select narrower runs. Use `scripts/compare-overlay-engines.mjs before.wasm after.wasm` for the complete differential corpus and `scripts/profile-variant-hints.mjs` for individual detector proofs and timings.

## Non-Consecutive locks and candidate alternatives

The four new techniques are two-cell locks, three-cell locks, bivalue and trivalue neighbors. The [public Coach solver](https://sudoku.coach/js/jCfXtZb-1776367508519.js) names these families. The engine uses its existing binary relations and a finite-alternative proof: every possible location of a house digit, or every candidate of one cell, must conflict with the candidate being removed. Evidence records the complete alternatives, rule indices and any shared houses. Exact search supplies no premise. Explicit exemptions remain active, and locks use the declared Jigsaw, diagonal and extra houses.

`nonconsecutive-locked.json` archives Consecudoku's position after the prior app order stalled at 62 deductions on main `36add07`. It retains the original two givens, 38 white dots and all 38 Non-Consecutive exceptions. Its six expected removals replay from their actual house alternatives. With the new techniques enabled, the app solves directly from the original givens in 167 deductions and matches the published completion. Omitting the four new IDs reproduces the archived stall exactly.

Twelve practice puzzles cover the four techniques, with distinct target scopes. Locks and bivalue exercises reuse the engine's unique Non-Consecutive teaching puzzles. Two trivalue exercises add a verified given to the original teaching puzzle. A separate set-based counter checks all twelve givens for uniqueness. Fresh seeded drills retain the selected proof and also pass the independent counter. Four generated 30-given puzzles, using seeds 31–34 and the matching practice puzzle as a solution anchor, start with the selected new technique under an explicit order. Each has one completion with Non-Consecutive and multiple completions without it. The requests allow 30 attempts and 50,000 nodes per attempt, with a score interval of 0–100,000. An unanchored two-cell first-move request with 35 givens exhausted its six-attempt, 20,000-node budget. These cases do not establish general generation success or calibrated app presets.

Variant scoring version 7 adds the four IDs to the default order at 20, 24, 22 and 24 points. Older costs are unchanged. The three proof-effort estimates per technique extend the calibration set from 69 to 81 complete paths. Cost is charged once per deduction. A partial version-6 score of 946 at the Coach stall is distinct from its complete version-7 app score of 2,278.

The differential corpus matches 2,052 retained responses across fourteen Classic/variant positions, including all 107 prior app detector outputs, exact completions, explicit old-profile ratings/traces and every hint page. Only the declared score-version metadata changes for those explicit profiles. Nine additional corpus proofs replay through an independent house/edge checker. Eleven new native cases include all 511 nonempty source masks at five boundary/interior cells for both cell techniques: 5,110 comparisons against direct neighbor assignments. Nine independently checked shifted Latin grids witness every source digit. Positive/near-miss cases cover missing edges, extra alternatives, 1/9 boundaries, Jigsaw, both diagonals, extra houses, absent rules and shared-house provenance.

Paired Node/Wasm measurements on Darwin arm64, Node 26.13.0, use fresh instances per fixture and each build's own default/app order. Fixed requests use five warmups and twenty samples; exhaustive first pages use two warmups and ten samples. Execution order alternates. Values include encoding/decoding and exclude assertions, worker startup, transfer and rendering. Values are milliseconds median/p95.

| Consecudoku operation | Main `36add07` | New techniques |
| --- | ---: | ---: |
| Candidates | 0.049 / 0.061 | 0.052 / 0.061 |
| Uniqueness | 0.353 / 0.368 | 0.363 / 0.379 |
| Exact solve | 0.356 / 0.380 | 0.366 / 0.385 |
| Native default rating | 0.530 / 0.576, stalled | 0.841 / 0.922, complete |
| App-order rating | 1,058.396 / 1,412.850, stalled | 1.067 / 1.600, complete |
| App ten-hint request | 679.743 / 805.122 | 684.179 / 758.524 |
| App exhaustive first page | 681.509 / 794.187 | 681.948 / 878.228 |

Both opening hint requests still return the same four choices. Their latency remains an open target in [issue 88](https://github.com/coder13/sudoku-app/issues/88). Native default now completes more work; its complete score is 1,978. Committed Wasm memory after the measured requests stays at 6.56 MiB for this fixture. Buffer size does not measure process RSS or live allocations.

| Retained fixture, app rate | Main median/p95 | New median/p95 |
| --- | ---: | ---: |
| Quadruple | 1.166 / 1.387 | 1.193 / 1.387 |
| Odd/Even | 0.176 / 0.244 | 0.183 / 0.261 |
| Anti-King | 0.152 / 0.179 | 0.153 / 0.190 |
| Published Non-Consecutive | 0.362 / 0.373 | 0.365 / 0.379 |

Their complete app scores remain 2,285, 1,150, 712 and 948. Exhaustive first-page medians change from 584.797 to 586.547 ms, 54.765 to 55.066 ms, 100.649 to 101.008 ms and 42.394 to 42.720 ms respectively. Published Non-Consecutive now has 70 choices instead of 66. The other counts stay 31, 23 and 438; all four ordinary requests still return ten choices. Committed memory stays at 5.88, 3.56, 10.44 and 4.06 MiB.

| Wasm profile | Main raw/gzip bytes | New techniques raw/gzip bytes |
| --- | ---: | ---: |
| solver | 2,040,103 / 556,090 | 2,040,103 / 556,090 |
| variant-solver | 2,544,268 / 690,303 | 2,576,562 / 690,191 |
| classic | 2,555,726 / 662,307 | 2,555,726 / 662,307 |
| app | 3,314,899 / 881,343 | 3,324,125 / 871,804 |

The measured app artifact is 9,539 gzip bytes smaller. Solver and Classic profiles are identical in raw and gzip size. Local release tests, 382 app tests, 233 Wasm tests, TypeScript, all sixteen capability combinations, four Wasm contracts and strict full/reduced Cargo docs pass. App, type and Wasm checks also pass after integrating main's lesson/hint rewrite, PR 99 at `da339cf`; the four introductions and house naming follow that layout. The production/offline build renders 158 pages, including all four new lesson routes. Rendered component checks cover desktop/mobile proof cards, candidate marks, solution lists and cell naming preferences.

Repeat with `node --experimental-strip-types scripts/compare-nonconsecutive-deductions.mjs before.wasm after.wasm` and `node --experimental-strip-types scripts/bench-nonconsecutive-deductions.mjs before.wasm after.wasm`. Optional fixture names narrow the benchmark. The verified production asset has SHA-256 `15a4b04916621e3ba1b6889835b98be38c8c6b5e5b3db113a7e6c9a4058eedcc`.


## Complete candidate-support pruning

This pass compares main `6c30514` (PR 115) with `codex/sudoku-candidate-support-pruning`. A bounded cache of completions under the Classic detector's masks, houses and equal-digit exclusions already exists for Pattern Overlay. When that cache covers every allowed candidate and no live cell has a singleton domain, it also witnesses both truth values of every candidate assumption. Non-uniqueness Classic searches cannot prove a placement or removal from those premises. Graph and branching families prepare this coverage lazily; cheaper searches only reuse existing coverage. Human point costs do not schedule the probe. Numeric variant techniques remain active because these witnesses need not be valid variant solutions.

The original detector runs whenever coverage is partial, unknown or exhausted. Coverage permits 128 nodes per probe and 4,096 per position. It is invalidated by changed masks or placements and scoped to one compiled geometry. Uniqueness techniques never use relaxed completion coverage. A separate eligibility check skips them only when extra rule scopes cover every cell, so every recognized swap would fail the existing swap filter. Public capabilities and profile validation remain unchanged.

Eight new native cases cover the real four-choice Coach opening, zero-budget fallback, positive graph and branching proofs, a supported singleton placement, safe/unsafe uniqueness scopes, Jigsaw topology, separate position instances, candidate and placement edits, and empty domains. Two independently checked completions of an ambiguous rectangle witness both truth values of its four bivalue cells. Existing mask/renaming/extra-geometry replay and all twelve AI Escargot nested proofs remain checked.

The differential script matches 2,712 complete responses on fourteen corpus positions and all 348 positive training positions, including every one of the 116 catalog detector IDs (111 in the app order). It checks complete proof lists, candidates, exact analysis/solve, native/app traces and ratings, disabled and reversed profiles, every hint page, and unchanged catalogs and scoring version 7. No metadata is normalized away.

Repeat with `node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm` and `node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm`. Optional fixture names narrow the benchmark. The benchmark asserts complete response equality before measurement and after every request, outside the timed region.


Paired Node/Wasm measurements on Darwin arm64, Node 26.13.0, alternate engine order with five warmups/twenty samples for fixed requests and two warmups/ten samples for exhaustive first pages. Times include request encoding/decoding and exclude comparison assertions, module initialization, worker startup, transfer and rendering. Every call constructs a new proof position; its certificate is shared by the detectors within that request. These samples ran after this branch's builds finished, while unrelated native generation and other host work remained active. Large tails and small differences on the retained fixtures do not establish improvements or regressions. Values below are milliseconds median/p95.

| Consecudoku operation | Main `6c30514` | Complete support |
| --- | ---: | ---: |
| Candidates | 0.116 / 0.139 | 0.117 / 0.149 |
| Uniqueness | 0.504 / 1.051 | 0.498 / 0.924 |
| Exact solve | 0.504 / 0.955 | 0.511 / 0.933 |
| Native default rating | 1.345 / 2.321 | 1.314 / 2.157 |
| App-order rating | 1.950 / 3.062 | 1.979 / 6.678 |
| App ten-hint request | 1,300.655 / 2,148.838 | 1.122 / 2.620 |
| App exhaustive first page | 1,457.041 / 1,886.049 | 2.101 / 8.220 |

Both hint operations retain all four choices. Native/app complete scores stay 1,978/2,278. An additional single first request on a fresh Wasm instance measures 1,494.737 → 2.266 ms for ordinary hints and 1,189.900 → 2.205 ms for exhaustive hints. These first-request observations are not percentiles or browser cold-start measurements: instantiation and catalog lookup occur before timing. Committed Wasm linear memory after all measured requests falls from 6.56 to 1.50 MiB. This buffer size is not RSS or live allocation.

| Retained fixture | App rate, main → support | Exhaustive page, main → support | Choices | Memory, MiB |
| --- | ---: | ---: | ---: | ---: |
| Quadruple | 1.476/2.884 → 1.477/2.797 | 1,053.750/1,251.448 → 1,002.179/1,128.910 | 31 | 5.88 |
| Odd/Even | 0.217/0.509 → 0.224/0.506 | 183.063/380.316 → 150.367/200.512 | 23 | 3.56 |
| Anti-King | 0.186/0.485 → 0.194/0.760 | 233.319/269.025 → 237.380/260.496 | 438 | 10.44 |
| Published Non-Consecutive | 0.440/0.833 → 0.454/0.788 | 97.151/201.445 → 85.145/237.200 | 70 | 4.06 |

Their complete app scores, ten ordinary choices, exhaustive choices and committed memory are unchanged. The robust target improvement is the empty Classic search on Consecudoku; the other timings remain observational under host contention. Cold browser loading, actual worker transfer and foreground/background scheduling remain outside this benchmark.

| Wasm profile | Main raw/gzip bytes | Complete support raw/gzip bytes |
| --- | ---: | ---: |
| solver | 2,040,103 / 556,090 | 2,040,103 / 556,090 |
| variant-solver | 2,576,562 / 690,191 | 2,585,481 / 700,237 |
| classic | 2,555,726 / 662,307 | 2,555,726 / 662,305 |
| app | 3,324,125 / 871,804 | 3,324,381 / 871,215 |

The app adds 256 raw bytes and saves 589 gzip bytes; variant-solver adds 8,919 raw / 10,046 gzip bytes. The new paths compile only with `variants`. The measured production artifact has SHA-256 `a857e60ff33eeffe7aa6e729a1df5b84c771f32a07d6d8fb14b4158f2246809f`; main is `15a4b04916621e3ba1b6889835b98be38c8c6b5e5b3db113a7e6c9a4058eedcc`. All 284 native tests including doctests, 382 app tests, 233 Wasm tests, TypeScript, sixteen native capability combinations, four Wasm profiles, strict full/reduced Cargo documentation and the production/offline build with 158 prerendered routes pass locally.


## Whispers lines, shared houses and app integration

The published fixture is Philip Newman's **Brain Zaps**, from Genuinely Approachable Sudoku on 2026-01-08. The puzzle has three givens and four green lines. Both the [puzzle PDF](https://www.gmpuzzles.com/images/puzzles2026/260108-GermanWhispersSudoku-BrainZaps.pdf) and [completion PDF](https://www.gmpuzzles.com/images/puzzles2026/260108-GermanWhispersSudoku-BrainZaps-soln.pdf) were rendered and checked visually. The lower zigzag is in rows 8 and 9; PDF text extraction and the search index give a misleading row order. The fixture stores the cell paths from the image and the printed completion.

An independent digit-set counter proves uniqueness and matches the printed grid. Removing the Whispers rules leaves multiple solutions. The engine before this integration finds four basic line deductions, then stalls. A separate prototype completes the puzzle using shared-house line assignments and singles. The integrated `whispers-house-support` technique has its own 39-point Medium cost, three independently unique practice puzzles, typed `line-houses` evidence and a lesson. Variant scoring advances from 7 to 8; older costs stay unchanged. One initial drill had an unrelated 3/4 ambiguity; a second local Whispers clue selects its completion while leaving the teaching proof dependent on the original shared-house argument.

The generic binary-clue search checks complete line assignments against only the explicit houses recorded in its proof. It caps each line at 32,768 nodes and returns no negative support when exhausted. Jigsaw regions replace boxes; declared diagonals and extra houses can supply the needed inequality. Redundant house exclusions are omitted from the evidence. Returned actions have a stable sorted order, including when the line direction is reversed. A direct triple product checks every nonempty middle domain, three endpoint domains and minimum differences 1–8, both with and without an endpoint inequality: 24,528 complete comparisons. Public tests independently replay the published deductions, all three new drills, Jigsaw/extra/diagonal cases and reversed paths.

Real Coach exports include closed walks. The compiler keeps every closing/revisited edge while deduplicating the assignment variables; the original ordered walk stays in puzzle JSON and SVG geometry. A direct triangle replay checks all six minimum-4 assignments and confirms that its closing edge rules out otherwise supported digits.

The app preserves ordered walks and minimum differences 1–8 through native and Coach import, save/reload, sharing, history and all eight grid symmetries. Nonstandard gaps are printed on their lines. Cell accessibility text names the actual line neighbors and required difference. Cleanup and conflict feedback apply only to consecutive cells along the line; the complete line is not an all-different region. Component checks cover desktop/mobile grids, clue geometry, hint cards, Learn diagrams, candidate marks, solution lists and cell naming preferences. Native generation independently verifies three 30-given puzzles at seeds 17, 29 and 43 that need Whispers. App New puzzle presets remain unavailable until their difficulty recipes are calibrated.

The unmodified Coach exports in `whispers-coach.json` verify the source `whisper` type, default difference 5 and explicit differences 4 and 2, including the styling fields present on real lines. Tests isolate those constraints for decoder checks. The complete exports still reject their unimplemented companion clues: Aeb's lesson contains cosmetic annotations, cyboogie's puzzle contains XV, and the 1-to-32 puzzle uses unsupported cage settings. These fixtures do not claim full import support for those puzzles or short links. Their data is retained for the remaining interchange work.

All 4,096 selections of the twelve other rendered families are checked with a Whispers path fitted to the existing fixed completion witnesses. Of these selected fixed-clue samples, 3,072 import, validate, offer multiple hints and rate to completion. The other 1,024 contain a known knight conflict and reject. This checks those samples and does not establish general feasibility of family combinations.

The differential corpus matches 2,306 retained responses on fifteen Classic/variant positions, including all 116 prior catalog detector outputs, full traces/ratings, candidates, exact completions and every hint page. Old profile behavior is retained except the declared scoring-version metadata. Seven additional line/house proofs replay independently. The sparse published puzzle is also checked with both a 20,000-node exact budget and a completed 100,000-node budget, retaining matching search-limit outcomes.

Repeat with `node --experimental-strip-types scripts/compare-whispers-engines.mjs before.wasm after.wasm` and `node --experimental-strip-types scripts/bench-whispers-engines.mjs before.wasm after.wasm`. Optional fixture names narrow the benchmark. Browser viewport fidelity, actual worker transfer and New puzzle recipes remain separate follow-ups.


Paired measurements compare main `70fab58` with the final compact-proof artifact on Darwin arm64, Node 26.13.0. Each build uses its own native/app order. Requests alternate execution order on fresh instances per fixture. Fixed requests use five warmups/twenty samples and exhaustive first pages use two/ten, except the expensive Whispers app rating and both hint operations use one/five. Values include request encoding/decoding and exclude assertions, module instantiation, worker startup, transfer and rendering. The host was not dedicated to this benchmark; large tails and small differences remain observational. Values are milliseconds median/p95.

| Brain Zaps operation | Main → Whispers integration |
| --- | ---: |
| Candidates | 0.033/0.037 → 0.032/0.035 |
| Uniqueness, 100,000-node budget | 32.355/36.664 → 30.239/34.909 |
| Exact solve, 100,000-node budget | 31.822/47.195 → 31.715/38.895 |
| Native default rating | 0.119/0.334 → 0.533/1.023 |
| App-order rating | 24367.310/34962.469 → 0.886/1.560 |
| Ordinary ten-hint request | 2403.923/3312.024 → 2405.030/2607.348 |
| Exhaustive first page | 1422.503/2563.798 → 1602.991/1980.805 |

The native default changes from a four-step stall at 108 points to a complete 92-step, 862-point Medium path. App order also completes in 92 steps, at 1,212 points. Ordinary and exhaustive opening requests increase from four choices to eight. These requests still spend seconds in empty expert searches; this integration does not claim an exhaustive-hint speedup. A single first request on a fresh Wasm instance takes 26,824.947 → 2.274 ms for app rating, 1,996.210 → 1,987.865 ms for ordinary hints and 2,979.246 → 2,006.493 ms for the exhaustive page. These are individual observations, not cold-browser percentiles. Committed linear memory after all requests changes from 8.88 to 9.44 MiB; buffer size is not process RSS or live allocation.

| Retained fixture | App rate, main → integration | Exhaustive page, main → integration | Choices | Committed MiB |
| --- | ---: | ---: | ---: | ---: |
| Quadruple | 5.729/19.110 → 6.996/20.307 | 1510.138/1769.210 → 1483.040/1626.887 | 31 | 5.88 |
| Odd/Even | 0.450/1.398 → 0.363/2.246 | 127.911/213.506 → 136.831/152.184 | 23 | 3.56 |
| Anti-King | 0.278/0.757 → 0.276/0.509 | 230.694/267.564 → 231.666/267.465 | 438 | 10.44 |
| Published Non-Consecutive | 0.720/1.027 → 0.771/1.092 | 95.800/106.241 → 97.580/114.271 | 70 | 4.06 |
| Two-given Consecudoku | 1.742/2.255 → 2.003/2.427 | 1.391/2.605 → 1.484/2.485 | 4 | 1.50 |

Retained scores, statuses, hint choices and committed memory are unchanged. Quadruple exact validation measures 6.303/12.170 → 9.376/19.539 ms and solving 2.505/5.654 → 3.420/5.126 ms. These slower samples need a controlled repeat and profile; no retained-fixture performance improvement is claimed. Remaining work in the performance audit includes this exact/rating path, empty uniqueness searches on Whispers, cold worker loading and foreground/background scheduling.

The rare `VariantLineHouseProof` payload is boxed. An equivalent native unboxed evidence enum measures 128 bytes and the final shared `VariantEvidence` measures 120 on this host, so unused Whispers data does not enlarge every deduction. Boxing preserves 2,730 complete outputs over fourteen corpus positions and all 351 positive training positions (117 IDs), plus fourteen full published/closed-loop responses. The 2,306-response legacy comparison is also repeated on the final artifact.

| Wasm profile | Main raw/gzip bytes | Whispers raw/gzip bytes |
| --- | ---: | ---: |
| solver | 2,040,103 / 556,090 | 2,040,103 / 556,090 |
| variant-solver | 2,585,481 / 700,237 | 2,587,664 / 695,874 |
| classic | 2,555,726 / 662,305 | 2,555,726 / 662,305 |
| app | 3,324,381 / 871,215 | 3,346,737 / 895,950 |

The app adds 22,356 raw / 24,735 gzip bytes. Variant-solver adds 2,183 raw bytes and saves 4,363 gzip bytes; solver and Classic are identical. Final app SHA-256 is `93e7f9364a35b01bf6335efc40adef2de5a254039ec17c9f7bc44a0c25f00340`; main is `a857e60ff33eeffe7aa6e729a1df5b84c771f32a07d6d8fb14b4158f2246809f`. All 291 native tests including doctests, 396 app tests, 242 Wasm tests, TypeScript, sixteen feature combinations, four profile contracts, strict full/reduced Cargo docs and the 159-route production/offline build pass on the compact representation. An interrupted feature-matrix run exhausted disk space; after clearing only unused caches from this chat's earlier engine passes, the complete matrix passed.

## Earlier bounded uniqueness eligibility

[Issue 122](https://github.com/coder13/sudoku-app/issues/122) starts from main `b5b394c`, after the Whispers integration. Its published Brain Zaps opening has eight hint choices, but three Unique Rectangle graph searches find no accepted proof. The existing 4,096-node uniqueness check cannot certify that position. A larger public exact-search budget proves its unique completion.

Unique Rectangle AIC and both Unique Rectangle Nice Loops now check the same cached uniqueness requirement before graph search. Empty cheap searches defer the check until they find a proof. All uniqueness searches can reuse a cached failure. The check still excludes candidate removals, and every accepted proof retains its swap-scope filter. Technique order, costs, capabilities and scoring version 8 are unchanged.

The paired Node/Wasm measurements below use macOS arm64 and Node 26.13.0. No compiler or engine-generation job was active during these measurements. The desktop remains a nondedicated host.

Each fixture uses separately instantiated engines and alternates their execution order. Fixed requests use five warmups and twenty measured samples. Exhaustive pages use two warmups and ten measured samples. Values are milliseconds, median/p95.

| Brain Zaps operation | Main | Earlier eligibility |
| --- | ---: | ---: |
| Candidates | 0.032/0.043 | 0.033/0.049 |
| Exact analysis, 100,000 nodes | 13.926/14.301 | 13.765/14.195 |
| Exact solving, 100,000 nodes | 13.776/13.916 | 13.721/13.943 |
| Native default rating | 0.339/0.604 | 0.347/0.458 |
| App-order rating | 0.350/0.476 | 0.347/0.504 |
| Up to ten hints | 660.803/678.451 | 486.085/514.869 |
| Exhaustive first page | 664.839/702.136 | 490.369/504.954 |
| Selected Unique Rectangle Type 1 | 0.013/0.028 | 0.013/0.024 |
| Selected Unique Loop | 0.012/0.016 | 0.012/0.016 |
| Selected BUG+1 | 0.012/0.025 | 0.012/0.019 |
| Selected Unique Rectangle AIC | 59.140/59.553 | 2.825/2.911 |
| Selected Unique Rectangle Continuous Nice Loop | 59.802/63.663 | 2.885/3.187 |
| Selected Unique Rectangle Discontinuous Nice Loop | 59.307/60.817 | 2.749/2.904 |

Ordinary and exhaustive requests keep the same eight choices, including full proof equality. The selected searches in this table return no proofs in both engines. Complete ratings remain 862 native-default points and 1,212 app-order points. Committed Wasm memory after requests stays at 9.44 MiB. This measures the linear-memory buffer, not RSS or live allocation.

A first operation request on a fresh instance measures 691.618 → 515.082 ms for ordinary hints and 660.896 → 489.550 ms for the exhaustive page. Module instantiation and catalog requests precede these timers. All timings include request encoding and decoding. They exclude worker startup, worker transfer, rendering and result-comparison assertions. These observations do not measure browser cold loading.

| Retained fixture | App rate, main → change | Up to ten hints, main → change | Exhaustive page, main → change | Available choices | Committed MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Quadruple | 1.256/1.459 → 1.244/1.377 | 0.279/0.558 → 0.254/0.372 | 593.923/607.919 → 590.728/752.224 | 31 | 5.88 |
| Odd/Even | 0.179/0.214 → 0.180/0.250 | 0.080/0.090 → 0.081/0.092 | 55.768/56.346 → 55.291/55.982 | 23 | 3.56 |
| Anti-King | 0.159/0.176 → 0.161/0.205 | 0.118/0.135 → 0.118/0.127 | 101.327/105.407 → 101.872/103.703 | 438 | 10.44 |
| Published Non-Consecutive | 0.441/0.481 → 0.438/0.487 | 0.087/0.090 → 0.088/0.092 | 41.467/44.068 → 41.274/41.863 | 70 | 4.06 |
| Two-given Consecudoku | 1.124/1.504 → 1.095/1.164 | 0.786/1.053 → 0.772/0.871 | 0.804/0.886 → 0.778/0.841 | 4 | 1.50 |

| Retained fixture | Candidates, main → change | Exact analysis, main → change | Exact solving, main → change |
| --- | ---: | ---: | ---: |
| Quadruple | 0.060/0.121 → 0.059/0.087 | 3.000/3.110 → 2.925/3.069 | 1.331/1.430 → 1.310/1.400 |
| Odd/Even | 0.020/0.033 → 0.018/0.028 | 0.165/0.217 → 0.180/0.209 | 0.060/0.066 → 0.059/0.063 |
| Anti-King | 0.015/0.018 → 0.015/0.019 | 0.036/0.056 → 0.035/0.041 | 0.022/0.023 → 0.022/0.023 |
| Published Non-Consecutive | 0.020/0.021 → 0.020/0.021 | 0.360/0.407 → 0.362/0.422 | 0.281/0.307 → 0.283/0.302 |
| Two-given Consecudoku | 0.051/0.054 → 0.051/0.060 | 0.390/0.414 → 0.413/0.435 | 0.387/0.408 → 0.403/0.433 |

Retained scores, statuses, proof choices and memory match. These samples do not establish a broad speedup. A quiet Quadruple repeat measures 595.486/615.334 → 600.422/642.138 ms for exhaustive pages, with the same 31 choices. Its app rating measures 1.263/1.448 → 1.262/1.381 ms. Exact analysis measures 2.950/3.636 → 2.908/3.107 ms, and solving measures 1.313/1.363 → 1.308/1.440 ms.

The repeated scan median is about 5 ms slower, and its p95 is about 27 ms slower. This does not reproduce the first run's larger tail, but it also does not establish a retained-case speedup. An early probe can add work when uniqueness is certified and the detector must still search. The earlier heavily contended Whispers exact/rating slowdown does not appear in these quiet paired runs. Remaining detector work and timing tails stay in the broader performance audit.

Reproduce the retained and Whispers runs after building both artifacts:

```sh
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm whispers
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm
```

The app artifact changes from 3,346,737 raw / 895,950 gzip bytes to 3,346,922 / 896,112, an increase of 185 raw and 162 gzip bytes. SHA-256 is `93e7f9364a35b01bf6335efc40adef2de5a254039ec17c9f7bc44a0c25f00340` before and `23e3c1628611abdf1eec975eb5379a46323e9f1c51c709f6620987bc9aad7dd5` after.

| Wasm profile | Main raw/gzip bytes | Earlier eligibility raw/gzip bytes |
| --- | ---: | ---: |
| solver | 2,040,103 / 556,090 | 2,040,103 / 556,090 |
| variant-solver | 2,587,664 / 695,874 | 2,587,805 / 695,956 |
| classic | 2,555,726 / 662,305 | 2,555,726 / 662,305 |
| app | 3,346,737 / 895,950 | 3,346,922 / 896,112 |

All four profile contracts pass. Solver and Classic sizes are unchanged, and variant-solver adds 141 raw / 82 gzip bytes. The final artifact preserves 2,996 complete responses across sixteen corpus positions and all 351 positive practice positions. The comparison includes all 117 detector IDs, full proofs, ratings, traces, every page, custom orders and unchanged catalogs. It preserves search-limit outcomes at 20,000 nodes and the positive Brain Zaps solve at 100,000 nodes.

Focused native cases cover genuine unique proofs, ambiguous geometric support, candidate removals that mimic a uniqueness premise and an exhausted probe on a genuinely unique puzzle. Empty selected Type 1, Unique Loop and BUG+1 scans keep the exact check uninitialized. A Wasm regression preserves the public search-limit status and independently replays the still-available line/shared-house proofs. The final app suite passes 396 tests, and the final Wasm suite passes 243.

The final native release suite passes 295 tests including seven doctests. All sixteen capability combinations, four Wasm profiles, strict full/reduced Cargo docs and TypeScript checks pass. The production/offline build renders 159 routes. The rebuilt app hash matches the measured artifact.

## Shared partial geometric witnesses

[Issue 125](https://github.com/coder13/sudoku-app/issues/125) starts from main `13062ad`, after bounded uniqueness eligibility. Nested Forcing Net still repeats work for candidate assumptions that already have geometric witnesses. Its full variant completion probe can exhaust 512 nodes on Brain Zaps even when weaker Classic geometric completions are available.

The nested search now reuses partial candidate support from the existing Pattern Overlay cache. A recorded digit supports its positive assumption and negative assumptions for the other digits in that cell. Each bit comes from a complete grid that respects the detector's masks and geometric premises. A union of these witnesses does not prove simultaneous assignments or uniqueness. Unwitnessed assumptions still run the original logical search and retain the existing bounded completion probes.

This change adds no solver or search budget. The cache remains local to one proof position and compiled topology. Changed masks or placements invalidate it. The Classic detector only consumes support when its standard-box premises hold. Numeric rule enforcement, technique costs, selected profiles and scoring version 8 remain unchanged.

Paired measurements use Node 26.13.0 on macOS arm64. No compiler or engine-generation process was identified before the timing runs. The desktop remains nondedicated, and the Whispers run has large tails.

Each fixture uses separate engines and alternates their order. Fixed requests use five warmups and twenty measured samples. Exhaustive pages use two warmups and ten samples. Values are milliseconds, median/p95.

| Brain Zaps operation | Main | Shared witnesses |
| --- | ---: | ---: |
| Candidates | 0.074/0.101 | 0.073/0.098 |
| Exact analysis, 100,000 nodes | 21.248/23.611 | 19.083/24.498 |
| Exact solving, 100,000 nodes | 20.067/23.463 | 21.149/23.923 |
| Native default rating | 0.427/0.942 | 0.503/1.315 |
| App-order rating | 0.423/0.917 | 0.418/0.940 |
| Up to ten hints | 919.930/1530.396 | 419.767/699.695 |
| Exhaustive first page | 959.996/1709.189 | 451.916/651.830 |
| Selected Nested Forcing Net | 465.534/512.467 | 2.079/4.218 |

Ordinary and exhaustive requests preserve all eight choices and their complete proofs. Selected Nested Forcing Net returns no proof in both engines. Complete native/app ratings stay at 862/1,212 points. Committed linear memory stays 9.44 MiB. Buffer size is not RSS or live allocation. The slower native-rating samples and timing tails prevent a universal performance claim.

First operation requests on separate fresh instances measure 789.521 → 415.036 ms for ordinary hints and 951.573 → 432.788 ms for the exhaustive page. The selected nested request measures 489.556 → 2.159 ms. Module instantiation and catalog queries precede these timers. Measurements include request encoding and decoding and exclude result-comparison assertions, worker startup, worker transfer and rendering.

| Selected empty Brain Zaps search | Main | Shared witnesses |
| --- | ---: | ---: |
| Unique Rectangle Type 1 | 0.029/0.078 | 0.030/0.035 |
| Unique Loop | 0.019/0.058 | 0.019/0.057 |
| BUG+1 | 0.033/0.112 | 0.033/0.074 |
| Unique Rectangle AIC | 5.925/6.901 | 4.970/8.091 |
| Unique Rectangle Continuous Nice Loop | 5.734/7.760 | 5.605/9.869 |
| Unique Rectangle Discontinuous Nice Loop | 5.323/14.345 | 5.297/7.975 |

| Retained fixture | App rate, main → change | Up to ten hints, main → change | Exhaustive page, main → change | Available choices | Committed MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Quadruple | 1.488/2.964 → 1.414/3.116 | 0.276/0.951 → 0.332/0.744 | 585.680/612.980 → 360.937/396.926 | 31 | 5.88 |
| Odd/Even | 0.180/0.239 → 0.177/0.221 | 0.083/0.148 → 0.081/0.132 | 55.338/63.229 → 51.880/53.636 | 23 | 3.56 |
| Anti-King | 0.160/0.209 → 0.158/0.201 | 0.120/0.137 → 0.121/0.139 | 101.663/104.260 → 101.486/104.204 | 438 | 10.44 |
| Published Non-Consecutive | 0.389/0.485 → 0.388/0.468 | 0.081/0.100 → 0.082/0.100 | 41.335/42.955 → 35.577/36.285 | 70 | 4.06 |
| Two-given Consecudoku | 1.054/1.143 → 1.038/1.156 | 0.757/0.858 → 0.749/0.871 | 0.736/0.821 → 0.721/0.809 | 4 | 1.50 |

| Retained fixture | Candidates, main → change | Exact analysis, main → change | Exact solving, main → change |
| --- | ---: | ---: | ---: |
| Quadruple | 0.064/0.095 → 0.066/0.204 | 2.876/3.003 → 2.859/2.959 | 1.322/1.547 → 1.295/1.399 |
| Odd/Even | 0.018/0.030 → 0.018/0.039 | 0.185/0.215 → 0.179/0.210 | 0.059/0.088 → 0.059/0.090 |
| Anti-King | 0.015/0.039 → 0.015/0.031 | 0.036/0.050 → 0.036/0.041 | 0.023/0.032 → 0.023/0.034 |
| Published Non-Consecutive | 0.019/0.022 → 0.019/0.021 | 0.335/0.385 → 0.341/0.383 | 0.258/0.279 → 0.256/0.291 |
| Two-given Consecudoku | 0.051/0.059 → 0.051/0.066 | 0.367/0.426 → 0.363/0.410 | 0.367/0.400 → 0.368/0.411 |

Retained statuses, scores, proof choices and committed memory match. The Quadruple exhaustive median improves about 38 percent. Smaller differences and timing tails are observational. This run does not measure browser cold loading or concurrency.

Reproduce the paired runs and complete-output comparison after building both artifacts:

```sh
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm whispers
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm
```

The app changes from 3,346,922 raw / 896,112 gzip bytes to 3,350,708 / 893,132. It adds 3,786 raw bytes and saves 2,980 gzip bytes. Before SHA-256 is `23e3c1628611abdf1eec975eb5379a46323e9f1c51c709f6620987bc9aad7dd5`; after is `dd9b4ded80fdf20edd7642b09944a8411aa0b07970dd401b3b360964e24b15aa`.

| Wasm profile | Main raw/gzip bytes | Shared witnesses raw/gzip bytes |
| --- | ---: | ---: |
| solver | 2,040,103 / 556,090 | 2,040,103 / 556,086 |
| variant-solver | 2,587,805 / 695,956 | 2,589,380 / 696,951 |
| classic | 2,555,726 / 662,305 | 2,555,726 / 662,311 |
| app | 3,346,922 / 896,112 | 3,350,708 / 893,132 |

All four profile contracts pass. Solver and Classic raw sizes are unchanged, while gzip differs by -4 and +6 bytes. Variant-solver adds 1,575 raw / 995 gzip bytes. The new fields and witness-sharing code compile only with `variants`.

The final comparison preserves 3,419 complete responses across nineteen corpus positions and all 351 positive practice positions. It covers all 117 detectors, every page, full proofs, traces, ratings, custom orders and exact search-limit outcomes. AI Escargot retains twelve nested proofs at the start, eleven after the checked removal and fifty-three after the checked placement. The actual Wasm worker also verifies puzzle alternation and restoration of the original proof list.

Independent native truth checks compare both assumption polarities with actual complete grids and retain unknown cases with no probe budget. Cache tests invalidate shared support after candidate and placement edits. The unpruned nested search supplies the complete reference proofs at each AI Escargot state. The final Wasm suite passes 245 tests.

All 298 native tests including seven doctests and 397 app tests pass. The sixteen capability combinations, four Wasm profiles, strict full/reduced Cargo documentation and TypeScript checks pass. The production/offline build renders 159 routes and reproduces the measured app hash.

The branch also incorporates main `4757a44` from PR 127. Repeated TypeScript, app/Wasm and production checks pass on the combined puzzle-switching and storage changes. The Rust engine and its build configuration are unchanged by that integration, and the app Wasm retains the measured SHA-256.

## Checked geometric symmetries

[Issue 129](https://github.com/coder13/sudoku-app/issues/129) starts from main `d99b8fb`, after shared partial witnesses and PR 127 app integration. The cache now reuses the existing eight grid transformations to diversify complete geometric witnesses. Every fixed domain constrains a bijective digit mapping. Each transformed grid must respect all actual houses and directed peer exclusions. Every final digit cycle must also satisfy every candidate mask.

A query permits at most 64 nonidentity transformation attempts. Each attempt tries at most nine digit cycles. This work has a separate bound from the existing 128 exact nodes per probe and 4,096 nodes per query. Rejected or exhausted transformations preserve the original witnesses. Unknown support retains the original detector search.

The Brain Zaps opening now gets complete geometric support for all 642 logical candidates within the existing node budget. These grids certify individual assumptions under the detector's geometric premises. They do not certify numeric variant rules, compound assumptions or uniqueness. Numeric hints, singleton placements, selected orders, technique costs and scoring version 8 remain unchanged.

Paired measurements use Node 26.13.0 on macOS arm64. Two unrelated research workers each used roughly one CPU core when the run began. No compiler or engine test was active. This machine is not dedicated to benchmarking. Timing differences on small requests and slower samples remain observational.

Each fixture uses separate engines and alternates their order. Fixed requests use five warmups and twenty measured samples. Exhaustive first pages use two warmups and ten samples. Values are milliseconds, median/p95. Exact analysis and solving permit 100,000 nodes for Brain Zaps and 20,000 for the retained fixtures.

| Brain Zaps operation | Main | Checked symmetries |
| --- | ---: | ---: |
| Candidates | 0.047/0.062 | 0.048/0.057 |
| Exact analysis | 25.146/29.822 | 24.730/29.571 |
| Exact solving | 24.040/29.562 | 23.372/28.689 |
| Native default rating | 0.701/1.658 | 0.612/0.936 |
| App-order rating | 0.491/0.529 | 0.498/0.518 |
| Up to ten hints | 472.566/560.877 | 5.949/12.260 |
| Exhaustive first page | 412.087/479.896 | 6.170/8.319 |
| Selected Nested Forcing Net | 1.916/3.053 | 0.213/0.453 |

Ordinary and exhaustive requests preserve all eight choices and their complete proofs. Selected Nested Forcing Net returns no proof in both engines. Complete native/app ratings stay at 862/1,212 points. Committed Wasm linear memory falls from 9.44 to 1.56 MiB. This measures the buffer size, not RSS or live allocation.

| First request on a fresh instance | Main ms | Checked symmetries ms |
| --- | ---: | ---: |
| Up to ten hints | 449.858 | 11.021 |
| Exhaustive first page | 414.197 | 7.181 |
| Selected Nested Forcing Net | 3.346 | 0.489 |

Module instantiation and catalog queries precede these timers. Measurements include request encoding and decoding. They exclude comparison assertions, worker startup, worker transfer and rendering.

| Selected empty Brain Zaps search | Main | Checked symmetries |
| --- | ---: | ---: |
| Unique Rectangle Type 1 | 0.030/0.051 | 0.030/0.061 |
| Unique Loop | 0.030/0.039 | 0.029/0.039 |
| BUG+1 | 0.029/0.057 | 0.029/0.037 |
| Unique Rectangle AIC | 4.894/7.172 | 4.560/7.053 |
| Unique Rectangle Continuous Nice Loop | 4.908/6.728 | 5.631/7.113 |
| Unique Rectangle Discontinuous Nice Loop | 4.321/6.267 | 4.312/6.073 |

| Retained fixture | App rate, main → change | Up to ten hints, main → change | Exhaustive page, main → change | Choices | Committed MiB, main → change |
| --- | ---: | ---: | ---: | ---: | ---: |
| Quadruple | 2.033/3.190 → 1.983/2.860 | 0.343/1.523 → 0.349/0.981 | 611.814/671.454 → 243.850/262.765 | 31 | 5.88 → 1.50 |
| Odd/Even | 0.259/0.428 → 0.262/0.439 | 0.127/0.231 → 0.133/0.260 | 86.931/94.860 → 85.912/92.305 | 23 | 3.56 → 3.56 |
| Anti-King | 0.245/0.280 → 0.243/0.298 | 0.181/0.195 → 0.183/0.337 | 163.824/175.212 → 164.479/177.523 | 438 | 10.44 → 10.44 |
| Published Non-Consecutive | 0.610/0.898 → 0.607/0.902 | 0.181/0.211 → 0.178/0.191 | 56.568/62.818 → 58.198/62.018 | 70 | 4.06 → 4.06 |
| Two-given Consecudoku | 1.523/2.984 → 1.520/2.359 | 1.026/1.149 → 0.469/0.491 | 1.112/1.160 → 0.503/0.549 | 4 | 1.50 → 1.50 |

| Retained fixture | Candidates, main → change | Exact analysis, main → change | Exact solving, main → change | Native rate, main → change |
| --- | ---: | ---: | ---: | ---: |
| Quadruple | 0.088/0.104 → 0.089/0.110 | 4.295/6.162 → 4.515/6.320 | 1.951/2.884 → 1.966/2.864 | 1.892/2.997 → 1.900/2.870 |
| Odd/Even | 0.040/0.052 → 0.041/0.061 | 0.264/0.393 → 0.262/0.387 | 0.086/0.135 → 0.092/0.131 | 0.193/0.374 → 0.196/0.354 |
| Anti-King | 0.023/0.036 → 0.023/0.025 | 0.072/0.137 → 0.071/0.084 | 0.050/0.058 → 0.050/0.057 | 0.193/0.406 → 0.197/0.343 |
| Published Non-Consecutive | 0.046/0.049 → 0.047/0.048 | 0.540/0.772 → 0.545/0.786 | 0.399/0.589 → 0.400/0.622 | 0.537/0.869 → 0.528/0.912 |
| Two-given Consecudoku | 0.126/0.338 → 0.127/0.156 | 0.609/0.922 → 0.608/0.948 | 0.611/1.121 → 0.611/1.139 | 1.516/2.487 → 1.506/2.854 |

Every measured response matches exactly. Quadruple preserves all 31 choices while its exhaustive median falls about 60 percent and committed memory falls to 1.50 MiB. Anti-King and published Non-Consecutive show slower exhaustive medians in this run. Several cheap requests and uniqueness searches also show slower samples. These measurements do not establish a universal improvement or browser startup performance.

Reproduce the runs and complete-output comparison after building both artifacts:

```sh
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm whispers
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm
```

The app changes from 3,350,708 raw / 893,132 gzip bytes to 3,340,960 / 893,387. It saves 9,748 raw bytes and adds 255 gzip bytes. Before SHA-256 is `dd9b4ded80fdf20edd7642b09944a8411aa0b07970dd401b3b360964e24b15aa`. After SHA-256 is `635869d77ae31823b15a55da1fdbf5ec6cc56b1de62ae88da87c0a8a4f88b465`.

| Wasm profile | Main raw/gzip bytes | Checked symmetries raw/gzip bytes |
| --- | ---: | ---: |
| solver | 2,040,103 / 556,086 | 2,040,103 / 556,086 |
| variant-solver | 2,589,380 / 696,951 | 2,592,614 / 697,355 |
| classic | 2,555,726 / 662,311 | 2,555,726 / 662,311 |
| app | 3,350,708 / 893,132 | 3,340,960 / 893,387 |

All four profile contracts pass. Variant-solver adds 3,234 raw / 404 gzip bytes. The new support code compiles only with `variants`. Solver-only and Classic sizes remain identical.

Independent tests reject both forms of conflicting fixed-domain mappings, forbidden candidates, extra-house violations, directed peer conflicts and unsafe transformations of connected irregular regions. Exhausted budgets retain seed support. Small domains still match an exhaustive assignment oracle. AI Escargot retains partial support and all twelve nested proofs, eleven after the checked removal and fifty-three after the checked placement.

The final comparison preserves 3,419 complete responses across nineteen corpus positions, all 117 detectors and all 351 positive practice positions. It covers every page, full proofs, traces, ratings, custom orders and exact search-limit outcomes. The actual Wasm worker checks candidate/placement edits, puzzle alternation and numeric hints. Its 4,096-node Brain Zaps analysis still returns `search-limit`, while 100,000 nodes proves uniqueness.

All 302 native tests including seven doctests, 397 app tests and 246 Wasm tests pass. TypeScript, sixteen capability combinations, four Wasm profiles and strict full/reduced Cargo documentation pass. The production/offline build renders 159 routes and reproduces the measured app hash.

## Palindrome app integration

Clover’s Palindrome Sudoku (GAS S5 P094, 2025-09-08) supplies 15 givens and four six-cell lines. Philip Newman’s Anti-Knight Palindrome (GAS S5 P111, 2025-09-25) supplies eight givens and eight lines. Puzzle and completion PDFs were rendered and visually checked. Their extracted completion rows run in reverse vertical order, so transcriptions follow the visible grids. Newman’s paths also match the PDF vectors.

The fixture files retain source pages, PDF links, rule definitions and printed completions. An independent digit-set solver checks standard houses, knight exclusions and mirrored equality. Both puzzles have one completion matching the source. Removing Palindrome yields at least two completions. Native default logical solves finish at 762 and 1,156 points. App-order solves finish at 1,042 and 1,496 points. All four ratings are Easy at scoring version 8.

- [Clover source](https://www.gmpuzzles.com/blog/2025/09/palindrome-sudoku-by-clover/) and [fixture](palindrome-clover.json).
- [Newman source](https://www.gmpuzzles.com/blog/2025/09/anti-knight-palindrome-sudoku-by-philip-newman/) and [fixture](palindrome-newman.json).
- [Coach FgZb, “Whisper Lines”](https://sudoku.coach/en/s/FgZb) and [unmodified exports](palindrome-coach.json). This one-given puzzle has five Whispers and three Palindrome lines.
- [Coach FzzD, “Palindrome 14”](https://sudoku.coach/en/s/FzzD) also contains Greater/Less and Difference markers. Full import still rejects its unsupported inequalities. [Inequality issue](https://github.com/coder13/sudoku-app/issues/47).

Coach’s Palindrome compiler groups segments sharing any cell, then collects their cells in insertion order without duplicates. Each connected component becomes one logical line. A transitively connected segment can extend the component on a later scan. The app matches this order and preserves raw drawing segments separately, including branches and revisits. Different constraint layers remain separate.

The audited [versioned compiler](https://sudoku.coach/js/jCfXtZs-1776367508519.js) maps `palindromeLine` to `jX1r9`. It compiles `jX25b()` through `jX2ih()`, `jX3l9()` and the ordered `jX2ia` container. Its solver pairs `cells[i]` with `cells[numCells - 1 - i]` using equality. Source SHA-256 is `567c7f9023cfff3a7f8feb4f8393d3b10a1f85f9539ef48f31c577b105ad521f`. No downloaded site JavaScript was executed.

The native `palindrome` rule keeps distinct logical `cells` and optional drawing `segments`. The drawing-cell union must equal the logical cell set. Drawing paths can revisit cells, but their order never changes the mirrored equalities. Old JSON omits the new field. Ordinary Rust definitions set `segments: None`. All rotations and reflections transform both representations.

Grid clues draw the original paths and name each cell’s actual partner. Odd middle cells have no extra restriction. Paired cells retain the same digit during candidate cleanup and flag different placed digits as conflicts. They are not same-digit peers. Shared line edges use a narrow dashed overlay to keep both clue families visible, with dots in front. Static SVG exports from the actual clue component were inspected with light and dark colors. This review does not replace a live viewport interaction review.

Component checks cover desktop/mobile grids, original geometry, overlaps, sharing, lessons, naming preferences, hint cards and solution lists. Worker checks cover complete app-order traces, every action against the independent solution, direct mirror-proof replay, selected hints, pages, Finder counts and practice. Drawn and ordinary definitions retain identical complete step lists and rating values. Saved geometry and history survive reload, undo and redo. Native generation preserves drawing paths, targets 30 givens and independently requires Palindrome. New puzzle presets remain behind separate difficulty calibration.

The combination audit keeps Palindrome active while selecting every subset of thirteen other rendered families, including optional Whispers. Across 8,192 fixed-clue selections, 6,144 validate and preserve all selected rules. The other 2,048 intentionally contradict the fixed completion’s diagonal/knight requirements and reject import. This is a fixed-fixture combination audit, not a claim to test every possible clue configuration. Sparse published and real Coach fixtures independently test rule dependence.

Paired measurements use Node 26.13.0 on macOS arm64 against main `74248c7`. No compiler, engine test or identified generation worker was active at the timing start. The machine remains nondedicated. Engines alternate execution order. Fixed requests use five warmups and twenty measured samples. Exhaustive first pages use two warmups and ten samples. Times are milliseconds, median/p95. Brain Zaps uses its existing 100,000-node bound. The mixed Palindrome/Whispers fixture uses 1,000,000 exact nodes, and other fixtures use 20,000.

| Fixture | Candidates, main → integration | Exact analysis, main → integration | Exact solving, main → integration |
| --- | ---: | ---: | ---: |
| Clover Palindrome | 0.028/0.032 → 0.028/0.039 | 0.062/0.079 → 0.064/0.098 | 0.049/0.053 → 0.047/0.055 |
| Newman Anti-Knight Palindrome | 0.021/0.027 → 0.022/0.031 | 0.069/0.077 → 0.069/0.073 | 0.041/0.044 → 0.041/0.047 |
| Coach Palindrome/Whispers | 0.023/0.028 → 0.023/0.024 | 26.747/28.156 → 26.826/27.253 | 26.144/26.343 → 26.157/26.504 |

| Fixture | Native rate, main → integration | App rate, main → integration | Ten hints, main → integration | Exhaustive page, main → integration |
| --- | ---: | ---: | ---: | ---: |
| Clover Palindrome | 0.123/0.188 → 0.190/0.234 | 0.140/0.157 → 0.139/0.184 | 40.573/43.093 → 40.651/41.477 | 40.232/40.486 → 40.250/40.423 |
| Newman Anti-Knight Palindrome | 0.849/0.869 → 0.833/0.861 | 0.874/0.879 → 0.872/0.877 | 0.138/0.145 → 0.138/0.144 | 304.949/310.962 → 305.943/315.208 |
| Coach Palindrome/Whispers | 0.798/0.818 → 0.810/0.845 | 411.890/417.557 → 410.672/414.719 | 0.220/0.243 → 0.218/0.241 | 2.338/2.416 → 2.369/2.495 |

Every measured response matches exactly. Exhaustive requests retain seven Clover, 48 Newman and ten Coach choices. Ordinary bounded requests return seven, ten and ten choices. Committed Wasm buffers remain 3.38, 5.06 and 8.31 MiB respectively. Buffer size is not RSS or live allocation. Cold first requests are available from the reproducible benchmark and exclude module instantiation, catalog queries, worker startup and rendering.


| Fresh-instance first request | App rate, main → integration ms | Ten hints, main → integration ms | Exhaustive page, main → integration ms |
| --- | ---: | ---: | ---: |
| Clover Palindrome | 0.841 → 0.699 | 63.775 → 63.729 | 41.141 → 41.485 |
| Newman Anti-Knight Palindrome | 0.985 → 0.989 | 0.527 → 0.528 | 298.586 → 295.669 |
| Coach Palindrome/Whispers | 413.392 → 410.528 | 0.621 → 0.437 | 2.532 → 2.588 |

The app-order rating on the real Coach combination remains stalled at 527 points and about 411 ms in both engines. The native default enables 31 techniques, while the app profile enables 112. Ordinary hints remain about 0.22 ms. [Issue 134](https://github.com/coder13/sudoku-app/issues/134) tracks per-technique profiling under the unchanged app order. The integration does not fix that existing bottleneck. Slower native Clover rating samples are also retained in the table.

| Retained fixture | App rate, main → integration | Ten hints, main → integration | Exhaustive page, main → integration |
| --- | ---: | ---: | ---: |
| Quadruple | 1.190/1.218 → 1.165/1.201 | 0.225/0.234 → 0.221/0.230 | 146.666/150.891 → 146.844/150.083 |
| Odd/Even | 0.167/0.179 → 0.167/0.177 | 0.080/0.086 → 0.079/0.083 | 50.814/51.896 → 50.525/51.499 |
| Anti-King | 0.155/0.167 → 0.155/0.166 | 0.115/0.123 → 0.114/0.120 | 97.296/99.710 → 96.306/100.025 |
| Published Non-Consecutive | 0.387/0.394 → 0.385/0.391 | 0.079/0.083 → 0.080/0.084 | 35.436/36.215 → 35.112/36.146 |
| Two-given Consecudoku | 1.002/1.018 → 1.012/1.025 | 0.303/0.314 → 0.307/0.322 | 0.305/0.321 → 0.313/0.320 |

Retained responses, proof choices and committed memory match. Small timing differences and slower samples remain observational. These runs include request encoding and decoding, and exclude comparison assertions, worker startup, transfer and rendering.

Reproduce after building both artifacts:

```sh
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm palindrome palindrome-knight palindrome-whispers
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm
```

| Wasm profile | Main raw/gzip bytes | Palindrome integration raw/gzip bytes |
| --- | ---: | ---: |
| solver | 2,040,103 / 556,086 | 2,040,103 / 556,086 |
| variant-solver | 2,592,614 / 697,355 | 2,593,462 / 696,489 |
| classic | 2,555,726 / 662,311 | 2,555,726 / 662,311 |
| app | 3,340,960 / 893,387 | 3,366,184 / 898,283 |

The app adds 25,224 raw / 4,896 gzip bytes. Variant-solver adds 848 raw bytes and saves 866 gzip bytes. Solver-only and Classic sizes remain identical. Before SHA-256 is `635869d77ae31823b15a55da1fdbf5ec6cc56b1de62ae88da87c0a8a4f88b465`. After is `2446be93ddd6f4c8fba9ade266d60f63d60a19d53a7e60609e35d96ec04b0812`.

All 3,419 complete retained responses match across nineteen corpus positions, 117 detectors and 351 positive practice positions. Proofs, pages, traces, ratings, custom profiles and exact search-limit outcomes remain unchanged. Local validation passes 307 native tests including seven doctests, 413 app tests, 253 Wasm tests, sixteen capability combinations, four package profiles and strict full/reduced Cargo documentation. TypeScript and the 159-route production/offline build pass.


## Mask-constrained digit witnesses

[Issue 134](https://github.com/coder13/sudoku-app/issues/134) starts from main `1539f74`, after the Palindrome app integration. The published Coach FgZb puzzle exposes a slow app-order rating. Its 112 enabled techniques remain unchanged. The native default enables 31 of those techniques.

The cache now finds bijective digit mappings when the existing cycles leave candidates unsupported. A source digit can use only targets allowed at every occurrence. A matching assigns all nine source digits to distinct targets while retaining one requested assignment. Such a mapping preserves every house and equal-digit exclusion of the checked seed grid. Every resulting digit also obeys its candidate mask.

Each query permits at most 512 matching attempts, separately from completion nodes and spatial transformations. Failed or exhausted attempts supply no negative evidence. Unknown candidates retain the original detector search. Numeric rule validity, singleton eligibility, simultaneous assumptions and uniqueness keep their existing boundaries.

Independent enumeration checks every three-digit domain matrix, with nonadjacent labels among the nine digits. Tests also check a nine-digit displacement cycle and independent swaps that cyclic renaming cannot supply. The swap witnesses satisfy both diagonals, a directed extra exclusion and every mask. Existing tests retain forbidden candidates, irregular geometry, singleton safety, unknown support and exact fallback.

The strict comparison preserves 6,210 complete responses across forty positions and 351 positive practice examples. It includes all 117 detector lists, complete traces, ratings, custom orders, search limits and every hint page. The new optional corpus replays all nineteen positions of the Coach trace. No response normalization hides changes. The historical corpus still preserves all 3,419 responses.

All local gates pass: 310 native tests, 413 app tests, 253 Wasm tests, sixteen capability combinations and four package profiles. Strict full/reduced Cargo documentation, TypeScript and the 159-route production/offline build also pass. Technique costs and variant scoring version 8 remain unchanged.

Measurements use Node 26.13.0 on macOS arm64. Fixed requests use five warmups and twenty measured samples, alternating the two engines. Exhaustive first pages use two warmups and ten measured samples. Fresh instances measure first requests separately. Every sample compares its complete response outside the timed region. No identified compiler, engine test or generation worker was active at the start. The machine is not dedicated.

Times below are median/p95 milliseconds. The first table uses the unmodified Coach FgZb export and the same exact-search budgets.

| Coach FgZb operation | Main | Digit matching |
| --- | --- | --- |
| Candidates | 0.021/0.026 | 0.021/0.022 |
| Exact analysis | 27.195/27.754 | 26.425/26.578 |
| Exact solve | 26.476/26.754 | 26.524/26.613 |
| Native default rating | 0.829/0.838 | 0.801/0.803 |
| App-order rating | 413.446/415.541 | 229.884/232.942 |
| Ten-hint request | 0.216/0.229 | 0.213/0.258 |
| Exhaustive first page | 2.393/2.434 | 2.331/2.372 |

Both ratings stall at 527 points after eighteen steps. The app-order median falls by about 44%. Both hint requests retain ten choices. Committed Wasm memory stays at 8.31 MiB.

| Coach FgZb first request | Main ms | Digit matching ms |
| --- | --- | --- |
| Candidates | 0.071 | 0.070 |
| Exact analysis | 27.080 | 25.988 |
| Exact solve | 26.331 | 25.583 |
| Native default rating | 0.912 | 0.893 |
| App-order rating | 413.377 | 232.206 |
| Ten-hint request | 0.337 | 0.317 |
| Exhaustive first page | 2.436 | 2.428 |

| Retained fixture | App rate, main → matching | Ordinary hints, main → matching | Exhaustive page, main → matching | Choices, ordinary/exhaustive | Unchanged memory, MiB |
| --- | --- | --- | --- | --- | --- |
| Quadruple | 1.178/1.201 → 1.164/1.182 | 0.224/0.232 → 0.223/0.237 | 147.614/149.804 → 147.090/149.848 | 10/31 | 1.50 |
| Odd/Even | 0.170/0.181 → 0.171/0.183 | 0.079/0.084 → 0.079/0.085 | 50.365/50.738 → 50.299/50.741 | 10/23 | 3.56 |
| Anti-King | 0.153/0.159 → 0.150/0.154 | 0.115/0.120 → 0.113/0.119 | 96.816/97.613 → 95.974/97.782 | 10/438 | 10.44 |
| Non-Consecutive | 0.384/0.399 → 0.381/0.389 | 0.083/0.089 → 0.081/0.087 | 34.582/34.687 → 34.585/34.663 | 10/70 | 4.06 |
| Coach white-dot exceptions | 1.013/1.026 → 0.985/0.998 | 0.311/0.323 → 0.315/0.327 | 0.314/0.321 → 0.320/0.326 | 4/4 | 1.50 |
| Brain Zaps Whispers | 0.307/0.331 → 0.307/0.320 | 3.250/3.275 → 3.115/3.147 | 3.268/3.279 → 3.112/3.154 | 8/8 | 1.56 |
| Clover Palindrome | 0.116/0.124 → 0.115/0.121 | 40.362/40.854 → 40.441/41.314 | 40.250/40.402 → 40.195/40.349 | 7/7 | 3.38 |
| Newman Anti-Knight Palindrome | 0.863/0.872 → 0.865/0.870 | 0.130/0.168 → 0.129/0.142 | 300.151/310.149 → 299.819/309.259 | 10/48 | 5.06 |

The table includes slower samples. Coach white-dot exhaustive requests rise from 0.314 to 0.320 ms median. Clover's ordinary request rises from 40.362 to 40.441 ms. Odd/Even and Newman's app ratings also have slightly slower medians. These measurements do not establish a general speedup for every puzzle.

| Wasm profile | Main raw/gzip bytes | Digit matching raw/gzip bytes |
| --- | --- | --- |
| Solver | 2,040,103 / 556,086 | 2,040,103 / 556,086 |
| Variant solver | 2,593,462 / 696,489 | 2,596,592 / 699,819 |
| Classic | 2,555,726 / 662,311 | 2,555,726 / 662,311 |
| App | 3,366,184 / 898,283 | 3,374,552 / 903,296 |

The app adds 8,368 raw bytes and 5,013 gzip bytes. The variant solver adds 3,130 raw bytes and 3,330 gzip bytes. Solver and Classic sizes remain identical. The matching code compiles only with `variants`.

The compared app artifacts have SHA-256 hashes:

- Main: `2446be93ddd6f4c8fba9ade266d60f63d60a19d53a7e60609e35d96ec04b0812`.
- Digit matching: `5f976289d3bd87964cc0e61065280e967d2ac932cd76cd563d6b8d6dcd3bff83`.

Repeat the comparison and measurements with:

```sh
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm --palindrome-trace
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm quadruple parity anti-king non-consecutive nc-white-dots whispers palindrome palindrome-knight palindrome-whispers
```

The remaining 230 ms app-order rating still needs work in the broader [performance audit](https://github.com/coder13/sudoku-app/issues/88). The geometric cache cannot replace actual numeric rules or prove an unknown candidate impossible. Keep improvements to the remaining expert searches separate and preserve their positive proofs.


## Inequality app integration

[CodeNameVerity's Palindrome 14, Coach FzzD](https://sudoku.coach/en/s/FzzD) combines zero givens, three Palindrome paths, seven directed inequalities and five white dots. The unmodified export is `palindrome-coach.json`, example 1; the complete native definition and independently verified completion are in `inequality-palindrome14.json`. [The original published diagram](https://sudoku.coach/open_graph_images/FzzD.png) was inspected on 2026-11-18. Its SHA-256 is `ce241d481d35ed65b3b6aee192a3acd10f22b6d1c47025671d726fed806c5a85`. Every sign direction, dot and line matches the export. Exact house propagation in [PR 143](https://github.com/coder13/sudoku-app/pull/143) made its verification practical without increasing the default budget.

The app decodes each ordered `greaterLess` pair as `less < greater`, preserving all companion rules. It rejects invalid endpoints, parameters and unknown semantics. A sign's vertex faces the smaller cell after every grid transformation. Distant endpoints have a connecting line. A sign sharing a pair with a dot is offset so both clues remain visible. Cell labels identify the smaller and larger partners. Actual SVG component paths were rasterized at 900 and 360 pixels and compared with the published diagram. This is static clue review; live viewport interaction review remains separate.

Input and note cleanup use the directed relation in both directions. All 81 digit pairs are checked, including equal digits and the 1/9 boundaries. Tests preserve unrelated notes, compatible notes, undo, redo and bulk entries. The complete published puzzle imports through the actual preview service, saves and reloads, preserves its shared definition, replays proofs and exposes several hints and Finder counts. Every inequality proof is independently checked by enumerating allowed digit pairs. The three existing practice exercises retain their eight-point cost and checked answers.

The app order retains the 98-point, nine-step stalled logical path and seven opening hint choices. Its exact verified completion remains the published grid. A partial walkthrough is reported as stalled. This integration does not claim a complete logical solve of FzzD. Inequality is available for imported and shared puzzles; New puzzle recipes remain conditional on calibration.

Validation passes 423 app tests, 258 Wasm contracts, TypeScript and the 159-route production/offline build. An expanded fixed-clue test checks 16,384 family selections with Palindrome present: 12,288 compatible selections pass and 4,096 deliberately contradictory selections reject. These are bounded fixtures, not a claim that arbitrary family combinations are feasible. The eight transformations preserve every directed endpoint and companion rule. Native code and the released engine artifact are unchanged.

Measurements use Node 26.13.0 on macOS arm64. The same engine artifact runs on both sides of the paired control. Fixed engine calls use five warmups/twenty samples; exhaustive pages use two/ten. Both exact operations complete under the unchanged one-million-node budget. Values are median/p95 milliseconds for the integration build. They include serialization and exclude worker startup, transfer and rendering. Identical binaries and small timing differences do not establish an engine speedup.

| Engine request | Median/p95 ms |
| --- | --- |
| Candidates | 0.048/0.127 |
| Unique analysis | 480.125/486.529 |
| Exact solve | 392.463/396.248 |
| Native-order rating | 0.113/0.128 |
| App-order rating | 5.936/6.018 |
| Ten-hint request | 5.744/5.860 |
| Exhaustive first page | 5.674/5.707 |

Both hint requests expose seven choices. The committed Wasm buffer is 1.50 MiB in this sequence. Buffer size is not RSS or live allocation.

A second benchmark exercises the real app callers through the in-process test transport. It excludes browser worker startup, transfers, layout and paint. Preview uses two warmups/five samples, so its p95 is the maximum; the other callers use five/twenty. Server rendering starts after module loading. Assertions are outside the timed regions. The nondedicated host had no identified compiler or engine test running during measurement.

| App caller | Median/p95 ms |
| --- | --- |
| Decode, verify, solve and prepare preview | 909.715/913.208 |
| Play candidates | 0.036/0.045 |
| Ten hints | 5.770/6.007 |
| Partial solution walkthrough | 6.258/6.705 |
| Enter a digit with both note types populated | 0.048/0.055 |
| Board server rendering | 1.752/2.787 |

App Wasm stays at 3,366,959 raw / 899,869 gzip bytes with SHA-256 `fae4f83d56e56392a4f4685721d6b01edf60efdbca25b3c2f1bdc4b9a2c06547`. Across all fourteen generated client JavaScript assets, the build grows from 1,980,133 raw / 483,458 gzip bytes to 1,981,956 / 484,035, an increase of 1,823 raw and 577 gzip bytes. This sum is not a per-route transfer measurement. Gzip uses Python's default compression with a fixed timestamp in both builds.

Repeat after building the app:

```sh
node --experimental-strip-types --test scripts/bench-inequality-app.mts
node --experimental-strip-types scripts/bench-engine-pruning.mjs main.wasm app.wasm inequality-palindrome14
```

## Exact house propagation for sparse mixed puzzles

[Issue 139](https://github.com/coder13/sudoku-app/issues/139) compares main `9d298af` with search-only house propagation. The source-linked `inequality-palindrome14.json` preserves CodeNameVerity's [Palindrome 14, Coach FzzD](https://sudoku.coach/en/s/FzzD). Its zero-given definition contains three Palindrome paths, seven directed inequalities and five white dots. The original export remains in `palindrome-coach.json`. No answer digits enter the search definition.

The independent array-of-digits counter proves uniqueness and reproduces the published completion. Removing only inequalities yields multiple completions. It implements directed pairs in both directions, preserving the asymmetric predicate. Filled-answer tests also check the opposite inequality direction. The earlier independent propagation ablation found no completion before its 100,000-call cap without house Hidden Singles. With them it proves uniqueness in 52,244 calls. Independent calls are not native search nodes.

Exact search now checks the union of candidate bits in each enforced house. A missing digit without support rejects the branch. A digit supported by one cell restricts that cell. Two missing digits forced into one cell reject the branch. Existing numeric restrictions repeat after changes. Already forced cells proceed before another complete house scan. The restrictions only remove candidates, so the propagation reaches a bounded fixpoint.

The compiler derives enforced houses from the actual peer exclusions. Region borders can remain for Region Sum lines after a generation dependency check disables region distinctness. Such geometry does not restore that rule. Tests cover retained geometry, replacement Jigsaw regions, diagonals, extra houses and contradictory support. Every recursive visit still costs one node, including the starting visit. Zero-node exhaustion, direct conflicts, unsolvable positions, unique positions and ambiguous positions retain separate outcomes.

Public candidate requests and logical profiles retain their previous masks and deductions. Seeded completion sampling retains its established traversal and random draws. Bounded logical uniqueness eligibility also retains its established traversal. A first prototype let stronger exact verification trigger expensive empty Unique Rectangle chain searches, raising the FgZb app rating median from 102 to 246 ms. Per-technique profiling identified those searches. A source-linked FgZb regression separates the stronger public verification result from the exhausted internal eligibility probe, preserving hint scheduling. Generation's exact uniqueness checks use the stronger propagation. FzzD now verifies and solves within the unchanged one-million-node default; 20,000 nodes still exhaust. The already playable FgZb Palindrome/Whispers combination also improves from exhausted to unique at 20,000 nodes. FzzD's logical profiles still stall after nine steps at 98 points, scoring version 8, with seven opening choices. Inequality rendering and import remain open in [issue 47](https://github.com/coder13/sudoku-app/issues/47).

The final source passes 321 native tests, 415 app tests, 255 Wasm tests, sixteen native capability combinations and four Wasm profiles. TypeScript, strict full/reduced Cargo documentation and the 159-route production/offline build pass. The complete-response comparison checks 6,426 variant responses: 6,388 match exactly and 38 improve previously exhausted exact outcomes. Every improved result agrees with the original engine at a larger explicit budget. Another 148 Classic responses match exactly. These checks cover 41 corpus positions, all 351 positive practice examples, all 117 detector IDs, full proof data, custom orders, every hint page and two seeded completions per corpus position. No normalization hides a proof or score change.

An optimized native prototype was profiled for five seconds at one-millisecond intervals. Debug symbols and inline-frame attribution separated 3,635 exclusive leaf samples: 1,400 numeric restriction samples (38.51%), 2,112 house propagation samples (58.10%), 122 branching/traversal samples (3.36%) and one other sample. Compilation was below that sampling resolution. Recursive inclusive counts were not added together. This was the initial complete-house-scan prototype. It motivated singleton deferral and bitset support counts; these shares do not describe the final optimized build.

The final native phase benchmark uses five warmups and forty measured calls on macOS arm64. Times are median/p95 milliseconds. Compilation is 0.009/0.013, prepared public candidates 0.001/0.001, exact analysis 239.232/243.046 and exact solving 196.723/202.689. The latter two reuse the compiled puzzle at the same one-million-node budget and validate unique/published outcomes. They do not include compilation. The host is not dedicated, and sampled CPU shares are not wall-clock phase durations.

Paired Wasm measurements use Node 26.13.0 on macOS arm64. Engines alternate execution order. Exact calls use two warmups and five measured samples at the same ten-million-node budget so both builds complete the same work. The p95 of five samples is the maximum. Timings include request serialization and exclude assertions, instantiation, workers, transfers and rendering. No identified compiler or engine test ran concurrently. Small differences and long tails remain observational on this nondedicated host.

| FzzD completed exact operation | Main median/p95 ms | House propagation median/p95 ms |
| --- | --- | --- |
| Unique analysis | 6,603.088/6,712.288 | 483.132/497.071 |
| Published completion | 5,726.990/5,784.936 | 391.986/401.016 |

The medians improve by about 13.7× and 14.6×. Separate one-million-node calls exhaust in main and complete in the new build. Those different outcomes are not used as a same-work latency comparison. Both instances commit 1,441,792 bytes of Wasm memory. Committed buffer size is not RSS or live allocation.

Generation uses seeds 1–20, six attempts, 20,000 nodes per exact check and no warmups. Each row produces twenty successful, distinct serialized puzzles in both builds. All twenty complete generated values, including their ratings, agree for each recipe. Distinct serialized puzzles do not establish equivalence-class yield. The original engine validates every returned full completion; the producing build verifies uniqueness at the requested budget. Times are median/p95 milliseconds.

| Generation recipe | Main | House propagation | Unchanged committed bytes |
| --- | --- | --- | ---: |
| Classic, 30 givens | 0.501/0.734 | 0.578/0.814 | 1,441,792 |
| X Sudoku, 26 givens | 0.549/0.771 | 0.581/0.730 | 1,441,792 |
| Killer, 15 givens | 2.466/2.903 | 2.680/3.233 | 1,441,792 |
| Jigsaw/Killer, 15 givens | 2.265/2.484 | 2.436/2.581 | 1,507,328 |
| Windoku, 26 givens | 0.718/2.067 | 0.755/2.140 | 1,441,792 |

These already cheap recipes show small median increases rather than a generation speedup. The target improvement is sparse exact verification. Calibrated app recipes also pass the complete Wasm suite; changing seeded sampling is outside this optimization.

The retained-fixture pass uses five warmups/twenty samples for fixed requests and two/ten for exhaustive first pages. Requests alternate engines and compare complete responses outside timing. All exact operations complete in both builds at identical budgets: 100,000 nodes for Brain Zaps, one million for FgZb and 20,000 for the other fixtures. Times are median/p95 milliseconds.

| Retained exact fixture | Unique analysis, main → improved | Exact solve, main → improved |
| --- | --- | --- |
| Quadruple | 2.777/2.812 → 0.491/0.521 | 1.253/1.266 → 0.387/0.396 |
| Odd/Even | 0.177/0.188 → 0.027/0.028 | 0.058/0.066 → 0.027/0.042 |
| Anti-King | 0.035/0.038 → 0.022/0.022 | 0.022/0.025 → 0.021/0.025 |
| Non-Consecutive | 0.321/0.324 → 0.095/0.095 | 0.250/0.260 → 0.095/0.102 |
| Coach white-dot exceptions | 0.391/0.398 → 0.348/0.354 | 0.401/0.404 → 0.349/0.353 |
| Brain Zaps Whispers | 13.451/13.544 → 14.829/14.914 | 13.399/13.488 → 14.795/14.858 |
| Clover Palindrome | 0.056/0.057 → 0.034/0.035 | 0.042/0.042 → 0.035/0.036 |
| Newman Anti-Knight Palindrome | 0.068/0.068 → 0.043/0.044 | 0.040/0.041 → 0.044/0.060 |
| Coach FgZb | 26.316/26.599 → 0.521/0.554 | 25.772/25.985 → 0.113/0.117 |

| Retained fixture | App rate, main → improved | Ordinary hints, main → improved | Exhaustive page, main → improved | Committed MiB, main → improved |
| --- | --- | --- | --- | --- |
| Quadruple | 1.177/1.228 → 1.176/1.194 | 0.230/0.265 → 0.224/0.252 | 146.169/148.621 → 146.024/147.663 | 1.50 → 1.50 |
| Odd/Even | 0.168/0.181 → 0.167/0.177 | 0.083/0.093 → 0.082/0.090 | 50.886/58.092 → 50.852/51.480 | 3.56 → 3.56 |
| Anti-King | 0.151/0.162 → 0.155/0.157 | 0.116/0.122 → 0.115/0.119 | 95.614/96.043 → 95.909/96.222 | 10.44 → 10.44 |
| Non-Consecutive | 0.386/0.448 → 0.383/0.415 | 0.080/0.084 → 0.079/0.081 | 34.591/35.287 → 34.423/35.067 | 4.06 → 3.69 |
| Coach white-dot exceptions | 1.017/1.028 → 1.007/1.026 | 0.315/0.325 → 0.314/0.324 | 0.322/0.328 → 0.320/0.324 | 1.50 → 1.50 |
| Brain Zaps Whispers | 0.303/0.314 → 0.305/0.319 | 3.099/3.115 → 3.080/3.115 | 3.120/3.242 → 3.097/3.217 | 1.56 → 1.56 |
| Clover Palindrome | 0.112/0.122 → 0.116/0.124 | 40.331/40.827 → 40.358/40.771 | 40.396/41.081 → 40.610/41.119 | 3.38 → 3.38 |
| Newman Anti-Knight Palindrome | 0.894/0.911 → 0.869/0.875 | 0.127/0.129 → 0.127/0.129 | 206.219/212.431 → 207.488/214.173 | 5.06 → 5.06 |
| Coach FgZb | 103.285/107.736 → 100.926/104.065 | 0.217/0.260 → 0.218/0.254 | 2.335/2.404 → 2.369/2.426 | 8.31 → 8.31 |

All responses and choices match. Ordinary/exhaustive choice counts remain 10/31, 10/23, 10/438, 10/70, 4/4, 8/8, 7/7, 10/48 and 10/10 in table order. The FgZb rating regression is resolved: 103.285/107.736 ms becomes 100.926/104.065 ms. Its selected final-position Direct Tridagon, Tridagon Forcing Net and Tridagon AIC proof lists remain empty.

Retained costs remain visible. Brain Zaps exact analysis rises from 13.451 to 14.829 ms median and solving from 13.399 to 14.795 ms. Newman solving and exhaustive hints, Clover exhaustive hints and several cheap generation medians also rise. This is a sparse-search improvement rather than a universal speedup. Non-Consecutive commits less Wasm memory in this request sequence; the other retained buffers stay unchanged.

| Wasm profile | Main raw/gzip bytes | Exact house propagation raw/gzip bytes |
| --- | --- | --- |
| Solver | 2,060,183 / 562,832 | 2,060,183 / 562,832 |
| Variant solver | 2,578,311 / 699,942 | 2,608,333 / 704,013 |
| Classic | 2,556,987 / 672,461 | 2,556,987 / 672,461 |
| App | 3,364,670 / 900,443 | 3,366,959 / 899,869 |

The app adds 2,289 raw bytes and saves 574 gzip bytes. The variant solver adds 30,022 raw bytes and 4,071 gzip bytes. Solver and Classic retain their raw and gzip sizes. The variant solver's increase remains part of [the package audit](https://github.com/coder13/sudoku-app/issues/88).

Compared app SHA-256 hashes:

- Main: `ae6a216997f63462d69d3e7ce590c7088d1c6bdbdf40a9488e36a1ca20e89e79`.
- Exact house propagation: `fae4f83d56e56392a4f4685721d6b01edf60efdbca25b3c2f1bdc4b9a2c06547`.

Repeat with:

```sh
cargo bench --locked -p sudoku-app-engine --all-features --bench variants -- --exact-search
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm --palindrome-trace --classic-tridagon --exact-houses
node --experimental-strip-types scripts/bench-exact-houses.mjs before.wasm after.wasm
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm quadruple parity anti-king non-consecutive nc-white-dots whispers palindrome palindrome-knight palindrome-whispers
```

## Tridagon eligibility and deferred proof data

[Issue 138](https://github.com/coder13/sudoku-app/issues/138) compares main `31fd429` with the focused Tridagon optimization. The published Coach FgZb rating still spends time on empty Tridagon searches after digit matching.

A guardian is a candidate outside the pattern's three core digits. A direct target must conflict with every guardian, or the pattern must contain one guardian that can be placed. Across the recognized geometry, one target conflicts with at most nine guardians. The direct scan now rejects larger sets before building their proof data.

Independent coordinate checks cover all 5,832 recognized geometries and every target cell and digit. They use standard house relationships rather than the detector's peer table. Bounded and unbounded direct scans also preserve complete proofs after candidate edits. Existing exhaustive three-color checks still establish the impossible core and its positive placement cases.

The forcing scan keeps a pattern's cells and core digits without allocating its guardian list. It enumerates guardians until their propagated effects have no common conclusion. It rebuilds every branch only for an actual reported conclusion. Branch order and contradictory branches remain intact. An entirely contradictory set supplies no shared conclusion. The later refutation phase keeps its existing bound. No direct conflict-count bound is applied to forcing branches.

The final source passes 313 native tests, 413 app tests, 253 Wasm tests, sixteen capability combinations and four package profiles. Strict full/reduced Cargo documentation, TypeScript and the 159-route production/offline build also pass. Independent forcing replay still checks every inference, guardian case and refutation. New semantic cases check surviving alternatives, contradiction-only alternatives, unrelated alternatives and original branch order.

The strict comparison preserves 6,210 complete variant responses across forty corpus positions and 351 positive practice examples. It also preserves 148 Classic responses across nine Tridagon practice positions. Those 6,358 responses include detector lists, traces, counts, ratings and every hint page. Every FgZb trace position remains covered. Catalogs, enabled techniques, costs and scoring versions match main. No response normalization hides changes.

Measurements use Node 26.13.0 on macOS arm64. Fixed requests use five warmups and twenty measured samples, alternating engines. Exhaustive first pages use two warmups and ten samples. Each timed request includes serialization, with complete response checks outside the timed region. First-operation timings use fresh instances after catalog loading. They exclude instantiation, worker startup, transfer and rendering. No identified compiler, engine test or generation worker was active at the start. The machine is not dedicated.

Times below are median/p95 milliseconds. This table uses the same unmodified Coach FgZb export and exact-search budgets.

| Coach FgZb operation | Main | Tridagon optimization |
| --- | --- | --- |
| Candidates | 0.022/0.023 | 0.022/0.023 |
| Exact analysis | 26.698/27.053 | 26.732/27.182 |
| Exact solve | 26.392/26.627 | 26.086/26.473 |
| Native default rating | 0.792/0.802 | 0.799/0.807 |
| App-order rating | 228.995/231.895 | 102.495/103.233 |
| Ten-hint request | 0.213/0.266 | 0.216/0.235 |
| Exhaustive first page | 2.345/2.380 | 2.355/2.383 |

The app-order median falls by about 55%. Both profiles retain the 527-point stalled result and their eighteen-step traces. Both hint requests retain ten choices. Committed Wasm memory stays at 8.31 MiB.

| Coach FgZb first operation | Main ms | Tridagon optimization ms |
| --- | --- | --- |
| Candidates | 0.075 | 0.071 |
| Exact analysis | 26.170 | 26.164 |
| Exact solve | 25.907 | 25.859 |
| Native default rating | 0.931 | 0.879 |
| App-order rating | 228.948 | 102.537 |
| Ten-hint request | 0.336 | 0.320 |
| Exhaustive first page | 2.413 | 2.428 |

The selected searches below use the final stalled app position in a separate paired pass. Each returns no proofs before and after. Their separate scan caches mean these times must not be added as attribution of one rating request.

| Selected final-position search | Main | Tridagon optimization |
| --- | --- | --- |
| Direct Tridagon | 64.627/65.066 | 0.613/0.655 |
| Tridagon Forcing Net | 84.140/85.886 | 29.747/30.442 |
| Tridagon AIC | 0.612/0.668 | 0.598/0.652 |

| Retained fixture | App rate, main → optimized | Ordinary hints, main → optimized | Exhaustive page, main → optimized | Choices, ordinary/exhaustive | Unchanged memory, MiB |
| --- | --- | --- | --- | --- | --- |
| Quadruple | 1.212/1.278 → 1.199/1.210 | 0.241/0.326 → 0.245/0.375 | 147.256/151.640 → 146.448/149.435 | 10/31 | 1.50 |
| Odd/Even | 0.171/0.179 → 0.175/0.185 | 0.082/0.089 → 0.081/0.086 | 52.323/55.840 → 52.809/54.089 | 10/23 | 3.56 |
| Anti-King | 0.157/0.179 → 0.155/0.194 | 0.117/0.128 → 0.116/0.123 | 96.561/98.300 → 96.366/97.709 | 10/438 | 10.44 |
| Non-Consecutive | 0.385/0.399 → 0.380/0.390 | 0.080/0.084 → 0.080/0.083 | 34.883/35.492 → 34.879/35.505 | 10/70 | 4.06 |
| Coach white-dot exceptions | 0.982/1.028 → 1.009/1.027 | 0.312/0.328 → 0.316/0.333 | 0.323/0.330 → 0.325/0.339 | 4/4 | 1.50 |
| Brain Zaps Whispers | 0.302/0.314 → 0.302/0.311 | 3.123/3.211 → 3.169/3.214 | 3.179/3.204 → 3.184/3.218 | 8/8 | 1.56 |
| Clover Palindrome | 0.113/0.119 → 0.112/0.120 | 40.265/41.034 → 40.224/40.969 | 40.402/41.098 → 40.562/41.717 | 7/7 | 3.38 |
| Newman Anti-Knight Palindrome | 0.866/0.874 → 0.869/0.877 | 0.129/0.134 → 0.129/0.135 | 301.930/310.470 → 208.677/212.351 | 10/48 | 5.06 |

Newman's exhaustive-page median falls from 301.930 to 208.677 ms, about 31%. Slower samples remain visible. Odd/Even exhaustive requests rise from 52.323 to 52.809 ms median. Coach white-dot app ratings rise from 0.982 to 1.009 ms. Clover's exhaustive median also rises slightly. These results do not establish a speedup for every puzzle or request.

| Wasm profile | Main raw/gzip bytes | Tridagon optimization raw/gzip bytes |
| --- | --- | --- |
| Solver | 2,040,103 / 556,086 | 2,060,183 / 562,832 |
| Variant solver | 2,596,592 / 699,819 | 2,578,311 / 699,942 |
| Classic | 2,555,726 / 662,311 | 2,556,987 / 672,461 |
| App | 3,374,552 / 903,296 | 3,364,670 / 900,443 |

The app saves 9,882 raw bytes and 2,853 gzip bytes. The other profiles have costs as well as savings. Solver grows by 20,080 raw bytes and 6,746 gzip bytes. Classic grows by 1,261 raw bytes and 10,150 gzip bytes. The variant solver saves 18,281 raw bytes but adds 123 gzip bytes. These costs remain part of the packaging audit.

The compared app artifacts have SHA-256 hashes:

- Main: `5f976289d3bd87964cc0e61065280e967d2ac932cd76cd563d6b8d6dcd3bff83`.
- Tridagon optimization: `ae6a216997f63462d69d3e7ce590c7088d1c6bdbdf40a9488e36a1ca20e89e79`.

Repeat with:

```sh
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm after.wasm --palindrome-trace --classic-tridagon
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm quadruple parity anti-king non-consecutive nc-white-dots whispers palindrome palindrome-knight palindrome-whispers
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm after.wasm palindrome-whispers
```

The remaining rating cost, profile sizes and worker behavior stay in the broader [performance audit](https://github.com/coder13/sudoku-app/issues/88). Sparse FzzD validation remains separate in [issue 139](https://github.com/coder13/sudoku-app/issues/139). This optimization changes computational work rather than human difficulty or hint policy.
