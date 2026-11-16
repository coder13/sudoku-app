use std::{collections::BTreeSet, hint::black_box, time::Instant};

use sudoku_app_engine::{
    Analysis, GenerationCriteria, GenerationRating, SolveStatus, Technique, TechniqueTargetMode,
    analyze, builtin_templates, canonical_puzzle, generate_from_pool, hint_choices,
    opening_techniques, parse_givens, rate_puzzle, solve_logically,
};

// Fixed fixtures for easy, sparse, and expert paths. The sparse puzzles are from Gordon
// Royle's collection. AI Escargot was published by Arto Inkala in 2006.
const EASY: &str =
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SPARSE: &str =
    "345000000000200010000000000020100000000004500600000007800750000000060040000000300";
const EXPERT: &str =
    "100007090030020008009600500005300900010080002600004000300000010041000007007000300";

fn microseconds_per_call(iterations: u32, mut operation: impl FnMut()) -> f64 {
    let start = Instant::now();
    for _ in 0..iterations {
        operation();
    }
    start.elapsed().as_secs_f64() * 1_000_000.0 / f64::from(iterations)
}

fn main() {
    let order = Technique::DEFAULT_ORDER;
    let msls = Technique::MultiSectorLockedSets.practice_example().givens;
    for (name, givens) in [
        ("easy", EASY),
        ("17-clue", SPARSE),
        ("expert", EXPERT),
        ("multi-sector", msls),
    ] {
        let board = parse_givens(givens).unwrap();
        let analysis = analyze(&board);
        let rating = rate_puzzle(&board, order);
        assert!(matches!(analysis, Analysis::Unique | Analysis::SearchLimit));
        assert!(rating.is_ok());
        if name == "multi-sector" {
            let rating = rating.as_ref().unwrap();
            assert!(matches!(rating.status, SolveStatus::Solved(_)));
            assert!(
                rating
                    .score
                    .counts
                    .contains_key(&Technique::MultiSectorLockedSets)
            );
        }
        let count = if analysis == Analysis::SearchLimit {
            1
        } else {
            200
        };
        let exact = microseconds_per_call(count, || {
            black_box(analyze(black_box(&board)));
        });
        let rate = microseconds_per_call(500, || {
            black_box(rate_puzzle(black_box(&board), order)).unwrap();
        });
        let trace = microseconds_per_call(500, || {
            black_box(solve_logically(black_box(&board), order)).unwrap();
        });
        let hints = microseconds_per_call(100, || {
            black_box(hint_choices(black_box(&board), None)).unwrap();
        });
        let opening = microseconds_per_call(100, || {
            black_box(opening_techniques(black_box(&board))).unwrap();
        });
        let rating = rating.unwrap();
        println!(
            "{name}: {analysis:?}, {:?}, {} points; exact {exact:.1} µs, rating {rate:.1} µs, trace {trace:.1} µs, hints {hints:.1} µs, openings {opening:.1} µs",
            rating.status, rating.score.points
        );
    }

    let templates: Vec<_> = builtin_templates()
        .iter()
        .filter(|template| {
            template
                .givens()
                .iter()
                .filter(|&&digit| digit != 0)
                .count()
                == 17
        })
        .cloned()
        .collect();
    for clues in 17..=20 {
        for score_range in [0..=800, 801..=1000, 1001..=1600, 1601..=8000] {
            let start = Instant::now();
            let mut matches = 0;
            let mut raw = BTreeSet::new();
            let mut distinct = BTreeSet::new();
            for seed in 42..62 {
                let criteria = GenerationCriteria {
                    clues: clues..=clues,
                    rating: Some(GenerationRating::Score(score_range.clone())),
                    technique: None,
                    technique_order: order,
                };
                let Ok(puzzle) = generate_from_pool(
                    seed,
                    &criteria,
                    TechniqueTargetMode::Anywhere,
                    &templates,
                    208,
                ) else {
                    continue;
                };
                let rating = puzzle.rating;
                assert!(matches!(rating.status, SolveStatus::Solved(_)));
                assert!(score_range.contains(&rating.score.points));
                assert_eq!(
                    puzzle.board.iter().filter(|&&digit| digit > 0).count(),
                    clues
                );
                matches += 1;
                raw.insert(puzzle.board);
                distinct.insert(canonical_puzzle(&puzzle.board));
            }
            println!(
                "{clues} clues: {matches}/20 matches in {score_range:?} points, {} raw grids, {} distinct under symmetries, {:.1} ms",
                raw.len(),
                distinct.len(),
                start.elapsed().as_secs_f64() * 1000.0,
            );
        }
    }
}
