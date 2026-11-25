use std::ops::Range;

use super::super::{NO_REGION, SizedGrid};
use super::{MAX_CELLS, MAX_SIZE};
use crate::variant::{
    reachable_sums_with_offset, region_sum_ranges, sum_support_with_prefix_and_offset,
};

/// A collection of disjoint groups which must all have the same total.
#[derive(Debug)]
pub(super) struct EqualSums {
    cells: Vec<usize>,
    groups: Vec<Range<usize>>,
    pub(super) max_total: usize,
    pub(super) value_offset: u8,
}

impl EqualSums {
    pub fn region_sum(
        layout: &SizedGrid,
        cells: &[usize],
        group_by_region: bool,
        value_offset: u8,
    ) -> Option<Self> {
        if !layout.has_regions() || value_offset > 1 {
            return None;
        }
        let mut seen = [false; MAX_CELLS];
        for &cell in cells {
            if cell >= layout.cell_count() || std::mem::replace(&mut seen[cell], true) {
                return None;
            }
        }
        let size = layout.size();
        let max_value = size - usize::from(value_offset);
        let mut cells = cells.to_vec();
        let groups = region_sum_ranges(
            &mut cells,
            |cell| layout.memberships[cell][2],
            group_by_region,
        );
        if groups.len() < 2 {
            return None;
        }
        let max_total = groups
            .iter()
            .map(|range| {
                let length = range.len();
                if layout.memberships[cells[range.start]][2] == NO_REGION {
                    length * max_value
                } else {
                    length * (2 * max_value - length + 1) / 2
                }
            })
            .min()?;
        Some(Self {
            cells,
            groups,
            max_total,
            value_offset,
        })
    }

    pub fn zipper(layout: &SizedGrid, path: &[usize]) -> Option<Self> {
        if path.len() < 3 || path.len() > layout.cell_count() {
            return None;
        }
        let mut seen = [false; MAX_CELLS];
        if path
            .iter()
            .any(|&cell| cell >= layout.cell_count() || std::mem::replace(&mut seen[cell], true))
        {
            return None;
        }
        let pairs = path.len() / 2;
        let mut cells = Vec::with_capacity(path.len());
        let mut groups = Vec::with_capacity(path.len().div_ceil(2));
        for (&left, &right) in path.iter().zip(path.iter().rev()).take(pairs) {
            let start = cells.len();
            cells.extend([left, right]);
            groups.push(start..cells.len());
        }
        let max_total = if path.len() % 2 == 0 {
            2 * layout.size()
        } else {
            let start = cells.len();
            cells.push(path[pairs]);
            groups.push(start..cells.len());
            layout.size()
        };
        Some(Self {
            cells,
            groups,
            max_total,
            value_offset: 0,
        })
    }

    pub fn cells(&self) -> impl Iterator<Item = usize> + '_ {
        self.cells.iter().copied()
    }
    pub fn groups(&self) -> impl Iterator<Item = &[usize]> {
        self.groups.iter().map(|range| &self.cells[range.clone()])
    }

    pub fn totals(&self, domains: &[u16]) -> [u128; 2] {
        if self.max_total < 128 {
            self.totals_with_words::<1>(domains)
        } else {
            self.totals_with_words::<2>(domains)
        }
    }

    fn totals_with_words<const WORDS: usize>(&self, domains: &[u16]) -> [u128; 2] {
        let mut common = [0; WORDS];
        for (word, mask) in common.iter_mut().enumerate() {
            let bits = (self.max_total + 1).saturating_sub(word * 128).min(128);
            *mask = u128::MAX.checked_shr((128 - bits) as u32).unwrap_or(0);
        }
        let mut masks = [0; MAX_SIZE];
        for group in self.groups() {
            if group.len() > MAX_SIZE {
                return [0, 0];
            }
            for (mask, &cell) in masks.iter_mut().zip(group) {
                *mask = domains[cell];
            }
            for (total, reachable) in common.iter_mut().zip(reachable_sums_with_offset::<WORDS>(
                &masks[..group.len()],
                self.value_offset,
            )) {
                *total &= reachable;
            }
        }
        let mut result = [0; 2];
        result[..WORDS].copy_from_slice(&common);
        result
    }

    pub fn support_at_totals(
        &self,
        domains: &[u16],
        supported: &mut [u16],
        totals: [u128; 2],
    ) -> bool {
        let words = if self.max_total < 128 { 1 } else { 2 };
        let totals = if words == 1 { [totals[0], 0] } else { totals };
        if totals == [0, 0] {
            return false;
        }
        let mut masks = [0; MAX_SIZE];
        for group in self.groups() {
            for (mask, &cell) in masks.iter_mut().zip(group) {
                *mask = domains[cell];
            }
            // Keep the helper's fixed scratch size bounded by the grid side.
            if group.len() > MAX_SIZE {
                return false;
            }
            let mut prefix_active = [[0; 2]; MAX_SIZE + 1];
            let mut support_active = [0; MAX_SIZE];
            let matched = if words == 1 {
                let mut p = [[0; 1]; MAX_SIZE + 1];
                sum_support_with_prefix_and_offset::<1>(
                    &masks[..group.len()],
                    [totals[0]],
                    &mut support_active[..group.len()],
                    &mut p,
                    self.value_offset,
                )[0]
            } else {
                sum_support_with_prefix_and_offset::<2>(
                    &masks[..group.len()],
                    totals,
                    &mut support_active[..group.len()],
                    &mut prefix_active,
                    self.value_offset,
                )
                .iter()
                .any(|&word| word != 0) as u128
            };
            if matched == 0 {
                return false;
            }
            for (&cell, &mask) in group.iter().zip(&support_active) {
                supported[cell] = mask;
            }
        }
        self.cells.iter().all(|&cell| supported[cell] != 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{GridSpec, SizedGrid};

    #[test]
    fn region_sum_total_masks_use_displayed_zero_based_values() {
        let layout = SizedGrid::new(GridSpec {
            size: 4,
            box_rows: 2,
            box_columns: 2,
        })
        .unwrap();
        let cells = [0, 2, 3];
        let line = EqualSums::region_sum(&layout, &cells, false, 1).unwrap();
        let one_based = EqualSums::region_sum(&layout, &cells, false, 0).unwrap();
        let mut domains = [0; 16];
        for (cell, digit) in [(0, 4), (2, 2), (3, 3)] {
            domains[cell] = 1 << (digit - 1);
        }

        assert_ne!(line.totals(&domains)[0] & (1 << 3), 0);
        assert_eq!(one_based.totals(&domains)[0], 0);
        assert!(line.support_at_totals(&domains, &mut [0; 16], [1 << 3, 0]));
    }
}
