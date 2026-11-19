use super::{CompiledCage, CompiledVariant, cells_in};
use crate::{
    Analysis, Board, CELLS, DIGITS, PositionSnapshot, Random,
    hints::{digit_bit, digits},
};

/// Position validation or exact search failed under the compiled rules.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VariantPositionError {
    /// The puzzle conflicts, is unsolvable, or reached its search limit.
    Puzzle(Analysis),
    /// The removal mask at this cell contains bits outside digits 1–9.
    InvalidEliminations(usize),
}

#[derive(Clone)]
pub(super) struct SearchPosition {
    pub board: Board,
    pub masks: [u16; CELLS],
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum SearchMode {
    PropagateHouses,
    // Keep calibrated sampling and bounded proof eligibility stable.
    PreserveTraversal,
}

impl CompiledVariant {
    /// Combine the givens and placed digits and compute legal candidate masks.
    ///
    /// Cages, cell-pair relations, lines, Quadruples and Global Entropy narrow domains until they stabilize.
    /// Supplied removal masks apply as additional restrictions. Filled cells have
    /// mask zero. Empty cells can have no candidates when the rules conflict.
    pub fn candidates(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
    ) -> Result<[u16; CELLS], VariantPositionError> {
        Ok(self.prepare(entries, eliminations)?.masks)
    }

    /// Count up to two solutions under all rules and the supplied removal masks.
    ///
    /// Returns a direct conflict as [`Analysis::Conflict`]. Invalid removal masks
    /// are reported separately. The node budget includes the starting position.
    /// Search-only house propagation can complete counts within budgets that
    /// previously exhausted. It does not change [`Self::candidates`].
    pub fn analyze(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        max_nodes: u32,
    ) -> Result<Analysis, VariantPositionError> {
        self.analyze_with_mode(
            entries,
            eliminations,
            max_nodes,
            SearchMode::PropagateHouses,
        )
    }

    // Earlier uniqueness success can trigger expensive empty graph searches.
    // Preserve this computational gate while public exact checks grow stronger.
    pub(super) fn analyze_for_proof(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        max_nodes: u32,
    ) -> Result<Analysis, VariantPositionError> {
        self.analyze_with_mode(
            entries,
            eliminations,
            max_nodes,
            SearchMode::PreserveTraversal,
        )
    }

    fn analyze_with_mode(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        mut max_nodes: u32,
        mode: SearchMode,
    ) -> Result<Analysis, VariantPositionError> {
        let position = match self.prepare(entries, eliminations) {
            Ok(position) => position,
            Err(VariantPositionError::Puzzle(analysis)) => return Ok(analysis),
            Err(error) => return Err(error),
        };
        let count = self.search(position, 2, &mut max_nodes, &mut None, mode, &mut digits);
        Ok(match count {
            None => Analysis::SearchLimit,
            Some(0) => Analysis::Unsolvable,
            Some(1) => Analysis::Unique,
            Some(_) => Analysis::Multiple,
        })
    }

    /// Find one completion under all rules and the supplied removal masks.
    ///
    /// A successful solve may have other completions. Use [`Self::analyze`] to
    /// check uniqueness. The node budget includes the starting position.
    pub fn solve(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        max_nodes: u32,
    ) -> Result<Board, VariantPositionError> {
        self.complete(
            entries,
            eliminations,
            max_nodes,
            SearchMode::PropagateHouses,
            digits,
        )
    }

    /// Find one rule-compliant completion by trying candidate digits in seeded order.
    ///
    /// The same position, seed, and node limit give the same result. This can
    /// sample solutions for generation. It does not test uniqueness.
    /// Sampling preserves its established traversal rather than using the
    /// additional house propagation of verification and deterministic solving.
    pub fn solve_seeded(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        max_nodes: u32,
        seed: u32,
    ) -> Result<Board, VariantPositionError> {
        let mut random = Random::from_seed(seed);
        self.complete(
            entries,
            eliminations,
            max_nodes,
            SearchMode::PreserveTraversal,
            |mask| {
                // Each recursive call owns its digit order.
                let mut order = [0; 9];
                let len = mask.count_ones() as usize;
                for (slot, digit) in order.iter_mut().zip(digits(mask)) {
                    *slot = digit;
                }
                random.shuffle(&mut order[..len]);
                order.into_iter().take(len)
            },
        )
    }

    fn complete<D: Iterator<Item = u8>>(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        mut max_nodes: u32,
        mode: SearchMode,
        mut order: impl FnMut(u16) -> D,
    ) -> Result<Board, VariantPositionError> {
        let position = self.prepare(entries, eliminations)?;
        let mut solution = None;
        match self.search(position, 1, &mut max_nodes, &mut solution, mode, &mut order) {
            None => Err(VariantPositionError::Puzzle(Analysis::SearchLimit)),
            Some(_) => solution.ok_or(VariantPositionError::Puzzle(Analysis::Unsolvable)),
        }
    }

    pub(super) fn prepare(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
    ) -> Result<SearchPosition, VariantPositionError> {
        if let Some(cell) = eliminations.iter().position(|&mask| mask & !DIGITS != 0) {
            return Err(VariantPositionError::InvalidEliminations(cell));
        }
        let position = PositionSnapshot {
            givens: self.givens,
            entries: *entries,
            eliminations: *eliminations,
        };
        let board = position.values().map_err(VariantPositionError::Puzzle)?;
        let mut masks = std::array::from_fn(|cell| {
            if board[cell] == 0 {
                self.allowed_digits[cell] & !eliminations[cell]
            } else {
                0
            }
        });
        let mut placed = [0; 9];
        for (cell, &digit) in board.iter().enumerate().filter(|&(_, &digit)| digit != 0) {
            let bit = digit_bit(digit);
            let digit_cells = &mut placed[usize::from(digit - 1)];
            if self.allowed_digits[cell] & bit == 0 || self.peers[cell] & *digit_cells != 0 {
                return Err(VariantPositionError::Puzzle(Analysis::Conflict));
            }
            *digit_cells |= 1 << cell;
            for peer in cells_in(self.peers[cell]) {
                masks[peer] &= !bit;
            }
        }
        for cage in &self.cages {
            let fixed = cage
                .cells
                .iter()
                .filter(|&&cell| board[cell] != 0)
                .map(|&cell| digit_bit(board[cell]))
                .fold(0, |mask, bit| mask | bit);
            if !cage
                .combinations
                .iter()
                .any(|&digits| digits & fixed == fixed)
            {
                return Err(VariantPositionError::Puzzle(Analysis::Conflict));
            }
        }
        for pair in &self.pairs {
            let [first, second] = pair.cells.map(|cell| board[cell]);
            if first != 0 && second != 0 && !pair.permits(first, second) {
                return Err(VariantPositionError::Puzzle(Analysis::Conflict));
            }
        }
        for line in &self.lines {
            let len = line.cells.len();
            let mut domains = [DIGITS; CELLS];
            let line_domains = &mut domains[..len];
            for (domain, &cell) in line_domains.iter_mut().zip(&line.cells) {
                if board[cell] != 0 {
                    *domain = digit_bit(board[cell]);
                }
            }
            if line_domains.iter().any(|&domain| domain != DIGITS) {
                let mut support = [0; CELLS];
                line.support(line_domains, &mut support[..len]);
                if support[0] == 0 {
                    return Err(VariantPositionError::Puzzle(Analysis::Conflict));
                }
            }
        }
        for clue in &self.quadruples {
            let domains = clue.cells.map(|cell| {
                if board[cell] == 0 {
                    DIGITS
                } else {
                    digit_bit(board[cell])
                }
            });
            if !clue.has_assignment(domains) {
                return Err(VariantPositionError::Puzzle(Analysis::Conflict));
            }
        }
        for (_, cells) in self.entropy_windows() {
            let domains = cells.map(|cell| match board[cell] {
                0 => DIGITS,
                digit => digit_bit(digit),
            });
            if super::global_entropy::support(domains)[0] == 0 {
                return Err(VariantPositionError::Puzzle(Analysis::Conflict));
            }
        }
        let mut position = SearchPosition { board, masks };
        self.restrict_domains(&mut position);
        Ok(position)
    }

    fn search<D: Iterator<Item = u8>>(
        &self,
        mut position: SearchPosition,
        limit: u8,
        nodes: &mut u32,
        solution: &mut Option<Board>,
        mode: SearchMode,
        order: &mut impl FnMut(u16) -> D,
    ) -> Option<u8> {
        *nodes = nodes.checked_sub(1)?;
        // MRV already selects a forced cell next. Place it before repeating
        // the complete house scan, which is useful at genuine branch points.
        if mode == SearchMode::PropagateHouses
            && !position.masks.iter().any(|mask| mask.is_power_of_two())
            && !self.restrict_search_houses(&mut position)
        {
            return Some(0);
        }
        let next = position
            .board
            .iter()
            .enumerate()
            .filter(|&(_, &digit)| digit == 0)
            .min_by_key(|&(cell, _)| position.masks[cell].count_ones());
        let Some((cell, _)) = next else {
            solution.get_or_insert(position.board);
            return Some(1);
        };
        let mut count = 0;
        for digit in order(position.masks[cell]) {
            let mut child = position.clone();
            child.board[cell] = digit;
            child.masks[cell] = 0;
            let bit = digit_bit(digit);
            for peer in cells_in(self.peers[cell]) {
                child.masks[peer] &= !bit;
            }
            self.restrict_domains(&mut child);
            count += self.search(child, limit - count, nodes, solution, mode, order)?;
            if count == limit {
                break;
            }
        }
        Some(count)
    }

    // Exact search can use forced house domains without changing public
    // candidates or deciding which human techniques the logical solver uses.
    fn restrict_search_houses(&self, position: &mut SearchPosition) -> bool {
        loop {
            if (0..CELLS).any(|cell| position.board[cell] == 0 && position.masks[cell] == 0) {
                return false;
            }
            let mut changed = false;
            for &index in &self.search_houses {
                let house = &self.houses[index];
                let (mut placed, mut supported, mut repeated) = (0, 0, 0);
                for &cell in &house.cells {
                    let digit = position.board[cell];
                    if digit != 0 {
                        placed |= digit_bit(digit);
                    }
                    let mask = position.masks[cell];
                    repeated |= supported & mask;
                    supported |= mask;
                }
                let missing = DIGITS & !placed;
                if missing & !supported != 0 {
                    return false;
                }
                let singles = missing & !repeated;
                if singles == 0 {
                    continue;
                }
                for &cell in &house.cells {
                    let forced = position.masks[cell] & singles;
                    if forced != 0 {
                        // Two missing digits cannot both occupy this one cell.
                        if !forced.is_power_of_two() {
                            return false;
                        }
                        if position.masks[cell] == forced {
                            continue;
                        }
                        position.masks[cell] = forced;
                        changed = true;
                    }
                }
            }
            if !changed {
                return true;
            }
            self.restrict_domains(position);
        }
    }

    fn restrict_domains(&self, position: &mut SearchPosition) {
        loop {
            for cage in &self.cages {
                cage.restrict(position);
            }
            let mut changed = false;
            for pair in &self.pairs {
                let domains = pair.cells.map(|cell| match position.board[cell] {
                    0 => position.masks[cell],
                    digit => digit_bit(digit),
                });
                let supported = pair.restrict(domains);
                for (cell, mask) in pair.cells.into_iter().zip(supported) {
                    if position.board[cell] == 0 && position.masks[cell] != mask {
                        position.masks[cell] = mask;
                        changed = true;
                    }
                }
            }
            for line in &self.lines {
                let len = line.cells.len();
                let mut domains = [0; CELLS];
                let line_domains = &mut domains[..len];
                for (domain, &cell) in line_domains.iter_mut().zip(&line.cells) {
                    *domain = match position.board[cell] {
                        0 => position.masks[cell],
                        digit => digit_bit(digit),
                    };
                }
                let mut support = [0; CELLS];
                line.support(line_domains, &mut support[..len]);
                for (&cell, &mask) in line.cells.iter().zip(&support) {
                    if position.board[cell] == 0 && position.masks[cell] != mask {
                        position.masks[cell] = mask;
                        changed = true;
                    }
                }
            }
            for clue in &self.quadruples {
                let domains = clue.cells.map(|cell| match position.board[cell] {
                    0 => position.masks[cell],
                    digit => digit_bit(digit),
                });
                for (cell, mask) in clue.cells.into_iter().zip(clue.support(domains)) {
                    if position.board[cell] == 0 && position.masks[cell] != mask {
                        position.masks[cell] = mask;
                        changed = true;
                    }
                }
            }
            for (_, cells) in self.entropy_windows() {
                let domains = cells.map(|cell| match position.board[cell] {
                    0 => position.masks[cell],
                    digit => digit_bit(digit),
                });
                for (cell, mask) in cells.into_iter().zip(super::global_entropy::support(domains)) {
                    if position.board[cell] == 0 && position.masks[cell] != mask {
                        position.masks[cell] = mask;
                        changed = true;
                    }
                }
            }
            if !changed {
                break;
            }
        }
    }
}

#[cfg(test)]
mod exact_house_tests {
    use super::*;
    use crate::{PuzzleRule, VariantPuzzle};

    #[test]
    fn retained_regions_do_not_reintroduce_removed_distinctness() {
        let solution = std::array::from_fn(|cell| ((cell / 9 + cell % 9) % 9 + 1) as u8);
        let mut definition = VariantPuzzle::classic(solution);
        // Region 1 contributes 1+2, and region 6 contributes 3. The Latin
        // completion respects this sum line but repeats digits in its boxes.
        definition.rules.push(PuzzleRule::RegionSum {
            cells: vec![0, 1, 35],
            group_by_region: false,
            segments: None,
        });
        let reduced = definition.compile_with_regions(false).unwrap();
        assert_eq!(reduced.houses.len(), 27);
        assert_eq!(reduced.search_houses.len(), 18);
        assert_eq!(
            reduced.analyze(&[0; CELLS], &[0; CELLS], 1),
            Ok(Analysis::Unique)
        );
        assert_eq!(reduced.solve(&[0; CELLS], &[0; CELLS], 1), Ok(solution));
        assert_eq!(
            definition
                .compile()
                .unwrap()
                .analyze(&[0; CELLS], &[0; CELLS], 1),
            Ok(Analysis::Conflict)
        );
    }
}

impl CompiledCage {
    pub(super) fn support(&self, domains: &[u16]) -> [u16; 9] {
        self.support_with_placed_digits(domains, 0)
    }

    fn support_with_placed_digits(&self, domains: &[u16], fixed: u16) -> [u16; 9] {
        let mut support = [0; 9];
        // A subset is useful only if its digits can be assigned to the cells.
        for &digits in self
            .combinations
            .iter()
            .filter(|&&digits| digits & fixed == fixed)
        {
            record_support(digits & !fixed, domains, &mut support, &mut [None; 512]);
        }
        support
    }

    fn restrict(&self, position: &mut SearchPosition) {
        let mut candidates = [0; 9];
        let mut open = [0; 9];
        let mut fixed = 0;
        let mut len = 0;
        for &cell in &self.cells {
            let digit = position.board[cell];
            if digit == 0 {
                open[len] = cell;
                candidates[len] = position.masks[cell];
                len += 1;
            } else {
                fixed |= digit_bit(digit);
            }
        }
        if len == 0 {
            return;
        }

        let support = self.support_with_placed_digits(&candidates[..len], fixed);
        for (index, &cell) in open[..len].iter().enumerate() {
            position.masks[cell] &= support[index];
        }
    }
}

// For one digit subset, the remaining digits determine how many cells
// have been filled. Memoization avoids revisiting permutations of the prefix.
pub(super) fn record_support(
    remaining: u16,
    candidates: &[u16],
    support: &mut [u16; 9],
    possible: &mut [Option<bool>; 512],
) -> bool {
    if remaining == 0 {
        return true;
    }
    if let Some(found) = possible[remaining as usize] {
        return found;
    }
    let cell = candidates.len() - remaining.count_ones() as usize;
    let mut found = false;
    for digit in crate::hints::digits(candidates[cell] & remaining) {
        let bit = digit_bit(digit);
        if record_support(remaining ^ bit, candidates, support, possible) {
            support[cell] |= bit;
            found = true;
        }
    }
    possible[remaining as usize] = Some(found);
    found
}
