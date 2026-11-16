use std::{cell::OnceCell, collections::BTreeMap};

use super::{
    CompiledVariant, PuzzleRule, RegionLayout, VariantDefinitionError, VariantHouseKind,
    VariantPosition, VariantPositionError, cell_mask, cells_in, digit_sum,
};
use crate::{
    Analysis, Board, CELLS, Candidate, DIGITS, Difficulty, HintAction, HintEvidence, SolveStatus,
    Technique,
    hints::{DeductionSearch, digit_bit, digits},
};

/// Version of the point costs and difficulty thresholds for structured puzzles.
pub const VARIANT_SCORING_VERSION: u32 = 4;
const UNIQUENESS_PROBE_NODES: u32 = 4096;

macro_rules! catalog {
    ($($(#[$doc:meta])* $name:ident: $id:literal, $cost:expr, $tier:ident;)+) => {
        /// Techniques with rule-based explanations on a structured 9 × 9 grid.
        #[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
        pub enum VariantTechnique {
            $($(#[$doc])* $name),+,
            /// A classic detector, subject to its house and uniqueness assumptions.
            Classic(Technique),
        }

        impl VariantTechnique {
            /// Techniques in default solve order.
            pub const DEFAULT_ORDER: &'static [Self] = &[$(Self::$name),+];

            /// Stable identifier for a proof or solver profile.
            pub const fn id(self) -> &'static str {
                match self { $(Self::$name => $id),+, Self::Classic(technique) => technique.id() }
            }

            /// Look up a supported technique by its case-sensitive ID.
            pub fn from_id(id: &str) -> Option<Self> {
                match id { $($id => Some(Self::$name),)+ _ => Technique::from_id(id).map(Self::Classic) }
            }

            /// Point cost per move made with this technique.
            pub const fn cost(self) -> u16 {
                match self { $(Self::$name => $cost),+, Self::Classic(technique) => technique.cost() }
            }

            /// The minimum difficulty of a path that uses the technique.
            pub const fn difficulty(self) -> Difficulty {
                match self { $(Self::$name => Difficulty::$tier),+, Self::Classic(technique) => technique.difficulty() }
            }
        }
    };
}

catalog! {
    /// Find the missing digit of a house with one empty cell.
    FullHouse: "full-house", Technique::FullHouse.cost(), Easy;
    /// Find a cell with one remaining candidate.
    NakedSingle: "naked-single", Technique::NakedSingle.cost(), Easy;
    /// Find the only cell for a particular digit in a house.
    HiddenSingle: "hidden-single", Technique::HiddenSingle.cost(), Easy;
    /// Apply a declared odd or even digit restriction.
    Parity: "parity", 6, Easy;
    /// Apply the restriction between cells a king's move apart.
    AntiKing: "anti-king", 8, Easy;
    /// Apply the restriction between cells a knight's move apart.
    AntiKnight: "anti-knight", 8, Easy;
    /// Apply the restriction on consecutive digits in orthogonally adjacent cells.
    NonConsecutive: "non-consecutive", 8, Easy;
    /// Apply a marked inequality.
    Inequality: "inequality", 8, Easy;
    /// Match candidates among clone cells.
    Clone: "clone", 17, Easy;
    /// Apply a consecutive or double relation from Kropki marks.
    Kropki: "kropki", 20, Easy;
    /// Apply a sum relation from XV marks.
    Xv: "xv", 20, Easy;
    /// Match candidates at mirrored positions on a line.
    Palindrome: "palindrome", 21, Easy;
    /// Bound the interior of a line using the two endpoint digits.
    Between: "between", 23, Easy;
    /// Find increasing assignments along a thermometer.
    Thermometer: "thermometer", 26, Easy;
    /// Find possible digit differences along a Whispers line.
    Whispers: "whispers", 27, Medium;
    /// Remove digits that cannot be assigned to the cells of a Killer cage.
    CageCombinations: "cage-combinations", 34, Easy;
    /// Find assignments whose path digits add to the digit in the circle.
    Arrow: "arrow", 36, Easy;
    /// Find consecutive sets that fit a Renban line.
    Renban: "renban", 40, Medium;
    /// Find shared sums among parts of a Region Sum line.
    RegionSum: "region-sum", 48, Medium;
    /// Confine a digit to the intersection of two of the puzzle's houses.
    LockedCandidates: "locked-candidates", Technique::Pointing.cost(), Medium;
    /// Check the digit sum of a diagonal ray.
    LittleKiller: "little-killer", 50, Medium;
    /// Use house and cage sums to constrain the cells inside or outside a house.
    CageHouseSum: "cage-house-sum", 67, Medium;
    /// Apply the count of visible heights in a row or column.
    Skyscrapers: "skyscrapers", 70, Hard;
    /// Apply a sum between 1 and 9 in a row or column.
    Sandwich: "sandwich", 76, Hard;
    /// Apply a sum of the first X digits of a row or column.
    XSum: "x-sum", 80, Hard;
}

#[cfg(feature = "wasm-api")]
impl serde::Serialize for VariantTechnique {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.id())
    }
}

impl VariantTechnique {
    /// Every technique that can be requested in a variant profile.
    pub fn all() -> impl Iterator<Item = Self> {
        Self::DEFAULT_ORDER
            .iter()
            .copied()
            .chain(
                Technique::ALL
                    .into_iter()
                    .filter_map(|technique| match technique {
                        Technique::FullHouse | Technique::NakedSingle | Technique::HiddenSingle => {
                            None
                        }
                        _ => Some(Self::Classic(technique)),
                    }),
            )
    }
}

/// Evidence for a logical move in a structured puzzle.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case")
)]
pub enum VariantEvidence {
    /// A candidate is the only available choice in a cell or house.
    Single {
        /// Candidate to place.
        candidate: Candidate,
        /// House for a Full House or Hidden Single.
        house: Option<VariantHouseKind>,
    },
    /// The digit assignments that fit a cage or a sum derived from its neighboring cages.
    CageSum {
        /// House used to derive the sum, if any.
        house: Option<VariantHouseKind>,
        /// Source cages, each addressed by rule index and then cage index.
        cages: Vec<[usize; 2]>,
        /// Target sum for the specified cells.
        sum: u16,
        /// Cells whose digits must add to the sum.
        cells: Vec<usize>,
        /// Candidate masks for the cells before applying the sum.
        domains: Vec<u16>,
    },
    /// Candidate support from the specified constraint and its input masks.
    Constraint {
        /// Indices in the ordered puzzle rule list.
        rules: Vec<usize>,
        /// Cells involved in the deduction, in the order used by the constraint.
        cells: Vec<usize>,
        /// Candidate masks, including singleton masks for placed digits.
        domains: Vec<u16>,
    },
    /// The candidate locations in one house lock a digit into a second house.
    Intersection {
        /// House placing the digit in the shared cells.
        source: VariantHouseKind,
        /// House whose cells outside the intersection lose the digit.
        target: VariantHouseKind,
        /// Possible locations where both houses can place the digit.
        cells: Vec<usize>,
        /// Digit confined to the intersection.
        digit: u8,
    },
    /// A classic proof that applies to the current rules.
    Classic {
        /// The same proof used by the classic engine.
        proof: Box<HintEvidence>,
        /// Cells where a uniqueness argument can exchange digits.
        ///
        /// The scope of every extra rule excludes these cells. The core proof
        /// accounts for the rows, columns, and boxes. Empty without a swap.
        #[cfg_attr(feature = "wasm-api", serde(rename = "swapCells"))]
        swap_cells: Vec<usize>,
    },
}

/// A rule-based proof and the actions it justifies.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantDeduction {
    /// Technique that produced the move.
    pub technique: VariantTechnique,
    /// Facts needed to explain the move.
    pub evidence: VariantEvidence,
    /// Complete set of placements or candidate removals.
    pub actions: Vec<HintAction>,
}

/// A versioned rating for one ordered solve path through a structured puzzle.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantRating {
    /// Ordered technique IDs used by the solver.
    pub technique_order: Vec<VariantTechnique>,
    /// Region layout in effect for the rating.
    pub regions: RegionLayout,
    /// Additional rules in effect for the rating.
    pub rules: Vec<PuzzleRule>,
    /// Scoring rules used for the rating.
    pub scoring_version: u32,
    /// Sum of the costs of applied deductions. A stalled path records a partial score.
    pub points: u32,
    /// Number of moves made with each technique.
    pub counts: BTreeMap<VariantTechnique, u32>,
    /// Hardest applied technique by difficulty, cost and catalog order.
    pub hardest: Option<VariantTechnique>,
    /// Whether the path solved the grid or stalled.
    pub status: SolveStatus,
}

/// A complete or stalled logical solve with the proofs and score for its path.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantTrace {
    start: VariantPosition,
    /// Resulting position after the last deduction.
    pub end: VariantPosition,
    /// Deductions in application order.
    pub steps: Vec<VariantDeduction>,
    /// Versioned score for the path.
    pub rating: VariantRating,
}

/// One step of a variant trace with its context.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantReplay<'a> {
    /// Position before the move.
    pub before: VariantPosition,
    /// Deduction and evidence.
    pub deduction: &'a VariantDeduction,
    /// Position after the move.
    pub after: VariantPosition,
}

impl VariantTrace {
    /// Return the position before the first move explained by this technique.
    pub fn practice_position(&self, technique: VariantTechnique) -> Option<VariantPosition> {
        let index = self
            .steps
            .iter()
            .position(|step| step.technique == technique)?;
        self.replay_step(index).map(|step| step.before)
    }

    /// Replay the position at a zero-based step index.
    pub fn replay_step(&self, index: usize) -> Option<VariantReplay<'_>> {
        let deduction = self.steps.get(index)?;
        let mut before = self.start.clone();
        for step in &self.steps[..index] {
            before.record_actions(&step.actions);
        }
        let mut after = before.clone();
        after.record_actions(&deduction.actions);
        Some(VariantReplay {
            before,
            deduction,
            after,
        })
    }
}

/// A variant solve request failed definition or position validation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VariantLogicalError {
    /// The puzzle definition contains an invalid rule or layout.
    Definition(VariantDefinitionError),
    /// The starting position violates the rules or contains invalid removal masks.
    Position(VariantPositionError),
}

impl VariantPosition {
    /// Follow an ordered list of techniques and collect its deduction trace.
    ///
    /// An empty order enables no techniques. All puzzle rules apply to position
    /// validation, regardless of which techniques can explain a deduction.
    pub fn solve_logically(
        &self,
        order: &[VariantTechnique],
    ) -> Result<VariantTrace, VariantLogicalError> {
        let mut steps = Vec::new();
        let (end, rating) = self.logical_run(order, |step| steps.push(step))?;
        Ok(VariantTrace {
            start: self.clone(),
            end,
            steps,
            rating,
        })
    }

    /// Rate the logical path without retaining its proof trace.
    pub fn rate(&self, order: &[VariantTechnique]) -> Result<VariantRating, VariantLogicalError> {
        self.logical_run(order, |_| {}).map(|(_, rating)| rating)
    }

    fn logical_run(
        &self,
        order: &[VariantTechnique],
        receive: impl FnMut(VariantDeduction),
    ) -> Result<(Self, VariantRating), VariantLogicalError> {
        let compiled = self
            .puzzle
            .compile()
            .map_err(VariantLogicalError::Definition)?;
        self.run_with_compiled(&compiled, order, receive)
    }

    pub(super) fn run_with_compiled(
        &self,
        compiled: &CompiledVariant,
        order: &[VariantTechnique],
        mut receive: impl FnMut(VariantDeduction),
    ) -> Result<(Self, VariantRating), VariantLogicalError> {
        let mut position = compiled
            .proof_position(&self.entries, &self.eliminations)
            .map_err(VariantLogicalError::Position)?;
        let mut end = self.clone();
        let mut rating = VariantRating {
            technique_order: order.to_vec(),
            regions: self.puzzle.regions.clone(),
            rules: self.puzzle.rules.clone(),
            scoring_version: VARIANT_SCORING_VERSION,
            points: 0,
            counts: BTreeMap::new(),
            hardest: None,
            status: SolveStatus::Stalled,
        };
        loop {
            if !position.board.contains(&0) {
                compiled
                    .prepare(&end.entries, &end.eliminations)
                    .map_err(VariantLogicalError::Position)?;
                let floor = rating
                    .hardest
                    .map_or(Difficulty::Easy, VariantTechnique::difficulty);
                rating.status =
                    SolveStatus::Solved(floor.max(Difficulty::from_score(rating.points)));
                break;
            }
            let Some(step) = order
                .iter()
                .find_map(|&technique| compiled.explain(&position, technique).into_iter().next())
            else {
                break;
            };
            let technique = step.technique;
            *rating.counts.entry(technique).or_default() += 1;
            rating.points += u32::from(technique.cost());
            let rank =
                |technique: VariantTechnique| (technique.difficulty(), technique.cost(), technique);
            if rating
                .hardest
                .is_none_or(|current| rank(technique) > rank(current))
            {
                rating.hardest = Some(technique);
            }
            for action in &step.actions {
                if let HintAction::Place(candidate) = action {
                    position.board[candidate.cell] = candidate.digit;
                }
            }
            end.record_actions(&step.actions);
            position = compiled.house_position(position.board, &end.eliminations);
            receive(step);
        }
        Ok((end, rating))
    }
}

impl VariantDeduction {
    fn rank(&self) -> (Difficulty, u16, usize, VariantTechnique, HintAction) {
        let cells = match &self.evidence {
            VariantEvidence::Single { .. } => 1,
            VariantEvidence::CageSum { cells, .. }
            | VariantEvidence::Constraint { cells, .. }
            | VariantEvidence::Intersection { cells, .. } => cells.len(),
            VariantEvidence::Classic { proof, .. } => proof.pattern_size(),
        };
        (
            self.technique.difficulty(),
            self.technique.cost(),
            cells,
            self.technique,
            self.actions[0],
        )
    }
}

pub(super) struct ProofPosition {
    board: Board,
    pub masks: [u16; CELLS],
    uniqueness: OnceCell<bool>,
}

impl ProofPosition {
    fn domain(&self, cell: usize) -> u16 {
        match self.board[cell] {
            0 => self.masks[cell],
            digit => digit_bit(digit),
        }
    }

    fn removals(
        &self,
        cells: &[usize],
        supported: impl IntoIterator<Item = u16>,
    ) -> Vec<HintAction> {
        let mut actions = Vec::new();
        for (&cell, mask) in cells.iter().zip(supported) {
            actions.extend(
                digits(self.masks[cell] & !mask)
                    .map(|digit| HintAction::Eliminate(Candidate { cell, digit })),
            );
        }
        actions.sort_unstable();
        actions
    }

    fn explain_constraint(
        &self,
        technique: VariantTechnique,
        rules: &[usize],
        cells: &[usize],
        supported: impl Iterator<Item = u16> + Clone,
    ) -> Option<VariantDeduction> {
        if supported.clone().any(|mask| mask == 0) {
            return None;
        }
        let actions = self.removals(cells, supported);
        (!actions.is_empty()).then(|| VariantDeduction {
            technique,
            actions,
            evidence: VariantEvidence::Constraint {
                rules: rules.to_vec(),
                cells: cells.to_vec(),
                domains: cells.iter().map(|&cell| self.domain(cell)).collect(),
            },
        })
    }
}

impl CompiledVariant {
    pub(super) fn has_exclusive_opening(&self, selected: VariantTechnique) -> bool {
        let Ok(position) = self.proof_position(&[0; CELLS], &[0; CELLS]) else {
            return false;
        };
        !self.explain(&position, selected).is_empty()
            && VariantTechnique::all()
                .filter(|&technique| technique != selected)
                .all(|technique| self.explain(&position, technique).is_empty())
    }

    /// Check a submitted practice action against every proof of the selected technique.
    pub fn check_practice_move(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        technique: VariantTechnique,
        action: HintAction,
    ) -> Result<Option<VariantDeduction>, VariantPositionError> {
        Ok(self
            .deductions(entries, eliminations, technique)?
            .into_iter()
            .find(|proof| proof.actions.contains(&action)))
    }

    /// Find all moves explained by a given technique at this position.
    ///
    /// The technique uses house candidates and the recorded removals. Only the selected
    /// technique's constraints justify its actions. No completions are searched for proofs.
    pub fn deductions(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        technique: VariantTechnique,
    ) -> Result<Vec<VariantDeduction>, VariantPositionError> {
        let position = self.proof_position(entries, eliminations)?;
        Ok(self.explain(&position, technique))
    }

    /// Return up to the requested number of distinct moves, easiest first.
    ///
    /// The enabled techniques restrict which proofs can be returned.
    pub fn ranked_hints(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        enabled: &[VariantTechnique],
        limit: usize,
    ) -> Result<Vec<VariantDeduction>, VariantPositionError> {
        let position = self.proof_position(entries, eliminations)?;
        if limit == 0 {
            return Ok(Vec::new());
        }
        let mut techniques = enabled.to_vec();
        let tier = |technique: &VariantTechnique| (technique.difficulty(), technique.cost());
        techniques.sort_by_key(tier);
        let mut moves = Vec::<VariantDeduction>::new();
        for group in techniques.chunk_by(|a, b| tier(a) == tier(b)) {
            let mut hints: Vec<_> = group
                .iter()
                .flat_map(|&technique| self.explain(&position, technique))
                .collect();
            hints.sort_by_cached_key(VariantDeduction::rank);
            for hint in hints {
                if moves.iter().all(|other| other.actions != hint.actions) {
                    moves.push(hint);
                    if moves.len() == limit {
                        return Ok(moves);
                    }
                }
            }
        }
        Ok(moves)
    }

    pub(super) fn proof_position(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
    ) -> Result<ProofPosition, VariantPositionError> {
        let constrained = self.prepare(entries, eliminations)?;
        let board = constrained.board;
        if board
            .iter()
            .zip(constrained.masks)
            .any(|(&digit, mask)| digit == 0 && mask == 0)
        {
            return Err(VariantPositionError::Puzzle(Analysis::Unsolvable));
        }

        Ok(self.house_position(board, eliminations))
    }

    fn house_position(&self, board: Board, eliminations: &[u16; CELLS]) -> ProofPosition {
        let mut masks = std::array::from_fn(|cell| {
            if board[cell] == 0 {
                DIGITS & !eliminations[cell]
            } else {
                0
            }
        });
        // Start with the rules of houses. Cage sums and other local constraints
        // must explain their own removals to contribute to the logical trace.
        for house in &self.houses {
            let used = house
                .cells
                .iter()
                .map(|&cell| board[cell])
                .filter(|&digit| digit != 0)
                .fold(0, |mask, digit| mask | digit_bit(digit));
            for &cell in &house.cells {
                masks[cell] &= !used;
            }
        }
        ProofPosition {
            board,
            masks,
            uniqueness: OnceCell::new(),
        }
    }

    pub(super) fn explain(
        &self,
        position: &ProofPosition,
        technique: VariantTechnique,
    ) -> Vec<VariantDeduction> {
        use VariantTechnique::*;
        let mut proofs = Vec::new();
        let mut place = |cell, digit, house| {
            let candidate = Candidate { cell, digit };
            proofs.push(VariantDeduction {
                technique,
                evidence: VariantEvidence::Single { candidate, house },
                actions: vec![HintAction::Place(candidate)],
            });
        };
        match technique {
            NakedSingle => {
                for (cell, &mask) in position.masks.iter().enumerate() {
                    if mask.count_ones() == 1 {
                        place(cell, digits(mask).next().unwrap(), None);
                    }
                }
            }
            FullHouse | HiddenSingle => {
                for house in &self.houses {
                    if technique == FullHouse
                        && house
                            .cells
                            .iter()
                            .filter(|&&cell| position.board[cell] == 0)
                            .count()
                            != 1
                    {
                        continue;
                    }
                    for digit in 1..=9 {
                        let bit = digit_bit(digit);
                        let mut locations = house
                            .cells
                            .iter()
                            .copied()
                            .filter(|&cell| position.masks[cell] & bit != 0);
                        if let Some(cell) = locations.next()
                            && locations.next().is_none()
                        {
                            place(cell, digit, Some(house.kind));
                        }
                    }
                }
            }
            CageCombinations => {
                for cage in &self.cages {
                    let domains: Vec<_> = cage
                        .cells
                        .iter()
                        .map(|&cell| position.domain(cell))
                        .collect();
                    let support = cage.support(&domains);
                    if let Some(proof) = cage_proof(
                        position,
                        cage.cells.clone(),
                        domains,
                        &support,
                        cage.sum,
                        None,
                        vec![cage.reference],
                    ) {
                        proofs.push(proof);
                    }
                }
            }
            CageHouseSum => self.cage_house_sums(position, &mut proofs),
            LockedCandidates => self.locked_candidates(position, &mut proofs),
            Classic(classic) => self.classic_proofs(position, classic, &mut proofs),
            Parity => {
                proofs.extend(self.parity_clues.iter().filter_map(|clue| {
                    position.explain_constraint(
                        technique,
                        &[clue.rule],
                        &[clue.cell],
                        std::iter::once(position.domain(clue.cell) & clue.allowed),
                    )
                }));
            }
            AntiKing | AntiKnight | Clone | Inequality | Kropki | NonConsecutive | Palindrome
            | Thermometer | Whispers | Xv => {
                let domains = std::array::from_fn(|cell| position.domain(cell));
                for clue in self
                    .pair_clues
                    .iter()
                    .filter(|clue| clue.source.id == technique.id())
                {
                    let mut supported = domains;
                    clue.restrict(&mut supported);
                    if let Some(proof) = position.explain_constraint(
                        technique,
                        &clue.source.indices,
                        &clue.cells,
                        clue.cells.iter().map(|&cell| supported[cell]),
                    ) {
                        proofs.push(proof);
                    }
                }
            }
            Arrow | Between | LittleKiller | RegionSum | Renban | Sandwich | Skyscrapers | XSum => {
                for line in self
                    .lines
                    .iter()
                    .filter(|line| line.rule_id == technique.id())
                {
                    let len = line.cells.len();
                    let mut domains = [0; CELLS];
                    for (slot, &cell) in domains.iter_mut().zip(&line.cells) {
                        *slot = position.domain(cell);
                    }
                    let mut supported = [0; CELLS];
                    line.support(&domains[..len], &mut supported[..len]);
                    if let Some(proof) = position.explain_constraint(
                        technique,
                        &[line.rule_index],
                        &line.cells,
                        supported[..len].iter().copied(),
                    ) {
                        proofs.push(proof);
                    }
                }
            }
        }
        proofs
    }

    /// Whether the technique's house assumptions hold for this puzzle.
    ///
    /// Uniqueness-dependent techniques also check the proposed swap and verify
    /// uniqueness before returning an individual deduction.
    pub fn supports_technique(&self, technique: VariantTechnique) -> bool {
        match technique {
            VariantTechnique::Classic(
                Technique::XWing | Technique::Swordfish | Technique::Jellyfish,
            ) => true,
            VariantTechnique::Classic(_) => self.classic_boxes,
            _ => true,
        }
    }

    fn classic_proofs(
        &self,
        position: &ProofPosition,
        technique: Technique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let variant = VariantTechnique::Classic(technique);
        if !self.supports_technique(variant) {
            return;
        }
        let search = DeductionSearch::new(&position.board, &position.masks);
        for hint in search.hints(technique) {
            let swap_cells = if technique.requires_unique_solution() {
                let cells = match &hint.evidence {
                    HintEvidence::UniqueRectangle { corners, .. } => corners.to_vec(),
                    HintEvidence::BugPlusOne { .. } => position
                        .board
                        .iter()
                        .enumerate()
                        .filter_map(|(cell, &digit)| (digit == 0).then_some(cell))
                        .collect(),
                    _ => continue,
                };
                if cells
                    .iter()
                    .any(|&cell| self.extra_rule_cells & (1u128 << cell) != 0)
                    || !*position.uniqueness.get_or_init(|| {
                        self.analyze(&position.board, &[0; CELLS], UNIQUENESS_PROBE_NODES)
                            == Ok(Analysis::Unique)
                    })
                {
                    continue;
                }
                cells
            } else {
                Vec::new()
            };
            let mut actions = hint.actions;
            actions.sort_unstable();
            proofs.push(VariantDeduction {
                technique: variant,
                actions,
                evidence: VariantEvidence::Classic {
                    proof: Box::new(hint.evidence),
                    swap_cells,
                },
            });
        }
    }

    fn locked_candidates(&self, position: &ProofPosition, proofs: &mut Vec<VariantDeduction>) {
        for (source, &source_mask) in self.houses.iter().zip(&self.house_masks) {
            let mut locations = [0u128; 9];
            for &cell in &source.cells {
                for digit in digits(position.masks[cell]) {
                    locations[usize::from(digit - 1)] |= 1 << cell;
                }
            }
            for (target, &target_mask) in self.houses.iter().zip(&self.house_masks) {
                let shared = source_mask & target_mask;
                if shared.count_ones() < 2 || source_mask == target_mask {
                    continue;
                }
                for (index, &cells) in locations.iter().enumerate() {
                    if cells.count_ones() < 2 || cells & !shared != 0 {
                        continue;
                    }
                    let digit = index as u8 + 1;
                    let actions: Vec<_> = cells_in(target_mask & !shared)
                        .filter(|&cell| position.masks[cell] & digit_bit(digit) != 0)
                        .map(|cell| HintAction::Eliminate(Candidate { cell, digit }))
                        .collect();
                    if !actions.is_empty() {
                        proofs.push(VariantDeduction {
                            technique: VariantTechnique::LockedCandidates,
                            evidence: VariantEvidence::Intersection {
                                source: source.kind,
                                target: target.kind,
                                cells: cells_in(cells).collect(),
                                digit,
                            },
                            actions,
                        });
                    }
                }
            }
        }
    }

    fn cage_house_sums(&self, position: &ProofPosition, proofs: &mut Vec<VariantDeduction>) {
        let cage_masks: Vec<_> = self
            .cages
            .iter()
            .map(|cage| cell_mask(&cage.cells).unwrap())
            .collect();
        for (house, &house_mask) in self.houses.iter().zip(&self.house_masks) {
            let mut interior = house_mask;
            let mut interior_total = 45;
            let mut refs_inside = Vec::new();
            let mut covered = 0;
            let mut covering_total = 0;
            let mut refs_covering = Vec::new();
            for (cage, &mask) in self.cages.iter().zip(&cage_masks) {
                if mask & house_mask == 0 {
                    continue;
                }
                if mask & !house_mask == 0 {
                    interior &= !mask;
                    interior_total -= i32::from(cage.sum);
                    refs_inside.push(cage.reference);
                }
                covered |= mask;
                covering_total += i32::from(cage.sum);
                refs_covering.push(cage.reference);
            }
            let outside = covered & !house_mask;
            let innies = (interior, interior_total, refs_inside, true);
            let outies = (outside, covering_total - 45, refs_covering, false);
            for (residue, sum, cages, inside) in [innies, outies] {
                if cages.is_empty()
                    || !(1..=9).contains(&residue.count_ones())
                    || !(1..=81).contains(&sum)
                    || !inside && covered & house_mask != house_mask
                {
                    continue;
                }
                let cells: Vec<_> = cells_in(residue).collect();
                let domains: Vec<_> = cells.iter().map(|&cell| position.domain(cell)).collect();
                let mut support = [0; 9];
                let sum = sum as u16;
                if inside {
                    for set in (1..=DIGITS).filter(|&set| {
                        set.count_ones() as usize == cells.len() && digit_sum(set) == sum
                    }) {
                        super::search::record_support(
                            set,
                            &domains,
                            &mut support,
                            &mut [None; 512],
                        );
                    }
                } else {
                    super::lines::sum_support(&domains, 1 << sum, &mut support);
                }
                if let Some(proof) = cage_proof(
                    position,
                    cells,
                    domains,
                    &support,
                    sum,
                    Some(house.kind),
                    cages,
                ) {
                    proofs.push(proof);
                }
            }
        }
    }
}

fn cage_proof(
    position: &ProofPosition,
    cells: Vec<usize>,
    domains: Vec<u16>,
    support: &[u16],
    sum: u16,
    house: Option<VariantHouseKind>,
    cages: Vec<[usize; 2]>,
) -> Option<VariantDeduction> {
    if support[0] == 0 {
        return None;
    }
    let actions = position.removals(&cells, support.iter().copied());
    if actions.is_empty() {
        return None;
    }
    Some(VariantDeduction {
        technique: if house.is_some() {
            VariantTechnique::CageHouseSum
        } else {
            VariantTechnique::CageCombinations
        },
        evidence: VariantEvidence::CageSum {
            house,
            cages,
            sum,
            cells,
            domains,
        },
        actions,
    })
}
