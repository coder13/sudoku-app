use super::{CompiledVariant, ProofPosition, VariantHouseKind, digits};
use crate::{
    Candidate, House, LinkSource, Technique,
    hints::{Deduction, InferenceGraph, visit_variant_inference},
};
use std::ops::ControlFlow;

impl CompiledVariant {
    pub(super) fn uses_variant_chains(&self, technique: Technique) -> bool {
        matches!(
            technique,
            Technique::XChain
                | Technique::XYChain
                | Technique::Aic
                | Technique::DiscontinuousNiceLoop
                | Technique::ContinuousNiceLoop
        ) && (!self.classic_boxes || self.houses.len() > 27 || !self.pair_clues.is_empty())
    }

    pub(super) fn visit_variant_chains(
        &self,
        position: &ProofPosition<'_>,
        technique: Technique,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let graph = position.variant_inference.get_or_init(|| {
            let houses = self.search_houses.iter().map(|&index| {
                let house = self.houses[index].kind;
                let source = match house {
                    VariantHouseKind::Row(row) => LinkSource::House(House::Row(row)),
                    VariantHouseKind::Column(column) => LinkSource::House(House::Column(column)),
                    VariantHouseKind::Region(region) if self.classic_boxes => {
                        LinkSource::House(House::Box(region))
                    }
                    _ => LinkSource::VariantHouse(house),
                };
                (self.house_masks[index], source)
            });
            let conflicts = self.pair_clues.iter().flat_map(|clue| {
                let source = LinkSource::VariantRule(clue.source.technique);
                clue.links().iter().flat_map(move |link| {
                    let [a, b] = link.cells;
                    digits(position.masks[a]).flat_map(move |left| {
                        digits(position.masks[b])
                            .filter(move |&right| !link.permits(left, right))
                            .map(move |right| {
                                (
                                    Candidate {
                                        cell: a,
                                        digit: left,
                                    },
                                    Candidate {
                                        cell: b,
                                        digit: right,
                                    },
                                    source,
                                )
                            })
                    })
                })
            });
            Box::new(InferenceGraph::for_variant(
                &position.masks,
                houses,
                conflicts,
            ))
        });
        visit_variant_inference(graph, technique, visit)
    }
}
