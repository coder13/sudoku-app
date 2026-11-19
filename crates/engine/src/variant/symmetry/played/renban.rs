//! Complete-set relations and safe digit symmetries for played Renban puzzles.

use super::{CELLS, PuzzleRule, VariantPuzzle, digit_invariant};

// A Renban is one set, independently of its drawing order or branches. Only
// private keys use these bridges; public clues and proof sources stay intact.
pub(super) fn normalize(puzzle: &mut VariantPuzzle) {
    // Every positive Kropki mark exempts its edge from both negative families.
    // Keep all marks when any negative flag is active, including in another rule.
    let negative_kropki = puzzle.rules.iter().any(|rule| {
        matches!(rule,
        PuzzleRule::Kropki { consecutive, ratio_two }
            if consecutive.negative || ratio_two.negative)
    });
    let mut rules = Vec::with_capacity(puzzle.rules.len());
    for rule in std::mem::take(&mut puzzle.rules) {
        match rule {
            PuzzleRule::Renban { cells, .. } if cells.len() == 1 => {}
            PuzzleRule::Renban { cells, .. } if cells.len() == 9 => {
                rules.push(PuzzleRule::ExtraHouse { cells });
            }
            PuzzleRule::Renban { cells, .. } => {
                rules.push(PuzzleRule::Renban {
                    cells,
                    segments: None,
                });
            }
            PuzzleRule::KillerCages {
                mut cages,
                cover_grid: false,
            } => {
                cages.retain(|cage| {
                    if cage.cells.len() == 9 && cage.sum == 45 {
                        rules.push(PuzzleRule::ExtraHouse {
                            cells: cage.cells.clone(),
                        });
                        false
                    } else {
                        true
                    }
                });
                if !cages.is_empty() {
                    rules.push(PuzzleRule::KillerCages {
                        cages,
                        cover_grid: false,
                    });
                }
            }
            PuzzleRule::Kropki {
                consecutive,
                ratio_two,
            } if !negative_kropki => {
                rules.extend(
                    consecutive
                        .pairs
                        .into_iter()
                        .map(|cells| PuzzleRule::Renban {
                            cells: cells.to_vec(),
                            segments: None,
                        }),
                );
                if !ratio_two.pairs.is_empty() {
                    rules.push(PuzzleRule::Kropki {
                        consecutive: Default::default(),
                        ratio_two,
                    });
                }
            }
            rule => rules.push(rule),
        }
    }
    puzzle.rules = rules;
}

// For length k in 6..=8, every allowed interval contains [10-k, k]. Those
// central digits can permute freely. The outer digits permit only reversal.
// Shorter nontrivial Renbans permit identity/complement. Nine-cell sets have
// already become digit-invariant houses. Numeric companions disable renaming.
pub(super) fn minimum_length(rules: &[PuzzleRule]) -> Option<usize> {
    let mut minimum = None;
    for rule in rules {
        match rule {
            PuzzleRule::Renban { cells, .. } => {
                minimum = Some(minimum.unwrap_or(9).min(cells.len()));
            }
            _ if digit_invariant(rule) => {}
            _ => return None,
        }
    }
    minimum
}

pub(super) fn rename(givens: &mut [u8; CELLS], length: usize) {
    let original = *givens;
    let mut best = original;
    for complement in [false, true] {
        let mut candidate = original;
        let mut names = [0; 10];
        let mut next = 10 - length as u8;
        for given in &mut candidate {
            if *given == 0 {
                continue;
            }
            if complement {
                *given = 10 - *given;
            }
            if length >= 6 && *given >= 10 - length as u8 && *given <= length as u8 {
                let name = &mut names[usize::from(*given)];
                if *name == 0 {
                    *name = next;
                    next += 1;
                }
                *given = *name;
            }
        }
        if !complement || candidate < best {
            best = candidate;
        }
    }
    *givens = best;
}

#[cfg(test)]
mod tests;
