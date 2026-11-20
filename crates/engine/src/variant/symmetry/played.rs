//! Logical keys for generation exclusions, separate from public source data.

use super::{PuzzleRule, VariantPuzzle, digit_invariant, key_impl};
use crate::CELLS;

mod comparisons;
mod renban;
mod totals;

// Drawing paths do not change a puzzle's logical identity. Keep them in the
// public canonical definition, but ignore them when excluding played puzzles.
pub(super) fn key(puzzle: &VariantPuzzle) -> VariantPuzzle {
    let mut logical = puzzle.clone();
    normalize_equalities(&mut logical);
    normalize_group_lines(&mut logical);
    renban::normalize(&mut logical);
    let complement_totals = totals::normalize(&mut logical);
    let complement_comparisons = comparisons::normalize(&mut logical);
    // Whispers constrains neighboring pairs, independently of path direction,
    // segmentation or repeated edges. Keep this normalization private to played
    // exclusions; public definitions and proof indices retain the original paths.
    let mut whispers = std::collections::BTreeMap::<[usize; 2], u8>::new();
    logical.rules.retain(|rule| {
        if let PuzzleRule::Whispers {
            cells,
            min_difference,
        } = rule
        {
            for edge in cells.windows(2) {
                let mut pair = [edge[0], edge[1]];
                pair.sort_unstable();
                whispers
                    .entry(pair)
                    .and_modify(|gap| *gap = (*gap).max(*min_difference))
                    .or_insert(*min_difference);
            }
            false
        } else {
            true
        }
    });
    logical
        .rules
        .extend(
            whispers
                .into_iter()
                .map(|(cells, min_difference)| PuzzleRule::Whispers {
                    cells: cells.to_vec(),
                    min_difference,
                }),
        );
    for rule in &mut logical.rules {
        match rule {
            PuzzleRule::Palindrome { segments, .. }
            | PuzzleRule::Renban { segments, .. }
            | PuzzleRule::RegionSum { segments, .. } => *segments = None,
            _ => {}
        }
    }
    // Repeated conjunctive rules add no restriction. Source rule lists and
    // public canonical definitions keep their original structure.
    logical.rules.sort_unstable();
    logical.rules.dedup();
    let partition = group_partition(&logical.rules);
    let renban_length = renban::minimum_length(&logical.rules);
    key_impl(&logical, true, |copy| {
        if let Some(partition) = partition {
            rename_groups(&mut copy.givens, partition);
        } else if let Some(length) = renban_length {
            renban::rename(&mut copy.givens, length);
        } else if complement_comparisons {
            comparisons::rename(copy);
        } else if complement_totals {
            totals::rename(copy);
        }
    })
}

// Sliding triples require three different groups. Their pairwise restrictions
// preserve reversed/split walks without joining independent touching paths.
// A one-cell walk adds no restriction; a conflicting revisit retains its loop.
fn normalize_group_lines(puzzle: &mut VariantPuzzle) {
    let mut edges = std::collections::BTreeSet::new();
    puzzle.rules.retain(|rule| {
        let (cells, is_modular) = match rule {
            PuzzleRule::Entropic { cells } => (cells, false),
            PuzzleRule::Modular { cells } => (cells, true),
            _ => return true,
        };
        for (index, &cell) in cells.iter().enumerate() {
            for &other in cells.iter().skip(index + 1).take(2) {
                let mut pair = [cell, other];
                pair.sort_unstable();
                edges.insert((is_modular, pair));
            }
        }
        false
    });
    puzzle
        .rules
        .extend(edges.into_iter().map(|(is_modular, cells)| {
            let cells = cells.to_vec();
            if is_modular {
                PuzzleRule::Modular { cells }
            } else {
                PuzzleRule::Entropic { cells }
            }
        }));
}

const ENTROPY_GROUPS: [[u8; 3]; 3] = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
const MODULAR_GROUPS: [[u8; 3]; 3] = [[1, 4, 7], [2, 5, 8], [3, 6, 9]];

// Numeric companions must preserve the same partition. In particular, the
// Entropic and Modular partitions cannot be renamed independently when mixed.
fn group_partition(rules: &[PuzzleRule]) -> Option<&'static [[u8; 3]; 3]> {
    let mut partitions = 0;
    for rule in rules {
        match rule {
            PuzzleRule::GlobalEntropy {} | PuzzleRule::Entropic { .. } => partitions |= 1,
            PuzzleRule::Modular { .. } => partitions |= 2,
            _ if digit_invariant(rule) => {}
            _ => return None,
        }
    }
    match partitions {
        1 => Some(&ENTROPY_GROUPS),
        2 => Some(&MODULAR_GROUPS),
        _ => None,
    }
}

// First appearances name the three equal-sized digit groups and their members.
// This models group permutations and permutations within a group, not arbitrary
// digit relabeling. Numeric companion rules conservatively disable it above.
fn rename_groups(givens: &mut [u8; CELLS], partition: &[[u8; 3]; 3]) {
    let mut group_of = [0; 10];
    for (group, digits) in partition.iter().enumerate() {
        for &digit in digits {
            group_of[usize::from(digit)] = group;
        }
    }
    let mut group_names = [usize::MAX; 3];
    let mut members = [0; 3];
    let mut digits = [0; 10];
    let mut next_group = 0;
    for given in givens {
        if *given == 0 {
            continue;
        }
        let digit = usize::from(*given);
        let group = group_of[digit];
        if group_names[group] == usize::MAX {
            group_names[group] = next_group;
            next_group += 1;
        }
        if digits[digit] == 0 {
            digits[digit] = partition[group_names[group]][members[group]];
            members[group] += 1;
        }
        *given = digits[digit];
    }
}

// A matching-digit component has the same meaning whether it is written as
// mirrored Palindrome pairs, overlapping Clone groups, or redundant equalities.
// This private key representation never replaces a player's source rules.
fn normalize_equalities(puzzle: &mut VariantPuzzle) {
    if !puzzle.rules.iter().any(|rule| {
        matches!(
            rule,
            PuzzleRule::Palindrome { .. } | PuzzleRule::Clone { .. }
        )
    }) {
        return;
    }
    let mut parents = std::array::from_fn::<_, CELLS, _>(|cell| cell);
    fn root(parents: &mut [usize; CELLS], mut cell: usize) -> usize {
        while parents[cell] != cell {
            parents[cell] = parents[parents[cell]];
            cell = parents[cell];
        }
        cell
    }
    fn join(parents: &mut [usize; CELLS], a: usize, b: usize) {
        let a = root(parents, a);
        let b = root(parents, b);
        parents[a.max(b)] = a.min(b);
    }
    puzzle.rules.retain(|rule| match rule {
        PuzzleRule::Palindrome { cells, .. } => {
            // The middle cell of an odd path imposes no equality.
            for index in 0..cells.len() / 2 {
                join(&mut parents, cells[index], cells[cells.len() - 1 - index]);
            }
            false
        }
        PuzzleRule::Clone { groups } => {
            for group in groups {
                for pair in group.windows(2) {
                    join(&mut parents, pair[0], pair[1]);
                }
            }
            false
        }
        _ => true,
    });
    let mut components = [0_u128; CELLS];
    for cell in 0..CELLS {
        components[root(&mut parents, cell)] |= 1 << cell;
    }
    let groups: Vec<Vec<usize>> = components
        .into_iter()
        .filter(|mask| mask.count_ones() > 1)
        .map(|mask| (0..CELLS).filter(|&cell| mask & (1 << cell) != 0).collect())
        .collect();
    if !groups.is_empty() {
        puzzle.rules.push(PuzzleRule::Clone { groups });
    }
}

#[cfg(test)]
mod tests;
