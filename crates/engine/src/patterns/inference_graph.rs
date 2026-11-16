use super::{Candidate, House, PEERS, bit_indices, cell_bit, cells, house_cells, links};
use crate::{
    CELLS, DIGITS, InferenceLink, InferenceNode, LinkSource, LinkStrength, hints::digit_bit,
};

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
        for edges in graph.strong.iter_mut().chain(&mut graph.weak) {
            edges.sort_by_key(|edge| edge.to);
            edges.dedup_by_key(|edge| edge.to);
        }
        graph
    }

    fn connect(&mut self, a: usize, b: usize, source: LinkSource, strong: bool) {
        self.weak[a].push(Edge { to: b, source });
        self.weak[b].push(Edge { to: a, source });
        if strong {
            self.strong[a].push(Edge { to: b, source });
            self.strong[b].push(Edge { to: a, source });
        }
    }

    pub fn neighbors(&self, node: usize, strength: LinkStrength) -> &[Edge] {
        match strength {
            LinkStrength::Strong => &self.strong[node],
            LinkStrength::Weak => &self.weak[node],
        }
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

#[cfg(test)]
mod tests {
    use super::*;

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
