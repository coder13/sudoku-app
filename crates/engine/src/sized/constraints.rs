use super::{GridSpec, SizedDeduction, SizedGrid};
use crate::{Analysis, Candidate, HintAction, House};

/// Diagonals use row-major coordinates. Main runs from top left to bottom right.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum SizedDiagonal {
    Main,
    Anti,
}

/// A marker restricts its cell to digits of one parity.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum SizedParity {
    Odd,
    Even,
}

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

/// A rectangular-box grid with a jointly enforced list of sized rules.
#[derive(Debug)]
pub struct SizedConstraintGrid {
    layout: SizedGrid,
    rules: Vec<SizedConstraint>,
    parity: Vec<(usize, u16)>,
    diagonals: Vec<Vec<usize>>,
    thermometers: Vec<Vec<usize>>,
}

impl SizedConstraintGrid {
    pub fn new(spec: GridSpec, rules: &[SizedConstraint]) -> Option<Self> {
        let layout = SizedGrid::new(spec)?;
        let mut parity = vec![layout.full_mask; layout.cell_count()];
        let mut diagonals = Vec::new();
        let mut thermometers = Vec::new();
        for rule in rules {
            match rule {
                SizedConstraint::Diagonal(direction) => {
                    let diagonal = diagonal_cells(spec.size, *direction).collect();
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
                    if !(2..=spec.size).contains(&cells.len())
                        || cells.iter().enumerate().any(|(index, &cell)| {
                            cell >= layout.cell_count() || cells[..index].contains(&cell)
                        })
                    {
                        return None;
                    }
                    thermometers.push(cells.clone());
                }
            }
        }
        let parity = parity
            .into_iter()
            .enumerate()
            .filter(|(_, mask)| *mask != layout.full_mask)
            .collect();
        Some(Self {
            layout,
            rules: rules.to_vec(),
            parity,
            diagonals,
            thermometers,
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

    /// Apply the placed digits, parity, and support through overlapping thermometers.
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
        let house = self
            .layout
            .find_hints(digits, eliminations, limit, singles_only)?;
        if !self.permits(digits) {
            return None;
        }
        let mut choices = Vec::new();
        let mut domains = house.candidates.clone();
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
                    let cells = diagonal_cells(self.layout.spec.size, *direction);
                    let used = cells
                        .clone()
                        .filter(|&cell| digits[cell] != 0)
                        .fold(0, |used, cell| used | domains[cell]);
                    for cell in cells.clone().filter(|&cell| digits[cell] == 0) {
                        eliminations_for(cell, domains[cell] & used, &mut actions);
                    }
                    if actions.is_empty() {
                        for digit in 1..=self.layout.spec.size as u8 {
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
                        eliminations_for(cell, house.candidates[cell] & excluded, &mut actions);
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
                            house.candidates[cell] & !support[cell],
                            &mut actions,
                        );
                    }
                }
            }
            if !actions.is_empty() {
                choices.push(SizedConstraintStep::Rule { rule, actions });
            }
        }
        let remaining = limit - choices.len();
        choices.extend(
            house
                .choices
                .into_iter()
                .take(remaining)
                .map(|proof| SizedConstraintStep::House { proof }),
        );
        Some(SizedConstraintHints {
            candidates: house.candidates,
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
                SizedConstraintStep::Rule { actions, .. } => {
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
        if self.layout.spec.size != 6 {
            return None;
        }
        let mut cells: Vec<_> = (0..candidates.len())
            .filter(|&cell| candidates[cell] != 0)
            .collect();
        cells.sort_unstable_by_key(|&cell| (candidates[cell].count_ones(), cell));
        let mut budget = 2048;
        let mut branch = digits.to_vec();
        let mut removed = eliminations.to_vec();
        let mut placements = Vec::new();
        for cell in cells {
            for digit in 1..=6 {
                if candidates[cell] & (1 << (digit - 1)) == 0 {
                    continue;
                }
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
                        Some(SizedConstraintStep::Rule { actions, .. }) => actions,
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
                    for cell in diagonal_cells(self.layout.spec.size, *direction) {
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
        self.layout
            .search_filtered::<true>(digits, budget, limit, |digits, used, domains| {
                for (cell, &digit) in digits.iter().enumerate() {
                    domains[cell] = if digit == 0 {
                        self.layout.available(cell, used)
                    } else {
                        1 << (digit - 1)
                    };
                }
                self.apply_rules(digits, domains);
                !domains.contains(&0)
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
                    if low + cells.len() - index - 1 > self.layout.spec.size {
                        return false;
                    }
                    low += 1;
                }
                true
            })
    }
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
