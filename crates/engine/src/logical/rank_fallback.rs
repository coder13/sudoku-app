use super::{RatingTally, follow_path, restore_position};
use crate::rank::discover_rank_deductions_in;
use crate::{
    Board, Hint, HintAction, HintError, PositionSnapshot, RankDiscoveryScan, RankProof,
    RankProofEffort, SolveScore, Technique,
};

/// Bounds for rank searches within one logical solve.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(default, rename_all = "camelCase")
)]
pub struct RankFallbackOptions {
    /// Maximum number of rank removals the solve can apply.
    pub max_steps: usize,
    /// Maximum rank search nodes across the entire solve.
    pub node_budget: u32,
    /// Maximum rank search nodes at a single stall.
    pub max_nodes_per_scan: u32,
    /// Maximum rank search nodes for one candidate in a scan.
    pub max_nodes_per_candidate: u32,
}

impl Default for RankFallbackOptions {
    fn default() -> Self {
        Self {
            max_steps: 8,
            node_budget: 320_000,
            max_nodes_per_scan: 40_000,
            max_nodes_per_candidate: 200,
        }
    }
}

/// Why a logical solve with rank fallback ended.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum RankSolveStatus {
    /// All cells were filled using the recorded deductions.
    Solved,
    /// All active candidates were checked and the fallback found no removal.
    Stalled,
    /// The unfinished solve used its full rank step allowance.
    RankStepLimit,
    /// Node limits prevented the fallback from proving a further removal.
    RankSearchLimit,
}

/// Budget and coverage of one rank scan in the logical solve.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct RankSolveSearch {
    /// Nodes available for this scan.
    pub node_budget: u32,
    /// Nodes the scan visited.
    pub nodes_visited: u32,
    /// Candidate searches the scan started.
    pub candidates_examined: usize,
    /// Candidate searches that ran out of their allowance.
    pub candidates_limited: usize,
    /// Whether the scan decided every active candidate.
    pub complete: bool,
}

impl RankSolveSearch {
    fn from_scan(node_budget: u32, scan: &RankDiscoveryScan) -> Self {
        Self {
            node_budget,
            nodes_visited: scan.nodes_visited,
            candidates_examined: scan.candidates_examined,
            candidates_limited: scan.candidates_limited,
            complete: scan.complete,
        }
    }
}

/// One recorded deduction in a solve with rank fallback.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case")
)]
pub enum RankSolveStep {
    /// A deduction from a named technique in the selected profile.
    Technique(Hint),
    /// A rank removal found after the selected profile stalled.
    Rank {
        /// A certificate that the removed candidate is impossible.
        proof: RankProof,
        /// Estimated effort for the certificate at this position.
        effort: RankProofEffort,
        /// Budget and coverage of the scan that found the removal.
        search: RankSolveSearch,
        /// The removal proved by the certificate.
        actions: [HintAction; 1],
    },
}

impl RankSolveStep {
    /// Placements or removals recorded for this step.
    pub fn actions(&self) -> &[HintAction] {
        match self {
            Self::Technique(hint) => &hint.actions,
            Self::Rank { actions, .. } => actions,
        }
    }
}

/// Trace from a logical solve with an opt-in rank fallback.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RankSolve {
    start: PositionSnapshot,
    /// Grid reached after applying every recorded deduction.
    pub board: Board,
    /// Named and rank deductions in application order.
    pub steps: Vec<RankSolveStep>,
    /// Why the solve ended.
    pub status: RankSolveStatus,
    /// Named techniques and their configured priority.
    pub technique_order: Vec<Technique>,
    /// Point subtotal for the named deductions.
    pub named_score: SolveScore,
    /// Scoring version for the named deductions.
    pub named_scoring_version: u32,
    /// Rank limits used for this solve.
    pub rank_options: RankFallbackOptions,
    /// Nodes visited across every rank scan, including any final unsuccessful scan.
    pub rank_nodes_visited: u32,
    /// Details of a final scan that returned no proof, if one took place.
    pub terminal_rank_search: Option<RankSolveSearch>,
}

/// A step in a rank fallback solve with its before and after snapshots.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RankSolveReplay<'a> {
    /// Position before the deduction.
    pub before: PositionSnapshot,
    /// Recorded deduction at this index.
    pub deduction: &'a RankSolveStep,
    /// Position after the deduction.
    pub after: PositionSnapshot,
}

impl RankSolve {
    /// Yield the start and the position after each deduction.
    pub fn positions(&self) -> impl Iterator<Item = PositionSnapshot> + '_ {
        let mut position = self.start.clone();
        std::iter::once(position.clone()).chain(self.steps.iter().map(move |step| {
            position.record_actions(step.actions());
            position.clone()
        }))
    }

    /// Replay a deduction at a zero-based index, including a rank removal.
    pub fn replay_step(&self, index: usize) -> Option<RankSolveReplay<'_>> {
        let deduction = self.steps.get(index)?;
        let mut before = self.start.clone();
        for step in &self.steps[..index] {
            before.record_actions(step.actions());
        }
        let mut after = before.clone();
        after.record_actions(deduction.actions());
        Some(RankSolveReplay {
            before,
            deduction,
            after,
        })
    }
}

/// Solve with the selected named techniques and try rank removals at stalls.
///
/// Each rank search uses the same candidate state as the named solver. After
/// a removal the solver returns to the first named technique in the order.
/// An empty order permits only rank removals. A rank step records effort in
/// its own units. The trace reports points for its named deductions.
pub fn solve_position_with_rank(
    snapshot: &PositionSnapshot,
    technique_order: &[Technique],
    rank_options: RankFallbackOptions,
) -> Result<RankSolve, HintError> {
    let mut position = restore_position(snapshot)?;
    let mut tally = RatingTally::default();
    let mut steps = Vec::new();
    let mut rank_steps = 0;
    let mut remaining = rank_options.node_budget;
    let mut terminal_rank_search = None;
    let status = loop {
        position = follow_path(position, technique_order, |step| {
            tally.record_deduction(&step);
            steps.push(RankSolveStep::Technique(step.into()));
            true
        })
        .map_err(HintError::Puzzle)?;
        if position.is_solved() {
            break RankSolveStatus::Solved;
        }
        if rank_steps == rank_options.max_steps {
            break RankSolveStatus::RankStepLimit;
        }
        let allowance = remaining.min(rank_options.max_nodes_per_scan);
        if allowance == 0 || rank_options.max_nodes_per_candidate == 0 {
            break RankSolveStatus::RankSearchLimit;
        }
        let scan = discover_rank_deductions_in(
            &position,
            1,
            allowance,
            rank_options.max_nodes_per_candidate,
        );
        let search = RankSolveSearch::from_scan(allowance, &scan);
        remaining -= search.nodes_visited;
        let Some((proof, effort)) = scan.proofs.into_iter().zip(scan.efforts).next() else {
            terminal_rank_search = Some(search);
            break if search.complete {
                RankSolveStatus::Stalled
            } else {
                RankSolveStatus::RankSearchLimit
            };
        };
        let actions = [HintAction::Eliminate(proof.target)];
        position.apply(&actions);
        steps.push(RankSolveStep::Rank {
            proof,
            effort,
            search,
            actions,
        });
        rank_steps += 1;
    };
    position.verify_unique().map_err(HintError::Puzzle)?;
    let named = tally.finish(position.is_solved(), technique_order);
    Ok(RankSolve {
        start: snapshot.clone(),
        board: *position.board(),
        steps,
        status,
        technique_order: named.technique_order,
        named_score: named.score,
        named_scoring_version: named.scoring_version,
        rank_options,
        rank_nodes_visited: rank_options.node_budget - remaining,
        terminal_rank_search,
    })
}
