use std::time::Instant;

use serde::Deserialize;
use sudoku_app_engine::{
    Board, Candidate, HintAction, LogicalSolve, PositionSnapshot, RankFallbackOptions, RankOutcome,
    RankPattern, RankProof, RankProofEffort, RankSolveStatus, RankSolveStep, SolveStatus,
    Technique, discover_rank_at, discover_rank_deductions_at, parse_givens, prove_rank_at,
    rank_proof_effort_at, replay_rank_proof_at, solve, solve_position, solve_position_with_rank,
};

const SCAN_BUDGET: u32 = 40_000;
const PER_CANDIDATE_BUDGET: u32 = 200;
const FALLBACK_MOVES: usize = 8;

#[path = "../fixtures/monhard_rank_stalls.rs"]
mod monhard;

#[derive(Deserialize)]
struct FixturePosition {
    #[serde(alias = "givens")]
    values: String,
    entries: String,
    eliminations: Vec<u16>,
}

impl FixturePosition {
    fn snapshot(self) -> PositionSnapshot {
        PositionSnapshot {
            givens: parse_givens(&self.values).unwrap(),
            entries: parse_givens(&self.entries).unwrap(),
            eliminations: self.eliminations.try_into().unwrap(),
        }
    }
}

#[derive(Deserialize)]
struct Published {
    id: String,
    #[serde(flatten)]
    position: FixturePosition,
    target: Candidate,
    pattern: RankPattern,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stall {
    source_line: usize,
    #[serde(flatten)]
    position: FixturePosition,
}

pub fn run() {
    compare_published();
    compare_expert_stalls();
}

pub fn frontier() {
    let order = monhard::profile();
    let options = RankFallbackOptions::default();
    for &(line, givens) in monhard::STALLS {
        let snapshot = PositionSnapshot::new(parse_givens(givens).unwrap());
        let solution = solve(&snapshot.givens).unwrap();
        let baseline = solve_position(&snapshot, &order).unwrap();
        assert_eq!(baseline.status, SolveStatus::Stalled);
        check_trace(&baseline, &solution);

        let stalled = baseline.positions().last().unwrap();
        let start = Instant::now();
        let trace = solve_position_with_rank(&stalled, &order, options).unwrap();
        let integrated_ms = start.elapsed().as_secs_f64() * 1_000.0;
        assert_eq!(trace.status, RankSolveStatus::Solved);
        assert_eq!(trace.board, solution);
        let mut moves = 0;
        let mut nodes = 0;
        for (step, before) in trace.steps.iter().zip(trace.positions()) {
            for &action in step.actions() {
                let candidate = action.candidate();
                assert_eq!(
                    solution[candidate.cell] == candidate.digit,
                    matches!(action, HintAction::Place(_))
                );
            }
            if let RankSolveStep::Rank {
                proof,
                effort,
                search,
                ..
            } = step
            {
                assert_eq!(rank_proof_effort_at(&before, proof), Ok(Some(*effort)));
                assert!(search.nodes_visited <= search.node_budget);
                assert!(search.node_budget <= options.max_nodes_per_scan);
                moves += 1;
                nodes += search.nodes_visited;
            }
        }
        assert_eq!(trace.rank_nodes_visited, nodes);
        assert!(nodes <= options.node_budget);
        assert!(moves <= options.max_steps);

        // Use the same starting position and budget for both implementations.
        // The benchmark measures solving only, with certificate checks outside the timers.
        let mut integrated = [integrated_ms; 3];
        let mut snapshot_based = [0.0; 3];
        for (index, elapsed) in snapshot_based.iter_mut().enumerate() {
            let start = Instant::now();
            let (solved, snapshot_moves) =
                solve_with_fallback(stalled.clone(), &solution, &order, false, false);
            *elapsed = start.elapsed().as_secs_f64() * 1_000.0;
            assert!(solved, "snapshot fallback must recover Monhard line {line}");
            assert_eq!(moves, snapshot_moves);
            if index + 1 < integrated.len() {
                let start = Instant::now();
                let other = solve_position_with_rank(&stalled, &order, options).unwrap();
                integrated[index + 1] = start.elapsed().as_secs_f64() * 1_000.0;
                assert_eq!(other, trace);
            }
        }
        integrated.sort_unstable_by(f64::total_cmp);
        snapshot_based.sort_unstable_by(f64::total_cmp);
        println!(
            "Monhard line {line}: {moves} rank removals, {nodes} search nodes, {:.0} ms integrated, {:.0} ms from snapshots",
            integrated[1], snapshot_based[1]
        );
    }
}

fn compare_published() {
    // Step IDs refer to the raw set list in Barker's walkthrough.
    // https://sudoku.allanbarker.com/sweb/extra/easter/a_em.htm
    for line in include_str!("../fixtures/barker-rank.jsonl").lines() {
        let example: Published = serde_json::from_str(line).unwrap();
        let snapshot = example.position.snapshot();
        let solution = solve(&snapshot.givens).unwrap();
        assert_ne!(solution[example.target.cell], example.target.digit);
        let outcome = prove_rank_at(&snapshot, &example.pattern, example.target, 25_000).unwrap();
        let RankOutcome::Proven(proof) = outcome else {
            panic!("published step {} must prove its removal", example.id);
        };
        let published = rank_proof_effort_at(&snapshot, &proof).unwrap().unwrap();
        let automatic = discover_rank_at(&snapshot, example.target, 2_000).unwrap();
        let RankOutcome::Proven(proof) = automatic.outcome else {
            panic!("discovery on step {} must prove its removal", example.id);
        };
        let measured = rank_proof_effort_at(&snapshot, &proof).unwrap().unwrap();
        assert_eq!(automatic.effort, Some(measured));
        println!(
            "Barker step {}: published score {}, {} candidates, {} extra cases. Discovery score {}, {} candidates, {} extra cases",
            example.id,
            published.score,
            published.candidates,
            published.extra_cases,
            measured.score,
            measured.candidates,
            measured.extra_cases,
        );
    }
}

fn compare_expert_stalls() {
    let mut finished = [0; 2];
    let mut totals = [0; 2];
    let mut timing = [0.0; 2];
    let mut named_finished = 0;
    let mut named_time = 0.0;
    let mut named_order = Technique::default_order().to_vec();
    let before_forcing = named_order
        .iter()
        .position(|technique| *technique == Technique::ForcingChain)
        .unwrap();
    named_order.insert(before_forcing, Technique::Tridagon);
    named_order.extend([
        Technique::DynamicForcingNet,
        Technique::TridagonForcingNet,
        Technique::NestedForcingNet,
    ]);
    for line in include_str!("../fixtures/te3-stalls-v10.jsonl").lines() {
        let stall: Stall = serde_json::from_str(line).unwrap();
        let snapshot = stall.position.snapshot();
        let solution = solve(&snapshot.givens).unwrap();
        let scan = scan_all(&snapshot);
        let mut positions: Vec<_> = scan.proofs.iter().zip(&scan.efforts).collect();
        let new = totals_for_top_ten(&positions);
        positions.sort_unstable_by_key(|&(proof, effort)| legacy_key(proof, effort));
        let old = totals_for_top_ten(&positions);
        for &(proof, _) in positions.iter().take(10) {
            assert_ne!(solution[proof.target.cell], proof.target.digit);
            assert_eq!(replay_rank_proof_at(&snapshot, proof), Ok(true));
        }
        for proof in scan.proofs.iter().take(10) {
            assert_ne!(solution[proof.target.cell], proof.target.digit);
            assert_eq!(replay_rank_proof_at(&snapshot, proof), Ok(true));
        }
        println!(
            "TE3 {}: top-ten totals for constraints, candidates, nodes, extra cases. Branch-first {old:?}. Effort {new:?}",
            stall.source_line
        );
        for (index, branch_first) in [true, false].into_iter().enumerate() {
            let start = Instant::now();
            let (solved, rank_moves) = solve_with_fallback(
                snapshot.clone(),
                &solution,
                Technique::default_order(),
                branch_first,
                true,
            );
            finished[index] += usize::from(solved);
            totals[index] += rank_moves;
            timing[index] += start.elapsed().as_secs_f64() * 1_000.0;
        }
        let start = Instant::now();
        let trace = solve_position(&snapshot, &named_order).unwrap();
        check_trace(&trace, &solution);
        named_finished += usize::from(matches!(trace.status, SolveStatus::Solved(_)));
        named_time += start.elapsed().as_secs_f64() * 1_000.0;
    }
    println!(
        "Fallback ({FALLBACK_MOVES} rank moves per grid): branch-first {} complete, {} rank moves, {:.0} ms total. Effort {} complete, {} rank moves, {:.0} ms total",
        finished[0], totals[0], timing[0], finished[1], totals[1], timing[1],
    );
    println!("Named expert profile: {named_finished} complete, {named_time:.0} ms total");
}

fn totals_for_top_ten(proofs: &[(&RankProof, &RankProofEffort)]) -> [usize; 4] {
    proofs.iter().take(10).fold([0; 4], |sum, (_, effort)| {
        [
            sum[0] + effort.constraints,
            sum[1] + effort.candidates,
            sum[2] + effort.nodes,
            sum[3] + effort.extra_cases,
        ]
    })
}

fn legacy_key(proof: &RankProof, effort: &RankProofEffort) -> (usize, usize, usize, Candidate) {
    (
        effort.extra_cases,
        effort.nodes,
        proof.pattern.bases.len() + proof.pattern.covers.len(),
        proof.target,
    )
}

fn scan_all(snapshot: &PositionSnapshot) -> sudoku_app_engine::RankDiscoveryScan {
    discover_rank_deductions_at(snapshot, 729, SCAN_BUDGET, PER_CANDIDATE_BUDGET).unwrap()
}

fn check_trace(trace: &LogicalSolve, solution: &Board) {
    for &action in trace.steps.iter().flat_map(|step| &step.actions) {
        let candidate = action.candidate();
        assert_eq!(
            solution[candidate.cell] == candidate.digit,
            matches!(action, HintAction::Place(_))
        );
    }
    if matches!(trace.status, SolveStatus::Solved(_)) {
        assert_eq!(&trace.board, solution);
    }
}

fn solve_with_fallback(
    mut position: PositionSnapshot,
    solution: &Board,
    order: &[Technique],
    branch_first: bool,
    verify: bool,
) -> (bool, usize) {
    for rank_moves in 0..=FALLBACK_MOVES {
        let trace = solve_position(&position, order).unwrap();
        if verify {
            check_trace(&trace, solution);
        }
        if matches!(trace.status, SolveStatus::Solved(_)) {
            assert_eq!(&trace.board, solution);
            return (true, rank_moves);
        }
        if rank_moves == FALLBACK_MOVES {
            break;
        }
        position = trace.positions().last().unwrap();
        let scan = scan_all(&position);
        let choice = if branch_first {
            scan.proofs
                .iter()
                .zip(&scan.efforts)
                .min_by_key(|&(proof, effort)| legacy_key(proof, effort))
                .map(|(proof, _)| proof)
        } else {
            scan.proofs.first()
        };
        let Some(proof) = choice else {
            return (false, rank_moves);
        };
        if verify {
            assert_eq!(replay_rank_proof_at(&position, proof), Ok(true));
        }
        let Candidate { cell, digit } = proof.target;
        assert_ne!(solution[cell], digit);
        position.eliminations[cell] |= 1 << (digit - 1);
    }
    (false, FALLBACK_MOVES)
}
