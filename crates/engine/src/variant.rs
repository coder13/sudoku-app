//! Typed rules for a single 9 × 9 grid.

use crate::{Board, CELLS, DIGITS};

#[cfg(any(feature = "generation", test))]
mod generation;
mod lines;
mod logical;
mod pairs;
#[cfg(any(feature = "teaching", test))]
mod practice;
mod quadruple;
mod search;
mod symmetry;
mod visibility;
#[cfg(feature = "wasm-api")]
mod wire;

#[cfg(any(feature = "generation", test))]
pub use generation::{
    GeneratedVariant, MarkerFamily, OutsideClueKind, VariantClueLayout, VariantGenerationError,
    VariantGenerationOptions, start_variant_generation,
};
use lines::LineConstraint;
pub use logical::{
    VARIANT_SCORING_VERSION, VariantClueScope, VariantDeduction, VariantEvidence, VariantExclusionPremise, VariantLineHouseProof,
    VariantLogicalError, VariantRating, VariantReplay, VariantTechnique, VariantTrace,
};
use pairs::{PairClue, PairCompiler, PairConstraint, ParityClue};
#[cfg(all(
    feature = "teaching",
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
pub(crate) use practice::generate_practice_example;
#[cfg(any(feature = "teaching", test))]
pub use practice::{VariantPracticeError, VariantPracticeExercise, variant_practice_examples};
use quadruple::Quadruple;
pub use search::VariantPositionError;
pub(crate) use symmetry::SquareTransform;
pub use symmetry::canonical_variant;
pub use visibility::{VariantVisibility, VariantVisibilityError};

/// The version of the structured puzzle and position format.
pub const VARIANT_FORMAT_VERSION: u32 = 1;
/// Default maximum nodes for a variant exact search.
pub const DEFAULT_VARIANT_SEARCH_NODES: u32 = crate::SEARCH_LIMIT;

/// Which of the two long diagonals to require as a house.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum Diagonal {
    /// The diagonal from the top-left to the bottom-right cell.
    Main,
    /// The diagonal from the top-right to the bottom-left cell.
    Anti,
}

impl Diagonal {
    fn cells(self) -> [usize; 9] {
        std::array::from_fn(|row| match self {
            Self::Main => row * 10,
            Self::Anti => row * 8 + 8,
        })
    }
}

/// The nine regions used alongside the rows and columns.
#[derive(Clone, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)
)]
pub enum RegionLayout {
    /// Standard 3 × 3 boxes in row-major order.
    #[default]
    Boxes,
    /// Nine orthogonally connected regions that partition the grid.
    Jigsaw {
        /// Regions in caller-supplied order, each with nine cell indices.
        regions: Vec<Vec<usize>>,
    },
}

/// Which digits a parity rule allows.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum Parity {
    /// The digits 1, 3, 5, 7, and 9.
    Odd,
    /// The digits 2, 4, 6, and 8.
    Even,
}

/// Marked cell pairs and the optional negative rule for this marker type.
#[derive(Clone, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(default, deny_unknown_fields)
)]
pub struct MarkedPairs {
    /// Orthogonally adjacent cell pairs carrying this marker.
    pub pairs: Vec<[usize; 2]>,
    /// Exclude this relationship on adjacent pairs with no marker from the same family.
    pub negative: bool,
}

/// Direction from an outside clue into the grid.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum ClueDirection {
    /// Up one row per cell.
    North,
    /// Up one row and right one column per cell.
    NorthEast,
    /// Right one column per cell.
    East,
    /// Down one row and right one column per cell.
    SouthEast,
    /// Down one row per cell.
    South,
    /// Down one row and left one column per cell.
    SouthWest,
    /// Left one column per cell.
    West,
    /// Up one row and left one column per cell.
    NorthWest,
}

impl ClueDirection {
    const ALL: [Self; 8] = [
        Self::North,
        Self::NorthEast,
        Self::East,
        Self::SouthEast,
        Self::South,
        Self::SouthWest,
        Self::West,
        Self::NorthWest,
    ];

    fn delta(self) -> (i8, i8) {
        match self {
            Self::North => (-1, 0),
            Self::NorthEast => (-1, 1),
            Self::East => (0, 1),
            Self::SouthEast => (1, 1),
            Self::South => (1, 0),
            Self::SouthWest => (1, -1),
            Self::West => (0, -1),
            Self::NorthWest => (-1, -1),
        }
    }
}

// One list supplies the wire identifiers and the protocol's supported-rule check.
macro_rules! rules {
    ($(
        $(#[$doc:meta])*
        $variant:ident => $id:literal { $($(#[$field_doc:meta])* $field:ident: $ty:ty),* $(,)? }
    )+) => {
        /// A typed constraint layered on top of rows, columns, and the selected regions.
        #[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        #[cfg_attr(feature = "wasm-api", derive(serde::Deserialize, serde::Serialize), serde(tag = "type", rename_all_fields = "camelCase", deny_unknown_fields))]
        pub enum PuzzleRule {
            $($(#[$doc])*
            #[cfg_attr(feature = "wasm-api", serde(rename = $id))]
            $variant {$($(#[$field_doc])* $field: $ty),*}),+
        }

        impl PuzzleRule {
            /// Stable wire identifier for the rule family.
            pub const fn id(&self) -> &'static str {
                match self { $(Self::$variant { .. } => $id),+ }
            }

            #[cfg(all(feature = "wasm-api", any(target_arch = "wasm32", test, feature = "cli")))]
            pub(crate) fn supports_id(id: &str) -> bool {
                matches!(id, $($id)|+)
            }
        }
    };
}

rules! {
    /// Require an additional long diagonal to contain each digit once.
    Diagonal => "diagonal" {
        /// Which diagonal to constrain.
        diagonal: Diagonal,
    }
    /// Require an arbitrary set of nine cells to contain each digit once.
    ExtraHouse => "extra-house" {
        /// Cell indices in the house.
        cells: Vec<usize>,
    }
    /// Constrain disjoint cages to given sums and distinct digits.
    KillerCages => "killer-cages" {
        /// The cages, which may have gaps between them in a mixed puzzle.
        cages: Vec<KillerCage>,
        /// Require all cells to belong to a cage.
        #[cfg_attr(feature = "wasm-api", serde(default))]
        cover_grid: bool,
    }
    /// Require the printed digit occurrences in the four cells touching a circle.
    Quadruple => "quadruple" {
        /// Top-left cell index of the four-cell area.
        top_left: usize,
        /// One to four required digit occurrences, in any order.
        digits: Vec<u8>,
    }
    /// Restrict cells to odd or even digits.
    Parity => "parity" {
        /// Affected cell indices.
        cells: Vec<usize>,
        /// Allowed parity.
        parity: Parity,
    }
    /// Require corresponding cells in cloned shapes to contain matching digits.
    Clone => "clone" {
        /// Each set contains the corresponding cell indices for one shared digit.
        groups: Vec<Vec<usize>>,
    }
    /// A chess knight's move cannot connect equal digits.
    AntiKnight => "anti-knight" {}
    /// A chess king's move cannot connect equal digits.
    AntiKing => "anti-king" {}
    /// Orthogonally adjacent digits cannot differ by one, except on listed edges.
    NonConsecutive => "non-consecutive" {
        /// Exempt unordered edge-sharing pairs. An exception does not require consecutive digits.
        /// Use an additional Kropki rule to require a white dot's difference of one.
        #[cfg_attr(feature = "wasm-api", serde(default, skip_serializing_if = "Vec::is_empty"))]
        except: Vec<[usize; 2]>,
    }
    /// Require the digit in one cell to be less than the digit in another.
    Inequality => "inequality" {
        /// Cell with the smaller digit.
        less: usize,
        /// Cell with the larger digit.
        greater: usize,
    }
    /// Constrain adjacent digits using Kropki dots.
    Kropki => "kropki" {
        /// White dots for consecutive digits.
        #[cfg_attr(feature = "wasm-api", serde(default))]
        consecutive: MarkedPairs,
        /// Black dots for a ratio of two.
        #[cfg_attr(feature = "wasm-api", serde(default))]
        ratio_two: MarkedPairs,
    }
    /// Constrain adjacent digits using V and X markers.
    Xv => "xv" {
        /// V markers for a sum of five.
        #[cfg_attr(feature = "wasm-api", serde(default))]
        five: MarkedPairs,
        /// X markers for a sum of ten.
        #[cfg_attr(feature = "wasm-api", serde(default))]
        ten: MarkedPairs,
    }
    /// Require the digits in two edge-sharing cells to add to the given total.
    /// Totals of five and ten also count as positive V and X marks.
    AdjacentTotal => "adjacent-total" {
        /// Two distinct orthogonally adjacent cell indices, in source order.
        cells: [usize; 2],
        /// Total from three through seventeen.
        sum: u8,
    }
    /// Require digits to increase strictly from the bulb to the tip.
    Thermometer => "thermometer" {
        /// Cell indices in order, starting at the bulb.
        cells: Vec<usize>,
    }
    /// Require an ordered line to read the same in both directions.
    Palindrome => "palindrome" {
        /// Distinct cell indices in logical order, paired from opposite ends.
        cells: Vec<usize>,
        /// Optional drawing paths when the visible clue has several segments.
        /// Their union must equal `cells`; they do not change the mirrored pairs.
        /// Drawing paths may revisit cells.
        #[cfg_attr(feature = "wasm-api", serde(default, skip_serializing_if = "Option::is_none"))]
        segments: Option<Vec<Vec<usize>>>,
    }
    /// Require neighboring digits along the line to differ by a given amount.
    Whispers => "whispers" {
        /// Ordered walk, including repeated cells at closures or revisits.
        /// At most 82 references, with distinct consecutive cells.
        cells: Vec<usize>,
        /// Minimum difference between consecutive cells on the line.
        min_difference: u8,
    }
    /// Require the path's digits to add to the digit in a circle.
    Arrow => "arrow" {
        /// Index of the circle cell.
        circle: usize,
        /// Distinct cell indices in path order, excluding the circle.
        cells: Vec<usize>,
    }
    /// Require a set of consecutive digits in any order without repetition.
    Renban => "renban" {
        /// Cell indices in line order.
        cells: Vec<usize>,
    }
    /// Require each interior digit to fall strictly between the endpoint digits.
    Between => "between" {
        /// Cell indices in line order, including both endpoints.
        cells: Vec<usize>,
    }
    /// Require equal sums in the parts of a line divided by region borders.
    RegionSum => "region-sum" {
        /// Cell indices in line order. The puzzle's boxes or Jigsaw regions divide the line.
        cells: Vec<usize>,
        /// Combine separate visits to the same region into one sum.
        #[cfg_attr(feature = "wasm-api", serde(default))]
        group_by_region: bool,
    }
    /// Require a sum between the 1 and the 9 in a row or column.
    Sandwich => "sandwich" {
        /// The row or column, ordered from the clue into the grid.
        cells: Vec<usize>,
        /// Direction from the clue.
        direction: ClueDirection,
        /// Sum of digits strictly between 1 and 9.
        sum: u16,
    }
    /// Require the sum of an entire diagonal. Other rules determine whether digits can repeat.
    LittleKiller => "little-killer" {
        /// The diagonal, ordered from the clue into the grid.
        cells: Vec<usize>,
        /// Diagonal direction from the clue.
        direction: ClueDirection,
        /// Sum of all digits on the diagonal.
        sum: u16,
    }
    /// Require a sum of the first X digits of a row or column, where X is the first digit.
    XSum => "x-sum" {
        /// The row or column, ordered from the clue into the grid.
        cells: Vec<usize>,
        /// Direction from the clue.
        direction: ClueDirection,
        /// Sum of the prefix, including its first digit.
        sum: u16,
    }
    /// Count the successive new maximum digits along a row or column.
    Skyscrapers => "skyscrapers" {
        /// The row or column, ordered from the clue into the grid.
        cells: Vec<usize>,
        /// Direction from the clue.
        direction: ClueDirection,
        /// Number of digits visible from the clue.
        count: u8,
    }
}

/// A set of cells whose distinct digits must add to a target.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(deny_unknown_fields)
)]
pub struct KillerCage {
    /// Cell indices in the cage.
    pub cells: Vec<usize>,
    /// Required sum of the digits in the cage.
    pub sum: u16,
}

/// Versioned givens and rules for a 9 × 9 Sudoku puzzle.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(deny_unknown_fields)
)]
pub struct VariantPuzzle {
    /// Structured format version.
    pub version: u32,
    /// Fixed digits in row-major order.
    #[cfg_attr(feature = "wasm-api", serde(with = "wire::grid"))]
    pub givens: Board,
    /// Boxes or replacement regions.
    #[cfg_attr(feature = "wasm-api", serde(default))]
    pub regions: RegionLayout,
    /// Additional rules enforced together.
    #[cfg_attr(feature = "wasm-api", serde(default))]
    pub rules: Vec<PuzzleRule>,
}

impl VariantPuzzle {
    /// The structured equivalent of an 81-character classic puzzle.
    pub fn classic(givens: Board) -> Self {
        Self {
            version: VARIANT_FORMAT_VERSION,
            givens,
            regions: RegionLayout::Boxes,
            rules: Vec::new(),
        }
    }

    /// Classic boxes with both long diagonals as additional houses.
    pub fn x_sudoku(givens: Board) -> Self {
        Self {
            rules: [Diagonal::Main, Diagonal::Anti]
                .map(|diagonal| PuzzleRule::Diagonal { diagonal })
                .to_vec(),
            ..Self::classic(givens)
        }
    }

    /// Replace the classic boxes with irregular regions.
    pub fn jigsaw(givens: Board, regions: Vec<Vec<usize>>) -> Self {
        Self {
            regions: RegionLayout::Jigsaw { regions },
            ..Self::classic(givens)
        }
    }

    /// Classic boxes and Killer cages that cover the grid.
    pub fn killer(givens: Board, cages: Vec<KillerCage>) -> Self {
        Self {
            rules: vec![PuzzleRule::KillerCages {
                cages,
                cover_grid: true,
            }],
            ..Self::classic(givens)
        }
    }

    /// Classic boxes and the four inner Windoku houses.
    pub fn windoku(givens: Board) -> Self {
        let mut puzzle = Self::classic(givens);
        for top in [1, 5] {
            for left in [1, 5] {
                let cells = (0..9).map(|i| (top + i / 3) * 9 + left + i % 3).collect();
                puzzle.rules.push(PuzzleRule::ExtraHouse { cells });
            }
        }
        puzzle
    }

    /// Classic boxes and nine houses with one corresponding cell from each box.
    pub fn disjoint_groups(givens: Board) -> Self {
        let rules = (0..9)
            .map(|offset| PuzzleRule::ExtraHouse {
                cells: (0..9)
                    .map(|group| group / 3 * 27 + group % 3 * 3 + offset / 3 * 9 + offset % 3)
                    .collect(),
            })
            .collect();
        Self {
            rules,
            ..Self::classic(givens)
        }
    }

    /// Classic boxes with Anti-Knight, Anti-King, and orthogonal Non-Consecutive rules.
    pub fn miracle(givens: Board) -> Self {
        Self {
            rules: vec![
                PuzzleRule::AntiKnight {},
                PuzzleRule::AntiKing {},
                PuzzleRule::NonConsecutive { except: vec![] },
            ],
            ..Self::classic(givens)
        }
    }

    /// Validate the definition and precompute the topology and constraint data.
    ///
    /// The compiled puzzle can analyze multiple positions with the same givens and rules.
    pub fn compile(&self) -> Result<CompiledVariant, VariantDefinitionError> {
        self.compile_with_regions(true)
    }

    fn compile_with_regions(
        &self,
        enforce_regions: bool,
    ) -> Result<CompiledVariant, VariantDefinitionError> {
        self.compile_with_xv_exemptions(enforce_regions, &[])
    }

    // A dependency check removes mathematical constraints, not the visible
    // locations of V/X marks that exempt edges from a negative rule.
    fn compile_with_xv_exemptions(
        &self,
        enforce_regions: bool,
        exemptions: &[[usize; 2]],
    ) -> Result<CompiledVariant, VariantDefinitionError> {
        if self.version != VARIANT_FORMAT_VERSION {
            return Err(VariantDefinitionError::UnsupportedVersion(self.version));
        }
        if let Some(cell) = self.givens.iter().position(|&digit| digit > 9) {
            return Err(VariantDefinitionError::InvalidGiven(cell));
        }

        let mut compiled = CompiledVariant {
            givens: self.givens,
            classic_boxes: matches!(self.regions, RegionLayout::Boxes),
            houses: Vec::new(),
            house_masks: Vec::new(),
            search_houses: Vec::new(),
            memberships: std::array::from_fn(|_| Vec::new()),
            peers: [0; CELLS],
            cages: Vec::new(),
            allowed_digits: [DIGITS; CELLS],
            pairs: Vec::new(),
            lines: Vec::new(),
            quadruples: Vec::new(),
            pair_clues: Vec::new(),
            pair_clue_memberships: std::array::from_fn(|_| Vec::new()),
            parity_clues: Vec::new(),
            extra_rule_cells: 0,
        };

        for i in 0..9 {
            compiled.add_house(
                VariantHouseKind::Row(i),
                std::array::from_fn(|column| 9 * i + column),
            )?;
        }
        for i in 0..9 {
            compiled.add_house(
                VariantHouseKind::Column(i),
                std::array::from_fn(|row| 9 * row + i),
            )?;
        }
        compiled.add_regions(&self.regions)?;
        if !enforce_regions {
            // Keep the region geometry for Region Sum lines and remove only
            // the all-different rule, for uniqueness comparisons in generation.
            compiled.peers = [0; CELLS];
            for i in 0..18 {
                compiled.add_peers(compiled.house_masks[i]);
            }
        }
        let mut occupied_cages = 0;
        let mut pairs = PairCompiler::default();
        pairs.exempt_xv_edges(exemptions);
        for (index, rule) in self.rules.iter().enumerate() {
            match rule {
                PuzzleRule::Diagonal { diagonal } => {
                    compiled.add_house(VariantHouseKind::Diagonal(*diagonal), diagonal.cells())?;
                }
                PuzzleRule::ExtraHouse { cells } => {
                    let house = VariantHouseKind::Extra(index);
                    let cells = cells
                        .as_slice()
                        .try_into()
                        .map_err(|_| VariantDefinitionError::InvalidHouse(house))?;
                    compiled.add_house(house, cells)?;
                }
                PuzzleRule::KillerCages { cages, cover_grid } => {
                    let first_cage = compiled.cages.len();
                    for (cage_index, cage) in cages.iter().enumerate() {
                        compiled.add_cage(cage, index, cage_index, &mut occupied_cages)?;
                    }
                    if *cover_grid
                        && compiled.cages[first_cage..]
                            .iter()
                            .map(|cage| cage.cells.len())
                            .sum::<usize>()
                            != CELLS
                    {
                        return Err(VariantDefinitionError::IncompleteCages);
                    }
                }
                PuzzleRule::Quadruple { top_left, digits } => {
                    let clue =
                        Quadruple::compile(&compiled, index, *top_left, digits, enforce_regions)?;
                    compiled.quadruples.push(clue);
                }
                PuzzleRule::Arrow { .. }
                | PuzzleRule::Renban { .. }
                | PuzzleRule::Between { .. }
                | PuzzleRule::RegionSum { .. }
                | PuzzleRule::Sandwich { .. }
                | PuzzleRule::LittleKiller { .. }
                | PuzzleRule::XSum { .. }
                | PuzzleRule::Skyscrapers { .. } => {
                    let line = LineConstraint::compile(&mut compiled, index, rule)?;
                    compiled.lines.push(line);
                }
                rule => pairs.compile_rule(&mut compiled, index, rule)?,
            }
        }
        pairs.finish(&mut compiled);
        // Region geometry can remain available for sum lines after a generation
        // dependency check removes its distinctness rule. Propagate only houses
        // whose cells are actually pairwise excluded by the compiled topology.
        compiled.search_houses = compiled.house_masks.iter().enumerate()
            .filter_map(|(index, &mask)| {
                cells_in(mask).all(|cell| {
                    let others = mask & !(1u128 << cell);
                    compiled.peers[cell] & others == others
                }).then_some(index)
            })
            .collect();
        compiled.extra_rule_cells = compiled.house_masks[27..]
            .iter()
            .copied()
            .chain(
                compiled
                    .cages
                    .iter()
                    .map(|cage| cell_mask(&cage.cells).unwrap()),
            )
            .chain(
                compiled
                    .lines
                    .iter()
                    .map(|line| cell_mask(&line.cells).unwrap()),
            )
            .chain(
                compiled
                    .pair_clues
                    .iter()
                    .map(|clue| cell_mask(&clue.cells).unwrap()),
            )
            .chain(
                compiled
                    .quadruples
                    .iter()
                    .map(|clue| cell_mask(&clue.cells).unwrap()),
            )
            .chain(compiled.parity_clues.iter().map(|clue| 1u128 << clue.cell))
            .fold(0, |cells, scope| cells | scope);
        Ok(compiled)
    }
}

/// A versioned puzzle with placed digits and established candidate removals.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(deny_unknown_fields)
)]
pub struct VariantPosition {
    /// The puzzle and rules for this position.
    pub puzzle: VariantPuzzle,
    /// Digits placed since the start.
    #[cfg_attr(
        feature = "wasm-api",
        serde(default = "wire::empty_grid", with = "wire::grid")
    )]
    pub entries: Board,
    /// Candidate removals, with bit 0 for digit 1 through bit 8 for digit 9.
    #[cfg_attr(
        feature = "wasm-api",
        serde(default = "wire::empty_masks", with = "wire::masks")
    )]
    pub eliminations: [u16; CELLS],
}

impl VariantPosition {
    /// Start from the givens with no placed digits or candidate removals.
    pub fn new(puzzle: VariantPuzzle) -> Self {
        Self {
            puzzle,
            entries: [0; CELLS],
            eliminations: [0; CELLS],
        }
    }

    fn record_actions(&mut self, actions: &[crate::HintAction]) {
        crate::position::record_actions(&mut self.entries, &mut self.eliminations, actions);
    }
}

/// Identity of a house in the compiled rule set.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum VariantHouseKind {
    /// Row index.
    Row(usize),
    /// Column index.
    Column(usize),
    /// Standard box or irregular region index.
    Region(usize),
    /// A declared diagonal.
    Diagonal(Diagonal),
    /// The index of the rule that defines this house.
    Extra(usize),
}

/// A compiled house with nine cells that must contain distinct digits.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VariantHouse {
    /// Identity of the house within the rule set.
    pub kind: VariantHouseKind,
    /// Cell indices in the house.
    pub cells: [usize; 9],
}

/// Invalid configuration of the versioned puzzle definition.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VariantDefinitionError {
    /// This compiler does not support the format version.
    UnsupportedVersion(u32),
    /// A given digit exceeds 9 at the supplied cell index.
    InvalidGiven(usize),
    /// The Jigsaw layout is missing regions or has extra regions.
    InvalidRegionCount,
    /// A house has the wrong size, repeats a cell, or references a cell outside the grid.
    InvalidHouse(VariantHouseKind),
    /// An irregular region contains disconnected cells.
    DisconnectedRegion(usize),
    /// Two irregular regions share a cell.
    OverlappingRegion(usize),
    /// A cage contains invalid or repeated cells, or has an invalid size.
    InvalidCage(usize),
    /// A cage overlaps another cage.
    OverlappingCage(usize),
    /// No distinct digits can satisfy the cage sum for its size.
    InvalidCageSum(usize),
    /// A rule requires a cage in every cell, but its cages leave gaps.
    IncompleteCages,
    /// A rule has invalid, repeated, or insufficient cell references or an invalid parameter.
    InvalidRule(usize),
}

/// Validated topology and rule data reusable across positions of one puzzle.
#[derive(Clone, Debug)]
pub struct CompiledVariant {
    givens: Board,
    classic_boxes: bool,
    houses: Vec<VariantHouse>,
    house_masks: Vec<u128>,
    search_houses: Vec<usize>,
    memberships: [Vec<usize>; CELLS],
    peers: [u128; CELLS],
    cages: Vec<CompiledCage>,
    allowed_digits: [u16; CELLS],
    pairs: Vec<PairConstraint>,
    lines: Vec<LineConstraint>,
    quadruples: Vec<Quadruple>,
    pair_clues: Vec<PairClue>,
    pair_clue_memberships: [Vec<usize>; CELLS],
    parity_clues: Vec<ParityClue>,
    extra_rule_cells: u128,
}

#[derive(Clone, Debug)]
struct CompiledCage {
    cells: Vec<usize>,
    sum: u16,
    // The source rule and cage within it, for evidence and replay.
    reference: [usize; 2],
    combinations: Vec<u16>,
}

impl CompiledVariant {
    fn are_primary_peers(&self, first: usize, second: usize, enforce_regions: bool) -> bool {
        first != second
            && (first / 9 == second / 9
                || first % 9 == second % 9
                || enforce_regions && self.memberships[first][2] == self.memberships[second][2])
    }

    /// Original givens of the compiled puzzle.
    pub fn givens(&self) -> &Board {
        &self.givens
    }

    /// Houses in stable order, with rows, columns, and regions followed by extra houses.
    pub fn houses(&self) -> &[VariantHouse] {
        &self.houses
    }

    /// Indices into `houses()` of the houses containing the cell.
    pub fn houses_at(&self, cell: usize) -> Option<&[usize]> {
        self.memberships.get(cell).map(Vec::as_slice)
    }

    /// Common cells of two houses. An invalid house index returns `None`.
    pub fn intersection(&self, first: usize, second: usize) -> Option<impl Iterator<Item = usize>> {
        Some(cells_in(
            *self.house_masks.get(first)? & *self.house_masks.get(second)?,
        ))
    }

    /// Cells that cannot share a digit with this cell, including cage peers.
    pub fn peers(&self, cell: usize) -> Option<impl Iterator<Item = usize>> {
        self.peers.get(cell).copied().map(cells_in)
    }

    fn add_regions(&mut self, regions: &RegionLayout) -> Result<(), VariantDefinitionError> {
        match regions {
            RegionLayout::Boxes => {
                for i in 0..9 {
                    self.add_house(
                        VariantHouseKind::Region(i),
                        std::array::from_fn(|offset| {
                            27 * (i / 3) + 3 * (i % 3) + 9 * (offset / 3) + offset % 3
                        }),
                    )?;
                }
            }
            RegionLayout::Jigsaw { regions } => {
                if regions.len() != 9 {
                    return Err(VariantDefinitionError::InvalidRegionCount);
                }
                let mut covered = 0;
                for (i, region) in regions.iter().enumerate() {
                    let kind = VariantHouseKind::Region(i);
                    let cells = region
                        .as_slice()
                        .try_into()
                        .map_err(|_| VariantDefinitionError::InvalidHouse(kind))?;
                    let mask =
                        cell_mask(region).ok_or(VariantDefinitionError::InvalidHouse(kind))?;
                    if covered & mask != 0 {
                        return Err(VariantDefinitionError::OverlappingRegion(i));
                    }
                    if !connected(mask) {
                        return Err(VariantDefinitionError::DisconnectedRegion(i));
                    }
                    covered |= mask;
                    self.add_house(kind, cells)?;
                }
                // Nine disjoint regions of nine valid cells necessarily cover the grid.
            }
        }
        Ok(())
    }

    fn add_house(
        &mut self,
        kind: VariantHouseKind,
        cells: [usize; 9],
    ) -> Result<(), VariantDefinitionError> {
        let mask = cell_mask(&cells).ok_or(VariantDefinitionError::InvalidHouse(kind))?;
        let index = self.houses.len();
        for cell in cells {
            self.memberships[cell].push(index);
        }
        self.add_peers(mask);
        self.houses.push(VariantHouse { kind, cells });
        self.house_masks.push(mask);
        Ok(())
    }

    fn add_cage(
        &mut self,
        cage: &KillerCage,
        rule_index: usize,
        cage_index: usize,
        occupied: &mut u128,
    ) -> Result<(), VariantDefinitionError> {
        let index = self.cages.len();
        if cage.cells.is_empty() || cage.cells.len() > 9 {
            return Err(VariantDefinitionError::InvalidCage(index));
        }
        let mask = cell_mask(&cage.cells).ok_or(VariantDefinitionError::InvalidCage(index))?;
        if *occupied & mask != 0 {
            return Err(VariantDefinitionError::OverlappingCage(index));
        }
        let combinations: Vec<u16> = (1..=DIGITS)
            .filter(|&digits| digits.count_ones() as usize == cage.cells.len())
            .filter(|&digits| digit_sum(digits) == cage.sum)
            .collect();
        if combinations.is_empty() {
            return Err(VariantDefinitionError::InvalidCageSum(index));
        }
        self.add_peers(mask);
        self.cages.push(CompiledCage {
            cells: cage.cells.clone(),
            sum: cage.sum,
            reference: [rule_index, cage_index],
            combinations,
        });
        *occupied |= mask;
        Ok(())
    }

    fn add_peers(&mut self, mask: u128) {
        for cell in cells_in(mask) {
            self.peers[cell] |= mask & !(1 << cell);
        }
    }
}

fn cell_mask(cells: &[usize]) -> Option<u128> {
    cells.iter().try_fold(0, |mask, &cell| {
        if cell >= CELLS {
            return None;
        }
        let bit = 1 << cell;
        (mask & bit == 0).then_some(mask | bit)
    })
}

fn cells_in(mut mask: u128) -> impl Iterator<Item = usize> {
    std::iter::from_fn(move || {
        if mask == 0 {
            return None;
        }
        let cell = mask.trailing_zeros() as usize;
        mask &= mask - 1;
        Some(cell)
    })
}

fn connected(mask: u128) -> bool {
    let mut visited = 0;
    let mut pending = 1 << mask.trailing_zeros();
    while let Some(cell) = cells_in(pending).next() {
        let bit = 1 << cell;
        pending &= !bit;
        visited |= bit;
        let (row, col) = (cell / 9, cell % 9);
        let mut adjacent = 0;
        if row > 0 {
            adjacent |= bit >> 9;
        }
        if row < 8 {
            adjacent |= bit << 9;
        }
        if col > 0 {
            adjacent |= bit >> 1;
        }
        if col < 8 {
            adjacent |= bit << 1;
        }
        pending |= adjacent & mask & !visited;
    }
    visited == mask
}

fn digit_sum(mask: u16) -> u16 {
    crate::hints::digits(mask).map(u16::from).sum()
}
