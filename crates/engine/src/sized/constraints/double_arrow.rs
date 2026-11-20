use crate::variant::{reachable_sums, sum_support_with_prefix};

use super::{MAX_SIZE, SizedGrid};
use crate::sized::NO_REGION;

const SHORT_ARROW_CELLS: usize = 5;

#[derive(Debug)]
pub(super) struct DoubleArrow {
    pub(super) ends: [usize; 2],
    pub(super) cells: Vec<usize>,
    peers: [u8; SHORT_ARROW_CELLS],
}

impl DoubleArrow {
    pub(super) fn compile(layout: &SizedGrid, ends: [usize; 2], cells: &[usize]) -> Option<Self> {
        if ends[0] == ends[1]
            || ends.iter().any(|&cell| cell >= layout.cell_count())
            || !(1..=2 * layout.size()).contains(&cells.len())
            || cells.iter().enumerate().any(|(index, &cell)| {
                cell >= layout.cell_count() || ends.contains(&cell) || cells[..index].contains(&cell)
            })
        {
            return None;
        }

        let mut peers = [0; SHORT_ARROW_CELLS];
        if cells.len() + 2 <= SHORT_ARROW_CELLS && layout.size() <= 9 {
            let involved = ends.iter().chain(cells);
            for (left, &a) in involved.clone().enumerate() {
                for (offset, &b) in involved.clone().skip(left + 1).enumerate() {
                    let right = left + 1 + offset;
                    if layout.memberships[a].iter().any(|house| {
                        *house != NO_REGION && layout.memberships[b].contains(house)
                    }) {
                        peers[left] |= 1 << right;
                    }
                }
            }
        }
        Some(Self { ends, cells: cells.to_vec(), peers })
    }

    pub(super) fn support(&self, candidates: &[u16]) -> ([u16; 2], [u16; 2 * MAX_SIZE]) {
        let end_domains = self.ends.map(|cell| candidates[cell]);
        let mut line_domains = [0; 2 * MAX_SIZE];
        let mut line_support = [0; 2 * MAX_SIZE];
        let mut end_support = [0; 2];
        let len = self.cells.len();
        for (&cell, domain) in self.cells.iter().zip(&mut line_domains) {
            *domain = candidates[cell];
        }

        // Only the totals of two endpoint digits are relevant, even for long lines.
        let end_totals = reachable_sums(&end_domains);
        let matched = sum_support_with_prefix(
            &line_domains[..len], end_totals, &mut line_support[..len], &mut [[0u128; 1]; 2 * MAX_SIZE + 1],
        );
        sum_support_with_prefix(&end_domains, matched, &mut end_support, &mut [[0]; 3]);

        (end_support, line_support)
    }

    pub(super) fn hint_support(&self, candidates: &[u16]) -> ([u16; 2], [u16; 2 * MAX_SIZE]) {
        let (mut end_support, mut line_support) = self.support(candidates);
        let len = self.cells.len();
        if end_support[0] != 0 && self.peers.iter().any(|&mask| mask != 0) {
            let mut domains = [0; SHORT_ARROW_CELLS];
            domains[..2].copy_from_slice(&end_support);
            domains[2..2 + len].copy_from_slice(&line_support[..len]);
            let mut search = ShortArrowSupport { target: domains, peers: self.peers, supported: [0; SHORT_ARROW_CELLS] };
            search.visit(&domains[..len + 2], 0, 0);
            end_support.copy_from_slice(&search.supported[..2]);
            line_support[..len].copy_from_slice(&search.supported[2..2 + len]);
        }
        (end_support, line_support)
    }
}

struct ShortArrowSupport {
    target: [u16; SHORT_ARROW_CELLS],
    peers: [u8; SHORT_ARROW_CELLS],
    supported: [u16; SHORT_ARROW_CELLS],
}

impl ShortArrowSupport {
    fn visit(&mut self, domains: &[u16], index: usize, remaining: i32) {
        if index == domains.len() {
            if remaining == 0 {
                for (mask, digit) in self.supported.iter_mut().zip(domains) {
                    *mask |= digit;
                }
            }
            return;
        }
        let mut choices = domains[index];
        'choices: while choices != 0 && self.supported != self.target {
            let bit = choices & choices.wrapping_neg();
            choices ^= bit;
            let digit = bit.trailing_zeros() as i32 + 1;
            let remaining = if index < 2 { remaining + digit } else { remaining - digit };

            let mut next = [0; SHORT_ARROW_CELLS];
            next[..domains.len()].copy_from_slice(domains);
            next[index] = bit;
            let mut min = 0;
            let mut max = 0;
            for (other, mask) in next[..domains.len()].iter_mut().enumerate().skip(index + 1) {
                if self.peers[index] & (1 << other) != 0 {
                    *mask &= !bit;
                }
                if *mask == 0 {
                    continue 'choices;
                }
                let low = mask.trailing_zeros() as i32 + 1;
                let high = u16::BITS as i32 - mask.leading_zeros() as i32;
                if other < 2 {
                    min -= high;
                    max -= low;
                } else {
                    min += low;
                    max += high;
                }
            }
            if min <= remaining && remaining <= max {
                self.visit(&next[..domains.len()], index + 1, remaining);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_endpoint_digits_are_ruled_out_when_the_ends_share_a_house() {
        let grid = SizedGrid::without_regions(4).unwrap();
        let domains = [0b1111; 16];
        let same_row = DoubleArrow::compile(&grid, [0, 1], &[2]).unwrap();
        let separate = DoubleArrow::compile(&grid, [0, 5], &[10]).unwrap();

        // A sum of 2 requires both endpoints to be 1.
        assert_eq!(same_row.support(&domains).1[0], 0b1110);
        assert_eq!(same_row.hint_support(&domains).1[0], 0b1100);
        assert_eq!(separate.hint_support(&domains).1[0], 0b1110);
    }
}
