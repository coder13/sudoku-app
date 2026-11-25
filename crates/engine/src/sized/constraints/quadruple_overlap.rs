use super::{
    RegionSum, SizedConstraintGrid, SizedConstraintStep, SizedQuadruple, eliminations_for,
};

const MAX_CELLS: usize = 8;
const MAX_PAIR_ASSIGNMENTS: usize = 65_536;
const MAX_TOTAL_ASSIGNMENTS: usize = 262_144;

#[derive(Clone, Copy)]
enum Clue<'a> {
    Quadruple(&'a SizedQuadruple),
    RegionSum(&'a RegionSum),
}

impl Clue<'_> {
    fn permits(self, digits: &[u8], full_mask: u16) -> bool {
        match self {
            Self::Quadruple(clue) => clue.permits(digits, full_mask),
            Self::RegionSum(line) => line.permits(digits),
        }
    }
}

impl SizedConstraintGrid {
    pub(super) fn quadruple_overlap_hints(
        &self,
        digits: &[u8],
        candidates: &[u16],
        choices: &mut Vec<SizedConstraintStep>,
        limit: usize,
    ) {
        if self.quadruples.is_empty() || choices.len() >= limit {
            return;
        }
        let mut remaining = MAX_TOTAL_ASSIGNMENTS;
        let mut assignment = digits.to_vec();
        for (left_id, left) in self
            .quadruples
            .iter()
            .enumerate()
            .filter_map(|(id, clue)| Some((id, clue.as_ref()?)))
        {
            let right_clues = self
                .quadruples
                .iter()
                .enumerate()
                .skip(left_id + 1)
                .filter_map(|(id, clue)| Some((id, Clue::Quadruple(clue.as_ref()?))))
                .chain(
                    self.region_sums
                        .iter()
                        .enumerate()
                        .filter_map(|(id, line)| Some((id, Clue::RegionSum(line.as_ref()?)))),
                );
            for (right_id, right) in right_clues {
                let mut cells = left.cells.to_vec();
                match right {
                    Clue::Quadruple(clue) => cells.extend(clue.cells),
                    Clue::RegionSum(line) => {
                        cells.extend(line.cells().take(MAX_CELLS + 1));
                    }
                }
                let total = cells.len();
                cells.sort_unstable();
                cells.dedup();
                if cells.len() > MAX_CELLS || cells.len() == total {
                    continue;
                }

                let domain = |cell: usize| match digits[cell] {
                    0 => candidates[cell],
                    rank => 1 << (rank - 1),
                };
                cells.sort_by_key(|&cell| (domain(cell).count_ones(), cell));
                let mut domains = [0; MAX_CELLS];
                for (slot, &cell) in domains.iter_mut().zip(&cells) {
                    *slot = domain(cell);
                }
                // The product of the domain sizes bounds the full enumeration.
                // Never draw a conclusion from part of a search.
                let Some(work) = domains[..cells.len()]
                    .iter()
                    .try_fold(1usize, |work, mask| {
                        let next = work * mask.count_ones() as usize;
                        (next <= MAX_PAIR_ASSIGNMENTS).then_some(next)
                    })
                else {
                    continue;
                };
                let Some(budget) = remaining.checked_sub(work) else {
                    continue;
                };
                remaining = budget;

                let mut peers = [0u8; MAX_CELLS];
                for (index, &cell) in cells.iter().enumerate() {
                    for (next, &other) in cells.iter().enumerate().skip(index + 1) {
                        if self.layout.memberships[cell].iter().any(|&house| {
                            house < self.layout.houses.len()
                                && self.layout.memberships[other].contains(&house)
                        }) || self
                            .diagonals
                            .iter()
                            .chain(&self.extra_houses)
                            .any(|house| house.contains(&cell) && house.contains(&other))
                        {
                            peers[index] |= 1 << next;
                        }
                    }
                }
                let mut overlap = Overlap {
                    cells: &cells,
                    peers,
                    clues: [Clue::Quadruple(left), right],
                    full_mask: self.layout.full_mask,
                    support: [0; MAX_CELLS],
                };
                overlap.collect(0, domains, &mut assignment);
                if overlap.support[0] == 0 {
                    continue;
                }
                let mut actions = Vec::new();
                for (&cell, supported) in cells.iter().zip(overlap.support) {
                    eliminations_for(cell, candidates[cell] & !supported, &mut actions);
                }
                if !actions.is_empty() {
                    cells.sort_unstable();
                    actions.sort_unstable();
                    choices.push(SizedConstraintStep::QuadrupleOverlap {
                        rules: [left_id, right_id],
                        cells,
                        actions,
                    });
                    if choices.len() == limit {
                        return;
                    }
                }
            }
        }
    }
}

struct Overlap<'a> {
    cells: &'a [usize],
    peers: [u8; MAX_CELLS],
    clues: [Clue<'a>; 2],
    full_mask: u16,
    support: [u16; MAX_CELLS],
}

impl Overlap<'_> {
    fn collect(&mut self, index: usize, domains: [u16; MAX_CELLS], assignment: &mut [u8]) {
        let Some(&cell) = self.cells.get(index) else {
            if self
                .clues
                .iter()
                .all(|clue| clue.permits(assignment, self.full_mask))
            {
                for (mask, digit) in self.support.iter_mut().zip(domains) {
                    *mask |= digit;
                }
            }
            return;
        };
        let mut mask = domains[index];
        while mask != 0 {
            let rank = mask.trailing_zeros() as u8 + 1;
            let bit = 1 << (rank - 1);
            mask &= mask - 1;
            assignment[cell] = rank;
            let mut next = domains;
            next[index] = bit;
            let mut peers = self.peers[index];
            while peers != 0 {
                next[peers.trailing_zeros() as usize] &= !bit;
                peers &= peers - 1;
            }
            self.collect(index + 1, next, assignment);
        }
    }
}
