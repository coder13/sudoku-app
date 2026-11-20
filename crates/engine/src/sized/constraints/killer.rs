use super::{MAX_SIZE, SizedGrid};
use crate::hints::digits;
use crate::variant::{KillerCage, digit_set_support, record_support};

#[derive(Debug)]
pub(super) struct Cage {
    pub(super) cells: Vec<usize>,
    sets: Vec<u16>,
    size: usize,
}

impl Cage {
    pub(super) fn compile(
        layout: &SizedGrid,
        cage: &KillerCage,
        occupied: &mut [bool; MAX_SIZE * MAX_SIZE],
    ) -> Option<Self> {
        let size = layout.size();
        let count = cage.cells.len();
        if !(1..=size).contains(&count) {
            return None;
        }
        for &cell in &cage.cells {
            if cell >= layout.cell_count() || std::mem::replace(&mut occupied[cell], true) {
                return None;
            }
        }
        let sets: Vec<_> = (1..=layout.digit_mask())
            .filter(|mask| mask.count_ones() as usize == count)
            .filter(|&mask| digits(mask).map(u16::from).sum::<u16>() == cage.sum)
            .collect();
        (!sets.is_empty()).then(|| Self { cells: cage.cells.clone(), sets, size })
    }

    pub(super) fn permits(&self, digits: &[u8]) -> bool {
        let mut used = 0;
        for &cell in &self.cells {
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
        self.sets.iter().any(|set| used & !set == 0)
    }

    pub(super) fn support(&self, domains: &[u16]) -> [u16; MAX_SIZE] {
        let len = self.cells.len();
        let mut input = [0; MAX_SIZE];
        for (&cell, mask) in self.cells.iter().zip(&mut input) {
            *mask = domains[cell];
        }
        let input = &input[..len];
        let mut support = [0; MAX_SIZE];
        match *input {
            [only] => support[0] = only & self.sets[0],
            [left, right] => {
                for &set in &self.sets {
                    let low = set & set.wrapping_neg();
                    let high = set ^ low;
                    if left & low != 0 && right & high != 0 {
                        support[0] |= low;
                        support[1] |= high;
                    }
                    if left & high != 0 && right & low != 0 {
                        support[0] |= high;
                        support[1] |= low;
                    }
                }
            }
            _ if self.size <= 9 => {
                let mut cache = [None; 512];
                for &set in &self.sets {
                    record_support(set, input, &mut support, &mut cache);
                    if support[..len] == *input {
                        break;
                    }
                }
            }
            _ => {
                for &set in &self.sets {
                    digit_set_support(set, input, &mut support[..len]);
                    if support[..len] == *input {
                        break;
                    }
                }
            }
        }
        support
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_cell_support_matches_independent_digit_pairs() {
        let layout = SizedGrid::without_regions(7).unwrap();
        for sum in 3..=13 {
            let cage = Cage::compile(
                &layout,
                &KillerCage { cells: vec![0, 1], sum },
                &mut [false; MAX_SIZE * MAX_SIZE],
            )
            .unwrap();
            for left in 0..=layout.digit_mask() {
                for right in 0..=layout.digit_mask() {
                    let mut expected = [0; MAX_SIZE];
                    for a in digits(left) {
                        for b in digits(right) {
                            if a != b && u16::from(a) + u16::from(b) == sum {
                                expected[0] |= 1 << (a - 1);
                                expected[1] |= 1 << (b - 1);
                            }
                        }
                    }
                    assert_eq!(cage.support(&[left, right]), expected);
                }
            }
        }
    }
}
