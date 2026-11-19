use std::collections::HashSet;

use super::{GridSpec, SizedGrid, SizedTechnique};
use crate::{Analysis, Random};

#[cfg(feature = "variants")]
mod algebraic;
#[cfg(feature = "variants")]
pub use algebraic::{GeneratedAlgebraic, generate_algebraic};

/// A clue recipe for a 4 × 4 puzzle. Both recipes use singles through completion.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize),
    serde(rename_all = "kebab-case")
)]
pub enum MiniDifficulty {
    Easy,
    Medium,
}

/// Generate a uniquely solvable 4 × 4 puzzle that is absent from `exclude`.
pub fn generate_mini(
    seed: u32,
    difficulty: MiniDifficulty,
    exclude: &[[u8; 16]],
) -> Option<[u8; 16]> {
    let layout = SizedGrid::new(GridSpec {
        size: 4,
        box_rows: 2,
        box_columns: 2,
    })?;
    let excluded: HashSet<_> = exclude.iter().collect();
    let mut random = Random::from_seed(seed);
    let (minimum, spread) = match difficulty {
        MiniDifficulty::Easy => (8, 3),
        MiniDifficulty::Medium => (4, 3),
    };
    for _ in 0..192 {
        let solution = shuffled_solution(&mut random);
        let mut puzzle = solution;
        let mut order: [usize; 16] = std::array::from_fn(|cell| cell);
        random.shuffle(&mut order);
        let target = minimum + random.index(spread);
        let mut clues = 16;
        for cell in order {
            puzzle[cell] = 0;
            if layout.analyze(&puzzle, 1_000) == Analysis::Unique {
                clues -= 1;
                if clues == target {
                    break;
                }
            } else {
                puzzle[cell] = solution[cell];
            }
        }
        if clues != target || excluded.contains(&puzzle) {
            continue;
        }
        if difficulty == MiniDifficulty::Medium
            && layout
                .candidates(&puzzle)?
                .iter()
                .filter(|mask| mask.is_power_of_two())
                .count()
                > 3
        {
            continue;
        }
        if solved_by_singles(&layout, puzzle, solution) {
            return Some(puzzle);
        }
    }
    None
}

fn shuffled_solution(random: &mut Random) -> [u8; 16] {
    let seeds = [*b"1234341221434321", *b"1234341223414123"];
    let start = seeds[random.index(seeds.len())];
    let mut digits = [1, 2, 3, 4];
    random.shuffle(&mut digits);
    let mut order = || {
        let mut cells = [0, 1, 2, 3];
        if random.index(2) == 1 {
            cells.swap(0, 2);
            cells.swap(1, 3);
        }
        if random.index(2) == 1 {
            cells.swap(0, 1);
        }
        if random.index(2) == 1 {
            cells.swap(2, 3);
        }
        cells
    };
    let (rows, columns) = (order(), order());
    let transpose = random.index(2) == 1;
    std::array::from_fn(|cell| {
        let (row, column) = (rows[cell / 4], columns[cell % 4]);
        let index = if transpose {
            column * 4 + row
        } else {
            row * 4 + column
        };
        digits[usize::from(start[index] - b'1')]
    })
}

fn solved_by_singles(layout: &SizedGrid, mut puzzle: [u8; 16], solution: [u8; 16]) -> bool {
    while let Some(step) = layout.next_deduction(&puzzle, &[0; 16]) {
        if !matches!(
            step.technique,
            SizedTechnique::NakedSingle | SizedTechnique::HiddenSingle
        ) {
            return false;
        }
        let candidate = step.actions[0].candidate();
        puzzle[candidate.cell] = candidate.digit;
    }
    puzzle == solution
}

/// Generate a uniquely solvable 6 × 6 puzzle with the requested box orientation.
/// Easy uses naked singles. Medium needs at least one hidden single or locked candidate.
pub fn generate_six(
    spec: GridSpec,
    seed: u32,
    difficulty: MiniDifficulty,
    exclude: &[Vec<u8>],
) -> Option<[u8; 36]> {
    if spec.size != 6 || !matches!((spec.box_rows, spec.box_columns), (2, 3) | (3, 2)) {
        return None;
    }
    let layout = SizedGrid::new(spec)?;
    let excluded: HashSet<&[u8]> = exclude.iter().map(Vec::as_slice).collect();
    let mut random = Random::from_seed(seed);
    let (minimum, spread) = match difficulty {
        MiniDifficulty::Easy => (16, 4),
        MiniDifficulty::Medium => (11, 4),
    };
    for _ in 0..160 {
        let solution = six_solution(spec, &mut random);
        let mut puzzle = solution;
        let mut order: [usize; 36] = std::array::from_fn(|cell| cell);
        random.shuffle(&mut order);
        let target = minimum + random.index(spread);
        let mut clues = 36;
        for cell in order {
            puzzle[cell] = 0;
            if layout.analyze(&puzzle, 2_000) == Analysis::Unique {
                clues -= 1;
                if clues == target {
                    break;
                }
            } else {
                puzzle[cell] = solution[cell];
            }
        }
        if clues != target || excluded.contains(puzzle.as_slice()) {
            continue;
        }
        if recipe_matches(&layout, puzzle, solution, difficulty) {
            return Some(puzzle);
        }
    }
    None
}

fn six_solution(spec: GridSpec, random: &mut Random) -> [u8; 36] {
    let mut digits = [1, 2, 3, 4, 5, 6];
    random.shuffle(&mut digits);
    let rows = shuffle_groups(spec.box_rows, random);
    let columns = shuffle_groups(spec.box_columns, random);
    std::array::from_fn(|cell| {
        let row = rows[cell / 6];
        let column = columns[cell % 6];
        digits[(row % spec.box_rows * spec.box_columns + row / spec.box_rows + column) % 6]
    })
}

fn shuffle_groups(width: usize, random: &mut Random) -> [usize; 6] {
    let mut groups = [0, 1, 2];
    random.shuffle(&mut groups[..6 / width]);
    let mut order: [usize; 6] =
        std::array::from_fn(|cell| groups[cell / width] * width + cell % width);
    for group in order.chunks_exact_mut(width) {
        random.shuffle(group);
    }
    order
}

fn recipe_matches(
    layout: &SizedGrid,
    mut puzzle: [u8; 36],
    solution: [u8; 36],
    difficulty: MiniDifficulty,
) -> bool {
    let mut beyond_naked_singles = false;
    let mut removed = [0; 36];
    while let Some(step) = layout.next_deduction(&puzzle, &removed) {
        if step.technique != SizedTechnique::NakedSingle {
            if difficulty == MiniDifficulty::Easy {
                return false;
            }
            beyond_naked_singles = true;
        }
        for action in step.actions {
            match action {
                crate::HintAction::Place(candidate) => puzzle[candidate.cell] = candidate.digit,
                crate::HintAction::Eliminate(candidate) => {
                    removed[candidate.cell] |= 1 << (candidate.digit - 1)
                }
            }
        }
    }
    puzzle == solution && (difficulty == MiniDifficulty::Easy || beyond_naked_singles)
}
