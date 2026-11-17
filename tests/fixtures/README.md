# Mixed-rule app fixtures

These fixtures test the complete imported puzzle definition. They are authored test puzzles, with known completions and source-format inputs. They are not a difficulty corpus or a claim of support for every Sudoku Coach rule.

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
