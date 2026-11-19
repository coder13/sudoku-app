#![cfg(all(feature = "variants"))]

use sudoku_app_engine::{
    Analysis, ClueDirection, DEFAULT_VARIANT_SEARCH_NODES, Diagonal, KillerCage, MarkedPairs,
    Parity, PuzzleRule, VariantDefinitionError, VariantHouseKind, VariantPositionError,
    VariantPuzzle, analyze, candidates, parse_givens,
};

const CLASSIC_SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const X_SOLUTION: &str =
    "658492731974316582132875694461523978387149256295768143849251367726934815513687429";
const EMPTY: [u8; 81] = [0; 81];
const NO_REMOVALS: [u16; 81] = [0; 81];

#[test]
fn lockout_support_respects_both_ends_and_strict_outside_digits() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules.push(PuzzleRule::Lockout { cells: vec![0, 40, 80] });
    let compiled = puzzle.compile().unwrap();
    let mut entries = EMPTY;
    entries[0] = 2;
    entries[80] = 7;
    assert_eq!(compiled.candidates(&entries, &NO_REMOVALS).unwrap()[40], 0b110000001);
    for digit in 2..=7 {
        entries[40] = digit;
        assert!(compiled.candidates(&entries, &NO_REMOVALS).is_err());
    }
    entries[40] = 0;
    entries[80] = 5;
    assert!(compiled.candidates(&entries, &NO_REMOVALS).is_err());
    entries[0] = 1;
    entries[80] = 9;
    assert!(compiled.candidates(&entries, &NO_REMOVALS).is_err());

    puzzle.rules = vec![PuzzleRule::Lockout { cells: vec![0, 80] }];
    assert!(puzzle.compile().unwrap().candidates(&entries, &NO_REMOVALS).is_ok());
}

fn irregular_regions() -> Vec<Vec<usize>> {
    let mut regions: Vec<Vec<usize>> = (0..9)
        .map(|region| {
            (0..9)
                .map(|offset| 27 * (region / 3) + 3 * (region % 3) + 9 * (offset / 3) + offset % 3)
                .collect()
        })
        .collect();
    // Both cells contain 9 in CLASSIC_SOLUTION. The resulting regions stay connected.
    regions[0][7] = 29;
    regions[3][2] = 19;
    regions
}

#[test]
fn diagonal_rules_make_an_ambiguous_classic_grid_unique() {
    let solution = parse_givens(X_SOLUTION).unwrap();
    let mut givens = solution;
    for cell in [1, 6, 10, 15] {
        givens[cell] = 0;
    }
    // The two remaining digits in each affected row and column can trade places.
    assert_eq!(analyze(&givens), Analysis::Multiple);

    for (rules, expected) in [
        (
            vec![PuzzleRule::Diagonal {
                diagonal: Diagonal::Main,
            }],
            Analysis::Unique,
        ),
        (
            vec![PuzzleRule::Diagonal {
                diagonal: Diagonal::Anti,
            }],
            Analysis::Multiple,
        ),
    ] {
        let mut puzzle = VariantPuzzle::classic(givens);
        puzzle.rules = rules;
        assert_eq!(
            puzzle
                .compile()
                .unwrap()
                .analyze(&EMPTY, &NO_REMOVALS, DEFAULT_VARIANT_SEARCH_NODES),
            Ok(expected)
        );
    }
    let x = VariantPuzzle::x_sudoku(givens).compile().unwrap();
    assert_eq!(x.houses().len(), 29);
    assert_eq!(x.houses_at(40).unwrap().len(), 5);
    assert_eq!(x.intersection(27, 28).unwrap().collect::<Vec<_>>(), [40]);
    assert_eq!(
        x.analyze(&EMPTY, &NO_REMOVALS, 0),
        Ok(Analysis::SearchLimit)
    );
    assert_eq!(x.analyze(&EMPTY, &NO_REMOVALS, 100), Ok(Analysis::Unique));
    assert_eq!(x.solve(&EMPTY, &NO_REMOVALS, 100), Ok(solution));

    let mut next = EMPTY;
    next[10] = solution[1];
    assert_eq!(x.analyze(&next, &NO_REMOVALS, 100), Ok(Analysis::Conflict));
    assert_eq!(
        x.candidates(&next, &NO_REMOVALS),
        Err(VariantPositionError::Puzzle(Analysis::Conflict))
    );
}

#[test]
fn jigsaw_replaces_box_peers_and_keeps_rows_and_columns() {
    let mut placed = EMPTY;
    placed[0] = 1;
    placed[27] = 2;
    let classic = candidates(&placed).unwrap();
    let jigsaw = VariantPuzzle::jigsaw(EMPTY, irregular_regions())
        .compile()
        .unwrap();
    let peers: Vec<_> = jigsaw.peers(19).unwrap().collect();
    assert!(!peers.contains(&0));
    assert!(peers.contains(&27));
    assert_eq!(jigsaw.houses_at(19).unwrap(), [2, 10, 21]);
    let actual = jigsaw.candidates(&placed, &NO_REMOVALS).unwrap();
    assert_eq!(classic[19] & 0b11, 0b10);
    assert_eq!(actual[19] & 0b11, 0b01);
    assert!(jigsaw.houses_at(81).is_none());
}

#[test]
fn killer_support_assigns_digits_to_cells_and_excludes_repeats() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules.push(PuzzleRule::KillerCages {
        cages: vec![KillerCage {
            cells: vec![0, 12, 60],
            sum: 6,
        }],
        cover_grid: false,
    });
    let compiled = puzzle.compile().unwrap();
    assert!(
        !compiled
            .houses_at(0)
            .unwrap()
            .iter()
            .any(|id| compiled.houses()[*id].cells.contains(&60))
    );
    assert!(compiled.peers(0).unwrap().any(|peer| peer == 60));
    let mut eliminations = NO_REMOVALS;
    eliminations[0] = 0b100;
    eliminations[12] = 0b100;
    let masks = compiled.candidates(&EMPTY, &eliminations).unwrap();
    assert_eq!([masks[0], masks[12], masks[60]], [0b011, 0b011, 0b100]);

    eliminations[60] = 0b100;
    assert_eq!(
        compiled.analyze(&EMPTY, &eliminations, 100),
        Ok(Analysis::Unsolvable)
    );
    assert_eq!(
        compiled.solve(&EMPTY, &eliminations, 100),
        Err(VariantPositionError::Puzzle(Analysis::Unsolvable))
    );
    eliminations[60] = 1 << 9;
    assert_eq!(
        compiled.candidates(&EMPTY, &eliminations),
        Err(VariantPositionError::InvalidEliminations(60))
    );

    let mut repeated = EMPTY;
    repeated[0] = 1;
    repeated[60] = 1;
    assert_eq!(
        compiled.analyze(&repeated, &NO_REMOVALS, 100),
        Ok(Analysis::Conflict)
    );
    repeated[60] = 6;
    assert_eq!(
        compiled.analyze(&repeated, &NO_REMOVALS, 100),
        Ok(Analysis::Conflict)
    );
}

#[test]
fn jigsaw_and_killer_rules_combine_on_the_same_position() {
    let solution = parse_givens(CLASSIC_SOLUTION).unwrap();
    let mut givens = solution;
    for cell in [3, 4, 30, 31] {
        givens[cell] = 0;
    }
    let mut puzzle = VariantPuzzle::jigsaw(givens, irregular_regions());
    assert_eq!(
        puzzle.compile().unwrap().analyze(&EMPTY, &NO_REMOVALS, 100),
        Ok(Analysis::Multiple)
    );
    puzzle.rules.push(PuzzleRule::KillerCages {
        cages: vec![KillerCage {
            cells: vec![3, 40],
            sum: 11,
        }],
        cover_grid: false,
    });
    let compiled = puzzle.compile().unwrap();
    assert_eq!(
        compiled.candidates(&EMPTY, &NO_REMOVALS).unwrap()[3],
        1 << 5
    );
    assert_eq!(
        compiled.analyze(&EMPTY, &NO_REMOVALS, 100),
        Ok(Analysis::Unique)
    );
    assert_eq!(compiled.solve(&EMPTY, &NO_REMOVALS, 100), Ok(solution));

    use sudoku_app_engine::{Difficulty, SolveStatus, VariantPosition, VariantTechnique};
    let position = VariantPosition::new(puzzle);
    let trace = position
        .solve_logically(VariantTechnique::DEFAULT_ORDER)
        .unwrap();
    assert_eq!(trace.rating.status, SolveStatus::Solved(Difficulty::Easy));
    assert_eq!(trace.steps[0].technique, VariantTechnique::CageCombinations);
    let filled = std::array::from_fn(|cell| trace.end.entries[cell].max(givens[cell]));
    assert_eq!(filled, solution);
    assert_eq!(
        position
            .rate(&[VariantTechnique::NakedSingle])
            .unwrap()
            .status,
        SolveStatus::Stalled,
    );
}

#[test]
fn invalid_definitions_report_rule_errors_before_search() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.version = 2;
    assert!(matches!(
        puzzle.compile(),
        Err(VariantDefinitionError::UnsupportedVersion(2))
    ));

    let mut regions = irregular_regions();
    regions[1][0] = regions[0][0];
    assert!(matches!(
        VariantPuzzle::jigsaw(EMPTY, regions).compile(),
        Err(VariantDefinitionError::OverlappingRegion(1))
    ));
    let mut regions = irregular_regions();
    regions[0][0] = 80;
    assert!(matches!(
        VariantPuzzle::jigsaw(EMPTY, regions).compile(),
        Err(VariantDefinitionError::DisconnectedRegion(0))
    ));
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle
        .rules
        .push(PuzzleRule::ExtraHouse { cells: vec![81; 9] });
    assert!(matches!(
        puzzle.compile(),
        Err(VariantDefinitionError::InvalidHouse(
            VariantHouseKind::Extra(0)
        ))
    ));

    let cage = |cells, sum| KillerCage { cells, sum };
    assert!(matches!(
        VariantPuzzle::killer(EMPTY, vec![cage(vec![0], 1)]).compile(),
        Err(VariantDefinitionError::IncompleteCages)
    ));
    assert!(matches!(
        VariantPuzzle::killer(EMPTY, vec![cage(vec![0, 1], 2)]).compile(),
        Err(VariantDefinitionError::InvalidCageSum(0))
    ));
    assert!(matches!(
        VariantPuzzle::killer(EMPTY, vec![cage(vec![0, 1], 3), cage(vec![1, 2], 5)]).compile(),
        Err(VariantDefinitionError::OverlappingCage(1))
    ));
}

#[test]
fn extra_houses_constrain_candidates_and_classic_masks_agree() {
    let starter = parse_givens(
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    )
    .unwrap();
    let classic = VariantPuzzle::classic(starter).compile().unwrap();
    assert_eq!(
        classic.candidates(&EMPTY, &NO_REMOVALS).unwrap(),
        candidates(&starter).unwrap()
    );

    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules.push(PuzzleRule::ExtraHouse {
        cells: vec![10, 11, 12, 19, 20, 21, 28, 29, 30],
    });
    let windoku = puzzle.compile().unwrap();
    let mut entries = EMPTY;
    entries[10] = 4;
    assert_eq!(
        windoku.candidates(&entries, &NO_REMOVALS).unwrap()[30] & (1 << 3),
        0
    );
}

#[test]
fn seeded_variant_fill_respects_rules_and_the_node_limit() {
    let mut givens = EMPTY;
    givens[0] = 2;
    let puzzle = VariantPuzzle::x_sudoku(givens).compile().unwrap();
    let first = puzzle
        .solve_seeded(&EMPTY, &NO_REMOVALS, 10_000, 41)
        .unwrap();
    let repeated = puzzle
        .solve_seeded(&EMPTY, &NO_REMOVALS, 10_000, 41)
        .unwrap();
    let second = puzzle
        .solve_seeded(&EMPTY, &NO_REMOVALS, 10_000, 42)
        .unwrap();
    assert_eq!(first, repeated);
    assert_ne!(first, second);
    for filled in [first, second] {
        assert_eq!(filled[0], 2);
        assert_eq!(
            puzzle.analyze(&filled, &NO_REMOVALS, 1),
            Ok(Analysis::Unique)
        );
        for indices in [
            (0..9).map(|i| 10 * i).collect::<Vec<_>>(),
            (0..9).map(|i| 8 * i + 8).collect(),
        ] {
            let digits = indices
                .iter()
                .map(|&cell| filled[cell])
                .fold(0, |mask, digit| mask | (1 << (digit - 1)));
            assert_eq!(digits, 0x1ff);
        }
    }
    assert_eq!(
        puzzle.solve_seeded(&EMPTY, &NO_REMOVALS, 0, 41),
        Err(VariantPositionError::Puzzle(Analysis::SearchLimit)),
    );
}

#[test]
fn windoku_and_disjoint_houses_remove_digits_across_classic_regions() {
    let mut entries = EMPTY;
    entries[10] = 4;
    let classic = VariantPuzzle::classic(EMPTY).compile().unwrap();
    let masks = classic.candidates(&entries, &NO_REMOVALS).unwrap();
    assert_ne!(masks[30] & (1 << 3), 0);
    assert_ne!(masks[40] & (1 << 3), 0);

    for (puzzle, extra_houses, peer) in [
        (VariantPuzzle::windoku(EMPTY), 4, 30),
        (VariantPuzzle::disjoint_groups(EMPTY), 9, 40),
    ] {
        let compiled = puzzle.compile().unwrap();
        assert_eq!(compiled.houses().len(), 27 + extra_houses);
        assert_eq!(
            compiled.candidates(&entries, &NO_REMOVALS).unwrap()[peer] & (1 << 3),
            0
        );
        entries[peer] = 4;
        assert_eq!(
            compiled.analyze(&entries, &NO_REMOVALS, 1),
            Ok(Analysis::Conflict)
        );
        entries[peer] = 0;
    }
}

#[test]
fn parity_and_clone_propagate_across_overlapping_rules() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules = vec![
        PuzzleRule::Parity {
            cells: vec![80],
            parity: Parity::Even,
        },
        PuzzleRule::Clone {
            groups: vec![vec![0, 40, 80]],
        },
    ];
    let compiled = puzzle.compile().unwrap();
    let mut removed = NO_REMOVALS;
    removed[0] = 1 << 7;
    let masks = compiled.candidates(&EMPTY, &removed).unwrap();
    let expected = (1 << 1) | (1 << 3) | (1 << 5);
    assert_eq!([masks[0], masks[40], masks[80]], [expected; 3]);

    let mut entries = EMPTY;
    entries[80] = 5;
    assert_eq!(
        compiled.analyze(&entries, &removed, 1),
        Ok(Analysis::Conflict)
    );
    entries[80] = 4;
    entries[40] = 6;
    assert_eq!(
        compiled.analyze(&entries, &removed, 1),
        Ok(Analysis::Conflict)
    );

    puzzle.rules.push(PuzzleRule::Inequality {
        less: 40,
        greater: 0,
    });
    assert_eq!(
        puzzle.compile().unwrap().analyze(&EMPTY, &removed, 1),
        Ok(Analysis::Unsolvable)
    );
}

#[test]
fn chess_and_non_consecutive_rules_use_their_own_geometry() {
    for (rule, origin, peer) in [
        (PuzzleRule::AntiKnight {}, 10, 29),
        (PuzzleRule::AntiKing {}, 20, 30),
    ] {
        let mut puzzle = VariantPuzzle::classic(EMPTY);
        puzzle.rules.push(rule);
        let compiled = puzzle.compile().unwrap();
        assert!(compiled.peers(origin).unwrap().any(|cell| cell == peer));
        let mut entries = EMPTY;
        entries[origin] = 4;
        entries[peer] = 4;
        assert_eq!(
            compiled.analyze(&entries, &NO_REMOVALS, 1),
            Ok(Analysis::Conflict)
        );
    }

    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules.push(PuzzleRule::NonConsecutive { except: vec![] });
    let compiled = puzzle.compile().unwrap();
    let mut entries = EMPTY;
    entries[30] = 4;
    let masks = compiled.candidates(&entries, &NO_REMOVALS).unwrap();
    let consecutive = (1 << 2) | (1 << 4);
    assert_eq!(masks[31] & consecutive, 0);
    assert_eq!(masks[20] & consecutive, consecutive);
    entries[31] = 5;
    assert_eq!(
        compiled.analyze(&entries, &NO_REMOVALS, 1),
        Ok(Analysis::Conflict)
    );
}

#[test]
fn miracle_solves_the_original_two_given_grid() {
    // Mitchell Lee's givens, with the solution published by MATH+.
    let mut givens = EMPTY;
    givens[38] = 1;
    givens[51] = 2;
    let solution = parse_givens(concat!(
        "483726159",
        "726159483",
        "159483726",
        "837261594",
        "261594837",
        "594837261",
        "372615948",
        "615948372",
        "948372615",
    ))
    .unwrap();
    let compiled = VariantPuzzle::miracle(givens).compile().unwrap();
    assert_eq!(
        compiled.analyze(&EMPTY, &NO_REMOVALS, DEFAULT_VARIANT_SEARCH_NODES),
        Ok(Analysis::Unique)
    );
    assert_eq!(
        compiled.solve(&EMPTY, &NO_REMOVALS, DEFAULT_VARIANT_SEARCH_NODES),
        Ok(solution)
    );
}

#[test]
fn marked_pairs_enforce_only_the_declared_negative_rules() {
    let cases = [
        (
            PuzzleRule::Kropki {
                consecutive: MarkedPairs {
                    pairs: vec![],
                    negative: true,
                },
                ratio_two: MarkedPairs {
                    pairs: vec![[1, 0]],
                    negative: false,
                },
            },
            [1, 2],
            [1, 2],
            [2, 4],
        ),
        (
            PuzzleRule::Xv {
                five: MarkedPairs {
                    pairs: vec![],
                    negative: true,
                },
                ten: MarkedPairs {
                    pairs: vec![[0, 1]],
                    negative: false,
                },
            },
            [4, 6],
            [2, 3],
            [4, 6],
        ),
    ];
    for (rule, marked, forbidden, allowed) in cases {
        let mut puzzle = VariantPuzzle::classic(EMPTY);
        puzzle.rules.push(rule);
        let compiled = puzzle.compile().unwrap();
        let mut entries = EMPTY;
        entries[..2].copy_from_slice(&marked);
        assert!(compiled.candidates(&entries, &NO_REMOVALS).is_ok());
        entries[39..41].copy_from_slice(&allowed);
        assert!(compiled.candidates(&entries, &NO_REMOVALS).is_ok());
        entries[39..41].copy_from_slice(&forbidden);
        assert_eq!(
            compiled.analyze(&entries, &NO_REMOVALS, 1),
            Ok(Analysis::Conflict)
        );
        entries = EMPTY;
        entries[..2].copy_from_slice(&[7, 9]);
        assert_eq!(
            compiled.analyze(&entries, &NO_REMOVALS, 1),
            Ok(Analysis::Conflict)
        );
    }
}

#[test]
fn ordered_pair_lines_apply_in_path_order_to_mixed_rules() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules = vec![
        PuzzleRule::Thermometer {
            cells: vec![12, 11, 10],
        },
        PuzzleRule::Palindrome {
            cells: vec![10, 40, 80],
            segments: None,
        },
        PuzzleRule::Whispers {
            cells: vec![80, 60],
            min_difference: 5,
        },
    ];
    let compiled = puzzle.compile().unwrap();
    let mut entries = EMPTY;
    entries[12] = 6;
    let masks = compiled.candidates(&entries, &NO_REMOVALS).unwrap();
    assert_eq!(masks[11], (1 << 6) | (1 << 7));
    assert_eq!([masks[10], masks[80]], [(1 << 7) | (1 << 8); 2]);
    assert_eq!(masks[60], 0b1111);

    for rule in [
        PuzzleRule::Thermometer {
            cells: vec![0, 1, 0],
        },
        PuzzleRule::Palindrome {
            cells: vec![0, 81],
            segments: None,
        },
        PuzzleRule::Whispers {
            cells: vec![0, 1],
            min_difference: 9,
        },
        PuzzleRule::Kropki {
            consecutive: MarkedPairs {
                pairs: vec![[8, 9]],
                negative: false,
            },
            ratio_two: MarkedPairs::default(),
        },
    ] {
        puzzle.rules.push(rule);
        assert!(matches!(
            puzzle.compile(),
            Err(VariantDefinitionError::InvalidRule(3))
        ));
        puzzle.rules.pop();
    }
}

#[cfg(feature = "wasm-api")]
#[test]
fn structured_positions_round_trip_with_rules_entries_and_removals() {
    let mut position =
        sudoku_app_engine::VariantPosition::new(VariantPuzzle::jigsaw(EMPTY, irregular_regions()));
    position.puzzle.rules.push(PuzzleRule::Diagonal {
        diagonal: Diagonal::Anti,
    });
    position.puzzle.rules.push(PuzzleRule::KillerCages {
        cages: vec![KillerCage {
            cells: vec![3, 40],
            sum: 11,
        }],
        cover_grid: false,
    });
    position.entries[40] = 5;
    position.eliminations[3] = 1;
    let encoded = serde_json::to_value(&position).unwrap();
    assert_eq!(encoded["puzzle"]["regions"]["type"], "jigsaw");
    assert_eq!(encoded["puzzle"]["rules"][0]["type"], "diagonal");
    assert_eq!(encoded["puzzle"]["rules"][1]["type"], "killer-cages");
    assert_eq!(encoded["puzzle"]["rules"][1]["coverGrid"], false);
    assert_eq!(
        serde_json::from_value::<sudoku_app_engine::VariantPosition>(encoded.clone()).unwrap(),
        position
    );
    let mut unknown = encoded;
    unknown["puzzle"]["rules"][0]["type"] = serde_json::json!("unknown-rule");
    assert!(serde_json::from_value::<sudoku_app_engine::VariantPosition>(unknown).is_err());
}

#[test]
fn arrow_renban_and_between_infer_cell_specific_candidates() {
    let mut arrow = VariantPuzzle::classic(EMPTY);
    arrow.rules = vec![
        PuzzleRule::Arrow {
            circle: 0,
            cells: vec![10, 20],
        },
        PuzzleRule::Parity {
            cells: vec![10],
            parity: Parity::Even,
        },
    ];
    let arrow = arrow.compile().unwrap();
    let mut entries = EMPTY;
    entries[0] = 7;
    entries[20] = 3;
    assert_eq!(
        arrow.candidates(&entries, &NO_REMOVALS).unwrap()[10],
        1 << 3
    );
    entries[10] = 2;
    assert_eq!(
        arrow.analyze(&entries, &NO_REMOVALS, 1),
        Ok(Analysis::Conflict)
    );

    let mut renban = VariantPuzzle::classic(EMPTY);
    renban.rules.push(PuzzleRule::Renban { cells: vec![0, 40, 80], segments: None });
    let renban = renban.compile().unwrap();
    let mut entries = EMPTY;
    entries[0] = 2;
    entries[40] = 4;
    assert_eq!(
        renban.candidates(&entries, &NO_REMOVALS).unwrap()[80],
        1 << 2
    );
    entries[80] = 2; // The line makes these otherwise unrelated cells peers.
    assert_eq!(
        renban.analyze(&entries, &NO_REMOVALS, 1),
        Ok(Analysis::Conflict)
    );

    let mut between = VariantPuzzle::classic(EMPTY);
    between.rules.push(PuzzleRule::Between {
        cells: vec![0, 10, 40, 80],
    });
    let between = between.compile().unwrap();
    let mut entries = EMPTY;
    entries[0] = 6;
    entries[80] = 2;
    let masks = between.candidates(&entries, &NO_REMOVALS).unwrap();
    assert_eq!([masks[10], masks[40]], [0b11100; 2]);
    entries[40] = 7;
    assert_eq!(
        between.analyze(&entries, &NO_REMOVALS, 1),
        Ok(Analysis::Conflict)
    );
}

#[test]
fn region_sum_uses_replacement_borders_and_explicit_reentry_policy() {
    let cells = vec![18, 19, 29];
    let mut puzzle = VariantPuzzle::jigsaw(EMPTY, irregular_regions());
    puzzle.rules.push(PuzzleRule::RegionSum {
        cells: cells.clone(),
        group_by_region: true,
        segments: None,
    });
    let mut entries = EMPTY;
    entries[18] = 2;
    entries[19] = 5;
    let compiled = puzzle.compile().unwrap();
    assert_eq!(
        compiled.candidates(&entries, &NO_REMOVALS).unwrap()[29],
        1 << 2
    );
    entries[29] = 3;
    assert!(compiled.candidates(&entries, &NO_REMOVALS).is_ok());

    let mut boxes = VariantPuzzle::classic(EMPTY);
    boxes.rules.clone_from(&puzzle.rules);
    assert_eq!(
        boxes.compile().unwrap().analyze(&entries, &NO_REMOVALS, 1),
        Ok(Analysis::Conflict)
    );
    puzzle.rules[0] = PuzzleRule::RegionSum {
        cells,
        group_by_region: false,
        segments: None,
    };
    assert_eq!(
        puzzle.compile().unwrap().analyze(&entries, &NO_REMOVALS, 1),
        Ok(Analysis::Conflict)
    );
}

#[test]
fn region_sum_drawing_paths_preserve_closures_without_changing_numeric_support() {
    let mut puzzle = VariantPuzzle::classic(EMPTY);
    puzzle.rules.push(PuzzleRule::RegionSum {
        cells: vec![0, 1, 3],
        group_by_region: false,
        segments: None,
    });
    let expected = puzzle
        .compile()
        .unwrap()
        .candidates(&EMPTY, &NO_REMOVALS)
        .unwrap();
    puzzle.rules[0] = PuzzleRule::RegionSum {
        cells: vec![0, 1, 3],
        group_by_region: false,
        segments: Some(vec![vec![0, 1], vec![1, 3, 0]]),
    };
    assert_eq!(
        puzzle
            .compile()
            .unwrap()
            .candidates(&EMPTY, &NO_REMOVALS)
            .unwrap(),
        expected
    );
    for segments in [
        vec![],
        vec![vec![]],
        vec![vec![0, 1]],
        vec![vec![0, 1, 4]],
        vec![vec![0, 1, 3, 81]],
    ] {
        puzzle.rules[0] = PuzzleRule::RegionSum {
            cells: vec![0, 1, 3],
            group_by_region: false,
            segments: Some(segments),
        };
        assert!(puzzle.compile().is_err());
    }
}

#[test]
fn region_sum_closed_geometry_has_one_canonical_key_in_every_grid_orientation() {
    // Literal coordinates for the same four-cell loop in all eight orientations.
    let orientations = [
        [34, 33, 24, 25], [66, 57, 56, 65],
        [52, 51, 60, 61], [12, 21, 20, 11],
        [28, 29, 20, 19], [68, 59, 60, 69],
        [46, 47, 56, 55], [14, 23, 24, 15],
    ];
    let mut expected = None;
    for cells in orientations {
        let mut puzzle = VariantPuzzle::classic(EMPTY);
        puzzle.rules.push(PuzzleRule::RegionSum {
            cells: cells.to_vec(),
            group_by_region: true,
            segments: Some(vec![vec![cells[3], cells[0], cells[1], cells[2], cells[3]]]),
        });
        let canonical = sudoku_app_engine::canonical_variant(&puzzle).unwrap();
        canonical.compile().unwrap();
        if let Some(expected) = &expected {
            assert_eq!(&canonical, expected);
        } else {
            expected = Some(canonical);
        }
    }
}

#[test]
fn little_killer_accepts_repeated_digits_on_a_legal_diagonal() {
    let solution = parse_givens(CLASSIC_SOLUTION).unwrap();
    let cells = vec![1, 11, 21, 31, 41, 51, 61, 71];
    assert_eq!(solution[1], solution[21]);
    let mut givens = solution;
    givens[21] = 0;
    let mut puzzle = VariantPuzzle::classic(givens);
    puzzle.rules.push(PuzzleRule::LittleKiller {
        cells: cells.clone(),
        direction: ClueDirection::SouthEast,
        sum: 38,
    });
    let compiled = puzzle.compile().unwrap();
    assert_eq!(compiled.solve(&EMPTY, &NO_REMOVALS, 2), Ok(solution));
    puzzle.rules[0] = PuzzleRule::LittleKiller {
        cells,
        direction: ClueDirection::SouthEast,
        sum: 37,
    };
    assert_eq!(
        puzzle.compile().unwrap().analyze(&EMPTY, &NO_REMOVALS, 2),
        Ok(Analysis::Unsolvable)
    );
}

#[test]
fn directional_outside_clue_support_matches_independent_row_permutations() {
    fn visit_permutations(row: &mut [u8], index: usize, visit: &mut impl FnMut(&[u8])) {
        if index == row.len() {
            visit(row);
        } else {
            for i in index..row.len() {
                row.swap(index, i);
                visit_permutations(row, index + 1, visit);
                row.swap(index, i);
            }
        }
    }

    fn sandwich(row: &[u8]) -> u16 {
        let first = row
            .iter()
            .position(|&digit| digit == 1 || digit == 9)
            .unwrap();
        let last = row
            .iter()
            .rposition(|&digit| digit == 1 || digit == 9)
            .unwrap();
        row[first + 1..last]
            .iter()
            .map(|&digit| u16::from(digit))
            .sum()
    }
    fn x_sum(row: &[u8]) -> u16 {
        row[..usize::from(row[0])]
            .iter()
            .map(|&digit| u16::from(digit))
            .sum()
    }
    fn visible(row: &[u8]) -> u16 {
        (0..row.len())
            .filter(|&i| row[..i].iter().all(|&digit| digit < row[i]))
            .count() as u16
    }

    let cells: Vec<_> = (0..9).rev().collect();
    let direction = ClueDirection::West;
    type ClueValue = fn(&[u8]) -> u16;
    let cases: [(PuzzleRule, ClueValue, u16); 4] = [
        (
            PuzzleRule::Sandwich {
                cells: cells.clone(),
                direction,
                sum: 6,
            },
            sandwich,
            6,
        ),
        (
            PuzzleRule::Sandwich {
                cells: cells.clone(),
                direction,
                sum: 0,
            },
            sandwich,
            0,
        ),
        (
            PuzzleRule::XSum {
                cells: cells.clone(),
                direction,
                sum: 21,
            },
            x_sum,
            21,
        ),
        (
            PuzzleRule::Skyscrapers {
                cells: cells.clone(),
                direction,
                count: 2,
            },
            visible,
            2,
        ),
    ];
    let mut entries = EMPTY;
    entries[7] = 2;
    entries[5] = 6;
    entries[1] = 5;
    let permutations = &mut [1, 3, 4, 7, 8, 9];
    for (rule, value, target) in cases {
        let mut puzzle = VariantPuzzle::classic(EMPTY);
        puzzle.rules.push(rule);
        let compiled = puzzle.compile().unwrap();
        let masks = compiled.candidates(&entries, &NO_REMOVALS).unwrap();
        let mut expected = [0; 9];
        visit_permutations(permutations, 0, &mut |open| {
            let mut digits = open.iter().copied();
            let row: Vec<_> = cells
                .iter()
                .map(|&cell| match entries[cell] {
                    0 => digits.next().unwrap(),
                    digit => digit,
                })
                .collect();
            if value(&row) == target {
                for (&cell, digit) in cells.iter().zip(row) {
                    if entries[cell] == 0 {
                        expected[cell] |= 1 << (digit - 1);
                    }
                }
            }
        });
        assert_ne!(expected, [0; 9]);
        assert_eq!(masks[..9], expected);
    }
}

#[test]
fn line_and_outside_clue_definitions_require_valid_geometry_and_values() {
    for rule in [
        PuzzleRule::Arrow {
            circle: 0,
            cells: vec![1, 0],
        },
        PuzzleRule::Renban { cells: vec![], segments: None },
        PuzzleRule::Between { cells: vec![0, 1] },
        PuzzleRule::RegionSum {
            cells: vec![0, 1, 2],
            group_by_region: false,
            segments: None,
        },
        PuzzleRule::LittleKiller {
            cells: vec![0, 10, 20],
            direction: ClueDirection::SouthEast,
            sum: 7,
        },
        PuzzleRule::Sandwich {
            cells: (0..9).collect(),
            direction: ClueDirection::West,
            sum: 6,
        },
        PuzzleRule::XSum {
            cells: (0..9).collect(),
            direction: ClueDirection::East,
            sum: 46,
        },
        PuzzleRule::Skyscrapers {
            cells: (0..9).collect(),
            direction: ClueDirection::East,
            count: 0,
        },
    ] {
        let mut puzzle = VariantPuzzle::classic(EMPTY);
        puzzle.rules.push(rule);
        assert!(matches!(
            puzzle.compile(),
            Err(VariantDefinitionError::InvalidRule(0))
        ));
    }
}
