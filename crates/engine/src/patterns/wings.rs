use super::{Candidate, DeductionActions, HintAction, bit_indices, house_cells};
use super::{
    ControlFlow, Deduction, HintEvidence, House, PEERS, PatternSearch, Technique, cell_bit, cells,
    conjugate_pair, report,
};

pub(super) fn visit_pivot_wings(
    search: &PatternSearch<'_>,
    technique: Technique,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let xyz = technique == Technique::XYZWing;
    let masks = search.masks;
    let bivalue = search.bivalue_cells();
    if bivalue.count_ones() < 2 {
        return ControlFlow::Continue(());
    }
    let pivots = if xyz {
        masks.iter().enumerate().fold(0, |pivots, (cell, mask)| {
            if mask.count_ones() == 3 {
                pivots | cell_bit(cell)
            } else {
                pivots
            }
        })
    } else {
        bivalue
    };

    for pivot in cells(pivots) {
        let pivot_mask = masks[pivot];
        let mut pincers = PEERS[pivot] & bivalue;
        for first in cells(pincers) {
            pincers &= !cell_bit(first);
            let first_mask = masks[first];
            for second in cells(pincers) {
                let second_mask = masks[second];
                let common = first_mask & second_mask;
                let other_digits = first_mask ^ second_mask;
                let required_pivot = if xyz {
                    first_mask | second_mask
                } else {
                    other_digits
                };
                if !common.is_power_of_two() || required_pivot != pivot_mask {
                    continue;
                }

                let digit_index = common.trailing_zeros() as usize;
                let mut targets =
                    search.positions_by_digit()[digit_index] & PEERS[first] & PEERS[second];
                if xyz {
                    targets &= PEERS[pivot];
                }
                let z = digit_index as u8 + 1;
                report(visit, technique, targets, z, || HintEvidence::Wing {
                    pivot,
                    pincers: [first, second],
                    digits: [
                        (first_mask & other_digits).trailing_zeros() as u8 + 1,
                        (second_mask & other_digits).trailing_zeros() as u8 + 1,
                        z,
                    ],
                })?;
            }
        }
    }
    ControlFlow::Continue(())
}

pub(super) fn visit_wxyz_wings(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let mut eligible = search
        .masks
        .iter()
        .enumerate()
        .fold(0, |set, (cell, mask)| {
            if (2..=4).contains(&mask.count_ones()) {
                set | cell_bit(cell)
            } else {
                set
            }
        });
    for first in cells(eligible) {
        eligible &= !cell_bit(first);
        let mut remaining = eligible;
        for second in cells(eligible) {
            remaining &= !cell_bit(second);
            let pair = search.masks[first] | search.masks[second];
            if pair.count_ones() > 4 {
                continue;
            }
            let mut last_cells = remaining;
            for third in cells(remaining) {
                last_cells &= !cell_bit(third);
                let triple = pair | search.masks[third];
                if triple.count_ones() > 4 {
                    continue;
                }
                for fourth in cells(last_cells) {
                    let digits = triple | search.masks[fourth];
                    if digits.count_ones() == 4 {
                        report_wxyz(search, [first, second, third, fourth], digits, visit)?;
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}

fn report_wxyz(
    search: &PatternSearch<'_>,
    wing: [usize; 4],
    digits: u16,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let wing_set = wing.into_iter().fold(0, |set, cell| set | cell_bit(cell));
    if House::at(wing[0])
        .into_iter()
        .any(|house| wing_set & !house_cells(house) == 0)
    {
        return ControlFlow::Continue(());
    }
    let positions = search.positions_by_digit();
    let mut unrestricted = None;
    for index in bit_indices(digits) {
        let members = positions[index] & wing_set;
        if !cells(members).all(|cell| (members & !cell_bit(cell)) & !PEERS[cell] == 0) {
            if unrestricted.is_some() {
                return ControlFlow::Continue(());
            }
            unrestricted = Some(index);
        }
    }
    // Four cells require four values from the pattern. Only the unrestricted
    // digit can be used more than once, so it cannot be absent.
    let required = unrestricted.map_or(digits, |digit| 1 << digit);
    let mut actions = Vec::new();
    for index in bit_indices(required) {
        let targets = cells(positions[index] & wing_set)
            .fold(positions[index] & !wing_set, |targets, cell| {
                targets & PEERS[cell]
            });
        actions.extend(cells(targets).map(|cell| {
            HintAction::Eliminate(Candidate {
                cell,
                digit: index as u8 + 1,
            })
        }));
    }
    if actions.is_empty() {
        return ControlFlow::Continue(());
    }
    actions.sort_unstable();
    let mut digits = bit_indices(digits).map(|digit| digit as u8 + 1);
    visit(Deduction {
        technique: Technique::WxyzWing,
        evidence: HintEvidence::WxyzWing {
            cells: wing,
            digits: std::array::from_fn(|_| digits.next().unwrap()),
            unrestricted: unrestricted.map(|digit| digit as u8 + 1),
        },
        actions: DeductionActions::Eliminations(actions),
    })
}

pub(super) fn visit_w_wings(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let masks = search.masks;
    let mut bivalue = search.bivalue_cells();
    if bivalue.count_ones() < 2 {
        return ControlFlow::Continue(());
    }
    for first in cells(bivalue) {
        bivalue &= !cell_bit(first);
        let mask = masks[first];
        for second in cells(bivalue).filter(|&cell| masks[cell] == mask) {
            let [first_digit, second_digit] =
                [mask.trailing_zeros(), mask.ilog2()].map(|index| index as usize);
            let common_peers = PEERS[first] & PEERS[second];
            if common_peers == 0 {
                continue;
            }
            let positions = search.positions_by_digit();
            for (removed, linked) in [(first_digit, second_digit), (second_digit, first_digit)] {
                let targets = positions[removed] & common_peers;
                if targets == 0 {
                    continue;
                }
                for link in
                    House::all().filter_map(|house| conjugate_pair(positions[linked], house))
                {
                    let endpoints = link.cells.map(cell_bit);
                    if (endpoints[0] | endpoints[1]) & (cell_bit(first) | cell_bit(second)) != 0 {
                        continue;
                    }
                    let attaches =
                        |left, right| PEERS[first] & left != 0 && PEERS[second] & right != 0;
                    if attaches(endpoints[0], endpoints[1]) || attaches(endpoints[1], endpoints[0])
                    {
                        let digit = removed as u8 + 1;
                        report(visit, Technique::WWing, targets, digit, || {
                            HintEvidence::WWing {
                                wings: [first, second],
                                link,
                                linked_digit: linked as u8 + 1,
                                digit,
                            }
                        })?;
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}
