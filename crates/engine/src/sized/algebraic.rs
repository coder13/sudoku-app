use std::collections::BTreeMap;

use super::{GridSpec, SizedDeduction, SizedGrid};
use crate::{Analysis, Candidate, HintAction};

/// A cage's total. All references to a name share one positive integer.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum CageTotal {
    Fixed(u16),
    Variable { name: String, offset: i32 },
}

/// A nonrepeating sum cage and its original label.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct AlgebraicCage {
    pub cells: Vec<usize>,
    pub total: CageTotal,
    pub label: String,
}

/// An exact completion assigns both the Sudoku digits and each shared integer.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct AlgebraicCompletion {
    pub digits: Vec<u8>,
    pub variables: BTreeMap<String, i64>,
}

/// A bound from one cage after accounting for its placed and remaining digits.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct AlgebraicCageBound {
    pub cage: usize,
    pub sum_lower: i64,
    pub sum_upper: i64,
}

type DomainBounds = BTreeMap<String, (i64, i64)>;

/// An intersection of all cage bounds, including positivity for each variable.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct AlgebraicBounds {
    pub variables: DomainBounds,
    pub cages: Vec<AlgebraicCageBound>,
}

/// Candidate removals proved by the shared bounds and a cage's distinct assignments.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct AlgebraicCageProof {
    pub target: usize,
    pub bounds: AlgebraicBounds,
    pub total_lower: i64,
    pub total_upper: i64,
    pub actions: Vec<HintAction>,
}

/// A human-style deduction made with the grid houses or the algebraic cage rules.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "type", content = "proof", rename_all = "kebab-case")
)]
pub enum AlgebraicStep {
    House(SizedDeduction),
    Cage(AlgebraicCageProof),
}

impl AlgebraicStep {
    pub fn actions(&self) -> &[HintAction] {
        match self {
            Self::House(step) => &step.actions,
            Self::Cage(step) => &step.actions,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct AlgebraicTracePosition {
    pub digits: Vec<u8>,
    pub eliminations: Vec<u16>,
    pub candidates: Vec<u16>,
    pub step: Option<AlgebraicStep>,
}

/// Supported steps and the candidate masks used to find them.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct AlgebraicHints {
    pub candidates: Vec<u16>,
    pub choices: Vec<AlgebraicStep>,
}

#[derive(Debug)]
pub struct SizedAlgebraicCages {
    size: usize,
    layout: SizedGrid,
    cages: Vec<AlgebraicCage>,
    variable_ids: BTreeMap<String, usize>,
    cage_variables: Vec<Option<usize>>,
}

impl SizedAlgebraicCages {
    /// Compile nonempty cages. Cell IDs and cage digits use the grid's own size.
    pub fn new(spec: GridSpec, cages: Vec<AlgebraicCage>) -> Option<Self> {
        let layout = SizedGrid::new(spec)?;
        if cages.is_empty() {
            return None;
        }
        let mut variable_ids = BTreeMap::new();
        let cage_variables = cages
            .iter()
            .map(|cage| {
                if cage.cells.is_empty() || cage.cells.len() > spec.size || cage.label.is_empty() {
                    return None;
                }
                let mut seen = [false; 256];
                for &cell in &cage.cells {
                    if cell >= layout.cell_count() || std::mem::replace(&mut seen[cell], true) {
                        return None;
                    }
                }
                match &cage.total {
                    CageTotal::Fixed(_) => Some(None),
                    CageTotal::Variable { name, .. } if valid_name(name) => {
                        let next = variable_ids.len();
                        Some(Some(*variable_ids.entry(name.clone()).or_insert(next)))
                    }
                    CageTotal::Variable { .. } => None,
                }
            })
            .collect::<Option<_>>()?;
        Some(Self {
            size: spec.size,
            layout,
            cages,
            variable_ids,
            cage_variables,
        })
    }

    pub fn cages(&self) -> &[AlgebraicCage] {
        &self.cages
    }

    /// Give a conservative interval for each variable and the source cage bounds.
    pub fn bounds(&self, digits: &[u8]) -> Option<AlgebraicBounds> {
        self.layout.used_digits(digits)?;
        let mut domains = self.empty_domains();
        self.intersect(digits, &mut domains)?;
        self.bounds_from_domains(digits, &domains)
    }

    fn bounds_from_domains(
        &self,
        digits: &[u8],
        domains: &[(i64, i64)],
    ) -> Option<AlgebraicBounds> {
        let variables = self
            .variable_ids
            .iter()
            .map(|(name, &index)| (name.clone(), domains[index]))
            .collect();
        let cages = self
            .cages
            .iter()
            .enumerate()
            .map(|(cage, definition)| {
                let (sum_lower, sum_upper) = self.cage_bounds(digits, definition)?;
                Some(AlgebraicCageBound {
                    cage,
                    sum_lower,
                    sum_upper,
                })
            })
            .collect::<Option<_>>()?;
        Some(AlgebraicBounds { variables, cages })
    }

    /// Check which candidates can occur in one cage under the current shared bounds.
    /// A search that exhausts its budget returns no proof.
    pub fn proof_at(
        &self,
        digits: &[u8],
        eliminations: &[u16],
        target: usize,
        node_budget: u32,
    ) -> Option<AlgebraicCageProof> {
        if eliminations.len() != self.layout.cell_count()
            || eliminations
                .iter()
                .any(|&mask| mask & !self.layout.full_mask != 0)
        {
            return None;
        }
        let bounds = self.bounds(digits)?;
        let mut allowed = self.layout.candidates(digits)?;
        for (mask, removed) in allowed.iter_mut().zip(eliminations) {
            *mask &= !removed;
        }
        self.prove_cage(digits, &allowed, &bounds, target, node_budget)
    }

    fn prove_cage(
        &self,
        digits: &[u8],
        allowed: &[u16],
        bounds: &AlgebraicBounds,
        target: usize,
        node_budget: u32,
    ) -> Option<AlgebraicCageProof> {
        let cage = self.cages.get(target)?;
        let (total_lower, total_upper) = match &cage.total {
            CageTotal::Fixed(total) => (i64::from(*total), i64::from(*total)),
            CageTotal::Variable { name, offset } => {
                let (low, high) = bounds.variables[name];
                (low + i64::from(*offset), high + i64::from(*offset))
            }
        };
        let mut open = Vec::new();
        let mut used = 0u16;
        let mut partial_sum = 0;
        for &cell in &cage.cells {
            let digit = digits[cell];
            if digit != 0 {
                used |= 1 << (digit - 1);
                partial_sum += i64::from(digit);
            } else {
                let mask = allowed[cell];
                if mask == 0 {
                    return None;
                }
                open.push((cell, mask));
            }
        }
        open.sort_by_key(|&(_, mask)| mask.count_ones());
        let mut scan = CageAssignments {
            open: &open,
            total: total_lower..=total_upper,
            budget: node_budget,
            supported: [0; 16],
            path: [0; 16],
        };
        scan.visit(0, used, partial_sum)?;
        if scan.supported[..open.len()].contains(&0) {
            return None;
        }
        let actions: Vec<_> = open
            .iter()
            .zip(scan.supported)
            .flat_map(|(&(cell, mask), supported)| {
                (1..=self.size as u8).filter_map(move |digit| {
                    let bit = 1 << (digit - 1);
                    (mask & !supported & bit != 0)
                        .then_some(HintAction::Eliminate(Candidate { cell, digit }))
                })
            })
            .collect();
        (!actions.is_empty()).then(|| AlgebraicCageProof {
            target,
            bounds: bounds.clone(),
            total_lower,
            total_upper,
            actions,
        })
    }

    /// Find the next ordinary logical step or a cage step with bound evidence.
    pub fn next_deduction(
        &self,
        digits: &[u8],
        eliminations: &[u16],
        proof_budget: u32,
    ) -> Option<AlgebraicStep> {
        self.hints(digits, eliminations, proof_budget, 1)?
            .choices
            .pop()
    }

    /// List supported steps in priority order for the hint picker and technique finder.
    pub fn hints(
        &self,
        digits: &[u8],
        eliminations: &[u16],
        proof_budget: u32,
        limit: usize,
    ) -> Option<AlgebraicHints> {
        let classic = self.layout.hints(digits, eliminations, limit)?;
        let mut domains = self.empty_domains();
        self.intersect(digits, &mut domains)?;
        let mut choices: Vec<_> = classic
            .choices
            .into_iter()
            .map(AlgebraicStep::House)
            .collect();
        if choices.len() < limit {
            let bounds = self.bounds_from_domains(digits, &domains)?;
            let mut order: Vec<_> = (0..self.cages.len()).collect();
            order.sort_by_key(|&index| self.cages[index].cells.len());
            let remaining = limit - choices.len();
            choices.extend(
                order
                    .into_iter()
                    .filter_map(|index| {
                        self.prove_cage(digits, &classic.candidates, &bounds, index, proof_budget)
                            .map(AlgebraicStep::Cage)
                    })
                    .take(remaining),
            );
        }
        Some(AlgebraicHints {
            candidates: classic.candidates,
            choices,
        })
    }

    /// Replay supported logical steps without using the exact answer.
    pub fn trace(
        &self,
        mut digits: Vec<u8>,
        mut eliminations: Vec<u16>,
        proof_budget: u32,
    ) -> Option<Vec<AlgebraicTracePosition>> {
        let mut positions = Vec::new();
        loop {
            let mut hints = self.hints(&digits, &eliminations, proof_budget, 1)?;
            positions.push(AlgebraicTracePosition {
                digits: digits.clone(),
                eliminations: eliminations.clone(),
                candidates: hints.candidates,
                step: hints.choices.pop(),
            });
            let Some(step) = &positions.last()?.step else {
                return Some(positions);
            };
            for action in step.actions() {
                match *action {
                    HintAction::Place(Candidate { cell, digit }) => digits[cell] = digit,
                    HintAction::Eliminate(Candidate { cell, digit }) => {
                        eliminations[cell] |= 1 << (digit - 1)
                    }
                }
            }
        }
    }

    /// Count completions under both the houses and the shared integer rules.
    pub fn analyze(&self, digits: &[u8], node_budget: u32) -> Analysis {
        self.search(digits, node_budget, 2).0
    }

    /// Find one verified completion.
    pub fn solve(&self, digits: &[u8], node_budget: u32) -> Option<AlgebraicCompletion> {
        let (_, digits) = self.search(digits, node_budget, 1);
        let digits = digits?;
        let bounds = self.bounds(&digits)?;
        let variables = bounds
            .variables
            .into_iter()
            .map(|(name, (lower, upper))| (lower == upper).then_some((name, lower)))
            .collect::<Option<_>>()?;
        Some(AlgebraicCompletion { digits, variables })
    }

    fn search(&self, digits: &[u8], node_budget: u32, limit: u8) -> (Analysis, Option<Vec<u8>>) {
        if self.layout.used_digits(digits).is_none()
            || self
                .cages
                .iter()
                .any(|cage| self.cage_bounds(digits, cage).is_none())
        {
            return (Analysis::Conflict, None);
        }
        let mut domains = self.empty_domains();
        self.layout
            .search_with(digits, node_budget, limit, |placed| {
                domains.fill((1, i64::MAX));
                self.intersect(placed, &mut domains).is_some()
            })
    }

    fn empty_domains(&self) -> Vec<(i64, i64)> {
        vec![(1, i64::MAX); self.variable_ids.len()]
    }

    fn intersect(&self, digits: &[u8], domains: &mut [(i64, i64)]) -> Option<()> {
        for (cage, variable) in self.cages.iter().zip(&self.cage_variables) {
            let (lower, upper) = self.cage_bounds(digits, cage)?;
            match (&cage.total, variable) {
                (CageTotal::Fixed(sum), _) if !(lower..=upper).contains(&i64::from(*sum)) => {
                    return None;
                }
                (CageTotal::Variable { offset, .. }, Some(index)) => {
                    let offset = i64::from(*offset);
                    let (left, right) = &mut domains[*index];
                    *left = (*left).max(lower - offset);
                    *right = (*right).min(upper - offset);
                    if left > right {
                        return None;
                    }
                }
                _ => {}
            }
        }
        Some(())
    }

    fn cage_bounds(&self, digits: &[u8], cage: &AlgebraicCage) -> Option<(i64, i64)> {
        let mut used = 0u16;
        let mut sum = 0i64;
        let mut empty = 0;
        for &cell in &cage.cells {
            let digit = digits[cell];
            if digit == 0 {
                empty += 1;
                continue;
            }
            let bit = 1 << (digit - 1);
            if used & bit != 0 {
                return None;
            }
            used |= bit;
            sum += i64::from(digit);
        }
        let remaining = (1..=self.size as u8).filter(|digit| used & (1 << (digit - 1)) == 0);
        let minimum = remaining.clone().take(empty).map(i64::from).sum::<i64>();
        let maximum = remaining.rev().take(empty).map(i64::from).sum::<i64>();
        Some((sum + minimum, sum + maximum))
    }
}

struct CageAssignments<'a> {
    open: &'a [(usize, u16)],
    total: std::ops::RangeInclusive<i64>,
    budget: u32,
    supported: [u16; 16],
    path: [u16; 16],
}

impl CageAssignments<'_> {
    fn visit(&mut self, index: usize, used: u16, sum: i64) -> Option<()> {
        self.budget = self.budget.checked_sub(1)?;
        if sum > *self.total.end() {
            return Some(());
        }
        let Some(&(_, mask)) = self.open.get(index) else {
            if self.total.contains(&sum) {
                for (supported, &chosen) in self.supported.iter_mut().zip(&self.path[..index]) {
                    *supported |= chosen;
                }
            }
            return Some(());
        };
        let mut choices = mask & !used;
        while choices != 0 {
            let shift = choices.trailing_zeros();
            let bit = 1 << shift;
            choices ^= bit;
            self.path[index] = bit;
            self.visit(index + 1, used | bit, sum + i64::from(shift) + 1)?;
        }
        Some(())
    }
}

fn valid_name(name: &str) -> bool {
    let mut bytes = name.bytes();
    name.len() <= 32
        && bytes.next().is_some_and(|byte| byte.is_ascii_alphabetic())
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}
