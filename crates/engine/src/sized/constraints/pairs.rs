use std::collections::BTreeSet;

use super::{MAX_SIZE, SizedConstraint, SizedDotRelation, SizedKropkiPair, SizedKropkiRelation};
use crate::variant::{KROPKI, PairConstraint};

#[derive(Debug)]
pub(super) struct SizedPairLink {
    pub constraint: PairConstraint<MAX_SIZE>,
    kropki: Option<(SizedKropkiRelation, bool, Option<u8>)>,
}

impl SizedPairLink {
    pub fn kropki_proof(&self) -> Option<SizedKropkiPair> {
        let (relation, negative, value) = self.kropki?;
        Some(SizedKropkiPair {
            cells: self.constraint.cells,
            relation,
            negative,
            value,
        })
    }

    pub fn supports(&self, domains: &[u16]) -> [u16; 2] {
        self.constraint
            .restrict(self.constraint.cells.map(|cell| domains[cell]))
    }
}

const RELATIONS: [SizedKropkiRelation; 2] = [
    SizedKropkiRelation::Consecutive,
    SizedKropkiRelation::RatioTwo,
];

fn adjacent_edge([first, second]: [usize; 2], size: usize) -> Option<[usize; 2]> {
    let [a, b] = [first.min(second), first.max(second)];
    (b < size * size && (b - a == size || b - a == 1 && a / size == b / size)).then_some([a, b])
}

pub(super) fn compile_pairs(
    size: usize,
    rules: &[SizedConstraint],
) -> Option<Vec<Vec<SizedPairLink>>> {
    if !rules.iter().any(|rule| {
        matches!(
            rule,
            SizedConstraint::Kropki { .. } | SizedConstraint::Difference { .. } | SizedConstraint::LabeledDots { .. }
        )
    }) {
        return Some(Vec::new());
    }
    let mut groups: Vec<Vec<SizedPairLink>> = (0..rules.len()).map(|_| Vec::new()).collect();
    let mut marked = BTreeSet::new();
    let mut positive: [Option<PairConstraint<MAX_SIZE>>; 2] = [None, None];
    let mut negative = [None; 2];
    let mut labeled_marked = [BTreeSet::new(), BTreeSet::new()];
    let mut labeled_negative = [None; 2];
    let mut differences: [Option<PairConstraint<MAX_SIZE>>; MAX_SIZE] =
        std::array::from_fn(|_| None);
    for (index, rule) in rules.iter().enumerate() {
        if let SizedConstraint::Difference { cells, difference } = *rule {
            let cells = adjacent_edge(cells, size)?;
            if !(1..size as u8).contains(&difference) {
                return None;
            }
            let mut constraint = differences[usize::from(difference)]
                .get_or_insert_with(|| {
                    PairConstraint::from_relation([0, 1], size, |x, y| x.abs_diff(y) == difference)
                })
                .clone();
            constraint.cells = cells;
            groups[index].push(SizedPairLink {
                constraint,
                kropki: None,
            });
            continue;
        }
        if let SizedConstraint::LabeledDots { relation, marks, negative } = rule {
            let ratio = *relation == SizedDotRelation::Ratio;
            let kind = usize::from(ratio);
            if marks.len() > 2 * size * (size - 1) || marks.is_empty() && !negative {
                return None;
            }
            if *negative {
                labeled_negative[kind].get_or_insert(index);
            }
            for mark in marks {
                let cells = adjacent_edge(mark.cells, size)?;
                let value = usize::from(mark.value);
                if !(if ratio { 2..=size } else { 1..=size - 1 }).contains(&value) {
                    return None;
                }
                labeled_marked[kind].insert(cells);
                let constraint = PairConstraint::from_relation(cells, size, |x, y| {
                    if ratio {
                        usize::from(x.max(y)) == value * usize::from(x.min(y))
                    } else {
                        usize::from(x.abs_diff(y)) == value
                    }
                });
                groups[index].push(SizedPairLink {
                    constraint,
                    kropki: Some((RELATIONS[kind], false, Some(mark.value))),
                });
            }
            continue;
        }
        let SizedConstraint::Kropki {
            consecutive,
            ratio_two,
        } = rule
        else {
            continue;
        };
        for (kind, marks) in [consecutive, ratio_two].into_iter().enumerate() {
            if marks.negative {
                negative[kind].get_or_insert(index);
            }
            for &cells in &marks.pairs {
                let cells = adjacent_edge(cells, size)?;
                marked.insert(cells);
                let mut constraint = positive[kind]
                    .get_or_insert_with(|| {
                        PairConstraint::from_relation([0, 1], size, KROPKI[kind])
                    })
                    .clone();
                constraint.cells = cells;
                groups[index].push(SizedPairLink {
                    constraint,
                    kropki: Some((RELATIONS[kind], false, None)),
                });
            }
        }
    }
    for (kind, index) in negative.into_iter().enumerate() {
        if let Some(index) = index {
            add_unmarked_links(size, kind, &marked, &mut groups[index], None);
        }
    }
    for (kind, index) in labeled_negative.into_iter().enumerate() {
        if let Some(index) = index {
            add_unmarked_links(size, kind, &labeled_marked[kind], &mut groups[index], Some(kind as u8 + 1));
        }
    }
    Some(groups)
}

fn add_unmarked_links(
    size: usize,
    kind: usize,
    marked: &BTreeSet<[usize; 2]>,
    links: &mut Vec<SizedPairLink>,
    value: Option<u8>,
) {
    let forbidden =
        PairConstraint::from_relation([0, 1], size, |x, y| x != y && !KROPKI[kind](x, y));
    for a in 0..size * size {
        let neighbors = [
            (a % size + 1 < size).then_some(a + 1),
            (a / size + 1 < size).then_some(a + size),
        ];
        for b in neighbors.into_iter().flatten() {
            if !marked.contains(&[a, b]) {
                let mut constraint = forbidden.clone();
                constraint.cells = [a, b];
                links.push(SizedPairLink {
                    constraint,
                    kropki: Some((RELATIONS[kind], true, value)),
                });
            }
        }
    }
}
