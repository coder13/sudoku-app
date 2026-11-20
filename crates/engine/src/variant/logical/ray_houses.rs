use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantRayHouseProof,
    VariantTechnique,
};
use crate::variant::lines::{
    LineConstraint,
    ray_houses::{RayHouses, ray_support},
    renban_sum::{ContainedJoin, contained_joins},
};

const ASSIGNMENT_NODES: u32 = 32_768;

impl CompiledVariant {
    pub(super) fn ray_house_proofs(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        if technique == VariantTechnique::LittleKillerHouseSupport {
            for ray in &self.lines {
                if let Some(proof) = self.ray_house_proof(position, technique, ray, None) {
                    proofs.push(proof);
                }
            }
        } else {
            for join in contained_joins(self) {
                if let Some(proof) =
                    self.ray_house_proof(position, technique, join.ray(), Some(join))
                {
                    proofs.push(proof);
                }
            }
        }
    }

    fn ray_house_proof(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        ray: &LineConstraint,
        join: Option<ContainedJoin<'_>>,
    ) -> Option<VariantDeduction> {
        let total = ray.little_killer_sum()?;
        let members = join.map_or(0, |join| join.members());
        let cells = &ray.cells;
        let houses = RayHouses::from_puzzle(self, cells, members);
        if houses.houses.is_empty() {
            return None;
        }

        let mut domains = [0; 9];
        let domains = &mut domains[..cells.len()];
        for (mask, &cell) in domains.iter_mut().zip(cells) {
            *mask = position.domain(cell);
        }
        let mut baseline = [0; 9];
        if let Some(join) = join {
            baseline = join.support(domains).masks;
        } else {
            ray.support(domains, &mut baseline[..cells.len()]);
        }
        if baseline[0] == 0 {
            return None;
        }

        let supported = ray_support(
            &baseline[..cells.len()],
            &houses,
            members,
            total,
            ASSIGNMENT_NODES,
        )?;
        if supported[0] == 0 || supported == baseline {
            return None;
        }
        if join.is_some() {
            // A candidate removed by the simpler house proof belongs to that
            // technique. The true mixed proof needs both the Renban and houses.
            let pure_houses = RayHouses::from_puzzle(self, cells, 0);
            let pure = ray_support(domains, &pure_houses, 0, total, ASSIGNMENT_NODES)?;
            for (mask, pure) in baseline.iter_mut().zip(pure) {
                *mask &= pure;
            }
        }
        let actions = position.removals(
            cells,
            supported
                .into_iter()
                .zip(baseline)
                .map(|(both, base)| both | !base),
        );
        (!actions.is_empty()).then(|| VariantDeduction {
            technique,
            actions,
            evidence: VariantEvidence::RayHouses(Box::new(VariantRayHouseProof {
                rules: join.map_or_else(|| vec![ray.rule_index], |join| join.rules().to_vec()),
                cells: cells.clone(),
                domains: domains.to_vec(),
                houses: houses.houses,
                supported: supported[..cells.len()].to_vec(),
            })),
        })
    }
}
