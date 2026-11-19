# Anti-King New Puzzle integration

Base: main `e99d294`, with reviewed Skyscrapers shipping source `20425be`. Released through PR 210 at main `90e9bd2`. Anti-King already has faithful import, accessible desktop/mobile play, combined rules, hints/Finder, exact and human solutions, Learn/practice and storage/sharing coverage. This change adds New Puzzle access and calibrated Easy/Medium generation. Native Rust, lockfiles and scoring remain unchanged.

## Rules and controls

An Anti-King puzzle obeys the usual Sudoku houses and forbids equal digits in cells touching at a corner, including across box boundaries. The complete published control remains Philip Newman's [King of Diamonds](https://www.gmpuzzles.com/blog/2025/07/anti-king-sudoku-by-philip-newman/), with all twenty-four givens and the checked printed completion in `tests/fixtures/anti-king-newman.json`. Its existing source, import, corner evidence, combined-rule and player-flow tests remain active. No published clue set is replaced by a partial source.

## Generation

New Puzzle offers Anti-King with a vector crown preview and only verified Easy/Medium levels. The native generator starts from a blank Anti-King template, constructs valid completions and removes givens to at most thirty. These are fresh layouts, rather than removal from one fixed published solution. Native `requiredRule` checks that Anti-King affects uniqueness. Every offered recipe has a checked seed. A per-recipe `maxAttempts` field defaults to the previous one attempt; Anti-King uses six. The existing app still tries a fresh seed followed by deterministic checked recipe fallbacks, preserving exclusions and the initial 20,000-node exact-check bound.

Native calibration checks seeds 1–100 at both difficulties. One-attempt searches accept 87 distinct Easy and nineteen distinct Medium results; six-attempt searches accept one hundred Easy and sixty-three Medium. Every accepted result is independently unique, matches its completion, has multiple solutions without Anti-King and has a complete path at the requested difficulty. Easy one-attempt results have 27–30 givens and 602–786 points; Medium has 23–30 givens and 766–1,124 points. These yields describe explicit native budgets, not app fallback success or controlled benchmark latency. The final bank contains twenty Easy and nineteen Medium fallback seeds, checked by one-attempt calibration and used with a six-attempt allowance.

Focused actual-app contracts generate twenty distinct puzzles at each difficulty while excluding the preceding results. Every result has several hints, independent uniqueness and Anti-King dependence, an exact completion and a complete app-order replay. Every Anti-King deduction independently identifies corner neighbors and a forced digit in the other cell's explicit domain; each placement/elimination agrees with the independent completion. Full app-order points, counts, hardest technique and difficulty agree with the generation profile; their declared enabled-order lists differ because generation caps techniques at the requested level. Additional contracts verify repeat determinism, all eight geometric exclusions through mixed aliases, recovery from a known bounded fresh-search miss, actual save/reload, undo/redo, solution help and shared import.

The Anti-King technique remains 8 points, Easy, without a uniqueness premise; scoring version remains 8. Generation's required-family uniqueness check is separate from a hint's local proof.

## Validation

Final local validation passes 635 app tests, 429 Wasm contracts, strict app/new-contract/benchmark TypeScript and the 123-component catalog. The final vector-preview build prerenders 171 routes and passes three actual-build offline checks. The Wasm and five generated JSON files match preceding main byte for byte. Production uses that verified existing compiled artifact; no local native rebuild is claimed. The original dirty R&D worktree is untouched. The other twelve older New Puzzle families remain in [189](https://github.com/coder13/sudoku-app/issues/189); full authored Coach formats remain in [7](https://github.com/coder13/sudoku-app/issues/7).

[PR 210](https://github.com/coder13/sudoku-app/pull/210) reached main at `90e9bd2815e3d3e420adb2c05e5ca07aab55826c`, reviewed head `4798372e190720442a1fb0acb17cc6cdd66cb7e8`. Every gate passes in [CI 44504454939](https://github.com/coder13/sudoku-app/actions/runs/44504454939): 369 native tests including seven Cargo examples, sixteen capability combinations, four Wasm profiles, strict full/core/variants Cargo documentation, 635 app tests, 429 Wasm contracts, types/catalog and deployment. Fetched main contains the reviewed head and merge with identical shipping sources. Exact-head deploy `6afeccff8b5f24c8591d5a55` is ready. Read-only HTTP verifies both New Puzzle shells return 200 and their entry bundle contains the Anti-King name, ID and vector crown. The shells initialize client selection; these HTTP checks do not claim pointer/keyboard interaction. Deployed Wasm is 3,416,046 bytes with SHA-256 `f4f2a123db3a51b2d7873dc8354098204637dd402efa60ebad58b0e9accdc149`, unchanged from the preceding Linux release. This differs from the Darwin binary below because host code generation differs.

## Performance and compatibility

Darwin arm64, Node 26.13.0, unchanged Wasm SHA-256 `291a61e8b43a92921902173415725a098219e69a8582c8fa4cfc44ef926dc8f7`, 3,416,046 raw / 893,636 default Node-gzip bytes. Run `node --experimental-strip-types --test scripts/bench-anti-king-generation.mts` alone. Each operation uses five warmups and forty samples, with independent assertions outside timing. No owned compiler, suite or other runtime benchmark runs alongside. The in-process transport excludes real worker startup, transfers, browser layout and paint. These are caller measurements; no complete broad all-technique exhaustive scan is claimed.

| Operation | Median / p95 milliseconds |
| --- | --- |
| Published preview | 0.291 / 0.586 |
| Published candidates | 0.011 / 0.014 |
| Published ordinary hints | 0.205 / 0.512 |
| Published app-order rating | 0.158 / 0.188 |
| Published exact solution | 0.018 / 0.021 |
| Published walkthrough | 0.977 / 1.329 |
| Actual Easy New Puzzle | 0.689 / 11.352 |
| Actual Medium New Puzzle | 15.632 / 41.708 |
| Actual Medium fresh miss and fallback | 34.075 / 34.638 |

The generation measurements use seeds 1–45 including warmups and empty played history: Easy returns 45 distinct grids, Medium 33 because some fresh misses select the same checked fallback. Actual-app correctness contracts separately pass prior results as exclusions and verify twenty distinct successive puzzles per difficulty. A seed-one Medium probe confirms the bounded fresh request misses before the timed fallback measurement. Every warmup/timed result is independently unique, completion-correct and Anti-King-dependent.

An alternating paired run compares preceding Skyscrapers main with this integration across twelve controls, including Anti-King, Skyscrapers and ten earlier families. Input positions and complete Board SSR strings match exactly. Ten warmups/forty samples per operation give median input differences -0.002042 to +0.008333 ms and SSR differences -0.044000 to +0.011750 ms. No general speedup is claimed. Slower observed tails include Clone input p95 0.036791→0.057042 ms, Sandwich SSR 0.973917→1.085541 ms and Killer SSR 1.293875→1.388875 ms. All eighty complete paired generation requests and native outcomes match for twenty seeds each of Sandwich, Little Killer, X-Sums and Skyscrapers; their default one-attempt budget is preserved.

The static font reference exposed a missing Unicode king glyph in the QA renderer. The final preview uses the existing Lucide crown SVG and shared chess-preview sizing. Its actual rendered SVG was inspected in light/dark 290/540px reference cards. This checks the glyph/vector and narrow reference presentation, not live CSS, pointer or keyboard behavior. Existing completion contracts now verify Next medium puzzle, Choose difficulty and Choose variant because Anti-King can generate its next puzzle.

Summed production `dist/client/assets` with per-file default Node gzip: JS changes 6,280,281/2,074,283→6,282,186/2,074,620 raw/gzip bytes (+1,905/+337); CSS changes 301,768/41,742→301,801/41,758 (+33/+16). Wasm changes by zero bytes. This asset comparison excludes HTML and service-worker files.
