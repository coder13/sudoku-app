//! Whispers deductions whose proof also needs shared houses.

use super::*;

const ASSIGNMENT_NODES: u32 = 32_768;

impl CompiledVariant {
    pub(super) fn whispers_house_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for clue in self
            .pair_clues
            .iter()
            .filter(|clue| clue.source.technique.id() == "whispers")
        {
            let scope = clue
                .cells
                .iter()
                .fold(0u128, |scope, &cell| scope | (1u128 << cell));
            // Prefer a house covering more line pairs; omit houses whose
            // equal-digit exclusions are already supplied by the evidence.
            let mut candidates: Vec<_> = self
                .houses
                .iter()
                .filter_map(|house| {
                    let shared = house
                        .cells
                        .iter()
                        .fold(0u128, |mask, &cell| mask | (1u128 << cell))
                        & scope;
                    (shared.count_ones() > 1).then_some((house, shared))
                })
                .collect();
            candidates.sort_by_key(|(_, shared)| std::cmp::Reverse(shared.count_ones()));
            let mut peers = [0u128; CELLS];
            let mut houses = Vec::new();
            for (house, shared) in candidates {
                if cells_in(shared).all(|cell| (shared & !(1u128 << cell)) & !peers[cell] == 0) {
                    continue;
                }
                for cell in cells_in(shared) {
                    peers[cell] |= shared & !(1u128 << cell);
                }
                houses.push(house);
            }
            if houses.is_empty() {
                continue;
            }
            let domains = std::array::from_fn(|cell| position.domain(cell));
            let mut basic = domains;
            clue.restrict(&mut basic);
            let Some((supported, assignments)) =
                clue.house_support(&basic, &peers, ASSIGNMENT_NODES)
            else {
                continue;
            };
            if assignments == 0 {
                continue;
            }
            // Keep the basic line technique as the explanation for its own moves.
            let mut actions: Vec<_> = clue
                .cells
                .iter()
                .flat_map(|&cell| {
                    digits(position.masks[cell] & basic[cell] & !supported[cell])
                        .map(move |digit| HintAction::Eliminate(Candidate { cell, digit }))
                })
                .collect();
            actions.sort_unstable();
            if actions.is_empty() {
                continue;
            }
            proofs.push(VariantDeduction {
                technique: VariantTechnique::WhispersHouseSupport,
                actions,
                evidence: VariantEvidence::LineHouses(Box::new(VariantLineHouseProof {
                    rules: clue.source.indices.clone(),
                    cells: clue.cells.clone(),
                    domains: clue.cells.iter().map(|&cell| domains[cell]).collect(),
                    supported: clue.cells.iter().map(|&cell| supported[cell]).collect(),
                    houses: houses.iter().map(|house| house.kind).collect(),
                    assignments,
                })),
            });
        }
    }
}
