//! Bounded candidate chains joining two group lines through positive sums.

use super::*;
use VariantGroupSumLinkSource::{House, Line, Sum};

const MAX_MIDDLE_LINKS: usize = 4;
const MAX_SUMS: usize = 2;
const LITERALS: usize = CELLS * 9;

struct PathNode {
    link: VariantGroupSumLink,
    parent: Option<usize>,
    depth: usize,
    sums: usize,
}

struct Implications<'a> {
    puzzle: &'a CompiledVariant,
    domains: [u16; CELLS],
    bivalue: u128,
    line_links: Vec<Vec<VariantGroupSumLink>>,
    sum_links: Vec<Vec<VariantGroupSumLink>>,
}

impl CompiledVariant {
    pub(super) fn group_sum_implications(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        limit: usize,
    ) -> Vec<VariantDeduction> {
        if !matches!(
            technique,
            VariantTechnique::Modular | VariantTechnique::Entropic
        ) || self.positive_sums.is_empty()
            || self
                .lines
                .iter()
                .filter(|line| line.group_phases().is_some())
                .take(2)
                .count()
                < 2
        {
            return Vec::new();
        }
        let domains = std::array::from_fn(|cell| position.domain(cell));
        let mut graph = Implications {
            puzzle: self,
            domains,
            bivalue: position
                .masks
                .iter()
                .enumerate()
                .fold(0, |mask, (cell, domain)| {
                    if domain.count_ones() == 2 {
                        mask | (1u128 << cell)
                    } else {
                        mask
                    }
                }),
            line_links: vec![Vec::new(); LITERALS],
            sum_links: vec![Vec::new(); LITERALS],
        };
        graph.compile_line_links();
        if !graph
            .line_links
            .iter()
            .flatten()
            .any(|link| self.rule_is_line_family(&link.source, technique))
        {
            return Vec::new();
        }
        graph.compile_sum_links();

        let mut proofs = Vec::new();
        for (cell, &mask) in position.masks.iter().enumerate() {
            for digit in digits(mask) {
                let assumption = Candidate { cell, digit };
                let result = graph.line_links[literal(assumption)]
                    .iter()
                    .filter(|first| self.rule_is_line_family(&first.source, technique))
                    .find_map(|first| graph.chain(assumption, first));
                if let Some((links, conflict)) = result {
                    proofs.push(VariantDeduction {
                        technique,
                        actions: vec![HintAction::Eliminate(assumption)],
                        evidence: VariantEvidence::GroupSumImplication {
                            assumption,
                            links,
                            conflict,
                        },
                    });
                    if proofs.len() == limit {
                        return proofs;
                    }
                }
            }
        }
        proofs
    }

    fn rule_is_line_family(
        &self,
        source: &VariantGroupSumLinkSource,
        technique: VariantTechnique,
    ) -> bool {
        let Line { rule, .. } = source else {
            return false;
        };
        self.lines
            .iter()
            .any(|line| line.rule_index == *rule && line.technique == technique)
    }
}

impl Implications<'_> {
    fn compile_line_links(&mut self) {
        for line in &self.puzzle.lines {
            let Some((phases, groups)) = line.group_phases() else {
                continue;
            };
            let mut anchors = [None; 3];
            for (&cell, &phase) in line.cells.iter().zip(phases) {
                let domain = self.domains[cell];
                if domain != 0
                    && let Some(group) = groups.iter().position(|&mask| domain & !mask == 0)
                {
                    anchors[phase].get_or_insert((cell, domain, group));
                }
            }
            for (&from, &left) in line.cells.iter().zip(phases) {
                for (&to, &right) in line.cells.iter().zip(phases) {
                    let domain = self.domains[to];
                    if from == to || domain.count_ones() <= 1 {
                        continue;
                    }
                    let anchor = if left == right {
                        None
                    } else {
                        let Some(anchor) = anchors[3 - left - right] else {
                            continue;
                        };
                        Some(anchor)
                    };
                    for digit in digits(self.domains[from]) {
                        let group = groups
                            .iter()
                            .position(|mask| mask & digit_bit(digit) != 0)
                            .unwrap();
                        let other = match anchor {
                            Some((_, _, fixed)) if fixed == group => continue,
                            Some((_, _, fixed)) => 3 - fixed - group,
                            None => group,
                        };
                        let choices = domain & groups[other];
                        if choices.is_power_of_two() {
                            self.line_links[literal(Candidate { cell: from, digit })].push(
                                VariantGroupSumLink {
                                    candidate: Candidate {
                                        cell: to,
                                        digit: digits(choices).next().unwrap(),
                                    },
                                    domain,
                                    source: Line {
                                        rule: line.rule_index,
                                        anchor: anchor.map(|(cell, mask, _)| (cell, mask)),
                                    },
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    fn compile_sum_links(&mut self) {
        for sum in &self.puzzle.positive_sums {
            let [a, b] = sum.cells;
            for (from, to) in [(a, b), (b, a)] {
                let domain = self.domains[to];
                if domain.count_ones() <= 1 {
                    continue;
                }
                for digit in digits(self.domains[from]) {
                    let other = sum.total.saturating_sub(digit);
                    if digit != other && (1..=9).contains(&other) && domain & digit_bit(other) != 0
                    {
                        self.sum_links[literal(Candidate { cell: from, digit })].push(
                            VariantGroupSumLink {
                                candidate: Candidate {
                                    cell: to,
                                    digit: other,
                                },
                                domain,
                                source: Sum {
                                    rule: sum.rule,
                                    total: sum.total,
                                },
                            },
                        );
                    }
                }
            }
        }
    }

    fn chain(
        &self,
        assumption: Candidate,
        first: &VariantGroupSumLink,
    ) -> Option<(Vec<VariantGroupSumLink>, VariantHouseKind)> {
        let Line {
            rule: first_rule, ..
        } = first.source
        else {
            return None;
        };
        let mut visited = [[0; CELLS]; MAX_SUMS + 1];
        let mut nodes = vec![PathNode {
            link: first.clone(),
            parent: None,
            depth: 0,
            sums: 0,
        }];
        let mut index = 0;
        while let Some(node) = nodes.get(index) {
            let candidate = node.link.candidate;
            let (depth, sums) = (node.depth, node.sums);
            if sums != 0 {
                for last in &self.line_links[literal(candidate)] {
                    let Line { rule, .. } = last.source else {
                        continue;
                    };
                    if rule == first_rule
                        || last.candidate.digit != assumption.digit
                        || last.candidate.cell == assumption.cell
                        || contains_cell(&nodes, index, last.candidate.cell)
                    {
                        continue;
                    }
                    if let Some(conflict) = self
                        .puzzle
                        .shared_enforced_house(assumption.cell, &[last.candidate.cell])
                        && last.candidate.cell != assumption.cell
                    {
                        let mut links = vec![last.clone()];
                        let mut cursor = Some(index);
                        while let Some(current) = cursor {
                            links.push(nodes[current].link.clone());
                            cursor = nodes[current].parent;
                        }
                        links.reverse();
                        return Some((links, conflict));
                    }
                }
            }
            if depth < MAX_MIDDLE_LINKS {
                let mut append = |link: VariantGroupSumLink, count: usize| {
                    let Candidate { cell, digit } = link.candidate;
                    let bit = digit_bit(digit);
                    if cell == assumption.cell
                        || visited[count][cell] & bit != 0
                        || contains_cell(&nodes, index, cell)
                    {
                        return;
                    }
                    visited[count][cell] |= bit;
                    nodes.push(PathNode {
                        link,
                        parent: Some(index),
                        depth: depth + 1,
                        sums: count,
                    });
                };
                if sums < MAX_SUMS {
                    for link in &self.sum_links[literal(candidate)] {
                        append(link.clone(), sums + 1);
                    }
                }
                // Reserve a step for a sum if the chain has used none yet.
                if sums != 0 || depth + 1 < MAX_MIDDLE_LINKS {
                    for cell in cells_in(self.bivalue & self.puzzle.peers[candidate.cell]) {
                        let domain = self.domains[cell];
                        let bit = digit_bit(candidate.digit);
                        if domain & bit != 0
                            && let Some(house) =
                                self.puzzle.shared_enforced_house(candidate.cell, &[cell])
                        {
                            append(
                                VariantGroupSumLink {
                                    candidate: Candidate {
                                        cell,
                                        digit: digits(domain & !bit).next().unwrap(),
                                    },
                                    domain,
                                    source: House { house },
                                },
                                sums,
                            );
                        }
                    }
                }
            }
            index += 1;
        }
        None
    }
}

fn contains_cell(nodes: &[PathNode], index: usize, cell: usize) -> bool {
    let mut cursor = Some(index);
    while let Some(current) = cursor {
        let node = &nodes[current];
        if node.link.candidate.cell == cell {
            return true;
        }
        cursor = node.parent;
    }
    false
}

fn literal(candidate: Candidate) -> usize {
    candidate.cell * 9 + usize::from(candidate.digit - 1)
}
