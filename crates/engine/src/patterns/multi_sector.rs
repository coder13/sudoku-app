use std::collections::HashMap;

use super::{
    ControlFlow, Deduction, HintEvidence, House, PEERS, PatternSearch, Technique, bit_indices,
    cell_bit, cells, house_cells, rank_zero, report_eliminations,
};
use crate::{DIGITS, coordinates};

const MAX_CORE_CELLS: u32 = 20;
const MAX_ATTACHMENTS: u32 = 2;
const MAX_CACHED_COVERS: usize = 32_768;

const AXIS_MASKS: [[u128; 512]; 2] = {
    let mut masks = [[0; 512]; 2];
    let mut n = 1usize;
    while n < 512 {
        let bit = n.trailing_zeros() as usize;
        masks[0][n] = masks[0][n & (n - 1)] | house_cells(House::Row(bit));
        masks[1][n] = masks[1][n & (n - 1)] | house_cells(House::Column(bit));
        n += 1;
    }
    masks
};

pub(super) fn visit(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let positions = search.positions_by_digit();
    let active = positions.iter().fold(0, |all, &digits| all | digits);
    if active.count_ones() < 4 {
        return ControlFlow::Continue(());
    }
    let mut scan = Scan {
        positions,
        active,
        unreported: *positions,
        cache: CoverCache::default(),
    };
    let [rows_with_candidates, columns_with_candidates] = active_axes(active);
    let all_rows = rows_with_candidates[usize::from(DIGITS)];
    let all_columns = columns_with_candidates[usize::from(DIGITS)];
    let column_choices: Vec<_> = axes()
        .filter(|&columns| columns & !all_columns == 0)
        .collect();
    let mut bound = CoverBound::default();
    for rows in axes().filter(|&rows| rows & !all_rows == 0) {
        let row_cells = AXIS_MASKS[0][usize::from(rows)];
        let available = active & row_cells;
        let available_columns = columns_with_candidates[usize::from(rows)];
        bound.select_rows(positions, row_cells);
        for &columns in &column_choices {
            if columns & !available_columns != 0
                || rows & !rows_with_candidates[usize::from(columns)] != 0
            {
                continue;
            }
            let core = available & AXIS_MASKS[1][usize::from(columns)];
            let size = core.count_ones();
            if !(4..=MAX_CORE_CELLS).contains(&size)
                || bound.exceeds(columns, size + MAX_ATTACHMENTS)
            {
                continue;
            }
            scan.visit_core(core, visit)?;
        }
    }
    ControlFlow::Continue(())
}

fn axes() -> impl Iterator<Item = u16> {
    (1..=DIGITS).filter(|mask| {
        (2..=5).contains(&mask.count_ones())
            && [0b000_000_111, 0b000_111_000, 0b111_000_000]
                .into_iter()
                .filter(|group| mask & group != 0)
                .count()
                >= 2
    })
}

fn active_axes(active: u128) -> [[u16; 512]; 2] {
    let mut rows_in_column = [0; 9];
    let mut columns_in_row = [0; 9];
    for cell in cells(active) {
        let (row, column, _) = coordinates(cell);
        rows_in_column[column] |= 1 << row;
        columns_in_row[row] |= 1 << column;
    }
    [rows_in_column, columns_in_row].map(|activity| {
        let mut unions = [0; 512];
        for axis in 1usize..512 {
            unions[axis] = unions[axis & (axis - 1)] | activity[axis.trailing_zeros() as usize];
        }
        unions
    })
}

struct Scan<'a> {
    positions: &'a [u128; 9],
    active: u128,
    unreported: [u128; 9],
    cache: CoverCache,
}

impl Scan<'_> {
    fn visit_core(
        &mut self,
        core: u128,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let size = core.count_ones();
        let required = self.positions.map(|positions| positions & core);
        let mut slots = required.iter().filter(|&&positions| positions != 0).count() as u32;
        let mut covers = [0; 9];
        for (digit, positions) in required
            .into_iter()
            .enumerate()
            .filter(|&(_, positions)| positions != 0)
        {
            let houses = self.cache.minimum(positions);
            covers[digit] = houses;
            slots += houses.count_ones() - 1;
            if slots > size + MAX_ATTACHMENTS {
                return ControlFlow::Continue(());
            }
        }
        if slots < size {
            return ControlFlow::Continue(());
        }
        self.propose(core, covers, slots - size, visit)?;
        if slots == size {
            // Equal-cost covers for one digit keep the same total capacity. They
            // can explain different eliminations without a product of all choices.
            for (digit, positions) in required.into_iter().enumerate() {
                if positions == 0 {
                    continue;
                }
                let mut alternatives = Vec::new();
                self.cache.alternatives(
                    positions,
                    0,
                    covers[digit].count_ones(),
                    &mut alternatives,
                );
                for houses in alternatives
                    .into_iter()
                    .filter(|&houses| houses != covers[digit])
                {
                    let mut alternative = covers;
                    alternative[digit] = houses;
                    self.propose(core, alternative, 0, visit)?;
                }
            }
        }
        ControlFlow::Continue(())
    }

    fn propose(
        &mut self,
        core: u128,
        covers: [u32; 9],
        surplus: u32,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let mut house_digits = [0; 27];
        let mut outside = 0;
        for (digit, houses) in covers.into_iter().enumerate() {
            let mut covered = 0;
            for index in house_indices(houses) {
                house_digits[index] |= 1 << digit;
                covered |= house_cells(rank_zero::HOUSES[index]);
            }
            outside |= self.positions[digit] & !covered;
        }
        let attachments = self.active & !core & !outside;
        if attachments.count_ones() != surplus {
            return ControlFlow::Continue(());
        }
        let links: Vec<_> = rank_zero::HOUSES
            .into_iter()
            .zip(house_digits)
            .filter(|&(_, digits)| digits != 0)
            .collect();
        let body = core | attachments;
        if links.len() < 3 || !connected(body, &links, self.positions) {
            return ControlFlow::Continue(());
        }
        let Some(targets) = rank_zero::eliminations(body, &links, self.positions) else {
            return ControlFlow::Continue(());
        };
        if !targets
            .iter()
            .zip(&self.unreported)
            .any(|(&all, &unreported)| all & unreported != 0)
        {
            return ControlFlow::Continue(());
        }
        for (unreported, targets) in self.unreported.iter_mut().zip(targets) {
            *unreported &= !targets;
        }
        report_eliminations(visit, Technique::MultiSectorLockedSets, targets, || {
            HintEvidence::MultiSectorLockedSets {
                core: cells(core).collect(),
                attachments: cells(attachments).collect(),
                links: links
                    .into_iter()
                    .map(|(house, digits)| rank_zero::link(house, digits))
                    .collect(),
            }
        })
    }
}

struct CoverBound {
    row_positions: [u128; 9],
    occupied_columns: [u16; 9],
    lower_bounds: [[u8; 512]; 9],
}

impl Default for CoverBound {
    fn default() -> Self {
        Self {
            row_positions: [0; 9],
            occupied_columns: [0; 9],
            lower_bounds: [[0; 512]; 9],
        }
    }
}

impl CoverBound {
    fn select_rows(&mut self, positions: &[u128; 9], rows: u128) {
        self.row_positions = positions.map(|digit| digit & rows);
        self.occupied_columns = self.row_positions.map(occupied_columns);
        self.lower_bounds.fill([0; 512]);
    }

    // Rectangles that differ only in empty columns share the same per-digit bound.
    fn exceeds(&mut self, columns: u16, capacity: u32) -> bool {
        let mut count = 0;
        for (digit, &occupied) in self.occupied_columns.iter().enumerate() {
            let key = usize::from(columns & occupied);
            if key == 0 {
                continue;
            }
            let entry = &mut self.lower_bounds[digit][key];
            if *entry == 0 {
                let mut positions = self.row_positions[digit] & AXIS_MASKS[1][key];
                // No two selected candidates share a house, so each needs a slot.
                while positions != 0 {
                    let cell = positions.trailing_zeros() as usize;
                    positions &= !(PEERS[cell] | cell_bit(cell));
                    *entry += 1;
                }
            }
            count += u32::from(*entry);
            if count > capacity {
                return true;
            }
        }
        false
    }
}

fn occupied_columns(mut positions: u128) -> u16 {
    // A grid row occupies nine bits. Fold all nine rows into the lowest one.
    positions |= positions >> 72;
    positions |= positions >> 36;
    positions |= positions >> 18;
    positions |= positions >> 9;
    positions as u16 & DIGITS
}

fn connected(body: u128, links: &[(House, u16)], positions: &[u128; 9]) -> bool {
    let mut reached = 1 << body.trailing_zeros();
    while reached != body {
        let before = reached;
        for &(house, digits) in links {
            for digit in bit_indices(digits) {
                let covered = house_cells(house) & positions[digit] & body;
                if covered & reached != 0 {
                    reached |= covered;
                }
            }
        }
        if reached == before {
            return false;
        }
    }
    true
}

#[derive(Default)]
struct CoverCache(HashMap<u128, u32>);

impl CoverCache {
    fn minimum(&mut self, positions: u128) -> u32 {
        if positions == 0 {
            return 0;
        }
        let around_first = house_indices_at(positions.trailing_zeros() as usize);
        for index in around_first {
            if positions & !house_cells(rank_zero::HOUSES[index]) == 0 {
                return 1 << index;
            }
        }
        if let Some(&cached) = self.0.get(&positions) {
            return cached;
        }
        let mut best = u32::MAX;
        for index in around_first {
            let cover =
                (1 << index) | self.minimum(positions & !house_cells(rank_zero::HOUSES[index]));
            if cover.count_ones() < best.count_ones() {
                best = cover;
                if best.count_ones() == 2 {
                    break;
                }
            }
        }
        if self.0.len() < MAX_CACHED_COVERS {
            self.0.insert(positions, best);
        }
        best
    }

    fn alternatives(&mut self, positions: u128, selected: u32, slots: u32, found: &mut Vec<u32>) {
        if slots == 0 {
            if positions == 0 && !found.contains(&selected) {
                found.push(selected);
            }
            return;
        }
        for index in house_indices_at(positions.trailing_zeros() as usize) {
            let remaining = positions & !house_cells(rank_zero::HOUSES[index]);
            if self.minimum(remaining).count_ones() == slots - 1 {
                self.alternatives(remaining, selected | (1 << index), slots - 1, found);
            }
        }
    }
}

fn house_indices_at(cell: usize) -> [usize; 3] {
    let (row, col, group) = coordinates(cell);
    [row, 9 + col, 18 + group]
}

fn house_indices(mut mask: u32) -> impl Iterator<Item = usize> {
    std::iter::from_fn(move || {
        if mask == 0 {
            return None;
        }
        let index = mask.trailing_zeros() as usize;
        mask &= mask - 1;
        Some(index)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Candidate, Hint, HintAction};

    #[test]
    fn cover_bound_reuses_empty_columns_and_resets_when_rows_change() {
        for cell in 0..crate::CELLS {
            assert_eq!(occupied_columns(cell_bit(cell)), 1 << (cell % 9));
        }
        let mut positions = [0; 9];
        positions[0] = cell_bit(0) | cell_bit(3) | cell_bit(6) | cell_bit(30) | cell_bit(78);
        positions[2] = cell_bit(8);
        let columns = (1 << 0) | (1 << 3) | (1 << 6) | (1 << 8);
        let mut bound = CoverBound::default();
        bound.select_rows(&positions, AXIS_MASKS[0][usize::from(DIGITS)]);
        assert!(bound.exceeds(columns, 3));
        assert!(!bound.exceeds(columns | (1 << 1), 4));
        // The same column key can have a different bound for a smaller row selection.
        bound.select_rows(&positions, AXIS_MASKS[0][(1 << 0) | (1 << 3)]);
        assert!(!bound.exceeds(columns, 3));
        assert!(bound.exceeds(columns, 2));
    }

    #[test]
    fn an_attachment_must_have_every_candidate_in_the_cover() {
        let core = [0, 3, 27, 36]
            .into_iter()
            .fold(0, |set, cell| set | cell_bit(cell));
        let mut positions = [0; 9];
        for (digit, members) in [
            (0, &[0, 3, 4, 27, 36, 45][..]),
            (1, &[27, 36, 45, 63]),
            (2, &[27]),
            (3, &[0]),
            (4, &[4]),
            (8, &[63]),
        ] {
            positions[digit] = members.iter().fold(0, |set, &cell| set | cell_bit(cell));
        }

        let find = |positions: &[u128; 9]| {
            let mut scan = Scan {
                positions,
                active: positions.iter().fold(0, |all, &digit| all | digit),
                unreported: *positions,
                cache: CoverCache::default(),
            };
            scan.visit_core(core, &mut ControlFlow::Break)
                .break_value()
                .map(Hint::from)
        };
        let hint = find(&positions).unwrap();
        assert!(
            matches!(hint.evidence, HintEvidence::MultiSectorLockedSets { attachments, .. } if attachments == [45])
        );
        assert_eq!(
            hint.actions,
            [(0, 1), (4, 1), (63, 2)]
                .map(|(cell, digit)| HintAction::Eliminate(Candidate { cell, digit }))
        );

        positions[8] |= cell_bit(45);
        assert!(find(&positions).is_none());
    }
}
