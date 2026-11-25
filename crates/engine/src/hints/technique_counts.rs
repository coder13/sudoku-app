use super::{
    Board, CELLS, DeductionSearch, HintError, OverlaySearch, Position, Technique, checked_position,
    digit_bit, visit_technique,
};
use std::ops::ControlFlow;

#[derive(Default)]
pub(crate) struct TechniqueCountScan {
    snapshot: Option<ScanPosition>,
    overlay: Option<OverlaySearch<'static>>,
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
        }
        let position = self
            .snapshot
            .as_ref()
            .unwrap()
            .checked
            .as_ref()
            .map_err(|&error| error)?;
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
            let overlay = self
                .overlay
                .get_or_insert_with(|| OverlaySearch::classic(position.board(), position.masks()));
            let _ = overlay.visit(technique, &mut collect);
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
        Ok(targets.iter().map(|mask| mask.count_ones()).sum())
    }
}
