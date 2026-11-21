use super::{ProofPosition, VariantDeduction, VariantEvidence, VariantTechnique};
use crate::{
    CELLS, Candidate, DIGITS, HintAction, Technique,
    hints::{digit_bit, digits},
    variant::{CompiledVariant, VariantHouseKind, search::SearchPosition},
};

/// Where a digit assumption conflicts with the puzzle after local propagation.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case")
)]
pub enum VariantTrialFailure {
    /// A cell has no candidate left.
    EmptyCell {
        /// Cell whose domain became empty.
        cell: usize,
    },
    /// None of the cells of a house can contain one of its digits.
    MissingDigit {
        /// House that must contain the digit.
        house: VariantHouseKind,
        /// Digit that has no location.
        digit: u8,
    },
}

impl CompiledVariant {
    pub(super) fn rule_forcing_proofs(
        &self,
        position: &ProofPosition<'_>,
        limit: usize,
    ) -> Vec<VariantDeduction> {
        if self.quadruples.is_empty() {
            return Vec::new();
        }
        let eliminations: [u16; CELLS] = position.masks.map(|mask| DIGITS & !mask);
        let Ok(base) = self.prepare(&position.board, &eliminations) else {
            return Vec::new();
        };
        if self.trial_failure(&base).is_some() {
            return Vec::new();
        }
        let mut proofs = Vec::new();
        for (cell, &mask) in base.masks.iter().enumerate() {
            // A value already forced by an individual rule doesn't need testing.
            if mask.count_ones() < 2 {
                continue;
            }
            for digit in digits(mask) {
                // The base position already incorporates the existing digits
                // and removals. Propagate only this placement, without another assumption.
                let trial = self.propagate_placement(&base, cell, digit);
                let Some(contradiction) = self.trial_failure(&trial) else {
                    continue;
                };
                let assumption = Candidate { cell, digit };
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::Classic(Technique::ForcingChain),
                    actions: vec![HintAction::Eliminate(assumption)],
                    evidence: VariantEvidence::RuleForcing {
                        assumption,
                        contradiction,
                    },
                });
                if proofs.len() == limit {
                    return proofs;
                }
            }
        }
        proofs
    }

    fn trial_failure(&self, position: &SearchPosition) -> Option<VariantTrialFailure> {
        if let Some(cell) =
            (0..CELLS).find(|&cell| position.board[cell] == 0 && position.masks[cell] == 0)
        {
            return Some(VariantTrialFailure::EmptyCell { cell });
        }
        for &index in &self.search_houses {
            let house = &self.houses[index];
            let supported = house.cells.iter().fold(0, |mask, &cell| {
                let digit = position.board[cell];
                mask | if digit == 0 {
                    position.masks[cell]
                } else {
                    digit_bit(digit)
                }
            });
            if let Some(digit) = digits(DIGITS & !supported).next() {
                return Some(VariantTrialFailure::MissingDigit {
                    house: house.kind,
                    digit,
                });
            }
        }
        None
    }
}
