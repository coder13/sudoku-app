//! Rate and certify externally sourced candidate grids before bundling them.
use serde_json::json;
use std::{
    io::{self, BufRead, Write},
    time::Instant,
};
use sudoku_app_engine::*;

fn main() {
    let mut output = io::BufWriter::new(io::stdout().lock());
    for line in io::stdin().lock().lines() {
        let source = line.unwrap();
        let start = Instant::now();
        let board = parse_givens(&source).expect("81 grid digits");
        let canonical = canonical_puzzle(&board);
        let level = Difficulty::Impossible;
        let accepted =
            analyze(&canonical) == Analysis::Unique && accepts_difficulty(&canonical, level);
        let grid: String = canonical.iter().map(|n| char::from(b'0' + n)).collect();
        serde_json::to_writer(&mut output, &json!({
            "source":source,"canonical":grid,"accepted":accepted,"elapsedMs":start.elapsed().as_secs_f64()*1000.0,
        })).unwrap();
        writeln!(output).unwrap();
        output.flush().unwrap();
    }
}
