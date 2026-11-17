use super::{
    ControlFlow, Deduction, HintEvidence, House, PEERS, PatternSearch, Technique, bit_indices,
    cell_bit, cells, house_cells, report_eliminations,
};
use crate::hints::FireworkPivot;
use crate::{CELLS, coordinates};

pub(super) mod wings;

struct Crossing {
    pivot: u128,
    row: u128,
    column: u128,
    block: u128,
}

impl Crossing {
    fn at(pivot: usize) -> Self {
        let [row, column, block] = House::at(pivot).map(house_cells);
        Self {
            pivot: cell_bit(pivot),
            row,
            column,
            block,
        }
    }

    fn external(&self, positions: u128) -> [u128; 2] {
        let outside = positions & !self.block;
        [self.row & outside, self.column & outside]
    }

    fn has_box_arms(&self, positions: u128) -> bool {
        let inside = positions & self.block & !self.pivot;
        inside & self.row != 0 && inside & self.column != 0
    }

    fn paired_wings(&self, positions: [u128; 2]) -> Option<[[u128; 2]; 2]> {
        if !positions.iter().any(|&cells| self.has_box_arms(cells)) {
            return None;
        }
        let outside = positions.map(|positions| self.external(positions));
        outside
            .iter()
            .flatten()
            .all(|&arm| arm != 0)
            .then_some(outside)
    }
}

pub(super) fn visit_links(positions: &[u128; 9], mut visit: impl FnMut(usize, u8, [u128; 2])) {
    for pivot in 0..CELLS {
        let crossing = Crossing::at(pivot);
        for (index, &positions) in positions.iter().enumerate() {
            if !crossing.has_box_arms(positions) {
                continue;
            }
            let [across, down] = crossing.external(positions);
            if across == 0 || down == 0 {
                continue;
            }
            let center = positions & crossing.pivot;
            let digit = index as u8 + 1;
            // With all external positions and the pivot false, the row
            // and column would both need a copy of the digit in the box.
            if center != 0 {
                visit(pivot, digit, [center, across | down]);
                visit(pivot, digit, [down, center | across]);
            }
            visit(pivot, digit, [across, center | down]);
        }
    }
}

#[derive(Default)]
struct Arms {
    row: [u16; 9],
    column: [u16; 9],
    inside_row: u16,
    inside_column: u16,
    both_box_arms: u16,
}

impl Arms {
    fn at(search: &PatternSearch<'_>, pivot: usize) -> Self {
        let mut arms = Self::default();
        if search.masks[pivot] == 0 {
            return arms;
        }
        let crossing = Crossing::at(pivot);
        for (digit, &positions) in search.positions_by_digit().iter().enumerate() {
            if positions & crossing.row == 0 || positions & crossing.column == 0 {
                continue;
            }
            let [row_wing, column_wing] = crossing.external(positions);
            if row_wing.count_ones() > 1 || column_wing.count_ones() > 1 {
                continue;
            }
            let bit = 1 << digit;
            if crossing.has_box_arms(positions) {
                arms.both_box_arms |= bit;
            }
            if row_wing == 0 {
                arms.inside_row |= bit;
            } else {
                arms.row[row_wing.trailing_zeros() as usize % 9] |= bit;
            }
            if column_wing == 0 {
                arms.inside_column |= bit;
            } else {
                arms.column[column_wing.trailing_zeros() as usize / 9] |= bit;
            }
        }
        arms
    }

    fn digits(&self, wing_column: usize, wing_row: usize) -> u16 {
        (self.row[wing_column] | self.inside_row) & (self.column[wing_row] | self.inside_column)
    }
}

pub(super) fn visit(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let arms: [Arms; CELLS] = std::array::from_fn(|cell| Arms::at(search, cell));
    for (pivot, support) in arms.iter().enumerate() {
        if support.both_box_arms == 0 {
            continue;
        }
        let (row, column, _) = coordinates(pivot);
        let other_rows = (0..9).filter(|&other| other / 3 != row / 3);
        let other_columns = (0..9).filter(|&other| other / 3 != column / 3);
        for wing_column in other_columns {
            let row_wing = row * 9 + wing_column;
            if search.masks[row_wing] == 0 {
                continue;
            }
            for wing_row in other_rows.clone() {
                let column_wing = wing_row * 9 + column;
                if search.masks[column_wing] == 0 {
                    continue;
                }
                let digits = support.digits(wing_column, wing_row);
                let wings = [row_wing, column_wing];
                // A simple line link can supply a digit in the set, but at
                // least one digit must need the row, column, and box together.
                if (digits & support.both_box_arms) == 0 {
                    continue;
                }
                if digits.count_ones() == 3 {
                    examine(
                        search,
                        wings,
                        [row_wing, column_wing, pivot],
                        &[(pivot, digits)],
                        visit,
                    )?;
                }
                let opposite = wing_row * 9 + wing_column;
                if pivot >= opposite || digits.count_ones() < 2 {
                    continue;
                }
                let opposite_digits = arms[opposite].digits(column, row);
                for first in pairs(digits).filter(|&pair| pair & support.both_box_arms != 0) {
                    for second in pairs(opposite_digits & !first)
                        .filter(|&pair| pair & arms[opposite].both_box_arms != 0)
                    {
                        examine(
                            search,
                            wings,
                            [row_wing, column_wing, pivot, opposite],
                            &[(pivot, first), (opposite, second)],
                            visit,
                        )?;
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}

pub(super) fn visit_w_wings(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let mut bivalue = search.bivalue_cells();
    if bivalue.count_ones() < 2 {
        return ControlFlow::Continue(());
    }
    let positions = search.positions_by_digit();
    for first in cells(bivalue) {
        bivalue &= !cell_bit(first);
        let pair = search.masks[first];
        let indices = [pair.trailing_zeros() as usize, pair.ilog2() as usize];
        let [a, b] = indices.map(|digit| positions[digit]);
        for second in cells(bivalue & a & b & !PEERS[first]) {
            let targets = PEERS[first] & PEERS[second] & (a | b);
            if targets == 0 {
                continue;
            }
            for pivot in cells(a & b & !(cell_bit(first) | cell_bit(second))) {
                let Some(outside) = Crossing::at(pivot).paired_wings([a, b]) else {
                    continue;
                };
                for bivalue in [[first, second], [second, first]] {
                    let mut removals = [0; 9];
                    for removed in 0..2 {
                        let [row, column] = outside[1 - removed];
                        if row & !PEERS[bivalue[0]] != 0 || column & !PEERS[bivalue[1]] != 0 {
                            continue;
                        }
                        // A target would rule its digit out of both bivalue
                        // cells. They force the other digit out of both wings.
                        // Neither digit could use an outside cell, so both
                        // would need the same intersection.
                        let digit = indices[removed];
                        let [row, column] = outside[removed];
                        removals[digit] = cells(row | column)
                            .fold(targets & positions[digit], |seen, cell| seen & PEERS[cell]);
                    }
                    report_eliminations(visit, Technique::FireworkWWing, removals, || {
                        HintEvidence::FireworkWWing {
                            pivot,
                            digits: indices.map(|digit| digit as u8 + 1),
                            wings: wing_groups(outside),
                            bivalue,
                        }
                    })?;
                }
            }
        }
    }
    ControlFlow::Continue(())
}

fn wing_groups(outside: [[u128; 2]; 2]) -> [Vec<usize>; 2] {
    std::array::from_fn(|arm| cells(outside[0][arm] | outside[1][arm]).collect())
}

fn pairs(mask: u16) -> impl Iterator<Item = u16> {
    bit_indices(mask).flat_map(move |first| {
        let higher = mask & (u16::MAX << (first + 1));
        bit_indices(higher).map(move |second| (1 << first) | (1 << second))
    })
}

fn examine<const N: usize>(
    search: &PatternSearch<'_>,
    wings: [usize; 2],
    named_cells: [usize; N],
    pivots: &[(usize, u16)],
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let occupied = named_cells
        .into_iter()
        .fold(0, |mask, cell| mask | cell_bit(cell));
    let positions = search.positions_by_digit();
    let mut choices = [[None; 9]; N];
    let mut pool = 0;
    for &(pivot, digits) in pivots {
        pool |= digits;
        let [row, column, _] = House::at(pivot).map(house_cells);
        for digit in bit_indices(digits) {
            for (index, cell) in named_cells.into_iter().enumerate() {
                let bit = cell_bit(cell);
                if positions[digit] & bit == 0 || (row | column) & bit == 0 {
                    continue;
                }
                let mut excluded = PEERS[cell] | (occupied & !bit);
                if cell != pivot {
                    let missing = if row & bit != 0 { column } else { row };
                    let partners = positions[digit] & missing & !excluded;
                    if partners == 0 {
                        continue;
                    }
                    excluded |=
                        cells(partners).fold(u128::MAX, |common, partner| common & PEERS[partner]);
                }
                choices[index][digit] = Some(excluded);
            }
        }
    }

    // Each digit needs at least one named cell. Otherwise its row and column
    // would use two different cells of the same box. There are as many
    // distinct required digits as named cells, so each gets exactly one.
    // A wing may also require a second occurrence inside its pivot box.
    // The two wings' remaining lines inside the boxes share no open cell.
    let mut removals = *positions;
    if !fill(&choices, pool, &mut [occupied; 9], &mut removals) {
        return ControlFlow::Continue(());
    }
    report_eliminations(visit, Technique::Fireworks, removals, || {
        HintEvidence::Firework {
            wings,
            pivots: pivots
                .iter()
                .map(|&(cell, digits)| FireworkPivot {
                    cell,
                    digits: bit_indices(digits).map(|digit| digit as u8 + 1).collect(),
                })
                .collect(),
        }
    })
}

fn fill(
    choices: &[[Option<u128>; 9]],
    remaining: u16,
    blocked: &mut [u128; 9],
    removals: &mut [u128; 9],
) -> bool {
    let Some((choices, rest)) = choices.split_first() else {
        for (targets, &excluded) in removals.iter_mut().zip(blocked.iter()) {
            *targets &= excluded;
        }
        return true;
    };
    let mut found = false;
    for digit in bit_indices(remaining) {
        if let Some(excluded) = choices[digit] {
            let saved = blocked[digit];
            blocked[digit] = excluded;
            found |= fill(rest, remaining ^ (1 << digit), blocked, removals);
            blocked[digit] = saved;
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Candidate, PositionSnapshot, RankConstraint, RankOutcome, RankPattern, VerifiedTemplate,
        candidates, prove_rank_at, replay_rank_proof_at, technique_deductions_at,
    };

    fn firework_hint(position: &PositionSnapshot) -> crate::Hint {
        let hints = technique_deductions_at(position, Technique::Fireworks).unwrap();
        let [hint]: [crate::Hint; 1] = hints.try_into().expect("one published Firework");
        hint
    }

    fn firework_rank(position: &PositionSnapshot, pivots: &[FireworkPivot]) -> RankPattern {
        let board = position.values().unwrap();
        let mut pattern = RankPattern {
            bases: Vec::new(),
            covers: (0..CELLS)
                .filter(|&cell| board[cell] == 0)
                .map(RankConstraint::Cell)
                .collect(),
        };
        let mut used_digits = 0;
        for pivot in pivots {
            let [row, column, _] = House::at(pivot.cell);
            for &digit in &pivot.digits {
                pattern
                    .bases
                    .extend([row, column].map(|house| RankConstraint::HouseDigit { house, digit }));
                let bit = 1 << (digit - 1);
                if used_digits & bit == 0 {
                    cover_digit(&mut pattern, &board, digit);
                    used_digits |= bit;
                }
            }
        }
        pattern
    }

    fn cover_digit(pattern: &mut RankPattern, board: &crate::Board, digit: u8) {
        pattern.covers.extend(
            House::all()
                .filter(|house| house.cells().into_iter().all(|cell| board[cell] != digit))
                .map(|house| RankConstraint::HouseDigit { house, digit }),
        );
    }

    fn wing_rank(position: &PositionSnapshot, evidence: &HintEvidence) -> RankPattern {
        match evidence {
            HintEvidence::FireworkLWing {
                pivot,
                digits,
                link,
                linked_digit,
                ..
            } => {
                let mut pattern = firework_rank(
                    position,
                    &[FireworkPivot {
                        cell: *pivot,
                        digits: digits.to_vec(),
                    }],
                );
                pattern.bases.push(RankConstraint::HouseDigit {
                    house: link.house,
                    digit: *linked_digit,
                });
                cover_digit(&mut pattern, &position.values().unwrap(), *linked_digit);
                pattern
            }
            HintEvidence::FireworkAlsWing {
                pivots,
                digits,
                bivalue,
                ..
            } => {
                let mut pattern = firework_rank(
                    position,
                    &pivots.map(|cell| FireworkPivot {
                        cell,
                        digits: digits.to_vec(),
                    }),
                );
                pattern.bases.push(RankConstraint::Cell(*bivalue));
                pattern
            }
            _ => panic!("expected L-Wing or ALS-Wing evidence"),
        }
    }

    #[test]
    fn firework_l_and_als_wings_replay_each_removal_from_local_constraints() {
        for technique in [Technique::FireworkLWing, Technique::FireworkAlsWing] {
            for example in technique.practice_examples() {
                let position = example.position().unwrap();
                let hints = technique_deductions_at(&position, technique).unwrap();
                assert!(
                    hints
                        .iter()
                        .any(|hint| hint.actions == example.expected_actions)
                );
                for hint in hints {
                    let pattern = wing_rank(&position, &hint.evidence);
                    for action in hint.actions {
                        let target = action.candidate();
                        let RankOutcome::Proven(proof) =
                            prove_rank_at(&position, &pattern, target, 5_000).unwrap()
                        else {
                            panic!(
                                "{technique:?} must prove {target:?} with {:?}",
                                hint.evidence
                            );
                        };
                        assert!(replay_rank_proof_at(&position, &proof).unwrap());
                    }
                }
            }
        }
        let position = Technique::FireworkLWing
            .practice_example()
            .position()
            .unwrap();
        let hints = technique_deductions_at(&position, Technique::FireworkLWing).unwrap();
        let targets: std::collections::BTreeSet<_> = hints
            .iter()
            .flat_map(|hint| hint.actions.iter().map(|action| action.candidate()))
            .collect();
        assert_eq!(
            targets,
            [
                Candidate { cell: 3, digit: 5 },
                Candidate { cell: 53, digit: 5 }
            ]
            .into()
        );
    }

    #[test]
    fn firework_l_and_als_wings_reject_new_candidates_that_break_the_proof() {
        let examples = [
            (
                Technique::FireworkLWing,
                "483005710519074638762138954945082170671540083308007540237856491194723865856491327",
                Candidate { cell: 53, digit: 2 },
                // A third candidate in the link, then an extra outside cell.
                [(6, 6, 2), (15, 12, 6)],
            ),
            (
                Technique::FireworkAlsWing,
                "854306010006801542021450360540032681018604250260185403185263974492517836603948125",
                Candidate { cell: 9, digit: 3 },
                // An outside cell the anchor cannot see, then a third anchor candidate.
                [(14, 14, 9), (31, 40, 3)],
            ),
        ];
        for (technique, givens, target, controls) in examples {
            let board = crate::parse_givens(givens).unwrap();
            let original = PositionSnapshot::new(board);
            let proof = |position: &PositionSnapshot| {
                technique_deductions_at(position, technique)
                    .unwrap()
                    .into_iter()
                    .find(|hint| {
                        hint.actions
                            .iter()
                            .any(|action| action.candidate() == target)
                    })
            };
            let hint = proof(&original).expect("control has the intended proof");
            let solution = VerifiedTemplate::verify(board).unwrap();
            let original_masks = candidates(&board).unwrap();
            for (given, cell, digit) in controls {
                let mask = 1 << (digit - 1);
                assert_eq!(original_masks[cell] & mask, 0);
                let mut relaxed = original.clone();
                relaxed.givens[given] = 0;
                let relaxed_board = relaxed.values().unwrap();
                assert_eq!(
                    solution.solution(),
                    VerifiedTemplate::verify(relaxed_board).unwrap().solution()
                );
                assert_eq!(candidates(&relaxed_board).unwrap()[cell] & mask, mask);
                assert!(proof(&relaxed).is_none());
                let pattern = wing_rank(&relaxed, &hint.evidence);
                assert_eq!(
                    prove_rank_at(&relaxed, &pattern, target, 5_000),
                    Ok(RankOutcome::Compatible)
                );
            }
        }
    }

    #[test]
    fn published_firework_triples_and_quadruple_replay_as_local_rank_proofs() {
        let fixtures = [
            ([0, 80], &[(8, &[1, 2, 3][..])][..]),
            ([45, 21], &[(48, &[3, 7, 8][..])][..]),
            ([27, 77], &[(32, &[3, 4][..]), (72, &[1, 2][..])][..]),
        ];
        for (example, (expected_wings, expected_pivots)) in Technique::Fireworks
            .practice_examples()
            .into_iter()
            .zip(fixtures)
        {
            let position = example.position().unwrap();
            let solution = VerifiedTemplate::verify(position.values().unwrap()).unwrap();
            let hint = firework_hint(&position);
            let HintEvidence::Firework { wings, pivots } = &hint.evidence else {
                unreachable!()
            };
            assert_eq!(*wings, expected_wings);
            assert_eq!(
                pivots
                    .iter()
                    .map(|pivot| (pivot.cell, pivot.digits.as_slice()))
                    .collect::<Vec<_>>(),
                expected_pivots
            );
            assert_eq!(hint.actions, example.expected_actions);
            let pattern = firework_rank(&position, pivots);
            for action in hint.actions {
                let target = action.candidate();
                assert_ne!(solution.solution()[target.cell], target.digit);
                let RankOutcome::Proven(proof) =
                    prove_rank_at(&position, &pattern, target, 50_000).unwrap()
                else {
                    panic!("the local constraints must prove {target:?}");
                };
                assert!(replay_rank_proof_at(&position, &proof).unwrap());
            }
        }
    }

    #[test]
    fn external_removal_uses_the_box_even_when_a_digit_is_missing_at_the_pivot() {
        let mut position = Technique::Fireworks.practice_example().position().unwrap();
        let masks = candidates(&position.values().unwrap()).unwrap();
        assert_ne!(masks[8] & 1, 0);
        position.eliminations[8] |= 1;
        let hint = firework_hint(&position);
        let HintEvidence::Firework { pivots, .. } = &hint.evidence else {
            unreachable!()
        };
        assert_eq!(pivots[0].digits, [1, 2, 3]);
        let target = Candidate { cell: 15, digit: 2 };
        assert!(
            hint.actions
                .iter()
                .any(|action| action.candidate() == target)
        );
        let mut pattern = firework_rank(&position, pivots);
        let RankOutcome::Proven(proof) =
            prove_rank_at(&position, &pattern, target, 50_000).unwrap()
        else {
            panic!("the box must force digit 2 in the pattern");
        };
        assert!(replay_rank_proof_at(&position, &proof).unwrap());
        pattern.covers.retain(|item| {
            *item
                != RankConstraint::HouseDigit {
                    house: House::Box(2),
                    digit: 2,
                }
        });
        assert_eq!(
            prove_rank_at(&position, &pattern, target, 50_000),
            Ok(RankOutcome::Compatible)
        );
    }

    #[test]
    fn a_second_outside_candidate_breaks_the_published_triple() {
        let mut position = Technique::Fireworks.practice_examples()[1]
            .position()
            .unwrap();
        let hint = firework_hint(&position);
        assert!(
            hint.actions
                .iter()
                .any(|action| action.candidate() == Candidate { cell: 21, digit: 6 })
        );
        let masks = candidates(&position.values().unwrap()).unwrap();
        assert_ne!(masks[57] & position.eliminations[57] & (1 << 2), 0);
        position.eliminations[57] &= !(1 << 2);
        assert!(
            technique_deductions_at(&position, Technique::Fireworks)
                .unwrap()
                .iter()
                .all(
                    |hint| !matches!(&hint.evidence, HintEvidence::Firework { wings, pivots }
                    if *wings == [45, 21] && pivots[0].cell == 48 && pivots[0].digits == [3, 7, 8])
                )
        );
    }

    #[test]
    fn firework_w_wings_replay_for_single_and_grouped_wings() {
        let layouts = [
            ([1, 9], [vec![80], vec![0]], [44, 4]),
            ([4, 9], [vec![79, 80], vec![0]], [71, 1]),
            ([4, 9], [vec![80], vec![0]], [35, 5]),
        ];
        for (example, (digits, wings, bivalue)) in Technique::FireworkWWing
            .practice_examples()
            .into_iter()
            .zip(layouts)
        {
            let position = example.position().unwrap();
            let hints = technique_deductions_at(&position, Technique::FireworkWWing).unwrap();
            let expected = HintEvidence::FireworkWWing {
                pivot: 72,
                digits,
                wings,
                bivalue,
            };
            let hint = hints.iter().find(|hint| hint.evidence == expected).unwrap();
            assert_eq!(hint.actions, example.expected_actions);
            let pattern = w_wing_rank(&position, 72, digits, bivalue);
            for action in &hint.actions {
                let target = action.candidate();
                let RankOutcome::Proven(proof) =
                    prove_rank_at(&position, &pattern, target, 1_000).unwrap()
                else {
                    panic!("the six constraints must prove {target:?}");
                };
                assert!(replay_rank_proof_at(&position, &proof).unwrap());
            }
        }
    }

    fn w_wing_rank(
        position: &PositionSnapshot,
        pivot: usize,
        digits: [u8; 2],
        bivalue: [usize; 2],
    ) -> RankPattern {
        let mut pattern = firework_rank(
            position,
            &[FireworkPivot {
                cell: pivot,
                digits: digits.to_vec(),
            }],
        );
        pattern.bases.extend(bivalue.map(RankConstraint::Cell));
        pattern
    }

    #[test]
    fn the_published_firework_w_wing_needs_each_of_its_six_base_constraints() {
        let position = Technique::FireworkWWing
            .practice_example()
            .position()
            .unwrap();
        let target = Candidate { cell: 8, digit: 9 };
        let pattern = w_wing_rank(&position, 72, [1, 9], [44, 4]);
        for index in 0..pattern.bases.len() {
            let mut weaker = pattern.clone();
            weaker.bases.remove(index);
            assert_eq!(
                prove_rank_at(&position, &weaker, target, 1_000),
                Ok(RankOutcome::Compatible),
                "the removal needs base {:?}",
                pattern.bases[index]
            );
        }
    }

    #[test]
    fn firework_w_wings_account_for_extra_candidates_in_both_wings_and_bivalue_cells() {
        let published = Technique::FireworkWWing
            .practice_example()
            .position()
            .unwrap();
        let grouped = PositionSnapshot::new(
            crate::parse_givens(
                "002650710631278050507139268164387925783592146259461387016745832328016570005823600",
            )
            .unwrap(),
        );
        let cases = [
            // A third candidate in r1c5 can replace the forced digit.
            (published, [1, 9], [44, 4], 9, 2, (4, 5)),
            // The target does not see the added 4 in r2c1.
            (grouped.clone(), [4, 9], [71, 1], 4, 9, (9, 4)),
            // The row's bivalue cell does not see the added 9 in r9c4.
            (grouped, [4, 9], [71, 1], 4, 75, (75, 9)),
        ];
        for (original, digits, bivalue, digit, given, (cell, extra)) in cases {
            let target = Candidate { cell: 8, digit };
            let removes_target = |position: &PositionSnapshot| {
                technique_deductions_at(position, Technique::FireworkWWing)
                    .unwrap()
                    .iter()
                    .flat_map(|hint| &hint.actions)
                    .any(|action| action.candidate() == target)
            };
            assert!(removes_target(&original));
            let mask = 1 << (extra - 1);
            let board = original.values().unwrap();
            assert_eq!(candidates(&board).unwrap()[cell] & mask, 0);
            let mut relaxed = original;
            relaxed.givens[given] = 0;
            let amended = relaxed.values().unwrap();
            assert_eq!(candidates(&amended).unwrap()[cell] & mask, mask);
            assert_eq!(
                VerifiedTemplate::verify(board).unwrap().solution(),
                VerifiedTemplate::verify(amended).unwrap().solution()
            );
            assert!(!removes_target(&relaxed));
            let pattern = w_wing_rank(&relaxed, 72, digits, bivalue);
            assert_eq!(
                prove_rank_at(&relaxed, &pattern, target, 1_000),
                Ok(RankOutcome::Compatible)
            );
        }
    }
}
