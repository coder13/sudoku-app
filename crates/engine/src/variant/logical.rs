use std::{
    cell::{OnceCell, RefCell, RefMut},
    collections::BTreeMap,
    ops::ControlFlow,
};

use super::{
    CompiledVariant, PuzzleRule, RegionLayout, VariantDefinitionError, VariantHouseKind,
    VariantPosition, VariantPositionError, cell_mask, cells_in, digit_sum,
};
use crate::{
    Analysis, Board, CELLS, Candidate, DIGITS, Difficulty, HintAction, HintEvidence, SolveStatus,
    Technique,
    hints::{Deduction, DeductionSearch, OverlaySearch, RectangleInferenceCache, digit_bit, digits},
};

#[cfg(test)]
#[path = "logical_tests.rs"]
mod tests;

/// Version of the point costs and difficulty thresholds for structured puzzles.
pub const VARIANT_SCORING_VERSION: u32 = 8;
const UNIQUENESS_PROBE_NODES: u32 = 4096;
const COMPLETION_PROBE_NODES: u32 = 512;
const ALTERNATIVE_WITNESS_NODES: u32 = 4096;

mod exclusions;
mod pruning;
mod line_houses;

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
    /// A house places a digit in two adjacent cells, excluding neighboring digits there.
    NonConsecutiveLockedPair: "non-consecutive-locked-candidates-2", 20, Easy;
    /// Apply a sum relation from XV marks.
    Xv: "xv", 20, Easy;
    /// Apply a declared total between two edge-sharing cells.
    AdjacentTotal: "adjacent-total", 20, Easy;
    /// Match candidates at mirrored positions on a line.
    Palindrome: "palindrome", 21, Easy;
    /// Two consecutive candidates in one cell exclude both digits from its neighbors.
    NonConsecutiveBivalue: "non-consecutive-bivalue", 22, Easy;
    /// Bound the interior of a line using the two endpoint digits.
    Between: "between", 23, Easy;
    /// A house confines a digit to alternatives spanning three cells with a target.
    NonConsecutiveLockedTriple: "non-consecutive-locked-candidates-3", 24, Easy;
    /// Candidates spanning three consecutive digits exclude their middle digit nearby.
    NonConsecutiveTrivalue: "non-consecutive-trivalue", 24, Easy;
    /// Fit low, middle and high digits into a 2 × 2 area.
    GlobalEntropy: "global-entropy", 24, Easy;
    /// Find increasing assignments along a thermometer.
    Thermometer: "thermometer", 26, Easy;
    /// Require every printed digit occurrence in the four cells touching a circle.
    Quadruple: "quadruple", 27, Medium;
    /// Find possible digit differences along a Whispers line.
    Whispers: "whispers", 27, Medium;
    /// Apply the repeating low, medium and high groups along an Entropic line.
    Entropic: "entropic", 27, Medium;
    /// Apply the repeating remainder groups along a Modular line.
    Modular: "modular", 27, Medium;
    /// Remove digits that cannot be assigned to the cells of a Killer cage.
    CageCombinations: "cage-combinations", 34, Easy;
    /// Find assignments whose path digits add to the digit in the circle.
    Arrow: "arrow", 36, Easy;
    /// Check a Whispers line together with the houses shared by its cells.
    WhispersHouseSupport: "whispers-house-support", 39, Medium;
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

/// A clue and its source rules recorded in a variant proof.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantClueScope {
    /// Indices of the original puzzle rules for this clue.
    pub rules: Vec<usize>,
    /// Cells in the clue's compiled order.
    pub cells: Vec<usize>,
}

/// An exhaustive set of alternatives used to exclude another candidate.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize), serde(tag = "type", rename_all = "kebab-case"))]
pub enum VariantExclusionPremise {
    /// One of the listed candidates must occupy this empty cell.
    Cell {
        /// Cell whose candidates form the alternatives.
        cell: usize,
        /// Complete candidate mask before the deduction.
        domain: u16,
    },
    /// A house must place this digit in one of the listed empty cells.
    House {
        /// House that requires the digit.
        house: VariantHouseKind,
        /// Digit to place somewhere in the house.
        digit: u8,
        /// Complete list of candidate locations for the digit in this house.
        cells: Vec<usize>,
    },
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
    /// Complete line assignments respecting explicit shared houses.
    /// Box the rare payload so other deductions retain their compact layout.
    LineHouses(Box<VariantLineHouseProof>),
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
    /// A clue requires a digit somewhere in the intersecting house.
    LockedDigit {
        /// Clue establishing that the digit occurs in the house.
        clue: VariantClueScope,
        /// House whose other cells lose the digit.
        target: VariantHouseKind,
        /// Possible locations for the digit in the house and clue.
        cells: Vec<usize>,
        /// Candidate masks for the clue's cells, including placed digits.
        domains: Vec<u16>,
        /// Required digit.
        digit: u8,
    },
    /// Every alternative conflicts with every removed candidate.
    Exclusion {
        /// Cell candidates or house locations, at least one of which must be true.
        premise: VariantExclusionPremise,
        /// Indices of the binary rules used by the conflicts.
        rules: Vec<usize>,
        /// Houses needed to exclude equal digits in different cells.
        houses: Vec<VariantHouseKind>,
    },
    /// A classic proof that applies to the current rules.
    Classic {
        /// Proof expressed in the shared classic and variant hint format.
        proof: Box<HintEvidence>,
        /// Cells where a uniqueness argument can exchange digits.
        ///
        /// The scope of every extra rule excludes these cells. The core proof
        /// accounts for the rows, columns, and boxes. Empty without a swap.
        #[cfg_attr(feature = "wasm-api", serde(rename = "swapCells"))]
        swap_cells: Vec<usize>,
    },
}

/// Replayable support for a binary line and its shared houses.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantLineHouseProof {
    /// Ordered rule indices supplying the line's binary relations.
    pub rules: Vec<usize>,
    /// Distinct line cells in first-visit order.
    pub cells: Vec<usize>,
    /// Current candidate masks, including placed digits.
    pub domains: Vec<u16>,
    /// Candidates occurring in at least one valid complete line assignment.
    pub supported: Vec<u16>,
    /// Shared houses forbidding equal digits in line cells.
    pub houses: Vec<VariantHouseKind>,
    /// Number of valid assignments in the complete enumeration.
    pub assignments: u32,
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
                rating.status = SolveStatus::Solved(floor);
                break;
            }
            let Some(step) = order
                .iter()
                .find_map(|&technique| compiled.first_proof(&position, technique))
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
            VariantEvidence::LineHouses(proof) => proof.cells.len(),
            VariantEvidence::LockedDigit { clue, .. } => clue.cells.len(),
            VariantEvidence::Exclusion { premise, .. } => {
                let mut cells = match premise {
                    VariantExclusionPremise::Cell { cell, .. } => vec![*cell],
                    VariantExclusionPremise::House { cells, .. } => cells.clone(),
                };
                cells.extend(self.actions.iter().map(|action| action.candidate().cell));
                cells.sort_unstable();
                cells.dedup();
                cells.len()
            }
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

pub(super) struct ProofPosition<'a> {
    board: Board,
    pub masks: [u16; CELLS],
    uniqueness: OnceCell<bool>,
    rectangle_inference: RectangleInferenceCache,
    overlay: OnceCell<Box<RefCell<OverlaySearch<'a>>>>,
}

impl ProofPosition<'_> {
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

fn overlay_proof(step: Deduction) -> VariantDeduction {
    let crate::Hint {
        technique,
        evidence,
        mut actions,
    } = step.into();
    actions.sort_unstable();
    VariantDeduction {
        technique: VariantTechnique::Classic(technique),
        actions,
        evidence: VariantEvidence::Classic {
            proof: Box::new(evidence),
            swap_cells: Vec::new(),
        },
    }
}

impl CompiledVariant {
    #[cfg(any(feature = "generation", test))]
    pub(super) fn has_exclusive_opening(&self, selected: VariantTechnique) -> bool {
        let Ok(position) = self.proof_position(&[0; CELLS], &[0; CELLS]) else {
            return false;
        };
        self.first_proof(&position, selected).is_some()
            && VariantTechnique::all()
                .filter(|&technique| technique != selected)
                .all(|technique| self.first_proof(&position, technique).is_none())
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

    /// Prefer the easiest enabled move that unlocks singles, within the puzzle's tier.
    #[cfg(any(
        test,
        all(feature = "wasm-api", any(target_arch = "wasm32", feature = "cli"))
    ))]
    pub(crate) fn useful_hints(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
        enabled: &[VariantTechnique],
        limit: usize,
        difficulty: Difficulty,
    ) -> Result<Vec<VariantDeduction>, VariantPositionError> {
        let position = self.proof_position(entries, eliminations)?;
        if limit == 0 || !position.board.contains(&0) {
            return Ok(Vec::new());
        }
        let mut techniques = enabled.to_vec();
        let tier = |t: &VariantTechnique| (t.difficulty(), t.cost());
        techniques.sort_by_key(tier);
        let baseline = self.single_progress(position.board, *eliminations);
        let mut probes: Vec<(VariantDeduction, usize)> = Vec::new();
        for group in techniques.chunk_by(|a, b| tier(a) == tier(b)) {
            if probes.len() >= 512 || (group[0].difficulty() > difficulty && !probes.is_empty()) {
                break;
            }
            let mut hints: Vec<_> = group
                .iter()
                .flat_map(|&t| self.explain(&position, t))
                .collect();
            hints.sort_by_cached_key(VariantDeduction::rank);
            let mut useful = false;
            let mut count = 0;
            for hint in hints {
                if probes
                    .iter()
                    .any(|(other, _)| other.actions == hint.actions)
                {
                    continue;
                }
                let placements = hint
                    .actions
                    .iter()
                    .filter(|a| matches!(a, HintAction::Place(_)))
                    .count();
                let mut board = position.board;
                let mut removals = *eliminations;
                crate::position::record_actions(&mut board, &mut removals, &hint.actions);
                let progress = placements + self.single_progress(board, removals);
                let gain = progress.saturating_sub(baseline);
                useful |= placements > 0 || gain > 0;
                probes.push((
                    hint,
                    if placements > 0 {
                        progress.max(1)
                    } else {
                        gain
                    },
                ));
                count += 1;
                if count == 64 || probes.len() == 512 {
                    break;
                }
            }
            if useful {
                break;
            }
        }
        probes.sort_by_cached_key(|(hint, gain)| {
            (
                *gain == 0,
                tier(&hint.technique),
                std::cmp::Reverse(*gain),
                hint.rank(),
            )
        });
        let mut choices: Vec<VariantDeduction> =
            probes.into_iter().map(|(h, _)| h).take(limit).collect();
        if choices.len() < limit {
            for hint in self.ranked_hints(entries, eliminations, enabled, limit)? {
                if choices.iter().all(|other| other.actions != hint.actions) {
                    choices.push(hint);
                    if choices.len() == limit {
                        break;
                    }
                }
            }
        }
        Ok(choices)
    }

    #[cfg(any(
        test,
        all(feature = "wasm-api", any(target_arch = "wasm32", feature = "cli"))
    ))]
    fn single_progress(&self, mut board: Board, mut removals: [u16; CELLS]) -> usize {
        let mut placed = 0;
        while board.contains(&0) {
            let position = self.house_position(board, &removals);
            let Some(step) = [
                VariantTechnique::NakedSingle,
                VariantTechnique::HiddenSingle,
            ]
            .into_iter()
            .find_map(|t| self.explain(&position, t).into_iter().next()) else {
                break;
            };
            crate::position::record_actions(&mut board, &mut removals, &step.actions);
            placed += 1;
        }
        placed
    }

    pub(super) fn proof_position(
        &self,
        entries: &Board,
        eliminations: &[u16; CELLS],
    ) -> Result<ProofPosition<'_>, VariantPositionError> {
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

    fn house_position(&self, board: Board, eliminations: &[u16; CELLS]) -> ProofPosition<'_> {
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
            rectangle_inference: RectangleInferenceCache::default(),
            overlay: OnceCell::new(),
        }
    }

    fn first_proof<'a>(
        &'a self,
        position: &ProofPosition<'a>,
        technique: VariantTechnique,
    ) -> Option<VariantDeduction> {
        if let VariantTechnique::Classic(classic) = technique
            && classic.pattern_overlay_width().is_some()
        {
            self.overlay_search(position)
                .visit(classic, &mut ControlFlow::Break)
                .break_value()
                .map(overlay_proof)
        } else {
            self.explain(position, technique).into_iter().next()
        }
    }

    fn overlay_search<'a, 'p>(
        &'a self,
        position: &'p ProofPosition<'a>,
    ) -> RefMut<'p, OverlaySearch<'a>> {
        position
            .overlay
            .get_or_init(|| {
                Box::new(RefCell::new(OverlaySearch::for_variant(
                    &position.board,
                    &position.masks,
                    &self.house_masks,
                    &self.peers,
                    self.classic_boxes,
                )))
            })
            .borrow_mut()
    }

    pub(super) fn explain<'a>(
        &'a self,
        position: &ProofPosition<'a>,
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
            GlobalEntropy => {
                for (rule, cells) in self.entropy_windows() {
                    let domains = cells.map(|cell| position.domain(cell));
                    if let Some(proof) = position.explain_constraint(
                        technique, &[rule], &cells,
                        super::global_entropy::support(domains).into_iter(),
                    ) {
                        proofs.push(proof);
                    }
                }
            }
            Quadruple => {
                for clue in &self.quadruples {
                    let domains = clue.cells.map(|cell| position.domain(cell));
                    if let Some(proof) = position.explain_constraint(
                        technique,
                        &[clue.rule_index],
                        &clue.cells,
                        clue.support(domains).into_iter(),
                    ) {
                        proofs.push(proof);
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
            LockedCandidates => {
                self.locked_candidates(position, &mut proofs);
                self.quadruple_locks(position, &mut proofs);
            }
            NonConsecutiveLockedPair | NonConsecutiveLockedTriple
            | NonConsecutiveBivalue | NonConsecutiveTrivalue => {
                self.nonconsecutive_exclusions(position, technique, &mut proofs);
            }
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
            | Thermometer | Whispers | Xv | AdjacentTotal => {
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
            WhispersHouseSupport => self.whispers_house_proofs(position, &mut proofs),
            Arrow | Between | Entropic | Modular | LittleKiller | RegionSum | Renban | Sandwich | Skyscrapers | XSum => {
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
    /// Uniqueness-dependent techniques check each proposed swap and verify
    /// uniqueness before returning a deduction. Expensive graph searches can
    /// check the same cached uniqueness requirement before searching.
    pub fn supports_technique(&self, technique: VariantTechnique) -> bool {
        match technique {
            VariantTechnique::Classic(classic) if classic.pattern_overlay_width().is_some() => true,
            VariantTechnique::Classic(
                Technique::XWing | Technique::Swordfish | Technique::Jellyfish,
            ) => true,
            VariantTechnique::Classic(_) => self.classic_boxes,
            _ => true,
        }
    }

    fn classic_proofs<'a>(
        &'a self,
        position: &ProofPosition<'a>,
        technique: Technique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let variant = VariantTechnique::Classic(technique);
        if !self.supports_technique(variant) {
            return;
        }
        if self.classic_search_is_empty(position, technique) {
            return;
        }
        if technique.pattern_overlay_width().is_some() {
            let _ = self.overlay_search(position).visit(technique, &mut |step| {
                proofs.push(overlay_proof(step));
                ControlFlow::Continue(())
            });
            return;
        }
        // A completion witnesses the outer assumptions it satisfies. Each
        // remaining contradiction still needs the original logical proof.
        let solution = (technique == Technique::NestedForcingNet)
            .then(|| {
                let eliminations = std::array::from_fn(|cell| {
                    if position.board[cell] == 0 { DIGITS & !position.masks[cell] } else { 0 }
                });
                self.solve(&position.board, &eliminations, COMPLETION_PROBE_NODES).ok()
            })
            .flatten();
        let completion_support = (technique == Technique::NestedForcingNet)
            .then(|| {
                position.overlay.get().and_then(|overlay| {
                    overlay.borrow().known_completion_support().copied()
                })
            })
            .flatten();
        let search = DeductionSearch::with_verified_solution(
            &position.board, &position.masks, solution.as_ref(),
        )
        .with_completion_probes(ALTERNATIVE_WITNESS_NODES)
        .with_completion_support(completion_support.as_ref())
        .with_rectangle_inference(&position.rectangle_inference);
        for hint in search.hints(technique) {
            let swap_cells = if technique.requires_unique_solution() {
                let cells = match &hint.evidence {
                    HintEvidence::UniqueRectangle { corners, .. } => corners.to_vec(),
                    HintEvidence::Inference { links } => {
                        let mut cells: Vec<_> = links
                            .iter()
                            .flat_map(|link| match link.source {
                                crate::LinkSource::UniqueRectangle { corners, .. } => Some(corners),
                                _ => None,
                            })
                            .flatten()
                            .map(usize::from)
                            .collect();
                        cells.sort_unstable();
                        cells.dedup();
                        if cells.is_empty() {
                            continue;
                        }
                        cells
                    }
                    HintEvidence::UniqueLoop { sides, .. } => {
                        let mut cells: Vec<_> = sides.iter().flatten().copied().collect();
                        cells.sort_unstable();
                        cells
                    }
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
                    || !self.uniqueness_is_verified(position)
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

    fn locked_candidates(&self, position: &ProofPosition<'_>, proofs: &mut Vec<VariantDeduction>) {
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

    fn quadruple_locks(&self, position: &ProofPosition<'_>, proofs: &mut Vec<VariantDeduction>) {
        for clue in &self.quadruples {
            let domains = clue.cells.map(|cell| position.domain(cell));
            let supported = clue.support(domains);
            let scope = cell_mask(&clue.cells).unwrap();
            for digit in digits(clue.required_digits()) {
                let bit = digit_bit(digit);
                for (target, &house) in self.houses.iter().zip(&self.house_masks) {
                    let cells: Vec<_> = clue
                        .cells
                        .iter()
                        .zip(supported)
                        .filter_map(|(&cell, mask)| {
                            (house & (1 << cell) != 0 && mask & bit != 0).then_some(cell)
                        })
                        .collect();
                    if cells.len() < 2 {
                        continue;
                    }
                    let actions: Vec<_> = cells_in(house & !scope)
                        .filter(|&cell| position.masks[cell] & bit != 0)
                        .map(|cell| HintAction::Eliminate(Candidate { cell, digit }))
                        .collect();
                    if actions.is_empty() {
                        continue;
                    }
                    let without = std::array::from_fn(|i| {
                        if house & (1 << clue.cells[i]) != 0 {
                            domains[i] & !bit
                        } else {
                            domains[i]
                        }
                    });
                    if clue.has_assignment(without) {
                        continue;
                    }
                    proofs.push(VariantDeduction {
                        technique: VariantTechnique::LockedCandidates,
                        evidence: VariantEvidence::LockedDigit {
                            clue: VariantClueScope {
                                rules: vec![clue.rule_index],
                                cells: clue.cells.to_vec(),
                            },
                            target: target.kind,
                            cells,
                            domains: domains.to_vec(),
                            digit,
                        },
                        actions,
                    });
                }
            }
        }
    }

    fn cage_house_sums(&self, position: &ProofPosition<'_>, proofs: &mut Vec<VariantDeduction>) {
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
    position: &ProofPosition<'_>,
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
