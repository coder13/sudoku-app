use super::Difficulty;

// The same entries define the enum, the exhaustive inventory, and its metadata.
macro_rules! catalog {
    ($($name:ident: $id:literal, $cost:literal, $level:ident, $unique:literal, [$($alias:literal),*];)+) => {
        /// A deduction rule with a stable ID, point cost, and difficulty tier.
        #[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
        pub enum Technique {
            $(#[doc = concat!("Catalog technique `", $id, "`, with a reference cost of ", stringify!($cost), " points.")]
            $name),+
        }

        impl Technique {
            /// Every supported detector in catalog order.
            pub const ALL: [Self; [$(Self::$name),+].len()] = [$(Self::$name),+];

            /// The stable identifier to store in profiles and send across the wire.
            pub const fn id(self) -> &'static str {
                match self { $(Self::$name => $id),+ }
            }

            /// Look up a technique by its exact, case-sensitive identifier.
            pub fn from_id(id: &str) -> Option<Self> {
                match id { $($id => Some(Self::$name),)+ _ => None }
            }

            /// Alternate display names for the technique.
            pub const fn aliases(self) -> &'static [&'static str] {
                match self { $(Self::$name => &[$($alias),*]),+ }
            }

            /// Reference point cost; evidence-sensitive scoring may adjust each deduction.
            pub const fn cost(self) -> u16 {
                match self { $(Self::$name => $cost),+ }
            }

            /// Lowest evidence-adjusted point cost this technique can receive.
            pub const fn minimum_cost(self) -> u16 {
                match self {
                    Self::Medusa | Self::XChain | Self::XYChain
                    | Self::Aic | Self::DiscontinuousNiceLoop | Self::ContinuousNiceLoop
                    | Self::GroupedAic | Self::GroupedDiscontinuousNiceLoop | Self::GroupedContinuousNiceLoop
                    | Self::UniqueLoop | Self::Tridagon | Self::TridagonAic
                    | Self::ForcingChain | Self::ForcingNet | Self::DynamicForcingNet
                    | Self::AdvancedForcingNet | Self::NestedForcingNet | Self::TridagonForcingNet => self.cost() / 2,
                    _ => self.cost(),
                }
            }

            /// Minimum puzzle difficulty when a complete solve uses this technique.
            pub const fn difficulty(self) -> Difficulty {
                match self { $(Self::$name => Difficulty::$level),+ }
            }

            /// Whether a deduction by this technique assumes a single solution.
            pub const fn requires_unique_solution(self) -> bool {
                match self { $(Self::$name => $unique),+ }
            }
        }
    };
}

/// Enabled techniques in priority order for solving, rating, and generation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SolverProfile(Vec<Technique>);

/// Errors raised when decoding a stored solver profile.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProfileError {
    /// No catalog entry has this ID.
    UnknownTechnique(String),
    /// The same technique appears more than once.
    DuplicateTechnique(Technique),
}

impl Default for SolverProfile {
    fn default() -> Self {
        Self(Technique::default_order().to_vec())
    }
}

impl SolverProfile {
    /// Parse stored IDs in priority order. An empty list disables all techniques.
    pub fn from_ids<'a>(ids: impl IntoIterator<Item = &'a str>) -> Result<Self, ProfileError> {
        let mut order = Vec::new();
        for id in ids {
            let technique = Technique::from_id(id)
                .ok_or_else(|| ProfileError::UnknownTechnique(id.to_owned()))?;
            if order.contains(&technique) {
                return Err(ProfileError::DuplicateTechnique(technique));
            }
            order.push(technique);
        }
        Ok(Self(order))
    }

    /// Yield the stable IDs in this profile's order.
    pub fn ids(&self) -> impl Iterator<Item = &'static str> + '_ {
        self.0.iter().map(|technique| technique.id())
    }

    /// Borrow the order to pass to solver, rating, and generator calls.
    pub fn technique_order(&self) -> &[Technique] {
        &self.0
    }
}

#[cfg(feature = "wasm-api")]
impl serde::Serialize for Technique {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.id())
    }
}

catalog! {
    FullHouse: "full-house", 4, Beginner, false, ["Last Digit"];
    HiddenSingleBox: "hidden-single-box", 14, Beginner, false, ["Hidden Single in a Box"];
    NakedSingle: "naked-single", 4, Easy, false, [];
    HiddenSingle: "hidden-single", 14, Easy, false, [];
    Pointing: "pointing", 50, Medium, false, ["Locked Candidates Type 1"];
    Claiming: "claiming", 50, Medium, false, ["Locked Candidates Type 2", "Box-Line Reduction"];
    NakedPair: "naked-pair", 60, Medium, false, [];
    HiddenPair: "hidden-pair", 70, Medium, false, [];
    LockedPair: "locked-pair", 40, Medium, false, [];
    LockedTriple: "locked-triple", 60, Medium, false, [];
    NakedTriple: "naked-triple", 80, Medium, false, [];
    HiddenTriple: "hidden-triple", 100, Medium, false, [];
    NakedQuadruple: "naked-quadruple", 120, Hard, false, [];
    HiddenQuadruple: "hidden-quadruple", 150, Hard, false, [];
    XWing: "x-wing", 140, Tricky, false, [];
    Skyscraper: "skyscraper", 130, Tricky, false, [];
    TwoStringKite: "two-string-kite", 150, Tricky, false, ["2-String Kite"];
    EmptyRectangle: "empty-rectangle", 120, Tricky, false, [];
    WWing: "w-wing", 150, Hard, false, [];
    XYWing: "xy-wing", 160, Hard, false, ["Y-Wing"];
    XYZWing: "xyz-wing", 180, Hard, false, [];
    Swordfish: "swordfish", 150, Tricky, false, [];
    Jellyfish: "jellyfish", 160, Hard, false, [];
    FinnedXWing: "finned-x-wing", 130, Hard, false, [];
    SashimiXWing: "sashimi-x-wing", 150, Hard, false, [];
    FinnedSwordfish: "finned-swordfish", 200, VeryHard, false, [];
    SashimiSwordfish: "sashimi-swordfish", 240, VeryHard, false, [];
    FinnedJellyfish: "finned-jellyfish", 250, VeryHard, false, [];
    SashimiJellyfish: "sashimi-jellyfish", 260, VeryHard, false, [];
    SimpleColoring: "simple-coloring", 150, VeryHard, false, ["Simple Colors", "Simple Colouring"];
    MultiColoring: "multi-coloring", 220, VeryHard, false, ["Multi Colors"];
    Medusa: "3d-medusa", 240, VeryHard, false, ["3D Medusa"];
    XChain: "x-chain", 260, VeryHard, false, [];
    XYChain: "xy-chain", 260, VeryHard, false, [];
    Aic: "aic", 280, Expert, false, ["Alternating Inference Chain"];
    DiscontinuousNiceLoop: "discontinuous-nice-loop", 280, Expert, false, [];
    ContinuousNiceLoop: "continuous-nice-loop", 280, Expert, false, ["AIC Loop"];
    GroupedAic: "grouped-aic", 300, Master, false, ["Grouped Alternating Inference Chain"];
    GroupedDiscontinuousNiceLoop: "grouped-discontinuous-nice-loop", 300, Master, false, [];
    GroupedContinuousNiceLoop: "grouped-continuous-nice-loop", 300, Master, false, ["Grouped AIC Loop"];
    // Local calibration experiment: SudokuWiki's UR1 weight is 20 versus 50
    // for Types 2–5, so UR1 uses a 40-point reference here while UR2–6 remain 100.
    UniqueRectangle1: "unique-rectangle-1", 40, Hard, true, ["Uniqueness Test 1"];
    UniqueRectangle2: "unique-rectangle-2", 100, Hard, true, ["Uniqueness Test 2"];
    UniqueRectangle3: "unique-rectangle-3", 100, Hard, true, ["Uniqueness Test 3"];
    UniqueRectangle4: "unique-rectangle-4", 100, Hard, true, ["Uniqueness Test 4"];
    UniqueRectangle5: "unique-rectangle-5", 100, Hard, true, ["Uniqueness Test 5"];
    UniqueRectangle6: "unique-rectangle-6", 100, Hard, true, ["Uniqueness Test 6"];
    UniqueRectangleAic: "unique-rectangle-aic", 360, Master, true, ["Alternating Inference Chain with a Unique Rectangle"];
    UniqueRectangleDiscontinuousNiceLoop: "unique-rectangle-discontinuous-nice-loop", 360, Master, true, ["Discontinuous Nice Loop with a Unique Rectangle"];
    UniqueRectangleContinuousNiceLoop: "unique-rectangle-continuous-nice-loop", 360, Master, true, ["Continuous Nice Loop with a Unique Rectangle"];
    HiddenRectangle: "hidden-rectangle", 100, Hard, true, [];
    UniqueLoop: "unique-loop", 140, VeryHard, true, ["Uniqueness Loop"];
    BugPlusOne: "bug-plus-one", 100, Hard, true, ["BUG+1", "Bivalue Universal Grave + 1"];
    WxyzWing: "wxyz-wing", 220, VeryHard, false, [];
    Fireworks: "fireworks", 240, Master, false, ["Triple Firework", "Quadruple Firework"];
    FireworkWWing: "firework-w-wing", 320, Master, false, ["W-Wing Fireworks"];
    FireworkLWing: "firework-l-wing", 320, Master, false, ["L-Wing Fireworks"];
    FireworkAlsWing: "firework-als-wing", 350, Master, false, ["ALS-Wing Fireworks"];
    FireworkAic: "firework-aic", 360, Master, false, ["Firework Alternating Inference Chain"];
    AlignedPairExclusion: "aligned-pair-exclusion", 310, Master, false, [];
    AlignedTripletExclusion: "aligned-triplet-exclusion", 370, Extreme, false, [];
    Tridagon: "tridagon", 410, Extreme, false, ["Trivalue Oddagon", "Thor's Hammer"];
    TridagonAic: "tridagon-aic", 540, Extreme, false, ["Tridagon Alternating Inference Chain"];
    TridagonForcingNet: "tridagon-forcing-net", 850, Extreme, false, [];
    ForcingChain: "forcing-chain", 500, Extreme, false, [];
    ForcingNet: "forcing-net", 700, Extreme, false, [];
    DynamicForcingNet: "dynamic-forcing-net", 800, Extreme, false, [];
    AdvancedForcingNet: "advanced-forcing-net", 900, Extreme, false, [];
    NestedForcingNet: "nested-forcing-net", 950, Impossible, false, [];
    AlsXz: "als-xz", 300, Master, false, ["ALS-XZ Rule"];
    AlsXyWing: "als-xy-wing", 320, Master, false, [];
    AlsChain: "als-chain", 340, Master, false, ["ALS-XY-Chain"];
    AlsAic: "als-aic", 360, Master, false, ["Alternating Inference Chain with ALS"];
    AlsDiscontinuousNiceLoop: "als-discontinuous-nice-loop", 360, Master, false, ["Discontinuous Nice Loop with ALS"];
    AlsContinuousNiceLoop: "als-continuous-nice-loop", 360, Master, false, ["Continuous Nice Loop with ALS"];
    SueDeCoq: "sue-de-coq", 250, Master, false, ["Two-Sector Disjoint Subsets"];
    DeathBlossom: "death-blossom", 360, Master, false, [];
    Exocet: "exocet", 450, Extreme, false, ["Junior Exocet", "JExocet"];
    SeniorExocet: "senior-exocet", 550, Extreme, false, ["SExocet"];
    DoubleExocet: "double-exocet", 600, Extreme, false, ["Double Junior Exocet", "Double JExocet"];
    SkLoop: "sk-loop", 400, Extreme, false, ["Domino Loop"];
    MultiSectorLockedSets: "multi-sector-locked-sets", 480, Extreme, false, ["MSLS"];
    FrankenFish: "franken-fish", 420, Extreme, false, [];
    MutantFish: "mutant-fish", 460, Extreme, false, [];
    PatternOverlay: "pattern-overlay", 500, Impossible, false, ["Template Set", "Template Delete", "Single-Digit Pattern Overlay"];
    PairwisePatternOverlay: "pairwise-pattern-overlay", 650, Impossible, false, ["Two-Digit Pattern Overlay"];
    TriplePatternOverlay: "triple-pattern-overlay", 800, Impossible, false, ["Three-Digit Pattern Overlay"];
    QuadruplePatternOverlay: "quadruple-pattern-overlay", 950, Impossible, false, ["Four-Digit Pattern Overlay"];
    QuintuplePatternOverlay: "quintuple-pattern-overlay", 1100, Impossible, false, ["Five-Digit Pattern Overlay"];
    KrakenFish1: "kraken-fish-1", 900, Extreme, false, ["Kraken Fish Type 1"];
    KrakenFish2: "kraken-fish-2", 950, Extreme, false, ["Kraken Fish Type 2"];
}

impl Technique {
    pub(crate) const fn pattern_overlay_width(self) -> Option<u32> {
        match self {
            Self::PatternOverlay => Some(1),
            Self::PairwisePatternOverlay => Some(2),
            Self::TriplePatternOverlay => Some(3),
            Self::QuadruplePatternOverlay => Some(4),
            Self::QuintuplePatternOverlay => Some(5),
            _ => None,
        }
    }
}

impl Technique {
    /// Techniques used by built-in difficulty profiles, in curated tier order.
    pub const DIFFICULTY_ORDER: &'static [Self] = &[
        Self::FullHouse,
        Self::HiddenSingleBox,
        Self::NakedSingle,
        Self::HiddenSingle,
        Self::LockedPair,
        Self::LockedTriple,
        Self::Pointing,
        Self::Claiming,
        Self::NakedPair,
        Self::NakedTriple,
        Self::HiddenPair,
        Self::HiddenTriple,
        Self::XWing,
        Self::Swordfish,
        Self::Skyscraper,
        Self::TwoStringKite,
        Self::EmptyRectangle,
        Self::NakedQuadruple,
        Self::HiddenQuadruple,
        Self::Jellyfish,
        Self::BugPlusOne,
        Self::WWing,
        Self::XYWing,
        Self::XYZWing,
        Self::UniqueRectangle1,
        Self::UniqueRectangle2,
        Self::UniqueRectangle3,
        Self::UniqueRectangle4,
        Self::UniqueRectangle5,
        Self::UniqueRectangle6,
        Self::HiddenRectangle,
        Self::FinnedXWing,
        Self::SashimiXWing,
        Self::FinnedSwordfish,
        Self::SashimiSwordfish,
        Self::FinnedJellyfish,
        Self::SashimiJellyfish,
        Self::SimpleColoring,
        Self::Medusa,
        Self::XChain,
        Self::XYChain,
        Self::WxyzWing,
        Self::UniqueLoop,
        Self::Aic,
        Self::DiscontinuousNiceLoop,
        Self::ContinuousNiceLoop,
        Self::GroupedAic,
        Self::GroupedDiscontinuousNiceLoop,
        Self::GroupedContinuousNiceLoop,
        Self::SueDeCoq,
        Self::AlsXz,
        Self::AlsXyWing,
        Self::AlsChain,
        Self::DeathBlossom,
        Self::UniqueRectangleAic,
        Self::UniqueRectangleDiscontinuousNiceLoop,
        Self::UniqueRectangleContinuousNiceLoop,
        Self::Fireworks,
        Self::FireworkWWing,
        Self::FireworkLWing,
        Self::FireworkAlsWing,
        Self::FireworkAic,
        Self::AlignedPairExclusion,
        Self::AlsAic,
        Self::AlsDiscontinuousNiceLoop,
        Self::AlsContinuousNiceLoop,
        Self::SkLoop,
        Self::Exocet,
        Self::MultiSectorLockedSets,
        Self::ForcingChain,
        Self::ForcingNet,
        Self::AlignedTripletExclusion,
        Self::Tridagon,
        Self::TridagonAic,
        Self::TridagonForcingNet,
        Self::DynamicForcingNet,
        Self::AdvancedForcingNet,
        Self::SeniorExocet,
        Self::DoubleExocet,
        Self::FrankenFish,
        Self::MutantFish,
        Self::KrakenFish1,
        Self::KrakenFish2,
        Self::NestedForcingNet,
        Self::PatternOverlay,
        Self::PairwisePatternOverlay,
        Self::TriplePatternOverlay,
        Self::QuadruplePatternOverlay,
        Self::QuintuplePatternOverlay,
    ];

    /// Default analysis profile, derived by filtering the curated order.
    pub fn default_order() -> &'static [Self] {
        static ORDER: std::sync::OnceLock<Vec<Technique>> = std::sync::OnceLock::new();
        ORDER
            .get_or_init(|| {
                Self::DIFFICULTY_ORDER
                    .iter()
                    .copied()
                    .filter(|technique| !technique.is_specialist_profile_only())
                    .collect()
            })
            .as_slice()
    }

    const fn is_specialist_profile_only(self) -> bool {
        matches!(
            self,
            Self::UniqueLoop
                | Self::UniqueRectangleAic
                | Self::UniqueRectangleDiscontinuousNiceLoop
                | Self::UniqueRectangleContinuousNiceLoop
                | Self::Fireworks
                | Self::FireworkWWing
                | Self::FireworkLWing
                | Self::FireworkAlsWing
                | Self::FireworkAic
                | Self::AlignedPairExclusion
                | Self::AlsAic
                | Self::AlsDiscontinuousNiceLoop
                | Self::AlsContinuousNiceLoop
                | Self::AlignedTripletExclusion
                | Self::Tridagon
                | Self::TridagonAic
                | Self::TridagonForcingNet
                | Self::DynamicForcingNet
                | Self::AdvancedForcingNet
                | Self::SeniorExocet
                | Self::DoubleExocet
                | Self::FrankenFish
                | Self::MutantFish
                | Self::KrakenFish1
                | Self::KrakenFish2
                | Self::NestedForcingNet
                | Self::PatternOverlay
                | Self::PairwisePatternOverlay
                | Self::TriplePatternOverlay
                | Self::QuadruplePatternOverlay
                | Self::QuintuplePatternOverlay
        )
    }
}
