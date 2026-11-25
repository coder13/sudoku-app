use std::collections::BTreeMap;

use super::equal_sums::EqualSums;
use super::{MAX_CELLS, MAX_SIZE};

// Joint support is exact while it stays cheap, then falls back to the sound
// intersection of each rule's individual supports. This keeps broad 16×16
// domains from making ordinary candidate queries spend seconds in DFS.
const MAX_JOINT_SEARCH_NODES: usize = 50_000;

#[derive(Debug)]
pub(super) struct CoupledSums {
    pub rules: [usize; 2],
    pub cells: Vec<usize>,
    equal_cells: Vec<[usize; 2]>,
    compatible: Vec<[u16; 2]>,
    left_group_by_cell: Vec<usize>,
    right_group_by_cell: Vec<usize>,
    left_group_sizes: Vec<usize>,
    right_group_sizes: Vec<usize>,
}

pub(super) struct Support {
    pub masks: [u16; MAX_CELLS],
    pub exact: bool,
}

impl CoupledSums {
    pub fn compile(sums: &[Option<EqualSums>]) -> Vec<Self> {
        let mut by_cells: BTreeMap<Vec<usize>, Vec<usize>> = BTreeMap::new();
        for (index, sum) in sums.iter().enumerate() {
            if let Some(sum) = sum {
                let mut cells: Vec<_> = sum.cells().collect();
                cells.sort_unstable();
                by_cells.entry(cells).or_default().push(index);
            }
        }
        let mut pairs = Vec::new();
        for (cells, rules) in by_cells {
            for (position, &a) in rules.iter().enumerate() {
                for &b in &rules[position + 1..] {
                    let left = sums[a].as_ref().unwrap();
                    let right = sums[b].as_ref().unwrap();
                    if same_partition(left, right) {
                        continue;
                    }
                    let left_count = left.groups().count();
                    let right_count = right.groups().count();
                    // Zero is a valid total when the grid uses zero-based values.
                    let minimum = if left.value_offset == 1 || right.value_offset == 1 {
                        0
                    } else {
                        1
                    };
                    let compatible = (minimum..=left.max_total)
                        .filter_map(|total| {
                            let whole = total * left_count;
                            (whole % right_count == 0 && whole / right_count <= right.max_total)
                                .then_some([total as u16, (whole / right_count) as u16])
                        })
                        .collect();
                    let (left_group_by_cell, left_group_sizes) = group_map(&cells, left);
                    let (right_group_by_cell, right_group_sizes) = group_map(&cells, right);
                    let equal_cells = crossed_pairs(&cells, left, right);
                    pairs.push(Self {
                        rules: [a, b],
                        cells: cells.clone(),
                        equal_cells,
                        compatible,
                        left_group_by_cell,
                        right_group_by_cell,
                        left_group_sizes,
                        right_group_sizes,
                    });
                }
            }
        }
        pairs
    }

    pub fn support(&self, sums: &[Option<EqualSums>], domains: &[u16]) -> Option<Support> {
        self.support_inner(sums, domains, None)
    }

    pub fn support_with_totals(
        &self,
        sums: &[Option<EqualSums>],
        domains: &[u16],
        compatible_totals: &mut Vec<[u16; 2]>,
    ) -> Option<Support> {
        self.support_inner(sums, domains, Some(compatible_totals))
    }

    fn support_inner(
        &self,
        sums: &[Option<EqualSums>],
        domains: &[u16],
        mut compatible_totals: Option<&mut Vec<[u16; 2]>>,
    ) -> Option<Support> {
        let left = sums[self.rules[0]].as_ref()?;
        let right = sums[self.rules[1]].as_ref()?;
        let mut narrowed = [0; MAX_CELLS];
        for &cell in &self.cells {
            narrowed[cell] = domains[cell];
        }
        for &[a, b] in &self.equal_cells {
            let common = narrowed[a] & narrowed[b];
            if common == 0 {
                return None;
            }
            narrowed[a] = common;
            narrowed[b] = common;
        }
        let left_totals = left.totals(&narrowed);
        let right_totals = right.totals(&narrowed);
        let mut masks = [0; MAX_CELLS];
        let mut search_nodes = 0;
        for &[a, b] in &self.compatible {
            if contains(left_totals, a) && contains(right_totals, b) {
                if self.cells.len() <= MAX_SIZE {
                    let mut support = [0; MAX_CELLS];
                    let remaining_nodes = MAX_JOINT_SEARCH_NODES - search_nodes;
                    let (exhausted, used_nodes) = self.support_for_totals(
                        &narrowed,
                        usize::from(a),
                        usize::from(b),
                        &mut support,
                        remaining_nodes,
                    );
                    search_nodes += used_nodes;
                    if exhausted {
                        return self
                            .independent_support(left, right, &narrowed, left_totals, right_totals)
                            .map(|mut support| {
                                support.exact = false;
                                support
                            });
                    }
                    if self.cells.iter().all(|&cell| support[cell] != 0) {
                        if let Some(totals) = compatible_totals.as_deref_mut() {
                            totals.push([a, b]);
                        }
                    }
                    for &cell in &self.cells {
                        masks[cell] |= support[cell];
                    }
                    if self.cells.iter().all(|&cell| masks[cell] == narrowed[cell]) {
                        break;
                    }
                } else {
                    return self.independent_support(
                        left,
                        right,
                        &narrowed,
                        left_totals,
                        right_totals,
                    );
                }
            }
        }
        if self.cells.iter().any(|&cell| masks[cell] == 0) {
            return None;
        }
        self.cells
            .iter()
            .all(|&cell| masks[cell] != 0)
            .then_some(Support { masks, exact: true })
    }

    fn independent_support(
        &self,
        left: &EqualSums,
        right: &EqualSums,
        domains: &[u16],
        left_totals: [u128; 2],
        right_totals: [u128; 2],
    ) -> Option<Support> {
        let mut totals = [[0; 2]; 2];
        for &[a, b] in &self.compatible {
            if contains(left_totals, a) && contains(right_totals, b) {
                set(&mut totals[0], a);
                set(&mut totals[1], b);
            }
        }
        if totals.iter().flatten().all(|&word| word == 0) {
            return None;
        }
        let mut masks = [0; MAX_CELLS];
        let mut right_masks = [0; MAX_CELLS];
        if !left.support_at_totals(domains, &mut masks, totals[0])
            || !right.support_at_totals(domains, &mut right_masks, totals[1])
        {
            return None;
        }
        for &cell in &self.cells {
            masks[cell] &= right_masks[cell];
        }
        for &[a, b] in &self.equal_cells {
            let common = masks[a] & masks[b];
            masks[a] = common;
            masks[b] = common;
        }
        self.cells
            .iter()
            .all(|&cell| masks[cell] != 0)
            .then_some(Support {
                masks,
                exact: false,
            })
    }

    fn support_for_totals(
        &self,
        domains: &[u16],
        left_target: usize,
        right_target: usize,
        supported: &mut [u16; MAX_CELLS],
        node_budget: usize,
    ) -> (bool, usize) {
        let mut order = [0; MAX_SIZE];
        for (index, item) in order[..self.cells.len()].iter_mut().enumerate() {
            *item = index;
        }
        order[..self.cells.len()].sort_unstable_by_key(|&index| {
            let cell = self.cells[index];
            (
                domains[cell].count_ones(),
                self.left_group_sizes[self.left_group_by_cell[index]]
                    + self.right_group_sizes[self.right_group_by_cell[index]],
            )
        });

        let mut left_sum = [0; MAX_CELLS];
        let mut right_sum = [0; MAX_CELLS];
        let mut left_min = [0; MAX_CELLS];
        let mut right_min = [0; MAX_CELLS];
        let mut left_max = [0; MAX_CELLS];
        let mut right_max = [0; MAX_CELLS];
        let mut digits = [0; MAX_SIZE];
        for (index, &cell) in self.cells.iter().enumerate() {
            let mask = domains[cell];
            let min = mask.trailing_zeros() as usize + 1;
            let max = u16::BITS as usize - mask.leading_zeros() as usize;
            left_min[self.left_group_by_cell[index]] += min;
            right_min[self.right_group_by_cell[index]] += min;
            left_max[self.left_group_by_cell[index]] += max;
            right_max[self.right_group_by_cell[index]] += max;
        }
        let mut search = JointSearch {
            cells: &self.cells,
            left_group_by_cell: &self.left_group_by_cell,
            right_group_by_cell: &self.right_group_by_cell,
            domains,
            order: &order[..self.cells.len()],
            left_target,
            right_target,
            digits: &mut digits,
            left_sum: &mut left_sum,
            right_sum: &mut right_sum,
            left_min: &mut left_min,
            right_min: &mut right_min,
            left_max: &mut left_max,
            right_max: &mut right_max,
            supported,
            nodes: 0,
            exhausted: false,
            node_budget,
        };
        search.visit(0);
        (search.exhausted, search.nodes)
    }
}

struct JointSearch<'a> {
    cells: &'a [usize],
    left_group_by_cell: &'a [usize],
    right_group_by_cell: &'a [usize],
    domains: &'a [u16],
    order: &'a [usize],
    left_target: usize,
    right_target: usize,
    digits: &'a mut [u8; MAX_SIZE],
    left_sum: &'a mut [usize; MAX_CELLS],
    right_sum: &'a mut [usize; MAX_CELLS],
    left_min: &'a mut [usize; MAX_CELLS],
    right_min: &'a mut [usize; MAX_CELLS],
    left_max: &'a mut [usize; MAX_CELLS],
    right_max: &'a mut [usize; MAX_CELLS],
    supported: &'a mut [u16; MAX_CELLS],
    nodes: usize,
    exhausted: bool,
    node_budget: usize,
}

impl JointSearch<'_> {
    fn visit(&mut self, depth: usize) -> bool {
        if self.nodes >= self.node_budget {
            self.exhausted = true;
            return false;
        }
        self.nodes += 1;
        if depth == self.order.len() {
            for (index, &cell) in self.cells.iter().enumerate() {
                self.supported[cell] |= 1 << (self.digits[index] - 1);
            }
            return self
                .cells
                .iter()
                .all(|&cell| self.supported[cell] == self.domains[cell]);
        }
        let index = self.order[depth];
        let cell = self.cells[index];
        let left_group = self.left_group_by_cell[index];
        let right_group = self.right_group_by_cell[index];
        let mask = self.domains[cell];
        let min = mask.trailing_zeros() as usize + 1;
        let max = u16::BITS as usize - mask.leading_zeros() as usize;
        self.left_min[left_group] -= min;
        self.right_min[right_group] -= min;
        self.left_max[left_group] -= max;
        self.right_max[right_group] -= max;

        let mut remaining = mask;
        while remaining != 0 {
            let bit = remaining & remaining.wrapping_neg();
            remaining ^= bit;
            let digit = bit.trailing_zeros() as usize + 1;
            self.digits[index] = digit as u8;
            self.left_sum[left_group] += digit;
            self.right_sum[right_group] += digit;
            let possible = self.left_sum[left_group] <= self.left_target
                && self.left_sum[left_group] + self.left_min[left_group] <= self.left_target
                && self.left_sum[left_group] + self.left_max[left_group] >= self.left_target
                && self.right_sum[right_group] <= self.right_target
                && self.right_sum[right_group] + self.right_min[right_group] <= self.right_target
                && self.right_sum[right_group] + self.right_max[right_group] >= self.right_target;
            let complete = possible && self.visit(depth + 1);
            self.left_sum[left_group] -= digit;
            self.right_sum[right_group] -= digit;
            if complete {
                self.left_min[left_group] += min;
                self.right_min[right_group] += min;
                self.left_max[left_group] += max;
                self.right_max[right_group] += max;
                return true;
            }
        }
        self.left_min[left_group] += min;
        self.right_min[right_group] += min;
        self.left_max[left_group] += max;
        self.right_max[right_group] += max;
        false
    }
}

fn group_map(cells: &[usize], sums: &EqualSums) -> (Vec<usize>, Vec<usize>) {
    let mut by_cell = vec![usize::MAX; cells.len()];
    let mut sizes = Vec::new();
    for (group_index, group) in sums.groups().enumerate() {
        sizes.push(group.len());
        for &cell in group {
            by_cell[cells.binary_search(&cell).unwrap()] = group_index;
        }
    }
    debug_assert!(by_cell.iter().all(|&group| group != usize::MAX));
    (by_cell, sizes)
}

fn same_partition(left: &EqualSums, right: &EqualSums) -> bool {
    left.groups().count() == right.groups().count()
        && left.groups().all(|group| {
            right.groups().any(|other| {
                group.len() == other.len() && group.iter().all(|cell| other.contains(cell))
            })
        })
}

fn crossed_pairs(cells: &[usize], left: &EqualSums, right: &EqualSums) -> Vec<[usize; 2]> {
    if cells.len() != 4
        || !left
            .groups()
            .chain(right.groups())
            .all(|group| group.len() == 2)
    {
        return Vec::new();
    }
    cells
        .iter()
        .filter_map(|&a| {
            let l = left.groups().find(|group| group.contains(&a))?;
            let r = right.groups().find(|group| group.contains(&a))?;
            if l.iter().all(|cell| r.contains(cell)) {
                return None;
            }
            cells
                .iter()
                .find(|&&b| b > a && !l.contains(&b) && !r.contains(&b))
                .map(|&b| [a, b])
        })
        .collect()
}

fn contains(mask: [u128; 2], total: u16) -> bool {
    let total = usize::from(total);
    mask[total / 128] & (1 << (total % 128)) != 0
}

fn set(mask: &mut [u128; 2], total: u16) {
    let total = usize::from(total);
    mask[total / 128] |= 1 << (total % 128);
}

#[cfg(test)]
mod tests {
    use super::CoupledSums;
    use crate::sized::constraints::equal_sums::EqualSums;
    use crate::{GridSpec, SizedGrid};

    #[test]
    fn crossed_zero_based_region_sums_keep_zero_as_a_compatible_total() {
        let layout = SizedGrid::new(GridSpec {
            size: 4,
            box_rows: 2,
            box_columns: 2,
        })
        .unwrap();
        let cells = [0, 8, 1, 9];
        let sums = [
            Some(EqualSums::region_sum(&layout, &cells, false, 1).unwrap()),
            Some(EqualSums::region_sum(&layout, &cells, true, 1).unwrap()),
        ];
        let pairs = CoupledSums::compile(&sums);
        assert_eq!(pairs.len(), 1);
        assert!(pairs[0].compatible.contains(&[0, 0]));
    }

    #[test]
    fn crossed_zipper_and_region_sum_support_matches_direct_assignments() {
        let layout = SizedGrid::new(GridSpec {
            size: 4,
            box_rows: 2,
            box_columns: 2,
        })
        .unwrap();
        let line = [0, 5, 6, 3];
        let sums = [
            Some(EqualSums::zipper(&layout, &line).unwrap()),
            Some(EqualSums::region_sum(&layout, &line, false, 0).unwrap()),
        ];
        let pairs = CoupledSums::compile(&sums);
        assert_eq!(pairs.len(), 1);
        for seed in 0..64u32 {
            let mut domains = [15u16; 16];
            for (index, &cell) in line.iter().enumerate() {
                domains[cell] = ((seed.wrapping_mul(1_057).wrapping_add(4_161) as u16)
                    .rotate_left((5 * index) as u32)
                    & 15)
                    | 1;
            }
            let mut expected = [0u16; 4];
            for packed in 0..256 {
                let digits: [u8; 4] =
                    std::array::from_fn(|index| 1 + ((packed >> (2 * index)) & 3) as u8);
                if digits
                    .iter()
                    .zip(line)
                    .any(|(&digit, cell)| domains[cell] & (1 << (digit - 1)) == 0)
                {
                    continue;
                }
                let [a, b, c, d] = digits;
                if a + d == b + c && a + b == c + d {
                    for (mask, digit) in expected.iter_mut().zip(digits) {
                        *mask |= 1 << (digit - 1);
                    }
                }
            }
            let result = pairs[0]
                .support(&sums, &domains)
                .map(|support| line.map(|cell| support.masks[cell]));
            assert_eq!(result, (expected != [0; 4]).then_some(expected));
        }
    }

    #[test]
    fn six_by_six_crossed_totals_match_direct_assignments_for_restricted_domains() {
        let layout = SizedGrid::new(GridSpec {
            size: 6,
            box_rows: 2,
            box_columns: 3,
        })
        .unwrap();
        // In 2×3 boxes this path is split into the two Region Sum segments
        // [2, 7] and [13, 12], crossing the Zipper pairs [2, 12] and [7, 13].
        let line = [2, 7, 13, 12];
        let sums = [
            Some(EqualSums::zipper(&layout, &line).unwrap()),
            Some(EqualSums::region_sum(&layout, &line, false, 0).unwrap()),
        ];
        let pairs = CoupledSums::compile(&sums);
        assert_eq!(pairs.len(), 1);
        for seed in 0..96u32 {
            let mut domains = [0u16; 36];
            for (index, &cell) in line.iter().enumerate() {
                let rotated = seed
                    .wrapping_mul(2_654_435_761)
                    .rotate_left((7 * index) as u32);
                domains[cell] = ((rotated as u16) & 63) | 1;
            }
            let mut expected = [0u16; 4];
            for packed in 0..1_296 {
                let mut value = packed;
                let digits = std::array::from_fn::<_, 4, _>(|_| {
                    let digit = (value % 6 + 1) as u8;
                    value /= 6;
                    digit
                });
                if digits
                    .iter()
                    .zip(line)
                    .any(|(&digit, cell)| domains[cell] & (1 << (digit - 1)) == 0)
                {
                    continue;
                }
                let [a, b, c, d] = digits;
                if a + d == b + c && a + b == c + d {
                    for (mask, digit) in expected.iter_mut().zip(digits) {
                        *mask |= 1 << (digit - 1);
                    }
                }
            }
            let result = pairs[0]
                .support(&sums, &domains)
                .map(|support| line.map(|cell| support.masks[cell]));
            assert_eq!(result, (expected != [0; 4]).then_some(expected));
        }
    }

    #[test]
    fn five_zipper_pairs_and_three_region_segments_share_only_compatible_whole_totals() {
        let layout = SizedGrid::new(GridSpec {
            size: 6,
            box_rows: 2,
            box_columns: 3,
        })
        .unwrap();
        // This is the ten-cell path from the published Zipper Duality export.
        let line = [9, 3, 4, 11, 16, 22, 21, 26, 31, 24];
        let sums = [
            Some(EqualSums::zipper(&layout, &line).unwrap()),
            Some(EqualSums::region_sum(&layout, &line, false, 0).unwrap()),
        ];
        let pairs = CoupledSums::compile(&sums);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].compatible, [[3, 5], [6, 10], [9, 15]]);

        let mut open_domains = [0u16; 36];
        for &cell in &line {
            open_domains[cell] = 63;
        }
        let unrestricted = pairs[0].support(&sums, &open_domains).unwrap();
        assert!(unrestricted.exact);
        assert_ne!(unrestricted.masks[line[0]] & (1 << 5), 0);
        assert_eq!(unrestricted.masks[line[3]] & (1 << 5), 0);

        for seed in 0..96u32 {
            let mut domains = [0u16; 36];
            for (index, &cell) in line.iter().enumerate() {
                let mixed = seed
                    .wrapping_mul(2_654_435_761)
                    .rotate_left((3 * index) as u32);
                let first = (mixed % 6) as usize;
                let second = (first + 1 + ((mixed >> 8) % 5) as usize) % 6;
                domains[cell] = (1 << first) | (1 << second);
            }

            let mut expected = [0u16; 10];
            for packed in 0..1_024u16 {
                let digits: [u8; 10] = std::array::from_fn(|index| {
                    let mask = domains[line[index]];
                    let first = mask.trailing_zeros() as u8 + 1;
                    let second = (mask & !(1 << (first - 1))).trailing_zeros() as u8 + 1;
                    if packed & (1 << index) == 0 {
                        first
                    } else {
                        second
                    }
                });
                let zipper_total = usize::from(digits[0] + digits[9]);
                let zipper =
                    (0..5).all(|pair| usize::from(digits[pair] + digits[9 - pair]) == zipper_total);
                let region_total = usize::from(digits[0] + digits[1] + digits[2] + digits[3]);
                let regions = (digits[4] + digits[5] + digits[6]) as usize == region_total
                    && (digits[7] + digits[8] + digits[9]) as usize == region_total;
                if zipper && regions {
                    for (mask, digit) in expected.iter_mut().zip(digits) {
                        *mask |= 1 << (digit - 1);
                    }
                }
            }

            let result = pairs[0]
                .support(&sums, &domains)
                .map(|support| line.map(|cell| support.masks[cell]));
            assert_eq!(result, (expected != [0; 10]).then_some(expected));
        }
    }

    #[test]
    fn broad_sixteen_cell_joint_search_uses_conservative_support() {
        let layout = SizedGrid::new(GridSpec {
            size: 16,
            box_rows: 4,
            box_columns: 4,
        })
        .unwrap();
        let line: Vec<_> = (0..16).collect();
        let sums = [
            Some(EqualSums::zipper(&layout, &line).unwrap()),
            Some(EqualSums::region_sum(&layout, &line, true, 0).unwrap()),
        ];
        let pairs = CoupledSums::compile(&sums);
        assert_eq!(pairs.len(), 1);
        let mut domains = [0; 256];
        for &cell in &line {
            domains[cell] = u16::MAX;
        }

        let support = pairs[0].support(&sums, &domains).unwrap();
        assert!(!support.exact);
        assert!(line.iter().all(|&cell| support.masks[cell] == u16::MAX));
    }
}
