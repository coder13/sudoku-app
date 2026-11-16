use std::{hint::black_box, time::Instant};

use sudoku_app_engine::{
    Candidate, PositionSnapshot, RankOutcome, Technique, discover_rank_at,
    discover_rank_deductions_at, parse_givens, prove_rank_at, replay_rank_proof_at, solve,
    solve_logically,
};

#[path = "../fixtures/easter_rank.rs"]
mod easter;

pub fn run() {
    let givens = parse_givens(easter::EASTER_MONSTER).unwrap();
    let trace = solve_logically(&givens, Technique::DEFAULT_ORDER).unwrap();
    assert_eq!(trace.steps.len(), 4);
    let snapshot = trace.positions().last().unwrap();
    let solution = solve(&givens).unwrap();
    assert_ne!(solution[easter::TARGET.cell], easter::TARGET.digit);

    let pattern = easter::barker_pattern();
    report("published r6c7", &snapshot, || {
        (
            prove_rank_at(&snapshot, &pattern, easter::TARGET, 500).unwrap(),
            None,
        )
    });
    for budget in [128, 250, 500, 2_000, 10_000, 20_000, 50_000, 100_000] {
        report(
            &format!("discover r6c7, budget {budget}"),
            &snapshot,
            || {
                let result = discover_rank_at(&snapshot, easter::TARGET, budget).unwrap();
                (result.outcome, Some(result.nodes_visited))
            },
        );
    }

    let mut after = snapshot.clone();
    assert!(matches!(
        discover_rank_at(&after, easter::TARGET, 2_000)
            .unwrap()
            .outcome,
        RankOutcome::Proven(_)
    ));
    after.eliminations[easter::TARGET.cell] |= 1 << (easter::TARGET.digit - 1);
    let target = Candidate { cell: 14, digit: 1 };
    assert_ne!(solution[target.cell], target.digit);
    report("discover r2c6, budget 2000", &after, || {
        let result = discover_rank_at(&after, target, 2_000).unwrap();
        (result.outcome, Some(result.nodes_visited))
    });
    let scan = || discover_rank_deductions_at(&snapshot, 10, 40_000, 200).unwrap();
    let result = scan();
    for proof in &result.proofs {
        assert_ne!(solution[proof.target.cell], proof.target.digit);
        assert_eq!(replay_rank_proof_at(&snapshot, proof), Ok(true));
    }
    let (median, p95) = times(scan);
    println!(
        "discover ranked removals: {} retained from {} candidates ({} limited), {} visits, {median:.2} ms median, {p95:.2} ms p95",
        result.proofs.len(),
        result.candidates_examined,
        result.candidates_limited,
        result.nodes_visited
    );
}

fn report(label: &str, snapshot: &PositionSnapshot, work: impl Fn() -> (RankOutcome, Option<u32>)) {
    let (outcome, visits) = work();
    let (median, p95) = times(work);
    let metrics = match outcome {
        RankOutcome::Proven(proof) => {
            assert_eq!(replay_rank_proof_at(snapshot, &proof), Ok(true));
            let splits = proof
                .nodes
                .iter()
                .filter(|node| node.cases.len() > 1)
                .count();
            format!(
                "{} bases, {} covers, {} proof nodes, {splits} case splits",
                proof.pattern.bases.len(),
                proof.pattern.covers.len(),
                proof.nodes.len()
            )
        }
        RankOutcome::Compatible => "compatible".to_owned(),
        RankOutcome::SearchLimit => "search limit".to_owned(),
    };
    let visits = visits.map_or(String::new(), |count| format!("{count} visits, "));
    println!("{label}: {visits}{metrics}, {median:.2} ms median, {p95:.2} ms p95");
}

fn times<T>(work: impl Fn() -> T) -> (f64, f64) {
    let mut timings = [0.0; super::RUNS];
    for time in &mut timings {
        let start = Instant::now();
        black_box(work());
        *time = start.elapsed().as_secs_f64() * 1_000.0;
    }
    timings.sort_unstable_by(f64::total_cmp);
    let median = timings[timings.len() / 2];
    let p95 = timings[(timings.len() * 95).div_ceil(100) - 1];
    (median, p95)
}
