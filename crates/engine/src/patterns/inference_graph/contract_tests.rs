use super::super::inference::Rule;
use super::*;
use crate::{HintAction, HintEvidence, Technique};
use std::{collections::BTreeSet, ops::ControlFlow};

const PAIRS: [(usize, usize); 6] = [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)];
const OBSERVER: usize = 30;
const NEAR_MISS: usize = 40;
const UNREACHABLE: usize = 100;

#[test]
fn ordinary_graph_uses_exact_cell_and_house_constraints_for_every_pair() {
    let geometries: [[u16; CELLS]; 4] = [
        [1; CELLS],
        std::array::from_fn(|cell| match (cell / 9 + cell % 9) % 6 {
            0 => 0,
            1 | 2 => 0b00011,
            3 => 0b00111,
            4 => 0b10100,
            _ => 0b10001,
        }),
        std::array::from_fn(|cell| match cell % 13 {
            0 | 1 => 0b00101,
            2..=4 => 0b01110,
            5 | 9 => 0b01100,
            _ => 0,
        }),
        std::array::from_fn(|cell| match cell % 7 {
            0 => 0b11001,
            1 | 6 => 0b10111,
            3 | 4 => 0b10000,
            _ => 0,
        }),
    ];
    let house_cells: Vec<_> = (0..9)
        .flat_map(|n| {
            [
                std::array::from_fn::<_, 9, _>(|i| n * 9 + i),
                std::array::from_fn(|i| i * 9 + n),
                std::array::from_fn(|i| (n / 3 * 3 + i / 3) * 9 + n % 3 * 3 + i % 3),
            ]
        })
        .map(|house| house.into_iter().map(cell_bit).sum::<u128>())
        .collect();
    for (fixture, masks) in geometries.iter().enumerate() {
        let positions: [u128; 9] = std::array::from_fn(|digit| {
            (0..CELLS)
                .filter(|&cell| masks[cell] & (1 << digit) != 0)
                .map(cell_bit)
                .sum()
        });
        let graph = InferenceGraph::new(masks, positions);
        let mut expected_nodes = BTreeSet::new();
        for (digit, positions) in (1..=9).zip(positions) {
            expected_nodes.extend((0..CELLS).filter_map(|cell| {
                let member = cell_bit(cell);
                (positions & member != 0).then_some((digit, member))
            }));
            for area in (2..27).step_by(3) {
                for line in (0..27).filter(|line| line % 3 != 2) {
                    let overlap = positions & house_cells[area] & house_cells[line];
                    if overlap.count_ones() >= 2 {
                        expected_nodes.insert((digit, overlap));
                    }
                }
            }
        }
        let actual_nodes = graph
            .nodes
            .iter()
            .map(|node| (node.digit, node.members))
            .collect::<BTreeSet<_>>();
        assert_eq!(actual_nodes, expected_nodes, "fixture {fixture}");
        assert_eq!(
            actual_nodes.len(),
            graph.nodes.len(),
            "fixture {fixture} has duplicate nodes"
        );
        for (a, left) in graph.nodes.iter().enumerate() {
            for strength in [LinkStrength::Strong, LinkStrength::Weak] {
                assert!(
                    graph
                        .neighbors(a, strength)
                        .windows(2)
                        .all(|pair| pair[0].to < pair[1].to)
                );
            }
            for (b, right) in graph.nodes.iter().enumerate().skip(a) {
                let (weak, strong) = if a == b {
                    (false, false)
                } else if left.digit != right.digit {
                    let same_cell = left.members == right.members && left.members.is_power_of_two();
                    (
                        same_cell,
                        same_cell
                            && masks[left.members.trailing_zeros() as usize].count_ones() == 2,
                    )
                } else if left.members & right.members != 0 {
                    (false, false)
                } else {
                    let union = left.members | right.members;
                    let containers = house_cells
                        .iter()
                        .copied()
                        .filter(|&house| union & !house == 0);
                    (
                        containers.clone().count() > 0,
                        containers
                            .into_iter()
                            .any(|house| positions[usize::from(left.digit - 1)] & house == union),
                    )
                };
                for (strength, expected) in
                    [(LinkStrength::Weak, weak), (LinkStrength::Strong, strong)]
                {
                    assert_eq!(
                        graph.edge(a, b, strength).is_some(),
                        expected,
                        "fixture {fixture}, {a} to {b} {strength:?}"
                    );
                    assert_eq!(
                        graph.edge(b, a, strength).is_some(),
                        expected,
                        "fixture {fixture}, {b} to {a} {strength:?}"
                    );
                }
            }
        }
    }
}

#[test]
fn grouped_type_two_chain_uses_every_member_of_its_endpoint() {
    // (1 R1C1 or R1C2) = (1 R1C4) - (1 R4C4) = (2 R4C4)
    //                   - (2 R4C1) = (2 R2C1)
    // The two ends rule out 1 in R2C1 by box 1 and by its own cell.
    let mut masks = [0; CELLS];
    for cell in [0, 1, 3, 9, 27, 30] {
        masks[cell] |= digit_bit(1);
    }
    for cell in [9, 10, 27, 30] {
        masks[cell] |= digit_bit(2);
    }
    let positions = std::array::from_fn(|digit| {
        masks.iter().enumerate().fold(0, |positions, (cell, mask)| {
            positions
                | if mask & (1 << digit) != 0 {
                    cell_bit(cell)
                } else {
                    0
                }
        })
    });
    let graph = InferenceGraph::new(&masks, positions);
    let group = InferenceNode::Group {
        digit: 1,
        cells: vec![0, 1],
    };
    let single = InferenceNode::Candidate(Candidate { cell: 9, digit: 2 });
    let expected = HintAction::Eliminate(Candidate { cell: 9, digit: 1 });
    let witness = Rule::for_technique(Technique::GroupedAic)
        .unwrap()
        .visit(&graph, &mut |step| {
            let HintEvidence::Inference { links } = &step.evidence else {
                panic!("a grouped chain must publish its nodes");
            };
            let first = &links[0].from;
            let last = &links.last().unwrap().to;
            let endpoints =
                (first == &group && last == &single) || (first == &single && last == &group);
            if endpoints && step.actions().contains(&expected) {
                ControlFlow::Break(step)
            } else {
                ControlFlow::Continue(())
            }
        })
        .break_value()
        .expect("different-digit grouped endpoints must reach the exclusion check");
    assert_eq!(witness.actions(), [expected]);
    let HintEvidence::Inference { links } = witness.evidence else {
        unreachable!();
    };
    assert!(links.len() >= 3);
    assert_eq!(links[0].strength, LinkStrength::Strong);
    assert_eq!(links.last().unwrap().strength, LinkStrength::Strong);
    assert!(
        links.windows(2).all(|pair| {
            pair[0].to == pair[1].from && pair[0].strength != pair[1].strength
        })
    );

    let group_id = graph
        .nodes
        .iter()
        .position(|node| node.evidence() == group)
        .unwrap();
    let partial_peer = graph
        .nodes
        .iter()
        .position(|node| node.single() == Some(Candidate { cell: 27, digit: 2 }))
        .unwrap();
    assert!(
        graph.excluded_by_either(group_id, partial_peer).next().is_none(),
        "R4C1 sees only R1C1, so the group cannot remove 1 in R4C1"
    );

    // Different-digit multi-cell groups have no common conflicting candidate.
    let other_group = graph
        .nodes
        .iter()
        .position(|node| node.digit == 2 && node.members == (cell_bit(9) | cell_bit(10)))
        .unwrap();
    assert!(graph.excluded_by_either(group_id, other_group).next().is_none());
}

#[derive(Clone, Copy, Debug)]
enum Relation {
    None,
    AtMostOne,
    AtLeastOne,
    ExactlyOne,
}

impl Relation {
    fn allows(self, left: bool, right: bool) -> bool {
        match self {
            Self::None => true,
            Self::AtMostOne => !left || !right,
            Self::AtLeastOne => left || right,
            Self::ExactlyOne => left != right,
        }
    }
}

fn empty_model(count: usize) -> InferenceGraph {
    InferenceGraph {
        nodes: (0..count)
            .map(|cell| Node {
                digit: 1,
                members: cell_bit(cell),
                peers: 0,
            })
            .collect(),
        singles: count,
        mixed: Vec::new(),
        strong: vec![Vec::new(); count],
        weak: vec![Vec::new(); count],
        positions: [0; 9],
    }
}

fn model(relations: [Relation; 6], special: Option<usize>) -> InferenceGraph {
    let mut graph = empty_model(4);
    graph.nodes[0].peers = cell_bit(NEAR_MISS);
    graph.positions[0] = cell_bit(NEAR_MISS);
    for (i, ((a, b), relation)) in PAIRS.into_iter().zip(relations).enumerate() {
        let observer = cell_bit(OBSERVER + i);
        graph.positions[0] |= observer;
        graph.nodes[a].peers |= observer;
        graph.nodes[b].peers |= observer;
        if !relation.allows(true, true) {
            graph.connect(a, b, LinkSource::Peers {}, false);
        }
        if !relation.allows(false, false) {
            let source = if special == Some(i) {
                LinkSource::Firework(8)
            } else {
                LinkSource::House(House::Row(0))
            };
            graph.connect_strong(a, b, source);
        }
    }
    graph.sort_edges();
    graph
}

#[test]
fn open_and_closed_chains_keep_long_witnesses_through_branches() {
    let observer = Candidate { cell: 80, digit: 1 };
    let join = Candidate { cell: 0, digit: 1 };
    for (technique, nodes, starts_strong, closing, expected) in [
        (
            Technique::Aic,
            16,
            true,
            None,
            HintAction::Eliminate(observer),
        ),
        (
            Technique::ContinuousNiceLoop,
            16,
            true,
            Some(LinkStrength::Weak),
            HintAction::Eliminate(observer),
        ),
        (
            Technique::DiscontinuousNiceLoop,
            15,
            true,
            Some(LinkStrength::Strong),
            HintAction::Place(join),
        ),
        (
            Technique::DiscontinuousNiceLoop,
            15,
            false,
            Some(LinkStrength::Weak),
            HintAction::Eliminate(join),
        ),
    ] {
        let mut graph = empty_model(nodes + 2);
        let add = |graph: &mut InferenceGraph, a, b, strength| match strength {
            LinkStrength::Strong => graph.connect_strong(a, b, LinkSource::House(House::Row(0))),
            LinkStrength::Weak => graph.connect(a, b, LinkSource::Peers {}, false),
        };
        for a in 0..nodes - 1 {
            let strength = if (a % 2 == 0) == starts_strong {
                LinkStrength::Strong
            } else {
                LinkStrength::Weak
            };
            add(&mut graph, a, a + 1, strength);
        }
        if let Some(closing) = closing {
            add(&mut graph, nodes - 1, 0, closing);
        }
        add(&mut graph, 1, nodes, LinkStrength::Weak);
        add(&mut graph, 2, nodes + 1, LinkStrength::Strong);
        graph.positions[0] = cell_bit(observer.cell);
        graph.nodes[0].peers = cell_bit(observer.cell);
        graph.nodes[nodes - 1].peers = cell_bit(observer.cell);
        graph.sort_edges();
        let witness = Rule::for_technique(technique)
            .unwrap()
            .visit(&graph, &mut |step| {
                if step.actions().contains(&expected) {
                    ControlFlow::Break(step)
                } else {
                    ControlFlow::Continue(())
                }
            })
            .break_value()
            .unwrap_or_else(|| panic!("{technique:?} lost its long proof for {expected:?}"));
        assert_eq!(witness.actions(), [expected]);
        let HintEvidence::Inference { links } = &witness.evidence else {
            panic!("missing long-chain evidence");
        };
        assert_eq!(links.len(), nodes - usize::from(closing.is_none()));
        assert!(
            links
                .iter()
                .all(|link| single(&link.from) < nodes && single(&link.to) < nodes)
        );
        assert!(
            links
                .windows(2)
                .all(|pair| pair[0].to == pair[1].from && pair[0].strength != pair[1].strength)
        );
    }
}

fn relation_patterns() -> impl Iterator<Item = [Relation; 6]> {
    let choices = [
        Relation::None,
        Relation::AtMostOne,
        Relation::AtLeastOne,
        Relation::ExactlyOne,
    ];
    (0..4usize.pow(6))
        .map(move |pattern| std::array::from_fn(|pair| choices[(pattern >> (2 * pair)) & 3]))
}

fn assignment(bits: usize, node: usize) -> bool {
    bits & (1 << node) != 0
}

fn satisfying(relations: [Relation; 6]) -> Vec<usize> {
    (0..16)
        .filter(|&bits| {
            PAIRS
                .into_iter()
                .zip(relations)
                .all(|((a, b), relation)| relation.allows(assignment(bits, a), assignment(bits, b)))
        })
        .collect()
}

// Use the relation's truth table to construct implications, then compute
// shortest distances with Floyd–Warshall independently of the solver's walk.
fn distances(relations: [Relation; 6]) -> [[usize; 8]; 8] {
    let mut distance = [[UNREACHABLE; 8]; 8];
    for (from, row) in distance.iter_mut().enumerate() {
        row[from] = 0;
    }
    for ((a, b), relation) in PAIRS.into_iter().zip(relations) {
        for (from, to) in [(a, b), (b, a)] {
            for truth in [false, true] {
                if !relation.allows(truth, truth) {
                    distance[2 * from + usize::from(truth)][2 * to + usize::from(!truth)] = 1;
                }
            }
        }
    }
    for through in 0..8 {
        for from in 0..8 {
            for to in 0..8 {
                let via = distance[from][through] + distance[through][to];
                distance[from][to] = distance[from][to].min(via);
            }
        }
    }
    distance
}

fn single(node: &InferenceNode) -> usize {
    match node {
        InferenceNode::Candidate(value) => value.cell,
        _ => panic!("synthetic plain graph should only use individual candidates"),
    }
}

fn elimination(pair: usize) -> HintAction {
    HintAction::Eliminate(Candidate {
        cell: OBSERVER + pair,
        digit: 1,
    })
}

fn expected_endpoints(distance: &[[usize; 8]; 8], closed: bool) -> BTreeSet<HintAction> {
    PAIRS
        .into_iter()
        .enumerate()
        .filter_map(|(i, (a, b))| {
            let chain = (3..UNREACHABLE).contains(&distance[2 * a][2 * b + 1]);
            let closing_link = distance[2 * b + 1][2 * a] == 1;
            (chain && (!closed || closing_link)).then(|| elimination(i))
        })
        .collect()
}

fn expected_discontinuities(distance: &[[usize; 8]; 8]) -> BTreeSet<HintAction> {
    let mut actions = BTreeSet::new();
    for cell in 0..4 {
        let candidate = Candidate { cell, digit: 1 };
        if distance[2 * cell][2 * cell + 1] < UNREACHABLE {
            actions.insert(HintAction::Place(candidate));
        }
        if distance[2 * cell + 1][2 * cell] < UNREACHABLE {
            actions.insert(HintAction::Eliminate(candidate));
        }
    }
    actions
}

fn assert_witness(
    graph: &InferenceGraph,
    links: &[InferenceLink],
    actions: &[HintAction],
    technique: Technique,
) {
    assert!(links.len() >= 3);
    for link in links {
        let edge = graph
            .edge(single(&link.from), single(&link.to), link.strength)
            .expect("every reported step must be an available link");
        assert_eq!(edge.source, link.source);
    }
    for pair in links.windows(2) {
        assert_eq!(pair[0].to, pair[1].from);
        assert_ne!(pair[0].strength, pair[1].strength);
    }
    let first = links.first().unwrap();
    let last = links.last().unwrap();
    match technique {
        Technique::Aic | Technique::FireworkAic => {
            assert_ne!(first.from, last.to);
            assert_eq!(first.strength, LinkStrength::Strong);
            assert_eq!(last.strength, LinkStrength::Strong);
            if technique == Technique::FireworkAic {
                assert!(
                    links
                        .iter()
                        .any(|link| matches!(link.source, LinkSource::Firework(_)))
                );
            }
        }
        Technique::ContinuousNiceLoop => {
            assert_eq!(first.from, last.to);
            assert_eq!(first.strength, LinkStrength::Strong);
            assert_eq!(last.strength, LinkStrength::Weak);
        }
        Technique::DiscontinuousNiceLoop => {
            assert_eq!(first.from, last.to);
            assert_eq!(first.strength, last.strength);
            assert_eq!(actions.len(), 1);
            assert_eq!(actions[0].candidate().cell, single(&first.from));
            assert_eq!(
                matches!(actions[0], HintAction::Place(_)),
                first.strength == LinkStrength::Strong
            );
        }
        _ => unreachable!(),
    }
    // Re-check the edits using just the premises actually published in the
    // proof. A strong link here means at least one, not necessarily exactly one.
    let mut models = 0;
    for bits in 0..16 {
        if !links.iter().all(|link| {
            let a = assignment(bits, single(&link.from));
            let b = assignment(bits, single(&link.to));
            match link.strength {
                LinkStrength::Strong => a || b,
                LinkStrength::Weak => !a || !b,
            }
        }) {
            continue;
        }
        models += 1;
        for &action in actions {
            let cell = action.candidate().cell;
            match action {
                HintAction::Place(_) => assert!(assignment(bits, cell)),
                HintAction::Eliminate(_) if cell < 4 => assert!(!assignment(bits, cell)),
                HintAction::Eliminate(_) => {
                    assert_ne!(cell, NEAR_MISS);
                    let (a, b) = PAIRS[cell - OBSERVER];
                    assert!(assignment(bits, a) || assignment(bits, b));
                }
            }
        }
    }
    assert!(models > 0);
}

#[test]
fn plain_chain_search_matches_an_independent_oracle_on_every_four_node_graph() {
    let mut tested = 0;
    for relations in relation_patterns() {
        if satisfying(relations).is_empty() {
            // Incorrect candidate states can make every conclusion vacuous.
            // Restrict the search audit to graphs with a possible assignment.
            continue;
        }
        tested += 1;
        let graph = model(relations, None);
        let distance = distances(relations);
        for (technique, expected) in [
            (Technique::Aic, expected_endpoints(&distance, false)),
            (
                Technique::ContinuousNiceLoop,
                expected_endpoints(&distance, true),
            ),
            (
                Technique::DiscontinuousNiceLoop,
                expected_discontinuities(&distance),
            ),
        ] {
            let mut actual = BTreeSet::new();
            let _ = Rule::for_technique(technique)
                .unwrap()
                .visit(&graph, &mut |step| {
                    let HintEvidence::Inference { links } = &step.evidence else {
                        panic!("chain evidence is missing");
                    };
                    assert_eq!(step.technique, technique);
                    assert_witness(&graph, links, step.actions(), technique);
                    actual.extend(step.actions().iter().copied());
                    ControlFlow::Continue(())
                });
            if technique == Technique::ContinuousNiceLoop {
                // Every reachable closing pair is required. The emitted
                // loop can also remove candidates along its internal links.
                assert!(
                    expected.is_subset(&actual),
                    "{relations:?}: {expected:?} vs {actual:?}"
                );
            } else {
                assert_eq!(actual, expected, "{relations:?}, {technique:?}");
            }
        }
    }
    assert_eq!(tested, 3_549);
}

#[test]
fn special_link_loop_bounds_match_mutual_literal_reachability() {
    for relations in relation_patterns() {
        let distance = distances(relations);
        for (marked, (a, b)) in PAIRS.into_iter().enumerate() {
            if relations[marked].allows(false, false) {
                continue;
            }
            let graph = model(relations, Some(marked));
            let bounds = graph.loop_components(Edge::is_firework);
            let same = |left: usize, right: usize| {
                distance[left][right] < UNREACHABLE && distance[right][left] < UNREACHABLE
            };
            for (literal, &component) in bounds.iter().enumerate() {
                let eligible = [(2 * a, 2 * b + 1), (2 * b, 2 * a + 1)]
                    .into_iter()
                    .any(|(from, to)| same(literal, from) && same(literal, to));
                assert_eq!(component != usize::MAX, eligible, "{relations:?} {marked}");
                if eligible {
                    for (other, &other_component) in bounds.iter().enumerate() {
                        assert_eq!(
                            component == other_component,
                            same(literal, other),
                            "{relations:?} {marked}"
                        );
                    }
                }
            }
        }
    }
}

fn special_distances(relations: [Relation; 6], marked: usize, start: usize) -> [usize; 8] {
    fn walk(
        literal: usize,
        visited: u8,
        length: usize,
        used_mark: bool,
        transitions: &[Vec<(usize, bool)>; 8],
        distance: &mut [usize; 8],
    ) {
        if used_mark {
            distance[literal] = distance[literal].min(length);
        }
        for &(next, marks_step) in &transitions[literal] {
            if visited & (1 << next) == 0 {
                walk(
                    next,
                    visited | (1 << next),
                    length + 1,
                    used_mark || marks_step,
                    transitions,
                    distance,
                );
            }
        }
    }
    let mut transitions: [Vec<(usize, bool)>; 8] = std::array::from_fn(|_| Vec::new());
    for (i, ((a, b), relation)) in PAIRS.into_iter().zip(relations).enumerate() {
        for (from, to) in [(a, b), (b, a)] {
            if !relation.allows(false, false) {
                transitions[2 * from].push((2 * to + 1, i == marked));
            }
            if !relation.allows(true, true) {
                transitions[2 * from + 1].push((2 * to, false));
            }
        }
    }
    let mut distance = [UNREACHABLE; 8];
    walk(start, 1 << start, 0, false, &transitions, &mut distance);
    distance
}

#[test]
fn special_link_open_search_finds_the_routes_that_need_the_special_premise() {
    for relations in relation_patterns().filter(|relations| !satisfying(*relations).is_empty()) {
        for marked in 0..PAIRS.len() {
            if relations[marked].allows(false, false) {
                continue;
            }
            let graph = model(relations, Some(marked));
            let distances = (0..4)
                .map(|start| special_distances(relations, marked, 2 * start))
                .collect::<Vec<_>>();
            let expected = PAIRS
                .iter()
                .enumerate()
                .filter_map(|(i, &(a, b))| {
                    (3..UNREACHABLE)
                        .contains(&distances[a][2 * b + 1])
                        .then(|| elimination(i))
                })
                .collect::<BTreeSet<_>>();
            let mut ordinary = relations;
            ordinary[marked] = if relations[marked].allows(true, true) {
                Relation::None
            } else {
                Relation::AtMostOne
            };
            let ordinary_models = satisfying(ordinary);
            let essential = expected
                .iter()
                .copied()
                .filter(|action| {
                    let (a, b) = PAIRS[action.candidate().cell - OBSERVER];
                    ordinary_models
                        .iter()
                        .any(|&bits| !assignment(bits, a) && !assignment(bits, b))
                })
                .collect::<BTreeSet<_>>();
            let mut actual = BTreeSet::new();
            let _ =
                Rule::for_technique(Technique::FireworkAic)
                    .unwrap()
                    .visit(&graph, &mut |step| {
                        let HintEvidence::Inference { links } = &step.evidence else {
                            panic!("a Firework AIC must publish its links");
                        };
                        assert_witness(&graph, links, step.actions(), Technique::FireworkAic);
                        actual.extend(step.actions().iter().copied());
                        ControlFlow::Continue(())
                    });
            // A route through a contradiction or a shorter ordinary move may
            // be omitted. Every edit that actually needs the marked edge
            // must still appear, with a non-repeating witness.
            assert!(
                actual.is_subset(&expected),
                "{relations:?}, marked pair {marked}: {actual:?} vs {expected:?}"
            );
            assert!(
                essential.is_subset(&actual),
                "{relations:?}, marked pair {marked}: {essential:?} vs {actual:?}"
            );
        }
    }
}
