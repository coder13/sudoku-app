use std::{collections::HashSet, ops::RangeInclusive};

use super::{
    CompiledVariant, DEFAULT_VARIANT_SEARCH_NODES, MarkedPairs, PuzzleRule, RegionLayout,
    VariantDefinitionError, VariantPosition, VariantPuzzle, VariantRating, VariantTechnique,
    symmetry,
};
use crate::{
    Analysis, Board, CELLS, GenerationRating, GenerationSearch, Random, SolveStatus,
    TechniqueTargetMode,
};

mod dependencies;
mod layouts;
mod miracle;
use dependencies::{has_family, without_family};
pub use layouts::{MarkerFamily, OutsideClueKind, VariantClueLayout};

/// A bounded search for a unique puzzle with a selected rule set and optional logical targets.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VariantGenerationOptions {
    /// Seed that controls solution sampling, clue layout, and given removal.
    pub seed: u32,
    /// Maximum number of attempts. An attempt samples a solved grid and tries removing givens.
    pub max_attempts: u32,
    /// Maximum nodes in each exact solve or uniqueness check.
    pub max_nodes: u32,
    /// Fixed rules and any givens used to constrain the initial solved grid.
    pub template: VariantPuzzle,
    /// Clues to construct from the sampled solution.
    pub derived_clues: Vec<VariantClueLayout>,
    /// Inclusive range of given counts in the resulting puzzle.
    pub givens: RangeInclusive<usize>,
    /// Inclusive range of constraint clue counts, independent of the number of givens.
    pub variant_clues: Option<RangeInclusive<usize>>,
    /// Require a complete logical path within this score range or at this difficulty.
    pub rating: Option<GenerationRating>,
    /// Require this technique in the trace or as an exclusive opening.
    pub technique: Option<(VariantTechnique, TechniqueTargetMode)>,
    /// Enabled techniques in solve order.
    pub technique_order: Vec<VariantTechnique>,
    /// Rule ID whose removal must leave multiple solutions. Use `jigsaw` to remove region uniqueness.
    pub required_rule: Option<String>,
    /// Independently remove each selected rule. Also check the givens under classic rules.
    pub required_rules: Vec<String>,
    /// Allow the zero-given constructor to remove drawn clues while keeping all required rules.
    pub thin_clues: bool,
    /// Previously emitted puzzles to exclude, including equivalent rotations and reflections.
    /// Whispers path direction, segmentation and duplicate edges do not change identity.
    /// Palindrome and Clone matching-digit components are compared transitively;
    /// free odd centers and alternative drawings do not add constraints.
    /// Entropic and Modular walks use their original sliding-window different-group pairs,
    /// independently of path direction, decomposition or unrestricted singletons.
    /// Global Entropy/Entropic ranges and Modular remainder classes allow group-preserving
    /// digit renamings when every companion preserves the same partition. Mixed partitions
    /// and other numeric rules conservatively retain their digits. Exact duplicate rules
    /// do not distinguish played puzzles. Public definitions remain unchanged.
    /// Optional drawing paths do not distinguish otherwise identical logical puzzles.
    /// Renban compares complete sets and digit mappings that preserve their allowed intervals.
    /// Inequalities and Thermometers compare the same implied strict order, including
    /// redundant comparisons. With only digit-invariant companions, complementing all
    /// digits and reversing every comparison preserves the played-puzzle identity.
    pub exclude: Vec<VariantPuzzle>,
}

impl VariantGenerationOptions {
    /// Set up generation from an authored rule set and a target range of givens.
    pub fn new(seed: u32, template: VariantPuzzle, givens: RangeInclusive<usize>) -> Self {
        Self {
            seed,
            max_attempts: 100,
            max_nodes: DEFAULT_VARIANT_SEARCH_NODES,
            template,
            derived_clues: Vec::new(),
            givens,
            variant_clues: None,
            rating: None,
            technique: None,
            technique_order: VariantTechnique::DEFAULT_ORDER.to_vec(),
            required_rule: None,
            required_rules: Vec::new(),
            thin_clues: false,
            exclude: Vec::new(),
        }
    }
}

/// A generated puzzle with its exact completion, resolved rule set, and logical rating.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct GeneratedVariant {
    /// Seed from the generation request.
    pub seed: u32,
    /// Unique puzzle and final rules.
    pub puzzle: VariantPuzzle,
    /// Complete grid that satisfies the final rules.
    #[cfg_attr(feature = "wasm-api", serde(with = "super::wire::grid"))]
    pub solution: Board,
    /// Number of given digits, separate from rule clues.
    pub givens: usize,
    /// Number of rule clues.
    pub variant_clues: usize,
    /// Versioned rating under the requested profile. Can be partial without a rating target.
    pub rating: VariantRating,
    /// First action in this solve that contradicts a completion allowed by omitting each required rule.
    #[cfg_attr(feature = "wasm-api", serde(skip_serializing_if = "Vec::is_empty"))]
    pub rule_dependencies: Vec<RuleDependency>,
}

/// A replayable counterexample for the use of one selected rule.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct RuleDependency {
    /// Selected family, preset or marker layer that was omitted.
    pub rule: String,
    /// One-based step in the rated solution path.
    pub step: usize,
    /// Technique used at this point in the trace.
    pub technique: VariantTechnique,
    /// The move that first distinguishes the two completions.
    pub action: crate::HintAction,
    /// Completion obeying the givens and all remaining rules.
    #[cfg_attr(feature = "wasm-api", serde(with = "super::wire::grid"))]
    pub alternative: Board,
}

/// Invalid criteria or geometry in a variant generation request.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VariantGenerationError {
    /// Invalid authored puzzle definition.
    Definition(VariantDefinitionError),
    /// The givens used for solution sampling conflict with the fixed rules.
    ConflictingTemplate,
    /// The range is empty or contains given counts outside 0–81.
    InvalidGivenCount,
    /// The variant clue range is empty.
    InvalidClueCount,
    /// One derived clue layout has invalid geometry, counts, or marker settings.
    InvalidLayout(usize),
    /// The requested rule dependency is absent from the rule set.
    MissingRequiredRule,
    /// The rating range is empty or incompatible with the requested technique.
    InvalidRating,
    /// The requested technique cannot be used for this target.
    InvalidTechnique,
    /// A puzzle in the exclusion list has an invalid definition.
    InvalidExclusion(usize),
}

impl VariantPuzzle {
    /// Count placed clues from the rule list. Global rules contribute no clues.
    pub fn variant_clue_count(&self) -> usize {
        let marks = |a: &MarkedPairs, b: &MarkedPairs| a.pairs.len() + b.pairs.len();
        self.rules
            .iter()
            .map(|rule| match rule {
                PuzzleRule::KillerCages { cages, .. } => cages.len(),
                PuzzleRule::Parity { cells, .. } => cells.len(),
                PuzzleRule::DigitRestriction { cells, .. } => cells.len(),
                PuzzleRule::Clone { groups } => groups.len(),
                PuzzleRule::Kropki {
                    consecutive,
                    ratio_two,
                } => marks(consecutive, ratio_two),
                PuzzleRule::Xv { five, ten } => marks(five, ten),
                PuzzleRule::AntiKing {}
                | PuzzleRule::AntiKnight {}
                | PuzzleRule::GlobalEntropy { .. }
                | PuzzleRule::NonConsecutive { .. } => 0,
                _ => 1,
            })
            .sum()
    }
}

/// Validate a request and start a seeded search that can be cancelled between attempts.
///
/// Each candidate is unique under the final rules. The givens in the input are
/// anchors for choosing a solution and are eligible for removal from the result.
pub fn start_variant_generation(
    options: VariantGenerationOptions,
) -> Result<GenerationSearch<'static, GeneratedVariant>, VariantGenerationError> {
    use VariantGenerationError::*;
    let mut options = options;
    if let Some(GenerationRating::Difficulty(level)) = options.rating {
        options.technique_order.retain(|t| t.difficulty() <= level);
        options.technique_order.sort_by_key(|t| t.difficulty());
    }
    let base = options.template.compile().map_err(Definition)?;
    layouts::validate(&options.template, &options.derived_clues)?;
    base.prepare(&[0; CELLS], &[0; CELLS])
        .map_err(|_| ConflictingTemplate)?;
    if options.givens.is_empty()
        || *options.givens.end() > CELLS
        || options.thin_clues && *options.givens.end() != 0
    {
        return Err(InvalidGivenCount);
    }
    if options
        .variant_clues
        .as_ref()
        .is_some_and(RangeInclusive::is_empty)
    {
        return Err(InvalidClueCount);
    }
    if options
        .required_rule
        .iter()
        .chain(&options.required_rules)
        .any(|rule| {
            !has_family(&options.template, rule)
                && options
                    .derived_clues
                    .iter()
                    .all(|layout| !layout.can_supply(rule))
        })
    {
        return Err(MissingRequiredRule);
    }
    if matches!(&options.rating, Some(GenerationRating::Score(range)) if range.is_empty())
        || options.rating.is_some()
            && options.technique_order.is_empty()
            && *options.givens.end() < CELLS
    {
        return Err(InvalidRating);
    }
    if let Some((technique, mode)) = options.technique {
        if *options.givens.start() == CELLS
            || !base.supports_technique(technique)
            || mode == TechniqueTargetMode::ExclusiveOpening && technique.id() == "full-house"
            || (mode != TechniqueTargetMode::ExclusiveOpening || options.rating.is_some())
                && !options.technique_order.contains(&technique)
        {
            return Err(InvalidTechnique);
        }
        if options.rating.as_ref().is_some_and(|rating| match rating {
            GenerationRating::Score(range) => *range.end() < u32::from(technique.minimum_cost()),
            GenerationRating::Difficulty(level) => *level < technique.difficulty(),
        }) {
            return Err(InvalidRating);
        }
    }
    let excluded = options
        .exclude
        .iter()
        .enumerate()
        .map(|(index, puzzle)| {
            puzzle.compile().map_err(|_| InvalidExclusion(index))?;
            Ok(symmetry::generation_key(puzzle))
        })
        .collect::<Result<HashSet<_>, VariantGenerationError>>()?;
    Ok(GenerationSearch::new(
        Random::from_seed(options.seed),
        options.max_attempts,
        move |random| attempt(&base, &options, &excluded, random),
    ))
}

fn attempt(
    base: &CompiledVariant,
    options: &VariantGenerationOptions,
    excluded: &HashSet<VariantPuzzle>,
    random: &mut Random,
) -> Option<GeneratedVariant> {
    let empty = [0; CELLS];
    let (layouts, extra_peers) =
        layouts::prepare(&options.template, &options.derived_clues, random)?;
    let seed = random.next();
    let solution = if extra_peers.is_empty() {
        base.solve_seeded(&empty, &[0; CELLS], options.max_nodes, seed)
            .ok()?
    } else {
        let mut sampling = base.clone();
        for mask in extra_peers {
            sampling.add_peers(mask);
        }
        sampling
            .solve_seeded(&empty, &[0; CELLS], options.max_nodes, seed)
            .ok()?
    };
    let mut puzzle = options.template.clone();
    puzzle
        .rules
        .extend(layouts::build(layouts, &solution, random)?);
    puzzle.givens = solution;
    if options.thin_clues {
        return miracle::thin(puzzle, solution, excluded, options, random);
    }
    let variant_clues = puzzle.variant_clue_count();
    if options
        .variant_clues
        .as_ref()
        .is_some_and(|range| !range.contains(&variant_clues))
    {
        return None;
    }
    let mut compiled = puzzle.compile().ok()?;
    if compiled.analyze(&empty, &[0; CELLS], options.max_nodes) != Ok(Analysis::Unique) {
        return None;
    }
    let mut without = reduced_profiles(options, &puzzle)?;
    let mut order: [usize; CELLS] = std::array::from_fn(|index| index);
    random.shuffle(&mut order);
    if options.givens.start() != options.givens.end() && without.len() > 1 {
        // Preserve an opening for each rule. A given on a cell where a
        // counterexample differs would settle that ambiguity before the
        // player can use the clue. Try removing those cells early.
        let mut preferred = [false; CELLS];
        for (_, reduced) in &mut without {
            let alternative = [32, 20, 8, 0].into_iter().find_map(|anchors| {
                reduced.givens = empty;
                for &cell in order.iter().rev().take(anchors) {
                    reduced.givens[cell] = solution[cell];
                }
                reduced.alternative_to(&solution, options.max_nodes)
            })?;
            for cell in 0..CELLS {
                preferred[cell] |= alternative[cell] != solution[cell];
            }
        }
        order.sort_by_key(|&cell| !preferred[cell]);
    }
    let mut remaining = CELLS;
    if *options.givens.end() == 0 {
        puzzle.givens = empty;
        compiled.givens = empty;
        if compiled.analyze(&empty, &[0; CELLS], options.max_nodes) != Ok(Analysis::Unique) {
            return None;
        }
        remaining = 0;
    }
    let mut last_checked = None;
    for next in order.into_iter().map(Some).chain(std::iter::once(None)) {
        if options.givens.contains(&remaining) && last_checked != Some(remaining) {
            last_checked = Some(remaining);
            if (excluded.is_empty() || !excluded.contains(&symmetry::generation_key(&puzzle)))
                && let Some((rating, rule_dependencies)) =
                    accept(&compiled, &puzzle, &solution, &mut without, options)
            {
                return Some(GeneratedVariant {
                    seed: options.seed,
                    puzzle,
                    solution,
                    givens: remaining,
                    variant_clues,
                    rating,
                    rule_dependencies,
                });
            }
        }
        let Some(cell) = next else { break };
        if remaining == *options.givens.start() {
            break;
        }
        compiled.givens[cell] = 0;
        if compiled.analyze(&empty, &[0; CELLS], options.max_nodes) == Ok(Analysis::Unique) {
            remaining -= 1;
            puzzle.givens[cell] = 0;
        } else {
            compiled.givens[cell] = solution[cell];
        }
    }
    None
}

fn reduced_profiles<'a>(
    options: &'a VariantGenerationOptions,
    puzzle: &VariantPuzzle,
) -> Option<Vec<(&'a str, CompiledVariant)>> {
    options
        .required_rule
        .iter()
        .chain(&options.required_rules)
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .map(|id| Some((id.as_str(), without_family(puzzle, id)?)))
        .collect()
}

fn accept(
    compiled: &CompiledVariant,
    puzzle: &VariantPuzzle,
    solution: &Board,
    without: &mut [(&str, CompiledVariant)],
    options: &VariantGenerationOptions,
) -> Option<(VariantRating, Vec<RuleDependency>)> {
    use TechniqueTargetMode::*;
    let mut alternatives = Vec::new();
    for (id, reduced) in without {
        reduced.givens = puzzle.givens;
        let alternative = reduced.alternative_to(solution, options.max_nodes)?;
        if options.required_rules.iter().any(|rule| rule == id) {
            alternatives.push((*id, alternative));
        }
    }
    // A standard-box completion can differ from a jigsaw completion. Test the
    // actual classic grid independently. A budget limit supplies no evidence.
    if !options.required_rules.is_empty()
        && !matches!(
            crate::analyze(&puzzle.givens),
            Analysis::Multiple | Analysis::Unsolvable | Analysis::Conflict
        )
    {
        return None;
    }
    if let Some((technique, ExclusiveOpening)) = options.technique
        && !compiled.has_exclusive_opening(technique)
    {
        return None;
    }
    let position = VariantPosition::new(puzzle.clone());
    let mut first = None;
    let mut dependencies = Vec::new();
    let mut step_number = 0;
    let (_, rating) = position
        .run_with_compiled(compiled, &options.technique_order, |step| {
            first.get_or_insert(step.technique);
            step_number += 1;
            alternatives.retain(|&(rule, alternative)| {
                let differs = step.actions.iter().find(|action| {
                    let candidate = action.candidate();
                    let agrees = alternative[candidate.cell] == candidate.digit;
                    matches!(action, crate::HintAction::Eliminate(_)) == agrees
                });
                if let Some(&action) = differs {
                    dependencies.push(RuleDependency {
                        rule: rule.to_owned(),
                        step: step_number,
                        technique: step.technique,
                        action,
                        alternative,
                    });
                }
                differs.is_none()
            });
        })
        .ok()?;
    if !alternatives.is_empty()
        || !options.required_rules.is_empty() && matches!(rating.status, SolveStatus::Stalled)
    {
        return None;
    }
    if let Some((technique, First)) = options.technique
        && first != Some(technique)
    {
        return None;
    }
    if let Some((technique, Anywhere)) = options.technique
        && !rating.counts.contains_key(&technique)
    {
        return None;
    }
    if let Some(target) = &options.rating {
        let SolveStatus::Solved(level) = rating.status else {
            return None;
        };
        match target {
            GenerationRating::Difficulty(expected) if *expected != level => return None,
            GenerationRating::Score(range) if !range.contains(&rating.points) => return None,
            _ => {}
        }
    }
    if let Some(GenerationRating::Difficulty(level)) = options.rating {
        if puzzle.givens.iter().filter(|&&d| d != 0).count() > 40 {
            return None;
        }
        let mut lower: Vec<_> = options
            .technique_order
            .iter()
            .copied()
            .filter(|t| t.difficulty() < level)
            .collect();
        for technique in
            VariantTechnique::all().filter(|t| !t.is_optional() && t.difficulty() < level)
        {
            if !lower.contains(&technique) {
                lower.push(technique);
            }
        }
        // A checked recipe may retain its established walkthrough. Reject it
        // if the extended profile can finish in a cheaper tier.
        let expanded;
        let lower_solver = if !options.required_rules.is_empty() && !compiled.extended_logic {
            expanded = {
                let mut solver = compiled.clone();
                solver.extended_logic = true;
                solver
            };
            &expanded
        } else {
            compiled
        };
        for lower in crate::logical::tier_orders(lower, VariantTechnique::difficulty) {
            if lower.is_empty() {
                break;
            }
            let (_, easier) = position
                .run_with_compiled(lower_solver, &lower, |_| {})
                .ok()?;
            if matches!(easier.status, SolveStatus::Solved(_)) {
                return None;
            }
        }
    }
    Some((rating, dependencies))
}

#[cfg(test)]
mod adjacent_total_tests {
    use super::*;

    #[test]
    fn removing_total_constraints_does_not_activate_negative_xv_on_their_marks() {
        let solution = crate::parse_givens(
            "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
        )
        .unwrap();
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        for a in 0..CELLS {
            for b in [
                if a % 9 < 8 { a + 1 } else { CELLS },
                if a < 72 { a + 9 } else { CELLS },
            ] {
                if b < CELLS && matches!(solution[a] + solution[b], 5 | 10) {
                    puzzle.rules.push(PuzzleRule::AdjacentTotal {
                        cells: [a, b],
                        sum: solution[a] + solution[b],
                    });
                }
            }
        }
        puzzle.rules.push(PuzzleRule::Xv {
            five: MarkedPairs {
                pairs: vec![],
                negative: true,
            },
            ten: MarkedPairs {
                pairs: vec![],
                negative: true,
            },
        });
        assert_eq!(
            puzzle.compile().unwrap().analyze(&solution, &[0; CELLS], 1),
            Ok(Analysis::Unique)
        );
        let reduced = without_family(&puzzle, "adjacent-total").unwrap();
        assert_eq!(
            reduced.analyze(&solution, &[0; CELLS], 1),
            Ok(Analysis::Unique)
        );
    }
}
