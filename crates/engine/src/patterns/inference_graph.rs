use super::{
    Candidate, House, PEERS, PatternSearch, bit_indices, cell_bit, cells, house_cells, links,
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
}

#[derive(Clone)]
pub(super) struct InferenceGraph {
    pub nodes: Vec<Node>,
    pub singles: usize,
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

    pub(super) fn with_fireworks(&self) -> Self {
        let mut extension = Extension::new(self);
        extension.add_fireworks();
        extension.finish(false)
    }

    pub(super) fn for_tridagons(search: &PatternSearch<'_>) -> Option<Self> {
        let mut extension = None;
        let positions = search.positions_by_digit();
        super::tridagon::visit_links(search, |endpoints, source| {
            if let Some(nodes) = useful_endpoints(endpoints, positions) {
                extension
                    .get_or_insert_with(|| Extension::new(search.inference_graph()))
                    .add_strong(nodes, source);
            }
        });
        let mut extension = extension?;
        extension.add_fireworks();
        extension.add_almost_locked_sets(search.als());
        let graph = extension.finish(true);
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
            from: self.nodes[from].evidence(),
            to: self.nodes[edge.to].evidence(),
            source: edge.source,
            strength,
        }
    }

    pub fn excluded_by_either(&self, a: usize, b: usize) -> impl Iterator<Item = Candidate> + '_ {
        let (a, b) = (self.nodes[a], self.nodes[b]);
        let endpoint_digits = digit_bit(a.digit) | digit_bit(b.digit);
        let possible_digits = if a.members == b.members && a.members.is_power_of_two() {
            DIGITS & !endpoint_digits
        } else {
            endpoint_digits
        };
        bit_indices(possible_digits).flat_map(move |index| {
            let digit = index as u8 + 1;
            cells(self.positions[index] & a.exclusions(digit) & b.exclusions(digit))
                .map(move |cell| Candidate { cell, digit })
        })
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

struct Extension {
    graph: InferenceGraph,
    first_new_group: usize,
    indices: BTreeMap<(u8, u128), usize>,
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
        }
    }

    fn add_strong(&mut self, nodes: [Node; 2], source: LinkSource) {
        let [left, right] = nodes.map(|node| {
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
        });
        self.graph.connect_strong(left, right, source);
    }

    fn add_fireworks(&mut self) {
        let positions = self.graph.positions;
        super::fireworks::visit_links(&positions, |pivot, digit, [left, right]| {
            if let Some(nodes) = useful_endpoints([(digit, left), (digit, right)], &positions) {
                self.add_strong(nodes, LinkSource::Firework(pivot));
            }
        });
    }

    fn add_almost_locked_sets(&mut self, als: &super::als::AlsSearch) {
        let positions = self.graph.positions;
        for set in &als.sets {
            if set.cells.is_power_of_two() {
                continue;
            }
            let source =
                LinkSource::AlmostLockedSet(AlmostLockedSetLink::new(cells(set.cells), set.digits));
            let endpoint = |digit| (digit as u8 + 1, positions[digit] & set.cells);
            let mut remaining = set.digits;
            for first in bit_indices(set.digits) {
                remaining &= !(1 << first);
                for second in bit_indices(remaining) {
                    if let Some(nodes) =
                        useful_endpoints([endpoint(first), endpoint(second)], &positions)
                    {
                        self.add_strong(nodes, source);
                    }
                }
            }
        }
    }

    fn finish(mut self, complete_house_links: bool) -> InferenceGraph {
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
                if complete_house_links
                    && let Some(house) = houses.into_iter().find(|&house| {
                        shared(house) && self.graph.positions[digit] & house_cells(house) == union
                    })
                {
                    self.graph.connect_strong(a, b, LinkSource::House(house));
                }
            }
        }
        self.graph.sort_edges();
        self.graph
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
            let mut positions = [0; 9];
            positions[0] = live;
            let graph = InferenceGraph::new(&masks, positions).with_fireworks();
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
