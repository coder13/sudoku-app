use super::super::conjugate_pair;
use super::{
    Axis, BasePair, ControlFlow, Deduction, ExocetCover, HintEvidence, House, PatternSearch,
    Technique, bit_indices, cell_bit, cells, cover_with_two_houses, report_eliminations,
};
use crate::{DIGITS, ExocetTarget, hints::digit_bit};

#[derive(Clone, Copy)]
pub(super) struct Target {
    evidence: ExocetTarget,
    cells: u128,
    reserved: u16,
}

impl Target {
    fn new(evidence: ExocetTarget) -> Self {
        Self {
            cells: evidence.cells().fold(0, |mask, cell| mask | cell_bit(cell)),
            reserved: evidence.reserved_digit().map_or(0, digit_bit),
            evidence,
        }
    }
}

pub(super) type PairsByLine = [Vec<Target>; 9];

pub(super) fn target_pairs(search: &PatternSearch<'_>, axis: Axis) -> PairsByLine {
    std::array::from_fn(|line| {
        let house = axis.cross(line);
        search
            .positions_by_digit()
            .iter()
            .enumerate()
            .filter_map(|(index, &positions)| {
                let link = conjugate_pair(positions, house)?;
                Some(Target::new(ExocetTarget::ConjugatePair {
                    digit: index as u8 + 1,
                    link,
                }))
            })
            .collect()
    })
}

pub(super) fn pair_lines(pairs: &PairsByLine, band: u128) -> [u16; 2] {
    let mut lines = [0; 2];
    for (line, pairs) in pairs.iter().enumerate() {
        for pair in pairs {
            let reaches_outside = usize::from(pair.cells & !band != 0);
            lines[reaches_outside] |= 1 << line;
        }
    }
    lines
}

pub(super) struct Region<'a> {
    pub(super) lines: [House; 3],
    pub(super) cells: u128,
    pub(super) singles: [u128; 2],
    pub(super) pairs: [&'a [Target]; 3],
}

impl Region<'_> {
    pub(super) fn visit(
        &self,
        search: &PatternSearch<'_>,
        possible: &[u128; 9],
        base: &BasePair,
        band: u128,
        target_candidates: u128,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let target_sites = self.cells & target_candidates;
        let eligible =
            |pair: &Target| pair.reserved & base.digits == 0 && pair.cells & target_sites != 0;
        let endo_pairs = self
            .pairs
            .into_iter()
            .flatten()
            .filter(|pair| eligible(pair) && pair.cells & !band != 0);

        for &exo in self.pairs[1..]
            .iter()
            .copied()
            .flatten()
            .filter(|pair| eligible(pair) && pair.cells & !band == 0)
        {
            let candidates = self.singles[1] & !exo.cells;
            let singles = base.covered_targets(possible, self.cells & !exo.cells, candidates);
            for cell in cells(singles) {
                let endo = Target::new(ExocetTarget::Cell(cell));
                self.visit_targets(search, possible, base, [exo, endo], visit)?;
            }
            for &endo in endo_pairs
                .clone()
                .filter(|endo| exo.cells & endo.cells == 0)
            {
                self.visit_targets(search, possible, base, [exo, endo], visit)?;
            }
        }

        for &endo in endo_pairs {
            let candidates = self.singles[0] & !endo.cells;
            let singles = base.covered_targets(possible, self.cells & !endo.cells, candidates);
            for cell in cells(singles) {
                let exo = Target::new(ExocetTarget::Cell(cell));
                self.visit_targets(search, possible, base, [exo, endo], visit)?;
            }
        }
        ControlFlow::Continue(())
    }

    fn visit_targets(
        &self,
        search: &PatternSearch<'_>,
        possible: &[u128; 9],
        base: &BasePair,
        targets: [Target; 2],
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        // Each true base digit must occur on all three cross-lines. At most two
        // occurrences can lie outside the targets. Every pair reserves one cell,
        // leaving exactly two target cells available for the two true base digits.
        let outside = self.cells & !(targets[0].cells | targets[1].cells);
        let mut covers = [[None; 2]; 9];
        for digit in bit_indices(base.digits) {
            let Some(cover) = cover_with_two_houses(possible[digit] & outside) else {
                return ControlFlow::Continue(());
            };
            covers[digit] = cover;
        }

        let mut removals = [0; 9];
        for target in targets {
            let allowed = base.digits | target.reserved;
            for digit in bit_indices(DIGITS & !allowed) {
                removals[digit] |= search.positions_by_digit()[digit] & target.cells;
            }
        }
        report_eliminations(visit, Technique::SeniorExocet, removals, || {
            HintEvidence::GroupedExocet {
                bases: base.cells,
                targets: targets.map(|target| target.evidence),
                cross_lines: self.lines,
                covers: bit_indices(base.digits)
                    .map(|digit| ExocetCover {
                        digit: digit as u8 + 1,
                        cells: cells(possible[digit] & outside).collect(),
                        houses: covers[digit].into_iter().flatten().collect(),
                    })
                    .collect(),
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Candidate, ConjugatePair, HintAction, PositionSnapshot, RankConstraint, RankOutcome,
        RankPattern, VerifiedTemplate, candidates, deductions_at, practice::GROUPED_SENIOR_EXOCET,
        prove_rank_at, replay_rank_proof_at, technique_deductions_at,
    };

    const EXO_PAIR: ExocetTarget = ExocetTarget::ConjugatePair {
        digit: 9,
        link: ConjugatePair {
            house: House::Column(1),
            cells: [64, 73],
        },
    };
    const ENDO_PAIR: ExocetTarget = ExocetTarget::ConjugatePair {
        digit: 9,
        link: ConjugatePair {
            house: House::Column(3),
            cells: [39, 75],
        },
    };
    const PAIRS: [ExocetTarget; 2] = [EXO_PAIR, ENDO_PAIR];
    const CROSS_LINES: [House; 3] = [House::Column(6), House::Column(1), House::Column(3)];

    #[test]
    fn published_pairs_prove_every_removal_and_mark_both_reserved_digits() {
        let example = GROUPED_SENIOR_EXOCET;
        check_proof(
            &example.position().unwrap(),
            PAIRS,
            example.expected_actions,
        );
    }

    #[test]
    fn either_target_can_be_a_single_cell_when_the_other_is_a_pair() {
        // Prepare two positions from figure 0821 by supplying established
        // removals. The pattern must prove the new eliminations locally.
        let cases = [
            (
                [EXO_PAIR, ExocetTarget::Cell(24)],
                &[(75, 3), (51, 4)][..],
                &[(24, 1), (24, 7), (24, 8), (73, 2)][..],
                RankConstraint::HouseDigit {
                    house: House::Column(1),
                    digit: 9,
                },
                Candidate { cell: 73, digit: 2 },
            ),
            (
                [ExocetTarget::Cell(64), ENDO_PAIR],
                &[(73, 3), (73, 4), (73, 5)][..],
                &[(39, 1), (39, 8), (64, 9), (75, 1), (75, 2)][..],
                RankConstraint::HouseDigit {
                    house: House::Column(3),
                    digit: 9,
                },
                Candidate { cell: 39, digit: 1 },
            ),
        ];
        for (targets, removed, actions, link, counterexample) in cases {
            let mut position = GROUPED_SENIOR_EXOCET.position().unwrap();
            for &(cell, digit) in removed {
                position.eliminations[cell] |= digit_bit(digit);
            }
            let expected: Vec<_> = actions
                .iter()
                .map(|&(cell, digit)| HintAction::Eliminate(Candidate { cell, digit }))
                .collect();
            let mut pattern = check_proof(&position, targets, &expected);
            pattern.bases.retain(|&required| required != link);
            assert_eq!(
                prove_rank_at(&position, &pattern, counterexample, 20_000).unwrap(),
                RankOutcome::Compatible
            );
        }
    }

    fn check_proof(
        position: &PositionSnapshot,
        expected_targets: [ExocetTarget; 2],
        expected: &[HintAction],
    ) -> RankPattern {
        let board = position.values().unwrap();
        let verified = VerifiedTemplate::verify(board).unwrap();
        let hints = technique_deductions_at(position, Technique::SeniorExocet).unwrap();
        for action in hints.iter().flat_map(|hint| &hint.actions) {
            let HintAction::Eliminate(target) = action else {
                panic!("Senior Exocet removes candidates");
            };
            assert_ne!(verified.solution()[target.cell], target.digit);
        }

        let deductions = deductions_at(position, &[Technique::SeniorExocet]).unwrap();
        let proof = deductions
            .iter()
            .find(|deduction| deduction.actions == expected)
            .and_then(|deduction| {
                deduction.proofs.iter().find(|proof| {
                    matches!(
                        proof.evidence,
                        HintEvidence::GroupedExocet {
                            bases: [61, 62],
                            targets,
                            ..
                        } if targets == expected_targets
                    )
                })
            })
            .expect("the fixture should produce a proof with the expected targets");
        let HintEvidence::GroupedExocet {
            bases,
            targets,
            cross_lines,
            covers,
        } = &proof.evidence
        else {
            unreachable!();
        };
        assert_eq!(*cross_lines, CROSS_LINES);
        assert_eq!(
            covers.iter().map(|cover| cover.digit).collect::<Vec<_>>(),
            [3, 4, 5]
        );
        for target in targets {
            if let ExocetTarget::ConjugatePair { digit, link } = *target {
                assert!(proof.pattern.houses.contains(&link.house));
                for cell in link.cells {
                    assert!(
                        proof
                            .pattern
                            .candidates
                            .contains(&Candidate { cell, digit })
                    );
                }
            }
        }

        // Rebuild the premises as local exact-cover constraints. The check
        // does not use the detector's two-house cover test.
        let mut required: Vec<_> = bases.iter().copied().map(RankConstraint::Cell).collect();
        let mut capacity = Vec::new();
        for target in targets {
            if let ExocetTarget::ConjugatePair { digit, link } = *target {
                required.push(RankConstraint::HouseDigit {
                    house: link.house,
                    digit,
                });
            }
            capacity.extend(target.cells().map(RankConstraint::Cell));
        }
        for cover in covers {
            let digit = cover.digit;
            let open = |house: House| !house.cells().into_iter().any(|cell| board[cell] == digit);
            let for_digit = |house| RankConstraint::HouseDigit { house, digit };
            required.extend(
                cross_lines
                    .iter()
                    .copied()
                    .filter(|&house| open(house))
                    .map(for_digit),
            );
            capacity.extend(House::all().filter(|&house| open(house)).map(for_digit));
        }
        let pattern = RankPattern {
            bases: required,
            covers: capacity,
        };
        for action in expected {
            let target = action.candidate();
            let RankOutcome::Proven(proof) =
                prove_rank_at(position, &pattern, target, 20_000).unwrap()
            else {
                panic!("expected a local proof for {target:?}");
            };
            assert!(replay_rank_proof_at(position, &proof).unwrap());
        }
        pattern
    }

    #[test]
    fn grouped_targets_need_both_conjugate_links_and_two_house_covers() {
        let board = GROUPED_SENIOR_EXOCET.position().unwrap().values().unwrap();
        let has_groups = |board: &crate::Board| {
            let masks = candidates(board).unwrap();
            let search = PatternSearch::new(board, &masks);
            super::super::visit(&search, Technique::SeniorExocet, &mut |deduction| {
                if matches!(
                    deduction.evidence,
                    HintEvidence::GroupedExocet {
                        bases: [61, 62],
                        targets: PAIRS,
                        cross_lines: CROSS_LINES,
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
        assert!(has_groups(&board));

        // Clearing r3c6=9 restores a third possible position for 9 in column 4.
        let mut broken_link = board;
        assert_eq!(broken_link[23], 9);
        broken_link[23] = 0;
        assert_ne!(candidates(&broken_link).unwrap()[21] & digit_bit(9), 0);
        assert!(!has_groups(&broken_link));

        // Clearing r1c2=8 leaves both links intact, but the 4s at r1c2,
        // r3c7 and r6c4 share no house and require three covers.
        let mut broken_cover = board;
        assert_eq!(broken_cover[1], 8);
        broken_cover[1] = 0;
        let masks = candidates(&broken_cover).unwrap();
        let search = PatternSearch::new(&broken_cover, &masks);
        for target in PAIRS {
            let ExocetTarget::ConjugatePair { digit, link } = target else {
                unreachable!()
            };
            assert_eq!(
                conjugate_pair(
                    search.positions_by_digit()[usize::from(digit - 1)],
                    link.house
                ),
                Some(link)
            );
        }
        for cell in [1, 24, 48] {
            assert_ne!(masks[cell] & digit_bit(4), 0);
        }
        assert!(!has_groups(&broken_cover));
    }
}
