#![cfg(all(feature = "variants"))]

use sudoku_app_engine::{
    Analysis, ClueDirection, Diagonal, KillerCage, MarkedPairs, Parity, PuzzleRule, VariantPuzzle,
    parse_givens,
};

const EMPTY: [u8; 81] = [0; 81];
const NO_REMOVALS: [u16; 81] = [0; 81];
const ALL_DIGITS: u16 = 0x1ff;
const SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const X_SOLUTION: &str =
    "658492731974316582132875694461523978387149256295768143849251367726934815513687429";
// Published solution to Mitchell Lee's Miracle Sudoku, MATH+ Advent Calendar 2020, challenge 22.
const MIRACLE_SOLUTION: &str =
    "483726159726159483159483726837261594261594837594837261372615948615948372948372615";

fn swap(grid: [u8; 81], [a, b]: [u8; 2]) -> [u8; 81] {
    grid.map(|digit| match digit {
        digit if digit == a => b,
        digit if digit == b => a,
        digit => digit,
    })
}

fn case(
    label: &str,
    puzzle: VariantPuzzle,
    solution: [u8; 81],
    alternative: [u8; 81],
    incompatible: [u8; 81],
) {
    assert_ne!(solution, alternative, "{label}");
    assert_ne!(solution, incompatible, "{label}");
    let classic = VariantPuzzle::classic(EMPTY).compile().unwrap();
    assert_eq!(
        classic.analyze(&incompatible, &NO_REMOVALS, 1),
        Ok(Analysis::Unique),
        "{label} must violate the added rule on a valid classic grid"
    );
    let compiled = puzzle.compile().unwrap();
    for witness in [solution, alternative] {
        assert_eq!(
            compiled.analyze(&witness, &NO_REMOVALS, 1),
            Ok(Analysis::Unique),
            "{label} completion"
        );
    }
    assert_eq!(
        compiled.analyze(&incompatible, &NO_REMOVALS, 1),
        Ok(Analysis::Conflict),
        "{label} fully placed conflict"
    );

    // The only available digits specify the incompatible grid. With no digits
    // placed, there is no direct conflict to report before searching.
    let impossible = incompatible.map(|digit| ALL_DIGITS & !(1 << (digit - 1)));
    assert_eq!(
        compiled.analyze(&EMPTY, &impossible, 100),
        Ok(Analysis::Unsolvable),
        "{label} impossible domains"
    );

    // Retain exactly the common placements and the two witness digits per
    // remaining cell. Both witnesses extend this position.
    let common = std::array::from_fn(|cell| {
        if solution[cell] == alternative[cell] {
            solution[cell]
        } else {
            0
        }
    });
    let removals = std::array::from_fn(|cell| {
        ALL_DIGITS & !((1 << (solution[cell] - 1)) | (1 << (alternative[cell] - 1)))
    });
    assert_eq!(
        compiled.analyze(&common, &removals, 10_000),
        Ok(Analysis::Multiple),
        "{label} alternate completions"
    );
}

#[test]
fn extra_houses_jigsaw_and_global_rules_distinguish_the_exact_outcomes() {
    let classic = parse_givens(SOLUTION).unwrap();
    let diagonal = parse_givens(X_SOLUTION).unwrap();
    let miracle = parse_givens(MIRACLE_SOLUTION).unwrap();
    let with_rule = |rule| {
        let mut puzzle = VariantPuzzle::classic(EMPTY);
        puzzle.rules.push(rule);
        puzzle
    };
    case(
        "diagonal",
        with_rule(PuzzleRule::Diagonal {
            diagonal: Diagonal::Main,
        }),
        diagonal,
        swap(diagonal, [1, 2]),
        classic,
    );
    case(
        "extra-house",
        with_rule(PuzzleRule::ExtraHouse {
            cells: (0..9).map(|i| i * 10).collect(),
        }),
        diagonal,
        swap(diagonal, [1, 2]),
        classic,
    );
    case(
        "anti-king",
        with_rule(PuzzleRule::AntiKing {}),
        miracle,
        swap(miracle, [1, 2]),
        classic,
    );
    case(
        "anti-knight",
        with_rule(PuzzleRule::AntiKnight {}),
        miracle,
        swap(miracle, [1, 2]),
        classic,
    );
    case(
        "non-consecutive",
        with_rule(PuzzleRule::NonConsecutive { except: vec![] }),
        miracle,
        miracle.map(|digit| 10 - digit),
        classic,
    );

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
    let mut incompatible = classic;
    for column in 0..9 {
        incompatible.swap(column, 18 + column);
    }
    case(
        "jigsaw",
        VariantPuzzle::jigsaw(EMPTY, regions),
        classic,
        swap(classic, [1, 2]),
        incompatible,
    );
    for rule in [
        PuzzleRule::Clone {
            groups: vec![vec![0, 40, 74]],
        },
        PuzzleRule::Palindrome {
            cells: vec![0, 37, 40],
            segments: None,
        },
    ] {
        let label = rule.id();
        case(
            label,
            with_rule(rule),
            classic,
            swap(classic, [1, 2]),
            incompatible,
        );
    }
}

#[test]
fn numeric_rules_distinguish_the_exact_outcomes() {
    let solution = parse_givens(SOLUTION).unwrap();
    let top: Vec<_> = (0..9).collect();
    let tests = [
        (
            PuzzleRule::Parity {
                cells: vec![0],
                parity: Parity::Odd,
            },
            [1, 2],
            [5, 4],
        ),
        (
            PuzzleRule::Inequality {
                less: 1,
                greater: 2,
            },
            [8, 9],
            [3, 4],
        ),
        (
            PuzzleRule::Kropki {
                consecutive: MarkedPairs {
                    pairs: vec![[1, 2]],
                    negative: false,
                },
                ratio_two: MarkedPairs::default(),
            },
            [8, 9],
            [4, 7],
        ),
        (
            PuzzleRule::Xv {
                five: MarkedPairs {
                    pairs: vec![[7, 16]],
                    negative: false,
                },
                ten: MarkedPairs::default(),
            },
            [8, 9],
            [1, 2],
        ),
        (
            PuzzleRule::Thermometer {
                cells: vec![1, 2, 3],
            },
            [8, 9],
            [3, 6],
        ),
        (
            PuzzleRule::Whispers {
                cells: vec![6, 7],
                min_difference: 5,
            },
            [2, 3],
            [1, 8],
        ),
        (
            PuzzleRule::Arrow {
                circle: 4,
                cells: vec![1, 2],
            },
            [1, 2],
            [7, 8],
        ),
        (
            PuzzleRule::Renban {
                cells: vec![1, 2, 0],
            },
            [8, 9],
            [5, 9],
        ),
        (
            PuzzleRule::Between {
                cells: vec![7, 2, 6],
            },
            [2, 3],
            [1, 7],
        ),
        (
            PuzzleRule::RegionSum {
                cells: vec![0, 1, 5],
                group_by_region: false,
            },
            [1, 2],
            [8, 9],
        ),
        (
            PuzzleRule::KillerCages {
                cages: vec![KillerCage {
                    cells: vec![0, 1],
                    sum: 8,
                }],
                cover_grid: false,
            },
            [7, 8],
            [5, 4],
        ),
        (
            PuzzleRule::Sandwich {
                cells: top.clone(),
                direction: ClueDirection::East,
                sum: 0,
            },
            [2, 3],
            [1, 5],
        ),
        (
            PuzzleRule::LittleKiller {
                cells: vec![4, 14, 24, 34, 44],
                direction: ClueDirection::SouthEast,
                sum: 20,
            },
            [3, 4],
            [7, 8],
        ),
        (
            PuzzleRule::XSum {
                cells: top.iter().rev().copied().collect(),
                direction: ClueDirection::West,
                sum: 3,
            },
            [3, 4],
            [2, 9],
        ),
        (
            PuzzleRule::Skyscrapers {
                cells: top,
                direction: ClueDirection::East,
                count: 5,
            },
            [3, 4],
            [5, 9],
        ),
    ];
    for (rule, alternate_swap, incompatible_swap) in tests {
        let label = rule.id();
        let mut puzzle = VariantPuzzle::classic(EMPTY);
        puzzle.rules.push(rule);
        case(
            label,
            puzzle,
            solution,
            swap(solution, alternate_swap),
            swap(solution, incompatible_swap),
        );
    }
}
