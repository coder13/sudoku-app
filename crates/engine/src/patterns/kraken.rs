use super::{
    ControlFlow, Deduction, DeductionActions, HintAction, HintEvidence, House, PEERS,
    PatternSearch, Technique, cell_bit, cells,
    complex_fish::{CELL_HOUSES, CoverSearch, HOUSE_COUNT, Houses, houses_in, visit_bases},
    house_cells, templates,
};

mod chains;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Fish {
    bases: u32,
    covers: u32,
    fins: u128,
    cover: Option<House>,
    alternatives: u128,
}

pub(super) struct Search {
    chains: chains::Chains,
    digits: [DigitFish; 9],
}

impl Search {
    pub(super) fn new(position: &PatternSearch<'_>) -> Self {
        let positions = position.positions_by_digit();
        Self {
            chains: chains::Chains::new(
                position.inference_graph(),
                position.als(),
                positions,
                position.masks,
            ),
            digits: std::array::from_fn(|digit| {
                DigitFish::new(
                    positions[digit],
                    templates::with_placed(positions[digit], position.board, digit as u8 + 1),
                )
            }),
        }
    }

    pub(super) fn visit(
        &self,
        technique: Technique,
        position: &PatternSearch<'_>,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let mut paths = chains::Paths::new(&self.chains);
        for (index, node) in self.chains.start_nodes() {
            let target = node
                .single()
                .expect("a chain starts at an individual candidate");
            let removed = paths.walk(index);
            let mut found = None;
            let first_type = technique == Technique::KrakenFish1;
            let target_digit = usize::from(target.digit - 1);
            let eligible_digits: Vec<_> = self
                .digits
                .iter()
                .enumerate()
                .filter_map(|(digit, fish)| {
                    if first_type && digit != target_digit {
                        return None;
                    }
                    let direct = if digit == target_digit {
                        PEERS[target.cell]
                    } else {
                        cell_bit(target.cell)
                    };
                    let exclusions = removed[digit];
                    if exclusions & !direct == 0 {
                        return None;
                    }
                    // The ordinary template filter cannot discard Kraken targets.
                    // First apply the exclusions implied by assuming the target.
                    // Type 1 rules out the target in every remaining layout.
                    // Type 2 rules out every layout for the fish digit.
                    let possible = templates::possible(fish.allowed & !exclusions);
                    let blocked = if first_type {
                        possible & cell_bit(target.cell) == 0
                    } else {
                        possible == 0
                    };
                    blocked.then_some((digit, fish, exclusions, direct))
                })
                .collect();

            // Prefer smaller fish. Keep one proof per removed candidate and type.
            for size in 2..=4 {
                for &(digit, fish, exclusions, direct) in &eligible_digits {
                    let first =
                        fish.find(size, exclusions, direct, first_type.then_some(target.cell));
                    if let Some(proof) = first {
                        found = Some((digit, proof));
                        break;
                    }
                }
                if found.is_some() {
                    break;
                }
            }

            if let Some((digit, fish)) = found {
                let branches = cells(fish.alternatives)
                    .map(|cell| paths.proof(digit, cell, position.als()))
                    .collect();
                let evidence = HintEvidence::KrakenFish {
                    digit: digit as u8 + 1,
                    bases: houses_in(fish.bases).map(House::from_index).collect(),
                    covers: houses_in(fish.covers).map(House::from_index).collect(),
                    fins: cells(fish.fins).collect(),
                    cover: fish.cover,
                    branches,
                };
                visit(Deduction {
                    technique,
                    evidence,
                    actions: DeductionActions::Eliminations(vec![HintAction::Eliminate(target)]),
                })?;
            }
        }
        ControlFlow::Continue(())
    }
}

struct DigitFish {
    sites: [u128; HOUSE_COUNT],
    base_houses: u32,
    unsolved_houses: u32,
    allowed: u128,
}

impl DigitFish {
    fn new(positions: u128, allowed: u128) -> Self {
        let sites = std::array::from_fn(|index| positions & house_cells(House::from_index(index)));
        let base_houses = sites
            .iter()
            .enumerate()
            .filter(|(_, sites)| sites.count_ones() >= 2)
            .fold(0, |mask, (house, _)| mask | (1 << house));
        let unsolved_houses = sites
            .iter()
            .enumerate()
            .filter(|(_, sites)| **sites != 0)
            .fold(0, |mask, (house, _)| mask | (1 << house));
        Self {
            sites,
            base_houses,
            unsolved_houses,
            allowed,
        }
    }

    fn find(
        &self,
        size: u32,
        removed: u128,
        direct: u128,
        type_one: Option<usize>,
    ) -> Option<Fish> {
        let outcome = visit_bases(
            &self.sites,
            Houses::default(),
            self.base_houses,
            size,
            &mut |bases| {
                // Indirect links must participate in the justification. Each possible
                // alternative contains a candidate from a selected base house.
                if bases.counts[0] & removed & !direct == 0 {
                    return ControlFlow::Continue(());
                }
                let eligible = houses_in(self.unsolved_houses & !bases.selected)
                    .filter(|&house| self.sites[house] & bases.counts[0] != 0)
                    .fold(0u32, |mask, house| mask | (1 << house));
                if eligible.count_ones() < size {
                    return ControlFlow::Continue(());
                }
                let search = Covers {
                    digit: self,
                    bases,
                    eligible,
                    size,
                    removed,
                    direct,
                };
                if let Some(target) = type_one {
                    search.type_one(target)
                } else {
                    search.type_two()
                }
            },
        );
        outcome.break_value()
    }
}

struct Covers<'a> {
    digit: &'a DigitFish,
    bases: Houses,
    eligible: u32,
    size: u32,
    removed: u128,
    direct: u128,
}

impl Covers<'_> {
    fn type_one(&self, target: usize) -> ControlFlow<Fish> {
        let target_houses = CELL_HOUSES[target];
        let options = self.eligible & target_houses;
        let required_at_target = (self.bases.selected & target_houses).count_ones() + 1;
        let mut selected = options;
        while selected != 0 {
            if (required_at_target..=self.size).contains(&selected.count_ones()) {
                let pinned = houses_in(selected).fold(Houses::default(), |covers, index| {
                    covers.with(index, self.digit.sites[index])
                });
                self.fill(pinned, self.eligible & !target_houses, self.bases, None)?;
            }
            selected = (selected - 1) & options;
        }
        ControlFlow::Continue(())
    }

    fn type_two(&self) -> ControlFlow<Fish> {
        for index in houses_in(self.eligible) {
            let sites = self.digit.sites[index];
            let base_sites = sites & self.bases.counts[0];
            if base_sites & self.removed == 0 {
                continue;
            }
            // Every still-possible base candidate in the pinned cover must
            // contribute strictly more to the covers. A balanced candidate in
            // that cover would otherwise survive as an alternative.
            let surplus_needed = base_sites & !self.removed;
            let [once, twice, thrice] = self.bases.counts;
            if twice & surplus_needed != 0 {
                // A cell can belong to at most three distinct houses.
                continue;
            }
            let required = Houses {
                counts: [once, twice | surplus_needed, thrice],
                ..self.bases
            };
            let pinned = Houses::default().with(index, sites);
            self.fill(pinned, self.eligible, required, Some(index))?;
        }
        ControlFlow::Continue(())
    }

    fn fill(
        &self,
        pinned: Houses,
        eligible: u32,
        required: Houses,
        cover: Option<usize>,
    ) -> ControlFlow<Fish> {
        CoverSearch {
            sites: &self.digit.sites,
            required,
            eligible,
            unseen: !self.removed,
            need: self.size,
        }
        .fill(pinned, &mut |covers| self.found(covers, cover))
    }

    fn found(&self, covers: Houses, cover: Option<usize>) -> ControlFlow<Fish> {
        let fins = self.bases.deficit(covers);
        // If no fin is true, every placement contributes at least as much to
        // the covers as to the bases. The two totals are equal, so every true
        // candidate in a cover house has equal base and cover counts.
        let balanced =
            (self.bases.counts[0] & covers.counts[0]) & !(fins | covers.deficit(self.bases));
        if houses_in(self.bases.selected | covers.selected)
            .any(|index| self.digit.sites[index] & balanced == 0)
        {
            return ControlFlow::Continue(());
        }
        let alternatives = fins | cover.map_or(0, |index| self.digit.sites[index] & balanced);
        if alternatives & !self.removed != 0
            || alternatives & !self.direct == 0
            || (cover.is_some() && alternatives.count_ones() < 2)
        {
            return ControlFlow::Continue(());
        }
        ControlFlow::Break(Fish {
            bases: self.bases.selected,
            covers: covers.selected,
            fins,
            cover: cover.map(House::from_index),
            alternatives,
        })
    }
}

#[cfg(test)]
mod tests;
