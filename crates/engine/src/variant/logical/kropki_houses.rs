use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantKropkiHouseProof,
    VariantTechnique,
};
use crate::{
    DIGITS,
    hints::{digit_bit, digits},
    variant::{VariantHouse, pairs::PairConstraint, search::record_support},
};

impl CompiledVariant {
    pub(super) fn kropki_house_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for clue in &self.pair_clues[self.kropki_marks.clone()] {
            let Some(relation) = clue.binary_relation() else {
                continue;
            };
            let [left, right] = relation.cells;
            if position.board[left] != 0 || position.board[right] != 0 {
                continue;
            }
            for &index in &self.memberships[left] {
                if self.house_masks[index] & (1u128 << right) != 0
                    && self.search_houses.binary_search(&index).is_ok()
                    && let Some(proof) = explain(
                        position,
                        relation,
                        &clue.source.indices,
                        &self.houses[index],
                    )
                {
                    proofs.push(proof);
                }
            }
        }
    }
}

fn explain(
    position: &ProofPosition<'_>,
    relation: &PairConstraint,
    rules: &[usize],
    house: &VariantHouse,
) -> Option<VariantDeduction> {
    let pair = relation.cells;
    let pair_domains = pair.map(|cell| position.domain(cell));
    let dot_only = relation.restrict(pair_domains);
    let domains = house.cells.map(|cell| position.domain(cell));
    let remaining: Vec<_> = house
        .cells
        .iter()
        .enumerate()
        .filter_map(|(index, cell)| (!pair.contains(cell)).then_some(index))
        .collect();
    let remaining_domains: Vec<_> = remaining.iter().map(|&index| domains[index]).collect();
    let mut pair_support = [0; 2];
    let mut remaining_support = [0; 7];
    let mut tested = [None; 512];
    for first in digits(dot_only[0]) {
        for second in digits(dot_only[1]).filter(|&second| relation.permits(first, second)) {
            let used = digit_bit(first) | digit_bit(second);
            // Both orders of one pair leave the same digits for the other cells.
            let fits = *tested[used as usize].get_or_insert_with(|| {
                record_support::<7, 512>(
                    DIGITS & !used,
                    &remaining_domains,
                    &mut remaining_support,
                    &mut [None; 512],
                )
            });
            if fits {
                pair_support[0] |= digit_bit(first);
                pair_support[1] |= digit_bit(second);
            }
        }
    }
    if pair_support[0] == 0
        || pair_support == dot_only && remaining_support.as_slice() == remaining_domains
    {
        return None;
    }

    // Report candidates supported by each premise on its own.
    let mut house_only = [0; 9];
    record_support::<9, 512>(DIGITS, &domains, &mut house_only, &mut [None; 512]);
    let mut actions = position.removals(
        &house.cells,
        house.cells.iter().enumerate().map(|(index, cell)| {
            if let Some(end) = pair.iter().position(|candidate| candidate == cell) {
                pair_support[end] | !(dot_only[end] & house_only[index])
            } else {
                let slot = remaining.iter().position(|&peer| peer == index).unwrap();
                remaining_support[slot] | !house_only[index]
            }
        }),
    );
    if actions.is_empty() {
        return None;
    }
    actions.sort_unstable();
    Some(VariantDeduction {
        technique: VariantTechnique::KropkiHouseSupport,
        actions,
        evidence: VariantEvidence::KropkiHouse(Box::new(VariantKropkiHouseProof {
            rules: rules.to_vec(),
            pair,
            house: house.kind,
            cells: house.cells,
            domains,
            tested: tested.iter().flatten().count(),
            locked: tested
                .iter()
                .enumerate()
                .filter_map(|(used, &fits)| (fits == Some(true)).then_some(used as u16))
                .fold(DIGITS, |common, used| common & used),
            rejected: tested
                .into_iter()
                .enumerate()
                .filter_map(|(used, fits)| (fits == Some(false)).then_some(used as u16))
                .collect(),
        })),
    })
}
