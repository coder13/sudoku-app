mod arrow;
mod coupled_sums;
mod crust;
mod double_arrow;
mod equal_sums;
mod fractional_regions;
mod grouped_line;
mod killer;
mod line_assignments;
mod linked_double_arrow;
mod little_killer;
mod nonogram;
mod pairs;
mod quadruple;
mod quadruple_overlap;
mod region_sum;
mod row_equation;
mod sandwich;
mod skyscrapers;
mod x_sum;
mod zipper;

use super::{GridSpec, MAX_SIZE, SizedDeduction, SizedGrid};
pub use crate::variant::{Diagonal as SizedDiagonal, MarkedPairs, Parity as SizedParity};
use crate::{Analysis, Candidate, ClueDirection, HintAction, House};

use self::arrow::Arrow;
use self::coupled_sums::CoupledSums;
use self::crust::Crust;
pub use self::crust::CrustClue;
use self::double_arrow::DoubleArrow;
use self::equal_sums::EqualSums;
use self::fractional_regions::FractionalRegions;
use self::grouped_line::EntropicLine;
use self::killer::Cage;
use self::line_assignments::LineAssignments;
pub use self::line_assignments::SizedLineType;
use self::linked_double_arrow::LinkedDoubleArrow;
pub use self::linked_double_arrow::SizedSumEnd;
use self::little_killer::LittleKiller;
use self::nonogram::NonogramLine;
pub use self::nonogram::RunAxis;
use self::pairs::{RowColumnSum, SizedPairLink, UnmarkedSumSupport, compile_pairs};
use self::quadruple::SizedQuadruple;
use self::region_sum::RegionSum;
pub use self::row_equation::EquationOperator;
use self::row_equation::{RowEquation, RowEquationTables};
use self::sandwich::Sandwich;
use self::skyscrapers::SkyscrapersLine;
use self::x_sum::XSum;
use self::x_sum::XSumDot;
use self::zipper::ZipperLine;

const MAX_CELLS: usize = MAX_SIZE * MAX_SIZE;

fn entropy_group_masks(size: usize, authored: &[Vec<u8>]) -> Option<[u16; 3]> {
    if authored.is_empty() {
        return (size == 9).then_some([0b000000111, 0b000111000, 0b111000000]);
    }
    if authored.len() != 3 {
        return None;
    }
    let mut groups = [0u16; 3];
    let mut seen = 0u16;
    for (group, digits) in authored.iter().enumerate() {
        if digits.is_empty() {
            return None;
        }
        for &digit in digits {
            if digit == 0 || usize::from(digit) > size {
                return None;
            }
            let bit = 1 << (digit - 1);
            if seen & bit != 0 {
                return None;
            }
            seen |= bit;
            groups[group] |= bit;
        }
    }
    (seen == (1 << size) - 1).then_some(groups)
}

/// Rules on a sized grid. Thermometer cells are listed from the bulb to the tip.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SizedConstraint {
    AntiKnight,
    AntiKing,
    Zipper {
        cells: Vec<usize>,
    },
    Diagonal(SizedDiagonal),
    ExtraHouse {
        cells: Vec<usize>,
    },
    Parity {
        cells: Vec<usize>,
        parity: SizedParity,
    },
    DigitRestriction {
        cells: Vec<usize>,
        digits: Vec<u8>,
    },
    Thermometer {
        cells: Vec<usize>,
    },
    SlowThermometer {
        cells: Vec<usize>,
    },
    Between {
        cells: Vec<usize>,
    },
    Whispers {
        cells: Vec<usize>,
        min_difference: u8,
    },
    ParityLine {
        cells: Vec<usize>,
    },
    Palindrome {
        cells: Vec<usize>,
    },
    /// Corresponding cells in each group must contain equal digits.
    Clone {
        groups: Vec<Vec<usize>>,
    },
    NonConsecutive {
        except: Vec<[usize; 2]>,
    },
    Inequality {
        less: usize,
        greater: usize,
    },
    Minimum {
        cells: Vec<usize>,
        ignore_marked_neighbors: bool,
    },
    Maximum {
        cells: Vec<usize>,
        ignore_marked_neighbors: bool,
    },
    Modular {
        cells: Vec<usize>,
    },
    Entropic {
        cells: Vec<usize>,
        groups: Vec<Vec<u8>>,
    },
    GlobalEntropy {
        groups: Vec<Vec<u8>>,
    },
    Xv {
        five: MarkedPairs,
        ten: MarkedPairs,
    },
    AdjacentTotal {
        cells: [usize; 2],
        sum: u8,
    },
    Sandwich {
        cells: Vec<usize>,
        direction: crate::ClueDirection,
        sum: u16,
    },
    XSum {
        cells: Vec<usize>,
        direction: crate::ClueDirection,
        sum: u16,
    },
    XSumDot {
        ends: [SizedSumEnd; 2],
        relation: XSumDotRelation,
    },
    Arrow {
        circle: usize,
        cells: Vec<usize>,
    },
    DoubleArrow {
        ends: [usize; 2],
        cells: Vec<usize>,
    },
    LinkedDoubleArrow {
        ends: [SizedSumEnd; 2],
        cells: Vec<usize>,
    },
    KillerCages {
        cages: Vec<crate::variant::KillerCage>,
        cover_grid: bool,
    },
    RegionSum {
        cells: Vec<usize>,
        group_by_region: bool,
    },
    LineAssignments {
        paths: Vec<Vec<usize>>,
        types: Vec<SizedLineType>,
    },
    Renban {
        cells: Vec<usize>,
    },
    Kropki {
        consecutive: MarkedPairs,
        ratio_two: MarkedPairs,
    },
    CornerKropki {
        consecutive: Vec<usize>,
        ratio_two: Vec<usize>,
    },
    Quadruple {
        top_left: usize,
        digits: Vec<u8>,
    },
    LabeledDots {
        relation: SizedDotRelation,
        marks: Vec<SizedLabeledDot>,
        negative: bool,
    },
    Nonogram {
        axis: RunAxis,
        index: usize,
        digits: Vec<u8>,
        runs: Vec<u8>,
    },
    Skyscrapers {
        direction: ClueDirection,
        index: usize,
        count: u8,
    },
    AntiSum {
        sum: u8,
    },
    RowColumnSum {
        pairs: Vec<[usize; 2]>,
        require_unmarked: bool,
    },
    RowEquation {
        cells: Vec<usize>,
        operators: Vec<EquationOperator>,
    },
    FractionalRegions {
        pieces: Vec<Vec<usize>>,
    },
    LittleKiller {
        direction: crate::variant::ClueDirection,
        cells: Vec<usize>,
        sum: u16,
    },
    Difference {
        cells: [usize; 2],
        difference: u8,
    },
    Crust {
        clues: Vec<CrustClue>,
        shared_region: Option<[usize; 2]>,
        fixed_edges: Vec<[usize; 2]>,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Ord, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum SizedDotRelation {
    Difference,
    Ratio,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Ord, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum XSumDotRelation {
    Consecutive,
    Ratio,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Ord, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(deny_unknown_fields)
)]
pub struct SizedLabeledDot {
    pub cells: [usize; 2],
    pub value: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum SizedKropkiRelation {
    Consecutive,
    RatioTwo,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct SizedKropkiPair {
    pub cells: [usize; 2],
    pub relation: SizedKropkiRelation,
    pub negative: bool,
    #[cfg_attr(feature = "wasm-api", serde(skip_serializing_if = "Option::is_none"))]
    pub value: Option<u8>,
}

/// A deduction from a standard house or one authored rule.
#[derive(Debug)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case")
)]
pub enum SizedConstraintStep {
    House {
        proof: SizedDeduction,
    },
    Rule {
        rule: usize,
        actions: Vec<HintAction>,
    },
    Kropki {
        rule: usize,
        pair: SizedKropkiPair,
        actions: Vec<HintAction>,
    },
    QuadrupleOverlap {
        rules: [usize; 2],
        cells: Vec<usize>,
        actions: Vec<HintAction>,
    },
    AntiSum {
        rule: usize,
        cells: [usize; 2],
        actions: Vec<HintAction>,
    },
    RowColumnSum {
        rule: usize,
        cells: [usize; 2],
        unmarked: bool,
        actions: Vec<HintAction>,
    },
    CoupledSums {
        rules: [usize; 2],
        totals: Vec<[u16; 2]>,
        actions: Vec<HintAction>,
    },
    Contradiction {
        assumption: Candidate,
        placements: Vec<Candidate>,
        failure: SizedConstraintFailure,
    },
}

#[derive(Debug)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case")
)]
pub enum SizedConstraintFailure {
    Cell {
        cell: usize,
    },
    MissingDigit {
        house: House,
        digit: u8,
    },
    RepeatedDigit {
        house: House,
        digit: u8,
    },
    Rule {
        rule: usize,
    },
    KillerCage {
        rule: usize,
        cage: usize,
    },
    Kropki {
        rule: usize,
        pair: SizedKropkiPair,
    },
    AntiSum {
        rule: usize,
        cells: [usize; 2],
    },
    RowColumnSum {
        rule: usize,
        cells: Option<[usize; 2]>,
    },
    CoupledSums {
        rules: [usize; 2],
    },
}

#[derive(Debug)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct SizedConstraintHints {
    pub candidates: Vec<u16>,
    pub choices: Vec<SizedConstraintStep>,
}

#[derive(Debug)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct SizedConstraintTracePosition {
    pub digits: Vec<u8>,
    pub eliminations: Vec<u16>,
    pub candidates: Vec<u16>,
    pub deduction: Option<SizedConstraintStep>,
}

/// A compiled grid with a jointly enforced list of sized rules.
#[derive(Debug)]
pub struct SizedConstraintGrid {
    layout: SizedGrid,
    value_offset: u8,
    rules: Vec<SizedConstraint>,
    parity: Vec<(usize, u16)>,
    diagonals: Vec<Vec<usize>>,
    extra_houses: Vec<Vec<usize>>,
    thermometers: Vec<(Vec<usize>, bool)>,
    between_lines: Vec<Vec<usize>>,
    renbans: Vec<Vec<usize>>,
    arrows: Vec<Option<Arrow>>,
    double_arrows: Vec<Option<DoubleArrow>>,
    region_sums: Vec<Option<RegionSum>>,
    nonograms: Vec<Option<NonogramLine>>,
    skyscrapers: Vec<Option<SkyscrapersLine>>,
    row_equations: Vec<Option<RowEquation>>,
    fractional_regions: Vec<Option<FractionalRegions>>,
    little_killers: Vec<Option<LittleKiller>>,
    quadruples: Vec<Option<SizedQuadruple>>,
    cages: Vec<Vec<Cage>>,
    linked_double_arrows: Vec<Option<LinkedDoubleArrow>>,
    pair_links: Vec<Vec<SizedPairLink>>,
    row_column_sums: Vec<Option<RowColumnSum>>,
    sandwiches: Vec<Option<Sandwich>>,
    x_sums: Vec<Option<XSum>>,
    x_sum_dots: Vec<Option<XSumDot>>,
    crust: Option<Crust>,
    global_entropy: Vec<Option<([u16; 3], Vec<[usize; 4]>)>>,
    entropic_lines: Vec<Option<EntropicLine>>,
    zippers: Vec<Option<ZipperLine>>,
    equal_sums: Vec<Option<EqualSums>>,
    line_assignments: Vec<Option<LineAssignments>>,
    coupled_sums: Vec<CoupledSums>,
}

fn parity_mask(parity: SizedParity, value_offset: u8) -> u16 {
    if (parity == SizedParity::Odd) ^ (value_offset == 1) {
        0x5555
    } else {
        0xaaaa
    }
}

impl SizedConstraintGrid {
    pub fn new(spec: GridSpec, rules: &[SizedConstraint]) -> Option<Self> {
        Self::with_layout(SizedGrid::new(spec)?, rules)
    }

    /// Compile the rules against an existing rectangular or irregular layout.
    pub fn with_layout(layout: SizedGrid, rules: &[SizedConstraint]) -> Option<Self> {
        Self::with_layout_and_values(layout, rules, false)
    }

    /// Candidate rank zero is always blank. In a zero-based alphabet rank one has value zero.
    pub(crate) fn with_layout_and_values(
        layout: SizedGrid,
        rules: &[SizedConstraint],
        zero_based: bool,
    ) -> Option<Self> {
        let size = layout.size();
        let value_offset = u8::from(zero_based);
        let mut parity = vec![layout.full_mask; layout.cell_count()];
        let mut diagonals = Vec::new();
        let mut extra_houses = Vec::new();
        let mut thermometers = Vec::new();
        let mut between_lines = Vec::new();
        let mut renbans = Vec::new();
        let mut arrows = Vec::new();
        let mut double_arrows = Vec::new();
        let mut linked_double_arrows = Vec::new();
        let mut region_sums = Vec::new();
        let mut nonograms = Vec::new();
        let mut skyscrapers = Vec::new();
        let mut row_equations = Vec::new();
        let mut fractional_regions = Vec::new();
        let mut little_killers = Vec::new();
        let mut row_equation_tables = RowEquationTables::default();
        let mut row_column_sums = Vec::new();
        let mut sandwiches = Vec::new();
        let mut x_sums = Vec::new();
        let mut x_sum_dots = Vec::new();
        let mut crust = None;
        let mut global_entropy = Vec::new();
        let mut entropic_lines = Vec::new();
        let mut zippers = Vec::new();
        let mut equal_sums = Vec::new();
        let mut line_assignments = Vec::new();
        let mut cages = Vec::new();
        let mut occupied = [false; MAX_SIZE * MAX_SIZE];
        for (index, rule) in rules.iter().enumerate() {
            match rule {
                SizedConstraint::Diagonal(direction) => {
                    let diagonal = diagonal_cells(size, *direction).collect();
                    if !diagonals.contains(&diagonal) {
                        diagonals.push(diagonal);
                    }
                }
                SizedConstraint::ExtraHouse { cells } => {
                    let mut seen = [false; MAX_SIZE * MAX_SIZE];
                    if cells.len() != size
                        || cells.iter().any(|&cell| {
                            cell >= layout.cell_count() || std::mem::replace(&mut seen[cell], true)
                        })
                    {
                        return None;
                    }
                    extra_houses.push(cells.clone());
                }
                SizedConstraint::Parity {
                    cells,
                    parity: kind,
                } => {
                    if cells.is_empty() {
                        return None;
                    }
                    let mask = parity_mask(*kind, value_offset);
                    for &cell in cells {
                        *parity.get_mut(cell)? &= mask;
                    }
                }
                SizedConstraint::DigitRestriction { cells, digits } => {
                    if cells.is_empty() || digits.is_empty() {
                        return None;
                    }
                    let mut mask = 0;
                    for &digit in digits {
                        if digit == 0 || usize::from(digit) > size {
                            return None;
                        }
                        mask |= 1 << (digit - 1);
                    }
                    let mut seen = [false; MAX_CELLS];
                    for &cell in cells {
                        if std::mem::replace(seen.get_mut(cell)?, true) {
                            return None;
                        }
                        *parity.get_mut(cell)? &= mask;
                    }
                }
                SizedConstraint::Thermometer { cells } => {
                    if !(2..=size).contains(&cells.len())
                        || cells.iter().enumerate().any(|(index, &cell)| {
                            cell >= layout.cell_count() || cells[..index].contains(&cell)
                        })
                    {
                        return None;
                    }
                    thermometers.push((cells.clone(), false));
                }
                SizedConstraint::SlowThermometer { cells } => {
                    if !(2..=size).contains(&cells.len())
                        || cells.iter().enumerate().any(|(index, &cell)| {
                            cell >= layout.cell_count() || cells[..index].contains(&cell)
                        })
                    {
                        return None;
                    }
                    thermometers.push((cells.clone(), true));
                }
                SizedConstraint::Between { cells } => {
                    if !(3..=size * size).contains(&cells.len())
                        || cells.iter().enumerate().any(|(index, &cell)| {
                            cell >= layout.cell_count() || cells[..index].contains(&cell)
                        })
                    {
                        return None;
                    }
                    between_lines.push(cells.clone());
                }
                SizedConstraint::Whispers {
                    cells,
                    min_difference,
                } => {
                    if cells.len() < 2
                        || cells.len() > size * size
                        || *min_difference == 0
                        || *min_difference as usize >= size
                        || cells.iter().any(|&cell| cell >= layout.cell_count())
                        || cells.windows(2).any(|pair| pair[0] == pair[1])
                    {
                        return None;
                    }
                }
                SizedConstraint::Arrow { circle, cells } => {
                    arrows.resize_with(index + 1, || None);
                    arrows[index] = Some(Arrow::compile(&layout, *circle, cells, value_offset)?);
                }
                SizedConstraint::DoubleArrow { ends, cells } => {
                    double_arrows.resize_with(index + 1, || None);
                    double_arrows[index] = Some(DoubleArrow::compile(&layout, *ends, cells)?);
                }
                SizedConstraint::LinkedDoubleArrow { ends, cells } => {
                    linked_double_arrows.resize_with(index + 1, || None);
                    linked_double_arrows[index] =
                        Some(LinkedDoubleArrow::compile(&layout, *ends, cells)?);
                }
                SizedConstraint::KillerCages {
                    cages: authored,
                    cover_grid,
                } => {
                    cages.resize_with(index + 1, Vec::new);
                    for cage in authored {
                        cages[index].push(Cage::compile(&layout, cage, &mut occupied)?);
                    }
                    if authored.is_empty()
                        || *cover_grid
                            && authored.iter().map(|cage| cage.cells.len()).sum::<usize>()
                                != layout.cell_count()
                    {
                        return None;
                    }
                }
                SizedConstraint::RegionSum {
                    cells,
                    group_by_region,
                } => {
                    region_sums.resize_with(index + 1, || None);
                    region_sums[index] = Some(RegionSum::compile(
                        &layout,
                        cells,
                        *group_by_region,
                        value_offset,
                    )?);
                    equal_sums.resize_with(index + 1, || None);
                    equal_sums[index] = Some(EqualSums::region_sum(
                        &layout,
                        cells,
                        *group_by_region,
                        value_offset,
                    )?);
                }
                SizedConstraint::LineAssignments { paths, types } => {
                    line_assignments.resize_with(index + 1, || None);
                    line_assignments[index] = Some(LineAssignments::compile(
                        &layout,
                        paths,
                        types,
                        value_offset,
                    )?);
                }
                SizedConstraint::Nonogram {
                    axis,
                    index: house,
                    digits,
                    runs,
                } => {
                    nonograms.resize_with(index + 1, || None);
                    nonograms[index] =
                        Some(NonogramLine::compile(size, *axis, *house, digits, runs)?);
                }
                SizedConstraint::Skyscrapers {
                    direction,
                    index: line,
                    count,
                } => {
                    skyscrapers.resize_with(index + 1, || None);
                    skyscrapers[index] =
                        Some(SkyscrapersLine::compile(size, *direction, *line, *count)?);
                }
                SizedConstraint::RowEquation { cells, operators } => {
                    row_equations.resize_with(index + 1, || None);
                    row_equations[index] = Some(RowEquation::compile(
                        &layout,
                        cells,
                        operators,
                        0,
                        &mut row_equation_tables,
                    )?);
                }
                SizedConstraint::FractionalRegions { pieces } => {
                    fractional_regions.resize_with(index + 1, || None);
                    fractional_regions[index] =
                        Some(FractionalRegions::compile(&layout, pieces, 0)?);
                }
                SizedConstraint::LittleKiller {
                    direction,
                    cells,
                    sum,
                } => {
                    little_killers.resize_with(index + 1, || None);
                    little_killers[index] =
                        Some(LittleKiller::compile(size, *direction, cells, *sum, 0)?);
                }
                SizedConstraint::XSum {
                    direction,
                    cells,
                    sum,
                } => {
                    x_sums.resize_with(index + 1, || None);
                    x_sums[index] =
                        Some(XSum::compile(size, *direction, cells, *sum, value_offset)?);
                }
                SizedConstraint::XSumDot { ends, relation } => {
                    x_sum_dots.resize_with(index + 1, || None);
                    x_sum_dots[index] =
                        Some(XSumDot::compile(&layout, *ends, *relation, value_offset)?);
                }
                SizedConstraint::Renban { cells } => {
                    if !(1..=size).contains(&cells.len())
                        || cells.iter().enumerate().any(|(index, &cell)| {
                            cell >= layout.cell_count() || cells[..index].contains(&cell)
                        })
                    {
                        return None;
                    }
                    renbans.push(cells.clone());
                }
                SizedConstraint::GlobalEntropy { groups } => {
                    let groups = entropy_group_masks(size, groups)?;
                    let mut windows = Vec::new();
                    for row in 0..size - 1 {
                        for column in 0..size - 1 {
                            let top_left = row * size + column;
                            windows.push([
                                top_left,
                                top_left + 1,
                                top_left + size,
                                top_left + size + 1,
                            ]);
                        }
                    }
                    global_entropy.resize_with(index + 1, || None);
                    global_entropy[index] = Some((groups, windows));
                }
                SizedConstraint::Entropic { cells, groups } => {
                    let groups = entropy_group_masks(size, groups)?;
                    let line = EntropicLine::compile(cells, groups, layout.cell_count())?;
                    entropic_lines.resize_with(index + 1, || None);
                    entropic_lines[index] = Some(line);
                }
                SizedConstraint::Zipper { cells } => {
                    let line = ZipperLine::compile(cells, layout.cell_count())?;
                    zippers.resize_with(index + 1, || None);
                    zippers[index] = Some(line);
                    equal_sums.resize_with(index + 1, || None);
                    equal_sums[index] = Some(EqualSums::zipper(&layout, cells)?);
                }
                SizedConstraint::Kropki { .. }
                | SizedConstraint::NonConsecutive { .. }
                | SizedConstraint::Inequality { .. }
                | SizedConstraint::Minimum { .. }
                | SizedConstraint::Maximum { .. }
                | SizedConstraint::CornerKropki { .. }
                | SizedConstraint::Difference { .. }
                | SizedConstraint::LabeledDots { .. }
                | SizedConstraint::AntiSum { .. }
                | SizedConstraint::AntiKnight
                | SizedConstraint::AntiKing
                | SizedConstraint::ParityLine { .. }
                | SizedConstraint::Palindrome { .. }
                | SizedConstraint::Clone { .. }
                | SizedConstraint::Modular { .. }
                | SizedConstraint::Quadruple { .. }
                | SizedConstraint::Xv { .. }
                | SizedConstraint::AdjacentTotal { .. } => {}
                SizedConstraint::RowColumnSum {
                    pairs,
                    require_unmarked,
                } => {
                    row_column_sums.resize_with(index + 1, || None);
                    row_column_sums[index] = Some(RowColumnSum::compile(
                        size,
                        pairs,
                        *require_unmarked,
                        rules,
                    )?);
                }
                SizedConstraint::Sandwich {
                    cells,
                    direction,
                    sum,
                } => {
                    sandwiches.resize_with(index + 1, || None);
                    sandwiches[index] = Some(Sandwich::compile(
                        size,
                        cells,
                        *direction,
                        *sum,
                        value_offset,
                    )?);
                }
                SizedConstraint::Crust {
                    clues,
                    shared_region,
                    fixed_edges,
                } => {
                    if crust.is_some() || layout.has_regions() {
                        return None;
                    }
                    crust = Some(Crust::compile(&layout, clues, *shared_region, fixed_edges)?);
                }
            }
        }
        let mut quadruples = Vec::new();
        for (index, rule) in rules.iter().enumerate() {
            if let SizedConstraint::Quadruple { top_left, digits } = rule {
                quadruples.resize_with(index + 1, || None);
                quadruples[index] = Some(SizedQuadruple::compile(
                    &layout,
                    *top_left,
                    digits,
                    &diagonals,
                    &extra_houses,
                )?);
            }
        }
        let parity = parity
            .into_iter()
            .enumerate()
            .filter(|(_, mask)| *mask != layout.full_mask)
            .collect();
        let pair_links = compile_pairs(size, rules, value_offset)?;
        let coupled_sums = CoupledSums::compile(&equal_sums);
        Some(Self {
            layout,
            value_offset,
            rules: rules.to_vec(),
            parity,
            diagonals,
            extra_houses,
            thermometers,
            between_lines,
            renbans,
            arrows,
            double_arrows,
            region_sums,
            nonograms,
            skyscrapers,
            row_equations,
            fractional_regions,
            little_killers,
            quadruples,
            cages,
            linked_double_arrows,
            pair_links,
            row_column_sums,
            sandwiches,
            x_sums,
            x_sum_dots,
            crust,
            global_entropy,
            entropic_lines,
            zippers,
            equal_sums,
            line_assignments,
            coupled_sums,
        })
    }

    /// Count at most two completions under every supplied rule.
    pub fn analyze(&self, digits: &[u8], budget: u32) -> Analysis {
        self.search(digits, budget, 2).0
    }

    /// Find a completion which satisfies every active rule.
    /// Return a completion only after counting exactly one solution.
    pub fn solve_unique(&self, digits: &[u8], budget: u32) -> Result<Vec<u8>, Analysis> {
        let (analysis, first) = self.search(digits, budget, 2);
        if analysis == Analysis::Unique {
            first.ok_or(Analysis::Unsolvable)
        } else {
            Err(analysis)
        }
    }

    pub fn solve(&self, digits: &[u8], budget: u32) -> Option<Vec<u8>> {
        self.search(digits, budget, 1).1
    }

    /// Recover the connected inferred region partition for a complete Crust grid.
    pub fn inferred_regions(
        &self,
        digits: &[u8],
        budget: u32,
    ) -> Result<Vec<Vec<usize>>, Analysis> {
        let crust = self.crust.as_ref().ok_or(Analysis::Conflict)?;
        if digits.contains(&0) || self.layout.used_digits(digits).is_none() || !self.permits(digits)
        {
            return Err(Analysis::Conflict);
        }
        let mut remaining = budget;
        crust
            .partition(digits, &mut remaining)?
            .ok_or(Analysis::Conflict)
    }

    /// Apply the placed digits and propagate support through overlapping rules.
    pub fn candidates(&self, digits: &[u8]) -> Result<Option<Vec<u16>>, Analysis> {
        self.candidates_with_budget(digits, crate::SEARCH_LIMIT)
    }

    /// Compute candidates without treating an exhausted Crust partition
    /// search as a contradiction.
    pub fn candidates_with_budget(
        &self,
        digits: &[u8],
        budget: u32,
    ) -> Result<Option<Vec<u16>>, Analysis> {
        let Some(mut candidates) = self.layout.candidates(digits) else {
            return Ok(None);
        };
        if !self.permits(digits) {
            return Ok(None);
        }
        if let Some(crust) = &self.crust
            && !digits.contains(&0)
        {
            let mut crust_budget = budget;
            match crust.partition(digits, &mut crust_budget)? {
                Some(_) => {}
                None => return Ok(None),
            }
        }
        for (cell, &digit) in digits.iter().enumerate() {
            if digit != 0 {
                candidates[cell] = 1 << (digit - 1);
            }
        }
        if !self.apply_rules(digits, &mut candidates) {
            return Ok(None);
        }
        for (cell, &digit) in digits.iter().enumerate() {
            if digit != 0 {
                candidates[cell] = 0;
            }
        }
        Ok(Some(candidates))
    }

    fn apply_rules(&self, digits: &[u8], candidates: &mut [u16]) -> bool {
        for &(cell, mask) in &self.parity {
            candidates[cell] &= mask;
        }
        for cells in &self.diagonals {
            let used = cells
                .iter()
                .filter(|&&cell| digits[cell] != 0)
                .fold(0, |used, &cell| used | candidates[cell]);
            for &cell in cells {
                if digits[cell] == 0 {
                    candidates[cell] &= !used;
                }
            }
        }
        loop {
            let mut changed = false;
            for cells in &self.extra_houses {
                let support = extra_house_support(cells, candidates, self.layout.full_mask);
                for (&cell, mask) in cells.iter().zip(support) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for (cells, allow_equal) in &self.thermometers {
                changed |= self.restrict_thermometer(cells, candidates, *allow_equal);
            }
            for cells in &self.between_lines {
                let Some(support) = self.between_support(cells, candidates) else {
                    return false;
                };
                for (&cell, mask) in cells.iter().zip(support) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for cells in &self.renbans {
                for (&cell, &mask) in cells.iter().zip(&self.renban_masks(cells, candidates)) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for (groups, windows) in self.global_entropy.iter().flatten() {
                for cells in windows {
                    let support = crate::variant::global_entropy::support_in_groups(
                        cells.map(|cell| candidates[cell]),
                        *groups,
                    );
                    if support.contains(&0) {
                        return false;
                    }
                    for (&cell, mask) in cells.iter().zip(support) {
                        changed |= candidates[cell] != mask;
                        candidates[cell] = mask;
                    }
                }
            }
            for arrow in self.arrows.iter().flatten() {
                let (bulb, shaft) = arrow.support(candidates);
                changed |= candidates[arrow.circle] != bulb;
                candidates[arrow.circle] = bulb;
                for (&cell, mask) in arrow.cells.iter().zip(shaft) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for arrow in self.double_arrows.iter().flatten() {
                let (end_masks, line_masks) = arrow.support(candidates);
                for (&cell, mask) in arrow
                    .ends
                    .iter()
                    .zip(end_masks)
                    .chain(arrow.cells.iter().zip(line_masks))
                {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for arrow in self.linked_double_arrows.iter().flatten() {
                let mut supported = [0; MAX_SIZE * MAX_SIZE];
                arrow.support(candidates, &mut supported);
                for &cell in &arrow.cells {
                    changed |= candidates[cell] != supported[cell];
                    candidates[cell] = supported[cell];
                }
            }
            for clue in self.quadruples.iter().flatten() {
                let Some(support) = clue.support(candidates) else {
                    return false;
                };
                for (cell, mask) in clue.cells.into_iter().zip(support) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for cage in self.cages.iter().flatten() {
                let support = cage.support(candidates);
                for (&cell, mask) in cage.cells.iter().zip(support) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for line in self.region_sums.iter().flatten() {
                let mut supported = [0; MAX_SIZE * MAX_SIZE];
                line.support(candidates, &mut supported);
                for cell in line.cells() {
                    changed |= candidates[cell] != supported[cell];
                    candidates[cell] = supported[cell];
                }
            }
            for constraint in self.line_assignments.iter().flatten() {
                let Some(support) = constraint.support(candidates) else {
                    return false;
                };
                if support.surviving == 0 {
                    return false;
                }
                for &cell in &constraint.cells {
                    changed |= candidates[cell] != support.masks[cell];
                    candidates[cell] = support.masks[cell];
                }
            }
            for equation in self.row_equations.iter().flatten() {
                let Some(support) = equation.support(candidates) else {
                    return false;
                };
                for (&cell, mask) in equation.cells.iter().zip(support) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for partition in self.fractional_regions.iter().flatten() {
                for piece in &partition.pieces {
                    let mut supported = [0; MAX_SIZE * MAX_SIZE];
                    if !partition.support(piece, candidates, &mut supported) {
                        return false;
                    }
                    for cell in piece.cells() {
                        changed |= candidates[cell] != supported[cell];
                        candidates[cell] = supported[cell];
                    }
                }
            }
            for clue in self.little_killers.iter().flatten() {
                let Some(supported) = clue.support(candidates) else {
                    return false;
                };
                for (&cell, mask) in clue.cells.iter().zip(supported) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for line in self.nonograms.iter().flatten() {
                let Some(support) = line.support(candidates) else {
                    return false;
                };
                for (&cell, mask) in line.cells.iter().zip(support) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for line in self.skyscrapers.iter().flatten() {
                let Some(support) = line.support(candidates) else {
                    return false;
                };
                for (&cell, mask) in line.cells.iter().zip(support) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for line in self.entropic_lines.iter().flatten() {
                let Some(support) = line.support(candidates) else {
                    return false;
                };
                for (&cell, mask) in line.cells.iter().zip(support) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for line in self.zippers.iter().flatten() {
                let mut support = [0; MAX_CELLS];
                if !line.support(candidates, &mut support) {
                    return false;
                }
                for &cell in &line.cells {
                    changed |= candidates[cell] != support[cell];
                    candidates[cell] = support[cell];
                }
            }
            for pair in &self.coupled_sums {
                let Some(support) = pair.support(&self.equal_sums, candidates) else {
                    return false;
                };
                for &cell in &pair.cells {
                    changed |= candidates[cell] != support.masks[cell];
                    candidates[cell] = support.masks[cell];
                }
            }
            for link in self.pair_links.iter().flatten() {
                let before = link.constraint.cells.map(|cell| candidates[cell]);
                let supported = link.constraint.restrict(before);
                changed |= before != supported;
                for (cell, mask) in link.constraint.cells.into_iter().zip(supported) {
                    candidates[cell] = mask;
                }
            }
            for layer in self.row_column_sums.iter().flatten() {
                for link in &layer.marked {
                    let before = link.cells.map(|cell| candidates[cell]);
                    let masks = link.restrict(before);
                    changed |= before != masks;
                    for (cell, mask) in link.cells.into_iter().zip(masks) {
                        candidates[cell] = mask;
                    }
                }
                match layer.unmarked_support(candidates) {
                    UnmarkedSumSupport::Impossible => return false,
                    UnmarkedSumSupport::One { cells, masks } => {
                        changed |= cells.map(|cell| candidates[cell]) != masks;
                        for (cell, mask) in cells.into_iter().zip(masks) {
                            candidates[cell] = mask;
                        }
                    }
                    UnmarkedSumSupport::Unrestricted => {}
                }
            }
            for sandwich in self.sandwiches.iter().flatten() {
                let mut supported = [0; MAX_SIZE * MAX_SIZE];
                if !sandwich.support(candidates, &mut supported) {
                    return false;
                }
                for cell in sandwich.cells() {
                    changed |= candidates[cell] != supported[cell];
                    candidates[cell] = supported[cell];
                }
            }
            for x_sum in self.x_sums.iter().flatten() {
                let mut supported = [0; MAX_SIZE * MAX_SIZE];
                if !x_sum.support(candidates, &mut supported) {
                    return false;
                }
                for cell in x_sum.cells() {
                    changed |= candidates[cell] != supported[cell];
                    candidates[cell] = supported[cell];
                }
            }
            for x_sum_dot in self.x_sum_dots.iter().flatten() {
                let mut supported = [0; MAX_SIZE * MAX_SIZE];
                if !x_sum_dot.support(candidates, &mut supported) {
                    return false;
                }
                for cell in x_sum_dot.cells() {
                    changed |= candidates[cell] != supported[cell];
                    candidates[cell] = supported[cell];
                }
            }
            if let Some(crust) = &self.crust {
                let Some(narrowed) = crust.restrict(candidates) else {
                    return false;
                };
                changed |= narrowed;
            }
            if !changed {
                return true;
            }
        }
    }

    fn restrict_thermometer(
        &self,
        cells: &[usize],
        candidates: &mut [u16],
        allow_equal: bool,
    ) -> bool {
        let mut changed = false;
        let mut lower = self.layout.full_mask;
        for &cell in cells {
            let mask = candidates[cell] & lower;
            changed |= mask != candidates[cell];
            candidates[cell] = mask;
            lower = u16::MAX
                .checked_shl(mask.trailing_zeros() + u32::from(!allow_equal))
                .unwrap_or(0);
        }
        let mut upper = self.layout.full_mask;
        for &cell in cells.iter().rev() {
            let mask = candidates[cell] & upper;
            changed |= mask != candidates[cell];
            candidates[cell] = mask;
            upper = if mask == 0 {
                0
            } else {
                let highest = 1u16 << (u16::BITS - 1 - mask.leading_zeros());
                if allow_equal {
                    highest | (highest - 1)
                } else {
                    highest - 1
                }
            };
        }
        changed
    }

    fn between_support(&self, cells: &[usize], candidates: &[u16]) -> Option<[u16; MAX_SIZE]> {
        let size = self.layout.size();
        let mut support = [0; MAX_SIZE];
        for low in 1..=size {
            let low_bit = 1u16 << (low - 1);
            if candidates[cells[0]] & low_bit == 0 && candidates[*cells.last()?] & low_bit == 0 {
                continue;
            }
            for high in low + 2..=size {
                let high_bit = 1u16 << (high - 1);
                if candidates[*cells.last()?] & high_bit != 0 {
                    let inside = ((1u16 << (high - 1)) - 1) & !((1u16 << low) - 1);
                    if cells[1..cells.len() - 1]
                        .iter()
                        .all(|&cell| candidates[cell] & inside != 0)
                    {
                        support[0] |= low_bit;
                        support[cells.len() - 1] |= high_bit;
                        for (index, &cell) in cells[1..cells.len() - 1].iter().enumerate() {
                            support[index + 1] |= candidates[cell] & inside;
                        }
                    }
                }
                if candidates[cells[0]] & high_bit != 0 && candidates[*cells.last()?] & low_bit != 0
                {
                    let inside = ((1u16 << (high - 1)) - 1) & !((1u16 << low) - 1);
                    if cells[1..cells.len() - 1]
                        .iter()
                        .all(|&cell| candidates[cell] & inside != 0)
                    {
                        support[cells.len() - 1] |= low_bit;
                        support[0] |= high_bit;
                        for (index, &cell) in cells[1..cells.len() - 1].iter().enumerate() {
                            support[index + 1] |= candidates[cell] & inside;
                        }
                    }
                }
            }
        }
        support[..cells.len()]
            .iter()
            .all(|&mask| mask != 0)
            .then_some(support)
    }

    fn renban_masks(&self, cells: &[usize], candidates: &[u16]) -> [u16; MAX_SIZE] {
        let mut domains = [0; MAX_SIZE];
        let mut support = [0; MAX_SIZE];
        for (slot, &cell) in domains.iter_mut().zip(cells) {
            *slot = candidates[cell];
        }
        let domains = &domains[..cells.len()];
        let masks = &mut support[..cells.len()];
        let size = self.layout.size();
        if size <= 6 {
            crate::variant::renban_support::<6, 64>(domains, masks);
        } else if size <= 9 || cells.len() <= 3 {
            crate::variant::renban_support::<9, 512>(domains, masks);
        } else {
            crate::variant::wide_renban_support(size, domains, masks);
        }
        support
    }

    /// Match each rule against the same candidate snapshot so a hint can identify
    /// the clue which justifies its actions.
    pub fn hints(
        &self,
        digits: &[u8],
        eliminations: &[u16],
        limit: usize,
    ) -> Option<SizedConstraintHints> {
        let mut hints = self.find_hints(digits, eliminations, limit, false)?;
        self.quadruple_overlap_hints(digits, &hints.candidates, &mut hints.choices, limit);
        if hints.choices.is_empty() && limit != 0 {
            hints
                .choices
                .extend(self.contradiction(digits, eliminations, &hints.candidates));
        }
        Some(hints)
    }

    fn find_hints(
        &self,
        digits: &[u8],
        eliminations: &[u16],
        limit: usize,
        singles_only: bool,
    ) -> Option<SizedConstraintHints> {
        let candidates = self.layout.hint_candidates(digits, eliminations)?;
        if !self.permits(digits) {
            return None;
        }
        let mut choices = Vec::new();
        let mut domains = candidates.clone();
        for (cell, &digit) in digits.iter().enumerate() {
            if digit != 0 {
                domains[cell] = 1 << (digit - 1);
            }
        }
        for (rule, constraint) in self.rules.iter().enumerate() {
            if choices.len() == limit {
                break;
            }
            let mut actions = Vec::new();
            match constraint {
                SizedConstraint::Diagonal(direction) => {
                    let cells = diagonal_cells(self.layout.size(), *direction);
                    let used = cells
                        .clone()
                        .filter(|&cell| digits[cell] != 0)
                        .fold(0, |used, cell| used | domains[cell]);
                    for cell in cells.clone().filter(|&cell| digits[cell] == 0) {
                        eliminations_for(cell, domains[cell] & used, &mut actions);
                    }
                    if actions.is_empty() {
                        for digit in 1..=self.layout.size() as u8 {
                            let bit = 1 << (digit - 1);
                            if used & bit != 0 {
                                continue;
                            }
                            let mut places = cells.clone().filter(|&cell| domains[cell] & bit != 0);
                            let cell = places.next()?;
                            if places.next().is_none() {
                                choices.push(SizedConstraintStep::Rule {
                                    rule,
                                    actions: vec![HintAction::Place(Candidate { cell, digit })],
                                });
                                if choices.len() == limit {
                                    break;
                                }
                            }
                        }
                    }
                }
                SizedConstraint::Parity { cells, parity } => {
                    let excluded = !parity_mask(*parity, self.value_offset);
                    for &cell in cells {
                        eliminations_for(cell, candidates[cell] & excluded, &mut actions);
                    }
                    actions.sort_unstable();
                    actions.dedup();
                }
                SizedConstraint::DigitRestriction { cells, digits } => {
                    let allowed = digits
                        .iter()
                        .fold(0u16, |mask, digit| mask | (1 << (digit - 1)));
                    for &cell in cells {
                        eliminations_for(cell, candidates[cell] & !allowed, &mut actions);
                    }
                }
                SizedConstraint::Thermometer { cells }
                | SizedConstraint::SlowThermometer { cells } => {
                    let mut support = domains.clone();
                    self.restrict_thermometer(
                        cells,
                        &mut support,
                        matches!(constraint, SizedConstraint::SlowThermometer { .. }),
                    );
                    if support.contains(&0) {
                        return None;
                    }
                    for &cell in cells {
                        eliminations_for(cell, candidates[cell] & !support[cell], &mut actions);
                    }
                }
                SizedConstraint::Between { cells } => {
                    let support = self.between_support(cells, &domains)?;
                    for (&cell, mask) in cells.iter().zip(support) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::DoubleArrow { ends, cells } => {
                    let (end_masks, line_masks) =
                        self.double_arrows[rule].as_ref()?.hint_support(&domains);
                    if end_masks.contains(&0) {
                        return None;
                    }
                    for (&cell, mask) in ends
                        .iter()
                        .zip(end_masks)
                        .chain(cells.iter().zip(line_masks))
                    {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::Arrow { circle, .. } => {
                    let arrow = self.arrows[rule].as_ref()?;
                    let (bulb, shaft) = arrow.support(&domains);
                    if bulb == 0 {
                        return None;
                    }
                    eliminations_for(*circle, candidates[*circle] & !bulb, &mut actions);
                    for (&cell, mask) in arrow.cells.iter().zip(shaft) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::ExtraHouse { cells } => {
                    let support = extra_house_support(cells, &domains, self.layout.full_mask);
                    for (&cell, mask) in cells.iter().zip(support) {
                        if mask == 0 {
                            return None;
                        }
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::LinkedDoubleArrow { .. } => {
                    let arrow = self.linked_double_arrows[rule].as_ref()?;
                    let mut supported = [0; MAX_SIZE * MAX_SIZE];
                    if !arrow.support(&domains, &mut supported) {
                        return None;
                    }
                    for &cell in &arrow.cells {
                        eliminations_for(cell, candidates[cell] & !supported[cell], &mut actions);
                    }
                }
                SizedConstraint::Quadruple { .. } => {
                    let clue = self.quadruples[rule].as_ref()?;
                    for (cell, mask) in clue.cells.into_iter().zip(clue.support(&domains)?) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::KillerCages { .. } => {
                    for cage in &self.cages[rule] {
                        let mut cage_actions = Vec::new();
                        let support = cage.support(&domains);
                        if support[..cage.cells.len()].contains(&0) {
                            return None;
                        }
                        for (&cell, mask) in cage.cells.iter().zip(support) {
                            eliminations_for(cell, candidates[cell] & !mask, &mut cage_actions);
                        }
                        if !cage_actions.is_empty() {
                            choices.push(SizedConstraintStep::Rule {
                                rule,
                                actions: cage_actions,
                            });
                            if choices.len() == limit {
                                break;
                            }
                        }
                    }
                }
                SizedConstraint::RegionSum { cells, .. } => {
                    let line = self.region_sums[rule].as_ref()?;
                    let mut supported = [0; MAX_SIZE * MAX_SIZE];
                    if !line.support(&domains, &mut supported) {
                        return None;
                    }
                    for &cell in cells {
                        eliminations_for(cell, candidates[cell] & !supported[cell], &mut actions);
                    }
                }
                SizedConstraint::LineAssignments { .. } => {
                    let constraint = self.line_assignments[rule].as_ref()?;
                    let support = constraint.support(&domains)?;
                    for &cell in &constraint.cells {
                        eliminations_for(
                            cell,
                            candidates[cell] & !support.masks[cell],
                            &mut actions,
                        );
                    }
                }
                SizedConstraint::Nonogram { .. } => {
                    let line = self.nonograms[rule].as_ref()?;
                    for (&cell, mask) in line.cells.iter().zip(line.support(&domains)?) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::Skyscrapers { .. } => {
                    let line = self.skyscrapers[rule].as_ref()?;
                    for (&cell, mask) in line.cells.iter().zip(line.support(&domains)?) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::RowEquation { cells, .. } => {
                    let support = self.row_equations[rule].as_ref()?.support(&domains)?;
                    for (&cell, mask) in cells.iter().zip(support) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::FractionalRegions { .. } => {
                    let partition = self.fractional_regions[rule].as_ref()?;
                    for piece in &partition.pieces {
                        let mut supported = [0; MAX_SIZE * MAX_SIZE];
                        if !partition.support(piece, &domains, &mut supported) {
                            return None;
                        }
                        for cell in piece.cells() {
                            eliminations_for(
                                cell,
                                candidates[cell] & !supported[cell],
                                &mut actions,
                            );
                        }
                    }
                }
                SizedConstraint::LittleKiller { .. } => {
                    let clue = self.little_killers[rule].as_ref()?;
                    let supported = clue.support(&domains)?;
                    for (&cell, mask) in clue.cells.iter().zip(supported) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::Renban { cells } => {
                    let support = self.renban_masks(cells, &domains);
                    for (&cell, &mask) in cells.iter().zip(&support) {
                        if mask == 0 {
                            return None;
                        }
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::GlobalEntropy { .. } => {
                    let (groups, windows) = self.global_entropy[rule].as_ref()?;
                    for cells in windows {
                        let support = crate::variant::global_entropy::support_in_groups(
                            cells.map(|cell| domains[cell]),
                            *groups,
                        );
                        if support.contains(&0) {
                            return None;
                        }
                        for (&cell, mask) in cells.iter().zip(support) {
                            eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                        }
                    }
                }
                SizedConstraint::Entropic { .. } => {
                    let line = self.entropic_lines[rule].as_ref()?;
                    let support = line.support(&domains)?;
                    for (&cell, mask) in line.cells.iter().zip(support) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::Zipper { .. } => {
                    let line = self.zippers[rule].as_ref()?;
                    let mut support = [0; MAX_CELLS];
                    if !line.support(&domains, &mut support) {
                        return None;
                    }
                    for &cell in &line.cells {
                        eliminations_for(cell, candidates[cell] & !support[cell], &mut actions);
                    }
                }
                SizedConstraint::RowColumnSum { .. } => {
                    let layer = self.row_column_sums[rule].as_ref()?;
                    let witness = match layer.unmarked_support(&domains) {
                        UnmarkedSumSupport::Impossible => return None,
                        UnmarkedSumSupport::One { cells, masks } => Some((cells, masks, true)),
                        UnmarkedSumSupport::Unrestricted => None,
                    };
                    let marked = layer.marked.iter().map(|link| {
                        (
                            link.cells,
                            link.restrict(link.cells.map(|cell| domains[cell])),
                            false,
                        )
                    });
                    for (cells, masks, unmarked) in marked.chain(witness) {
                        if masks.contains(&0) {
                            return None;
                        }
                        let mut actions = Vec::new();
                        for (cell, mask) in cells.into_iter().zip(masks) {
                            eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                        }
                        if !actions.is_empty() {
                            choices.push(SizedConstraintStep::RowColumnSum {
                                rule,
                                cells,
                                unmarked,
                                actions,
                            });
                            if choices.len() == limit {
                                break;
                            }
                        }
                    }
                }
                SizedConstraint::Sandwich { .. } => {
                    let sandwich = self.sandwiches[rule].as_ref()?;
                    let mut supported = [0; MAX_SIZE * MAX_SIZE];
                    if !sandwich.support(&domains, &mut supported) {
                        return None;
                    }
                    for cell in sandwich.cells() {
                        eliminations_for(cell, candidates[cell] & !supported[cell], &mut actions);
                    }
                }
                SizedConstraint::XSum { cells, .. } => {
                    let x_sum = self.x_sums[rule].as_ref()?;
                    let mut supported = [0; MAX_SIZE * MAX_SIZE];
                    if !x_sum.support(&domains, &mut supported) {
                        return None;
                    }
                    for &cell in cells {
                        eliminations_for(cell, candidates[cell] & !supported[cell], &mut actions);
                    }
                }
                SizedConstraint::XSumDot { .. } => {
                    let x_sum_dot = self.x_sum_dots[rule].as_ref()?;
                    let mut supported = [0; MAX_SIZE * MAX_SIZE];
                    if !x_sum_dot.support(&domains, &mut supported) {
                        return None;
                    }
                    for cell in x_sum_dot.cells() {
                        eliminations_for(cell, candidates[cell] & !supported[cell], &mut actions);
                    }
                }
                SizedConstraint::Difference { .. } => {
                    let link = self.pair_links[rule].first()?;
                    let support = link.supports(&domains);
                    if support.contains(&0) {
                        return None;
                    }
                    for (cell, mask) in link.constraint.cells.into_iter().zip(support) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::Kropki { .. }
                | SizedConstraint::CornerKropki { .. }
                | SizedConstraint::LabeledDots { .. }
                | SizedConstraint::AntiSum { .. } => {
                    for link in &self.pair_links[rule] {
                        let support = link.supports(&domains);
                        if support.contains(&0) {
                            return None;
                        }
                        let mut actions = Vec::new();
                        for (cell, mask) in link.constraint.cells.into_iter().zip(support) {
                            eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                        }
                        if !actions.is_empty() {
                            let step = if let Some(pair) = link.kropki_proof() {
                                SizedConstraintStep::Kropki {
                                    rule,
                                    pair,
                                    actions,
                                }
                            } else {
                                SizedConstraintStep::AntiSum {
                                    rule,
                                    cells: link.constraint.cells,
                                    actions,
                                }
                            };
                            choices.push(step);
                            if choices.len() == limit {
                                break;
                            }
                        }
                    }
                }
                SizedConstraint::Xv { .. }
                | SizedConstraint::AdjacentTotal { .. }
                | SizedConstraint::Whispers { .. }
                | SizedConstraint::ParityLine { .. }
                | SizedConstraint::Palindrome { .. }
                | SizedConstraint::Clone { .. }
                | SizedConstraint::NonConsecutive { .. }
                | SizedConstraint::Inequality { .. }
                | SizedConstraint::Minimum { .. }
                | SizedConstraint::Maximum { .. }
                | SizedConstraint::AntiKnight
                | SizedConstraint::AntiKing
                | SizedConstraint::Modular { .. } => {
                    for link in &self.pair_links[rule] {
                        let support = link.supports(&domains);
                        if support.contains(&0) {
                            return None;
                        }
                        for (cell, mask) in link.constraint.cells.into_iter().zip(support) {
                            eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                        }
                    }
                    actions.sort_unstable();
                    actions.dedup();
                }
                SizedConstraint::Crust { .. } => {
                    let crust = self.crust.as_ref()?;
                    let mut support = domains.clone();
                    crust.restrict(&mut support)?;
                    for (cell, (&candidate, &supported)) in
                        candidates.iter().zip(&support).enumerate()
                    {
                        eliminations_for(cell, candidate & !supported, &mut actions);
                    }
                }
            }
            if !actions.is_empty() {
                choices.push(SizedConstraintStep::Rule { rule, actions });
            }
        }
        if choices.len() < limit {
            for pair in &self.coupled_sums {
                let mut totals = Vec::new();
                let support = pair.support_with_totals(&self.equal_sums, &domains, &mut totals)?;
                if !support.exact {
                    // The candidate propagator used a conservative fallback
                    // after its joint-search budget. Do not present partial
                    // totals as a complete deduction to the player.
                    continue;
                }
                let mut actions = Vec::new();
                for &cell in &pair.cells {
                    eliminations_for(cell, candidates[cell] & !support.masks[cell], &mut actions);
                }
                if !actions.is_empty() {
                    choices.push(SizedConstraintStep::CoupledSums {
                        rules: pair.rules,
                        totals,
                        actions,
                    });
                    if choices.len() == limit {
                        break;
                    }
                }
            }
        }
        let remaining = limit - choices.len();
        if remaining != 0 {
            choices.extend(
                self.layout
                    .hint_choices(&candidates, remaining, singles_only)?
                    .into_iter()
                    .map(|proof| SizedConstraintStep::House { proof }),
            );
        }
        Some(SizedConstraintHints {
            candidates,
            choices,
        })
    }

    pub fn trace(
        &self,
        mut digits: Vec<u8>,
        mut eliminations: Vec<u16>,
        singles_only: bool,
    ) -> Option<Vec<SizedConstraintTracePosition>> {
        let mut trace = Vec::new();
        loop {
            let mut hints = if singles_only {
                self.find_hints(&digits, &eliminations, 1, true)?
            } else {
                self.hints(&digits, &eliminations, 1)?
            };
            let deduction = hints.choices.pop();
            trace.push(SizedConstraintTracePosition {
                digits: digits.clone(),
                eliminations: eliminations.clone(),
                candidates: hints.candidates,
                deduction,
            });
            let Some(step) = trace.last()?.deduction.as_ref() else {
                return Some(trace);
            };
            match step {
                SizedConstraintStep::Contradiction { assumption, .. } => {
                    eliminations[assumption.cell] |= 1 << (assumption.digit - 1);
                }
                SizedConstraintStep::House { proof } => {
                    advance(&proof.actions, &mut digits, &mut eliminations)
                }
                SizedConstraintStep::Rule { actions, .. }
                | SizedConstraintStep::Kropki { actions, .. }
                | SizedConstraintStep::QuadrupleOverlap { actions, .. }
                | SizedConstraintStep::AntiSum { actions, .. }
                | SizedConstraintStep::RowColumnSum { actions, .. }
                | SizedConstraintStep::CoupledSums { actions, .. } => {
                    advance(actions, &mut digits, &mut eliminations)
                }
            }
        }
    }

    // Use only ordinary deductions inside each assumption. Record the actual
    // terminal failure so an elimination never relies on an unexplained search.
    fn contradiction(
        &self,
        digits: &[u8],
        eliminations: &[u16],
        candidates: &[u16],
    ) -> Option<SizedConstraintStep> {
        let mut cells: Vec<_> = (0..candidates.len())
            .filter(|&cell| candidates[cell] != 0)
            .collect();
        cells.sort_unstable_by_key(|&cell| (candidates[cell].count_ones(), cell));
        // One assumption may scan every digit in every house. Keep the
        // same work budget as 2,048 passes over the original 6×6 grid.
        const MAX_DIGIT_CELL_CHECKS: usize = 2_048 * 6 * 36;
        let mut budget = MAX_DIGIT_CELL_CHECKS / (self.layout.size() * self.layout.cell_count());
        let mut branch = digits.to_vec();
        let mut removed = eliminations.to_vec();
        let mut placements = Vec::new();
        for cell in cells {
            let mut options = candidates[cell];
            while options != 0 {
                let digit = options.trailing_zeros() as u8 + 1;
                options &= options - 1;
                branch.copy_from_slice(digits);
                branch[cell] = digit;
                removed.copy_from_slice(eliminations);
                placements.clear();
                loop {
                    if budget == 0 {
                        return None;
                    }
                    budget -= 1;
                    let Some(mut hints) = self.find_hints(&branch, &removed, 1, false) else {
                        if let Some(failure) = self.explain_failure(&branch, &removed) {
                            return Some(SizedConstraintStep::Contradiction {
                                assumption: Candidate { cell, digit },
                                placements,
                                failure,
                            });
                        }
                        break;
                    };
                    let actions = match hints.choices.pop() {
                        Some(SizedConstraintStep::House { proof }) => proof.actions,
                        Some(SizedConstraintStep::Rule { actions, .. })
                        | Some(SizedConstraintStep::Kropki { actions, .. })
                        | Some(SizedConstraintStep::AntiSum { actions, .. })
                        | Some(SizedConstraintStep::RowColumnSum { actions, .. })
                        | Some(SizedConstraintStep::CoupledSums { actions, .. }) => actions,
                        _ => break,
                    };
                    placements.extend(actions.iter().filter_map(|action| match action {
                        HintAction::Place(candidate) => Some(*candidate),
                        HintAction::Eliminate(_) => None,
                    }));
                    advance(&actions, &mut branch, &mut removed);
                }
            }
        }
        None
    }

    fn explain_failure(
        &self,
        digits: &[u8],
        eliminations: &[u16],
    ) -> Option<SizedConstraintFailure> {
        let masks = self.layout.candidates(digits);
        if masks.is_none() {
            for (index, cells) in self.layout.houses.iter().enumerate() {
                let mut used = 0;
                for &cell in cells {
                    let digit = digits[cell];
                    if digit == 0 {
                        continue;
                    }
                    let bit = 1 << (digit - 1);
                    if used & bit != 0 {
                        return Some(SizedConstraintFailure::RepeatedDigit {
                            house: self.layout.house(index),
                            digit,
                        });
                    }
                    used |= bit;
                }
            }
        }
        let mut domains = masks?;
        for (cell, mask) in domains.iter_mut().enumerate() {
            *mask = if digits[cell] == 0 {
                *mask & !eliminations[cell]
            } else {
                1 << (digits[cell] - 1)
            };
            if *mask == 0 {
                return Some(SizedConstraintFailure::Cell { cell });
            }
        }
        for (index, cells) in self.layout.houses.iter().enumerate() {
            let supported = cells.iter().fold(0, |mask, &cell| mask | domains[cell]);
            let missing = self.layout.full_mask & !supported;
            if missing != 0 {
                return Some(SizedConstraintFailure::MissingDigit {
                    house: self.layout.house(index),
                    digit: missing.trailing_zeros() as u8 + 1,
                });
            }
        }
        for (rule, constraint) in self.rules.iter().enumerate() {
            let fails = match constraint {
                SizedConstraint::Diagonal(direction) => {
                    let mut used = 0;
                    let mut supported = 0;
                    for cell in diagonal_cells(self.layout.size(), *direction) {
                        if digits[cell] != 0 {
                            if used & domains[cell] != 0 {
                                return Some(SizedConstraintFailure::Rule { rule });
                            }
                            used |= domains[cell];
                        }
                        supported |= domains[cell];
                    }
                    supported != self.layout.full_mask
                }
                SizedConstraint::Parity { cells, parity } => {
                    let allowed = if *parity == SizedParity::Odd {
                        0x5555
                    } else {
                        0xaaaa
                    };
                    cells.iter().any(|&cell| domains[cell] & allowed == 0)
                }
                SizedConstraint::DigitRestriction { cells, digits } => {
                    let allowed = digits
                        .iter()
                        .fold(0u16, |mask, digit| mask | (1 << (digit - 1)));
                    cells.iter().any(|&cell| domains[cell] & allowed == 0)
                }
                SizedConstraint::Thermometer { cells }
                | SizedConstraint::SlowThermometer { cells } => {
                    let mut support = domains.clone();
                    self.restrict_thermometer(
                        cells,
                        &mut support,
                        matches!(constraint, SizedConstraint::SlowThermometer { .. }),
                    );
                    support.contains(&0)
                }
                SizedConstraint::Between { cells } => {
                    self.between_support(cells, &domains).is_none()
                }
                SizedConstraint::Whispers { .. }
                | SizedConstraint::ParityLine { .. }
                | SizedConstraint::Palindrome { .. }
                | SizedConstraint::Clone { .. }
                | SizedConstraint::NonConsecutive { .. }
                | SizedConstraint::Inequality { .. }
                | SizedConstraint::Minimum { .. }
                | SizedConstraint::Maximum { .. }
                | SizedConstraint::Xv { .. }
                | SizedConstraint::AdjacentTotal { .. }
                | SizedConstraint::AntiKnight
                | SizedConstraint::AntiKing
                | SizedConstraint::Modular { .. } => self.pair_links[rule]
                    .iter()
                    .any(|link| link.supports(&domains).contains(&0)),
                SizedConstraint::Sandwich { .. } => {
                    let sandwich = self.sandwiches[rule].as_ref()?;
                    !sandwich.support(&domains, &mut [0; MAX_SIZE * MAX_SIZE])
                }
                SizedConstraint::XSum { .. } => !self.x_sums[rule]
                    .as_ref()?
                    .support(&domains, &mut [0; MAX_SIZE * MAX_SIZE]),
                SizedConstraint::XSumDot { .. } => !self.x_sum_dots[rule]
                    .as_ref()?
                    .support(&domains, &mut [0; MAX_SIZE * MAX_SIZE]),
                SizedConstraint::Crust { .. } => {
                    let crust = self.crust.as_ref()?;
                    let mut support = domains.clone();
                    crust.restrict(&mut support).is_none()
                }
                SizedConstraint::Arrow { .. } => {
                    self.arrows[rule].as_ref()?.support(&domains).0 == 0
                }
                SizedConstraint::DoubleArrow { .. } => self.double_arrows[rule]
                    .as_ref()?
                    .hint_support(&domains)
                    .0
                    .contains(&0),
                SizedConstraint::ExtraHouse { cells } => {
                    extra_house_support(cells, &domains, self.layout.full_mask)[..cells.len()]
                        .contains(&0)
                }
                SizedConstraint::LinkedDoubleArrow { .. } => !self.linked_double_arrows[rule]
                    .as_ref()?
                    .support(&domains, &mut [0; MAX_SIZE * MAX_SIZE]),
                SizedConstraint::KillerCages { .. } => {
                    if let Some(cage) = self.cages[rule]
                        .iter()
                        .position(|cage| cage.support(&domains)[..cage.cells.len()].contains(&0))
                    {
                        return Some(SizedConstraintFailure::KillerCage { rule, cage });
                    }
                    false
                }
                SizedConstraint::Quadruple { .. } => {
                    self.quadruples[rule].as_ref()?.support(&domains).is_none()
                }
                SizedConstraint::RegionSum { .. } => self.region_sums[rule]
                    .as_ref()
                    .is_some_and(|line| !line.support(&domains, &mut [0; MAX_SIZE * MAX_SIZE])),
                SizedConstraint::LineAssignments { .. } => self.line_assignments[rule]
                    .as_ref()?
                    .support(&domains)
                    .is_none(),
                SizedConstraint::Nonogram { .. } => {
                    self.nonograms[rule].as_ref()?.support(&domains).is_none()
                }
                SizedConstraint::Skyscrapers { .. } => {
                    self.skyscrapers[rule].as_ref()?.support(&domains).is_none()
                }
                SizedConstraint::RowEquation { .. } => self.row_equations[rule]
                    .as_ref()?
                    .support(&domains)
                    .is_none(),
                SizedConstraint::FractionalRegions { .. } => {
                    let partition = self.fractional_regions[rule].as_ref()?;
                    partition.pieces.iter().any(|piece| {
                        let mut supported = [0; MAX_SIZE * MAX_SIZE];
                        !partition.support(piece, &domains, &mut supported)
                    })
                }
                SizedConstraint::LittleKiller { .. } => self.little_killers[rule]
                    .as_ref()?
                    .support(&domains)
                    .is_none(),
                SizedConstraint::Renban { cells } => {
                    self.renban_masks(cells, &domains)[..cells.len()].contains(&0)
                }
                SizedConstraint::GlobalEntropy { .. } => {
                    let (groups, windows) = self.global_entropy[rule].as_ref()?;
                    windows.iter().any(|cells| {
                        crate::variant::global_entropy::support_in_groups(
                            cells.map(|cell| domains[cell]),
                            *groups,
                        )
                        .contains(&0)
                    })
                }
                SizedConstraint::Entropic { .. } => self.entropic_lines[rule]
                    .as_ref()?
                    .support(&domains)
                    .is_none(),
                SizedConstraint::Zipper { .. } => !self.zippers[rule]
                    .as_ref()?
                    .support(&domains, &mut [0; MAX_CELLS]),
                SizedConstraint::RowColumnSum { .. } => {
                    let layer = self.row_column_sums[rule].as_ref()?;
                    if let Some(link) = layer.marked.iter().find(|link| {
                        link.restrict(link.cells.map(|cell| domains[cell]))
                            .contains(&0)
                    }) {
                        return Some(SizedConstraintFailure::RowColumnSum {
                            rule,
                            cells: Some(link.cells),
                        });
                    }
                    if matches!(
                        layer.unmarked_support(&domains),
                        UnmarkedSumSupport::Impossible
                    ) {
                        return Some(SizedConstraintFailure::RowColumnSum { rule, cells: None });
                    }
                    false
                }
                SizedConstraint::Difference { .. } => self.pair_links[rule]
                    .iter()
                    .any(|link| link.supports(&domains).contains(&0)),
                SizedConstraint::Kropki { .. }
                | SizedConstraint::CornerKropki { .. }
                | SizedConstraint::LabeledDots { .. }
                | SizedConstraint::AntiSum { .. } => {
                    if let Some(link) = self.pair_links[rule]
                        .iter()
                        .find(|link| link.supports(&domains).contains(&0))
                    {
                        return Some(if let Some(pair) = link.kropki_proof() {
                            SizedConstraintFailure::Kropki { rule, pair }
                        } else {
                            SizedConstraintFailure::AntiSum {
                                rule,
                                cells: link.constraint.cells,
                            }
                        });
                    }
                    false
                }
            };
            if fails {
                return Some(SizedConstraintFailure::Rule { rule });
            }
        }
        for pair in &self.coupled_sums {
            if pair.support(&self.equal_sums, &domains).is_none() {
                return Some(SizedConstraintFailure::CoupledSums { rules: pair.rules });
            }
        }
        None
    }

    fn search(&self, digits: &[u8], budget: u32, limit: u8) -> (Analysis, Option<Vec<u8>>) {
        if self.layout.used_digits(digits).is_none() || !self.permits(digits) {
            return (Analysis::Conflict, None);
        }
        // Fast puzzles often finish with local rule propagation alone.
        // Scan every house once the search has expanded several gridfuls of nodes.
        let mut local_nodes_left = (4 * digits.len()).max(256);
        let mut crust_budget = budget.saturating_mul(64);
        let mut crust_search_exhausted = false;
        let result =
            self.layout
                .search_filtered::<true>(digits, budget, limit, |digits, used, domains| {
                    if crust_search_exhausted {
                        return false;
                    }
                    if let Some(crust) = &self.crust
                        && !digits.contains(&0)
                    {
                        match crust.partition(digits, &mut crust_budget) {
                            Ok(None) => return false,
                            Err(_) => {
                                crust_search_exhausted = true;
                                return false;
                            }
                            Ok(Some(_)) => {}
                        }
                    }
                    for (cell, &digit) in digits.iter().enumerate() {
                        domains[cell] = if digit == 0 {
                            self.layout.available(cell, used)
                        } else {
                            1 << (digit - 1)
                        };
                    }
                    if !self.apply_rules(digits, domains) || domains.contains(&0) {
                        return false;
                    }
                    if local_nodes_left > 0 {
                        local_nodes_left = local_nodes_left.saturating_sub(1);
                        return true;
                    }
                    self.layout.restrict_search_houses(domains).is_some()
                });
        if crust_search_exhausted && result.0 != Analysis::Multiple {
            (Analysis::SearchLimit, None)
        } else {
            result
        }
    }

    fn permits(&self, digits: &[u8]) -> bool {
        self.parity
            .iter()
            .all(|&(cell, mask)| digits[cell] == 0 || mask & (1 << (digits[cell] - 1)) != 0)
            && self
                .diagonals
                .iter()
                .chain(&self.extra_houses)
                .all(|cells| {
                    let mut used = 0u16;
                    for &cell in cells {
                        let digit = digits[cell];
                        if digit == 0 {
                            continue;
                        }
                        let bit = 1 << (digit - 1);
                        if used & bit != 0 {
                            return false;
                        }
                        used |= bit;
                    }
                    true
                })
            && self.thermometers.iter().all(|(cells, allow_equal)| {
                let mut low = 1;
                for (index, &cell) in cells.iter().enumerate() {
                    let digit = usize::from(digits[cell]);
                    if digit != 0 {
                        if digit < low {
                            return false;
                        }
                        low = digit;
                    }
                    if !allow_equal && low + cells.len() - index - 1 > self.layout.size() {
                        return false;
                    }
                    if !allow_equal {
                        low += 1;
                    }
                }
                true
            })
            && self.between_lines.iter().all(|cells| {
                if cells.iter().any(|&cell| digits[cell] == 0) {
                    return true;
                }
                let first = digits[cells[0]];
                let last = digits[*cells.last().unwrap()];
                cells[1..cells.len() - 1].iter().all(|&cell| {
                    let digit = digits[cell];
                    digit > first.min(last) && digit < first.max(last)
                })
            })
            && self
                .sandwiches
                .iter()
                .flatten()
                .all(|sandwich| sandwich.permits(digits))
            && self
                .x_sums
                .iter()
                .flatten()
                .all(|x_sum| x_sum.permits(digits))
            && self
                .x_sum_dots
                .iter()
                .flatten()
                .all(|dot| dot.permits(digits))
            && self.renbans.iter().all(|cells| {
                let mut used = 0u16;
                for &cell in cells {
                    if digits[cell] == 0 {
                        continue;
                    }
                    let bit = 1 << (digits[cell] - 1);
                    if used & bit != 0 {
                        return false;
                    }
                    used |= bit;
                }
                used == 0
                    || (u16::BITS - used.leading_zeros() - used.trailing_zeros()) as usize
                        <= cells.len()
            })
            && self
                .arrows
                .iter()
                .flatten()
                .all(|arrow| arrow.permits(digits, self.layout.full_mask))
            && self.double_arrows.iter().flatten().all(|arrow| {
                let size = self.layout.size();
                let (ends_min, ends_max) = sum_bounds(&arrow.ends, digits, size);
                let (line_min, line_max) = sum_bounds(&arrow.cells, digits, size);
                ends_min <= line_max && line_min <= ends_max
            })
            && self
                .linked_double_arrows
                .iter()
                .flatten()
                .all(|arrow| arrow.permits(digits))
            && self
                .quadruples
                .iter()
                .flatten()
                .all(|clue| clue.permits(digits, self.layout.full_mask))
            && self.cages.iter().flatten().all(|cage| cage.permits(digits))
            && self
                .row_equations
                .iter()
                .flatten()
                .all(|equation| equation.permits(digits))
            && self
                .fractional_regions
                .iter()
                .flatten()
                .all(|partition| partition.permits(digits))
            && self
                .little_killers
                .iter()
                .flatten()
                .all(|clue| clue.permits(digits, self.layout.size()))
            && self
                .region_sums
                .iter()
                .flatten()
                .all(|line| line.permits(digits))
            && self.line_assignments.iter().flatten().all(|group| {
                let domains = digits
                    .iter()
                    .map(|&digit| {
                        if digit == 0 {
                            self.layout.full_mask
                        } else {
                            1 << (digit - 1)
                        }
                    })
                    .collect::<Vec<_>>();
                group.support(&domains).is_some()
            })
            && self
                .global_entropy
                .iter()
                .flatten()
                .all(|(groups, windows)| {
                    windows.iter().all(|cells| {
                        let domains = cells.map(|cell| {
                            if digits[cell] == 0 {
                                self.layout.full_mask
                            } else {
                                1 << (digits[cell] - 1)
                            }
                        });
                        !crate::variant::global_entropy::support_in_groups(domains, *groups)
                            .contains(&0)
                    })
                })
            && self
                .entropic_lines
                .iter()
                .flatten()
                .all(|line| line.permits(digits, self.layout.full_mask))
            && self
                .zippers
                .iter()
                .flatten()
                .all(|line| line.permits(digits, self.layout.size()))
            && self
                .nonograms
                .iter()
                .flatten()
                .all(|line| line.permits(digits))
            && self
                .skyscrapers
                .iter()
                .flatten()
                .all(|line| line.permits(digits))
            && self
                .row_column_sums
                .iter()
                .flatten()
                .all(|layer| layer.permits(digits))
            && self.pair_links.iter().flatten().all(|link| {
                let [left, right] = link.constraint.cells.map(|cell| digits[cell]);
                left == 0 || right == 0 || link.constraint.permits(left, right)
            })
    }
}

fn sum_bounds(cells: &[usize], digits: &[u8], size: usize) -> (usize, usize) {
    cells.iter().fold((0, 0), |(min, max), &cell| {
        let digit = usize::from(digits[cell]);
        if digit == 0 {
            (min + 1, max + size)
        } else {
            (min + digit, max + digit)
        }
    })
}

fn diagonal_cells(size: usize, direction: SizedDiagonal) -> impl Iterator<Item = usize> + Clone {
    (0..size).map(move |row| {
        row * size
            + match direction {
                SizedDiagonal::Main => row,
                SizedDiagonal::Anti => size - 1 - row,
            }
    })
}

fn eliminations_for(cell: usize, mut mask: u16, actions: &mut Vec<HintAction>) {
    while mask != 0 {
        let digit = mask.trailing_zeros() as u8 + 1;
        actions.push(HintAction::Eliminate(Candidate { cell, digit }));
        mask &= mask - 1;
    }
}

fn advance(actions: &[HintAction], digits: &mut [u8], eliminations: &mut [u16]) {
    for action in actions {
        match *action {
            HintAction::Place(Candidate { cell, digit }) => digits[cell] = digit,
            HintAction::Eliminate(Candidate { cell, digit }) => {
                eliminations[cell] |= 1 << (digit - 1)
            }
        }
    }
}

fn extra_house_support(cells: &[usize], domains: &[u16], digits: u16) -> [u16; MAX_SIZE] {
    let mut input = [0; MAX_SIZE];
    for (&cell, mask) in cells.iter().zip(&mut input) {
        *mask = domains[cell];
    }
    let len = cells.len();
    let mut support = [0; MAX_SIZE];
    crate::variant::digit_set_support(digits, &input[..len], &mut support[..len]);
    support
}

#[cfg(test)]
mod tests {
    use super::{GridSpec, SizedConstraint, SizedConstraintGrid, SizedConstraintStep};
    use crate::{Analysis, ClueDirection, variant::MarkedPairs};

    fn digits(solution: &str) -> Vec<u8> {
        solution.bytes().map(|digit| digit - b'0').collect()
    }

    #[test]
    fn crossed_zipper_and_region_sum_produce_a_joint_hint() {
        let grid = SizedConstraintGrid::new(
            GridSpec {
                size: 4,
                box_rows: 2,
                box_columns: 2,
            },
            &[
                SizedConstraint::Zipper {
                    cells: vec![0, 5, 6, 3],
                },
                SizedConstraint::RegionSum {
                    cells: vec![0, 5, 6, 3],
                    group_by_region: false,
                },
            ],
        )
        .unwrap();
        let found = (1..256u16).any(|seed| {
            let mut eliminations = vec![0; 16];
            for (index, cell) in [0, 5, 6, 3].into_iter().enumerate() {
                let allowed = ((seed.rotate_left((index * 3) as u32)) & 15) | 1;
                eliminations[cell] = 15 & !allowed;
            }
            grid.hints(&[0; 16], &eliminations, 64)
                .is_some_and(|hints| {
                    hints
                        .choices
                        .iter()
                        .any(|step| matches!(step, SizedConstraintStep::CoupledSums { .. }))
                })
        });
        assert!(
            found,
            "expected a deduction that requires comparing both total rules"
        );
    }

    #[test]
    fn six_by_six_slow_thermometers_allow_equal_digits_with_xv_and_sandwich() {
        let spec = GridSpec {
            size: 6,
            box_rows: 2,
            box_columns: 3,
        };
        let slow = vec![
            SizedConstraint::SlowThermometer {
                cells: vec![33, 26, 21, 14, 9, 2],
            },
            SizedConstraint::SlowThermometer {
                cells: vec![32, 27, 20, 15, 8, 3],
            },
            SizedConstraint::Xv {
                five: MarkedPairs {
                    pairs: vec![[7, 8], [21, 22], [19, 20], [21, 27], [33, 34]],
                    negative: false,
                },
                ten: MarkedPairs {
                    pairs: vec![[2, 8]],
                    negative: false,
                },
            },
            SizedConstraint::Sandwich {
                cells: vec![3, 9, 15, 21, 27, 33],
                direction: ClueDirection::South,
                sum: 6,
            },
        ];
        let solution = digits("326541514632145263632415263154451326");
        let grid = SizedConstraintGrid::new(spec, &slow).unwrap();
        assert_eq!(grid.solve_unique(&solution, 100), Ok(solution.clone()));

        let strict: Vec<_> = slow
            .iter()
            .map(|rule| match rule {
                SizedConstraint::SlowThermometer { cells } => SizedConstraint::Thermometer {
                    cells: cells.clone(),
                },
                other => other.clone(),
            })
            .collect();
        let strict_grid = SizedConstraintGrid::new(spec, &strict).unwrap();
        assert_eq!(strict_grid.analyze(&solution, 100), Analysis::Conflict);
    }

    #[test]
    fn six_by_six_whispers_keep_separate_minimums_with_thermometer_and_sandwich() {
        let spec = GridSpec {
            size: 6,
            box_rows: 2,
            box_columns: 3,
        };
        let rules = vec![
            SizedConstraint::Thermometer {
                cells: vec![24, 31, 32, 33, 34, 29],
            },
            SizedConstraint::Whispers {
                cells: vec![26, 20, 14, 8, 2, 7, 12, 13],
                min_difference: 2,
            },
            SizedConstraint::Whispers {
                cells: vec![27, 21, 15, 16],
                min_difference: 3,
            },
            SizedConstraint::Whispers {
                cells: vec![15, 9, 3, 10, 17],
                min_difference: 3,
            },
            SizedConstraint::Sandwich {
                cells: vec![5, 4, 3, 2, 1, 0],
                direction: ClueDirection::West,
                sum: 2,
            },
        ];
        let solution = digits("536214412563365142241635154326623451");
        let grid = SizedConstraintGrid::new(spec, &rules).unwrap();
        assert_eq!(grid.solve_unique(&solution, 100), Ok(solution));
    }

    #[test]
    fn between_line_support_keeps_only_digits_strictly_inside_feasible_endpoints() {
        let grid = SizedConstraintGrid::new(
            GridSpec {
                size: 6,
                box_rows: 2,
                box_columns: 3,
            },
            &[SizedConstraint::Between {
                cells: vec![0, 1, 2],
            }],
        )
        .unwrap();
        let mut candidates = vec![0b11_1111; 36];
        candidates[0] = 0b00_0001; // 1
        candidates[1] = 0b00_1111; // 1 through 4
        candidates[2] = 0b01_0000; // 5
        assert!(grid.apply_rules(&[0; 36], &mut candidates));
        assert_eq!(candidates[0], 0b00_0001);
        assert_eq!(candidates[1], 0b00_1110); // 2, 3, or 4
        assert_eq!(candidates[2], 0b01_0000);

        candidates[1] = 0b00_0001;
        assert!(!grid.apply_rules(&[0; 36], &mut candidates));
    }

    #[test]
    fn six_by_six_between_lines_accept_the_published_complete_grid() {
        let solution = digits("164523532641216435345216623154451362");
        let domains: Vec<_> = solution.iter().map(|&digit| 1 << (digit - 1)).collect();
        let rule = SizedConstraint::Between {
            cells: vec![20, 15, 16, 10, 4],
        };
        let grid = SizedConstraintGrid::new(
            GridSpec {
                size: 6,
                box_rows: 2,
                box_columns: 3,
            },
            &[rule],
        )
        .unwrap();
        let support = grid
            .between_support(&[20, 15, 16, 10, 4], &domains)
            .unwrap();
        assert_eq!(&support[..5], &[16, 8, 4, 8, 2]);
        assert_eq!(grid.analyze(&solution, 100), Analysis::Unique);
        for cells in [vec![0, 6, 7, 14]] {
            let grid = SizedConstraintGrid::new(
                GridSpec {
                    size: 6,
                    box_rows: 2,
                    box_columns: 3,
                },
                &[SizedConstraint::Between {
                    cells: cells.clone(),
                }],
            )
            .unwrap();
            assert_eq!(
                grid.analyze(&solution, 100),
                Analysis::Unique,
                "cells: {cells:?}"
            );
        }
    }

    #[test]
    fn published_little_killer_between_import_accepts_the_published_completion() {
        let rules = [
            SizedConstraint::LittleKiller {
                direction: ClueDirection::SouthWest,
                cells: vec![17, 22, 27, 32],
                sum: 8,
            },
            SizedConstraint::LittleKiller {
                direction: ClueDirection::SouthWest,
                cells: vec![29, 34],
                sum: 10,
            },
            SizedConstraint::LittleKiller {
                direction: ClueDirection::NorthEast,
                cells: vec![18, 13, 8, 3],
                sum: 11,
            },
            SizedConstraint::Between {
                cells: vec![20, 15, 16, 10, 4],
            },
            SizedConstraint::Between {
                cells: vec![0, 6, 7, 14],
            },
        ];
        let grid = SizedConstraintGrid::new(
            GridSpec {
                size: 6,
                box_rows: 2,
                box_columns: 3,
            },
            &rules,
        )
        .unwrap();
        let solution = digits("164523532641216435345216623154451362");
        assert!(grid.permits(&solution));
        for (index, rule) in rules.iter().enumerate() {
            let single = SizedConstraintGrid::new(
                GridSpec {
                    size: 6,
                    box_rows: 2,
                    box_columns: 3,
                },
                std::slice::from_ref(rule),
            )
            .unwrap();
            assert_eq!(
                single.analyze(&solution, 100),
                Analysis::Unique,
                "rule {index}: {rule:?}"
            );
        }
        assert_eq!(grid.analyze(&solution, 100), Analysis::Unique);
    }
}
