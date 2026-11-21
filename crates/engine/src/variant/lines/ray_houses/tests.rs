use super::*;
use crate::{CELLS, DIGITS, VariantPuzzle, hints::digit_bit};

fn from_groups(groups: &[u16], renban: u16) -> RayHouses {
    let mut peers = [0; RAY_SIZE];
    for &group in groups.iter().chain(&[renban]) {
        for slot in slots(group) {
            peers[slot] |= group & !(1 << slot);
        }
    }
    RayHouses {
        peers,
        houses: Vec::new(),
    }
}

fn literal_support(domains: &[u16], groups: &[u16], renban: u16, total: u16) -> [u16; RAY_SIZE] {
    fn visit(
        domains: &[u16],
        tuple: &mut [u8; RAY_SIZE],
        at: usize,
        check: &mut impl FnMut(&[u8]),
    ) {
        if at == domains.len() {
            check(&tuple[..at]);
            return;
        }
        for digit in 1..=9 {
            if domains[at] & digit_bit(digit) != 0 {
                tuple[at] = digit;
                visit(domains, tuple, at + 1, check);
            }
        }
    }
    let mut support = [0; RAY_SIZE];
    visit(domains, &mut [0; RAY_SIZE], 0, &mut |tuple| {
        if tuple.iter().map(|&digit| u16::from(digit)).sum::<u16>() != total {
            return;
        }
        for &group in groups {
            let mut seen = 0;
            for slot in slots(group) {
                if seen & digit_bit(tuple[slot]) != 0 {
                    return;
                }
                seen |= digit_bit(tuple[slot]);
            }
        }
        let mut line = slots(renban).map(|slot| tuple[slot]).collect::<Vec<_>>();
        line.sort_unstable();
        if line.windows(2).any(|pair| pair[0] + 1 != pair[1]) {
            return;
        }
        for (allowed, &digit) in support.iter_mut().zip(tuple) {
            *allowed |= digit_bit(digit);
        }
    });
    support
}

#[test]
fn all_four_cell_graphs_agree_with_literal_assignments() {
    let edges = [0b0011, 0b0101, 0b1001, 0b0110, 0b1010, 0b1100];
    for encoded in 0..64 {
        let groups = edges
            .iter()
            .enumerate()
            .filter_map(|(i, &edge)| (encoded & (1 << i) != 0).then_some(edge))
            .collect::<Vec<_>>();
        for renban in [0, 0b0110, 0b1011] {
            let houses = from_groups(&groups, renban);
            for domains in [
                [0b0010_0111, 0b1000_1110, 0b1100_0101, 0b1_0100_0100],
                [0b0010_1100, 0b1001_0100, 0b0010_1100, 0b0111_0100],
            ] {
                for total in 4..=36 {
                    assert_eq!(
                        ray_support(&domains, &houses, renban, total, 4096),
                        Some(literal_support(&domains, &groups, renban, total)),
                        "{encoded}, {domains:?}, {renban}, {total}"
                    );
                }
            }
        }
    }
}

#[test]
fn long_ray_allows_repeats_between_independent_boxes() {
    let cells = std::array::from_fn::<_, 9, _>(|pos| 10 * pos);
    let compiled = VariantPuzzle::classic([0; CELLS]).compile().unwrap();
    let houses = RayHouses::from_puzzle(&compiled, &cells, 0);
    assert_eq!(
        houses.houses,
        [
            VariantHouseKind::Region(0),
            VariantHouseKind::Region(4),
            VariantHouseKind::Region(8)
        ]
    );
    assert_eq!(components(0x1ff, &houses.peers), [7, 7 << 3, 7 << 6]);
    assert_eq!(
        ray_support(&[DIGITS; 9], &houses, 0, 18, 2048),
        Some([7; 9])
    );
    let mut fixed = [DIGITS; 9];
    fixed[0] = 1;
    fixed[3] = 1;
    let support = ray_support(&fixed, &houses, 0, 18, 2048).unwrap();
    assert_eq!(support, [1, 6, 6, 1, 6, 6, 7, 7, 7]);
    fixed[1] = 1;
    assert_eq!(ray_support(&fixed, &houses, 0, 18, 2048), Some([0; 9]));
}

#[test]
fn a_complete_shared_diagonal_uses_all_nine_digits_within_budget() {
    let cells = std::array::from_fn::<_, 9, _>(|pos| 10 * pos);
    let mut puzzle = VariantPuzzle::classic([0; CELLS]);
    puzzle.rules.push(crate::PuzzleRule::ExtraHouse {
        cells: cells.to_vec(),
    });
    let compiled = puzzle.compile().unwrap();
    let houses = RayHouses::from_puzzle(&compiled, &cells, 0);
    assert_eq!(components(0x1ff, &houses.peers), [0x1ff]);
    assert_eq!(houses.houses, [VariantHouseKind::Extra(0)]);
    let mut domains = [DIGITS; 9];
    domains[0] = digit_bit(1);
    assert_eq!(
        ray_support(&domains, &houses, 0, 45, 1),
        Some([
            digit_bit(1),
            DIGITS & !digit_bit(1),
            DIGITS & !digit_bit(1),
            DIGITS & !digit_bit(1),
            DIGITS & !digit_bit(1),
            DIGITS & !digit_bit(1),
            DIGITS & !digit_bit(1),
            DIGITS & !digit_bit(1),
            DIGITS & !digit_bit(1),
        ])
    );
    assert_eq!(ray_support(&domains, &houses, 0, 44, 1), Some([0; 9]));
}

#[test]
fn a_budget_failure_discards_support_from_earlier_assignments_and_intervals() {
    let houses = from_groups(&[0b0011, 0b1100], 0b0110);
    let domains = [0b0000_0111; 4];
    for budget in [0, 3, 10] {
        assert_eq!(ray_support(&domains, &houses, 0b0110, 9, budget), None);
    }
    let expected = literal_support(&domains, &[0b0011, 0b1100], 0b0110, 9);
    assert!(expected.iter().any(|&mask| mask != 0));
    assert_eq!(
        ray_support(&domains, &houses, 0b0110, 9, 2048),
        Some(expected)
    );
}

#[cfg(feature = "wasm-api")]
mod published {
    use super::*;
    use crate::variant::lines::LineKind;
    use crate::{VariantPosition, VariantTechnique, parse_givens};

    fn load(source: &str) -> (VariantPuzzle, [u8; CELLS]) {
        let fixture: serde_json::Value = serde_json::from_str(source).unwrap();
        let puzzle = serde_json::from_value(fixture["puzzle"].clone()).unwrap();
        (
            puzzle,
            parse_givens(fixture["solution"].as_str().unwrap()).unwrap(),
        )
    }

    #[test]
    fn the_mode_candidate_requires_both_boxes_on_the_ray() {
        let (puzzle, solution) = load(include_str!(
            "../../../../../../tests/fixtures/little-killer-menace.json"
        ));
        let trace = VariantPosition::new(puzzle)
            .solve_logically(&[
                VariantTechnique::Renban,
                VariantTechnique::RenbanLockedDigit,
                VariantTechnique::LittleKiller,
                VariantTechnique::RenbanSum,
                VariantTechnique::RenbanSumHouse,
            ])
            .unwrap();
        assert_eq!(trace.steps.len(), 11);
        let position = trace.end;
        assert_eq!(position.entries, [0; CELLS]);

        let (cells, renban) = ([76, 66, 56, 46, 36], 0b01110);
        let compiled = position.puzzle.compile().unwrap();
        let opened = compiled
            .proof_position(&position.entries, &position.eliminations)
            .unwrap();
        let domains = cells.map(|cell| opened.masks[cell]);
        let houses = RayHouses::from_puzzle(&compiled, &cells, renban);
        let support = ray_support(&domains, &houses, renban, 15, 4096).unwrap();
        assert_eq!(
            houses.houses,
            [VariantHouseKind::Region(3), VariantHouseKind::Region(7)]
        );
        assert_eq!(
            support,
            literal_support(&domains, &[0b00011, 0b11000], renban, 15)
        );
        assert_ne!(domains[2] & digit_bit(4), 0);
        assert_eq!(support[2] & digit_bit(4), 0);
        for group in [0b00011, 0b11000] {
            assert_ne!(
                literal_support(&domains, &[group], renban, 15)[2] & digit_bit(4),
                0
            );
        }
        for (slot, cell) in cells.into_iter().enumerate() {
            assert_ne!(support[slot] & digit_bit(solution[cell]), 0);
        }
    }

    #[test]
    fn published_pure_and_mixed_little_killer_controls_preserve_every_solution_digit() {
        for source in [
            include_str!("../../../../../../tests/fixtures/little-killer-murphy.json"),
            include_str!("../../../../../../tests/fixtures/little-killer-newman.json"),
            include_str!("../../../../../../tests/fixtures/little-killer-mixed.json"),
            include_str!("../../../../../../tests/fixtures/little-killer-jigsaw-mixed.json"),
        ] {
            let (puzzle, solution) = load(source);
            let compiled = puzzle.compile().unwrap();
            let opened = compiled.proof_position(&[0; CELLS], &[0; CELLS]).unwrap();
            let mut reviewed = 0;
            let mut eliminations = 0;
            for ray in &compiled.lines {
                let LineKind::Sum(total) = ray.kind else {
                    continue;
                };
                let cells = &ray.cells;
                let domains = cells
                    .iter()
                    .map(|&cell| {
                        let given = compiled.givens()[cell];
                        if given == 0 {
                            opened.masks[cell]
                        } else {
                            digit_bit(given)
                        }
                    })
                    .collect::<Vec<_>>();
                let houses = RayHouses::from_puzzle(&compiled, cells, 0);
                if houses.houses.is_empty() {
                    continue;
                }
                let support = ray_support(&domains, &houses, 0, total, 32_768)
                    .expect("reviewed puzzle scope is within budget");
                let mut basic = [0; RAY_SIZE];
                ray.support(&domains, &mut basic[..domains.len()]);
                for (slot, &cell) in cells.iter().enumerate() {
                    assert_ne!(support[slot] & digit_bit(solution[cell]), 0);
                    assert_eq!(support[slot] & !basic[slot], 0);
                    eliminations += (basic[slot] & !support[slot]).count_ones();
                }
                reviewed += 1;
            }
            let title = serde_json::from_str::<serde_json::Value>(source).unwrap()["title"].clone();
            println!(
                "{title}: {reviewed} rays reviewed, {eliminations} candidate exclusions need houses"
            );
            assert!(reviewed > 0);
        }
    }
}
