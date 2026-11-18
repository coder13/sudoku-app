//! Finite alternatives certify removals without an exact-solver assumption.

use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantExclusionPremise,
    VariantHouseKind, VariantTechnique, cells_in, digit_bit, digits,
};
use crate::{CELLS, Candidate, HintAction};

enum Conflict<'a> {
    Cell,
    House(VariantHouseKind),
    Rule(&'a [usize]),
}

impl CompiledVariant {
    pub(super) fn nonconsecutive_exclusions(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        use VariantTechnique::*;
        if !self.pair_clues.iter().any(|clue| clue.source.id == NonConsecutive.id()) {
            return;
        }
        match technique {
            NonConsecutiveLockedPair | NonConsecutiveLockedTriple => {
                let width = if technique == NonConsecutiveLockedPair {
                    2
                } else {
                    3
                };
                for house in &self.houses {
                    let placed = house.cells.iter().fold(0, |mask, &cell| {
                        mask | if position.board[cell] == 0 {
                            0
                        } else {
                            digit_bit(position.board[cell])
                        }
                    });
                    for digit in digits(crate::DIGITS & !placed) {
                        let sites = house.cells.iter().fold(0u128, |mask, &cell| {
                            mask | if position.masks[cell] & digit_bit(digit) != 0 {
                                1 << cell
                            } else {
                                0
                            }
                        });
                        if !(2..=width).contains(&sites.count_ones()) {
                            continue;
                        }
                        let targets =
                            cells_in(sites).fold((1u128 << CELLS) - 1, |targets, cell| {
                                targets & (self.nonconsecutive_neighbors(cell) | (1 << cell))
                            });
                        for target in cells_in(targets) {
                            if (sites | (1 << target)).count_ones() != width {
                                continue;
                            }
                            let premise = VariantExclusionPremise::House {
                                house: house.kind,
                                digit,
                                cells: cells_in(sites).collect(),
                            };
                            let neighbors =
                                (digit_bit(digit) << 1 | digit_bit(digit) >> 1) & crate::DIGITS;
                            if let Some(proof) = exclusion(
                                position,
                                technique,
                                premise,
                                target,
                                neighbors,
                                |source, target| self.nonconsecutive_conflict(source, target),
                            ) {
                                proofs.push(proof);
                            }
                        }
                    }
                }
            }
            NonConsecutiveBivalue | NonConsecutiveTrivalue => {
                for (cell, &domain) in position.masks.iter().enumerate() {
                    let count = domain.count_ones();
                    if !(2..=3).contains(&count) {
                        continue;
                    }
                    let first = domain.trailing_zeros();
                    let last = u16::BITS - 1 - domain.leading_zeros();
                    let removed = match technique {
                        NonConsecutiveBivalue if count == 2 && last - first == 1 => domain,
                        NonConsecutiveTrivalue if last - first == 2 => 1 << (first + 1),
                        _ => continue,
                    };
                    for target in cells_in(self.nonconsecutive_neighbors(cell)) {
                        if let Some(proof) = exclusion(
                            position,
                            technique,
                            VariantExclusionPremise::Cell { cell, domain },
                            target,
                            removed,
                            |source, target| self.nonconsecutive_conflict(source, target),
                        ) {
                            proofs.push(proof);
                        }
                    }
                }
            }
            _ => unreachable!("only the named Non-Consecutive exclusions use this search"),
        }
    }

    fn nonconsecutive_neighbors(&self, cell: usize) -> u128 {
        self.pair_clue_memberships[cell]
            .iter()
            .fold(0, |neighbors, &index| {
                let clue = &self.pair_clues[index];
                if clue.source.id == VariantTechnique::NonConsecutive.id() {
                    neighbors | (1 << clue.cells[usize::from(clue.cells[0] == cell)])
                } else {
                    neighbors
                }
            })
    }

    fn nonconsecutive_conflict(
        &self,
        source: Candidate,
        target: Candidate,
    ) -> Option<Conflict<'_>> {
        if source.cell == target.cell {
            return (source.digit != target.digit).then_some(Conflict::Cell);
        }
        if source.digit == target.digit {
            return self.memberships[source.cell]
                .iter()
                .find(|index| self.memberships[target.cell].contains(index))
                .map(|&index| Conflict::House(self.houses[index].kind));
        }
        self.pair_clue_memberships[source.cell]
            .iter()
            .find_map(|&index| {
                let clue = &self.pair_clues[index];
                if clue.source.id != VariantTechnique::NonConsecutive.id() {
                    return None;
                }
                let relation = clue.binary_relation()?;
                let permits = if relation.cells == [source.cell, target.cell] {
                    relation.permits(source.digit, target.digit)
                } else if relation.cells == [target.cell, source.cell] {
                    relation.permits(target.digit, source.digit)
                } else {
                    return None;
                };
                (!permits).then_some(Conflict::Rule(&clue.source.indices))
            })
    }
}

// The proof records the complete alternatives and the premises of every
// conflict. A missing conflict leaves that candidate unchanged.
fn exclusion<'a>(
    position: &ProofPosition<'_>,
    technique: VariantTechnique,
    premise: VariantExclusionPremise,
    target: usize,
    removed: u16,
    conflict: impl Fn(Candidate, Candidate) -> Option<Conflict<'a>>,
) -> Option<VariantDeduction> {
    let alternatives: Vec<_> = match &premise {
        VariantExclusionPremise::Cell { cell, domain } => digits(*domain)
            .map(|digit| Candidate { cell: *cell, digit })
            .collect(),
        VariantExclusionPremise::House { cells, digit, .. } => cells
            .iter()
            .map(|&cell| Candidate {
                cell,
                digit: *digit,
            })
            .collect(),
    };
    let mut actions = Vec::new();
    let mut rules = Vec::new();
    let mut houses = Vec::new();
    for digit in digits(removed & position.masks[target]) {
        let target = Candidate {
            cell: target,
            digit,
        };
        let conflicts: Option<Vec<_>> = alternatives
            .iter()
            .map(|&source| conflict(source, target))
            .collect();
        let Some(conflicts) = conflicts else { continue };
        if !conflicts
            .iter()
            .any(|conflict| matches!(conflict, Conflict::Rule(_)))
        {
            continue;
        }
        actions.push(HintAction::Eliminate(target));
        for conflict in conflicts {
            match conflict {
                Conflict::Cell => {}
                Conflict::House(house) => {
                    if !houses.contains(&house) {
                        houses.push(house);
                    }
                }
                Conflict::Rule(indices) => rules.extend(indices),
            }
        }
    }
    if actions.is_empty() {
        return None;
    }
    rules.sort_unstable();
    rules.dedup();
    Some(VariantDeduction {
        technique,
        actions,
        evidence: VariantEvidence::Exclusion {
            premise,
            rules,
            houses,
        },
    })
}
