use super::{PuzzleRule, VariantPuzzle};
use crate::MarkedPairs;

/// Fold equivalent representations of sums of five and ten into one marker rule.
pub(super) fn normalize(puzzle: &mut VariantPuzzle) {
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
}
