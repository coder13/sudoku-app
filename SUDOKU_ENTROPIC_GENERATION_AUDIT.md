# Entropic Lines New Puzzle integration

Base: main `c806791`, with reviewed Global Entropy source `79b85a8`. This isolated change adds Medium Entropic Lines to New Puzzle. [PR 222](https://github.com/coder13/sudoku-app/pull/222) is released at main `b689221`, reviewed head `1b5b6e3`. Every exact-head CI and deployment gate passes. Main now offers twenty-two variants plus Classic, with six older generation families remaining.

## Rules and complete sources

Every three successive positions contain one low digit (1–3), one medium digit (4–6) and one high digit (7–9). Two-cell lines require different groups. One-cell paths add no restriction. Touching paths stay independent. Repeated references and closed walks retain their original meaning.

The technique stays Medium at 27 points without a uniqueness premise. Scoring version 8 and all preceding costs remain unchanged. Exact enforcement remains active when the technique is disabled.

Generation uses every original path from three complete pure sources: Clover's eight paths, EoGB's 51-cell walk and BSEJ's eight independent touching paths. The original completion provides a removal template. Generated puzzles are fresh constructions, not source transcriptions. No companion rule is removed to manufacture a pure template. Full Hyk5, Hafj and Ksy3 definitions remain unchanged. Their partial human paths and broader performance limits remain open. [Original integration audit](SUDOKU_ENTROPIC_AUDIT.md).

One-attempt calibration uses seeds 1–100 per source, the full app order and 20,000 nodes per exact check. Every accepted puzzle is independently unique, matches its completion and loses uniqueness without Entropic rules. Each has complete Medium status and a named Entropic deduction.

| Template and givens | Clover accepted | EoGB accepted | BSEJ accepted |
| --- | ---: | ---: | ---: |
| Blank, 0–30 | 97 | 1 | 20 |
| Original completion, 0–30 | 100 | 100 | 100 |
| Original completion, 14–24 | 100 | 100 | 99 |
| Original completion, 14–20 | 97 | 98 | 97 |
| Original completion, 14–17 | 80 | 96 | 90 |

Thirty recipes select five seventeen-given and five twenty-given results per source. Every recipe keeps its full ordered paths and original completion template. Lower bounds remain fourteen givens. Preparation traces match native ratings and include 125 independently enumerated line proofs and 4,725 completion-checked actions. These samples guide recipes without promising universal success.

Actual New Puzzle first tries a fresh bounded seed, then checked fallbacks with the complete played history. Recipes permit the existing generic twelve-attempt fresh retry after the checked pool is exhausted. Exact checks retain their 20,000-node budget. Difficulty, required rule, technique order, givens interval and exclusions remain in force throughout recovery.

The chooser reuses shared controls, route/search validation and supported-difficulty selection. Complete Clover paths provide the shared-renderer preview. Saved unsupported difficulty choices resolve to Medium. Pure completed puzzles offer another Entropic puzzle. Mixed original sources retain every companion and ask the player to choose another puzzle.

## Private played-puzzle identity

Eighteen archived native cases returned an excluded puzzle across all three source geometries. They use reversed paths, sliding-triple decomposition, pair decomposition or valid group/member renamings. Exact and duplicate-rule exclusions already worked.

Private generation keys now collect unordered different-group relations from each path's original sliding windows. Duplicate relations coalesce. Independent touching paths stay separate because the key never concatenates them. Consistent closed walks match their equivalent relations. Conflicting repeated positions retain self-relations. One-cell paths add no private restriction but remain visible in public source data.

Compatible pure Entropic rules allow all 1,296 group/member permutations, just as compatible Global Entropy does. Other numeric companions conservatively keep their digits. Parity and inequality near misses remain distinct. Public canonical definitions, wire data, source order, clue indices, proof evidence and scores remain unchanged.

Native tests check explicit pair/triple/reversal equivalence under eight square transforms and all 1,296 permitted digit bijections under every transform. Independent tests derive relations from literal triples and enumerate all 243 assignments on a five-position example. Joined and independently touching paths admit six and twelve assignments respectively. The independent identity enumerates group names instead of calling the native normalizer and rejects mixed numeric rules.

Actual app contracts check 108 equivalent-history representations across the three geometries. They combine eight square transforms with four valid relabelings and add reversal, triple/pair decomposition and duplicated rules. All eighteen archived direct native cases now exclude their equivalent puzzle or report the bounded search limit.

## Validation

The reduced variants all-target check and all 379 native cases, including seven Cargo examples, pass locally. Strict app, new-contract and benchmark types pass. Focused import/component/identity checks and source/generation Wasm contracts pass. All thirty checked recipes remain distinct under an independent semantic identity.

Sixty successive actual puzzles have multiple sound hints and complete solution replay. Every action agrees with the independent unique completion. Each direct Entropic proof passes literal group assignment checks. Generation and walkthrough ratings, hardest techniques and counts agree. Progress, real storage reload, undo/redo, shared definitions and exact solutions retain their complete paths.

A separate actual-app probe completes one hundred successive Medium requests with no repeats or search limits. Every result is independently unique and line-dependent, with several hints. This finite history sample does not prove success for every seed or history.

All 655 app tests and 489 Wasm contracts pass. The 124-component catalog and app/new-contract/benchmark types pass. All 171 production routes and three actual-build offline contracts pass. Light/dark static references at 290/540 pixels use the actual SVG and line CSS. They do not establish browser layout, keyboard, pointer or interaction coverage. All exact-head gates pass in [CI 44563289009](https://github.com/coder13/sudoku-app/actions/runs/44563289009): 379 native cases, sixteen capability combinations, four profiles and strict full/core/variants docs. The same reviewed head passes 655 app tests, 489 Wasm contracts, types/catalog and ready deployment.


## Controlled measurements

Darwin arm64, Node v26.13.0 and installed stable rustc 1.100.0. Both engine artifacts use the same installed toolchain and profile. Caller timings have five warmups and forty measured samples. Independent assertions remain outside timing. No audit-owned compiler, test suite or other runtime benchmark runs alongside. The in-process worker transport excludes startup, transfers, browser layout and paint. Ordinary hints do not measure exhaustive all-technique searches.

| Actual caller | Median ms | p95 ms |
| --- | ---: | ---: |
| published preview | 0.461 | 1.075 |
| published candidates | 0.023 | 0.049 |
| published ordinary hints | 0.257 | 1.486 |
| published app rate | 0.176 | 0.447 |
| published exact solve | 0.051 | 0.114 |
| published walkthrough | 4.091 | 8.957 |
| actual Medium New Puzzle | 1.934 | 3.312 |
| Medium fresh miss and checked fallback | 3.699 | 5.244 |
| Medium with thirty played puzzles | 3.748 | 4.662 |

Forty-five empty-history requests produce forty-five distinct identities in this sample. Fresh misses fall through to checked recipes. Separate successive-history checks establish exclusion behavior across one hundred actual requests. They do not establish universal success or a latency bound. The earlier caller pass measured walkthrough at 1.572/3.417 ms median/p95. The final pass above has noisier walkthrough tails. Neither pass supports a general speedup claim.

All 645 preceding recipe requests match. All 300 complete paired legacy generation outcomes agree: 221 successes and 79 search limits under their original budgets. A separate native comparison preserves 1,003 complete response pairs. It covers twenty-one controls, 160 direct generation requests and 360 repeated warmup/measured history pairs. Each control includes initial, placed and explicitly removed candidates through seven operations. Direct generation retains 107 successes and 53 search limits. Only transport IDs are omitted. Rules, proofs, ratings and order are compared completely. Repeated inputs count as repeated pairs, not distinct puzzles. Deliberately repaired history aliases remain separate from these compatibility claims.

| Fixed native generation control | Prior definitions | Before median/p95 ms | After median/p95 ms |
| --- | ---: | ---: | ---: |
| entropic medium, seed 99 | 30 | 1.945 / 2.055 | 3.628 / 3.759 |
| global-entropy easy, seed 99 | 30 | 2.400 / 2.504 | 2.381 / 2.461 |
| global-entropy medium, seed 99 | 30 | 4.070 / 4.190 | 3.990 / 4.107 |
| palindrome easy, seed 99 | 30 | 1.277 / 1.422 | 1.307 / 1.406 |
| palindrome medium, seed 102 | 30 | 1.828 / 1.921 | 1.839 / 1.906 |
| clone easy, seed 99 | 3 | 0.627 / 0.647 | 0.646 / 0.685 |
| whispers medium gap 5, seed 99 | 30 | 2.763 / 3.066 | 2.755 / 3.657 |
| whispers medium gap 4, seed 99 | 30 | 4.586 / 4.654 | 4.568 / 4.640 |

Each fixed native request has five warmups and forty alternating measured pairs. Entropic history matching costs about 1.684 ms more at thirty prior definitions. That overhead buys correct path/group identity. It is not an optimization claim. Other individual tails vary, including German Whispers. Both instances retain 4,849,664 bytes of linear memory after this corpus. Capacity is not live allocation, process RSS or a long-run leak test.

Complete input positions and Board SSR strings agree across twenty controls, including both complete pure Entropic geometries and mixed CJhv. Ten warmups and forty alternating samples put input medians at 0.013–0.219 ms before and 0.013–0.224 after. SSR medians are 0.749–1.322 ms before and 0.746–1.339 after. This establishes retained output without claiming faster browser rendering.

## Build and package

Fresh Darwin Wasm is 3,440,578 raw / 897,292 default-Node-gzip bytes, SHA-256 `68c06e8ac772a5c834752cad4f45a0e5d808adc8085bafdff25729225118df40`. The preceding artifact is 3,439,486 / 895,930 bytes, SHA-256 `22c8e168046610fb65a1600e6f47336a9bc357282815078c255966bc8b2d96fa`. The measured delta is +1,092 raw / +1,362 gzip bytes. Build paths and optimizer/code-generation effects can affect these totals.

Production client asset sums are JavaScript 6,332,232 raw / 2,078,321 gzip and CSS 303,410 / 42,015. Deltas are +10,339 / +650 JavaScript and +98 / +18 CSS bytes. Totals sum default Node gzip per asset and exclude HTML, service workers and manifests. All five generated metadata JSON files and both lockfiles are byte-identical. Private key code stays inside the generation feature boundary. Exact-head CI passes sixteen capability combinations, four package profiles and strict full/core/variants Cargo documentation.

The isolated source worktree is `/private/tmp/sudoku-entropic-new-puzzle`. Raw calibration, archived counterexamples, independent history probes, full logs and comparison scripts remain under `/tmp/sudoku-entropic-generation-research`. The original dirty R&D checkout remains untouched. Keep authored Coach formats, grid/symbol extensions, Fog and partial human paths open in their existing issues.


## Deployment verification

Netlify deploy `6aff1fb771e074d05d3371a1` is ready at reviewed head `1b5b6e38216e6ef792cb1f56af4c0eab330cdc06`. Read-only HTTP verifies both Entropic New Puzzle shells with status 200. The active entry is `/assets/index-CfOUqpgR.js`, with `/assets/index-DMY7zpVi.css`. All thirty literal deployed recipes match the tested bank. Preview geometry and corrected dash CSS are present.

The active `engine.worker-wu7SPj_m.js` references `engine-Bcp4vPBi.wasm`: 3,440,514 raw bytes, SHA-256 `6d5022295d6a91cc8627e111653cb22f8f1447ea4fa9dffe04dfcd362c94dea6`. Local protocol checks against those downloaded bytes verify all eighteen repaired history cases. All thirty deployed recipes have independent uniqueness, Entropic dependence, Medium status and several hints. This is not browser interaction. Host/build paths explain separate Darwin and Linux artifacts. Cross-host byte equality is not claimed.

## Next family: Modular Lines

Keep the complete published Newman Entropic/Modular puzzle and both complete Coach mixed sources unchanged. New generation preparation uses an explicit construction instead of stripping their companions. The digit bijection `1,2,3,4,5,6,7,8,9 → 1,4,7,2,5,8,3,6,9` maps Entropic ranges to Modular remainder classes. Every original pure-template path stays present with the corresponding Modular relation. These are newly constructed Modular puzzles, not published Modular transcriptions.

Seeds 1–100 per geometry, one attempt and 20,000 nodes yield 97/98/97 successes at fourteen to twenty givens. At fourteen to seventeen, yields are 80/96/90. Blank counterparts at zero to thirty yield 95/1/33. Accepted candidates are independently unique, Modular-dependent and solved Medium with the unchanged 27-point technique. Thirty selected candidates have matching full traces, several hints, 125 direct Modular proofs and 4,725 completion-checked actions.

Eighteen concrete Modular exclusion failures remain across reversal, decomposition and valid remainder-group renamings. Exact and duplicate-rule controls already work. Independent enumeration of all 362,880 digit bijections finds 1,296 preserving either partition, but only thirty-six preserving both together. Mixed Entropic/Modular keys must not independently rename either partition. Preserve numeric meaning and independent paths before the separate app integration. Full provenance, scripts and raw results remain under `/tmp/sudoku-modular-generation-research`.


## Main verification

Fetched main contains reviewed head `1b5b6e38216e6ef792cb1f56af4c0eab330cdc06` and merge `b68922160ff4ffbc346422f77fdaeaa2b64b5eee`. The reviewed tree and fetched main are identical after the code merge. The source worktree remains clean and pinned to the reviewed head. Release documentation uses a separate worktree. The original dirty R&D checkout remains untouched.
