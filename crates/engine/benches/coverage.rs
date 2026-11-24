use std::{collections::BTreeSet, hint::black_box, time::Instant};

use serde_json::{Value, json};
use sudoku_app_engine::{
    Board, ForcingBranch, HintAction, HintEvidence, SCORING_VERSION, SolveStatus, Technique,
    VerifiedTemplate, parse_givens, rate_puzzle, solve_logically, solve_position,
};

#[path = "coverage/rank.rs"]
mod rank;
#[path = "coverage/rank_effort.rs"]
mod rank_effort;
#[path = "fixtures/senior_exocet.rs"]
mod senior_exocet;

const RUNS: usize = 25;
const STARTER: &str =
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

const CORPUS: &[(&str, &[(&str, &str)])] = &[
    // Starter plus grids generated locally from seeds 3, 7, 19, 31, and 53.
    (
        "everyday",
        &[
            ("starter", STARTER),
            (
                "seed-3",
                "010700020602005007070049030451902370020300094030000160543000200000003009200400700",
            ),
            (
                "seed-7",
                "040005186000000309003800000005780004400056030200010065520100000008007610074628090",
            ),
            (
                "seed-19",
                "093021070020800036000300010730200104048107000102460000010780003500900700000510600",
            ),
            (
                "seed-31",
                "000006090009504200400093000170600009020008500904031080647089005200000040501060308",
            ),
            (
                "seed-53",
                "000080000700650049005004000903700016047500800600038000500071360376000081004360007",
            ),
        ],
    ),
    // Gordon Royle's 17-clue collection. See the 17-clue data set in Tdoku's benchmarks.
    (
        "17-clue",
        &[
            (
                "sparse-1",
                "345000000000200010000000000020100000000004500600000007800750000000060040000000300",
            ),
            (
                "sparse-2",
                "050040000000010040009000300100000080002005000000300000000700502480000000600000000",
            ),
            (
                "sparse-3",
                "000000021900040000800070000027600000000000930000000000050200000300000400000105000",
            ),
            (
                "sparse-4",
                "000000012008030000000000040120500000000004700060000000507000300000620000000100000",
            ),
            (
                "sparse-5",
                "500600020040000000000000000083000400090000100000200000700040001200000050000908000",
            ),
            (
                "sparse-6",
                "100000480007250000000300000000000025600004000000030000320000000000800100000000600",
            ),
        ],
    ),
    // Inkala's 2006 and 2012 puzzles, the Easter Monster, and two expert practice grids.
    (
        "expert",
        &[
            (
                "ai-escargot",
                "100007090030020008009600500005300900010080002600004000300000010041000007007000300",
            ),
            (
                "inkala-2012",
                "800000000003600000070090200050007000000045700000100030001000068008500010090000400",
            ),
            (
                "easter-monster",
                "100000002090400050006000700050903000000070000000850040700000600030009080002000001",
            ),
            (
                "junior-exocet",
                "007020004930000600600300000000000050200010008006900400003700900020050001000008000",
            ),
            (
                "multi-sector",
                "000000000001000803400090060000108200008000001500040000000000302090050070070000040",
            ),
        ],
    ),
];

// Published Sudoku Explainer examples from its advanced and nested forcing sections.
// https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#beyond-forcing-chains
const FORCING_EXAMPLES: &[(&str, &[(&str, &str)])] = &[
    (
        "advanced-forcing",
        &[
            (
                "advanced-forcing-1",
                "708000300000201000500000000040000026300080000000100090090600004000070500000000000",
            ),
            (
                "advanced-forcing-2",
                "700000400020070080003008009000500300060020090001007006000300900030040060009001035",
            ),
            (
                "advanced-forcing-3",
                "001000002030040000500600300007008001060010030100900800005009004080050070200100900",
            ),
            (
                "advanced-forcing-4",
                "001000200030040050600000007000103000080000030000604000200000006040050080007000100",
            ),
            (
                "advanced-forcing-5",
                "001000200030040050600000007000103000080070030000506000700000006050030080009000100",
            ),
            (
                "advanced-forcing-6",
                "000001002010020030400500000004000006070030010800000900500008000000010070006400500",
            ),
        ],
    ),
    (
        "nested-forcing",
        &[
            (
                "nested-forcing-1",
                "060900003500004020000080400800000050003000700090000001001050000070300009900002040",
            ),
            (
                "nested-forcing-2",
                "100007090030020008009600500005300900010080002600004000300000010040000007007000300",
            ),
            (
                "nested-forcing-3",
                "900001800060030000002500007009000006050000020400000300300008100000040080007900005",
            ),
            (
                "nested-forcing-4",
                "001002000030040050600700800006000007010000030900000600007001008040030020000500900",
            ),
            (
                "nested-forcing-5",
                "001002000030040050500600700007000006010000030800000900009003002020010040000700800",
            ),
        ],
    ),
];

fn digits(board: &Board) -> String {
    board
        .iter()
        .map(|&digit| char::from(b'0' + digit))
        .collect()
}

// The six examples with productive aligned deductions after basic logic stalls.
const ALIGNMENT_EXAMPLES: &[(&str, &[(&str, &str)])] = &[
    (
        "aligned-pair",
        &[
            (
                "aligned-pair-1",
                Technique::AlignedPairExclusion.practice_examples()[0].givens,
            ),
            (
                "aligned-pair-2",
                Technique::AlignedPairExclusion.practice_examples()[1].givens,
            ),
            (
                "aligned-pair-3",
                Technique::AlignedPairExclusion.practice_examples()[2].givens,
            ),
        ],
    ),
    (
        "aligned-triplet",
        &[
            (
                "aligned-triplet-1",
                Technique::AlignedTripletExclusion.practice_examples()[0].givens,
            ),
            (
                "aligned-triplet-2",
                Technique::AlignedTripletExclusion.practice_examples()[1].givens,
            ),
            (
                "aligned-triplet-3",
                Technique::AlignedTripletExclusion.practice_examples()[2].givens,
            ),
        ],
    ),
];

const SENIOR_EXOCET_EXAMPLES: &[(&str, &[(&str, &str)])] = &[(
    "senior-exocet",
    &[
        (
            "senior-exocet-1",
            Technique::SeniorExocet.practice_examples()[0].givens,
        ),
        (
            "senior-exocet-2",
            Technique::SeniorExocet.practice_examples()[1].givens,
        ),
        (
            "senior-exocet-3",
            "001000070390000800800100900009300700000042060200000004003700600000010050050006007",
        ),
        (
            "senior-exocet-grouped",
            Technique::SeniorExocet.practice_examples()[2].givens,
        ),
        ("senior-exocet-mixed", senior_exocet::MONHARD_MIXED_EXOCET),
    ],
)];

const DOUBLE_EXOCET_EXAMPLES: &[(&str, &[(&str, &str)])] = &[(
    "double-exocet",
    &[
        (
            "unsolvable-165",
            Technique::DoubleExocet.practice_examples()[0].givens,
        ),
        (
            "double-cover",
            Technique::DoubleExocet.practice_examples()[1].givens,
        ),
        (
            "monhard-11",
            Technique::DoubleExocet.practice_examples()[2].givens,
        ),
        (
            "unsolvable-28",
            "600008940900006100070040000200610000000000200089002000000060005000000030800001600",
        ),
    ],
)];

// The worked examples and seven exemplars on SudokuWiki's Fireworks page.
const FIREWORKS_EXAMPLES: &[(&str, &[(&str, &str)])] = &[(
    "fireworks",
    &[
        (
            "triple-laser",
            Technique::Fireworks.practice_examples()[0].givens,
        ),
        ("stuart", Technique::Fireworks.practice_examples()[1].givens),
        (
            "cobra-roll",
            Technique::Fireworks.practice_examples()[2].givens,
        ),
        (
            "exemplar-1",
            "609000015000050000030000080000007000207004600100800003000080034900020000400105070",
        ),
        (
            "exemplar-2",
            "000902300507600000600807005000300600070000010800010000400080000002000094905400000",
        ),
        (
            "exemplar-3",
            "000400300060907005080201000004000010000700000190005006000000803000006001740000060",
        ),
        (
            "exemplar-4",
            "100000400000010000098000006000420000700005300002086700900000005300002000470600000",
        ),
        (
            "exemplar-5",
            "500007038000908002070000150340100000000000800200060000003600009000009040706000000",
        ),
        (
            "exemplar-6",
            "001036850009005000000000000000050900600000023120900000000080004410000700036090010",
        ),
        (
            "exemplar-7",
            "004008007000060000500100028000400096000070080300000210100003470027000000050010000",
        ),
    ],
)];

const ALS_INFERENCE: [Technique; 3] = [
    Technique::AlsAic,
    Technique::AlsDiscontinuousNiceLoop,
    Technique::AlsContinuousNiceLoop,
];

const ALS_INFERENCE_EXAMPLES: &[(&str, &[(&str, &str)])] = &[
    (
        "als-aic",
        &[
            (
                "gaic1als01",
                Technique::AlsAic.practice_examples()[0].givens,
            ),
            (
                "hodoku-1335",
                Technique::AlsAic.practice_examples()[1].givens,
            ),
            (
                "hodoku-1343",
                Technique::AlsAic.practice_examples()[2].givens,
            ),
        ],
    ),
    (
        "als-discontinuous-nice-loop",
        &[
            (
                "gdnlals01",
                Technique::AlsDiscontinuousNiceLoop.practice_examples()[0].givens,
            ),
            (
                "hodoku-1287",
                Technique::AlsDiscontinuousNiceLoop.practice_examples()[1].givens,
            ),
            (
                "hodoku-1298",
                Technique::AlsDiscontinuousNiceLoop.practice_examples()[2].givens,
            ),
        ],
    ),
    (
        "als-continuous-nice-loop",
        &[
            (
                "gcnlals01",
                Technique::AlsContinuousNiceLoop.practice_examples()[0].givens,
            ),
            (
                "hodoku-1254",
                Technique::AlsContinuousNiceLoop.practice_examples()[1].givens,
            ),
            (
                "hodoku-1253",
                Technique::AlsContinuousNiceLoop.practice_examples()[2].givens,
            ),
        ],
    ),
];

const FIREWORK_AIC_EXAMPLES: &[(&str, &[(&str, &str)])] = &[(
    "firework-aic",
    &[
        (
            "pelagic-amber",
            Technique::FireworkAic.practice_examples()[0].givens,
        ),
        (
            "firework-ring-grid",
            Technique::FireworkAic.practice_examples()[1].givens,
        ),
        (
            "monhard-2201",
            Technique::FireworkAic.practice_examples()[2].givens,
        ),
    ],
)];

const FIREWORK_W_WING_EXAMPLES: &[(&str, &[(&str, &str)])] = &[(
    "firework-w-wing",
    &[
        (
            "published-w-wing",
            Technique::FireworkWWing.practice_examples()[0].givens,
        ),
        (
            "grouped-w-wing",
            Technique::FireworkWWing.practice_examples()[1].givens,
        ),
        (
            "two-digit-w-wing",
            Technique::FireworkWWing.practice_examples()[2].givens,
        ),
    ],
)];

const FIREWORK_L_ALS_EXAMPLES: &[(&str, &[(&str, &str)])] = &[
    (
        "firework-l-wing",
        &[
            (
                "published-l-wing",
                Technique::FireworkLWing.practice_examples()[0].givens,
            ),
            (
                "column-link-l-wing",
                Technique::FireworkLWing.practice_examples()[1].givens,
            ),
            (
                "row-link-l-wing",
                Technique::FireworkLWing.practice_examples()[2].givens,
            ),
        ],
    ),
    (
        "firework-als-wing",
        &[
            (
                "published-als-wing",
                Technique::FireworkAlsWing.practice_examples()[0].givens,
            ),
            (
                "same-band-als-wing",
                Technique::FireworkAlsWing.practice_examples()[1].givens,
            ),
            (
                "same-stack-als-wing",
                Technique::FireworkAlsWing.practice_examples()[2].givens,
            ),
        ],
    ),
];

const TRIDAGON_AIC_EXAMPLES: &[(&str, &[(&str, &str)])] = &[(
    "tridagon-aic",
    &[
        (
            "mission-impossible",
            Technique::TridagonAic.practice_examples()[0].givens,
        ),
        (
            "grouped-guardians",
            Technique::TridagonAic.practice_examples()[1].givens,
        ),
        (
            "firework-and-guardian",
            Technique::TridagonAic.practice_examples()[2].givens,
        ),
    ],
)];

fn main() {
    let args: Vec<_> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--rank-discovery") {
        rank::run();
        return;
    }
    if args.iter().any(|arg| arg == "--rank-effort") {
        rank_effort::run();
        return;
    }
    if args.iter().any(|arg| arg == "--rank-frontier") {
        rank_effort::frontier();
        return;
    }
    let nested = args.iter().any(|arg| arg == "--nested-forcing");
    let advanced = args.iter().any(|arg| arg == "--advanced-forcing");
    let dynamic = nested || advanced || args.iter().any(|arg| arg == "--dynamic-forcing");
    let forcing_examples = args.iter().any(|arg| arg == "--forcing-examples");
    let aligned_examples = args.iter().any(|arg| arg == "--aligned-examples");
    let aligned = args.iter().any(|arg| arg == "--aligned-exclusion");
    let als_inference = args.iter().any(|arg| arg == "--als-inference");
    let rectangle_inference = args.iter().any(|arg| arg == "--unique-rectangle-inference");
    let pattern_overlay = args.iter().any(|arg| arg == "--pattern-overlay");
    let als_inference_examples = args.iter().any(|arg| arg == "--als-inference-examples");
    let complex_fish = args.iter().any(|arg| arg == "--complex-fish");
    let kraken = args.iter().any(|arg| arg == "--kraken");
    let senior_exocet = args.iter().any(|arg| arg == "--senior-exocet");
    let senior_first = args.iter().any(|arg| arg == "--senior-exocet-first");
    let senior_examples = args.iter().any(|arg| arg == "--senior-exocet-examples");
    let double_exocet = args.iter().any(|arg| arg == "--double-exocet");
    let double_examples = args.iter().any(|arg| arg == "--double-exocet-examples");
    let fireworks = args.iter().any(|arg| arg == "--fireworks");
    let fireworks_examples = args.iter().any(|arg| arg == "--fireworks-examples");
    let firework_aic = args.iter().any(|arg| arg == "--firework-aic");
    let firework_aic_examples = args.iter().any(|arg| arg == "--firework-aic-examples");
    let firework_w_wing = args.iter().any(|arg| arg == "--firework-w-wing");
    let firework_w_wing_examples = args.iter().any(|arg| arg == "--firework-w-wing-examples");
    let firework_l_als_examples = args.iter().any(|arg| arg == "--firework-l-als-examples");
    let firework_l_wing = args.iter().any(|arg| arg == "--firework-l-wing");
    let firework_als_wing = args.iter().any(|arg| arg == "--firework-als-wing");
    let depth_three = args.iter().any(|arg| arg == "--depth-three");
    let tridagon = args.iter().any(|arg| arg == "--tridagon");
    let tridagon_aic = args.iter().any(|arg| arg == "--tridagon-aic");
    let tridagon_aic_examples = args.iter().any(|arg| arg == "--tridagon-aic-examples");
    let depth_puzzles: Vec<_> = if depth_three {
        include_str!("fixtures/te3-stalls-v10.jsonl")
            .lines()
            .map(|line| {
                let fixture: Value = serde_json::from_str(line).expect("valid depth-three fixture");
                (
                    format!("te3-{}", fixture["sourceLine"]),
                    fixture["givens"]
                        .as_str()
                        .expect("depth-three givens")
                        .to_owned(),
                )
            })
            .collect()
    } else {
        Vec::new()
    };
    let depth_refs: Vec<_> = depth_puzzles
        .iter()
        .map(|(label, givens)| (label.as_str(), givens.as_str()))
        .collect();
    let depth_corpus = [("depth-three", depth_refs.as_slice())];
    let corpus = if depth_three {
        &depth_corpus
    } else if aligned_examples {
        ALIGNMENT_EXAMPLES
    } else if forcing_examples {
        FORCING_EXAMPLES
    } else if double_examples {
        DOUBLE_EXOCET_EXAMPLES
    } else if fireworks_examples {
        FIREWORKS_EXAMPLES
    } else if als_inference_examples {
        ALS_INFERENCE_EXAMPLES
    } else if firework_aic_examples {
        FIREWORK_AIC_EXAMPLES
    } else if firework_w_wing_examples {
        FIREWORK_W_WING_EXAMPLES
    } else if firework_l_als_examples {
        FIREWORK_L_ALS_EXAMPLES
    } else if tridagon_aic_examples {
        TRIDAGON_AIC_EXAMPLES
    } else if senior_examples {
        SENIOR_EXOCET_EXAMPLES
    } else {
        CORPUS
    };
    let mut order = Technique::default_order().to_vec();
    let before_forcing = order
        .iter()
        .position(|&technique| technique == Technique::ForcingChain)
        .unwrap();
    if als_inference {
        order.splice(before_forcing..before_forcing, ALS_INFERENCE);
    }
    if rectangle_inference {
        order.splice(
            before_forcing..before_forcing,
            [
                Technique::UniqueRectangleAic,
                Technique::UniqueRectangleDiscontinuousNiceLoop,
                Technique::UniqueRectangleContinuousNiceLoop,
            ],
        );
    }
    if senior_exocet && !senior_first {
        order.insert(before_forcing, Technique::SeniorExocet);
    }
    if double_exocet {
        order.insert(before_forcing, Technique::DoubleExocet);
    }
    if complex_fish {
        order.splice(
            before_forcing..before_forcing,
            [Technique::FrankenFish, Technique::MutantFish],
        );
    }
    if tridagon {
        order.insert(before_forcing, Technique::Tridagon);
    }
    if aligned {
        let before_aic = order
            .iter()
            .position(|&technique| technique == Technique::Aic)
            .unwrap();
        order.splice(
            before_aic..before_aic,
            [
                Technique::AlignedPairExclusion,
                Technique::AlignedTripletExclusion,
            ],
        );
    }
    if kraken {
        order.extend([Technique::KrakenFish1, Technique::KrakenFish2]);
    }
    if dynamic {
        order.push(Technique::DynamicForcingNet);
    }
    if advanced {
        order.push(Technique::AdvancedForcingNet);
    }
    if tridagon {
        order.push(Technique::TridagonForcingNet);
    }
    if nested {
        order.push(Technique::NestedForcingNet);
    }
    if senior_first {
        order.insert(0, Technique::SeniorExocet);
    }
    if fireworks {
        let before_medusa = order
            .iter()
            .position(|&technique| technique == Technique::Medusa)
            .unwrap();
        order.insert(before_medusa, Technique::Fireworks);
    }
    if firework_aic {
        let before_forcing = order
            .iter()
            .position(|&technique| technique == Technique::ForcingChain)
            .unwrap();
        order.insert(before_forcing, Technique::FireworkAic);
    }
    if tridagon_aic {
        let before_forcing = order
            .iter()
            .position(|&technique| technique == Technique::ForcingChain)
            .unwrap();
        order.insert(before_forcing, Technique::TridagonAic);
    }
    if firework_w_wing {
        order.insert(0, Technique::FireworkWWing);
    }
    if firework_l_wing {
        order.insert(0, Technique::FireworkLWing);
    }
    if firework_als_wing {
        order.insert(0, Technique::FireworkAlsWing);
    }
    if pattern_overlay {
        let before_forcing = order
            .iter()
            .position(|&technique| technique == Technique::ForcingChain)
            .unwrap();
        order.splice(
            before_forcing..before_forcing,
            [
                Technique::PatternOverlay,
                Technique::PairwisePatternOverlay,
                Technique::TriplePatternOverlay,
                Technique::QuadruplePatternOverlay,
                Technique::QuintuplePatternOverlay,
            ],
        );
    }
    let label = if nested {
        "Default order plus Dynamic and Nested Forcing Nets"
    } else if dynamic {
        "Default order plus Dynamic Forcing Net"
    } else {
        "Default logical order"
    };
    eprintln!("{label}, scoring version {SCORING_VERSION}, {RUNS} timed ratings per grid");
    if aligned {
        eprintln!("Aligned Pair and Triplet Exclusion before AIC");
    }
    if complex_fish {
        eprintln!("Franken Fish and Mutant Fish before forcing");
    }
    if kraken {
        eprintln!("Kraken Fish Types 1 and 2 after the default profile");
    }
    if senior_first {
        eprintln!("Senior Exocet first");
    } else if senior_exocet {
        eprintln!("Senior Exocet before forcing");
    }
    if double_exocet {
        eprintln!("Double Exocet before forcing");
    }
    if fireworks {
        eprintln!("Fireworks before 3D Medusa");
    }
    if als_inference {
        eprintln!("ALS chains and Nice Loops before forcing");
    }
    if pattern_overlay {
        eprintln!("Pattern Overlay through five digits before forcing");
    }
    if rectangle_inference {
        eprintln!("Unique Rectangle chains and Nice Loops before forcing");
    }
    if firework_aic {
        eprintln!("Firework chains before forcing");
    }
    if firework_w_wing {
        eprintln!("Firework W-Wing first");
    }
    if firework_l_wing || firework_als_wing {
        eprintln!(
            "Enabled Firework L-Wing and ALS-Wing detectors run before the default techniques"
        );
    }
    if advanced {
        eprintln!("Advanced Forcing Net after Dynamic Forcing Net");
    }
    if tridagon {
        eprintln!("Tridagon before forcing and Tridagon Forcing Net after dynamic propagation");
    }
    if tridagon_aic {
        eprintln!("Tridagon chains before forcing");
    }
    let mut seen = BTreeSet::new();
    for &(group, puzzles) in corpus {
        let mut solved = 0;
        let mut timings = Vec::with_capacity(RUNS * puzzles.len());
        for &(name, givens) in puzzles {
            let board = parse_givens(givens).expect("valid coverage fixture");
            assert!(seen.insert(board), "{name}: duplicate fixture");
            let template =
                VerifiedTemplate::verify(board).unwrap_or_else(|error| panic!("{name}: {error:?}"));
            if group == "17-clue" {
                assert_eq!(
                    board.iter().filter(|&&digit| digit > 0).count(),
                    17,
                    "{name}"
                );
            }
            let trace = solve_logically(&board, &order).expect("trace for a unique grid");
            let rating = rate_puzzle(&board, &order).expect("rating for a unique grid");
            assert_eq!(rating.status, trace.status, "{name}");
            assert_eq!(rating.score, trace.score, "{name}");
            for action in trace.steps.iter().flat_map(|step| &step.actions) {
                let candidate = action.candidate();
                assert_eq!(
                    template.solution()[candidate.cell] == candidate.digit,
                    matches!(action, HintAction::Place(_)),
                    "{name}: {action:?}"
                );
            }
            for _ in 0..RUNS {
                let start = Instant::now();
                black_box(rate_puzzle(black_box(&board), &order)).expect("repeatable rating");
                timings.push(start.elapsed().as_secs_f64() * 1000.0);
            }
            if let Some(technique) = match group {
                "fireworks" => Some(Technique::Fireworks),
                "firework-aic" => Some(Technique::FireworkAic),
                "firework-w-wing" => Some(Technique::FireworkWWing),
                "firework-l-wing" => Some(Technique::FireworkLWing),
                "firework-als-wing" => Some(Technique::FireworkAlsWing),
                "tridagon-aic" => Some(Technique::TridagonAic),
                "als-aic" => Some(Technique::AlsAic),
                "als-discontinuous-nice-loop" => Some(Technique::AlsDiscontinuousNiceLoop),
                "als-continuous-nice-loop" => Some(Technique::AlsContinuousNiceLoop),
                _ => None,
            } {
                let count = trace.score.counts.get(&technique).copied().unwrap_or(0);
                eprintln!(
                    "{name}: {} steps, {} points, {count} {}",
                    trace.steps.len(),
                    trace.score.points,
                    technique.id(),
                );
            }
            if dynamic && (group == "expert" || forcing_examples) {
                let count = |technique| trace.score.counts.get(&technique).copied().unwrap_or(0);
                let proof_size: usize = trace
                    .steps
                    .iter()
                    .map(|step| match &step.evidence {
                        HintEvidence::Forcing { branches, .. } => {
                            branches.iter().map(ForcingBranch::proof_size).sum()
                        }
                        _ => 0,
                    })
                    .sum();
                eprintln!(
                    "{name}: {:?}, {} total steps, {} dynamic, {} advanced, {} nested, {proof_size} forcing proof facts",
                    rating.status,
                    trace.steps.len(),
                    count(Technique::DynamicForcingNet),
                    count(Technique::AdvancedForcingNet),
                    count(Technique::NestedForcingNet),
                );
            }
            if aligned_examples {
                let count = trace
                    .steps
                    .iter()
                    .filter(|step| {
                        matches!(
                            step.technique,
                            Technique::AlignedPairExclusion | Technique::AlignedTripletExclusion
                        )
                    })
                    .count();
                eprintln!(
                    "{name}: {:?}, {} points, {} total steps, {count} aligned exclusion steps",
                    rating.status,
                    rating.score.points,
                    trace.steps.len()
                );
            }
            if depth_three {
                let count = |technique| {
                    trace
                        .steps
                        .iter()
                        .filter(|step| step.technique == technique)
                        .count()
                };
                eprintln!(
                    "{name}: {:?}, {} total steps, {} Tridagons, {} Tridagon Forcing Nets",
                    rating.status,
                    trace.steps.len(),
                    count(Technique::Tridagon),
                    count(Technique::TridagonForcingNet)
                );
            }
            match rating.status {
                SolveStatus::Solved(_) => solved += 1,
                SolveStatus::Stalled => {
                    let end = trace.positions().last().expect("initial position");
                    assert_eq!(end.values(), Ok(trace.board), "{name}");
                    let replay = solve_position(&end, &order).expect("valid stalled position");
                    assert_eq!(replay.status, SolveStatus::Stalled, "{name}");
                    assert!(replay.steps.is_empty(), "{name}: still has a move");
                    println!(
                        "{}",
                        json!({
                            "name": name,
                            "group": group,
                            "givens": givens,
                            "entries": digits(&end.entries),
                            "eliminations": end.eliminations.as_slice(),
                            "steps": trace.steps.len(),
                            "partialScore": trace.score.points,
                            "scoringVersion": trace.scoring_version,
                            "techniqueOrder": trace.technique_order,
                        })
                    );
                }
            }
        }
        timings.sort_by(f64::total_cmp);
        let median = timings[(timings.len() - 1) / 2];
        let p95 = timings[(95 * timings.len()).div_ceil(100) - 1];
        let count = puzzles.len();
        eprintln!(
            "{group}: {solved}/{count} solved ({:.1}%); rating median {median:.3} ms, p95 {p95:.3} ms",
            solved as f64 / count as f64 * 100.0
        );
    }
}
