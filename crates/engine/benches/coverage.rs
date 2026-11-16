use std::{collections::BTreeSet, hint::black_box, time::Instant};

use serde_json::json;
use sudoku_app_engine::{
    Board, HintAction, SCORING_VERSION, SolveStatus, Technique, VerifiedTemplate, parse_givens,
    rate_puzzle, solve_logically, solve_position,
};

const RUNS: usize = 25;
const STARTER: &str =
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

const CORPUS: &[(&str, &[(&str, &str)])] = &[
    // Starter plus grids generated locally from seeds 3, 7, 19, 31, and 53.
    (
        "everyday",
        &[
            ("starter", STARTER),
            (
                "seed-3",
                "010700020602005007070049030451902370020300094030000160543000200000003009200400700",
            ),
            (
                "seed-7",
                "040005186000000309003800000005780004400056030200010065520100000008007610074628090",
            ),
            (
                "seed-19",
                "093021070020800036000300010730200104048107000102460000010780003500900700000510600",
            ),
            (
                "seed-31",
                "000006090009504200400093000170600009020008500904031080647089005200000040501060308",
            ),
            (
                "seed-53",
                "000080000700650049005004000903700016047500800600038000500071360376000081004360007",
            ),
        ],
    ),
    // Gordon Royle's 17-clue collection. See the 17-clue data set in Tdoku's benchmarks.
    (
        "17-clue",
        &[
            (
                "sparse-1",
                "345000000000200010000000000020100000000004500600000007800750000000060040000000300",
            ),
            (
                "sparse-2",
                "050040000000010040009000300100000080002005000000300000000700502480000000600000000",
            ),
            (
                "sparse-3",
                "000000021900040000800070000027600000000000930000000000050200000300000400000105000",
            ),
            (
                "sparse-4",
                "000000012008030000000000040120500000000004700060000000507000300000620000000100000",
            ),
            (
                "sparse-5",
                "500600020040000000000000000083000400090000100000200000700040001200000050000908000",
            ),
            (
                "sparse-6",
                "100000480007250000000300000000000025600004000000030000320000000000800100000000600",
            ),
        ],
    ),
    // Inkala's 2006 and 2012 puzzles, the Easter Monster, and two expert practice grids.
    (
        "expert",
        &[
            (
                "ai-escargot",
                "100007090030020008009600500005300900010080002600004000300000010041000007007000300",
            ),
            (
                "inkala-2012",
                "800000000003600000070090200050007000000045700000100030001000068008500010090000400",
            ),
            (
                "easter-monster",
                "100000002090400050006000700050903000000070000000850040700000600030009080002000001",
            ),
            (
                "junior-exocet",
                "007020004930000600600300000000000050200010008006900400003700900020050001000008000",
            ),
            (
                "multi-sector",
                "000000000001000803400090060000108200008000001500040000000000302090050070070000040",
            ),
        ],
    ),
];

fn digits(board: &Board) -> String {
    board
        .iter()
        .map(|&digit| char::from(b'0' + digit))
        .collect()
}

fn main() {
    let order = Technique::DEFAULT_ORDER;
    eprintln!(
        "Default logical order, scoring version {SCORING_VERSION}, {RUNS} timed ratings per grid"
    );
    let mut seen = BTreeSet::new();
    for &(group, puzzles) in CORPUS {
        let mut solved = 0;
        let mut timings = Vec::with_capacity(RUNS * puzzles.len());
        for &(name, givens) in puzzles {
            let board = parse_givens(givens).expect("valid coverage fixture");
            assert!(seen.insert(board), "{name}: duplicate fixture");
            let template =
                VerifiedTemplate::verify(board).unwrap_or_else(|error| panic!("{name}: {error:?}"));
            if group == "17-clue" {
                assert_eq!(
                    board.iter().filter(|&&digit| digit > 0).count(),
                    17,
                    "{name}"
                );
            }
            let trace = solve_logically(&board, order).expect("trace for a unique grid");
            let rating = rate_puzzle(&board, order).expect("rating for a unique grid");
            assert_eq!(rating.status, trace.status, "{name}");
            assert_eq!(rating.score, trace.score, "{name}");
            for action in trace.steps.iter().flat_map(|step| &step.actions) {
                let candidate = action.candidate();
                assert_eq!(
                    template.solution()[candidate.cell] == candidate.digit,
                    matches!(action, HintAction::Place(_)),
                    "{name}: {action:?}"
                );
            }
            for _ in 0..RUNS {
                let start = Instant::now();
                black_box(rate_puzzle(black_box(&board), order)).expect("repeatable rating");
                timings.push(start.elapsed().as_secs_f64() * 1000.0);
            }
            match rating.status {
                SolveStatus::Solved(_) => solved += 1,
                SolveStatus::Stalled => {
                    let end = trace.positions().last().expect("initial position");
                    assert_eq!(end.values(), Ok(trace.board), "{name}");
                    let replay = solve_position(&end, order).expect("valid stalled position");
                    assert_eq!(replay.status, SolveStatus::Stalled, "{name}");
                    assert!(replay.steps.is_empty(), "{name}: still has a move");
                    println!(
                        "{}",
                        json!({
                            "name": name,
                            "group": group,
                            "givens": givens,
                            "entries": digits(&end.entries),
                            "eliminations": end.eliminations.as_slice(),
                            "steps": trace.steps.len(),
                            "partialScore": trace.score.points,
                            "scoringVersion": trace.scoring_version,
                            "techniqueOrder": trace.technique_order,
                        })
                    );
                }
            }
        }
        timings.sort_by(f64::total_cmp);
        let median = timings[(timings.len() - 1) / 2];
        let p95 = timings[(95 * timings.len()).div_ceil(100) - 1];
        let count = puzzles.len();
        eprintln!(
            "{group}: {solved}/{count} solved ({:.1}%); rating median {median:.3} ms, p95 {p95:.3} ms",
            solved as f64 / count as f64 * 100.0
        );
    }
}
