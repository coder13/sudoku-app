//! Exact support for five digits with identical layout domains.

use super::{Family, cell_bit, cells};

// The pair table uses at most 512 KiB. Larger domains use the general search.
const MAX_LAYOUTS: usize = 2048;
const MAX_WORDS: usize = MAX_LAYOUTS / 64;

pub(super) fn support(families: &[Family<'_>], mut support: [u128; 9]) -> Option<[u128; 9]> {
    let [first, rest @ ..] = families else {
        return None;
    };
    if rest.len() != 4
        || first.layouts.len() > MAX_LAYOUTS
        || !rest
            .iter()
            .all(|family| family.allowed == first.allowed && family.layouts == first.layouts)
        || first.layouts.contains(&0)
    {
        return None;
    }

    // Each five-layout packing can assign its layouts to these digits in any
    // order. Every cell in such a packing supports every digit in the group.
    let mut shared = families
        .iter()
        .fold(0, |sites, family| sites | support[family.digit]);
    let layouts = Layouts::new(first);
    let mut rejected = vec![false; layouts.masks.len()];
    for cell in cells(first.allowed & !shared) {
        let target = cell_bit(cell);
        if shared & target != 0 {
            continue;
        }
        for (index, &mask) in layouts.masks.iter().enumerate() {
            if rejected[index] || mask & target == 0 {
                continue;
            }
            if let Some(others) = layouts.choose(layouts.neighbors(index), 0, rest.len()) {
                shared |= mask | others;
                break;
            }
            rejected[index] = true;
        }
    }
    for family in families {
        support[family.digit] = shared;
    }
    Some(support)
}

struct Layouts {
    masks: Vec<u128>,
    disjoint: Vec<u64>,
    words: usize,
}

impl Layouts {
    fn new(family: &Family<'_>) -> Self {
        let masks: Vec<_> = family
            .layouts
            .iter()
            .copied()
            .filter(|&layout| layout & !family.allowed == 0)
            .collect();
        let words = masks.len().div_ceil(64);
        let mut disjoint = vec![0; masks.len() * words];
        for (right, &mask) in masks.iter().enumerate() {
            for (left, &other) in masks[..right].iter().enumerate() {
                if mask & other == 0 {
                    disjoint[right * words + left / 64] |= 1 << (left % 64);
                    disjoint[left * words + right / 64] |= 1 << (right % 64);
                }
            }
        }
        Self {
            masks,
            disjoint,
            words,
        }
    }

    fn neighbors(&self, index: usize) -> &[u64] {
        &self.disjoint[index * self.words..][..self.words]
    }

    fn choose(&self, possible: &[u64], first_word: usize, needed: usize) -> Option<u128> {
        let mut remaining: usize = possible[first_word..]
            .iter()
            .map(|word| word.count_ones() as usize)
            .sum();
        let mut next = [0; MAX_WORDS];
        for (word, &bits) in possible.iter().enumerate().skip(first_word) {
            let mut layouts = bits;
            while layouts != 0 {
                if remaining < needed {
                    return None;
                }
                let index = word * 64 + layouts.trailing_zeros() as usize;
                let mask = self.masks[index];
                if needed == 1 {
                    return Some(mask);
                }
                layouts &= layouts - 1;
                remaining -= 1;

                // Intersect disjoint neighbors and visit the remaining layouts
                // in increasing order. This visits each unordered group once.
                let neighbors = self.neighbors(index);
                next[word] = layouts & neighbors[word];
                for later in word + 1..self.words {
                    next[later] = possible[later] & neighbors[later];
                }
                if let Some(others) = self.choose(&next[..self.words], word, needed - 1) {
                    return Some(mask | others);
                }
            }
        }
        None
    }
}
