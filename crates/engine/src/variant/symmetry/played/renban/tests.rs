use super::*;
use crate::variant::{
    KillerCage, MarkedPairs,
    symmetry::{SquareTransform, canonical_variant, generation_key},
};

fn line(cells: &[usize]) -> PuzzleRule {
    PuzzleRule::Renban {
        cells: cells.to_vec(),
        segments: None,
    }
}

fn definition(rules: Vec<PuzzleRule>) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic([0; CELLS]);
    puzzle.givens[..9].copy_from_slice(&[4, 1, 7, 2, 9, 5, 8, 3, 6]);
    puzzle.rules = rules;
    puzzle
}

fn permute(values: &mut [u8; 9]) -> bool {
    let Some(i) = (0..8).rev().find(|&i| values[i] < values[i + 1]) else {
        return false;
    };
    let j = (i + 1..9).rev().find(|&j| values[j] > values[i]).unwrap();
    values.swap(i, j);
    values[i + 1..].reverse();
    true
}

// This literal oracle describes Renban's allowed digit sets. It does not use
// the production central-band formula, renamer or rule normalizer.
fn preserves_intervals(mapping: &[u8; 9], length: usize) -> bool {
    (0..=9 - length).all(|start| {
        let mut image = mapping[start..start + length].to_vec();
        image.sort_unstable();
        image.windows(2).all(|pair| pair[1] == pair[0] + 1)
    })
}

#[test]
fn every_valid_renban_digit_bijection_preserves_played_keys() {
    let lengths = [2, 3, 4, 5, 6, 7, 8];
    let expected_counts = [2, 2, 2, 2, 12, 240, 10_080];
    for (length, expected_count) in lengths.into_iter().zip(expected_counts) {
        let cells = [0, 13, 21, 33, 47, 58, 62, 79];
        let puzzle = definition(vec![line(&cells[..length])]);
        let expected = generation_key(&puzzle);
        let mut mapping = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        let mut accepted = 0;
        let mut near_misses = 0;
        loop {
            let mut renamed = puzzle.clone();
            for digit in &mut renamed.givens {
                if *digit != 0 {
                    *digit = mapping[usize::from(*digit - 1)];
                }
            }
            if preserves_intervals(&mapping, length) {
                accepted += 1;
                for transform in SquareTransform::ALL {
                    let mut transformed = renamed.clone();
                    transform.puzzle(&mut transformed);
                    assert_eq!(
                        generation_key(&transformed),
                        expected,
                        "length {length}, {mapping:?}"
                    );
                }
            } else if near_misses < 64 {
                near_misses += 1;
                assert_ne!(
                    generation_key(&renamed),
                    expected,
                    "length {length}, {mapping:?}"
                );
            }
            if !permute(&mut mapping) {
                break;
            }
        }
        assert_eq!(accepted, expected_count, "length {length}");
        assert_eq!(near_misses, 64);
    }
}

#[test]
fn renban_history_uses_complete_sets_and_preserves_public_drawings() {
    let mut puzzle = definition(vec![PuzzleRule::Renban {
        cells: vec![0, 13, 21, 33, 47],
        segments: Some(vec![vec![0, 13, 21], vec![21, 33, 47]]),
    }]);
    let original = puzzle.clone();
    let expected = generation_key(&puzzle);
    for cells in [vec![47, 33, 21, 13, 0], vec![33, 13, 47, 0, 21]] {
        puzzle.rules = vec![line(&cells), line(&cells), line(&[80])];
        assert_eq!(generation_key(&puzzle), expected);
    }
    let separate = definition(vec![line(&[0, 13, 21]), line(&[21, 33, 47])]);
    // 1,2,3,2,1 satisfies both triplets, but not one five-cell Renban.
    let consecutive_set = |values: &[u8]| {
        let mut sorted = values.to_vec();
        sorted.sort_unstable();
        sorted.windows(2).all(|pair| pair[1] == pair[0] + 1)
    };
    assert!(consecutive_set(&[1, 2, 3]));
    assert!(consecutive_set(&[3, 2, 1]));
    assert!(!consecutive_set(&[1, 2, 3, 2, 1]));
    assert_ne!(generation_key(&separate), expected);
    let public = canonical_variant(&original).unwrap();
    assert!(public.rules.iter().any(|rule| matches!(rule,
        PuzzleRule::Renban { cells, segments: Some(paths) }
            if cells.len() == 5 && paths.len() == 2)));
    assert!(
        matches!(&original.rules[0], PuzzleRule::Renban { cells, segments: Some(_) }
        if cells == &[0, 13, 21, 33, 47])
    );
}

#[test]
fn renban_history_bridges_nine_digit_houses_and_positive_white_dots() {
    let cells = [0, 13, 21, 33, 47, 58, 62, 74, 79];
    let original = definition(vec![line(&cells), line(&[39, 40])]);
    let expected = generation_key(&original);
    for house in [
        PuzzleRule::ExtraHouse {
            cells: cells.to_vec(),
        },
        PuzzleRule::KillerCages {
            cages: vec![KillerCage {
                cells: cells.to_vec(),
                sum: 45,
            }],
            cover_grid: false,
        },
    ] {
        for two_cell in [
            line(&[40, 39]),
            PuzzleRule::Kropki {
                consecutive: MarkedPairs {
                    pairs: vec![[39, 40]],
                    negative: false,
                },
                ratio_two: Default::default(),
            },
        ] {
            let puzzle = definition(vec![house.clone(), two_cell]);
            puzzle.compile().unwrap();
            assert_eq!(generation_key(&puzzle), expected);
        }
    }
    let smaller = definition(vec![
        PuzzleRule::KillerCages {
            cages: vec![KillerCage {
                cells: cells[..8].to_vec(),
                sum: 36,
            }],
            cover_grid: false,
        },
        line(&[39, 40]),
    ]);
    smaller.compile().unwrap();
    assert_ne!(generation_key(&smaller), expected);
    assert!(
        canonical_variant(&original)
            .unwrap()
            .rules
            .iter()
            .any(|rule| matches!(rule, PuzzleRule::Renban { cells, .. } if cells.len() == 9))
    );
}

#[test]
fn mixed_numeric_rules_disable_renban_digit_renaming() {
    for companion in [
        PuzzleRule::Thermometer { cells: vec![9, 10] },
        PuzzleRule::Entropic {
            cells: vec![9, 10, 11],
        },
        PuzzleRule::Kropki {
            consecutive: Default::default(),
            ratio_two: MarkedPairs {
                pairs: vec![[9, 10]],
                negative: false,
            },
        },
    ] {
        let puzzle = definition(vec![line(&[0, 13, 21, 33, 47, 58, 62]), companion]);
        let mut renamed = puzzle.clone();
        for digit in &mut renamed.givens {
            *digit = match *digit {
                3 => 4,
                4 => 3,
                digit => digit,
            };
        }
        assert_ne!(generation_key(&puzzle), generation_key(&renamed));
    }
}

#[test]
fn white_dot_bridges_preserve_negative_flags_across_all_rules() {
    let negative = PuzzleRule::Kropki {
        consecutive: Default::default(),
        ratio_two: MarkedPairs {
            pairs: vec![],
            negative: true,
        },
    };
    let mut renban = VariantPuzzle::classic([0; CELLS]);
    renban.rules = vec![line(&[0, 1]), negative.clone()];
    let mut marked = renban.clone();
    marked.rules = vec![
        PuzzleRule::Kropki {
            consecutive: MarkedPairs {
                pairs: vec![[0, 1]],
                negative: false,
            },
            ratio_two: Default::default(),
        },
        negative,
    ];
    // A marked white edge exempts 1,2 from negative black dots. An independent
    // Renban does not create that marker exemption. The puzzles differ.
    let edge_allows = |puzzle: &VariantPuzzle| {
        puzzle
            .compile()
            .unwrap()
            .pair_clues
            .iter()
            .filter_map(|clue| clue.binary_relation())
            .filter(|pair| pair.cells == [0, 1])
            .all(|pair| pair.permits(1, 2))
    };
    assert!(!edge_allows(&renban));
    assert!(edge_allows(&marked));
    assert_ne!(generation_key(&renban), generation_key(&marked));
}
