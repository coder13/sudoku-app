//! Batch rating and generation for classic Sudoku puzzles.

use std::{
    env,
    fs::File,
    io::{self, BufReader},
    process::ExitCode,
};

use sudoku_app_engine::{BatchCommand, run_batch};

const USAGE: &str = "Usage: sudoku-engine <batch-rate|batch-generate> [input-file|-]";

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args_os().skip(1);
    let command = match args
        .next()
        .as_deref()
        .and_then(|argument| argument.to_str())
    {
        Some("batch-rate") => BatchCommand::Rate,
        Some("batch-generate") => BatchCommand::Generate,
        Some("--help" | "-h") => {
            println!("{USAGE}");
            return Ok(());
        }
        _ => return Err(USAGE.into()),
    };
    let path = args.next();
    if args.next().is_some() {
        return Err(USAGE.into());
    }
    let output = io::BufWriter::new(io::stdout().lock());
    match path {
        Some(path) if path != "-" => run_batch(BufReader::new(File::open(path)?), output, command)?,
        _ => run_batch(io::stdin().lock(), output, command)?,
    }
    Ok(())
}
