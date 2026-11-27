use super::{ProofPosition, VariantDeduction, VariantTechnique};
use crate::variant::CompiledVariant;

impl CompiledVariant {
    pub(super) fn conditional_neighbor_proofs(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let domains = std::array::from_fn(|cell| position.domain(cell));
        for clue in &self.conditional_neighbors {
            let mut supported = domains;
            let Ok(true) = clue.restrict(&position.board, &mut supported) else {
                continue;
            };
            let mut cells = Vec::with_capacity(clue.alternatives.len() + 1);
            cells.push(clue.source);
            for &(cell, _) in &clue.alternatives {
                if !cells.contains(&cell) {
                    cells.push(cell);
                }
            }
            if let Some(proof) = position.explain_constraint(
                technique,
                &[clue.rule_index],
                &cells,
                cells.iter().map(|&cell| supported[cell]),
            ) {
                proofs.push(proof);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        CELLS, Candidate, HintAction, VariantPuzzle, VariantTechnique,
        variant::{ConditionalNeighborAlternative, PuzzleRule},
    };

    #[test]
    fn conditional_neighbor_has_a_named_rule_specific_deduction() {
        let mut givens = [0; CELLS];
        givens[40] = 5;
        givens[31] = 2;
        let mut puzzle = VariantPuzzle::classic(givens);
        puzzle.rules = vec![PuzzleRule::ConditionalNeighbor {
            trigger_digit: 5,
            alternatives: vec![
                ConditionalNeighborAlternative {
                    row_offset: -1,
                    column_offset: 0,
                    digit: 1,
                },
                ConditionalNeighborAlternative {
                    row_offset: 1,
                    column_offset: 0,
                    digit: 9,
                },
            ],
        }];

        let technique = VariantTechnique::from_id("conditional-neighbor").unwrap();
        assert_eq!(technique, VariantTechnique::ConditionalNeighbor);
        assert!(VariantTechnique::DEFAULT_ORDER.contains(&technique));
        let compiled = puzzle.compile().unwrap();
        let deductions = compiled
            .deductions(&givens, &[0; CELLS], technique)
            .unwrap();
        let deduction = deductions
            .iter()
            .find(|deduction| {
                deduction
                    .actions
                    .contains(&HintAction::Eliminate(Candidate { cell: 49, digit: 8 }))
            })
            .expect("the clue forces the cell below the 5 to contain 9");

        assert!(
            deduction
                .actions
                .contains(&HintAction::Eliminate(Candidate { cell: 49, digit: 1 }))
        );
        assert!(
            deduction
                .actions
                .iter()
                .all(|action| { action.candidate().cell != 49 || action.candidate().digit != 9 })
        );
    }
}
