#![cfg(feature = "variants")]

use sudoku_app_engine::{
    Candidate, Diagonal, HintAction, PuzzleRule, RegionLayout, SolveStatus,
    VARIANT_SCORING_VERSION, VariantDeduction, VariantEvidence, VariantExclusionPremise,
    VariantHouseKind, VariantPosition, VariantPuzzle, VariantTechnique,
};

const EMPTY: [u8; 81] = [0; 81];
const ALL: u16 = 511;
const TECHNIQUES: [VariantTechnique; 4] = [
    VariantTechnique::NonConsecutiveLockedPair,
    VariantTechnique::NonConsecutiveLockedTriple,
    VariantTechnique::NonConsecutiveBivalue,
    VariantTechnique::NonConsecutiveTrivalue,
];

#[cfg(feature = "wasm-api")]
#[test]
fn published_coach_position_has_the_six_missing_removals_and_now_completes_without_seeding() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/nonconsecutive-locked.json"
    ))
    .unwrap();
    let position: VariantPosition = serde_json::from_value(fixture["position"].clone()).unwrap();
    let proofs: Vec<_> = TECHNIQUES
        .into_iter()
        .flat_map(|technique| deductions(&position, technique))
        .collect();
    for expected in fixture["expected"].as_array().unwrap() {
        assert!(removed(
            &proofs,
            expected["cell"].as_u64().unwrap() as usize,
            expected["digit"].as_u64().unwrap() as u8
        ));
    }
    for proof in &proofs {
        replay(&position, proof);
    }
    let start = VariantPosition::new(position.puzzle);
    let trace = start
        .solve_logically(VariantTechnique::DEFAULT_ORDER)
        .unwrap();
    assert!(matches!(trace.rating.status, SolveStatus::Solved(_)));
    assert!(
        trace
            .steps
            .iter()
            .any(|step| TECHNIQUES.contains(&step.technique))
    );
    let solution = fixture["solution"].as_str().unwrap().as_bytes();
    for (cell, &digit) in solution.iter().enumerate() {
        assert_eq!(
            trace.end.entries[cell].max(trace.end.puzzle.givens[cell]),
            digit - b'0'
        );
    }
    for (index, step) in trace
        .steps
        .iter()
        .enumerate()
        .filter(|(_, step)| TECHNIQUES.contains(&step.technique))
    {
        replay(&trace.replay_step(index).unwrap().before, step);
        for action in &step.actions {
            let candidate = action.candidate();
            assert_ne!(candidate.digit, solution[candidate.cell] - b'0');
        }
    }
}

#[cfg(feature = "teaching")]
#[test]
fn every_new_practice_proof_replays_from_its_actual_candidate_alternatives() {
    for technique in TECHNIQUES {
        for example in sudoku_app_engine::variant_practice_examples(technique).unwrap() {
            replay(&example.position, &example.deduction);
        }
    }
}

#[test]
fn other_binary_rules_do_not_create_an_undeclared_nonconsecutive_premise() {
    let mut position = position();
    position.eliminations[10] = ALL & !mask(&[4, 5]);
    position.puzzle.rules = vec![];
    for technique in TECHNIQUES {
        assert!(deductions(&position, technique).is_empty());
    }
    position.puzzle.rules.push(PuzzleRule::Kropki {
        consecutive: sudoku_app_engine::MarkedPairs {
            pairs: vec![[10, 11]],
            negative: false,
        },
        ratio_two: sudoku_app_engine::MarkedPairs::default(),
    });
    for technique in TECHNIQUES {
        assert!(deductions(&position, technique).is_empty());
    }
}

fn position() -> VariantPosition {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle
        .rules
        .push(PuzzleRule::NonConsecutive { except: vec![] });
    VariantPosition::new(puzzle)
}

fn mask(digits: &[u8]) -> u16 {
    digits.iter().fold(0, |mask, digit| mask | 1 << (digit - 1))
}

fn lock(position: &mut VariantPosition, house: &[usize], digit: u8, sites: &[usize]) {
    for &cell in house {
        if !sites.contains(&cell) {
            position.eliminations[cell] |= 1 << (digit - 1);
        }
    }
}

fn deductions(position: &VariantPosition, technique: VariantTechnique) -> Vec<VariantDeduction> {
    position
        .puzzle
        .compile()
        .unwrap()
        .deductions(&position.entries, &position.eliminations, technique)
        .unwrap()
}

fn removed(proofs: &[VariantDeduction], cell: usize, digit: u8) -> bool {
    proofs.iter().any(|proof| {
        proof
            .actions
            .contains(&HintAction::Eliminate(Candidate { cell, digit }))
    })
}

// Read the declared topology directly, without using compiled memberships.
fn house(puzzle: &VariantPuzzle, kind: VariantHouseKind) -> Vec<usize> {
    match kind {
        VariantHouseKind::Row(row) => (0..9).map(|col| 9 * row + col).collect(),
        VariantHouseKind::Column(col) => (0..9).map(|row| 9 * row + col).collect(),
        VariantHouseKind::Region(index) => match &puzzle.regions {
            RegionLayout::Boxes => (0..9)
                .map(|i| 27 * (index / 3) + 3 * (index % 3) + 9 * (i / 3) + i % 3)
                .collect(),
            RegionLayout::Jigsaw { regions } => regions[index].clone(),
        },
        VariantHouseKind::Diagonal(diagonal) => (0..9)
            .map(|i| match diagonal {
                Diagonal::Main => 10 * i,
                Diagonal::Anti => 8 + 8 * i,
            })
            .collect(),
        VariantHouseKind::Extra(index) => match &puzzle.rules[index] {
            PuzzleRule::ExtraHouse { cells } => cells.clone(),
            _ => panic!("extra-house reference must name its declared rule"),
        },
    }
}

// Replay every case with the actual rule, exceptions and declared houses.
// No exact solver or production pair-support table is used by this checker.
fn replay(position: &VariantPosition, proof: &VariantDeduction) {
    let VariantEvidence::Exclusion {
        premise,
        rules,
        houses,
    } = &proof.evidence
    else {
        panic!("missing exclusion premises")
    };
    assert!(!rules.is_empty());
    let compiled = position.puzzle.compile().unwrap();
    let mut all_houses: Vec<_> = (0..9)
        .flat_map(|i| {
            [
                VariantHouseKind::Row(i),
                VariantHouseKind::Column(i),
                VariantHouseKind::Region(i),
            ]
        })
        .collect();
    for (index, rule) in position.puzzle.rules.iter().enumerate() {
        match rule {
            PuzzleRule::ExtraHouse { .. } => all_houses.push(VariantHouseKind::Extra(index)),
            PuzzleRule::Diagonal { diagonal } => {
                all_houses.push(VariantHouseKind::Diagonal(*diagonal))
            }
            _ => {}
        }
    }
    let board: [u8; 81] =
        std::array::from_fn(|cell| position.puzzle.givens[cell].max(position.entries[cell]));
    let domain = |cell: usize| {
        let candidates: Vec<_> = (1..=9)
            .filter(|&digit| {
                board[cell] == 0
                    && position.eliminations[cell] & (1 << (digit - 1)) == 0
                    && all_houses.iter().all(|&kind| {
                        let sites = house(&position.puzzle, kind);
                        !sites.contains(&cell) || sites.iter().all(|&other| board[other] != digit)
                    })
            })
            .collect();
        candidates
    };
    let alternatives: Vec<_> = match premise {
        VariantExclusionPremise::Cell {
            cell,
            domain: recorded,
        } => {
            let digits = domain(*cell);
            assert_eq!(mask(&digits), *recorded);
            digits
                .into_iter()
                .map(|digit| Candidate { cell: *cell, digit })
                .collect()
        }
        VariantExclusionPremise::House {
            house: kind,
            digit,
            cells,
        } => {
            let sites = house(&position.puzzle, *kind);
            assert!(sites.iter().all(|&cell| board[cell] != *digit));
            let mut expected: Vec<_> = sites
                .into_iter()
                .filter(|&cell| domain(cell).contains(digit))
                .collect();
            expected.sort_unstable();
            assert_eq!(&expected, cells);
            cells
                .iter()
                .map(|&cell| Candidate {
                    cell,
                    digit: *digit,
                })
                .collect()
        }
    };
    assert!(alternatives.len() >= 2);
    for action in &proof.actions {
        let HintAction::Eliminate(target) = *action else {
            panic!("expected removal")
        };
        assert!(domain(target.cell).contains(&target.digit));
        for source in &alternatives {
            let same_cell = source.cell == target.cell && source.digit != target.digit;
            let equal = source.digit == target.digit
                && houses.iter().any(|&kind| {
                    let sites = house(&position.puzzle, kind);
                    source.cell != target.cell
                        && sites.contains(&source.cell)
                        && sites.contains(&target.cell)
                });
            let edge = rules
                .iter()
                .any(|&index| match &position.puzzle.rules[index] {
                    PuzzleRule::NonConsecutive { except } => {
                        let a = source.cell;
                        let b = target.cell;
                        let adjacent = (a / 9).abs_diff(b / 9) + (a % 9).abs_diff(b % 9) == 1;
                        adjacent
                            && source.digit.abs_diff(target.digit) == 1
                            && !except.iter().any(|&pair| pair == [a, b] || pair == [b, a])
                    }
                    _ => panic!("unexpected binary rule in the proof"),
                });
            assert!(
                same_cell || equal || edge,
                "unsupported case {source:?} against {target:?}"
            );
        }
        let accepted = compiled
            .check_practice_move(
                &position.entries,
                &position.eliminations,
                proof.technique,
                *action,
            )
            .unwrap()
            .expect("the proved action is accepted for training");
        assert_eq!(accepted.technique, proof.technique);
        assert!(accepted.actions.contains(action));
    }
}

#[test]
fn locked_pair_uses_both_adjacent_sites_and_requires_every_edge() {
    let mut position = position();
    lock(&mut position, &(9..18).collect::<Vec<_>>(), 5, &[10, 11]);
    let proofs = deductions(&position, TECHNIQUES[0]);
    for cell in [10, 11] {
        for digit in [4, 6] {
            assert!(removed(&proofs, cell, digit));
        }
    }
    for proof in &proofs {
        replay(&position, proof);
    }
    position.puzzle.rules[0] = PuzzleRule::NonConsecutive {
        except: vec![[11, 10]],
    };
    let exempt = deductions(&position, TECHNIQUES[0]);
    for cell in [10, 11] {
        for digit in [4, 6] {
            assert!(!removed(&exempt, cell, digit));
        }
    }
    position
        .puzzle
        .rules
        .push(PuzzleRule::NonConsecutive { except: vec![] });
    let restored = deductions(&position, TECHNIQUES[0]);
    assert!(removed(&restored, 10, 4));
    for proof in &restored {
        replay(&position, proof);
    }
}

#[test]
fn three_cell_lock_includes_a_middle_cell_without_the_locked_digit() {
    for sources in [&[9, 11][..], &[9, 10, 11][..]] {
        let mut position = position();
        lock(&mut position, &(9..18).collect::<Vec<_>>(), 5, sources);
        let proofs = deductions(&position, TECHNIQUES[1]);
        for digit in [4, 6] {
            assert!(removed(&proofs, 10, digit));
        }
        for proof in &proofs {
            replay(&position, proof);
        }
        position.eliminations[12] &= !mask(&[5]); // A fourth location breaks the premise.
        assert!(!removed(&deductions(&position, TECHNIQUES[1]), 10, 4));
    }
}

#[test]
fn bivalue_and_trivalue_combine_nonconsecutive_with_a_shared_house() {
    for (technique, choices, removed_digits) in [
        (TECHNIQUES[2], vec![4, 5], vec![4, 5]),
        (TECHNIQUES[3], vec![4, 5, 6], vec![5]),
    ] {
        let mut position = position();
        position.eliminations[10] = ALL & !mask(&choices);
        let proofs = deductions(&position, technique);
        for cell in [1, 9, 11, 19] {
            for &digit in &removed_digits {
                assert!(removed(&proofs, cell, digit));
            }
        }
        for proof in &proofs {
            replay(&position, proof);
        }
        position.puzzle.rules[0] = PuzzleRule::NonConsecutive {
            except: vec![[10, 11]],
        };
        assert!(!removed(
            &deductions(&position, technique),
            11,
            removed_digits[0]
        ));
        position.eliminations[10] &= !mask(&[7]);
        assert!(!removed(
            &deductions(&position, technique),
            9,
            removed_digits[0]
        ));
    }
}

#[test]
fn endpoints_do_not_wrap_and_gap_two_retains_the_existing_basic_proof() {
    for choices in [vec![1, 2], vec![8, 9], vec![1, 9], vec![4, 6]] {
        let mut position = position();
        position.eliminations[8] = ALL & !mask(&choices);
        for technique in [TECHNIQUES[2], TECHNIQUES[3]] {
            let proofs = deductions(&position, technique);
            assert!(proofs.iter().all(|proof| {
                proof
                    .actions
                    .iter()
                    .all(|action| action.candidate().cell != 9)
            }));
            for proof in &proofs {
                replay(&position, proof);
            }
        }
        if choices == [4, 6] {
            let basic = deductions(&position, VariantTechnique::NonConsecutive);
            assert!(removed(&basic, 7, 5));
            assert!(
                basic
                    .iter()
                    .all(|proof| matches!(proof.evidence, VariantEvidence::Constraint { .. }))
            );
        }
    }
}

#[test]
fn every_candidate_mask_matches_direct_neighbor_assignments_for_both_cell_techniques() {
    // These nine shifted Latin grids are valid boxed, Non-Consecutive Sudokus.
    // They witness every possible digit at each source, so the mask cases below
    // do not rely on an inconsistent global position.
    let offsets = [0, 3, 6, 4, 7, 1, 2, 5, 8];
    for shift in 0..9 {
        let grid: [u8; 81] = std::array::from_fn(|cell| ((2 * (cell % 9 + offsets[cell / 9]) + shift) % 9 + 1) as u8);
        let puzzle = position().puzzle;
        for kind in (0..9).flat_map(|i| [VariantHouseKind::Row(i), VariantHouseKind::Column(i), VariantHouseKind::Region(i)]) {
            assert_eq!(house(&puzzle, kind).into_iter().map(|cell| grid[cell]).collect::<std::collections::BTreeSet<_>>().len(), 9);
        }
        for a in 0..81 { for b in a+1..81 {
            if (a / 9usize).abs_diff(b / 9) + (a % 9usize).abs_diff(b % 9) == 1 { assert_ne!(grid[a].abs_diff(grid[b]), 1); }
        } }
    }
    let mut position = position();
    let compiled = position.puzzle.compile().unwrap();
    for cell in [0usize, 8, 9, 40, 80] { for domain in 1..=ALL {
        position.eliminations.fill(0);
        position.eliminations[cell] = ALL & !domain;
        let choices: Vec<u8> = (1..=9).filter(|digit| domain & (1 << (digit - 1)) != 0).collect();
        for technique in [TECHNIQUES[2], TECHNIQUES[3]] {
            let eligible = if technique == TECHNIQUES[2] {
                choices.len() == 2 && choices[1] == choices[0] + 1
            } else {
                (2..=3).contains(&choices.len()) && choices.last().unwrap() - choices[0] == 2
            };
            let mut expected = std::collections::BTreeSet::new();
            if eligible { for target in 0..81usize {
                if (cell / 9).abs_diff(target / 9) + (cell % 9).abs_diff(target % 9) != 1 { continue; }
                for digit in 1..=9u8 {
                    if choices.iter().all(|&source| source == digit || source.abs_diff(digit) == 1) {
                        expected.insert(HintAction::Eliminate(Candidate { cell: target, digit }));
                    }
                }
            } }
            let actual = compiled.deductions(&EMPTY, &position.eliminations, technique).unwrap()
                .into_iter().flat_map(|proof| proof.actions).collect::<std::collections::BTreeSet<_>>();
            assert_eq!(actual, expected, "{}: cell {cell}, domain {domain}", technique.id());
        }
    } }
}

#[test]
fn locks_use_declared_jigsaw_and_extra_houses() {
    let mut position = position();
    position.puzzle.regions = RegionLayout::Jigsaw {
        regions: (0..9).map(|row| (9 * row..9 * row + 9).collect()).collect(),
    };
    let cells = vec![10, 11, 18, 27, 36, 45, 54, 63, 72];
    position.puzzle.rules.push(PuzzleRule::ExtraHouse {
        cells: cells.clone(),
    });
    lock(&mut position, &cells, 5, &[10, 11]);
    let proofs = deductions(&position, TECHNIQUES[0]);
    assert!(proofs.iter().any(|proof| matches!(
        &proof.evidence,
        VariantEvidence::Exclusion {
            premise: VariantExclusionPremise::House {
                house: VariantHouseKind::Extra(1),
                ..
            },
            ..
        }
    )));
    for proof in &proofs {
        replay(&position, proof);
    }
}

#[test]
fn diagonal_locations_can_exclude_a_candidate_outside_their_house() {
    let witness = sudoku_app_engine::parse_givens(
        "135792468792468135468135792924681357681357924357924681813579246246813579579246813",
    ).unwrap();
    for (diagonal, sites, targets) in [
        (Diagonal::Main, [30, 40], [31, 39]),
        (Diagonal::Anti, [32, 40], [31, 41]),
    ] {
        let mut position = position();
        position.puzzle.rules.push(PuzzleRule::Diagonal { diagonal });
        let cells = house(&position.puzzle, VariantHouseKind::Diagonal(diagonal));
        lock(&mut position, &cells, 5, &sites);
        let completed = if diagonal == Diagonal::Main { witness } else {
            std::array::from_fn(|cell| witness[cell / 9 * 9 + 8 - cell % 9])
        };
        assert_eq!(position.puzzle.compile().unwrap().analyze(&completed, &position.eliminations, 1), Ok(sudoku_app_engine::Analysis::Unique));
        let proofs = deductions(&position, TECHNIQUES[1]);
        assert!(proofs.iter().any(|proof| matches!(&proof.evidence, VariantEvidence::Exclusion {
            premise: VariantExclusionPremise::House { house: VariantHouseKind::Diagonal(kind), .. }, ..
        } if *kind == diagonal)));
        for target in targets { for digit in [4,6] { assert!(removed(&proofs, target, digit)); } }
        for proof in &proofs { replay(&position, proof); }
    }
}

#[test]
fn enabled_techniques_order_and_points_remain_explicit() {
    let mut position = position();
    position.eliminations[10] = ALL & !mask(&[4, 5]);
    let compiled = position.puzzle.compile().unwrap();
    assert!(
        compiled
            .ranked_hints(&EMPTY, &position.eliminations, &[], 10)
            .unwrap()
            .is_empty()
    );
    let hints = compiled
        .ranked_hints(&EMPTY, &position.eliminations, &[TECHNIQUES[2]], 10)
        .unwrap();
    assert!(hints.len() > 1);
    assert!(hints.iter().all(|hint| hint.technique == TECHNIQUES[2]));
    let trace = position.solve_logically(&[TECHNIQUES[2]]).unwrap();
    assert_eq!(trace.rating.status, SolveStatus::Stalled);
    assert_eq!(trace.rating.scoring_version, VARIANT_SCORING_VERSION);
    assert_eq!(
        trace.rating.points,
        trace.steps.len() as u32 * u32::from(TECHNIQUES[2].cost())
    );
}
