//! Completions of the overlay's masks and equal-digit geometry, not variant solutions.

use super::super::completions::{Domains, complete};
use super::{Geometry, cell_bit, cells};
use crate::{Board, CELLS, DIGITS, Units};

const NODES_PER_PROBE: u32 = 128;

pub(super) fn support(
    allowed: &[u128; 9],
    geometry: Option<Geometry<'_>>,
    nodes: u32,
) -> [u128; 9] {
    let masks = std::array::from_fn(|cell| {
        allowed.iter().enumerate().fold(0, |mask, (digit, sites)| {
            mask | if sites & cell_bit(cell) != 0 {
                1 << digit
            } else {
                0
            }
        })
    });
    // Every nine-cell house requires distinct digits even if its redundant
    // equal-digit pairs were not included in the supplied peer table.
    let peers = geometry.map(|geometry| {
        let mut peers = *geometry.peers;
        for &house in geometry.houses {
            for cell in cells(house) {
                peers[cell] |= house & !cell_bit(cell);
            }
        }
        peers
    });
    let mut search = Coverage::new(masks, nodes);
    for (digit, &sites) in allowed.iter().enumerate() {
        for cell in cells(sites) {
            if search.supported[digit] & cell_bit(cell) != 0 {
                continue;
            }
            if search.remaining == 0 {
                return search.supported;
            }
            let mut masks = search.masks;
            masks[cell] &= 1 << digit;
            let mut board = [0; CELLS];
            let mut budget = search.remaining.min(NODES_PER_PROBE);
            let start = budget;
            let found = match &peers {
                None => complete(&mut board, &mut Units::default(), &masks, &mut budget),
                Some(peers) => complete(
                    &mut board,
                    &mut PeerDomains::new(peers),
                    &masks,
                    &mut budget,
                ),
            };
            search.remaining -= start - budget;
            if found {
                search.record(&board);
            }
        }
    }
    search.supported
}

struct Coverage {
    masks: [u16; CELLS],
    supported: [u128; 9],
    free: Vec<u8>,
    remaining: u32,
}

impl Coverage {
    fn new(masks: [u16; CELLS], nodes: u32) -> Self {
        let fixed = masks
            .iter()
            .filter(|mask| mask.is_power_of_two())
            .fold(0, |fixed, mask| fixed | mask);
        Self {
            masks,
            supported: [0; 9],
            remaining: nodes,
            free: (1..=9)
                .filter(|digit| fixed & (1 << (digit - 1)) == 0)
                .collect(),
        }
    }

    fn record(&mut self, board: &Board) {
        self.add(board);
        // Digit permutations preserve all overlay houses and equal-digit
        // exclusions. Retain a permutation only if every supplied mask allows it.
        for shift in 1..self.free.len() {
            let mut rename = std::array::from_fn::<_, 10, _>(|digit| digit as u8);
            for (index, &digit) in self.free.iter().enumerate() {
                rename[digit as usize] = self.free[(index + shift) % self.free.len()];
            }
            let renamed = board.map(|digit| rename[digit as usize]);
            if renamed
                .iter()
                .zip(self.masks)
                .all(|(&digit, mask)| mask & (1 << (digit - 1)) != 0)
            {
                self.add(&renamed);
            }
        }
    }

    fn add(&mut self, board: &Board) {
        for (cell, &digit) in board.iter().enumerate() {
            self.supported[digit as usize - 1] |= cell_bit(cell);
        }
    }
}

struct PeerDomains<'a> {
    peers: &'a [u128; CELLS],
    placed: [u128; 9],
}

impl<'a> PeerDomains<'a> {
    fn new(peers: &'a [u128; CELLS]) -> Self {
        Self {
            peers,
            placed: [0; 9],
        }
    }
}

impl Domains for PeerDomains<'_> {
    fn available(&self, cell: usize) -> u16 {
        self.placed
            .iter()
            .enumerate()
            .fold(DIGITS, |mask, (digit, placed)| {
                if self.peers[cell] & placed == 0 {
                    mask
                } else {
                    mask & !(1 << digit)
                }
            })
    }

    fn toggle(&mut self, cell: usize, bit: u16) {
        self.placed[bit.trailing_zeros() as usize] ^= cell_bit(cell);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: u128 = (1 << CELLS) - 1;
    const X_SOLUTION: &str =
        "658492731974316582132875694461523978387149256295768143849251367726934815513687429";

    fn houses() -> Vec<u128> {
        crate::House::all()
            .map(|house| {
                house
                    .cells()
                    .into_iter()
                    .fold(0, |mask, cell| mask | cell_bit(cell))
            })
            .collect()
    }

    fn allowed(masks: &[u16; CELLS]) -> [u128; 9] {
        std::array::from_fn(|digit| {
            masks.iter().enumerate().fold(0, |sites, (cell, mask)| {
                sites
                    | if mask & (1 << digit) != 0 {
                        cell_bit(cell)
                    } else {
                        0
                    }
            })
        })
    }

    // Independent completed-grid check: inspect every mask, house and peer pair.
    fn valid(board: &Board, masks: &[u16; CELLS], houses: &[u128], peers: &[u128; CELLS]) -> bool {
        board
            .iter()
            .zip(masks)
            .all(|(&digit, mask)| (1..=9).contains(&digit) && mask & (1 << (digit - 1)) != 0)
            && houses.iter().all(|&house| {
                let mut digits: Vec<_> = cells(house).map(|cell| board[cell]).collect();
                digits.sort_unstable();
                digits == (1..=9).collect::<Vec<_>>()
            })
            && (0..CELLS).all(|a| {
                (a + 1..CELLS).all(|b| peers[a] & cell_bit(b) == 0 || board[a] != board[b])
            })
    }

    #[test]
    fn incomplete_and_impossible_probes_supply_no_support() {
        for budget in [0, 1, 81] {
            assert_eq!(support(&[ALL; 9], None, budget), [0; 9]);
        }
        let mut masks = [DIGITS; CELLS];
        masks[0] = 1;
        masks[1] = 1;
        assert_eq!(support(&allowed(&masks), None, 4096), [0; 9]);
        let mut board = [0; CELLS];
        let mut domains = PeerDomains::new(&super::super::PEERS);
        assert!(!complete(
            &mut board,
            &mut domains,
            &[DIGITS; CELLS],
            &mut 1
        ));
        assert_eq!(board, [0; CELLS]);
        assert_eq!(domains.placed, [0; 9]);
    }

    #[test]
    fn empty_classic_domains_have_full_support_within_the_bound() {
        assert_eq!(support(&[ALL; 9], None, 4096), [ALL; 9]);
    }

    #[test]
    fn renaming_never_moves_fixed_digits_or_records_forbidden_candidates() {
        let board = crate::parse_givens(X_SOLUTION).unwrap();
        let mut masks = [DIGITS; CELLS];
        masks[0] = 1 << (board[0] - 1);
        masks[1] &= !(1 << 2); // Forbid 3; the original cell contains 5.
        assert!(valid(&board, &masks, &houses(), &super::super::PEERS));
        let mut coverage = Coverage::new(masks, 0);
        coverage.record(&board);
        let covered = |cell| {
            coverage
                .supported
                .iter()
                .enumerate()
                .fold(0, |mask, (digit, sites)| {
                    mask | if sites & cell_bit(cell) != 0 {
                        1 << digit
                    } else {
                        0
                    }
                })
        };
        assert_eq!(covered(0), masks[0]);
        assert_eq!(covered(1) & (1 << 2), 0);
        assert!(covered(1).count_ones() > 1);
        for cell in 0..CELLS {
            assert_eq!(covered(cell) & !masks[cell], 0);
            assert_ne!(covered(cell) & (1 << (board[cell] - 1)), 0);
        }
    }

    #[test]
    fn small_domains_match_exhaustive_assignments_with_extra_houses_and_excluded_pairs() {
        let solution = crate::parse_givens(X_SOLUTION).unwrap();
        let holes = [1, 6, 10, 15]; // A 5/7 rectangle with two Classic completions.
        let masks = std::array::from_fn(|cell| {
            if holes.contains(&cell) {
                (1 << 4) | (1 << 6)
            } else {
                1 << (solution[cell] - 1)
            }
        });
        let standard = houses();
        let mut diagonal = standard.clone();
        diagonal.push((0..9).fold(0, |mask, index| mask | cell_bit(index * 10)));
        let mut extra_peers = super::super::PEERS;
        extra_peers[10] |= cell_bit(30); // A fixed 5 outside r2c2's standard houses.
        extra_peers[30] |= cell_bit(10);
        assert_eq!(solution[30], 5);
        for (houses, peers, geometry) in [
            (&standard, &super::super::PEERS, None),
            (
                &diagonal,
                &super::super::PEERS,
                Some(Geometry {
                    houses: &diagonal,
                    peers: &super::super::PEERS,
                }),
            ),
            (
                &standard,
                &extra_peers,
                Some(Geometry {
                    houses: &standard,
                    peers: &extra_peers,
                }),
            ),
        ] {
            let mut expected = [0; 9];
            let mut count = 0;
            for assignment in 0..16 {
                let mut board = solution;
                for (index, cell) in holes.into_iter().enumerate() {
                    board[cell] = if assignment & (1 << index) == 0 { 5 } else { 7 };
                }
                if valid(&board, &masks, houses, peers) {
                    count += 1;
                    for (cell, digit) in board.into_iter().enumerate() {
                        expected[digit as usize - 1] |= cell_bit(cell);
                    }
                }
            }
            assert_eq!(count, if geometry.is_none() { 2 } else { 1 });
            assert_eq!(support(&allowed(&masks), geometry, 4096), expected);
        }
    }

    #[test]
    fn jigsaw_witnesses_do_not_assume_standard_boxes() {
        // Row-shaped regions give a Latin Sudoku whose 3x3 boxes repeat digits.
        let board = std::array::from_fn(|cell| ((cell / 9 + cell % 9) % 9 + 1) as u8);
        let mut houses: Vec<_> = crate::House::all()
            .take(18)
            .map(|house| {
                house
                    .cells()
                    .into_iter()
                    .fold(0, |mask, cell| mask | cell_bit(cell))
            })
            .collect();
        houses.extend(houses[..9].to_vec());
        let masks = board.map(|digit| 1 << (digit - 1));
        assert!(valid(&board, &masks, &houses, &[0; CELLS]));
        let sites = allowed(&masks);
        assert_eq!(
            support(
                &sites,
                Some(Geometry {
                    houses: &houses,
                    peers: &[0; CELLS]
                }),
                4096
            ),
            sites
        );
        assert_eq!(support(&sites, None, 4096), [0; 9]);
    }
}
