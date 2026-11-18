use std::cell::OnceCell;

use super::{PatternSearch, inference_graph::InferenceGraph};
use crate::{Board, CELLS};

/// Reuse rectangle links across detectors for one immutable logical position.
/// An empty graph is also a completed result. Different inputs use the caller's
/// local cache so a misplaced shared cache can never supply stale links.
#[derive(Default)]
pub(crate) struct RectangleInferenceCache {
    position: OnceCell<Box<CachedPosition>>,
}

struct CachedPosition {
    board: Board,
    masks: [u16; CELLS],
    graph: Option<Box<InferenceGraph>>,
}

impl RectangleInferenceCache {
    pub(super) fn graph_for(
        &self,
        search: &PatternSearch<'_>,
    ) -> Option<&Option<Box<InferenceGraph>>> {
        let position = self.position.get_or_init(|| {
            Box::new(CachedPosition {
                board: *search.board,
                masks: *search.masks,
                graph: InferenceGraph::for_unique_rectangles(search).map(Box::new),
            })
        });
        (position.board == *search.board && position.masks == *search.masks)
            .then_some(&position.graph)
    }
}

#[cfg(all(test, feature = "teaching"))]
mod tests {
    use super::*;
    use crate::{DIGITS, Hint, Technique, hints::DeductionSearch};

    const METHODS: [Technique; 3] = [
        Technique::UniqueRectangleAic,
        Technique::UniqueRectangleContinuousNiceLoop,
        Technique::UniqueRectangleDiscontinuousNiceLoop,
    ];

    fn proofs(
        board: &Board,
        masks: &[u16; CELLS],
        technique: Technique,
        cache: Option<&RectangleInferenceCache>,
    ) -> Vec<Hint> {
        let search = DeductionSearch::new(board, masks);
        match cache {
            Some(cache) => search.with_rectangle_inference(cache).hints(technique),
            None => search.hints(technique),
        }
    }

    #[test]
    fn published_rectangle_chain_proofs_survive_both_orders_of_shared_search() {
        for target in METHODS {
            for example in target.practice_examples() {
                let source = example.position().unwrap();
                let board = source.values().unwrap();
                let mut masks = crate::candidates(&board).unwrap();
                for (mask, removed) in masks.iter_mut().zip(source.eliminations) {
                    *mask &= !removed;
                }
                for order in [METHODS, [METHODS[2], METHODS[1], METHODS[0]]] {
                    let cache = RectangleInferenceCache::default();
                    for technique in order {
                        let expected = proofs(&board, &masks, technique, None);
                        let actual = proofs(&board, &masks, technique, Some(&cache));
                        assert_eq!(actual, expected);
                        if technique == target {
                            assert!(
                                actual
                                    .iter()
                                    .any(|hint| { hint.actions == example.expected_actions })
                            );
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn an_empty_result_cannot_suppress_a_different_positions_published_proof() {
        let cache = RectangleInferenceCache::default();
        for technique in METHODS {
            assert!(proofs(&[0; CELLS], &[DIGITS; CELLS], technique, Some(&cache)).is_empty());
        }
        for technique in METHODS {
            let example = technique.practice_examples()[0];
            let source = example.position().unwrap();
            let board = source.values().unwrap();
            let mut masks = crate::candidates(&board).unwrap();
            for (mask, removed) in masks.iter_mut().zip(source.eliminations) {
                *mask &= !removed;
            }
            let expected = proofs(&board, &masks, technique, None);
            assert!(
                expected
                    .iter()
                    .any(|hint| hint.actions == example.expected_actions)
            );
            assert_eq!(proofs(&board, &masks, technique, Some(&cache)), expected);
        }
    }

    #[test]
    fn changed_domains_cannot_replay_cached_links_or_replace_the_original_position() {
        for technique in METHODS {
            let example = technique.practice_examples()[0];
            let source = example.position().unwrap();
            let board = source.values().unwrap();
            let mut masks = crate::candidates(&board).unwrap();
            for (mask, removed) in masks.iter_mut().zip(source.eliminations) {
                *mask &= !removed;
            }
            let cache = RectangleInferenceCache::default();
            let expected = proofs(&board, &masks, technique, None);
            assert!(!expected.is_empty());
            assert_eq!(proofs(&board, &masks, technique, Some(&cache)), expected);
            // No candidates means no valid chain action, even though the same
            // board previously supplied a positive rectangle graph.
            assert!(proofs(&board, &[0; CELLS], technique, Some(&cache)).is_empty());
            assert_eq!(proofs(&board, &masks, technique, Some(&cache)), expected);
        }
    }
}
