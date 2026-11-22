use super::{
    Candidate, ControlFlow, Deduction, HintEvidence, PEERS, Technique, cell_bit, cells, coloring,
    links::{CandidateLinks, candidate, weak_source},
    report,
};
use crate::hints::{CandidateLink, LinkStrength};

struct Group {
    colors: [u128; 2],
    peers: [u128; 2],
    links: Vec<CandidateLink>,
}

pub(super) fn visit(
    graph: &CandidateLinks<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let mut groups: [Vec<Group>; 9] = std::array::from_fn(|_| Vec::new());
    coloring::visit_components(graph, false, |component| {
        let mut colors = [0; 2];
        let mut peers = [0; 2];
        for &node in component.members {
            let cell = candidate(node).cell;
            let color = usize::from(component.colors[node]);
            colors[color] |= cell_bit(cell);
            peers[color] |= PEERS[cell];
        }
        // A color that already contradicts itself belongs to Simple Coloring.
        if (0..2).all(|color| colors[color] & peers[color] == 0) {
            groups[component.members[0] % 9].push(Group {
                colors,
                peers,
                links: component.links.to_vec(),
            });
        }
        ControlFlow::Continue(())
    })?;

    for (digit, groups) in groups.iter().enumerate() {
        let positions = graph.positions[digit];
        let digit = digit as u8 + 1;
        for (index, first) in groups.iter().enumerate() {
            for second in &groups[index + 1..] {
                first.compare(second, digit, positions, visit)?;
            }
        }
    }
    ControlFlow::Continue(())
}

impl Group {
    fn compare(
        &self,
        other: &Self,
        digit: u8,
        positions: u128,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let ignored = self.colors[0] | self.colors[1] | other.colors[0] | other.colors[1];
        let conflicts = [0, 1].map(|a| [0, 1].map(|b| self.peers[a] & other.colors[b]));

        // If one color conflicts with both alternatives in the other group,
        // every candidate of that color is false.
        self.visit_wraps(other, digit, conflicts, visit)?;
        let reverse = [0, 1].map(|b| [0, 1].map(|a| other.peers[b] & self.colors[a]));
        other.visit_wraps(self, digit, reverse, visit)?;

        for (a, row) in conflicts.iter().enumerate() {
            for (b, &conflict) in row.iter().enumerate() {
                if conflict == 0 {
                    continue;
                }
                // The linked colors cannot both be true. At least one of
                // their opposite colors must therefore be true.
                let targets = positions & self.peers[1 - a] & other.peers[1 - b] & !ignored;
                report(visit, Technique::MultiColoring, targets, digit, || {
                    self.evidence(other, digit, self.bridge(a, conflict, digit), None)
                })?;
            }
        }
        ControlFlow::Continue(())
    }

    fn visit_wraps(
        &self,
        other: &Self,
        digit: u8,
        conflicts: [[u128; 2]; 2],
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        for (color, [first, second]) in conflicts.into_iter().enumerate() {
            if first == 0 || second == 0 {
                continue;
            }
            report(
                visit,
                Technique::MultiColoring,
                self.colors[color],
                digit,
                || {
                    self.evidence(
                        other,
                        digit,
                        self.bridge(color, first, digit),
                        Some(self.bridge(color, second, digit)),
                    )
                },
            )?;
        }
        ControlFlow::Continue(())
    }

    fn bridge(&self, color: usize, targets: u128, digit: u8) -> CandidateLink {
        let to = Candidate {
            cell: targets.trailing_zeros() as usize,
            digit,
        };
        let from = Candidate {
            cell: (self.colors[color] & PEERS[to.cell]).trailing_zeros() as usize,
            digit,
        };
        CandidateLink {
            from,
            to,
            strength: LinkStrength::Weak,
            source: weak_source(from, to).expect("bridge joins peers"),
        }
    }

    fn evidence(
        &self,
        other: &Self,
        digit: u8,
        bridge: CandidateLink,
        other_bridge: Option<CandidateLink>,
    ) -> HintEvidence {
        HintEvidence::MultiColoring {
            groups: [self, other].map(|group| {
                group
                    .colors
                    .map(|color| cells(color).map(|cell| Candidate { cell, digit }).collect())
            }),
            links: self.links.iter().chain(&other.links).copied().collect(),
            bridge,
            other_bridge,
        }
    }
}
