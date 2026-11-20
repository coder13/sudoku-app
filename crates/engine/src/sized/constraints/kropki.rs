use std::collections::BTreeSet;

use super::{MAX_SIZE, SizedConstraint, SizedKropkiPair, SizedKropkiRelation};
use crate::variant::{KROPKI, PairConstraint};

#[derive(Debug)]
pub(super) struct KropkiLink {
    pub constraint: PairConstraint<MAX_SIZE>,
    relation: SizedKropkiRelation,
    negative: bool,
}

impl KropkiLink {
    pub fn proof(&self) -> SizedKropkiPair {
        SizedKropkiPair {
            cells: self.constraint.cells,
            relation: self.relation,
            negative: self.negative,
        }
    }
}

const RELATIONS: [SizedKropkiRelation; 2] = [
    SizedKropkiRelation::Consecutive,
    SizedKropkiRelation::RatioTwo,
];

pub(super) fn compile_kropki(
    size: usize,
    rules: &[SizedConstraint],
) -> Option<Vec<Vec<KropkiLink>>> {
    if !rules
        .iter()
        .any(|rule| matches!(rule, SizedConstraint::Kropki { .. }))
    {
        return Some(Vec::new());
    }
    let mut groups: Vec<Vec<KropkiLink>> = (0..rules.len()).map(|_| Vec::new()).collect();
    let mut marked = BTreeSet::new();
    let mut positive: [Option<PairConstraint<MAX_SIZE>>; 2] = [None, None];
    let mut negative = [None; 2];
    for (index, rule) in rules.iter().enumerate() {
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
            for &[first, second] in &marks.pairs {
                let [a, b] = [first.min(second), first.max(second)];
                if b >= size * size || (b - a != size && !(b - a == 1 && a / size == b / size)) {
                    return None;
                }
                marked.insert([a, b]);
                let mut constraint = positive[kind]
                    .get_or_insert_with(|| {
                        PairConstraint::from_relation([0, 1], size, KROPKI[kind])
                    })
                    .clone();
                constraint.cells = [a, b];
                groups[index].push(KropkiLink {
                    constraint,
                    relation: RELATIONS[kind],
                    negative: false,
                });
            }
        }
    }
    for (kind, index) in negative.into_iter().enumerate() {
        let Some(index) = index else { continue };
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
                    groups[index].push(KropkiLink {
                        constraint,
                        relation: RELATIONS[kind],
                        negative: true,
                    });
                }
            }
        }
    }
    Some(groups)
}
