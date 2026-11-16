# Sudoku engine

Validate classic and rule-based 9 × 9 Sudoku puzzles, find and explain deductions, and rate ordered solve paths. Generate puzzles that meet clue, score, or technique targets. The engine runs as a Rust library, as a WebAssembly module in the app's browser worker, and as a command-line tool for batch work.

Run this command from the repository root to build and open the API reference.

```sh
cargo doc --locked -p sudoku-app-engine --all-features --no-deps --open
```

## Start with one puzzle

Add the engine as a path dependency in another Cargo package. Set the path relative to that package's manifest.

```toml
[dependencies]
sudoku-app-engine = { path = "../sudoku-app/crates/engine" }
```

Check the grid, follow the default logical path, and read its rating. This example finishes at 204 points.

```rust
use sudoku_app_engine::{Analysis, Difficulty, SolveStatus, Technique, analyze, parse_givens, solve_logically};

let givens = parse_givens(
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
).unwrap();
assert_eq!(analyze(&givens), Analysis::Unique);

let trace = solve_logically(&givens, Technique::DEFAULT_ORDER).unwrap();
assert_eq!(trace.status, SolveStatus::Solved(Difficulty::Easy));
assert_eq!(trace.score.points, 204);
assert_eq!(trace.positions().count(), trace.steps.len() + 1);
assert_eq!(trace.replay_step(0).unwrap().before.givens, givens);
```

## Grids, candidates, and validation

A [`Board`] stores 81 digits in row-major order. Cell indices start at 0, so row 3, column 5 is cell 22. A [`House`] is a row, column, or box, each numbered from 0 in the API. Grid strings accept digits and use `0` or `.` for empty cells. [`parse_givens`] checks the format.

Use [`candidates`] to compute the candidates allowed by the placed digits in each cell. Each of the 81 masks uses bits 0 through 8 for digits 1 through 9. A filled cell has mask 0. Use [`PositionSnapshot`] to keep the givens, player placements, and established candidate removals together. Supply proven removals as masks. A candidate the player omitted from their notes may still be available to the engine. If a player clears or replaces a placed digit, discard removals that depended on the old position.

[`analyze`] distinguishes a conflict, no solution, a unique solution, multiple solutions, and a search limit. It stops counting at two solutions. [`solve`] finds one completion within its budget. A completion can exist for a puzzle with multiple solutions, so check uniqueness with `analyze` when importing or publishing puzzles.

The exact search tracks used digits in rows, columns, and boxes with bit masks. At each search node it branches on an empty cell with the fewest candidates, making cells with no candidates immediate dead ends. Logical APIs can first apply deductions that establish facts without assuming uniqueness. This can make the exact check cheaper on sparse grids. If a uniqueness technique reaches the exact-search limit, the logical solver can try other techniques and retry uniqueness after a subsequent placement.

## Logical paths, profiles, and scoring

[`solve_logically`] starts from the givens. [`solve_position`] continues from a snapshot with placements and removals. At each position the solver takes the first productive deduction in the supplied technique order, applies all its actions, and starts again at the top of the order. A valid puzzle can return [`SolveStatus::Stalled`] when the selected techniques run out of moves. That trace still contains the positions it reached and a partial point total.

Use [`Technique::ALL`] for the detector inventory and [`Technique::DEFAULT_ORDER`] for the default profile. [`SolverProfile::from_ids`] accepts stable IDs in priority order, validates unknown and duplicate IDs, and allows an empty list. Omit a technique to disable it. [`Technique::aliases`] supplies alternate names for display. Use the stable ID when saving a profile.

| Family | Detectors |
| --- | --- |
| Singles and subsets | Full House, Naked Single, Hidden Single, Pointing, Claiming, Locked Pair and Triple, Naked and Hidden Pairs through Quadruples |
| Fish | X-Wing, Swordfish, Jellyfish, finned and Sashimi forms, Franken Fish and Mutant Fish with two to four houses per side |
| Wings and single-digit patterns | W-Wing, XY-Wing, XYZ-Wing, WXYZ-Wing, Skyscraper, Two-String Kite, Empty Rectangle |
| Coloring and inference | Simple Coloring, 3D Medusa, X-Chain, XY-Chain, Alternating Inference Chain, continuous and discontinuous Nice Loops, and grouped versions |
| Uniqueness | Unique Rectangle Types 1–6, Hidden Rectangle, BUG+1 |
| Advanced deductions | Aligned Pair and Triplet Exclusion, Tridagon and Tridagon Forcing Net, Forcing Chain, Forcing Net, Dynamic Forcing Net, Nested Forcing Net, ALS-XZ, ALS-XY-Wing, ALS Chain, Sue de Coq, Death Blossom, Junior Exocet, SK Loop, Multi-Sector Locked Sets |

The catalog records the point cost, technique difficulty, and uniqueness assumption for each detector. Complex fish, aligned exclusions, Tridagons, and extended forcing nets are available in hints and selected-technique searches. Add their IDs to a custom profile to use them for solving and rating.

Aligned Exclusion checks what happens when two or three selected cells take specific digits. Reject an assignment if it repeats a digit in peer cells or empties a common peer. Remove a candidate when every assignment that uses it fails. The proof records the rejected assignments and their reasons. Aligned Pair Exclusion costs 310 points and Aligned Triplet Exclusion costs 370 points.

Dynamic Forcing Net extends a branch by applying Pointing and Claiming after ordinary net propagation. A branch starts by assuming a candidate is true or false. Each locked candidate step records both houses and the earlier removals that confine the digit to their intersection. The detector reports a deduction when that step contributes to a contradiction or a conclusion shared by every alternative. Its initial cost is 800 points at the Extreme tier. Append `dynamic-forcing-net` to your solver order to try it after the other techniques.

Nested Forcing Net tries a second assumption when dynamic propagation runs out of moves. If both truth values of the second candidate lead to contradictions, the first assumption is false. The proof stores both cases and the facts each case imports from the outer branch. [`ForcingCase`] documents how to read the step indices. Append `nested-forcing-net` to opt in at 950 points per deduction.

A regular Tridagon uses four boxes in two bands and two stacks. Select three cells in different rows and columns within each box. The pattern can be impossible to fill with the same three digits, so at least one extra candidate must be true. The extra candidates are called guardians. `tridagon` places a sole guardian or removes a candidate that conflicts with every guardian. These techniques cost 410 and 850 points at the Extreme tier.

`tridagon-forcing-net` can prove a conclusion shared by the surviving guardian branches. It can also assume the opposite move and use the requirement that at least one guardian must be true to show a contradiction. If only one guardian remains possible in such a branch, that guardian must be true. In the proof, [`ForcingScope::Guardians`] refers to the guardians listed in the enclosing Tridagon evidence.

Use [`rate_puzzle`] for a rating without the trace. [`PuzzleRating`] carries the total points, technique counts, hardest technique, solve status, technique order, and [`SCORING_VERSION`]. Each deduction adds its technique's cost once, regardless of how many candidates it removes. The point bands have inclusive ceilings of 800, 1,000, 1,600, and 1,800 for Easy, Medium, Hard, and Unfair. Higher scores are Extreme. A complete path's difficulty is the higher of its point band and the hardest technique's tier. Save the order and scoring version with the rating so you can reproduce it.

Use [`LogicalSolve::replay_step`] to examine a deduction between its before and after positions. [`LogicalSolve::move_availability`] counts distinct moves from enabled Easy techniques at each position. It flags an unfinished grid with zero or one such move.

[`compare_paths`] returns two ordered traces from the same position, one with the selected technique and one with it removed. The enabled profile appends the technique if it was absent. [`search_alternate_path`] tries other valid deductions while excluding the selected technique. Its budget counts expansions of distinct unfinished positions. It can find a path, finish exploring the supported moves, or return an inconclusive result at the budget. A found path contains the actual steps and their rating.

```rust
use sudoku_app_engine::{
    AlternatePathStatus, PositionSnapshot, SolverProfile, Technique, compare_paths,
    parse_givens, search_alternate_path, solve,
};

let givens = parse_givens(
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
).unwrap();
let complete = solve(&givens).unwrap();
let mut one_blank = complete;
one_blank[0] = 0;
let start = PositionSnapshot::new(one_blank);
let profile = SolverProfile::from_ids(["hidden-single", "naked-single"]).unwrap();
let compared = compare_paths(&start, profile.technique_order(), Technique::HiddenSingle).unwrap();
assert_eq!(compared.with_technique.score.points, 14);
assert_eq!(compared.without_technique.score.points, 4);

let alternate = search_alternate_path(
    &start, profile.technique_order(), Technique::HiddenSingle, 1,
).unwrap();
assert_eq!(alternate.status, AlternatePathStatus::Found);
assert_eq!(alternate.path.unwrap().board, complete);
```

## Ranked hints, proofs, and practice

[`ranked_hints`] searches the current position and returns up to the requested number of distinct moves, including a single move when that is all it finds. Pass an explicit list of disabled techniques for hints. The search prioritizes difficulty, point cost, and proof size. It compares house counts within a technique and uses the first action's location to break remaining ties. It keeps one proof per complete set of actions and stops after reaching the limit. [`hint_choices`] and [`hints_at`] retain the native API that asks whether there are at least two moves.

Use [`next_deduction`] or [`next_enabled_deduction`] to reveal a technique, the [`ProofPattern`] to inspect, and finally the deduction. A [`Hint`] carries the technique, its [`HintEvidence`], and the placements or removals it proves. Use [`deductions`] or [`deductions_at`] to inspect all the proofs found by specific techniques. These functions group proofs by their complete action set and identify the affected cells and candidates for each move. Use [`technique_deductions_at`] for the ungrouped results of one detector.

Practice can start from a curated fixture via [`Technique::practice_examples`] or from the position before the first use of a technique in a custom trace via [`LogicalSolve::practice_position`]. [`check_practice_move`] accepts one proposed placement or removal and looks for a proof of that action from the target technique, including actions within a larger deduction.

```rust
use sudoku_app_engine::{Technique, check_practice_move, deductions_at};

let technique = Technique::XWing;
let [example, _, _] = technique.practice_examples();
let position = example.position().unwrap();
let proposed = example.expected_actions[0];
let proof = check_practice_move(&position, technique, proposed).unwrap().unwrap();
assert_eq!(proof.technique, technique);
assert!(proof.actions.contains(&proposed));
assert!(deductions_at(&position, &[technique]).unwrap().iter()
    .any(|group| group.actions == example.expected_actions));
```

## Targeted generation

[`generate`] aims for 34 clues. Use [`generate_matching_with_mode`] to set a clue count or range, a difficulty or point range, and a technique target. With an empty template slice the search fills a grid using the seed, then attempts to remove clues while preserving uniqueness. With supplied grids it searches verified templates. Use [`generate_constrained`] as a convenience for an exact clue count and optional point range.

- [`TechniqueTargetMode::Anywhere`] looks for the technique in the configured solve path.
- [`TechniqueTargetMode::First`] requires it on the first step of that path.
- [`TechniqueTargetMode::ExclusiveOpening`] requires it to be the only technique in the full catalog that can produce a deduction from the givens. This includes techniques absent from the profile and alternative proofs of the same move.

A difficulty or point target requires a complete logical solve with the supplied profile. A technique-only target can match a puzzle that stalls later. Invalid or incompatible criteria return an error before attempting generation. Exhaustion means the search found no match in its attempt budget.

Use [`builtin_templates`] and [`generate_from_pool`] for low clue counts or difficult score targets. A pool attempt adds solution digits when needed, reorders rows and columns within the allowed Sudoku groups, may transpose the grid, and renames digits. It rates the final grid under the requested order because equivalent grids can take different logical paths. Use [`VerifiedTemplate::verify`] once for each custom template. [`canonical_puzzle`] identifies equivalent grids across these transformations for deduplication and benchmarks.

```rust
use sudoku_app_engine::{
    GenerationCriteria, GenerationRating, SolveStatus, Technique, TechniqueTargetMode,
    builtin_templates, generate_from_pool,
};

let criteria = GenerationCriteria {
    clues: 17..=17,
    rating: Some(GenerationRating::Score(1_001..=1_600)),
    technique: None,
    technique_order: Technique::DEFAULT_ORDER,
};
let puzzle = generate_from_pool(
    42, &criteria, TechniqueTargetMode::Anywhere, builtin_templates(), 208,
).unwrap();
assert_eq!(puzzle.board.iter().filter(|&&digit| digit != 0).count(), 17);
assert!(matches!(puzzle.rating.status, SolveStatus::Solved(_)));
assert!((1_001..=1_600).contains(&puzzle.rating.score.points));
```

For progress and cancellation, use [`start_matching`], [`start_from_pool`], or [`start_targeted`]. Call [`GenerationSearch::advance`] for at most one attempt and [`GenerationSearch::cancel`] at the next boundary. A terminal [`GenerationStep`] ends the search. The same seed, options, and template order reproduce the search for a given engine revision.

## Browser and WebAssembly

The default Rust library has no external dependencies. The `wasm-api` feature enables serialization and the structured JSON interface on `wasm32`. The `cli` feature reuses the structured protocol for the native batch interface.

```sh
rustup target add wasm32-unknown-unknown
cargo build --release --locked -p sudoku-app-engine --target wasm32-unknown-unknown --features wasm-api
```

The module is `target/wasm32-unknown-unknown/release/sudoku_app_engine.wasm` with the default target directory. In this app, `npm run build:wasm` also writes the module and the generated lesson data under `src/sudoku/generated/`. The app's `runEngine(request)` function runs this module in a worker, resolves with the result, and rejects with an error code when available. `runGeneration(request, { signal, onProgress })` drives a cancellable search and reports completed attempts.

To embed the module in a different host, instantiate it, then call each request synchronously within one worker or other serialized caller. The request and reply buffers belong to the module. Write every request byte after calling `request_buffer(length)`. Read exactly the number of response bytes returned by `run_request()` from `response_buffer()` before issuing the next request. Create memory views after the allocating calls.

```js
function request(exports, message) {
  const input = new TextEncoder().encode(JSON.stringify(message))
  const offset = exports.request_buffer(input.length)
  new Uint8Array(exports.memory.buffer, offset, input.length).set(input)
  const length = exports.run_request()
  const reply = new Uint8Array(exports.memory.buffer, exports.response_buffer(), length)
  return JSON.parse(new TextDecoder().decode(reply))
}

const catalog = request(instance.exports, { type: 'techniques' }).value
```

A structured reply has either `value` or `code` and `error`. Request tags are kebab-case and fields are camelCase. Technique IDs come from `techniques`. An omitted `techniqueOrder` uses the engine default at the wire level. The app's client can supply a saved profile before sending the request. An explicit empty order enables no techniques. For hints, omitted `disabledTechniques` means the full hint catalog at the wire level.

| Structured request | Inputs and result |
| --- | --- |
| `techniques` | Technique IDs, aliases, costs, difficulty, uniqueness flags, default order, and scoring version |
| `rate` | `values` and optional `techniqueOrder`. Returns a versioned rating. |
| `logical-solve` | Start from `values` and optional `entries` and `eliminations`. `includePositions` adds snapshots. `includeStepDetails` adds masks and proof patterns. `includeMoveAvailability` adds Easy move counts and bottleneck flags. |
| `compare-solve-paths`, `alternate-solve-path` | Same starting position and order plus `technique`. Alternate search also takes `maxPositions` and reports `found`, `no-path`, or `inconclusive`. |
| `hints`, `next-deduction` | Current merged `values`, optional `eliminations` and `disabledTechniques`. For hints, `limit` defaults to 10 and can be `"all"`. `includePatterns` adds masks and proof patterns to the hint result. |
| `deductions`, `opening-techniques` | Deductions takes merged `values`, optional `eliminations`, and `techniqueOrder`. Opening techniques takes the untouched grid and reports all techniques that can act. |
| `lesson-examples`, `practice-examples` | Lesson examples include a worked example and a transformed exercise per technique. Practice examples takes `technique` and returns three verified exercises. |
| `practice-position`, `check-practice-move` | Take a starting position and technique. The former optionally takes a solver order. The latter takes an `action` such as `{"eliminate":{"cell":24,"digit":2}}`. Both can return `null` when no matching position or proof is found. |
| `generate-targeted` | `seed`, `maxAttempts`, and `target` with `type` of `difficulty` or `opening`. Returns a grid string. |
| `generate-constrained`, `generate-from-pool` | `seed`, `maxAttempts`, `clues` as a number or inclusive range, optional `score` or `difficulty`, optional `technique`, and optional `techniqueOrder`. The constrained search accepts `templates` and returns a grid string. The built-in pool returns a grid and rating. |
| `generation-start`, `generation-advance`, `generation-cancel` | Use a distinct numeric `job` for each active search and pass a generation `request` at start. Advance returns `pending`, `matched`, or `exhausted`. Cancel returns `cancelled`. A terminal result releases the job ID. |

The fixed-buffer exports handle the app's `analyze`, `notes`, `solve`, and `generate` operations. Write 81 numeric bytes at `board_buffer()` before calling `analyze_board()`, `fill_notes()`, or `solve_board()`. `analyze_board()` returns the [`Analysis`] discriminant. `fill_notes()` and `solve_board()` return 1 on success. Read candidate masks as 81 little-endian 16-bit values at `notes_buffer()` after a successful fill. `solve_board()` on success and `generate_board(seed)` write their resulting grids to the board buffer.

## Batch rating and generation

```sh
cargo run --release --locked -p sudoku-app-engine --features cli --bin sudoku-engine -- batch-rate puzzles.txt
cargo run --release --locked -p sudoku-app-engine --features cli --bin sudoku-engine -- batch-generate requests.jsonl
```

Omit the input file or use `-` to read standard input. Each nonblank input line produces one JSON record on standard output. A rating line can be an 81-character grid or an object with `values`, optional `techniqueOrder`, and an optional `seed` to carry forward. A generation line is a generation request. Omit `type` to use `generate-constrained`.

```json
{"type":"generate-from-pool","seed":42,"maxAttempts":208,"clues":17,"score":[1001,1600]}
```

Each record includes the one-based source line, seed, resolved technique order when available, scoring version, and result. A rating result includes its status and rating. A generation result includes its status and attempts, plus the puzzle and rating for a match. A match with no rating includes `ratingError`. Invalid records include an error code and leave later records usable. In native integrations with the `cli` feature, `run_batch` accepts any buffered reader and writer.

## Rule-based variant puzzles

A [`VariantPuzzle`] describes a single 9 × 9 grid in a versioned format. Rows and columns are always houses. [`RegionLayout`] selects standard boxes or nine connected Jigsaw regions. Rules can add either long diagonal, add any nine-cell house, or constrain disjoint Killer cages. Each cage requires distinct digits adding to its sum. The Killer preset requires full cage coverage. In a mixed puzzle, set `coverGrid` to false to allow uncaged cells. [World Puzzle Federation Killer rules](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2017/2017_SudokuRound7_IB.pdf)

Use [`VariantPuzzle::compile`] to validate a definition and prepare its constraints. Candidate calculation applies restrictions from placed digits, then narrows the remaining candidates until they stop changing. Each cage checks which digits can go in each cell to form the required sum without repeats. The exact solver uses the same candidate calculation and counts up to two completions within the node limit. Clear the placed digits and removal masks to analyze the original givens.

The native `windoku` and `disjoint_groups` constructors add extra houses through the standard rule format. The `miracle` constructor combines Anti-Knight, Anti-King, and orthogonal Non-Consecutive rules. All constructors return editable puzzle definitions. [Miracle Sudoku rules and solution](https://www.mathekalender.de/wp/wp-content/uploads/2021/07/MK-2020-Solutions-en.pdf)

```rust
use sudoku_app_engine::{Analysis, DEFAULT_VARIANT_SEARCH_NODES, VariantPuzzle, parse_givens};

let solution = parse_givens(
    "658492731974316582132875694461523978387149256295768143849251367726934815513687429",
).unwrap();
let mut givens = solution;
for cell in [1, 6, 10, 15] {
    givens[cell] = 0;
}
let puzzle = VariantPuzzle::x_sudoku(givens).compile().unwrap();
assert_eq!(
    puzzle.analyze(&[0; 81], &[0; 81], DEFAULT_VARIANT_SEARCH_NODES),
    Ok(Analysis::Unique),
);
assert_eq!(
    puzzle.solve(&[0; 81], &[0; 81], DEFAULT_VARIANT_SEARCH_NODES),
    Ok(solution),
);
```

With `wasm-api` or `cli`, [`VariantPosition`] supports JSON round-tripping via Serde. A `variant` worker request takes the position, operation, and optional `maxNodes` for exact search. `normalize` validates the definition and returns a complete position record. `candidates` returns 81 candidate masks. `analyze` distinguishes conflicts, impossible puzzles, uniqueness, multiple solutions, and search limits. `solve` returns one completion or an error. Unsupported rule IDs and format versions have distinct error codes.

```json
{
  "type": "variant",
  "operation": "analyze",
  "position": {
    "puzzle": {
      "version": 1,
      "givens": "608492031904316082132875694461523978387149256295768143849251367726934815513687429",
      "regions": { "type": "boxes" },
      "rules": [{ "type": "diagonal", "diagonal": "main" }]
    }
  },
  "maxNodes": 1000
}
```

`entries` and `eliminations` are optional fields of the position and default to empty. All cell indices are zero-based.

| Rule ID | Parameters and effect |
| --- | --- |
| `diagonal`, `extra-house` | Use `diagonal` with `main` or `anti`, or supply nine distinct `cells` for an extra house. |
| `killer-cages` | Each cage specifies `cells` and `sum`. Set `coverGrid` to true if the cages must cover the full grid. |
| `parity`, `clone` | Set `parity` to `odd` or `even` for the listed `cells`. In Clone Sudoku, each list in `groups` shares one digit. |
| `anti-knight`, `anti-king`, `non-consecutive` | Each applies to the entire grid. Non-Consecutive applies to orthogonally adjacent cells. |
| `inequality` | Supply the `less` and `greater` cell indices. |
| `kropki`, `xv` | Use `consecutive` and `ratioTwo` for Kropki dots, or `five` and `ten` for XV markers. |
| `thermometer`, `whispers`, `palindrome` | Supply `cells` in line order. Start a Thermometer at the bulb. Set `minDifference` for Whispers. |
| `arrow`, `renban`, `between` | Supply `cells` in line order. For Arrow, supply its `circle` separately. For Between, include both endpoints in `cells`. |
| `region-sum` | Supply `cells` in line order. The active regions divide the line into segments. Set `groupByRegion` to true to combine separate visits to the same region. |
| `sandwich`, `x-sum`, `skyscrapers`, `little-killer` | Supply `cells` from the clue toward the far edge in the declared `direction`. Use `count` for Skyscrapers and `sum` for the other clues. |

Each marker type accepts a list of adjacent `pairs` and an optional `negative` flag. With that flag, an adjacent pair without any marker from the same family cannot use the specified relationship. The default is false. A Kropki pair with digits 1 and 2 can carry either dot. [WPF Kropki rules](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2020/2020_SudokuRound4.pdf)

Outside clues use the compass directions `north`, `east`, `south`, and `west` for rows and columns. Use `north-east`, `south-east`, `south-west`, or `north-west` for Little Killer diagonals. A Little Killer diagonal can repeat digits where its other rules permit them. [Sudoku U constraint reference](https://www.sudoku-u.org/constraints)

```sh
cargo run --release --locked -p sudoku-app-engine --features cli --bin sudoku-engine -- batch-variant requests.jsonl
```

Batch rows use the same request format. Omit `type` to select `variant`, or omit `operation` to normalize a position. A successful batch record contains the result under `result.value`.

Use [`CompiledVariant::solve_seeded`] or pass a `seed` with the `solve` operation to sample a completion. The seed controls the order in which the solver tries candidate digits. Use `analyze` to check whether the puzzle has one solution.

### Variant logical solves and ratings

Use [`VariantPosition::solve_logically`] for a trace or [`VariantPosition::rate`] for a score. Both use the supplied order of techniques. The rating records the regions, rules, technique order, and version of the score. A stalled solve reports the points earned before it stalled.

Singles and Locked Candidates use all active houses. The other variant techniques explain deductions from the individual constraints. Proofs record the rule indices, cells, and candidate masks before the move. A rule can produce several proofs, such as separate Clone groups.

Cage Combinations checks which digits can occupy each cell while meeting the cage sum. Cage House Sum uses the fact that the digits in a house add to 45. It can derive a sum for cells inside or outside the house. The proof identifies the cages and records the candidate masks before the move.

Classic detectors can run when the puzzle uses standard boxes. X-Wing, Swordfish, and Jellyfish also run with replacement regions because they use rows and columns. For a uniqueness deduction, the engine verifies uniqueness within a fixed node limit. It offers the deduction only when every changed cell is outside the scope of every additional rule. The proof records the cells that can exchange digits.

For a `variant` request, set `operation` to `trace`, `rate`, or `hints`. Use `techniqueOrder` to choose the enabled techniques. An empty list disables all techniques, while an omitted field uses [`VariantTechnique::DEFAULT_ORDER`]. Exact validation continues to enforce every puzzle rule. Hints rank the available proofs by difficulty and cost, then by the number of cells in the proof. They return a single deduction when it is the only move available.

Use `replay-step` with a zero-based `stepIndex` to get the position before and after a move. Use `practice-position` with `technique` to get the position before its first use. To check a practice move, send `check-practice-move` with that position, the `technique`, and an `action`. The engine searches for a proof of the submitted action with the selected technique.

Use [`variant_practice_examples`] to load three exercises for a technique. In Wasm or `batch-variant`, send `practice-examples` with `variant: true` and the technique ID. Send `techniques` with `variant: true` to read the variant catalog, point costs, and default order. Each exercise includes its rules, the position before the move, the candidate masks, valid actions, and a suggested action with its proof.

The engine uses scoring version 4 for variants. It estimates the effort of each example proof from the cells to inspect, the choices in their candidate masks, and the reasoning the rule requires. The median of three estimates sets the technique cost. House sums also account for the house and source cages. The estimate is independent of how many actions the proof justifies. Shared singles and Locked Candidates use their classic point costs.

The variant technique tiers use costs through 26 points for Easy and through 68 for Medium. Cage Combinations and Arrow also start at Easy because they apply the basic rules of Killer and Arrow Sudoku. Higher costs start at Hard. The total score still uses the standard score bands. A stalled path reports a partial total and keeps the selected rule set, technique order, and scoring version.

### Fog visibility

Use [`VariantPosition::visible`] with [`VariantVisibility`] to derive the player's position from the full puzzle. For Wasm or batch, pass `visibility` on logical requests, or use `normalize` to return the visible position. The lists `cells` and `rules` name the revealed givens and constraint indices. Use `knownRemovals` for removals established from revealed clues.

The visible position keeps the region layout and placed digits. A rule reveals as one unit. The returned proof indices refer to the visible rule list in its original order. Set `completeKropki` or `completeXv` after revealing all rules for that marker family. Only then can the lack of a marker justify a move.

### Generate variant puzzles

Use [`start_variant_generation`] in Rust or `generate-variant` in Wasm and `batch-generate`. The template supplies the regions, fixed rules, and any givens needed to select a completed grid. The generator can remove those givens from the output. It keeps a removal only after proving the output still has one solution.

`derivedClues` supplies geometry for clues whose values depend on the sampled solution. Use `killer-cages` to provide cage cells or `killer-cage-sizes` to request connected cages of specific sizes. You can also derive parity, inequalities, Kropki and XV markers, and outside clues. A marker request with a count samples that many marks. Negative marker rules require the full set of matching marks.

```json
{
  "type": "generate-variant",
  "seed": 41,
  "maxAttempts": 10,
  "maxNodes": 20000,
  "template": { "version": 1, "givens": "000000000000000000000000000000000000000000000000000000000000000000000000000000000" },
  "derivedClues": [{ "type": "killer-cage-sizes", "sizes": [2, 3, 4] }],
  "givens": [30, 34],
  "variantClues": 3,
  "requiredRule": "killer-cages"
}
```

`givens` and `variantClues` each accept an exact count or a range. The variant count includes each cage, marked cell or pair, line, extra house, and outside clue. It counts each Clone group once. Global rules and the region layout contribute zero. A required rule must leave multiple solutions when removed. Use `jigsaw` to compare with only rows and columns enforcing distinct digits, while retaining other rules and region boundaries.

Use `score` or `difficulty` to require a complete rated solution. Pass `techniqueOrder` to select and order the techniques. A technique target can match anywhere, first in the selected order, or as the only available opening. The exclusive mode checks every compatible detector. The result includes the seed, solution, final rules, counts, and rating.

The attempt limit counts sampled grids. The node limit applies to each exact search. Rust callers can advance or cancel the search at attempt boundaries. In the browser, use `runGeneration` with an abort signal to cancel between attempts and receive progress.

Pass previous puzzles in `exclude` to skip their equivalents. [`canonical_variant`] transforms the givens, region layout, and rules together. It accounts for rotations and reflections, including changes to outside-clue directions. It also normalizes digit names when all rules allow arbitrary renaming.

## Implementation and verification

`lib.rs` handles grid parsing, exact search, simple generation, and the WebAssembly exports. `position.rs` maintains the active masks and applies deductions. `logical.rs` shares ordered deduction and scoring logic across rating, trace, and generation targets. `technique.rs` is the catalog. `hints.rs` dispatches the detectors in `patterns/` and ranks their proofs, while `proofs.rs` derives the coordinates needed to render them. Detectors share lazy per-position indexes for candidate positions, links, and other patterns. The rating path collects counts without building a trace. `generation/` manages attempt cursors, verified templates, and symmetry keys. `protocol.rs` translates Rust types to the browser wire format.

```sh
cargo test --locked -p sudoku-app-engine --all-features
cargo bench --locked -p sudoku-app-engine --bench engine
cargo bench --locked -p sudoku-app-engine --features wasm-api --bench coverage > stalls.jsonl
cargo bench --locked -p sudoku-app-engine --features wasm-api --bench variants
npm run test:wasm
node --experimental-strip-types scripts/bench-variants.mjs
```

The engine benchmark times exact search, rating, traces, hints, and opening detection, and reports generation match rates and symmetry-adjusted diversity. The coverage benchmark reports logical solve rates and rating times separately for everyday, 17-clue, and expert fixtures. It writes replayable stalled positions to standard output and reports the group statistics on standard error. Pass `-- --dynamic-forcing` to append Dynamic Forcing Net. Pass `-- --nested-forcing` to append both extended forcing techniques. Use `--aligned-exclusion` to run Aligned Exclusion before AIC. Select a published puzzle group with `--forcing-examples` or `--aligned-examples`.

Select the twelve depth-three examples with `--depth-three`. Add `--tridagon` to try direct Tridagon deductions before Forcing Chain and guardian nets before Nested Forcing Net.

The variant benchmarks share fixtures for classic, X Sudoku, Killer, and mixed Jigsaw and Killer puzzles. They measure rating, ranked hints, and seeded generation. The Wasm run includes request encoding and response decoding. Run the Wasm build before the JavaScript benchmark. The benchmark reports raw and gzip binary sizes.

The 17-clue template collection is attributed to Gordon Royle and The University of Western Australia under Creative Commons Attribution 2.5. The practice data includes selected HoDoKu regression examples. The source for each supplemental fixture appears with its definition.
