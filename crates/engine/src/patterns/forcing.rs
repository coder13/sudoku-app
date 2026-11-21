use super::{
    CELLS, ControlFlow, Deduction, DeductionActions, HintAction, HintEvidence, House, Technique,
    bit_indices, cells, coordinates, house_cells,
    links::{CANDIDATE_COUNT, candidate, index},
};
use crate::{
    Candidate, ForcingBranch, ForcingCase, ForcingConflict, ForcingInference, ForcingLiteral,
    ForcingScope,
};
use std::{cell::OnceCell, collections::BTreeSet};

mod advanced;
mod witnesses;

const STATES: usize = CANDIDATE_COUNT * 2;
const UNSEEN: usize = usize::MAX;
const WORDS: usize = STATES.div_ceil(64);

pub(super) struct ForcingGraph {
    clauses: Vec<Clause>,
    available: Vec<usize>,
    intersections: OnceCell<IntersectionIndex>,
}

struct Clause {
    scope: ForcingScope,
    members: Vec<usize>,
    // Cell clauses index digits. House clauses index cells.
    domain: u128,
}

struct Intersection {
    scope: ForcingScope,
    digit: usize,
    shared_cells: u128,
    premise_cells: u128,
    premises: Vec<usize>,
    target_cells: u128,
}

struct IntersectionIndex {
    items: Vec<Intersection>,
    by_premise: Vec<Vec<(usize, u64)>>,
}

impl IntersectionIndex {
    fn new(items: Vec<Intersection>) -> Self {
        let mut by_premise = vec![Vec::<(usize, u64)>::new(); CANDIDATE_COUNT];
        for (index, intersection) in items.iter().enumerate() {
            let word = index / 64;
            let bit = 1 << (index % 64);
            for &premise in &intersection.premises {
                let words = &mut by_premise[premise];
                if let Some((_, mask)) = words.last_mut().filter(|(last, _)| *last == word) {
                    *mask |= bit;
                } else {
                    words.push((word, bit));
                }
            }
        }
        Self { items, by_premise }
    }
}

impl Intersection {
    fn can_advance(&self, removed: u128) -> bool {
        self.premise_cells & !removed == 0 && (self.shared_cells & !removed).count_ones() >= 2
    }
}

impl ForcingGraph {
    pub(super) fn new(masks: &[u16; CELLS], positions: &[u128; 9]) -> Self {
        let mut clauses = Vec::with_capacity(CELLS + 27 * 9);
        let mut available = Vec::new();
        for (cell, &mask) in masks.iter().enumerate() {
            let members: Vec<_> = bit_indices(mask).map(|digit| cell * 9 + digit).collect();
            available.extend(&members);
            clauses.push(Clause {
                scope: ForcingScope::Cell(cell),
                members,
                domain: u128::from(mask),
            });
        }
        for house in House::all() {
            for (digit, &positions) in positions.iter().enumerate() {
                let domain = positions & house_cells(house);
                clauses.push(Clause {
                    scope: ForcingScope::House {
                        house,
                        digit: digit as u8 + 1,
                    },
                    members: cells(domain).map(|cell| cell * 9 + digit).collect(),
                    domain,
                });
            }
        }
        Self {
            clauses,
            available,
            intersections: OnceCell::new(),
        }
    }

    pub(super) fn visit(
        &self,
        technique: Technique,
        search: &super::PatternSearch<'_>,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        if technique == Technique::NestedForcingNet {
            return self.visit_nested(search, visit);
        }
        if technique == Technique::AdvancedForcingNet && self.available.len() == CANDIDATE_COUNT {
            return ControlFlow::Continue(());
        }
        let mode = match technique {
            Technique::ForcingChain => Mode::Chain,
            Technique::ForcingNet => Mode::Net,
            Technique::DynamicForcingNet => Mode::Dynamic,
            Technique::AdvancedForcingNet => Mode::Advanced,
            _ => unreachable!(),
        };
        let mut branch = BranchSearch::new(self, mode);
        let mut emitted = BTreeSet::new();
        let mut outcomes = Outcomes {
            slots: [UNSEEN; STATES],
            summaries: Vec::new(),
        };

        for &id in &self.available {
            for assumption in [id * 2 + 1, id * 2] {
                if let Some(conflict) = branch.run(assumption) {
                    if branch.uses_mode(Terminal::Conflict(conflict)) {
                        let action = action(assumption ^ 1);
                        if emitted.insert(action) {
                            emit(
                                technique,
                                action,
                                None,
                                vec![branch.proof(Terminal::Conflict(conflict))],
                                visit,
                            )?;
                        }
                    }
                } else {
                    outcomes.slots[assumption] = outcomes.summaries.len();
                    outcomes.summaries.push(branch.summary());
                }
            }
        }

        // A verity can make a deduction easier to follow than its complementary contradiction.
        // Keep one proof of each kind per action while the solver can stop at the first proof.
        emitted.clear();
        let mut alternatives = Vec::with_capacity(9);
        for &id in &self.available {
            Self::visit_verity(
                ForcingScope::Candidate(candidate(id)),
                &[id * 2, id * 2 + 1],
                &outcomes,
                &mut branch,
                &mut emitted,
                technique,
                visit,
            )?;
        }
        for clause in self
            .clauses
            .iter()
            .filter(|clause| clause.members.len() > 1)
        {
            alternatives.clear();
            alternatives.extend(clause.members.iter().map(|&id| id * 2 + 1));
            Self::visit_verity(
                clause.scope,
                &alternatives,
                &outcomes,
                &mut branch,
                &mut emitted,
                technique,
                visit,
            )?;
        }
        ControlFlow::Continue(())
    }

    fn visit_nested(
        &self,
        search: &super::PatternSearch<'_>,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let mut branch = BranchSearch::new(self, Mode::Dynamic);
        let mut witnesses = witnesses::Search::new(
            search.board,
            search.masks,
            search.verified_solution,
            search.completion_probe_nodes,
        );
        #[cfg(feature = "variants")]
        witnesses.seed(search.completion_support);
        for &id in &self.available {
            for assumption in [id * 2 + 1, id * 2] {
                // Any compatible completion rules out a contradiction for this
                // assumption. Unwitnessed branches still prove both inner cases.
                if witnesses.satisfies(candidate(id), assumption % 2 == 1) {
                    continue;
                }
                if branch.run(assumption).is_some() {
                    continue;
                }
                if let Some(proof) = branch.split() {
                    emit(
                        Technique::NestedForcingNet,
                        action(assumption ^ 1),
                        None,
                        vec![proof],
                        visit,
                    )?;
                }
            }
        }
        ControlFlow::Continue(())
    }

    fn visit_verity(
        scope: ForcingScope,
        assumptions: &[usize],
        outcomes: &Outcomes,
        branch: &mut BranchSearch<'_>,
        emitted: &mut BTreeSet<HintAction>,
        technique: Technique,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        if assumptions
            .iter()
            .any(|&state| outcomes.slots[state] == UNSEEN)
        {
            return ControlFlow::Continue(());
        }
        let mut common = outcomes.summaries[outcomes.slots[assumptions[0]]].reached;
        let mut specialized = [0; WORDS];
        for &assumption in assumptions {
            let outcome = &outcomes.summaries[outcomes.slots[assumption]];
            for (i, word) in common.iter_mut().enumerate() {
                *word &= outcome.reached[i];
                specialized[i] |= outcome.specialized[i];
            }
        }
        for (word, mut bits) in common.into_iter().enumerate() {
            if branch.mode != Mode::Chain {
                bits &= specialized[word];
            }
            while bits != 0 {
                let state = word * 64 + bits.trailing_zeros() as usize;
                bits &= bits - 1;
                let result = action(state);
                if !emitted.insert(result) {
                    continue;
                }
                let proofs = assumptions
                    .iter()
                    .map(|&assumption| {
                        branch.run(assumption);
                        branch.proof(Terminal::Effect(branch.seen[state]))
                    })
                    .collect();
                emit(technique, result, Some(scope), proofs, visit)?;
            }
        }
        ControlFlow::Continue(())
    }

    fn build_intersections(&self) -> Vec<Intersection> {
        let mut intersections = Vec::new();
        for source_clause in &self.clauses[CELLS..] {
            let ForcingScope::House {
                house: source,
                digit,
            } = source_clause.scope
            else {
                unreachable!();
            };
            if source_clause.members.len() < 3 {
                continue;
            }
            let source_cells = house_cells(source);
            for (index, target) in House::all().enumerate() {
                let target_cells = house_cells(target);
                if source == target || (source_cells & target_cells).count_ones() < 2 {
                    continue;
                }
                let (shared, premises): (Vec<_>, Vec<_>) = source_clause
                    .members
                    .iter()
                    .copied()
                    .partition(|&id| target_cells & (1 << (id / 9)) != 0);
                // A single shared candidate is handled by ordinary net propagation.
                // An empty premise would already be a locked candidate before the assumption.
                if shared.len() < 2 || premises.is_empty() {
                    continue;
                }
                let digit_index = usize::from(digit - 1);
                let target_cells =
                    self.clauses[CELLS + index * 9 + digit_index].domain & !source_cells;
                if target_cells != 0 {
                    intersections.push(Intersection {
                        scope: ForcingScope::Intersection {
                            source,
                            target,
                            digit,
                        },
                        digit: digit_index,
                        shared_cells: shared.iter().fold(0, |mask, id| mask | (1 << (id / 9))),
                        premise_cells: premises.iter().fold(0, |mask, id| mask | (1 << (id / 9))),
                        premises,
                        target_cells,
                    });
                }
            }
        }
        intersections
    }
}

fn emit(
    technique: Technique,
    action: HintAction,
    scope: Option<ForcingScope>,
    branches: Vec<ForcingBranch>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let actions = match action {
        HintAction::Place(_) => DeductionActions::Placement(action),
        HintAction::Eliminate(_) => DeductionActions::Eliminations(vec![action]),
    };
    visit(Deduction {
        technique,
        evidence: HintEvidence::Forcing { scope, branches },
        actions,
    })
}

#[derive(Clone, Copy)]
enum Cause {
    Assumption,
    Exclusion { clause: usize, fact: usize },
    LastCandidate { clause: usize },
    Intersection { index: usize },
    Advanced { index: usize },
    LastGuardian,
}

#[derive(Clone, Copy, Eq, Ord, PartialEq, PartialOrd)]
enum Mode {
    Chain,
    Net,
    Dynamic,
    Advanced,
}

#[derive(Clone, Copy)]
struct Fact {
    state: usize,
    cause: Cause,
    mode: Mode,
}

#[derive(Clone, Copy)]
enum Conflict {
    Opposite([usize; 2]),
    Exhausted(usize),
    GuardiansExhausted,
}

#[derive(Clone, Copy)]
enum Terminal {
    Effect(usize),
    Conflict(Conflict),
}

struct Summary {
    reached: [u64; WORDS],
    specialized: [u64; WORDS],
}

struct Outcomes {
    slots: [usize; STATES],
    summaries: Vec<Summary>,
}

/// Reuses the same hypothetical propagation when several patterns share a guardian.
pub(super) struct GuardianSearch<'a> {
    branch: BranchSearch<'a>,
    slots: [usize; STATES],
    reached: Vec<[u64; WORDS]>,
}

pub(super) struct GuardianRefutations {
    pub maximum_guardians: usize,
    removals: Vec<[u64; WORDS]>,
}

impl<'a> GuardianSearch<'a> {
    const CONTRADICTION: usize = UNSEEN - 1;

    pub(super) fn new(graph: &'a ForcingGraph) -> Self {
        Self {
            branch: BranchSearch::new(graph, Mode::Dynamic),
            slots: [UNSEEN; STATES],
            reached: Vec::new(),
        }
    }

    /// Recreate the same ordered alternatives for each pass. Stop enumeration
    /// when no shared effect remains; emitted proofs still include every branch.
    pub(super) fn visit<I: Iterator<Item = Candidate>>(
        &mut self,
        guardians: impl Fn() -> I,
        useful: &mut impl FnMut(HintAction) -> bool,
        visit: &mut impl FnMut(HintAction, Vec<ForcingBranch>) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let mut common = None;
        for guardian in guardians() {
            if let Some(known) = self.reached(index(guardian) * 2 + 1) {
                let common = common.get_or_insert(*known);
                for (word, &bits) in common.iter_mut().zip(known) {
                    *word &= bits;
                }
                if common.iter().all(|&word| word == 0) {
                    return ControlFlow::Continue(());
                }
            }
        }
        let Some(common) = common else {
            return ControlFlow::Continue(());
        };
        for (word, mut bits) in common.into_iter().enumerate() {
            while bits != 0 {
                let state = word * 64 + bits.trailing_zeros() as usize;
                bits &= bits - 1;
                let action = action(state);
                if !useful(action) {
                    continue;
                }
                let branches = guardians()
                    .map(|guardian| {
                        let terminal = match self.branch.run(index(guardian) * 2 + 1) {
                            Some(conflict) => Terminal::Conflict(conflict),
                            None => Terminal::Effect(self.branch.seen[state]),
                        };
                        self.branch.proof(terminal)
                    })
                    .collect();
                visit(action, branches)?;
            }
        }
        ControlFlow::Continue(())
    }

    pub(super) fn visit_refutations(
        &mut self,
        guardians: &[Candidate],
        refutations: &GuardianRefutations,
        useful: &mut impl FnMut(HintAction) -> bool,
        visit: &mut impl FnMut(HintAction, Vec<ForcingBranch>) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let indices: Vec<_> = guardians.iter().copied().map(index).collect();
        let words = guardian_words(&indices);
        // If an assumption leaves at most one guardian possible, it rules
        // out at least one of the first two. The index uses the conclusion
        // so that iteration tries each candidate's positive assumption first.
        let first = &refutations.removals[indices[0]];
        let second = &refutations.removals[indices[1]];
        for (word, (&first, &second)) in first.iter().zip(second).enumerate() {
            let mut candidates = first | second;
            while candidates != 0 {
                let assumption = (word * 64 + candidates.trailing_zeros() as usize) ^ 1;
                candidates &= candidates - 1;
                let Some(reached) = self.reached(assumption) else {
                    continue;
                };
                // The clause can advance a settled branch only when every alternative
                // has been ruled out but one, or the branch rules out all of them.
                if !guardian_clause_can_advance(&words, reached) {
                    continue;
                }
                let conclusion = action(assumption ^ 1);
                if useful(conclusion)
                    && let Some(proof) = self.branch.refute_with_guardians(assumption, &indices)
                {
                    visit(conclusion, vec![proof])?;
                }
            }
        }
        ControlFlow::Continue(())
    }

    /// A first guardian inference needs all but one of its candidates removed by ordinary propagation.
    pub(super) fn refutation_candidates(&mut self) -> GuardianRefutations {
        const FALSE_STATES: u64 = 0x5555_5555_5555_5555;
        let mut refutations = GuardianRefutations {
            maximum_guardians: 0,
            removals: vec![[0; WORDS]; CANDIDATE_COUNT],
        };
        for i in 0..self.branch.graph.available.len() {
            let id = self.branch.graph.available[i];
            for assumption in [id * 2 + 1, id * 2] {
                if let Some(reached) = self.reached(assumption) {
                    let conclusion = assumption ^ 1;
                    let mut count = 0;
                    for (word, &known) in reached.iter().enumerate() {
                        let mut removed = known & FALSE_STATES;
                        count += removed.count_ones() as usize;
                        while removed != 0 {
                            let candidate = word * 32 + removed.trailing_zeros() as usize / 2;
                            removed &= removed - 1;
                            refutations.removals[candidate][conclusion / 64] |=
                                1 << (conclusion % 64);
                        }
                    }
                    refutations.maximum_guardians = refutations.maximum_guardians.max(count + 1);
                }
            }
        }
        refutations
    }

    fn reached(&mut self, assumption: usize) -> Option<&[u64; WORDS]> {
        if self.slots[assumption] == UNSEEN {
            self.slots[assumption] = if self.branch.run(assumption).is_some() {
                Self::CONTRADICTION
            } else {
                self.reached.push(self.branch.summary().reached);
                self.reached.len() - 1
            };
        }
        self.reached.get(self.slots[assumption])
    }
}

fn guardian_words(indices: &[usize]) -> Vec<(usize, u64)> {
    let mut masks = [0; WORDS];
    for &id in indices {
        let state = id * 2;
        masks[state / 64] |= 1u64 << (state % 64);
    }
    masks
        .into_iter()
        .enumerate()
        .filter(|(_, bits)| *bits != 0)
        .collect()
}

/// False literals use even bits, so shifting each mask once selects its true literals.
fn guardian_clause_can_advance(words: &[(usize, u64)], reached: &[u64; WORDS]) -> bool {
    let mut remaining = 0;
    for &(word, alternatives) in words {
        let known = reached[word];
        if known & (alternatives << 1) != 0 {
            return false;
        }
        remaining += (alternatives & !known).count_ones();
        if remaining > 1 {
            return false;
        }
    }
    true
}

struct BranchSearch<'a> {
    graph: &'a ForcingGraph,
    mode: Mode,
    intersections: Option<&'a IntersectionIndex>,
    pending_intersections: Vec<u64>,
    advanced: Option<Box<advanced::State>>,
    guardians: Vec<usize>,
    seen: [usize; STATES],
    // Index negative literals both ways for cell and house clauses.
    removed: [u128; 9],
    removed_from_cell: [u16; CELLS],
    facts: Vec<Fact>,
}

impl<'a> BranchSearch<'a> {
    fn new(graph: &'a ForcingGraph, mode: Mode) -> Self {
        let intersections = (mode >= Mode::Dynamic).then(|| {
            graph
                .intersections
                .get_or_init(|| IntersectionIndex::new(graph.build_intersections()))
        });
        Self {
            graph,
            mode,
            intersections,
            pending_intersections: intersections
                .map_or_else(Vec::new, |index| vec![0; index.items.len().div_ceil(64)]),
            advanced: (mode == Mode::Advanced).then(|| Box::new(advanced::State::new(graph))),
            guardians: Vec::new(),
            seen: [UNSEEN; STATES],
            removed: [0; 9],
            removed_from_cell: [0; CELLS],
            facts: Vec::new(),
        }
    }

    fn run(&mut self, assumption: usize) -> Option<Conflict> {
        self.rollback(0);
        self.extend(assumption)
    }

    fn rollback(&mut self, len: usize) {
        // Branch starts and split checkpoints have no pending intersections.
        self.pending_intersections.fill(0);
        if let Some(advanced) = &mut self.advanced {
            advanced.rollback(&self.facts, len);
        }
        for fact in self.facts.drain(len..) {
            self.seen[fact.state] = UNSEEN;
            if fact.state & 1 == 0 {
                let id = fact.state / 2;
                let (cell, digit) = (id / 9, id % 9);
                self.removed[digit] &= !(1 << cell);
                self.removed_from_cell[cell] &= !(1 << digit);
            }
        }
    }

    fn extend(&mut self, assumption: usize) -> Option<Conflict> {
        let next = self.facts.len();
        self.add(assumption, Cause::Assumption, Mode::Chain);
        self.settle(next)
    }

    fn settle(&mut self, mut next: usize) -> Option<Conflict> {
        loop {
            if let Some(conflict) = self.propagate(&mut next) {
                return Some(conflict);
            }
            // Drain ordinary propagation before each round of locked candidates.
            if let Some(conflict) = self.apply_intersections() {
                return Some(conflict);
            }
            if next != self.facts.len() {
                continue;
            }
            if let Some(conflict) = self.apply_guardians() {
                return Some(conflict);
            }
            if next == self.facts.len()
                && let Some(conflict) = self.apply_advanced()
            {
                return Some(conflict);
            }
            if next == self.facts.len() {
                return None;
            }
        }
    }

    fn refute_with_guardians(
        &mut self,
        assumption: usize,
        guardians: &[usize],
    ) -> Option<ForcingBranch> {
        let ordinary_conflict = self.run(assumption);
        debug_assert!(ordinary_conflict.is_none());
        self.guardians.extend_from_slice(guardians);
        let proof = self
            .settle(self.facts.len())
            .map(|conflict| self.proof(Terminal::Conflict(conflict)));
        self.guardians.clear();
        proof
    }

    fn apply_guardians(&mut self) -> Option<Conflict> {
        if self.guardians.is_empty() {
            return None;
        }
        let mut possible = self
            .guardians
            .iter()
            .copied()
            .filter(|&id| self.seen[id * 2] == UNSEEN);
        let Some(last) = possible.next() else {
            return Some(Conflict::GuardiansExhausted);
        };
        if possible.next().is_none() {
            return self.add(last * 2 + 1, Cause::LastGuardian, Mode::Dynamic);
        }
        None
    }

    fn split(&mut self) -> Option<ForcingBranch> {
        let checkpoint = self.facts.len();
        for &id in &self.graph.available {
            let state = id * 2;
            if self.seen[state] != UNSEEN || self.seen[state + 1] != UNSEEN {
                continue;
            }
            // A viable positive case already rules out a split contradiction for this candidate.
            let positive_conflicts = self.extend(state + 1).is_some();
            self.rollback(checkpoint);
            if !positive_conflicts {
                continue;
            }
            let negative = self.extend(state);
            let Some(negative) = negative else {
                self.rollback(checkpoint);
                continue;
            };

            let mut negative = self.proof_since(Terminal::Conflict(negative), checkpoint).0;
            self.rollback(checkpoint);
            // Rebuild the positive evidence only when both cases fail.
            let positive = self.extend(state + 1).expect("same trial and outer facts");
            let mut positive = self.proof_since(Terminal::Conflict(positive), checkpoint).0;
            self.rollback(checkpoint);

            let roots = positive.premises.iter().chain(&negative.premises).copied();
            let (outer, indices) = self.build_proof(roots, 0, None);
            for root in positive.premises.iter_mut().chain(&mut negative.premises) {
                *root = indices[*root];
            }
            let mut outer = outer.branch;
            outer.conflict = Some(ForcingConflict::Cases(Box::new([positive, negative])));
            return Some(outer);
        }
        None
    }

    fn propagate(&mut self, next: &mut usize) -> Option<Conflict> {
        while *next < self.facts.len() {
            let fact = self.facts[*next];
            let id = fact.state / 2;
            let (cell, digit) = (id / 9, id % 9);
            for clause in clauses_for(id) {
                let source = &self.graph.clauses[clause];
                // Already-forced singles need no hypothetical proof.
                if source.members.len() < 2 {
                    continue;
                }
                let (removed, first, stride, pivot) = if clause < CELLS {
                    (u128::from(self.removed_from_cell[cell]), cell * 9, 1, digit)
                } else {
                    (self.removed[digit], digit, 9, cell)
                };
                let possible = source.domain & !removed;
                if fact.state & 1 != 0 {
                    for position in cells(possible & !(1 << pivot)) {
                        if let Some(conflict) = self.add(
                            (first + position * stride) * 2,
                            Cause::Exclusion {
                                clause,
                                fact: *next,
                            },
                            fact.mode,
                        ) {
                            return Some(conflict);
                        }
                    }
                    continue;
                }
                if possible == 0 {
                    return Some(Conflict::Exhausted(clause));
                }
                if (self.mode != Mode::Chain || source.members.len() == 2)
                    && possible.is_power_of_two()
                {
                    let last = first + possible.trailing_zeros() as usize * stride;
                    let positive = last * 2 + 1;
                    if self.seen[positive] != UNSEEN {
                        continue;
                    }
                    let mut mode = fact.mode;
                    if source.members.len() > 2 {
                        mode = mode.max(Mode::Net);
                        if self.mode >= Mode::Dynamic && mode != self.mode {
                            mode = self
                                .causes(clause, Some(last))
                                .map(|index| self.facts[index].mode)
                                .fold(mode, Mode::max);
                        }
                    }
                    if let Some(conflict) =
                        self.add(positive, Cause::LastCandidate { clause }, mode)
                    {
                        return Some(conflict);
                    }
                }
            }
            *next += 1;
        }
        None
    }

    fn apply_intersections(&mut self) -> Option<Conflict> {
        let Some(intersections) = self.intersections else {
            return None;
        };
        let mut cursor = 0;
        while let Some(word) = self.pending_intersections.get_mut(cursor / 64) {
            let pending = *word & (u64::MAX << (cursor % 64));
            if pending == 0 {
                cursor += 64 - cursor % 64;
                continue;
            }
            let bit = pending.trailing_zeros() as usize;
            *word &= !(1 << bit);
            let index = cursor / 64 * 64 + bit;
            // New removals can trigger later intersections in this sweep.
            // Earlier ones run on the next sweep, after ordinary propagation.
            cursor = index + 1;
            let intersection = &intersections.items[index];
            let digit = intersection.digit;
            let removed = self.removed[digit];
            let targets = intersection.target_cells & !removed;
            if targets == 0 || !intersection.can_advance(removed) {
                continue;
            }
            let mode = if self.mode == Mode::Advanced {
                self.intersection_causes(index)
                    .map(|cause| self.facts[cause].mode)
                    .fold(Mode::Dynamic, Mode::max)
            } else {
                Mode::Dynamic
            };
            for cell in cells(targets) {
                let target = cell * 9 + digit;
                if let Some(conflict) = self.add(target * 2, Cause::Intersection { index }, mode) {
                    return Some(conflict);
                }
            }
        }
        None
    }

    fn apply_advanced(&mut self) -> Option<Conflict> {
        let advanced = self.advanced.as_mut()?;
        advanced.sync(&self.facts);
        let (step, pattern) = advanced.next(self.graph, &self.seen, self.facts.len())?;
        let pattern_index = advanced.patterns.len();
        advanced.patterns.push(pattern);
        for &action in step.actions() {
            debug_assert!(matches!(action, HintAction::Eliminate(_)));
            if let Some(conflict) = self.add(
                index(action.candidate()) * 2,
                Cause::Advanced {
                    index: pattern_index,
                },
                Mode::Advanced,
            ) {
                return Some(conflict);
            }
        }
        None
    }

    fn add(&mut self, state: usize, cause: Cause, mode: Mode) -> Option<Conflict> {
        if self.seen[state] != UNSEEN {
            return None;
        }
        let index = self.facts.len();
        self.facts.push(Fact { state, cause, mode });
        self.seen[state] = index;
        if state & 1 == 0 {
            let id = state / 2;
            let (cell, digit) = (id / 9, id % 9);
            self.removed[digit] |= 1 << cell;
            self.removed_from_cell[cell] |= 1 << digit;
            if let Some(intersections) = self.intersections {
                for &(word, mask) in &intersections.by_premise[id] {
                    self.pending_intersections[word] |= mask;
                }
            }
        }
        (self.seen[state ^ 1] != UNSEEN).then(|| Conflict::Opposite([self.seen[state ^ 1], index]))
    }

    fn summary(&self) -> Summary {
        let mut summary = Summary {
            reached: [0; WORDS],
            specialized: [0; WORDS],
        };
        for fact in &self.facts {
            let bit = 1 << (fact.state % 64);
            summary.reached[fact.state / 64] |= bit;
            if fact.mode == self.mode {
                summary.specialized[fact.state / 64] |= bit;
            }
        }
        summary
    }

    fn causes(&self, clause: usize, except: Option<usize>) -> impl Iterator<Item = usize> + '_ {
        self.graph.clauses[clause]
            .members
            .iter()
            .copied()
            .filter(move |&id| Some(id) != except)
            .map(|id| self.seen[id * 2])
    }

    fn roots(&self, terminal: Terminal) -> Vec<usize> {
        match terminal {
            Terminal::Effect(index) => vec![index],
            Terminal::Conflict(Conflict::Opposite(indices)) => indices.to_vec(),
            Terminal::Conflict(Conflict::Exhausted(clause)) => self.causes(clause, None).collect(),
            Terminal::Conflict(Conflict::GuardiansExhausted) => {
                self.guardian_causes(None).collect()
            }
        }
    }

    fn uses_mode(&self, terminal: Terminal) -> bool {
        self.mode == Mode::Chain
            || self
                .roots(terminal)
                .iter()
                .any(|&index| self.facts[index].mode == self.mode)
    }

    fn intersection_causes(&self, index: usize) -> impl Iterator<Item = usize> + '_ {
        self.intersections.unwrap().items[index]
            .premises
            .iter()
            .map(|&id| self.seen[id * 2])
    }

    fn guardian_causes(&self, except: Option<usize>) -> impl Iterator<Item = usize> + '_ {
        self.guardians
            .iter()
            .copied()
            .filter(move |&id| Some(id) != except)
            .map(|id| self.seen[id * 2])
    }

    fn proof(&self, terminal: Terminal) -> ForcingBranch {
        self.proof_since(terminal, 0).0.branch
    }

    fn proof_since(&self, terminal: Terminal, assumption: usize) -> (ForcingCase, Vec<usize>) {
        let conflict = match terminal {
            Terminal::Effect(_) => None,
            Terminal::Conflict(conflict) => Some(conflict),
        };
        self.build_proof(self.roots(terminal), assumption, conflict)
    }

    fn build_proof(
        &self,
        roots: impl IntoIterator<Item = usize>,
        assumption: usize,
        conflict: Option<Conflict>,
    ) -> (ForcingCase, Vec<usize>) {
        let mut retained = vec![false; self.facts.len()];
        for index in roots {
            retained[index] = true;
        }
        let first_step = assumption + 1;
        for i in (first_step..self.facts.len()).rev() {
            if !retained[i] {
                continue;
            }
            let fact = self.facts[i];
            match fact.cause {
                Cause::Exclusion { fact, .. } => retained[fact] = true,
                Cause::LastCandidate { clause } => {
                    for other in self.causes(clause, Some(fact.state / 2)) {
                        retained[other] = true;
                    }
                }
                Cause::Intersection { index } => {
                    for source in self.intersection_causes(index) {
                        retained[source] = true;
                    }
                }
                Cause::Advanced { index } => {
                    for &source in &self.advanced.as_ref().unwrap().patterns[index].premises {
                        retained[source] = true;
                    }
                }
                Cause::LastGuardian => {
                    for source in self.guardian_causes(Some(fact.state / 2)) {
                        retained[source] = true;
                    }
                }
                Cause::Assumption => unreachable!(),
            }
        }

        let mut indices = vec![0; self.facts.len()];
        let mut premises = Vec::new();
        for (i, &retain) in retained[..assumption].iter().enumerate() {
            if retain {
                premises.push(i);
                indices[i] = premises.len();
            }
        }
        let mut steps = Vec::new();
        for (i, &fact) in self.facts.iter().enumerate().skip(first_step) {
            if !retained[i] {
                continue;
            }
            let (scope, causes) = match fact.cause {
                Cause::Exclusion { clause, fact } => {
                    (self.graph.clauses[clause].scope, vec![indices[fact]])
                }
                Cause::LastCandidate { clause } => (
                    self.graph.clauses[clause].scope,
                    self.causes(clause, Some(fact.state / 2))
                        .map(|source| indices[source])
                        .collect(),
                ),
                Cause::Intersection { index } => (
                    self.intersections.unwrap().items[index].scope,
                    self.intersection_causes(index)
                        .map(|source| indices[source])
                        .collect(),
                ),
                Cause::Advanced { index } => {
                    let pattern = &self.advanced.as_ref().unwrap().patterns[index];
                    (
                        pattern.scope,
                        pattern
                            .premises
                            .iter()
                            .map(|&source| indices[source])
                            .collect(),
                    )
                }
                Cause::LastGuardian => (
                    ForcingScope::Guardians,
                    self.guardian_causes(Some(fact.state / 2))
                        .map(|source| indices[source])
                        .collect(),
                ),
                Cause::Assumption => unreachable!(),
            };
            steps.push(ForcingInference {
                effect: literal(fact.state),
                scope,
                causes,
            });
            indices[i] = premises.len() + steps.len();
        }
        let conflict = conflict.map(|conflict| match conflict {
            Conflict::Opposite(pair) => ForcingConflict::Opposite(pair.map(|i| indices[i])),
            Conflict::Exhausted(clause) => ForcingConflict::Exhausted {
                scope: self.graph.clauses[clause].scope,
                causes: self.causes(clause, None).map(|i| indices[i]).collect(),
            },
            Conflict::GuardiansExhausted => ForcingConflict::Exhausted {
                scope: ForcingScope::Guardians,
                causes: self.guardian_causes(None).map(|i| indices[i]).collect(),
            },
        });
        let branch = ForcingBranch {
            assumption: literal(self.facts[assumption].state),
            steps,
            conflict,
        };
        (ForcingCase { premises, branch }, indices)
    }
}

fn clauses_for(id: usize) -> [usize; 4] {
    let cell = id / 9;
    let digit = id % 9;
    let (row, column, group) = coordinates(cell);
    [
        cell,
        CELLS + row * 9 + digit,
        CELLS + (9 + column) * 9 + digit,
        CELLS + (18 + group) * 9 + digit,
    ]
}

fn house_clause(house: House, digit: u8) -> usize {
    CELLS + house.index() * 9 + usize::from(digit - 1)
}

fn literal(state: usize) -> ForcingLiteral {
    ForcingLiteral {
        candidate: candidate(state / 2),
        truth: state & 1 != 0,
    }
}

fn action(state: usize) -> HintAction {
    let literal = literal(state);
    if literal.truth {
        HintAction::Place(literal.candidate)
    } else {
        HintAction::Eliminate(literal.candidate)
    }
}

#[cfg(test)]
mod guardian_tests {
    use super::*;

    #[test]
    fn intersection_work_preserves_sweep_order_and_does_not_leak_across_splits() {
        let masks = [0x1ff; CELLS];
        let positions = super::super::candidate_positions(&masks);
        let graph = ForcingGraph::new(&masks, &positions);
        let intersection = |premise: usize, target: usize| Intersection {
            scope: ForcingScope::Intersection {
                source: House::Row(0),
                target: House::Box(0),
                digit: 1,
            },
            digit: 0,
            shared_cells: (1 << 12) | (1 << 13),
            premise_cells: 1 << premise,
            premises: vec![premise * 9],
            target_cells: 1 << target,
        };
        let mut intersections = vec![intersection(6, 8)];
        intersections.extend((1..64).map(|_| intersection(80, 42)));
        intersections.extend([intersection(0, 6), intersection(6, 7)]);
        assert!(
            graph
                .intersections
                .set(IntersectionIndex::new(intersections))
                .is_ok()
        );

        let mut branch = BranchSearch::new(&graph, Mode::Dynamic);
        branch.add(17 * 18, Cause::Assumption, Mode::Chain);
        assert!(branch.apply_intersections().is_none());
        let checkpoint = branch.facts.len();

        branch.add(0, Cause::Assumption, Mode::Chain);
        assert!(branch.apply_intersections().is_none());
        assert_eq!(branch.pending_intersections[0], 1);
        branch.rollback(checkpoint);
        assert!(branch.pending_intersections.iter().all(|&word| word == 0));

        for _ in 0..2 {
            branch.add(0, Cause::Assumption, Mode::Chain);
            assert!(branch.apply_intersections().is_none());
            // Index 65 runs in the current pass. Index 0 waits for the next pass.
            let sites = branch
                .facts
                .iter()
                .map(|fact| fact.state / 18)
                .collect::<Vec<_>>();
            assert_eq!(sites, [17, 0, 6, 7]);
            assert!(branch.apply_intersections().is_none());
            assert!(matches!(
                branch.facts.last(),
                Some(Fact { state, cause: Cause::Intersection { index: 0 }, .. }) if *state == 8 * 18
            ));
            branch.rollback(checkpoint);
            assert!(branch.apply_intersections().is_none());
            assert_eq!(branch.facts.len(), checkpoint);
        }
    }

    #[test]
    fn intersection_eligibility_requires_a_confined_source_with_two_remaining_sites() {
        // Every subset of every source house covers removals on both sides of
        // each shared boundary, including the high bits at cells 64 through 80.
        for source in House::all() {
            let source_cells = source.cells();
            for target in House::all() {
                let shared = house_cells(source) & house_cells(target);
                if source == target || shared.count_ones() < 2 {
                    continue;
                }
                let intersection = Intersection {
                    scope: ForcingScope::Intersection {
                        source,
                        target,
                        digit: 9,
                    },
                    digit: 8,
                    shared_cells: shared,
                    premise_cells: house_cells(source) & !shared,
                    premises: Vec::new(),
                    target_cells: 0,
                };
                for selection in 0u16..512 {
                    let removed = source_cells.iter().enumerate().fold(0, |mask, (i, &cell)| {
                        mask | if selection & (1 << i) != 0 {
                            1 << cell
                        } else {
                            0
                        }
                    });
                    let remaining: Vec<_> = source_cells
                        .iter()
                        .copied()
                        .filter(|&cell| removed & (1 << cell) == 0)
                        .collect();
                    let confined = remaining.iter().all(|&cell| target.cells().contains(&cell));
                    assert_eq!(
                        intersection.can_advance(removed),
                        confined && remaining.len() >= 2
                    );
                    // Eliminating unrelated sites cannot change this lock.
                    assert_eq!(
                        intersection.can_advance(removed | !house_cells(source)),
                        confined && remaining.len() >= 2
                    );
                }
            }
        }
    }

    #[test]
    fn branch_removal_domains_follow_facts_through_inner_and_outer_rollbacks() {
        let board = crate::parse_givens(
            "100007090030020008009600500005300900010080002600004000300000010041000007007000300",
        )
        .unwrap();
        let masks = crate::candidates(&board).unwrap();
        let positions = super::super::candidate_positions(&masks);
        let graph = ForcingGraph::new(&masks, &positions);
        for (clause_index, clause) in graph.clauses.iter().enumerate() {
            let expected = clause.members.iter().fold(0, |domain, &id| {
                let position = if clause_index < CELLS { id % 9 } else { id / 9 };
                domain | (1u128 << position)
            });
            assert_eq!(clause.domain, expected);
        }
        for mode in [Mode::Chain, Mode::Net, Mode::Dynamic, Mode::Advanced] {
            let mut branch = BranchSearch::new(&graph, mode);
            let check = |branch: &BranchSearch<'_>| {
                let mut expected_digits = [0; 9];
                let mut expected_cells = [0; CELLS];
                for fact in &branch.facts {
                    if fact.state & 1 == 0 {
                        let candidate = candidate(fact.state / 2);
                        let digit = usize::from(candidate.digit - 1);
                        expected_digits[digit] |= 1 << candidate.cell;
                        expected_cells[candidate.cell] |= 1 << digit;
                    }
                }
                assert_eq!(branch.removed, expected_digits);
                assert_eq!(branch.removed_from_cell, expected_cells);
                for &id in &graph.available {
                    assert_eq!(
                        branch.removed[id % 9] & (1 << (id / 9)) != 0,
                        branch.seen[id * 2] != UNSEEN
                    );
                    assert_eq!(
                        branch.removed_from_cell[id / 9] & (1 << (id % 9)) != 0,
                        branch.seen[id * 2] != UNSEEN
                    );
                }
            };
            for &id in &graph.available {
                let conflict = branch.run(id * 2 + 1);
                check(&branch);
                if conflict.is_some() {
                    branch.rollback(0);
                    check(&branch);
                    continue;
                }
                let checkpoint = branch.facts.len();
                for &inner in &graph.available {
                    if branch.seen[inner * 2] != UNSEEN || branch.seen[inner * 2 + 1] != UNSEEN {
                        continue;
                    }
                    for state in [inner * 2 + 1, inner * 2] {
                        branch.extend(state);
                        check(&branch);
                        branch.rollback(checkpoint);
                        check(&branch);
                    }
                }
                branch.rollback(0);
                check(&branch);
            }
        }
    }

    #[test]
    fn guardian_clause_eligibility_matches_every_assignment_across_word_boundaries() {
        for id in 0..CELLS * 9 {
            for state in 0u64..4 {
                let mut reached = [0; WORDS];
                reached[id * 2 / 64] = state << (id * 2 % 64);
                assert_eq!(
                    guardian_clause_can_advance(&guardian_words(&[id]), &reached),
                    state & 2 == 0
                );
            }
        }
        // Cover bit 63, adjacent words, a later word and the last candidate.
        let candidates = [0, 31, 32, 63, 64, 728];
        for assignment in 0usize..4usize.pow(6) {
            // 0: unknown, 1: false, 2: true, 3: both. Settled branches normally
            // exclude 3, but its true literal must still satisfy the clause.
            let states = std::array::from_fn::<_, 6, _>(|i| (assignment >> (i * 2)) & 3);
            let mut reached = [0; WORDS];
            for (&id, &state) in candidates.iter().zip(&states) {
                let literal = id * 2;
                reached[literal / 64] |= (state as u64) << (literal % 64);
            }
            // Unrelated true and false literals cannot affect this clause.
            reached[200 * 2 / 64] |= 3 << (200 * 2 % 64);
            for subset in 1..1 << candidates.len() {
                let indices: Vec<_> = candidates
                    .iter()
                    .enumerate()
                    .filter_map(|(i, &id)| (subset & (1 << i) != 0).then_some(id))
                    .collect();
                let selected: Vec<_> = states
                    .iter()
                    .enumerate()
                    .filter_map(|(i, &state)| (subset & (1 << i) != 0).then_some(state))
                    .collect();
                let satisfied = selected.iter().any(|state| state & 2 != 0);
                let remaining = selected.iter().filter(|&&state| state & 1 == 0).count();
                assert_eq!(
                    guardian_clause_can_advance(&guardian_words(&indices), &reached),
                    !satisfied && remaining <= 1,
                    "assignment {assignment}, subset {subset}"
                );
            }
        }
    }

    #[test]
    fn guardian_refutation_index_matches_settled_branch_removals() {
        let board = crate::parse_givens(
            "100007090030020008009600500005300900010080002600004000300000010041000007007000300",
        )
        .unwrap();
        let masks = crate::candidates(&board).unwrap();
        let positions = super::super::candidate_positions(&masks);
        let graph = ForcingGraph::new(&masks, &positions);
        let refutations = GuardianSearch::new(&graph).refutation_candidates();
        let mut branch = BranchSearch::new(&graph, Mode::Dynamic);
        let mut maximum = 0;
        for &id in &graph.available {
            for assumption in [id * 2 + 1, id * 2] {
                let settles = branch.run(assumption).is_none();
                let conclusion = assumption ^ 1;
                let mut count = 0;
                for (guardian, indexed) in refutations.removals.iter().enumerate() {
                    let removed = settles && branch.seen[guardian * 2] != UNSEEN;
                    count += usize::from(removed);
                    assert_eq!(
                        indexed[conclusion / 64] & (1 << (conclusion % 64)) != 0,
                        removed
                    );
                }
                if settles {
                    maximum = maximum.max(count + 1);
                }
            }
        }
        assert_eq!(refutations.maximum_guardians, maximum);
    }

    #[test]
    fn shared_guardian_conclusions_require_a_surviving_case_and_keep_branch_order() {
        let first = Candidate { cell: 2, digit: 1 };
        let second = Candidate { cell: 2, digit: 3 };
        let mut masks = [crate::DIGITS; CELLS];
        // The two 1/2 cells need different digits. Another 1 in their row
        // would force both to 2. The alternative 3 leaves them compatible.
        masks[0] = 0b11;
        masks[1] = 0b11;
        masks[2] = 0b101;
        let positions = super::super::candidate_positions(&masks);
        let graph = ForcingGraph::new(&masks, &positions);
        for guardians in [[first, second], [second, first]] {
            let mut search = GuardianSearch::new(&graph);
            let mut proofs = Vec::new();
            let _ = search.visit(
                || guardians.into_iter(),
                &mut |action| action == HintAction::Place(second),
                &mut |action, branches| {
                    proofs.push((action, branches));
                    ControlFlow::Continue(())
                },
            );
            assert_eq!(proofs.len(), 1);
            let (action, branches) = &proofs[0];
            assert_eq!(*action, HintAction::Place(second));
            assert_eq!(branches.len(), 2);
            for (guardian, branch) in guardians.into_iter().zip(branches) {
                assert_eq!(
                    branch.assumption,
                    ForcingLiteral {
                        candidate: guardian,
                        truth: true
                    }
                );
                assert_eq!(branch.conflict.is_some(), guardian == first);
            }
        }
        let impossible = [first, Candidate { cell: 3, digit: 1 }];
        let mut search = GuardianSearch::new(&graph);
        let _ = search.visit(|| impossible.into_iter(), &mut |_| true, &mut |_, _| {
            panic!("contradictory cases cannot create a vacuous shared conclusion")
        });

        let masks = [crate::DIGITS; CELLS];
        let positions = super::super::candidate_positions(&masks);
        let graph = ForcingGraph::new(&masks, &positions);
        let alternatives = [
            Candidate { cell: 40, digit: 1 },
            Candidate { cell: 80, digit: 2 },
        ];
        let mut search = GuardianSearch::new(&graph);
        let _ = search.visit(|| alternatives.into_iter(), &mut |_| true, &mut |_, _| {
            panic!("independent alternatives share no forced effect")
        });
    }

    #[test]
    fn a_true_guardian_satisfies_the_clause_without_removing_other_guardians() {
        let mut masks = [0; CELLS];
        masks[0] = 0b11;
        masks[40] = 0b1100;
        let mut positions = [0; 9];
        positions[..4].copy_from_slice(&[1, 1, 1 << 40, 1 << 40]);
        let graph = ForcingGraph::new(&masks, &positions);
        let mut branch = BranchSearch::new(&graph, Mode::Dynamic);
        let first = index(Candidate { cell: 0, digit: 1 });
        let second = index(Candidate { cell: 40, digit: 3 });
        branch.guardians.extend([first, second]);

        assert!(branch.run(first * 2 + 1).is_none());
        assert_eq!(branch.seen[second * 2], UNSEEN);
        assert_eq!(branch.seen[second * 2 + 1], UNSEEN);

        assert!(branch.run(first * 2).is_none());
        let forced = branch.facts[branch.seen[second * 2 + 1]];
        assert!(matches!(forced.cause, Cause::LastGuardian));
    }
}
