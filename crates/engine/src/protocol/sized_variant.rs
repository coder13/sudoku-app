use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{ResponseValue, ResultValue, puzzle_error};
use crate::{
    AlgebraicCage, AlgebraicRating, Analysis, CageTotal, GridSpec, SEARCH_LIMIT,
    SIZED_GRID_VERSION, SizedAlgebraicCages, SizedConstraint, SizedConstraintGrid, SizedDiagonal,
    SizedParity,
};

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Definition {
    version: u8,
    grid: GridSpec,
    digits: Vec<u8>,
    rules: Vec<Rule>,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
enum Rule {
    Diagonal {
        diagonal: SizedDiagonal,
    },
    Parity {
        cells: Vec<usize>,
        parity: SizedParity,
    },
    Thermometer {
        cells: Vec<usize>,
    },
    Renban {
        cells: Vec<usize>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        segments: Option<Vec<Vec<usize>>>,
    },
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
        let Rule::AlgebraicCage {
            cells,
            total,
            label,
        } = rule
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
            Rule::Diagonal { diagonal } => Self::Diagonal(diagonal),
            Rule::Parity { cells, parity } => Self::Parity { cells, parity },
            Rule::Thermometer { cells } => Self::Thermometer { cells },
            Rule::Renban { cells, segments } => {
                if let Some(segments) = segments {
                    if segments.is_empty()
                        || segments.iter().any(Vec::is_empty)
                        || segments.iter().flatten().any(|cell| !cells.contains(cell))
                        || cells
                            .iter()
                            .any(|cell| !segments.iter().any(|part| part.contains(cell)))
                    {
                        return Err((
                            "invalid-rules",
                            "Renban drawing paths must cover the same cells as the line.",
                        ));
                    }
                }
                Self::Renban { cells }
            }
            Rule::AlgebraicCage { .. } => {
                return Err((
                    "unsupported-rule",
                    "Algebraic cages are supported on the 4 × 4 grid.",
                ));
            }
        })
    }
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
        Self::AlgebraicCage {
            cells,
            total,
            label,
        }
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
        if version != SIZED_GRID_VERSION || layout != grid || digits.iter().any(|&digit| digit > 4)
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
        grid,
        digits: generated.givens.to_vec(),
        rules: generated.cages.into_iter().map(Rule::from).collect(),
    }))
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case")]
pub(super) enum Operation {
    Analyze,
    Solve,
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
    if grid.size == 6 {
        return execute_six(grid, &digits, rules, operation);
    }
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
    let removals = |value: Option<Vec<u16>>| {
        let eliminations = value.unwrap_or_else(|| vec![0; 16]);
        if eliminations.len() != 16 || eliminations.iter().any(|&mask| mask > 15) {
            return Err((
                "invalid-eliminations",
                "Candidate eliminations must match the grid size.",
            ));
        }
        Ok(eliminations)
    };
    Ok(match operation {
        Operation::Analyze => {
            ResponseValue::Json(json!(match puzzle.analyze(&digits, SEARCH_LIMIT) {
                Analysis::Unique => "unique",
                analysis => puzzle_error(analysis).0,
            }))
        }
        Operation::Solve => ResponseValue::Json(json!(puzzle.solve(&digits, SEARCH_LIMIT))),
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

fn execute_six(
    grid: GridSpec,
    digits: &[u8],
    rules: Vec<Rule>,
    operation: Operation,
) -> ResultValue<ResponseValue> {
    if (grid.box_rows, grid.box_columns) != (2, 3) && (grid.box_rows, grid.box_columns) != (3, 2) {
        return Err(("invalid-layout", "Use six 2 × 3 or 3 × 2 boxes."));
    }
    if digits.len() != 36 || digits.iter().any(|&digit| digit > 6) {
        return Err((
            "invalid-grid",
            "The cell count and digits must match the grid size.",
        ));
    }
    let constraints = rules
        .into_iter()
        .map(SizedConstraint::try_from)
        .collect::<Result<Vec<_>, _>>()?;
    let puzzle = SizedConstraintGrid::new(grid, &constraints)
        .ok_or(("invalid-rules", "Check the cells and paths in the rules."))?;
    let removals = |value: Option<Vec<u16>>| {
        let value = value.unwrap_or_else(|| vec![0; digits.len()]);
        if value.len() != digits.len() || value.iter().any(|mask| mask & !0x3f != 0) {
            return Err((
                "invalid-eliminations",
                "The candidate masks must match the grid.",
            ));
        }
        Ok(value)
    };
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
        Operation::Candidates => json!(puzzle.candidates(digits)),
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
                "This 6 × 6 operation is unavailable.",
            ));
        }
    };
    Ok(ResponseValue::Json(value))
}
