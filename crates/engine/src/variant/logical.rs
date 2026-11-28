use std::{
    cell::{OnceCell, RefCell, RefMut},
    collections::BTreeMap,
    ops::ControlFlow,
};

use super::{
    CompiledVariant, PuzzleRule, RegionLayout, VariantDefinitionError, VariantHouseKind,
    VariantPosition, VariantPositionError, VariantPuzzle, cells_in,
};
use crate::{
    Analysis, Board, CELLS, Candidate, DIGITS, Difficulty, HintAction, HintEvidence, SolveStatus,
    Technique,
    hints::{
        Deduction, DeductionSearch, InferenceGraph, OverlaySearch, RectangleInferenceCache,
        digit_bit, digits,
    },
};

#[cfg(test)]
#[path = "logical_tests.rs"]
mod tests;

/// Version of the rating behavior for structured puzzles.
pub const VARIANT_SCORING_VERSION: u32 = 24;
const GROUP_ORDER_ELIMINATION_SCORING_VERSION: u32 = 25;
const CONDITIONAL_NEIGHBOR_SCORING_VERSION: u32 = 26;
const VARIANT_LINKS_SCORING_VERSION: u32 = 27;
const CLUE_LINKS_SCORING_VERSION: u32 = 28;
const UNIQUENESS_PROBE_NODES: u32 = 4096;
const COMPLETION_PROBE_NODES: u32 = 512;
const ALTERNATIVE_WITNESS_NODES: u32 = 4096;

mod arrow_houses;
mod cages;
mod chain_inference;
mod clue_links;
mod lower_paths;
pub use lower_paths::VariantLowerPath;
#[cfg(any(feature = "generation", test))]
pub(super) use lower_paths::lower_techniques;
mod conditional_neighbors;
mod quadruples;
mod region_singles;
mod rule_proofs;
pub(super) use rule_proofs::RuleProofIndex;
mod exclusions;
mod forcing;
pub use forcing::VariantTrialFailure;
mod entropy_quadruple;
mod group_line_houses;
mod group_order;
mod group_sum_implications;
mod kropki_houses;
mod line_houses;
mod linked_clues;
mod matching_digits;
mod matching_layouts;
mod pruning;
mod ray_houses;
mod region_sums;
mod renban_group_counts;
mod renban_house_support;
mod renban_locks;
mod renban_sum;
mod scope_checks;
#[path = "scoring.rs"]
mod scoring;
mod sum_pairs;
mod thermometer_houses;

macro_rules! catalog {
    (
        $($(#[$doc:meta])* $name:ident: $id:literal, $cost:expr, $tier:ident;)+
        @explicit
        $($(#[$extra_doc:meta])* $extra:ident: $extra_id:literal, $extra_cost:expr, $extra_tier:ident;)+
    ) => {
        /// Techniques with rule-based explanations on a structured 9 × 9 grid.
        #[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
        pub enum VariantTechnique {
            $($(#[$doc])* $name),+,
            $($(#[$extra_doc])* $extra),+,
            /// A classic detector, subject to its house and uniqueness assumptions.
            Classic(Technique),
        }

        impl VariantTechnique {
            /// Techniques in default solve order.
            pub const DEFAULT_ORDER: &'static [Self] = &[$(Self::$name),+];

            /// Additional native techniques available in explicit profiles.
            pub const EXPLICIT_TECHNIQUES: &'static [Self] = &[$(Self::$extra),+];

            /// Stable identifier for a proof or solver profile.
            pub const fn id(self) -> &'static str {
                match self { $(Self::$name => $id,)+ $(Self::$extra => $extra_id,)+ Self::Classic(technique) => technique.id() }
            }

            /// Look up a supported technique by its case-sensitive ID.
            pub fn from_id(id: &str) -> Option<Self> {
                match id { $($id => Some(Self::$name),)+ $($extra_id => Some(Self::$extra),)+ _ => Technique::from_id(id)
                    .filter(|technique| technique.direct_premise().is_none()).map(Self::Classic) }
            }

            /// Reference point cost; a deduction's evidence can adjust the applied cost.
            pub const fn cost(self) -> u16 {
                match self { $(Self::$name => $cost,)+ $(Self::$extra => $extra_cost,)+ Self::Classic(technique) => technique.cost() }
            }

            /// Conservative lower bound for evidence-adjusted point scoring.
            pub const fn minimum_cost(self) -> u16 {
                match self {
                    Self::Classic(technique) => technique.minimum_cost(),
                    _ => 1,
                }
            }

            /// The minimum difficulty of a path that uses the technique.
            pub const fn difficulty(self) -> Difficulty {
                match self { $(Self::$name => Difficulty::$tier,)+ $(Self::$extra => Difficulty::$extra_tier,)+ Self::Classic(technique) => technique.difficulty() }
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
    /// Apply an authored set of allowed digits to marked cells.
    DigitRestriction: "digit-restriction", 6, Easy;
    /// Apply a trigger digit's required alternatives among neighboring cells.
    ConditionalNeighbor: "conditional-neighbor", 10, Easy;
    /// Apply the restriction between cells a king's move apart.
    AntiKing: "anti-king", 8, Easy;
    /// Apply the restriction between cells a knight's move apart.
    AntiKnight: "anti-knight", 8, Easy;
    /// Apply the restriction on consecutive digits in orthogonally adjacent cells.
    NonConsecutive: "non-consecutive", 8, Easy;
    /// Apply a marked inequality.
    Inequality: "inequality", 8, Easy;
    /// Fit an ordered run of consecutive digits along a line.
    ConsecutiveRun: "consecutive-run", 15, Easy;
    /// Fit one common digit set into the rows and columns of a rotated grid.
    InsideGrid: "inside-grid", 40, Medium;
    /// Fit different digits into a shaded group smaller than a house.
    DistinctCells: "distinct-cells", 15, Easy;
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
    /// Find possible Lockout endpoints and digits outside their range.
    Lockout: "lockout", 21, Easy;
    /// A house confines a digit to alternatives spanning three cells with a target.
    NonConsecutiveLockedTriple: "non-consecutive-locked-candidates-3", 24, Easy;
    /// Candidates spanning three consecutive digits exclude their middle digit nearby.
    NonConsecutiveTrivalue: "non-consecutive-trivalue", 24, Easy;
    /// Fit low, middle and high digits into a 2 × 2 area.
    GlobalEntropy: "global-entropy", 24, Easy;
    /// Order an explicit digit subset along a directed row or column.
    DigitOrder: "digit-order", 35, Medium;
    /// Find increasing assignments along a thermometer.
    Thermometer: "thermometer", 26, Easy;
    /// Require every printed digit occurrence in the four cells touching a circle.
    Quadruple: "quadruple", 27, Medium;
    /// Use the shared digit key of a puzzle's lettered circles.
    LetteredQuadruples: "lettered-quadruples", 58, Hard;
    /// Find possible digit differences along a Whispers line.
    Whispers: "whispers", 27, Medium;
    /// Apply the repeating low, medium and high groups along an Entropic line.
    Entropic: "entropic", 27, Medium;
    /// Apply the repeating remainder groups along a Modular line, including when a two-cell sum fixes or excludes a group.
    Modular: "modular", 27, Medium;
    /// Remove digits that cannot be assigned to the cells of a Killer cage.
    CageCombinations: "cage-combinations", 34, Easy;
    /// Find assignments whose path digits add to the digit in the circle.
    Arrow: "arrow", 36, Easy;
    /// Match the path sum with the tens and ones digits in a pill.
    PillArrow: "pill-arrow", 34, Easy;
    /// Check a Whispers line together with the houses shared by its cells.
    WhispersHouseSupport: "whispers-house-support", 39, Medium;
    /// Find consecutive sets that fit a Renban line.
    Renban: "renban", 40, Medium;
    /// Find shared sums among parts of a Region Sum line.
    RegionSum: "region-sum", 48, Medium;
    /// Remove a digit from cells that conflict with every required location for it.
    LockedCandidates: "locked-candidates", Technique::Pointing.cost(), Medium;
    /// Check the digit sum of a diagonal ray.
    LittleKiller: "little-killer", 50, Medium;
    /// Use house and cage sums to constrain the cells inside or outside a house.
    CageHouseSum: "cage-house-sum", 67, Medium;
    /// Fit the printed digits and entropy groups in a circle’s area and its neighbor.
    EntropyQuadruple: "entropy-quadruple", 58, Hard;
    /// Apply the count of visible heights in a row or column.
    Skyscrapers: "skyscrapers", 70, Hard;
    /// Apply a sum between 1 and 9 in a row or column.
    Sandwich: "sandwich", 76, Hard;
    /// Apply a sum of the first X digits of a row or column.
    XSum: "x-sum", 80, Hard;

    @explicit
    /// Use the sum of a Little Killer ray with distinct digits in shared houses.
    LittleKillerHouseSupport: "little-killer-house-support", 64, Medium;
    /// Use a Little Killer sum, a Renban on the ray, and the ray's shared houses.
    RenbanSumRayHouses: "renban-sum-ray-houses", 79, Hard;
    /// Lock a digit required by a Renban into a house.
    RenbanLockedDigit: "renban-locked-digit", 40, Medium;
    /// Rule out a candidate that would force five low or high digits into a house.
    RenbanGroupCounts: "renban-group-counts", 89, Hard;
    /// Fit a Renban and the remaining digits of its containing house.
    RenbanHouseSupport: "renban-house-support", 62, Medium;
    /// Find which Renban sets can fit the sum of a Little Killer ray containing the line.
    RenbanSum: "renban-sum", 66, Medium;
    /// Fit a Renban and diagonal sum against another Renban in a shared house.
    RenbanSumHouse: "renban-sum-house", 88, Hard;
    /// Fit the repeated phases of an Entropic or Modular line inside one house.
    GroupLineHouseSupport: "group-line-house-support", 64, Medium;
    /// Reject a repeating group order that contradicts a bounded series of clue and house checks.
    GroupOrderContradiction: "group-order-contradiction", 89, Hard;
    /// Remove a candidate excluded by both possible repeating group orders.
    GroupOrderElimination: "group-order-elimination", 76, Hard;
    /// Intersect Region Sum totals after requiring distinct digits inside each part.
    RegionSumDistinct: "region-sum-distinct", 67, Medium;
    /// Combine disjoint Region Sum parts using the digits in their shared region.
    RegionSumHouse: "region-sum-house", 133, Hard;
    /// Fit increasing digits on a Thermometer together with the rest of one shared house.
    ThermometerHouseSupport: "thermometer-house-support", 64, Medium;
    /// Fit an arrow's sum together with the distinct digits of its shared houses.
    ArrowHouseSupport: "arrow-house-support", 64, Medium;
    /// Fit the digits on a printed Kropki dot together with the rest of one shared house.
    KropkiHouseSupport: "kropki-house-support", 48, Medium;
    /// Reject a candidate using a bounded sequence of line, pair and house checks.
    LinkedClueContradiction: "linked-clue-contradiction", 78, Hard;
    /// Follow a digit through matching cells and the houses that require it.
    MatchingDigitContradiction: "matching-digit-contradiction", 80, Hard;
    /// Check every layout of a digit under the matching cells and enforced houses.
    MatchingLayoutForcing: "matching-layout-forcing", 246, Extreme;
}

#[cfg(feature = "wasm-api")]
impl serde::Serialize for VariantTechnique {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.id())
    }
}

impl VariantTechnique {
    /// Optional Classic techniques are available to custom profiles but do not
    /// participate in the default variant difficulty search.
    pub(super) const fn is_optional(self) -> bool {
        matches!(self, Self::Classic(Technique::MultiColoring))
    }

    /// Every technique that can be requested in a variant profile.
    pub fn all() -> impl Iterator<Item = Self> {
        Self::DEFAULT_ORDER
            .iter()
            .chain(Self::EXPLICIT_TECHNIQUES)
            .copied()
            .chain(
                Technique::ALL
                    .into_iter()
                    .filter(|technique| technique.direct_premise().is_none())
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
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case")
)]
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
    /// Of two candidate sites in a region, a printed clue or a placed
    /// neighbor rules out the other site in one check.
    RuleSingle {
        /// Candidate to place.
        candidate: Candidate,
        /// Region that requires the digit.
        house: VariantHouseKind,
        /// Cell rejected by the clue.
        excluded: usize,
        /// Placed digit used by a binary clue, if any.
        witness: Option<usize>,
        /// Top left cell of the entropy window and the missing group's digit mask.
        #[cfg_attr(
            feature = "wasm-api",
            serde(rename = "entropyWindow", skip_serializing_if = "Option::is_none")
        )]
        entropy_window: Option<(usize, u16)>,
        /// Source clue indices in the puzzle.
        rules: Vec<usize>,
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
    /// Two positive sums force a digit into one of their two outside endpoints.
    SumPair(Box<VariantSumPairProof>),
    /// A chain of line, sum, and house implications repeats a digit.
    GroupSumImplication {
        /// Candidate that starts and contradicts the chain.
        assumption: Candidate,
        /// Ordered consequences, beginning at the assumed candidate.
        links: Vec<VariantGroupSumLink>,
        /// House linking the final consequence and the assumption.
        conflict: VariantHouseKind,
    },
    /// Two cells in the same group on a line also share a house.
    GroupLineHouse {
        /// Index of the Entropic or Modular rule in the puzzle definition.
        rule: usize,
        /// House requiring the cells to contain different digits.
        house: VariantHouseKind,
        /// Cells in the same repeating group, in first-visit order.
        cells: [usize; 2],
        /// Current candidate masks, including placed digits.
        domains: [u16; 2],
    },
    /// Two line cells would exhaust the candidates of a third cell in their house.
    GroupLineHouseTriplet {
        /// Index of the Entropic or Modular rule.
        rule: usize,
        /// House shared by the last three cells.
        house: VariantHouseKind,
        /// The target and its two different-phase line cells, then the off-line cell.
        cells: [usize; 4],
        /// Current candidate masks in cell order, including placed digits.
        domains: [u16; 4],
    },
    /// A repeating group and a two-cell sum force a repeat in a shared house.
    GroupLineSumHouse {
        /// Indices of the line and positive sum rules, in that order.
        rules: [usize; 2],
        /// Shared house of the first and last cells.
        house: VariantHouseKind,
        /// Candidate cell, its same-group partner, and the other sum endpoint.
        cells: [usize; 3],
        /// Input candidate masks in the same order, including placed digits.
        domains: [u16; 3],
        /// Positive sum on the edge between the last two cells.
        total: u8,
    },
    /// A fixed line phase and a positive sum force a repeat across two other phases.
    GroupLinePhaseSum {
        /// Group line and positive sum rule indices.
        rules: [usize; 2],
        /// Sum endpoint, sum partner, other-phase line cell, and fixed-phase line cell.
        cells: [usize; 4],
        /// Input masks in cell order, including any placed digits.
        domains: [u16; 4],
        /// Sum of the first two cells.
        total: u8,
        /// House linking the second and third cells.
        house: VariantHouseKind,
    },
    /// A same-group pair and a separate two-cell sum are linked by shared houses.
    GroupLineDisjointSum {
        /// Indices of the line and positive sum rules, in that order.
        rules: [usize; 2],
        /// The line cells, followed by the two sum endpoints.
        cells: [usize; 4],
        /// Input candidate masks in cell order, including placed digits.
        domains: [u16; 4],
        /// Houses connecting these cells.
        houses: Vec<VariantHouseKind>,
        /// Positive sum on the last two cells.
        total: u8,
    },
    /// A repeating line group and two linked sums restrict digits across shared houses.
    GroupLineSumChain(Box<VariantGroupSumChainProof>),
    /// Complete line assignments respecting explicit shared houses.
    /// Box the rare payload so other deductions retain their compact layout.
    LineHouses(Box<VariantLineHouseProof>),
    /// A Quadruple and one or two 2 × 2 entropy areas in shared houses.
    EntropyAreas(Box<VariantEntropyAreaProof>),
    /// Candidate support from a diagonal sum and the houses shared by its cells.
    RayHouses(Box<VariantRayHouseProof>),
    /// An assumed candidate crowds five cells into four digits.
    RenbanGroupCounts(Box<VariantRenbanGroupProof>),
    /// Candidate support from a Renban fully contained in one house.
    RenbanHouseSupport(Box<VariantRenbanHouseProof>),
    /// Candidate support from a Little Killer ray and a Renban it contains.
    RenbanSum(Box<VariantRenbanSumProof>),
    /// Candidate support from a Little Killer ray, two Renbans, and a house.
    RenbanSumHouse(Box<VariantRenbanSumHouseProof>),
    /// Repeating groups and an all-different house.
    GroupLineHouseSupport(Box<VariantGroupLineHouseProof>),
    /// One or more repeating orders contradict the surrounding clues and houses.
    GroupOrder(Box<VariantGroupOrderProof>),
    /// Both possible group orders exclude the same candidate.
    GroupOrderElimination(Box<VariantGroupOrderEliminationProof>),
    /// A candidate refuted by a sequence of linked rule and house checks.
    LinkedClue(Box<VariantLinkedClueProof>),
    /// Matching cells and forced placements leave a house without the digit.
    MatchingDigit(Box<VariantMatchingDigitProof>),
    /// A candidate that fits none of the examined same-digit layouts.
    MatchingLayout(Box<VariantMatchingLayoutProof>),
    /// A Region Sum line whose parts must each use distinct digits.
    RegionSumDistinct(Box<VariantRegionSumProof>),
    /// Several Region Sum line parts must use disjoint digits in one region.
    RegionSumHouse(Box<VariantRegionSumHouseProof>),
    /// Increasing Thermometer assignments checked against a shared house.
    ThermometerHouse(Box<VariantThermometerHouseProof>),
    /// Assignments of a printed Kropki dot checked against one shared house.
    KropkiHouse(Box<VariantKropkiHouseProof>),
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
    /// A house must place a digit, and each location conflicts with the target.
    PeerLock {
        /// House that requires the digit.
        house: VariantHouseKind,
        /// Digit required by the house and removed from the target.
        digit: u8,
        /// Each possible location and the house or rule that connects it to the target.
        conflicts: Vec<(usize, VariantConstraintScope)>,
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
    /// Two circles require distinct copies of a digit in the same two houses.
    QuadrupleLock {
        /// The circles and their four-cell areas.
        clues: [VariantClueScope; 2],
        /// The two disjoint houses that must each contain one copy.
        houses: [VariantHouseKind; 2],
        /// Supported locations for the digit in each circle.
        sites: [Vec<usize>; 2],
        /// The digit required by both circles.
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
    /// A candidate assumption leads to a contradiction under the variant rules.
    RuleForcing {
        /// Candidate tried as a placement.
        assumption: Candidate,
        /// Singles forced by the assumption and the row, column or region that supplies each hidden single.
        #[cfg_attr(feature = "wasm-api", serde(skip_serializing_if = "Vec::is_empty"))]
        placements: Vec<(Candidate, Option<VariantHouseKind>)>,
        /// The first empty cell or missing house digit after applying clue support.
        contradiction: VariantTrialFailure,
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

/// One forced placement in a variant implication chain.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantGroupSumLink {
    /// Candidate forced by the preceding placement.
    pub candidate: Candidate,
    /// Candidate mask at this cell before assuming any placement in the chain.
    pub domain: u16,
    /// Rule or house that supplies the link.
    pub source: VariantGroupSumLinkSource,
}

/// The local premise that links two candidate placements.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case")
)]
pub enum VariantGroupSumLinkSource {
    /// A same-phase link or a different-phase link with a fixed third group.
    Line {
        /// Index of the Entropic or Modular rule.
        rule: usize,
        /// Fixed-phase cell and its domain when the link uses different phases.
        anchor: Option<(usize, u16)>,
    },
    /// A positive sum forces its other endpoint.
    Sum {
        /// Index of the positive sum rule.
        rule: usize,
        /// Total on the edge.
        total: u8,
    },
    /// Equal digits are excluded from a shared house.
    House {
        /// The house shared by the two cells.
        house: VariantHouseKind,
    },
}

/// Candidate support from two disjoint positive sums connected by a house.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantSumPairProof {
    /// The two source rule indices.
    pub rules: [usize; 2],
    /// Anchor and partner of the first sum, then anchor and partner of the second.
    pub cells: [usize; 4],
    /// The two positive sums.
    pub totals: [u8; 2],
    /// Candidate masks for the four cells in proof order, including placed digits.
    pub domains: [u16; 4],
    /// House enforcing different anchor digits.
    pub house: VariantHouseKind,
    /// Houses through which targets see the two partners.
    pub houses: Vec<VariantHouseKind>,
}

/// Replayable support for two linked sums and a same-group line pair.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantGroupSumChainProof {
    /// The group line followed by the two positive sum rules.
    pub rules: [usize; 3],
    /// The three cells along the sum chain followed by the other line cell.
    pub cells: [usize; 4],
    /// The house containing all four cells, when they share one.
    #[cfg_attr(feature = "wasm-api", serde(skip_serializing_if = "Option::is_none"))]
    pub house: Option<VariantHouseKind>,
    /// Houses supplying separate equal-digit exclusions when there is no common house.
    #[cfg_attr(feature = "wasm-api", serde(skip_serializing_if = "Vec::is_empty"))]
    pub houses: Vec<VariantHouseKind>,
    /// The sum on each of the first two edges.
    pub totals: [u8; 2],
    /// Candidate masks for the four cells, including placed digits.
    pub domains: [u16; 4],
    /// Candidates occurring in at least one assignment satisfying the premises.
    pub supported: [u16; 4],
    /// Digits newly guaranteed to occur among the four cells.
    pub locked: u16,
}

/// Replayable support for a line and its shared houses.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantLineHouseProof {
    /// Ordered rule indices supplying the line's relations.
    pub rules: Vec<usize>,
    /// Distinct cells, with the line first and any other cells of the last house after it.
    pub cells: Vec<usize>,
    /// Current candidate masks, including placed digits.
    pub domains: Vec<u16>,
    /// Candidates occurring in at least one valid complete line assignment.
    pub supported: Vec<u16>,
    /// Shared houses forbidding equal digits in line cells.
    pub houses: Vec<VariantHouseKind>,
    /// Number of line assignments that can extend through the checked houses.
    pub assignments: u32,
}

/// Replayable candidate support in a printed Quadruple and its entropy areas.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantEntropyAreaProof {
    /// The entropy rule followed by the contributing circle rule indices.
    pub rules: Vec<usize>,
    /// One 2 × 2 area or two areas sharing an edge.
    pub windows: Vec<[usize; 4]>,
    /// Cells in the combined area, sorted by grid order.
    pub cells: Vec<usize>,
    /// Candidate masks before applying the rules, including placed digits.
    pub domains: Vec<u16>,
    /// Digits that occur in at least one assignment satisfying all listed premises.
    pub supported: Vec<u16>,
    /// Houses forbidding equal digits in the cells of the area.
    pub houses: Vec<VariantHouseKind>,
}

/// A diagonal sum and the houses that restrict repetition along it.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantRayHouseProof {
    /// Indices of the diagonal sum and, when used, the contained Renban.
    pub rules: Vec<usize>,
    /// Ray cells in printed order.
    pub cells: Vec<usize>,
    /// Starting candidate masks, including singleton masks for placements.
    pub domains: Vec<u16>,
    /// Houses that add distinctness constraints to the proof.
    pub houses: Vec<VariantHouseKind>,
    /// Digits supported by a complete assignment of the indicated cells.
    pub supported: Vec<u16>,
}

/// Five cells of one house restricted to one four-digit group.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantRenbanGroupConflict {
    /// House where the five digits have to be distinct.
    pub house: VariantHouseKind,
    /// Five cells confined to the group, in grid order.
    pub cells: [usize; 5],
    /// Mask for digits 1–4 or 6–9.
    pub digits: u16,
}

/// Supported candidates in one Renban under an assumption.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantRenbanGroupProjection {
    /// Source rule index.
    pub rule: usize,
    /// Renban cells in source order.
    pub cells: Vec<usize>,
    /// Candidate masks before checking the line.
    pub domains: Vec<u16>,
    /// Supported masks after checking the line.
    pub supported: Vec<u16>,
}

/// A Renban on which ruling out sets forces a digit.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantRenbanGroupPlacement {
    /// Scope and locally supported candidates after rejecting the listed intervals.
    pub line: VariantRenbanGroupProjection,
    /// Each rejected interval's smallest digit and the house conflict it creates.
    pub rejected: Vec<(u8, VariantRenbanGroupConflict)>,
    /// Digit forced by the remaining intervals.
    pub candidate: Candidate,
}

/// A contradiction from one assumption, with at most one intermediate placement.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantRenbanGroupProof {
    /// Candidate whose placement is impossible.
    pub assumption: Candidate,
    /// Line deductions before the optional placement.
    pub initial: Vec<VariantRenbanGroupProjection>,
    /// An intermediate placement made necessary by the initial assumption.
    pub placement: Option<VariantRenbanGroupPlacement>,
    /// Line deductions after propagating the optional placement.
    pub subsequent: Vec<VariantRenbanGroupProjection>,
    /// The house that cannot fit all five cells.
    pub conflict: VariantRenbanGroupConflict,
}

/// Replayable support for a Renban and all other cells of its containing house.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantRenbanHouseProof {
    /// Index of the Renban in the ordered puzzle rules.
    pub rule: usize,
    /// The house containing the entire line.
    pub house: VariantHouseKind,
    /// Renban cells in printed order followed by the other cells of the house.
    pub cells: Vec<usize>,
    /// Number of cells on the Renban.
    pub line_length: usize,
    /// Input digit masks, including singleton masks for placements.
    pub domains: [u16; 9],
    /// Digits with a complete assignment satisfying both the Renban and house.
    pub supported: [u16; 9],
    /// Mask of the first digit of each consecutive set that fits the entire house.
    pub starts: u16,
    /// Outside cell that forms a two-digit contradiction with the first removal.
    pub paired_cell: Option<usize>,
}

/// Replayable support for a Renban set inside a Little Killer ray.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantRenbanSumProof {
    /// Rule indices for the Renban and then the Little Killer clue.
    pub rules: [usize; 2],
    /// Ray cells in their printed order.
    pub cells: Vec<usize>,
    /// Current candidate masks, including singleton masks for placed digits.
    pub domains: Vec<u16>,
    /// Digits present in a complete assignment satisfying both clues.
    pub supported: Vec<u16>,
    /// Digit mask for the smallest digits of supported Renban intervals.
    pub starts: u16,
}

/// Replayable support for two Renbans connected through a Little Killer ray and a house.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantRenbanSumHouseProof {
    /// Indices for the contained Renban, the Little Killer ray, and the other Renban.
    pub rules: [usize; 3],
    /// The ray in printed order, followed by the other Renban cells off the ray.
    pub cells: Vec<usize>,
    /// Candidate masks in the same order as the proof cells, including placed digits.
    pub domains: Vec<u16>,
    /// House that contains the second Renban and one other cell of the ray.
    pub house: VariantHouseKind,
    /// Shared cell of the ray and second Renban.
    pub shared: usize,
    /// The other ray cell in the house.
    pub restricted: usize,
    /// Surviving digit masks in the ray's printed order.
    pub supported: Vec<u16>,
    /// A short worked contradiction for the first action when one is available.
    pub witness: Option<VariantRenbanSumHouseWitness>,
}

/// A short contradiction for a candidate removed by a Renban, sum, and house proof.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantRenbanSumHouseWitness {
    /// The assumed candidate.
    pub candidate: Candidate,
    /// Digit forced in the shared cell by the sum and its contained Renban.
    pub shared_digit: u8,
    /// Smallest digit of the contained Renban if only one interval fits.
    pub contained_start: Option<u8>,
    /// Smallest digit of the only interval on the other Renban.
    pub other_start: u8,
    /// Digits left for the restricted cell before applying the shared house.
    pub restricted_digits: u16,
}

/// Group assignments to one line and available digits in a shared house.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantGroupLineHouseProof {
    /// Original Entropic or Modular rule index.
    pub rule: usize,
    /// Distinct path cells in first-visit order.
    pub line_cells: Vec<usize>,
    /// Candidate masks for the distinct path cells.
    pub line_domains: Vec<u16>,
    /// Repeating group position of each distinct path cell, from 0 to 2.
    pub phases: Vec<usize>,
    /// House where digits must be distinct.
    pub house: VariantHouseKind,
    /// The nine house cells in house order.
    pub cells: [usize; 9],
    /// Candidate masks for the house before the deduction.
    pub domains: [u16; 9],
    /// All house digits supported by both constraints.
    pub supported: [u16; 9],
    /// Group orders consistent with the line's candidates, and the cases the house rejects.
    pub cases: Vec<VariantGroupLineHouseCase>,
}

/// One group order and, if impossible, a short count proving the conflict.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantGroupLineHouseCase {
    /// Digit mask for each of the three repeating positions.
    pub groups: [u16; 3],
    /// Digits with too few locations or cells with too few digits.
    pub conflict: Option<VariantGroupLineHouseConflict>,
}

/// A subset of cells and its insufficient digit support, or the reverse.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantGroupLineHouseConflict {
    /// House cells involved in the count.
    pub cells: Vec<usize>,
    /// Digits involved in the count.
    pub digits: u16,
}

/// The rules or house checked under a hypothetical assignment.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case")
)]
pub enum VariantConstraintScope {
    /// All-different candidates in a single house.
    House {
        /// The house used here.
        house: VariantHouseKind,
    },
    /// A binary clue, including an edge governed by a negative mark rule.
    Pair {
        /// Indices of the rules that define the relationship.
        rules: Vec<usize>,
    },
    /// A line rule.
    Line {
        /// Index of the line rule.
        rule: usize,
    },
}

/// A checked scope in a group-order proof.
pub use VariantConstraintScope as VariantGroupOrderScope;

/// The candidates supported by a scope under a hypothetical assignment.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantConstraintCheck {
    /// Scope responsible for this restriction.
    pub scope: VariantConstraintScope,
    /// Cells in scope order.
    pub cells: Vec<usize>,
    /// Candidate masks before the check.
    pub domains: Vec<u16>,
    /// Candidate masks supported by the scope. All zero at a contradiction.
    pub supported: Vec<u16>,
}

/// A checked constraint in a group-order proof.
pub use VariantConstraintCheck as VariantGroupOrderCheck;

/// Why a candidate cannot fit in an uncovered house under this assumption.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantMatchingDigitBlock {
    /// Candidate cell in the house being checked.
    pub cell: usize,
    /// The cell that must match the candidate, or the candidate itself.
    pub matched: usize,
    /// A cell already assigned the digit under the assumption.
    pub placed: usize,
    /// House that prevents the matched cell from using the placed digit.
    pub house: VariantHouseKind,
}

/// Places for the digit in one required house.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantMatchingDigitCheck {
    /// House that needs the digit.
    pub house: VariantHouseKind,
    /// The sole remaining cell and its matching cells, or empty on conflict.
    pub forced: Vec<usize>,
    /// Why each other available candidate is blocked.
    pub blocked: Vec<VariantMatchingDigitBlock>,
}

/// A placement of one digit that leaves a house without that digit.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantMatchingDigitProof {
    /// Digit being followed.
    pub digit: u8,
    /// The assumed cell and every cell that must match it.
    pub assumed: Vec<usize>,
    /// Placed digits and their matching cells before the assumption.
    pub initially_placed: Vec<usize>,
    /// Houses that force one more placement under the assumption.
    pub checks: Vec<VariantMatchingDigitCheck>,
    /// House that has no remaining place for the digit.
    pub conflict: VariantMatchingDigitCheck,
}

/// One geometrically valid layout of a digit and its consequences.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantMatchingLayoutCase {
    /// Cells containing the digit in this layout.
    pub cells: Vec<usize>,
    /// Whether a rule has no valid assignment.
    pub contradicted: bool,
    /// Checks replayed in their original order.
    pub checks: Vec<VariantConstraintCheck>,
}

/// Exhaustive layouts of one digit under the matching cells and houses.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantMatchingLayoutProof {
    /// The digit whose layouts were checked.
    pub digit: u8,
    /// Candidate that fails in every layout.
    pub target: Candidate,
    /// Every layout before checking the companion clues.
    pub cases: Vec<VariantMatchingLayoutCase>,
}

/// A candidate that leaves a linked clue or house without an assignment.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantLinkedClueProof {
    /// The candidate assumed to be true.
    pub assumption: Candidate,
    /// Checks that narrow candidate masks under the assumption.
    pub checks: Vec<VariantConstraintCheck>,
    /// The final scope, which has no valid assignment.
    pub conflict: VariantConstraintCheck,
    /// The cells or digits that cannot fit if the final scope is a house.
    #[cfg_attr(feature = "wasm-api", serde(skip_serializing_if = "Option::is_none"))]
    pub house_conflict: Option<VariantGroupLineHouseConflict>,
}

/// A repeating order that ends in a contradiction.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantGroupOrderRefutation {
    /// Group masks for the three repeating positions.
    pub groups: [u16; 3],
    /// Candidate restrictions in the order they occur.
    pub checks: Vec<VariantGroupOrderCheck>,
    /// The scope with no valid assignment under the assumption.
    pub conflict: VariantGroupOrderCheck,
    /// A minimal set of cells or digits that cannot fit in a house.
    #[cfg_attr(feature = "wasm-api", serde(skip_serializing_if = "Option::is_none"))]
    pub house_conflict: Option<VariantGroupLineHouseConflict>,
}

/// A complete explanation for rejecting some of the available group orders.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantGroupOrderProof {
    /// Index of the source Entropic or Modular rule.
    pub rule: usize,
    /// Distinct source cells in first-visit order.
    pub cells: Vec<usize>,
    /// Candidate masks in those cells before testing any order.
    pub domains: Vec<u16>,
    /// The repeating position, from zero to two, of each cell.
    pub phases: Vec<usize>,
    /// The orders that survive the bounded checks.
    pub remaining: Vec<[u16; 3]>,
    /// Contradictions for the orders that have no support.
    pub rejected: Vec<VariantGroupOrderRefutation>,
}

/// Restrictions proved within one possible repeating group order.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantGroupOrderBranch {
    /// Group masks for the three repeating positions.
    pub groups: [u16; 3],
    /// Restrictions that exclude the candidate, in replay order.
    pub checks: Vec<VariantConstraintCheck>,
}

/// A candidate excluded under both possible orders of a repeating line.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct VariantGroupOrderEliminationProof {
    /// Index of the source Entropic or Modular rule.
    pub rule: usize,
    /// Distinct source cells in first-visit order.
    pub cells: Vec<usize>,
    /// Candidate masks in those cells before considering either order.
    pub domains: Vec<u16>,
    /// Repeating position, from zero to two, of each source cell.
    pub phases: Vec<usize>,
    /// Both orders and their restrictions.
    pub branches: [VariantGroupOrderBranch; 2],
}

/// The valid distinct-digit totals for each part of a Region Sum line.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantRegionSumProof {
    /// Rule index of the Region Sum line.
    pub rule: usize,
    /// Parts in compiled order. Grouped visits are ordered by region.
    pub parts: Vec<VariantRegionSumPart>,
    /// Totals that every part can reach.
    pub common_totals: Vec<u8>,
}

/// One part of a Region Sum line, with all its cells in one region.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantRegionSumPart {
    /// Cells in this part.
    pub cells: Vec<usize>,
    /// Input masks in cell order, including placed digits.
    pub domains: Vec<u16>,
    /// Totals reachable with distinct digits.
    pub totals: Vec<u8>,
}

/// Matching Region Sum lines using the digits in one common region.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantRegionSumHouseProof {
    /// Region shared by the line parts.
    pub house: VariantHouseKind,
    /// Lines contributing disjoint parts to the region.
    pub lines: Vec<VariantRegionSumHouseLine>,
    /// Other cells in the same region.
    pub remainder: Vec<usize>,
    /// Input masks of the other cells.
    pub remainder_domains: Vec<u16>,
}

/// One line involved in a shared-region proof.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantRegionSumHouseLine {
    /// Source rule index.
    pub rule: usize,
    /// Index of the part in the shared region.
    pub in_region: usize,
    /// All parts in compiled order, including those outside the region.
    pub parts: Vec<VariantRegionSumPart>,
    /// Totals shared by the parts before checking the region.
    pub common_totals: Vec<u8>,
    /// Totals still possible after checking the region.
    pub remaining_totals: Vec<u8>,
}

/// Candidate support from one Thermometer and a row, column, or other distinct-digit house.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantThermometerHouseProof {
    /// Index of the source Thermometer rule.
    pub rule: usize,
    /// Physical Thermometer cells in bulb-to-tip order.
    pub line_cells: Vec<usize>,
    /// Input masks in Thermometer order.
    pub line_domains: Vec<u16>,
    /// House shared by at least two of the Thermometer's cells.
    pub house: VariantHouseKind,
    /// The nine house cells in house order.
    pub cells: [usize; 9],
    /// Input masks in house order, including placed digits.
    pub domains: [u16; 9],
    /// Number of distinct increasing digit sets tested on the shared line cells.
    pub tested: usize,
    /// Tested digit sets unable to extend to the whole house.
    pub rejected: Vec<u16>,
}

/// Candidate support from a printed Kropki dot and a shared distinct-digit house.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct VariantKropkiHouseProof {
    /// Indices of the rules printing a mark on this edge.
    pub rules: Vec<usize>,
    /// Cells joined by the dot.
    pub pair: [usize; 2],
    /// House shared by the two dot cells.
    pub house: VariantHouseKind,
    /// The nine house cells in house order.
    pub cells: [usize; 9],
    /// Input masks for the house, including placed digits.
    pub domains: [u16; 9],
    /// Number of distinct digit pairs tested.
    pub tested: usize,
    /// Digits used by the dot in every full house assignment.
    pub locked: u16,
    /// Digit pairs that could not extend to the whole house.
    pub rejected: Vec<u16>,
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
        self.trace_with_boundary(order, 0, true, usize::MAX)
    }

    pub(crate) fn trace_with_boundary(
        &self,
        order: &[VariantTechnique],
        stop_after_placement_in: u128,
        include_steps: bool,
        max_steps: usize,
    ) -> Result<VariantTrace, VariantLogicalError> {
        let mut steps = Vec::new();
        let (end, rating) = self.logical_run(order, stop_after_placement_in, |step| {
            if include_steps {
                steps.push(step);
            }
            if steps.len() == max_steps {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        })?;
        Ok(VariantTrace {
            start: self.clone(),
            end,
            steps,
            rating,
        })
    }

    /// Rate the logical path without retaining its proof trace.
    pub fn rate(&self, order: &[VariantTechnique]) -> Result<VariantRating, VariantLogicalError> {
        self.logical_run(order, 0, |_| ControlFlow::Continue(()))
            .map(|(_, rating)| rating)
    }

    fn logical_run(
        &self,
        order: &[VariantTechnique],
        stop_after_placement_in: u128,
        receive: impl FnMut(VariantDeduction) -> ControlFlow<()>,
    ) -> Result<(Self, VariantRating), VariantLogicalError> {
        let compiled = self
            .puzzle
            .compile()
            .map_err(VariantLogicalError::Definition)?;
        self.run_with_boundary(&compiled, order, stop_after_placement_in, receive)
    }

    #[cfg(any(feature = "generation", test))]
    pub(super) fn run_with_compiled(
        &self,
        compiled: &CompiledVariant,
        order: &[VariantTechnique],
        mut receive: impl FnMut(VariantDeduction),
    ) -> Result<(Self, VariantRating), VariantLogicalError> {
        self.run_with_boundary(compiled, order, 0, |step| {
            receive(step);
            ControlFlow::Continue(())
        })
    }

    fn run_with_boundary(
        &self,
        compiled: &CompiledVariant,
        order: &[VariantTechnique],
        stop_after_placement_in: u128,
        mut receive: impl FnMut(VariantDeduction) -> ControlFlow<()>,
    ) -> Result<(Self, VariantRating), VariantLogicalError> {
        let mut position = compiled
            .proof_position(&self.entries, &self.eliminations)
            .map_err(VariantLogicalError::Position)?;
        let mut end = self.clone();
        let mut rating = VariantRating {
            technique_order: order.to_vec(),
            regions: self.puzzle.regions.clone(),
            rules: self.puzzle.rules.clone(),
            scoring_version: if compiled.region_logic {
                super::REGION_LOGIC_VERSION
            } else if compiled.extended_logic {
                CLUE_LINKS_SCORING_VERSION
            } else {
                VARIANT_SCORING_VERSION
            },
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
            if technique == VariantTechnique::GroupOrderElimination {
                rating.scoring_version = rating
                    .scoring_version
                    .max(GROUP_ORDER_ELIMINATION_SCORING_VERSION);
            } else if technique == VariantTechnique::ConditionalNeighbor {
                rating.scoring_version = rating
                    .scoring_version
                    .max(CONDITIONAL_NEIGHBOR_SCORING_VERSION);
            } else if matches!(step.evidence, VariantEvidence::PeerLock { .. })
                || matches!(technique, VariantTechnique::Classic(classic) if compiled.uses_variant_chains(classic))
            {
                rating.scoring_version = rating.scoring_version.max(VARIANT_LINKS_SCORING_VERSION);
            }
            *rating.counts.entry(technique).or_default() += 1;
            rating.points += u32::from(scoring::deduction_cost(&step, &self.puzzle));
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
            let reached_boundary = stop_after_placement_in != 0
                && position.board.contains(&0)
                && step.actions.iter().any(|action| {
                    matches!(action, HintAction::Place(candidate) if stop_after_placement_in & (1 << candidate.cell) != 0)
                });
            if receive(step).is_break() || reached_boundary {
                break;
            }
            let overlay = position.overlay.take();
            position = compiled.house_position(position.board, &end.eliminations);
            if let Some(mut overlay) = overlay
                && overlay.get_mut().has_cached_support()
            {
                overlay
                    .get_mut()
                    .update_position(&position.board, &position.masks);
                position.overlay = OnceCell::from(overlay);
            }
        }
        Ok((end, rating))
    }
}

impl VariantDeduction {
    /// Estimated points for this deduction using its proof and puzzle rules.
    pub fn cost(&self, puzzle: &VariantPuzzle) -> u16 {
        scoring::deduction_cost(self, puzzle)
    }

    fn rank(&self) -> (Difficulty, u16, usize, usize, VariantTechnique, HintAction) {
        let checks = match &self.evidence {
            VariantEvidence::GroupOrder(proof) => proof
                .rejected
                .iter()
                .map(|order| order.checks.len() + 1)
                .sum(),
            VariantEvidence::GroupOrderElimination(proof) => proof
                .branches
                .iter()
                .map(|branch| branch.checks.len())
                .sum(),
            _ => 0,
        };
        let cells = match &self.evidence {
            VariantEvidence::Single { .. } => 1,
            VariantEvidence::RuleSingle { .. } => 2,
            VariantEvidence::CageSum { cells, .. }
            | VariantEvidence::Constraint { cells, .. }
            | VariantEvidence::Intersection { cells, .. } => cells.len(),
            VariantEvidence::PeerLock { conflicts, .. } => conflicts.len() + 1,
            VariantEvidence::GroupLineHouse { cells, .. } => cells.len(),
            VariantEvidence::GroupLineHouseTriplet { cells, .. } => cells.len(),
            VariantEvidence::GroupLineSumHouse { cells, .. } => cells.len(),
            VariantEvidence::GroupLinePhaseSum { cells, .. } => cells.len(),
            VariantEvidence::GroupLineDisjointSum { cells, .. } => cells.len(),
            VariantEvidence::GroupLineSumChain(proof) => proof.cells.len(),
            VariantEvidence::SumPair(proof) => proof.cells.len(),
            VariantEvidence::GroupSumImplication { links, .. } => links.len() + 1,
            VariantEvidence::LineHouses(proof) => proof.cells.len(),
            VariantEvidence::EntropyAreas(proof) => proof.cells.len(),
            VariantEvidence::RayHouses(proof) => proof.cells.len(),
            VariantEvidence::KropkiHouse(proof) => proof.cells.len(),
            VariantEvidence::ThermometerHouse(proof) => proof.cells.len() + proof.line_cells.len(),
            VariantEvidence::RenbanGroupCounts(proof) => {
                proof.conflict.cells.len() + usize::from(proof.placement.is_some())
            }
            VariantEvidence::RenbanHouseSupport(proof) => match proof.paired_cell {
                Some(_) => proof.line_length + 2,
                None => proof.cells.len(),
            },
            VariantEvidence::RenbanSum(proof) => proof.cells.len(),
            VariantEvidence::RenbanSumHouse(proof) => proof.cells.len(),
            VariantEvidence::GroupLineHouseSupport(proof) => proof.cells.len(),
            VariantEvidence::GroupOrder(proof) => proof.cells.len(),
            VariantEvidence::GroupOrderElimination(proof) => proof.cells.len(),
            VariantEvidence::LinkedClue(proof) => proof.checks.len() + 1,
            VariantEvidence::MatchingDigit(proof) => proof.checks.len() + 1,
            VariantEvidence::MatchingLayout(proof) => {
                proof.cases.len()
                    + proof
                        .cases
                        .iter()
                        .map(|case| case.checks.len())
                        .sum::<usize>()
            }
            VariantEvidence::RegionSumDistinct(proof) => {
                proof.parts.iter().map(|part| part.cells.len()).sum()
            }
            VariantEvidence::RegionSumHouse(proof) => {
                proof
                    .lines
                    .iter()
                    .flat_map(|line| &line.parts)
                    .map(|part| part.cells.len())
                    .sum::<usize>()
                    + proof.remainder.len()
            }
            VariantEvidence::LockedDigit { clue, .. } => clue.cells.len(),
            VariantEvidence::QuadrupleLock { clues, .. } => {
                clues[0].cells.len() + clues[1].cells.len()
            }
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
            VariantEvidence::RuleForcing { .. } => 2,
            VariantEvidence::Classic { proof, .. } => proof.pattern_size(),
        };
        (
            self.technique.difficulty(),
            self.technique.cost(),
            checks,
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
    rectangle_guardians: OnceCell<bool>,
    rectangle_inference: RectangleInferenceCache,
    variant_inference: OnceCell<Box<InferenceGraph>>,
    grouped_inference: OnceCell<Box<InferenceGraph>>,
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

fn classic_proof(step: Deduction) -> VariantDeduction {
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
                .filter(|&technique| technique != selected && !technique.is_optional())
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
        Ok(self.rank_position_hints(&position, enabled, limit))
    }

    fn rank_position_hints<'a>(
        &'a self,
        position: &ProofPosition<'a>,
        enabled: &[VariantTechnique],
        limit: usize,
    ) -> Vec<VariantDeduction> {
        if limit == 0 {
            return Vec::new();
        }
        let mut techniques = enabled.to_vec();
        let tier = |technique: &VariantTechnique| (technique.difficulty(), technique.cost());
        techniques.sort_by_key(tier);
        let mut moves = Vec::<VariantDeduction>::new();
        for group in techniques.chunk_by(|a, b| tier(a) == tier(b)) {
            let mut hints: Vec<_> = group
                .iter()
                .flat_map(|&technique| self.explain(position, technique))
                .collect();
            hints.sort_by_cached_key(VariantDeduction::rank);
            for hint in hints {
                if moves.iter().all(|other| other.actions != hint.actions) {
                    moves.push(hint);
                    if moves.len() == limit {
                        return moves;
                    }
                }
            }
        }
        moves
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
            // The fallback examines the same position and can reuse its checks.
            for hint in self.rank_position_hints(&position, enabled, limit) {
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
            rectangle_guardians: OnceCell::new(),
            rectangle_inference: RectangleInferenceCache::default(),
            variant_inference: OnceCell::new(),
            grouped_inference: OnceCell::new(),
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
                .map(classic_proof)
        } else if let VariantTechnique::Classic(classic) = technique
            && self.uses_variant_chains(classic)
        {
            self.visit_variant_chains(position, classic, &mut ControlFlow::Break)
                .break_value()
                .map(classic_proof)
        } else if technique == VariantTechnique::EntropyQuadruple {
            self.entropy_proofs(position, technique, 1).pop()
        } else if technique == VariantTechnique::MatchingDigitContradiction {
            let mut proofs = Vec::new();
            self.matching_digit_proofs(position, &mut proofs, true);
            proofs.into_iter().next()
        } else if technique == VariantTechnique::MatchingLayoutForcing {
            let mut proofs = Vec::new();
            self.matching_layout_proofs(position, &mut proofs, true);
            proofs.into_iter().next()
        } else {
            self.local_proofs(position, technique)
                .into_iter()
                .next()
                .or_else(|| {
                    if technique == VariantTechnique::Classic(Technique::ForcingChain) {
                        return self.rule_forcing_proofs(position, 1).pop();
                    }
                    None
                })
                .or_else(|| {
                    self.group_sum_implications(position, technique, 1)
                        .into_iter()
                        .next()
                })
                .or_else(|| {
                    (technique == VariantTechnique::GlobalEntropy)
                        .then(|| self.entropy_proofs(position, technique, 1).pop())
                        .flatten()
                })
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
        let mut proofs = self.local_proofs(position, technique);
        if technique == VariantTechnique::Classic(Technique::ForcingChain) {
            proofs.extend(self.rule_forcing_proofs(position, usize::MAX));
        }
        proofs.extend(self.group_sum_implications(position, technique, usize::MAX));
        if technique == VariantTechnique::GlobalEntropy {
            proofs.extend(self.entropy_proofs(position, technique, usize::MAX));
        }
        proofs
    }

    fn local_proofs<'a>(
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
                        technique,
                        &[rule],
                        &cells,
                        super::global_entropy::support_in_groups(
                            domains,
                            self.global_entropy_groups,
                        )
                        .into_iter(),
                    ) {
                        proofs.push(proof);
                    }
                }
                for (rule, cells, group) in self.entropy_group_windows() {
                    let domains = cells.map(|cell| position.domain(cell));
                    if let Some(proof) = position.explain_constraint(
                        technique,
                        &[rule],
                        &cells,
                        super::global_entropy::support_repeated_group(domains, group).into_iter(),
                    ) {
                        proofs.push(proof);
                    }
                }
            }
            Quadruple => self.quadruple_proofs(position, &mut proofs),
            LetteredQuadruples => {
                if let Some(clue) = &self.lettered_quadruples {
                    let cells: [usize; CELLS] = std::array::from_fn(|cell| cell);
                    let domains = cells.map(|cell| position.domain(cell));
                    let supported = clue.hint_support(&domains);
                    if !supported.contains(&0) {
                        // A shared key can affect the entire puzzle. Explain
                        // one cell at a time and retain the domains used by it.
                        let mut local = domains;
                        for cell in cells {
                            local[cell] = supported[cell];
                            if let Some(proof) = position.explain_constraint(
                                technique,
                                &[clue.rule],
                                &cells,
                                local.into_iter(),
                            ) {
                                proofs.push(proof);
                            }
                            local[cell] = domains[cell];
                        }
                    }
                }
            }
            EntropyQuadruple => return self.entropy_proofs(position, technique, usize::MAX),
            CageCombinations => self.cage_combinations(position, &mut proofs),
            CageHouseSum => self.cage_house_sums(position, &mut proofs),
            LockedCandidates => {
                self.locked_candidates(position, &mut proofs);
                self.quadruple_locks(position, &mut proofs);
                self.peer_locks(position, &mut proofs);
            }
            NonConsecutiveLockedPair
            | NonConsecutiveLockedTriple
            | NonConsecutiveBivalue
            | NonConsecutiveTrivalue => {
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
            ConditionalNeighbor => {
                self.conditional_neighbor_proofs(position, technique, &mut proofs);
            }
            DigitRestriction => {
                proofs.extend(self.digit_restriction_clues.iter().filter_map(|clue| {
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
                self.direct_pair_proofs(position, technique, &mut proofs)
            }
            WhispersHouseSupport => self.whispers_house_proofs(position, &mut proofs),
            RenbanLockedDigit => self.renban_locks(position, &mut proofs),
            RenbanGroupCounts => self.renban_group_counts(position, &mut proofs),
            RenbanHouseSupport => self.renban_house_support(position, &mut proofs),
            LittleKillerHouseSupport | RenbanSumRayHouses => {
                self.ray_house_proofs(position, technique, &mut proofs);
            }
            RenbanSum => self.renban_sum_proofs(position, technique, &mut proofs),
            RenbanSumHouse => self.renban_sum_house_proofs(position, technique, &mut proofs),
            GroupLineHouseSupport => self.group_line_house_proofs(position, &mut proofs),
            GroupOrderContradiction => self.group_order_proofs(position, &mut proofs),
            GroupOrderElimination => self.group_order_eliminations(position, &mut proofs),
            LinkedClueContradiction => self.linked_clue_proofs(position, &mut proofs),
            MatchingDigitContradiction => self.matching_digit_proofs(position, &mut proofs, false),
            MatchingLayoutForcing => self.matching_layout_proofs(position, &mut proofs, false),
            RegionSumDistinct => self.region_sum_distinct_proofs(position, &mut proofs),
            RegionSumHouse => self.region_sum_house_proofs(position, &mut proofs),
            ThermometerHouseSupport => self.thermometer_house_proofs(position, &mut proofs),
            ArrowHouseSupport => self.arrow_house_proofs(position, &mut proofs),
            KropkiHouseSupport => self.kropki_house_proofs(position, &mut proofs),
            Arrow | PillArrow | Between | Lockout | ConsecutiveRun | InsideGrid | DistinctCells
            | Entropic | Modular | DigitOrder | LittleKiller | RegionSum | Renban | Sandwich
            | Skyscrapers | XSum => {
                self.direct_line_proofs(position, technique, &mut proofs);
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
            VariantTechnique::Classic(
                Technique::XYWing | Technique::XYZWing | Technique::ForcingChain,
            ) if self.region_logic && !self.classic_boxes => true,
            VariantTechnique::Classic(Technique::HiddenSingleBox) if self.extended_logic => true,
            VariantTechnique::Classic(classic) if self.uses_variant_chains(classic) => true,
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
        if self.extended_logic && technique == Technique::HiddenSingleBox && !self.classic_boxes {
            self.region_singles(position, proofs);
            return;
        }
        if self.region_logic && !self.classic_boxes {
            if matches!(technique, Technique::XYWing | Technique::XYZWing) {
                let _ = crate::hints::visit_variant_wings(
                    &position.board,
                    &position.masks,
                    &self.peers,
                    technique,
                    &mut |step| {
                        proofs.push(classic_proof(step));
                        ControlFlow::Continue(())
                    },
                );
                return;
            }
            // The variant forcing proof follows the actual region geometry.
            if technique == Technique::ForcingChain {
                return;
            }
        }
        if !self.supports_technique(variant) {
            return;
        }
        if self.uses_variant_chains(technique) {
            let _ = self.visit_variant_chains(position, technique, &mut |step| {
                proofs.push(classic_proof(step));
                ControlFlow::Continue(())
            });
            return;
        }
        if self.classic_search_is_empty(position, technique) {
            return;
        }
        if technique.pattern_overlay_width().is_some() {
            let _ = self.overlay_search(position).visit(technique, &mut |step| {
                proofs.push(classic_proof(step));
                ControlFlow::Continue(())
            });
            return;
        }
        // A completion witnesses the outer assumptions it satisfies. Each
        // remaining contradiction still needs the original logical proof.
        let solution = (technique == Technique::NestedForcingNet)
            .then(|| {
                let eliminations = std::array::from_fn(|cell| {
                    if position.board[cell] == 0 {
                        DIGITS & !position.masks[cell]
                    } else {
                        0
                    }
                });
                self.solve_for_proof(&position.board, &eliminations, COMPLETION_PROBE_NODES)
                    .ok()
            })
            .flatten();
        let completion_support = (technique == Technique::NestedForcingNet)
            .then(|| {
                position
                    .overlay
                    .get()
                    .and_then(|overlay| overlay.borrow().known_completion_support().copied())
            })
            .flatten();
        let search = DeductionSearch::with_verified_solution(
            &position.board,
            &position.masks,
            solution.as_ref(),
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
        if self.extended_logic && technique == Technique::HiddenSingleBox {
            self.region_singles(position, proofs);
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
}
