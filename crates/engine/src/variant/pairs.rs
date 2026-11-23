mod house_support;

use std::{
    collections::{BTreeMap, BTreeSet},
    ops::Range,
    sync::Arc,
};

use super::{CompiledVariant, MarkedPairs, Parity, PuzzleRule, VariantDefinitionError, VariantTechnique, cell_mask};
use crate::{
    CELLS, DIGITS, SizedDotRelation,
    hints::{digit_bit, digits},
};

#[derive(Clone, Copy, Debug)]
pub(super) struct PositiveSum {
    pub rule: usize,
    pub cells: [usize; 2],
    pub total: u8,
    pub xv: bool,
}

pub(super) fn positive_sums(rules: &[PuzzleRule]) -> Vec<PositiveSum> {
    let mut sums = Vec::new();
    for (rule, clue) in rules.iter().enumerate() {
        match clue {
            PuzzleRule::AdjacentTotal { cells, sum } => sums.push(PositiveSum {
                rule,
                cells: *cells,
                total: *sum,
                xv: false,
            }),
            PuzzleRule::Xv { five, ten } => {
                for (marks, total) in [(five, 5), (ten, 10)] {
                    sums.extend(marks.pairs.iter().map(|&cells| PositiveSum {
                        rule,
                        cells,
                        total,
                        xv: true,
                    }));
                }
            }
            _ => {}
        }
    }
    sums
}

type Allowed = [u16; 9];
type Relation = fn(u8, u8) -> bool;

#[derive(Clone, Debug)]
pub(crate) struct PairConstraint<const N: usize = 9> {
    pub cells: [usize; 2],
    supports: [[u16; N]; 2],
}

impl<const N: usize> PairConstraint<N> {
    fn new(cells: [usize; 2], forward: [u16; N]) -> Self {
        let mut backward = [0; N];
        for (index, &mask) in forward.iter().enumerate() {
            for digit in digits(mask) {
                backward[usize::from(digit - 1)] |= 1 << index;
            }
        }
        Self {
            cells,
            supports: [forward, backward],
        }
    }

    pub(crate) fn from_relation(
        [first, second]: [usize; 2],
        size: usize,
        relation: impl Fn(u8, u8) -> bool,
    ) -> Self {
        let cells = [first.min(second), first.max(second)];
        let forward = std::array::from_fn(|index| {
            if index >= size {
                return 0;
            }
            let left = index as u8 + 1;
            (1..=size as u8)
                .filter(|&right| {
                    if first < second {
                        relation(left, right)
                    } else {
                        relation(right, left)
                    }
                })
                .fold(0, |mask, right| mask | digit_bit(right))
        });
        Self::new(cells, forward)
    }

    pub fn permits(&self, first: u8, second: u8) -> bool {
        self.supports[0][usize::from(first - 1)] & digit_bit(second) != 0
    }

    pub fn restrict(&self, domains: [u16; 2]) -> [u16; 2] {
        std::array::from_fn(|end| {
            digits(domains[end])
                .filter(|&digit| self.supports[end][usize::from(digit - 1)] & domains[1 - end] != 0)
                .fold(0, |mask, digit| mask | digit_bit(digit))
        })
    }
}

#[derive(Debug)]
pub(super) struct RuleSource {
    pub technique: VariantTechnique,
    pub indices: Vec<usize>,
}

#[derive(Clone, Debug)]
pub(super) struct PairClue {
    pub source: Arc<RuleSource>,
    pub cells: Vec<usize>,
    links: Vec<PairConstraint>,
}

impl PairClue {
    pub fn links(&self) -> &[PairConstraint] {
        &self.links
    }

    pub fn binary_relation(&self) -> Option<&PairConstraint> {
        (self.links.len() == 1).then(|| &self.links[0])
    }

    pub fn restrict(&self, domains: &mut [u16; CELLS]) {
        loop {
            let mut changed = false;
            for link in &self.links {
                let prior = link.cells.map(|cell| domains[cell]);
                let supported = link.restrict(prior);
                for (cell, mask) in link.cells.into_iter().zip(supported) {
                    changed |= domains[cell] != mask;
                    domains[cell] = mask;
                }
            }
            if !changed {
                break;
            }
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(super) struct ParityClue {
    pub rule: usize,
    pub cell: usize,
    pub allowed: u16,
}

#[derive(Clone, Debug)]
pub(super) struct DigitRestrictionClue {
    pub rule: usize,
    pub cell: usize,
    pub allowed: u16,
}

#[derive(Default)]
pub(super) struct PairCompiler {
    clues: Vec<PairClue>,
    kropki: Markers,
    labeled_marked: [BTreeSet<[usize; 2]>; 2],
    labeled_negative: [Option<usize>; 2],
    xv: Markers,
}

#[derive(Default)]
struct Markers {
    marked: BTreeMap<[usize; 2], PositiveMarker>,
    // Generic totals of 5/10 retain their own proof source and exempt this edge
    // from negative XV. They do not create an extra XV deduction.
    exemptions: BTreeSet<[usize; 2]>,
    negative: [bool; 2],
    rule_indices: Vec<usize>,
}

struct PositiveMarker {
    allowed: Allowed,
    rule_indices: Vec<usize>,
}

pub(crate) const KROPKI: [Relation; 2] =
    [|a, b| a.abs_diff(b) == 1, |a, b| a.max(b) == 2 * a.min(b)];
pub(super) const XV: [Relation; 2] = [|a, b| a + b == 5, |a, b| a + b == 10];

impl PairCompiler {
    pub(super) fn exempt_xv_edges(&mut self, edges: &[[usize; 2]]) {
        self.xv.exemptions.extend(edges.iter().map(|&[a, b]| [a.min(b), a.max(b)]));
    }

    pub fn compile_rule(
        &mut self,
        puzzle: &mut CompiledVariant,
        index: usize,
        rule: &PuzzleRule,
    ) -> Result<(), VariantDefinitionError> {
        let invalid = VariantDefinitionError::InvalidRule(index);
        let valid_cells = |cells: &[usize], range: std::ops::RangeInclusive<usize>| {
            (range.contains(&cells.len()) && cell_mask(cells).is_some())
                .then_some(())
                .ok_or(invalid)
        };
        let source = |technique| Arc::new(RuleSource {
            technique,
            indices: vec![index],
        });
        match rule {
            PuzzleRule::Parity { cells, parity } => {
                valid_cells(cells, 1..=CELLS)?;
                let allowed = match parity {
                    Parity::Odd => 0b101010101,
                    Parity::Even => 0b010101010,
                };
                for &cell in cells {
                    puzzle.allowed_digits[cell] &= allowed;
                    puzzle.parity_clues.push(ParityClue {
                        rule: index,
                        cell,
                        allowed,
                    });
                }
            }
            PuzzleRule::DigitRestriction { cells, digits, .. } => {
                valid_cells(cells, 1..=CELLS)?;
                if digits.is_empty() || digits.iter().any(|digit| !(1..=9).contains(digit)) ||
                    digits.iter().copied().collect::<std::collections::BTreeSet<_>>().len() != digits.len() {
                    return Err(invalid);
                }
                let allowed = digits.iter().fold(0, |mask, &digit| mask | digit_bit(digit));
                for &cell in cells {
                    puzzle.allowed_digits[cell] &= allowed;
                    if puzzle.allowed_digits[cell] == 0 { return Err(invalid); }
                    puzzle.digit_restriction_clues.push(DigitRestrictionClue { rule: index, cell, allowed });
                }
            }
            PuzzleRule::Clone { groups } => {
                let source = source(VariantTechnique::Clone);
                if groups.is_empty() {
                    return Err(invalid);
                }
                for group in groups {
                    valid_cells(group, 2..=CELLS)?;
                    // Equality is transitive. A path connects the group with n−1 links.
                    self.clues.push(path(&source, group, |a, b| a == b));
                }
            }
            PuzzleRule::AntiKnight {} | PuzzleRule::AntiKing {} => {
                let knight = matches!(rule, PuzzleRule::AntiKnight {});
                let source = source(if knight {
                    VariantTechnique::AntiKnight
                } else {
                    VariantTechnique::AntiKing
                });
                for [a, b] in geometric_pairs(|row, col| {
                    if knight {
                        row.max(col) == 2 && row.min(col) == 1
                    } else {
                        row == 1 && col == 1
                    }
                }) {
                    puzzle.peers[a] |= 1 << b;
                    puzzle.peers[b] |= 1 << a;
                    self.clues.push(pair(&source, [a, b], |a, b| a != b));
                }
            }
            PuzzleRule::NonConsecutive { except } => {
                let source = source(VariantTechnique::NonConsecutive);
                let mut excluded = BTreeSet::new();
                for cells in except {
                    valid_cells(cells, 2..=2)?;
                    let [a, b] = *cells;
                    if a.abs_diff(b) != 9 && !(a / 9 == b / 9 && a.abs_diff(b) == 1) {
                        return Err(invalid);
                    }
                    excluded.insert([a.min(b), a.max(b)]);
                }
                for cells in orthogonal_pairs() {
                    if excluded.contains(&cells) {
                        continue;
                    }
                    self.clues
                        .push(pair(&source, cells, |a, b| a.abs_diff(b) != 1));
                }
            }
            PuzzleRule::Inequality { less, greater } => {
                let source = source(VariantTechnique::Inequality);
                let cells = [*less, *greater];
                valid_cells(&cells, 2..=2)?;
                self.clues.push(pair(&source, cells, |a, b| a < b));
            }
            PuzzleRule::Minimum { cells, ignore_marked_neighbors }
            | PuzzleRule::Maximum { cells, ignore_marked_neighbors } => {
                let source = source(VariantTechnique::Inequality);
                let marked = cell_mask(cells).filter(|&mask| mask != 0).ok_or(invalid)?;
                let minimum = matches!(rule, PuzzleRule::Minimum { .. });
                for [a, b] in orthogonal_pairs() {
                    let a_marked = marked & (1u128 << a) != 0;
                    let b_marked = marked & (1u128 << b) != 0;
                    if a_marked && (!*ignore_marked_neighbors || !b_marked) {
                        self.clues.push(pair(&source, if minimum { [a, b] } else { [b, a] }, |a, b| a < b));
                    }
                    if b_marked && (!*ignore_marked_neighbors || !a_marked) {
                        self.clues.push(pair(&source, if minimum { [b, a] } else { [a, b] }, |a, b| a < b));
                    }
                }
            }
            PuzzleRule::Kropki {
                consecutive,
                ratio_two,
            } => {
                add_markers(
                    &mut self.kropki,
                    index,
                    [consecutive, ratio_two],
                    KROPKI,
                    invalid,
                )?;
            }
            PuzzleRule::LabeledDots { relation, marks, negative } => {
                let source = source(VariantTechnique::Kropki);
                if marks.len() > 144 || marks.is_empty() && !negative {
                    return Err(invalid);
                }
                let ratio = *relation == SizedDotRelation::Ratio;
                let kind = usize::from(ratio);
                if *negative {
                    self.labeled_negative[kind].get_or_insert(index);
                }
                for mark in marks {
                    let [a, b] = mark.cells;
                    valid_cells(&mark.cells, 2..=2)?;
                    if !(a.abs_diff(b) == 9 || a / 9 == b / 9 && a.abs_diff(b) == 1)
                        || !(if ratio { 2..=9 } else { 1..=8 }).contains(&mark.value)
                    {
                        return Err(invalid);
                    }
                    let cells = [a.min(b), a.max(b)];
                    self.labeled_marked[kind].insert(cells);
                    self.clues.push(pair(&source, cells, |x, y| {
                        if ratio {
                            u16::from(x.max(y)) == u16::from(mark.value) * u16::from(x.min(y))
                        } else {
                            x.abs_diff(y) == mark.value
                        }
                    }));
                }
            }
            PuzzleRule::Xv { five, ten } => {
                add_markers(&mut self.xv, index, [five, ten], XV, invalid)?;
            }
            PuzzleRule::AdjacentTotal { cells, sum } => {
                let source = source(VariantTechnique::AdjacentTotal);
                valid_cells(cells, 2..=2)?;
                let [a, b] = *cells;
                if !(3..=17).contains(sum)
                    || a.abs_diff(b) != 9 && !(a / 9 == b / 9 && a.abs_diff(b) == 1)
                {
                    return Err(invalid);
                }
                if matches!(sum, 5 | 10) {
                    self.xv.exemptions.insert([a.min(b), a.max(b)]);
                }
                // Edge-sharing cells share a row or column, so two equal
                // digits cannot support each other even for an even total.
                self.clues.push(pair(&source, *cells, |a, b| a != b && a + b == *sum));
            }
            PuzzleRule::Thermometer { cells } => {
                let source = source(VariantTechnique::Thermometer);
                valid_cells(cells, 2..=9)?;
                self.clues.push(path(&source, cells, |a, b| a < b));
            }
            PuzzleRule::Palindrome { cells, segments } => {
                let source = source(VariantTechnique::Palindrome);
                valid_cells(cells, 2..=CELLS)?;
                if !super::drawing_paths_cover(cells, segments) {
                    return Err(invalid);
                }
                let links = cells
                    .iter()
                    .zip(cells.iter().rev())
                    .take(cells.len() / 2)
                    .map(|(&a, &b)| link([a, b], |a, b| a == b))
                    .collect();
                self.clues.push(PairClue {
                    source,
                    cells: cells.clone(),
                    links,
                });
            }
            PuzzleRule::Whispers {
                cells,
                min_difference,
            } => {
                let source = source(VariantTechnique::Whispers);
                if !(2..=CELLS + 1).contains(&cells.len())
                    || cells.iter().any(|&cell| cell >= CELLS)
                    || cells.windows(2).any(|pair| pair[0] == pair[1])
                {
                    return Err(invalid);
                }
                if !(1..=8).contains(min_difference) {
                    return Err(invalid);
                }
                self.clues.push(path(&source, cells, |a, b| {
                    a.abs_diff(b) >= *min_difference
                }));
            }
            _ => unreachable!("other constraints compile separately"),
        }
        Ok(())
    }

    pub fn finish(mut self, puzzle: &mut CompiledVariant) {
        puzzle.kropki_marks = finish_markers(&mut self.clues, self.kropki, VariantTechnique::Kropki, KROPKI);
        finish_markers(&mut self.clues, self.xv, VariantTechnique::Xv, XV);
        for (kind, rule) in self.labeled_negative.into_iter().enumerate() {
            let Some(index) = rule else { continue };
            let source = Arc::new(RuleSource { technique: VariantTechnique::Kropki, indices: vec![index] });
            for cells in orthogonal_pairs().filter(|edge| !self.labeled_marked[kind].contains(edge)) {
                self.clues.push(pair(&source, cells, |a, b| !KROPKI[kind](a, b)));
            }
        }
        let mut allowed = BTreeMap::<_, Allowed>::new();
        for clue in &self.clues {
            // The chess rules already contribute to the exact solver's peer table.
            if matches!(clue.source.technique, VariantTechnique::AntiKnight | VariantTechnique::AntiKing) {
                continue;
            }
            for link in &clue.links {
                for (mask, other) in allowed
                    .entry(link.cells)
                    .or_insert([DIGITS; 9])
                    .iter_mut()
                    .zip(link.supports[0])
                {
                    *mask &= other;
                }
            }
        }
        puzzle.pairs = allowed
            .into_iter()
            .map(|(cells, mut forward)| {
                let [first, second] = cells;
                if (puzzle.peers[first] >> second) & 1 != 0 {
                    for (index, mask) in forward.iter_mut().enumerate() {
                        *mask &= !(1 << index);
                    }
                }
                PairConstraint::new(cells, forward)
            })
            .collect();
        for (index, clue) in self.clues.iter().enumerate() {
            for &cell in &clue.cells {
                puzzle.pair_clue_memberships[cell].push(index);
            }
        }
        puzzle.pair_clues = self.clues;
    }
}

fn add_markers(
    markers: &mut Markers,
    rule_index: usize,
    rules: [&MarkedPairs; 2],
    relations: [Relation; 2],
    invalid: VariantDefinitionError,
) -> Result<(), VariantDefinitionError> {
    markers.rule_indices.push(rule_index);
    for (kind, rule) in rules.into_iter().enumerate() {
        markers.negative[kind] |= rule.negative;
        for &[first, second] in &rule.pairs {
            if first >= CELLS
                || second >= CELLS
                || first.abs_diff(second) != 9
                    && !(first / 9 == second / 9 && first.abs_diff(second) == 1)
            {
                return Err(invalid);
            }
            let link = link([first, second], relations[kind]);
            let positive = markers
                .marked
                .entry(link.cells)
                .or_insert_with(|| PositiveMarker {
                    allowed: [DIGITS; 9],
                    rule_indices: Vec::new(),
                });
            if positive.rule_indices.last() != Some(&rule_index) {
                positive.rule_indices.push(rule_index);
            }
            for (allowed, other) in positive.allowed.iter_mut().zip(link.supports[0]) {
                *allowed &= other;
            }
        }
    }
    Ok(())
}

fn finish_markers(
    clues: &mut Vec<PairClue>,
    markers: Markers,
    technique: VariantTechnique,
    relations: [Relation; 2],
) -> Range<usize> {
    if markers.negative.into_iter().any(|active| active) {
        let source = Arc::new(RuleSource {
            technique,
            indices: markers.rule_indices,
        });
        for cells in orthogonal_pairs().filter(|pair| {
            !markers.marked.contains_key(pair) && !markers.exemptions.contains(pair)
        }) {
            clues.push(pair(&source, cells, |a, b| {
                markers
                    .negative
                    .into_iter()
                    .zip(relations)
                    .all(|(active, relation)| !active || !relation(a, b))
            }));
        }
    }
    let start = clues.len();
    for (cells, marker) in markers.marked {
        let source = Arc::new(RuleSource {
            technique,
            indices: marker.rule_indices,
        });
        clues.push(PairClue {
            source,
            cells: cells.to_vec(),
            links: vec![PairConstraint::new(cells, marker.allowed)],
        });
    }
    start..clues.len()
}

fn pair(
    source: &Arc<RuleSource>,
    cells: [usize; 2],
    relation: impl Fn(u8, u8) -> bool,
) -> PairClue {
    PairClue {
        source: Arc::clone(source),
        cells: cells.to_vec(),
        links: vec![link(cells, relation)],
    }
}

fn path(source: &Arc<RuleSource>, cells: &[usize], relation: impl Fn(u8, u8) -> bool) -> PairClue {
    let links = cells
        .windows(2)
        .map(|pair| link([pair[0], pair[1]], &relation))
        .collect();
    PairClue {
        source: Arc::clone(source),
        // A walk may revisit a cell. Keep every edge, with one domain and
        // assignment variable per distinct cell.
        cells: cells.iter().copied().fold(Vec::new(), |mut scope, cell| {
            if !scope.contains(&cell) { scope.push(cell); }
            scope
        }),
        links,
    }
}

fn link([first, second]: [usize; 2], relation: impl Fn(u8, u8) -> bool) -> PairConstraint {
    PairConstraint::from_relation([first, second], 9, relation)
}

pub(super) fn orthogonal_pairs() -> impl Iterator<Item = [usize; 2]> {
    geometric_pairs(|rows, columns| rows + columns == 1)
}

fn geometric_pairs(
    matches: impl Fn(usize, usize) -> bool + Copy,
) -> impl Iterator<Item = [usize; 2]> {
    (0..CELLS).flat_map(move |first| {
        (first + 1..CELLS).filter_map(move |second| {
            matches(
                (first / 9).abs_diff(second / 9),
                (first % 9).abs_diff(second % 9),
            )
            .then_some([first, second])
        })
    })
}
