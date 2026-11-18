# Variant rectangle graph performance audit

This work starts from main `96b475f`, after the Modular Lines integration and release record. It follows the measured empty-search costs in [issue 175](https://github.com/coder13/sudoku-app/issues/175) and the broader [performance audit](https://github.com/coder13/sudoku-app/issues/88). No rule, technique, point cost or default order is added.

Merged through [PR 180](https://github.com/coder13/sudoku-app/pull/180) at `c90d16e3d56eaa91f2534f736acbd312725135e0` on November 18, 2026. Every CI and deployment check passed on reviewed head `97d5751f462dd615f6495536fe2d94d99e194c45`, including [run 44416406932](https://github.com/coder13/sudoku-app/actions/runs/44416406932). Fetched remote main contains both commits, and its shipping source matches the reviewed head exactly.

## Measured cause

The control is cyboogie's original [Modular VII/XIII 2](https://sudoku.coach/en/s/HCHW), preserved completely in [the source corpus](tests/fixtures/modular-coach.json). Its native path stalls at 420 points after 21 deductions; the app path stalls at 2000 points after 25. Both exact completions agree with an independent numeric-rule counter. The optimization must retain those logical paths and every proof.

Temporary private-stage instrumentation in a native release test separated graph construction from all three traversals. Five fresh constructions per position observed roughly 60 ms at the opening, 26 ms at the native stall and 22 ms at the app stall. Traversals were below 0.2 ms. The opening construction produced no graph. Instrumentation was removed before the shipping build.

Classic `DeductionSearch` already caches its rectangle graph, but `classic_proofs` constructs a separate search for each variant technique. The three rectangle inference techniques repeat the same construction on the same immutable board and masks. An empty result repeats the full guardian enumeration too.

## Change and safety boundaries

Each private `ProofPosition` now owns a lazy `RectangleInferenceCache`. The three Unique Rectangle inference techniques borrow it through the existing Classic search. The first lookup stores owned copies of the board and candidate masks together with its completed graph result. A completed empty result is retained. Every lookup checks both complete input arrays; a mismatched caller uses its local graph instead and cannot replace the original cached position.

Graph construction, edge ordering and each technique's traversal remain unchanged. Unique-solution eligibility, extra-rule swap checks and proof conversion remain in their existing locations. Changed entries or removals create a new logical position. The cache adds no global state, cross-worker state, unsafe code or public API. It is compiled only with `variants`; other inference families retain their existing cache lifetimes.

Native regressions use the published practice positions for all three shapes. They retain expected actions and complete proof lists in both technique orders. Further controls warm an empty result before a different positive position, replace domains after warming a positive graph, and return to the original position. All 356 unit/integration tests and seven Cargo examples pass together in the ordinary full release command, for 363 native cases. Strict full/classic-only/variants-only documentation also passes on reviewed head `97d5751` in CI.

## Focused Wasm comparison

The comparison uses Node 26.13.0 on macOS arm64. Each position gets fresh engine instances, and execution alternates between builds. Each request has two warmups and seven measured samples. Timings include serialization; assertions and exact response comparisons are outside timing. Instantiation, worker startup, transfer, browser layout and paint are excluded. p95 of seven is the maximum. No audit-owned compiler, test or other benchmark runs concurrently; the host is not dedicated.

The [benchmark](scripts/bench-variant-graphs.mjs) derives the two stalls from the unchanged baseline and also checks the first published exercise for each rectangle inference shape. It compares complete replies without normalizing fields. Shared graphs live within a combined request; separate messages retain separate logical positions.

| Position | Request | Main → revised median/p95 ms | Committed MiB |
| --- | --- | --- | --- |
| HCHW-opening | rectangle-inferences | 455.700/568.568 → 148.345/234.718 | 1.375 → 1.500 |
| HCHW-opening | reversed-rectangle-inferences | 351.951/374.228 → 120.310/127.939 | 1.375 → 1.500 |
| HCHW-opening | app-rate | 987.523/1005.732 → 672.874/695.613 | 5.875 → 6.625 |
| HCHW-opening | exhaustive | 307.802/471.408 → 103.700/106.570 | 5.875 → 6.625 |
| HCHW-native-stall | rectangle-inferences | 133.928/136.668 → 44.871/46.214 | 3.250 → 3.250 |
| HCHW-native-stall | reversed-rectangle-inferences | 135.184/140.969 → 46.550/47.037 | 3.250 → 3.250 |
| HCHW-native-stall | app-rate | 951.018/968.242 → 654.378/685.406 | 5.875 → 6.562 |
| HCHW-native-stall | exhaustive | 309.020/334.667 → 224.914/267.085 | 7.000 → 7.812 |
| HCHW-app-stall | rectangle-inferences | 112.756/116.682 → 38.665/48.143 | 3.000 → 3.062 |
| HCHW-app-stall | reversed-rectangle-inferences | 104.720/107.361 → 35.257/37.182 | 3.000 → 3.062 |
| HCHW-app-stall | app-rate | 212.013/214.048 → 147.238/150.705 | 5.750 → 6.500 |
| HCHW-app-stall | exhaustive | 211.230/220.273 → 144.118/153.085 | 5.750 → 6.500 |
| unique-rectangle-aic-published | rectangle-inferences | 1.224/1.316 → 0.709/0.784 | 1.625 → 1.625 |
| unique-rectangle-aic-published | reversed-rectangle-inferences | 1.084/1.176 → 0.691/0.719 | 1.625 → 1.625 |
| unique-rectangle-continuous-nice-loop-published | rectangle-inferences | 5.200/5.564 → 5.144/5.311 | 7.500 → 7.500 |
| unique-rectangle-continuous-nice-loop-published | reversed-rectangle-inferences | 5.202/5.442 → 5.204/5.242 | 7.500 → 7.500 |
| unique-rectangle-discontinuous-nice-loop-published | rectangle-inferences | 0.745/0.912 → 0.592/0.689 | 2.000 → 2.000 |
| unique-rectangle-discontinuous-nice-loop-published | reversed-rectangle-inferences | 0.734/0.774 → 0.591/0.656 | 2.062 → 2.000 |

On this control, opening app rating falls from 987.523 to 672.874 ms, about 32%. The exhaustive opening scan falls from 307.802 to 103.700 ms, about 66%. Positive published chains retain their full proof lists; their smaller improvements depend on how much time construction contributes.

Committed memory is Wasm linear-memory capacity, not live allocations or process RSS. The focused HCHW sequences increase capacity by up to 0.8125 MiB. Holding a graph until its logical position ends can overlap other detector work. This measured cost also remains visible in the broad and actual-caller controls below.

Main app artifact: 3417181 raw / 897461 gzip bytes, SHA-256 `9f61fa13458970e78a2a054a74ddef92e5c204e93b256f364b08b21a8f6a8498`. Revised build: 3378485 raw / 910114 gzip bytes, SHA-256 `e8d58bcb5560534e21c92ded22aec77bdf6411c5e4d174a84dc94381bb84ea07`. This compiler's app saves 38696 raw bytes and adds 12653 gzip bytes. The four package profiles and production rebuild pass; the production artifact reproduces this hash. Teaching examples, aliases, difficulty metadata and capability declarations match main exactly.

## Exact-search regression control

The initial cache artifact (`483980dd…`) preserved every result but made A2s7 and CJhv exact analysis/solving about 23–25% slower. Rebuilding main reproduces its baseline hash exactly. Two fresh-instance passes in reversed instantiation orders, with ten warmups and twenty-five alternating samples, repeat the slowdown.

V8 CPU samples and linker maps identify the extra cost inside Quadruple's recursive `assign<true>` path. The baseline inlines `domains.contains(&0)`; the initial candidate calls an outlined general `slice_contains` routine. Linker-map builds reproduce both artifacts byte for byte, so this diagnosis uses the measured code. Four explicit array checks preserve the same empty-domain rejection without depending on that inlining choice. The independent assignment test now checks an empty domain in every cell for all four required-digit shapes, including repeats and impossible local placements. No Global Entropy kernel or table change ships.

| Exact control | Request | Pass 1, main → revised median/p95 ms | Pass 2, reversed instantiation |
| --- | --- | --- | --- |
| A2s7 | analyze | 35.677/36.775 → 35.849/37.060 | 35.640/36.535 → 35.694/36.492 |
| A2s7 | solve | 32.260/33.530 → 32.311/33.402 | 32.035/32.466 → 32.112/32.564 |
| CJhv | analyze | 81.979/86.821 → 82.824/86.957 | 79.690/85.333 → 79.606/81.334 |
| CJhv | solve | 35.502/36.550 → 35.574/36.576 | 34.664/34.738 → 34.607/35.573 |

These corrected medians are within about 1% of main. The broad paired run also preserves A2s7/CJhv exact and rating costs. This does not establish a general exact-search speedup.

## Capability profiles

| Package | Main raw / gzip bytes | Cache raw / gzip bytes |
| --- | ---: | ---: |
| solver | 2065326 / 564431 | 2065124 / 564227 |
| variant-solver | 2621324 / 711615 | 2622881 / 711991 |
| classic | 2567801 / 664249 | 2568331 / 666825 |
| app | 3417181 / 897461 | 3378485 / 910114 |

The reduced variant package adds 376 gzip bytes. Classic-only builds omit the new cache module and preserve their behavior, but compiler layout changes alter their measured artifacts too. The app adds about 1.4% gzip bytes. These are macOS arm64/Rust 1.100.0/Node 26.13.0 measurements. Linux x64 CI uses the same Rust revision with Node 22 and reports 3378421 raw / 910146 gzip app bytes; its four profiles and full behavioral gates pass. Cross-host binary reproducibility is not asserted. The package decision trades this measured transfer cost for the affected request improvement; startup and network latency are not measured here.

## Classic and reduced callers

Classic requests already share this graph in one search. Six paired forward/reverse requests on the three published examples retain every action and proof. This control does not establish a Classic speedup.

| Published case | Request | Main → revised median/p95 ms |
| --- | --- | --- |
| unique-rectangle-aic-published | classic-rectangle-inferences | 1.219/1.488 → 1.368/1.701 |
| unique-rectangle-aic-published | classic-reversed-rectangle-inferences | 1.097/1.318 → 1.102/1.254 |
| unique-rectangle-continuous-nice-loop-published | classic-rectangle-inferences | 11.673/12.152 → 11.954/17.967 |
| unique-rectangle-continuous-nice-loop-published | classic-reversed-rectangle-inferences | 16.593/24.682 → 17.307/46.439 |
| unique-rectangle-discontinuous-nice-loop-published | classic-rectangle-inferences | 1.853/2.107 → 1.713/1.951 |
| unique-rectangle-discontinuous-nice-loop-published | classic-reversed-rectangle-inferences | 1.591/3.124 → 1.105/2.792 |

The reduced `variant-solver` artifact agrees with the app on 21 complete replies: candidates, analysis, solving, traces and ratings for all three complete Modular sources, plus forward/reverse combined inference proofs for the three published chain examples. Its catalog agrees; generation and practice requests still return `unsupported-capability`.

The production rebuild retains 18 client JavaScript assets at 6073395 raw bytes. Their summed individual Node gzip sizes change from 2000855 to 2000852 bytes. The engine artifact accounts for the material transfer difference.

## Broad paired requests

Node/Wasm timings include request serialization. Fixed calls use five warmups and twenty samples. App ratings and extended exhaustive requests use two warmups and five samples; the nine core exhaustive cases use ten samples. Execution alternates between artifacts. Assertions compare complete replies outside timing. Instantiation, worker startup/transfer, browser layout and paint are excluded. The host is not dedicated; p95 of five is the maximum. No audit-owned compiler, test or other benchmark runs concurrently.

| Source | Candidates | Exact analysis | Exact solve | Native rating |
| --- | --- | --- | --- | --- |
| quadruple | 0.061/0.073 → 0.061/0.070 | 0.429/0.500 → 0.430/0.500 | 0.341/0.400 → 0.340/0.428 | 1.217/1.377 → 1.230/1.455 |
| parity | 0.020/0.036 → 0.022/0.033 | 0.032/0.064 → 0.032/0.073 | 0.032/0.061 → 0.032/0.216 | 0.212/0.750 → 0.206/0.952 |
| anti-king | 0.015/0.016 → 0.015/0.019 | 0.021/0.023 → 0.021/0.022 | 0.022/0.024 → 0.021/0.023 | 0.139/0.155 → 0.139/0.154 |
| non-consecutive | 0.020/0.024 → 0.020/0.023 | 0.095/0.099 → 0.095/0.110 | 0.096/0.098 → 0.095/0.098 | 0.361/0.457 → 0.360/0.427 |
| nc-white-dots | 0.056/0.062 → 0.055/0.081 | 0.385/0.464 → 0.379/0.435 | 0.356/0.398 → 0.366/0.424 | 1.068/1.173 → 1.079/1.109 |
| whispers | 0.018/0.019 → 0.019/0.022 | 14.732/15.382 → 15.147/16.170 | 14.423/15.431 → 14.879/15.624 | 0.281/0.323 → 0.284/0.361 |
| palindrome | 0.019/0.079 → 0.020/0.043 | 0.038/0.045 → 0.038/0.048 | 0.037/0.039 → 0.037/0.038 | 0.105/0.114 → 0.106/0.114 |
| palindrome-knight | 0.023/0.029 → 0.023/0.031 | 0.048/0.184 → 0.048/0.181 | 0.051/0.071 → 0.050/0.076 | 1.004/1.190 → 0.972/1.720 |
| palindrome-whispers | 0.021/0.027 → 0.022/0.024 | 0.476/0.561 → 0.495/0.548 | 0.104/0.110 → 0.106/0.111 | 0.812/0.853 → 0.828/0.951 |
| xv-clover | 0.022/0.027 → 0.022/0.026 | 0.073/0.106 → 0.076/0.145 | 0.047/0.059 → 0.048/0.057 | 0.355/0.614 → 0.378/0.754 |
| xv-quadruple-clover | 0.029/0.097 → 0.030/0.088 | 0.128/0.239 → 0.126/0.288 | 0.114/0.304 → 0.122/0.369 | 0.358/0.690 → 0.398/0.684 |
| 7v7n | 0.020/0.075 → 0.016/0.036 | 0.435/0.495 → 0.440/0.494 | 0.128/0.135 → 0.130/0.137 | 0.124/0.183 → 0.122/0.204 |
| FCeS | 0.023/0.026 → 0.023/0.029 | 0.084/0.087 → 0.085/0.087 | 0.090/0.111 → 0.089/0.104 | 0.593/0.612 → 0.595/0.632 |
| 63Jk | 0.010/0.011 → 0.010/0.013 | 0.043/0.050 → 0.042/0.054 | 0.039/0.039 → 0.037/0.037 | 1.008/1.097 → 0.937/1.051 |
| Chcs | 0.071/0.097 → 0.068/0.146 | 1.506/2.248 → 1.477/1.849 | 0.778/1.046 → 0.791/0.986 | 21.756/24.919 → 23.091/27.214 |
| renban-clover | 0.037/0.050 → 0.037/0.048 | 0.156/0.179 → 0.162/0.183 | 0.159/0.163 → 0.159/0.161 | 0.257/0.353 → 0.278/0.445 |
| renban-killer-clover | 0.029/0.031 → 0.029/0.031 | 0.149/0.153 → 0.151/0.162 | 0.150/0.168 → 0.150/0.176 | 0.169/0.178 → 0.169/0.178 |
| entropic-clover | 0.016/0.017 → 0.015/0.016 | 0.043/0.050 → 0.043/0.052 | 0.044/0.051 → 0.044/0.045 | 0.107/0.118 → 0.107/0.119 |
| global-entropy-newman | 0.014/0.038 → 0.014/0.019 | 0.079/0.080 → 0.080/0.081 | 0.079/0.080 → 0.081/0.081 | 0.146/0.168 → 0.148/0.167 |
| renban-Jh4o | 0.047/0.047 → 0.046/0.053 | 0.879/0.890 → 0.890/0.901 | 0.263/0.270 → 0.252/0.272 | 0.184/0.213 → 0.181/0.208 |
| renban-KUUo | 0.016/0.016 → 0.016/0.016 | 0.123/0.124 → 0.125/0.127 | 0.056/0.056 → 0.056/0.057 | 0.080/0.137 → 0.080/0.124 |
| renban-BSms | 0.020/0.023 → 0.020/0.021 | 697.191/722.013 → 722.438/728.108 | 42.162/46.522 → 44.179/48.496 | 0.056/0.062 → 0.057/0.069 |
| entropic-EoGB | 0.010/0.012 → 0.011/0.012 | 0.040/0.041 → 0.039/0.040 | 0.040/0.042 → 0.039/0.040 | 0.095/0.121 → 0.092/0.128 |
| entropic-BSEJ | 0.015/0.021 → 0.015/0.021 | 0.090/0.104 → 0.092/0.108 | 0.077/0.078 → 0.078/0.078 | 0.057/0.082 → 0.057/0.095 |
| entropic-Hyk5 | 0.013/0.014 → 0.013/0.014 | 6.952/7.296 → 6.861/7.291 | 2.621/2.796 → 2.629/2.771 | 0.076/0.081 → 0.075/0.081 |
| entropic-Hafj | 0.016/0.031 → 0.016/0.025 | 0.867/0.936 → 0.886/0.954 | 0.762/0.831 → 0.774/0.904 | 0.072/0.076 → 0.072/0.076 |
| entropic-Ksy3 | 0.066/0.068 → 0.066/0.069 | 0.250/0.303 → 0.254/0.300 | 0.250/0.265 → 0.252/0.259 | 0.483/0.584 → 0.483/0.579 |
| global-entropy-A2s7 | 0.027/0.045 → 0.027/0.036 | 37.127/37.760 → 36.918/38.099 | 33.508/33.910 → 33.236/33.655 | 1.049/1.121 → 1.041/1.116 |
| global-entropy-CJhv | 0.031/0.090 → 0.030/0.048 | 81.851/84.361 → 81.512/83.362 | 36.801/46.295 → 36.423/57.087 | 2.030/2.168 → 2.021/2.165 |
| global-entropy-AdoP | 0.019/0.024 → 0.018/0.030 | 0.124/0.147 → 0.123/0.148 | 0.123/0.127 → 0.123/0.135 | 0.154/0.164 → 0.155/0.169 |
| modular-newman | 0.015/0.018 → 0.015/0.018 | 0.047/0.057 → 0.048/0.057 | 0.047/0.048 → 0.048/0.049 | 0.100/0.105 → 0.100/0.107 |
| modular-Hu9m | 0.038/0.040 → 0.038/0.043 | 0.180/0.190 → 0.180/0.189 | 0.184/0.192 → 0.186/0.196 | 0.465/0.503 → 0.468/0.550 |
| modular-HCHW | 0.024/0.031 → 0.023/0.038 | 0.156/0.164 → 0.159/0.166 | 0.078/0.080 → 0.079/0.081 | 0.135/0.156 → 0.135/0.159 |

| Source | App rating | Ten hints | Exhaustive hints |
| --- | --- | --- | --- |
| quadruple | 1.810/3.182 → 2.291/3.808 | 0.433/1.915 → 0.588/1.273 | 193.180/302.323 → 60.866/102.903 |
| parity | 0.210/0.509 → 0.213/0.543 | 0.086/0.100 → 0.086/0.092 | 47.820/97.918 → 41.183/62.061 |
| anti-king | 0.174/0.182 → 0.176/0.181 | 0.134/0.142 → 0.132/0.140 | 98.294/102.418 → 98.490/101.405 |
| non-consecutive | 0.390/0.457 → 0.391/0.474 | 0.085/0.119 → 0.084/0.133 | 38.072/49.262 → 37.295/145.764 |
| nc-white-dots | 1.059/1.424 → 1.073/1.158 | 0.345/0.430 → 0.343/0.467 | 0.318/0.400 → 0.325/0.363 |
| whispers | 0.339/0.896 → 0.342/0.864 | 3.238/3.665 → 3.416/3.694 | 3.176/3.476 → 3.380/3.712 |
| palindrome | 0.136/0.239 → 0.137/0.186 | 49.094/67.911 → 47.027/66.675 | 45.605/52.811 → 41.202/54.838 |
| palindrome-knight | 1.058/1.258 → 1.022/1.131 | 0.137/0.152 → 0.133/0.148 | 173.874/231.774 → 173.562/192.741 |
| palindrome-whispers | 98.432/101.262 → 98.796/102.117 | 0.218/0.235 → 0.220/0.241 | 2.335/2.418 → 2.415/2.632 |
| xv-clover | 7.537/7.854 → 7.129/8.238 | 0.150/0.358 → 0.161/0.426 | 195.776/396.837 → 92.223/120.045 |
| xv-quadruple-clover | 0.384/0.598 → 0.444/0.840 | 0.164/0.318 → 0.165/0.396 | 161.801/182.939 → 57.475/64.866 |
| 7v7n | 86.270/89.436 → 70.810/71.319 | 285.827/306.790 → 97.421/101.375 | 278.781/288.877 → 95.293/96.347 |
| FCeS | 7.600/7.973 → 7.649/7.994 | 0.123/0.207 → 0.124/0.157 | 0.799/0.813 → 0.789/0.875 |
| 63Jk | 3712.371/3999.135 → 3697.794/3872.371 | 0.109/0.117 → 0.109/0.204 | 434.396/938.408 → 409.433/574.780 |
| Chcs | 275.726/290.757 → 109.128/115.186 | 332.458/357.311 → 131.658/170.048 | 315.516/319.736 → 122.487/123.686 |
| renban-clover | 0.282/0.309 → 0.276/0.483 | 0.147/0.201 → 0.145/0.183 | 92.606/94.135 → 82.112/84.604 |
| renban-killer-clover | 0.203/0.218 → 0.195/0.200 | 0.149/0.155 → 0.150/0.158 | 66.805/68.730 → 55.367/55.634 |
| entropic-clover | 0.143/0.152 → 0.143/0.144 | 0.135/0.157 → 0.139/0.151 | 76.065/76.335 → 70.241/74.993 |
| global-entropy-newman | 0.185/0.187 → 0.184/0.186 | 0.080/0.085 → 0.081/0.084 | 46.446/54.800 → 45.947/47.452 |
| renban-Jh4o | 846.281/870.676 → 802.106/839.009 | 70.796/73.918 → 48.312/50.566 | 87.797/88.819 → 65.861/66.578 |
| renban-KUUo | 62.935/64.640 → 61.837/61.991 | 0.087/0.168 → 0.088/0.105 | 47.098/48.729 → 47.056/47.330 |
| renban-BSms | 67.110/68.964 → 67.241/68.525 | 88.331/94.996 → 89.041/93.887 | 88.190/91.990 → 88.979/94.596 |
| entropic-EoGB | 0.141/0.147 → 0.139/0.144 | 2.766/2.972 → 2.737/2.914 | 116.445/122.718 → 100.076/104.843 |
| entropic-BSEJ | 0.226/0.237 → 0.227/0.242 | 126.598/140.092 → 75.196/82.127 | 133.635/140.165 → 80.688/82.211 |
| entropic-Hyk5 | 834.335/860.300 → 835.846/871.040 | 3.639/3.715 → 3.537/3.768 | 3.409/3.483 → 3.433/3.518 |
| entropic-Hafj | 105.550/106.698 → 106.000/106.498 | 3.266/3.367 → 3.335/3.593 | 3.285/3.306 → 3.358/3.545 |
| entropic-Ksy3 | 0.562/0.633 → 0.569/0.645 | 0.173/0.175 → 0.174/0.180 | 1123.392/1372.683 → 932.538/1034.583 |
| global-entropy-A2s7 | 89.305/89.988 → 87.917/89.128 | 0.152/0.180 → 0.152/0.235 | 0.473/0.491 → 0.475/0.488 |
| global-entropy-CJhv | 172.253/174.628 → 171.640/172.081 | 0.184/0.216 → 0.192/0.233 | 0.387/0.400 → 0.386/0.398 |
| global-entropy-AdoP | 0.261/0.269 → 0.270/0.362 | 0.143/0.203 → 0.146/0.212 | 104.954/108.034 → 104.828/105.607 |
| modular-newman | 0.137/0.141 → 0.138/0.141 | 0.075/0.086 → 0.076/0.112 | 56.616/58.300 → 48.821/49.310 |
| modular-Hu9m | 0.525/0.560 → 0.528/0.566 | 0.138/0.143 → 0.138/0.173 | 0.333/0.339 → 0.335/0.343 |
| modular-HCHW | 953.468/1006.604 → 653.941/694.772 | 0.118/0.155 → 0.117/0.124 | 321.938/389.336 → 109.882/153.093 |

## Seeded generation

Each recipe compares seeds 1–20 under the same explicit retained native order, six attempts and 20,000 nodes per exact check. These runs have no warmups. All 180 complete outcomes agree. Both artifacts accept 179 puzzles; Renban seed 10 reaches the same search limit in both. Every family keeps its distinct accepted puzzles.

| Family | Matches, main/revised | Failed seeds | Main → revised median/p95 ms |
| --- | --- | --- | --- |
| classic | 20 / 20 | [] | 0.617/0.848 → 0.644/0.974 |
| x-sudoku | 20 / 20 | [] | 0.630/0.746 → 0.641/0.766 |
| killer | 20 / 20 | [] | 2.859/3.226 → 2.944/3.483 |
| jigsaw-killer | 20 / 20 | [] | 2.564/2.857 → 2.717/3.038 |
| windoku | 20 / 20 | [] | 0.880/2.306 → 0.879/2.252 |
| renban | 19 / 19 | [10] | 116.290/366.206 → 103.963/431.366 |
| entropic | 20 / 20 | [] | 3.669/13.784 → 3.190/13.754 |
| global-entropy | 20 / 20 | [] | 3.695/37.468 → 3.651/37.787 |
| modular | 20 / 20 | [] | 2.056/7.054 → 2.193/6.972 |

## Actual app callers

Both processes use the same final JavaScript source and select only the Wasm artifact. The six runs are sequential before/after processes, with two warmups/five samples for previews, hints and walkthroughs and five/twenty for candidates, input and Board SSR. They retain full/partial walkthrough outcomes, ratings, hint counts and independently verified exact completions. In-process transport excludes worker startup, message transfer and live layout/paint. These caller measurements provide application context; they are less controlled than the alternating raw calls above.

| Family/source | Preview with rating | Play candidates | Ordinary app hints | Walkthrough | Input with candidates | Board SSR |
| --- | --- | --- | --- | --- | --- | --- |
| modular/newman | 0.364/0.487 → 0.383/0.452 | 0.025/0.046 → 0.023/0.025 | 0.224/0.328 → 0.186/0.199 | 2.067/4.380 → 1.666/2.146 | 0.076/0.126 → 0.057/0.073 | 2.050/2.726 → 1.707/2.259 |
| modular/Hu9m | 1.318/1.685 → 1.221/1.332 | 0.048/0.053 → 0.045/0.051 | 0.228/0.260 → 0.198/0.211 | 4.048/5.357 → 3.714/5.008 | 0.159/0.207 → 0.158/0.207 | 1.579/2.170 → 1.352/1.985 |
| modular/HCHW | 926.323/930.958 → 647.951/754.929 | 0.029/0.042 → 0.030/0.073 | 0.173/0.194 → 0.340/0.487 | 903.441/923.464 → 630.274/747.511 | 0.279/0.292 → 0.282/0.425 | 2.231/2.500 → 2.179/2.409 |
| entropic/clover | 0.306/0.315 → 0.293/0.304 | 0.024/0.042 → 0.020/0.025 | 0.228/0.254 → 0.231/0.269 | 1.753/1.940 → 1.710/1.898 | 0.050/0.063 → 0.050/0.065 | 1.672/2.144 → 1.653/2.215 |
| entropic/EoGB | 0.573/0.936 → 0.467/0.534 | 0.013/0.019 → 0.013/0.016 | 2.704/3.697 → 2.656/2.764 | 3.096/4.928 → 2.884/5.006 | 0.026/0.059 → 0.027/0.060 | 1.559/2.053 → 1.561/2.058 |
| entropic/BSEJ | 0.547/0.585 → 0.563/0.601 | 0.017/0.019 → 0.019/0.023 | 119.859/121.610 → 71.003/71.483 | 3.054/4.043 → 3.153/4.860 | 0.104/0.116 → 0.061/0.098 | 1.657/2.004 → 1.701/1.874 |
| entropic/Hyk5 | 818.171/842.159 → 812.589/820.881 | 0.016/0.021 → 0.016/0.019 | 3.545/3.798 → 3.402/3.493 | 802.287/807.096 → 802.896/810.177 | 0.056/0.082 → 0.030/0.070 | 1.734/1.895 → 1.669/1.778 |
| entropic/Hafj | 104.255/105.667 → 106.864/107.142 | 0.019/0.024 → 0.018/0.021 | 3.290/3.349 → 3.343/3.488 | 103.584/104.815 → 103.370/103.702 | 0.076/0.131 → 0.093/0.106 | 1.687/2.084 → 1.782/1.985 |
| entropic/Ksy3 | 1.575/8.607 → 1.421/10.931 | 0.069/0.077 → 0.070/0.075 | 0.236/0.258 → 0.244/0.299 | 3.809/4.058 → 4.032/4.802 | 0.173/0.248 → 0.199/0.297 | 2.243/2.691 → 2.285/2.669 |
| global/newman | 0.374/0.383 → 0.380/0.414 | 0.016/0.022 → 0.016/0.019 | 0.215/0.222 → 0.219/0.226 | 1.512/1.620 → 1.470/1.861 | 0.031/0.080 → 0.028/0.078 | 1.562/2.090 → 1.627/2.143 |
| global/A2s7 | 155.974/158.061 → 162.847/167.508 | 0.030/0.040 → 0.032/0.060 | 0.249/0.307 → 0.214/0.279 | 88.229/89.082 → 90.050/90.666 | 0.073/0.090 → 0.064/0.095 | 1.664/2.071 → 1.671/2.326 |
| global/CJhv | 288.423/289.792 → 290.804/311.220 | 0.031/0.037 → 0.031/0.034 | 0.237/0.251 → 0.233/0.251 | 175.895/178.367 → 178.971/196.594 | 0.064/0.158 → 0.085/0.186 | 1.792/2.404 → 1.795/2.451 |
| global/AdoP | 0.834/1.561 → 0.872/1.494 | 0.023/0.030 → 0.022/0.028 | 0.239/0.266 → 0.211/0.232 | 2.761/2.931 → 2.169/2.548 | 0.125/0.142 → 0.096/0.211 | 0.855/1.457 → 0.945/1.059 |

Each artifact also accepts twenty distinct puzzles per app family with the requested givens, authored clue count and family dependence. Every accepted puzzle passes the independent numeric-rule uniqueness counter and a deterministic repeat within that artifact. These app runs check sixty accepted puzzles per artifact; the nine-recipe table above provides the complete cross-artifact generation comparison.

## Validation and follow-ups

The final comparison preserves 12341 complete replies on 83 corpus positions and 363 positive practice positions, all 121 detector IDs and every hint page. Another 148 complete Classic replies agree on nine Tridagon examples. This includes all three Modular sources, both HCHW stalls and the intervening app positions. TypeScript, 520 app tests, 316 Wasm contracts, all four package profiles and the 163-route production/offline build pass locally. The normal full native release command passes all 356 unit/integration tests and seven Cargo examples together. Final-head CI confirms those native cases, all sixteen capability combinations, strict full/reduced documentation, the four Wasm profiles and both complete app/Wasm suites.

The initial accumulated Cargo caches exceeded local disk space during examples, profiles and the native feature-matrix attempt. Completed owned caches were cleared; the final ordinary native command and unmodified four-profile script pass locally. The full feature matrix passes in CI on the reviewed head. Those initial infrastructure failures remain in the logs.

Existing difficulty calibration, source-format gaps and HCHW's human reasoning gap remain separate work. The final broad requests preserve HCHW's 420-point native partial path and 2000-point, 25-step app partial path. Its verified exact completion remains available. The retained 63Jk rating still costs about 3.8 seconds. Classic controls and unaffected requests do not establish a general speedup.

The comparison also exposes an expensive empty Quintuple Pattern Overlay query before app step 22. The labelled baseline scout took about 61 seconds while other validation was active; this is a diagnostic observation, not a controlled performance statistic. All final baseline/candidate replies agree. [Issue 179](https://github.com/coder13/sudoku-app/issues/179) preserves the exact position and separate optimization requirements. Committed-memory costs, host noise and the slower caller samples remain visible in these tables.

## Reproduce

```sh
node --experimental-strip-types scripts/bench-variant-graphs.mjs before.wasm src/sudoku/generated/engine.wasm
node --experimental-strip-types scripts/bench-variant-graphs.mjs before.wasm src/sudoku/generated/engine.wasm --classic-only
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv --renban --entropic-corpus --global-entropy-corpus --modular-corpus
```
