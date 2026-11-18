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
