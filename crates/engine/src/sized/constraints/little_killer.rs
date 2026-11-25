use super::MAX_SIZE;
use crate::variant::{ClueDirection, sum_support_with_prefix};

fn valid_ray(cells: &[usize], direction: ClueDirection, size: usize) -> bool {
    let (dr, dc) = match direction {
        ClueDirection::NorthWest => (-1, -1),
        ClueDirection::NorthEast => (-1, 1),
        ClueDirection::SouthWest => (1, -1),
        ClueDirection::SouthEast => (1, 1),
        _ => return false,
    };
    let Some(&first) = cells.first().filter(|&&first| first < size * size) else {
        return false;
    };
    let (mut row, mut column) = ((first / size) as isize, (first % size) as isize);
    let inside = |r: isize, c: isize| r >= 0 && c >= 0 && r < size as isize && c < size as isize;
    if inside(row - dr, column - dc) {
        return false;
    }
    for &cell in cells {
        if !inside(row, column) || cell != size * row as usize + column as usize {
            return false;
        }
        row += dr;
        column += dc;
    }
    !inside(row, column)
}

#[derive(Debug)]
pub(super) struct LittleKiller {
    pub(super) cells: Vec<usize>,
    sum: usize,
    value_offset: u8,
}

impl LittleKiller {
    pub(super) fn compile(
        size: usize,
        direction: ClueDirection,
        cells: &[usize],
        sum: u16,
        value_offset: u8,
    ) -> Option<Self> {
        let sum = usize::from(sum);
        let offset = usize::from(value_offset);
        if !valid_ray(cells, direction, size)
            || !((1 - offset) * cells.len()..=(size - offset) * cells.len()).contains(&sum)
        {
            return None;
        }
        Some(Self {
            cells: cells.to_vec(),
            sum,
            value_offset,
        })
    }

    pub(super) fn support(&self, domains: &[u16]) -> Option<[u16; MAX_SIZE]> {
        let mut masks = [0; MAX_SIZE];
        for (&cell, mask) in self.cells.iter().zip(&mut masks) {
            *mask = domains[cell];
        }
        let masks = &masks[..self.cells.len()];
        let total = self.sum + self.cells.len() * usize::from(self.value_offset);
        match total / 128 {
            0 => self.support_for_total::<1>(masks, total),
            1 => self.support_for_total::<2>(masks, total),
            _ => self.support_for_total::<3>(masks, total),
        }
    }

    fn support_for_total<const WORDS: usize>(
        &self,
        masks: &[u16],
        total: usize,
    ) -> Option<[u16; MAX_SIZE]> {
        let mut totals = [0; WORDS];
        totals[total / 128] = 1 << (total % 128);
        let mut supported = [0; MAX_SIZE];
        let matched = sum_support_with_prefix(
            masks,
            totals,
            &mut supported,
            &mut [[0; WORDS]; MAX_SIZE + 1],
        );
        matched.iter().any(|&word| word != 0).then_some(supported)
    }

    pub(super) fn permits(&self, digits: &[u8], size: usize) -> bool {
        let mut placed = 0;
        let mut empty = 0;
        for &cell in &self.cells {
            let rank = digits[cell];
            if rank == 0 {
                empty += 1;
            } else {
                placed += usize::from(rank - self.value_offset);
            }
        }
        let offset = usize::from(self.value_offset);
        (placed + empty * (1 - offset)..=placed + empty * (size - offset)).contains(&self.sum)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_based_sum_distinguishes_displayed_zero_from_an_empty_cell() {
        let clue = LittleKiller::compile(6, ClueDirection::SouthEast, &[4, 11], 0, 1).unwrap();
        let mut digits = [0; 36];
        let domains = [0b111111; 36];
        assert_eq!(clue.support(&domains).unwrap()[..2], [1, 1]);
        digits[4] = 1;
        assert!(clue.permits(&digits, 6));
        digits[4] = 2;
        assert!(!clue.permits(&digits, 6));
    }
}
