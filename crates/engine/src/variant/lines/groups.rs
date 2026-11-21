use crate::{CELLS, DIGITS};

/// A path has at most six possible repeating group orders. Compile its walk
/// onto distinct cells so every later support request uses one domain per cell.
#[derive(Clone, Debug)]
pub(super) struct GroupLine {
    partition: DigitGroups,
    phases: Vec<usize>,
    consistent: bool,
}

#[derive(Clone, Copy, Debug)]
pub(super) enum DigitGroups {
    Entropic,
    Modular,
}

impl DigitGroups {
    fn masks(self) -> [u16; 3] {
        match self {
            Self::Entropic => [0b000000111, 0b000111000, 0b111000000],
            Self::Modular => [0b001001001, 0b010010010, 0b100100100],
        }
    }
}
const ORDERS: [[usize; 3]; 6] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
];

impl GroupLine {
    pub(super) fn compile(walk: &[usize], partition: DigitGroups) -> Option<(Vec<usize>, Self)> {
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
        Some((
            cells,
            Self {
                partition,
                phases,
                consistent,
            },
        ))
    }

    pub(super) fn different_phases(&self, a: usize, b: usize) -> bool {
        self.phases[a] != self.phases[b]
    }

    pub(super) fn house_pair_removals(
        &self,
        left: usize,
        right: usize,
        domains: [u16; 2],
    ) -> [u16; 2] {
        if !self.consistent || self.different_phases(left, right) {
            return [0; 2];
        }
        let mut removals = [0; 2];
        let common = domains[0] & domains[1];
        for group in self.partition.masks() {
            let shared = common & group;
            if shared == 0 {
                continue;
            }
            // If one cell has only this digit in the group, the other
            // cannot use it without making the house repeat that digit.
            if domains[0] & group == shared && shared.is_power_of_two() {
                removals[1] |= shared;
            }
            if domains[1] & group == shared && shared.is_power_of_two() {
                removals[0] |= shared;
            }
        }
        removals
    }

    pub(super) fn modular_sum_groups(&self, left: usize, right: usize, sum: u8) -> Option<Vec<u16>> {
        if !self.consistent {
            return None;
        }
        let DigitGroups::Modular = self.partition else {
            return None;
        };
        let a = self.phases[left];
        let b = self.phases[right];
        // A sum S has only one way to use the same remainder twice: 2 * S (mod 3).
        // The group masks are ordered by the remainder of digit minus one.
        let group = self.partition.masks()[usize::from((2 * sum + 2) % 3)];
        Some(
            self.phases
                .iter()
                .map(|&phase| {
                    let must_use_group = if a == b {
                        phase == a
                    } else {
                        phase != a && phase != b
                    };
                    if must_use_group { group } else { DIGITS & !group }
                })
                .collect(),
        )
    }

    pub(super) fn support(&self, domains: &[u16], support: &mut [u16]) {
        if !self.consistent {
            return;
        }
        // Cells three positions apart use the same group, not the same digit.
        let groups = self.partition.masks();
        let mut possible = [DIGITS; 3];
        for (&phase, &domain) in self.phases.iter().zip(domains) {
            for group in groups {
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
                .all(|(phase, &group)| possible[phase] & groups[group] != 0)
            {
                for (phase, group) in order.into_iter().enumerate() {
                    supported[phase] |= groups[group];
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
    fn expected(
        partition: DigitGroups,
        walk: &[usize],
        cells: &[usize],
        domains: &[u16],
    ) -> Vec<u16> {
        fn visit(
            partition: DigitGroups,
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
                        groups |= 1u8
                            << match partition {
                                DigitGroups::Entropic => (digit - 1) / 3,
                                DigitGroups::Modular => digit % 3,
                            };
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
                    visit(partition, walk, cells, domains, values, support);
                    values.pop();
                }
            }
        }
        let mut support = vec![0; cells.len()];
        visit(partition, walk, cells, domains, &mut vec![], &mut support);
        support
    }

    fn check(partition: DigitGroups, walk: &[usize], domains: &[u16]) {
        let (cells, line) = GroupLine::compile(walk, partition).unwrap();
        let mut actual = vec![0; cells.len()];
        line.support(domains, &mut actual);
        assert_eq!(
            actual,
            expected(partition, walk, &cells, domains),
            "{walk:?} {domains:?}"
        );
    }

    #[test]
    fn every_two_cell_digit_domain_pair_matches_direct_assignments() {
        for partition in [DigitGroups::Entropic, DigitGroups::Modular] {
            for a in 0..=511 {
                for b in 0..=511 {
                    check(partition, &[0, 10], &[a, b]);
                }
            }
        }
    }

    #[test]
    fn every_three_cell_group_domain_matches_actual_digit_assignments() {
        for partition in [DigitGroups::Entropic, DigitGroups::Modular] {
            let masks: Vec<u16> = (0..8)
                .map(|bits| {
                    partition
                        .masks()
                        .iter()
                        .enumerate()
                        .fold(0, |mask, (i, group)| {
                            mask | if bits & (1 << i) != 0 { *group } else { 0 }
                        })
                })
                .collect();
            for &a in &masks {
                for &b in &masks {
                    for &c in &masks {
                        check(partition, &[0, 10, 20], &[a, b, c]);
                    }
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
            for partition in [DigitGroups::Entropic, DigitGroups::Modular] {
                check(partition, &walk, &domains);
            }
        }
        let walk: Vec<_> = [0, 10, 20].into_iter().cycle().take(301).collect();
        for partition in [DigitGroups::Entropic, DigitGroups::Modular] {
            check(partition, &walk, &[511; 3]);
        }
    }

    #[test]
    fn the_two_partitions_enforce_different_numeric_rules() {
        let (_, entropy) = GroupLine::compile(&[0, 10, 20], DigitGroups::Entropic).unwrap();
        let (_, modular) = GroupLine::compile(&[0, 10, 20], DigitGroups::Modular).unwrap();
        for (domains, entropy_allowed) in [([1, 8, 64], true), ([1, 2, 4], false)] {
            let mut actual = [0; 3];
            entropy.support(&domains, &mut actual);
            assert_eq!(actual, if entropy_allowed { domains } else { [0; 3] });
            let mut actual = [0; 3];
            modular.support(&domains, &mut actual);
            assert_eq!(actual, if entropy_allowed { [0; 3] } else { domains });
        }
    }
}
