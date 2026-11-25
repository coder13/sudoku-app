use serde::{Deserialize, Serialize};
use serde_json::json;

use super::sized::{Layout, candidate_removals};
use super::{ResponseValue, ResultValue, puzzle_error};
#[cfg(feature = "generation")]
use crate::GridSpec;
use crate::{
    AlgebraicCage, AlgebraicRating, Analysis, CageTotal, EquationOperator, PuzzleRule,
    SEARCH_LIMIT, SIZED_GRID_VERSION, SizedAlgebraicCages, SizedConstraint, SizedConstraintGrid,
};

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Definition {
    version: u8,
    grid: Layout,
    digits: Vec<u8>,
    rules: Vec<Rule>,
}

#[derive(Deserialize, Serialize)]
#[serde(untagged)]
enum Rule {
    Sized(SizedRule),
    Variant(PuzzleRule),
    Algebraic(AlgebraicRule),
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct FractionalPiece {
    quarters: Vec<usize>,
    color: String,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
enum SizedRule {
    Entropic {
        cells: Vec<usize>,
        groups: Vec<Vec<u8>>,
    },
    FractionalRegions {
        pieces: Vec<FractionalPiece>,
    },
    LittleKiller {
        direction: crate::ClueDirection,
        cells: Vec<usize>,
        sum: u16,
    },
    SlowThermometer {
        cells: Vec<usize>,
    },
    DoubleArrow {
        ends: [usize; 2],
        cells: Vec<usize>,
    },
    LinkedDoubleArrow {
        ends: [crate::SizedSumEnd; 2],
        cells: Vec<usize>,
    },
    Difference {
        cells: [usize; 2],
        difference: u8,
    },
    Nonogram {
        axis: crate::RunAxis,
        index: usize,
        digits: Vec<u8>,
        runs: Vec<u8>,
    },
    Skyscrapers {
        direction: crate::ClueDirection,
        index: usize,
        count: u8,
    },
    AntiSum {
        sum: u8,
    },
    RowColumnSum {
        pairs: Vec<[usize; 2]>,
        #[serde(default, rename = "requireUnmarked")]
        require_unmarked: bool,
    },
    RowEquation {
        cells: Vec<usize>,
        operators: Vec<EquationOperator>,
    },
    CornerKropki {
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        consecutive: Vec<usize>,
        #[serde(default, rename = "ratioTwo", skip_serializing_if = "Vec::is_empty")]
        ratio_two: Vec<usize>,
    },
    LabeledDots {
        relation: crate::sized::SizedDotRelation,
        marks: Vec<crate::sized::SizedLabeledDot>,
        #[serde(default)]
        negative: bool,
    },
    Crust {
        clues: Vec<crate::CrustClue>,
        #[serde(default, rename = "sharedRegion")]
        shared_region: Option<[usize; 2]>,
        #[serde(default, rename = "fixedEdges")]
        fixed_edges: Vec<[usize; 2]>,
    },
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
enum AlgebraicRule {
    AlgebraicCage {
        cells: Vec<usize>,
        total: Total,
        label: String,
    },
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
enum Total {
    Fixed { value: u16 },
    Variable { name: String, offset: i32 },
}

impl TryFrom<Rule> for AlgebraicCage {
    type Error = (&'static str, &'static str);

    fn try_from(rule: Rule) -> Result<Self, Self::Error> {
        let Rule::Algebraic(AlgebraicRule::AlgebraicCage {
            cells,
            total,
            label,
        }) = rule
        else {
            return Err(("unsupported-rule", "This grid supports algebraic cages."));
        };
        let total = match total {
            Total::Fixed { value } => CageTotal::Fixed(value),
            Total::Variable { name, offset } => CageTotal::Variable { name, offset },
        };
        Ok(Self {
            cells,
            total,
            label,
        })
    }
}

impl TryFrom<Rule> for SizedConstraint {
    type Error = (&'static str, &'static str);

    fn try_from(rule: Rule) -> Result<Self, Self::Error> {
        Ok(match rule {
            Rule::Variant(PuzzleRule::AntiKing {}) => Self::AntiKing,
            Rule::Sized(SizedRule::Entropic { cells, groups }) => Self::Entropic { cells, groups },
            Rule::Variant(PuzzleRule::Diagonal { diagonal }) => Self::Diagonal(diagonal),
            Rule::Variant(PuzzleRule::ExtraHouse { cells }) => Self::ExtraHouse { cells },
            Rule::Variant(PuzzleRule::Parity { cells, parity }) => Self::Parity { cells, parity },
            Rule::Variant(PuzzleRule::Thermometer { cells }) => Self::Thermometer { cells },
            Rule::Sized(SizedRule::SlowThermometer { cells }) => Self::SlowThermometer { cells },
            Rule::Variant(PuzzleRule::Between { cells }) => Self::Between { cells },
            Rule::Variant(PuzzleRule::Whispers {
                cells,
                min_difference,
            }) => Self::Whispers {
                cells,
                min_difference,
            },
            Rule::Variant(PuzzleRule::NonConsecutive { except }) => Self::NonConsecutive { except },
            Rule::Variant(PuzzleRule::Inequality { less, greater }) => {
                Self::Inequality { less, greater }
            }
            Rule::Variant(PuzzleRule::Xv { five, ten }) => Self::Xv { five, ten },
            Rule::Variant(PuzzleRule::Sandwich {
                cells,
                direction,
                sum,
            }) => Self::Sandwich {
                cells,
                direction,
                sum,
            },
            Rule::Variant(PuzzleRule::Arrow { circle, cells }) => Self::Arrow { circle, cells },
            Rule::Sized(SizedRule::DoubleArrow { ends, cells }) => {
                Self::DoubleArrow { ends, cells }
            }
            Rule::Sized(SizedRule::LinkedDoubleArrow { ends, cells }) => {
                Self::LinkedDoubleArrow { ends, cells }
            }
            Rule::Variant(PuzzleRule::Quadruple { top_left, digits }) => {
                Self::Quadruple { top_left, digits }
            }
            Rule::Variant(PuzzleRule::Kropki {
                consecutive,
                ratio_two,
            }) => Self::Kropki {
                consecutive,
                ratio_two,
            },
            Rule::Variant(PuzzleRule::Renban { cells, segments }) => {
                validate_drawing(
                    &cells,
                    segments,
                    "Renban drawing paths must cover the same cells as the line.",
                )?;
                Self::Renban { cells }
            }
            Rule::Variant(PuzzleRule::Modular { cells }) => Self::Modular { cells },
            Rule::Variant(PuzzleRule::GlobalEntropy { groups }) => Self::GlobalEntropy { groups },
            Rule::Variant(PuzzleRule::KillerCages { cages, cover_grid }) => {
                Self::KillerCages { cages, cover_grid }
            }
            Rule::Variant(PuzzleRule::RegionSum {
                cells,
                group_by_region,
                segments,
            }) => {
                validate_drawing(
                    &cells,
                    segments,
                    "Region Sum drawing paths must cover the same cells as the line.",
                )?;
                Self::RegionSum {
                    cells,
                    group_by_region,
                }
            }
            Rule::Sized(SizedRule::AntiSum { sum }) => Self::AntiSum { sum },
            Rule::Sized(SizedRule::RowColumnSum {
                pairs,
                require_unmarked,
            }) => Self::RowColumnSum {
                pairs,
                require_unmarked,
            },
            Rule::Sized(SizedRule::RowEquation { cells, operators }) => {
                Self::RowEquation { cells, operators }
            }
            Rule::Sized(SizedRule::FractionalRegions { pieces }) => Self::FractionalRegions {
                pieces: pieces.into_iter().map(|piece| piece.quarters).collect(),
            },
            Rule::Sized(SizedRule::LittleKiller {
                direction,
                cells,
                sum,
            }) => Self::LittleKiller {
                direction,
                cells,
                sum,
            },
            Rule::Sized(SizedRule::Nonogram {
                axis,
                index,
                digits,
                runs,
            }) => Self::Nonogram {
                axis,
                index,
                digits,
                runs,
            },
            Rule::Sized(SizedRule::Skyscrapers {
                direction,
                index,
                count,
            }) => Self::Skyscrapers {
                direction,
                index,
                count,
            },
            Rule::Sized(SizedRule::CornerKropki {
                consecutive,
                ratio_two,
            }) => Self::CornerKropki {
                consecutive,
                ratio_two,
            },
            Rule::Sized(SizedRule::Difference { cells, difference }) => {
                Self::Difference { cells, difference }
            }
            Rule::Sized(SizedRule::LabeledDots {
                relation,
                marks,
                negative,
            }) => Self::LabeledDots {
                relation,
                marks,
                negative,
            },
            Rule::Sized(SizedRule::Crust {
                clues,
                shared_region,
                fixed_edges,
            }) => Self::Crust {
                clues,
                shared_region,
                fixed_edges,
            },
            Rule::Variant(_) => {
                return Err((
                    "unsupported-rule",
                    "This rule is unavailable on the sized grid.",
                ));
            }
            Rule::Algebraic(_) => {
                return Err((
                    "unsupported-rule",
                    "Algebraic cages are supported on the 4 × 4 grid.",
                ));
            }
        })
    }
}

fn validate_drawing(
    cells: &[usize],
    segments: Option<Vec<Vec<usize>>>,
    message: &'static str,
) -> ResultValue<()> {
    if let Some(segments) = segments
        && (segments.is_empty()
            || segments.iter().any(Vec::is_empty)
            || segments.iter().flatten().any(|cell| !cells.contains(cell))
            || cells
                .iter()
                .any(|cell| !segments.iter().any(|part| part.contains(cell))))
    {
        return Err(("invalid-rules", message));
    }
    Ok(())
}

#[cfg(feature = "generation")]
impl From<AlgebraicCage> for Rule {
    fn from(
        AlgebraicCage {
            cells,
            total,
            label,
        }: AlgebraicCage,
    ) -> Self {
        let total = match total {
            CageTotal::Fixed(value) => Total::Fixed { value },
            CageTotal::Variable { name, offset } => Total::Variable { name, offset },
        };
        Self::Algebraic(AlgebraicRule::AlgebraicCage {
            cells,
            total,
            label,
        })
    }
}

#[cfg(feature = "generation")]
pub(super) fn generate(
    seed: u32,
    difficulty: Option<crate::AlgebraicDifficulty>,
    exclude: Vec<Definition>,
) -> ResultValue<ResponseValue> {
    let grid = GridSpec {
        size: 4,
        box_rows: 2,
        box_columns: 2,
    };
    let mut excluded = Vec::new();
    for definition in exclude {
        let Definition {
            version,
            grid: layout,
            digits,
            rules,
        } = definition;
        if version != SIZED_GRID_VERSION
            || !matches!(layout, Layout::Boxes(spec) if spec == grid)
            || digits.iter().any(|&digit| digit > 4)
        {
            return Err((
                "invalid-exclusion",
                "Exclusions must use a 4 × 4 algebraic grid.",
            ));
        }
        let givens = digits
            .try_into()
            .map_err(|_| ("invalid-exclusion", "Exclusions must contain 16 cells."))?;
        let mut cages = rules
            .into_iter()
            .map(AlgebraicCage::try_from)
            .collect::<Result<Vec<_>, _>>()?;
        for cage in &mut cages {
            cage.cells.sort_unstable();
            cage.label = match &cage.total {
                CageTotal::Fixed(value) => value.to_string(),
                CageTotal::Variable { name, offset: 0 } => name.clone(),
                CageTotal::Variable { name, offset } => format!("{name}{offset:+}"),
            };
        }
        cages.sort_unstable_by(|left, right| left.cells.cmp(&right.cells));
        excluded.push(crate::GeneratedAlgebraic { givens, cages });
    }
    let generated = crate::generate_algebraic(seed, difficulty, &excluded)
        .ok_or_else(|| puzzle_error(Analysis::SearchLimit))?;
    Ok(ResponseValue::AlgebraicPuzzle(Definition {
        version: SIZED_GRID_VERSION,
        grid: Layout::Boxes(grid),
        digits: generated.givens.to_vec(),
        rules: generated.cages.into_iter().map(Rule::from).collect(),
    }))
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case")]
pub(super) enum Operation {
    Analyze,
    Solve,
    SolveUnique,
    Candidates,
    Rate,
    Bounds,
    Hints {
        eliminations: Option<Vec<u16>>,
        limit: usize,
    },
    Trace {
        eliminations: Option<Vec<u16>>,
        #[serde(default, rename = "singlesOnly")]
        singles_only: bool,
    },
    CageProof {
        rule: usize,
        eliminations: Option<Vec<u16>>,
    },
}

fn unique_reply(result: Result<impl Serialize, Analysis>) -> serde_json::Value {
    match result {
        Ok(solution) => json!({ "status": "unique", "solution": solution }),
        Err(status) => json!({ "status": puzzle_error(status).0 }),
    }
}

pub(super) fn execute(definition: Definition, operation: Operation) -> ResultValue<ResponseValue> {
    let Definition {
        version,
        grid,
        digits,
        rules,
    } = definition;
    if version != SIZED_GRID_VERSION {
        return Err((
            "unsupported-format",
            "This sized grid format is unsupported.",
        ));
    }
    // Keep the original Algebraic Cages response for saved Mini puzzles.
    // All other constraint positions use the layout supplied with the rules.
    let Layout::Boxes(spec) = &grid else {
        return execute_constraints(grid, &digits, rules, operation);
    };
    if spec.size != 4
        || (!rules.is_empty() && !rules.iter().any(|rule| matches!(rule, Rule::Algebraic(_))))
    {
        return execute_constraints(grid, &digits, rules, operation);
    }
    let grid = *spec;
    if grid.size != 4 || grid.box_rows != 2 || grid.box_columns != 2 {
        return Err((
            "invalid-layout",
            "Algebraic cages require a 4 × 4 grid with 2 × 2 boxes.",
        ));
    }
    if digits.len() != 16 || digits.iter().any(|&digit| digit > 4) {
        return Err((
            "invalid-grid",
            "The cell count and digits must match the grid size.",
        ));
    }
    let cages = rules
        .into_iter()
        .map(AlgebraicCage::try_from)
        .collect::<Result<Vec<_>, _>>()?;
    let puzzle = SizedAlgebraicCages::new(grid, cages).ok_or((
        "invalid-rules",
        "Check the cells, variables, and labels in the algebraic cages.",
    ))?;
    let removals = |value| candidate_removals(value, 16, 0b1111);
    Ok(match operation {
        Operation::Analyze => {
            ResponseValue::Json(json!(match puzzle.analyze(&digits, SEARCH_LIMIT) {
                Analysis::Unique => "unique",
                analysis => puzzle_error(analysis).0,
            }))
        }
        Operation::Solve => ResponseValue::Json(json!(puzzle.solve(&digits, SEARCH_LIMIT))),
        Operation::SolveUnique => {
            ResponseValue::Json(unique_reply(puzzle.solve_unique(&digits, SEARCH_LIMIT)))
        }
        Operation::Candidates => {
            return Err((
                "unsupported-operation",
                "Use the algebraic hint request to read its candidate grid.",
            ));
        }
        Operation::Rate => ResponseValue::Json(json!(
            puzzle
                .trace(digits, vec![0; 16], SEARCH_LIMIT)
                .and_then(|trace| AlgebraicRating::from_trace(&trace))
        )),
        Operation::Bounds => ResponseValue::Json(json!(puzzle.bounds(&digits))),
        Operation::Hints {
            eliminations,
            limit,
        } => ResponseValue::AlgebraicHints(puzzle.hints(
            &digits,
            &removals(eliminations)?,
            SEARCH_LIMIT,
            limit.min(256),
        )),
        Operation::Trace { eliminations, .. } => ResponseValue::AlgebraicTrace(puzzle.trace(
            digits,
            removals(eliminations)?,
            SEARCH_LIMIT,
        )),
        Operation::CageProof { rule, eliminations } => {
            if rule >= puzzle.cages().len() {
                return Err(("invalid-rule", "Choose an algebraic cage in the puzzle."));
            }
            ResponseValue::Json(json!(puzzle.proof_at(
                &digits,
                &removals(eliminations)?,
                rule,
                SEARCH_LIMIT
            )))
        }
    })
}

fn execute_constraints(
    grid: Layout,
    digits: &[u8],
    rules: Vec<Rule>,
    operation: Operation,
) -> ResultValue<ResponseValue> {
    let layout = grid.compile(digits)?;
    let full = layout.digit_mask();
    let constraints = rules
        .into_iter()
        .map(SizedConstraint::try_from)
        .collect::<Result<Vec<_>, _>>()?;
    let puzzle = SizedConstraintGrid::with_layout(layout, &constraints)
        .ok_or(("invalid-rules", "Check the cells and paths in the rules."))?;
    let removals = |value| candidate_removals(value, digits.len(), full);
    let value = match operation {
        Operation::Analyze => json!(match puzzle.analyze(digits, SEARCH_LIMIT) {
            Analysis::Unique => "unique",
            analysis => puzzle_error(analysis).0,
        }),
        Operation::Solve => json!(
            puzzle
                .solve(digits, SEARCH_LIMIT)
                .map(|digits| json!({ "digits": digits, "variables": {} }))
        ),
        Operation::SolveUnique => unique_reply(
            puzzle
                .solve_unique(digits, SEARCH_LIMIT)
                .map(|digits| json!({ "digits": digits, "variables": {} })),
        ),
        Operation::Candidates => match puzzle.candidates_with_budget(digits, SEARCH_LIMIT) {
            Ok(candidates) => json!(candidates),
            Err(analysis) => return Err(puzzle_error(analysis)),
        },
        Operation::Hints {
            eliminations,
            limit,
        } => {
            return Ok(ResponseValue::SizedConstraintHints(puzzle.hints(
                digits,
                &removals(eliminations)?,
                limit.min(1024),
            )));
        }
        Operation::Trace {
            eliminations,
            singles_only,
        } => {
            return Ok(ResponseValue::SizedConstraintTrace(puzzle.trace(
                digits.to_vec(),
                removals(eliminations)?,
                singles_only,
            )));
        }
        _ => {
            return Err((
                "unsupported-operation",
                "This operation is unavailable for the puzzle’s rules.",
            ));
        }
    };
    Ok(ResponseValue::Json(value))
}
