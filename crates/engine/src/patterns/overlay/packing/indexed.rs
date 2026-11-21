//! Exact fallback for dense template groups, using cell-indexed layout sets.

use super::{Family, cells};
use crate::CELLS;

pub(super) const WIDTH: usize = 5;
// Keep each transient index below 81 KiB of cell bitmaps. Larger families
// retain the exact linear search without allocating this index.
const MAX_LAYOUTS: usize = 8192;
const WORDS: usize = MAX_LAYOUTS / 64;
type LayoutSets = [[u64; WORDS]; WIDTH];

pub(super) struct Packing {
    families: [IndexedFamily; WIDTH],
    available: LayoutSets,
    equivalent: [u8; WIDTH],
}

struct IndexedFamily {
    digit: usize,
    layouts: Vec<u128>,
    words: usize,
    by_cell: Vec<u64>,
}

impl Packing {
    pub(super) fn new(families: &[Family<'_>], equivalent: [u8; WIDTH]) -> Option<Self> {
        let families: &[Family<'_>; WIDTH] = families.try_into().ok()?;
        if families
            .iter()
            .any(|family| family.layouts.len() > MAX_LAYOUTS || family.allowed >> CELLS != 0)
        {
            return None;
        }
        let mut available = [[0; WORDS]; WIDTH];
        let families =
            std::array::from_fn(|index| IndexedFamily::new(families[index], &mut available[index]));
        Some(Self {
            families,
            available,
            equivalent,
        })
    }

    pub(super) fn find(&self, pinned: usize, target: usize, witness: &mut [u128; 9]) -> bool {
        let mut available = self.available;
        let family = &self.families[pinned];
        available[pinned][..family.words].copy_from_slice(family.at(target));
        let mut scratch = [[[0; WORDS]; WIDTH]; WIDTH - 1];
        self.visit((1 << WIDTH) - 1, pinned, &available, &mut scratch, witness)
    }

    fn visit(
        &self,
        remaining: u8,
        pinned: usize,
        available: &LayoutSets,
        scratch: &mut [LayoutSets],
        witness: &mut [u128; 9],
    ) -> bool {
        if remaining.is_power_of_two() {
            let index = remaining.trailing_zeros() as usize;
            let family = &self.families[index];
            for (word, &bits) in available[index][..family.words].iter().enumerate() {
                if bits != 0 {
                    witness[family.digit] =
                        family.layouts[word * 64 + bits.trailing_zeros() as usize];
                    return true;
                }
            }
            return false;
        }
        let mut chosen = 0;
        let mut smallest = usize::MAX;
        for index in 0..WIDTH {
            if remaining & (1 << index) == 0 {
                continue;
            }
            let count = available[index][..self.families[index].words]
                .iter()
                .map(|word| word.count_ones() as usize)
                .sum();
            if count == 0 {
                return false;
            }
            if count < smallest {
                chosen = index;
                smallest = count;
            }
        }
        let family = &self.families[chosen];
        let rest = remaining & !(1 << chosen);
        // The caller constrains only the pinned digit to a specific cell.
        // Exchangeable followers can use their layouts in index order.
        let equivalent = if chosen == pinned {
            0
        } else {
            self.equivalent[chosen] & !(1 << pinned)
        };
        // Every restriction overwrites the active word range at this level.
        // Reuse those buffers across sibling branches.
        let (next, scratch) = scratch
            .split_first_mut()
            .expect("buffer for each branching level");
        for (word, &choices) in available[chosen][..family.words].iter().enumerate() {
            let mut choices = choices;
            while choices != 0 {
                let layout_index = word * 64 + choices.trailing_zeros() as usize;
                let layout = family.layouts[layout_index];
                choices &= choices - 1;
                if self.restrict(rest, equivalent, chosen, layout_index, available, next)
                    && self.visit(rest, pinned, next, scratch, witness)
                {
                    witness[family.digit] = layout;
                    return true;
                }
            }
        }
        false
    }

    fn restrict(
        &self,
        remaining: u8,
        equivalent: u8,
        selected: usize,
        layout_index: usize,
        available: &LayoutSets,
        next: &mut LayoutSets,
    ) -> bool {
        let layout = self.families[selected].layouts[layout_index];
        let layout_word = layout_index / 64;
        let layout_bit = layout_index % 64;
        for index in 0..WIDTH {
            if remaining & (1 << index) == 0 {
                continue;
            }
            let family = &self.families[index];
            let choices = &mut next[index][..family.words];
            choices.copy_from_slice(&available[index][..family.words]);
            let span = if equivalent & (1 << index) == 0 {
                0..family.words
            } else if index < selected {
                choices[layout_word] &= u64::MAX >> (63 - layout_bit);
                choices[layout_word + 1..].fill(0);
                0..layout_word + 1
            } else {
                choices[..layout_word].fill(0);
                choices[layout_word] &= u64::MAX << layout_bit;
                layout_word..family.words
            };
            for cell in cells(layout) {
                for (bits, forbidden) in choices[span.clone()]
                    .iter_mut()
                    .zip(&family.at(cell)[span.clone()])
                {
                    *bits &= !forbidden;
                }
            }
            if !choices[span].iter().any(|&bits| bits != 0) {
                return false;
            }
        }
        true
    }
}

impl IndexedFamily {
    fn new(family: Family<'_>, available: &mut [u64; WORDS]) -> Self {
        let layouts: Vec<_> = family
            .layouts
            .iter()
            .copied()
            .filter(|&layout| layout & !family.allowed == 0)
            .collect();
        let words = layouts.len().div_ceil(64);
        let mut by_cell = vec![0; CELLS * words];
        for (index, &layout) in layouts.iter().enumerate() {
            let bit = 1u64 << (index % 64);
            available[index / 64] |= bit;
            for cell in cells(layout) {
                by_cell[cell * words + index / 64] |= bit;
            }
        }
        Self {
            digit: family.digit,
            layouts,
            words,
            by_cell,
        }
    }

    fn at(&self, cell: usize) -> &[u64] {
        &self.by_cell[cell * self.words..][..self.words]
    }
}
