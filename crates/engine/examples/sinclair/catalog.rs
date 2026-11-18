//! Offline construction for the downloadable edition. Use the normal generation
//! acceptance tests, then independently compare every recorded action to the answer.
use super::{grid, scope};
use serde_json::{Value, json};
use sudoku_app_engine::*;

fn event(id: &str, diagonal: bool, actions: &[HintAction], solution: &Board) -> Option<Value> {
    let mut placed = 0;
    for a in actions {
        let c = a.candidate();
        let is_place = matches!(a, HintAction::Place(_));
        if is_place != (solution[c.cell] == c.digit) { return None; }
        placed += usize::from(is_place);
    }
    Some(json!([id, diagonal, placed, actions.len() - placed, actions.first()?.candidate().cell]))
}

pub(super) fn candidate(q: &Value, order: &[VariantTechnique]) -> Option<Value> {
    let seed = q["seed"].as_u64()? as u32;
    let level: Option<Difficulty> = serde_json::from_value(q["tier"].clone()).ok();
    if q["family"] == "classic" {
        let level = level?;
        let board = if let Some(s) = q["grid"].as_str() {
            let b = parse_givens(s)?;
            if !accepts_difficulty(&b, level) { return None; }
            b
        } else {
            generate_targeted(seed, GenerationTarget::Difficulty { level,
                technique_order: &level.technique_order() }, 1).ok()?
        };
        let path = solve_logically(&board, Technique::DIFFICULTY_ORDER).ok()?;
        if path.status != SolveStatus::Solved(level) || analyze(&board) != Analysis::Unique { return None; }
        let solution = solve(&board)?;
        if solution != path.board { return None; }
        let events = path.steps.iter().map(|s| event(s.technique.id(), false, &s.actions, &solution))
            .collect::<Option<Vec<_>>>()?;
        return Some(json!({"puzzle":{"version":1,"givens":grid(&board)}, "solution":grid(&solution),
            "answerKey":grid(&canonical_puzzle(&solution)), "points":path.score.points,
            "hardest":path.score.hardest, "version":path.scoring_version, "events":events}));
    }
    let template = serde_json::from_value(q["template"].clone()).ok()?;
    let mut options = VariantGenerationOptions::new(seed, template,
        q["min"].as_u64().unwrap_or(0) as usize..=q["max"].as_u64()? as usize);
    options.max_attempts = 1;
    options.max_nodes = q["nodes"].as_u64().unwrap_or(20_000) as u32;
    options.technique_order = order.to_vec();
    options.half_turn_clues = q["paired"].as_bool().unwrap_or(true);
    // A fixed empty Killer layout can supply any supported grade. In that mode
    // the rating below decides the grade and the lower-technique test still applies.
    if level.is_none() && !(q["family"] == "killer-cages" && q["max"] == 0 && q["tier"] == "any") {
        return None;
    }
    options.rating = level.map(GenerationRating::Difficulty);
    options.required_rule = Some(if q["family"] == "windoku" { "extra-house" } else { q["family"].as_str()? }.into());
    if let Some(s) = q["mask"].as_str() {
        if s.len() != 81 { return None; }
        options.given_mask = Some(std::array::from_fn(|i| s.as_bytes()[i] != b'0'));
    }
    if !q["derived"].is_null() {
        options.derived_clues = serde_json::from_value(q["derived"].clone()).ok()?;
    }
    let mut search = start_variant_generation(options).ok()?;
    let generated = loop {
        if let GenerationStep::Matched { puzzle, .. } = search.advance()? { break puzzle; }
    };
    let position = VariantPosition::new(generated.puzzle);
    let path = position.solve_logically(order).ok()?;
    let SolveStatus::Solved(actual) = path.rating.status else { return None; };
    if level.is_some_and(|expected| expected != actual) || path.rating.points != generated.rating.points { return None; }
    if level.is_none() {
        if !q["wanted"].as_array()?.contains(&serde_json::to_value(actual).ok()?) { return None; }
        let lower: Vec<_> = VariantTechnique::all().filter(|t| t.difficulty() < actual).collect();
        if !lower.is_empty() && matches!(position.solve_logically(&lower).ok()?.rating.status, SolveStatus::Solved(_)) {
            return None;
        }
    }
    let solution = generated.solution;
    if (0..81).any(|i| position.puzzle.givens[i].max(path.end.entries[i]) != solution[i]) { return None; }
    let events = path.steps.iter().map(|s| event(s.technique.id(), scope(&s.evidence) == "diagonal", &s.actions, &solution))
        .collect::<Option<Vec<_>>>()?;
    Some(json!({"tier":actual,"puzzle":position.puzzle, "solution":grid(&solution), "answerKey":grid(&canonical_puzzle(&solution)),
        "points":path.rating.points, "hardest":path.rating.hardest, "version":path.rating.scoring_version, "events":events}))
}
