use crate::{CELLS, DIGITS};

/// A path has at most six possible repeating group orders. Compile its walk
/// onto distinct cells so every later support request uses one domain per cell.
#[derive(Clone, Debug)]
pub(super) struct EntropicLine {
    phases: Vec<usize>,
    consistent: bool,
}

const GROUPS: [u16; 3] = [0b000000111, 0b000111000, 0b111000000];
const ORDERS: [[usize; 3]; 6] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
];

impl EntropicLine {
    pub(super) fn compile(walk: &[usize]) -> Option<(Vec<usize>, Self)> {
        if walk.is_empty() || walk.iter().any(|&cell| cell >= CELLS) {
            return None;
        }
        let mut positions = [None; CELLS];
        let mut cells = Vec::new();
        let mut phases = Vec::new();
        let mut consistent = true;
        for (index, &cell) in walk.iter().enumerate() {
            let phase = index % 3;
            if let Some(prior) = positions[cell] {
                // The same cell cannot belong to two different digit groups.
                consistent &= prior == phase;
            } else {
                positions[cell] = Some(phase);
                cells.push(cell);
                phases.push(phase);
            }
        }
        Some((cells, Self { phases, consistent }))
    }

    pub(super) fn different_phases(&self, a: usize, b: usize) -> bool {
        self.phases[a] != self.phases[b]
    }

    pub(super) fn support(&self, domains: &[u16], support: &mut [u16]) {
        if !self.consistent {
            return;
        }
        // Cells three positions apart use the same group, not the same digit.
        let mut possible = [DIGITS; 3];
        for (&phase, &domain) in self.phases.iter().zip(domains) {
            for group in GROUPS {
                if domain & group == 0 {
                    possible[phase] &= !group;
                }
            }
        }
        let mut supported = [0; 3];
        for order in ORDERS {
            if order
                .iter()
                .enumerate()
                .all(|(phase, &group)| possible[phase] & GROUPS[group] != 0)
            {
                for (phase, group) in order.into_iter().enumerate() {
                    supported[phase] |= GROUPS[group];
                }
            }
        }
        for ((&phase, &domain), target) in self.phases.iter().zip(domains).zip(support) {
            *target = domain & supported[phase];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Enumerate actual digits. Check each sliding window directly instead of
    // relying on repeating phases or the six-order implementation above.
    fn expected(walk: &[usize], cells: &[usize], domains: &[u16]) -> Vec<u16> {
        fn visit(
            walk: &[usize],
            cells: &[usize],
            domains: &[u16],
            values: &mut Vec<u8>,
            support: &mut [u16],
        ) {
            for window in walk.windows(walk.len().min(3)) {
                let mut groups = 0;
                let mut assigned = 0;
                for &cell in window {
                    let index = cells.iter().position(|&c| c == cell).unwrap();
                    if let Some(&digit) = values.get(index) {
                        groups |= 1u8 << ((digit - 1) / 3);
                        assigned += 1;
                    }
                }
                if groups.count_ones() != assigned {
                    return;
                }
            }
            if values.len() == cells.len() {
                for (i, &digit) in values.iter().enumerate() {
                    support[i] |= 1 << (digit - 1);
                }
                return;
            }
            for digit in 1..=9 {
                if domains[values.len()] & (1 << (digit - 1)) != 0 {
                    values.push(digit);
                    visit(walk, cells, domains, values, support);
                    values.pop();
                }
            }
        }
        let mut support = vec![0; cells.len()];
        visit(walk, cells, domains, &mut vec![], &mut support);
        support
    }

    fn check(walk: &[usize], domains: &[u16]) {
        let (cells, line) = EntropicLine::compile(walk).unwrap();
        let mut actual = vec![0; cells.len()];
        line.support(domains, &mut actual);
        assert_eq!(
            actual,
            expected(walk, &cells, domains),
            "{walk:?} {domains:?}"
        );
    }

    #[test]
    fn every_two_cell_digit_domain_pair_matches_direct_assignments() {
        for a in 0..=511 {
            for b in 0..=511 {
                check(&[0, 10], &[a, b]);
            }
        }
    }

    #[test]
    fn every_three_cell_group_domain_matches_actual_digit_assignments() {
        let masks: Vec<u16> = (0..8)
            .map(|bits| {
                GROUPS.iter().enumerate().fold(0, |mask, (i, group)| {
                    mask | if bits & (1 << i) != 0 { *group } else { 0 }
                })
            })
            .collect();
        for &a in &masks {
            for &b in &masks {
                for &c in &masks {
                    check(&[0, 10, 20], &[a, b, c]);
                }
            }
        }
    }

    #[test]
    fn walks_retain_periodic_groups_without_forcing_equal_digits() {
        for (walk, domains) in [
            (vec![0], vec![511]),
            (vec![0, 10, 20, 30], vec![1, 8, 64, 511]),
            (vec![0, 10, 20, 0], vec![511; 3]),
            (vec![0, 10, 20, 30, 0], vec![511; 4]),
            (vec![0, 10, 0], vec![511; 2]),
            (vec![0, 0], vec![511]),
            (vec![0, 10, 20, 30, 40, 50], vec![3, 24, 192, 7, 56, 448]),
        ] {
            check(&walk, &domains);
        }
        let walk: Vec<_> = [0, 10, 20].into_iter().cycle().take(301).collect();
        check(&walk, &[511; 3]);
    }
}
