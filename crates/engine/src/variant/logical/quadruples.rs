use super::{ProofPosition, VariantClueScope, VariantDeduction, VariantEvidence, VariantTechnique};
use crate::{
    Candidate, HintAction,
    hints::{digit_bit, digits},
    variant::{CompiledVariant, Quadruple, cell_mask, cells_in},
};

impl CompiledVariant {
    pub(super) fn quadruple_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let technique = VariantTechnique::Quadruple;
        for clue in &self.quadruples {
            let domains = clue.cells.map(|cell| position.domain(cell));
            if let Some(proof) = position.explain_constraint(
                technique,
                &[clue.rule_index],
                &clue.cells,
                clue.support(domains).into_iter(),
            ) {
                proofs.push(proof);
            }
        }
    }

    pub(super) fn quadruple_locks(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let mut circle_sites: [Vec<(&Quadruple, u128)>; 9] = Default::default();
        for clue in &self.quadruples {
            let domains = clue.cells.map(|cell| position.domain(cell));
            let supported = clue.support(domains);
            let scope = cell_mask(&clue.cells).unwrap();
            for digit in digits(clue.required_digits()) {
                let bit = digit_bit(digit);
                let sites = clue
                    .cells
                    .iter()
                    .zip(supported)
                    .filter(|&(_, mask)| mask & bit != 0)
                    .fold(0, |sites, (&cell, _)| sites | 1u128 << cell);
                if sites.count_ones() > 1 {
                    circle_sites[usize::from(digit - 1)].push((clue, sites));
                }
                for (target, &house) in self.houses.iter().zip(&self.house_masks) {
                    let cells: Vec<_> = clue
                        .cells
                        .iter()
                        .zip(supported)
                        .filter_map(|(&cell, mask)| {
                            (house & (1 << cell) != 0 && mask & bit != 0).then_some(cell)
                        })
                        .collect();
                    if cells.len() < 2 {
                        continue;
                    }
                    let actions: Vec<_> = cells_in(house & !scope)
                        .filter(|&cell| position.masks[cell] & bit != 0)
                        .map(|cell| HintAction::Eliminate(Candidate { cell, digit }))
                        .collect();
                    if actions.is_empty() {
                        continue;
                    }
                    let without = std::array::from_fn(|i| {
                        if house & (1 << clue.cells[i]) != 0 {
                            domains[i] & !bit
                        } else {
                            domains[i]
                        }
                    });
                    if clue.has_assignment(without) {
                        continue;
                    }
                    proofs.push(VariantDeduction {
                        technique: VariantTechnique::LockedCandidates,
                        evidence: VariantEvidence::LockedDigit {
                            clue: VariantClueScope {
                                rules: vec![clue.rule_index],
                                cells: clue.cells.to_vec(),
                            },
                            target: target.kind,
                            cells,
                            domains: domains.to_vec(),
                            digit,
                        },
                        actions,
                    });
                }
            }
        }
        for (index, circles) in circle_sites.iter().enumerate() {
            let digit = index as u8 + 1;
            for (i, &(first, a)) in circles.iter().enumerate() {
                for &(second, b) in &circles[i + 1..] {
                    if a & b == 0 {
                        self.quadruple_house_lock(
                            position,
                            digit,
                            [(first, a), (second, b)],
                            proofs,
                        );
                    }
                }
            }
        }
    }

    fn quadruple_house_lock(
        &self,
        position: &ProofPosition<'_>,
        digit: u8,
        circles: [(&Quadruple, u128); 2],
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let [(_, a), (_, b)] = circles;
        let sites = a | b;
        // Each distinct placement must use one of the two disjoint houses.
        for &first in &self.memberships[sites.trailing_zeros() as usize] {
            let left = self.house_masks[first];
            if ![a, b]
                .into_iter()
                .all(|scope| scope & left != 0 && scope & !left != 0)
            {
                continue;
            }
            let remaining = sites & !left;
            for &second in &self.memberships[remaining.trailing_zeros() as usize] {
                let right = self.house_masks[second];
                if left & right != 0 || remaining & !right != 0 {
                    continue;
                }
                let actions: Vec<_> = cells_in((left | right) & !sites)
                    .filter(|&cell| position.masks[cell] & digit_bit(digit) != 0)
                    .map(|cell| HintAction::Eliminate(Candidate { cell, digit }))
                    .collect();
                if !actions.is_empty() {
                    proofs.push(VariantDeduction {
                        technique: VariantTechnique::LockedCandidates,
                        evidence: VariantEvidence::QuadrupleLock {
                            clues: circles.map(|(clue, _)| VariantClueScope {
                                rules: vec![clue.rule_index],
                                cells: clue.cells.to_vec(),
                            }),
                            houses: [self.houses[first].kind, self.houses[second].kind],
                            sites: circles.map(|(_, sites)| cells_in(sites).collect()),
                            digit,
                        },
                        actions,
                    });
                }
            }
        }
    }
}
