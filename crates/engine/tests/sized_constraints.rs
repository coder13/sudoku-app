#![cfg(feature = "variants")]

use sudoku_app_engine::{
    Analysis, ClueDirection, GridSpec, SizedConstraint as Rule, SizedConstraintGrid, SizedDiagonal,
    SizedParity,
};

const SIX: GridSpec = GridSpec {
    size: 6,
    box_rows: 2,
    box_columns: 3,
};

#[test]
fn diagonal_parity_and_thermometers_all_matter_to_the_solution() {
    let digits: Vec<u8> = b"000000000000000000000000000030000400"
        .iter()
        .map(|c| c - b'0')
        .collect();
    let answer: Vec<u8> = b"413652625314234561156243542136361425"
        .iter()
        .map(|c| c - b'0')
        .collect();
    let rules = [
        Rule::Diagonal(SizedDiagonal::Anti),
        Rule::Parity {
            cells: vec![24, 17],
            parity: SizedParity::Odd,
        },
        Rule::Thermometer {
            cells: vec![1, 7, 13, 14],
        },
        Rule::Thermometer {
            cells: vec![32, 26, 20],
        },
    ];
    let grid = SizedConstraintGrid::new(SIX, &rules).unwrap();
    assert_eq!(grid.analyze(&digits, 100_000), Analysis::Unique);
    assert_eq!(grid.solve(&digits, 100_000).unwrap(), answer);
    for retained in [&rules[1..], &rules[..2]] {
        let subset = SizedConstraintGrid::new(SIX, retained).unwrap();
        assert_eq!(subset.analyze(&digits, 100_000), Analysis::Multiple);
    }
    let no_parity = [rules[0].clone(), rules[2].clone(), rules[3].clone()];
    assert_eq!(
        SizedConstraintGrid::new(SIX, &no_parity)
            .unwrap()
            .analyze(&digits, 100_000),
        Analysis::Multiple
    );
    assert_eq!(grid.analyze(&digits, 1), Analysis::SearchLimit);
    for (cell, mask) in grid
        .candidates(&digits)
        .unwrap()
        .unwrap()
        .iter()
        .enumerate()
    {
        if digits[cell] == 0 {
            assert_ne!(mask & (1 << (answer[cell] - 1)), 0);
        }
    }
}

#[test]
fn clone_groups_link_corresponding_digits_and_validate_their_cells() {
    let rules = [Rule::Clone {
        groups: vec![vec![0, 9], vec![9, 17], vec![1, 10]],
    }];
    let grid = SizedConstraintGrid::new(SIX, &rules).unwrap();
    let mut digits = [0; 36];
    digits[0] = 1;
    let candidates = grid.candidates(&digits).unwrap().unwrap();
    assert_eq!(candidates[9], 1);
    assert_eq!(candidates[17], 1);

    digits[9] = 2;
    assert_eq!(grid.analyze(&digits, 10_000), Analysis::Conflict);
    assert_eq!(grid.candidates(&digits), Ok(None));

    for groups in [vec![], vec![vec![0]], vec![vec![0, 0]], vec![vec![0, 36]]] {
        assert!(SizedConstraintGrid::new(SIX, &[Rule::Clone { groups }]).is_none());
    }
    let incompatible = SizedConstraintGrid::new(
        SIX,
        &[Rule::Clone {
            groups: vec![vec![0, 1]],
        }],
    )
    .unwrap();
    assert_eq!(incompatible.analyze(&[0; 36], 10_000), Analysis::Unsolvable);
}

#[test]
fn published_little_killer_between_gjbz_proves_unique_with_a_small_budget() {
    // https://sudoku.coach/en/s/GJBz
    let rules = [
        Rule::LittleKiller {
            direction: ClueDirection::SouthWest,
            cells: vec![17, 22, 27, 32],
            sum: 8,
        },
        Rule::LittleKiller {
            direction: ClueDirection::SouthWest,
            cells: vec![29, 34],
            sum: 10,
        },
        Rule::LittleKiller {
            direction: ClueDirection::NorthEast,
            cells: vec![18, 13, 8, 3],
            sum: 11,
        },
        Rule::Between {
            cells: vec![20, 15, 16, 10, 4],
        },
        Rule::Between {
            cells: vec![0, 6, 7, 14],
        },
    ];
    let grid = SizedConstraintGrid::new(SIX, &rules).unwrap();
    let expected = b"164523532641216435345216623154451362".map(|digit| digit - b'0');
    assert_eq!(grid.analyze(&[0; 36], 1_000), Analysis::Unique);
    assert_eq!(
        grid.solve_unique(&[0; 36], 1_000).as_deref(),
        Ok(expected.as_slice())
    );
}

#[test]
fn quadki_corner_dots_constrain_both_diagonals_and_explain_pair_hints() {
    let dots = Rule::CornerKropki {
        consecutive: vec![28, 13],
        ratio_two: vec![1, 8, 15, 20],
    };
    let expected = b"164523523164352641416235641352235416".map(|digit| digit - b'0');
    let puzzle = SizedConstraintGrid::new(SIX, &[dots]).unwrap();
    assert_eq!(
        puzzle.solve_unique(&[0; 36], 1_000_000).as_deref(),
        Ok(expected.as_slice())
    );

    let mut placed = [0; 36];
    placed[1] = 6;
    let candidates = puzzle.candidates(&placed).unwrap().unwrap();
    assert_eq!(candidates[8], 1 << (3 - 1));
    assert!(
        puzzle
            .hints(&placed, &[0; 36], 36)
            .unwrap()
            .choices
            .iter()
            .any(|step| matches!(step,
                sudoku_app_engine::SizedConstraintStep::Kropki { pair, .. } if pair.cells == [1, 8]
            ))
    );

    for corner in [5, 35, 36] {
        assert!(
            SizedConstraintGrid::new(
                SIX,
                &[Rule::CornerKropki {
                    consecutive: vec![corner],
                    ratio_two: vec![],
                }]
            )
            .is_none()
        );
    }
}

#[test]
fn shared_thermometer_cells_propagate_parity_to_the_tip() {
    let grid = SizedConstraintGrid::new(
        SIX,
        &[
            Rule::Thermometer {
                cells: vec![2, 8, 14],
            },
            Rule::Thermometer {
                cells: vec![0, 1, 2],
            },
            Rule::Parity {
                cells: vec![2],
                parity: SizedParity::Even,
            },
        ],
    )
    .unwrap();
    let candidates = grid.candidates(&[0; 36]).unwrap().unwrap();
    assert_eq!(candidates[2], 1 << 3);
    assert_eq!(candidates[8], 1 << 4);
    assert_eq!(candidates[14], 1 << 5);

    let mut placed = [0; 36];
    placed[2] = 3;
    assert_eq!(grid.analyze(&placed, 100_000), Analysis::Conflict);
    assert_eq!(grid.candidates(&placed), Ok(None));
    assert!(SizedConstraintGrid::new(SIX, &[Rule::Thermometer { cells: vec![0, 0] }]).is_none());
}

#[test]
fn exact_search_proves_the_sparse_jigsaw_thermometer_within_a_small_node_budget() {
    let labels = b"0000111020011122233312223434555343456664445556666";
    let regions: Vec<Vec<usize>> = (b'0'..b'7')
        .map(|label| {
            labels
                .iter()
                .enumerate()
                .filter_map(|(cell, &region)| (label == region).then_some(cell))
                .collect()
        })
        .collect();
    let layout = sudoku_app_engine::SizedGrid::with_regions(7, &regions).unwrap();
    let rules = [
        vec![8, 16, 24],
        vec![14, 22, 30],
        vec![20, 26, 33],
        vec![41, 48, 47],
        vec![6, 12],
        vec![42, 43],
    ]
    .map(|cells| Rule::Thermometer { cells });
    let grid = SizedConstraintGrid::with_layout(layout, &rules).unwrap();
    let digits = [0; 49];
    assert_eq!(grid.analyze(&digits, 1), Analysis::SearchLimit);
    assert_eq!(grid.analyze(&digits, 15_000), Analysis::Unique);
    let answer: Vec<u8> = b"7135624632415747625132517346127346534562715641732"
        .iter()
        .map(|c| c - b'0')
        .collect();
    assert_eq!(grid.solve(&digits, 15_000), Some(answer));
}

#[test]
fn six_by_six_entropic_runaround_preserves_all_rules_and_solution() {
    use sudoku_app_engine::SizedGrid;

    let labels = [
        1, 1, 1, 1, 2, 2, 1, 5, 5, 1, 5, 2, 4, 4, 5, 5, 5, 2, 4, 6, 6, 6, 2, 2, 4, 6, 3, 6, 6, 3,
        4, 4, 3, 3, 3, 3,
    ];
    let regions: Vec<Vec<usize>> = (1..=6)
        .map(|label| {
            labels
                .iter()
                .enumerate()
                .filter_map(|(cell, &region)| (region == label).then_some(cell))
                .collect()
        })
        .collect();
    let layout = SizedGrid::with_regions(6, &regions).unwrap();
    let rules = [
        Rule::Whispers {
            cells: vec![4, 5, 11, 16, 21, 26, 31, 30, 24, 19, 14, 9, 4],
            min_difference: 3,
        },
        Rule::Whispers {
            cells: vec![22, 15, 8, 1, 0, 6, 13, 20, 27, 34, 35, 29, 22],
            min_difference: 3,
        },
        Rule::Xv {
            five: sudoku_app_engine::MarkedPairs {
                pairs: vec![[4, 10]],
                negative: false,
            },
            ten: sudoku_app_engine::MarkedPairs::default(),
        },
        Rule::Modular {
            cells: vec![21, 22, 23],
        },
        Rule::Modular {
            cells: vec![20, 26, 32],
        },
        Rule::Modular {
            cells: vec![8, 7, 6],
        },
        Rule::Modular {
            cells: vec![11, 10, 4],
        },
    ];
    let puzzle = SizedConstraintGrid::with_layout(layout, &rules).unwrap();
    let solution: Vec<u8> = b"614325246531462153351264135642523416"
        .iter()
        .map(|digit| digit - b'0')
        .collect();
    assert_eq!(puzzle.analyze(&solution, 100_000), Analysis::Unique);
    assert_eq!(
        puzzle.solve(&[0; 36], 1_000_000).as_deref(),
        Some(solution.as_slice())
    );
    assert_eq!(puzzle.analyze(&[0; 36], 1_000_000), Analysis::Unique);
}

#[test]
fn the_published_boxless_killer_uses_only_rows_columns_and_the_authored_cages() {
    use sudoku_app_engine::{KillerCage, SizedGrid};
    let digits = [0; 49];
    let expected = b"3542671762314513754265214763415623764375122761354".map(|digit| digit - b'0');
    let layout = SizedGrid::without_regions(7).unwrap();
    let mut repeated = digits;
    repeated[0] = 1;
    repeated[8] = 1;
    assert!(layout.candidates(&repeated).is_some());
    repeated[1] = 1;
    assert!(layout.candidates(&repeated).is_none());
    assert_eq!(layout.analyze(&digits, 100_000), Analysis::Multiple);

    let authored: &[(u16, &[usize])] = &[
        (26, &[0, 1, 2, 7, 8, 14]),
        (8, &[3, 4]),
        (13, &[5, 6, 13]),
        (5, &[9, 10]),
        (5, &[11, 12]),
        (5, &[15, 22]),
        (17, &[16, 17, 23, 24]),
        (11, &[18, 25]),
        (8, &[19, 20]),
        (10, &[27, 34]),
        (24, &[26, 32, 33, 38, 39, 40]),
        (9, &[21, 28]),
        (15, &[35, 42, 43]),
        (5, &[29, 36]),
        (11, &[30, 31]),
        (9, &[37, 44]),
        (4, &[45, 46]),
        (11, &[41, 47, 48]),
    ];
    let cages = authored
        .iter()
        .map(|(sum, cells)| KillerCage {
            cells: cells.to_vec(),
            sum: *sum,
        })
        .collect();
    let puzzle = SizedConstraintGrid::with_layout(
        layout,
        &[Rule::KillerCages {
            cages,
            cover_grid: true,
        }],
    )
    .unwrap();
    assert_eq!(puzzle.analyze(&digits, 100_000), Analysis::Unique);
    assert_eq!(
        puzzle.solve(&digits, 100_000).as_deref(),
        Some(expected.as_slice())
    );
    assert!(
        puzzle
            .candidates(&digits)
            .unwrap()
            .unwrap()
            .iter()
            .all(|&mask| mask != 0)
    );
    assert_eq!(
        puzzle
            .trace(digits.to_vec(), vec![0; 49], false)
            .unwrap()
            .last()
            .unwrap()
            .digits,
        expected
    );
}

#[test]
fn boxless_cages_and_extra_houses_use_all_sixteen_digits() {
    use sudoku_app_engine::{KillerCage, SizedGrid};

    let layout = SizedGrid::without_regions(16).unwrap();
    let rules = [
        Rule::ExtraHouse {
            cells: (0..16).map(|i| 17 * i).collect(),
        },
        Rule::KillerCages {
            cages: vec![
                KillerCage {
                    cells: vec![0, 17],
                    sum: 31,
                },
                KillerCage {
                    cells: vec![33],
                    sum: 16,
                },
            ],
            cover_grid: false,
        },
    ];
    let puzzle = SizedConstraintGrid::with_layout(layout, &rules).unwrap();
    let mut digits = [0; 256];
    let candidates = puzzle.candidates(&digits).unwrap().unwrap();
    assert_eq!(candidates[0], 0xc000);
    assert_eq!(candidates[17], 0xc000);
    assert_eq!(candidates[33], 0x8000);
    assert_eq!(candidates[34] & 0xc000, 0);

    digits[0] = 16;
    let candidates = puzzle.candidates(&digits).unwrap().unwrap();
    assert_eq!(candidates[17], 0x4000);
    assert_eq!(candidates[34] & 0x8000, 0);
    digits[51] = 16;
    assert_eq!(puzzle.candidates(&digits), Ok(None));
}

// https://sudokupad.app/y176p34zew
#[test]
fn published_choose_your_fighter_double_arrows_are_unique() {
    let digits = b"030000000000000000000002000000000000".map(|digit| digit - b'0');
    let answer = b"435621162354521463346512253146614235".map(|digit| digit - b'0');
    let rules = [
        Rule::DoubleArrow {
            ends: [16, 21],
            cells: vec![22, 28, 34, 33, 27],
        },
        Rule::DoubleArrow {
            ends: [21, 24],
            cells: vec![26, 19],
        },
        Rule::DoubleArrow {
            ends: [24, 7],
            cells: vec![18, 12],
        },
        Rule::DoubleArrow {
            ends: [7, 5],
            cells: vec![8, 9, 4],
        },
        Rule::DoubleArrow {
            ends: [5, 16],
            cells: vec![11, 17],
        },
    ];
    let layout = GridSpec {
        size: 6,
        box_rows: 2,
        box_columns: 3,
    };
    let grid = SizedConstraintGrid::new(layout, &rules).unwrap();
    let result = grid.solve_unique(&digits, 100_000).unwrap();
    assert_eq!(result, answer);
}

// https://sudokupad.app/xa14jqkz3e
#[test]
fn published_hamburger_double_arrows_are_unique() {
    let digits = b"000000000000000000000000000000000000".map(|digit| digit - b'0');
    let answer = b"421653365214142536653421536142214365".map(|digit| digit - b'0');
    let rules = [
        Rule::DoubleArrow {
            ends: [0, 4],
            cells: vec![1, 2, 3],
        },
        Rule::DoubleArrow {
            ends: [11, 35],
            cells: vec![17, 23, 29],
        },
        Rule::DoubleArrow {
            ends: [34, 30],
            cells: vec![33, 32, 31],
        },
        Rule::DoubleArrow {
            ends: [12, 24],
            cells: vec![18],
        },
        Rule::DoubleArrow {
            ends: [7, 10],
            cells: vec![8, 9],
        },
        Rule::DoubleArrow {
            ends: [10, 22],
            cells: vec![16],
        },
        Rule::DoubleArrow {
            ends: [22, 19],
            cells: vec![21, 20],
        },
        Rule::DoubleArrow {
            ends: [19, 22],
            cells: vec![26, 27],
        },
        Rule::DoubleArrow {
            ends: [19, 22],
            cells: vec![14, 15],
        },
    ];
    let layout = GridSpec {
        size: 6,
        box_rows: 2,
        box_columns: 3,
    };
    let grid = SizedConstraintGrid::new(layout, &rules).unwrap();
    let result = grid.solve_unique(&digits, 100_000).unwrap();
    assert_eq!(result, answer);
}

// https://sudokupad.app/iqyiibuxka
#[test]
fn published_double_arrow_x_sums_has_one_solution() {
    use sudoku_app_engine::{ClueDirection::*, SizedSumEnd as End};
    let answer = b"614523235461521346346152463215152634".map(|digit| digit - b'0');
    let rules = [
        Rule::LinkedDoubleArrow {
            ends: [
                End::XSum {
                    direction: South,
                    index: 1,
                },
                End::XSum {
                    direction: East,
                    index: 1,
                },
            ],
            cells: vec![0],
        },
        Rule::LinkedDoubleArrow {
            ends: [
                End::XSum {
                    direction: West,
                    index: 3,
                },
                End::XSum {
                    direction: North,
                    index: 2,
                },
            ],
            cells: vec![29, 28, 33],
        },
        Rule::LinkedDoubleArrow {
            ends: [
                End::XSum {
                    direction: East,
                    index: 5,
                },
                End::XSum {
                    direction: North,
                    index: 2,
                },
            ],
            cells: vec![30, 31],
        },
        Rule::LinkedDoubleArrow {
            ends: [
                End::XSum {
                    direction: North,
                    index: 2,
                },
                End::XSum {
                    direction: South,
                    index: 2,
                },
            ],
            cells: vec![32, 26, 20, 14, 8, 2],
        },
        Rule::LinkedDoubleArrow {
            ends: [
                End::XSum {
                    direction: South,
                    index: 2,
                },
                End::XSum {
                    direction: West,
                    index: 1,
                },
            ],
            cells: vec![3, 10, 17],
        },
    ];
    let grid = SizedConstraintGrid::new(SIX, &rules).unwrap();
    let result = grid.solve_unique(&[0; 36], 100_000).unwrap();
    assert_eq!(result, answer);
    assert!(
        grid.candidates(&[0; 36])
            .unwrap()
            .unwrap()
            .iter()
            .zip(answer)
            .all(|(&mask, digit)| mask & (1 << (digit - 1)) != 0)
    );

    let swapped = answer.map(|digit| match digit {
        4 => 5,
        5 => 4,
        other => other,
    });
    assert_eq!(
        SizedConstraintGrid::new(SIX, &[])
            .unwrap()
            .analyze(&swapped, 100_000),
        Analysis::Unique
    );
    assert_eq!(grid.analyze(&swapped, 100_000), Analysis::Conflict);
}

#[test]
fn tournament_6x6_quadruples_preserve_repeated_required_digits() {
    let givens = b"050000600000000004000050000300002000".map(|digit| digit - b'0');
    let answer = b"351462624513215634463251146325532146".map(|digit| digit - b'0');
    let rules = [
        (3, vec![1, 4, 5, 6]),
        (8, vec![4, 5, 5, 6]),
        (13, vec![1, 3, 5, 6]),
        (18, vec![1, 4, 4, 6]),
    ]
    .map(|(top_left, digits)| Rule::Quadruple { top_left, digits });
    let puzzle = SizedConstraintGrid::new(SIX, &rules).unwrap();
    assert_eq!(
        puzzle.solve_unique(&givens, 1_000_000).as_deref(),
        Ok(answer.as_slice())
    );
    for omitted in [0, 1, 3] {
        let others = rules
            .iter()
            .enumerate()
            .filter(|(index, _)| *index != omitted)
            .map(|(_, rule)| rule.clone())
            .collect::<Vec<_>>();
        assert_eq!(
            SizedConstraintGrid::new(SIX, &others)
                .unwrap()
                .analyze(&givens, 1_000_000),
            Analysis::Multiple
        );
    }
}

#[test]
fn sixteen_digit_quadruples_respect_their_corner_and_the_highest_digit() {
    let spec = GridSpec {
        size: 16,
        box_rows: 4,
        box_columns: 4,
    };
    let rule = |top_left, digits| Rule::Quadruple { top_left, digits };
    for invalid in [
        rule(15, vec![3]),
        rule(240, vec![3]),
        rule(3, vec![17]),
        rule(3, vec![0]),
        rule(3, vec![]),
    ] {
        assert!(SizedConstraintGrid::new(spec, &[invalid]).is_none());
    }
    let grid = SizedConstraintGrid::new(spec, &[rule(3, vec![16, 16])]).unwrap();
    let mut digits = vec![0; 256];
    digits[3] = 16;
    let masks = grid.candidates(&digits).unwrap().unwrap();
    assert_eq!(masks[20], 1 << 15);
    assert_eq!(masks[4] & (1 << 15), 0);
    assert_eq!(masks[19] & (1 << 15), 0);
    digits[20] = 15;
    assert_eq!(grid.analyze(&digits, 100), Analysis::Conflict);
}
