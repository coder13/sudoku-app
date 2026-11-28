use std::collections::{BTreeSet, HashSet};

use super::{
    CompiledVariant, VariantDeduction, VariantLogicalError, VariantPosition, VariantTechnique,
};
use crate::{
    AlternatePathStatus, Board, CELLS, Difficulty, HintAction, Technique, position::record_actions,
};

/// Outcome of looking for a solution that uses only techniques below a target difficulty.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantLowerPath {
    /// Whether the search found a cheaper solution, exhausted the reachable positions, or hit the budget.
    pub status: AlternatePathStatus,
    /// Distinct positions expanded after applying available ordinary singles.
    pub positions_searched: u32,
    /// Replayable deductions if a cheaper solve exists among the explored positions.
    pub steps: Vec<VariantDeduction>,
}

const SINGLE_ORDER: [VariantTechnique; 4] = [
    VariantTechnique::FullHouse,
    VariantTechnique::Classic(Technique::HiddenSingleBox),
    VariantTechnique::NakedSingle,
    VariantTechnique::HiddenSingle,
];

impl VariantPosition {
    /// Try every available lower-tier move after settling ordinary singles.
    ///
    /// The search uses the latest logical profile, even for saved puzzles with an
    /// older walkthrough. Exhaustion applies to the enabled techniques and this
    /// singles-first order. A budget limit leaves the result inconclusive.
    pub fn search_lower_grade(
        &self,
        order: &[VariantTechnique],
        grade: Difficulty,
        max_positions: u32,
    ) -> Result<VariantLowerPath, VariantLogicalError> {
        let mut compiled = self
            .puzzle
            .compile()
            .map_err(VariantLogicalError::Definition)?;
        compiled.enable_generation_logic();
        let start = compiled
            .proof_position(&self.entries, &self.eliminations)
            .map_err(VariantLogicalError::Position)?;
        let lower = lower_techniques(order, grade);
        let singles = SINGLE_ORDER
            .into_iter()
            .filter(|t| lower.contains(t))
            .collect();
        let remaining = lower
            .into_iter()
            .filter(|t| !SINGLE_ORDER.contains(t))
            .collect();
        let mut search = LowerPaths {
            compiled: &compiled,
            singles,
            remaining,
            max_positions,
            seen: HashSet::new(),
        };
        let mut steps = Vec::new();
        let status = search.visit(start.board, self.eliminations, &mut steps)?;
        if status != AlternatePathStatus::Found {
            steps.clear();
        }
        Ok(VariantLowerPath {
            status,
            positions_searched: search.seen.len() as u32,
            steps,
        })
    }
}

pub(in crate::variant) fn lower_techniques(
    order: &[VariantTechnique],
    grade: Difficulty,
) -> Vec<VariantTechnique> {
    let mut lower: Vec<_> = order
        .iter()
        .copied()
        .filter(|t| t.difficulty() < grade)
        .collect();
    for t in VariantTechnique::all().filter(|t| !t.is_optional() && t.difficulty() < grade) {
        if !lower.contains(&t) {
            lower.push(t);
        }
    }
    lower.sort_by_key(|t| t.difficulty());
    lower
}

impl CompiledVariant {
    pub(in crate::variant) fn enable_generation_logic(&mut self) {
        self.extended_logic = true;
        self.region_logic |= !self.classic_boxes || self.global_entropy.is_some();
    }
}

struct LowerPaths<'a> {
    compiled: &'a CompiledVariant,
    singles: Vec<VariantTechnique>,
    remaining: Vec<VariantTechnique>,
    max_positions: u32,
    seen: HashSet<(Board, [u16; CELLS])>,
}

impl LowerPaths<'_> {
    fn visit(
        &mut self,
        mut board: Board,
        mut eliminations: [u16; CELLS],
        steps: &mut Vec<VariantDeduction>,
    ) -> Result<AlternatePathStatus, VariantLogicalError> {
        use AlternatePathStatus::*;
        let start = steps.len();
        let compiled = self.compiled;
        let position = loop {
            if !board.contains(&0) {
                compiled
                    .prepare(&board, &eliminations)
                    .map_err(VariantLogicalError::Position)?;
                return Ok(Found);
            }
            let position = compiled.house_position(board, &eliminations);
            let Some(step) = self
                .singles
                .iter()
                .find_map(|&t| compiled.first_proof(&position, t))
            else {
                break position;
            };
            record_actions(&mut board, &mut eliminations, &step.actions);
            steps.push(step);
        };
        let key = (board, position.masks);
        if self.seen.contains(&key) {
            steps.truncate(start);
            return Ok(NoPath);
        }
        if self.seen.len() == self.max_positions as usize {
            return Ok(Inconclusive);
        }
        self.seen.insert(key);
        let prefix = steps.len();
        let mut actions = BTreeSet::<Vec<HintAction>>::new();
        for index in 0..self.remaining.len() {
            let technique = self.remaining[index];
            for step in compiled.explain(&position, technique) {
                if step.actions.is_empty() || !actions.insert(step.actions.clone()) {
                    continue;
                }
                let (mut next, mut removed) = (board, eliminations);
                record_actions(&mut next, &mut removed, &step.actions);
                steps.push(step);
                let result = self.visit(next, removed, steps)?;
                if result != NoPath {
                    return Ok(result);
                }
                steps.truncate(prefix);
            }
        }
        steps.truncate(start);
        Ok(NoPath)
    }
}
