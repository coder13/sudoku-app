use std::ops::ControlFlow;

use super::position::Position;
use super::{Analysis, Board, CELLS, PositionSnapshot, Technique, coordinates, logical};

#[path = "patterns/mod.rs"]
mod patterns;

#[path = "proofs.rs"]
mod proofs;
pub use proofs::{DeductionMatch, DeductionProof, ProofPattern, deductions, deductions_at};

#[path = "subsets.rs"]
mod subsets;

#[cfg(test)]
#[path = "technique_tests.rs"]
mod technique_tests;

/// Default maximum number of ranked hints for play.
pub const DEFAULT_HINT_LIMIT: usize = 10;

/// House and cell indices are zero-based.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum House {
    /// A row, numbered from top to bottom.
    Row(usize),
    /// A column, numbered from left to right.
    Column(usize),
    /// A 3 × 3 box, numbered in row-major order.
    Box(usize),
}

impl House {
    const fn index(self) -> usize {
        match self {
            Self::Row(row) => row,
            Self::Column(column) => 9 + column,
            Self::Box(group) => 18 + group,
        }
    }

    const fn from_index(index: usize) -> Self {
        match index / 9 {
            0 => Self::Row(index),
            1 => Self::Column(index - 9),
            _ => Self::Box(index - 18),
        }
    }

    fn all() -> impl Iterator<Item = Self> {
        (0..27).map(Self::from_index)
    }

    pub(crate) fn at(cell: usize) -> [Self; 3] {
        let (row, column, group) = coordinates(cell);
        [Self::Row(row), Self::Column(column), Self::Box(group)]
    }

    pub(crate) fn cells(self) -> [usize; 9] {
        std::array::from_fn(|offset| match self {
            Self::Row(row) => row * 9 + offset,
            Self::Column(column) => offset * 9 + column,
            Self::Box(group) => (group / 3 * 3 + offset / 3) * 9 + group % 3 * 3 + offset % 3,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize, serde::Deserialize))]
/// One possible digit at a cell.
pub struct Candidate {
    /// Zero-based cell index in row-major order.
    pub cell: usize,
    /// Candidate digit from 1 through 9.
    pub digit: u8,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "kebab-case")
)]
/// An effect established by a deduction.
pub enum HintAction {
    /// Place a digit and update its peers.
    Place(Candidate),
    /// Remove a candidate from an empty cell.
    Eliminate(Candidate),
}

impl HintAction {
    /// Return the cell and digit affected by this action.
    pub const fn candidate(self) -> Candidate {
        match self {
            Self::Place(candidate) | Self::Eliminate(candidate) => candidate,
        }
    }
}

/// The only two positions for a digit in the given house.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct ConjugatePair {
    /// House in which the digit has exactly two possible cells.
    pub house: House,
    /// The two possible cell indices.
    pub cells: [usize; 2],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
/// Sudoku constraint that establishes an inference link.
pub enum LinkSource {
    /// The link follows from the candidates in one cell.
    Cell(usize),
    /// The link follows from the positions of a digit in one house.
    House(House),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
/// Logical relationship between the endpoints of a link.
pub enum LinkStrength {
    /// At least one endpoint must be true.
    Strong,
    /// Both endpoints cannot be true.
    Weak,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// Strong or weak inference between two individual candidates.
pub struct CandidateLink {
    /// Starting candidate.
    pub from: Candidate,
    /// Ending candidate.
    pub to: Candidate,
    /// Constraint that establishes the link.
    pub source: LinkSource,
    /// Logical relationship between the candidates.
    pub strength: LinkStrength,
}

/// A group is true when any of its cells contains the digit.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum InferenceNode {
    /// A single candidate.
    Candidate(Candidate),
    /// At least one of several cells contains the same digit.
    Group {
        /// Digit shared by the grouped candidates.
        digit: u8,
        /// Possible cells for the digit.
        cells: Vec<usize>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// Strong or weak inference between individual or grouped candidates.
pub struct InferenceLink {
    /// Starting proposition.
    pub from: InferenceNode,
    /// Ending proposition.
    pub to: InferenceNode,
    /// Constraint that establishes the link.
    pub source: LinkSource,
    /// Logical relationship between the propositions.
    pub strength: LinkStrength,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// A candidate assumed or inferred to be true or false.
pub struct ForcingLiteral {
    /// Candidate used in the proposition.
    pub candidate: Candidate,
    /// True for a placement and false for a removal.
    pub truth: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
/// Alternatives covered by a forcing proof.
pub enum ForcingScope {
    /// Both truth values of one candidate.
    Candidate(Candidate),
    /// The candidate digits of one cell.
    Cell(usize),
    /// Possible positions for a digit in a house.
    House {
        /// House supplying the alternatives.
        house: House,
        /// Digit under consideration.
        digit: u8,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// A proposition derived from earlier propositions in the branch.
pub struct ForcingInference {
    /// Inferred placement or removal.
    pub effect: ForcingLiteral,
    /// Constraint used to derive the effect.
    pub scope: ForcingScope,
    /// Indices within this branch. Index zero refers to the assumption.
    pub causes: Vec<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
/// Contradiction reached under a branch assumption.
pub enum ForcingConflict {
    /// Indices of two propositions with opposite truth values for one candidate.
    Opposite([usize; 2]),
    /// The propositions leave a constraint with no valid candidate.
    Exhausted {
        /// Constraint that ran out of options.
        scope: ForcingScope,
        /// Indices of the propositions that exhausted the constraint.
        causes: Vec<usize>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// One line of reasoning starting from an assumption.
pub struct ForcingBranch {
    /// Starting proposition.
    pub assumption: ForcingLiteral,
    /// Inferences in dependency order.
    pub steps: Vec<ForcingInference>,
    /// Contradiction reached at the end, if this branch refutes its assumption.
    pub conflict: Option<ForcingConflict>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
/// Why a coloring proof can place or remove candidates.
pub enum ColoringReason {
    /// Either coloring gives the same relevant result.
    BothColors,
    /// Two candidates of one color conflict with each other.
    SameColorConflict([Candidate; 2]),
    /// Assuming a color empties a cell.
    EmptiedCell(usize),
    /// Assuming a color rules out every position for a digit in a house.
    EmptiedHouse {
        /// House that can no longer place the digit.
        house: House,
        /// Digit with no remaining position.
        digit: u8,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
/// Evidence that supplements the rectangle's two shared digits.
pub enum RectangleSupport {
    /// Extra candidates used to avoid the ambiguous rectangle.
    ExtraCandidates(Vec<Candidate>),
    /// A supporting subset using extra digits.
    Subset {
        /// Houses in which the subset holds.
        houses: Vec<House>,
        /// Cells of the supporting subset.
        cells: Vec<usize>,
        /// Digits in the supporting subset.
        digits: Vec<u8>,
    },
    /// Conjugate links on one of the shared digits.
    StrongLinks {
        /// Houses in which the digit is conjugate.
        houses: Vec<House>,
        /// Digit constrained by those links.
        digit: u8,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// Cells in one house whose candidate union contains one more digit than cells.
pub struct AlmostLockedSet {
    /// Cells of the set.
    pub cells: Vec<usize>,
    /// Distinct candidate digits in the set.
    pub digits: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// One Almost Locked Set attached to the root cell of a Death Blossom.
pub struct BlossomPetal {
    /// Root candidate that connects this petal.
    pub digit: u8,
    /// Almost Locked Set activated by that root candidate.
    pub set: AlmostLockedSet,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// One house's supporting subset in a Sue de Coq proof.
pub struct SectorSubset {
    /// The row, column, or box containing the supporting subset.
    pub house: House,
    /// Cells used by the subset.
    pub cells: Vec<usize>,
    /// Candidate digits in the subset.
    pub digits: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// Digits shared along a house used by a multi-sector proof.
pub struct SectorLink {
    /// House connecting the relevant cells.
    pub house: House,
    /// Digits constrained by that house.
    pub digits: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// Cross-line coverage for one base digit in a Junior Exocet proof.
pub struct ExocetCover {
    /// Digit whose occurrences are constrained.
    pub digit: u8,
    /// Cross-line cells used for this digit.
    pub cells: Vec<usize>,
    /// Houses that account for those occurrences.
    pub houses: Vec<House>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// One compatible assignment of digits to Junior Exocet bases and targets.
pub struct ExocetAssignment {
    /// Digits assigned to the two base cells in evidence order.
    pub bases: [u8; 2],
    /// Digits assigned to the two target cells in evidence order.
    pub targets: [u8; 2],
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// Anchor cells, arms, and links of an SK Loop.
pub struct SkLoopProof {
    /// Four anchor cell indices.
    pub anchors: [usize; 4],
    /// Eight groups of cells in loop order.
    pub arms: [Vec<usize>; 8],
    /// Links joining the arms in loop order.
    pub links: [SectorLink; 8],
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
/// Technique-specific facts that establish a deduction. The hint carries the proved actions separately.
pub enum HintEvidence {
    /// One cell contains a single candidate.
    Cell(usize),
    /// A house determines the placement of a digit.
    House(House),
    /// A digit is locked into the overlap of two houses.
    Intersection {
        /// House that confines the digit to the overlap.
        source: House,
        /// House where the remaining occurrences can be removed.
        target: House,
        /// Candidate cells in the intersection.
        cells: Vec<usize>,
    },
    /// Two cells account for two digits in a house.
    Pair {
        /// House in which the pair is constrained.
        house: House,
        /// Cells of the pair.
        cells: [usize; 2],
        /// Digits of the pair.
        digits: [u8; 2],
    },
    /// A naked or hidden subset, possibly shared by two houses.
    Subset {
        /// House containing the subset.
        house: House,
        /// Cells of the subset.
        cells: Vec<usize>,
        /// Digits of the subset.
        digits: Vec<u8>,
        #[cfg_attr(feature = "wasm-api", serde(rename = "lockedIn"))]
        /// Second house containing the subset, for a locked subset.
        locked_in: Option<House>,
    },
    /// A two-by-two fish.
    XWing {
        /// Digit constrained by the fish.
        digit: u8,
        /// Houses supplying the required occurrences.
        bases: [House; 2],
        /// Houses covering those occurrences.
        covers: [House; 2],
    },
    /// A line-based fish, including finned and Sashimi forms.
    Fish {
        /// Digit constrained by the fish.
        digit: u8,
        /// Houses supplying the required occurrences.
        bases: Vec<House>,
        /// Houses covering the body of the fish.
        covers: Vec<House>,
        /// Candidate cells in bases outside the covering houses.
        fins: Vec<usize>,
    },
    /// A Franken or Mutant Fish.
    ComplexFish {
        /// Digit counted in the selected houses.
        digit: u8,
        /// Houses supplying the required occurrences.
        bases: Vec<House>,
        /// Houses covering the required occurrences.
        covers: Vec<House>,
        /// Candidates that count toward more bases than covers.
        fins: Vec<usize>,
    },
    /// An XY-Wing or XYZ-Wing.
    Wing {
        /// Cell sharing one of its candidates with each pincer.
        pivot: usize,
        /// Pincer cells in the order of their matching pivot digits.
        pincers: [usize; 2],
        /// The digits X, Y, and Z. Each pincer contains its matching pivot digit and Z.
        digits: [u8; 3],
    },
    /// A four-cell WXYZ-Wing.
    WxyzWing {
        /// Cells contributing to the pattern.
        cells: [usize; 4],
        /// Candidate digits used across the cells.
        digits: [u8; 4],
        /// Unrestricted digit when the pattern has one.
        unrestricted: Option<u8>,
    },
    /// Two bivalue cells connected through a conjugate pair.
    WWing {
        /// The two bivalue cells.
        wings: [usize; 2],
        /// Conjugate pair that links the wing cells.
        link: ConjugatePair,
        #[cfg_attr(feature = "wasm-api", serde(rename = "linkedDigit"))]
        /// Digit used by the conjugate link.
        linked_digit: u8,
        /// Other digit shared by the wing cells.
        digit: u8,
    },
    /// A single-digit pattern with two conjugate pairs.
    SingleDigitChain {
        /// Digit constrained by the two links.
        digit: u8,
        /// Conjugate pairs joined by the bridge.
        links: [ConjugatePair; 2],
        /// One endpoint from each pair, in the order of the links.
        bridge: [usize; 2],
    },
    /// Box and line candidates that form an Empty Rectangle.
    EmptyRectangle {
        /// Digit constrained by the rectangle.
        digit: u8,
        /// Row containing one arm in the box.
        row: usize,
        /// Column containing the other arm in the box.
        column: usize,
        /// Candidate cells in the box.
        cells: Vec<usize>,
        /// Conjugate pair linking the rectangle to the rest of the grid.
        link: ConjugatePair,
    },
    /// An alternating chain of individual candidates.
    Chain {
        /// Candidate links in proof order.
        links: Vec<CandidateLink>,
    },
    /// An inference chain or loop that can include grouped candidates.
    Inference {
        /// Inferences in proof order.
        links: Vec<InferenceLink>,
    },
    /// Proof that uses two alternating candidate colors.
    Coloring {
        /// Candidate sets for the two colors.
        colors: [Vec<Candidate>; 2],
        /// Inference links supporting the coloring.
        links: Vec<CandidateLink>,
        /// Consequence that proves the placements or removals.
        reason: ColoringReason,
    },
    /// A rectangle using a shared digit pair under the uniqueness assumption.
    UniqueRectangle {
        /// The four corners of the rectangle.
        corners: [usize; 4],
        /// The shared pair of digits.
        digits: [u8; 2],
        /// Additional facts used by this rectangle type.
        support: RectangleSupport,
    },
    /// A mostly bivalue grid with one cell containing three candidates.
    BugPlusOne {
        /// Cell with three candidates.
        cell: usize,
        /// Candidates of the exceptional cell.
        candidates: [u8; 3],
        /// Its row, column, and box.
        houses: [House; 3],
    },
    /// Branches that reach a contradiction or establish a common result.
    Forcing {
        /// A scope supplies exhaustive alternatives. A contradiction needs just one assumption.
        scope: Option<ForcingScope>,
        /// Branches whose inferences justify the result.
        branches: Vec<ForcingBranch>,
    },
    /// Two Almost Locked Sets linked by restricted common digits.
    AlsXz {
        /// The two Almost Locked Sets.
        sets: [AlmostLockedSet; 2],
        /// Restricted common digits linking them.
        links: Vec<u8>,
    },
    /// Several Almost Locked Sets joined in sequence.
    AlsChain {
        /// The sets in chain order.
        sets: Vec<AlmostLockedSet>,
        /// Restricted common digits joining consecutive sets.
        links: Vec<u8>,
    },
    /// A Death Blossom with a root cell and multiple attached sets.
    DeathBlossom {
        /// Root cell whose candidates lead to the petals.
        stem: usize,
        /// Sets linked to the root candidates.
        petals: Vec<BlossomPetal>,
    },
    /// Supporting subsets in a row or column and a box.
    SueDeCoq {
        /// Cells of the shared intersection used in the pattern.
        intersection: Vec<usize>,
        /// Candidate digits covered by the pattern.
        digits: Vec<u8>,
        /// Supporting subset in the row or column.
        line: SectorSubset,
        /// Supporting subset in the box.
        block: SectorSubset,
    },
    /// A Junior Exocet with linked base and target digits.
    Exocet {
        /// The two base cell indices.
        bases: [usize; 2],
        /// The two target cell indices.
        targets: [usize; 2],
        #[cfg_attr(feature = "wasm-api", serde(rename = "crossLines"))]
        /// Houses crossed by the pattern.
        cross_lines: [House; 3],
        /// Covering facts for each base digit.
        covers: Vec<ExocetCover>,
        /// Assignments consistent with the pattern.
        assignments: Vec<ExocetAssignment>,
    },
    /// An SK Loop with eight connected arms.
    SkLoop(Box<SkLoopProof>),
    /// A multi-sector pattern that accounts for digits across several houses.
    MultiSectorLockedSets {
        /// Core cells of the pattern.
        core: Vec<usize>,
        /// Supporting cells outside the core.
        attachments: Vec<usize>,
        /// Links identifying the houses and digits that constrain the pattern.
        links: Vec<SectorLink>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// A logical move and the evidence used to prove it.
pub struct Hint {
    /// Technique used to derive the move.
    pub technique: Technique,
    /// Facts that let a caller explain the move.
    pub evidence: HintEvidence,
    /// Complete set of placements or removals made by this deduction.
    pub actions: Vec<HintAction>,
}

pub(crate) struct Deduction {
    pub(crate) technique: Technique,
    evidence: HintEvidence,
    actions: DeductionActions,
}

enum DeductionActions {
    Placement(HintAction),
    Eliminations(Vec<HintAction>),
}

impl Deduction {
    pub(crate) fn actions(&self) -> &[HintAction] {
        match &self.actions {
            DeductionActions::Placement(action) => std::slice::from_ref(action),
            DeductionActions::Eliminations(actions) => actions,
        }
    }
}

impl From<Deduction> for Hint {
    fn from(step: Deduction) -> Self {
        let actions = match step.actions {
            DeductionActions::Placement(action) => vec![action],
            DeductionActions::Eliminations(actions) => actions,
        };
        Self {
            technique: step.technique,
            evidence: step.evidence,
            actions,
        }
    }
}

impl Hint {
    /// Points charged once when this deduction is applied.
    pub const fn cost(&self) -> u16 {
        self.technique.cost()
    }

    fn pattern_size(&self) -> usize {
        self.evidence.pattern_size()
    }

    fn rank_within_tier(&self) -> (usize, Technique, u32, HintAction) {
        let first = self.actions[0];
        (
            self.pattern_size(),
            // Different techniques record different house evidence. Compare counts
            // within a technique so that a single-cell proof keeps its catalog rank.
            self.technique,
            ProofPattern::house_count(&self.evidence, first.candidate()),
            first,
        )
    }
}

impl HintEvidence {
    pub(crate) fn pattern_size(&self) -> usize {
        match self {
            HintEvidence::Intersection { cells, .. } | HintEvidence::Subset { cells, .. } => {
                cells.len()
            }
            HintEvidence::Wing { .. } => 3,
            HintEvidence::WxyzWing { .. } => 4,
            HintEvidence::WWing { .. } | HintEvidence::SingleDigitChain { .. } => 4,
            HintEvidence::EmptyRectangle { cells, .. } => cells.len() + 2,
            HintEvidence::Chain { links } => links.len() + 1,
            HintEvidence::Inference { links } => links.len() + 1,
            HintEvidence::Coloring { colors, .. } => colors.iter().map(Vec::len).sum(),
            HintEvidence::UniqueRectangle { support, .. } => match support {
                RectangleSupport::Subset { cells, .. } => 4 + cells.len(),
                _ => 4,
            },
            HintEvidence::BugPlusOne { .. } => 3,
            HintEvidence::Forcing { branches, .. } => {
                branches.iter().map(|branch| 1 + branch.steps.len()).sum()
            }
            HintEvidence::AlsXz { sets, .. } => sets.iter().map(|set| set.cells.len()).sum(),
            HintEvidence::AlsChain { sets, .. } => sets.iter().map(|set| set.cells.len()).sum(),
            HintEvidence::DeathBlossom { petals, .. } => {
                1 + petals
                    .iter()
                    .map(|petal| petal.set.cells.len())
                    .sum::<usize>()
            }
            HintEvidence::SueDeCoq {
                intersection,
                line,
                block,
                ..
            } => intersection.len() + line.cells.len() + block.cells.len(),
            HintEvidence::Exocet { covers, .. } => {
                4 + covers.iter().map(|cover| cover.cells.len()).sum::<usize>()
            }
            HintEvidence::SkLoop(proof) => proof.arms.iter().map(Vec::len).sum(),
            HintEvidence::MultiSectorLockedSets {
                core, attachments, ..
            } => core.len() + attachments.len(),
            HintEvidence::Fish {
                bases,
                covers,
                fins,
                ..
            }
            | HintEvidence::ComplexFish {
                bases,
                covers,
                fins,
                ..
            } => bases.len() + covers.len() + fins.len(),
            _ => 0,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
/// Result of a request that requires at least two ranked moves.
pub enum HintChoices {
    /// Ranked choices from a position with at least two distinct moves.
    Choices(Vec<Hint>),
    /// The position has zero or one distinct move.
    InsufficientChoices {
        /// Number of distinct moves found.
        available: usize,
    },
}

/// Three reveals from the same ranked proof, in the order a player can open them.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct HintStages {
    /// Technique to name in the first reveal.
    pub technique: Technique,
    /// Houses, cells, and candidates to inspect before revealing the result.
    pub pattern: ProofPattern,
    /// Complete move shown in the final reveal.
    pub deduction: Hint,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
/// Failure to validate the starting position for a proof search.
pub enum HintError {
    /// The puzzle is invalid or uniqueness could not be established within the budget.
    Puzzle(Analysis),
    /// The removal masks include out-of-range bits or a required solution candidate.
    InvalidEliminations,
}

/// Report whether there are at least two distinct moves to choose from.
pub fn hint_choices(
    board: &Board,
    eliminations: Option<&[u16; CELLS]>,
) -> Result<HintChoices, HintError> {
    let choices = ranked_hints(board, eliminations, DEFAULT_HINT_LIMIT, &[])?;
    if choices.len() < 2 {
        return Ok(HintChoices::InsufficientChoices {
            available: choices.len(),
        });
    }
    Ok(HintChoices::Choices(choices))
}

/// Find up to `limit` distinct deductions, ordered by difficulty, cost, and pattern size.
/// Optional elimination masks use bit 0 for digit 1 and bit 8 for digit 9.
/// Pass established eliminations from the current position, independent of player notes.
pub fn ranked_hints(
    board: &Board,
    eliminations: Option<&[u16; CELLS]>,
    limit: usize,
    disabled_techniques: &[Technique],
) -> Result<Vec<Hint>, HintError> {
    let position = checked_position(board, eliminations)?;
    Ok(rank_position(&position, limit, disabled_techniques))
}

/// Prepare the easiest deduction and its progressive reveals, even for a lone move.
pub fn next_deduction(
    board: &Board,
    eliminations: Option<&[u16; CELLS]>,
) -> Result<Option<HintStages>, HintError> {
    next_enabled_deduction(board, eliminations, &[])
}

/// Prepare the easiest deduction proved by an enabled technique.
pub fn next_enabled_deduction(
    board: &Board,
    eliminations: Option<&[u16; CELLS]>,
    disabled_techniques: &[Technique],
) -> Result<Option<HintStages>, HintError> {
    let position = checked_position(board, eliminations)?;
    let Some(deduction) = rank_position(&position, 1, disabled_techniques)
        .into_iter()
        .next()
    else {
        return Ok(None);
    };
    let mut pattern = ProofPattern::from_evidence(
        &deduction.evidence,
        deduction.actions[0].candidate(),
        position.masks(),
    );
    if matches!(deduction.evidence, HintEvidence::House(_)) {
        // For a house single, point to the house so the player can find its cell.
        pattern.cells.clear();
    }
    pattern.candidates.retain(|candidate| {
        deduction
            .actions
            .iter()
            .all(|action| action.candidate() != *candidate)
    });
    Ok(Some(HintStages {
        technique: deduction.technique,
        pattern,
        deduction,
    }))
}

/// Prepare a staged hint directly from a snapshot.
pub fn next_deduction_at(snapshot: &PositionSnapshot) -> Result<Option<HintStages>, HintError> {
    next_deduction(
        &snapshot.values().map_err(HintError::Puzzle)?,
        snapshot.removals(),
    )
}

pub(crate) fn rank_position(
    position: &Position,
    limit: usize,
    disabled_techniques: &[Technique],
) -> Vec<Hint> {
    if limit == 0 {
        return Vec::new();
    }
    let search = DeductionSearch::new(position.board(), position.masks());
    let mut techniques: Vec<_> = Technique::ALL
        .into_iter()
        .filter(|technique| !disabled_techniques.contains(technique))
        .collect();
    let rank = |technique: &Technique| (technique.difficulty(), technique.cost());
    techniques.sort_by_key(rank);
    let mut choices: Vec<Hint> = Vec::new();
    for tier in techniques.chunk_by(|left, right| rank(left) == rank(right)) {
        let mut hints: Vec<_> = tier
            .iter()
            .flat_map(|&technique| search.hints(technique))
            .collect();
        // Use the first action only as a location tie-breaker. A proof's remaining
        // actions belong to move identity, independently of how easy it is to find.
        hints.sort_by_cached_key(Hint::rank_within_tier);
        for hint in hints {
            if choices.iter().all(|choice| choice.actions != hint.actions) {
                choices.push(hint);
                if choices.len() == limit {
                    return choices;
                }
            }
        }
    }
    choices
}

/// Find choices from a snapshot, requiring at least two distinct moves.
pub fn hints_at(snapshot: &PositionSnapshot) -> Result<HintChoices, HintError> {
    hint_choices(
        &snapshot.values().map_err(HintError::Puzzle)?,
        snapshot.removals(),
    )
}

/// Find deductions that use a particular technique, even if other techniques apply.
pub fn technique_deductions(
    board: &Board,
    eliminations: Option<&[u16; CELLS]>,
    technique: Technique,
) -> Result<Vec<Hint>, HintError> {
    let position = checked_position(board, eliminations)?;
    Ok(find_technique(
        position.board(),
        position.masks(),
        technique,
    ))
}

/// List proofs of a selected technique from a snapshot.
pub fn technique_deductions_at(
    snapshot: &PositionSnapshot,
    technique: Technique,
) -> Result<Vec<Hint>, HintError> {
    technique_deductions(
        &snapshot.values().map_err(HintError::Puzzle)?,
        snapshot.removals(),
        technique,
    )
}

pub(crate) fn checked_position(
    board: &Board,
    eliminations: Option<&[u16; CELLS]>,
) -> Result<Position, HintError> {
    let verified = logical::verified_position(board).map_err(HintError::Puzzle)?;
    // Validation can advance a copy of the board. Hints refer to the requested position.
    let mut position = Position::known_unique(board);
    if let Some(eliminations) = eliminations {
        let solution = verified
            .verified_solution()
            .ok_or(HintError::Puzzle(Analysis::SearchLimit))?;
        if !position.retain_eliminations(eliminations, &solution) {
            return Err(HintError::InvalidEliminations);
        }
    }
    Ok(position)
}

#[cfg(test)]
fn find_hints(board: &Board, masks: &[u16; CELLS]) -> Vec<Hint> {
    let search = DeductionSearch::new(board, masks);
    Technique::ALL
        .into_iter()
        .flat_map(|technique| search.hints(technique))
        .collect()
}

fn find_technique(board: &Board, masks: &[u16; CELLS], technique: Technique) -> Vec<Hint> {
    DeductionSearch::new(board, masks).hints(technique)
}

/// All detectors in a scan see the same immutable position.
pub(crate) struct DeductionSearch<'a> {
    board: &'a Board,
    masks: &'a [u16; CELLS],
    patterns: patterns::PatternSearch<'a>,
}

impl<'a> DeductionSearch<'a> {
    pub(crate) fn new(board: &'a Board, masks: &'a [u16; CELLS]) -> Self {
        Self {
            board,
            masks,
            patterns: patterns::PatternSearch::new(board, masks),
        }
    }

    pub(crate) fn first(&self, technique: Technique) -> Option<Deduction> {
        self.find(technique, |_| true)
    }

    pub(crate) fn find(
        &self,
        technique: Technique,
        mut matches: impl FnMut(&Deduction) -> bool,
    ) -> Option<Deduction> {
        visit_technique(self, technique, |step| {
            if matches(&step) {
                ControlFlow::Break(step)
            } else {
                ControlFlow::Continue(())
            }
        })
        .break_value()
    }

    pub(crate) fn hints(&self, technique: Technique) -> Vec<Hint> {
        let mut hints = Vec::new();
        let _ = visit_technique(self, technique, |step| {
            hints.push(step.into());
            ControlFlow::Continue(())
        });
        hints
    }
}

fn visit_technique(
    search: &DeductionSearch<'_>,
    technique: Technique,
    mut visit: impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let (board, masks) = (search.board, search.masks);
    if technique == Technique::NakedSingle {
        for (cell, &mask) in masks.iter().enumerate() {
            if mask.is_power_of_two() {
                visit(placement(
                    technique,
                    HintEvidence::Cell(cell),
                    cell,
                    mask.trailing_zeros() as u8 + 1,
                ))?;
            }
        }
        return ControlFlow::Continue(());
    }
    if !matches!(
        technique,
        Technique::FullHouse
            | Technique::HiddenSingle
            | Technique::Pointing
            | Technique::Claiming
            | Technique::NakedPair
            | Technique::NakedTriple
            | Technique::NakedQuadruple
            | Technique::HiddenPair
            | Technique::HiddenTriple
            | Technique::HiddenQuadruple
            | Technique::LockedPair
            | Technique::LockedTriple
    ) {
        return search.patterns.visit(technique, &mut visit);
    }

    for house in House::all() {
        let cells = house.cells();
        match technique {
            Technique::FullHouse => {
                let mut empty = cells.into_iter().filter(|&cell| board[cell] == 0);
                if let (Some(cell), None) = (empty.next(), empty.next()) {
                    if masks[cell] == 0 {
                        continue;
                    }
                    let digit = masks[cell].trailing_zeros() as u8 + 1;
                    visit(placement(
                        technique,
                        HintEvidence::House(house),
                        cell,
                        digit,
                    ))?;
                }
            }
            Technique::HiddenSingle => {
                for digit in 1..=9 {
                    let mut positions = positions_for_digit(&cells, masks, digit);
                    if let (Some(cell), None) = (positions.next(), positions.next()) {
                        visit(placement(
                            technique,
                            HintEvidence::House(house),
                            cell,
                            digit,
                        ))?;
                    }
                }
            }
            Technique::Pointing | Technique::Claiming => {
                if matches!(house, House::Box(_)) == (technique == Technique::Pointing) {
                    for digit in 1..=9 {
                        let mut cells_for_digit = positions_for_digit(&cells, masks, digit);
                        if let (Some(first), Some(second)) =
                            (cells_for_digit.next(), cells_for_digit.next())
                        {
                            let third = cells_for_digit.next();
                            let positions = [first, second, third.unwrap_or(first)];
                            if cells_for_digit.next().is_none() {
                                let count = 2 + usize::from(third.is_some());
                                find_intersections(
                                    house,
                                    &positions[..count],
                                    digit,
                                    masks,
                                    &mut visit,
                                )?;
                            }
                        }
                    }
                }
            }
            Technique::NakedPair
            | Technique::NakedTriple
            | Technique::NakedQuadruple
            | Technique::HiddenPair
            | Technique::HiddenTriple
            | Technique::HiddenQuadruple
            | Technique::LockedPair
            | Technique::LockedTriple => {
                subsets::visit_in_house(house, cells, masks, technique, &mut visit)?
            }
            _ => unreachable!(),
        }
    }
    ControlFlow::Continue(())
}

fn positions_for_digit<'a>(
    cells: &'a [usize; 9],
    masks: &'a [u16; CELLS],
    digit: u8,
) -> impl Iterator<Item = usize> + 'a {
    let bit = digit_bit(digit);
    cells
        .iter()
        .copied()
        .filter(move |&cell| masks[cell] & bit != 0)
}

pub(crate) fn digit_bit(digit: u8) -> u16 {
    1 << (digit - 1)
}

fn bit_indices(mut mask: u16) -> impl Iterator<Item = usize> {
    std::iter::from_fn(move || {
        if mask == 0 {
            return None;
        }
        let index = mask.trailing_zeros() as usize;
        mask &= mask - 1;
        Some(index)
    })
}

pub(crate) fn digits(mask: u16) -> impl Iterator<Item = u8> {
    bit_indices(mask).map(|index| index as u8 + 1)
}

// Visit fixed-size groups of selected entries, pruning unions that cannot shrink.
fn visit_unions<const EXACT: bool>(
    masks: &[u16; 9],
    mut remaining: u16,
    limit: u32,
    needed: u32,
    selected: u16,
    union: u16,
    visit: &mut impl FnMut(u16, u16) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    while remaining.count_ones() >= needed {
        let index = remaining.trailing_zeros() as usize;
        let bit = 1 << index;
        remaining &= !bit;
        let next_union = union | masks[index];
        let count = next_union.count_ones();
        if count > limit {
            continue;
        }
        if needed > 1 {
            visit_unions::<EXACT>(
                masks,
                remaining,
                limit,
                needed - 1,
                selected | bit,
                next_union,
                visit,
            )?;
        } else if !EXACT || count == limit {
            visit(selected | bit, next_union)?;
        }
    }
    ControlFlow::Continue(())
}

fn placement(technique: Technique, evidence: HintEvidence, cell: usize, digit: u8) -> Deduction {
    Deduction {
        technique,
        evidence,
        actions: DeductionActions::Placement(HintAction::Place(Candidate { cell, digit })),
    }
}

fn find_intersections(
    source: House,
    positions: &[usize],
    digit: u8,
    masks: &[u16; CELLS],
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let bit = digit_bit(digit);
    let source_cells = source.cells();
    for target in House::at(positions[0]) {
        let technique = match (source, target) {
            (House::Box(_), House::Row(_) | House::Column(_)) => Technique::Pointing,
            (House::Row(_) | House::Column(_), House::Box(_)) => Technique::Claiming,
            _ => continue,
        };
        let target_cells = target.cells();
        if !positions.iter().all(|cell| target_cells.contains(cell)) {
            continue;
        }
        let actions: Vec<_> = target_cells
            .into_iter()
            .filter(|cell| !source_cells.contains(cell) && masks[*cell] & bit != 0)
            .map(|cell| HintAction::Eliminate(Candidate { cell, digit }))
            .collect();
        if !actions.is_empty() {
            visit(Deduction {
                technique,
                evidence: HintEvidence::Intersection {
                    source,
                    target,
                    cells: positions.to_vec(),
                },
                actions: DeductionActions::Eliminations(actions),
            })?;
        }
    }
    ControlFlow::Continue(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{candidates, generate, parse_givens, solve};
    use std::collections::BTreeSet;

    const WARMUP: &str =
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

    #[test]
    fn ranks_chains_by_length_and_distinct_houses_independently_of_effect_count() {
        let candidate = |cell| Candidate { cell, digit: 1 };
        let chain = |sources: &[House], mut actions: Vec<HintAction>| {
            actions.insert(0, HintAction::Eliminate(candidate(15)));
            Hint {
                technique: Technique::Aic,
                evidence: HintEvidence::Chain {
                    links: sources
                        .iter()
                        .enumerate()
                        .map(|(i, &house)| CandidateLink {
                            from: candidate(i),
                            to: candidate(i + 1),
                            source: LinkSource::House(house),
                            strength: LinkStrength::Strong,
                        })
                        .collect(),
                },
                actions,
            }
        };
        let row = House::Row(0);
        let column = House::Column(0);
        let short = chain(&[row, column, row], vec![]);
        let many_houses = chain(&[row, column, House::Box(0)], vec![]);
        let long = chain(&[row, column, row, column, row], vec![]);
        assert!(short.rank_within_tier() < many_houses.rank_within_tier());
        assert!(many_houses.rank_within_tier() < long.rank_within_tier());
        let more_effects = chain(
            &[row, column, row],
            vec![HintAction::Eliminate(candidate(16))],
        );
        assert_eq!(short.rank_within_tier(), more_effects.rank_within_tier());
    }

    #[test]
    fn caps_choices_and_ranks_distinct_deductions_by_cost() {
        let board = parse_givens(WARMUP).unwrap();
        let singles = deductions(
            &board,
            None,
            &[Technique::NakedSingle, Technique::HiddenSingle],
        )
        .unwrap();
        assert_eq!(singles.len(), 16);
        let HintChoices::Choices(choices) = hint_choices(&board, None).unwrap() else {
            panic!("expected multiple choices");
        };
        use Technique::{HiddenSingle, NakedSingle};
        let expected = [
            (NakedSingle, 40, 5),
            (NakedSingle, 59, 7),
            (NakedSingle, 62, 4),
            (NakedSingle, 70, 3),
            (HiddenSingle, 5, 8),
            (HiddenSingle, 7, 1),
            (HiddenSingle, 22, 4),
            (HiddenSingle, 24, 5),
            (HiddenSingle, 38, 6),
            (HiddenSingle, 42, 7),
        ];
        let actual: Vec<_> = choices
            .iter()
            .map(|hint| {
                let [HintAction::Place(candidate)] = hint.actions.as_slice() else {
                    panic!("expected a single placement before the cutoff");
                };
                (hint.technique, candidate.cell, candidate.digit)
            })
            .collect();
        assert_eq!(actual, expected);
        assert_eq!(
            choices
                .iter()
                .map(|hint| &hint.actions)
                .collect::<BTreeSet<_>>()
                .len(),
            10
        );
        assert_eq!(
            hint_choices(&board, None),
            Ok(HintChoices::Choices(choices))
        );
    }

    #[test]
    fn offers_no_singleton_and_keeps_the_easiest_proof_for_each_move() {
        let mut board = solve(&parse_givens(WARMUP).unwrap()).unwrap();
        let digits = [board[0], board[1]];
        assert_eq!(
            hint_choices(&board, None),
            Ok(HintChoices::InsufficientChoices { available: 0 })
        );
        board[0] = 0;
        assert_eq!(
            hint_choices(&board, None),
            Ok(HintChoices::InsufficientChoices { available: 1 })
        );
        board[1] = 0;
        let techniques = [
            Technique::FullHouse,
            Technique::NakedSingle,
            Technique::HiddenSingle,
        ];
        let competing = deductions(&board, None, &techniques).unwrap();
        assert_eq!(competing.len(), 2);
        for found in competing {
            let proofs: BTreeSet<_> = found.proofs.iter().map(|proof| proof.technique).collect();
            assert_eq!(proofs, BTreeSet::from(techniques));
        }
        let HintChoices::Choices(choices) = hint_choices(&board, None).unwrap() else {
            panic!("expected two choices");
        };
        let expected: [_; 2] = std::array::from_fn(|cell| Hint {
            technique: Technique::FullHouse,
            evidence: HintEvidence::House(House::Column(cell)),
            actions: vec![HintAction::Place(Candidate {
                cell,
                digit: digits[cell],
            })],
        });
        assert_eq!(choices, expected);
    }

    #[test]
    fn tied_costs_prefer_the_smaller_pattern_and_keep_one_proof_per_move() {
        use Technique::{Claiming, LockedPair, Pointing};
        let board = parse_givens(LockedPair.practice_example().givens).unwrap();
        let remove = |cell, digit| HintAction::Eliminate(Candidate { cell, digit });
        let tied = deductions(&board, None, &[Pointing, Claiming]).unwrap();
        let competing = tied
            .iter()
            .find(|found| found.actions == [remove(34, 3)])
            .unwrap();
        let witnesses: Vec<_> = competing
            .proofs
            .iter()
            .map(|proof| (proof.technique, proof.pattern.cells.as_slice()))
            .collect();
        assert_eq!(
            witnesses,
            [(Pointing, &[27, 28, 29][..]), (Claiming, &[42, 43][..]),]
        );
        assert_eq!(Pointing.cost(), Claiming.cost());

        let HintChoices::Choices(choices) = hint_choices(&board, None).unwrap() else {
            panic!("expected multiple choices");
        };
        let expected: [(Technique, &[HintAction]); 6] = [
            (
                LockedPair,
                &[remove(2, 4), remove(5, 8), remove(16, 4), remove(16, 8)],
            ),
            (Pointing, &[remove(19, 5)]),
            (Pointing, &[remove(48, 9)]),
            (Pointing, &[remove(55, 9), remove(56, 9)]),
            (Claiming, &[remove(34, 3)]),
            (Pointing, &[remove(30, 2), remove(32, 2)]),
        ];
        let actual: Vec<_> = choices
            .iter()
            .take(expected.len())
            .map(|hint| (hint.technique, hint.actions.as_slice()))
            .collect();
        assert_eq!(actual, expected);
        assert_eq!(
            choices
                .iter()
                .filter(|hint| hint.actions == [remove(34, 3)])
                .count(),
            1
        );
    }

    #[test]
    fn next_deduction_uses_established_removals_and_reserves_the_answer_for_the_final_stage() {
        let mut snapshot = PositionSnapshot::new(parse_givens(WARMUP).unwrap());
        let original = next_deduction_at(&snapshot).unwrap().unwrap();
        assert_eq!(
            original.deduction.actions,
            [HintAction::Place(Candidate { cell: 40, digit: 5 })]
        );

        snapshot.eliminations[2] = digit_bit(1) | digit_bit(2);
        let stages = next_deduction_at(&snapshot).unwrap().unwrap();
        let HintChoices::Choices(choices) = hints_at(&snapshot).unwrap() else {
            panic!("expected multiple choices");
        };
        assert_eq!(stages.deduction, choices[0]);
        assert_eq!(stages.technique, Technique::NakedSingle);
        assert_eq!(
            stages.pattern,
            ProofPattern {
                houses: vec![],
                cells: vec![2],
                candidates: vec![],
            }
        );
        assert_eq!(
            stages.deduction,
            Hint {
                technique: Technique::NakedSingle,
                evidence: HintEvidence::Cell(2),
                actions: vec![HintAction::Place(Candidate { cell: 2, digit: 4 })],
            }
        );
        snapshot.eliminations[2] |= digit_bit(4);
        assert_eq!(
            next_deduction_at(&snapshot),
            Err(HintError::InvalidEliminations)
        );
    }

    #[test]
    fn retains_established_eliminations_and_rejects_impossible_positions() {
        let mut board = parse_givens(WARMUP).unwrap();
        let mut eliminations = [0; CELLS];
        eliminations[2] = digit_bit(1) | digit_bit(2);
        let HintChoices::Choices(choices) = hint_choices(&board, Some(&eliminations)).unwrap()
        else {
            panic!("expected multiple choices");
        };
        assert!(choices.iter().any(|hint| {
            hint.technique == Technique::NakedSingle
                && hint.actions == [HintAction::Place(Candidate { cell: 2, digit: 4 })]
        }));
        eliminations[2] |= digit_bit(4);
        assert_eq!(
            hint_choices(&board, Some(&eliminations)),
            Err(HintError::InvalidEliminations)
        );
        board[2] = 1;
        assert_eq!(
            hint_choices(&board, None),
            Err(HintError::Puzzle(Analysis::Unsolvable))
        );
    }

    #[test]
    fn every_supported_technique_produces_sound_deductions() {
        let generated = (0..128).map(|seed| {
            let mut board = generate(seed);
            let solution = solve(&board).unwrap();
            if seed % 16 == 0 {
                board = solution;
                board[0] = 0;
            }
            let masks = candidates(&board).unwrap();
            (board, masks, solution)
        });
        let practice = Technique::ALL.into_iter().map(|technique| {
            let snapshot = technique.practice_example().position().unwrap();
            let board = snapshot.values().unwrap();
            let solution = solve(&board).unwrap();
            let position = checked_position(&board, snapshot.removals()).unwrap();
            (board, *position.masks(), solution)
        });
        let mut seen = BTreeSet::new();
        for (board, masks, solution) in generated.chain(practice) {
            for hint in find_hints(&board, &masks) {
                seen.insert(hint.technique);
                assert!(!hint.actions.is_empty());
                assert!(
                    hint.actions.windows(2).all(|pair| pair[0] < pair[1]),
                    "noncanonical actions in {hint:?}"
                );
                for action in hint.actions {
                    match action {
                        HintAction::Place(Candidate { cell, digit }) => {
                            assert_eq!(board[cell], 0);
                            assert_eq!(solution[cell], digit);
                        }
                        HintAction::Eliminate(Candidate { cell, digit }) => {
                            assert_ne!(masks[cell] & digit_bit(digit), 0);
                            assert_ne!(solution[cell], digit);
                        }
                    }
                }
            }
        }
        assert_eq!(seen, BTreeSet::from(Technique::ALL));
    }
}
