# Palindrome New Puzzle integration

Base: main `99fcc53`, with reviewed Whispers engine/app source `cbd8f05`. This isolated change adds Easy and Medium Palindrome generation and corrects private played-puzzle identity for equivalent equality rules. Local release checks and controlled measurements pass; exact-head CI and deployment are pending. Main currently offers nineteen variants plus Classic; nine older New Puzzle families remain under issue 189.

## Rules, sources and generation

Matching cells at equal distances from a Palindrome line's ends contain the same digit. The center of an odd-length path has no matching partner. Existing source geometry, drawing segments, mixed rules, candidates, hints/Finder, human and exact solutions, practice and sharing remain integrated. The technique stays Easy at 21 points, without a uniqueness premise; scoring version 8 is unchanged.

The generation fixture records all four Clover paths and eight Newman path geometries. Clover's complete published puzzle and the original Newman Anti-Knight/Palindrome puzzle remain unchanged controls. Fresh pure-Palindrome templates use those geometries with sampled completions. The Newman geometry experiment deliberately omits Anti-Knight only in its new generated template; it is not a transcription of the original mixed puzzle.

One-attempt seeds 1–100 at 0–30 givens yield 100 Clover/99 Newman-geometry Easy and 27/40 Medium results. Every accepted puzzle is independently unique and has multiple solutions without the equality rule. A 14–24-given Medium range accepts 26 seeds per geometry. These finite samples guide recipes and do not establish acceptance rates for arbitrary puzzles or seeds.

Thirty checked recipes per level include fifteen per geometry. Easy uses at most thirty givens; Medium uses fourteen to twenty-four. Actual app generation tries a fresh seed with one attempt and a 20,000-node exact-check bound, then checked fallback seeds while retaining full played-puzzle exclusions. Several hints and complete app-order paths match the advertised status, points, counts and hardest technique. Tests replay every Palindrome deduction from its stated domains and exact mirror equalities; every other action agrees with the independent completion. Sixty selected native recipe traces checked 517 mirror proofs and 5,692 actions during preparation.

The chooser reuses native variant/difficulty controls and the actual Palindrome renderer for its preview. Continue/Back routes retain the selected family, saved preferences select the proper level, and completed pure Palindromes offer another puzzle. The original mixed Newman puzzle retains Anti-Knight and asks the player to choose another family rather than generating a weaker pure puzzle. Actual storage reload, progress, undo/redo, exact solutions and shared starting definitions are covered.

## Equivalent played puzzles

Four archived native cases reproduced duplicate generation when an excluded puzzle reversed its paths or split them into equivalent mirrored pairs. A private equality normalization now finds transitive matching-digit components across Palindrome pairs and Clone groups before the existing geometric/digit key. Reversed paths, split pairs, redundant groups, alternative drawings and free odd centers therefore share the same exclusion identity. Added equalities, changed mirror partners and companion rules remain distinct.

Normalization is private to generation exclusions. It does not rewrite source/output rules, proof references, public canonical definitions, technique order or ratings. Existing Whispers undirected-edge normalization remains in the same private played-key module. Native tests cover every square transform, renamed digits, transitive/redundant equalities and distinct-premise controls. Actual app contracts cover twenty-one equivalent representations per level; direct native contracts cover all four archived cases and equivalent Clone representations.

## Validation and measurements

Local checks pass all 373 native cases including seven Cargo examples, 647 app tests, 469 Wasm contracts, strict app/new-contract/benchmark types and the 124-component catalog. Wasm is freshly rebuilt. The actual New Puzzle chooser/difficulty SSR, complete Continue/Back paths, saved preferences and completed-puzzle behavior pass. All 171 production routes and three offline checks pass, including exact equality with the tested source Wasm. Light/dark 290/540px reference cards use the actual shared renderer and its CSS. These static/component references do not constitute browser keyboard, layout, paint or interaction testing. Exact-head CI and deployment are pending.

## Controlled measurements

Darwin arm64, Node v26.13.0, installed stable rustc 1.100.0. The preceding release and current Wasm use the same installed toolchain and app profile; the retained previous artifact/source remain intact. Each app caller has five warmups and forty measured samples, with independent assertions outside timing and no owned compiler, suite or other benchmark alongside. The in-process worker adapter excludes real worker startup/transfers and browser rendering; ordinary hints do not measure an exhaustive all-technique scan.

| Actual caller | Median ms | p95 ms |
| --- | ---: | ---: |
| Complete published Clover import preview | 0.273 | 0.385 |
| Published candidates | 0.016 | 0.019 |
| Published ordinary hints | 34.489 | 35.138 |
| Published app-order rating | 0.118 | 0.127 |
| Published exact solution | 0.030 | 0.036 |
| Published human walkthrough | 1.059 | 1.431 |
| Easy New Puzzle | 0.751 | 3.087 |
| Easy with thirty played puzzles | 1.254 | 1.340 |
| Medium New Puzzle | 4.506 | 8.575 |
| Medium known fresh miss and fallback | 4.563 | 4.828 |
| Medium with thirty played puzzles | 4.976 | 5.131 |

Varying-seed calls include fresh misses and checked fallbacks. Forty-five empty-history requests produce 45 Easy and 28 Medium logical identities. Successive-history contracts independently verify thirty distinct actual puzzles per level. The fixed-seed app history measurement excludes thirty actual prior app results. No universal latency, seed-acceptance or empty-history novelty guarantee follows from this finite sample.

All 525 preceding recipe requests are identical. All 220 complete paired legacy generation outcomes match: 175 successes and 45 search limits. A separate native comparison preserves 716 complete response pairs: seventeen published/control puzzles through initial, placed and explicitly removed candidate positions; one hundred direct Palindrome/Clone/German/Dutch generation requests; and 225 warmup/measured history pairs. The direct generation sample retains seventy successes/thirty search limits. Whole response bodies are compared with only transport IDs omitted. Repeated timing inputs are included; these are not 716 distinct puzzles. The deliberately repaired equivalent-history cases are checked separately and are not claimed to preserve their old erroneous outputs.

| Fixed native generation control | Played definitions | Before median/p95 ms | After median/p95 ms |
| --- | ---: | ---: | ---: |
| Palindrome Easy, seed 99 | 30 | 1.096 / 1.221 | 1.264 / 1.344 |
| Palindrome Medium, seed 102 | 30 | 1.671 / 1.714 | 1.830 / 1.887 |
| Clone Easy, seed 99 | 3 | 0.637 / 0.665 | 0.640 / 0.676 |
| German Whispers Medium, seed 99 | 30 | 2.780 / 2.858 | 2.788 / 2.900 |
| Dutch Whispers Medium, seed 99 | 30 | 4.693 / 4.988 | 4.674 / 4.975 |

Each native control uses five warmups and forty alternating paired samples. The Medium Palindrome control uses seed 102 after bounded preflight retained the search limits at 99–101; the app's separate fixed-99 timing includes its fallback. The roughly 0.16–0.17 ms Palindrome median cost buys required equality normalization, not a performance win. Clone has three checked recipes; it is not described as a thirty-game history. Both engines retain 4,849,664 bytes of linear memory after the corpus/timed calls. This is capacity, not live allocation, process RSS or a leak test.

Complete input positions and Board SSR strings match across sixteen controls. Ten warmups and forty alternating samples put input median ranges at 0.013–0.208 ms both before/after and SSR at 0.732–1.291 before / 0.734–1.295 after. Individual tails vary; this supports compatibility without establishing a rendering/input speedup or measuring browser paint.

## Build and package

Fresh Darwin Wasm is 3,403,744 raw / 896,543 default-Node-gzip bytes, SHA-256 `724b2b20a96b6fcdea4fac80f89e2ee484ff2e219c4340f33fee6d432a0394e7`. The preceding same-toolchain artifact is 3,396,953 / 892,775, SHA-256 `5e46c19112ec78cf40d718a258d01dac2e1e47627cd893ec32c7ea69bc5744b8`. The measured delta is +6,791 raw / +3,768 gzip bytes. Build paths and optimizer/code-generation effects can influence these observations; no general binary-size optimization is claimed.

Production client asset sums are JavaScript 6,316,175 raw / 2,077,164 gzip (+8,319 / +471), CSS 303,032 / 41,971 (unchanged) and Wasm as above. Totals sum default Node gzip per client asset and exclude HTML, the service worker and cache manifests. All five generated metadata JSON files and Cargo/package lockfiles remain byte-identical. CI must independently verify sixteen capability combinations, four profiles and strict full/core/variants Cargo documentation before merge. The original dirty R&D worktree remains untouched.

Keep remaining authored Coach formats, grid/symbol extensions, Fog and human/performance gaps open under issues 7, 35, 88 and 192. No completion claim for full generation parity follows from this one-family change.
