use std::ops::Range;

use super::super::{MAX_SIZE, SizedGrid};
use crate::variant::{reachable_sums, region_sum_ranges, sum_support_with_prefix};

#[derive(Debug)]
pub(super) struct RegionSum {
    cells: Vec<usize>,
    groups: Vec<Range<usize>>,
    max_total: usize,
    size: usize,
}

impl RegionSum {
    pub fn compile(layout: &SizedGrid, cells: &[usize], group_by_region: bool) -> Option<Self> {
        if !layout.has_regions() {
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
        let max_total = smallest_group * (2 * size - smallest_group + 1) / 2;
        Some(Self {
            cells,
            groups,
            size,
            max_total,
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
        for cells in self.groups() {
            let (sum, empty) = cells.iter().fold((0, 0), |(sum, empty), &cell| {
                (
                    sum + usize::from(digits[cell]),
                    empty + usize::from(digits[cell] == 0),
                )
            });
            low = low.max(sum + empty);
            high = high.min(sum + empty * self.size);
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
            let reachable = reachable_sums::<WORDS>(&masks[..cells.len()]);
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
            sum_support_with_prefix(
                &masks[..cells.len()],
                totals,
                &mut support[..cells.len()],
                &mut prefix,
            );
            for (&cell, mask) in cells.iter().zip(support) {
                supported[cell] = mask;
            }
        }
        true
    }
}
