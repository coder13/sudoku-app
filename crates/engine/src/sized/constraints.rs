use super::{GridSpec, SizedGrid};
use crate::Analysis;

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

/// A rectangular-box grid with a jointly enforced list of sized rules.
#[derive(Debug)]
pub struct SizedConstraintGrid {
    layout: SizedGrid,
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
                    let diagonal: Vec<_> = (0..spec.size)
                        .map(|row| {
                            row * spec.size
                                + match direction {
                                    SizedDiagonal::Main => row,
                                    SizedDiagonal::Anti => spec.size - 1 - row,
                                }
                        })
                        .collect();
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
            }
            if !changed {
                break;
            }
        }
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
