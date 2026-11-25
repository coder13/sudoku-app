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
        if !valid || usize::from(sum) > size * (size + 1) / 2 {
            return None;
        }
        Some(Self {
            cells: cells.to_vec(),
            size,
            sum: usize::from(sum),
            direction,
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
        let maximum = self.size * (self.size + 1) / 2;
        let mut totals = vec![None::<[u16; MAX_SIZE]>; maximum + 1];
        for length in 1..=self.size {
            let first = 1u16 << (length - 1);
            if domains[self.cells[0]] & first == 0 {
                continue;
            }
            for (sum, prefixes) in subsets_by_size_sum()[length]
                .iter()
                .enumerate()
                .skip(length)
            {
                if only_total.is_some_and(|target| target != sum) {
                    continue;
                }
                for &prefix_digits in prefixes {
                    if prefix_digits & first == 0 {
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
                    let mut prefix_support = [0; MAX_SIZE];
                    let mut suffix_support = [0; MAX_SIZE];
                    if !digit_set_support(
                        prefix_digits ^ first,
                        &prefix_domains[..length - 1],
                        &mut prefix_support[..length - 1],
                    ) || !digit_set_support(
                        all ^ prefix_digits,
                        &suffix_domains[..self.size - length],
                        &mut suffix_support[..self.size - length],
                    ) {
                        continue;
                    }
                    let support = totals[sum].get_or_insert([0; MAX_SIZE]);
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
            .filter_map(|(total, support)| support.map(|support| XSumOutcome { total, support }))
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
    fn compile(layout: &SizedGrid, end: SizedSumEnd) -> Option<Self> {
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
                Some(Self::XSum(XSum::compile(size, direction, &cells, 1)?))
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

    fn outcomes(&self, domains: &[u16], size: usize) -> Vec<XSumOutcome> {
        match self {
            Self::Digit(cell) => (1..=size)
                .filter(|digit| domains[*cell] & (1 << (digit - 1)) != 0)
                .map(|digit| {
                    let mut support = [0; MAX_SIZE];
                    support[0] = 1 << (digit - 1);
                    XSumOutcome {
                        total: digit,
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
}

impl XSumDot {
    pub(super) fn compile(
        layout: &SizedGrid,
        ends: [SizedSumEnd; 2],
        relation: XSumDotRelation,
    ) -> Option<Self> {
        if ends[0] == ends[1] || ends.iter().all(|end| matches!(end, SizedSumEnd::Digit(_))) {
            return None;
        }
        let compiled = [
            DotEnd::compile(layout, ends[0])?,
            DotEnd::compile(layout, ends[1])?,
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
        let left = self.ends[0].outcomes(domains, self.size);
        let right = self.ends[1].outcomes(domains, self.size);
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

    #[test]
    fn four_by_four_east_x_sum_uses_first_digit_as_prefix_length_and_keeps_distinct_digits() {
        let x_sum = XSum::compile(4, ClueDirection::East, &[0, 1, 2, 3], 10).unwrap();
        let domains = [0b1111; 16];
        let mut supported = [0; MAX_SIZE * MAX_SIZE];
        assert!(x_sum.support(&domains, &mut supported));
        assert_eq!(supported[..4], [0b1000, 0b0111, 0b0111, 0b0111]);

        let impossible_prefix = XSum::compile(4, ClueDirection::East, &[0, 1, 2, 3], 9).unwrap();
        let mut supported = [0; MAX_SIZE * MAX_SIZE];
        assert!(impossible_prefix.support(&domains, &mut supported));
        assert_eq!(supported[0], 0b0100);
        assert_eq!(supported[1] & 0b1000, 0b1000);
        assert_eq!(supported[2] & 0b0010, 0b0010);
    }

    #[test]
    fn rejects_a_ray_that_does_not_start_at_the_declared_edge() {
        assert!(XSum::compile(4, ClueDirection::East, &[1, 2, 3, 4], 10).is_none());
    }

    #[test]
    fn sixteen_by_sixteen_x_sum_keeps_the_sixteen_bit_domain_and_wide_total() {
        let cells = (0..MAX_SIZE).collect::<Vec<_>>();
        let x_sum = XSum::compile(MAX_SIZE, ClueDirection::East, &cells, MAX_SUM as u16).unwrap();
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
        )
        .unwrap();
        let solution = [4, 3, 2, 1, 2, 1, 3, 4, 1, 2, 4, 3, 3, 4, 1, 2];
        assert!(dot.permits(&solution));
        let incompatible = [4, 3, 2, 1, 3, 2, 1, 4, 1, 2, 4, 3, 2, 4, 3, 1];
        assert!(!dot.permits(&incompatible));
    }
}
