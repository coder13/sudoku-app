#![cfg(all(feature = "generation", feature = "teaching"))]

use std::collections::{BTreeMap, BTreeSet};

use sudoku_app_engine::{
    AlternatePathStatus, Analysis, Board, Candidate, ConjugatePair, Difficulty, ExocetTarget,
    GenerationConstraints, HintAction, HintChoices, HintError, HintEvidence, House,
    PositionSnapshot, ProfileError, ProofPattern, SolveStatus, SolverProfile, Technique,
    UniquenessSupport, VerifiedTemplate, candidates, canonical_puzzle, check_practice_move,
    compare_paths, deductions_at, generate_constrained, hint_choices, opening_techniques,
    parse_givens, rate_puzzle, search_alternate_path, solve, solve_logically, solve_position,
    technique_deductions, technique_deductions_at,
};

#[path = "../benches/fixtures/senior_exocet.rs"]
mod senior_exocet;

// This Royle 17-clue puzzle exceeds the exact-search budget on its original grid.
const SPARSE: &str =
    "345000000000200010000000000020100000000004500600000007800750000000060040000000300";
const TEMPLATE: &str =
    "000500000600000309000008200000000000538000000000007001200090000001000007000300080";

#[test]
fn mixed_senior_exocet_is_a_replayable_opening_from_the_givens() {
    let givens = parse_givens(senior_exocet::MONHARD_MIXED_EXOCET).unwrap();
    let position = PositionSnapshot::new(givens);
    let technique = Technique::SeniorExocet;
    assert!(opening_techniques(&givens).unwrap().contains(&technique));
    let trace = solve_logically(&givens, &[technique]).unwrap();
    let [step] = trace.steps.as_slice() else {
        panic!("expected one Senior Exocet deduction");
    };
    assert_eq!(step.technique, technique);
    assert!(matches!(
        step.evidence,
        HintEvidence::GroupedExocet {
            bases: [18, 19],
            targets: [
                ExocetTarget::Cell(15),
                ExocetTarget::ConjugatePair {
                    digit: 4,
                    link: ConjugatePair {
                        house: House::Column(2),
                        cells: [38, 74]
                    },
                }
            ],
            cross_lines: [House::Column(2), House::Column(3), House::Column(6)],
            ..
        }
    ));
    assert_eq!(
        step.actions,
        [2, 7].map(|digit| HintAction::Eliminate(Candidate { cell: 15, digit }))
    );
    let verified = VerifiedTemplate::verify(givens).unwrap();
    assert!(![2, 7].contains(&verified.solution()[15]));
    assert_eq!(trace.score.points, u32::from(step.cost()));
    assert_eq!(
        rate_puzzle(&givens, &[technique]).unwrap().score,
        trace.score
    );
    let replay = trace.replay_step(0).unwrap();
    assert_eq!(replay.before, position);
    assert_eq!(replay.after.eliminations[15], (1 << 1) | (1 << 6));
}

#[test]
fn double_exocet_can_resume_a_grid_after_ordinary_junior_deductions_stall() {
    let givens = parse_givens(Technique::DoubleExocet.practice_example().givens).unwrap();
    let baseline = solve_logically(&givens, Technique::default_order()).unwrap();
    assert_eq!(baseline.status, SolveStatus::Stalled);
    assert!(
        baseline
            .steps
            .iter()
            .any(|step| step.technique == Technique::Exocet)
    );
    let stalled = baseline.positions().last().unwrap();
    assert!(
        technique_deductions_at(&stalled, Technique::Exocet)
            .unwrap()
            .is_empty()
    );
    let resume_order = [Technique::default_order(), &[Technique::DoubleExocet]].concat();
    let resumed = solve_position(&stalled, &resume_order).unwrap();
    assert_eq!(resumed.steps[0].technique, Technique::DoubleExocet);
    assert!(matches!(
        resumed.status,
        SolveStatus::Solved(Difficulty::Extreme)
    ));
    let verified = VerifiedTemplate::verify(givens).unwrap();
    assert_eq!(&resumed.board, verified.solution());
    for action in resumed.steps.iter().flat_map(|step| &step.actions) {
        let target = action.candidate();
        assert_eq!(
            verified.solution()[target.cell] == target.digit,
            matches!(action, HintAction::Place(_))
        );
    }
}

#[test]
fn advanced_branch_patterns_reduce_nested_search_on_ai_escargot() {
    let givens = parse_givens(
        "100007090030020008009600500005300900010080002600004000300000010041000007007000300",
    )
    .unwrap();
    let dynamic = Technique::DynamicForcingNet;
    let advanced = Technique::AdvancedForcingNet;
    let nested = Technique::NestedForcingNet;
    let baseline = [Technique::default_order(), &[dynamic, nested]].concat();
    let extended = [Technique::default_order(), &[dynamic, advanced, nested]].concat();
    let solution = VerifiedTemplate::verify(givens).unwrap();
    let solve_and_check = |order| {
        let trace = solve_logically(&givens, order).unwrap();
        assert!(matches!(trace.status, SolveStatus::Solved(_)));
        assert_eq!(&trace.board, solution.solution());
        for action in trace.steps.iter().flat_map(|step| &step.actions) {
            let candidate = action.candidate();
            assert_eq!(
                solution.solution()[candidate.cell] == candidate.digit,
                matches!(action, HintAction::Place(_)),
            );
        }
        trace
    };
    let baseline = solve_and_check(&baseline);
    let with_pairs_and_fish = solve_and_check(&extended);
    assert!(with_pairs_and_fish.score.counts.contains_key(&advanced));
    assert!(
        with_pairs_and_fish
            .score
            .counts
            .get(&nested)
            .copied()
            .unwrap_or(0)
            < baseline.score.counts[&nested]
    );
    let proof_size = |trace: &sudoku_app_engine::LogicalSolve| -> usize {
        trace
            .steps
            .iter()
            .filter(|step| [dynamic, advanced, nested].contains(&step.technique))
            .map(|step| {
                let HintEvidence::Forcing { branches, .. } = &step.evidence else {
                    panic!()
                };
                branches
                    .iter()
                    .map(|branch| branch.proof_size())
                    .sum::<usize>()
            })
            .sum()
    };
    assert!(proof_size(&with_pairs_and_fish) < proof_size(&baseline));
}

#[test]
fn kraken_fish_completes_a_published_forcing_puzzle() {
    // The first of Sudoku Explainer's advanced forcing examples.
    // https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#beyond-forcing-chains
    let givens = parse_givens(
        "708000300000201000500000000040000026300080000000100090090600004000070500000000000",
    )
    .unwrap();
    let baseline = solve_logically(&givens, Technique::default_order()).unwrap();
    assert_eq!(baseline.status, SolveStatus::Stalled);
    let order = [
        Technique::default_order(),
        &[Technique::KrakenFish1, Technique::KrakenFish2],
    ]
    .concat();
    let position = baseline.positions().last().unwrap();
    let resumed = solve_position(&position, &order).unwrap();
    assert_eq!(resumed.steps[0].technique, Technique::KrakenFish1);
    assert_eq!(resumed.score.counts.get(&Technique::KrakenFish1), Some(&1));
    assert!(matches!(resumed.status, SolveStatus::Solved(_)));

    let solution = VerifiedTemplate::verify(givens).unwrap();
    assert_eq!(&resumed.board, solution.solution());
    for action in resumed.steps.iter().flat_map(|step| &step.actions) {
        let candidate = action.candidate();
        assert_eq!(
            solution.solution()[candidate.cell] == candidate.digit,
            matches!(action, HintAction::Place(_)),
        );
    }
    assert_eq!(
        rate_puzzle(&givens, &order)
            .unwrap()
            .score
            .counts
            .get(&Technique::KrakenFish1),
        Some(&1)
    );
}

#[test]
fn unique_loops_complete_five_published_stalls() {
    use Technique::*;
    // Sudoku Explainer's five long-loop grids. A narrow profile exposes the loop
    // opportunities before modern detectors can choose another route.
    // https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#unique-rectangles-and-loops
    let [first, second, third] = UniqueLoop.practice_examples();
    let examples = [
        (first.givens, 10),
        (second.givens, 12),
        (third.givens, 8),
        (
            "007200403500000080009008006050600800003000000700102009100040607200001000074900010",
            8,
        ),
        (
            "200400030000000560006000100400060001000580200000003805048079000530000000000802000",
            12,
        ),
    ];
    let profile = [
        FullHouse,
        NakedSingle,
        HiddenSingle,
        Pointing,
        Claiming,
        NakedPair,
        HiddenPair,
        NakedTriple,
        HiddenTriple,
        XWing,
        Swordfish,
        XYWing,
        XYZWing,
        NakedQuadruple,
        Jellyfish,
        HiddenQuadruple,
        UniqueRectangle1,
        UniqueRectangle2,
        UniqueRectangle3,
        UniqueRectangle4,
        UniqueLoop,
    ];
    for (grid, loop_size) in examples {
        let givens = parse_givens(grid).unwrap();
        let solution = VerifiedTemplate::verify(givens).unwrap();
        let baseline = solve_logically(&givens, &profile[..profile.len() - 1]).unwrap();
        assert_eq!(baseline.status, SolveStatus::Stalled, "{grid}");
        let result = solve_logically(&givens, &profile).unwrap();
        assert!(matches!(result.status, SolveStatus::Solved(_)), "{grid}");
        assert_eq!(&result.board, solution.solution());
        let step = &result.steps[baseline.steps.len()];
        let HintEvidence::UniqueLoop { sides, .. } = &step.evidence else {
            panic!("expected the loop to continue the stalled solve");
        };
        assert_eq!(sides.each_ref().map(Vec::len), [loop_size / 2; 2]);
        assert_eq!(step.technique, UniqueLoop);
        for action in result.steps.iter().flat_map(|step| &step.actions) {
            let candidate = action.candidate();
            assert_eq!(
                solution.solution()[candidate.cell] == candidate.digit,
                matches!(action, HintAction::Place(_)),
            );
        }
        let rating = rate_puzzle(&givens, &profile).unwrap();
        assert_eq!(rating.score, result.score);
        assert_eq!(
            rating.score.points,
            result
                .steps
                .iter()
                .map(|step| u32::from(step.cost()))
                .sum::<u32>()
        );
    }
}

#[test]
fn unique_loop_subsets_and_conjugate_links_prove_the_published_actions() {
    let example = Technique::UniqueLoop.practice_examples()[2];
    let position = example.position().unwrap();
    let solution = VerifiedTemplate::verify(position.givens).unwrap();
    let proofs = technique_deductions_at(&position, Technique::UniqueLoop).unwrap();
    let mut found = [false; 3];
    for proof in proofs {
        let HintEvidence::UniqueLoop {
            sides,
            digits,
            support,
        } = proof.evidence
        else {
            panic!("expected the loop's alternating sides");
        };
        for action in &proof.actions {
            let HintAction::Eliminate(candidate) = action else {
                panic!("expected a removal");
            };
            assert_ne!(solution.solution()[candidate.cell], candidate.digit);
        }
        if sides != [vec![0, 13, 71, 75], vec![3, 9, 67, 80]] || digits != [7, 8] {
            continue;
        }
        let subset_action = HintAction::Eliminate(Candidate { cell: 48, digit: 4 });
        match support {
            UniquenessSupport::Subset {
                houses,
                cells,
                digits,
            } if houses == [House::Column(3)] && cells == [21, 30] && digits == [4, 5, 6] => {
                assert_eq!(proof.actions, [subset_action]);
                found[0] = true;
            }
            UniquenessSupport::HiddenSubset {
                house: House::Column(3),
                cells,
                digits,
            } if cells == [48] && digits == [7, 8] => {
                assert_eq!(proof.actions, [subset_action]);
                found[1] = true;
            }
            UniquenessSupport::StrongLinks { houses, digit: 8 } if houses == [House::Column(3)] => {
                assert_eq!(proof.actions, example.expected_actions);
                found[2] = true;
            }
            _ => {}
        }
    }
    assert_eq!(found, [true; 3]);

    let mut restored = position;
    restored.eliminations[30] &= !(1 << (7 - 1));
    let proofs = technique_deductions_at(&restored, Technique::UniqueLoop).unwrap();
    assert!(!proofs.iter().any(|proof| matches!(
        &proof.evidence,
        HintEvidence::UniqueLoop {
            support: UniquenessSupport::HiddenSubset { house: House::Column(3), cells, digits },
            ..
        } if cells == &[48] && digits == &[7, 8]
    )));
}

#[cfg(feature = "wasm-api")]
fn recorded_position(line: &str) -> (u64, PositionSnapshot, Vec<Technique>) {
    let fixture: serde_json::Value = serde_json::from_str(line).unwrap();
    let row = fixture["sourceLine"].as_u64().unwrap();
    let mut position =
        PositionSnapshot::new(parse_givens(fixture["givens"].as_str().unwrap()).unwrap());
    position.entries = parse_givens(fixture["entries"].as_str().unwrap()).unwrap();
    let saved = fixture["eliminations"].as_array().unwrap();
    assert_eq!(saved.len(), position.eliminations.len());
    for (mask, saved) in position.eliminations.iter_mut().zip(saved) {
        *mask = saved.as_u64().unwrap().try_into().unwrap();
    }
    let order = fixture["techniqueOrder"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| Technique::from_id(id.as_str().unwrap()).unwrap())
        .collect();
    (row, position, order)
}

#[cfg(feature = "wasm-api")]
#[test]
fn tridagon_and_its_guardian_nets_complete_the_recorded_depth_three_stalls() {
    let mut placed = 0;
    let mut forced = 0;
    for line in include_str!("../benches/fixtures/te3-stalls-v10.jsonl").lines() {
        let (row, position, mut order) = recorded_position(line);
        let forcing = order
            .iter()
            .position(|&technique| technique == Technique::ForcingChain)
            .unwrap();
        order.insert(forcing, Technique::Tridagon);
        let nested = order
            .iter()
            .position(|&technique| technique == Technique::NestedForcingNet)
            .unwrap();
        order.insert(nested, Technique::TridagonForcingNet);

        let solution = VerifiedTemplate::verify(position.givens).unwrap();
        let trace = solve_position(&position, &order).unwrap();
        assert!(matches!(trace.status, SolveStatus::Solved(_)), "line {row}");
        assert_eq!(&trace.board, solution.solution(), "line {row}");
        for step in &trace.steps {
            for action in &step.actions {
                let candidate = action.candidate();
                assert_eq!(
                    candidate.digit == solution.solution()[candidate.cell],
                    matches!(action, HintAction::Place(_)),
                    "line {row}: {action:?}"
                );
            }
        }
        let first = &trace.steps[0];
        match first.technique {
            Technique::Tridagon => {
                assert!(
                    matches!(first.actions.as_slice(), [HintAction::Place(_)]),
                    "line {row}"
                );
                placed += 1;
            }
            Technique::TridagonForcingNet => forced += 1,
            _ => panic!("line {row}: expected a tridagon to resolve the stall"),
        }
    }
    assert_eq!((placed, forced), (9, 3));
}

#[cfg(feature = "wasm-api")]
#[test]
fn a_guardian_constraint_resolves_depth_three_line_66643() {
    let (row, position, order) = recorded_position(include_str!(
        "../benches/fixtures/te3-tridagon-stalls-v10.jsonl"
    ));
    assert_eq!(row, 66643);
    let solution = VerifiedTemplate::verify(position.givens).unwrap();
    let hints = technique_deductions_at(&position, Technique::TridagonForcingNet).unwrap();
    let mut removed = BTreeSet::new();
    for hint in hints {
        let [HintAction::Eliminate(candidate)] = hint.actions.as_slice() else {
            panic!("expected a candidate removal");
        };
        let HintEvidence::Tridagon { branches, .. } = hint.evidence else {
            panic!("expected a Tridagon proof");
        };
        let [branch] = branches.as_slice() else {
            panic!("expected one refuted assumption");
        };
        assert_eq!(branch.assumption.candidate, *candidate);
        assert!(branch.assumption.truth && branch.conflict.is_some());
        assert_ne!(solution.solution()[candidate.cell], candidate.digit);
        removed.insert((candidate.cell, candidate.digit));
    }
    assert!(
        BTreeSet::from([
            (25, 3),
            (25, 8),
            (26, 1),
            (62, 4),
            (74, 3),
            (74, 4),
            (74, 8)
        ])
        .is_subset(&removed)
    );

    let trace = solve_position(&position, &order).unwrap();
    assert_eq!(trace.steps[0].technique, Technique::TridagonForcingNet);
    assert!(matches!(trace.status, SolveStatus::Solved(_)));
    assert_eq!(&trace.board, solution.solution());
    for action in trace.steps.iter().flat_map(|step| &step.actions) {
        let candidate = action.candidate();
        assert_eq!(
            solution.solution()[candidate.cell] == candidate.digit,
            matches!(action, HintAction::Place(_))
        );
    }
}

fn assert_replayed_trace(givens: Board, level: Difficulty, expected_points: u32) {
    let order = Technique::default_order();
    let rating = rate_puzzle(&givens, order).unwrap();
    let trace = solve_logically(&givens, order).unwrap();
    assert_eq!(rating.status, SolveStatus::Solved(level));
    assert_eq!(rating.score.points, expected_points);
    assert_eq!(rating.score, trace.score);
    assert_eq!(rating.status, trace.status);
    assert_eq!(rating.technique_order, trace.technique_order);
    assert_eq!(rating.scoring_version, trace.scoring_version);

    let mut board = givens;
    let mut snapshot = PositionSnapshot::new(givens);
    let mut positions = trace.positions();
    assert_eq!(positions.next().as_ref(), Some(&snapshot));
    let mut counts = BTreeMap::new();
    let mut points = 0;
    for (index, step) in trace.steps.iter().enumerate() {
        let replay = trace.replay_step(index).unwrap();
        assert_eq!(replay.before, snapshot);
        assert_eq!(replay.deduction, step);
        let legal = candidates(&board).unwrap();
        assert!(!step.actions.is_empty());
        points += u32::from(step.cost());
        *counts.entry(step.technique).or_insert(0u32) += 1;
        for &action in &step.actions {
            let (HintAction::Place(Candidate { cell, digit })
            | HintAction::Eliminate(Candidate { cell, digit })) = action;
            let bit = 1 << (digit - 1);
            assert_eq!(board[cell], 0);
            assert_ne!(legal[cell] & !snapshot.eliminations[cell] & bit, 0);
            match action {
                HintAction::Place(_) => {
                    board[cell] = digit;
                    snapshot.entries[cell] = digit;
                }
                HintAction::Eliminate(_) => snapshot.eliminations[cell] |= bit,
            }
        }
        assert_eq!(replay.after, snapshot);
        assert_eq!(positions.next().as_ref(), Some(&snapshot));
    }
    assert_eq!(positions.next(), None);
    assert_eq!(trace.replay_step(trace.steps.len()), None);
    assert_eq!(board, trace.board);
    assert!(!board.contains(&0));
    assert!(candidates(&board).is_some());
    assert_eq!(points, rating.score.points);
    assert_eq!(counts, rating.score.counts);
}

#[test]
fn sparse_board_has_a_rating_a_replayable_trace_and_opening_deductions() {
    let board = parse_givens(SPARSE).unwrap();
    assert_replayed_trace(board, Difficulty::Medium, 832);
    let openers = opening_techniques(&board).unwrap();
    let HintChoices::Choices(hints) = hint_choices(&board, None).unwrap() else {
        panic!("expected choices on the original grid");
    };
    for hint in hints {
        assert!(openers.contains(&hint.technique));
        assert!(
            technique_deductions(&board, None, hint.technique)
                .unwrap()
                .contains(&hint)
        );
    }
}

#[test]
fn a_permuted_verified_template_can_match_even_when_raw_search_runs_out() {
    let template = parse_givens(TEMPLATE).unwrap();
    let constraints = GenerationConstraints {
        clues: 17,
        score: Some(832..=832),
        technique_order: Technique::default_order(),
    };
    let generated = generate_constrained(42, &constraints, &[template], 1).unwrap();
    assert_eq!(generated.iter().filter(|&&cell| cell != 0).count(), 17);
    assert_replayed_trace(generated, Difficulty::Medium, 832);
}

#[test]
fn expert_rating_replays_the_same_deductions_with_the_same_score() {
    let technique = Technique::MultiSectorLockedSets;
    let board = parse_givens(technique.practice_example().givens).unwrap();
    assert_replayed_trace(board, Difficulty::Extreme, 2356);
    assert_eq!(
        rate_puzzle(&board, Technique::default_order())
            .unwrap()
            .score
            .hardest,
        Some(technique)
    );
}

#[test]
fn every_catalog_id_is_unique_and_every_default_entry_resolves() {
    let ids: BTreeSet<_> = Technique::ALL
        .iter()
        .map(|technique| technique.id())
        .collect();
    assert_eq!(ids.len(), Technique::ALL.len());
    for &technique in Technique::default_order() {
        assert!(Technique::ALL.contains(&technique));
        assert!(technique.cost() > 0);
    }
    assert_eq!(
        Technique::default_order()
            .iter()
            .collect::<BTreeSet<_>>()
            .len(),
        Technique::default_order().len()
    );
    assert!(ids.contains("x-wing"));
    for technique in Technique::ALL {
        assert_eq!(Technique::from_id(technique.id()), Some(technique));
    }
}

#[test]
fn profiles_round_trip_stable_ids_and_keep_disabled_techniques_disabled() {
    let profile = SolverProfile::from_ids(["x-wing", "hidden-single", "naked-single"]).unwrap();
    assert_eq!(
        profile.technique_order(),
        [
            Technique::XWing,
            Technique::HiddenSingle,
            Technique::NakedSingle
        ]
    );
    assert_eq!(SolverProfile::from_ids(profile.ids()), Ok(profile));
    assert!(
        SolverProfile::from_ids([])
            .unwrap()
            .technique_order()
            .is_empty()
    );
    assert_eq!(
        SolverProfile::default().technique_order(),
        Technique::default_order()
    );
    assert_eq!(
        SolverProfile::from_ids(["x-wing", "x-wing"]),
        Err(ProfileError::DuplicateTechnique(Technique::XWing))
    );
    assert_eq!(
        SolverProfile::from_ids(["X-Wing"]),
        Err(ProfileError::UnknownTechnique(String::from("X-Wing")))
    );
}

#[test]
fn deduction_search_groups_the_move_and_keeps_each_selected_proof() {
    let board = parse_givens(SPARSE).unwrap();
    let mut complete = solve_logically(&board, Technique::default_order())
        .unwrap()
        .board;
    let target = Candidate {
        cell: 0,
        digit: complete[0],
    };
    assert!(!complete.contains(&0));
    complete[0] = 0;
    let position = PositionSnapshot::new(complete);
    let techniques = [Technique::HiddenSingle, Technique::FullHouse];
    let moves = deductions_at(&position, &techniques).unwrap();
    let [found] = moves.as_slice() else {
        panic!("only one cell can change")
    };
    assert_eq!(found.actions, [HintAction::Place(target)]);
    assert_eq!(found.affected_cells, [target.cell]);
    assert_eq!(found.affected_candidates, [target]);
    let houses = [House::Row(0), House::Column(0), House::Box(0)];
    let expected: Vec<_> = techniques
        .into_iter()
        .flat_map(|technique| houses.map(|house| (technique, house)))
        .collect();
    assert_eq!(found.proofs.len(), expected.len());
    for (proof, (technique, house)) in found.proofs.iter().zip(expected) {
        assert_eq!(proof.technique, technique);
        assert_eq!(proof.evidence, HintEvidence::House(house));
        assert_eq!(proof.pattern.houses, [house]);
        assert_eq!(proof.pattern.cells, [target.cell]);
        assert_eq!(proof.pattern.candidates, [target]);
    }
    assert!(deductions_at(&position, &[]).unwrap().is_empty());
    let mut repeated = techniques.to_vec();
    repeated.push(Technique::HiddenSingle);
    assert_eq!(deductions_at(&position, &repeated).unwrap(), moves);
}

#[test]
fn each_practice_proof_identifies_its_active_candidates_and_effects() {
    for technique in Technique::ALL {
        let example = technique.practice_example();
        let position = example.position().unwrap();
        let moves = deductions_at(&position, &[technique]).unwrap();
        let found = moves
            .iter()
            .find(|found| found.actions == example.expected_actions)
            .unwrap_or_else(|| panic!("missing proof for {technique:?}"));
        let legal = candidates(&position.values().unwrap()).unwrap();
        let known = |candidate: &Candidate| {
            legal[candidate.cell]
                & !position.eliminations[candidate.cell]
                & (1 << (candidate.digit - 1))
                != 0
        };
        assert!(found.affected_candidates.iter().all(known));
        assert_eq!(
            found
                .affected_candidates
                .iter()
                .copied()
                .collect::<BTreeSet<_>>(),
            found
                .actions
                .iter()
                .map(|action| action.candidate())
                .collect()
        );
        assert_eq!(
            found
                .affected_cells
                .iter()
                .copied()
                .collect::<BTreeSet<_>>(),
            found
                .affected_candidates
                .iter()
                .map(|candidate| candidate.cell)
                .collect()
        );
        assert!(!found.proofs.is_empty());
        for proof in &found.proofs {
            assert_eq!(proof.technique, technique);
            assert!(
                !proof.pattern.candidates.is_empty(),
                "empty pattern for {technique:?}"
            );
            assert!(
                proof
                    .pattern
                    .candidates
                    .iter()
                    .all(|candidate| known(candidate)
                        && proof.pattern.cells.contains(&candidate.cell))
            );
        }
    }
}

#[test]
fn complex_fish_profiles_and_practice_prove_only_valid_removals() {
    for technique in [Technique::FrankenFish, Technique::MutantFish] {
        let example = technique.practice_example();
        let mut position = example.position().unwrap();
        let solution = solve(&position.values().unwrap()).unwrap();
        let moves = technique_deductions_at(&position, technique).unwrap();
        assert!(
            moves
                .iter()
                .any(|hint| hint.actions == example.expected_actions)
        );
        for hint in &moves {
            assert!(matches!(hint.evidence, HintEvidence::ComplexFish { .. }));
            for action in &hint.actions {
                let HintAction::Eliminate(candidate) = action else {
                    panic!("{technique:?} should only remove candidates");
                };
                assert_ne!(solution[candidate.cell], candidate.digit);
            }
        }
        let path = solve_position(&position, &[technique]).unwrap();
        assert_eq!(path.steps.first().unwrap().technique, technique);
        assert_eq!(path.technique_order, [technique]);

        if technique == Technique::MutantFish {
            // A restored 4 at r2c5 supplies an unbalanced base candidate that r1c9 cannot see.
            position.eliminations[13] &= !(1 << (4 - 1));
            assert!(
                check_practice_move(&position, technique, example.expected_actions[0])
                    .unwrap()
                    .is_none()
            );
        }
    }
}

// Count the proof's sites by house and digit. For fixed-shape rules, the
// surrounding empty cells also distinguish the positions presented to the player.
fn practice_layout(board: &Board, pattern: &ProofPattern) -> Vec<usize> {
    let mut rows = [0; 9];
    let mut columns = [0; 9];
    let mut boxes = [0; 9];
    let mut digits = [0; 9];
    let mut surroundings = Vec::new();
    for &cell in &pattern.cells {
        let row = cell / 9;
        let column = cell % 9;
        let block = cell / 27 * 3 + column / 3;
        rows[row] += 1;
        columns[column] += 1;
        boxes[block] += 1;
        let open_in = |same_house: fn(usize, usize) -> bool| {
            board
                .iter()
                .enumerate()
                .filter(|&(i, &digit)| digit == 0 && same_house(i, cell))
                .count()
        };
        let open_row = open_in(|a, b| a / 9 == b / 9);
        let open_column = open_in(|a, b| a % 9 == b % 9);
        let open_box = open_in(|a, b| a / 27 == b / 27 && a % 9 / 3 == b % 9 / 3);
        surroundings.push([
            open_row.min(open_column),
            open_row.max(open_column),
            open_box,
        ]);
    }
    for candidate in &pattern.candidates {
        digits[usize::from(candidate.digit - 1)] += 1;
    }
    let mut types = [0; 3];
    for house in &pattern.houses {
        types[match house {
            House::Row(_) => 0,
            House::Column(_) => 1,
            House::Box(_) => 2,
        }] += 1;
    }
    if types[0] > types[1] {
        types.swap(0, 1);
    }
    for counts in [&mut rows, &mut columns, &mut boxes, &mut digits] {
        counts.sort_unstable();
    }
    surroundings.sort_unstable();
    let mut layout = [rows.min(columns), rows.max(columns), boxes, digits].concat();
    layout.extend(types);
    layout.extend(surroundings.into_iter().flatten());
    layout
}

#[test]
fn each_technique_has_three_distinct_practice_grids_with_varied_proof_layouts() {
    for technique in Technique::ALL {
        let mut layouts = BTreeSet::new();
        let mut puzzles = BTreeSet::new();
        for example in technique.practice_examples() {
            let position = example.position().unwrap();
            let board = position.values().unwrap();
            let verified = VerifiedTemplate::verify(board)
                .unwrap_or_else(|error| panic!("{technique:?}: invalid practice grid {error:?}"));
            assert!(
                puzzles.insert(canonical_puzzle(&position.givens)),
                "{technique:?}: equivalent practice grids"
            );
            let moves = deductions_at(&position, &[technique]).unwrap();
            let expected = moves
                .iter()
                .find(|found| found.actions == example.expected_actions)
                .unwrap_or_else(|| panic!("{technique:?}: missing expected practice deduction"));
            for action in &expected.actions {
                let candidate = action.candidate();
                assert_eq!(
                    verified.solution()[candidate.cell] == candidate.digit,
                    matches!(action, HintAction::Place(_)),
                    "{technique:?}: incorrect {action:?}"
                );
            }
            for proof in &expected.proofs {
                layouts.insert(practice_layout(&board, &proof.pattern));
            }
        }
        assert_eq!(puzzles.len(), 3);
        assert!(layouts.len() >= 2, "{technique:?}: repeated proof layout");
    }
}

#[test]
fn alternate_search_backtracks_when_the_preferred_deductions_stall() {
    use Technique::{Aic, GroupedAic, HiddenSingle, NakedSingle, WWing, XYWing};
    let position = Technique::UniqueRectangle1
        .practice_example()
        .position()
        .unwrap();
    let order = [NakedSingle, HiddenSingle, XYWing, WWing, Aic, GroupedAic];
    let comparison = compare_paths(&position, &order, Aic).unwrap();
    assert_eq!(comparison.without_technique.status, SolveStatus::Stalled);
    assert!(!comparison.without_technique.steps.is_empty());
    let result = search_alternate_path(&position, &order, Aic, 50).unwrap();
    assert_eq!(result.status, AlternatePathStatus::Found);
    let path = result.path.unwrap();
    assert_eq!(path.board, solve(&position.values().unwrap()).unwrap());
    assert_eq!(
        path.technique_order,
        comparison.without_technique.technique_order
    );
    assert!(result.positions_searched as usize > path.steps.len());
    for index in 0..path.steps.len() {
        let replay = path.replay_step(index).unwrap();
        assert!(!matches!(replay.deduction.technique, Aic));
        assert!(
            technique_deductions_at(&replay.before, replay.deduction.technique)
                .unwrap()
                .contains(replay.deduction)
        );
    }
}

#[test]
fn practice_starts_before_the_first_target_deduction_and_retains_the_prefix() {
    use Technique::{HiddenSingle, LockedPair, NakedSingle, XWing};
    let givens = parse_givens(LockedPair.practice_example().givens).unwrap();
    let target = NakedSingle;
    let trace = solve_logically(&givens, &[LockedPair, target, HiddenSingle]).unwrap();
    let practice = trace.practice_position(target).unwrap();
    let mut expected = PositionSnapshot::new(givens);
    expected.entries[12] = 8;
    expected.entries[16] = 9;
    expected.eliminations[2] = 1 << 3;
    expected.eliminations[5] = 1 << 7;
    expected.eliminations[16] = (1 << 3) | (1 << 7);
    assert_eq!(practice, expected);
    let next = trace.replay_step(3).unwrap();
    assert_eq!(next.before, practice);
    assert_eq!(
        next.deduction.actions,
        [HintAction::Place(Candidate { cell: 26, digit: 5 })]
    );
    assert_eq!(
        solve_position(&practice, &[target]).unwrap().steps.first(),
        Some(next.deduction)
    );
    assert_eq!(
        trace.practice_position(LockedPair),
        Some(PositionSnapshot::new(givens))
    );
    assert_eq!(trace.practice_position(XWing), None);

    let stalled = solve_logically(&givens, &[LockedPair]).unwrap();
    assert_eq!(stalled.status, SolveStatus::Stalled);
    assert_eq!(
        stalled.practice_position(LockedPair),
        Some(PositionSnapshot::new(givens))
    );
}

#[test]
fn practice_check_accepts_an_alternate_effect_and_requires_a_proof_of_the_target_technique() {
    use Technique::{Claiming, LockedPair, Pointing};
    let mut position = LockedPair.practice_example().position().unwrap();
    let remove = |cell, digit| HintAction::Eliminate(Candidate { cell, digit });
    let attempt = remove(32, 2);
    let proof = check_practice_move(&position, Pointing, attempt)
        .unwrap()
        .unwrap();
    assert_eq!(proof.technique, Pointing);
    assert_eq!(proof.actions, [remove(30, 2), attempt]);
    assert_eq!(
        proof.evidence,
        HintEvidence::Intersection {
            source: House::Box(3),
            target: House::Row(3),
            cells: vec![27, 28, 29],
        }
    );
    assert!(
        check_practice_move(&position, Claiming, attempt)
            .unwrap()
            .is_some()
    );
    assert_eq!(
        check_practice_move(&position, LockedPair, attempt),
        Ok(None)
    );
    assert_eq!(
        check_practice_move(&position, Pointing, HintAction::Place(attempt.candidate())),
        Ok(None)
    );
    for invalid in [remove(81, 2), remove(32, 0), remove(32, 10)] {
        assert_eq!(check_practice_move(&position, Pointing, invalid), Ok(None));
    }
    position.eliminations[32] = 1 << 1;
    assert_eq!(check_practice_move(&position, Pointing, attempt), Ok(None));
    assert_eq!(
        check_practice_move(&position, Pointing, remove(30, 2))
            .unwrap()
            .unwrap()
            .actions,
        [remove(30, 2)]
    );
}

#[test]
fn hints_and_solving_use_the_same_entries_and_established_removals() {
    let givens = parse_givens(
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    )
    .unwrap();
    let mut position = PositionSnapshot::new(givens);
    position.entries[40] = 5;
    let expected = HintAction::Place(Candidate { cell: 2, digit: 4 });
    let profile = [Technique::NakedSingle];
    let trace = solve_position(&position, &profile).unwrap();
    assert_eq!(trace.replay_step(0).unwrap().before, position);
    assert!(
        deductions_at(&position, &profile)
            .unwrap()
            .iter()
            .all(|found| found.actions != [expected])
    );
    position.eliminations[2] = 0b11;
    let found = deductions_at(&position, &profile)
        .unwrap()
        .into_iter()
        .find(|found| found.actions == [expected])
        .unwrap();
    assert_eq!(found.proofs[0].pattern.candidates, [expected.candidate()]);
    let deductions = technique_deductions_at(&position, Technique::NakedSingle).unwrap();
    assert!(
        deductions
            .iter()
            .any(|deduction| deduction.actions == [expected])
    );
    let trace = solve_position(&position, &profile).unwrap();
    let first = trace.replay_step(0).unwrap();
    let mut after = position.clone();
    after.entries[2] = 4;
    assert_eq!(first.before, position);
    assert_eq!(first.deduction.actions, [expected]);
    assert_eq!(first.after, after);
    assert_eq!(trace.board[40], 5);
    assert!(!trace.steps.iter().any(|step| {
        step.actions
            .contains(&HintAction::Place(Candidate { cell: 40, digit: 5 }))
    }));

    position.eliminations[2] |= 1 << 3;
    assert_eq!(
        deductions_at(&position, &profile),
        Err(HintError::InvalidEliminations)
    );
    assert_eq!(
        solve_position(&position, &[Technique::NakedSingle]),
        Err(HintError::InvalidEliminations)
    );
    position.entries[0] = 9;
    assert_eq!(position.values(), Err(Analysis::Conflict));
}
