use super::*;
use crate::{ClueDirection, PuzzleRule, RegionLayout, VariantPuzzle};

const ALL: u16 = 511;
const RAY: [usize; 5] = [76, 66, 56, 46, 36];
const CONTAINED: [usize; 3] = [46, 56, 66];
const OTHER: [usize; 3] = [45, 36, 27];

fn mask(digits: &[u8]) -> u16 {
    digits.iter().fold(0, |mask, digit| mask | 1 << (digit - 1))
}

fn three_clues(sum: u16, contained: &[usize], other: &[usize]) -> VariantPuzzle {
    let mut puzzle = VariantPuzzle::classic([0; 81]);
    puzzle.rules = vec![
        PuzzleRule::LittleKiller {
            cells: RAY.to_vec(),
            direction: ClueDirection::NorthWest,
            sum,
        },
        PuzzleRule::Renban {
            cells: contained.to_vec(),
            segments: None,
        },
        PuzzleRule::Renban {
            cells: other.to_vec(),
            segments: None,
        },
    ];
    puzzle
}

fn tuples(domains: &[u16], visit: &mut impl FnMut(&[u8])) {
    fn visit_next(domains: &[u16], tuple: &mut [u8; 9], i: usize, visit: &mut impl FnMut(&[u8])) {
        if i == domains.len() {
            visit(&tuple[..i]);
            return;
        }
        for digit in 1..=9 {
            if domains[i] & (1 << (digit - 1)) != 0 {
                tuple[i] = digit;
                visit_next(domains, tuple, i + 1, visit);
            }
        }
    }
    visit_next(domains, &mut [0; 9], 0, visit);
}

fn consecutive(digits: impl Iterator<Item = u8>) -> bool {
    let mut digits = digits.collect::<Vec<_>>();
    digits.sort_unstable();
    digits.windows(2).all(|pair| pair[0] + 1 == pair[1])
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum Omit {
    None,
    House,
    Sum,
    Contained,
    Other,
}

// Enumerate literal digits on each clue. Compare full assignments by shared
// digit equality and the house, independently of interval projections.
fn literal_support(join: &HouseJoin<'_>, ray: &[u16], other: &[u16], omit: Omit) -> [u16; 9] {
    let mut support = [0; 9];
    tuples(ray, &mut |ray| {
        if omit != Omit::Sum
            && ray.iter().map(|&digit| u16::from(digit)).sum::<u16>() != join.pair.total
        {
            return;
        }
        if omit != Omit::Contained
            && !consecutive(
                ray.iter()
                    .enumerate()
                    .filter_map(|(i, &digit)| (join.pair.members & (1 << i) != 0).then_some(digit)),
            )
        {
            return;
        }
        tuples(other, &mut |other| {
            if ray[join.pivot] != other[join.other_pivot]
                || (omit != Omit::Other && !consecutive(other.iter().copied()))
            {
                return;
            }
            if omit != Omit::House {
                let mut used = 1 << (ray[join.bridge] - 1);
                for &digit in other {
                    let bit = 1 << (digit - 1);
                    if used & bit != 0 {
                        return;
                    }
                    used |= bit;
                }
            }
            for (mask, &digit) in support.iter_mut().zip(ray) {
                *mask |= 1 << (digit - 1);
            }
        });
    });
    support
}

#[test]
fn interval_projection_agrees_with_literal_tuples() {
    for primary in [vec![46, 66], CONTAINED.to_vec(), vec![36, 46, 56, 66]] {
        for other in [vec![36, 45], OTHER.to_vec(), vec![27, 36, 37, 45]] {
            for sum in 11..=37 {
                let compiled = three_clues(sum, &primary, &other).compile().unwrap();
                let join = house_joins(&compiled).next().unwrap();
                assert_eq!(join.house, VariantHouseKind::Region(3));
                let ray = [
                    mask(&[2, 3, 7, 8]),
                    mask(&[1, 2, 4, 6]),
                    mask(&[2, 3, 4, 5]),
                    mask(&[2, 3, 6, 7]),
                    mask(&[1, 3, 4, 7]),
                ];
                let mut satellite = other
                    .iter()
                    .map(|&cell| match cell {
                        36 => ray[4],
                        27 => mask(&[1, 2, 3, 6, 7, 8]),
                        37 => mask(&[2, 3, 4, 5, 6, 7]),
                        45 => mask(&[1, 3, 4, 6, 7, 8]),
                        _ => unreachable!(),
                    })
                    .collect::<Vec<_>>();
                for restricted in [false, true] {
                    if restricted {
                        // Keep one placed digit on the other Renban. Candidates
                        // elsewhere on the ray still come from the supplied position.
                        let off_ray = (join.other_pivot + 1) % satellite.len();
                        satellite[off_ray] &= mask(&[3]);
                    }
                    let support = join.support(&ray, &satellite);
                    assert_eq!(
                        support.with_house,
                        literal_support(&join, &ray, &satellite, Omit::None)
                    );
                    assert_eq!(
                        support.without_house,
                        literal_support(&join, &ray, &satellite, Omit::House)
                    );
                }
            }
        }
    }
}

#[test]
fn each_printed_clue_and_the_actual_house_are_needed_to_remove_eight() {
    let compiled = three_clues(15, &CONTAINED, &OTHER).compile().unwrap();
    let join = house_joins(&compiled).next().unwrap();
    let ray = [ALL; 5];
    let other = [ALL; 3];
    let support = join.support(&ray, &other);
    assert_eq!(
        support.with_house,
        literal_support(&join, &ray, &other, Omit::None)
    );
    assert_eq!(support.with_house[0], mask(&[1, 2, 3, 4, 5, 6, 7]));
    assert_eq!(support.without_house[0], mask(&[1, 2, 3, 4, 5, 6, 7, 8]));
    for omit in [Omit::House, Omit::Sum, Omit::Contained, Omit::Other] {
        assert_ne!(
            literal_support(&join, &ray, &other, omit)[0] & mask(&[8]),
            0
        );
    }

    let mut restricted = ray;
    restricted[join.pivot] &= !mask(&[2]);
    let mut other = other;
    other[join.other_pivot] = restricted[join.pivot];
    let changed = join.support(&restricted, &other);
    assert_eq!(
        changed.with_house,
        literal_support(&join, &restricted, &other, Omit::None)
    );
    assert_eq!(changed.with_house[0] & mask(&[7]), 0);

    // The shared cell and the tip of the ray may both contain 3. They do not share a house.
    restricted[join.pivot] = mask(&[3]);
    restricted[0] = mask(&[3]);
    other[join.other_pivot] = mask(&[3]);
    assert_eq!(join.support(&restricted, &other).with_house[0], mask(&[3]));
}

#[test]
fn jigsaw_uses_compiled_memberships_and_recognizes_an_explicit_house() {
    let mut puzzle = three_clues(15, &CONTAINED, &OTHER);
    let mut regions = puzzle.compile().unwrap().houses()[18..27]
        .iter()
        .map(|house| house.cells.to_vec())
        .collect::<Vec<_>>();
    // Change two unrelated regions and retain the proof in the irregular layout.
    let left = regions[1].iter().position(|&cell| cell == 14).unwrap();
    let right = regions[2].iter().position(|&cell| cell == 6).unwrap();
    regions[1][left] = 6;
    regions[2][right] = 14;
    puzzle.regions = RegionLayout::Jigsaw {
        regions: regions.clone(),
    };
    assert_eq!(house_joins(&puzzle.compile().unwrap()).count(), 1);

    let original_house = regions[3].clone();
    let bridge = regions[3].iter().position(|&cell| cell == 46).unwrap();
    let replacement = regions[6].iter().position(|&cell| cell == 54).unwrap();
    regions[3][bridge] = 54;
    regions[6][replacement] = 46;
    puzzle.regions = RegionLayout::Jigsaw { regions };
    assert_eq!(house_joins(&puzzle.compile().unwrap()).count(), 0);

    puzzle.rules.push(PuzzleRule::ExtraHouse {
        cells: original_house,
    });
    let compiled = puzzle.compile().unwrap();
    let join = house_joins(&compiled).next().unwrap();
    assert_eq!(join.house, VariantHouseKind::Extra(3));
    assert_eq!(
        join.support(&[ALL; 5], &[ALL; 3]).with_house[0],
        mask(&[1, 2, 3, 4, 5, 6, 7])
    );
}

#[cfg(feature = "wasm-api")]
#[test]
fn every_scope_on_the_original_mode_position_preserves_the_solution() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../../../tests/fixtures/little-killer-menace.json"
    ))
    .unwrap();
    let puzzle: VariantPuzzle = serde_json::from_value(fixture["puzzle"].clone()).unwrap();
    let solution = crate::parse_givens(fixture["solution"].as_str().unwrap()).unwrap();
    let compiled = puzzle.compile().unwrap();
    let mut removes_eight = false;
    for join in house_joins(&compiled) {
        let ray = join.pair.cells();
        let support = join.support(&[ALL; 9][..ray.len()], &[ALL; 9][..join.other.cells.len()]);
        for (i, &cell) in ray.iter().enumerate() {
            assert_ne!(support.with_house[i] & mask(&[solution[cell]]), 0);
            if cell == 76
                && support.without_house[i] & mask(&[8]) != 0
                && support.with_house[i] & mask(&[8]) == 0
            {
                assert_eq!(join.house, VariantHouseKind::Region(3));
                assert_eq!(join.pair.rules(), [13, 3]);
                assert_eq!(join.other.rule_index, 10);
                removes_eight = true;
            }
        }
    }
    assert!(removes_eight);
}
