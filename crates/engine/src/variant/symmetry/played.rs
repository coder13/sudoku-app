//! Logical keys for generation exclusions, separate from public source data.

use super::{PuzzleRule, VariantPuzzle, digit_invariant, key_impl};
use crate::CELLS;

// Drawing paths do not change a puzzle's logical identity. Keep them in the
// public canonical definition, but ignore them when excluding played puzzles.
pub(super) fn key(puzzle: &VariantPuzzle) -> VariantPuzzle {
    let mut logical = puzzle.clone();
    normalize_equalities(&mut logical);
    normalize_entropic(&mut logical);
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
    let entropy = logical.rules.iter().any(|rule| {
        matches!(
            rule,
            PuzzleRule::GlobalEntropy {} | PuzzleRule::Entropic { .. }
        )
    }) && logical.rules.iter().all(|rule| {
        digit_invariant(rule)
            || matches!(
                rule,
                PuzzleRule::GlobalEntropy {} | PuzzleRule::Entropic { .. }
            )
    });
    key_impl(&logical, true, |copy| {
        if entropy {
            rename_groups(&mut copy.givens, &[0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
        }
    })
}

// Sliding triples require three different groups. Their pairwise restrictions
// preserve reversed/split walks without joining independent touching paths.
// A one-cell walk adds no restriction; a conflicting revisit retains its loop.
fn normalize_entropic(puzzle: &mut VariantPuzzle) {
    let mut edges = std::collections::BTreeSet::new();
    puzzle.rules.retain(|rule| {
        let PuzzleRule::Entropic { cells } = rule else {
            return true;
        };
        for (index, &cell) in cells.iter().enumerate() {
            for &other in cells.iter().skip(index + 1).take(2) {
                let mut pair = [cell, other];
                pair.sort_unstable();
                edges.insert(pair);
            }
        }
        false
    });
    puzzle
        .rules
        .extend(edges.into_iter().map(|cells| PuzzleRule::Entropic {
            cells: cells.to_vec(),
        }));
}

// First appearances name the three equal-sized digit groups and their members.
// This models group permutations and permutations within a group, not arbitrary
// digit relabeling. Numeric companion rules conservatively disable it above.
fn rename_groups(givens: &mut [u8; CELLS], partition: &[usize; 10]) {
    let mut group_names = [usize::MAX; 3];
    let mut members = [0; 3];
    let mut digits = [0; 10];
    let mut next_group = 0;
    for given in givens {
        if *given == 0 {
            continue;
        }
        let digit = usize::from(*given);
        let group = partition[digit];
        if group_names[group] == usize::MAX {
            group_names[group] = next_group;
            next_group += 1;
        }
        if digits[digit] == 0 {
            digits[digit] = (group_names[group] * 3 + members[group] + 1) as u8;
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
