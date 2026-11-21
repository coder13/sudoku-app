use super::{
    CELLS, Candidate, ControlFlow, Deduction, DeductionActions, HintAction, HintEvidence, House,
    PEERS, PatternSearch, Technique, bit_indices, cell_bit, cells, coordinates, house_cells,
};
use crate::{
    LinkSource, RectangleSupport,
    hints::{digit_bit, digits, placement, visit_unions},
};

use super::guardians::{GuardianGroup, visit_partitions};

type Visitor<'a> = &'a mut dyn FnMut(Deduction) -> ControlFlow<Deduction>;

#[path = "unique_loop.rs"]
pub(super) mod unique_loop;

#[derive(Clone, Copy)]
pub(super) struct Rectangle {
    corners: [usize; 4],
    pair: u16,
    roofs: u16,
}

pub(super) fn rectangles(masks: &[u16; CELLS], bivalue: u128) -> Vec<Rectangle> {
    if bivalue == 0 {
        return Vec::new();
    }
    RECTANGLES
        .iter()
        .filter_map(|&corners| {
            if corners.iter().all(|&cell| bivalue & cell_bit(cell) == 0) {
                return None;
            }
            let candidates = corners.map(|cell| masks[cell]);
            let pair = candidates.into_iter().reduce(|left, right| left & right)?;
            if pair.count_ones() != 2 {
                return None;
            }
            let roofs = candidates
                .into_iter()
                .enumerate()
                .fold(0, |roofs, (i, mask)| {
                    if mask == pair {
                        roofs
                    } else {
                        roofs | (1 << i)
                    }
                });
            (roofs != 0).then_some(Rectangle {
                corners,
                pair,
                roofs,
            })
        })
        .collect()
}

/// A rectangle link needs a shared pair and two guardian candidates. Only
/// rectangles whose four cells can be swapped under the active rules qualify.
#[cfg(feature = "variants")]
pub(crate) fn has_rectangle_guardians(masks: &[u16; CELLS], blocked: u128) -> bool {
    let eligible = masks.iter().enumerate().fold(0, |cells, (cell, mask)| {
        if mask.count_ones() >= 2 {
            cells | cell_bit(cell)
        } else {
            cells
        }
    }) & !blocked;
    if eligible.count_ones() < 4 {
        return false;
    }
    RECTANGLES.iter().any(|&corners| {
        if !corners.iter().all(|&cell| eligible & cell_bit(cell) != 0) {
            return false;
        }
        let [a, b, c, d] = corners.map(|cell| masks[cell]);
        // A shared pair uses eight slots. Each guardian needs another slot.
        (a & b & c & d).count_ones() >= 2
            && a.count_ones() + b.count_ones() + c.count_ones() + d.count_ones() >= 10
    })
}

pub(super) fn visit_guardian_links(
    search: &PatternSearch<'_>,
    mut visit: impl FnMut([GuardianGroup; 2], LinkSource),
) {
    let mut guardians = Vec::new();
    for &corners in &RECTANGLES {
        let masks = corners.map(|cell| search.masks[cell]);
        let common = masks
            .into_iter()
            .fold(crate::DIGITS, |pair, mask| pair & mask);
        let mut remaining = common;
        for first in digits(common) {
            remaining &= !digit_bit(first);
            for second in digits(remaining) {
                let pair = digit_bit(first) | digit_bit(second);
                guardians.clear();
                for (cell, mask) in corners.into_iter().zip(masks) {
                    guardians.extend(digits(mask & !pair).map(|digit| Candidate { cell, digit }));
                }
                if guardians.len() >= 2 {
                    let source = LinkSource::UniqueRectangle {
                        corners: corners.map(|cell| cell as u8),
                        digits: [first, second],
                    };
                    visit_partitions(&guardians, search.positions_by_digit(), |groups| {
                        visit(groups, source);
                    });
                }
            }
        }
    }
}

pub(super) fn visit_rectangles(
    search: &PatternSearch<'_>,
    technique: Technique,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let patterns = search
        .rectangles
        .get_or_init(|| rectangles(search.masks, search.bivalue_cells()));
    for &rectangle in patterns {
        rectangle.visit(search, technique, visit)?;
    }
    ControlFlow::Continue(())
}

impl Rectangle {
    fn visit(
        self,
        search: &PatternSearch<'_>,
        technique: Technique,
        visit: Visitor<'_>,
    ) -> ControlFlow<Deduction> {
        let roof_count = self.roofs.count_ones();
        let roofs = bit_indices(self.roofs).map(|i| self.corners[i]);
        let roof_set = roofs.fold(0, |set, cell| set | cell_bit(cell));
        let corner_set = self
            .corners
            .into_iter()
            .fold(0, |set, cell| set | cell_bit(cell));
        let adjacent = roof_count == 2 && self.roofs != 0b1001 && self.roofs != 0b0110;
        match technique {
            Technique::UniqueRectangle1 if roof_count == 1 => self.emit(
                technique,
                removals(roof_set, |_| self.pair),
                || self.extras(search.masks),
                visit,
            ),
            Technique::UniqueRectangle2 if adjacent => {
                self.shared_extra(search, technique, roof_set, visit)
            }
            Technique::UniqueRectangle3 if adjacent => {
                self.subsets(search.masks, roof_set, corner_set, visit)
            }
            Technique::UniqueRectangle4 if adjacent => {
                for digit in digits(self.pair) {
                    let positions = search.positions_by_digit()[usize::from(digit - 1)];
                    let houses: Vec<_> = containing_houses(roof_set)
                        .filter(|&house| positions & house_cells(house) == roof_set)
                        .collect();
                    if !houses.is_empty() {
                        let removed = self.pair & !digit_bit(digit);
                        self.emit(
                            technique,
                            removals(roof_set, |_| removed),
                            || RectangleSupport::StrongLinks { houses, digit },
                            visit,
                        )?;
                    }
                }
                ControlFlow::Continue(())
            }
            Technique::UniqueRectangle5 if (roof_count == 2 && !adjacent) || roof_count == 3 => {
                self.shared_extra(search, technique, roof_set, visit)
            }
            Technique::UniqueRectangle6 if roof_count == 2 && !adjacent => {
                let (row1, col1, _) = coordinates(self.corners[0]);
                let (row2, col2, _) = coordinates(self.corners[3]);
                let houses = [
                    House::Row(row1),
                    House::Row(row2),
                    House::Column(col1),
                    House::Column(col2),
                ];
                for digit in digits(self.pair) {
                    let positions = search.positions_by_digit()[usize::from(digit - 1)];
                    if houses
                        .into_iter()
                        .all(|house| positions & house_cells(house) & !corner_set == 0)
                    {
                        self.emit(
                            technique,
                            removals(roof_set, |_| digit_bit(digit)),
                            || RectangleSupport::StrongLinks {
                                houses: houses.to_vec(),
                                digit,
                            },
                            visit,
                        )?;
                    }
                }
                ControlFlow::Continue(())
            }
            Technique::HiddenRectangle if roof_count >= 2 => {
                for floor in bit_indices(!self.roofs & 0b1111) {
                    let target = self.corners[3 ^ floor];
                    let [row, column, _] = House::at(target);
                    for digit in digits(self.pair) {
                        let positions = search.positions_by_digit()[usize::from(digit - 1)];
                        let houses = [row, column];
                        if houses
                            .into_iter()
                            .all(|house| positions & house_cells(house) & !corner_set == 0)
                        {
                            let removed = self.pair & !digit_bit(digit);
                            self.emit(
                                technique,
                                removals(cell_bit(target), |_| removed),
                                || RectangleSupport::StrongLinks {
                                    houses: houses.to_vec(),
                                    digit,
                                },
                                visit,
                            )?;
                        }
                    }
                }
                ControlFlow::Continue(())
            }
            _ => ControlFlow::Continue(()),
        }
    }

    fn shared_extra(
        self,
        search: &PatternSearch<'_>,
        technique: Technique,
        roofs: u128,
        visit: Visitor<'_>,
    ) -> ControlFlow<Deduction> {
        let extra = cells(roofs).fold(0, |mask, cell| mask | search.masks[cell]) & !self.pair;
        if !extra.is_power_of_two() {
            return ControlFlow::Continue(());
        }
        let positions = search.positions_by_digit()[extra.trailing_zeros() as usize];
        let targets = cells(roofs).fold(positions, |positions, cell| positions & PEERS[cell]);
        self.emit(
            technique,
            removals(targets, |_| extra),
            || self.extras(search.masks),
            visit,
        )
    }

    fn subsets(
        self,
        masks: &[u16; CELLS],
        roofs: u128,
        rectangle: u128,
        visit: Visitor<'_>,
    ) -> ControlFlow<Deduction> {
        visit_naked_subset::<true>(
            masks,
            self.pair,
            roofs,
            rectangle,
            &mut |targets, locked, support| {
                self.emit(
                    Technique::UniqueRectangle3,
                    removals(targets, |cell| masks[cell] & locked),
                    || support,
                    visit,
                )
            },
        )
    }

    fn extras(self, masks: &[u16; CELLS]) -> RectangleSupport {
        let values = self
            .corners
            .into_iter()
            .flat_map(|cell| {
                digits(masks[cell] & !self.pair).map(move |digit| Candidate { cell, digit })
            })
            .collect();
        RectangleSupport::ExtraCandidates(values)
    }

    fn emit(
        self,
        technique: Technique,
        actions: impl Iterator<Item = HintAction>,
        support: impl FnOnce() -> RectangleSupport,
        visit: Visitor<'_>,
    ) -> ControlFlow<Deduction> {
        let actions: Vec<_> = actions.collect();
        if actions.is_empty() {
            return ControlFlow::Continue(());
        }
        visit(Deduction {
            technique,
            evidence: HintEvidence::UniqueRectangle {
                corners: self.corners,
                digits: [
                    self.pair.trailing_zeros() as u8 + 1,
                    self.pair.ilog2() as u8 + 1,
                ],
                support: support(),
            },
            actions: DeductionActions::Eliminations(actions),
        })
    }
}

fn visit_naked_subset<const EXCLUDE_PAIR: bool>(
    masks: &[u16; CELLS],
    pair: u16,
    roofs: u128,
    pattern: u128,
    visit: &mut impl FnMut(u128, u16, RectangleSupport) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let extra = cells(roofs).fold(0, |mask, cell| mask | masks[cell]) & !pair;
    for house in containing_houses(roofs) {
        let cells_in_house = house.cells();
        let groups = cells_in_house.map(|cell| masks[cell]);
        let eligible = (0..9)
            .filter(|&i| {
                groups[i] != 0
                    && (!EXCLUDE_PAIR || groups[i] & pair == 0)
                    && cell_bit(cells_in_house[i]) & pattern == 0
            })
            .fold(0u16, |mask, i| mask | (1 << i));
        // One roof must use an extra candidate. Together they supply one cell to the subset.
        for size in extra.count_ones().max(2)..=eligible.count_ones() + 1 {
            visit_unions::<true>(
                &groups,
                eligible,
                size,
                size - 1,
                0,
                extra,
                &mut |chosen, locked| {
                    let selected =
                        bit_indices(chosen).fold(0, |bits, i| bits | cell_bit(cells_in_house[i]));
                    let houses: Vec<_> = containing_houses(roofs | selected).collect();
                    // A locked subset is reported once with the effects in all its shared houses.
                    if houses.first() != Some(&house) {
                        return ControlFlow::Continue(());
                    }
                    let targets = houses
                        .iter()
                        .copied()
                        .fold(0, |bits, house| bits | house_cells(house))
                        & !(pattern | selected);
                    if cells(targets).all(|cell| masks[cell] & locked == 0) {
                        return ControlFlow::Continue(());
                    }
                    visit(
                        targets,
                        locked,
                        RectangleSupport::Subset {
                            houses,
                            cells: cells(selected).collect(),
                            digits: digits(locked).collect(),
                        },
                    )
                },
            )?;
        }
    }
    ControlFlow::Continue(())
}

fn containing_houses(group: u128) -> impl Iterator<Item = House> {
    House::at(group.trailing_zeros() as usize)
        .into_iter()
        .filter(move |&house| group & !house_cells(house) == 0)
}

fn removals(set: u128, mask_for: impl Fn(usize) -> u16) -> impl Iterator<Item = HintAction> {
    cells(set).flat_map(move |cell| {
        digits(mask_for(cell)).map(move |digit| HintAction::Eliminate(Candidate { cell, digit }))
    })
}

pub(super) fn visit_bug(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let mut pivot = None;
    for (cell, mask) in search.masks.iter().enumerate() {
        match mask.count_ones() {
            0 | 2 => {}
            3 if pivot.is_none() => pivot = Some(cell),
            _ => return ControlFlow::Continue(()),
        }
    }
    let Some(cell) = pivot else {
        return ControlFlow::Continue(());
    };
    let pivot_houses = House::at(cell);
    let mut extra = None;
    let mut triples = 0;
    for house in House::all() {
        let house_mask = house_cells(house);
        for (index, &positions) in search.positions_by_digit().iter().enumerate() {
            match (positions & house_mask).count_ones() {
                0 | 2 => {}
                3 if pivot_houses.contains(&house)
                    && positions & cell_bit(cell) != 0
                    && extra.is_none_or(|digit| digit == index as u8 + 1) =>
                {
                    extra = Some(index as u8 + 1);
                    triples += 1;
                }
                _ => return ControlFlow::Continue(()),
            }
        }
    }
    if let Some(digit) = extra.filter(|_| triples == 3) {
        let mut options = digits(search.masks[cell]);
        visit(placement(
            Technique::BugPlusOne,
            HintEvidence::BugPlusOne {
                cell,
                candidates: std::array::from_fn(|_| options.next().unwrap()),
                houses: pivot_houses,
            },
            cell,
            digit,
        ))?;
    }
    ControlFlow::Continue(())
}

const RECTANGLES: [[usize; 4]; 486] = {
    let mut shapes = [[0; 4]; 486];
    let mut count = 0;
    let mut row = 0;
    while row < 8 {
        let mut bottom = row + 1;
        while bottom < 9 {
            let mut column = 0;
            while column < 8 {
                let mut right = column + 1;
                while right < 9 {
                    if (row / 3 == bottom / 3) != (column / 3 == right / 3) {
                        shapes[count] = [
                            row * 9 + column,
                            row * 9 + right,
                            bottom * 9 + column,
                            bottom * 9 + right,
                        ];
                        count += 1;
                    }
                    right += 1;
                }
                column += 1;
            }
            bottom += 1;
        }
        row += 1;
    }
    shapes
};

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(feature = "variants")]
    #[test]
    fn rectangle_link_preflight_checks_geometry_pair_and_guardian_count() {
        let pair = digit_bit(1) | digit_bit(2);
        let corners = [7, 8, 43, 44];
        let mut masks = [0; CELLS];
        for cell in corners {
            masks[cell] = pair;
        }
        masks[44] |= digit_bit(3);
        assert!(!has_rectangle_guardians(&masks, 0));
        masks[43] |= digit_bit(3);
        assert!(has_rectangle_guardians(&masks, 0));
        assert!(!has_rectangle_guardians(&masks, cell_bit(7)));
        masks[8] = digit_bit(2) | digit_bit(4);
        assert!(!has_rectangle_guardians(&masks, 0));

        // Four cells confined to one box do not form a two-box trade.
        let mut masks = [0; CELLS];
        for cell in [0, 1, 9, 10] {
            masks[cell] = pair | digit_bit(3);
        }
        assert!(!has_rectangle_guardians(&masks, 0));
    }

    #[test]
    fn a_rectangle_link_needs_two_boxes_and_both_swap_digits_in_every_corner() {
        for (corners, broken, expected) in [
            ([0, 3, 9, 12], false, true),
            ([0, 3, 9, 12], true, false),
            ([0, 3, 27, 30], false, false),
            ([0, 1, 9, 10], false, false),
        ] {
            let mut masks = [0; CELLS];
            for cell in corners {
                masks[cell] = digit_bit(1) | digit_bit(2);
            }
            masks[corners[1]] |= digit_bit(3);
            masks[corners[3]] |= digit_bit(4);
            if broken {
                masks[corners[0]] &= !digit_bit(2);
            }
            let search = PatternSearch::new(&[0; CELLS], &masks);
            let mut found = Vec::new();
            visit_guardian_links(&search, |groups, source| found.push((groups, source)));
            if expected {
                assert_eq!(
                    found,
                    vec![(
                        [
                            GuardianGroup::SingleDigit(3, cell_bit(corners[1])),
                            GuardianGroup::SingleDigit(4, cell_bit(corners[3]))
                        ],
                        LinkSource::UniqueRectangle {
                            corners: corners.map(|cell| cell as u8),
                            digits: [1, 2]
                        },
                    )]
                );
            } else {
                assert!(found.is_empty());
            }
        }
    }
}
