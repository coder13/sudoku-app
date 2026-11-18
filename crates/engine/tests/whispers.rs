#![cfg(all(feature = "variants", feature = "wasm-api"))]

use sudoku_app_engine::{
    Analysis, HintAction, PuzzleRule, SolveStatus, VariantDeduction, VariantEvidence,
    VariantLineHouseProof, VariantPosition, VariantPuzzle, VariantTechnique,
};

fn fixture() -> (VariantPuzzle, String) {
    let data: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/whispers-brain-zaps.json"
    ))
    .unwrap();
    (
        serde_json::from_value(data["puzzle"].clone()).unwrap(),
        data["solution"].as_str().unwrap().into(),
    )
}

#[test]
fn published_three_given_puzzle_has_a_complete_replayable_whispers_path() {
    let (puzzle, solution) = fixture();
    let position = VariantPosition::new(puzzle);
    let compiled = position.puzzle.compile().unwrap();
    assert_eq!(
        compiled.analyze(&[0; 81], &[0; 81], 100_000),
        Ok(Analysis::Unique)
    );
    let trace = position
        .solve_logically(VariantTechnique::DEFAULT_ORDER)
        .unwrap();
    assert!(matches!(trace.rating.status, SolveStatus::Solved(_)));
    assert_eq!(
        trace
            .end
            .entries
            .iter()
            .zip(trace.end.puzzle.givens)
            .map(|(&a, b)| char::from(b'0' + a.max(b)))
            .collect::<String>(),
        solution
    );
    let mut count = 0;
    for (index, proof) in trace.steps.iter().enumerate() {
        if proof.technique != VariantTechnique::WhispersHouseSupport {
            continue;
        }
        replay(&trace.replay_step(index).unwrap().before, proof);
        count += 1;
    }
    assert!(count > 0);
    let old: Vec<_> = VariantTechnique::DEFAULT_ORDER
        .iter()
        .copied()
        .filter(|t| *t != VariantTechnique::WhispersHouseSupport)
        .collect();
    let prior = position.solve_logically(&old).unwrap();
    assert_eq!(prior.rating.status, SolveStatus::Stalled);
    assert_eq!(prior.steps.len(), 4);
}

#[cfg(feature = "teaching")]
#[test]
fn every_line_house_practice_proof_replays_from_its_declared_premises() {
    for exercise in
        sudoku_app_engine::variant_practice_examples(VariantTechnique::WhispersHouseSupport)
            .unwrap()
    {
        replay(&exercise.position, &exercise.deduction);
        assert!(
            !exercise
                .position
                .puzzle
                .compile()
                .unwrap()
                .deductions(
                    &exercise.position.entries,
                    &exercise.position.eliminations,
                    VariantTechnique::Whispers
                )
                .unwrap()
                .iter()
                .any(|proof| proof.actions.contains(&exercise.suggestion))
        );
    }
}

#[test]
fn jigsaw_regions_and_extra_houses_replace_standard_box_assumptions() {
    let regions = (0..9).map(|r| (9 * r..9 * r + 9).collect()).collect();
    let mut puzzle = VariantPuzzle::jigsaw([0; 81], regions);
    puzzle.rules.push(PuzzleRule::Whispers {
        cells: vec![0, 10, 20],
        min_difference: 5,
    });
    let mut position = VariantPosition::new(puzzle);
    position.eliminations[0] = 511 & !12;
    position.eliminations[10] = 511 & !384;
    position.eliminations[20] = 511 & !12;
    let find = |position: &VariantPosition| {
        position
            .puzzle
            .compile()
            .unwrap()
            .deductions(
                &position.entries,
                &position.eliminations,
                VariantTechnique::WhispersHouseSupport,
            )
            .unwrap()
    };
    assert!(find(&position).is_empty());
    position.puzzle.rules.push(PuzzleRule::ExtraHouse {
        cells: vec![0, 10, 20, 3, 4, 5, 6, 7, 8],
    });
    let proofs = find(&position);
    assert_eq!(proofs.len(), 1);
    assert!(
        proofs[0]
            .actions
            .contains(&HintAction::Eliminate(sudoku_app_engine::Candidate {
                cell: 10,
                digit: 8
            }))
    );
    replay(&position, &proofs[0]);
    position.puzzle.rules.pop();
    position.puzzle.rules.push(PuzzleRule::Diagonal {
        diagonal: sudoku_app_engine::Diagonal::Main,
    });
    let proofs = find(&position);
    assert_eq!(proofs.len(), 1);
    replay(&position, &proofs[0]);
}

fn replay(position: &VariantPosition, proof: &VariantDeduction) {
    let VariantEvidence::LineHouses(line) = &proof.evidence else {
        panic!("Expected line/house evidence")
    };
    let VariantLineHouseProof {
        rules,
        cells,
        domains,
        supported,
        houses,
        assignments,
    } = line.as_ref();
    let compiled = position.puzzle.compile().unwrap();
    let declared: Vec<_> = houses
        .iter()
        .map(|kind| {
            compiled
                .houses()
                .iter()
                .find(|house| &house.kind == kind)
                .unwrap()
                .cells
        })
        .collect();
    let mut sequences = vec![Vec::<u8>::new()];
    for (index, (&cell, &mask)) in cells.iter().zip(domains).enumerate() {
        let mut next = vec![];
        for sequence in sequences {
            for digit in 1u8..=9 {
                if mask & (1 << (digit - 1)) == 0 {
                    continue;
                }
                if sequence.iter().enumerate().any(|(i, &prior)| {
                    prior == digit
                        && declared
                            .iter()
                            .any(|house| house.contains(&cell) && house.contains(&cells[i]))
                }) {
                    continue;
                }
                let valid = rules.iter().all(|&rule| {
                    let PuzzleRule::Whispers {
                        cells: path,
                        min_difference,
                    } = &position.puzzle.rules[rule]
                    else {
                        panic!("Wrong rule provenance")
                    };
                    path.windows(2).all(|pair| {
                        let other = if pair[0] == cell {
                            pair[1]
                        } else if pair[1] == cell {
                            pair[0]
                        } else {
                            return true;
                        };
                        let Some(prior) = cells[..index].iter().position(|&c| c == other) else {
                            return true;
                        };
                        digit.abs_diff(sequence[prior]) >= *min_difference
                    })
                });
                if valid {
                    let mut copy = sequence.clone();
                    copy.push(digit);
                    next.push(copy);
                }
            }
        }
        sequences = next;
    }
    assert_eq!(sequences.len(), *assignments as usize);
    let union: Vec<u16> = (0..cells.len())
        .map(|i| {
            sequences
                .iter()
                .fold(0, |mask, row| mask | 1 << (row[i] - 1))
        })
        .collect();
    assert_eq!(&union, supported);
    for action in &proof.actions {
        let HintAction::Eliminate(candidate) = action else {
            panic!("Expected removal")
        };
        let index = cells
            .iter()
            .position(|&cell| cell == candidate.cell)
            .unwrap();
        assert_ne!(domains[index] & 1 << (candidate.digit - 1), 0);
        assert_eq!(union[index] & 1 << (candidate.digit - 1), 0);
    }
}

#[test]
fn reversing_a_whispers_path_preserves_the_complete_action_set() {
    let (mut puzzle, _) = fixture();
    let first = puzzle
        .compile()
        .unwrap()
        .deductions(&[0; 81], &[0; 81], VariantTechnique::WhispersHouseSupport)
        .unwrap();
    for rule in &mut puzzle.rules {
        let PuzzleRule::Whispers { cells, .. } = rule else {
            unreachable!()
        };
        cells.reverse();
    }
    let second = puzzle
        .compile()
        .unwrap()
        .deductions(&[0; 81], &[0; 81], VariantTechnique::WhispersHouseSupport)
        .unwrap();
    assert_eq!(
        first.iter().map(|proof| &proof.actions).collect::<Vec<_>>(),
        second
            .iter()
            .map(|proof| &proof.actions)
            .collect::<Vec<_>>()
    );
    for proof in second {
        replay(&VariantPosition::new(puzzle.clone()), &proof);
    }
}

#[test]
fn closed_walk_keeps_its_last_edge_and_uses_one_variable_per_cell() {
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    puzzle.rules.push(PuzzleRule::Whispers {
        cells: vec![0, 10, 20, 0],
        min_difference: 4,
    });
    let encoded = serde_json::to_value(&puzzle).unwrap();
    assert_eq!(
        encoded["rules"][0]["cells"],
        serde_json::json!([0, 10, 20, 0])
    );
    let proofs = puzzle
        .compile()
        .unwrap()
        .deductions(&[0; 81], &[0; 81], VariantTechnique::WhispersHouseSupport)
        .unwrap();
    assert_eq!(proofs.len(), 1);
    let VariantEvidence::LineHouses(line) = &proofs[0].evidence else {
        panic!()
    };
    assert_eq!(line.cells, [0, 10, 20]);
    assert_eq!(line.supported, [273, 273, 273]);
    assert_eq!(line.assignments, 6);
    let wire = serde_json::to_value(&proofs[0].evidence).unwrap();
    assert_eq!(wire["type"], "line-houses");
    assert_eq!(wire["cells"], serde_json::json!([0, 10, 20]));
    replay(&VariantPosition::new(puzzle), &proofs[0]);
}
