//! Combine the remainder groups of a Modular line with a positive two-cell sum.

use super::{LineConstraint, LineKind, PuzzleRule};

#[derive(Clone, Debug)]
pub(in crate::variant) struct ModularSum {
    /// The line rule followed by the sum rule, in proof order.
    pub rules: [usize; 2],
    /// Sum endpoints first, followed by the other distinct cells of the line.
    pub cells: Vec<usize>,
    pub allowed: Vec<u16>,
}

impl ModularSum {
    /// Compile after all rule indices, cells and totals have been validated.
    pub fn compile(lines: &[LineConstraint], rules: &[PuzzleRule]) -> Vec<Self> {
        let mut modular = lines
            .iter()
            .filter(|line| line.rule_id == "modular")
            .peekable();
        if modular.peek().is_none() {
            return Vec::new();
        }
        let mut sums = Vec::new();
        for (index, rule) in rules.iter().enumerate() {
            match rule {
                PuzzleRule::AdjacentTotal { cells, sum } => sums.push((index, *cells, *sum)),
                PuzzleRule::Xv { five, ten } => {
                    sums.extend(five.pairs.iter().map(|&cells| (index, cells, 5)));
                    sums.extend(ten.pairs.iter().map(|&cells| (index, cells, 10)));
                }
                _ => {}
            }
        }
        let mut compiled = Vec::new();
        for line in modular {
            for &(rule, pair, sum) in &sums {
                if let Some(joined) = Self::for_pair(line, rule, pair, sum) {
                    compiled.push(joined);
                }
            }
        }
        compiled
    }

    fn for_pair(line: &LineConstraint, rule: usize, pair: [usize; 2], sum: u8) -> Option<Self> {
        let LineKind::ThreeGroups(groups) = &line.kind else {
            return None;
        };
        let [a, b] = pair;
        let left = line.cells.iter().position(|&cell| cell == a)?;
        let right = line.cells.iter().position(|&cell| cell == b)?;
        let groups = groups.modular_sum_groups(left, right, sum)?;
        let mut cells = vec![a, b];
        let mut allowed = vec![groups[left], groups[right]];
        for (index, (&cell, mask)) in line.cells.iter().zip(groups).enumerate() {
            if index != left && index != right {
                cells.push(cell);
                allowed.push(mask);
            }
        }
        Some(Self {
            rules: [line.rule_index, rule],
            cells,
            allowed,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        CELLS, DIGITS,
        variant::{MarkedPairs, PuzzleRule, VariantPuzzle},
    };

    fn line(cells: &[usize]) -> PuzzleRule {
        PuzzleRule::Modular {
            cells: cells.to_vec(),
        }
    }

    #[test]
    fn all_two_cell_totals_respect_digit_assignments_in_each_group_order() {
        let endpoints = [0, 1];
        for path in [[0, 1, 10, 9, 20, 19], [0, 10, 9, 1, 20, 19]] {
            for sum in 3..=17 {
                let mut puzzle = VariantPuzzle::classic([0; CELLS]);
                puzzle.rules = vec![
                    PuzzleRule::AdjacentTotal {
                        cells: endpoints,
                        sum,
                    },
                    line(&path),
                ];
                let compiled = puzzle.compile().unwrap();
                let [clue] = compiled.modular_sums.as_slice() else {
                    panic!("Expected one sum on the line")
                };
                assert_eq!(clue.rules, [1, 0]);
                assert_eq!(&clue.cells[..2], &endpoints);

                // Check every ordered pair of digits against each repeating
                // group order. Derive the residues from the digits directly.
                let mut expected = [0; CELLS];
                let left = path.iter().position(|&cell| cell == endpoints[0]).unwrap();
                let right = path.iter().position(|&cell| cell == endpoints[1]).unwrap();
                for a in 1_u8..=9 {
                    for b in 1_u8..=9 {
                        if a == b || a + b != sum {
                            continue;
                        }
                        for first in 0_u8..3 {
                            for second in 0_u8..3 {
                                if first == second {
                                    continue;
                                }
                                let order = [first, second, 3 - first - second];
                                if a % 3 != order[left % 3] || b % 3 != order[right % 3] {
                                    continue;
                                }
                                for (position, &cell) in path.iter().enumerate() {
                                    for digit in 1_u8..=9 {
                                        if digit % 3 == order[position % 3] {
                                            expected[cell] |= 1 << (digit - 1);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                for (&cell, &mask) in clue.cells.iter().zip(&clue.allowed) {
                    assert_eq!(
                        expected[cell] & !mask,
                        0,
                        "{path:?}, sum {sum}, cell {cell}"
                    );
                    assert_ne!(mask, DIGITS);
                    if sum == 7 {
                        assert_eq!(expected[cell], mask);
                    }
                }
            }
        }
    }

    #[test]
    fn only_positive_sums_on_a_consistent_modular_line_supply_proofs() {
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        let marks = PuzzleRule::Xv {
            five: MarkedPairs {
                pairs: vec![[1, 0], [8, 7]],
                negative: true,
            },
            ten: MarkedPairs {
                pairs: vec![],
                negative: true,
            },
        };
        puzzle.rules = vec![line(&[0, 1, 10, 0, 1, 10]), marks];
        let compiled = puzzle.compile().unwrap();
        let [clue] = compiled.modular_sums.as_slice() else {
            panic!("Expected one positive V")
        };
        assert_eq!(clue.rules, [0, 1]);
        assert_eq!(clue.cells, [1, 0, 10]);
        // If two digits from the same group add to 5, both have remainder 1.
        assert_eq!(clue.allowed, [DIGITS & !73, DIGITS & !73, 73]);

        puzzle.rules[0] = PuzzleRule::Entropic {
            cells: vec![0, 1, 10],
        };
        assert!(puzzle.compile().unwrap().modular_sums.is_empty());
        puzzle.rules[0] = line(&[0, 1, 0]);
        assert!(puzzle.compile().unwrap().modular_sums.is_empty());
    }
}
