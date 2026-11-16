use super::{
    ControlFlow, Deduction, HintEvidence, House, PEERS, PatternSearch, Technique, bit_indices,
    cell_bit, cells, house_cells, report_eliminations,
};
use crate::hints::FireworkPivot;
use crate::{CELLS, coordinates};

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
        let [row, column, block] = House::at(pivot).map(house_cells);
        let elsewhere_in_box = block & !cell_bit(pivot);
        for (digit, &positions) in search.positions_by_digit().iter().enumerate() {
            let in_row = positions & row;
            let in_column = positions & column;
            if in_row == 0 || in_column == 0 {
                continue;
            }
            let row_wing = in_row & !block;
            let column_wing = in_column & !block;
            if row_wing.count_ones() > 1 || column_wing.count_ones() > 1 {
                continue;
            }
            let bit = 1 << digit;
            if in_row & elsewhere_in_box != 0 && in_column & elsewhere_in_box != 0 {
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
        for pivot in pivots {
            let [row, column, _] = House::at(pivot.cell);
            for &digit in &pivot.digits {
                pattern
                    .bases
                    .extend([row, column].map(|house| RankConstraint::HouseDigit { house, digit }));
                pattern.covers.extend(
                    House::all()
                        .filter(|house| house.cells().into_iter().all(|cell| board[cell] != digit))
                        .map(|house| RankConstraint::HouseDigit { house, digit }),
                );
            }
        }
        pattern
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
}
