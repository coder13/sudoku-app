use std::collections::BTreeSet;

use super::{
    ControlFlow, Deduction, HintEvidence, House, PEERS, Technique, cell_bit, cells, house_cells,
    report,
};
use crate::CELLS;

const HOUSE_COUNT: usize = 27;
const ROWS: u32 = 0x1ff;
const COLUMNS: u32 = ROWS << 9;
const BOXES: u32 = COLUMNS << 9;

fn houses_in(mut mask: u32) -> impl Iterator<Item = usize> {
    std::iter::from_fn(move || {
        let house = mask.trailing_zeros() as usize;
        if house == u32::BITS as usize {
            return None;
        }
        mask &= mask - 1;
        Some(house)
    })
}

const CELL_HOUSES: [u32; CELLS] = {
    let mut sites = [0; CELLS];
    let mut cell = 0;
    while cell < CELLS {
        let (row, column, group) = crate::coordinates(cell);
        sites[cell] = (1 << row) | (1 << (column + 9)) | (1 << (group + 18));
        cell += 1;
    }
    sites
};

#[derive(Clone, Copy, Default)]
struct Houses {
    selected: u32,
    // Candidates in at least one, two, and three selected houses.
    counts: [u128; 3],
}

impl Houses {
    fn with(self, house: usize, candidates: u128) -> Self {
        let [once, twice, three] = self.counts;
        Self {
            selected: self.selected | (1 << house),
            counts: [
                once | candidates,
                twice | (once & candidates),
                three | (twice & candidates),
            ],
        }
    }

    fn deficit(self, covers: Self) -> u128 {
        let [a, b, c] = self.counts;
        let [x, y, z] = covers.counts;
        (a & !x) | (b & !y) | (c & !z)
    }

    fn merge(self, other: Self) -> Self {
        let [a, b, c] = self.counts;
        let [x, y, z] = other.counts;
        Self {
            selected: self.selected | other.selected,
            counts: [a | x, b | y | (a & x), c | z | (a & y) | (b & x)],
        }
    }
}

pub(super) fn visit(
    positions: &[u128; 9],
    technique: Technique,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    for size in 2..=4 {
        for (index, &positions) in positions.iter().enumerate() {
            let sites =
                std::array::from_fn(|house| positions & house_cells(House::from_index(house)));
            let eligible = sites
                .iter()
                .enumerate()
                .filter(|(_, sites)| sites.count_ones() >= 2)
                .fold(0, |mask, (house, _)| mask | (1 << house));
            let search = FishSearch {
                technique,
                digit: index as u8 + 1,
                size,
                sites,
                positions,
            };
            search.bases(Houses::default(), eligible, size, visit)?;
        }
    }
    ControlFlow::Continue(())
}

struct FishSearch {
    technique: Technique,
    digit: u8,
    size: u32,
    sites: [u128; HOUSE_COUNT],
    positions: u128,
}

impl FishSearch {
    fn bases(
        &self,
        selected: Houses,
        mut remaining: u32,
        need: u32,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        if need == 0 {
            return self.covers(selected, visit);
        }
        while remaining.count_ones() >= need {
            let house = remaining.trailing_zeros() as usize;
            remaining &= remaining - 1;
            self.bases(
                selected.with(house, self.sites[house]),
                remaining,
                need - 1,
                visit,
            )?;
        }
        ControlFlow::Continue(())
    }

    fn covers(
        &self,
        bases: Houses,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        if self.technique == Technique::FrankenFish
            && bases.selected & ROWS != 0
            && bases.selected & COLUMNS != 0
        {
            return ControlFlow::Continue(());
        }
        let eligible = self
            .sites
            .iter()
            .enumerate()
            .filter(|(_, sites)| **sites & bases.counts[0] != 0)
            .fold(0, |mask, (house, _)| mask | (1 << house))
            & !bases.selected;
        if eligible.count_ones() < self.size {
            return ControlFlow::Continue(());
        }
        let mut reported = BTreeSet::new();
        for target in cells(self.positions) {
            let target_houses = CELL_HOUSES[target];
            let needed = (target_houses & bases.selected).count_ones() + 1;
            let choices = target_houses & eligible;
            if choices.count_ones() < needed || needed > self.size {
                continue;
            }
            // A removal uses more cover houses than base houses at the target.
            // Those houses can only cover cells the target sees. Search for the
            // houses needed by unseen base candidates once for all target houses.
            for count in needed..=choices.count_ones().min(self.size) {
                let search = CoverSearch {
                    fish: self,
                    bases,
                    eligible: eligible & !target_houses,
                    unseen: !(PEERS[target] | cell_bit(target)),
                    need: self.size - count,
                };
                search.fill(Houses::default(), &mut |outside| {
                    let mut subset = choices;
                    while subset != 0 {
                        if subset.count_ones() == count
                            && reported.insert(outside.selected | subset)
                        {
                            let pinned = houses_in(subset)
                                .fold(Houses::default(), |cover, house| {
                                    cover.with(house, self.sites[house])
                                });
                            self.report(bases, outside.merge(pinned), visit)?;
                        }
                        subset = (subset - 1) & choices;
                    }
                    ControlFlow::Continue(())
                })?;
            }
        }
        ControlFlow::Continue(())
    }

    fn report(
        &self,
        bases: Houses,
        covers: Houses,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let franken_orientation = (bases.selected & ROWS == 0 && covers.selected & COLUMNS == 0)
            || (bases.selected & COLUMNS == 0 && covers.selected & ROWS == 0);
        let uses_boxes = (bases.selected | covers.selected) & BOXES != 0;
        let category = match (franken_orientation, uses_boxes) {
            (true, true) => Technique::FrankenFish,
            (false, _) => Technique::MutantFish,
            (true, false) => return ControlFlow::Continue(()),
        };
        if category != self.technique {
            return ControlFlow::Continue(());
        }

        // Each side counts the same number of placements, counting a digit
        // once for each house it occupies. A fin contributes more to the bases
        // than the covers. When a candidate sees all fins, placing it cannot
        // increase the cover count without making the two counts unequal.
        let fins = bases.deficit(covers);
        let core = bases.counts[0] & covers.counts[0] & !fins;
        if houses_in(bases.selected | covers.selected).any(|house| self.sites[house] & core == 0) {
            return ControlFlow::Continue(());
        }
        let targets = cells(fins).fold(covers.deficit(bases), |targets, fin| targets & PEERS[fin]);
        report(visit, category, targets, self.digit, || {
            HintEvidence::ComplexFish {
                digit: self.digit,
                bases: houses_in(bases.selected).map(House::from_index).collect(),
                covers: houses_in(covers.selected).map(House::from_index).collect(),
                fins: cells(fins).collect(),
            }
        })
    }
}

struct CoverSearch<'a> {
    fish: &'a FishSearch,
    bases: Houses,
    eligible: u32,
    unseen: u128,
    need: u32,
}

impl CoverSearch<'_> {
    fn fill(
        &self,
        covers: Houses,
        found: &mut impl FnMut(Houses) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let unfilled = self.bases.deficit(covers) & self.unseen;
        let remaining = self.need - covers.selected.count_ones();
        if remaining == 0 {
            return if unfilled == 0 {
                found(covers)
            } else {
                ControlFlow::Continue(())
            };
        }
        let available = self.eligible & !covers.selected;
        if available.count_ones() < remaining {
            return ControlFlow::Continue(());
        }
        // Pairwise non-seeing candidates need different cover houses.
        let mut independent = unfilled;
        for _ in 0..remaining {
            if independent == 0 {
                break;
            }
            let cell = independent.trailing_zeros() as usize;
            independent &= !(PEERS[cell] | cell_bit(cell));
        }
        if independent != 0 {
            return ControlFlow::Continue(());
        }
        let choices = if unfilled == 0 {
            available
        } else {
            available & CELL_HOUSES[unfilled.trailing_zeros() as usize]
        };
        for house in houses_in(choices) {
            self.fill(covers.with(house, self.fish.sites[house]), found)?;
        }
        ControlFlow::Continue(())
    }
}
