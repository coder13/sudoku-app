//! Bounded searches supply witnesses, never deductions or impossibility claims.
//!
//! A witness satisfies the standard houses and supplied masks used by the
//! Classic forcing graph. It does not establish any additional variant rule.

use crate::{Board, CELLS, Candidate};
#[cfg(feature = "variants")]
use crate::{DIGITS, Units};

#[cfg(feature = "variants")]
const NODES_PER_PROBE: u32 = 128;

pub(super) struct Search<'a> {
    solution: Option<&'a Board>,
    #[cfg(feature = "variants")]
    probes: Probes<'a>,
}

impl<'a> Search<'a> {
    pub(super) fn new(
        board: &'a Board,
        masks: &'a [u16; CELLS],
        solution: Option<&'a Board>,
        nodes: u32,
    ) -> Self {
        #[cfg(not(feature = "variants"))]
        let _ = (board, masks, nodes);
        Self {
            solution,
            #[cfg(feature = "variants")]
            probes: Probes::new(board, masks, nodes),
        }
    }

    pub(super) fn satisfies(&mut self, candidate: Candidate, positive: bool) -> bool {
        if self
            .solution
            .is_some_and(|solution| (solution[candidate.cell] == candidate.digit) == positive)
        {
            return true;
        }
        #[cfg(feature = "variants")]
        {
            self.probes.satisfies(candidate, positive)
        }
        #[cfg(not(feature = "variants"))]
        {
            false
        }
    }
}

#[cfg(feature = "variants")]
struct Probes<'a> {
    board: &'a Board,
    masks: &'a [u16; CELLS],
    present: [u16; CELLS],
    absent: [u16; CELLS],
    remaining: u32,
}

#[cfg(feature = "variants")]
impl<'a> Probes<'a> {
    fn new(board: &'a Board, masks: &'a [u16; CELLS], nodes: u32) -> Self {
        Self {
            board,
            masks,
            present: [0; CELLS],
            absent: [0; CELLS],
            remaining: nodes,
        }
    }

    fn record(&mut self, solution: &Board) {
        for (cell, &digit) in solution.iter().enumerate() {
            let bit = 1 << (digit - 1);
            self.present[cell] |= bit;
            self.absent[cell] |= self.masks[cell] & !bit;
        }
    }

    pub(super) fn satisfies(&mut self, candidate: Candidate, positive: bool) -> bool {
        let bit = 1 << (candidate.digit - 1);
        let known = if positive {
            self.present[candidate.cell]
        } else {
            self.absent[candidate.cell]
        };
        if known & bit != 0 {
            return true;
        }
        if self.remaining == 0 {
            return false;
        }
        let mut allowed = *self.masks;
        allowed[candidate.cell] &= if positive { bit } else { DIGITS & !bit };
        let mut budget = self.remaining.min(NODES_PER_PROBE);
        let start = budget;
        let mut board = *self.board;
        let found = Units::from_board(&board)
            .is_some_and(|mut units| complete(&mut board, &mut units, &allowed, &mut budget));
        self.remaining -= start - budget;
        if found {
            self.record(&board);
        }
        found
    }
}

#[cfg(feature = "variants")]
fn complete(
    board: &mut Board,
    units: &mut Units,
    allowed: &[u16; CELLS],
    budget: &mut u32,
) -> bool {
    let Some(remaining) = budget.checked_sub(1) else {
        return false;
    };
    *budget = remaining;
    let mut next = None;
    let mut fewest = 10;
    for (cell, &digit) in board.iter().enumerate() {
        if digit != 0 {
            continue;
        }
        let mask = units.available(cell) & allowed[cell];
        let count = mask.count_ones();
        if count == 0 {
            return false;
        }
        if count < fewest {
            next = Some((cell, mask));
            fewest = count;
        }
    }
    let Some((cell, mut choices)) = next else {
        return true;
    };
    while choices != 0 && *budget != 0 {
        let bit = choices & choices.wrapping_neg();
        choices ^= bit;
        board[cell] = bit.trailing_zeros() as u8 + 1;
        units.toggle(cell, bit);
        if complete(board, units, allowed, budget) {
            return true;
        }
        units.toggle(cell, bit);
    }
    board[cell] = 0;
    false
}

#[cfg(all(test, feature = "variants"))]
mod tests {
    use super::*;

    fn check_completion(board: &Board, givens: &Board, allowed: &[u16; CELLS]) {
        for cell in 0..CELLS {
            assert!((1..=9).contains(&board[cell]));
            if givens[cell] != 0 {
                assert_eq!(board[cell], givens[cell]);
            } else {
                assert_ne!(allowed[cell] & (1 << (board[cell] - 1)), 0);
            }
        }
        for house in crate::House::all() {
            let mut digits: Vec<_> = house.cells().into_iter().map(|cell| board[cell]).collect();
            digits.sort_unstable();
            assert_eq!(digits, (1..=9).collect::<Vec<_>>());
        }
    }

    #[test]
    fn witnesses_respect_supplied_domains_and_leave_the_source_unchanged() {
        let givens = [0; CELLS];
        let mut allowed = [DIGITS; CELLS];
        allowed[0] = 1 << 4;
        allowed[80] &= !(1 << 8);
        let mut work = givens;
        let mut units = Units::from_board(&givens).unwrap();
        let mut budget = 4096;
        assert!(complete(&mut work, &mut units, &allowed, &mut budget));
        check_completion(&work, &givens, &allowed);
        assert_eq!(work[0], 5);
        assert_ne!(work[80], 9);
        assert_eq!(givens, [0; CELLS]);
    }

    #[test]
    fn alternative_witnesses_support_positive_and_negative_assumptions() {
        let board = [0; CELLS];
        let masks = [DIGITS; CELLS];
        let mut search = Search::new(&board, &masks, None, 4096);
        for digit in 1..=9 {
            assert!(search.satisfies(Candidate { cell: 0, digit }, true));
            assert!(search.satisfies(Candidate { cell: 0, digit }, false));
        }
    }

    #[test]
    fn an_existing_completion_remains_usable_without_a_probe_budget() {
        let mut board = [0; CELLS];
        board[40] = 5;
        let solution = crate::solve(&board).unwrap();
        let masks = crate::candidates(&board).unwrap();
        let mut search = Search::new(&board, &masks, Some(&solution), 0);
        for cell in 0..CELLS {
            for digit in 1..=9 {
                if masks[cell] & (1 << (digit - 1)) == 0 {
                    continue;
                }
                let candidate = Candidate { cell, digit };
                assert_eq!(search.satisfies(candidate, true), solution[cell] == digit);
                assert_eq!(search.satisfies(candidate, false), solution[cell] != digit);
            }
        }
        assert_eq!(search.probes.remaining, 0);
    }

    #[test]
    fn incomplete_probes_never_witness_an_assumption_or_change_the_grid() {
        let board = [0; CELLS];
        let masks = [DIGITS; CELLS];
        for budget in [0, 1] {
            let mut search = Search::new(&board, &masks, None, budget);
            assert!(!search.satisfies(Candidate { cell: 0, digit: 1 }, true));
            assert!(!search.satisfies(Candidate { cell: 0, digit: 1 }, false));
            assert_eq!(search.probes.remaining, 0);
            assert_eq!(search.probes.present, [0; CELLS]);
            assert_eq!(search.probes.absent, [0; CELLS]);
        }
        let mut work = board;
        let mut budget = 1;
        assert!(!complete(
            &mut work,
            &mut Units::default(),
            &masks,
            &mut budget
        ));
        assert_eq!(work, board);
    }

    #[test]
    fn an_impossible_domain_cannot_supply_a_witness() {
        let board = [0; CELLS];
        let mut masks = [DIGITS; CELLS];
        masks[0] = 1;
        masks[1] = 1;
        let mut search = Search::new(&board, &masks, None, 4096);
        assert!(!search.satisfies(Candidate { cell: 0, digit: 1 }, true));
        assert!(!search.satisfies(Candidate { cell: 0, digit: 1 }, false));
        assert_eq!(search.probes.present, [0; CELLS]);
    }
}
