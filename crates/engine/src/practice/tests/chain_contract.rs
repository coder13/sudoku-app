use super::{als_loop_locks, assert_link_is_valid, candidates_conflict};
use crate::{
    Board, Candidate, CandidateLink, ColoringReason, Hint, HintAction, HintEvidence, InferenceLink,
    InferenceNode, LinkSource,
    LinkStrength::{Strong, Weak},
    Technique, candidates, technique_deductions_at,
};
use Technique::*;
use std::collections::BTreeSet;

#[derive(Clone, Copy)]
enum Proof {
    Open,
    Discontinuous,
    Continuous,
    Coloring,
}

const CHAIN_TECHNIQUES: [(Technique, Proof); 18] = [
    (SimpleColoring, Proof::Coloring),
    (Medusa, Proof::Coloring),
    (XChain, Proof::Open),
    (XYChain, Proof::Open),
    (Aic, Proof::Open),
    (GroupedAic, Proof::Open),
    (AlsAic, Proof::Open),
    (FireworkAic, Proof::Open),
    (TridagonAic, Proof::Open),
    (UniqueRectangleAic, Proof::Open),
    (DiscontinuousNiceLoop, Proof::Discontinuous),
    (GroupedDiscontinuousNiceLoop, Proof::Discontinuous),
    (AlsDiscontinuousNiceLoop, Proof::Discontinuous),
    (UniqueRectangleDiscontinuousNiceLoop, Proof::Discontinuous),
    (ContinuousNiceLoop, Proof::Continuous),
    (GroupedContinuousNiceLoop, Proof::Continuous),
    (AlsContinuousNiceLoop, Proof::Continuous),
    (UniqueRectangleContinuousNiceLoop, Proof::Continuous),
];

fn individual(link: &CandidateLink) -> InferenceLink {
    InferenceLink {
        from: InferenceNode::Candidate(link.from),
        to: InferenceNode::Candidate(link.to),
        source: link.source,
        strength: link.strength,
    }
}

fn true_in(node: &InferenceNode, solution: &Board) -> bool {
    node.candidates()
        .any(|candidate| solution[candidate.cell] == candidate.digit)
}

fn rules_out(node: &InferenceNode, target: Candidate) -> bool {
    node.candidates()
        .all(|member| candidates_conflict(member, target))
}

fn assert_live_action(action: HintAction, masks: &[u16; 81], solution: &Board) {
    let target = action.candidate();
    assert_ne!(
        masks[target.cell] & (1 << (target.digit - 1)),
        0,
        "{action:?} must be live"
    );
    assert_eq!(
        solution[target.cell] == target.digit,
        matches!(action, HintAction::Place(_)),
        "{action:?}"
    );
}

fn assert_chain(
    links: &[InferenceLink],
    hint: &Hint,
    proof: Proof,
    masks: &[u16; 81],
    solution: &Board,
) {
    let has_source =
        |is_source: fn(LinkSource) -> bool| links.iter().any(|link| is_source(link.source));
    let grouped = links.iter().any(|link| {
        [&link.from, &link.to]
            .into_iter()
            .any(|node| !matches!(node, InferenceNode::Candidate(_)))
    });
    match hint.technique {
        GroupedAic | GroupedContinuousNiceLoop | GroupedDiscontinuousNiceLoop => assert!(grouped),
        XChain | XYChain | Aic | ContinuousNiceLoop | DiscontinuousNiceLoop => assert!(!grouped),
        AlsAic | AlsContinuousNiceLoop | AlsDiscontinuousNiceLoop => {
            assert!(has_source(|source| {
                matches!(
                    source,
                    LinkSource::AlmostLockedSet(_) | LinkSource::AlmostLockedSetCell { .. }
                )
            }))
        }
        FireworkAic => assert!(has_source(|source| matches!(
            source,
            LinkSource::Firework(_)
        ))),
        TridagonAic => assert!(has_source(|source| matches!(
            source,
            LinkSource::Tridagon { .. }
        ))),
        UniqueRectangleAic
        | UniqueRectangleContinuousNiceLoop
        | UniqueRectangleDiscontinuousNiceLoop => assert!(has_source(|source| matches!(
            source,
            LinkSource::UniqueRectangle { .. }
        ))),
        _ => unreachable!(),
    }
    for link in links {
        assert_link_is_valid(link, masks);
        let endpoints = [true_in(&link.from, solution), true_in(&link.to, solution)];
        match link.strength {
            Strong => assert!(endpoints.contains(&true), "{link:?}"),
            Weak => assert!(endpoints.contains(&false), "{link:?}"),
        }
    }
    assert!(links.len() >= 3);
    for pair in links.windows(2) {
        assert_eq!(pair[0].to, pair[1].from);
        assert_ne!(pair[0].strength, pair[1].strength);
    }
    let first = &links[0];
    let last = links.last().unwrap();
    match proof {
        Proof::Open => {
            assert_ne!(first.from, last.to);
            assert_eq!([first.strength, last.strength], [Strong, Strong]);
            for &action in &hint.actions {
                assert!(matches!(action, HintAction::Eliminate(_)));
                assert!(
                    rules_out(&first.from, action.candidate())
                        && rules_out(&last.to, action.candidate())
                );
            }
        }
        Proof::Continuous => {
            assert_eq!(first.from, last.to);
            assert_eq!([first.strength, last.strength], [Strong, Weak]);
            for &action in &hint.actions {
                assert!(matches!(action, HintAction::Eliminate(_)));
                let target = action.candidate();
                assert!(
                    links.iter().any(|link| match link.strength {
                        Weak => rules_out(&link.from, target) && rules_out(&link.to, target),
                        Strong => als_loop_locks(link, masks, target),
                    }),
                    "no step in the loop proves {action:?}"
                );
            }
        }
        Proof::Discontinuous => {
            assert_eq!(first.from, last.to);
            assert_eq!(first.strength, last.strength);
            let InferenceNode::Candidate(join) = first.from else {
                panic!("a discontinuity must return to an individual candidate");
            };
            let expected = if first.strength == Strong {
                HintAction::Place(join)
            } else {
                HintAction::Eliminate(join)
            };
            assert_eq!(hint.actions, [expected]);
        }
        Proof::Coloring => unreachable!(),
    }
}

fn assert_coloring(hint: &Hint, masks: &[u16; 81], solution: &Board) {
    let HintEvidence::Coloring {
        colors,
        links,
        reason,
    } = &hint.evidence
    else {
        panic!("a coloring move must carry its evidence");
    };
    let members: BTreeSet<_> = colors.iter().flatten().copied().collect();
    assert_eq!(members.len(), colors[0].len() + colors[1].len());
    assert_eq!(links.len() + 1, members.len());
    for link in links {
        assert_eq!(link.strength, Strong);
        assert_link_is_valid(&individual(link), masks);
        assert!(
            colors.iter().any(|color| color.contains(&link.from))
                && colors.iter().any(|color| color.contains(&link.to))
                && !colors
                    .iter()
                    .any(|color| color.contains(&link.from) && color.contains(&link.to))
        );
    }
    let mut reached = BTreeSet::from([colors[0][0]]);
    while reached.len() < members.len() {
        let previous = reached.len();
        for link in links {
            if reached.contains(&link.from) || reached.contains(&link.to) {
                reached.extend([link.from, link.to]);
            }
        }
        assert!(
            reached.len() > previous,
            "every colored candidate must be linked to the group"
        );
    }
    let true_color = usize::from(solution[colors[1][0].cell] == colors[1][0].digit);
    for (side, color) in colors.iter().enumerate() {
        assert!(
            color
                .iter()
                .all(|value| (solution[value.cell] == value.digit) == (side == true_color))
        );
    }
    let rejected = &colors[1 - true_color];
    let rejected_by = |target| {
        rejected
            .iter()
            .any(|&value| candidates_conflict(value, target))
    };
    match reason {
        ColoringReason::BothColors => {
            for &action in &hint.actions {
                let target = action.candidate();
                assert!(matches!(action, HintAction::Eliminate(_)) && !members.contains(&target));
                assert!(colors.iter().all(|color| {
                    color
                        .iter()
                        .any(|&value| candidates_conflict(value, target))
                }));
            }
            return;
        }
        ColoringReason::SameColorConflict([a, b]) => {
            assert!(rejected.contains(a) && rejected.contains(b) && candidates_conflict(*a, *b));
        }
        ColoringReason::EmptiedCell(cell) => {
            assert!(masks[*cell].count_ones() >= 2);
            assert!(
                crate::hints::digits(masks[*cell])
                    .all(|digit| rejected_by(Candidate { cell: *cell, digit }))
            );
        }
        ColoringReason::EmptiedHouse { house, digit } => {
            let possible: Vec<_> = house
                .cells()
                .into_iter()
                .filter(|&cell| masks[cell] & (1 << (digit - 1)) != 0)
                .map(|cell| Candidate {
                    cell,
                    digit: *digit,
                })
                .collect();
            assert!(possible.len() >= 2 && possible.into_iter().all(rejected_by));
        }
    }
    assert_eq!(
        hint.actions,
        rejected
            .iter()
            .copied()
            .map(HintAction::Eliminate)
            .collect::<Vec<_>>()
    );
}

#[test]
fn practice_chain_catalog_replays_all_returned_proofs_against_their_premises_and_solution() {
    let mut grouped_type_two = 0;
    for (technique, proof) in CHAIN_TECHNIQUES {
        for (index, example) in technique.practice_examples().into_iter().enumerate() {
            let position = example.position().unwrap();
            let values = position.values().unwrap();
            let solution = crate::solve(&values).unwrap();
            let mut masks = candidates(&values).unwrap();
            for (mask, eliminated) in masks.iter_mut().zip(position.eliminations) {
                *mask &= !eliminated;
            }
            let hints = technique_deductions_at(&position, technique).unwrap();
            assert!(
                example
                    .expected_actions
                    .iter()
                    .all(|expected| hints.iter().any(|hint| hint.actions.contains(expected))),
                "practice puzzle {} for {technique:?} lost its published move",
                index + 1
            );
            for hint in hints {
                assert_eq!(hint.technique, technique);
                for &action in &hint.actions {
                    assert_live_action(action, &masks, &solution);
                }
                match (&hint.evidence, proof) {
                    (HintEvidence::Chain { links }, Proof::Open) => {
                        let path: Vec<_> = links.iter().map(individual).collect();
                        for link in links {
                            if technique == XChain {
                                assert_eq!(link.from.digit, link.to.digit);
                            } else if link.strength == Strong {
                                assert_eq!(link.from.cell, link.to.cell);
                                assert_ne!(link.from.digit, link.to.digit);
                            } else {
                                assert_eq!(link.from.digit, link.to.digit);
                                assert_ne!(link.from.cell, link.to.cell);
                            }
                        }
                        assert_chain(&path, &hint, proof, &masks, &solution);
                    }
                    (HintEvidence::Inference { links }, proof) => {
                        assert_chain(links, &hint, proof, &masks, &solution);
                        if technique == GroupedAic {
                            let first = &links[0].from;
                            let last = &links.last().unwrap().to;
                            let grouped_endpoint = [first, last]
                                .iter()
                                .any(|node| matches!(node, InferenceNode::Group { .. }));
                            let first_digit = first.candidates().next().unwrap().digit;
                            let last_digit = last.candidates().next().unwrap().digit;
                            grouped_type_two +=
                                usize::from(grouped_endpoint && first_digit != last_digit);
                        }
                    }
                    (HintEvidence::Coloring { .. }, Proof::Coloring) => {
                        assert_coloring(&hint, &masks, &solution)
                    }
                    _ => panic!("incorrect evidence for {technique:?}: {:?}", hint.evidence),
                }
            }
        }
    }
    assert!(
        grouped_type_two > 0,
        "the catalog must exercise different-digit grouped endpoints"
    );
}

#[cfg(all(feature = "wasm-api", feature = "teaching"))]
#[test]
fn practice_chain_protocol_preserves_actions_and_ordered_link_evidence() {
    use serde_json::{Value, json};

    for (technique, shape) in CHAIN_TECHNIQUES {
        let request = json!({ "type": "practice-examples", "technique": technique.id() });
        let response: Value =
            serde_json::from_slice(&crate::protocol::process(request.to_string().as_bytes()))
                .unwrap();
        let cases = response["value"]
            .as_array()
            .unwrap_or_else(|| panic!("{technique:?}: {response}"));
        let examples = technique.practice_examples();
        assert_eq!(cases.len(), examples.len());
        for (wire, example) in cases.iter().zip(examples) {
            let proof = &wire["deduction"];
            assert_eq!(proof["technique"], technique.id());
            assert_eq!(proof["actions"], json!(example.expected_actions));
            assert_eq!(wire["suggestion"], proof["actions"][0]);
            assert!(
                wire["answers"]
                    .as_array()
                    .unwrap()
                    .contains(&wire["suggestion"])
            );
            let position = example.position().unwrap();
            let original = technique_deductions_at(&position, technique)
                .unwrap()
                .into_iter()
                .find(|hint| hint.actions == example.expected_actions)
                .unwrap();
            assert_eq!(*proof, serde_json::to_value(original).unwrap());

            let evidence = &proof["evidence"];
            let key = match (technique, shape) {
                (_, Proof::Coloring) => "coloring",
                (XChain | XYChain, _) => "chain",
                _ => "inference",
            };
            let links = evidence[key]["links"].as_array().unwrap();
            if let Proof::Coloring = shape {
                assert_eq!(evidence[key]["colors"].as_array().unwrap().len(), 2);
                assert!(!evidence[key]["reason"].is_null());
                assert!(links.iter().all(|link| link["strength"] == "strong"));
            } else {
                assert!(links.windows(2).all(|pair| pair[0]["to"] == pair[1]["from"]
                    && pair[0]["strength"] != pair[1]["strength"]));
            }
            assert!(links.iter().all(|link| !link["source"].is_null()));
        }
    }
}
