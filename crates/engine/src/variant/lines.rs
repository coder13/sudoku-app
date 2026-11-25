mod group_sums;
pub(super) mod groups;
mod inside_grid;
pub(super) mod ray_houses;
pub(super) mod region_sums;
pub(super) mod renban_sum;

pub(super) use group_sums::{
    DisjointGroupSum, GroupSumChain, GroupSumHouse, GroupSumPhase, ModularSum, compile_line_sums,
};

use std::{collections::HashMap, ops::Range};

use super::{
    ClueDirection, CompiledVariant, PuzzleRule, VariantDefinitionError, VariantHouseKind,
    VariantTechnique, cell_mask,
};
use crate::{
    CELLS, DIGITS,
    hints::{digit_bit, digits},
};

#[derive(Clone, Debug)]
pub(super) struct LineConstraint {
    pub cells: Vec<usize>,
    pub technique: VariantTechnique,
    pub rule_index: usize,
    kind: LineKind,
}

#[derive(Clone, Debug)]
enum LineKind {
    EqualSums {
        parts: Vec<Range<usize>>,
        distinct_parts: bool,
    },
    PillArrow,
    Sum(u16),
    Renban,
    ConsecutiveRun {
        from_bulb: bool,
    },
    DistinctCells,
    InsideGrid(inside_grid::InsideGrid),
    ThreeGroups(groups::GroupLine),
    DigitOrder {
        digits: Vec<u8>,
    },
    ForbiddenEntropicConnection,
    Between,
    Lockout,
    Outside(OutsideClue),
}

#[derive(Clone, Copy, Debug)]
enum OutsideClue {
    Sandwich(u8),
    XSum(u8),
    Skyscrapers(u8),
}

impl LineConstraint {
    pub(super) fn region_sum_parts(&self) -> Option<&[Range<usize>]> {
        match &self.kind {
            LineKind::EqualSums { parts, .. } if self.technique == VariantTechnique::RegionSum => {
                Some(parts)
            }
            _ => None,
        }
    }

    pub fn little_killer_sum(&self) -> Option<u16> {
        match self.kind {
            LineKind::Sum(total) => Some(total),
            _ => None,
        }
    }

    pub(super) fn group_line(&self) -> Option<&groups::GroupLine> {
        match &self.kind {
            LineKind::ThreeGroups(line) => Some(line),
            _ => None,
        }
    }

    pub fn compile(
        puzzle: &mut CompiledVariant,
        index: usize,
        rule: &PuzzleRule,
        enforce_regions: bool,
    ) -> Result<Self, VariantDefinitionError> {
        let invalid = VariantDefinitionError::InvalidRule(index);
        let (cells, kind, technique) = match rule {
            PuzzleRule::Arrow { circle, cells } => {
                if !(1..=9).contains(&cells.len()) {
                    return Err(invalid);
                }
                let cells: Vec<_> = std::iter::once(*circle)
                    .chain(cells.iter().copied())
                    .collect();
                let ranges = vec![0..1, 1..cells.len()];
                (
                    cells,
                    LineKind::EqualSums {
                        parts: ranges,
                        distinct_parts: false,
                    },
                    VariantTechnique::Arrow,
                )
            }
            PuzzleRule::PillArrow { pill, cells, .. } => {
                let [tens, ones] = *pill;
                if cells.is_empty()
                    || (tens / 9).abs_diff(ones / 9) > 1
                    || (tens % 9).abs_diff(ones % 9) > 1
                {
                    return Err(invalid);
                }
                let cells = pill.iter().chain(cells).copied().collect();
                (cells, LineKind::PillArrow, VariantTechnique::PillArrow)
            }
            PuzzleRule::Renban { cells, segments } => {
                if !(1..=9).contains(&cells.len()) || !super::drawing_paths_cover(cells, segments) {
                    return Err(invalid);
                }
                puzzle.add_peers(cell_mask(cells).ok_or(invalid)?);
                (cells.clone(), LineKind::Renban, VariantTechnique::Renban)
            }
            PuzzleRule::ConsecutiveRun { cells, color, .. }
            | PuzzleRule::DistinctCells { cells, color } => {
                let run = matches!(rule, PuzzleRule::ConsecutiveRun { .. });
                let maximum = if run { 9 } else { 8 };
                if !(2..=maximum).contains(&cells.len())
                    || color.as_deref().is_some_and(|color| {
                        !matches!(color.len(), 4 | 5 | 7 | 9)
                            || !color.starts_with('#')
                            || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
                    })
                {
                    return Err(invalid);
                }
                puzzle.add_peers(cell_mask(cells).ok_or(invalid)?);
                let (kind, technique) = match rule {
                    PuzzleRule::ConsecutiveRun { from_bulb, .. } => (
                        LineKind::ConsecutiveRun {
                            from_bulb: *from_bulb,
                        },
                        VariantTechnique::ConsecutiveRun,
                    ),
                    _ => (LineKind::DistinctCells, VariantTechnique::DistinctCells),
                };
                (cells.clone(), kind, technique)
            }
            PuzzleRule::InsideGrid { rows } => {
                let grid = inside_grid::InsideGrid::compile(puzzle, rows).ok_or(invalid)?;
                (
                    rows.iter().flatten().copied().collect(),
                    LineKind::InsideGrid(grid),
                    VariantTechnique::InsideGrid,
                )
            }
            PuzzleRule::Entropic { cells } | PuzzleRule::Modular { cells } => {
                let (partition, technique) = if matches!(rule, PuzzleRule::Entropic { .. }) {
                    (groups::DigitGroups::Entropic, VariantTechnique::Entropic)
                } else {
                    (groups::DigitGroups::Modular, VariantTechnique::Modular)
                };
                let (cells, line) = groups::GroupLine::compile(cells, partition).ok_or(invalid)?;
                // Different phases cannot contain the same digit. Equal phases
                // share only a digit group and remain free to repeat digits.
                for (i, &a) in cells.iter().enumerate() {
                    for (j, &b) in cells.iter().enumerate() {
                        if line.different_phases(i, j) {
                            puzzle.peers[a] |= 1 << b;
                        }
                    }
                }
                (cells, LineKind::ThreeGroups(line), technique)
            }
            PuzzleRule::DigitOrder { cells, digits } => {
                let row = cells.first().map(|cell| cell / 9).ok_or(invalid)?;
                let column = cells.first().map(|cell| cell % 9).ok_or(invalid)?;
                let is_row = cells.iter().all(|cell| cell / 9 == row)
                    && (cells
                        .iter()
                        .enumerate()
                        .all(|(index, cell)| *cell == row * 9 + index)
                        || cells
                            .iter()
                            .enumerate()
                            .all(|(index, cell)| *cell == row * 9 + 8 - index));
                let is_column = cells.iter().all(|cell| cell % 9 == column)
                    && (cells
                        .iter()
                        .enumerate()
                        .all(|(index, cell)| *cell == index * 9 + column)
                        || cells
                            .iter()
                            .enumerate()
                            .all(|(index, cell)| *cell == (8 - index) * 9 + column));
                if cells.len() != 9
                    || (!is_row && !is_column)
                    || digits.len() != 3
                    || !matches!(digits.as_slice(), [1, 2, 3] | [4, 5, 6] | [7, 8, 9])
                {
                    return Err(invalid);
                }
                (
                    cells.clone(),
                    LineKind::DigitOrder {
                        digits: digits.clone(),
                    },
                    VariantTechnique::DigitOrder,
                )
            }
            PuzzleRule::ForbiddenEntropicConnection { cells } => {
                let connected = cells.windows(2).all(|pair| {
                    (pair[0] / 9).abs_diff(pair[1] / 9) + (pair[0] % 9).abs_diff(pair[1] % 9) == 1
                });
                if !connected {
                    return Err(invalid);
                }
                (
                    cells.to_vec(),
                    LineKind::ForbiddenEntropicConnection,
                    VariantTechnique::Entropic,
                )
            }
            PuzzleRule::Between { cells } => {
                if cells.len() < 3 {
                    return Err(invalid);
                }
                (cells.clone(), LineKind::Between, VariantTechnique::Between)
            }
            PuzzleRule::Lockout { cells } => {
                if cells.len() < 2 {
                    return Err(invalid);
                }
                (cells.clone(), LineKind::Lockout, VariantTechnique::Lockout)
            }
            PuzzleRule::RegionSum {
                cells,
                group_by_region,
                segments,
            } => {
                if !super::drawing_paths_cover(cells, segments) {
                    return Err(invalid);
                }
                cell_mask(cells).ok_or(invalid)?;
                if cells
                    .iter()
                    .any(|&cell| puzzle.primary_region(cell).is_none())
                {
                    return Err(invalid);
                }
                let mut cells = cells.clone();
                let segments = region_sum_ranges(
                    &mut cells,
                    |cell| puzzle.primary_region(cell).unwrap(),
                    *group_by_region,
                );
                // A line within one region still has a visible path. Its sole
                // group already satisfies equality of the group totals.
                let distinct_parts = enforce_regions
                    && segments.len() > 1
                    && segments.iter().any(|part| part.len() > 1);
                (
                    cells,
                    LineKind::EqualSums {
                        parts: segments,
                        distinct_parts,
                    },
                    VariantTechnique::RegionSum,
                )
            }
            PuzzleRule::LittleKiller {
                cells,
                direction,
                sum,
            } => {
                if !valid_ray(cells, *direction, true)
                    || !(cells.len() as u16..=9 * cells.len() as u16).contains(sum)
                {
                    return Err(invalid);
                }
                (
                    cells.clone(),
                    LineKind::Sum(*sum),
                    VariantTechnique::LittleKiller,
                )
            }
            PuzzleRule::Sandwich {
                cells,
                direction,
                sum,
            } => {
                if *sum > 35 || !valid_ray(cells, *direction, false) {
                    return Err(invalid);
                }
                (
                    cells.clone(),
                    LineKind::Outside(OutsideClue::Sandwich(*sum as u8)),
                    VariantTechnique::Sandwich,
                )
            }
            PuzzleRule::XSum {
                cells,
                direction,
                sum,
            } => {
                if !(1..=45).contains(sum) || !valid_ray(cells, *direction, false) {
                    return Err(invalid);
                }
                (
                    cells.clone(),
                    LineKind::Outside(OutsideClue::XSum(*sum as u8)),
                    VariantTechnique::XSum,
                )
            }
            PuzzleRule::Skyscrapers {
                cells,
                direction,
                count,
            } => {
                if !(1..=9).contains(count) || !valid_ray(cells, *direction, false) {
                    return Err(invalid);
                }
                (
                    cells.clone(),
                    LineKind::Outside(OutsideClue::Skyscrapers(*count)),
                    VariantTechnique::Skyscrapers,
                )
            }
            _ => unreachable!("other constraints compile separately"),
        };
        cell_mask(&cells).ok_or(invalid)?;
        Ok(Self {
            cells,
            kind,
            technique,
            rule_index: index,
        })
    }

    pub(super) fn group_phases(&self) -> Option<(&[usize], [u16; 3])> {
        let LineKind::ThreeGroups(line) = &self.kind else {
            return None;
        };
        let (phases, partition) = line.phases()?;
        Some((phases, partition.masks()))
    }

    pub fn visit_group_house_removals(
        &self,
        puzzle: &CompiledVariant,
        domains: &[u16],
        basic_support: &[u16],
        mut visit: impl FnMut(VariantHouseKind, [usize; 2], [u16; 2], [u16; 2]),
    ) {
        let LineKind::ThreeGroups(line) = &self.kind else {
            return;
        };
        if basic_support.contains(&0) {
            return;
        }
        for (i, &a) in self.cells.iter().enumerate() {
            for (j, &b) in self.cells.iter().enumerate().skip(i + 1) {
                if puzzle.peers[a] & (1u128 << b) == 0 {
                    continue;
                }
                let pair_domains = [domains[i], domains[j]];
                let [left, right] = line.house_pair_removals(i, j, pair_domains);
                let removals = [left & basic_support[i], right & basic_support[j]];
                if removals == [0, 0] || left == pair_domains[0] || right == pair_domains[1] {
                    continue;
                }
                if let Some(house) = puzzle.shared_enforced_house(a, &[b]) {
                    visit(house, [a, b], pair_domains, removals);
                }
            }
        }
    }

    pub fn visit_group_house_triplets(
        &self,
        puzzle: &CompiledVariant,
        domains: &[u16; CELLS],
        basic_support: &[u16],
        narrow: u128,
        mut visit: impl FnMut(VariantHouseKind, [usize; 4], [u16; 4], u16),
    ) {
        let LineKind::ThreeGroups(line) = &self.kind else {
            return;
        };
        if self.cells.len() < 3 || basic_support.contains(&0) {
            return;
        }
        let scope = self
            .cells
            .iter()
            .fold(0, |mask, &cell| mask | (1u128 << cell));
        let outside = narrow & !scope;
        if outside == 0 {
            return;
        }
        for &house in &puzzle.search_houses {
            let shared = puzzle.house_masks[house] & scope;
            let third = puzzle.house_masks[house] & outside;
            if shared.count_ones() < 2 || third == 0 {
                continue;
            }
            for (i, &a) in self.cells.iter().enumerate() {
                if shared & (1u128 << a) == 0 {
                    continue;
                }
                for (j, &b) in self.cells.iter().enumerate().skip(i + 1) {
                    if shared & (1u128 << b) == 0 || !line.different_phases(i, j) {
                        continue;
                    }
                    for other in super::cells_in(third) {
                        if domains[other] & !(domains[a] | domains[b]) != 0 {
                            continue;
                        }
                        let blocked = line.house_triplet_removals(
                            i,
                            j,
                            [domains[a], domains[b], domains[other]],
                        );
                        if blocked == 0 {
                            continue;
                        }
                        for (target, &cell) in self.cells.iter().enumerate() {
                            let removals = basic_support[target] & blocked;
                            if removals != 0
                                && removals != basic_support[target]
                                && line.different_phases(target, i)
                                && line.different_phases(target, j)
                            {
                                visit(
                                    puzzle.houses[house].kind,
                                    [cell, a, b, other],
                                    [domains[cell], domains[a], domains[b], domains[other]],
                                    removals,
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    pub(super) fn supports_distinct_sums(&self) -> bool {
        matches!(
            self.kind,
            LineKind::EqualSums {
                distinct_parts: true,
                ..
            }
        )
    }

    pub(super) fn support_exact(&self, domains: &[u16], support: &mut [u16]) {
        if let LineKind::EqualSums {
            parts,
            distinct_parts: true,
        } = &self.kind
        {
            if !domains.contains(&0) {
                region_sums::distinct_support(parts, domains, support);
            }
        } else {
            self.support(domains, support);
        }
    }

    // Domains and support are in the same order as cells.
    pub fn support(&self, domains: &[u16], support: &mut [u16]) {
        debug_assert_eq!(domains.len(), self.cells.len());
        debug_assert_eq!(support.len(), domains.len());
        if domains.contains(&0) {
            return;
        }
        match &self.kind {
            LineKind::EqualSums {
                parts: segments, ..
            } => {
                let totals = segments.iter().fold(u128::MAX, |totals, range| {
                    totals & reachable(&domains[range.clone()])
                });
                if totals != 0 {
                    for range in segments {
                        sum_support(&domains[range.clone()], totals, &mut support[range.clone()]);
                    }
                }
            }
            LineKind::PillArrow => pill_arrow_support(domains, support),
            LineKind::Sum(total) => sum_support(domains, 1 << total, support),
            LineKind::Renban => renban_support::<9, 512>(domains, support),
            LineKind::ConsecutiveRun { from_bulb } => {
                consecutive_run_support(domains, support, *from_bulb)
            }
            LineKind::InsideGrid(grid) => grid.support(domains, support),
            LineKind::DistinctCells => {
                let union = domains.iter().fold(0, |union, mask| union | mask);
                let mut set = union;
                while set != 0 {
                    if set.count_ones() as usize == domains.len() {
                        digit_set_support(set, domains, support);
                        if support == domains {
                            break;
                        }
                    }
                    set = (set - 1) & union;
                }
            }
            LineKind::ThreeGroups(line) => line.support(domains, support),
            LineKind::DigitOrder { digits } => digit_order_support(digits, domains, support),
            LineKind::ForbiddenEntropicConnection => {
                forbidden_entropic_connection_support(domains, support)
            }
            LineKind::Between => endpoint_support(domains, support, false),
            LineKind::Lockout => endpoint_support(domains, support, true),
            LineKind::Outside(clue) => {
                if domains.iter().all(|mask| mask.is_power_of_two()) {
                    if clue.permits_fixed_row(domains) {
                        for (supported, &domain) in support.iter_mut().zip(domains) {
                            *supported |= domain;
                        }
                    }
                } else {
                    clue.record_support(DIGITS, [0, 0], domains, support, &mut HashMap::new());
                }
            }
        }
    }
}

fn digit_order_transition(digits: &[u8], state: usize, digit: u8) -> Option<usize> {
    match digits.iter().position(|&ordered| ordered == digit) {
        Some(position) if position == state => Some(state + 1),
        Some(_) => None,
        None => Some(state),
    }
}

/// A break is valid when joining its neighboring segments would fail either crossing triple.
fn forbidden_entropic_connection_support(domains: &[u16], support: &mut [u16]) {
    debug_assert_eq!(domains.len(), 4);
    for a in 1..=9 {
        let a_bit = 1 << (a - 1);
        if domains[0] & a_bit == 0 {
            continue;
        }
        for b in 1..=9 {
            let b_bit = 1 << (b - 1);
            if domains[1] & b_bit == 0 {
                continue;
            }
            for c in 1..=9 {
                let c_bit = 1 << (c - 1);
                if domains[2] & c_bit == 0 {
                    continue;
                }
                let first_is_entropic = (a - 1) / 3 != (b - 1) / 3
                    && (a - 1) / 3 != (c - 1) / 3
                    && (b - 1) / 3 != (c - 1) / 3;
                for d in 1..=9 {
                    let d_bit = 1 << (d - 1);
                    if domains[3] & d_bit == 0 {
                        continue;
                    }
                    let second_is_entropic = (b - 1) / 3 != (c - 1) / 3
                        && (b - 1) / 3 != (d - 1) / 3
                        && (c - 1) / 3 != (d - 1) / 3;
                    if !first_is_entropic || !second_is_entropic {
                        support[0] |= a_bit;
                        support[1] |= b_bit;
                        support[2] |= c_bit;
                        support[3] |= d_bit;
                    }
                }
            }
        }
    }
}

/// Keep only assignments where every selected digit occurs once in ascending path order.
fn digit_order_support(digits: &[u8], domains: &[u16], support: &mut [u16]) {
    let states = digits.len() + 1;
    let mut forward = vec![vec![false; states]; domains.len() + 1];
    forward[0][0] = true;
    for (index, &domain) in domains.iter().enumerate() {
        for state in 0..states {
            if !forward[index][state] {
                continue;
            }
            for digit in 1..=9 {
                if domain & (1 << (digit - 1)) == 0 {
                    continue;
                }
                if let Some(next) = digit_order_transition(digits, state, digit) {
                    forward[index + 1][next] = true;
                }
            }
        }
    }

    let mut backward = vec![vec![false; states]; domains.len() + 1];
    backward[domains.len()][digits.len()] = true;
    for index in (0..domains.len()).rev() {
        for state in 0..states {
            for digit in 1..=9 {
                if domains[index] & (1 << (digit - 1)) == 0 {
                    continue;
                }
                if digit_order_transition(digits, state, digit)
                    .is_some_and(|next| backward[index + 1][next])
                {
                    backward[index][state] = true;
                    break;
                }
            }
        }
    }

    if !forward[domains.len()][digits.len()] {
        return;
    }
    for (index, &domain) in domains.iter().enumerate() {
        for state in 0..states {
            if !forward[index][state] {
                continue;
            }
            for digit in 1..=9 {
                let mask = 1 << (digit - 1);
                if domain & mask == 0 {
                    continue;
                }
                if digit_order_transition(digits, state, digit)
                    .is_some_and(|next| backward[index + 1][next])
                {
                    support[index] |= mask;
                }
            }
        }
    }
}

#[cfg(test)]
mod digit_order_tests {
    use super::*;

    fn enumerate(digits: &[u8], domains: &[u16]) -> Vec<u16> {
        fn visit(
            digits: &[u8],
            domains: &[u16],
            index: usize,
            state: usize,
            assignment: &mut Vec<u8>,
            support: &mut [u16],
        ) {
            if index == domains.len() {
                if state == digits.len() {
                    for (slot, digit) in support.iter_mut().zip(assignment.iter()) {
                        *slot |= digit_bit(*digit);
                    }
                }
                return;
            }
            for digit in 1..=9 {
                if domains[index] & digit_bit(digit) == 0 {
                    continue;
                }
                if let Some(next) = digit_order_transition(digits, state, digit) {
                    assignment.push(digit);
                    visit(digits, domains, index + 1, next, assignment, support);
                    assignment.pop();
                }
            }
        }
        let mut support = vec![0; domains.len()];
        visit(digits, domains, 0, 0, &mut Vec::new(), &mut support);
        support
    }

    #[test]
    fn candidate_support_matches_exhaustive_assignments() {
        let digits = [1, 2];
        let domains: Vec<u16> = (1..8).collect();
        for a in &domains {
            for b in &domains {
                for c in &domains {
                    let input = [*a, *b, *c];
                    let mut actual = [0; 3];
                    digit_order_support(&digits, &input, &mut actual);
                    assert_eq!(
                        actual.as_slice(),
                        enumerate(&digits, &input).as_slice(),
                        "{input:?}"
                    );
                }
            }
        }
    }
}

pub(crate) fn renban_support<const N: usize, const CACHE: usize>(
    domains: &[u16],
    support: &mut [u16],
) {
    match *domains {
        [single] => support[0] = single,
        [a, b] => support.copy_from_slice(&[a & (b << 1 | b >> 1), b & (a << 1 | a >> 1)]),
        [a, b, c] => {
            // For each ascending order of the cells, align all three masks
            // with the smallest digit. Shift the matches back to each cell.
            let abc = a & (b >> 1) & (c >> 2);
            let acb = a & (c >> 1) & (b >> 2);
            let bac = b & (a >> 1) & (c >> 2);
            let bca = b & (c >> 1) & (a >> 2);
            let cab = c & (a >> 1) & (b >> 2);
            let cba = c & (b >> 1) & (a >> 2);
            support.copy_from_slice(&[
                abc | acb | ((bac | cab) << 1) | ((bca | cba) << 2),
                bac | bca | ((abc | cba) << 1) | ((acb | cab) << 2),
                cab | cba | ((acb | bca) << 1) | ((abc | bac) << 2),
            ]);
        }
        _ => {
            let len = domains.len();
            let mut matches = [0; N];
            for first in 0..=N - len {
                let interval = ((1 << len) - 1) << first;
                super::search::record_support(interval, domains, &mut matches, &mut [None; CACHE]);
            }
            support.copy_from_slice(&matches[..len]);
        }
    }
}

/// Support an ordered sequence that can increase from either end.
fn consecutive_run_support(domains: &[u16], support: &mut [u16], from_bulb: bool) {
    let length = domains.len();
    let directions: &[bool] = if from_bulb { &[false] } else { &[false, true] };
    for first in 0..=9 - length {
        for &reverse in directions {
            let digit_at = |i| 1u16 << (first + if reverse { length - 1 - i } else { i });
            if domains
                .iter()
                .enumerate()
                .all(|(i, domain)| domain & digit_at(i) != 0)
            {
                for (i, mask) in support.iter_mut().enumerate() {
                    *mask |= digit_at(i);
                }
            }
        }
    }
}

/// Record all edges of perfect matchings for each possible consecutive interval.
/// Wider grids use matching and reachability to avoid exponential digit caches.
pub(crate) fn wide_renban_support(size: usize, domains: &[u16], support: &mut [u16]) {
    let length = domains.len();
    let full_interval = u16::MAX >> (u16::BITS as usize - length);
    for start in 0..=size - length {
        let interval = full_interval << start;
        digit_set_support(interval, domains, support);
        if support == domains {
            break;
        }
    }
}

/// Add candidate edges that belong to a perfect matching with this digit set.
pub(crate) fn digit_set_support(set: u16, domains: &[u16], support: &mut [u16]) -> bool {
    let length = domains.len();
    debug_assert_eq!(length, set.count_ones() as usize);
    let mut owners = [usize::MAX; u16::BITS as usize];
    if !(0..length).all(|cell| match_digit(domains, set, cell, &mut owners, &mut 0)) {
        return false;
    }

    let reachable = &mut [0u16; u16::BITS as usize][..length];
    for (cell, (links, domain)) in reachable.iter_mut().zip(domains).enumerate() {
        *links = 1 << cell;
        for digit in digits(domain & set) {
            *links |= 1 << owners[usize::from(digit - 1)];
        }
    }
    for pivot in 0..length {
        let through = reachable[pivot];
        for links in reachable.iter_mut() {
            if *links & (1 << pivot) != 0 {
                *links |= through;
            }
        }
    }
    for (cell, (mask, domain)) in support.iter_mut().zip(domains).enumerate() {
        for digit in digits(domain & set) {
            // This edge can appear when it closes an alternating cycle.
            if reachable[owners[usize::from(digit - 1)]] & (1 << cell) != 0 {
                *mask |= digit_bit(digit);
            }
        }
    }
    true
}

fn match_digit(
    domains: &[u16],
    interval: u16,
    cell: usize,
    owners: &mut [usize; u16::BITS as usize],
    visited: &mut u16,
) -> bool {
    let mut available = domains[cell] & interval;
    while available & !*visited != 0 {
        let digit = (available & !*visited).trailing_zeros() as usize;
        let bit = 1 << digit;
        *visited |= bit;
        available &= !bit;
        if owners[digit] == usize::MAX
            || match_digit(domains, interval, owners[digit], owners, visited)
        {
            owners[digit] = cell;
            return true;
        }
    }
    false
}

// A ray must start on the edge, follow the declared direction and run to the
// opposite edge. This also bounds the length of each sum passed to the bitset.
pub(super) fn valid_ray(cells: &[usize], direction: ClueDirection, diagonal: bool) -> bool {
    let (dr, dc) = direction.delta();
    if (dr != 0 && dc != 0) != diagonal {
        return false;
    }
    let Some(&first) = cells.first().filter(|&&first| first < CELLS) else {
        return false;
    };
    let (mut r, mut c) = ((first / 9) as i8, (first % 9) as i8);
    let in_grid = |r, c| (0..9).contains(&r) && (0..9).contains(&c);
    if in_grid(r - dr, c - dc) {
        return false;
    }
    for &cell in cells {
        if !in_grid(r, c) || cell != 9 * r as usize + c as usize {
            return false;
        }
        r += dr;
        c += dc;
    }
    !in_grid(r, c)
}

/// Partition a line into consecutive region visits or one group per region.
pub(crate) fn region_sum_ranges(
    cells: &mut [usize],
    region: impl Fn(usize) -> usize,
    group_by_region: bool,
) -> Vec<Range<usize>> {
    if group_by_region {
        cells.sort_by_key(|&cell| region(cell));
    }
    let mut start = 0;
    cells
        .chunk_by(|&a, &b| region(a) == region(b))
        .map(|run| {
            let range = start..start + run.len();
            start = range.end;
            range
        })
        .collect()
}

fn add_value<const WORDS: usize>(
    sums: [u128; WORDS],
    domain: u16,
    value_offset: u8,
) -> [u128; WORDS] {
    let mut next = [0; WORDS];
    for digit in digits(domain) {
        let value = u32::from(digit - value_offset);
        for word in 0..WORDS {
            next[word] |= sums[word] << value;
            if word > 0 && value != 0 {
                next[word] |= sums[word - 1] >> (128 - value);
            }
        }
    }
    next
}

fn reachable(domains: &[u16]) -> u128 {
    reachable_sums::<1>(domains)[0]
}

pub(crate) fn reachable_sums<const WORDS: usize>(domains: &[u16]) -> [u128; WORDS] {
    reachable_sums_with_offset(domains, 0)
}

pub(crate) fn reachable_sums_with_offset<const WORDS: usize>(
    domains: &[u16],
    value_offset: u8,
) -> [u128; WORDS] {
    let mut empty = [0; WORDS];
    empty[0] = 1;
    domains
        .iter()
        .copied()
        .fold(empty, |sums, domain| add_value(sums, domain, value_offset))
}

pub(super) fn sum_support(domains: &[u16], totals: u128, support: &mut [u16]) {
    sum_support_with_prefix(domains, [totals], support, &mut [[0]; 10]);
}

pub(crate) fn sum_support_with_prefix<const WORDS: usize>(
    domains: &[u16],
    totals: [u128; WORDS],
    support: &mut [u16],
    prefix: &mut [[u128; WORDS]],
) -> [u128; WORDS] {
    sum_support_with_prefix_and_offset(domains, totals, support, prefix, 0)
}

pub(crate) fn sum_support_with_prefix_and_offset<const WORDS: usize>(
    domains: &[u16],
    totals: [u128; WORDS],
    support: &mut [u16],
    prefix: &mut [[u128; WORDS]],
    value_offset: u8,
) -> [u128; WORDS] {
    prefix[0] = [0; WORDS];
    prefix[0][0] = 1;
    for (i, &domain) in domains.iter().enumerate() {
        prefix[i + 1] = add_value(prefix[i], domain, value_offset);
    }
    let matched: [u128; WORDS] =
        std::array::from_fn(|word| prefix[domains.len()][word] & totals[word]);
    if matched.iter().all(|&word| word == 0) {
        return matched;
    }

    // Move from the allowed totals back toward the empty prefix. A digit
    // has support if its shift matches a reachable sum before this cell.
    let mut allowed = totals;
    for (i, &domain) in domains.iter().enumerate().rev() {
        let mut previous = [0; WORDS];
        let mut supported = 0;
        for digit in digits(domain) {
            let value = u32::from(digit - value_offset);
            let mut fits = false;
            for word in 0..WORDS {
                let mut shifted = allowed[word] >> value;
                if word + 1 < WORDS {
                    if value != 0 {
                        shifted |= allowed[word + 1] << (128 - value);
                    }
                }
                fits |= prefix[i][word] & shifted != 0;
                previous[word] |= shifted;
            }
            if fits {
                supported |= digit_bit(digit);
            }
        }
        support[i] = supported;
        allowed = previous;
    }
    matched
}

fn pill_arrow_support(domains: &[u16], support: &mut [u16]) {
    let ones = u128::from(domains[1]);
    let shift = |tens: u8| 10 * tens + 1;
    let totals = digits(domains[0]).fold(0, |totals, tens| totals | (ones << shift(tens)));
    let [matched] = sum_support_with_prefix(
        &domains[2..],
        [totals],
        &mut support[2..],
        &mut [[0]; CELLS],
    );
    for tens in digits(domains[0]) {
        let trailing = ((matched >> shift(tens)) & ones) as u16;
        if trailing != 0 {
            support[0] |= digit_bit(tens);
            support[1] |= trailing;
        }
    }
}

fn endpoint_support(domains: &[u16], support: &mut [u16], lockout: bool) {
    let last = domains.len() - 1;
    for left in digits(domains[0]) {
        for right in digits(domains[last]) {
            let lower = left.min(right);
            let upper = left.max(right);
            let interior = if lockout {
                if upper - lower < 4 {
                    continue;
                }
                (digit_bit(lower) - 1) | (DIGITS & !((1 << upper) - 1))
            } else {
                (digit_bit(upper) - 1) & !((1 << lower) - 1)
            };
            if domains[1..last]
                .iter()
                .any(|&domain| domain & interior == 0)
            {
                continue;
            }
            support[0] |= digit_bit(left);
            support[last] |= digit_bit(right);
            for i in 1..last {
                support[i] |= domains[i] & interior;
            }
        }
    }
}

impl OutsideClue {
    // A fixed row has only one sequence to check. Reuse the same transitions
    // as the candidate search without building a memo table.
    fn permits_fixed_row(self, domains: &[u16]) -> bool {
        let mut remaining = DIGITS;
        let mut state = [0, 0];
        for &bit in domains {
            if remaining & bit == 0 {
                return false;
            }
            let digit = bit.trailing_zeros() as u8 + 1;
            let Some(next) = self.advance(remaining, digit, state) else {
                return false;
            };
            remaining ^= bit;
            state = next;
        }
        remaining == 0
    }

    // Every row or column is a permutation of 1–9. The digits remaining and
    // the incremental clue state determine which suffixes are possible.
    fn record_support(
        self,
        remaining: u16,
        state: [u8; 2],
        domains: &[u16],
        support: &mut [u16],
        cache: &mut HashMap<(u16, [u8; 2]), bool>,
    ) -> bool {
        if remaining == 0 {
            return true;
        }
        if let Some(&found) = cache.get(&(remaining, state)) {
            return found;
        }
        let cell = domains.len() - remaining.count_ones() as usize;
        let mut found = false;
        for digit in digits(domains[cell] & remaining) {
            let bit = digit_bit(digit);
            if let Some(next) = self.advance(remaining, digit, state)
                && self.record_support(remaining ^ bit, next, domains, support, cache)
            {
                support[cell] |= bit;
                found = true;
            }
        }
        cache.insert((remaining, state), found);
        found
    }

    fn advance(self, remaining: u16, digit: u8, [value, length]: [u8; 2]) -> Option<[u8; 2]> {
        const BREAD: u16 = 0b100000001;
        let bit = digit_bit(digit);
        match self {
            Self::Sandwich(target) if (remaining & BREAD).count_ones() == 1 => {
                if bit & BREAD != 0 {
                    (value == target).then_some([0, 0])
                } else {
                    (value + digit <= target).then_some([value + digit, 0])
                }
            }
            Self::Sandwich(_) => Some([0, 0]),
            Self::XSum(target) => {
                let first = remaining == DIGITS;
                let left = if first { digit } else { length };
                match left {
                    0 => Some([0, 0]),
                    1 => (value + digit == target).then_some([0, 0]),
                    _ => (value + digit < target).then_some([value + digit, left - 1]),
                }
            }
            Self::Skyscrapers(target) => {
                let highest = (DIGITS ^ remaining).checked_ilog2();
                let visible = value + u8::from(highest.is_none_or(|max| bit > 1 << max));
                if remaining & digit_bit(9) != 0 && digit != 9 {
                    (visible < target).then_some([visible, 0])
                } else {
                    (visible == target).then_some([visible, 0])
                }
            }
        }
    }
}

#[cfg(test)]
mod sum_support_tests {
    use super::sum_support;

    fn enumerate(
        domains: &[u16],
        targets: &[usize],
        chosen: &mut Vec<usize>,
        total: usize,
        support: &mut [u16],
    ) {
        if chosen.len() == domains.len() {
            if targets.contains(&total) {
                for (cell, &digit) in chosen.iter().enumerate() {
                    support[cell] |= 1 << (digit - 1);
                }
            }
            return;
        }
        for digit in 1..=9 {
            if domains[chosen.len()] & (1 << (digit - 1)) != 0 {
                chosen.push(digit);
                enumerate(domains, targets, chosen, total + digit, support);
                chosen.pop();
            }
        }
    }

    fn check(domains: &[u16], targets: &[usize]) {
        let mut expected = vec![0; domains.len()];
        enumerate(domains, targets, &mut vec![], 0, &mut expected);
        let totals = targets.iter().fold(0, |mask, &target| mask | (1 << target));
        let mut actual = vec![0; domains.len()];
        sum_support(domains, totals, &mut actual);
        assert_eq!(actual, expected, "{domains:?} with totals {targets:?}");
    }

    #[test]
    fn candidate_support_matches_direct_sum_enumeration() {
        for a in [0, 1, 3, 40, 320, 511] {
            for b in [1, 5, 10, 64, 384, 511] {
                for c in [0, 2, 7, 80, 256, 511] {
                    for targets in [&[][..], &[3], &[6, 15, 23], &[11, 19, 27, 127]] {
                        check(&[a, b, c], targets);
                    }
                }
            }
        }
        check(&[], &[0, 127]);
        check(&[511], &[0, 2, 9, 127]);
        check(&[384; 9], &[72, 76, 81, 127]);
        check(&[384; 9], &[76]);
    }
}

#[cfg(test)]
mod renban_support_tests {
    use super::*;

    // Independent digit enumeration. A valid completed set has no repeats and
    // max − min = length − 1, regardless of the order in which cells are drawn.
    fn enumerate(size: u8, domains: &[u16]) -> Vec<u16> {
        fn visit(size: u8, domains: &[u16], chosen: &mut Vec<u8>, support: &mut [u16]) {
            if chosen.len() == domains.len() {
                if chosen.iter().max().unwrap() - chosen.iter().min().unwrap()
                    == domains.len() as u8 - 1
                {
                    for (cell, &digit) in chosen.iter().enumerate() {
                        support[cell] |= 1 << (digit - 1)
                    }
                }
                return;
            }
            for digit in 1..=size {
                if domains[chosen.len()] & (1 << (digit - 1)) == 0 || chosen.contains(&digit) {
                    continue;
                }
                chosen.push(digit);
                visit(size, domains, chosen, support);
                chosen.pop();
            }
        }
        let mut support = vec![0; domains.len()];
        visit(size, domains, &mut vec![], &mut support);
        support
    }

    fn check(domains: &[u16]) {
        let constraint = LineConstraint {
            cells: (0..domains.len()).collect(),
            technique: VariantTechnique::Renban,
            rule_index: 0,
            kind: LineKind::Renban,
        };
        let mut support = vec![0; domains.len()];
        constraint.support(domains, &mut support);
        assert_eq!(support, enumerate(9, domains), "{domains:?}");
    }

    #[test]
    fn every_two_cell_domain_pair_matches_unordered_consecutive_digits() {
        for left in 0..=511 {
            for right in 0..=511 {
                check(&[left, right])
            }
        }
    }

    #[test]
    fn three_cell_domains_and_long_ranges_match_independent_assignments() {
        let windows = (1..=7).map(|first| [first, first + 1, first + 2]);
        for labels in windows.chain([[2, 4, 7], [2, 3, 8]]) {
            let masks: Vec<_> = (0..8)
                .map(|subset| {
                    labels.iter().enumerate().fold(0, |mask, (i, &digit)| {
                        mask | if subset & (1 << i) != 0 {
                            1 << (digit - 1)
                        } else {
                            0
                        }
                    })
                })
                .collect();
            for &a in &masks {
                for &b in &masks {
                    for &c in &masks {
                        check(&[a, b, c])
                    }
                }
            }
        }
        for domains in [
            vec![511],
            vec![511; 3],
            vec![0b000_000_111, 0b001_000_001, 0b000_000_110],
            vec![0b111_000_111, 0b111_000_101, 0b110_000_111],
            vec![511; 9],
            vec![3, 3, 3, 511],
            vec![15; 4],
            vec![1, 2, 4, 8, 16, 32, 64, 128, 256],
            vec![384, 384, 32, 16, 8, 4, 2, 1],
        ] {
            check(&domains)
        }
    }

    #[test]
    fn wide_renban_support_matches_independent_assignments() {
        let mut seed = 71u32;
        for size in [10, 12, 16] {
            let all = u16::MAX >> (16 - size);
            for length in 4..=7 {
                for _ in 0..80 {
                    let domains: Vec<_> = (0..length)
                        .map(|_| {
                            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                            ((seed >> 16) as u16) & ((seed >> 5) as u16) & all
                        })
                        .collect();
                    let mut support = vec![0; length];
                    wide_renban_support(size, &domains, &mut support);
                    assert_eq!(support, enumerate(size as u8, &domains), "{domains:?}");
                }
            }
        }
    }

    #[test]
    fn a_full_sixteen_digit_line_filters_unmatchable_edges() {
        let mut domains = [u16::MAX; 16];
        domains[..2].fill(3);
        let mut support = [0; 16];
        wide_renban_support(16, &domains, &mut support);
        assert_eq!(support[..2], [3, 3]);
        assert_eq!(support[2..], [u16::MAX ^ 3; 14]);

        domains[2] = 3;
        support.fill(0);
        wide_renban_support(16, &domains, &mut support);
        assert_eq!(support, [0; 16]);
    }
}

#[cfg(test)]
mod fixed_outside_tests {
    use super::*;

    #[test]
    fn outside_clues_check_fixed_rows_and_reject_duplicate_digits() {
        let board = [2, 1, 3, 4, 9, 5, 7, 8, 6];
        for (technique, clues) in [
            (
                VariantTechnique::Sandwich,
                [OutsideClue::Sandwich(7), OutsideClue::Sandwich(8)],
            ),
            (
                VariantTechnique::XSum,
                [OutsideClue::XSum(3), OutsideClue::XSum(4)],
            ),
            (
                VariantTechnique::Skyscrapers,
                [OutsideClue::Skyscrapers(4), OutsideClue::Skyscrapers(5)],
            ),
        ] {
            for (clue, expected) in clues.into_iter().zip([true, false]) {
                let line = LineConstraint {
                    cells: (0..9).collect(),
                    technique,
                    rule_index: 0,
                    kind: LineKind::Outside(clue),
                };
                let domains = board.map(digit_bit);
                let mut searched = [0; 9];
                clue.record_support(DIGITS, [0, 0], &domains, &mut searched, &mut HashMap::new());
                let mut fixed = [0; 9];
                line.support(&domains, &mut fixed);
                assert_eq!(fixed, searched);
                assert_eq!(fixed[0] != 0, expected);

                let mut duplicate = domains;
                duplicate[1] = duplicate[0];
                let mut support = [0; 9];
                line.support(&duplicate, &mut support);
                assert_eq!(support, [0; 9]);
            }
        }
    }
}
