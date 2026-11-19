use sudoku_app_engine::{Analysis, GridSpec, HintAction, SizedGrid, SizedTechnique};

fn grid(size: usize, box_rows: usize, box_columns: usize) -> SizedGrid {
    SizedGrid::new(GridSpec {
        size,
        box_rows,
        box_columns,
    })
    .unwrap()
}

fn mini_completions() -> Vec<[u8; 16]> {
    // Enumerate row permutations independently of the engine's cell search.
    let rows: Vec<_> = (0..256u32)
        .map(|bits| std::array::from_fn::<_, 4, _>(|cell| ((bits >> (2 * cell)) & 3) as u8 + 1))
        .filter(|row| row.iter().collect::<std::collections::BTreeSet<_>>().len() == 4)
        .collect();
    let compatible = |a: &[u8; 4], b: &[u8; 4]| (0..4).all(|col| a[col] != b[col]);
    let band = |a: &[u8; 4], b: &[u8; 4]| {
        !a[..2].iter().any(|digit| b[..2].contains(digit))
            && !a[2..].iter().any(|digit| b[2..].contains(digit))
    };
    let mut completions = Vec::new();
    for a in &rows {
        for b in rows.iter().filter(|b| band(a, b)) {
            for c in rows.iter().filter(|c| compatible(a, c) && compatible(b, c)) {
                for d in rows
                    .iter()
                    .filter(|d| compatible(a, d) && compatible(b, d) && band(c, d))
                {
                    completions.push(std::array::from_fn(|index| {
                        [a, b, c, d][index / 4][index % 4]
                    }));
                }
            }
        }
    }
    completions
}

#[test]
fn mini_classifies_clue_subsets_against_all_288_independent_completions() {
    let grid = grid(4, 2, 2);
    let completions = mini_completions();
    assert_eq!(completions.len(), 288);
    for solution in &completions {
        assert_eq!(grid.analyze(solution, 1), Analysis::Unique);
    }
    // Use every subset of one completion, plus an independent no-completion control.
    let solution = completions[0];
    for keep in 0..=u16::MAX {
        let givens = std::array::from_fn::<_, 16, _>(|cell| {
            if keep & (1 << cell) != 0 {
                solution[cell]
            } else {
                0
            }
        });
        let expected = completions
            .iter()
            .filter(|candidate| {
                givens
                    .iter()
                    .zip(candidate.iter())
                    .all(|(&given, &digit)| given == 0 || given == digit)
            })
            .take(2)
            .count();
        let actual = grid.analyze(&givens, 1_000);
        assert_eq!(
            actual,
            if expected == 1 {
                Analysis::Unique
            } else {
                Analysis::Multiple
            },
            "{givens:?}"
        );
        if actual == Analysis::Unique {
            assert_eq!(
                grid.solve(&givens, 1_000).as_deref(),
                Some(solution.as_slice())
            );
        }
    }
    let impossible = [0, 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    assert!(grid.candidates(&impossible).is_some());
    assert_eq!(grid.analyze(&impossible, 1_000), Analysis::Unsolvable);
}

#[test]
fn layout_and_budget_preserve_rectangles_large_masks_and_error_bounds() {
    assert!(
        SizedGrid::new(GridSpec {
            size: 4,
            box_rows: usize::MAX,
            box_columns: 2
        })
        .is_none()
    );
    let mut digits = [0; 36];
    digits[2] = 6;
    assert_eq!(grid(6, 2, 3).candidates(&digits).unwrap()[6], 0b01_1111);
    assert_eq!(grid(6, 3, 2).candidates(&digits).unwrap()[6], 0b11_1111);
    assert_eq!(grid(16, 4, 4).candidates(&[0; 256]).unwrap()[255], u16::MAX);
    let mini = grid(4, 2, 2);
    assert_eq!(mini.analyze(&[0; 16], 0), Analysis::SearchLimit);
    assert_eq!(mini.analyze(&[1; 16], 0), Analysis::Conflict);
    assert_eq!(mini.analyze(&[0; 15], 1_000), Analysis::Conflict);
}

#[test]
fn locked_candidate_evidence_identifies_the_two_houses_and_exact_targets() {
    let mini = grid(4, 2, 2);
    let mut removed = [0; 16];
    removed[2] = 1;
    removed[3] = 1;
    let step = mini.next_deduction(&[0; 16], &removed).unwrap();
    assert_eq!(step.technique, SizedTechnique::LockedCandidate);
    assert_eq!(
        step.houses,
        [
            sudoku_app_engine::House::Row(0),
            sudoku_app_engine::House::Box(0)
        ]
    );
    assert_eq!(
        step.candidates
            .iter()
            .map(|candidate| candidate.cell)
            .collect::<Vec<_>>(),
        [0, 1]
    );
    assert_eq!(
        step.actions
            .iter()
            .map(|action| action.candidate().cell)
            .collect::<Vec<_>>(),
        [4, 5]
    );
    assert!(
        step.actions.iter().all(
            |action| matches!(action, HintAction::Eliminate(candidate) if candidate.digit == 1)
        )
    );
    for solution in mini_completions()
        .iter()
        .filter(|solution| solution[2] != 1 && solution[3] != 1)
    {
        assert_ne!(solution[4], 1);
        assert_ne!(solution[5], 1);
    }
    removed[0] = 16;
    assert!(mini.next_deduction(&[0; 16], &removed).is_none());
}

#[cfg(feature = "generation")]
#[test]
fn mini_generation_checks_uniqueness_recipes_replay_and_played_exclusions() {
    use sudoku_app_engine::{MiniDifficulty, generate_mini};

    let layout = grid(4, 2, 2);
    let completions = mini_completions();
    for (difficulty, range) in [
        (MiniDifficulty::Easy, 8..=10),
        (MiniDifficulty::Medium, 4..=6),
    ] {
        let mut exclude = Vec::new();
        for seed in 0..32 {
            let puzzle =
                generate_mini(seed, difficulty, &exclude).expect("the recipe yields a puzzle");
            let givens = puzzle.iter().filter(|&&digit| digit != 0).count();
            assert!(range.contains(&givens));
            let mut matches = completions.iter().filter(|solution| {
                puzzle
                    .iter()
                    .zip(solution.iter())
                    .all(|(&given, &digit)| given == 0 || given == digit)
            });
            let answer = matches
                .next()
                .expect("the independent oracle finds a solution");
            assert!(matches.next().is_none());
            let replay = layout.trace(puzzle.to_vec(), vec![0; 16], true).unwrap();
            assert_eq!(replay.len(), 17 - givens);
            assert_eq!(replay.last().unwrap().digits, answer.as_slice());
            assert!(!exclude.contains(&puzzle));
            exclude.push(puzzle);
        }
        let first = generate_mini(10, difficulty, &[]).unwrap();
        assert_eq!(generate_mini(10, difficulty, &[]), Some(first));
        assert_ne!(generate_mini(10, difficulty, &[first]), Some(first));
    }
}
