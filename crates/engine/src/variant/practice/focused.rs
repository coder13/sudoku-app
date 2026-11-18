use super::{
    VariantPracticeError, VariantPracticeExercise, diagonal_intersection, examples, exercise_with,
    variant_practice_examples,
};
use crate::{
    CompiledVariant, Difficulty, HintAction, VariantPosition, VariantPuzzle, VariantTechnique,
    parse_givens,
};

const SINGLES: [VariantTechnique; 3] = [
    VariantTechnique::FullHouse,
    VariantTechnique::NakedSingle,
    VariantTechnique::HiddenSingle,
];

pub(crate) fn focused_practice_examples(
    technique: VariantTechnique,
) -> Result<Vec<VariantPracticeExercise>, VariantPracticeError> {
    if technique.difficulty() < Difficulty::Medium {
        return variant_practice_examples(technique);
    }
    if let Some(givens) = focused_givens(technique) {
        let originals = examples::examples(technique);
        return givens
            .into_iter()
            .enumerate()
            .map(|(index, (original, givens))| {
                let invalid = VariantPracticeError::InvalidPosition(index);
                let givens = parse_givens(givens).ok_or(invalid)?;
                let mut puzzle = VariantPuzzle::classic(givens);
                puzzle.rules = originals[original].rules.clone();
                let compiled = puzzle.compile().map_err(|_| invalid)?;
                exercise(&compiled, index, &VariantPosition::new(puzzle), technique, None)
            })
            .collect();
    }
    // Classic techniques also support the variant request, including Jigsaw overlay.
    let exercises: Vec<_> = variant_practice_examples(technique)?
        .into_iter()
        .enumerate()
        .filter_map(|(index, original)| {
            let compiled = original.position.puzzle.compile().ok()?;
            exercise(&compiled, index, &original.position, technique, None).ok()
        })
        .collect();
    if exercises.is_empty() {
        return Err(VariantPracticeError::MissingProof(0));
    }
    Ok(exercises)
}

pub(super) fn exercise(
    compiled: &CompiledVariant,
    index: usize,
    start: &VariantPosition,
    technique: VariantTechnique,
    suggestion: Option<HintAction>,
) -> Result<VariantPracticeExercise, VariantPracticeError> {
    let invalid = |_| VariantPracticeError::InvalidPosition(index);
    let position = if technique == VariantTechnique::LockedCandidates {
        // Clear ordinary box-line moves. Keep intersections that use the diagonal.
        let mut position = start.clone();
        loop {
            position = position
                .run_with_compiled(compiled, &SINGLES, |_| {})
                .map_err(invalid)?.0;
            let snapshot = compiled
                .proof_position(&position.entries, &position.eliminations)
                .map_err(|_| VariantPracticeError::InvalidPosition(index))?;
            let Some(step) = compiled
                .explain(&snapshot, VariantTechnique::LockedCandidates)
                .into_iter()
                .find(|proof| !diagonal_intersection(proof))
            else {
                break position;
            };
            position.record_actions(&step.actions);
        }
    } else {
        let order = [SINGLES[0], SINGLES[1], SINGLES[2], VariantTechnique::LockedCandidates];
        start.run_with_compiled(compiled, &order, |_| {}).map_err(invalid)?.0
    };
    exercise_with(compiled, index, &position, technique, suggestion)
}

// These grids reuse the rule shapes in examples.rs. Their givens leave at least
// 12 empty cells and a proven lesson move after the basic moves are applied.
fn focused_givens(technique: VariantTechnique) -> Option<[(usize, &'static str); 3]> {
    use VariantTechnique::*;
    Some(match technique {
        Quadruple => [
            (2, "483501600000340100000006004109007300000005720600403000026030910500600003300000207"),
            (2, "403501000007048100900700004100000000804005720070080000006004915501670083300100207"),
            (2, "403501070007348100005000004100007348834005700670483000026030915591600080300000207"),
        ],
        LockedCandidates => [
            (2, "070200698496700000050000000089000700000002000000000080300467820020000140900000070"),
            (1, "000000500004600000725000006000000108900048000000000050017500900462000300000104000"),
            (2, "070204098006000030000000400080300000030002004004000200000060800020000145048000006"),
        ],
        Skyscrapers => [
            (0, "006009850010574200290080700600010000070900000900256040020390000009000070001000030"),
            (1, "700103000300000800840007630030000418580401002000000096600370100123609005000000263"),
            (1, "760103000000000000040007630039000408580400002000000096600070100103609005000005260"),
        ],
        Sandwich => [
            (0, "002000010008604000040030027190008340020040705004290000080710006001400000900000001"),
            (2, "250090670000002930903000001002431007100000300500007006010250080000608003000709400"),
            (2, "250000670040002900903000001002431007100000300004007106010250080020648013080000402"),
        ],
        Whispers => [
            (1, "010005009709600100305092608000000500590080060002500004200010745050004300874050000"),
            (1, "010005009709600100305092608400000500590080060002500000200019745050004300074050910"),
            (1, "010005009709000100305002608000000500590000060102500004203010745050004300804050000"),
        ],
        Renban => [
            (2, "000501020000002050020046100100093075050400000009005630680009001310000062090010000"),
            (1, "761090800025008000008100540000803004580020003010400200090081400050049008006205300"),
            (2, "000501000400002050020746100108093005000400009009005630680000001310050962090000300"),
        ],
        RegionSum => [
            (2, "430796050060003910805001007600204080000009000050000640080000003020948000570302000"),
            (1, "108600000003000000420305870072080000004001067900000348800040600600058004009000785"),
            (0, "903070400002000001000040000605710230070006000020000760056007000090304050237600000"),
        ],
        LittleKiller => [
            (0, "900038002052000310038020950305286700700090000000740605003860009074900536069300000"),
            (1, "400600070027108900069700020006903002073020000100080703005869201008200507000000009"),
            (2, "007010300008000009210400657001605903000000006506000070700000201003047065680000034"),
        ],
        CageHouseSum => [
            (0, "497800500000920406002000190009400000070006004004730609080600902000314080045209061"),
            (0, "497800500008020406000007090060050007070006004004732019000605902926310080005200061"),
            (0, "497800500008920406002007090060400007070106004004730019000600900026310000045089061"),
        ],
        XSum => [
            (1, "085420030000057002207006548000200000700000000600105023526000309000093206000602401"),
            (1, "085420030000857002207016548000200000700000000600105023506700309000593206000002401"),
            (2, "400000590000009062009040000007008921003020854258490000080000040900254000300087005"),
        ],
        _ => return None,
    })
}
