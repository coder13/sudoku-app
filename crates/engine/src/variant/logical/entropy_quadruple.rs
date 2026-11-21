//! Candidate support for a Quadruple and one or two overlapping entropy areas.

use super::*;
use crate::variant::quadruple::{Quadruple, cells as window_cells};

impl CompiledVariant {
    pub(super) fn entropy_quadruple_proofs(
        &self,
        position: &ProofPosition<'_>,
        limit: usize,
    ) -> Vec<VariantDeduction> {
        let Some(entropy) = self.global_entropy else {
            return Vec::new();
        };
        if self.quadruples.is_empty() {
            return Vec::new();
        }

        let mut circles = [const { Vec::new() }; CELLS];
        for clue in &self.quadruples {
            circles[clue.cells[0]].push(clue);
        }
        let mut proofs = Vec::new();
        for paired in [false, true] {
            for (_, first) in self.entropy_windows() {
                let top = first[0];
                if !paired && circles[top].is_empty() {
                    continue;
                }
                let side = window_cells(top + 1).filter(|side| side[0] / 9 == top / 9);
                let below = window_cells(top + 9);
                let neighbors = if paired { [side, below] } else { [None, None] };
                for second in neighbors.into_iter().take(if paired { 2 } else { 1 }) {
                    if paired
                        && !second.is_some_and(|cells| {
                            !circles[top].is_empty() || !circles[cells[0]].is_empty()
                        })
                    {
                        continue;
                    }
                    if let Some(proof) =
                        self.entropy_area_proof(position, entropy, &circles, first, second)
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
        entropy: usize,
        circles: &[Vec<&Quadruple>; CELLS],
        first: [usize; 4],
        second: Option<[usize; 4]>,
    ) -> Option<VariantDeduction> {
        let mut cells = [0; 6];
        cells[..4].copy_from_slice(&first);
        let len = match second {
            Some(second) => {
                let mut next = 4;
                for cell in second.into_iter().filter(|cell| !first.contains(cell)) {
                    cells[next] = cell;
                    next += 1;
                }
                cells.sort_unstable();
                6
            }
            None => 4,
        };
        let cells = &cells[..len];
        let mut domains = [0; 6];
        for (i, &cell) in cells.iter().enumerate() {
            domains[i] = position.domain(cell);
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

        let mut peers = [0u8; 6];
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
            supported: [0; 6],
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
            technique: VariantTechnique::EntropyQuadruple,
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
    required: Vec<(u8, u8)>,
}

impl Area {
    fn can_complete(&self, domains: &[u16; 6], open: u8) -> bool {
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
    peers: [u8; 6],
    supported: [u16; 6],
    target: [u16; 6],
}

impl Assignments<'_> {
    fn visit(&mut self, domains: [u16; 6], open: u8) {
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

        let i = (0..6)
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
            if (0..6).all(|i| remaining & (1 << i) == 0 || next[i] != 0) {
                self.visit(next, remaining);
            }
            if self.supported == self.target {
                return;
            }
        }
    }
}
