use super::{PracticeExample, Technique, place};

// Positions from solved prefixes of independent Sudoku Exchange puzzles.
// The original grids are public domain in the pinned Sudoku Exchange puzzle bank.
const HIDDEN_TRIPLE: [PracticeExample; 3] = [
    PracticeExample {
        givens: "376010502001070008500003079009060000760124095000090600150200006200050400607080253",
        entries: None,
        eliminations: None,
        expected_actions: &[place(38, 3)],
    },
    PracticeExample {
        givens: "361400000020185063005360104090020481016903270247050090002016800170538040000004010",
        entries: None,
        eliminations: None,
        expected_actions: &[place(7, 5)],
    },
    PracticeExample {
        givens: "000008050680075010002130700850000900047000620001000078005062100060710032010400000",
        entries: None,
        eliminations: None,
        expected_actions: &[place(41, 1)],
    },
];

const HIDDEN_PAIR: [PracticeExample; 3] = [
    PracticeExample {
        givens: "376010502001572068500603179009060000760124095000090600150200006200050400607080253",
        entries: None,
        eliminations: None,
        expected_actions: &[place(70, 1)],
    },
    PracticeExample {
        givens: "361400008020185063005360104090020481016903270247050090002016800170538040000004010",
        entries: None,
        eliminations: None,
        expected_actions: &[place(7, 5)],
    },
    PracticeExample {
        givens: "170008050680075010502130780856007900047001620001000078005062100060710032010400000",
        entries: None,
        eliminations: None,
        expected_actions: &[place(77, 3)],
    },
];

const CLAIMING: [PracticeExample; 3] = [
    PracticeExample {
        givens: "361400008020185063085360104593620481816943275247851090002016800170538040000004010",
        entries: None,
        eliminations: None,
        expected_actions: &[place(4, 7)],
    },
    PracticeExample {
        givens: "170608050680075010592134786856007901047081625021506378735862100468719532219453000",
        entries: None,
        eliminations: None,
        expected_actions: &[place(62, 4)],
    },
    PracticeExample {
        givens: "037000490029000080000936000000314000500208009002090600008000900200000005900645001",
        entries: None,
        eliminations: None,
        expected_actions: &[place(15, 5)],
    },
];

const POINTING: [PracticeExample; 3] = [
    PracticeExample {
        givens: "037000490029000080000936000000314000500208009002090600008000900200000005900645001",
        entries: None,
        eliminations: None,
        expected_actions: &[place(15, 5)],
    },
    PracticeExample {
        givens: "001483000063000498840600312608104200900800007304502009430008050085000920000740600",
        entries: None,
        eliminations: None,
        expected_actions: &[place(9, 5)],
    },
    PracticeExample {
        givens: "604800031298400060000006040003908026006050000982604300029140000060087594840069003",
        entries: None,
        eliminations: None,
        expected_actions: &[place(41, 2)],
    },
];

pub(super) const fn examples(technique: Technique) -> [PracticeExample; 3] {
    match technique {
        Technique::DirectHiddenTriple => HIDDEN_TRIPLE,
        Technique::DirectHiddenPair => HIDDEN_PAIR,
        Technique::DirectClaiming => CLAIMING,
        Technique::DirectPointing => POINTING,
        _ => unreachable!(),
    }
}
