use std::collections::BTreeSet;

use super::{
    ControlFlow, Deduction, HintEvidence, House, PEERS, Technique, cell_bit, cells, house_cells,
    report,
};
use crate::CELLS;

pub(super) const HOUSE_COUNT: usize = 27;
const ROWS: u32 = 0x1ff;
const COLUMNS: u32 = ROWS << 9;
const BOXES: u32 = COLUMNS << 9;

pub(super) fn houses_in(mut mask: u32) -> impl Iterator<Item = usize> {
    std::iter::from_fn(move || {
        let house = mask.trailing_zeros() as usize;
        if house == u32::BITS as usize {
            return None;
        }
        mask &= mask - 1;
        Some(house)
    })
}

pub(super) const CELL_HOUSES: [u32; CELLS] = {
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
pub(super) struct Houses {
    pub(super) selected: u32,
    // Candidates in at least one, two, and three selected houses.
    pub(super) counts: [u128; 3],
}

impl Houses {
    pub(super) fn with(self, house: usize, candidates: u128) -> Self {
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

    pub(super) fn deficit(self, covers: Self) -> u128 {
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
    targets: &[u128; 9],
    technique: Technique,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    for size in 2..=4 {
        for (index, (&positions, &targets)) in positions.iter().zip(targets).enumerate() {
            if targets == 0 {
                continue;
            }
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
                targets,
            };
            visit_bases(&sites, Houses::default(), eligible, size, &mut |bases| {
                search.covers(bases, visit)
            })?;
        }
    }
    ControlFlow::Continue(())
}

struct FishSearch {
    technique: Technique,
    digit: u8,
    size: u32,
    sites: [u128; HOUSE_COUNT],
    targets: u128,
}

impl FishSearch {
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
        for target in cells(self.targets) {
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
                    sites: &self.sites,
                    required: bases,
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

pub(super) fn visit_bases<B>(
    sites: &[u128; HOUSE_COUNT],
    selected: Houses,
    mut remaining: u32,
    need: u32,
    visit: &mut impl FnMut(Houses) -> ControlFlow<B>,
) -> ControlFlow<B> {
    if need == 0 {
        return visit(selected);
    }
    while remaining.count_ones() >= need {
        let house = remaining.trailing_zeros() as usize;
        remaining &= remaining - 1;
        visit_bases(
            sites,
            selected.with(house, sites[house]),
            remaining,
            need - 1,
            visit,
        )?;
    }
    ControlFlow::Continue(())
}

pub(super) struct CoverSearch<'a> {
    pub(super) sites: &'a [u128; HOUSE_COUNT],
    pub(super) required: Houses,
    pub(super) eligible: u32,
    pub(super) unseen: u128,
    pub(super) need: u32,
}

impl CoverSearch<'_> {
    pub(super) fn fill<B>(
        &self,
        covers: Houses,
        found: &mut impl FnMut(Houses) -> ControlFlow<B>,
    ) -> ControlFlow<B> {
        let unfilled = self.required.deficit(covers) & self.unseen;
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
            self.fill(covers.with(house, self.sites[house]), found)?;
        }
        ControlFlow::Continue(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::PatternSearch;
    use super::*;
    use crate::{Hint, VerifiedTemplate, candidates, hints::digit_bit};

    #[test]
    fn the_template_filter_keeps_all_published_complex_fish_proofs() {
        for technique in [Technique::FrankenFish, Technique::MutantFish] {
            for example in technique.practice_examples() {
                let position = example.position().unwrap();
                let board = position.values().unwrap();
                let legal = candidates(&board).unwrap();
                let solution = VerifiedTemplate::verify(position.givens).unwrap();
                let normal = std::array::from_fn(|cell| legal[cell] & !position.eliminations[cell]);
                // Compare published positions and denser masks where all legal candidates
                // remain. Also cover a different set of removals that preserves the solution.
                let pruned = std::array::from_fn(|cell| {
                    normal[cell] & (0x155 | digit_bit(solution.solution()[cell]))
                });
                for masks in [normal, legal, pruned] {
                    let search = PatternSearch::new(&board, &masks);
                    let positions = search.positions_by_digit();
                    let collect = |targets: &[u128; 9]| {
                        let mut proofs = Vec::new();
                        let _ = visit(positions, targets, technique, &mut |step| {
                            proofs.push(Hint::from(step));
                            ControlFlow::Continue(())
                        });
                        proofs
                    };
                    assert_eq!(collect(search.complex_fish_targets()), collect(positions));
                }
            }
        }
    }

    #[test]
    fn ho_dokus_kraken_removals_can_support_single_digit_layouts() {
        let position = Technique::KrakenFish1
            .practice_example()
            .position()
            .unwrap();
        let board = position.values().unwrap();
        let answer = VerifiedTemplate::verify(position.givens).unwrap();
        let legal = candidates(&board).unwrap();
        let masks = std::array::from_fn(|cell| legal[cell] & !position.eliminations[cell]);
        let search = PatternSearch::new(&board, &masks);
        for (target, digit) in [(69, 2), (44, 7)] {
            assert_ne!(
                search.positions_by_digit()[usize::from(digit - 1)] & cell_bit(target),
                0
            );
            assert_eq!(
                search.complex_fish_targets()[usize::from(digit - 1)] & cell_bit(target),
                0
            );
            assert_ne!(answer.solution()[target], digit);
        }
    }
}
