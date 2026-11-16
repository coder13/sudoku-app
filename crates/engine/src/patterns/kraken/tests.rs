use super::*;
use crate::{
    Board, CELLS, Candidate, InferenceNode, KrakenLink, KrakenLinkReason, VerifiedTemplate,
    candidates, hints::digit_bit, technique_deductions_at,
};

fn members(node: &InferenceNode) -> (u8, Vec<usize>) {
    match node {
        InferenceNode::Candidate(candidate) => (candidate.digit, vec![candidate.cell]),
        InferenceNode::Group { digit, cells } => (*digit, cells.clone()),
    }
}

fn peers(a: usize, b: usize) -> bool {
    a != b
        && House::at(a)
            .into_iter()
            .any(|house| house.cells().contains(&b))
}

fn replay(chain: &[KrakenLink], assumption: Candidate, removal: Candidate, masks: &[u16; CELLS]) {
    assert_eq!(
        chain.first().unwrap().from,
        InferenceNode::Candidate(assumption)
    );
    assert_eq!(chain.last().unwrap().to, InferenceNode::Candidate(removal));
    assert_eq!(chain.len() % 2, 1);
    for adjacent in chain.windows(2) {
        assert_eq!(adjacent[0].to, adjacent[1].from);
    }
    for (index, link) in chain.iter().enumerate() {
        let (a, left) = members(&link.from);
        let (b, right) = members(&link.to);
        assert!(left.iter().all(|&cell| masks[cell] & digit_bit(a) != 0));
        assert!(right.iter().all(|&cell| masks[cell] & digit_bit(b) != 0));
        assert_eq!(
            matches!(link.reason, KrakenLinkReason::Exclusion),
            index % 2 == 0
        );
        match &link.reason {
            KrakenLinkReason::Exclusion => {
                for &c in &left {
                    for &d in &right {
                        assert!(if a == b { peers(c, d) } else { c == d });
                    }
                }
            }
            KrakenLinkReason::Cell(cell) => {
                assert_ne!(a, b);
                assert_eq!(left, [*cell]);
                assert_eq!(right, [*cell]);
                assert_eq!(masks[*cell], digit_bit(a) | digit_bit(b));
            }
            KrakenLinkReason::House(house) => {
                assert_eq!(a, b);
                let allowed: Vec<_> = house
                    .cells()
                    .into_iter()
                    .filter(|&cell| masks[cell] & digit_bit(a) != 0)
                    .collect();
                let mut joined: Vec<_> = left.into_iter().chain(right).collect();
                joined.sort_unstable();
                assert_eq!(joined, allowed);
            }
            KrakenLinkReason::AlmostLockedSet(set) => {
                assert_ne!(a, b);
                assert!(
                    House::at(set.cells[0])
                        .iter()
                        .any(|house| set.cells.iter().all(|c| house.cells().contains(c)))
                );
                let union = set.cells.iter().fold(0, |bits, &cell| {
                    assert_ne!(masks[cell], 0);
                    bits | masks[cell]
                });
                assert_eq!(union.count_ones() as usize, set.cells.len() + 1);
                assert_eq!(
                    union,
                    set.digits
                        .iter()
                        .fold(0, |bits, &digit| bits | digit_bit(digit))
                );
                assert_eq!(
                    left,
                    set.cells
                        .iter()
                        .copied()
                        .filter(|&cell| masks[cell] & digit_bit(a) != 0)
                        .collect::<Vec<_>>()
                );
                assert_eq!(
                    right,
                    set.cells
                        .iter()
                        .copied()
                        .filter(|&cell| masks[cell] & digit_bit(b) != 0)
                        .collect::<Vec<_>>()
                );
            }
        }
    }
}

fn masks_for(technique: Technique) -> (Board, [u16; CELLS]) {
    let position = technique.practice_example().position().unwrap();
    let board = position.values().unwrap();
    let legal = candidates(&board).unwrap();
    let masks = std::array::from_fn(|cell| legal[cell] & !position.eliminations[cell]);
    (board, masks)
}

#[test]
fn every_emitted_kraken_branch_replays_from_the_original_candidates() {
    for technique in [Technique::KrakenFish1, Technique::KrakenFish2] {
        let example = technique.practice_example();
        let position = example.position().unwrap();
        let exact = VerifiedTemplate::verify(position.givens).unwrap();
        let (_, masks) = masks_for(technique);
        let deductions = technique_deductions_at(&position, technique).unwrap();
        assert!(
            deductions
                .iter()
                .any(|hint| hint.actions == example.expected_actions)
        );
        for hint in deductions {
            let [HintAction::Eliminate(removal)] = hint.actions.as_slice() else {
                panic!()
            };
            assert_ne!(exact.solution()[removal.cell], removal.digit);
            let HintEvidence::KrakenFish {
                digit,
                bases,
                covers,
                fins,
                cover,
                branches,
            } = hint.evidence
            else {
                panic!()
            };
            assert_eq!(bases.len(), covers.len());
            assert!(bases.iter().all(|house| !covers.contains(house)));
            let count = |houses: &[House], cell| {
                houses
                    .iter()
                    .filter(|house| house.cells().contains(&cell))
                    .count()
            };
            let active = |cell: usize| masks[cell] & digit_bit(digit) != 0;
            let balance = |cell| (count(&bases, cell), count(&covers, cell));
            let expected_fins: Vec<_> = (0..CELLS)
                .filter(|&cell| {
                    let (base, cover) = balance(cell);
                    active(cell) && base > cover
                })
                .collect();
            assert_eq!(fins, expected_fins);
            let mut alternatives = fins;
            if let Some(house) = cover {
                assert_eq!(technique, Technique::KrakenFish2);
                assert!(covers.contains(&house));
                alternatives.extend(house.cells().into_iter().filter(|&cell| {
                    let (base, cover) = balance(cell);
                    active(cell) && base != 0 && base == cover
                }));
                alternatives.sort_unstable();
            } else {
                assert_eq!(technique, Technique::KrakenFish1);
                assert_eq!(digit, removal.digit);
                let (base, cover) = balance(removal.cell);
                assert!(base < cover);
            }
            assert_eq!(branches.len(), alternatives.len());
            assert!(branches.iter().any(|branch| branch.len() > 1));
            for (chain, cell) in branches.iter().zip(alternatives) {
                replay(chain, Candidate { cell, digit }, *removal, &masks);
            }
        }
    }
}

#[test]
fn the_published_fish_geometries_require_each_kraken_alternative() {
    let (board, masks) = masks_for(Technique::KrakenFish1);
    let position = PatternSearch::new(&board, &masks);
    let search = Search::new(&position);
    let mut paths = chains::Paths::new(&search.chains);
    // https://hodoku.sourceforge.net/en/tech_last.php#kf
    let examples = [
        (
            [House::Row(5), House::Box(1)],
            [House::Column(4), House::Column(6)],
            2,
            69,
            2,
            None,
            &[46, 53][..],
        ),
        (
            [House::Row(0), House::Row(4)],
            [House::Column(0), House::Column(1)],
            4,
            44,
            7,
            Some(House::Column(1)),
            &[6, 8, 37][..],
        ),
    ];

    for (bases, covers, digit, cell, result_digit, cover, alternatives) in examples {
        let target = Candidate {
            cell,
            digit: result_digit,
        };
        let (index, _) = search
            .chains
            .start_nodes()
            .find(|(_, node)| node.single() == Some(target))
            .unwrap();
        let reached = paths.walk(index);
        let fish_digit = usize::from(digit - 1);
        let fish = &search.digits[fish_digit];
        let houses = |houses: [House; 2]| {
            houses.into_iter().fold(Houses::default(), |counts, house| {
                counts.with(house.index(), fish.sites[house.index()])
            })
        };
        let removed = reached[fish_digit];
        let direct = if digit == result_digit {
            PEERS[cell]
        } else {
            cell_bit(cell)
        };
        let rule = Covers {
            digit: fish,
            bases: houses(bases),
            eligible: fish.unsolved_houses,
            size: 2,
            removed,
            direct,
        };
        let verified = rule
            .found(houses(covers), cover.map(House::index))
            .break_value()
            .unwrap();
        assert_eq!(
            cells(verified.alternatives).collect::<Vec<_>>(),
            alternatives
        );
        for &alternative in alternatives {
            let chain = paths.proof(fish_digit, alternative, position.als());
            replay(
                &chain,
                Candidate {
                    cell: alternative,
                    digit,
                },
                target,
                &masks,
            );
            let insufficient = Covers {
                removed: removed & !cell_bit(alternative),
                ..rule
            };
            assert!(
                insufficient
                    .found(houses(covers), cover.map(House::index))
                    .is_continue()
            );
        }
    }
}
