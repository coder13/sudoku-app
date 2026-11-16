use std::collections::HashMap;

use super::super::als::AlsSearch;
use super::super::{
    CELLS, House, bit_indices, cell_bit, house_cells,
    inference_graph::{InferenceGraph, Node},
};
use crate::{KrakenLink, KrakenLinkReason};

const UNSEEN: usize = usize::MAX;

#[derive(Clone, Copy)]
enum Reason {
    Exclusion,
    Cell(usize),
    House(House),
    Als(usize),
}

#[derive(Clone, Copy)]
struct Edge {
    node: usize,
    reason: Reason,
}

pub(super) struct Chains {
    nodes: Vec<Node>,
    singles: usize,
    // Entries are indexed by node * 2 + the truth value of its proposition.
    edges: Vec<Vec<Edge>>,
}

impl Chains {
    pub(super) fn new(
        ordinary: &InferenceGraph,
        als: &AlsSearch,
        positions: &[u128; 9],
        masks: &[u16; CELLS],
    ) -> Self {
        let mut nodes = ordinary.nodes.clone();
        let mut index: HashMap<_, _> = nodes
            .iter()
            .enumerate()
            .map(|(i, node)| ((node.digit, node.members), i))
            .collect();
        let mut als_pairs = Vec::new();
        for (set_index, set) in als.sets.iter().enumerate() {
            if set.cells.is_power_of_two() {
                continue;
            }
            let mut members = [0; 9];
            let mut count = 0;
            for digit in bit_indices(set.digits) {
                let digit_value = digit as u8 + 1;
                let occurrences = positions[digit] & set.cells;
                members[count] = *index.entry((digit_value, occurrences)).or_insert_with(|| {
                    nodes.push(Node::new(digit_value, occurrences));
                    nodes.len() - 1
                });
                count += 1;
            }
            for (i, &a) in members[..count].iter().enumerate() {
                for &b in &members[i + 1..count] {
                    als_pairs.push((a, b, set_index));
                }
            }
        }

        let mut graph = Self {
            singles: ordinary.singles,
            edges: vec![Vec::new(); nodes.len() * 2],
            nodes,
        };

        // Candidates within one cell share a weak link, and exhaust it when
        // the cell is bivalue. Same-digit links are handled below.
        for (cell, &mask) in masks.iter().enumerate() {
            let mut digits = mask;
            while digits != 0 {
                let a = digits.trailing_zeros() as u8 + 1;
                digits &= digits - 1;
                for b in bit_indices(digits) {
                    let members = cell_bit(cell);
                    let a = index[&(a, members)];
                    let b = index[&(b as u8 + 1, members)];
                    graph.connect(a, b, Reason::Exclusion);
                    if mask.count_ones() == 2 {
                        graph.connect(a, b, Reason::Cell(cell));
                    }
                }
            }
        }

        for (digit_index, &positions) in positions.iter().enumerate() {
            let digit = digit_index as u8 + 1;
            let digit_nodes: Vec<_> = graph
                .nodes
                .iter()
                .enumerate()
                .filter_map(|(i, node)| (node.digit == digit).then_some(i))
                .collect();
            for (i, &a) in digit_nodes.iter().enumerate() {
                let left = graph.nodes[a];
                for &b in &digit_nodes[i + 1..] {
                    if graph.nodes[b].members & !left.peers == 0 {
                        graph.connect(a, b, Reason::Exclusion);
                    }
                }
            }
            for house in House::all() {
                let locations = positions & house_cells(house);
                if locations.count_ones() < 2 {
                    continue;
                }
                for &a in &digit_nodes {
                    let members = graph.nodes[a].members;
                    if members & !locations != 0 {
                        continue;
                    }
                    if let Some(&b) = index.get(&(digit, locations & !members))
                        && a < b
                    {
                        graph.connect(a, b, Reason::House(house));
                    }
                }
            }
        }

        // An n-cell ALS has n+1 digits, so two of its digit groups cannot both be false.
        for (a, b, set) in als_pairs {
            graph.connect(a, b, Reason::Als(set));
        }
        for edges in &mut graph.edges {
            // Keep the first reason for each link. Ordinary constraints precede ALS links.
            edges.sort_by_key(|edge| edge.node);
            edges.dedup_by_key(|edge| edge.node);
        }
        graph
    }

    fn connect(&mut self, a: usize, b: usize, reason: Reason) {
        let from_truth = usize::from(matches!(reason, Reason::Exclusion));
        self.edges[a * 2 + from_truth].push(Edge { node: b, reason });
        self.edges[b * 2 + from_truth].push(Edge { node: a, reason });
    }

    pub(super) fn start_nodes(&self) -> impl Iterator<Item = (usize, Node)> + '_ {
        self.nodes[..self.singles].iter().copied().enumerate()
    }
}

pub(super) struct Paths<'a> {
    graph: &'a Chains,
    queue: Vec<usize>,
    parents: Vec<Edge>,
    candidates: [[usize; CELLS]; 9],
}

impl<'a> Paths<'a> {
    pub(super) fn new(graph: &'a Chains) -> Self {
        let mut candidates = [[UNSEEN; CELLS]; 9];
        for (index, node) in graph.start_nodes() {
            let cell = node.members.trailing_zeros() as usize;
            candidates[usize::from(node.digit - 1)][cell] = index;
        }
        Self {
            graph,
            queue: Vec::new(),
            parents: vec![
                Edge {
                    node: UNSEEN,
                    reason: Reason::Exclusion
                };
                graph.edges.len()
            ],
            candidates,
        }
    }

    pub(super) fn walk(&mut self, target: usize) -> [u128; 9] {
        for state in self.queue.drain(..) {
            self.parents[state].node = UNSEEN;
        }
        let start = target * 2 + 1;
        self.parents[start].node = start;
        self.queue.push(start);
        let mut removed = [0; 9];
        let mut next = 0;
        while let Some(&state) = self.queue.get(next) {
            next += 1;
            let truth = state & 1;
            for &edge in &self.graph.edges[state] {
                let reached = edge.node * 2 + (truth ^ 1);
                // A contradiction of the original assumption already proves
                // the result by a chain on its own. Do not use it as a branch.
                if self.parents[reached].node != UNSEEN || reached == start ^ 1 {
                    continue;
                }
                self.parents[reached] = Edge {
                    node: state,
                    reason: edge.reason,
                };
                self.queue.push(reached);
                if truth == 1 && edge.node < self.graph.singles {
                    let node = self.graph.nodes[edge.node];
                    removed[usize::from(node.digit - 1)] |= node.members;
                }
            }
        }
        removed
    }

    pub(super) fn proof(&self, digit: usize, cell: usize, als: &AlsSearch) -> Vec<KrakenLink> {
        let mut links = Vec::new();
        let mut state = self.candidates[digit][cell] * 2;
        let start = self.queue[0];
        // Reverse each implication by contraposition. The search ran from
        // target true to alternative false. The proof reads in reverse order.
        while state != start {
            let entry = self.parents[state];
            links.push(KrakenLink {
                from: self.graph.nodes[state / 2].evidence(),
                to: self.graph.nodes[entry.node / 2].evidence(),
                reason: match entry.reason {
                    Reason::Exclusion => KrakenLinkReason::Exclusion,
                    Reason::Cell(cell) => KrakenLinkReason::Cell(cell),
                    Reason::House(house) => KrakenLinkReason::House(house),
                    Reason::Als(index) => {
                        KrakenLinkReason::AlmostLockedSet(als.sets[index].evidence())
                    }
                },
            });
            state = entry.node;
        }
        links
    }
}
