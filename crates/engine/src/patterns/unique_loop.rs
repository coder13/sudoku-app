use super::{
    Candidate, ControlFlow, Deduction, DeductionActions, HintEvidence, House, PEERS, PatternSearch,
    RectangleSupport, Technique, Visitor, bit_indices, cell_bit, cells, containing_houses,
    digit_bit, digits, house_cells, removals, visit_naked_subset,
};

pub(in super::super) fn visit(
    search: &PatternSearch<'_>,
    visit: Visitor<'_>,
) -> ControlFlow<Deduction> {
    let bivalue = search.bivalue_cells();
    if bivalue == 0 {
        return ControlFlow::Continue(());
    }
    let mut floors = [[0; 9]; 9];
    for cell in cells(bivalue) {
        let pair = search.masks[cell];
        floors[pair.trailing_zeros() as usize][pair.ilog2() as usize] |= cell_bit(cell);
    }

    let positions = search.positions_by_digit();
    for (first, pairs) in floors.iter().enumerate() {
        for (second, &floors) in pairs.iter().enumerate().skip(first + 1) {
            if floors == 0 {
                continue;
            }
            let pair = (1 << first) | (1 << second);
            let roofs = positions[first] & positions[second] & !floors;
            for root in cells(roofs) {
                // The smallest roof fixes both the root and the orientation of the two sides.
                let geometry = Geometry {
                    pair,
                    floors,
                    eligible: floors | (roofs & !(cell_bit(root + 1) - 1)),
                    search,
                };
                geometry.extend(
                    Trade::default().with_cell(0, root, search.masks[root] & !pair, positions),
                    visit,
                )?;
            }
        }
    }
    ControlFlow::Continue(())
}

struct Geometry<'a, 'b> {
    pair: u16,
    floors: u128,
    eligible: u128,
    search: &'a PatternSearch<'b>,
}

#[derive(Clone, Copy, Default)]
struct Trade {
    sides: [u128; 2],
    houses: [u32; 2],
    blocked: [u128; 2],
    roofs: u128,
    extras: u16,
    shared_targets: u128,
}

impl Trade {
    fn with_cell(mut self, side: usize, cell: usize, extra: u16, positions: &[u128; 9]) -> Self {
        self.sides[side] |= cell_bit(cell);
        self.houses[side] |= House::at(cell)
            .into_iter()
            .fold(0, |mask, house| mask | (1 << house.index()));
        self.blocked[side] |= PEERS[cell] | cell_bit(cell);
        if extra != 0 {
            self.extras |= extra;
            self.shared_targets = match (self.roofs, self.extras.is_power_of_two()) {
                (_, false) => 0,
                (0, true) => positions[extra.trailing_zeros() as usize] & PEERS[cell],
                (_, true) => self.shared_targets & PEERS[cell],
            };
            self.roofs |= cell_bit(cell);
        }
        self
    }

    fn cells(self) -> u128 {
        self.sides[0] | self.sides[1]
    }
}

impl Geometry<'_, '_> {
    fn extend(&self, trade: Trade, visit: Visitor<'_>) -> ControlFlow<Deduction> {
        let roof_count = trade.roofs.count_ones();
        let mut eligible = self.eligible & !trade.cells();
        if roof_count >= 2 && trade.shared_targets == 0 {
            if roof_count > 2 || PEERS[trade.roofs.trailing_zeros() as usize] & trade.roofs == 0 {
                return ControlFlow::Continue(());
            }
            eligible &= self.floors;
        }

        let mut pending = trade.houses[0] ^ trade.houses[1];
        if pending == 0 {
            if trade.cells().count_ones() >= 6 && trade.cells() & self.floors != 0 {
                return self.deductions(trade, visit);
            }
            return ControlFlow::Continue(());
        }

        // Each touched house must contain exactly one cell of each side. Satisfy the
        // unmatched house with the fewest options, adding only cells linked to the trade.
        let mut best = (0, 0, u32::MAX);
        while pending != 0 {
            let index = pending.trailing_zeros() as usize;
            pending &= pending - 1;
            let side = usize::from(trade.houses[0] & (1 << index) != 0);
            let choices = eligible & house_cells(House::from_index(index)) & !trade.blocked[side];
            let count = choices.count_ones();
            if count == 0 {
                return ControlFlow::Continue(());
            }
            if count < best.2 {
                best = (side, choices, count);
            }
        }

        for cell in cells(best.1) {
            self.extend(
                trade.with_cell(
                    best.0,
                    cell,
                    self.search.masks[cell] & !self.pair,
                    self.search.positions_by_digit(),
                ),
                visit,
            )?;
        }
        ControlFlow::Continue(())
    }

    fn deductions(&self, trade: Trade, visit: Visitor<'_>) -> ControlFlow<Deduction> {
        let masks = self.search.masks;
        let extras = || {
            RectangleSupport::ExtraCandidates(
                cells(trade.roofs)
                    .flat_map(|cell| {
                        digits(masks[cell] & !self.pair).map(move |digit| Candidate { cell, digit })
                    })
                    .collect(),
            )
        };
        match trade.roofs.count_ones() {
            1 => {
                return self.emit(trade, trade.roofs, |_| self.pair, extras, visit);
            }
            2 => {
                if trade.shared_targets != 0 {
                    self.emit(trade, trade.shared_targets, |_| trade.extras, extras, visit)?;
                }
            }
            _ => {
                return self.emit(trade, trade.shared_targets, |_| trade.extras, extras, visit);
            }
        }

        let positions = self.search.positions_by_digit();
        for digit in digits(self.pair) {
            let houses: Vec<_> = containing_houses(trade.roofs)
                .filter(|&house| {
                    positions[usize::from(digit - 1)] & house_cells(house) == trade.roofs
                })
                .collect();
            if !houses.is_empty() {
                self.emit(
                    trade,
                    trade.roofs,
                    |_| self.pair & !digit_bit(digit),
                    || RectangleSupport::StrongLinks { houses, digit },
                    visit,
                )?;
            }
        }
        visit_naked_subset::<false>(
            masks,
            self.pair,
            trade.roofs,
            trade.cells(),
            &mut |targets, locked, support| {
                self.emit(
                    trade,
                    targets,
                    |cell| masks[cell] & locked,
                    || support,
                    visit,
                )
            },
        )?;
        self.hidden_subsets(trade, visit)
    }

    fn hidden_subsets(&self, trade: Trade, visit: Visitor<'_>) -> ControlFlow<Deduction> {
        let positions = self.search.positions_by_digit();
        for house in containing_houses(trade.roofs) {
            let outside = house_cells(house) & !trade.roofs;
            let eligible = positions
                .iter()
                .enumerate()
                .fold(0u16, |mask, (index, &cells)| {
                    mask | (u16::from(cells & outside != 0) << index)
                })
                & !(trade.extras | self.pair);
            let base_targets =
                bit_indices(self.pair).fold(0, |set, index| set | positions[index] & outside);
            let mut subset = eligible;
            loop {
                // The two roofs can supply only one of these digits between them.
                let targets = bit_indices(subset)
                    .fold(base_targets, |set, index| set | positions[index] & outside);
                if targets.count_ones() == subset.count_ones() + 1 {
                    let locked = subset | self.pair;
                    self.emit(
                        trade,
                        targets,
                        |cell| self.search.masks[cell] & !locked,
                        || RectangleSupport::HiddenSubset {
                            house,
                            cells: cells(targets).collect(),
                            digits: digits(locked).collect(),
                        },
                        visit,
                    )?;
                }
                if subset == 0 {
                    break;
                }
                subset = (subset - 1) & eligible;
            }
        }
        ControlFlow::Continue(())
    }

    fn emit(
        &self,
        trade: Trade,
        targets: u128,
        removed: impl Fn(usize) -> u16,
        support: impl FnOnce() -> RectangleSupport,
        visit: Visitor<'_>,
    ) -> ControlFlow<Deduction> {
        let actions: Vec<_> = removals(targets, removed).collect();
        if actions.is_empty() {
            return ControlFlow::Continue(());
        }
        let mut sides = trade.sides;
        if sides[0].trailing_zeros() > sides[1].trailing_zeros() {
            sides.swap(0, 1);
        }
        visit(Deduction {
            technique: Technique::UniqueLoop,
            evidence: HintEvidence::UniqueLoop {
                sides: sides.map(|side| cells(side).collect()),
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
