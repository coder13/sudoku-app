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
