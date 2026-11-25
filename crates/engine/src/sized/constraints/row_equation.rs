use std::{collections::HashMap, sync::Arc};

use super::SizedGrid;
use crate::hints::digits;

const MAX_CELLS: usize = 5;
type Digits = [u8; MAX_CELLS];
type Masks = [u16; MAX_CELLS];

/// An operator between two cells of a row equation. Join reads two decimal digits.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Deserialize, serde::Serialize))]
#[cfg_attr(feature = "wasm-api", serde(rename_all = "kebab-case"))]
pub enum EquationOperator {
    Join,
    Add,
    Subtract,
    Multiply,
    Divide,
    Equals,
}

use EquationOperator::{Add, Divide, Equals, Join, Multiply, Subtract};

#[derive(Debug)]
pub(super) struct RowEquation {
    pub(super) cells: Vec<usize>,
    matches: Arc<[Masks]>,
}

#[derive(Default)]
pub(super) struct RowEquationTables(HashMap<Vec<EquationOperator>, Arc<[Masks]>>);

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct Fraction(i64, i64);

impl Fraction {
    fn combine(self, operator: EquationOperator, other: Self) -> Option<Self> {
        let Self(a, b) = self;
        let Self(c, d) = other;
        Some(match operator {
            Add => Self(a * d + b * c, b * d),
            Subtract => Self(a * d - b * c, b * d),
            Multiply => Self(a * c, b * d),
            Divide if c != 0 => Self(a * d, b * c),
            _ => return None,
        })
    }

    fn reduced(self) -> Self {
        let Self(numerator, denominator) = self;
        let (mut a, mut b) = (numerator.abs(), denominator.abs());
        while b != 0 {
            (a, b) = (b, a % b);
        }
        let divisor = a * denominator.signum();
        Self(numerator / divisor, denominator / divisor)
    }
}

fn value(ranks: &[u8], operators: &[EquationOperator], offset: u8) -> Option<Fraction> {
    let mut digits = ranks.iter().map(|rank| i64::from(rank - offset));
    let mut operand = digits.next()?;
    let mut pending = Add;
    let mut sum = Fraction(0, 1);
    let mut term = Fraction(0, 1);
    for (operator, next) in operators.iter().copied().zip(digits).chain([(Add, 0)]) {
        if operator == Join {
            if !(1..=9).contains(&operand) || next > 9 {
                return None;
            }
            operand = 10 * operand + next;
            continue;
        }
        let fraction = Fraction(operand, 1);
        match pending {
            Add => term = fraction,
            Subtract => term = Fraction(-operand, 1),
            Multiply | Divide => term = term.combine(pending, fraction)?,
            _ => unreachable!("only arithmetic operators connect operands"),
        }
        if matches!(operator, Add | Subtract) {
            sum = sum.combine(Add, term)?;
        }
        operand = next;
        pending = operator;
    }
    Some(sum.reduced())
}

fn fill_assignments(
    remaining: u16,
    cells: &mut [u8],
    index: usize,
    used: u16,
    visit: &mut impl FnMut(&[u8], u16),
) {
    if index == cells.len() {
        visit(cells, used);
        return;
    }
    for rank in digits(remaining) {
        let bit = 1 << (rank - 1);
        cells[index] = rank;
        fill_assignments(remaining ^ bit, cells, index + 1, used | bit, visit);
    }
}

impl RowEquation {
    pub(super) fn compile(
        grid: &SizedGrid,
        cells: &[usize],
        operators: &[EquationOperator],
        offset: u8,
        tables: &mut RowEquationTables,
    ) -> Option<Self> {
        let size = grid.size();
        if !(3..=MAX_CELLS).contains(&cells.len())
            || operators.len() + 1 != cells.len()
            || !cells.iter().enumerate().all(|(i, &cell)| {
                cell < size * size && cell == cells[0] + i && cell / size == cells[0] / size
            })
            || operators.windows(2).any(|pair| pair == [Join, Join])
        {
            return None;
        }
        let split = operators.iter().position(|&operator| operator == Equals)?;
        let (left, rest) = operators.split_at(split);
        let right = &rest[1..];
        if right.contains(&Equals) {
            return None;
        }
        let matches = if let Some(matches) = tables.0.get(operators) {
            Arc::clone(matches)
        } else {
            let matches: Arc<[Masks]> = possible_rows(grid.full_mask, offset, left, right).into();
            tables.0.insert(operators.to_vec(), Arc::clone(&matches));
            matches
        };
        Some(Self {
            cells: cells.to_vec(),
            matches,
        })
    }

    pub(super) fn support(&self, domains: &[u16]) -> Option<Masks> {
        let mut input = [0; MAX_CELLS];
        for (i, &cell) in self.cells.iter().enumerate() {
            input[i] = domains[cell];
        }
        let mut result = [0; MAX_CELLS];
        let count = self.cells.len();
        for row in self.matches.iter() {
            if row[..count]
                .iter()
                .zip(input)
                .all(|(&rank, allowed)| rank & allowed != 0)
            {
                for (covered, digit) in result.iter_mut().zip(row) {
                    *covered |= digit;
                }
                if result == input {
                    break;
                }
            }
        }
        (result[0] != 0).then_some(result)
    }

    pub(super) fn permits(&self, ranks: &[u8]) -> bool {
        self.matches.iter().any(|row| {
            self.cells.iter().zip(row).all(|(&cell, &allowed)| {
                ranks[cell] == 0 || allowed & (1 << (ranks[cell] - 1)) != 0
            })
        })
    }
}

fn possible_rows(
    full_mask: u16,
    offset: u8,
    left: &[EquationOperator],
    right: &[EquationOperator],
) -> Vec<Masks> {
    let left_len = left.len() + 1;
    let right_len = right.len() + 1;
    let mut sides: HashMap<Fraction, Vec<(u16, Digits)>> = HashMap::new();
    let mut matches = Vec::new();

    // Index the smaller side by its exact value. Only equal results with
    // disjoint digit sets can complete a row equation.
    let (index_left, indexed, indexed_len, queried, queried_len) = if left_len <= right_len {
        (true, left, left_len, right, right_len)
    } else {
        (false, right, right_len, left, left_len)
    };
    fill_assignments(
        full_mask,
        &mut [0; MAX_CELLS][..indexed_len],
        0,
        0,
        &mut |ranks, used| {
            if let Some(result) = value(ranks, indexed, offset) {
                let mut copy = [0; MAX_CELLS];
                copy[..indexed_len].copy_from_slice(ranks);
                sides.entry(result).or_default().push((used, copy));
            }
        },
    );
    fill_assignments(
        full_mask,
        &mut [0; MAX_CELLS][..queried_len],
        0,
        0,
        &mut |ranks, used| {
            let Some(result) = value(ranks, queried, offset) else {
                return;
            };
            if let Some(choices) = sides.get(&result) {
                for (other_used, other) in choices {
                    if used & other_used != 0 {
                        continue;
                    }
                    let other = &other[..indexed_len];
                    let (lhs, rhs) = if index_left {
                        (other, ranks)
                    } else {
                        (ranks, other)
                    };
                    let mut row = [0; MAX_CELLS];
                    for (i, rank) in lhs.iter().chain(rhs).enumerate() {
                        row[i] = 1 << (rank - 1);
                    }
                    matches.push(row);
                }
            }
        },
    );
    matches
}
