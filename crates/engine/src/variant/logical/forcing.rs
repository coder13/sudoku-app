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
        let region_chain = self.region_logic && !self.classic_boxes;
        if self.quadruples.is_empty() && !region_chain {
            return Vec::new();
        }
        let eliminations: [u16; CELLS] = position.masks.map(|mask| DIGITS & !mask);
        let base = if region_chain {
            SearchPosition {
                board: position.board,
                masks: position.masks,
            }
        } else if let Ok(base) = self.prepare(&position.board, &eliminations) {
            base
        } else {
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
                let assumption = Candidate { cell, digit };
                let mut placements = Vec::new();
                let contradiction = if region_chain {
                    self.region_trial(&base, assumption, &mut placements)
                } else {
                    self.trial_failure(&self.propagate_placement(&base, cell, digit))
                };
                let Some(contradiction) = contradiction else {
                    continue;
                };
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::Classic(Technique::ForcingChain),
                    actions: vec![HintAction::Eliminate(assumption)],
                    evidence: VariantEvidence::RuleForcing {
                        assumption,
                        placements,
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

    fn region_trial(
        &self,
        base: &SearchPosition,
        mut placement: Candidate,
        steps: &mut Vec<(Candidate, Option<VariantHouseKind>)>,
    ) -> Option<VariantTrialFailure> {
        let mut trial = base.clone();
        loop {
            trial.board[placement.cell] = placement.digit;
            trial.masks[placement.cell] = 0;
            for other in crate::variant::cells_in(self.peers[placement.cell]) {
                trial.masks[other] &= !digit_bit(placement.digit);
            }
            if let Some(failure) = self.trial_failure(&trial) {
                return Some(failure);
            }
            let (next, house) = self.next_trial_single(&trial)?;
            steps.push((next, house));
            placement = next;
        }
    }

    fn next_trial_single(
        &self,
        trial: &SearchPosition,
    ) -> Option<(Candidate, Option<VariantHouseKind>)> {
        if let Some(cell) = trial.masks.iter().position(|m| m.is_power_of_two()) {
            return Some((
                Candidate {
                    cell,
                    digit: trial.masks[cell].trailing_zeros() as u8 + 1,
                },
                None,
            ));
        }
        for &i in &self.search_houses {
            let house = &self.houses[i];
            let (mut supported, mut repeated) = (0, 0);
            for &cell in &house.cells {
                repeated |= supported & trial.masks[cell];
                supported |= trial.masks[cell];
            }
            if let Some(digit) = digits(supported & !repeated).next() {
                let cell = *house
                    .cells
                    .iter()
                    .find(|&&c| trial.masks[c] & digit_bit(digit) != 0)?;
                return Some((Candidate { cell, digit }, Some(house.kind)));
            }
        }
        None
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
