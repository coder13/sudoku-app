use super::{
    Candidate, ControlFlow, Deduction, HintEvidence, PEERS, Technique, bit_indices, cell_bit,
    coloring,
    links::{CandidateLinks, candidate, weak_source},
    report_eliminations,
};
use crate::hints::{CandidateLink, LinkStrength};

struct Group {
    colors: [Vec<Candidate>; 2],
    excluded: [[u128; 9]; 2],
    links: Vec<CandidateLink>,
}

pub(super) fn visit(
    graph: &CandidateLinks<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let mut groups = Vec::new();
    coloring::visit_components(graph, false, |component| {
        let group = Group::new(graph, &component);
        // A color that already contradicts itself belongs to Simple Coloring.
        if group.is_consistent() {
            groups.push(group);
        }
        ControlFlow::Continue(())
    })?;

    // 3D Medusa components use bivalue cells as additional strong links.
    // Keep this search separate from single-digit coloring, then compare its
    // groups with both single-digit groups and other 3D groups.
    coloring::visit_components(graph, true, |component| {
        let mut digits = 0u16;
        for &node in component.members {
            digits |= 1 << candidate(node).digit;
        }
        if digits.count_ones() < 2 {
            return ControlFlow::Continue(());
        }
        let group = Group::new(graph, &component);
        if group.is_consistent() {
            groups.push(group);
        }
        ControlFlow::Continue(())
    })?;

    for (index, first) in groups.iter().enumerate() {
        for second in &groups[index + 1..] {
            if first.overlaps(second) {
                continue;
            }
            first.compare(second, graph, visit)?;
        }
    }
    ControlFlow::Continue(())
}

impl Group {
    fn new(graph: &CandidateLinks<'_>, component: &coloring::Component<'_>) -> Self {
        let mut colors: [Vec<Candidate>; 2] = std::array::from_fn(|_| Vec::new());
        let mut excluded = [[0; 9]; 2];
        for &node in component.members {
            let value = candidate(node);
            let color = usize::from(component.colors[node]);
            colors[color].push(value);
            excluded[color][usize::from(value.digit - 1)] |= PEERS[value.cell];
            let own_digit = 1 << (value.digit - 1);
            for digit in bit_indices(graph.masks[value.cell] & !own_digit) {
                excluded[color][digit] |= cell_bit(value.cell);
            }
        }
        for color in &mut colors {
            color.sort_unstable();
        }
        Self {
            colors,
            excluded,
            links: component.links.to_vec(),
        }
    }

    fn is_consistent(&self) -> bool {
        self.colors.iter().all(|color| {
            color.iter().enumerate().all(|(index, &first)| {
                color[index + 1..]
                    .iter()
                    .all(|&second| weak_source(first, second).is_none())
            })
        })
    }

    fn overlaps(&self, other: &Self) -> bool {
        self.colors.iter().flatten().any(|candidate| {
            other
                .colors
                .iter()
                .flatten()
                .any(|other| candidate == other)
        })
    }

    fn compare(
        &self,
        other: &Self,
        graph: &CandidateLinks<'_>,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let conflicts = std::array::from_fn(|a| {
            std::array::from_fn(|b| {
                self.colors[a].iter().find_map(|&from| {
                    other.colors[b].iter().find_map(|&to| {
                        weak_source(from, to).map(|source| CandidateLink {
                            from,
                            to,
                            strength: LinkStrength::Weak,
                            source,
                        })
                    })
                })
            })
        });

        // If one color conflicts with both alternatives in the other group,
        // every candidate of that color is false.
        self.visit_wraps(other, conflicts, visit)?;
        let reverse = std::array::from_fn(|b| {
            std::array::from_fn(|a| {
                conflicts[a][b].map(|link| CandidateLink {
                    from: link.to,
                    to: link.from,
                    strength: link.strength,
                    source: link.source,
                })
            })
        });
        other.visit_wraps(self, reverse, visit)?;

        let mut colored = [0u128; 9];
        for candidate in self.colors.iter().chain(&other.colors).flatten() {
            colored[usize::from(candidate.digit - 1)] |= cell_bit(candidate.cell);
        }

        for (a, row) in conflicts.iter().enumerate() {
            for (b, bridge) in row.iter().enumerate() {
                let Some(bridge) = bridge else { continue };
                let targets = std::array::from_fn(|digit| {
                    graph.positions[digit]
                        & self.excluded[1 - a][digit]
                        & other.excluded[1 - b][digit]
                        & !colored[digit]
                });
                report_eliminations(visit, Technique::MultiColoring, targets, || {
                    self.evidence(other, *bridge, None)
                })?;
            }
        }
        ControlFlow::Continue(())
    }

    fn visit_wraps(
        &self,
        other: &Self,
        conflicts: [[Option<CandidateLink>; 2]; 2],
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        for (color, [first, second]) in conflicts.into_iter().enumerate() {
            let (Some(first), Some(second)) = (first, second) else {
                continue;
            };
            let mut targets = [0u128; 9];
            for candidate in &self.colors[color] {
                targets[usize::from(candidate.digit - 1)] |= cell_bit(candidate.cell);
            }
            report_eliminations(visit, Technique::MultiColoring, targets, || {
                self.evidence(other, first, Some(second))
            })?;
        }
        ControlFlow::Continue(())
    }

    fn evidence(
        &self,
        other: &Self,
        bridge: CandidateLink,
        other_bridge: Option<CandidateLink>,
    ) -> HintEvidence {
        HintEvidence::MultiColoring {
            groups: [self, other].map(|group| group.colors.clone()),
            links: self.links.iter().chain(&other.links).copied().collect(),
            bridge,
            other_bridge,
        }
    }
}
