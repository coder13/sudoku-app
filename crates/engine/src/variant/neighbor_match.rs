//! Clues that require a digit in at least one orthogonal neighbor.

use super::{NeighborMatchClue, VariantDefinitionError};
use crate::{Board, CELLS, hints::digit_bit};

#[derive(Clone, Debug)]
pub(super) struct CompiledNeighborMatch {
    pub digit: u8,
    pub neighbors: Vec<usize>,
}

impl CompiledNeighborMatch {
    pub fn compile(
        rule: usize,
        clues: &[NeighborMatchClue],
    ) -> Result<Vec<Self>, VariantDefinitionError> {
        if clues.is_empty() {
            return Err(VariantDefinitionError::InvalidRule(rule));
        }
        let mut seen = [false; CELLS];
        let mut compiled = Vec::with_capacity(clues.len());
        for clue in clues {
            if clue.cell >= CELLS
                || !(1..=9).contains(&clue.digit)
                || std::mem::replace(&mut seen[clue.cell], true)
            {
                return Err(VariantDefinitionError::InvalidRule(rule));
            }
            let row = clue.cell / 9;
            let column = clue.cell % 9;
            let neighbors = [
                (row > 0).then(|| clue.cell - 9),
                (row < 8).then(|| clue.cell + 9),
                (column > 0).then(|| clue.cell - 1),
                (column < 8).then(|| clue.cell + 1),
            ]
            .into_iter()
            .flatten()
            .collect();
            compiled.push(Self {
                digit: clue.digit,
                neighbors,
            });
        }
        Ok(compiled)
    }

    pub fn permits(&self, board: &Board) -> bool {
        self.neighbors.iter().any(|&cell| board[cell] == self.digit)
    }

    pub fn restrict(&self, board: &Board, masks: &mut [u16; CELLS]) -> Result<bool, ()> {
        if self.neighbors.iter().any(|&cell| board[cell] == self.digit) {
            return Ok(false);
        }
        let bit = digit_bit(self.digit);
        let mut possible = self
            .neighbors
            .iter()
            .copied()
            .filter(|&cell| board[cell] == 0 && masks[cell] & bit != 0);
        let Some(first) = possible.next() else {
            return Err(());
        };
        if possible.next().is_none() && masks[first] != bit {
            masks[first] = bit;
            return Ok(true);
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Analysis, VariantPuzzle, variant::PuzzleRule};

    fn solution() -> Board {
        std::array::from_fn(|cell| {
            let row = cell / 9;
            let column = cell % 9;
            ((row * 3 + row / 3 + column) % 9 + 1) as u8
        })
    }

    fn rule(cell: usize, digit: u8) -> PuzzleRule {
        PuzzleRule::NeighborMatch {
            clues: vec![NeighborMatchClue { cell, digit }],
        }
    }

    #[test]
    fn requires_the_clue_digit_in_an_orthogonal_neighbor_and_propagates_single_support() {
        let mut givens = solution();
        givens[31] = 0;
        let mut puzzle = VariantPuzzle::classic(givens);
        puzzle.rules.push(rule(40, 6));
        let compiled = puzzle.compile().unwrap();
        let masks = compiled.candidates(&[0; CELLS], &[0; CELLS]).unwrap();
        assert_eq!(masks[31], digit_bit(6));

        let impossible = VariantPuzzle::classic(solution());
        let mut impossible = impossible;
        impossible.rules.push(rule(40, 2));
        assert_eq!(
            impossible
                .compile()
                .unwrap()
                .analyze(&[0; CELLS], &[0; CELLS], 1),
            Ok(Analysis::Unsolvable),
        );
    }

    #[test]
    fn rejects_empty_duplicate_invalid_and_edge_clues() {
        for clues in [
            vec![],
            vec![
                NeighborMatchClue { cell: 40, digit: 6 },
                NeighborMatchClue { cell: 40, digit: 6 },
            ],
            vec![NeighborMatchClue { cell: 81, digit: 6 }],
            vec![NeighborMatchClue { cell: 40, digit: 0 }],
        ] {
            let mut puzzle = VariantPuzzle::classic([0; CELLS]);
            puzzle.rules.push(PuzzleRule::NeighborMatch { clues });
            assert!(puzzle.compile().is_err());
        }
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.rules.push(rule(0, 9));
        assert_eq!(
            puzzle.compile().unwrap().neighbor_matches[0]
                .neighbors
                .len(),
            2
        );
    }
}
