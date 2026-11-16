use sudoku_app_engine::{
    Analysis, Candidate, HintAction, HintError, HintEvidence, House, PositionSnapshot,
    RankConstraint, RankError, RankFallbackOptions, RankOutcome, RankPattern, RankSolveStatus,
    RankSolveStep, SolveStatus, Technique, candidates, discover_rank_at,
    discover_rank_deductions_at, parse_givens, prove_rank_at, rank_deductions_at,
    rank_proof_effort_at, replay_rank_proof_at, solve, solve_logically, solve_position_with_rank,
    technique_deductions_at,
};

use RankConstraint::{Cell, HouseDigit};

#[path = "../benches/fixtures/easter_rank.rs"]
mod easter_rank;
use easter_rank::{EASTER_MONSTER, TARGET, barker_pattern};
#[path = "../benches/fixtures/monhard_rank_stalls.rs"]
mod monhard;

fn house_digit(house: House, digit: u8) -> RankConstraint {
    HouseDigit { house, digit }
}

#[test]
fn a_rank_removal_unlocks_a_grid_that_stalls_with_the_reference_expert_profile() {
    let givens = parse_givens(monhard::STALLS[0].1).unwrap();
    let order = monhard::profile();
    let baseline = solve_logically(&givens, &order).unwrap();
    assert_eq!(baseline.status, SolveStatus::Stalled);
    let snapshot = PositionSnapshot::new(givens);
    let options = RankFallbackOptions {
        max_steps: 1,
        node_budget: 40_000,
        ..RankFallbackOptions::default()
    };
    let trace = solve_position_with_rank(&snapshot, &order, options).unwrap();
    let solution = solve(&givens).unwrap();
    assert_eq!(trace.status, RankSolveStatus::Solved);
    assert_eq!(trace.board, solution);
    assert_eq!(trace.technique_order, order);
    for (step, baseline_step) in trace.steps.iter().zip(&baseline.steps) {
        assert!(matches!(step, RankSolveStep::Technique(hint) if hint == baseline_step));
    }
    let index = baseline.steps.len();
    let replay = trace.replay_step(index).unwrap();
    let RankSolveStep::Rank {
        proof,
        effort,
        search,
        actions,
    } = replay.deduction
    else {
        panic!("expected a rank removal at the first stall");
    };
    assert_eq!(Some(replay.before.clone()), baseline.positions().last());
    assert_eq!(
        rank_proof_effort_at(&replay.before, proof),
        Ok(Some(*effort))
    );
    let Candidate { cell, digit } = proof.target;
    assert_ne!(solution[cell], digit);
    assert_eq!(*actions, [HintAction::Eliminate(proof.target)]);
    assert_eq!(
        replay.after.eliminations[cell],
        replay.before.eliminations[cell] | (1 << (digit - 1))
    );
    assert_eq!(trace.rank_nodes_visited, search.nodes_visited);
    assert_eq!(search.node_budget, options.node_budget);
    assert!(search.nodes_visited <= search.node_budget);

    let mut subtotal = 0;
    let mut counts = std::collections::BTreeMap::new();
    for step in &trace.steps {
        if let RankSolveStep::Technique(hint) = step {
            subtotal += u32::from(hint.technique.cost());
            *counts.entry(hint.technique).or_default() += 1;
        }
        for &action in step.actions() {
            let target = action.candidate();
            assert_eq!(
                solution[target.cell] == target.digit,
                matches!(action, HintAction::Place(_))
            );
        }
    }
    assert_eq!(trace.named_score.points, subtotal);
    assert_eq!(trace.named_score.counts, counts);
    assert_eq!(trace.positions().nth(index + 1), Some(replay.after));
    assert_eq!(
        trace.positions().last().unwrap().values().unwrap(),
        solution
    );

    let resumed = solve_position_with_rank(&replay.before, &order, options).unwrap();
    assert_eq!(resumed.steps, trace.steps[index..]);
    assert_eq!(resumed.rank_nodes_visited, search.nodes_visited);
}

#[test]
fn rank_solve_distinguishes_budget_limits_from_a_stall_and_honors_the_named_order() {
    let grid = parse_givens(
        "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
    )
    .unwrap();
    let mut one_blank = grid;
    one_blank[0] = 0;
    let start = PositionSnapshot::new(one_blank);
    let limits = RankFallbackOptions {
        node_budget: 1,
        ..RankFallbackOptions::default()
    };
    let stall = solve_position_with_rank(&start, &[], limits).unwrap();
    assert_eq!(stall.status, RankSolveStatus::Stalled);
    assert_eq!(stall.rank_nodes_visited, 1);
    assert!(stall.terminal_rank_search.unwrap().complete);
    assert!(stall.steps.is_empty());

    let zero_steps = RankFallbackOptions {
        max_steps: 0,
        ..limits
    };
    let step_limit = solve_position_with_rank(&start, &[], zero_steps).unwrap();
    assert_eq!(step_limit.status, RankSolveStatus::RankStepLimit);
    assert_eq!(step_limit.rank_nodes_visited, 0);
    let trace = solve_position_with_rank(
        &start,
        &[Technique::NakedSingle, Technique::FullHouse],
        zero_steps,
    )
    .unwrap();
    assert_eq!(trace.status, RankSolveStatus::Solved);
    assert!(
        matches!(trace.steps.as_slice(), [RankSolveStep::Technique(hint)] if hint.technique == Technique::NakedSingle)
    );
    assert_eq!(trace.rank_nodes_visited, 0);

    one_blank[80] = 0;
    let limited = solve_position_with_rank(&PositionSnapshot::new(one_blank), &[], limits).unwrap();
    assert_eq!(limited.status, RankSolveStatus::RankSearchLimit);
    assert_eq!(limited.rank_nodes_visited, 1);
    assert!(!limited.terminal_rank_search.unwrap().complete);
    assert_eq!(limited.board, one_blank);

    assert_eq!(
        solve_position_with_rank(&PositionSnapshot::new([0; 81]), &[], limits),
        Err(HintError::Puzzle(Analysis::Multiple))
    );
}

#[test]
fn rank_solve_spends_the_total_budget_across_scans() {
    let givens = parse_givens(monhard::STALLS[1].1).unwrap();
    let order = monhard::profile();
    let snapshot = PositionSnapshot::new(givens);
    let options = RankFallbackOptions {
        node_budget: 40_000,
        ..Default::default()
    };
    let trace = solve_position_with_rank(&snapshot, &order, options).unwrap();
    assert_eq!(trace.status, RankSolveStatus::RankSearchLimit);
    let mut remaining = options.node_budget;
    let mut removals = 0;
    for search in trace
        .steps
        .iter()
        .filter_map(|step| match step {
            RankSolveStep::Rank { search, .. } => {
                removals += 1;
                Some(search)
            }
            RankSolveStep::Technique(_) => None,
        })
        .chain(trace.terminal_rank_search.iter())
    {
        assert_eq!(
            search.node_budget,
            remaining.min(options.max_nodes_per_scan)
        );
        assert!(search.nodes_visited <= search.node_budget);
        remaining -= search.nodes_visited;
    }
    assert!(removals > 0);
    assert_eq!(trace.rank_nodes_visited, options.node_budget - remaining);
}

#[test]
fn discovers_a_mixed_certificate_for_easter_monster_within_budget() {
    let givens = parse_givens(EASTER_MONSTER).unwrap();
    let trace = solve_logically(&givens, Technique::DEFAULT_ORDER).unwrap();
    let snapshot = trace.positions().last().unwrap();
    let too_small = discover_rank_at(&snapshot, TARGET, 1).unwrap();
    assert_eq!(too_small.outcome, RankOutcome::SearchLimit);
    assert_eq!(too_small.nodes_visited, 1);
    let limited = discover_rank_at(&snapshot, TARGET, 250).unwrap();
    assert!(limited.nodes_visited <= 250);
    let RankOutcome::Proven(initial_proof) = limited.outcome else {
        panic!("expected a proof even when refinement cannot finish");
    };
    assert_eq!(replay_rank_proof_at(&snapshot, &initial_proof), Ok(true));
    let discovery = discover_rank_at(&snapshot, TARGET, 100_000).unwrap();
    assert!(discovery.nodes_visited <= 100_000);
    let RankOutcome::Proven(proof) = discovery.outcome else {
        panic!("expected discovery to reproduce the published removal");
    };
    assert_eq!(proof.target, TARGET);
    let constraints: Vec<_> = proof
        .pattern
        .bases
        .iter()
        .chain(&proof.pattern.covers)
        .collect();
    assert!(
        constraints.len() <= 65,
        "found {} constraints",
        constraints.len()
    );
    assert!(
        constraints
            .iter()
            .any(|constraint| matches!(constraint, Cell(_)))
    );
    assert!(
        constraints
            .iter()
            .any(|constraint| matches!(constraint, HouseDigit { .. }))
    );
    assert_eq!(replay_rank_proof_at(&snapshot, &proof), Ok(true));
    let score = |proof| {
        rank_proof_effort_at(&snapshot, proof)
            .unwrap()
            .unwrap()
            .score
    };
    assert!(score(&proof) < score(&initial_proof));
    assert_eq!(discovery.effort.unwrap().score, score(&proof));

    let solution = solve(&givens).unwrap();
    assert_ne!(solution[TARGET.cell], TARGET.digit);
    let true_candidate = Candidate {
        cell: TARGET.cell,
        digit: solution[TARGET.cell],
    };
    assert_eq!(
        discover_rank_at(&snapshot, true_candidate, 100_000)
            .unwrap()
            .outcome,
        RankOutcome::Compatible
    );
    assert_eq!(
        discover_rank_at(&snapshot, TARGET, 100_000)
            .unwrap()
            .outcome,
        RankOutcome::Proven(proof)
    );
}

#[test]
fn position_wide_discovery_ranks_distinct_replayable_removals_with_shared_limits() {
    let givens = parse_givens(EASTER_MONSTER).unwrap();
    let trace = solve_logically(&givens, Technique::DEFAULT_ORDER).unwrap();
    let snapshot = trace.positions().last().unwrap();
    let solution = solve(&givens).unwrap();
    let partial = discover_rank_deductions_at(&snapshot, 10, 40_000, 200).unwrap();
    assert_eq!(partial.proofs.len(), 10);
    assert!(!partial.complete);
    assert!(partial.candidates_limited > 0);
    assert!(partial.nodes_visited <= 40_000);
    let mut seen = std::collections::BTreeSet::new();
    let mut previous = 0;
    assert_eq!(partial.efforts.len(), partial.proofs.len());
    for (proof, &estimated) in partial.proofs.iter().zip(&partial.efforts) {
        assert!(seen.insert(proof.target));
        assert_ne!(solution[proof.target.cell], proof.target.digit);
        let effort = rank_proof_effort_at(&snapshot, proof).unwrap().unwrap();
        assert_eq!(effort, estimated);
        assert!(effort.score >= previous);
        previous = effort.score;
    }
    let three = discover_rank_deductions_at(&snapshot, 3, 40_000, 200).unwrap();
    assert_eq!(three.proofs, partial.proofs[..3]);
    assert_eq!(three.nodes_visited, partial.nodes_visited);

    let no_budget = discover_rank_deductions_at(&snapshot, 10, 0, 200).unwrap();
    assert!(no_budget.proofs.is_empty());
    assert!(!no_budget.complete);
    assert_eq!(no_budget.candidates_examined, 0);
    let done = discover_rank_deductions_at(&PositionSnapshot::new(solution), 10, 0, 0).unwrap();
    assert!(done.complete);
    assert!(done.proofs.is_empty());
}

#[test]
fn a_complete_discovery_scan_removes_every_candidate_outside_the_solution() {
    let board = parse_givens(
        "970500060000007103800040000000080900685000000100003002000000000000600057008090200",
    )
    .unwrap();
    let solution = solve(&board).unwrap();
    let masks = candidates(&board).unwrap();
    let expected: std::collections::BTreeSet<_> = masks
        .into_iter()
        .enumerate()
        .flat_map(|(cell, mask)| {
            (1..=9)
                .filter(move |&digit| mask & (1 << (digit - 1)) != 0 && digit != solution[cell])
                .map(move |digit| Candidate { cell, digit })
        })
        .collect();
    let snapshot = PositionSnapshot::new(board);
    let scan = discover_rank_deductions_at(&snapshot, 729, 25_000, 2_000).unwrap();
    assert!(scan.complete);
    assert_eq!(scan.candidates_limited, 0);
    assert_eq!(scan.proofs.len(), expected.len());
    let actual = scan.proofs.into_iter().map(|proof| proof.target).collect();
    assert_eq!(expected, actual);
}

#[test]
fn barker_rank_zero_finds_the_published_removal_with_overlapping_mixed_constraints() {
    let givens = parse_givens(EASTER_MONSTER).unwrap();
    let trace = solve_logically(&givens, Technique::DEFAULT_ORDER).unwrap();
    assert_eq!(trace.steps.len(), 4);
    let snapshot = trace.positions().last().unwrap();
    let pattern = barker_pattern();
    assert_eq!(pattern.rank(), 0);
    assert_eq!(
        prove_rank_at(&snapshot, &pattern, TARGET, 1),
        Ok(RankOutcome::SearchLimit)
    );
    let scan = rank_deductions_at(&snapshot, &pattern, 50_000).unwrap();
    assert!(scan.complete);
    assert!(scan.nodes_visited > 1);
    let proof = scan
        .proofs
        .iter()
        .find(|proof| proof.target == TARGET)
        .unwrap();
    let partial = rank_deductions_at(&snapshot, &pattern, scan.nodes_visited - 1).unwrap();
    assert!(!partial.complete);
    assert!(!partial.proofs.is_empty());
    assert!(scan.proofs.starts_with(&partial.proofs));
    assert_eq!(
        prove_rank_at(&snapshot, &pattern, TARGET, 50_000),
        Ok(RankOutcome::Proven(proof.clone()))
    );
    assert!(proof.nodes.iter().any(|node| node.cases.len() > 1));

    let solution = solve(&givens).unwrap();
    for proof in &scan.proofs {
        assert_ne!(solution[proof.target.cell], proof.target.digit);
        assert_eq!(replay_rank_proof_at(&snapshot, proof), Ok(true));
    }
    let true_candidate = Candidate {
        cell: TARGET.cell,
        digit: solution[TARGET.cell],
    };
    assert_eq!(
        prove_rank_at(&snapshot, &pattern, true_candidate, 50_000),
        Ok(RankOutcome::Compatible)
    );

    let mut reduced = pattern;
    reduced.covers.pop();
    assert_eq!(
        prove_rank_at(&snapshot, &reduced, TARGET, 50_000),
        Ok(RankOutcome::Compatible)
    );
}

#[test]
fn overlapping_bases_can_support_a_removal_with_fewer_covers() {
    use House::{Box, Column, Row};
    let givens = parse_givens(EASTER_MONSTER).unwrap();
    let trace = solve_logically(&givens, Technique::DEFAULT_ORDER).unwrap();
    let mut snapshot = trace.positions().last().unwrap();
    let solution = solve(&givens).unwrap();
    let previous = barker_pattern();
    assert!(matches!(
        prove_rank_at(&snapshot, &previous, TARGET, 50_000),
        Ok(RankOutcome::Proven(_))
    ));
    snapshot.eliminations[TARGET.cell] |= 1 << (TARGET.digit - 1);

    // Barker's follow-up at r2c6 has 17 bases and 11 covers.
    let pattern = RankPattern {
        bases: vec![
            house_digit(Row(1), 2),
            house_digit(Row(1), 6),
            house_digit(Row(1), 7),
            house_digit(Row(4), 6),
            house_digit(Row(6), 1),
            house_digit(Column(3), 1),
            house_digit(Column(4), 1),
            house_digit(Column(6), 1),
            house_digit(Column(1), 2),
            house_digit(Column(4), 6),
            house_digit(Column(7), 6),
            house_digit(Column(1), 7),
            Cell(13),
            Cell(37),
            house_digit(Box(0), 2),
            house_digit(Box(2), 1),
            house_digit(Box(2), 6),
        ],
        covers: vec![
            house_digit(Row(1), 1),
            house_digit(Row(2), 1),
            house_digit(Row(3), 1),
            house_digit(Row(3), 6),
            house_digit(Column(1), 1),
            Cell(14),
            Cell(39),
            Cell(46),
            Cell(67),
            house_digit(Box(0), 7),
            house_digit(Box(7), 1),
        ],
    };
    let target = Candidate { cell: 14, digit: 1 };
    assert_ne!(solution[target.cell], target.digit);
    assert_eq!(pattern.rank(), -6);
    let RankOutcome::Proven(proof) = prove_rank_at(&snapshot, &pattern, target, 500).unwrap()
    else {
        panic!("expected the published removal");
    };
    assert_eq!(replay_rank_proof_at(&snapshot, &proof), Ok(true));
}

#[test]
fn replay_requires_all_cases_and_uses_the_snapshot_candidates() {
    let givens = parse_givens(EASTER_MONSTER).unwrap();
    let trace = solve_logically(&givens, Technique::DEFAULT_ORDER).unwrap();
    let mut snapshot = trace.positions().last().unwrap();
    let pattern = barker_pattern();
    let RankOutcome::Proven(proof) = prove_rank_at(&snapshot, &pattern, TARGET, 50_000).unwrap()
    else {
        panic!("expected Barker's rank proof");
    };
    let mut missing_case = proof.clone();
    missing_case
        .nodes
        .iter_mut()
        .find(|node| node.cases.len() > 1)
        .unwrap()
        .cases
        .pop();
    assert_eq!(replay_rank_proof_at(&snapshot, &missing_case), Ok(false));
    let mut extra_node = proof.clone();
    extra_node.nodes.push(proof.nodes[0].clone());
    assert_eq!(replay_rank_proof_at(&snapshot, &extra_node), Ok(false));
    snapshot.eliminations.fill(0);
    assert_eq!(replay_rank_proof_at(&snapshot, &proof), Ok(false));
}

#[test]
fn a_pointing_pattern_can_use_an_at_most_one_cover() {
    let snapshot = PositionSnapshot::new(
        parse_givens(
            "970500060000007103800040000000080900685000000100003002000000000000600057008090200",
        )
        .unwrap(),
    );
    let hints = technique_deductions_at(&snapshot, Technique::Pointing).unwrap();
    let hint = hints.iter().find(|hint| hint.actions.len() >= 2).unwrap();
    let HintEvidence::Intersection { source, target, .. } = hint.evidence else {
        panic!("expected a pointing intersection");
    };
    let HintAction::Eliminate(candidate) = hint.actions[0] else {
        panic!("expected a removal");
    };
    let mut pattern = RankPattern {
        bases: vec![house_digit(source, candidate.digit)],
        covers: vec![house_digit(target, candidate.digit)],
    };
    let RankOutcome::Proven(proof) = prove_rank_at(&snapshot, &pattern, candidate, 1).unwrap()
    else {
        panic!("expected a one-node proof");
    };
    assert!(proof.nodes[0].cases.is_empty());
    assert_eq!(replay_rank_proof_at(&snapshot, &proof), Ok(true));
    let effort = rank_proof_effort_at(&snapshot, &proof).unwrap().unwrap();
    assert_eq!(effort.constraints, 2);
    assert_eq!(effort.nodes, 1);
    assert_eq!(effort.extra_cases, 0);
    assert_eq!(effort.cells, effort.candidates);
    assert_eq!(effort.score, 5 + 2 * effort.candidates as u64);
    let other = hint.actions[1].candidate();
    let mut fewer_marks = snapshot.clone();
    fewer_marks.eliminations[other.cell] |= 1 << (other.digit - 1);
    let smaller = rank_proof_effort_at(&fewer_marks, &proof).unwrap().unwrap();
    assert_eq!(smaller.candidates + 1, effort.candidates);
    assert_eq!(smaller.score + 2, effort.score);
    let scan = rank_deductions_at(&snapshot, &pattern, 0).unwrap();
    assert!(!scan.complete);
    assert!(scan.proofs.is_empty());

    pattern.covers.push(pattern.bases[0]);
    let RankOutcome::Proven(overlap) = prove_rank_at(&snapshot, &pattern, candidate, 1).unwrap()
    else {
        panic!("expected the same proof with one constraint in both roles");
    };
    assert_eq!(rank_proof_effort_at(&snapshot, &overlap), Ok(Some(effort)));
    let cover = pattern.covers[0];
    pattern.covers.push(cover);
    assert_eq!(
        prove_rank_at(&snapshot, &pattern, candidate, 1),
        Err(RankError::DuplicateConstraint(cover))
    );
    for invalid in [
        Cell(81),
        house_digit(House::Box(9), 1),
        house_digit(House::Row(1), 0),
    ] {
        pattern.covers[2] = invalid;
        assert_eq!(
            prove_rank_at(&snapshot, &pattern, candidate, 1),
            Err(RankError::InvalidConstraint(invalid))
        );
    }
}

#[test]
fn specialized_rank_zero_detectors_agree_with_the_mixed_checker() {
    for technique in [Technique::SkLoop, Technique::MultiSectorLockedSets] {
        let [example, _, _] = technique.practice_examples();
        let snapshot = example.position().unwrap();
        let hint = technique_deductions_at(&snapshot, technique)
            .unwrap()
            .into_iter()
            .find(|hint| hint.actions.contains(&example.expected_actions[0]))
            .unwrap();
        let (bases, links) = match hint.evidence {
            HintEvidence::SkLoop(proof) => (
                proof.arms.into_iter().flatten().map(Cell).collect(),
                Vec::from(proof.links),
            ),
            HintEvidence::MultiSectorLockedSets {
                core,
                attachments,
                links,
            } => (
                core.into_iter().chain(attachments).map(Cell).collect(),
                links,
            ),
            _ => panic!("expected rank-zero evidence"),
        };
        let pattern = RankPattern {
            bases,
            covers: links
                .into_iter()
                .flat_map(|link| {
                    link.digits
                        .into_iter()
                        .map(move |digit| house_digit(link.house, digit))
                })
                .collect(),
        };
        assert_eq!(pattern.rank(), 0);
        let scan = rank_deductions_at(&snapshot, &pattern, 100_000).unwrap();
        assert!(scan.complete, "{technique:?}");
        for action in hint.actions {
            let HintAction::Eliminate(target) = action else {
                panic!("expected a rank-zero removal");
            };
            assert!(
                scan.proofs.iter().any(|proof| proof.target == target),
                "{technique:?} {target:?}"
            );
        }
    }
}
