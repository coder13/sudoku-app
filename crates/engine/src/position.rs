use super::hints::digit_bit;
use super::{
    Analysis, Board, CELLS, DIGITS, HintAction, House, SEARCH_LIMIT, analyze_with_budget,
    candidates, solve,
};

/// A replayable position. Empty entries leave the givens unchanged.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PositionSnapshot {
    /// Fixed starting digits.
    pub givens: Board,
    /// Digits placed since the start. Zero leaves the given unchanged.
    pub entries: Board,
    /// Established candidate removals, with bits 0–8 for digits 1–9.
    pub eliminations: [u16; CELLS],
}

impl PositionSnapshot {
    /// Start from a set of givens with no placements or candidate removals.
    pub fn new(givens: Board) -> Self {
        Self {
            givens,
            entries: [0; CELLS],
            eliminations: [0; CELLS],
        }
    }

    /// Merge givens and placed digits and check for out-of-range or overwritten digits.
    ///
    /// Use [`crate::analyze`] to check house conflicts or uniqueness on the merged grid.
    pub fn values(&self) -> Result<Board, Analysis> {
        let mut board = self.givens;
        for (cell, &entry) in board.iter_mut().zip(&self.entries) {
            if entry > 9 || *cell > 9 || (*cell != 0 && entry != 0 && *cell != entry) {
                return Err(Analysis::Conflict);
            }
            if entry != 0 {
                *cell = entry;
            }
        }
        Ok(board)
    }

    pub(crate) fn removals(&self) -> Option<&[u16; CELLS]> {
        self.eliminations
            .iter()
            .any(|&mask| mask != 0)
            .then_some(&self.eliminations)
    }

    pub(crate) fn record_actions(&mut self, actions: &[HintAction]) {
        for &action in actions {
            match action {
                HintAction::Place(candidate) => self.entries[candidate.cell] = candidate.digit,
                HintAction::Eliminate(candidate) => {
                    self.eliminations[candidate.cell] |= digit_bit(candidate.digit);
                }
            }
        }
    }
}

#[derive(Clone)]
pub(crate) struct Position {
    board: Board,
    masks: [u16; CELLS],
    remaining: usize,
    uniqueness: Uniqueness,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum Uniqueness {
    Unchecked,
    Proven,
    SearchLimit,
}

impl Position {
    pub(crate) fn new(board: &Board) -> Result<Self, Analysis> {
        let masks = candidates(board).ok_or(Analysis::Conflict)?;
        let remaining = board.iter().filter(|&&digit| digit == 0).count();
        Ok(Self {
            board: *board,
            masks,
            remaining,
            uniqueness: if remaining == 0 {
                Uniqueness::Proven
            } else {
                Uniqueness::Unchecked
            },
        })
    }

    /// Use only for inputs backed by a uniqueness proof, such as verified templates.
    pub(crate) fn known_unique(board: &Board) -> Self {
        let mut position = Self::new(board).expect("a verified puzzle has legal candidates");
        position.uniqueness = Uniqueness::Proven;
        position
    }

    pub(crate) fn board(&self) -> &Board {
        &self.board
    }

    pub(crate) fn masks(&self) -> &[u16; CELLS] {
        &self.masks
    }

    pub(crate) fn is_solved(&self) -> bool {
        self.remaining == 0
    }

    pub(crate) fn check_consistency(&self) -> Result<(), Analysis> {
        if !self.is_solved()
            && self
                .board
                .iter()
                .zip(self.masks)
                .any(|(&digit, mask)| digit == 0 && mask == 0)
        {
            return Err(Analysis::Unsolvable);
        }
        Ok(())
    }

    pub(crate) fn verify_unique(&mut self) -> Result<(), Analysis> {
        // Before the first uniqueness-dependent step, deductions preserve all solutions.
        // A completed path proves uniqueness. Otherwise, count on the reduced board.
        if self.uniqueness_deferred() && !self.is_solved() {
            self.check_consistency()?;
            return Err(Analysis::SearchLimit);
        }
        if self.try_verify_unique(SEARCH_LIMIT)? {
            Ok(())
        } else {
            self.uniqueness = Uniqueness::SearchLimit;
            Err(Analysis::SearchLimit)
        }
    }

    /// A bounded probe leaves later verification available when it runs out of nodes.
    pub(crate) fn try_verify_unique(&mut self, budget: u32) -> Result<bool, Analysis> {
        if self.uniqueness != Uniqueness::Proven && !self.is_solved() {
            self.check_consistency()?;
            match analyze_with_budget(&self.board, budget) {
                Analysis::Unique => {}
                Analysis::SearchLimit => return Ok(false),
                error => return Err(error),
            }
        }
        self.uniqueness = Uniqueness::Proven;
        Ok(true)
    }

    pub(crate) fn uniqueness_deferred(&self) -> bool {
        self.uniqueness == Uniqueness::SearchLimit
    }

    pub(crate) fn verified_solution(&self) -> Option<Board> {
        debug_assert!(self.uniqueness == Uniqueness::Proven);
        if self.is_solved() {
            Some(self.board)
        } else {
            solve(&self.board)
        }
    }

    pub(crate) fn retain_eliminations(
        &mut self,
        removals: &[u16; CELLS],
        solution: &Board,
    ) -> bool {
        if removals.iter().enumerate().any(|(cell, &mask)| {
            mask & !DIGITS != 0 || (self.board[cell] == 0 && mask & digit_bit(solution[cell]) != 0)
        }) {
            return false;
        }
        for (mask, removed) in self.masks.iter_mut().zip(removals) {
            *mask &= !removed;
        }
        true
    }

    pub(crate) fn apply(&mut self, actions: &[HintAction]) {
        for &action in actions {
            match action {
                HintAction::Place(candidate) => {
                    let bit = digit_bit(candidate.digit);
                    debug_assert_ne!(self.masks[candidate.cell] & bit, 0);
                    self.board[candidate.cell] = candidate.digit;
                    if self.uniqueness_deferred() {
                        self.uniqueness = Uniqueness::Unchecked;
                    }
                    self.remaining -= 1;
                    self.masks[candidate.cell] = 0;
                    for cell in House::at(candidate.cell).into_iter().flat_map(House::cells) {
                        self.masks[cell] &= !bit;
                    }
                }
                HintAction::Eliminate(candidate) => {
                    let bit = digit_bit(candidate.digit);
                    debug_assert_ne!(self.masks[candidate.cell] & bit, 0);
                    self.masks[candidate.cell] &= !bit;
                }
            }
        }
    }
}
