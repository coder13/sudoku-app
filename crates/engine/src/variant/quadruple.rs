use super::{CompiledVariant, VariantDefinitionError};
use crate::{
    DIGITS,
    hints::{digit_bit, digits},
};

/// Four cells around an internal grid intersection, in row-major order.
pub(super) fn cells(top_left: usize) -> Option<[usize; 4]> {
    (top_left < 72 && top_left % 9 < 8)
        .then(|| [top_left, top_left + 1, top_left + 9, top_left + 10])
}

#[derive(Clone, Debug)]
pub(super) struct Quadruple {
    pub(super) rule_index: usize,
    pub(super) cells: [usize; 4],
    digits: Vec<u8>,
    peers: [u8; 4],
    placements: Vec<[u16; 4]>,
}

impl Quadruple {
    pub(super) fn compile(
        puzzle: &CompiledVariant,
        rule_index: usize,
        top_left: usize,
        digits: &[u8],
        enforce_regions: bool,
    ) -> Result<Self, VariantDefinitionError> {
        let invalid = VariantDefinitionError::InvalidRule(rule_index);
        let cells = cells(top_left).ok_or(invalid)?;
        if !(1..=4).contains(&digits.len()) || digits.iter().any(|digit| !(1..=9).contains(digit)) {
            return Err(invalid);
        }
        // Rows, columns and active regions supply the local all-different
        // checks. Other clues can contribute separately in a combined proof.
        let peers = cells.map(|a| {
            cells.iter().enumerate().fold(0, |mask, (index, &b)| {
                mask | (u8::from(puzzle.are_primary_peers(a, b, enforce_regions)) << index)
            })
        });
        let mut digits = digits.to_vec();
        digits.sort_unstable();
        let mut placements = Vec::new();
        place_required(&digits, [0; 4], &peers, &mut placements);
        placements.sort_unstable();
        placements.dedup();
        Ok(Self {
            rule_index,
            cells,
            digits,
            peers,
            placements,
        })
    }

    pub(super) fn required_digits(&self) -> u16 {
        self.digits
            .iter()
            .fold(0, |mask, &digit| mask | digit_bit(digit))
    }

    pub(super) fn occurrences(&self, digit: u8) -> u8 {
        self.digits.iter().filter(|&&printed| printed == digit).count() as u8
    }

    pub(super) fn support(&self, domains: [u16; 4]) -> [u16; 4] {
        let mut supported = [0; 4];
        self.scan::<true, false>(domains, &mut supported);
        supported
    }

    pub(super) fn support_with_entropy(&self, domains: [u16; 4]) -> [u16; 4] {
        let mut supported = [0; 4];
        self.scan::<true, true>(domains, &mut supported);
        supported
    }

    pub(super) fn has_assignment(&self, domains: [u16; 4]) -> bool {
        self.scan::<false, false>(domains, &mut [0; 4])
    }

    fn scan<const ALL: bool, const ENTROPY: bool>(
        &self,
        domains: [u16; 4],
        supported: &mut [u16; 4],
    ) -> bool {
        let mut found = false;
        for placement in &self.placements {
            let restricted = std::array::from_fn(|cell| {
                let required = placement[cell];
                domains[cell] & if required == 0 { DIGITS } else { required }
            });
            if assign::<ALL, ENTROPY>(restricted, 0b1111, &self.peers, 0, supported) {
                if !ALL || *supported == domains {
                    return true;
                }
                found = true;
            }
        }
        found
    }
}

fn place_required(required: &[u8], placement: [u16; 4], peers: &[u8; 4], out: &mut Vec<[u16; 4]>) {
    let Some((&digit, rest)) = required.split_first() else {
        out.push(placement);
        return;
    };
    let bit = digit_bit(digit);
    for (cell, &current) in placement.iter().enumerate() {
        if current == 0
            && placement
                .iter()
                .enumerate()
                .all(|(other, &value)| value != bit || peers[cell] & (1 << other) == 0)
        {
            let mut next = placement;
            next[cell] = bit;
            place_required(rest, next, peers, out);
        }
    }
}

fn assign<const ALL: bool, const ENTROPY: bool>(
    mut domains: [u16; 4],
    open: u8,
    peers: &[u8; 4],
    groups: u8,
    supported: &mut [u16; 4],
) -> bool {
    // Keep this fixed-size check inside the recursive hot path instead of
    // relying on the compiler to inline a general slice membership search.
    if domains[0] == 0 || domains[1] == 0 || domains[2] == 0 || domains[3] == 0 {
        return false;
    }
    if open.is_power_of_two() {
        // The last cell can use every digit still available. Each of the
        // other cells already contains its chosen digit.
        if ENTROPY {
            let missing = 0b111 & !groups;
            if missing.count_ones() > 1 {
                return false;
            }
            if missing != 0 {
                let last = open.trailing_zeros() as usize;
                domains[last] &= 0b111 << (missing.trailing_zeros() * 3);
                if domains[last] == 0 {
                    return false;
                }
            }
        }
        if ALL {
            for (mask, domain) in supported.iter_mut().zip(domains) {
                *mask |= domain;
            }
        }
        return true;
    }
    let cell = (0..4)
        .filter(|&cell| open & (1 << cell) != 0)
        .min_by_key(|&cell| domains[cell].count_ones())
        .unwrap();
    let remaining = open & !(1 << cell);
    let mut found = false;
    for digit in digits(domains[cell]) {
        let bit = digit_bit(digit);
        let mut next = domains;
        next[cell] = bit;
        for (other, domain) in next.iter_mut().enumerate() {
            if remaining & peers[cell] & (1 << other) != 0 {
                *domain &= !bit;
            }
        }
        let next_groups = if ENTROPY {
            groups | (1 << ((digit - 1) / 3))
        } else {
            0
        };
        if assign::<ALL, ENTROPY>(next, remaining, peers, next_groups, supported) {
            if !ALL {
                return true;
            }
            found = true;
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Random, VariantPuzzle};

    #[test]
    fn support_matches_direct_assignment_counts_and_house_rules() {
        let puzzle = VariantPuzzle::classic([0; 81]).compile().unwrap();
        let mut random = Random::from_seed(9124);
        for (top_left, required) in [
            (0, &[1][..]),
            (19, &[2, 4, 7, 9]),
            (21, &[2, 2, 6]),
            (0, &[2, 2]),
        ] {
            let clue = Quadruple::compile(&puzzle, 0, top_left, required, true).unwrap();
            let mut counts = [0; 10];
            for &digit in required {
                counts[usize::from(digit)] += 1;
            }
            for empty in 0..4 {
                let mut domains = [DIGITS; 4];
                domains[empty] = 0;
                assert_eq!(clue.support(domains), [0; 4]);
                assert_eq!(clue.support_with_entropy(domains), [0; 4]);
                assert!(!clue.has_assignment(domains));
            }
            for sample in 0..200 {
                let domains = if sample == 0 {
                    [DIGITS; 4]
                } else {
                    std::array::from_fn(|_| random.next() as u16 & DIGITS)
                };
                let mut expected = [0; 4];
                let mut joint = [0; 4];
                for a in digits(domains[0]) {
                    for b in digits(domains[1]) {
                        for c in digits(domains[2]) {
                            for d in digits(domains[3]) {
                                let placed = [a, b, c, d];
                                let repeats_in_house = (0..4).any(|first| {
                                    (first + 1..4).any(|second| {
                                        placed[first] == placed[second]
                                            && puzzle
                                                .peers(clue.cells[first])
                                                .unwrap()
                                                .any(|peer| peer == clue.cells[second])
                                    })
                                });
                                if repeats_in_house {
                                    continue;
                                }
                                let mut present = [0; 10];
                                for digit in placed {
                                    present[usize::from(digit)] += 1;
                                }
                                if present
                                    .into_iter()
                                    .zip(counts)
                                    .all(|(found, count)| found >= count)
                                {
                                    for (mask, digit) in expected.iter_mut().zip(placed) {
                                        *mask |= digit_bit(digit);
                                    }
                                    if placed.iter().any(|&digit| digit <= 3)
                                        && placed.iter().any(|&digit| (4..=6).contains(&digit))
                                        && placed.iter().any(|&digit| digit >= 7)
                                    {
                                        for (mask, digit) in joint.iter_mut().zip(placed) {
                                            *mask |= digit_bit(digit);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                assert_eq!(clue.support(domains), expected, "{required:?} {domains:?}");
                assert_eq!(
                    clue.support_with_entropy(domains),
                    joint,
                    "{required:?} {domains:?}"
                );
                assert_eq!(clue.has_assignment(domains), expected[0] != 0);
            }
        }
    }
}
