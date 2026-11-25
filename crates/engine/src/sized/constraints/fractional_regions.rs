use super::{MAX_CELLS, SizedGrid};
use crate::hints::digits;

/// Each numbered tile in a doubled grid contributes a quarter of its cell.
#[derive(Debug)]
pub(super) struct FractionalRegions {
    pub(super) pieces: Vec<WeightedRegion>,
    target: usize,
    size: usize,
    offset: u8,
}

#[derive(Debug)]
pub(super) struct WeightedRegion {
    terms: Vec<(usize, u8)>,
}

impl WeightedRegion {
    pub(super) fn cells(&self) -> impl Iterator<Item = usize> + '_ {
        self.terms.iter().map(|&(cell, _)| cell)
    }
}

fn connected(tiles: &[usize], side: usize, seen: &mut [bool; 4 * MAX_CELLS]) -> bool {
    let mut pending = vec![tiles[0]];
    let mut visited = 0;
    while let Some(tile) = pending.pop() {
        if !std::mem::take(&mut seen[tile]) {
            continue;
        }
        visited += 1;
        let row = tile / side;
        let col = tile % side;
        pending.extend(
            [
                (row > 0).then(|| tile - side),
                (row + 1 < side).then(|| tile + side),
                (col > 0).then(|| tile - 1),
                (col + 1 < side).then(|| tile + 1),
            ]
            .into_iter()
            .flatten()
            .filter(|&other| seen[other]),
        );
    }
    visited == tiles.len()
}

impl FractionalRegions {
    pub(super) fn compile(layout: &SizedGrid, groups: &[Vec<usize>], offset: u8) -> Option<Self> {
        let size = layout.size();
        let side = 2 * size;
        let count = side * side;
        let total = 2 * size * size * (size + 1 - 2 * usize::from(offset));
        if !(2..=count).contains(&groups.len())
            || total % groups.len() != 0
            || groups.iter().map(Vec::len).sum::<usize>() != count
        {
            return None;
        }
        let mut covered = [false; 4 * MAX_CELLS];
        let mut connected_tiles = [false; 4 * MAX_CELLS];
        let mut pieces = Vec::with_capacity(groups.len());
        for tiles in groups {
            if tiles.is_empty()
                || tiles
                    .iter()
                    .any(|&tile| tile >= count || std::mem::replace(&mut covered[tile], true))
            {
                return None;
            }
            let mut weights = [0u8; MAX_CELLS];
            for &tile in tiles {
                connected_tiles[tile] = true;
                let cell = tile / side / 2 * size + tile % side / 2;
                weights[cell] += 1;
            }
            if !connected(tiles, side, &mut connected_tiles) {
                return None;
            }
            let terms = weights
                .into_iter()
                .enumerate()
                .filter(|&(_, weight)| weight != 0)
                .collect();
            pieces.push(WeightedRegion { terms });
        }
        Some(Self {
            pieces,
            target: total / groups.len(),
            size,
            offset,
        })
    }

    pub(super) fn permits(&self, ranks: &[u8]) -> bool {
        self.pieces.iter().all(|piece| {
            let mut low = 0;
            let mut high = 0;
            for &(cell, weight) in &piece.terms {
                let rank = usize::from(ranks[cell]);
                let weight = usize::from(weight);
                let offset = usize::from(self.offset);
                low += weight * rank.max(1).saturating_sub(offset);
                high += weight * (if rank == 0 { self.size } else { rank } - offset);
            }
            (low..=high).contains(&self.target)
        })
    }

    pub(super) fn support(
        &self,
        piece: &WeightedRegion,
        domains: &[u16],
        supported: &mut [u16],
    ) -> bool {
        let mut min_sum = 0;
        let mut max_sum = 0;
        for &(cell, weight) in &piece.terms {
            let mask = domains[cell];
            if mask == 0 {
                return false;
            }
            let offset = u32::from(self.offset);
            min_sum += usize::from(weight) * (mask.trailing_zeros() + 1 - offset) as usize;
            max_sum += usize::from(weight) * (u16::BITS - mask.leading_zeros() - offset) as usize;
        }
        if !(min_sum..=max_sum).contains(&self.target) {
            return false;
        }

        // Work with sums above the smallest remaining digit in each cell.
        // This keeps the prefix table small as search fixes digits.
        let target = self.target - min_sum;
        if target == 0 {
            for (cell, mask) in piece.cells().map(|cell| (cell, domains[cell])) {
                supported[cell] = mask & mask.wrapping_neg();
            }
            return true;
        }

        let words = target / 128 + 1;
        let mut prefix = vec![0u128; (piece.terms.len() + 1) * words];
        prefix[0] = 1;
        for (i, &(cell, weight)) in piece.terms.iter().enumerate() {
            let (written, remaining) = prefix.split_at_mut((i + 1) * words);
            let row = &written[i * words..];
            let next = &mut remaining[..words];
            let mask = domains[cell];
            for rank in digits(mask) {
                let shift = usize::from(weight)
                    * (usize::from(rank) - (mask.trailing_zeros() as usize + 1));
                for (word, allowed) in next.iter_mut().enumerate() {
                    *allowed |= row[word] << shift;
                    if word > 0 && shift != 0 {
                        *allowed |= row[word - 1] >> (128 - shift);
                    }
                }
            }
        }
        let bit = 1u128 << (target % 128);
        if prefix[piece.terms.len() * words + words - 1] & bit == 0 {
            return false;
        }

        let mut allowed = vec![0u128; words];
        let mut before = vec![0u128; words];
        allowed[words - 1] = bit;
        for (i, &(cell, weight)) in piece.terms.iter().enumerate().rev() {
            let row = &prefix[i * words..(i + 1) * words];
            let mask = domains[cell];
            supported[cell] = 0;
            before.fill(0);
            for rank in digits(mask) {
                let shift = usize::from(weight)
                    * (usize::from(rank) - (mask.trailing_zeros() as usize + 1));
                let mut fits = false;
                for (word, previous) in before.iter_mut().enumerate() {
                    let mut test = allowed[word] >> shift;
                    if word + 1 < words && shift != 0 {
                        test |= allowed[word + 1] << (128 - shift);
                    }
                    test &= row[word];
                    *previous |= test;
                    fits |= test != 0;
                }
                if fits {
                    supported[cell] |= 1 << (rank - 1);
                }
            }
            std::mem::swap(&mut allowed, &mut before);
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::{FractionalRegions, WeightedRegion};

    #[test]
    fn weighted_support_carries_across_words_with_zero_based_digits() {
        let piece = WeightedRegion {
            terms: vec![(0, 4), (1, 4), (2, 3), (3, 4), (4, 4), (5, 2)],
        };
        let ranks = [1u8, 7, 16];
        let domains = [ranks.into_iter().map(|rank| 1 << (rank - 1)).sum(); 6];
        let rule = FractionalRegions {
            pieces: Vec::new(),
            target: 225,
            size: 16,
            offset: 1,
        };
        let mut expected = [0; 6];
        for mut assignment in 0..3usize.pow(6) {
            let digits: [u8; 6] = std::array::from_fn(|_| {
                let rank = ranks[assignment % ranks.len()];
                assignment /= ranks.len();
                rank
            });
            let total: usize = piece
                .terms
                .iter()
                .map(|&(cell, weight)| usize::from(weight) * usize::from(digits[cell] - 1))
                .sum();
            if total == rule.target {
                for (cell, digit) in digits.into_iter().enumerate() {
                    expected[cell] |= 1 << (digit - 1);
                }
            }
        }
        let mut actual = [0; 6];
        assert!(rule.support(&piece, &domains, &mut actual));
        assert_eq!(actual, expected);
        assert!(actual.iter().any(|&mask| mask != domains[0]));
    }
}
