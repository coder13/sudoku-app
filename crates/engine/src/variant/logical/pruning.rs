//! Support certificates concern the geometric premises of Classic detectors.

use super::{ALTERNATIVE_WITNESS_NODES, CELLS, CompiledVariant, ProofPosition, Technique};

impl CompiledVariant {
    pub(super) fn classic_search_is_empty<'a>(
        &'a self,
        position: &ProofPosition<'a>,
        technique: Technique,
    ) -> bool {
        if technique.requires_unique_solution() {
            // Every recognized uniqueness proof needs a nonempty swap scope.
            // The existing proof filter excludes every such scope here.
            return self.extra_rule_cells == (1u128 << CELLS) - 1;
        }
        let probe = prepare_completion_support(technique);
        if !probe && position.overlay.get().is_none() {
            return false;
        }
        // A supported singleton can still supply a placement. With two or more
        // candidates, a witness for another digit also certifies each false
        // assumption. Coverage alone cannot suppress uniqueness arguments.
        if position.masks.iter().any(|mask| mask.is_power_of_two()) {
            return false;
        }
        if probe {
            self.overlay_search(position)
                .has_full_completion_support(ALTERNATIVE_WITNESS_NODES)
        } else {
            position
                .overlay
                .get()
                .is_some_and(|search| search.borrow().known_full_completion_support())
        }
    }
}

// Pay for coverage before graph construction or branching enumeration. These
// are computational search families; human point costs do not select probes.
fn prepare_completion_support(technique: Technique) -> bool {
    use Technique::*;
    matches!(
        technique,
        Aic | DiscontinuousNiceLoop
            | ContinuousNiceLoop
            | GroupedAic
            | GroupedDiscontinuousNiceLoop
            | GroupedContinuousNiceLoop
            | AlsAic
            | AlsDiscontinuousNiceLoop
            | AlsContinuousNiceLoop
            | FireworkAic
            | Tridagon
            | TridagonAic
            | TridagonForcingNet
            | ForcingChain
            | ForcingNet
            | DynamicForcingNet
            | AdvancedForcingNet
            | NestedForcingNet
            | AlignedPairExclusion
            | AlignedTripletExclusion
            | DeathBlossom
            | Exocet
            | SeniorExocet
            | DoubleExocet
            | SkLoop
            | MultiSectorLockedSets
            | FrankenFish
            | MutantFish
            | KrakenFish1
            | KrakenFish2
    )
}
