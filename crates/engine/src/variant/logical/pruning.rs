//! Check Classic detector eligibility before graph construction and search.

use super::{
    ALTERNATIVE_WITNESS_NODES, Analysis, CELLS, CompiledVariant, ProofPosition, Technique,
    UNIQUENESS_PROBE_NODES,
};

impl CompiledVariant {
    pub(super) fn classic_search_is_empty<'a>(
        &'a self,
        position: &ProofPosition<'a>,
        technique: Technique,
    ) -> bool {
        if technique.requires_unique_solution() {
            if self.extra_rule_cells == (1u128 << CELLS) - 1 {
                return true;
            }
            // Graph searches can cost more than the bounded exact check.
            // Cheap empty scans defer that work until they have a proof.
            // Every search can reuse a failed check from this position.
            let unique = position.uniqueness.get().copied().or_else(|| {
                prepare_uniqueness(technique).then(|| self.uniqueness_is_verified(position))
            });
            return unique == Some(false);
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
    pub(super) fn uniqueness_is_verified(&self, position: &ProofPosition<'_>) -> bool {
        // Candidate removals cannot establish uniqueness. Exhausting the
        // existing budget means no uniqueness proof, not multiple solutions.
        *position.uniqueness.get_or_init(|| {
            self.analyze_for_proof(&position.board, &[0; CELLS], UNIQUENESS_PROBE_NODES)
                == Ok(Analysis::Unique)
        })
    }
}

fn prepare_uniqueness(technique: Technique) -> bool {
    matches!(
        technique,
        Technique::UniqueRectangleAic
            | Technique::UniqueRectangleDiscontinuousNiceLoop
            | Technique::UniqueRectangleContinuousNiceLoop
    )
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
