use serde::Deserialize;
use serde_json::json;

use super::{ResultValue, puzzle_error};
use crate::{
    AlgebraicCage, Analysis, CageTotal, GridSpec, SEARCH_LIMIT, SIZED_GRID_VERSION,
    SizedAlgebraicCages,
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Definition {
    version: u8,
    grid: GridSpec,
    digits: Vec<u8>,
    rules: Vec<Rule>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
enum Rule {
    AlgebraicCage {
        cells: Vec<usize>,
        total: Total,
        label: String,
    },
}

#[derive(Deserialize)]
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

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case")]
pub(super) enum Operation {
    Analyze,
    Solve,
    Bounds,
    Trace {
        eliminations: Option<Vec<u16>>,
    },
    CageProof {
        rule: usize,
        eliminations: Option<Vec<u16>>,
    },
}

pub(super) fn execute(definition: Definition, operation: Operation) -> ResultValue {
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
        Operation::Analyze => json!(match puzzle.analyze(&digits, SEARCH_LIMIT) {
            Analysis::Unique => "unique",
            analysis => puzzle_error(analysis).0,
        }),
        Operation::Solve => json!(puzzle.solve(&digits, SEARCH_LIMIT)),
        Operation::Bounds => json!(puzzle.bounds(&digits)),
        Operation::Trace { eliminations } => {
            json!(puzzle.trace(digits, removals(eliminations)?, SEARCH_LIMIT))
        }
        Operation::CageProof { rule, eliminations } => {
            if rule >= puzzle.cages().len() {
                return Err(("invalid-rule", "Choose an algebraic cage in the puzzle."));
            }
            json!(puzzle.proof_at(&digits, &removals(eliminations)?, rule, SEARCH_LIMIT))
        }
    })
}
