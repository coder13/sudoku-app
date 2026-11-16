use super::super::grouped::{Target, TargetCover};
use super::{
    BasePair, CROSS_LINE_NODE_LIMIT, Case, ControlFlow, CrossLineSearch, Deduction, HintEvidence,
    House, PEERS, PatternSearch, Technique, bit_indices, cell_bit, cells, house_cells,
    report_eliminations,
};
use crate::{
    ExocetTarget, GroupedDoubleExocetProof, GroupedExocetComponent, RankConstraint, RankPattern,
};

pub(super) fn visit(
    bases: [&BasePair; 2],
    lines: [House; 3],
    pairs: [&[Target]; 3],
    search: &PatternSearch<'_>,
    possible: &[u128; 9],
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let first = components(bases[0], lines, pairs, search, possible);
    if first.is_empty() {
        return ControlFlow::Continue(());
    }
    let second = components(bases[1], lines, pairs, search, possible);
    let mut checked = Vec::new();
    for left in &first {
        for right in &second {
            if left.paired || right.paired {
                combine([left, right], lines, search, possible, &mut checked, visit)?;
            }
        }
    }
    ControlFlow::Continue(())
}

struct Component<'a> {
    base: &'a BasePair,
    targets: [Target; 2],
    cover: TargetCover,
    paired: bool,
}

fn components<'a>(
    base: &'a BasePair,
    lines: [House; 3],
    pairs: [&[Target]; 3],
    search: &PatternSearch<'_>,
    possible: &[u128; 9],
) -> Vec<Component<'a>> {
    let [left, right] = base.other_groups;
    let base_peers = PEERS[base.cells[0]] & PEERS[base.cells[1]];
    let band = base.axis.band_cells(base.along) & !base_peers;
    let line_cells = lines.map(house_cells);
    let base_sites =
        bit_indices(base.digits).fold(0, |sites, digit| sites | search.positions_by_digit()[digit]);
    let options = |group: usize| {
        let region = line_cells[group] & band;
        let singles = cells(region & base_sites).map(|cell| Target::new(ExocetTarget::Cell(cell)));
        let paired = pairs[group].iter().copied().filter(move |target| {
            target.reserved & base.digits == 0
                && target.cells & !region == 0
                && target.cells & base_sites != 0
        });
        singles.chain(paired)
    };

    let cross = line_cells.into_iter().fold(0, |mask, line| mask | line);
    let mut components = Vec::new();
    for left in options(left) {
        for right in options(right) {
            // Each base digit needs three occurrences. At most two fit
            // outside the targets and the common peers of the base cells.
            // Every conjugate pair reserves one of its target cells.
            let outside = cross & !(base_peers | left.cells | right.cells);
            if let Some(cover) = TargetCover::new(base.digits, outside, possible) {
                components.push(Component {
                    base,
                    targets: [left, right],
                    cover,
                    paired: left.reserved != 0 || right.reserved != 0,
                });
            }
        }
    }
    components
}

fn combine(
    components: [&Component<'_>; 2],
    lines: [House; 3],
    search: &PatternSearch<'_>,
    possible: &[u128; 9],
    checked: &mut Vec<u32>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let base_digits = components[0].base.digits | components[1].base.digits;
    let mut filling = CrossLineSearch::new(
        lines.map(house_cells),
        possible,
        base_digits,
        CROSS_LINE_NODE_LIMIT,
    );
    let without_reservations = filling.required;
    let mut digits = base_digits;
    for component in components {
        for target in component.targets {
            if let ExocetTarget::ConjugatePair { digit, link } = target.evidence {
                let line = lines.iter().position(|&house| house == link.house).unwrap();
                let index = usize::from(digit - 1);
                filling.require(line, index, possible[index]);
                digits |= target.reserved;
            }
        }
    }
    let required = filling.required;
    if required == without_reservations || checked.contains(&required) {
        return ControlFlow::Continue(());
    }
    checked.push(required);

    let parts = components.map(|component| component.base.cells);
    let [left, right] =
        parts.map(|part| part.into_iter().fold(0, |mask, cell| mask | cell_bit(cell)));
    let Some(mut removals) = filling.removals_with_bases(left | right, search) else {
        return ControlFlow::Continue(());
    };
    // Keep only moves that use both base pairs and every added reservation.
    let without_each_pair = [(left, required), (right, required)];
    let without_each_reservation = cells(u128::from(required ^ without_reservations))
        .map(|slot| (left | right, required & !(1 << slot)));
    for (bases, required) in without_each_pair
        .into_iter()
        .chain(without_each_reservation)
    {
        filling.required = required;
        let Some(standalone) = filling.removals_with_bases(bases, search) else {
            return ControlFlow::Continue(());
        };
        for (joint, separate) in removals.iter_mut().zip(standalone) {
            *joint &= !separate;
        }
        if removals.iter().all(|&removed| removed == 0) {
            return ControlFlow::Continue(());
        }
    }

    report_eliminations(visit, Technique::DoubleExocet, removals, || {
        HintEvidence::GroupedDoubleExocet(Box::new(GroupedDoubleExocetProof {
            components: components.map(|component| GroupedExocetComponent {
                bases: component.base.cells,
                targets: component.targets.map(|target| target.evidence),
                covers: component.cover.evidence(component.base.digits, possible),
            }),
            cross_lines: lines,
            rank_pattern: rank_pattern(search, parts, lines, required, digits),
        }))
    })
}

impl CrossLineSearch {
    fn removals_with_bases(
        &mut self,
        bases: u128,
        search: &PatternSearch<'_>,
    ) -> Option<[u128; 9]> {
        let mut removals = *search.positions_by_digit();
        self.fill_bases(bases, search, &mut Case::default(), &mut removals)?
            .then_some(removals)
    }

    fn fill_bases(
        &mut self,
        bases: u128,
        search: &PatternSearch<'_>,
        case: &mut Case,
        removals: &mut [u128; 9],
    ) -> Option<bool> {
        if bases == 0 {
            return self.support(case, removals);
        }
        self.remaining = self.remaining.checked_sub(1)?;
        let cell = bases.trailing_zeros() as usize;
        let bit = cell_bit(cell);
        let mut supported = false;
        for digit in bit_indices(search.masks[cell]) {
            if case.peers[digit] & bit != 0 {
                continue;
            }
            let peers = case.place(cell, digit);
            let result = self.fill_bases(bases ^ bit, search, case, removals);
            case.undo(cell, digit, peers);
            supported |= result?;
        }
        Some(supported)
    }
}

fn rank_pattern(
    search: &PatternSearch<'_>,
    parts: [[usize; 2]; 2],
    lines: [House; 3],
    required: u32,
    digits: u16,
) -> RankPattern {
    let mut bases: Vec<_> = parts
        .into_iter()
        .flatten()
        .map(RankConstraint::Cell)
        .collect();
    let open = |house: House, digit| {
        house
            .cells()
            .into_iter()
            .all(|cell| search.board[cell] != digit)
    };
    for slot in cells(u128::from(required)) {
        let house = lines[slot % 3];
        let digit = (slot / 3) as u8 + 1;
        if open(house, digit) {
            bases.push(RankConstraint::HouseDigit { house, digit });
        }
    }
    let mut covers: Vec<_> = lines
        .into_iter()
        .flat_map(House::cells)
        .filter(|&cell| search.board[cell] == 0)
        .map(RankConstraint::Cell)
        .collect();
    for digit in bit_indices(digits).map(|index| index as u8 + 1) {
        covers.extend(
            House::all()
                .filter(|&house| open(house, digit))
                .map(|house| RankConstraint::HouseDigit { house, digit }),
        );
    }
    RankPattern { bases, covers }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Candidate, ConjugatePair, Hint, PositionSnapshot, RankOutcome, VerifiedTemplate,
        candidates, parse_givens, prove_rank_at, replay_rank_proof_at, technique_deductions_at,
    };

    // These positions were prepared from SudokuWiki's Unsolvable 165 and 28 and
    // the Double Exocet diagram in redd.it/1uezli6. The altered givens keep the
    // original solution and leave both cells of each target pair open.
    const SINGLE_PAIR: &str =
        "790806130210700600003010907000000000000060370030108000908030001007080003000400050";
    const TWO_PAIRS_SAME_COMPONENT: &str =
        "620108943908026100071940002000610000060080000089002000002060005000200030800001600";
    const TWO_PAIRED_COMPONENTS: &str =
        "108002546030050009504008107005817400080600000400520070000000200000000001000284050";

    const fn paired(digit: u8, house: House, cells: [usize; 2]) -> ExocetTarget {
        ExocetTarget::ConjugatePair {
            digit,
            link: ConjugatePair { house, cells },
        }
    }

    fn position(grid: &str, masks: &[(usize, u16)]) -> PositionSnapshot {
        let mut position = PositionSnapshot::new(parse_givens(grid).unwrap());
        for &(cell, mask) in masks {
            position.eliminations[cell] = mask;
        }
        position
    }

    fn matching_proof(
        position: &PositionSnapshot,
        expected: [[ExocetTarget; 2]; 2],
    ) -> Option<Hint> {
        for hint in technique_deductions_at(position, Technique::DoubleExocet).unwrap() {
            if let HintEvidence::GroupedDoubleExocet(proof) = &hint.evidence
                && proof
                    .components
                    .each_ref()
                    .map(|component| component.targets)
                    == expected
            {
                return Some(hint);
            }
        }
        None
    }

    #[test]
    fn both_exocets_and_each_reservation_are_needed() {
        use ExocetTarget::Cell;

        let fixtures = [
            (
                position(SINGLE_PAIR, &[(29, 282), (52, 32), (80, 32)]),
                [
                    [Cell(47), paired(6, House::Column(8), [35, 53])],
                    [Cell(38), Cell(31)],
                ],
                27,
            ),
            (
                position(TWO_PAIRS_SAME_COMPONENT, &[(42, 28), (63, 64), (68, 64)]),
                [
                    [Cell(41), Cell(51)],
                    [
                        paired(2, House::Column(0), [27, 36]),
                        paired(2, House::Column(6), [33, 42]),
                    ],
                ],
                8,
            ),
            (
                position(TWO_PAIRED_COMPONENTS, &[(38, 1), (47, 1), (73, 1)]),
                [
                    [paired(5, House::Column(5), [59, 68]), Cell(69)],
                    [paired(1, House::Column(2), [56, 74]), Cell(78)],
                ],
                5,
            ),
        ];
        for (position, expected, count) in fixtures {
            let hint = matching_proof(&position, expected).unwrap();
            let HintEvidence::GroupedDoubleExocet(evidence) = &hint.evidence else {
                unreachable!()
            };
            assert_eq!(hint.actions.len(), count);
            assert_eq!(hint.cost(), 600);

            let board = position.values().unwrap();
            let solution = VerifiedTemplate::verify(board).unwrap();
            let base_cases = evidence.components.each_ref().map(|component| {
                let mut pattern = evidence.rank_pattern.clone();
                pattern.bases.retain(|item| !matches!(item, RankConstraint::Cell(cell) if component.bases.contains(cell)));
                pattern
            });
            let link_cases = expected.into_iter().flatten().filter_map(|target| {
                let ExocetTarget::ConjugatePair { digit, link } = target else {
                    return None;
                };
                let mut pattern = evidence.rank_pattern.clone();
                pattern.bases.retain(|item| {
                    *item
                        != RankConstraint::HouseDigit {
                            house: link.house,
                            digit,
                        }
                });
                assert_ne!(pattern.bases, evidence.rank_pattern.bases);
                Some(pattern)
            });
            let weakened: Vec<_> = base_cases.into_iter().chain(link_cases).collect();

            for action in hint.actions {
                let candidate = action.candidate();
                assert_ne!(solution.solution()[candidate.cell], candidate.digit);
                let RankOutcome::Proven(proof) =
                    prove_rank_at(&position, &evidence.rank_pattern, candidate, 50_000).unwrap()
                else {
                    panic!("local constraints must prove {candidate:?}");
                };
                assert!(replay_rank_proof_at(&position, &proof).unwrap());
                for pattern in &weakened {
                    assert_eq!(
                        prove_rank_at(&position, pattern, candidate, 50_000),
                        Ok(RankOutcome::Compatible)
                    );
                }
            }
        }
    }

    #[test]
    fn a_third_live_reserve_candidate_breaks_the_paired_target() {
        let expected = [
            [
                ExocetTarget::Cell(47),
                paired(6, House::Column(8), [35, 53]),
            ],
            [ExocetTarget::Cell(38), ExocetTarget::Cell(31)],
        ];
        let mut position = position(SINGLE_PAIR, &[(29, 282), (52, 32), (80, 32)]);
        let hint = matching_proof(&position, expected).unwrap();
        assert!(
            hint.actions
                .iter()
                .any(|action| action.candidate() == Candidate { cell: 35, digit: 2 })
        );
        let masks = candidates(&position.values().unwrap()).unwrap();
        assert_ne!(masks[80] & 32, 0);
        position.eliminations[80] = 0;
        assert!(matching_proof(&position, expected).is_none());
    }

    #[test]
    fn a_paired_target_can_combine_with_a_fifth_base_digit() {
        // Prepared from Unsolvable 28, with digit 1 in only the second base pool.
        let position = position(
            "620078940908026100071940002200600000060080000089000000092060005010200030800001600",
            &[(42, 92), (48, 64), (49, 1)],
        );
        let hint = matching_proof(
            &position,
            [
                [
                    paired(2, House::Column(5), [41, 50]),
                    ExocetTarget::Cell(51),
                ],
                [ExocetTarget::Cell(36), ExocetTarget::Cell(33)],
            ],
        )
        .unwrap();
        let HintEvidence::GroupedDoubleExocet(evidence) = &hint.evidence else {
            unreachable!()
        };
        let base_digits = evidence
            .components
            .iter()
            .flat_map(|component| &component.covers)
            .fold(0u16, |mask, cover| mask | 1 << (cover.digit - 1));
        assert_eq!(base_digits.count_ones(), 5);
        assert_eq!(base_digits & 2, 0);
        let target = Candidate { cell: 25, digit: 5 };
        assert!(
            hint.actions
                .iter()
                .any(|action| action.candidate() == target)
        );
        let RankOutcome::Proven(certificate) =
            prove_rank_at(&position, &evidence.rank_pattern, target, 50_000).unwrap()
        else {
            panic!("a paired target with five base digits must prove the removal");
        };
        assert!(replay_rank_proof_at(&position, &certificate).unwrap());
        for digit in [1, 2] {
            let mut weaker = evidence.rank_pattern.clone();
            weaker.bases.retain(|item| {
                !matches!(item, RankConstraint::HouseDigit { digit: required, .. } if *required == digit)
            });
            assert_eq!(
                prove_rank_at(&position, &weaker, target, 50_000),
                Ok(RankOutcome::Compatible)
            );
        }
    }
}
