use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantHouseKind,
    VariantTechnique, digit_bit,
};
use crate::{Candidate, HintAction, Technique};

impl CompiledVariant {
    pub(super) fn region_singles(
        &self,
        pos: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let mut assisted = Vec::new();
        for house in self
            .houses
            .iter()
            .filter(|h| matches!(h.kind, VariantHouseKind::Region(_)))
        {
            for digit in 1..=9 {
                let mut sites = house
                    .cells
                    .iter()
                    .copied()
                    .filter(|&c| pos.masks[c] & digit_bit(digit) != 0);
                let Some(a) = sites.next() else { continue };
                let placement = |cell| Candidate { cell, digit };
                let technique = VariantTechnique::Classic(Technique::HiddenSingleBox);
                if let Some(b) = sites.next() {
                    if sites.next().is_some() {
                        continue;
                    }
                    let possible = [
                        self.single_conflict(pos, a, digit),
                        self.single_conflict(pos, b, digit),
                    ];
                    if possible.iter().filter(|site| site.is_some()).count() == 1 {
                        for ((cell, excluded), conflict) in
                            [(b, a), (a, b)].into_iter().zip(possible)
                        {
                            let Some((rules, witness)) = conflict else {
                                continue;
                            };
                            let candidate = placement(cell);
                            assisted.push(VariantDeduction {
                                technique,
                                actions: vec![HintAction::Place(candidate)],
                                evidence: VariantEvidence::RuleSingle {
                                    candidate,
                                    house: house.kind,
                                    excluded,
                                    witness,
                                    rules,
                                },
                            });
                        }
                    }
                } else if !self.classic_boxes {
                    let candidate = placement(a);
                    proofs.push(VariantDeduction {
                        technique,
                        actions: vec![HintAction::Place(candidate)],
                        evidence: VariantEvidence::Single {
                            candidate,
                            house: Some(house.kind),
                        },
                    });
                }
            }
        }
        proofs.append(&mut assisted);
    }

    fn single_conflict(
        &self,
        pos: &ProofPosition<'_>,
        cell: usize,
        digit: u8,
    ) -> Option<(Vec<usize>, Option<usize>)> {
        if let Some(clue) = self
            .parity_clues
            .iter()
            .find(|clue| clue.cell == cell && clue.allowed & digit_bit(digit) == 0)
        {
            return Some((vec![clue.rule], None));
        }
        for &index in &self.pair_clue_memberships[cell] {
            let clue = &self.pair_clues[index];
            for link in clue.links() {
                let [a, b] = link.cells;
                if a == cell && pos.board[b] != 0 && !link.permits(digit, pos.board[b]) {
                    return Some((clue.source.indices.clone(), Some(b)));
                }
                if b == cell && pos.board[a] != 0 && !link.permits(pos.board[a], digit) {
                    return Some((clue.source.indices.clone(), Some(a)));
                }
            }
        }
        // A short, otherwise filled clue has just one assignment to check.
        // Leave longer arithmetic and unfilled alternatives to their own techniques.
        let fixed = |cells: &[usize]| -> Option<Vec<u16>> {
            (cells.len() <= 4
                && cells.contains(&cell)
                && cells.iter().all(|&c| c == cell || pos.board[c] != 0))
            .then(|| {
                cells
                    .iter()
                    .map(|&c| digit_bit(if c == cell { digit } else { pos.board[c] }))
                    .collect()
            })
        };
        for line in &self.lines {
            if line.simple_outside_conflict(cell, digit, &pos.board) {
                return Some((vec![line.rule_index], None));
            }
            if let Some(domains) = fixed(&line.cells) {
                let mut support = vec![0; domains.len()];
                line.support(&domains, &mut support);
                if support.contains(&0) {
                    return Some((vec![line.rule_index], None));
                }
            }
        }
        for cage in &self.cages {
            if let Some(domains) = fixed(&cage.cells)
                && cage.support(&domains)[..domains.len()].contains(&0)
            {
                return Some((vec![cage.reference[0]], None));
            }
        }
        for quad in &self.quadruples {
            if let Some(domains) = fixed(&quad.cells)
                && !quad.has_assignment(domains.try_into().unwrap())
            {
                return Some((vec![quad.rule_index], None));
            }
        }
        None
    }
}
