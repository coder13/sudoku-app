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
    Als,
    AlsCell,
    Firework,
    Tridagon,
    UniqueRectangle,
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
            Technique::AlsAic => (Shape::Open, Scope::Als),
            Technique::AlsDiscontinuousNiceLoop => (Shape::Discontinuous, Scope::Als),
            Technique::AlsContinuousNiceLoop => (Shape::Continuous, Scope::Als),
            Technique::FireworkAic => (Shape::Open, Scope::Firework),
            Technique::TridagonAic => (Shape::Open, Scope::Tridagon),
            Technique::UniqueRectangleAic => (Shape::Open, Scope::UniqueRectangle),
            Technique::UniqueRectangleDiscontinuousNiceLoop => {
                (Shape::Discontinuous, Scope::UniqueRectangle)
            }
            Technique::UniqueRectangleContinuousNiceLoop => {
                (Shape::Continuous, Scope::UniqueRectangle)
            }
            _ => return None,
        };
        Some(Self {
            technique,
            shape,
            scope,
        })
    }

    pub(super) fn with_als_cells(self) -> Self {
        Self {
            scope: Scope::AlsCell,
            ..self
        }
    }

    pub fn visit(
        self,
        graph: &InferenceGraph,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let mut paths = Paths::new(graph, self);
        let start_count = if self.scope != Scope::Plain && self.shape != Shape::Discontinuous {
            graph.node_count()
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

    fn uses_special_link(self) -> bool {
        matches!(
            self.scope,
            Scope::Als
                | Scope::AlsCell
                | Scope::Firework
                | Scope::Tridagon
                | Scope::UniqueRectangle
        )
    }

    fn qualifies_link(self, edge: Edge) -> bool {
        match self.scope {
            Scope::Als => edge.is_als(),
            Scope::AlsCell => edge.is_als_cell(),
            Scope::Firework => edge.is_firework(),
            Scope::Tridagon => edge.is_tridagon(),
            Scope::UniqueRectangle => edge.is_unique_rectangle(),
            _ => false,
        }
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

    fn literal_index(self) -> usize {
        self.0 / 2
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

#[derive(Clone, Copy)]
struct Parent {
    from: State,
    neighbor: usize,
}

enum Bounds {
    Unrestricted,
    ReachSpecialLink(Vec<bool>),
    CloseLoop(Vec<usize>),
}

impl Bounds {
    fn permits(&self, target: State, component: usize) -> bool {
        match self {
            Self::Unrestricted => true,
            Self::ReachSpecialLink(reaches) => {
                target.qualifies() || reaches[target.literal_index()]
            }
            Self::CloseLoop(components) => components[target.literal_index()] == component,
        }
    }
}

struct Paths<'a> {
    graph: &'a InferenceGraph,
    rule: Rule,
    parents: Vec<Option<Parent>>,
    queue: Vec<State>,
    bounds: Bounds,
}

impl<'a> Paths<'a> {
    fn new(graph: &'a InferenceGraph, rule: Rule) -> Self {
        let bounds = if !rule.uses_special_link() {
            Bounds::Unrestricted
        } else if rule.shape == Shape::Continuous {
            Bounds::CloseLoop(graph.loop_components(|edge| rule.qualifies_link(edge)))
        } else {
            Bounds::ReachSpecialLink(paths_to_special_link(graph, rule))
        };
        Self {
            graph,
            rule,
            parents: vec![None; graph.node_count() * 4],
            queue: Vec::new(),
            bounds,
        }
    }

    fn walk(
        &mut self,
        start: State,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let component = match &self.bounds {
            Bounds::CloseLoop(components) => components[start.literal_index()],
            _ => 0,
        };
        if component == usize::MAX
            || !self.bounds.permits(start, component)
            || (!start.truth() && !self.has_strong_neighbor(start.node()))
        {
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
            for (neighbor, &edge) in neighbors.iter().enumerate() {
                let next_is_group = edge.to >= self.graph.singles;
                if next_is_group && self.rule.scope == Scope::Plain {
                    continue;
                }
                let qualifies = current.qualifies()
                    || match self.rule.scope {
                        Scope::Plain => false,
                        Scope::Grouped => next_is_group,
                        _ => self.rule.qualifies_link(edge),
                    };
                let target = State::new(edge.to, !current.truth(), qualifies);
                if target != start
                    && self.parents[target.0].is_none()
                    && self.bounds.permits(target, component)
                    && (target.truth()
                        || (self.rule.shape == Shape::Discontinuous
                            && target.node() == start.node())
                        || self.has_strong_neighbor(target.node()))
                    && !(qualifies
                        && self.rule.uses_special_link()
                        && self.repeats_literal(start, current, target))
                {
                    self.parents[target.0] = Some(Parent {
                        from: current,
                        neighbor,
                    });
                    self.queue.push(target);
                }
            }
        }
        ControlFlow::Continue(())
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
            for edge in &path {
                if edge.strength() == LinkStrength::Weak {
                    targets.extend(
                        self.graph
                            .excluded_by_either(edge.from.node(), edge.edge.to),
                    );
                } else if edge.edge.is_als() {
                    targets.extend(self.graph.locked_als_targets(edge.from.node(), edge.edge));
                }
            }
            return self.eliminate(path, targets, visit);
        }

        if start.node() > end.node() {
            return ControlFlow::Continue(());
        }
        // Type 2 between individual endpoints uses two cells that see each other.
        // A grouped endpoint can also conflict with a candidate in the other
        // endpoint's cell. The exclusion check below requires every group member.
        if !matches!(
            self.rule.scope,
            Scope::Als | Scope::AlsCell | Scope::UniqueRectangle
        ) && let Some((left, right)) = self
            .graph
            .nodes
            .get(start.node())
            .zip(self.graph.nodes.get(end.node()))
            && left.digit != right.digit
            && let Some((a, b)) = left.single().zip(right.single())
            && !see_each_other(a, b)
        {
            return ControlFlow::Continue(());
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
            let from = parent.from;
            let edge = self.graph.neighbors(from.node(), from.next_strength())[parent.neighbor];
            edges.push(PathEdge { from, edge });
            end = from;
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

fn paths_to_special_link(graph: &InferenceGraph, rule: Rule) -> Vec<bool> {
    let mut reaches = vec![false; graph.node_count() * 2];
    let mut queue = Vec::new();
    for node in 0..graph.node_count() {
        if graph
            .neighbors(node, LinkStrength::Strong)
            .iter()
            .any(|&edge| rule.qualifies_link(edge))
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
        // Reverse the implications to find starts that can reach the required link.
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
