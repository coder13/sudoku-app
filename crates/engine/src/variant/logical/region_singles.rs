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
                    let mut moves = [(a, b), (b, a)].into_iter().filter_map(|(cell, excluded)| {
                        let candidate = placement(cell);
                        let evidence =
                            self.region_single_evidence(pos, house.kind, candidate, excluded)?;
                        Some(VariantDeduction {
                            technique,
                            actions: vec![HintAction::Place(candidate)],
                            evidence,
                        })
                    });
                    if let Some(step) = moves.next()
                        && moves.next().is_none()
                    {
                        assisted.push(step);
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

    fn region_single_evidence(
        &self,
        pos: &ProofPosition<'_>,
        house: VariantHouseKind,
        candidate: Candidate,
        excluded: usize,
    ) -> Option<VariantEvidence> {
        let (rules, witness, entropy_window) = if let Some((rules, witness)) =
            self.single_conflict(pos, excluded, candidate.digit)
        {
            (rules, witness, None)
        } else {
            if !self.region_logic {
                return None;
            }
            let (rule, top_left, group) = self.entropy_windows().find_map(|(rule, cells)| {
                if !cells.contains(&excluded) {
                    return None;
                }
                let mut placed = 0u16;
                for cell in cells.into_iter().filter(|&c| c != excluded) {
                    let d = pos.board[cell];
                    if d == 0 {
                        return None;
                    }
                    placed |= digit_bit(d);
                }
                let mut missing = self
                    .global_entropy_groups
                    .iter()
                    .filter(|&&group| group & placed == 0);
                let &group = missing.next()?;
                (missing.next().is_none() && group & digit_bit(candidate.digit) == 0)
                    .then_some((rule, cells[0], group))
            })?;
            (vec![rule], None, Some((top_left, group)))
        };
        Some(VariantEvidence::RuleSingle {
            candidate,
            house,
            excluded,
            rules,
            witness,
            entropy_window,
        })
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
