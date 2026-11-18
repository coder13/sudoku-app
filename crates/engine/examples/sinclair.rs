//! Offline JSON-lines constructor primitives and checked, digit-free solve traces.
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use sudoku_app_engine::*;
#[path = "sinclair/catalog.rs"]
mod catalog;

fn grid(board: &Board) -> String {
    board.iter().map(|&d| char::from(b'0' + d)).collect()
}

// Match variantTechniqueOrder in src/sudoku/variant-generation.ts. Preserve order on ties.
fn variant_order() -> Vec<VariantTechnique> {
    let omitted = [
        "forcing-net",
        "multi-sector-locked-sets",
        "sk-loop",
        "grouped-discontinuous-nice-loop",
        "grouped-continuous-nice-loop",
    ];
    let mut order = VariantTechnique::DEFAULT_ORDER.to_vec();
    for classic in Technique::DIFFICULTY_ORDER {
        let id = classic.id();
        if !omitted.contains(&id) && !order.iter().any(|t| t.id() == id) {
            order.push(VariantTechnique::from_id(id).unwrap());
        }
    }
    order.sort_by_key(|technique| technique.difficulty());
    order
}

// Spatial continuity is measured between the first affected cells of successive deductions.
fn event(
    id: &str,
    scope: &str,
    actions: &[HintAction],
    solution: &Board,
    previous: &mut Option<usize>,
) -> Value {
    let cell = actions[0].candidate().cell;
    let nearby = previous.is_some_and(|p| {
        p / 9 == cell / 9 || p % 9 == cell % 9 || (p / 27, p % 9 / 3) == (cell / 27, cell % 9 / 3)
    });
    *previous = Some(cell);
    let mut placements = 0;
    for action in actions {
        let c = action.candidate();
        let place = matches!(action, HintAction::Place(_));
        assert_eq!(solution[c.cell] == c.digit, place, "unsound {id} action");
        placements += usize::from(place);
    }
    json!([id, scope, placements, actions.len() - placements, nearby])
}

fn scope(evidence: &VariantEvidence) -> &'static str {
    match evidence {
        VariantEvidence::Single {
            house: Some(VariantHouseKind::Diagonal(_)),
            ..
        } => "diagonal",
        VariantEvidence::Intersection {
            source: VariantHouseKind::Diagonal(_),
            ..
        }
        | VariantEvidence::Intersection {
            target: VariantHouseKind::Diagonal(_),
            ..
        } => "diagonal",
        VariantEvidence::CageSum { house: Some(_), .. } => "house-sum",
        VariantEvidence::CageSum { .. } => "cage",
        _ => "",
    }
}

fn trace(puzzle: VariantPuzzle, order: &[VariantTechnique], budget: u32) -> Value {
    let mut previous = None;
    if puzzle.rules.is_empty() {
        let board = &puzzle.givens;
        if analyze(board) != Analysis::Unique {
            return json!({"status":"nonunique-or-limit"});
        }
        let solution = solve(board).unwrap();
        let path = solve_logically(board, Technique::DIFFICULTY_ORDER).unwrap();
        let SolveStatus::Solved(tier) = path.status else {
            return json!({"status":"stalled"});
        };
        assert_eq!(solution, path.board);
        let events: Vec<_> = path
            .steps
            .iter()
            .map(|s| event(s.technique.id(), "", &s.actions, &solution, &mut previous))
            .collect();
        return json!({"status":"solved", "difficulty":tier, "points":path.score.points,
            "hardestTechnique":path.score.hardest, "scoringVersion":path.scoring_version,
            "solution":grid(&solution), "canonical":grid(&canonical_puzzle(board)), "events":events});
    }
    let compiled = puzzle.compile().expect("invalid rule definition");
    let analysis = compiled.analyze(&[0; 81], &[0; 81], budget).unwrap();
    if analysis != Analysis::Unique {
        return json!({"status":format!("{analysis:?}")});
    }
    let solution = compiled.solve(&[0; 81], &[0; 81], budget).unwrap();
    let position = VariantPosition::new(puzzle);
    let path = position.solve_logically(order).unwrap();
    let SolveStatus::Solved(tier) = path.rating.status else {
        return json!({"status":"stalled"});
    };
    for (cell, given) in position.puzzle.givens.iter().enumerate() {
        assert_eq!((*given).max(path.end.entries[cell]), solution[cell]);
    }
    let events: Vec<_> = path
        .steps
        .iter()
        .map(|s| {
            event(
                s.technique.id(),
                scope(&s.evidence),
                &s.actions,
                &solution,
                &mut previous,
            )
        })
        .collect();
    json!({"status":"solved", "difficulty":tier, "points":path.rating.points,
        "hardestTechnique":path.rating.hardest, "scoringVersion":path.rating.scoring_version,
        "solution":grid(&solution), "canonical":canonical_variant(&position.puzzle).unwrap(), "events":events})
}

fn run(q: Value, order: &[VariantTechnique]) -> Value {
    let seed = q["seed"].as_u64().unwrap_or(0) as u32;
    match q["op"].as_str().unwrap() {
        "catalog-orders" => json!({
            "classic": Technique::DIFFICULTY_ORDER.iter().map(|t| t.id()).collect::<Vec<_>>(),
            "variant": order.iter().map(|t| t.id()).collect::<Vec<_>>(),
        }),
        "catalog" => catalog::candidate(&q, order).unwrap_or(Value::Null),
        "trace" => trace(
            serde_json::from_value(q["puzzle"].clone()).unwrap(),
            order,
            q["budget"]
                .as_u64()
                .unwrap_or(DEFAULT_VARIANT_SEARCH_NODES.into()) as u32,
        ),
        "key" => json!(grid(&canonical_puzzle(
            &parse_givens(q["givens"].as_str().unwrap()).unwrap()
        ))),
        "classic-unique" => json!(
            analyze(&parse_givens(q["givens"].as_str().unwrap()).unwrap()) == Analysis::Unique
        ),
        "solution" => {
            if q["family"] == "x" {
                let compiled = VariantPuzzle::x_sudoku([0; 81]).compile().unwrap();
                json!(
                    compiled
                        .solve_seeded(&[0; 81], &[0; 81], 100_000, seed)
                        .ok()
                        .map(|s| grid(&s))
                )
            } else {
                json!(grid(&solve(&generate(seed)).unwrap()))
            }
        }
        "solve" => {
            json!(solve(&parse_givens(q["givens"].as_str().unwrap()).unwrap()).map(|s| grid(&s)))
        }
        "carve-x" => {
            let mut board = parse_givens(q["solution"].as_str().unwrap()).unwrap();
            // With an empty template, givens supplied as entries can change between checks.
            let compiled = VariantPuzzle::x_sudoku([0; 81]).compile().unwrap();
            let limit = q["limit"].as_u64().unwrap() as usize;
            let mut clues = 81;
            for cell in q["order"].as_array().unwrap() {
                if clues <= limit {
                    break;
                }
                let i = cell.as_u64().unwrap() as usize;
                let digit = board[i];
                board[i] = 0;
                if compiled.analyze(&board, &[0; 81], 15_000).unwrap() == Analysis::Unique {
                    clues -= 1;
                } else {
                    board[i] = digit;
                }
            }
            json!(grid(&board))
        }
        "classic" => {
            let level: Difficulty = serde_json::from_value(q["tier"].clone()).unwrap();
            let profile = level.technique_order();
            let target = GenerationTarget::Difficulty {
                level,
                technique_order: &profile,
            };
            json!(
                generate_targeted(seed, target, q["attempts"].as_u64().unwrap_or(12) as u32)
                    .ok()
                    .map(|b| grid(&b))
            )
        }
        "graded-killer" => {
            let level: Difficulty = serde_json::from_value(q["tier"].clone()).unwrap();
            let sizes = serde_json::from_value(q["sizes"].clone()).unwrap();
            let mut options =
                VariantGenerationOptions::new(seed, VariantPuzzle::classic([0; 81]), 0..=24);
            options.derived_clues = vec![VariantClueLayout::KillerCageSizes {
                sizes,
                cover_grid: true,
            }];
            options.max_attempts = 1;
            options.max_nodes = 15_000;
            options.rating = Some(GenerationRating::Difficulty(level));
            options.technique_order = order.to_vec();
            options.required_rule = Some("killer-cages".to_string());
            let mut search = start_variant_generation(options).unwrap();
            while let Some(step) = search.advance() {
                if let GenerationStep::Matched { puzzle, .. } = step {
                    return json!({"puzzle":puzzle.puzzle,"solution":grid(&puzzle.solution)});
                }
            }
            Value::Null
        }
        _ => panic!("unknown request"),
    }
}

fn main() {
    let order = variant_order();
    let mut out = io::BufWriter::new(io::stdout().lock());
    for line in io::stdin().lock().lines() {
        let result = run(serde_json::from_str(&line.unwrap()).unwrap(), &order);
        serde_json::to_writer(&mut out, &result).unwrap();
        writeln!(out).unwrap();
        out.flush().unwrap();
    }
}
