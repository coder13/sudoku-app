use super::{
    Candidate, ControlFlow, Deduction, DeductionActions, HintAction, HintEvidence, House, PEERS,
    bit_indices, cell_bit, cells, house_cells,
    links::{CANDIDATE_COUNT, CandidateLinks, candidate, index, weak_source},
};
use crate::{
    Technique,
    hints::{CandidateLink, ColoringReason},
};

const UNCOLORED: u8 = 2;

pub(super) fn visit(
    graph: &CandidateLinks<'_>,
    technique: Technique,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let medusa = technique == Technique::Medusa;
    let mut colors = [UNCOLORED; CANDIDATE_COUNT];
    let mut members = Vec::new();
    let mut links = Vec::new();

    for (cell, &mask) in graph.masks.iter().enumerate() {
        for digit in bit_indices(mask) {
            let root = cell * 9 + digit;
            if colors[root] != UNCOLORED {
                continue;
            }

            members.clear();
            links.clear();
            colors[root] = 0;
            members.push(root);
            let mut next = 0;
            let mut consistent = true;
            let mut uses_cell_link = false;
            while next < members.len() {
                let node = members[next];
                next += 1;
                let from = candidate(node);
                let in_cell = if medusa { graph.cell_link(from) } else { None };
                uses_cell_link |= in_cell.is_some();
                let opposite = 1 - colors[node];
                for link in graph.house_links(from).chain(in_cell) {
                    let to = index(link.to);
                    if colors[to] == UNCOLORED {
                        colors[to] = opposite;
                        members.push(to);
                        links.push(link);
                    } else {
                        consistent &= colors[to] == opposite;
                    }
                }
            }

            if !consistent
                || members.len() < 2
                || (medusa && (!uses_cell_link || members.len() < 3))
            {
                continue;
            }
            let component = Component {
                colors: &colors,
                members: &members,
                links: &links,
            };
            component.visit(graph, technique, visit)?;
        }
    }
    ControlFlow::Continue(())
}

struct Component<'a> {
    colors: &'a [u8; CANDIDATE_COUNT],
    members: &'a [usize],
    links: &'a [CandidateLink],
}

impl Component<'_> {
    fn visit(
        &self,
        graph: &CandidateLinks<'_>,
        technique: Technique,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let medusa = technique == Technique::Medusa;
        let mut excluded = [[0; 9]; 2];
        let mut colored = [0; 9];
        for &node in self.members {
            let from = candidate(node);
            let by_digit = &mut excluded[self.colors[node] as usize];
            let digit_index = usize::from(from.digit - 1);
            colored[digit_index] |= cell_bit(from.cell);
            by_digit[digit_index] |= PEERS[from.cell];
            if medusa {
                let own_digit = 1 << (from.digit - 1);
                for digit in bit_indices(graph.masks[from.cell] & !own_digit) {
                    by_digit[digit] |= cell_bit(from.cell);
                }
            }
        }

        let contradictions = [0, 1].map(|color| {
            self.conflict(color, &excluded[color as usize]).or_else(|| {
                if medusa {
                    emptied_constraint(graph, &excluded[color as usize])
                } else {
                    None
                }
            })
        });
        let (reason, mut actions) = match contradictions {
            [Some(_), Some(_)] => return ControlFlow::Continue(()),
            [Some(reason), None] => (reason, self.remove_color(0)),
            [None, Some(reason)] => (reason, self.remove_color(1)),
            [None, None] => {
                let mut actions = Vec::new();
                for (digit, &positions) in graph.positions.iter().enumerate() {
                    let targets =
                        positions & excluded[0][digit] & excluded[1][digit] & !colored[digit];
                    actions.extend(cells(targets).map(|cell| {
                        HintAction::Eliminate(Candidate {
                            cell,
                            digit: digit as u8 + 1,
                        })
                    }));
                }
                (ColoringReason::BothColors, actions)
            }
        };
        if actions.is_empty() {
            return ControlFlow::Continue(());
        }

        actions.sort_unstable();
        let colors = [0, 1].map(|color| {
            let mut candidates: Vec<_> = self
                .members
                .iter()
                .copied()
                .filter(|&node| self.colors[node] == color)
                .map(candidate)
                .collect();
            candidates.sort_unstable();
            candidates
        });
        visit(Deduction {
            technique,
            evidence: HintEvidence::Coloring {
                colors,
                links: self.links.to_vec(),
                reason,
            },
            actions: DeductionActions::Eliminations(actions),
        })
    }

    fn conflict(&self, color: u8, excluded: &[u128; 9]) -> Option<ColoringReason> {
        let &node = self.members.iter().find(|&&node| {
            let value = candidate(node);
            self.colors[node] == color
                && excluded[usize::from(value.digit - 1)] & cell_bit(value.cell) != 0
        })?;
        let first = candidate(node);
        let second = self
            .members
            .iter()
            .copied()
            .filter(|&other| self.colors[other] == color)
            .map(candidate)
            .find(|&second| weak_source(first, second).is_some())?;
        Some(ColoringReason::SameColorConflict([first, second]))
    }

    fn remove_color(&self, color: u8) -> Vec<HintAction> {
        self.members
            .iter()
            .copied()
            .filter(|&node| self.colors[node] == color)
            .map(|node| HintAction::Eliminate(candidate(node)))
            .collect()
    }
}

fn emptied_constraint(graph: &CandidateLinks<'_>, excluded: &[u128; 9]) -> Option<ColoringReason> {
    let affected = excluded
        .iter()
        .copied()
        .fold(0, |cells, digit| cells | digit);
    for cell in cells(affected) {
        let mask = graph.masks[cell];
        // Exhaustion compares alternatives. A lone candidate is already a single.
        if mask.count_ones() >= 2
            && bit_indices(mask).all(|digit| excluded[digit] & cell_bit(cell) != 0)
        {
            return Some(ColoringReason::EmptiedCell(cell));
        }
    }
    for (digit, (&positions, &excluded)) in graph.positions.iter().zip(excluded).enumerate() {
        let struck = positions & excluded;
        if struck == 0 {
            continue;
        }
        for house in House::all() {
            let candidates = positions & house_cells(house);
            if candidates.count_ones() >= 2 && candidates & !struck == 0 {
                return Some(ColoringReason::EmptiedHouse {
                    house,
                    digit: digit as u8 + 1,
                });
            }
        }
    }
    None
}
