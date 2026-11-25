use super::{
    Board, CELLS, DeductionSearch, HintError, OverlaySearch, Position, Technique, checked_position,
    digit_bit, visit_technique,
};
use std::ops::ControlFlow;

#[derive(Default)]
pub(crate) struct TechniqueCountScan {
    snapshot: Option<ScanPosition>,
    overlay: Option<OverlaySearch<'static>>,
    order: Vec<Technique>,
    targets: std::collections::BTreeMap<Technique, [u16; CELLS]>,
}

struct ScanPosition {
    board: Board,
    eliminations: Option<[u16; CELLS]>,
    checked: Result<Position, HintError>,
}

impl TechniqueCountScan {
    pub(crate) fn count(
        &mut self,
        board: Board,
        eliminations: Option<[u16; CELLS]>,
        technique: Technique,
        order: &[Technique],
    ) -> Result<u32, HintError> {
        if self
            .snapshot
            .as_ref()
            .is_none_or(|snapshot| snapshot.board != board || snapshot.eliminations != eliminations)
        {
            let checked = checked_position(&board, eliminations.as_ref());
            if let (Some(overlay), Ok(position)) = (&mut self.overlay, &checked) {
                overlay.update_position(position.board(), position.masks());
            }
            self.snapshot = Some(ScanPosition {
                board,
                eliminations,
                checked,
            });
            self.targets.clear();
        }
        if self.order != order {
            self.order = order.to_vec();
            self.targets.clear();
        }
        let position = self
            .snapshot
            .as_ref()
            .unwrap()
            .checked
            .as_ref()
            .map_err(|&error| error)?;
        let Some(index) = order.iter().position(|candidate| *candidate == technique) else {
            return Ok(0);
        };
        let mut covered = [0u16; CELLS];
        for &earlier in &order[..=index] {
            if !self.targets.contains_key(&earlier) {
                let mut targets = Self::raw_targets(position, &mut self.overlay, earlier);
                for (cell, mask) in targets.iter_mut().enumerate() {
                    *mask &= !covered[cell];
                    covered[cell] |= *mask;
                }
                self.targets.insert(earlier, targets);
            } else {
                for (cell, mask) in self.targets[&earlier].iter().enumerate() {
                    covered[cell] |= *mask;
                }
            }
        }
        Ok(self.targets[&technique]
            .iter()
            .map(|mask| mask.count_ones())
            .sum())
    }

    fn raw_targets(
        position: &Position,
        overlay: &mut Option<OverlaySearch<'static>>,
        technique: Technique,
    ) -> [u16; CELLS] {
        let mut targets = [0u16; CELLS];
        let mut collect = |step: super::Deduction| {
            if step.technique == technique {
                for action in step.actions() {
                    let candidate = action.candidate();
                    targets[candidate.cell] |= digit_bit(candidate.digit);
                }
            }
            ControlFlow::Continue(())
        };
        if technique.pattern_overlay_width().is_some() {
            let search = overlay
                .get_or_insert_with(|| OverlaySearch::classic(position.board(), position.masks()));
            let _ = search.visit(technique, &mut collect);
        } else {
            let solution = (technique == Technique::NestedForcingNet)
                .then(|| position.verified_solution())
                .flatten();
            let search = DeductionSearch::with_verified_solution(
                position.board(),
                position.masks(),
                solution.as_ref(),
            );
            let _ = visit_technique(&search, technique, collect);
        }
        targets
    }
}
