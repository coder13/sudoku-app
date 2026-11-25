//! Cell shading rules used by Aqre and Aqre+ Sudoku puzzles.

use crate::{Board, CELLS};

/// Aqre rule variant.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum AqreKind {
    /// Aqre Snake uses connected shading and region counts.
    Snake,
    /// Aqre+ also constrains shaded digits in marked regions.
    Plus,
}

/// How a region determines its number of shaded cells.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)
)]
pub enum AqreCount {
    /// A printed count independent of Sudoku digits.
    Fixed { value: u8 },
    /// The digit in a cell is also the region's shaded-cell count.
    DigitCell { cell: usize },
}

/// A connected area in the authored grid-edge partition.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(deny_unknown_fields)
)]
pub struct AqreRegion {
    /// Row-major cell indices in this area.
    pub cells: Vec<usize>,
    /// Optional shaded-cell count clue for this area.
    #[cfg_attr(
        feature = "wasm-api",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub count: Option<AqreCount>,
}

/// A starting shade supplied by the puzzle author.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum AqreShade {
    /// Orange in the Sudoku Coach exports.
    Unshaded,
    /// Blue in the Sudoku Coach exports.
    Shaded,
}

/// A cell whose starting shade is fixed.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(deny_unknown_fields)
)]
pub struct AqreGivenShade {
    /// Row-major cell index.
    pub cell: usize,
    /// Required shade.
    pub shade: AqreShade,
}

/// A contradiction found in a partially or fully shaded position.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AqrePositionError {
    /// Shade values must be 0 (unknown), 1 (unshaded), or 2 (shaded).
    InvalidShade(usize),
    /// An authored starting shade was changed.
    GivenShade(usize),
    /// Four adjacent cells in a row or column share one shade.
    LongRun(usize),
    /// A marked region cannot reach its required shaded-cell count.
    RegionCount(usize),
    /// The completed set of shaded cells is disconnected.
    Disconnected,
    /// A shaded digit group does not form a consecutive, distinct set.
    NonConsecutiveDigits(usize),
}

#[derive(Clone, Debug)]
struct CompiledRegion {
    cells: Vec<usize>,
    count: Option<AqreCount>,
}

fn connected(cells: &[usize]) -> bool {
    let Some(&start) = cells.first() else {
        return false;
    };
    let mut members = [false; CELLS];
    for &cell in cells {
        members[cell] = true;
    }
    let mut reached = [false; CELLS];
    let mut pending = vec![start];
    reached[start] = true;
    while let Some(cell) = pending.pop() {
        let row = cell / 9;
        let column = cell % 9;
        for neighbor in [
            if row > 0 { Some(cell - 9) } else { None },
            if row < 8 { Some(cell + 9) } else { None },
            if column > 0 { Some(cell - 1) } else { None },
            if column < 8 { Some(cell + 1) } else { None },
        ]
        .into_iter()
        .flatten()
        {
            if members[neighbor] && !reached[neighbor] {
                reached[neighbor] = true;
                pending.push(neighbor);
            }
        }
    }
    cells.iter().all(|&cell| reached[cell])
}

#[derive(Clone, Debug)]
pub(super) struct AqreConstraint {
    kind: AqreKind,
    regions: Vec<CompiledRegion>,
    given_shades: Vec<AqreGivenShade>,
}

impl AqreConstraint {
    pub(super) fn compile(
        kind: AqreKind,
        regions: &[AqreRegion],
        given_shades: &[AqreGivenShade],
    ) -> Result<Self, ()> {
        if regions.is_empty() {
            return Err(());
        }
        let mut covered = [false; CELLS];
        let mut compiled_regions = Vec::with_capacity(regions.len());
        for region in regions {
            if region.cells.is_empty() {
                return Err(());
            }
            let mut cells = region.cells.clone();
            cells.sort_unstable();
            if cells.iter().any(|&cell| cell >= CELLS)
                || cells.windows(2).any(|pair| pair[0] == pair[1])
                || cells
                    .iter()
                    .any(|&cell| std::mem::replace(&mut covered[cell], true))
                || !connected(&cells)
            {
                return Err(());
            }
            if let Some(count) = &region.count {
                match count {
                    AqreCount::Fixed { value } if usize::from(*value) <= cells.len() => {}
                    AqreCount::DigitCell { cell } if cells.binary_search(cell).is_ok() => {}
                    _ => return Err(()),
                }
            }
            compiled_regions.push(CompiledRegion {
                cells,
                count: region.count.clone(),
            });
        }
        if covered.iter().any(|covered| !covered) {
            return Err(());
        }
        let mut fixed_cells = [false; CELLS];
        for given in given_shades {
            if given.cell >= CELLS || std::mem::replace(&mut fixed_cells[given.cell], true) {
                return Err(());
            }
        }
        if kind == AqreKind::Plus
            && compiled_regions
                .iter()
                .any(|region| !matches!(region.count, Some(AqreCount::DigitCell { .. })))
        {
            return Err(());
        }
        Ok(Self {
            kind,
            regions: compiled_regions,
            given_shades: given_shades.to_vec(),
        })
    }

    pub(super) fn check(
        &self,
        givens: &Board,
        entries: &Board,
        shades: &Board,
    ) -> Result<(), AqrePositionError> {
        for (cell, &shade) in shades.iter().enumerate() {
            if shade > 2 {
                return Err(AqrePositionError::InvalidShade(cell));
            }
        }
        for given in &self.given_shades {
            let expected = match given.shade {
                AqreShade::Unshaded => 1,
                AqreShade::Shaded => 2,
            };
            if shades[given.cell] != 0 && shades[given.cell] != expected {
                return Err(AqrePositionError::GivenShade(given.cell));
            }
        }

        for line in 0..9 {
            for start in 0..6 {
                for vertical in [false, true] {
                    let first = if vertical {
                        start * 9 + line
                    } else {
                        line * 9 + start
                    };
                    let run = if vertical {
                        (0..4).map(|offset| first + offset * 9).collect::<Vec<_>>()
                    } else {
                        (0..4).map(|offset| first + offset).collect::<Vec<_>>()
                    };
                    let shade = shades[run[0]];
                    if shade != 0 && run.iter().all(|&cell| shades[cell] == shade) {
                        return Err(AqrePositionError::LongRun(run[0]));
                    }
                }
            }
        }

        for (region_index, region) in self.regions.iter().enumerate() {
            let target = match region.count {
                Some(AqreCount::Fixed { value }) => Some(usize::from(value)),
                Some(AqreCount::DigitCell { cell }) => {
                    let digit = if entries[cell] != 0 {
                        entries[cell]
                    } else {
                        givens[cell]
                    };
                    (digit != 0).then_some(usize::from(digit))
                }
                None => None,
            };
            if let Some(target) = target {
                let shaded = region
                    .cells
                    .iter()
                    .filter(|&&cell| shades[cell] == 2)
                    .count();
                let unknown = region
                    .cells
                    .iter()
                    .filter(|&&cell| shades[cell] == 0)
                    .count();
                if shaded > target || shaded + unknown < target {
                    return Err(AqrePositionError::RegionCount(region_index));
                }
                if unknown == 0 && shaded != target {
                    return Err(AqrePositionError::RegionCount(region_index));
                }
            }

            if self.kind == AqreKind::Plus {
                let Some(AqreCount::DigitCell { cell: indicator }) = region.count else {
                    continue;
                };
                if shades[indicator] != 2 {
                    continue;
                }
                let digits: Vec<u8> = region
                    .cells
                    .iter()
                    .filter(|&&cell| shades[cell] == 2)
                    .filter_map(|&cell| {
                        let digit = if entries[cell] != 0 {
                            entries[cell]
                        } else {
                            givens[cell]
                        };
                        (digit != 0).then_some(digit)
                    })
                    .collect();
                let mut distinct = digits.clone();
                distinct.sort_unstable();
                distinct.dedup();
                if distinct.len() != digits.len() {
                    return Err(AqrePositionError::NonConsecutiveDigits(region_index));
                }
                let shaded_count = region
                    .cells
                    .iter()
                    .filter(|&&cell| shades[cell] == 2)
                    .count();
                if digits.len() == shaded_count
                    && !digits.is_empty()
                    && usize::from(*distinct.last().unwrap() - distinct[0]) + 1 != digits.len()
                {
                    return Err(AqrePositionError::NonConsecutiveDigits(region_index));
                }
            }
        }

        if shades.iter().all(|&shade| shade != 0) {
            let Some(start) = shades.iter().position(|&shade| shade == 2) else {
                return Err(AqrePositionError::Disconnected);
            };
            let mut reached = [false; CELLS];
            let mut pending = vec![start];
            reached[start] = true;
            while let Some(cell) = pending.pop() {
                let row = cell / 9;
                let column = cell % 9;
                for neighbor in [
                    if row > 0 { Some(cell - 9) } else { None },
                    if row < 8 { Some(cell + 9) } else { None },
                    if column > 0 { Some(cell - 1) } else { None },
                    if column < 8 { Some(cell + 1) } else { None },
                ]
                .into_iter()
                .flatten()
                {
                    if shades[neighbor] == 2 && !reached[neighbor] {
                        reached[neighbor] = true;
                        pending.push(neighbor);
                    }
                }
            }
            if shades
                .iter()
                .enumerate()
                .any(|(cell, &shade)| shade == 2 && !reached[cell])
            {
                return Err(AqrePositionError::Disconnected);
            }
        }
        Ok(())
    }
}

impl super::CompiledVariant {
    /// Check the player-authored shade state against the puzzle's Aqre rules.
    pub fn check_shades(&self, entries: &Board, shades: &Board) -> Result<(), AqrePositionError> {
        if self.aqre_rules.is_empty() {
            return shades
                .iter()
                .position(|&shade| shade != 0)
                .map_or(Ok(()), |cell| Err(AqrePositionError::InvalidShade(cell)));
        }
        for rule in &self.aqre_rules {
            rule.check(&self.givens, entries, shades)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{RegionLayout, VariantPuzzle, variant::PuzzleRule};

    fn row_regions(count: impl Fn(usize) -> AqreCount) -> Vec<AqreRegion> {
        (0..9)
            .map(|row| AqreRegion {
                cells: (row * 9..row * 9 + 9).collect(),
                count: Some(count(row)),
            })
            .collect()
    }

    fn compiled(
        kind: AqreKind,
        counts: Vec<AqreRegion>,
        shades: Vec<AqreGivenShade>,
    ) -> crate::CompiledVariant {
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.regions = RegionLayout::Partial {
            regions: Vec::new(),
        };
        puzzle.rules.push(PuzzleRule::Aqre {
            kind,
            regions: counts,
            given_shades: shades,
        });
        puzzle.compile().unwrap()
    }

    #[test]
    fn region_partition_and_authored_shades_are_validated_at_compile_time() {
        let regions = row_regions(|_| AqreCount::Fixed { value: 0 });
        let rule = compiled(
            AqreKind::Snake,
            regions.clone(),
            vec![AqreGivenShade {
                cell: 1,
                shade: AqreShade::Shaded,
            }],
        );
        let mut shades = [0; CELLS];
        shades[1] = 2;
        assert_eq!(
            rule.check_shades(&[0; CELLS], &shades),
            Err(AqrePositionError::RegionCount(0))
        );

        let mut incomplete = regions.clone();
        incomplete[0].cells.pop();
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.rules.push(PuzzleRule::Aqre {
            kind: AqreKind::Snake,
            regions: incomplete,
            given_shades: Vec::new(),
        });
        assert!(puzzle.compile().is_err());

        let mut overlap = regions;
        overlap[0].cells[0] = overlap[1].cells[0];
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.rules.push(PuzzleRule::Aqre {
            kind: AqreKind::Snake,
            regions: overlap,
            given_shades: Vec::new(),
        });
        assert!(puzzle.compile().is_err());
    }

    #[test]
    fn rejects_four_cell_runs_and_changes_to_authored_shades() {
        let rule = compiled(
            AqreKind::Snake,
            row_regions(|_| AqreCount::Fixed { value: 0 }),
            vec![AqreGivenShade {
                cell: 20,
                shade: AqreShade::Unshaded,
            }],
        );
        let mut shades = [0; CELLS];
        shades[0..4].fill(2);
        assert_eq!(
            rule.check_shades(&[0; CELLS], &shades),
            Err(AqrePositionError::LongRun(0))
        );
        shades = [0; CELLS];
        shades[20] = 2;
        assert_eq!(
            rule.check_shades(&[0; CELLS], &shades),
            Err(AqrePositionError::GivenShade(20))
        );
    }

    #[test]
    fn checks_completed_connectivity_and_region_counts() {
        let rule = compiled(
            AqreKind::Snake,
            row_regions(|row| AqreCount::Fixed {
                value: if row % 2 == 0 { 5 } else { 4 },
            }),
            Vec::new(),
        );
        let mut shades =
            std::array::from_fn(|cell| if (cell / 9 + cell % 9) % 2 == 0 { 2 } else { 1 });
        assert_eq!(
            rule.check_shades(&[0; CELLS], &shades),
            Err(AqrePositionError::Disconnected)
        );
        shades[0] = 1;
        assert_eq!(
            rule.check_shades(&[0; CELLS], &shades),
            Err(AqrePositionError::RegionCount(0))
        );
    }

    #[test]
    fn aqre_plus_requires_distinct_consecutive_digits_when_its_indicator_is_shaded() {
        let rule = compiled(
            AqreKind::Plus,
            row_regions(|row| AqreCount::DigitCell { cell: row * 9 }),
            Vec::new(),
        );
        let mut shades = [0; CELLS];
        for cell in [0, 2, 4, 6, 8] {
            shades[cell] = 2;
        }
        let mut entries = [0; CELLS];
        for (cell, digit) in [5, 3, 5, 7, 9].into_iter().enumerate() {
            entries[cell * 2] = digit;
        }
        assert_eq!(
            rule.check_shades(&entries, &shades),
            Err(AqrePositionError::NonConsecutiveDigits(0))
        );
        for (cell, digit) in [5, 6, 7, 8, 9].into_iter().enumerate() {
            entries[cell * 2] = digit;
        }
        assert_eq!(rule.check_shades(&entries, &shades), Ok(()));
    }
}
