mod killer;
mod pairs;
mod region_sum;

use super::{GridSpec, MAX_SIZE, SizedDeduction, SizedGrid};
use crate::{Analysis, Candidate, HintAction, House};
pub use crate::variant::{Diagonal as SizedDiagonal, MarkedPairs, Parity as SizedParity};

use self::killer::Cage;
use self::pairs::{SizedPairLink, compile_pairs};
use self::region_sum::RegionSum;

/// Rules on a sized grid. Thermometer cells are listed from the bulb to the tip.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SizedConstraint {
    Diagonal(SizedDiagonal),
    Parity {
        cells: Vec<usize>,
        parity: SizedParity,
    },
    Thermometer {
        cells: Vec<usize>,
    },
    Arrow {
        circle: usize,
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
    Renban {
        cells: Vec<usize>,
    },
    Kropki {
        consecutive: MarkedPairs,
        ratio_two: MarkedPairs,
    },
    LabeledDots {
        relation: SizedDotRelation,
        marks: Vec<SizedLabeledDot>,
        negative: bool,
    },
    Difference {
        cells: [usize; 2],
        difference: u8,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Deserialize, serde::Serialize), serde(rename_all = "kebab-case"))]
pub enum SizedDotRelation {
    Difference,
    Ratio,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
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
    Kropki { rule: usize, pair: SizedKropkiPair },
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
    thermometers: Vec<Vec<usize>>,
    renbans: Vec<Vec<usize>>,
    arrows: Vec<(usize, Vec<usize>)>,
    region_sums: Vec<Option<RegionSum>>,
    cages: Vec<Vec<Cage>>,
    pair_links: Vec<Vec<SizedPairLink>>,
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
        let mut thermometers = Vec::new();
        let mut renbans = Vec::new();
        let mut arrows = Vec::new();
        let mut region_sums = Vec::new();
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
                    thermometers.push(cells.clone());
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
                SizedConstraint::KillerCages { cages: authored, cover_grid } => {
                    cages.resize_with(index + 1, Vec::new);
                    for cage in authored {
                        cages[index].push(Cage::compile(&layout, cage, &mut occupied)?);
                    }
                    if authored.is_empty() || *cover_grid && !occupied[..layout.cell_count()].iter().all(|&cell| cell) {
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
                SizedConstraint::Kropki { .. } | SizedConstraint::Difference { .. } | SizedConstraint::LabeledDots { .. } => {}
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
            thermometers,
            renbans,
            arrows,
            region_sums,
            cages,
            pair_links,
        })
    }

    /// Count at most two completions under every supplied rule.
    pub fn analyze(&self, digits: &[u8], budget: u32) -> Analysis {
        self.search(digits, budget, 2).0
    }

    /// Find a completion which satisfies every active rule.
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
        self.apply_rules(digits, &mut candidates);
        for (cell, &digit) in digits.iter().enumerate() {
            if digit != 0 {
                candidates[cell] = 0;
            }
        }
        Some(candidates)
    }

    fn apply_rules(&self, digits: &[u8], candidates: &mut [u16]) {
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
            for cells in &self.thermometers {
                changed |= self.restrict_thermometer(cells, candidates);
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
            if !changed {
                break;
            }
        }
    }

    fn restrict_thermometer(&self, cells: &[usize], candidates: &mut [u16]) -> bool {
        let mut changed = false;
        let mut lower = self.layout.full_mask;
        for &cell in cells {
            let mask = candidates[cell] & lower;
            changed |= mask != candidates[cell];
            candidates[cell] = mask;
            lower = u16::MAX.checked_shl(mask.trailing_zeros() + 1).unwrap_or(0);
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
                SizedConstraint::Thermometer { cells } => {
                    let mut support = domains.clone();
                    self.restrict_thermometer(cells, &mut support);
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
                SizedConstraint::Kropki { .. } | SizedConstraint::LabeledDots { .. } => {
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
                            choices.push(SizedConstraintStep::Kropki { rule, pair: link.kropki_proof()?, actions });
                            if choices.len() == limit {
                                break;
                            }
                        }
                    }
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
                | SizedConstraintStep::Kropki { actions, .. } => {
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
                        | Some(SizedConstraintStep::Kropki { actions, .. }) => actions,
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
                SizedConstraint::Thermometer { cells } => {
                    let mut support = domains.clone();
                    self.restrict_thermometer(cells, &mut support);
                    support.contains(&0)
                }
                SizedConstraint::Arrow { circle, cells } => {
                    arrow_masks(*circle, cells, &domains).0 == 0
                }
                SizedConstraint::KillerCages { .. } => self.cages[rule].iter()
                    .any(|cage| cage.support(&domains)[..cage.cells.len()].contains(&0)),
                SizedConstraint::RegionSum { .. } => self.region_sums[rule].as_ref()
                    .is_some_and(|line| !line.support(&domains, &mut [0; MAX_SIZE * MAX_SIZE])),
                SizedConstraint::Renban { cells } => {
                    self.renban_masks(cells, &domains)[..cells.len()].contains(&0)
                }
                SizedConstraint::Difference { .. } => {
                    self.pair_links[rule].iter().any(|link| link.supports(&domains).contains(&0))
                }
                SizedConstraint::Kropki { .. } | SizedConstraint::LabeledDots { .. } => {
                    if let Some(link) = self.pair_links[rule].iter().find(|link| {
                        link.supports(&domains).contains(&0)
                    }) {
                        return Some(SizedConstraintFailure::Kropki { rule, pair: link.kropki_proof()? });
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
                    self.apply_rules(digits, domains);
                    return !domains.contains(&0);
                }
                loop {
                    self.apply_rules(digits, domains);
                    if domains.contains(&0) {
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
            && self.diagonals.iter().all(|cells| {
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
            && self.thermometers.iter().all(|cells| {
                let mut low = 1;
                for (index, &cell) in cells.iter().enumerate() {
                    let digit = usize::from(digits[cell]);
                    if digit != 0 {
                        if digit < low {
                            return false;
                        }
                        low = digit;
                    }
                    if low + cells.len() - index - 1 > self.layout.size() {
                        return false;
                    }
                    low += 1;
                }
                true
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
            && self.cages.iter().flatten().all(|cage| cage.permits(digits))
            && self.region_sums.iter().flatten().all(|line| line.permits(digits))
            && self.pair_links.iter().flatten().all(|link| {
                let [left, right] = link.constraint.cells.map(|cell| digits[cell]);
                left == 0 || right == 0 || link.constraint.permits(left, right)
            })
    }
}

fn arrow_masks(circle: usize, cells: &[usize], candidates: &[u16]) -> (u16, [u16; MAX_SIZE]) {
    let mut shaft = [0; MAX_SIZE];
    let mut support = [0; MAX_SIZE];
    for (mask, &cell) in shaft.iter_mut().zip(cells) {
        *mask = candidates[cell];
    }
    // A bulb is a single digit, so sums that exceed the bitset cannot qualify.
    let totals = u128::from(candidates[circle]) << 1;
    let [matching] = crate::variant::sum_support_with_prefix(
        &shaft[..cells.len()], [totals], &mut support[..cells.len()], &mut [[0]; MAX_SIZE + 1],
    );
    ((matching >> 1) as u16, support)
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
