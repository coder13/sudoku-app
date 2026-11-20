use crate::hints::digits;
use crate::variant::ClueDirection;

use super::{MAX_SIZE, SizedGrid};

/// A digit in an end circle or an X-Sum outside the grid.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize, serde::Deserialize), serde(untagged, deny_unknown_fields))]
pub enum SizedSumEnd {
    Digit(usize),
    XSum { direction: ClueDirection, index: usize },
}

#[derive(Debug)]
pub(super) struct LinkedDoubleArrow {
    pub(super) cells: Vec<usize>,
    path: Vec<usize>,
    ends: [End; 2],
    size: usize,
    cases: Vec<SumCase>,
    largest_target: usize,
}

#[derive(Debug)]
struct End {
    ray: Vec<usize>,
    x_sum: bool,
}

#[derive(Debug)]
struct SumCase {
    heads: [Option<(usize, u8)>; 2],
    terms: Vec<(usize, i8)>,
    free: Vec<usize>,
    target: usize,
}

impl End {
    fn compile(layout: &SizedGrid, end: SizedSumEnd) -> Option<Self> {
        let size = layout.size();
        let ray = match end {
            SizedSumEnd::Digit(cell) => {
                return (cell < layout.cell_count()).then(|| Self { ray: vec![cell], x_sum: false });
            }
            SizedSumEnd::XSum { direction, index } if index < size => {
                (0..size)
                    .map(|offset| match direction {
                        ClueDirection::North => Some((size - 1 - offset) * size + index),
                        ClueDirection::South => Some(offset * size + index),
                        ClueDirection::East => Some(index * size + offset),
                        ClueDirection::West => Some(index * size + size - 1 - offset),
                        _ => None,
                    })
                    .collect::<Option<Vec<_>>>()?
            }
            _ => return None,
        };
        Some(Self { ray, x_sum: true })
    }

    fn total(&self, digits: &[u8]) -> usize {
        let count = if self.x_sum { usize::from(digits[self.ray[0]]) } else { 1 };
        self.ray[..count].iter().map(|&cell| usize::from(digits[cell])).sum()
    }

    fn head(&self, length: usize) -> Option<(usize, u8)> {
        self.x_sum.then_some((self.ray[0], length as u8))
    }
}

impl LinkedDoubleArrow {
    pub(super) fn compile(layout: &SizedGrid, ends: [SizedSumEnd; 2], path: &[usize]) -> Option<Self> {
        if ends[0] == ends[1] || path.is_empty() || path.len() > layout.cell_count() ||
            path.iter().enumerate().any(|(index, &cell)| {
                cell >= layout.cell_count() || path[..index].contains(&cell) ||
                    ends.contains(&SizedSumEnd::Digit(cell))
            })
        {
            return None;
        }
        let size = layout.size();
        let ends = [End::compile(layout, ends[0])?, End::compile(layout, ends[1])?];
        let mut cells: Vec<_> = path.iter().copied().chain(ends.iter().flat_map(|end| end.ray.iter().copied())).collect();
        cells.sort_unstable();
        cells.dedup();

        // An X-Sum prefix length fixes its first digit. Merge coefficients
        // before computing any domains so a shared cell has one assignment.
        let mut cases = Vec::new();
        for first in 1..=ends[0].ray.len() {
            for second in 1..=ends[1].ray.len() {
                let heads = [ends[0].head(first), ends[1].head(second)];
                if let [Some((left, a)), Some((right, b))] = heads {
                    if left == right && a != b {
                        continue;
                    }
                }
                let mut weights = [0i8; MAX_SIZE * MAX_SIZE];
                for &cell in path {
                    weights[cell] = 1;
                }
                for (end, length) in ends.iter().zip([first, second]) {
                    for &cell in &end.ray[..length] {
                        weights[cell] -= 1;
                    }
                }
                let mut target = 0i32;
                let mut terms = Vec::new();
                let mut free = Vec::new();
                for &cell in &cells {
                    let weight = weights[cell];
                    if let Some((_, pinned)) = heads.iter().flatten().find(|&&(head, _)| head == cell) {
                        target -= i32::from(weight) * i32::from(*pinned);
                    } else if weight == 0 {
                        free.push(cell);
                    } else {
                        if weight < 0 {
                            target += i32::from(-weight) * (size as i32 + 1);
                        }
                        terms.push((cell, weight));
                    }
                }
                if let Ok(target) = usize::try_from(target) {
                    cases.push(SumCase { heads, terms, free, target });
                }
            }
        }
        let largest_target = cases.iter().map(|case| case.target).max().unwrap_or(0);
        Some(Self { cells, path: path.to_vec(), ends, size, cases, largest_target })
    }

    pub(super) fn permits(&self, values: &[u8]) -> bool {
        self.cells.iter().any(|&cell| values[cell] == 0) ||
            self.path.iter().map(|&cell| usize::from(values[cell])).sum::<usize>()
                == self.ends.iter().map(|end| end.total(values)).sum::<usize>()
    }

    pub(super) fn support(&self, domains: &[u16], supported: &mut [u16]) -> bool {
        if self.cells.iter().any(|&cell| domains[cell] == 0) {
            return false;
        }
        if self.largest_target < 128 {
            self.restrict::<1>(domains, supported)
        } else {
            self.restrict::<5>(domains, supported)
        }
    }

    fn restrict<const WORDS: usize>(&self, domains: &[u16], supported: &mut [u16]) -> bool {
        let mut prefix = vec![[0u128; WORDS]; self.cells.len() + 1];
        prefix[0][0] = 1;
        let mut matched = false;
        for case in &self.cases {
            if case.heads.iter().flatten().any(|&(cell, digit)| domains[cell] & (1 << (digit - 1)) == 0) {
                continue;
            }
            let len = case.terms.len();
            for (index, &(cell, weight)) in case.terms.iter().enumerate() {
                let mut next = [0; WORDS];
                for digit in digits(domains[cell]) {
                    let amount = self.weighted_digit(weight, digit);
                    for word in 0..WORDS {
                        next[word] |= prefix[index][word] << amount;
                        if word > 0 {
                            next[word] |= prefix[index][word - 1] >> (128 - amount);
                        }
                    }
                }
                prefix[index + 1] = next;
            }
            let mut allowed = [0u128; WORDS];
            let word = case.target / 128;
            allowed[word] = 1 << (case.target % 128);
            if prefix[len][word] & allowed[word] == 0 {
                continue;
            }
            matched = true;
            for &(cell, digit) in case.heads.iter().flatten() {
                supported[cell] |= 1 << (digit - 1);
            }
            for &cell in &case.free {
                supported[cell] |= domains[cell];
            }
            for (index, &(cell, weight)) in case.terms.iter().enumerate().rev() {
                let mut previous = [0; WORDS];
                for digit in digits(domains[cell]) {
                    let amount = self.weighted_digit(weight, digit);
                    for word in 0..WORDS {
                        let mut shift = allowed[word] >> amount;
                        if word + 1 < WORDS {
                            shift |= allowed[word + 1] << (128 - amount);
                        }
                        if shift & prefix[index][word] != 0 {
                            supported[cell] |= 1 << (digit - 1);
                        }
                        previous[word] |= shift;
                    }
                }
                allowed = previous;
            }
            if self.cells.iter().all(|&cell| supported[cell] == domains[cell]) {
                break;
            }
        }
        matched
    }

    fn weighted_digit(&self, weight: i8, digit: u8) -> usize {
        let digit = usize::from(digit);
        // Reflect negative terms around size + 1 to use nonnegative shifts.
        if weight > 0 { digit * weight as usize }
        else { (self.size + 1 - digit) * usize::from(weight.unsigned_abs()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn composed_end_totals_above_128_preserve_a_wide_digit() {
        let size = 16;
        let grid = SizedGrid::without_regions(size).unwrap();
        let values: Vec<_> = (0..size * size)
            .map(|cell| (1 + (cell / size + cell % size) % size) as u8)
            .collect();
        let path: Vec<_> = (0..2 * size).filter(|&cell| cell != 13 && cell != 30).collect();
        let rule = LinkedDoubleArrow::compile(
            &grid,
            [
                SizedSumEnd::XSum { direction: ClueDirection::East, index: 14 },
                SizedSumEnd::XSum { direction: ClueDirection::West, index: 15 },
            ],
            &path,
        ).unwrap();
        assert!(rule.permits(&values));
        assert!(rule.largest_target >= 128);
        let mut domains: Vec<_> = values.iter().map(|&digit| 1 << (digit - 1)).collect();
        domains[15] = u16::MAX;
        let mut supported = vec![0; domains.len()];
        assert!(rule.support(&domains, &mut supported));
        assert_eq!(supported[15], 0x8000);
    }
}
