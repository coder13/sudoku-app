//! Bounded assignments for a binary clue and explicit all-different houses.

use super::PairClue;
use crate::{
    Board, CELLS,
    hints::{digit_bit, digits},
};

impl PairClue {
    /// Unknown work never certifies a removal. The caller records every house
    /// used to construct `peers`; other puzzle rules are deliberately absent.
    pub fn house_support(
        &self,
        domains: &[u16; CELLS],
        peers: &[u128; CELLS],
        budget: u32,
    ) -> Option<([u16; CELLS], u32)> {
        let mut search = Assignments {
            clue: self,
            domains,
            peers,
            values: [0; CELLS],
            supported: [0; CELLS],
            remaining: budget,
            assignments: 0,
        };
        search
            .visit(0)
            .then_some((search.supported, search.assignments))
    }
}

struct Assignments<'a> {
    clue: &'a PairClue,
    domains: &'a [u16; CELLS],
    peers: &'a [u128; CELLS],
    values: Board,
    supported: [u16; CELLS],
    remaining: u32,
    assignments: u32,
}

impl Assignments<'_> {
    fn visit(&mut self, depth: usize) -> bool {
        if self.remaining == 0 {
            return false;
        }
        self.remaining -= 1;
        if depth == self.clue.cells.len() {
            self.assignments += 1;
            for &cell in &self.clue.cells {
                self.supported[cell] |= digit_bit(self.values[cell]);
            }
            return true;
        }
        let cell = self.clue.cells[depth];
        for digit in digits(self.domains[cell]) {
            if self.clue.cells[..depth].iter().any(|&other| {
                self.peers[cell] & (1u128 << other) != 0 && self.values[other] == digit
            }) {
                continue;
            }
            if self.clue.links.iter().any(|link| {
                let [a, b] = link.cells;
                if a == cell && self.values[b] != 0 {
                    !link.permits(digit, self.values[b])
                } else if b == cell && self.values[a] != 0 {
                    !link.permits(self.values[a], digit)
                } else {
                    false
                }
            }) {
                continue;
            }
            self.values[cell] = digit;
            let complete = self.visit(depth + 1);
            self.values[cell] = 0;
            if !complete {
                return false;
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::variant::pairs::{RuleSource, path};
    use std::sync::Arc;

    #[test]
    fn bounded_support_matches_direct_triples_for_every_middle_domain_and_gap() {
        let source = Arc::new(RuleSource {
            id: "whispers",
            indices: vec![0],
        });
        for gap in 1..=8 {
            let clue = path(&source, &[0, 10, 20], |a, b| a.abs_diff(b) >= gap);
            for ends in [0b1100, 0b10001100, 0b1111] {
                for middle in 1..=511 {
                    let mut domains = [0; CELLS];
                    domains[0] = ends;
                    domains[10] = middle;
                    domains[20] = ends;
                    for distinct in [false, true] {
                        let mut peers = [0u128; CELLS];
                        if distinct {
                            peers[0] = 1 << 20;
                            peers[20] = 1;
                        }
                        let mut expected = [0; CELLS];
                        let mut count = 0;
                        // Independent product enumeration; no detector link tables.
                        for a in 1u8..=9 {
                            for b in 1u8..=9 {
                                for c in 1u8..=9 {
                                    if ends & (1 << (a - 1)) == 0
                                        || middle & (1 << (b - 1)) == 0
                                        || ends & (1 << (c - 1)) == 0
                                        || a.abs_diff(b) < gap
                                        || b.abs_diff(c) < gap
                                        || distinct && a == c
                                    {
                                        continue;
                                    }
                                    expected[0] |= 1 << (a - 1);
                                    expected[10] |= 1 << (b - 1);
                                    expected[20] |= 1 << (c - 1);
                                    count += 1;
                                }
                            }
                        }
                        assert_eq!(
                            clue.house_support(&domains, &peers, 4096),
                            Some((expected, count))
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn an_exhausted_assignment_search_never_returns_partial_negative_support() {
        let source = Arc::new(RuleSource {
            id: "whispers",
            indices: vec![0],
        });
        let clue = path(&source, &[0, 10, 20], |a, b| a.abs_diff(b) >= 5);
        let mut domains = [0; CELLS];
        domains[0] = 12;
        domains[10] = 384;
        domains[20] = 12;
        let mut peers = [0; CELLS];
        peers[0] = 1 << 20;
        peers[20] = 1;
        assert_eq!(clue.house_support(&domains, &peers, 0), None);
        assert_eq!(clue.house_support(&domains, &peers, 3), None);
        assert_eq!(clue.house_support(&domains, &peers, 100).unwrap().1, 2);
    }
}
