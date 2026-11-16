use std::ops::ControlFlow;

use super::{
    Candidate, Deduction, DeductionActions, HintAction, HintEvidence, House, bit_indices, digits,
    visit_unions,
};
use crate::{CELLS, DIGITS, Technique, coordinates};

#[derive(Clone, Copy)]
enum Kind {
    Naked,
    Hidden,
    Locked,
}

pub(super) fn visit_in_house(
    house: House,
    cells: [usize; 9],
    masks: &[u16; CELLS],
    technique: Technique,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let (kind, size) = match technique {
        Technique::NakedPair => (Kind::Naked, 2),
        Technique::NakedTriple => (Kind::Naked, 3),
        Technique::NakedQuadruple => (Kind::Naked, 4),
        Technique::HiddenPair => (Kind::Hidden, 2),
        Technique::HiddenTriple => (Kind::Hidden, 3),
        Technique::HiddenQuadruple => (Kind::Hidden, 4),
        Technique::LockedPair => (Kind::Locked, 2),
        Technique::LockedTriple => (Kind::Locked, 3),
        _ => unreachable!(),
    };
    if matches!(kind, Kind::Locked) && matches!(house, House::Box(_)) {
        return ControlFlow::Continue(());
    }

    let by_cell = cells.map(|cell| masks[cell]);
    let by_digit;
    let groups = if matches!(kind, Kind::Hidden) {
        let mut positions = [0; 9];
        for (offset, mask) in by_cell.into_iter().enumerate() {
            for digit in bit_indices(mask) {
                positions[digit] |= 1 << offset;
            }
        }
        by_digit = positions;
        &by_digit
    } else {
        &by_cell
    };
    let min_size = if size == 2 { 2 } else { 1 };
    let eligible = groups
        .iter()
        .enumerate()
        .filter(|&(_, mask)| (min_size..=size).contains(&mask.count_ones()))
        .fold(0, |eligible, (index, _)| eligible | (1 << index));

    let mut record = |selected, union| {
        let (cell_bits, digit_bits) = match kind {
            Kind::Hidden => (union, selected),
            _ => (selected, union),
        };
        let mut actions = Vec::new();
        let mut locked_in = None;
        match kind {
            Kind::Hidden => {
                for offset in bit_indices(cell_bits) {
                    let cell = cells[offset];
                    eliminate(&mut actions, cell, masks[cell] & !digit_bits);
                }
            }
            Kind::Naked => {
                for offset in bit_indices(!cell_bits & DIGITS) {
                    let cell = cells[offset];
                    eliminate(&mut actions, cell, masks[cell] & digit_bits);
                }
            }
            Kind::Locked => {
                let first = cells[cell_bits.trailing_zeros() as usize];
                let group = coordinates(first).2;
                let box_house = House::Box(group);
                // HoDoKu counts a locked subset when the box has an elimination
                // and the line has another elimination outside that box.
                for cell in box_house.cells() {
                    if !bit_indices(cell_bits).any(|offset| cells[offset] == cell) {
                        eliminate(&mut actions, cell, masks[cell] & digit_bits);
                    }
                }
                let box_actions = actions.len();
                if box_actions == 0 {
                    return ControlFlow::Continue(());
                }
                for cell in cells {
                    if coordinates(cell).2 != group {
                        eliminate(&mut actions, cell, masks[cell] & digit_bits);
                    }
                }
                if actions.len() == box_actions {
                    return ControlFlow::Continue(());
                }
                actions.sort_unstable();
                locked_in = Some(box_house);
            }
        }
        if actions.is_empty() {
            return ControlFlow::Continue(());
        }

        let evidence = if matches!(technique, Technique::NakedPair | Technique::HiddenPair) {
            HintEvidence::Pair {
                house,
                cells: [
                    cells[cell_bits.trailing_zeros() as usize],
                    cells[cell_bits.ilog2() as usize],
                ],
                digits: [
                    digit_bits.trailing_zeros() as u8 + 1,
                    digit_bits.ilog2() as u8 + 1,
                ],
            }
        } else {
            HintEvidence::Subset {
                house,
                cells: bit_indices(cell_bits).map(|offset| cells[offset]).collect(),
                digits: digits(digit_bits).collect(),
                locked_in,
            }
        };
        visit(Deduction {
            technique,
            evidence,
            actions: DeductionActions::Eliminations(actions),
        })
    };

    if matches!(kind, Kind::Locked) {
        // Each three-cell segment of a line lies in one box.
        for segment in [0b000_000_111, 0b000_111_000, 0b111_000_000] {
            visit_unions::<true>(groups, eligible & segment, size, size, 0, 0, &mut record)?;
        }
        ControlFlow::Continue(())
    } else {
        visit_unions::<true>(groups, eligible, size, size, 0, 0, &mut record)
    }
}

fn eliminate(actions: &mut Vec<HintAction>, cell: usize, mask: u16) {
    actions.extend(digits(mask).map(|digit| HintAction::Eliminate(Candidate { cell, digit })));
}
