use super::{
    Candidate, ControlFlow, Deduction, HintEvidence, PEERS, Technique, cell_bit, cells,
    links::{CANDIDATE_COUNT, CandidateLinks, candidate, index, weak_source},
    report,
};
use crate::hints::{CandidateLink, LinkSource, LinkStrength};

const UNREACHED: u16 = u16::MAX;

pub(super) fn visit(
    graph: &CandidateLinks<'_>,
    technique: Technique,
    bivalue: u128,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let xy = technique == Technique::XYChain;
    let linked = std::array::from_fn::<_, 9, _>(|digit_index| {
        let positions = graph.positions[digit_index];
        if xy {
            return positions & bivalue;
        }
        if graph.conjugates[digit_index] == 0 {
            return 0;
        }
        let digit = digit_index as u8 + 1;
        cells(positions).fold(0, |linked, cell| {
            if graph
                .house_links(Candidate { cell, digit })
                .next()
                .is_some()
            {
                linked | cell_bit(cell)
            } else {
                linked
            }
        })
    });
    let mut search = Paths::new();

    for (digit_index, &start_positions) in linked.iter().enumerate() {
        let digit = digit_index as u8 + 1;
        let mut remaining = start_positions;
        for cell in cells(start_positions) {
            remaining &= !cell_bit(cell);
            if remaining == 0 {
                break;
            }
            search.visit_from(graph, technique, &linked, Candidate { cell, digit }, visit)?;
        }
    }
    ControlFlow::Continue(())
}

// A false candidate implies a true candidate through a strong link. A true
// candidate implies a false one through a weak link. Record both truth states.
struct Paths {
    parents: [u16; CANDIDATE_COUNT * 2],
    queue: Vec<u16>,
}

impl Paths {
    fn new() -> Self {
        Self {
            parents: [UNREACHED; CANDIDATE_COUNT * 2],
            queue: Vec::new(),
        }
    }

    fn visit_from(
        &mut self,
        graph: &CandidateLinks<'_>,
        technique: Technique,
        linked: &[u128; 9],
        start: Candidate,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        for state in self.queue.drain(..) {
            self.parents[state as usize] = UNREACHED;
        }
        let first = state(start, false);
        self.reach(first, first);
        let xy = technique == Technique::XYChain;
        let mut next = 0;
        while next < self.queue.len() {
            let current = self.queue[next];
            next += 1;
            let from = state_candidate(current);

            if current & 1 == 0 {
                if xy {
                    if let Some(link) = graph.cell_link(from) {
                        self.reach(state(link.to, true), current);
                    }
                } else {
                    for link in graph.house_links(from) {
                        self.reach(state(link.to, true), current);
                    }
                }
                continue;
            }

            let digit_index = usize::from(from.digit - 1);
            if from.digit == start.digit && from.cell > start.cell {
                let targets = graph.positions[digit_index] & PEERS[start.cell] & PEERS[from.cell];
                if targets != 0 {
                    self.report(graph, technique, current, targets, visit)?;
                }
            }
            for cell in cells(linked[digit_index] & PEERS[from.cell]) {
                self.reach(
                    state(
                        Candidate {
                            cell,
                            digit: from.digit,
                        },
                        false,
                    ),
                    current,
                );
            }
        }
        ControlFlow::Continue(())
    }

    fn reach(&mut self, state: u16, from: u16) {
        let parent = &mut self.parents[state as usize];
        if *parent == UNREACHED {
            *parent = from;
            self.queue.push(state);
        }
    }

    fn report(
        &self,
        graph: &CandidateLinks<'_>,
        technique: Technique,
        end: u16,
        mut targets: u128,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let xy = technique == Technique::XYChain;
        // One conjugate pair and two matching bivalue cells are simpler patterns.
        let minimum = if xy { 5 } else { 3 };
        let mut ancestor = end;
        for _ in 0..minimum {
            let previous = self.parents[ancestor as usize];
            if previous == ancestor {
                return ControlFlow::Continue(());
            }
            ancestor = previous;
        }
        let mut links = Vec::new();
        let mut current = end;
        loop {
            let previous = self.parents[current as usize];
            if previous == current {
                break;
            }
            let from = state_candidate(previous);
            let to = state_candidate(current);
            targets &= !cell_bit(from.cell);
            if targets == 0 {
                return ControlFlow::Continue(());
            }

            let link = if current & 1 == 0 {
                CandidateLink {
                    from,
                    to,
                    source: weak_source(from, to).expect("weak chain neighbors are peers"),
                    strength: LinkStrength::Weak,
                }
            } else if xy {
                CandidateLink {
                    from,
                    to,
                    source: LinkSource::Cell(from.cell),
                    strength: LinkStrength::Strong,
                }
            } else {
                graph
                    .house_links(from)
                    .find(|link| link.to == to)
                    .expect("strong chain neighbors form a conjugate pair")
            };
            links.push(link);
            current = previous;
        }

        links.reverse();
        report(
            visit,
            technique,
            targets,
            state_candidate(end).digit,
            || HintEvidence::Chain { links },
        )
    }
}

fn state(value: Candidate, is_true: bool) -> u16 {
    (index(value) * 2) as u16 + u16::from(is_true)
}

fn state_candidate(state: u16) -> Candidate {
    candidate(usize::from(state / 2))
}
