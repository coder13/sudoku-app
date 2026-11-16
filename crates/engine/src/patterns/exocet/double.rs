use super::{
    Axis, BasePair, ControlFlow, Deduction, HintEvidence, House, PEERS, Pattern, PatternAnalysis,
    PatternSearch, Technique, bit_indices, cell_bit, cells, house_cells, report_eliminations,
    target_cells,
};
use crate::{DoubleExocetProof, ExocetComponent};

mod paired;

const CROSS_LINE_NODE_LIMIT: u32 = 8_192;

pub(super) fn visit(
    search: &PatternSearch<'_>,
    possible: &[u128; 9],
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    for axis in [Axis::Horizontal, Axis::Vertical] {
        let pairs = super::grouped::target_pairs(search, axis);
        for start in [0, 3, 6] {
            let band = axis.band_cells(start);
            let pair_lines = super::grouped::pair_lines(&pairs, band)[0];
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
                                || (left.digits | right.digits).count_ones() < 4
                            {
                                continue;
                            }
                            for third in third_box * 3..third_box * 3 + 3 {
                                let mut lines = [0; 3];
                                lines[left_box] = left.gap_line;
                                lines[right_box] = right.gap_line;
                                lines[third_box] = third;
                                let houses = lines.map(|line| axis.cross(line));
                                let first = components(left, houses, search, possible);
                                if !first.is_empty() {
                                    let second = components(right, houses, search, possible);
                                    for left in &first {
                                        for right in &second {
                                            combine(
                                                [left, right],
                                                houses,
                                                search,
                                                possible,
                                                CROSS_LINE_NODE_LIMIT,
                                                visit,
                                            )?;
                                        }
                                    }
                                }
                                if lines.iter().any(|&line| pair_lines & (1 << line) != 0) {
                                    paired::visit(
                                        [left, right],
                                        houses,
                                        lines.map(|line| pairs[line].as_slice()),
                                        search,
                                        possible,
                                        visit,
                                    )?;
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
    node_limit: u32,
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
    let mut independent = CaseAnalysis::new(*search.positions_by_digit());
    let mut joint = CaseAnalysis::new(*search.positions_by_digit());
    let mut cross_lines =
        CrossLineSearch::new(line_cells, possible, left.digits | right.digits, node_limit);
    let mut complete = true;
    for &first in &left.analysis.assignments {
        for &second in &right.analysis.assignments {
            let left_digits = first.bases.into_iter().chain(first.targets);
            let right_digits = second.bases.into_iter().chain(second.targets);
            let placements = left
                .cells()
                .chain(right.cells())
                .zip(left_digits.chain(right_digits));
            let Some(mut case) = Case::new(placements) else {
                continue;
            };
            let Some(excluded) = case.independent_removals(possible, line_cells) else {
                continue;
            };
            independent.assignments.push([first, second]);
            intersect(&mut independent.removals, excluded);
            if complete {
                match cross_lines.support(&mut case, &mut joint.removals) {
                    Some(true) => joint.assignments.push([first, second]),
                    Some(false) => {}
                    None => complete = false,
                }
            }
        }
    }
    // A bounded search must never remove candidates from a partially explored
    // case table. The independent per-digit check remains valid on its own.
    let CaseAnalysis {
        assignments,
        mut removals,
    } = if complete { joint } else { independent };
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
            joint_cross_line_support: complete,
            assignments,
        }))
    })
}

struct CaseAnalysis {
    assignments: Vec<[crate::ExocetAssignment; 2]>,
    removals: [u128; 9],
}

impl CaseAnalysis {
    fn new(removals: [u128; 9]) -> Self {
        Self {
            assignments: Vec::new(),
            removals,
        }
    }
}

fn intersect(removals: &mut [u128; 9], excluded: [u128; 9]) {
    for (remaining, excluded) in removals.iter_mut().zip(excluded) {
        *remaining &= excluded;
    }
}

#[derive(Default)]
struct Case {
    occupied: u128,
    placed: [u128; 9],
    peers: [u128; 9],
}

impl Case {
    fn new(placements: impl Iterator<Item = (usize, u8)>) -> Option<Self> {
        let mut state = Self::default();
        for (cell, digit) in placements {
            let digit = usize::from(digit - 1);
            if state.peers[digit] & cell_bit(cell) != 0 {
                return None;
            }
            state.place(cell, digit);
        }
        Some(state)
    }

    fn place(&mut self, cell: usize, digit: usize) -> u128 {
        let bit = cell_bit(cell);
        let previous_peers = self.peers[digit];
        self.occupied |= bit;
        self.placed[digit] |= bit;
        self.peers[digit] |= PEERS[cell];
        previous_peers
    }

    fn undo(&mut self, cell: usize, digit: usize, previous_peers: u128) {
        let bit = cell_bit(cell);
        self.occupied ^= bit;
        self.placed[digit] ^= bit;
        self.peers[digit] = previous_peers;
    }

    fn excluded(&self, digit: usize) -> u128 {
        (self.occupied & !self.placed[digit]) | self.peers[digit]
    }

    fn independent_removals(&self, possible: &[u128; 9], lines: [u128; 3]) -> Option<[u128; 9]> {
        let cross_cells = lines.into_iter().fold(0, |mask, line| mask | line);
        let mut excluded = std::array::from_fn(|digit| self.excluded(digit));
        for (digit, excluded) in excluded.iter_mut().enumerate() {
            let placed = self.placed[digit];
            if placed == 0 {
                continue;
            }
            // A placed base digit has a target on at least one cross-line.
            // Check that its remaining lines admit compatible occurrences.
            let available = possible[digit] & !(self.occupied | self.peers[digit]);
            let mut open = lines.into_iter().filter(|line| line & placed == 0);
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
            *excluded |= peers | (cross_cells & !(sites | placed));
        }
        Some(excluded)
    }
}

struct CrossLineSearch {
    lines: [u128; 3],
    sites: [u128; 27],
    required: u32,
    remaining: u32,
}

impl CrossLineSearch {
    fn new(lines: [u128; 3], possible: &[u128; 9], digits: u16, remaining: u32) -> Self {
        let mut search = Self {
            lines,
            sites: [0; 27],
            required: 0,
            remaining,
        };
        for digit in bit_indices(digits) {
            for index in 0..3 {
                search.require(index, digit, possible[digit]);
            }
        }
        search
    }

    fn require(&mut self, line: usize, digit: usize, possible: u128) {
        let slot = digit * 3 + line;
        self.required |= 1 << slot;
        self.sites[slot] = possible & self.lines[line];
    }

    fn support(&mut self, case: &mut Case, removals: &mut [u128; 9]) -> Option<bool> {
        let mut pending = self.required;
        for slot in cells(u128::from(self.required)) {
            if self.lines[slot % 3] & case.placed[slot / 3] != 0 {
                pending &= !(1 << slot);
            }
        }
        self.fill(pending, case, removals)
    }

    fn fill(&mut self, pending: u32, case: &mut Case, removals: &mut [u128; 9]) -> Option<bool> {
        self.remaining = self.remaining.checked_sub(1)?;
        if pending == 0 {
            // A completion keeps the candidates it uses and any candidate
            // that can coexist with all of its placements.
            intersect(removals, std::array::from_fn(|digit| case.excluded(digit)));
            return Some(true);
        }

        let mut slot = 0;
        let mut sites = 0;
        let mut fewest = 10;
        for next in cells(u128::from(pending)) {
            let digit = next / 3;
            let available = self.sites[next] & !(case.occupied | case.peers[digit]);
            let count = available.count_ones();
            if count == 0 {
                return Some(false);
            }
            if count < fewest {
                (slot, sites, fewest) = (next, available, count);
            }
        }

        let pending = pending & !(1 << slot);
        let digit = slot / 3;
        let mut supported = false;
        for cell in cells(sites) {
            let peers = case.place(cell, digit);
            let completed = self.fill(pending, case, removals);
            case.undo(cell, digit, peers);
            supported |= completed?;
        }
        Some(supported)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Candidate, ExocetAssignment, Hint, PositionSnapshot, RankConstraint, RankOutcome,
        RankPattern, VerifiedTemplate, candidates, parse_givens, prove_rank_at, rank_deductions_at,
        replay_rank_proof_at, technique_deductions_at,
    };
    use std::collections::BTreeSet;

    // SudokuWiki's Unsolvable #28, cited in the Double Exocet discussion.
    const UNSOLVABLE_28: &str =
        "600008940900006100070040000200610000000000200089002000000060005000000030800001600";

    #[test]
    fn double_exocet_removals_replay_and_most_require_both_base_pairs() {
        for (example, depends_on_both) in Technique::DoubleExocet
            .practice_examples()
            .into_iter()
            .zip([80, 35, 49])
        {
            let position = example.position().unwrap();
            let hints = technique_deductions_at(&position, Technique::DoubleExocet).unwrap();
            let hint = hints
                .iter()
                .find(|hint| hint.actions == example.expected_actions)
                .unwrap();
            assert_rank_agrees(&position, hint, depends_on_both);
        }
    }

    #[test]
    fn double_exocet_keeps_both_published_rules_on_unsolvable_165() {
        let position = Technique::DoubleExocet
            .practice_example()
            .position()
            .unwrap();
        let board = position.values().unwrap();
        let hints = technique_deductions_at(&position, Technique::DoubleExocet).unwrap();
        let hint = &hints[0];
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
        assert!(published.is_subset(&actions(hint)));
    }

    #[test]
    fn joint_cross_line_support_finds_every_local_removal_on_unsolvable_28() {
        let board = parse_givens(UNSOLVABLE_28).unwrap();
        let position = PositionSnapshot::new(board);
        let hints = technique_deductions_at(&position, Technique::DoubleExocet).unwrap();
        let [hint] = hints.as_slice() else {
            panic!("expected the two published base pairs");
        };
        assert_eq!(hint.actions.len(), 71);
        assert_rank_agrees(&position, hint, 71);

        let masks = candidates(&board).unwrap();
        let search = PatternSearch::new(&board, &masks);
        let possible = super::super::positions_with_values(&search);
        let left = BasePair::new(&search, Axis::Horizontal, 3, 0, 0).unwrap();
        let right = BasePair::new(&search, Axis::Horizontal, 5, 1, 2).unwrap();
        let lines = [House::Column(0), House::Column(5), House::Column(6)];
        let left = components(&left, lines, &search, &possible);
        let right = components(&right, lines, &search, &possible);
        let [left] = left.as_slice() else {
            panic!("expected the first Junior Exocet");
        };
        let [right] = right.as_slice() else {
            panic!("expected the second Junior Exocet");
        };

        // Cut off the joint search partway through this same geometry.
        let fallback: Hint = combine([left, right], lines, &search, &possible, 40, &mut |step| {
            ControlFlow::Break(step)
        })
        .break_value()
        .unwrap()
        .into();
        let HintEvidence::DoubleExocet(fallback_proof) = &fallback.evidence else {
            panic!("expected the independent support proof");
        };
        assert!(!fallback_proof.joint_cross_line_support);
        assert_eq!(fallback.actions.len(), 40);
        assert!(actions(&fallback).is_subset(&actions(hint)));
    }

    fn actions(hint: &Hint) -> BTreeSet<Candidate> {
        hint.actions
            .iter()
            .map(|action| action.candidate())
            .collect()
    }

    fn assert_rank_agrees(position: &PositionSnapshot, hint: &Hint, depends_on_both: usize) {
        let board = position.values().unwrap();
        let verified = VerifiedTemplate::verify(board).unwrap();
        let HintEvidence::DoubleExocet(details) = &hint.evidence else {
            panic!("expected a Double Exocet proof");
        };
        let DoubleExocetProof {
            components,
            cross_lines,
            assignments,
            joint_cross_line_support,
        } = details.as_ref();
        assert!(joint_cross_line_support);
        let actual = components.each_ref().map(|component| ExocetAssignment {
            bases: component.bases.map(|cell| verified.solution()[cell]),
            targets: component.targets.map(|cell| verified.solution()[cell]),
        });
        assert!(assignments.contains(&actual));

        let pattern = local_rank_pattern(position, components, *cross_lines);
        let scan = rank_deductions_at(position, &pattern, 100_000).unwrap();
        assert!(scan.complete);
        let standalone: BTreeSet<_> = technique_deductions_at(position, Technique::Exocet)
            .unwrap()
            .iter()
            .flat_map(actions)
            .collect();
        let jointly_proved: BTreeSet<_> = scan
            .proofs
            .iter()
            .map(|proof| proof.target)
            .filter(|target| !standalone.contains(target))
            .collect();
        assert_eq!(actions(hint), jointly_proved);

        let weakened = components.each_ref().map(|part| {
            let mut weaker = pattern.clone();
            weaker.bases.retain(|constraint| !matches!(constraint, RankConstraint::Cell(cell) if part.bases.contains(cell)));
            weaker
        });
        let mut joint = 0;
        for proof in scan.proofs {
            let target = proof.target;
            assert_ne!(verified.solution()[target.cell], target.digit);
            assert!(replay_rank_proof_at(position, &proof).unwrap());
            if jointly_proved.contains(&target)
                && weakened.iter().all(|weaker| {
                    prove_rank_at(position, weaker, target, 100_000) == Ok(RankOutcome::Compatible)
                })
            {
                joint += 1;
            }
        }
        assert_eq!(joint, depends_on_both);
    }
    fn local_rank_pattern(
        position: &PositionSnapshot,
        components: &[ExocetComponent; 2],
        cross_lines: [House; 3],
    ) -> RankPattern {
        // These independent cell and house-digit constraints never use the
        // detector's covers or assignment table.
        let board = position.values().unwrap();
        let masks = crate::hints::checked_position(&board, position.removals()).unwrap();
        let digits: BTreeSet<_> = components
            .iter()
            .flat_map(|part| part.bases)
            .flat_map(|cell| bit_indices(masks.masks()[cell]).map(|digit| digit as u8 + 1))
            .collect();
        let mut bases: Vec<_> = components
            .iter()
            .flat_map(|part| part.bases.map(RankConstraint::Cell))
            .collect();
        let mut covers: Vec<_> = cross_lines
            .iter()
            .flat_map(|line| line.cells())
            .filter(|&cell| board[cell] == 0)
            .map(RankConstraint::Cell)
            .collect();
        for digit in digits {
            let open = |house: House| !house.cells().into_iter().any(|cell| board[cell] == digit);
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
        RankPattern { bases, covers }
    }

    #[test]
    fn partially_overlapping_pools_of_five_to_seven_digits_prove_joint_removals() {
        // Prepared from Unsolvable 165, the diagram at redd.it/1uezli6,
        // and Monhard line 11. Each part uses four digits.
        let fixtures = [
            (
                "790006130210700600003010907000000000000000370030108000948030001027080003000400050",
                &[
                    (29, 282),
                    (39, 16),
                    (40, 24),
                    (41, 16),
                    (52, 32),
                    (53, 8),
                    (76, 32),
                ][..],
                [[39, 41], [51, 52]],
                5,
                6,
                57,
            ),
            (
                "198002046030400029504008107005817400200640000000520070050000200000000001001280000",
                &[(6, 4), (14, 16), (67, 32), (68, 44), (72, 256), (73, 8)][..],
                [[72, 73], [66, 67]],
                6,
                4,
                13,
            ),
            (
                "980700000007250008200089070760000005394500000100437060570000000012300700600071500",
                &[
                    (2, 32),
                    (4, 32),
                    (5, 32),
                    (6, 2),
                    (15, 256),
                    (24, 32),
                    (56, 384),
                    (57, 384),
                    (58, 256),
                    (59, 128),
                    (61, 1),
                    (79, 388),
                ][..],
                [[15, 24], [70, 79]],
                7,
                6,
                38,
            ),
        ];
        for (grid, masks, expected_bases, width, extra_digit, count) in fixtures {
            let board = parse_givens(grid).unwrap();
            let mut position = PositionSnapshot::new(board);
            for &(cell, mask) in masks {
                position.eliminations[cell] = mask;
            }
            let verified = VerifiedTemplate::verify(board).unwrap();
            let hints = technique_deductions_at(&position, Technique::DoubleExocet).unwrap();
            let (hint, proof) = hints
                .iter()
                .find_map(|hint| {
                    let HintEvidence::DoubleExocet(proof) = &hint.evidence else {
                        return None;
                    };
                    let bases = proof.components.each_ref().map(|part| part.bases);
                    (bases == expected_bases).then_some((hint, proof))
                })
                .unwrap();
            assert!(proof.joint_cross_line_support);
            assert_eq!(hint.actions.len(), count);
            let pools = proof.components.each_ref().map(|part| {
                part.covers
                    .iter()
                    .map(|cover| cover.digit)
                    .collect::<BTreeSet<_>>()
            });
            assert_eq!(pools[0].len(), 4);
            assert_eq!(pools[1].len(), 4);
            assert_eq!(pools[0].union(&pools[1]).count(), width);
            assert_eq!(pools[0].intersection(&pools[1]).count(), 8 - width);
            let pattern = local_rank_pattern(&position, &proof.components, proof.cross_lines);
            let weakened = expected_bases.map(|part| {
                let mut smaller = pattern.clone();
                smaller.bases.retain(
                    |item| !matches!(item, RankConstraint::Cell(cell) if part.contains(cell)),
                );
                smaller
            });
            let mut without_extra_digit = pattern.clone();
            without_extra_digit.bases.retain(|item| !matches!(item, RankConstraint::HouseDigit { digit, .. } if *digit == extra_digit));
            let mut witnessed = false;
            for action in &hint.actions {
                let target = action.candidate();
                assert_ne!(verified.solution()[target.cell], target.digit);
                let RankOutcome::Proven(certificate) =
                    prove_rank_at(&position, &pattern, target, 100_000).unwrap()
                else {
                    panic!("expected a local proof for {target:?}");
                };
                assert!(replay_rank_proof_at(&position, &certificate).unwrap());
                if !witnessed {
                    witnessed = weakened
                        .iter()
                        .chain([&without_extra_digit])
                        .all(|constraints| {
                            prove_rank_at(&position, constraints, target, 100_000)
                                == Ok(RankOutcome::Compatible)
                        });
                }
            }
            assert!(
                witnessed,
                "expected a deduction requiring both base pairs and the added digit at width {width}"
            );
        }
    }
}
