use super::{CELLS, templates};
use crate::{Analysis, Board};

const GRID: u128 = (1 << CELLS) - 1;

/// Search every packing of the eight selected digits until uniqueness is
/// known. The uncovered cells form the ninth layout.
pub(crate) fn unique_layouts(
    board: &Board,
    masks: &[u16; CELLS],
    omitted: usize,
) -> Result<[u128; 9], Analysis> {
    let allowed: [u128; 9] = std::array::from_fn(|digit| {
        let live = masks
            .iter()
            .enumerate()
            .filter(|&(_, mask)| mask & (1 << digit) != 0)
            .fold(0, |sites, (cell, _)| sites | (1 << cell));
        templates::with_placed(live, board, digit as u8 + 1)
    });
    let mut families = (0..9)
        .filter(|&digit| digit != omitted)
        .map(|digit| (digit, templates::layouts(allowed[digit])))
        .collect::<Vec<_>>();
    let mut first = None;
    if another_packing(
        &mut families,
        0,
        omitted,
        allowed[omitted],
        &mut [0; 9],
        &mut first,
    ) {
        return Err(Analysis::Multiple);
    }
    first.ok_or(Analysis::Unsolvable)
}

/// Return true when a second packing is discovered.
fn another_packing(
    families: &mut [(usize, Vec<u128>)],
    occupied: u128,
    omitted: usize,
    omitted_allowed: u128,
    layouts: &mut [u128; 9],
    first: &mut Option<[u128; 9]>,
) -> bool {
    let required = GRID & !(occupied | omitted_allowed);
    if families.is_empty() {
        if required != 0 {
            return false;
        }
        layouts[omitted] = GRID & !occupied;
        return first.replace(*layouts).is_some();
    }

    let mut fewest = usize::MAX;
    let mut chosen = 0;
    let mut coverable = 0;
    for (index, (_, patterns)) in families.iter().enumerate() {
        let mut count = 0;
        for &pattern in patterns {
            if pattern & occupied == 0 {
                count += 1;
                coverable |= pattern;
            }
        }
        if count == 0 {
            return false;
        }
        if count < fewest {
            fewest = count;
            chosen = index;
        }
    }
    if required & !coverable != 0 {
        return false;
    }

    families.swap(0, chosen);
    let ((digit, patterns), rest) = families.split_first_mut().unwrap();
    let multiple = patterns.iter().copied().any(|pattern| {
        if pattern & occupied != 0 {
            return false;
        }
        layouts[*digit] = pattern;
        another_packing(
            rest,
            occupied | pattern,
            omitted,
            omitted_allowed,
            layouts,
            first,
        )
    });
    families.swap(0, chosen);
    multiple
}
