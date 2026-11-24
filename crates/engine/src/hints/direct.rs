use std::{collections::BTreeMap, ops::ControlFlow};

use super::{
    Candidate, Deduction, DeductionSearch, HintAction, HintEvidence, House, Technique, digit_bit,
    placement, positions_for_digit, visit_regular_technique,
};
use crate::CELLS;

pub(super) fn visit(
    search: &DeductionSearch<'_>,
    technique: Technique,
    premise: Technique,
    mut emit: impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let mut placements = BTreeMap::new();
    let _ = visit_regular_technique(search, premise, |proof| {
        collect_placements(search.masks, &proof, &mut placements);
        ControlFlow::Continue(())
    });
    for (candidate, evidence) in placements {
        emit(placement(
            technique,
            evidence,
            candidate.cell,
            candidate.digit,
        ))?;
    }
    ControlFlow::Continue(())
}

fn collect_placements(
    masks: &[u16; CELLS],
    proof: &Deduction,
    placements: &mut BTreeMap<Candidate, HintEvidence>,
) {
    let mut removals = [0; CELLS];
    for action in proof.actions() {
        if let HintAction::Eliminate(Candidate { cell, digit }) = *action {
            removals[cell] |= digit_bit(digit);
        }
    }

    for house in House::all().filter(|&house| match &proof.evidence {
        HintEvidence::Intersection { source, .. } => {
            house != *source && std::mem::discriminant(&house) == std::mem::discriminant(source)
        }
        HintEvidence::Pair { house: source, .. } | HintEvidence::Subset { house: source, .. } => {
            house == *source
        }
        _ => false,
    }) {
        let cells = house.cells();
        let affected = cells
            .iter()
            .fold(0, |digits, &cell| digits | removals[cell]);
        for digit in super::digits(affected) {
            let bit = digit_bit(digit);
            let (remaining, removed): (Vec<_>, Vec<_>) = positions_for_digit(&cells, masks, digit)
                .partition(|&cell| removals[cell] & bit == 0);
            let [cell] = remaining[..] else { continue };
            if removed.is_empty() || is_single(masks, cell, digit) {
                continue;
            }
            let candidate = Candidate { cell, digit };
            placements
                .entry(candidate)
                .or_insert_with(|| HintEvidence::DirectPlacement {
                    house,
                    premise: Box::new(proof.evidence.clone()),
                    removed,
                });
        }
    }
}

fn is_single(masks: &[u16; CELLS], cell: usize, digit: u8) -> bool {
    masks[cell] == digit_bit(digit)
        || House::at(cell).into_iter().any(|house| {
            positions_for_digit(&house.cells(), masks, digit)
                .nth(1)
                .is_none()
        })
}
