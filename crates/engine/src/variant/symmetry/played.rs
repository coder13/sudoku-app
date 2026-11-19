//! Logical keys for generation exclusions, separate from public source data.

use super::{PuzzleRule, VariantPuzzle, key_impl};
use crate::CELLS;

// Drawing paths do not change a puzzle's logical identity. Keep them in the
// public canonical definition, but ignore them when excluding played puzzles.
pub(super) fn key(puzzle: &VariantPuzzle) -> VariantPuzzle {
    let mut logical = puzzle.clone();
    normalize_equalities(&mut logical);
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
    key_impl(&logical, true)
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
mod tests {
    use super::super::{SquareTransform, canonical_variant, generation_key};
    use super::*;

    fn whispers(cells: &[usize], min_difference: u8) -> PuzzleRule {
        PuzzleRule::Whispers {
            cells: cells.to_vec(),
            min_difference,
        }
    }

    #[test]
    fn played_whispers_identity_uses_edges_under_every_grid_symmetry() {
        let original = VariantPuzzle {
            rules: vec![whispers(&[0, 10, 20, 10, 0], 5), whispers(&[10, 0], 4)],
            ..VariantPuzzle::classic([0; CELLS])
        };
        let expected = generation_key(&original);
        for transform in SquareTransform::ALL {
            let mut equivalent = VariantPuzzle {
                rules: vec![
                    whispers(&[20, 10], 5),
                    whispers(&[10, 0], 5),
                    whispers(&[0, 10], 5),
                ],
                ..original.clone()
            };
            transform.puzzle(&mut equivalent);
            assert_eq!(generation_key(&equivalent), expected);
        }
        // Exclusion normalization must never rewrite a source puzzle.
        let public = canonical_variant(&original).unwrap();
        assert!(
            public
                .rules
                .iter()
                .any(|rule| matches!(rule, PuzzleRule::Whispers { cells, .. } if cells.len() == 5))
        );
        assert_eq!(original.rules[0], whispers(&[0, 10, 20, 10, 0], 5));
    }

    #[test]
    fn played_whispers_identity_keeps_minimums_and_separate_edge_sets() {
        let definition = |rules| VariantPuzzle {
            rules,
            ..VariantPuzzle::classic([0; CELLS])
        };
        let original = definition(vec![whispers(&[0, 10, 20], 5)]);
        assert_ne!(
            generation_key(&original),
            generation_key(&definition(vec![whispers(&[0, 10, 20], 4)]))
        );
        assert_ne!(
            generation_key(&original),
            generation_key(&definition(vec![whispers(&[0, 10], 5)]))
        );
        assert_ne!(
            generation_key(&original),
            generation_key(&definition(vec![
                whispers(&[0, 10, 20], 5),
                whispers(&[0, 20], 5),
            ]))
        );
        // Directed increasing paths keep their existing identity.
        let thermometer = definition(vec![PuzzleRule::Thermometer {
            cells: vec![0, 10, 20],
        }]);
        let mut changed = thermometer.clone();
        changed.givens[0] = 1;
        let mut reversed = changed.clone();
        reversed.rules = vec![PuzzleRule::Thermometer {
            cells: vec![20, 10, 0],
        }];
        assert_ne!(generation_key(&changed), generation_key(&reversed));
    }

    #[test]
    fn played_equalities_ignore_path_grouping_but_keep_public_sources() {
        let original = VariantPuzzle {
            rules: vec![
                PuzzleRule::Palindrome {
                    cells: vec![0, 12, 20, 40],
                    segments: Some(vec![vec![0, 12, 20], vec![20, 40]]),
                },
                PuzzleRule::Clone {
                    groups: vec![vec![40, 80]],
                },
            ],
            ..VariantPuzzle::classic([0; CELLS])
        };
        let mut given = original.clone();
        given.givens[0] = 1;
        given.givens[12] = 2;
        given.givens[25] = 3;
        let expected = generation_key(&given);
        let representations = [
            vec![
                PuzzleRule::Palindrome {
                    cells: vec![40, 20, 12, 0],
                    segments: None,
                },
                PuzzleRule::Clone {
                    groups: vec![vec![80, 40]],
                },
            ],
            vec![
                PuzzleRule::Palindrome {
                    cells: vec![40, 0],
                    segments: None,
                },
                PuzzleRule::Palindrome {
                    cells: vec![20, 12],
                    segments: None,
                },
                PuzzleRule::Clone {
                    groups: vec![vec![0, 80]],
                },
            ],
            vec![PuzzleRule::Clone {
                groups: vec![vec![80, 40, 0], vec![20, 12], vec![0, 80]],
            }],
        ];
        for rules in representations {
            for transform in SquareTransform::ALL {
                let mut equivalent = VariantPuzzle {
                    rules: rules.clone(),
                    ..given.clone()
                };
                transform.puzzle(&mut equivalent);
                for digit in &mut equivalent.givens {
                    if *digit != 0 {
                        *digit = 10 - *digit;
                    }
                }
                assert_eq!(generation_key(&equivalent), expected);
            }
        }
        assert_eq!(given.rules, original.rules);
        let public = canonical_variant(&given).unwrap();
        assert!(public.rules.iter().any(|rule| matches!(rule,
            PuzzleRule::Palindrome { cells, segments: Some(_) } if cells.len() == 4)));
        assert!(public.rules.iter().any(|rule| matches!(rule,
            PuzzleRule::Clone { groups } if groups.len() == 1 && groups[0].len() == 2)));
    }

    #[test]
    fn played_palindromes_keep_mirror_pairings_and_ignore_free_centers() {
        let definition = |cells| VariantPuzzle {
            rules: vec![PuzzleRule::Palindrome {
                cells,
                segments: None,
            }],
            ..VariantPuzzle::classic([0; CELLS])
        };
        assert_ne!(
            generation_key(&definition(vec![0, 10, 40, 50])),
            generation_key(&definition(vec![0, 10, 50, 40]))
        );
        let odd = definition(vec![0, 13, 40]);
        assert_eq!(
            generation_key(&odd),
            generation_key(&definition(vec![0, 22, 40]))
        );
        let mut changed = odd.clone();
        changed.rules.push(PuzzleRule::Palindrome {
            cells: vec![13, 22],
            segments: None,
        });
        assert_ne!(generation_key(&odd), generation_key(&changed));
        changed = odd.clone();
        changed.rules.push(PuzzleRule::AntiKing {});
        assert_ne!(generation_key(&odd), generation_key(&changed));
    }
}
