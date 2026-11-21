use std::collections::BTreeMap;

use super::{
    ProofPosition, VariantDeduction, VariantEvidence, VariantGroupSumChainProof, VariantTechnique,
};
use crate::{CELLS, Candidate, DIGITS, HintAction, hints::digits, variant::CompiledVariant};

#[derive(Clone, Debug, Default)]
struct RuleProofs {
    pairs: Vec<usize>,
    lines: Vec<usize>,
}

#[derive(Clone, Debug)]
pub(in crate::variant) struct RuleProofIndex(BTreeMap<VariantTechnique, RuleProofs>);

impl CompiledVariant {
    fn index_rule_proofs(&self) -> RuleProofIndex {
        let mut by_technique: BTreeMap<_, RuleProofs> = BTreeMap::new();
        for (index, clue) in self.pair_clues.iter().enumerate() {
            by_technique
                .entry(clue.source.technique)
                .or_default()
                .pairs
                .push(index);
        }
        for (index, line) in self.lines.iter().enumerate() {
            by_technique
                .entry(line.technique)
                .or_default()
                .lines
                .push(index);
        }
        RuleProofIndex(by_technique)
    }

    pub(super) fn direct_pair_proofs(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        if let Some(scopes) = self
            .rule_proofs
            .get_or_init(|| self.index_rule_proofs())
            .0
            .get(&technique)
        {
            let domains = std::array::from_fn(|cell| position.domain(cell));
            for &index in &scopes.pairs {
                let clue = &self.pair_clues[index];
                let mut supported = domains;
                clue.restrict(&mut supported);
                if let Some(proof) = position.explain_constraint(
                    technique,
                    &clue.source.indices,
                    &clue.cells,
                    clue.cells.iter().map(|&cell| supported[cell]),
                ) {
                    proofs.push(proof);
                }
            }
        }
        if matches!(
            technique,
            VariantTechnique::Xv | VariantTechnique::AdjacentTotal
        ) {
            self.sum_pair_proofs(position, technique, proofs);
        }
    }

    pub(super) fn direct_line_proofs(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let index = self.rule_proofs.get_or_init(|| self.index_rule_proofs());
        let Some(scopes) = index.0.get(&technique) else {
            return;
        };
        let triplet_inputs = matches!(
            technique,
            VariantTechnique::Entropic | VariantTechnique::Modular
        )
        .then(|| {
            let domains: [u16; CELLS] = std::array::from_fn(|cell| position.domain(cell));
            let narrow = position
                .masks
                .iter()
                .enumerate()
                .filter(|(_, mask)| matches!(mask.count_ones(), 1 | 2))
                .fold(0, |mask, (cell, _)| mask | (1u128 << cell));
            (domains, narrow)
        });
        for &index in &scopes.lines {
            let line = &self.lines[index];
            let len = line.cells.len();
            let mut domains = [0; CELLS];
            for (slot, &cell) in domains.iter_mut().zip(&line.cells) {
                *slot = position.domain(cell);
            }
            let mut supported = [0; CELLS];
            line.support(&domains[..len], &mut supported[..len]);
            if let Some(proof) = position.explain_constraint(
                technique,
                &[line.rule_index],
                &line.cells,
                supported[..len].iter().copied(),
            ) {
                proofs.push(proof);
            }
            line.visit_group_house_removals(
                self,
                &domains[..len],
                &supported[..len],
                |house, cells, domains, removals| {
                    let actions =
                        position.removals(&cells, removals.into_iter().map(|mask| DIGITS & !mask));
                    if !actions.is_empty() {
                        proofs.push(VariantDeduction {
                            technique,
                            actions,
                            evidence: VariantEvidence::GroupLineHouse {
                                rule: line.rule_index,
                                house,
                                cells,
                                domains,
                            },
                        });
                    }
                },
            );
            if let Some((domains, narrow)) = &triplet_inputs {
                line.visit_group_house_triplets(
                    self,
                    domains,
                    &supported[..len],
                    *narrow,
                    |house, cells, domains, removals| {
                        let removed = position.masks[cells[0]] & removals;
                        if removed != 0 {
                            proofs.push(VariantDeduction {
                                technique,
                                actions: digits(removed)
                                    .map(|digit| {
                                        HintAction::Eliminate(Candidate {
                                            cell: cells[0],
                                            digit,
                                        })
                                    })
                                    .collect(),
                                evidence: VariantEvidence::GroupLineHouseTriplet {
                                    rule: line.rule_index,
                                    house,
                                    cells,
                                    domains,
                                },
                            });
                        }
                    },
                );
            }
        }
        for clue in self
            .group_sum_houses
            .iter()
            .filter(|clue| clue.technique == technique.id())
        {
            let domains = clue.cells.map(|cell| position.domain(cell));
            let removed = position.masks[clue.cells[0]] & clue.removals(domains);
            if removed != 0 {
                proofs.push(VariantDeduction {
                    technique,
                    actions: digits(removed)
                        .map(|digit| {
                            HintAction::Eliminate(Candidate {
                                cell: clue.cells[0],
                                digit,
                            })
                        })
                        .collect(),
                    evidence: VariantEvidence::GroupLineSumHouse {
                        rules: clue.rules,
                        house: clue.house,
                        cells: clue.cells,
                        domains,
                        total: clue.total,
                    },
                });
            }
        }
        for clue in self
            .disjoint_group_sums
            .iter()
            .filter(|clue| clue.technique == technique.id())
        {
            let domains = clue.cells.map(|cell| position.domain(cell));
            let removals = clue.removals(domains);
            for (&cell, mask) in clue.cells.iter().zip(removals) {
                let removed = position.masks[cell] & mask;
                if removed != 0 {
                    proofs.push(VariantDeduction {
                        technique,
                        actions: digits(removed)
                            .map(|digit| HintAction::Eliminate(Candidate { cell, digit }))
                            .collect(),
                        evidence: VariantEvidence::GroupLineDisjointSum {
                            rules: clue.rules,
                            cells: clue.cells,
                            domains,
                            houses: clue.houses.clone(),
                            total: clue.total,
                        },
                    });
                }
            }
        }
        for clue in self
            .group_sum_chains
            .iter()
            .filter(|clue| clue.technique == technique.id())
        {
            let domains = clue.cells.map(|cell| position.domain(cell));
            let Some(support) = clue.support(domains) else {
                continue;
            };
            let house = clue.house.map(|index| &self.houses[index]);
            let actions = if let Some(house) = house {
                let allowed = house.cells.iter().map(|cell| {
                    let removed = clue
                        .cells
                        .iter()
                        .position(|site| site == cell)
                        .map_or(support.locked, |index| support.removed[index]);
                    DIGITS & !removed
                });
                position.removals(&house.cells, allowed)
            } else {
                position.removals(&clue.cells, support.removed.map(|mask| DIGITS & !mask))
            };
            if !actions.is_empty() {
                proofs.push(VariantDeduction {
                    technique,
                    actions,
                    evidence: VariantEvidence::GroupLineSumChain(Box::new(
                        VariantGroupSumChainProof {
                            rules: clue.rules,
                            house: house.map(|house| house.kind),
                            houses: clue.houses.clone(),
                            cells: clue.cells,
                            domains,
                            totals: clue.totals,
                            supported: support.supported,
                            locked: support.locked,
                        },
                    )),
                });
            }
        }
        for clue in self
            .group_sum_phases
            .iter()
            .filter(|clue| clue.technique == technique.id())
        {
            let domains = clue.cells.map(|cell| position.domain(cell));
            let Some((removed, anchor, fixed)) =
                clue.removals(domains, |cell| position.domain(cell))
            else {
                continue;
            };
            let actions = position.removals(&clue.cells, removed.map(|mask| DIGITS & !mask));
            if !actions.is_empty() {
                let [endpoint, partner, target] = clue.cells;
                let [a, b, c] = domains;
                proofs.push(VariantDeduction {
                    technique,
                    actions,
                    evidence: VariantEvidence::GroupLinePhaseSum {
                        rules: clue.rules,
                        cells: [endpoint, partner, target, anchor],
                        domains: [a, b, c, fixed],
                        total: clue.total,
                        house: clue.house,
                    },
                });
            }
        }
        if technique == VariantTechnique::Modular {
            for clue in &self.modular_sums {
                let supported = clue
                    .cells
                    .iter()
                    .zip(&clue.allowed)
                    .map(|(&cell, &mask)| position.domain(cell) & mask);
                if let Some(proof) =
                    position.explain_constraint(technique, &clue.rules, &clue.cells, supported)
                {
                    proofs.push(proof);
                }
            }
        }
    }
}
