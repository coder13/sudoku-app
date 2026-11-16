use super::{
    CELLS, Candidate, ControlFlow, Deduction, DeductionActions, HintAction, HintEvidence, PEERS,
    Technique, cell_bit, cells, digits,
};
use crate::{AlignedExclusionCase, AlignedExclusionReason, hints::digit_bit};

pub(super) fn visit<const SIZE: usize>(
    masks: &[u16; CELLS],
    technique: Technique,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let mut active = 0;
    let mut blockers = 0;
    for (cell, mask) in masks.iter().enumerate() {
        let count = mask.count_ones() as usize;
        if count >= 2 {
            active |= cell_bit(cell);
            if count <= SIZE {
                blockers |= cell_bit(cell);
            }
        }
    }
    let mut group = [0; SIZE];
    choose_cells(masks, technique, active, blockers, &mut group, 0, visit)
}

fn choose_cells<const SIZE: usize>(
    masks: &[u16; CELLS],
    technique: Technique,
    mut available: u128,
    common: u128,
    group: &mut [usize; SIZE],
    index: usize,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    if index == SIZE {
        return visit_group(masks, technique, *group, common, visit);
    }
    while available.count_ones() as usize >= SIZE - index {
        let cell = available.trailing_zeros() as usize;
        available &= available - 1;
        let shared = common & PEERS[cell];
        if shared != 0 {
            group[index] = cell;
            choose_cells(masks, technique, available, shared, group, index + 1, visit)?;
        }
    }
    ControlFlow::Continue(())
}

fn visit_group<const SIZE: usize>(
    masks: &[u16; CELLS],
    technique: Technique,
    group: [usize; SIZE],
    common: u128,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let domains = group.map(|cell| masks[cell]);
    let union = domains.iter().fold(0, |all, &mask| all | mask);
    let common = cells(common)
        .filter(|&cell| masks[cell] & !union == 0)
        .fold(0, |set, cell| set | cell_bit(cell));
    if common == 0 {
        return ControlFlow::Continue(());
    }
    let reason = |assignment: &[u8; SIZE]| reject(masks, &group, common, assignment);
    let mut supported = [0; SIZE];
    let _ = assignments(&domains, &mut [0; SIZE], 0, &mut |assignment| {
        if reason(assignment).is_none() {
            for (mask, &digit) in supported.iter_mut().zip(assignment) {
                *mask |= digit_bit(digit);
            }
            if supported == domains {
                return ControlFlow::Break(());
            }
        }
        ControlFlow::Continue(())
    });

    for i in 0..SIZE {
        for digit in digits(domains[i] & !supported[i]) {
            let mut fixed = domains;
            fixed[i] = digit_bit(digit);
            let mut cases = Vec::new();
            let _ = assignments(&fixed, &mut [0; SIZE], 0, &mut |assignment| {
                let reason = reason(assignment).expect("unsupported candidate");
                cases.push(AlignedExclusionCase {
                    digits: assignment.to_vec(),
                    reason,
                });
                ControlFlow::Continue(())
            });
            // Conflicts among the selected cells alone do not use an aligned excluder.
            if cases
                .iter()
                .any(|case| matches!(case.reason, AlignedExclusionReason::EmptyCell(_)))
            {
                visit(Deduction {
                    technique,
                    evidence: HintEvidence::AlignedExclusion {
                        cells: group.to_vec(),
                        cases,
                    },
                    actions: DeductionActions::Eliminations(vec![HintAction::Eliminate(
                        Candidate {
                            cell: group[i],
                            digit,
                        },
                    )]),
                })?;
            }
        }
    }
    ControlFlow::Continue(())
}

fn assignments<const SIZE: usize>(
    domains: &[u16; SIZE],
    assignment: &mut [u8; SIZE],
    index: usize,
    apply: &mut impl FnMut(&[u8; SIZE]) -> ControlFlow<()>,
) -> ControlFlow<()> {
    if index == SIZE {
        return apply(assignment);
    }
    for digit in digits(domains[index]) {
        assignment[index] = digit;
        assignments(domains, assignment, index + 1, apply)?;
    }
    ControlFlow::Continue(())
}

fn reject<const SIZE: usize>(
    masks: &[u16; CELLS],
    group: &[usize; SIZE],
    common: u128,
    assignment: &[u8; SIZE],
) -> Option<AlignedExclusionReason> {
    let mut used = 0;
    for (i, &digit) in assignment.iter().enumerate() {
        if used & digit_bit(digit) != 0 {
            for j in 0..i {
                if assignment[j] == digit && PEERS[group[i]] & cell_bit(group[j]) != 0 {
                    return Some(AlignedExclusionReason::RepeatedDigit([group[j], group[i]]));
                }
            }
        }
        used |= digit_bit(digit);
    }
    cells(common)
        .find(|&cell| masks[cell] & !used == 0)
        .map(AlignedExclusionReason::EmptyCell)
}
