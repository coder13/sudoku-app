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

// Drawing paths do not change a puzzle's logical identity. Keep them in the
// public canonical definition, but ignore them when excluding played puzzles.
#[cfg(any(feature = "generation", test))]
pub(super) fn generation_key(puzzle: &VariantPuzzle) -> VariantPuzzle {
    let mut logical = puzzle.clone();
    // Whispers constrains neighboring pairs, independently of path direction,
    // segmentation or repeated edges. Keep this normalization private to played
    // exclusions; public definitions and proof indices retain the original paths.
    let mut whispers = std::collections::BTreeMap::<[usize; 2], u8>::new();
    logical.rules.retain(|rule| {
        if let PuzzleRule::Whispers {
            cells,
            min_difference,
        } = rule
        {
            for edge in cells.windows(2) {
                let mut pair = [edge[0], edge[1]];
                pair.sort_unstable();
                whispers
                    .entry(pair)
                    .and_modify(|gap| *gap = (*gap).max(*min_difference))
                    .or_insert(*min_difference);
            }
            false
        } else {
            true
        }
    });
    logical
        .rules
        .extend(
            whispers
                .into_iter()
                .map(|(cells, min_difference)| PuzzleRule::Whispers {
                    cells: cells.to_vec(),
                    min_difference,
                }),
        );
    for rule in &mut logical.rules {
        match rule {
            PuzzleRule::Palindrome { segments, .. }
            | PuzzleRule::Renban { segments, .. }
            | PuzzleRule::RegionSum { segments, .. } => *segments = None,
            _ => {}
        }
    }
    key_impl(&logical, true)
}

pub(super) fn key(puzzle: &VariantPuzzle) -> VariantPuzzle {
    key_impl(puzzle, false)
}

fn key_impl(puzzle: &VariantPuzzle, generation_edges: bool) -> VariantPuzzle {
    let rename_digits = puzzle.rules.iter().all(|rule| {
        matches!(
            rule,
            PuzzleRule::Diagonal { .. }
                | PuzzleRule::ExtraHouse { .. }
                | PuzzleRule::AntiKnight {}
                | PuzzleRule::AntiKing {}
                | PuzzleRule::Palindrome { .. }
                | PuzzleRule::Clone { .. }
        )
    });
    SquareTransform::ALL
        .into_iter()
        .map(|transform| {
            let mut copy = puzzle.clone();
            transform.puzzle(&mut copy);
            if generation_edges {
                for rule in &mut copy.rules {
                    if let PuzzleRule::Whispers { cells, .. } = rule {
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
            copy.rules.sort_unstable();
            copy
        })
        .min()
        .expect("there are eight grid symmetries")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn whispers(cells: &[usize], min_difference: u8) -> PuzzleRule {
        PuzzleRule::Whispers {
            cells: cells.to_vec(),
            min_difference,
        }
    }

    #[test]
    fn played_whispers_identity_uses_edges_under_every_grid_symmetry() {
        let original = VariantPuzzle {
            rules: vec![whispers(&[0, 10, 20, 10, 0], 5), whispers(&[10, 0], 4)],
            ..VariantPuzzle::classic([0; CELLS])
        };
        let expected = generation_key(&original);
        for transform in SquareTransform::ALL {
            let mut equivalent = VariantPuzzle {
                rules: vec![
                    whispers(&[20, 10], 5),
                    whispers(&[10, 0], 5),
                    whispers(&[0, 10], 5),
                ],
                ..original.clone()
            };
            transform.puzzle(&mut equivalent);
            assert_eq!(generation_key(&equivalent), expected);
        }
        // Exclusion normalization must never rewrite a source puzzle.
        let public = canonical_variant(&original).unwrap();
        assert!(
            public
                .rules
                .iter()
                .any(|rule| matches!(rule, PuzzleRule::Whispers { cells, .. } if cells.len() == 5))
        );
        assert_eq!(original.rules[0], whispers(&[0, 10, 20, 10, 0], 5));
    }

    #[test]
    fn played_whispers_identity_keeps_minimums_and_separate_edge_sets() {
        let definition = |rules| VariantPuzzle {
            rules,
            ..VariantPuzzle::classic([0; CELLS])
        };
        let original = definition(vec![whispers(&[0, 10, 20], 5)]);
        assert_ne!(
            generation_key(&original),
            generation_key(&definition(vec![whispers(&[0, 10, 20], 4)]))
        );
        assert_ne!(
            generation_key(&original),
            generation_key(&definition(vec![whispers(&[0, 10], 5)]))
        );
        assert_ne!(
            generation_key(&original),
            generation_key(&definition(vec![
                whispers(&[0, 10, 20], 5),
                whispers(&[0, 20], 5),
            ]))
        );
        // Directed increasing paths keep their existing identity.
        let thermometer = definition(vec![PuzzleRule::Thermometer {
            cells: vec![0, 10, 20],
        }]);
        let mut changed = thermometer.clone();
        changed.givens[0] = 1;
        let mut reversed = changed.clone();
        reversed.rules = vec![PuzzleRule::Thermometer {
            cells: vec![20, 10, 0],
        }];
        assert_ne!(generation_key(&changed), generation_key(&reversed));
    }
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
        if let RegionLayout::Jigsaw { regions } = &mut puzzle.regions {
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
            ExtraHouse { cells } | Parity { cells, .. } => self.unordered(cells),
            KillerCages { cages, .. } => {
                for cage in &mut *cages {
                    self.unordered(&mut cage.cells);
                }
                cages.sort_unstable();
            }
            Quadruple { top_left, digits } => {
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
            AntiKnight {} | AntiKing {} | GlobalEntropy {} => {}
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
            Xv { five, ten } => {
                self.markers(five);
                self.markers(ten);
            }
            AdjacentTotal { cells, .. } => self.unordered(cells),
            Arrow { circle, cells } => {
                *circle = self.cell(*circle);
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
            | Between { cells } => self.path(cells),
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
