use std::ops::ControlFlow;

use super::position::Position;
use super::{Analysis, Board, CELLS, PositionSnapshot, Technique, coordinates, logical};

#[path = "patterns/mod.rs"]
mod patterns;
#[cfg(any(feature = "variants", all(feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli"))))]
pub(crate) use patterns::OverlaySearch;

#[path = "proofs.rs"]
mod proofs;
pub use proofs::{DeductionMatch, DeductionProof, ProofPattern, deductions, deductions_at};

#[cfg(all(
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
#[path = "hints/technique_counts.rs"]
pub(crate) mod technique_counts;

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
    derive(serde::Serialize, serde::Deserialize),
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

    pub(crate) fn all() -> impl Iterator<Item = Self> + Clone {
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
    /// The row and column through this pivot require a digit in at least one endpoint.
    Firework(usize),
    /// At least one of the endpoint candidates must break this Tridagon.
    Tridagon {
        /// Four triples of cells in box order. Indices are zero-based.
        cells: [[u8; 3]; 4],
        /// Three digits in the impossible core.
        digits: [u8; 3],
    },
    /// At least one extra candidate must break this Unique Rectangle.
    UniqueRectangle {
        /// Zero-based cell indices in row-major order.
        corners: [u8; 4],
        /// The two digits that could swap if no extra candidate were true.
        digits: [u8; 2],
    },
    /// At least one of the two endpoint digits must occur in this almost locked set.
    AlmostLockedSet(AlmostLockedSetLink),
    /// Without the set's endpoint digit, the ALS locks enough digits to force the outside endpoint.
    AlmostLockedSetCell {
        /// Set whose remaining digits become locked.
        set: AlmostLockedSetLink,
        /// Outside cell forced by the lock.
        cell: u8,
        /// Candidate mask removed from the outside cell when the set's endpoint is false.
        blocked: u16,
    },
    /// Every candidate in one endpoint conflicts with every candidate in the other.
    Peers {},
}

/// An almost locked set used as an inference link.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AlmostLockedSetLink {
    packed_cells: [u8; 8],
    digit_mask: u16,
}

impl AlmostLockedSetLink {
    pub(crate) fn new(cells: impl IntoIterator<Item = usize>, digit_mask: u16) -> Self {
        let mut packed_cells = [0; 8];
        for (slot, cell) in packed_cells.iter_mut().zip(cells) {
            *slot = cell as u8 + 1;
        }
        packed_cells.sort_unstable();
        Self {
            packed_cells,
            digit_mask,
        }
    }

    /// Cell indices in the set.
    pub fn cells(self) -> impl Iterator<Item = usize> {
        self.packed_cells
            .into_iter()
            .filter(|&cell| cell != 0)
            .map(|cell| usize::from(cell - 1))
    }

    /// Candidate digits in the set.
    pub fn digits(self) -> impl Iterator<Item = u8> {
        digits(self.digit_mask)
    }
}

#[cfg(feature = "wasm-api")]
impl serde::Serialize for AlmostLockedSetLink {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        AlmostLockedSet {
            cells: self.cells().collect(),
            digits: self.digits().collect(),
        }
        .serialize(serializer)
    }
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
    /// At least one of these candidates is true. The candidates can use different digits.
    MixedGroup(Vec<Candidate>),
}

impl InferenceNode {
    /// Individual candidates that can make this proposition true.
    pub fn candidates(&self) -> impl Iterator<Item = Candidate> + '_ {
        let (members, group) = match self {
            Self::Candidate(candidate) => (std::slice::from_ref(candidate), None),
            Self::Group { digit, cells } => (&[][..], Some((*digit, cells))),
            Self::MixedGroup(members) => (members.as_slice(), None),
        };
        members.iter().copied().chain(
            group.into_iter().flat_map(|(digit, cells)| {
                cells.iter().map(move |&cell| Candidate { cell, digit })
            }),
        )
    }
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

/// The premise establishing one link in a Kraken Fish branch.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum KrakenLinkReason {
    /// The endpoints cannot both be true.
    Exclusion,
    /// The two endpoints exhaust the candidates of this cell.
    Cell(usize),
    /// The endpoints exhaust a digit's locations in this house.
    House(House),
    /// The endpoints represent two digits in this almost locked set. At least one must occur.
    AlmostLockedSet(AlmostLockedSet),
}

/// A directed step in a Kraken Fish branch. Exclusion links turn a true
/// proposition into a false one. Other links turn a false proposition into a true one.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct KrakenLink {
    /// Proposition before the inference.
    pub from: InferenceNode,
    /// Proposition after the inference.
    pub to: InferenceNode,
    /// Premise that proves the inference.
    pub reason: KrakenLinkReason,
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
/// Alternatives covered by a forcing proof or constraint used by an inference.
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
    /// A digit confined to the intersection of two houses under a branch assumption.
    Intersection {
        /// House whose candidates outside the intersection have been removed.
        source: House,
        /// House where the digit can be removed outside the intersection.
        target: House,
        /// Digit under consideration.
        digit: u8,
    },
    /// Two cells confined to two digits by earlier branch removals.
    NakedPair {
        /// House containing the pair.
        house: House,
        /// Cells supplying the pair.
        cells: [usize; 2],
        /// Digits occupying those cells.
        digits: [u8; 2],
    },
    /// Two house digits confined to two cells by earlier branch removals.
    HiddenPair {
        /// House containing the pair.
        house: House,
        /// Cells that must hold the pair.
        cells: [usize; 2],
        /// Digits confined to those cells.
        digits: [u8; 2],
    },
    /// Two base houses whose digit is confined to the same two cover houses.
    XWing {
        /// Digit constrained by the fish.
        digit: u8,
        /// Houses supplying the two occurrences.
        bases: [House; 2],
        /// Houses that contain both occurrences.
        covers: [House; 2],
    },
    /// At least one guardian of the enclosing Tridagon must be true.
    Guardians,
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
    /// Both truth values of a second candidate lead to contradictions.
    Cases(Box<[ForcingCase; 2]>),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// A contradiction under a second assumption and facts from the outer branch.
pub struct ForcingCase {
    /// Indices of the imported propositions within the outer branch.
    pub premises: Vec<usize>,
    /// Proof with the second assumption at index zero, then the imported propositions,
    /// then its own steps. The contradiction refutes the second assumption conditionally.
    pub branch: ForcingBranch,
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

impl ForcingBranch {
    /// Number of assumptions and deductions in this branch and its nested branches.
    pub fn proof_size(&self) -> usize {
        let nested = match &self.conflict {
            Some(ForcingConflict::Cases(cases)) => {
                cases.iter().map(|case| case.branch.proof_size()).sum()
            }
            _ => 0,
        };
        1 + self.steps.len() + nested
    }
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
/// Evidence that supplements the shared digits of a uniqueness pattern.
pub enum UniquenessSupport {
    /// Extra candidates used to avoid the ambiguous pattern.
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
    /// Required digits that can use at most one of the two cells with extra candidates.
    HiddenSubset {
        /// House in which the required digits are restricted.
        house: House,
        /// Other cells that must take a digit from the subset.
        cells: Vec<usize>,
        /// Required digits, including the loop's two shared digits.
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

/// Evidence that supplements the rectangle's two shared digits.
pub use UniquenessSupport as RectangleSupport;

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
/// The intersection and required digits of one Firework.
pub struct FireworkPivot {
    /// Cell where the row, column, and box meet.
    pub cell: usize,
    /// Digits confined to this box and the two wings in the crossing lines.
    pub digits: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// Cross-line coverage for one base digit in an Exocet proof.
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
/// One compatible assignment of digits to Exocet bases and targets.
pub struct ExocetAssignment {
    /// Digits assigned to the two base cells in evidence order.
    pub bases: [u8; 2],
    /// Digits assigned to the two target cells in evidence order.
    pub targets: [u8; 2],
}

/// One of the two Junior Exocets that participate in a Double Exocet.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct ExocetComponent {
    /// The two base cell indices.
    pub bases: [usize; 2],
    /// The two target cells, in assignment order.
    pub targets: [usize; 2],
    /// The cover for each base digit on the common cross-lines.
    pub covers: Vec<ExocetCover>,
}

/// The components and surviving assignments of a Double Exocet.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct DoubleExocetProof {
    /// Both base pairs, targets, and covers.
    pub components: [ExocetComponent; 2],
    /// The three cross-lines used by both components.
    pub cross_lines: [House; 3],
    /// True when the checks fill the shared cross-lines for all base digits
    /// together. Otherwise they check each placed base digit independently.
    pub joint_cross_line_support: bool,
    /// Paired assignments that pass the peer and cross-line checks.
    pub assignments: Vec<[ExocetAssignment; 2]>,
}

/// A single-cell or paired target in an Exocet proof.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum ExocetTarget {
    /// A single cell that must hold one of the digits placed in the base cells.
    Cell(usize),
    /// A pair with one cell reserved for a digit outside the base candidates.
    ConjugatePair {
        /// Digit that must occupy one of the two cells.
        digit: u8,
        /// Cross-line in which those cells are the digit's only two positions.
        link: ConjugatePair,
    },
}

impl ExocetTarget {
    pub(crate) fn cells(self) -> impl Iterator<Item = usize> {
        let (cells, count) = match self {
            Self::Cell(cell) => ([cell, 0], 1),
            Self::ConjugatePair { link, .. } => (link.cells, 2),
        };
        cells.into_iter().take(count)
    }

    pub(crate) const fn reserved_digit(self) -> Option<u8> {
        match self {
            Self::Cell(_) => None,
            Self::ConjugatePair { digit, .. } => Some(digit),
        }
    }
}

/// One base pair and its target groups in a grouped Double Exocet.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct GroupedExocetComponent {
    /// The two base cell indices.
    pub bases: [usize; 2],
    /// The two target groups in cross-line order.
    pub targets: [ExocetTarget; 2],
    /// The cover for each base digit outside the target groups.
    pub covers: Vec<ExocetCover>,
}

/// Two Exocets with a shared set of cross-lines and at least one paired target.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct GroupedDoubleExocetProof {
    /// Both base pairs, targets, and covers.
    pub components: [GroupedExocetComponent; 2],
    /// The three cross-lines used by both components.
    pub cross_lines: [House; 3],
    /// The local constraints that replay each removal with [`crate::prove_rank_at`].
    pub rank_pattern: crate::RankPattern,
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
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
/// A rejected assignment of digits to the cells of an aligned exclusion.
pub struct AlignedExclusionCase {
    /// Assigned digits in the order of the selected cells.
    pub digits: Vec<u8>,
    /// Constraint that rules out this assignment.
    pub reason: AlignedExclusionReason,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
/// Why an assignment in an aligned exclusion is impossible.
pub enum AlignedExclusionReason {
    /// Both cells share a house and receive the same digit.
    RepeatedDigit([usize; 2]),
    /// A common peer of the selected cells has no candidates left.
    EmptyCell(usize),
}

/// One digit's cells before and after checking compatible overlay patterns.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct PatternOverlayDigit {
    /// Digit used by each pattern in this scope.
    pub digit: u8,
    /// Placed copies and live candidate cells before the overlay.
    pub allowed: Vec<usize>,
    /// Cells used in at least one pattern compatible with the other scopes.
    pub supported: Vec<usize>,
}

/// The house and peer constraints used by a variant Pattern Overlay proof.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct PatternOverlayGeometry {
    /// Every required house, listed as its nine zero-based cells.
    pub houses: Vec<[usize; 9]>,
    /// Pairs that may not contain the same digit and share no required house.
    /// These pairs are additional to the exclusions inside the required houses.
    pub excluded_pairs: Vec<[usize; 2]>,
}

/// The digit families used to prove one Pattern Overlay deduction.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct PatternOverlayProof {
    /// Digit placed or removed.
    pub digit: u8,
    /// Participating digit families, in digit order.
    pub scopes: Vec<PatternOverlayDigit>,
    /// Explicit geometry for variant proofs. The classic rows, columns, and boxes
    /// are implicit when this field is absent.
    #[cfg_attr(feature = "wasm-api", serde(skip_serializing_if = "Option::is_none"))]
    pub geometry: Option<Box<PatternOverlayGeometry>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
/// Technique-specific facts that establish a deduction. The hint carries the proved actions separately.
pub enum HintEvidence {
    /// A digit can occupy only the cells covered by compatible placement patterns.
    PatternOverlay(Box<PatternOverlayProof>),
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
    /// A fish whose alternatives imply a shared candidate removal.
    KrakenFish {
        /// Digit counted by the fish.
        digit: u8,
        /// Houses supplying the required occurrences.
        bases: Vec<House>,
        /// Houses covering the required occurrences.
        covers: Vec<House>,
        /// Candidates that count toward more bases than covers.
        fins: Vec<usize>,
        /// The Type 2 cover house. When every fin is false, a candidate in this
        /// house with equal base and cover counts must be true.
        cover: Option<House>,
        /// One chain for each fin and, in Type 2, each balanced candidate in the
        /// selected cover house. Each starts with its candidate true and ends
        /// with the removed candidate false.
        branches: Vec<Vec<KrakenLink>>,
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
    /// A connected, alternating uniqueness pattern of more than four cells.
    UniqueLoop {
        /// Opposite sides of the pattern. Each touched house contains one cell from each side.
        sides: [Vec<usize>; 2],
        /// The shared pair whose digits could be swapped between the sides.
        digits: [u8; 2],
        /// Additional facts that rule out the swap.
        support: UniquenessSupport,
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
    /// Every assignment that uses the removed candidate fails a local Sudoku rule.
    AlignedExclusion {
        /// Cells assigned together, in the order used by each case.
        cells: Vec<usize>,
        /// All assignments of candidates to these cells that contain the removal.
        cases: Vec<AlignedExclusionCase>,
    },
    /// A Firework triple or quadruple with a shared pair of wing cells.
    Firework {
        /// The row wing followed by the column wing, relative to the first pivot.
        wings: [usize; 2],
        /// One intersection for a triple, or two for a quadruple.
        pivots: Vec<FireworkPivot>,
    },
    /// Two Firework digits and two bivalue cells with that candidate pair.
    FireworkWWing {
        /// Intersection of the Firework's row and column.
        pivot: usize,
        /// Digits shared by the Fireworks and both bivalue cells.
        digits: [u8; 2],
        /// Outside candidate cells in the row, then in the column.
        wings: [Vec<usize>; 2],
        /// The bivalue cell linked to each corresponding wing group.
        bivalue: [usize; 2],
    },
    /// A Firework pair and a conjugate link for a third digit.
    FireworkLWing {
        /// Intersection of the Firework's row and column.
        pivot: usize,
        /// The two Firework digits.
        digits: [u8; 2],
        /// The row wing followed by the column wing.
        wings: [usize; 2],
        /// Link with one end at a wing.
        link: ConjugatePair,
        /// Digit removed from the wing at the other end of the Firework.
        linked_digit: u8,
    },
    /// Two Firework pairs connected to the same bivalue cell.
    FireworkAlsWing {
        /// The intersections in cell order.
        pivots: [usize; 2],
        /// The two digits shared by both Fireworks and the bivalue cell.
        digits: [u8; 2],
        /// Outside cells for each intersection, with the row first.
        wings: [[Vec<usize>; 2]; 2],
        /// Cell whose value forces the same digit into both intersections.
        bivalue: usize,
    },
    /// At least one candidate outside the three core digits must break a Tridagon.
    Tridagon {
        /// One triple in each of the four boxes, ordered by box and then by row.
        cells: [[usize; 3]; 4],
        /// The three digits that cannot fill this pattern on their own.
        digits: [u8; 3],
        /// All remaining candidates in these cells outside the three core digits.
        guardians: Vec<Candidate>,
        /// Conditional proofs in guardian order, or one branch refuting the opposite move.
        /// Direct deductions have no branches.
        branches: Vec<ForcingBranch>,
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
    /// An Exocet with linked base and target digits.
    Exocet {
        /// The two base cell indices.
        bases: [usize; 2],
        /// The two target cell indices. In Senior Exocet the second is
        /// outside the base band or stack, inside the cross-line region.
        targets: [usize; 2],
        #[cfg_attr(feature = "wasm-api", serde(rename = "crossLines"))]
        /// Houses crossed by the pattern.
        cross_lines: [House; 3],
        /// Covering facts for each base digit.
        covers: Vec<ExocetCover>,
        /// Assignments consistent with the pattern.
        assignments: Vec<ExocetAssignment>,
    },
    /// A Senior Exocet with at least one conjugate-pair target.
    GroupedExocet {
        /// The two base cell indices.
        bases: [usize; 2],
        /// The target in the base band or stack, then the target reaching outside it.
        targets: [ExocetTarget; 2],
        /// Houses crossed by the pattern.
        #[cfg_attr(feature = "wasm-api", serde(rename = "crossLines"))]
        cross_lines: [House; 3],
        /// Covering facts for each base digit outside the targets.
        covers: Vec<ExocetCover>,
    },
    /// Two Junior Exocet proofs evaluated together.
    DoubleExocet(Box<DoubleExocetProof>),
    /// Joint deductions when at least one target is a conjugate pair.
    GroupedDoubleExocet(Box<GroupedDoubleExocetProof>),
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
            HintEvidence::PatternOverlay(proof) => {
                proof.scopes.iter().map(|scope| scope.allowed.len()).sum()
            }
            HintEvidence::Coloring { colors, .. } => colors.iter().map(Vec::len).sum(),
            HintEvidence::UniqueRectangle { support, .. } => match support {
                RectangleSupport::Subset { cells, .. } => 4 + cells.len(),
                _ => 4,
            },
            HintEvidence::UniqueLoop { sides, support, .. } => {
                let loop_cells = sides[0].len() + sides[1].len();
                loop_cells
                    + match support {
                        UniquenessSupport::Subset { cells, .. }
                        | UniquenessSupport::HiddenSubset { cells, .. } => cells.len(),
                        _ => 0,
                    }
            }
            HintEvidence::BugPlusOne { .. } => 3,
            HintEvidence::AlignedExclusion { cells, cases } => cells.len() + cases.len(),
            HintEvidence::Firework { pivots, .. } => {
                2 + pivots.len() + pivots.iter().map(|pivot| pivot.digits.len()).sum::<usize>()
            }
            HintEvidence::FireworkWWing { wings, .. } => {
                5 + wings.iter().map(Vec::len).sum::<usize>()
            }
            HintEvidence::FireworkLWing { .. } => 7,
            HintEvidence::FireworkAlsWing { wings, .. } => {
                5 + wings.iter().flatten().map(Vec::len).sum::<usize>()
            }
            HintEvidence::Tridagon {
                guardians,
                branches,
                ..
            } => {
                12 + guardians.len()
                    + branches
                        .iter()
                        .map(ForcingBranch::proof_size)
                        .sum::<usize>()
            }
            HintEvidence::Forcing { branches, .. } => {
                branches.iter().map(ForcingBranch::proof_size).sum()
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
            HintEvidence::GroupedExocet {
                targets, covers, ..
            } => {
                2 + targets.iter().flat_map(|target| target.cells()).count()
                    + covers.iter().map(|cover| cover.cells.len()).sum::<usize>()
            }
            HintEvidence::DoubleExocet(proof) => {
                8 + proof
                    .components
                    .iter()
                    .flat_map(|component| &component.covers)
                    .map(|cover| cover.cells.len())
                    .sum::<usize>()
                    + proof.assignments.len()
            }
            HintEvidence::GroupedDoubleExocet(proof) => {
                proof
                    .components
                    .iter()
                    .map(|component| {
                        2 + component
                            .targets
                            .iter()
                            .flat_map(|target| target.cells())
                            .count()
                            + component
                                .covers
                                .iter()
                                .map(|cover| cover.cells.len())
                                .sum::<usize>()
                    })
                    .sum::<usize>()
                    + proof.rank_pattern.bases.len()
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
            HintEvidence::KrakenFish {
                bases,
                covers,
                branches,
                ..
            } => bases.len() + covers.len() + branches.iter().map(Vec::len).sum::<usize>(),
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

#[cfg(any(test, all(feature = "wasm-api", any(target_arch = "wasm32", feature = "cli"))))]
fn technique_rank(technique: &Technique) -> (super::Difficulty, u16) {
    (technique.difficulty(), technique.cost())
}

/// Play hints prefer the cheapest proof that unlocks placements through singles.
/// This bounded probe does not change rating, attribution, or the solver profile.
#[cfg(any(test, all(feature = "wasm-api", any(target_arch = "wasm32", feature = "cli"))))]
pub(crate) fn rank_useful_position(
    position: &Position,
    limit: usize,
    disabled: &[Technique],
    difficulty: super::Difficulty,
) -> Vec<Hint> {
    if limit == 0 || position.is_solved() {
        return Vec::new();
    }
    let techniques = ordered_hint_techniques(disabled);
    let search = DeductionSearch::new(position.board(), position.masks());
    let baseline = singles_progress(position.clone());
    let mut probes: Vec<(Hint, usize)> = Vec::new();
    // Bound rollout work independently of the requested result count. Each
    // rollout places at most 81 digits and uses only naked and hidden singles.
    const PER_TIER: usize = 64;
    const TOTAL: usize = 512;
    for tier in techniques.chunk_by(|a, b| technique_rank(a) == technique_rank(b)) {
        if probes.len() >= TOTAL || (tier[0].difficulty() > difficulty && !probes.is_empty()) {
            break;
        }
        let mut hints: Vec<_> = tier.iter().flat_map(|&t| search.hints(t)).collect();
        hints.sort_by_cached_key(Hint::rank_within_tier);
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
            let mut after = position.clone();
            after.apply(&hint.actions);
            let progress = placements + singles_progress(after);
            let gain = progress.saturating_sub(baseline);
            // A direct placement remains useful even if it was already in the
            // baseline closure. Unrelated existing singles do not earn credit.
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
            if count == PER_TIER || probes.len() == TOTAL {
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
            technique_rank(&hint.technique),
            std::cmp::Reverse(*gain),
            hint.rank_within_tier(),
        )
    });
    let mut choices: Vec<Hint> = probes
        .into_iter()
        .map(|(hint, _)| hint)
        .take(limit)
        .collect();
    // Keep the requested alternatives (and exhaustive Analyze all behavior),
    // including enabled moves above the preferred difficulty when necessary.
    if choices.len() < limit {
        for hint in rank_position(position, limit, disabled) {
            if choices.iter().all(|other| other.actions != hint.actions) {
                choices.push(hint);
                if choices.len() == limit {
                    break;
                }
            }
        }
    }
    choices
}

#[cfg(any(test, all(feature = "wasm-api", any(target_arch = "wasm32", feature = "cli"))))]
fn singles_progress(mut position: Position) -> usize {
    let mut placed = 0;
    while !position.is_solved() {
        let search = DeductionSearch::new(position.board(), position.masks());
        let Some(step) = search
            .first(Technique::NakedSingle)
            .or_else(|| search.first(Technique::HiddenSingle))
        else {
            break;
        };
        position.apply(step.actions());
        placed += 1;
    }
    placed
}

#[cfg(any(test, all(feature = "wasm-api", any(target_arch = "wasm32", feature = "cli"))))]
fn ordered_hint_techniques(disabled: &[Technique]) -> Vec<Technique> {
    let mut techniques: Vec<_> = Technique::ALL
        .into_iter()
        .filter(|technique| !disabled.contains(technique))
        .collect();
    techniques.sort_by_key(technique_rank);
    techniques
}

/// Attribute each action independently. A proof may also affect other candidates.
#[cfg(all(feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
pub(crate) fn classify_actions(
    board: &Board,
    eliminations: Option<&[u16; CELLS]>,
    actions: &[HintAction],
) -> Result<Vec<Option<Technique>>, HintError> {
    let (position, solution) = checked_position_with_solution(board, eliminations, true)?;
    let mut result = vec![None; actions.len()];
    let mut pending: Vec<_> = actions
        .iter()
        .copied()
        .enumerate()
        .filter(|(_, action)| {
            let Candidate { cell, digit } = action.candidate();
            (1..=9).contains(&digit)
                && position
                    .masks()
                    .get(cell)
                    .is_some_and(|mask| mask & digit_bit(digit) != 0)
                && solution.as_ref().is_none_or(|solution| match action {
                    HintAction::Place(_) => solution[cell] == digit,
                    HintAction::Eliminate(_) => solution[cell] != digit,
                })
        })
        .collect();
    let search = DeductionSearch::new(position.board(), position.masks());
    let techniques = ordered_hint_techniques(&[]);
    for tier in techniques.chunk_by(|left, right| technique_rank(left) == technique_rank(right)) {
        if pending.is_empty() {
            break;
        }
        let mut proofs: Vec<_> = tier
            .iter()
            .flat_map(|&technique| search.hints(technique))
            .filter(|hint| {
                pending
                    .iter()
                    .any(|(_, action)| hint.actions.contains(action))
            })
            .collect();
        proofs.sort_by_cached_key(Hint::rank_within_tier);
        for proof in proofs {
            pending.retain(|&(index, action)| {
                if proof.actions.contains(&action) {
                    result[index] = Some(proof.technique);
                    false
                } else {
                    true
                }
            });
        }
    }
    Ok(result)
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
    checked_position_with_solution(board, eliminations, false).map(|(position, _)| position)
}

fn checked_position_with_solution(
    board: &Board,
    eliminations: Option<&[u16; CELLS]>,
    need_solution: bool,
) -> Result<(Position, Option<Board>), HintError> {
    let verified = logical::verified_position(board).map_err(HintError::Puzzle)?;
    let solution = (need_solution || eliminations.is_some())
        .then(|| verified.verified_solution())
        .flatten();
    let mut position = Position::known_unique(board);
    if let Some(eliminations) = eliminations {
        let answer = solution.as_ref().ok_or(HintError::Puzzle(Analysis::SearchLimit))?;
        if !position.retain_eliminations(eliminations, answer) {
            return Err(HintError::InvalidEliminations);
        }
    }
    Ok((position, solution))
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
        Self::with_verified_solution(board, masks, None)
    }

    /// Supply a checked completion that respects the board and candidate masks.
    /// Contradiction searches can omit assumptions satisfied by that completion.
    pub(crate) fn with_verified_solution(
        board: &'a Board,
        masks: &'a [u16; CELLS],
        solution: Option<&'a Board>,
    ) -> Self {
        let mut patterns = patterns::PatternSearch::new(board, masks);
        patterns.verified_solution = solution;
        Self {
            board,
            masks,
            patterns,
        }
    }

    /// Spend at most this many exact-search nodes finding additional witnesses.
    /// A failed or unfinished probe leaves the logical contradiction search intact.
    #[cfg(feature = "variants")]
    pub(crate) fn with_completion_probes(mut self, nodes: u32) -> Self {
        self.patterns.completion_probe_nodes = nodes;
        self
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
            | Technique::HiddenSingleBox
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
            Technique::HiddenSingle | Technique::HiddenSingleBox => {
                if technique == Technique::HiddenSingleBox && !matches!(house, House::Box(_)) {
                    continue;
                }
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

    const PROGRESS_PUZZLE: &str =
        "970500060000007103800040000000080900685000000100003002000000000000600057008090200";

    fn progress_techniques() -> Vec<Technique> {
        Technique::ALL
            .into_iter()
            .filter(|t| !matches!(t, Technique::Pointing | Technique::NakedPair))
            .collect()
    }

    #[test]
    fn useful_play_hints_skip_idle_eliminations_for_the_simplest_breakthrough() {
        let position = checked_position(&parse_givens(PROGRESS_PUZZLE).unwrap(), None).unwrap();
        let original = position.clone();
        let disabled = progress_techniques();
        assert_eq!(singles_progress(position.clone()), 0);
        let easiest = rank_position(&position, 1, &disabled).remove(0);
        assert_eq!(easiest.technique, Technique::Pointing);
        let mut after = position.clone();
        after.apply(&easiest.actions);
        assert_eq!(singles_progress(after), 0);
        let useful =
            rank_useful_position(&position, 1, &disabled, crate::Difficulty::Medium).remove(0);
        assert_eq!(useful.technique, Technique::NakedPair);
        let mut after = position.clone();
        after.apply(&useful.actions);
        assert_eq!(singles_progress(after), 58);
        assert_eq!(position.board(), original.board());
        assert_eq!(position.masks(), original.masks());
    }

    #[test]
    fn useful_play_hints_respect_difficulty_and_keep_fallbacks_and_all_moves() {
        let position = checked_position(&parse_givens(PROGRESS_PUZZLE).unwrap(), None).unwrap();
        let disabled = progress_techniques();
        let easy = rank_useful_position(&position, 1, &disabled, crate::Difficulty::Easy);
        assert_eq!(easy[0].technique, Technique::Pointing);
        let medium = rank_useful_position(&position, 1, &disabled, crate::Difficulty::Medium);
        assert_eq!(medium[0].technique, Technique::NakedPair);
        let old = rank_position(&position, usize::MAX, &disabled);
        let all = rank_useful_position(&position, usize::MAX, &disabled, crate::Difficulty::Medium);
        assert_eq!(all[0], medium[0]);
        assert_eq!(all.len(), old.len());
        assert!(
            old.iter()
                .all(|h| all.iter().any(|other| other.actions == h.actions))
        );
        assert!(
            rank_useful_position(&position, 0, &disabled, crate::Difficulty::Medium).is_empty()
        );
        let mut no_pairs = disabled;
        no_pairs.push(Technique::NakedPair);
        assert_eq!(
            rank_useful_position(&position, 1, &no_pairs, crate::Difficulty::Medium)[0].technique,
            Technique::Pointing
        );
    }

    #[test]
    fn useful_play_hints_do_not_credit_singles_already_available() {
        let position = checked_position(&parse_givens(WARMUP).unwrap(), None).unwrap();
        let disabled = progress_techniques();
        assert!(singles_progress(position.clone()) > 0);
        assert_eq!(
            rank_useful_position(&position, 1, &disabled, crate::Difficulty::Medium),
            rank_position(&position, 1, &disabled)
        );
    }

    #[cfg(feature = "variants")]
    #[test]
    fn useful_variant_play_hints_also_prefer_a_single_unlocking_move() {
        use crate::{Difficulty, VariantPuzzle, VariantTechnique};
        let compiled = VariantPuzzle::classic(parse_givens(PROGRESS_PUZZLE).unwrap())
            .compile()
            .unwrap();
        let enabled = [
            VariantTechnique::Classic(Technique::Pointing),
            VariantTechnique::Classic(Technique::NakedPair),
        ];
        let old = compiled
            .ranked_hints(&[0; CELLS], &[0; CELLS], &enabled, 1)
            .unwrap();
        assert_eq!(old[0].technique, enabled[0]);
        let useful = compiled
            .useful_hints(&[0; CELLS], &[0; CELLS], &enabled, 1, Difficulty::Medium)
            .unwrap();
        assert_eq!(useful[0].technique, enabled[1]);
        let fallback = compiled
            .useful_hints(
                &[0; CELLS],
                &[0; CELLS],
                &enabled[..1],
                1,
                Difficulty::Medium,
            )
            .unwrap();
        assert_eq!(fallback, old);
    }

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
        use Technique::{HiddenSingleBox, NakedSingle};
        let expected = [
            (HiddenSingleBox, 5, 8),
            (HiddenSingleBox, 24, 5),
            (HiddenSingleBox, 38, 6),
            (HiddenSingleBox, 47, 3),
            (HiddenSingleBox, 51, 8),
            (HiddenSingleBox, 64, 8),
            (HiddenSingleBox, 78, 1),
            (NakedSingle, 40, 5),
            (NakedSingle, 59, 7),
            (NakedSingle, 62, 4),
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
        let original = next_enabled_deduction(&snapshot.values().unwrap(), snapshot.removals(), &[Technique::HiddenSingleBox]).unwrap().unwrap();
        assert_eq!(
            original.deduction.actions,
            [HintAction::Place(Candidate { cell: 40, digit: 5 })]
        );

        snapshot.eliminations[2] = digit_bit(1) | digit_bit(2);
        let stages = next_enabled_deduction(&snapshot.values().unwrap(), snapshot.removals(), &[Technique::HiddenSingleBox]).unwrap().unwrap();
        let choices = ranked_hints(&snapshot.values().unwrap(), snapshot.removals(), 10, &[Technique::HiddenSingleBox]).unwrap();
        assert!(choices.len() >= 2);
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
            next_enabled_deduction(&snapshot.values().unwrap(), snapshot.removals(), &[Technique::HiddenSingleBox]),
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
