//! Try two alternative lower-tier technique orders against audit puzzles.
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use sudoku_app_engine::*;

fn main() {
    let mut output = io::BufWriter::new(io::stdout().lock());
    for line in io::stdin().lock().lines() {
        let row: Value = serde_json::from_str(&line.unwrap()).unwrap();
        let level: Difficulty = serde_json::from_value(row["tier"].clone()).unwrap();
        let board = parse_givens(row["puzzle"].as_str().unwrap()).unwrap();
        let mut results = Vec::new();
        for mode in ["reverse-within-tier", "rotate-within-tier"] {
            let mut order = Vec::new();
            for lower in Difficulty::ALL.into_iter().filter(|tier| *tier < level) {
                let mut group: Vec<_> = Technique::DIFFICULTY_ORDER
                    .iter()
                    .copied()
                    .filter(|t| t.difficulty() == lower)
                    .collect();
                if mode == "reverse-within-tier" {
                    group.reverse();
                } else if group.len() > 1 {
                    let shift = group.len() / 2;
                    group.rotate_left(shift);
                }
                order.extend(group);
            }
            if order.is_empty() {
                continue;
            }
            let trace = solve_logically(&board, &order).unwrap();
            let mut result = json!({"mode":mode,"rating":trace.rating(),"remaining":trace.board.iter().filter(|&&v|v==0).count()});
            if matches!(trace.status, SolveStatus::Solved(_)) {
                result["steps"] = json!(trace.steps);
            }
            results.push(result);
        }
        serde_json::to_writer(&mut output,&json!({"tier":row["tier"],"index":row["index"],"puzzle":row["puzzle"],"results":results})).unwrap();
        writeln!(output).unwrap();
        output.flush().unwrap();
    }
}
