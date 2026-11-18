#![cfg(feature = "variants")]

use sudoku_app_engine::{
    Analysis, Diagonal, PuzzleRule, VariantPositionError, VariantPuzzle, parse_givens,
};

const EMPTY: [u8; 81] = [0; 81];
const NONE: [u16; 81] = [0; 81];
const SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

#[test]
fn hidden_house_values_do_not_change_public_candidates() {
    let puzzle = VariantPuzzle::classic(EMPTY).compile().unwrap();
    let mut removed = NONE;
    removed[1..9].fill(1);
    let before = puzzle.candidates(&EMPTY, &removed).unwrap();
    assert_eq!(before[0], 511);
    let solved = puzzle.solve(&EMPTY, &removed, 10_000).unwrap();
    assert_eq!(solved[0], 1);
    assert_eq!(
        puzzle.analyze(&EMPTY, &removed, 10_000),
        Ok(Analysis::Multiple)
    );
    assert_eq!(puzzle.candidates(&EMPTY, &removed).unwrap(), before);
}

#[test]
fn missing_house_digits_are_unsolvable_with_nonempty_cell_domains() {
    let windoku = vec![10, 11, 12, 19, 20, 21, 28, 29, 30];
    let diagonal: Vec<_> = (0..9).map(|i| i * 10).collect();
    for (rule, cells) in [
        (
            PuzzleRule::ExtraHouse {
                cells: windoku.clone(),
            },
            windoku,
        ),
        (
            PuzzleRule::Diagonal {
                diagonal: Diagonal::Main,
            },
            diagonal,
        ),
    ] {
        let mut definition = VariantPuzzle::classic(EMPTY);
        definition.rules.push(rule);
        let puzzle = definition.compile().unwrap();
        let mut removed = NONE;
        for cell in cells {
            removed[cell] = 1 << 8;
        }
        assert!(
            puzzle
                .candidates(&EMPTY, &removed)
                .unwrap()
                .iter()
                .all(|&mask| mask != 0)
        );
        assert_eq!(
            puzzle.analyze(&EMPTY, &removed, 0),
            Ok(Analysis::SearchLimit)
        );
        assert_eq!(
            puzzle.analyze(&EMPTY, &removed, 1),
            Ok(Analysis::Unsolvable)
        );
        assert_eq!(
            puzzle.solve(&EMPTY, &removed, 1),
            Err(VariantPositionError::Puzzle(Analysis::Unsolvable))
        );
    }
}

#[test]
fn two_missing_digits_cannot_share_their_only_remaining_cell() {
    let puzzle = VariantPuzzle::classic(EMPTY).compile().unwrap();
    let mut removed = NONE;
    removed[0] = 511 & !0b11;
    removed[1..9].fill(0b11);
    assert!(
        puzzle
            .candidates(&EMPTY, &removed)
            .unwrap()
            .iter()
            .all(|&mask| mask.count_ones() > 1)
    );
    assert_eq!(
        puzzle.analyze(&EMPTY, &removed, 1),
        Ok(Analysis::Unsolvable)
    );
}

#[test]
fn irregular_houses_do_not_acquire_standard_box_constraints() {
    let solution = std::array::from_fn(|cell| ((cell / 9 + cell % 9) % 9 + 1) as u8);
    let regions = (0..9)
        .map(|r| (0..9).map(|c| r * 9 + c).collect())
        .collect();
    let mut givens = solution;
    givens[..9].fill(0);
    let puzzle = VariantPuzzle::jigsaw(givens, regions).compile().unwrap();
    assert_eq!(puzzle.analyze(&EMPTY, &NONE, 100), Ok(Analysis::Unique));
    assert_eq!(puzzle.solve(&EMPTY, &NONE, 100), Ok(solution));
    assert!(
        VariantPuzzle::classic(givens)
            .compile()
            .unwrap()
            .analyze(&EMPTY, &NONE, 100)
            .unwrap()
            != Analysis::Unique
    );
}

#[test]
fn node_boundaries_keep_conflict_unsolvable_unique_and_multiple_distinct() {
    let solution = parse_givens(SOLUTION).unwrap();
    let full = VariantPuzzle::classic(solution).compile().unwrap();
    assert_eq!(full.analyze(&EMPTY, &NONE, 0), Ok(Analysis::SearchLimit));
    assert_eq!(full.analyze(&EMPTY, &NONE, 1), Ok(Analysis::Unique));
    let mut givens = solution;
    givens[0] = 0;
    let one = VariantPuzzle::classic(givens).compile().unwrap();
    assert_eq!(one.analyze(&EMPTY, &NONE, 1), Ok(Analysis::SearchLimit));
    assert_eq!(one.analyze(&EMPTY, &NONE, 2), Ok(Analysis::Unique));
    let mut removed = NONE;
    removed[0] = 511;
    assert_eq!(one.analyze(&EMPTY, &removed, 1), Ok(Analysis::Unsolvable));
    let mut wrong = EMPTY;
    wrong[1] = 1;
    assert_eq!(one.analyze(&wrong, &NONE, 0), Ok(Analysis::Conflict));
    assert_eq!(
        VariantPuzzle::classic(EMPTY)
            .compile()
            .unwrap()
            .analyze(&EMPTY, &NONE, 10_000),
        Ok(Analysis::Multiple)
    );
}

#[cfg(feature = "wasm-api")]
#[test]
fn published_zero_given_mixed_rules_fit_the_existing_default_budget() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/inequality-palindrome14.json"
    ))
    .unwrap();
    let definition: VariantPuzzle = serde_json::from_value(fixture["puzzle"].clone()).unwrap();
    let expected = parse_givens(fixture["solution"].as_str().unwrap()).unwrap();
    let compiled = definition.compile().unwrap();
    assert_eq!(
        compiled.analyze(&EMPTY, &NONE, 20_000),
        Ok(Analysis::SearchLimit)
    );
    assert_eq!(
        compiled.analyze(&EMPTY, &NONE, 1_000_000),
        Ok(Analysis::Unique)
    );
    assert_eq!(compiled.solve(&EMPTY, &NONE, 1_000_000), Ok(expected));
    let mut without = definition;
    without
        .rules
        .retain(|rule| !matches!(rule, PuzzleRule::Inequality { .. }));
    assert_eq!(
        without.compile().unwrap().analyze(&EMPTY, &NONE, 1_000_000),
        Ok(Analysis::Multiple)
    );
}
