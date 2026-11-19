use super::super::{SquareTransform, canonical_variant, generation_key};
use super::*;

fn whispers(cells: &[usize], min_difference: u8) -> PuzzleRule {
    PuzzleRule::Whispers {
        cells: cells.to_vec(),
        min_difference,
    }
}

#[test]
fn played_whispers_identity_uses_edges_under_every_grid_symmetry() {
    let original = VariantPuzzle {
        rules: vec![whispers(&[0, 10, 20, 10, 0], 5), whispers(&[10, 0], 4)],
        ..VariantPuzzle::classic([0; CELLS])
    };
    let expected = generation_key(&original);
    for transform in SquareTransform::ALL {
        let mut equivalent = VariantPuzzle {
            rules: vec![
                whispers(&[20, 10], 5),
                whispers(&[10, 0], 5),
                whispers(&[0, 10], 5),
            ],
            ..original.clone()
        };
        transform.puzzle(&mut equivalent);
        assert_eq!(generation_key(&equivalent), expected);
    }
    // Exclusion normalization must never rewrite a source puzzle.
    let public = canonical_variant(&original).unwrap();
    assert!(
        public
            .rules
            .iter()
            .any(|rule| matches!(rule, PuzzleRule::Whispers { cells, .. } if cells.len() == 5))
    );
    assert_eq!(original.rules[0], whispers(&[0, 10, 20, 10, 0], 5));
}

#[test]
fn played_whispers_identity_keeps_minimums_and_separate_edge_sets() {
    let definition = |rules| VariantPuzzle {
        rules,
        ..VariantPuzzle::classic([0; CELLS])
    };
    let original = definition(vec![whispers(&[0, 10, 20], 5)]);
    assert_ne!(
        generation_key(&original),
        generation_key(&definition(vec![whispers(&[0, 10, 20], 4)]))
    );
    assert_ne!(
        generation_key(&original),
        generation_key(&definition(vec![whispers(&[0, 10], 5)]))
    );
    assert_ne!(
        generation_key(&original),
        generation_key(&definition(vec![
            whispers(&[0, 10, 20], 5),
            whispers(&[0, 20], 5),
        ]))
    );
    // Directed increasing paths keep their existing identity.
    let thermometer = definition(vec![PuzzleRule::Thermometer {
        cells: vec![0, 10, 20],
    }]);
    let mut changed = thermometer.clone();
    changed.givens[0] = 1;
    let mut reversed = changed.clone();
    reversed.rules = vec![PuzzleRule::Thermometer {
        cells: vec![20, 10, 0],
    }];
    assert_ne!(generation_key(&changed), generation_key(&reversed));
}

#[test]
fn played_equalities_ignore_path_grouping_but_keep_public_sources() {
    let original = VariantPuzzle {
        rules: vec![
            PuzzleRule::Palindrome {
                cells: vec![0, 12, 20, 40],
                segments: Some(vec![vec![0, 12, 20], vec![20, 40]]),
            },
            PuzzleRule::Clone {
                groups: vec![vec![40, 80]],
            },
        ],
        ..VariantPuzzle::classic([0; CELLS])
    };
    let mut given = original.clone();
    given.givens[0] = 1;
    given.givens[12] = 2;
    given.givens[25] = 3;
    let expected = generation_key(&given);
    let representations = [
        vec![
            PuzzleRule::Palindrome {
                cells: vec![40, 20, 12, 0],
                segments: None,
            },
            PuzzleRule::Clone {
                groups: vec![vec![80, 40]],
            },
        ],
        vec![
            PuzzleRule::Palindrome {
                cells: vec![40, 0],
                segments: None,
            },
            PuzzleRule::Palindrome {
                cells: vec![20, 12],
                segments: None,
            },
            PuzzleRule::Clone {
                groups: vec![vec![0, 80]],
            },
        ],
        vec![PuzzleRule::Clone {
            groups: vec![vec![80, 40, 0], vec![20, 12], vec![0, 80]],
        }],
    ];
    for rules in representations {
        for transform in SquareTransform::ALL {
            let mut equivalent = VariantPuzzle {
                rules: rules.clone(),
                ..given.clone()
            };
            transform.puzzle(&mut equivalent);
            for digit in &mut equivalent.givens {
                if *digit != 0 {
                    *digit = 10 - *digit;
                }
            }
            assert_eq!(generation_key(&equivalent), expected);
        }
    }
    assert_eq!(given.rules, original.rules);
    let public = canonical_variant(&given).unwrap();
    assert!(public.rules.iter().any(|rule| matches!(rule,
        PuzzleRule::Palindrome { cells, segments: Some(_) } if cells.len() == 4)));
    assert!(public.rules.iter().any(|rule| matches!(rule,
        PuzzleRule::Clone { groups } if groups.len() == 1 && groups[0].len() == 2)));
}

#[test]
fn played_palindromes_keep_mirror_pairings_and_ignore_free_centers() {
    let definition = |cells| VariantPuzzle {
        rules: vec![PuzzleRule::Palindrome {
            cells,
            segments: None,
        }],
        ..VariantPuzzle::classic([0; CELLS])
    };
    assert_ne!(
        generation_key(&definition(vec![0, 10, 40, 50])),
        generation_key(&definition(vec![0, 10, 50, 40]))
    );
    let odd = definition(vec![0, 13, 40]);
    assert_eq!(
        generation_key(&odd),
        generation_key(&definition(vec![0, 22, 40]))
    );
    let mut changed = odd.clone();
    changed.rules.push(PuzzleRule::Palindrome {
        cells: vec![13, 22],
        segments: None,
    });
    assert_ne!(generation_key(&odd), generation_key(&changed));
    changed = odd.clone();
    changed.rules.push(PuzzleRule::AntiKing {});
    assert_ne!(generation_key(&odd), generation_key(&changed));
}

#[test]
fn played_entropy_keys_cover_every_group_permutation_and_grid_symmetry() {
    const PERMUTATIONS: [[u8; 3]; 6] = [
        [0, 1, 2],
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0],
    ];
    let mut original = VariantPuzzle {
        rules: vec![
            PuzzleRule::GlobalEntropy {},
            PuzzleRule::Entropic {
                cells: vec![0, 10, 20],
            },
        ],
        ..VariantPuzzle::classic([0; CELLS])
    };
    original.givens[..9].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8, 9]);
    original.givens[40] = 7;
    original.givens[70] = 3;
    let expected = generation_key(&original);
    let mut checked = 0;
    for groups in PERMUTATIONS {
        for low in PERMUTATIONS {
            for medium in PERMUTATIONS {
                for high in PERMUTATIONS {
                    let members = [low, medium, high];
                    for transform in SquareTransform::ALL {
                        let mut equivalent = original.clone();
                        equivalent.rules.push(PuzzleRule::GlobalEntropy {});
                        for digit in &mut equivalent.givens {
                            if *digit != 0 {
                                let group = usize::from((*digit - 1) / 3);
                                let member = usize::from((*digit - 1) % 3);
                                *digit = groups[group] * 3 + members[group][member] + 1;
                            }
                        }
                        transform.puzzle(&mut equivalent);
                        assert_eq!(generation_key(&equivalent), expected);
                        checked += 1;
                    }
                }
            }
        }
    }
    assert_eq!(checked, 1_296 * 8);
    assert_eq!(original.rules.len(), 2);
    assert_eq!(original.givens[0], 1);
    let public = canonical_variant(&VariantPuzzle {
        rules: vec![PuzzleRule::GlobalEntropy {}, PuzzleRule::GlobalEntropy {}],
        ..VariantPuzzle::classic([0; CELLS])
    })
    .unwrap();
    assert_eq!(public.rules.len(), 2);
}

#[test]
fn played_entropy_keys_keep_cross_group_changes_and_numeric_companions_distinct() {
    let mut original = VariantPuzzle {
        rules: vec![PuzzleRule::GlobalEntropy {}],
        ..VariantPuzzle::classic([0; CELLS])
    };
    original.givens[..9].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8, 9]);
    original.givens[40] = 7;
    original.givens[70] = 3;
    let mut crossed = original.clone();
    for digit in &mut crossed.givens {
        *digit = match *digit {
            3 => 4,
            4 => 3,
            digit => digit,
        };
    }
    assert_ne!(generation_key(&original), generation_key(&crossed));
    let companions = [
        PuzzleRule::Parity {
            cells: vec![80],
            parity: crate::variant::Parity::Odd,
        },
        PuzzleRule::Inequality {
            less: 0,
            greater: 40,
        },
        PuzzleRule::KillerCages {
            cages: vec![crate::variant::KillerCage {
                cells: vec![60, 61],
                sum: 10,
            }],
            cover_grid: false,
        },
        PuzzleRule::Modular {
            cells: vec![0, 10, 20],
        },
        PuzzleRule::Whispers {
            cells: vec![0, 40],
            min_difference: 5,
        },
    ];
    for companion in companions {
        let mut mixed = original.clone();
        mixed.rules.push(companion);
        let mut renamed = mixed.clone();
        for digit in &mut renamed.givens {
            *digit = match *digit {
                1 => 2,
                2 => 1,
                digit => digit,
            };
        }
        assert_ne!(generation_key(&mixed), generation_key(&renamed));
    }
}

#[test]
fn played_group_names_ignore_empty_cells_and_unused_members() {
    let mut givens = [0; CELLS];
    givens[..5].copy_from_slice(&[8, 0, 9, 4, 8]);
    rename_groups(&mut givens, &[0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
    assert_eq!(&givens[..5], &[1, 0, 2, 4, 1]);
    assert!(givens[5..].iter().all(|&digit| digit == 0));
}

fn entropic(cells: &[usize]) -> PuzzleRule {
    PuzzleRule::Entropic {
        cells: cells.to_vec(),
    }
}

#[test]
fn played_entropic_walks_use_original_window_pairs_under_every_grid_symmetry() {
    let original = VariantPuzzle {
        rules: vec![entropic(&[0, 12, 24, 40, 52]), entropic(&[52, 64, 80])],
        ..VariantPuzzle::classic([0; CELLS])
    };
    let mut given = original.clone();
    for (cell, digit) in [
        (0, 1),
        (12, 4),
        (24, 7),
        (40, 2),
        (52, 5),
        (64, 8),
        (80, 3),
        (28, 9),
    ] {
        given.givens[cell] = digit;
    }
    let expected = generation_key(&given);
    let pairs = [
        [0, 12],
        [0, 24],
        [12, 24],
        [12, 40],
        [24, 40],
        [24, 52],
        [40, 52],
        [52, 64],
        [52, 80],
        [64, 80],
    ];
    let decomposed: Vec<_> = pairs.iter().map(|cells| entropic(cells)).collect();
    let mut duplicate = decomposed.clone();
    duplicate.extend(decomposed.clone());
    let alternatives = [
        vec![entropic(&[80, 64, 52]), entropic(&[52, 40, 24, 12, 0])],
        vec![
            entropic(&[0, 12, 24]),
            entropic(&[12, 24, 40]),
            entropic(&[24, 40, 52]),
            entropic(&[52, 64, 80]),
        ],
        decomposed,
        duplicate,
    ];
    for rules in alternatives {
        for transform in SquareTransform::ALL {
            let mut equivalent = VariantPuzzle {
                rules: rules.clone(),
                ..given.clone()
            };
            transform.puzzle(&mut equivalent);
            assert_eq!(generation_key(&equivalent), expected);
        }
    }
    assert_eq!(given.rules, original.rules);
    let public = canonical_variant(&original).unwrap();
    assert!(
        public
            .rules
            .iter()
            .any(|rule| matches!(rule, PuzzleRule::Entropic { cells } if cells.len() == 5))
    );
}

#[test]
fn played_pure_entropic_keys_cover_every_group_bijection_and_grid_symmetry() {
    const PERMUTATIONS: [[u8; 3]; 6] = [
        [0, 1, 2],
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0],
    ];
    let mut original = VariantPuzzle {
        rules: vec![entropic(&[0, 10, 20])],
        ..VariantPuzzle::classic([0; CELLS])
    };
    original.givens[..9].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8, 9]);
    original.givens[40] = 7;
    original.givens[70] = 3;
    let expected = generation_key(&original);
    let mut checked = 0;
    for groups in PERMUTATIONS {
        for low in PERMUTATIONS {
            for medium in PERMUTATIONS {
                for high in PERMUTATIONS {
                    let members = [low, medium, high];
                    for transform in SquareTransform::ALL {
                        let mut renamed = original.clone();
                        for digit in &mut renamed.givens {
                            if *digit != 0 {
                                let group = usize::from((*digit - 1) / 3);
                                *digit = groups[group] * 3
                                    + members[group][usize::from((*digit - 1) % 3)]
                                    + 1;
                            }
                        }
                        transform.puzzle(&mut renamed);
                        assert_eq!(generation_key(&renamed), expected);
                        checked += 1;
                    }
                }
            }
        }
    }
    assert_eq!(checked, 1296 * 8);
}

#[test]
fn played_entropic_keys_preserve_independent_paths_conflicting_revisits_and_numeric_rules() {
    let definition = |rules| VariantPuzzle {
        rules,
        ..VariantPuzzle::classic([0; CELLS])
    };
    let separate = definition(vec![entropic(&[0, 12, 24]), entropic(&[24, 40, 52])]);
    let joined = definition(vec![entropic(&[0, 12, 24, 40, 52])]);
    assert_ne!(generation_key(&separate), generation_key(&joined));
    let triangle = definition(vec![entropic(&[0, 12, 24])]);
    assert_eq!(
        generation_key(&triangle),
        generation_key(&definition(vec![entropic(&[0, 12, 24, 0])]))
    );
    assert_ne!(
        generation_key(&triangle),
        generation_key(&definition(vec![entropic(&[0, 12, 0])]))
    );
    assert_ne!(
        generation_key(&definition(vec![])),
        generation_key(&definition(vec![entropic(&[0, 12, 0])]))
    );
    let singleton = definition(vec![entropic(&[40])]);
    assert_eq!(
        generation_key(&singleton),
        generation_key(&definition(vec![]))
    );
    assert_eq!(canonical_variant(&singleton).unwrap().rules.len(), 1);
    let mut original = triangle;
    original.givens[..9].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8, 9]);
    original.givens[40] = 7;
    original.givens[70] = 3;
    let mut crossed = original.clone();
    for digit in &mut crossed.givens {
        *digit = match *digit {
            3 => 4,
            4 => 3,
            digit => digit,
        };
    }
    assert_ne!(generation_key(&original), generation_key(&crossed));
    for companion in [
        PuzzleRule::Parity {
            cells: vec![80],
            parity: crate::variant::Parity::Odd,
        },
        PuzzleRule::Inequality {
            less: 0,
            greater: 40,
        },
    ] {
        let mut mixed = original.clone();
        mixed.rules.push(companion);
        let mut renamed = mixed.clone();
        for digit in &mut renamed.givens {
            *digit = match *digit {
                1 => 2,
                2 => 1,
                digit => digit,
            };
        }
        assert_ne!(generation_key(&mixed), generation_key(&renamed));
    }
}
