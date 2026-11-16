use super::{
    ControlFlow, Deduction, HintEvidence, House, PEERS, PatternSearch, Technique, bit_indices,
    cell_bit, cells, house_cells, report_eliminations,
};
use crate::{ExocetAssignment, ExocetCover};

const OTHER_TWO: [[usize; 2]; 3] = [[1, 2], [0, 2], [0, 1]];

pub(super) fn visit(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let mut possible = *search.positions_by_digit();
    for (cell, &value) in search.board.iter().enumerate() {
        if value != 0 {
            possible[usize::from(value - 1)] |= cell_bit(cell);
        }
    }
    for axis in [Axis::Horizontal, Axis::Vertical] {
        for along in 0..9 {
            for (group, other_groups) in OTHER_TWO.into_iter().enumerate() {
                for (gap, offsets) in OTHER_TWO.into_iter().enumerate() {
                    let bases = offsets.map(|offset| axis.cell(along, group * 3 + offset));
                    let base_digits = bases.map(|cell| search.masks[cell]);
                    if base_digits.iter().any(|mask| mask.count_ones() < 2)
                        || !(3..=4).contains(&(base_digits[0] | base_digits[1]).count_ones())
                    {
                        continue;
                    }
                    for first in target_cells(axis, along, other_groups[0], search) {
                        for second in target_cells(axis, along, other_groups[1], search) {
                            let lines = [axis.cross(group * 3 + gap), first.line, second.line];
                            let pattern = Pattern {
                                bases,
                                targets: [first.cell, second.cell],
                                lines,
                            };
                            pattern.visit(search, &possible, visit)?;
                        }
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}

#[derive(Clone, Copy)]
enum Axis {
    Horizontal,
    Vertical,
}

impl Axis {
    fn cell(self, along: usize, across: usize) -> usize {
        match self {
            Self::Horizontal => along * 9 + across,
            Self::Vertical => across * 9 + along,
        }
    }

    fn cross(self, across: usize) -> House {
        match self {
            Self::Horizontal => House::Column(across),
            Self::Vertical => House::Row(across),
        }
    }
}

struct Target {
    cell: usize,
    line: House,
}

fn target_cells(
    axis: Axis,
    along: usize,
    group: usize,
    search: &PatternSearch<'_>,
) -> impl Iterator<Item = Target> {
    let band = along / 3 * 3;
    (band..band + 3)
        .filter(move |&a| a != along)
        .flat_map(move |a| {
            (group * 3..group * 3 + 3).map(move |b| Target {
                cell: axis.cell(a, b),
                line: axis.cross(b),
            })
        })
        .filter(|target| search.masks[target.cell] != 0)
}

struct Pattern {
    bases: [usize; 2],
    targets: [usize; 2],
    lines: [House; 3],
}

impl Pattern {
    fn visit(
        &self,
        search: &PatternSearch<'_>,
        possible: &[u128; 9],
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let base_masks = self.bases.map(|cell| search.masks[cell]);
        let base_digits = base_masks[0] | base_masks[1];
        let target_masks = self.targets.map(|cell| search.masks[cell]);
        if target_masks.iter().any(|&mask| mask & base_digits == 0) {
            return ControlFlow::Continue(());
        }
        let line_cells = self.lines.map(house_cells);
        let target_cells = cell_bit(self.targets[0]) | cell_bit(self.targets[1]);
        let base_peers = PEERS[self.bases[0]] & PEERS[self.bases[1]];
        let outside_targets =
            (line_cells[0] | line_cells[1] | line_cells[2]) & !(target_cells | base_peers);

        // Each cross-line needs the true base digit. Even including solved values,
        // the non-target cells can supply it at most twice.
        let mut covers = [[None; 2]; 9];
        let mut options = [[0; 2]; 9];
        for digit in bit_indices(base_digits) {
            let others = possible[digit] & outside_targets;
            let Some(cover) = cover_with_two_houses(others) else {
                return ControlFlow::Continue(());
            };
            covers[digit] = cover;
            for (i, &target) in self.targets.iter().enumerate() {
                if target_masks[i] & (1 << digit) == 0 {
                    continue;
                }
                // One target owns its cross-line. The other two lines still need
                // compatible occurrences, each outside both targets.
                let available = others & !PEERS[target];
                let first = available & line_cells[0];
                let second = available & line_cells[2 - i];
                for left in cells(first) {
                    let right = second & !PEERS[left];
                    if right != 0 {
                        options[digit][i] |= cell_bit(left) | right;
                    }
                }
            }
        }

        let mut assignments = Vec::new();
        let mut kept = [0; 4];
        let mut known = base_digits;
        let mut used_cross_cells = [0; 9];
        for left in bit_indices(base_masks[0]) {
            for right in bit_indices(base_masks[1] & !(1 << left)) {
                for [first, second] in [[left, right], [right, left]] {
                    if options[first][0] == 0 || options[second][1] == 0 {
                        continue;
                    }
                    known &= (1 << left) | (1 << right);
                    for (keep, digit) in kept.iter_mut().zip([left, right, first, second]) {
                        *keep |= 1 << digit;
                    }
                    used_cross_cells[first] |= options[first][0];
                    used_cross_cells[second] |= options[second][1];
                    assignments.push(ExocetAssignment {
                        bases: [left as u8 + 1, right as u8 + 1],
                        targets: [first as u8 + 1, second as u8 + 1],
                    });
                }
            }
        }
        if assignments.is_empty() {
            return ControlFlow::Continue(());
        }

        let mut targets = [0; 9];
        for (cell, keep) in self.bases.into_iter().chain(self.targets).zip(kept) {
            for digit in bit_indices(search.masks[cell] & !keep) {
                targets[digit] |= cell_bit(cell);
            }
        }
        let target_peers = PEERS[self.targets[0]] & PEERS[self.targets[1]];
        for digit in bit_indices(known) {
            targets[digit] |= search.positions_by_digit()[digit]
                & (base_peers | target_peers | (outside_targets & !used_cross_cells[digit]));
        }

        report_eliminations(visit, Technique::Exocet, targets, || HintEvidence::Exocet {
            bases: self.bases,
            targets: self.targets,
            cross_lines: self.lines,
            covers: bit_indices(base_digits)
                .map(|digit| ExocetCover {
                    digit: digit as u8 + 1,
                    cells: cells(possible[digit] & outside_targets).collect(),
                    houses: covers[digit].into_iter().flatten().collect(),
                })
                .collect(),
            assignments,
        })
    }
}

fn cover_with_two_houses(positions: u128) -> Option<[Option<House>; 2]> {
    if positions == 0 {
        return Some([None; 2]);
    }
    let houses = House::at(positions.trailing_zeros() as usize);
    for house in houses {
        if positions & !house_cells(house) == 0 {
            return Some([Some(house), None]);
        }
    }
    for house in houses {
        let remaining = positions & !house_cells(house);
        for second in House::at(remaining.trailing_zeros() as usize) {
            if remaining & !house_cells(second) == 0 {
                return Some([Some(house), Some(second)]);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_solved_cross_line_digit_can_break_the_two_house_cover() {
        let mut masks = [0; 81];
        for (cell, mask) in [
            (0, 0b0111),
            (1, 0b0111),
            (12, 0b1111),
            (24, 0b1111),
            (29, 1),
            (60, 1),
            (38, 2),
            (66, 2),
        ] {
            masks[cell] = mask;
        }
        let board = [0; 81];
        let finds_pattern = |board: &crate::Board| {
            let pattern = PatternSearch::new(board, &masks);
            visit(&pattern, &mut |deduction| {
                let found = matches!(
                    deduction.evidence,
                    HintEvidence::Exocet {
                        bases: [0, 1],
                        targets: [12, 24],
                        ..
                    }
                );
                if found {
                    ControlFlow::Break(deduction)
                } else {
                    ControlFlow::Continue(())
                }
            })
            .is_break()
        };
        assert!(finds_pattern(&board));
        let mut with_given = board;
        with_given[75] = 1;
        assert!(!finds_pattern(&with_given));
    }
}
