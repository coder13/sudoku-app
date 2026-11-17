//! One JSON line per sample for the generator research tools.
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{self, BufRead};
use sudoku_app_engine::{
    Analysis, Board, Difficulty, SolveStatus, accepts_difficulty, analyze, candidates,
    canonical_puzzle, generate, parse_givens, rate_puzzle, solve,
};

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "kebab-case")]
enum Request {
    Canonical { givens: String },
    Check { givens: String },
    ClassicOrder { level: Difficulty },
    Solution { seed: u32 },
    Carve {
        seed: u32,
        level: Difficulty,
        groups: Vec<Vec<usize>>,
        clues: usize,
        singles: Option<usize>,
        #[serde(default)]
        trades: Vec<[usize; 2]>,
    },
}

fn grid(board: &Board) -> String {
    board.iter().map(|d| char::from(b'0' + d)).collect()
}

// Count distinct cells with a naked or hidden single. A cell can have several proofs.
fn opening_singles(board: &Board) -> usize {
    let masks = candidates(board).expect("carving preserves a valid solution");
    let mut found = masks.map(|m| m.count_ones() == 1);
    for house in 0..27 {
        let cells: [usize; 9] = std::array::from_fn(|i| match house {
            0..9 => 9 * house + i,
            9..18 => 9 * i + house - 9,
            _ => 27 * ((house - 18) / 3) + 3 * (house % 3) + 9 * (i / 3) + i % 3,
        });
        let mut once = 0;
        let mut twice = 0;
        for cell in cells {
            twice |= once & masks[cell];
            once |= masks[cell];
        }
        for cell in cells {
            found[cell] |= masks[cell] & once & !twice != 0;
        }
    }
    found.into_iter().filter(|&single| single).count()
}

fn carve(
    seed: u32,
    level: Difficulty,
    groups: Vec<Vec<usize>>,
    clues: usize,
    singles: Option<usize>,
    trades: &[[usize; 2]],
) -> Result<Value, &'static str> {
    let mut indices: Vec<_> = groups.iter().flatten().copied().collect();
    indices.sort_unstable();
    if !indices.into_iter().eq(0..81)
        || groups.iter().any(Vec::is_empty)
        || !(17..=40).contains(&clues)
    {
        return Err("Supply a partition of all 81 cells and a target of 17 to 40 clues.");
    }
    let mut board = solve(&generate(seed)).ok_or("No solution for the sampled grid.")?;
    let solution = board;
    let mut remaining = 81;
    let mut alternatives = Vec::new();
    for group in groups {
        for &cell in &group {
            board[cell] = 0;
        }
        if analyze(&board) != Analysis::Unique {
            for cell in group {
                board[cell] = solution[cell];
            }
            continue;
        }
        remaining -= group.len();
        if remaining <= 40 {
            let opening = opening_singles(&board);
            let distance = 2 * remaining.abs_diff(clues) + singles.map_or(0, |n| n.abs_diff(opening));
            alternatives.push((distance, board));
        }
    }
    alternatives.sort_by_key(|candidate| candidate.0);
    for (_, board) in &alternatives {
        if let Some(result) = accepted(board, &solution, level) {
            return Ok(result);
        }
    }
    // Trade a given pair for a blank pair on the same solution. Prefer moves
    // that bring the logical path closer to the selected grade.
    if !trades.is_empty() && let Some((_, start)) = alternatives.first() {
        let mut best = *start;
        let mut best_score = fitness(&best, level);
        for &[from, to] in trades {
            let pairs = |present| (0..40)
                .filter(|&i| (best[i] != 0) == present && (best[80-i] != 0) == present)
                .collect::<Vec<_>>();
            let (filled, empty) = (pairs(true), pairs(false));
            if filled.is_empty() || empty.is_empty() {
                break;
            }
            let (a, b) = (filled[from % filled.len()], empty[to % empty.len()]);
            let mut proposal = best;
            proposal[a] = 0;
            proposal[80-a] = 0;
            proposal[b] = solution[b];
            proposal[80-b] = solution[80-b];
            if analyze(&proposal) != Analysis::Unique {
                continue;
            }
            let score = fitness(&proposal, level);
            if score >= best_score {
                if let Some(result) = accepted(&proposal, &solution, level) {
                    return Ok(result);
                }
                best = proposal;
                best_score = score;
            }
        }
    }
    Ok(Value::Null)
}

fn fitness(board: &Board, level: Difficulty) -> (bool, usize, u32) {
    let rating = rate_puzzle(board, &level.technique_order()).expect("unique puzzle");
    let complex = rating.score.counts.iter().filter(|(t, _)| t.difficulty() >= Difficulty::Medium);
    (rating.status == SolveStatus::Solved(level), complex.clone().count(), complex.map(|(_, n)| n).sum())
}

fn accepted(board: &Board, solution: &Board, level: Difficulty) -> Option<Value> {
    if !accepts_difficulty(board, level) {
        return None;
    }
    let rating = rate_puzzle(board, &level.technique_order()).ok()?;
    Some(json!({
        "givens": grid(board), "solution": grid(solution), "rating": rating.status,
        "clues": board.iter().filter(|&&d| d != 0).count(), "opening": opening_singles(board),
        "hardest": rating.score.hardest,
    }))
}

fn run(request: Request) -> Result<Value, &'static str> {
    match request {
        Request::ClassicOrder { level } => Ok(json!(level.technique_order())),
        Request::Check { givens } => {
            let board = parse_givens(&givens).ok_or("Invalid givens.")?;
            Ok(json!(analyze(&board) == Analysis::Unique))
        }
        Request::Canonical { givens } => {
            let board = parse_givens(&givens).ok_or("Invalid givens.")?;
            Ok(json!(grid(&canonical_puzzle(&board))))
        }
        Request::Solution { seed } => Ok(json!(grid(&solve(&generate(seed)).ok_or("No solution.")?))),
        Request::Carve { seed, level, groups, clues, singles, trades } => {
            carve(seed, level, groups, clues, singles, &trades)
        }
    }
}

fn main() -> io::Result<()> {
    for line in io::stdin().lock().lines() {
        let outcome = serde_json::from_str(&line?)
            .map_err(|e| e.to_string())
            .and_then(|r| run(r).map_err(str::to_owned));
        println!("{}", outcome.unwrap_or_else(|error| json!({"error": error})));
    }
    Ok(())
}
