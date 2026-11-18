# Modular Lines integration audit

This integration starts from main `eb70e721`. [Issue 59](https://github.com/coder13/sudoku-app/issues/59) tracks the app-ready family. Release checks and measurements below distinguish exact solutions, human solve paths and source-format gaps.

## Rule and source fidelity

A Modular line uses the digit groups {1, 4, 7}, {2, 5, 8} and {3, 6, 9}. Every three successive positions must contain one digit from each group. The group order repeats every three positions. Digits three positions apart can differ or repeat if the other rules permit them. A two-cell path requires different groups; a one-cell path adds no restriction.

The primary published control is Philip Newman's [Birbs of Paradise](https://www.gmpuzzles.com/blog/2026/02/entropic-modular-lines-sudoku-by-philip-newman/), published February 16, 2026. Both linked puzzle and solution PDFs were rendered and inspected. The [fixture](tests/fixtures/modular-newman.json) records both URLs and SHA-256 hashes, all eighteen givens, six Entropic paths, six Modular paths and the printed completion. These twelve paths do not share cells or edges. Separate constructed controls exercise overlapping families.

An independent digit-array counter finds exactly one completion, matching the printed solution. Removing either line family produces at least two completions. The counter uses numeric remainder comparisons on each original local pair within a sliding triple. It shares no phase compilation, masks, candidates or search with the native engine.

The [versioned public Coach compiler](https://sudoku.coach/js/jCfXtZs-1776367508519.js), SHA-256 `567c7f9023cfff3a7f8feb4f8393d3b10a1f85f9539ef48f31c577b105ad521f`, maps each `modularLine` segment independently to `SudokuConstraint.Modular(3, ...)`. It does not join touching segments. The fixed modulus is three. The original official demonstration is a nine-cell-wide grid with a seven-position path; its source code and payload are preserved unchanged.

The [Coach corpus](tests/fixtures/modular-coach.json) preserves eight original exports, their authors, descriptions, publication times, printed solutions, image URLs and image hashes. All eight source images were inspected.

| Source | Scope and result |
| --- | --- |
| [Entropy 7/13](https://sudoku.coach/en/s/Hu9m), DavidW | Zero givens; all 35 rules: Global Entropy, 23 two-cell totals, five Modular paths, five thermometers and a black dot. Independent count is one, matching the printed completion. The earlier Global Entropy corpus now points to this complete integration. |
| [Modular VII/XIII 2](https://sudoku.coach/en/s/HCHW), cyboogie | Zero givens; all 22 rules: fifteen two-cell totals, six Modular paths and a white dot. One printed total is XI, or eleven. Independent count is one, matching the printed completion. |
| [Modular Curtain](https://sudoku.coach/en/s/9ZMr), Bluejay | Nine givens and nine column paths, plus 36 circles labelled 3. These require exact difference three. Keep the original source pending [General Difference support](https://github.com/coder13/sudoku-app/issues/85). |
| [Entropic Runaround](https://sudoku.coach/en/s/Cmki), FatPhil | A 6 × 6 puzzle with replacement regions, two Whispers paths with minimum difference three, a sum and four Modular paths. Grid-size support remains open. |
| [kicking modular lines…](https://sudoku.coach/en/s/7hzU), vajrajames | A 5 × 5 Latin-square puzzle with Anti-King, two Modular and four Entropic paths. Preserve its grid and region semantics. |
| [Modular Colouring](https://sudoku.coach/en/s/GYTv), cyboogie | Six Modular paths, eight Consecutive Lines, seven difference-three circles and a printed XI total. Requires [Consecutive Lines](https://github.com/coder13/sudoku-app/issues/89) and [General Difference](https://github.com/coder13/sudoku-app/issues/85). |
| [220V](https://sudoku.coach/en/s/7rs9), vajrajames | Non-Consecutive, three Entropic paths, two Modular paths and Region Sum paths. The author explicitly includes blue cosmetic lines in the mathematical rule. Preserve the source and description until [Region Sum](https://github.com/coder13/sudoku-app/issues/67) and authored-context import are complete. |
| [Skipping through fog](https://sudoku.coach/en/s/Fnxt), ThatOneEspeon | Fog, Odd, Whispers, black dots, sums, Entropic paths, cages, Renban and Modular paths. Preserve the complete export pending [Fog app support](https://github.com/coder13/sudoku-app/issues/91). |

Six incomplete sources still reject as whole imports. A supported Modular path does not justify discarding a companion rule or changing the grid. Original short URLs still require Copy → Puzzle; this change does not add a network link resolver.

## Engine and app contract

A private group-line module shares the existing six-order Entropic support algorithm with Modular's separate digit partition. Compilation records each distinct cell once and its original phase. Revisited references must agree with that phase. Support intersects domains with viable group orders without enumerating digit assignments or allocating per request. Different phases create equal-digit exclusions; equal phases require the same group, not equal digits.

The independent counter also handles self-relations as one variable, rejecting short repeated walks without a misleading two-variable support check. Independent native tests cover all 512² two-cell digit-domain pairs for each partition, every three-cell group-domain pattern, one-cell paths, closures, inconsistent revisits and a 301-reference walk. Numeric assignment enumeration supplies expected support. The rule's typed JSON accepts only `type` and `cells`; invented modulus, group and negative parameters reject. All eight square transformations preserve the published canonical identity.

The `modular` technique costs 27 points at Medium. Its three exercise proofs independently match the existing effort model, which counts inspected cells and candidate choices. Existing technique costs and scoring version 8 remain unchanged. Disabling the technique leaves exact enforcement active. Native/app hints, ordered traces, replay and practice use original rule indices and declared domains.

The app adds import and structured sharing, teal paths, numbered accessible group labels, visible one-cell paths, independent overlapping color lanes, placed-digit conflicts and Pencil cleanup. Walkthrough candidate masks retain group deductions for explained hint steps. Learn, checked practice, fresh drills, hint cards and solution steps use the actual engine proofs. Desktop/mobile rendering, source sharing and real storage reload are covered by component and Wasm tests. No extra digit-entry control is needed. Live viewport interaction review remains open.

| Source | Native score / steps / result | App score / steps / result |
| --- | --- | --- |
| Birbs of Paradise | 646 / 75 / Medium complete | 1006 / 75 / Medium complete |
| Entropy 7/13 | 2176 / 161 / Easy complete | 2606 / 161 / Easy complete |
| Modular VII/XIII 2 | 420 / 21 / stalled | 2000 / 25 / stalled |

Every action in these paths is checked against the independently established completion. Every Modular proof is replayed against direct sliding-window group assignments. The hard source keeps a verified exact solution and an explicit partial human path, tracked in [issue 175](https://github.com/coder13/sudoku-app/issues/175). A high partial total does not establish a completed difficulty rating.

Fixed-template generation preserves all twelve published paths. Three seeded controls request thirty givens, twelve variant clues, required Modular dependence and a Modular first move. Their full selected profile includes Entropic deductions. Exact score ranges reproduce the same accepted puzzle. Disabling Entropic can leave a partial path while exact uniqueness remains valid. Exclusive-opening checks inspect alternative techniques; a preferred first move alone is insufficient. New puzzle presets remain unavailable pending difficulty calibration.

Representative composition checks add Modular to each of nineteen previously integrated companion families, every pair and their full inventory. Of 192 selections, 190 preserve their fixed completion and two correctly reject conflicting Diagonal/Anti-Knight givens. The existing 173-selection Entropic control remains intact. The complete zero-given Hu9m source separately exercises Global Entropy composition. These are compatibility controls, not every possible clue arrangement.

The reduced `variant-solver` package agrees with the app package on fifteen full candidate/analyze/solve/trace/rate responses across all three sources and on the catalog. Four Modular proofs replay independently. Generation and teaching correctly return `unsupported-capability`.

## Validation and package measurements

The full native suite passes 360 tests, including seven Cargo examples. The four named Wasm profiles pass their capability, legacy Classic behavior and artifact contracts.

| Package | Main raw / gzip bytes | Modular raw / gzip bytes |
| --- | ---: | ---: |
| solver | 2065326 / 564431 | 2065326 / 564431 |
| variant-solver | 2615615 / 710657 | 2621324 / 711615 |
| classic | 2567801 / 664249 | 2567801 / 664249 |
| app | 3437195 / 899649 | 3417181 / 897461 |

The reduced variant package adds 958 gzip bytes. The app artifact is 2188 gzip bytes smaller in this compiler build; this is an observed package result, not an algorithmic speed claim. Classic-only packages remain byte-for-byte unchanged. Across eighteen client JavaScript assets, raw size changes from 6068001 to 6073395 bytes and the sum of individual Node gzip sizes changes from 1999737 to 2000855 bytes, an increase of 1118 gzip bytes.

All sixteen capability combinations pass the existing native/all-targets and Wasm-API contracts. Strict Cargo documentation passes for full, classic-only and variants-only configurations. TypeScript passes. The final app suite passes 520 tests, including the repeated-reference oracle regression. All twenty-one focused Modular import/Wasm contracts also pass after that checker repair. The full Wasm suite passes 316 tests. The production/offline build prerenders 163 routes, including the Modular lesson. Static inspection covers all three actual clue SVGs with a grid overlay and resolved theme colors; it excludes HTML cell digits, live layout and interaction.

The strict retained comparison preserves 11161 complete responses on 75 corpus positions and 360 positive practice positions, all 120 old detector IDs and every hint page. Another 148 complete Classic Tridagon responses agree. No response normalization is used. The four current-main Global Entropy sources extend the previous retained corpus.

Main app SHA-256 is `4ab15911aae4c14c751c3fb959f4f6cf73c8b8cf3eccdbaf1cdd277bb3f24b99`; Modular is `9f61fa13458970e78a2a054a74ddef92e5c204e93b256f364b08b21a8f6a8498`. The production rebuild reproduces it. An initial accumulated local feature cache exhausted disk space before a test could execute; the repeat uses identical commands with a temporary cache per combination. No product behavior is inferred from that infrastructure failure.

Performance checks are complete. Final reviewed-head CI and merge verification are pending.

## Paired performance

The audit uses Node 26.13.0 on macOS arm64. Both artifacts use their own declared native/app orders and alternate execution order. All proof, rating, trace and hint fields agree; default-order metadata removes only the declared unused Modular ID for comparison. Fixed calls use five warmups and twenty samples. App ratings and extended exhaustive calls use two warmups and five samples; the nine core exhaustive cases use ten samples. Values are median/p95 milliseconds; p95 of five is the maximum. Serialization is included; instantiation, worker startup, transfer and browser layout/paint are excluded. No audit-owned compiler, test or other benchmark runs concurrently. The host is not dedicated.

| Retained fixture | Candidates (main → Modular) | Unique analysis (main → Modular) | Exact solve (main → Modular) | Native rating (main → Modular) |
| --- | --- | --- | --- | --- |
| quadruple | 0.059/0.072 → 0.059/0.065 | 0.447/0.458 → 0.442/0.501 | 0.351/0.354 → 0.345/0.349 | 1.244/1.322 → 1.245/1.306 |
| parity | 0.019/0.029 → 0.019/0.024 | 0.030/0.036 → 0.030/0.032 | 0.030/0.036 → 0.029/0.032 | 0.139/0.144 → 0.145/0.158 |
| anti-king | 0.016/0.017 → 0.016/0.017 | 0.022/0.024 → 0.022/0.023 | 0.024/0.025 → 0.024/0.024 | 0.152/0.166 → 0.150/0.164 |
| non-consecutive | 0.020/0.021 → 0.020/0.021 | 0.094/0.096 → 0.093/0.099 | 0.096/0.128 → 0.095/0.106 | 0.383/0.390 → 0.378/0.383 |
| nc-white-dots | 0.048/0.052 → 0.049/0.054 | 0.319/0.344 → 0.319/0.344 | 0.330/0.355 → 0.348/0.377 | 1.068/1.097 → 1.053/1.074 |
| whispers | 0.020/0.021 → 0.020/0.020 | 15.626/16.617 → 15.456/16.505 | 15.150/15.591 → 15.198/15.548 | 0.280/0.286 → 0.283/0.291 |
| palindrome | 0.018/0.019 → 0.018/0.023 | 0.035/0.037 → 0.035/0.036 | 0.035/0.035 → 0.035/0.036 | 0.105/0.107 → 0.106/0.110 |
| palindrome-knight | 0.020/0.021 → 0.020/0.021 | 0.046/0.049 → 0.047/0.051 | 0.045/0.046 → 0.045/0.046 | 0.896/0.926 → 0.870/0.902 |
| palindrome-whispers | 0.021/0.023 → 0.022/0.025 | 0.489/0.499 → 0.486/0.494 | 0.106/0.110 → 0.106/0.109 | 0.814/0.820 → 0.810/0.827 |
| xv-clover | 0.022/0.028 → 0.023/0.025 | 0.069/0.074 → 0.070/0.074 | 0.048/0.058 → 0.047/0.058 | 0.305/0.413 → 0.300/0.446 |
| xv-quadruple-clover | 0.024/0.026 → 0.025/0.028 | 0.096/0.099 → 0.096/0.107 | 0.100/0.101 → 0.100/0.103 | 0.267/0.281 → 0.266/0.287 |
| 7v7n | 0.017/0.021 → 0.017/0.021 | 0.447/0.455 → 0.454/0.459 | 0.140/0.144 → 0.142/0.155 | 0.123/0.131 → 0.122/0.124 |
| FCeS | 0.022/0.025 → 0.021/0.022 | 0.082/0.084 → 0.083/0.086 | 0.083/0.086 → 0.084/0.089 | 0.527/0.538 → 0.513/0.539 |
| 63Jk | 0.010/0.016 → 0.010/0.014 | 0.044/0.045 → 0.043/0.053 | 0.039/0.040 → 0.038/0.039 | 0.984/0.990 → 0.995/1.002 |
| Chcs | 0.025/0.029 → 0.026/0.033 | 1.345/1.475 → 1.303/1.429 | 0.710/0.742 → 0.714/0.768 | 20.577/21.116 → 20.642/21.524 |
| renban-clover | 0.044/0.055 → 0.042/0.056 | 0.263/0.347 → 0.270/0.531 | 0.173/0.174 → 0.172/0.173 | 0.268/0.728 → 0.321/0.787 |
| renban-killer-clover | 0.033/0.035 → 0.033/0.035 | 0.174/0.177 → 0.176/0.187 | 0.180/0.412 → 0.179/0.545 | 0.254/1.221 → 0.269/1.978 |
| entropic-clover | 0.017/0.018 → 0.017/0.018 | 0.047/0.055 → 0.048/0.065 | 0.047/0.049 → 0.047/0.049 | 0.121/0.124 → 0.121/0.130 |
| global-entropy-newman | 0.013/0.014 → 0.013/0.014 | 0.081/0.084 → 0.082/0.084 | 0.084/0.087 → 0.084/0.092 | 0.165/0.193 → 0.167/0.213 |
| renban-Jh4o | 0.066/0.142 → 0.067/0.155 | 0.923/1.055 → 0.931/1.046 | 0.270/0.273 → 0.271/0.405 | 0.211/0.265 → 0.213/0.271 |
| renban-KUUo | 0.016/0.016 → 0.015/0.016 | 0.122/0.124 → 0.124/0.125 | 0.056/0.058 → 0.056/0.057 | 0.078/0.084 → 0.079/0.084 |
| renban-BSms | 0.020/0.026 → 0.020/0.039 | 668.919/688.748 → 680.487/718.260 | 41.041/41.687 → 41.023/41.539 | 0.055/0.073 → 0.057/0.093 |
| entropic-EoGB | 0.009/0.010 → 0.009/0.009 | 0.035/0.037 → 0.035/0.036 | 0.035/0.036 → 0.035/0.043 | 0.087/0.134 → 0.084/0.107 |
| entropic-BSEJ | 0.014/0.022 → 0.014/0.019 | 0.089/0.098 → 0.089/0.094 | 0.076/0.079 → 0.076/0.076 | 0.054/0.055 → 0.054/0.058 |
| entropic-Hyk5 | 0.013/0.015 → 0.013/0.016 | 6.589/6.657 → 6.633/6.721 | 2.535/2.640 → 2.539/2.591 | 0.078/0.080 → 0.077/0.085 |
| entropic-Hafj | 0.015/0.017 → 0.015/0.019 | 0.846/0.861 → 0.866/0.873 | 0.753/0.857 → 0.769/0.899 | 0.081/0.102 → 0.079/0.115 |
| entropic-Ksy3 | 0.066/0.069 → 0.065/0.066 | 0.241/0.275 → 0.240/0.271 | 0.242/0.253 → 0.239/0.250 | 0.476/0.548 → 0.470/0.499 |
| global-entropy-A2s7 | 0.024/0.031 → 0.025/0.032 | 36.165/36.562 → 36.570/36.851 | 32.639/32.804 → 32.812/32.932 | 1.013/1.070 → 1.012/1.039 |
| global-entropy-CJhv | 0.027/0.033 → 0.027/0.027 | 80.336/82.072 → 80.343/82.248 | 35.209/35.780 → 35.227/35.730 | 2.032/2.071 → 1.994/2.088 |
| global-entropy-AdoP | 0.017/0.018 → 0.017/0.018 | 0.123/0.125 → 0.123/0.126 | 0.123/0.124 → 0.123/0.128 | 0.153/0.156 → 0.155/0.159 |

| Retained fixture | App rating (main → Modular) | Ten hints (main → Modular) | Exhaustive first page (main → Modular) | Committed MiB (main → Modular) |
| --- | --- | --- | --- | --- |
| quadruple | 1.260/1.429 → 1.255/1.340 | 0.307/0.890 → 0.274/0.770 | 163.294/184.110 → 162.938/171.176 | 1.50 → 1.50 |
| parity | 0.191/0.195 → 0.189/0.194 | 0.086/0.090 → 0.086/0.091 | 50.687/51.820 → 50.273/53.566 | 3.56 → 3.56 |
| anti-king | 0.173/0.175 → 0.172/0.182 | 0.129/0.134 → 0.133/0.135 | 103.553/111.166 → 104.588/111.714 | 10.44 → 10.44 |
| non-consecutive | 0.408/0.425 → 0.400/0.420 | 0.082/0.087 → 0.080/0.084 | 34.195/36.447 → 33.925/36.560 | 4.06 → 4.06 |
| nc-white-dots | 1.103/1.133 → 1.076/1.109 | 0.367/0.369 → 0.360/0.372 | 0.346/0.373 → 0.358/0.367 | 1.50 → 1.50 |
| whispers | 0.312/0.330 → 0.314/0.322 | 3.494/3.539 → 3.357/3.377 | 3.586/3.693 → 3.525/3.645 | 1.56 → 1.56 |
| palindrome | 0.127/0.135 → 0.122/0.135 | 40.628/41.352 → 40.790/41.213 | 41.856/43.037 → 42.039/43.397 | 3.38 → 3.38 |
| palindrome-knight | 0.897/1.020 → 0.879/1.023 | 0.136/0.138 → 0.135/0.141 | 182.302/188.828 → 179.281/188.271 | 5.06 → 5.06 |
| palindrome-whispers | 102.239/107.120 → 102.247/109.186 | 0.219/0.240 → 0.216/0.240 | 2.493/2.634 → 2.474/2.581 | 8.31 → 8.31 |
| xv-clover | 5.912/6.333 → 6.174/6.213 | 0.286/0.364 → 0.245/0.349 | 135.607/140.153 → 133.075/143.097 | 2.12 → 2.12 |
| xv-quadruple-clover | 0.298/0.300 → 0.292/0.296 | 0.143/0.151 → 0.140/0.153 | 156.070/325.869 → 166.290/264.293 | 1.88 → 1.88 |
| 7v7n | 193.593/194.871 → 162.193/219.874 | 274.693/300.761 → 278.864/308.184 | 278.680/279.283 → 279.624/279.869 | 4.69 → 4.69 |
| FCeS | 7.210/7.358 → 7.318/7.436 | 0.122/0.144 → 0.121/0.159 | 0.785/0.804 → 0.796/0.810 | 2.31 → 2.31 |
| 63Jk | 3766.435/3856.894 → 3851.984/3937.824 | 0.110/0.192 → 0.115/0.188 | 342.273/349.483 → 334.954/347.775 | 6.31 → 6.31 |
| Chcs | 268.360/279.151 → 271.654/276.476 | 392.729/447.887 → 408.151/453.028 | 421.448/509.037 → 393.304/451.170 | 1.50 → 1.50 |
| renban-clover | 0.611/1.322 → 0.601/0.835 | 0.361/2.982 → 0.318/0.655 | 111.699/138.825 → 114.380/126.750 | 4.69 → 4.69 |
| renban-killer-clover | 0.211/0.225 → 0.218/0.220 | 0.352/0.537 → 0.293/3.915 | 72.698/74.757 → 72.086/73.065 | 3.94 → 3.94 |
| entropic-clover | 0.160/0.164 → 0.161/0.162 | 0.139/0.149 → 0.140/0.152 | 83.342/84.709 → 82.426/84.687 | 4.75 → 5.06 |
| global-entropy-newman | 0.201/0.205 → 0.201/0.208 | 0.083/0.088 → 0.085/0.089 | 46.638/52.963 → 48.390/51.173 | 3.81 → 3.81 |
| renban-Jh4o | 873.707/926.353 → 899.915/931.750 | 74.881/77.344 → 75.055/76.752 | 92.687/99.553 → 94.964/97.258 | 4.25 → 4.25 |
| renban-KUUo | 67.612/68.391 → 67.562/67.926 | 0.087/0.092 → 0.088/0.092 | 49.682/50.209 → 50.475/50.889 | 4.56 → 4.56 |
| renban-BSms | 65.319/65.647 → 65.510/65.733 | 85.246/88.823 → 85.284/87.830 | 85.131/85.331 → 85.112/85.361 | 6.75 → 6.75 |
| entropic-EoGB | 0.126/0.132 → 0.124/0.130 | 2.538/2.608 → 2.571/2.629 | 107.987/108.360 → 108.235/108.540 | 6.69 → 6.69 |
| entropic-BSEJ | 0.229/0.237 → 0.231/0.236 | 126.749/215.992 → 140.385/213.505 | 128.761/129.075 → 128.471/128.504 | 5.12 → 5.12 |
| entropic-Hyk5 | 801.719/817.411 → 811.634/830.870 | 3.374/3.535 → 3.381/3.498 | 3.315/3.325 → 3.347/3.400 | 6.69 → 6.69 |
| entropic-Hafj | 103.491/105.964 → 102.701/103.216 | 3.138/3.212 → 3.173/3.193 | 3.129/3.143 → 3.193/3.201 | 6.81 → 6.81 |
| entropic-Ksy3 | 0.518/0.523 → 0.509/0.525 | 0.170/0.181 → 0.171/0.172 | 1088.763/1096.702 → 1092.374/1098.741 | 7.25 → 7.25 |
| global-entropy-A2s7 | 87.054/88.715 → 87.461/87.605 | 0.147/0.196 → 0.147/0.168 | 0.464/0.471 → 0.469/0.511 | 3.25 → 3.25 |
| global-entropy-CJhv | 170.698/170.927 → 170.985/171.118 | 0.177/0.223 → 0.174/0.193 | 0.376/0.385 → 0.372/0.418 | 3.50 → 3.50 |
| global-entropy-AdoP | 0.271/0.296 → 0.273/0.283 | 0.142/0.146 → 0.143/0.146 | 102.111/102.392 → 102.816/103.225 | 4.75 → 4.75 |

The data does not establish a general rating speedup. The retained 63Jk app rating remains about 3.8 seconds. Whispers exact search, the slow Renban paths and partial Entropic/Global Entropy paths remain explicit controls. Committed memory is Wasm linear-memory capacity after these requests, not live allocations or process RSS.

| Retained generation | Identical outcomes | Accepted per build | Main → Modular, median/p95 ms |
| --- | ---: | ---: | --- |
| classic | 20 / 20 | 20 / 20 | 0.548/0.778 → 0.585/0.778 |
| x-sudoku | 20 / 20 | 20 / 20 | 0.568/0.694 → 0.581/0.707 |
| killer | 20 / 20 | 20 / 20 | 2.550/2.944 → 2.603/3.013 |
| jigsaw-killer | 20 / 20 | 20 / 20 | 2.357/2.585 → 2.404/2.628 |
| windoku | 20 / 20 | 20 / 20 | 0.791/2.175 → 0.800/2.198 |
| renban | 20 / 20 | 19 / 20 | 99.342/296.071 → 99.370/296.316 |
| entropic | 20 / 20 | 20 / 20 | 3.078/12.793 → 3.101/13.261 |
| global-entropy | 20 / 20 | 20 / 20 | 3.418/35.891 → 3.434/36.093 |

All 160 complete outcomes agree under the explicit old native profile. Renban seed ten reaches the six-attempt budget in both builds; 159 outcomes succeed. Each accepted puzzle is verified unique; recipes that specify a required family also pass an independent rule-dependence check. New Modular generation accepts all twenty seeds, with twenty distinct puzzles, thirty givens and twelve original line clues, at 1.961/6.792 ms. Removing only Modular rules while retaining Entropic paths permits multiple completions in each accepted puzzle. These are template controls, not very-hard difficulty calibration.

## New-family app requests

Raw calls reuse one instance across all three sources, so its memory capacity is cumulative. Actual callers use their own in-process worker instances. Assertions verify complete responses outside timing. Candidates, exact calls, native ratings, input and Board SSR use five warmups/twenty samples; app ratings, previews, hints and walkthroughs use two/five. This excludes browser startup, transfer, layout and paint.

| Request | Newman | Hu9m | HCHW |
| --- | ---: | ---: | ---: |
| raw candidates | 0.031/0.035 | 0.051/0.058 | 0.027/0.028 |
| raw analyze | 0.123/0.126 | 0.192/0.198 | 0.165/0.173 |
| raw solve | 0.057/0.062 | 0.191/0.200 | 0.083/0.084 |
| raw native-rate | 0.142/0.197 | 0.470/0.489 | 0.132/0.145 |
| raw app-rate | 0.185/0.247 | 0.537/0.560 | 866.367/871.073 |
| raw ten-hints | 0.109/0.133 | 0.155/0.163 | 0.113/0.121 |
| raw exhaustive | 55.939/56.401 | 0.356/0.370 | 273.813/275.896 |

| Request | Newman | Hu9m | HCHW |
| --- | ---: | ---: | ---: |
| preview including rating | 0.329/0.336 | 1.224/1.302 | 875.873/878.350 |
| play candidates | 0.022/0.025 | 0.044/0.046 | 0.028/0.032 |
| ordinary app hints | 0.188/0.202 | 0.188/0.202 | 0.156/0.164 |
| solution walkthrough | 1.651/2.054 | 3.702/4.914 | 873.449/879.620 |
| input with all candidates | 0.057/0.072 | 0.152/0.204 | 0.223/0.271 |
| Board SSR | 1.670/2.175 | 2.146/2.736 | 1.916/2.248 |

Ordinary app hints return ten choices for each source. Exhaustive scans expose 50, 29 and 15 choices respectively. Raw-instance capacity reaches 4.375 MiB after Newman and Hu9m, then 5.875 MiB after HCHW. HCHW’s partial app rating/preview/walkthrough costs about 0.87 seconds despite sub-millisecond exact solving. Keep detector profiling and broader human reasoning in [issue 175](https://github.com/coder13/sudoku-app/issues/175).

## Retained app callers

The reviewed main checkout and the integration each run their own complete JavaScript and Wasm artifact. Both six-source Entropic and four-source Global Entropy runs preserve the rating/status/version records, hint counts and complete or partial walkthrough outcomes. Each family also generates twenty distinct, independently verified thirty-given puzzles in each build. These before/after processes are sequential; the raw engine comparisons above alternate execution order.

| Existing source | Preview, main → Modular | App hints | Walkthrough | Input | Board SSR |
| --- | --- | --- | --- | --- | --- |
| entropic clover | 0.289/0.297 → 0.298/0.307 | 0.219/0.239 → 0.233/0.256 | 1.696/1.904 → 1.676/1.875 | 0.050/0.068 → 0.049/0.069 | 1.613/2.235 → 1.677/2.237 |
| entropic EoGB | 0.462/0.519 → 0.474/0.538 | 2.490/2.524 → 2.490/2.518 | 2.989/4.295 → 2.870/4.544 | 0.038/0.063 → 0.026/0.060 | 1.507/1.958 → 1.492/1.952 |
| entropic BSEJ | 0.666/1.767 → 0.558/0.605 | 119.212/120.584 → 120.694/122.999 | 2.871/3.738 → 3.547/6.046 | 0.104/0.112 → 0.103/0.111 | 1.666/1.772 → 1.672/1.743 |
| entropic Hyk5 | 812.030/820.149 → 814.144/858.039 | 3.422/3.432 → 3.534/3.543 | 802.747/810.314 → 818.404/873.477 | 0.032/0.070 → 0.056/0.084 | 1.592/1.689 → 1.563/1.691 |
| entropic Hafj | 105.953/106.146 → 104.416/104.720 | 3.215/3.242 → 3.234/3.254 | 104.099/104.684 → 102.707/102.972 | 0.056/0.066 → 0.072/0.116 | 1.713/1.788 → 1.705/1.783 |
| entropic Ksy3 | 1.393/5.064 → 1.393/5.112 | 0.237/0.256 → 0.235/0.255 | 3.704/4.090 → 3.676/4.083 | 0.161/0.221 → 0.162/0.407 | 2.236/2.745 → 2.230/2.654 |
| global newman | 0.367/0.374 → 0.379/0.402 | 0.217/0.223 → 0.228/0.231 | 1.372/1.769 → 1.478/1.901 | 0.029/0.077 → 0.031/0.071 | 1.558/2.082 → 1.595/2.175 |
| global A2s7 | 154.837/155.221 → 178.163/208.644 | 0.196/0.209 → 0.210/0.237 | 87.729/87.913 → 112.402/117.556 | 0.070/0.086 → 0.066/0.613 | 1.629/2.155 → 2.217/4.015 |
| global CJhv | 286.649/289.003 → 285.661/286.140 | 0.230/0.254 → 0.247/0.264 | 172.420/174.926 → 173.074/173.687 | 0.061/0.149 → 0.084/0.184 | 1.818/2.494 → 1.817/2.580 |
| global AdoP | 1.420/2.556 → 0.831/2.026 | 0.209/0.232 → 0.239/0.265 | 2.654/3.158 → 2.689/2.722 | 0.123/0.127 → 0.124/0.139 | 1.014/1.534 → 0.834/1.432 |

These measurements do not include live viewport layout, paint, worker startup or transfer. Live interaction review and New puzzle difficulty calibration remain open.

## Reproduce

```sh
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv --renban --entropic-corpus --global-entropy-corpus --modular
SUDOKU_BENCH_FAMILY=modular node --experimental-strip-types --test scripts/bench-entropic-app.mts
```

The comparison expects only the new Modular catalog entry. It uses explicit retained technique profiles and compares complete replies without normalizing deductions, ratings or exact results.
