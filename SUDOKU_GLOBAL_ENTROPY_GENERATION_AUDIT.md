# Global Entropy New Puzzle integration

Base: main `7cdac86`, with reviewed Palindrome engine/app source `146f570`. This isolated change adds Easy/Medium Global Entropy New Puzzle and fixes equivalent played-history definitions. Released through [PR 220](https://github.com/coder13/sudoku-app/pull/220) at main `4f17db0`, reviewed head `79b85a8`, after all exact-head gates passed. Main now offers twenty-one variants plus Classic; seven older generation families remain.

## Rule and source fidelity

Every 2 × 2 area contains a low digit (1–3), a medium digit (4–6) and a high digit (7–9), including areas across box/region borders. A range occurs twice. Equal digits can repeat diagonally if other rules permit. All 64 areas remain enforced even with the technique disabled. The native technique stays Easy at 24 points without a uniqueness premise; scoring version 8 is unchanged.

The complete twenty-given Newman source, its printed solution and three full mixed Coach sources remain unchanged, including every Quadruple and Disjoint Group. Their exact completions and honest full/partial human paths remain distinct from fresh generation. Existing import, candidates, input, hints/Finder/pages, Learn/practice, exact/human solutions, actual storage and sharing stay integrated. [Original source and behavior audit](SUDOKU_GLOBAL_ENTROPY_AUDIT.md).

Generation compares blank global-only templates with the unchanged published completion as a removal template. The latter produces new puzzles and is not a transcription of the source. One-attempt seeds 1–100, the pinned full app order, 20,000-node exact checks and 0–30 givens yield 96/98 Easy and 20/24 Medium results respectively. Each accepted result is independently unique, completion-correct, rule-dependent and solved at its requested difficulty. A 14–24-given Medium target yields 20/23 results. These finite samples guide recipes; changed target ranges need not retain the same accepted seeds or grids.

Thirty checked recipes per difficulty use fifteen blank and fifteen printed-completion templates. Easy allows at most thirty givens; Medium allows fourteen to twenty-four. Actual app generation tries a fresh bounded seed, then deterministic checked fallbacks while retaining full history. If that pool is exhausted, Medium has an explicit twelve-attempt fresh retry with 20,000 nodes per exact check; the same template, givens, required rule, difficulty, technique order and complete exclusions remain in force. The optional retry budget is generic recipe configuration; preceding families retain their existing behavior. Sixty selected native preparation paths match their generation ratings/counts, with 802 directly enumerated four-cell proofs and 5,133 completion-checked actions. Current app contracts check all recipes and sixty successive results, several hints, full proof/solution replay, known fresh misses/fallbacks at both levels, persistence, undo/redo, exact solutions and sharing.

The chooser reuses existing controls, supported-level logic and route/search validation. A compact valid 2 × 2 example contains 2, 5, 8 and 1. The existing full rule explains the numeric ranges and area coverage. Continue/Back and saved choices retain the family/difficulty. Completed pure puzzles offer another Global Entropy; complete mixed originals ask for another family instead of silently removing their companions. Light/dark 290/540px static references use the actual SVG/CSS. They do not establish browser keyboard, layout, paint or interaction coverage.

## Played-puzzle identity

Four archived native cases returned the original grid despite exclusions containing duplicate global rules, swapping low digits, complement or cycling the three ranges. Private generation keys now remove exact duplicate conjunctive rules and normalize valid group/member names after each grid transform. This covers all 1,296 permutations of the three ranges and their members. The fast normalizer uses fixed stack arrays and no extra heap allocation. It applies when Global Entropy has only digit-invariant or Entropic companions; other numeric companions conservatively retain their digits. Parity, inequalities, sums, Modular and Whispers near misses remain distinct. Public canonical definitions, source geometry, original rule order/indices, clue counts, proofs and scores are not rewritten.

Native tests check every permitted permutation under all eight square transforms, mixed-safe companions, cross-range changes, partial groups and public-source retention. An independent literal four-cell experiment enumerates all 362,880 digit bijections: exactly 1,296 preserve that relation, and 361,584 have a counterexample. It evaluates 14,187,312 cases with early rejection. This pure-rule result is not generalized to arbitrary mixed numeric constraints.

App contracts check all eight grid transforms combined with four valid relabelings per level, duplicate-rule aliases and all four archived direct native cases. The independent test identity enumerates six group assignments rather than using the engine's first-group naming algorithm; it is checked against literal enumeration of every permitted digit bijection and geometry. It accepts only pure Global Entropy and rejects mixed numeric puzzles. Existing Palindrome/Clone equality and Whispers edge normalizations remain private and covered.

## Validation status

The focused app/import/identity and actual-Wasm generation/source checks pass. All 376 native cases, including seven Cargo examples, pass; app/new-contract/benchmark types and the 124-component catalog pass. Fresh Wasm is rebuilt. Final local checks pass 651 app tests, 481 Wasm contracts, strict app/new-contract/benchmark types, the 124-component catalog, all 171 production routes and three offline checks. The fresh engine artifact and all five metadata JSON files are verified. A real regression reproduces exhausted history after 62 Medium games, checks the failed fresh/checked paths and verifies recovery against the exact twelve-attempt native request. The final actual-app stress probe completes one hundred successive requests per level with independent uniqueness/dependence, distinct logical identities and several hints; all two hundred succeed without search limits. All exact-head gates pass in [CI 44551722819](https://github.com/coder13/sudoku-app/actions/runs/44551722819): 376 native cases including seven Cargo examples, sixteen capability combinations, four Wasm profiles, strict full/core/variants docs, 651 app tests, 481 Wasm contracts, types/catalog and deployment. Keep authored Coach formats, grid/symbol extensions, Fog, partial human paths and broader performance work open.

The first CI attempt exposed an optional-JSON dependency in a new test under the minimal variants build. Typed Rust fixtures replace that dependency. The exact reduced all-target check, seven reduced key tests and full 376-case native command pass locally. Rebuilt shipping Wasm is byte-identical, so the verified app behavior, compatibility corpus and measurements still use the same artifact. Final exact-head CI independently passes the corrected reduced-feature setup.

## Controlled measurements

Darwin arm64, Node v26.13.0, installed stable rustc 1.100.0. The preceding and current engine artifacts use the same installed toolchain/profile. Each caller has five warmups and forty measured samples with assertions outside timing. No audit-owned compiler, suite or other benchmark runs alongside. The in-process worker adapter excludes startup, transfer, browser layout and paint. Ordinary hint calls do not measure an exhaustive all-technique scan.

| Actual caller | Median ms | p95 ms |
| --- | ---: | ---: |
| Complete published Newman import preview | 0.372 | 0.659 |
| Published candidates | 0.014 | 0.017 |
| Published ordinary hints | 0.251 | 0.304 |
| Published app-order rating | 0.172 | 0.243 |
| Published exact solution | 0.070 | 0.076 |
| Published human walkthrough | 1.181 | 1.517 |
| Easy New Puzzle | 2.210 | 29.370 |
| Easy known fresh miss and checked fallback | 33.430 | 33.820 |
| Easy with thirty played puzzles | 2.208 | 2.345 |
| Medium New Puzzle | 15.230 | 56.040 |
| Medium known fresh miss and checked fallback | 15.013 | 15.302 |
| Medium with thirty played puzzles | 3.923 | 4.006 |
| Medium after checked-history exhaustion | 742.949 | 752.255 |

The final varying-seed calls include fresh misses and checked fallbacks. Forty-five empty-history requests give 43 Easy and 27 Medium identities; repeats without supplied history remain explicit. Separate successive-history contracts and the two-hundred-request probe verify the exclusion behavior. The exhausted case retains 62 actual generated games and seed 63, where the original fresh request and every checked recipe are budget-limited. The extra fresh budget preserves complete exclusions, rule dependence and Medium status. It is a substantially slower recovery path, not part of the thirty-game timing. A pre-repair probe accepted only 66 of 100 Medium requests; the final actual app accepts all 100 in the same finite sequence. This does not prove every seed/history succeeds or establish a universal latency bound.

All 585 preceding recipe requests match. All 260 complete paired legacy native generation outcomes agree: 198 successes and 62 search limits under their original recipe attempt budgets and explicit 20,000-node checks. A separate same-toolchain native comparison preserves 892 whole response pairs: nineteen controls through initial, placed and explicitly removed candidate positions, 140 direct generation requests and 315 repeated warmup/measured history pairs. Direct generation retains 93 successes/47 search limits. Only transport IDs are omitted; proofs, ratings, rules and order are compared completely. Repeated timing inputs are included, not 892 distinct puzzles. The deliberately repaired equivalent-history cases and new app retry are verified separately from compatibility claims.

| Fixed native generation control | Prior definitions | Before median/p95 ms | After median/p95 ms |
| --- | ---: | ---: | ---: |
| Global Entropy Easy, seed 99 | 30 | 2.264 / 2.431 | 2.308 / 2.439 |
| Global Entropy Medium, seed 99 | 30 | 3.990 / 4.057 | 4.032 / 4.125 |
| Palindrome Easy, seed 99 | 30 | 1.231 / 1.307 | 1.243 / 1.308 |
| Palindrome Medium, seed 102 | 30 | 1.897 / 1.981 | 1.887 / 2.003 |
| Clone Easy, seed 99 | 3 | 0.650 / 0.722 | 0.650 / 0.731 |
| German Whispers Medium, seed 99 | 30 | 2.795 / 2.881 | 2.795 / 2.900 |
| Dutch Whispers Medium, seed 99 | 30 | 4.619 / 4.710 | 4.577 / 4.659 |

Each native control uses five warmups and forty alternating pairs with a fixed successful request. The roughly 0.04 ms Global Entropy median overhead buys correct group identity; this is not a speedup claim. Both instances retain 4,849,664 bytes of linear memory after this corpus. Capacity is not live allocation, process RSS or a long-run leak test. These fixed native requests do not include the new app's exhausted-history retry.

Complete input positions and Board SSR strings agree across eighteen controls, including the complete zero-given mixed CJhv source. Ten warmups and forty alternating samples put input median ranges at 0.013–0.206 ms before / 0.013–0.212 after and SSR at 0.738–1.286 / 0.739–1.289. Individual tails vary. These checks support compatibility without claiming faster input, rendering or browser paint.

## Build and package

Fresh Darwin Wasm is 3,439,486 raw / 895,930 default-Node-gzip bytes, SHA-256 `22c8e168046610fb65a1600e6f47336a9bc357282815078c255966bc8b2d96fa`. The preceding artifact is 3,403,744 / 896,543, SHA-256 `724b2b20a96b6fcdea4fac80f89e2ee484ff2e219c4340f33fee6d432a0394e7`. The observed delta is +35,742 raw / −613 gzip bytes. Build paths and optimizer/code-generation effects can influence these measurements; no general size optimization is claimed.

Final production client asset sums are JavaScript 6,321,893 raw / 2,077,671 gzip (+5,718 / +507), CSS 303,312 / 41,997 (+280 / +26) and Wasm as above. Totals sum per-asset default Node gzip and exclude HTML, service workers and manifests. All five generated metadata JSON files and Cargo/package lockfiles are byte-identical. The new key code is gated by generation; CI verifies sixteen capability combinations, four package profiles and strict full/core/variants Cargo docs on the exact reviewed head. The original dirty R&D checkout remains untouched.

## Release verification and follow-up

Fetched main contains reviewed head `79b85a8cbcc5ad3d65292b786b157a03d2bc90dd` and merge `4f17db053a642f5df2d030d0a4c9c13f3b3dceb8`, with identical shipping sources. Netlify deploy `6aff114c02841b9bdec8f3c4` is ready at that head. Read-only HTTP verifies both Global Entropy New Puzzle shells (200), active `/assets/index-Dnc95Hu0.js`, all sixty recipes and their recovery budgets against the tested bank, preview code and `/assets/index-emo1de7u.css`. The active `engine.worker-CK8WWWyD.js` references `engine-DTc98mPL.wasm`, 3,439,422 bytes, SHA-256 `92f1f4604dc242b89bf38db4f22fd6313370a4982ccad0ec1a1229dd144180c6`. Local checks against those downloaded bytes verify all four equivalent-history cases and recovery after the first fresh attempt fails with 62 prior games, including independent uniqueness/dependence and multiple hints. This is not browser interaction. Linux and Darwin artifacts differ by host/build paths; cross-host byte equality is not claimed.

Entropic Lines native preparation keeps every path from the complete Clover, EoGB and BSEJ pure sources. One-attempt seeds 1–100 at 0–30 givens accept 97/1/20 results from blank templates and 100/100/100 from unchanged source completions. Completion-template targets of fourteen to twenty-four givens yield 100/100/99; at most twenty yields 97/98/97, and at most seventeen yields 80/96/90. Every accepted puzzle is independently unique, line-dependent and solved Medium using the unchanged 27-point technique. Thirty selected seventeen- or twenty-given candidates, five per source/density, have matching full app-order traces, several hints, 125 direct line proofs and 4,725 completion-checked actions. Eighteen native history counterexamples remain across reversed paths, triple/pair decompositions and valid group renamings. Exact and duplicate-rule exclusions already work. Repair those identities while preserving independent touching paths, source order and mixed numeric restrictions before the separate app integration.
