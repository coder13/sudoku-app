use super::{
    Candidate, House, PEERS, PatternSearch, bit_indices, cell_bit, cells, house_cells, links,
    tridagon::GuardianGroup,
};
use crate::{
    AlmostLockedSetLink, CELLS, DIGITS, InferenceLink, InferenceNode, LinkSource, LinkStrength,
    hints::digit_bit,
};
use std::collections::BTreeMap;

#[derive(Clone, Copy)]
pub(super) struct Node {
    pub digit: u8,
    pub members: u128,
    pub(super) peers: u128,
}

impl Node {
    pub(super) fn new(digit: u8, members: u128) -> Self {
        let peers = cells(members).fold(u128::MAX, |peers, cell| peers & PEERS[cell]);
        Self {
            digit,
            members,
            peers,
        }
    }

    pub fn single(self) -> Option<Candidate> {
        self.members.is_power_of_two().then(|| Candidate {
            digit: self.digit,
            cell: self.members.trailing_zeros() as usize,
        })
    }

    pub(super) fn evidence(self) -> InferenceNode {
        if let Some(candidate) = self.single() {
            InferenceNode::Candidate(candidate)
        } else {
            InferenceNode::Group {
                digit: self.digit,
                cells: cells(self.members).collect(),
            }
        }
    }

    fn exclusions(self, digit: u8) -> u128 {
        if digit == self.digit {
            self.peers
        } else if self.members.is_power_of_two() {
            self.members
        } else {
            0
        }
    }
}

#[derive(Clone)]
struct MixedNode {
    members: Vec<Candidate>,
    exclusions: [u128; 9],
}

impl MixedNode {
    fn new(members: Vec<Candidate>, positions: [u128; 9]) -> Self {
        let mut exclusions = positions;
        for candidate in &members {
            for (index, cells) in exclusions.iter_mut().enumerate() {
                *cells &= if index + 1 == usize::from(candidate.digit) {
                    PEERS[candidate.cell]
                } else {
                    cell_bit(candidate.cell)
                };
            }
        }
        Self {
            members,
            exclusions,
        }
    }
}

#[derive(Clone, Copy)]
pub(super) struct Edge {
    pub to: usize,
    source: LinkSource,
}

impl Edge {
    pub(super) fn is_firework(self) -> bool {
        matches!(self.source, LinkSource::Firework(_))
    }

    pub(super) fn is_tridagon(self) -> bool {
        matches!(self.source, LinkSource::Tridagon { .. })
    }

    pub(super) fn is_als_cell(self) -> bool {
        matches!(self.source, LinkSource::AlmostLockedSetCell { .. })
    }

    pub(super) fn is_als(self) -> bool {
        matches!(
            self.source,
            LinkSource::AlmostLockedSet(_) | LinkSource::AlmostLockedSetCell { .. }
        )
    }
}

#[derive(Clone)]
pub(super) struct InferenceGraph {
    pub nodes: Vec<Node>,
    pub singles: usize,
    mixed: Vec<MixedNode>,
    strong: Vec<Vec<Edge>>,
    weak: Vec<Vec<Edge>>,
    positions: [u128; 9],
}

impl InferenceGraph {
    pub fn new(masks: &[u16; CELLS], positions: [u128; 9]) -> Self {
        let mut nodes = Vec::new();
        let mut indices = [usize::MAX; links::CANDIDATE_COUNT];
        for (cell, &mask) in masks.iter().enumerate() {
            for digit in bit_indices(mask) {
                indices[cell * 9 + digit] = nodes.len();
                nodes.push(Node::new(digit as u8 + 1, cell_bit(cell)));
            }
        }
        let singles = nodes.len();
        let groups: [std::ops::Range<usize>; 9] = std::array::from_fn(|digit| {
            let start = nodes.len();
            for group in 0..9 {
                let in_box = positions[digit] & house_cells(House::Box(group));
                for offset in 0..3 {
                    for line in [
                        House::Row(group / 3 * 3 + offset),
                        House::Column(group % 3 * 3 + offset),
                    ] {
                        let intersection = in_box & house_cells(line);
                        if intersection.count_ones() >= 2 {
                            nodes.push(Node::new(digit as u8 + 1, intersection));
                        }
                    }
                }
            }
            start..nodes.len()
        });

        let mut graph = Self {
            strong: vec![Vec::new(); nodes.len()],
            weak: vec![Vec::new(); nodes.len()],
            nodes,
            singles,
            mixed: Vec::new(),
            positions,
        };
        let mut constraint = Vec::with_capacity(18);
        for (cell, &mask) in masks.iter().enumerate() {
            constraint.clear();
            constraint.extend(bit_indices(mask).map(|digit| indices[cell * 9 + digit]));
            let bivalue = constraint.len() == 2;
            for (i, &a) in constraint.iter().enumerate() {
                for &b in &constraint[i + 1..] {
                    graph.connect(a, b, LinkSource::Cell(cell), bivalue);
                }
            }
        }
        for house in House::all() {
            let house_mask = house_cells(house);
            for (digit, &positions) in positions.iter().enumerate() {
                let present = positions & house_mask;
                if present.count_ones() < 2 {
                    continue;
                }
                constraint.clear();
                constraint.extend(cells(present).map(|cell| indices[cell * 9 + digit]));
                constraint.extend(
                    groups[digit]
                        .clone()
                        .filter(|&id| graph.nodes[id].members & !present == 0),
                );
                for (i, &a) in constraint.iter().enumerate() {
                    for &b in &constraint[i + 1..] {
                        let left = graph.nodes[a].members;
                        let right = graph.nodes[b].members;
                        if left & right == 0 {
                            graph.connect(a, b, LinkSource::House(house), left | right == present);
                        }
                    }
                }
            }
        }
        graph.sort_edges();
        graph
    }

    pub(super) fn for_almost_locked_sets(search: &PatternSearch<'_>) -> Option<Self> {
        let mut extension = None;
        visit_als_links(
            search.als(),
            search.positions_by_digit(),
            |nodes, source| {
                extension
                    .get_or_insert_with(|| Extension::new(search.inference_graph()))
                    .add_strong(nodes, source);
            },
        );
        extension.map(Extension::finish)
    }

    pub(super) fn with_als_cell_links(
        search: &PatternSearch<'_>,
        base: Option<&Self>,
    ) -> Option<Self> {
        let mut extension = None;
        visit_als_cell_links(search, |nodes, source| {
            extension
                .get_or_insert_with(|| {
                    Extension::new(base.unwrap_or_else(|| search.inference_graph()))
                })
                .add_strong(nodes, source);
        });
        let mut extension = extension?;
        // An ordinary link with the same endpoints is covered by the first scan.
        // Keep the outside-cell premise in this graph for its extra lock effects.
        for edges in &mut extension.graph.strong {
            edges.sort_by_key(|edge| !edge.is_als_cell());
        }
        Some(extension.finish())
    }

    pub(super) fn for_fireworks(search: &PatternSearch<'_>) -> Option<Self> {
        let mut extension = None;
        visit_firework_links(search.positions_by_digit(), |nodes, source| {
            extension
                .get_or_insert_with(|| Extension::new(search.inference_graph()))
                .add_strong(nodes, source);
        });
        let mut extension = extension?;
        extension.add_almost_locked_sets(search.als());
        Some(extension.finish())
    }

    pub(super) fn for_tridagons(search: &PatternSearch<'_>) -> Option<Self> {
        let mut extension = None;
        let positions = search.positions_by_digit();
        super::tridagon::visit_links(search, |endpoints, source| match endpoints {
            [
                GuardianGroup::SingleDigit(a, left),
                GuardianGroup::SingleDigit(b, right),
            ] => {
                if let Some(nodes) = useful_endpoints([(a, left), (b, right)], positions) {
                    extension
                        .get_or_insert_with(|| Extension::new(search.inference_graph()))
                        .add_strong(nodes, source);
                }
            }
            endpoints => extension
                .get_or_insert_with(|| Extension::new(search.inference_graph()))
                .add_mixed_strong(endpoints, source),
        });
        let mut extension = extension?;
        visit_firework_links(positions, |nodes, source| {
            extension.add_strong(nodes, source)
        });
        extension.add_almost_locked_sets(search.als());
        let graph = extension.finish();
        graph.has_strong_link(Edge::is_tridagon).then_some(graph)
    }

    fn sort_edges(&mut self) {
        for edges in self.strong.iter_mut().chain(&mut self.weak) {
            edges.sort_by_key(|edge| edge.to);
            edges.dedup_by_key(|edge| edge.to);
        }
    }

    fn connect_strong(&mut self, a: usize, b: usize, source: LinkSource) {
        self.strong[a].push(Edge { to: b, source });
        self.strong[b].push(Edge { to: a, source });
    }

    fn connect(&mut self, a: usize, b: usize, source: LinkSource, strong: bool) {
        self.weak[a].push(Edge { to: b, source });
        self.weak[b].push(Edge { to: a, source });
        if strong {
            self.connect_strong(a, b, source);
        }
    }

    pub fn neighbors(&self, node: usize, strength: LinkStrength) -> &[Edge] {
        match strength {
            LinkStrength::Strong => &self.strong[node],
            LinkStrength::Weak => &self.weak[node],
        }
    }

    pub(super) fn has_strong_link(&self, matches: impl Fn(Edge) -> bool) -> bool {
        self.strong.iter().flatten().copied().any(matches)
    }

    pub fn edge(&self, from: usize, to: usize, strength: LinkStrength) -> Option<Edge> {
        let edges = self.neighbors(from, strength);
        edges
            .binary_search_by_key(&to, |edge| edge.to)
            .ok()
            .map(|i| edges[i])
    }

    pub fn link(&self, from: usize, edge: Edge, strength: LinkStrength) -> InferenceLink {
        InferenceLink {
            from: self.evidence(from),
            to: self.evidence(edge.to),
            source: edge.source,
            strength,
        }
    }

    pub fn node_count(&self) -> usize {
        self.strong.len()
    }

    fn evidence(&self, id: usize) -> InferenceNode {
        self.nodes.get(id).map_or_else(
            || InferenceNode::MixedGroup(self.mixed[id - self.nodes.len()].members.clone()),
            |node| node.evidence(),
        )
    }

    fn exclusions(&self, id: usize, digit_index: usize) -> u128 {
        if let Some(node) = self.nodes.get(id) {
            node.exclusions(digit_index as u8 + 1)
        } else {
            self.mixed[id - self.nodes.len()].exclusions[digit_index]
        }
    }

    pub fn excluded_by_either(&self, a: usize, b: usize) -> impl Iterator<Item = Candidate> + '_ {
        let possible_digits = self
            .nodes
            .get(a)
            .zip(self.nodes.get(b))
            .map_or(DIGITS, |(a, b)| {
                let endpoint_digits = digit_bit(a.digit) | digit_bit(b.digit);
                if a.members == b.members && a.members.is_power_of_two() {
                    DIGITS & !endpoint_digits
                } else {
                    endpoint_digits
                }
            });
        bit_indices(possible_digits).flat_map(move |index| {
            let digit = index as u8 + 1;
            cells(self.positions[index] & self.exclusions(a, index) & self.exclusions(b, index))
                .map(move |cell| Candidate { cell, digit })
        })
    }

    pub fn locked_als_targets(&self, a: usize, edge: Edge) -> impl Iterator<Item = Candidate> + '_ {
        self.als_lock(a, edge)
            .into_iter()
            .flat_map(move |(set, unlocked)| {
                let inside = set.cells().fold(0, |mask, cell| mask | cell_bit(cell));
                set.digits()
                    .filter(move |&digit| unlocked & digit_bit(digit) == 0)
                    .flat_map(move |digit| {
                        let live = self.positions[usize::from(digit - 1)];
                        let peers = cells(live & inside)
                            .fold(live & !inside, |mask, cell| mask & PEERS[cell]);
                        cells(peers).map(move |cell| Candidate { cell, digit })
                    })
            })
    }

    fn als_lock(&self, a: usize, edge: Edge) -> Option<(AlmostLockedSetLink, u16)> {
        match edge.source {
            // In a closed alternating loop, exactly one of the two endpoints holds.
            LinkSource::AlmostLockedSet(set) => Some((
                set,
                digit_bit(self.nodes[a].digit) | digit_bit(self.nodes[edge.to].digit),
            )),
            LinkSource::AlmostLockedSetCell { set, cell, blocked } => {
                // If the outside endpoint is false, its actual digit blocks one
                // of the ALS digits. Otherwise the set's own endpoint is false.
                let inside = if self.nodes[a].members == cell_bit(usize::from(cell)) {
                    edge.to
                } else {
                    a
                };
                Some((set, digit_bit(self.nodes[inside].digit) | blocked))
            }
            _ => None,
        }
    }

    fn mixed_conflict(&self, left: &MixedNode, right: usize) -> Option<(LinkSource, bool)> {
        let cell = left.members[0].cell;
        let other_digits = if let Some(node) = self.nodes.get(right) {
            if node.members & !left.exclusions[usize::from(node.digit - 1)] != 0 {
                return None;
            }
            node.single()
                .filter(|candidate| candidate.cell == cell)
                .map(|candidate| digit_bit(candidate.digit))
        } else {
            let other = &self.mixed[right - self.nodes.len()].members;
            if other
                .iter()
                .any(|c| left.exclusions[usize::from(c.digit - 1)] & cell_bit(c.cell) == 0)
            {
                return None;
            }
            other
                .iter()
                .all(|c| c.cell == cell)
                .then(|| other.iter().fold(0, |bits, c| bits | digit_bit(c.digit)))
        };
        if let Some(digits) = other_digits.filter(|_| left.members.iter().all(|c| c.cell == cell)) {
            let covered = left
                .members
                .iter()
                .fold(digits, |bits, c| bits | digit_bit(c.digit));
            let live = self
                .positions
                .iter()
                .enumerate()
                .fold(0, |bits, (index, &positions)| {
                    bits | (u16::from(positions & cell_bit(cell) != 0) << index)
                });
            Some((LinkSource::Cell(cell), covered == live))
        } else {
            Some((LinkSource::Peers {}, false))
        }
    }
}

// A grouped endpoint without an active common peer has no way into or out
// of a chain through a weak link, and cannot rule out a target by itself.
fn useful_endpoints(endpoints: [(u8, u128); 2], positions: &[u128; 9]) -> Option<[Node; 2]> {
    let nodes = endpoints.map(|(digit, members)| Node::new(digit, members));
    nodes
        .iter()
        .all(|node| {
            node.single().is_some() || node.peers & positions[usize::from(node.digit - 1)] != 0
        })
        .then_some(nodes)
}

fn visit_firework_links(positions: &[u128; 9], mut visit: impl FnMut([Node; 2], LinkSource)) {
    super::fireworks::visit_links(positions, |pivot, digit, [left, right]| {
        if let Some(nodes) = useful_endpoints([(digit, left), (digit, right)], positions) {
            visit(nodes, LinkSource::Firework(pivot));
        }
    });
}

fn visit_als_links(
    als: &super::als::AlsSearch,
    positions: &[u128; 9],
    mut visit: impl FnMut([Node; 2], LinkSource),
) {
    for set in &als.sets {
        if set.cells.is_power_of_two() {
            continue;
        }
        let evidence = AlmostLockedSetLink::new(cells(set.cells), set.digits);
        let source = LinkSource::AlmostLockedSet(evidence);
        let endpoint = |digit| (digit as u8 + 1, positions[digit] & set.cells);
        let mut remaining = set.digits;
        for first in bit_indices(set.digits) {
            remaining &= !(1 << first);
            for second in bit_indices(remaining) {
                if let Some(nodes) =
                    useful_endpoints([endpoint(first), endpoint(second)], positions)
                {
                    visit(nodes, source);
                }
            }
        }
    }
}

fn visit_als_cell_links(search: &PatternSearch<'_>, mut visit: impl FnMut([Node; 2], LinkSource)) {
    let outside = search
        .masks
        .iter()
        .enumerate()
        .fold(0, |mask, (cell, candidates)| {
            if candidates.count_ones() >= 3 {
                mask | cell_bit(cell)
            } else {
                mask
            }
        });
    for set in &search.als().sets {
        let eligible = outside & !set.cells;
        if eligible != 0 && !set.cells.is_power_of_two() {
            let evidence = AlmostLockedSetLink::new(cells(set.cells), set.digits);
            visit_als_cells_for_set(search, set, evidence, eligible, &mut visit);
        }
    }
}

fn visit_als_cells_for_set(
    search: &PatternSearch<'_>,
    set: &super::als::Als,
    evidence: AlmostLockedSetLink,
    outside: u128,
    visit: &mut impl FnMut([Node; 2], LinkSource),
) {
    let positions = search.positions_by_digit();
    let mut seen = 0;
    let mut overlaps = 0;
    let mut blocked = [0u16; CELLS];
    for digit in bit_indices(set.digits) {
        let peers = outside & set.common_peers(digit) & positions[digit];
        overlaps |= seen & peers;
        seen |= peers;
        for cell in cells(peers) {
            blocked[cell] |= 1 << digit;
        }
    }
    for cell in cells(overlaps) {
        let live = search.masks[cell];
        let uncovered = live & !blocked[cell];
        if uncovered.count_ones() > 1 {
            continue;
        }
        for digit in bit_indices(set.digits) {
            let remaining = uncovered | (live & (1 << digit));
            if !remaining.is_power_of_two() {
                continue;
            }
            let forced = remaining.trailing_zeros() as u8 + 1;
            if let Some(nodes) = useful_endpoints(
                [
                    (digit as u8 + 1, positions[digit] & set.cells),
                    (forced, cell_bit(cell)),
                ],
                positions,
            ) {
                visit(
                    nodes,
                    LinkSource::AlmostLockedSetCell {
                        set: evidence,
                        cell: cell as u8,
                        blocked: live ^ remaining,
                    },
                );
            }
        }
    }
}

struct Extension {
    graph: InferenceGraph,
    first_new_group: usize,
    indices: BTreeMap<(u8, u128), usize>,
    mixed_indices: BTreeMap<Vec<Candidate>, usize>,
    mixed_links: Vec<([GroupId; 2], LinkSource)>,
}

#[derive(Clone, Copy)]
enum GroupId {
    SingleDigit(usize),
    Mixed(usize),
}

impl Extension {
    fn new(base: &InferenceGraph) -> Self {
        Self {
            graph: base.clone(),
            first_new_group: base.nodes.len(),
            indices: base
                .nodes
                .iter()
                .enumerate()
                .map(|(id, node)| ((node.digit, node.members), id))
                .collect(),
            mixed_indices: BTreeMap::new(),
            mixed_links: Vec::new(),
        }
    }

    fn add_strong(&mut self, nodes: [Node; 2], source: LinkSource) {
        let [left, right] = nodes.map(|node| self.intern(node));
        self.graph.connect_strong(left, right, source);
    }

    fn intern(&mut self, node: Node) -> usize {
        *self
            .indices
            .entry((node.digit, node.members))
            .or_insert_with(|| {
                let id = self.graph.nodes.len();
                self.graph.nodes.push(node);
                self.graph.strong.push(Vec::new());
                self.graph.weak.push(Vec::new());
                id
            })
    }

    fn add_mixed_strong(&mut self, groups: [GuardianGroup; 2], source: LinkSource) {
        let ids = groups.map(|group| match group {
            GuardianGroup::SingleDigit(digit, members) => {
                GroupId::SingleDigit(self.intern(Node::new(digit, members)))
            }
            GuardianGroup::Mixed(members) => GroupId::Mixed(
                *self
                    .mixed_indices
                    .entry(members)
                    .or_insert_with_key(|members| {
                        let id = self.graph.mixed.len();
                        self.graph
                            .mixed
                            .push(MixedNode::new(members.clone(), self.graph.positions));
                        id
                    }),
            ),
        });
        self.mixed_links.push((ids, source));
    }

    fn add_almost_locked_sets(&mut self, als: &super::als::AlsSearch) {
        let positions = self.graph.positions;
        visit_als_links(als, &positions, |nodes, source| {
            self.add_strong(nodes, source)
        });
    }

    fn finish(mut self) -> InferenceGraph {
        let mut by_digit: [Vec<usize>; 9] = std::array::from_fn(|_| Vec::new());
        for (id, node) in self.graph.nodes.iter().enumerate() {
            by_digit[usize::from(node.digit - 1)].push(id);
        }
        for a in self.first_new_group..self.graph.nodes.len() {
            let node = self.graph.nodes[a];
            let digit = usize::from(node.digit - 1);
            for &b in by_digit[digit].iter().take_while(|&&b| b < a) {
                let members = self.graph.nodes[b].members;
                if members & !node.peers != 0 {
                    continue;
                }
                let union = node.members | members;
                let houses = House::at(node.members.trailing_zeros() as usize);
                let shared = |house: House| union & !house_cells(house) == 0;
                let source = houses
                    .into_iter()
                    .find(|&house| shared(house))
                    .map_or(LinkSource::Peers {}, LinkSource::House);
                self.graph.connect(a, b, source, false);
                if let Some(house) = houses.into_iter().find(|&house| {
                    shared(house) && self.graph.positions[digit] & house_cells(house) == union
                }) {
                    self.graph.connect_strong(a, b, LinkSource::House(house));
                }
            }
        }
        let first_mixed = self.graph.nodes.len();
        for offset in 0..self.graph.mixed.len() {
            let id = first_mixed + offset;
            self.graph.strong.push(Vec::new());
            self.graph.weak.push(Vec::new());
            for prior in 0..id {
                if let Some((source, strong)) =
                    self.graph.mixed_conflict(&self.graph.mixed[offset], prior)
                {
                    self.graph.connect(id, prior, source, strong);
                }
            }
        }
        for (pair, source) in self.mixed_links {
            let [a, b] = pair.map(|id| match id {
                GroupId::SingleDigit(id) => id,
                GroupId::Mixed(offset) => first_mixed + offset,
            });
            self.graph.connect_strong(a, b, source);
        }
        self.graph.sort_edges();
        self.graph
    }
}

#[cfg(test)]
mod tests {
    use super::super::{inference::Rule, tridagon};
    use super::*;
    use crate::{HintAction, HintEvidence, Technique, candidates};
    use std::ops::ControlFlow;

    #[test]
    fn als_cell_link_requires_every_other_digit_to_be_blocked() {
        let find = |second_cell, extra| {
            let mut masks = [0; CELLS];
            masks[0] = digit_bit(1) | digit_bit(2);
            masks[second_cell] = digit_bit(2) | digit_bit(3);
            masks[9] = digit_bit(1) | digit_bit(2) | digit_bit(5) | extra;
            let search = PatternSearch::new(&[0; CELLS], &masks);
            let mut found = false;
            visit_als_cell_links(&search, |[inside, outside], source| {
                found |= matches!(source, LinkSource::AlmostLockedSetCell { set, cell: 9, blocked }
                    if set.cells().eq([0, second_cell]) && blocked == digit_bit(1) | digit_bit(2))
                    && inside.digit == 3
                    && outside.digit == 5;
            });
            found
        };
        assert!(find(1, 0));
        assert!(!find(1, digit_bit(6)));
        assert!(
            !find(3, 0),
            "an occurrence of 2 is outside the forced cell's peers"
        );
    }

    #[test]
    fn firework_chains_use_almost_locked_sets_without_tridagons() {
        let ring = Technique::FireworkAic.practice_examples()[1];
        let wing = Technique::FireworkWWing.practice_examples()[1];
        let cases = [
            (ring, Candidate { cell: 24, digit: 8 }, 5),
            (wing, Candidate { cell: 56, digit: 5 }, 3),
        ];
        for (example, target, link_count) in cases {
            let position = example.position().unwrap();
            let values = position.values().unwrap();
            let mut masks = candidates(&values).unwrap();
            for (mask, removed) in masks.iter_mut().zip(position.eliminations) {
                *mask &= !removed;
            }
            let search = PatternSearch::new(&values, &masks);
            assert!(!tridagon::has_pattern(&search));
            let rule = Rule::for_technique(Technique::FireworkAic).unwrap();
            let action = HintAction::Eliminate(target);

            let mut firework_only = Extension::new(search.inference_graph());
            visit_firework_links(search.positions_by_digit(), |nodes, source| {
                firework_only.add_strong(nodes, source);
            });
            let _ = rule.visit(&firework_only.finish(), &mut |step| {
                assert!(!step.actions().contains(&action));
                ControlFlow::Continue(())
            });

            let graph = InferenceGraph::for_fireworks(&search).unwrap();
            let proof = rule
                .visit(&graph, &mut |step| {
                    if step.actions().contains(&action)
                        && let HintEvidence::Inference { links } = &step.evidence
                        && links.len() == link_count
                        && links
                            .iter()
                            .any(|link| matches!(link.source, LinkSource::Firework(_)))
                        && links
                            .iter()
                            .any(|link| matches!(link.source, LinkSource::AlmostLockedSet(_)))
                    {
                        return ControlFlow::Break(step);
                    }
                    ControlFlow::Continue(())
                })
                .break_value();
            assert!(proof.is_some(), "expected a mixed proof for {target:?}");
        }
    }

    #[test]
    fn firework_search_skips_graph_and_als_when_there_is_no_firework_link() {
        let mut masks = [0; CELLS];
        masks[0] = 3;
        let search = PatternSearch::new(&[0; CELLS], &masks);
        assert!(InferenceGraph::for_fireworks(&search).is_none());
        assert!(search.inference.get().is_none());
        assert!(search.als.get().is_none());
    }

    #[test]
    fn firework_groups_cover_both_lines_and_only_conflicting_groups_are_weak() {
        // At r2c2, the inside candidates (r2c1 and r1c2) share box 1.
        // The outside candidates r2c5 and r7c2 can both be true.
        let pivot = cell_bit(10);
        let across = cell_bit(13);
        let down = cell_bit(55);
        let extra = cell_bit(15);
        for outside in [across, across | extra] {
            let live = pivot | outside | down | cell_bit(9) | cell_bit(1) | cell_bit(58);
            let masks = std::array::from_fn(|cell| u16::from(live & cell_bit(cell) != 0));
            let search = PatternSearch::new(&[0; CELLS], &masks);
            let graph = InferenceGraph::for_fireworks(&search).unwrap();
            let id = |members| graph.nodes.iter().position(|node| node.members == members);
            let center = id(pivot).unwrap();
            let wings = id(outside | down).unwrap();
            assert_eq!(
                graph
                    .edge(center, wings, LinkStrength::Strong)
                    .unwrap()
                    .source,
                LinkSource::Firework(10)
            );
            assert_eq!(
                graph
                    .edge(center, wings, LinkStrength::Weak)
                    .unwrap()
                    .source,
                LinkSource::Peers {}
            );
            if outside == across {
                let left = id(across).unwrap();
                let right = id(pivot | down).unwrap();
                assert_eq!(
                    graph
                        .edge(left, right, LinkStrength::Strong)
                        .unwrap()
                        .source,
                    LinkSource::Firework(10)
                );
                assert!(graph.edge(left, right, LinkStrength::Weak).is_none());
            } else {
                assert!(id(across | down).is_none());
            }
        }
    }

    #[test]
    fn two_disjoint_nodes_are_strong_only_when_they_cover_the_house() {
        for extra in [0, cell_bit(8)] {
            let positions = cell_bit(0) | cell_bit(1) | cell_bit(4) | extra;
            let masks = std::array::from_fn(|cell| u16::from(positions & cell_bit(cell) != 0));
            let mut by_digit = [0; 9];
            by_digit[0] = positions;
            let graph = InferenceGraph::new(&masks, by_digit);
            let group = graph
                .nodes
                .iter()
                .position(|node| node.members == cell_bit(0) | cell_bit(1))
                .unwrap();
            let outside = graph
                .nodes
                .iter()
                .position(|node| node.members == cell_bit(4))
                .unwrap();
            assert!(graph.edge(group, outside, LinkStrength::Weak).is_some());
            assert_eq!(
                graph.edge(group, outside, LinkStrength::Strong).is_some(),
                extra == 0
            );
            assert_eq!(
                graph.edge(outside, group, LinkStrength::Strong).is_some(),
                extra == 0
            );
            assert!(graph.edge(group, 0, LinkStrength::Weak).is_none());
        }
    }

    #[test]
    fn a_cell_with_three_candidates_only_provides_weak_links() {
        for mask in [0b011, 0b111] {
            let mut masks = [0; CELLS];
            masks[0] = mask;
            let mut positions = [0; 9];
            for digit in bit_indices(mask) {
                positions[digit] = cell_bit(0);
            }
            let graph = InferenceGraph::new(&masks, positions);
            assert!(graph.edge(0, 1, LinkStrength::Weak).is_some());
            assert_eq!(
                graph.edge(0, 1, LinkStrength::Strong).is_some(),
                mask == 0b011
            );
        }
    }
}
