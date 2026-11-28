//! Exact support for puzzles whose cage totals form one consecutive sequence.

use super::{VariantDefinitionError, cages::digit_sets, cell_mask};
use crate::{Board, CELLS, hints::digit_bit};

const SUM_COUNT: usize = 15;
const FIRST_SUM: u16 = 20;

#[derive(Clone, Debug)]
struct UnknownCage {
    cells: Vec<usize>,
    digit_sets_by_sum: Vec<Vec<u16>>,
}

#[derive(Clone, Debug)]
pub(super) struct CompiledUnknownCageSums {
    cages: Vec<UnknownCage>,
    consecutive_pairs: Vec<[usize; 2]>,
}

impl CompiledUnknownCageSums {
    pub fn compile(
        rule: usize,
        cages: &[Vec<usize>],
        consecutive_pairs: &[[usize; 2]],
        occupied: &mut u128,
    ) -> Result<Self, VariantDefinitionError> {
        let invalid = || VariantDefinitionError::InvalidRule(rule);
        if cages.len() != SUM_COUNT {
            return Err(invalid());
        }
        let mut compiled = Vec::with_capacity(cages.len());
        let mut rule_mask = 0u128;
        for cells in cages {
            if cells.is_empty() || cells.len() > 9 {
                return Err(invalid());
            }
            let mask = cell_mask(cells).ok_or_else(invalid)?;
            if rule_mask & mask != 0 || *occupied & mask != 0 {
                return Err(VariantDefinitionError::OverlappingCage(compiled.len()));
            }
            rule_mask |= mask;
            *occupied |= mask;
            compiled.push(UnknownCage {
                cells: cells.clone(),
                digit_sets_by_sum: (0..SUM_COUNT)
                    .map(|offset| digit_sets(cells.len(), FIRST_SUM + offset as u16).collect())
                    .collect(),
            });
        }
        if rule_mask.count_ones() as usize != CELLS {
            return Err(invalid());
        }
        let mut seen = Vec::new();
        for &[first, second] in consecutive_pairs {
            if first >= SUM_COUNT || second >= SUM_COUNT || first == second {
                return Err(invalid());
            }
            let pair = if first < second {
                [first, second]
            } else {
                [second, first]
            };
            if seen.contains(&pair) {
                return Err(invalid());
            }
            seen.push(pair);
        }
        Ok(Self {
            cages: compiled,
            consecutive_pairs: seen,
        })
    }

    /// Enforce cage-local distinct digits and the shared sequence of sums.
    pub fn restrict(&self, board: &Board, masks: &mut [u16; CELLS]) -> Result<bool, ()> {
        let mut cage_supports = Vec::with_capacity(self.cages.len());
        let mut sum_domains = [0; SUM_COUNT];
        for (cage_index, cage) in self.cages.iter().enumerate() {
            let len = cage.cells.len();
            let mut domains = [0; 9];
            for (slot, &cell) in domains[..len].iter_mut().zip(&cage.cells) {
                *slot = if board[cell] == 0 {
                    masks[cell]
                } else {
                    digit_bit(board[cell])
                };
            }
            let mut domain = 0u16;
            let supports_by_sum = distinct_support_by_sum(&domains[..len], &cage.digit_sets_by_sum);
            for offset in 0..SUM_COUNT {
                let support = supports_by_sum[offset];
                if support[..len].iter().all(|&digits| digits != 0) {
                    domain |= 1 << offset;
                }
            }
            if domain == 0 {
                return Err(());
            }
            cage_supports.push(supports_by_sum);
            sum_domains[cage_index] = domain;
        }

        let globally_supported =
            sequence_support(&sum_domains, &self.consecutive_pairs).ok_or(())?;
        let mut changed = false;
        for (cage_index, cage) in self.cages.iter().enumerate() {
            let mut support = [0; 9];
            for offset in 0..SUM_COUNT {
                if globally_supported[cage_index] & (1 << offset) == 0 {
                    continue;
                }
                for (cell_support, &digit_support) in
                    support.iter_mut().zip(&cage_supports[cage_index][offset])
                {
                    *cell_support |= digit_support;
                }
            }
            for (&cell, &digits) in cage.cells.iter().zip(&support) {
                if board[cell] == 0 {
                    let next = masks[cell] & digits;
                    if next == 0 {
                        return Err(());
                    }
                    changed |= next != masks[cell];
                    masks[cell] = next;
                }
            }
        }
        Ok(changed)
    }

    pub fn permits(&self, board: &Board) -> bool {
        self.restrict(board, &mut [0; CELLS]).is_ok()
    }
}

fn distinct_support_by_sum(domains: &[u16], sets_by_sum: &[Vec<u16>]) -> [[u16; 9]; SUM_COUNT] {
    let mut support_by_sum = [[0; 9]; SUM_COUNT];
    let mut memo = [None; 512];
    for (sum_support, sets) in support_by_sum.iter_mut().zip(sets_by_sum) {
        for &set in sets {
            let (possible, support) = distinct_set_support(set, domains, &mut memo);
            if possible {
                for (cell_support, digits) in sum_support.iter_mut().zip(support) {
                    *cell_support |= digits;
                }
            }
        }
    }
    support_by_sum
}

fn distinct_set_support(
    remaining: u16,
    domains: &[u16],
    memo: &mut [Option<(bool, [u16; 9])>; 512],
) -> (bool, [u16; 9]) {
    if remaining == 0 {
        return (true, [0; 9]);
    }
    if let Some(support) = memo[remaining as usize] {
        return support;
    }

    let cell = domains.len() - remaining.count_ones() as usize;
    let mut support = [0; 9];
    let mut possible = false;
    for digit in crate::hints::digits(domains[cell] & remaining) {
        let bit = digit_bit(digit);
        let (child_possible, child_support) = distinct_set_support(remaining ^ bit, domains, memo);
        if child_possible {
            possible = true;
            support[cell] |= bit;
            for (cell_support, digits) in support.iter_mut().zip(child_support) {
                *cell_support |= digits;
            }
        }
    }

    let result = (possible, support);
    memo[remaining as usize] = Some(result);
    result
}

fn sequence_support(domains: &[u16; SUM_COUNT], pairs: &[[usize; 2]]) -> Option<[u16; SUM_COUNT]> {
    let mut supported = [0; SUM_COUNT];
    for (cage, domain) in domains.iter().copied().enumerate() {
        for offset in 0..SUM_COUNT {
            let bit = 1u16 << offset;
            if domain & bit == 0 {
                continue;
            }
            let mut forced = *domains;
            forced[cage] = bit;
            if has_sequence_assignment(&mut forced, pairs) {
                supported[cage] |= bit;
            }
        }
        if supported[cage] == 0 {
            return None;
        }
    }
    Some(supported)
}

fn has_sequence_assignment(domains: &mut [u16; SUM_COUNT], pairs: &[[usize; 2]]) -> bool {
    loop {
        if domains.contains(&0) {
            return false;
        }
        let mut changed = false;
        for &[first, second] in pairs {
            let first_supported = adjacent_sum_support(domains[first], domains[second]);
            let second_supported = adjacent_sum_support(domains[second], domains[first]);
            if first_supported == 0 || second_supported == 0 {
                return false;
            }
            changed |= domains[first] != first_supported || domains[second] != second_supported;
            domains[first] = first_supported;
            domains[second] = second_supported;
        }
        for left in 0..domains.len() {
            if !domains[left].is_power_of_two() {
                continue;
            }
            for right in 0..domains.len() {
                if left == right {
                    continue;
                }
                let next = domains[right] & !domains[left];
                if next == 0 {
                    return false;
                }
                changed |= domains[right] != next;
                domains[right] = next;
            }
        }
        if !changed {
            break;
        }
    }

    let Some((branch, domain)) = domains
        .iter()
        .copied()
        .enumerate()
        .filter(|(_, domain)| !domain.is_power_of_two())
        .min_by_key(|(_, domain)| domain.count_ones())
    else {
        return true;
    };
    (0..SUM_COUNT).any(|offset| {
        let bit = 1u16 << offset;
        if domain & bit == 0 {
            return false;
        }
        let mut child = *domains;
        child[branch] = bit;
        has_sequence_assignment(&mut child, pairs)
    })
}

fn adjacent_sum_support(first: u16, other: u16) -> u16 {
    let mut support = 0;
    for offset in 0..SUM_COUNT {
        let bit = 1u16 << offset;
        if first & bit == 0 {
            continue;
        }
        if offset > 0 && other & (1 << (offset - 1)) != 0
            || offset + 1 < SUM_COUNT && other & (1 << (offset + 1)) != 0
        {
            support |= bit;
        }
    }
    support
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Analysis, PuzzleRule, VariantPuzzle};

    fn authored_cages() -> Vec<Vec<usize>> {
        vec![
            vec![0, 1, 2, 3, 9, 18, 27],
            vec![53, 62, 71, 77, 78, 79, 80],
            vec![38, 39, 40, 41, 42],
            vec![7, 16, 25, 34],
            vec![8, 17, 26, 35, 43, 44],
            vec![36, 37, 45, 54, 63, 72],
            vec![46, 55, 64, 73],
            vec![10, 11, 12, 19, 28],
            vec![52, 61, 68, 69, 70],
            vec![47, 48, 49, 50, 56, 65, 74],
            vec![6, 15, 24, 30, 31, 32, 33],
            vec![66, 67, 75, 76],
            vec![4, 5, 13, 14],
            vec![20, 21, 22, 23, 29],
            vec![51, 57, 58, 59, 60],
        ]
    }

    #[test]
    fn sequence_totals_are_all_distinct_and_cover_twenty_through_thirty_four() {
        let domains = [0x7fff; SUM_COUNT];
        let support = sequence_support(&domains, &[]).unwrap();
        assert!(support.iter().all(|&domain| domain == 0x7fff));
        let mut impossible = [0x7fff; SUM_COUNT];
        impossible[0] = 1;
        impossible[1] = 1;
        assert!(sequence_support(&impossible, &[]).is_none());
    }

    #[test]
    fn c_links_require_adjacent_cage_totals() {
        let mut domains = [0; SUM_COUNT];
        domains[0] = (1 << 2) | (1 << 5);
        domains[1] = (1 << 3) | (1 << 10);
        for domain in domains.iter_mut().skip(2) {
            *domain = 0x7fff;
        }
        let support = sequence_support(&domains, &[[0, 1]]).unwrap();
        assert_eq!(support[0], 1 << 2);
        assert_eq!(support[1], 1 << 3);
    }

    #[test]
    fn authored_cages_and_c_links_accept_the_published_completion() {
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.rules.push(PuzzleRule::UnknownCageSums {
            cages: authored_cages(),
            consecutive_pairs: vec![
                [2, 4],
                [2, 5],
                [3, 4],
                [3, 10],
                [5, 6],
                [7, 13],
                [8, 14],
                [11, 14],
                [12, 13],
            ],
        });
        let compiled = puzzle.compile().unwrap();
        let source =
            "513879462296154378748623591635291784127348659489567123851936247972415836364782915";
        let board = std::array::from_fn(|cell| source.as_bytes()[cell] - b'0');
        assert_eq!(
            compiled.analyze(&board, &[0; CELLS], 100).unwrap(),
            Analysis::Unique
        );

        let altered = board.map(|digit| digit % 9 + 1);
        assert_eq!(
            compiled.analyze(&altered, &[0; CELLS], 100).unwrap(),
            Analysis::Unsolvable
        );
    }

    #[test]
    fn compiled_unknown_cages_reuse_the_exact_distinct_digit_sets_per_total() {
        let mut occupied = 0;
        let compiled =
            CompiledUnknownCageSums::compile(0, &authored_cages(), &[], &mut occupied).unwrap();
        for cage in &compiled.cages {
            assert_eq!(cage.digit_sets_by_sum.len(), SUM_COUNT);
            for offset in 0..SUM_COUNT {
                assert_eq!(
                    cage.digit_sets_by_sum[offset],
                    digit_sets(cage.cells.len(), FIRST_SUM + offset as u16).collect::<Vec<_>>(),
                    "every cached total set matches the shared distinct-digit enumerator",
                );
            }
        }
    }

    #[test]
    fn shared_digit_set_memo_matches_independent_support_for_every_total() {
        let mut occupied = 0;
        let compiled =
            CompiledUnknownCageSums::compile(0, &authored_cages(), &[], &mut occupied).unwrap();
        for cage in &compiled.cages {
            let len = cage.cells.len();
            for offset in 0..5 {
                let domains: Vec<_> = cage.cells[..len]
                    .iter()
                    .map(|&cell| {
                        let first = (cell + offset) % 9;
                        let second = (cell * 3 + offset + 2) % 9;
                        let third = (cell * 7 + offset + 5) % 9;
                        (1 << first) | (1 << second) | (1 << third)
                    })
                    .collect();
                let shared = distinct_support_by_sum(&domains, &cage.digit_sets_by_sum);
                for sum in 0..SUM_COUNT {
                    assert_eq!(
                        shared[sum],
                        super::super::cages::distinct_support(
                            &domains,
                            cage.digit_sets_by_sum[sum].iter().copied(),
                        ),
                        "shared support matches independent calculation for cage and total",
                    );
                }
            }
        }
    }
}
