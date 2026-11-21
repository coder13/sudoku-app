//! Exact fallback for dense template groups, using cell-indexed layout sets.

use super::{Family, cells};
use crate::CELLS;

const WIDTH: usize = 5;
// Keep each transient index below 81 KiB of cell bitmaps. Larger families
// retain the exact linear search without allocating this index.
const MAX_LAYOUTS: usize = 8192;
const WORDS: usize = MAX_LAYOUTS / 64;
type LayoutSets = [[u64; WORDS]; WIDTH];

pub(super) struct Packing {
    families: [IndexedFamily; WIDTH],
    available: LayoutSets,
}

struct IndexedFamily {
    digit: usize,
    layouts: Vec<u128>,
    words: usize,
    by_cell: Vec<u64>,
}

impl Packing {
    pub(super) fn new(families: &[Family<'_>]) -> Option<Self> {
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
        })
    }

    pub(super) fn find(&self, pinned: usize, target: usize, witness: &mut [u128; 9]) -> bool {
        let mut available = self.available;
        let family = &self.families[pinned];
        available[pinned][..family.words].copy_from_slice(family.at(target));
        self.visit((1 << WIDTH) - 1, &available, witness)
    }

    fn visit(&self, remaining: u8, available: &LayoutSets, witness: &mut [u128; 9]) -> bool {
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
        let mut next = [[0; WORDS]; WIDTH];
        for (word, &choices) in available[chosen][..family.words].iter().enumerate() {
            let mut choices = choices;
            while choices != 0 {
                let layout = family.layouts[word * 64 + choices.trailing_zeros() as usize];
                choices &= choices - 1;
                if rest == 0
                    || self.restrict(rest, layout, available, &mut next)
                        && self.visit(rest, &next, witness)
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
        layout: u128,
        available: &LayoutSets,
        next: &mut LayoutSets,
    ) -> bool {
        for index in 0..WIDTH {
            if remaining & (1 << index) == 0 {
                continue;
            }
            let family = &self.families[index];
            let mut has_layout = false;
            for word in 0..family.words {
                let mut choices = available[index][word];
                for cell in cells(layout) {
                    if choices == 0 {
                        break;
                    }
                    choices &= !family.at(cell)[word];
                }
                next[index][word] = choices;
                has_layout |= choices != 0;
            }
            if !has_layout {
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
