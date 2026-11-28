use super::*;

// Keep global rules, complete markings and complete cage partitions intact.
// A line or outside clue is an independent, removable unit.
fn removable(rule: &PuzzleRule) -> bool {
    matches!(
        rule.id(),
        "arrow"
            | "between"
            | "thermometer"
            | "inequality"
            | "adjacent-total"
            | "renban"
            | "whispers"
            | "modular"
            | "entropic"
            | "palindrome"
            | "region-sum"
            | "quadruple"
            | "little-killer"
            | "sandwich"
            | "x-sum"
            | "skyscrapers"
    )
}

pub(super) fn thin(
    mut puzzle: VariantPuzzle,
    solution: Board,
    excluded: &HashSet<VariantPuzzle>,
    options: &VariantGenerationOptions,
    random: &mut Random,
) -> Option<GeneratedVariant> {
    // Check the derived clues against the sampled completion before relaxing anything.
    puzzle.givens = solution;
    if puzzle.compile().ok()?.analyze(&[0; CELLS], &[0; CELLS], 1) != Ok(Analysis::Unique) {
        return None;
    }
    puzzle.givens = [0; CELLS];
    let mut candidates: Vec<_> = puzzle
        .rules
        .iter()
        .filter(|rule| removable(rule))
        .cloned()
        .collect();
    random.shuffle(&mut candidates);
    let mut current = puzzle.clone();
    for dropped in std::iter::once(None).chain(candidates.iter().map(Some)) {
        if let Some(clue) = dropped {
            puzzle = current.clone();
            let i = puzzle.rules.iter().position(|r| r == clue)?;
            puzzle.rules.remove(i);
        }
        let compiled = puzzle.compile().ok()?;
        if compiled.analyze(&[0; CELLS], &[0; CELLS], options.max_nodes) != Ok(Analysis::Unique) {
            // Removing more constraints cannot repair a nonunique starting layout.
            if dropped.is_none() {
                break;
            }
            continue;
        }
        let Some(mut without) = reduced_profiles(options, &puzzle) else {
            continue;
        };
        current = puzzle.clone();
        let variant_clues = puzzle.variant_clue_count();
        if options
            .variant_clues
            .as_ref()
            .is_some_and(|range| !range.contains(&variant_clues))
            || !excluded.is_empty() && excluded.contains(&symmetry::generation_key(&puzzle))
        {
            continue;
        }
        if let Some((rating, rule_dependencies)) =
            accept(&compiled, &puzzle, &solution, &mut without, options)
        {
            return Some(GeneratedVariant {
                seed: options.seed,
                puzzle,
                solution,
                givens: 0,
                variant_clues,
                rating,
                rule_dependencies,
            });
        }
    }
    None
}
