use super::{
    CELLS, ControlFlow, Deduction, DeductionActions, HintAction, HintEvidence, House, Technique,
    bit_indices, cells, coordinates, house_cells,
    links::{CANDIDATE_COUNT, candidate, index},
};
use crate::{
    Candidate, ForcingBranch, ForcingCase, ForcingConflict, ForcingInference, ForcingLiteral,
    ForcingScope,
};
use std::collections::BTreeSet;

mod advanced;
mod witnesses;

const STATES: usize = CANDIDATE_COUNT * 2;
const UNSEEN: usize = usize::MAX;
const WORDS: usize = STATES.div_ceil(64);

pub(super) struct ForcingGraph {
    clauses: Vec<Clause>,
    available: Vec<usize>,
}

struct Clause {
    scope: ForcingScope,
    members: Vec<usize>,
}

struct Intersection {
    scope: ForcingScope,
    shared: Vec<usize>,
    premises: Vec<usize>,
    targets: Vec<usize>,
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
            });
        }
        for house in House::all() {
            for (digit, &positions) in positions.iter().enumerate() {
                clauses.push(Clause {
                    scope: ForcingScope::House {
                        house,
                        digit: digit as u8 + 1,
                    },
                    members: cells(positions & house_cells(house))
                        .map(|cell| cell * 9 + digit)
                        .collect(),
                });
            }
        }
        Self { clauses, available }
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
            search.board, search.masks, search.verified_solution, search.completion_probe_nodes,
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

    fn intersections(&self) -> Vec<Intersection> {
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
                let targets: Vec<_> = self.clauses[CELLS + index * 9 + usize::from(digit - 1)]
                    .members
                    .iter()
                    .copied()
                    .filter(|&id| source_cells & (1 << (id / 9)) == 0)
                    .collect();
                if !targets.is_empty() {
                    intersections.push(Intersection {
                        scope: ForcingScope::Intersection {
                            source,
                            target,
                            digit,
                        },
                        shared,
                        premises,
                        targets,
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

impl<'a> GuardianSearch<'a> {
    const CONTRADICTION: usize = UNSEEN - 1;

    pub(super) fn new(graph: &'a ForcingGraph) -> Self {
        Self {
            branch: BranchSearch::new(graph, Mode::Dynamic),
            slots: [UNSEEN; STATES],
            reached: Vec::new(),
        }
    }

    pub(super) fn visit(
        &mut self,
        guardians: &[Candidate],
        useful: &mut impl FnMut(HintAction) -> bool,
        visit: &mut impl FnMut(HintAction, Vec<ForcingBranch>) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let mut common = None;
        for &guardian in guardians {
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
                let branches = guardians
                    .iter()
                    .map(|&guardian| {
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
        useful: &mut impl FnMut(HintAction) -> bool,
        visit: &mut impl FnMut(HintAction, Vec<ForcingBranch>) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let indices: Vec<_> = guardians.iter().copied().map(index).collect();
        for i in 0..self.branch.graph.available.len() {
            let id = self.branch.graph.available[i];
            for assumption in [id * 2 + 1, id * 2] {
                let Some(reached) = self.reached(assumption) else {
                    continue;
                };
                let known = |state: usize| reached[state / 64] & (1u64 << (state % 64)) != 0;
                // The clause can advance a settled branch only when every alternative
                // has been ruled out but one, or the branch rules out all of them.
                if indices.iter().any(|&id| known(id * 2 + 1))
                    || indices.iter().filter(|&&id| !known(id * 2)).take(2).count() > 1
                {
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
    pub(super) fn maximum_guardians_to_try(&mut self) -> usize {
        const FALSE_STATES: u64 = 0x5555_5555_5555_5555;
        let mut maximum = 0;
        for i in 0..self.branch.graph.available.len() {
            let id = self.branch.graph.available[i];
            for assumption in [id * 2 + 1, id * 2] {
                if let Some(reached) = self.reached(assumption) {
                    let removals = reached
                        .iter()
                        .map(|&word| (word & FALSE_STATES).count_ones())
                        .sum::<u32>();
                    maximum = maximum.max(removals as usize + 1);
                }
            }
        }
        maximum
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

struct BranchSearch<'a> {
    graph: &'a ForcingGraph,
    mode: Mode,
    intersections: Vec<Intersection>,
    advanced: Option<Box<advanced::State>>,
    guardians: Vec<usize>,
    seen: [usize; STATES],
    facts: Vec<Fact>,
}

impl<'a> BranchSearch<'a> {
    fn new(graph: &'a ForcingGraph, mode: Mode) -> Self {
        Self {
            graph,
            mode,
            intersections: if mode >= Mode::Dynamic {
                graph.intersections()
            } else {
                Vec::new()
            },
            advanced: (mode == Mode::Advanced).then(|| Box::new(advanced::State::new(graph))),
            guardians: Vec::new(),
            seen: [UNSEEN; STATES],
            facts: Vec::new(),
        }
    }

    fn run(&mut self, assumption: usize) -> Option<Conflict> {
        self.rollback(0);
        self.extend(assumption)
    }

    fn rollback(&mut self, len: usize) {
        if let Some(advanced) = &mut self.advanced {
            advanced.rollback(&self.facts, len);
        }
        for fact in self.facts.drain(len..) {
            self.seen[fact.state] = UNSEEN;
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
            for clause in clauses_for(id) {
                let members = &self.graph.clauses[clause].members;
                // Already-forced singles need no hypothetical proof.
                if members.len() < 2 {
                    continue;
                }
                if fact.state & 1 != 0 {
                    for &other in members.iter().filter(|&&other| other != id) {
                        if let Some(conflict) = self.add(
                            other * 2,
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
                let mut possible = members
                    .iter()
                    .copied()
                    .filter(|&member| self.seen[member * 2] == UNSEEN);
                let Some(last) = possible.next() else {
                    return Some(Conflict::Exhausted(clause));
                };
                if (self.mode != Mode::Chain || members.len() == 2) && possible.next().is_none() {
                    let mut mode = fact.mode;
                    if members.len() > 2 {
                        mode = mode.max(Mode::Net);
                        if self.mode >= Mode::Dynamic && mode != self.mode {
                            mode = self
                                .causes(clause, Some(last))
                                .map(|index| self.facts[index].mode)
                                .fold(mode, Mode::max);
                        }
                    }
                    if let Some(conflict) =
                        self.add(last * 2 + 1, Cause::LastCandidate { clause }, mode)
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
        for index in 0..self.intersections.len() {
            let intersection = &self.intersections[index];
            if !intersection
                .premises
                .iter()
                .all(|&id| self.seen[id * 2] != UNSEEN)
                || intersection
                    .shared
                    .iter()
                    .filter(|&&id| self.seen[id * 2] == UNSEEN)
                    .nth(1)
                    .is_none()
            {
                continue;
            }
            let mode = if self.mode == Mode::Advanced {
                self.intersection_causes(index)
                    .map(|cause| self.facts[cause].mode)
                    .fold(Mode::Dynamic, Mode::max)
            } else {
                Mode::Dynamic
            };
            for offset in 0..intersection.targets.len() {
                let target = self.intersections[index].targets[offset];
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
        self.intersections[index]
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
                    self.intersections[index].scope,
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
