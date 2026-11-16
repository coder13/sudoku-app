use super::{
    Axis, BasePair, ControlFlow, Deduction, HintEvidence, House, PEERS, Pattern, PatternAnalysis,
    PatternSearch, Technique, cell_bit, cells, house_cells, report_eliminations, target_cells,
};
use crate::{DoubleExocetProof, ExocetComponent};

pub(super) fn visit(
    search: &PatternSearch<'_>,
    possible: &[u128; 9],
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    for axis in [Axis::Horizontal, Axis::Vertical] {
        for start in [0, 3, 6] {
            let bases: [Vec<_>; 3] = std::array::from_fn(|group| {
                (start..start + 3)
                    .flat_map(|along| {
                        (0..3).filter_map(move |gap| BasePair::new(search, axis, along, group, gap))
                    })
                    .collect()
            });
            for left_box in 0..3 {
                for right_box in left_box + 1..3 {
                    let third_box = 3 - left_box - right_box;
                    for left in &bases[left_box] {
                        for right in &bases[right_box] {
                            if left.digits & right.digits == 0
                                || (left.digits | right.digits).count_ones() != 4
                            {
                                continue;
                            }
                            for third in third_box * 3..third_box * 3 + 3 {
                                let mut lines = [0; 3];
                                lines[left_box] = left.gap_line;
                                lines[right_box] = right.gap_line;
                                lines[third_box] = third;
                                let lines = lines.map(|line| axis.cross(line));
                                let first = components(left, lines, search, possible);
                                if first.is_empty() {
                                    continue;
                                }
                                let second = components(right, lines, search, possible);
                                for left in &first {
                                    for right in &second {
                                        combine([left, right], lines, search, possible, visit)?;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}

struct Component {
    pattern: Pattern,
    analysis: PatternAnalysis,
    digits: u16,
}

impl Component {
    fn cells(&self) -> impl Iterator<Item = usize> {
        self.pattern.bases.into_iter().chain(self.pattern.targets)
    }

    fn evidence(&self, possible: &[u128; 9]) -> ExocetComponent {
        ExocetComponent {
            bases: self.pattern.bases,
            targets: self.pattern.targets,
            covers: self.analysis.evidence_covers(self.digits, possible),
        }
    }
}

fn components(
    base: &BasePair,
    lines: [House; 3],
    search: &PatternSearch<'_>,
    possible: &[u128; 9],
) -> Vec<Component> {
    let [first, second] = base.other_groups;
    let targets = |group| {
        target_cells(base.axis, base.along, group, search).filter(move |target| {
            target.line == lines[group] && search.masks[target.cell] & base.digits != 0
        })
    };
    let mut components = Vec::new();
    for first in targets(first) {
        for second in targets(second) {
            let pattern = Pattern {
                technique: Technique::Exocet,
                bases: base.cells,
                targets: [first.cell, second.cell],
                lines: [base.axis.cross(base.gap_line), first.line, second.line],
            };
            if let Some(analysis) = pattern.analyze(search, possible) {
                components.push(Component {
                    pattern,
                    analysis,
                    digits: base.digits,
                });
            }
        }
    }
    components
}

fn combine(
    [left, right]: [&Component; 2],
    lines: [House; 3],
    search: &PatternSearch<'_>,
    possible: &[u128; 9],
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let pattern_cells = left
        .cells()
        .chain(right.cells())
        .fold(0, |mask, cell| mask | cell_bit(cell));
    if pattern_cells.count_ones() != 8 {
        return ControlFlow::Continue(());
    }
    let line_cells = lines.map(house_cells);
    let mut assignments = Vec::new();
    let mut removals = *search.positions_by_digit();
    for &first in &left.analysis.assignments {
        for &second in &right.analysis.assignments {
            let left_digits = first.bases.into_iter().chain(first.targets);
            let right_digits = second.bases.into_iter().chain(second.targets);
            let placements = left
                .cells()
                .chain(right.cells())
                .zip(left_digits.chain(right_digits));
            let Some(excluded) = case_removals(placements, possible, pattern_cells, line_cells)
            else {
                continue;
            };
            assignments.push([first, second]);
            for (remaining, excluded) in removals.iter_mut().zip(excluded) {
                *remaining &= excluded;
            }
        }
    }
    if assignments.is_empty() {
        return ControlFlow::Continue(());
    }
    // Charge the double pattern only for removals beyond the two Junior proofs.
    for (digit, cells) in removals.iter_mut().enumerate() {
        *cells &= !(left.analysis.removals[digit] | right.analysis.removals[digit]);
    }
    report_eliminations(visit, Technique::DoubleExocet, removals, || {
        HintEvidence::DoubleExocet(Box::new(DoubleExocetProof {
            components: [left.evidence(possible), right.evidence(possible)],
            cross_lines: lines,
            assignments,
        }))
    })
}

fn case_removals(
    placements: impl Iterator<Item = (usize, u8)>,
    possible: &[u128; 9],
    pattern_cells: u128,
    lines: [u128; 3],
) -> Option<[u128; 9]> {
    let mut placed = [0; 9];
    let mut peers_by_digit = [0; 9];
    for (cell, digit) in placements {
        let index = usize::from(digit - 1);
        let bit = cell_bit(cell);
        if peers_by_digit[index] & bit != 0 {
            return None;
        }
        placed[index] |= bit;
        peers_by_digit[index] |= PEERS[cell];
    }

    let cross_cells = lines.into_iter().fold(0, |mask, line| mask | line);
    let mut excluded = [0; 9];
    for digit in 0..9 {
        excluded[digit] = (pattern_cells & !placed[digit]) | peers_by_digit[digit];
        if placed[digit] == 0 {
            continue;
        }
        // A true base digit has a target in at least one cross-line. Fill its
        // remaining cross-lines with mutually compatible cells. A candidate
        // outside the pattern can survive only if it permits one such filling.
        let available = possible[digit] & !(pattern_cells | peers_by_digit[digit]);
        let mut open = lines.into_iter().filter(|line| line & placed[digit] == 0);
        let (sites, peers) = match (open.next(), open.next()) {
            (None, _) => (0, 0),
            (Some(line), None) => {
                let sites = line & available;
                if sites == 0 {
                    return None;
                }
                (
                    sites,
                    cells(sites).fold(u128::MAX, |common, cell| common & PEERS[cell]),
                )
            }
            (Some(first), Some(second)) => {
                let mut sites = 0;
                let mut peers = u128::MAX;
                for left in cells(first & available) {
                    for right in cells(second & available & !PEERS[left]) {
                        sites |= cell_bit(left) | cell_bit(right);
                        peers &= PEERS[left] | PEERS[right];
                    }
                }
                if sites == 0 {
                    return None;
                }
                (sites, peers)
            }
        };
        excluded[digit] |= peers | (cross_cells & !(sites | placed[digit]));
    }
    Some(excluded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Candidate, ExocetAssignment, RankConstraint, RankOutcome, RankPattern, VerifiedTemplate,
        candidates, prove_rank_at, replay_rank_proof_at, technique_deductions_at,
    };
    use std::collections::BTreeSet;

    #[test]
    fn double_exocet_removals_replay_and_most_require_both_base_pairs() {
        for (example, depends_on_both) in Technique::DoubleExocet
            .practice_examples()
            .into_iter()
            .zip([37, 31, 37])
        {
            let position = example.position().unwrap();
            let board = position.values().unwrap();
            let verified = VerifiedTemplate::verify(board).unwrap();
            let hints = technique_deductions_at(&position, Technique::DoubleExocet).unwrap();
            let proof = hints
                .iter()
                .find(|hint| hint.actions == example.expected_actions)
                .unwrap();
            let HintEvidence::DoubleExocet(details) = &proof.evidence else {
                unreachable!()
            };
            let DoubleExocetProof {
                components,
                cross_lines,
                assignments,
            } = details.as_ref();
            let actual = components.each_ref().map(|component| ExocetAssignment {
                bases: component.bases.map(|cell| verified.solution()[cell]),
                targets: component.targets.map(|cell| verified.solution()[cell]),
            });
            assert!(assignments.contains(&actual));

            // Replay with independent cell and house-digit constraints. This
            // search never uses the detector's covers or its assignment table.
            let digits: BTreeSet<_> = components
                .iter()
                .flat_map(|part| part.covers.iter().map(|cover| cover.digit))
                .collect();
            let mut bases: Vec<_> = components
                .iter()
                .flat_map(|part| part.bases.map(RankConstraint::Cell))
                .collect();
            let mut covers: Vec<_> = components
                .iter()
                .flat_map(|part| part.targets.map(RankConstraint::Cell))
                .collect();
            for digit in digits {
                let open =
                    |house: House| !house.cells().into_iter().any(|cell| board[cell] == digit);
                let make = |house| RankConstraint::HouseDigit { house, digit };
                bases.extend(
                    cross_lines
                        .iter()
                        .copied()
                        .filter(|&house| open(house))
                        .map(make),
                );
                covers.extend(House::all().filter(|&house| open(house)).map(make));
            }
            let pattern = RankPattern { bases, covers };
            let weakened = components.each_ref().map(|part| {
                let mut weaker = pattern.clone();
                weaker.bases.retain(|constraint| !matches!(constraint, RankConstraint::Cell(cell) if part.bases.contains(cell)));
                weaker
            });
            let mut joint = Vec::new();
            for action in &proof.actions {
                let target = action.candidate();
                assert_ne!(verified.solution()[target.cell], target.digit);
                let RankOutcome::Proven(replayed) =
                    prove_rank_at(&position, &pattern, target, 100_000).unwrap()
                else {
                    panic!("the local constraints must prove {target:?}");
                };
                assert!(replay_rank_proof_at(&position, &replayed).unwrap());
                if weakened.iter().all(|weaker| {
                    prove_rank_at(&position, weaker, target, 100_000) == Ok(RankOutcome::Compatible)
                }) {
                    joint.push(target);
                }
            }
            assert_eq!(joint.len(), depends_on_both);
            if components[0].bases == [39, 41] {
                let masks = candidates(&board).unwrap();
                let shared_peers = [27, 28, 44, 49]
                    .into_iter()
                    .flat_map(|cell| [2, 4, 5, 9].map(|digit| Candidate { cell, digit }));
                // The published cover rows for digits 2, 4, 5, and 9.
                let cover_rows = [(2, [0, 8]), (4, [0, 1]), (5, [0, 1]), (9, [1, 8])];
                let outside_cross_lines = cover_rows.into_iter().flat_map(|(digit, rows)| {
                    rows.into_iter().flat_map(move |row| {
                        [0, 1, 3, 5, 6, 7].map(|column| Candidate {
                            cell: row * 9 + column,
                            digit,
                        })
                    })
                });
                let published: BTreeSet<_> = shared_peers
                    .chain(outside_cross_lines)
                    .filter(|target| masks[target.cell] & (1 << (target.digit - 1)) != 0)
                    .collect();
                assert_eq!(published.len(), 39);
                assert!(published.iter().all(|target| {
                    proof
                        .actions
                        .iter()
                        .any(|action| action.candidate() == *target)
                }));
                assert!(joint.iter().all(|target| published.contains(target)));
            }
        }
    }
}
