use serde::Deserialize;
use serde_json::json;

use super::{ResultValue, puzzle_error};
use crate::{Analysis, GridSpec, SEARCH_LIMIT, SIZED_GRID_VERSION, SizedGrid};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Definition {
    version: u8,
    grid: GridSpec,
    digits: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case")]
pub(super) enum Operation {
    Analyze,
    Candidates,
    Solve,
    NextDeduction { eliminations: Option<Vec<u16>> },
}

pub(super) fn execute(definition: Definition, operation: Operation) -> ResultValue {
    let Definition {
        version,
        grid,
        digits,
    } = definition;
    if version != SIZED_GRID_VERSION {
        return Err((
            "unsupported-format",
            "This sized grid format is unsupported.",
        ));
    }
    let layout = SizedGrid::new(grid).ok_or((
        "invalid-layout",
        "Choose box dimensions that fit the grid and have one cell for each digit.",
    ))?;
    if digits.len() != layout.cell_count()
        || digits.iter().any(|&digit| usize::from(digit) > grid.size)
    {
        return Err((
            "invalid-grid",
            "The cell count and digits must match the grid size.",
        ));
    }
    Ok(match operation {
        Operation::Analyze => json!(match layout.analyze(&digits, SEARCH_LIMIT) {
            Analysis::Unique => "unique",
            analysis => puzzle_error(analysis).0,
        }),
        Operation::Candidates => json!(layout.candidates(&digits)),
        Operation::Solve => json!(layout.solve(&digits, SEARCH_LIMIT)),
        Operation::NextDeduction { eliminations } => {
            let eliminations = eliminations.unwrap_or_else(|| vec![0; digits.len()]);
            let full = u16::MAX >> (16 - grid.size);
            if eliminations.len() != digits.len()
                || eliminations.iter().any(|mask| mask & !full != 0)
            {
                return Err((
                    "invalid-eliminations",
                    "Candidate eliminations must match the grid size.",
                ));
            }
            json!(layout.next_deduction(&digits, &eliminations))
        }
    })
}
