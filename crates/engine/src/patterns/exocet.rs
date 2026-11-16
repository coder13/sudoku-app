use super::{
    ControlFlow, Deduction, HintEvidence, House, PEERS, PatternSearch, Technique, bit_indices,
    cell_bit, cells, house_cells, report_eliminations,
};
use crate::{ExocetAssignment, ExocetCover};

const OTHER_TWO: [[usize; 2]; 3] = [[1, 2], [0, 2], [0, 1]];

pub(super) fn visit(
    search: &PatternSearch<'_>,
    technique: Technique,
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
            let band = if technique == Technique::SeniorExocet {
                axis.band_cells(along)
            } else {
                0
            };
            for (group, other_groups) in OTHER_TWO.into_iter().enumerate() {
                for (gap, offsets) in OTHER_TWO.into_iter().enumerate() {
                    let bases = offsets.map(|offset| axis.cell(along, group * 3 + offset));
                    let base_masks = bases.map(|cell| search.masks[cell]);
                    let digits = base_masks[0] | base_masks[1];
                    if base_masks.iter().any(|mask| mask.count_ones() < 2)
                        || !(3..=4).contains(&digits.count_ones())
                    {
                        continue;
                    }
                    let base = BasePair {
                        cells: bases,
                        digits,
                        axis,
                        along,
                        base_line: axis.cross(group * 3 + gap),
                        other_groups,
                    };
                    match technique {
                        Technique::Exocet => base.visit_junior(search, &possible, visit)?,
                        Technique::SeniorExocet => {
                            base.visit_senior(search, &possible, band, visit)?
                        }
                        _ => unreachable!("only Exocet techniques use this detector"),
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

    fn band_cells(self, along: usize) -> u128 {
        let start = along / 3 * 3;
        (start..start + 3)
            .flat_map(|a| (0..9).map(move |b| self.cell(a, b)))
            .fold(0, |mask, cell| mask | cell_bit(cell))
    }
}

struct BasePair {
    cells: [usize; 2],
    digits: u16,
    axis: Axis,
    along: usize,
    base_line: House,
    other_groups: [usize; 2],
}

impl BasePair {
    fn visit_junior(
        &self,
        search: &PatternSearch<'_>,
        possible: &[u128; 9],
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        for first in target_cells(self.axis, self.along, self.other_groups[0], search) {
            for second in target_cells(self.axis, self.along, self.other_groups[1], search) {
                let pattern = Pattern {
                    technique: Technique::Exocet,
                    bases: self.cells,
                    targets: [first.cell, second.cell],
                    lines: [self.base_line, first.line, second.line],
                };
                pattern.visit(search, possible, visit)?;
            }
        }
        ControlFlow::Continue(())
    }

    fn visit_senior(
        &self,
        search: &PatternSearch<'_>,
        possible: &[u128; 9],
        band: u128,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let target_candidates = bit_indices(self.digits)
            .fold(0, |mask, digit| mask | search.positions_by_digit()[digit]);
        let base_peers = PEERS[self.cells[0]] & PEERS[self.cells[1]];
        let [left, right] = self.other_groups.map(|group| group * 3);
        for first in left..left + 3 {
            for second in right..right + 3 {
                let lines = [
                    self.base_line,
                    self.axis.cross(first),
                    self.axis.cross(second),
                ];
                let [base, first_cells, second_cells] = lines.map(house_cells);
                let crosses = (base | first_cells | second_cells) & !base_peers;
                let outside = (first_cells | second_cells) & crosses & band & target_candidates;
                let inside = crosses & !band & target_candidates;
                for exo in cells(outside) {
                    let cross_region = crosses & !cell_bit(exo);
                    let endos = self.endo_targets(possible, cross_region, inside);
                    for endo in cells(endos) {
                        let pattern = Pattern {
                            technique: Technique::SeniorExocet,
                            bases: self.cells,
                            targets: [exo, endo],
                            lines,
                        };
                        pattern.visit(search, possible, visit)?;
                    }
                }
            }
        }
        ControlFlow::Continue(())
    }

    fn endo_targets(&self, possible: &[u128; 9], crosses: u128, mut targets: u128) -> u128 {
        for digit in bit_indices(self.digits) {
            let candidates = possible[digit] & crosses;
            if cover_with_two_houses(candidates).is_some() {
                continue;
            }
            // Every failed cover must be repaired by removing the same cell.
            targets &= candidates;
            targets = cells(targets)
                .map(cell_bit)
                .filter(|&bit| cover_with_two_houses(candidates & !bit).is_some())
                .fold(0, |mask, bit| mask | bit);
            if targets == 0 {
                break;
            }
        }
        targets
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
    technique: Technique,
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
        let other_lines = self.targets.map(|target| {
            let owner = line_cells
                .iter()
                .position(|&line| line & cell_bit(target) != 0)
                .expect("every Exocet target belongs to a cross-line");
            OTHER_TWO[owner].map(|line| line_cells[line])
        });
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
                let [first, second] = other_lines[i].map(|line| available & line);
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

        report_eliminations(visit, self.technique, targets, || HintEvidence::Exocet {
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
    use crate::{
        HintAction, RankConstraint, RankOutcome, RankPattern, candidates, prove_rank_at, solve,
        technique_deductions_at,
    };

    #[test]
    fn published_senior_exocets_replay_as_local_rank_proofs() {
        let expected_targets = [[21, 51], [12, 75], [12, 48]];
        for (example, expected_targets) in Technique::SeniorExocet
            .practice_examples()
            .into_iter()
            .zip(expected_targets)
        {
            let snapshot = example.position().unwrap();
            let board = snapshot.values().unwrap();
            let solution = solve(&board).unwrap();
            let hints = technique_deductions_at(&snapshot, Technique::SeniorExocet).unwrap();
            for action in hints.iter().flat_map(|hint| &hint.actions) {
                let HintAction::Eliminate(target) = action else {
                    panic!("an Exocet removes candidates");
                };
                assert_ne!(solution[target.cell], target.digit);
            }
            let hint = hints
                .iter()
                .find(|hint| {
                    matches!(hint.evidence, HintEvidence::Exocet { bases: [0, 1], targets, cross_lines: [House::Column(2), House::Column(3), House::Column(6)], .. } if targets == expected_targets)
                        && hint.actions == example.expected_actions
                })
                .expect("the published geometry must prove its removals");
            let HintEvidence::Exocet {
                bases,
                targets,
                cross_lines,
                covers,
                assignments,
            } = &hint.evidence
            else {
                unreachable!()
            };
            assert!(assignments.contains(&ExocetAssignment {
                bases: bases.map(|cell| solution[cell]),
                targets: targets.map(|cell| solution[cell]),
            }));
            if targets == &[12, 48] {
                assert!(
                    covers
                        .iter()
                        .any(|cover| cover.digit == 6 && cover.cells.contains(&60))
                );
            }

            // Rebuild the local constraints without the detector's capacity or
            // assignment algorithm. Each base digit has to occur in each
            // cross-line, and all of its cells still obey house visibility.
            let mut required: Vec<_> = bases.iter().copied().map(RankConstraint::Cell).collect();
            let mut capacity: Vec<_> = targets.iter().copied().map(RankConstraint::Cell).collect();
            for cover in covers {
                let digit = cover.digit;
                let unused =
                    |house: House| !house.cells().into_iter().any(|cell| board[cell] == digit);
                let constraint = |house| RankConstraint::HouseDigit { house, digit };
                required.extend(
                    cross_lines
                        .iter()
                        .copied()
                        .filter(|&house| unused(house))
                        .map(constraint),
                );
                capacity.extend(House::all().filter(|&house| unused(house)).map(constraint));
            }
            let pattern = RankPattern {
                bases: required,
                covers: capacity,
            };
            for &action in example.expected_actions {
                let target = action.candidate();
                assert!(matches!(
                    prove_rank_at(&snapshot, &pattern, target, 20_000),
                    Ok(RankOutcome::Proven(_))
                ));
            }
        }
    }

    #[test]
    fn an_uncovered_cross_line_occurrence_invalidates_the_published_geometry() {
        let example = Technique::SeniorExocet.practice_example();
        let mut board = example.position().unwrap().values().unwrap();
        let finds = |board: &crate::Board| {
            let masks = candidates(board).unwrap();
            let search = PatternSearch::new(board, &masks);
            visit(&search, Technique::SeniorExocet, &mut |deduction| {
                if matches!(
                    deduction.evidence,
                    HintEvidence::Exocet {
                        bases: [0, 1],
                        targets: [21, 51],
                        cross_lines: [House::Column(2), House::Column(3), House::Column(6)],
                        ..
                    }
                ) {
                    ControlFlow::Break(deduction)
                } else {
                    ControlFlow::Continue(())
                }
            })
            .is_break()
        };
        assert!(finds(&board));
        // Removing r7c8=1 makes r7c7 an additional candidate for the base digit 1.
        assert_eq!(board[61], 1);
        board[61] = 0;
        assert_ne!(candidates(&board).unwrap()[60] & 1, 0);
        assert!(!finds(&board));
    }

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
            visit(&pattern, Technique::Exocet, &mut |deduction| {
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
