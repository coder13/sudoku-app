#![cfg(all(feature = "variants"))]

use sudoku_app_engine::{
    Analysis, Candidate, ClueDirection, HintAction, KillerCage, MarkedPairs, Parity, PuzzleRule,
    SolveStatus, Technique, VARIANT_SCORING_VERSION, VariantEvidence, VariantHouseKind,
    VariantPosition, VariantPositionError, VariantPuzzle, VariantTechnique, VariantVisibility,
    VariantVisibilityError, parse_givens,
};

const EMPTY: [u8; 81] = [0; 81];
const NO_REMOVALS: [u16; 81] = [0; 81];
const SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

fn crossing_cages() -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules.push(PuzzleRule::KillerCages {
        cages: vec![
            KillerCage {
                cells: (0..8).collect(),
                sum: 43,
            },
            KillerCage {
                cells: vec![8, 17],
                sum: 10,
            },
        ],
        cover_grid: false,
    });
    puzzle
}

#[test]
fn house_sums_explain_the_innie_and_outie_in_a_crossing_cage() {
    let puzzle = crossing_cages().compile().unwrap();
    let solution = parse_givens(SOLUTION).unwrap();
    assert_eq!(
        puzzle.analyze(&solution, &NO_REMOVALS, 1),
        Ok(Analysis::Unique)
    );

    let proofs = puzzle
        .deductions(&EMPTY, &NO_REMOVALS, VariantTechnique::CageHouseSum)
        .unwrap();
    for (cell, digit, sources) in [(8, 2, vec![[0, 0]]), (17, 8, vec![[0, 0], [0, 1]])] {
        let proof = proofs
            .iter()
            .find(|proof| {
                proof.evidence
                    == VariantEvidence::CageSum {
                        house: Some(VariantHouseKind::Row(0)),
                        cages: sources.clone(),
                        sum: u16::from(digit),
                        cells: vec![cell],
                        domains: vec![0x1ff],
                    }
            })
            .unwrap();
        let expected: Vec<_> = (1..=9)
            .filter(|&other| other != digit)
            .map(|digit| HintAction::Eliminate(Candidate { cell, digit }))
            .collect();
        assert_eq!(proof.actions, expected);
    }

    let mut removed = NO_REMOVALS;
    for proof in proofs {
        for action in proof.actions {
            let candidate = action.candidate();
            assert_ne!(solution[candidate.cell], candidate.digit);
            removed[candidate.cell] |= 1 << (candidate.digit - 1);
        }
    }
    assert!(
        puzzle
            .deductions(&EMPTY, &removed, VariantTechnique::CageHouseSum)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn cage_combinations_use_candidate_locations_and_keep_proofs_explicit() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules.push(PuzzleRule::KillerCages {
        cages: vec![KillerCage {
            cells: vec![0, 1],
            sum: 8,
        }],
        cover_grid: false,
    });
    let puzzle = puzzle.compile().unwrap();
    let mut removed = NO_REMOVALS;
    removed[0] = 0x1ff & !0b11;
    removed[1] = 0x1ff & !0b111100000;

    assert!(
        puzzle
            .deductions(&EMPTY, &removed, VariantTechnique::NakedSingle)
            .unwrap()
            .is_empty()
    );
    let proofs = puzzle
        .deductions(&EMPTY, &removed, VariantTechnique::CageCombinations)
        .unwrap();
    assert_eq!(proofs.len(), 1);
    assert_eq!(
        proofs[0].actions,
        vec![
            HintAction::Eliminate(Candidate { cell: 1, digit: 8 }),
            HintAction::Eliminate(Candidate { cell: 1, digit: 9 }),
        ]
    );
    assert_eq!(
        puzzle
            .ranked_hints(&EMPTY, &removed, VariantTechnique::DEFAULT_ORDER, 10)
            .unwrap(),
        proofs,
    );

    let mut wrong = EMPTY;
    wrong[0] = 9;
    assert_eq!(
        puzzle.ranked_hints(&wrong, &NO_REMOVALS, &[], 10),
        Err(VariantPositionError::Puzzle(Analysis::Conflict)),
    );
}

#[test]
fn ranked_variant_hints_prefer_easier_proofs_and_respect_the_profile() {
    let puzzle = crossing_cages().compile().unwrap();
    let mut enabled = [
        VariantTechnique::CageHouseSum,
        VariantTechnique::CageCombinations,
    ];
    let full = puzzle
        .ranked_hints(&EMPTY, &NO_REMOVALS, &enabled, 10)
        .unwrap();
    assert!(full.len() >= 4);
    assert_eq!(full[0].technique, VariantTechnique::CageCombinations);
    enabled.reverse();
    assert_eq!(
        puzzle
            .ranked_hints(&EMPTY, &NO_REMOVALS, &enabled, 2)
            .unwrap(),
        full[..2]
    );
    assert_eq!(
        puzzle
            .ranked_hints(&EMPTY, &NO_REMOVALS, &enabled, 1)
            .unwrap(),
        full[..1],
    );
    let only_house_sums = puzzle
        .ranked_hints(&EMPTY, &NO_REMOVALS, &[VariantTechnique::CageHouseSum], 10)
        .unwrap();
    assert!(
        only_house_sums
            .iter()
            .all(|proof| proof.technique == VariantTechnique::CageHouseSum)
    );
    assert_eq!(only_house_sums.len(), 2);
}

#[test]
fn profile_order_controls_the_trace_and_rating_and_replay_keeps_rule_context() {
    use VariantTechnique::*;
    let start = VariantPosition::new(crossing_cages());
    let order = [CageHouseSum, NakedSingle];
    let trace = start.solve_logically(&order).unwrap();
    assert_eq!(trace.rating, start.rate(&order).unwrap());
    assert_eq!(trace.rating.status, SolveStatus::Stalled);
    assert_eq!(trace.rating.scoring_version, VARIANT_SCORING_VERSION);
    assert_eq!(trace.rating.rules, start.puzzle.rules);
    assert_eq!(trace.rating.technique_order, order);
    assert_eq!(trace.rating.counts[&CageHouseSum], 4);
    assert_eq!(trace.rating.counts[&NakedSingle], 2);
    assert_eq!(trace.rating.points, 276);
    assert_eq!(trace.end.entries[8], 2);
    assert_eq!(trace.end.entries[17], 8);
    assert_eq!(start.rate(&[]).unwrap().points, 0);

    let compiled = start.puzzle.compile().unwrap();
    let solution = parse_givens(SOLUTION).unwrap();
    let mut current = start.clone();
    for index in 0..trace.steps.len() {
        let step = trace.replay_step(index).unwrap();
        assert_eq!(step.before, current);
        let technique = step.deduction.technique;
        for action in &step.deduction.actions {
            let candidate = action.candidate();
            match action {
                HintAction::Place(_) => assert_eq!(solution[candidate.cell], candidate.digit),
                HintAction::Eliminate(_) => assert_ne!(solution[candidate.cell], candidate.digit),
            }
        }
        let proofs = compiled
            .deductions(&step.before.entries, &step.before.eliminations, technique)
            .unwrap();
        assert!(proofs.contains(step.deduction));
        current = step.after;
    }
    assert_eq!(current, trace.end);
    assert!(trace.replay_step(trace.steps.len()).is_none());

    let practice = trace.practice_position(NakedSingle).unwrap();
    assert_eq!(
        compiled
            .check_practice_move(
                &practice.entries,
                &practice.eliminations,
                NakedSingle,
                HintAction::Place(Candidate { cell: 8, digit: 2 })
            )
            .unwrap()
            .unwrap()
            .technique,
        NakedSingle
    );
    assert!(
        compiled
            .check_practice_move(
                &practice.entries,
                &practice.eliminations,
                NakedSingle,
                HintAction::Place(Candidate { cell: 8, digit: 5 })
            )
            .unwrap()
            .is_none()
    );
}

#[test]
fn each_local_rule_explains_a_candidate_that_its_relationship_excludes() {
    type Fixture = (PuzzleRule, &'static [(usize, u8)], [usize; 2]);
    let row: Vec<_> = (0..9).collect();
    let cases: Vec<Fixture> = vec![
        (
            PuzzleRule::Parity {
                cells: vec![40],
                parity: Parity::Odd,
            },
            &[],
            [40, 8],
        ),
        (
            PuzzleRule::Clone {
                groups: vec![vec![0, 40, 80]],
            },
            &[(0, 4)],
            [80, 5],
        ),
        (PuzzleRule::AntiKnight {}, &[(10, 4)], [29, 4]),
        (PuzzleRule::AntiKing {}, &[(20, 4)], [30, 4]),
        (PuzzleRule::NonConsecutive { except: vec![] }, &[(30, 4)], [31, 3]),
        (
            PuzzleRule::Inequality {
                less: 10,
                greater: 0,
            },
            &[(0, 4)],
            [10, 9],
        ),
        (
            PuzzleRule::Thermometer {
                cells: vec![12, 11, 10],
            },
            &[(12, 6)],
            [10, 7],
        ),
        (
            PuzzleRule::Palindrome {
                cells: vec![0, 40, 80],
                segments: None,
            },
            &[(0, 4)],
            [80, 5],
        ),
        (
            PuzzleRule::Whispers {
                cells: vec![0, 1],
                min_difference: 5,
            },
            &[(0, 2)],
            [1, 6],
        ),
        (
            PuzzleRule::Kropki {
                consecutive: MarkedPairs {
                    pairs: vec![[0, 1]],
                    negative: false,
                },
                ratio_two: MarkedPairs::default(),
            },
            &[(0, 4)],
            [1, 2],
        ),
        (
            PuzzleRule::Xv {
                five: MarkedPairs {
                    pairs: vec![[0, 1]],
                    negative: false,
                },
                ten: MarkedPairs::default(),
            },
            &[(0, 2)],
            [1, 4],
        ),
        (
            PuzzleRule::Arrow {
                circle: 0,
                cells: vec![10, 20],
            },
            &[(0, 7), (20, 3)],
            [10, 1],
        ),
        (
            PuzzleRule::Between {
                cells: vec![0, 10, 40, 80],
            },
            &[(0, 6), (80, 2)],
            [40, 8],
        ),
        (
            PuzzleRule::RegionSum {
                cells: vec![0, 1, 3],
                group_by_region: false,
            },
            &[(0, 2), (3, 6)],
            [1, 5],
        ),
        (
            PuzzleRule::Renban { cells: vec![0, 40, 80], segments: None },
            &[(0, 2), (40, 4)],
            [80, 6],
        ),
        (
            PuzzleRule::LittleKiller {
                cells: vec![4, 14, 24, 34, 44],
                direction: ClueDirection::SouthEast,
                sum: 20,
            },
            &[(14, 5), (24, 5), (34, 2), (44, 1)],
            [4, 9],
        ),
        (
            PuzzleRule::Sandwich {
                cells: row.clone(),
                direction: ClueDirection::East,
                sum: 0,
            },
            &[(0, 1)],
            [1, 2],
        ),
        (
            PuzzleRule::XSum {
                cells: row.clone(),
                direction: ClueDirection::East,
                sum: 1,
            },
            &[],
            [0, 2],
        ),
        (
            PuzzleRule::Skyscrapers {
                cells: row,
                direction: ClueDirection::East,
                count: 1,
            },
            &[],
            [0, 1],
        ),
    ];
    for (rule, digits, [cell, digit]) in cases {
        let technique = VariantTechnique::from_id(rule.id()).unwrap();
        let mut puzzle = VariantPuzzle::classic(EMPTY);
        puzzle.rules.push(rule);
        let compiled = puzzle.compile().unwrap();
        let mut entries = EMPTY;
        for &(cell, digit) in digits {
            entries[cell] = digit;
        }
        let action = HintAction::Eliminate(Candidate {
            cell,
            digit: digit as u8,
        });
        let proof = compiled
            .check_practice_move(&entries, &NO_REMOVALS, technique, action)
            .unwrap()
            .unwrap_or_else(|| panic!("missing proof for {}", technique.id()));
        let VariantEvidence::Constraint {
            rules,
            cells,
            domains,
        } = proof.evidence
        else {
            panic!("expected evidence with its source rule");
        };
        assert_eq!(rules, [0]);
        let target = cells.iter().position(|&source| source == cell).unwrap();
        assert_ne!(domains[target] & (1 << (digit - 1)), 0);
        let current = compiled.candidates(&entries, &NO_REMOVALS).unwrap();
        assert_eq!(current[cell] & (1 << (digit - 1)), 0);
        let mut removed = NO_REMOVALS;
        removed[cell] = 1 << (digit - 1);
        assert!(
            compiled
                .check_practice_move(&entries, &removed, technique, action)
                .unwrap()
                .is_none()
        );
    }
}

#[test]
fn overlapping_rules_produce_separate_explanations_in_profile_order() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules = vec![
        PuzzleRule::Parity {
            cells: vec![10],
            parity: Parity::Even,
        },
        PuzzleRule::Thermometer {
            cells: vec![12, 11, 10],
        },
    ];
    let mut position = VariantPosition::new(puzzle);
    position.entries[12] = 6;
    let order = [
        VariantTechnique::Thermometer,
        VariantTechnique::Parity,
        VariantTechnique::NakedSingle,
    ];
    let trace = position.solve_logically(&order).unwrap();
    assert!(
        trace.steps[0]
            .actions
            .contains(&HintAction::Eliminate(Candidate { cell: 10, digit: 7 }))
    );
    assert!(
        !trace.steps[0]
            .actions
            .contains(&HintAction::Eliminate(Candidate { cell: 10, digit: 9 }))
    );
    assert_eq!(trace.steps[1].technique, VariantTechnique::Parity);
    assert!(
        trace.steps[1]
            .actions
            .contains(&HintAction::Eliminate(Candidate { cell: 10, digit: 9 }))
    );
    assert_eq!(trace.end.entries[10], 8);
    assert_eq!(trace.end.entries[11], 7);
    assert_eq!(trace.rating.status, SolveStatus::Stalled);
}

#[test]
fn fog_uses_only_revealed_rules_givens_and_candidate_removals() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.givens[12] = 6;
    puzzle.givens[40] = 2;
    puzzle.rules = vec![
        PuzzleRule::Parity {
            cells: vec![10],
            parity: Parity::Odd,
        },
        PuzzleRule::Thermometer {
            cells: vec![12, 11, 10],
        },
        PuzzleRule::Parity {
            cells: vec![50],
            parity: Parity::Even,
        },
    ];
    let mut position = VariantPosition::new(puzzle);
    position.entries[40] = 8;
    position.eliminations[10] = 1 << 7;
    let full = position.puzzle.compile().unwrap();
    assert_eq!(
        full.analyze(&position.entries, &position.eliminations, 1),
        Ok(Analysis::Conflict)
    );

    let visibility = VariantVisibility {
        cells: vec![12],
        rules: vec![2, 1],
        ..VariantVisibility::new()
    };
    let visible = position.visible(&visibility).unwrap();
    assert_eq!(visible.puzzle.givens[12], 6);
    assert_eq!(visible.puzzle.givens[40], 0);
    assert_eq!(visible.entries[40], 8);
    assert_eq!(visible.eliminations[10], 0);
    assert_eq!(visible.puzzle.rules, position.puzzle.rules[1..]);
    let compiled = visible.puzzle.compile().unwrap();
    let hints = compiled
        .ranked_hints(
            &visible.entries,
            &visible.eliminations,
            VariantTechnique::DEFAULT_ORDER,
            10,
        )
        .unwrap();
    assert_eq!(hints.len(), 2);
    assert_eq!(hints[0].technique, VariantTechnique::Parity);
    assert_eq!(hints[1].technique, VariantTechnique::Thermometer);
    assert!(hints.iter().all(|hint| {
        !hint
            .actions
            .contains(&HintAction::Eliminate(Candidate { cell: 10, digit: 8 }))
    }));
}

#[test]
fn incomplete_marker_families_do_not_explain_missing_dots() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules = vec![
        PuzzleRule::Kropki {
            consecutive: MarkedPairs {
                pairs: vec![],
                negative: true,
            },
            ratio_two: MarkedPairs::default(),
        },
        PuzzleRule::Kropki {
            consecutive: MarkedPairs::default(),
            ratio_two: MarkedPairs {
                pairs: vec![[0, 1]],
                negative: false,
            },
        },
    ];
    let mut position = VariantPosition::new(puzzle);
    position.entries[0] = 1;
    position.entries[1] = 2;
    let visibility = VariantVisibility {
        rules: vec![0],
        ..VariantVisibility::new()
    };
    let visible = position.visible(&visibility).unwrap();
    let compiled = visible.puzzle.compile().unwrap();
    assert!(
        compiled
            .deductions(
                &visible.entries,
                &visible.eliminations,
                VariantTechnique::Kropki
            )
            .unwrap()
            .is_empty()
    );

    let mut visibility = visibility;
    visibility.complete_kropki = true;
    assert_eq!(
        position.visible(&visibility),
        Err(VariantVisibilityError::HiddenMarkers)
    );
    visibility.rules.push(1);
    let visible = position.visible(&visibility).unwrap();
    let compiled = visible.puzzle.compile().unwrap();
    let proof = compiled
        .check_practice_move(
            &visible.entries,
            &visible.eliminations,
            VariantTechnique::Kropki,
            HintAction::Eliminate(Candidate { cell: 2, digit: 3 }),
        )
        .unwrap()
        .unwrap();
    assert!(matches!(proof.evidence, VariantEvidence::Constraint { rules, .. } if rules == [0, 1]));
}

#[test]
fn two_markers_on_one_pair_record_both_rules_in_a_single_proof() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules = vec![
        PuzzleRule::Kropki {
            consecutive: MarkedPairs {
                pairs: vec![[1, 0]],
                negative: false,
            },
            ratio_two: MarkedPairs::default(),
        },
        PuzzleRule::Kropki {
            consecutive: MarkedPairs::default(),
            ratio_two: MarkedPairs {
                pairs: vec![[0, 1]],
                negative: false,
            },
        },
    ];
    let compiled = puzzle.compile().unwrap();
    let proofs = compiled
        .deductions(&EMPTY, &NO_REMOVALS, VariantTechnique::Kropki)
        .unwrap();
    assert_eq!(proofs.len(), 1);
    assert_eq!(
        proofs[0].evidence,
        VariantEvidence::Constraint {
            rules: vec![0, 1],
            cells: vec![0, 1],
            domains: vec![0x1ff; 2],
        }
    );
    let expected: Vec<_> = [0, 1]
        .into_iter()
        .flat_map(|cell| (3..=9).map(move |digit| HintAction::Eliminate(Candidate { cell, digit })))
        .collect();
    assert_eq!(proofs[0].actions, expected);
}

#[test]
fn intersection_proofs_work_across_extra_houses() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    // The marked house shares two nonadjacent cells with the first row.
    puzzle.rules.push(PuzzleRule::ExtraHouse {
        cells: vec![0, 4, 9, 18, 27, 36, 45, 54, 63],
    });
    let compiled = puzzle.compile().unwrap();
    let mut removed = NO_REMOVALS;
    for &cell in &[9, 18, 27, 36, 45, 54, 63] {
        removed[cell] |= 1 << 4;
    }
    let proof = compiled
        .check_practice_move(
            &EMPTY,
            &removed,
            VariantTechnique::LockedCandidates,
            HintAction::Eliminate(Candidate { cell: 7, digit: 5 }),
        )
        .unwrap()
        .unwrap();
    assert_eq!(
        proof.evidence,
        VariantEvidence::Intersection {
            source: VariantHouseKind::Extra(0),
            target: VariantHouseKind::Row(0),
            cells: vec![0, 4],
            digit: 5,
        }
    );
    assert_eq!(proof.actions.len(), 7);
}

#[test]
fn classic_fish_gate_only_the_detectors_that_require_standard_boxes() {
    let solution = parse_givens(SOLUTION).unwrap();
    let mut regions: Vec<Vec<usize>> = (0..9)
        .map(|region| {
            let top = region / 3 * 27 + region % 3 * 3;
            (0..9)
                .map(|offset| top + offset / 3 * 9 + offset % 3)
                .collect()
        })
        .collect();
    regions[0][7] = 29;
    regions[3][2] = 19;
    let compiled = VariantPuzzle::jigsaw(EMPTY, regions).compile().unwrap();
    let mut removed = NO_REMOVALS;
    let rank = 5;
    let rows = [0, 1];
    let columns = [0, 5];
    assert_eq!(solution[0], rank);
    assert_eq!(solution[14], rank);
    for row in rows {
        for column in 0..9 {
            if !columns.contains(&column) {
                removed[row * 9 + column] = 1 << (rank - 1);
            }
        }
    }
    let fish = VariantTechnique::Classic(Technique::XWing);
    let finned = VariantTechnique::Classic(Technique::FinnedXWing);
    assert!(compiled.supports_technique(fish));
    assert!(!compiled.supports_technique(finned));
    let proofs = compiled.deductions(&EMPTY, &removed, fish).unwrap();
    assert!(proofs.iter().any(
        |proof| proof.actions.contains(&HintAction::Eliminate(Candidate {
            cell: 18,
            digit: rank
        }))
    ));
    assert!(
        compiled
            .deductions(&EMPTY, &removed, finned)
            .unwrap()
            .is_empty()
    );
}

#[cfg(feature = "teaching")]
#[test]
fn a_uniqueness_proof_requires_every_extra_rule_to_preserve_the_swap() {
    use sudoku_app_engine::HintEvidence;
    let example = Technique::UniqueRectangle1.practice_example();
    let start = example.position().unwrap();
    let solution = sudoku_app_engine::solve(&start.values().unwrap()).unwrap();
    let technique = VariantTechnique::Classic(Technique::UniqueRectangle1);
    let mut puzzle = VariantPuzzle::classic(start.givens);
    let proof = puzzle
        .compile()
        .unwrap()
        .deductions(&start.entries, &start.eliminations, technique)
        .unwrap()
        .into_iter()
        .find(|proof| proof.actions == example.expected_actions)
        .unwrap();
    let VariantEvidence::Classic {
        proof: evidence,
        swap_cells,
    } = proof.evidence
    else {
        panic!("expected the classic proof and the swap scope");
    };
    let HintEvidence::UniqueRectangle { corners, .. } = *evidence else {
        panic!("expected a rectangle");
    };
    assert_eq!(swap_cells, corners);
    let unaffected = (0..81).find(|cell| !corners.contains(cell)).unwrap();
    let parity = |cell: usize| {
        if solution[cell].is_multiple_of(2) {
            Parity::Even
        } else {
            Parity::Odd
        }
    };
    puzzle.rules.push(PuzzleRule::Parity {
        cells: vec![unaffected],
        parity: parity(unaffected),
    });
    assert!(
        puzzle
            .compile()
            .unwrap()
            .deductions(&start.entries, &start.eliminations, technique)
            .unwrap()
            .iter()
            .any(|proof| proof.actions == example.expected_actions)
    );

    let corner = corners[0];
    puzzle.rules.push(PuzzleRule::Parity {
        cells: vec![corner],
        parity: parity(corner),
    });
    let variant = puzzle.compile().unwrap();
    assert_eq!(
        variant.analyze(&start.entries, &start.eliminations, 4096),
        Ok(Analysis::Unique)
    );
    assert!(
        variant
            .deductions(&start.entries, &start.eliminations, technique)
            .unwrap()
            .iter()
            .all(|proof| proof.actions != example.expected_actions)
    );
}

#[cfg(feature = "teaching")]
#[test]
fn variant_rectangle_chains_check_the_corners_of_the_inference_link() {
    let example = Technique::UniqueRectangleAic.practice_examples()[1];
    let start = example.position().unwrap();
    let solved = sudoku_app_engine::solve(&start.values().unwrap()).unwrap();
    let technique = VariantTechnique::Classic(Technique::UniqueRectangleAic);
    let mut puzzle = VariantPuzzle::classic(start.givens);
    let proofs = |puzzle: &VariantPuzzle| {
        puzzle
            .compile()
            .unwrap()
            .deductions(&start.entries, &start.eliminations, technique)
            .unwrap()
    };
    let uses_rectangle = |proof: &sudoku_app_engine::VariantDeduction| {
        matches!(&proof.evidence, VariantEvidence::Classic { swap_cells, .. } if swap_cells == &[43, 44, 79, 80])
            && proof.actions == example.expected_actions
    };
    assert!(proofs(&puzzle).iter().any(uses_rectangle));

    let given = start.givens.iter().position(|&digit| digit != 0).unwrap();
    let parity = if solved[given].is_multiple_of(2) {
        Parity::Even
    } else {
        Parity::Odd
    };
    puzzle.rules.push(PuzzleRule::Parity {
        cells: vec![given],
        parity,
    });
    assert!(proofs(&puzzle).iter().any(uses_rectangle));
    // Both swap digits 2 and 4 still fit in this corner. The proof's swap
    // scope makes the detector apply the variant's conservative rule check.
    puzzle.rules.push(PuzzleRule::Parity {
        cells: vec![44],
        parity: Parity::Even,
    });
    assert!(!proofs(&puzzle).iter().any(uses_rectangle));
}

#[cfg(feature = "teaching")]
#[test]
fn a_variant_unique_loop_checks_every_cell_that_can_swap() {
    use sudoku_app_engine::HintEvidence;
    let example = Technique::UniqueLoop.practice_examples()[1];
    let start = example.position().unwrap();
    let solution = sudoku_app_engine::solve(&start.values().unwrap()).unwrap();
    let technique = VariantTechnique::Classic(Technique::UniqueLoop);
    let mut puzzle = VariantPuzzle::classic(start.givens);
    let proofs = |puzzle: &VariantPuzzle| {
        puzzle
            .compile()
            .unwrap()
            .deductions(&start.entries, &start.eliminations, technique)
            .unwrap()
    };
    let proof = proofs(&puzzle)
        .into_iter()
        .find(|proof| proof.actions == example.expected_actions)
        .unwrap();
    let VariantEvidence::Classic {
        proof: evidence,
        swap_cells,
    } = proof.evidence
    else {
        panic!("expected a classic swap proof");
    };
    let HintEvidence::UniqueLoop { sides, digits, .. } = *evidence else {
        panic!("expected a Unique Loop");
    };
    assert_eq!(digits, [1, 3]);
    let mut expected: Vec<_> = sides.into_iter().flatten().collect();
    expected.sort_unstable();
    assert_eq!(swap_cells, expected);
    assert_eq!(swap_cells.len(), 12);

    let untouched = (0..81).find(|cell| !swap_cells.contains(cell)).unwrap();
    puzzle.rules.push(PuzzleRule::Parity {
        cells: vec![untouched],
        parity: if solution[untouched].is_multiple_of(2) {
            Parity::Even
        } else {
            Parity::Odd
        },
    });
    assert!(
        proofs(&puzzle)
            .iter()
            .any(|proof| proof.actions == example.expected_actions)
    );

    // This floor cell keeps both 1 and 3 under the parity rule, so it still
    // matches the classic detector. The variant swap check must inspect it.
    puzzle.rules.push(PuzzleRule::Parity {
        cells: vec![79],
        parity: Parity::Odd,
    });
    assert_eq!(
        puzzle
            .compile()
            .unwrap()
            .analyze(&start.entries, &start.eliminations, 4096),
        Ok(Analysis::Unique)
    );
    assert!(
        proofs(&puzzle)
            .iter()
            .all(|proof| proof.actions != example.expected_actions)
    );
}
