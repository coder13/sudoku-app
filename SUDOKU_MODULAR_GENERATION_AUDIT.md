# Modular Lines New Puzzle integration

Base: main `8b4ed99`, including the walkthrough fix from PR 198, mobile/sync integration from PR 228 and roadmap additions from PR 226. This isolated change adds Medium Modular Lines New Puzzle and repairs equivalent played-history exclusions. Exact-head CI, deployment and release remain pending.

## Rules, constructions and original sources

Every three successive positions use one digit from each remainder class: {1, 4, 7}, {2, 5, 8} and {3, 6, 9}. Two-cell paths use different classes. One-cell paths add no restriction. Touching paths remain independent. Repeated references retain their original meaning. Exact enforcement stays active when the explaining technique is disabled.

The technique remains Medium at 27 points without a uniqueness premise. Scoring version 8 and prior costs stay unchanged. Complete Newman, Hu9m and HCHW source fixtures retain every companion rule, exact completion and honest full/partial human path. HCHW's remaining reasoning work stays in issue 175. [Original source and performance audit](SUDOKU_MODULAR_AUDIT.md).

The published Modular controls combine several rules. Generation instead uses explicit new constructions from complete pure Entropic geometries. The bijection `1,2,3,4,5,6,7,8,9 → 1,4,7,2,5,8,3,6,9` maps ranges to remainder classes. Every original path stays present with the corresponding Modular relation. Clover contributes eight paths, EoGB one 51-position walk and BSEJ eight independent touching paths. These are constructed Modular puzzles, not published Modular transcriptions. No original mixed source loses a companion.

Independent tests compare all 729 digit triples under that bijection and check every original path and mapped completion. One-attempt calibration uses seeds 1–100, the pinned full app order and 20,000 nodes per exact check. Every accepted result is independently unique, completion-correct, Modular-dependent and solved Medium using the named technique.

| Template and givens | Clover geometry | EoGB geometry | BSEJ geometry |
| --- | ---: | ---: | ---: |
| Blank, 0–30 | 95 | 1 | 33 |
| Constructed completion, 14–20 | 97 | 98 | 97 |
| Constructed completion, 14–17 | 80 | 96 | 90 |

Thirty selected recipes retain five seventeen-given and five twenty-given examples per geometry. Lower bounds stay fourteen givens. Preparation traces match generation status, points, hardest technique and counts. Direct group assignments verify 125 Modular proofs and all 4,725 actions against independent completions. Every selected puzzle has several hints. These finite yields do not promise universal generation success.

Actual New Puzzle uses the existing bounded fresh search, checked fallbacks and complete played history. Recipes permit the generic twelve-attempt fresh retry after the checked pool is exhausted. Exact checks retain their 20,000-node budget. A known seed-42 fresh miss reaches its checked fallback. The separate hundred-request history sample succeeds without repeats or search limits. It does not establish every seed/history or independently trigger the exhausted-pool retry path.

The chooser reuses existing controls, supported difficulty handling and route/search validation. A complete shared-renderer preview shows six valid remainder-class digits on one original path. Saved unsupported levels resolve to Medium. Completed pure constructions offer another Modular puzzle. Completed mixed originals retain all companions and ask the player to choose another puzzle. Static light/dark exports at 290/540 pixels use actual SVG/CSS. They do not establish browser layout, paint, keyboard or interaction coverage.

## Private history identity and shared structure

Eighteen archived native cases returned an excluded puzzle. They use reversed paths, sliding-triple/pair decompositions, same-remainder member swaps, complement or residue cycles across the three geometries. Exact and duplicate-rule controls already worked.

Entropic and Modular now share one private original-window relation normalizer. It collects unordered different-group pairs while retaining the rule family. It never concatenates touching paths. Duplicate relations coalesce. Conflicting revisits retain self-relations. Unrestricted singletons disappear only from the private history representation.

Group naming uses explicit digit partitions and returns digits within that same partition. Pure compatible Modular keys allow all 1,296 group/member bijections. Entropic/Global Entropy use their existing range partition. Other numeric companions keep their digits. Combined Entropic/Modular partitions also conservatively keep digits. Independent enumeration finds only thirty-six bijections preserving both, so independently renaming either partition would be unsound.

Native tests check every permitted Modular bijection under all eight square transforms. Shared window tests cover both families, decomposition, loops, singletons, independent paths and numeric near misses. A direct remainder-relation check verifies the normalized names. Public source geometry, canonical definitions, wire fields, original clue/proof indices and ratings remain unchanged. Private identity code stays inside the generation feature boundary.

Independent test helpers share literal sliding-triple extraction while enumerating six group-name assignments. They do not call the native key and refuse mixed numeric rules. Literal five-position group enumeration distinguishes joined and independently touching paths. Existing Entropic identity tests and actual generation contracts remain covered after this helper refactor.

## Local validation

The minimal variants all-target check and all 381 native cases, including seven Cargo examples, pass. Fresh Wasm, strict app/new-contract/benchmark types and the 131-component catalog pass. All 497 Wasm contracts pass. After integrating main's mobile/sync changes, repeated suites pass all 669 app tests and 497 Wasm contracts. The engine and protocol remain unchanged across that merge. App callers and package comparisons are repeated against the updated baseline. Final production covers 171 routes and passes three actual-build offline contracts.

All thirty recipes retain full geometry and distinct independent identities. Sixty successive actual puzzles have multiple sound hints and complete proof-checked replay. Every action agrees with the independent unique completion. Generation and walkthrough ratings agree. All 108 app history representations and eighteen archived native failures pass. Actual persistence/reload, progress, undo/redo, exact solutions and shared definitions retain every rule.

A separate actual-app probe completes one hundred successive Medium requests, each independently unique and Modular-dependent with several hints. No repeat or search limit occurs in that finite sequence. Existing mixed sources keep their original full/partial paths. The new 4×4/algebraic roadmap work remains planned rather than shipping support.

## Controlled measurements

Darwin arm64, Node v26.13.0 and installed stable rustc 1.100.0. Both measured engine artifacts use the same installed toolchain/profile. Timings have five warmups and forty samples, with independent assertions outside timing. No audit-owned compiler, suite or other runtime benchmark runs alongside. The in-process worker adapter excludes startup, transfers, browser layout and paint. Ordinary hints do not measure exhaustive all-technique searches.

| Actual caller | Median ms | p95 ms |
| --- | ---: | ---: |
| published preview | 0.338 | 0.666 |
| published candidates | 0.024 | 0.028 |
| published ordinary hints | 0.190 | 0.393 |
| published app rate | 0.153 | 0.213 |
| published exact solve | 0.056 | 0.060 |
| published walkthrough | 1.367 | 2.856 |
| actual Medium New Puzzle | 1.465 | 1.857 |
| Medium fresh miss and checked fallback | 3.411 | 3.692 |
| Medium with thirty played puzzles | 3.742 | 3.983 |

The published caller is the complete mixed Newman puzzle, including its Entropic companions. Forty-five empty-history generation calls produce forty-five identities in this sample. Successive-history checks remain separate from these timing inputs. No universal yield, latency or speedup claim follows.

All 675 preceding recipe requests match. All 320 complete paired legacy generation outcomes agree: 235 successes and 85 bounded search limits. A separate native comparison preserves 1,137 complete response pairs. It includes twenty-four controls through initial, placed and explicitly removed candidates, 180 direct generation requests and 405 repeated history pairs. Direct generation retains 121 successes and 59 search limits. Only transport IDs are omitted. Rules, proofs, ratings and order are compared completely. Repeated timing inputs are included in the pair count. Deliberately repaired aliases are verified separately.

| Fixed native control | Prior definitions | Before median/p95 ms | After median/p95 ms |
| --- | ---: | ---: | ---: |
| modular medium, seed 99 | 30 | 1.959 / 2.060 | 3.621 / 3.771 |
| entropic medium, seed 99 | 30 | 3.610 / 3.709 | 3.635 / 3.714 |
| global-entropy easy, seed 99 | 30 | 2.193 / 2.293 | 2.197 / 2.430 |
| global-entropy medium, seed 99 | 30 | 3.859 / 4.012 | 3.876 / 3.985 |
| palindrome easy, seed 99 | 30 | 1.252 / 1.352 | 1.246 / 1.370 |
| palindrome medium, seed 102 | 30 | 1.874 / 2.015 | 1.865 / 1.990 |
| clone easy, seed 99 | 3 | 0.643 / 0.716 | 0.636 / 0.694 |
| whispers medium gap 5, seed 99 | 30 | 2.755 / 2.831 | 2.774 / 2.859 |
| whispers medium gap 4, seed 99 | 30 | 4.602 / 4.958 | 4.623 / 4.907 |

Fixed native requests use five warmups and forty alternating measured pairs. Correct Modular history identity adds about 1.661 ms at thirty prior definitions. Other medians and tails vary. Both instances retain 6,946,816 bytes of linear memory after the expanded twenty-four-control corpus. This includes the complex Modular sources. Capacity is not live allocation, process RSS or a long-run leak test.

Complete input positions and Board SSR strings agree across twenty-three controls against a clean main `8b4ed99` baseline. Ten warmups and forty alternating samples put input medians at 0.015–0.389 ms before and 0.013–0.391 after. SSR medians are 0.771–1.303 ms before and 0.777–1.320 after. These comparisons do not establish browser interaction or faster rendering.

## Build and package

Fresh Darwin Wasm is 3,417,504 raw / 895,333 default-Node-gzip bytes, SHA-256 `c0197bc5572a71059465d27cda4647ae131dd3c30a8204bbcda40706aa7e6927`. The preceding Entropic artifact is 3,440,578 / 897,292 bytes, SHA-256 `68c06e8ac772a5c834752cad4f45a0e5d808adc8085bafdff25729225118df40`. The observed delta is −23,074 raw / −1,959 gzip bytes. Build paths and optimizer/code-generation effects can affect these totals. No general size optimization is claimed.

Final client asset sums are JavaScript 6,387,777 raw / 2,092,783 gzip and CSS 316,396 / 44,538. A fresh main `8b4ed99` UI baseline gives deltas of +10,671 / +424 JavaScript and +238 / +26 CSS bytes. Both distributions include the same main walkthrough, mobile and sync changes. The baseline uses the verified unchanged pre-Modular engine artifact. Totals sum default Node gzip per asset and exclude HTML, service workers and manifests. All five generated metadata JSON files and both lockfiles are byte-identical.

The first head `20c6227` passes CI 44573337200 with 381 native, 660 app and 497 Wasm tests, capability/profile/docs gates and ready deployment. Main then merged PR 228. The combined head must pass fresh exact-head CI for sixteen capability combinations, four profiles, strict full/core/variants docs and the full app/Wasm suites. Ready deployment, downloaded-engine checks, reviewed-head merge and fetched-main source equality remain release gates. Retain the original dirty R&D checkout. Continue source-format, grid/symbol/Fog, mixed human-solving and broader performance work in their existing issues.

Raw calibration, independent construction/partition checks, exclusions, history probes, complete response comparisons and measurements remain under `/tmp/sudoku-modular-generation-research`. The isolated source worktree is `/private/tmp/sudoku-modular-new-puzzle`.
