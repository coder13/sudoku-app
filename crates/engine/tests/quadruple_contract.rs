#![cfg(feature = "variants")]
use sudoku_app_engine::{
    Analysis, Candidate, HintAction, PuzzleRule, SolveStatus, VariantEvidence, VariantHouseKind,
    VariantPosition, VariantPuzzle, VariantTechnique, parse_givens,
};
const EMPTY: [u8; 81] = [0; 81];
const NO_REMOVALS: [u16; 81] = [0; 81];
const SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

#[test]
fn quadruple_clues_validate_intersections_and_preserve_multiplicity() {
    use sudoku_app_engine::{VariantDefinitionError, canonical_variant};
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    for (top_left, digits) in [
        (8, vec![2]),
        (72, vec![2]),
        (0, vec![0]),
        (0, vec![10]),
        (0, vec![]),
        (0, vec![1, 2, 3, 4, 5]),
    ] {
        puzzle.rules = vec![PuzzleRule::Quadruple { top_left, digits }];
        assert!(matches!(
            puzzle.compile(),
            Err(VariantDefinitionError::InvalidRule(0))
        ));
    }
    let solution = parse_givens(
        "483591672267348159915726834159267348834915726672483591726834915591672483348159267",
    )
    .unwrap();
    puzzle.givens = solution;
    puzzle.rules = vec![PuzzleRule::Quadruple {
        top_left: 21,
        digits: vec![6, 2, 2],
    }];
    assert_eq!(
        puzzle.compile().unwrap().analyze(&[0; 81], &[0; 81], 10),
        Ok(Analysis::Unique)
    );
    let mut mirrored = VariantPuzzle::classic(std::array::from_fn(|cell| {
        solution[cell / 9 * 9 + 8 - cell % 9]
    }));
    mirrored.rules = vec![PuzzleRule::Quadruple {
        top_left: 22,
        digits: vec![2, 6, 2],
    }];
    assert_eq!(canonical_variant(&puzzle), canonical_variant(&mirrored));
    mirrored.rules = vec![PuzzleRule::Quadruple {
        top_left: 22,
        digits: vec![2, 6, 6],
    }];
    assert_eq!(
        mirrored.compile().unwrap().analyze(&[0; 81], &[0; 81], 10),
        Ok(Analysis::Conflict)
    );
    assert_ne!(canonical_variant(&puzzle), canonical_variant(&mirrored));
}

#[test]
fn a_repeated_quadruple_locks_a_digit_in_each_row_even_with_candidates_outside_it() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    let technique = VariantTechnique::LockedCandidates;
    for (digits, expected_count) in [(vec![2], 0), (vec![2, 2], 6)] {
        puzzle.rules = vec![PuzzleRule::Quadruple {
            top_left: 2,
            digits,
        }];
        let compiled = puzzle.compile().unwrap();
        let proofs = compiled
            .deductions(&EMPTY, &NO_REMOVALS, technique)
            .unwrap();
        assert_eq!(proofs.len(), expected_count);
        for proof in &proofs {
            let VariantEvidence::LockedDigit {
                digit,
                clue,
                target,
                cells,
                domains,
            } = &proof.evidence
            else {
                panic!("expected a digit confined by the circle");
            };
            assert_eq!(*digit, 2);
            assert_eq!(clue.rules, [0]);
            assert_eq!(clue.cells, [2, 3, 11, 12]);
            assert_eq!(domains, &[511; 4]);
            assert_eq!(cells.len(), 2);
            let house = compiled
                .houses()
                .iter()
                .find(|house| house.kind == *target)
                .unwrap();
            assert_eq!(
                *cells,
                clue.cells
                    .iter()
                    .filter(|cell| house.cells.contains(cell))
                    .copied()
                    .collect::<Vec<_>>()
            );
            assert_eq!(proof.actions.len(), 7);
            assert!(proof.actions.iter().all(|action| {
                let candidate = action.candidate();
                candidate.digit == 2
                    && house.cells.contains(&candidate.cell)
                    && !clue.cells.contains(&candidate.cell)
            }));
        }
        if expected_count != 0 {
            let row = proofs
                .iter()
                .find(|proof| {
                    matches!(
                        proof.evidence,
                        VariantEvidence::LockedDigit {
                            target: VariantHouseKind::Row(0),
                            ..
                        }
                    )
                })
                .unwrap();
            assert_eq!(
                row.actions,
                [0, 1, 4, 5, 6, 7, 8]
                    .map(|cell| HintAction::Eliminate(Candidate { cell, digit: 2 }))
            );
        }
    }
}

#[test]
fn default_profile_completes_a_puzzle_through_a_circle_to_row_lock() {
    let mut puzzle = VariantPuzzle::classic(
        parse_givens(
            "500678000000000008100340500000001400020800000700004806961030200200000005005080079",
        )
        .unwrap(),
    );
    puzzle.rules = [(47, vec![3, 5]), (34, vec![1, 2, 3, 9]), (60, vec![2, 6])]
        .map(|(top_left, digits)| PuzzleRule::Quadruple { top_left, digits })
        .into();
    let position = VariantPosition::new(puzzle);
    let default = VariantTechnique::DEFAULT_ORDER;
    let without_locks: Vec<_> = default
        .iter()
        .copied()
        .filter(|&technique| technique != VariantTechnique::LockedCandidates)
        .collect();
    assert_eq!(
        position.rate(&without_locks).unwrap().status,
        SolveStatus::Stalled
    );
    let trace = position.solve_logically(default).unwrap();
    assert!(matches!(trace.rating.status, SolveStatus::Solved(_)));
    let [index] = trace
        .steps
        .iter()
        .enumerate()
        .filter_map(|(index, step)| {
            matches!(step.evidence, VariantEvidence::LockedDigit { .. }).then_some(index)
        })
        .collect::<Vec<_>>()
        .try_into()
        .unwrap();
    let replay = trace.replay_step(index).unwrap();
    let action = HintAction::Eliminate(Candidate { cell: 68, digit: 6 });
    assert_eq!(replay.deduction.actions, [action]);
    assert_eq!(
        replay.deduction.evidence,
        VariantEvidence::LockedDigit {
            clue: sudoku_app_engine::VariantClueScope {
                rules: vec![2],
                cells: vec![60, 61, 69, 70]
            },
            target: VariantHouseKind::Row(7),
            cells: vec![69, 70],
            domains: vec![2, 128, 37, 37],
            digit: 6,
        }
    );
    let compiled = position.puzzle.compile().unwrap();
    let solution = parse_givens(SOLUTION).unwrap();
    assert_eq!(
        compiled.analyze(&EMPTY, &NO_REMOVALS, 10_000),
        Ok(Analysis::Unique)
    );
    assert_eq!(compiled.solve(&EMPTY, &NO_REMOVALS, 10_000), Ok(solution));
    for action in trace.steps.iter().flat_map(|step| &step.actions) {
        let candidate = action.candidate();
        assert_eq!(
            solution[candidate.cell] == candidate.digit,
            matches!(action, HintAction::Place(_))
        );
    }
}

#[cfg(feature = "wasm-api")]
#[test]
fn published_clover_puzzle_needs_its_circles_and_replays_sound_steps() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/quadruple-clover.json"
    ))
    .unwrap();
    let puzzle: VariantPuzzle = serde_json::from_value(fixture["puzzle"].clone()).unwrap();
    let expected = parse_givens(fixture["solution"].as_str().unwrap()).unwrap();
    let compiled = puzzle.compile().unwrap();
    assert_eq!(
        compiled.analyze(&EMPTY, &NO_REMOVALS, 100_000),
        Ok(Analysis::Unique)
    );
    assert_eq!(compiled.solve(&EMPTY, &NO_REMOVALS, 100_000), Ok(expected));
    assert_eq!(
        VariantPuzzle::classic(puzzle.givens)
            .compile()
            .unwrap()
            .analyze(&EMPTY, &NO_REMOVALS, 100_000),
        Ok(Analysis::Multiple)
    );
    let position = VariantPosition::new(puzzle);
    let trace = position
        .solve_logically(VariantTechnique::DEFAULT_ORDER)
        .unwrap();
    assert!(matches!(trace.rating.status, SolveStatus::Solved(_)));
    assert!(
        trace
            .steps
            .iter()
            .any(|step| matches!(step.evidence, VariantEvidence::LockedDigit { .. }))
    );
    assert_eq!(
        trace.rating,
        position.rate(VariantTechnique::DEFAULT_ORDER).unwrap()
    );
    for (index, step) in trace.steps.iter().enumerate() {
        assert_eq!(trace.replay_step(index).unwrap().deduction, step);
        for action in &step.actions {
            let candidate = action.candidate();
            assert_eq!(
                expected[candidate.cell] == candidate.digit,
                matches!(action, HintAction::Place(_))
            );
        }
    }
    for (cell, &digit) in expected.iter().enumerate() {
        assert_eq!(
            trace.end.entries[cell].max(trace.end.puzzle.givens[cell]),
            digit
        );
    }
}
