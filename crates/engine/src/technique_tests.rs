use super::*;
use crate::{DIGITS, candidates};

type Masks = [u16; CELLS];
const EMPTY: Board = [0; CELLS];

fn transpose(cell: usize) -> usize {
    cell % 9 * 9 + cell / 9
}

fn transpose_house(house: House) -> House {
    match house {
        House::Row(row) => House::Column(row),
        House::Column(col) => House::Row(col),
        House::Box(group) => House::Box(group % 3 * 3 + group / 3),
    }
}

fn transpose_pair(pair: ConjugatePair) -> ConjugatePair {
    let mut cells = pair.cells.map(transpose);
    cells.sort_unstable();
    ConjugatePair {
        house: transpose_house(pair.house),
        cells,
    }
}

fn transpose_houses(houses: &[House]) -> Vec<House> {
    let mut transposed: Vec<_> = houses.iter().copied().map(transpose_house).collect();
    transposed.sort_by_key(|house| match house {
        House::Row(row) => *row,
        House::Column(column) => 9 + column,
        House::Box(group) => 18 + group,
    });
    transposed
}

fn transpose_candidate(value: Candidate) -> Candidate {
    Candidate {
        cell: transpose(value.cell),
        digit: value.digit,
    }
}

fn transpose_scope(scope: ForcingScope) -> ForcingScope {
    match scope {
        ForcingScope::Candidate(candidate) => {
            ForcingScope::Candidate(transpose_candidate(candidate))
        }
        ForcingScope::Cell(cell) => ForcingScope::Cell(transpose(cell)),
        ForcingScope::House { house, digit } => ForcingScope::House {
            house: transpose_house(house),
            digit,
        },
    }
}

fn transpose_literal(literal: ForcingLiteral) -> ForcingLiteral {
    ForcingLiteral {
        candidate: transpose_candidate(literal.candidate),
        truth: literal.truth,
    }
}

fn transpose_link(link: CandidateLink) -> CandidateLink {
    CandidateLink {
        from: transpose_candidate(link.from),
        to: transpose_candidate(link.to),
        source: match link.source {
            LinkSource::Cell(cell) => LinkSource::Cell(transpose(cell)),
            LinkSource::House(house) => LinkSource::House(transpose_house(house)),
        },
        strength: link.strength,
    }
}

fn transpose_hint(hint: &Hint) -> Hint {
    let evidence = match &hint.evidence {
        HintEvidence::Cell(cell) => HintEvidence::Cell(transpose(*cell)),
        HintEvidence::House(house) => HintEvidence::House(transpose_house(*house)),
        HintEvidence::Intersection {
            source,
            target,
            cells,
        } => HintEvidence::Intersection {
            source: transpose_house(*source),
            target: transpose_house(*target),
            cells: cells.iter().copied().map(transpose).collect(),
        },
        HintEvidence::Pair {
            house,
            cells,
            digits,
        } => HintEvidence::Pair {
            house: transpose_house(*house),
            cells: cells.map(transpose),
            digits: *digits,
        },
        HintEvidence::Subset {
            house,
            cells,
            digits,
            locked_in,
        } => {
            let mut cells: Vec<_> = cells.iter().copied().map(transpose).collect();
            cells.sort_unstable();
            HintEvidence::Subset {
                house: transpose_house(*house),
                cells,
                digits: digits.clone(),
                locked_in: locked_in.map(transpose_house),
            }
        }
        HintEvidence::XWing {
            digit,
            bases,
            covers,
        } => HintEvidence::XWing {
            digit: *digit,
            bases: bases.map(transpose_house),
            covers: covers.map(transpose_house),
        },
        HintEvidence::Fish {
            digit,
            bases,
            covers,
            fins,
        } => {
            let mut fins: Vec<_> = fins.iter().copied().map(transpose).collect();
            fins.sort_unstable();
            HintEvidence::Fish {
                digit: *digit,
                bases: bases.iter().copied().map(transpose_house).collect(),
                covers: covers.iter().copied().map(transpose_house).collect(),
                fins,
            }
        }
        HintEvidence::ComplexFish {
            digit,
            bases,
            covers,
            fins,
        } => {
            let transpose_houses = |houses: &[House]| {
                let mut houses: Vec<_> = houses.iter().copied().map(transpose_house).collect();
                houses.sort_unstable();
                houses
            };
            let mut fins: Vec<_> = fins.iter().copied().map(transpose).collect();
            fins.sort_unstable();
            HintEvidence::ComplexFish {
                digit: *digit,
                bases: transpose_houses(bases),
                covers: transpose_houses(covers),
                fins,
            }
        }
        HintEvidence::Wing {
            pivot,
            pincers,
            digits,
        } => {
            let mut pincers = pincers.map(transpose);
            let mut digits = *digits;
            if pincers[0] > pincers[1] {
                pincers.swap(0, 1);
                digits.swap(0, 1);
            }
            HintEvidence::Wing {
                pivot: transpose(*pivot),
                pincers,
                digits,
            }
        }
        HintEvidence::WWing {
            wings,
            link,
            linked_digit,
            digit,
        } => {
            let mut wings = wings.map(transpose);
            wings.sort_unstable();
            HintEvidence::WWing {
                wings,
                link: transpose_pair(*link),
                linked_digit: *linked_digit,
                digit: *digit,
            }
        }
        HintEvidence::SingleDigitChain {
            digit,
            links,
            bridge,
        } => {
            let mut links = links.map(transpose_pair);
            let mut bridge = bridge.map(transpose);
            if hint.technique == Technique::TwoStringKite {
                links.swap(0, 1);
                bridge.swap(0, 1);
            }
            HintEvidence::SingleDigitChain {
                digit: *digit,
                links,
                bridge,
            }
        }
        HintEvidence::EmptyRectangle {
            digit,
            row,
            column,
            cells,
            link,
        } => {
            let mut cells: Vec<_> = cells.iter().copied().map(transpose).collect();
            cells.sort_unstable();
            HintEvidence::EmptyRectangle {
                digit: *digit,
                row: *column,
                column: *row,
                cells,
                link: transpose_pair(*link),
            }
        }
        HintEvidence::Chain { links } => HintEvidence::Chain {
            links: links.iter().copied().map(transpose_link).collect(),
        },
        HintEvidence::Inference { links } => {
            let transpose_node = |node: &InferenceNode| match node {
                InferenceNode::Candidate(value) => {
                    InferenceNode::Candidate(transpose_candidate(*value))
                }
                InferenceNode::Group { digit, cells } => {
                    let mut cells: Vec<_> = cells.iter().copied().map(transpose).collect();
                    cells.sort_unstable();
                    InferenceNode::Group {
                        digit: *digit,
                        cells,
                    }
                }
            };
            HintEvidence::Inference {
                links: links
                    .iter()
                    .map(|link| InferenceLink {
                        from: transpose_node(&link.from),
                        to: transpose_node(&link.to),
                        source: match link.source {
                            LinkSource::Cell(cell) => LinkSource::Cell(transpose(cell)),
                            LinkSource::House(house) => LinkSource::House(transpose_house(house)),
                        },
                        strength: link.strength,
                    })
                    .collect(),
            }
        }
        HintEvidence::Coloring {
            colors,
            links,
            reason,
        } => {
            let colors = std::array::from_fn(|color| {
                let mut values: Vec<_> = colors[color]
                    .iter()
                    .copied()
                    .map(transpose_candidate)
                    .collect();
                values.sort_unstable();
                values
            });
            let reason = match *reason {
                ColoringReason::BothColors => ColoringReason::BothColors,
                ColoringReason::SameColorConflict(candidates) => {
                    ColoringReason::SameColorConflict(candidates.map(transpose_candidate))
                }
                ColoringReason::EmptiedCell(cell) => ColoringReason::EmptiedCell(transpose(cell)),
                ColoringReason::EmptiedHouse { house, digit } => ColoringReason::EmptiedHouse {
                    house: transpose_house(house),
                    digit,
                },
            };
            HintEvidence::Coloring {
                colors,
                links: links.iter().copied().map(transpose_link).collect(),
                reason,
            }
        }
        HintEvidence::UniqueRectangle {
            corners,
            digits,
            support,
        } => {
            let mut corners = corners.map(transpose);
            corners.sort_unstable();
            let support = match support {
                RectangleSupport::ExtraCandidates(candidates) => {
                    let mut candidates: Vec<_> = candidates
                        .iter()
                        .copied()
                        .map(transpose_candidate)
                        .collect();
                    candidates.sort_unstable();
                    RectangleSupport::ExtraCandidates(candidates)
                }
                RectangleSupport::Subset {
                    houses,
                    cells,
                    digits,
                } => {
                    let mut cells: Vec<_> = cells.iter().copied().map(transpose).collect();
                    cells.sort_unstable();
                    RectangleSupport::Subset {
                        houses: transpose_houses(houses),
                        cells,
                        digits: digits.clone(),
                    }
                }
                RectangleSupport::StrongLinks { houses, digit } => RectangleSupport::StrongLinks {
                    houses: transpose_houses(houses),
                    digit: *digit,
                },
            };
            HintEvidence::UniqueRectangle {
                corners,
                digits: *digits,
                support,
            }
        }
        HintEvidence::BugPlusOne {
            cell, candidates, ..
        } => HintEvidence::BugPlusOne {
            cell: transpose(*cell),
            candidates: *candidates,
            houses: House::at(transpose(*cell)),
        },
        HintEvidence::WxyzWing {
            cells,
            digits,
            unrestricted,
        } => {
            let mut cells = cells.map(transpose);
            cells.sort_unstable();
            HintEvidence::WxyzWing {
                cells,
                digits: *digits,
                unrestricted: *unrestricted,
            }
        }
        HintEvidence::Forcing { scope, branches } => HintEvidence::Forcing {
            scope: scope.map(transpose_scope),
            branches: branches
                .iter()
                .map(|branch| ForcingBranch {
                    assumption: transpose_literal(branch.assumption),
                    steps: branch
                        .steps
                        .iter()
                        .map(|step| ForcingInference {
                            effect: transpose_literal(step.effect),
                            scope: transpose_scope(step.scope),
                            causes: step.causes.clone(),
                        })
                        .collect(),
                    conflict: branch.conflict.as_ref().map(|conflict| match conflict {
                        ForcingConflict::Opposite(pair) => ForcingConflict::Opposite(*pair),
                        ForcingConflict::Exhausted { scope, causes } => {
                            ForcingConflict::Exhausted {
                                scope: transpose_scope(*scope),
                                causes: causes.clone(),
                            }
                        }
                    }),
                })
                .collect(),
        },
        HintEvidence::AlsXz { sets, links } => HintEvidence::AlsXz {
            sets: sets.each_ref().map(transpose_als),
            links: links.clone(),
        },
        HintEvidence::AlsChain { sets, links } => HintEvidence::AlsChain {
            sets: sets.iter().map(transpose_als).collect(),
            links: links.clone(),
        },
        HintEvidence::DeathBlossom { stem, petals } => HintEvidence::DeathBlossom {
            stem: transpose(*stem),
            petals: petals
                .iter()
                .map(|petal| crate::BlossomPetal {
                    digit: petal.digit,
                    set: transpose_als(&petal.set),
                })
                .collect(),
        },
        HintEvidence::SueDeCoq {
            intersection,
            digits,
            line,
            block,
        } => {
            let sector = |subset: &crate::SectorSubset| crate::SectorSubset {
                house: transpose_house(subset.house),
                cells: transpose_cells(&subset.cells),
                digits: subset.digits.clone(),
            };
            HintEvidence::SueDeCoq {
                intersection: transpose_cells(intersection),
                digits: digits.clone(),
                line: sector(line),
                block: sector(block),
            }
        }
        HintEvidence::Exocet {
            bases,
            targets,
            cross_lines,
            covers,
            assignments,
        } => HintEvidence::Exocet {
            bases: bases.map(transpose),
            targets: targets.map(transpose),
            cross_lines: cross_lines.map(transpose_house),
            covers: covers
                .iter()
                .map(|cover| crate::ExocetCover {
                    digit: cover.digit,
                    cells: transpose_cells(&cover.cells),
                    houses: cover.houses.iter().copied().map(transpose_house).collect(),
                })
                .collect(),
            assignments: assignments.clone(),
        },
        HintEvidence::SkLoop(proof) => HintEvidence::SkLoop(Box::new(crate::SkLoopProof {
            anchors: [0, 3, 2, 1].map(|i| transpose(proof.anchors[i])),
            arms: std::array::from_fn(|i| transpose_cells(&proof.arms[7 - i])),
            links: std::array::from_fn(|i| transpose_sector_link(&proof.links[(14 - i) % 8])),
        })),
        HintEvidence::MultiSectorLockedSets {
            core,
            attachments,
            links,
        } => HintEvidence::MultiSectorLockedSets {
            core: transpose_cells(core),
            attachments: transpose_cells(attachments),
            links: links.iter().map(transpose_sector_link).collect(),
        },
    };
    let mut actions: Vec<_> = hint
        .actions
        .iter()
        .map(|action| match *action {
            HintAction::Place(Candidate { cell, digit }) => HintAction::Place(Candidate {
                cell: transpose(cell),
                digit,
            }),
            HintAction::Eliminate(Candidate { cell, digit }) => HintAction::Eliminate(Candidate {
                cell: transpose(cell),
                digit,
            }),
        })
        .collect();
    actions.sort_unstable();
    Hint {
        evidence,
        actions,
        technique: hint.technique,
    }
}

fn transpose_als(set: &crate::AlmostLockedSet) -> crate::AlmostLockedSet {
    crate::AlmostLockedSet {
        cells: transpose_cells(&set.cells),
        digits: set.digits.clone(),
    }
}

fn transpose_cells(cells: &[usize]) -> Vec<usize> {
    let mut cells: Vec<_> = cells.iter().copied().map(transpose).collect();
    cells.sort_unstable();
    cells
}

fn transpose_sector_link(link: &crate::SectorLink) -> crate::SectorLink {
    crate::SectorLink {
        house: transpose_house(link.house),
        digits: link.digits.clone(),
    }
}

fn assert_rule(board: Board, masks: Masks, expected: Hint, near_miss: (Board, Masks)) {
    let technique = expected.technique;
    let (miss_board, miss_masks) = near_miss;
    assert_eq!(
        find_technique(&board, &masks, technique).as_slice(),
        std::slice::from_ref(&expected)
    );
    assert!(find_technique(&miss_board, &miss_masks, technique).is_empty());
    assert_eq!(
        find_technique(
            &std::array::from_fn(|cell| board[transpose(cell)]),
            &std::array::from_fn(|cell| masks[transpose(cell)]),
            technique
        ),
        [transpose_hint(&expected)],
    );
    assert!(
        find_technique(
            &std::array::from_fn(|cell| miss_board[transpose(cell)]),
            &std::array::from_fn(|cell| miss_masks[transpose(cell)]),
            technique
        )
        .is_empty()
    );
}

fn assert_proof_with_near_miss(masks: Masks, expected: Hint, near_miss: Masks) {
    for (masks, expected, near_miss) in [
        (masks, expected.clone(), near_miss),
        (
            std::array::from_fn(|cell| masks[transpose(cell)]),
            transpose_hint(&expected),
            std::array::from_fn(|cell| near_miss[transpose(cell)]),
        ),
    ] {
        let proofs = find_technique(&EMPTY, &masks, expected.technique);
        assert!(
            proofs.contains(&expected),
            "missing {expected:?} in {proofs:?}"
        );
        assert!(
            !find_technique(&EMPTY, &near_miss, expected.technique)
                .iter()
                .any(|proof| { proof.actions == expected.actions })
        );
    }
}

#[test]
fn franken_fish_needs_every_unseen_base_candidate_to_have_a_cover() {
    let mut masks = [0; CELLS];
    for cell in [0, 1, 12, 24, 27, 28, 41, 52, 54, 58, 65, 71, 76, 80] {
        masks[cell] = digit_bit(9);
    }
    let mut near_miss = masks;
    // Restoring r7c3 permits the target r9c5 in a legal placement of all nine 9s.
    near_miss[56] = digit_bit(9);
    assert_proof_with_near_miss(
        masks,
        Hint {
            technique: Technique::FrankenFish,
            evidence: HintEvidence::ComplexFish {
                digit: 9,
                bases: vec![House::Row(3), House::Row(6), House::Box(0)],
                covers: vec![House::Column(0), House::Column(1), House::Column(4)],
                fins: vec![],
            },
            actions: vec![HintAction::Eliminate(Candidate { cell: 76, digit: 9 })],
        },
        near_miss,
    );
}

fn remove_digits(cells: impl IntoIterator<Item = usize>, digits: &[u8]) -> Vec<HintAction> {
    cells
        .into_iter()
        .flat_map(|cell| {
            digits
                .iter()
                .map(move |&digit| HintAction::Eliminate(Candidate { cell, digit }))
        })
        .collect()
}

fn confine(masks: &mut Masks, house: House, digit: u8, retained: &[usize]) {
    for cell in house.cells() {
        if !retained.contains(&cell) {
            masks[cell] &= !digit_bit(digit);
        }
    }
}

fn fish_masks(digit: u8, positions: impl IntoIterator<Item = usize>) -> Masks {
    let mut masks = [DIGITS & !digit_bit(digit); CELLS];
    for cell in positions {
        masks[cell] |= digit_bit(digit);
    }
    masks
}

fn pattern_masks(candidates: &[(usize, &[u8])]) -> Masks {
    let mut masks = [0; CELLS];
    for &(cell, digits) in candidates {
        masks[cell] = digits
            .iter()
            .copied()
            .map(digit_bit)
            .fold(0, |all, digit| all | digit);
    }
    masks
}

#[test]
fn als_xz_requires_every_occurrence_of_the_restricted_digit_to_see_the_other_set() {
    let masks = pattern_masks(&[(0, &[1, 3]), (3, &[1, 4]), (30, &[3, 4]), (27, &[3, 7, 8])]);
    let mut near_miss = masks;
    near_miss[30] |= digit_bit(1);
    assert_proof_with_near_miss(
        masks,
        Hint {
            technique: Technique::AlsXz,
            evidence: HintEvidence::AlsXz {
                sets: [
                    crate::AlmostLockedSet {
                        cells: vec![0],
                        digits: vec![1, 3],
                    },
                    crate::AlmostLockedSet {
                        cells: vec![3, 30],
                        digits: vec![1, 3, 4],
                    },
                ],
                links: vec![1],
            },
            actions: remove_digits([27], &[3]),
        },
        near_miss,
    );
}

#[test]
fn death_blossom_needs_a_petal_for_every_stem_digit() {
    let masks = pattern_masks(&[
        (0, &[1, 2, 3]),
        (1, &[1, 4]),
        (2, &[2, 4]),
        (3, &[3, 4]),
        (4, &[4, 7, 8]),
    ]);
    let mut near_miss = masks;
    near_miss[0] |= digit_bit(9);
    let expected = remove_digits([4], &[4]);
    for (masks, near_miss, stem, actions) in [
        (masks, near_miss, 0, expected.clone()),
        (
            std::array::from_fn(|cell| masks[transpose(cell)]),
            std::array::from_fn(|cell| near_miss[transpose(cell)]),
            0,
            remove_digits([transpose(4)], &[4]),
        ),
    ] {
        let proofs = find_technique(&EMPTY, &masks, Technique::DeathBlossom);
        assert!(proofs.iter().any(|proof| proof.actions == actions
            && matches!(
                &proof.evidence,
                HintEvidence::DeathBlossom { stem: source, petals }
                    if *source == stem && petals.iter().map(|petal| petal.digit).eq([1, 2, 3])
            )));
        assert!(!find_technique(&EMPTY, &near_miss, Technique::DeathBlossom).iter().any(|proof| {
            proof.actions == actions && matches!(proof.evidence, HintEvidence::DeathBlossom { stem: source, .. } if source == stem)
        }));
    }
}

#[test]
fn sue_de_coq_allows_a_shared_digit_outside_the_intersection_universe() {
    let masks = pattern_masks(&[
        (0, &[1, 2, 3, 4]),
        (1, &[1, 2, 3, 4]),
        (3, &[1, 5]),
        (4, &[2, 5]),
        (9, &[3, 5]),
        (10, &[4, 5]),
        (6, &[1, 5, 6]),
        (18, &[3, 5, 6]),
    ]);
    let mut near_miss = masks;
    near_miss[9] |= digit_bit(1);
    assert_proof_with_near_miss(
        masks,
        Hint {
            technique: Technique::SueDeCoq,
            evidence: HintEvidence::SueDeCoq {
                intersection: vec![0, 1],
                digits: vec![1, 2, 3, 4],
                line: crate::SectorSubset {
                    house: House::Row(0),
                    cells: vec![3, 4],
                    digits: vec![1, 2, 5],
                },
                block: crate::SectorSubset {
                    house: House::Box(0),
                    cells: vec![9, 10],
                    digits: vec![3, 4, 5],
                },
            },
            actions: [remove_digits([6], &[1, 5]), remove_digits([18], &[3, 5])].concat(),
        },
        near_miss,
    );
}

const RECTANGLE: [usize; 4] = [0, 1, 27, 28];

#[test]
fn wxyz_wing_requires_every_other_digit_to_be_restricted() {
    let mut masks = [DIGITS; CELLS];
    for (cell, digits) in [(0, 0b1111), (4, 0b1010), (6, 0b1100), (10, 0b1001)] {
        masks[cell] = digits;
    }
    let mut miss = masks;
    miss[4] |= digit_bit(1);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::WxyzWing,
            evidence: HintEvidence::WxyzWing {
                cells: [0, 4, 6, 10],
                digits: [1, 2, 3, 4],
                unrestricted: Some(4),
            },
            actions: remove_digits([1, 2], &[4]),
        },
        (EMPTY, miss),
    );
}

fn rectangle_masks(extras: [u16; 4]) -> Masks {
    let mut masks = [DIGITS; CELLS];
    for (cell, extra) in RECTANGLE.into_iter().zip(extras) {
        masks[cell] = digit_bit(1) | digit_bit(2) | extra;
    }
    masks
}

fn rectangle_hint(
    technique: Technique,
    support: RectangleSupport,
    actions: Vec<HintAction>,
) -> Hint {
    Hint {
        technique,
        evidence: HintEvidence::UniqueRectangle {
            corners: RECTANGLE,
            digits: [1, 2],
            support,
        },
        actions,
    }
}

#[test]
fn rectangle_one_removes_both_pair_digits_from_its_only_roof() {
    let technique = Technique::UniqueRectangle1;
    let masks = rectangle_masks([0, 0, 0, digit_bit(3)]);
    let mut miss = [DIGITS; CELLS];
    for cell in [0, 3, 27] {
        miss[cell] = digit_bit(1) | digit_bit(2);
    }
    miss[30] = miss[0] | digit_bit(3);
    assert_rule(
        EMPTY,
        masks,
        rectangle_hint(
            technique,
            RectangleSupport::ExtraCandidates(vec![Candidate { cell: 28, digit: 3 }]),
            remove_digits([28], &[1, 2]),
        ),
        (EMPTY, miss),
    );
}

#[test]
fn rectangle_two_and_five_eliminate_the_extra_seen_by_every_roof() {
    let extra = digit_bit(3);
    for (technique, roof_extras, roofs, targets) in [
        (
            Technique::UniqueRectangle2,
            [extra, extra, 0, 0],
            &[0, 1][..],
            &[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20][..],
        ),
        (
            Technique::UniqueRectangle5,
            [extra, extra, extra, 0],
            &[0, 1, 27][..],
            &[9, 18][..],
        ),
    ] {
        let masks = rectangle_masks(roof_extras);
        let mut miss = masks;
        miss[1] |= digit_bit(4);
        assert_rule(
            EMPTY,
            masks,
            rectangle_hint(
                technique,
                RectangleSupport::ExtraCandidates(
                    roofs
                        .iter()
                        .map(|&cell| Candidate { cell, digit: 3 })
                        .collect(),
                ),
                remove_digits(targets.iter().copied(), &[3]),
            ),
            (EMPTY, miss),
        );
    }
}

#[test]
fn rectangle_three_locks_the_extra_candidates_with_a_subset() {
    let mut masks = rectangle_masks([digit_bit(3), digit_bit(4), 0, 0]);
    masks[2] = digit_bit(3) | digit_bit(4);
    let mut miss = masks;
    miss[2] |= digit_bit(5);
    assert_rule(
        EMPTY,
        masks,
        rectangle_hint(
            Technique::UniqueRectangle3,
            RectangleSupport::Subset {
                houses: vec![House::Row(0), House::Box(0)],
                cells: vec![2],
                digits: vec![3, 4],
            },
            remove_digits([3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20], &[3, 4]),
        ),
        (EMPTY, miss),
    );
}

#[test]
fn rectangle_four_removes_the_other_digit_when_one_is_conjugate() {
    let house = House::Row(0);
    let mut masks = rectangle_masks([digit_bit(3), digit_bit(4), 0, 0]);
    confine(&mut masks, house, 1, &[0, 1]);
    let mut miss = masks;
    miss[2] |= digit_bit(1);
    assert_rule(
        EMPTY,
        masks,
        rectangle_hint(
            Technique::UniqueRectangle4,
            RectangleSupport::StrongLinks {
                houses: vec![house],
                digit: 1,
            },
            remove_digits([0, 1], &[2]),
        ),
        (EMPTY, miss),
    );
}

#[test]
fn rectangle_six_and_hidden_rectangle_require_their_conjugate_links() {
    let row0 = House::Row(0);
    let row3 = House::Row(3);
    let col0 = House::Column(0);
    let col1 = House::Column(1);
    for (technique, extras, links, candidates_to_remove, removed_digit) in [
        (
            Technique::UniqueRectangle6,
            [digit_bit(3), 0, 0, digit_bit(4)],
            &[
                (row0, [0, 1]),
                (row3, [27, 28]),
                (col0, [0, 27]),
                (col1, [1, 28]),
            ][..],
            &[0, 28][..],
            1,
        ),
        (
            Technique::HiddenRectangle,
            [0, digit_bit(3), digit_bit(4), digit_bit(5)],
            &[(row3, [27, 28]), (col1, [1, 28])][..],
            &[28][..],
            2,
        ),
    ] {
        let mut masks = rectangle_masks(extras);
        for &(house, pair) in links {
            confine(&mut masks, house, 1, &pair);
        }
        let mut miss = masks;
        miss[29] |= digit_bit(1);
        assert_rule(
            EMPTY,
            masks,
            rectangle_hint(
                technique,
                RectangleSupport::StrongLinks {
                    houses: links.iter().map(|(house, _)| *house).collect(),
                    digit: 1,
                },
                remove_digits(candidates_to_remove.iter().copied(), &[removed_digit]),
            ),
            (EMPTY, miss),
        );
    }
}

#[test]
fn bug_plus_one_requires_parity_in_every_house() {
    let board = Technique::BugPlusOne
        .practice_example()
        .position()
        .unwrap()
        .values()
        .unwrap();
    let masks = candidates(&board).unwrap();
    let cell = 4;
    let houses = House::at(cell);
    let outside = (0..CELLS)
        .find(|&cell| {
            masks[cell].count_ones() == 2
                && houses.iter().all(|house| !house.cells().contains(&cell))
        })
        .unwrap();
    let mut miss = masks;
    let replacement = 1 << ((!miss[outside] & DIGITS).trailing_zeros());
    miss[outside] = (miss[outside] & (miss[outside] - 1)) | replacement;
    assert_rule(
        board,
        masks,
        Hint {
            technique: Technique::BugPlusOne,
            evidence: HintEvidence::BugPlusOne {
                cell,
                candidates: [5, 7, 9],
                houses,
            },
            actions: vec![HintAction::Place(Candidate { cell, digit: 9 })],
        },
        (board, miss),
    );
}

#[test]
fn a_rectangle_match_can_never_override_an_ambiguous_position() {
    use crate::{
        analyze, opening_techniques, parse_givens, rate_puzzle, solve_logically, solve_position,
    };
    // This is the Type 1 practice position with r6c4 cleared. At least two solutions remain.
    let board = parse_givens(
        "135748600746329185289651743900080067867030000400067008392476851514893276678215934",
    )
    .unwrap();
    let technique = Technique::UniqueRectangle1;
    assert_eq!(analyze(&board), Analysis::Multiple);
    assert!(
        find_technique(&board, &candidates(&board).unwrap(), technique)
            .iter()
            .any(|hint| hint.actions == remove_digits([43], &[2, 9]))
    );
    assert!(matches!(
        solve_logically(&board, &[technique]),
        Err(Analysis::Multiple)
    ));
    assert_eq!(rate_puzzle(&board, &[technique]), Err(Analysis::Multiple));
    assert_eq!(opening_techniques(&board), Err(Analysis::Multiple));
    assert_eq!(
        technique_deductions(&board, None, technique),
        Err(HintError::Puzzle(Analysis::Multiple)),
    );
    assert_eq!(
        hint_choices(&board, None),
        Err(HintError::Puzzle(Analysis::Multiple))
    );
    let snapshot = PositionSnapshot::new(board);
    assert!(matches!(
        solve_position(&snapshot, &[technique]),
        Err(HintError::Puzzle(Analysis::Multiple))
    ));
}

#[test]
fn simple_coloring_wrap_eliminates_the_conflicting_color() {
    let masks = fish_masks(5, [0, 1, 10]);
    let first = Candidate { cell: 0, digit: 5 };
    let second = Candidate { cell: 1, digit: 5 };
    let third = Candidate { cell: 10, digit: 5 };
    let mut miss = masks;
    miss[7] |= digit_bit(5);
    miss[19] |= digit_bit(5);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::SimpleColoring,
            evidence: HintEvidence::Coloring {
                colors: [vec![first, third], vec![second]],
                links: vec![
                    CandidateLink {
                        from: first,
                        to: second,
                        source: LinkSource::House(House::Row(0)),
                        strength: LinkStrength::Strong,
                    },
                    CandidateLink {
                        from: second,
                        to: third,
                        source: LinkSource::House(House::Column(1)),
                        strength: LinkStrength::Strong,
                    },
                ],
                reason: ColoringReason::SameColorConflict([first, third]),
            },
            actions: remove_digits([0, 10], &[5]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn medusa_connects_two_colors_across_digits_in_a_cell() {
    let mut masks = [DIGITS; CELLS];
    masks[0] = digit_bit(1) | digit_bit(2);
    masks[4] = digit_bit(1) | digit_bit(2) | digit_bit(3);
    for digit in [1, 2] {
        confine(&mut masks, House::Row(0), digit, &[0, 4]);
    }
    let mut miss = masks;
    miss[1] |= digit_bit(2);
    let a = Candidate { cell: 0, digit: 1 };
    let b = Candidate { cell: 0, digit: 2 };
    let c = Candidate { cell: 4, digit: 1 };
    let d = Candidate { cell: 4, digit: 2 };
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::Medusa,
            evidence: HintEvidence::Coloring {
                colors: [vec![a, d], vec![b, c]],
                links: vec![
                    CandidateLink {
                        from: a,
                        to: c,
                        source: LinkSource::House(House::Row(0)),
                        strength: LinkStrength::Strong,
                    },
                    CandidateLink {
                        from: a,
                        to: b,
                        source: LinkSource::Cell(0),
                        strength: LinkStrength::Strong,
                    },
                    CandidateLink {
                        from: b,
                        to: d,
                        source: LinkSource::House(House::Row(0)),
                        strength: LinkStrength::Strong,
                    },
                ],
                reason: ColoringReason::BothColors,
            },
            actions: remove_digits([4], &[3]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn x_chain_uses_conjugate_end_links_and_a_weak_bridge() {
    let masks = fish_masks(5, [0, 4, 10, 13, 20]);
    let mut miss = masks;
    miss[7] |= digit_bit(5);
    let at = |cell| Candidate { cell, digit: 5 };
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::XChain,
            evidence: HintEvidence::Chain {
                links: vec![
                    CandidateLink {
                        from: at(0),
                        to: at(4),
                        source: LinkSource::House(House::Row(0)),
                        strength: LinkStrength::Strong,
                    },
                    CandidateLink {
                        from: at(4),
                        to: at(13),
                        source: LinkSource::House(House::Column(4)),
                        strength: LinkStrength::Weak,
                    },
                    CandidateLink {
                        from: at(13),
                        to: at(10),
                        source: LinkSource::House(House::Row(1)),
                        strength: LinkStrength::Strong,
                    },
                ],
            },
            actions: remove_digits([20], &[5]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn xy_chain_switches_digits_only_in_bivalue_cells() {
    let mut masks = [DIGITS; CELLS];
    for (cell, a, b) in [(0, 1, 2), (3, 2, 3), (12, 3, 4), (22, 4, 1)] {
        masks[cell] = digit_bit(a) | digit_bit(b);
    }
    let mut miss = masks;
    miss[12] |= digit_bit(5);
    let nodes = [
        (0, 1),
        (0, 2),
        (3, 2),
        (3, 3),
        (12, 3),
        (12, 4),
        (22, 4),
        (22, 1),
    ]
    .map(|(cell, digit)| Candidate { cell, digit });
    let sources = [
        LinkSource::Cell(0),
        LinkSource::House(House::Row(0)),
        LinkSource::Cell(3),
        LinkSource::House(House::Column(3)),
        LinkSource::Cell(12),
        LinkSource::House(House::Box(1)),
        LinkSource::Cell(22),
    ];
    // The two endpoints see the digit 1 at these cells, while the chain cells stay intact.
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::XYChain,
            evidence: HintEvidence::Chain {
                links: sources
                    .into_iter()
                    .enumerate()
                    .map(|(i, source)| CandidateLink {
                        from: nodes[i],
                        to: nodes[i + 1],
                        source,
                        strength: if i % 2 == 0 {
                            LinkStrength::Strong
                        } else {
                            LinkStrength::Weak
                        },
                    })
                    .collect(),
            },
            actions: remove_digits([4, 5, 18, 19, 20], &[1]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn swordfish_and_jellyfish_allow_missing_corners_and_eliminate_outside_the_bases() {
    for (technique, core, targets, base_rows, cover_columns) in [
        (
            Technique::Swordfish,
            &[0, 4, 31, 35, 54, 62][..],
            &[9, 49, 71][..],
            &[0, 3, 6][..],
            &[0, 4, 8][..],
        ),
        (
            Technique::Jellyfish,
            &[0, 2, 29, 31, 58, 62, 72, 80][..],
            &[9, 20, 49, 71][..],
            &[0, 3, 6, 8][..],
            &[0, 2, 4, 8][..],
        ),
    ] {
        let masks = fish_masks(6, core.iter().chain(targets).copied());
        let mut miss = masks;
        miss[1] |= digit_bit(6);
        assert_rule(
            EMPTY,
            masks,
            Hint {
                technique,
                evidence: HintEvidence::Fish {
                    digit: 6,
                    bases: base_rows.iter().copied().map(House::Row).collect(),
                    covers: cover_columns.iter().copied().map(House::Column).collect(),
                    fins: vec![],
                },
                actions: remove_digits(targets.iter().copied(), &[6]),
            },
            (EMPTY, miss),
        );
    }
}

#[test]
fn fish_with_fins_eliminate_only_candidates_that_see_every_fin() {
    for (finned, sashimi, remaining_core, base_rows, cover_columns) in [
        (
            Technique::FinnedXWing,
            Technique::SashimiXWing,
            &[27, 31][..],
            &[0, 3][..],
            &[0, 4][..],
        ),
        (
            Technique::FinnedSwordfish,
            Technique::SashimiSwordfish,
            &[31, 35, 54, 62][..],
            &[0, 3, 6][..],
            &[0, 4, 8][..],
        ),
        (
            Technique::FinnedJellyfish,
            Technique::SashimiJellyfish,
            &[31, 33, 60, 62, 72, 80][..],
            &[0, 3, 6, 8][..],
            &[0, 4, 6, 8][..],
        ),
    ] {
        for (technique, pivot_row_core) in [(finned, &[0, 4][..]), (sashimi, &[4][..])] {
            let masks = fish_masks(
                7,
                remaining_core
                    .iter()
                    .chain(pivot_row_core)
                    .copied()
                    .chain([1, 2, 9, 18, 45]),
            );
            let mut miss = masks;
            miss[7] |= digit_bit(7);
            assert_rule(
                EMPTY,
                masks,
                Hint {
                    technique,
                    evidence: HintEvidence::Fish {
                        digit: 7,
                        bases: base_rows.iter().copied().map(House::Row).collect(),
                        covers: cover_columns.iter().copied().map(House::Column).collect(),
                        fins: vec![1, 2],
                    },
                    actions: remove_digits([9, 18], &[7]),
                },
                (EMPTY, miss),
            );
            let other_kind = if technique == finned { sashimi } else { finned };
            assert!(find_technique(&EMPTY, &masks, other_kind).is_empty());
        }
    }
}

#[test]
fn xy_and_xyz_wings_have_different_visibility_requirements() {
    for (technique, pivot, targets) in [
        (Technique::XYWing, 0b011, &[1, 2, 12, 13, 14][..]),
        (Technique::XYZWing, 0b111, &[1, 2][..]),
    ] {
        let mut masks = [DIGITS; CELLS];
        masks[0] = pivot;
        masks[3] = 0b101;
        masks[10] = 0b110;
        let mut miss = masks;
        miss[10] |= digit_bit(4);
        assert_rule(
            EMPTY,
            masks,
            Hint {
                technique,
                evidence: HintEvidence::Wing {
                    pivot: 0,
                    pincers: [3, 10],
                    digits: [1, 2, 3],
                },
                actions: remove_digits(targets.iter().copied(), &[3]),
            },
            (EMPTY, miss),
        );
    }
}

#[test]
fn w_wing_requires_a_conjugate_pair_on_the_other_candidate() {
    let mut masks = [DIGITS; CELLS];
    masks[0] = 0b011;
    masks[40] = 0b011;
    let house = House::Column(6);
    let cells = [6, 42];
    confine(&mut masks, house, 2, &cells);
    let mut miss = masks;
    miss[69] |= digit_bit(2);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::WWing,
            evidence: HintEvidence::WWing {
                wings: [0, 40],
                link: ConjugatePair { house, cells },
                linked_digit: 2,
                digit: 1,
            },
            actions: remove_digits([4, 36], &[1]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn skyscraper_requires_exactly_one_aligned_end_of_parallel_pairs() {
    let mut masks = [DIGITS; CELLS];
    let first = ConjugatePair {
        house: House::Row(0),
        cells: [0, 3],
    };
    let second = ConjugatePair {
        house: House::Row(1),
        cells: [9, 14],
    };
    for pair in [first, second] {
        confine(&mut masks, pair.house, 1, &pair.cells);
    }
    let mut miss = masks;
    miss[14] &= !digit_bit(1);
    miss[12] |= digit_bit(1);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::Skyscraper,
            evidence: HintEvidence::SingleDigitChain {
                digit: 1,
                links: [first, second],
                bridge: [0, 9],
            },
            actions: remove_digits([21, 22, 23], &[1]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn two_string_kite_joins_a_row_and_column_through_distinct_cells_in_a_box() {
    let mut masks = [DIGITS; CELLS];
    let row = ConjugatePair {
        house: House::Row(0),
        cells: [0, 6],
    };
    let column = ConjugatePair {
        house: House::Column(1),
        cells: [10, 37],
    };
    for pair in [row, column] {
        confine(&mut masks, pair.house, 4, &pair.cells);
    }
    let mut miss = masks;
    // Put the connector in the next box band without breaking the column link.
    miss[10] &= !digit_bit(4);
    miss[28] |= digit_bit(4);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::TwoStringKite,
            evidence: HintEvidence::SingleDigitChain {
                digit: 4,
                links: [row, column],
                bridge: [0, 10],
            },
            actions: remove_digits([42], &[4]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn empty_rectangle_depends_on_the_whole_box_fitting_the_cross() {
    let mut masks = [DIGITS; CELLS];
    let link = ConjugatePair {
        house: House::Column(6),
        cells: [6, 42],
    };
    confine(&mut masks, House::Box(0), 5, &[0, 1, 9]);
    confine(&mut masks, link.house, 5, &link.cells);
    let mut miss = masks;
    miss[10] |= digit_bit(5);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::EmptyRectangle,
            evidence: HintEvidence::EmptyRectangle {
                digit: 5,
                row: 0,
                column: 0,
                cells: vec![0, 1, 9],
                link,
            },
            actions: remove_digits([36], &[5]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn naked_triples_and_quadruples_use_the_union_of_the_cells() {
    for (technique, cells, candidates, target_digits) in [
        (
            Technique::NakedTriple,
            &[0, 4, 8][..],
            &[[1, 2], [1, 3], [2, 3]][..],
            &[1, 2, 3][..],
        ),
        (
            Technique::NakedQuadruple,
            &[0, 3, 5, 8][..],
            &[[1, 2], [2, 3], [3, 4], [1, 4]][..],
            &[1, 2, 3, 4][..],
        ),
    ] {
        let mut masks = [DIGITS; CELLS];
        for (&cell, &[a, b]) in cells.iter().zip(candidates) {
            masks[cell] = digit_bit(a) | digit_bit(b);
        }
        let mut miss = masks;
        miss[cells[0]] |= digit_bit(5);
        assert_rule(
            EMPTY,
            masks,
            Hint {
                technique,
                evidence: HintEvidence::Subset {
                    house: House::Row(0),
                    cells: cells.to_vec(),
                    digits: target_digits.to_vec(),
                    locked_in: None,
                },
                actions: remove_digits((0..9).filter(|cell| !cells.contains(cell)), target_digits),
            },
            (EMPTY, miss),
        );
    }
}

#[test]
fn hidden_triples_and_quadruples_clear_unrelated_candidates() {
    for (technique, cells, retained) in [
        (Technique::HiddenTriple, &[0, 4, 8][..], &[1, 2, 3][..]),
        (
            Technique::HiddenQuadruple,
            &[0, 3, 5, 8][..],
            &[1, 2, 3, 4][..],
        ),
    ] {
        let mut masks = [DIGITS; CELLS];
        let house = House::Row(0);
        for (index, &digit) in retained.iter().enumerate() {
            let next = (index + 1) % cells.len();
            confine(&mut masks, house, digit, &[cells[index], cells[next]]);
        }
        let mut miss = masks;
        miss[1] |= digit_bit(1);
        let other_digits: Vec<_> = (1..=9).filter(|digit| !retained.contains(digit)).collect();
        assert_rule(
            EMPTY,
            masks,
            Hint {
                technique,
                evidence: HintEvidence::Subset {
                    house,
                    cells: cells.to_vec(),
                    digits: retained.to_vec(),
                    locked_in: None,
                },
                actions: remove_digits(cells.iter().copied(), &other_digits),
            },
            (EMPTY, miss),
        );
    }
}

#[test]
fn locked_pairs_and_triples_remove_candidates_in_the_box_and_beyond_it() {
    for (technique, masks, target_digits) in [
        (Technique::LockedPair, &[0b011, 0b011][..], &[1, 2][..]),
        (
            Technique::LockedTriple,
            &[0b011, 0b110, 0b101][..],
            &[1, 2, 3][..],
        ),
    ] {
        let mut grid = [DIGITS; CELLS];
        grid[..masks.len()].copy_from_slice(masks);
        let subset_digits = target_digits
            .iter()
            .fold(0, |bits, &digit| bits | digit_bit(digit));
        let mut miss = grid;
        for mask in &mut miss[3..9] {
            *mask &= !subset_digits;
        }
        assert_rule(
            EMPTY,
            grid,
            Hint {
                technique,
                evidence: HintEvidence::Subset {
                    house: House::Row(0),
                    cells: (0..masks.len()).collect(),
                    digits: target_digits.to_vec(),
                    locked_in: Some(House::Box(0)),
                },
                actions: remove_digits(
                    (masks.len()..9).chain([9, 10, 11, 18, 19, 20]),
                    target_digits,
                ),
            },
            (EMPTY, miss),
        );
        for cell in House::Box(0)
            .cells()
            .into_iter()
            .filter(|&cell| cell >= masks.len())
        {
            grid[cell] &= !subset_digits;
        }
        assert!(find_technique(&EMPTY, &grid, technique).is_empty());
    }
}

#[test]
fn full_house_fills_the_only_empty_cell() {
    let mut board = EMPTY;
    board[..8].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
    let mut miss = board;
    miss[7] = 0;
    assert_rule(
        board,
        candidates(&board).unwrap(),
        Hint {
            technique: Technique::FullHouse,
            evidence: HintEvidence::House(House::Row(0)),
            actions: vec![HintAction::Place(Candidate { cell: 8, digit: 9 })],
        },
        (miss, candidates(&miss).unwrap()),
    );
}

#[test]
fn naked_single_requires_one_candidate_in_the_cell() {
    let mut masks = [DIGITS; CELLS];
    masks[3] = digit_bit(7);
    let mut miss = masks;
    miss[3] |= digit_bit(9);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::NakedSingle,
            evidence: HintEvidence::Cell(3),
            actions: vec![HintAction::Place(Candidate { cell: 3, digit: 7 })],
        },
        (EMPTY, miss),
    );
}

#[test]
fn hidden_single_requires_one_location_for_a_digit() {
    let mut masks = [DIGITS; CELLS];
    confine(&mut masks, House::Row(0), 9, &[4]);
    let mut miss = masks;
    miss[6] |= digit_bit(9);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::HiddenSingle,
            evidence: HintEvidence::House(House::Row(0)),
            actions: vec![HintAction::Place(Candidate { cell: 4, digit: 9 })],
        },
        (EMPTY, miss),
    );
}

#[test]
fn pointing_clears_the_line_outside_the_source_box() {
    let mut masks = [DIGITS; CELLS];
    confine(&mut masks, House::Box(0), 1, &[0, 1]);
    let mut miss = masks;
    miss[9] |= digit_bit(1);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::Pointing,
            evidence: HintEvidence::Intersection {
                source: House::Box(0),
                target: House::Row(0),
                cells: vec![0, 1],
            },
            actions: remove_digits(3..9, &[1]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn claiming_clears_the_box_outside_the_source_line() {
    let mut masks = [DIGITS; CELLS];
    confine(&mut masks, House::Row(0), 1, &[0, 1]);
    let mut miss = masks;
    miss[3] |= digit_bit(1);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::Claiming,
            evidence: HintEvidence::Intersection {
                source: House::Row(0),
                target: House::Box(0),
                cells: vec![0, 1],
            },
            actions: remove_digits([9, 10, 11, 18, 19, 20], &[1]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn naked_pair_clears_its_digits_from_other_cells() {
    let mut masks = [DIGITS; CELLS];
    masks[0] = digit_bit(1) | digit_bit(2);
    masks[4] = masks[0];
    let mut miss = masks;
    miss[4] |= digit_bit(3);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::NakedPair,
            evidence: HintEvidence::Pair {
                house: House::Row(0),
                cells: [0, 4],
                digits: [1, 2],
            },
            actions: remove_digits([1, 2, 3, 5, 6, 7, 8], &[1, 2]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn hidden_pair_clears_other_digits_from_its_cells() {
    let mut masks = [DIGITS; CELLS];
    confine(&mut masks, House::Row(0), 6, &[0, 4]);
    confine(&mut masks, House::Row(0), 7, &[0, 4]);
    let mut miss = masks;
    miss[2] |= digit_bit(6);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::HiddenPair,
            evidence: HintEvidence::Pair {
                house: House::Row(0),
                cells: [0, 4],
                digits: [6, 7],
            },
            actions: remove_digits([0, 4], &[1, 2, 3, 4, 5, 8, 9]),
        },
        (EMPTY, miss),
    );
}

#[test]
fn x_wing_requires_matching_base_lines_and_clears_cover_candidates() {
    let mut masks = [DIGITS; CELLS];
    confine(&mut masks, House::Row(0), 1, &[0, 4]);
    confine(&mut masks, House::Row(4), 1, &[36, 40]);
    let mut miss = masks;
    miss[8] |= digit_bit(1);
    let targets = (0..9)
        .filter(|&row| row != 0 && row != 4)
        .flat_map(|row| [row * 9, row * 9 + 4]);
    assert_rule(
        EMPTY,
        masks,
        Hint {
            technique: Technique::XWing,
            evidence: HintEvidence::XWing {
                digit: 1,
                bases: [House::Row(0), House::Row(4)],
                covers: [House::Column(0), House::Column(4)],
            },
            actions: remove_digits(targets, &[1]),
        },
        (EMPTY, miss),
    );
}
