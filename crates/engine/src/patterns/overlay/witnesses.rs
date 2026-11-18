//! Completions of the overlay's masks and equal-digit geometry, not variant solutions.

use super::super::completions::{Domains, complete};
use super::{Geometry, cell_bit, cells};
use crate::{Board, CELLS, DIGITS, Units, variant::SquareTransform};

const NODES_PER_PROBE: u32 = 128;
// Each nonidentity grid mapping tries at most nine digit cycles. This budget
// limits transform work independently of the existing exact-search nodes.
const SPATIAL_TRANSFORMS: u8 = 64;

pub(super) fn support(
    allowed: &[u128; 9],
    geometry: Option<Geometry<'_>>,
    nodes: u32,
) -> [u128; 9] {
    // Every nine-cell house requires distinct digits even if its redundant
    // equal-digit pairs were not included in the supplied peer table.
    let peers = geometry.map(geometry_peers);
    let mut search = Coverage::new(allowed, nodes);
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
                search.record(&board, peers.as_ref());
            }
        }
    }
    search.supported
}

fn geometry_peers(geometry: Geometry<'_>) -> [u128; CELLS] {
    let mut peers = *geometry.peers;
    for &house in geometry.houses {
        for cell in cells(house) {
            peers[cell] |= house & !cell_bit(cell);
        }
    }
    peers
}

struct Coverage<'a> {
    allowed: &'a [u128; 9],
    masks: [u16; CELLS],
    supported: [u128; 9],
    free: Vec<u8>,
    remaining: u32,
    remaining_transforms: u8,
}

impl<'a> Coverage<'a> {
    fn new(allowed: &'a [u128; 9], nodes: u32) -> Self {
        let masks: [u16; CELLS] = std::array::from_fn(|cell| {
            allowed.iter().enumerate().fold(0, |mask, (digit, sites)| {
                mask | if sites & cell_bit(cell) != 0 {
                    1 << digit
                } else {
                    0
                }
            })
        });
        let fixed = masks
            .iter()
            .filter(|mask| mask.is_power_of_two())
            .fold(0, |fixed, mask| fixed | mask);
        Self {
            allowed,
            masks,
            supported: [0; 9],
            remaining: nodes,
            remaining_transforms: SPATIAL_TRANSFORMS,
            free: (1..=9)
                .filter(|digit| fixed & (1 << (digit - 1)) == 0)
                .collect(),
        }
    }

    fn record(&mut self, board: &Board, peers: Option<&[u128; CELLS]>) {
        self.record_renamings(board);
        for transform in SquareTransform::ALL.into_iter().skip(1) {
            if self.supported == *self.allowed || self.remaining_transforms == 0 {
                break;
            }
            self.remaining_transforms -= 1;
            if let Some(candidate) = self.transformed_candidate(board, transform, peers) {
                self.record_renamings(&candidate);
            }
        }
    }

    fn record_renamings(&mut self, board: &Board) {
        // Digit permutations preserve all overlay houses and equal-digit
        // exclusions. Retain a permutation only if every supplied mask allows it.
        for shift in 0..self.free.len().max(1) {
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

    // Fixed domains and geometry are checked here. Every digit-cycled result
    // must still pass all masks in record_renamings before becoming support.
    fn transformed_candidate(
        &self,
        board: &Board,
        transform: SquareTransform,
        peers: Option<&[u128; CELLS]>,
    ) -> Option<Board> {
        let changed = transform.grid(*board);
        let rename = self.fixed_renaming(&changed)?;
        if let Some(peers) = peers {
            let mut placed = [0u128; 9];
            for (cell, &digit) in changed.iter().enumerate() {
                placed[usize::from(digit - 1)] |= cell_bit(cell);
            }
            // Include every directed exclusion, even if a supplied peer table
            // omits its reverse. Houses were already added to this table.
            if changed
                .iter()
                .enumerate()
                .any(|(cell, &digit)| peers[cell] & placed[usize::from(digit - 1)] != 0)
            {
                return None;
            }
        }
        Some(changed.map(|digit| rename[usize::from(digit)]))
    }

    fn fixed_renaming(&self, board: &Board) -> Option<[u8; 10]> {
        let mut rename = [0; 10];
        let mut used = 0u16;
        for (&digit, mask) in board.iter().zip(self.masks) {
            if !mask.is_power_of_two() {
                continue;
            }
            let from = usize::from(digit);
            let to = mask.trailing_zeros() as u8 + 1;
            if rename[from] != 0 && rename[from] != to || rename[from] == 0 && used & mask != 0 {
                return None;
            }
            rename[from] = to;
            used |= mask;
        }
        let mut unused = DIGITS & !used;
        for value in rename.iter_mut().skip(1) {
            if *value == 0 {
                let bit = unused & unused.wrapping_neg();
                unused ^= bit;
                *value = bit.trailing_zeros() as u8 + 1;
            }
        }
        Some(rename)
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
            && (0..CELLS)
                .all(|a| (0..CELLS).all(|b| peers[a] & cell_bit(b) == 0 || board[a] != board[b]))
    }

    #[test]
    fn fixed_domains_reject_both_kinds_of_nonbijective_digit_mapping() {
        let board = crate::parse_givens(X_SOLUTION).unwrap();
        for transform in SquareTransform::ALL.into_iter().skip(1) {
            let changed = transform.grid(board);
            for same_before in [false, true] {
                let (a, b) = (0..CELLS)
                    .flat_map(|a| (a + 1..CELLS).map(move |b| (a, b)))
                    .find(|&(a, b)| {
                        (board[a] == board[b]) == same_before
                            && (changed[a] == changed[b]) != same_before
                    })
                    .expect("the asymmetric grid exposes each mapping conflict");
                let mut masks = [DIGITS; CELLS];
                for cell in [a, b] {
                    masks[cell] = 1 << (board[cell] - 1);
                }
                assert!(valid(&board, &masks, &houses(), &super::super::PEERS));
                let allowed = allowed(&masks);
                let coverage = Coverage::new(&allowed, 0);
                assert!(
                    coverage
                        .transformed_candidate(&board, transform, None)
                        .is_none()
                );
            }
        }
    }

    #[test]
    fn transformed_grids_obey_extra_houses_and_directed_peer_exclusions() {
        let board = crate::parse_givens(X_SOLUTION).unwrap();
        let allowed = [ALL; 9];
        let coverage = Coverage::new(&allowed, 0);
        for transform in SquareTransform::ALL.into_iter().skip(1) {
            let changed = transform.grid(board);
            let (a, b) = (0..CELLS)
                .flat_map(|a| (a + 1..CELLS).map(move |b| (a, b)))
                .find(|&(a, b)| board[a] != board[b] && changed[a] == changed[b])
                .unwrap();
            let mut peers = super::super::PEERS;
            peers[b] |= cell_bit(a); // Deliberately omit the reverse exclusion.
            assert!(valid(&board, &[DIGITS; CELLS], &houses(), &peers));
            assert!(!valid(&changed, &[DIGITS; CELLS], &houses(), &peers));
            assert!(
                coverage
                    .transformed_candidate(&board, transform, Some(&peers))
                    .is_none()
            );

            let mut extra = cell_bit(a) | cell_bit(b);
            for digit in 1..=9 {
                if digit != board[a] && digit != board[b] {
                    extra |= cell_bit(board.iter().position(|&value| value == digit).unwrap());
                }
            }
            let mut houses = houses();
            houses.push(extra);
            let peers = geometry_peers(Geometry {
                houses: &houses,
                peers: &super::super::PEERS,
            });
            assert!(valid(&board, &[DIGITS; CELLS], &houses, &peers));
            assert!(!valid(&changed, &[DIGITS; CELLS], &houses, &peers));
            assert!(
                coverage
                    .transformed_candidate(&board, transform, Some(&peers))
                    .is_none()
            );
        }
    }

    #[test]
    fn fixed_jigsaw_regions_reject_unsafe_grid_symmetries() {
        let board = crate::parse_givens(X_SOLUTION).unwrap();
        let mut labels = std::array::from_fn::<_, CELLS, _>(|cell| cell / 27 * 3 + cell % 9 / 3);
        // Equal digits cross the boundary. Both irregular regions stay connected.
        assert_eq!(board[2], board[21]);
        labels.swap(2, 21);
        let regions: Vec<Vec<usize>> = (0..9)
            .map(|region| (0..CELLS).filter(|&cell| labels[cell] == region).collect())
            .collect();
        crate::VariantPuzzle::jigsaw(board, regions.clone())
            .compile()
            .unwrap();
        let mut houses = houses()[..18].to_vec();
        houses.extend(
            regions
                .iter()
                .map(|region| region.iter().fold(0, |mask, &cell| mask | cell_bit(cell))),
        );
        let peers = geometry_peers(Geometry {
            houses: &houses,
            peers: &[0; CELLS],
        });
        assert!(valid(&board, &[DIGITS; CELLS], &houses, &peers));
        let allowed = [ALL; 9];
        let coverage = Coverage::new(&allowed, 0);
        let mut rejected = 0;
        for transform in SquareTransform::ALL {
            let changed = transform.grid(board);
            let expected = valid(&changed, &[DIGITS; CELLS], &houses, &peers);
            let candidate = coverage.transformed_candidate(&board, transform, Some(&peers));
            assert_eq!(candidate.is_some(), expected);
            if let Some(candidate) = candidate {
                assert!(valid(&candidate, &[DIGITS; CELLS], &houses, &peers));
            } else {
                rejected += 1;
            }
        }
        assert!(rejected > 0);
    }

    #[test]
    fn exhausted_transform_budget_retains_seed_support_and_exact_search_budget() {
        let board = crate::parse_givens(X_SOLUTION).unwrap();
        let mut masks = [DIGITS; CELLS];
        masks[0] = 1 << (board[0] - 1);
        let allowed = allowed(&masks);
        let mut coverage = Coverage::new(&allowed, 123);
        coverage.remaining_transforms = 0;
        coverage.record(&board, None);
        let expected = coverage.supported;
        assert!(expected.iter().map(|sites| sites.count_ones()).sum::<u32>() > CELLS as u32);
        for (cell, &digit) in board.iter().enumerate() {
            assert_ne!(expected[usize::from(digit - 1)] & cell_bit(cell), 0);
        }
        coverage.record(&board, None);
        assert_eq!(coverage.supported, expected);
        assert_eq!(coverage.remaining, 123);
        assert_eq!(coverage.remaining_transforms, 0);
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
        let allowed = allowed(&masks);
        let mut coverage = Coverage::new(&allowed, 0);
        coverage.record(&board, None);
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
