use std::ops::Range;

use super::super::{NO_REGION, SizedGrid};
use super::{MAX_CELLS, MAX_SIZE};
use crate::variant::{reachable_sums, region_sum_ranges, sum_support_with_prefix};

/// A collection of disjoint groups which must all have the same total.
#[derive(Debug)]
pub(super) struct EqualSums {
    cells: Vec<usize>,
    groups: Vec<Range<usize>>,
    pub(super) max_total: usize,
}

impl EqualSums {
    pub fn region_sum(layout: &SizedGrid, cells: &[usize], group_by_region: bool) -> Option<Self> {
        if !layout.has_regions() {
            return None;
        }
        let mut seen = [false; MAX_CELLS];
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
        let max_total = groups
            .iter()
            .map(|range| {
                let length = range.len();
                if layout.memberships[cells[range.start]][2] == NO_REGION {
                    length * size
                } else {
                    length * (2 * size - length + 1) / 2
                }
            })
            .min()?;
        Some(Self {
            cells,
            groups,
            max_total,
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
            for (total, reachable) in common
                .iter_mut()
                .zip(reachable_sums::<WORDS>(&masks[..group.len()]))
            {
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
                sum_support_with_prefix::<1>(
                    &masks[..group.len()],
                    [totals[0]],
                    &mut support_active[..group.len()],
                    &mut p,
                )[0]
            } else {
                sum_support_with_prefix::<2>(
                    &masks[..group.len()],
                    totals,
                    &mut support_active[..group.len()],
                    &mut prefix_active,
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
