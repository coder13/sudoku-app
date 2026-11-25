//! Candidate support for overlapping entropy areas and their Quadruple clues.

use super::*;
use crate::variant::quadruple::{Quadruple, cells as window_cells, satisfies_sum};

const MAX_AREA_CELLS: usize = 7;

impl CompiledVariant {
    pub(super) fn entropy_proofs(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        limit: usize,
    ) -> Vec<VariantDeduction> {
        let Some(entropy) = self.global_entropy else {
            return Vec::new();
        };
        // Limit the extra area search to the mixed Quadruple profile.
        if self.quadruples.is_empty() {
            return Vec::new();
        }

        let include_circles = technique == VariantTechnique::EntropyQuadruple;
        let mut circles = [const { Vec::new() }; CELLS];
        if include_circles {
            for clue in &self.quadruples {
                circles[clue.cells[0]].push(clue);
            }
        }
        let mut proofs = Vec::new();
        // Keep single areas and shared edges first, then check shared corners.
        let offsets: [&[(usize, i8)]; 3] = [&[(0, 0)], &[(0, 1), (1, 0)], &[(1, -1), (1, 1)]];
        let offsets = if include_circles {
            &offsets[..]
        } else {
            &offsets[1..]
        };
        for group in offsets {
            for (_, first) in self.entropy_windows() {
                let top = first[0];
                for &(row, column) in *group {
                    let other_column = (top % 9) as i8 + column;
                    if !(0..8).contains(&other_column) {
                        continue;
                    }
                    let other_top = 9 * (top / 9 + row) + other_column as usize;
                    let Some(other) = window_cells(other_top) else {
                        continue;
                    };
                    if include_circles && circles[top].is_empty() && circles[other_top].is_empty() {
                        continue;
                    }
                    let second = (other_top != top).then_some(other);
                    if let Some(proof) = self
                        .entropy_area_proof(position, technique, entropy, &circles, first, second)
                    {
                        proofs.push(proof);
                        if proofs.len() == limit {
                            return proofs;
                        }
                    }
                }
            }
        }
        proofs
    }

    fn entropy_area_proof(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        entropy: usize,
        circles: &[Vec<&Quadruple>; CELLS],
        first: [usize; 4],
        second: Option<[usize; 4]>,
    ) -> Option<VariantDeduction> {
        let mut cells = [0; MAX_AREA_CELLS];
        cells[..4].copy_from_slice(&first);
        let len = match second {
            Some(second) => {
                let mut next = 4;
                for cell in second.into_iter().filter(|cell| !first.contains(cell)) {
                    cells[next] = cell;
                    next += 1;
                }
                cells[..next].sort_unstable();
                next
            }
            None => 4,
        };
        let cells = &cells[..len];
        let mut domains = [0; MAX_AREA_CELLS];
        for (i, &cell) in cells.iter().enumerate() {
            domains[i] = position.domain(cell);
        }
        if technique == VariantTechnique::GlobalEntropy
            && domains[..len].iter().all(|&domain| domain == DIGITS)
        {
            return None;
        }
        let mut basic = domains;
        let mut rules = vec![entropy];
        let mut windows = vec![first];
        windows.extend(second);
        let areas: Vec<_> = windows
            .iter()
            .map(|&window| {
                let slots = window.map(|cell| cells.binary_search(&cell).unwrap());
                let local = slots.map(|i| domains[i]);
                let support = super::super::global_entropy::support(local);
                for (&i, mask) in slots.iter().zip(support) {
                    basic[i] &= mask;
                }
                let mut required = [0; 9];
                for circle in &circles[window[0]] {
                    rules.push(circle.rule_index);
                    for (&i, mask) in slots.iter().zip(circle.support(local)) {
                        basic[i] &= mask;
                    }
                    for digit in digits(circle.required_digits()) {
                        let index = usize::from(digit - 1);
                        required[index] = required[index].max(circle.occurrences(digit));
                    }
                }
                Area {
                    slots,
                    is_sum: circles[window[0]].iter().any(|clue| clue.is_sum),
                    required: required
                        .into_iter()
                        .enumerate()
                        .filter_map(|(i, count)| (count > 0).then_some((i as u8 + 1, count)))
                        .collect(),
                }
            })
            .collect();
        if basic[..len].contains(&0) {
            return None;
        }

        let mut peers = [0u8; MAX_AREA_CELLS];
        let mut houses = Vec::new();
        for &index in &self.search_houses {
            let house = &self.houses[index];
            let mask = self.house_masks[index];
            if !matches!(
                house.kind,
                VariantHouseKind::Row(_)
                    | VariantHouseKind::Column(_)
                    | VariantHouseKind::Region(_)
            ) {
                continue;
            }
            let local = cells.iter().enumerate().fold(0u8, |bits, (i, &cell)| {
                bits | (u8::from(mask & (1 << cell) != 0) << i)
            });
            if local.count_ones() < 2
                || (0..len).all(|i| local & (1 << i) == 0 || local & !(1 << i) & !peers[i] == 0)
            {
                continue;
            }
            for (i, adjacent) in peers.iter_mut().enumerate().take(len) {
                if local & (1 << i) != 0 {
                    *adjacent |= local & !(1 << i);
                }
            }
            houses.push(house.kind);
        }

        let mut scan = Assignments {
            areas: &areas,
            peers,
            supported: [0; MAX_AREA_CELLS],
            target: basic,
        };
        scan.visit(basic, (1 << len) - 1);
        if scan.supported[0] == 0 {
            return None;
        }
        // Prefer the ordinary rules for removals they can already prove alone.
        let actions = position.removals(
            cells,
            scan.supported
                .into_iter()
                .zip(basic)
                .map(|(supported, domain)| supported | !domain),
        );
        (!actions.is_empty()).then(|| VariantDeduction {
            technique,
            actions,
            evidence: VariantEvidence::EntropyAreas(Box::new(VariantEntropyAreaProof {
                rules,
                windows,
                cells: cells.to_vec(),
                domains: domains[..len].to_vec(),
                supported: scan.supported[..len].to_vec(),
                houses,
            })),
        })
    }
}

struct Area {
    slots: [usize; 4],
    is_sum: bool,
    required: Vec<(u8, u8)>,
}

impl Area {
    fn can_complete(&self, domains: &[u16; MAX_AREA_CELLS], open: u8) -> bool {
        let mut groups = 0u16;
        let mut union = 0u16;
        let mut empty = 0;
        for &i in &self.slots {
            union |= domains[i];
            if open & (1 << i) != 0 {
                empty += 1;
            } else {
                groups |= 1 << (domains[i].trailing_zeros() / 3);
            }
        }
        if 3 - groups.count_ones() > empty || [7, 56, 448].into_iter().any(|mask| union & mask == 0)
        {
            return false;
        }
        if self.is_sum
            && empty == 0
            && !satisfies_sum(self.slots.map(|i| domains[i].trailing_zeros() as u8 + 1))
        {
            return false;
        }
        self.required.iter().all(|&(digit, count)| {
            self.slots
                .iter()
                .filter(|&&i| domains[i] & digit_bit(digit) != 0)
                .count()
                >= usize::from(count)
        })
    }
}

struct Assignments<'a> {
    areas: &'a [Area],
    peers: [u8; MAX_AREA_CELLS],
    supported: [u16; MAX_AREA_CELLS],
    target: [u16; MAX_AREA_CELLS],
}

impl Assignments<'_> {
    fn visit(&mut self, domains: [u16; MAX_AREA_CELLS], open: u8) {
        // Every completion of this branch is a subset of its current domains.
        // Stop once the branch can add no support to any cell.
        if domains
            .iter()
            .zip(self.supported)
            .all(|(domain, supported)| domain & !supported == 0)
        {
            return;
        }
        if !self
            .areas
            .iter()
            .all(|area| area.can_complete(&domains, open))
        {
            return;
        }
        if open == 0 {
            for (supported, assigned) in self.supported.iter_mut().zip(domains) {
                *supported |= assigned;
            }
            return;
        }

        let i = (0..MAX_AREA_CELLS)
            .filter(|&i| open & (1 << i) != 0)
            .min_by_key(|&i| domains[i].count_ones())
            .unwrap();
        let remaining = open & !(1 << i);
        let mut alternatives = domains[i];
        while alternatives != 0 {
            let unproven = alternatives & !self.supported[i];
            let next_digit = if unproven != 0 {
                unproven
            } else {
                alternatives
            };
            let bit = next_digit & next_digit.wrapping_neg();
            alternatives ^= bit;
            let mut next = domains;
            next[i] = bit;
            let mut affected = remaining & self.peers[i];
            while affected != 0 {
                let peer = affected.trailing_zeros() as usize;
                affected &= affected - 1;
                next[peer] &= !bit;
            }
            if (0..MAX_AREA_CELLS).all(|i| remaining & (1 << i) == 0 || next[i] != 0) {
                self.visit(next, remaining);
            }
            if self.supported == self.target {
                return;
            }
        }
    }
}
