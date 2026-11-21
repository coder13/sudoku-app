use std::ops::Range;

use crate::{
    hints::{digit_bit, digits},
    variant::digit_sum,
};

pub(crate) const DIGIT_SETS: usize = 512;

pub(crate) struct PartSums {
    // A set at depth i can be assigned to the first i cells in some order.
    sets: Vec<u16>,
    ends: [usize; 10],
    length: usize,
    pub(crate) totals: u64,
}

impl PartSums {
    pub(crate) fn new(domains: &[u16]) -> Self {
        let mut sets = vec![0];
        let mut ends = [1; 10];
        for (index, &domain) in domains.iter().enumerate() {
            let mut seen = [false; DIGIT_SETS];
            let start = if index == 0 { 0 } else { ends[index - 1] };
            for offset in start..ends[index] {
                let used = sets[offset];
                for digit in digits(domain & !used) {
                    let with_digit = used | digit_bit(digit);
                    if !std::mem::replace(&mut seen[with_digit as usize], true) {
                        sets.push(with_digit);
                    }
                }
            }
            ends[index + 1] = sets.len();
        }
        let length = domains.len();
        let start = if length == 0 { 0 } else { ends[length - 1] };
        let totals = sets[start..].iter().fold(0, |mask, &set| mask | 1 << digit_sum(set));
        Self { sets, ends, length, totals }
    }

    fn prefix(&self, depth: usize) -> &[u16] {
        let start = if depth == 0 { 0 } else { self.ends[depth - 1] };
        &self.sets[start..self.ends[depth]]
    }

    pub(crate) fn complete_sets(&self) -> &[u16] {
        self.prefix(self.length)
    }

    pub(crate) fn support(&self, domains: &[u16], allows: impl Fn(u16) -> bool, support: &mut [u16]) {
        let mut viable = [false; DIGIT_SETS];
        for &set in self.complete_sets() {
            viable[set as usize] = allows(set);
        }

        // Follow only the assignments that reach one of the common totals.
        for (index, &domain) in domains.iter().enumerate().rev() {
            let mut previous = [false; DIGIT_SETS];
            for &used in self.prefix(index) {
                for digit in digits(domain & !used) {
                    let bit = digit_bit(digit);
                    if viable[(used | bit) as usize] {
                        support[index] |= bit;
                        previous[used as usize] = true;
                    }
                }
            }
            viable = previous;
        }
    }
}

// The last cell's mask can be shifted as a whole once the preceding
// digits are fixed. Most authored region visits contain at most three cells.
fn short_prefixes(domains: &[u16], mut visit: impl FnMut(u8, [u16; 2], u16)) {
    match *domains {
        [last] => visit(0, [0, 0], last),
        [first, last] => {
            for a in digits(first) {
                let a_bit = digit_bit(a);
                visit(a, [a_bit, 0], last & !a_bit);
            }
        }
        [first, second, last] => {
            for a in digits(first) {
                let a_bit = digit_bit(a);
                for b in digits(second & !a_bit) {
                    let b_bit = digit_bit(b);
                    visit(a + b, [a_bit, b_bit], last & !(a_bit | b_bit));
                }
            }
        }
        _ => unreachable!("a short Region Sum part has one to three cells"),
    }
}

pub(super) fn distinct_support(parts: &[Range<usize>], domains: &[u16], support: &mut [u16]) {
    let mut long_parts = Vec::new();
    let mut common = u64::MAX;
    for part in parts {
        let domain = &domains[part.clone()];
        let totals = if domain.len() <= 3 {
            let mut totals = 0;
            short_prefixes(domain, |sum, _, last| totals |= u64::from(last) << (sum + 1));
            totals
        } else {
            let sums = PartSums::new(domain);
            let totals = sums.totals;
            long_parts.push(sums);
            totals
        };
        common &= totals;
        if common == 0 {
            return;
        }
    }

    let mut long_parts = long_parts.into_iter();
    for part in parts {
        let domains = &domains[part.clone()];
        let support = &mut support[part.clone()];
        if domains.len() <= 3 {
            let (last, prefix) = support.split_last_mut().expect("a region part has cells");
            short_prefixes(domains, |sum, fixed, domain| {
                let fitting = domain & (common >> (sum + 1)) as u16;
                if fitting != 0 {
                    *last |= fitting;
                    for (mask, bit) in prefix.iter_mut().zip(fixed) {
                        *mask |= bit;
                    }
                }
            });
        } else {
            long_parts.next().expect("cached long region part").support(
                domains,
                |set| common & (1 << digit_sum(set)) != 0,
                support,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assignments_by_total(domains: &[u16]) -> [[u16; 9]; 46] {
        fn visit(
            domains: &[u16],
            placed: &mut Vec<u8>,
            total: usize,
            supports: &mut [[u16; 9]; 46],
        ) {
            if let Some(&domain) = domains.get(placed.len()) {
                for digit in 1..=9 {
                    if domain & (1 << (digit - 1)) != 0 && !placed.contains(&digit) {
                        placed.push(digit);
                        visit(domains, placed, total + usize::from(digit), supports);
                        placed.pop();
                    }
                }
            } else {
                for (slot, &value) in supports[total].iter_mut().zip(placed.iter()) {
                    *slot |= 1 << (value - 1);
                }
            }
        }

        let mut supports = [[0; 9]; 46];
        visit(domains, &mut Vec::new(), 0, &mut supports);
        supports
    }

    #[test]
    fn distinct_parts_match_independent_digit_assignments() {
        let mut random = crate::Random::from_seed(71);
        for groups in [
            &[&[9][..], &[3, 6], &[1, 3, 5]][..],
            &[&[1, 2, 3, 9][..], &[4, 5, 6]],
            &[&[1, 2, 3, 4, 5, 6, 7, 8, 9][..], &[9, 8, 7, 6, 5, 4, 3, 2, 1]],
        ] {
            for trial in 0..24 {
                let mut domains = Vec::new();
                let mut parts = Vec::new();
                for group in groups {
                    let start = domains.len();
                    for &digit in *group {
                        let extra = (0..3).fold(0, |mask, _| mask | 1 << random.index(9));
                        domains.push(if trial % 2 == 0 { extra | digit_bit(digit) } else { extra });
                    }
                    parts.push(start..domains.len());
                }
                let assignments: Vec<_> = parts
                    .iter()
                    .map(|part| assignments_by_total(&domains[part.clone()]))
                    .collect();
                let mut expected = vec![0; domains.len()];
                for total in 1..=45 {
                    if assignments.iter().all(|support| support[total][0] != 0) {
                        for (part, support) in parts.iter().zip(&assignments) {
                            for (mask, digit_support) in expected[part.clone()].iter_mut().zip(support[total]) {
                                *mask |= digit_support;
                            }
                        }
                    }
                }
                let mut support = vec![0; domains.len()];
                distinct_support(&parts, &domains, &mut support);
                assert_eq!(support, expected, "{parts:?} {domains:?}");
            }
        }

        // Arithmetic alone would let the first two cells repeat 2 to reach 4.
        let mut support = [0; 3];
        distinct_support(&[0..2, 2..3], &[2, 2, 8], &mut support);
        assert_eq!(support, [0; 3]);
    }
}
