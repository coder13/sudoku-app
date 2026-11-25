use std::ops::Range;

use super::super::{MAX_SIZE, SizedGrid};
use crate::variant::{
    reachable_sums_with_offset, region_sum_ranges, sum_support_with_prefix_and_offset,
};

#[derive(Debug)]
pub(super) struct RegionSum {
    cells: Vec<usize>,
    groups: Vec<Range<usize>>,
    max_total: usize,
    size: usize,
    value_offset: u8,
}

impl RegionSum {
    pub fn compile(
        layout: &SizedGrid,
        cells: &[usize],
        group_by_region: bool,
        value_offset: u8,
    ) -> Option<Self> {
        if !layout.has_regions() || value_offset > 1 {
            return None;
        }
        let mut seen = [false; MAX_SIZE * MAX_SIZE];
        for &cell in cells {
            if cell >= layout.cell_count() || std::mem::replace(&mut seen[cell], true) {
                return None;
            }
        }
        let size = layout.size();
        let mut cells = cells.to_vec();
        let groups = region_sum_ranges(
            &mut cells,
            |cell| layout.memberships[cell][2],
            group_by_region,
        );
        if groups.len() < 2 {
            return None;
        }
        // Cells in each group share a region and use distinct digits.
        let smallest_group = groups.iter().map(Range::len).min()?;
        let max_value = size - usize::from(value_offset);
        let max_total = smallest_group * (2 * max_value - smallest_group + 1) / 2;
        Some(Self {
            cells,
            groups,
            size,
            max_total,
            value_offset,
        })
    }

    pub fn cells(&self) -> impl Iterator<Item = usize> + '_ {
        self.cells.iter().copied()
    }

    fn groups(&self) -> impl Iterator<Item = &[usize]> {
        self.groups.iter().map(|range| &self.cells[range.clone()])
    }

    pub fn permits(&self, digits: &[u8]) -> bool {
        let mut low = 0;
        let mut high = usize::MAX;
        let offset = usize::from(self.value_offset);
        for cells in self.groups() {
            let (sum, empty) = cells.iter().fold((0, 0), |(sum, empty), &cell| {
                (
                    sum + usize::from(digits[cell].saturating_sub(self.value_offset)),
                    empty + usize::from(digits[cell] == 0),
                )
            });
            low = low.max(sum + empty * (1 - offset));
            high = high.min(sum + empty * (self.size - offset));
        }
        low <= high
    }

    pub fn support(&self, domains: &[u16], supported: &mut [u16]) -> bool {
        // Every run contains distinct cells of one region. Only size 16
        // can have a legal run total of 128 or more.
        if self.size < MAX_SIZE {
            self.support_with_words::<1>(domains, supported)
        } else {
            self.support_with_words::<2>(domains, supported)
        }
    }

    fn support_with_words<const WORDS: usize>(
        &self,
        domains: &[u16],
        supported: &mut [u16],
    ) -> bool {
        let mut totals = [u128::MAX; WORDS];
        for (word, mask) in totals.iter_mut().enumerate() {
            let bits = (self.max_total + 1).saturating_sub(word * 128).min(128);
            *mask = u128::MAX.checked_shr((128 - bits) as u32).unwrap_or(0);
        }

        let mut masks = [0; MAX_SIZE];
        for cells in self.groups() {
            for (mask, &cell) in masks.iter_mut().zip(cells) {
                *mask = domains[cell];
            }
            let reachable =
                reachable_sums_with_offset::<WORDS>(&masks[..cells.len()], self.value_offset);
            for (common, group) in totals.iter_mut().zip(reachable) {
                *common &= group;
            }
            if totals.iter().all(|&word| word == 0) {
                return false;
            }
        }
        let mut support = [0; MAX_SIZE];
        let mut prefix = [[0; WORDS]; MAX_SIZE + 1];
        for cells in self.groups() {
            for (mask, &cell) in masks.iter_mut().zip(cells) {
                *mask = domains[cell];
            }
            sum_support_with_prefix_and_offset(
                &masks[..cells.len()],
                totals,
                &mut support[..cells.len()],
                &mut prefix,
                self.value_offset,
            );
            for (&cell, mask) in cells.iter().zip(support) {
                supported[cell] = mask;
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{GridSpec, SizedGrid};

    #[test]
    fn zero_based_totals_keep_rank_one_as_a_filled_zero() {
        let layout = SizedGrid::new(GridSpec {
            size: 4,
            box_rows: 2,
            box_columns: 2,
        })
        .unwrap();
        let cells = [0, 2, 3];
        let zero_based = RegionSum::compile(&layout, &cells, false, 1).unwrap();
        let one_based = RegionSum::compile(&layout, &cells, false, 0).unwrap();
        let mut digits = [0; 16];
        digits[0] = 4;
        digits[2] = 2;
        digits[3] = 3;

        assert!(zero_based.permits(&digits));
        assert!(!one_based.permits(&digits));

        let mut domains = [0; 16];
        for (cell, digit) in [(0, 4), (2, 2), (3, 3)] {
            domains[cell] = 1 << (digit - 1);
        }
        let mut support = [0; 16];
        assert!(zero_based.support(&domains, &mut support));
        assert_eq!(support[0], 1 << 3);
        assert_eq!(support[2], 1 << 1);
        assert_eq!(support[3], 1 << 2);
        assert!(RegionSum::compile(&layout, &cells, false, 2).is_none());
    }
}
