# Engine and domain UAT coverage

Tested on 2026-11-17 against the current application source (`07eae53`, with the
local UAT fixes) and the matching prebuilt browser engine. No Rust rebuild was
needed. This ledger covers engine behavior; browser interaction coverage is in
[full-coverage.md](full-coverage.md).

**Result:** all existing compiled-engine suites passed. Both expanded generation
matrices passed all 132 samples, covering every advertised variant/difficulty
choice. No additional engine defect was confirmed.

## Engine identity

- WASM: `src/sudoku/generated/engine.wasm`.
- SHA-256: `b3155357f4cfd0ad7d40cddb5ef9703470febe265f9c47ff99aec3e5d0965bcb`.
- Build profile: `app`; features `wasm-api`, `variants`, `generation`, `teaching`.
- Runtime capabilities matched the profile: Classic, variants, generation, and
  teaching were enabled.
- Runtime catalogs: 89 Classic entries, 111 variant catalog entries; scoring
  versions 11 and 5 respectively.

## Existing suites

| Suite | Result | Coverage |
| --- | --- | --- |
| `tests/engine-wasm.mts` | 122 passed, 0 failed | 66 top-level tests and 56 variant/difficulty subtests; compiled protocol, hint search/counts, proof replay, lesson examples/drills, generation budgets and cancellation, profiles, Classic tier targets, variants, fog, and advanced techniques |
| `tests/collections-wasm.mts` | 1 passed, 0 failed | All 160 collection puzzles: uniqueness, complete logical solve, exact published difficulty, score, and scoring version |
| `tests/action-history-wasm.mts` | 3 passed, 0 failed | Grouped manual-removal attribution, rejection of a removed solution candidate, and variant attribution through the background engine |

The existing variant suite regenerates **all 282 saved recipes** and verifies
their requested ratings. For each of the 56 offered variant/difficulty pairs it
also checks uniqueness, a complete replayable logical solve, variant-rule use,
applying deductions, save validity, restart behavior, and the final missing-digit
hint. Logs are [engine-existing.log](engine-existing.log),
[engine-collections.log](engine-collections.log), and
[engine-action-history.log](engine-action-history.log).

## Offered-choice inventory

The inventory comes from the same `variantDifficulties` function used by the UI.
There are **9 selectable variants and 66 offered variant/difficulty choices**.

| Variant | Offered difficulties | Choices | Samples per matrix |
| --- | --- | ---: | ---: |
| Classic | Beginner, Easy, Medium, Tricky, Hard, Very Hard, Expert, Master, Extreme, Impossible | 10 | 20 |
| Killer | Easy, Medium, Hard, Very Hard, Master | 5 | 10 |
| Windoku | Beginner, Easy, Medium, Tricky, Hard, Very Hard, Expert, Master, Extreme, Impossible | 10 | 20 |
| Diagonal | Easy, Medium, Tricky, Hard, Very Hard, Expert, Master, Extreme | 8 | 16 |
| Jigsaw | Easy, Medium, Tricky | 3 | 6 |
| Anti-Knight | Easy, Medium, Tricky, Hard, Very Hard, Expert, Master, Extreme | 8 | 16 |
| Thermometer | Easy, Medium, Tricky, Hard, Very Hard, Expert, Master, Extreme | 8 | 16 |
| Arrow | Easy, Medium, Tricky, Hard, Very Hard, Expert, Master | 7 | 14 |
| Kropki | Easy, Medium, Tricky, Hard, Very Hard, Expert, Master | 7 | 14 |
| **Total** | | **66** | **132** |

`Unfair` remains a historical save grade. It is not a current generation choice.
Statistics now displays its row only when solved history contains that grade;
the existing grade-label and save compatibility behavior is preserved.

## Expanded production-generation matrices

[engine-matrix.mts](engine-matrix.mts) runs the production `generateClassic` and
`generatePlayableVariant` functions against the actual compiled WASM. A Node
Worker adapter supplies the browser engine protocol without replacing the
solver or generation logic.

Two scenarios were run, both with seeds **0 and 1** for every offered choice:

| Scenario | Result | Evidence |
| --- | --- | --- |
| Independent generation; no saved-history exclusions | 132 passed, 0 failed | [Results JSON](engine-matrix-independent-results.json), [log](engine-matrix-independent.log) |
| Second generation receives the first puzzle as saved history | 132 passed, 0 failed | [Results JSON](engine-matrix-results.json), [log](engine-matrix.log) |

Each generated sample verifies:

1. Exactly 81 grid cells, at least one empty cell, an 81-digit solution, and
   preservation of every given.
2. Rows, columns, and boxes or Jigsaw regions contain each digit once. Region
   membership covers all 81 cells exactly once.
3. Independent checks of each offered variant rule: cage sums and distinct
   digits, both diagonals, Windoku extra houses, knight moves, increasing
   thermometers, arrow sums, and positive Kropki dot relations.
4. Engine uniqueness, agreement with the engine solve, exact requested
   difficulty, and valid variant save data.
5. Candidate masks have 81 valid masks, no candidates in given cells, no given
   peer conflicts, and retain the unique solution digit in every empty cell.
6. Up to ten returned hints in each of two app states: before candidate
   generation and after Generate all candidates. Every action uses a valid
   empty cell and digit; placements agree with the solution and removals preserve
   it. Applying the first hint changes the game and preserves uniqueness.
7. A completed grid has all-zero candidate masks and no further hints.
8. In the history scenario, the next Classic puzzle excludes an equivalent
   saved structure; the next variant puzzle has different givens from the saved
   puzzle. All 66 second-generation cases passed.

The two runs checked **5,252 returned hint choices** in total. Seed-zero cases
are repeated across the two scenarios. These counts include repeated proofs
returned under different candidate-display states.

All **24 unsupported variant/difficulty combinations** were also rejected with
the expected `unsupported` code in each run: **48 checks passed**.

Independent seeds reused the same bounded fallback puzzle in six choices
(Killer Hard/Master, Windoku Medium, Anti-Knight Hard, Arrow Hard, Kropki Tricky).
The history-aware production path returned a different puzzle for each of them.

## Reproduce

Run from the repository root with the matching prebuilt WASM present:

```sh
node --experimental-strip-types --test tests/engine-wasm.mts
node --experimental-strip-types --test tests/collections-wasm.mts
node --experimental-strip-types --test tests/action-history-wasm.mts
node --experimental-strip-types uat/2026-11-17/engine-matrix.mts --independent
node --experimental-strip-types uat/2026-11-17/engine-matrix.mts
```

The matrix writes its results after every sample, including the WASM hash, base
commit, profile, exact choice list, seeds, exclusion count, puzzle hash, hint
count, status, and elapsed time. A failure sets a nonzero process exit code.

## Limits

- Every offered choice and every saved variant recipe is covered. Arbitrary
  random seeds, every possible puzzle, and every combination of custom rules
  are not exhaustively enumerated.
- Uniqueness and rating use the compiled engine. The independent checks verify
  completed grid constraints and hint actions; they are not a second independent
  uniqueness solver or formal proof system.
- The matrix validates two generated samples per choice in each history
  scenario. It does not exhaust a recipe bank or every symmetry before checking
  fallback behavior.
- The Node Worker adapter checks the production message protocol and domain
  logic. Real browser worker scheduling, rendering, touch input, and user-facing
  cancellation are separate browser cases.
- Recorded elapsed times are local test diagnostics. They are not server-load
  or physical-phone performance measurements.
- The full `app` capability profile was used throughout the browser-engine
  matrices. A follow-up [native feature sweep](production-build.md) passed all
  eight optional-feature combinations. Alternate WASM-profile cross-builds
  remain untested because the host lacks the WASM target standard library.
