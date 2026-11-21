use super::super::links::conjugate_houses;
use super::*;
use crate::{CELLS, LinkSource, LinkStrength};

const fn at(cell: usize, digit: u8) -> Candidate {
    Candidate { cell, digit }
}

struct Case {
    name: &'static str,
    // Digits written as decimal strings keep the small layouts readable.
    masks: &'static [(usize, &'static str)],
    path: &'static [Candidate],
    possible: [bool; 2],
    reason: ColoringReason,
    removed: &'static [Candidate],
}

const CASES: [Case; 7] = [
    Case {
        name: "two digits of the same color in one cell",
        masks: &[(0, "259"), (9, "578"), (10, "25")],
        path: &[at(0, 2), at(10, 2), at(10, 5), at(9, 5), at(0, 5)],
        possible: [false, true],
        reason: ColoringReason::SameColorConflict([at(0, 2), at(0, 5)]),
        removed: &[at(0, 2), at(0, 5), at(10, 5)],
    },
    Case {
        name: "two copies of the same digit and color in a box",
        masks: &[(0, "59"), (9, "59"), (10, "5")],
        path: &[at(9, 9), at(0, 9), at(0, 5), at(9, 5), at(10, 5)],
        possible: [false, true],
        reason: ColoringReason::SameColorConflict([at(0, 5), at(10, 5)]),
        removed: &[at(0, 5), at(9, 9), at(10, 5)],
    },
    Case {
        name: "one color empties a cell",
        masks: &[(0, "278"), (1, "25"), (9, "25"), (63, "2")],
        path: &[at(0, 2), at(1, 2), at(1, 5)],
        possible: [false, true],
        reason: ColoringReason::EmptiedCell(9),
        removed: &[at(0, 2), at(1, 5)],
    },
    Case {
        name: "one color leaves a row without its digit",
        masks: &[
            (2, "59"),
            (3, "5"),
            (11, "5"),
            (13, "5"),
            (21, "5"),
            (65, "9"),
        ],
        path: &[at(65, 9), at(2, 9), at(2, 5), at(3, 5), at(21, 5)],
        possible: [false, true],
        reason: ColoringReason::EmptiedHouse {
            house: House::Row(1),
            digit: 5,
        },
        removed: &[at(2, 5), at(21, 5), at(65, 9)],
    },
    Case {
        name: "either color fills the same cell",
        masks: &[(0, "257"), (1, "25")],
        path: &[at(0, 2), at(1, 2), at(1, 5), at(0, 5)],
        possible: [true, true],
        reason: ColoringReason::BothColors,
        removed: &[at(0, 7)],
    },
    Case {
        name: "an uncolored digit sees both colors",
        masks: &[
            (0, "5"),
            (10, "59"),
            (13, "5"),
            (20, "5"),
            (29, "5"),
            (31, "5"),
            (64, "9"),
            (74, "5"),
        ],
        path: &[
            at(64, 9),
            at(10, 9),
            at(10, 5),
            at(13, 5),
            at(31, 5),
            at(29, 5),
        ],
        possible: [true, true],
        reason: ColoringReason::BothColors,
        removed: &[at(20, 5)],
    },
    Case {
        name: "a color fills the cell and the other blocks the digit in a peer",
        masks: &[(0, "258"), (1, "25"), (6, "5"), (10, "357")],
        path: &[at(0, 2), at(1, 2), at(1, 5), at(10, 5)],
        possible: [true, true],
        reason: ColoringReason::BothColors,
        removed: &[at(0, 5)],
    },
];

fn make_masks(input: &[(usize, &str)]) -> [u16; CELLS] {
    let mut masks = [0; CELLS];
    for &(cell, digits) in input {
        masks[cell] = digits.bytes().map(|digit| 1 << (digit - b'1')).sum();
    }
    masks
}

fn positions(masks: &[u16; CELLS]) -> [u128; 9] {
    std::array::from_fn(|digit| {
        masks
            .iter()
            .enumerate()
            .fold(0, |positions, (cell, &mask)| {
                positions | (u128::from(mask & (1 << digit) != 0) << cell)
            })
    })
}

fn conflicts(a: Candidate, b: Candidate) -> bool {
    if a.cell == b.cell {
        return a.digit != b.digit;
    }
    let area = |cell: usize| (cell / 27, (cell % 9) / 3);
    a.digit == b.digit
        && (a.cell / 9 == b.cell / 9 || a.cell % 9 == b.cell % 9 || area(a.cell) == area(b.cell))
}

fn completions(masks: &[u16; CELLS]) -> Vec<Vec<Candidate>> {
    let live: Vec<_> = masks
        .iter()
        .enumerate()
        .flat_map(|(cell, &mask)| {
            (1..=9).filter_map(move |digit| {
                (mask & (1 << (digit - 1)) != 0).then_some(at(cell, digit))
            })
        })
        .collect();
    let cells = (0..CELLS).map(|cell| {
        live.iter()
            .copied()
            .filter(|value| value.cell == cell)
            .collect::<Vec<_>>()
    });
    let houses = House::all().flat_map(|house| {
        let live = &live;
        (1..=9).map(move |digit| {
            live.iter()
                .copied()
                .filter(|value| value.digit == digit && house.cells().contains(&value.cell))
                .collect::<Vec<_>>()
        })
    });
    let groups: Vec<_> = cells
        .chain(houses)
        .filter(|values| values.len() >= 2)
        .collect();
    (0..1usize << live.len())
        .filter_map(|bits| {
            let placed: Vec<_> = live
                .iter()
                .copied()
                .enumerate()
                .filter_map(|(i, value)| (bits & (1 << i) != 0).then_some(value))
                .collect();
            if placed
                .iter()
                .enumerate()
                .any(|(i, &value)| placed[i + 1..].iter().any(|&other| conflicts(value, other)))
                || groups
                    .iter()
                    .any(|group| !group.iter().any(|value| placed.contains(value)))
            {
                return None;
            }
            Some(placed)
        })
        .collect()
}

fn evidence_step(graph: &CandidateLinks<'_>, a: Candidate, b: Candidate) -> CandidateLink {
    graph
        .house_links(a)
        .chain(graph.cell_link(a))
        .find(|link| link.to == b)
        .expect("every fixture edge must be a real conjugate pair or bivalue cell")
}

#[test]
fn seven_medusa_rules_replay_against_every_local_candidate_assignment() {
    for case in CASES {
        let masks = make_masks(case.masks);
        let positions = positions(&masks);
        let graph = CandidateLinks {
            masks: &masks,
            positions: &positions,
            conjugates: &conjugate_houses(&positions),
        };
        let members: Vec<_> = case.path.iter().copied().map(index).collect();
        let links: Vec<_> = case
            .path
            .windows(2)
            .map(|pair| evidence_step(&graph, pair[0], pair[1]))
            .collect();
        assert!(
            links
                .iter()
                .any(|link| matches!(link.source, LinkSource::Cell(_))),
            "{}",
            case.name
        );
        let models = completions(&masks);
        assert!(!models.is_empty(), "{}", case.name);
        for flipped in [false, true] {
            let mut colors = [UNCOLORED; CANDIDATE_COUNT];
            for (i, &node) in members.iter().enumerate() {
                colors[node] = (i % 2) as u8 ^ u8::from(flipped);
            }
            let component = Component {
                colors: &colors,
                members: &members,
                links: &links,
            };
            let step = component
                .visit(&graph, Technique::Medusa, &mut ControlFlow::Break)
                .break_value()
                .unwrap_or_else(|| panic!("{} produced no proof", case.name));
            let HintEvidence::Coloring {
                colors: actual,
                links: recorded,
                reason,
            } = &step.evidence
            else {
                panic!("no coloring evidence for {}", case.name);
            };
            assert_eq!(*reason, case.reason, "{}", case.name);
            assert_eq!(recorded, &links, "{}", case.name);
            assert!(
                recorded
                    .iter()
                    .all(|link| link.strength == LinkStrength::Strong)
            );
            for (side, colored) in actual.iter().enumerate() {
                let mut expected = case
                    .path
                    .iter()
                    .copied()
                    .filter(|&value| colors[index(value)] == side as u8)
                    .collect::<Vec<_>>();
                expected.sort_unstable();
                assert_eq!(colored, &expected, "{}", case.name);
                let initial_side = side ^ usize::from(flipped);
                assert_eq!(
                    models
                        .iter()
                        .any(|model| colored.iter().all(|value| model.contains(value))),
                    case.possible[initial_side],
                    "{}",
                    case.name
                );
            }
            assert_eq!(
                step.actions(),
                case.removed
                    .iter()
                    .copied()
                    .map(HintAction::Eliminate)
                    .collect::<Vec<_>>(),
                "{}",
                case.name
            );
            for &removed in case.removed {
                assert!(
                    models.iter().all(|model| !model.contains(&removed)),
                    "{}: {removed:?}",
                    case.name
                );
            }
        }
    }
}

#[test]
fn contradictory_medusa_component_gives_no_moves_in_either_color_order() {
    let masks = make_masks(&[(0, "12"), (1, "13"), (9, "13")]);
    let positions = positions(&masks);
    let graph = CandidateLinks {
        masks: &masks,
        positions: &positions,
        conjugates: &conjugate_houses(&positions),
    };
    let path = [at(0, 2), at(0, 1), at(1, 1), at(1, 3)];
    let links: Vec<_> = path
        .windows(2)
        .map(|pair| evidence_step(&graph, pair[0], pair[1]))
        .collect();
    let members = path.map(index);
    assert!(completions(&masks).is_empty());
    for flipped in [0, 1] {
        let mut colors = [UNCOLORED; CANDIDATE_COUNT];
        for (index, &node) in members.iter().enumerate() {
            colors[node] = (index % 2) as u8 ^ flipped;
        }
        let component = Component {
            colors: &colors,
            members: &members,
            links: &links,
        };
        assert!(
            component
                .visit(&graph, Technique::Medusa, &mut ControlFlow::Break)
                .break_value()
                .is_none()
        );
    }
}

#[test]
fn medusa_discovery_skips_an_odd_component_and_preserves_a_separate_proof() {
    // The five 5s are conjugate along row, column, row, column, and box.
    // The 9 in the first cell makes this a multi-digit component.
    let masks = make_masks(&[
        (0, "247"),
        (2, "24"),
        (1, "59"),
        (6, "5"),
        (42, "5"),
        (36, "5"),
        (9, "5"),
    ]);
    let positions = positions(&masks);
    let graph = CandidateLinks {
        masks: &masks,
        positions: &positions,
        conjugates: &conjugate_houses(&positions),
    };
    let cycle = [1, 6, 42, 36, 9, 1].map(|cell| at(cell, 5));
    for pair in cycle.windows(2) {
        assert_eq!(
            evidence_step(&graph, pair[0], pair[1]).strength,
            LinkStrength::Strong
        );
    }
    assert_eq!(
        evidence_step(&graph, at(1, 5), at(1, 9)).source,
        LinkSource::Cell(1)
    );
    let mut moves = Vec::new();
    let _ = visit(&graph, Technique::Medusa, &mut |step| {
        moves.extend_from_slice(step.actions());
        let HintEvidence::Coloring {
            colors,
            links,
            reason,
        } = step.evidence
        else {
            panic!("missing group");
        };
        assert_eq!(reason, ColoringReason::BothColors);
        assert_eq!(links.len(), 3);
        assert!(
            colors
                .iter()
                .flatten()
                .all(|value| [0, 2].contains(&value.cell))
        );
        ControlFlow::Continue(())
    });
    assert_eq!(moves, [HintAction::Eliminate(at(0, 7))]);
}
