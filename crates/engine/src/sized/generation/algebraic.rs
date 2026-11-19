use std::collections::HashSet;

use super::{GridSpec, Random, shuffled_solution};
use crate::{
    AlgebraicCage, AlgebraicDifficulty, AlgebraicRating, AlgebraicStep, Analysis, CageTotal,
    SizedAlgebraicCages,
};

const GRID: GridSpec = GridSpec {
    size: 4,
    box_rows: 2,
    box_columns: 2,
};
const NODE_BUDGET: u32 = 1_000;
const ATTEMPTS: usize = 96;

/// A reproducible 4 × 4 puzzle with three connected algebraic cages.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct GeneratedAlgebraic {
    pub givens: [u8; 16],
    pub cages: Vec<AlgebraicCage>,
}

/// Generate a unique puzzle that needs every cage and has a complete logical path.
pub fn generate_algebraic(
    seed: u32,
    difficulty: Option<AlgebraicDifficulty>,
    exclude: &[GeneratedAlgebraic],
) -> Option<GeneratedAlgebraic> {
    let mut random = Random::from_seed(seed);
    let exclusions: HashSet<_> = exclude.iter().collect();
    for _ in 0..ATTEMPTS {
        let solution = shuffled_solution(&mut random);
        let Some(cages) = draw_cages(&mut random, &solution) else {
            continue;
        };
        let game = SizedAlgebraicCages::new(GRID, cages.clone())?;
        let mut givens = solution;
        let mut order: [usize; 16] = std::array::from_fn(|cell| cell);
        random.shuffle(&mut order);
        for cell in order {
            givens[cell] = 0;
            if game.analyze(&givens, NODE_BUDGET) != Analysis::Unique {
                givens[cell] = solution[cell];
            }
        }
        let candidate = GeneratedAlgebraic { givens, cages };
        if exclusions.contains(&candidate) || !every_cage_is_needed(&candidate) {
            continue;
        }
        if let Some(trace) = game.trace(givens.to_vec(), vec![0; 16], NODE_BUDGET)
            && trace.last()?.digits == solution
            && difficulty.is_none_or(|level| {
                AlgebraicRating::from_trace(&trace).is_some_and(|rating| rating.difficulty == level)
            })
            && trace
                .iter()
                .any(|position| matches!(position.step, Some(AlgebraicStep::Cage(_))))
        {
            return Some(candidate);
        }
    }
    None
}

fn every_cage_is_needed(puzzle: &GeneratedAlgebraic) -> bool {
    (0..puzzle.cages.len()).all(|without| {
        let mut rules = puzzle.cages.clone();
        rules.remove(without);
        SizedAlgebraicCages::new(GRID, rules)
            .is_some_and(|game| game.analyze(&puzzle.givens, NODE_BUDGET) == Analysis::Multiple)
    })
}

fn draw_cages(random: &mut Random, solution: &[u8; 16]) -> Option<Vec<AlgebraicCage>> {
    let mut shapes = vec![];
    let mut occupied = 0u16;
    let mut sizes = [1, 2, 3];
    random.shuffle(&mut sizes);
    for size in sizes {
        let free: Vec<_> = (0..16)
            .filter(|&cell| occupied & (1 << cell) == 0)
            .collect();
        let mut cells = vec![free[random.index(free.len())]];
        while cells.len() < size {
            let frontier: Vec<_> = free
                .iter()
                .copied()
                .filter(|&cell| {
                    cells.iter().all(|&other| solution[other] != solution[cell])
                        && cells.iter().any(|&other| cells_share_edge(other, cell))
                })
                .collect();
            if frontier.is_empty() {
                return None;
            }
            cells.push(frontier[random.index(frontier.len())]);
        }
        for &cell in &cells {
            occupied |= 1 << cell;
        }
        cells.sort_unstable();
        shapes.push(cells);
    }
    shapes.sort_unstable();
    let sums: Vec<i32> = shapes
        .iter()
        .map(|cage| cage.iter().map(|&cell| i32::from(solution[cell])).sum())
        .collect();
    if sums.iter().all(|&sum| sum == sums[0]) {
        return None;
    }
    let variable = sums[random.index(sums.len())];
    Some(
        shapes
            .into_iter()
            .zip(sums)
            .map(|(cells, sum)| {
                let offset = sum - variable;
                AlgebraicCage {
                    cells,
                    total: CageTotal::Variable {
                        name: "x".to_owned(),
                        offset,
                    },
                    label: if offset == 0 {
                        "x".to_owned()
                    } else {
                        format!("x{offset:+}")
                    },
                }
            })
            .collect(),
    )
}

fn cells_share_edge(first: usize, second: usize) -> bool {
    (first / 4).abs_diff(second / 4) + (first % 4).abs_diff(second % 4) == 1
}
