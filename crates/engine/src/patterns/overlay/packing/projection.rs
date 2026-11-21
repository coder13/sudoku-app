//! Bounded search over the cell placements of five overlay digits.

use super::super::super::{PEERS, house_cells};
use super::super::Geometry;
use super::{Family, WIDTH, cell_bit, cells};
use crate::{CELLS, House};

const CLASSIC_HOUSES: [u128; 27] = {
    let mut houses = [0; 27];
    let mut index = 0;
    while index < 9 {
        houses[index] = house_cells(House::Row(index));
        houses[index + 9] = house_cells(House::Column(index));
        houses[index + 18] = house_cells(House::Box(index));
        index += 1;
    }
    houses
};

// Share a budget across the group so long proofs keep using the indexed solver.
const GROUP_NODES: u32 = 4096;
const PROBE_NODES: u32 = 1024;

pub(super) struct Search<'a> {
    geometry: Geometry<'a>,
    initial: Position,
    remaining: u32,
}

#[derive(Clone, Copy)]
struct Position {
    available: [u128; WIDTH],
    placed: [u128; WIDTH],
}

impl<'a> Search<'a> {
    // The caller's layout lists enumerate the supplied geometry exhaustively.
    // The narrowed domains apply the support already found for smaller groups.
    pub(super) fn new(families: &[Family<'_>], geometry: Option<Geometry<'a>>) -> Option<Self> {
        let families: &[Family<'_>; WIDTH] = families.try_into().ok()?;
        Some(Self {
            geometry: geometry.unwrap_or(Geometry {
                houses: &CLASSIC_HOUSES,
                peers: &PEERS,
            }),
            initial: Position {
                available: families.map(|family| family.allowed),
                placed: [0; WIDTH],
            },
            remaining: GROUP_NODES,
        })
    }

    // None leaves the candidate for the original exact layout search.
    pub(super) fn find(
        &mut self,
        pinned: usize,
        cell: usize,
        families: &[Family<'_>],
        witness: &mut [u128; 9],
    ) -> Option<bool> {
        let budget = self.remaining.min(PROBE_NODES);
        if budget == 0 {
            return None;
        }
        let mut nodes = budget;
        let mut position = self.initial;
        position.place(pinned, cell, self.geometry.peers);
        let result = self.visit(&mut position, &mut nodes);
        self.remaining -= budget - nodes;
        if result == Some(true) {
            for (family, layout) in families.iter().zip(position.placed) {
                witness[family.digit] = layout;
            }
        }
        result
    }

    fn visit(&self, position: &mut Position, nodes: &mut u32) -> Option<bool> {
        *nodes = nodes.checked_sub(1)?;
        let mut next = None;
        let mut fewest = 10;
        for digit in 0..WIDTH {
            for &house in self.geometry.houses {
                if house & position.placed[digit] != 0 {
                    continue;
                }
                let sites = house & position.available[digit];
                let count = sites.count_ones();
                if count == 0 {
                    return Some(false);
                }
                if count < fewest {
                    fewest = count;
                    next = Some((digit, sites));
                }
            }
        }
        let Some((digit, sites)) = next else {
            return Some(true);
        };
        for cell in cells(sites) {
            let mut following = *position;
            following.place(digit, cell, self.geometry.peers);
            if self.visit(&mut following, nodes)? {
                *position = following;
                return Some(true);
            }
        }
        Some(false)
    }
}

impl Position {
    fn place(&mut self, digit: usize, cell: usize, peers: &[u128; CELLS]) {
        let bit = cell_bit(cell);
        self.placed[digit] |= bit;
        for sites in &mut self.available {
            *sites &= !bit;
        }
        self.available[digit] &= !peers[cell];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn budget_exhaustion_leaves_a_witness_to_the_layout_fallback() {
        let mut layouts = [[0u128; 1]; WIDTH];
        for cell in 0..CELLS {
            let row = cell / 9;
            let digit = (row * 3 + row / 3 + cell % 9) % 9;
            if digit < WIDTH {
                layouts[digit][0] |= cell_bit(cell);
            }
        }
        let families = std::array::from_fn::<_, WIDTH, _>(|digit| Family {
            digit,
            allowed: layouts[digit][0],
            layouts: &layouts[digit],
        });
        let mut search = Search::new(&families, None).unwrap();
        search.remaining = 1;
        let mut witness = [0; 9];
        assert_eq!(search.find(0, 0, &families, &mut witness), None);
        assert_eq!(witness, [0; 9]);

        search.remaining = 1;
        let support = super::super::support_with_probes(&families, [0; 9], 0, 0, Some(search));
        assert_eq!(&support[..WIDTH], &layouts.map(|entry| entry[0]));
    }
}
