//! Project one clue at a time onto pairs of candidates. A missing support is
//! a weak link. This uses the clue's own finite alternatives, not a grid solve.
use super::{CompiledVariant, ProofPosition, VariantTechnique, digit_bit, digits};
use crate::Candidate;

impl CompiledVariant {
    pub(super) fn has_clue_links(&self) -> bool {
        !self.pair_clues.is_empty()
            || self.extended_logic
                && (!self.lines.is_empty()
                    || !self.cages.is_empty()
                    || !self.quadruples.is_empty()
                    || self.global_entropy.is_some())
    }

    pub(super) fn visit_clue_links(
        &self,
        position: &ProofPosition<'_>,
        same_digit_only: bool,
        mut visit: impl FnMut(Candidate, Candidate, VariantTechnique, &[usize]),
    ) {
        for clue in &self.pair_clues {
            if same_digit_only
                && !self.extended_logic
                && !matches!(
                    clue.source.technique,
                    VariantTechnique::AntiKing | VariantTechnique::AntiKnight
                )
            {
                continue;
            }
            for link in clue.links() {
                let [a, b] = link.cells;
                for left in digits(position.masks[a]) {
                    let target = if same_digit_only {
                        digit_bit(left)
                    } else {
                        crate::DIGITS
                    };
                    for right in digits(position.masks[b] & target) {
                        if !link.permits(left, right) {
                            visit(
                                Candidate {
                                    cell: a,
                                    digit: left,
                                },
                                Candidate {
                                    cell: b,
                                    digit: right,
                                },
                                clue.source.technique,
                                &clue.source.indices,
                            );
                        }
                    }
                }
            }
        }
        if !self.extended_logic {
            return;
        }
        let mut project = |cells: &[usize],
                           technique: VariantTechnique,
                           rule: usize,
                           support: &dyn Fn(&[u16], &mut [u16])| {
            if same_digit_only
                && (technique.difficulty() > crate::Difficulty::Medium
                    || self
                        .search_houses
                        .iter()
                        .any(|&i| cells.iter().all(|&c| self.house_masks[i] & (1 << c) != 0)))
            {
                return;
            }
            let mut domains: Vec<_> = cells.iter().map(|&cell| position.domain(cell)).collect();
            let mut baseline = vec![0; cells.len()];
            support(&domains, &mut baseline);
            let mut supported = vec![0; cells.len()];
            for (i, &a) in cells.iter().enumerate() {
                let original = domains[i];
                for left in digits(position.masks[a] & baseline[i]) {
                    domains[i] = digit_bit(left);
                    supported.fill(0);
                    support(&domains, &mut supported);
                    for (j, &b) in cells.iter().enumerate().skip(i + 1) {
                        let target = if same_digit_only {
                            digit_bit(left)
                        } else {
                            crate::DIGITS
                        };
                        for right in
                            digits(position.masks[b] & target & baseline[j] & !supported[j])
                        {
                            if a != b {
                                visit(
                                    Candidate {
                                        cell: a,
                                        digit: left,
                                    },
                                    Candidate {
                                        cell: b,
                                        digit: right,
                                    },
                                    technique,
                                    &[rule],
                                );
                            }
                        }
                    }
                }
                domains[i] = original;
            }
        };
        for line in &self.lines {
            project(&line.cells, line.technique, line.rule_index, &|ds, out| {
                line.support(ds, out)
            });
        }
        for cage in &self.cages {
            project(
                &cage.cells,
                VariantTechnique::CageCombinations,
                cage.reference[0],
                &|ds, out| {
                    out.copy_from_slice(&cage.support(ds)[..ds.len()]);
                },
            );
        }
        for quad in &self.quadruples {
            project(
                &quad.cells,
                VariantTechnique::Quadruple,
                quad.rule_index,
                &|ds, out| out.copy_from_slice(&quad.support(ds.try_into().unwrap())),
            );
        }
        for (rule, cells) in self.entropy_windows() {
            project(&cells, VariantTechnique::GlobalEntropy, rule, &|ds, out| {
                out.copy_from_slice(&crate::variant::global_entropy::support_in_groups(
                    ds.try_into().unwrap(),
                    self.global_entropy_groups,
                ))
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CELLS, HintAction, PuzzleRule, VariantEvidence, VariantPuzzle};

    #[test]
    fn an_arrow_and_a_column_lock_a_digit_in_a_row() {
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.extended_logic = true;
        puzzle.rules.push(PuzzleRule::Arrow {
            circle: 2,
            cells: vec![12, 22],
        });
        let compiled = puzzle.compile().unwrap();
        let mut removed = [0; CELLS];
        for cell in [0, 1, 4, 5, 6, 7, 8] {
            removed[cell] = digit_bit(5);
        }
        let position = compiled.proof_position(&[0; CELLS], &removed).unwrap();
        let mut links = Vec::new();
        compiled.visit_clue_links(&position, false, |a, b, technique, _| {
            if a == (Candidate { cell: 2, digit: 5 }) && b.cell == 12 {
                links.push((b.digit, technique));
            }
        });
        assert!(links.contains(&(5, VariantTechnique::Arrow)));
        assert!(!links.contains(&(3, VariantTechnique::Arrow)));
        let target = HintAction::Eliminate(Candidate { cell: 12, digit: 5 });
        assert!(compiled.explain(&position, VariantTechnique::LockedCandidates).iter().any(|step|
            step.actions.contains(&target) && matches!(&step.evidence, VariantEvidence::PeerLock { conflicts, .. } if conflicts.len() == 2)));
    }
}
