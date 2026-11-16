use std::collections::{BTreeSet, HashSet};

use super::{Difficulty, LogicalSolve, RatingTally, restore_position, traced_solve};
use crate::hints::{DeductionSearch, checked_position};
use crate::position::Position;
use crate::{Board, CELLS, Hint, HintAction, HintError, PositionSnapshot, Technique, candidates};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
/// Easy deductions available at one position of a trace.
pub struct MoveAvailability {
    /// Distinct complete action sets proved by enabled Easy techniques.
    pub easy_moves: usize,
    /// An unfinished position with zero or one Easy move.
    pub bottleneck: bool,
}

impl LogicalSolve {
    /// Count distinct enabled Easy moves at the start and after each deduction.
    /// An unfinished grid with at most one Easy move is a bottleneck.
    pub fn move_availability(&self) -> Vec<MoveAvailability> {
        let easy: Vec<_> = self
            .technique_order
            .iter()
            .copied()
            .filter(|technique| technique.difficulty() == Difficulty::Easy)
            .collect();
        self.positions()
            .map(|snapshot| {
                let board = snapshot.values().expect("valid traced position");
                let mut masks = candidates(&board).expect("consistent traced position");
                for (mask, removed) in masks.iter_mut().zip(snapshot.eliminations) {
                    *mask &= !removed;
                }
                let search = DeductionSearch::new(&board, &masks);
                let moves: BTreeSet<_> = easy
                    .iter()
                    .flat_map(|&technique| search.hints(technique))
                    .map(|hint| hint.actions)
                    .collect();
                MoveAvailability {
                    easy_moves: moves.len(),
                    bottleneck: board.contains(&0) && moves.len() <= 1,
                }
            })
            .collect()
    }
}

/// Two traces from the same starting position.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PathComparison {
    /// Path with the selected technique enabled.
    pub with_technique: LogicalSolve,
    /// Path after removing the selected technique from the order.
    pub without_technique: LogicalSolve,
}

/// Compare two greedy traces. A technique missing from the supplied profile is
/// appended to the enabled comparison order.
pub fn compare_paths(
    snapshot: &PositionSnapshot,
    order: &[Technique],
    selected: Technique,
) -> Result<PathComparison, HintError> {
    let position = restore_position(snapshot)?;
    let mut enabled = order.to_vec();
    if !enabled.contains(&selected) {
        enabled.push(selected);
    }
    let without = without_technique(order, selected);
    Ok(PathComparison {
        with_technique: traced_solve(snapshot.clone(), position.clone(), &enabled)
            .map_err(HintError::Puzzle)?,
        without_technique: traced_solve(snapshot.clone(), position, &without)
            .map_err(HintError::Puzzle)?,
    })
}

fn without_technique(order: &[Technique], selected: Technique) -> Vec<Technique> {
    order
        .iter()
        .copied()
        .filter(|&technique| technique != selected)
        .collect()
}

/// Outcome of exploring alternate logical paths.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum AlternatePathStatus {
    /// The search found a complete proof trace.
    Found,
    /// The search explored the reachable positions without solving.
    NoPath,
    /// The expansion budget ran out while there were still positions to explore.
    Inconclusive,
}

/// Result of a budgeted attempt to solve without a selected technique.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AlternatePath {
    /// Search outcome.
    pub status: AlternatePathStatus,
    /// Number of distinct unfinished positions expanded.
    pub positions_searched: u32,
    /// Complete trace when the search found a solution.
    pub path: Option<LogicalSolve>,
}

type PositionKey = (Board, [u16; CELLS]);

/// Explore distinct unfinished positions using only the remaining techniques.
/// The search tries the configured order first and backtracks across other logical
/// deductions. A solved position takes no expansion from the budget.
pub fn search_alternate_path(
    snapshot: &PositionSnapshot,
    order: &[Technique],
    excluded: Technique,
    max_positions: u32,
) -> Result<AlternatePath, HintError> {
    let values = snapshot.values().map_err(HintError::Puzzle)?;
    let start = checked_position(&values, snapshot.removals())?;
    let order = without_technique(order, excluded);
    let mut seen = HashSet::<PositionKey>::new();
    let mut stack: Vec<Frame> = Vec::new();
    let mut steps: Vec<Hint> = Vec::new();
    let mut next = Some(start);

    while let Some(position) = next.take() {
        if position.is_solved() {
            let mut tally = RatingTally::default();
            for step in &steps {
                tally.record(step.technique);
            }
            let rating = tally.finish(true, &order);
            return Ok(AlternatePath {
                status: AlternatePathStatus::Found,
                positions_searched: seen.len() as u32,
                path: Some(LogicalSolve {
                    start: snapshot.clone(),
                    board: *position.board(),
                    steps,
                    score: rating.score,
                    status: rating.status,
                    technique_order: rating.technique_order,
                    scoring_version: rating.scoring_version,
                }),
            });
        }
        let key = (*position.board(), *position.masks());
        if seen.len() == max_positions as usize && !seen.contains(&key) {
            return Ok(AlternatePath {
                status: AlternatePathStatus::Inconclusive,
                positions_searched: max_positions,
                path: None,
            });
        }
        if seen.insert(key) {
            stack.push(Frame::new(position));
        } else {
            steps.pop();
        }
        while let Some(frame) = stack.last_mut() {
            if let Some(hint) = frame.next_move(&order) {
                let mut child = frame.position.clone();
                child.apply(&hint.actions);
                steps.push(hint);
                next = Some(child);
                break;
            }
            stack.pop();
            steps.pop();
        }
    }

    Ok(AlternatePath {
        status: AlternatePathStatus::NoPath,
        positions_searched: seen.len() as u32,
        path: None,
    })
}

struct Frame {
    position: Position,
    preferred_tried: bool,
    next_technique: usize,
    pending: std::vec::IntoIter<Hint>,
    attempted: BTreeSet<Vec<HintAction>>,
}

impl Frame {
    fn new(position: Position) -> Self {
        Self {
            position,
            preferred_tried: false,
            next_technique: 0,
            pending: Vec::new().into_iter(),
            attempted: BTreeSet::new(),
        }
    }

    fn next_move(&mut self, order: &[Technique]) -> Option<Hint> {
        let search = DeductionSearch::new(self.position.board(), self.position.masks());
        if !self.preferred_tried {
            self.preferred_tried = true;
            if let Some(step) = order.iter().find_map(|&technique| search.first(technique)) {
                let hint: Hint = step.into();
                self.attempted.insert(hint.actions.clone());
                return Some(hint);
            }
            self.next_technique = order.len();
            return None;
        }

        loop {
            if let Some(hint) = self
                .pending
                .find(|hint| self.attempted.insert(hint.actions.clone()))
            {
                return Some(hint);
            }
            let technique = *order.get(self.next_technique)?;
            self.next_technique += 1;
            self.pending = search.hints(technique).into_iter();
        }
    }
}
