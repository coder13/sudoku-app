use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantMatchingDigitBlock,
    VariantMatchingDigitCheck, VariantMatchingDigitProof, VariantTechnique, cells_in,
};
use crate::{CELLS, Candidate, HintAction, hints::digit_bit};

const MAX_FORCED_PLACEMENTS: usize = 6;

pub(super) struct MatchingCells {
    pub(super) groups: [u128; CELLS],
    peers: [u128; CELLS],
    excluded: [u128; CELLS],
}

impl MatchingCells {
    pub(super) fn new(puzzle: &CompiledVariant) -> Option<Self> {
        let mut links = puzzle
            .pair_clues
            .iter()
            .filter(|clue| matches!(clue.source.technique.id(), "palindrome" | "clone"))
            .flat_map(|clue| clue.links())
            .peekable();
        links.peek()?;
        let mut groups = std::array::from_fn(|cell| 1u128 << cell);
        for link in links {
            let [left, right] = link.cells;
            let joined = groups[left] | groups[right];
            for cell in cells_in(joined) {
                groups[cell] = joined;
            }
        }
        let mut peers = [0; CELLS];
        for &house in &puzzle.search_houses {
            let mask = puzzle.house_masks[house];
            for cell in cells_in(mask) {
                peers[cell] |= mask & !(1 << cell);
                if (mask & groups[cell]).count_ones() > 1 {
                    return None;
                }
            }
        }
        let excluded = std::array::from_fn(|cell| {
            let blocked = cells_in(groups[cell]).fold(0, |joined, member| joined | peers[member]);
            cells_in(blocked).fold(0, |joined, peer| joined | groups[peer])
        });
        Some(Self {
            groups,
            peers,
            excluded,
        })
    }

    pub(super) fn digit_sites(&self, domains: &[u16; CELLS], digit: u8) -> u128 {
        let digit = digit_bit(digit);
        let sites = domains
            .iter()
            .enumerate()
            .filter(|&(_, &mask)| mask & digit != 0)
            .fold(0, |mask, (cell, _)| mask | 1 << cell);
        cells_in(sites)
            .filter(|&cell| self.groups[cell] & !sites == 0)
            .fold(0, |mask, cell| mask | 1 << cell)
    }

    pub(super) fn initial_placements(
        &self,
        board: &crate::Board,
        digit: u8,
        sites: u128,
    ) -> Option<DigitPlacement> {
        let mut state = DigitPlacement {
            placed: 0,
            available: sites,
        };
        for (cell, &value) in board.iter().enumerate() {
            if value != digit || state.placed & (1 << cell) != 0 {
                continue;
            }
            if state.available & (1 << cell) == 0 {
                return None;
            }
            state.place(self, cell);
        }
        Some(state)
    }
}

#[derive(Clone, Copy)]
pub(super) struct DigitPlacement {
    pub(super) placed: u128,
    available: u128,
}

impl DigitPlacement {
    pub(super) fn place(&mut self, matching: &MatchingCells, cell: usize) {
        let group = matching.groups[cell];
        self.placed |= group;
        self.available &= !(group | matching.excluded[cell]);
    }

    pub(super) fn narrowest_house(self, puzzle: &CompiledVariant) -> Option<(usize, u128)> {
        let mut best = None;
        for &house in &puzzle.search_houses {
            let mask = puzzle.house_masks[house];
            if mask & self.placed != 0 {
                continue;
            }
            let available = mask & self.available;
            if available == 0 {
                return Some((house, available));
            }
            if best
                .is_none_or(|(_, cells): (usize, u128)| available.count_ones() < cells.count_ones())
            {
                best = Some((house, available));
            }
        }
        best
    }
}

struct DigitProof<'a> {
    puzzle: &'a CompiledVariant,
    matching: &'a MatchingCells,
    sites: u128,
}

impl DigitProof<'_> {
    fn refute(&self, mut state: DigitPlacement) -> Option<Vec<VariantMatchingDigitCheck>> {
        let mut visited = [(0, state, 0); MAX_FORCED_PLACEMENTS + 1];
        for index in 0..visited.len() {
            let (house, available) = state.narrowest_house(self.puzzle)?;
            visited[index] = (house, state, available);
            if available == 0 {
                return Some(
                    visited[..=index]
                        .iter()
                        .map(|&(house, state, available)| self.check(house, state, available))
                        .collect(),
                );
            }
            if !available.is_power_of_two() {
                break;
            }
            let cell = available.trailing_zeros() as usize;
            state.place(self.matching, cell);
        }
        None
    }

    fn check(
        &self,
        house: usize,
        state: DigitPlacement,
        available: u128,
    ) -> VariantMatchingDigitCheck {
        let puzzle = self.puzzle;
        let matching = self.matching;
        let blocked = cells_in(puzzle.house_masks[house] & self.sites & !available)
            .map(|cell| {
                let matched = cells_in(matching.groups[cell])
                    .find(|&member| matching.peers[member] & state.placed != 0)
                    .expect("an unavailable group meets a placed digit");
                let placed = (matching.peers[matched] & state.placed).trailing_zeros() as usize;
                let house = puzzle
                    .shared_enforced_house(matched, &[placed])
                    .expect("the two cells share an enforced house");
                VariantMatchingDigitBlock {
                    cell,
                    matched,
                    placed,
                    house,
                }
            })
            .collect();
        let forced = if available == 0 {
            Vec::new()
        } else {
            cells_in(matching.groups[available.trailing_zeros() as usize]).collect()
        };
        VariantMatchingDigitCheck {
            house: puzzle.houses[house].kind,
            forced,
            blocked,
        }
    }

    fn prove(
        &self,
        digit: u8,
        baseline: DigitPlacement,
        cell: usize,
    ) -> Option<VariantMatchingDigitProof> {
        let group = self.matching.groups[cell];
        let mut state = baseline;
        state.place(self.matching, cell);
        let mut checks = self.refute(state)?;
        let conflict = checks.pop()?;
        let matching = group.count_ones() > 1
            || checks.iter().any(|check| check.forced.len() > 1)
            || checks
                .iter()
                .chain(std::iter::once(&conflict))
                .flat_map(|check| &check.blocked)
                .any(|block| {
                    block.matched != block.cell
                        || self.matching.groups[block.placed].count_ones() > 1
                });
        matching.then(|| VariantMatchingDigitProof {
            digit,
            assumed: cells_in(group).collect(),
            initially_placed: cells_in(baseline.placed).collect(),
            checks,
            conflict,
        })
    }
}

impl CompiledVariant {
    pub(super) fn matching_digit_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
        first_only: bool,
    ) {
        let Some(matching) = MatchingCells::new(self) else {
            return;
        };
        let domains = std::array::from_fn(|cell| position.domain(cell));
        for digit in 1..=9 {
            let sites = matching.digit_sites(&domains, digit);
            let context = DigitProof {
                puzzle: self,
                matching: &matching,
                sites,
            };
            let Some(baseline) = matching.initial_placements(&position.board, digit, sites) else {
                continue;
            };
            if baseline
                .narrowest_house(self)
                .is_some_and(|(_, sites)| sites == 0)
            {
                continue;
            }
            for cell in cells_in(baseline.available) {
                if matching.groups[cell].trailing_zeros() as usize != cell {
                    continue;
                }
                if let Some(proof) = context.prove(digit, baseline, cell) {
                    let actions = proof
                        .assumed
                        .iter()
                        .map(|&cell| HintAction::Eliminate(Candidate { cell, digit }))
                        .collect();
                    let direct = proof.checks.is_empty();
                    let deduction = VariantDeduction {
                        technique: VariantTechnique::MatchingDigitContradiction,
                        actions,
                        evidence: VariantEvidence::MatchingDigit(Box::new(proof)),
                    };
                    // A direct conflict is the shortest possible proof.
                    if first_only && direct {
                        proofs.clear();
                        proofs.push(deduction);
                        return;
                    }
                    proofs.push(deduction);
                }
            }
        }
        proofs.sort_by_key(|deduction| match &deduction.evidence {
            VariantEvidence::MatchingDigit(proof) => proof.checks.len(),
            _ => 0,
        });
    }
}
