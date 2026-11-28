use super::{CompiledVariant, MarkedPairs, PuzzleRule, RegionLayout, VariantPuzzle};
use crate::variant::Diagonal;

fn marker_layer<'a>(rule: &'a PuzzleRule, id: &str) -> Option<&'a MarkedPairs> {
    match (rule, id) {
        (PuzzleRule::Kropki { consecutive, .. }, "kropki-white") => Some(consecutive),
        (PuzzleRule::Kropki { ratio_two, .. }, "kropki-black") => Some(ratio_two),
        (PuzzleRule::Xv { five, .. }, "xv-five") => Some(five),
        (PuzzleRule::Xv { ten, .. }, "xv-ten") => Some(ten),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Analysis, CELLS, parse_givens};

    #[test]
    fn removing_white_keeps_a_double_on_its_original_marked_edge_legal() {
        let solution = parse_givens(
            "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
        )
        .unwrap();
        let doubles: Vec<_> = (0..CELLS)
            .flat_map(|a| {
                [a + 1, a + 9].into_iter().filter_map(move |b| {
                    if b >= CELLS || b == a + 1 && a / 9 != b / 9 {
                        return None;
                    }
                    let (x, y) = (solution[a], solution[b]);
                    (x.max(y) == 2 * x.min(y)).then_some([a, b])
                })
            })
            .collect();
        let overlap = *doubles
            .iter()
            .find(|&&[a, b]| solution[a].abs_diff(solution[b]) == 1)
            .unwrap();
        let mut puzzle = VariantPuzzle::classic(solution);
        puzzle.rules.push(PuzzleRule::Kropki {
            consecutive: MarkedPairs {
                pairs: vec![overlap],
                negative: false,
            },
            ratio_two: MarkedPairs {
                pairs: doubles
                    .into_iter()
                    .filter(|&pair| pair != overlap)
                    .collect(),
                negative: true,
            },
        });
        let reduced = without_family(&puzzle, "kropki-white").unwrap();
        assert_eq!(
            reduced.analyze(&[0; CELLS], &[0; CELLS], 1),
            Ok(Analysis::Unique)
        );
        if let PuzzleRule::Kropki { consecutive, .. } = &mut puzzle.rules[0] {
            consecutive.pairs.clear();
        }
        assert_eq!(
            puzzle
                .compile()
                .unwrap()
                .analyze(&[0; CELLS], &[0; CELLS], 1),
            Ok(Analysis::Conflict)
        );
    }
}

fn matches(rule: &PuzzleRule, id: &str) -> bool {
    match (rule, id) {
        (
            PuzzleRule::Diagonal {
                diagonal: Diagonal::Main,
            },
            "diagonal-main",
        )
        | (
            PuzzleRule::Diagonal {
                diagonal: Diagonal::Anti,
            },
            "diagonal-anti",
        )
        | (
            PuzzleRule::Whispers {
                min_difference: 4, ..
            },
            "dutch-whispers",
        )
        | (
            PuzzleRule::Whispers {
                min_difference: 5, ..
            },
            "german-whispers",
        ) => true,
        _ => rule.id() == id,
    }
}

pub(super) fn has_family(puzzle: &VariantPuzzle, id: &str) -> bool {
    if id == "jigsaw" {
        return matches!(puzzle.regions, RegionLayout::Jigsaw { .. });
    }
    puzzle.rules.iter().any(|rule| {
        matches(rule, id)
            || marker_layer(rule, id).is_some_and(|layer| layer.negative || !layer.pairs.is_empty())
    })
}

pub(super) fn without_family(puzzle: &VariantPuzzle, id: &str) -> Option<CompiledVariant> {
    if !has_family(puzzle, id) {
        return None;
    }
    if id == "jigsaw" {
        return puzzle.compile_with_regions(false).ok();
    }
    let mut reduced = puzzle.clone();
    let mut xv = Vec::new();
    let mut kropki = Vec::new();
    reduced.rules.retain_mut(|rule| {
        if matches(rule, id) {
            if let PuzzleRule::AdjacentTotal { cells, sum: 5 | 10 } = rule {
                xv.push(*cells);
            }
            return false;
        }
        let (layer, exemptions) = match (rule, id) {
            (PuzzleRule::Kropki { consecutive, .. }, "kropki-white") => (consecutive, &mut kropki),
            (PuzzleRule::Kropki { ratio_two, .. }, "kropki-black") => (ratio_two, &mut kropki),
            (PuzzleRule::Xv { five, .. }, "xv-five") => (five, &mut xv),
            (PuzzleRule::Xv { ten, .. }, "xv-ten") => (ten, &mut xv),
            _ => return true,
        };
        // Erasing the clue's constraint must not activate the surviving
        // negative rule on a formerly marked edge.
        exemptions.append(&mut layer.pairs);
        layer.negative = false;
        true
    });
    reduced
        .compile_with_marker_exemptions(true, &xv, &kropki)
        .ok()
}
