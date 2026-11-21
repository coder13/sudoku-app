use super::{
    CompiledVariant, cells_in,
    lines::renban_sum::{ContainedJoin, contained_joins},
};
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

#[derive(Clone, Copy)]
enum SearchMode<'a> {
    Verify(&'a [ContainedJoin<'a>]),
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
        let renban_sums: Vec<_> = contained_joins(self).collect();
        self.analyze_with_mode(
            entries,
            eliminations,
            max_nodes,
            SearchMode::Verify(&renban_sums),
            &mut None,
        )
    }

    /// Return a completion only after proving that it is unique.
    ///
    /// This uses the same traversal and node budget as [`Self::analyze`].
    pub fn solve_unique(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        max_nodes: u32,
    ) -> Result<Board, VariantPositionError> {
        let mut solution = None;
        let renban_sums: Vec<_> = contained_joins(self).collect();
        let analysis = self.analyze_with_mode(
            entries,
            eliminations,
            max_nodes,
            SearchMode::Verify(&renban_sums),
            &mut solution,
        )?;
        if analysis == Analysis::Unique {
            Ok(solution.expect("a completed count of one records its solution"))
        } else {
            Err(VariantPositionError::Puzzle(analysis))
        }
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
            &mut None,
        )
    }

    fn analyze_with_mode(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        mut max_nodes: u32,
        mode: SearchMode<'_>,
        solution: &mut Option<Board>,
    ) -> Result<Analysis, VariantPositionError> {
        let position = match self.prepare_search(entries, eliminations, max_nodes, mode) {
            Ok(position) => position,
            Err(VariantPositionError::Puzzle(analysis)) => return Ok(analysis),
            Err(error) => return Err(error),
        };
        let count = self.search(position, 2, &mut max_nodes, &mut |board| {
            solution.get_or_insert(board);
        }, mode, &mut digits);
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
        if self.quadruples.is_empty() {
            return self.solve_for_proof(entries, eliminations, max_nodes);
        }
        self.complete(entries, eliminations, max_nodes, SearchMode::Verify(&[]), digits)
    }

    pub(super) fn solve_for_proof(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        max_nodes: u32,
    ) -> Result<Board, VariantPositionError> {
        self.complete(entries, eliminations, max_nodes, SearchMode::PropagateHouses, digits)
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
        mode: SearchMode<'_>,
        mut order: impl FnMut(u16) -> D,
    ) -> Result<Board, VariantPositionError> {
        let position = self.prepare_search(entries, eliminations, max_nodes, mode)?;
        let mut solution = None;
        match self.search(position, 1, &mut max_nodes, &mut |board| { solution = Some(board); }, mode, &mut order) {
            None => Err(VariantPositionError::Puzzle(Analysis::SearchLimit)),
            Some(_) => solution.ok_or(VariantPositionError::Puzzle(Analysis::Unsolvable)),
        }
    }

    /// Visit every completion within the bounds. No partial list is returned.
    pub(super) fn complete_bounded(&self, limit: u8, mut nodes: u32) -> Option<Vec<Board>> {
        let mode = SearchMode::Verify(&[]);
        let position = self.prepare_search(&[0; CELLS], &[0; CELLS], nodes, mode).ok()?;
        let mut layouts = Vec::new();
        let count = self.search(position, limit, &mut nodes, &mut |board| layouts.push(board), mode, &mut digits)?;
        (count < limit).then_some(layouts)
    }

    fn prepare_search(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        max_nodes: u32,
        mode: SearchMode<'_>,
    ) -> Result<SearchPosition, VariantPositionError> {
        let mut position = self.prepare(entries, eliminations)?;
        if max_nodes > 0 && matches!(mode, SearchMode::Verify(_)) && !self.quadruples.is_empty()
            && position.masks.iter().any(|mask| mask.count_ones() > 1)
        {
            if !self.restrict_quadruple_layouts(&mut position) {
                return Err(VariantPositionError::Puzzle(Analysis::Unsolvable));
            }
            self.restrict_domains(&mut position, mode);
        }
        Ok(position)
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
            if !cage.permits_placements(&board) {
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
        if let Some(clue) = &self.lettered_quadruples {
            let domains = board.map(|digit| if digit == 0 { DIGITS } else { digit_bit(digit) });
            if !clue.permits(&domains) {
                return Err(VariantPositionError::Puzzle(Analysis::Conflict));
            }
        }
        let mut position = SearchPosition { board, masks };
        self.restrict_domains(&mut position, SearchMode::PreserveTraversal);
        Ok(position)
    }

    fn search<D: Iterator<Item = u8>>(
        &self,
        mut position: SearchPosition,
        limit: u8,
        nodes: &mut u32,
        record: &mut impl FnMut(Board),
        mode: SearchMode<'_>,
        order: &mut impl FnMut(u16) -> D,
    ) -> Option<u8> {
        *nodes = nodes.checked_sub(1)?;
        // MRV already selects a forced cell next. Place it before repeating
        // the complete house scan, which is useful at genuine branch points.
        if !matches!(mode, SearchMode::PreserveTraversal)
            && !position.masks.iter().any(|mask| mask.is_power_of_two())
            && !self.restrict_search_houses(&mut position, mode)
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
            if self.lettered_quadruples.as_ref().is_some_and(|clue| !clue.permits(&position.board.map(digit_bit))) {
                return Some(0);
            }
            record(position.board);
            return Some(1);
        };
        let mut count = 0;
        for digit in order(position.masks[cell]) {
            let child = self.propagate_placement_with_mode(&position, cell, digit, mode);
            count += self.search(child, limit - count, nodes, record, mode, order)?;
            if count == limit {
                break;
            }
        }
        Some(count)
    }

    /// Apply one candidate and propagate clue support without branching.
    pub(super) fn propagate_placement(
        &self,
        position: &SearchPosition,
        cell: usize,
        digit: u8,
    ) -> SearchPosition {
        self.propagate_placement_with_mode(position, cell, digit, SearchMode::PreserveTraversal)
    }

    fn propagate_placement_with_mode(
        &self,
        position: &SearchPosition,
        cell: usize,
        digit: u8,
        mode: SearchMode<'_>,
    ) -> SearchPosition {
        let mut child = position.clone();
        child.board[cell] = digit;
        child.masks[cell] = 0;
        let bit = digit_bit(digit);
        for peer in cells_in(self.peers[cell]) {
            child.masks[peer] &= !bit;
        }
        self.restrict_domains(&mut child, mode);
        child
    }

    // Exact search can use forced house domains without changing public
    // candidates or deciding which human techniques the logical solver uses.
    fn restrict_search_houses(&self, position: &mut SearchPosition, mode: SearchMode<'_>) -> bool {
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
            self.restrict_domains(position, mode);
        }
    }

    fn restrict_domains(&self, position: &mut SearchPosition, mode: SearchMode<'_>) {
        // In exact search, support a Quadruple and its Global Entropy window
        // with the same assignment. Public candidates and logical gates keep
        // their per-rule support so their deductions retain the same meaning.
        let join_windows = matches!(mode, SearchMode::Verify(_)) && self.global_entropy.is_some();
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
            if let SearchMode::Verify(renban_sums) = mode {
                for join in renban_sums {
                    let cells = join.cells();
                    let mut domains = [0; 9];
                    for (&cell, mask) in cells.iter().zip(&mut domains) {
                        *mask = match position.board[cell] {
                            0 => position.masks[cell],
                            digit => digit_bit(digit),
                        };
                    }
                    let supported = join.support(&domains[..cells.len()]);
                    for (&cell, mask) in cells.iter().zip(supported.masks) {
                        if position.board[cell] == 0 && position.masks[cell] != mask {
                            position.masks[cell] = mask;
                            changed = true;
                        }
                    }
                }
            }
            for clue in &self.quadruples {
                let domains = clue.cells.map(|cell| match position.board[cell] {
                    0 => position.masks[cell],
                    digit => digit_bit(digit),
                });
                let supported = if join_windows {
                    clue.support_with_entropy(domains)
                } else {
                    clue.support(domains)
                };
                for (cell, mask) in clue.cells.into_iter().zip(supported) {
                    if position.board[cell] == 0 && position.masks[cell] != mask {
                        position.masks[cell] = mask;
                        changed = true;
                    }
                }
            }
            if let Some(clue) = &self.lettered_quadruples {
                let domains = std::array::from_fn(|cell| match position.board[cell] {
                    0 => position.masks[cell],
                    digit => digit_bit(digit),
                });
                if let Some(support) = clue.support(&domains) {
                    for (cell, mask) in support.into_iter().enumerate() {
                        if position.board[cell] == 0 && position.masks[cell] != mask {
                            position.masks[cell] = mask;
                            changed = true;
                        }
                    }
                } else if !clue.permits(&domains) {
                    position.masks.fill(0);
                    return;
                }
            }
            for (_, cells) in self.entropy_windows() {
                let domains = cells.map(|cell| match position.board[cell] {
                    0 => position.masks[cell],
                    digit => digit_bit(digit),
                });
                for (cell, mask) in cells
                    .into_iter()
                    .zip(super::global_entropy::support(domains))
                {
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

// For one digit subset, the remaining digits determine how many cells
// have been filled. Memoization avoids revisiting permutations of the prefix.
pub(crate) fn record_support<const N: usize, const CACHE: usize>(
    remaining: u16,
    candidates: &[u16],
    support: &mut [u16; N],
    possible: &mut [Option<bool>; CACHE],
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
