use super::{
    Base, CONSTRAINTS, Choice, Occupied, RankConstraint, RankError, RankOutcome, RankPattern,
    RankProof, RankProofEffort, RankProofNode, RankSearch, SearchLimit, position,
};
use crate::position::Position;
use crate::{CELLS, Candidate, PositionSnapshot, Random};

const MAX_ORDERS: usize = 140;
const SHORTLIST: usize = 12;
const PRUNING_ROUNDS: usize = 4;

/// Result of discovering a rank pattern for a candidate.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct RankDiscovery {
    /// The best proof found, a compatible assignment, or a search limit.
    pub outcome: RankOutcome,
    /// Effort of the returned proof, if discovery proved a removal.
    pub effort: Option<RankProofEffort>,
    /// Nodes visited during the initial search and proof refinement.
    pub nodes_visited: u32,
}

/// The easiest rank proofs found in a position-wide search.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct RankDiscoveryScan {
    /// Distinct removals in order of proof effort, then cell and digit.
    pub proofs: Vec<RankProof>,
    /// Effort of each proof, in the same order as `proofs`.
    pub efforts: Vec<RankProofEffort>,
    /// Nodes visited across all candidate searches.
    pub nodes_visited: u32,
    /// Candidate searches started.
    pub candidates_examined: usize,
    /// Candidate searches that ran out of their allowance.
    pub candidates_limited: usize,
    /// Whether every active candidate was decided.
    pub complete: bool,
}

/// Discover a replayable removal for an active candidate.
///
/// The first search starts with all active classic constraints. It extracts
/// the constraints needed for the contradiction. Any remaining budget can
/// try different case orders and drop redundant constraints. Proof selection
/// uses the estimated footprint and case analysis in [`RankProofEffort`].
/// If refinement runs out of nodes, the result keeps the best certified proof.
pub fn discover_rank_at(
    snapshot: &PositionSnapshot,
    target: Candidate,
    node_budget: u32,
) -> Result<RankDiscovery, RankError> {
    let position = position(snapshot)?;
    RankSearch::validate_target(&position, target)?;
    let mut remaining = node_budget;
    let outcome = discover(&position, target, &mut remaining)?;
    let effort = match &outcome {
        RankOutcome::Proven(proof) => Some(RankProofEffort::measure(proof, position.masks())),
        _ => None,
    };
    Ok(RankDiscovery {
        outcome,
        effort,
        nodes_visited: node_budget - remaining,
    })
}

/// Find up to `limit` distinct removals without a supplied pattern or target.
///
/// Each candidate gets at most `max_nodes_per_candidate` nodes from the
/// shared budget. The scan shares position validation and the constraint
/// index across all probes. It ranks the certificates found on this pass
/// and returns partial results when an allowance is exhausted.
pub fn discover_rank_deductions_at(
    snapshot: &PositionSnapshot,
    limit: usize,
    node_budget: u32,
    max_nodes_per_candidate: u32,
) -> Result<RankDiscoveryScan, RankError> {
    let position = position(snapshot)?;
    Ok(discover_rank_deductions_in(
        &position,
        limit,
        node_budget,
        max_nodes_per_candidate,
    ))
}

pub(crate) fn discover_rank_deductions_in(
    position: &Position,
    limit: usize,
    node_budget: u32,
    max_nodes_per_candidate: u32,
) -> RankDiscoveryScan {
    let mut result = RankDiscoveryScan {
        proofs: Vec::new(),
        efforts: Vec::new(),
        nodes_visited: 0,
        candidates_examined: 0,
        candidates_limited: 0,
        complete: position.is_solved(),
    };
    if result.complete || limit == 0 || node_budget == 0 || max_nodes_per_candidate == 0 {
        return result;
    }

    let search = RankSearch::all_active(position);
    let index = ConstraintIndex::new(&search);
    let order: Vec<_> = (0..search.bases.len()).collect();
    let candidates: Vec<_> = search.candidates(position.masks()).collect();
    let mut remaining = node_budget;
    let mut ranked: Vec<ScoredProof> = Vec::new();
    for (candidate_index, &target) in candidates.iter().enumerate() {
        if remaining == 0 {
            break;
        }
        let share = (remaining / (candidates.len() - candidate_index) as u32).max(1);
        let allowance = share.min(max_nodes_per_candidate);
        result.candidates_examined += 1;
        match with_allowance(&mut remaining, allowance, |budget| {
            extract(&index, &order, target, budget)
        }) {
            Ok(Some(proof)) => {
                let scored = ScoredProof::new(proof, position);
                let key = |entry: &ScoredProof| (entry.effort.order(), entry.proof.target);
                let index = ranked.partition_point(|entry| key(entry) <= key(&scored));
                if index < limit {
                    ranked.insert(index, scored);
                    ranked.truncate(limit);
                }
            }
            Ok(None) => {}
            Err(SearchLimit) => result.candidates_limited += 1,
        }
    }
    (result.proofs, result.efforts) = ranked
        .into_iter()
        .map(|entry| (entry.proof, entry.effort))
        .unzip();
    result.nodes_visited = node_budget - remaining;
    result.complete =
        result.candidates_examined == candidates.len() && result.candidates_limited == 0;
    result
}

fn discover(
    position: &Position,
    target: Candidate,
    remaining: &mut u32,
) -> Result<RankOutcome, RankError> {
    let search = RankSearch::all_active(position);
    let target = search.target(position, target)?;
    let index = ConstraintIndex::new(&search);
    let mut order: Vec<_> = (0..search.bases.len()).collect();
    let initial_budget = *remaining;
    let mut best = match extract(&index, &order, target, remaining) {
        Ok(Some(proof)) => ScoredProof::new(proof, position),
        Ok(None) => return Ok(RankOutcome::Compatible),
        Err(SearchLimit) => return Ok(RankOutcome::SearchLimit),
    };
    if best.is_minimal() {
        return Ok(RankOutcome::Proven(best.proof));
    }

    let per_order = (initial_budget - *remaining).saturating_mul(4).max(64);
    let mut random = Random::from_seed(1147);
    let mut shortlist = vec![best.clone()];
    let mut exploration = *remaining / 2;
    let exploration_budget = exploration;
    for _ in 1..MAX_ORDERS {
        if exploration == 0 {
            break;
        }
        random.shuffle(&mut order);
        if let Ok(Some(proof)) = with_allowance(&mut exploration, per_order, |budget| {
            extract(&index, &order, target, budget)
        }) {
            let scored = ScoredProof::new(proof, position);
            best.consider(&scored);
            if best.is_minimal() {
                break;
            }
            shortlist_proof(&mut shortlist, scored);
        }
    }
    *remaining -= exploration_budget - exploration;

    if !shortlist
        .iter()
        .any(|entry| entry.proof.pattern == best.proof.pattern)
    {
        shortlist.insert(0, best.clone());
    }
    for _ in 0..PRUNING_ROUNDS {
        for entry in &shortlist {
            if *remaining == 0 || best.is_minimal() {
                return Ok(RankOutcome::Proven(best.proof));
            }
            compact(position, &entry.proof, &mut best, remaining, &mut random)?;
        }
    }
    Ok(RankOutcome::Proven(best.proof))
}

#[derive(Clone)]
struct ScoredProof {
    proof: RankProof,
    effort: RankProofEffort,
}

impl ScoredProof {
    fn new(proof: RankProof, position: &Position) -> Self {
        let effort = RankProofEffort::measure(&proof, position.masks());
        Self { proof, effort }
    }

    fn is_minimal(&self) -> bool {
        // At least two constraints and two active candidates are needed to
        // contradict an active target, even when both marks share a cell.
        self.effort.score == 8
    }

    fn consider(&mut self, other: &Self) {
        if other.effort.order() < self.effort.order() {
            self.clone_from(other);
        }
    }
}

fn shortlist_proof(shortlist: &mut Vec<ScoredProof>, proof: ScoredProof) {
    if shortlist
        .iter()
        .any(|entry| entry.proof.pattern == proof.proof.pattern)
    {
        return;
    }
    let key = |entry: &ScoredProof| (entry.effort.constraints, entry.effort.order());
    let index = shortlist.partition_point(|entry| key(entry) <= key(&proof));
    if index < SHORTLIST {
        shortlist.insert(index, proof);
        shortlist.truncate(SHORTLIST);
    }
}

fn with_allowance<T>(remaining: &mut u32, cap: u32, work: impl FnOnce(&mut u32) -> T) -> T {
    let allowed = cap.min(*remaining);
    let mut allowance = allowed;
    let result = work(&mut allowance);
    *remaining -= allowed - allowance;
    result
}

#[derive(Clone, Copy, Default)]
struct SlotSet([u64; CONSTRAINTS.div_ceil(64)]);

impl SlotSet {
    fn insert(&mut self, slot: usize) {
        self.0[slot / 64] |= 1 << (slot % 64);
    }

    fn remove(&mut self, slot: usize) -> bool {
        let present = self.contains(slot);
        self.0[slot / 64] &= !(1 << (slot % 64));
        present
    }

    fn contains(self, slot: usize) -> bool {
        self.0[slot / 64] & (1 << (slot % 64)) != 0
    }

    fn extend(&mut self, other: Self) {
        for (word, new) in self.0.iter_mut().zip(other.0) {
            *word |= new;
        }
    }
}

#[derive(Default)]
struct Dependencies {
    premises: SlotSet,
    bases: SlotSet,
    covers: SlotSet,
}

impl Dependencies {
    fn extend(&mut self, branch: Self) {
        self.premises.extend(branch.premises);
        self.bases.extend(branch.bases);
        self.covers.extend(branch.covers);
    }

    fn exclude(&mut self, choice: Choice, occupied: &Occupied) {
        let reason = choice
            .slots()
            .iter()
            .copied()
            .filter(|&slot| occupied[slot] != 0)
            .min_by_key(|&slot| {
                let premise = usize::from(occupied[slot]);
                (
                    !self.premises.contains(premise),
                    !self.bases.contains(slot) && !self.covers.contains(slot),
                    premise,
                )
            });
        if let Some(reason) = reason {
            self.premises.insert(usize::from(occupied[reason]));
            self.covers.insert(reason);
        }
    }

    fn pattern(self, nodes: &mut [RankProofNode]) -> RankPattern {
        let mut pattern = RankPattern {
            bases: Vec::new(),
            covers: Vec::new(),
        };
        let mut indices = [0; CONSTRAINTS];
        for (slot, index) in indices.iter_mut().enumerate() {
            if self.bases.contains(slot) {
                *index = pattern.bases.len();
                pattern.bases.push(RankConstraint::from_slot(slot));
            } else if self.covers.contains(slot) {
                pattern.covers.push(RankConstraint::from_slot(slot));
            }
        }
        for node in nodes {
            node.base = indices[node.base];
        }
        pattern
    }
}

// The full scan indexes every active constraint by its original slot.
struct ConstraintIndex<'a> {
    bases: &'a [Base],
    slot_to_base: [usize; CONSTRAINTS],
    counts: [u8; CONSTRAINTS],
}

impl<'a> ConstraintIndex<'a> {
    fn new(search: &'a RankSearch) -> Self {
        let mut slot_to_base = [usize::MAX; CONSTRAINTS];
        let mut counts = [0; CONSTRAINTS];
        for (index, base) in search.bases.iter().enumerate() {
            slot_to_base[base.slot] = index;
            counts[base.slot] = base.choices.len() as u8;
        }
        Self {
            bases: &search.bases,
            slot_to_base,
            counts,
        }
    }
}

struct ActiveSearch<'a> {
    index: &'a ConstraintIndex<'a>,
    order: &'a [usize],
    occupied: Occupied,
    blocked: [u8; CELLS * 9],
    counts: [u8; CONSTRAINTS],
}

impl<'a> ActiveSearch<'a> {
    fn new(index: &'a ConstraintIndex<'a>, order: &'a [usize]) -> Self {
        Self {
            index,
            order,
            occupied: [0; CONSTRAINTS],
            blocked: [0; CELLS * 9],
            counts: index.counts,
        }
    }

    fn next_base(&self) -> Option<&'a Base> {
        let mut next = None;
        let mut fewest = 10;
        for &index in self.order {
            let base = &self.index.bases[index];
            let count = self.counts[base.slot];
            if self.occupied[base.slot] == 0 && count < fewest {
                next = Some(base);
                fewest = count;
                if count == 0 {
                    break;
                }
            }
        }
        next
    }

    fn candidate_index(candidate: Candidate) -> usize {
        candidate.cell * 9 + usize::from(candidate.digit - 1)
    }

    fn mark(&mut self, choice: Choice, depth: u16) {
        choice.set_slots(&mut self.occupied, depth);
        let selecting = depth != 0;
        for &slot in choice.slots() {
            let base = &self.index.bases[self.index.slot_to_base[slot]];
            for &peer in &base.choices {
                let count = &mut self.blocked[Self::candidate_index(peer.candidate)];
                let was_available = *count == 0;
                if selecting {
                    *count += 1;
                } else {
                    *count -= 1;
                }
                // A candidate may share several constraints with the choice.
                // Update its constraint counts only on the first block or last release.
                let available = *count == 0;
                if available != was_available {
                    for &affected in peer.slots() {
                        if available {
                            self.counts[affected] += 1;
                        } else {
                            self.counts[affected] -= 1;
                        }
                    }
                }
            }
        }
    }
}

fn extract(
    index: &ConstraintIndex<'_>,
    order: &[usize],
    target: Choice,
    remaining: &mut u32,
) -> Result<Option<RankProof>, SearchLimit> {
    let mut search = ActiveSearch::new(index, order);
    search.mark(target, 1);
    let mut nodes = Vec::new();
    let Some(dependencies) = refute(&mut search, 1, remaining, &mut nodes)? else {
        return Ok(None);
    };
    debug_assert!(dependencies.premises.contains(1));
    let pattern = dependencies.pattern(&mut nodes);
    Ok(Some(RankProof {
        target: target.candidate,
        pattern,
        nodes,
    }))
}

fn refute(
    search: &mut ActiveSearch<'_>,
    depth: u16,
    remaining: &mut u32,
    nodes: &mut Vec<RankProofNode>,
) -> Result<Option<Dependencies>, SearchLimit> {
    *remaining = remaining.checked_sub(1).ok_or(SearchLimit)?;
    let Some(base) = search.next_base() else {
        return Ok(None);
    };

    let mut dependencies = Dependencies::default();
    dependencies.bases.insert(base.slot);
    let root = nodes.len();
    nodes.push(RankProofNode {
        base: base.slot,
        cases: Vec::new(),
    });
    for &choice in &base.choices {
        if search.blocked[ActiveSearch::candidate_index(choice.candidate)] != 0 {
            continue;
        }
        let child_start = nodes.len();
        search.mark(choice, depth + 1);
        let result = refute(search, depth + 1, remaining, nodes)?;
        search.mark(choice, 0);
        let Some(mut child) = result else {
            return Ok(None);
        };
        if !child.premises.remove(usize::from(depth + 1)) {
            // This subtree already refutes the position before the case split.
            nodes.drain(root..child_start);
            return Ok(Some(child));
        }
        dependencies.extend(child);
        nodes[root].cases.push(choice.candidate);
    }
    for &choice in &base.choices {
        dependencies.exclude(choice, &search.occupied);
    }
    Ok(Some(dependencies))
}

fn compact(
    position: &Position,
    proof: &RankProof,
    best: &mut ScoredProof,
    remaining: &mut u32,
    random: &mut Random,
) -> Result<(), RankError> {
    let mut pattern = proof.pattern.clone();
    // Preserve the source's early case choices when the reduced problem has
    // several equally constrained bases.
    let mut first_use = vec![usize::MAX; pattern.bases.len()];
    for (index, node) in proof.nodes.iter().enumerate() {
        first_use[node.base] = first_use[node.base].min(index);
    }
    let mut bases: Vec<_> = pattern.bases.into_iter().zip(first_use).collect();
    bases.sort_unstable_by_key(|&(_, index)| index);
    pattern.bases = bases.into_iter().map(|(base, _)| base).collect();
    let mut order: Vec<_> = pattern
        .bases
        .iter()
        .chain(&pattern.covers)
        .copied()
        .collect();
    random.shuffle(&mut order);
    let cap = u32::try_from(proof.nodes.len())
        .unwrap_or(u32::MAX)
        .saturating_mul(4)
        .clamp(128, 600);
    for constraint in order {
        if *remaining == 0 {
            break;
        }
        let mut reduced = pattern.clone();
        reduced.bases.retain(|&base| base != constraint);
        reduced.covers.retain(|&cover| cover != constraint);
        if try_pattern(position, proof.target, &reduced, best, remaining, cap)? {
            pattern = reduced;
        } else if reduced.bases.len() != pattern.bases.len() {
            reduced.covers.push(constraint);
            if try_pattern(position, proof.target, &reduced, best, remaining, cap)? {
                pattern = reduced;
            }
        }
    }
    Ok(())
}

fn try_pattern(
    position: &Position,
    target: Candidate,
    pattern: &RankPattern,
    best: &mut ScoredProof,
    remaining: &mut u32,
    cap: u32,
) -> Result<bool, RankError> {
    if *remaining == 0 || pattern.bases.is_empty() {
        return Ok(false);
    }
    let search = RankSearch::new(position, pattern)?;
    let target = match search.target(position, target) {
        Ok(target) => target,
        Err(RankError::UnconstrainedTarget(_)) => return Ok(false),
        Err(error) => return Err(error),
    };
    let result = with_allowance(remaining, cap, |budget| search.prove(target, budget));
    if let Ok(Some(nodes)) = result {
        best.consider(&ScoredProof::new(
            RankProof {
                target: target.candidate,
                pattern: pattern.clone(),
                nodes,
            },
            position,
        ));
        return Ok(true);
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cached_counts_match_direct_conflicts_across_assumptions_and_backtracking() {
        let position = Position::new(&[0; CELLS]).unwrap();
        let search = RankSearch::all_active(&position);
        let index = ConstraintIndex::new(&search);
        let order: Vec<_> = (0..search.bases.len()).rev().collect();
        let choices = [
            Candidate { cell: 0, digit: 1 },
            Candidate { cell: 10, digit: 2 },
        ]
        .map(|candidate| search.target(&position, candidate).unwrap());
        let mut active = ActiveSearch::new(&index, &order);
        for (choice, depth) in [
            (choices[0], 1),
            (choices[1], 2),
            (choices[1], 0),
            (choices[0], 0),
        ] {
            active.mark(choice, depth);
            for base in &search.bases {
                let available = base
                    .choices
                    .iter()
                    .filter(|choice| choice.fits(&active.occupied))
                    .count();
                assert_eq!(usize::from(active.counts[base.slot]), available);
            }
            let expected = order
                .iter()
                .map(|&i| &search.bases[i])
                .filter(|base| active.occupied[base.slot] == 0)
                .min_by_key(|base| {
                    base.choices
                        .iter()
                        .filter(|choice| choice.fits(&active.occupied))
                        .count()
                });
            assert_eq!(
                active.next_base().map(|base| base.slot),
                expected.map(|base| base.slot)
            );
        }
        assert_eq!(active.counts, index.counts);
        assert!(active.blocked.iter().all(|&count| count == 0));
    }
}
