use super::Difficulty;

// The same entries define the enum, the exhaustive inventory, and its metadata.
macro_rules! catalog {
    ($($name:ident: $id:literal, $cost:literal, $level:ident, $unique:literal, [$($alias:literal),*];)+) => {
        /// A deduction rule with a stable ID, point cost, and difficulty tier.
        #[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
        pub enum Technique {
            $(#[doc = concat!("Catalog technique `", $id, "`, worth ", stringify!($cost), " points.")]
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

            /// Points added each time the solver applies one deduction of this technique.
            pub const fn cost(self) -> u16 {
                match self { $(Self::$name => $cost),+ }
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
        Self(Technique::DEFAULT_ORDER.to_vec())
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
    FullHouse: "full-house", 4, Easy, false, ["Last Digit"];
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
    XWing: "x-wing", 140, Hard, false, [];
    Skyscraper: "skyscraper", 130, Hard, false, [];
    TwoStringKite: "two-string-kite", 150, Hard, false, ["2-String Kite"];
    EmptyRectangle: "empty-rectangle", 120, Hard, false, [];
    WWing: "w-wing", 150, Hard, false, [];
    XYWing: "xy-wing", 160, Hard, false, ["Y-Wing"];
    XYZWing: "xyz-wing", 180, Hard, false, [];
    Swordfish: "swordfish", 150, Hard, false, [];
    Jellyfish: "jellyfish", 160, Hard, false, [];
    FinnedXWing: "finned-x-wing", 130, Hard, false, [];
    SashimiXWing: "sashimi-x-wing", 150, Hard, false, [];
    FinnedSwordfish: "finned-swordfish", 200, Unfair, false, [];
    SashimiSwordfish: "sashimi-swordfish", 240, Unfair, false, [];
    FinnedJellyfish: "finned-jellyfish", 250, Unfair, false, [];
    SashimiJellyfish: "sashimi-jellyfish", 260, Unfair, false, [];
    SimpleColoring: "simple-coloring", 150, Hard, false, ["Simple Colors", "Simple Colouring"];
    Medusa: "3d-medusa", 240, Unfair, false, ["3D Medusa"];
    XChain: "x-chain", 260, Unfair, false, [];
    XYChain: "xy-chain", 260, Unfair, false, [];
    Aic: "aic", 280, Unfair, false, ["Alternating Inference Chain"];
    DiscontinuousNiceLoop: "discontinuous-nice-loop", 280, Unfair, false, [];
    ContinuousNiceLoop: "continuous-nice-loop", 280, Unfair, false, ["AIC Loop"];
    GroupedAic: "grouped-aic", 300, Unfair, false, ["Grouped Alternating Inference Chain"];
    GroupedDiscontinuousNiceLoop: "grouped-discontinuous-nice-loop", 300, Unfair, false, [];
    GroupedContinuousNiceLoop: "grouped-continuous-nice-loop", 300, Unfair, false, ["Grouped AIC Loop"];
    UniqueRectangle1: "unique-rectangle-1", 100, Hard, true, ["Uniqueness Test 1"];
    UniqueRectangle2: "unique-rectangle-2", 100, Hard, true, ["Uniqueness Test 2"];
    UniqueRectangle3: "unique-rectangle-3", 100, Hard, true, ["Uniqueness Test 3"];
    UniqueRectangle4: "unique-rectangle-4", 100, Hard, true, ["Uniqueness Test 4"];
    UniqueRectangle5: "unique-rectangle-5", 100, Hard, true, ["Uniqueness Test 5"];
    UniqueRectangle6: "unique-rectangle-6", 100, Hard, true, ["Uniqueness Test 6"];
    HiddenRectangle: "hidden-rectangle", 100, Hard, true, [];
    BugPlusOne: "bug-plus-one", 100, Hard, true, ["BUG+1", "Bivalue Universal Grave + 1"];
    WxyzWing: "wxyz-wing", 220, Unfair, false, [];
    AlignedPairExclusion: "aligned-pair-exclusion", 310, Unfair, false, [];
    AlignedTripletExclusion: "aligned-triplet-exclusion", 370, Unfair, false, [];
    Tridagon: "tridagon", 410, Extreme, false, ["Trivalue Oddagon", "Thor's Hammer"];
    TridagonForcingNet: "tridagon-forcing-net", 850, Extreme, false, [];
    ForcingChain: "forcing-chain", 500, Extreme, false, [];
    ForcingNet: "forcing-net", 700, Extreme, false, [];
    DynamicForcingNet: "dynamic-forcing-net", 800, Extreme, false, [];
    NestedForcingNet: "nested-forcing-net", 950, Extreme, false, [];
    AlsXz: "als-xz", 300, Unfair, false, ["ALS-XZ Rule"];
    AlsXyWing: "als-xy-wing", 320, Unfair, false, [];
    AlsChain: "als-chain", 340, Unfair, false, ["ALS-XY-Chain"];
    SueDeCoq: "sue-de-coq", 250, Unfair, false, ["Two-Sector Disjoint Subsets"];
    DeathBlossom: "death-blossom", 360, Unfair, false, [];
    Exocet: "exocet", 450, Extreme, false, ["Junior Exocet", "JExocet"];
    SkLoop: "sk-loop", 400, Extreme, false, ["Domino Loop"];
    MultiSectorLockedSets: "multi-sector-locked-sets", 480, Extreme, false, ["MSLS"];
    FrankenFish: "franken-fish", 420, Extreme, false, [];
    MutantFish: "mutant-fish", 460, Extreme, false, [];
}

impl Technique {
    /// Default solver profile. See [`Self::ALL`] for techniques available in custom profiles.
    /// Opening analysis and hints use the full catalog.
    pub const DEFAULT_ORDER: &'static [Self] = &[
        Self::FullHouse,
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
        Self::NakedQuadruple,
        Self::HiddenQuadruple,
        Self::XWing,
        Self::Swordfish,
        Self::Jellyfish,
        Self::BugPlusOne,
        Self::Skyscraper,
        Self::TwoStringKite,
        Self::EmptyRectangle,
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
        Self::Aic,
        Self::DiscontinuousNiceLoop,
        Self::ContinuousNiceLoop,
        Self::GroupedAic,
        Self::GroupedDiscontinuousNiceLoop,
        Self::GroupedContinuousNiceLoop,
        Self::WxyzWing,
        Self::SueDeCoq,
        Self::AlsXz,
        Self::AlsXyWing,
        Self::AlsChain,
        Self::DeathBlossom,
        Self::SkLoop,
        Self::Exocet,
        Self::MultiSectorLockedSets,
        Self::ForcingChain,
        Self::ForcingNet,
    ];
}
