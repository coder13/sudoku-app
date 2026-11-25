use super::{CompiledVariant, cell_mask, digit_set_support};
use crate::DIGITS;

const MAX_SIDE: usize = 5;

#[derive(Clone, Debug)]
pub(super) struct InsideGrid {
    size: usize,
    houses: Vec<[usize; MAX_SIDE]>,
}

impl InsideGrid {
    pub(super) fn compile(puzzle: &mut CompiledVariant, rows: &[Vec<usize>]) -> Option<Self> {
        let size = rows.len();
        if !(2..=MAX_SIDE).contains(&size) || rows.iter().any(|row| row.len() != size) {
            return None;
        }
        let cells: Vec<_> = rows.iter().flatten().copied().collect();
        cell_mask(&cells)?;
        let point = |cell: usize| ((cell / 9) as isize, (cell % 9) as isize);
        let (r, c) = point(rows[0][0]);
        let (right_r, right_c) = point(rows[0][1]);
        let (down_r, down_c) = point(rows[1][0]);
        let [dr, dc, rr, rc] = [down_r - r, down_c - c, right_r - r, right_c - c];
        if [dr, dc, rr, rc].iter().any(|step| step.abs() != 1) || dr * rr + dc * rc != 0 {
            return None;
        }
        for (i, row) in rows.iter().enumerate() {
            for (j, &cell) in row.iter().enumerate() {
                let (i, j) = (i as isize, j as isize);
                if point(cell) != (r + dr * i + rr * j, c + dc * i + rc * j) {
                    return None;
                }
            }
        }
        let mut houses = Vec::with_capacity(2 * size);
        for i in 0..size {
            let row = std::array::from_fn(|j| i * size + j);
            let col = std::array::from_fn(|j| j * size + i);
            for house in [row, col] {
                let peers = house[..size]
                    .iter()
                    .fold(0, |mask, &index| mask | (1 << cells[index]));
                puzzle.add_peers(peers);
                houses.push(house);
            }
        }
        Some(Self { size, houses })
    }

    pub(super) fn support(&self, domains: &[u16], supported: &mut [u16]) {
        if domains.iter().all(|&mask| mask == DIGITS) {
            supported.fill(DIGITS);
            return;
        }
        let required = domains
            .iter()
            .filter(|mask| mask.is_power_of_two())
            .fold(0, |mask, &digit| mask | digit);
        let allowed = self.houses.iter().fold(DIGITS, |allowed, house| {
            allowed
                & house[..self.size]
                    .iter()
                    .fold(0, |mask, &cell| mask | domains[cell])
        });
        if required & !allowed != 0 {
            return;
        }
        let optional = allowed & !required;
        let mut extra = optional;
        loop {
            let set = required | extra;
            if set.count_ones() as usize == self.size
                && self.collect_set(set, domains, supported)
                && supported == domains
            {
                return;
            }
            if extra == 0 {
                return;
            }
            extra = (extra - 1) & optional;
        }
    }

    fn collect_set(&self, set: u16, domains: &[u16], supported: &mut [u16]) -> bool {
        let mut masks = [0; MAX_SIDE * MAX_SIDE];
        for (mask, domain) in masks.iter_mut().zip(domains) {
            *mask = domain & set;
        }
        // Rows and columns must both have a perfect matching with this set.
        // Repeat until removing an edge in one house stops affecting another.
        loop {
            let mut changed = false;
            for house in &self.houses {
                let indices = &house[..self.size];
                let mut local = [0; MAX_SIDE];
                for (local, &cell) in local.iter_mut().zip(indices) {
                    *local = masks[cell];
                }
                let local = &local[..self.size];
                if local.iter().all(|&mask| mask == set) {
                    continue;
                }
                let mut allowed = [0; MAX_SIDE];
                if !digit_set_support(set, local, &mut allowed[..self.size]) {
                    return false;
                }
                for (&index, mask) in indices.iter().zip(allowed) {
                    changed |= masks[index] != mask;
                    masks[index] = mask;
                }
            }
            if !changed {
                break;
            }
        }
        for (out, mask) in supported.iter_mut().zip(masks) {
            *out |= mask;
        }
        true
    }
}
