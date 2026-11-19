use super::*;
use crate::variant::{
    KillerCage, MarkedPairs,
    symmetry::{SquareTransform, canonical_variant, generation_key},
};
use std::collections::BTreeMap;

const CELLS_IN_ORDER: [usize; 4] = [10, 24, 52, 70];

fn definition(rules: Vec<PuzzleRule>) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic([0; CELLS]);
    // Asymmetric anchors distinguish a changed relation from a rotated grid.
    for (cell, digit) in [(2, 1), (31, 3), (77, 6)] {
        puzzle.givens[cell] = digit;
    }
    puzzle.rules = rules;
    puzzle
}

fn edge(less: usize, greater: usize) -> PuzzleRule {
    PuzzleRule::Inequality { less, greater }
}

fn complemented(puzzle: &VariantPuzzle) -> VariantPuzzle {
    let mut result = puzzle.clone();
    for given in &mut result.givens {
        if *given != 0 {
            *given = 10 - *given;
        }
    }
    for rule in &mut result.rules {
        match rule {
            PuzzleRule::Inequality { less, greater } => std::mem::swap(less, greater),
            PuzzleRule::Thermometer { cells } => cells.reverse(),
            _ => {}
        }
    }
    result
}

#[test]
fn all_four_cell_orders_match_literal_digit_assignment_equivalence() {
    let pairs: Vec<_> = (0..4)
        .flat_map(|a| (a + 1..4).map(move |b| (a, b)))
        .collect();
    let mut by_truth = BTreeMap::new();
    let mut by_key = BTreeMap::new();
    for selection in 0..1_u32 << pairs.len() {
        let selected: Vec<_> = pairs
            .iter()
            .enumerate()
            .filter_map(|(index, &pair)| (selection & (1 << index) != 0).then_some(pair))
            .collect();
        // Enumerate the actual strict numeric predicate, without graph closure
        // or the production key. Nine symbols suffice for all four-cell orders.
        let mut truth = vec![0_u64; 9_usize.pow(4).div_ceil(64)];
        for assignment in 0..9_usize.pow(4) {
            let mut digits = [0; 4];
            let mut code = assignment;
            for digit in &mut digits {
                *digit = code % 9 + 1;
                code /= 9;
            }
            if selected.iter().all(|&(a, b)| digits[a] < digits[b]) {
                truth[assignment / 64] |= 1 << (assignment % 64);
            }
        }
        let puzzle = definition(
            selected
                .iter()
                .map(|&(a, b)| edge(CELLS_IN_ORDER[a], CELLS_IN_ORDER[b]))
                .collect(),
        );
        let expected = generation_key(&puzzle);
        if let Some(previous) = by_truth.insert(truth.clone(), expected.clone()) {
            assert_eq!(previous, expected);
        }
        if let Some(previous) = by_key.insert(expected.clone(), truth.clone()) {
            assert_eq!(previous, truth);
        }
        for transform in SquareTransform::ALL {
            let mut transformed = puzzle.clone();
            transform.puzzle(&mut transformed);
            assert_eq!(generation_key(&transformed), expected);
            if !selected.is_empty() {
                assert_eq!(generation_key(&complemented(&transformed)), expected);
            }
        }
    }
    assert_eq!(by_truth.len(), 40);
    assert_eq!(by_key.len(), 40);
}

#[test]
fn thermometer_and_sign_paths_share_only_their_private_order() {
    let [a, b, c, d] = CELLS_IN_ORDER;
    let original = definition(vec![PuzzleRule::Thermometer {
        cells: vec![a, b, c, d],
    }]);
    let separate = definition(vec![edge(a, b), edge(b, c), edge(c, d)]);
    let redundant = definition(vec![
        edge(a, c),
        edge(a, d),
        edge(b, d),
        PuzzleRule::Thermometer { cells: vec![a, b] },
        edge(b, c),
        edge(c, d),
        edge(a, b),
    ]);
    let expected = generation_key(&original);
    for puzzle in [&separate, &redundant, &complemented(&redundant)] {
        assert_eq!(generation_key(puzzle), expected);
    }
    assert!(
        canonical_variant(&original)
            .unwrap()
            .rules
            .iter()
            .any(|rule| matches!(rule, PuzzleRule::Thermometer { cells } if cells.len() == 4))
    );
    assert_eq!(
        original.rules,
        vec![PuzzleRule::Thermometer {
            cells: vec![a, b, c, d]
        }]
    );
    // Reversing signs without complementing the digits changes the puzzle.
    assert_ne!(
        generation_key(&definition(vec![edge(b, a), edge(c, b), edge(d, c)])),
        expected
    );
}

#[test]
fn numeric_companions_keep_their_original_digits_and_parameters() {
    let [a, b, _, _] = CELLS_IN_ORDER;
    let companions = [
        PuzzleRule::KillerCages {
            cages: vec![KillerCage {
                cells: vec![16, 17],
                sum: 5,
            }],
            cover_grid: false,
        },
        PuzzleRule::AdjacentTotal {
            cells: [16, 17],
            sum: 5,
        },
        PuzzleRule::Kropki {
            consecutive: Default::default(),
            ratio_two: MarkedPairs {
                pairs: vec![[16, 17]],
                negative: false,
            },
        },
        PuzzleRule::Arrow {
            circle: 30,
            cells: vec![16, 17],
        },
    ];
    for companion in companions {
        let mut puzzle = definition(vec![edge(a, b), companion.clone()]);
        puzzle.givens[16] = 2;
        puzzle.givens[17] = if matches!(companion, PuzzleRule::Kropki { .. }) {
            4
        } else {
            3
        };
        puzzle.givens[30] = 5;
        let reversed = complemented(&puzzle);
        let permits = |digits: &[u8; CELLS]| match &companion {
            PuzzleRule::KillerCages { cages, .. } => {
                u16::from(digits[16]) + u16::from(digits[17]) == cages[0].sum
            }
            PuzzleRule::AdjacentTotal { sum, .. } => digits[16] + digits[17] == *sum,
            PuzzleRule::Kropki { .. } => {
                digits[16] * 2 == digits[17] || digits[17] * 2 == digits[16]
            }
            PuzzleRule::Arrow { .. } => digits[30] == digits[16] + digits[17],
            _ => unreachable!(),
        };
        assert!(permits(&puzzle.givens));
        assert!(!permits(&reversed.givens));
        assert_ne!(generation_key(&puzzle), generation_key(&reversed));
        let mut redundant = puzzle.clone();
        redundant.rules[0] = PuzzleRule::Thermometer { cells: vec![a, b] };
        assert_eq!(generation_key(&puzzle), generation_key(&redundant));
        assert!(!normalize(&mut redundant));
        assert!(redundant.rules.contains(&companion));
    }
}

#[test]
fn cyclic_orders_keep_their_original_contradiction() {
    let [a, b, c, _] = CELLS_IN_ORDER;
    let mut puzzle = definition(vec![edge(a, b), edge(b, c), edge(c, a)]);
    let original = puzzle.clone();
    assert!(!normalize(&mut puzzle));
    assert_eq!(puzzle, original);
    let acyclic = definition(vec![edge(a, b), edge(b, c)]);
    assert_ne!(generation_key(&puzzle), generation_key(&acyclic));
}
