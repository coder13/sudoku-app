//! Reproduce the normal classic generator and retain complete audit traces.
//! cargo run --release -p sudoku-app-engine --features wasm-api --example quality_audit -- <tier-index> <start> <count>
use std::{borrow::Cow, io::{self, Write}, time::Instant};
use serde_json::{Value, json};
use sudoku_app_engine::*;

fn grid(board: &Board) -> String {
    board.iter().map(|digit| char::from(b'0' + digit)).collect()
}

fn seed_for(tier: usize, index: u32) -> u32 {
    let mut x = 0x5990_2026_u32.wrapping_add((tier as u32).wrapping_mul(1_000_003)).wrapping_add(index);
    x = (x ^ (x >> 16)).wrapping_mul(0x7feb_352d);
    x = (x ^ (x >> 15)).wrapping_mul(0x846c_a68b);
    x ^ (x >> 16)
}

fn finish<T>(mut search: GenerationSearch<'_, T>) -> (Option<T>, u32) {
    while let Some(step) = search.advance() {
        match step {
            GenerationStep::Matched { attempts, puzzle } => return (Some(puzzle), attempts),
            GenerationStep::Exhausted { attempts } | GenerationStep::Cancelled { attempts } => return (None, attempts),
            GenerationStep::Pending { .. } => {},
        }
    }
    (None, 0)
}

fn generate(level: Difficulty, seed: u32) -> (Option<Board>, Vec<Value>) {
    let order = level.technique_order();
    let mut routes = Vec::new();
    let focus: &[Technique] = match level {
        Difficulty::Tricky => &[Technique::XWing, Technique::Swordfish, Technique::Skyscraper, Technique::TwoStringKite, Technique::EmptyRectangle],
        Difficulty::VeryHard => &[Technique::FinnedSwordfish, Technique::SimpleColoring, Technique::Medusa, Technique::XChain, Technique::XYChain, Technique::WxyzWing],
        _ => &[],
    };
    if !focus.is_empty() {
        let start = Instant::now();
        let technique = focus[(seed >> 8) as usize % focus.len()];
        let criteria = GenerationCriteria { clues: 24..=36, rating: Some(GenerationRating::Difficulty(level)), technique: Some(technique), technique_order: &order };
        let (board, attempts) = finish(start_matching(seed, &criteria, TechniqueTargetMode::Anywhere, Cow::Borrowed(&[]), 32).unwrap());
        routes.push(json!({"route":"focused","focus":technique,"attempts":attempts,"matched":board.is_some(),"ms":start.elapsed().as_secs_f64()*1000.0}));
        if board.is_some() { return (board, routes); }
    }
    if level == Difficulty::Impossible {
        let bank = impossible_templates();
        let count_clues = |board: &Board| board.iter().filter(|&&digit| digit != 0).count();
        let clues = count_clues(&bank[seed as usize % bank.len()]);
        let templates = bank.iter().copied().filter(|board| count_clues(board) == clues).collect();
        let start = Instant::now();
        let criteria = GenerationCriteria { clues: clues..=clues, rating: Some(GenerationRating::Difficulty(level)), technique: None, technique_order: &order };
        let (board, attempts) = finish(start_matching(seed, &criteria, TechniqueTargetMode::Anywhere, Cow::Owned(templates), 128).unwrap());
        routes.push(json!({"route":"impossible-bank","attempts":attempts,"matched":board.is_some(),"ms":start.elapsed().as_secs_f64()*1000.0}));
        if board.is_some() { return (board, routes); }
    }
    let start = Instant::now();
    let limit = if level == Difficulty::Impossible { 32 } else { 512 };
    let (board, attempts) = finish(start_targeted(seed, GenerationTarget::Difficulty { level, technique_order: &order }, limit).unwrap());
    routes.push(json!({"route":"fresh","attempts":attempts,"matched":board.is_some(),"ms":start.elapsed().as_secs_f64()*1000.0}));
    if board.is_some() { return (board, routes); }
    let start = Instant::now();
    let criteria = GenerationCriteria { clues: 17..=40, rating: Some(GenerationRating::Difficulty(level)), technique: None, technique_order: &order };
    let (puzzle, attempts) = finish(start_from_pool(seed, &criteria, TechniqueTargetMode::Anywhere, builtin_templates(), 256).unwrap());
    routes.push(json!({"route":"pool","attempts":attempts,"matched":puzzle.is_some(),"ms":start.elapsed().as_secs_f64()*1000.0}));
    (puzzle.map(|puzzle| puzzle.board), routes)
}

fn audit(tier: usize, index: u32) -> Value {
    let level = Difficulty::ALL[tier];
    let seed = seed_for(tier, index);
    let start = Instant::now();
    let (board, routes) = generate(level, seed);
    let generation_ms = start.elapsed().as_secs_f64() * 1000.0;
    let Some(board) = board else { return json!({"tier":level,"index":index,"seed":seed,"status":"generation-failed","routes":routes,"generationMs":generation_ms}); };
    let solve_start = Instant::now();
    let order = level.technique_order();
    let trace = solve_logically(&board, &order).unwrap();
    let lower = if tier == 0 { None } else { Some(solve_logically(&board, &Difficulty::ALL[tier - 1].technique_order()).unwrap()) };
    let mut positions = Vec::new();
    for position in trace.positions() {
        let values = position.values().unwrap();
        let masks = candidates(&values).unwrap();
        let remaining_candidates: u32 = masks.iter().zip(position.eliminations).map(|(mask, eliminated)| (mask & !eliminated).count_ones()).sum();
        positions.push(json!({"empty":values.iter().filter(|&&v|v==0).count(),"candidates":remaining_candidates}));
    }
    let solution = solve(&board).unwrap();
    let unsound_actions: Vec<_> = trace.steps.iter().enumerate().flat_map(|(index, step)| step.actions.iter().filter_map(move |action| {
        let valid = match action { HintAction::Place(candidate) => solution[candidate.cell] == candidate.digit, HintAction::Eliminate(candidate) => solution[candidate.cell] != candidate.digit };
        (!valid).then_some(json!({"index":index,"action":action}))
    })).collect();
    let solve_ms = solve_start.elapsed().as_secs_f64()*1000.0;
    json!({
        "tier":level,"index":index,"seed":seed,"status":"generated","puzzle":grid(&board),"solution":grid(&solution),
        "canonical":grid(&canonical_puzzle(&board)),"givens":board.iter().filter(|&&v|v!=0).count(),
        "generationMs":generation_ms,"analysisMs":solve_ms,"routes":routes,
        "rating":trace.rating(),"lower":lower.as_ref().map(|trace|json!({"rating":trace.rating(),"remaining":trace.board.iter().filter(|&&v|v==0).count()})),
        "availability":trace.move_availability(),"steps":trace.steps,"positions":positions,"unsoundActions":unsound_actions,
    })
}

fn main() {
    let args: Vec<_> = std::env::args().collect();
    assert_eq!(args.len(), 4, "Usage: quality_audit <tier-index 0..9> <start-index> <count>");
    let tier: usize = args[1].parse().unwrap();
    let first: u32 = args[2].parse().unwrap();
    let count: u32 = args[3].parse().unwrap();
    assert!(tier < Difficulty::ALL.len());
    let mut output = io::BufWriter::new(io::stdout().lock());
    for index in first..first + count {
        eprintln!("start tier={tier} index={index} seed={}",seed_for(tier,index));
        serde_json::to_writer(&mut output, &audit(tier,index)).unwrap();
        writeln!(output).unwrap();
        output.flush().unwrap();
        eprintln!("done tier={tier} index={index}");
    }
}
