use std::collections::HashSet;

use super::CrustClue;

#[derive(Clone, Copy, Default, Debug, Eq, Hash, PartialEq)]
struct Cells([u128; 2]);

impl Cells {
    fn of(cell: usize) -> Self {
        let mut value = Self::default();
        value.0[cell / 128] = 1 << (cell % 128);
        value
    }

    fn union(self, other: Self) -> Self {
        Self([self.0[0] | other.0[0], self.0[1] | other.0[1]])
    }

    fn without(self, other: Self) -> Self {
        Self([self.0[0] & !other.0[0], self.0[1] & !other.0[1]])
    }

    fn contains(self, other: Self) -> bool {
        other.without(self).empty()
    }

    fn empty(self) -> bool {
        self == Self::default()
    }

    fn indices(self) -> impl Iterator<Item = usize> {
        self.0.into_iter().enumerate().flat_map(|(word, mut mask)| {
            std::iter::from_fn(move || {
                if mask == 0 {
                    return None;
                }
                let cell = mask.trailing_zeros() as usize + 128 * word;
                mask &= mask - 1;
                Some(cell)
            })
        })
    }
}

#[derive(Debug)]
pub(super) struct RegionGeometry {
    adjacency: Vec<Cells>,
    full: Cells,
}

impl RegionGeometry {
    pub(super) fn new(size: usize) -> Self {
        let mut full = Cells::default();
        let adjacency = (0..size * size)
            .map(|cell| {
                full = full.union(Cells::of(cell));
                let (row, column) = (cell / size, cell % size);
                [
                    (row > 0).then(|| cell - size),
                    (row + 1 < size).then_some(cell + size),
                    (column > 0).then(|| cell - 1),
                    (column + 1 < size).then_some(cell + 1),
                ]
                .into_iter()
                .flatten()
                .map(Cells::of)
                .fold(Cells::default(), Cells::union)
            })
            .collect();
        Self { adjacency, full }
    }

    /// Find a partition for fixed digits. An exhausted budget stays distinct
    /// from a grid proved to have no region partition.
    pub(super) fn partition(
        &self,
        size: usize,
        digits: &[u8],
        clues: &[CrustClue],
        shared_region: Option<[usize; 2]>,
        fixed_edges: &[[usize; 2]],
        budget: &mut u32,
    ) -> Result<Option<Vec<Vec<usize>>>, Exhausted> {
        let mut search = RegionSearch {
            size,
            digits,
            geometry: self,
            forbidden: vec![Cells::default(); size * size],
            joined: vec![Cells::default(); size * size],
            groups: vec![Group::default(); size * size],
            required: Vec::new(),
            options: Vec::new(),
            by_cell: vec![Vec::new(); size * size],
        };
        if !search.add_clues(clues, shared_region, fixed_edges) || !search.connect_required_cells()
        {
            return Ok(None);
        }
        // Each region contains exactly one 1. Use that cell as its root so
        // a connected set is generated for a single root.
        for (cell, &digit) in digits[..size * size].iter().enumerate() {
            if digit == 1 {
                let group = search.groups[cell];
                search.expand(
                    group.cells,
                    group.digits,
                    group.frontier,
                    &mut HashSet::new(),
                    budget,
                )?;
            }
        }
        let mut needed: Vec<_> = search
            .required
            .iter()
            .map(|requirement| requirement.inside)
            .collect();
        let mut found = Vec::with_capacity(size);
        Ok(search
            .cover(self.full, &mut needed, &mut found, budget)?
            .then(|| {
                found
                    .into_iter()
                    .map(|region| region.indices().collect())
                    .collect()
            }))
    }
}

#[derive(Debug)]
pub(super) struct Exhausted;

fn visit(budget: &mut u32) -> Result<(), Exhausted> {
    *budget = budget.checked_sub(1).ok_or(Exhausted)?;
    Ok(())
}

struct Count {
    edges: Vec<Cells>,
    inside: u8,
}

struct OptionRegion {
    cells: Cells,
    counts: Vec<u8>,
}

#[derive(Clone, Copy, Default)]
struct Group {
    cells: Cells,
    frontier: Cells,
    forbidden: Cells,
    digits: u16,
}

struct RegionSearch<'a> {
    size: usize,
    digits: &'a [u8],
    geometry: &'a RegionGeometry,
    forbidden: Vec<Cells>,
    joined: Vec<Cells>,
    groups: Vec<Group>,
    required: Vec<Count>,
    options: Vec<OptionRegion>,
    by_cell: Vec<Vec<usize>>,
}

impl RegionSearch<'_> {
    fn ban_edge(&mut self, a: usize, b: usize) {
        self.forbidden[a] = self.forbidden[a].union(Cells::of(b));
        self.forbidden[b] = self.forbidden[b].union(Cells::of(a));
    }

    fn add_clues(
        &mut self,
        clues: &[CrustClue],
        shared_region: Option<[usize; 2]>,
        fixed_edges: &[[usize; 2]],
    ) -> bool {
        for clue in clues {
            let mut total = 0;
            let Some(last) = clue.cells.iter().position(|&cell| {
                total += u16::from(self.digits[cell]);
                total >= clue.sum
            }) else {
                return false;
            };
            if total != clue.sum {
                return false;
            }
            if last + 1 < self.size {
                self.ban_edge(clue.cells[last], clue.cells[last + 1]);
            }
            if let Some(crossed) = clue.crossed {
                let Some(inside) = last.checked_sub(usize::from(crossed)) else {
                    return false;
                };
                if crossed == 0 {
                    for pair in clue.cells[..=last].windows(2) {
                        self.joined[pair[0]] = self.joined[pair[0]].union(Cells::of(pair[1]));
                        self.joined[pair[1]] = self.joined[pair[1]].union(Cells::of(pair[0]));
                    }
                } else if inside == 0 {
                    for pair in clue.cells[..=last].windows(2) {
                        self.ban_edge(pair[0], pair[1]);
                    }
                } else {
                    let edges = clue.cells[..=last]
                        .windows(2)
                        .map(|pair| Cells::of(pair[0]).union(Cells::of(pair[1])))
                        .collect();
                    self.required.push(Count {
                        edges,
                        inside: inside as u8,
                    });
                }
            }
        }
        if let Some([a, b]) = shared_region {
            self.joined[a] = self.joined[a].union(Cells::of(b));
            self.joined[b] = self.joined[b].union(Cells::of(a));
        }
        for &[a, b] in fixed_edges {
            self.ban_edge(a, b);
        }
        true
    }

    fn connect_required_cells(&mut self) -> bool {
        for root in 0..self.groups.len() {
            if !self.groups[root].cells.empty() {
                continue;
            }
            let mut group = Group::default();
            let mut next = Cells::of(root);
            while !next.empty() {
                group.cells = group.cells.union(next);
                let mut spread = Cells::default();
                for cell in next.indices() {
                    let digit = 1 << (self.digits[cell] - 1);
                    if group.digits & digit != 0 {
                        return false;
                    }
                    group.digits |= digit;
                    group.frontier = group.frontier.union(self.geometry.adjacency[cell]);
                    group.forbidden = group.forbidden.union(self.forbidden[cell]);
                    spread = spread.union(self.joined[cell]);
                }
                next = spread.without(group.cells);
            }
            if group.cells.without(group.forbidden) != group.cells {
                return false;
            }
            for cell in group.cells.indices() {
                self.groups[cell] = group;
            }
        }
        true
    }

    fn expand(
        &mut self,
        members: Cells,
        used: u16,
        frontier: Cells,
        seen: &mut HashSet<Cells>,
        budget: &mut u32,
    ) -> Result<(), Exhausted> {
        if !seen.insert(members) {
            return Ok(());
        }
        visit(budget)?;
        if used.count_ones() as usize == self.size {
            let mut counts = Vec::with_capacity(self.required.len());
            for requirement in &self.required {
                let count = requirement
                    .edges
                    .iter()
                    .filter(|&&edge| members.contains(edge))
                    .count() as u8;
                if count > requirement.inside {
                    return Ok(());
                }
                counts.push(count);
            }
            for cell in members.indices() {
                self.by_cell[cell].push(self.options.len());
            }
            self.options.push(OptionRegion {
                cells: members,
                counts,
            });
            return Ok(());
        }
        for cell in frontier.without(members).indices() {
            let group = self.groups[cell];
            if used & group.digits == 0 && members.without(group.forbidden) == members {
                self.expand(
                    members.union(group.cells),
                    used | group.digits,
                    frontier.union(group.frontier),
                    seen,
                    budget,
                )?;
            }
        }
        Ok(())
    }

    fn cover(
        &self,
        remaining: Cells,
        needed: &mut [u8],
        found: &mut Vec<Cells>,
        budget: &mut u32,
    ) -> Result<bool, Exhausted> {
        visit(budget)?;
        if remaining.empty() {
            return Ok(needed.iter().all(|&count| count == 0));
        }
        let choices = remaining
            .indices()
            .map(|cell| {
                self.by_cell[cell]
                    .iter()
                    .map(|&id| &self.options[id])
                    .filter(|option| {
                        remaining.contains(option.cells)
                            && needed
                                .iter()
                                .zip(&option.counts)
                                .all(|(&target, &count)| target >= count)
                    })
                    .collect::<Vec<_>>()
            })
            .min_by_key(Vec::len)
            .unwrap_or_default();
        for candidate in choices {
            for (target, count) in needed.iter_mut().zip(&candidate.counts) {
                *target -= count;
            }
            found.push(candidate.cells);
            if self.cover(remaining.without(candidate.cells), needed, found, budget)? {
                return Ok(true);
            }
            found.pop();
            for (target, count) in needed.iter_mut().zip(&candidate.counts) {
                *target += count;
            }
        }
        Ok(false)
    }
}
