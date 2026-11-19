# Sudoku engine TODO

The Rust engine supports ordered logical solving, ratings, ranked hints, and targeted generation. It detects singles, pointing, claiming, naked and hidden subsets through size four, locked pairs and triples, basic, finned, and Sashimi fish through Jellyfish, XY-Wing, XYZ-Wing, WXYZ-Wing, W-Wing, Skyscraper, Two-String Kite, Empty Rectangle, Simple Coloring, 3D Medusa, X-Chains, and XY-Chains. It also detects plain and grouped Alternating Inference Chains and Nice Loops, Unique Rectangles, Hidden Rectangle, BUG+1, forcing chains and nets, ALS-XZ, ALS-XY-Wing, ALS chains, Sue de Coq, Death Blossom, Junior Exocet, Senior Exocet, Double Exocet, SK Loop, and Multi-Sector Locked Sets. The browser worker exposes these engine functions through WebAssembly. [Engine requirements](README.md#engine-requirements) · [Browser worker](src/sudoku/engine.worker.ts)

See the [engine roadmap](SUDOKU_ENGINE_ROADMAP.md) for priorities, integration status, architecture boundaries, and addition criteria.

## Packaging and release discipline

- [x] Compile variant rules, puzzle generation, and teaching fixtures independently while preserving default behavior.
- [x] Publish named Wasm profiles and report the compiled capabilities through the public request API.
- [x] Test every capability combination and compare retained behavior and measured Wasm sizes.
- [x] Record what reached main and identify the remaining research work without changing the original worktrees.
- [x] Define how and why to add a rule, technique, policy, or optimization, with evidence and release criteria.
- [x] Add automated native, feature-matrix, Wasm, app, and Cargo documentation checks for engine changes.
- [ ] Evaluate narrower expert-detector and variant-family boundaries against actual callers and package savings.
- [ ] Integrate each remaining research contribution through a focused change against current main.

## Variant graph performance

- [x] Separate rectangle-graph construction and traversal on the published HCHW opening and both saved stalls. Native construction dominates at roughly 60/26/22 ms; traversal remains below 0.2 ms. Retain the raw timing log and exact source head in the isolated performance worktree. [Issue 175](https://github.com/coder13/sudoku-app/issues/175)
- [x] Reuse the immutable rectangle graph, including an empty result, across its three inference techniques within one logical position. Guard board/mask provenance and preserve eligibility, traversal order and proof fields. All 356 native unit/integration tests and seven Cargo examples pass together in the full release command, including published positive chains and stale-input controls. Keep all four empty-domain checks inside Quadruple recursion; the independent assignment cases cover each empty cell and preserve A2s7/CJhv exact costs.
- [x] Preserve 12341 complete replies on 83 variant corpus positions and 363 positive practice positions, all 121 detectors and every hint page, plus 148 Classic replies. Pass 520 app tests, 316 Wasm contracts, TypeScript, four package profiles, strict documentation and the 163-route production build. [Evidence and costs](SUDOKU_RECTANGLE_GRAPH_AUDIT.md)
- [x] Complete the 33-puzzle paired request, 13-source app caller and 180-outcome generation audit. Pass every CI/deployment gate on reviewed head `97d5751`, including all sixteen capability combinations and strict documentation. Merge [PR 180](https://github.com/coder13/sudoku-app/pull/180) at `c90d16e`, verify remote main ancestry and identical shipping sources, and record the exact-search regression control plus measured package/memory costs. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44416406932) · [Final audit](SUDOKU_RECTANGLE_GRAPH_AUDIT.md)

- [x] Speed up dense empty Quintuple Pattern Overlay scans without truncating complete results. Preserve HCHW app step 22 and the positive multi-digit proof controls. [Separate performance issue](https://github.com/coder13/sudoku-app/issues/179)
- [x] Isolate the dense scan's nine slow witness queries for digits 4–6 in R7C1. Preserve its full source position, domains and extra equal-digit exclusions. Validate the supplied five-digit witnesses independently.
- [x] Separate template packing into a private module. Verify complete support against direct assignments, edited domains, partial seeds, both family orders and exhausted probes. Preserve quick original-order witnesses before the bounded alternate order and unrestricted fallback; retain independently checked dense geometric witnesses.
- [x] Preserve all 12341 variant replies and 148 Classic replies, every detector and page, plus 36 complete reduced-package replies. Pass all 366 native cases, sixteen capability combinations, four profiles, strict Cargo documentation, TypeScript, 534 app tests and 317 Wasm contracts in exact-head CI. Build all 169 production routes. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44432001118)
- [x] Measure dense scans, edited fast controls, all five positive widths, 33 retained puzzles, 180 generation outcomes and thirteen actual app sources on frozen artifacts. Merge [PR 182](https://github.com/coder13/sudoku-app/pull/182) at `5db8029`; verify remote main ancestry and exact Rust/scripts/shared engine-call equality. Dense scans fall from 61.2–62.8 seconds to 18.9–26.0 ms; nearby warmed controls stay within about 1%. Record the slower CJhv rating, package sizes and focused capacity increases in the [audit](SUDOKU_OVERLAY_SUPPORT_AUDIT.md).
- [x] Verify the integrated main app with PR 186: all 536 app tests, TypeScript, the 119-component catalog and all 171 production routes pass. The reviewed Wasm hash and all five generated JSON files are unchanged.
- [x] Pass every gate again on exact merged head `5db8029` in [main CI](https://github.com/coder13/sudoku-app/actions/runs/44436059259), including all 366 native cases, sixteen capability combinations, four profiles, strict documentation, 536 app tests and 317 Wasm contracts. Record the complete measurements, limits and release in the audit.

## App integration

The current priority is UI parity for all seven rule families already in the engine, plus New Puzzle generation for every supported variant, including the thirteen import-only families. [Parity inventory and acceptance](SUDOKU_ENGINE_UI_PARITY.md)

- [x] Integrate Between Lines with complete import, visible/accessibly labelled clues, input/candidates, history, persistence, sharing, hints, Finder/pages and solutions. [PR 190](https://github.com/coder13/sudoku-app/pull/190)
- [x] Preserve the complete published Newman grid/solution and Raumplaner’s original zero-given Between/black-dot export. Independently verify both unique completions, original path order and all companion rules.
- [x] Add basic Between app acceptance/import, endpoint/interior conflict restrictions and cleanup in both Pencil modes. Check every partial three-cell assignment independently in both orientations, repeated interior digits, histories and hidden-setting rejection. TypeScript and the 120-component catalog pass.
- [x] Keep Between paths, endpoint circles, overlapping line families and accessible cell roles visible on desktop/mobile; preserve all eight grid symmetries and sharing after progress.
- [x] Calibrate Between Easy generation on twenty seeds: twenty distinct thirty-given puzzles, all independently unique and dependent on Between Lines. Add the native request recipe, New Puzzle choice and preview.
- [x] Verify Between help/storage/practice, full source replay, every hint page, Finder counts and exact solutions. Calibrate nineteen unique Medium successes from forty one-attempt seeds and add three checked fallback recipes, preserving the default Medium choice.
- [x] Reproduce the rotated-puzzle fallback and pass native full-puzzle exclusions through the app generation path. Verify that Medium retries exclude the played puzzle and all square symmetries.
- [x] Check light/dark clue renders at 290/540 pixels and measure actual Between candidates, verification, exact solves, ratings, hints, input, SSR and both New Puzzle levels. Verify the unchanged Wasm and pinned-baseline JavaScript/CSS costs. [Audit](SUDOKU_BETWEEN_AUDIT.md)
- [x] Complete the final full rerun: all 547 app tests and 330 Wasm contracts pass, along with TypeScript, catalog and production/offline build.
- [x] Pass exact-head release gates and merge Between Lines. Head `f459103` passed 366 native, 547 app and 330 Wasm tests, sixteen capability combinations, four profiles, strict Cargo docs and deployment in [CI 44447946113](https://github.com/coder13/sudoku-app/actions/runs/44447946113). [PR 190](https://github.com/coder13/sudoku-app/pull/190) reached main at `30bbd85`; fetched main contains the reviewed head and merge, with identical shipping sources.
- [ ] Add New Puzzle generation for the thirteen existing import-only variants, with checked recipes and full player-flow tests. [Issue 189](https://github.com/coder13/sudoku-app/issues/189)
- [x] Integrate Region Sum Lines, including Medium New Puzzle. [PR 193](https://github.com/coder13/sudoku-app/pull/193)
- [x] Preserve Symmetease and four complete Coach Region Sum controls, including every thermometer, dot and global rule. Independently verify all five printed completions and test separate/combined visits and Jigsaw boundaries. The isolated source worktree `codex/sudoku-ui-parity-region-sum` remains pinned to the reviewed head; validation and release are recorded below.
- [x] Add Region Sum import/validation, closed/connected drawing geometry, visible/accessibly labelled desktop/mobile paths, both grouping modes, Jigsaw parts, conflicts, both Pencil modes and reversible bulk/individual entry. Verify every partial four-cell equal-sum assignment in two layouts.
- [x] Verify Region Sum hints/Finder/pages, exact and honest human paths, storage reload, sharing, all eight transformations, disabled profiles, Learn/practice and the real New Puzzle route. Calibrate twenty distinct independently unique/family-dependent Medium puzzles and preserve native played-puzzle exclusions. Reproduce and fix drawing metadata bypassing exclusions for Region Sum, Palindrome and Renban; retain public canonical geometry and reject invalid exclusions.
- [x] Pass local Region Sum gates: 369 native tests, 562 app tests, 345 Wasm contracts, strict full/core/variants docs, TypeScript, 121-component catalog and 171-route production/offline build. Match all 7,103 paired responses, including 200 generation outcomes; inspect light/dark 290/540-pixel clues and record performance/package costs. Recheck the integrated 562-app/345-Wasm suites, types, catalog and production build after main’s solved-view/mobile-header changes; compare package cost against the same main head. [Audit](SUDOKU_REGION_SUM_AUDIT.md)
- [x] Pass exact-head release gates and merge Region Sum Lines. Reviewed head `4d284a6` passes 369 native tests, sixteen capability combinations, strict full/core/variants Cargo docs, four Wasm profiles, 562 app tests, 345 Wasm contracts, TypeScript, the 121-component catalog and deployment in [CI 44460015789](https://github.com/coder13/sudoku-app/actions/runs/44460015789). [PR 193](https://github.com/coder13/sudoku-app/pull/193) reached main at `3706a0f`; fetched main contains the reviewed head and merge, with identical shipping sources. The separately compiled published Wasm also matches all 7,103 complete responses, including generation outcomes. Keep its remaining human coverage, single-choice FaxQ hint and slow rating/search work in [192](https://github.com/coder13/sudoku-app/issues/192).
- [x] Integrate Clone, including Easy New Puzzle. [PR 195](https://github.com/coder13/sudoku-app/pull/195)
- [x] Add native/shared Clone import, strict validation, visible shaded clues and matching letters, accessible partner addresses, transitive equality cleanup/conflicts, both Pencil modes and all eight coordinate transforms. Retain independent digit repeats between different letters.
- [x] Verify complete published Clone human paths, exact solutions, multiple hints, selected pages/Finder, disabled profiles, practice/drills, shared progress and actual mixed-rule storage/history. Verify twenty actual Easy New Puzzle outcomes independently for uniqueness and Clone dependence, deterministic repeats and played-puzzle/symmetry/reordered-set exclusions.
- [x] Pass local Clone gates: 576 app tests, 359 Wasm contracts, strict contract types, 122-component catalog and 171-route production/offline build. Rebuild identical Wasm and five generated JSON files; independently replay Clone equality proofs and record complete app/legacy timing and package costs. [Audit](SUDOKU_CLONE_AUDIT.md)
- [x] Pass exact-head Clone release gates. Head `3022cf5` passes 369 native tests including seven Cargo examples, sixteen capability combinations, four Wasm profiles, strict full/core/variants docs, 576 app tests, 359 Wasm contracts, types, the 122-component catalog and deployment in [CI 44467126537](https://github.com/coder13/sudoku-app/actions/runs/44467126537). [PR 195](https://github.com/coder13/sudoku-app/pull/195) reached main at `193b336`; fetched main contains the reviewed head and merge, with identical shipping sources. The published lesson includes Clone clues, and the deployed Wasm matches the previously verified released artifact. Keep the original color/prose/unsummed-cage export work in issue 7.
- [x] Prepare two complete published Clone grid/solution controls, preserving all corresponding positions. Verify both printed unique completions and complete Easy human paths. Independently verify twenty distinct, unique, Clone-dependent Easy generation candidates per source. App and Easy New Puzzle integration are released through PR 195; issue 42 is closed and the source worktree stays pinned to the reviewed head.
- [x] Integrate Sandwich, including Hard New Puzzle, through [PR 199](https://github.com/coder13/sudoku-app/pull/199) at main `57420a3`. Issue 68 is closed.
- [x] Implement Sandwich acceptance, complete Coach 9VLq decoding, accessible outside gutters, local input/conflict checks, both Pencil modes, reversible input, candidates, hints/Finder, exact/human solutions, Learn/practice, storage/sharing, transformations and independently verified Hard New Puzzle generation. Local validation passes 589 app tests, 373 Wasm contracts and strict new-contract types.
- [x] Prepare complete Murphy/Newman Sandwich PDF controls, with sixteen/twenty-four givens and eight/nine outside clues. Independently verify both unique printed completions, native complete Hard app-order paths and twenty distinct unique/Sandwich-dependent Hard generation candidates per source. The full Coach Thermo Sandwich control also has an independently unique completion and a complete app-order human path. Preserve Terrain source D8HP separately in [196](https://github.com/coder13/sudoku-app/issues/196); its value modifiers and maximum-Sandwich semantics remain unsupported.
- [x] Pass local Sandwich production and performance checks: 171 prerendered routes, three actual-build offline contracts, unchanged rebuilt Wasm/generated JSON, static light/dark 290/540-pixel clues, measured candidate/input/hint/rating/solve/generation costs and paired existing-family checks. Retain slow Coach rating/hints and noisy paired tails in the [audit](SUDOKU_SANDWICH_AUDIT.md) and issue 192.
- [x] Pass exact-head Sandwich release gates. Head `0f04eab` passes 369 native tests including seven Cargo examples, sixteen capability combinations, four Wasm profiles, strict full/core/variants docs, 589 app tests, 373 Wasm contracts, types, the 123-component catalog and deployment in [CI 44472589808](https://github.com/coder13/sudoku-app/actions/runs/44472589808). Fetched main contains the reviewed head and merge with identical shipping sources. The published Sandwich lesson renders two outside clues; its deployed Wasm is byte-identical to the preceding release.
- [x] Prepare complete Murphy/Newman Little Killer PDF controls, with eight/nine givens and twelve outside diagonals each. Independently verify each unique printed completion in three search nodes and forty distinct, unique, Little Killer-dependent Medium generation candidates, twenty per source. Existing human paths remain partial. Renban ModE is now independently unique in 88,809 search nodes after the numeric oracle gained a clue-degree tie break; native default-budget solving matches its completion, while its human path has no opening move.
- [x] Integrate Little Killer, including Medium New Puzzle, through [PR 203](https://github.com/coder13/sudoku-app/pull/203) at main `e85d79c`. Head `975a44c` passes 369 native tests including seven Cargo examples, sixteen capability combinations, four Wasm profiles, strict full/core/variants docs, 604 app tests, 388 Wasm contracts, types, the 123-component catalog and deployment in [CI 44481555013](https://github.com/coder13/sudoku-app/actions/runs/44481555013). Fetched main contains the reviewed head and merge with identical shipping sources. The published lesson draws both outside arrows; deployed Wasm matches the preceding release. [Issue 69](https://github.com/coder13/sudoku-app/issues/69)
- [x] Verify Little Killer edge/corner geometry, singleton directions, legal diagonal repeats, mixed outside anchors and the exact border inset shared with candidate links. Check light/dark 290/540-pixel source/candidate renders and independent sum/proof replay. Preserve partial human paths, zero Renban hints and slow exact import honestly in the [audit](SUDOKU_LITTLE_KILLER_AUDIT.md), issue 192 and joint-proof follow-up [202](https://github.com/coder13/sudoku-app/issues/202).
- [x] Measure Little Killer candidates, input, hints, rating, exact solving, Medium generation, retained memory, paired existing-family callers and package costs. Actual Medium New Puzzle is about 3.2 ms median; Renban ModE exact import is about thirteen seconds.
- [x] Prepare three complete published X-Sums PDF controls and all sixteen totals from Coach AsnF. Independently verify all four unique printed completions and complete Hard app-order paths. Verify sixty distinct, unique, X-Sums-dependent Hard candidates, twenty per PDF source. Preserve the original cosmetic-only Coach encoding as a rejected full payload; its native transcription is manually checked, not automatic Coach decoding. Diagonal X-Sums remain separate research in [204](https://github.com/coder13/sudoku-app/issues/204).
- [x] Integrate X-Sums, including Hard New Puzzle, through [PR 206](https://github.com/coder13/sudoku-app/pull/206) at main `973a4f3`. Head `a24241e` passes 369 native tests including seven Cargo examples, sixteen capability combinations, four Wasm profiles, strict full/core/variants docs, 619 app tests, 404 Wasm contracts, types, the 123-component catalog and deployment in [CI 44487864316](https://github.com/coder13/sudoku-app/actions/runs/44487864316). Fetched main contains the reviewed head and merge with identical shipping sources. The published lesson renders two outside clues; deployed Wasm matches the preceding release. [Issue 70](https://github.com/coder13/sudoku-app/issues/70)
- [x] Verify full X-Sums source and companion flows, independent row-sum proof replay, every total 1–45 against direct nine-digit permutations, all eight transformations, twenty actual unique/family-dependent Hard New Puzzle results and several hints per generated puzzle. Preserve the original cosmetic-only AsnF export as an explicit automatic-import gap.
- [x] Check light/dark 290/540px X-Sums/mixed gutters, legend, Jigsaw cages and crowded candidates. Compare exact existing-family input/SSR output and measure candidate, hint, rating, solving, generation, retained capacity and package costs in the [audit](SUDOKU_X_SUM_AUDIT.md). Keep the unfinished broad Murphy exhaustive scan explicit in issue 192; bounded individual probes narrow the likely bottleneck to Quintuple Pattern Overlay, without claiming a completed search; the final focused benchmark selects X-Sums for exhaustive hints.
- [x] Reject malformed Coach Sandwich side arrays/null before conversion; preserve source edge meaning with explicit type checks and regression cases.
- [x] Prepare complete Murphy/clover!/Bulten Skyscrapers PDF controls, preserving twenty/twenty/four givens and eight/twenty/fifteen visibility clues. Independent numeric search verifies all unique printed completions in one/one/eleven nodes. Existing app-order paths are complete Hard at 1,744/2,104/3,798 points. Verify sixty distinct, independently unique, Skyscrapers-dependent thirty-given Hard calibration candidates, twenty per source. Actual UI and app generation remain pending. [Issue 80](https://github.com/coder13/sudoku-app/issues/80)
- [ ] Integrate Skyscrapers. [Issue 80](https://github.com/coder13/sudoku-app/issues/80)


Track app-ready variants individually in [the integration issue](https://github.com/coder13/sudoku-app/issues/35). Every new variant needs visible clues, accessible rules, working input, save/reload, shared puzzle data, and verified hints before full integration.

- [x] Audit Modular Lines against Newman's published eighteen-given puzzle/solution PDFs, the versioned Coach compiler, its official demo and eight original Coach exports. Preserve independent paths, short paths and repeated references; independently verify all three complete 9 × 9 sources. [Issue 59](https://github.com/coder13/sudoku-app/issues/59) · [Source and integration audit](SUDOKU_MODULAR_AUDIT.md)
- [x] Share the private six-order group-line kernel between Entropic and Modular rules. Verify both partitions against exhaustive two-cell digit domains and three-cell group domains, plus closures, revisits and long paths. Calibrate Modular's 27-point cost against three independent practice proofs.
- [x] Complete Modular app hints, accessible rendering, Learn, practice, import, storage and mixed-rule contracts through the final Wasm artifact.
- [x] Pass 360 native tests, sixteen capability combinations, four Wasm profiles, strict full/reduced documentation, TypeScript, 520 app tests, 316 Wasm contracts and the 163-route production build. Preserve 11161 full variant responses plus 148 Classic Tridagon replies with explicit old profiles.
- [x] Finish paired measurements on thirty retained engine fixtures and ten actual app caller controls. Preserve all 160 generation outcomes; independently verify twenty distinct thirty-given Modular puzzles and required-family dependence. Record package costs, timing variation and partial human paths in the [audit](SUDOKU_MODULAR_AUDIT.md).
- [x] Pass every CI and deployment check on reviewed head `494a9c3`, including all 360 native, 520 app and 316 Wasm tests. Merge Modular through [PR 176](https://github.com/coder13/sudoku-app/pull/176) at `70ceebb`, verify remote main ancestry and exact shipping-source equality, and record its limits. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44402439393) · [Issue 59](https://github.com/coder13/sudoku-app/issues/59)
- [ ] Extend the human solve path for Modular VII/XIII 2 without changing its complete original rules. [Reasoning and performance follow-up](https://github.com/coder13/sudoku-app/issues/175)

- [x] Audit Global Entropy against Newman's published twenty-given puzzle/solution PDFs and ten preserved Coach exports. Independently verify three complete combined exports. Identify authored rules absent from positive payloads and keep legacy, geometry and companion gaps explicit. [Source audit](SUDOKU_GLOBAL_ENTROPY_AUDIT.md)
- [x] Add the native four-cell coverage rule, a calibrated 24-point technique, three exercises, typed import, placed-digit conflicts and Pencil cleanup, accessible global rules, human explanations and a Learn article in the isolated integration worktree. Pass the focused actual-Wasm and desktop/mobile component contracts.
- [x] Integrate the merged prerequisite symmetry repair and verify all four complete Global Entropy sources under all eight transformations, including exact Wasm completions and unchanged companion rules. [PR 171](https://github.com/coder13/sudoku-app/pull/171)
- [x] Pass 354 native tests, sixteen capability combinations, four Wasm profiles, strict full/reduced Cargo documentation, TypeScript, 502 app tests and the complete Wasm contracts plus focused Global Entropy checks. Build all 162 production/offline routes.
- [x] Preserve all 10,679 retained responses and 140 generation outcomes. Measure twenty-six old fixtures and four new sources through native/app request paths. Generate twenty distinct thirty-given Global Entropy puzzles with independent uniqueness and rule-dependence checks. Record package costs, timing variations and remaining limits in the [audit](SUDOKU_GLOBAL_ENTROPY_AUDIT.md).
- [x] Pass every CI and deployment check on reviewed head `639c043`, including all 304 Wasm contracts, merge Global Entropy through [PR 173](https://github.com/coder13/sudoku-app/pull/173) at `18c982e`, verify remote main ancestry and record the release. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44390417985) · [Issue 60](https://github.com/coder13/sudoku-app/issues/60)
- [ ] Extend human solve coverage for the two Global Entropy/Quadruple sources. Keep their partial paths and exact completions explicit. [Reasoning research](https://github.com/coder13/sudoku-app/issues/172)
- [ ] Support authored forbidden Entropic connections and directed outside digit-group order clues. Keep LEjN and 7nms's complete original sources and additional mathematical rules intact. [Forbidden connections](https://github.com/coder13/sudoku-app/issues/168) · [Group order](https://github.com/coder13/sudoku-app/issues/169)
- [x] Move Quadruple circles and Odd/Even markers with transformed givens. Check fixed coordinates, repeated printed digits, immutable source puzzles, sharing and published completions under all eight square symmetries. Verify native normalization, candidates, uniqueness and exact completions through the released Wasm artifact. [Clue transformation repair](https://github.com/coder13/sudoku-app/issues/170)

- [x] Audit Entropic Lines against Clover's published puzzle/solution PDFs, five complete original Coach exports and two deferred Global Entropy combinations. Preserve independent touching paths, closed walks and the redundant Ksy3 clue. [Source and integration contract](SUDOKU_ENTROPIC_AUDIT.md)
- [x] Merge native/app Entropic integration through [PR 163](https://github.com/coder13/sudoku-app/pull/163). All checks passed on reviewed head `49d54c1`; main contains the release at `dded30a`. [Issue 58](https://github.com/coder13/sudoku-app/issues/58) is closed. Human solve coverage, live viewport review and New puzzle calibration remain follow-ups.

- [x] Audit Renban against two published puzzle/solution PDF pairs and six original Coach exports. Independently verify five complete 9×9 fixtures. Preserve the grid-size, legacy-format and Entropic companion gaps. [Source and integration contract](SUDOKU_RENBAN_AUDIT.md)
- [x] Merge Renban native/app integration through [PR 157](https://github.com/coder13/sudoku-app/pull/157). All checks passed on reviewed head `673523f`; main contains the release at `7ce7fcc`. [Issue 55](https://github.com/coder13/sudoku-app/issues/55) is closed. Live viewport review, New puzzle calibration and [BSms human solve coverage](https://github.com/coder13/sudoku-app/issues/158) remain follow-ups.

- [x] Audit the original Coach 99Eu sum-15 export and inspect its Roman XV clue. Independently verify its unique completion, redundant sum and essential authored control. Confirm that general totals need a native rule as well as UI. [Source audit and port requirements](SUDOKU_ADJACENT_SUM_AUDIT.md)
- [x] Merge general adjacent totals with complete native and app support through [PR 153](https://github.com/coder13/sudoku-app/pull/153). All checks passed on reviewed head `7be9b5c`; main contains the release at `6ff5ffc`. [Issue 72](https://github.com/coder13/sudoku-app/issues/72) is closed. Live viewport review and New puzzle calibration remain follow-ups.

- [x] Restore Solution and Technique Finder access for every built-in variant, including Jigsaw, in both desktop workspaces. Share the current-position hint path and preserve all regions, rules, entries, and removals. Keep variant scans on a background worker with separate interactive proof requests and rule-specific caches. [Hint and solution parity](https://github.com/coder13/sudoku-app/issues/97)
- [x] Add mobile solution walkthroughs with a read-only grid, explanations, and step navigation. Cover rendered controls and the app help services for all 56 offered variant/difficulty combinations, progressed Jigsaw region proofs, combined rules, preferences, and complete solution replay.
- [x] Integrate the performance changes from [PR 100](https://github.com/coder13/sudoku-app/pull/100). Preserve paged exhaustive hints for Classic and variants, per-position scan sharing and cancellation, independent history/generation workers, and batched singles. Test page boundaries, proof ordering, completed-count caching, and cancellation without interrupting other help.
- [x] Check variant hints and Technique Finder against the game's verified unique completion before starting work. Reject incorrect entries first, flag missing solution candidates for recovery, and cover every offered variant difficulty plus complete candidate grids and paged requests. [Variant hint validation](https://github.com/coder13/sudoku-app/issues/101)

- [x] Create an issue for each planned variant and separate combined-rule and performance work.
- [x] Add Windoku rendering, accessible rule labels, import, save/reload, and generation recipes for all ten difficulty levels using the existing extra-house engine rule. [Windoku](https://github.com/coder13/sudoku-app/issues/36)
- [x] Complete mixed-rule import, preview, Play, hints, sharing, and save/reload for the eight currently rendered families. Preserve rule indices and independent negative Kropki settings. Check all 256 family subsets on a representative fixture, sparse rule-dependent puzzles, and actual imported-game persistence. [Fixture evidence](tests/fixtures/README.md)
- [ ] Support every Sudoku Coach rule combination through import, preview, Play, sharing, and saved games. Preserve the full rule list and parameters. [Coach import](https://github.com/coder13/sudoku-app/issues/7) · [Combined rules](https://github.com/coder13/sudoku-app/issues/87)
- [ ] Complete UI support for each remaining engine rule family before integrating that variant. [Variant queue](https://github.com/coder13/sudoku-app/issues/35)
- [ ] Audit rule checks, candidate updates, technique searches, ratings, exact solving, and generation. Merge measured improvements to main in focused changes. [Performance](https://github.com/coder13/sudoku-app/issues/88)

The Wasm audit now measures candidates, uniqueness verification, exact solving, rating, hints, and generation. On the fixed Windoku fixture, warmed median/p95 times were 0.017/0.019 ms for candidates, 0.024/0.025 ms for verification, 0.024/0.027 ms for solving, 0.064/0.073 ms for rating, and 0.042/0.045 ms for ten hints. Generation matched 20 of 20 seeds at 0.927/2.413 ms. Run `node --experimental-strip-types scripts/bench-variants.mjs` after building Wasm to repeat the audit on one machine. [Fixtures](crates/engine/benches/fixtures/variants.json)

The expanded audit also covers a sparse Diagonal/Killer puzzle and a puzzle containing all eight rendered families. On 2026-11-17, warmed median/p95 rating times were 0.665/0.760 ms and 0.140/0.151 ms respectively; ten hints used 0.114/0.120 ms and 0.136/0.163 ms. Diagonal/Killer generation matched 20 of 20 seeds at 6.927/52.727 ms with six attempts and 20,000 nodes per attempt. These measurements extend the baseline; the native engine is unchanged in this integration. [Method and limits](tests/fixtures/README.md)

### Palindrome integration merged

This family reached main at `c38cc2b` through [PR 135](https://github.com/coder13/sudoku-app/pull/135). All CI and deployment checks passed on reviewed head `4504284`. The reviewed worktree remains on `codex/sudoku-palindrome-integration`. [Palindrome issue](https://github.com/coder13/sudoku-app/issues/49)

- [x] Render and inspect Clover's Palindrome and Newman's Anti-Knight Palindrome puzzle and completion PDFs. Independently prove unique completions and multiple completions after removing Palindrome. Both native default logical profiles complete, with six and ten opening choices.
- [x] Retrieve unmodified Coach `FgZb` and `FzzD` exports. Preserve their complete companion-rule inventories. Independently verify the one-given Whispers/Palindrome completion and its Palindrome dependency. Its native default profile still stalls, and its 20,000-node exact check reaches the budget limit.
- [x] Audit the versioned source compiler. Record connected-segment grouping and insertion-ordered cell deduplication before Palindrome compilation. Verify the Greater/Less pair direction against the published completion.
- [x] Add source-linked Clover, Newman and unmodified Coach fixtures. Import Palindrome and Whispers combinations while explicitly retaining rejection of unsupported inequality companions.
- [x] Preserve connected-component logical order and original drawing segments separately. Validate the drawing-cell union, transform all references and preserve old JSON. Add five native geometry, symmetry and wire-contract tests.
- [x] Add visible clues, paired-cell labels, odd-center explanations, conflicts and candidate cleanup. Preserve overlapping line colors and foreground dots. Pass desktop/mobile component, sharing and lesson tests.
- [x] Replay complete app-order solves on both published puzzles. Check every action against the independent completion, replay Palindrome proofs from mirrored domains, and verify hints, pages, Finder, practice, save/reload, undo and redo through Wasm.
- [x] Verify native generation with exact clue targets, preserved drawing geometry and independent rule dependence. Keep New puzzle presets behind separate difficulty calibration.
- [x] Pass 307 native tests, 413 app tests, 253 Wasm tests, sixteen capability combinations, four package profiles, strict full/reduced documentation, TypeScript and the 159-route production/offline build. Preserve all 3,419 retained responses. Verify 8,192 fixed-clue family selections, including intentional contradictory selections.
- [x] Record paired performance, unchanged choices and the 4,896-byte app gzip increase. Keep the slow app-order Coach rating in [issue 134](https://github.com/coder13/sudoku-app/issues/134). [Measurements and limits](tests/fixtures/README.md#palindrome-app-integration)
- [x] Pass CI on reviewed head `4504284`, merge through [PR 135](https://github.com/coder13/sudoku-app/pull/135) and confirm its ancestry on remote main. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44275164358)
- [x] Profile selected expert searches at the stalled Coach position. Record bounded digit-matching research without changing the shipped engine or claiming a rating speedup. [Rating audit](https://github.com/coder13/sudoku-app/issues/134)
- [ ] Finish live viewport interaction review. Static clue images and desktop/mobile component tests passed.
- [ ] Calibrate difficulty recipes before offering Palindrome in New puzzle. Native generation and exact clue targets already pass.
- [x] Improve the existing slow app-order Coach rating through [PR 137](https://github.com/coder13/sudoku-app/pull/137) and [PR 141](https://github.com/coder13/sudoku-app/pull/141). Preserve all techniques, scores and choices. Continue the broader audit in [issue 88](https://github.com/coder13/sudoku-app/issues/88).

### Inequality integration audit

This source audit led to the separate exact-search repair and app integration below. The family reached main through [PR 145](https://github.com/coder13/sudoku-app/pull/145). [Inequality issue](https://github.com/coder13/sudoku-app/issues/47)

- [x] Audit native directed pairs, symmetry, generation, the eight-point technique and three practice fixtures against main. Identify the missing playable-rule validation, Coach decoding, clue rendering and candidate cleanup.
- [x] Independently prove the preserved zero-given FzzD puzzle unique with all three Palindrome paths, seven inequalities and five white dots. Removing only inequalities gives multiple completions.
- [x] Check the published completion against native rules and all twenty actions in each logical trace. Both profiles stall at 98 points after nine steps and offer seven opening choices.
- [x] Identify the exact-search limit at both 20,000 and 1,000,000 nodes. Track a separate measured repair in [issue 139](https://github.com/coder13/sudoku-app/issues/139).
- [x] Establish a larger-budget baseline. Two million nodes still exhaust. Ten million nodes prove uniqueness in about 6.8 seconds and find the published completion in about 5.7 seconds. These are single local observations.
- [x] Isolate house Hidden Singles in the independent counter. Without them, 100,000 calls find no completion. With them, 52,244 calls prove uniqueness. Keep those counts separate from native node accounting.
- [x] Inspect the original FzzD published image. Match all seven sign directions, five white dots and three Palindrome paths to the preserved export.
- [x] Finish the complete app flow and preserve directed endpoints under every grid transformation. Pass CI on the reviewed family head before merging [PR 145](https://github.com/coder13/sudoku-app/pull/145).
- [x] Make sparse mixed-rule validation practical while keeping honest search-limit outcomes in [issue 139](https://github.com/coder13/sudoku-app/issues/139). Merge the measured repair through [PR 143](https://github.com/coder13/sudoku-app/pull/143).
- [x] Test exact-search house propagation. Preserve public candidate and logical-profile behavior. Check boundary budgets, ambiguous completions and seeded generation before selecting the implementation.

### Inequality app integration merged

This pass reached main at `1c32f32` through [PR 145](https://github.com/coder13/sudoku-app/pull/145). All CI and deployment checks passed on reviewed head `9ec697c`. The reviewed worktree remains on `codex/sudoku-inequality-integration`. [Inequality issue](https://github.com/coder13/sudoku-app/issues/47)

- [x] Decode ordered Coach `greaterLess` pairs without dropping companion rules. Validate distinct endpoints and reject unknown semantics. Preserve direction through all eight grid transformations.
- [x] Draw oriented signs with contrast halos and accessible smaller/larger cell labels. Show connectors for distant endpoints and keep dots visible on a shared pair. Check actual component paths at desktop and mobile sizes against the published diagram.
- [x] Add strict directed candidate cleanup, note cleanup and conflict checks. Cover all 81 digit pairs in both directions, boundary digits, unrelated cells, undo and redo.
- [x] Verify the full FzzD import, native completion, partial walkthrough, independent inequality proof replay, multiple hints, pages, Finder counts, all three practice exercises, checked answers and actual save/reload.
- [x] Pass 423 app tests, 258 Wasm contracts, TypeScript and the production/offline build. Preserve the exact released engine artifact. Check 16,384 fixed-clue family selections: 12,288 compatible samples pass and 4,096 contradictory samples reject. These counts do not prove arbitrary family combinations feasible.
- [x] Record app and engine request costs, provenance and remaining limits. Preview uses 909.715/913.208 ms and ten hints 5.770/6.007 ms through the in-process app transport. Preserve the released Wasm hash and record the 577-byte client JavaScript gzip increase. [Methods and limits](tests/fixtures/README.md#inequality-app-integration)
- [x] Pass CI on reviewed head `9ec697c`, merge the app-ready family separately and verify remote main ancestry. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44300678745)
- [ ] Finish live viewport interaction review and calibrate New puzzle recipes. Keep the partial 98-point FzzD logical path explicit.

### Sparse mixed-rule exact search merged

This pass reached main at `a1aeb27` through [PR 143](https://github.com/coder13/sudoku-app/pull/143). All CI and deployment checks passed on reviewed head `b027404`. The reviewed worktree remains on `codex/sudoku-exact-house-propagation`. [Exact validation issue](https://github.com/coder13/sudoku-app/issues/139)

- [x] Restrict exact-search domains with missing-digit support and Hidden Singles in enforced houses. Keep public candidates, enabled human techniques and seeded sampling unchanged.
- [x] Preserve region geometry without restoring removed region distinctness during generation dependency checks. Cover replacement Jigsaw regions, diagonals, extra houses, contradictory support and explicit node boundaries.
- [x] Profile a retained rating regression before release. Preserve bounded logical uniqueness eligibility so stronger public verification does not trigger expensive empty graph searches. Add the source-linked regression and rerun the final gates.
- [x] Add the faithful FzzD fixture and an independent mixed-rule counter. Verify the published unique completion and multiple completions when inequalities are removed.
- [x] Pass 321 native tests, 415 app tests, TypeScript, sixteen capability combinations, four package profiles, strict full/reduced Cargo documentation and the 159-route production/offline build.
- [x] Pass 255 final Wasm contracts. Check 6,574 complete responses: 6,536 match exactly and 38 finish previously exhausted exact requests. Preserve all 351 positive practice fixtures, 117 detector lists, hint pages and seeded completions. Validate each improved outcome against the original engine at a larger explicit budget.
- [x] Measure equal-budget completed exact work, native compilation and domain phases, nine retained fixtures, generation yield, memory and all package sizes. FzzD medians improve 6,603 → 483 ms for uniqueness and 5,727 → 392 ms for solving. Preserve the FgZb rating and record slower samples. [Methods and limits](tests/fixtures/README.md#exact-house-propagation-for-sparse-mixed-puzzles)
- [x] Pass CI on reviewed head `b027404`, merge the focused improvement and verify remote main ancestry. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44297435642)
- [x] Complete inequality app integration separately through [PR 145](https://github.com/coder13/sudoku-app/pull/145). The exact-search repair preserves its honest 98-point logical stall.

### Non-Consecutive integration merged

This stage reached main at `8439f6d` through [PR 112](https://github.com/coder13/sudoku-app/pull/112). The reviewed worktree remains available on `codex/sudoku-nonconsecutive-integration`. [Non-Consecutive issue](https://github.com/coder13/sudoku-app/issues/44)

- [x] Verify Philip Newman's published Literally No One puzzle and completion against the rendered PDFs. Independently prove its 21-given puzzle is unique with the rule and has multiple completions without it.
- [x] Add explicit exempt edges to the native Non-Consecutive rule. Preserve omitted-field JSON, the eight-point technique and ordinary rule behavior. Check candidates, positive dots, malformed geometry, all grid symmetries and wire roundtrips with five public-API tests.
- [x] Preserve real Coach exports for a 9 × 9 Nonconsecutive/white-dot puzzle and an unsupported 6 × 6 puzzle. Inspect the source compiler's difference-marker exceptions.
- [x] Add complete app import, rule descriptions, candidate cleanup, conflict feedback and specific explanations, including mixed white-dot exceptions and every grid symmetry.
- [x] Verify shared/save data, help, Finder, proof paging, solution replay, practice and rendered mobile/desktop components. Preserve all 2,048 family selections: 1,536 compatible fixed-clue samples pass and 512 samples with knight conflicts reject. These counts do not establish general feasibility of family combinations.
- [x] Pass 258 native tests including doctests, 379 app tests, 227 Wasm tests, TypeScript, the production/offline build, all 16 native capability combinations, four Wasm profiles and strict full/reduced Cargo documentation.
- [x] Verify three independently counted 30-given generated puzzles that need Non-Consecutive, plus a mixed white-dot template that retains all exceptions.
- [x] Measure candidates, validation, solving, rating, ordinary/exhaustive hints and generation. Preserve retained responses and complete nested proofs on eleven fixtures against main. The published puzzle rates at 0.345/0.431 ms; the two-given Coach path remains stalled at 2,516.019/2,526.339 ms. [Methods and limits](tests/fixtures/README.md#non-consecutive-sources-and-app-coverage)
- [x] Add Non-Consecutive locked and multi-candidate deductions, with typed proofs, scoring version 7, twelve practice puzzles and app explanations. The follow-up below solves the two-given Coach puzzle without seeding removals. [Implementation and evidence](https://github.com/coder13/sudoku-app/issues/111)
- [x] Pass CI's native release suite, feature matrix, four Wasm profiles, app/Wasm contracts, strict Cargo documentation and deployment checks; merge the app-ready variant in [PR 112](https://github.com/coder13/sudoku-app/pull/112).
- [ ] Review live viewport behavior and calibrate generation recipes before offering Non-Consecutive in New puzzle.

### Non-Consecutive deduction and training follow-up

This pass reached main at `6c30514` through [PR 115](https://github.com/coder13/sudoku-app/pull/115), after the lesson/hint rewrite in main `da339cf` ([PR 99](https://github.com/coder13/sudoku-app/pull/99)). All CI and deployment checks passed on reviewed head `4b10aef`. [Deduction and training issue](https://github.com/coder13/sudoku-app/issues/111)

- [x] Implement two-cell and three-cell house locks, bivalue and trivalue neighbors using the existing binary relation tables, explicit exceptions and all declared houses.
- [x] Add typed exhaustive-alternative proofs, rule and house provenance, and independent case replay. Cover positive moves, missing edges, extra candidates, digit boundaries, Jigsaw and extra houses. Reproduce the six researched removals at the archived Coach stall.
- [x] Add twelve distinct practice puzzles and verify their answers, uniqueness and complete calibration paths. Bill once per deduction at 20, 24, 22 and 24 points; advance variant scoring to version 7 while preserving older costs.
- [x] Finish app lesson, hint, practice, Finder, paging, history and disabled-profile contracts. Verify all twelve exercises independently, fresh practice generation, four 30-given puzzles with the selected first technique, the complete unseeded Coach solve and the retained 62-step custom-profile stall. Compare 2,052 retained responses across fourteen positions, including all 107 prior detector outputs and every hint page.
- [x] Measure paired complete ratings, hints, memory, all profile sizes and retained proofs. Consecudoku app rating changes from a stalled 1,058.396/1,412.850 ms to a complete 1.067/1.600 ms path. Opening hints remain about 680 ms for four choices; app Wasm is 9,539 gzip bytes smaller. [Methods and limits](tests/fixtures/README.md#non-consecutive-locks-and-candidate-alternatives)
- [x] Pass local native/app/Wasm/build, feature/profile and strict Cargo documentation gates. The eleven new native cases include every candidate mask at five edge/interior cells for both cell techniques, both diagonals, Jigsaw and extra houses. Require CI on the reviewed PR head before the separate merge.

### German Whispers integration merged

This pass reached main at `4dfeda0` through [PR 121](https://github.com/coder13/sudoku-app/pull/121). All CI and deployment checks passed on reviewed head `4e95cf3`. The reviewed worktree remains on `codex/sudoku-whispers-integration`. [Whispers issue](https://github.com/coder13/sudoku-app/issues/50)

- [x] Verify Philip Newman's three-given Brain Zaps puzzle and completion from the rendered publication PDFs. Confirm unique exact solving and the previous logical profile's stall after four basic line deductions.
- [x] Prototype line assignments with explicit shared-house exclusions. Independently solve the published puzzle using only these assignments and singles.
- [x] Add the 39-point Medium line/house technique, typed support evidence, 24,528 independent domain comparisons, exhausted-budget checks and three unique practice puzzles. Advance variant scoring to version 8; preserve all older costs.
- [x] Finish Coach/native import for minimum differences 1–8, including closed and revisited walks. Preserve every link while assigning each distinct cell once. Verify visible geometry, accessibility, candidates, conflicts, history and all eight grid symmetries; retain unsupported companion clues in real exports for interchange follow-up.
- [x] Verify preview services/shared grid rendering, desktop/mobile components, hints, every page, Finder, complete published walkthrough, fixed/fresh practice, saved games and sharing. Check all 4,096 selections of the twelve prior families: 3,072 fixed-clue samples solve and 1,024 reject known knight conflicts. Independently verify three generated 30-given puzzles that need Whispers.
- [x] Measure candidates, validation, solving, rating, ordinary/exhaustive hints, generation and all package profiles. Brain Zaps app rating changes from a stalled 24,367.310/34,962.469 ms to a complete 0.886/1.560 ms path. Opening choices increase from four to eight; exhaustive scans and slower retained Quadruple samples remain performance follow-ups. Box the rare payload to keep shared evidence compact. [Methods and limits](tests/fixtures/README.md#whispers-lines-shared-houses-and-app-integration)
- [x] Pass 291 native tests including doctests, 396 app tests, 242 Wasm tests, TypeScript, sixteen native feature combinations, four Wasm profiles, strict full/reduced Cargo documentation and the production/offline build with 159 rendered routes.
- [x] Pass CI on reviewed head `4e95cf3` and merge the app-ready family separately through [PR 121](https://github.com/coder13/sudoku-app/pull/121). Verify the reviewed head and merge commit on remote main. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44238999616)
- [x] Measure earlier bounded uniqueness eligibility in [issue 122](https://github.com/coder13/sudoku-app/issues/122). Preserve complete proof lists and ratings while avoiding searches whose existing uniqueness precondition fails.

### Bounded uniqueness search performance merged

This pass reached main at `1a62a7c` through [PR 124](https://github.com/coder13/sudoku-app/pull/124). All CI and deployment checks passed on reviewed head `3e60cc8`. The reviewed worktree remains on `codex/sudoku-uniqueness-pruning`. [Measured search issue](https://github.com/coder13/sudoku-app/issues/122)

- [x] Profile empty Unique Rectangle chain searches on Brain Zaps and identify the existing late uniqueness precondition.
- [x] Move the cached 4,096-node check before expensive rectangle-chain searches. Keep empty cheap searches lazy, candidate removals outside uniqueness analysis and the swap-scope filter intact.
- [x] Pass focused native checks for positive uniqueness exercises, ambiguous geometric support, candidate restrictions and an exhausted probe on a genuinely unique puzzle.
- [x] Match 2,996 complete responses across sixteen corpus positions, all 117 detectors and all 351 positive practice positions. Preserve full proofs, ratings, custom orders, every hint page, catalogs and scoring version 8.
- [x] Measure paired ordinary/exhaustive hints, retained fixtures, committed Wasm memory and every package profile. Brain Zaps ordinary hints improve 660.803/678.451 → 486.085/514.869 ms, with eight choices unchanged. Empty cheap requests stay lazy. App Wasm adds 162 gzip bytes. [Methods and limits](tests/fixtures/README.md#earlier-bounded-uniqueness-eligibility)
- [x] Pass 295 native tests including doctests, 396 app tests, 243 Wasm tests, sixteen capability combinations, four Wasm profiles, strict full/reduced Cargo documentation, TypeScript and the 159-route production/offline build.
- [x] Pass CI on reviewed head `3e60cc8`, merge the focused optimization through [PR 124](https://github.com/coder13/sudoku-app/pull/124) and verify the reviewed head on remote main. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44244011999)
- [x] Investigate geometric completion witnesses for the remaining nested searches in [issue 125](https://github.com/coder13/sudoku-app/issues/125). Keep the detector's premises, numeric variant validation and uniqueness certificates separate.

### Shared geometric witnesses merged

This pass reached main at `d9e4ee9` through [PR 128](https://github.com/coder13/sudoku-app/pull/128), including PR 127's app integration. All CI and deployment checks passed on reviewed head `bc1a01f`. The reviewed worktree remains on `codex/sudoku-geometric-witnesses`. [Witness research issue](https://github.com/coder13/sudoku-app/issues/125)

- [x] Profile the remaining empty nested search and verify the full variant probe's budget limit. Check geometric completions independently against houses, placements and candidate masks.
- [x] Reuse cached partial Pattern Overlay witnesses for individual nested assumptions. Keep unknown assumptions active, existing probe budgets intact and uniqueness validation separate.
- [x] Pass 179 native unit tests, including independent positive/negative witness truth, exhausted budgets, edited-cache invalidation, partial coverage and all twelve AI Escargot nested proofs.
- [x] Match 3,419 complete responses across nineteen corpus positions, all 117 detectors and all 351 positive practice positions. Preserve every proof, rating, page and profile. Verify candidate/placement edits and puzzle alternation through the actual Wasm worker, including all twelve, eleven and fifty-three nested proofs at the three AI Escargot states.
- [x] Measure paired ordinary/exhaustive hints, selected techniques, retained fixtures, memory and every package profile. Keep eight Whispers choices and 31 Quadruple choices. App Wasm saves 2,980 gzip bytes. Record the large Whispers timing tails and slower native-rating samples. [Methods and limits](tests/fixtures/README.md#shared-partial-geometric-witnesses)
- [x] Pass 298 native tests including doctests, 397 app tests, 245 Wasm tests, sixteen capability combinations, four Wasm profiles, strict full/reduced Cargo documentation, TypeScript and the 159-route production/offline build. Recheck app integration with main's puzzle-switching changes from [PR 127](https://github.com/coder13/sudoku-app/pull/127).
- [x] Pass CI on reviewed head `bc1a01f`, merge through [PR 128](https://github.com/coder13/sudoku-app/pull/128) and verify the reviewed optimization and PR 127 app work on remote main. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44254728829)
- [x] Evaluate checked grid/digit symmetries for bounded candidate support in [issue 129](https://github.com/coder13/sudoku-app/issues/129). Check every transformed grid against the current masks, placements and actual geometric premises before accepting support. [Implementation and validation](#checked-geometric-symmetries-merged)

### Mask-constrained digit witnesses merged

This pass reached main at `799ba1e` through [PR 137](https://github.com/coder13/sudoku-app/pull/137). All CI and deployment checks passed on reviewed head `336cc49`. The reviewed worktree remains on `codex/sudoku-matched-witnesses`. [Rating bottleneck](https://github.com/coder13/sudoku-app/issues/134)

- [x] Profile all 112 app techniques at nineteen positions of the published Coach trace. Preserve the positive Firework AIC and ALS AIC proofs.
- [x] Add bounded bijective digit matchings that obey every candidate mask. Preserve actual houses, directed peers, fixed digits and the original search for unknown support.
- [x] Compare every three-digit domain matrix with independently enumerated bijections. Test a nine-digit displacement cycle, independent swaps, forbidden candidates and exhausted budgets. Pass 310 native and 413 app tests.
- [x] Compare 6,210 complete responses across forty positions, including every Palindrome/Whispers trace position. Preserve all 117 detector lists, hint pages and 351 positive practice cases.
- [x] Pass 310 native tests, 413 app tests, 253 Wasm tests, sixteen capability combinations, four package profiles, strict full/reduced documentation, TypeScript and the 159-route production/offline build.
- [x] Measure nine fixtures with complete response checks. Reduce the Coach app-order median from 413.446 to 229.884 ms. Preserve scores, choices and memory. Record slower samples and the 5,013-byte app gzip increase. [Methods and limits](tests/fixtures/README.md#mask-constrained-digit-witnesses)
- [x] Pass CI on reviewed head `336cc49`, merge through [PR 137](https://github.com/coder13/sudoku-app/pull/137) and confirm its ancestry on remote main. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44279709034)
- [x] Independently enumerate all 5,832 recognized Tridagon geometries and identify a direct guardian bound. Keep this research separate from the shipped matching change.
- [x] Improve the Tridagon searches with independently proved direct eligibility and deferred forcing proof data in [PR 141](https://github.com/coder13/sudoku-app/pull/141).

### Tridagon eligibility and proof allocation merged

This pass reached main at `2a327ad` through [PR 141](https://github.com/coder13/sudoku-app/pull/141). All CI and deployment checks passed on reviewed head `e83d707`. The reviewed worktree remains on `codex/sudoku-tridagon-eligibility`. [Tridagon performance issue](https://github.com/coder13/sudoku-app/issues/138)

- [x] Prove the direct conflict bound across all 5,832 recognized geometries and every target cell and digit. Compare bounded and unbounded complete proofs after candidate edits.
- [x] Skip direct patterns with more than nine guardians. Enumerate forcing guardians lazily while preserving original branch order, contradictory cases and the existing refutation bound.
- [x] Compare 6,210 complete variant responses across forty corpus positions and 351 positive practice examples. Add 148 Classic responses across nine Tridagon positions, including traces, counts and every hint page.
- [x] Pass 313 native tests, 413 app tests, 253 Wasm tests, sixteen capability combinations, four package profiles, strict full/reduced documentation, TypeScript and the 159-route production/offline build. Verify the final artifact against the complete response comparison.
- [x] Measure nine fixtures and selected final-position searches. Reduce the Coach rating median from 228.995 to 102.495 ms and Newman's exhaustive page from 301.930 to 208.677 ms. Preserve choices and memory. Record the app savings, larger Solver/Classic packages and slower samples. [Methods and limits](tests/fixtures/README.md#tridagon-eligibility-and-deferred-proof-data)
- [x] Pass CI on reviewed head `e83d707`, merge through [PR 141](https://github.com/coder13/sudoku-app/pull/141) and confirm its ancestry on remote main. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44286031509)
- [ ] Continue the remaining latency and package-size audit in [issue 88](https://github.com/coder13/sudoku-app/issues/88). Keep the larger Solver and Classic profiles visible alongside the smaller app package.

### Checked geometric symmetries merged

This pass reached main at `0c15503` through [PR 131](https://github.com/coder13/sudoku-app/pull/131), including PR 132's hint-card changes. All CI and deployment checks passed on reviewed head `d5bbf9f`. The reviewed worktree remains on `codex/sudoku-symmetric-witnesses`. [Symmetry research issue](https://github.com/coder13/sudoku-app/issues/129)

- [x] Reuse the existing eight grid transformations. Infer a bijective digit mapping from every fixed domain and reject both mapping conflicts.
- [x] Validate transformed grids against actual houses and directed peer exclusions. Check every final digit cycle against all candidate masks. Keep the cache local to one proof position and preserve numeric-rule and uniqueness checks.
- [x] Bound nonidentity transformations to 64 attempts per support query, independently of the existing 4,096 exact nodes and 128 nodes per probe. Preserve original seed support when the transform budget expires.
- [x] Pass independent fixed-domain, forbidden-candidate, extra-house, directed-peer and irregular-Jigsaw tests. Preserve partial support and all complete AI Escargot proofs after edits.
- [x] Match 3,419 complete responses across nineteen corpus positions, all 117 detectors and all 351 positive practice positions against current main. Preserve every page, rating, trace and custom profile.
- [x] Measure paired latency, memory and all Wasm profile sizes. Whispers keeps eight choices while its ordinary median falls from 472.566 to 5.949 ms. Record slower retained samples, concurrent research workers and the 255-byte app gzip increase. [Methods and limits](tests/fixtures/README.md#checked-geometric-symmetries)
- [x] Pass 302 native tests including doctests, 397 app tests, 246 Wasm tests, sixteen capability combinations, four Wasm profiles, strict full/reduced Cargo documentation, TypeScript and the 159-route production/offline build. Repeat TypeScript, app/Wasm and production checks after integrating [PR 132](https://github.com/coder13/sudoku-app/pull/132). The measured Wasm hash remains unchanged.
- [x] Pass CI on reviewed head `d5bbf9f`, merge through [PR 131](https://github.com/coder13/sudoku-app/pull/131) and verify the reviewed optimization and PR 132 app changes on remote main. [CI run](https://github.com/coder13/sudoku-app/actions/runs/44264333333)

### Complete candidate-support performance merged

This pass reached main at `28f3f6d` through [PR 118](https://github.com/coder13/sudoku-app/pull/118), with all CI and deployment checks passing on reviewed head `8421b3b`. The reviewed worktree remains on `codex/sudoku-candidate-support-pruning`. [Measured search issue](https://github.com/coder13/sudoku-app/issues/117)

- [x] Reuse bounded geometric completion coverage before expensive Classic detector searches. Cache certificates per position and retain the original search for incomplete or exhausted coverage. Keep computational scheduling independent of human technique costs.
- [x] Preserve singleton placements and uniqueness assumptions. Skip unsafe swap searches only when every recognized swap fails the existing extra-rule filter; keep numeric variant techniques and public capabilities active.
- [x] Check the real four-choice Coach opening, every positive graph/branching practice proof under zero-budget fallback, singleton domains, true/false assumptions, Jigsaw topology, independent position instances, and cache invalidation after candidates and placements change.
- [x] Match 2,712 complete responses against main across fourteen corpus positions and all 348 positive training positions. Include every one of the 116 catalog detector IDs, complete traces and ratings, disabled/custom profiles, and every hint page; preserve catalogs and scoring without normalization.
- [x] Measure paired latency, first requests on fresh instances, memory and all profile sizes. Preserve the four Coach choices while ordinary hints change from 1,300.655/2,148.838 to 1.122/2.620 ms under host contention; committed memory falls from 6.56 to 1.50 MiB. Report the 10,046-byte variant-solver gzip increase alongside the 589-byte app saving. [Methods and limits](tests/fixtures/README.md#complete-candidate-support-pruning)
- [x] Pass 284 native tests including doctests, 382 app tests, 233 Wasm tests, TypeScript, all sixteen feature combinations, four Wasm profiles, strict full/reduced Cargo documentation and the production/offline build with 158 rendered routes.
- [x] Pass the native release suite, feature matrix, Wasm/app contracts, strict Cargo documentation and deployment checks on reviewed head `8421b3b`; merge separately through [PR 118](https://github.com/coder13/sudoku-app/pull/118). [CI run](https://github.com/coder13/sudoku-app/actions/runs/44219466261)

### Pattern Overlay support performance merged

This pass reached main at `36add07` through [PR 114](https://github.com/coder13/sudoku-app/pull/114), with all CI and deployment checks passing on reviewed head `8b3c5fb`. The reviewed worktree remains on `codex/sudoku-pattern-overlay-pruning`. [Measured search issue](https://github.com/coder13/sudoku-app/issues/113)

- [x] Profile Consecudoku's empty expert searches and retain all per-technique proof lists. Five-digit and four-digit Pattern Overlay cost 750.684 and 293.104 ms median while finding no deductions.
- [x] Prototype bounded completion witnesses for the detector's masks, houses and equal-digit exclusions, with checked digit permutations. Seed exact support and retain the original search when witnesses are incomplete. Share the masked-completion primitive with the existing forcing probes; keep new code gated by `variants`.
- [x] Compare all 107 per-technique proof lists on the measured fixture. Prototype five-digit and four-digit scans fall to 0.577 and 0.569 ms with identical proofs. Existing independent replay checks pass all five overlay sizes, Jigsaw, extra houses and knight exclusions.
- [x] Add independent mask, renaming, topology, exhausted-budget, fallback and cache-edit coverage. Match exhaustive assignments on a small ambiguous grid with extra houses and excluded pairs; check a valid Jigsaw Latin grid that violates standard boxes. Pass the shared forcing-probe tests and all 265 native tests including doctests.
- [x] Compare retained APIs, full app traces, shared forcing proofs, all five overlay proof lists and every hint page across the Classic/variant corpus. Compare all 107 detector outputs on Consecudoku separately. Measure paired latency, memory and all profile sizes. [Methods and limits](tests/fixtures/README.md#pattern-overlay-support-performance)
- [x] Pass local native/app/Wasm/build, capability-matrix, Wasm-profile and Cargo documentation gates. Require successful CI on the reviewed PR head before the separate main-branch merge.

### Quadruple integration merged

This stage reached main at `fc4142f` through [PR 104](https://github.com/coder13/sudoku-app/pull/104). The reviewed worktree remains available on `codex/sudoku-quadruple-integration`. [Quadruple issue](https://github.com/coder13/sudoku-app/issues/37)

- [x] Port one-to-four printed digit occurrences, exact validation, candidate restrictions, logical proofs, circle-to-house locks, symmetry, and derived clue generation.
- [x] Verify Clover's five-given puzzle with an independent counter and store real Coach exports, including a repeated-digit circle with Diagonal and Killer rules.
- [x] Test Quadruple with every subset of the eight existing rendered families through the app's Wasm import service.
- [x] Add accessible circle labels, a Quadruple lesson, and three practice positions. Verify desktop preview, Play, hint text, move history, reload, and a checked practice removal.
- [x] Verify the actual mobile panel's complete clue geometry and labels, shared starting definition, and completion action through rendered components. Reserve space for Killer totals beside a circle and paint circles above cage edges in either rule order. Live mobile viewport review remains a separate follow-up after the interrupted browser session.
- [x] Pass the full optimized native suite (248 tests including doctests), Wasm suite (208 tests), app suite (344 tests), strict full/reduced Cargo documentation, TypeScript check, and production build. Local checks and CI verified the combined tree with main's Colors panel at `5484421` before merging as `fc4142f`.
- [x] Check all 16 native feature combinations and pass the capability/omitted-operation contracts for each Wasm API combination.
- [x] Pass the four Wasm build-profile checks and preserve the main-branch hint paging, scan cancellation, position validation, and batched singles behavior.
- [x] Use a bounded completion witness to prune variant Nested Forcing Net assumptions. Preserve every per-technique proof on the Quadruple fixture and all twelve AI Escargot nested proofs. Keep the original search when the 512-node probe finds no completion.
- [x] Record the paired performance baseline on the final integration artifact. Retained responses match on seven legacy fixtures; the witness comparison also checks Quadruple. Exhaustive app hints fall from about 2.51 s to 1.61 s with the same proofs. The added app Wasm costs 20.3 KiB gzip. [Method, timings, and limits](tests/fixtures/README.md#profiling-exhaustive-variant-hints)
- [x] Merge the complete app flow in [PR 104](https://github.com/coder13/sudoku-app/pull/104).
- [ ] Calibrate difficulty recipes before offering Quadruple in New puzzle. Native generation is available; app presets remain unavailable.
- [ ] Review Quadruple in a live mobile viewport when browser tooling is available. Rendered component coverage does not establish live viewport fidelity.

### Odd/Even integration merged

This stage reached main at `e43ae23` through [PR 106](https://github.com/coder13/sudoku-app/pull/106). The reviewed worktree remains available on `codex/sudoku-parity-integration`. [Odd/Even issue](https://github.com/coder13/sudoku-app/issues/41)

- [x] Reuse the existing native parity rules, deductions, practice fixtures and derived generation without changing the engine or scoring version. The rebuilt app Wasm is byte-for-byte identical.
- [x] Verify Thomas Snyder's published Big Eight puzzle, its 16 givens and 23 markers against the puzzle and solution PDFs. Prove uniqueness and marker dependency with a separate counter.
- [x] Decode Coach's odd/even single-cell segments, retain their order in grouped native rules, and reject unknown semantics. Keep the official 3 × 3 rule illustrations as source fixtures; test their unchanged constraint payloads in a 9 × 9 envelope.
- [x] Draw odd circles and even squares below other clues in desktop/mobile grids. Add cell labels, specific hint explanations, and marker guidance to the existing lesson and practice exercises.
- [x] Check candidates, conflicts, rule-cache isolation, disabled deductions, multiple hints, paged proofs, Technique Finder counts, full solution replay, sharing, save/reload, history and the completion chooser. Add parity to all 512 subsets of the nine previously rendered families.
- [x] Measure candidates, verification, solving, rating, ordinary and exhaustive hints, and native generation. Match 20/20 generation seeds; independently check givens, marker counts and required-rule dependency on three generated puzzles. [Evidence and timing limits](tests/fixtures/README.md#oddeven-sources-and-app-coverage)
- [x] Pass 352 app tests, 214 Wasm tests, TypeScript, the production/offline build and the generated lesson page checks.
- [x] Pass CI's native suite, all 16 feature combinations, four Wasm profiles, app/Wasm suites and strict Cargo documentation; merge the complete app integration in [PR 106](https://github.com/coder13/sudoku-app/pull/106).
- [ ] Review the live desktop/mobile player flow when browser tooling is available. Rendered component and production-page checks cover the available automated paths.
- [ ] Calibrate difficulty recipes before offering Odd/Even in New puzzle. Native generation is available; app presets remain unavailable.

### Exhaustive variant hint performance

This performance pass is isolated on `codex/sudoku-nested-witness-pruning` from main at `e43ae23`. [Performance audit](https://github.com/coder13/sudoku-app/issues/88)

- [x] Profile the published Odd/Even fixture by technique and identify the repeated Nested Forcing Net work.
- [x] Bound additional Classic completion probes and cache the assumptions each completion satisfies. Keep the original contradiction search for unfinished probes and require the same logical evidence for every hint.
- [x] Compare complete per-technique proofs on Quadruple and Odd/Even, all twelve AI Escargot nested proofs, and retained API results plus complete nested proofs on nine fixtures. Record paired exhaustive scans with unchanged scoring version and technique order.
- [x] Pass 253 Rust tests, 352 app tests, 214 Wasm tests, all 16 feature combinations, four Wasm profiles, strict Cargo docs, TypeScript and the production/offline build. Compile the extra probe implementation only with `variants`.
- [x] Reduce paired exhaustive median scans from 1,596.603 to 857.367 ms for Quadruple and 330.498 to 66.237 ms for Odd/Even. Preserve all 107 app-order per-technique outputs on both fixtures; add 1,543 app gzip bytes. [Method and limits](tests/fixtures/README.md#additional-completion-witnesses)
- [x] Pass CI and merge the measured improvement in [PR 107](https://github.com/coder13/sudoku-app/pull/107), main at `4811a05`.

### Anti-King integration merged

This stage reached main at `3e0bfec` through [PR 108](https://github.com/coder13/sudoku-app/pull/108). The reviewed worktree remains available on `codex/sudoku-anti-king-integration`. [Anti-King issue](https://github.com/coder13/sudoku-app/issues/43)

- [x] Reuse the existing native corner restrictions, eight-point deduction, practice positions and generation API without changing engine rules or scoring.
- [x] Verify Philip Newman's published King of Diamonds puzzle and completion against the PDFs. Confirm uniqueness and rule dependency with a separate counter.
- [x] Decode Coach's global `antiKing` rule, reject unsupported scopes/settings and retain it through native sharing and saved games.
- [x] Apply corner peers to conflict highlighting, related cells, both kinds of candidate mark, and undo/redo. Check every pair of grid coordinates, including row boundaries and corners across boxes.
- [x] Explain Anti-King hints with actual neighbor addresses and ruled-out digits. Check practice moves, multiple hints, proof paging, Finder counts, complete logical Play and solution walkthroughs.
- [x] Check all 1,024 selections of the ten previous rendered families. Preserve all source rules; 768 compatible fixed-clue samples import and solve, while 256 samples with conflicting knight givens reject correctly. Keep the fixtures and direct completion checks independent of engine search.
- [x] Pass 361 app tests, 220 Wasm tests, TypeScript and the production/offline build against merged main. Verify the rebuilt Wasm is byte-for-byte identical to main's engine.
- [x] Measure candidate updates, validation, exact solving, rating, ordinary/exhaustive hints and generation. Match 20/20 seeds with 30 givens and required Anti-King. [Evidence and timing limits](tests/fixtures/README.md#anti-king-sources-and-app-coverage)
- [x] Pass CI's native release suite, feature matrix, four Wasm profiles, app/Wasm contracts, strict Cargo documentation and deployment checks; merge the complete app flow in [PR 108](https://github.com/coder13/sudoku-app/pull/108).
- [ ] Review the live desktop/mobile player flow when browser tooling is available. Rendered components cover grid labels, corner feedback, sharing, completion and accessible help controls.
- [ ] Calibrate difficulty recipes before offering Anti-King in New puzzle. Native generation is available; app presets remain unavailable.

### Consistent cell references in hints and solutions

This repair reached main at `cda93a3` through [PR 110](https://github.com/coder13/sudoku-app/pull/110). The reviewed worktree remains available on `codex/sudoku-proof-cell-references`. [Display issue](https://github.com/coder13/sudoku-app/issues/109)

- [x] Apply Concise, Verbose and Automatic to complete Classic and variant explanations, reason steps, forcing traces, solution lists and the solution chain inspector. Use each technique's difficulty for Automatic.
- [x] Preserve typed variant deduction and puzzle context for display formatting without scanning again or rewriting arbitrary prose. Keep existing lesson defaults and legacy opaque text.
- [x] Check all 224 shipped diagram/practice proofs for unchanged geometry and evidence and the expected naming changes. Cover serialized variant context, rendered hint cards, desktop/mobile solution lists and every chain-inspection point form.
- [x] Pass TypeScript, 368 app tests, 220 Wasm tests and the production/offline build. Verify the Wasm artifact remains byte-for-byte identical to main.
- [x] Pass CI's native release suite, feature matrix, four Wasm profiles, app/Wasm contracts, strict Cargo docs and deployment checks; merge the focused repair in [PR 110](https://github.com/coder13/sudoku-app/pull/110).

## 1. Share a reliable engine contract

- [x] Use one puzzle validation path for ratings, solve traces, hints, and opening analysis. Add a sparse regression case where a logical solve succeeds after exact search reaches its limit.
- [x] Represent a position as givens, placed digits, and established candidate removals. Use it for hints, solve traces, and practice examples.
- [x] Define one catalog for technique IDs, alternate names, costs, difficulty tiers, and which techniques require a unique solution. Make sure that each catalog entry has a detector and practice fixtures.
- [x] Save and load solver configurations by stable technique ID. Preserve enabled techniques and their order across sessions. Include the scoring version in rating exports.
- [x] Expose ratings, logical solve traces, hints, and targeted generation through the browser worker. Test that malformed input cannot reuse cells from the previous request.
- [x] Add independent positive and negative fixtures for each technique. Assert the expected placements, removals, and evidence. Cover both row and column forms where they apply.
- [x] Test the public APIs against the engine requirements. Cover technique order, stalled solves, score boundaries, hint ranking, unique generation, and search limits.
- [x] Measure fixture solve time, exact search time, and generation success rate separately. Include easy puzzles, 17-clue puzzles, and expert puzzles.

Audit complete. Ratings and traces agree on the sparse regression puzzle. The Wasm contract test covers the new client calls. Removing column X-Wings makes the new rule test fail. The fixed benchmark measures rating, exact search, and generation separately.

[HoDoKu solver configuration](https://hodoku.sourceforge.net/en/docs_solv.php) · [HoDoKu regression and exemplar libraries](https://hodoku.sourceforge.net/en/libs.php) · [Tdoku benchmark data](https://github.com/t-dillon/tdoku/blob/master/benchmarks/README.md)

## 2. Expand the technique catalog

- [x] Add naked and hidden triples and quadruples. Add HoDoKu-style locked pairs and locked triples.
- [x] Add XY-Wing, XYZ-Wing, W-Wing, Skyscraper, Two-String Kite, and Empty Rectangle.
- [x] Extend X-Wing support to Swordfish and Jellyfish. Add their finned and Sashimi variants.
- [x] Add simple coloring, 3D Medusa, X-Chains, and XY-Chains.
- [x] Build shared candidate links for Alternating Inference Chains, grouped chains, and loops. A link records how one candidate affects another.
- [x] Add Unique Rectangles and BUG+1. Allow these deductions after the engine proves that the puzzle has one solution.
- [x] Add Pattern Overlay for one through five digits in Classic Sudoku. Find placements and removals from compatible layouts. Verify the published Rule 1 removal of 4 from r2c5 and the Rule 2 removals of 7 from r2c8 and r5c8. Replay three practice positions per size with a separate row search and verify that each multi-digit move needs its full scope. [Worked Pattern Overlay examples](https://www.sudokuwiki.org/Pattern_Overlay)
- [x] Extend Pattern Overlay through five digits to variants. Include Jigsaw regions, extra houses, and rules that forbid equal digits in a pair of cells. Replay the published removal of 7 from r9c5 in Rust and Wasm. Check layout support independently and verify deductions that require a diagonal or Anti-Knight. [Worked Jigsaw example](https://www.sudokuwiki.org/Pattern_Overlay#Jigsaw_multiple_example)
- [x] Use Unique Rectangle links in open chains and both Nice Loop forms. Record every extra candidate in the endpoints and mark all four corners as part of the proof. Replay the published placement in r3c5 and both sets of continuous-loop removals. Give each form three practice positions and verify that variant rules are checked against the full swap scope. [Worked Unique Rectangle chains](https://www.sudokuwiki.org/Using_Unique_Rectangles_as_Links_in_Chains)
- [x] Add WXYZ-Wing, forcing chains, and forcing nets. Record the branches that prove each deduction.
- [x] Add Firework triples and quadruples. Replay candidate removals inside and outside the named cells with independent rank proofs. Verify that an additional outside candidate breaks the pattern and that a digit can still participate after it leaves the intersection. [Published Fireworks examples](https://www.sudokuwiki.org/Fireworks)
- [x] Use Firework strong links in open alternating inference chains. Replay each link against the live candidates, including a five-cell endpoint and a weak link that spans two houses. Add three practice positions and verify scoring and replay in Wasm. [Published Firework chain](https://www.reddit.com/r/sudoku/comments/1dgrgfb/til_fireworkstype_links/) · [Monhard line 2201](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt#L2201)
- [x] Detect Firework W-Wings, including grouped wings and proofs that remove both digits. Replay the published removal of 9 from r1c9 and verify that it needs each of its six base constraints. Test an extra candidate in either wing and a third candidate in a bivalue cell. [Worked Firework W-Wing](https://www.taupierbw.be/SudokuCoach/SC_Firework.shtml)
- [x] Detect Firework L-Wings with a third digit. Replay both orientations of the published deduction using five local constraints. Check near misses with a third candidate in the link and with a Firework digit outside the wings. [Worked Firework L-Wing](https://www.taupierbw.be/SudokuCoach/SC_Firework.shtml)
- [x] Detect Firework ALS-Wings with two Fireworks and one bivalue cell. Replay all 12 published removals using nine local constraints. Check examples with the intersections in the same band or stack and near misses with an extra outside candidate or a third candidate in the bivalue cell. [Worked Firework ALS-Wing](https://www.taupierbw.be/SudokuCoach/SC_Firework.shtml)
- [x] Use Tridagon guardian links in alternating inference chains, including guardian groups, almost locked sets, and Firework links. On Coloin's Mission Impossible, replay the 9 removal from r5c7 in three links and the 7 removal from r4c4 in five. The shortest forcing net for the latter used 14 recorded inference steps. [Published chain](https://www.reddit.com/r/sudoku/comments/1gxr5ml/trivalue_oddagon/)
- [x] Replay a chain that combines a Tridagon and a Firework. The three-link proof removes 3 from r3c9 on depth-three line 1863. [Published collection](https://github.com/denis-berthier/Classifications-of-TE3-Sudokus/blob/main/puzzles.txt#L1863)
- [x] Combine Firework links and almost locked sets in alternating inference chains on positions without a Tridagon. Replay the five-link removal of 8 from r3c7 on Neler12345's grid and a three-link removal of 5 from r7c3 on the grouped Firework W-Wing practice grid. Both removals require an almost locked set in the Firework chain search. [Published puzzle](https://www.reddit.com/r/sudoku/comments/1lyix43/sudoku_puzzle_challenges_thread/) · [Firework links discussion](https://www.reddit.com/r/sudoku/comments/1dgrgfb/til_fireworkstype_links/)
- [x] Extend Tridagon guardian links to groups spanning more than two digits. Depth-three line 9859 uses a group of 3, 5, and 6 in r9c4 to remove 2, 4, and 8 in three links. Line 117661 uses groups across cells and removes 3 from r9c9. Replay the guardian set and every weak link, and verify mixed-group evidence in Wasm. [Depth-three collection](https://github.com/denis-berthier/Classifications-of-TE3-Sudokus)
- [x] Extend expert coverage with ALS-XZ, ALS chains, Sue de Coq, and Death Blossom. An almost locked set (ALS) has one more distinct candidate digit than cells. Its cells share a row, column, or box. ALS-XY-Wing uses three sets. The ALS Chain search covers four to seven sets.
- [x] Add standalone ALS AIC and ALS Continuous and Discontinuous Nice Loops with strong links between two digits of an ALS. Reproduce the removals in the three worked HoDoKu examples and add nine practice positions. The continuous loop removes 15 candidates in the worked example, including eight removals of 8 after the loop locks 8 into the ALS in r6c5 and r6c6. [HoDoKu chain and loop examples](https://hodoku.dev/tech_chains#group-nodes-and-als)
- [x] Add ALS links that force a digit in an outside cell by ruling out several of its alternatives at once. Replay HoDoKu's AIC that forces 6 in r5c3 and the continuous loop on library line 1253. The loop forces 5 in r7c8 under its ALS assumption and locks 6 into the set in both directions. It reproduces all three published removals and also removes 3 from r1c1. Verify both proofs, reject outside cells with an unblocked alternative, and expose the blocked candidates in Wasm. [HoDoKu regression library](https://hodoku.sourceforge.net/libraries/reglib-1.3.txt) · [Worked AIC](https://hodoku.dev/tech_chains#group-nodes-and-als)
- [x] Add Exocet, SK Loop, and Multi-Sector Locked Sets after the engine can represent their evidence. This covers Junior Exocet, eight-arm SK Loops with solved cells allowed in the arms, and Multi-Sector Locked Sets with a rectangular core of up to 20 unsolved cells across two to five rows and columns, plus up to two fully covered attachments.
- [x] Add Senior Exocet with two single-cell targets. Replay examples with both targets on one cross-line and a placed digit contributing to a cover. Add practice positions and a Wasm practice check. [Sudoku Studio examples](https://github.com/kyoyama-kazusa/Sudoku/blob/main/docs/tutorial/exocet/07-senior-exocet.md)
- [x] Extend Senior Exocet to two conjugate-pair targets. Replay the five published removals locally. Test near misses with a third candidate for a linked digit or three houses needed for a cover. Expose both target pairs in the practice proof. [Sudoku Studio example](https://github.com/kyoyama-kazusa/Sudoku/blob/main/docs/tutorial/exocet/07-senior-exocet.md#an-example-using-conjugate-pairs)
- [x] Detect Senior Exocet with one single-cell target and one conjugate pair in either order. Replay both arrangements with local rank proofs and test a naturally occurring opening from Monhard through the rated solve API. [Monhard fixture](crates/engine/benches/fixtures/senior_exocet.rs)
- [x] Add Double Junior Exocet for two base pairs in different boxes of the same band or stack. Verify both published rules and replay removals with either base pair omitted. Add three practice positions and rating coverage. [Double Exocet example](https://www.sudokuwiki.org/Double_Exocet)
- [x] Check whether all four Double Exocet digits can fill the cross-lines simultaneously. Replay the additional removals against independent rank constraints. Retain the per-digit deduction when the joint search reaches its node limit. [Unsolvable 28](https://www.sudokuwiki.org/Weekly-Sudoku.aspx?weeklypuznum=28)
- [x] Support conjugate-pair targets in Double Exocet. Verify one pair, two pairs in one component, and a pair in each component. Replay the removals with each base pair or reservation omitted, and test a third live candidate for the linked digit.
- [x] Extend Double Exocet to partly overlapping pools of five, six, or seven distinct base digits. Replay the removals and verify a deduction at each width that needs both base pairs and an extra digit.

Audit complete. Multi-Sector Locked Sets reuse cover bounds across equivalent rectangles. Hint and opening validation use a short exact search before expensive detectors and retain the full logical fallback. Before-and-after comparisons matched traces, hints, and openings for 17 boards and deductions for all 57 practice examples. AI Escargot still stalls at 200 points. Rating time fell from about 8.0 ms to 5.7 ms in the native benchmark.

[Sudoku Coach practice catalog](https://sudoku.coach/en/practice) · [HoDoKu technique catalog](https://hodoku.sourceforge.net/en/techniques.php) · [YZF expert techniques](https://github.com/YZF-Sudoku/yzf-sudoku-web/blob/main/techniques.md)

## 3. Explain and practice deductions

- [x] Add a search across the selected techniques for one position. Return alternate proofs with their affected cells and candidates.
- [x] Test ranked hints with competing proofs and tied costs. Assert at most ten distinct moves and an empty list when fewer than two moves exist.
- [x] Offer three hint levels. Reveal the technique, then the cells or candidates to inspect, then the full deduction.
- [x] Replay a solve trace to any step. Return the position before the deduction, the evidence, and the position after it.
- [x] Open practice puzzles at the position just before the requested technique. Include all established candidate removals in that position.
- [x] Compare a submitted practice move with a proof for the target technique. Accept valid alternatives that use the same technique.

Audit complete. Native hint choices retain the two-move minimum. The worker tests cover adjustable limits, staged hints, and replay. Practice checking uses the same technique detectors as solving, including alternate proofs and actions in deductions that remove several candidates. Finned fish previews now include the fin’s box in deduction search, staged hints, and replay.

[HoDoKu finding all steps](https://hodoku.sourceforge.net/en/docs_fas.php) · [HoDoKu hints and practice modes](https://hodoku.sourceforge.net/en/docs_play.php) · [HoDoKu working with solutions](https://hodoku.sourceforge.net/en/docs_sol.php) · [Sudoku Coach practice](https://sudoku.coach/en/practice)

## 4. Target and batch-generate puzzles

- [x] Combine difficulty or score, clue count or range, and a technique target in one generation request. Rate the result with the requested solver configuration.
- [x] Support a technique anywhere in the solve path, first in that path, or as the only applicable opening. Test that a competing proof rejects an exclusive opening.
- [x] Detect incompatible requests such as Full House as the sole opening. A Full House also yields a Naked Single.
- [x] Add a reusable pool of verified sparse and expert templates. Rate each resulting board after it changes.
- [x] Report generation attempts and support cancellation between attempts. Return distinct outcomes for an invalid request, an exhausted search, and a verified match.
- [x] Add batch rating and generation commands. Record the seed, solver configuration, and scoring version with each result.

Audit complete. Native, browser, and batch generation share the attempt logic. Pool requests validate before loading the templates. Batch output records the resolved solver order, and malformed rows leave later records usable. The native benchmark matched 20 of 20 seeds at each count from 17 through 19 clues and 15 of 20 at 20 clues, using a 1,001–1,600 point target and up to 208 attempts per seed.

The batch regression generates a unique 21-clue puzzle with Forcing Net as the first move under its selected profile. It rejects the exclusive opening request because Nested Forcing Net, three- and five-digit Pattern Overlay, and Kraken Fish Type 2 can also make an opening move. [Source template dml50](https://gitlab.com/scilab/forge/sudoku/-/blob/master/collection/hardest.sdm)

[HoDoKu targeted creation](https://hodoku.sourceforge.net/en/docs_cre.php) · [HoDoKu batch commands](https://hodoku.sourceforge.net/en/docs_ref.php) · [Tdoku sparse and expert puzzle sets](https://github.com/t-dillon/tdoku/blob/master/benchmarks/README.md#benchmarked-data-sets)

## 5. Return the easiest hints first

In a local Wasm run, the starter puzzle returned 629 moves in about 32 ms with the full search. It returned the first ten in under 1 ms. [Play hint request](src/components/Worktable.tsx) · [Hint ranking](crates/engine/src/hints.rs)

- [x] Request up to ten ranked moves during play. Offer the full search for analysis.
- [x] Refine the ranking of similarly difficult proofs with factors such as the number of houses or chain length. Keep the number of placements and removals out of the ranking.
- [x] Test that the bounded search returns the first ten distinct moves from the full ranking.

Audit complete. The bounded request matches the full ranking on the starter grid and on a grid with established candidate removals and disabled techniques. A warmed local Wasm run on the starter grid measured a median of 0.072 ms for ten moves and 31.5 ms for all 629 moves, including proof diagrams.

## 6. Measure coverage on expert puzzles

- [x] Build a fixed set of everyday, 17-clue, and expert puzzles. Report logical solve rates and rating times separately for each group.
- [x] Save the position and candidate removals where each solve stalls. Use these positions to choose which detectors to extend.
- [x] Add detectors and practice positions for Franken Fish and Mutant Fish. Test valid deductions and similar patterns that prove none.

Baseline with the default solver order and scoring version 10. The release build timed 25 ratings per grid on one local machine. [Benchmark and fixed grids](crates/engine/benches/coverage.rs)

| Puzzle group | Logically solved | Rating median | Rating p95 |
| --- | ---: | ---: | ---: |
| Everyday | 6/6 | 0.007 ms | 0.009 ms |
| 17-clue | 6/6 | 0.036 ms | 0.045 ms |
| Expert | 3/5 | 5.994 ms | 14.250 ms |

AI Escargot stalled after one deduction. Easter Monster stalled after four, with the same remaining candidates as the end of step 4 in Allan Barker’s solution. His next move removes candidate 1 from r6c7 with a multi-digit rank-zero pattern. Use that position to evaluate a broader rank-zero detector and use AI Escargot to evaluate stronger forcing deductions. Track the complex fish independently against their own exemplars. [Replayable version 10 stalls](crates/engine/benches/fixtures/coverage-stalls-v10.jsonl) · [Allan Barker’s Easter Monster solution](https://sudoku.allanbarker.com/sweb/extra/easter/a_em.htm) · [AI Escargot](https://www.sudokuwiki.org/Escargot)

Audit complete. Both complex fish detectors use two to four houses on each side and account for fins and overlapping houses. They reproduce both practice deductions and reject near-miss removals. They are available to hints and custom solver profiles. [Detector](crates/engine/src/patterns/complex_fish.rs) · [HoDoKu practice sources](https://hodoku.sourceforge.net/libraries/reglib-1.3.txt)

[Tdoku benchmark sets](https://github.com/t-dillon/tdoku/blob/master/benchmarks/README.md#benchmarked-data-sets) · [HoDoKu complex fish](https://hodoku.sourceforge.net/en/tech_fishc.php) · [Inkala’s 2012 grid](https://www.sudokuwiki.org/Arto_Inkala_Sudoku)

### Expert solver research

- [x] Add Dynamic Forcing Net with Pointing and Claiming inside each branch. Replay the full proof and test it through ranked hints and custom solver profiles.
- [x] Add Nested Forcing Net with one level of nesting. Replay both cases of the second assumption and verify all deductions on the published nested forcing puzzles.
- [x] Evaluate Naked Pair, Hidden Pair, and X-Wing inside forcing branches. Replay their premises and compare proof sizes and rating times with the dynamic and nested profiles. [Sudoku Explainer examples](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#using-advanced-techniques-within-the-chains)
- [x] Support mixed cell and house-digit constraints in rank proofs. Scan and replay overlapping sets on Easter Monster through the Rust and Wasm APIs. [Allan Barker’s Easter Monster solution](https://sudoku.allanbarker.com/sweb/extra/easter/a_em.htm)
- [x] Discover compact mixed rank patterns from the active candidates. Compare the automatically found proofs with Barker’s published sets and return multiple ranked removals within a shared budget.
- [x] Compare rank proof effort on held-out expert grids and published explanations. Add a versioned effort estimate and benchmark its use as a fallback from the default solver profile.
- [x] Measure rank discovery on grids that stall with the expanded expert profile. Save puzzles where rank removals add coverage.
- [x] Add an opt-in rank fallback to the logical solve loop. Reuse the validated position across ordinary deductions and rank searches. Record the proof, effort, and budget in the solve trace.
- [x] Use single-digit Templates to narrow the Franken and Mutant Fish search. Compare the full proofs with and without the filter on the published practice positions. [HoDoKu Templates](https://hodoku.sourceforge.net/en/tech_last.php#ts)
- [x] Detect and replay Kraken Fish Types 1 and 2 for fish with two to four houses per side. Verify every branch, including strong links from almost locked sets, on HoDoKu's published positions. [HoDoKu Kraken Fish](https://hodoku.sourceforge.net/en/tech_last.php#kf)
- [x] Add Aligned Pair Exclusion and Aligned Triplet Exclusion. Replay every rejected assignment and verify near misses where one assignment remains possible. [Sudoku Explainer examples](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#aligned-pair-exclusion)
- [x] Add regular Tridagon detection and forcing nets over its extra candidates. Replay both kinds of evidence and solve all 12 recorded depth-three stalls. [Published proofs and examples](https://github.com/denis-berthier/CSP-Rules-Examples#the-tridagons-folder)
- [x] Propagate the requirement that at least one guardian is true inside forcing branches. Replay both the shared-conclusion proofs and the refutations, and solve line 66,643 from the saved position. [Recorded stall](crates/engine/benches/fixtures/te3-tridagon-stalls-v10.jsonl)
- [x] Add Unique Loop Types 1–4 for patterns longer than a rectangle. Replay proofs that use extra candidates, naked and hidden subsets, and conjugate links. Check every cell in the digit swap against active variant rules. [Sudoku Explainer examples](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#unique-rectangles-and-loops)

Append Dynamic Forcing Net with `cargo bench --locked -p sudoku-app-engine --features wasm-api --bench coverage -- --dynamic-forcing`. The default profile takes one step on AI Escargot. The extended profile takes four, then stalls. Easter Monster still stalls after four steps. Both profiles solve three of the five expert grids. The expert rating median rose from 5.77 to 8.23 ms, and the p95 rose from 13.48 to 24.20 ms in this run. Dynamic Forcing Net adds 800 points and is available to custom solving profiles and ranked hints.

Use `--forcing-examples` to compare the profiles on Sudoku Explainer’s published puzzles. The default profile stalls on all six advanced forcing puzzles. The profile with Dynamic Forcing Net solves all six, with a rating median of 153 ms and a p95 of 229 ms. Those two profiles stall on all five nested forcing puzzles. [Published forcing puzzles](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#beyond-forcing-chains) · [Coverage benchmark](crates/engine/benches/coverage.rs)

Pass `--nested-forcing` to append Dynamic and Nested Forcing Nets. This profile solves all five published nested forcing puzzles, AI Escargot, and Easter Monster. Complete ratings for the five nested forcing puzzles take a native median of 256 ms and a p95 of 588 ms. The benchmark compares every deduction with the independently verified solution. Nested Forcing Net starts at 950 points per move. Its proof names the second candidate and records a contradiction for each of its two truth values.

Pass `--forcing-examples --advanced-forcing` to add Naked Pair, Hidden Pair, and X-Wing inside branches at 900 points per Advanced Forcing Net deduction. In a run with 25 timed ratings per grid, Dynamic solved six of the 11 published forcing puzzles. Advanced gave the solver more moves on three of the five stalls and the completion count stayed at six. The median partial rating for the five stalled grids rose from 26 to 46 ms.

Adding Nested completed all 11 grids with either profile. With Advanced before Nested, the five nested examples used 10 split deductions, down from 16. The combined profile produced 7,086 forcing proof facts across those five grids, up from 6,774. This count includes assumptions, deductions, and nested cases. The median rating rose from 250 to 263 ms. On AI Escargot, the three opt-in forcing techniques used 827 proof facts and two split deductions. The Dynamic and Nested profile used 954 facts and five splits. The regression verifies both traces against the exact solution. [Coverage benchmark](crates/engine/benches/coverage.rs)

Advanced Forcing Net returned zero deductions on the 12 recorded depth-three stalls. [Recorded positions](crates/engine/benches/fixtures/te3-stalls-v10.jsonl)

A separate check covered 149 distinct, verified grids from the historical hardest-puzzle collection. The default profile solved 80. The extended profile solved all 149 and matched the exact solution on all 69 additional solves. Use a newer expert corpus to find positions that still stall. [Historical hardest-puzzle collection](https://gitlab.com/scilab/forge/sudoku/-/blob/master/collection/hardest.sdm)

Use `--aligned-examples --aligned-exclusion` to test the six published practice grids with the two aligned exclusions before AIC. On the third triplet example, the new profile takes 66 steps and scores 1,494 points. The default takes 76 steps and scores 3,664 points. Its triplet proof removes 9 from r8c2 by ruling out four assignments. The shortest Forcing Net proof for that move has ten inference steps. The second triplet example also drops from 2,306 to 2,106 points. Median rating time across the three triplet examples increases from 0.57 to 1.38 ms. [Published aligned exclusion puzzles](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#aligned-pair-exclusion) · [Coverage benchmark](crates/engine/benches/coverage.rs)

On Philip Newman’s depth-three collection, the profile with both extended forcing nets solves 12 of 24 sampled grids. Adding the aligned exclusions before AIC leaves the same 12 stalled positions. The sample uses both ends of the file and 22 evenly spaced rows between them. The stall fixture stores the original line numbers, givens, placed digits, removals, and technique order. [Published collection](https://github.com/denis-berthier/Classifications-of-TE3-Sudokus/blob/main/puzzles.txt) · [Recorded stalls](crates/engine/benches/fixtures/te3-stalls-v10.jsonl)

A Tridagon uses three selected cells in each of four boxes. The 12 cells cannot all take one of the same three digits. At least one candidate outside those digits must be true. An exhaustive three-digit assignment check found a Tridagon in each recorded stall. Nine have just one extra candidate, and the exact solution confirms all nine placements. [Tridagon proofs and examples](https://github.com/denis-berthier/CSP-Rules-Examples#the-tridagons-folder)

Use `--depth-three --nested-forcing --tridagon` to benchmark both new techniques on the 12 original puzzles. Without the two techniques, all 12 ratings stall and take a median of 260 ms. With the techniques, all 12 ratings complete with a median of 17.6 ms. From the saved positions, direct Tridagon placements resolve nine stalls. Tridagon Forcing Nets resolve the other three through two or four extra candidates. All 12 resumed paths reach the independently verified solution.

The profile with Tridagon solves all 24 puzzles in the original sample. On 96 evenly spaced rows from the same dataset, it previously solved 95 and stalled on line 66,643 after 33 moves. An independent prototype found seven removals by propagating that Tridagon’s four-guardian rule. The engine now reproduces those removals and finishes the saved position with two Tridagon Forcing Net moves followed by other deductions. It solves all 96 puzzles and all 256 in a broader, evenly spaced sample. The exact solver verifies every deduction and final grid. [Published collection](https://github.com/denis-berthier/Classifications-of-TE3-Sudokus/blob/main/puzzles.txt) · [Recorded stall](crates/engine/benches/fixtures/te3-tridagon-stalls-v10.jsonl)

Adding `unique-loop` to the profile used for the five published long-loop puzzles resolves all five stalls. The loops span 8 to 12 cells. The regression checks every deduction against the exact solution and confirms that a loop must balance its boxes as well as its rows and columns. The three practice positions cover a single cell with extra candidates, a shared extra digit, and a conjugate link. A separate test checks the naked and hidden subset proofs on the conjugate-link example. [Published long-loop puzzles](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#unique-rectangles-and-loops) · [Engine regressions](crates/engine/tests/engine_contract.rs)

On 512 evenly spaced rows from Philip Newman’s depth-three collection, inserting `unique-loop` before AIC in the default order produced deductions on two grids. The exact solver confirmed both paths' deductions. Both profiles completed 12 grids. Across five native ratings per puzzle per profile, the median was about 54 ms and the p95 about 136 ms for both. [Published collection](https://github.com/denis-berthier/Classifications-of-TE3-Sudokus/blob/main/puzzles.txt)

The template search factors the 46,656 possible placements of one digit into three bands. It tests which sets of columns can combine across the bands. Franken Fish and Mutant Fish only search for removals at cells absent from every compatible layout. The proof still uses the original candidates. An independent enumerator checks the template search, and a regression compares full fish proofs on 18 positions derived from six published practice positions.

In two native runs, median fish search on the six published practice positions fell from 16.4 ms to 0.65–0.95 ms. With both fish techniques before Forcing Chain, median rating for the five expert puzzles fell from 13.9 ms to about 6.0 ms. Scores and completion status matched across all 17 standard benchmark puzzles. Use `cargo bench --locked -p sudoku-app-engine --features wasm-api --bench coverage -- --complex-fish` to run the filtered profile. [Coverage benchmark](crates/engine/benches/coverage.rs)

HoDoKu's two Kraken Fish examples use the same position. The engine finds both published removals, r8c7=2 and r5c9=7. The replay tests verify the original fish geometries and every emitted branch. Both targets occur in legal single-digit layouts before chain deductions. The Kraken search first assumes the target is true and follows the implications. It then uses templates to skip fish searches that could still admit the target in Type 1 or still admit any layout for the fish digit in Type 2. The initial Type 2 detector took 447 ms on this position. With conditional templates and cover pruning, a native run took about 1.1 ms. [Type 1 position](https://hodoku.sourceforge.net/en/show_example.php?file=kf101) · [Type 2 position](https://hodoku.sourceforge.net/en/show_example.php?file=kf201)

Append both detectors with `cargo bench --locked -p sudoku-app-engine --features wasm-api --bench coverage -- --kraken`. They completed one of the 11 published forcing puzzles that stalled with the default order. In the historical sample, Type 2 advanced one puzzle and the completion count stayed at 80 of 149. All 12 depth-three samples still stalled, with median rating time rising from 36 to 41 ms. The exact solver verifies the deductions and completed grid in the new regression. [Forcing examples](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#beyond-forcing-chains) · [Historical collection](https://gitlab.com/scilab/forge/sudoku/-/blob/master/collection/hardest.sdm)

The mixed rank checker reproduces Barker’s removal of candidate 1 from r6c7 with 23 bases and 23 covers. A base requires one true candidate. A cover limits its candidates to at most one. Fifteen active candidates belong to more bases than covers. Checking the actual overlaps allows a proof even with these deficits. Dropping the box 6 cover for digit 2 makes r6c7=1 compatible with the weakened pattern. The checker also replays the next removal, candidate 1 from r2c6, using 17 bases and 11 covers. [Published constraints](https://sudoku.allanbarker.com/sweb/extra/easter/a_em.htm) · [Engine regressions](crates/engine/tests/rank_proofs.rs)

Scanning Barker’s pattern visits 1,587 search nodes and returns one removal. In 101 runs through the Wasm request handler in Node.js, the scan took a median of 12.6 ms and a p95 of 13.5 ms, including position validation and serialization.

A Python discovery prototype started with all 236 unsatisfied classic constraints at the first stall. It tried 140 seeded constraint orders, extracted the constraints used by each contradiction, and tested whether it could drop more from the best results. Its smallest pattern had 20 bases and 23 covers. The Wasm checker independently replayed the same removal. The discovered proof had 119 nodes and 14 case splits. Barker’s proof had 67 nodes and eight case splits. Track the branching effort as well as the constraint count when comparing proofs. [Rank proof API](crates/engine/src/rank.rs)

The original branch-first ranking found a 66-constraint certificate for r6c7 with 35 proof nodes and three case splits using a 2,000-node budget. A 20,000-node budget found a 56-constraint certificate with 32 proof nodes and three case splits. Barker’s certificate uses 46 constraints, 67 nodes, and eight case splits. Pass `--rank-discovery` to the coverage benchmark to repeat the budget comparison with the current effort model. [Coverage benchmark](crates/engine/benches/coverage/rank.rs) · [Published constraints](https://sudoku.allanbarker.com/sweb/extra/easter/a_em.htm)

In the Node.js Wasm handler, a 40,000-node position-wide budget with a ceiling of 200 nodes per candidate returned ten distinct removals on each of the 12 recorded depth-three stalls. Every returned proof replayed and agreed with the exact solution. The median across positions was 24.0 ms and the slowest position took 70.0 ms, using the median of three runs per position. Each scan had some inconclusive candidates. [Recorded stalls](crates/engine/benches/fixtures/te3-stalls-v10.jsonl)

Run `cargo bench --locked -p sudoku-app-engine --features wasm-api --bench coverage -- --rank-effort` to compare proof effort on 16 of Barker’s Easter Monster patterns. At a 2,000-node budget, the published proof scored lower on six removals, discovery scored lower on three, and seven tied. Barker’s r2c6 proof scored 147 across 43 active candidates and one additional case. The discovered proof scored 153 across 45 active candidates and one additional case. The weights are an estimate of inspection and reasoning effort. The comparison uses proofs for the same deductions and exact-solution verification. [Published fixtures](crates/engine/benches/fixtures/barker-rank.jsonl) · [Barker’s walkthrough](https://sudoku.allanbarker.com/sweb/extra/easter/a_em.htm) · [Pelánek’s research on puzzle difficulty](https://arxiv.org/abs/1403.7373)

Across the 12 recorded depth-three stalls, ranking the same proof pools by effort reduced total candidate marks in the top ten by 5.7% and constraints by 6.8%. Proof nodes increased by 0.5% and additional cases by 19.9%. Using a rank removal only when the default profile stalled, with up to eight rank removals per grid, solved nine grids in 3.77 seconds total. Branch-first ordering solved seven in 4.28 seconds. The profile with Tridagon and the extended forcing nets solved all 12 from the same positions in 0.43 seconds. Mixed rank discovery is available through its own APIs. [Effort benchmark](crates/engine/benches/coverage/rank_effort.rs)

The reference expert profile, assembled before Senior Exocet was added, solved 505 of 512 evenly spaced grids from Monhard’s 55,088-puzzle collection. Starting from its seven stalls, a rank scan with 40,000 nodes and up to 200 per candidate found a way to resume all seven solves. Each used one to three rank removals. The exact solution verified every deduction and completed grid. Total native time on the seven grids, including their initial named solve, was 304–1,176 ms per grid. Run the coverage benchmark with `--rank-frontier` to replay these cases. [Saved grids and profile](crates/engine/benches/fixtures/monhard_rank_stalls.rs) · [Monhard source collection](https://github.com/denis-berthier/Sudoku-classif/tree/main/Monhard-until-2023-08-15-TE23)

The integrated fallback recovers all seven Monhard stalls and records one trace with named deductions and rank proofs. Its Rust and Wasm options bound the total nodes, the nodes per scan and per candidate, and the number of rank removals. The trace stores named points and per-proof rank effort in their respective units. [Engine API](crates/engine/README.md#logical-solves-with-rank-fallback)

Rank discovery caches the number of available candidates per constraint and updates the counts when an assumption is added or undone. In the native Easter Monster position-wide benchmark, median time fell from 73.6 ms to 21.5 ms and p95 went from 82.7 ms to 22.4 ms. Both runs visited 35,699 nodes with the same 40,000-node budget and 200-node candidate ceiling. Wasm results matched before and after the change for the Easter Monster scan and all seven Monhard solve traces. [Discovery benchmark](crates/engine/benches/coverage/rank.rs)

The first `--senior-exocet-examples` coverage run used three published grids with single-cell targets and one with paired targets. The default profile solved one of the four. Adding `--senior-exocet` before forcing solved two. On the two-pair grid, the profile made two singles and then all five published removals in a single deduction before stalling. The regressions replay the published removals from the local constraints and compare every reported removal with the exact solution. [Sudoku Studio examples](https://github.com/kyoyama-kazusa/Sudoku/blob/main/docs/tutorial/exocet/07-senior-exocet.md)

The two-pair version of Senior Exocet found no deductions from the givens of the 512 sampled Monhard grids or at the seven saved expert stalls. With candidate masks already computed, the median time for a batch of 512 opening scans rose from 36.2 ms to 38.3 ms when two-pair targets were added. Each version ran twice, with 51 batches per run. The second pair of runs reversed the comparison order. [Monhard puzzles](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt) · [Saved expert stalls](crates/engine/benches/fixtures/monhard_rank_stalls.rs)

The mixed-target search found 105 opening proofs on 35 of all 55,088 Monhard grids. All 35 use a conjugate pair that reaches outside the base band or stack. The exact solver verified every removal. After singles, locked candidates, and subsets through size four, the same search found no mixed-target deductions in this corpus. The coverage benchmark now also includes line 23,735. Use `--senior-exocet-examples --senior-exocet-first` to put the mixed deduction before the other opening moves. [Monhard puzzles](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt)

The reference expert profile and the profile with Senior Exocet first each solved all 35 grids with a mixed opening. Putting Senior Exocet first added a median of six steps on those paths. In a separate comparison on 512 opening positions with candidates already computed, adding mixed targets raised the median Senior Exocet scan time from about 78 to 97 microseconds per grid. Both versions ran twice in reverse order, with 51 batches per run. [Reference expert profile](crates/engine/benches/fixtures/monhard_rank_stalls.rs)

On SudokuWiki's Unsolvable 165, the Double Exocet detector finds the 39 removals from the two published rules and two more. Independent local rank proofs replay all 41. For 37 removals, dropping either base pair allows the removed candidate to be true in the weakened proof. The other four can also be proved with a weaker set of premises. [Published rules](https://www.sudokuwiki.org/Double_Exocet)

The `--double-exocet-examples` benchmark includes Unsolvable 165, a second published grid, and Monhard line 11. The default profile stalled on all three. Adding `--double-exocet` before forcing solved all three. Median rating time in one native benchmark run fell from 28.6 ms to 11.7 ms across these three grids. Monhard line 11 also stalled under the reference expert profile. Two hidden singles, one 37-removal Double Exocet, and singles finished that grid. A scan of the 55,088 Monhard givens found no Double Exocet openings. One grid had a Double Exocet after singles, locked candidates, and subsets through size four. A prototype accepting five or more base digits with the same cross-line geometry found no deductions after that prefix. [Monhard puzzles](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt)

The Double Exocet proof uses a separate allocation, keeping a native `Hint` at 208 bytes on this build. The final default-order comparison on 128 evenly spaced Monhard grids averaged 4.55 seconds per batch before the change and 4.56 seconds after it, using two batches per version in reversed order. Both versions stalled on all 128 and reported the same sum of ratings. [Monhard puzzles](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt)

Checking all four digits together raises the Double Exocet removal count from 41 to 84 on Unsolvable 165 and from 40 to 71 on Unsolvable 28. The independent rank search confirms every removal. On 28, it also confirms three removals from the individual Junior Exocets, for a total of 74. The puzzle still needs additional logic after singles with these removals. The profile with Double Exocet enabled solves it, and the grid is part of the coverage benchmark. [Unsolvable 28 discussion](https://www.sudokuwiki.org/Arto_Inkala_Sudoku)

Both Double Exocet versions solved all four coverage grids. The median of four native rating runs was 8.58 ms with per-digit checks and 8.70 ms with joint checks. Each run timed 25 ratings per grid. The runs alternated which version went first. [Coverage benchmark](crates/engine/benches/coverage.rs)

The joint-search prototype accepting five to seven distinct base digits found no deductions from the 55,088 Monhard positions after singles, locked candidates, and subsets through size four. It also found none on 220 published GNPX Exocet grids, checked from their givens, after the same basic moves, and with their published entries. [Monhard puzzles](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt) · [GNPX Exocet sample](https://gidoo-code.github.io/Sudoku_Solver_Generator_v6_jp/page59S.html)

The paired-target Double Exocet tests use three prepared positions. Each has the solution of its published source and two live cells in every target pair. Independent rank proofs verify 27 removals with one pair, eight with both pairs in one component, and five with a pair in each component. Dropping either base pair or any reservation allows each removed candidate in the weakened proof. An exploratory scan found no paired-target proofs on 55,088 Monhard grids from the givens or after basic moves, or on the 220 GNPX examples including their published entries. [Unsolvable 165](https://www.sudokuwiki.org/Double_Exocet) · [Unsolvable 28](https://www.sudokuwiki.org/Weekly-Sudoku.aspx?weeklypuznum=28) · [Double Exocet diagram](https://www.reddit.com/r/sudoku/comments/1uezli6/comment/ots4tt2/)

The wider-pool regressions use prepared positions with five, six, and seven distinct digits. They replay 57, 13, and 38 removals respectively. In each position, at least one removal needs both base pairs and the cross-line requirements for a digit present in only one base pool. Another regression verifies a removal that needs both a fifth base digit and a paired target's reservation. [Monhard line 11](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt#L11)

The original four grids in the Double Exocet benchmark all solved with the extended detector. The median of four native rating runs rounded to 8.55 ms for both versions, with 25 ratings per grid and the order reversed between comparisons. [Coverage benchmark](crates/engine/benches/coverage.rs)

Use `--fireworks-examples` to rate three worked examples and seven exemplars from SudokuWiki. Add `--fireworks` to insert the detector before 3D Medusa. Both profiles solve all ten. The median of four native run medians fell from 0.249 ms to 0.063 ms, with 25 ratings per grid and the testing order reversed between comparisons. Cobra Roll went from 99 steps and 9,966 points to 63 steps and 916 points. One example rose from 1,700 to 1,940 points with this order. [Coverage benchmark](crates/engine/benches/coverage.rs) · [Published Fireworks examples](https://www.sudokuwiki.org/Fireworks)

The detector found 33 opening triples across the 55,088 Monhard grids. An exact solve verified all 388 candidate removals. The scan after singles, locked candidates, and subsets through size four yielded zero Fireworks deductions. [Monhard puzzles](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt)

Use `--firework-aic-examples` to rate the three Firework chain practice grids from their givens. Add `--firework-aic` to try the detector before forcing chains. Both profiles solved two of the three grids. The median of four native run medians was 7.48 ms for each profile, with 25 ratings per grid and alternating which profile ran first. The median of the four 95th-percentile times rose from 15.53 ms to 16.03 ms. The published chain's grid used one Firework chain and went from 66 steps and 2,144 points to 67 steps and 2,264 points. [Coverage benchmark](crates/engine/benches/coverage.rs)

Adding almost locked sets to Firework chains found 617 additional removals on 111 of the first 300 depth-three grids after singles, locked candidates, and subsets through size four. The search also found all 437 removals from the previous detector. The exact solver checked every removal. With `--depth-three --firework-aic`, both detector versions stalled on the benchmark's 12 grids. The mean of two 95th-percentile rating times rose from 165.3 ms to 203.3 ms, with 25 ratings per grid and the build order reversed for the second comparison. [Depth-three collection](https://github.com/denis-berthier/Classifications-of-TE3-Sudokus) · [Coverage benchmark](crates/engine/benches/coverage.rs)

Use `--firework-w-wing-examples` to rate the published grid and two grids carved to teach the grouped and two-removal forms. Add `--firework-w-wing` to try it first. Both profiles solved all three. With 25 ratings per grid and four runs per profile in alternating order, the median of the run medians rose from 0.012 to 0.027 ms, while the median of their 95th-percentile times fell from 0.56 to 0.046 ms. The published grid went from 67 steps and 2,420 points to 56 steps and 540 points. Each generated example added one 320-point step. [Coverage benchmark](crates/engine/benches/coverage.rs)

An exploratory scan found no Firework W-Wing with two non-peer bivalue cells in 460,437 Monhard positions. It checked the givens and every intermediate position reached with singles, locked candidates, and subsets through size four on 55,088 grids. [Monhard puzzles](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt)

Use `--firework-l-als-examples` to rate the two worked grids and four grids carved for different proof layouts. Add `--firework-l-wing --firework-als-wing` to try both techniques first. Both profiles solved all six. The published L-Wing grid went from 65 steps and 2,240 points to 56 steps and 710 points. The published ALS-Wing grid went from 70 steps and 2,078 points to 58 steps and 688 points. The median of four native run medians rose from 0.017 to 0.064 ms for the L-Wing group and from 0.046 to 0.061 ms for the ALS-Wing group. The corresponding median 95th-percentile times fell from 8.62 to 0.080 ms and from 0.67 to 0.10 ms. Each run measured 25 ratings per grid, with the profile order reversed between comparisons. [Coverage benchmark](crates/engine/benches/coverage.rs)

An exploratory scan found neither wing in the first 12,000 Monhard grids from their givens or after singles, locked candidates, and subsets through size four. [Monhard puzzles](https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt)

Use `--tridagon-aic-examples --tridagon` to rate the three guardian-chain practice grids with direct Tridagon deductions and forcing nets. Add `--tridagon-aic` to try the new chains before forcing. Both profiles solved all three puzzles. Across two runs of 25 ratings per grid for each profile, with the order reversed between comparisons, the median stayed near 11.5 ms. The mean of the two 95th-percentile times rose from 32.5 to 98.5 ms. The grouped-guardian grid used five chains and the other two followed their original paths with that order. [Coverage benchmark](crates/engine/benches/coverage.rs)

Profiling found that the grouped-guardian solve path called Multi-Sector Locked Sets ten times with Tridagon chains enabled and four times with them disabled. The cover search now shares exact per-digit covers between rectangles that differ only in columns without that digit. With chains enabled, the mean of two run medians fell from 11.7 to 9.5 ms and the mean of the 95th-percentile times fell from 100.4 to 73.5 ms. The corresponding 95th percentile for `--depth-three` fell from 193.6 to 155.2 ms across 12 grids. Each run measured 25 ratings per grid and the build order was reversed for the second comparison. Before-and-after comparisons matched all 21 puzzle traces and 265 Multi-Sector Locked Sets scans, including proof evidence. [Cover search](crates/engine/src/patterns/multi_sector.rs) · [Coverage benchmark](crates/engine/benches/coverage.rs)

Mixed guardian groups added 169 removals on 48 grids from their givens and 66 removals on 23 grids after singles, locked candidates, and subsets through size four. The scan sampled 2,500 depth-three grids at every 53rd line, starting at line 1. The exact solver checked every removal, and the search retained all previous removals on those grids. The three `--tridagon-aic-examples` grids kept the same scores and step counts with the expanded detector. The mean of two 95th-percentile rating times was 87.7 ms before and 90.0 ms after, with 25 ratings per grid and the build order reversed for the second comparison. [Depth-three collection](https://github.com/denis-berthier/Classifications-of-TE3-Sudokus) · [Coverage benchmark](crates/engine/benches/coverage.rs)

Before adding outside-cell links, the nine `--als-inference-examples` grids solved from their givens at the same scores and step counts with either profile. On the 12 `--depth-three` grids, adding `--als-inference` left all 12 stalled. The partial path for line 75,697 took 20 steps under both profiles and scored 4,944 with ALS inference, down from 5,284. The mean of two 95th-percentile rating times rose from 158.6 ms to 218.2 ms, with 25 ratings per grid and the profile order reversed for the second comparison. [Coverage benchmark](crates/engine/benches/coverage.rs)

The outside-cell search preserved all 40 previously matched action sets in an audit of 49 HoDoKu positions. All 49 now yield ALS deductions, and the exact solver verified every action. The two passes preserve the earlier proofs when a shorter outside-cell link changes the first path the graph search finds. [HoDoKu regression library](https://hodoku.sourceforge.net/libraries/reglib-1.3.txt) · [Inference search](crates/engine/src/patterns/inference.rs)

With `--depth-three --als-inference`, the outside-cell pass left the same 12 stalled positions, scores, and step counts. The mean of two median rating times rose from 41.4 to 49.9 ms, and the mean of the 95th-percentile times rose from 219.1 to 287.4 ms. Each run timed 25 ratings per grid, with the build order reversed for the second comparison. [Coverage benchmark](crates/engine/benches/coverage.rs)

Continuous ALS Nice Loops now search only strongly connected sets of implications that contain a qualifying ALS link. Each walk records the link index and reads the evidence when it reports a proof. Before-and-after scans matched every action and proof for 11 inference techniques across 307 positions. The exact solver independently checked every reported action. [Inference search](crates/engine/src/patterns/inference.rs) · [Loop components](crates/engine/src/patterns/inference_graph.rs)

In a paired native run on the 12 `--depth-three` grids, enabling `--als-inference` gave a median of 49.9 ms before the change and 46.3 ms after it. The 95th percentile fell from 285.9 to 253.3 ms. The default profile in the same comparison went from 35.3 to 30.9 ms at the median and 162.3 to 158.1 ms at the 95th percentile. Each run rated every grid 25 times. Both profiles reached the same stalled positions, scores, and step counts as before. [Coverage benchmark](crates/engine/benches/coverage.rs)

The Wasm rating API returned identical ratings on the same 12 grids. With ALS enabled, the median fell from 75.4 to 72.1 ms and the 95th percentile fell from 373.1 to 338.8 ms. The default profile stayed near a 52.5 ms median and a 226 ms 95th percentile. Node ran each build eight times per grid and alternated which build ran first.

Unique Rectangle chains found open chains and discontinuous loops on 130 of 220 sampled depth-three grids after singles, locked candidates, and subsets through size four. Continuous loops appeared on 82 of those grids. The sample took every 397th grid starting at line 1. The exact solver checked every reported action. On the SudokuWiki positions, a seven-link loop places 2 in r3c5. Two eight-link continuous loops reproduce all six published removals. [Depth-three collection](https://github.com/denis-berthier/Classifications-of-TE3-Sudokus) · [Worked Unique Rectangle chains](https://www.sudokuwiki.org/Using_Unique_Rectangles_as_Links_in_Chains)

With `--depth-three --unique-rectangle-inference`, four of twelve puzzles took one additional step and removed one more candidate each. All twelve stalled under both profiles. The mean of the two native run medians rose from 31.5 to 32.3 ms, and the mean 95th percentile rose from 154.9 to 160.3 ms. Each run rated each grid 25 times, with the order reversed for the second pair. [Coverage benchmark](crates/engine/benches/coverage.rs)

An exact solver checked every action in 4,490 Pattern Overlay proofs from 144 positions, including the worked examples and archived stalls. Independent row search replayed the 15 exercises by enumerating disjoint layouts and testing the smaller digit sets. [Pattern Overlay checks](crates/engine/src/patterns/overlay.rs)

On the twelve `--depth-three` grids, every puzzle stalled with `--unique-rectangle-inference` alone. Adding `--pattern-overlay` after the rectangle chains solved all twelve. The mean native median rose from 37.9 to 41.4 ms, and the mean 95th percentile was 161.4 ms before and 160.9 ms after. Two paired runs used 25 ratings per grid and reversed profile order for the second run. [Coverage benchmark](crates/engine/benches/coverage.rs)

The Wasm rating API also went from twelve stalls to twelve complete solves on those grids. In Node, the median rose from 52.2 to 60.6 ms and the 95th percentile fell from 231.1 to 220.8 ms. The comparison used eight ratings per grid per profile and alternated which profile ran first.

On the published Jigsaw puzzle, the default profile stalled after 10 steps from the givens. Enabling Pattern Overlay through five digits solved it in 84 steps with a native median rating time of 1.09 ms. From the published worked position, the default profile stalled immediately and the overlay profile solved it in 68 steps with a 0.82 ms median. The benchmark used 40 ratings per position and profile. [Worked Jigsaw example](https://www.sudokuwiki.org/Pattern_Overlay#Jigsaw_multiple_example) · [Variant benchmark](crates/engine/benches/variants.rs)

## 7. Compare solve paths

Each rating describes a path under one solver configuration. The solution panel marks unfinished positions with at most one distinct move from the enabled Easy techniques. [Path analysis](crates/engine/src/logical/paths.rs)

- [x] Count the easy moves at each step. Highlight positions with few or no easy moves.
- [x] Compare the same puzzle with and without a selected technique. Include the versioned score for each completed path.
- [x] Search for an alternate path that avoids the selected technique within a fixed budget. If the budget runs out first, report that the result is inconclusive.

Audit complete. The default starter path begins with 16 distinct Easy moves and flags its last unfinished position with one. On an ordered profile without Alternating Inference Chain, the Unique Rectangle Type 1 practice grid stalls along the first path. The alternate search finds a complete 18-step path after expanding 22 positions and the test verifies every proof during replay. [Native regression](crates/engine/tests/engine_contract.rs) · [Wasm regressions](tests/engine-wasm.mts)

[Research on Sudoku difficulty](https://arxiv.org/abs/1403.7373)

## 8. Add variety to generation and practice

The built-in pool has fourteen templates with exactly 17 clues and three expert grids with more clues. The pool regression verifies that each has a different canonical grid. [Built-in pool](crates/engine/src/generation/templates.rs) · [Canonical grid](crates/engine/src/generation/canonical.rs)

- [x] Add verified templates that represent different puzzles after accounting for grid symmetries and digit renaming.
- [x] Measure generation match rates and distinct puzzles by clue count and score range. Start with 17 through 20 clues.
- [x] Add several distinct practice positions per technique. Include more than one pattern layout and make sure that each expected move has a valid proof.

The release benchmark sampled 20 seeds per cell in the table with up to 208 attempts per seed. Each group returned 20 matches and 20 raw grids. The table counts grids after identifying symmetry and digit-renaming equivalents. [Generation benchmark](crates/engine/benches/engine.rs)

| Givens | 0–800 points | 801–1,000 points | 1,001–1,600 points | 1,601–8,000 points |
| ---: | ---: | ---: | ---: | ---: |
| 17 | 4 | 4 | 2 | 6 |
| 18 | 20 | 19 | 19 | 19 |
| 19 | 20 | 20 | 20 | 20 |
| 20 | 20 | 20 | 20 | 20 |

Audit complete. The practice catalog has 195 grids across 65 techniques. The regression checks three independent givens grids and at least two layouts per technique. It verifies each expected deduction against the unique solution and replays the technique-specific proof with the stored candidate removals. [Practice grids](crates/engine/src/practice/examples.rs) · [Native regression](crates/engine/tests/engine_contract.rs) · [Wasm regression](tests/engine-wasm.mts)

## 9. Model puzzles as sets of rules

Start with single 9×9 grids. A constraint is a rule that limits which digits can appear in specified cells. A house is a set of cells that contains each digit exactly once. The variant exact solver compiles each puzzle’s houses, peers, and constraints. The classic proof model uses standard rows, columns, and boxes. [Variant rule model](crates/engine/src/variant.rs) · [Exact variant search](crates/engine/src/variant/search.rs)

- [x] Define a versioned puzzle format for givens, regions, and constraints. Use stable rule IDs and typed parameters. Treat variant names as presets that combine these rules.
- [x] Keep the 81-character format for classic puzzles. Round-trip full variant puzzles and positions through Rust, Wasm, and batch commands. Reject unknown or unsupported rules explicitly.
- [x] Derive house membership, intersections, and pairs of cells that cannot share a digit from the rules. Allow both replacement regions and extra houses. Keep other relationships, such as sums or ratios, separate from houses.
- [x] Validate cell references, region coverage, path lengths, clue parameters, and allowed overlaps before search.
- [x] Make candidate calculation, conflict checking, exact solving, and solution counting use the same rules. Distinguish an invalid definition, a direct conflict, no solution, multiple solutions, and a search limit.
- [x] Keep puzzle rules separate from the techniques that explain deductions. Enforce all active rules even when the solver profile disables a technique.

The structured format uses version 1, stable rule IDs, and 81-cell grid strings. Definition validation covers region connectivity, cell indices, cage overlaps, line lengths, and outside clue direction. Native, Wasm, and batch requests use the same compiled rules for exact analysis. [Format and examples](crates/engine/README.md#rule-based-variant-puzzles)

## 10. Support X Sudoku, Jigsaw, and Killer

- [x] Add X Sudoku with both main diagonals as extra houses. Allow either diagonal on its own in mixed puzzles.
- [x] Add Jigsaw with nine connected regions of nine cells each. Make sure that each cell belongs to exactly one region. Use these regions in place of the standard boxes.
- [x] Add Killer cages with a target sum and no repeated digits. Validate feasible totals. Allow cells outside cages in mixed puzzles and enforce full coverage only when the preset requires it.
- [x] Explain Killer deductions from possible cage sums and the digits that can occupy each cage cell. Use the sum of a complete house to explain deductions in cages that cross its boundary.
- [x] Test all three variants through validation, candidates, exact solving, ranked hints, trace replay, ratings, practice, and generation. Include a mixed Jigsaw and Killer puzzle.

Exact regression tests cover both diagonal choices, candidates affected by replacement regions, and a mixed Jigsaw and Killer puzzle that becomes unique with the cage. The mixed trace stalls with only Naked Single and finishes when it can explain cage combinations. The 45 rule tests check the cells inside and outside a house. A generation regression runs the playing APIs on X Sudoku, Jigsaw, Killer, and mixed Jigsaw and Killer matches. [Variant contract tests](crates/engine/tests/variant_contract.rs) · [Logical proof tests](crates/engine/tests/variant_logic.rs) · [Generation tests](crates/engine/tests/variant_generation.rs)

[World Sudoku Championship rules and examples](https://wspc2023.com/downloads/16thWorldSudokuChampionship-InstructionBooklet-v1.pdf) · [WPF Diagonal Irregular example](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2023/2023_SudokuRound3_IB.pdf)

## 11. Add common rule families

Build rule families that work on their own and in combinations. Store the rule and its parameters explicitly when a puzzle uses a variation.

See [Sudoku variant research](SUDOKU_VARIANT_RESEARCH.md) for additional rules, published examples, and choices to consider when defining the puzzle format.

- [x] Add extra houses for Windoku and Disjoint Groups. Add odd and even cell restrictions and groups of cells with matching digits for Clone Sudoku.
- [x] Add Anti-Knight, Anti-King, and orthogonal Non-Consecutive rules. Test their combination for Miracle Sudoku.
- [x] Add relationships between marked cells. Cover inequalities, consecutive and double-ratio Kropki dots, and XV sums of 5 and 10. An unmarked pair can exclude a relationship only when the puzzle declares that rule. Apply that setting separately for each marker type.
- [x] Add Thermo and Arrow. Digits strictly increase from the Thermo bulb to its tip. The digits on an Arrow path sum to the number in its circle.
- [x] Add Renban, Whispers, Palindrome, Between, and Region Sum lines. Store the ordered cells, the minimum difference for Whispers, and the regions that divide a Region Sum line.
- [x] Add outside clues for Sandwich, Little Killer, X-Sums, and Skyscrapers. Store each clue’s direction and ordered cells. Allow repeats on Little Killer paths where the other rules permit them.
- [x] Plan separate support for smaller and larger grids and for overlapping grids such as Samurai.
- [x] For fog puzzles, track visible constraints separately. Use only visible information to explain player hints.

The exact solver reproduces the published solution to Mitchell Lee’s two-given Miracle Sudoku. Contract tests compare directional outside clue candidates with an independent row permutation check. [Variant contract tests](crates/engine/tests/variant_contract.rs) · [Miracle solution](https://www.mathekalender.de/wp/wp-content/uploads/2021/07/MK-2020-Solutions-en.pdf)

### Grid sizes, overlapping grids, and fog

Keep version 1 for a single 9×9 grid. A future format can add a digit count and an explicit layout for each grid. For 4×4, 6×6, and 16×16, derive house length, symbols, and candidate masks from that count. Build and verify the sized single grid before adding composition.

Give each playable coordinate one cell ID across overlapping grids. Build houses from each grid’s local layout and let shared cells belong to houses in both grids. Scope geometry rules and outside clues to the grid that defines them. Verify that conflicting givens in a shared cell fail validation. In Samurai, verify that each overlap can transfer candidates between its two grids.

The engine takes visibility separately from the full puzzle. Visibility lists the revealed givens and rules and the candidate removals a player has established. Hints and replay use the resulting visible puzzle, including any checks that a uniqueness-based proof needs. Exact solution verification uses the full rules. The reveal policy can update visibility after each placement. [Fog projection](crates/engine/src/variant/visibility.rs)

[World Sudoku Championship variants](https://wspc2023.com/downloads/16thWorldSudokuChampionship-InstructionBooklet-v1.pdf) · [Sudoku U constraint reference](https://www.sudoku-u.org/constraints) · [WPF X-Sums examples](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2025/2025_SudokuRound4_IB.pdf)

## 12. Explain and rate variant deductions

- [x] Review which classic techniques still apply under each rule set. Enable a technique only when its proof assumptions hold. For deductions that rely on swapping digits in a unique puzzle, prove that the swap respects every active rule.
- [x] Add stable IDs and replayable evidence for variant techniques. Name the constraints, cells, and candidates that prove each move. Keep exact-search shortcuts out of logical traces and hint choices.
- [x] Use the same ranked hint and practice APIs for variants. Include several distinct practice positions for each new technique. Test that proofs still hold when rules overlap.
- [x] Record the rule set, solver order, and scoring version with each rating. Calibrate variant technique costs against sample puzzles. Mark ratings as partial when the selected logical techniques stall.

The variant catalog includes explanations for the line, outside clue, marker, parity, and chess rules. Each proof records the applicable rule indices, cells, and candidate masks. Hints, traces, replay, and practice checks all use that evidence. Regression tests cover every local rule and the order in which overlapping rules explain their deductions. [Variant logical engine](crates/engine/src/variant/logical.rs) · [Logical proof tests](crates/engine/tests/variant_logic.rs)

Singles and Locked Candidates use all active houses. X-Wing, Swordfish, and Jellyfish use rows and columns, so they also work with replacement regions. The other classic detectors use standard boxes. A uniqueness proof requires bounded verification of a unique solution and a swap that changes no cell covered by an additional rule.

The practice library adds 66 exercises, three per new technique. It also loads the classic exercises as structured positions. Each exercise has a unique solution and an independently checkable suggested action. Thermometer, Arrow, and Renban examples include another rule on the same path. [Practice library](crates/engine/src/variant/practice/examples.rs) · [Practice tests](crates/engine/tests/variant_practice.rs)

Version 3 takes the median of three proof-effort estimates per new technique. The estimates use the cells and candidate choices to inspect and account for extra arithmetic steps. Each of the 66 sample traces starts with its target technique and reaches the verified solution. The scores range from 178 to 886 points, with a median of 271. [Scoring audit](crates/engine/tests/variant_scoring.rs)

## 13. Generate and verify variant puzzles

- [x] Generate from solved grids that satisfy the selected rules. Build variant clues from those solutions and verify uniqueness under the final rule set.
- [x] Target given counts and variant clue counts separately. Allow targets for cage sizes, score, difficulty, and opening techniques where the rules support them.
- [x] Offer a target that requires a selected rule family for uniqueness. Test it by removing that family and counting solutions again.
- [x] Make seeded generation repeatable, bounded, and cancellable. Record the seed and rule set with each result.
- [x] Deduplicate by transforming givens and constraints together. Use only transformations that preserve the active rules, including sums, ratios, and directions.
- [x] Test known solutions, direct conflicts, impossible puzzles, and multiple solutions for every rule family. Use an independent solver or small exhaustive fixtures to test deduction soundness.
- [x] Benchmark classic, single-rule, and mixed puzzles in native Rust and Wasm. Measure rating and hint latency, generation match rates, and Wasm size.

The variant generator samples complete grids, builds derived clues, and removes givens only when the final rules still prove uniqueness. The generation tests verify cage and Jigsaw requirements by counting solutions after removing the family. A zero-given Killer case has Cage Combinations as its only opening. Adding Parity introduces a competing opening and rejects the match. [Generator](crates/engine/src/variant/generation.rs) · [Generation tests](crates/engine/tests/variant_generation.rs)

The outcome fixtures use two known completions and one incompatible complete grid for each rule family. The incompatible grid also provides an impossible position when only its digits appear as candidates. An independent row permutation check verifies directional clue support. [Outcome fixtures](crates/engine/tests/variant_outcomes.rs) · [Variant contract tests](crates/engine/tests/variant_contract.rs)

The version 3 release benchmark measured 40 rating and hint calls on each fixed grid and generated with seeds 1–20. Each seed allowed six attempts and 20,000 nodes per exact check. The table gives median/p95 milliseconds on one arm64 Mac. Each row matched 20 of 20 seeds in both builds. The Wasm binary measured 2,234,600 bytes before compression and 556,192 bytes with gzip. [Native benchmark](crates/engine/benches/variants.rs) · [Wasm benchmark](scripts/bench-variants.mjs) · [Fixtures](crates/engine/benches/fixtures/variants.json)

| Case | Generation givens | Native rating | Native hints | Native generation | Wasm rating | Wasm hints | Wasm generation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Classic | 30 | 0.022/0.022 | 0.032/0.034 | 0.629/0.789 | 0.037/0.047 | 0.040/0.043 | 0.531/0.691 |
| X Sudoku | 26 | 0.074/0.075 | 0.019/0.021 | 0.569/0.768 | 0.058/0.062 | 0.049/0.055 | 0.555/0.711 |
| Killer | 15 | 0.235/0.236 | 0.037/0.037 | 1.999/2.300 | 0.241/0.281 | 0.109/0.128 | 2.370/2.726 |
| Jigsaw and Killer | 15 | 0.137/0.138 | 0.025/0.026 | 1.620/1.721 | 0.210/0.229 | 0.112/0.166 | 2.226/2.379 |

## 14. Integrate XV into the app

The separate worktree is `codex/sudoku-xv-integration`. Track the family in [issue 48](https://github.com/coder13/sudoku-app/issues/48). Native XV rules, techniques, practice and generation already exist. This pass connects them to the app.

- [x] Render and inspect Clover's published XV puzzle and solution PDFs from 2025-10-08. Preserve four givens, eight V marks and fourteen X marks. Independently prove the printed unique completion and multiple completions after removing XV.
- [x] Inspect the published XV and IVs puzzle and solution PDFs from 2025-12-16. Preserve four givens, four V marks, twelve X marks and six Quadruple clues. Independently prove uniqueness and the need for both rule families.
- [x] Check every action in both native/app traces against the independently verified grids. The pure native profile stalls at 1,076 points after 55 steps; the app profile solves at 4,538 points after 151 steps. The mixed puzzle solves under both orders at 1,540/1,870 points and 123 steps.
- [x] Verify three generated 30-given, twenty-marker puzzles independently. Seeds 17, 43 and 227 all need XV and complete their native Easy paths. These are compatibility cases, not difficulty calibration or a generation benchmark.
- [x] Test independent negative V/X flags and repeated Quadruple digits. The independent counter uses digit arrays and exhaustive four-cell assignments, separate from the engine's support code.
- [x] Audit the Coach `twoCellSum` compiler: sums of 5 and 10 map to V and X; other totals need [general adjacent totals](https://github.com/coder13/sudoku-app/issues/72). Preserve or explicitly reject those parameters.
- [x] Preserve four unmodified Coach exports: 7v7n, FCeS, 63Jk and Chcs. Count their solutions independently and retain every dot, diagonal, chess rule, inequality and Whispers parameter. Keep the real 99Eu sum-15 export rejected pending general adjacent totals.
- [x] Render V/X marks and accessible partner labels. Separate overlapping dots and reversed inequalities under all eight transforms. Inspect static 900/360-pixel diagrams against the published originals. Live viewport testing remains a follow-up.
- [x] Verify independent positive and negative V/X semantics across rule layers. Cover all digit pairs in both directions, both note types, conflict checks, bulk input, undo/redo, actual storage reload, original shared givens and all eight transforms.
- [x] Replay every action in published complete and partial paths against independent completions. Enumerate XV proof support independently. Verify several hints, pages, Finder, disabled logical profiles, selected steps and three practice exercises with accepted and rejected answers.
- [x] Expand the combined-family fixture to 32,768 selections: 24,576 compatible imports and 8,192 intentional contradictions. This checks combinations on a near-complete grid; it does not prove that every arrangement is supported.
- [x] Pass 437 app tests, 265 Wasm tests, TypeScript and the 159-route production/offline build. The final explicit text halo also passes seven focused component tests. No Rust source or scoring policy changes in this integration.
- [x] Record request latency, app caller costs, memory and package sizes. The six-source benchmark includes the slow 6.75-second 63Jk rating, preview and walkthrough. Preserve the costs of app hint preferences separately from raw ten-hint requests. [Measurements](tests/fixtures/README.md#xv-app-integration)
- [x] Pass exact-head CI and merge the app-ready family through [PR 148](https://github.com/coder13/sudoku-app/pull/148). Keep New puzzle recipes conditional on calibration.

The XV integration reached main at `91dbe9c`. Native, feature, Wasm, app, documentation and deployment checks passed on reviewed head `500a39c` in run `44313482936`. The source worktree remains pinned to that head. [Issue 48](https://github.com/coder13/sudoku-app/issues/48) is closed. The separate performance work in [issue 147](https://github.com/coder13/sudoku-app/issues/147) remains open.

The app-order paths solve Clover at 4,538 points, XV and IVs at 1,870, FCeS at 3,186 and 63Jk at 27,358. Maelstrom stalls at 940 points after 27 steps. Chcs stalls at 160 points after six steps. Preserve those partial results. Chcs is independently unique without XV, so do not claim every imported marker family is necessary. The separate [rating audit](https://github.com/coder13/sudoku-app/issues/147) tracks the slow 63Jk rating and Maelstrom hint search.

## 15. Reduce repeated guardian-state work in ratings

The isolated worktree is `codex/sudoku-xv-rating-audit`, based on the XV release record in main `04def98`. Track this focused pass in [issue 147](https://github.com/coder13/sudoku-app/issues/147).

- [x] Profile the complete original 63Jk rating. Inspect sampled native instructions to distinguish guardian-state checks from bounds and propagation. Preserve the unsuccessful guardian-count experiments outside the candidate change.
- [x] Pack guardian false literals into nonempty machine words. Accept a refutation check only when no guardian is already true and at most one is unremoved. Preserve original indices, assumption order, propagation and proof construction.
- [x] Independently test all 729 candidate IDs and 258,048 assignment/subset combinations across word boundaries. Include unrelated states, satisfied clauses and zero, one or multiple remaining alternatives.
- [x] Compare complete responses and traces on six published XV sources against a fresh main artifact. Preserve 27,358 points and 199 steps on 63Jk. Keep a separate Cargo target directory for each side after finding shared-cache reuse in a preliminary control.
- [x] Pass 322 native tests, sixteen capability combinations, four package profiles and strict full/reduced Cargo documentation.
- [x] Preserve 7,291 complete responses: 7,143 variant responses on 47 corpus positions and 351 positive practice positions, plus 148 Classic responses on nine Tridagon positions. Cover all 117 detectors, full traces, ratings and every hint page.
- [x] Pass 437 app tests, 265 Wasm contracts, TypeScript and the 159-route production/offline build on the final artifact.
- [x] Rebuild main and candidate in separate target directories. The fresh 63Jk paired rating falls from 6,847.856/6,964.237 to 4,022.262/4,042.819 ms median/p95, a 41.3% median gain. Preserve all 100 generation outcomes across five families and report all profile costs, retained regressions and actual app caller latency. [Final measurements](tests/fixtures/README.md#packed-guardian-checks-in-tridagon-refutations)
- [x] Pass exact-head CI and merge the focused optimization through [PR 150](https://github.com/coder13/sudoku-app/pull/150).

The packed guardian checks reached main at `e37a21f`. Native, feature, Wasm, app, documentation and deployment checks passed on reviewed head `414e830` in run `44319355287`. The reviewed worktree remains pinned to that head. [Issue 147](https://github.com/coder13/sudoku-app/issues/147) is closed; remaining latency and worker work continue under [issue 88](https://github.com/coder13/sudoku-app/issues/88). The subsequent adjacent-total integration is recorded below.

The guardian optimization preserves scoring version 8, technique costs and enabled techniques. The four-second rating, Maelstrom/Chcs hint latency, branch propagation and browser-worker costs remain part of the broader [performance audit](https://github.com/coder13/sudoku-app/issues/88).

## 16. Integrate general adjacent totals

This family reached main at `6ff5ffc` through [PR 153](https://github.com/coder13/sudoku-app/pull/153). All native, capability, Wasm/app, documentation and deployment checks passed on reviewed head `7be9b5c` in [run 44333032516](https://github.com/coder13/sudoku-app/actions/runs/44333032516). The isolated worktree remains pinned to that head on `codex/sudoku-adjacent-sums-audit`. [Issue 72](https://github.com/coder13/sudoku-app/issues/72) is closed. [Source and implementation contract](SUDOKU_ADJACENT_SUM_AUDIT.md)

- [x] Preserve Dariao142's original 99Eu export, diagram, single Roman XV total-15 clue, ordered endpoints and companion rules. Independently prove its unique completion and the sum's redundancy. Add an essential authored control with two completions without its total and one with it.
- [x] Add the native `adjacent-total` rule and derived layout for orthogonally adjacent cells and totals 3 through 17. Reuse pair support and explicit provenance. Cover every digit assignment, local proof support, invalid geometry and even-total distinctness.
- [x] Define generic 5/10 markers under independent negative XV flags and fog completeness. Preserve own-family evidence and avoid duplicate XV proofs. Keep dependency checks monotone when arithmetic constraints are removed.
- [x] Import complete Coach sum layers, including mixed 5/10/general totals. Preserve source data, sharing, save/reload, history, candidate and note cleanup, conflicts and all eight grid transformations. Remove the incorrect 81-rule cap; a grid has 144 shared edges.
- [x] Add Roman clues, accessible labels, partner-sum explanations, a lesson and three independently unique practice exercises. Check accepted and rejected answers, 20-point Easy costs and the actual Learn page. Inspect 900/360-pixel light/dark static SVG exports, including wide numerals and shared dots/signs at grid boundaries.
- [x] Replay the published full app path and honest native partial path. Independently enumerate every sum deduction. Cover custom/disabled profiles, multiple hints, pages, Finder and dense 144-edge puzzles.
- [x] Verify three derived generation seeds with exact targets and independent rule dependence. Check a unique zero-given, 144-sum generation with only this opening technique. A competing Parity deduction must make that exclusive request fail.
- [x] Preserve 7,291 complete responses under explicit legacy profiles without response normalization. Cover 65,536 fixed-clue family selections: 49,152 compatible cases and 16,384 intentional contradictions. These bounded fixtures do not prove arbitrary combinations feasible.
- [x] Pass 330 native tests, 452 app tests, 273 Wasm contracts, sixteen capability combinations, four package profiles, strict full/reduced Cargo documentation, TypeScript and the 160-route production/offline build.
- [x] Finish paired current-main measurements and record caller latency, memory, package costs and retained regressions. Preserve all legacy scores, proofs and choices with the added default technique explicit. App Wasm adds 2,687 gzip bytes; Classic and solver packages remain byte-for-byte identical. [Methods and results](tests/fixtures/README.md#general-adjacent-totals)
- [x] Pass all checks on reviewed head `7be9b5c`, merge [PR 153](https://github.com/coder13/sudoku-app/pull/153) and verify both the reviewed commit and merge on remote main. The deployed Learn page also returns HTTP 200 with its total-15 explanation.
- [ ] Finish live viewport interaction review and calibrate New puzzle recipes. Static clue review and native generation are complete.

The new default profiles add `adjacent-total` at 20 points/Easy. Existing costs, relative order and scoring version 8 remain unchanged. Full Coach interchange, arbitrary combinations and the remaining performance work stay open in [issues 7](https://github.com/coder13/sudoku-app/issues/7), [35](https://github.com/coder13/sudoku-app/issues/35), [87](https://github.com/coder13/sudoku-app/issues/87) and [88](https://github.com/coder13/sudoku-app/issues/88).

## 17. Integrate Renban into the app

The isolated worktree is `codex/sudoku-renban-integration`, based on main `69289dd`. Track the family in [issue 55](https://github.com/coder13/sudoku-app/issues/55). [Source evidence, contract and limits](SUDOKU_RENBAN_AUDIT.md)

- [x] Inspect Clover's Renban and Pinwheel puzzle/solution PDFs. Preserve sixteen/fifteen givens, twelve lines each and four Pinwheel cages. Independently prove both complete puzzles unique and multiple completions without Renban. Preserve the independently redundant cages.
- [x] Preserve six original Coach exports. Prove Jh4o, KUUo and BSms unique, check their diagrams and retain every full/partial profile. Reject Ksy3's Entropic companion, the 6×6 9uMo grid and legacy SCv4 5NW for their specific remaining gaps.
- [x] Follow the primary compiler's connected-component semantics. Share the grouping helper with Palindrome. Add optional native drawing paths, exact coverage validation, transformations and old-wire compatibility. Support the valid unrestricted one-cell set.
- [x] Pass 337 native tests, sixteen feature combinations, four Wasm profiles and strict full/reduced Cargo documentation. Exhaust all 262,144 two-cell domain pairs and independently check three-cell and long-set support.
- [x] Connect complete imports, clue paths, numbered labels, overlap lanes, peer feedback, candidate cleanup and both Pencil modes. Preserve logical cells and original paths through all eight grid transforms. Keep range deductions visible as explained steps in walkthroughs.
- [x] Pass eight focused Wasm contracts for published replay, honest partial paths, hints/pages/Finder, disabled profiles, three independently checked practice positions, actual persistence and generation. Preserve given/clue counts, exact score targets, preferred first technique and independent rule dependence.
- [x] Keep the legacy 65,536-selection regression. Add Renban with every current companion family, every companion pair and the complete inventory: 153 compatible cases and two intentional contradictions. These bounded fixtures do not prove arbitrary arrangements feasible.
- [x] Pass 466 app tests, 281 Wasm contracts, TypeScript and the 160-route production/offline build. Preserve all 7,342 complete engine responses, unchanged catalogs/scoring, full traces and every hint page. The final rendering repair also passes eighteen focused retained line-component contracts.
- [x] Inspect static light/dark exports at 900/360 pixels, including independent overlapping clues and mixed-family geometry. Keep minimum labels above other lines, clear of dots/signs/sums, with explicit contrast layers. Preserve the remaining live viewport review separately.
- [x] Record paired retained/source request performance, real caller costs, generation success, memory and every package profile. Preserve all full responses and traces. All 120 generation outcomes match, including Renban seed 10 reaching its budget in both engines. Variant-solver grows by 6,301 gzip bytes while app saves 3,552 gzip bytes. [Methods, retained regressions and limits](tests/fixtures/README.md#renban-app-integration)
- [x] Pass all native, feature, Wasm/app, strict documentation and deployment checks on `673523f` in [run 44348686818](https://github.com/coder13/sudoku-app/actions/runs/44348686818). Merge [PR 157](https://github.com/coder13/sudoku-app/pull/157) at `7ce7fcc` and verify both commits on remote main. The source worktree stays pinned to the reviewed head.
- [ ] Complete live viewport interaction review and calibrate New puzzle recipes. Native template generation remains available.
- [ ] Extend the stalled BSms logical path through [issue 158](https://github.com/coder13/sudoku-app/issues/158). Establish an independent human deduction before adding a named detector or changing scoring. Exact search already proves its unique completion.

## 18. Integrate Entropic Lines into the app

The isolated worktree is `codex/sudoku-entropic-integration`, based on main `679311f`. Track the family in [issue 58](https://github.com/coder13/sudoku-app/issues/58). [Source contract and known limits](SUDOKU_ENTROPIC_AUDIT.md)

- [x] Inspect Clover's Numeric Keypad puzzle/solution PDFs and five complete Coach diagrams. Independently establish all six unique completions. Preserve two complete deferred Global Entropy sources.
- [x] Follow Coach's independent-per-segment semantics. Preserve touching paths, repeated references, closed loops, the two-cell different-group rule and unrestricted one-cell paths.
- [x] Port bounded group support, exact enforcement, typed proofs, transformations and the 27-point Medium research cost. Pass the independent proof-effort model and keep prior costs/scoring version 8.
- [x] Pass 344 native tests, sixteen capability combinations, four profiles and strict full/reduced Cargo docs. Exhaust all 262,144 two-cell domain pairs and check longer paths with independent digit assignments.
- [x] Wire complete import, visible paths/overlap lanes, accessible labels, candidates, both Pencil modes, input/history, actual storage, sharing, hints/pages/Finder, practice and Learn.
- [x] Replay every source action and independently check every positive Entropic proof. Keep Hyk5/Hafj partial paths explicit. Check generated practice and first-technique/exact-score generation on three selected seeds.
- [x] Preserve the legacy 65,536-selection regression. Add 173 bounded Entropic composition cases: 171 compatible and two intentional contradictions.
- [x] Pass TypeScript, 479 app tests, eleven focused new Wasm contracts and twelve retained/new line-component checks. After incorporating photo-import PR 155, pass TypeScript and all 485 combined app tests.
- [x] Inspect twenty-eight static light/dark exports at 900/360 pixels. Keep live viewport interaction review separate.
- [x] Pass all 292 Wasm contracts and all 8,167 complete retained responses under explicit legacy profiles. Compare 53 variant corpus positions, 354 positive practice positions, all 118 prior detectors and nine Classic Tridagon positions without response normalization.
- [x] Pass the production/offline build with 161 routes. Rebuilds preserve the measured Wasm artifact.
- [x] Record source/retained timings, memory, all profiles and generation yield. Preserve all 120 retained seed outcomes. New Entropic generation succeeds on twenty of twenty seeds, with twenty distinct independently unique and family-dependent puzzles. [Methods and limits](tests/fixtures/README.md#entropic-lines-native-and-app-integration)
- [x] Pass all native, feature, Wasm/app, strict documentation and deployment checks on `49d54c1` in [run 44361287093](https://github.com/coder13/sudoku-app/actions/runs/44361287093). Merge [PR 163](https://github.com/coder13/sudoku-app/pull/163) at `dded30a` and verify the reviewed commit on remote main. Keep the source worktree pinned to its reviewed head.
- [ ] Research the Hyk5/Hafj human reasoning gaps in [issue 162](https://github.com/coder13/sudoku-app/issues/162). Keep slow Hyk5 rating and BSEJ hints in [issue 88](https://github.com/coder13/sudoku-app/issues/88). Derive independently checked deductions before adding named techniques or changing scores.
- [ ] Complete live viewport interaction review and calibrate New puzzle recipes. Native template generation remains available.


## 19. Reduce repeated forcing-branch intersection checks

The isolated worktree is `codex/sudoku-entropic-rating-audit`, based on main `68684c6`. Track the measured change in [issue 165](https://github.com/coder13/sudoku-app/issues/165). [Measurements and limits](SUDOKU_FORCING_PERFORMANCE_AUDIT.md)

- [x] Profile Hyk5's real stalled position. Locate repeated locked-candidate premise scans inside Nested Forcing Net branches.
- [x] Cache negative candidate literals by digit and cell. Preserve every intersection, scan order, premise and target. Restore the cache through inner and outer rollback.
- [x] Establish intersection eligibility from the remaining source cells across every overlapping house pair and removal subset. Cover high cell bits, zero/one remaining site and unrelated removals.
- [x] Pass 346 native tests, sixteen capability combinations, all four Wasm profiles and strict full/reduced Cargo documentation. Preserve all twelve AI Escargot nested proofs and independent inference replay.
- [x] Pass 485 app tests and 292 Wasm contracts. Extend profiling to progressed positions and an explicit Wasm artifact. Extend full-response comparisons with all Entropic sources and every Hyk5 stage.
- [x] Preserve all 10,679 complete comparison responses and 140 generation outcomes. Finish paired source/retained measurements and both actual caller runs. Record all package costs and memory increases. Hyk5 app rating falls from 884.961 to 798.371 ms median. 63Jk falls from 3,997.348 to 3,667.600 ms.
- [x] Pass the 161-route production/offline build and preserve the measured Wasm hash.
- [x] Pass all native, feature, Wasm/app, strict documentation and deployment checks on `8bf317f` in [run 44369897495](https://github.com/coder13/sudoku-app/actions/runs/44369897495). Merge [PR 166](https://github.com/coder13/sudoku-app/pull/166) at `54c75b6`. Verify both commits on remote main and keep the source worktree pinned to the reviewed head.

Human reasoning gaps remain in [issue 162](https://github.com/coder13/sudoku-app/issues/162). Broader latency and real browser-worker costs remain in [issue 88](https://github.com/coder13/sudoku-app/issues/88).
