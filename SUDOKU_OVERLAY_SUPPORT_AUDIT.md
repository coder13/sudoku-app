# Dense Pattern Overlay support audit

This work starts from main `5aca356`, after the rectangle graph release, and integrates the device-sync release at main `3b0671f`. Its shipping Rust sources and Wasm build profiles are unchanged; a fresh baseline build reproduces the pinned rectangle-release artifact. [Issue 179](https://github.com/coder13/sudoku-app/issues/179) preserves the complete HCHW position before app replay step 22. Its Quintuple Pattern Overlay scan returns no proofs despite expensive support searches. All original Modular paths, two-cell totals, the white dot, entries and explicit removals remain intact.

Merged through [PR 182](https://github.com/coder13/sudoku-app/pull/182) at `5db80294fb8fa9ba30aacdbcb4335a79e51ba097` on November 18, 2026. Every PR CI and deployment check passed on reviewed engine head `337b7e742a0f930acd722de27209752db3088248` in [run 44432001118](https://github.com/coder13/sudoku-app/actions/runs/44432001118). Fetched main contains both commits. Its complete Rust, scripts and shared engine-call sources match the reviewed revision. Independent app changes in PRs 184–186 remain intact; the PR CI merge includes 184/185, while post-merge integration checks cover 186.

## Measured cause

Temporary native instrumentation isolates nine five-digit groups. Each spends roughly 3–4 seconds finding support for a middle digit, 4, 5 or 6, in R7C1. The remaining digits are one of 1–3 and all of 7–9. The one-digit template families contain 2437–7808 layouts. Narrower support has already removed every layout those smaller scopes can reject; filtering those layouts again does not remove the expensive combinations.

The original search fixes the queried digit's entire nine-cell template before choosing the other digits. Counting the most constrained remaining family leaves this case near its original cost. A separate native probe uses the same validated template generator and directly checks each returned witness against domains, all houses and the thirteen extra equal-digit exclusions. The original order is still inconclusive after five million inspected layouts. Choosing the queried digit last finds a witness after 3878 checks. These are diagnostic work counts, not paired app latency measurements.

## Complete support and proof boundaries

The private packing module reserves only the candidate's cell while choosing the other digit patterns. It then checks a full pattern for the queried digit. A complete, disjoint witness certifies each of its candidate placements under the selected scope.

A first probe permits 64 accepted branches in the original order, preserving its quick witnesses. Only an inconclusive first probe tries the alternate order, which permits at most 4,096 inspected layouts, including rejected patterns. If both probes are inconclusive, the original unrestricted, target-first search runs. A completed negative result requires exhaustive enumeration. The public operation always returns complete support; this change adds no public budget, truncated count or inconclusive proof result.

All selected digits remain in the witness. The outer search keeps its narrower-scope exclusions and original proof enumeration. These witnesses remain local to their digit group and never seed the separate full-grid completion cache. Candidate edits, geometry, eligibility, point costs, scoring version 8 and enabled-technique semantics keep their existing contracts.

## Independent controls

The packing tests enumerate complete small assignments independently of both traversal orders, candidate pinning and witness seeds. They cover changed domains, reversed digit families, valid partial seeds, empty families, two through five digits, bits on both sides of bit 64, and independent zero, small and production allowances for both probes. A five-family/four-site contradiction requires the full scope; adding a fifth site restores support.

The [dense fixture](tests/fixtures/overlay-dense.json) preserves the original source reference, replay fields, public domains, extra exclusions and a supplied five-digit witness. Direct numeric checks validate the supplied witness and each returned witness for all nine slow candidate/group combinations. The source remains in [the full Modular corpus](tests/fixtures/modular-coach.json).

The final fast path passes all 366 native unit/integration/documentation cases. Exact-head CI also passes sixteen capability combinations, four package profiles, strict full/reduced Cargo documentation, TypeScript, all 534 app tests and 317 Wasm contracts. The production build emits all 169 routes. All 12341 complete variant replies and 148 Classic replies agree, across 83 corpus positions, 363 positive practice positions, all 121 detectors and every hint page. Additional reduced packages match 26 complete variant and 10 Classic replies while rejecting omitted generation/teaching capabilities. The actual-Wasm regression retains normalized source rules, the exact replay and domains, all three one-digit deductions, empty higher-width proofs, app Finder counts, empty hint pages and edited positions. No temporary instrumentation or trial family-ordering code ships.

## Fast-control regression found before release

The first paired run reduced the saved dense request from 61.5–62.0 seconds to 115–124 ms, but prefixes 23/24 rose from roughly 9–11 ms to 49–63 ms and the final stall from 6 ms to 18 ms. That candidate is not released. The revised search tries the original order first and caps alternate work by inspected layouts. The final original-order fast path restores the nearby warmed controls, as measured below. The empty-Classic benchmark also preserves the public `multiple` validation result rather than assuming an empty proof list.

## Measurement method and artifacts

The paired controls use Node 26.13.0, Rust 1.100.0 (`0ef1bc386`, November 9, 2026) and macOS arm64. Fresh engine instances isolate cases and execution order alternates between artifacts. Timings include request serialization. Assertions compare complete replies outside timing. Instantiation, worker startup/transfer, browser layout and paint are excluded. No audit-owned compiler, test or other benchmark runs concurrently during these measurements; the host is not dedicated. Small-sample p95 is the maximum.

The fresh main `3b0671f` baseline reproduces app SHA-256 `e8d58bcb5560534e21c92ded22aec77bdf6411c5e4d174a84dc94381bb84ea07`. The final reviewed artifact is `d5bf3ebcd76528c51901498889bcd6d35ef1d9487051a147b6463b794abfd045`. Both Cargo targets are separate. The final production rebuild preserves that artifact and all five generated JSON files. Source fixtures, technique orders, budgets, complete response comparisons and benchmark scripts remain reproducible in the repository.

## Dense and edited-position controls

The [overlay benchmark](scripts/bench-overlay-support.mjs) preserves the complete HCHW source and derives each edited position through the baseline app replay. The first paired run has two samples and no warmups. These are the raw first/second request times, not a warmed latency distribution. Every result is the same complete empty proof list.

| Position | Main first / second ms | Revised first / second ms | Committed MiB, both |
| --- | --- | --- | --- |
| HCHW-22 | 61187.894/62793.511 | 26.031/18.893 | 2.375 |
| HCHW-23 | 11.941/11.080 | 12.086/11.770 | 2.375 |
| HCHW-24 | 9.679/14.903 | 17.061/11.815 | 2.25 |
| HCHW-25 | 1392.879/25.916 | 94.803/28.384 | 2.25 |

The final-stall cold control includes a 1392.879 ms baseline outlier. A separate run repeats the nearby positions with two warmups and seven measured samples; median/p95 values follow. These warmed controls resolve the earlier fast-path regression.

| Position | Main → revised median/p95 ms |
| --- | --- |
| HCHW-23 | 10.442/10.580 → 10.531/10.728 |
| HCHW-24 | 9.172/9.288 → 9.262/9.329 |
| HCHW-25 | 5.902/6.067 → 5.879/6.088 |

All five Classic and variant widths retain their published positive proofs. The same two-warmup/seven-sample method reports every control, including the existing `multiple` validation rejection for empty Classic grids. Some small positive controls are slower; no general overlay speedup is claimed.

| Control | Proofs or error | Main → revised median/p95 ms |
| --- | --- | --- |
| classic-pattern-overlay | 1 | 0.269/0.341 → 0.279/0.395 |
| variant-pattern-overlay | 2 | 1.302/2.528 → 1.524/2.063 |
| empty-pattern-overlay | multiple | 0.036/0.046 → 0.038/0.040 |
| classic-pairwise-pattern-overlay | 1 | 0.471/0.827 → 0.455/0.935 |
| variant-pairwise-pattern-overlay | 1 | 0.805/1.324 → 0.782/1.513 |
| empty-pairwise-pattern-overlay | multiple | 0.043/0.060 → 0.049/0.068 |
| classic-triple-pattern-overlay | 2 | 0.721/1.438 → 0.944/1.146 |
| variant-triple-pattern-overlay | 2 | 1.264/2.242 → 1.068/1.935 |
| empty-triple-pattern-overlay | multiple | 0.038/0.042 → 0.041/0.112 |
| classic-quadruple-pattern-overlay | 9 | 27.268/29.954 → 28.522/31.512 |
| variant-quadruple-pattern-overlay | 9 | 1.820/1.947 → 2.153/2.946 |
| empty-quadruple-pattern-overlay | multiple | 0.036/0.038 → 0.041/0.044 |
| classic-quintuple-pattern-overlay | 3 | 20.197/22.601 → 20.171/23.003 |
| variant-quintuple-pattern-overlay | 3 | 1.688/1.729 → 1.840/2.064 |
| empty-quintuple-pattern-overlay | multiple | 0.039/0.044 → 0.040/0.043 |

## Rectangle and Classic controls

The [rectangle benchmark](scripts/bench-variant-graphs.mjs) retains complete proof lists in both technique orders. Two warmups and seven samples cover the opening, native/app stalls and all three published positive inference shapes. Each row preserves its complete result.

| Position | Request | Main → revised median/p95 ms |
| --- | --- | --- |
| HCHW-opening | rectangle-inferences | 96.543/101.153 → 95.825/106.560 |
| HCHW-opening | reversed-rectangle-inferences | 95.604/133.155 → 95.195/114.874 |
| HCHW-opening | app-rate | 614.056/621.527 → 611.047/625.896 |
| HCHW-opening | exhaustive | 92.796/93.000 → 92.594/94.166 |
| HCHW-native-stall | rectangle-inferences | 40.744/41.198 → 41.098/41.445 |
| HCHW-native-stall | reversed-rectangle-inferences | 41.050/41.420 → 41.111/41.210 |
| HCHW-native-stall | app-rate | 609.916/634.186 → 603.791/612.435 |
| HCHW-native-stall | exhaustive | 199.438/204.267 → 198.905/203.143 |
| HCHW-app-stall | rectangle-inferences | 35.147/35.529 → 35.413/36.100 |
| HCHW-app-stall | reversed-rectangle-inferences | 35.049/35.776 → 35.274/35.823 |
| HCHW-app-stall | app-rate | 147.119/158.534 → 148.007/217.220 |
| HCHW-app-stall | exhaustive | 147.981/152.249 → 148.619/150.907 |
| unique-rectangle-aic-published | rectangle-inferences | 0.723/0.807 → 0.734/0.857 |
| unique-rectangle-aic-published | reversed-rectangle-inferences | 0.678/0.822 → 0.678/0.926 |
| unique-rectangle-continuous-nice-loop-published | rectangle-inferences | 5.208/6.748 → 5.301/6.049 |
| unique-rectangle-continuous-nice-loop-published | reversed-rectangle-inferences | 5.081/5.423 → 5.044/5.233 |
| unique-rectangle-discontinuous-nice-loop-published | rectangle-inferences | 0.568/0.622 → 0.570/0.656 |
| unique-rectangle-discontinuous-nice-loop-published | reversed-rectangle-inferences | 0.535/0.680 → 0.535/0.687 |

The corresponding positive Classic calls retain every proof too.

| Published case | Request | Main → revised median/p95 ms |
| --- | --- | --- |
| unique-rectangle-aic-published | classic-rectangle-inferences | 1.167/1.453 → 1.289/2.659 |
| unique-rectangle-aic-published | classic-reversed-rectangle-inferences | 1.128/1.182 → 1.228/1.304 |
| unique-rectangle-continuous-nice-loop-published | classic-rectangle-inferences | 10.622/11.533 → 10.925/12.266 |
| unique-rectangle-continuous-nice-loop-published | classic-reversed-rectangle-inferences | 10.949/11.704 → 10.759/11.127 |
| unique-rectangle-discontinuous-nice-loop-published | classic-rectangle-inferences | 0.670/0.742 → 0.700/0.776 |
| unique-rectangle-discontinuous-nice-loop-published | classic-reversed-rectangle-inferences | 0.709/0.861 → 0.699/0.975 |

## Broad paired request controls

All 231 request comparisons across thirty-three puzzles retain their complete responses. Fixed candidates, exact calls, native ratings and ordinary hints use five warmups/twenty samples. App ratings and extended exhaustive calls use two/five; the nine core exhaustive cases use two/ten. The six XV and eighteen extended sources also retain complete ordered traces. There is no change to costs, default/custom orders, eligibility or scoring version 8.

| Source | Candidates | Exact analysis | Exact solve | Native rating |
| --- | --- | --- | --- | --- |
| quadruple | 0.055/0.065 → 0.056/0.068 | 0.399/0.449 → 0.397/0.452 | 0.303/0.318 → 0.304/0.316 | 1.099/1.148 → 1.107/1.204 |
| parity | 0.019/0.027 → 0.018/0.042 | 0.030/0.040 → 0.029/0.042 | 0.027/0.031 → 0.028/0.033 | 0.130/0.150 → 0.133/0.147 |
| anti-king | 0.015/0.016 → 0.015/0.020 | 0.021/0.023 → 0.022/0.024 | 0.021/0.023 → 0.022/0.023 | 0.154/0.278 → 0.144/0.196 |
| non-consecutive | 0.020/0.020 → 0.020/0.020 | 0.098/0.103 → 0.095/0.096 | 0.097/0.099 → 0.096/0.097 | 0.354/0.365 → 0.350/0.357 |
| nc-white-dots | 0.050/0.054 → 0.052/0.057 | 0.318/0.328 → 0.309/0.330 | 0.320/0.358 → 0.309/0.341 | 0.986/1.059 → 0.988/1.032 |
| whispers | 0.018/0.019 → 0.018/0.020 | 14.686/15.116 → 14.374/14.980 | 14.763/15.266 → 14.430/15.270 | 0.283/0.300 → 0.281/0.294 |
| palindrome | 0.019/0.035 → 0.019/0.035 | 0.037/0.037 → 0.036/0.048 | 0.038/0.040 → 0.038/0.039 | 0.111/0.169 → 0.109/0.168 |
| palindrome-knight | 0.034/0.079 → 0.037/0.092 | 0.054/0.133 → 0.059/0.156 | 0.080/0.166 → 0.080/0.209 | 1.066/1.231 → 1.047/1.175 |
| palindrome-whispers | 0.027/0.030 → 0.027/0.033 | 0.495/0.555 → 0.488/0.580 | 0.107/0.140 → 0.106/0.139 | 0.805/0.888 → 0.803/0.885 |
| xv-clover | 0.025/0.029 → 0.023/0.030 | 0.079/0.087 → 0.078/0.085 | 0.053/0.092 → 0.054/0.153 | 0.343/0.493 → 0.368/0.501 |
| xv-quadruple-clover | 0.027/0.035 → 0.027/0.029 | 0.111/0.154 → 0.111/0.122 | 0.103/0.196 → 0.102/0.176 | 0.290/0.342 → 0.289/0.428 |
| 7v7n | 0.018/0.111 → 0.018/0.072 | 0.460/0.625 → 0.456/0.602 | 0.141/0.164 → 0.142/0.155 | 0.119/0.130 → 0.122/0.128 |
| FCeS | 0.022/0.029 → 0.022/0.038 | 0.081/0.090 → 0.081/0.093 | 0.085/0.089 → 0.084/0.090 | 0.537/0.624 → 0.529/0.610 |
| 63Jk | 0.010/0.011 → 0.010/0.011 | 0.045/0.069 → 0.046/0.100 | 0.036/0.037 → 0.038/0.039 | 1.041/1.194 → 1.026/1.165 |
| Chcs | 0.025/0.032 → 0.026/0.029 | 1.242/1.426 → 1.260/1.456 | 0.688/0.716 → 0.693/0.731 | 22.251/22.727 → 22.208/22.853 |
| renban-clover | 0.051/0.213 → 0.055/0.510 | 0.274/0.430 → 0.275/0.507 | 0.203/0.421 → 0.200/0.382 | 0.413/1.001 → 0.447/2.059 |
| renban-killer-clover | 0.041/0.044 → 0.041/0.043 | 0.216/0.317 → 0.209/0.268 | 0.220/0.432 → 0.232/0.425 | 0.341/0.569 → 0.324/0.548 |
| entropic-clover | 0.022/0.028 → 0.023/0.029 | 0.060/0.093 → 0.064/0.097 | 0.100/0.115 → 0.101/0.117 | 0.163/0.362 → 0.188/0.713 |
| global-entropy-newman | 0.018/0.051 → 0.020/0.060 | 0.189/0.552 → 0.156/1.860 | 0.187/0.337 → 0.151/0.273 | 0.344/0.508 → 0.249/0.578 |
| renban-Jh4o | 0.058/0.063 → 0.057/0.067 | 1.233/1.887 → 1.280/1.720 | 0.322/0.418 → 0.324/0.384 | 0.245/0.329 → 0.243/0.346 |
| renban-KUUo | 0.018/0.018 → 0.018/0.018 | 0.138/0.139 → 0.138/0.142 | 0.066/0.066 → 0.066/0.066 | 0.089/0.104 → 0.089/0.102 |
| renban-BSms | 0.023/0.027 → 0.024/0.024 | 738.319/1126.069 → 739.769/1136.581 | 43.719/44.916 → 43.498/45.507 | 0.072/0.120 → 0.068/0.112 |
| entropic-EoGB | 0.010/0.010 → 0.010/0.010 | 0.037/0.037 → 0.037/0.037 | 0.037/0.037 → 0.037/0.039 | 0.088/0.112 → 0.085/0.130 |
| entropic-BSEJ | 0.015/0.018 → 0.015/0.016 | 0.101/0.132 → 0.101/0.114 | 0.089/0.090 → 0.089/0.090 | 0.063/0.065 → 0.063/0.068 |
| entropic-Hyk5 | 0.015/0.032 → 0.015/0.021 | 7.971/8.667 → 8.077/8.664 | 2.933/3.329 → 3.039/3.212 | 0.085/0.091 → 0.087/0.093 |
| entropic-Hafj | 0.016/0.018 → 0.015/0.016 | 0.875/0.956 → 0.865/0.972 | 0.794/0.846 → 0.812/0.847 | 0.074/0.078 → 0.075/0.090 |
| entropic-Ksy3 | 0.066/0.069 → 0.065/0.070 | 0.248/0.328 → 0.250/0.299 | 0.244/0.275 → 0.245/0.286 | 0.471/0.534 → 0.469/0.549 |
| global-entropy-A2s7 | 0.038/0.047 → 0.038/0.044 | 134.659/376.541 → 110.094/153.613 | 115.993/154.633 → 103.141/248.817 | 2.565/3.466 → 2.573/3.392 |
| global-entropy-CJhv | 0.056/0.069 → 0.054/0.067 | 176.424/212.183 → 166.993/194.672 | 48.087/62.517 → 47.961/67.018 | 2.833/3.342 → 2.961/3.797 |
| global-entropy-AdoP | 0.046/0.071 → 0.045/0.060 | 0.156/0.163 → 0.156/0.163 | 0.158/0.198 → 0.158/0.195 | 0.196/0.200 → 0.195/0.198 |
| modular-newman | 0.019/0.028 → 0.020/0.026 | 0.060/0.060 → 0.060/0.061 | 0.060/0.064 → 0.061/0.063 | 0.131/0.177 → 0.128/0.138 |
| modular-Hu9m | 0.052/0.065 → 0.053/0.060 | 0.241/0.272 → 0.242/0.315 | 0.244/0.247 → 0.247/0.250 | 0.638/1.053 → 0.645/0.795 |
| modular-HCHW | 0.033/0.034 → 0.033/0.041 | 0.229/0.232 → 0.231/0.235 | 0.114/0.117 → 0.114/0.117 | 0.174/0.182 → 0.175/0.182 |

| Source | App rating | Ten hints | Exhaustive hints |
| --- | --- | --- | --- |
| quadruple | 1.139/1.199 → 1.135/1.214 | 0.222/0.230 → 0.216/0.250 | 51.858/54.242 → 51.504/52.558 |
| parity | 0.176/0.188 → 0.172/0.184 | 0.081/0.088 → 0.081/0.085 | 36.607/38.236 → 36.265/41.372 |
| anti-king | 0.155/0.168 → 0.155/0.163 | 0.120/0.123 → 0.120/0.123 | 98.838/106.144 → 98.678/100.082 |
| non-consecutive | 0.407/0.463 → 0.402/0.465 | 0.082/0.086 → 0.083/0.086 | 34.621/36.617 → 34.606/36.312 |
| nc-white-dots | 1.026/1.096 → 1.023/1.091 | 0.320/0.347 → 0.315/0.338 | 0.327/0.350 → 0.324/0.337 |
| whispers | 0.314/0.365 → 0.315/0.414 | 3.334/3.840 → 3.257/3.850 | 3.519/4.128 → 3.317/3.925 |
| palindrome | 0.133/0.210 → 0.131/0.217 | 47.271/75.230 → 45.688/68.014 | 50.130/62.208 → 49.165/54.051 |
| palindrome-knight | 1.099/1.525 → 1.079/1.318 | 0.154/0.208 → 0.153/0.186 | 189.711/227.941 → 196.386/546.799 |
| palindrome-whispers | 112.271/120.598 → 112.099/120.140 | 0.260/0.296 → 0.263/0.370 | 2.964/3.156 → 2.895/3.038 |
| xv-clover | 6.488/7.263 → 6.700/7.295 | 0.363/0.628 → 0.381/1.557 | 48.735/54.270 → 48.587/49.953 |
| xv-quadruple-clover | 0.330/0.337 → 0.330/0.334 | 0.156/0.255 → 0.152/0.262 | 53.569/58.057 → 53.805/54.110 |
| 7v7n | 81.606/83.926 → 82.621/90.448 | 99.378/107.176 → 99.873/105.315 | 98.266/100.840 → 97.239/100.331 |
| FCeS | 7.680/8.082 → 7.607/7.994 | 0.121/0.137 → 0.118/0.128 | 0.867/0.949 → 0.863/0.972 |
| 63Jk | 4049.740/4340.632 → 3957.160/4297.289 | 0.117/0.179 → 0.117/0.158 | 344.364/369.408 → 339.815/350.368 |
| Chcs | 117.985/131.982 → 116.305/133.444 | 319.570/475.207 → 304.021/460.038 | 237.141/240.782 → 224.137/285.164 |
| renban-clover | 0.629/1.186 → 0.537/1.005 | 0.196/3.540 → 0.251/1.624 | 129.921/163.271 → 128.231/139.185 |
| renban-killer-clover | 0.360/1.303 → 0.363/0.757 | 0.204/0.479 → 0.213/0.519 | 87.954/282.467 → 90.495/107.407 |
| entropic-clover | 0.199/0.717 → 0.201/2.070 | 0.240/0.573 → 0.191/0.579 | 116.355/141.591 → 130.402/149.838 |
| global-entropy-newman | 0.331/0.715 → 0.295/0.419 | 0.115/0.265 → 0.114/0.317 | 79.642/85.907 → 81.793/84.561 |
| renban-Jh4o | 970.717/1348.415 → 935.038/970.172 | 57.174/61.797 → 57.589/62.466 | 75.506/76.349 → 76.536/78.120 |
| renban-KUUo | 73.903/75.879 → 72.999/75.499 | 0.098/0.364 → 0.097/0.110 | 52.867/55.386 → 52.442/57.889 |
| renban-BSms | 68.515/69.747 → 68.600/72.432 | 87.196/98.095 → 86.183/95.835 | 88.763/93.889 → 87.074/97.041 |
| entropic-EoGB | 0.130/0.253 → 0.127/0.133 | 3.047/3.717 → 3.062/3.989 | 109.701/112.712 → 111.230/122.166 |
| entropic-BSEJ | 0.258/0.262 → 0.251/0.258 | 90.280/130.910 → 93.637/185.877 | 87.094/97.016 → 89.162/95.546 |
| entropic-Hyk5 | 1043.206/1830.132 → 1043.075/2023.622 | 4.003/4.294 → 4.278/4.873 | 4.084/4.467 → 4.240/4.516 |
| entropic-Hafj | 105.072/105.848 → 104.451/106.738 | 3.234/3.320 → 3.236/3.330 | 3.287/3.382 → 3.258/3.376 |
| entropic-Ksy3 | 0.549/0.641 → 0.573/0.734 | 0.171/0.175 → 0.171/0.176 | 932.471/946.631 → 949.242/2484.326 |
| global-entropy-A2s7 | 238.433/345.295 → 209.190/216.920 | 0.286/0.373 → 0.281/0.346 | 0.949/1.454 → 0.955/1.475 |
| global-entropy-CJhv | 205.713/243.671 → 236.409/266.994 | 0.223/0.254 → 0.223/0.286 | 0.471/0.474 → 0.475/0.528 |
| global-entropy-AdoP | 0.348/0.357 → 0.339/0.356 | 0.182/0.202 → 0.182/0.197 | 127.435/133.581 → 126.186/129.617 |
| modular-newman | 0.176/0.180 → 0.174/0.178 | 0.096/0.151 → 0.097/0.144 | 60.218/62.703 → 60.655/61.653 |
| modular-Hu9m | 0.716/0.741 → 0.714/0.768 | 0.190/0.199 → 0.189/0.194 | 0.498/1.088 → 0.488/0.632 |
| modular-HCHW | 747.496/754.252 → 761.399/803.981 | 0.157/0.176 → 0.158/0.260 | 119.540/129.420 → 124.493/125.866 |

The initial run has slow Entropic Clover exhaustive, CJhv rating and Palindrome/Knight tail samples. Focused repeats retain the original data and test the unresolved controls. Entropic Clover returns to 69.616/74.901 → 67.589/69.487 ms. Palindrome/Knight exhaustive changes from 173.524/179.569 → 175.816/178.827 ms. CJhv rating remains slower, at 174.813/178.276 → 187.371/189.106 ms, about 7% in median. Its exact costs remain near baseline. This is an explicit release tradeoff and a follow-up under [issue 88](https://github.com/coder13/sudoku-app/issues/88), not evidence of a general rating improvement.

| Repeated source | Request | Main → revised median/p95 ms |
| --- | --- | --- |
| entropic-clover | candidates | 0.025/0.035 → 0.025/0.030 |
| entropic-clover | analyze | 0.104/0.109 → 0.087/0.091 |
| entropic-clover | solve | 0.046/0.048 → 0.047/0.049 |
| entropic-clover | native-rate | 0.189/0.514 → 0.197/0.477 |
| entropic-clover | app-rate | 0.206/0.749 → 0.213/0.577 |
| entropic-clover | ten-hints | 0.212/0.522 → 0.200/0.261 |
| entropic-clover | exhaustive | 69.616/74.901 → 67.589/69.487 |
| global-entropy-A2s7 | candidates | 0.028/0.034 → 0.027/0.035 |
| global-entropy-A2s7 | analyze | 37.035/37.750 → 37.176/38.047 |
| global-entropy-A2s7 | solve | 33.091/33.549 → 33.340/33.895 |
| global-entropy-A2s7 | native-rate | 1.037/1.069 → 1.048/1.082 |
| global-entropy-A2s7 | app-rate | 88.496/88.995 → 80.845/82.019 |
| global-entropy-A2s7 | ten-hints | 0.158/0.217 → 0.162/0.234 |
| global-entropy-A2s7 | exhaustive | 0.471/0.489 → 0.474/0.506 |
| global-entropy-CJhv | candidates | 0.031/0.038 → 0.031/0.038 |
| global-entropy-CJhv | analyze | 81.464/93.521 → 81.346/97.227 |
| global-entropy-CJhv | solve | 36.663/40.585 → 36.936/39.161 |
| global-entropy-CJhv | native-rate | 2.091/2.344 → 2.100/2.374 |
| global-entropy-CJhv | app-rate | 174.813/178.276 → 187.371/189.106 |
| global-entropy-CJhv | ten-hints | 0.183/0.242 → 0.183/0.230 |
| global-entropy-CJhv | exhaustive | 0.398/0.431 → 0.389/0.442 |

## Seeded generation

The nine retained recipes use seeds 1–20, six attempts, 20,000 nodes per exact check, the same explicit legacy technique order and no warmups. All 180 complete outcomes agree. Both artifacts accept 179 puzzles, and both reach the same budget on Renban seed 10. Accepted puzzles retain their distinctness. These are compatibility recipes, not calibration for very hard generation.

| Family | Accepted, main/revised | Failed seeds | Main → revised median/p95 ms |
| --- | --- | --- | --- |
| classic | 20 / 20 | [] | 0.771/1.243 → 0.793/0.956 |
| x-sudoku | 20 / 20 | [] | 0.793/1.148 → 0.790/1.114 |
| killer | 20 / 20 | [] | 3.265/4.353 → 3.254/3.985 |
| jigsaw-killer | 20 / 20 | [] | 3.052/3.488 → 3.047/4.302 |
| windoku | 20 / 20 | [] | 1.013/2.586 → 1.004/2.338 |
| renban | 19 / 19 | [10] | 122.032/357.337 → 121.161/352.106 |
| entropic | 20 / 20 | [] | 4.613/17.651 → 5.218/18.900 |
| global-entropy | 20 / 20 | [] | 4.417/47.410 → 4.465/46.039 |
| modular | 20 / 20 | [] | 2.527/9.514 → 2.579/8.613 |

## Actual app callers

The six family/engine processes run sequentially with identical pinned `3b0671f` JavaScript and select only the Wasm artifact. They cover thirteen complete original sources through import previews with ratings, Play candidates, ordinary hints, walkthroughs, input cleanup and Board SSR. Complete/partial walkthrough outcomes, versioned scores, hint counts and independently checked exact completions agree. Previews/hints/walkthroughs use two warmups/five samples; candidates/input/SSR use five/twenty. This in-process transport excludes browser worker startup, transfer and live rendering. Sequential before/after timings have more host variation than alternating raw calls.

| Family/source | Preview with rating | Play candidates | Ordinary hints | Walkthrough | Input/candidates | Board SSR |
| --- | --- | --- | --- | --- | --- | --- |
| modular/newman | 0.482/0.517 → 0.338/0.349 | 0.034/0.041 → 0.022/0.026 | 0.298/0.691 → 0.207/1.283 | 2.590/3.437 → 1.668/2.099 | 0.119/0.129 → 0.057/0.068 | 2.593/3.328 → 1.663/1.984 |
| modular/Hu9m | 1.814/2.136 → 1.249/1.650 | 0.060/0.067 → 0.045/0.053 | 0.256/0.271 → 0.197/0.207 | 5.169/6.728 → 3.811/4.878 | 0.215/0.279 → 0.149/0.202 | 1.855/2.143 → 1.331/1.449 |
| modular/HCHW | 604.824/631.699 → 611.908/651.407 | 0.027/0.033 → 0.031/0.033 | 0.164/0.230 → 0.184/0.240 | 598.961/654.439 → 721.397/883.859 | 0.289/0.382 → 0.374/0.466 | 2.072/2.392 → 5.016/12.368 |
| entropic/clover | 0.448/0.474 → 0.373/0.519 | 0.031/0.036 → 0.026/0.032 | 0.352/0.443 → 0.307/0.667 | 4.496/7.451 → 2.584/2.684 | 0.130/0.459 → 0.070/0.121 | 5.216/18.597 → 2.384/4.224 |
| entropic/EoGB | 1.449/1.730 → 0.934/1.235 | 0.020/0.033 → 0.020/0.033 | 11.195/32.245 → 4.096/4.370 | 11.633/21.341 → 4.365/7.156 | 0.043/0.104 → 0.038/0.082 | 3.815/10.355 → 2.375/3.779 |
| entropic/BSEJ | 1.734/6.697 → 0.827/1.250 | 0.047/0.129 → 0.026/0.036 | 139.652/143.749 → 165.300/466.522 | 4.034/4.633 → 15.208/23.111 | 0.127/0.220 → 0.131/0.567 | 3.066/8.257 → 4.057/8.948 |
| entropic/Hyk5 | 1094.986/1312.884 → 808.334/1006.914 | 0.021/0.035 → 0.023/0.056 | 4.073/4.998 → 3.365/3.426 | 1047.612/1828.710 → 800.689/817.454 | 0.074/0.134 → 0.045/0.079 | 2.373/2.860 → 1.930/4.279 |
| entropic/Hafj | 124.065/125.577 → 104.546/105.442 | 0.022/0.030 → 0.020/0.028 | 3.830/3.903 → 3.224/3.369 | 121.570/140.031 → 104.640/108.572 | 0.159/0.269 → 0.048/0.091 | 2.470/3.480 → 1.768/2.087 |
| entropic/Ksy3 | 1.728/1.808 → 1.519/8.577 | 0.087/0.099 → 0.070/0.076 | 0.316/0.406 → 0.238/0.280 | 5.180/5.446 → 3.859/4.224 | 0.396/0.454 → 0.192/0.299 | 2.764/3.632 → 2.253/2.628 |
| global/newman | 0.371/0.380 → 0.467/0.653 | 0.017/0.022 → 0.018/0.021 | 0.230/0.242 → 0.444/0.611 | 1.468/1.892 → 1.717/2.636 | 0.050/0.091 → 0.108/0.206 | 1.619/2.168 → 1.777/2.388 |
| global/A2s7 | 162.143/167.089 → 149.280/149.910 | 0.031/0.045 → 0.030/0.038 | 0.211/0.217 → 0.202/0.216 | 90.678/93.086 → 87.871/88.947 | 0.131/0.536 → 0.065/0.098 | 1.670/2.195 → 1.664/2.263 |
| global/CJhv | 392.869/481.059 → 301.608/312.079 | 0.035/0.041 → 0.031/0.033 | 0.284/0.357 → 0.229/0.233 | 202.885/224.943 → 187.393/189.088 | 0.204/0.614 → 0.065/0.160 | 4.288/8.463 → 1.784/2.300 |
| global/AdoP | 1.060/3.311 → 0.693/1.233 | 0.032/0.099 → 0.022/0.028 | 0.284/0.398 → 0.213/0.242 | 3.328/3.614 → 1.861/2.332 | 0.193/0.369 → 0.090/0.114 | 2.768/7.861 → 0.888/1.002 |

Each family/engine additionally generates twenty distinct thirty-given puzzles. Independent counting proves uniqueness and required-family dependence; deterministic repeats agree. Six attempts and 20,000 nodes per exact check remain unchanged.

| Family | Accepted/distinct per engine | Sequential main → revised median/p95 ms |
| --- | --- | --- |
| modular | 20 / 20 | 1.970/6.920 → 6.817/30.979 |
| entropic | 20 / 20 | 4.431/15.756 → 3.202/13.584 |
| global-entropy | 20 / 20 | 4.532/34.339 → 3.625/34.415 |

The sequential Modular generation batch is slower, 1.970/6.920 → 6.817/30.979 ms. The alternating retained Modular recipe is 2.527/9.514 → 2.579/8.613 ms. Both measurements remain visible; neither establishes a general generation speedup. Human coverage is unchanged: HCHW still stalls at 2000 points/25 app deductions, Hyk5/Hafj and the two mixed Global Entropy sources remain partial. Exact completions remain available.

## Packages and memory

All four named profiles build and enforce their published capabilities. Independent reduced-package controls compare 26 complete variant replies and ten Classic replies against the app. The retained catalogs agree; omitted teaching/generation requests return `unsupported-capability`. Sizes are raw bytes and individual Node gzip bytes. The baseline profiles are the unchanged rectangle-release sources; a fresh `3b0671f` app build reproduces its pinned artifact.

| Profile | Main raw/gzip | Revised raw/gzip | Delta raw/gzip |
| --- | --- | --- | --- |
| solver | 2065124 / 564227 | 2030951 / 553480 | -34173 / -10747 |
| variant-solver | 2622881 / 711991 | 2667597 / 709918 | +44716 / -2073 |
| classic | 2568331 / 666825 | 2564696 / 671684 | -3635 / +4859 |
| app | 3378485 / 910114 | 3430109 / 898293 | +51624 / -11821 |

The controlled production pair retains 22 client JS assets and 6244146 raw bytes. Summed individual gzip sizes change from 2063274 to 2063286 bytes. These costs use the same pinned app code; later independent picker/QR changes in main are outside this engine-size comparison.

Committed Wasm capacities agree for the four HCHW overlay positions, all fifteen positive/error overlay controls, and all thirty-three broad request sequences. The core report rounds to two decimal MiB. Generation recipe capacity changes from 1.5 to 1.375 MiB in eight recipes and from 1.5 to 1.4375 MiB for Jigsaw/Killer. The opening rectangle-only requests add 0.125 MiB, and the app-stall rectangle-only requests add 0.0625 MiB. Other changed focused capacities fall. Every changed rectangle/Classic capacity follows.

| Position | Request | Main → revised MiB |
| --- | --- | --- |
| HCHW-opening | rectangle-inferences | 1.375 → 1.5 |
| HCHW-opening | reversed-rectangle-inferences | 1.375 → 1.5 |
| HCHW-native-stall | app-rate | 6.625 → 6.5625 |
| HCHW-app-stall | rectangle-inferences | 3.0 → 3.0625 |
| HCHW-app-stall | reversed-rectangle-inferences | 3.0 → 3.0625 |
| unique-rectangle-discontinuous-nice-loop-published | reversed-rectangle-inferences | 2.0625 → 2.0 |
| unique-rectangle-aic-published | classic-reversed-rectangle-inferences | 1.6875 → 1.625 |
| unique-rectangle-discontinuous-nice-loop-published | classic-rectangle-inferences | 1.8125 → 1.6875 |
| unique-rectangle-discontinuous-nice-loop-published | classic-reversed-rectangle-inferences | 1.8125 → 1.6875 |

Actual caller sequences preserve the following high-water capacities. These are linear-buffer capacity, not live allocation or process RSS.

| Caller sequence | Main MiB | Revised MiB |
| --- | --- | --- |
| modular/newman | 4.375 | 4.375 |
| modular/Hu9m | 4.375 | 4.375 |
| modular/HCHW | 6.625 | 6.625 |
| entropic/clover | 4.75 | 4.75 |
| entropic/EoGB | 7.125 | 7.125 |
| entropic/BSEJ | 7.375 | 7.375 |
| entropic/Hyk5 | 7.375 | 7.375 |
| entropic/Hafj | 7.375 | 7.375 |
| entropic/Ksy3 | 7.375 | 7.375 |
| global/newman | 3.8125 | 3.8125 |
| global/A2s7 | 3.8125 | 3.8125 |
| global/CJhv | 3.8125 | 3.8125 |
| global/AdoP | 5.0625 | 5.0625 |

## Integrated main and limits

The untouched research worktree and its unrelated local edits remain preserved. Independent PRs 184–186 changed app navigation, QR code dependencies and the picker while this engine audit ran. The engine merge retains those changes. Post-merge checks use main `5db8029`, a fresh dependency install and a new checkout-specific Cargo target; [main CI](https://github.com/coder13/sudoku-app/actions/runs/44436059259) provides the combined release gate. Local integration passes all 536 app tests, TypeScript, the 119-component catalog and all 171 production routes. Its Wasm SHA-256 and all five generated JSON files match the reviewed artifact exactly. All native, sixteen-capability, four-profile, strict full/reduced documentation, TypeScript, 536 app and 317 Wasm checks also pass on that exact merged head in main CI. The local integration build emits 171 routes.

The alternate order is a private witness heuristic with exhaustive fallback. It adds no public cancellation/budget semantics and makes no new human deduction. No companion rule, proof field or difficult fixture is removed. It does not resolve [HCHW human coverage](https://github.com/coder13/sudoku-app/issues/175). The measured dense-case gain, slower CJhv rating, sequential generation variation and nondedicated-host limits remain separate from future worker/viewport audits and narrower packaging work.

```sh
node --experimental-strip-types scripts/bench-overlay-support.mjs before.wasm src/sudoku/generated/engine.wasm --samples=2 --warmups=0
node --experimental-strip-types scripts/bench-overlay-support.mjs before.wasm src/sudoku/generated/engine.wasm --samples=7 --warmups=2 --cases=HCHW-23,HCHW-24,HCHW-25
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv --renban --entropic-corpus --global-entropy-corpus --modular-corpus
node --experimental-strip-types scripts/bench-variant-graphs.mjs before.wasm src/sudoku/generated/engine.wasm
node --experimental-strip-types scripts/bench-variant-graphs.mjs before.wasm src/sudoku/generated/engine.wasm --classic-only
```
