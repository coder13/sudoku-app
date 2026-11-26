use std::collections::{BTreeMap, BTreeSet};

use super::{MAX_SIZE, SizedConstraint, SizedDotRelation, SizedKropkiPair, SizedKropkiRelation};
use crate::variant::PairConstraint;

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

fn kropki_matches(kind: usize, left: u8, right: u8, value_offset: u8) -> bool {
    let left = left.saturating_sub(value_offset);
    let right = right.saturating_sub(value_offset);
    match kind {
        0 => left.abs_diff(right) == 1,
        1 => left.min(right) > 0 && left.max(right) == 2 * left.min(right),
        _ => false,
    }
}

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

fn king_edges(size: usize) -> impl Iterator<Item = [usize; 2]> {
    (0..size * size).flat_map(move |cell| {
        let row = cell / size;
        let column = cell % size;
        [
            (row + 1 < size && column + 1 < size).then_some([cell, cell + size + 1]),
            (row + 1 < size && column > 0).then_some([cell, cell + size - 1]),
        ]
        .into_iter()
        .flatten()
    })
}

fn knight_edges(size: usize) -> impl Iterator<Item = [usize; 2]> {
    (0..size * size).flat_map(move |cell| {
        let row = cell / size;
        let column = cell % size;
        [
            (row + 2 < size && column + 1 < size).then_some([cell, cell + 2 * size + 1]),
            (row + 2 < size && column > 0).then_some([cell, cell + 2 * size - 1]),
            (row + 1 < size && column + 2 < size).then_some([cell, cell + size + 2]),
            (row + 1 < size && column >= 2).then_some([cell, cell + size - 2]),
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
            if b - a == 1 {
                a / size + 1
            } else {
                a % size + 1
            }
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
        let Some(links) = &self.unmarked else {
            return UnmarkedSumSupport::Unrestricted;
        };
        let mut only = None;
        for link in links {
            let masks = link.restrict(link.cells.map(|cell| domains[cell]));
            if masks.contains(&0) {
                continue;
            }
            if only.is_some() {
                return UnmarkedSumSupport::Unrestricted;
            }
            only = Some(UnmarkedSumSupport::One {
                cells: link.cells,
                masks,
            });
        }
        only.unwrap_or(UnmarkedSumSupport::Impossible)
    }

    pub fn permits(&self, digits: &[u8]) -> bool {
        self.marked.iter().all(|link| {
            let [left, right] = link.cells.map(|cell| digits[cell]);
            left == 0 || right == 0 || link.permits(left, right)
        }) && self.unmarked.as_ref().is_none_or(|links| {
            digits.contains(&0)
                || links.iter().any(|link| {
                    let [left, right] = link.cells.map(|cell| digits[cell]);
                    link.permits(left, right)
                })
        })
    }
}

pub(super) fn compile_pairs(
    size: usize,
    rules: &[SizedConstraint],
    value_offset: u8,
) -> Option<Vec<Vec<SizedPairLink>>> {
    if !rules.iter().any(|rule| {
        matches!(
            rule,
            SizedConstraint::Kropki { .. }
                | SizedConstraint::CornerKropki { .. }
                | SizedConstraint::Difference { .. }
                | SizedConstraint::LabeledDots { .. }
                | SizedConstraint::AntiSum { .. }
                | SizedConstraint::Whispers { .. }
                | SizedConstraint::ParityLine { .. }
                | SizedConstraint::Palindrome { .. }
                | SizedConstraint::Clone { .. }
                | SizedConstraint::NonConsecutive { .. }
                | SizedConstraint::Inequality { .. }
                | SizedConstraint::AdjacentTotal { .. }
                | SizedConstraint::Minimum { .. }
                | SizedConstraint::Maximum { .. }
                | SizedConstraint::AntiKnight
                | SizedConstraint::AntiKing
                | SizedConstraint::Modular { .. }
                | SizedConstraint::Xv { .. }
        )
    }) {
        return Some(Vec::new());
    }
    let mut groups: Vec<Vec<SizedPairLink>> = (0..rules.len()).map(|_| Vec::new()).collect();
    let mut marked = BTreeSet::new();
    let mut labeled_marked: BTreeMap<(SizedDotRelation, u8), BTreeSet<[usize; 2]>> =
        BTreeMap::new();
    let mut labeled_negative: BTreeMap<(SizedDotRelation, u8), usize> = BTreeMap::new();
    let mut positive: [Option<PairConstraint<MAX_SIZE>>; 2] = [None, None];
    let mut negative = [None; 2];
    let mut xv_marked = [BTreeSet::new(), BTreeSet::new()];
    let mut xv_negative = [None; 2];
    let mut differences: [Option<PairConstraint<MAX_SIZE>>; MAX_SIZE] =
        std::array::from_fn(|_| None);
    for (index, rule) in rules.iter().enumerate() {
        if let SizedConstraint::Palindrome { cells } = rule {
            if cells.len() < 2 || cells.len() > size * size {
                return None;
            }
            let mut seen = BTreeSet::new();
            if cells
                .iter()
                .any(|&cell| cell >= size * size || !seen.insert(cell))
            {
                return None;
            }
            if cells
                .windows(2)
                .any(|pair| adjacent_edge([pair[0], pair[1]], size).is_none())
            {
                return None;
            }
            for (&left, &right) in cells.iter().zip(cells.iter().rev()).take(cells.len() / 2) {
                groups[index].push(SizedPairLink {
                    constraint: PairConstraint::from_relation([left, right], size, |x, y| x == y),
                    kropki: None,
                });
            }
            continue;
        }
        if let SizedConstraint::Clone { groups: clones } = rule {
            if clones.is_empty() || clones.len() > size * size {
                return None;
            }
            for cells in clones {
                if cells.len() < 2 || cells.len() > size * size {
                    return None;
                }
                let mut seen = BTreeSet::new();
                if cells
                    .iter()
                    .any(|&cell| cell >= size * size || !seen.insert(cell))
                {
                    return None;
                }
                let first = cells[0];
                for &other in &cells[1..] {
                    groups[index].push(SizedPairLink {
                        constraint: PairConstraint::from_relation([first, other], size, |x, y| {
                            x == y
                        }),
                        kropki: None,
                    });
                }
            }
            continue;
        }
        if let SizedConstraint::ParityLine { cells } = rule {
            if cells.len() < 2 || cells.len() > size * size {
                return None;
            }
            let mut seen = BTreeSet::new();
            if cells
                .iter()
                .any(|&cell| cell >= size * size || !seen.insert(cell))
            {
                return None;
            }
            if cells
                .windows(2)
                .any(|pair| adjacent_edge([pair[0], pair[1]], size).is_none())
            {
                return None;
            }
            for pair in cells.windows(2) {
                groups[index].push(SizedPairLink {
                    constraint: PairConstraint::from_relation([pair[0], pair[1]], size, |x, y| {
                        (x - 1) % 2 != (y - 1) % 2
                    }),
                    kropki: None,
                });
            }
            continue;
        }
        if let SizedConstraint::Inequality { less, greater } = *rule {
            if less == greater || adjacent_edge([less, greater], size).is_none() {
                return None;
            }
            groups[index].push(SizedPairLink {
                constraint: PairConstraint::from_relation([less, greater], size, |x, y| x < y),
                kropki: None,
            });
            continue;
        }
        if let SizedConstraint::Minimum {
            cells,
            ignore_marked_neighbors,
        }
        | SizedConstraint::Maximum {
            cells,
            ignore_marked_neighbors,
        } = rule
        {
            let mut marked = [false; super::MAX_CELLS];
            if cells.is_empty()
                || cells
                    .iter()
                    .any(|&cell| cell >= size * size || std::mem::replace(&mut marked[cell], true))
            {
                return None;
            }
            let minimum = matches!(rule, SizedConstraint::Minimum { .. });
            let relation =
                PairConstraint::from_relation([0, 1], size, |less, greater| less < greater);
            for &cell in cells {
                let row = cell / size;
                let column = cell % size;
                for adjacent in [
                    (row > 0).then(|| cell - size),
                    (row + 1 < size).then_some(cell + size),
                    (column > 0).then(|| cell - 1),
                    (column + 1 < size).then_some(cell + 1),
                ]
                .into_iter()
                .flatten()
                {
                    if *ignore_marked_neighbors && marked[adjacent] {
                        continue;
                    }
                    let mut constraint = relation.clone();
                    constraint.cells = if minimum {
                        [cell, adjacent]
                    } else {
                        [adjacent, cell]
                    };
                    groups[index].push(SizedPairLink {
                        constraint,
                        kropki: None,
                    });
                }
            }
            continue;
        }
        if matches!(rule, SizedConstraint::AntiKnight) {
            groups[index].extend(knight_edges(size).map(|cells| SizedPairLink {
                constraint: PairConstraint::from_relation(cells, size, |x, y| x != y),
                kropki: None,
            }));
            continue;
        }
        if matches!(rule, SizedConstraint::AntiKing) {
            groups[index].extend(king_edges(size).map(|cells| SizedPairLink {
                constraint: PairConstraint::from_relation(cells, size, |x, y| x != y),
                kropki: None,
            }));
            continue;
        }
        if let SizedConstraint::NonConsecutive { except } = rule {
            let mut exempt = BTreeSet::new();
            for &pair in except {
                let cells = adjacent_edge(pair, size)?;
                if !exempt.insert(cells) {
                    return None;
                }
            }
            for cells in orthogonal_edges(size).filter(|cells| !exempt.contains(cells)) {
                groups[index].push(SizedPairLink {
                    constraint: PairConstraint::from_relation(cells, size, |x, y| {
                        x.abs_diff(y) != 1
                    }),
                    kropki: None,
                });
            }
            continue;
        }
        if let SizedConstraint::AntiSum { sum } = *rule {
            if !(2..=2 * size as u8).contains(&sum) {
                return None;
            }
            let constraint =
                PairConstraint::from_relation([0, 1], size, |x, y| x != y && x + y != sum);
            groups[index].extend(orthogonal_edges(size).map(|cells| {
                let mut constraint = constraint.clone();
                constraint.cells = cells;
                SizedPairLink {
                    constraint,
                    kropki: None,
                }
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
        if let SizedConstraint::LabeledDots {
            relation,
            marks,
            negative,
        } = rule
        {
            let ratio = *relation == SizedDotRelation::Ratio;
            let kind = usize::from(ratio);
            if marks.len() > 2 * size * (size - 1) || marks.is_empty() && !negative {
                return None;
            }
            let mut layer_values = BTreeSet::new();
            for mark in marks {
                let cells = adjacent_edge(mark.cells, size)?;
                let value = usize::from(mark.value);
                let max_value = size - usize::from(value_offset);
                if !(if ratio { 2..=max_value } else { 1..=max_value }).contains(&value) {
                    return None;
                }
                labeled_marked
                    .entry((*relation, mark.value))
                    .or_default()
                    .insert(cells);
                layer_values.insert(mark.value);
                let constraint = PairConstraint::from_relation(cells, size, |x, y| {
                    let [left, right] =
                        [x, y].map(|digit| usize::from(digit.saturating_sub(value_offset)));
                    if ratio {
                        left.min(right) > 0 && left.max(right) == value * left.min(right)
                    } else {
                        usize::from(x.abs_diff(y)) == value
                    }
                });
                groups[index].push(SizedPairLink {
                    constraint,
                    kropki: Some((RELATIONS[kind], false, Some(mark.value))),
                });
            }
            if *negative {
                for value in layer_values {
                    labeled_negative.entry((*relation, value)).or_insert(index);
                }
            }
            continue;
        }
        if let SizedConstraint::Whispers {
            cells,
            min_difference,
        } = rule
        {
            for pair in cells.windows(2) {
                let cells = [pair[0], pair[1]];
                let constraint = PairConstraint::from_relation(cells, size, |x, y| {
                    x.abs_diff(y) >= *min_difference
                });
                groups[index].push(SizedPairLink {
                    constraint,
                    kropki: None,
                });
            }
            continue;
        }
        if let SizedConstraint::Modular { cells } = rule {
            if size != 6
                || cells.len() < 3
                || cells.len() > size * size
                || cells.iter().any(|&cell| cell >= size * size)
            {
                return None;
            }
            let mut pairs = BTreeSet::new();
            for window in cells.windows(3) {
                if window[0] == window[1] || window[0] == window[2] || window[1] == window[2] {
                    return None;
                }
                for (position, &left) in window.iter().enumerate() {
                    for &right in &window[position + 1..] {
                        let cells = [left.min(right), left.max(right)];
                        if pairs.insert(cells) {
                            groups[index].push(SizedPairLink {
                                constraint: PairConstraint::from_relation(cells, size, |x, y| {
                                    (x - 1) % 3 != (y - 1) % 3
                                }),
                                kropki: None,
                            });
                        }
                    }
                }
            }
            continue;
        }
        if let SizedConstraint::Xv { five, ten } = rule {
            for (kind, (marks, total)) in [five, ten].into_iter().zip([5u8, 10u8]).enumerate() {
                if marks.negative {
                    xv_negative[kind].get_or_insert(index);
                }
                if marks.pairs.len() > 2 * size * (size - 1) {
                    return None;
                }
                for &pair in &marks.pairs {
                    let cells = adjacent_edge(pair, size)?;
                    xv_marked[kind].insert(cells);
                    let displayed_total = total + 2 * value_offset;
                    let constraint =
                        PairConstraint::from_relation(cells, size, |x, y| x + y == displayed_total);
                    groups[index].push(SizedPairLink {
                        constraint,
                        kropki: None,
                    });
                }
            }
            continue;
        }
        if let SizedConstraint::AdjacentTotal { cells, sum } = rule {
            if *sum < 3 || usize::from(*sum) > 2 * size - 1 {
                return None;
            }
            let cells = adjacent_edge(*cells, size)?;
            let displayed_total = *sum + 2 * value_offset;
            groups[index].push(SizedPairLink {
                constraint: PairConstraint::from_relation(cells, size, |x, y| {
                    x + y == displayed_total
                }),
                kropki: None,
            });
            continue;
        }
        if let SizedConstraint::CornerKropki {
            consecutive,
            ratio_two,
        } = rule
        {
            if consecutive.is_empty() && ratio_two.is_empty() {
                return None;
            }
            for (kind, corners) in [consecutive, ratio_two].into_iter().enumerate() {
                if corners.len() > (size - 1) * (size - 1) {
                    return None;
                }
                let mut seen = BTreeSet::new();
                for &corner in corners {
                    if corner >= size * (size - 1)
                        || corner % size == size - 1
                        || !seen.insert(corner)
                    {
                        return None;
                    }
                    let base = positive[kind]
                        .get_or_insert_with(|| {
                            PairConstraint::from_relation([0, 1], size, |x, y| {
                                kropki_matches(kind, x, y, value_offset)
                            })
                        })
                        .clone();
                    for cells in [[corner, corner + size + 1], [corner + 1, corner + size]] {
                        let mut constraint = base.clone();
                        constraint.cells = cells;
                        groups[index].push(SizedPairLink {
                            constraint,
                            kropki: Some((RELATIONS[kind], false, None)),
                        });
                    }
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
                        PairConstraint::from_relation([0, 1], size, |x, y| {
                            kropki_matches(kind, x, y, value_offset)
                        })
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
            add_unmarked_links(size, kind, &marked, &mut groups[index], None, value_offset);
        }
    }
    for ((relation, value), index) in labeled_negative {
        add_unmarked_labeled_links(
            size,
            relation,
            value,
            &labeled_marked[&(relation, value)],
            &mut groups[index],
            value_offset,
        );
    }
    for (kind, index) in xv_negative.into_iter().enumerate() {
        if let Some(index) = index {
            let total = (if kind == 0 { 5 } else { 10 }) + 2 * value_offset;
            add_unmarked_sum_links(size, total, &xv_marked[kind], &mut groups[index]);
        }
    }
    Some(groups)
}

fn add_unmarked_labeled_links(
    size: usize,
    relation: SizedDotRelation,
    value: u8,
    marked: &BTreeSet<[usize; 2]>,
    links: &mut Vec<SizedPairLink>,
    value_offset: u8,
) {
    let ratio = relation == SizedDotRelation::Ratio;
    let kind = usize::from(ratio);
    let forbidden = PairConstraint::from_relation([0, 1], size, |x, y| {
        let [left, right] = [x, y].map(|digit| digit.saturating_sub(value_offset));
        let matches = if ratio {
            left.min(right) > 0
                && u16::from(left.max(right)) == u16::from(value) * u16::from(left.min(right))
        } else {
            x.abs_diff(y) == value
        };
        x != y && !matches
    });
    for cells in orthogonal_edges(size).filter(|edge| !marked.contains(edge)) {
        let mut constraint = forbidden.clone();
        constraint.cells = cells;
        links.push(SizedPairLink {
            constraint,
            kropki: Some((RELATIONS[kind], true, Some(value))),
        });
    }
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
        group.push(SizedPairLink {
            constraint,
            kropki: None,
        });
    }
}

fn add_unmarked_links(
    size: usize,
    kind: usize,
    marked: &BTreeSet<[usize; 2]>,
    links: &mut Vec<SizedPairLink>,
    value: Option<u8>,
    value_offset: u8,
) {
    let forbidden = PairConstraint::from_relation([0, 1], size, |x, y| {
        x != y && !kropki_matches(kind, x, y, value_offset)
    });
    for cells in orthogonal_edges(size).filter(|cells| !marked.contains(cells)) {
        let mut constraint = forbidden.clone();
        constraint.cells = cells;
        links.push(SizedPairLink {
            constraint,
            kropki: Some((RELATIONS[kind], true, value)),
        });
    }
}
