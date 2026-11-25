use std::ops::Range;

use super::super::MAX_SIZE;
use crate::variant::digit_set_support;

type Domains = [u16; MAX_SIZE];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) struct EndClue {
    pub(super) total: u16,
    pub(super) crossed: Option<u8>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(super) struct Edges {
    pub(super) internal: u16,
    pub(super) boundary: u16,
}

impl Edges {
    pub(super) fn open(size: usize) -> Self {
        let all = first_bits(size - 1);
        Self {
            internal: all,
            boundary: all,
        }
    }
}

fn first_bits(length: usize) -> u16 {
    ((1u32 << length) - 1) as u16
}

/// All distinct digit sets indexed by length and sum, including the empty set.
#[derive(Debug)]
pub(super) struct DigitSets {
    size: usize,
    total: u16,
    full: u16,
    sets: Vec<Vec<u16>>,
}

impl DigitSets {
    pub(super) fn new(size: usize) -> Self {
        let total = (size * (size + 1) / 2) as u16;
        let full = first_bits(size);
        let mut sets = vec![Vec::new(); (size + 1) * (usize::from(total) + 1)];
        for set in 0..=full {
            let sum: usize = crate::hints::digits(set).map(usize::from).sum();
            let length = set.count_ones() as usize;
            sets[length * (usize::from(total) + 1) + sum].push(set);
        }
        Self {
            size,
            total,
            full,
            sets,
        }
    }

    fn at(&self, length: usize, total: u16) -> &[u16] {
        &self.sets[length * (usize::from(self.total) + 1) + usize::from(total)]
    }
}

#[derive(Debug)]
struct EdgeCounts {
    target: u16,
    groups: [u16; 3],
    crossed: [Option<u8>; 2],
}

impl EdgeCounts {
    fn new(size: usize, left: Option<(usize, EndClue)>, right: Option<(usize, EndClue)>) -> Self {
        let target = left
            .filter(|&(length, _)| length < size)
            .map_or(0, |(length, _)| 1 << (length - 1))
            | right
                .filter(|&(length, _)| length < size)
                .map_or(0, |(length, _)| 1 << (size - length - 1));
        let left_group = left
            .filter(|(_, clue)| clue.crossed.is_some())
            .map_or(0, |(length, _)| first_bits(length - 1));
        let right_group = right
            .filter(|(_, clue)| clue.crossed.is_some())
            .map_or(0, |(length, _)| first_bits(length - 1) << (size - length));
        Self {
            target,
            groups: [
                left_group & !right_group,
                right_group & !left_group,
                left_group & right_group,
            ],
            crossed: [
                left.and_then(|(_, clue)| clue.crossed),
                right.and_then(|(_, clue)| clue.crossed),
            ],
        }
    }

    fn permits(&self, edges: Edges) -> bool {
        let range = |group: u16| -> (i8, i8) {
            (
                (group & !edges.internal).count_ones() as i8,
                (group & edges.boundary).count_ones() as i8,
            )
        };
        let (mut minimum, mut maximum) = range(self.groups[2]);
        for (group, crossed) in self.groups[..2].iter().zip(self.crossed) {
            if let Some(count) = crossed {
                let (lo, hi) = range(*group);
                minimum = minimum.max(count as i8 - hi);
                maximum = maximum.min(count as i8 - lo);
            }
        }
        minimum <= maximum
    }

    fn support(&self, domains: Edges) -> Option<Edges> {
        if self.target & !domains.boundary != 0 {
            return None;
        }
        let edges = Edges {
            internal: domains.internal & !self.target,
            boundary: domains.boundary,
        };
        if !self.permits(edges) {
            return None;
        }
        let groups = self.groups[0] | self.groups[1] | self.groups[2];
        let mut free = edges.internal & edges.boundary & groups;
        let mut supported = edges;
        while free != 0 {
            let bit = free & free.wrapping_neg();
            free ^= bit;
            if !self.permits(Edges {
                internal: edges.internal ^ bit,
                ..edges
            }) {
                supported.boundary ^= bit;
            }
            if !self.permits(Edges {
                boundary: edges.boundary ^ bit,
                ..edges
            }) {
                supported.internal ^= bit;
            }
        }
        Some(supported)
    }
}

#[derive(Debug)]
struct Case {
    ranges: [Range<usize>; 3],
    totals: [u16; 3],
    order: [usize; 3],
    boundaries: EdgeCounts,
}

impl Case {
    fn new(
        sets: &DigitSets,
        left: Option<(usize, EndClue)>,
        right: Option<(usize, EndClue)>,
    ) -> Option<Self> {
        let size = sets.size;
        let total = sets.total;
        let (ends, totals) = match (left, right) {
            (Some((front, a)), Some((back, b))) if front <= size - back => (
                [front, size - back, size],
                [a.total, total.checked_sub(a.total + b.total)?, b.total],
            ),
            (Some((front, a)), Some((back, b))) => (
                [size - back, front, size],
                [
                    total.checked_sub(b.total)?,
                    (a.total + b.total).checked_sub(total)?,
                    total.checked_sub(a.total)?,
                ],
            ),
            (Some((front, clue)), None) => (
                [front, size, size],
                [clue.total, total.checked_sub(clue.total)?, 0],
            ),
            (None, Some((back, clue))) => (
                [size - back, size, size],
                [total.checked_sub(clue.total)?, clue.total, 0],
            ),
            (None, None) => return None,
        };
        let ranges = [0..ends[0], ends[0]..ends[1], ends[1]..ends[2]];
        let count = |index: usize| sets.at(ranges[index].len(), totals[index]).len();
        let mut order = [0, 1, 2];
        if order.iter().any(|&group| count(group) == 0) {
            return None;
        }
        order.sort_by_key(|&group| count(group));
        Some(Self {
            ranges,
            totals,
            order,
            boundaries: EdgeCounts::new(size, left, right),
        })
    }

    fn digit_support(&self, sets: &DigitSets, domains: &[u16], support: &mut [u16]) -> bool {
        let [a, b, c] = self.order;
        let choices = |index: usize| sets.at(self.ranges[index].len(), self.totals[index]);
        let mut possible = false;
        for &first in choices(a) {
            for &second in choices(b) {
                if first & second != 0 {
                    continue;
                }
                // With a full house, both the size and total of the last
                // group follow from the other two.
                let mut local = [0; MAX_SIZE];
                let assigned = [(a, first), (b, second), (c, sets.full ^ (first | second))];
                if !assigned.into_iter().all(|(group, set)| {
                    let range = self.ranges[group].clone();
                    digit_set_support(set, &domains[range.clone()], &mut local[range])
                }) {
                    continue;
                }
                possible = true;
                for (mask, allowed) in support.iter_mut().zip(local) {
                    *mask |= allowed;
                }
                if support == domains {
                    return true;
                }
            }
        }
        possible
    }
}

#[derive(Debug)]
pub(super) struct CrustLine {
    cases: Vec<Case>,
    unconstrained: bool,
}

impl CrustLine {
    pub(super) fn compile(sets: &DigitSets, ends: [Option<EndClue>; 2]) -> Self {
        let lengths_for = |clue: Option<EndClue>| -> Vec<Option<(usize, EndClue)>> {
            let Some(clue) = clue else { return vec![None] };
            if clue.total == 0 || clue.total > sets.total {
                return Vec::new();
            }
            let minimum_length = clue.crossed.map_or(1, |count| usize::from(count) + 1);
            (minimum_length..=sets.size)
                .filter(|&length| !sets.at(length, clue.total).is_empty())
                .map(|length| Some((length, clue)))
                .collect()
        };
        let [front, back] = ends.map(lengths_for);
        let mut cases = Vec::new();
        for left in front {
            for &right in &back {
                if let Some(case) = Case::new(sets, left, right) {
                    cases.push(case);
                }
            }
        }
        Self {
            cases,
            unconstrained: ends == [None, None],
        }
    }

    pub(super) fn support(
        &self,
        sets: &DigitSets,
        digits: &[u16],
        edges: Edges,
    ) -> Option<(Domains, Edges)> {
        let valid_edges = first_bits(sets.size - 1);
        if (edges.internal | edges.boundary) != valid_edges {
            return None;
        }
        let mut support = [0; MAX_SIZE];
        if self.unconstrained {
            return digit_set_support(sets.full, digits, &mut support).then_some((support, edges));
        }
        let mut boundary_support = Edges::default();
        for case in &self.cases {
            if let Some(feasible_edges) = case.boundaries.support(edges) {
                if case.digit_support(sets, digits, &mut support[..sets.size]) {
                    boundary_support.internal |= feasible_edges.internal;
                    boundary_support.boundary |= feasible_edges.boundary;
                }
            }
            if boundary_support == edges && support[..sets.size] == *digits {
                break;
            }
        }
        (!support[..sets.size].contains(&0)).then_some((support, boundary_support))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn oracle(ranks: &[usize], edges: u16, clue: EndClue, reverse: bool) -> bool {
        let size = ranks.len();
        (1..=size).any(|length| {
            let (start, end) = if reverse {
                (size - length, size)
            } else {
                (0, length)
            };
            if ranks[start..end].iter().sum::<usize>() != usize::from(clue.total) {
                return false;
            }
            let target_boundary = if reverse {
                start.checked_sub(1)
            } else {
                (end < size).then_some(end - 1)
            };
            let target = target_boundary.is_none_or(|edge| edges & (1 << edge) != 0);
            let mut crossed = 0;
            for edge in start..end - 1 {
                if edges & (1 << edge) != 0 {
                    crossed += 1;
                }
            }
            target && clue.crossed.is_none_or(|count| count == crossed)
        })
    }

    #[test]
    fn support_matches_enumeration_of_digits_and_edges_for_overlapping_and_disjoint_clues() {
        const SIZE: usize = 5;
        let sets = DigitSets::new(SIZE);
        let full = first_bits(SIZE - 1);
        for left in [4, 7, 8, 11, 13, 15] {
            for right in [3, 6, 9, 11, 12, 15] {
                for crossed in [
                    [None, Some(0)],
                    [Some(1), Some(2)],
                    [Some(0), Some(1)],
                    [Some(1), None],
                ] {
                    let clues = [
                        EndClue {
                            total: left,
                            crossed: crossed[0],
                        },
                        EndClue {
                            total: right,
                            crossed: crossed[1],
                        },
                    ];
                    let line = CrustLine::compile(&sets, clues.map(Some));
                    for digits in [[31; SIZE], [27, 25, 30, 31, 13]] {
                        let edges = Edges {
                            internal: 0b1011,
                            boundary: 0b1110,
                        };
                        let mut expected = [0u16; MAX_SIZE];
                        let mut expected_edges = Edges::default();
                        for code in 0..SIZE.pow(SIZE as u32) {
                            let mut code = code;
                            let ranks: [usize; SIZE] = std::array::from_fn(|_| {
                                let rank = code % SIZE + 1;
                                code /= SIZE;
                                rank
                            });
                            let masks = ranks.map(|rank| 1u16 << (rank - 1));
                            if masks.iter().fold(0, |used, mask| used | mask) != sets.full
                                || masks
                                    .iter()
                                    .zip(digits)
                                    .any(|(&value, allowed)| value & allowed == 0)
                            {
                                continue;
                            }
                            for boundaries in 0..=full {
                                if (boundaries & !edges.boundary) != 0
                                    || ((full ^ boundaries) & !edges.internal) != 0
                                    || !oracle(&ranks, boundaries, clues[0], false)
                                    || !oracle(&ranks, boundaries, clues[1], true)
                                {
                                    continue;
                                }
                                for (seen, mask) in expected.iter_mut().zip(masks) {
                                    *seen |= mask;
                                }
                                expected_edges.internal |= full ^ boundaries;
                                expected_edges.boundary |= boundaries;
                            }
                        }
                        let wanted = (expected[0] != 0).then_some((expected, expected_edges));
                        assert_eq!(
                            line.support(&sets, &digits, edges),
                            wanted,
                            "{clues:?}, {digits:?}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn wide_opposed_totals_use_the_same_digit_and_edge_encoding() {
        let sets = DigitSets::new(16);
        let starts = [
            Some(EndClue {
                total: 6,
                crossed: Some(0),
            }),
            Some(EndClue {
                total: 45,
                crossed: Some(1),
            }),
        ];
        let line = CrustLine::compile(&sets, starts);
        let domains: [u16; MAX_SIZE] = std::array::from_fn(|index| 1u16 << index);
        let (support, edges) = line.support(&sets, &domains, Edges::open(16)).unwrap();
        assert_eq!(support, domains);
        assert_eq!(edges.internal & 0b111, 0b011);
        assert_eq!(edges.boundary & 0b111, 0b100);
        assert_eq!(edges.internal & (1 << 12), 0);
        assert_ne!(edges.boundary & (1 << 12), 0);
    }
}
