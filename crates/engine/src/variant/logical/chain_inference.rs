use super::{CompiledVariant, ProofPosition, VariantHouseKind};
use crate::{
    House, LinkSource, Technique,
    hints::{Deduction, InferenceGraph, visit_variant_inference},
};
use std::ops::ControlFlow;

impl CompiledVariant {
    pub(super) fn uses_variant_chains(&self, technique: Technique) -> bool {
        if self.region_logic && !self.classic_boxes && grouped_chain(technique) {
            return true;
        }
        matches!(
            technique,
            Technique::XChain
                | Technique::XYChain
                | Technique::Aic
                | Technique::DiscontinuousNiceLoop
                | Technique::ContinuousNiceLoop
        ) && (!self.classic_boxes || self.houses.len() > 27 || self.has_clue_links())
    }

    pub(super) fn visit_variant_chains(
        &self,
        position: &ProofPosition<'_>,
        technique: Technique,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let grouped = grouped_chain(technique);
        let cache = if grouped {
            &position.grouped_inference
        } else {
            &position.variant_inference
        };
        let graph = cache.get_or_init(|| {
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
            let mut conflicts = Vec::new();
            self.visit_clue_links(position, false, |a, b, technique, _| {
                conflicts.push((a, b, LinkSource::VariantRule(technique)));
            });
            Box::new(InferenceGraph::for_variant(
                &position.masks,
                houses,
                conflicts,
                &self.peers,
                grouped,
            ))
        });
        visit_variant_inference(graph, technique, visit)
    }
}

fn grouped_chain(technique: Technique) -> bool {
    matches!(
        technique,
        Technique::GroupedAic
            | Technique::GroupedDiscontinuousNiceLoop
            | Technique::GroupedContinuousNiceLoop
    )
}
