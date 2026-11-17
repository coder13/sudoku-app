# Sudoku engine

See [difficulty levels](../../docs/difficulty-levels.md) for the ten-level policy, canonical generation profiles, and saved-data compatibility. Difficulty follows techniques rather than accumulated points.

Validate classic and rule-based 9 × 9 Sudoku puzzles, find and explain deductions, and rate ordered solve paths. Generate puzzles that meet clue, score, or technique targets. The engine runs as a Rust library, as a WebAssembly module in the app's browser worker, and as a command-line tool for batch work.

Run this command from the repository root to build and open the API reference.

```sh
cargo doc --locked -p sudoku-app-engine --all-features --no-deps --open
```

## Select build capabilities

The default includes variant rules, generation, and teaching fixtures. Set `default-features = false` for Classic solving, ratings, hints, and rank proofs. Enable `variants`, `generation`, and `teaching` independently when the caller needs them. The [build guide](BUILD_FEATURES.md) lists the Cargo dependencies, browser profiles, and capability matrix commands.

The app explicitly builds the `app` profile. A runtime solver profile selects techniques inside that build. Use the structured `capabilities` request to discover the compiled capabilities. An omitted operation returns `unsupported-capability` and leaves subsequent requests usable.

## Start with one puzzle

Add the engine as a path dependency in another Cargo package. Set the path relative to that package's manifest.

```toml
[dependencies]
sudoku-app-engine = { path = "../sudoku-app/crates/engine" }
```

Check the grid, follow the default logical path, and read its rating. This example finishes at 504 points.

```rust
use sudoku_app_engine::{Analysis, Difficulty, SolveStatus, Technique, analyze, parse_givens, solve_logically};

let givens = parse_givens(
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
).unwrap();
assert_eq!(analyze(&givens), Analysis::Unique);

let trace = solve_logically(&givens, Technique::DEFAULT_ORDER).unwrap();
assert_eq!(trace.status, SolveStatus::Solved(Difficulty::Beginner));
assert_eq!(trace.score.points, 504);
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
| Fish | X-Wing, Swordfish, Jellyfish, finned and Sashimi forms, Franken Fish, Mutant Fish, and Kraken Fish Types 1 and 2 |
| Wings and single-digit patterns | W-Wing, XY-Wing, XYZ-Wing, WXYZ-Wing, Skyscraper, Two-String Kite, Empty Rectangle |
| Coloring and inference | Simple Coloring, 3D Medusa, X-Chain, XY-Chain, Alternating Inference Chain, continuous and discontinuous Nice Loops, grouped versions, ALS versions, and Firework AIC |
| Uniqueness | Unique Rectangle Types 1–6, Hidden Rectangle, Unique Loop Types 1–4, BUG+1 |
| Advanced deductions | Firework triples and quadruples, Firework W-Wing, L-Wing, and ALS-Wing, Aligned Pair and Triplet Exclusion, Tridagon, Tridagon AIC, Tridagon Forcing Net, Forcing Chain, Forcing Net, Dynamic Forcing Net, Advanced Forcing Net, Nested Forcing Net, ALS-XZ, ALS-XY-Wing, ALS Chain, Sue de Coq, Death Blossom, Junior Exocet, Senior Exocet, Double Exocet, SK Loop, Multi-Sector Locked Sets |

The catalog records the point cost, technique difficulty, and uniqueness assumption for each detector. Complex fish, Unique Loops, Fireworks, Firework wings and AIC, aligned exclusions, Tridagons, and extended forcing nets are available in hints and selected-technique searches. Add their IDs to a custom profile to use them for solving and rating.

Franken Fish and Mutant Fish use a single-digit template check to narrow the search. A template places one copy of the same digit in each row, column, and box. A fish can remove a candidate only when every compatible template leaves that candidate out. The search uses the original candidates to construct each fish proof.

Kraken Fish uses chains to extend a fish with two to four houses on each side. Type 1 removes a candidate that the fish rules out when all fins are false. It supplies a chain from each fin to the same removal. Type 2 supplies a chain from each fin and from each balanced candidate in one cover house. A candidate is balanced when it belongs to the same number of bases and covers. The result can concern a digit other than the fish digit.

Each Kraken branch starts by assuming its candidate is true. It alternates between exclusions and strong links from cells, houses, or almost locked sets. It ends by ruling out the same target candidate. The detector requires at least one branch with more than a direct exclusion. [`KrakenLinkReason`] records why each step holds. Enable `kraken-fish-1` or `kraken-fish-2` in a custom profile at 900 or 950 points per deduction.

A Firework starts where a row and column cross inside a box. For each selected digit, the only candidate allowed outside that box in either line is its wing cell. If the digit used neither wing nor the intersection, the two lines would need separate copies of the digit in the box. A triple locks three digits into the intersection and wings. A quadruple combines two intersections that share the wings and use disjoint pairs of digits. The search checks every compatible assignment, including the additional occurrence required when a digit takes a wing. This can remove candidates both inside and outside the locked cells. [`HintEvidence::Firework`] records the wings and each intersection's digits. Enable `fireworks` in a custom profile at 240 points per deduction at the Master tier. [SudokuWiki’s Fireworks examples](https://www.sudokuwiki.org/Fireworks)

A Firework can also supply a strong link to an alternating inference chain. For one digit, take the intersection and all its candidates outside the box in either crossing line. At least one of these candidates must be true. The detector can split them into two groups, including groups with several outside candidates. A weak link between groups requires every candidate in one group to conflict with every candidate in the other. [`LinkSource::Firework`] records the intersection. [`LinkSource::Peers`] records weak links that use more than one house. Enable `firework-aic` in a custom profile at 360 points per deduction at the Master tier. [Published Firework chain](https://www.reddit.com/r/sudoku/comments/1dgrgfb/til_fireworkstype_links/)

The same detector can combine Firework links with almost locked sets. An almost locked set has one more candidate digit than cells in a shared house. At least one of any two digits must occur in the set, which provides a strong link. [`LinkSource::AlmostLockedSet`] records the cells and all their digits for replay. A Firework chain still requires a Firework link. [Worked ALS chain examples](https://www.sudokuwiki.org/AIC_with_ALSs)

Use `als-aic`, `als-discontinuous-nice-loop`, or `als-continuous-nice-loop` to combine almost locked sets with ordinary inference links. Each technique requires an ALS link and costs 360 points per deduction at the Master tier. A discontinuous loop refutes one truth value of its starting candidate. A continuous loop makes exactly one of the two linked digits true in each ALS it crosses. The other digits must fill the set, so an outside candidate that sees all of its digit's locations in the set can be removed. [HoDoKu worked examples](https://hodoku.dev/tech_chains#group-nodes-and-als)

The ALS techniques also search for links to outside cells with two or more alternatives ruled out by the set. If the ALS endpoint is false, all those alternatives disappear and the outside endpoint must hold. [`LinkSource::AlmostLockedSetCell`] records the set, the outside cell, and the mask of blocked alternatives. In a continuous loop, the set must use every digit other than the ALS endpoint digit and the blocked alternatives. [HoDoKu regression library](https://hodoku.sourceforge.net/libraries/reglib-1.3.txt)

Pattern Overlay checks complete placements of a digit across the rows, columns, and regions. A candidate can be removed when it occurs in none of the compatible placements. An empty cell can be filled when every compatible placement uses it. For several digits, their placements must also use disjoint cells. A move belongs to the reported set of digits when no smaller subset of those digits proves it. [`PatternOverlayProof`] records the allowed and supported cells for each digit so a client can replay the deduction. Enable `pattern-overlay`, `pairwise-pattern-overlay`, `triple-pattern-overlay`, `quadruple-pattern-overlay`, or `quintuple-pattern-overlay` in a custom profile. Their Impossible-tier costs are 500, 650, 800, 950, and 1,100 points per move. [SudokuWiki examples](https://www.sudokuwiki.org/Pattern_Overlay) · [Digit-pattern method](https://homepages.cwi.nl/~aeb/games/sudoku/solving28.html)

Variant overlays also use extra houses and equal-digit exclusions such as Anti-Knight, Anti-King, or cages with distinct digits. The optional proof geometry lists the active houses and additional pairs that cannot share a digit. Other variant techniques enforce arithmetic rules and can narrow the candidate masks before an overlay runs. [Worked Jigsaw example](https://www.sudokuwiki.org/Pattern_Overlay#Jigsaw_multiple_example)

A Unique Rectangle supplies a strong link when two groups cover every candidate outside its two swap digits. At least one extra candidate must be true, since filling the rectangle with the pair would allow a second solution. Both swap digits must be live in all four cells, which must span exactly two boxes. [`LinkSource::UniqueRectangle`] records the corners and swap digits, and the endpoints record the two groups. Enable `unique-rectangle-aic`, `unique-rectangle-discontinuous-nice-loop`, or `unique-rectangle-continuous-nice-loop` at 360 points per deduction at the Master tier. All three require verified uniqueness. The variant engine checks every rectangle in the proof against the extra rules. [Worked Unique Rectangle chains](https://www.sudokuwiki.org/Using_Unique_Rectangles_as_Links_in_Chains)

A Firework W-Wing starts with two Firework digits that share an intersection. Two cells with exactly those two candidates attach to the wings, one to the row and one to the column. If a target contained one digit, it would rule that digit out of its wings and both attached cells. The attached cells would then take the other digit and rule it out of its wings. Both digits would need the same intersection cell. The detector checks every live candidate in each wing, including wings with more than one cell. [`HintEvidence::FireworkWWing`] records the intersection, both groups of outside cells, and their attached cells. Enable `firework-w-wing` in a custom profile at 320 points per deduction at the Master tier. [Worked Firework W-Wing](https://www.taupierbw.be/SudokuCoach/SC_Firework.shtml)

A Firework L-Wing uses a conjugate link to attach a third digit to one of the two wings. If that digit occupied the other wing, it would rule out the far end of the link and force the third digit into both wings. Both Firework digits would then need the same intersection. [`HintEvidence::FireworkLWing`] records the wings, their digits, and the row or column link. Enable `firework-l-wing` in a custom profile at 320 points per deduction at the Master tier. [Worked Firework L-Wing](https://www.taupierbw.be/SudokuCoach/SC_Firework.shtml)

A Firework ALS-Wing uses two Fireworks with the same digit pair and a shared bivalue cell. Whichever digit occupies that cell rules it out of all the wings and forces it into both intersections. The detector then checks every compatible pair of outside placements for the other digit. It removes candidates ruled out in both branches, including other digits from the intersections. [`HintEvidence::FireworkAlsWing`] records the intersections, wings, and bivalue cell. Enable `firework-als-wing` in a custom profile at 350 points per deduction at the Master tier. [Worked Firework ALS-Wing](https://www.taupierbw.be/SudokuCoach/SC_Firework.shtml)

Senior Exocet starts with two base cells in a row or column of one box. One target is in the same band or stack, and the other reaches outside it. Single-cell targets can share a cross-line. Their proof records both targets in that order, the covering houses for the base digits, and the allowed digit assignments.

Either target can be a conjugate pair. The linked digit reserves one cell in each pair and must be outside the base candidates. After accounting for those reserved digits, the two base digits must fill the two remaining target cells. [`HintEvidence::GroupedExocet`] records the ordered targets, their links, and the cover for each base digit. All forms use `senior-exocet` in a custom profile and cost 550 points per deduction at the Extreme tier. [Sudoku Studio examples](https://github.com/kyoyama-kazusa/Sudoku/blob/main/docs/tutorial/exocet/07-senior-exocet.md)

Double Exocet combines two Junior Exocets in different boxes of the same band or stack. The components share three cross-lines. Each base pair has three or four candidate digits. The two pools share at least one digit and contain four to seven distinct digits in all. For each paired assignment, the search tries to place every one of those digits on each cross-line. Two digits cannot use the same cell, and two copies of a digit cannot share a row, column, or box. A candidate can be removed when every compatible filling rules it out. The detector reports the additional removals beyond those already found by each Junior detector.

[`HintEvidence::DoubleExocet`] records both components and their surviving assignments. The `jointCrossLineSupport` field reports whether the detector completed the joint search. If it reaches the 8,192-node limit for a pattern, it uses the individual digit checks for that pattern. Enable `double-exocet` in a custom profile at 600 points per deduction at the Extreme tier. [Double Exocet example](https://www.sudokuwiki.org/Double_Exocet)

A Double Exocet target can also be a conjugate pair in the same band or stack. A digit outside the component's base candidates must occupy one of the two cells, leaving one cell for a base digit. The search requires the linked digit on its cross-line and tests which removals need both base pairs and each added reservation. [`HintEvidence::GroupedDoubleExocet`] records the target groups, links, covers, and a [`RankPattern`] that can replay each removal with [`prove_rank_at`]. This form uses the same technique ID and point cost. If its search reaches the node limit, it skips that pattern.

A Unique Loop has at least six cells, divided into two sides. Every row, column, or box that touches the loop contains one cell from each side. If every cell used one of the two shared digits, swapping those digits would give a second solution. After the engine verifies uniqueness, it can use the extra candidates, a naked or hidden subset, or a conjugate link to rule out moves. The evidence records the two sides, the shared digits, and the supporting facts. The `unique-loop` profile entry enables all four types and costs 140 points per deduction at the Hard tier.

Aligned Exclusion checks what happens when two or three selected cells take specific digits. Reject an assignment if it repeats a digit in peer cells or empties a common peer. Remove a candidate when every assignment that uses it fails. The proof records the rejected assignments and their reasons. Aligned Pair Exclusion costs 310 points and Aligned Triplet Exclusion costs 370 points.

Dynamic Forcing Net extends a branch by applying Pointing and Claiming after ordinary net propagation. A branch starts by assuming a candidate is true or false. Each locked candidate step records both houses and the earlier removals that confine the digit to their intersection. The detector reports a deduction when that step contributes to a contradiction or a conclusion shared by every alternative. Its initial cost is 800 points at the Extreme tier. Append `dynamic-forcing-net` to your solver order to try it after the other techniques.

Advanced Forcing Net also looks for Naked Pair, Hidden Pair, and X-Wing after dynamic propagation settles. The branch records the pattern and the earlier removals that make it possible. The proof must depend on at least one of those patterns. Enable `advanced-forcing-net` at 900 points per deduction. Use [`ForcingBranch::proof_size`] to count assumptions and deductions, including the facts in nested branches.

Nested Forcing Net tries a second assumption when dynamic propagation runs out of moves. If both truth values of the second candidate lead to contradictions, the first assumption is false. The proof stores both cases and the facts each case imports from the outer branch. [`ForcingCase`] documents how to read the step indices. Append `nested-forcing-net` to opt in at 950 points per deduction.

For variant positions with standard boxes, the Classic Nested Forcing Net search can use compatible completions to skip assumptions that cannot lead to contradictions. These witnesses satisfy the standard houses, placed digits and current candidate masks; they do not establish any extra variant rule. The engine allows 128 exact-search nodes per additional probe and 4,096 across the scan. An unfinished probe leaves the original logical search active. Every returned deduction still contains its original logical proof, with the same cost and technique order. These internal probes do not replace the public exact-search budgets or uniqueness checks.

A regular Tridagon uses four boxes in two bands and two stacks. Select three cells in different rows and columns within each box. The pattern can be impossible to fill with the same three digits, so at least one extra candidate must be true. The extra candidates are called guardians. `tridagon` places a sole guardian or removes a candidate that conflicts with every guardian. It costs 410 points per deduction at the Extreme tier.

`tridagon-aic` uses the guardian requirement as a strong link in an alternating inference chain. The two endpoints together cover every guardian, so at least one endpoint must hold. An endpoint can be one candidate, a same-digit group, or an [`InferenceNode::MixedGroup`]. A weak link to a mixed group must conflict with each of its candidates. The search can combine these links with house, cell, Firework, and almost locked set links. [`LinkSource::Tridagon`] records the impossible core. Enable the technique in a custom profile at 540 points per deduction at the Extreme tier. [Mission Impossible worked example](https://www.reddit.com/r/sudoku/comments/1gxr5ml/trivalue_oddagon/)

`tridagon-forcing-net` can prove a conclusion shared by the surviving guardian branches. It can also assume the opposite move and use the requirement that at least one guardian must be true to show a contradiction. If only one guardian remains possible in such a branch, that guardian must be true. In the proof, [`ForcingScope::Guardians`] refers to the guardians listed in the enclosing Tridagon evidence. This technique costs 850 points per deduction at the Extreme tier.

Use [`rate_puzzle`] for a rating without the trace. [`PuzzleRating`] carries the total points, technique counts, hardest technique, solve status, technique order, and [`SCORING_VERSION`]. Each deduction adds its technique's cost once, regardless of how many candidates it removes. A complete path's difficulty is its hardest technique's tier. Repeating easy deductions never raises that tier. Normal generation uses a canonical profile for each of the [ten levels](../../docs/difficulty-levels.md), checks that the lower-tier profile stalls, and applies a quality floor. Save the order, scoring version, and engine revision to reproduce the rating. A detector update can change which steps the solver takes.

Use [`LogicalSolve::replay_step`] to examine a deduction between its before and after positions. [`LogicalSolve::move_availability`] counts distinct moves from enabled Beginner and Easy techniques at each position. It flags an unfinished grid with zero or one such move.

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

### Mixed rank proofs

A [`RankPattern`] selects cell constraints and digit constraints in rows, columns, or boxes. A base requires exactly one of its candidates. A cover allows at most one. A candidate can fill several bases and use several covers at the same time. [`RankPattern::rank`] gives the number of covers minus the number of bases. The proof checks the actual candidate overlaps.

Use [`prove_rank_at`] to test one removal or [`rank_deductions_at`] to scan every active candidate in the supplied pattern. Each search assumes the candidate is true. It splits on a base and checks every compatible choice until it finds an assignment that fits or proves a contradiction in every branch. The node budget limits the search. A scan that runs out of nodes returns the proofs found so far with [`RankScan::complete`] set to false.

[`discover_rank_at`] starts with the active classic constraints, then extracts the bases and covers that justify a removal. It keeps the proof with the lowest estimated effort found within the node budget. [`discover_rank_deductions_at`] searches for multiple removals with one shared budget and a per-candidate ceiling. The position-wide search returns proofs in effort order and reports how many candidate searches ran out of nodes.

[`RankProofEffort`] accounts for both finding and following the proof. Version 1 assigns two units per distinct constraint, one per cell, one per active candidate mark, one per proof node, and four per alternative beyond the first choice at a split. A candidate shared by several constraints counts once. The effort model has its own version and units. Use [`rank_proof_effort_at`] to verify and measure a saved proof against a snapshot.

[`replay_rank_proof_at`] verifies the saved case splits against a snapshot. Each proof node gives the index of a base and the complete list of its remaining choices. An empty list proves that the base cannot be satisfied. The checker uses the same starting-position validation as classic hints. Each proof uses only the selected constraints and active candidates. Rank discovery is available directly through these APIs.

```rust
use sudoku_app_engine::{
    HintEvidence, PositionSnapshot, RankConstraint, RankOutcome, RankPattern, Technique,
    parse_givens, prove_rank_at, replay_rank_proof_at, technique_deductions_at,
};

let givens = parse_givens(
    "970500060000007103800040000000080900685000000100003002000000000000600057008090200",
).unwrap();
let position = PositionSnapshot::new(givens);
let hint = &technique_deductions_at(&position, Technique::Pointing).unwrap()[0];
let target = hint.actions[0].candidate();
let HintEvidence::Intersection { source, target: cover, .. } = hint.evidence else {
    panic!("expected a pointing intersection");
};
let pattern = RankPattern {
    bases: vec![RankConstraint::HouseDigit { house: source, digit: target.digit }],
    covers: vec![RankConstraint::HouseDigit { house: cover, digit: target.digit }],
};
let RankOutcome::Proven(proof) = prove_rank_at(&position, &pattern, target, 1).unwrap() else {
    panic!("expected a pointing proof");
};
assert_eq!(replay_rank_proof_at(&position, &proof), Ok(true));
```

### Logical solves with rank fallback

Use [`solve_position_with_rank`] to try a rank removal when the selected named techniques stall. After each rank removal, the solver starts again at the top of the named order and keeps all placements and candidate removals. An empty named order permits rank removals alone. [`RankFallbackOptions`] sets the removal limit and the search budgets. The defaults allow eight rank removals, 320,000 nodes across the solve, 40,000 per scan, and 200 per candidate.

The trace records named point costs as a subtotal. Each rank step carries its proof, effort, and scan usage. [`RankSolve::positions`] and [`RankSolve::replay_step`] let you verify the proof on the position before the removal. The status distinguishes a solved grid, a complete scan with no removal, a rank step limit, and a rank search limit.

```rust
use sudoku_app_engine::{
    PositionSnapshot, RankFallbackOptions, RankSolveStep, Technique, parse_givens,
    replay_rank_proof_at, solve_position_with_rank,
};

let givens = parse_givens(
    "970500060000007103800040000000080900685000000100003002000000000000600057008090200",
).unwrap();
let options = RankFallbackOptions { max_steps: 1, node_budget: 5_000, ..Default::default() };
let trace = solve_position_with_rank(
    &PositionSnapshot::new(givens),
    &[Technique::Pointing],
    options,
).unwrap();
let index = trace.steps.iter()
    .position(|step| matches!(step, RankSolveStep::Rank { .. })).unwrap();
let replay = trace.replay_step(index).unwrap();
if let RankSolveStep::Rank { proof, .. } = replay.deduction {
    assert_eq!(replay_rank_proof_at(&replay.before, proof), Ok(true));
}
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
| `capabilities` | Reports `classic`, `variants`, `generation`, and `teaching` for the compiled build. |
| `techniques` | Technique IDs, aliases, costs, difficulty, uniqueness flags, default analysis order, canonical difficulty order, and scoring version |
| `rate` | `values` and optional `techniqueOrder`. Returns a versioned rating. |
| `logical-solve` | Start from `values` and optional `entries` and `eliminations`. `includePositions` adds snapshots. `includeStepDetails` adds masks and proof patterns. `includeMoveAvailability` adds Easy move counts and bottleneck flags. |
| `logical-solve-with-rank` | Takes the same starting position and `techniqueOrder`, with optional `rankOptions` and `includePositions`. Returns `technique` and `rank` steps, the named score subtotal, rank node usage, and the reason the solve ended. |
| `compare-solve-paths`, `alternate-solve-path` | Same starting position and order plus `technique`. Alternate search also takes `maxPositions` and reports `found`, `no-path`, or `inconclusive`. |
| `hints`, `next-deduction` | Current merged `values`, optional `eliminations` and `disabledTechniques`. For hints, `limit` defaults to 10 and can be `"all"`. `includePatterns` adds masks and proof patterns to the hint result. |
| `deductions`, `opening-techniques` | Deductions takes merged `values`, optional `eliminations`, and `techniqueOrder`. Opening techniques takes the untouched grid and reports all techniques that can act. |
| `prove-rank`, `rank-deductions` | Take a starting position, `pattern`, and `nodeBudget`. `prove-rank` also takes a `target` and returns `proven` with a proof, `compatible`, or `search-limit`. `rank-deductions` returns `proofs`, `nodesVisited`, and `complete`. |
| `discover-rank` | Takes a starting position, `target`, and `nodeBudget`. Returns the rank `outcome`, `nodesVisited`, and `effort` when it proves a removal. |
| `discover-rank-deductions` | Takes a starting position, `nodeBudget`, `maxNodesPerCandidate`, and an optional `limit` that defaults to 10. Returns ranked `proofs` and their `efforts` in the same order. Reports `nodesVisited`, `candidatesExamined`, `candidatesLimited`, and `complete`. |
| `replay-rank-proof` | Takes a starting position and a `proof` from either rank request. Returns whether the proof holds. |
| `rank-proof-effort` | Takes a starting position and `proof`. Returns the versioned effort breakdown, or `null` when the proof fails to replay. |
| `lesson-examples`, `practice-examples` | Lesson examples include a worked example and a transformed exercise per technique. Practice examples takes `technique` and returns three verified exercises. |
| `practice-position`, `check-practice-move` | Take a starting position and technique. The former optionally takes a solver order. The latter takes an `action` such as `{"eliminate":{"cell":24,"digit":2}}`. Both can return `null` when no matching position or proof is found. |
| `generate-targeted` | `seed`, `maxAttempts`, and `target` with `type` of `difficulty` or `opening`. Returns a grid string. |
| `generate-constrained`, `generate-from-pool` | `seed`, `maxAttempts`, `clues` as a number or inclusive range, optional `score` or `difficulty`, optional `technique`, and optional `techniqueOrder`. The constrained search accepts `templates` and returns a grid string. The built-in pool returns a grid and rating. |
| `generation-start`, `generation-advance`, `generation-cancel` | Use a distinct numeric `job` for each active search and pass a generation `request` at start. Advance returns `pending`, `matched`, or `exhausted`. Cancel returns `cancelled`. A terminal result releases the job ID. |

Rank patterns contain `bases` and `covers` arrays. Each constraint is a cell such as `{"cell":13}` or a digit in a house such as `{"house-digit":{"house":{"row":1},"digit":2}}`. Cell and house indices start at zero.

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

A `quadruple` rule uses `topLeft` for the upper-left cell of four cells around an internal grid intersection. Its `digits` array contains one to four printed occurrences. Repeated digits require separate cells. Rows, columns, and the selected regions still forbid repeats within their houses. A repeated clue can cross region borders.

```json
{"type":"quadruple","topLeft":21,"digits":[2,2,6]}
```

The exact solver enforces every occurrence even when the logical profile omits `quadruple`. The Quadruple technique costs 27 points at the Medium tier. Locked Candidates can also use a circle that requires a digit in a particular house. Its `locked-digit` evidence records the original rule indices, clue cells, input domains, target house, and confined digit. [`VariantClueScope`] identifies the source clue. The app uses this evidence for hints and trace replay.

Generation accepts `{"type":"quadruple","topLeft":21,"clueSize":3}` in `derivedClues`. It samples distinct surrounding cells from a completion and retains repeated digits. Rule-dependency and opening targets use the `quadruple` identifier. Imported app puzzles can use the rule before calibrated New puzzle presets exist.

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
| `anti-knight`, `anti-king`, `non-consecutive` | Each applies to the entire grid. Non-Consecutive applies to orthogonally adjacent cells; its optional `except` list exempts specified edge-sharing pairs. |
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

Classic detectors can run when the puzzle uses standard boxes. X-Wing, Swordfish, and Jellyfish also run with replacement regions because they use rows and columns. For a uniqueness deduction, the engine verifies uniqueness within a fixed node limit. It offers the deduction when all cells that can exchange digits are outside the scope of every additional rule. The proof records those cells.

For a `variant` request, set `operation` to `trace`, `rate`, or `hints`. Use `techniqueOrder` to choose the enabled techniques. An empty list disables all techniques, while an omitted field uses [`VariantTechnique::DEFAULT_ORDER`]. Exact validation continues to enforce every puzzle rule. Hints rank the available proofs by difficulty and cost, then by the number of cells in the proof. They return a single deduction when it is the only move available.

Use `replay-step` with a zero-based `stepIndex` to get the position before and after a move. Use `practice-position` with `technique` to get the position before its first use. To check a practice move, send `check-practice-move` with that position, the `technique`, and an `action`. The engine searches for a proof of the submitted action with the selected technique.

Use [`variant_practice_examples`] to load three exercises for a technique. In Wasm or `batch-variant`, send `practice-examples` with `variant: true` and the technique ID. Send `techniques` with `variant: true` to read the variant catalog, point costs, and default order. Each exercise includes its rules, the position before the move, the candidate masks, valid actions, and a suggested action with its proof.

The engine uses scoring version 6 for variants. It estimates the effort of each example proof from the cells to inspect, the choices in their candidate masks, and the reasoning the rule requires. The median of three estimates sets the technique cost. House sums also account for the house and source cages. The estimate is independent of how many actions the proof justifies. Shared singles and Locked Candidates use their classic point costs.

The variant technique tiers use costs through 26 points for Easy and through 68 for Medium. Cage Combinations and Arrow also start at Easy because they apply the basic rules of Killer and Arrow Sudoku. Higher costs start at Hard. Total points do not raise the difficulty. A complete path uses its hardest technique tier, and generation checks the requested tier and the lower-tier profile. A stalled path reports a partial total and keeps the selected rule set, technique order, and scoring version.

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

The engine benchmark times exact search, rating, traces, hints, and opening detection, and reports generation match rates and symmetry-adjusted diversity. The coverage benchmark reports logical solve rates and rating times separately for everyday, 17-clue, and expert fixtures. It writes replayable stalled positions to standard output and reports the group statistics on standard error. Pass `-- --dynamic-forcing` to append Dynamic Forcing Net or `-- --nested-forcing` to append Dynamic and Nested Forcing Nets. Pass `-- --advanced-forcing` to add Dynamic and Advanced Forcing Nets. With both flags, Advanced runs before Nested. Use `--aligned-exclusion` to run Aligned Exclusion before AIC. Select a published puzzle group with `--forcing-examples` or `--aligned-examples`.

Select the twelve depth-three examples with `--depth-three`. Add `--tridagon` to try direct Tridagon deductions before Forcing Chain and guardian nets before Nested Forcing Net.

Select Mission Impossible and the two grouped chain examples with `--tridagon-aic-examples`. Add `--tridagon-aic` to try guardian chains before Forcing Chain.

Select the nine ALS inference practice grids with `--als-inference-examples`. Add `--als-inference` to enable ALS AIC and both ALS Nice Loops before Forcing Chain. The flag also works with `--depth-three`. Use `--unique-rectangle-inference` to enable Unique Rectangle chains and both Nice Loops in the same part of the profile. Use `--pattern-overlay` to enable Pattern Overlay through five digits before Forcing Chain.

The variant benchmarks share fixtures for classic, X Sudoku, Killer, and mixed Jigsaw and Killer puzzles. They measure rating, ranked hints, and seeded generation. Pass `-- --pattern-overlay` to the Rust variant benchmark to compare the default and overlay profiles on both the original givens and the worked position of the published Jigsaw example. The Wasm run includes request encoding and response decoding. Run the Wasm build before the JavaScript benchmark. The benchmark reports raw and gzip binary sizes.

The 17-clue template collection is attributed to Gordon Royle and The University of Western Australia under Creative Commons Attribution 2.5. The practice data includes selected HoDoKu regression examples. The source for each supplemental fixture appears with its definition.
