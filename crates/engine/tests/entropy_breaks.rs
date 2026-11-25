#![cfg(feature = "variants")]

use sudoku_app_engine::{Analysis, PuzzleRule, VariantPuzzle, parse_givens};

fn puzzle(with_break: bool) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    puzzle.rules.extend([
        PuzzleRule::Entropic {
            cells: vec![30, 31, 32],
        },
        PuzzleRule::Entropic {
            cells: vec![33, 42, 51],
        },
    ]);
    if with_break {
        puzzle.rules.push(PuzzleRule::ForbiddenEntropicConnection {
            cells: [31, 32, 33, 42],
        });
    }
    puzzle
}

#[test]
fn a_broken_join_is_invalid_if_both_crossing_triples_are_entropic() {
    let mut entries = [0; 81];
    for (cell, digit) in [(30, 1), (31, 4), (32, 7), (33, 2), (42, 5), (51, 8)] {
        entries[cell] = digit;
    }
    let positive_only = puzzle(false).compile().unwrap();
    assert!(matches!(
        positive_only.analyze(&entries, &[0; 81], 10_000),
        Ok(Analysis::Multiple)
    ));

    let with_break = puzzle(true).compile().unwrap();
    assert!(matches!(
        with_break.analyze(&entries, &[0; 81], 10_000),
        Ok(Analysis::Conflict)
    ));
}

#[test]
fn the_published_entropic_spiral_solution_respects_all_sixteen_broken_joins() {
    let solution = parse_givens(
        "527963184496128537138475296952637841374851629861249375285714963643592718719386452",
    )
    .unwrap();
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    let paths = [
        vec![40, 41, 50, 49, 48, 39, 30, 31, 32],
        vec![33, 42, 51, 60, 59, 58, 57, 56, 47],
        vec![38, 29, 20, 21],
        vec![22, 23, 24, 25, 34, 43, 52, 61, 70, 69],
        vec![68, 67, 66, 65],
        vec![64, 55],
        vec![46, 37],
        vec![28, 19, 10, 11, 12],
        vec![13, 14, 15, 16, 17, 26, 35, 44, 53, 62, 71],
        vec![80, 79],
        vec![77, 76, 75],
        vec![74, 73],
        vec![72, 63, 54, 45],
        vec![36, 27],
        vec![18, 9],
        vec![0, 1, 2],
        vec![3, 4, 5],
        vec![6, 7, 8],
    ];
    for path in &paths {
        puzzle.rules.push(PuzzleRule::Entropic {
            cells: path.clone(),
        });
    }
    for pair in paths.windows(2) {
        let left = &pair[0];
        let right = &pair[1];
        let a = *left.last().unwrap();
        let b = right[0];
        let adjacent = (a / 9).abs_diff(b / 9) + (a % 9).abs_diff(b % 9) == 1;
        if adjacent && left.len() >= 2 && right.len() >= 2 {
            puzzle.rules.push(PuzzleRule::ForbiddenEntropicConnection {
                cells: [left[left.len() - 2], a, b, right[1]],
            });
        }
    }
    assert_eq!(
        puzzle
            .rules
            .iter()
            .filter(|rule| matches!(rule, PuzzleRule::ForbiddenEntropicConnection { .. }))
            .count(),
        16
    );
    assert_eq!(
        puzzle.compile().unwrap().analyze(&solution, &[0; 81], 1),
        Ok(Analysis::Unique)
    );
}

#[cfg(feature = "wasm-api")]
#[test]
fn rule_round_trips_through_the_variant_wire_format() {
    let rule = PuzzleRule::ForbiddenEntropicConnection {
        cells: [31, 32, 33, 42],
    };
    let encoded = serde_json::to_value(&rule).unwrap();
    assert_eq!(encoded["type"], "forbidden-entropic-connection");
    assert_eq!(serde_json::from_value::<PuzzleRule>(encoded).unwrap(), rule);
}
