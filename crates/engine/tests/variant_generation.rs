#![cfg(all(feature = "variants", feature = "generation"))]

use sudoku_app_engine::{
    Analysis, ClueDirection, Difficulty, GeneratedVariant, GenerationRating, GenerationStep,
    KillerCage, MarkedPairs, MarkerFamily, OutsideClueKind, PuzzleRule, SolveStatus,
    TechniqueTargetMode, VariantClueLayout, VariantGenerationError, VariantGenerationOptions,
    VariantPosition, VariantPuzzle, VariantTechnique, canonical_variant, parse_givens,
    start_variant_generation,
};

const EMPTY: [u8; 81] = [0; 81];
const NO_REMOVALS: [u16; 81] = [0; 81];
const SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

fn generate(options: VariantGenerationOptions) -> (u32, GeneratedVariant) {
    let mut search = start_variant_generation(options).unwrap();
    while let Some(event) = search.advance() {
        if let GenerationStep::Matched { attempts, puzzle } = event {
            return (attempts, puzzle);
        }
    }
    panic!("the fixture targets should match within the supplied attempt budget")
}

fn jigsaw(solution: [u8; 81]) -> VariantPuzzle {
    let mut regions: Vec<Vec<usize>> = (0..9)
        .map(|region| {
            let top = region / 3 * 27 + region % 3 * 3;
            (0..9)
                .map(|offset| top + offset / 3 * 9 + offset % 3)
                .collect()
        })
        .collect();
    regions[0][7] = 29;
    regions[3][2] = 19;
    VariantPuzzle::jigsaw(solution, regions)
}

#[test]
fn generated_x_jigsaw_killer_and_mixed_puzzles_support_the_playing_apis() {
    let solution = parse_givens(SOLUTION).unwrap();
    let cages = VariantClueLayout::KillerCageSizes {
        sizes: vec![3; 27],
        cover_grid: true,
    };
    let cases = [
        (VariantPuzzle::x_sudoku(EMPTY), vec![], 2),
        (jigsaw(solution), vec![], 0),
        (VariantPuzzle::classic(EMPTY), vec![cages.clone()], 27),
        (jigsaw(solution), vec![cages], 27),
    ];
    for (template, derived_clues, clue_count) in cases {
        let mut options = VariantGenerationOptions::new(41, template, 72..=72);
        options.derived_clues = derived_clues;
        options.variant_clues = Some(clue_count..=clue_count);
        options.max_attempts = 5;
        let (attempts, output) = generate(options.clone());
        assert_eq!(generate(options), (attempts, output.clone()));
        assert_eq!(output.seed, 41);
        assert_eq!(output.givens, 72);
        assert_eq!(
            output
                .puzzle
                .givens
                .iter()
                .filter(|&&digit| digit != 0)
                .count(),
            72
        );
        assert_eq!(output.variant_clues, clue_count);
        assert_eq!(output.puzzle.variant_clue_count(), clue_count);
        let compiled = output.puzzle.compile().unwrap();
        assert_eq!(
            compiled.analyze(&EMPTY, &NO_REMOVALS, 10_000),
            Ok(Analysis::Unique)
        );
        assert_eq!(
            compiled.solve(&EMPTY, &NO_REMOVALS, 10_000),
            Ok(output.solution)
        );
        let candidates = compiled.candidates(&EMPTY, &NO_REMOVALS).unwrap();
        for (cell, &value) in output.puzzle.givens.iter().enumerate() {
            if value == 0 {
                assert_ne!(candidates[cell] & (1 << (output.solution[cell] - 1)), 0);
            } else {
                assert_eq!(value, output.solution[cell]);
                assert_eq!(candidates[cell], 0);
            }
        }
        if let Some(PuzzleRule::KillerCages { cages, cover_grid }) = output.puzzle.rules.last() {
            assert!(*cover_grid);
            for cage in cages {
                assert_eq!(cage.cells.len(), 3);
                assert!(
                    cage.cells
                        .windows(2)
                        .all(|pair| (pair[0] / 9).abs_diff(pair[1] / 9)
                            + (pair[0] % 9).abs_diff(pair[1] % 9)
                            == 1)
                );
                assert_eq!(
                    cage.sum,
                    cage.cells
                        .iter()
                        .map(|&cell| u16::from(output.solution[cell]))
                        .sum::<u16>()
                );
            }
        }
        let order = VariantTechnique::DEFAULT_ORDER;
        let hints = compiled
            .ranked_hints(&EMPTY, &NO_REMOVALS, order, 10)
            .unwrap();
        assert!((2..=10).contains(&hints.len()));
        let position = VariantPosition::new(output.puzzle);
        let trace = position.solve_logically(order).unwrap();
        assert_eq!(trace.rating, output.rating);
        assert_eq!(trace.rating.status, SolveStatus::Solved(Difficulty::Easy));
        let replay = trace.replay_step(0).unwrap();
        assert_eq!(replay.before, position);
        assert_eq!(
            trace.practice_position(replay.deduction.technique),
            Some(position.clone())
        );
        let action = replay.deduction.actions[0];
        assert!(
            compiled
                .check_practice_move(
                    &replay.before.entries,
                    &replay.before.eliminations,
                    replay.deduction.technique,
                    action
                )
                .unwrap()
                .is_some()
        );
    }
}

#[test]
fn cage_family_is_required_and_is_the_only_opening_on_the_generated_grid() {
    let mut options = VariantGenerationOptions::new(56, VariantPuzzle::classic(EMPTY), 0..=0);
    options.derived_clues = vec![VariantClueLayout::KillerCageSizes {
        sizes: vec![1; 81],
        cover_grid: true,
    }];
    options.variant_clues = Some(81..=81);
    options.technique = Some((
        VariantTechnique::CageCombinations,
        TechniqueTargetMode::ExclusiveOpening,
    ));
    options.required_rule = Some("killer-cages".to_string());
    options.max_attempts = 1;
    let (_, generated) = generate(options.clone());
    assert_eq!(generated.givens, 0);
    let mut without = generated.puzzle.clone();
    without.rules.retain(|rule| rule.id() != "killer-cages");
    assert_eq!(
        without
            .compile()
            .unwrap()
            .analyze(&EMPTY, &NO_REMOVALS, 10_000),
        Ok(Analysis::Multiple)
    );
    assert_eq!(
        generated
            .puzzle
            .compile()
            .unwrap()
            .analyze(&EMPTY, &NO_REMOVALS, 10_000),
        Ok(Analysis::Unique)
    );

    options
        .derived_clues
        .push(VariantClueLayout::Parity { cells: vec![0] });
    options.variant_clues = Some(82..=82);
    let mut rejected = start_variant_generation(options).unwrap();
    assert_eq!(
        rejected.advance(),
        Some(GenerationStep::Exhausted { attempts: 1 })
    );
}

#[test]
fn jigsaw_dependency_removes_region_uniqueness_and_keeps_rows_and_columns() {
    let solution = parse_givens(SOLUTION).unwrap();
    let mut options = VariantGenerationOptions::new(44, jigsaw(solution), 25..=27);
    options.required_rule = Some("jigsaw".to_string());
    options.max_attempts = 5;
    let (_, output) = generate(options);
    assert_eq!(output.solution, solution);
    assert_eq!(
        output
            .puzzle
            .compile()
            .unwrap()
            .analyze(&EMPTY, &NO_REMOVALS, 10_000),
        Ok(Analysis::Unique)
    );

    // Independently count up to two Latin-square completions. A column and
    // row contain each digit once, and the region memberships play no role.
    fn completions(grid: &mut [u8; 81], limit: u8, nodes: &mut u32) -> u8 {
        *nodes = nodes
            .checked_sub(1)
            .expect("the reference fixture has a small search tree");
        let next = (0..81)
            .filter(|&cell| grid[cell] == 0)
            .map(|cell| {
                let (row, column) = (cell / 9, cell % 9);
                let mut legal = 0x1ffu16;
                for index in 0..9 {
                    for digit in [grid[row * 9 + index], grid[index * 9 + column]] {
                        if digit != 0 {
                            legal &= !(1 << (digit - 1));
                        }
                    }
                }
                (cell, legal)
            })
            .min_by_key(|&(_, legal)| legal.count_ones());
        let Some((cell, legal)) = next else { return 1 };
        let mut count = 0;
        for digit in 1..=9 {
            if legal & (1 << (digit - 1)) != 0 {
                grid[cell] = digit;
                count += completions(grid, limit - count, nodes);
                grid[cell] = 0;
                if count == limit {
                    break;
                }
            }
        }
        count
    }
    let mut givens = output.puzzle.givens;
    assert_eq!(completions(&mut givens, 2, &mut 20_000), 2);
}

#[test]
fn generation_combines_score_and_configured_first_move() {
    let mut options = VariantGenerationOptions::new(56, VariantPuzzle::x_sudoku(EMPTY), 80..=80);
    options.technique_order = vec![VariantTechnique::NakedSingle, VariantTechnique::FullHouse];
    options.rating = Some(GenerationRating::Score(4..=4));
    options.technique = Some((VariantTechnique::NakedSingle, TechniqueTargetMode::First));
    let (_, output) = generate(options.clone());
    let trace = VariantPosition::new(output.puzzle.clone())
        .solve_logically(&options.technique_order)
        .unwrap();
    assert_eq!(trace.steps[0].technique, VariantTechnique::NakedSingle);
    assert_eq!(trace.rating.points, 4);
    assert_eq!(trace.rating.technique_order, options.technique_order);
    let mut difficulty_target = options.clone();
    difficulty_target.rating = Some(GenerationRating::Difficulty(Difficulty::Easy));
    difficulty_target.max_attempts = 1;
    let mut search = start_variant_generation(difficulty_target).unwrap();
    assert_eq!(
        search.advance(),
        Some(GenerationStep::Exhausted { attempts: 1 })
    );
    options.technique_order.reverse();
    options.max_attempts = 1;
    let mut search = start_variant_generation(options).unwrap();
    assert_eq!(
        search.advance(),
        Some(GenerationStep::Exhausted { attempts: 1 })
    );
}

#[test]
fn generated_clues_read_their_values_and_directions_from_the_sampled_solution() {
    let solution = parse_givens(SOLUTION).unwrap();
    let mut options = VariantGenerationOptions::new(100, VariantPuzzle::classic(solution), 78..=78);
    options.derived_clues = vec![
        VariantClueLayout::KillerCages {
            cages: vec![vec![0, 1]],
            cover_grid: false,
        },
        VariantClueLayout::Parity { cells: vec![0, 2] },
        VariantClueLayout::Inequality { cells: [4, 3] },
        VariantClueLayout::Markers {
            family: MarkerFamily::Xv,
            count: Some(7),
            negative: [false; 2],
        },
        VariantClueLayout::Outside {
            clue: OutsideClueKind::Sandwich,
            cells: (0..9).collect(),
            direction: ClueDirection::East,
        },
        VariantClueLayout::Outside {
            clue: OutsideClueKind::XSum,
            cells: (0..9).rev().collect(),
            direction: ClueDirection::West,
        },
        VariantClueLayout::Outside {
            clue: OutsideClueKind::Skyscrapers,
            cells: (0..9).collect(),
            direction: ClueDirection::East,
        },
        VariantClueLayout::Outside {
            clue: OutsideClueKind::LittleKiller,
            cells: vec![4, 14, 24, 34, 44],
            direction: ClueDirection::SouthEast,
        },
    ];
    options.variant_clues = Some(15..=15);
    let (_, result) = generate(options);
    assert_eq!(result.solution, solution);
    assert!(result.puzzle.rules.contains(&PuzzleRule::Inequality {
        less: 3,
        greater: 4
    }));
    assert!(result.puzzle.rules.contains(&PuzzleRule::KillerCages {
        cages: vec![KillerCage {
            cells: vec![0, 1],
            sum: 8
        }],
        cover_grid: false,
    }));
    let rules = &result.puzzle.rules;
    assert!(
        rules
            .iter()
            .any(|rule| matches!(rule, PuzzleRule::Sandwich { sum: 0, .. }))
    );
    assert!(
        rules
            .iter()
            .any(|rule| matches!(rule, PuzzleRule::XSum { sum: 3, .. }))
    );
    assert!(
        rules
            .iter()
            .any(|rule| matches!(rule, PuzzleRule::Skyscrapers { count: 5, .. }))
    );
    assert!(
        rules
            .iter()
            .any(|rule| matches!(rule, PuzzleRule::LittleKiller { sum: 20, .. }))
    );
    let PuzzleRule::Xv { five, ten } = rules.iter().find(|rule| rule.id() == "xv").unwrap() else {
        unreachable!()
    };
    assert_eq!(five.pairs.len() + ten.pairs.len(), 7);
    for (pairs, sum) in [(&five.pairs, 5), (&ten.pairs, 10)] {
        assert!(pairs.iter().all(|&[a, b]| solution[a] + solution[b] == sum));
    }
}

#[test]
fn exclusions_transform_rules_and_givens_together() {
    let solution = parse_givens(SOLUTION).unwrap();
    let mut options = VariantGenerationOptions::new(82, VariantPuzzle::classic(solution), 79..=79);
    options.derived_clues = vec![
        VariantClueLayout::Outside {
            clue: OutsideClueKind::XSum,
            cells: (0..9).collect(),
            direction: ClueDirection::East,
        },
        VariantClueLayout::Inequality { cells: [2, 3] },
    ];
    options.template.rules.push(PuzzleRule::Kropki {
        consecutive: MarkedPairs {
            pairs: vec![[1, 2]],
            negative: false,
        },
        ratio_two: MarkedPairs::default(),
    });
    options.max_attempts = 1;
    let (_, generated) = generate(options.clone());
    let reflect = |cell: usize| cell / 9 * 9 + 8 - cell % 9;
    let mut equivalent = VariantPuzzle::classic(std::array::from_fn(|cell| {
        generated.puzzle.givens[reflect(cell)]
    }));
    equivalent.rules = vec![
        PuzzleRule::XSum {
            cells: (0..9).rev().collect(),
            direction: ClueDirection::West,
            sum: 25,
        },
        PuzzleRule::Inequality {
            less: 6,
            greater: 5,
        },
        PuzzleRule::Kropki {
            consecutive: MarkedPairs {
                pairs: vec![[6, 7]],
                negative: false,
            },
            ratio_two: MarkedPairs::default(),
        },
    ];
    assert_eq!(
        canonical_variant(&generated.puzzle),
        canonical_variant(&equivalent)
    );
    options.exclude.push(equivalent.clone());
    let mut search = start_variant_generation(options).unwrap();
    assert_eq!(
        search.advance(),
        Some(GenerationStep::Exhausted { attempts: 1 })
    );
    if let PuzzleRule::XSum { sum, .. } = &mut equivalent.rules[0] {
        *sum += 1;
    }
    assert_ne!(
        canonical_variant(&generated.puzzle),
        canonical_variant(&equivalent)
    );
}

#[test]
fn invalid_exhausted_and_cancelled_searches_are_distinct() {
    let mut options = VariantGenerationOptions::new(15, VariantPuzzle::x_sudoku(EMPTY), 80..=80);
    options.max_attempts = 3;
    options.max_nodes = 0;
    let mut search = start_variant_generation(options.clone()).unwrap();
    assert_eq!(
        search.advance(),
        Some(GenerationStep::Pending { attempts: 1 })
    );
    assert_eq!(
        search.cancel(),
        Some(GenerationStep::Cancelled { attempts: 1 })
    );
    assert_eq!(search.advance(), None);

    options.max_attempts = 1;
    let mut search = start_variant_generation(options.clone()).unwrap();
    assert_eq!(
        search.advance(),
        Some(GenerationStep::Exhausted { attempts: 1 })
    );
    options.required_rule = Some("whispers".to_string());
    assert!(matches!(
        start_variant_generation(options.clone()),
        Err(VariantGenerationError::MissingRequiredRule)
    ));
    options.required_rule = None;
    options.derived_clues = vec![VariantClueLayout::KillerCageSizes {
        sizes: vec![3; 28],
        cover_grid: true,
    }];
    assert!(matches!(
        start_variant_generation(options),
        Err(VariantGenerationError::InvalidLayout(0))
    ));
}

#[test]
fn paired_removals_respect_even_and_odd_exact_clue_counts() {
    let solution = parse_givens(SOLUTION).unwrap();
    for seed in [0, 39, 112] {
        for clues in [76, 77, 80, 81] {
            let mut options = VariantGenerationOptions::new(seed, jigsaw(solution), clues..=clues);
            options.max_attempts = 1;
            let mut search =
                sudoku_app_engine::start_variant_generation_with_symmetry(options, true).unwrap();
            let puzzle = std::iter::from_fn(|| search.advance())
                .find_map(|step| match step {
                    GenerationStep::Matched { puzzle, .. } => Some(puzzle),
                    _ => None,
                })
                .unwrap();
            assert_eq!(puzzle.givens, clues);
            let mask = puzzle.puzzle.givens.map(|d| d != 0);
            assert!(mask.iter().eq(mask.iter().rev()));
            assert_eq!(
                puzzle.puzzle.compile().unwrap().analyze(&EMPTY, &NO_REMOVALS, 10_000),
                Ok(Analysis::Unique)
            );
        }
    }
}
