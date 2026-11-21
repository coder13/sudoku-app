use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantGroupLineHouseCase,
    VariantGroupLineHouseConflict, VariantGroupLineHouseProof, VariantTechnique,
};
use crate::{CELLS, DIGITS, hints::digit_bit, variant::search::record_support};

impl CompiledVariant {
    pub(super) fn group_line_house_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for source in &self.lines {
            let Some(line) = source.group_line() else {
                continue;
            };
            if source.cells.len() < 2 {
                continue;
            }
            let mut line_domains = [0; CELLS];
            let line_domains = &mut line_domains[..source.cells.len()];
            let mut phases = [None; CELLS];
            for ((&cell, &phase), domain) in source
                .cells
                .iter()
                .zip(line.phase_indices())
                .zip(line_domains.iter_mut())
            {
                phases[cell] = Some(phase);
                *domain = position.domain(cell);
            }
            let orders: Vec<_> = line.possible_orders(line_domains).collect();
            if orders.is_empty() {
                continue;
            }
            let phase_support = orders.iter().fold([0; 3], |union, order| {
                std::array::from_fn(|i| union[i] | order[i])
            });

            for &house in &self.search_houses {
                let house = &self.houses[house];
                let slots = house.cells.map(|cell| phases[cell]);
                if slots.iter().flatten().count() < 2 {
                    continue;
                }
                let domains = house.cells.map(|cell| position.domain(cell));
                if orders.len() == 6 && domains.iter().all(|&domain| domain == DIGITS) {
                    continue;
                }

                let tested = |order: [u16; 3]| {
                    std::array::from_fn::<_, 9, _>(|i| {
                        domains[i] & slots[i].map_or(DIGITS, |phase| order[phase])
                    })
                };
                let mut supported = [0; 9];
                let mut fit = [false; 6];
                for (i, &order) in orders.iter().enumerate() {
                    let masks = tested(order);
                    if !masks.contains(&0) {
                        fit[i] = record_support::<9, 512>(
                            DIGITS,
                            &masks,
                            &mut supported,
                            &mut [None; 512],
                        );
                    }
                }
                if !fit.into_iter().any(|matched| matched) {
                    continue;
                }
                let line_only = slots.map(|phase| phase.map_or(DIGITS, |p| phase_support[p]));
                if (0..9).all(|i| domains[i] & line_only[i] & !supported[i] == 0) {
                    continue;
                }
                // Leave moves already explained by one rule to its cheaper detector.
                let mut house_only = [0; 9];
                record_support::<9, 512>(DIGITS, &domains, &mut house_only, &mut [None; 512]);
                let actions = position.removals(
                    &house.cells,
                    (0..9).map(|i| supported[i] | !(line_only[i] & house_only[i])),
                );
                if actions.is_empty() {
                    continue;
                }
                let cases = orders
                    .iter()
                    .zip(fit)
                    .map(|(&order, matched)| VariantGroupLineHouseCase {
                        groups: order,
                        conflict: (!matched).then(|| count_conflict(&house.cells, &tested(order))),
                    })
                    .collect();
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::GroupLineHouseSupport,
                    actions,
                    evidence: VariantEvidence::GroupLineHouseSupport(Box::new(
                        VariantGroupLineHouseProof {
                            rule: source.rule_index,
                            line_cells: source.cells.clone(),
                            line_domains: line_domains.to_vec(),
                            phases: line.phase_indices().to_vec(),
                            house: house.kind,
                            cells: house.cells,
                            domains,
                            supported,
                            cases,
                        },
                    )),
                });
            }
        }
    }
}

pub(super) fn count_conflict(cells: &[usize; 9], domains: &[u16; 9]) -> VariantGroupLineHouseConflict {
    let digit_locations: [u16; 9] = std::array::from_fn(|i| {
        let digit = digit_bit(i as u8 + 1);
        domains.iter().enumerate().fold(0, |mask, (slot, &domain)| {
            mask | if domain & digit != 0 { 1 << slot } else { 0 }
        })
    });
    let mut cell_unions = [0u16; 512];
    let mut digit_unions = [0u16; 512];
    let mut smallest = 10;
    let mut witness = None;
    for subset in 1..=511usize {
        let first = subset.trailing_zeros() as usize;
        let rest = subset & (subset - 1);
        cell_unions[subset] = cell_unions[rest] | domains[first];
        digit_unions[subset] = digit_unions[rest] | digit_locations[first];
        let count = subset.count_ones();
        if count >= smallest {
            continue;
        }
        if digit_unions[subset].count_ones() < count {
            smallest = count;
            witness = Some((digit_unions[subset], subset as u16));
        } else if cell_unions[subset].count_ones() < count {
            smallest = count;
            witness = Some((subset as u16, cell_unions[subset]));
        }
        if smallest == 1 {
            break;
        }
    }
    let (slots, digits) = witness.expect("a failed house matching has an insufficient subset");
    VariantGroupLineHouseConflict {
        cells: cells
            .iter()
            .enumerate()
            .filter_map(|(i, &cell)| (slots & (1 << i) != 0).then_some(cell))
            .collect(),
        digits,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{PuzzleRule, VariantHouseKind, VariantPuzzle};

    fn literal(domains: &[u16; 9]) -> [u16; 9] {
        fn visit(
            domains: &[u16; 9],
            slot: usize,
            used: u16,
            values: &mut [u16; 9],
            support: &mut [u16; 9],
        ) {
            if slot == 9 {
                for (used, mask) in values.iter().zip(support) {
                    *mask |= used;
                }
                return;
            }
            for digit in 1..=9 {
                let mask = digit_bit(digit);
                if domains[slot] & mask & !used != 0 {
                    values[slot] = mask;
                    visit(domains, slot + 1, used | mask, values, support);
                }
            }
        }

        let mut support = [0; 9];
        visit(domains, 0, 0, &mut [0; 9], &mut support);
        support
    }

    fn replay(proof: &VariantGroupLineHouseProof) {
        let mut all = [0; 9];
        for case in &proof.cases {
            let possible = proof.cells.map(|cell| {
                let slot = proof.cells.iter().position(|&c| c == cell).unwrap();
                let phase = proof.line_cells.iter().position(|&c| c == cell);
                proof.domains[slot] & phase.map_or(DIGITS, |i| case.groups[proof.phases[i]])
            });
            let support = literal(&possible);
            assert_eq!(support[0] == 0, case.conflict.is_some());
            if let Some(conflict) = &case.conflict {
                let digit_count = conflict.digits.count_ones() as usize;
                let count = conflict.cells.len();
                assert_ne!(digit_count, count);
                for (&cell, &mask) in proof.cells.iter().zip(&possible) {
                    if count < digit_count && mask & conflict.digits != 0 {
                        assert!(conflict.cells.contains(&cell));
                    }
                    if count > digit_count && conflict.cells.contains(&cell) {
                        assert_eq!(mask & !conflict.digits, 0);
                    }
                }
            }
            for (mask, supported) in all.iter_mut().zip(support) {
                *mask |= supported;
            }
        }
        assert_eq!(all, proof.supported);
    }

    #[test]
    fn a_group_fixed_outside_a_house_can_eliminate_from_an_empty_house() {
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.rules.push(PuzzleRule::Entropic {
            cells: vec![0, 10, 20, 1, 11, 21, 2],
        });
        let mut eliminated = [0; CELLS];
        eliminated[10] = DIGITS & !digit_bit(4);
        eliminated[20] = DIGITS & !digit_bit(7);
        let compiled = puzzle.compile().unwrap();
        let deductions = compiled
            .deductions(
                &[0; CELLS],
                &eliminated,
                VariantTechnique::GroupLineHouseSupport,
            )
            .unwrap();
        let proof = deductions
            .iter()
            .find_map(|deduction| {
                let VariantEvidence::GroupLineHouseSupport(proof) = &deduction.evidence else {
                    return None;
                };
                (proof.house == VariantHouseKind::Row(0)).then_some(proof)
            })
            .unwrap();
        assert_eq!(&proof.supported[..3], &[7; 3]);
        assert_eq!(&proof.supported[3..], &[DIGITS ^ 7; 6]);
        replay(proof);
    }

    #[cfg(feature = "wasm-api")]
    #[test]
    fn both_published_row_four_counts_match_literal_house_assignments() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/entropic-coach.json"
        ))
        .unwrap();
        for (id, raw, survivors) in [
            (
                "Hyk5",
                vec![(27, 175), (30, 175), (32, 175), (35, 175)],
                vec![[7, 56, 448], [56, 7, 448]],
            ),
            (
                "Hafj",
                vec![(29, 15), (33, 15), (34, 448)],
                vec![[7, 56, 448], [448, 56, 7]],
            ),
        ] {
            let source = fixture["examples"]
                .as_array()
                .unwrap()
                .iter()
                .find(|source| source["url"].as_str().unwrap().ends_with(id))
                .unwrap();
            let puzzle = serde_json::from_value::<VariantPuzzle>(source["puzzle"].clone()).unwrap();
            let solution = source["solution"].as_str().unwrap().as_bytes();
            let compiled = puzzle.compile().unwrap();
            let mut eliminated = [0; CELLS];
            for (cell, domain) in raw {
                eliminated[cell] = DIGITS & !domain;
            }
            let checked = compiled
                .deductions(
                    &[0; CELLS],
                    &eliminated,
                    VariantTechnique::GroupLineHouseSupport,
                )
                .unwrap();
            let (deduction, proof) = checked
                .iter()
                .find_map(|deduction| {
                    let VariantEvidence::GroupLineHouseSupport(proof) = &deduction.evidence else {
                        return None;
                    };
                    (proof.rule == 0 && proof.house == VariantHouseKind::Row(3))
                        .then_some((deduction, proof))
                })
                .unwrap();
            assert_eq!(proof.line_cells.len(), if id == "Hyk5" { 36 } else { 21 });
            assert_eq!(
                proof
                    .cases
                    .iter()
                    .filter(|case| case.conflict.is_none())
                    .map(|case| case.groups)
                    .collect::<Vec<_>>(),
                survivors
            );
            assert!(
                proof
                    .cases
                    .iter()
                    .all(|case| case.groups.iter().all(|mask| mask.count_ones() == 3))
            );
            for action in &deduction.actions {
                let candidate = action.candidate();
                assert_ne!(solution[candidate.cell] - b'0', candidate.digit);
            }
            replay(proof);
            assert!(
                compiled
                    .deductions(
                        &[0; CELLS],
                        &[0; CELLS],
                        VariantTechnique::GroupLineHouseSupport
                    )
                    .unwrap()
                    .is_empty()
            );
        }
    }
}
