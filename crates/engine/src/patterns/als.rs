use std::{cell::OnceCell, collections::HashSet};

use super::{
    CELLS, ControlFlow, Deduction, HintEvidence, House, PEERS, Technique, bit_indices, cell_bit,
    cells, digits, report, report_eliminations, visit_unions,
};
use crate::{AlmostLockedSet, BlossomPetal};

// Six restricted-common links, the default for HoDoKu's all-steps search.
const MAX_CHAIN_SETS: usize = 7;

pub(super) struct AlsSearch {
    pub(super) sets: Vec<Als>,
    links: OnceCell<Vec<Vec<Link>>>,
}

pub(super) struct Als {
    pub(super) cells: u128,
    pub(super) digits: u16,
    visible_to: [u128; 9],
}

impl Als {
    pub(super) fn common_peers(&self, digit_index: usize) -> u128 {
        self.visible_to[digit_index]
    }

    fn new(cells_in_set: u128, digit_mask: u16, positions: &[u128; 9]) -> Self {
        let mut visible_to = [0; 9];
        for digit in bit_indices(digit_mask) {
            let mut members = cells(positions[digit] & cells_in_set);
            let first = members.next().unwrap();
            visible_to[digit] = members.fold(PEERS[first], |peers, cell| peers & PEERS[cell]);
        }
        Self {
            cells: cells_in_set,
            digits: digit_mask,
            visible_to,
        }
    }

    pub(super) fn evidence(&self) -> AlmostLockedSet {
        AlmostLockedSet {
            cells: cells(self.cells).collect(),
            digits: digits(self.digits).collect(),
        }
    }
}

#[derive(Clone, Copy)]
struct Link {
    to: usize,
    digits: u16,
}

impl AlsSearch {
    pub(super) fn new(masks: &[u16; CELLS], positions: &[u128; 9]) -> Self {
        let mut seen = HashSet::new();
        let mut sets = Vec::new();
        for house in House::all() {
            let house_cells = house.cells();
            let candidates = house_cells.map(|cell| masks[cell]);
            let active = candidates.iter().filter(|&&mask| mask != 0).count() as u32;
            for size in 1..=active.min(8) {
                let eligible = candidates.iter().enumerate().fold(0, |bits, (i, mask)| {
                    bits | (u16::from((1..=size + 1).contains(&mask.count_ones())) << i)
                });
                let _ = visit_unions::<true>(
                    &candidates,
                    eligible,
                    size + 1,
                    size,
                    0,
                    0,
                    &mut |group, digits| {
                        let selected =
                            bit_indices(group).fold(0, |set, i| set | cell_bit(house_cells[i]));
                        if seen.insert(selected) {
                            sets.push(Als::new(selected, digits, positions));
                        }
                        ControlFlow::Continue(())
                    },
                );
            }
        }
        sets.sort_unstable_by_key(|set| (set.cells.count_ones(), set.cells));
        Self {
            sets,
            links: OnceCell::new(),
        }
    }

    fn links(&self, positions: &[u128; 9]) -> &[Vec<Link>] {
        self.links.get_or_init(|| {
            let mut links = vec![Vec::new(); self.sets.len()];
            for (i, a) in self.sets.iter().enumerate() {
                for (j, b) in self.sets.iter().enumerate().skip(i + 1) {
                    let mut restricted = 0;
                    for digit in bit_indices(a.digits & b.digits) {
                        // Peers exclude their own cell, so shared occurrences cannot be RCCs.
                        if positions[digit] & b.cells & !a.visible_to[digit] == 0 {
                            restricted |= 1 << digit;
                        }
                    }
                    if restricted != 0 {
                        links[i].push(Link {
                            to: j,
                            digits: restricted,
                        });
                        links[j].push(Link {
                            to: i,
                            digits: restricted,
                        });
                    }
                }
            }
            links
        })
    }

    pub(super) fn visit(
        &self,
        masks: &[u16; CELLS],
        positions: &[u128; 9],
        technique: Technique,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        match technique {
            Technique::AlsXz => self.visit_xz(positions, visit),
            Technique::AlsXyWing | Technique::AlsChain => {
                self.visit_chains(positions, technique, visit)
            }
            Technique::DeathBlossom => self.visit_blossoms(masks, positions, visit),
            _ => unreachable!(),
        }
    }

    fn visit_xz(
        &self,
        positions: &[u128; 9],
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        for (i, (a, edges)) in self.sets.iter().zip(self.links(positions)).enumerate() {
            for link in edges.iter().filter(|link| i < link.to) {
                let b = &self.sets[link.to];
                let targets = match link.digits.count_ones() {
                    1 => common_targets(a, b, link.digits, positions),
                    2 => {
                        // Each RCC occurs in one set, so each set uses all its other digits.
                        let mut targets = common_targets(a, b, !link.digits, positions);
                        for set in [a, b] {
                            for digit in bit_indices(set.digits & !link.digits) {
                                targets[digit] |=
                                    set.visible_to[digit] & !set.cells & positions[digit];
                            }
                        }
                        targets
                    }
                    // Three exclusive shared digits would leave too few digits to fill both sets.
                    _ => continue,
                };
                report_eliminations(visit, Technique::AlsXz, targets, || HintEvidence::AlsXz {
                    sets: [a.evidence(), b.evidence()],
                    links: digits(link.digits).collect(),
                })?;
            }
        }
        ControlFlow::Continue(())
    }

    fn visit_chains(
        &self,
        positions: &[u128; 9],
        technique: Technique,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let lengths = if technique == Technique::AlsXyWing {
            2..=2
        } else {
            3..=MAX_CHAIN_SETS - 1
        };
        let links = self.links(positions);
        let mut search = ChainSearch {
            links,
            eligible_ends: vec![false; links.len()],
            furthest_ends: vec![[usize::MAX; 9]; links.len() * (*lengths.end() + 1)],
            target_digit: 0,
        };
        let mut path = ChainPath {
            sets: Vec::with_capacity(MAX_CHAIN_SETS),
            links: Vec::with_capacity(MAX_CHAIN_SETS - 1),
        };
        let mut endpoints = Vec::new();
        let mut unreported = *positions;
        for digit in 0..9 {
            for target in cells(unreported[digit]) {
                let target = cell_bit(target);
                if unreported[digit] & target == 0 {
                    continue;
                }
                endpoints.clear();
                for (index, set) in self.sets.iter().enumerate() {
                    if set.visible_to[digit] & !set.cells & target != 0 && !links[index].is_empty()
                    {
                        endpoints.push(index);
                    }
                }
                if endpoints.len() < 2
                    || !search.find(digit, &endpoints, lengths.clone(), &mut path)
                {
                    continue;
                }
                let a = &self.sets[path.sets[0]];
                let b = &self.sets[*path.sets.last().unwrap()];
                let excluded = (1 << path.links[0]) | (1 << path.links.last().unwrap());
                let targets = common_targets(a, b, excluded, positions);
                for (remaining, targets) in unreported.iter_mut().zip(targets) {
                    *remaining &= !targets;
                }
                report_eliminations(visit, technique, targets, || HintEvidence::AlsChain {
                    sets: path
                        .sets
                        .iter()
                        .map(|&index| self.sets[index].evidence())
                        .collect(),
                    links: path.links.iter().map(|&digit| digit as u8 + 1).collect(),
                })?;
            }
        }
        ControlFlow::Continue(())
    }

    fn visit_blossoms(
        &self,
        masks: &[u16; CELLS],
        positions: &[u128; 9],
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let mut by_link: [Vec<&Als>; 9] = std::array::from_fn(|_| Vec::new());
        for (stem, &stem_digits) in masks
            .iter()
            .enumerate()
            .filter(|&(_, mask)| mask.count_ones() > 1)
        {
            let stem_bit = cell_bit(stem);
            let mut coverage = [[0; 9]; 9];
            for petals in &mut by_link {
                petals.clear();
            }
            for set in self.sets.iter().filter(|set| set.cells & stem_bit == 0) {
                for link in bit_indices(stem_digits & set.digits) {
                    if set.visible_to[link] & stem_bit == 0 {
                        continue;
                    }
                    by_link[link].push(set);
                    for digit in bit_indices(set.digits & !stem_digits) {
                        coverage[link][digit] |= set.visible_to[digit] & !(set.cells | stem_bit);
                    }
                }
            }

            for digit in bit_indices(crate::DIGITS & !stem_digits) {
                let mut remaining = bit_indices(stem_digits)
                    .fold(positions[digit], |targets, link| {
                        targets & coverage[link][digit]
                    });
                while remaining != 0 {
                    let target = cell_bit(remaining.trailing_zeros() as usize);
                    let petals: Vec<_> = bit_indices(stem_digits)
                        .map(|link| {
                            let set = by_link[link]
                                .iter()
                                .copied()
                                .find(|set| target & set.visible_to[digit] & !set.cells != 0)
                                .unwrap();
                            (link, set)
                        })
                        .collect();
                    let targets = petals.iter().fold(remaining, |targets, (_, set)| {
                        targets & set.visible_to[digit] & !set.cells
                    });
                    remaining &= !targets;
                    report(
                        visit,
                        Technique::DeathBlossom,
                        targets,
                        digit as u8 + 1,
                        || HintEvidence::DeathBlossom {
                            stem,
                            petals: petals
                                .into_iter()
                                .map(|(link, set)| BlossomPetal {
                                    digit: link as u8 + 1,
                                    set: set.evidence(),
                                })
                                .collect(),
                        },
                    )?;
                }
            }
        }
        ControlFlow::Continue(())
    }
}

fn common_targets(a: &Als, b: &Als, excluded: u16, positions: &[u128; 9]) -> [u128; 9] {
    let mut targets = [0; 9];
    for digit in bit_indices(a.digits & b.digits & !excluded) {
        targets[digit] =
            a.visible_to[digit] & b.visible_to[digit] & !(a.cells | b.cells) & positions[digit];
    }
    targets
}

struct ChainPath {
    sets: Vec<usize>,
    links: Vec<usize>,
}

struct ChainSearch<'a> {
    links: &'a [Vec<Link>],
    eligible_ends: Vec<bool>,
    furthest_ends: Vec<[usize; 9]>,
    target_digit: usize,
}

impl ChainSearch<'_> {
    fn find(
        &mut self,
        digit: usize,
        endpoints: &[usize],
        lengths: std::ops::RangeInclusive<usize>,
        path: &mut ChainPath,
    ) -> bool {
        self.target_digit = digit;
        self.eligible_ends.fill(false);
        self.furthest_ends.fill([usize::MAX; 9]);
        for &index in endpoints {
            self.eligible_ends[index] = true;
        }
        path.sets.clear();
        path.links.clear();
        for length in lengths {
            for &start in &endpoints[..endpoints.len() - 1] {
                if self.furthest_end(start, digit, length) <= start + 1 {
                    continue;
                }
                path.sets.push(start);
                if self.extend(path, digit, length) {
                    return true;
                }
                path.sets.pop();
            }
        }
        false
    }

    // Ignore already-used sets in this reachability cache. It can only rule out a path;
    // the actual search still checks each path for repeated sets.
    fn furthest_end(&mut self, current: usize, incoming: usize, remaining: usize) -> usize {
        if remaining == 0 {
            return if incoming != self.target_digit && self.eligible_ends[current] {
                current + 1
            } else {
                0
            };
        }
        let slot = remaining * self.links.len() + current;
        let cached = self.furthest_ends[slot][incoming];
        if cached != usize::MAX {
            return cached;
        }
        let mut furthest = 0;
        for link in &self.links[current] {
            for digit in bit_indices(link.digits & !(1 << incoming)) {
                furthest = furthest.max(self.furthest_end(link.to, digit, remaining - 1));
            }
        }
        self.furthest_ends[slot][incoming] = furthest;
        furthest
    }

    fn extend(&mut self, path: &mut ChainPath, incoming: usize, remaining: usize) -> bool {
        let start = path.sets[0];
        let current = *path.sets.last().unwrap();
        for &link in &self.links[current] {
            if path.sets.contains(&link.to) {
                continue;
            }
            for digit in bit_indices(link.digits & !(1 << incoming)) {
                if self.furthest_end(link.to, digit, remaining - 1) <= start + 1 {
                    continue;
                }
                path.links.push(digit);
                path.sets.push(link.to);
                if remaining == 1 || self.extend(path, digit, remaining - 1) {
                    return true;
                }
                path.sets.pop();
                path.links.pop();
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chain_cannot_reuse_the_incoming_restricted_digit_to_prove_the_next_link() {
        let mut links = vec![vec![]; 4];
        for (a, b, digit) in [(0, 1, 1), (1, 2, 2), (2, 3, 3)] {
            links[a].push(Link {
                to: b,
                digits: 1 << digit,
            });
            links[b].push(Link {
                to: a,
                digits: 1 << digit,
            });
        }

        let find = |links: &[Vec<Link>]| {
            let mut search = ChainSearch {
                links,
                eligible_ends: vec![false; links.len()],
                furthest_ends: vec![[usize::MAX; 9]; links.len() * MAX_CHAIN_SETS],
                target_digit: 0,
            };
            let mut path = ChainPath {
                sets: Vec::new(),
                links: Vec::new(),
            };
            search
                .find(0, &[0, 3], 3..=6, &mut path)
                .then_some(path.links)
        };

        assert_eq!(find(&links), Some(vec![1, 2, 3]));
        links[1][1].digits = 1 << 1;
        links[2][0].digits = 1 << 1;
        assert_eq!(find(&links), None);
    }
}
