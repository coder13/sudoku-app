use super::{CONSTRAINTS, RankError, RankProof, RankSearch, position};
use crate::{CELLS, PositionSnapshot, hints::digit_bit};

/// Version of the mixed rank proof effort model.
pub const RANK_PROOF_EFFORT_VERSION: u32 = 1;

/// Estimated effort to inspect and follow one mixed rank proof.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct RankProofEffort {
    /// Scoring model version.
    pub version: u32,
    /// Distinct constraints to inspect across the bases and covers.
    pub constraints: usize,
    /// Cells containing at least one active candidate in the pattern.
    pub cells: usize,
    /// Distinct active candidates in the pattern.
    pub candidates: usize,
    /// Proof nodes, including splits, deductions with one choice, and contradictions.
    pub nodes: usize,
    /// Alternatives beyond the first choice at each split.
    pub extra_cases: usize,
    /// Estimated effort in units specific to mixed rank proofs.
    pub score: u64,
}

impl RankProofEffort {
    pub(super) fn measure(proof: &RankProof, masks: &[u16; CELLS]) -> Self {
        let mut slots = [false; CONSTRAINTS];
        let mut footprint = [0u16; CELLS];
        let mut constraints = 0;
        for &constraint in proof.pattern.bases.iter().chain(&proof.pattern.covers) {
            let slot = constraint.slot().expect("valid rank constraint");
            if std::mem::replace(&mut slots[slot], true) {
                continue;
            }
            constraints += 1;
            constraint.visit_candidates(masks, |candidate| {
                footprint[candidate.cell] |= digit_bit(candidate.digit);
            });
        }
        let cells = footprint.iter().filter(|&&mask| mask != 0).count();
        let candidates = footprint
            .iter()
            .map(|mask| mask.count_ones() as usize)
            .sum();
        let nodes = proof.nodes.len();
        let extra_cases = proof
            .nodes
            .iter()
            .map(|node| node.cases.len().saturating_sub(1))
            .sum();
        let score = 2 * constraints as u64
            + cells as u64
            + candidates as u64
            + nodes as u64
            + 4 * extra_cases as u64;
        Self {
            version: RANK_PROOF_EFFORT_VERSION,
            constraints,
            cells,
            candidates,
            nodes,
            extra_cases,
            score,
        }
    }

    pub(super) fn order(self) -> (u64, usize, usize, usize) {
        (self.score, self.constraints, self.nodes, self.extra_cases)
    }
}

/// Replay a rank certificate and measure its effort on the supplied snapshot.
///
/// Returns `None` if the certificate fails to replay. Effort measures
/// footprint and case analysis. It has its own version and units.
pub fn rank_proof_effort_at(
    snapshot: &PositionSnapshot,
    proof: &RankProof,
) -> Result<Option<RankProofEffort>, RankError> {
    let position = position(snapshot)?;
    let search = RankSearch::new(&position, &proof.pattern)?;
    let target = search.target(&position, proof.target)?;
    Ok(search
        .replays(target, &proof.nodes)
        .then(|| RankProofEffort::measure(proof, position.masks())))
}
