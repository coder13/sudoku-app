use std::{hint::black_box, time::Instant};

use serde::Deserialize;
use sudoku_app_engine::{
    Analysis, ClueDirection, GenerationStep, PuzzleRule, Technique, VariantClueLayout,
    VariantGenerationOptions, VariantPosition, VariantPuzzle, VariantTechnique, ranked_hints,
    rate_puzzle, start_variant_generation, variant_practice_examples,
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
    if std::env::args().any(|arg| arg == "--terrain-sandwich") {
        terrain_sandwich_benchmark();
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
                sample(|| rate_puzzle(&board, Technique::default_order()).unwrap()),
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

fn terrain_sandwich_benchmark() {
    let source: serde_json::Value =
        serde_json::from_str(include_str!("../../../tests/fixtures/coach-terrain.json")).unwrap();
    let payload = &source["payload"];
    assert_eq!(
        payload["colours"],
        serde_json::json!(["green", "purple", "yellow"])
    );
    let transforms: Vec<_> = payload["givenColours"]
        .as_str()
        .unwrap()
        .split(',')
        .map(|color| match color {
            "0" => serde_json::json!({ "multiplier": 1, "offset": 3 }),
            "1" => serde_json::json!({ "multiplier": 1, "offset": -3 }),
            "2" => serde_json::json!({ "multiplier": 2, "offset": 0 }),
            "" => serde_json::json!({ "multiplier": 1, "offset": 0 }),
            _ => panic!("unexpected D8HP cell color id: {color}"),
        })
        .collect();
    assert_eq!(transforms.len(), 81);
    let segments = payload["givenConstraints"][0]["segments"]
        .as_array()
        .unwrap();
    assert_eq!(segments.len(), 15);
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    puzzle.rules = segments
        .iter()
        .map(|segment| {
            let coordinates = &segment["cells"][0];
            let x = coordinates[0].as_f64().unwrap();
            let y = coordinates[1].as_f64().unwrap();
            let (direction, index) = if y == -0.5 {
                (ClueDirection::South, (x - 0.5) as usize)
            } else {
                (ClueDirection::East, (y - 0.5) as usize)
            };
            let cells: Vec<usize> = match direction {
                ClueDirection::East => (0..9).map(|column| index * 9 + column).collect(),
                ClueDirection::South => (0..9).map(|row| row * 9 + index).collect(),
                _ => unreachable!(),
            };
            let maximum: i16 = segment["parameters"]["text"]
                .as_str()
                .unwrap()
                .parse()
                .unwrap();
            let line_transforms: Vec<_> =
                cells.iter().map(|&cell| transforms[cell].clone()).collect();
            serde_json::from_value::<PuzzleRule>(serde_json::json!({
                "type": "terrain-sandwich",
                "cells": cells,
                "direction": direction,
                "maximum": maximum,
                "transforms": line_transforms,
            }))
            .unwrap()
        })
        .collect();
    assert_eq!(puzzle.rules.len(), 15);
    let solution: [u8; 81] = source["source"]["solution"]
        .as_str()
        .unwrap()
        .bytes()
        .map(|digit| digit - b'0')
        .collect::<Vec<_>>()
        .try_into()
        .unwrap();
    let compiled = puzzle.compile().unwrap();
    let empty_entries = [0_u8; 81];
    let empty_eliminations = [0_u16; 81];
    assert!(compiled.candidates(&solution, &empty_eliminations).is_ok());
    assert_eq!(
        compiled.analyze(&empty_entries, &empty_eliminations, 1_000_000),
        Ok(Analysis::Unique)
    );
    assert_eq!(
        compiled.solve(&empty_entries, &empty_eliminations, 1_000_000),
        Ok(solution)
    );
    let position = VariantPosition::new(puzzle.clone());
    let technique_order = VariantTechnique::DEFAULT_ORDER;
    println!(
        "D8HP Terrain Sandwich, {} {}, 5 warmups / {SAMPLES} samples; median/p95 ms.",
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    println!(
        "compile all 15 clues {}",
        sample(|| puzzle.compile().unwrap())
    );
    println!(
        "blank-board candidate propagation {}",
        sample(|| {
            compiled
                .candidates(&empty_entries, &empty_eliminations)
                .unwrap()
        })
    );
    println!(
        "exact analysis {}",
        sample(|| compiled.analyze(&empty_entries, &empty_eliminations, 1_000_000))
    );
    println!(
        "exact solve {}",
        sample(|| compiled.solve(&empty_entries, &empty_eliminations, 1_000_000))
    );
    println!(
        "default logical rating {}",
        sample(|| position.rate(technique_order).unwrap())
    );
    println!(
        "top 10 ranked hints {}",
        sample(|| {
            compiled
                .ranked_hints(&empty_entries, &empty_eliminations, technique_order, 10)
                .unwrap()
        })
    );

    let mut generation = VariantGenerationOptions::new(8_675_309, puzzle, 60..=60);
    generation.max_attempts = 3;
    generation.max_nodes = MAX_NODES;
    let generate = || {
        let mut search = start_variant_generation(generation.clone()).unwrap();
        loop {
            match search.advance().expect("generation emits a terminal event") {
                GenerationStep::Pending { .. } => {}
                GenerationStep::Matched { puzzle, .. } => break Some(puzzle),
                GenerationStep::Exhausted { .. } => break None,
                GenerationStep::Cancelled { .. } => unreachable!("benchmark never cancels"),
            }
        }
    };
    let generated = generate().expect("fixed seed should generate a unique Terrain puzzle");
    assert_eq!(generated.givens, 60);
    assert_eq!(
        generated
            .puzzle
            .givens
            .iter()
            .filter(|&&digit| digit != 0)
            .count(),
        60
    );
    assert_eq!(generated.puzzle.rules, position.puzzle.rules);
    println!(
        "generate unique 60-given puzzle {}",
        sample(|| generate().expect("fixed seed should generate a unique Terrain puzzle"))
    );
}
