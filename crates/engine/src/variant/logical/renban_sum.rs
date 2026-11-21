use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantRenbanSumHouseProof,
    VariantRenbanSumProof, VariantTechnique,
};
use crate::variant::lines::renban_sum::{contained_joins, with_house::house_joins};

impl CompiledVariant {
    pub(super) fn renban_sum_proofs(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for join in contained_joins(self) {
            let cells = join.cells();
            let mut domains = [0; 9];
            let domains = &mut domains[..cells.len()];
            for (mask, &cell) in domains.iter_mut().zip(cells) {
                *mask = position.domain(cell);
            }
            let joint = join.support(domains);
            if joint.starts == 0 {
                continue;
            }
            let individual = join.individual_support(domains);
            // This proof only removes candidates supported by each clue on its own.
            let actions = position.removals(
                cells,
                joint
                    .masks
                    .into_iter()
                    .zip(individual)
                    .map(|(both, each)| both | !each),
            );
            if !actions.is_empty() {
                proofs.push(VariantDeduction {
                    technique,
                    actions,
                    evidence: VariantEvidence::RenbanSum(Box::new(VariantRenbanSumProof {
                        rules: join.rules(),
                        cells: cells.to_vec(),
                        domains: domains.to_vec(),
                        supported: joint.masks[..cells.len()].to_vec(),
                        starts: joint.starts,
                    })),
                });
            }
        }
    }

    pub(super) fn renban_sum_house_proofs(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for join in house_joins(self) {
            let ray = join.pair.cells();
            let other = &join.other.cells;
            let mut ray_domains = [0; 9];
            let ray_domains = &mut ray_domains[..ray.len()];
            for (mask, &cell) in ray_domains.iter_mut().zip(ray) {
                *mask = position.domain(cell);
            }
            let mut other_domains = [0; 9];
            let other_domains = &mut other_domains[..other.len()];
            for (mask, &cell) in other_domains.iter_mut().zip(other) {
                *mask = position.domain(cell);
            }
            let support = join.support(ray_domains, other_domains);
            if support.with_house[0] == 0 {
                continue;
            }
            let actions = position.removals(
                ray,
                support
                    .with_house
                    .into_iter()
                    .zip(support.without_house)
                    .map(|(linked, unlinked)| linked | !unlinked),
            );
            if actions.is_empty() {
                continue;
            }

            let witness = join.witness(ray_domains, other_domains, actions[0].candidate());
            let [contained, sum] = join.pair.rules();
            let shared = ray[join.pivot];
            let cells: Vec<_> = ray
                .iter()
                .chain(other.iter().filter(|&&cell| cell != shared))
                .copied()
                .collect();
            let domains = cells.iter().map(|&cell| position.domain(cell)).collect();
            proofs.push(VariantDeduction {
                technique,
                actions,
                evidence: VariantEvidence::RenbanSumHouse(Box::new(VariantRenbanSumHouseProof {
                    rules: [contained, sum, join.other.rule_index],
                    cells,
                    domains,
                    house: join.house,
                    shared,
                    restricted: ray[join.bridge],
                    supported: support.with_house[..ray.len()].to_vec(),
                    witness,
                })),
            });
        }
    }
}
