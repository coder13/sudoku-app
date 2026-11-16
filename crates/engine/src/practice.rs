use super::hints::{DeductionSearch, checked_position, digit_bit};
use super::{
    Analysis, CELLS, Candidate, Hint, HintAction, HintError, PositionSnapshot, Technique,
    parse_givens,
};

#[path = "practice/examples.rs"]
mod examples;

/// Find a proof of the submitted placement or removal using the requested technique.
/// A single action from a deduction with several effects is sufficient.
pub fn check_practice_move(
    snapshot: &PositionSnapshot,
    technique: Technique,
    action: HintAction,
) -> Result<Option<Hint>, HintError> {
    let board = snapshot.values().map_err(HintError::Puzzle)?;
    let position = checked_position(&board, snapshot.removals())?;
    let candidate = action.candidate();
    if !(1..=9).contains(&candidate.digit)
        || position
            .masks()
            .get(candidate.cell)
            .is_none_or(|mask| mask & digit_bit(candidate.digit) == 0)
    {
        return Ok(None);
    }
    let search = DeductionSearch::new(position.board(), position.masks());
    Ok(search
        .find(technique, |step| step.actions().contains(&action))
        .map(Hint::from))
}

/// A curated position and the expected actions for a technique.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PracticeExample {
    /// Original givens in grid-string format.
    pub givens: &'static str,
    /// Placed digits in grid-string format, when supplied.
    pub entries: Option<&'static str>,
    /// Proven candidate-removal masks to restore, when supplied.
    pub eliminations: Option<&'static [u16; CELLS]>,
    /// Complete action set of the fixture's reference deduction.
    pub expected_actions: &'static [HintAction],
}

impl PracticeExample {
    /// Parse the fixture into a snapshot for deduction search or practice checking.
    pub fn position(&self) -> Result<PositionSnapshot, Analysis> {
        let mut snapshot =
            PositionSnapshot::new(parse_givens(self.givens).ok_or(Analysis::Conflict)?);
        if let Some(entries) = self.entries {
            snapshot.entries = parse_givens(entries).ok_or(Analysis::Conflict)?;
        }
        if let Some(eliminations) = self.eliminations {
            snapshot.eliminations = *eliminations;
        }
        snapshot.values()?;
        Ok(snapshot)
    }
}

const FULL_HOUSE: &str =
    "093021070020800036000300010730200104048107000102460000010780003500900700000510600";
const PRACTICE_GRID: &str =
    "058400000094020000000100009216004030070615000080003400800790104009801372001502000";

const fn place(cell: usize, digit: u8) -> HintAction {
    HintAction::Place(Candidate { cell, digit })
}

const fn remove(cell: usize, digit: u8) -> HintAction {
    HintAction::Eliminate(Candidate { cell, digit })
}

const fn elimination_masks(eliminations: &[(usize, u8)]) -> [u16; CELLS] {
    let mut masks = [0; CELLS];
    let mut index = 0;
    while index < eliminations.len() {
        let (cell, digit) = eliminations[index];
        masks[cell] |= 1 << (digit - 1);
        index += 1;
    }
    masks
}

// These positions and expected eliminations come from HoDoKu's regression library.
// https://hodoku.sourceforge.net/libraries/reglib-1.3.txt
const LOCKED_PAIR: PracticeExample = PracticeExample {
    givens: "970500060000007103800040000000080900685000000100003002000000000000600057008090200",
    entries: None,
    eliminations: None,
    expected_actions: &[remove(2, 4), remove(5, 8), remove(16, 4), remove(16, 8)],
};

const LOCKED_TRIPLE: PracticeExample = PracticeExample {
    givens: "000004025901003740000000000600070490000930510008000000003000102400702000000000000",
    entries: Some(
        "007000000000000000000007001005200000000000000090000200000009000006000009009300004",
    ),
    eliminations: None,
    expected_actions: &[remove(44, 7), remove(45, 7)],
};

const NAKED_TRIPLE: PracticeExample = PracticeExample {
    givens: "501003700000078600000000058600900500005080100008005006190000000007420000004600807",
    entries: Some(
        "080260049009500000700194000073012084000006000010040000000807400800000000000000000",
    ),
    eliminations: None,
    expected_actions: &[remove(79, 2), remove(79, 3)],
};

const NAKED_QUADRUPLE: PracticeExample = PracticeExample {
    givens: "000700000000600704000093008040000356635000807010000009000000000200549000501070080",
    entries: Some(
        "000000000000000000000400000902007000000924010000365240000030000083000671090206403",
    ),
    eliminations: None,
    expected_actions: &[remove(2, 6), remove(18, 7)],
};

const HIDDEN_TRIPLE: PracticeExample = PracticeExample {
    givens: "400008305000060104007000060970001400500090001008500093090000500802030000306700008",
    entries: Some(
        "069170020285000070130050809003000050024000080610000000701000030040005017050010040",
    ),
    eliminations: None,
    expected_actions: &[remove(30, 6), remove(57, 6)],
};

const HIDDEN_QUADRUPLE: PracticeExample = PracticeExample {
    givens: "800570290390000000000200000001000508000496000000800000209000001008000070560000082",
    entries: Some(
        "016003004002000000457009006940000060785000123623000040070000000130000000004000000",
    ),
    eliminations: Some(&elimination_masks(&[(50, 7), (60, 3), (69, 9)])),
    expected_actions: &[remove(58, 3), remove(58, 6), remove(67, 6)],
};

const SKYSCRAPER: PracticeExample = PracticeExample {
    givens: "001000009080900032002173000020000000000000270014800600000090000000050063190007000",
    entries: Some(
        "000028750007005100950000486000700340000500000700032095000000817078001900000080524",
    ),
    eliminations: None,
    expected_actions: &[remove(3, 4)],
};

const TWO_STRING_KITE: PracticeExample = PracticeExample {
    givens: "056070900040620080280000000000080000730000618005000020000000000070500049000048701",
    entries: Some(
        "100804032007000105000000476000000590000000000800000300000000003000000000000000000",
    ),
    eliminations: None,
    expected_actions: &[remove(63, 3)],
};

const EMPTY_RECTANGLE: PracticeExample = PracticeExample {
    givens: "700056038108420000000000000500300000040080700001000240003000000000100005050007060",
    entries: Some(
        "024900100060003597935718624000000810000001050080070000010000072000000080000000001",
    ),
    eliminations: None,
    expected_actions: &[remove(68, 9)],
};

const XY_WING: PracticeExample = PracticeExample {
    givens: "000000570000400000009007000400700800076503040000000002600300000537068000010002600",
    entries: Some(
        "008200000705000008000850000051029063200080901983614750092045187000100000804970035",
    ),
    eliminations: None,
    expected_actions: &[remove(24, 3)],
};

const XYZ_WING: PracticeExample = PracticeExample {
    givens: "900030000003000005080000016501703200000004000000100690800049072000210000400000050",
    entries: Some(
        "005001720100000900200000300090060000600000531300000007036500100759008463012376809",
    ),
    eliminations: None,
    expected_actions: &[remove(49, 8)],
};

const W_WING: PracticeExample = PracticeExample {
    givens: "908000000060000004000008920040003000680000401001000006800200040090305700000804190",
    entries: Some(
        "000040603003900000154630007005160009009000030300489000017096305402010068536070002",
    ),
    eliminations: None,
    expected_actions: &[remove(7, 5)],
};

const SWORDFISH: PracticeExample = PracticeExample {
    givens: "609130000000000010004000507400800079802000000000000060000003008200001903000429600",
    entries: Some(
        "000000482028000306000268090000010200000000130000302800941650720000780040080000051",
    ),
    eliminations: None,
    expected_actions: &[
        remove(14, 5),
        remove(37, 5),
        remove(41, 5),
        remove(46, 5),
        remove(47, 5),
    ],
};

const JELLYFISH: PracticeExample = PracticeExample {
    givens: "200000003080030050003402100001205400000090000009308600002506900090020070400000001",
    entries: None,
    eliminations: None,
    expected_actions: &[
        remove(1, 7),
        remove(4, 7),
        remove(9, 7),
        remove(17, 7),
        remove(36, 7),
        remove(37, 7),
        remove(44, 7),
        remove(73, 7),
        remove(76, 7),
    ],
};

const FINNED_X_WING: PracticeExample = PracticeExample {
    givens: "090500300562018000000000000189000600070000001000083400000200009904005000000001260",
    entries: Some(
        "001000000000300974340000100000000030403000000256100097610037040020860713030000000",
    ),
    eliminations: None,
    expected_actions: &[remove(7, 8)],
};

const FINNED_SWORDFISH: PracticeExample = PracticeExample {
    givens: "000400003000080000800000914703029000000000020006000340600050001400000700580631000",
    entries: Some(
        "060017080314900070070063000040000008008346007000070009000704830031090000007000492",
    ),
    eliminations: None,
    expected_actions: &[remove(42, 5)],
};

const FINNED_JELLYFISH: PracticeExample = PracticeExample {
    givens: "002018000000000000004000970658000000000009000000000051035400108200083006400900000",
    entries: Some(
        "000000060060094810810005000000100009100050080009800000000000000001500000086001000",
    ),
    eliminations: Some(&elimination_masks(&[
        (37, 7),
        (39, 7),
        (44, 2),
        (46, 7),
        (80, 2),
    ])),
    expected_actions: &[remove(69, 7)],
};

const SASHIMI_X_WING: PracticeExample = PracticeExample {
    givens: "000000000000054830300008260005789002070200500600000000056010000020000054700040000",
    entries: Some(
        "500020400200000000040000005130000640004061003002435000400000000000000000000500006",
    ),
    eliminations: None,
    expected_actions: &[remove(63, 8)],
};

const SASHIMI_SWORDFISH: PracticeExample = PracticeExample {
    givens: "201050000000000059095640800029465000000000000000278190008029470950000000000080906",
    entries: Some(
        "080900640400800000000000001100000080847090562500000004600000005004706008002504000",
    ),
    eliminations: Some(&elimination_masks(&[(10, 3)])),
    expected_actions: &[remove(23, 3)],
};

const SASHIMI_JELLYFISH: PracticeExample = PracticeExample {
    givens: "000406000200000004100000036046300500001840000007020010005030041000000000000507320",
    entries: Some(
        "003010200060003100004000000000071002020000000000600400000000000002104000410060000",
    ),
    eliminations: Some(&elimination_masks(&[(23, 5), (23, 9), (59, 9)])),
    expected_actions: &[remove(54, 8), remove(55, 8), remove(63, 8), remove(64, 8)],
};

const SIMPLE_COLORING: PracticeExample = PracticeExample {
    givens: "004503020000087005000140000103409000800000000006000000000000091705068200000050807",
    entries: Some(
        "670090108001000040580000070050000080007000000000800000068704500010900034000001060",
    ),
    eliminations: Some(&elimination_masks(&[(15, 3), (42, 6), (44, 6)])),
    expected_actions: &[remove(75, 2)],
};

const X_CHAIN: PracticeExample = PracticeExample {
    givens: "304020080006000000050070300000680020000034000060150700010000000009000060008217005",
    entries: Some(
        "000500000000090000000000000000009003000700000003002000000960000000040000600000000",
    ),
    eliminations: None,
    expected_actions: &[remove(28, 7)],
};

const XY_CHAIN: PracticeExample = PracticeExample {
    givens: "400050981530000000060100053058020040000403000700800000000009000020000000010000068",
    entries: Some(
        "072306000001008020809002000100007300296010875043005000080000000000081000900034000",
    ),
    eliminations: None,
    expected_actions: &[remove(58, 6)],
};

// SudokuWiki, 3D Medusa Rule 3.
const MEDUSA: PracticeExample = PracticeExample {
    givens: "290000030000020070000109402800760200600000007009045008903407000060030000050000084",
    entries: Some(
        "000000800000000900000000000045001093000000540000000000000000000000000709000000300",
    ),
    eliminations: Some(&elimination_masks(&[
        (8, 6),
        (9, 3),
        (10, 3),
        (45, 1),
        (46, 1),
        (61, 1),
        (61, 6),
        (62, 1),
    ])),
    expected_actions: &[remove(19, 8)],
};

const AIC: PracticeExample = PracticeExample {
    givens: "963010000070300000000002700709060000000000500030000090000030002500086003000071846",
    entries: Some(
        "000000000200000000000600030000000300000003000000000000687000150000200970392500000",
    ),
    eliminations: None,
    expected_actions: &[remove(7, 2), remove(51, 2)],
};

const CONTINUOUS_NICE_LOOP: PracticeExample = PracticeExample {
    givens: "002800000700000030400305006800400067071500000006000009000049000007000605200000070",
    entries: Some(
        "000000000000900000000000000020000000000000000040000000000700000000000040004650900",
    ),
    eliminations: None,
    expected_actions: &[remove(7, 1), remove(19, 9), remove(29, 3), remove(51, 5)],
};

const DISCONTINUOUS_NICE_LOOP: PracticeExample = PracticeExample {
    givens: "000080200005000040020005000000007000000210097104000030000000000097300520008051360",
    entries: Some(
        "000000000000000000000000000962830000003004600070500802001000000600048001240700009",
    ),
    eliminations: None,
    expected_actions: &[remove(7, 7)],
};

const GROUPED_AIC: PracticeExample = PracticeExample {
    givens: "000002501860000000002001068009000070040050000000400000400760200050010080010000000",
    entries: Some(
        "004680000001500042500040700000000405000000000005000000000005010000000000000000050",
    ),
    eliminations: Some(&elimination_masks(&[
        (27, 2),
        (36, 2),
        (42, 3),
        (42, 6),
        (42, 9),
        (45, 2),
        (51, 3),
        (51, 6),
        (51, 9),
        (71, 3),
        (71, 6),
        (71, 9),
        (74, 8),
        (80, 3),
        (80, 6),
        (80, 9),
    ])),
    expected_actions: &[remove(0, 3), remove(1, 3)],
};

const GROUPED_CONTINUOUS_NICE_LOOP: PracticeExample = PracticeExample {
    givens: "000030940600000070000600100009500002002073095150042000000050000043000800000000260",
    entries: Some(
        "000000006000000500000000020000000410480100600006900387060000730000000050000300000",
    ),
    eliminations: Some(&elimination_masks(&[(0, 2)])),
    expected_actions: &[
        remove(10, 1),
        remove(10, 2),
        remove(18, 8),
        remove(20, 8),
        remove(23, 8),
        remove(23, 9),
    ],
};

const GROUPED_DISCONTINUOUS_NICE_LOOP: PracticeExample = PracticeExample {
    givens: "302000010000970000000000000500080600001500070080040000900001027010400000005007900",
    entries: Some(
        "000000000100000000000010000000100000000000000000700100000000000000000000000000001",
    ),
    eliminations: None,
    expected_actions: &[remove(26, 2)],
};

const UNIQUE_RECTANGLE_1: PracticeExample = PracticeExample {
    givens: "035040000000320080009601040000000067807030000000900000002006801004090006000200034",
    entries: Some(
        "100708600746009105280050703900080000060000000400067008390470050510803270678015900",
    ),
    eliminations: None,
    expected_actions: &[remove(43, 2), remove(43, 9)],
};

const UNIQUE_RECTANGLE_2: PracticeExample = PracticeExample {
    givens: "000000007009400000003256400000305010000000000250900000004000008020009570980602001",
    entries: Some(
        "042190600060007120710000089490000002130720900000000000670500290301840006005070340",
    ),
    eliminations: None,
    expected_actions: &[remove(38, 6)],
};

const UNIQUE_RECTANGLE_3: PracticeExample = PracticeExample {
    givens: "050038007000700050000140002008000420107000009230000001500080000300000960070400000",
    entries: Some(
        "902600140400000006700005090690000000040000000005004000000000004004000008800000000",
    ),
    eliminations: Some(&elimination_masks(&[
        (31, 5),
        (32, 3),
        (42, 3),
        (42, 8),
        (49, 7),
        (51, 8),
        (59, 7),
        (60, 3),
        (76, 5),
        (78, 3),
    ])),
    expected_actions: &[
        remove(57, 2),
        remove(59, 2),
        remove(64, 2),
        remove(76, 2),
        remove(77, 2),
    ],
};

const UNIQUE_RECTANGLE_4: PracticeExample = PracticeExample {
    givens: "000760090006030401000080030000000000000470002235100040493026000820000003000000000",
    entries: Some(
        "300000008080005000000000000000652309000003000000098000000800000001547960007319004",
    ),
    eliminations: Some(&elimination_masks(&[(34, 7), (42, 6), (78, 5), (79, 5)])),
    expected_actions: &[remove(24, 7), remove(26, 7)],
};

const UNIQUE_RECTANGLE_5: PracticeExample = PracticeExample {
    givens: "000004705002037000000020068050000403810009000000046100000010504900000000080000006",
    entries: Some(
        "008000020560800941000005300609281070004370652000500089000008000000002807000003200",
    ),
    eliminations: Some(&elimination_masks(&[(45, 3)])),
    expected_actions: &[remove(64, 3)],
};

const UNIQUE_RECTANGLE_6: PracticeExample = PracticeExample {
    givens: "039500008500000002000020400041905000900070030000008570008006700000000000190000000",
    entries: Some(
        "200047610074861390816309057700030006085602104000410009000090000000003900000004060",
    ),
    eliminations: None,
    expected_actions: &[remove(66, 7), remove(74, 7)],
};

const HIDDEN_RECTANGLE: PracticeExample = PracticeExample {
    givens: "008400000536008100000300002004000056900642007160000400400003000005200768000001300",
    entries: Some(
        "290010000000020000741050080800130000053000810000005000000060001310094000600000000",
    ),
    eliminations: Some(&elimination_masks(&[(60, 9)])),
    expected_actions: &[remove(79, 9)],
};

const BUG_PLUS_ONE: PracticeExample = PracticeExample {
    givens: "320006480068401235045823690854267913030185742217004568470002859082009374593748126",
    entries: None,
    eliminations: None,
    expected_actions: &[place(4, 9)],
};

// WXYZ-Wing and Forcing Chain positions are from SudokuWiki's worked examples.
const WXYZ_WING: PracticeExample = PracticeExample {
    givens: "000004700500370060230000004700030840000401000084060003300000059070093002006200000",
    entries: Some(
        "000020030040000200007000000000000000003080000000000000000000000000000000000000300",
    ),
    eliminations: Some(&elimination_masks(&[
        (3, 6),
        (21, 9),
        (23, 9),
        (42, 6),
        (52, 7),
        (52, 9),
        (60, 1),
        (66, 1),
        (69, 1),
        (77, 7),
    ])),
    expected_actions: &[remove(28, 9)],
};

// Triple Laser by Qinlux, published in SudokuWiki's Fireworks examples.
const FIREWORKS: PracticeExample = PracticeExample {
    givens: "045000000000100070800023000000907100000000300080406020003000005070800006000000900",
    entries: None,
    eliminations: None,
    expected_actions: &[
        remove(0, 6),
        remove(0, 7),
        remove(0, 9),
        remove(8, 8),
        remove(8, 9),
        remove(15, 2),
        remove(25, 1),
        remove(80, 4),
        remove(80, 7),
        remove(80, 8),
    ],
};

// Published Sudoku Explainer puzzles, advanced to a position with an aligned exclusion.
const ALIGNED_PAIR_EXCLUSION: PracticeExample = PracticeExample {
    givens: "009040300670030094000806000400050002050903010090000060000020000500401009030000020",
    entries: Some(
        "000000006000000000340090000013600900206000400000214503000300040000000030004000000",
    ),
    eliminations: Some(&elimination_masks(&[(7, 7), (26, 5)])),
    expected_actions: &[remove(3, 5)],
};

const ALIGNED_TRIPLET_EXCLUSION: PracticeExample = PracticeExample {
    givens: "000000900001200870009300051690020000480001000030000260000000610050134000000097000",
    entries: Some(
        "000010000000009000020006400000003100002060000100000000000002000006000700010600000",
    ),
    eliminations: Some(&elimination_masks(&[
        (0, 2),
        (1, 2),
        (2, 5),
        (2, 7),
        (54, 8),
        (56, 7),
        (56, 8),
        (62, 5),
        (62, 8),
        (72, 3),
    ])),
    expected_actions: &[remove(3, 4)],
};

// Philip Newman's depth-three collection, line 1.
const TRIDAGON: PracticeExample = PracticeExample {
    givens: "103056000057109000690370000001093007509607300000510000000960000000000400005000860",
    entries: Some(
        "000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    ),
    eliminations: Some(&elimination_masks(&[
        (7, 4),
        (16, 4),
        (16, 8),
        (28, 2),
        (28, 8),
        (45, 2),
        (45, 4),
        (45, 8),
        (46, 2),
        (46, 4),
        (46, 6),
        (46, 8),
        (53, 4),
        (65, 8),
    ])),
    expected_actions: &[place(47, 6)],
};

// Philip Newman's depth-three collection, line 75697.
const TRIDAGON_FORCING_NET: PracticeExample = PracticeExample {
    givens: "103006000057000000680003000000000350305010807870530001000948170708000000000020600",
    entries: Some(
        "000000000000000036000000010000000000000600000000000060000000000000060000000000000",
    ),
    eliminations: Some(&elimination_masks(&[
        (3, 8),
        (4, 8),
        (6, 2),
        (6, 4),
        (6, 9),
        (8, 2),
        (8, 4),
        (8, 5),
        (14, 2),
        (14, 4),
        (16, 1),
        (16, 2),
        (16, 4),
        (16, 8),
        (16, 9),
        (17, 2),
        (17, 3),
        (17, 4),
        (17, 8),
        (17, 9),
        (24, 2),
        (24, 9),
        (28, 2),
        (28, 4),
        (28, 9),
        (29, 2),
        (29, 4),
        (29, 9),
        (30, 2),
        (30, 4),
        (30, 6),
        (39, 2),
        (64, 9),
        (67, 5),
        (70, 3),
        (71, 5),
        (77, 1),
        (79, 3),
        (79, 9),
        (80, 9),
    ])),
    expected_actions: &[remove(26, 9)],
};

const FORCING_CHAIN: PracticeExample = PracticeExample {
    givens: "300008009070650003000000006001004600004070300005800200900000000100089050400200008",
    entries: Some(
        "006000500009000000500000000000000000000000000000000000000000000060000000050000900",
    ),
    eliminations: Some(&elimination_masks(&[
        (1, 2),
        (3, 1),
        (7, 4),
        (16, 8),
        (19, 2),
        (19, 8),
        (24, 4),
        (25, 4),
        (25, 8),
        (55, 3),
        (57, 1),
        (58, 1),
        (59, 1),
        (61, 1),
        (61, 2),
        (61, 4),
        (61, 7),
        (71, 4),
        (79, 1),
        (79, 7),
    ])),
    expected_actions: &[place(71, 2)],
};

// AI Escargot, published by Arto Inkala in 2006.
const FORCING_NET: PracticeExample = PracticeExample {
    givens: "100007090030020008009600500005300900010080002600004000300000010041000007007000300",
    entries: None,
    eliminations: None,
    expected_actions: &[remove(57, 9)],
};

const DYNAMIC_FORCING_NET: PracticeExample = PracticeExample {
    givens: "000000640008007209070200000000100860600309002082005000000002090407900100091000000",
    entries: None,
    eliminations: None,
    expected_actions: &[remove(62, 7)],
};

const ADVANCED_FORCING_NET: PracticeExample = PracticeExample {
    givens: FULL_HOUSE,
    entries: None,
    eliminations: None,
    expected_actions: &[remove(15, 5)],
};

// The first published nested forcing example in Sudoku Explainer's collection.
const NESTED_FORCING_NET: PracticeExample = PracticeExample {
    givens: "060900003500004020000080400800000050003000700090000001001050000070300009900002040",
    entries: None,
    eliminations: None,
    expected_actions: &[remove(39, 1)],
};

// Witness positions and expected eliminations from HoDoKu's regression library.
const ALS_XZ: PracticeExample = PracticeExample {
    givens: "000200600670008000085300000000006000500190002004000790000004260000700803010002900",
    entries: Some(
        "000000000000000000000060000000400000000000000100000006000000000000000000000600000",
    ),
    eliminations: Some(&elimination_masks(&[
        (8, 7),
        (15, 4),
        (31, 3),
        (31, 5),
        (31, 8),
        (49, 3),
        (62, 5),
    ])),
    expected_actions: &[remove(16, 1)],
};

const ALS_XY_WING: PracticeExample = PracticeExample {
    givens: "004007000120000700060100080046780009009000004530690010000432500000000000000000008",
    entries: Some(
        "000000000000000000000000000200001350010000000000004000000000000000000000000000000",
    ),
    eliminations: Some(&elimination_masks(&[
        (14, 6),
        (42, 2),
        (43, 2),
        (54, 7),
        (56, 7),
        (63, 7),
        (63, 8),
        (64, 8),
        (65, 7),
        (65, 8),
        (67, 5),
        (67, 6),
        (72, 7),
        (74, 7),
        (76, 5),
        (76, 6),
    ])),
    expected_actions: &[remove(24, 2)],
};

const ALS_CHAIN: PracticeExample = PracticeExample {
    givens: "007005004000000016000000500300900000804000000056378000000002061003469250009100000",
    entries: Some(
        "000000000500000000400000000000000005000500000000000140745830900180000007000057400",
    ),
    eliminations: Some(&elimination_masks(&[
        (1, 2),
        (1, 6),
        (4, 2),
        (7, 3),
        (13, 2),
        (19, 2),
        (22, 2),
        (23, 6),
        (25, 3),
        (26, 3),
        (31, 1),
        (42, 3),
        (43, 2),
        (44, 2),
    ])),
    expected_actions: &[remove(43, 7)],
};

const DEATH_BLOSSOM: PracticeExample = PracticeExample {
    givens: "500008103020600000100500600007060020600802009080090300001007006000006050205400008",
    entries: Some(
        "006020000000000000000000002900000800003000000402000060800050000000080000060000000",
    ),
    eliminations: Some(&elimination_masks(&[
        (15, 9),
        (16, 7),
        (57, 3),
        (61, 9),
        (69, 7),
        (71, 7),
        (79, 9),
    ])),
    expected_actions: &[remove(66, 3)],
};

const SUE_DE_COQ: PracticeExample = PracticeExample {
    givens: "008307009260000300000000040300052108704008005050000000080006007000005200001000000",
    entries: Some(
        "140020000007594081030861702096400070010630920802009000000200000070080000020003800",
    ),
    eliminations: None,
    expected_actions: &[remove(61, 1), remove(61, 5), remove(63, 9), remove(72, 9)],
};

// The worked Junior Exocet example in SudokuWiki.
const EXOCET: PracticeExample = PracticeExample {
    givens: "007020004930000600600300000000000050200010008006900400003700900020050001000008000",
    entries: None,
    eliminations: None,
    expected_actions: &[remove(12, 4), remove(24, 2), remove(24, 7)],
};

// Standard Senior Exocet from the Sudoku Studio tutorial, figure 0810.
// https://github.com/kyoyama-kazusa/Sudoku/blob/main/docs/tutorial/exocet/07-senior-exocet.md
const SENIOR_EXOCET: PracticeExample = PracticeExample {
    givens: "007000098600900700500000600000030040020001009006500000000004010000020003008700900",
    entries: None,
    eliminations: Some(&elimination_masks(&[(28, 8), (46, 8)])),
    expected_actions: &[remove(21, 8), remove(51, 8)],
};

// The SudokuWiki Double Exocet example, Unsolvable #165.
// https://www.sudokuwiki.org/Double_Exocet
const DOUBLE_EXOCET: PracticeExample = PracticeExample {
    givens: "090000030200000000003010907006000000000060370000108006008030001007080003000400050",
    entries: None,
    eliminations: None,
    expected_actions: &[
        remove(0, 4),
        remove(0, 5),
        remove(2, 1),
        remove(3, 2),
        remove(3, 5),
        remove(4, 2),
        remove(4, 7),
        remove(5, 2),
        remove(5, 4),
        remove(5, 5),
        remove(6, 2),
        remove(6, 4),
        remove(6, 5),
        remove(8, 4),
        remove(8, 5),
        remove(8, 8),
        remove(10, 4),
        remove(10, 5),
        remove(11, 1),
        remove(12, 5),
        remove(12, 9),
        remove(13, 4),
        remove(13, 5),
        remove(13, 7),
        remove(14, 4),
        remove(14, 5),
        remove(14, 9),
        remove(15, 4),
        remove(15, 5),
        remove(16, 4),
        remove(17, 8),
        remove(18, 4),
        remove(18, 5),
        remove(19, 4),
        remove(19, 5),
        remove(25, 2),
        remove(27, 4),
        remove(27, 5),
        remove(27, 9),
        remove(28, 2),
        remove(28, 4),
        remove(28, 5),
        remove(30, 5),
        remove(31, 2),
        remove(32, 4),
        remove(32, 5),
        remove(33, 4),
        remove(33, 5),
        remove(34, 4),
        remove(35, 2),
        remove(35, 9),
        remove(36, 9),
        remove(37, 2),
        remove(38, 4),
        remove(38, 5),
        remove(44, 2),
        remove(44, 4),
        remove(44, 5),
        remove(44, 9),
        remove(45, 9),
        remove(46, 2),
        remove(47, 4),
        remove(47, 5),
        remove(49, 2),
        remove(49, 4),
        remove(49, 5),
        remove(49, 9),
        remove(57, 2),
        remove(59, 2),
        remove(61, 9),
        remove(66, 2),
        remove(68, 2),
        remove(70, 9),
        remove(72, 9),
        remove(73, 2),
        remove(74, 2),
        remove(74, 9),
        remove(76, 7),
        remove(76, 9),
        remove(77, 2),
        remove(77, 9),
        remove(78, 2),
        remove(80, 2),
        remove(80, 8),
    ],
};

// Sudoku Studio figure 0821. The blue digits are placements.
pub(crate) const GROUPED_SENIOR_EXOCET: PracticeExample = PracticeExample {
    givens: "980700600500040000003009000400030090070000200009005000100070900000600002000000068",
    entries: Some(
        "000000000000000009000000000000007000000000000000000000000000000000000000000000000",
    ),
    eliminations: None,
    expected_actions: &[
        remove(39, 1),
        remove(39, 8),
        remove(73, 2),
        remove(75, 1),
        remove(75, 2),
    ],
};

// Figure 0817 includes a placed digit in the cover.
#[cfg(test)]
pub(crate) const SENIOR_EXOCET_PLACED_DIGIT: PracticeExample = PracticeExample {
    givens: "001000070390000800800100900009300700000042060200000004003700600000010050050006007",
    entries: None,
    eliminations: Some(&elimination_masks(&[(46, 7), (47, 7)])),
    // The allowed assignments also force 6 at r6c4.
    expected_actions: &[
        remove(3, 6),
        remove(4, 6),
        remove(8, 6),
        remove(11, 6),
        remove(12, 6),
        remove(19, 6),
        remove(20, 6),
        remove(47, 6),
        remove(48, 5),
        remove(48, 8),
        remove(48, 9),
    ],
};

// Steve Kurzhal's loop in Easter Monster, as documented by Allan Barker.
const SK_LOOP: PracticeExample = PracticeExample {
    givens: "100000002090400050006000700050903000000070000000850040700000600030009080002000001",
    entries: None,
    eliminations: None,
    expected_actions: &[
        remove(2, 7),
        remove(13, 3),
        remove(13, 8),
        remove(14, 8),
        remove(18, 2),
        remove(37, 4),
        remove(37, 8),
        remove(43, 3),
        remove(43, 9),
        remove(56, 1),
        remove(66, 5),
        remove(67, 4),
        remove(72, 6),
    ],
};

// The r2457c1258 construction in the June 2025 Sudoku Puzzle Challenges thread.
const MULTI_SECTOR_LOCKED_SETS: PracticeExample = PracticeExample {
    givens: "000000000001000803400090060000108200008000001500040000000000302090050070070000040",
    entries: None,
    eliminations: None,
    expected_actions: &[
        remove(0, 6),
        remove(0, 7),
        remove(0, 9),
        remove(1, 5),
        remove(1, 6),
        remove(4, 6),
        remove(4, 7),
        remove(7, 5),
        remove(7, 9),
        remove(12, 2),
        remove(14, 2),
        remove(19, 5),
        remove(29, 3),
        remove(39, 2),
        remove(39, 3),
        remove(41, 2),
        remove(41, 3),
        remove(46, 6),
        remove(52, 9),
        remove(57, 8),
        remove(59, 1),
        remove(63, 6),
        remove(72, 6),
        remove(76, 6),
    ],
};

// HoDoKu regression library 1.3, examples 0331 and 0362.
const FRANKEN_FISH: PracticeExample = PracticeExample {
    givens: "060802735207635408385070260506080307008763150730250684802006570650007800173528946",
    entries: None,
    eliminations: Some(&elimination_masks(&[
        (4, 4),
        (23, 1),
        (28, 4),
        (30, 1),
        (37, 9),
        (57, 4),
        (66, 1),
        (66, 4),
    ])),
    expected_actions: &[remove(2, 9)],
};

const MUTANT_FISH: PracticeExample = PracticeExample {
    givens: "070009500100005000080020160000010000000097030600200018807060050009000300000000040",
    entries: Some(concat!(
        "006100000",
        "000600000",
        "905700000",
        "700006000",
        "000000000",
        "090050700",
        "000000000",
        "000500000",
        "000900000",
    )),
    eliminations: Some(&elimination_masks(&[
        (0, 2),
        (8, 3),
        (13, 4),
        (15, 2),
        (16, 2),
        (17, 2),
        (29, 4),
        (35, 4),
        (55, 1),
        (55, 2),
        (59, 3),
        (59, 4),
        (67, 8),
        (68, 2),
        (68, 4),
        (71, 2),
        (76, 8),
        (77, 3),
    ])),
    expected_actions: &[remove(8, 4)],
};

// The first long Unique Loop from Sudoku Explainer's collection.
// https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---Some-interesting-Sudokus#unique-rectangles-and-loops
const UNIQUE_LOOP: PracticeExample = PracticeExample {
    givens: "000400870000003002000068504000000007025040908080000000700080003094016000030900040",
    entries: Some(
        "003000009008090000902000030009800000300007000007009000050204090200300785800075200",
    ),
    eliminations: Some(&elimination_masks(&[
        (9, 1),
        (9, 6),
        (10, 1),
        (10, 6),
        (11, 1),
        (11, 6),
        (12, 1),
        (33, 1),
        (33, 6),
        (34, 1),
        (34, 6),
        (45, 6),
        (51, 1),
        (51, 6),
        (52, 1),
        (52, 6),
    ])),
    expected_actions: &[remove(48, 1), remove(48, 6)],
};

// The published HoDoKu Kraken Fish examples share this position.
const KRAKEN_FISH_1: PracticeExample = PracticeExample {
    givens: "000000000030070809800003150908142000000000000500600040104200000000700006080005310",
    entries: Some(
        "000800000001500000000000000000000000000350000003000000000030000300000000000000000",
    ),
    eliminations: Some(&elimination_masks(&[
        (0, 2),
        (1, 4),
        (1, 6),
        (1, 7),
        (2, 2),
        (2, 6),
        (2, 7),
        (5, 4),
        (5, 9),
        (20, 9),
        (55, 5),
        (64, 9),
        (68, 9),
        (69, 5),
        (69, 9),
    ])),
    expected_actions: &[remove(69, 2)],
};
const KRAKEN_FISH_2: PracticeExample = PracticeExample {
    expected_actions: &[remove(44, 7)],
    ..KRAKEN_FISH_1
};

impl Technique {
    /// Three independently selected practice grids with expected proofs.
    pub const fn practice_examples(self) -> [PracticeExample; 3] {
        let [second, third] = examples::supplemental(self);
        [self.practice_example(), second, third]
    }

    /// A position with an expected deduction by this technique.
    pub const fn practice_example(self) -> PracticeExample {
        let expected_actions: &'static [HintAction] = match self {
            Self::FullHouse => const { &[place(3, 6)] },
            Self::NakedSingle => const { &[place(12, 3)] },
            Self::HiddenSingle => const { &[place(5, 9)] },
            Self::Pointing | Self::Claiming => const { &[remove(24, 2), remove(25, 2)] },
            Self::NakedPair => const { &[remove(63, 4), remove(63, 6)] },
            Self::HiddenPair => {
                const {
                    &[
                        remove(52, 2),
                        remove(52, 5),
                        remove(52, 9),
                        remove(53, 5),
                        remove(53, 7),
                    ]
                }
            }
            Self::XWing => const { &[remove(24, 2), remove(25, 2), remove(52, 2)] },
            Self::LockedPair => return LOCKED_PAIR,
            Self::LockedTriple => return LOCKED_TRIPLE,
            Self::NakedTriple => return NAKED_TRIPLE,
            Self::NakedQuadruple => return NAKED_QUADRUPLE,
            Self::HiddenTriple => return HIDDEN_TRIPLE,
            Self::HiddenQuadruple => return HIDDEN_QUADRUPLE,
            Self::Skyscraper => return SKYSCRAPER,
            Self::TwoStringKite => return TWO_STRING_KITE,
            Self::EmptyRectangle => return EMPTY_RECTANGLE,
            Self::XYWing => return XY_WING,
            Self::XYZWing => return XYZ_WING,
            Self::WWing => return W_WING,
            Self::Swordfish => return SWORDFISH,
            Self::Jellyfish => return JELLYFISH,
            Self::FinnedXWing => return FINNED_X_WING,
            Self::FinnedSwordfish => return FINNED_SWORDFISH,
            Self::FinnedJellyfish => return FINNED_JELLYFISH,
            Self::SashimiXWing => return SASHIMI_X_WING,
            Self::SashimiSwordfish => return SASHIMI_SWORDFISH,
            Self::SashimiJellyfish => return SASHIMI_JELLYFISH,
            Self::SimpleColoring => return SIMPLE_COLORING,
            Self::XChain => return X_CHAIN,
            Self::XYChain => return XY_CHAIN,
            Self::Medusa => return MEDUSA,
            Self::Aic => return AIC,
            Self::ContinuousNiceLoop => return CONTINUOUS_NICE_LOOP,
            Self::DiscontinuousNiceLoop => return DISCONTINUOUS_NICE_LOOP,
            Self::GroupedAic => return GROUPED_AIC,
            Self::GroupedContinuousNiceLoop => return GROUPED_CONTINUOUS_NICE_LOOP,
            Self::GroupedDiscontinuousNiceLoop => return GROUPED_DISCONTINUOUS_NICE_LOOP,
            Self::UniqueRectangle1 => return UNIQUE_RECTANGLE_1,
            Self::UniqueRectangle2 => return UNIQUE_RECTANGLE_2,
            Self::UniqueRectangle3 => return UNIQUE_RECTANGLE_3,
            Self::UniqueRectangle4 => return UNIQUE_RECTANGLE_4,
            Self::UniqueRectangle5 => return UNIQUE_RECTANGLE_5,
            Self::UniqueRectangle6 => return UNIQUE_RECTANGLE_6,
            Self::HiddenRectangle => return HIDDEN_RECTANGLE,
            Self::UniqueLoop => return UNIQUE_LOOP,
            Self::BugPlusOne => return BUG_PLUS_ONE,
            Self::WxyzWing => return WXYZ_WING,
            Self::Fireworks => return FIREWORKS,
            Self::AlignedPairExclusion => return ALIGNED_PAIR_EXCLUSION,
            Self::AlignedTripletExclusion => return ALIGNED_TRIPLET_EXCLUSION,
            Self::Tridagon => return TRIDAGON,
            Self::TridagonForcingNet => return TRIDAGON_FORCING_NET,
            Self::ForcingChain => return FORCING_CHAIN,
            Self::ForcingNet => return FORCING_NET,
            Self::DynamicForcingNet => return DYNAMIC_FORCING_NET,
            Self::AdvancedForcingNet => return ADVANCED_FORCING_NET,
            Self::NestedForcingNet => return NESTED_FORCING_NET,
            Self::AlsXz => return ALS_XZ,
            Self::AlsXyWing => return ALS_XY_WING,
            Self::AlsChain => return ALS_CHAIN,
            Self::DeathBlossom => return DEATH_BLOSSOM,
            Self::SueDeCoq => return SUE_DE_COQ,
            Self::Exocet => return EXOCET,
            Self::SeniorExocet => return SENIOR_EXOCET,
            Self::DoubleExocet => return DOUBLE_EXOCET,
            Self::SkLoop => return SK_LOOP,
            Self::MultiSectorLockedSets => return MULTI_SECTOR_LOCKED_SETS,
            Self::FrankenFish => return FRANKEN_FISH,
            Self::MutantFish => return MUTANT_FISH,
            Self::KrakenFish1 => return KRAKEN_FISH_1,
            Self::KrakenFish2 => return KRAKEN_FISH_2,
        };
        let givens = match self {
            Self::FullHouse => FULL_HOUSE,
            _ => PRACTICE_GRID,
        };
        PracticeExample {
            givens,
            entries: None,
            eliminations: None,
            expected_actions,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ColoringReason, ForcingBranch, ForcingConflict, ForcingInference, ForcingLiteral,
        ForcingScope, HintEvidence, House, InferenceLink, InferenceNode, LinkSource, LinkStrength,
        candidates, technique_deductions_at,
    };

    #[test]
    fn every_technique_can_find_its_practice_deduction() {
        for technique in Technique::ALL {
            let example = technique.practice_example();
            assert!(
                technique_deductions_at(&example.position().unwrap(), technique)
                    .unwrap()
                    .iter()
                    .any(|hint| {
                        hint.technique == technique && hint.actions == example.expected_actions
                    }),
                "missing practice deduction for {}",
                technique.id()
            );
        }
    }

    #[test]
    fn expert_patterns_also_find_their_published_moves_on_transposed_positions() {
        let transpose = |cell: usize| cell % 9 * 9 + cell / 9;
        let primary = [
            Technique::Exocet,
            Technique::SeniorExocet,
            Technique::DoubleExocet,
            Technique::SkLoop,
            Technique::MultiSectorLockedSets,
            Technique::KrakenFish1,
            Technique::KrakenFish2,
        ]
        .map(|technique| (technique, technique.practice_example()));
        let grouped = (Technique::SeniorExocet, GROUPED_SENIOR_EXOCET);
        let fireworks = Technique::Fireworks
            .practice_examples()
            .map(|example| (Technique::Fireworks, example));
        for (technique, example) in primary.into_iter().chain([grouped]).chain(fireworks) {
            let original = example.position().unwrap();
            let position = PositionSnapshot {
                givens: std::array::from_fn(|cell| original.givens[transpose(cell)]),
                entries: std::array::from_fn(|cell| original.entries[transpose(cell)]),
                eliminations: std::array::from_fn(|cell| original.eliminations[transpose(cell)]),
            };
            let hints = technique_deductions_at(&position, technique).unwrap();
            for &action in example.expected_actions {
                let HintAction::Eliminate(Candidate { cell, digit }) = action else {
                    panic!("the fixture is an elimination");
                };
                assert!(
                    hints
                        .iter()
                        .any(|hint| hint.actions.contains(&remove(transpose(cell), digit))),
                    "missing transposed {action:?} for {technique:?}"
                );
            }
        }
    }

    #[test]
    fn sk_loop_counts_only_the_unsolved_cells_of_each_arm() {
        // SudokuWiki's third example, just after its first six singles.
        let mut position = PositionSnapshot::new(
            parse_givens(
                "200000004080500070001020300000700090000060000070008000003000100090007050400001002",
            )
            .unwrap(),
        );
        position.entries = parse_givens(
            "000070000000000200700000000000000000000000700000000000000000007100000000000000000",
        )
        .unwrap();
        let hint = technique_deductions_at(&position, Technique::SkLoop).unwrap().into_iter()
            .find(|hint| matches!(&hint.evidence, HintEvidence::SkLoop(proof) if proof.anchors == [10, 16, 70, 64]))
            .unwrap();
        let HintEvidence::SkLoop(proof) = hint.evidence else {
            unreachable!()
        };
        assert_eq!(proof.arms.iter().map(Vec::len).sum::<usize>(), 14);
        assert_eq!(proof.arms.iter().filter(|arm| arm.len() == 1).count(), 2);
        assert_eq!(
            proof
                .links
                .iter()
                .map(|link| link.digits.len())
                .sum::<usize>(),
            14
        );
        assert!(hint.actions.contains(&remove(13, 9)));
    }

    #[test]
    fn doubly_linked_als_xz_locks_both_restricted_digits_and_the_remaining_digits() {
        // HoDoKu regression case 0901-2.
        const EXAMPLE: PracticeExample = PracticeExample {
            givens: "000080000000400000000125640720000006004310000900000080250000038690007120000000000",
            entries: Some(
                "000000000000000800000000000000000000000000000000000000000000000000000000000000060",
            ),
            eliminations: Some(&elimination_masks(&[
                (51, 7),
                (53, 7),
                (76, 4),
                (77, 4),
                (78, 4),
                (80, 4),
            ])),
            expected_actions: &[
                remove(2, 1),
                remove(2, 3),
                remove(2, 7),
                remove(2, 9),
                remove(11, 1),
                remove(11, 3),
                remove(11, 7),
                remove(11, 9),
                remove(26, 9),
                remove(29, 8),
                remove(46, 6),
            ],
        };
        let hint = technique_deductions_at(&EXAMPLE.position().unwrap(), Technique::AlsXz)
            .unwrap()
            .into_iter()
            .find(|hint| hint.actions == EXAMPLE.expected_actions)
            .unwrap();
        let HintEvidence::AlsXz { sets, links } = hint.evidence else {
            panic!("ALS-XZ must identify both sets and their links");
        };
        assert_eq!(links.len(), 2);
        // The other set locks 8 and also removes it from one cell inside this set.
        assert!(sets[0].cells.contains(&29));
        assert_eq!(sets[1].cells, [20, 56, 65, 74]);
        assert_ne!(
            crate::solve(&EXAMPLE.position().unwrap().values().unwrap()).unwrap()[29],
            8
        );
        assert!(
            sets.iter()
                .all(|set| links.iter().all(|digit| set.digits.contains(digit)))
        );
        for linked in [false, true] {
            assert!(hint.actions.iter().any(|action| matches!(action,
                HintAction::Eliminate(candidate) if links.contains(&candidate.digit) == linked
            )));
        }
    }

    #[test]
    fn death_blossom_can_use_overlapping_petals_for_three_stem_candidates() {
        let position = DEATH_BLOSSOM.position().unwrap();
        let hint = technique_deductions_at(&position, Technique::DeathBlossom)
            .unwrap()
            .into_iter()
            .find(|hint| hint.actions == DEATH_BLOSSOM.expected_actions)
            .unwrap();
        let HintEvidence::DeathBlossom { stem, petals } = hint.evidence else {
            panic!("Death Blossom must enumerate the alternatives");
        };
        let masks = candidates(&position.values().unwrap()).unwrap();
        let stem_candidates = masks[stem] & !position.eliminations[stem];
        assert_eq!(
            petals
                .iter()
                .fold(0, |mask, petal| mask | (1 << (petal.digit - 1))),
            stem_candidates
        );
        assert_eq!(petals.len(), 3);
        assert!(petals.iter().enumerate().any(|(i, first)| {
            petals[..i].iter().any(|second| {
                first
                    .set
                    .cells
                    .iter()
                    .any(|cell| second.set.cells.contains(cell))
            })
        }));
        let [HintAction::Eliminate(target)] = hint.actions.as_slice() else {
            panic!("worked example has one elimination");
        };
        for petal in petals {
            assert_eq!(petal.set.digits.len(), petal.set.cells.len() + 1);
            assert!(!petal.set.cells.contains(&stem));
            for (cell, digit) in [(stem, petal.digit), (target.cell, target.digit)] {
                assert!(petal.set.digits.contains(&digit));
                let houses = House::at(cell);
                for other in petal.set.cells.iter().filter(|&&other| {
                    masks[other] & !position.eliminations[other] & (1 << (digit - 1)) != 0
                }) {
                    assert!(
                        *other != cell && houses.iter().any(|house| house.cells().contains(other))
                    );
                }
            }
        }
    }

    #[test]
    fn wxyz_wing_can_eliminate_multiple_digits_when_all_are_restricted() {
        // SudokuWiki's Type 2 worked example.
        const EXAMPLE: PracticeExample = PracticeExample {
            givens: "010000003608000207003900500000604010030050020040302000001007600305000109200000030",
            entries: Some(
                "000005000050003090020000001002000300006000004000000006000030002000000000000000000",
            ),
            eliminations: Some(&elimination_masks(&[
                (0, 4),
                (3, 4),
                (4, 4),
                (7, 4),
                (22, 4),
                (36, 7),
                (41, 8),
                (45, 7),
                (73, 9),
                (74, 9),
                (75, 4),
                (76, 4),
                (77, 6),
                (77, 8),
            ])),
            expected_actions: &[remove(31, 8), remove(36, 9), remove(45, 9)],
        };
        let hints =
            technique_deductions_at(&EXAMPLE.position().unwrap(), Technique::WxyzWing).unwrap();
        assert!(hints.iter().any(|hint| {
            hint.actions == EXAMPLE.expected_actions
                && matches!(
                    hint.evidence,
                    HintEvidence::WxyzWing {
                        cells: [27, 28, 35, 47],
                        digits: [5, 7, 8, 9],
                        unrestricted: None,
                    }
                )
        }));
    }

    #[test]
    fn aligned_exclusion_replays_every_assignment_of_the_removed_candidate() {
        use crate::AlignedExclusionReason::{EmptyCell, RepeatedDigit};
        use std::collections::BTreeSet;

        for (technique, count) in [
            (Technique::AlignedPairExclusion, 2),
            (Technique::AlignedTripletExclusion, 3),
        ] {
            for example in technique.practice_examples() {
                let position = example.position().unwrap();
                let mut masks = candidates(&position.values().unwrap()).unwrap();
                for (mask, removed) in masks.iter_mut().zip(position.eliminations) {
                    *mask &= !removed;
                }
                for hint in technique_deductions_at(&position, technique).unwrap() {
                    let [HintAction::Eliminate(target)] = hint.actions.as_slice() else {
                        panic!("an aligned exclusion proves one removal");
                    };
                    let HintEvidence::AlignedExclusion { cells, cases } = &hint.evidence else {
                        panic!("an aligned exclusion records its rejected assignments");
                    };
                    assert_eq!(cells.len(), count);
                    let index = cells.iter().position(|&cell| cell == target.cell).unwrap();
                    let expected: usize = cells
                        .iter()
                        .filter(|&&cell| cell != target.cell)
                        .map(|&cell| masks[cell].count_ones() as usize)
                        .product();
                    assert_eq!(cases.len(), expected);
                    let mut seen = BTreeSet::new();
                    for case in cases {
                        assert_eq!(case.digits.len(), count);
                        assert_eq!(case.digits[index], target.digit);
                        assert!(seen.insert(&case.digits));
                        for (&cell, &digit) in cells.iter().zip(&case.digits) {
                            assert_ne!(masks[cell] & (1 << (digit - 1)), 0);
                        }
                        let sees = |a, b| {
                            House::at(a)
                                .iter()
                                .any(|house| House::at(b).contains(house))
                        };
                        match case.reason {
                            RepeatedDigit([a, b]) => {
                                assert_ne!(a, b);
                                assert!(sees(a, b));
                                let digit = |cell| {
                                    case.digits[cells.iter().position(|&c| c == cell).unwrap()]
                                };
                                assert_eq!(digit(a), digit(b));
                            }
                            EmptyCell(blocker) => {
                                assert!(!cells.contains(&blocker));
                                assert!(cells.iter().all(|&cell| sees(blocker, cell)));
                                let assigned = case
                                    .digits
                                    .iter()
                                    .fold(0, |mask, &digit| mask | 1 << (digit - 1));
                                assert_ne!(masks[blocker], 0);
                                assert_eq!(masks[blocker] & !assigned, 0);
                            }
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn tridagon_nets_replay_their_cases_and_refutations() {
        let mut saw_cases = false;
        let mut saw_refutation = false;
        for example in Technique::TridagonForcingNet.practice_examples() {
            let position = example.position().unwrap();
            let mut masks = candidates(&position.values().unwrap()).unwrap();
            for (mask, removed) in masks.iter_mut().zip(position.eliminations) {
                *mask &= !removed;
            }
            let hints = technique_deductions_at(&position, Technique::TridagonForcingNet).unwrap();
            assert!(!hints.is_empty());
            for hint in hints {
                let [action] = hint.actions.as_slice() else {
                    panic!("single forcing conclusion");
                };
                let target = ForcingLiteral {
                    candidate: action.candidate(),
                    truth: matches!(action, HintAction::Place(_)),
                };
                let HintEvidence::Tridagon {
                    cells,
                    digits: core,
                    guardians,
                    branches,
                } = hint.evidence
                else {
                    panic!("tridagon evidence");
                };
                let core = core
                    .into_iter()
                    .fold(0, |mask, digit| mask | 1 << (digit - 1));
                let extra: Vec<_> = cells
                    .iter()
                    .flatten()
                    .flat_map(|&cell| {
                        crate::hints::digits(masks[cell] & !core)
                            .map(move |digit| Candidate { cell, digit })
                    })
                    .collect();
                assert_eq!(extra, guardians);
                assert!(guardians.len() >= 2);
                if let [branch] = branches.as_slice() {
                    saw_refutation = true;
                    assert_eq!(branch.assumption.candidate, target.candidate);
                    assert_ne!(branch.assumption.truth, target.truth);
                    let facts = replay_forcing_branch(branch, &masks, &[], &guardians);
                    let conflict = branch
                        .conflict
                        .as_ref()
                        .expect("the opposite move must fail");
                    assert!(
                        branch
                            .steps
                            .iter()
                            .any(|step| step.scope == ForcingScope::Guardians)
                            || matches!(
                                conflict,
                                ForcingConflict::Exhausted {
                                    scope: ForcingScope::Guardians,
                                    ..
                                }
                            )
                    );
                    replay_forcing_conflict(conflict, &masks, &facts, &guardians);
                    continue;
                }
                saw_cases = true;
                assert_eq!(branches.len(), guardians.len());
                assert!(branches.iter().any(|branch| branch.conflict.is_none()));
                for (guardian, branch) in guardians.into_iter().zip(branches) {
                    assert_eq!(
                        branch.assumption,
                        ForcingLiteral {
                            candidate: guardian,
                            truth: true
                        }
                    );
                    let facts = replay_forcing_branch(&branch, &masks, &[], &[]);
                    if let Some(conflict) = &branch.conflict {
                        replay_forcing_conflict(conflict, &masks, &facts, &[]);
                    } else {
                        assert_eq!(facts.last(), Some(&target));
                    }
                }
            }
        }
        assert!(saw_cases && saw_refutation);
    }

    #[test]
    fn forcing_proofs_replay_each_inference_from_its_premises() {
        let mut saw_contradiction = false;
        let mut saw_verity = false;
        let mut saw_advanced = [false; 3];
        let examples = [
            Technique::ForcingChain,
            Technique::ForcingNet,
            Technique::DynamicForcingNet,
            Technique::AdvancedForcingNet,
            Technique::NestedForcingNet,
        ]
        .into_iter()
        .flat_map(|technique| {
            technique
                .practice_examples()
                .map(|example| (technique, example))
        });
        for (technique, example) in examples {
            let position = example.position().unwrap();
            let mut masks = candidates(&position.values().unwrap()).unwrap();
            for (mask, removed) in masks.iter_mut().zip(position.eliminations) {
                *mask &= !removed;
            }
            for hint in technique_deductions_at(&position, technique).unwrap() {
                let target = match hint.actions.as_slice() {
                    [HintAction::Place(candidate)] => ForcingLiteral {
                        candidate: *candidate,
                        truth: true,
                    },
                    [HintAction::Eliminate(candidate)] => ForcingLiteral {
                        candidate: *candidate,
                        truth: false,
                    },
                    _ => panic!("each forcing proof has one conclusion"),
                };
                let HintEvidence::Forcing { scope, branches } = hint.evidence else {
                    panic!("forcing deduction must record its proof");
                };
                let steps = || branches.iter().flat_map(|branch| &branch.steps);
                if !matches!(
                    technique,
                    Technique::NestedForcingNet | Technique::AdvancedForcingNet
                ) {
                    assert_eq!(
                        steps().any(|step| matches!(step.scope, ForcingScope::Intersection { .. })),
                        technique == Technique::DynamicForcingNet
                    );
                }
                if technique == Technique::AdvancedForcingNet {
                    let mut specialized = false;
                    for step in steps() {
                        let kind = match step.scope {
                            ForcingScope::NakedPair { .. } => 0,
                            ForcingScope::HiddenPair { .. } => 1,
                            ForcingScope::XWing { .. } => 2,
                            _ => continue,
                        };
                        specialized = true;
                        saw_advanced[kind] = true;
                    }
                    assert!(specialized);
                }
                if matches!(technique, Technique::ForcingChain | Technique::ForcingNet) {
                    assert_eq!(
                        steps().any(|step| step.causes.len() > 1),
                        technique == Technique::ForcingNet
                    );
                }
                match scope {
                    Some(scope) => {
                        saw_verity = true;
                        assert_eq!(
                            branches
                                .iter()
                                .map(|branch| branch.assumption)
                                .collect::<Vec<_>>(),
                            forcing_assumptions(scope, &masks)
                        );
                        for branch in &branches {
                            let facts = replay_forcing_branch(branch, &masks, &[], &[]);
                            assert!(branch.conflict.is_none());
                            assert_eq!(facts.last(), Some(&target));
                        }
                    }
                    None => {
                        saw_contradiction = true;
                        let [branch] = branches.as_slice() else {
                            panic!("a contradiction disproves one assumption");
                        };
                        assert_eq!(branch.assumption.candidate, target.candidate);
                        assert_ne!(branch.assumption.truth, target.truth);
                        let facts = replay_forcing_branch(branch, &masks, &[], &[]);
                        let conflict = branch.conflict.as_ref().unwrap();
                        assert_eq!(
                            matches!(conflict, ForcingConflict::Cases(_)),
                            technique == Technique::NestedForcingNet
                        );
                        replay_forcing_conflict(conflict, &masks, &facts, &[]);
                    }
                }
            }
        }
        assert!(saw_contradiction && saw_verity);
        assert_eq!(saw_advanced, [true; 3]);
    }

    fn forcing_members(
        scope: ForcingScope,
        masks: &[u16; CELLS],
        guardians: &[Candidate],
    ) -> Vec<Candidate> {
        match scope {
            ForcingScope::Cell(cell) => (1..=9)
                .filter(|&digit| masks[cell] & (1 << (digit - 1)) != 0)
                .map(|digit| Candidate { cell, digit })
                .collect(),
            ForcingScope::House { house, digit } => house
                .cells()
                .into_iter()
                .filter(|&cell| masks[cell] & (1 << (digit - 1)) != 0)
                .map(|cell| Candidate { cell, digit })
                .collect(),
            ForcingScope::Candidate(_) => panic!("a candidate alone is not an exact-one unit"),
            ForcingScope::Intersection { .. } => {
                panic!("an intersection connects two exact-one units")
            }
            ForcingScope::NakedPair { .. }
            | ForcingScope::HiddenPair { .. }
            | ForcingScope::XWing { .. } => {
                panic!("an advanced pattern connects several exact-one units")
            }
            ForcingScope::Guardians => {
                assert!(
                    guardians.len() >= 2,
                    "a guardian scope needs its enclosing proof"
                );
                let mut members = guardians.to_vec();
                members.sort_unstable();
                members
            }
        }
    }

    fn forcing_assumptions(scope: ForcingScope, masks: &[u16; CELLS]) -> Vec<ForcingLiteral> {
        if let ForcingScope::Candidate(candidate) = scope {
            return [false, true]
                .map(|truth| ForcingLiteral { candidate, truth })
                .to_vec();
        }
        forcing_members(scope, masks, &[])
            .into_iter()
            .map(|candidate| ForcingLiteral {
                candidate,
                truth: true,
            })
            .collect()
    }

    fn forcing_literals(facts: &[ForcingLiteral], indices: &[usize]) -> Vec<(Candidate, bool)> {
        let mut literals: Vec<_> = indices
            .iter()
            .map(|&index| {
                let fact = facts[index];
                (fact.candidate, fact.truth)
            })
            .collect();
        literals.sort_unstable();
        literals
    }

    fn replay_branch_pattern(
        step: &ForcingInference,
        masks: &[u16; CELLS],
        facts: &[ForcingLiteral],
        causes: &[(Candidate, bool)],
    ) -> bool {
        let Candidate { cell, digit } = step.effect.candidate;
        let possible = |candidate: Candidate| {
            masks[candidate.cell] & digit_bit(candidate.digit) != 0
                && !facts.contains(&ForcingLiteral {
                    candidate,
                    truth: false,
                })
        };
        let locations =
            |house, digit| forcing_members(ForcingScope::House { house, digit }, masks, &[]);
        let mut expected: Vec<_> = match step.scope {
            ForcingScope::NakedPair {
                house,
                cells,
                digits,
            }
            | ForcingScope::HiddenPair {
                house,
                cells,
                digits,
            } => {
                assert!(cells[0] < cells[1] && digits[0] < digits[1]);
                assert!(cells.iter().all(|cell| house.cells().contains(cell)));
                assert!(cells.into_iter().all(|cell| {
                    digits
                        .into_iter()
                        .all(|digit| possible(Candidate { cell, digit }))
                }));
                if matches!(step.scope, ForcingScope::NakedPair { .. }) {
                    assert!(house.cells().contains(&cell) && !cells.contains(&cell));
                    assert!(digits.contains(&digit));
                    cells
                        .into_iter()
                        .flat_map(|cell| forcing_members(ForcingScope::Cell(cell), masks, &[]))
                        .filter(|candidate| !digits.contains(&candidate.digit))
                        .collect()
                } else {
                    assert!(cells.contains(&cell) && !digits.contains(&digit));
                    digits
                        .into_iter()
                        .flat_map(|digit| locations(house, digit))
                        .filter(|candidate| !cells.contains(&candidate.cell))
                        .collect()
                }
            }
            ForcingScope::XWing {
                digit: constrained,
                bases,
                covers,
            } => {
                assert_eq!(constrained, digit);
                assert_ne!(bases[0], bases[1]);
                assert_ne!(covers[0], covers[1]);
                assert!(matches!(
                    (bases, covers),
                    (
                        [House::Row(_), House::Row(_)],
                        [House::Column(_), House::Column(_)]
                    ) | (
                        [House::Column(_), House::Column(_)],
                        [House::Row(_), House::Row(_)]
                    )
                ));
                let covered = |cell| covers.iter().any(|house| house.cells().contains(&cell));
                assert!(covered(cell));
                assert!(bases.iter().all(|house| !house.cells().contains(&cell)));
                for base in bases {
                    for cover in covers {
                        assert!(locations(base, digit).into_iter().any(|candidate| {
                            cover.cells().contains(&candidate.cell) && possible(candidate)
                        }));
                    }
                }
                bases
                    .into_iter()
                    .flat_map(|house| locations(house, digit))
                    .filter(|candidate| !covered(candidate.cell))
                    .collect()
            }
            _ => return false,
        };
        expected.sort_unstable();
        assert!(!step.effect.truth && !expected.is_empty());
        assert!(possible(step.effect.candidate));
        assert_eq!(
            causes,
            expected
                .into_iter()
                .map(|candidate| (candidate, false))
                .collect::<Vec<_>>()
        );
        true
    }

    fn replay_forcing_branch(
        branch: &ForcingBranch,
        masks: &[u16; CELLS],
        premises: &[ForcingLiteral],
        guardians: &[Candidate],
    ) -> Vec<ForcingLiteral> {
        let Candidate { cell, digit } = branch.assumption.candidate;
        assert_ne!(masks[cell] & (1 << (digit - 1)), 0);
        let mut facts = vec![branch.assumption];
        facts.extend_from_slice(premises);
        for step in &branch.steps {
            let causes = forcing_literals(&facts, &step.causes);
            if replay_branch_pattern(step, masks, &facts, &causes) {
                facts.push(step.effect);
                continue;
            }
            if let ForcingScope::Intersection {
                source,
                target,
                digit,
            } = step.scope
            {
                let Candidate {
                    cell,
                    digit: removed,
                } = step.effect.candidate;
                assert!(!step.effect.truth);
                assert_eq!(removed, digit);
                assert!(target.cells().contains(&cell));
                assert!(!source.cells().contains(&cell));
                assert_ne!(masks[cell] & (1 << (digit - 1)), 0);
                let source = forcing_members(
                    ForcingScope::House {
                        house: source,
                        digit,
                    },
                    masks,
                    guardians,
                );
                let target_cells = target.cells();
                assert!(
                    source
                        .iter()
                        .filter(|&&candidate| {
                            target_cells.contains(&candidate.cell)
                                && !facts.contains(&ForcingLiteral {
                                    candidate,
                                    truth: false,
                                })
                        })
                        .count()
                        >= 2
                );
                assert!(!causes.is_empty());
                assert_eq!(
                    causes,
                    source
                        .into_iter()
                        .filter(|candidate| !target_cells.contains(&candidate.cell))
                        .map(|candidate| (candidate, false))
                        .collect::<Vec<_>>()
                );
                facts.push(step.effect);
                continue;
            }
            let unit = forcing_members(step.scope, masks, guardians);
            assert!(unit.contains(&step.effect.candidate));
            if step.effect.truth {
                assert_eq!(
                    causes,
                    unit.into_iter()
                        .filter(|&candidate| candidate != step.effect.candidate)
                        .map(|candidate| (candidate, false))
                        .collect::<Vec<_>>()
                );
            } else {
                assert_ne!(
                    step.scope,
                    ForcingScope::Guardians,
                    "guardians need not be mutually exclusive"
                );
                let [(candidate, true)] = causes.as_slice() else {
                    panic!("an exclusion follows from a true member of the unit");
                };
                assert!(unit.contains(candidate));
                assert_ne!(*candidate, step.effect.candidate);
            }
            facts.push(step.effect);
        }
        facts
    }

    fn replay_forcing_conflict(
        conflict: &ForcingConflict,
        masks: &[u16; CELLS],
        facts: &[ForcingLiteral],
        guardians: &[Candidate],
    ) {
        match conflict {
            ForcingConflict::Opposite([first, second]) => {
                assert_eq!(facts[*first].candidate, facts[*second].candidate);
                assert_ne!(facts[*first].truth, facts[*second].truth);
            }
            ForcingConflict::Exhausted { scope, causes } => {
                assert_eq!(
                    forcing_literals(facts, causes),
                    forcing_members(*scope, masks, guardians)
                        .into_iter()
                        .map(|candidate| (candidate, false))
                        .collect::<Vec<_>>()
                );
            }
            ForcingConflict::Cases(cases) => {
                let [a, b] = cases.as_ref();
                assert_eq!(a.branch.assumption.candidate, b.branch.assumption.candidate);
                assert_ne!(a.branch.assumption.truth, b.branch.assumption.truth);
                for case in cases.iter() {
                    assert!(case.premises.windows(2).all(|pair| pair[0] < pair[1]));
                    let premises: Vec<_> =
                        case.premises.iter().map(|&index| facts[index]).collect();
                    assert!(
                        premises
                            .iter()
                            .all(|fact| fact.candidate != case.branch.assumption.candidate)
                    );
                    let facts = replay_forcing_branch(&case.branch, masks, &premises, guardians);
                    let conflict = case.branch.conflict.as_ref().unwrap();
                    assert!(!matches!(conflict, ForcingConflict::Cases(_)));
                    replay_forcing_conflict(conflict, masks, &facts, guardians);
                }
            }
        }
    }

    #[test]
    fn inference_examples_prove_their_links_in_the_current_position() {
        for technique in [
            Technique::Aic,
            Technique::DiscontinuousNiceLoop,
            Technique::ContinuousNiceLoop,
            Technique::GroupedAic,
            Technique::GroupedDiscontinuousNiceLoop,
            Technique::GroupedContinuousNiceLoop,
        ] {
            let example = technique.practice_example();
            let position = example.position().unwrap();
            let mut masks = candidates(&position.values().unwrap()).unwrap();
            for (mask, removed) in masks.iter_mut().zip(position.eliminations) {
                *mask &= !removed;
            }
            let hint = technique_deductions_at(&position, technique)
                .unwrap()
                .into_iter()
                .find(|hint| hint.actions == example.expected_actions)
                .unwrap();
            let HintEvidence::Inference { links } = hint.evidence else {
                panic!("inference must record its proof")
            };
            for link in &links {
                assert_link_is_valid(link, &masks);
            }
            for pair in links.windows(2) {
                assert_eq!(pair[0].to, pair[1].from);
                assert_ne!(pair[0].strength, pair[1].strength);
            }
            let first = links.first().unwrap();
            let last = links.last().unwrap();
            let grouped = links.iter().any(|link| {
                matches!(link.from, InferenceNode::Group { .. })
                    || matches!(link.to, InferenceNode::Group { .. })
            });
            assert_eq!(grouped, technique.id().starts_with("grouped-"));
            match technique {
                Technique::Aic | Technique::GroupedAic => {
                    assert_ne!(first.from, last.to);
                    assert_eq!(first.strength, LinkStrength::Strong);
                    assert_eq!(last.strength, LinkStrength::Strong);
                }
                Technique::DiscontinuousNiceLoop | Technique::GroupedDiscontinuousNiceLoop => {
                    assert_eq!(first.from, last.to);
                    assert_eq!(first.strength, last.strength);
                }
                _ => {
                    assert_eq!(first.from, last.to);
                    assert_ne!(first.strength, last.strength);
                }
            }
        }
    }

    fn assert_link_is_valid(link: &InferenceLink, masks: &[u16; CELLS]) {
        let members = |node: &InferenceNode| match node {
            InferenceNode::Candidate(value) => vec![*value],
            InferenceNode::Group { digit, cells } => cells
                .iter()
                .map(|&cell| Candidate {
                    cell,
                    digit: *digit,
                })
                .collect(),
        };
        let from = members(&link.from);
        let to = members(&link.to);
        assert!(from.iter().all(|value| !to.contains(value)));
        let mut linked = from;
        linked.extend(to);
        linked.sort_unstable();
        let constraint: Vec<_> = match link.source {
            LinkSource::Cell(cell) => (1..=9)
                .filter(|&digit| masks[cell] & (1 << (digit - 1)) != 0)
                .map(|digit| Candidate { cell, digit })
                .collect(),
            LinkSource::House(house) => {
                let digit = linked[0].digit;
                house
                    .cells()
                    .into_iter()
                    .filter(|&cell| masks[cell] & (1 << (digit - 1)) != 0)
                    .map(|cell| Candidate { cell, digit })
                    .collect()
            }
        };
        assert!(linked.iter().all(|value| constraint.contains(value)));
        if link.strength == LinkStrength::Strong {
            assert_eq!(constraint, linked);
        }
    }

    #[test]
    fn mixed_digit_aic_and_strong_discontinuity_have_distinct_effects() {
        // HoDoKu regression cases 0708-2 and 0707-1.
        for (technique, givens, entries, actions) in [
            (
                Technique::Aic,
                "000000050000020100003800000000600002200408093401000085100000000006035907745000000",
                "002000000004500000500000200398057410057010600060090700039000500820100040000000001",
                &[remove(6, 8), remove(78, 3)][..],
            ),
            (
                Technique::DiscontinuousNiceLoop,
                "050002009090000000000607002082570000000004000467000900000405000000018600109000020",
                "700040000200053700830090000300009000915360200000281000678020090523900000040736000",
                &[place(7, 3)][..],
            ),
        ] {
            let mut position = PositionSnapshot::new(parse_givens(givens).unwrap());
            position.entries = parse_givens(entries).unwrap();
            let hints = technique_deductions_at(&position, technique).unwrap();
            assert!(
                hints.iter().any(|hint| hint.actions == actions),
                "missing {technique:?} deduction"
            );
        }
    }

    #[test]
    fn medusa_rejects_colors_that_conflict_or_empty_a_constraint() {
        // These positions and witnesses come from SudokuWiki Medusa rules 1, 6, and 7.
        // https://www.sudokuwiki.org/3D_Medusa
        for (givens, entries, removals, reason, highlights) in [
            (
                "000400002009005130000060090070058000006000700000320060090040000013700600700001004",
                "600000070040070006007000400000600040000004000004007000000006317400000000060030000",
                &[
                    (36, 1),
                    (36, 9),
                    (44, 1),
                    (44, 9),
                    (71, 8),
                    (78, 5),
                    (79, 5),
                ][..],
                ColoringReason::EmptiedCell(33),
                &[remove(29, 2), remove(78, 9)][..],
            ),
            (
                "400000019007140000900070000000300600054000080009000007000010005000038200570000006",
                "000850700800009000015003408780095040000060900000480000040000890090500074008924130",
                &[(10, 3), (45, 2), (54, 6), (56, 6)][..],
                ColoringReason::EmptiedHouse {
                    house: House::Row(5),
                    digit: 2,
                },
                &[remove(5, 2), remove(10, 2), remove(25, 2)][..],
            ),
            (
                "093804500005600000206070000020060040000208000070040090000010703000002600002507180",
                "000020060080000002000005008301709805000050300508000206850006020007080050000000000",
                &[(36, 4), (63, 9), (72, 4)][..],
                ColoringReason::SameColorConflict([
                    Candidate { cell: 64, digit: 1 },
                    Candidate { cell: 64, digit: 3 },
                ]),
                &[remove(64, 1), remove(64, 3)][..],
            ),
        ] {
            let mut position = PositionSnapshot::new(parse_givens(givens).unwrap());
            position.entries = parse_givens(entries).unwrap();
            position.eliminations = elimination_masks(removals);
            let hints = technique_deductions_at(&position, Technique::Medusa).unwrap();
            assert!(
                hints.iter().any(|hint| {
                    let HintEvidence::Coloring {
                        reason: actual,
                        colors,
                        ..
                    } = &hint.evidence
                    else {
                        return false;
                    };
                    actual == &reason
                        && highlights
                            .iter()
                            .all(|action| hint.actions.contains(action))
                        && colors.iter().any(|color| {
                            color
                                .iter()
                                .copied()
                                .map(HintAction::Eliminate)
                                .eq(hint.actions.iter().copied())
                        })
                }),
                "missing {reason:?}"
            );
        }
    }
}
