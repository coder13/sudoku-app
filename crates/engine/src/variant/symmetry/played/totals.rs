use std::cmp::Ordering;

use super::{PuzzleRule, VariantPuzzle, digit_invariant};
use crate::MarkedPairs;

// Normalize edges and combine equivalent marker layers. Positive totals and
// digit-invariant companions permit complementing the entire puzzle.
pub(super) fn normalize(puzzle: &mut VariantPuzzle) -> bool {
    let mut marks = [MarkedPairs::default(), MarkedPairs::default()];
    puzzle.rules.retain(|rule| {
        match rule {
            PuzzleRule::Xv { five, ten } => {
                for (target, source) in marks.iter_mut().zip([five, ten]) {
                    target.negative |= source.negative;
                    target.pairs.extend_from_slice(&source.pairs);
                }
            }
            // These totals also exempt their edges from both negative XV
            // relations, exactly as positive X and V markers do.
            PuzzleRule::AdjacentTotal { cells, sum: 5 } => marks[0].pairs.push(*cells),
            PuzzleRule::AdjacentTotal { cells, sum: 10 } => marks[1].pairs.push(*cells),
            _ => return true,
        }
        false
    });
    for marker in &mut marks {
        for pair in &mut marker.pairs {
            pair.sort_unstable();
        }
        marker.pairs.sort_unstable();
        marker.pairs.dedup();
    }
    if marks
        .iter()
        .any(|mark| mark.negative || !mark.pairs.is_empty())
    {
        let [five, ten] = marks;
        puzzle.rules.push(PuzzleRule::Xv { five, ten });
    }
    let mut has_total = false;
    let mut can_complement = true;
    for rule in &mut puzzle.rules {
        match rule {
            PuzzleRule::AdjacentTotal { cells, .. } => {
                cells.sort_unstable();
                has_total = true;
            }
            PuzzleRule::Xv { five, ten } if !five.negative && !ten.negative => has_total = true,
            _ if digit_invariant(rule) => {}
            _ => can_complement = false,
        }
    }
    has_total && can_complement
}

pub(super) fn rename(puzzle: &mut VariantPuzzle) {
    let order = puzzle
        .givens
        .iter()
        .copied()
        .map(complement_digit)
        .cmp(puzzle.givens);
    match order {
        Ordering::Greater => {}
        Ordering::Less => complement(puzzle),
        Ordering::Equal => {
            let mut opposite = puzzle.clone();
            complement(&mut opposite);
            puzzle.rules.sort_unstable();
            opposite.rules.sort_unstable();
            if opposite < *puzzle {
                *puzzle = opposite;
            }
        }
    }
}

fn complement_digit(digit: u8) -> u8 {
    if digit == 0 { 0 } else { 10 - digit }
}

fn complement(puzzle: &mut VariantPuzzle) {
    puzzle.givens = puzzle.givens.map(complement_digit);
    let mut fifteens = Vec::new();
    for rule in &mut puzzle.rules {
        match rule {
            PuzzleRule::AdjacentTotal { sum, .. } => *sum = 20 - *sum,
            PuzzleRule::Xv { five, .. } => {
                fifteens.extend(
                    five.pairs
                        .drain(..)
                        .map(|cells| PuzzleRule::AdjacentTotal { cells, sum: 15 }),
                );
            }
            _ => {}
        }
    }
    puzzle.rules.extend(fifteens);
    normalize(puzzle);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CELLS, variant::symmetry::generation_key};

    fn marks(pairs: Vec<[usize; 2]>, negative: bool) -> MarkedPairs {
        MarkedPairs { pairs, negative }
    }

    #[test]
    fn generated_history_recognizes_split_markers_and_total_aliases() {
        let mut explicit = VariantPuzzle::classic([0; CELLS]);
        explicit.rules = vec![PuzzleRule::Xv {
            five: marks(vec![[0, 1]], false),
            ten: marks(vec![[9, 10]], false),
        }];
        let mut aliased = explicit.clone();
        aliased.rules = vec![
            PuzzleRule::Xv {
                five: marks(vec![[1, 0], [0, 1]], false),
                ten: MarkedPairs::default(),
            },
            PuzzleRule::AdjacentTotal {
                cells: [10, 9],
                sum: 10,
            },
        ];
        assert_eq!(generation_key(&explicit), generation_key(&aliased));
        assert_ne!(explicit.rules, aliased.rules);
    }

    #[test]
    fn whole_grid_exclusions_and_other_sums_survive_history_normalization() {
        let mut explicit = VariantPuzzle::classic([0; CELLS]);
        explicit.rules = vec![
            PuzzleRule::Xv {
                five: marks(vec![[0, 1]], true),
                ten: marks(vec![[9, 10]], false),
            },
            PuzzleRule::AdjacentTotal {
                cells: [1, 2],
                sum: 15,
            },
        ];
        let mut layered = explicit.clone();
        layered.rules = vec![
            PuzzleRule::Xv {
                five: marks(Vec::new(), true),
                ten: MarkedPairs::default(),
            },
            PuzzleRule::AdjacentTotal {
                cells: [1, 0],
                sum: 5,
            },
            PuzzleRule::AdjacentTotal {
                cells: [10, 9],
                sum: 10,
            },
            PuzzleRule::AdjacentTotal {
                cells: [2, 1],
                sum: 15,
            },
        ];
        assert_eq!(generation_key(&explicit), generation_key(&layered));
        layered.rules.remove(0);
        assert_ne!(generation_key(&explicit), generation_key(&layered));
        layered.rules.push(PuzzleRule::Xv {
            five: marks(Vec::new(), true),
            ten: MarkedPairs::default(),
        });
        layered.rules.remove(2);
        assert_ne!(generation_key(&explicit), generation_key(&layered));
    }

    #[test]
    fn generic_total_reversals_and_redundant_clues_share_one_history_key() {
        let mut original = VariantPuzzle::classic([0; CELLS]);
        original.rules = vec![PuzzleRule::AdjacentTotal {
            cells: [19, 20],
            sum: 13,
        }];
        let mut repeated = original.clone();
        repeated.rules.push(PuzzleRule::AdjacentTotal {
            cells: [20, 19],
            sum: 13,
        });
        assert_eq!(generation_key(&original), generation_key(&repeated));
        repeated.rules.push(PuzzleRule::AdjacentTotal {
            cells: [20, 19],
            sum: 12,
        });
        assert_ne!(generation_key(&original), generation_key(&repeated));
    }

    #[test]
    fn positive_totals_complement_through_both_xv_aliases_and_general_sums() {
        let mut original = VariantPuzzle::classic([0; CELLS]);
        original.givens[10] = 2;
        original.rules = vec![
            PuzzleRule::Xv {
                five: marks(vec![[0, 1]], false),
                ten: marks(vec![[9, 10]], false),
            },
            PuzzleRule::AdjacentTotal {
                cells: [1, 2],
                sum: 13,
            },
            PuzzleRule::Diagonal {
                diagonal: crate::Diagonal::Main,
            },
        ];
        let mut opposite = original.clone();
        opposite.givens[10] = 8;
        opposite.rules = vec![
            PuzzleRule::AdjacentTotal {
                cells: [0, 1],
                sum: 15,
            },
            PuzzleRule::AdjacentTotal {
                cells: [9, 10],
                sum: 10,
            },
            PuzzleRule::AdjacentTotal {
                cells: [1, 2],
                sum: 7,
            },
            PuzzleRule::Diagonal {
                diagonal: crate::Diagonal::Main,
            },
        ];
        assert_eq!(generation_key(&original), generation_key(&opposite));

        let numeric_companion = PuzzleRule::Inequality {
            less: 9,
            greater: 10,
        };
        original.rules.push(numeric_companion.clone());
        opposite.rules.push(numeric_companion);
        assert_ne!(generation_key(&original), generation_key(&opposite));
    }
}
