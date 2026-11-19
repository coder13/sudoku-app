# Dense Pattern Overlay support audit

This work starts from main `5aca356`, after the rectangle graph release. [Issue 179](https://github.com/coder13/sudoku-app/issues/179) preserves the complete HCHW position before app replay step 22. Its Quintuple Pattern Overlay scan returns no proofs despite expensive support searches. All original Modular paths, two-cell totals, the white dot, entries and explicit removals remain intact.

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

The first candidate passes all 366 native unit/integration/documentation cases; the refined fast path repeats those gates before release. The actual-Wasm regression retains normalized source rules, the exact replay and domains, all three one-digit deductions, empty higher-width proofs, app Finder counts, empty hint pages and edited positions. No temporary instrumentation or trial family-ordering code ships.

## Fast-control regression found before release

The first paired run reduced the saved dense request from 61.5–62.0 seconds to 115–124 ms, but prefixes 23/24 rose from roughly 9–11 ms to 49–63 ms and the final stall from 6 ms to 18 ms. That candidate is not released. The revised search tries the original order first and caps alternate work by inspected layouts. It must retain the dense gain while restoring the fast controls before merge. The empty-Classic benchmark also preserves the public `multiple` validation result rather than assuming an empty proof list.

## Release gates in progress

The frozen artifact comparison must retain every catalog, score, proof, trace and hint page. Positive Classic and variant controls cover all five overlay widths, alongside the existing multiple-solution rejection for empty Classic grids and HCHW prefixes 22–24 and its final stall. Broader exact/rating/generation and actual app controls, four package profiles, strict Cargo documentation, TypeScript, the app/Wasm suites, production build and exact-head CI/deployment gates remain required before merging. Package and committed-memory costs will be recorded with the final timings. [Performance queue](https://github.com/coder13/sudoku-app/issues/88)

```sh
node --experimental-strip-types scripts/bench-overlay-support.mjs before.wasm src/sudoku/generated/engine.wasm --samples=2 --warmups=0
node --experimental-strip-types scripts/compare-engine-pruning.mjs before.wasm src/sudoku/generated/engine.wasm --palindrome-trace --classic-tridagon --xv --renban --entropic-corpus --global-entropy-corpus --modular-corpus
```
