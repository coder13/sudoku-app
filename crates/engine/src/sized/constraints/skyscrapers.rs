use std::collections::HashSet;

use crate::ClueDirection;

use super::MAX_SIZE;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct State {
    used: u16,
    visible: u8,
}

#[derive(Debug)]
pub(super) struct SkyscrapersLine {
    pub(super) cells: Vec<usize>,
    count: u8,
    size: usize,
}

impl SkyscrapersLine {
    pub(super) fn compile(
        size: usize,
        direction: ClueDirection,
        index: usize,
        count: u8,
    ) -> Option<Self> {
        if index >= size
            || count == 0
            || usize::from(count) > size
            || !matches!(
                direction,
                ClueDirection::North
                    | ClueDirection::East
                    | ClueDirection::South
                    | ClueDirection::West
            )
        {
            return None;
        }
        let cells = (0..size)
            .map(|offset| match direction {
                ClueDirection::North => offset * size + index,
                ClueDirection::South => (size - 1 - offset) * size + index,
                ClueDirection::West => index * size + offset,
                ClueDirection::East => index * size + size - 1 - offset,
                _ => unreachable!("cardinal direction checked above"),
            })
            .collect();
        Some(Self { cells, count, size })
    }

    fn transitions(
        &self,
        state: State,
        domain: u16,
        remaining: usize,
        output: &mut Vec<(u8, State)>,
    ) {
        let tallest = if state.used == 0 {
            0
        } else {
            16 - state.used.leading_zeros() as u8
        };
        for digit in 1..=self.size as u8 {
            let bit = 1 << (digit - 1);
            if domain & bit == 0 || state.used & bit != 0 {
                continue;
            }
            let visible = state.visible + u8::from(digit > tallest);
            if visible > self.count || usize::from(visible) + remaining < usize::from(self.count) {
                continue;
            }
            output.push((
                digit,
                State {
                    used: state.used | bit,
                    visible,
                },
            ));
        }
    }

    /// Find every digit with support in a distinct line having the requested visibility count.
    pub(super) fn support(&self, domains: &[u16]) -> Option<[u16; MAX_SIZE]> {
        let mut layers: Vec<HashSet<State>> = (0..=self.size).map(|_| HashSet::new()).collect();
        layers[0].insert(State {
            used: 0,
            visible: 0,
        });
        let mut transitions = Vec::with_capacity(self.size);
        for index in 0..self.size {
            let mut next_layer = HashSet::new();
            for &state in &layers[index] {
                transitions.clear();
                self.transitions(
                    state,
                    domains[self.cells[index]],
                    self.size - index - 1,
                    &mut transitions,
                );
                next_layer.extend(transitions.iter().map(|(_, next)| *next));
            }
            if next_layer.is_empty() {
                return None;
            }
            layers[index + 1] = next_layer;
        }

        let mut supported_states: HashSet<State> = layers[self.size]
            .iter()
            .copied()
            .filter(|state| state.visible == self.count)
            .collect();
        if supported_states.is_empty() {
            return None;
        }
        let mut support = [0; MAX_SIZE];
        for index in (0..self.size).rev() {
            let mut previous = HashSet::new();
            for &state in &layers[index] {
                transitions.clear();
                self.transitions(
                    state,
                    domains[self.cells[index]],
                    self.size - index - 1,
                    &mut transitions,
                );
                for &(digit, next) in &transitions {
                    if supported_states.contains(&next) {
                        support[index] |= 1 << (digit - 1);
                        previous.insert(state);
                    }
                }
            }
            supported_states = previous;
        }
        if support[..self.size].contains(&0) {
            None
        } else {
            Some(support)
        }
    }

    pub(super) fn permits(&self, digits: &[u8]) -> bool {
        let mut tallest = 0;
        let mut visible = 0;
        let mut seen = 0u16;
        let mut complete = true;
        for &cell in &self.cells {
            let digit = digits[cell];
            if digit == 0 {
                complete = false;
                continue;
            }
            if usize::from(digit) > self.size || seen & (1 << (digit - 1)) != 0 {
                return false;
            }
            seen |= 1 << (digit - 1);
            if digit > tallest {
                tallest = digit;
                visible += 1;
            }
        }
        !complete || visible == self.count
    }
}
