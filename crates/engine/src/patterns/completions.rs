//! Bounded masked completions certify support. Failed searches certify nothing.

use crate::{Board, CELLS, Units};

pub(super) trait Domains {
    fn available(&self, cell: usize) -> u16;
    fn toggle(&mut self, cell: usize, bit: u16);
}

impl Domains for Units {
    fn available(&self, cell: usize) -> u16 {
        Units::available(self, cell)
    }

    fn toggle(&mut self, cell: usize, bit: u16) {
        Units::toggle(self, cell, bit);
    }
}

pub(super) fn complete(
    board: &mut Board,
    domains: &mut impl Domains,
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
        let mask = domains.available(cell) & allowed[cell];
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
        domains.toggle(cell, bit);
        if complete(board, domains, allowed, budget) {
            return true;
        }
        domains.toggle(cell, bit);
    }
    board[cell] = 0;
    false
}
