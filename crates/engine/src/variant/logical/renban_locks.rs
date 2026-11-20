use super::{
    CompiledVariant, ProofPosition, VariantClueScope, VariantDeduction, VariantEvidence,
    VariantTechnique,
};
use crate::{
    Candidate, DIGITS, HintAction,
    hints::{digit_bit, digits},
    variant::{cell_mask, cells_in, search::record_support},
};

impl CompiledVariant {
    pub(super) fn renban_locks(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for line in self
            .lines
            .iter()
            .filter(|line| line.rule_id == "renban" && line.cells.len() > 1)
        {
            let mut domains = [0; 9];
            let domains = &mut domains[..line.cells.len()];
            for (mask, &cell) in domains.iter_mut().zip(&line.cells) {
                *mask = position.domain(cell);
            }
            let Some((required, supported)) = interval_support(domains) else {
                continue;
            };
            let scope = cell_mask(&line.cells).expect("compiled Renban");
            for digit in digits(required) {
                let bit = digit_bit(digit);
                let locations = line
                    .cells
                    .iter()
                    .zip(supported)
                    .filter(|(_, mask)| mask & bit != 0)
                    .fold(0u128, |mask, (&cell, _)| mask | 1 << cell);
                // A required digit always has a supported location.
                let first = locations.trailing_zeros() as usize;
                for &index in &self.memberships[first] {
                    let house = self.house_masks[index];
                    if locations & !house != 0 {
                        continue;
                    }
                    let actions: Vec<_> = cells_in(house & !scope)
                        .filter(|&cell| position.masks[cell] & bit != 0)
                        .map(|cell| HintAction::Eliminate(Candidate { cell, digit }))
                        .collect();
                    if actions.is_empty() {
                        continue;
                    }
                    proofs.push(VariantDeduction {
                        technique: VariantTechnique::RenbanLockedDigit,
                        evidence: VariantEvidence::LockedDigit {
                            clue: VariantClueScope {
                                rules: vec![line.rule_index],
                                cells: line.cells.clone(),
                            },
                            target: self.houses[index].kind,
                            cells: cells_in(locations).collect(),
                            domains: domains.to_vec(),
                            digit,
                        },
                        actions,
                    });
                }
            }
        }
    }
}

/// Intersect the viable intervals for mandatory digits, and union the
/// assignments for the possible locations of those digits.
fn interval_support(domains: &[u16]) -> Option<(u16, [u16; 9])> {
    let width = (1 << domains.len()) - 1;
    let mut required = DIGITS;
    let mut supported = [0; 9];
    for start in 0..=9 - domains.len() {
        let interval = width << start;
        if record_support::<9, 512>(interval, domains, &mut supported, &mut [None; 512]) {
            required &= interval;
        }
    }
    (supported[0] != 0).then_some((required, supported))
}

#[cfg(test)]
mod tests;
