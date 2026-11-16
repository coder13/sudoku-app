use super::{PracticeExample, Technique, elimination_masks, place, remove};

// Additional independently verified positions.
// Numbered examples come from the HoDoKu regression library, version 1.3.
// https://hodoku.sourceforge.net/libraries/reglib-1.3.txt
pub(super) const fn supplemental(technique: Technique) -> [PracticeExample; 2] {
    match technique {
        Technique::FullHouse => {
            const {
                [
                    // HoDoKu library line 92
                    PracticeExample {
                        givens: "000200000805310000201000008049060800000902000002030540700000901000078403000001000",
                        entries: Some(
                            "634089000070006294090754630300105072587040006160807009058423060906500020423690000",
                        ),
                        eliminations: None,
                        expected_actions: &[place(64, 1)],
                    },
                    // HoDoKu library line 93
                    PracticeExample {
                        givens: "000300001000004870000002639001907053009000100250108900643500000085400000100003000",
                        entries: Some(
                            "576089420392610005418750000860040200730200000004000000000000000900000000007800000",
                        ),
                        eliminations: None,
                        expected_actions: &[place(73, 2)],
                    },
                ]
            }
        }
        Technique::NakedSingle => {
            const {
                [
                    // HoDoKu library line 180
                    PracticeExample {
                        givens: "809040020046010000300900000000100945500000006983006000000004001000090370030070409",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[place(52, 1)],
                    },
                    // HoDoKu library line 182
                    PracticeExample {
                        givens: "000040007040690000000208601020000360700000005038000010209306000000052080400070000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[place(22, 3)],
                    },
                ]
            }
        }
        Technique::HiddenSingle => {
            const {
                [
                    // HoDoKu library line 138
                    PracticeExample {
                        givens: "200040007400000000317008506050009020002030700090400080508200471000000002100080005",
                        entries: Some(
                            "080600000060000208000920040003000004040000009000000003030096000070000000020000000",
                        ),
                        eliminations: None,
                        expected_actions: &[place(47, 1)],
                    },
                    // HoDoKu library line 139
                    PracticeExample {
                        givens: "502000000019030005006005008000400500001726400008003000900600200200070810000000903",
                        entries: Some(
                            "000060000800200000700000000607000000350000089400000000000000000000000000100002000",
                        ),
                        eliminations: None,
                        expected_actions: &[place(25, 2)],
                    },
                ]
            }
        }
        Technique::Pointing => {
            const {
                [
                    // HoDoKu library line 255
                    PracticeExample {
                        givens: "000000730040000091560001000006400007050030020800009600000200079430000010098000000",
                        entries: Some(
                            "080000006000000500000000000020000000000000000070020000615000000000000000000000060",
                        ),
                        eliminations: Some(&elimination_masks(&[(20, 2), (22, 4)])),
                        expected_actions: &[remove(21, 8), remove(22, 8)],
                    },
                    // HoDoKu library line 223
                    PracticeExample {
                        givens: "002000006500030970030004000005801000009602800000903200000400020087020005600000300",
                        entries: Some(
                            "090000030000006000006090000200000093300000000000000000953060000000309000020000009",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (0, 8),
                            (4, 5),
                            (4, 7),
                            (25, 5),
                            (45, 7),
                            (76, 5),
                            (76, 7),
                        ])),
                        expected_actions: &[remove(74, 1), remove(79, 1)],
                    },
                ]
            }
        }
        Technique::Claiming => {
            const {
                [
                    // HoDoKu library line 282
                    PracticeExample {
                        givens: "049860001530000000000000090001608402000000000902307500020000000000000023300024960",
                        entries: Some(
                            "200000000000000000000000000750090030403000009000040010000000000094000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (15, 7),
                            (16, 7),
                            (17, 7),
                            (19, 6),
                            (19, 8),
                            (21, 1),
                            (22, 1),
                            (23, 1),
                            (24, 7),
                            (26, 7),
                            (73, 8),
                        ])),
                        expected_actions: &[
                            remove(57, 5),
                            remove(58, 5),
                            remove(59, 5),
                            remove(75, 5),
                        ],
                    },
                    // HoDoKu library line 265
                    PracticeExample {
                        givens: "007000000300649700609508000000002035002000400590300000000906104005214003000000600",
                        entries: Some(
                            "000123500051000000020070341006400000030000000004000200000000000060000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (7, 8),
                            (8, 8),
                            (43, 7),
                            (52, 7),
                            (72, 7),
                            (73, 7),
                            (79, 7),
                            (80, 7),
                        ])),
                        expected_actions: &[remove(36, 1)],
                    },
                ]
            }
        }
        Technique::NakedPair => {
            const {
                [
                    // HoDoKu library line 360
                    PracticeExample {
                        givens: "030060400000000500000000016006010780501700000902000005000307000600001002050400801",
                        entries: Some(
                            "000000020060000030020000900340000009080049263070600140218090654094000370703026090",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(3, 5),
                            remove(3, 8),
                            remove(12, 8),
                            remove(13, 8),
                            remove(14, 8),
                            remove(22, 5),
                            remove(22, 8),
                            remove(23, 5),
                            remove(23, 8),
                        ],
                    },
                    // locked-pair practice grid
                    PracticeExample {
                        givens: "970500060000007103800040000000080900685000000100003002000000000000600057008090200",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(2, 4), remove(5, 8)],
                    },
                ]
            }
        }
        Technique::HiddenPair => {
            const {
                [
                    // HoDoKu library line 436
                    PracticeExample {
                        givens: "060001004048000090000000000000208700580967043006504000000000000050000260100400080",
                        entries: Some(
                            "000000000000000001000040002400000056002000100000000928600000410804103000000006300",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (2, 9),
                            (4, 3),
                            (13, 3),
                            (19, 9),
                            (20, 9),
                        ])),
                        expected_actions: &[
                            remove(0, 3),
                            remove(0, 7),
                            remove(4, 5),
                            remove(4, 7),
                            remove(4, 8),
                        ],
                    },
                    // HoDoKu library line 456
                    PracticeExample {
                        givens: "000000640008007209070200000000100860600309002082005000000002090407900100091000000",
                        entries: Some(
                            "000801007000000000000000081709024000000080000000000904000010000000000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[(52, 7)])),
                        expected_actions: &[
                            remove(10, 1),
                            remove(10, 3),
                            remove(10, 5),
                            remove(20, 3),
                            remove(20, 5),
                        ],
                    },
                ]
            }
        }
        Technique::LockedPair => {
            const {
                [
                    // HoDoKu library line 307
                    PracticeExample {
                        givens: "600000008002000070940000000001509800790000502000004009160005020000002005003961000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[
                            remove(60, 4),
                            remove(60, 7),
                            remove(62, 4),
                            remove(62, 7),
                            remove(69, 4),
                            remove(69, 7),
                            remove(70, 4),
                            remove(72, 4),
                            remove(73, 7),
                            remove(79, 4),
                        ],
                    },
                    // HoDoKu library line 308
                    PracticeExample {
                        givens: "986200000004000800050000002060037000005100290100400030000003020570000600000000150",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[
                            remove(30, 8),
                            remove(36, 8),
                            remove(44, 6),
                            remove(44, 8),
                            remove(49, 6),
                            remove(49, 8),
                            remove(50, 6),
                            remove(50, 8),
                        ],
                    },
                ]
            }
        }
        Technique::LockedTriple => {
            const {
                [
                    // HoDoKu library line 335
                    PracticeExample {
                        givens: "000040300080001429001500000076000008000002000009050070008000000300000000090108630",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[
                            remove(7, 6),
                            remove(7, 8),
                            remove(8, 6),
                            remove(8, 7),
                            remove(18, 6),
                            remove(18, 7),
                            remove(19, 6),
                            remove(22, 6),
                            remove(22, 7),
                            remove(22, 8),
                            remove(23, 6),
                            remove(23, 7),
                        ],
                    },
                    // HoDoKu library line 336
                    PracticeExample {
                        givens: "800300000010040070005700620049006080000020000300004000000000001006900800001005900",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[
                            remove(12, 5),
                            remove(12, 8),
                            remove(31, 1),
                            remove(31, 5),
                            remove(41, 1),
                            remove(41, 8),
                            remove(49, 1),
                            remove(49, 5),
                            remove(49, 8),
                            remove(57, 8),
                            remove(75, 8),
                        ],
                    },
                ]
            }
        }
        Technique::NakedTriple => {
            const {
                [
                    // HoDoKu library line 391
                    PracticeExample {
                        givens: "010000000304500000076090004700400063030627010460005007600030940000008206000000030",
                        entries: Some(
                            "000000000000000000000000000021089500000000409009310820000000000003000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (3, 7),
                            (8, 8),
                            (16, 7),
                            (17, 8),
                            (56, 5),
                            (63, 5),
                            (67, 7),
                            (72, 5),
                            (74, 5),
                            (76, 7),
                            (77, 1),
                            (77, 2),
                        ])),
                        expected_actions: &[
                            remove(0, 2),
                            remove(0, 5),
                            remove(0, 8),
                            remove(5, 2),
                            remove(7, 5),
                            remove(7, 8),
                        ],
                    },
                    // HoDoKu library line 395
                    PracticeExample {
                        givens: "430080059008090001020000003080006500000802000006900040500000060800050700740020085",
                        entries: Some(
                            "000200600600000420000060870200000007000000006000005208000708000060000000000600000",
                        ),
                        eliminations: Some(&elimination_masks(&[(29, 3), (38, 3)])),
                        expected_actions: &[
                            remove(37, 1),
                            remove(37, 9),
                            remove(38, 1),
                            remove(38, 9),
                            remove(40, 1),
                            remove(40, 3),
                        ],
                    },
                ]
            }
        }
        Technique::HiddenTriple => {
            const {
                [
                    // HoDoKu library line 468
                    PracticeExample {
                        givens: "000003090820900000409010000080050400090671080005030010000090502000005037040300000",
                        entries: Some(
                            "000020000000000050000000020000209070004000005000000000008000040902000800507082060",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(1, 1),
                            remove(1, 6),
                            remove(1, 7),
                            remove(3, 7),
                            remove(8, 1),
                            remove(8, 6),
                        ],
                    },
                    // HoDoKu library line 469
                    PracticeExample {
                        givens: "000060091200000000008920470002600080040000010080001300056047100000000003730080000",
                        entries: Some(
                            "470000200000000830000000000000000000000000000000000000900300028820000700000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (10, 1),
                            (11, 1),
                            (18, 6),
                            (32, 3),
                            (35, 5),
                            (41, 3),
                            (44, 5),
                            (44, 6),
                            (53, 5),
                            (53, 6),
                            (77, 9),
                            (80, 5),
                            (80, 6),
                        ])),
                        expected_actions: &[remove(12, 5), remove(13, 5), remove(14, 5)],
                    },
                ]
            }
        }
        Technique::NakedQuadruple => {
            const {
                [
                    // HoDoKu library line 422
                    PracticeExample {
                        givens: "030080000908041000001900207025400600003017050700000000000000000000005106000300098",
                        entries: Some(
                            "502706000070200060000053080000000070000600002000500000000100000000800000000000000",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(54, 4),
                            remove(54, 6),
                            remove(55, 4),
                            remove(55, 6),
                            remove(55, 9),
                            remove(63, 4),
                            remove(72, 4),
                            remove(72, 6),
                            remove(73, 4),
                            remove(73, 6),
                        ],
                    },
                    // HoDoKu library line 423
                    PracticeExample {
                        givens: "000000000005020000907000100000940500000000060000507801600005002004300016309010080",
                        entries: Some(
                            "000000000000000000000000000000000000000000000000000000000000000000000000000000005",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(36, 1),
                            remove(36, 2),
                            remove(36, 8),
                            remove(37, 1),
                            remove(37, 2),
                            remove(37, 3),
                            remove(37, 8),
                            remove(42, 2),
                            remove(42, 3),
                            remove(44, 3),
                        ],
                    },
                ]
            }
        }
        Technique::HiddenQuadruple => {
            const {
                [
                    // HoDoKu library line 499
                    PracticeExample {
                        givens: "000000000005020000907000100000940500000000060000507801600005002004300016309010080",
                        entries: Some(
                            "000000000000000000000000000000000000000000000000000000000000000000000000000000005",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(36, 1),
                            remove(36, 2),
                            remove(36, 8),
                            remove(37, 1),
                            remove(37, 2),
                            remove(37, 3),
                            remove(37, 8),
                            remove(42, 2),
                            remove(42, 3),
                            remove(44, 3),
                        ],
                    },
                    // HoDoKu library line 500
                    PracticeExample {
                        givens: "409210600061000000000000700000000000050003004210007009000004800002060070000059203",
                        entries: Some(
                            "070005038300078052020036001000102507000600120000500300000020006000001005000000000",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(54, 9),
                            remove(56, 3),
                            remove(72, 8),
                            remove(74, 4),
                            remove(74, 8),
                        ],
                    },
                ]
            }
        }
        Technique::XWing => {
            const {
                [
                    // HoDoKu library line 519
                    PracticeExample {
                        givens: "900000000000000703700096248600020470000000005000040006420008600507100000001000002",
                        entries: Some(
                            "000000561006010090010000000000001009000000000000000000000050017000002004000000050",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(2, 3),
                            remove(3, 3),
                            remove(29, 3),
                            remove(30, 3),
                            remove(38, 3),
                            remove(39, 3),
                            remove(47, 3),
                            remove(48, 3),
                            remove(75, 3),
                        ],
                    },
                    // HoDoKu library line 520
                    PracticeExample {
                        givens: "600030000000000070035170800008060000407300200006000000000405001000098730000000090",
                        entries: Some(
                            "070800125180000000200000000000000000000000000000000000793020680541600002862713504",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(5, 9),
                            remove(14, 9),
                            remove(17, 9),
                            remove(32, 9),
                            remove(35, 9),
                            remove(50, 9),
                            remove(53, 9),
                        ],
                    },
                ]
            }
        }
        Technique::Skyscraper => {
            const {
                [
                    // naked-single practice grid
                    PracticeExample {
                        givens: "058400000094020000000100009216004030070615000080003400800790104009801372001502000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(72, 3)],
                    },
                    // HoDoKu library line 773
                    PracticeExample {
                        givens: "000280754090403800000000000039700280840000003050000070008001090000005002306000000",
                        entries: Some(
                            "163009000700000001480100000600014005007500000201008400520040007974800000010900548",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(42, 6),
                            remove(43, 6),
                            remove(48, 6),
                            remove(49, 6),
                        ],
                    },
                ]
            }
        }
        Technique::TwoStringKite => {
            const {
                [
                    // HoDoKu library line 786
                    PracticeExample {
                        givens: "061700005842095000050060400000000030025000000004100026000000000080000067200000349",
                        entries: Some(
                            "300000290000300671000201083108526004600000018030000500400610852500002100016857000",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(59, 9)],
                    },
                    // HoDoKu library line 787
                    PracticeExample {
                        givens: "081020000000000009006800040003100700008057916000000004500006092230008400000000000",
                        entries: Some(
                            "000000600042060080050000200690042058420300000175689320010030800000000060860200000",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(12, 5)],
                    },
                ]
            }
        }
        Technique::EmptyRectangle => {
            const {
                [
                    // HoDoKu library line 803
                    PracticeExample {
                        givens: "000003160020800000100946280800070090007000800090030001081265003000004050064300000",
                        entries: Some(
                            "008020000000000000000000000000000000000000000000008000000000000000000608500080012",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (0, 7),
                            (9, 3),
                            (11, 3),
                            (15, 7),
                            (15, 9),
                            (16, 7),
                        ])),
                        expected_actions: &[remove(44, 5)],
                    },
                    // HoDoKu library line 809
                    PracticeExample {
                        givens: "600000000300700520085206730400000050001050300070000008056408170013007004000000005",
                        entries: Some(
                            "027005001000081006100040009038179602060800007500000010000000003800500000700013000",
                        ),
                        eliminations: Some(&elimination_masks(&[(49, 2)])),
                        expected_actions: &[remove(79, 9)],
                    },
                ]
            }
        }
        Technique::WWing => {
            const {
                [
                    // HoDoKu library line 1388
                    PracticeExample {
                        givens: "100005800004000000070080650407000120000900006000000700003100009500090300000057068",
                        entries: Some(
                            "069000004850010902302409001090000000205070480608040090700000540006004017941300200",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(4, 3),
                            remove(32, 3),
                            remove(41, 3),
                            remove(50, 3),
                        ],
                    },
                    // HoDoKu library line 1389
                    PracticeExample {
                        givens: "000592400004160090082003000600300080000004700000070105007000006030000000506001000",
                        entries: Some(
                            "060000008050008000900740651070000004000000060000006000000000000000607000000000000",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(44, 9),
                            remove(60, 9),
                            remove(69, 9),
                            remove(78, 9),
                        ],
                    },
                ]
            }
        }
        Technique::XYWing => {
            const {
                [
                    // hidden-triple practice grid
                    PracticeExample {
                        givens: "400008305000060104007000060970001400500090001008500093090000500802030000306700008",
                        entries: Some(
                            "069170020285000070130050809003000050024000080610000000701000030040005017050010040",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(30, 6), remove(57, 6)],
                    },
                    // hidden-quadruple practice grid
                    PracticeExample {
                        givens: "800570290390000000000200000001000508000496000000800000209000001008000070560000082",
                        entries: Some(
                            "016003004002000000457009006940000060785000123623000040070000000130000000004000000",
                        ),
                        eliminations: Some(&elimination_masks(&[(50, 7), (60, 3), (69, 9)])),
                        expected_actions: &[remove(78, 3)],
                    },
                ]
            }
        }
        Technique::XYZWing => {
            const {
                [
                    // HoDoKu library line 1368
                    PracticeExample {
                        givens: "000020000008000004605003100040009060800060000020800010000204537030701200000000000",
                        entries: Some(
                            "403008609200000300000000028007000802050002703006007005060080000504090086782000001",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(12, 5), remove(14, 5)],
                    },
                    // naked-triple practice grid
                    PracticeExample {
                        givens: "501003700000078600000000058600900500005080100008005006190000000007420000004600807",
                        entries: Some(
                            "080260049009500000700194000073012084000006000010040000000807400800000000000000000",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(79, 3)],
                    },
                ]
            }
        }
        Technique::Swordfish => {
            const {
                [
                    // HoDoKu library line 532
                    PracticeExample {
                        givens: "031006005600007000000590000800100002700000003040003800127630000000001000008400300",
                        entries: Some(
                            "900240780085310004472008136053000000010000000200000000000000008304000000500000000",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(41, 9),
                            remove(42, 9),
                            remove(43, 9),
                            remove(52, 9),
                            remove(69, 9),
                            remove(70, 9),
                            remove(77, 9),
                            remove(79, 9),
                        ],
                    },
                    // HoDoKu library line 535
                    PracticeExample {
                        givens: "000000050046051800000900406030800000020300609417009000000068014200000008501000000",
                        entries: Some(
                            "000006000000000000150000000609005000805010000000620385003500200064100500080000060",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(4, 7),
                            remove(16, 7),
                            remove(31, 7),
                            remove(34, 7),
                            remove(76, 7),
                            remove(77, 7),
                        ],
                    },
                ]
            }
        }
        Technique::Jellyfish => {
            const {
                [
                    // HoDoKu library line 546
                    PracticeExample {
                        givens: "000000000000010000012304560000000000023000780047060120000000000031807640058000230",
                        entries: Some(
                            "000000000000000000000000000100000000000000000000000000000000000000000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (30, 4),
                            (30, 5),
                            (30, 9),
                            (31, 4),
                            (31, 5),
                            (31, 9),
                            (32, 5),
                            (32, 9),
                            (44, 4),
                            (50, 5),
                            (50, 9),
                        ])),
                        expected_actions: &[
                            remove(0, 9),
                            remove(3, 9),
                            remove(4, 9),
                            remove(5, 9),
                            remove(8, 9),
                            remove(9, 9),
                            remove(12, 9),
                            remove(14, 9),
                            remove(17, 9),
                            remove(35, 9),
                            remove(54, 9),
                            remove(57, 9),
                            remove(58, 9),
                            remove(59, 9),
                            remove(62, 9),
                        ],
                    },
                    // HoDoKu library line 548
                    PracticeExample {
                        givens: "040028071870600020000000000004800260001040900086002400000000000060009043130270090",
                        entries: Some(
                            "000000000000000004010407009000000000020006038000000010400060002000080000000004006",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (0, 3),
                            (18, 3),
                            (59, 1),
                            (60, 5),
                            (60, 8),
                            (63, 7),
                            (69, 5),
                        ])),
                        expected_actions: &[
                            remove(11, 5),
                            remove(15, 5),
                            remove(18, 5),
                            remove(20, 5),
                            remove(24, 5),
                            remove(27, 5),
                            remove(45, 5),
                            remove(48, 5),
                            remove(56, 5),
                            remove(57, 5),
                        ],
                    },
                ]
            }
        }
        Technique::FinnedXWing => {
            const {
                [
                    // HoDoKu library line 572
                    PracticeExample {
                        givens: "074000010000000407000007085000035870007906200065470000140800000908000000050000690",
                        entries: Some(
                            "000000002000001060000040000400000006000000054000000139006059723000760541700004008",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (0, 3),
                            (0, 8),
                            (3, 3),
                            (10, 3),
                            (13, 8),
                            (20, 9),
                            (28, 2),
                        ])),
                        expected_actions: &[remove(11, 2)],
                    },
                    // naked-single practice grid
                    PracticeExample {
                        givens: "058400000094020000000100009216004030070615000080003400800790104009801372001502000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(24, 5)],
                    },
                ]
            }
        }
        Technique::SashimiXWing => {
            const {
                [
                    // full-house practice grid
                    PracticeExample {
                        givens: "093021070020800036000300010730200104048107000102460000010780003500900700000510600",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(77, 3)],
                    },
                    // naked-single practice grid
                    PracticeExample {
                        givens: "058400000094020000000100009216004030070615000080003400800790104009801372001502000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(72, 3)],
                    },
                ]
            }
        }
        Technique::FinnedSwordfish => {
            const {
                [
                    // HoDoKu library line 578
                    PracticeExample {
                        givens: "000040009700012400000900000200000300000000006078400005329000000800029100406003800",
                        entries: Some(
                            "000000000090000060000060000000090000000200000000030000000184657057600000010000092",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(40, 5)],
                    },
                    // HoDoKu library line 579
                    PracticeExample {
                        givens: "003008600410050900000006010840300090020005430500100000000200000300080260000004500",
                        entries: Some(
                            "200010050006703082058020000000062005600800000030040826065000048004500000082600070",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(24, 7)],
                    },
                ]
            }
        }
        Technique::SashimiSwordfish => {
            const {
                [
                    // HoDoKu library line 630
                    PracticeExample {
                        givens: "008902700200600140000040000904200870000090000032001504000020000071009003005104900",
                        entries: Some(
                            "040010030000000000000000000000000000000400300000000090000000400400000000020000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (18, 3),
                            (56, 3),
                            (61, 6),
                            (62, 6),
                            (80, 6),
                        ])),
                        expected_actions: &[remove(25, 6)],
                    },
                    // HoDoKu library line 631
                    PracticeExample {
                        givens: "500740000900008000043190000207000030408030509090000201000073610000500008000084007",
                        entries: Some(
                            "080000003000300000000005002000009006000000070300007000820900000000000000100000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (2, 6),
                            (10, 1),
                            (11, 6),
                            (48, 6),
                            (68, 6),
                            (74, 6),
                        ])),
                        expected_actions: &[remove(10, 6)],
                    },
                ]
            }
        }
        Technique::FinnedJellyfish => {
            const {
                [
                    // HoDoKu library line 595
                    PracticeExample {
                        givens: "040200703082600000000001000090000000400027000000003061000005030065010000030000076",
                        entries: Some(
                            "601050000300070015000030600003106007016000300000000000020760100700300000100002500",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (21, 9),
                            (25, 9),
                            (26, 9),
                            (62, 9),
                            (68, 9),
                            (74, 9),
                        ])),
                        expected_actions: &[remove(62, 8)],
                    },
                    // HoDoKu library line 597
                    PracticeExample {
                        givens: "008274630200800100000000000000087040050000000006402000000000000004000578600009004",
                        entries: Some(
                            "000000000040000007760000482000000000407000820800000700070048060000000000080700010",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (13, 5),
                            (20, 1),
                            (21, 5),
                            (22, 5),
                            (29, 3),
                            (30, 1),
                            (30, 3),
                            (30, 9),
                            (35, 1),
                            (35, 3),
                            (35, 9),
                            (46, 1),
                            (54, 9),
                            (56, 3),
                            (56, 9),
                            (74, 3),
                        ])),
                        expected_actions: &[remove(46, 9)],
                    },
                ]
            }
        }
        Technique::SashimiJellyfish => {
            const {
                [
                    // HoDoKu library line 651
                    PracticeExample {
                        givens: "008902700200600140000040000904200870000090000032001504000020000071009003005104900",
                        entries: Some(
                            "040010030000000000000000000000000000000400300000000090000000400400000000020000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (18, 3),
                            (25, 6),
                            (56, 3),
                            (61, 6),
                            (62, 6),
                            (80, 6),
                        ])),
                        expected_actions: &[remove(24, 6)],
                    },
                    // HoDoKu library line 653
                    PracticeExample {
                        givens: "000207000018000005400000000080004102700000050000530000000060070045900020070012090",
                        entries: Some(
                            "059080010200049700007050289500790000004020000000000047000005000000070000000000500",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (47, 6),
                            (50, 1),
                            (56, 3),
                            (63, 3),
                        ])),
                        expected_actions: &[remove(42, 6), remove(44, 6), remove(51, 6)],
                    },
                ]
            }
        }
        Technique::SimpleColoring => {
            const {
                [
                    // HoDoKu library line 853
                    PracticeExample {
                        givens: "030700805597200000000000000000090507000060000000000083072003960040007000063800000",
                        entries: Some(
                            "200006090000080006600935070306000000750300009409570600800050000905600008100009750",
                        ),
                        eliminations: Some(&elimination_masks(&[(26, 4)])),
                        expected_actions: &[
                            remove(15, 1),
                            remove(16, 1),
                            remove(19, 1),
                            remove(20, 1),
                        ],
                    },
                    // HoDoKu library line 854
                    PracticeExample {
                        givens: "210000000000900004000407000000070032000600000048021006420009860009108000106000009",
                        entries: Some(
                            "004006000007002000000000000001800000002090000000000000000700001000060000080240000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (24, 9),
                            (25, 9),
                            (69, 3),
                            (69, 5),
                            (69, 7),
                            (70, 5),
                            (70, 7),
                            (71, 7),
                        ])),
                        expected_actions: &[remove(8, 3), remove(26, 3), remove(63, 3)],
                    },
                ]
            }
        }
        Technique::Medusa => {
            const {
                [
                    // full-house practice grid
                    PracticeExample {
                        givens: "093021070020800036000300010730200104048107000102460000010780003500900700000510600",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(15, 5), remove(24, 5), remove(26, 5)],
                    },
                    // naked-single practice grid
                    PracticeExample {
                        givens: "058400000094020000000100009216004030070615000080003400800790104009801372001502000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(22, 8), remove(31, 7), remove(53, 7)],
                    },
                ]
            }
        }
        Technique::XChain => {
            const {
                [
                    // HoDoKu library line 1081
                    PracticeExample {
                        givens: "003000902005090030602003008000050000301260090000308516410000020000005000000000600",
                        entries: Some(
                            "000580060000602000090000050000000203050000800000000000000006005000000000500000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (27, 9),
                            (28, 4),
                            (29, 9),
                            (30, 4),
                            (30, 7),
                            (32, 4),
                            (32, 7),
                            (45, 7),
                            (46, 4),
                            (56, 7),
                            (57, 7),
                            (63, 7),
                            (63, 8),
                            (73, 7),
                            (73, 8),
                            (76, 1),
                            (76, 4),
                            (76, 7),
                        ])),
                        expected_actions: &[remove(70, 7), remove(79, 7)],
                    },
                    // HoDoKu library line 1084
                    PracticeExample {
                        givens: "000000900006400205370005040000102000000000000004390020000008700152000008080013409",
                        entries: Some(
                            "005000000000000000000020006000000000000000000000000000000000012000000000607200050",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (0, 8),
                            (1, 1),
                            (37, 1),
                            (44, 1),
                            (45, 7),
                            (51, 1),
                            (51, 6),
                            (57, 9),
                            (58, 4),
                            (66, 6),
                            (67, 6),
                            (68, 6),
                        ])),
                        expected_actions: &[remove(24, 8)],
                    },
                ]
            }
        }
        Technique::XYChain => {
            const {
                [
                    // HoDoKu library line 1093
                    PracticeExample {
                        givens: "760000090000000000000425360006500200900102000000070009000006430049080002010007000",
                        entries: Some(
                            "002813504000769128090000007070098003000030000000604800007950001000301000000240980",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(43, 7), remove(69, 7)],
                    },
                    // HoDoKu library line 1095
                    PracticeExample {
                        givens: "070400690008200053600000000000000004000090500300000001200367000000000205106008400",
                        entries: Some(
                            "500001000940076100000000740009000300400003006005000900054000819000000060090520037",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(8, 2), remove(19, 2), remove(20, 2)],
                    },
                ]
            }
        }
        Technique::Aic => {
            const {
                [
                    // HoDoKu library line 1206
                    PracticeExample {
                        givens: "000000069080020130010000004000000000040009070067102900001000080300000000008670205",
                        entries: Some(
                            "200000000900000007700000020009000050000000000500030048600000003000000096490003010",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(2, 5),
                            remove(11, 5),
                            remove(20, 5),
                            remove(55, 5),
                            remove(64, 5),
                        ],
                    },
                    // HoDoKu library line 1209
                    PracticeExample {
                        givens: "000600504470509100000000000708003040000005000090018600031700290050000006200000000",
                        entries: Some(
                            "000000000000000000005040009010260905300970800502400000600054008000000000000006050",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(16, 3), remove(17, 3)],
                    },
                ]
            }
        }
        Technique::DiscontinuousNiceLoop => {
            const {
                [
                    // HoDoKu library line 1165
                    PracticeExample {
                        givens: "000060100027500006000004308400007980000050201000000000004000000061900024030001000",
                        entries: Some(
                            "040000002000000490000000000010000005000000000000000607000000013000000000000000069",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(48, 2)],
                    },
                    // HoDoKu library line 1166
                    PracticeExample {
                        givens: "100005800400200000002000470000006003000070910290000000004000200000048050000100080",
                        entries: Some(
                            "000400000000007000000000000000000000000000000000000000000000000020000000000000004",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(31, 1)],
                    },
                ]
            }
        }
        Technique::ContinuousNiceLoop => {
            const {
                [
                    // HoDoKu library line 1144
                    PracticeExample {
                        givens: "548000000030000800100000003072008600000000300000047009010300020256900000000060700",
                        entries: Some(
                            "000003000600000000020800000900030000400000000300000000704085906000070038893000000",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(3, 1),
                            remove(3, 2),
                            remove(7, 1),
                            remove(7, 7),
                            remove(12, 1),
                            remove(12, 2),
                            remove(12, 5),
                            remove(13, 9),
                            remove(14, 9),
                            remove(23, 9),
                            remove(25, 5),
                            remove(40, 9),
                            remove(77, 4),
                        ],
                    },
                    // HoDoKu library line 1146
                    PracticeExample {
                        givens: "600910520000007000000000000000000000500004016008600405040000100930860000005041380",
                        entries: Some(
                            "004000000000000600000006000406100000000000000000000000807000062001002754260700009",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(8, 8),
                            remove(12, 3),
                            remove(19, 7),
                            remove(21, 3),
                            remove(31, 2),
                            remove(32, 3),
                            remove(32, 9),
                            remove(40, 2),
                            remove(45, 3),
                            remove(46, 7),
                            remove(46, 9),
                            remove(58, 5),
                        ],
                    },
                ]
            }
        }
        Technique::GroupedAic => {
            const {
                [
                    // HoDoKu library line 1308
                    PracticeExample {
                        givens: "302000010000970000000000000500080600001500070080040000900001027010400000005007900",
                        entries: Some(
                            "000000000100000000000010000000100000000000000000700100000000000000000000000000001",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(1, 6),
                            remove(5, 6),
                            remove(8, 6),
                            remove(14, 6),
                            remove(21, 6),
                            remove(23, 6),
                        ],
                    },
                    // HoDoKu library line 1309
                    PracticeExample {
                        givens: "002430900030700015190000020200000006940000000000000740309000000600010000080500690",
                        entries: Some(
                            "050001060006000000000000000000000000000000000560000009000000000005000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (13, 8),
                            (14, 8),
                            (20, 8),
                            (24, 8),
                            (26, 8),
                            (39, 2),
                            (40, 2),
                            (41, 2),
                            (62, 7),
                            (71, 7),
                            (76, 4),
                            (77, 4),
                            (80, 4),
                            (80, 7),
                        ])),
                        expected_actions: &[remove(29, 1), remove(38, 1)],
                    },
                ]
            }
        }
        Technique::GroupedDiscontinuousNiceLoop => {
            const {
                [
                    // HoDoKu library line 1264
                    PracticeExample {
                        givens: "000070090429050001600000000001004020950063000000800000006005000030201007000000004",
                        entries: Some(
                            "000000000000000000000000000000590000002000008000000009000000000000000960000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (6, 5),
                            (22, 3),
                            (22, 4),
                            (22, 8),
                            (24, 5),
                            (24, 7),
                            (25, 5),
                            (25, 7),
                            (51, 4),
                            (52, 4),
                            (57, 3),
                            (57, 4),
                            (72, 5),
                            (74, 5),
                            (75, 3),
                            (77, 8),
                        ])),
                        expected_actions: &[remove(58, 3)],
                    },
                    // HoDoKu library line 1265
                    PracticeExample {
                        givens: "400003000008000000160094000000000000700051964501200008050000400000002095310040600",
                        entries: Some(
                            "000000000000000040000000000000400000000000000040069000000000000004000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (8, 1),
                            (8, 2),
                            (8, 7),
                            (17, 1),
                            (17, 2),
                            (17, 3),
                            (17, 7),
                            (27, 2),
                            (28, 2),
                            (29, 2),
                            (33, 3),
                            (33, 7),
                            (34, 3),
                            (34, 7),
                            (35, 3),
                            (35, 7),
                        ])),
                        expected_actions: &[remove(54, 6)],
                    },
                ]
            }
        }
        Technique::GroupedContinuousNiceLoop => {
            const {
                [
                    // HoDoKu library line 1244
                    PracticeExample {
                        givens: "002430900030700015190000020200000006940000000000000740309000000600010000080500690",
                        entries: Some(
                            "050001060006000000000000000000000000000000000560000009000000000005000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (13, 8),
                            (14, 8),
                            (20, 8),
                            (24, 8),
                            (26, 8),
                            (39, 2),
                            (40, 2),
                            (41, 2),
                            (62, 7),
                            (71, 7),
                            (76, 4),
                            (77, 4),
                            (80, 4),
                            (80, 7),
                        ])),
                        expected_actions: &[
                            remove(29, 1),
                            remove(38, 1),
                            remove(48, 3),
                            remove(48, 8),
                            remove(58, 2),
                            remove(59, 2),
                            remove(68, 2),
                            remove(80, 3),
                        ],
                    },
                    // HoDoKu library line 1246
                    PracticeExample {
                        givens: "000000000430010709605400800000027030093604210020930000004006102207040053000000000",
                        entries: Some(
                            "000760345000000060070093021040000906000000000006000504050000000000009600060000400",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (0, 1),
                            (72, 8),
                            (72, 9),
                            (74, 8),
                            (75, 1),
                            (75, 8),
                            (77, 8),
                        ])),
                        expected_actions: &[remove(2, 8), remove(14, 2), remove(75, 5)],
                    },
                ]
            }
        }
        Technique::UniqueRectangle1 => {
            const {
                [
                    // HoDoKu library line 882
                    PracticeExample {
                        givens: "000300108050400090390060007034200000000000000960030001008710005000002000040608000",
                        entries: Some(
                            "470000000800000000000800400100080509285100034007504000620003940513940006709050010",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(15, 2), remove(15, 3)],
                    },
                    // HoDoKu library line 883
                    PracticeExample {
                        givens: "007040032000000700000910600830769400500008000000024000080000001003000000900000064",
                        entries: Some(
                            "190806500008050019352007048001000025024130976009500183006400000000600007005000000",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(77, 2), remove(77, 3)],
                    },
                ]
            }
        }
        Technique::UniqueRectangle2 => {
            const {
                [
                    // HoDoKu library line 903
                    PracticeExample {
                        givens: "090002000600400003005006280000800004010000000000027000000003410006504302009010076",
                        entries: Some(
                            "000050640000080050000000000000000000000040000004000000000000008180070090000208500",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(0, 7),
                            remove(2, 7),
                            remove(10, 7),
                            remove(11, 7),
                            remove(21, 7),
                            remove(26, 7),
                        ],
                    },
                    // HoDoKu library line 904
                    PracticeExample {
                        givens: "309005000000360000045000000010000803400090000008700016056800001000000002104930005",
                        entries: Some(
                            "000400008001009004600280009702000090063108007590023400000000000037000000000000000",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(6, 7),
                            remove(7, 7),
                            remove(10, 7),
                            remove(24, 7),
                            remove(25, 7),
                        ],
                    },
                ]
            }
        }
        Technique::UniqueRectangle3 => {
            const {
                [
                    // HoDoKu library line 928
                    PracticeExample {
                        givens: "080030100000002300006400075309020000020501080007040002700600000000000800540000007",
                        entries: Some(
                            "002705000075060008030000200000800000604000003800000000090000020260000000000200000",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(70, 4),
                            remove(70, 9),
                            remove(79, 6),
                            remove(79, 9),
                        ],
                    },
                    // HoDoKu library line 929
                    PracticeExample {
                        givens: "080000090000028300003906540400090000000000020000800000006030805307000000005409700",
                        entries: Some(
                            "501000206694500071270010008052000080008050000009002050940207010020185060810060032",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(41, 1), remove(41, 3)],
                    },
                ]
            }
        }
        Technique::UniqueRectangle4 => {
            const {
                [
                    // HoDoKu library line 951
                    PracticeExample {
                        givens: "000070204810090300507000000000002001003801900900600000000000508008020013709010000",
                        entries: Some(
                            "396105080004206000020080169005900000200000000001007000102760090000009700000008000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (34, 4),
                            (49, 4),
                            (52, 4),
                            (73, 4),
                            (73, 6),
                            (75, 4),
                        ])),
                        expected_actions: &[remove(28, 4), remove(33, 4)],
                    },
                    // HoDoKu library line 944
                    PracticeExample {
                        givens: "000000000000309000000007149000000031020008904096070008008000000032600000000900720",
                        entries: Some(
                            "009406380000000560060800000000294600000560070400103250950732416700041895600085003",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(10, 1), remove(11, 1)],
                    },
                ]
            }
        }
        Technique::UniqueRectangle5 => {
            const {
                [
                    // HoDoKu library line 974
                    PracticeExample {
                        givens: "750080001209603080008000900000004370000020000093800000005000200080205703400030059",
                        entries: Some(
                            "000902030000000507000057000800590006600301895500076000000009008900000000000008000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (19, 1),
                            (25, 4),
                            (52, 4),
                            (55, 1),
                            (58, 1),
                            (70, 1),
                            (73, 1),
                            (74, 1),
                        ])),
                        expected_actions: &[remove(57, 1)],
                    },
                    // HoDoKu library line 969
                    PracticeExample {
                        givens: "024060018000000000000930000000006300062400001007050000000890700006040085001000003",
                        entries: Some(
                            "300507900009008030008004050005700009900083570030009800003001000790302100000675090",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (9, 1),
                            (10, 1),
                            (15, 2),
                            (17, 2),
                            (17, 6),
                            (26, 6),
                            (62, 4),
                        ])),
                        expected_actions: &[remove(34, 4)],
                    },
                ]
            }
        }
        Technique::UniqueRectangle6 => {
            const {
                [
                    // HoDoKu library line 981
                    PracticeExample {
                        givens: "073000000000030000008000201000700806000628403200004050509000000040000000000512300",
                        entries: Some(
                            "100280064400106000600000030934051020700000090086390107000003000300000000867000049",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(58, 6), remove(69, 6)],
                    },
                    // HoDoKu library line 982
                    PracticeExample {
                        givens: "006005000020107069000003000008000694600040000100000008000900430002508001310000080",
                        entries: Some(
                            "030000007504080300001000005200301000090802003043009000000016002460030970009004506",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(7, 4), remove(21, 4)],
                    },
                ]
            }
        }
        Technique::HiddenRectangle => {
            const {
                [
                    // HoDoKu library line 997
                    PracticeExample {
                        givens: "090002100000730020520000008103047000000060030800000005706804000900000000001000004",
                        entries: Some(
                            "304680057618005409007400360050000006470508001060000740030000002045000003280000000",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(50, 9)],
                    },
                    // HoDoKu library line 999
                    PracticeExample {
                        givens: "879000000205900003010000000360870210900410000000003000000200000000367001000000059",
                        entries: Some(
                            "000030000040080000603700000004009005050000030180000000431095000598000420726148300",
                        ),
                        eliminations: None,
                        expected_actions: &[remove(6, 6)],
                    },
                ]
            }
        }
        Technique::BugPlusOne => {
            const {
                [
                    // HoDoKu library line 1057
                    PracticeExample {
                        givens: "000013000000200009301840200968000020037900010000004000000000008009035070010060000",
                        entries: Some(
                            "090600084000057130000009000000571403400026805100380000000192000000400601500708002",
                        ),
                        eliminations: None,
                        expected_actions: &[place(56, 4)],
                    },
                    // HoDoKu library line 1058
                    PracticeExample {
                        givens: "000502001000010080800000400000000030941300807780050600000000000075009002008700000",
                        entries: Some(
                            "437080960009407203012693075006978104000026050003104029004205708000800300000001506",
                        ),
                        eliminations: None,
                        expected_actions: &[place(54, 6)],
                    },
                ]
            }
        }
        Technique::WxyzWing => {
            const {
                [
                    // naked-single practice grid
                    PracticeExample {
                        givens: "058400000094020000000100009216004030070615000080003400800790104009801372001502000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(36, 9), remove(48, 9), remove(52, 9)],
                    },
                    // locked-pair practice grid
                    PracticeExample {
                        givens: "970500060000007103800040000000080900685000000100003002000000000000600057008090200",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(2, 4), remove(16, 4)],
                    },
                ]
            }
        }
        Technique::AlignedPairExclusion => {
            const {
                [
                    PracticeExample {
                        givens: "030402000200016004010700003001000078009840100000020005600005000145000080007004500",
                        entries: Some(
                            "706090851058300790904058000400500000500007030873001000002000000000000000300000000",
                        ),
                        eliminations: Some(&elimination_masks(&[(60, 9), (69, 9)])),
                        expected_actions: &[remove(57, 9)],
                    },
                    PracticeExample {
                        givens: "400608003080090040003407100708000409060000070504000208005201600010060050600905001",
                        entries: Some(
                            "000000000006000000000000086000000000000800305000000000000000000000000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (1, 9),
                            (2, 2),
                            (2, 9),
                            (6, 7),
                            (39, 1),
                            (40, 1),
                            (54, 9),
                            (55, 3),
                            (63, 2),
                            (63, 9),
                            (73, 3),
                        ])),
                        expected_actions: &[remove(76, 3)],
                    },
                ]
            }
        }
        Technique::AlignedTripletExclusion => {
            const {
                [
                    PracticeExample {
                        givens: "090640010040007360050010070000204000600070000000061800020730080008000734009000000",
                        entries: Some(
                            "000000000000000000006000400000000000000000000000000000000000900560100000000400000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (5, 5),
                            (17, 5),
                            (27, 1),
                            (27, 8),
                            (28, 3),
                            (28, 7),
                            (29, 1),
                            (35, 9),
                            (37, 3),
                            (38, 1),
                            (44, 9),
                            (53, 9),
                            (60, 1),
                            (62, 1),
                            (62, 9),
                            (72, 1),
                            (73, 1),
                            (76, 2),
                            (77, 2),
                        ])),
                        expected_actions: &[remove(38, 3)],
                    },
                    PracticeExample {
                        givens: "560040000000130000000000670000200500008001209900000800140060050007010000380000400",
                        entries: Some(
                            "000000100000006905000000000000000000000000000000000000000000700000000300000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (2, 2),
                            (19, 2),
                            (20, 2),
                            (20, 4),
                            (22, 5),
                            (26, 2),
                            (31, 7),
                            (32, 3),
                            (32, 4),
                            (32, 7),
                            (39, 5),
                            (39, 7),
                            (48, 5),
                            (48, 7),
                            (50, 5),
                            (50, 7),
                            (70, 2),
                            (76, 5),
                            (76, 7),
                        ])),
                        expected_actions: &[remove(64, 9)],
                    },
                ]
            }
        }
        Technique::Tridagon => {
            const {
                [
                    // Philip Newman's depth-three collection, line 13764.
                    PracticeExample {
                        givens: "000400780007180206000070014000601807000047021710820000530000000004260000900000000",
                        entries: Some(
                            "000000000000000000000000000000000000000000000000000000000000000070000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (5, 3),
                            (5, 5),
                            (5, 9),
                            (23, 3),
                            (23, 5),
                            (23, 9),
                            (34, 4),
                            (52, 3),
                            (52, 5),
                            (52, 9),
                            (61, 9),
                            (62, 9),
                            (71, 8),
                            (79, 3),
                            (79, 5),
                            (80, 3),
                            (80, 5),
                        ])),
                        expected_actions: &[place(42, 6)],
                    },
                    // Philip Newman's depth-three collection, line 96342.
                    PracticeExample {
                        givens: "120406089000089000090210004010000800600108900980024600060000478000842096040000205",
                        entries: Some(
                            "000000000406000000008000060000000000000000000000000000000000000000000000809000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (16, 3),
                            (16, 5),
                            (17, 7),
                            (25, 5),
                            (29, 3),
                            (29, 5),
                            (29, 7),
                            (30, 3),
                            (30, 5),
                            (30, 7),
                            (31, 3),
                            (31, 5),
                            (31, 7),
                            (38, 3),
                            (38, 7),
                            (43, 2),
                            (43, 3),
                            (52, 3),
                            (54, 5),
                            (56, 3),
                            (56, 5),
                            (72, 3),
                            (72, 7),
                            (74, 1),
                            (74, 3),
                            (74, 7),
                            (75, 3),
                            (77, 3),
                        ])),
                        expected_actions: &[place(27, 2)],
                    },
                ]
            }
        }
        Technique::TridagonForcingNet => {
            const {
                [
                    // Philip Newman's depth-three collection, line 66643.
                    PracticeExample {
                        givens: "100056009050109006090270000270000800000500900510000340700602090001090600900710000",
                        entries: Some(
                            "000000000000000000600000000000000000000000000000000000000000000000000000060000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (2, 4),
                            (2, 8),
                            (6, 2),
                            (7, 7),
                            (11, 3),
                            (11, 4),
                            (11, 8),
                            (16, 7),
                            (18, 3),
                            (18, 4),
                            (24, 4),
                            (26, 5),
                            (29, 3),
                            (37, 6),
                            (40, 3),
                            (40, 4),
                            (40, 8),
                            (41, 3),
                            (41, 8),
                            (43, 2),
                            (47, 8),
                            (60, 4),
                            (64, 3),
                            (64, 8),
                            (68, 3),
                            (68, 4),
                            (70, 3),
                            (70, 5),
                            (70, 8),
                            (71, 2),
                            (73, 2),
                            (73, 3),
                            (73, 4),
                            (78, 5),
                            (80, 2),
                            (80, 5),
                        ])),
                        expected_actions: &[remove(26, 1)],
                    },
                    // Philip Newman's depth-three collection, line 89460.
                    PracticeExample {
                        givens: "120000009000000200860000045206310000010807000078000013600038000780201300030670800",
                        entries: Some(
                            "000000000000000000000000000000000000000000000000000000000000000000000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (4, 6),
                            (12, 5),
                            (12, 9),
                            (33, 7),
                            (34, 5),
                            (34, 9),
                            (35, 4),
                            (40, 2),
                            (49, 9),
                            (50, 4),
                            (50, 5),
                            (50, 9),
                            (56, 4),
                            (56, 5),
                            (56, 9),
                            (74, 4),
                            (74, 5),
                            (74, 9),
                        ])),
                        expected_actions: &[place(50, 2)],
                    },
                ]
            }
        }
        Technique::ForcingChain => {
            const {
                [
                    // full-house practice grid
                    PracticeExample {
                        givens: "093021070020800036000300010730200104048107000102460000010780003500900700000510600",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(0, 6)],
                    },
                    // naked-single practice grid
                    PracticeExample {
                        givens: "058400000094020000000100009216004030070615000080003400800790104009801372001502000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(4, 7)],
                    },
                ]
            }
        }
        Technique::ForcingNet => {
            const {
                [
                    // full-house practice grid
                    PracticeExample {
                        givens: "093021070020800036000300010730200104048107000102460000010780003500900700000510600",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(6, 5)],
                    },
                    // naked-single practice grid
                    PracticeExample {
                        givens: "058400000094020000000100009216004030070615000080003400800790104009801372001502000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(0, 3)],
                    },
                ]
            }
        }
        Technique::DynamicForcingNet => {
            const {
                [
                    PracticeExample {
                        givens: "000200000805310000201000008049060800000902000002030540700000901000078403000001000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[place(59, 3)],
                    },
                    // The version 10 default solver's first stalled position on AI Escargot.
                    PracticeExample {
                        eliminations: Some(&elimination_masks(&[
                            (57, 9),
                            (59, 9),
                            (75, 9),
                            (77, 9),
                        ])),
                        expected_actions: &[remove(68, 2)],
                        ..super::FORCING_NET
                    },
                ]
            }
        }
        Technique::NestedForcingNet => {
            const {
                [
                    PracticeExample {
                        expected_actions: &[remove(52, 7)],
                        ..super::FORCING_NET
                    },
                    // Easter Monster
                    PracticeExample {
                        givens: "100000002090400050006000700050903000000070000000850040700000600030009080002000001",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[remove(18, 2)],
                    },
                ]
            }
        }
        Technique::AlsXz => {
            const {
                [
                    // HoDoKu library line 1406
                    PracticeExample {
                        givens: "024060000507409010000000000000090070400008503008007060000000046006003007050700100",
                        entries: Some(
                            "000000700000000000000070000005004801070600000000000000700000000040000050000046000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (3, 3),
                            (8, 8),
                            (13, 2),
                            (21, 1),
                            (24, 2),
                            (24, 9),
                            (25, 2),
                            (25, 9),
                            (26, 2),
                            (26, 8),
                            (53, 2),
                            (55, 3),
                            (55, 9),
                            (56, 9),
                            (57, 2),
                            (72, 2),
                            (72, 8),
                            (80, 9),
                        ])),
                        expected_actions: &[remove(15, 3)],
                    },
                    // HoDoKu library line 1407
                    PracticeExample {
                        givens: "000000000200000349500039260090000000004100080000598004001820006000000700003006000",
                        entries: Some(
                            "000000000000000000000000000000000000000000900000000000000000000000000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (0, 1),
                            (0, 7),
                            (0, 8),
                            (1, 1),
                            (1, 7),
                            (1, 8),
                            (2, 7),
                            (2, 8),
                            (3, 7),
                            (4, 5),
                            (4, 7),
                            (5, 5),
                            (5, 7),
                            (10, 7),
                            (13, 6),
                            (13, 7),
                            (14, 7),
                            (26, 7),
                            (27, 3),
                            (30, 7),
                            (34, 3),
                            (46, 1),
                            (71, 5),
                            (75, 7),
                        ])),
                        expected_actions: &[remove(37, 7)],
                    },
                ]
            }
        }
        Technique::AlsXyWing => {
            const {
                [
                    // HoDoKu library line 1427
                    PracticeExample {
                        givens: "000043000000050008072100000090000000005000010180300000000001067007009100300065920",
                        entries: Some(
                            "800000001031007000000000000003510000000000000000000000000000000000000000018700004",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (27, 4),
                            (33, 2),
                            (36, 4),
                            (39, 2),
                            (39, 4),
                            (39, 8),
                            (40, 2),
                            (42, 2),
                            (49, 2),
                            (51, 2),
                            (54, 4),
                            (57, 2),
                            (58, 8),
                            (63, 4),
                            (66, 2),
                            (67, 8),
                        ])),
                        expected_actions: &[remove(52, 7)],
                    },
                    // HoDoKu library line 1428
                    PracticeExample {
                        givens: "900007068020000903004000000200000400060080002803900710000005097307600001000000000",
                        entries: Some(
                            "000000000700000040000000075070000089009700000000000006000000000000000000500070004",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (3, 1),
                            (3, 5),
                            (4, 1),
                            (4, 5),
                            (11, 1),
                            (11, 5),
                            (21, 1),
                            (22, 1),
                            (23, 1),
                            (41, 3),
                            (56, 1),
                            (60, 2),
                            (69, 2),
                            (74, 1),
                            (78, 2),
                        ])),
                        expected_actions: &[remove(12, 8)],
                    },
                ]
            }
        }
        Technique::AlsChain => {
            const {
                [
                    // HoDoKu library line 1446
                    PracticeExample {
                        givens: "000030000000200057700000810109005000060004030000082000008700004400000080037001500",
                        entries: Some(
                            "001007000000018000000000000000360000000070000000000000000000000000000700000840000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (1, 2),
                            (1, 4),
                            (3, 9),
                            (19, 9),
                            (20, 5),
                            (21, 9),
                            (26, 9),
                            (60, 2),
                            (60, 6),
                            (60, 9),
                            (64, 5),
                            (66, 9),
                            (71, 2),
                            (71, 6),
                            (71, 9),
                        ])),
                        expected_actions: &[
                            remove(0, 6),
                            remove(0, 9),
                            remove(1, 9),
                            remove(15, 9),
                        ],
                    },
                    // HoDoKu library line 1447
                    PracticeExample {
                        givens: "000000000030070809800003150908142000000000000500600040104200000000700006080005310",
                        entries: Some(
                            "000800000000500000000000000000000000000350000003000000000030000300000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (1, 4),
                            (1, 6),
                            (1, 7),
                            (2, 6),
                            (5, 9),
                            (20, 9),
                            (55, 5),
                            (68, 9),
                            (69, 5),
                            (69, 9),
                        ])),
                        expected_actions: &[remove(2, 1), remove(2, 2), remove(2, 7)],
                    },
                ]
            }
        }
        Technique::SueDeCoq => {
            const {
                [
                    // HoDoKu library line 1491
                    PracticeExample {
                        givens: "004000097650000021910007304201030000503206000000000000000600000000174600700090010",
                        entries: Some(
                            "320861500007943800008520060000400000000000000400700000100000000800000000000300000",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(35, 8),
                            remove(35, 9),
                            remove(53, 8),
                            remove(53, 9),
                            remove(60, 2),
                            remove(60, 4),
                            remove(61, 3),
                            remove(61, 4),
                            remove(61, 5),
                        ],
                    },
                    // HoDoKu library line 1493
                    PracticeExample {
                        givens: "010000049009315068000000500000096000000400020030000000060007800000040006705030004",
                        entries: Some(
                            "500000000000000000000904000000000000000003000000000000000000000000000000000600000",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(33, 3),
                            remove(33, 7),
                            remove(42, 7),
                            remove(51, 7),
                            remove(61, 1),
                            remove(61, 9),
                            remove(62, 1),
                            remove(70, 1),
                            remove(70, 9),
                        ],
                    },
                ]
            }
        }
        Technique::DeathBlossom => {
            const {
                [
                    // HoDoKu library line 1464
                    PracticeExample {
                        givens: "800400600502000700030007020028070000000306000000010540010700030009000802007003004",
                        entries: Some(
                            "071000000040000000906850401000000300000000200003200000000000900300000070080000100",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (4, 9),
                            (8, 9),
                            (12, 9),
                            (17, 9),
                            (27, 6),
                            (32, 9),
                            (34, 9),
                            (43, 9),
                            (44, 9),
                            (53, 6),
                            (58, 4),
                            (58, 6),
                            (59, 4),
                            (66, 5),
                            (75, 6),
                        ])),
                        expected_actions: &[remove(50, 9)],
                    },
                    // HoDoKu library line 1465
                    PracticeExample {
                        givens: "186005000000030100000009005870000300630080052009000067200700000003090000000600714",
                        entries: Some(
                            "000070000000000000300000000000000001000007000000300800000000000700000000008023000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (11, 4),
                            (14, 8),
                            (16, 8),
                            (16, 9),
                            (17, 9),
                            (20, 4),
                            (21, 2),
                            (21, 4),
                            (22, 4),
                            (29, 4),
                            (50, 4),
                            (55, 4),
                            (55, 5),
                            (55, 9),
                            (56, 5),
                            (59, 4),
                            (62, 6),
                            (62, 8),
                            (64, 5),
                            (66, 8),
                        ])),
                        expected_actions: &[remove(66, 1)],
                    },
                ]
            }
        }
        Technique::Exocet => {
            const {
                [
                    // HoDoKu library line 265
                    PracticeExample {
                        givens: "007000000300649700609508000000002035002000400590300000000906104005214003000000600",
                        entries: Some(
                            "000123500051000000020070341006400000030000000004000200000000000060000000000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (7, 8),
                            (8, 8),
                            (43, 7),
                            (52, 7),
                            (72, 7),
                            (73, 7),
                            (79, 7),
                            (80, 7),
                        ])),
                        expected_actions: &[remove(27, 8)],
                    },
                    // HoDoKu library line 287
                    PracticeExample {
                        givens: "008000000004062000930870600003058040001000800080320700009037018000280500000000200",
                        entries: Some(
                            "000003020000000380002000050000000002000006035405000000000600400300000000800005003",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (1, 1),
                            (10, 1),
                            (64, 6),
                            (71, 7),
                            (73, 6),
                        ])),
                        expected_actions: &[
                            remove(52, 9),
                            remove(64, 7),
                            remove(68, 9),
                            remove(70, 6),
                            remove(70, 7),
                            remove(71, 9),
                            remove(79, 9),
                        ],
                    },
                ]
            }
        }
        Technique::SkLoop => {
            const {
                [
                    // HoDoKu library line 521
                    PracticeExample {
                        givens: "900062700005003000000000006700030000000009000802045009003501028040000005010000000",
                        entries: Some(
                            "080000053060000000327050000090000500050000000030000000670090400209087000508020007",
                        ),
                        eliminations: None,
                        expected_actions: &[
                            remove(3, 1),
                            remove(12, 1),
                            remove(15, 1),
                            remove(16, 1),
                            remove(30, 1),
                            remove(34, 1),
                            remove(39, 1),
                            remove(42, 1),
                            remove(43, 1),
                        ],
                    },
                    // HoDoKu library line 554
                    PracticeExample {
                        givens: "006035009251800600003000200160000000700391008000000021002000100007004352300560800",
                        entries: Some(
                            "800200010000009000000000085000028000020000060038050000500003006600000000010002007",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (16, 4),
                            (21, 4),
                            (21, 7),
                            (22, 7),
                            (29, 4),
                            (33, 4),
                            (33, 7),
                            (34, 4),
                            (34, 9),
                            (48, 7),
                        ])),
                        expected_actions: &[remove(19, 4), remove(51, 4)],
                    },
                ]
            }
        }
        Technique::MultiSectorLockedSets => {
            const {
                [
                    // full-house practice grid
                    PracticeExample {
                        givens: "093021070020800036000300010730200104048107000102460000010780003500900700000510600",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[
                            remove(0, 6),
                            remove(40, 9),
                            remove(42, 9),
                            remove(43, 9),
                            remove(44, 9),
                            remove(54, 4),
                            remove(54, 6),
                            remove(72, 4),
                            remove(72, 8),
                        ],
                    },
                    // naked-single practice grid
                    PracticeExample {
                        givens: "058400000094020000000100009216004030070615000080003400800790104009801372001502000",
                        entries: None,
                        eliminations: None,
                        expected_actions: &[
                            remove(0, 3),
                            remove(4, 3),
                            remove(9, 3),
                            remove(36, 9),
                            remove(52, 2),
                        ],
                    },
                ]
            }
        }
        Technique::FrankenFish => {
            const {
                [
                    // HoDoKu library line 673
                    PracticeExample {
                        givens: "520006170174053600609271005005020006090760010006030004007592361352610907961307050",
                        entries: None,
                        eliminations: Some(&elimination_masks(&[
                            (3, 8),
                            (8, 8),
                            (16, 9),
                            (28, 8),
                            (30, 8),
                            (30, 9),
                            (41, 8),
                            (45, 8),
                            (48, 9),
                            (50, 8),
                            (51, 8),
                            (52, 8),
                        ])),
                        expected_actions: &[remove(55, 8)],
                    },
                    // HoDoKu library line 677
                    PracticeExample {
                        givens: "006700091009000062300000000000030004007200010400001000031008075000900000065000030",
                        entries: Some(
                            "000000300000300000000000040000000000000000003003000000000000000004053106000000000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (27, 9),
                            (33, 5),
                            (33, 8),
                            (36, 9),
                            (42, 5),
                            (49, 6),
                            (51, 5),
                            (58, 4),
                            (72, 7),
                            (76, 4),
                            (77, 4),
                            (78, 8),
                        ])),
                        expected_actions: &[
                            remove(19, 8),
                            remove(22, 8),
                            remove(24, 8),
                            remove(27, 8),
                            remove(28, 8),
                            remove(46, 8),
                            remove(49, 8),
                            remove(51, 8),
                        ],
                    },
                ]
            }
        }
        Technique::MutantFish => {
            const {
                [
                    // HoDoKu library line 750
                    PracticeExample {
                        givens: "000027030001640000090000000030900028008000600005001300000008050000003962200000001",
                        entries: Some(
                            "000000009300009200002005006100000000900002010020000090009200003000000000003090000",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (33, 4),
                            (55, 7),
                            (63, 7),
                            (64, 7),
                            (73, 7),
                            (73, 8),
                        ])),
                        expected_actions: &[remove(6, 4)],
                    },
                    // HoDoKu library line 751
                    PracticeExample {
                        givens: "000000240000000100000327080706800000003409600010000000097001035120730060000098000",
                        entries: Some(
                            "000100000000900000001000000000000090000000000000000000000200000000000000000000700",
                        ),
                        eliminations: Some(&elimination_masks(&[
                            (1, 5),
                            (1, 8),
                            (2, 8),
                            (4, 6),
                            (9, 4),
                            (10, 4),
                            (11, 4),
                            (13, 6),
                            (32, 5),
                            (35, 3),
                            (44, 2),
                            (45, 5),
                            (47, 5),
                            (50, 5),
                            (50, 6),
                            (53, 3),
                            (54, 4),
                            (65, 4),
                            (80, 4),
                        ])),
                        expected_actions: &[remove(73, 5)],
                    },
                ]
            }
        }
    }
}
