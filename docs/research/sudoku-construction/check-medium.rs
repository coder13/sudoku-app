use std::io::{self, BufRead};
use sudoku_app_engine::{
    Analysis, Difficulty, accepts_difficulty, analyze, canonical_puzzle, parse_givens,
};

fn main() {
    for line in io::stdin().lock().lines().map_while(Result::ok) {
        let board = parse_givens(&line).expect("expected 81 cells");
        if analyze(&board) == Analysis::Unique && accepts_difficulty(&board, Difficulty::Medium) {
            let key: String = canonical_puzzle(&board)
                .iter()
                .map(|&d| char::from(b'0' + d))
                .collect();
            println!("{key}");
        } else {
            println!("-");
        }
    }
}
