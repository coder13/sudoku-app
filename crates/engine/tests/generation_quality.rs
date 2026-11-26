#![cfg(all(feature = "generation"))]

use sudoku_app_engine::{
    Analysis, Difficulty, accepts_difficulty, analyze, canonical_puzzle, impossible_templates,
    parse_givens,
};

#[test]
fn impossible_bank_has_distinct_canonical_unique_puzzles() {
    let bank = impossible_templates();
    assert_eq!(bank.len(), 768);
    let mut keys = std::collections::HashSet::new();
    for board in bank {
        assert_eq!(analyze(board), Analysis::Unique);
        assert_eq!(canonical_puzzle(board), *board);
        assert!(keys.insert(*board));
    }
}

#[test]
fn rejected_lower_tier_solutions_from_quality_audit() {
    let cases = [
        (
            Difficulty::Hard,
            "600100037009040006000086024002000000400600000730000100800307040070020600203000000",
        ),
        (
            Difficulty::Hard,
            "000000009027009000000103008070802090080600571003597002006941080900075030050000000",
        ),
        (
            Difficulty::VeryHard,
            "580000000000000098700069000100095000400000530870100000000004020900001006340000087",
        ),
        (
            Difficulty::VeryHard,
            "370000029000400000200000030908004000000050047000018000019020458000090071030001900",
        ),
        (
            Difficulty::VeryHard,
            "040030600600894007000006004489000050020050009507040000750300016300000972090000040",
        ),
        (
            Difficulty::VeryHard,
            "008000305160000978400007002000058007900000003000000896050402009000680200020005630",
        ),
        (
            Difficulty::VeryHard,
            "006000000039002008150006007080690400090180530601003700900070200503000074000031000",
        ),
        (
            Difficulty::VeryHard,
            "500020100700048000000009047006050008201006004857000000002070010000012406009003005",
        ),
        (
            Difficulty::VeryHard,
            "670004800000000100820050000160007409007000030000620005080000970005200000000010008",
        ),
        (
            Difficulty::VeryHard,
            "203400000500000600001000540080140070006509002700006000608700000400000087050080400",
        ),
        (
            Difficulty::Extreme,
            "800000400003056000010000003050003670000000031000801205680200000000039000200010000",
        ),
        (
            Difficulty::Extreme,
            "060400300000005809510000000050300004100800020608040000006000000340970000700600035",
        ),
        (
            Difficulty::Extreme,
            "500002000039000700206000090020960000007084200403000006302800000000039400014070030",
        ),
        (
            Difficulty::Extreme,
            "080900000057060048000002357015089000902100680004020000000000270006000090000000031",
        ),
        (
            Difficulty::Extreme,
            "003000091000000000700500400000080030500002009280900705000000000100040078409010060",
        ),
    ];
    for (level, text) in cases {
        assert!(
            !accepts_difficulty(&parse_givens(text).unwrap(), level),
            "{level:?}: {text}"
        );
    }
}

#[test]
fn medium_requires_repeated_varied_elimination_work() {
    // The second calibration puzzle still needs varied eliminations with direct moves enabled.
    assert!(accepts_difficulty(
        &parse_givens(
            "163700000002030409080000070098300000000040000015000040007001000200070398000080001"
        )
        .unwrap(),
        Difficulty::Medium
    ));
    // few, baseline sample index 3.
    assert_eq!(
        accepts_difficulty(
            &parse_givens(
                "043000006000009231009000000028400000030612050050000100000850000080000009004300000"
            )
            .unwrap(),
            Difficulty::Medium
        ),
        false
    );
    // one_stretch, baseline sample index 5.
    assert_eq!(
        accepts_difficulty(
            &parse_givens(
                "000008000000000906420009100800300040070000000003050000289000000600790000045100020"
            )
            .unwrap(),
            Difficulty::Medium
        ),
        false
    );
    // one_technique, baseline sample index 7.
    assert_eq!(
        accepts_difficulty(
            &parse_givens(
                "090000002030070910008006007800700000300514000000002056007000100002480000000000400"
            )
            .unwrap(),
            Difficulty::Medium
        ),
        false
    );
}
