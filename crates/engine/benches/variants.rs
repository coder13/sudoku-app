use std::{hint::black_box, time::Instant};

use serde::Deserialize;
use sudoku_app_engine::{
    Analysis, GenerationStep, Technique, VariantClueLayout, VariantGenerationOptions,
    VariantPosition, VariantPuzzle, VariantTechnique, ranked_hints, rate_puzzle,
    start_variant_generation, variant_practice_examples,
};

const SAMPLES: usize = 40;
const SEEDS: u32 = 20;
const MAX_ATTEMPTS: u32 = 6;
const MAX_NODES: u32 = 20_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    name: String,
    position: VariantPuzzle,
    template: VariantPuzzle,
    derived_clues: Vec<VariantClueLayout>,
    givens: usize,
}

fn summary(mut measurements: Vec<f64>) -> String {
    measurements.sort_by(f64::total_cmp);
    let percentile =
        |fraction: f64| measurements[(fraction * measurements.len() as f64).ceil() as usize - 1];
    format!("{:.3}/{:.3}", percentile(0.5), percentile(0.95))
}

fn sample<T>(mut run: impl FnMut() -> T) -> String {
    for _ in 0..5 {
        black_box(run());
    }
    summary(
        (0..SAMPLES)
            .map(|_| {
                let start = Instant::now();
                black_box(run());
                start.elapsed().as_secs_f64() * 1_000.0
            })
            .collect(),
    )
}

fn overlay_benchmark() {
    let overlay = [
        Technique::PatternOverlay,
        Technique::PairwisePatternOverlay,
        Technique::TriplePatternOverlay,
        Technique::QuadruplePatternOverlay,
        Technique::QuintuplePatternOverlay,
    ]
    .map(VariantTechnique::Classic);
    let exercise = variant_practice_examples(overlay[0]).unwrap().remove(0);
    let givens = VariantPosition::new(exercise.position.puzzle.clone());
    let default = VariantTechnique::DEFAULT_ORDER;
    let mut extended = default.to_vec();
    extended.extend(overlay);
    println!("Jigsaw Pattern Overlay. Rating ms, median/p95.");
    for (name, position) in [("givens", givens), ("worked position", exercise.position)] {
        for (profile, order) in [("default", default), ("overlay", extended.as_slice())] {
            let trace = position.solve_logically(order).unwrap();
            let timing = sample(|| position.rate(order).unwrap());
            println!(
                "{name} {profile}: {:?}, {} steps, {timing}",
                trace.rating.status,
                trace.steps.len()
            );
        }
    }
}

fn main() {
    if std::env::args().any(|arg| arg == "--exact-search") {
        exact_search_benchmark();
        return;
    }
    if std::env::args().any(|arg| arg == "--pattern-overlay") {
        overlay_benchmark();
        return;
    }
    let fixtures: Vec<Fixture> =
        serde_json::from_str(include_str!("fixtures/variants.json")).unwrap();
    println!(
        "Native {} {}. Latency in ms, median/p95.",
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    println!(
        "{:<16} {:>16} {:>16} {:>16} {:>11}",
        "Case", "Rate", "Top 10 hints", "Generate", "Matches"
    );
    for fixture in fixtures {
        let position = VariantPosition::new(fixture.position);
        let compile = || position.puzzle.compile().unwrap();
        assert_eq!(
            compile().analyze(&position.entries, &position.eliminations, MAX_NODES),
            Ok(Analysis::Unique)
        );
        let (rating, hints) = if fixture.name == "classic" {
            let board = position.puzzle.givens;
            (
                sample(|| rate_puzzle(&board, Technique::DEFAULT_ORDER).unwrap()),
                sample(|| ranked_hints(&board, None, 10, &[]).unwrap()),
            )
        } else {
            (
                sample(|| position.rate(VariantTechnique::DEFAULT_ORDER).unwrap()),
                sample(|| {
                    compile()
                        .ranked_hints(
                            &position.entries,
                            &position.eliminations,
                            VariantTechnique::DEFAULT_ORDER,
                            10,
                        )
                        .unwrap()
                }),
            )
        };
        let mut times = Vec::with_capacity(SEEDS as usize);
        let mut matches = 0;
        for seed in 1..=SEEDS {
            let mut request = VariantGenerationOptions::new(
                seed,
                fixture.template.clone(),
                fixture.givens..=fixture.givens,
            );
            request.max_attempts = MAX_ATTEMPTS;
            request.max_nodes = MAX_NODES;
            request.derived_clues.clone_from(&fixture.derived_clues);
            let start = Instant::now();
            let mut search = start_variant_generation(request).unwrap();
            let result = loop {
                match search.advance().expect("generation emits a terminal event") {
                    GenerationStep::Pending { .. } => {}
                    GenerationStep::Matched { puzzle, .. } => break Some(puzzle),
                    GenerationStep::Exhausted { .. } => break None,
                    GenerationStep::Cancelled { .. } => {
                        unreachable!("this benchmark never cancels")
                    }
                }
            };
            times.push(start.elapsed().as_secs_f64() * 1_000.0);
            if let Some(puzzle) = result {
                assert_eq!(puzzle.givens, fixture.givens);
                matches += 1;
                black_box(puzzle);
            }
        }
        println!(
            "{:<16} {:>16} {:>16} {:>16} {:>8}/{SEEDS}",
            fixture.name,
            rating,
            hints,
            summary(times),
            matches
        );
    }
}

fn exact_search_benchmark() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/inequality-palindrome14.json"
    ))
    .unwrap();
    let puzzle: VariantPuzzle = serde_json::from_value(fixture["puzzle"].clone()).unwrap();
    let expected = sudoku_app_engine::parse_givens(fixture["solution"].as_str().unwrap()).unwrap();
    let compiled = puzzle.compile().unwrap();
    let empty = [0; 81];
    let removed = [0; 81];
    let budget = 1_000_000;
    assert_eq!(
        compiled.analyze(&empty, &removed, budget),
        Ok(Analysis::Unique)
    );
    assert_eq!(compiled.solve(&empty, &removed, budget), Ok(expected));
    println!(
        "Native FzzD, {} {}, 5 warmups / {SAMPLES} samples; median/p95 ms.",
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    println!("compile {}", sample(|| puzzle.compile().unwrap()));
    println!(
        "prepared candidates {}",
        sample(|| compiled.candidates(&empty, &removed).unwrap())
    );
    println!(
        "exact analysis {}",
        sample(|| compiled.analyze(&empty, &removed, budget).unwrap())
    );
    println!(
        "exact solve {}",
        sample(|| compiled.solve(&empty, &removed, budget).unwrap())
    );
}
