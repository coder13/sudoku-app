use super::VariantDefinitionError;
use crate::{Board, CELLS, hints::digit_bit};

/// The eight three-cell lines in a validated 3 × 3 Magic Square.
#[derive(Clone, Debug)]
pub(super) struct CompiledMagicSquare {
    lines: [[usize; 3]; 8],
}

impl CompiledMagicSquare {
    pub fn compile(rule: usize, cells: &[usize]) -> Result<Self, VariantDefinitionError> {
        let invalid = || VariantDefinitionError::InvalidRule(rule);
        if cells.len() != 9 || cells.iter().any(|&cell| cell >= CELLS) {
            return Err(invalid());
        }
        let mut ordered = cells.to_vec();
        ordered.sort_unstable();
        ordered.dedup();
        if ordered.len() != 9 {
            return Err(invalid());
        }
        let min_row = cells
            .iter()
            .map(|cell| cell / 9)
            .min()
            .ok_or_else(invalid)?;
        let max_row = cells
            .iter()
            .map(|cell| cell / 9)
            .max()
            .ok_or_else(invalid)?;
        let min_col = cells
            .iter()
            .map(|cell| cell % 9)
            .min()
            .ok_or_else(invalid)?;
        let max_col = cells
            .iter()
            .map(|cell| cell % 9)
            .max()
            .ok_or_else(invalid)?;
        if max_row - min_row != 2 || max_col - min_col != 2 {
            return Err(invalid());
        }
        let expected: Vec<_> = (min_row..=max_row)
            .flat_map(|row| (min_col..=max_col).map(move |column| row * 9 + column))
            .collect();
        if ordered != expected {
            return Err(invalid());
        }
        let rows: [[usize; 3]; 3] = std::array::from_fn(|row| {
            std::array::from_fn(|column| (min_row + row) * 9 + min_col + column)
        });
        let columns: [[usize; 3]; 3] = std::array::from_fn(|column| {
            std::array::from_fn(|row| (min_row + row) * 9 + min_col + column)
        });
        let diagonals = [
            std::array::from_fn(|index| (min_row + index) * 9 + min_col + index),
            std::array::from_fn(|index| (min_row + index) * 9 + min_col + 2 - index),
        ];
        Ok(Self {
            lines: [
                rows[0],
                rows[1],
                rows[2],
                columns[0],
                columns[1],
                columns[2],
                diagonals[0],
                diagonals[1],
            ],
        })
    }

    /// Intersect each line's domains with triples that sum to 15.
    pub fn restrict(&self, board: &Board, masks: &mut [u16; CELLS]) -> Result<bool, ()> {
        let mut changed = false;
        for line in self.lines {
            let domains = line.map(|cell| {
                if board[cell] == 0 {
                    masks[cell]
                } else {
                    digit_bit(board[cell])
                }
            });
            let mut supported = [0; 3];
            for first in 1..=9 {
                if domains[0] & digit_bit(first) == 0 {
                    continue;
                }
                for second in 1..=9 {
                    if domains[1] & digit_bit(second) == 0 {
                        continue;
                    }
                    let third = 15i16 - first as i16 - second as i16;
                    if !(1..=9).contains(&third) || domains[2] & digit_bit(third as u8) == 0 {
                        continue;
                    }
                    supported[0] |= digit_bit(first);
                    supported[1] |= digit_bit(second);
                    supported[2] |= digit_bit(third as u8);
                }
            }
            for ((cell, support), domain) in line.into_iter().zip(supported).zip(domains) {
                if support == 0 {
                    return Err(());
                }
                if board[cell] == 0 {
                    let next = masks[cell] & support;
                    if next == 0 {
                        return Err(());
                    }
                    changed |= next != domain;
                    masks[cell] = next;
                }
            }
        }
        Ok(changed)
    }

    pub fn permits(&self, board: &Board) -> bool {
        self.lines
            .iter()
            .all(|line| line.iter().map(|&cell| board[cell] as u16).sum::<u16>() == 15)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Analysis, DIGITS, PuzzleRule, VariantPuzzle};

    const SQUARE: [usize; 9] = [30, 31, 32, 39, 40, 41, 48, 49, 50];
    const SOLUTION: &str =
        "748521396659387124312946785591834672267159438483672519124795863936418257875263941";

    fn puzzle(cells: Vec<usize>) -> VariantPuzzle {
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.rules.push(PuzzleRule::MagicSquare { cells });
        puzzle
    }

    #[test]
    fn accepts_coach_magic_square_solution_and_rejects_invalid_line() {
        let compiled = puzzle(SQUARE.to_vec()).compile().unwrap();
        let board = std::array::from_fn(|cell| SOLUTION.as_bytes()[cell] - b'0');
        assert!(compiled.magic_squares[0].permits(&board));
        assert_eq!(
            compiled.analyze(&board, &[0; CELLS], 100).unwrap(),
            Analysis::Unique
        );
        let mut broken = board;
        broken[40] = 9;
        assert!(!compiled.magic_squares[0].permits(&broken));
    }

    #[test]
    fn rejects_a_valid_sudoku_completion_that_breaks_the_magic_square() {
        let compiled = puzzle(SQUARE.to_vec()).compile().unwrap();
        let ordinary = std::array::from_fn(|cell| {
            let row = cell / 9;
            let column = cell % 9;
            ((row * 3 + row / 3 + column) % 9 + 1) as u8
        });
        assert!(!compiled.magic_squares[0].permits(&ordinary));
        assert_eq!(
            compiled.analyze(&ordinary, &[0; CELLS], 100).unwrap(),
            Analysis::Unsolvable
        );
    }

    #[test]
    fn rejects_non_square_and_duplicate_cell_sets() {
        assert!(
            puzzle(vec![0, 1, 2, 9, 10, 11, 18, 19, 20])
                .compile()
                .is_ok()
        );
        assert!(
            puzzle(vec![0, 1, 2, 9, 10, 11, 18, 19, 21])
                .compile()
                .is_err()
        );
        let mut duplicate = SQUARE.to_vec();
        duplicate[8] = duplicate[7];
        assert!(puzzle(duplicate).compile().is_err());
    }

    #[test]
    fn line_propagation_enforces_fifteen() {
        let square = CompiledMagicSquare::compile(0, &SQUARE).unwrap();
        let mut masks = [DIGITS; CELLS];
        masks[30] = digit_bit(8);
        masks[31] = digit_bit(1);
        masks[32] = digit_bit(1) | digit_bit(6);
        assert!(square.restrict(&[0; CELLS], &mut masks).unwrap());
        assert_eq!(masks[32], digit_bit(6));
    }
}
