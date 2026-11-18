# Global Entropy integration audit

This work belongs to [issue 60](https://github.com/coder13/sudoku-app/issues/60). It is in the isolated `codex/sudoku-global-entropy-integration` worktree and is not yet merged. Local package, performance and app checks pass. Final CI and release checks remain open.

## Rule and source controls

Every overlapping 2 × 2 area contains at least one low digit (1–3), one medium digit (4–6) and one high digit (7–9). All 64 areas apply, including those across box or Jigsaw borders. One group therefore appears twice. Equal digits may repeat at opposite corners when every other active rule permits it. The rule adds no binary peer relation.

The published control is Philip Newman's [Ordered Entropy](https://www.gmpuzzles.com/blog/2026/04/entropy-sudoku-by-philip-newman/), published on 2026-04-30. Its puzzle and solution PDFs were rendered and inspected. `tests/fixtures/global-entropy-newman.json` records both URLs and SHA-256 hashes. It has twenty givens. An independent digit-domain counter finds one completion with the rule and two without it. The PDF text extractor reverses row order; the fixture follows the visibly printed solution.

Three complete original Coach exports provide combined-rule controls. Their published diagrams were inspected and their printed completions checked against every clue. The fixtures retain their unmodified codes, authors, dates, image URLs and image hashes.

| Source | Givens | Complete rule inventory | Independent result |
| --- | ---: | --- | --- |
| [A2s7, Entropy Quads](https://sudoku.coach/en/s/A2s7), cyboogie | 5 | Ten Quadruple circles and Global Entropy | One printed completion |
| [CJhv, Entropy Quads 3](https://sudoku.coach/en/s/CJhv), cyboogie | 0 | Fourteen circles, including a repeated 3, and Global Entropy | One printed completion |
| [AdoP, sudoku² 25-11-14](https://sudoku.coach/en/s/AdoP), XH | 12 | Nine Disjoint Group houses and Global Entropy | One printed completion |

CJhv's dependency control retains two distinct completions that satisfy every Quadruple and Classic house after removing Global Entropy. Direct numeric checks validate both witnesses; only the printed one satisfies all 64 entropy areas. This avoids an expensive search for the second witness during every test.

The [versioned Coach compiler](https://sudoku.coach/js/jCfXtZs-1776367508519.js) generates all 64 areas independently of region layout. Its Global Entropy layer has empty settings and no local segments. Unknown settings, parameters and local cells reject explicitly.

## Encoded scope and authored rules

A complete encoded rule list can still omit instructions on the author's published page. The `custom` flag does not establish completeness. Keep the original source and distinguish decoding its payload from supporting its full authored meaning. Current short links explicitly ask the player to open Coach and use Copy → Puzzle; a future resolver must preserve the full author context.

| Preserved source | Remaining gap |
| --- | --- |
| [LEjN, Entropic Spiral](https://sudoku.coach/en/s/LEjN) | The export encodes Global Entropy and eighteen positive paths. Its author also forbids connections at spiral breaks. [Issue 168](https://github.com/coder13/sudoku-app/issues/168) tracks that mathematical rule. Decoding the positive payload does not establish complete authored support. |
| [7nms, Entropic Order](https://sudoku.coach/en/s/7nms) | Seven outside L/M/H letters order the specified group's digits from the clue direction. They are stored as cosmetic text and remain an explicit import error. [Issue 169](https://github.com/coder13/sudoku-app/issues/169) tracks the rule. |
| [K95q, That’s 3 in the corner](https://sudoku.coach/en/s/K95q) | The author states that all black dots are given; the encoded ratio settings omit the negative flag. Its positive payload cannot represent that complete instruction. |
| [HqJ9, Entropic 7/13 sums](https://sudoku.coach/en/s/HqJ9) | An empty Consecutive Line layer remains unverified. Do not drop it or guess that it means Renban. |
| [FLAb, AJT’s Bento: Entropy](https://sudoku.coach/en/s/FLAb) | Region geometry, Pill Arrows and cosmetic geometry remain unsupported. |
| [Hu9m, Entropy 7/13](https://sudoku.coach/en/s/Hu9m) | Modular Lines remain unsupported. Retain the global rule, every sum, thermometer and ratio marker. |
| [2j53, Coach Entropy collection](https://sudoku.coach/en/s/2j53) | The original export uses SCv4. Preserve it for the generic legacy decoder. |

AdoP is a useful contrary control: its custom Disjoint Group rule is fully encoded as nine explicit houses, despite their zero-opacity source styling. The app retains and explains all nine houses. No puzzle-specific denylist, uniqueness inference or automatic deletion of unsupported content resolves these gaps. [Issue 7](https://github.com/coder13/sudoku-app/issues/7) stays open.

## Native and app boundaries

The public typed rule is `{ "type": "global-entropy" }`. The compiler records the first rule index for work and proof evidence while preserving the original rule list. All 81 cells are marked as constrained for conservative uniqueness-technique eligibility. The rule is invariant under square symmetries. Numeric groups prevent arbitrary digit relabeling.

The private support kernel maps four three-bit group domains through a fixed 4,096-entry table. It restores only digits that remain in each original domain. The table is derived from coverage assignments and does not mix in Classic distinctness. Exact candidate propagation uses it to a fixed point. Givens and entries that make an area impossible report a conflict. Exact solving remains active when the human technique is disabled.

The human `global-entropy` technique emits the rule index, four actual cells, their input domains and all unsupported candidate actions. Its cost is **24 points, Easy**, calibrated against the same independent proof-effort measure as the existing catalog. Its three exercises cover a missing group, a constrained group pair and the published puzzle. Existing technique costs and scoring version 8 remain unchanged.

The app declares the rule in its existing registry. Import preview and Play obtain the readable rule from that registry. The board's accessible grid label names the three ranges and areas across region borders. This global rule has no permanent cell markers; hint patterns highlight the four relevant cells. Companion circles remain visible. Nine explicit houses that exactly match Disjoint Groups use a readable global rule and accessible position-based group names; other houses keep their individual shading. All original rule indices and arrays remain intact.

Input cleanup and conflicts inspect placed digits. They clear incompatible Pencil marks in both modes and preserve history. Walkthrough masks retain candidate-based group deductions until an explained step applies them. Generic hints, paging, Finder, practice, storage and sharing use the complete typed puzzle. New puzzle does not offer this family before difficulty recipes are calibrated; the engine's targeted generation API is tested separately.

## Logical coverage and verification status

The independent counter uses direct numeric assignments, Classic houses and the actual companion rules. Its last-domain cache holds one support result per fixed clue and reruns direct enumeration whenever any participating domain changes. It shares no production support table or search code.

| Source | Native profile, points/steps | App profile, points/steps | App result |
| --- | --- | --- | --- |
| Newman | 856/79, Easy | 1,176/79, Easy | Complete printed solution |
| A2s7 | 1,347/31, stalled | 1,747/47, stalled | Partial human walkthrough |
| CJhv | 1,961/47, stalled | 2,336/63, stalled | Partial human walkthrough |
| AdoP | 688/31, stalled | 1,612/93, Medium | Complete printed solution |

The native kernel is compared with direct numeric enumeration on all 4,096 group-domain patterns, 2,048 sparse digit-domain samples and all 6,561 complete assignments. App placed-digit restrictions cover all 256 partial group patterns. Four full source completions are independently counted. Actual Wasm checks validate every action in both logical profiles against those completions and replay each Global Entropy proof numerically. Exact candidates and completions also work with an empty human technique order.

[Issue 172](https://github.com/coder13/sudoku-app/issues/172) tracks the two incomplete Quadruple combinations. Establish independent human deductions at their actual bottlenecks before adding a detector or claiming a full walkthrough.

Local checks cover multiple hints, collection bounds, Finder counts, three checked exercises, an invalid answer, a fresh drill, actual storage reload, undo/redo, mixed sharing, and generation with exact givens, first technique, score targets and independent rule dependence. Desktop/mobile component rendering checks accessible rules, all companion circles and houses, the real lesson, hint cards and solution steps. Live viewport interaction review remains open.

The all-symmetry completion audit found a pre-existing app bug: Quadruple and Odd/Even coordinates did not move with the givens. [PR 171](https://github.com/coder13/sudoku-app/pull/171) isolates that repair. The repair reached main at `e14fe04`. All four complete Global Entropy sources now retain their printed completions and exact rules under all eight transformations.

The local native/feature/package/documentation gates, retained-response comparisons, production build and measurements below pass. Static review exports twenty clue diagrams from actual React SVG and theme tokens at 900/360 pixels in light/dark modes. Their grid/text layout is schematic, so this does not establish browser layout or interaction. Real components are tested separately. Exact-head CI and deployment checks must pass before merge.

## Package and performance measurements

Baseline is main `e14fe04`, including the separately merged clue transformation repair. Fresh production builds use separate checkouts and Cargo targets. Each client JavaScript asset uses Node gzip defaults independently.

| Package | Main raw/gzip bytes | Global Entropy raw/gzip bytes |
| --- | --- | --- |
| Solver Wasm | 2,065,326 / 564,431 | 2,065,326 / 564,431 |
| Variant solver Wasm | 2,627,536 / 708,597 | 2,615,615 / 710,657 |
| Classic Wasm | 2,567,801 / 664,249 | 2,567,801 / 664,249 |
| App Wasm | 3,406,552 / 898,722 | 3,437,195 / 899,649 |
| Client JavaScript, 18 assets | 6,059,616 / 1,997,433 | 6,068,001 / 1,999,737 |

App Wasm adds 30,643 raw/927 gzip bytes. Variant solver saves 11,921 raw bytes and adds 2,060 gzip bytes. Solver and Classic sizes stay unchanged. Client JavaScript adds 8,385 raw/2,304 gzip bytes. Compiler size differences do not establish a request speedup.

Main app SHA-256: `2fc3ac9ea7ad3922c9dc13e578045702fb6b4bcfaa34a93ee31b9be4a545b41c`. Candidate: `4ab15911aae4c14c751c3fb959f4f6cf73c8b8cf3eccdbaf1cdd277bb3f24b99`. The production rebuild reproduces the candidate. Sixteen capability combinations, four Wasm profiles, 354 native tests and strict full/reduced Cargo documentation pass. Local validation passes TypeScript, 502 app tests, the 303-contract Wasm suite and the final 11-test family suite, including the additional exclusive-opening control. Production/offline prerenders 162 routes. Final CI must include all 304 Wasm contracts.

All **10,679 complete retained responses** match on the final artifact: 10,531 variant responses over 71 corpus positions and 357 positive practice positions, plus 148 Classic responses over nine Tridagon positions. Every prior detector, trace, rating and hint page agrees under explicit legacy profiles. The catalog adds only `global-entropy`, at 24 points/Easy. This strict comparison normalizes no response fields.

Paired engine measurements use Node 26.13.0 on macOS arm64. Both engines use their actual native/app orders and alternate execution order. All proof and rating fields agree; the default-profile metadata comparison removes only the declared unused technique ID from the candidate order. Fixed requests use five warmups/twenty samples; app ratings use two/five. Exhaustive requests use two/ten in the core corpus and two/five in the extended corpus. Values are median/p95 milliseconds; p95 of five is the maximum. No audit-owned compiler, test or other benchmark runs concurrently. The host is not dedicated.

| Retained fixture | Candidates, main → Global Entropy | Unique analysis | Exact solve | Native rate |
| --- | --- | --- | --- | --- |
| quadruple | 0.058/0.190 → 0.058/0.146 | 0.518/0.552 → 0.408/0.501 | 0.390/0.398 → 0.302/0.318 | 1.237/1.388 → 1.129/1.281 |
| parity | 0.017/0.022 → 0.018/0.024 | 0.028/0.032 → 0.028/0.037 | 0.028/0.033 → 0.028/0.031 | 0.127/0.138 → 0.128/0.142 |
| anti-king | 0.015/0.016 → 0.015/0.016 | 0.021/0.022 → 0.021/0.022 | 0.021/0.023 → 0.021/0.023 | 0.133/0.150 → 0.136/0.178 |
| non-consecutive | 0.020/0.020 → 0.020/0.020 | 0.093/0.094 → 0.093/0.094 | 0.094/0.097 → 0.095/0.098 | 0.355/0.400 → 0.360/0.407 |
| nc-white-dots | 0.051/0.056 → 0.048/0.056 | 0.336/0.380 → 0.336/0.383 | 0.323/0.586 → 0.324/0.462 | 0.956/1.027 → 0.960/1.037 |
| whispers | 0.018/0.018 → 0.018/0.018 | 14.352/14.580 → 14.360/15.030 | 14.168/14.319 → 14.186/14.508 | 0.285/0.325 → 0.284/0.311 |
| palindrome | 0.018/0.018 → 0.018/0.019 | 0.035/0.037 → 0.035/0.048 | 0.037/0.039 → 0.037/0.041 | 0.100/0.110 → 0.100/0.108 |
| palindrome-knight | 0.020/0.024 → 0.020/0.022 | 0.043/0.047 → 0.044/0.050 | 0.044/0.047 → 0.044/0.046 | 0.833/0.892 → 0.840/0.877 |
| palindrome-whispers | 0.021/0.027 → 0.021/0.022 | 0.477/0.484 → 0.477/0.489 | 0.103/0.104 → 0.104/0.106 | 0.824/0.840 → 0.812/0.852 |
| xv-clover | 0.021/0.026 → 0.022/0.032 | 0.070/0.074 → 0.070/0.076 | 0.046/0.049 → 0.046/0.048 | 0.310/0.429 → 0.312/0.436 |
| xv-quadruple-clover | 0.027/0.038 → 0.025/0.028 | 0.122/0.135 → 0.098/0.129 | 0.118/0.120 → 0.096/0.099 | 0.263/0.303 → 0.256/0.291 |
| 7v7n | 0.016/0.017 → 0.016/0.020 | 0.394/0.407 → 0.393/0.420 | 0.123/0.125 → 0.122/0.124 | 0.108/0.128 → 0.109/0.147 |
| FCeS | 0.021/0.030 → 0.021/0.032 | 0.081/0.093 → 0.083/0.105 | 0.082/0.084 → 0.082/0.086 | 0.537/0.633 → 0.547/0.589 |
| 63Jk | 0.010/0.013 → 0.010/0.016 | 0.043/0.044 → 0.043/0.046 | 0.038/0.054 → 0.038/0.048 | 0.944/1.024 → 0.970/1.007 |
| Chcs | 0.026/0.029 → 0.025/0.030 | 1.241/1.293 → 1.234/1.277 | 0.691/0.712 → 0.685/0.714 | 20.234/20.357 → 20.163/20.473 |
| renban-clover | 0.033/0.040 → 0.034/0.042 | 0.148/0.178 → 0.141/0.173 | 0.141/0.151 → 0.138/0.144 | 0.190/0.307 → 0.214/0.529 |
| renban-Jh4o | 0.046/0.049 → 0.046/0.048 | 0.829/0.891 → 0.810/0.842 | 0.243/0.254 → 0.240/0.250 | 0.189/0.195 → 0.187/0.200 |
| renban-KUUo | 0.017/0.020 → 0.017/0.019 | 0.126/0.177 → 0.123/0.198 | 0.060/0.073 → 0.058/0.092 | 0.082/0.086 → 0.079/0.082 |
| renban-BSms | 0.022/0.027 → 0.022/0.027 | 717.964/721.913 → 671.542/676.311 | 43.484/45.474 → 41.372/42.295 | 0.062/0.087 → 0.061/0.088 |
| renban-killer-clover | 0.027/0.028 → 0.026/0.029 | 0.149/0.162 → 0.143/0.159 | 0.148/0.153 → 0.144/0.154 | 0.165/0.241 → 0.162/0.230 |
| entropic-clover | 0.025/0.035 → 0.025/0.029 | 0.101/0.120 → 0.085/0.094 | 0.049/0.059 → 0.047/0.048 | 0.198/0.221 → 0.194/0.321 |
| entropic-EoGB | 0.011/0.011 → 0.011/0.014 | 0.037/0.043 → 0.036/0.040 | 0.038/0.056 → 0.037/0.052 | 0.096/0.103 → 0.095/0.101 |
| entropic-BSEJ | 0.015/0.016 → 0.015/0.016 | 0.094/0.100 → 0.091/0.097 | 0.082/0.092 → 0.078/0.107 | 0.056/0.060 → 0.057/0.063 |
| entropic-Hyk5 | 0.014/0.020 → 0.014/0.036 | 6.704/6.799 → 6.619/6.768 | 2.563/2.633 → 2.533/2.607 | 0.082/0.089 → 0.081/0.088 |
| entropic-Hafj | 0.016/0.021 → 0.016/0.025 | 0.883/0.911 → 0.856/0.922 | 0.775/0.817 → 0.747/0.788 | 0.076/0.078 → 0.074/0.079 |
| entropic-Ksy3 | 0.070/0.082 → 0.070/0.086 | 0.248/0.267 → 0.241/0.252 | 0.253/0.278 → 0.251/0.286 | 0.481/0.517 → 0.475/0.540 |

| Retained fixture | App rate, main → Global Entropy | Ten hints | Exhaustive | Committed MiB |
| --- | --- | --- | --- | --- |
| quadruple | 1.238/1.405 → 1.135/1.273 | 0.243/0.400 → 0.232/0.314 | 147.445/150.318 → 146.410/150.390 | 1.50 → 1.50 |
| parity | 0.167/0.173 → 0.166/0.171 | 0.081/0.091 → 0.081/0.090 | 44.820/45.622 → 44.586/45.484 | 3.56 → 3.56 |
| anti-king | 0.156/0.187 → 0.156/0.198 | 0.116/0.120 → 0.115/0.117 | 97.307/110.784 → 96.795/100.765 | 10.44 → 10.44 |
| non-consecutive | 0.386/0.399 → 0.387/0.397 | 0.081/0.085 → 0.082/0.084 | 33.522/34.338 → 33.498/33.902 | 3.69 → 4.06 |
| nc-white-dots | 1.011/1.084 → 0.995/1.113 | 0.313/0.323 → 0.307/0.319 | 0.326/0.374 → 0.328/0.389 | 1.50 → 1.50 |
| whispers | 0.324/0.384 → 0.326/0.394 | 3.239/3.578 → 3.248/3.381 | 3.094/3.190 → 3.100/3.185 | 1.56 → 1.56 |
| palindrome | 0.118/0.120 → 0.117/0.120 | 39.371/41.052 → 39.438/40.748 | 39.243/39.824 → 39.306/40.226 | 3.38 → 3.38 |
| palindrome-knight | 0.885/0.979 → 0.876/0.905 | 0.130/0.133 → 0.129/0.133 | 169.422/176.621 → 168.869/172.858 | 5.06 → 5.06 |
| palindrome-whispers | 97.755/98.538 → 96.974/99.115 | 0.218/0.245 → 0.218/0.240 | 2.362/2.404 → 2.321/2.421 | 8.31 → 8.31 |
| xv-clover | 5.803/5.881 → 5.821/5.870 | 0.133/0.326 → 0.141/0.321 | 125.357/126.285 → 126.590/126.913 | 2.1250 → 2.1250 |
| xv-quadruple-clover | 0.299/0.304 → 0.295/0.300 | 0.139/0.196 → 0.140/0.173 | 136.715/137.817 → 137.962/139.953 | 1.8750 → 1.8750 |
| 7v7n | 85.302/86.084 → 85.082/85.832 | 273.901/276.950 → 276.040/281.731 | 278.816/280.478 → 281.730/283.762 | 4.6875 → 4.6875 |
| FCeS | 7.127/7.241 → 7.190/7.233 | 0.119/0.134 → 0.121/0.134 | 0.798/0.820 → 0.777/0.822 | 2.3125 → 2.3125 |
| 63Jk | 3682.052/3690.776 → 3681.302/3688.434 | 0.108/0.146 → 0.110/0.158 | 315.730/321.034 → 314.834/316.677 | 6.3125 → 6.3125 |
| Chcs | 257.219/275.189 → 260.168/262.793 | 295.723/303.756 → 296.770/304.980 | 298.529/302.338 → 300.678/303.706 | 1.5000 → 1.5000 |
| renban-clover | 0.232/0.268 → 0.263/0.516 | 0.132/0.337 → 0.134/0.259 | 86.267/90.399 → 88.620/91.072 | 5.0000 → 4.6875 |
| renban-Jh4o | 853.337/1020.683 → 862.439/1018.316 | 73.891/97.395 → 72.516/75.248 | 90.279/91.348 → 90.875/91.152 | 4.2500 → 4.2500 |
| renban-KUUo | 63.548/64.301 → 63.533/65.265 | 0.089/0.097 → 0.088/0.093 | 48.005/51.994 → 50.684/51.384 | 4.5625 → 4.5625 |
| renban-BSms | 66.003/66.453 → 64.387/64.678 | 85.673/86.956 → 84.797/86.303 | 85.584/86.144 → 84.894/85.085 | 6.9375 → 6.7500 |
| renban-killer-clover | 0.176/0.176 → 0.179/0.185 | 0.133/0.176 → 0.134/0.184 | 63.522/66.003 → 63.950/67.839 | 3.9375 → 3.9375 |
| entropic-clover | 0.207/0.229 → 0.207/0.221 | 0.197/0.245 → 0.210/0.240 | 73.636/73.985 → 73.222/73.701 | 4.7500 → 4.7500 |
| entropic-EoGB | 0.137/0.149 → 0.141/0.146 | 2.596/2.682 → 2.591/2.700 | 108.464/109.273 → 109.717/110.018 | 6.7500 → 6.6875 |
| entropic-BSEJ | 0.231/0.241 → 0.233/0.242 | 120.046/120.403 → 119.178/120.711 | 127.282/127.783 → 127.997/128.069 | 5.1250 → 5.1250 |
| entropic-Hyk5 | 793.125/804.029 → 792.054/802.363 | 3.369/3.454 → 3.319/3.378 | 3.375/3.403 → 3.314/3.374 | 6.6875 → 6.6875 |
| entropic-Hafj | 102.244/102.510 → 101.378/102.372 | 3.394/3.538 → 3.301/3.381 | 3.297/3.315 → 3.187/3.198 | 6.8125 → 6.8125 |
| entropic-Ksy3 | 0.533/0.560 → 0.541/0.560 | 0.177/0.230 → 0.174/0.221 | 1093.505/1095.740 → 1092.706/1094.719 | 7.2500 → 7.2500 |

The tables retain slower samples. Chcs app rating changes from 257.219/275.189 to 260.168/262.793 ms, while 63Jk remains about 3.68 seconds. No general rating speedup is claimed. Fresh-instance first requests and selected zero-proof expert searches also retain their full results. Committed capacity measures the raw Wasm linear buffer after fixed requests, not RSS, browser heap or live allocation. Non-Consecutive capacity grows from 3.69 to 4.06 MiB; Renban Clover and BSms capacities decrease. These high-water capacities do not establish a general memory improvement.

Generation compares twenty seeds for each of seven retained families under the explicit legacy native order. All 140 outcomes match, including the same Renban seed 10 search limit. Each engine accepts 139 puzzles. There are no warmups; budgets allow six attempts and 20,000 nodes per exact check.

| Retained generation | Main/Global successes | Main median/p95 ms | Global median/p95 ms | Shared failed seeds |
| --- | --- | --- | --- | --- |
| classic | 20/20 | 0.576/0.798 | 0.558/0.784 | None |
| x-sudoku | 20/20 | 0.588/0.739 | 0.580/0.716 | None |
| killer | 20/20 | 2.630/2.993 | 2.564/2.936 | None |
| jigsaw-killer | 20/20 | 2.445/2.601 | 2.359/2.565 | None |
| windoku | 20/20 | 0.787/2.137 | 0.788/2.140 | None |
| renban | 19/19 | 101.477/300.244 | 100.124/299.368 | 10 |
| entropic | 20/20 | 3.418/14.080 | 3.167/13.002 | None |

New-family requests have no pre-port baseline because main cannot decode Global Entropy. Raw calls include serialization and check complete results outside timing. One raw instance is reused across all four sources, so capacity is cumulative. Actual app callers use their own in-process worker instances. Startup, transfer, browser layout and paint are excluded.

| New source | Candidates | Unique analysis | Exact solve | Native rate | App rate |
| --- | --- | --- | --- | --- | --- |
| newman | 0.019/0.036 | 0.101/0.123 | 0.074/0.076 | 0.171/0.258 | 0.208/0.212 |
| A2s7 | 0.029/0.030 | 35.346/35.517 | 31.730/31.840 | 1.025/1.074 | 87.466/87.545 |
| CJhv | 0.033/0.037 | 79.524/81.275 | 34.405/34.571 | 2.029/2.121 | 172.899/179.817 |
| AdoP | 0.019/0.025 | 0.120/0.133 | 0.119/0.124 | 0.158/0.164 | 0.268/0.270 |

| New source | Ten raw hints | Exhaustive | Ordinary app choices | Cumulative raw-instance MiB |
| --- | --- | --- | --- | --- |
| newman | 0.124/0.261 | 41.717/42.119 | 10 | 3.8125 |
| A2s7 | 0.148/0.157 | 0.463/0.479 | 10 | 3.8125 |
| CJhv | 0.184/0.195 | 0.376/0.382 | 10 | 3.8125 |
| AdoP | 0.142/0.151 | 102.445/103.662 | 10 | 5.0625 |

Actual preview, hints and walkthrough use two warmups/five samples. Play candidates, input and grid SSR use five/twenty. Assertions validate the independent printed completion, full rating metadata and clue inventory outside timing. Both incomplete Quadruple walkthroughs remain stalled.

| New source | Preview including rating | Play candidates | Ordinary app hints | Walkthrough | Input with candidates | Grid SSR |
| --- | --- | --- | --- | --- | --- | --- |
| newman | 0.371/0.376 | 0.016/0.020 | 0.224/0.230 | 1.441/1.905 | 0.028/0.070 | 1.617/2.220 |
| A2s7 | 155.500/156.089 | 0.028/0.036 | 0.194/0.207 | 88.178/89.175 | 0.061/0.087 | 1.622/2.201 |
| CJhv | 286.438/288.491 | 0.030/0.036 | 0.231/0.244 | 172.141/173.498 | 0.060/0.151 | 1.791/2.356 |
| AdoP | 0.685/1.236 | 0.022/0.025 | 0.211/0.231 | 2.025/2.268 | 0.091/0.098 | 0.904/1.085 |

Global Entropy template generation succeeds on all twenty seeds with twenty distinct puzzles, thirty givens and zero printed variant clues. Median/p95 is 3.616/33.540 ms under the same six-attempt/20,000-node budget. Repeats agree completely. Independent counting verifies every accepted puzzle unique with the global rule and multiple without it. These are fixed-template compatibility controls, not very-hard difficulty calibration.

## Reproduction

Retained source files use `{cases: [{name, position: {puzzle}, solution}]}` from the five complete Renban and six complete Entropic fixtures. Generation recipes extend `crates/engine/benches/fixtures/variants.json` with the Clover Renban and Entropic templates: clear givens, request thirty givens, retain twelve/eight clues and require the corresponding family. Independent counters and assertions stay outside timing.

```sh
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv --renban --entropic-corpus --global-entropy
node --experimental-strip-types scripts/bench-engine-pruning.mjs before.wasm src/sudoku/generated/engine.wasm quadruple parity anti-king non-consecutive nc-white-dots whispers palindrome palindrome-knight palindrome-whispers --added-technique=global-entropy
node --experimental-strip-types scripts/bench-xv-rating.mjs before.wasm src/sudoku/generated/engine.wasm --added-technique=global-entropy
node --experimental-strip-types scripts/bench-xv-rating.mjs before.wasm src/sudoku/generated/engine.wasm retained-sources.json --added-technique=global-entropy
node --experimental-strip-types scripts/bench-exact-houses.mjs before.wasm src/sudoku/generated/engine.wasm --generation-only --legacy-order --recipes=retained-recipes.json
SUDOKU_BENCH_FAMILY=global-entropy node --experimental-strip-types --test scripts/bench-entropic-app.mts
```

The shared app benchmark defaults to Entropic when `SUDOKU_BENCH_FAMILY` is omitted. `SUDOKU_BENCH_WASM` selects an explicit artifact for both raw requests and app callers. Live viewport interaction, worker startup/transfer, narrower profile boundaries and New puzzle calibration remain follow-ups. [Issue 88](https://github.com/coder13/sudoku-app/issues/88) retains the performance queue.
