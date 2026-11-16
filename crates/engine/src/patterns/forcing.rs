use super::{
    bit_indices, cells, coordinates, house_cells,
    links::{candidate, CANDIDATE_COUNT},
    ControlFlow, Deduction, DeductionActions, HintAction, HintEvidence, House, Technique, CELLS,
};
use crate::{ForcingBranch, ForcingConflict, ForcingInference, ForcingLiteral, ForcingScope};
use std::collections::BTreeSet;

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
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let net = technique == Technique::ForcingNet;
        let mut branch = BranchSearch::new(self, net);
        let mut emitted = BTreeSet::new();
        let mut outcomes = Outcomes {
            slots: [UNSEEN; STATES],
            summaries: Vec::new(),
        };

        for &id in &self.available {
            for assumption in [id * 2 + 1, id * 2] {
                if let Some(conflict) = branch.run(assumption) {
                    if branch.depends_on_join(Terminal::Conflict(conflict)) == net {
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
        let mut joined = [0; WORDS];
        for &assumption in assumptions {
            let outcome = &outcomes.summaries[outcomes.slots[assumption]];
            for (i, word) in common.iter_mut().enumerate() {
                *word &= outcome.reached[i];
                joined[i] |= outcome.joined[i];
            }
        }
        for (word, mut bits) in common.into_iter().enumerate() {
            if branch.net {
                bits &= joined[word];
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
}

#[derive(Clone, Copy)]
struct Fact {
    state: usize,
    cause: Cause,
    joined: bool,
}

#[derive(Clone, Copy)]
enum Conflict {
    Opposite([usize; 2]),
    Exhausted(usize),
}

#[derive(Clone, Copy)]
enum Terminal {
    Effect(usize),
    Conflict(Conflict),
}

struct Summary {
    reached: [u64; WORDS],
    joined: [u64; WORDS],
}

struct Outcomes {
    slots: [usize; STATES],
    summaries: Vec<Summary>,
}

struct BranchSearch<'a> {
    graph: &'a ForcingGraph,
    net: bool,
    seen: [usize; STATES],
    facts: Vec<Fact>,
}

impl<'a> BranchSearch<'a> {
    fn new(graph: &'a ForcingGraph, net: bool) -> Self {
        Self {
            graph,
            net,
            seen: [UNSEEN; STATES],
            facts: Vec::new(),
        }
    }

    fn run(&mut self, assumption: usize) -> Option<Conflict> {
        for fact in self.facts.drain(..) {
            self.seen[fact.state] = UNSEEN;
        }
        self.add(assumption, Cause::Assumption, false);
        let mut next = 0;
        while next < self.facts.len() {
            let fact = self.facts[next];
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
                            Cause::Exclusion { clause, fact: next },
                            fact.joined,
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
                if (self.net || members.len() == 2) && possible.next().is_none() {
                    let joined = members.len() > 2 || fact.joined;
                    if let Some(conflict) =
                        self.add(last * 2 + 1, Cause::LastCandidate { clause }, joined)
                    {
                        return Some(conflict);
                    }
                }
            }
            next += 1;
        }
        None
    }

    fn add(&mut self, state: usize, cause: Cause, joined: bool) -> Option<Conflict> {
        if self.seen[state] != UNSEEN {
            return None;
        }
        let index = self.facts.len();
        self.facts.push(Fact {
            state,
            cause,
            joined,
        });
        self.seen[state] = index;
        (self.seen[state ^ 1] != UNSEEN).then(|| Conflict::Opposite([self.seen[state ^ 1], index]))
    }

    fn summary(&self) -> Summary {
        let mut summary = Summary {
            reached: [0; WORDS],
            joined: [0; WORDS],
        };
        for fact in &self.facts {
            let bit = 1 << (fact.state % 64);
            summary.reached[fact.state / 64] |= bit;
            if fact.joined {
                summary.joined[fact.state / 64] |= bit;
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
        }
    }

    fn depends_on_join(&self, terminal: Terminal) -> bool {
        self.roots(terminal)
            .iter()
            .any(|&index| self.facts[index].joined)
    }

    fn proof(&self, terminal: Terminal) -> ForcingBranch {
        let mut retained = vec![false; self.facts.len()];
        for index in self.roots(terminal) {
            retained[index] = true;
        }
        for i in (1..self.facts.len()).rev() {
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
                Cause::Assumption => unreachable!(),
            }
        }

        let mut indices = vec![0; self.facts.len()];
        let mut steps = Vec::new();
        for (i, &fact) in self.facts.iter().enumerate().skip(1) {
            if !retained[i] {
                continue;
            }
            let (clause, causes) = match fact.cause {
                Cause::Exclusion { clause, fact } => (clause, vec![indices[fact]]),
                Cause::LastCandidate { clause } => (
                    clause,
                    self.causes(clause, Some(fact.state / 2))
                        .map(|source| indices[source])
                        .collect(),
                ),
                Cause::Assumption => unreachable!(),
            };
            steps.push(ForcingInference {
                effect: literal(fact.state),
                scope: self.graph.clauses[clause].scope,
                causes,
            });
            indices[i] = steps.len();
        }
        let conflict = match terminal {
            Terminal::Effect(_) => None,
            Terminal::Conflict(Conflict::Opposite(pair)) => {
                Some(ForcingConflict::Opposite(pair.map(|i| indices[i])))
            }
            Terminal::Conflict(Conflict::Exhausted(clause)) => Some(ForcingConflict::Exhausted {
                scope: self.graph.clauses[clause].scope,
                causes: self.causes(clause, None).map(|i| indices[i]).collect(),
            }),
        };
        ForcingBranch {
            assumption: literal(self.facts[0].state),
            steps,
            conflict,
        }
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
