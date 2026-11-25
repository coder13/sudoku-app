use super::super::MAX_SIZE;
use crate::ClueDirection;

#[derive(Debug)]
pub(super) struct Sandwich {
    cells: Vec<usize>,
    size: usize,
    sum: usize,
}

impl Sandwich {
    pub fn compile(
        size: usize,
        cells: &[usize],
        direction: ClueDirection,
        sum: u16,
    ) -> Option<Self> {
        if size > 8 || cells.len() != size || cells.iter().any(|&cell| cell >= size * size) {
            return None;
        }
        let first = *cells.first()?;
        let (row, column) = (first / size, first % size);
        let valid = match direction {
            ClueDirection::North => {
                row == size - 1
                    && cells
                        .iter()
                        .enumerate()
                        .all(|(i, &cell)| cell == first - i * size)
            }
            ClueDirection::East => {
                column == 0 && cells.iter().enumerate().all(|(i, &cell)| cell == first + i)
            }
            ClueDirection::South => {
                row == 0
                    && cells
                        .iter()
                        .enumerate()
                        .all(|(i, &cell)| cell == first + i * size)
            }
            ClueDirection::West => {
                column == size - 1 && cells.iter().enumerate().all(|(i, &cell)| cell == first - i)
            }
            _ => false,
        };
        let max_sum = size * (size + 1) / 2 - size - 1;
        if !valid || usize::from(sum) > max_sum {
            return None;
        }
        Some(Self {
            cells: cells.to_vec(),
            size,
            sum: usize::from(sum),
        })
    }

    pub fn cells(&self) -> impl Iterator<Item = usize> + '_ {
        self.cells.iter().copied()
    }

    pub fn permits(&self, digits: &[u8]) -> bool {
        let Some(one) = self.cells.iter().position(|&cell| digits[cell] == 1) else {
            return true;
        };
        let Some(high) = self
            .cells
            .iter()
            .position(|&cell| digits[cell] as usize == self.size)
        else {
            return true;
        };
        let (start, end) = (one.min(high), one.max(high));
        let (sum, empty) = self.cells[start + 1..end]
            .iter()
            .fold((0, 0), |(sum, empty), &cell| {
                (
                    sum + usize::from(digits[cell]),
                    empty + usize::from(digits[cell] == 0),
                )
            });
        sum <= self.sum && sum + empty * (self.size - 1) >= self.sum
    }

    pub fn support(&self, domains: &[u16], supported: &mut [u16; MAX_SIZE * MAX_SIZE]) -> bool {
        let size = self.size;
        let one = 1u16;
        let highest = 1u16 << (size - 1);
        let all = (1u16 << size) - 1;
        let middle_digits = all & !one & !highest;
        let mut found = false;

        for one_cell in 0..size {
            if domains[self.cells[one_cell]] & one == 0 {
                continue;
            }
            for high_cell in 0..size {
                if high_cell == one_cell || domains[self.cells[high_cell]] & highest == 0 {
                    continue;
                }
                let start = one_cell.min(high_cell);
                let end = one_cell.max(high_cell);
                let middle: Vec<_> = (start + 1..end).map(|index| self.cells[index]).collect();
                let outside: Vec<_> = (0..size)
                    .filter(|&index| {
                        index != one_cell && index != high_cell && !(start < index && index < end)
                    })
                    .map(|index| self.cells[index])
                    .collect();
                let mut subset = middle_digits;
                loop {
                    if subset.count_ones() as usize == middle.len() && digit_sum(subset) == self.sum
                    {
                        let mut middle_support = [0; MAX_SIZE * MAX_SIZE];
                        let mut outside_support = [0; MAX_SIZE * MAX_SIZE];
                        if matching_support(&middle, domains, subset, size, &mut middle_support)
                            && matching_support(
                                &outside,
                                domains,
                                middle_digits & !subset,
                                size,
                                &mut outside_support,
                            )
                        {
                            found = true;
                            supported[self.cells[one_cell]] |= one;
                            supported[self.cells[high_cell]] |= highest;
                            for &cell in &middle {
                                supported[cell] |= middle_support[cell];
                            }
                            for &cell in &outside {
                                supported[cell] |= outside_support[cell];
                            }
                        }
                    }
                    if subset == 0 {
                        break;
                    }
                    subset = (subset - 1) & middle_digits;
                }
            }
        }
        found
    }
}

fn digit_sum(mask: u16) -> usize {
    (0..u16::BITS)
        .filter(|bit| mask & (1 << bit) != 0)
        .map(|bit| bit as usize + 1)
        .sum()
}

fn matching_support(
    cells: &[usize],
    domains: &[u16],
    digits: u16,
    size: usize,
    support: &mut [u16; MAX_SIZE * MAX_SIZE],
) -> bool {
    if cells.len() != digits.count_ones() as usize {
        return false;
    }
    if cells.is_empty() {
        return digits == 0;
    }
    let mut order = cells.to_vec();
    order.sort_unstable_by_key(|&cell| (domains[cell] & digits).count_ones());
    let mut memo = vec![-1i8; 1usize << size];
    if !can_match(&order, domains, digits, 0, &mut memo) {
        return false;
    }
    collect_support(&order, domains, digits, 0, &mut memo, support);
    true
}

fn can_match(order: &[usize], domains: &[u16], digits: u16, used: u16, memo: &mut [i8]) -> bool {
    if used == digits {
        return true;
    }
    let cache_index = usize::from(used);
    if memo[cache_index] >= 0 {
        return memo[cache_index] == 1;
    }
    let depth = used.count_ones() as usize;
    if depth >= order.len() {
        memo[cache_index] = 0;
        return false;
    }
    let cell = order[depth];
    let mut options = domains[cell] & digits & !used;
    while options != 0 {
        let bit = options & options.wrapping_neg();
        options &= !bit;
        if can_match(order, domains, digits, used | bit, memo) {
            memo[cache_index] = 1;
            return true;
        }
    }
    memo[cache_index] = 0;
    false
}

fn collect_support(
    order: &[usize],
    domains: &[u16],
    digits: u16,
    used: u16,
    memo: &mut [i8],
    support: &mut [u16; MAX_SIZE * MAX_SIZE],
) {
    if used == digits {
        return;
    }
    let cell = order[used.count_ones() as usize];
    let mut options = domains[cell] & digits & !used;
    while options != 0 {
        let bit = options & options.wrapping_neg();
        options &= !bit;
        if can_match(order, domains, digits, used | bit, memo) {
            support[cell] |= bit;
            collect_support(order, domains, digits, used | bit, memo, support);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ClueDirection;

    #[test]
    fn supports_only_assignments_with_the_required_sandwich_sum() {
        let size = 6;
        let cells: Vec<_> = (0..size).map(|column| column).collect();
        let clue = Sandwich::compile(size, &cells, ClueDirection::East, 7).unwrap();
        let domains = [0b111111; 36];
        let mut supported = [0; MAX_SIZE * MAX_SIZE];
        assert!(clue.support(&domains, &mut supported));
        assert_eq!(supported[0] & 1, 1);
        assert_eq!(supported[0] & (1 << 5), 1 << 5);
        assert!(supported[..6].iter().all(|&mask| mask != 0));

        let impossible = Sandwich::compile(size, &cells, ClueDirection::East, 0).unwrap();
        let mut impossible_domains = [0; 36];
        impossible_domains[..size].fill(0b011110);
        impossible_domains[0] = 0b000001;
        impossible_domains[size - 1] = 0b100000;
        assert!(!impossible.support(&impossible_domains, &mut [0; MAX_SIZE * MAX_SIZE]));
    }
}
