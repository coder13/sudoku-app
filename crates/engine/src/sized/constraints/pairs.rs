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

fn orthogonal_edges(size: usize) -> impl Iterator<Item = [usize; 2]> {
    (0..size * size).flat_map(move |cell| {
        [
            (cell % size + 1 < size).then_some([cell, cell + 1]),
            (cell / size + 1 < size).then_some([cell, cell + size]),
        ]
        .into_iter()
        .flatten()
    })
}

#[derive(Debug)]
pub(super) struct RowColumnSum {
    pub marked: Vec<PairConstraint<MAX_SIZE>>,
    unmarked: Option<Vec<PairConstraint<MAX_SIZE>>>,
}

pub(super) enum UnmarkedSumSupport {
    Impossible,
    One { cells: [usize; 2], masks: [u16; 2] },
    Unrestricted,
}

impl RowColumnSum {
    pub fn compile(
        size: usize,
        pairs: &[[usize; 2]],
        require_unmarked: bool,
        rules: &[SizedConstraint],
    ) -> Option<Self> {
        if pairs.is_empty() && !require_unmarked || pairs.len() > 2 * size * (size - 1) {
            return None;
        }
        let sum = |[a, b]: [usize; 2]| {
            if b - a == 1 { a / size + 1 } else { a % size + 1 }
        };
        let link = |cells| {
            let total = sum(cells) as u8;
            PairConstraint::from_relation(cells, size, |x, y| x != y && x + y == total)
        };
        let mut printed = BTreeSet::new();
        let mut marked = Vec::with_capacity(pairs.len());
        for &pair in pairs {
            let cells = adjacent_edge(pair, size)?;
            if !printed.insert(cells) {
                return None;
            }
            marked.push(link(cells));
        }
        let unmarked = require_unmarked.then(|| {
            // An edge marked by any diamond layer is printed on the same grid.
            let all_printed: BTreeSet<_> = rules
                .iter()
                .filter_map(|rule| match rule {
                    SizedConstraint::RowColumnSum { pairs, .. } => Some(pairs),
                    _ => None,
                })
                .flatten()
                .filter_map(|&pair| adjacent_edge(pair, size))
                .collect();
            orthogonal_edges(size)
                .filter(|cells| sum(*cells) >= 3 && !all_printed.contains(cells))
                .map(link)
                .collect()
        });
        Some(Self { marked, unmarked })
    }

    pub fn unmarked_support(&self, domains: &[u16]) -> UnmarkedSumSupport {
        let Some(links) = &self.unmarked else { return UnmarkedSumSupport::Unrestricted };
        let mut only = None;
        for link in links {
            let masks = link.restrict(link.cells.map(|cell| domains[cell]));
            if masks.contains(&0) {
                continue;
            }
            if only.is_some() {
                return UnmarkedSumSupport::Unrestricted;
            }
            only = Some(UnmarkedSumSupport::One { cells: link.cells, masks });
        }
        only.unwrap_or(UnmarkedSumSupport::Impossible)
    }

    pub fn permits(&self, digits: &[u8]) -> bool {
        self.marked.iter().all(|link| {
            let [left, right] = link.cells.map(|cell| digits[cell]);
            left == 0 || right == 0 || link.permits(left, right)
        }) && self.unmarked.as_ref().is_none_or(|links| {
            digits.contains(&0) || links.iter().any(|link| {
                let [left, right] = link.cells.map(|cell| digits[cell]);
                link.permits(left, right)
            })
        })
    }
}

pub(super) fn compile_pairs(
    size: usize,
    rules: &[SizedConstraint],
) -> Option<Vec<Vec<SizedPairLink>>> {
    if !rules.iter().any(|rule| {
        matches!(
            rule,
            SizedConstraint::Kropki { .. } | SizedConstraint::Difference { .. }
                | SizedConstraint::LabeledDots { .. } | SizedConstraint::AntiSum { .. }
                | SizedConstraint::Whispers { .. } | SizedConstraint::Xv { .. }
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
    let mut xv_marked = [BTreeSet::new(), BTreeSet::new()];
    let mut xv_negative = [None; 2];
    let mut differences: [Option<PairConstraint<MAX_SIZE>>; MAX_SIZE] =
        std::array::from_fn(|_| None);
    for (index, rule) in rules.iter().enumerate() {
        if let SizedConstraint::AntiSum { sum } = *rule {
            if !(2..=2 * size as u8).contains(&sum) {
                return None;
            }
            let constraint = PairConstraint::from_relation([0, 1], size, |x, y| x != y && x + y != sum);
            groups[index].extend(orthogonal_edges(size).map(|cells| {
                let mut constraint = constraint.clone();
                constraint.cells = cells;
                SizedPairLink { constraint, kropki: None }
            }));
            continue;
        }
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
        if let SizedConstraint::Whispers { cells, min_difference } = rule {
            for pair in cells.windows(2) {
                let cells = [pair[0], pair[1]];
                let constraint = PairConstraint::from_relation(cells, size, |x, y| x.abs_diff(y) >= *min_difference);
                groups[index].push(SizedPairLink { constraint, kropki: None });
            }
            continue;
        }
        if let SizedConstraint::Xv { five, ten } = rule {
            for (kind, (marks, total)) in [five, ten].into_iter().zip([5u8, 10u8]).enumerate() {
                if marks.negative { xv_negative[kind].get_or_insert(index); }
                if marks.pairs.len() > 2 * size * (size - 1) { return None; }
                for &pair in &marks.pairs {
                    let cells = adjacent_edge(pair, size)?;
                    xv_marked[kind].insert(cells);
                    let constraint = PairConstraint::from_relation(cells, size, |x, y| x + y == total);
                    groups[index].push(SizedPairLink { constraint, kropki: None });
                }
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
    for (kind, index) in xv_negative.into_iter().enumerate() {
        if let Some(index) = index {
            let total = if kind == 0 { 5 } else { 10 };
            add_unmarked_sum_links(size, total, &xv_marked[kind], &mut groups[index]);
        }
    }
    Some(groups)
}

fn add_unmarked_sum_links(
    size: usize,
    total: u8,
    marked: &BTreeSet<[usize; 2]>,
    group: &mut Vec<SizedPairLink>,
) {
    let constraint = PairConstraint::from_relation([0, 1], size, |x, y| x + y != total);
    for cells in orthogonal_edges(size).filter(|cells| !marked.contains(cells)) {
        let mut constraint = constraint.clone();
        constraint.cells = cells;
        group.push(SizedPairLink { constraint, kropki: None });
    }
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
    for cells in orthogonal_edges(size).filter(|cells| !marked.contains(cells)) {
        let mut constraint = forbidden.clone();
        constraint.cells = cells;
        links.push(SizedPairLink {
            constraint,
            kropki: Some((RELATIONS[kind], true, value)),
        });
    }
}
