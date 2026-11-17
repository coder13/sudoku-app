use super::cell_bit;

const COLUMN_SETS: usize = 27;
const BAND_CELLS: usize = 27;
const BAND_MASK: u32 = (1 << BAND_CELLS) - 1;
const PERMUTATIONS: [[usize; 3]; 6] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
];

// Each band uses one column per stack. For each set of three columns there
// are six ways to assign the columns to the three rows.
const BAND_LAYOUTS: [[u32; 6]; COLUMN_SETS] = {
    let mut layouts = [[0; 6]; COLUMN_SETS];
    let mut index = 0;
    while index < COLUMN_SETS {
        let columns = [index / 9, 3 + index / 3 % 3, 6 + index % 3];
        let mut order = 0;
        while order < PERMUTATIONS.len() {
            let [first, second, third] = PERMUTATIONS[order];
            layouts[index][order] =
                (1 << columns[first]) | (1 << (9 + columns[second])) | (1 << (18 + columns[third]));
            order += 1;
        }
        index += 1;
    }
    layouts
};

// With the top band's columns fixed, the middle band has two choices per
// stack. The bottom band must take the one remaining column in each stack.
const COMPLEMENTS: [[(usize, usize); 8]; COLUMN_SETS] = {
    let mut pairs = [[(0, 0); 8]; COLUMN_SETS];
    let mut index = 0;
    while index < COLUMN_SETS {
        let top = [index / 9, index / 3 % 3, index % 3];
        let mut choice = 0;
        while choice < 8 {
            let mut middle = 0;
            let mut bottom = 0;
            let mut stack = 0;
            while stack < 3 {
                let next = (top[stack] + 1 + (choice >> stack & 1)) % 3;
                middle = middle * 3 + next;
                bottom = bottom * 3 + (3 - top[stack] - next);
                stack += 1;
            }
            pairs[index][choice] = (middle, bottom);
            choice += 1;
        }
        index += 1;
    }
    pairs
};

// Return the cells that occur in at least one complete placement of this digit.
// Placed digits and still legal candidates are allowed. A placed digit is the
// only allowed location in its row, column and box.
pub(super) fn possible(allowed: u128) -> u128 {
    let bands: [[u32; COLUMN_SETS]; 3] = std::array::from_fn(|band| {
        let sites = (allowed >> (band * BAND_CELLS)) as u32 & BAND_MASK;
        BAND_LAYOUTS.map(|layouts| {
            layouts.into_iter().fold(0, |possible, layout| {
                if layout & !sites == 0 {
                    possible | layout
                } else {
                    possible
                }
            })
        })
    });

    let mut viable = [0u32; 3];
    for (top, &placements) in bands[0].iter().enumerate() {
        if placements == 0 {
            continue;
        }
        for (middle, bottom) in COMPLEMENTS[top] {
            if bands[1][middle] != 0 && bands[2][bottom] != 0 {
                viable[0] |= 1 << top;
                viable[1] |= 1 << middle;
                viable[2] |= 1 << bottom;
            }
        }
    }

    let mut possible = 0;
    for (band, mut indexes) in viable.into_iter().enumerate() {
        while indexes != 0 {
            let index = indexes.trailing_zeros() as usize;
            indexes &= indexes - 1;
            possible |= u128::from(bands[band][index]) << (band * BAND_CELLS);
        }
    }
    possible
}

pub(super) fn layouts(allowed: u128) -> Vec<u128> {
    use super::bit_indices;

    let bands: [[u16; COLUMN_SETS]; 3] = std::array::from_fn(|band| {
        let sites = (allowed >> (band * BAND_CELLS)) as u32 & BAND_MASK;
        BAND_LAYOUTS.map(|layouts| {
            layouts.iter().enumerate().fold(0, |valid, (i, &layout)| {
                valid | (u16::from(layout & !sites == 0) << i)
            })
        })
    });
    let mut complete = Vec::new();
    for (top, &top_orders) in bands[0].iter().enumerate() {
        if top_orders == 0 {
            continue;
        }
        for (middle, bottom) in COMPLEMENTS[top] {
            let middle_orders = bands[1][middle];
            let bottom_orders = bands[2][bottom];
            if middle_orders == 0 || bottom_orders == 0 {
                continue;
            }
            for a in bit_indices(top_orders) {
                let a = u128::from(BAND_LAYOUTS[top][a]);
                for b in bit_indices(middle_orders) {
                    let upper = a | (u128::from(BAND_LAYOUTS[middle][b]) << BAND_CELLS);
                    complete.extend(bit_indices(bottom_orders).map(|c| {
                        upper | (u128::from(BAND_LAYOUTS[bottom][c]) << (2 * BAND_CELLS))
                    }));
                }
            }
        }
    }
    complete
}

// Every selected cell fulfills each house containing it. Branch on the house
// with the fewest available cells. Compiled peers include the other cells in
// those houses and any additional equal-digit exclusions.
pub(super) fn layouts_in_houses(
    allowed: u128,
    houses: &[u128],
    peers: &[u128; crate::CELLS],
) -> Vec<u128> {
    fn collect(
        allowed: u128,
        chosen: u128,
        houses: &[u128],
        peers: &[u128; crate::CELLS],
        layouts: &mut Vec<u128>,
    ) {
        let mut next = None;
        for &house in houses {
            if house & chosen == 0 {
                let available = house & allowed;
                if available == 0 {
                    return;
                }
                if next.is_none_or(|best: u128| available.count_ones() < best.count_ones()) {
                    next = Some(available);
                }
            }
        }
        if let Some(available) = next {
            for cell in super::cells(available) {
                let bit = cell_bit(cell);
                collect(
                    allowed & !(peers[cell] | bit),
                    chosen | bit,
                    houses,
                    peers,
                    layouts,
                );
            }
        } else {
            layouts.push(chosen);
        }
    }
    let mut layouts = Vec::new();
    collect(allowed, 0, houses, peers, &mut layouts);
    layouts
}

pub(super) fn with_placed(positions: u128, board: &[u8; crate::CELLS], digit: u8) -> u128 {
    board
        .iter()
        .enumerate()
        .fold(positions, |allowed, (cell, &value)| {
            allowed | if value == digit { cell_bit(cell) } else { 0 }
        })
}

#[cfg(test)]
pub(super) fn brute_layouts(allowed: u128) -> Vec<u128> {
    fn search(
        allowed: u128,
        row: usize,
        columns: u16,
        boxes: u16,
        layout: u128,
        result: &mut Vec<u128>,
    ) {
        if row == 9 {
            result.push(layout);
            return;
        }

        for column in 0..9 {
            let cell = row * 9 + column;
            let group = row / 3 * 3 + column / 3;
            if allowed & cell_bit(cell) != 0
                && columns & (1 << column) == 0
                && boxes & (1 << group) == 0
            {
                search(
                    allowed,
                    row + 1,
                    columns | (1 << column),
                    boxes | (1 << group),
                    layout | cell_bit(cell),
                    result,
                );
            }
        }
    }

    let mut result = Vec::new();
    search(allowed, 0, 0, 0, 0, &mut result);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compare(allowed: u128) {
        let mut expected = brute_layouts(allowed);
        let mut actual = layouts(allowed);
        let supported = expected.iter().fold(0, |cells, layout| cells | layout);
        assert_eq!(possible(allowed), supported, "{allowed:x}");
        expected.sort_unstable();
        actual.sort_unstable();
        assert_eq!(actual, expected, "{allowed:x}");
    }

    #[test]
    fn band_factorization_matches_independent_row_search() {
        let all = cell_bit(81) - 1;
        assert_eq!(brute_layouts(all).len(), 46_656);
        for allowed in [
            0,
            all,
            all & !(0x1ff << 45),
            all & !(0x7 | (0x7 << 9) | (0x7 << 18)),
        ] {
            compare(allowed);
        }
        let mut rng = 23u64;
        for _ in 0..128 {
            let allowed = (0..81).fold(0, |positions, cell| {
                rng = rng.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
                positions | if rng >> 61 < 4 { cell_bit(cell) } else { 0 }
            });
            compare(allowed);
        }
    }
}
