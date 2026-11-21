use super::*;
use crate::{CELLS, PuzzleRule, RegionLayout, VariantHouseKind, VariantPuzzle, parse_givens};

fn literal_support(domains: &[u16]) -> Option<(u16, [u16; 9])> {
    fn visit(
        domains: &[u16],
        tuple: &mut [u8; 4],
        depth: usize,
        result: &mut Option<(u16, [u16; 9])>,
    ) {
        if depth == domains.len() {
            let mut values = tuple[..depth].to_vec();
            values.sort_unstable();
            if values.windows(2).any(|pair| pair[1] != pair[0] + 1) {
                return;
            }
            let (required, supported) = result.get_or_insert((DIGITS, [0; 9]));
            let assigned = tuple[..depth]
                .iter()
                .fold(0, |mask, &digit| mask | digit_bit(digit));
            *required &= assigned;
            for (mask, &digit) in supported.iter_mut().zip(&tuple[..depth]) {
                *mask |= digit_bit(digit);
            }
            return;
        }
        for digit in 1..=9 {
            if domains[depth] & digit_bit(digit) != 0 {
                tuple[depth] = digit;
                visit(domains, tuple, depth + 1, result);
            }
        }
    }
    let mut result = None;
    visit(domains, &mut [0; 4], 0, &mut result);
    result
}

#[test]
fn required_digits_and_locations_match_literal_assignments() {
    for length in 2..=4 {
        for encoded in 0..15usize.pow(length as u32) {
            let mut index = encoded;
            let mut domains = [0; 4];
            for domain in &mut domains[..length] {
                *domain = (index % 15 + 1) as u16;
                index /= 15;
            }
            let domains = &domains[..length];
            assert_eq!(
                interval_support(domains),
                literal_support(domains),
                "{domains:?}"
            );
        }
    }
    for domains in [
        [0b1_0001_0001, 0b0_0101_0100, 0b1_1000_0001],
        [digit_bit(6), DIGITS, digit_bit(8)],
        [0, DIGITS, DIGITS],
        [DIGITS; 3],
    ] {
        assert_eq!(
            interval_support(&domains),
            literal_support(&domains),
            "{domains:?}"
        );
    }
}

fn renban(cells: &[usize]) -> PuzzleRule {
    PuzzleRule::Renban {
        cells: cells.to_vec(),
        segments: None,
    }
}

fn deductions(puzzle: &VariantPuzzle) -> Vec<VariantDeduction> {
    puzzle
        .compile()
        .unwrap()
        .deductions(
            &[0; CELLS],
            &[0; CELLS],
            VariantTechnique::RenbanLockedDigit,
        )
        .unwrap()
}

#[test]
fn renban_scopes_follow_the_puzzles_actual_houses() {
    let mut puzzle = VariantPuzzle::classic([0; CELLS]);
    puzzle.rules.push(renban(&[0, 10, 20, 19, 18]));
    let original = puzzle.compile().unwrap();
    let proofs = deductions(&puzzle);
    assert_eq!(proofs.len(), 1);
    let VariantEvidence::LockedDigit { target, digit, .. } = &proofs[0].evidence else {
        panic!("expected a digit lock");
    };
    assert_eq!((*target, *digit), (VariantHouseKind::Region(0), 5));
    assert_eq!(proofs[0].actions.len(), 4);

    let mut regions: Vec<_> = original.houses()[18..27]
        .iter()
        .map(|house| house.cells.to_vec())
        .collect();
    let old_region = regions[0].clone();
    regions[0][8] = 12;
    regions[1][3] = 20;
    puzzle.regions = RegionLayout::Jigsaw { regions };
    assert!(deductions(&puzzle).is_empty());

    puzzle
        .rules
        .push(PuzzleRule::ExtraHouse { cells: old_region });
    let extra = deductions(&puzzle);
    assert_eq!(extra.len(), 1);
    assert_eq!(extra[0].actions, proofs[0].actions);
    assert!(matches!(
        extra[0].evidence,
        VariantEvidence::LockedDigit {
            target: VariantHouseKind::Extra(1),
            ..
        }
    ));
}

#[test]
fn a_digit_can_be_locked_by_some_cells_of_a_line() {
    let givens = parse_givens(
        "000201809809050002020048000508002093040000000010067000000029406000600731056374020",
    )
    .unwrap();
    let mut puzzle = VariantPuzzle::classic(givens);
    puzzle.rules.push(renban(&[27, 36, 37, 38, 47]));

    let proofs = deductions(&puzzle);
    let proof = proofs
        .iter()
        .find(|proof| {
            matches!(&proof.evidence, VariantEvidence::LockedDigit {
        digit: 3, target: VariantHouseKind::Column(2), cells, ..
    } if cells == &[38, 47])
        })
        .expect("3 is locked into two cells in column 3");
    assert_eq!(
        proof.actions,
        [2, 20, 56].map(|cell| HintAction::Eliminate(Candidate { cell, digit: 3 }))
    );
}

#[cfg(feature = "wasm-api")]
#[test]
fn the_zero_given_mode_opening_locks_five_into_row_five() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../../tests/fixtures/little-killer-menace.json"
    ))
    .unwrap();
    let puzzle: VariantPuzzle = serde_json::from_value(fixture["puzzle"].clone()).unwrap();
    let solution = parse_givens(fixture["solution"].as_str().unwrap()).unwrap();
    let proofs = deductions(&puzzle);
    assert_eq!(proofs.len(), 1);
    let proof = &proofs[0];
    assert_eq!(
        proof.actions,
        [36, 37, 43, 44].map(|cell| HintAction::Eliminate(Candidate { cell, digit: 5 }))
    );
    assert!(matches!(&proof.evidence, VariantEvidence::LockedDigit {
        digit: 5, target: VariantHouseKind::Row(4), cells, clue, ..
    } if cells == &[38, 39, 40, 41, 42] && clue.rules == [12]));
    assert!(proof.actions.iter().all(|action| {
        let candidate = action.candidate();
        solution[candidate.cell] != candidate.digit
    }));
}
