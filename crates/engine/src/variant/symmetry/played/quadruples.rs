use std::collections::BTreeMap;

use super::{PuzzleRule, VariantPuzzle, digit_invariant};

const MAX_DIGIT: u8 = 9;
type Counts = [usize; 10];

fn counts(digits: &[u8]) -> Counts {
    let mut counts = [0; 10];
    for &digit in digits {
        counts[usize::from(digit)] += 1;
    }
    counts
}

// At one corner, each digit must occur at least as often as the most
// demanding clue says. Distinct corners still impose separate constraints.
pub(super) fn normalize(puzzle: &mut VariantPuzzle) -> bool {
    let mut corners = BTreeMap::<usize, Counts>::new();
    for rule in &puzzle.rules {
        if let PuzzleRule::Quadruple { top_left, digits } = rule {
            let combined = corners.entry(*top_left).or_default();
            for (prior, count) in combined.iter_mut().zip(counts(digits)) {
                *prior = (*prior).max(count);
            }
        }
    }
    if corners.is_empty()
        || corners
            .values()
            .any(|counts| counts.iter().sum::<usize>() > 4)
    {
        return false;
    }
    puzzle
        .rules
        .retain(|rule| !matches!(rule, PuzzleRule::Quadruple { .. }));
    let can_rename = puzzle.rules.iter().all(digit_invariant);
    puzzle
        .rules
        .extend(corners.into_iter().map(|(top_left, counts)| {
            let digits = (1..=MAX_DIGIT)
                .flat_map(|digit| std::iter::repeat_n(digit, counts[usize::from(digit)]))
                .collect();
            PuzzleRule::Quadruple { top_left, digits }
        }));
    can_rename
}

pub(super) fn rename(puzzle: &mut VariantPuzzle) {
    let mut labels = [0; 10];
    let mut next = 1;
    for given in &mut puzzle.givens {
        if *given == 0 {
            continue;
        }
        let label = &mut labels[usize::from(*given)];
        if *label == 0 {
            *label = next;
            next += 1;
        }
        *given = *label;
    }
    if next <= MAX_DIGIT {
        // Unseen digits cannot change the given grid. At the first corner
        // where their counts differ, put the more frequent digit first to
        // give that sorted clue the smallest possible label sequence.
        let mut clues: Vec<_> = puzzle
            .rules
            .iter()
            .filter_map(|rule| match rule {
                PuzzleRule::Quadruple { top_left, digits } => Some((*top_left, counts(digits))),
                _ => None,
            })
            .collect();
        clues.sort_unstable_by_key(|(top_left, _)| *top_left);
        let mut unseen: Vec<_> = (1..=usize::from(MAX_DIGIT))
            .filter(|&digit| labels[digit] == 0)
            .collect();
        unseen.sort_by(|&a, &b| {
            clues
                .iter()
                .map(|(_, counts)| counts[b])
                .cmp(clues.iter().map(|(_, counts)| counts[a]))
        });
        for (digit, label) in unseen.into_iter().zip(next..=MAX_DIGIT) {
            labels[digit] = label;
        }
    }
    for rule in &mut puzzle.rules {
        if let PuzzleRule::Quadruple { digits, .. } = rule {
            for digit in digits.iter_mut() {
                *digit = labels[usize::from(*digit)];
            }
            digits.sort_unstable();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CELLS, Diagonal, variant::symmetry::generation_key};

    fn clue(top_left: usize, digits: &[u8]) -> PuzzleRule {
        PuzzleRule::Quadruple {
            top_left,
            digits: digits.to_vec(),
        }
    }

    #[test]
    fn layered_clues_keep_the_largest_multiplicity_at_each_corner() {
        let mut explicit = VariantPuzzle::classic([0; CELLS]);
        explicit.rules = vec![clue(20, &[2, 2, 6]), clue(23, &[6])];
        let mut layered = explicit.clone();
        layered.rules = vec![
            clue(20, &[6]),
            clue(23, &[6]),
            clue(20, &[2, 2]),
            clue(20, &[2]),
        ];
        assert_eq!(generation_key(&explicit), generation_key(&layered));
        layered.rules.remove(2);
        assert_ne!(generation_key(&explicit), generation_key(&layered));
        layered.rules.push(clue(23, &[2, 2]));
        assert_ne!(generation_key(&explicit), generation_key(&layered));
    }

    #[test]
    fn unseen_digits_can_be_renamed_when_every_companion_preserves_their_meaning() {
        let mut explicit = VariantPuzzle::classic([0; CELLS]);
        explicit.givens[0] = 9;
        explicit.givens[5] = 4;
        explicit.rules = vec![
            clue(20, &[3, 2, 2]),
            clue(23, &[3, 5]),
            clue(38, &[9, 5, 2]),
            PuzzleRule::Diagonal {
                diagonal: Diagonal::Main,
            },
        ];
        let mut renamed = explicit.clone();
        let permutation = [0, 4, 9, 7, 5, 2, 3, 8, 1, 6];
        renamed.givens = renamed.givens.map(|d| permutation[usize::from(d)]);
        for rule in &mut renamed.rules {
            if let PuzzleRule::Quadruple { digits, .. } = rule {
                for digit in digits {
                    *digit = permutation[usize::from(*digit)];
                }
            }
        }
        assert_eq!(generation_key(&explicit), generation_key(&renamed));

        let companion = PuzzleRule::AdjacentTotal {
            cells: [6, 7],
            sum: 11,
        };
        explicit.rules.push(companion.clone());
        renamed.rules.push(companion);
        assert_ne!(generation_key(&explicit), generation_key(&renamed));
    }

    #[test]
    fn unseen_digit_order_breaks_first_corner_ties_at_the_next_corner() {
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.givens[0] = 2;
        puzzle.rules = vec![
            clue(23, &[3, 3, 9]),
            clue(20, &[6, 3, 2]),
            clue(38, &[6, 9]),
        ];
        rename(&mut puzzle);
        assert_eq!(puzzle.givens[0], 1);
        assert_eq!(
            puzzle.rules,
            vec![
                clue(23, &[2, 2, 4]),
                clue(20, &[1, 2, 3]),
                clue(38, &[3, 4])
            ]
        );
    }
}
