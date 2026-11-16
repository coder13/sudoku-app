use std::collections::{BTreeMap, BTreeSet};

use sudoku_app_engine::{
    AlternatePathStatus, Analysis, Board, Candidate, Difficulty, GenerationConstraints, HintAction,
    HintChoices, HintError, HintEvidence, House, PositionSnapshot, ProfileError, ProofPattern,
    SolveStatus, SolverProfile, Technique, VerifiedTemplate, candidates, canonical_puzzle,
    check_practice_move, compare_paths, deductions_at, generate_constrained, hint_choices,
    opening_techniques, parse_givens, rate_puzzle, search_alternate_path, solve, solve_logically,
    solve_position, technique_deductions, technique_deductions_at,
};

// This Royle 17-clue puzzle exceeds the exact-search budget on its original grid.
const SPARSE: &str =
    "345000000000200010000000000020100000000004500600000007800750000000060040000000300";
const TEMPLATE: &str =
    "000500000600000309000008200000000000538000000000007001200090000001000007000300080";

fn assert_replayed_trace(givens: Board, level: Difficulty, expected_points: u32) {
    let order = Technique::DEFAULT_ORDER;
    let rating = rate_puzzle(&givens, order).unwrap();
    let trace = solve_logically(&givens, order).unwrap();
    assert_eq!(rating.status, SolveStatus::Solved(level));
    assert_eq!(rating.score.points, expected_points);
    assert_eq!(rating.score, trace.score);
    assert_eq!(rating.status, trace.status);
    assert_eq!(rating.technique_order, trace.technique_order);
    assert_eq!(rating.scoring_version, trace.scoring_version);

    let mut board = givens;
    let mut snapshot = PositionSnapshot::new(givens);
    let mut positions = trace.positions();
    assert_eq!(positions.next().as_ref(), Some(&snapshot));
    let mut counts = BTreeMap::new();
    let mut points = 0;
    for (index, step) in trace.steps.iter().enumerate() {
        let replay = trace.replay_step(index).unwrap();
        assert_eq!(replay.before, snapshot);
        assert_eq!(replay.deduction, step);
        let legal = candidates(&board).unwrap();
        assert!(!step.actions.is_empty());
        points += u32::from(step.cost());
        *counts.entry(step.technique).or_insert(0u32) += 1;
        for &action in &step.actions {
            let (HintAction::Place(Candidate { cell, digit })
            | HintAction::Eliminate(Candidate { cell, digit })) = action;
            let bit = 1 << (digit - 1);
            assert_eq!(board[cell], 0);
            assert_ne!(legal[cell] & !snapshot.eliminations[cell] & bit, 0);
            match action {
                HintAction::Place(_) => {
                    board[cell] = digit;
                    snapshot.entries[cell] = digit;
                }
                HintAction::Eliminate(_) => snapshot.eliminations[cell] |= bit,
            }
        }
        assert_eq!(replay.after, snapshot);
        assert_eq!(positions.next().as_ref(), Some(&snapshot));
    }
    assert_eq!(positions.next(), None);
    assert_eq!(trace.replay_step(trace.steps.len()), None);
    assert_eq!(board, trace.board);
    assert!(!board.contains(&0));
    assert!(candidates(&board).is_some());
    assert_eq!(points, rating.score.points);
    assert_eq!(counts, rating.score.counts);
}

#[test]
fn sparse_board_has_a_rating_a_replayable_trace_and_opening_deductions() {
    let board = parse_givens(SPARSE).unwrap();
    assert_replayed_trace(board, Difficulty::Medium, 766);
    let openers = opening_techniques(&board).unwrap();
    let HintChoices::Choices(hints) = hint_choices(&board, None).unwrap() else {
        panic!("expected choices on the original grid");
    };
    for hint in hints {
        assert!(openers.contains(&hint.technique));
        assert!(
            technique_deductions(&board, None, hint.technique)
                .unwrap()
                .contains(&hint)
        );
    }
}

#[test]
fn a_permuted_verified_template_can_match_even_when_raw_search_runs_out() {
    let template = parse_givens(TEMPLATE).unwrap();
    let constraints = GenerationConstraints {
        clues: 17,
        score: Some(766..=766),
        technique_order: Technique::DEFAULT_ORDER,
    };
    let generated = generate_constrained(42, &constraints, &[template], 1).unwrap();
    assert_eq!(generated.iter().filter(|&&cell| cell != 0).count(), 17);
    assert_replayed_trace(generated, Difficulty::Medium, 766);
}

#[test]
fn expert_rating_replays_the_same_deductions_with_the_same_score() {
    let technique = Technique::MultiSectorLockedSets;
    let board = parse_givens(technique.practice_example().givens).unwrap();
    assert_replayed_trace(board, Difficulty::Extreme, 1994);
    assert_eq!(
        rate_puzzle(&board, Technique::DEFAULT_ORDER)
            .unwrap()
            .score
            .hardest,
        Some(technique)
    );
}

#[test]
fn every_catalog_id_is_unique_and_every_default_entry_resolves() {
    let ids: BTreeSet<_> = Technique::ALL
        .iter()
        .map(|technique| technique.id())
        .collect();
    assert_eq!(ids.len(), Technique::ALL.len());
    for &technique in Technique::DEFAULT_ORDER {
        assert!(Technique::ALL.contains(&technique));
        assert!(technique.cost() > 0);
    }
    assert_eq!(
        Technique::DEFAULT_ORDER
            .iter()
            .collect::<BTreeSet<_>>()
            .len(),
        Technique::DEFAULT_ORDER.len()
    );
    assert!(ids.contains("x-wing"));
    for technique in Technique::ALL {
        assert_eq!(Technique::from_id(technique.id()), Some(technique));
    }
}

#[test]
fn profiles_round_trip_stable_ids_and_keep_disabled_techniques_disabled() {
    let profile = SolverProfile::from_ids(["x-wing", "hidden-single", "naked-single"]).unwrap();
    assert_eq!(
        profile.technique_order(),
        [
            Technique::XWing,
            Technique::HiddenSingle,
            Technique::NakedSingle
        ]
    );
    assert_eq!(SolverProfile::from_ids(profile.ids()), Ok(profile));
    assert!(
        SolverProfile::from_ids([])
            .unwrap()
            .technique_order()
            .is_empty()
    );
    assert_eq!(
        SolverProfile::default().technique_order(),
        Technique::DEFAULT_ORDER
    );
    assert_eq!(
        SolverProfile::from_ids(["x-wing", "x-wing"]),
        Err(ProfileError::DuplicateTechnique(Technique::XWing))
    );
    assert_eq!(
        SolverProfile::from_ids(["X-Wing"]),
        Err(ProfileError::UnknownTechnique(String::from("X-Wing")))
    );
}

#[test]
fn deduction_search_groups_the_move_and_keeps_each_selected_proof() {
    let board = parse_givens(SPARSE).unwrap();
    let mut complete = solve_logically(&board, Technique::DEFAULT_ORDER)
        .unwrap()
        .board;
    let target = Candidate {
        cell: 0,
        digit: complete[0],
    };
    assert!(!complete.contains(&0));
    complete[0] = 0;
    let position = PositionSnapshot::new(complete);
    let techniques = [Technique::HiddenSingle, Technique::FullHouse];
    let moves = deductions_at(&position, &techniques).unwrap();
    let [found] = moves.as_slice() else {
        panic!("only one cell can change")
    };
    assert_eq!(found.actions, [HintAction::Place(target)]);
    assert_eq!(found.affected_cells, [target.cell]);
    assert_eq!(found.affected_candidates, [target]);
    let houses = [House::Row(0), House::Column(0), House::Box(0)];
    let expected: Vec<_> = techniques
        .into_iter()
        .flat_map(|technique| houses.map(|house| (technique, house)))
        .collect();
    assert_eq!(found.proofs.len(), expected.len());
    for (proof, (technique, house)) in found.proofs.iter().zip(expected) {
        assert_eq!(proof.technique, technique);
        assert_eq!(proof.evidence, HintEvidence::House(house));
        assert_eq!(proof.pattern.houses, [house]);
        assert_eq!(proof.pattern.cells, [target.cell]);
        assert_eq!(proof.pattern.candidates, [target]);
    }
    assert!(deductions_at(&position, &[]).unwrap().is_empty());
    let mut repeated = techniques.to_vec();
    repeated.push(Technique::HiddenSingle);
    assert_eq!(deductions_at(&position, &repeated).unwrap(), moves);
}

#[test]
fn each_practice_proof_identifies_its_active_candidates_and_effects() {
    for technique in Technique::ALL {
        let example = technique.practice_example();
        let position = example.position().unwrap();
        let moves = deductions_at(&position, &[technique]).unwrap();
        let found = moves
            .iter()
            .find(|found| found.actions == example.expected_actions)
            .unwrap_or_else(|| panic!("missing proof for {technique:?}"));
        let legal = candidates(&position.values().unwrap()).unwrap();
        let known = |candidate: &Candidate| {
            legal[candidate.cell]
                & !position.eliminations[candidate.cell]
                & (1 << (candidate.digit - 1))
                != 0
        };
        assert!(found.affected_candidates.iter().all(known));
        assert_eq!(
            found
                .affected_candidates
                .iter()
                .copied()
                .collect::<BTreeSet<_>>(),
            found
                .actions
                .iter()
                .map(|action| action.candidate())
                .collect()
        );
        assert_eq!(
            found
                .affected_cells
                .iter()
                .copied()
                .collect::<BTreeSet<_>>(),
            found
                .affected_candidates
                .iter()
                .map(|candidate| candidate.cell)
                .collect()
        );
        assert!(!found.proofs.is_empty());
        for proof in &found.proofs {
            assert_eq!(proof.technique, technique);
            assert!(
                !proof.pattern.candidates.is_empty(),
                "empty pattern for {technique:?}"
            );
            assert!(
                proof
                    .pattern
                    .candidates
                    .iter()
                    .all(|candidate| known(candidate)
                        && proof.pattern.cells.contains(&candidate.cell))
            );
        }
    }
}

#[test]
fn complex_fish_profiles_and_practice_prove_only_valid_removals() {
    for technique in [Technique::FrankenFish, Technique::MutantFish] {
        let example = technique.practice_example();
        let mut position = example.position().unwrap();
        let solution = solve(&position.values().unwrap()).unwrap();
        let moves = technique_deductions_at(&position, technique).unwrap();
        assert!(
            moves
                .iter()
                .any(|hint| hint.actions == example.expected_actions)
        );
        for hint in &moves {
            assert!(matches!(hint.evidence, HintEvidence::ComplexFish { .. }));
            for action in &hint.actions {
                let HintAction::Eliminate(candidate) = action else {
                    panic!("{technique:?} should only remove candidates");
                };
                assert_ne!(solution[candidate.cell], candidate.digit);
            }
        }
        let path = solve_position(&position, &[technique]).unwrap();
        assert_eq!(path.steps.first().unwrap().technique, technique);
        assert_eq!(path.technique_order, [technique]);

        if technique == Technique::MutantFish {
            // A restored 4 at r2c5 supplies an unbalanced base candidate that r1c9 cannot see.
            position.eliminations[13] &= !(1 << (4 - 1));
            assert!(
                check_practice_move(&position, technique, example.expected_actions[0])
                    .unwrap()
                    .is_none()
            );
        }
    }
}

// Count the proof's sites by house and digit. For fixed-shape rules, the
// surrounding empty cells also distinguish the positions presented to the player.
fn practice_layout(board: &Board, pattern: &ProofPattern) -> Vec<usize> {
    let mut rows = [0; 9];
    let mut columns = [0; 9];
    let mut boxes = [0; 9];
    let mut digits = [0; 9];
    let mut surroundings = Vec::new();
    for &cell in &pattern.cells {
        let row = cell / 9;
        let column = cell % 9;
        let block = cell / 27 * 3 + column / 3;
        rows[row] += 1;
        columns[column] += 1;
        boxes[block] += 1;
        let open_in = |same_house: fn(usize, usize) -> bool| {
            board
                .iter()
                .enumerate()
                .filter(|&(i, &digit)| digit == 0 && same_house(i, cell))
                .count()
        };
        let open_row = open_in(|a, b| a / 9 == b / 9);
        let open_column = open_in(|a, b| a % 9 == b % 9);
        let open_box = open_in(|a, b| a / 27 == b / 27 && a % 9 / 3 == b % 9 / 3);
        surroundings.push([
            open_row.min(open_column),
            open_row.max(open_column),
            open_box,
        ]);
    }
    for candidate in &pattern.candidates {
        digits[usize::from(candidate.digit - 1)] += 1;
    }
    let mut types = [0; 3];
    for house in &pattern.houses {
        types[match house {
            House::Row(_) => 0,
            House::Column(_) => 1,
            House::Box(_) => 2,
        }] += 1;
    }
    if types[0] > types[1] {
        types.swap(0, 1);
    }
    for counts in [&mut rows, &mut columns, &mut boxes, &mut digits] {
        counts.sort_unstable();
    }
    surroundings.sort_unstable();
    let mut layout = [rows.min(columns), rows.max(columns), boxes, digits].concat();
    layout.extend(types);
    layout.extend(surroundings.into_iter().flatten());
    layout
}

#[test]
fn each_technique_has_three_distinct_practice_grids_with_varied_proof_layouts() {
    for technique in Technique::ALL {
        let mut layouts = BTreeSet::new();
        let mut puzzles = BTreeSet::new();
        for example in technique.practice_examples() {
            let position = example.position().unwrap();
            let board = position.values().unwrap();
            let verified = VerifiedTemplate::verify(board)
                .unwrap_or_else(|error| panic!("{technique:?}: invalid practice grid {error:?}"));
            assert!(
                puzzles.insert(canonical_puzzle(&position.givens)),
                "{technique:?}: equivalent practice grids"
            );
            let moves = deductions_at(&position, &[technique]).unwrap();
            let expected = moves
                .iter()
                .find(|found| found.actions == example.expected_actions)
                .unwrap_or_else(|| panic!("{technique:?}: missing expected practice deduction"));
            for action in &expected.actions {
                let candidate = action.candidate();
                assert_eq!(
                    verified.solution()[candidate.cell] == candidate.digit,
                    matches!(action, HintAction::Place(_)),
                    "{technique:?}: incorrect {action:?}"
                );
            }
            for proof in &expected.proofs {
                layouts.insert(practice_layout(&board, &proof.pattern));
            }
        }
        assert_eq!(puzzles.len(), 3);
        assert!(layouts.len() >= 2, "{technique:?}: repeated proof layout");
    }
}

#[test]
fn alternate_search_backtracks_when_the_preferred_deductions_stall() {
    use Technique::{Aic, GroupedAic, HiddenSingle, NakedSingle, WWing, XYWing};
    let position = Technique::UniqueRectangle1
        .practice_example()
        .position()
        .unwrap();
    let order = [NakedSingle, HiddenSingle, XYWing, WWing, Aic, GroupedAic];
    let comparison = compare_paths(&position, &order, Aic).unwrap();
    assert_eq!(comparison.without_technique.status, SolveStatus::Stalled);
    assert!(!comparison.without_technique.steps.is_empty());
    let result = search_alternate_path(&position, &order, Aic, 50).unwrap();
    assert_eq!(result.status, AlternatePathStatus::Found);
    let path = result.path.unwrap();
    assert_eq!(path.board, solve(&position.values().unwrap()).unwrap());
    assert_eq!(
        path.technique_order,
        comparison.without_technique.technique_order
    );
    assert!(result.positions_searched as usize > path.steps.len());
    for index in 0..path.steps.len() {
        let replay = path.replay_step(index).unwrap();
        assert!(!matches!(replay.deduction.technique, Aic));
        assert!(
            technique_deductions_at(&replay.before, replay.deduction.technique)
                .unwrap()
                .contains(replay.deduction)
        );
    }
}

#[test]
fn practice_starts_before_the_first_target_deduction_and_retains_the_prefix() {
    use Technique::{HiddenSingle, LockedPair, NakedSingle, XWing};
    let givens = parse_givens(LockedPair.practice_example().givens).unwrap();
    let target = NakedSingle;
    let trace = solve_logically(&givens, &[LockedPair, target, HiddenSingle]).unwrap();
    let practice = trace.practice_position(target).unwrap();
    let mut expected = PositionSnapshot::new(givens);
    expected.entries[12] = 8;
    expected.entries[16] = 9;
    expected.eliminations[2] = 1 << 3;
    expected.eliminations[5] = 1 << 7;
    expected.eliminations[16] = (1 << 3) | (1 << 7);
    assert_eq!(practice, expected);
    let next = trace.replay_step(3).unwrap();
    assert_eq!(next.before, practice);
    assert_eq!(
        next.deduction.actions,
        [HintAction::Place(Candidate { cell: 26, digit: 5 })]
    );
    assert_eq!(
        solve_position(&practice, &[target]).unwrap().steps.first(),
        Some(next.deduction)
    );
    assert_eq!(
        trace.practice_position(LockedPair),
        Some(PositionSnapshot::new(givens))
    );
    assert_eq!(trace.practice_position(XWing), None);

    let stalled = solve_logically(&givens, &[LockedPair]).unwrap();
    assert_eq!(stalled.status, SolveStatus::Stalled);
    assert_eq!(
        stalled.practice_position(LockedPair),
        Some(PositionSnapshot::new(givens))
    );
}

#[test]
fn practice_check_accepts_an_alternate_effect_and_requires_a_proof_of_the_target_technique() {
    use Technique::{Claiming, LockedPair, Pointing};
    let mut position = LockedPair.practice_example().position().unwrap();
    let remove = |cell, digit| HintAction::Eliminate(Candidate { cell, digit });
    let attempt = remove(32, 2);
    let proof = check_practice_move(&position, Pointing, attempt)
        .unwrap()
        .unwrap();
    assert_eq!(proof.technique, Pointing);
    assert_eq!(proof.actions, [remove(30, 2), attempt]);
    assert_eq!(
        proof.evidence,
        HintEvidence::Intersection {
            source: House::Box(3),
            target: House::Row(3),
            cells: vec![27, 28, 29],
        }
    );
    assert!(
        check_practice_move(&position, Claiming, attempt)
            .unwrap()
            .is_some()
    );
    assert_eq!(
        check_practice_move(&position, LockedPair, attempt),
        Ok(None)
    );
    assert_eq!(
        check_practice_move(&position, Pointing, HintAction::Place(attempt.candidate())),
        Ok(None)
    );
    for invalid in [remove(81, 2), remove(32, 0), remove(32, 10)] {
        assert_eq!(check_practice_move(&position, Pointing, invalid), Ok(None));
    }
    position.eliminations[32] = 1 << 1;
    assert_eq!(check_practice_move(&position, Pointing, attempt), Ok(None));
    assert_eq!(
        check_practice_move(&position, Pointing, remove(30, 2))
            .unwrap()
            .unwrap()
            .actions,
        [remove(30, 2)]
    );
}

#[test]
fn hints_and_solving_use_the_same_entries_and_established_removals() {
    let givens = parse_givens(
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    )
    .unwrap();
    let mut position = PositionSnapshot::new(givens);
    position.entries[40] = 5;
    let expected = HintAction::Place(Candidate { cell: 2, digit: 4 });
    let profile = [Technique::NakedSingle];
    let trace = solve_position(&position, &profile).unwrap();
    assert_eq!(trace.replay_step(0).unwrap().before, position);
    assert!(
        deductions_at(&position, &profile)
            .unwrap()
            .iter()
            .all(|found| found.actions != [expected])
    );
    position.eliminations[2] = 0b11;
    let found = deductions_at(&position, &profile)
        .unwrap()
        .into_iter()
        .find(|found| found.actions == [expected])
        .unwrap();
    assert_eq!(found.proofs[0].pattern.candidates, [expected.candidate()]);
    let deductions = technique_deductions_at(&position, Technique::NakedSingle).unwrap();
    assert!(
        deductions
            .iter()
            .any(|deduction| deduction.actions == [expected])
    );
    let trace = solve_position(&position, &profile).unwrap();
    let first = trace.replay_step(0).unwrap();
    let mut after = position.clone();
    after.entries[2] = 4;
    assert_eq!(first.before, position);
    assert_eq!(first.deduction.actions, [expected]);
    assert_eq!(first.after, after);
    assert_eq!(trace.board[40], 5);
    assert!(!trace.steps.iter().any(|step| {
        step.actions
            .contains(&HintAction::Place(Candidate { cell: 40, digit: 5 }))
    }));

    position.eliminations[2] |= 1 << 3;
    assert_eq!(
        deductions_at(&position, &profile),
        Err(HintError::InvalidEliminations)
    );
    assert_eq!(
        solve_position(&position, &[Technique::NakedSingle]),
        Err(HintError::InvalidEliminations)
    );
    position.entries[0] = 9;
    assert_eq!(position.values(), Err(Analysis::Conflict));
}
