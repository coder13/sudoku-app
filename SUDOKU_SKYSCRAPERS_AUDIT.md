# Skyscrapers app integration

Base: main `ee473de`. The existing engine supports full ordered visibility rays, exact solutions, human deductions, teaching, rating and generation. This change integrates that family with the app. Native Rust, lockfiles, the app Wasm and all five generated JSON files remain unchanged.

## Rule and full source controls

Each digit is a building height. Looking along a row or column from its outside clue, count the first building and each later building taller than every one before it. The clue gives that count. Standard Sudoku row/column distinctness requires all nine heights 1–9. A clue of 1 forces 9 first; a clue of 9 forces the sequence 1–9 from that edge. This visibility rule has its own `skyscrapers` technique; the Classic single-digit Skyscraper pattern remains separately named.

| Complete published control | Givens / visibility clues | Independent completion | App-order human path |
| --- | --- | --- | --- |
| Bill Murphy, [Pick Up](https://www.gmpuzzles.com/blog/2025/12/skyscraper-sudoku-by-bill-murphy/), 2025-12-02 | 20 / 8 | Unique, printed solution, one search node | Complete Hard, 1,744 points |
| [clover!](https://www.gmpuzzles.com/blog/2025/10/skyscraper-sudoku-by-clover/), 2025-10-29 | 20 / 20 | Unique, printed solution, one search node | Complete Hard, 2,104 points |
| John Bulten, [Tau Cross](https://www.gmpuzzles.com/blog/2021/05/skyscrapers-sudoku-by-john-bulten/), 2021-05-15 | 4 / 15 | Unique, printed solution, eleven search nodes | Complete Hard, 3,798 points |

Fixtures retain every given and outside count, directions, ordered rays, original puzzle/solution PDF URLs, SHA-256 hashes and printed completions. All six PDFs were rendered; the source grids, completions and every visibility count were checked. Clover's printed puzzle grid is 20.5 PDF points below its solution grid; transcription explicitly accounts for that offset and checks the complete twenty-given/twenty-clue inventory. No source constraint is dropped.

The independent oracle uses integer digits, ordinary Sudoku houses, sets and direct row permutations. Numeric completion predicates now cover every native rule type, with an exhaustive TypeScript guard; the search helpers remain scoped to their explicitly implemented rules and reject unsupported relations. Native exact solving matches every printed completion, including all eight square transforms.

Two additional controls are authored regression companions: complete Murphy plus matching Sandwich, X-Sums, Little Killer and Renban clues, and the existing Jigsaw/Killer outside-clue benchmark plus four Skyscrapers counts. Their added clues are not attributed to the original publishers. Both retain every source constraint and have independently unique completions and complete app walkthroughs.

## Import boundary and UI

Native/shared acceptance requires an integer count 1–9, an orthogonal direction and the exact complete ordered nine-cell edge-to-edge ray. Reversed/incomplete rays, altered directions, sum-style parameters and unknown semantics fail explicitly. Every direction/count survives import, storage, sharing and all eight coordinate transforms.

The complete original Coach [9W3o, Standard Skyscraper 2](https://sudoku.coach/en/s/9W3o) is retained in `skyscrapers-unsupported-9W3o.json`, including its code, decoded fields, description and completion. It is a seven-by-seven source with a 49-digit solution and cosmetic-text clues. It remains rejected by automatic import. This does not establish a typed Coach Skyscrapers schema or support for Latin-only, smaller-grid or zero-valued-building rules. Authored context and further schemas remain in [7](https://github.com/coder13/sudoku-app/issues/7).

The shared outside layer draws visibility counts on every edge and preserves the existing grid-border inset shared with candidate links. When orthogonal families mix, S/X/Sk prefixes and a visible legend distinguish Sandwich totals, X-Sums and Skyscrapers counts. Little Killer keeps its diagonal arrows. Original rule indices and repeated anchors are retained. Pure-family puzzles keep conventional numeric clues. Full rays remain visible in teaching crops; Jigsaw borders, cages, crowded candidates and link insets retain their local frame. Every native rule type now has an accessible app name checked by TypeScript.

Local input support uses a bounded exact visibility calculation from placed digits only. A state contains the used-digit mask and visible count; these determine the prefix length and maximum height. A 5,120-byte memo is reset and reused for each clue during one call. No pencil-mark assumptions or uniqueness assumptions enter this calculation. Independent direct permutations test every count 1–9, every one-digit placement at every cell, varied partial rows, duplicate digits and impossible states. Both Pencil modes, bulk entry, conflicts and undo/redo follow that support.

Actual worker callers verify candidates, several hints, every selected hint page, Finder counts, changed positions, disabled techniques, explicit removals, complete human replay, exact completions, storage reload/history and sharing. Proof replay independently enumerates each cited row's assignments and counts its visible buildings. Clues of 1 and 9 have direct explanations, also checked on multiple-solution puzzles. The real Learn example, three practice positions and a fresh drill retain visible clues and sound answers. Native scoring remains 70 points, Hard, version 8.

## Required New Puzzle

Three Hard recipes use the full checked PDF layouts and printed completions. Native one-attempt calibration accepts twenty of twenty seeds per source within 20,000 nodes. All sixty are distinct, independently unique, thirty-given puzzles with complete Hard paths using Skyscrapers and multiple solutions without that family. Each source contributes twenty distinct results.

The actual app New Puzzle caller verifies twenty distinct independently unique/Skyscrapers-dependent Hard puzzles, several hints per puzzle, deterministic repeats and played-puzzle exclusions under every square symmetry. Mixed aliases and reordered clue lists cannot bypass exclusions. Generation removes givens from fixed layouts and applies valid coordinate transforms; it does not claim arbitrary new visibility-clue pattern discovery.

## Validation

Final local validation passes 634 app tests and 420 Wasm contracts, including explicit non-unique visibility proofs. Strict app/new-contract/benchmark TypeScript and the 123-component catalog pass. Production prerenders 171 routes and passes three actual-build offline checks. The implementation completes app acceptance/rendering for all 27 native rule types plus Jigsaw layouts: 28 named variants plus Classic. Fifteen variants plus Classic have New Puzzle choices; thirteen older families still need recipes. Exact-head CI/deployment and release remain pending.

Twenty-four static SVG artifacts cover light/dark 290/540px views of all published sources, authored combinations and crowded candidates. Representative source, dark, narrow, mixed and candidate renders were visually inspected. They use the real clue SVGs with a reference grid; this is not live CSS layout or browser pointer/keyboard verification. Existing component contracts check candidate buttons, accessible labels, overlay behavior and unchanged link coordinates.

All five generated JSON files and the packaged Wasm match pinned preceding main byte for byte. The local production build uses that already verified compiled artifact; no local native rebuild is claimed.

## Performance

Darwin arm64, Node 26.13.0, Wasm SHA-256 `291a61e8b43a92921902173415725a098219e69a8582c8fa4cfc44ef926dc8f7`, 3,416,046 raw / 893,636 Node-gzip bytes. No owned compiler, suite or second runtime benchmark runs alongside the controlled samples. Reproduce with `node --experimental-strip-types --test scripts/bench-skyscrapers-app.mts` in isolation.

Fast operations use five warmups/twenty samples; app-order rating, hints, preview and walkthrough use two/five. p95 of five is the maximum. Assertions are outside timing. The in-process transport includes serialization/app conversion and excludes real worker startup, transfers, browser layout and paint. SSR excludes module loading. Raw rate uses the native default order; raw app-rate uses the actual app order. Exhaustive requests explicitly select Skyscrapers only, so these results do not claim a completed broad all-technique scan.

Values are median/p95 milliseconds.

| Operation | Murphy | clover! | Bulten | Authored mixed | Jigsaw mixed |
| --- | --- | --- | --- | --- | --- |
| raw candidates | 0.223 / 0.247 | 0.806 / 0.829 | 2.429 / 2.459 | 0.344 / 0.361 | 0.689 / 0.743 |
| raw analyze | 0.545 / 0.605 | 2.161 / 2.198 | 14.838 / 15.277 | 0.913 / 0.993 | 1.279 / 1.312 |
| raw solve | 0.547 / 0.570 | 2.149 / 2.289 | 13.161 / 13.759 | 0.908 / 0.974 | 1.287 / 1.389 |
| raw rate | 0.588 / 0.628 | 2.042 / 2.096 | 13.587 / 14.124 | 0.665 / 0.701 | 0.897 / 0.972 |
| raw app-rate | 0.819 / 0.988 | 2.235 / 2.353 | 14.173 / 14.629 | 0.928 / 0.940 | 0.916 / 0.938 |
| raw ten hints | 0.394 / 0.406 | 1.106 / 1.117 | 3.869 / 3.953 | 0.538 / 0.589 | 0.774 / 0.856 |
| raw selected exhaustive hints | 0.435 / 0.780 | 1.081 / 1.091 | 3.824 / 4.256 | 0.423 / 0.430 | 0.788 / 0.818 |
| preview | 1.967 / 2.009 | 6.615 / 6.820 | 41.986 / 42.367 | 2.772 / 2.863 | 3.617 / 3.676 |
| play candidates | 0.211 / 0.217 | 0.802 / 0.816 | 2.424 / 2.493 | 0.345 / 0.361 | 0.694 / 0.715 |
| ordinary hints | 0.676 / 0.697 | 2.007 / 2.135 | 3.916 / 4.173 | 0.872 / 0.901 | 1.444 / 1.447 |
| walkthrough | 1.854 / 2.364 | 3.618 / 4.163 | 15.027 / 15.972 | 1.984 / 2.151 | 2.164 / 2.291 |
| input with all candidates | 0.099 / 0.140 | 0.191 / 0.222 | 0.305 / 0.395 | 0.250 / 0.323 | 0.321 / 0.378 |
| Board SSR | 1.641 / 2.219 | 0.945 / 1.153 | 1.725 / 1.958 | 0.966 / 1.173 | 1.389 / 1.675 |

Fixed-template Murphy Hard generation measures 13.523/17.063 ms, with six attempts and 20,000 nodes per exact check. All twenty-five warmup/timed results are distinct and independently unique/Skyscrapers-dependent. Actual Hard New Puzzle measures 24.050/30.359 ms while cycling all three recipes; this is a different layout workload, not a paired estimate of wrapper overhead. Independent assertions stay outside timing.

Ordinary hints return ten choices for all five controls. Retained raw-instance Wasm capacities are Murphy 1,507,328, clover 1,638,400, Bulten 1,572,864, mixed 1,572,864 and Jigsaw mixed 1,507,328 bytes. These are capacity snapshots, not peaks or full JavaScript/worker heap measurements. The existing broader hint/performance work remains in [192](https://github.com/coder13/sudoku-app/issues/192), including the unfinished X-Sums Quintuple Pattern Overlay case; no expensive enabled technique is hidden to claim parity.

### Existing families and package cost

An alternating paired run compares the pinned preceding X-Sums app with this integration for ten controls: Between, Region Sum, Clone, Sandwich, Little Killer, X-Sums, the existing mixed outside Jigsaw/Killer control, Classic, Killer and Diagonal. Input positions and complete SSR output match exactly. Each operation has ten warmups/forty samples. Median input differences range -0.002917 to +0.002542 ms; SSR medians range -0.001208 to +0.014333 ms. Slower tails remain visible, including Between SSR p95 1.139→1.358 ms, Clone 1.205→1.356, Little Killer 0.948→1.136 and the existing outside mixture 1.411→1.750. These observations do not establish a general speedup.

The shared sum/count recipe refactor also preserves all sixty complete generation requests and native outcomes checked against the pinned X-Sums app: twenty seeds each for Sandwich Hard, Little Killer Medium and X-Sums Hard, using the same app technique order and 20,000-node bound.

Summed production `dist/client/assets`, per-file Node gzip at its default level: JS changes 6,274,466/2,072,929→6,280,281/2,074,283 raw/gzip bytes (+5,815/+1,354); CSS changes 301,614/41,717→301,768/41,742 (+154/+25). Wasm changes by zero bytes. This asset-only comparison excludes HTML and service-worker files.
