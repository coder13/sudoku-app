#![cfg(feature = "variants")]

use sudoku_app_engine::{
    Analysis, GridSpec, SizedConstraint as Rule, SizedConstraintGrid, SizedDiagonal, SizedParity,
};

const SIX: GridSpec = GridSpec {
    size: 6,
    box_rows: 2,
    box_columns: 3,
};

#[test]
fn diagonal_parity_and_thermometers_all_matter_to_the_solution() {
    let digits: Vec<u8> = b"000000000000000000000000000030000400"
        .iter()
        .map(|c| c - b'0')
        .collect();
    let answer: Vec<u8> = b"413652625314234561156243542136361425"
        .iter()
        .map(|c| c - b'0')
        .collect();
    let rules = [
        Rule::Diagonal(SizedDiagonal::Anti),
        Rule::Parity {
            cells: vec![24, 17],
            parity: SizedParity::Odd,
        },
        Rule::Thermometer {
            cells: vec![1, 7, 13, 14],
        },
        Rule::Thermometer {
            cells: vec![32, 26, 20],
        },
    ];
    let grid = SizedConstraintGrid::new(SIX, &rules).unwrap();
    assert_eq!(grid.analyze(&digits, 100_000), Analysis::Unique);
    assert_eq!(grid.solve(&digits, 100_000).unwrap(), answer);
    for retained in [&rules[1..], &rules[..2]] {
        let subset = SizedConstraintGrid::new(SIX, retained).unwrap();
        assert_eq!(subset.analyze(&digits, 100_000), Analysis::Multiple);
    }
    let no_parity = [rules[0].clone(), rules[2].clone(), rules[3].clone()];
    assert_eq!(
        SizedConstraintGrid::new(SIX, &no_parity)
            .unwrap()
            .analyze(&digits, 100_000),
        Analysis::Multiple
    );
    assert_eq!(grid.analyze(&digits, 1), Analysis::SearchLimit);
    for (cell, mask) in grid.candidates(&digits).unwrap().iter().enumerate() {
        if digits[cell] == 0 {
            assert_ne!(mask & (1 << (answer[cell] - 1)), 0);
        }
    }
}

#[test]
fn shared_thermometer_cells_propagate_parity_to_the_tip() {
    let grid = SizedConstraintGrid::new(
        SIX,
        &[
            Rule::Thermometer {
                cells: vec![2, 8, 14],
            },
            Rule::Thermometer {
                cells: vec![0, 1, 2],
            },
            Rule::Parity {
                cells: vec![2],
                parity: SizedParity::Even,
            },
        ],
    )
    .unwrap();
    let candidates = grid.candidates(&[0; 36]).unwrap();
    assert_eq!(candidates[2], 1 << 3);
    assert_eq!(candidates[8], 1 << 4);
    assert_eq!(candidates[14], 1 << 5);

    let mut placed = [0; 36];
    placed[2] = 3;
    assert_eq!(grid.analyze(&placed, 100_000), Analysis::Conflict);
    assert!(grid.candidates(&placed).is_none());
    assert!(SizedConstraintGrid::new(SIX, &[Rule::Thermometer { cells: vec![0, 0] }]).is_none());
}

#[test]
fn exact_search_proves_the_sparse_jigsaw_thermometer_within_a_small_node_budget() {
    let labels = b"0000111020011122233312223434555343456664445556666";
    let regions: Vec<Vec<usize>> = (b'0'..b'7')
        .map(|label| {
            labels
                .iter()
                .enumerate()
                .filter_map(|(cell, &region)| (label == region).then_some(cell))
                .collect()
        })
        .collect();
    let layout = sudoku_app_engine::SizedGrid::with_regions(7, &regions).unwrap();
    let rules = [
        vec![8, 16, 24],
        vec![14, 22, 30],
        vec![20, 26, 33],
        vec![41, 48, 47],
        vec![6, 12],
        vec![42, 43],
    ]
    .map(|cells| Rule::Thermometer { cells });
    let grid = SizedConstraintGrid::with_layout(layout, &rules).unwrap();
    let digits = [0; 49];
    assert_eq!(grid.analyze(&digits, 1), Analysis::SearchLimit);
    assert_eq!(grid.analyze(&digits, 15_000), Analysis::Unique);
    let answer: Vec<u8> = b"7135624632415747625132517346127346534562715641732"
        .iter()
        .map(|c| c - b'0')
        .collect();
    assert_eq!(grid.solve(&digits, 15_000), Some(answer));
}
