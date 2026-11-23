mod double_arrow;
mod killer;
mod linked_double_arrow;
mod pairs;
mod quadruple;
mod quadruple_overlap;
mod region_sum;
mod sandwich;

use super::{GridSpec, MAX_SIZE, SizedDeduction, SizedGrid};
use crate::{Analysis, Candidate, HintAction, House};
pub use crate::variant::{Diagonal as SizedDiagonal, MarkedPairs, Parity as SizedParity};

use self::double_arrow::DoubleArrow;
use self::killer::Cage;
use self::linked_double_arrow::LinkedDoubleArrow;
pub use self::linked_double_arrow::SizedSumEnd;
use self::pairs::{RowColumnSum, SizedPairLink, UnmarkedSumSupport, compile_pairs};
use self::quadruple::SizedQuadruple;
use self::region_sum::RegionSum;
use self::sandwich::Sandwich;

/// Rules on a sized grid. Thermometer cells are listed from the bulb to the tip.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SizedConstraint {
    Diagonal(SizedDiagonal),
    ExtraHouse { cells: Vec<usize> },
    Parity {
        cells: Vec<usize>,
        parity: SizedParity,
    },
    Thermometer {
        cells: Vec<usize>,
    },
    SlowThermometer {
        cells: Vec<usize>,
    },
    Whispers {
        cells: Vec<usize>,
        min_difference: u8,
    },
    Xv {
        five: MarkedPairs,
        ten: MarkedPairs,
    },
    Sandwich {
        cells: Vec<usize>,
        direction: crate::ClueDirection,
        sum: u16,
    },
    Arrow {
        circle: usize,
        cells: Vec<usize>,
    },
    DoubleArrow {
        ends: [usize; 2],
        cells: Vec<usize>,
    },
    LinkedDoubleArrow { ends: [SizedSumEnd; 2], cells: Vec<usize> },
    KillerCages {
        cages: Vec<crate::variant::KillerCage>,
        cover_grid: bool,
    },
    RegionSum {
        cells: Vec<usize>,
        group_by_region: bool,
    },
    Renban {
        cells: Vec<usize>,
    },
    Kropki {
        consecutive: MarkedPairs,
        ratio_two: MarkedPairs,
    },
    Quadruple { top_left: usize, digits: Vec<u8> },
    LabeledDots {
        relation: SizedDotRelation,
        marks: Vec<SizedLabeledDot>,
        negative: bool,
    },
    AntiSum { sum: u8 },
    RowColumnSum { pairs: Vec<[usize; 2]>, require_unmarked: bool },
    Difference {
        cells: [usize; 2],
        difference: u8,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Ord, PartialOrd)]
#[cfg_attr(feature = "wasm-api", derive(serde::Deserialize, serde::Serialize), serde(rename_all = "kebab-case"))]
pub enum SizedDotRelation {
    Difference,
    Ratio,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Ord, PartialOrd)]
#[cfg_attr(feature = "wasm-api", derive(serde::Deserialize, serde::Serialize), serde(deny_unknown_fields))]
pub struct SizedLabeledDot {
    pub cells: [usize; 2],
    pub value: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize), serde(rename_all = "kebab-case"))]
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
    Cell { cell: usize },
    MissingDigit { house: House, digit: u8 },
    RepeatedDigit { house: House, digit: u8 },
    Rule { rule: usize },
    KillerCage { rule: usize, cage: usize },
    Kropki { rule: usize, pair: SizedKropkiPair },
    AntiSum { rule: usize, cells: [usize; 2] },
    RowColumnSum { rule: usize, cells: Option<[usize; 2]> },
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
    rules: Vec<SizedConstraint>,
    parity: Vec<(usize, u16)>,
    diagonals: Vec<Vec<usize>>,
    extra_houses: Vec<Vec<usize>>,
    thermometers: Vec<(Vec<usize>, bool)>,
    renbans: Vec<Vec<usize>>,
    arrows: Vec<(usize, Vec<usize>)>,
    double_arrows: Vec<Option<DoubleArrow>>,
    region_sums: Vec<Option<RegionSum>>,
    quadruples: Vec<Option<SizedQuadruple>>,
    cages: Vec<Vec<Cage>>,
    linked_double_arrows: Vec<Option<LinkedDoubleArrow>>,
    pair_links: Vec<Vec<SizedPairLink>>,
    row_column_sums: Vec<Option<RowColumnSum>>,
    sandwiches: Vec<Option<Sandwich>>,
}

impl SizedConstraintGrid {
    pub fn new(spec: GridSpec, rules: &[SizedConstraint]) -> Option<Self> {
        Self::with_layout(SizedGrid::new(spec)?, rules)
    }

    /// Compile the rules against an existing rectangular or irregular layout.
    pub fn with_layout(layout: SizedGrid, rules: &[SizedConstraint]) -> Option<Self> {
        let size = layout.size();
        let mut parity = vec![layout.full_mask; layout.cell_count()];
        let mut diagonals = Vec::new();
        let mut extra_houses = Vec::new();
        let mut thermometers = Vec::new();
        let mut renbans = Vec::new();
        let mut arrows = Vec::new();
        let mut double_arrows = Vec::new();
        let mut linked_double_arrows = Vec::new();
        let mut region_sums = Vec::new();
        let mut row_column_sums = Vec::new();
        let mut sandwiches = Vec::new();
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
                    if cells.len() != size || cells.iter().any(|&cell| {
                        cell >= layout.cell_count() || std::mem::replace(&mut seen[cell], true)
                    }) {
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
                    let mask = match kind {
                        SizedParity::Odd => 0x5555,
                        SizedParity::Even => 0xaaaa,
                    };
                    for &cell in cells {
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
                SizedConstraint::Whispers { cells, min_difference } => {
                    if cells.len() < 2 || cells.len() > size * size || *min_difference == 0 || *min_difference as usize >= size ||
                        cells.iter().any(|&cell| cell >= layout.cell_count()) || cells.windows(2).any(|pair| pair[0] == pair[1]) {
                        return None;
                    }
                }
                SizedConstraint::Arrow { circle, cells } => {
                    if *circle >= layout.cell_count()
                        || !(1..=size).contains(&cells.len())
                        || cells.iter().enumerate().any(|(index, &cell)| {
                            cell >= layout.cell_count() || cell == *circle || cells[..index].contains(&cell)
                        })
                    {
                        return None;
                    }
                    arrows.push((*circle, cells.clone()));
                }
                SizedConstraint::DoubleArrow { ends, cells } => {
                    double_arrows.resize_with(index + 1, || None);
                    double_arrows[index] = Some(DoubleArrow::compile(&layout, *ends, cells)?);
                }
                SizedConstraint::LinkedDoubleArrow { ends, cells } => {
                    linked_double_arrows.resize_with(index + 1, || None);
                    linked_double_arrows[index] = Some(LinkedDoubleArrow::compile(&layout, *ends, cells)?);
                }
                SizedConstraint::KillerCages { cages: authored, cover_grid } => {
                    cages.resize_with(index + 1, Vec::new);
                    for cage in authored {
                        cages[index].push(Cage::compile(&layout, cage, &mut occupied)?);
                    }
                    if authored.is_empty() || *cover_grid && authored.iter().map(|cage| cage.cells.len()).sum::<usize>() != layout.cell_count() {
                        return None;
                    }
                }
                SizedConstraint::RegionSum { cells, group_by_region } => {
                    region_sums.resize_with(index + 1, || None);
                    region_sums[index] = Some(RegionSum::compile(&layout, cells, *group_by_region)?);
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
                SizedConstraint::Kropki { .. } | SizedConstraint::Difference { .. }
                | SizedConstraint::LabeledDots { .. } | SizedConstraint::AntiSum { .. }
                | SizedConstraint::Quadruple { .. } | SizedConstraint::Xv { .. } => {}
                SizedConstraint::RowColumnSum { pairs, require_unmarked } => {
                    row_column_sums.resize_with(index + 1, || None);
                    row_column_sums[index] = Some(RowColumnSum::compile(size, pairs, *require_unmarked, rules)?);
                }
                SizedConstraint::Sandwich { cells, direction, sum } => {
                    sandwiches.resize_with(index + 1, || None);
                    sandwiches[index] = Some(Sandwich::compile(size, cells, *direction, *sum)?);
                }
            }
        }
        let mut quadruples = Vec::new();
        for (index, rule) in rules.iter().enumerate() {
            if let SizedConstraint::Quadruple { top_left, digits } = rule {
                quadruples.resize_with(index + 1, || None);
                quadruples[index] = Some(SizedQuadruple::compile(&layout, *top_left, digits, &diagonals, &extra_houses)?);
            }
        }
        let parity = parity
            .into_iter()
            .enumerate()
            .filter(|(_, mask)| *mask != layout.full_mask)
            .collect();
        let pair_links = compile_pairs(size, rules)?;
        Some(Self {
            layout,
            rules: rules.to_vec(),
            parity,
            diagonals,
            extra_houses,
            thermometers,
            renbans,
            arrows,
            double_arrows,
            region_sums,
            quadruples,
            cages,
            linked_double_arrows,
            pair_links,
            row_column_sums,
            sandwiches,
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

    /// Apply the placed digits and propagate support through overlapping rules.
    pub fn candidates(&self, digits: &[u8]) -> Option<Vec<u16>> {
        let mut candidates = self.layout.candidates(digits)?;
        if !self.permits(digits) {
            return None;
        }
        for (cell, &digit) in digits.iter().enumerate() {
            if digit != 0 {
                candidates[cell] = 1 << (digit - 1);
            }
        }
        if !self.apply_rules(digits, &mut candidates) {
            return None;
        }
        for (cell, &digit) in digits.iter().enumerate() {
            if digit != 0 {
                candidates[cell] = 0;
            }
        }
        Some(candidates)
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
            for cells in &self.renbans {
                for (&cell, &mask) in cells.iter().zip(&self.renban_masks(cells, candidates)) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for (circle, cells) in &self.arrows {
                let (bulb, shaft) = arrow_masks(*circle, cells, candidates);
                changed |= candidates[*circle] != bulb;
                candidates[*circle] = bulb;
                for (&cell, mask) in cells.iter().zip(shaft) {
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            for arrow in self.double_arrows.iter().flatten() {
                let (end_masks, line_masks) = arrow.support(candidates);
                for (&cell, mask) in arrow.ends.iter().zip(end_masks).chain(arrow.cells.iter().zip(line_masks)) {
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
                let Some(support) = clue.support(candidates) else { return false };
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
            if !changed {
                return true;
            }
        }
    }

    fn restrict_thermometer(&self, cells: &[usize], candidates: &mut [u16], allow_equal: bool) -> bool {
        let mut changed = false;
        let mut lower = self.layout.full_mask;
        for &cell in cells {
            let mask = candidates[cell] & lower;
            changed |= mask != candidates[cell];
            candidates[cell] = mask;
            lower = u16::MAX.checked_shl(mask.trailing_zeros() + u32::from(!allow_equal)).unwrap_or(0);
        }
        let mut upper = self.layout.full_mask;
        for &cell in cells.iter().rev() {
            let mask = candidates[cell] & upper;
            changed |= mask != candidates[cell];
            candidates[cell] = mask;
            upper = if mask == 0 {
                0
            } else {
                (1 << (u16::BITS - 1 - mask.leading_zeros())) - 1
            };
        }
        changed
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
                    let excluded = match parity {
                        SizedParity::Odd => 0xaaaa,
                        SizedParity::Even => 0x5555,
                    };
                    for &cell in cells {
                        eliminations_for(cell, candidates[cell] & excluded, &mut actions);
                    }
                    actions.sort_unstable();
                    actions.dedup();
                }
                SizedConstraint::Thermometer { cells } | SizedConstraint::SlowThermometer { cells } => {
                    let mut support = domains.clone();
                    self.restrict_thermometer(cells, &mut support, matches!(constraint, SizedConstraint::SlowThermometer { .. }));
                    if support.contains(&0) {
                        return None;
                    }
                    for &cell in cells {
                        eliminations_for(
                            cell,
                            candidates[cell] & !support[cell],
                            &mut actions,
                        );
                    }
                }
                SizedConstraint::DoubleArrow { ends, cells } => {
                    let (end_masks, line_masks) = self.double_arrows[rule].as_ref()?.hint_support(&domains);
                    if end_masks.contains(&0) {
                        return None;
                    }
                    for (&cell, mask) in ends.iter().zip(end_masks).chain(cells.iter().zip(line_masks)) {
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                    }
                }
                SizedConstraint::Arrow { circle, cells } => {
                    let (bulb, shaft) = arrow_masks(*circle, cells, &domains);
                    if bulb == 0 {
                        return None;
                    }
                    eliminations_for(*circle, candidates[*circle] & !bulb, &mut actions);
                    for (&cell, mask) in cells.iter().zip(shaft) {
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
                            choices.push(SizedConstraintStep::Rule { rule, actions: cage_actions });
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
                SizedConstraint::Renban { cells } => {
                    let support = self.renban_masks(cells, &domains);
                    for (&cell, &mask) in cells.iter().zip(&support) {
                        if mask == 0 {
                            return None;
                        }
                        eliminations_for(cell, candidates[cell] & !mask, &mut actions);
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
                        (link.cells, link.restrict(link.cells.map(|cell| domains[cell])), false)
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
                            choices.push(SizedConstraintStep::RowColumnSum { rule, cells, unmarked, actions });
                            if choices.len() == limit {
                                break;
                            }
                        }
                    }
                }
                SizedConstraint::Sandwich { .. } => {
                    let sandwich = self.sandwiches[rule].as_ref()?;
                    let mut supported = [0; MAX_SIZE * MAX_SIZE];
                    if !sandwich.support(&domains, &mut supported) { return None; }
                    for cell in sandwich.cells() {
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
                SizedConstraint::Kropki { .. } | SizedConstraint::LabeledDots { .. } | SizedConstraint::AntiSum { .. } => {
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
                                SizedConstraintStep::Kropki { rule, pair, actions }
                            } else {
                                SizedConstraintStep::AntiSum { rule, cells: link.constraint.cells, actions }
                            };
                            choices.push(step);
                            if choices.len() == limit {
                                break;
                            }
                        }
                    }
                }
                SizedConstraint::Xv { .. } | SizedConstraint::Whispers { .. } => {
                    for link in &self.pair_links[rule] {
                        let support = link.supports(&domains);
                        if support.contains(&0) { return None; }
                        for (cell, mask) in link.constraint.cells.into_iter().zip(support) {
                            eliminations_for(cell, candidates[cell] & !mask, &mut actions);
                        }
                    }
                    actions.sort_unstable();
                    actions.dedup();
                }
            }
            if !actions.is_empty() {
                choices.push(SizedConstraintStep::Rule { rule, actions });
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
        Some(SizedConstraintHints { candidates, choices })
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
                | SizedConstraintStep::RowColumnSum { actions, .. } => {
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
                        | Some(SizedConstraintStep::RowColumnSum { actions, .. }) => actions,
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
                SizedConstraint::Thermometer { cells } | SizedConstraint::SlowThermometer { cells } => {
                    let mut support = domains.clone();
                    self.restrict_thermometer(cells, &mut support, matches!(constraint, SizedConstraint::SlowThermometer { .. }));
                    support.contains(&0)
                }
                SizedConstraint::Whispers { .. } | SizedConstraint::Xv { .. } => {
                    self.pair_links[rule].iter().any(|link| link.supports(&domains).contains(&0))
                }
                SizedConstraint::Sandwich { .. } => {
                    let sandwich = self.sandwiches[rule].as_ref()?;
                    !sandwich.support(&domains, &mut [0; MAX_SIZE * MAX_SIZE])
                }
                SizedConstraint::Arrow { circle, cells } => {
                    arrow_masks(*circle, cells, &domains).0 == 0
                }
                SizedConstraint::DoubleArrow { .. } => {
                    self.double_arrows[rule].as_ref()?.hint_support(&domains).0.contains(&0)
                }
                SizedConstraint::ExtraHouse { cells } => {
                    extra_house_support(cells, &domains, self.layout.full_mask)[..cells.len()].contains(&0)
                }
                SizedConstraint::LinkedDoubleArrow { .. } => {
                    !self.linked_double_arrows[rule].as_ref()?.support(&domains, &mut [0; MAX_SIZE * MAX_SIZE])
                }
                SizedConstraint::KillerCages { .. } => {
                    if let Some(cage) = self.cages[rule].iter().position(|cage| {
                        cage.support(&domains)[..cage.cells.len()].contains(&0)
                    }) {
                        return Some(SizedConstraintFailure::KillerCage { rule, cage });
                    }
                    false
                }
                SizedConstraint::Quadruple { .. } => self.quadruples[rule].as_ref()?.support(&domains).is_none(),
                SizedConstraint::RegionSum { .. } => self.region_sums[rule].as_ref()
                    .is_some_and(|line| !line.support(&domains, &mut [0; MAX_SIZE * MAX_SIZE])),
                SizedConstraint::Renban { cells } => {
                    self.renban_masks(cells, &domains)[..cells.len()].contains(&0)
                }
                SizedConstraint::RowColumnSum { .. } => {
                    let layer = self.row_column_sums[rule].as_ref()?;
                    if let Some(link) = layer.marked.iter().find(|link| {
                        link.restrict(link.cells.map(|cell| domains[cell])).contains(&0)
                    }) {
                        return Some(SizedConstraintFailure::RowColumnSum { rule, cells: Some(link.cells) });
                    }
                    if matches!(layer.unmarked_support(&domains), UnmarkedSumSupport::Impossible) {
                        return Some(SizedConstraintFailure::RowColumnSum { rule, cells: None });
                    }
                    false
                }
                SizedConstraint::Difference { .. } => {
                    self.pair_links[rule].iter().any(|link| link.supports(&domains).contains(&0))
                }
                SizedConstraint::Kropki { .. } | SizedConstraint::LabeledDots { .. } | SizedConstraint::AntiSum { .. } => {
                    if let Some(link) = self.pair_links[rule].iter().find(|link| {
                        link.supports(&domains).contains(&0)
                    }) {
                        return Some(if let Some(pair) = link.kropki_proof() {
                            SizedConstraintFailure::Kropki { rule, pair }
                        } else {
                            SizedConstraintFailure::AntiSum { rule, cells: link.constraint.cells }
                        });
                    }
                    false
                }
            };
            if fails {
                return Some(SizedConstraintFailure::Rule { rule });
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
        self.layout
            .search_filtered::<true>(digits, budget, limit, |digits, used, domains| {
                for (cell, &digit) in digits.iter().enumerate() {
                    domains[cell] = if digit == 0 {
                        self.layout.available(cell, used)
                    } else {
                        1 << (digit - 1)
                    };
                }
                if local_nodes_left > 0 {
                    local_nodes_left -= 1;
                    return self.apply_rules(digits, domains) && !domains.contains(&0);
                }
                loop {
                    if !self.apply_rules(digits, domains) || domains.contains(&0) {
                        return false;
                    }
                    match self.layout.restrict_search_houses(domains) {
                        Some(true) => {}
                        Some(false) => return true,
                        None => return false,
                    }
                }
            })
    }

    fn permits(&self, digits: &[u8]) -> bool {
        self.parity
            .iter()
            .all(|&(cell, mask)| digits[cell] == 0 || mask & (1 << (digits[cell] - 1)) != 0)
            && self.diagonals.iter().chain(&self.extra_houses).all(|cells| {
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
                    if !allow_equal { low += 1; }
                }
                true
            })
            && self.sandwiches.iter().flatten().all(|sandwich| {
                sandwich.permits(digits)
            })
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
            && self.arrows.iter().all(|(circle, cells)| {
                let (total, empty) = cells.iter().fold((0, 0), |(total, empty), &cell| {
                    (total + usize::from(digits[cell]), empty + usize::from(digits[cell] == 0))
                });
                let bulb = usize::from(digits[*circle]);
                let max = if bulb == 0 { self.layout.size() } else { bulb };
                total + empty <= max && (bulb == 0 || bulb <= total + empty * self.layout.size())
            })
            && self.double_arrows.iter().flatten().all(|arrow| {
                let size = self.layout.size();
                let (ends_min, ends_max) = sum_bounds(&arrow.ends, digits, size);
                let (line_min, line_max) = sum_bounds(&arrow.cells, digits, size);
                ends_min <= line_max && line_min <= ends_max
            })
            && self.linked_double_arrows.iter().flatten().all(|arrow| arrow.permits(digits))
            && self.quadruples.iter().flatten().all(|clue| clue.permits(digits, self.layout.full_mask))
            && self.cages.iter().flatten().all(|cage| cage.permits(digits))
            && self.region_sums.iter().flatten().all(|line| line.permits(digits))
            && self.row_column_sums.iter().flatten().all(|layer| layer.permits(digits))
            && self.pair_links.iter().flatten().all(|link| {
                let [left, right] = link.constraint.cells.map(|cell| digits[cell]);
                left == 0 || right == 0 || link.constraint.permits(left, right)
            })
    }
}

fn arrow_masks(circle: usize, cells: &[usize], candidates: &[u16]) -> (u16, [u16; MAX_SIZE]) {
    let mut support = [0; MAX_SIZE];
    let totals = u32::from(candidates[circle]) << 1;
    if totals == 0 {
        return (0, support);
    }

    // A bulb holds at most one digit. Prefix sums beyond its largest
    // candidate cannot contribute to a completion of this arrow.
    let limit = u32::MAX >> totals.leading_zeros();
    let mut prefix = [0; MAX_SIZE + 1];
    prefix[0] = 1;
    for (index, &cell) in cells.iter().enumerate() {
        let mut domain = candidates[cell];
        let mut sums = 0;
        while domain != 0 {
            let digit = domain.trailing_zeros() + 1;
            domain &= domain - 1;
            sums |= prefix[index] << digit;
        }
        prefix[index + 1] = sums & limit;
        if prefix[index + 1] == 0 {
            return (0, support);
        }
    }
    let matching = prefix[cells.len()] & totals;
    if matching == 0 {
        return (0, support);
    }

    let mut allowed = matching;
    for (index, &cell) in cells.iter().enumerate().rev() {
        let mut domain = candidates[cell];
        let mut previous = 0;
        while domain != 0 {
            let bit = domain & domain.wrapping_neg();
            domain ^= bit;
            let viable = prefix[index] & (allowed >> (bit.trailing_zeros() + 1));
            if viable != 0 {
                support[index] |= bit;
                previous |= viable;
            }
        }
        allowed = previous;
    }
    ((matching >> 1) as u16, support)
}

fn sum_bounds(cells: &[usize], digits: &[u8], size: usize) -> (usize, usize) {
    cells.iter().fold((0, 0), |(min, max), &cell| {
        let digit = usize::from(digits[cell]);
        if digit == 0 { (min + 1, max + size) } else { (min + digit, max + digit) }
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
    use super::{GridSpec, MAX_SIZE, SizedConstraint, SizedConstraintGrid, arrow_masks};
    use crate::{Analysis, ClueDirection, variant::MarkedPairs};

    fn digits(solution: &str) -> Vec<u8> {
        solution.bytes().map(|digit| digit - b'0').collect()
    }

    #[test]
    fn six_by_six_slow_thermometers_allow_equal_digits_with_xv_and_sandwich() {
        let spec = GridSpec { size: 6, box_rows: 2, box_columns: 3 };
        let slow = vec![
            SizedConstraint::SlowThermometer { cells: vec![33, 26, 21, 14, 9, 2] },
            SizedConstraint::SlowThermometer { cells: vec![32, 27, 20, 15, 8, 3] },
            SizedConstraint::Xv {
                five: MarkedPairs { pairs: vec![[7, 8], [21, 22], [19, 20], [21, 27], [33, 34]], negative: false },
                ten: MarkedPairs { pairs: vec![[2, 8]], negative: false },
            },
            SizedConstraint::Sandwich { cells: vec![3, 9, 15, 21, 27, 33], direction: ClueDirection::South, sum: 6 },
        ];
        let solution = digits("326541514632145263632415263154451326");
        let grid = SizedConstraintGrid::new(spec, &slow).unwrap();
        assert_eq!(grid.solve_unique(&solution, 100), Ok(solution.clone()));

        let strict: Vec<_> = slow.iter().map(|rule| match rule {
            SizedConstraint::SlowThermometer { cells } => SizedConstraint::Thermometer { cells: cells.clone() },
            other => other.clone(),
        }).collect();
        let strict_grid = SizedConstraintGrid::new(spec, &strict).unwrap();
        assert_eq!(strict_grid.analyze(&solution, 100), Analysis::Conflict);
    }

    #[test]
    fn six_by_six_whispers_keep_separate_minimums_with_thermometer_and_sandwich() {
        let spec = GridSpec { size: 6, box_rows: 2, box_columns: 3 };
        let rules = vec![
            SizedConstraint::Thermometer { cells: vec![24, 31, 32, 33, 34, 29] },
            SizedConstraint::Whispers { cells: vec![26, 20, 14, 8, 2, 7, 12, 13], min_difference: 2 },
            SizedConstraint::Whispers { cells: vec![27, 21, 15, 16], min_difference: 3 },
            SizedConstraint::Whispers { cells: vec![15, 9, 3, 10, 17], min_difference: 3 },
            SizedConstraint::Sandwich { cells: vec![5, 4, 3, 2, 1, 0], direction: ClueDirection::West, sum: 2 },
        ];
        let solution = digits("536214412563365142241635154326623451");
        let grid = SizedConstraintGrid::new(spec, &rules).unwrap();
        assert_eq!(grid.solve_unique(&solution, 100), Ok(solution));
    }

    #[test]
    fn bounded_arrow_support_matches_the_general_sum_kernel() {
        fn check(candidates: &[u16]) {
            let cells = [1, 2, 3, 4];
            let shaft = &cells[..candidates.len() - 1];
            let mut support = [0; MAX_SIZE];
            let [matched] = crate::variant::sum_support_with_prefix(
                &candidates[1..],
                [u128::from(candidates[0]) << 1],
                &mut support[..shaft.len()],
                &mut [[0]; MAX_SIZE + 1],
            );
            assert_eq!(arrow_masks(0, shaft, candidates), ((matched >> 1) as u16, support));
        }

        for bulb in 0..16 {
            for a in 0..16 {
                for b in 0..16 {
                    check(&[bulb, a, b]);
                    for c in 0..16 {
                        check(&[bulb, a, b, c]);
                    }
                }
            }
        }
        check(&[1 << 15, 1 << 15]);
        check(&[1 << 15, 1 << 14, 1]);
        check(&[1 << 15, 1 << 15, 1]);
        check(&[u16::MAX, u16::MAX, u16::MAX, u16::MAX, u16::MAX]);
    }
}
