//! Exact support for a diagonal sum with explicit shared-house exclusions.

use crate::{
    DIGITS,
    hints::digits,
    variant::{CompiledVariant, VariantHouseKind, search::record_support},
};

const RAY_SIZE: usize = 9;
const SUM_COUNT: usize = RAY_SIZE * 9 + 1;

#[derive(Debug)]
pub(in crate::variant) struct RayHouses {
    peers: [u16; RAY_SIZE],
    pub houses: Vec<VariantHouseKind>,
}

impl RayHouses {
    pub fn from_puzzle(puzzle: &CompiledVariant, cells: &[usize], renban: u16) -> Self {
        let mut peers = [0; RAY_SIZE];
        for slot in slots(renban) {
            peers[slot] = renban & !(1 << slot);
        }
        let mut possible: Vec<_> = puzzle
            .houses
            .iter()
            .zip(&puzzle.house_masks)
            .filter_map(|(house, &mask)| {
                let group = cells.iter().enumerate().fold(0u16, |group, (slot, &cell)| {
                    group | (u16::from(mask & (1 << cell) != 0) << slot)
                });
                (group.count_ones() >= 2).then_some((house.kind, group))
            })
            .collect();
        possible.sort_by_key(|(_, group)| std::cmp::Reverse(group.count_ones()));
        let mut houses = Vec::new();
        for (house, group) in possible {
            if slots(group).all(|slot| group & !(1 << slot) & !peers[slot] == 0) {
                continue;
            }
            for slot in slots(group) {
                peers[slot] |= group & !(1 << slot);
            }
            houses.push(house);
        }
        Self { peers, houses }
    }
}

fn slots(mask: u16) -> impl Iterator<Item = usize> {
    crate::hints::digits(mask).map(|digit| usize::from(digit - 1))
}

fn components(mut remaining: u16, peers: &[u16; RAY_SIZE]) -> Vec<u16> {
    let mut groups = Vec::new();
    while remaining != 0 {
        let mut group = 0;
        let mut pending = remaining & remaining.wrapping_neg();
        while pending != 0 {
            group |= pending;
            pending = slots(pending).fold(0, |neighbors, slot| neighbors | peers[slot]) & !group;
        }
        remaining &= !group;
        groups.push(group);
    }
    groups
}

/// Find each candidate that belongs to a complete local assignment. Digits
/// can repeat across disconnected groups. A Renban restricts its marked cells
/// to consecutive distinct values. Exhaustion discards every partial result.
pub(in crate::variant) fn ray_support(
    domains: &[u16],
    houses: &RayHouses,
    renban: u16,
    total: u16,
    mut budget: u32,
) -> Option<[u16; RAY_SIZE]> {
    let len = domains.len();
    let groups = components((1 << len) - 1, &houses.peers);
    let renban_len = renban.count_ones() as usize;
    let starts = if renban_len == 0 { 1 } else { 10 - renban_len };
    let mut support = [0; RAY_SIZE];
    let mut narrowed = [0; RAY_SIZE];
    narrowed[..len].copy_from_slice(domains);
    for start in 0..starts {
        let interval = ((1 << renban_len) - 1) << start;
        for slot in slots(renban) {
            narrowed[slot] = domains[slot] & interval;
        }
        let mut tables = Vec::with_capacity(groups.len());
        for &group in &groups {
            let table = group_support(group, &narrowed, &houses.peers, total, &mut budget)?;
            if table.totals == 0 {
                break;
            }
            tables.push(table);
        }
        if tables.len() == groups.len() {
            merge_support(&tables, total, &mut support);
        }
    }
    Some(support)
}

struct GroupSupport {
    totals: u128,
    masks: [[u16; RAY_SIZE]; SUM_COUNT],
}

struct GroupSearch<'a> {
    group: u16,
    domains: &'a [u16; RAY_SIZE],
    peers: &'a [u16; RAY_SIZE],
    chosen: [u16; RAY_SIZE],
    max: u16,
    budget: &'a mut u32,
    table: GroupSupport,
}

fn group_support(
    group: u16,
    domains: &[u16; RAY_SIZE],
    peers: &[u16; RAY_SIZE],
    max: u16,
    budget: &mut u32,
) -> Option<GroupSupport> {
    if group.count_ones() >= 4
        && slots(group).all(|slot| peers[slot] & group == group & !(1 << slot))
    {
        return all_different_support(group, domains, max, budget);
    }
    let mut search = GroupSearch {
        group,
        domains,
        peers,
        chosen: [0; RAY_SIZE],
        max,
        budget,
        table: GroupSupport {
            totals: 0,
            masks: [[0; RAY_SIZE]; SUM_COUNT],
        },
    };
    search.visit(group, 0)?;
    Some(search.table)
}

// When every cell sees every other, a digit set fixes the subtotal regardless
// of which cell receives each digit. Match sets to cells without trying every
// permutation of the same set.
fn all_different_support(
    group: u16,
    domains: &[u16; RAY_SIZE],
    max: u16,
    budget: &mut u32,
) -> Option<GroupSupport> {
    let mut table = GroupSupport {
        totals: 0,
        masks: [[0; RAY_SIZE]; SUM_COUNT],
    };
    let mut local = [0; RAY_SIZE];
    let len = group.count_ones();
    for (domain, slot) in local.iter_mut().zip(slots(group)) {
        *domain = domains[slot];
    }
    for set in (1..=DIGITS).filter(|mask| mask.count_ones() == len) {
        *budget = budget.checked_sub(1)?;
        let total: u16 = digits(set).map(u16::from).sum();
        if total > max {
            continue;
        }
        let mut allowed = [0; RAY_SIZE];
        if record_support::<9, 512>(set, &local[..len as usize], &mut allowed, &mut [None; 512]) {
            table.totals |= 1 << total;
            for (mask, slot) in allowed.into_iter().zip(slots(group)) {
                table.masks[usize::from(total)][slot] |= mask;
            }
        }
    }
    Some(table)
}

impl GroupSearch<'_> {
    fn visit(&mut self, pending: u16, sum: u16) -> Option<()> {
        *self.budget = self.budget.checked_sub(1)?;
        if pending == 0 {
            self.table.totals |= 1 << sum;
            for slot in slots(self.group) {
                self.table.masks[usize::from(sum)][slot] |= self.chosen[slot];
            }
            return Some(());
        }

        let assigned = self.group & !pending;
        let mut minimum = sum;
        let mut best = (u32::MAX, 0, 0);
        for slot in slots(pending) {
            let used =
                slots(self.peers[slot] & assigned).fold(0, |mask, peer| mask | self.chosen[peer]);
            let domain = self.domains[slot] & !used;
            if domain == 0 {
                return Some(());
            }
            minimum += domain.trailing_zeros() as u16 + 1;
            if domain.count_ones() < best.0 {
                best = (domain.count_ones(), slot, domain);
            }
        }
        if minimum > self.max {
            return Some(());
        }

        let (_, slot, domain) = best;
        for digit in crate::hints::digits(domain) {
            let next_sum = sum + u16::from(digit);
            if next_sum > self.max {
                break;
            }
            self.chosen[slot] = 1 << (digit - 1);
            self.visit(pending & !(1 << slot), next_sum)?;
        }
        Some(())
    }
}

fn sum_sets(mut left: u128, right: u128, limit: u128) -> u128 {
    let mut totals = 0;
    while left != 0 {
        totals |= right << left.trailing_zeros();
        left &= left - 1;
    }
    totals & limit
}

fn merge_support(tables: &[GroupSupport], total: u16, support: &mut [u16; RAY_SIZE]) {
    let limit = (1u128 << (total + 1)) - 1;
    let mut prefix = [1; RAY_SIZE + 1];
    for (i, table) in tables.iter().enumerate() {
        prefix[i + 1] = sum_sets(prefix[i], table.totals, limit);
    }
    if prefix[tables.len()] & (1 << total) == 0 {
        return;
    }

    let mut suffix = 1;
    for (i, table) in tables.iter().enumerate().rev() {
        let remainder = sum_sets(prefix[i], suffix, limit);
        let mut subtotals = table.totals;
        while subtotals != 0 {
            let sum = subtotals.trailing_zeros() as u16;
            if remainder & (1 << (total - sum)) != 0 {
                for (mask, allowed) in support.iter_mut().zip(table.masks[usize::from(sum)]) {
                    *mask |= allowed;
                }
            }
            subtotals &= subtotals - 1;
        }
        suffix = sum_sets(suffix, table.totals, limit);
    }
}

#[cfg(test)]
mod tests;
