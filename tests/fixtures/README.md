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

## Repeating the checks

Run `npm test` for decoder, independent-counter, and storage contracts. Run `npm run test:wasm` for the compiled browser engine, imported-game flow, and family-subset matrix. The new suite is `../variant-import-wasm.mts`. Browser verification on 2026-11-17 covered desktop Play and preview, 390-by-844 preview and rule dialogs, overlapping dot visibility, move/undo/redo, reload, multiple hints, the full share payload, and completion returning to the puzzle chooser.

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
