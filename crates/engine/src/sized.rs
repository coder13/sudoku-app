//! Classic Sudoku on a single square grid with rectangular boxes.

use crate::{Analysis, Candidate, HintAction, House};

#[cfg(feature = "variants")]
mod algebraic;
#[cfg(feature = "variants")]
pub use algebraic::{
    AlgebraicBounds, AlgebraicCage, AlgebraicCageBound, AlgebraicCageProof, AlgebraicCompletion,
    CageTotal, SizedAlgebraicCages,
};

#[cfg(feature = "generation")]
mod generation;
#[cfg(feature = "generation")]
pub use generation::{MiniDifficulty, generate_mini};

/// Wire version for a sized Classic grid. Version 1 uses the original 9×9 format.
pub const SIZED_GRID_VERSION: u8 = 2;
const MAX_SIZE: usize = 16;

/// The dimensions of a square grid and its boxes, measured in cells.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct GridSpec {
    pub size: usize,
    pub box_rows: usize,
    pub box_columns: usize,
}

/// A logical step supported on a sized Classic grid.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum SizedTechnique {
    NakedSingle,
    HiddenSingle,
    LockedCandidate,
}

/// The houses and candidate cells that account for a logical step.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct SizedDeduction {
    pub technique: SizedTechnique,
    pub houses: Vec<House>,
    pub candidates: Vec<Candidate>,
    pub actions: Vec<HintAction>,
}

/// Logical steps supported at a position, in technique order.
#[derive(Debug)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct SizedHints {
    pub candidates: Vec<u16>,
    pub choices: Vec<SizedDeduction>,
}

/// A position and the deduction that follows it, when one exists.
#[derive(Debug)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct SizedTracePosition {
    pub digits: Vec<u8>,
    pub eliminations: Vec<u16>,
    pub candidates: Vec<u16>,
    pub deduction: Option<SizedDeduction>,
}

/// A compiled rectangular box layout. All coordinates and house indices are zero based.
#[derive(Debug)]
pub struct SizedGrid {
    spec: GridSpec,
    full_mask: u16,
    memberships: Vec<[usize; 3]>,
    houses: Vec<Vec<usize>>,
}

impl SizedGrid {
    /// Build a layout for 4–16 digits. Each box must have exactly one cell per digit.
    pub fn new(spec: GridSpec) -> Option<Self> {
        let GridSpec {
            size,
            box_rows,
            box_columns,
        } = spec;
        if !(4..=MAX_SIZE).contains(&size)
            || box_rows < 2
            || box_columns < 2
            || box_rows.checked_mul(box_columns) != Some(size)
        {
            return None;
        }
        let mut houses: Vec<_> = (0..3 * size).map(|_| Vec::with_capacity(size)).collect();
        let memberships = (0..size * size)
            .map(|cell| {
                let (row, column) = (cell / size, cell % size);
                let region = (row / box_rows) * (size / box_columns) + column / box_columns;
                let memberships = [row, size + column, 2 * size + region];
                for house in memberships {
                    houses[house].push(cell);
                }
                memberships
            })
            .collect();
        Some(Self {
            spec,
            full_mask: u16::MAX >> (MAX_SIZE - size),
            memberships,
            houses,
        })
    }

    /// Number of cells in row-major order.
    pub fn cell_count(&self) -> usize {
        self.memberships.len()
    }

    /// Compute candidates from placed digits. A zero mask in an empty cell signals a dead end.
    /// Return `None` when the grid has the wrong length or contains a conflict.
    pub fn candidates(&self, digits: &[u8]) -> Option<Vec<u16>> {
        let used = self.used_digits(digits)?;
        Some(
            digits
                .iter()
                .enumerate()
                .map(|(cell, &digit)| {
                    if digit == 0 {
                        self.available(cell, &used)
                    } else {
                        0
                    }
                })
                .collect(),
        )
    }

    /// Classify the grid by counting at most two completions.
    pub fn analyze(&self, digits: &[u8], node_budget: u32) -> Analysis {
        self.search(digits, node_budget, 2).0
    }

    /// Find one completion. A found completion makes no claim about uniqueness.
    pub fn solve(&self, digits: &[u8], node_budget: u32) -> Option<Vec<u8>> {
        self.search(digits, node_budget, 1).1
    }

    /// Find the next supported deduction using the player's established candidate eliminations.
    /// Return `None` for a conflict, a dead end, or a position with no supported step.
    pub fn next_deduction(&self, digits: &[u8], eliminations: &[u16]) -> Option<SizedDeduction> {
        self.hints(digits, eliminations, 1)?.choices.pop()
    }

    /// Find several supported deductions and return the masks used to find them.
    pub fn hints(&self, digits: &[u8], eliminations: &[u16], limit: usize) -> Option<SizedHints> {
        self.find_hints(digits, eliminations, limit, false)
    }

    /// Replay a deterministic logical path. The last position has no following deduction.
    pub fn trace(
        &self,
        mut digits: Vec<u8>,
        mut eliminations: Vec<u16>,
        singles_only: bool,
    ) -> Option<Vec<SizedTracePosition>> {
        let mut trace = Vec::new();
        loop {
            let mut hints = self.find_hints(&digits, &eliminations, 1, singles_only)?;
            let deduction = hints.choices.pop();
            trace.push(SizedTracePosition {
                digits: digits.clone(),
                eliminations: eliminations.clone(),
                candidates: hints.candidates,
                deduction,
            });
            let Some(step) = &trace.last()?.deduction else {
                return Some(trace);
            };
            for action in &step.actions {
                match *action {
                    HintAction::Place(Candidate { cell, digit }) => digits[cell] = digit,
                    HintAction::Eliminate(Candidate { cell, digit }) => {
                        eliminations[cell] |= 1 << (digit - 1)
                    }
                }
            }
        }
    }

    fn find_hints(
        &self,
        digits: &[u8],
        eliminations: &[u16],
        limit: usize,
        singles_only: bool,
    ) -> Option<SizedHints> {
        if eliminations.len() != self.cell_count()
            || eliminations.iter().any(|mask| mask & !self.full_mask != 0)
        {
            return None;
        }
        let used = self.used_digits(digits)?;
        let masks: Vec<_> = digits
            .iter()
            .zip(eliminations)
            .enumerate()
            .map(|(cell, (&digit, &removed))| {
                if digit == 0 {
                    self.available(cell, &used) & !removed
                } else {
                    0
                }
            })
            .collect();
        if digits
            .iter()
            .zip(&masks)
            .any(|(&digit, &mask)| digit == 0 && mask == 0)
            || self.houses.iter().zip(&used).any(|(cells, &placed)| {
                cells
                    .iter()
                    .fold(placed, |supported, &cell| supported | masks[cell])
                    != self.full_mask
            })
        {
            return None;
        }
        let mut choices = Vec::new();
        for (cell, &mask) in masks.iter().enumerate() {
            if choices.len() == limit {
                break;
            }
            if mask.is_power_of_two() {
                choices.push(self.single(SizedTechnique::NakedSingle, cell, mask, vec![]));
            }
        }
        let mut hidden_placements = [0; MAX_SIZE * MAX_SIZE];
        for (house, cells) in self.houses.iter().enumerate() {
            if choices.len() == limit {
                break;
            }
            let (mut seen, mut repeated) = (0, 0);
            for &cell in cells {
                repeated |= seen & masks[cell];
                seen |= masks[cell];
            }
            let mut unique = seen & !repeated;
            while unique != 0 && choices.len() < limit {
                let bit = 1 << unique.trailing_zeros();
                unique ^= bit;
                let cell = cells.iter().copied().find(|&cell| masks[cell] & bit != 0)?;
                if hidden_placements[cell] & bit == 0 {
                    hidden_placements[cell] |= bit;
                    choices.push(self.single(
                        SizedTechnique::HiddenSingle,
                        cell,
                        bit,
                        vec![self.house(house)],
                    ));
                }
            }
        }
        if !singles_only && choices.len() < limit {
            self.locked_candidates(&masks, &mut choices, limit);
        }
        Some(SizedHints {
            candidates: masks,
            choices,
        })
    }

    fn single(
        &self,
        technique: SizedTechnique,
        cell: usize,
        bit: u16,
        houses: Vec<House>,
    ) -> SizedDeduction {
        let candidate = Candidate {
            cell,
            digit: bit.trailing_zeros() as u8 + 1,
        };
        SizedDeduction {
            technique,
            houses,
            candidates: vec![candidate],
            actions: vec![HintAction::Place(candidate)],
        }
    }

    fn locked_candidates(&self, masks: &[u16], choices: &mut Vec<SizedDeduction>, limit: usize) {
        let size = self.spec.size;
        for (source, cells) in self.houses.iter().enumerate() {
            for digit in 1..=size as u8 {
                let bit = 1 << (digit - 1);
                let support: Vec<_> = cells
                    .iter()
                    .copied()
                    .filter(|&cell| masks[cell] & bit != 0)
                    .collect();
                if support.len() < 2 {
                    continue;
                }
                let first = support[0];
                for target in self.memberships[first] {
                    // Only consider row/box and column/box intersections.
                    if (source < 2 * size) == (target < 2 * size) {
                        continue;
                    }
                    if support
                        .iter()
                        .any(|&cell| !self.memberships[cell].contains(&target))
                    {
                        continue;
                    }
                    let actions: Vec<_> = self.houses[target]
                        .iter()
                        .copied()
                        .filter(|&cell| {
                            masks[cell] & bit != 0 && !self.memberships[cell].contains(&source)
                        })
                        .map(|cell| HintAction::Eliminate(Candidate { cell, digit }))
                        .collect();
                    if !actions.is_empty() {
                        choices.push(SizedDeduction {
                            technique: SizedTechnique::LockedCandidate,
                            houses: vec![self.house(source), self.house(target)],
                            candidates: support
                                .iter()
                                .copied()
                                .map(|cell| Candidate { cell, digit })
                                .collect(),
                            actions,
                        });
                        if choices.len() == limit {
                            return;
                        }
                    }
                }
            }
        }
    }

    fn house(&self, index: usize) -> House {
        let size = self.spec.size;
        match index / size {
            0 => House::Row(index),
            1 => House::Column(index - size),
            _ => House::Box(index - 2 * size),
        }
    }

    fn used_digits(&self, digits: &[u8]) -> Option<[u16; 3 * MAX_SIZE]> {
        if digits.len() != self.cell_count() {
            return None;
        }
        let mut used = [0; 3 * MAX_SIZE];
        for (cell, &digit) in digits.iter().enumerate() {
            if digit == 0 {
                continue;
            }
            if usize::from(digit) > self.spec.size {
                return None;
            }
            let bit = 1 << (digit - 1);
            if self.available(cell, &used) & bit == 0 {
                return None;
            }
            self.toggle(cell, bit, &mut used);
        }
        Some(used)
    }

    fn available(&self, cell: usize, used: &[u16; 3 * MAX_SIZE]) -> u16 {
        let [row, column, region] = self.memberships[cell];
        self.full_mask & !(used[row] | used[column] | used[region])
    }

    fn toggle(&self, cell: usize, bit: u16, used: &mut [u16; 3 * MAX_SIZE]) {
        for house in self.memberships[cell] {
            used[house] ^= bit;
        }
    }

    fn search(&self, digits: &[u8], budget: u32, limit: u8) -> (Analysis, Option<Vec<u8>>) {
        self.search_with(digits, budget, limit, |_| true)
    }

    fn search_with(
        &self,
        digits: &[u8],
        budget: u32,
        limit: u8,
        mut permits: impl FnMut(&[u8]) -> bool,
    ) -> (Analysis, Option<Vec<u8>>) {
        let Some(mut used) = self.used_digits(digits) else {
            return (Analysis::Conflict, None);
        };
        let mut search = Search {
            grid: self,
            budget,
            limit,
            count: 0,
            first: None,
        };
        let completed = search.visit(&mut digits.to_vec(), &mut used, &mut permits);
        let outcome = match (completed, search.count) {
            (None, _) => Analysis::SearchLimit,
            (_, 0) => Analysis::Unsolvable,
            (_, 1) => Analysis::Unique,
            _ => Analysis::Multiple,
        };
        (outcome, search.first)
    }
}

struct Search<'a> {
    grid: &'a SizedGrid,
    budget: u32,
    limit: u8,
    count: u8,
    first: Option<Vec<u8>>,
}

impl Search<'_> {
    fn visit(
        &mut self,
        digits: &mut [u8],
        used: &mut [u16; 3 * MAX_SIZE],
        permits: &mut impl FnMut(&[u8]) -> bool,
    ) -> Option<()> {
        self.budget = self.budget.checked_sub(1)?;
        if !permits(digits) {
            return Some(());
        }
        let mut next = None;
        let mut fewest = u32::MAX;
        for (cell, &digit) in digits.iter().enumerate() {
            if digit != 0 {
                continue;
            }
            let mask = self.grid.available(cell, used);
            let count = mask.count_ones();
            if count < fewest {
                next = Some((cell, mask));
                fewest = count;
            }
            if count == 0 {
                return Some(());
            }
        }
        let Some((cell, mut choices)) = next else {
            self.count += 1;
            self.first.get_or_insert_with(|| digits.to_vec());
            return Some(());
        };
        while choices != 0 && self.count < self.limit {
            let offset = choices.trailing_zeros();
            let bit = 1 << offset;
            choices ^= bit;
            digits[cell] = offset as u8 + 1;
            self.grid.toggle(cell, bit, used);
            let result = self.visit(digits, used, permits);
            self.grid.toggle(cell, bit, used);
            digits[cell] = 0;
            result?;
        }
        Some(())
    }
}
