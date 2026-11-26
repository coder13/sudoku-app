use std::sync::OnceLock;

use super::{MAX_SIZE, SizedGrid, SizedSumEnd, XSumDotRelation};
use crate::{ClueDirection, variant::digit_set_support};

const MAX_SUM: usize = MAX_SIZE * (MAX_SIZE + 1) / 2;

#[derive(Debug)]
pub(super) struct XSum {
    cells: Vec<usize>,
    size: usize,
    sum: usize,
    direction: ClueDirection,
    value_offset: u8,
}

#[derive(Clone, Debug)]
pub(super) struct XSumOutcome {
    pub(super) total: usize,
    pub(super) support: [u16; MAX_SIZE],
}

impl XSum {
    pub(super) fn cells(&self) -> impl Iterator<Item = usize> + '_ {
        self.cells.iter().copied()
    }

    pub(super) fn compile(
        size: usize,
        direction: ClueDirection,
        cells: &[usize],
        sum: u16,
        value_offset: u8,
    ) -> Option<Self> {
        if cells.len() != size || cells.iter().any(|&cell| cell >= size * size) {
            return None;
        }
        let first = *cells.first()?;
        let (row, column) = (first / size, first % size);
        let valid = match direction {
            ClueDirection::North => {
                row == size - 1
                    && cells
                        .iter()
                        .enumerate()
                        .all(|(i, &cell)| cell == first - i * size)
            }
            ClueDirection::East => {
                column == 0 && cells.iter().enumerate().all(|(i, &cell)| cell == first + i)
            }
            ClueDirection::South => {
                row == 0
                    && cells
                        .iter()
                        .enumerate()
                        .all(|(i, &cell)| cell == first + i * size)
            }
            ClueDirection::West => {
                column == size - 1 && cells.iter().enumerate().all(|(i, &cell)| cell == first - i)
            }
            _ => false,
        };
        let sum = usize::from(sum);
        let minimum_sum = 1 - usize::from(value_offset);
        let maximum_sum = size * (size + 1 - 2 * usize::from(value_offset)) / 2;
        if !valid || sum < minimum_sum || sum > maximum_sum {
            return None;
        }
        Some(Self {
            cells: cells.to_vec(),
            size,
            sum,
            direction,
            value_offset,
        })
    }

    pub(super) fn support(
        &self,
        domains: &[u16],
        supported: &mut [u16; MAX_SIZE * MAX_SIZE],
    ) -> bool {
        for outcome in self.outcomes_for(domains, Some(self.sum)) {
            for (offset, &cell) in self.cells.iter().enumerate() {
                supported[cell] |= outcome.support[offset];
            }
        }
        self.cells.iter().all(|&cell| supported[cell] != 0)
    }

    pub(super) fn outcomes(&self, domains: &[u16]) -> Vec<XSumOutcome> {
        self.outcomes_for(domains, None)
    }

    fn outcomes_for(&self, domains: &[u16], only_total: Option<usize>) -> Vec<XSumOutcome> {
        let all = u16::MAX >> (u16::BITS as usize - self.size);
        let maximum_displayed_total =
            self.size * (self.size + 1 - 2 * usize::from(self.value_offset)) / 2;
        let maximum_internal_sum = self.size * (self.size + 1) / 2;
        let first_digit_stride = self.size + 1;
        let total_slots = only_total
            .map(|_| first_digit_stride)
            .unwrap_or((maximum_displayed_total + 1) * first_digit_stride);
        // Keep each first digit separate: a dot may relate the derived sum to
        // that digit, so supports for different prefix lengths cannot merge.
        let mut totals = vec![None::<[u16; MAX_SIZE]>; total_slots];
        for length in
            (1 - usize::from(self.value_offset))..=self.size - usize::from(self.value_offset)
        {
            let first_rank = length + usize::from(self.value_offset);
            let first = 1u16 << (first_rank - 1);
            if domains[self.cells[0]] & first == 0 {
                continue;
            }
            if length == 0 {
                if only_total.is_some_and(|target| target != 0) {
                    continue;
                }
                let mut suffix_domains = [0; MAX_SIZE];
                for (domain, &cell) in suffix_domains.iter_mut().zip(&self.cells[1..]) {
                    *domain = domains[cell];
                }
                let mut suffix_support = [0; MAX_SIZE];
                if !assignment_support(
                    all ^ first,
                    &suffix_domains[..self.size - 1],
                    &mut suffix_support[..self.size - 1],
                ) {
                    continue;
                }
                let support = totals[0].get_or_insert([0; MAX_SIZE]);
                support[0] |= first;
                for (offset, mask) in suffix_support[..self.size - 1].iter().enumerate() {
                    support[offset + 1] |= mask;
                }
                continue;
            }
            let mut prefix_domains = [0; MAX_SIZE];
            let mut suffix_domains = [0; MAX_SIZE];
            for (domain, &cell) in prefix_domains.iter_mut().zip(&self.cells[1..length]) {
                *domain = domains[cell];
            }
            for (domain, &cell) in suffix_domains.iter_mut().zip(&self.cells[length..]) {
                *domain = domains[cell];
            }
            let subsets = &subsets_by_size_sum()[length];
            let (first_sum, last_sum) = only_total
                .map(|target| {
                    let internal_total = target + length * usize::from(self.value_offset);
                    (internal_total, internal_total)
                })
                .unwrap_or((length * (length + 1) / 2, maximum_internal_sum));
            if first_sum < length * (length + 1) / 2 || last_sum > maximum_internal_sum {
                continue;
            }
            for sum in first_sum..=last_sum {
                let Some(prefixes) = subsets.get(sum) else {
                    continue;
                };
                for &prefix_digits in prefixes {
                    if prefix_digits & first == 0 {
                        continue;
                    }
                    let mut prefix_support = [0; MAX_SIZE];
                    let mut suffix_support = [0; MAX_SIZE];
                    if !assignment_support(
                        prefix_digits ^ first,
                        &prefix_domains[..length - 1],
                        &mut prefix_support[..length - 1],
                    ) || !assignment_support(
                        all ^ prefix_digits,
                        &suffix_domains[..self.size - length],
                        &mut suffix_support[..self.size - length],
                    ) {
                        continue;
                    }
                    let displayed_total = sum - length * usize::from(self.value_offset);
                    let slot = if only_total.is_some() {
                        length
                    } else {
                        displayed_total * first_digit_stride + length
                    };
                    let support = totals[slot].get_or_insert([0; MAX_SIZE]);
                    support[0] |= first;
                    for (offset, mask) in prefix_support[..length - 1].iter().enumerate() {
                        support[offset + 1] |= mask;
                    }
                    for (offset, mask) in suffix_support[..self.size - length].iter().enumerate() {
                        support[length + offset] |= mask;
                    }
                }
            }
        }
        totals
            .into_iter()
            .enumerate()
            .filter_map(|(index, support)| {
                support.map(|support| XSumOutcome {
                    total: only_total.unwrap_or(index / first_digit_stride),
                    support,
                })
            })
            .collect()
    }

    pub(super) fn permits(&self, digits: &[u8]) -> bool {
        let full = u16::MAX >> (u16::BITS as usize - self.size);
        let mut domains = [full; MAX_SIZE * MAX_SIZE];
        for &cell in &self.cells {
            if digits[cell] != 0 {
                domains[cell] = 1 << (digits[cell] - 1);
            }
        }
        self.support(&domains, &mut [0; MAX_SIZE * MAX_SIZE])
    }
}

#[derive(Debug)]
enum DotEnd {
    Digit(usize),
    XSum(XSum),
}

impl DotEnd {
    fn compile(layout: &SizedGrid, end: SizedSumEnd, value_offset: u8) -> Option<Self> {
        let size = layout.size();
        match end {
            SizedSumEnd::Digit(cell) if cell < layout.cell_count() => Some(Self::Digit(cell)),
            SizedSumEnd::XSum { direction, index } if index < size => {
                let cells: Vec<_> = (0..size)
                    .map(|offset| match direction {
                        ClueDirection::North => (size - 1 - offset) * size + index,
                        ClueDirection::South => offset * size + index,
                        ClueDirection::East => index * size + offset,
                        ClueDirection::West => index * size + size - 1 - offset,
                        _ => usize::MAX,
                    })
                    .collect();
                if cells.contains(&usize::MAX) {
                    return None;
                }
                Some(Self::XSum(XSum::compile(
                    size,
                    direction,
                    &cells,
                    1,
                    value_offset,
                )?))
            }
            _ => None,
        }
    }

    fn cells(&self) -> Vec<usize> {
        match self {
            Self::Digit(cell) => vec![*cell],
            Self::XSum(x_sum) => x_sum.cells().collect(),
        }
    }

    fn outcomes(&self, domains: &[u16], size: usize, value_offset: u8) -> Vec<XSumOutcome> {
        match self {
            Self::Digit(cell) => (1..=size)
                .filter(|digit| domains[*cell] & (1 << (digit - 1)) != 0)
                .map(|digit| {
                    let mut support = [0; MAX_SIZE];
                    support[0] = 1 << (digit - 1);
                    XSumOutcome {
                        total: digit - usize::from(value_offset),
                        support,
                    }
                })
                .collect(),
            Self::XSum(x_sum) => x_sum.outcomes(domains),
        }
    }
}

#[derive(Debug)]
pub(super) struct XSumDot {
    ends: [DotEnd; 2],
    relation: XSumDotRelation,
    cells: Vec<usize>,
    size: usize,
    value_offset: u8,
}

impl XSumDot {
    pub(super) fn compile(
        layout: &SizedGrid,
        ends: [SizedSumEnd; 2],
        relation: XSumDotRelation,
        value_offset: u8,
    ) -> Option<Self> {
        if ends[0] == ends[1] || ends.iter().all(|end| matches!(end, SizedSumEnd::Digit(_))) {
            return None;
        }
        let compiled = [
            DotEnd::compile(layout, ends[0], value_offset)?,
            DotEnd::compile(layout, ends[1], value_offset)?,
        ];
        let cells_a = compiled[0].cells();
        let cells_b = compiled[1].cells();
        let overlap: Vec<_> = cells_a
            .iter()
            .filter(|cell| cells_b.contains(cell))
            .copied()
            .collect();
        if overlap.len() > 1 {
            return None;
        }
        match (&compiled[0], &compiled[1]) {
            (DotEnd::XSum(a), DotEnd::XSum(b)) => {
                let vertical_a = matches!(a.direction, ClueDirection::North | ClueDirection::South);
                let vertical_b = matches!(b.direction, ClueDirection::North | ClueDirection::South);
                if vertical_a != vertical_b || !overlap.is_empty() {
                    return None;
                }
            }
            (DotEnd::XSum(x_sum), DotEnd::Digit(cell))
            | (DotEnd::Digit(cell), DotEnd::XSum(x_sum)) => {
                if x_sum.cells[0] != *cell {
                    return None;
                }
            }
            _ => return None,
        }
        let mut cells = cells_a;
        cells.extend(cells_b);
        cells.sort_unstable();
        cells.dedup();
        Some(Self {
            ends: compiled,
            relation,
            cells,
            size: layout.size(),
            value_offset,
        })
    }

    pub(super) fn cells(&self) -> impl Iterator<Item = usize> + '_ {
        self.cells.iter().copied()
    }

    pub(super) fn support(
        &self,
        domains: &[u16],
        supported: &mut [u16; MAX_SIZE * MAX_SIZE],
    ) -> bool {
        let left_cells = self.ends[0].cells();
        let right_cells = self.ends[1].cells();
        let left = self.ends[0].outcomes(domains, self.size, self.value_offset);
        let right = self.ends[1].outcomes(domains, self.size, self.value_offset);
        for a in &left {
            for b in &right {
                if !relation_matches(a.total, b.total, self.relation) {
                    continue;
                }
                let mut overlap_support = None;
                let mut compatible = true;
                for (left_index, &cell) in left_cells.iter().enumerate() {
                    if let Some(right_index) = right_cells.iter().position(|&other| other == cell) {
                        let mask = a.support[left_index] & b.support[right_index];
                        if mask == 0 {
                            compatible = false;
                            break;
                        }
                        overlap_support = Some((cell, mask));
                    }
                }
                if !compatible {
                    continue;
                }
                for (index, &cell) in left_cells.iter().enumerate() {
                    supported[cell] |= match overlap_support {
                        Some((shared, mask)) if shared == cell => mask,
                        _ => a.support[index],
                    };
                }
                for (index, &cell) in right_cells.iter().enumerate() {
                    supported[cell] |= match overlap_support {
                        Some((shared, mask)) if shared == cell => mask,
                        _ => b.support[index],
                    };
                }
            }
        }
        self.cells.iter().all(|&cell| supported[cell] != 0)
    }

    pub(super) fn permits(&self, digits: &[u8]) -> bool {
        let full = u16::MAX >> (u16::BITS as usize - self.size);
        let mut domains = [full; MAX_SIZE * MAX_SIZE];
        for &cell in &self.cells {
            if digits[cell] != 0 {
                domains[cell] = 1 << (digits[cell] - 1);
            }
        }
        self.support(&domains, &mut [0; MAX_SIZE * MAX_SIZE])
    }
}

fn assignment_support(set: u16, domains: &[u16], support: &mut [u16]) -> bool {
    if domains.iter().all(|domain| domain & set == set) {
        for mask in support.iter_mut().take(domains.len()) {
            *mask |= set;
        }
        true
    } else {
        digit_set_support(set, domains, support)
    }
}

fn relation_matches(a: usize, b: usize, relation: XSumDotRelation) -> bool {
    match relation {
        XSumDotRelation::Consecutive => a.abs_diff(b) == 1,
        XSumDotRelation::Ratio => a == 2 * b || b == 2 * a,
    }
}

fn subsets_by_size_sum() -> &'static Vec<Vec<Vec<u16>>> {
    static SUBSETS: OnceLock<Vec<Vec<Vec<u16>>>> = OnceLock::new();
    SUBSETS.get_or_init(|| {
        let mut subsets = vec![vec![Vec::new(); MAX_SUM + 1]; MAX_SIZE + 1];
        for mask in 0..=u16::MAX {
            let mut count = 0;
            let mut sum = 0;
            for digit in 1..=MAX_SIZE {
                if mask & (1 << (digit - 1)) != 0 {
                    count += 1;
                    sum += digit;
                }
            }
            subsets[count][sum].push(mask);
        }
        subsets
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exhaustive_support(dot: &XSumDot, domains: &[u16]) -> [u16; MAX_SIZE * MAX_SIZE] {
        fn visit(
            dot: &XSumDot,
            domains: &[u16],
            cells: &[usize],
            index: usize,
            digits: &mut [u8; MAX_SIZE * MAX_SIZE],
            supported: &mut [u16; MAX_SIZE * MAX_SIZE],
        ) {
            if index < cells.len() {
                let cell = cells[index];
                for digit in 1..=dot.size {
                    let bit = 1u16 << (digit - 1);
                    if domains[cell] & bit == 0 {
                        continue;
                    }
                    digits[cell] = digit as u8;
                    visit(dot, domains, cells, index + 1, digits, supported);
                }
                digits[cell] = 0;
                return;
            }

            let totals = dot.ends.each_ref().map(|end| match end {
                DotEnd::Digit(cell) => Some(usize::from(digits[*cell])),
                DotEnd::XSum(x_sum) => {
                    let used = x_sum
                        .cells
                        .iter()
                        .fold(0u32, |mask, &cell| mask | (1 << (digits[cell] - 1)));
                    if used.count_ones() != dot.size as u32 {
                        return None;
                    }
                    let prefix_length = usize::from(digits[x_sum.cells[0]]);
                    Some(
                        x_sum.cells[..prefix_length]
                            .iter()
                            .map(|&cell| usize::from(digits[cell]))
                            .sum(),
                    )
                }
            });
            let [Some(left), Some(right)] = totals else {
                return;
            };
            let matches = match dot.relation {
                XSumDotRelation::Consecutive => left.abs_diff(right) == 1,
                XSumDotRelation::Ratio => left == 2 * right || right == 2 * left,
            };
            if matches {
                for &cell in cells {
                    supported[cell] |= 1 << (digits[cell] - 1);
                }
            }
        }

        let mut supported = [0; MAX_SIZE * MAX_SIZE];
        let mut digits = [0; MAX_SIZE * MAX_SIZE];
        visit(dot, domains, &dot.cells, 0, &mut digits, &mut supported);
        supported
    }

    fn assert_support_matches_exhaustive(dot: &XSumDot, domains: &[u16]) {
        let expected = exhaustive_support(dot, domains);
        let mut supported = [0; MAX_SIZE * MAX_SIZE];
        let has_support = dot.support(domains, &mut supported);
        let cells = dot.cells().collect::<Vec<_>>();
        assert_eq!(has_support, cells.iter().all(|&cell| expected[cell] != 0));
        for cell in cells {
            assert_eq!(
                supported[cell], expected[cell],
                "support mismatch at cell {cell}; dot={dot:?}, domains={domains:?}"
            );
        }
    }

    #[test]
    fn four_by_four_east_x_sum_uses_first_digit_as_prefix_length_and_keeps_distinct_digits() {
        let x_sum = XSum::compile(4, ClueDirection::East, &[0, 1, 2, 3], 10, 0).unwrap();
        let domains = [0b1111; 16];
        let mut supported = [0; MAX_SIZE * MAX_SIZE];
        assert!(x_sum.support(&domains, &mut supported));
        assert_eq!(supported[..4], [0b1000, 0b0111, 0b0111, 0b0111]);

        let impossible_prefix = XSum::compile(4, ClueDirection::East, &[0, 1, 2, 3], 9, 0).unwrap();
        let mut supported = [0; MAX_SIZE * MAX_SIZE];
        assert!(impossible_prefix.support(&domains, &mut supported));
        assert_eq!(supported[0], 0b0100);
        assert_eq!(supported[1] & 0b1000, 0b1000);
        assert_eq!(supported[2] & 0b0010, 0b0010);
    }

    #[test]
    fn requested_total_outcomes_match_the_same_bucket_from_all_derived_totals() {
        let x_sum = XSum::compile(4, ClueDirection::East, &[0, 1, 2, 3], 1, 0).unwrap();
        let mut domains = [0; MAX_SIZE * MAX_SIZE];
        domains[..4].copy_from_slice(&[0b1111, 0b1011, 0b1110, 0b1101]);

        let all = x_sum.outcomes_for(&domains, None);
        for total in 1..=10 {
            let derived = all
                .iter()
                .filter(|outcome| outcome.total == total)
                .map(|outcome| (outcome.total, outcome.support))
                .collect::<Vec<_>>();
            let requested = x_sum
                .outcomes_for(&domains, Some(total))
                .into_iter()
                .map(|outcome| (outcome.total, outcome.support))
                .collect::<Vec<_>>();
            assert_eq!(requested, derived, "total {total}");
        }
    }

    #[test]
    fn rejects_a_ray_that_does_not_start_at_the_declared_edge() {
        assert!(XSum::compile(4, ClueDirection::East, &[1, 2, 3, 4], 10, 0).is_none());
    }

    #[test]
    fn sixteen_by_sixteen_x_sum_keeps_the_sixteen_bit_domain_and_wide_total() {
        let cells = (0..MAX_SIZE).collect::<Vec<_>>();
        let x_sum =
            XSum::compile(MAX_SIZE, ClueDirection::East, &cells, MAX_SUM as u16, 0).unwrap();
        let domains = [u16::MAX; MAX_SIZE * MAX_SIZE];
        let mut supported = [0; MAX_SIZE * MAX_SIZE];
        assert!(x_sum.support(&domains, &mut supported));
        assert_eq!(supported[0], 1 << (MAX_SIZE - 1));
        assert!(
            supported[1..MAX_SIZE]
                .iter()
                .all(|&mask| mask == (1 << (MAX_SIZE - 1)) - 1)
        );
    }

    #[test]
    fn consecutive_dot_supports_two_derived_column_x_sums() {
        let layout = SizedGrid::new(crate::GridSpec {
            size: 4,
            box_rows: 2,
            box_columns: 2,
        })
        .unwrap();
        let dot = XSumDot::compile(
            &layout,
            [
                SizedSumEnd::XSum {
                    direction: ClueDirection::South,
                    index: 1,
                },
                SizedSumEnd::XSum {
                    direction: ClueDirection::South,
                    index: 2,
                },
            ],
            XSumDotRelation::Consecutive,
            0,
        )
        .unwrap();
        let solution = [4, 3, 2, 1, 2, 1, 3, 4, 1, 2, 4, 3, 3, 4, 1, 2];
        assert!(dot.permits(&solution));
        let reversed = [4, 3, 3, 1, 2, 1, 1, 4, 1, 2, 4, 3, 3, 4, 2, 2];
        assert!(!dot.permits(&reversed));
    }

    #[test]
    fn consecutive_dot_supports_an_x_sum_and_its_first_digit() {
        let layout = SizedGrid::new(crate::GridSpec {
            size: 4,
            box_rows: 2,
            box_columns: 2,
        })
        .unwrap();
        let dot = XSumDot::compile(
            &layout,
            [
                SizedSumEnd::XSum {
                    direction: ClueDirection::East,
                    index: 1,
                },
                SizedSumEnd::Digit(4),
            ],
            XSumDotRelation::Consecutive,
            0,
        )
        .unwrap();
        let solution = [4, 3, 2, 1, 2, 1, 3, 4, 1, 2, 4, 3, 3, 4, 1, 2];
        assert!(dot.permits(&solution));
        let incompatible = [4, 3, 2, 1, 3, 2, 1, 4, 1, 2, 4, 3, 2, 4, 3, 1];
        assert!(!dot.permits(&incompatible));
    }

    #[test]
    fn x_sum_dot_support_matches_exhaustive_assignments_for_restricted_domains() {
        let layout = SizedGrid::new(crate::GridSpec {
            size: 4,
            box_rows: 2,
            box_columns: 2,
        })
        .unwrap();
        let end_pairs = [
            [
                SizedSumEnd::XSum {
                    direction: ClueDirection::South,
                    index: 1,
                },
                SizedSumEnd::XSum {
                    direction: ClueDirection::South,
                    index: 2,
                },
            ],
            [
                SizedSumEnd::XSum {
                    direction: ClueDirection::East,
                    index: 1,
                },
                SizedSumEnd::Digit(4),
            ],
        ];

        for ends in end_pairs {
            for relation in [XSumDotRelation::Consecutive, XSumDotRelation::Ratio] {
                let dot = XSumDot::compile(&layout, ends, relation, 0).unwrap();
                for seed in 0..6 {
                    let mut domains = [0b1111; MAX_SIZE * MAX_SIZE];
                    if seed != 0 {
                        for (offset, cell) in dot.cells().enumerate() {
                            let mask = (seed * 11 + offset * 7) & 0b1111;
                            domains[cell] = mask as u16;
                        }
                    }
                    assert_support_matches_exhaustive(&dot, &domains);
                }
            }
        }
    }

    #[test]
    fn ratio_dot_keeps_derived_sums_above_the_cell_digit_range() {
        let layout = SizedGrid::new(crate::GridSpec {
            size: 16,
            box_rows: 4,
            box_columns: 4,
        })
        .unwrap();
        let dot = XSumDot::compile(
            &layout,
            [
                SizedSumEnd::XSum {
                    direction: ClueDirection::South,
                    index: 0,
                },
                SizedSumEnd::XSum {
                    direction: ClueDirection::South,
                    index: 1,
                },
            ],
            XSumDotRelation::Ratio,
            0,
        )
        .unwrap();
        let first: [u8; 16] = [16, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
        let second: [u8; 16] = [8, 2, 4, 6, 9, 11, 13, 15, 1, 3, 5, 7, 10, 12, 14, 16];
        let mut domains = [u16::MAX; MAX_SIZE * MAX_SIZE];
        for (row, digit) in first.into_iter().enumerate() {
            domains[row * 16] = 1 << (digit - 1);
        }
        for (row, digit) in second.into_iter().enumerate() {
            domains[row * 16 + 1] = 1 << (digit - 1);
        }

        let mut supported = [0; MAX_SIZE * MAX_SIZE];
        assert!(dot.support(&domains, &mut supported));
        assert_eq!(supported[0], 1 << 15);
        assert_eq!(supported[1], 1 << 7);
    }

    #[test]
    fn sixteen_by_sixteen_open_dot_propagates_with_wide_derived_totals() {
        let layout = SizedGrid::new(crate::GridSpec {
            size: 16,
            box_rows: 4,
            box_columns: 4,
        })
        .unwrap();
        let dot = XSumDot::compile(
            &layout,
            [
                SizedSumEnd::XSum {
                    direction: ClueDirection::South,
                    index: 0,
                },
                SizedSumEnd::XSum {
                    direction: ClueDirection::South,
                    index: 1,
                },
            ],
            XSumDotRelation::Consecutive,
            0,
        )
        .unwrap();
        let domains = [u16::MAX; MAX_SIZE * MAX_SIZE];
        let mut supported = [0; MAX_SIZE * MAX_SIZE];

        assert!(dot.support(&domains, &mut supported));
        assert!(dot.cells().all(|cell| supported[cell] != 0));
    }

    #[test]
    fn zero_based_dot_uses_displayed_x_sum_totals() {
        let layout = SizedGrid::new(crate::GridSpec {
            size: 6,
            box_rows: 2,
            box_columns: 3,
        })
        .unwrap();
        let dot = XSumDot::compile(
            &layout,
            [
                SizedSumEnd::XSum {
                    direction: ClueDirection::East,
                    index: 0,
                },
                SizedSumEnd::XSum {
                    direction: ClueDirection::West,
                    index: 4,
                },
            ],
            XSumDotRelation::Consecutive,
            1,
        )
        .unwrap();
        let digits = [
            1, 2, 3, 4, 5, 6, 4, 5, 6, 1, 2, 3, 2, 3, 4, 5, 6, 1, 5, 6, 1, 2, 3, 4, 3, 4, 5, 6, 1,
            2, 6, 1, 2, 3, 4, 5,
        ];
        assert!(dot.permits(&digits));
    }

    #[test]
    fn zero_based_x_sum_digit_ratio_uses_displayed_first_digit() {
        let layout = SizedGrid::new(crate::GridSpec {
            size: 6,
            box_rows: 2,
            box_columns: 3,
        })
        .unwrap();
        let dot = XSumDot::compile(
            &layout,
            [
                SizedSumEnd::XSum {
                    direction: ClueDirection::West,
                    index: 3,
                },
                SizedSumEnd::Digit(23),
            ],
            XSumDotRelation::Ratio,
            1,
        )
        .unwrap();
        let digits = [
            1, 2, 3, 4, 5, 6, 4, 5, 6, 1, 2, 3, 2, 3, 4, 5, 6, 1, 5, 6, 1, 2, 3, 4, 3, 4, 5, 6, 1,
            2, 6, 1, 2, 3, 4, 5,
        ];
        assert!(dot.permits(&digits));
    }
}
