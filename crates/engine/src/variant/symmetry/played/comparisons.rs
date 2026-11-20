//! Logical directed comparisons, independent of the authored signs and paths.

use super::{CELLS, PuzzleRule, VariantPuzzle, digit_invariant};

// Strict order is transitive, including where independently drawn clues meet.
// Acyclic relations have a unique transitive reduction. Keep cyclic definitions
// intact rather than replacing an invalid order with a different contradiction.
// The return value permits complementing only order and digit-invariant rules.
pub(super) fn normalize(puzzle: &mut VariantPuzzle) -> bool {
    let mut reachable = [0_u128; CELLS];
    let mut present = false;
    for rule in &puzzle.rules {
        match rule {
            PuzzleRule::Inequality { less, greater } => {
                reachable[*less] |= 1_u128 << *greater;
                present = true;
            }
            PuzzleRule::Thermometer { cells } => {
                for pair in cells.windows(2) {
                    reachable[pair[0]] |= 1_u128 << pair[1];
                }
                present = true;
            }
            _ => {}
        }
    }
    if !present {
        return false;
    }
    for middle in 0..CELLS {
        let after = reachable[middle];
        for row in &mut reachable {
            if *row & (1_u128 << middle) != 0 {
                *row |= after;
            }
        }
    }
    if reachable
        .iter()
        .enumerate()
        .any(|(cell, row)| row & (1_u128 << cell) != 0)
    {
        return false;
    }
    puzzle.rules.retain(|rule| {
        !matches!(
            rule,
            PuzzleRule::Inequality { .. } | PuzzleRule::Thermometer { .. }
        )
    });
    for (less, &after) in reachable.iter().enumerate() {
        let mut redundant = 0;
        let mut remaining = after;
        while remaining != 0 {
            let middle = remaining.trailing_zeros() as usize;
            remaining &= remaining - 1;
            redundant |= reachable[middle];
        }
        let mut covers = after & !redundant;
        while covers != 0 {
            let greater = covers.trailing_zeros() as usize;
            covers &= covers - 1;
            puzzle.rules.push(PuzzleRule::Inequality { less, greater });
        }
    }
    puzzle
        .rules
        .iter()
        .all(|rule| matches!(rule, PuzzleRule::Inequality { .. }) || digit_invariant(rule))
}

// Complement every digit and reverse every comparison together. Numeric
// companions must disable this operation unless their meaning is preserved.
pub(super) fn rename(puzzle: &mut VariantPuzzle) {
    puzzle.rules.sort_unstable();
    let mut complement = puzzle.clone();
    for given in &mut complement.givens {
        if *given != 0 {
            *given = 10 - *given;
        }
    }
    for rule in &mut complement.rules {
        if let PuzzleRule::Inequality { less, greater } = rule {
            std::mem::swap(less, greater);
        }
    }
    complement.rules.sort_unstable();
    if complement < *puzzle {
        *puzzle = complement;
    }
}

#[cfg(test)]
mod tests;
