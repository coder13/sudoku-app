use super::{ProofPosition, VariantDeduction, VariantEvidence, VariantTechnique};
use crate::variant::{CompiledVariant, VariantHouseKind};

impl CompiledVariant {
    pub(super) fn cage_combinations(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for cage in &self.cages {
            let domains: Vec<_> = cage
                .cells
                .iter()
                .map(|&cell| position.domain(cell))
                .collect();
            let support = cage.support(&domains);
            if let Some(proof) = cage_proof(
                position,
                &cage.cells,
                domains,
                &support,
                cage.sum,
                None,
                &[cage.reference],
            ) {
                proofs.push(proof);
            }
        }
    }

    pub(super) fn cage_house_sums(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for scope in self.cage_house_sum_scopes() {
            let domains: Vec<_> = scope
                .cells
                .iter()
                .map(|&cell| position.domain(cell))
                .collect();
            let support = scope.support(&domains);
            if let Some(proof) = cage_proof(
                position,
                &scope.cells,
                domains,
                &support,
                scope.sum,
                Some(scope.house),
                &scope.cages,
            ) {
                proofs.push(proof);
            }
        }
    }
}

fn cage_proof(
    position: &ProofPosition<'_>,
    cells: &[usize],
    domains: Vec<u16>,
    support: &[u16],
    sum: u16,
    house: Option<VariantHouseKind>,
    cages: &[[usize; 2]],
) -> Option<VariantDeduction> {
    if support[0] == 0 {
        return None;
    }
    let actions = position.removals(cells, support.iter().copied());
    if actions.is_empty() {
        return None;
    }
    Some(VariantDeduction {
        technique: if house.is_some() {
            VariantTechnique::CageHouseSum
        } else {
            VariantTechnique::CageCombinations
        },
        evidence: VariantEvidence::CageSum {
            house,
            cages: cages.to_vec(),
            sum,
            cells: cells.to_vec(),
            domains,
        },
        actions,
    })
}
