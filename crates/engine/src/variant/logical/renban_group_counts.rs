use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantRenbanGroupConflict,
    VariantRenbanGroupPlacement, VariantRenbanGroupProjection, VariantRenbanGroupProof,
    VariantTechnique,
};
use crate::{
    CELLS, Candidate, HintAction,
    hints::{digit_bit, digits},
    variant::{
        cells_in,
        lines::{LineConstraint, renban_support},
        search::record_support,
    },
};

const GROUPS: [u16; 2] = [0b000_001_111, 0b111_100_000];

type Domains = [u16; CELLS];

impl CompiledVariant {
    pub(super) fn renban_group_counts(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let lines: Vec<_> = self
            .lines
            .iter()
            .filter(|line| line.technique.id() == "renban" && (3..=4).contains(&line.cells.len()))
            .collect();
        if lines.len() < 3 {
            return;
        }

        // Only house visibility is used to propagate either assumed or forced digits.
        let peers: [u128; CELLS] = std::array::from_fn(|cell| {
            self.memberships[cell]
                .iter()
                .fold(0, |peers, &house| peers | self.house_masks[house])
                & !(1 << cell)
        });
        let affected = lines
            .iter()
            .flat_map(|line| &line.cells)
            .fold(0, |cells, &cell| cells | peers[cell] | 1 << cell);
        let baseline = std::array::from_fn(|cell| position.domain(cell));
        let Some(ordinary) = project(&lines, &baseline) else {
            return;
        };
        if self.group_conflict(group_cells(&ordinary)).is_some() {
            return;
        }

        for cell in cells_in(affected) {
            if position.masks[cell].count_ones() < 2 {
                continue;
            }
            for digit in digits(position.masks[cell]) {
                let assumption = Candidate { cell, digit };
                let Some(assumed) = place(baseline, &peers, assumption) else {
                    continue;
                };
                let Some(initial) = project(&lines, &assumed) else {
                    continue;
                };
                let groups = group_cells(&initial);
                let direct = self.group_conflict(groups);
                let proof = match direct {
                    Some(conflict) => {
                        let cells = conflict.cells.iter().fold(0, |m, &cell| m | 1 << cell);
                        let initial = projection_evidence(&lines, &assumed, cells);
                        (!initial.is_empty()).then_some(VariantRenbanGroupProof {
                            assumption,
                            initial,
                            placement: None,
                            subsequent: Vec::new(),
                            conflict,
                        })
                    }
                    None => {
                        self.group_placement(&lines, &peers, assumption, &assumed, &initial, groups)
                    }
                };
                if let Some(proof) = proof {
                    proofs.push(VariantDeduction {
                        technique: VariantTechnique::RenbanGroupCounts,
                        actions: vec![HintAction::Eliminate(assumption)],
                        evidence: VariantEvidence::RenbanGroupCounts(Box::new(proof)),
                    });
                }
            }
        }
        // Ordinary hints and first-step traces both present the short proofs first.
        proofs.sort_by_key(|deduction| {
            let VariantEvidence::RenbanGroupCounts(proof) = &deduction.evidence else {
                unreachable!("only Renban group proofs are collected here");
            };
            (
                proof.placement.is_some(),
                proof.initial.len() + proof.subsequent.len(),
            )
        });
    }

    fn group_placement(
        &self,
        lines: &[&LineConstraint],
        peers: &[u128; CELLS],
        assumption: Candidate,
        assumed: &Domains,
        initial: &Domains,
        groups: [u128; 2],
    ) -> Option<VariantRenbanGroupProof> {
        for line in lines {
            let length = line.cells.len();
            let mut local = [0; 4];
            for (mask, &cell) in local.iter_mut().zip(&line.cells) {
                *mask = initial[cell];
            }
            let mut supported = [0; 4];
            let mut rejected = Vec::new();
            for start in 1..=10 - length as u8 {
                let interval = ((1 << length) - 1) << (start - 1);
                let mut fit = [0; 4];
                if !record_support::<4, 512>(interval, &local[..length], &mut fit, &mut [None; 512])
                {
                    continue;
                }
                let mut with_line = groups;
                for (&cell, &mask) in line.cells.iter().zip(&fit) {
                    mark_groups(&mut with_line, cell, mask);
                }
                if with_line != groups
                    && let Some(conflict) = self.group_conflict(with_line)
                {
                    rejected.push((start, conflict));
                } else {
                    for (allowed, mask) in supported.iter_mut().zip(fit) {
                        *allowed |= mask;
                    }
                }
            }
            if rejected.is_empty() || supported[0] == 0 {
                continue;
            }
            for (&cell, &mask) in line.cells.iter().zip(&supported) {
                if mask.count_ones() != 1 || initial[cell].count_ones() <= 1 {
                    continue;
                }
                let candidate = Candidate {
                    cell,
                    digit: mask.trailing_zeros() as u8 + 1,
                };
                let Some(placed) = place(*initial, peers, candidate) else {
                    continue;
                };
                let Some(subsequent) = project(lines, &placed) else {
                    continue;
                };
                let Some(conflict) = self.group_conflict(group_cells(&subsequent)) else {
                    continue;
                };
                let mut causes = line
                    .cells
                    .iter()
                    .chain(conflict.cells.iter())
                    .fold(0, |cells, &cell| cells | 1 << cell);
                for (_, excluded) in &rejected {
                    causes |= excluded
                        .cells
                        .iter()
                        .fold(0, |cells, &cell| cells | 1 << cell);
                }
                let after = projection_evidence(lines, &placed, causes);
                for projection in &after {
                    causes |= projection
                        .cells
                        .iter()
                        .fold(0, |cells, &cell| cells | 1 << cell);
                }
                let initial = projection_evidence(lines, assumed, causes);
                return Some(VariantRenbanGroupProof {
                    assumption,
                    initial,
                    placement: Some(VariantRenbanGroupPlacement {
                        line: VariantRenbanGroupProjection {
                            rule: line.rule_index,
                            cells: line.cells.clone(),
                            domains: local[..length].to_vec(),
                            supported: supported[..length].to_vec(),
                        },
                        rejected,
                        candidate,
                    }),
                    subsequent: after,
                    conflict,
                });
            }
        }
        None
    }

    fn group_conflict(&self, groups: [u128; 2]) -> Option<VariantRenbanGroupConflict> {
        self.house_masks
            .iter()
            .enumerate()
            .find_map(|(index, &house)| {
                groups.into_iter().zip(GROUPS).find_map(|(forced, digits)| {
                    let crowded = forced & house;
                    (crowded.count_ones() > 4).then(|| {
                        let mut cells = cells_in(crowded);
                        VariantRenbanGroupConflict {
                            house: self.houses[index].kind,
                            cells: std::array::from_fn(|_| {
                                cells.next().expect("five crowded cells")
                            }),
                            digits,
                        }
                    })
                })
            })
    }
}

fn place(mut domains: Domains, peers: &[u128; CELLS], candidate: Candidate) -> Option<Domains> {
    let mask = digit_bit(candidate.digit);
    domains[candidate.cell] &= mask;
    for cell in cells_in(peers[candidate.cell]) {
        domains[cell] &= !mask;
    }
    (!domains.contains(&0)).then_some(domains)
}

fn line_support(line: &LineConstraint, position: &Domains) -> ([u16; 4], [u16; 4]) {
    let mut domains = [0; 4];
    for (mask, &cell) in domains.iter_mut().zip(&line.cells) {
        *mask = position[cell];
    }
    let mut allowed = [0; 4];
    let length = line.cells.len();
    renban_support::<9, 512>(&domains[..length], &mut allowed[..length]);
    (domains, allowed)
}

fn project(lines: &[&LineConstraint], domains: &Domains) -> Option<Domains> {
    // Every line reads the same snapshot, so projections have no hidden dependencies.
    let mut projected = *domains;
    for line in lines {
        let (_, allowed) = line_support(line, domains);
        for (&cell, mask) in line.cells.iter().zip(allowed) {
            projected[cell] &= mask;
        }
    }
    (!projected.contains(&0)).then_some(projected)
}

fn projection_evidence(
    lines: &[&LineConstraint],
    position: &Domains,
    causes: u128,
) -> Vec<VariantRenbanGroupProjection> {
    lines
        .iter()
        .filter_map(|line| {
            let (domains, supported) = line_support(line, position);
            line.cells
                .iter()
                .enumerate()
                .any(|(i, &cell)| causes & (1 << cell) != 0 && domains[i] != supported[i])
                .then(|| VariantRenbanGroupProjection {
                    rule: line.rule_index,
                    cells: line.cells.clone(),
                    domains: domains[..line.cells.len()].to_vec(),
                    supported: supported[..line.cells.len()].to_vec(),
                })
        })
        .collect()
}

fn mark_groups(groups: &mut [u128; 2], cell: usize, mask: u16) {
    for (set, group) in groups.iter_mut().zip(GROUPS) {
        if mask != 0 && mask & !group == 0 {
            *set |= 1 << cell;
        }
    }
}

fn group_cells(position: &Domains) -> [u128; 2] {
    let mut groups = [0; 2];
    for (cell, &mask) in position.iter().enumerate() {
        mark_groups(&mut groups, cell, mask);
    }
    groups
}

#[cfg(all(test, feature = "wasm-api"))]
mod tests {
    use super::*;
    use crate::{VariantHouseKind, VariantPuzzle, parse_givens};

    fn control() -> (VariantPuzzle, crate::Board, Domains) {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/renban-coach.json"
        ))
        .unwrap();
        let puzzle: VariantPuzzle = serde_json::from_value(
            fixtures["examples"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["url"].as_str().unwrap().ends_with("/BSms"))
                .unwrap()["puzzle"]
                .clone(),
        )
        .unwrap();
        let mut entries = [0; CELLS];
        entries[53] = 5;
        let mut eliminated = [0; CELLS];
        eliminated[67] = digit_bit(1) | digit_bit(2) | digit_bit(4);
        (puzzle, entries, eliminated)
    }

    fn literal(domains: &[u16], start: Option<u8>) -> Vec<u16> {
        fn assign(domains: &[u16], unused: u16, row: &mut Vec<u8>, result: &mut [u16]) {
            if row.len() == domains.len() {
                for (out, &digit) in result.iter_mut().zip(row.iter()) {
                    *out |= digit_bit(digit);
                }
                return;
            }
            for digit in 1..=9 {
                let bit = digit_bit(digit);
                if bit & unused & domains[row.len()] != 0 {
                    row.push(digit);
                    assign(domains, unused ^ bit, row, result);
                    row.pop();
                }
            }
        }
        let mut out = vec![0; domains.len()];
        for first in 1..=10 - domains.len() as u8 {
            if start.is_some_and(|allowed| allowed != first) {
                continue;
            }
            let interval = (first..first + domains.len() as u8)
                .map(digit_bit)
                .reduce(|a, b| a | b)
                .unwrap();
            assign(domains, interval, &mut Vec::new(), &mut out);
        }
        out
    }

    fn group_proofs(
        puzzle: &VariantPuzzle,
        entries: &crate::Board,
        eliminated: &Domains,
    ) -> Vec<VariantDeduction> {
        puzzle
            .compile()
            .unwrap()
            .deductions(entries, eliminated, VariantTechnique::RenbanGroupCounts)
            .unwrap()
    }

    // Replay the serialized premises without the detector's matching or masks
    // for group counts. Each line uses literal permutations of a digit interval.
    fn replay(
        compiled: &CompiledVariant,
        position: &ProofPosition<'_>,
        proof: &VariantRenbanGroupProof,
    ) {
        let place = |domains: &mut Domains, candidate: Candidate| {
            let mask = digit_bit(candidate.digit);
            assert_ne!(domains[candidate.cell] & mask, 0);
            domains[candidate.cell] = mask;
            for house in &compiled.houses {
                if !house.cells.contains(&candidate.cell) {
                    continue;
                }
                for &cell in &house.cells {
                    if cell != candidate.cell {
                        domains[cell] &= !mask;
                        assert_ne!(domains[cell], 0);
                    }
                }
            }
        };
        let project = |domains: &mut Domains, deductions: &[VariantRenbanGroupProjection]| {
            let before = *domains;
            for deduction in deductions {
                let local = deduction
                    .cells
                    .iter()
                    .map(|&cell| before[cell])
                    .collect::<Vec<_>>();
                assert_eq!(local, deduction.domains);
                let masks = literal(&local, None);
                assert_eq!(masks, deduction.supported);
                for (&cell, mask) in deduction.cells.iter().zip(masks) {
                    domains[cell] &= mask;
                }
            }
        };
        let check = |domains: &Domains, conflict: &VariantRenbanGroupConflict| {
            let house = compiled
                .houses
                .iter()
                .find(|house| house.kind == conflict.house)
                .unwrap();
            assert_eq!(conflict.digits.count_ones(), 4);
            assert!(
                conflict
                    .cells
                    .iter()
                    .all(|&cell| house.cells.contains(&cell)
                        && domains[cell] != 0
                        && domains[cell] & !conflict.digits == 0)
            );
        };

        let mut domains = std::array::from_fn(|cell| position.domain(cell));
        place(&mut domains, proof.assumption);
        project(&mut domains, &proof.initial);
        if let Some(placement) = &proof.placement {
            let local = placement
                .line
                .cells
                .iter()
                .map(|&cell| domains[cell])
                .collect::<Vec<_>>();
            assert_eq!(local, placement.line.domains);
            let mut good = vec![0; local.len()];
            for start in 1..=10 - local.len() as u8 {
                let options = literal(&local, Some(start));
                if options.contains(&0) {
                    continue;
                }
                if let Some((_, rejected)) =
                    placement.rejected.iter().find(|(first, _)| *first == start)
                {
                    let mut hypothetical = domains;
                    for (&cell, mask) in placement.line.cells.iter().zip(options) {
                        hypothetical[cell] = mask;
                    }
                    check(&hypothetical, rejected);
                } else {
                    for (mask, options) in good.iter_mut().zip(options) {
                        *mask |= options;
                    }
                }
            }
            assert_eq!(good, placement.line.supported);
            let index = placement
                .line
                .cells
                .iter()
                .position(|&cell| cell == placement.candidate.cell)
                .unwrap();
            assert_eq!(good[index], digit_bit(placement.candidate.digit));
            place(&mut domains, placement.candidate);
            project(&mut domains, &proof.subsequent);
        }
        check(&domains, &proof.conflict);
    }

    #[test]
    fn short_and_extended_group_count_proofs_use_the_published_lines() {
        let (puzzle, entries, mut eliminated) = control();
        let proofs = group_proofs(&puzzle, &entries, &eliminated);
        let compiled = puzzle.compile().unwrap();
        let position = compiled.proof_position(&entries, &eliminated).unwrap();
        let solution = parse_givens(
            "579861423831245769462379158315928647697453281284617935723186594956734812148592376",
        )
        .unwrap();
        assert_eq!(proofs.len(), 2);
        for (answer, wanted) in proofs.iter().zip([75, 49]) {
            let VariantEvidence::RenbanGroupCounts(proof) = &answer.evidence else {
                panic!("expected group count evidence");
            };
            let candidate = Candidate {
                cell: wanted,
                digit: 3,
            };
            assert_eq!(proof.assumption, candidate);
            assert_eq!(answer.actions, [HintAction::Eliminate(candidate)]);
            assert_ne!(solution[wanted], candidate.digit);
            assert_eq!(proof.conflict.house, VariantHouseKind::Region(7));
            assert_eq!(proof.conflict.cells, [57, 58, 66, 67, 76]);
            assert_eq!(proof.conflict.digits, GROUPS[1]);
            replay(&compiled, &position, proof);
        }
        let VariantEvidence::RenbanGroupCounts(direct) = &proofs[0].evidence else {
            unreachable!()
        };
        assert!(direct.placement.is_none());
        let VariantEvidence::RenbanGroupCounts(extended) = &proofs[1].evidence else {
            unreachable!()
        };
        let step = extended.placement.as_ref().unwrap();
        assert_eq!(step.line.rule, 3);
        assert_eq!(step.candidate, Candidate { cell: 21, digit: 3 });
        assert_eq!(step.rejected[0].0, 6);
        assert_eq!(step.rejected[0].1.house, VariantHouseKind::Column(3));
        assert_eq!(step.rejected[0].1.cells, [21, 30, 39, 48, 57]);
        assert_eq!(step.line.supported, literal(&step.line.domains, Some(1)));
        eliminated[75] |= digit_bit(3);
        assert_eq!(group_proofs(&puzzle, &entries, &eliminated).len(), 1);
        eliminated[49] |= digit_bit(3);
        assert!(group_proofs(&puzzle, &entries, &eliminated).is_empty());
    }

    #[test]
    fn each_premise_matters_and_digit_complement_uses_the_low_group() {
        let (puzzle, entries, eliminated) = control();
        for (target, sources) in [(75, &[4, 5, 8][..]), (49, &[3, 4, 5, 8][..])] {
            for &missing in sources {
                let mut without = puzzle.clone();
                without.rules.remove(missing);
                assert!(
                    group_proofs(&without, &entries, &eliminated)
                        .iter()
                        .all(|proof| {
                            proof.actions[0]
                                != HintAction::Eliminate(Candidate {
                                    cell: target,
                                    digit: 3,
                                })
                        })
                );
            }
        }
        let mut complemented = puzzle;
        complemented.givens = complemented
            .givens
            .map(|digit| if digit == 0 { 0 } else { 10 - digit });
        let removals = eliminated.map(|mask| mask.reverse_bits() >> 7);
        let results = group_proofs(&complemented, &entries, &removals);
        assert_eq!(results.len(), 2);
        for (deduction, cell) in results.iter().zip([75, 49]) {
            assert_eq!(
                deduction.actions,
                [HintAction::Eliminate(Candidate { cell, digit: 7 })]
            );
            let VariantEvidence::RenbanGroupCounts(evidence) = &deduction.evidence else {
                unreachable!()
            };
            assert_eq!(evidence.conflict.digits, GROUPS[0]);
        }
    }

    #[cfg(feature = "teaching")]
    #[test]
    fn exercise_proofs_replay_with_their_own_candidate_domains() {
        for exercise in
            crate::variant_practice_examples(VariantTechnique::RenbanGroupCounts).unwrap()
        {
            let compiled = exercise.position.puzzle.compile().unwrap();
            let position = compiled
                .proof_position(&exercise.position.entries, &exercise.position.eliminations)
                .unwrap();
            for deduction in group_proofs(
                &exercise.position.puzzle,
                &exercise.position.entries,
                &exercise.position.eliminations,
            ) {
                let VariantEvidence::RenbanGroupCounts(evidence) = &deduction.evidence else {
                    unreachable!()
                };
                replay(&compiled, &position, evidence);
            }
        }
    }
}
