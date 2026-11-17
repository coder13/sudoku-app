use super::super::{conjugate_pair, report};
use super::{
    Arms, ControlFlow, Crossing, Deduction, HintEvidence, House, PEERS, PatternSearch, Technique,
    bit_indices, cell_bit, cells, coordinates, pairs, report_eliminations, wing_groups,
};

pub(in crate::hints::patterns) fn visit_l_wings(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let positions = search.positions_by_digit();
    for (pivot, &mask) in search.masks.iter().enumerate() {
        if mask.count_ones() < 2 {
            continue;
        }
        let arms = Arms::at(search, pivot);
        if arms.both_box_arms == 0 {
            continue;
        }
        let (row, column, _) = coordinates(pivot);
        for (wing_column, &row_digits) in arms.row.iter().enumerate() {
            if (row_digits & mask).count_ones() < 2 {
                continue;
            }
            let row_wing = row * 9 + wing_column;
            for (wing_row, &column_digits) in arms.column.iter().enumerate() {
                let digits = row_digits & column_digits & mask;
                if digits.count_ones() < 2 || digits & arms.both_box_arms == 0 {
                    continue;
                }
                let column_wing = wing_row * 9 + column;
                let common = search.masks[row_wing] & search.masks[column_wing];
                if common.count_ones() < 3 {
                    continue;
                }
                for pair in pairs(digits).filter(|pair| pair & arms.both_box_arms != 0) {
                    let digits = [pair.trailing_zeros() as u8 + 1, pair.ilog2() as u8 + 1];
                    for linked in bit_indices(common & !pair) {
                        for (forced, target) in [(row_wing, column_wing), (column_wing, row_wing)] {
                            for house in House::at(forced).into_iter().take(2) {
                                let Some(link) = conjugate_pair(positions[linked], house) else {
                                    continue;
                                };
                                let other = if link.cells[0] == forced {
                                    link.cells[1]
                                } else {
                                    link.cells[0]
                                };
                                if PEERS[target] & cell_bit(other) == 0 {
                                    continue;
                                }
                                // The target would force the linked digit into
                                // the other wing. Both Firework digits would
                                // lose both wings and need the intersection.
                                let linked_digit = linked as u8 + 1;
                                report(
                                    visit,
                                    Technique::FireworkLWing,
                                    cell_bit(target),
                                    linked_digit,
                                    || HintEvidence::FireworkLWing {
                                        pivot,
                                        digits,
                                        wings: [row_wing, column_wing],
                                        link,
                                        linked_digit,
                                    },
                                )?;
                            }
                        }
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}

pub(in crate::hints::patterns) fn visit_als_wings(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let positions = search.positions_by_digit();
    for bivalue in cells(search.bivalue_cells()) {
        let pair = search.masks[bivalue];
        let indices = [pair.trailing_zeros() as usize, pair.ilog2() as usize];
        let pair_positions = indices.map(|digit| positions[digit]);
        let [a, b] = pair_positions;
        let possible = a & b & !PEERS[bivalue] & !cell_bit(bivalue);
        if possible.count_ones() < 2 {
            continue;
        }
        let mut pivots = Vec::new();
        for cell in cells(possible) {
            if let Some(outside) = Crossing::at(cell).paired_wings(pair_positions)
                && outside
                    .iter()
                    .flatten()
                    .all(|wing| wing & !PEERS[bivalue] == 0)
            {
                pivots.push((cell, outside));
            }
        }
        for (index, &(first, first_wings)) in pivots.iter().enumerate() {
            for &(second, second_wings) in &pivots[index + 1..] {
                if PEERS[first] & cell_bit(second) != 0 {
                    continue;
                }
                let locked = cell_bit(first) | cell_bit(second);
                let blocked = PEERS[bivalue] | PEERS[first] | PEERS[second];
                let mut pair_removals = pair_positions;
                let mut possible_digits = 0;
                for other in 0..2 {
                    let first_sites = first_wings[other][0] | first_wings[other][1];
                    let second_sites = second_wings[other][0] | second_wings[other][1];
                    let Some(excluded) = common_exclusions(first_sites, second_sites) else {
                        continue;
                    };
                    // The anchor digit occupies both pivots. The other digit
                    // needs an outside occurrence for each Firework.
                    let anchor_digit = indices[1 - other];
                    possible_digits |= 1 << anchor_digit;
                    pair_removals[1 - other] &= blocked;
                    pair_removals[other] &= excluded;
                }
                if possible_digits == 0 {
                    continue;
                }
                let mut removals = std::array::from_fn(|digit| positions[digit] & locked);
                for (index, digit) in indices.into_iter().enumerate() {
                    removals[digit] = pair_removals[index];
                }
                for digit in bit_indices(pair & !possible_digits) {
                    removals[digit] |= locked | cell_bit(bivalue);
                }
                report_eliminations(visit, Technique::FireworkAlsWing, removals, || {
                    HintEvidence::FireworkAlsWing {
                        pivots: [first, second],
                        digits: indices.map(|digit| digit as u8 + 1),
                        wings: [wing_groups(first_wings), wing_groups(second_wings)],
                        bivalue,
                    }
                })?;
            }
        }
    }
    ControlFlow::Continue(())
}

fn common_exclusions(first: u128, second: u128) -> Option<u128> {
    let mut result = None;
    for a in cells(first) {
        // A single placement may supply both Fireworks. Distinct placements
        // for the same digit must be in different rows, columns, and boxes.
        for b in cells(second & !PEERS[a]) {
            let excluded = PEERS[a] | PEERS[b];
            result = Some(result.map_or(excluded, |common| common & excluded));
        }
    }
    result
}
