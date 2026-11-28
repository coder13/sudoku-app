use std::collections::BTreeMap;

use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantLineHouseProof,
    VariantTechnique,
};
use crate::{
    DIGITS,
    hints::{digit_bit, digits},
    variant::search::record_support,
};

fn arrow_assignments(domains: &[u16], peers: &[u16]) -> Vec<[u8; 10]> {
    fn visit(
        domains: &[u16],
        peers: &[u16],
        assignment: &mut [u8; 10],
        supported: &mut Vec<[u8; 10]>,
        index: usize,
        sum: u8,
    ) {
        if index == domains.len() {
            if domains[0] & digit_bit(sum) != 0 {
                assignment[0] = sum;
                supported.push(*assignment);
            }
            return;
        }
        let used = assignment[1..index]
            .iter()
            .enumerate()
            .fold(0, |mask, (i, &digit)| {
                if peers[index] & (1 << (i + 1)) != 0 {
                    mask | digit_bit(digit)
                } else {
                    mask
                }
            });
        let maximum = 9 - sum - (domains.len() - index - 1) as u8;
        for digit in digits(domains[index] & !used).take_while(|&d| d <= maximum) {
            assignment[index] = digit;
            visit(
                domains,
                peers,
                assignment,
                supported,
                index + 1,
                sum + digit,
            );
        }
    }
    let mut assignments = Vec::new();
    visit(domains, peers, &mut [0; 10], &mut assignments, 1, 0);
    assignments
}

fn record_assignment(support: &mut [u16], assignment: &[u8; 10]) {
    for (mask, &digit) in support.iter_mut().zip(assignment) {
        *mask |= digit_bit(digit);
    }
}

impl CompiledVariant {
    pub(super) fn arrow_house_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        if self.givens.iter().any(|&digit| digit != 0) {
            return;
        }
        for line in self
            .lines
            .iter()
            .filter(|line| line.technique == VariantTechnique::Arrow && line.cells.len() >= 3)
        {
            let cells = &line.cells;
            if cells.iter().all(|&cell| position.board[cell] != 0) {
                continue;
            }
            let domains: Vec<_> = cells.iter().map(|&cell| position.domain(cell)).collect();
            let houses: Vec<_> = self
                .search_houses
                .iter()
                .filter_map(|&index| {
                    let house = &self.houses[index];
                    let mut shared = 0u16;
                    for (i, &cell) in cells.iter().enumerate() {
                        if self.house_masks[index] & (1 << cell) != 0 {
                            shared |= 1 << i;
                        }
                    }
                    (shared.count_ones() >= 2).then_some((house, shared))
                })
                .collect();
            if houses.is_empty() {
                continue;
            }
            let peers: Vec<_> = (0..cells.len())
                .map(|i| {
                    houses
                        .iter()
                        .filter(|(_, mask)| mask & (1 << i) != 0)
                        .fold(0, |peers, (_, mask)| peers | mask)
                })
                .collect();
            let assignments = arrow_assignments(&domains, &peers);
            if assignments.is_empty() {
                continue;
            }
            let mut line_support = vec![0; cells.len()];
            for assignment in &assignments {
                record_assignment(&mut line_support, assignment);
            }
            let mut basic = vec![0; cells.len()];
            line.support(&domains, &mut basic);
            let actions = position.removals(
                cells,
                line_support
                    .iter()
                    .zip(&basic)
                    .map(|(&support, &simple)| support | !simple),
            );
            let evidence = VariantLineHouseProof {
                rules: vec![line.rule_index],
                cells: cells.clone(),
                domains,
                supported: line_support.clone(),
                houses: houses.iter().map(|(house, _)| house.kind).collect(),
                assignments: assignments.len() as u32,
            };
            if !actions.is_empty() {
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::ArrowHouseSupport,
                    actions,
                    evidence: VariantEvidence::LineHouses(Box::new(evidence)),
                });
                continue;
            }
            for (house, shared) in houses {
                let remainder: Vec<_> = house
                    .cells
                    .into_iter()
                    .filter(|cell| !cells.contains(cell))
                    .collect();
                let remainder_domains: Vec<_> = remainder
                    .iter()
                    .map(|&cell| position.domain(cell))
                    .collect();
                if remainder.iter().all(|&cell| position.board[cell] != 0) {
                    continue;
                }
                let mut accepted = vec![0; cells.len()];
                let mut outside = [0; 9];
                let mut by_digits = BTreeMap::new();
                let mut count = 0;
                for assignment in &assignments {
                    let used = (0..cells.len())
                        .filter(|&i| shared & (1 << i) != 0)
                        .fold(0, |mask, i| mask | digit_bit(assignment[i]));
                    if *by_digits.entry(used).or_insert_with(|| {
                        record_support::<9, 512>(
                            DIGITS & !used,
                            &remainder_domains,
                            &mut outside,
                            &mut [None; 512],
                        )
                    }) {
                        record_assignment(&mut accepted, assignment);
                        count += 1;
                    }
                }
                let outside = &outside[..remainder.len()];
                if count == 0 || accepted == line_support && outside == remainder_domains {
                    continue;
                }
                let mut house_only = [0; 9];
                record_support::<9, 512>(
                    DIGITS,
                    &house.cells.map(|c| position.domain(c)),
                    &mut house_only,
                    &mut [None; 512],
                );
                let house_only_mask = |cell: usize| {
                    house
                        .cells
                        .iter()
                        .position(|&c| c == cell)
                        .map_or(DIGITS, |i| house_only[i])
                };
                let mut actions = position.removals(
                    cells,
                    (0..cells.len())
                        .map(|i| accepted[i] | !(line_support[i] & house_only_mask(cells[i]))),
                );
                actions.extend(
                    position.removals(
                        &remainder,
                        remainder
                            .iter()
                            .zip(outside)
                            .map(|(&cell, &mask)| mask | !house_only_mask(cell)),
                    ),
                );
                if actions.is_empty() {
                    continue;
                }
                actions.sort_unstable();
                let mut evidence = evidence.clone();
                evidence.cells.extend(remainder);
                evidence.domains.extend(remainder_domains);
                evidence.supported = accepted;
                evidence.supported.extend(outside);
                evidence.assignments = count;
                evidence.houses.retain(|&kind| kind != house.kind);
                evidence.houses.push(house.kind);
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::ArrowHouseSupport,
                    actions,
                    evidence: VariantEvidence::LineHouses(Box::new(evidence)),
                });
            }
        }
    }
}
