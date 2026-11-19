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

`overlay-dense.json` preserves the position before app replay step 22 of the complete HCHW source in `modular-coach.json`, based on main `5aca356`. It records the public candidate domains, thirteen additional equal-digit exclusions and a checked five-digit geometric witness. The witness covers digits 1, 4, 7, 8 and 9; relabelling its low and middle digit gives the nine expensive support queries. Every witness is checked directly against the domains, rows, columns, boxes and extra exclusions. The full original variant rules remain in the source fixture. The overlay witness establishes support within that selected geometric scope.

`overlay-wasm.mts` checks the exact replay, all companion rules with their normalized defaults, three existing one-digit proofs, complete empty higher-width results, app Finder counts, hint pages and subsequent edited positions. `scripts/bench-overlay-support.mjs` compares complete replies for those positions, positive Classic/variant exercises at all five widths and empty Classic grids. Use `--samples=2 --warmups=0` to retain raw first-request samples for the slow baseline; `--cases=` selects comma-separated named cases. Instantiation, worker startup/transfer and rendering are excluded.

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

## XV app integration

The XV fixtures preserve two published Clover puzzle/solution pairs and four unmodified Coach exports. `xv-clover.json` and `xv-quadruple-clover.json` record the original PDF URLs and SHA-256 hashes. The original puzzle and solution pages were rendered and inspected. `xv-coach.json` preserves the original codes, published solutions, authors and publication dates. The corresponding Coach diagrams were inspected on 2026-11-18.

| Published puzzle | Givens | XV marks | Companion rules | Independent count |
| --- | ---: | --- | --- | --- |
| [Clover, XV Pairs, 2025-10-08](https://www.gmpuzzles.com/blog/2025/10/xv-pairs-sudoku-by-clover/) | 4 | 8 V, 14 X | None | Unique in 7 calls; multiple without XV in 47 |
| [Clover, XV and IVs, 2025-12-16](https://www.gmpuzzles.com/blog/2025/12/xv-pairs-quadruples-sudoku-by-clover/) | 4 | 4 V, 12 X | 6 Quadruple circles | Unique in 1 call; multiple without XV in 50, without Quadruple in 108 |
| [Raumplaner, XV Maelstrom, 7v7n](https://sudoku.coach/en/s/7v7n) | 0 | 20 | 3 white dots | Unique in 309 calls; multiple without XV in 44 |
| [Ce, Anti-King diagonal xv, FCeS](https://sudoku.coach/en/s/FCeS) | 0 | 20 | Both diagonals, Anti-King, 11 black dots, 1 inequality | Unique in 3 calls; multiple without XV in 2,487 |
| [Ugleh, XV(anti)K, 63Jk](https://sudoku.coach/en/s/63Jk) | 3 | 5 | Anti-Knight, Anti-King | Unique in 96 calls; multiple without XV in 131 |
| [cyboogie, Whisper Colouring 15, Chcs](https://sudoku.coach/en/s/Chcs) | 0 | 7 X | 6 minimum-4 and 3 minimum-5 Whispers paths, 2 white dots, 1 black dot | Unique in 95 calls; also unique without XV in 241,048 |

Independent calls are array-of-digits solver calls, not native nodes. The counter uses explicit sum relations and enumerated Quadruple assignments with actual house relationships. It does not share the engine's candidate-support or exact-search code. Removing XV from Chcs still leaves a unique puzzle. Its marks remain part of the original definition even though that family is redundant for uniqueness.

Coach `twoCellSum` segments carry `parameters.sum`. The decoder preserves 5 as V and 10 as X, along with every companion rule. Other totals remain unsupported. The preserved [Dariao142 sum-15 control, 99Eu](https://sudoku.coach/en/s/99Eu), must reject explicitly; its Roman numeral XV means 15. It must never become two separate V/X constraints. [Issue 72](https://github.com/coder13/sudoku-app/issues/72) tracks general adjacent totals. Unknown parameters, nonadjacent endpoints and unsupported settings also reject. Native/shared positive marks and independent negative V/X flags survive imports, transformations, storage and sharing. Flags and exemptions apply across all XV rule layers.

The app renders V/X glyphs with explicit contrast halos and accessible sum/partner labels. Dots and directed inequalities occupy separate positions on a shared edge under all eight transforms. Actual clue components were rasterized at 900 and 360 pixels and compared with the source diagrams. This verifies static geometry and glyph visibility. Live viewport testing remains separate. Both candidate types, conflict checks, bulk entries, undo/redo and compatible candidates are covered by exhaustive pair checks.

| Puzzle | Native default steps / points | App-order steps / points | App result |
| --- | --- | --- | --- |
| Clover XV | 55 / 1,076, partial | 151 / 4,538 | Expert, complete |
| Clover XV and IVs | 123 / 1,540 | 123 / 1,870 | Medium, complete |
| Maelstrom | — | 27 / 940 | Partial |
| FCeS | — | 170 / 3,186 | Master, complete |
| 63Jk | — | 199 / 27,358 | Impossible, complete |
| Chcs | — | 6 / 160 | Partial |

Every action in these traced paths agrees with the independently counted completion. Every XV proof is replayed by independently enumerating permitted digit pairs from its cited rules and evidence domains, including the shared house's distinctness rule. Selected replay steps, disabled logical profiles, multiple hints, exhaustive pages, Technique Finder, three practice exercises and accepted/rejected practice answers use the real Wasm adapter. Partial paths remain partial, even when the exact solver supplies a verified completion.

The expanded fixed-clue fixture checks 32,768 selections of fifteen optional families with Palindrome present. It accepts 24,576 compatible selections and rejects 8,192 deliberate contradictions. The fixture is near complete, so this tests interchange and composition rather than arbitrary hard mixed-rule geometry. Three native marker recipes, seeds 17, 43 and 227, independently retain 30 givens, twenty XV clues and a dependence on XV for uniqueness. These recipes are compatibility cases. New puzzle does not offer XV until difficulty calibration is ready.

The integration passes 437 app tests, 265 Wasm tests, TypeScript and the 159-route production/offline build. Seven focused component tests also pass after replacing CSS paint order with explicit XV halo and ink layers. Rust source, costs, default orders and scoring version 8 are unchanged. The measured app artifact is 3,367,009 raw / 899,884 gzip bytes with SHA-256 `bce78b16ef10f2163d47615586847cc1b6eee412ffbb00c5da149337782e1758`. This was a local artifact from a shared Cargo target. A later control found cache reuse between checkouts. Treat the following latency and local asset totals as historical observations for that hash. The fresh main control in the guardian audit below supersedes it for performance comparisons. Across fourteen generated client JavaScript assets, raw bytes grow from 1,981,956 to 1,985,338 and gzip bytes from 483,869 to 484,999, an increase of 3,382 raw / 1,130 gzip bytes. Gzip uses Node's default compression for both sides. This sum is not a per-route transfer measurement.

Measurements use Node 26.13.0 on macOS arm64. Candidates, exact checks, entry and SSR use five warmups/twenty samples. Ratings, hints, exhaustive pages, preview and solution use two/five, so their p95 is the maximum sample. Timed requests include serialization; assertions are outside timing. The nondedicated host had no identified compiler or engine test running. Raw requests use the app technique order without progress preferences. The app callers use their actual hint order, difficulty and progress policy through an in-process Wasm worker transport. They exclude browser worker startup, transfers, layout and paint. These are absolute measurements, not a paired engine speedup.

| Puzzle | Candidates | Unique analysis | Exact solve | App-order rate | Raw ten hints | Exhaustive page |
| --- | --- | --- | --- | --- | --- | --- |
| xv-clover | 0.022/0.030 | 0.071/0.078 | 0.045/0.049 | 5.377/5.492 | 0.114/0.122 | 126.448/127.724 |
| xv-quadruple-clover | 0.025/0.028 | 0.123/0.133 | 0.122/0.136 | 0.309/0.326 | 0.077/0.082 | 137.635/137.785 |
| 7v7n | 0.016/0.017 | 0.392/0.394 | 0.124/0.136 | 88.317/89.090 | 274.004/278.107 | 277.167/281.166 |
| FCeS | 0.022/0.028 | 0.082/0.090 | 0.082/0.082 | 6.918/7.042 | 0.094/0.110 | 0.731/0.738 |
| 63Jk | 0.011/0.015 | 0.043/0.050 | 0.039/0.040 | 6746.547/6777.174 | 0.074/0.080 | 370.924/378.020 |
| Chcs | 0.026/0.031 | 1.228/1.275 | 0.687/0.712 | 261.085/261.861 | 289.924/293.177 | 291.365/293.621 |

| Puzzle | Preview including rating | Play candidates | Ordinary app hints | Solution path | Entry with notes | Board SSR |
| --- | --- | --- | --- | --- | --- | --- |
| xv-clover | 5.538/5.883 | 0.020/0.024 | 0.193/0.212 | 8.371/8.950 | 0.015/0.050 | 1.959/2.233 |
| xv-quadruple-clover | 0.597/0.601 | 0.025/0.031 | 0.211/0.234 | 1.926/2.446 | 0.071/0.079 | 1.874/2.608 |
| 7v7n | 89.570/89.763 | 0.019/0.026 | 278.049/283.298 | 88.315/89.217 | 0.023/0.055 | 1.951/1.995 |
| FCeS | 7.376/7.457 | 0.024/0.025 | 0.803/0.820 | 8.740/10.294 | 0.070/0.071 | 1.062/1.562 |
| 63Jk | 6745.229/6774.125 | 0.014/0.021 | 368.170/371.544 | 6751.418/6770.752 | 0.031/0.059 | 1.610/1.890 |
| Chcs | 266.030/266.254 | 0.030/0.035 | 302.825/305.204 | 261.426/264.350 | 0.199/0.299 | 1.737/1.907 |

All times are median/p95 milliseconds. The slow 63Jk rating also affects import preview and the complete walkthrough. Ordinary app hints can cost more than raw ten-hint requests because they apply different ordering and preferences. Preserve both measurements. [Issue 147](https://github.com/coder13/sudoku-app/issues/147) tracks the rating and Maelstrom hint costs separately.

Committed raw-engine Wasm memory after the fixed request sequence is xv-clover: 1.50 MiB; xv-quadruple-clover: 1.44 MiB; 7v7n: 4.69 MiB; FCeS: 2.31 MiB; 63Jk: 6.31 MiB; Chcs: 1.50 MiB. This is buffer capacity, not RSS, browser heap or live allocation. Generation seeds in this integration establish compatibility and rule dependence; this pass does not claim a generation speedup.

Repeat after building the app:

```sh
node --experimental-strip-types --test scripts/bench-xv-app.mts
```

## Packed guardian checks in Tridagon refutations

[Issue 147](https://github.com/coder13/sudoku-app/issues/147) isolates the slow original Coach 63Jk rating after the XV integration. A five-second native sample over eight repeated ratings records 3,544 samples. Branch settlement accounts for about 45.5% of top-of-stack samples and Tridagon visits for 35.4%. Sampled ARM instructions identify repeated guardian-state checks in the refutation loop. These proportions describe a sampling window, not exact attribution of a complete rating. Two guardian-count experiments gave no diagnostic Wasm benefit and are excluded.

A guardian clause can advance a settled branch only when none of its alternatives is already true and at most one remains unremoved. The detector now packs its false literals into nonempty machine words. It checks satisfied alternatives and counts remaining alternatives with word operations. Original candidate indices, assumption order, ordinary propagation and proof construction remain intact. Costs, default technique orders, enabled detectors, scoring version 8 and exact-search budgets are unchanged.

Independent truth checks cover every one of the 729 candidate IDs and 258,048 assignment/subset combinations across word boundaries. They include unknown, false, true and contradictory states, unrelated facts, satisfied clauses and zero/one/multiple surviving alternatives. Existing inference replay checks still verify every step and branch of positive proofs.

Fresh main and candidate builds use separate Cargo target directories. A shared-target control had reused another checkout's output and was discarded. The earlier local XV integration artifact `bce78b16...` is not the final main control. The verified artifacts below are rebuilt from their respective sources and compared without response normalization:

- Main: 3,366,959 raw / 899,869 gzip bytes, SHA-256 `fae4f83d56e56392a4f4685721d6b01edf60efdbca25b3c2f1bdc4b9a2c06547`.
- Packed checks: 3,368,233 raw / 901,985 gzip bytes, SHA-256 `8253cf0082f087dd6412a6b12e0d0254412f08e31113372613735d291bfeaa11`.

The strict comparison preserves 7,143 complete variant responses on 47 corpus positions and 351 positive practice positions. It checks all 117 detector lists, full traces, ratings, custom profiles and every hint page. Another 148 complete Classic responses match on nine Tridagon practice positions. The six XV traces retain 151/123/27/170/199/6 steps and their complete or partial status. Validation passes 322 native tests, 437 app tests, 265 Wasm contracts, sixteen feature combinations, four profiles, strict full/reduced Cargo documentation, TypeScript and the 159-route production/offline build.

| Profile | Fresh main raw/gzip bytes | Packed checks raw/gzip bytes |
| --- | --- | --- |
| Solver | 2,060,183 / 562,832 | 2,061,762 / 563,437 |
| Variant solver | 2,608,333 / 704,013 | 2,582,819 / 702,288 |
| Classic | 2,556,987 / 672,461 | 2,563,763 / 663,682 |
| App | 3,366,959 / 899,869 | 3,368,233 / 901,985 |

The app adds 1,274 raw and 2,116 gzip bytes. Solver adds 1,579 raw and 605 gzip. The variant solver saves 25,514 raw and 1,725 gzip. Classic adds 6,776 raw but saves 8,779 gzip. These are measured compiler outputs, not source-size estimates. No client JavaScript source changes in this optimization.

Final measurements use Node 26.13.0 on macOS arm64. Engines alternate execution order. Fixed candidates, exact checks, native ratings and ten-hint requests use five warmups/twenty samples. App ratings and exhaustive pages use two/five, so p95 is the maximum. Serialization is timed and full response checks are outside timing. Instantiation, browser worker startup, transfer and rendering are excluded. No identified compiler or engine test was active during this paired pass. The host is not dedicated.

| Puzzle | Main app rate | Packed app rate | Native rate, main → packed |
| --- | --- | --- | --- |
| xv-clover | 5.743/5.988 | 5.980/6.489 | 0.303/0.444 → 0.310/0.459 |
| xv-quadruple-clover | 0.294/0.304 | 0.292/0.316 | 0.247/0.269 → 0.245/0.262 |
| 7v7n | 89.333/91.016 | 89.383/90.892 | 0.109/0.115 → 0.109/0.116 |
| FCeS | 7.026/7.197 | 7.192/7.206 | 0.517/0.560 → 0.513/0.587 |
| 63Jk | 6847.856/6964.237 | 4022.262/4042.819 | 0.917/0.922 → 0.918/0.931 |
| Chcs | 258.958/262.342 | 261.225/263.040 | 20.120/20.521 → 20.167/20.713 |

| Puzzle | Ten hints, main → packed | Exhaustive page, main → packed | Choices, ten/exhaustive | Unchanged memory, MiB |
| --- | --- | --- | --- | --- |
| xv-clover | 0.121/0.146 → 0.121/0.148 | 127.142/132.468 → 125.750/127.175 | 10/22 | 2.13 |
| xv-quadruple-clover | 0.139/0.156 → 0.138/0.154 | 137.652/137.847 → 137.712/138.208 | 10/26 | 1.88 |
| 7v7n | 276.600/285.950 → 275.797/285.981 | 282.733/288.564 → 287.389/294.665 | 8/8 | 4.69 |
| FCeS | 0.117/0.126 → 0.117/0.125 | 0.802/0.823 → 0.826/0.828 | 10/17 | 2.31 |
| 63Jk | 0.107/0.111 → 0.107/0.115 | 384.142/384.902 → 381.463/387.268 | 10/24 | 6.31 |
| Chcs | 297.182/306.266 → 296.543/305.495 | 302.659/305.116 → 302.892/304.400 | 5/5 | 1.50 |

| Puzzle | Candidates, main → packed | Unique analysis, main → packed | Exact solve, main → packed |
| --- | --- | --- | --- |
| xv-clover | 0.022/0.026 → 0.022/0.026 | 0.070/0.075 → 0.070/0.075 | 0.046/0.050 → 0.046/0.049 |
| xv-quadruple-clover | 0.028/0.030 → 0.028/0.033 | 0.117/0.127 → 0.117/0.123 | 0.117/0.122 → 0.116/0.119 |
| 7v7n | 0.016/0.017 → 0.016/0.018 | 0.393/0.395 → 0.392/0.394 | 0.123/0.124 → 0.122/0.127 |
| FCeS | 0.021/0.024 → 0.021/0.024 | 0.081/0.084 → 0.082/0.087 | 0.082/0.091 → 0.084/0.087 |
| 63Jk | 0.010/0.013 → 0.010/0.012 | 0.044/0.049 → 0.044/0.049 | 0.037/0.038 → 0.037/0.038 |
| Chcs | 0.024/0.026 → 0.024/0.027 | 1.275/1.403 → 1.387/1.530 | 0.711/0.746 → 0.784/0.801 |

All times are median/p95 milliseconds. The 63Jk app-rating median falls by 41.3%. Both results retain 27,358 points, the Impossible rating and the complete 199-step trace. Native default remains a 592-point partial result. Small increases on other puzzles remain in the tables. This change does not make every request faster, and the remaining four-second rating stays in the broader performance audit. Memory is committed Wasm buffer capacity after the documented sequence, not RSS, browser heap or live allocation.

The retained-fixture pass uses five warmups/twenty samples for fixed requests and two/ten for exhaustive pages, alternating engines. Complete responses, including first requests, match outside timing. Values below are median/p95 milliseconds. Separate selected searches use their documented final-position scan caches, so they are not additive attribution of one rating.

| Retained fixture | App rate, main → packed | Ten hints, main → packed | Exhaustive page, main → packed |
| --- | --- | --- | --- |
| quadruple | 1.177/1.199 → 1.175/1.195 | 0.231/0.267 → 0.224/0.248 | 146.504/149.873 → 146.013/149.270 |
| parity | 0.169/0.175 → 0.172/0.189 | 0.078/0.082 → 0.079/0.081 | 52.455/55.442 → 45.838/53.462 |
| anti-king | 0.149/0.158 → 0.151/0.158 | 0.116/0.120 → 0.117/0.121 | 96.952/102.593 → 97.194/102.071 |
| non-consecutive | 0.400/0.480 → 0.395/0.430 | 0.086/0.198 → 0.085/0.140 | 34.826/36.639 → 34.291/36.892 |
| nc-white-dots | 1.033/1.070 → 1.014/1.018 | 0.311/0.428 → 0.317/0.329 | 0.318/0.323 → 0.320/0.332 |
| whispers | 0.304/0.319 → 0.303/0.314 | 3.163/3.197 → 3.125/3.153 | 3.188/3.306 → 3.142/3.280 |
| palindrome | 0.119/0.124 → 0.120/0.125 | 40.335/41.475 → 39.446/40.279 | 40.215/41.462 → 39.340/40.175 |
| palindrome-knight | 0.894/0.907 → 0.894/0.901 | 0.127/0.129 → 0.128/0.130 | 205.676/210.389 → 187.393/193.726 |
| palindrome-whispers | 100.600/102.447 → 100.737/102.354 | 0.217/0.239 → 0.217/0.263 | 2.335/2.390 → 2.328/2.384 |

Generation alternates engines over seeds 1–20 per family, with six attempts and 20,000 nodes per exact check. There are no warmups. All five families match twenty of twenty seeds per engine and retain identical puzzle/solution/rating outcomes for all 100 seed runs. Both engines validate uniqueness and the baseline independently checks each completed result. These controls do not establish faster generation of very hard XV puzzles.

| Generation family | Main median/p95 ms | Packed median/p95 ms |
| --- | --- | --- |
| classic | 0.583/0.796 | 0.592/0.778 |
| x-sudoku | 0.568/0.693 | 0.568/0.699 |
| killer | 2.608/3.077 | 2.598/3.034 |
| jigsaw-killer | 2.442/2.551 | 2.450/2.690 |
| windoku | 0.777/2.133 | 0.789/2.101 |

An absolute after-build pass uses the real app callers with the verified packed artifact. Preview, ordinary hints and solution use two warmups/five samples. Values are median/p95 milliseconds. It includes source decoding, rule verification, solution lookup, rating and presentation conversion as each caller requires. It excludes browser worker startup, transfers, layout and paint. These app values are not a paired comparison with the historical cached integration artifact. App hints use actual game difficulty and preferences, which differ from the medium-difficulty raw control.

| Puzzle | Preview including rating | Ordinary app hints | Solution walkthrough |
| --- | --- | --- | --- |
| xv-clover | 5.491/5.572 | 0.199/0.212 | 7.849/8.627 |
| xv-quadruple-clover | 0.594/0.608 | 0.210/0.232 | 1.985/2.481 |
| 7v7n | 89.272/90.615 | 278.008/279.066 | 92.594/94.992 |
| FCeS | 7.375/7.434 | 0.789/0.804 | 8.835/10.114 |
| 63Jk | 4085.376/4139.267 | 403.558/404.294 | 4122.222/4164.520 |
| Chcs | 274.814/276.773 | 315.629/330.882 | 267.027/272.750 |

The remaining rating and hint latency, propagation and browser-worker costs stay in [issue 88](https://github.com/coder13/sudoku-app/issues/88). Keep the measured regressions and package costs alongside the gains.

Build each checkout with its own Cargo target directory and output directory, then repeat from the candidate checkout:

```sh
# Main checkout
CARGO_TARGET_DIR=/tmp/main-cargo node scripts/build-wasm.mjs app /tmp/main-wasm
# Candidate checkout
CARGO_TARGET_DIR=/tmp/packed-cargo node scripts/build-wasm.mjs app /tmp/packed-wasm
node --experimental-strip-types scripts/compare-engine-pruning.mjs /tmp/main-wasm/engine.wasm /tmp/packed-wasm/engine.wasm --palindrome-trace --classic-tridagon --xv
node --experimental-strip-types scripts/bench-xv-rating.mjs /tmp/main-wasm/engine.wasm /tmp/packed-wasm/engine.wasm
node --experimental-strip-types scripts/bench-engine-pruning.mjs /tmp/main-wasm/engine.wasm /tmp/packed-wasm/engine.wasm quadruple parity anti-king non-consecutive nc-white-dots whispers palindrome palindrome-knight palindrome-whispers
node --experimental-strip-types scripts/bench-exact-houses.mjs /tmp/main-wasm/engine.wasm /tmp/packed-wasm/engine.wasm --generation-only
node --experimental-strip-types --test scripts/bench-xv-app.mts
```


## General adjacent totals

[Issue 72](https://github.com/coder13/sudoku-app/issues/72) starts from main `856e0f6`. The native `adjacent-total` rule stores two edge-sharing cells and an integer sum from 3 through 17. Its logical technique costs 20 points at Easy. Existing scoring version 8, costs and relative technique order remain unchanged. The catalog and default profiles gain this one technique. Classic and solver-only packages retain identical bytes.

[Dariao142's May the Sudoku Be With You, Coach 99Eu](https://sudoku.coach/en/s/99Eu), published on 2025-08-30, has two givens, Anti-Knight, Anti-King, Non-Consecutive and one sum of 15 between cells `[80,79]`. The diagram prints Roman XV. Preserve it as one clue, its endpoint order and every companion rule. Its original code and completion are in `adjacent-sum-coach.json`. The inspected source PNG has SHA-256 `c7548bfe0ead59ad889a72381144039c07aab70378e69ef3d74536e9f0ffce14`. The primary constructor offers totals 3..17. Its compiler uses `parameters.sum` and its renderer uses Roman numerals. [Source and implementation contract](../../SUDOKU_ADJACENT_SUM_AUDIT.md)

An independent digit-array counter proves the source unique in 590 calls. Removing the sum still leaves a unique completion in 652 calls. Replacing 15 with 5 or 10 gives no completion. A separate authored 6/7 rectangle has two completions without its sum and one with it. This essential control catches a decoder or solver that ignores the clue. Reference calls are not native nodes or paired performance measurements.

Generic native sums of 5/10 count as positive V/X locations under negative XV and fog completeness. They retain their own rule indices and do not create duplicate XV proofs. Dependency checks remove their arithmetic while retaining negative-rule exemptions. Otherwise removing a rule could introduce a new negative constraint. Coach 5/10 segments retain the existing XV wire format; other totals become separate rules. Mixed layers retain every clue. Unknown semantics, invalid totals and nonadjacent endpoints reject explicitly.

The complete app flow covers import, preview, clues, accessible labels, input, conflicts, both note types, undo/redo, actual persistence, sharing and all eight grid transformations. Roman numerals stay upright. Shared-edge layout separates totals, dots and inequalities. Static React SVG exports at 900 and 360 pixels were inspected in light/dark themes. They include the published XV, all fifteen totals, four-letter numerals, outer edges and a valid sum-3 pair with both dots and a sign. This is static geometry review; live viewport interaction remains open. New puzzle presets require separate difficulty calibration.

The published app-order path solves at 4,250 points in 212 steps, including one sum deduction. The native default stalls at 932 points after 78 steps. Every action is checked against the independent published completion. Sum proof support is also enumerated from digit pairs and shared-house distinctness. Disabled profiles still enforce the rule during exact solving. Hints, pages, selected replay, Finder and three independently unique practice exercises pass. The practice estimates are 19/20/20 points, with a median of 20. A zero-given, 144-sum fixture covers pagination and an exclusive opening request. Adding a competing Parity deduction rejects that request.

Validation passes 330 native tests, 452 app tests, 273 Wasm contracts, sixteen capability combinations, four Wasm profiles, strict full/reduced Cargo documentation, TypeScript and the 160-route production/offline build. A representative fixed-clue fixture checks 65,536 family selections: 49,152 compatible cases and 16,384 intentional contradictions. These bounded fixtures do not establish arbitrary combinations as feasible.

The strict legacy comparison preserves 7,143 complete variant responses on 47 corpus positions and 351 positive practice positions, plus 148 Classic responses on nine Tridagon positions. It checks all 117 legacy detectors, custom profiles, complete traces, ratings and every hint page. Those requests use explicit legacy profiles and no response normalization. New-family tests cover its three additional positive exercises separately.

Fresh artifacts use distinct Cargo target directories for each source checkout. Current-main control: SHA-256 `8253cf0082f087dd6412a6b12e0d0254412f08e31113372613735d291bfeaa11`. Integration: `8f8c95c36c067560dffe768498628f97ae9529396ee969bc7a6db6a26b13c6fe`. The historical shared-target XV artifact is excluded.

| Wasm profile | Main raw/gzip bytes | General totals raw/gzip bytes |
| --- | --- | --- |
| Solver | 2,061,762 / 563,437 | 2,061,762 / 563,437 |
| Variant solver | 2,582,819 / 702,288 | 2,589,572 / 703,130 |
| Classic | 2,563,763 / 663,682 | 2,563,763 / 663,682 |
| App | 3,368,233 / 901,985 | 3,388,378 / 904,672 |

The app adds 20,145 raw / 2,687 gzip bytes. The variant solver adds 6,753 raw / 842 gzip. The fourteen client JavaScript assets total 1,985,338 / 485,015 bytes before and 1,991,313 / 486,419 after, an increase of 5,975 raw / 1,404 gzip. Gzip values use the default compression level and sum each JavaScript file separately. These are measured production outputs.

Absolute integration measurements use Node 26.13.0 on macOS arm64. Candidates, input and Board SSR use five warmups/twenty samples. Normalization, exact operations, rates, hints, preview and path use two/five. Values below are median/p95 milliseconds; p95 of five is the maximum. Serialization is timed and assertions run outside timing. Real app callers use the in-process worker transport. Browser worker startup, transfers, layout and paint are excluded. The host is not dedicated. No identified compiler, engine test or other benchmark ran during these measurements.

| Puzzle | Normalize | Candidates | Unique analysis | Exact solve | Native rate | App rate |
| --- | --- | --- | --- | --- | --- | --- |
| Coach 99Eu | 0.020/0.030 | 0.018/0.022 | 11.393/11.409 | 9.902/9.923 | 2.091/2.101 | 491.960/504.057 |
| Essential total | 0.013/0.017 | 0.012/0.015 | 0.011/0.012 | 0.011/0.012 | 0.033/0.034 | 0.052/0.056 |
| All 144 edges | 0.204/0.213 | 0.116/0.123 | 0.183/0.189 | 0.182/0.189 | 1.632/1.655 | 1.697/1.733 |

| Puzzle | Ten raw hints | Exhaustive page | Preview with rating | Ordinary app hints | Solution path |
| --- | --- | --- | --- | --- | --- |
| Coach 99Eu | 0.180/0.195 | 158.507/159.225 | 502.944/516.861 | 89.614/90.836 | 486.792/490.374 |
| Essential total | 0.173/0.188 | 0.148/0.149 | 0.105/0.108 | 0.200/0.206 | 0.205/0.233 |
| All 144 edges | 0.263/0.270 | 0.460/0.469 | 2.161/2.198 | 0.294/0.312 | 3.090/4.198 |

| Puzzle | Play candidates | Entry with all notes | Board SSR |
| --- | --- | --- | --- |
| Coach 99Eu | 0.020/0.024 | 0.023/0.069 | 1.494/2.041 |
| Essential total | 0.012/0.013 | 0.035/0.041 | 1.063/1.356 |
| All 144 edges | 0.115/0.118 | 0.381/0.438 | 2.653/4.033 |

Opening raw/exhaustive/app choice counts are 10/38/10 on 99Eu, 1/1/1 on the essential control and 10/144/10 on the dense puzzle. A requested limit of ten does not imply ten distinct deductions exist. Committed raw-instance memory after this request sequence is 6.5625/1.5000/2.1250 MiB respectively. This is buffer capacity, not process RSS, browser heap or live allocation. The source's roughly half-second preview and walkthrough, 90 ms ordinary app hints and 159 ms exhaustive scan remain performance follow-ups under [issue 88](https://github.com/coder13/sudoku-app/issues/88).

Derived generation requests use seeds 1–20, six attempts, a 20,000-node exact budget, thirty givens and twenty sum clues. All twenty seeds match. Independent counting proves each completion unique and finds multiple completions after removing the sums. Median/p95 generation latency is 0.725/0.766 ms, with no warmups and independent checks outside timing. Seeds 17, 43 and 227 also pass the fuller app flow. These are compatibility and throughput controls, not very-hard puzzle calibration or a paired generation speedup.

Paired controls alternate current main and the integration on the same host. Each uses its actual native/app default profile. The new profile contains `adjacent-total`; the old profile does not. Cross-version rating comparison removes only that declared ID from `techniqueOrder` metadata. Scores, statuses, actions, evidence, full traces and hint responses match exactly. Repeated responses are checked against each engine's complete result. This metadata comparison is separate from the unmodified legacy-profile comparison above.

The six retained XV sources use five warmups/twenty samples for candidates, exact requests, native rating and ten hints; app rating and exhaustive pages use two/five. Values are median/p95 milliseconds. Compilation and other engine benchmarks were inactive. Traces retain 151/123/27/170/199/6 steps and their full or partial status.

| Puzzle | App rate, main → totals | Native rate, main → totals | Ten hints, main → totals | Exhaustive, main → totals |
| --- | --- | --- | --- | --- |
| xv-clover | 5.589/5.858 → 5.840/5.901 | 0.299/0.414 → 0.310/0.427 | 0.119/0.192 → 0.124/0.173 | 126.413/134.201 → 126.027/126.762 |
| xv-quadruple-clover | 0.297/0.310 → 0.299/0.305 | 0.253/0.263 → 0.252/0.263 | 0.138/0.148 → 0.132/0.148 | 136.454/136.998 → 136.854/137.993 |
| 7v7n | 88.907/89.761 → 88.496/89.882 | 0.107/0.115 → 0.108/0.122 | 273.386/278.142 → 274.425/277.730 | 279.097/279.986 → 278.124/283.401 |
| FCeS | 7.106/7.274 → 7.119/7.181 | 0.516/0.537 → 0.530/0.553 | 0.117/0.137 → 0.116/0.132 | 0.770/0.786 → 0.770/0.783 |
| 63Jk | 3981.970/4006.920 → 3983.382/3989.794 | 0.984/0.995 → 1.006/1.026 | 0.108/0.154 → 0.108/0.112 | 371.035/376.861 → 371.893/372.425 |
| Chcs | 259.298/262.688 → 257.974/260.423 | 20.105/20.245 → 20.118/20.270 | 296.686/307.601 → 296.336/301.847 | 300.767/303.442 → 300.896/301.638 |

| Puzzle | Candidates, main → totals | Unique analysis, main → totals | Exact solve, main → totals |
| --- | --- | --- | --- |
| xv-clover | 0.022/0.026 → 0.022/0.025 | 0.072/0.076 → 0.070/0.075 | 0.045/0.048 → 0.045/0.047 |
| xv-quadruple-clover | 0.028/0.033 → 0.028/0.032 | 0.123/0.133 → 0.120/0.129 | 0.120/0.121 → 0.117/0.117 |
| 7v7n | 0.016/0.018 → 0.015/0.016 | 0.390/0.391 → 0.390/0.392 | 0.122/0.123 → 0.122/0.123 |
| FCeS | 0.020/0.029 → 0.020/0.029 | 0.080/0.083 → 0.080/0.082 | 0.082/0.083 → 0.081/0.084 |
| 63Jk | 0.010/0.013 → 0.010/0.015 | 0.041/0.046 → 0.043/0.044 | 0.035/0.036 → 0.037/0.037 |
| Chcs | 0.026/0.031 → 0.026/0.027 | 1.272/1.309 → 1.226/1.271 | 0.679/0.683 → 0.680/0.703 |

Opening ten/exhaustive choices remain 10/22, 10/26, 8/8, 10/17, 10/24 and 5/5. Committed memory remains 2.1250/1.8750/4.6875/2.3125/6.3125/1.5000 MiB. In particular, 63Jk keeps 27,358 points and its complete 199-step app path at roughly four seconds. This feature addition does not claim a rating speedup. Small retained increases and decreases remain visible in the tables.

The broader retained-fixture pass uses five warmups/twenty samples, with two/ten for exhaustive pages. Fresh-instance first requests also preserve complete responses. These initial observations exclude instantiation and are not browser cold-start percentiles. Selected Whispers uniqueness and final-position Palindrome/Whispers Tridagon scans preserve their zero-proof results and existing caches; they are not additive attribution of a rating.

| Retained fixture | App rate, main → totals | Ten hints, main → totals | Exhaustive, main → totals |
| --- | --- | --- | --- |
| quadruple | 1.178/1.202 → 1.188/1.210 | 0.222/0.242 → 0.222/0.239 | 146.358/156.919 → 146.620/149.519 |
| parity | 0.168/0.174 → 0.168/0.177 | 0.078/0.083 → 0.076/0.079 | 44.807/47.816 → 44.830/45.527 |
| anti-king | 0.156/0.166 → 0.155/0.162 | 0.115/0.120 → 0.114/0.116 | 97.010/99.951 → 97.047/97.327 |
| non-consecutive | 0.383/0.397 → 0.382/0.398 | 0.080/0.091 → 0.081/0.121 | 33.866/33.933 → 33.794/33.927 |
| nc-white-dots | 1.006/1.024 → 0.987/0.997 | 0.314/0.322 → 0.314/0.328 | 0.325/0.328 → 0.318/0.325 |
| whispers | 0.305/0.320 → 0.308/0.321 | 3.142/3.297 → 3.127/3.276 | 3.144/3.232 → 3.119/3.154 |
| palindrome | 0.118/0.122 → 0.120/0.127 | 39.464/39.774 → 39.409/39.767 | 39.446/40.149 → 39.405/39.577 |
| palindrome-knight | 0.900/0.904 → 0.873/0.884 | 0.126/0.132 → 0.127/0.135 | 190.023/191.685 → 190.429/193.505 |
| palindrome-whispers | 101.101/102.055 → 100.889/101.320 | 0.217/0.269 → 0.222/0.233 | 2.338/2.400 → 2.355/2.401 |

Retained candidates and exact requests stay close to the main control. The largest exact operations in this set are Brain Zaps: unique analysis 14.270/14.649 → 14.200/14.559 ms and exact solve 14.182/14.336 → 14.067/14.232 ms. Committed capacities remain unchanged for every paired fixture. These small differences do not establish an engine improvement. Continue rating, hint and browser-worker work under [issue 88](https://github.com/coder13/sudoku-app/issues/88).

Build source checkouts with different Cargo target directories, then repeat from this checkout:

```sh
node --experimental-strip-types scripts/compare-engine-pruning.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv --adjacent-total
node --experimental-strip-types scripts/bench-xv-rating.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm --added-technique=adjacent-total
node --experimental-strip-types scripts/bench-engine-pruning.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm quadruple parity anti-king non-consecutive nc-white-dots whispers palindrome palindrome-knight palindrome-whispers --added-technique=adjacent-total
node --experimental-strip-types --test scripts/bench-adjacent-totals.mts
```


## Renban app integration

[Issue 55](https://github.com/coder13/sudoku-app/issues/55) starts from main `69289dd`, after general two-cell sums. The native Renban technique, forty-point Medium cost, three practice positions and fixed-rule template generation already exist. The app addition preserves connected logical sets and independent drawing paths. Optional native `segments` must cover exactly the logical cells. One-cell sets are valid, unrestricted and incapable of satisfying a required-family generation target. Existing scoring version 8, catalogs, default orders and old omitted-field wire data remain unchanged. [Full source contract and known gaps](../../SUDOKU_RENBAN_AUDIT.md)

Two inspected Clover puzzle/solution PDF pairs provide independently unique controls. The 2025-09-14 Renban puzzle has sixteen givens and twelve lines. Pinwheel, from 2025-12-19, has fifteen givens, twelve lines and four cages totaling ten. Removing Renban leaves multiple completions in both. Pinwheel remains unique without its cages, so structural equality must preserve those independently redundant clues. The fixtures store primary URLs, PDF hashes and printed completions.

Three original Coach 9×9 exports also import intact: Jh4o, KUUo and BSms. Independent counting proves their unique printed completions in 37/31/45,690 reference calls. Removing Renban leaves multiple completions. Their inspected diagrams, publication metadata and hashes remain preserved. The full Ksy3 export retains its unsupported Entropic companion. The original 9uMo remains a 6×6/general-difference gap, and 5NW remains a legacy SCv4/Consecutive Line gap. None is presented as a partial import.

The primary Coach compiler joins connected segments within each Renban layer and deduplicates logical cells. Separate layers remain independent. The renderer preserves branches and revisits without inventing bridges. It numbers accessible labels and separates shared Renban edges into lanes. The walkthrough display removes placed Renban peer digits. Range eliminations remain explained steps. A mixed-clue review also repaired Whispers minimum labels: an unmarked edge is preferred, marked labels use a leader, and explicit foreground contrast layers keep the minimum visible above other lines.

Static review uses actual React clue paths/CSS with comparison grid lines, givens and cage captions. Twenty-eight light/dark SVG exports at 900/360 pixels cover the five complete sources, branch geometry and a mathematically valid overlap with Renban, Palindrome, Whispers and both dots. This is static rendering, not live viewport interaction. New puzzle presets remain conditional on difficulty calibration.

All five source traces preserve their complete or partial status. Clover solves at native/app points 940/1,260 in 77 steps. Pinwheel solves at 954/1,184 in 75 steps. Jh4o stalls natively at 484/16 but the app completes at 15,870/122. KUUo stalls natively at 308/8 but the app completes at 2,744/69. BSms remains stalled at 54/2 under both profiles. Every action matches the independent completion. Every Renban proof receives a separate digit-assignment check. Exact solving, empty logical profiles, replay, hints, pages, Finder, actual storage reload, practice answers, generated score targets and rule dependence are covered.

Local validation passes 337 native tests, sixteen capability combinations, four Wasm profiles, strict full/reduced Cargo documentation, TypeScript, 466 app tests, 281 Wasm contracts and the 160-route production/offline build. The final rendering repair also passes eighteen retained line-component contracts. The native support audit checks all 262,144 two-cell domain pairs, independent three-cell masks and long sets.

The strict current-main comparison preserves all 7,342 complete responses without response normalization. It includes 7,194 variant responses on 47 corpus positions and 354 positive practice positions, plus 148 Classic responses on nine Tridagon positions. All 118 detector lists, full traces, ratings and hint pages agree. The legacy 65,536-family-selection regression stays intact. New Renban coverage adds each current companion, every companion pair and the complete inventory: 153 compatible cases and two intentional contradictions. These bounded witnesses do not establish arbitrary combinations feasible.

Fresh source builds use separate Cargo target directories. Baseline SHA-256 is `8f8c95c36c067560dffe768498628f97ae9529396ee969bc7a6db6a26b13c6fe`. Integration SHA-256 is `7949a66187f5e820926efc8891578f42f5f5f3ab70f260f4db0f688599523e17`. Production rebuilds retain the measured integration hash. All compressed sizes here use Node `gzipSync` at its default level. Compressor implementations can differ from the Python JavaScript totals in earlier reports.

| Wasm profile | Main raw/gzip bytes | Renban integration raw/gzip bytes |
| --- | --- | --- |
| Solver | 2,061,762 / 563,437 | 2,061,762 / 563,437 |
| Variant solver | 2,589,572 / 703,130 | 2,631,886 / 709,431 |
| Classic | 2,563,763 / 663,682 | 2,563,763 / 663,682 |
| App | 3,388,378 / 904,672 | 3,358,070 / 901,120 |

Variant solver adds 42,314 raw / 6,301 gzip bytes. App saves 30,308 raw / 3,552 gzip. Solver and Classic sizes stay unchanged. Fourteen client JavaScript assets change from 1,991,313 / 486,664 to 1,994,547 / 487,886 bytes, an increase of 3,234 raw / 1,222 gzip. Each asset is compressed separately. These are measured compiler outputs, not estimated source costs.

Paired measurements use Node 26.13.0 on macOS arm64. Each engine uses its actual native/app default order. Engines alternate, complete responses and ordered traces agree outside timing, and serialization is timed. Candidates, exact operations, native rates and ten raw hints use five warmups/twenty samples. App rates and exhaustive pages use two/five. Values are median/p95 milliseconds; p95 of five is the maximum. Instantiation, browser startup, worker transfer and rendering are excluded. No identified compiler, engine test or other benchmark ran during the paired measurements. The host is not dedicated.

| Puzzle | Candidates, main → Renban | Unique analysis, main → Renban | Exact solve, main → Renban |
| --- | --- | --- | --- |
| renban-clover | 0.033/0.041 → 0.033/0.041 | 0.150/0.175 → 0.148/0.179 | 0.138/0.140 → 0.140/0.144 |
| renban-killer-clover | 0.029/0.032 → 0.030/0.031 | 0.153/0.157 → 0.155/0.163 | 0.155/0.172 → 0.155/0.193 |
| Jh4o | 0.042/0.043 → 0.042/0.044 | 0.812/0.829 → 0.820/0.849 | 0.238/0.282 → 0.238/0.283 |
| KUUo | 0.016/0.020 → 0.016/0.017 | 0.121/0.122 → 0.122/0.122 | 0.056/0.057 → 0.055/0.056 |
| BSms | 0.020/0.024 → 0.020/0.021 | 711.221/755.091 → 711.561/754.996 | 43.765/45.405 → 43.867/45.512 |

| Puzzle | Native rate, main → Renban | App rate, main → Renban | Ten hints, main → Renban | Exhaustive, main → Renban |
| --- | --- | --- | --- | --- |
| renban-clover | 0.189/0.347 → 0.192/0.345 | 0.261/0.400 → 0.250/0.261 | 0.129/0.169 → 0.128/0.170 | 86.799/95.865 → 87.050/90.847 |
| renban-killer-clover | 0.164/0.172 → 0.164/0.176 | 0.195/0.203 → 0.195/0.207 | 0.143/0.147 → 0.141/0.148 | 62.710/63.206 → 62.700/63.365 |
| Jh4o | 0.181/0.187 → 0.180/0.188 | 840.122/845.591 → 844.010/853.990 | 70.655/75.108 → 70.619/71.885 | 88.618/89.505 → 87.887/89.853 |
| KUUo | 0.079/0.093 → 0.080/0.110 | 62.593/62.949 → 62.791/63.054 | 0.085/0.087 → 0.084/0.087 | 47.617/47.766 → 47.444/47.480 |
| BSms | 0.057/0.065 → 0.057/0.061 | 67.917/70.073 → 67.436/69.709 | 87.534/89.809 → 87.654/89.375 | 87.417/87.582 → 87.479/87.668 |

| Puzzle | Ten/exhaustive choices | Committed MiB, main → Renban |
| --- | --- | --- |
| renban-clover | 10/57 | 4.6875 → 4.6875 |
| renban-killer-clover | 10/40 | 3.9375 → 3.9375 |
| Jh4o | 10/21 | 4.2500 → 4.2500 |
| KUUo | 10/75 | 4.5625 → 4.5625 |
| BSms | 9/9 | 6.7500 → 6.7500 |

Memory means committed raw-instance Wasm capacity after the fixed request sequence, not RSS, browser heap or live allocation. Small retained increases and decreases remain visible. This integration does not claim a general engine speedup. BSms human solve coverage and Jh4o rating/hint latency remain follow-ups.

The broader retained-fixture pass uses five warmups/twenty samples, and two/ten for exhaustive pages. Fresh-instance first requests also preserve full responses. These observations exclude instantiation and are not browser cold-start percentiles. Selected Whispers uniqueness and final-position Palindrome/Whispers Tridagon scans retain their zero-proof results and existing caches.

| Retained fixture | App rate, main → Renban | Ten hints, main → Renban | Exhaustive, main → Renban |
| --- | --- | --- | --- |
| quadruple | 1.296/1.393 → 1.276/1.468 | 0.526/0.867 → 0.436/1.027 | 152.215/158.448 → 150.200/159.400 |
| parity | 0.171/0.202 → 0.172/0.197 | 0.075/0.080 → 0.075/0.083 | 47.844/65.659 → 47.319/53.716 |
| anti-king | 0.156/0.186 → 0.158/0.244 | 0.120/0.151 → 0.123/0.146 | 98.825/101.977 → 100.525/113.949 |
| non-consecutive | 0.382/0.392 → 0.384/0.402 | 0.077/0.082 → 0.077/0.079 | 35.655/44.297 → 35.511/39.427 |
| nc-white-dots | 1.001/1.077 → 0.993/1.098 | 0.315/0.357 → 0.319/0.351 | 0.317/0.323 → 0.320/0.324 |
| whispers | 0.308/0.337 → 0.311/0.337 | 3.213/3.353 → 3.176/3.249 | 3.402/4.870 → 3.432/4.280 |
| palindrome | 0.122/0.130 → 0.121/0.130 | 49.691/98.041 → 45.904/59.459 | 43.564/47.672 → 42.398/47.354 |
| palindrome-knight | 0.902/0.975 → 0.894/0.945 | 0.135/0.158 → 0.135/0.158 | 190.503/349.301 → 189.949/229.933 |
| palindrome-whispers | 102.138/121.200 → 102.009/121.776 | 0.225/0.268 → 0.227/0.325 | 2.463/2.691 → 2.439/2.751 |

The six retained XV sources use the fixed-source sampling counts above. All complete traces, ratings, choices and committed capacities stay unchanged.

| Retained XV source | App rate, main → Renban | Ten hints, main → Renban | Exhaustive, main → Renban |
| --- | --- | --- | --- |
| xv-clover | 17.239/66.431 → 53.902/252.196 | 0.509/4.614 → 0.468/1.714 | 754.971/1158.216 → 796.694/1176.621 |
| xv-quadruple-clover | 0.504/0.585 → 0.464/7.200 | 0.228/0.634 → 0.249/8.940 | 163.276/170.182 → 161.360/204.738 |
| 7v7n | 156.801/241.776 → 116.754/134.255 | 329.540/520.326 → 303.963/461.762 | 442.231/469.968 → 436.632/534.853 |
| FCeS | 12.634/16.317 → 36.894/104.183 | 0.165/0.531 → 0.185/0.824 | 1.070/1.764 → 2.239/4.371 |
| 63Jk | 4210.119/4587.934 → 4523.722/4616.272 | 0.109/0.199 → 0.112/0.163 | 384.083/495.367 → 387.328/401.139 |
| Chcs | 258.096/263.364 → 260.437/265.067 | 298.194/303.910 → 296.748/301.537 | 306.818/309.075 → 306.053/317.655 |

The initial XV pass contains large timing variation. A separate focused control repeats the two apparent rating regressions with the same artifacts and sampling counts. Clover app rating changes from 5.638/5.866 to 5.649/6.041 ms. FCeS changes from 7.273/7.352 to 7.183/7.210 ms. Complete responses and traces still agree. The earlier differences do not repeat. Keep the initial observations visible, and do not infer a speedup from either pass.

Generation alternates engines on seeds 1–20 per family, with six attempts, 20,000 nodes per exact check and no warmups. All 120 outcomes match, including the common Renban seed-10 search limit. The first five families retain twenty successes and twenty distinct puzzles each. Renban retains nineteen successes and nineteen distinct puzzles. Both builds pass independent digit-array uniqueness and rule-dependence checks for every successful Renban result. Node limits and failed seeds remain explicit. These are fixed-template controls, not very-hard difficulty calibration.

| Generation family | Successful seeds, main/Renban | Main median/p95 ms | Renban median/p95 ms |
| --- | --- | --- | --- |
| classic | 20/20 | 0.573/0.898 | 0.606/0.889 |
| x-sudoku | 20/20 | 0.591/0.711 | 0.586/0.733 |
| killer | 20/20 | 2.620/3.168 | 2.693/3.128 |
| jigsaw-killer | 20/20 | 2.410/2.597 | 2.436/2.695 |
| windoku | 20/20 | 0.795/2.155 | 0.779/2.145 |
| renban | 19/19 | 100.652/298.329 | 101.557/299.525 |

Actual app callers use the in-process worker transport. Preview, ordinary hints and walkthrough use two warmups/five samples; play candidates, input and Board SSR use five/twenty. Assertions run outside timing. Browser startup, transfers, layout and paint are excluded. Ordinary app preferences differ from the medium-difficulty raw ten-hint control. The BSms walkthrough remains explicitly partial.

| Puzzle | Preview with rating | Play candidates | Ordinary app hints | Walkthrough | Input with candidates | Board SSR |
| --- | --- | --- | --- | --- | --- | --- |
| renban-clover | 0.792/0.862 | 0.034/0.040 | 0.219/0.230 | 1.592/2.825 | 0.055/0.063 | 1.795/2.227 |
| renban-killer-clover | 0.626/0.692 | 0.035/0.035 | 0.228/0.329 | 1.902/2.126 | 0.077/0.208 | 1.005/1.220 |
| Jh4o | 866.120/893.979 | 0.049/0.061 | 72.698/74.736 | 873.492/884.237 | 0.039/0.053 | 1.644/2.242 |
| KUUo | 65.012/65.834 | 0.019/0.047 | 0.144/0.148 | 66.005/71.345 | 0.026/0.072 | 1.706/2.260 |
| BSms | 830.783/835.031 | 0.025/0.034 | 92.767/103.790 | 67.432/68.187 | 0.057/0.079 | 1.767/2.074 |

All times are median/p95 milliseconds. App opening choices are renban-clover: 10, renban-killer-clover: 10, Jh4o: 10, KUUo: 10, BSms: 9. The remaining caller costs, worker transport and package boundaries stay in [issue 88](https://github.com/coder13/sudoku-app/issues/88).

Repeat after building each source checkout with its own Cargo target directory. The paired source input file has a `cases` array of `{name, position: {puzzle}, solution}` records from the five preserved Renban fixtures. A generation recipe file extends `crates/engine/benches/fixtures/variants.json` with the Clover Renban template, thirty givens, twelve clues and `requiredRule: "renban"`. Clear its givens when constructing that template.

```sh
node --experimental-strip-types scripts/compare-engine-pruning.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv
node --experimental-strip-types scripts/bench-xv-rating.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm /tmp/renban-inputs.json
node --experimental-strip-types scripts/bench-engine-pruning.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm quadruple parity anti-king non-consecutive nc-white-dots whispers palindrome palindrome-knight palindrome-whispers
node --experimental-strip-types scripts/bench-exact-houses.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm --generation-only --recipes=/tmp/renban-recipes.json
node --experimental-strip-types --test scripts/bench-renban-app.mts
```

## Entropic Lines native and app integration

[Issue 58](https://github.com/coder13/sudoku-app/issues/58) starts from main `679311f` and incorporates photo-import PR 155 at `d4235f4`. [Source contract and full/partial path table](../../SUDOKU_ENTROPIC_AUDIT.md)

An inspected Clover puzzle/solution pair and five complete original Coach exports establish six independently unique source puzzles. The native rule preserves independent touching paths, two-cell different-group rules, one-cell unrestricted paths, closures and revisits. It checks at most six repeating group orders. Ksy3 now imports every Renban, Palindrome, sum, dot and Entropic clue. Its orange path is redundant for uniqueness, so structural checks retain it. Global Entropy companions still reject explicitly.

Native validation passes 344 tests, sixteen capability combinations, four Wasm profiles and strict full/reduced Cargo documentation. The combined photo-import/Entropic app passes TypeScript, 485 app tests, 292 Wasm contracts and the 161-route production/offline build. Native support checks exhaust 262,144 two-cell domain pairs and independently enumerate longer examples. Tests replay every source action, check each positive Entropic proof independently, preserve actual storage/history/sharing, and test practice and score/first-technique generation targets.

The legacy 65,536-selection regression remains intact. New Entropic composition checks cover each of eighteen companion families, every companion pair and the full inventory. All 171 compatible cases pass, and two intentional contradictions reject. These bounded witnesses do not establish arbitrary layouts feasible. Static review covers twenty-eight actual React/CSS clue exports at 900/360 pixels in light/dark themes. Live viewport interaction and New puzzle calibration remain open.

All 8,167 complete retained responses match without response normalization. This includes 8,019 variant responses over 53 corpus positions and 354 positive practice positions, plus 148 Classic responses. All 118 prior detector lists, full traces, ratings and hint pages agree under explicit legacy orders. The catalog adds only `entropic`, at 27 points/Medium. The inherited cost passes the independent proof-effort model. Existing costs, default relative order and scoring version 8 remain unchanged.

Fresh builds use separate Cargo targets per source checkout. The current-main control reproduces baseline SHA-256 `7949a66187f5e820926efc8891578f42f5f5f3ab70f260f4db0f688599523e17`. The candidate and its production rebuild retain `8d5e9764319156a5b20a7f81f2e6a527e4a7c3c1a5d1a44bcbfda128d42bd0d9`. Photo import changes no Rust engine inputs, so earlier paired kernel measurements use those same final binaries. All compressed sizes use Node `gzipSync` at its default level.

| Wasm profile | Current main raw/gzip bytes | Entropic raw/gzip bytes |
| --- | --- | --- |
| Solver | 2,061,762 / 563,437 | 2,061,762 / 563,437 |
| Variant solver | 2,631,886 / 709,431 | 2,621,084 / 706,969 |
| Classic | 2,563,763 / 663,682 | 2,563,763 / 663,682 |
| App | 3,358,070 / 901,120 | 3,402,659 / 898,241 |

App adds 44,589 raw bytes and saves 2,879 gzip bytes. Variant solver saves 10,802 raw/2,462 gzip bytes. Solver and Classic sizes stay unchanged. The final comparison includes photo import in both builds. Seventeen client JavaScript assets change from 6,045,046/1,994,102 to 6,051,600/1,995,352 raw/gzip bytes. The Entropic delta is 6,554 raw/1,250 gzip bytes. Each asset is compressed separately. Compiler output size changes do not establish a request speedup.

Paired measurements use Node 26.13.0 on macOS arm64. Engines alternate and use their actual declared native/app default orders. Full proofs, ratings, choices and traces agree. The metadata comparison removes only the newly declared technique ID from the candidate rating order. The separate strict comparison above sends the same explicit legacy order to both builds and changes no response fields.

Candidates, exact calls, native rates and ten raw hints use five warmups/twenty samples. App rates use two/five. Exhaustive requests use two/ten in the older retained corpus and two/five in the XV/Renban corpus. Values are median/p95 milliseconds. The p95 of five is the maximum. Fresh-instance first requests also preserve complete responses. Instantiation, browser startup, transfer, layout and paint are excluded.

A separate puzzle-library grading audit consumes one CPU core at the start of the paired phase. No audit-owned compiler, test or other benchmark runs concurrently. The final source-only phase starts after that background audit finishes. The host remains nondedicated. Preserve the slower samples and do not infer a general speedup.

| Retained fixture | Candidates, main → Entropic | Unique analysis | Exact solve | Native rate |
| --- | --- | --- | --- | --- |
| quadruple | 0.061/0.077 → 0.060/0.100 | 0.517/0.579 → 0.515/0.587 | 0.404/0.445 → 0.402/0.427 | 1.210/1.310 → 1.213/1.377 |
| parity | 0.018/0.024 → 0.018/0.025 | 0.029/0.036 → 0.028/0.033 | 0.030/0.052 → 0.029/0.041 | 0.132/0.138 → 0.129/0.138 |
| anti-king | 0.016/0.026 → 0.016/0.025 | 0.021/0.022 → 0.022/0.022 | 0.022/0.024 → 0.022/0.025 | 0.139/0.176 → 0.136/0.188 |
| non-consecutive | 0.021/0.082 → 0.022/0.087 | 0.098/0.127 → 0.099/0.125 | 0.096/0.106 → 0.094/0.096 | 0.361/0.403 → 0.361/0.408 |
| nc-white-dots | 0.053/0.073 → 0.053/0.083 | 0.310/0.349 → 0.311/0.360 | 0.307/0.319 → 0.307/0.326 | 1.000/1.098 → 1.031/1.152 |
| whispers | 0.018/0.019 → 0.019/0.022 | 14.674/15.513 → 14.564/15.346 | 14.545/14.816 → 14.553/15.870 | 0.281/0.292 → 0.275/0.289 |
| palindrome | 0.017/0.019 → 0.018/0.021 | 0.033/0.035 → 0.034/0.036 | 0.035/0.051 → 0.036/0.036 | 0.104/0.108 → 0.100/0.106 |
| palindrome-knight | 0.020/0.028 → 0.020/0.026 | 0.044/0.049 → 0.044/0.050 | 0.043/0.044 → 0.044/0.045 | 0.871/0.995 → 0.874/0.957 |
| palindrome-whispers | 0.026/0.100 → 0.025/0.087 | 0.514/0.653 → 0.500/0.547 | 0.104/0.144 → 0.106/0.125 | 0.818/0.843 → 0.809/0.880 |
| xv-clover | 0.023/0.033 → 0.021/0.026 | 0.073/0.105 → 0.071/0.104 | 0.046/0.049 → 0.045/0.047 | 0.321/0.504 → 0.320/0.502 |
| xv-quadruple-clover | 0.033/0.084 → 0.028/0.082 | 0.119/0.128 → 0.118/0.127 | 0.123/0.152 → 0.123/0.139 | 0.259/0.332 → 0.260/0.313 |
| 7v7n | 0.016/0.018 → 0.016/0.026 | 0.399/0.418 → 0.397/0.468 | 0.139/0.190 → 0.133/0.225 | 0.116/0.154 → 0.112/0.153 |
| FCeS | 0.022/0.034 → 0.022/0.043 | 0.087/0.092 → 0.082/0.113 | 0.092/0.286 → 0.091/0.402 | 0.541/1.367 → 0.558/1.543 |
| 63Jk | 0.010/0.014 → 0.010/0.012 | 0.085/0.152 → 0.052/0.122 | 0.039/0.044 → 0.039/0.040 | 0.994/1.121 → 1.042/1.100 |
| Chcs | 0.026/0.027 → 0.025/0.029 | 1.351/1.416 → 1.250/1.338 | 0.726/0.777 → 0.682/0.763 | 20.471/20.663 → 20.457/20.920 |
| renban-clover | 0.034/0.041 → 0.033/0.042 | 0.145/0.177 → 0.151/0.178 | 0.142/0.156 → 0.143/0.165 | 0.223/0.329 → 0.254/0.325 |
| renban-killer-clover | 0.028/0.030 → 0.028/0.033 | 0.149/0.158 → 0.149/0.161 | 0.151/0.190 → 0.152/0.206 | 0.160/0.176 → 0.170/0.183 |
| Jh4o | 0.043/0.044 → 0.044/0.048 | 0.820/0.862 → 0.830/0.869 | 0.240/0.249 → 0.241/0.252 | 0.185/0.258 → 0.182/0.223 |
| KUUo | 0.017/0.043 → 0.016/0.021 | 0.121/0.127 → 0.122/0.122 | 0.056/0.058 → 0.056/0.056 | 0.080/0.109 → 0.080/0.126 |
| BSms | 0.020/0.029 → 0.020/0.024 | 718.721/729.708 → 721.466/735.354 | 43.250/43.966 → 43.552/44.477 | 0.057/0.061 → 0.057/0.064 |

| Retained fixture | App rate, main → Entropic | Ten hints | Exhaustive | Committed MiB |
| --- | --- | --- | --- | --- |
| quadruple | 1.261/1.407 → 1.276/1.664 | 0.248/0.658 → 0.238/0.506 | 150.534/152.986 → 151.124/156.138 | 1.50 → 1.50 |
| parity | 0.173/0.181 → 0.173/0.179 | 0.076/0.081 → 0.078/0.085 | 47.017/55.884 → 48.751/56.006 | 3.56 → 3.56 |
| anti-king | 0.154/0.243 → 0.155/0.184 | 0.115/0.126 → 0.116/0.129 | 100.414/107.839 → 100.539/108.625 | 10.44 → 10.44 |
| non-consecutive | 0.390/0.457 → 0.392/0.458 | 0.082/0.095 → 0.085/0.102 | 34.670/41.288 → 34.760/36.833 | 4.06 → 4.06 |
| nc-white-dots | 1.041/1.114 → 1.046/1.183 | 0.338/0.495 → 0.340/0.453 | 0.363/0.855 → 0.362/0.539 | 1.50 → 1.50 |
| whispers | 0.320/0.330 → 0.316/0.347 | 3.259/4.157 → 3.200/3.391 | 3.375/3.706 → 3.441/4.663 | 1.56 → 1.56 |
| palindrome | 0.120/0.130 → 0.118/0.127 | 40.389/41.548 → 40.986/43.277 | 41.059/45.283 → 40.442/42.073 | 3.38 → 3.38 |
| palindrome-knight | 0.909/1.028 → 0.932/1.005 | 0.140/0.282 → 0.140/0.178 | 198.837/212.062 → 196.934/209.372 | 5.06 → 5.06 |
| palindrome-whispers | 103.250/109.044 → 103.107/108.403 | 0.221/0.433 → 0.228/0.286 | 2.410/2.581 → 2.453/2.681 | 8.31 → 8.31 |
| xv-clover | 5.828/6.693 → 6.107/6.661 | 0.132/0.383 → 0.128/0.421 | 129.159/132.555 → 128.363/134.434 | 2.1250 → 2.1250 |
| xv-quadruple-clover | 0.314/0.332 → 0.312/0.377 | 0.133/0.176 → 0.139/0.150 | 140.280/142.955 → 142.710/143.635 | 1.8750 → 1.8750 |
| 7v7n | 90.902/97.928 → 91.855/99.393 | 280.749/286.816 → 281.994/293.817 | 291.766/314.272 → 284.526/289.898 | 4.6875 → 4.6875 |
| FCeS | 7.461/7.753 → 7.363/7.640 | 0.121/0.196 → 0.123/0.192 | 0.869/1.022 → 0.902/0.918 | 2.3125 → 2.3125 |
| 63Jk | 4012.948/4164.703 → 4016.598/4072.822 | 0.105/0.118 → 0.108/0.119 | 376.179/385.166 → 376.711/389.575 | 6.3125 → 6.3125 |
| Chcs | 260.805/265.698 → 259.276/260.666 | 296.280/302.727 → 297.696/307.144 | 299.573/301.983 → 297.067/310.238 | 1.5000 → 1.5000 |
| renban-clover | 0.250/0.266 → 0.257/0.272 | 0.133/0.180 → 0.129/0.160 | 87.674/87.899 → 87.315/88.002 | 4.6875 → 4.6875 |
| renban-killer-clover | 0.186/0.297 → 0.195/0.269 | 0.137/0.151 → 0.143/0.152 | 64.263/68.296 → 63.924/64.077 | 3.9375 → 3.9375 |
| Jh4o | 861.670/872.535 → 851.869/863.760 | 71.760/73.288 → 71.436/72.107 | 89.060/90.385 → 88.576/90.115 | 4.2500 → 4.2500 |
| KUUo | 64.040/64.261 → 63.569/64.032 | 0.084/0.086 → 0.088/0.092 | 47.989/49.175 → 48.248/48.946 | 4.5625 → 4.5625 |
| BSms | 67.713/71.027 → 66.852/74.279 | 87.822/89.348 → 87.876/89.999 | 88.159/88.741 → 87.665/90.380 | 6.7500 → 6.9375 |

Selected Whispers uniqueness searches and final-position Palindrome/Whispers Tridagon scans retain their zero-proof outcomes. The committed capacities above measure raw-instance Wasm buffer sizes after fixed request sequences. They do not measure RSS, browser heap or live allocations. BSms grows from 6.75 to 6.9375 MiB. Existing slow 63Jk, Jh4o and exhaustive searches remain in the broader performance audit.

Generation controls alternate engines over seeds 1–20 for each of six retained families. They allow six attempts and 20,000 nodes per exact check, with no warmups. Both receive the baseline native technique order explicitly. All 120 complete outcomes match, including Renban seed 10 reaching its budget. Every accepted Renban result passes independent digit-array uniqueness and family-dependence checks outside timing.

| Retained generation | Successes, main/Entropic | Main median/p95 ms | Entropic median/p95 ms | Failed seeds in both |
| --- | --- | --- | --- | --- |
| classic | 20/20 | 0.575/0.851 | 0.584/0.797 | None |
| x-sudoku | 20/20 | 0.586/0.698 | 0.584/0.715 | None |
| killer | 20/20 | 2.606/3.204 | 2.608/3.021 | None |
| jigsaw-killer | 20/20 | 2.411/2.598 | 2.486/2.635 | None |
| windoku | 20/20 | 0.782/2.114 | 0.785/2.149 | None |
| renban | 19/19 | 100.153/296.848 | 101.674/301.654 | 10 |

New source requests have no pre-port engine baseline. The main engine does not support Entropic rules. Direct requests include serialization and compare complete results outside timing. One raw instance is reused across the six source cases. Its committed capacity is cumulative, not isolated per puzzle. The actual app callers use separate in-process worker instances.

| New source | Candidates | Unique analysis | Exact solve | Native rate | App rate |
| --- | --- | --- | --- | --- | --- |
| clover | 0.029/0.078 | 0.101/0.123 | 0.054/0.074 | 0.176/0.192 | 0.172/0.176 |
| EoGB | 0.011/0.012 | 0.038/0.046 | 0.038/0.039 | 0.098/0.140 | 0.131/0.134 |
| BSEJ | 0.016/0.017 | 0.094/0.098 | 0.081/0.085 | 0.057/0.060 | 0.211/0.216 |
| Hyk5 | 0.015/0.028 | 6.637/6.825 | 2.541/2.664 | 0.077/0.089 | 895.314/899.913 |
| Hafj | 0.018/0.022 | 0.875/0.936 | 0.777/0.882 | 0.072/0.086 | 104.657/107.647 |
| Ksy3 | 0.070/0.077 | 0.261/0.313 | 0.249/0.261 | 0.485/0.554 | 0.511/0.527 |

| New source | Ten raw hints | Exhaustive | Ordinary app choices | Cumulative raw-instance MiB |
| --- | --- | --- | --- | --- |
| clover | 0.162/0.353 | 78.008/78.344 | 10 | 4.7500 |
| EoGB | 2.666/2.880 | 116.362/127.574 | 10 | 6.9375 |
| BSEJ | 122.902/125.991 | 130.223/132.041 | 10 | 6.9375 |
| Hyk5 | 3.337/3.429 | 3.336/3.413 | 7 | 6.9375 |
| Hafj | 3.264/3.376 | 3.220/3.395 | 3 | 6.9375 |
| Ksy3 | 0.175/0.183 | 1243.320/1246.534 | 10 | 7.2500 |

Actual preview, hints and walkthrough use two warmups/five samples. Play candidates, input and grid SSR use five/twenty. Assertions check the independently known completion, full score/count metadata and clue counts outside timing. Both incomplete walkthroughs remain explicitly stalled. These measurements exclude browser startup, transfer, layout and paint.

| New source | Preview including rating | Play candidates | Ordinary app hints | Walkthrough | Input with candidates | Grid SSR |
| --- | --- | --- | --- | --- | --- | --- |
| clover | 0.314/0.323 | 0.021/0.025 | 0.246/0.266 | 1.768/2.762 | 0.049/0.066 | 1.732/2.424 |
| EoGB | 0.540/1.860 | 0.013/0.018 | 2.554/2.727 | 3.059/4.859 | 0.034/0.061 | 1.498/1.986 |
| BSEJ | 0.561/0.605 | 0.017/0.019 | 121.005/121.980 | 2.971/3.182 | 0.097/0.104 | 1.755/1.993 |
| Hyk5 | 906.913/914.713 | 0.016/0.020 | 3.541/3.588 | 905.069/917.465 | 0.032/0.094 | 1.714/1.917 |
| Hafj | 105.931/106.490 | 0.019/0.022 | 3.327/3.551 | 104.325/106.887 | 0.060/0.119 | 1.759/1.999 |
| Ksy3 | 1.428/6.541 | 0.070/0.079 | 0.245/0.252 | 3.826/4.146 | 0.159/0.395 | 2.247/2.871 |

New Entropic template generation succeeds on all twenty seeds, with twenty distinct puzzles. It preserves thirty givens and eight fixed clues. Median/p95 is 3.312/13.564 ms under six attempts and 20,000 nodes. Repeated requests agree completely. Independent counting proves every accepted puzzle unique and multiple without Entropic. These are fixed-template controls, not very-hard difficulty calibration.

[Issue 162](https://github.com/coder13/sudoku-app/issues/162) tracks Hyk5/Hafj human reasoning. Hyk5 app rating uses 895.314/899.913 ms despite 2.541/2.664 ms exact solving. BSEJ ordinary hints use 121.005/121.980 ms despite a complete cheap rating. Those remaining searches, worker transport, browser cold loading and profile boundaries stay in [issue 88](https://github.com/coder13/sudoku-app/issues/88).

Repeat from separate source checkouts and Cargo targets. The retained generation recipe file appends the Clover Renban template to `crates/engine/benches/fixtures/variants.json`. Clear its givens and request thirty givens, twelve clues and `requiredRule: "renban"`. The optional retained-source JSON uses a `cases` array of `{name, position: {puzzle}, solution}` records from the five original Renban fixtures.

```sh
node --experimental-strip-types scripts/compare-engine-pruning.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv --renban --entropic
node --experimental-strip-types scripts/bench-engine-pruning.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm quadruple parity anti-king non-consecutive nc-white-dots whispers palindrome palindrome-knight palindrome-whispers --added-technique=entropic
node --experimental-strip-types scripts/bench-xv-rating.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm --added-technique=entropic
node --experimental-strip-types scripts/bench-xv-rating.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm /tmp/renban-inputs.json --added-technique=entropic
node --experimental-strip-types scripts/bench-exact-houses.mjs /tmp/main-wasm/engine.wasm src/sudoku/generated/engine.wasm --generation-only --legacy-order --recipes=/tmp/retained-recipes.json
node --experimental-strip-types --test scripts/bench-entropic-app.mts
```


## Global Entropy integration evidence

`global-entropy-newman.json` records Philip Newman’s twenty-given Ordered Entropy puzzle, its inspected puzzle/solution PDFs and their hashes. `global-entropy-coach.json` preserves ten original exports. Three have complete supported inventories and independently unique printed completions: A2s7, CJhv and AdoP. The other seven retain their authored-rule, companion, geometry or format gaps. Raw positive payloads do not establish complete authored-source support.

The independent counter directly enumerates digits and houses without production support tables. CJhv also retains two direct completion witnesses after removing only Global Entropy. Proof replay enumerates every four-cell numeric assignment from the declared domains. All eight square symmetries preserve complete source rules and exact completions through actual Wasm.

The [Global Entropy audit](../../SUDOKU_GLOBAL_ENTROPY_AUDIT.md) records the source contract, 24-point Easy technique, full and partial logical paths, package costs, all 26 retained performance controls, four new-source caller measurements, 140 matching old-generation outcomes and twenty new independently checked puzzles. The shared app benchmark accepts `SUDOKU_BENCH_FAMILY=global-entropy`; its old Entropic default stays available. Final CI and merge are tracked in [issue 60](https://github.com/coder13/sudoku-app/issues/60).


## Modular Lines native and app integration

`modular-newman.json` records both inspected PDFs for Philip Newman's eighteen-given Birbs of Paradise, its six independent Entropic paths, six independent Modular paths and printed completion. `modular-coach.json` retains eight original sources, their descriptions, solutions, image hashes and the compiler's original nine-cell-wide demonstration. Three complete 9 × 9 sources have independent unique completions; removing either line family from the published puzzle yields multiple completions. Six companion/grid gaps stay explicit. The two zero-given imports preserve every sum and marker, including HCHW's printed XI total. [Source rules, app contracts, package sizes, measurements and limits](../../SUDOKU_MODULAR_AUDIT.md)

## X-Sums app integration

`x-sum-newman.json`, `x-sum-murphy.json` and `x-sum-clover.json` retain complete published 9×9 puzzle/solution PDF pairs, all printed totals and givens, directions, ordered rays, completions and PDF hashes. Direct independent digit/permutation search verifies every unique completion and required-family dependence. The app paths are complete Hard at 3,036/2,710/1,916 points; native technique cost remains 80.

`x-sum-unsupported-AsnF.json` retains the original Coach code, decoded cosmetic totals, author context and completion. Automatic import still rejects that full payload. `x-sum-coach-transcription.json` is a separately labelled manual native transcription of all sixteen totals under the author's explicit rules, with zero givens and a complete 5,514-point Hard path. It is not a typed Coach export. The two `mixed` fixtures are authored regression companions and retain all source constraints; added clues are not attributed to the publishers.

Independent proof replay, all eight transforms, disabled profiles, input/history, storage/sharing, hints/pages/Finder, Learn/practice and calibrated Hard New Puzzle use the real app/worker callers. The bounded subset table used for local input is checked against direct full-row permutations. [Complete source, validation, performance and limits](../../SUDOKU_X_SUM_AUDIT.md). Full authored Coach formats remain in issue 7; diagonal X-Sums remain separate native research in 204.
