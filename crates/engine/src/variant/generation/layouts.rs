use super::VariantGenerationError;
use crate::variant::symmetry::SquareTransform;
use crate::variant::{
    ClueDirection, KillerCage, MarkedPairs, Parity, PuzzleRule, VariantPuzzle, cell_mask,
    lines::valid_ray, pairs,
};
use crate::{Board, CELLS, Random, hints::digit_bit};

/// An outside clue whose value is derived from a completed grid.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum OutsideClueKind {
    /// Sum between 1 and 9 in a row or column.
    Sandwich,
    /// Sum of the prefix of length equal to its first digit.
    XSum,
    /// Count successive new maximum digits in a row or column.
    Skyscrapers,
    /// Sum a diagonal ray.
    LittleKiller,
}

impl OutsideClueKind {
    fn id(self) -> &'static str {
        match self {
            Self::Sandwich => "sandwich",
            Self::XSum => "x-sum",
            Self::Skyscrapers => "skyscrapers",
            Self::LittleKiller => "little-killer",
        }
    }
}

/// Which marker relationships to derive from a completed grid.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum MarkerFamily {
    /// Consecutive and double-ratio dots, in that order.
    Kropki,
    /// Markers for sums five and ten, in that order.
    Xv,
}

/// Locations or geometry for variant clues whose values come from the sampled solution.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(
        tag = "type",
        rename_all = "kebab-case",
        rename_all_fields = "camelCase",
        deny_unknown_fields
    )
)]
pub enum VariantClueLayout {
    /// Set the sum for each listed cage.
    KillerCages {
        /// One list of distinct cells per cage.
        cages: Vec<Vec<usize>>,
        /// Require this group of cages to cover the grid.
        #[cfg_attr(feature = "wasm-api", serde(default))]
        cover_grid: bool,
    },
    /// Form connected cages with the supplied sizes, then set their sums.
    KillerCageSizes {
        /// Number of cells in each generated cage.
        sizes: Vec<usize>,
        /// Require this group of cages to cover the grid.
        #[cfg_attr(feature = "wasm-api", serde(default))]
        cover_grid: bool,
    },
    /// Mark the parity of these cells.
    Parity {
        /// Cells to mark.
        cells: Vec<usize>,
    },
    /// Place a sign pointing to the smaller digit.
    Inequality {
        /// Pair of cells to compare.
        cells: [usize; 2],
    },
    /// Mark adjacent digit pairs meeting the chosen relationships.
    Markers {
        /// Which two relationships to mark.
        family: MarkerFamily,
        /// Negative flags for the two relationship types, in family order.
        #[cfg_attr(feature = "wasm-api", serde(default))]
        negative: [bool; 2],
        /// If present, sample this many marks. Negative rules require a full list.
        count: Option<usize>,
    },
    /// Compute the value of an outside clue at the selected location.
    Outside {
        /// Kind of outside clue.
        clue: OutsideClueKind,
        /// Full ordered ray starting at the edge.
        cells: Vec<usize>,
        /// Direction from the clue.
        direction: ClueDirection,
    },
}

impl VariantClueLayout {
    pub(super) fn rule_id(&self) -> &'static str {
        match self {
            Self::KillerCages { .. } | Self::KillerCageSizes { .. } => "killer-cages",
            Self::Parity { .. } => "parity",
            Self::Inequality { .. } => "inequality",
            Self::Markers {
                family: MarkerFamily::Kropki,
                ..
            } => "kropki",
            Self::Markers {
                family: MarkerFamily::Xv,
                ..
            } => "xv",
            Self::Outside { clue, .. } => clue.id(),
        }
    }
}

fn fixed_cage_mask(template: &VariantPuzzle) -> u128 {
    template
        .rules
        .iter()
        .filter_map(|rule| match rule {
            PuzzleRule::KillerCages { cages, .. } => Some(cages),
            _ => None,
        })
        .flatten()
        .fold(0, |mask, cage| mask | cell_mask(&cage.cells).unwrap())
}

pub(super) fn validate(
    template: &VariantPuzzle,
    layouts: &[VariantClueLayout],
) -> Result<(), VariantGenerationError> {
    use VariantClueLayout::*;
    let mut occupied = fixed_cage_mask(template);
    let mut allocated = 0;
    for (index, layout) in layouts.iter().enumerate() {
        let invalid = VariantGenerationError::InvalidLayout(index);
        match layout {
            KillerCages { cages, cover_grid } => {
                let mut cells = 0;
                for cage in cages {
                    let mask = cell_mask(cage).ok_or(invalid)?;
                    if !(1..=9).contains(&cage.len()) || mask & occupied != 0 {
                        return Err(invalid);
                    }
                    occupied |= mask;
                    cells += cage.len();
                }
                if cells == 0 || *cover_grid && cells != CELLS {
                    return Err(invalid);
                }
            }
            KillerCageSizes { sizes, cover_grid } => {
                if sizes.is_empty()
                    || sizes.len() > CELLS
                    || sizes.iter().any(|size| !(1..=9).contains(size))
                {
                    return Err(invalid);
                }
                let cells: usize = sizes.iter().sum();
                if *cover_grid && cells != CELLS {
                    return Err(invalid);
                }
                allocated += cells;
            }
            Parity { cells } => {
                if cells.is_empty() || cell_mask(cells).is_none() {
                    return Err(invalid);
                }
            }
            Inequality { cells } => {
                if cell_mask(cells).is_none() {
                    return Err(invalid);
                }
            }
            Markers {
                count, negative, ..
            } => {
                if count.is_some_and(|count| count > 288 || negative.contains(&true)) {
                    return Err(invalid);
                }
            }
            Outside {
                clue,
                cells,
                direction,
            } => {
                if !valid_ray(cells, *direction, *clue == OutsideClueKind::LittleKiller) {
                    return Err(invalid);
                }
            }
        }
        if allocated + occupied.count_ones() as usize > CELLS {
            return Err(invalid);
        }
    }
    Ok(())
}

pub(super) fn prepare(
    template: &VariantPuzzle,
    layouts: &[VariantClueLayout],
    random: &mut Random,
) -> Option<(Vec<VariantClueLayout>, Vec<u128>)> {
    let mut occupied = fixed_cage_mask(template);
    let mut peers = Vec::new();
    for layout in layouts {
        match layout {
            VariantClueLayout::KillerCages { cages, .. } => {
                for cells in cages {
                    let mask = cell_mask(cells)?;
                    occupied |= mask;
                    peers.push(mask);
                }
            }
            VariantClueLayout::Inequality { cells } => peers.push(cell_mask(cells)?),
            _ => {}
        }
    }
    let mut resolved = Vec::with_capacity(layouts.len());
    for layout in layouts {
        if let VariantClueLayout::KillerCageSizes { sizes, cover_grid } = layout {
            let cages = partition(sizes, occupied, random)?;
            for cage in &cages {
                let mask = cell_mask(cage)?;
                occupied |= mask;
                peers.push(mask);
            }
            resolved.push(VariantClueLayout::KillerCages {
                cages,
                cover_grid: *cover_grid,
            });
        } else {
            resolved.push(layout.clone());
        }
    }
    Some((resolved, peers))
}

// Consecutive cells in a row snake are orthogonally adjacent. Taking a cage
// from an end of a free run keeps the remaining cells available for later cages.
fn partition(sizes: &[usize], occupied: u128, random: &mut Random) -> Option<Vec<Vec<usize>>> {
    let symmetry = SquareTransform::ALL[random.index(SquareTransform::ALL.len())];
    let snake: Vec<_> = (0..CELLS)
        .map(|index| {
            let (row, column) = (index / 9, index % 9);
            let column = if row.is_multiple_of(2) {
                column
            } else {
                8 - column
            };
            symmetry.cell(9 * row + column)
        })
        .collect();
    let mut runs: Vec<_> = snake
        .split(|&cell| occupied & (1u128 << cell) != 0)
        .filter(|run| !run.is_empty())
        .collect();
    let mut cages = vec![Vec::new(); sizes.len()];
    let mut order: Vec<_> = (0..sizes.len()).collect();
    random.shuffle(&mut order);
    order.sort_by_key(|&index| std::cmp::Reverse(sizes[index]));
    for index in order {
        let size = sizes[index];
        let eligible: Vec<_> = runs
            .iter()
            .enumerate()
            .filter_map(|(i, run)| (run.len() >= size).then_some(i))
            .collect();
        if eligible.is_empty() {
            return None;
        }
        let run = &mut runs[eligible[random.index(eligible.len())]];
        let (take, rest) = if random.index(2) == 0 {
            run.split_at(size)
        } else {
            let (rest, take) = run.split_at(run.len() - size);
            (take, rest)
        };
        cages[index] = take.to_vec();
        *run = rest;
    }
    Some(cages)
}

pub(super) fn build(
    layouts: Vec<VariantClueLayout>,
    solution: &Board,
    random: &mut Random,
) -> Option<Vec<PuzzleRule>> {
    let mut rules = Vec::new();
    for layout in layouts {
        let rule = match layout {
            VariantClueLayout::KillerCages { cages, cover_grid } => {
                let cages = cages
                    .into_iter()
                    .map(|cells| {
                        let sum = cells.iter().map(|&cell| u16::from(solution[cell])).sum();
                        KillerCage { cells, sum }
                    })
                    .collect();
                PuzzleRule::KillerCages { cages, cover_grid }
            }
            VariantClueLayout::KillerCageSizes { .. } => {
                unreachable!("sizes resolve to cells before solving")
            }
            VariantClueLayout::Parity { cells } => {
                let (even, odd): (Vec<_>, Vec<_>) = cells
                    .into_iter()
                    .partition(|&cell| solution[cell].is_multiple_of(2));
                for (cells, parity) in [(even, Parity::Even), (odd, Parity::Odd)] {
                    if !cells.is_empty() {
                        rules.push(PuzzleRule::Parity { cells, parity });
                    }
                }
                continue;
            }
            VariantClueLayout::Inequality { cells: [a, b] } => {
                let (less, greater) = match solution[a].cmp(&solution[b]) {
                    std::cmp::Ordering::Less => (a, b),
                    std::cmp::Ordering::Greater => (b, a),
                    std::cmp::Ordering::Equal => return None,
                };
                PuzzleRule::Inequality { less, greater }
            }
            VariantClueLayout::Markers {
                family,
                negative,
                count,
            } => make_markers(family, negative, count, solution, random)?,
            VariantClueLayout::Outside {
                clue,
                cells,
                direction,
            } => outside(clue, cells, direction, solution),
        };
        rules.push(rule);
    }
    Some(rules)
}

fn make_markers(
    family: MarkerFamily,
    negative: [bool; 2],
    count: Option<usize>,
    solution: &Board,
    random: &mut Random,
) -> Option<PuzzleRule> {
    let relations = match family {
        MarkerFamily::Kropki => pairs::KROPKI,
        MarkerFamily::Xv => pairs::XV,
    };
    let mut marks: Vec<_> = pairs::orthogonal_pairs()
        .flat_map(|pair| {
            relations
                .into_iter()
                .enumerate()
                .filter_map(move |(kind, relation)| {
                    relation(solution[pair[0]], solution[pair[1]]).then_some((kind, pair))
                })
        })
        .collect();
    if let Some(count) = count {
        if count > marks.len() {
            return None;
        }
        random.shuffle(&mut marks);
        marks.truncate(count);
    }
    let mut result = negative.map(|negative| MarkedPairs {
        pairs: Vec::new(),
        negative,
    });
    for (kind, pair) in marks {
        result[kind].pairs.push(pair);
    }
    for marker in &mut result {
        marker.pairs.sort_unstable();
    }
    let [first, second] = result;
    Some(match family {
        MarkerFamily::Kropki => PuzzleRule::Kropki {
            consecutive: first,
            ratio_two: second,
        },
        MarkerFamily::Xv => PuzzleRule::Xv {
            five: first,
            ten: second,
        },
    })
}

fn outside(
    clue: OutsideClueKind,
    cells: Vec<usize>,
    direction: ClueDirection,
    solution: &Board,
) -> PuzzleRule {
    let sum = |path: &[usize]| path.iter().map(|&cell| u16::from(solution[cell])).sum();
    match clue {
        OutsideClueKind::Sandwich => {
            let bread = |&cell: &usize| digit_bit(solution[cell]) & 0b100000001 != 0;
            let first = cells.iter().position(bread).unwrap();
            let last = cells.iter().rposition(bread).unwrap();
            let sum = sum(&cells[first + 1..last]);
            PuzzleRule::Sandwich {
                cells,
                direction,
                sum,
            }
        }
        OutsideClueKind::XSum => {
            let sum = sum(&cells[..usize::from(solution[cells[0]])]);
            PuzzleRule::XSum {
                cells,
                direction,
                sum,
            }
        }
        OutsideClueKind::LittleKiller => {
            let sum = sum(&cells);
            PuzzleRule::LittleKiller {
                cells,
                direction,
                sum,
            }
        }
        OutsideClueKind::Skyscrapers => {
            let (mut tallest, mut count) = (0, 0);
            for &cell in &cells {
                if solution[cell] > tallest {
                    tallest = solution[cell];
                    count += 1;
                }
            }
            PuzzleRule::Skyscrapers {
                cells,
                direction,
                count,
            }
        }
    }
}
