# Non-Consecutive New Puzzle integration

Base: main `f9769da`, with reviewed Anti-King shipping source `4798372`. Release is pending. Non-Consecutive already has full import, accessible play, combined rules, hints/Finder, exact and human solutions, Learn/practice and persistence. This change adds New Puzzle with verified Easy/Medium recipes. Rust, lockfiles, native rule meanings, technique costs and scoring version 8 remain unchanged.

## Rules and source controls

Cells sharing an edge cannot contain consecutive digits. Diagonal neighbors are unrestricted by this rule; 1 and 9 are not consecutive. Ordinary Sudoku houses still forbid equal digits in a shared row or column. Existing real Coach controls retain every white-dot exception and companion constraint; mixed puzzles keep their existing chooser and complete rules. Plain generated puzzles use the global rule without exceptions.

The complete published control remains Philip Newman's [Literally No One](https://www.gmpuzzles.com/blog/2025/07/nonconsecutive-sudoku-by-philip-newman/), with all twenty-one givens, printed completion and original PDF URLs in `nonconsecutive-newman.json`. Its original Easy app path and all previous import/input/help/source tests remain active. The generation bank uses its checked completion plus two labelled authored witnesses from blank-template native generation at seeds 6 and 16. The three completions are independently valid and distinct under the eight square transforms. The generated witnesses are not attributed to a publisher and do not replace any published givens or clues.

## Bounded generation

Thirty checked seeds per difficulty cover the three completion layouts. Easy targets at most thirty givens; Medium targets 14–20. The optional `minGivens` recipe field defaults to zero, preserving previous request ranges. The existing app performs a fresh one-attempt request with 20,000-node exact-check bounds, then checked recipe fallbacks with played-puzzle exclusions. Generation removes givens from fixed completion layouts; it does not discover arbitrary new solved-grid patterns.

Independent calibration on forty seeds per layout accepts forty/forty/forty distinct Easy puzzles and sixteen/fourteen/twelve Medium puzzles. Every accepted puzzle is unique, matches its completion, has multiple solutions without Non-Consecutive and has a complete requested-level path. Earlier one-layout probes of seeds 1–100 accept 100 Easy and 44 Medium results at 0–30 givens, or forty Medium results at 14–20. The tighter range deliberately excludes four 12/13-given results; their timing/yield difference is a different density target, not a speedup for identical requests. A native source read confirms the floor stops further sparse-removal checks. No Rust or pruning-table change is needed.

Actual app contracts verify all sixty checked recipes and thirty successive distinct puzzles per difficulty while excluding prior results. Each has several sound hints, independent uniqueness and family dependence, an exact completion and a complete app-order replay. Every basic Non-Consecutive deduction cites an active edge rule and independently checks all choices of its neighbor. The four specialized Non-Consecutive exclusion techniques replay their entire alternative sets against independently reconstructed houses, placed digits and explicit removals. Every action agrees with the independent completion. The independent proof helper now constructs each house once per proof, preserving its premises without sharing native support code.

Additional contracts verify repeat determinism, all geometric exclusions through mixed aliases, recovery from a known fresh-search miss, a lower-given boundary witness, save/reload, undo/redo, solution help and shared import. Generated Medium points, counts, hardest technique and difficulty match a full app-order trace; generation's declared technique order is capped at its requested level. The base Non-Consecutive technique remains 8 points, Easy, without a uniqueness premise; generation's required-family uniqueness check is a separate condition.

## Validation and measurement status

Local validation passes 637 app tests, 440 Wasm contracts, strict app/new-contract/benchmark TypeScript and the 123-component catalog. Production prerenders 171 routes and passes three actual-build offline checks. Wasm and all five generated JSON files match preceding main byte for byte. Production uses that verified compiled artifact; no local native rebuild is claimed. The actual preview SVG was inspected in light/dark 290/540px reference cards; this is static vector/caption inspection rather than live CSS or pointer/keyboard verification. Exact-head CI/deployment and release remain pending. The original dirty R&D worktree is untouched. Eleven other older New Puzzle families remain after this integration ships; [189](https://github.com/coder13/sudoku-app/issues/189) keeps its checklist open until release. Authored source formats remain in [7](https://github.com/coder13/sudoku-app/issues/7).

## Performance and compatibility

Darwin arm64, Node 26.13.0, unchanged Wasm SHA-256 `291a61e8b43a92921902173415725a098219e69a8582c8fa4cfc44ef926dc8f7`, 3,416,046 raw / 893,636 default Node-gzip bytes. Reproduce with `node --experimental-strip-types --test scripts/bench-nonconsecutive-generation.mts` alone. Every operation has five warmups/forty timed samples; independent assertions follow the timer. No owned compiler, suite or second runtime benchmark runs alongside. The in-process transport excludes actual worker startup, transfers, browser layout and paint. No completed broad all-technique exhaustive scan is claimed.

| Operation | Median / p95 milliseconds |
| --- | --- |
| Published preview | 0.652 / 0.820 |
| Published candidates | 0.018 / 0.020 |
| Published ordinary hints | 0.167 / 0.284 |
| Published app-order rating | 0.393 / 0.414 |
| Published exact solution | 0.096 / 0.102 |
| Published walkthrough | 1.373 / 1.825 |
| Actual Easy New Puzzle | 2.178 / 2.406 |
| Actual Medium New Puzzle | 15.663 / 20.915 |
| Actual Medium fresh miss and fallback | 20.253 / 20.837 |

The generation workload uses seeds 1–45 including warmups, the three recipe layouts and empty played history. Easy returns forty-five distinct puzzles; Medium returns thirty-five because some misses choose the same checked fallback. Successive-app contracts separately provide prior results as exclusions and verify thirty distinct puzzles per level. A bounded seed-one Medium request confirms the miss before the timed fallback measurement. Every measured result is independently unique, completion-correct and Non-Consecutive-dependent.

All 345 preceding recipe requests match exactly with the new zero-default minimum. Whole native outcomes match for 120 paired requests: twenty seeds each for Sandwich Hard, Little Killer Medium, X-Sums Hard, Skyscrapers Hard and Anti-King Easy/Medium. These comprise 115 matching successes and five matching search limits; failures are retained in the comparison.

An alternating paired input/Board SSR run compares thirteen controls, including Non-Consecutive, Anti-King, Skyscrapers and ten earlier cases. All input positions and full SSR strings match exactly. Ten warmups/forty samples per operation give median input changes -0.003625 to +0.003833 ms and SSR changes -0.009750 to +0.004333 ms. Slower observed p95 tails remain explicit: Non-Consecutive input 0.024667→0.032417 ms, Clone SSR 1.116167→1.348416 ms, Sandwich SSR 0.904625→1.092875 ms and the outside mixture 1.412500→1.764000 ms. These observations do not establish a general speedup or browser input latency.

Summed production `dist/client/assets` with per-file default Node gzip: JS changes 6,282,186/2,074,620→6,289,931/2,075,232 raw/gzip bytes (+7,745/+612); CSS changes 301,801/41,758→302,068/41,822 (+267/+64). Wasm changes by zero bytes. This asset comparison excludes HTML and service-worker files.
