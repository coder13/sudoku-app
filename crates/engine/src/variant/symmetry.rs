#[cfg(all(
    feature = "teaching",
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
use super::VariantPosition;
use super::{
    ClueDirection, MarkedPairs, PuzzleRule, RegionLayout, VariantDefinitionError, VariantPuzzle,
};
use crate::CELLS;

/// Canonical form under rotations and reflections of the grid and every rule together.
///
/// Givens may also be renamed if every rule is invariant under digit renaming.
/// For numeric rules, the key keeps the digit values, sums, and ratios.
pub fn canonical_variant(puzzle: &VariantPuzzle) -> Result<VariantPuzzle, VariantDefinitionError> {
    puzzle.compile()?;
    Ok(key(puzzle))
}

// Played-puzzle keys may normalize equivalent rule descriptions. Public
// canonical definitions keep their authored paths and group structure.
#[cfg(any(feature = "generation", test))]
mod played;

#[cfg(any(feature = "generation", test))]
pub(super) fn generation_key(puzzle: &VariantPuzzle) -> VariantPuzzle {
    played::key(puzzle)
}

pub(super) fn key(puzzle: &VariantPuzzle) -> VariantPuzzle {
    key_impl(puzzle, false, |_| {})
}

fn digit_invariant(rule: &PuzzleRule) -> bool {
    matches!(
        rule,
        PuzzleRule::Diagonal { .. }
            | PuzzleRule::ExtraHouse { .. }
            | PuzzleRule::AntiKnight {}
            | PuzzleRule::AntiKing {}
            | PuzzleRule::Palindrome { .. }
            | PuzzleRule::Clone { .. }
    )
}

fn key_impl(
    puzzle: &VariantPuzzle,
    generation_edges: bool,
    normalize: impl Fn(&mut VariantPuzzle),
) -> VariantPuzzle {
    let rename_digits = puzzle.rules.iter().all(digit_invariant);
    SquareTransform::ALL
        .into_iter()
        .map(|transform| {
            let mut copy = puzzle.clone();
            transform.puzzle(&mut copy);
            if generation_edges {
                for rule in &mut copy.rules {
                    if let PuzzleRule::Whispers { cells, .. }
                    | PuzzleRule::Entropic { cells }
                    | PuzzleRule::Modular { cells }
                    | PuzzleRule::Renban { cells, .. } = rule
                    {
                        cells.sort_unstable();
                    }
                }
            }
            if rename_digits {
                let mut renamed = [0; 10];
                let mut next = 1;
                for given in &mut copy.givens {
                    if *given == 0 {
                        continue;
                    }
                    let entry = &mut renamed[usize::from(*given)];
                    if *entry == 0 {
                        *entry = next;
                        next += 1;
                    }
                    *given = *entry;
                }
            }
            normalize(&mut copy);
            copy.rules.sort_unstable();
            copy
        })
        .min()
        .expect("there are eight grid symmetries")
}

#[derive(Clone, Copy)]
pub(crate) struct SquareTransform(usize);

impl SquareTransform {
    pub const ALL: [Self; 8] = [
        Self(0),
        Self(1),
        Self(2),
        Self(3),
        Self(4),
        Self(5),
        Self(6),
        Self(7),
    ];

    pub fn cell(self, cell: usize) -> usize {
        debug_assert!(cell < CELLS);
        let (row, column) = (cell / 9, cell % 9);
        let (row, column) = if self.0 & 1 != 0 {
            (column, row)
        } else {
            (row, column)
        };
        let row = if self.0 & 2 != 0 { 8 - row } else { row };
        let column = if self.0 & 4 != 0 { 8 - column } else { column };
        9 * row + column
    }

    #[cfg(all(
        feature = "teaching",
        feature = "wasm-api",
        any(target_arch = "wasm32", test, feature = "cli")
    ))]
    pub fn position(self, position: &mut VariantPosition) {
        self.puzzle(&mut position.puzzle);
        position.entries = self.grid(position.entries);
        position.eliminations = self.grid(position.eliminations);
    }

    pub(crate) fn grid<T: Copy>(self, original: [T; CELLS]) -> [T; CELLS] {
        let mut result = original;
        for (cell, value) in original.into_iter().enumerate() {
            result[self.cell(cell)] = value;
        }
        result
    }

    fn puzzle(self, puzzle: &mut VariantPuzzle) {
        puzzle.givens = self.grid(puzzle.givens);
        if let RegionLayout::Jigsaw { regions } | RegionLayout::Partial { regions } =
            &mut puzzle.regions
        {
            for region in &mut *regions {
                self.unordered(region);
            }
            regions.sort_unstable();
        }
        for rule in &mut puzzle.rules {
            self.rule(rule);
        }
    }

    fn direction(self, direction: ClueDirection) -> ClueDirection {
        let (dr, dc) = direction.delta();
        let endpoint = self.cell((40 + 9 * dr + dc) as usize);
        let delta = (endpoint as i8 / 9 - 4, endpoint as i8 % 9 - 4);
        ClueDirection::ALL
            .into_iter()
            .find(|direction| direction.delta() == delta)
            .expect("a square symmetry preserves compass directions")
    }

    fn path(self, cells: &mut [usize]) {
        for cell in cells {
            *cell = self.cell(*cell);
        }
    }

    fn unordered(self, cells: &mut [usize]) {
        self.path(cells);
        cells.sort_unstable();
    }

    fn markers(self, markers: &mut MarkedPairs) {
        for pair in &mut markers.pairs {
            self.unordered(pair);
        }
        markers.pairs.sort_unstable();
    }

    fn rule(self, rule: &mut PuzzleRule) {
        use PuzzleRule::*;
        match rule {
            Diagonal { diagonal } => {
                let end = match diagonal {
                    super::Diagonal::Main => 0,
                    super::Diagonal::Anti => 8,
                };
                *diagonal = if matches!(self.cell(end), 0 | 80) {
                    super::Diagonal::Main
                } else {
                    super::Diagonal::Anti
                };
            }
            ExtraHouse { cells } | Parity { cells, .. } | DigitRestriction { cells, .. } => {
                self.unordered(cells)
            }
            DistinctCells { cells, color } => {
                self.unordered(cells);
                *color = None;
            }
            Aqre {
                regions,
                given_shades,
                ..
            } => {
                for region in regions.iter_mut() {
                    self.unordered(&mut region.cells);
                    if let Some(super::AqreCount::DigitCell { cell }) = &mut region.count {
                        *cell = self.cell(*cell);
                    }
                }
                regions.sort_by(|left, right| left.cells.cmp(&right.cells));
                for given in given_shades.iter_mut() {
                    given.cell = self.cell(given.cell);
                }
                given_shades.sort_by_key(|given| given.cell);
            }
            NeighborMatch { clues } => {
                for clue in clues.iter_mut() {
                    clue.cell = self.cell(clue.cell);
                }
                clues.sort_by_key(|clue| clue.cell);
            }
            MagicSquare { cells } => self.unordered(cells),
            DistantNeighbors { marked_cells } => self.unordered(marked_cells),
            ConsecutiveRun {
                cells,
                color,
                from_bulb,
            } => {
                self.path(cells);
                if !*from_bulb && cells[0] > cells[cells.len() - 1] {
                    cells.reverse();
                }
                *color = None;
            }
            InsideGrid { rows } => {
                for row in rows.iter_mut() {
                    self.path(row);
                }
                // The lowest-index corner comes first. Swapping the inner
                // rows and columns leaves their common-set rule unchanged.
                let last = rows.len() - 1;
                if rows[last][0].min(rows[last][last]) < rows[0][0].min(rows[0][last]) {
                    rows.reverse();
                }
                if rows[0][last] < rows[0][0] {
                    for row in rows.iter_mut() {
                        row.reverse();
                    }
                }
                if rows[1][0] < rows[0][1] {
                    for i in 1..rows.len() {
                        let (top, bottom) = rows.split_at_mut(i);
                        for (j, row) in top.iter_mut().enumerate() {
                            std::mem::swap(&mut row[i], &mut bottom[0][j]);
                        }
                    }
                }
            }
            KillerCages { cages, .. } => {
                for cage in &mut *cages {
                    self.unordered(&mut cage.cells);
                }
                cages.sort_unstable();
            }
            UnknownCageSums {
                cages,
                consecutive_pairs,
            } => {
                let mut order: Vec<_> = (0..cages.len()).collect();
                for cage in cages.iter_mut() {
                    self.unordered(cage);
                }
                order.sort_by_key(|&index| cages[index].clone());
                let mut old_to_new = vec![0; cages.len()];
                for (new, &old) in order.iter().enumerate() {
                    old_to_new[old] = new;
                }
                let reordered = order
                    .into_iter()
                    .map(|index| cages[index].clone())
                    .collect();
                *cages = reordered;
                for pair in consecutive_pairs.iter_mut() {
                    pair[0] = old_to_new[pair[0]];
                    pair[1] = old_to_new[pair[1]];
                    pair.sort_unstable();
                }
                consecutive_pairs.sort_unstable();
            }
            LetteredQuadruples { clues } => {
                for clue in clues.iter_mut() {
                    let mut cells =
                        super::quadruple::cells(clue.top_left).expect("validated circle");
                    self.unordered(&mut cells);
                    clue.top_left = cells[0];
                    let mut letters: Vec<_> = clue.letters.bytes().collect();
                    letters.sort_unstable();
                    clue.letters = String::from_utf8(letters).expect("validated letters");
                }
                clues.sort_unstable();
            }
            Quadruple { top_left, digits } | QuadrupleSum { top_left, digits } => {
                let mut cells = super::quadruple::cells(*top_left).expect("validated Quadruple");
                self.unordered(&mut cells);
                *top_left = cells[0];
                digits.sort_unstable();
            }
            Clone { groups } => {
                for group in &mut *groups {
                    self.unordered(group);
                }
                groups.sort_unstable();
            }
            AntiKnight {} | AntiKing {} => {}
            GlobalEntropy { groups } => {
                for group in &mut *groups {
                    group.sort_unstable();
                }
                groups.sort_unstable();
            }
            EntropyWindowGroup { cells, .. } => self.unordered(cells),
            NonConsecutive { except } => {
                for cells in &mut *except {
                    self.unordered(cells);
                }
                except.sort_unstable();
                except.dedup();
            }
            Inequality { less, greater } => {
                *less = self.cell(*less);
                *greater = self.cell(*greater);
            }
            Kropki {
                consecutive,
                ratio_two,
            } => {
                self.markers(consecutive);
                self.markers(ratio_two);
            }
            Minimum { cells, .. } | Maximum { cells, .. } => self.unordered(cells),
            LabeledDots { marks, .. } => {
                for mark in &mut *marks {
                    self.unordered(&mut mark.cells);
                }
                marks.sort_unstable();
            }
            Xv { five, ten } => {
                self.markers(five);
                self.markers(ten);
            }
            AdjacentTotal { cells, .. } => self.unordered(cells),
            Arrow { circle, cells } => {
                *circle = self.cell(*circle);
                self.path(cells);
            }
            PillArrow { pill, cells, .. } => {
                self.path(pill);
                self.path(cells);
            }
            Palindrome { cells, segments }
            | Renban { cells, segments }
            | RegionSum {
                cells, segments, ..
            } => {
                self.path(cells);
                if let Some(segments) = segments {
                    for segment in segments {
                        self.path(segment);
                    }
                }
            }
            Thermometer { cells }
            | Entropic { cells }
            | Modular { cells }
            | Whispers { cells, .. }
            | DigitOrder { cells, .. }
            | Lockout { cells }
            | Between { cells } => self.path(cells),
            ForbiddenEntropicConnection { cells } => self.path(cells),
            Sandwich {
                cells, direction, ..
            }
            | LittleKiller {
                cells, direction, ..
            }
            | XSum {
                cells, direction, ..
            }
            | Skyscrapers {
                cells, direction, ..
            } => {
                self.path(cells);
                *direction = self.direction(*direction);
            }
        }
    }
}
