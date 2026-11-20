use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{ResponseValue, ResultValue, puzzle_error};
use crate::{Analysis, GridSpec, SEARCH_LIMIT, SIZED_GRID_VERSION, SizedGrid};

#[derive(Deserialize, Serialize)]
#[serde(untagged)]
pub(super) enum Layout {
    Boxes(GridSpec),
    Regions(Regions),
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Regions {
    size: usize,
    regions: Vec<Vec<usize>>,
}

impl Layout {
    pub(super) fn compile(&self, digits: &[u8]) -> ResultValue<SizedGrid> {
        let layout = match self {
            Self::Boxes(spec) => SizedGrid::new(*spec),
            Self::Regions(spec) => SizedGrid::with_regions(spec.size, &spec.regions),
        }.ok_or((
            "invalid-layout",
            "Choose boxes or connected regions with one cell for each digit.",
        ))?;
        if digits.len() != layout.cell_count()
            || digits.iter().any(|&digit| usize::from(digit) > layout.size())
        {
            return Err((
                "invalid-grid",
                "The cell count and digits must match the grid size.",
            ));
        }
        Ok(layout)
    }
}

pub(super) fn candidate_removals(
    value: Option<Vec<u16>>, cell_count: usize, full: u16,
) -> ResultValue<Vec<u16>> {
    let eliminations = value.unwrap_or_else(|| vec![0; cell_count]);
    if eliminations.len() != cell_count || eliminations.iter().any(|mask| mask & !full != 0) {
        return Err((
            "invalid-eliminations",
            "Candidate eliminations must match the grid size.",
        ));
    }
    Ok(eliminations)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Definition {
    version: u8,
    grid: Layout,
    digits: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case")]
pub(super) enum Operation {
    Analyze,
    Candidates,
    Solve,
    NextDeduction {
        eliminations: Option<Vec<u16>>,
    },
    Hints {
        eliminations: Option<Vec<u16>>,
        limit: Option<usize>,
    },
    Trace {
        eliminations: Option<Vec<u16>>,
        #[serde(default, rename = "singlesOnly")]
        singles_only: bool,
    },
}

pub(super) fn execute(definition: Definition, operation: Operation) -> ResultValue<ResponseValue> {
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
    let layout = grid.compile(&digits)?;
    let removals = |value| candidate_removals(value, layout.cell_count(), layout.digit_mask());
    Ok(match operation {
        Operation::Analyze => {
            ResponseValue::Json(json!(match layout.analyze(&digits, SEARCH_LIMIT) {
                Analysis::Unique => "unique",
                analysis => puzzle_error(analysis).0,
            }))
        }
        Operation::Candidates => ResponseValue::Json(json!(layout.candidates(&digits))),
        Operation::Solve => ResponseValue::Json(json!(layout.solve(&digits, SEARCH_LIMIT))),
        Operation::NextDeduction { eliminations } => {
            ResponseValue::SizedDeduction(layout.next_deduction(&digits, &removals(eliminations)?))
        }
        Operation::Hints {
            eliminations,
            limit,
        } => ResponseValue::SizedHints(layout.hints(
            &digits,
            &removals(eliminations)?,
            limit.unwrap_or(10).min(1024),
        )),
        Operation::Trace {
            eliminations,
            singles_only,
        } => {
            let eliminations = removals(eliminations)?;
            ResponseValue::SizedTrace(layout.trace(digits, eliminations, singles_only))
        }
    })
}
