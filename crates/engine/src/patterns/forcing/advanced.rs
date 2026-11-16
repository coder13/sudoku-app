use super::super::{cell_bit, fish};
use super::{
    CELLS, ControlFlow, Deduction, Fact, ForcingGraph, ForcingScope, HintEvidence, House, STATES,
    UNSEEN, coordinates, house_cells, house_clause,
};
use crate::{Technique, hints::subsets};

pub(super) struct State {
    masks: [u16; CELLS],
    lines: [fish::Lines; 2],
    changed_houses: u32,
    changed_digits: u16,
    applied: usize,
    pub(super) patterns: Vec<Pattern>,
}

pub(super) struct Pattern {
    pub(super) scope: ForcingScope,
    pub(super) premises: Vec<usize>,
    pub(super) first_fact: usize,
}

impl State {
    pub(super) fn new(graph: &ForcingGraph) -> Self {
        let mut masks = [0; CELLS];
        let mut positions = [0; 9];
        for &id in &graph.available {
            masks[id / 9] |= 1 << (id % 9);
            positions[id % 9] |= cell_bit(id / 9);
        }
        Self {
            masks,
            lines: fish::line_masks(&positions),
            changed_houses: 0,
            changed_digits: 0,
            applied: 0,
            patterns: Vec::new(),
        }
    }

    fn remove(&mut self, id: usize) {
        let cell = id / 9;
        let digit = id % 9;
        let (row, column, group) = coordinates(cell);
        self.masks[cell] &= !(1 << digit);
        self.lines[0][digit][row] &= !(1 << column);
        self.lines[1][digit][column] &= !(1 << row);
        self.changed_houses |= (1 << row) | (1 << (9 + column)) | (1 << (18 + group));
        self.changed_digits |= 1 << digit;
    }

    fn restore(&mut self, id: usize) {
        let cell = id / 9;
        let digit = id % 9;
        let (row, column, _) = coordinates(cell);
        self.masks[cell] |= 1 << digit;
        self.lines[0][digit][row] |= 1 << column;
        self.lines[1][digit][column] |= 1 << row;
    }

    pub(super) fn sync(&mut self, facts: &[Fact]) {
        for fact in &facts[self.applied..] {
            if fact.state & 1 == 0 {
                self.remove(fact.state / 2);
            }
        }
        self.applied = facts.len();
    }

    pub(super) fn rollback(&mut self, facts: &[Fact], checkpoint: usize) {
        let retained = checkpoint.min(self.applied);
        for fact in &facts[retained..self.applied] {
            if fact.state & 1 == 0 {
                self.restore(fact.state / 2);
            }
        }
        self.applied = retained;
        self.patterns.truncate(
            self.patterns
                .partition_point(|pattern| pattern.first_fact < checkpoint),
        );
        if checkpoint == 0 {
            self.changed_houses = 0;
            self.changed_digits = 0;
        }
    }

    pub(super) fn next(
        &self,
        graph: &ForcingGraph,
        seen: &[usize; STATES],
        facts: usize,
    ) -> Option<(Deduction, Pattern)> {
        let mut proof = None;
        let mut record = |step: Deduction| {
            let Some(pattern) = Pattern::new(&step, graph, seen, facts) else {
                return ControlFlow::Continue(());
            };
            proof = Some(pattern);
            ControlFlow::Break(step)
        };
        for technique in [Technique::NakedPair, Technique::HiddenPair] {
            let mut houses = self.changed_houses;
            while houses != 0 {
                let house = House::from_index(houses.trailing_zeros() as usize);
                houses &= houses - 1;
                if let ControlFlow::Break(step) = subsets::visit_in_house(
                    house,
                    house.cells(),
                    &self.masks,
                    technique,
                    &mut record,
                ) {
                    return Some((step, proof.unwrap()));
                }
            }
        }
        fish::Rule::for_technique(Technique::XWing)
            .unwrap()
            .visit_digits(&self.lines, self.changed_digits, &mut record)
            .break_value()
            .map(|step| (step, proof.unwrap()))
    }
}

impl Pattern {
    fn new(
        step: &Deduction,
        graph: &ForcingGraph,
        seen: &[usize; STATES],
        first_fact: usize,
    ) -> Option<Self> {
        let mut premises = Vec::new();
        let mut record = |id: usize| {
            let fact = seen[id * 2];
            debug_assert_ne!(fact, UNSEEN);
            premises.push(fact);
        };
        let scope = match step.evidence {
            HintEvidence::Pair {
                house,
                cells,
                digits,
            } if step.technique == Technique::NakedPair => {
                for cell in cells {
                    for &id in &graph.clauses[cell].members {
                        if !digits.contains(&((id % 9) as u8 + 1)) {
                            record(id);
                        }
                    }
                }
                ForcingScope::NakedPair {
                    house,
                    cells,
                    digits,
                }
            }
            HintEvidence::Pair {
                house,
                cells,
                digits,
            } => {
                debug_assert_eq!(step.technique, Technique::HiddenPair);
                for digit in digits {
                    for &id in &graph.clauses[house_clause(house, digit)].members {
                        if !cells.contains(&(id / 9)) {
                            record(id);
                        }
                    }
                }
                ForcingScope::HiddenPair {
                    house,
                    cells,
                    digits,
                }
            }
            HintEvidence::XWing {
                digit,
                bases,
                covers,
            } => {
                let covers_cells = house_cells(covers[0]) | house_cells(covers[1]);
                for base in bases {
                    for &id in &graph.clauses[house_clause(base, digit)].members {
                        if covers_cells & cell_bit(id / 9) == 0 {
                            record(id);
                        }
                    }
                }
                ForcingScope::XWing {
                    digit,
                    bases,
                    covers,
                }
            }
            _ => unreachable!("an advanced branch uses pair and X-Wing proofs"),
        };
        // A pattern already available in the original position does not depend
        // on this branch. Keep the deduction attributed to the ordinary rule.
        if premises.is_empty() {
            return None;
        }
        Some(Self {
            scope,
            premises,
            first_fact,
        })
    }
}
