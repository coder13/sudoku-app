use super::*;
use crate::{HintAction, VariantPuzzle, parse_givens};

#[cfg(feature = "wasm-api")]
#[test]
fn stronger_public_verification_keeps_bounded_hint_eligibility_stable() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/palindrome-whispers.json"
    ))
    .unwrap();
    let puzzle: VariantPuzzle = serde_json::from_value(fixture["puzzle"].clone()).unwrap();
    let compiled = puzzle.compile().unwrap();
    assert_eq!(
        compiled.analyze(&[0; CELLS], &[0; CELLS], UNIQUENESS_PROBE_NODES),
        Ok(Analysis::Unique)
    );
    // An exhausted eligibility probe is not a claim about the solution count.
    // It retains the established scheduling of expensive graph searches.
    assert_eq!(
        compiled.analyze_for_proof(&[0; CELLS], &[0; CELLS], UNIQUENESS_PROBE_NODES),
        Ok(Analysis::SearchLimit)
    );
    let position = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert!(!compiled.uniqueness_is_verified(&position));
    assert!(compiled.classic_search_is_empty(&position, Technique::UniqueRectangleAic));
    assert!(compiled.explain(&position, VariantTechnique::Classic(Technique::UniqueRectangleAic)).is_empty());
}

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
fn unknown_support_retains_the_original_search() {
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
}

#[test]
fn geometric_support_does_not_establish_uniqueness() {
    let compiled = VariantPuzzle::classic([0; CELLS]).compile().unwrap();
    let fresh = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert!(
        compiled
            .overlay_search(&fresh)
            .has_full_completion_support(4096)
    );
    assert_eq!(
        compiled.analyze(&[0; CELLS], &[0; CELLS], 4096),
        Ok(Analysis::Multiple)
    );
    for technique in Technique::ALL
        .into_iter()
        .filter(|item| item.requires_unique_solution())
    {
        assert!(
            compiled
                .explain(&fresh, VariantTechnique::Classic(technique))
                .is_empty()
        );
    }
    assert_eq!(fresh.uniqueness.get(), Some(&false));
    assert!(compiled.classic_search_is_empty(&fresh, Technique::BugPlusOne));
}

#[cfg(feature = "teaching")]
#[test]
fn verified_unique_positions_keep_every_positive_uniqueness_exercise() {
    for technique in Technique::ALL
        .into_iter()
        .filter(|item| item.requires_unique_solution())
    {
        let examples = technique.practice_examples();
        assert!(!examples.is_empty(), "{}", technique.id());
        for example in examples {
            let source = example.position().unwrap();
            let compiled = VariantPuzzle::classic(source.givens).compile().unwrap();
            let position = compiled
                .proof_position(&source.entries, &source.eliminations)
                .unwrap();
            assert_eq!(
                compiled.analyze(&source.entries, &[0; CELLS], 4096),
                Ok(Analysis::Unique)
            );
            assert!(!compiled.classic_search_is_empty(&position, technique));
            assert!(
                compiled
                    .explain(&position, VariantTechnique::Classic(technique))
                    .iter()
                    .any(|proof| proof.actions == example.expected_actions),
                "{}",
                technique.id()
            );
            assert_eq!(position.uniqueness.get(), Some(&true));
        }
    }
}

#[cfg(feature = "teaching")]
#[test]
fn candidate_removals_cannot_supply_a_uniqueness_assumption() {
    let example = Technique::UniqueRectangle1.practice_example();
    let source = example.position().unwrap();
    let original = VariantPuzzle::classic(source.givens).compile().unwrap();
    let original_board = source.values().unwrap();
    let original_masks = original
        .candidates(&source.entries, &source.eliminations)
        .unwrap();
    // Removing every fixed 4 and 5 permits at least their global digit swap.
    // Candidate restrictions restore the old domains and apparent rectangle.
    let givens = original_board.map(|digit| if [4, 5].contains(&digit) { 0 } else { digit });
    let removals = std::array::from_fn(|cell| {
        if givens[cell] != 0 {
            0
        } else if original_board[cell] != 0 {
            DIGITS & !digit_bit(original_board[cell])
        } else {
            DIGITS & !original_masks[cell]
        }
    });
    let compiled = VariantPuzzle::classic(givens).compile().unwrap();
    assert_eq!(
        compiled.analyze(&[0; CELLS], &[0; CELLS], 4096),
        Ok(Analysis::Multiple)
    );
    assert_eq!(
        compiled.analyze(&[0; CELLS], &removals, 4096),
        Ok(Analysis::Unique)
    );
    let position = compiled.proof_position(&[0; CELLS], &removals).unwrap();
    assert!(
        DeductionSearch::new(&position.board, &position.masks)
            .hints(Technique::UniqueRectangle1)
            .iter()
            .any(|proof| proof.actions == example.expected_actions)
    );
    assert!(
        compiled
            .explain(
                &position,
                VariantTechnique::Classic(Technique::UniqueRectangle1)
            )
            .is_empty()
    );
}

#[cfg(feature = "wasm-api")]
#[test]
fn an_exhausted_uniqueness_probe_does_not_reclassify_a_unique_puzzle() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/whispers-brain-zaps.json"
    ))
    .unwrap();
    let puzzle: VariantPuzzle = serde_json::from_value(fixture["puzzle"].clone()).unwrap();
    let compiled = puzzle.compile().unwrap();
    assert_eq!(
        compiled.analyze(&[0; CELLS], &[0; CELLS], 4096),
        Ok(Analysis::SearchLimit)
    );
    assert_eq!(
        compiled.analyze(&[0; CELLS], &[0; CELLS], 100_000),
        Ok(Analysis::Unique)
    );
    let position = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    for technique in [
        Technique::UniqueRectangle1,
        Technique::UniqueLoop,
        Technique::BugPlusOne,
    ] {
        assert!(
            compiled
                .explain(&position, VariantTechnique::Classic(technique))
                .is_empty()
        );
        assert!(
            position.uniqueness.get().is_none(),
            "{} defers the exact probe",
            technique.id()
        );
    }
    assert!(compiled.classic_search_is_empty(&position, Technique::UniqueRectangleAic));
    for technique in Technique::ALL
        .into_iter()
        .filter(|item| item.requires_unique_solution())
    {
        assert!(compiled.classic_search_is_empty(&position, technique));
        assert!(
            compiled
                .explain(&position, VariantTechnique::Classic(technique))
                .is_empty()
        );
    }
    assert!(
        !compiled
            .explain(&position, VariantTechnique::WhispersHouseSupport)
            .is_empty()
    );
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
    assert!(position.uniqueness.get().is_none());
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
    let reference = |position: &ProofPosition<'_>| -> Vec<_> {
        DeductionSearch::new(&position.board, &position.masks)
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
            .collect()
    };
    let expected = reference(&position);
    assert_eq!(expected.len(), 12);
    let actual = compiled
        .deductions(&[0; CELLS], &[0; CELLS], technique)
        .unwrap();
    assert_eq!(compiled.explain(&position, technique), actual);
    assert!(
        !compiled
            .overlay_search(&position)
            .known_full_completion_support()
    );
    assert!(
        position
            .overlay
            .get()
            .unwrap()
            .borrow()
            .known_completion_support()
            .is_some()
    );
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
    let removal = actual
        .iter()
        .flat_map(|proof| &proof.actions)
        .find_map(|action| {
            if let HintAction::Eliminate(candidate) = action {
                Some(*candidate)
            } else {
                None
            }
        })
        .unwrap();
    let mut removals = [0u16; CELLS];
    removals[removal.cell] = digit_bit(removal.digit);
    let mut entries = [0; CELLS];
    let cell = board.iter().position(|&digit| digit == 0).unwrap();
    entries[cell] = answer[cell];
    for (entries, removals) in [([0; CELLS], removals), (entries, [0; CELLS])] {
        let changed = compiled.proof_position(&entries, &removals).unwrap();
        let expected = reference(&changed);
        assert!(!expected.is_empty());
        assert_eq!(
            compiled.explain(&changed, technique),
            expected,
            "Edited positions retain every proof from the unpruned search"
        );
    }
}

#[cfg(feature = "wasm-api")]
#[test]
fn symmetric_geometric_witnesses_keep_whispers_hints_and_uniqueness_separate() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/whispers-brain-zaps.json"
    ))
    .unwrap();
    let puzzle: VariantPuzzle = serde_json::from_value(fixture["puzzle"].clone()).unwrap();
    let compiled = puzzle.compile().unwrap();
    let position = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert!(compiled.classic_search_is_empty(&position, Technique::NestedForcingNet));
    let support = compiled
        .overlay_search(&position)
        .known_completion_support()
        .copied()
        .unwrap();
    let mut covered = 0;
    for (cell, &mask) in position.masks.iter().enumerate() {
        for (digit, &sites) in support.iter().enumerate() {
            if mask & (1 << digit) != 0 && sites & (1 << cell) != 0 {
                covered += 1;
            }
        }
    }
    let total: u32 = position.masks.iter().map(|mask| mask.count_ones()).sum();
    assert_eq!(total, 642);
    assert_eq!(covered, total);
    assert!(
        compiled
            .overlay_search(&position)
            .known_full_completion_support()
    );
    assert!(
        compiled
            .explain(
                &position,
                VariantTechnique::Classic(Technique::NestedForcingNet)
            )
            .is_empty()
    );
    assert!(position.uniqueness.get().is_none());
    assert!(
        !compiled
            .explain(&position, VariantTechnique::WhispersHouseSupport)
            .is_empty()
    );
    let fresh = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
    assert!(fresh.overlay.get().is_none());
}
