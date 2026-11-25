const MAX_SIZE: usize = 16;
const MAX_TOTAL: usize = 2 * MAX_SIZE;

/// A zipper line consists of mirrored cell pairs with a shared sum. An odd
/// line's center digit is that shared sum.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ZipperLine {
    pub(super) cells: Vec<usize>,
    pairs: Vec<[usize; 2]>,
    center: Option<usize>,
}

impl ZipperLine {
    pub(super) fn compile(cells: &[usize], cell_count: usize) -> Option<Self> {
        if cells.len() < 3
            || cells.len() > cell_count
            || cells.iter().any(|&cell| cell >= cell_count)
        {
            return None;
        }
        let mut seen = vec![false; cell_count];
        if cells
            .iter()
            .any(|&cell| std::mem::replace(&mut seen[cell], true))
        {
            return None;
        }
        let pair_count = cells.len() / 2;
        if pair_count == 1 && cells.len() == 2 {
            return None;
        }
        Some(Self {
            cells: cells.to_vec(),
            pairs: (0..pair_count)
                .map(|index| [cells[index], cells[cells.len() - index - 1]])
                .collect(),
            center: (cells.len() % 2 == 1).then_some(cells[pair_count]),
        })
    }

    /// Return candidate support for each path cell, or `None` if the current
    /// domains cannot satisfy the zipper relation.
    pub(super) fn support(&self, candidates: &[u16]) -> Option<Vec<u16>> {
        let mut feasible_totals = [true; MAX_TOTAL + 1];
        for pair in &self.pairs {
            let left = candidates[pair[0]];
            let right = candidates[pair[1]];
            let mut pair_totals = [false; MAX_TOTAL + 1];
            for left_digit in 1..=MAX_SIZE {
                if left & (1 << (left_digit - 1)) == 0 {
                    continue;
                }
                for right_digit in 1..=MAX_SIZE {
                    if right & (1 << (right_digit - 1)) != 0 {
                        pair_totals[left_digit + right_digit] = true;
                    }
                }
            }
            for total in 0..=MAX_TOTAL {
                feasible_totals[total] &= pair_totals[total];
            }
        }
        if let Some(center) = self.center {
            let center_candidates = candidates[center];
            for total in 0..=MAX_TOTAL {
                feasible_totals[total] &=
                    total <= MAX_SIZE && center_candidates & (1 << total.saturating_sub(1)) != 0;
            }
        }
        if !feasible_totals.iter().any(|&possible| possible) {
            return None;
        }

        let mut support = vec![0; self.cells.len()];
        for (pair_index, pair) in self.pairs.iter().enumerate() {
            let left_index = pair_index;
            let right_index = self.cells.len() - pair_index - 1;
            for left_digit in 1..=MAX_SIZE {
                if candidates[pair[0]] & (1 << (left_digit - 1)) == 0 {
                    continue;
                }
                for right_digit in 1..=MAX_SIZE {
                    let total = left_digit + right_digit;
                    if feasible_totals[total] && candidates[pair[1]] & (1 << (right_digit - 1)) != 0
                    {
                        support[left_index] |= 1 << (left_digit - 1);
                        support[right_index] |= 1 << (right_digit - 1);
                    }
                }
            }
        }
        if let Some(center) = self.center {
            support[self.cells.len() / 2] = candidates[center]
                & feasible_totals
                    .iter()
                    .enumerate()
                    .skip(1)
                    .take(MAX_SIZE)
                    .fold(0, |mask, (total, &possible)| {
                        mask | if possible { 1 << (total - 1) } else { 0 }
                    });
        }
        support.iter().all(|&mask| mask != 0).then_some(support)
    }

    pub(super) fn permits(&self, digits: &[u8], size: usize) -> bool {
        let mut min_total = 2usize;
        let mut max_total = 2 * size;
        for &[left, right] in &self.pairs {
            match (digits[left], digits[right]) {
                (left, right) if left != 0 && right != 0 => {
                    let total = usize::from(left + right);
                    min_total = min_total.max(total);
                    max_total = max_total.min(total);
                }
                (digit, 0) | (0, digit) if digit != 0 => {
                    min_total = min_total.max(usize::from(digit) + 1);
                    max_total = max_total.min(usize::from(digit) + size);
                }
                _ => {}
            }
        }
        if let Some(center) = self.center {
            if digits[center] != 0 {
                let total = usize::from(digits[center]);
                min_total = min_total.max(total);
                max_total = max_total.min(total);
            }
        }
        min_total <= max_total
    }
}

#[cfg(test)]
mod tests {
    use super::ZipperLine;

    #[test]
    fn odd_zipper_center_matches_every_mirrored_pair_sum() {
        let line = ZipperLine::compile(&[0, 1, 2], 16).unwrap();
        let mut candidates = [0b1111; 16];
        let support = line.support(&candidates).unwrap();
        assert_eq!(support, vec![0b0111, 0b1110, 0b0111]);

        candidates[0] = 0b1000;
        assert!(line.support(&candidates).is_none());
    }

    #[test]
    fn even_zipper_pairs_share_a_sum() {
        let line = ZipperLine::compile(&[0, 1, 2, 3], 16).unwrap();
        let mut candidates = [0b1111; 16];
        candidates[0] = 1 << 0;
        candidates[3] = 1 << 3;
        candidates[1] = 1 << 0;
        candidates[2] = 1 << 0;
        assert!(line.support(&candidates).is_none());

        candidates[2] = 1 << 3;
        candidates[1] = 1 << 0;
        assert_eq!(line.support(&candidates), Some(vec![1, 1, 8, 8]));
    }

    #[test]
    fn rejects_repeated_cells_and_short_paths() {
        assert!(ZipperLine::compile(&[0, 1], 16).is_none());
        assert!(ZipperLine::compile(&[0, 1, 0], 16).is_none());
    }

    #[test]
    fn sixteen_digit_zippers_accept_the_full_candidate_mask() {
        let line = ZipperLine::compile(&[0, 1, 2], 256).unwrap();
        assert!(line.permits(&[0; 256], 16));
    }
}
