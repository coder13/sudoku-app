use super::{
    ControlFlow, Deduction, DeductionActions, HintAction, HintEvidence, Technique,
    inference_graph::{Edge, InferenceGraph},
};
use crate::{Candidate, LinkStrength};

#[derive(Clone, Copy, Eq, PartialEq)]
enum Shape {
    Open,
    Discontinuous,
    Continuous,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum Scope {
    Plain,
    Grouped,
    Firework,
    Tridagon,
}

#[derive(Clone, Copy)]
pub(super) struct Rule {
    technique: Technique,
    shape: Shape,
    scope: Scope,
}

impl Rule {
    pub fn for_technique(technique: Technique) -> Option<Self> {
        let (shape, scope) = match technique {
            Technique::Aic => (Shape::Open, Scope::Plain),
            Technique::DiscontinuousNiceLoop => (Shape::Discontinuous, Scope::Plain),
            Technique::ContinuousNiceLoop => (Shape::Continuous, Scope::Plain),
            Technique::GroupedAic => (Shape::Open, Scope::Grouped),
            Technique::GroupedDiscontinuousNiceLoop => (Shape::Discontinuous, Scope::Grouped),
            Technique::GroupedContinuousNiceLoop => (Shape::Continuous, Scope::Grouped),
            Technique::FireworkAic => (Shape::Open, Scope::Firework),
            Technique::TridagonAic => (Shape::Open, Scope::Tridagon),
            _ => return None,
        };
        Some(Self {
            technique,
            shape,
            scope,
        })
    }

    pub fn visit(
        self,
        graph: &InferenceGraph,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        if self.scope == Scope::Firework && !graph.has_strong_link(Edge::is_firework) {
            return ControlFlow::Continue(());
        }
        let mut paths = Paths::new(graph, self);
        let start_count = if self.scope != Scope::Plain && self.shape != Shape::Discontinuous {
            graph.nodes.len()
        } else {
            graph.singles
        };
        for node in 0..start_count {
            let qualifies = self.scope == Scope::Plain
                || (self.scope == Scope::Grouped && node >= graph.singles);
            paths.walk(State::new(node, false, qualifies), visit)?;
            if self.shape == Shape::Discontinuous {
                paths.walk(State::new(node, true, qualifies), visit)?;
            }
        }
        ControlFlow::Continue(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct State(usize);

impl State {
    fn new(node: usize, truth: bool, qualifies: bool) -> Self {
        Self(node * 4 + usize::from(truth) * 2 + usize::from(qualifies))
    }

    fn node(self) -> usize {
        self.0 / 4
    }

    fn truth(self) -> bool {
        self.0 & 2 != 0
    }

    fn qualifies(self) -> bool {
        self.0 & 1 != 0
    }

    fn next_strength(self) -> LinkStrength {
        if self.truth() {
            LinkStrength::Weak
        } else {
            LinkStrength::Strong
        }
    }
}

#[derive(Clone, Copy)]
struct PathEdge {
    from: State,
    edge: Edge,
}

impl PathEdge {
    fn strength(self) -> LinkStrength {
        self.from.next_strength()
    }
}

struct Paths<'a> {
    graph: &'a InferenceGraph,
    rule: Rule,
    parents: Vec<Option<PathEdge>>,
    queue: Vec<State>,
    before_guardian: Option<Vec<bool>>,
}

impl<'a> Paths<'a> {
    fn new(graph: &'a InferenceGraph, rule: Rule) -> Self {
        Self {
            graph,
            rule,
            parents: vec![None; graph.nodes.len() * 4],
            queue: Vec::new(),
            before_guardian: (rule.scope == Scope::Tridagon).then(|| before_guardian(graph)),
        }
    }

    fn walk(
        &mut self,
        start: State,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        if !self.can_qualify(start) || (!start.truth() && !self.has_strong_neighbor(start.node())) {
            return ControlFlow::Continue(());
        }
        for state in self.queue.drain(..) {
            self.parents[state.0] = None;
        }
        self.queue.push(start);
        let mut next = 0;
        while next < self.queue.len() {
            let current = self.queue[next];
            next += 1;
            if current.qualifies() {
                self.deduction(start, current, visit)?;
            }
            let neighbors = self
                .graph
                .neighbors(current.node(), current.next_strength());
            for &edge in neighbors {
                let next_is_group = edge.to >= self.graph.singles;
                if next_is_group && self.rule.scope == Scope::Plain {
                    continue;
                }
                let qualifies = current.qualifies()
                    || match self.rule.scope {
                        Scope::Plain => false,
                        Scope::Grouped => next_is_group,
                        Scope::Firework => edge.is_firework(),
                        Scope::Tridagon => edge.is_tridagon(),
                    };
                let target = State::new(edge.to, !current.truth(), qualifies);
                if target != start
                    && self.parents[target.0].is_none()
                    && self.can_qualify(target)
                    && (target.truth()
                        || (self.rule.shape == Shape::Discontinuous
                            && target.node() == start.node())
                        || self.has_strong_neighbor(target.node()))
                    && !(qualifies
                        && matches!(self.rule.scope, Scope::Firework | Scope::Tridagon)
                        && self.repeats_literal(start, current, target))
                {
                    self.parents[target.0] = Some(PathEdge {
                        from: current,
                        edge,
                    });
                    self.queue.push(target);
                }
            }
        }
        ControlFlow::Continue(())
    }

    fn can_qualify(&self, state: State) -> bool {
        state.qualifies()
            || self
                .before_guardian
                .as_ref()
                .is_none_or(|reaches| reaches[state.0 / 2])
    }

    fn repeats_literal(&self, start: State, mut current: State, target: State) -> bool {
        let unqualified = State::new(target.node(), target.truth(), false);
        if unqualified == start {
            return true;
        }
        // A path that returns to the same literal can discard the detour.
        // Keep the slot available for a chain that needs the special link.
        if self.parents[unqualified.0].is_some() {
            while let Some(parent) = self.parents[current.0] {
                if current == unqualified {
                    return true;
                }
                current = parent.from;
            }
        }
        false
    }

    fn has_strong_neighbor(&self, node: usize) -> bool {
        self.graph
            .neighbors(node, LinkStrength::Strong)
            .first()
            .is_some_and(|edge| self.rule.scope != Scope::Plain || edge.to < self.graph.singles)
    }

    fn deduction(
        &self,
        start: State,
        end: State,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        if self.rule.shape == Shape::Discontinuous {
            if end.node() != start.node() || end.truth() == start.truth() {
                return ControlFlow::Continue(());
            }
            let candidate = self.graph.nodes[start.node()]
                .single()
                .expect("loop starts on a candidate");
            let actions = if start.truth() {
                DeductionActions::Eliminations(vec![HintAction::Eliminate(candidate)])
            } else {
                DeductionActions::Placement(HintAction::Place(candidate))
            };
            return self.report(self.path(end), actions, visit);
        }

        if !end.truth() || end.node() == start.node() {
            return ControlFlow::Continue(());
        }
        // A single strong link by itself does not form a chain.
        if self.parents[end.0].is_none_or(|parent| parent.from == start) {
            return ControlFlow::Continue(());
        }
        if self.rule.shape == Shape::Continuous {
            let Some(closing) = self
                .graph
                .edge(end.node(), start.node(), LinkStrength::Weak)
            else {
                return ControlFlow::Continue(());
            };
            let mut path = self.path(end);
            path.push(PathEdge {
                from: end,
                edge: closing,
            });
            // In a continuous loop, at least one endpoint of every weak link is true.
            let mut targets = Vec::new();
            for edge in path
                .iter()
                .filter(|edge| edge.strength() == LinkStrength::Weak)
            {
                targets.extend(
                    self.graph
                        .excluded_by_either(edge.from.node(), edge.edge.to),
                );
            }
            return self.eliminate(path, targets, visit);
        }

        if start.node() > end.node() {
            return ControlFlow::Continue(());
        }
        let (left, right) = (self.graph.nodes[start.node()], self.graph.nodes[end.node()]);
        // Type 2 uses two different digits in cells that see each other.
        if left.digit != right.digit {
            let Some((a, b)) = left.single().zip(right.single()) else {
                return ControlFlow::Continue(());
            };
            if !see_each_other(a, b) {
                return ControlFlow::Continue(());
            }
        }
        let targets: Vec<_> = self
            .graph
            .excluded_by_either(start.node(), end.node())
            .collect();
        if targets.is_empty() {
            return ControlFlow::Continue(());
        }
        self.eliminate(self.path(end), targets, visit)
    }

    fn path(&self, mut end: State) -> Vec<PathEdge> {
        let mut edges = Vec::new();
        while let Some(parent) = self.parents[end.0] {
            edges.push(parent);
            end = parent.from;
        }
        edges.reverse();
        edges
    }

    fn eliminate(
        &self,
        path: Vec<PathEdge>,
        mut targets: Vec<Candidate>,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        if targets.is_empty() {
            return ControlFlow::Continue(());
        }
        targets.sort_unstable();
        targets.dedup();
        let actions = DeductionActions::Eliminations(
            targets.into_iter().map(HintAction::Eliminate).collect(),
        );
        self.report(path, actions, visit)
    }

    fn report(
        &self,
        path: Vec<PathEdge>,
        actions: DeductionActions,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let links = path
            .into_iter()
            .map(|step| {
                self.graph
                    .link(step.from.node(), step.edge, step.strength())
            })
            .collect();
        visit(Deduction {
            technique: self.rule.technique,
            evidence: HintEvidence::Inference { links },
            actions,
        })
    }
}

fn before_guardian(graph: &InferenceGraph) -> Vec<bool> {
    let mut reaches = vec![false; graph.nodes.len() * 2];
    let mut queue = Vec::new();
    for node in 0..graph.nodes.len() {
        if graph
            .neighbors(node, LinkStrength::Strong)
            .iter()
            .any(|edge| edge.is_tridagon())
        {
            reaches[node * 2] = true;
            queue.push(node * 2);
        }
    }
    let mut next = 0;
    while let Some(&state) = queue.get(next) {
        next += 1;
        let node = state / 2;
        let truth = state & 1;
        // Reverse the implications to find starts that can reach a guardian.
        let strength = if truth == 1 {
            LinkStrength::Strong
        } else {
            LinkStrength::Weak
        };
        for edge in graph.neighbors(node, strength) {
            let prior = edge.to * 2 + (truth ^ 1);
            if !reaches[prior] {
                reaches[prior] = true;
                queue.push(prior);
            }
        }
    }
    reaches
}

fn see_each_other(left: Candidate, right: Candidate) -> bool {
    super::PEERS[left.cell] & super::cell_bit(right.cell) != 0
}
