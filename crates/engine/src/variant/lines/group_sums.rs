//! Positive two-cell sums that interact with repeating digit groups.

use super::{
    CompiledVariant, LineConstraint, LineKind, PuzzleRule, VariantHouseKind, groups::DigitGroups,
};
use crate::{
    CELLS, DIGITS,
    hints::{digit_bit, digits},
};

pub(in crate::variant) fn compile_line_sums(puzzle: &mut CompiledVariant, rules: &[PuzzleRule]) {
    let mut group_lines = puzzle
        .lines
        .iter()
        .filter(|line| matches!(line.kind, LineKind::ThreeGroups(_)))
        .peekable();
    if group_lines.peek().is_none() {
        return;
    }

    let mut sums = Vec::new();
    for (index, rule) in rules.iter().enumerate() {
        match rule {
            PuzzleRule::AdjacentTotal { cells, sum } => sums.push((index, *cells, *sum)),
            PuzzleRule::Xv { five, ten } => {
                sums.extend(five.pairs.iter().map(|&cells| (index, cells, 5)));
                sums.extend(ten.pairs.iter().map(|&cells| (index, cells, 10)));
            }
            _ => {}
        }
    }
    let mut incident: [Vec<_>; CELLS] = std::array::from_fn(|_| Vec::new());
    for &(rule, [a, b], total) in &sums {
        incident[a].push((rule, b, total));
        incident[b].push((rule, a, total));
    }
    let mut modular = Vec::new();
    let mut with_houses = Vec::new();
    let mut disjoint = Vec::new();
    let mut chains = Vec::new();
    for line in group_lines {
        for &(rule, pair, sum) in &sums {
            if let Some(joined) = ModularSum::for_pair(line, rule, pair, sum) {
                modular.push(joined);
            }
            for [a, b] in [pair, [pair[1], pair[0]]] {
                GroupSumHouse::compile(puzzle, line, rule, a, b, sum, &mut with_houses);
                for &(next_rule, c, next_total) in &incident[b] {
                    if c != a {
                        GroupSumChain::compile(
                            puzzle,
                            line,
                            [rule, next_rule],
                            [a, b, c],
                            [sum, next_total],
                            &mut chains,
                        );
                    }
                }
            }
            DisjointGroupSum::compile(puzzle, line, rule, pair, sum, &mut disjoint);
        }
    }
    puzzle.modular_sums = modular;
    puzzle.group_sum_houses = with_houses;
    puzzle.disjoint_group_sums = disjoint;
    puzzle.group_sum_chains = chains;
}

#[derive(Clone, Debug)]
pub(in crate::variant) struct ModularSum {
    /// The line rule followed by the sum rule, in proof order.
    pub rules: [usize; 2],
    /// Sum endpoints first, followed by the other distinct cells of the line.
    pub cells: Vec<usize>,
    pub allowed: Vec<u16>,
}

impl ModularSum {
    fn for_pair(line: &LineConstraint, rule: usize, pair: [usize; 2], sum: u8) -> Option<Self> {
        let LineKind::ThreeGroups(groups) = &line.kind else {
            return None;
        };
        let [a, b] = pair;
        let left = line.cells.iter().position(|&cell| cell == a)?;
        let right = line.cells.iter().position(|&cell| cell == b)?;
        let groups = groups.modular_sum_groups(left, right, sum)?;
        let mut cells = vec![a, b];
        let mut allowed = vec![groups[left], groups[right]];
        for (index, (&cell, mask)) in line.cells.iter().zip(groups).enumerate() {
            if index != left && index != right {
                cells.push(cell);
                allowed.push(mask);
            }
        }
        Some(Self {
            rules: [line.rule_index, rule],
            cells,
            allowed,
        })
    }
}

#[derive(Clone, Debug)]
pub(in crate::variant) struct GroupSumHouse {
    /// Same-group target, sum endpoint on the line, and its sum partner.
    pub cells: [usize; 3],
    pub rules: [usize; 2],
    pub house: VariantHouseKind,
    pub total: u8,
    pub technique: &'static str,
    partition: DigitGroups,
    endpoint_in_house: bool,
}

impl GroupSumHouse {
    fn compile(
        puzzle: &CompiledVariant,
        line: &LineConstraint,
        rule: usize,
        endpoint: usize,
        partner: usize,
        total: u8,
        out: &mut Vec<Self>,
    ) {
        let LineKind::ThreeGroups(groups) = &line.kind else {
            return;
        };
        let Some(index) = line.cells.iter().position(|&cell| cell == endpoint) else {
            return;
        };
        for (i, &cell) in line.cells.iter().enumerate() {
            if i == index || cell == partner {
                continue;
            }
            let Some(partition) = groups.repeating_group(index, i) else {
                continue;
            };
            let common = puzzle.shared_enforced_house(cell, &[endpoint, partner]);
            if let Some(house) = common.or_else(|| puzzle.shared_enforced_house(cell, &[partner])) {
                out.push(Self {
                    cells: [cell, endpoint, partner],
                    rules: [line.rule_index, rule],
                    house,
                    total,
                    technique: line.rule_id,
                    partition,
                    endpoint_in_house: common.is_some(),
                });
            }
        }
    }

    /// Return only removals that need the shared-house premise.
    pub fn removals(&self, [target, endpoint, partner]: [u16; 3]) -> u16 {
        let mut removed = 0;
        let mut viable = 0;
        for group in self.partition.masks() {
            let partners = digits(endpoint & group)
                .fold(0, |mask, digit| mask | (self.partner_bit(digit) & partner));
            for digit in digits(target & group) {
                let bit = digit_bit(digit);
                // When the whole triple shares the house, the line endpoint
                // also cannot repeat the target digit.
                let partners = if self.endpoint_in_house && endpoint & bit != 0 {
                    partners & !self.partner_bit(digit)
                } else {
                    partners
                };
                if partners == bit {
                    removed |= bit;
                }
                viable |= partners & !bit;
            }
        }
        if viable == 0 { 0 } else { removed }
    }

    fn partner_bit(&self, digit: u8) -> u16 {
        let partner = self.total.saturating_sub(digit);
        if partner != digit && (1..=9).contains(&partner) {
            digit_bit(partner)
        } else {
            0
        }
    }
}

#[derive(Clone, Debug)]
pub(in crate::variant) struct DisjointGroupSum {
    /// The two line cells, then the two sum endpoints.
    pub cells: [usize; 4],
    pub rules: [usize; 2],
    pub houses: Vec<VariantHouseKind>,
    pub total: u8,
    pub technique: &'static str,
    partition: DigitGroups,
    sees: [u8; 2],
}

impl DisjointGroupSum {
    fn compile(
        puzzle: &CompiledVariant,
        line: &LineConstraint,
        rule: usize,
        [c, d]: [usize; 2],
        total: u8,
        out: &mut Vec<Self>,
    ) {
        let LineKind::ThreeGroups(groups) = &line.kind else {
            return;
        };
        let sum_cells = (1u128 << c) | (1u128 << d);
        for (i, &a) in line.cells.iter().enumerate() {
            if sum_cells & (1u128 << a) != 0 {
                continue;
            }
            for (j, &b) in line.cells.iter().enumerate().skip(i + 1) {
                if sum_cells & (1u128 << b) != 0
                    || (puzzle.peers[a] | puzzle.peers[b]) & sum_cells == 0
                {
                    continue;
                }
                let Some(partition) = groups.repeating_group(i, j) else {
                    continue;
                };
                let cells = [a, b, c, d];
                let mut houses = Vec::new();
                let mut sees = [0; 2];
                for i in 0..2 {
                    for j in i + 1..4 {
                        if let Some(house) = puzzle.shared_enforced_house(cells[i], &[cells[j]]) {
                            sees[i] |= 1 << j;
                            if !houses.contains(&house) {
                                houses.push(house);
                            }
                        }
                    }
                }
                if (sees[0] | sees[1]) & 0b1100 != 0 {
                    out.push(Self {
                        cells,
                        rules: [line.rule_index, rule],
                        houses,
                        total,
                        technique: line.rule_id,
                        partition,
                        sees,
                    });
                }
            }
        }
    }

    pub fn removals(&self, [first, second, left, right]: [u16; 4]) -> [u16; 2] {
        let sum_left = digits(left).fold(0, |mask, a| {
            let b = self.total.saturating_sub(a);
            if a != b && (1..=9).contains(&b) && right & digit_bit(b) != 0 {
                mask | digit_bit(a)
            } else {
                mask
            }
        });
        if sum_left == 0 {
            return [0; 2];
        }

        let mut possible = [0; 2];
        let mut supported = [0; 2];
        for group in self.partition.masks() {
            for a in digits(first & group) {
                for b in digits(second & group) {
                    if a == b && self.sees[0] & 0b0010 != 0 {
                        continue;
                    }
                    let bits = [digit_bit(a), digit_bit(b)];
                    possible[0] |= bits[0];
                    possible[1] |= bits[1];
                    if digits(sum_left).any(|c| {
                        let d = self.total - c;
                        (a != c || self.sees[0] & 0b0100 == 0)
                            && (a != d || self.sees[0] & 0b1000 == 0)
                            && (b != c || self.sees[1] & 0b0100 == 0)
                            && (b != d || self.sees[1] & 0b1000 == 0)
                    }) {
                        supported[0] |= bits[0];
                        supported[1] |= bits[1];
                    }
                }
            }
        }
        if supported[0] == 0 {
            return [0; 2];
        }
        std::array::from_fn(|i| possible[i] & !supported[i])
    }
}

#[derive(Clone, Debug)]
pub(in crate::variant) struct GroupSumChain {
    pub rules: [usize; 3],
    /// Line endpoint, common sum cell, far sum endpoint, and same-group line cell.
    pub cells: [usize; 4],
    pub house: Option<usize>,
    pub houses: Vec<VariantHouseKind>,
    pub totals: [u8; 2],
    pub technique: &'static str,
    partition: DigitGroups,
    ends_share_house: bool,
    partner_peers: [bool; 3],
}

pub(in crate::variant) struct GroupSumChainSupport {
    pub supported: [u16; 4],
    pub removed: [u16; 4],
    pub locked: u16,
}

impl GroupSumChain {
    fn compile(
        puzzle: &CompiledVariant,
        line: &LineConstraint,
        rules: [usize; 2],
        [start, middle, end]: [usize; 3],
        totals: [u8; 2],
        out: &mut Vec<Self>,
    ) {
        let LineKind::ThreeGroups(groups) = &line.kind else {
            return;
        };
        let Some(index) = line.cells.iter().position(|&cell| cell == start) else {
            return;
        };
        let sums = (1u128 << start) | (1u128 << middle) | (1u128 << end);
        for (other, &partner) in line.cells.iter().enumerate() {
            let bit = 1u128 << partner;
            if sums & bit != 0 {
                continue;
            }
            let Some(partition) = groups.repeating_group(index, other) else {
                continue;
            };
            let cells = [start, middle, end, partner];
            let rules = [line.rule_index, rules[0], rules[1]];
            let scope = sums | bit;
            let common = out.len();
            for &house in &puzzle.memberships[start] {
                let sites = puzzle.house_masks[house];
                if sites & scope == scope && puzzle.search_houses.binary_search(&house).is_ok() {
                    out.push(Self {
                        rules,
                        cells,
                        house: Some(house),
                        houses: Vec::new(),
                        totals,
                        technique: line.rule_id,
                        partition,
                        ends_share_house: true,
                        partner_peers: [true; 3],
                    });
                }
            }
            if out.len() != common || puzzle.peers[partner] & sums == 0 {
                continue;
            }
            let partner_houses =
                [start, middle, end].map(|cell| puzzle.shared_enforced_house(partner, &[cell]));
            if partner_houses.iter().all(Option::is_none) {
                continue;
            }
            let ends_house = puzzle.shared_enforced_house(start, &[end]);
            let mut houses = Vec::new();
            for house in partner_houses.into_iter().chain([ends_house]).flatten() {
                if !houses.contains(&house) {
                    houses.push(house);
                }
            }
            out.push(Self {
                rules,
                cells,
                house: None,
                houses,
                totals,
                technique: line.rule_id,
                partition,
                ends_share_house: ends_house.is_some(),
                partner_peers: partner_houses.map(|house| house.is_some()),
            });
        }
    }

    pub fn support(&self, domains: [u16; 4]) -> Option<GroupSumChainSupport> {
        let [left, right] = self.totals;
        let mut supported = [0; 4];
        // Report only the additional support lost when the line is enforced.
        let mut ungrouped = [0; 4];
        let mut occupied = DIGITS;
        let mut ungrouped_occupied = DIGITS;
        for group in self.partition.masks() {
            for a in digits(domains[0] & group) {
                let b = left.saturating_sub(a);
                let c = right.saturating_sub(b);
                if !(1..=9).contains(&b)
                    || !(1..=9).contains(&c)
                    || a == b
                    || b == c
                    || self.ends_share_house && a == c
                {
                    continue;
                }
                let sum_digits = [a, b, c].map(digit_bit);
                if sum_digits
                    .iter()
                    .zip(domains)
                    .any(|(&bit, domain)| bit & domain == 0)
                {
                    continue;
                }
                let blocked =
                    sum_digits
                        .into_iter()
                        .zip(self.partner_peers)
                        .fold(
                            0,
                            |mask, (bit, peers)| if peers { mask | bit } else { mask },
                        );
                let all_partners = domains[3] & !blocked;
                if all_partners == 0 {
                    continue;
                }
                for (mask, digit) in ungrouped.iter_mut().zip(sum_digits) {
                    *mask |= digit;
                }
                ungrouped[3] |= all_partners;
                // For a common house, blocked is the union of all three sum digits.
                ungrouped_occupied &= blocked | singleton(all_partners);

                let partners = all_partners & group;
                if partners == 0 {
                    continue;
                }
                for (mask, digit) in supported.iter_mut().zip(sum_digits) {
                    *mask |= digit;
                }
                supported[3] |= partners;
                occupied &= blocked | singleton(partners);
            }
        }
        if supported[0] == 0 {
            return None;
        }
        let removed = std::array::from_fn(|i| ungrouped[i] & !supported[i]);
        let locked = if self.house.is_some() {
            occupied & !ungrouped_occupied
        } else {
            0
        };
        (removed != [0; 4] || locked != 0).then_some(GroupSumChainSupport {
            supported,
            removed,
            locked,
        })
    }
}

// Every partner is free to choose any member of its mask once the sum digits
// are fixed. Only a single candidate can then guarantee another occupied digit.
fn singleton(mask: u16) -> u16 {
    if mask.is_power_of_two() { mask } else { 0 }
}

#[cfg(test)]
mod tests {
    use crate::{
        CELLS, DIGITS,
        variant::{MarkedPairs, PuzzleRule, VariantPuzzle},
    };

    fn line(cells: &[usize]) -> PuzzleRule {
        PuzzleRule::Modular {
            cells: cells.to_vec(),
        }
    }

    #[test]
    fn all_two_cell_totals_respect_digit_assignments_in_each_group_order() {
        let endpoints = [0, 1];
        for path in [[0, 1, 10, 9, 20, 19], [0, 10, 9, 1, 20, 19]] {
            for sum in 3..=17 {
                let mut puzzle = VariantPuzzle::classic([0; CELLS]);
                puzzle.rules = vec![
                    PuzzleRule::AdjacentTotal {
                        cells: endpoints,
                        sum,
                    },
                    line(&path),
                ];
                let compiled = puzzle.compile().unwrap();
                let [clue] = compiled.modular_sums.as_slice() else {
                    panic!("Expected one sum on the line")
                };
                assert_eq!(clue.rules, [1, 0]);
                assert_eq!(&clue.cells[..2], &endpoints);

                // Check every ordered pair of digits against each repeating
                // group order. Derive the residues from the digits directly.
                let mut expected = [0; CELLS];
                let left = path.iter().position(|&cell| cell == endpoints[0]).unwrap();
                let right = path.iter().position(|&cell| cell == endpoints[1]).unwrap();
                for a in 1_u8..=9 {
                    for b in 1_u8..=9 {
                        if a == b || a + b != sum {
                            continue;
                        }
                        for first in 0_u8..3 {
                            for second in 0_u8..3 {
                                if first == second {
                                    continue;
                                }
                                let order = [first, second, 3 - first - second];
                                if a % 3 != order[left % 3] || b % 3 != order[right % 3] {
                                    continue;
                                }
                                for (position, &cell) in path.iter().enumerate() {
                                    for digit in 1_u8..=9 {
                                        if digit % 3 == order[position % 3] {
                                            expected[cell] |= 1 << (digit - 1);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                for (&cell, &mask) in clue.cells.iter().zip(&clue.allowed) {
                    assert_eq!(
                        expected[cell] & !mask,
                        0,
                        "{path:?}, sum {sum}, cell {cell}"
                    );
                    assert_ne!(mask, DIGITS);
                    if sum == 7 {
                        assert_eq!(expected[cell], mask);
                    }
                }
            }
        }
    }

    #[test]
    fn only_positive_sums_on_a_consistent_modular_line_supply_proofs() {
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        let marks = PuzzleRule::Xv {
            five: MarkedPairs {
                pairs: vec![[1, 0], [8, 7]],
                negative: true,
            },
            ten: MarkedPairs {
                pairs: vec![],
                negative: true,
            },
        };
        puzzle.rules = vec![line(&[0, 1, 10, 0, 1, 10]), marks];
        let compiled = puzzle.compile().unwrap();
        let [clue] = compiled.modular_sums.as_slice() else {
            panic!("Expected one positive V")
        };
        assert_eq!(clue.rules, [0, 1]);
        assert_eq!(clue.cells, [1, 0, 10]);
        // If two digits from the same group add to 5, both have remainder 1.
        assert_eq!(clue.allowed, [DIGITS & !73, DIGITS & !73, 73]);

        puzzle.rules[0] = PuzzleRule::Entropic {
            cells: vec![0, 1, 10],
        };
        assert!(puzzle.compile().unwrap().modular_sums.is_empty());
        puzzle.rules[0] = line(&[0, 1, 0]);
        assert!(puzzle.compile().unwrap().modular_sums.is_empty());
    }
}
