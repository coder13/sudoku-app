use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{ResponseValue, ResultValue, puzzle_error};
use crate::{
    AlgebraicCage, AlgebraicRating, Analysis, CageTotal, GridSpec, SEARCH_LIMIT,
    SIZED_GRID_VERSION, SizedAlgebraicCages,
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

impl From<Rule> for AlgebraicCage {
    fn from(rule: Rule) -> Self {
        let Rule::AlgebraicCage {
            cells,
            total,
            label,
        } = rule;
        let total = match total {
            Total::Fixed { value } => CageTotal::Fixed(value),
            Total::Variable { name, offset } => CageTotal::Variable { name, offset },
        };
        Self {
            cells,
            total,
            label,
        }
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
        let mut cages: Vec<AlgebraicCage> = rules.into_iter().map(AlgebraicCage::from).collect();
        for cage in &mut cages {
            cage.cells.sort_unstable();
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
    Rate,
    Bounds,
    Hints {
        eliminations: Option<Vec<u16>>,
        limit: usize,
    },
    Trace {
        eliminations: Option<Vec<u16>>,
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
    // This version of the sized variant contract exposes 4 × 4 algebraic cages.
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
    let puzzle =
        SizedAlgebraicCages::new(grid, rules.into_iter().map(AlgebraicCage::from).collect())
            .ok_or((
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
        Operation::Trace { eliminations } => ResponseValue::AlgebraicTrace(puzzle.trace(
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
