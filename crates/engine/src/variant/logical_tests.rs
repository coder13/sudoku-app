use super::*;
use crate::{HintAction, VariantPuzzle, parse_givens};

#[cfg(feature = "wasm-api")]
#[test]
fn full_geometric_support_keeps_the_four_numeric_opening_hints() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/nonconsecutive-locked.json"
    ))
    .unwrap();
    let archived: VariantPosition = serde_json::from_value(fixture["position"].clone()).unwrap();
    let compiled = archived.puzzle.compile().unwrap();
    let position = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    let numeric = [VariantTechnique::NonConsecutive, VariantTechnique::Kropki];
    let before: Vec<_> = numeric
        .into_iter()
        .flat_map(|technique| compiled.explain(&position, technique))
        .collect();
    assert_eq!(before.len(), 4);
    assert!(position.masks.iter().all(|mask| !mask.is_power_of_two()));
    assert!(compiled.classic_search_is_empty(&position, Technique::NestedForcingNet));
    assert!(
        compiled
            .overlay_search(&position)
            .known_full_completion_support()
    );
    for technique in Technique::ALL {
        assert!(
            compiled
                .explain(&position, VariantTechnique::Classic(technique))
                .is_empty(),
            "{}",
            technique.id()
        );
    }
    let after: Vec<_> = numeric
        .into_iter()
        .flat_map(|technique| compiled.explain(&position, technique))
        .collect();
    assert_eq!(after, before);
}

#[test]
fn complete_support_does_not_hide_a_singleton_placement() {
    let compiled = VariantPuzzle::classic([0; CELLS]).compile().unwrap();
    let mut removals = [0; CELLS];
    removals[0] = DIGITS & !1;
    for cell in cells_in(compiled.peers[0]) {
        removals[cell] |= 1;
    }
    let position = compiled.proof_position(&[0; CELLS], &removals).unwrap();
    assert!(
        compiled
            .overlay_search(&position)
            .has_full_completion_support(4096)
    );
    assert!(!compiled.classic_search_is_empty(&position, Technique::ForcingChain));
    assert!(!compiled.classic_search_is_empty(&position, Technique::NakedSingle));
    assert_eq!(
        compiled.explain(&position, VariantTechnique::NakedSingle)[0].actions,
        vec![HintAction::Place(Candidate { cell: 0, digit: 1 })]
    );
}

#[test]
fn unknown_support_and_safe_uniqueness_scopes_retain_the_original_search() {
    let compiled = VariantPuzzle::classic([0; CELLS]).compile().unwrap();
    let position = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert!(!compiled.classic_search_is_empty(&position, Technique::XWing));
    assert!(
        position.overlay.get().is_none(),
        "cheap scans do not initialize completion probes"
    );
    assert!(
        !compiled
            .overlay_search(&position)
            .has_full_completion_support(0)
    );
    assert!(!compiled.classic_search_is_empty(&position, Technique::NestedForcingNet));

    let fresh = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert!(
        compiled
            .overlay_search(&fresh)
            .has_full_completion_support(4096)
    );
    assert!(!compiled.classic_search_is_empty(&fresh, Technique::UniqueRectangleAic));
    assert!(!compiled.classic_search_is_empty(&fresh, Technique::BugPlusOne));
}

#[test]
fn complete_rule_scopes_reject_unsafe_swaps_before_searching() {
    let solution = parse_givens(
        "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
    )
    .unwrap();
    let mut puzzle = VariantPuzzle::classic([0; CELLS]);
    puzzle.rules.push(PuzzleRule::Clone {
        groups: (1..=9)
            .map(|digit| (0..CELLS).filter(|&cell| solution[cell] == digit).collect())
            .collect(),
    });
    let compiled = puzzle.compile().unwrap();
    let position = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert_eq!(compiled.extra_rule_cells, (1u128 << CELLS) - 1);
    for technique in Technique::ALL
        .into_iter()
        .filter(|technique| technique.requires_unique_solution())
    {
        assert!(compiled.supports_technique(VariantTechnique::Classic(technique)));
        assert!(compiled.classic_search_is_empty(&position, technique));
        assert!(
            compiled
                .explain(&position, VariantTechnique::Classic(technique))
                .is_empty()
        );
    }
    assert!(position.overlay.get().is_none());
}

#[test]
fn positive_graph_and_branch_proofs_survive_zero_budget_coverage() {
    for technique in [
        Technique::Aic,
        Technique::Tridagon,
        Technique::TridagonForcingNet,
        Technique::FireworkAic,
        Technique::AlsAic,
        Technique::AlignedTripletExclusion,
        Technique::Exocet,
        Technique::KrakenFish2,
    ] {
        for example in technique.practice_examples() {
            let source = example.position().unwrap();
            let compiled = VariantPuzzle::classic(source.givens).compile().unwrap();
            let position = compiled
                .proof_position(&source.entries, &source.eliminations)
                .unwrap();
            assert!(
                !compiled
                    .overlay_search(&position)
                    .has_full_completion_support(0)
            );
            let reference: Vec<_> = DeductionSearch::new(&position.board, &position.masks)
                .hints(technique)
                .into_iter()
                .map(|hint| {
                    let mut actions = hint.actions;
                    actions.sort_unstable();
                    VariantDeduction {
                        technique: VariantTechnique::Classic(technique),
                        actions,
                        evidence: VariantEvidence::Classic {
                            proof: Box::new(hint.evidence),
                            swap_cells: vec![],
                        },
                    }
                })
                .collect();
            assert!(!reference.is_empty(), "{}", technique.id());
            assert_eq!(
                compiled.explain(&position, VariantTechnique::Classic(technique)),
                reference
            );
        }
    }
}

#[test]
fn geometric_coverage_uses_jigsaw_regions_and_separate_position_instances() {
    let rows: Vec<Vec<usize>> = (0..9).map(|row| (9 * row..9 * row + 9).collect()).collect();
    let compiled = VariantPuzzle::jigsaw([0; CELLS], rows).compile().unwrap();
    let position = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert!(
        compiled
            .overlay_search(&position)
            .has_full_completion_support(4096)
    );
    assert!(compiled.supports_technique(VariantTechnique::Classic(Technique::XWing)));
    assert!(compiled.classic_search_is_empty(&position, Technique::XWing));
    let separate = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert!(separate.overlay.get().is_none());
}

#[test]
fn full_support_witnesses_both_truth_values_in_an_ambiguous_rectangle() {
    let solution = parse_givens(
        "658492731974316582132875694461523978387149256295768143849251367726934815513687429",
    )
    .unwrap();
    let holes = [1, 6, 10, 15];
    let mut givens = solution;
    for cell in holes {
        givens[cell] = 0;
    }
    let compiled = VariantPuzzle::classic(givens).compile().unwrap();
    let position = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert!(
        holes
            .iter()
            .all(|&cell| position.masks[cell] == (1 << 4) | (1 << 6))
    );
    let mut swapped = solution;
    for cell in holes {
        swapped[cell] = if solution[cell] == 5 { 7 } else { 5 };
    }
    for board in [solution, swapped] {
        for house in crate::House::all() {
            let digits: std::collections::BTreeSet<_> =
                house.cells().into_iter().map(|cell| board[cell]).collect();
            assert_eq!(digits, (1..=9).collect());
        }
    }
    for cell in holes {
        for digit in [5, 7] {
            assert!([solution, swapped].iter().any(|board| board[cell] == digit));
            assert!([solution, swapped].iter().any(|board| board[cell] != digit));
        }
    }
    assert!(compiled.classic_search_is_empty(&position, Technique::ForcingChain));
    assert!(
        compiled
            .explain(
                &position,
                VariantTechnique::Classic(Technique::ForcingChain)
            )
            .is_empty()
    );
}

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
        .solve(&[0; CELLS], &[0; CELLS], COMPLETION_PROBE_NODES)
        .unwrap();
    for action in actual.iter().flat_map(|proof| &proof.actions) {
        let candidate = action.candidate();
        assert_eq!(
            answer[candidate.cell] == candidate.digit,
            matches!(action, HintAction::Place(_))
        );
    }
}
