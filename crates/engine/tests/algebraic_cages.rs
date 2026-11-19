#![cfg(feature = "variants")]

use sudoku_app_engine::{
    AlgebraicCage, Analysis, CageTotal, GridSpec, SizedAlgebraicCages, SizedGrid,
};

const MINI: GridSpec = GridSpec {
    size: 4,
    box_rows: 2,
    box_columns: 2,
};

fn cage(cells: &[usize], offset: i32) -> AlgebraicCage {
    let label = if offset == 0 {
        "x".to_owned()
    } else {
        format!("x{offset:+}")
    };
    AlgebraicCage {
        cells: cells.to_vec(),
        total: CageTotal::Variable {
            name: "x".to_owned(),
            offset,
        },
        label,
    }
}

#[test]
fn algebraic_cages_derive_shared_positive_integer_and_exact_completion() {
    let puzzle = SizedAlgebraicCages::new(
        MINI,
        vec![cage(&[5, 6, 9], 0), cage(&[11, 15], 1), cage(&[0], -5)],
    )
    .unwrap();
    let grid = [0; 16];
    assert_eq!(
        SizedGrid::new(MINI).unwrap().analyze(&grid, 1_000),
        Analysis::Multiple
    );
    let bounds = puzzle.bounds(&grid).unwrap();
    assert_eq!(bounds.variables["x"], (6, 6));
    assert_eq!(
        (bounds.cages[0].sum_lower, bounds.cages[0].sum_upper),
        (6, 9)
    );
    assert_eq!(
        (bounds.cages[1].sum_lower, bounds.cages[1].sum_upper),
        (3, 7)
    );
    assert_eq!(
        (bounds.cages[2].sum_lower, bounds.cages[2].sum_upper),
        (1, 4)
    );
    assert_eq!(
        puzzle
            .cages()
            .iter()
            .map(|cage| cage.label.as_str())
            .collect::<Vec<_>>(),
        ["x", "x+1", "x-5"]
    );
    let proof = puzzle.proof_at(&grid, &[0; 16], 2, 100).unwrap();
    assert_eq!((proof.total_lower, proof.total_upper), (1, 1));
    assert_eq!(proof.bounds.variables["x"], (6, 6));
    assert_eq!(
        proof
            .actions
            .iter()
            .map(|action| action.candidate())
            .collect::<Vec<_>>(),
        [2, 3, 4].map(|digit| sudoku_app_engine::Candidate { cell: 0, digit })
    );
    assert!(puzzle.proof_at(&grid, &[0; 16], 2, 1).is_none());
    assert_eq!(puzzle.analyze(&grid, 1_000), Analysis::Unique);
    assert_eq!(puzzle.analyze(&grid, 1), Analysis::SearchLimit);
    let answer = puzzle.solve(&grid, 1_000).unwrap();
    assert_eq!(
        answer.digits,
        [1, 3, 4, 2, 4, 2, 3, 1, 3, 1, 2, 4, 2, 4, 1, 3]
    );
    assert_eq!(answer.variables["x"], 6);
    let trace = puzzle.trace(grid.to_vec(), vec![0; 16], 1_000).unwrap();
    let Some(sudoku_app_engine::AlgebraicStep::Cage(opening)) = &trace[0].step else {
        panic!("the opening must explain the shared cage total");
    };
    assert_eq!(opening.target, 2);
    assert_eq!(trace.last().unwrap().digits, answer.digits);
    assert!(trace.last().unwrap().step.is_none());
}

#[test]
fn algebraic_cage_rules_distinguish_conflict_infeasibility_and_multiple_completions() {
    assert!(SizedAlgebraicCages::new(MINI, vec![cage(&[0, 0], 0)]).is_none());
    assert!(SizedAlgebraicCages::new(MINI, vec![cage(&[16], 0)]).is_none());
    let impossible = SizedAlgebraicCages::new(MINI, vec![cage(&[0], 4)]).unwrap();
    assert!(impossible.bounds(&[0; 16]).is_none());
    assert_eq!(impossible.analyze(&[0; 16], 1_000), Analysis::Unsolvable);

    let together = SizedAlgebraicCages::new(MINI, vec![cage(&[0, 15], 0)]).unwrap();
    assert_eq!(together.analyze(&[0; 16], 1_000), Analysis::Multiple);
    let mut repeated = [0; 16];
    repeated[0] = 1;
    repeated[15] = 1;
    assert_eq!(
        SizedGrid::new(MINI).unwrap().analyze(&repeated, 1_000),
        Analysis::Multiple
    );
    assert_eq!(together.analyze(&repeated, 1_000), Analysis::Conflict);

    let fixed = AlgebraicCage {
        cells: vec![0],
        total: CageTotal::Fixed(4),
        label: "4".into(),
    };
    let mixed = SizedAlgebraicCages::new(MINI, vec![fixed, cage(&[0], -5)]).unwrap();
    let answer = mixed.solve(&[0; 16], 1_000).unwrap();
    assert_eq!(answer.digits[0], 4);
    assert_eq!(answer.variables["x"], 9);
}

#[cfg(feature = "generation")]
#[test]
fn generated_algebraic_puzzles_need_each_cage_and_replay_to_a_unique_solution() {
    use std::collections::HashSet;
    use sudoku_app_engine::{AlgebraicStep, generate_algebraic};

    let mut samples = HashSet::new();
    for seed in 0..128 {
        let generated = generate_algebraic(seed, &[]).unwrap_or_else(|| panic!("seed {seed}"));
        assert!(samples.insert(generated.clone()), "duplicate seed {seed}");
        let grid = SizedGrid::new(MINI).unwrap();
        assert_eq!(grid.analyze(&generated.givens, 1_000), Analysis::Multiple);
        let puzzle = SizedAlgebraicCages::new(MINI, generated.cages.clone()).unwrap();
        assert_eq!(puzzle.analyze(&generated.givens, 1_000), Analysis::Unique);
        let solution = puzzle.solve(&generated.givens, 1_000).unwrap();
        let trace = puzzle
            .trace(generated.givens.to_vec(), vec![0; 16], 1_000)
            .unwrap();
        assert_eq!(trace.last().unwrap().digits, solution.digits);
        assert!(
            trace
                .iter()
                .any(|position| matches!(position.step, Some(AlgebraicStep::Cage(_))))
        );
        for removed in 0..generated.cages.len() {
            let mut remaining = generated.cages.clone();
            remaining.remove(removed);
            let partial = SizedAlgebraicCages::new(MINI, remaining).unwrap();
            assert_eq!(
                partial.analyze(&generated.givens, 1_000),
                Analysis::Multiple
            );
        }
    }

    let original = generate_algebraic(42, &[]).unwrap();
    assert_eq!(generate_algebraic(42, &[]).unwrap(), original);
    assert_ne!(
        generate_algebraic(42, &[original.clone()]).unwrap(),
        original
    );
}
