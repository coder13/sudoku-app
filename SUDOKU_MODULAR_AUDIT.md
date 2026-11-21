# Modular Lines integration audit

This integration starts from main `eb70e721`. [Issue 59](https://github.com/coder13/sudoku-app/issues/59) tracks the app-ready family. Release checks and measurements below distinguish exact solutions, human solve paths and source-format gaps.

## Release

Modular Lines reached main at `70ceebb4b8a10106b7fd8f98d0c06066cedd9869` through [PR 176](https://github.com/coder13/sudoku-app/pull/176) on November 18, 2026. All checks passed on reviewed head `494a9c3af9cbfe906e79aee4c8e848c1bcfa5b45`, including [CI run 44402439393](https://github.com/coder13/sudoku-app/actions/runs/44402439393) and the deployment preview. Completed CI logs confirm 360 native, 520 app and 316 Wasm tests. The sixteen capability combinations, four package profiles and strict full/reduced Cargo documentation pass. Fetched remote main contains both reviewed head and merge; its shipping engine, app, scripts, tests and package files match the reviewed head exactly. [Issue 59](https://github.com/coder13/sudoku-app/issues/59) is closed.

The source and reasoning limits below remain active. Live viewport review and New puzzle preset calibration remain follow-ups.

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
| [220V](https://sudoku.coach/en/s/7rs9), vajrajames | The verified short link imports Non-Consecutive, four Entropic paths, two Modular paths, and nine Region Sum lines. The authored legend accounts for the drawn orange and blue paths. An independent counter verifies the unique published answer. [Verification](SUDOKU_VARIANT_USABILITY_AUDIT.md#published-coach-links) |
| [Skipping through fog](https://sudoku.coach/en/s/Fnxt), ThatOneEspeon | Fog, Odd, Whispers, black dots, sums, Entropic paths, cages, Renban and Modular paths. Preserve the complete export pending [Fog app support](https://github.com/coder13/sudoku-app/issues/91). |

Six raw exports remain deferred. The 220V short link supplies the author legend required to recover its drawn paths. The other deferred sources still need the rules or grid layouts listed above.

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

Performance, reviewed-head CI, deployment and merge verification are complete. No new public family-specific Cargo feature is introduced; use the existing reduced capability profiles.

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

## Focused HCHW follow-up

[Issue 175](https://github.com/coder13/sudoku-app/issues/175) records both exact stalled positions, the reviewed source head and a diagnostic across all 121 catalog techniques. No detector offers a proof at the app stall. Preferring ALS AIC, Sue de Coq, Aligned Triplet Exclusion, Dynamic Forcing Net or Kraken Fish 2 gives different proof sequences that reach the same remaining candidates.

With two warmups and seven measured samples, the three empty Unique Rectangle inference searches each cost about 92–95 ms at the opening and 34–35 ms at the app stall. `classic_proofs` creates a new Classic search per technique, whereas the three rectangle graph methods share a cache only within one search instance. Profile graph construction before extending that cache lifetime. Preserve the exact board/masks, unique-solution checks, proof ordering and all retained replies. This diagnostic identifies a candidate optimization; it does not ship one or resolve the human reasoning gap.

### Combine Modular Lines and adjacent sums at the app stall

In the 25-step HCHW stall, R5C2 and R6C2 add to 7 and occupy consecutive positions on a Modular Line. If one digit had remainder 2 when divided by 3, the other would have remainder 2 as well. The Modular Line requires different remainders in these cells. R6C3 adds to 13 with R6C2. Since 13 also has remainder 1, R6C3 cannot have remainder 2. Three positions farther along the line, R7C3 and R7C4 repeat the respective remainder groups of R5C2 and R6C2.

| Cell | Candidates at the stall | Removes |
| --- | --- | --- |
| R5C2 | 1, 2, 3 | 2 |
| R6C2 | 4, 5, 6 | 5 |
| R6C3 | 7, 8, 9 | 8 |
| R7C3 | 1, 2, 3, 4, 5, 6 | 2, 5 |
| R7C4 | 1, 2, 3, 4, 5, 6, 7, 8, 9 | 2, 5, 8 |

Enumerating the five stalled domains under just those two sums and three remainder relations yields twelve assignments, including the published solution's values. Applying the eight removals to the app stall produces two further Modular deductions verified against that solution. The current walkthrough then stalls again with all cells unfilled. The engine now detects this combination for any positive adjacent total, including V and X clues, whose endpoints both lie on a Modular Line. It also assigns the third position in each window to the excluded group, so the verified proof removes 19 candidates at the archived app stall. The following adjacent-total deduction removes 8 from R6C3. The hint names both cells, the sum and the repeating remainder group.

HCHW's native path grows from 21 to 24 steps and its app path from 25 to 28 steps. The new partial scores are 517 and 2,097. Both paths still stall with all cells unfilled. Exact solves, candidate masks, and full trace records for Newman, Hu9m and 220V match the previous engine. The proof uses the existing 27-point Modular technique and scoring version 8. [Coverage issue](https://github.com/coder13/sudoku-app/issues/175)

### Quintuple Pattern Overlay at the later stall

The later HCHW position exposed slow searches for five compatible digit layouts. The fallback indexes the layouts by cell. After choosing a layout, it filters the remaining families and searches the one with the fewest compatible layouts first. This search remains exhaustive. The index applies to five families with at most 8,192 layouts each. Larger families use the linear search. The original witness probes run first, so quick matches avoid the index.

These are warmed WebAssembly CPU times in milliseconds, shown as median and maximum of five samples in rotating order. All three engines return the same empty Quintuple replies at both positions. The two engines with the new Modular deduction return identical complete trace and rating records for HCHW.

| Request | Previous engine | Modular deduction only | Modular deduction and indexed search |
| --- | ---: | ---: | ---: |
| Archived HCHW Quintuple scan | 26.52 / 27.77 | 29.44 / 31.34 | 26.94 / 29.52 |
| Later HCHW Quintuple scan | 2,357.63 / 2,382.68 | 2,381.01 / 2,417.21 | 448.94 / 453.88 |
| HCHW app-order rating | 990.27 / 1,039.21 | 3,606.17 / 3,658.64 | 1,668.98 / 1,672.20 |

The combined changes add 4,581 raw bytes and 5,736 gzip bytes to the app engine. A fresh Wasm instance reaches 3 MiB of linear-memory capacity on the later scan, up from 2.25 MiB without the index. To compare the two Quintuple positions, pass the older and newer Wasm artifacts to the existing benchmark. It reconstructs the archived position with Modular deductions disabled and the later position with the current app order.

```sh
node --experimental-strip-types scripts/bench-overlay-support.mjs before.wasm after.wasm --samples=5 --warmups=1 --cases=HCHW-22,HCHW-current-stall
```

### Combine repeating groups with shared houses

Two cells a multiple of three positions apart on a Modular or Entropic Line use the same digit group. If they share a house, they must use different digits. A crossed-out candidate would force its partner to repeat that digit, because the partner has no other candidate in the same group. The proof records the exact line, house, cells and candidate masks. It works with rows, columns, regions, and declared houses such as diagonals.

The [captured 28-step HCHW stall](tests/fixtures/modular-hchw-stall.json) now offers two Modular hints in Play. R1C5 only has candidates 1, 2 and 3, one per remainder group, and R1C8 shares its group and row. Remove 1, 2 and 3 from R1C8. R4C3 only has 4, 5 and 6, so it rules those digits out of R4C6 the same way. Technique Finder counts all six removals. Testing independently enumerates valid digit pairs and checks the published answer, hint text, application, undo and redo.

In a full walkthrough the detector also finds a line-and-column proof earlier in HCHW. The native path reaches 27 steps and 598 points, up from 24 and 517. The app path reaches 31 steps and 2,178 points, up from 28 and 2,097. The app path for 220V reaches 32 steps and 1,045 points, up from 29 and 980. Both puzzles still stall before placing a digit. Newman, Hu9m, Ksy3 and EoGB preserve their full app deduction sequences and scores. The technique costs stay the same and variant scoring advances to version 9 to identify the changed paths. [HCHW coverage](https://github.com/coder13/sudoku-app/issues/175)

The app still solves the published Clover and Entropic Web puzzles at Medium. Clover moves from 73 steps and 1,036 points to 75 and 1,090. Entropic Web moves from 92 and 1,573 to 93 and 1,600. Entropic Loop moves from 12 and 1,680 to 28 and 2,871, still without a placement. The Entropic Loop native path and both Entropic Hafj paths stay the same. [Entropic coverage](https://github.com/coder13/sudoku-app/issues/162)

Raw app WebAssembly grows from 4,031,922 to 4,067,229 bytes. Gzip grows from 1,065,545 to 1,068,933 bytes. On the saved HCHW position, the selected Modular request moves from zero hints to two, with a warmed median of 0.034 to 0.073 ms over 100 samples. Five alternating warmed full app traces put the HCHW median at 1.24 to 1.53 seconds, with overlapping timings. Four alternating warmed Entropic Loop traces take a median of 1.21 to 2.03 seconds as the solver explores the longer path. On the final Entropic Loop positions, the forcing searches take 431 to 536 ms in a separate diagnostic and find no move. That is the largest measured family at the stall.

### Combine repeating groups, sums, and shared houses

On the [captured 31-step HCHW position](tests/fixtures/modular-hchw-sum-house.json), assume R1C8 is 5. Its Modular partner R1C5 needs a digit from {2, 5, 8}. R1C5 has candidates 1, 2 and 3, so it would have to be 2. The adjacent sum of 7 makes R1C4 equal 5, repeating the digit in row 1. Enumerating the three domains with the sum and same remainder yields six assignments. Five respect row 1 and none of those uses 5 in R1C8.

The detector projects possible digits through a positive two-cell total, including V and X, from a same-group cell on a Modular or Entropic Line. It reports the removal only when every sum assignment for that candidate would repeat its digit in a shared house. If the house contains all three cells, it checks distinctness against both sum endpoints. Proofs identify both authored rules, the three input masks, the sum and the house. The sum partner may lie off the line. Exact solutions and starting candidates match the prior build across ten published sources.

The archived position now offers three Modular choices. They remove 5 from R1C8, 5 from R3C8, or 5 and 8 from R2C8. In the last proof, R2C8 and R5C8 share a remainder group. If R2C8 is 5 or 8, the 13 clue between R5C8 and R6C8 needs 5 and 8 in either order. Both sum cells share column 8 with R2C8, so either order repeats the assumed digit. The live trace also finds an earlier shared-house sum proof at R4C6. The app walkthrough grows from 31 steps and 2,178 points to 35 and 2,286. The native path grows from 27 steps and 598 points to 31 and 706. Both still stall without placements. The published Entropic puzzle L25 entropic (Hafj) uses two of the new V/X proofs and grows from 5 steps and 107 points to 13 steps and 309 points in both orders. It still stalls without a placement. The eight other published controls retain their full app traces and scores. [HCHW coverage](https://github.com/coder13/sudoku-app/issues/175)

Five alternating warmed HCHW app traces take a median of 2.25 seconds before and 2.69 seconds after in the same WebAssembly run. The selected Modular request at the archived 31-step position stays below 0.16 ms at the warmed median and returns three proofs instead of zero. The app Wasm drops from 4,067,229 to 4,053,828 bytes, and from 1,068,933 to 1,066,814 bytes with gzip.

At the 35-step stall, R1C2 and R4C2 share a Modular remainder group. If R1C2 were 4, R4C2 would be 1. Column 2 then requires R5C2 to use its other candidate, 3, and the adjacent 7 sum makes R6C2 equal 4. If R1C2 were 6, R4C2 would be 3 and the sum would make R6C2 equal 6. Independent enumeration gives six distinct-digit assignments across those four cells. None uses 4 or 6 in R1C2. The next proof needs the two sum cells outside the line, with the line pair and both sum cells sharing column 2.

### Quintuple Pattern Overlay after the four-cell edits

The [saved benchmark position](tests/fixtures/overlay-hchw-linked.json) starts at the 35-step stall. It applies the verified 4 and 6 removals from R1C2 and the corresponding proof for R2C2, then replays the resulting Dynamic Forcing Net elimination of 8 from R3C2. The R2C2 proof uses its same-group partner R4C1. In each case, the group and the shared house fix R5C2, and the 7 sum would make R6C2 repeat the assumed digit in column 2.

A selected Quintuple scan took 7.15 seconds of Wasm CPU in an initial probe and returned zero deductions. One native instrumented scan spent 3.01 seconds in the group for digits 4, 5, 6, 7 and 9. Digits 4 and 6 share their complete allowed-cell and layout lists, as do 7 and 9. Sharing each valid witness among interchangeable digits and choosing one layout order among the interchangeable unpinned digits brought that group's native search to 1.32 seconds. Reusing the bitset buffers and applying each cell's mask across their active words brought it to 0.56 seconds. These native timings are single measurements for the same five-digit group.

The matcher keeps the layout requirement for the candidate being tested. The app regression independently checks both four-cell eliminations and replays the forcing step. Then it verifies the empty Quintuple hints and Finder count. A native direct-enumeration test checks mixed identical domains, partial witness support, family order, changed domains and layout indices on both sides of a bitset word boundary.

Three alternating warm samples on macOS arm64 with Node 26.13 measured a median of 10,157 ms versus 1,688 ms of Wasm CPU for the selected Quintuple request. Both artifacts returned zero hints. The full edited replay fell from a median of 17,623 to 3,949 ms of Wasm CPU in the same run. The complete replay records match, including the one forcing deduction and the stalled result. The broader paired comparison also matched 640 replies across 30 positive practice positions and 13 retained corpus positions, including complete traces, ratings and hint pages. The app binary grows from 4,053,828 to 4,076,895 bytes, and from 1,066,814 to 1,070,501 bytes with gzip. The selected request used 2.5 MiB versus 2.44 MiB of Wasm linear-memory capacity.

The pre-forcing and post-forcing scans both reach the same expensive five-digit layout group. The forcing step removes one candidate for digit 8, so it leaves the allowed cells for all five digits in that group unchanged. The saved positions can also check a later optimization that retains exact group support between steps in a solve.

```sh
node --experimental-strip-types scripts/bench-overlay-support.mjs before.wasm after.wasm --samples=3 --warmups=1 --cases=HCHW-linked,HCHW-edited-tail,HCHW-current-stall,classic-quintuple-pattern-overlay,variant-quintuple-pattern-overlay
```

### Four-cell sum hints in Play

The line pair and sum can use four separate cells. For each candidate in either line cell, the detector checks the same-group candidates at its partner and both orders of the sum allowed by the domains. Every repeating digit must be justified by a recorded house. The four-cell proof carries both authored rule indices, the candidate masks, the house list and the total. Positive V and X clues use the same path.

At the [archived HCHW position](tests/fixtures/overlay-hchw-linked.json), Play offers both verified hints. The first rules out 4 and 6 from R1C2 using column 2. The second rules them out from R2C2 using column 2 and box 4. Technique Finder counts the removals. The regression checks the displayed explanations against independent enumeration, plays both hints with undo and redo, and verifies the resulting Dynamic Forcing Net move. A separate Entropic and V control checks the same proof, a restored candidate that makes an assignment possible, and a V with no shared house.

The live HCHW app path grows from 35 steps and 2,286 points to 38 steps and 3,140 points. It reaches the same candidate state as the manual experiment and still stalls without placing a digit. The native path grows from 31 steps and 706 points to 33 and 760. L25 entropic (Hafj) moves from 13 steps and 309 points to 17 steps and 417 points in both orders. The four new steps use the original V/X clues and leave its walkthrough partial. Exact solutions and starting candidates match the prior build across ten published sources.

Variant walkthroughs now retain exact overlay support for digit groups whose allowed cells are unchanged from one step to the next. Groups containing an edited digit are recomputed. Each position's full geometric witnesses are rebuilt on demand, including when an exact group is already cached. That preserves the availability of witnesses to forcing techniques and other detectors. The saved HCHW tail tests reuse across the digit 8 removal while the expensive group for 4, 5, 6, 7 and 9 stays the same.

Three warmed, alternating WebAssembly samples put HCHW's standard app walkthrough at a median of 2.21 seconds of CPU before the new hints, 4.58 seconds with the hints alone, and 4.70 seconds with the cache. The default edited replay stays near 3.1 seconds across the three builds. Median CPU times for the 220V, Hafj and Hyk5 app ratings vary by less than 1% in paired cache-only measurements. The new archived-position Modular request returns two hints in 0.11 ms at the warmed median.

In a custom profile that checks Quintuple Pattern Overlay before Dynamic Forcing Net, the overlay itself removes 8 from R3C2 at the edited position. The resulting candidate state matches the default edited replay. The cache preserves that full custom replay and cuts its median Wasm CPU time from 16.42 to 12.16 seconds. The comparison matches 640 other complete replies between the two artifacts with the new hints. The final app Wasm is 4,061,770 bytes raw and 1,082,802 bytes gzipped, a decrease of 15,125 raw bytes and an increase of 12,301 gzip bytes from the preceding local commit.

```sh
node --experimental-strip-types scripts/bench-overlay-support.mjs before-cache.wasm after-cache.wasm --samples=3 --warmups=1 --cases=HCHW-edited-tail,HCHW-overlay-first
```

The next verified deduction uses R3C2, R4C2 and R4C1 on the same Modular Line. If R3C2 were 5 or 8, its group would force R4C2 and R4C1 to be 1 and 3 in either order. Both share box 4 with R5C2, which has only 1 and 3 left. Independent enumeration excludes both candidates before the forcing step and excludes the remaining 5 at the 38-step stall. Applying the 5 removal manually gives an additional valid move without opening another step under the current profile.

### Line-and-box hints in Play

Two line cells in different repeating phases share a house with a cell outside the line. For a candidate group in the third phase, the detector checks both orders of the other two groups. If every order allowed by the line exhausts the off-line cell's candidates, it removes that group from the target. A house cell with three or more candidates always has a way to differ from two assigned digits. The proof records the line, house, four cells and their input masks. The same logic works for Modular and Entropic Lines.

On the archived HCHW position before forcing, Play offers the hint that eliminates 5 and 8 from R3C2 ahead of the forcing proof. R4C2 and R4C1 would have to use 1 and 3, leaving R5C2 with no candidate in box 4. Technique Finder counts both eliminations. The regression independently enumerates the four domains, verifies the published answer, applies the hint, and checks undo and redo. An Entropic control uses the same structure and restores support by adding a third candidate to the off-line cell.

In the live app replay, the engine finds the hint earlier and also eliminates 2 from R3C2 in the same move. It takes 37 steps and 1,867 points, compared with 38 steps and 3,140 points before this hint. The new path reaches the previous stall with 5 also removed from R3C2. The native path grows from 33 steps and 760 points to 34 and 787. Both remain partial, with no placements. The nine other published controls keep their full app traces and scores. All ten keep their exact solutions and starting candidates.

Five alternating warmed WebAssembly samples put the median CPU time for the normal HCHW walkthrough at 4,099 ms before and 1,679 ms after. From the archived position before forcing, it falls from 2,910 to 773 ms. That replay now uses one 27-point Modular hint instead of the prior 800-point forcing step. The selected Modular request returns the new proof in 0.13 ms at the warmed median. The app Wasm grows by 23,043 raw bytes and shrinks by 5,241 gzip bytes.

The full Play request for up to ten hints at the archived position still scans higher tiers for additional choices. One paired run took 26.4 seconds before and 27.1 seconds after, returning one forcing hint before and the new Modular hint followed by the forcing hint after. The rating and selected-technique timings measure different requests.

### Ranked hints after the linked-sum edits

A per-technique scan at the archived HCHW position attributed 11.8 seconds of Wasm CPU to Quintuple Pattern Overlay. Each other technique finished in under 80 ms in that scan. The full Play request scans additional tiers to fill the requested list. Its 8 removal from Dynamic Forcing Net already covers the same action as the Quintuple proof.

After the quick layout probes, Quintuple Pattern Overlay can search cell assignments directly. It chooses the most constrained house for its remaining digits, respects extra equal-digit exclusions, and assigns at most one digit to a cell. A complete search either finds a compatible packing or proves the pinned candidate has none. A 1,024-node cap per candidate and 4,096-node cap per group preserve the existing indexed or exhaustive layout fallback. The proof and scoring rules use the same exact support.

Across three alternating samples after one warmup on arm64 macOS, the median Wasm CPU time for Play's up-to-ten request fell from 23,090 to 580 ms. Both builds return the same Modular and Dynamic Forcing Net choices, with identical actions and evidence. The selected Quintuple request falls from 18,315 to 131 ms and retains its complete proof. The complete 37-step walkthrough from givens matches across five pairs, with median CPU time falling from 1,492 to 1,366 ms. Peak Wasm linear memory stays at 6,225,920 bytes for the ranked request.

The overlay comparison matches 640 complete responses, including 30 positive practice positions and 13 corpus positions. The Murphy X-Sums full scan keeps all 179 choices and moves from 429 to 444 ms median CPU across five pairs. Its five Quintuple proofs still match, with medians of 313 and 310 ms. In ten warm positive practice pairs, median CPU time moves from 36.4 to 39.9 ms for Classic and from 2.5 to 3.0 ms for the variant exercise. Wasm grows from 4,084,813 to 4,088,642 raw bytes and from 1,077,561 to 1,081,541 gzip bytes.

```sh
node --experimental-strip-types scripts/bench-overlay-support.mjs before.wasm after.wasm --samples=3 --warmups=1 --cases=HCHW-ranked-hints,HCHW-edited-quintuple,HCHW-edited-tail
node --experimental-strip-types scripts/bench-overlay-support.mjs before.wasm after.wasm --samples=5 --warmups=1 --cases=HCHW-app-walkthrough,Murphy-full,Murphy-quintuple
node --experimental-strip-types scripts/compare-overlay-engines.mjs before.wasm after.wasm
```

### Two adjacent sums on the same row

At the 37-step stall, the 13 sum between R1C3 and R1C4 and the 7 sum between R1C4 and R1C5 make R1C3 six greater than R1C5. R1C8 shares a Modular group with R1C5. In row 1 it must differ from both R1C5 and R1C3.

R1C5 can be 1, 2 or 3. If it were 2, R1C8 could only be 8, repeating R1C3. If R1C5 is 1 or 3, R1C8 must be 4 or 6 respectively, and R1C4 uses the other digit in that pair. Row 1 therefore reserves 4 and 6 for R1C4 and R1C8.

The engine enumerates the possible first digits and derives the two sum partners. It checks that all four cells can use different digits in their shared house. Proofs report additional removals and reserved digits that require the line's group relation. Play can explain the rejected choice for R1C5 and why 4 and 6 occupy two of the four cells in every valid assignment.

The archived hint removes 8 from R1C3, 5 from R1C4, 2 from R1C5, and 7, 8, and 9 from R1C8. The same restriction also removes 4 and 6 from R1C1, R1C6, R1C7, and R1C9, for 14 removals in total. Technique Finder counts all 14. The test checks the printed rules and enumerates the four-cell assignments independently, then verifies the displayed explanation, applying the hint, undo, redo, and the eight correct placements that follow. An Entropic control uses linked positive V and X clues from one rule and drops the proof when only a negative marking remains for the X.

From givens, both configured profiles first use the hint at step 29. It removes 16 candidates there, since R1C2 still lists both 4 and 6. The app walkthrough grows from 37 steps and 1,867 points to 81 steps and 6,821 points, with eight correct placements before a new stall. The engine's standard order still stalls after 34 steps and 787 points. It uses the new hint but makes no placements. Eight other published controls keep full app traces and scores. All nine keep their exact solutions and initial candidate masks.

Across five alternating warm Wasm samples, app walkthrough CPU time falls from 1,393 to 627 ms on HCHW. The full ranked hint request at the old stall falls from 1,238 to 614 ms while gaining the new choice. The published Newman control runs at medians of 2.39 and 2.34 ms with identical traces. App Wasm changes from 4,088,642 to 4,061,391 raw bytes and from 1,081,541 to 1,084,332 gzip bytes. The unpublished variant scoring version remains 9.

### Linked sums across houses

At the 81-step stall, R2C6 can be 7 or 9. The 13 sum through R3C6 makes R3C6 6 or 4 respectively. The 7 sum through that same cell makes R3C5 1 or 3. R3C8 shares a Modular group with R2C6. When R2C6 is 7, row 3 rules out 1 in R3C8 because R3C5 already uses 1. When R2C6 is 9, the Modular group rules out 1 directly. The same reasoning rules out 3. The core cells use both box 2 and row 3, which calls for a proof that can combine their separate house restrictions.

Independent enumeration finds four further removals from other pairs of sums and lines in the same position. Applying all six removals manually opens six more app steps and reaches another stall without a placement.

## Reproduce

```sh
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv --renban --entropic-corpus --global-entropy-corpus --modular
SUDOKU_BENCH_FAMILY=modular node --experimental-strip-types --test scripts/bench-entropic-app.mts
```

The comparison expects only the new Modular catalog entry. It uses explicit retained technique profiles and compares complete replies without normalizing deductions, ratings or exact results.
