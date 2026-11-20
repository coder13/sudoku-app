use super::{ExampleSeed, seed};
use crate::{
    ClueDirection, Diagonal, KillerCage, MarkedPairs, Parity as CellParity, PuzzleRule,
    VariantPosition, VariantPuzzle, VariantTechnique, parse_givens,
};

// Published SudokuWiki Pattern Overlay Jigsaw example, shape 14. The packed
// position already crossed out 7 in r9c5, so the exercise restores it.
pub(super) fn pattern_overlay_jigsaw() -> VariantPosition {
    let givens = parse_givens(
        "090000000006000030059000810500010003010600070700060000001000356000000100000000020",
    )
    .unwrap();
    let puzzle = VariantPuzzle::jigsaw(
        givens,
        [
            [0, 9, 10, 19, 20, 29, 30, 39, 40],
            [1, 2, 3, 4, 5, 11, 12, 13, 21],
            [6, 7, 14, 15, 22, 23, 31, 32, 41],
            [8, 16, 17, 24, 25, 26, 33, 34, 42],
            [18, 27, 28, 36, 37, 38, 45, 46, 54],
            [35, 43, 44, 51, 52, 53, 61, 62, 71],
            [47, 48, 55, 56, 57, 63, 64, 65, 72],
            [49, 50, 59, 60, 69, 70, 78, 79, 80],
            [58, 66, 67, 68, 73, 74, 75, 76, 77],
        ]
        .map(|cells| cells.to_vec())
        .into(),
    );
    let entries = parse_givens(
        "000001000100000000600000000000000000000000000030000001000000000060000000000106000",
    )
    .unwrap();
    let mut eliminations = [0; crate::CELLS];
    for (cell, mask) in [
        (4, 4),
        (6, 18),
        (14, 64),
        (15, 18),
        (22, 4),
        (40, 2),
        (41, 256),
        (42, 256),
        (50, 16),
        (63, 256),
        (65, 16),
        (66, 256),
        (67, 4),
        (68, 404),
        (72, 256),
        (74, 80),
        (76, 16),
    ] {
        eliminations[cell] = mask;
    }
    VariantPosition {
        puzzle,
        entries,
        eliminations,
    }
}

// The three positions retain the source geometry from Coach puzzle BSms.
fn renban_group_seed(givens: &'static str, cell: usize, digit: u8) -> ExampleSeed {
    let lines: [&[usize]; 9] = [
        &[42, 52, 62, 70], &[15, 23, 33, 43], &[16, 6, 14, 22],
        &[11, 21, 31, 39], &[30, 38, 48, 58], &[67, 57, 47, 55],
        &[79, 69, 59, 51], &[54, 46, 36], &[74, 66, 76],
    ];
    seed(givens, cell, digit, lines.map(|cells| PuzzleRule::Renban {
        cells: cells.to_vec(), segments: None,
    }))
}

fn cage(sum: u16, cells: &[usize]) -> KillerCage {
    KillerCage {
        cells: cells.to_vec(),
        sum,
    }
}

// Authored and seeded variant exercises. Each suggested action
// is verified against the current detector and the unique completion.
pub(super) fn examples(technique: VariantTechnique) -> [ExampleSeed; 3] {
    use VariantTechnique::*;
    match technique {
        Quadruple => [
            seed(
                "403591602260008109000006030009207308034015700070080090720030915501070080340050060",
                47,
                5,
                [PuzzleRule::Quadruple {
                    top_left: 47,
                    digits: vec![2, 4, 6, 8],
                }],
            ),
            seed(
                "403001672260340109900020000100067008034900726602000090000004905590670483040050067",
                19,
                5,
                [PuzzleRule::Quadruple {
                    top_left: 19,
                    digits: vec![1, 5],
                }],
            ),
            seed(
                "403501002007348100000006004109007308804005720670483000026030910501600083300000207",
                21,
                2,
                [PuzzleRule::Quadruple {
                    top_left: 21,
                    digits: vec![2, 2, 6],
                }],
            ),
        ],
        Parity => [
            seed(
                "041000700000104200587062100078603000023057609900281004300700025792000000005029060",
                80,
                8,
                [PuzzleRule::Parity {
                    cells: vec![80],
                    parity: CellParity::Odd,
                }],
            ),
            seed(
                "000370000002000005805400639000080026000000007010200080027008001406090003001000860",
                16,
                1,
                [PuzzleRule::Parity {
                    cells: vec![16],
                    parity: CellParity::Even,
                }],
            ),
            seed(
                "890104072020800014000005900100050030080603149000000007210009700057280000340000000",
                61,
                5,
                [PuzzleRule::Parity {
                    cells: vec![61],
                    parity: CellParity::Even,
                }],
            ),
        ],
        AntiKing => [
            seed(
                "065000170908710063000269000609502310530001700007040090000300040400186937700050020",
                3,
                8,
                [PuzzleRule::AntiKing {}],
            ),
            seed(
                "401600500800003700359020080210890030043267005580000200605970000700300000000040300",
                12,
                1,
                [PuzzleRule::AntiKing {}],
            ),
            seed(
                "050010900200007630790030000400500000680000750507360004000000510830001009105490002",
                5,
                6,
                [PuzzleRule::AntiKing {}],
            ),
        ],
        AntiKnight => [
            seed(
                "400501006638007120012036940020000674096470800700010000100064009060000018007103060",
                13,
                9,
                [PuzzleRule::AntiKnight {}],
            ),
            seed(
                "600104790400090050200070108100000406060000070700068310500080004906000500047020931",
                10,
                1,
                [PuzzleRule::AntiKnight {}],
            ),
            seed(
                "500080960000000005040530020270008090050006840801740000426000510398005000000400600",
                13,
                9,
                [PuzzleRule::AntiKnight {}],
            ),
        ],
        NonConsecutive => [
            seed(
                "038520000502000410940137050690002580004000037007000102719080000000701849480200300",
                12,
                6,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "000000007794800010310000050030040002079280006800010070005360049947020300000974800",
                0,
                6,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "080000009100685700072900006724106000050470630300000000800501400001004003047000100",
                10,
                9,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
        ],
        NonConsecutiveLockedPair => [
            seed(
                "038520000502000410940137050690002580004000037007000102719080000000701849480200300",
                6,
                6,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "000000007794800010310000050030040002079280006800010070005360049947020300000974800",
                0,
                6,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "080000009100685700072900006724106000050470630300000000800501400001004003047000100",
                38,
                9,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
        ],
        NonConsecutiveLockedTriple => [
            seed(
                "038520000502000410940137050690002580004000037007000102719080000000701849480200300",
                49,
                5,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "000000007794800010310000050030040002079280006800010070005360049947020300000974800",
                14,
                3,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "080000009100685700072900006724106000050470630300000000800501400001004003047000100",
                4,
                1,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
        ],
        NonConsecutiveBivalue => [
            seed(
                "038520000502000410940137050690002580004000037007000102719080000000701849480200300",
                29,
                3,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "000000007794800010310000050030040002079280006800010070005360049947020300000974800",
                33,
                9,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "080000009100685700072900006724106000050470630300000000800501400001004003047000100",
                47,
                8,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
        ],
        NonConsecutiveTrivalue => [
            seed(
                "000000007794800010310000050030040002079280006800010070005360049947020300000974800",
                21,
                6,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "500000007794800010310000050030040002079280006800010070005360049947020300000974800",
                29,
                6,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
            seed(
                "000000007794800010316000050030040002079280006800010070005360049947020300000974800",
                73,
                2,
                [PuzzleRule::NonConsecutive { except: vec![] }],
            ),
        ],
        Clone => [
            seed(
                "802001005000002170500709300901020750000308916630000824140070680090810507008000030",
                11,
                3,
                [PuzzleRule::Clone {
                    groups: vec![vec![75, 11]],
                }],
            ),
            seed(
                "648297010000000427520000096006801900030000004014000700000500040280070059065009200",
                21,
                1,
                [PuzzleRule::Clone {
                    groups: vec![vec![1, 44, 21]],
                }],
            ),
            seed(
                "000080040500702398000043000903000000182006037070308020308021000056070000000000285",
                6,
                1,
                [PuzzleRule::Clone {
                    groups: vec![vec![67, 6, 20, 32]],
                }],
            ),
        ],
        Inequality => [
            seed(
                "000000100060400302027081900276003405095000820834502060003070200002136000709045600",
                53,
                1,
                [PuzzleRule::Inequality {
                    less: 44,
                    greater: 53,
                }],
            ),
            seed(
                "000000080680002903250081040805300607000500001700008500006000059008165000021094308",
                52,
                9,
                [PuzzleRule::Inequality {
                    less: 52,
                    greater: 61,
                }],
            ),
            seed(
                "030004001509802400700006052000000000300000100072495603057210000400000019900043005",
                65,
                8,
                [PuzzleRule::Inequality {
                    less: 65,
                    greater: 66,
                }],
            ),
        ],
        Palindrome => [
            seed(
                "831900206690000870200068300003295100000084603020100009050001062000009400040003500",
                60,
                7,
                [PuzzleRule::Palindrome {
                    cells: vec![53, 52, 60],
                    segments: None,
                }],
            ),
            seed(
                "900000001060902840005400030031004090678000000500028370300000405002080903850009012",
                57,
                1,
                [PuzzleRule::Palindrome {
                    cells: vec![49, 48, 58, 57],
                    segments: None,
                }],
            ),
            seed(
                "001009023029000007836000100010006000000004060600108705000080006000013078583060204",
                12,
                3,
                [PuzzleRule::Palindrome {
                    cells: vec![12, 21, 31, 40, 50],
                    segments: None,
                }],
            ),
        ],
        Thermometer => [
            seed(
                "001502370060003900382690005090300082608900001005078069209460003400000010003700094",
                23,
                1,
                [PuzzleRule::Thermometer {
                    cells: vec![33, 32, 23],
                }],
            ),
            seed(
                "002000567048050000007010000801607350004108970600005002006090020300072000000501080",
                28,
                2,
                [PuzzleRule::Thermometer {
                    cells: vec![31, 30, 20, 28],
                }],
            ),
            seed(
                "500000910002104350914030000300786000006002500000040806000279100051460000070050000",
                61,
                3,
                [
                    PuzzleRule::Thermometer {
                        cells: vec![78, 79, 69, 61, 70],
                    },
                    PuzzleRule::Parity {
                        cells: vec![70],
                        parity: CellParity::Odd,
                    },
                ],
            ),
        ],
        LockedCandidates => [
            seed(
                "500960002010387006003012478000000627020000384000008500000890043209740005064200710",
                32,
                3,
                [
                    PuzzleRule::Diagonal {
                        diagonal: Diagonal::Main,
                    },
                    PuzzleRule::Diagonal {
                        diagonal: Diagonal::Anti,
                    },
                ],
            ),
            seed(
                "000002501004605020725400006600000108951048000000006050017503900462000300500104000",
                31,
                9,
                [
                    PuzzleRule::Diagonal {
                        diagonal: Diagonal::Main,
                    },
                    PuzzleRule::Diagonal {
                        diagonal: Diagonal::Anti,
                    },
                ],
            ),
            seed(
                "070200698406000000052000400080040700031002000004000000300467820020000145948000076",
                32,
                3,
                [
                    PuzzleRule::Diagonal {
                        diagonal: Diagonal::Main,
                    },
                    PuzzleRule::Diagonal {
                        diagonal: Diagonal::Anti,
                    },
                ],
            ),
        ],
        Kropki => [
            seed(
                "000005706050000200000009835002910407048070003079063100007001028820000564360824070",
                60,
                9,
                [PuzzleRule::Kropki {
                    consecutive: MarkedPairs {
                        pairs: vec![[60, 61]],
                        negative: false,
                    },
                    ratio_two: MarkedPairs::default(),
                }],
            ),
            seed(
                "408100700000050008039000502003005001000000007800307604070509806000600329940032075",
                9,
                1,
                [PuzzleRule::Kropki {
                    consecutive: MarkedPairs::default(),
                    ratio_two: MarkedPairs {
                        pairs: vec![[0, 9]],
                        negative: false,
                    },
                }],
            ),
            seed(
                "200060000400017803009000000023098004700306580000000032950702001080041900100030070",
                12,
                5,
                [PuzzleRule::Kropki {
                    consecutive: MarkedPairs {
                        pairs: vec![[21, 22]],
                        negative: false,
                    },
                    ratio_two: MarkedPairs {
                        pairs: vec![[21, 12]],
                        negative: false,
                    },
                }],
            ),
        ],
        Xv => [
            seed(
                "136000280824170600070008001040900872710400000000007410060800093008010524457200000",
                63,
                9,
                [PuzzleRule::Xv {
                    five: MarkedPairs {
                        pairs: vec![[54, 63]],
                        negative: false,
                    },
                    ten: MarkedPairs::default(),
                }],
            ),
            seed(
                "900005600480016395005070000000123809200004050093000420001702908026400000700030000",
                18,
                1,
                [PuzzleRule::Xv {
                    five: MarkedPairs::default(),
                    ten: MarkedPairs {
                        pairs: vec![[18, 9]],
                        negative: false,
                    },
                }],
            ),
            seed(
                "070600020000020409029005603040053100005017300000408507000000006000082750001006208",
                2,
                3,
                [PuzzleRule::Xv {
                    five: MarkedPairs {
                        pairs: vec![[48, 57]],
                        negative: false,
                    },
                    ten: MarkedPairs {
                        pairs: vec![[3, 2]],
                        negative: false,
                    },
                }],
            ),
        ],
        AdjacentTotal => [
            seed(
                "974000820286930400030002009060100238390600000000003690040200017002090586653800000",
                63, 1,
                [PuzzleRule::AdjacentTotal { cells: [54, 63], sum: 15 }],
            ),
            seed(
                "100006700590027416006080000000234901300005060014000530002803109037500000800040000",
                18, 2,
                [PuzzleRule::AdjacentTotal { cells: [18, 9], sum: 12 }],
            ),
            seed(
                "080700030000030501031006704050064200006028400000509608000000007000093860002007309",
                2, 4,
                [PuzzleRule::AdjacentTotal { cells: [48, 57], sum: 7 },
                 PuzzleRule::AdjacentTotal { cells: [3, 2], sum: 12 }],
            ),
        ],
        WhispersHouseSupport => [
            seed(
                "431500762976002185258761394382157649795624813164903527617009258529876431843215976",
                4,
                8,
                [
                    PuzzleRule::Whispers { cells: vec![12, 4, 13], min_difference: 5 },
                    PuzzleRule::Whispers { cells: vec![57, 49], min_difference: 5 },
                ],
            ),
            seed(
                "431598762976432185258761090302157600795620010164983527617349250529876431843215976",
                35,
                8,
                [
                    PuzzleRule::Whispers { cells: vec![26, 35, 44], min_difference: 5 },
                ],
            ),
            seed(
                "031598762976432185258761394002157609705624013160980527617349258529876431840215976",
                37,
                8,
                [
                    PuzzleRule::Whispers { cells: vec![27, 37, 47], min_difference: 5 },
                ],
            ),
        ],
        Whispers => [
            seed(
                "000004180000000003340980072013070400082451097700063005800040729450090830100730000",
                10,
                2,
                [PuzzleRule::Whispers {
                    cells: vec![10, 20, 11],
                    min_difference: 5,
                }],
            ),
            seed(
                "010005009709600100305092608000000500590080060002500004200010745050004300874050000",
                4,
                4,
                [PuzzleRule::Whispers {
                    cells: vec![25, 15, 14, 4],
                    min_difference: 5,
                }],
            ),
            seed(
                "800000000000070006007005002070208061208004009030007040100000020723091080490082305",
                2,
                4,
                [PuzzleRule::Whispers {
                    cells: vec![21, 12, 3, 2, 1],
                    min_difference: 4,
                }],
            ),
        ],
        CageCombinations => [
            seed(
                "000800106001070040000401870098000657140760390005080020060298704410000500027510060",
                41,
                2,
                [PuzzleRule::KillerCages {
                    cages: vec![cage(8, &[41, 50])],
                    cover_grid: false,
                }],
            ),
            seed(
                "270005013516400008000900200800091604100703002000060070900026007600070820000000346",
                45,
                4,
                [PuzzleRule::KillerCages {
                    cages: vec![cage(12, &[27, 36, 45])],
                    cover_grid: false,
                }],
            ),
            seed(
                "700000038306800057000017904080730400040061080005020000000500070028106000560000801",
                58,
                4,
                [PuzzleRule::KillerCages {
                    cages: vec![cage(25, &[66, 67, 58, 59])],
                    cover_grid: false,
                }],
            ),
        ],
        Between => [
            seed(
                "700320006950061270060078150010640030003010040400000080004500710035006020097084360",
                42,
                9,
                [PuzzleRule::Between {
                    cells: vec![52, 42, 43],
                }],
            ),
            seed(
                "405000003036470802009800005340186000960000001050020476070060000600007208000043060",
                29,
                2,
                [PuzzleRule::Between {
                    cells: vec![46, 37, 29, 20],
                }],
            ),
            seed(
                "010030500000400070045820060000970000900203040268105000800512607026007000003080000",
                29,
                4,
                [PuzzleRule::Between {
                    cells: vec![46, 45, 37, 28, 29],
                }],
            ),
        ],
        Arrow => [
            seed(
                "000600410010300025008000306253846079400592600900030000000403760020960541800057000",
                5,
                5,
                [PuzzleRule::Arrow {
                    cells: vec![15, 7],
                    circle: 5,
                }],
            ),
            seed(
                "000000007200000061010000200100600083408002070006740050672581009540070608083004700",
                65,
                9,
                [PuzzleRule::Arrow {
                    cells: vec![64, 56, 65],
                    circle: 55,
                }],
            ),
            seed(
                "003601809080000001971028046000080070097210000008000000005000004000802300140563080",
                33,
                5,
                [
                    PuzzleRule::Arrow {
                        cells: vec![40, 41, 33],
                        circle: 50,
                    },
                    PuzzleRule::Parity {
                        cells: vec![33],
                        parity: CellParity::Odd,
                    },
                ],
            ),
        ],
        GlobalEntropy => [
            seed("000018290081900507000006800000800410060000000030005002200009074710000003090000000", 16, 4, [PuzzleRule::GlobalEntropy {}]),
            seed("020000004059002000400006002200590008580004961000000200040003000705040000000015000", 4, 3, [PuzzleRule::GlobalEntropy {}]),
            seed("304010000000020000050030400020046000000000000000350070005060040000070000000080506", 57, 1, [PuzzleRule::GlobalEntropy {}]),
        ],
        Entropic => [
            seed(
                "000678002000005040198000507009000020426850001700900800060507200280000030040006070",
                50,
                1,
                [PuzzleRule::Entropic {
                    cells: vec![41, 50],
                }],
            ),
            seed(
                "530600900000105008100302060050001020420053001010004800960000284007010000000200170",
                58,
                7,
                [PuzzleRule::Entropic {
                    cells: vec![58, 68, 77, 78],
                }],
            ),
            seed(
                "530600010000090040190342500000700000006803001000004050900030284207010605345000000",
                26,
                6,
                [
                    PuzzleRule::Entropic {
                        cells: vec![7, 16, 26, 34, 33],
                    },
                    PuzzleRule::Parity {
                        cells: vec![33],
                        parity: CellParity::Even,
                    },
                ],
            ),
        ],
        Modular => [
            seed(
                "500670912602000040090300500800001003020803790003004000001030000087000005045280000",
                33, 6,
                [PuzzleRule::Modular { cells: vec![33, 41] }],
            ),
            seed(
                "530000900000105008008000007859700400406800000703000806960507000007009630300206009",
                23, 4,
                [PuzzleRule::Modular { cells: vec![33, 23, 31, 32] }],
            ),
            seed(
                "004608012670100000090302507050060003000000790000000850901007204000009000005280179",
                13, 4,
                [PuzzleRule::Modular { cells: vec![14, 13, 22, 23, 31] },
                 PuzzleRule::Parity { cells: vec![31], parity: CellParity::Even }],
            ),
        ],
        Renban => [
            seed(
                "004027860000510070720040910583170609270009038906050100095000700000090406000000300",
                23,
                8,
                [PuzzleRule::Renban { cells: vec![23, 22, 12], segments: None }],
            ),
            seed(
                "761090002025008000008100540000803004500020000010400200090081400052049008806205300",
                56,
                3,
                [PuzzleRule::Renban { cells: vec![57, 56, 64, 72], segments: None }],
            ),
            seed(
                "000501020000002050020746100100093075050400000009005630680000001310000962090000300",
                13,
                3,
                [
                    PuzzleRule::Renban { cells: vec![23, 31, 21, 13, 3], segments: None },
                    PuzzleRule::Parity {
                        cells: vec![3],
                        parity: CellParity::Odd,
                    },
                ],
            ),
        ],
        LittleKiller => [
            seed(
                "900038002052000310038020950305286700700090000000740605003860009074900536069300000",
                42,
                1,
                [PuzzleRule::LittleKiller {
                    cells: vec![2, 12, 22, 32, 42, 52, 62],
                    direction: ClueDirection::SouthEast,
                    sum: 41,
                }],
            ),
            seed(
                "400600070027108900069700020006903002073020000100080703005869201008200507000000009",
                43,
                8,
                [PuzzleRule::LittleKiller {
                    cells: vec![75, 67, 59, 51, 43, 35],
                    direction: ClueDirection::NorthEast,
                    sum: 28,
                }],
            ),
            seed(
                "007010300008000009210400657001605903000000006506000070700000201003047065680000034",
                14,
                3,
                [PuzzleRule::LittleKiller {
                    cells: vec![4, 14, 24, 34, 44],
                    direction: ClueDirection::SouthEast,
                    sum: 23,
                }],
            ),
        ],
        LittleKillerHouseSupport => [
            seed(
                "910003506804100370700469000503006801100500700200001003009050124000000030000602007",
                76,
                8,
                [
                    PuzzleRule::LittleKiller {
                        cells: vec![36, 46, 56, 66, 76],
                        direction: ClueDirection::SouthEast,
                        sum: 30,
                    },
                ],
            ),
            seed(
                "040000301072000940900630200730000400085000600000920073100000890500406100824010760",
                14,
                8,
                [
                    PuzzleRule::LittleKiller {
                        cells: vec![44, 34, 24, 14, 4],
                        direction: ClueDirection::NorthWest,
                        sum: 23,
                    },
                ],
            ),
            seed(
                "601020000938000000002943100000680043083450700000097508060039001070000090009065070",
                68,
                2,
                [
                    PuzzleRule::LittleKiller {
                        cells: vec![76, 68, 60, 52, 44],
                        direction: ClueDirection::NorthEast,
                        sum: 28,
                    },
                ],
            ),
        ],
        RenbanSumRayHouses => [
            seed(
                "290000106560100820800276090029600000000090000030450000050004710746801930000700600",
                44,
                4,
                [
                    PuzzleRule::LittleKiller {
                        cells: vec![44, 34, 24, 14, 4],
                        direction: ClueDirection::NorthWest,
                        sum: 28,
                    },
                    PuzzleRule::Renban { cells: vec![14, 4], segments: None },
                ],
            ),
            seed(
                "000000268500020903030090400200009075380004102795802300050001000010900024809500000",
                4,
                4,
                [
                    PuzzleRule::LittleKiller {
                        cells: vec![4, 12, 20, 28, 36],
                        direction: ClueDirection::SouthWest,
                        sum: 16,
                    },
                    PuzzleRule::Renban { cells: vec![28, 36], segments: None },
                ],
            ),
            seed(
                "530600200070030000002005060010308400800000070603050802050400700020103540360009128",
                4,
                1,
                [
                    PuzzleRule::LittleKiller {
                        cells: vec![4, 14, 24, 34, 44],
                        direction: ClueDirection::SouthEast,
                        sum: 26,
                    },
                    PuzzleRule::Renban { cells: vec![14, 24], segments: None },
                ],
            ),
        ],
        RenbanLockedDigit => [
            seed(
                "080009030000007051539614000008421000274003510000000000010000004300040279040370085",
                45,
                6,
                [PuzzleRule::Renban { cells: vec![48, 49, 50, 51], segments: None }],
            ),
            seed(
                "000201809809050002020048000508002093040000000010067000000029406000600731056374020",
                2,
                3,
                [PuzzleRule::Renban { cells: vec![27, 36, 37, 38, 47], segments: None }],
            ),
            seed(
                "008205000000836001320410080450000600000001040196000832563000020001040703004600090",
                30,
                7,
                [PuzzleRule::Renban { cells: vec![32, 40, 48], segments: None }],
            ),
        ],
        RenbanGroupCounts => [
            renban_group_seed(
                "570060003001000000000000050305000040000053000200000905023080590050030010108000000",
                2,
                2,
            ),
            renban_group_seed(
                "500000003000000060400300058005920000090050000000000005703080500050000012100090000",
                5,
                6,
            ),
            renban_group_seed(
                "009801003030000700000079150005908040600053000084007005723106500950004800108090006",
                18,
                8,
            ),
        ],
        RenbanHouseSupport => [
            seed(
                "000800106001070040000401870098000657140760390005080020060298704410000500027510060",
                18,
                3,
                [PuzzleRule::Renban { cells: vec![20, 21, 22], segments: None }],
            ),
            seed(
                "408100700000050008039000502003005001000000007800307604070509806000600329940032075",
                9,
                1,
                [PuzzleRule::Renban { cells: vec![18, 27, 36, 45], segments: None }],
            ),
            seed(
                "008205000000836001320410080450000600000001040196000832563000020001040703004600090",
                31,
                9,
                [PuzzleRule::Renban { cells: vec![40, 49, 58, 67, 76], segments: None }],
            ),
        ],
        RenbanSum => [
            seed(
                "490081700000427068000900421300200094056009080800060010070000205001304806000000030",
                76,
                5,
                [
                    PuzzleRule::Renban {
                        cells: vec![36, 46, 56],
                        segments: None,
                    },
                    PuzzleRule::LittleKiller {
                        cells: vec![36, 46, 56, 66, 76],
                        direction: ClueDirection::SouthEast,
                        sum: 19,
                    },
                ],
            ),
            seed(
                "710900004004573802058000069207000000109820300030000900070081003500036000080090601",
                61,
                2,
                [
                    PuzzleRule::Renban {
                        cells: vec![77, 69],
                        segments: None,
                    },
                    PuzzleRule::LittleKiller {
                        cells: vec![77, 69, 61, 53],
                        direction: ClueDirection::NorthEast,
                        sum: 21,
                    },
                ],
            ),
            seed(
                "601080000070004500080000100090310870000070950820400600050001369712090080006008210",
                44,
                1,
                [
                    PuzzleRule::Renban {
                        cells: vec![68, 76],
                        segments: None,
                    },
                    PuzzleRule::LittleKiller {
                        cells: vec![44, 52, 60, 68, 76],
                        direction: ClueDirection::SouthWest,
                        sum: 17,
                    },
                ],
            ),
        ],
        RenbanSumHouse => [
            seed(
                "063907010097052608100300000004000070000001004200740061080570000051020309009000527",
                76,
                3,
                [
                    PuzzleRule::Renban { cells: vec![66, 56, 46], segments: None },
                    PuzzleRule::LittleKiller {
                        cells: vec![76, 66, 56, 46, 36],
                        direction: ClueDirection::NorthWest,
                        sum: 19,
                    },
                    PuzzleRule::Renban { cells: vec![76, 67, 77], segments: None },
                ],
            ),
            seed(
                "002600080001007009000080500024700805080042736007809200006008003040060001293400070",
                25,
                4,
                [
                    PuzzleRule::Renban { cells: vec![25, 35], segments: None },
                    PuzzleRule::LittleKiller {
                        cells: vec![5, 15, 25, 35],
                        direction: ClueDirection::SouthEast,
                        sum: 18,
                    },
                    PuzzleRule::Renban { cells: vec![15, 16, 24], segments: None },
                ],
            ),
            seed(
                "609800010810900070734251900950000000063020800207300000400103005086700401000000080",
                44,
                4,
                [
                    PuzzleRule::Renban { cells: vec![60, 52, 44], segments: None },
                    PuzzleRule::LittleKiller {
                        cells: vec![76, 68, 60, 52, 44],
                        direction: ClueDirection::NorthEast,
                        sum: 24,
                    },
                    PuzzleRule::Renban { cells: vec![52, 43], segments: None },
                ],
            ),
        ],
        RegionSum => [
            seed(
                "913070400002000071700040000605710234070006010100400760056807020890304050237600000",
                60,
                3,
                [PuzzleRule::RegionSum {
                    cells: vec![60, 69, 59],
                    group_by_region: false,
                    segments: None,
                }],
            ),
            seed(
                "100600900003000006420305870072080000004001067901000348810000600000058094209000780",
                8,
                5,
                [PuzzleRule::RegionSum {
                    cells: vec![35, 26, 16, 8],
                    group_by_region: false,
                    segments: None,
                }],
            ),
            seed(
                "430796050060003910805001007600204080000009000050000640080000003020948000570302000",
                54,
                1,
                [PuzzleRule::RegionSum {
                    cells: vec![54, 64, 56, 57, 66],
                    group_by_region: false,
                    segments: None,
                }],
            ),
        ],
        CageHouseSum => [
            seed(
                "497800500008920406002007090060050007070006004004730019000600902026310080045209061",
                27,
                2,
                [PuzzleRule::KillerCages {
                    cages: vec![
                        cage(12, &[36, 37, 38]),
                        cage(16, &[39, 40, 41]),
                        cage(13, &[42, 43]),
                    ],
                    cover_grid: false,
                }],
            ),
            seed(
                "709020500500000600060075038640010080000000100000030400097502010850000720214860095",
                8,
                4,
                [PuzzleRule::KillerCages {
                    cages: vec![cage(20, &[17, 26, 35, 44]), cage(24, &[53, 62, 71, 80])],
                    cover_grid: false,
                }],
            ),
            seed(
                "006089502500000060201000070705200089020090000060870100050000016010537004807001000",
                17,
                3,
                [PuzzleRule::KillerCages {
                    cages: vec![
                        cage(13, &[9, 10]),
                        cage(14, &[11, 12, 13]),
                        cage(17, &[14, 15, 16]),
                        cage(9, &[17, 26]),
                    ],
                    cover_grid: false,
                }],
            ),
        ],
        Sandwich => [
            seed(
                "602000010008604000040031027190008342020140705054090000080719056001450080900002001",
                1,
                7,
                [PuzzleRule::Sandwich {
                    cells: vec![0, 1, 2, 3, 4, 5, 6, 7, 8],
                    direction: ClueDirection::East,
                    sum: 20,
                }],
            ),
            seed(
                "009006248104980705000000019290600000500809032043000000000390050930000007408127000",
                0,
                7,
                [PuzzleRule::Sandwich {
                    cells: vec![72, 63, 54, 45, 36, 27, 18, 9, 0],
                    direction: ClueDirection::North,
                    sum: 28,
                }],
            ),
            seed(
                "250090670000002900903000001002431007170000300500007106010250080000608013000000402",
                38,
                4,
                [PuzzleRule::Sandwich {
                    cells: vec![44, 43, 42, 41, 40, 39, 38, 37, 36],
                    direction: ClueDirection::West,
                    sum: 31,
                }],
            ),
        ],
        XSum => [
            seed(
                "000300005074081000021500000000800564005026703067950000000704829003098601008165047",
                0,
                8,
                [PuzzleRule::XSum {
                    cells: vec![0, 1, 2, 3, 4, 5, 6, 7, 8],
                    direction: ClueDirection::East,
                    sum: 32,
                }],
            ),
            seed(
                "085420030000057002207006548000200000700000000600105023526000309000093206000602401",
                16,
                6,
                [PuzzleRule::XSum {
                    cells: vec![79, 70, 61, 52, 43, 34, 25, 16, 7],
                    direction: ClueDirection::North,
                    sum: 28,
                }],
            ),
            seed(
                "400000590000079062009040000007008921003020054258401000000000040900254000300087005",
                64,
                8,
                [PuzzleRule::XSum {
                    cells: vec![71, 70, 69, 68, 67, 66, 65, 64, 63],
                    direction: ClueDirection::West,
                    sum: 36,
                }],
            ),
        ],
        Skyscrapers => [
            seed(
                "006009850018574200290080700600410080070900620900256040020395000009000070001002938",
                72,
                7,
                [PuzzleRule::Skyscrapers {
                    cells: vec![72, 73, 74, 75, 76, 77, 78, 79, 80],
                    direction: ClueDirection::East,
                    count: 4,
                }],
            ),
            seed(
                "760103000000000800840007630039000418580401002000000096600070100123609005000000263",
                9,
                2,
                [PuzzleRule::Skyscrapers {
                    cells: vec![72, 63, 54, 45, 36, 27, 18, 9, 0],
                    direction: ClueDirection::North,
                    count: 1,
                }],
            ),
            seed(
                "018904700049000085037000000063000070800702306000630094070000000026000159300160000",
                24,
                2,
                [PuzzleRule::Skyscrapers {
                    cells: vec![26, 25, 24, 23, 22, 21, 20, 19, 18],
                    direction: ClueDirection::West,
                    count: 3,
                }],
            ),
        ],
        FullHouse | NakedSingle | HiddenSingle | Classic(_) => {
            unreachable!("these use the classic exercise library")
        }
    }
}
