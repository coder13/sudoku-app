use super::*;
use crate::{HintAction, VariantPuzzle, parse_givens};

#[test]
fn completion_pruning_keeps_all_twelve_nested_forcing_proofs_on_ai_escargot() {
    let board = parse_givens(
        "100007090030020008009600500005300900010080002600004000300000010041000007007000300",
    )
    .unwrap();
    let compiled = VariantPuzzle::classic(board).compile().unwrap();
    let position = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    let technique = VariantTechnique::Classic(Technique::NestedForcingNet);
    let expected: Vec<_> = DeductionSearch::new(&position.board, &position.masks)
        .hints(Technique::NestedForcingNet)
        .into_iter()
        .map(|hint| {
            let mut actions = hint.actions;
            actions.sort_unstable();
            VariantDeduction {
                technique,
                actions,
                evidence: VariantEvidence::Classic {
                    proof: Box::new(hint.evidence),
                    swap_cells: Vec::new(),
                },
            }
        })
        .collect();
    assert_eq!(expected.len(), 12);
    let actual = compiled
        .deductions(&[0; CELLS], &[0; CELLS], technique)
        .unwrap();
    assert_eq!(
        actual, expected,
        "Pruning must preserve every action and its complete proof"
    );
    let answer = compiled
        .solve(&[0; CELLS], &[0; CELLS], UNIQUENESS_PROBE_NODES)
        .unwrap();
    for action in actual.iter().flat_map(|proof| &proof.actions) {
        let candidate = action.candidate();
        assert_eq!(
            answer[candidate.cell] == candidate.digit,
            matches!(action, HintAction::Place(_))
        );
    }
}
