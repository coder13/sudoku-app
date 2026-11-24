use std::{
    collections::{BTreeMap, BTreeSet},
    ops::ControlFlow,
};

use super::{
    AlignedExclusionReason, AlmostLockedSet, Board, CELLS, Candidate, ColoringReason,
    DeductionSearch, ExocetCover, ForcingBranch, ForcingConflict, ForcingScope, Hint, HintAction,
    HintError, HintEvidence, House, InferenceNode, KrakenLinkReason, LinkSource, PositionSnapshot,
    RectangleSupport, Technique, checked_position, coordinates, digit_bit, digits, visit_technique,
};
use crate::DIGITS;

/// A move and the distinct proofs found for its complete set of effects.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct DeductionMatch {
    /// Complete set of actions proved by every proof in the group.
    pub actions: Vec<HintAction>,
    /// Distinct cells changed by the actions, in index order.
    pub affected_cells: Vec<usize>,
    /// Distinct candidates placed or removed by the actions.
    pub affected_candidates: Vec<Candidate>,
    /// Alternative proofs of the action set, in discovery order.
    pub proofs: Vec<DeductionProof>,
}

/// The rule, evidence, and display coordinates for one proof of a move.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct DeductionProof {
    /// Technique whose detector proved the move.
    pub technique: Technique,
    /// Technique-specific data used to explain the deduction.
    pub evidence: HintEvidence,
    /// Locations to highlight when showing the proof.
    pub pattern: ProofPattern,
}

/// Locations used by this proof in the requested position. Indices are zero-based.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize))]
pub struct ProofPattern {
    /// Rows, columns, and boxes used by the proof.
    pub houses: Vec<House>,
    /// Cell indices named by the proof pattern.
    pub cells: Vec<usize>,
    /// Active candidates used by the proof, sorted by cell and digit.
    pub candidates: Vec<Candidate>,
}

impl ProofPattern {
    pub(crate) fn from_evidence(
        evidence: &HintEvidence,
        result: Candidate,
        masks: &[u16; CELLS],
    ) -> Self {
        let mut pattern = Pattern::new(Some(masks));
        pattern.add_evidence(evidence, result);
        Self {
            houses: House::all()
                .filter(|&house| pattern.houses.contains(house))
                .collect(),
            cells: pattern.cells.into_iter().collect(),
            candidates: pattern.candidates.into_iter().collect(),
        }
    }

    pub(crate) fn house_count(evidence: &HintEvidence, result: Candidate) -> u32 {
        let mut pattern = Pattern::new(None);
        pattern.add_evidence(evidence, result);
        pattern.houses.0.count_ones()
    }
}

/// Search the selected techniques against one position without applying their moves.
/// Results follow discovery order. Proofs with the same action set share one result.
pub fn deductions(
    board: &Board,
    eliminations: Option<&[u16; CELLS]>,
    technique_order: &[Technique],
) -> Result<Vec<DeductionMatch>, HintError> {
    let position = checked_position(board, eliminations)?;
    let masks = position.masks();
    let search = DeductionSearch::new(position.board(), masks);
    let mut seen = BTreeSet::new();
    let mut moves = BTreeMap::<Vec<HintAction>, (usize, Vec<DeductionProof>)>::new();
    for &technique in technique_order
        .iter()
        .filter(|&&technique| seen.insert(technique))
    {
        let _ = visit_technique(&search, technique, |step| {
            let Hint {
                technique,
                evidence,
                actions,
            } = Hint::from(step);
            let index = moves.len();
            let result = actions[0].candidate();
            let (_, proofs) = moves.entry(actions).or_insert_with(|| (index, Vec::new()));
            if !proofs
                .iter()
                .any(|proof| proof.technique == technique && proof.evidence == evidence)
            {
                let pattern = ProofPattern::from_evidence(&evidence, result, masks);
                proofs.push(DeductionProof {
                    technique,
                    evidence,
                    pattern,
                });
            }
            ControlFlow::Continue(())
        });
    }
    let mut moves: Vec<_> = moves.into_iter().collect();
    moves.sort_unstable_by_key(|(_, (index, _))| *index);
    Ok(moves
        .into_iter()
        .map(|(actions, (_, proofs))| {
            let affected_candidates: BTreeSet<_> =
                actions.iter().map(|action| action.candidate()).collect();
            let affected_cells: BTreeSet<_> = affected_candidates
                .iter()
                .map(|candidate| candidate.cell)
                .collect();
            DeductionMatch {
                actions,
                affected_cells: affected_cells.into_iter().collect(),
                affected_candidates: affected_candidates.into_iter().collect(),
                proofs,
            }
        })
        .collect())
}

/// Find grouped deductions in a snapshot, respecting established candidate removals.
pub fn deductions_at(
    snapshot: &PositionSnapshot,
    technique_order: &[Technique],
) -> Result<Vec<DeductionMatch>, HintError> {
    deductions(
        &snapshot.values().map_err(HintError::Puzzle)?,
        snapshot.removals(),
        technique_order,
    )
}

#[derive(Default)]
struct Houses(u32);

impl Houses {
    fn bit(house: House) -> u32 {
        1 << house.index()
    }

    fn insert(&mut self, house: House) {
        self.0 |= Self::bit(house);
    }

    fn contains(&self, house: House) -> bool {
        self.0 & Self::bit(house) != 0
    }

    fn extend(&mut self, houses: impl IntoIterator<Item = House>) {
        for house in houses {
            self.insert(house);
        }
    }
}

struct Pattern<'a> {
    // Ranking only needs houses. Diagrams also collect cells and their active candidates.
    masks: Option<&'a [u16; CELLS]>,
    houses: Houses,
    cells: BTreeSet<usize>,
    candidates: BTreeSet<Candidate>,
}

impl<'a> Pattern<'a> {
    fn new(masks: Option<&'a [u16; CELLS]>) -> Self {
        Self {
            masks,
            houses: Houses::default(),
            cells: BTreeSet::new(),
            candidates: BTreeSet::new(),
        }
    }

    fn add_evidence(&mut self, evidence: &HintEvidence, result: Candidate) {
        match evidence {
            HintEvidence::Cell(cell) => self.mark([*cell], DIGITS),
            HintEvidence::House(house) => {
                self.houses.insert(*house);
                self.candidate(result);
            }
            HintEvidence::DirectPlacement { house, premise, removed } => {
                self.add_evidence(premise, result);
                self.houses.insert(*house);
                self.mark(removed.iter().copied(), digit_bit(result.digit));
                self.candidate(result);
            }
            HintEvidence::Intersection {
                source,
                target,
                cells,
            } => {
                self.houses.extend([*source, *target]);
                self.mark(cells.iter().copied(), digit_bit(result.digit));
            }
            HintEvidence::Pair {
                house,
                cells,
                digits,
            } => {
                self.houses.insert(*house);
                self.mark(*cells, mask(*digits));
            }
            HintEvidence::Subset {
                house,
                cells,
                digits,
                locked_in,
            } => {
                self.houses.insert(*house);
                self.houses.extend(*locked_in);
                self.mark(cells.iter().copied(), mask(digits.iter().copied()));
            }
            HintEvidence::XWing {
                digit,
                bases,
                covers,
            } => self.fish(*digit, bases, covers),
            HintEvidence::Fish {
                digit,
                bases,
                covers,
                fins,
            } => {
                self.fish(*digit, bases, covers);
                self.houses
                    .extend(fins.iter().map(|&cell| House::at(cell)[2]));
            }
            HintEvidence::ComplexFish {
                digit,
                bases,
                covers,
                ..
            } => self.fish(*digit, bases, covers),
            HintEvidence::PatternOverlay(proof) => {
                for scope in &proof.scopes {
                    self.mark(scope.allowed.iter().copied(), digit_bit(scope.digit));
                }
            }
            HintEvidence::KrakenFish {
                digit,
                bases,
                covers,
                branches,
                ..
            } => {
                self.fish(*digit, bases, covers);
                for link in branches.iter().flatten() {
                    self.proposition(&link.from);
                    self.proposition(&link.to);
                    match &link.reason {
                        KrakenLinkReason::Exclusion => {}
                        KrakenLinkReason::Cell(cell) => self.source(LinkSource::Cell(*cell)),
                        KrakenLinkReason::House(house) => self.source(LinkSource::House(*house)),
                        KrakenLinkReason::AlmostLockedSet(set) => {
                            self.sets(std::slice::from_ref(set))
                        }
                    }
                }
            }
            HintEvidence::Wing {
                pivot,
                pincers,
                digits,
            } => {
                self.mark(std::iter::once(*pivot).chain(*pincers), mask(*digits));
            }
            HintEvidence::WxyzWing { cells, digits, .. } => self.mark(*cells, mask(*digits)),
            HintEvidence::WWing {
                wings,
                link,
                linked_digit,
                digit,
            } => {
                self.houses.insert(link.house);
                self.mark(*wings, mask([*digit, *linked_digit]));
                self.mark(link.cells, digit_bit(*linked_digit));
            }
            HintEvidence::SingleDigitChain {
                digit,
                links,
                bridge,
            } => {
                for link in links {
                    self.houses.insert(link.house);
                    self.mark(link.cells, digit_bit(*digit));
                }
                self.mark(*bridge, digit_bit(*digit));
            }
            HintEvidence::EmptyRectangle {
                digit,
                row,
                column,
                cells,
                link,
            } => {
                self.houses
                    .extend([House::Row(*row), House::Column(*column), link.house]);
                self.houses.insert(House::at(row * 9 + column)[2]);
                self.mark([row * 9 + column], 0);
                self.mark(cells.iter().copied().chain(link.cells), digit_bit(*digit));
            }
            HintEvidence::Chain { links } => {
                for link in links {
                    self.source(link.source);
                    self.candidate(link.from);
                    self.candidate(link.to);
                }
            }
            HintEvidence::Inference { links } => {
                for link in links {
                    self.source(link.source);
                    match (link.source, self.masks) {
                        (LinkSource::Peers {}, _) => {
                            for first in link.from.candidates() {
                                for second in link.to.candidates() {
                                    if first.digit == second.digit {
                                        self.shared_houses(first.cell, second.cell);
                                    }
                                }
                            }
                        }
                        (LinkSource::Firework(pivot), Some(masks)) => {
                            let bit = link
                                .from
                                .candidates()
                                .fold(0, |bits, candidate| bits | digit_bit(candidate.digit));
                            self.firework_arms(pivot, bit, masks);
                        }
                        _ => {}
                    }
                    self.proposition(&link.from);
                    self.proposition(&link.to);
                }
            }
            HintEvidence::Coloring {
                colors,
                links,
                reason,
            } => {
                for &candidate in colors.iter().flatten() {
                    self.candidate(candidate);
                }
                for link in links {
                    self.source(link.source);
                }
                match reason {
                    ColoringReason::EmptiedCell(cell) => self.mark([*cell], DIGITS),
                    ColoringReason::EmptiedHouse { house, .. } => {
                        self.houses.insert(*house);
                    }
                    ColoringReason::SameColorConflict(_) | ColoringReason::BothColors => {}
                }
            }
            HintEvidence::MultiColoring {
                groups,
                links,
                bridge,
                other_bridge,
            } => {
                for &candidate in groups.iter().flatten().flatten() {
                    self.candidate(candidate);
                }
                for link in links.iter().chain([bridge]).chain(other_bridge.iter()) {
                    self.source(link.source);
                }
            }
            HintEvidence::UniqueRectangle {
                corners,
                digits,
                support,
                ..
            } => {
                self.mark(*corners, mask(*digits));
                self.uniqueness_support(support);
            }
            HintEvidence::UniqueLoop {
                sides,
                digits,
                support,
            } => {
                self.mark(sides.iter().flatten().copied(), mask(*digits));
                for &cell in sides.iter().flatten() {
                    self.houses.extend(House::at(cell));
                }
                self.uniqueness_support(support);
            }
            HintEvidence::BugPlusOne {
                cell,
                candidates,
                houses,
            } => {
                self.houses.extend(*houses);
                self.mark([*cell], mask(*candidates));
            }
            HintEvidence::AlignedExclusion { cells, cases } => {
                self.mark(cells.iter().copied(), DIGITS);
                for case in cases {
                    match case.reason {
                        AlignedExclusionReason::RepeatedDigit([first, second]) => {
                            self.shared_houses(first, second);
                        }
                        AlignedExclusionReason::EmptyCell(blocker) => {
                            self.mark([blocker], mask(case.digits.iter().copied()));
                            for &cell in cells {
                                self.shared_houses(blocker, cell);
                            }
                        }
                    }
                }
            }
            HintEvidence::Firework { wings, pivots } => {
                for pivot in pivots {
                    let digits = mask(pivot.digits.iter().copied());
                    self.firework(pivot.cell, digits);
                    self.mark(*wings, digits);
                }
            }
            HintEvidence::FireworkWWing {
                pivot,
                digits,
                wings,
                bivalue,
            } => {
                let digits = mask(*digits);
                self.firework(*pivot, digits);
                self.mark(wings.iter().flatten().chain(bivalue).copied(), digits);
                for (wing, attached) in wings.iter().zip(bivalue) {
                    self.shared_houses(result.cell, *attached);
                    for &cell in wing {
                        self.shared_houses(cell, *attached);
                        self.shared_houses(result.cell, cell);
                    }
                }
            }
            HintEvidence::FireworkLWing {
                pivot,
                digits,
                wings,
                link,
                linked_digit,
            } => {
                let digits = mask(*digits);
                self.firework(*pivot, digits);
                self.mark(*wings, digits | digit_bit(*linked_digit));
                self.houses.insert(link.house);
                self.mark(link.cells, digit_bit(*linked_digit));
                for cell in link.cells {
                    self.shared_houses(cell, result.cell);
                }
            }
            HintEvidence::FireworkAlsWing {
                pivots,
                digits,
                wings,
                bivalue,
            } => {
                let digits = mask(*digits);
                self.mark([*bivalue], digits);
                for (pivot, wing) in pivots.iter().zip(wings) {
                    self.firework(*pivot, digits);
                    self.mark(wing.iter().flatten().copied(), digits);
                    for &cell in wing.iter().flatten() {
                        self.shared_houses(cell, *bivalue);
                        self.shared_houses(cell, result.cell);
                    }
                }
                for &first in wings[0].iter().flatten() {
                    for &second in wings[1].iter().flatten() {
                        if first != second {
                            self.shared_houses(first, second);
                        }
                    }
                }
            }
            HintEvidence::Tridagon {
                cells,
                digits,
                guardians,
                branches,
            } => {
                self.mark(cells.iter().flatten().copied(), mask(*digits));
                for group in cells {
                    self.houses.insert(House::Box(coordinates(group[0]).2));
                }
                for &guardian in guardians {
                    self.candidate(guardian);
                }
                for branch in branches {
                    self.forcing_branch(branch);
                }
            }
            HintEvidence::Forcing { scope, branches } => {
                if let Some(scope) = scope {
                    self.scope(*scope);
                }
                for branch in branches {
                    self.forcing_branch(branch);
                }
            }
            HintEvidence::AlsXz { sets, .. } => self.sets(sets),
            HintEvidence::AlsChain { sets, .. } => self.sets(sets),
            HintEvidence::DeathBlossom { stem, petals } => {
                for petal in petals {
                    self.mark([*stem], digit_bit(petal.digit));
                    self.sets(std::slice::from_ref(&petal.set));
                }
            }
            HintEvidence::SueDeCoq {
                intersection,
                digits,
                line,
                block,
            } => {
                self.mark(intersection.iter().copied(), mask(digits.iter().copied()));
                for subset in [line, block] {
                    self.houses.insert(subset.house);
                    self.mark(
                        subset.cells.iter().copied(),
                        mask(subset.digits.iter().copied()),
                    );
                }
            }
            HintEvidence::Exocet {
                bases,
                targets,
                cross_lines,
                covers,
                ..
            } => {
                let digits = self.exocet_covers(*cross_lines, covers);
                self.mark(bases.iter().chain(targets).copied(), digits);
            }
            HintEvidence::GroupedExocet {
                bases,
                targets,
                cross_lines,
                covers,
            } => {
                let digits = self.exocet_covers(*cross_lines, covers);
                self.mark(*bases, digits);
                for target in targets {
                    let reserved = target.reserved_digit().map_or(0, digit_bit);
                    self.mark(target.cells(), digits | reserved);
                }
            }
            HintEvidence::DoubleExocet(proof) => {
                for component in &proof.components {
                    let digits = self.exocet_covers(proof.cross_lines, &component.covers);
                    self.mark(component.bases.into_iter().chain(component.targets), digits);
                }
            }
            HintEvidence::GroupedDoubleExocet(proof) => {
                for component in &proof.components {
                    let digits = self.exocet_covers(proof.cross_lines, &component.covers);
                    self.mark(component.bases, digits);
                    for target in component.targets {
                        let reserved = target.reserved_digit().map_or(0, digit_bit);
                        self.mark(target.cells(), digits | reserved);
                    }
                }
            }
            HintEvidence::SkLoop(proof) => {
                self.houses
                    .extend(proof.links.iter().map(|link| link.house));
                self.mark(proof.anchors, 0);
                self.mark(proof.arms.iter().flatten().copied(), DIGITS);
            }
            HintEvidence::MultiSectorLockedSets {
                core,
                attachments,
                links,
            } => {
                self.houses.extend(links.iter().map(|link| link.house));
                self.mark(core.iter().chain(attachments).copied(), DIGITS);
            }
        }
    }

    fn exocet_covers(&mut self, cross_lines: [House; 3], covers: &[ExocetCover]) -> u16 {
        self.houses.extend(cross_lines);
        for cover in covers {
            self.houses.extend(cover.houses.iter().copied());
            self.mark(cover.cells.iter().copied(), digit_bit(cover.digit));
        }
        mask(covers.iter().map(|cover| cover.digit))
    }

    fn uniqueness_support(&mut self, support: &RectangleSupport) {
        match support {
            RectangleSupport::ExtraCandidates(candidates) => {
                for &candidate in candidates {
                    self.candidate(candidate);
                }
            }
            RectangleSupport::Subset {
                houses,
                cells,
                digits,
            } => {
                self.houses.extend(houses.iter().copied());
                self.mark(cells.iter().copied(), mask(digits.iter().copied()));
            }
            RectangleSupport::HiddenSubset {
                house,
                cells,
                digits,
            } => {
                self.houses.insert(*house);
                self.mark(cells.iter().copied(), mask(digits.iter().copied()));
            }
            RectangleSupport::StrongLinks { houses, .. } => {
                self.houses.extend(houses.iter().copied());
            }
        }
    }

    fn fish(&mut self, digit: u8, bases: &[House], covers: &[House]) {
        self.houses.extend(bases.iter().chain(covers).copied());
        let Some(masks) = self.masks else { return };
        let bit = digit_bit(digit);
        for base in bases {
            // A base's empty sites without this digit are outside the pattern.
            for cell in base.cells() {
                if masks[cell] & bit != 0 {
                    self.mark([cell], bit);
                }
            }
        }
    }

    fn firework(&mut self, pivot: usize, digits: u16) {
        self.houses.extend(House::at(pivot));
        self.mark([pivot], digits);
        if let Some(masks) = self.masks {
            self.firework_arms(pivot, digits, masks);
        }
    }

    fn firework_arms(&mut self, pivot: usize, digits: u16, masks: &[u16; CELLS]) {
        let [row, column, block] = House::at(pivot);
        self.mark(
            block.cells().into_iter().filter(|&cell| {
                let houses = House::at(cell);
                masks[cell] & digits != 0 && (houses[0] == row || houses[1] == column)
            }),
            digits,
        );
    }

    fn source(&mut self, source: LinkSource) {
        match source {
            LinkSource::Cell(cell) => self.mark([cell], 0),
            LinkSource::House(house) => {
                self.houses.insert(house);
            }
            LinkSource::Firework(pivot) => {
                self.houses.extend(House::at(pivot));
                self.mark([pivot], 0);
            }
            LinkSource::UniqueRectangle { corners, digits } => {
                let corners = corners.map(usize::from);
                self.mark(corners, mask(digits));
                self.houses.extend(corners.into_iter().flat_map(House::at));
            }
            LinkSource::Tridagon { cells, digits } => {
                self.mark(cells.into_iter().flatten().map(usize::from), mask(digits));
                for triple in cells {
                    self.houses.insert(House::at(usize::from(triple[0]))[2]);
                }
            }
            LinkSource::AlmostLockedSet(set) | LinkSource::AlmostLockedSetCell { set, .. } => {
                self.mark(set.cells(), mask(set.digits()));
                if let Some(first) = set.cells().next() {
                    self.houses.extend(
                        House::at(first).into_iter().filter(|house| {
                            set.cells().all(|cell| House::at(cell).contains(house))
                        }),
                    );
                }
                if let LinkSource::AlmostLockedSetCell { cell, blocked, .. } = source {
                    let outside = usize::from(cell);
                    self.mark([outside], blocked);
                    if let Some(masks) = self.masks {
                        for inside in set.cells().filter(|&cell| masks[cell] & blocked != 0) {
                            self.shared_houses(inside, outside);
                        }
                    }
                }
            }
            LinkSource::Peers {} => {}
        }
    }

    fn forcing_branch(&mut self, branch: &ForcingBranch) {
        self.candidate(branch.assumption.candidate);
        for step in &branch.steps {
            self.scope(step.scope);
            self.candidate(step.effect.candidate);
        }
        match &branch.conflict {
            Some(ForcingConflict::Exhausted { scope, .. }) => self.scope(*scope),
            Some(ForcingConflict::Cases(cases)) => {
                for case in cases.iter() {
                    self.forcing_branch(&case.branch);
                }
            }
            _ => {}
        }
    }

    fn shared_houses(&mut self, first: usize, second: usize) {
        let other = House::at(second);
        self.houses.extend(
            House::at(first)
                .into_iter()
                .filter(|house| other.contains(house)),
        );
    }

    fn scope(&mut self, scope: ForcingScope) {
        match scope {
            ForcingScope::Candidate(candidate) => self.candidate(candidate),
            ForcingScope::Cell(cell) => self.mark([cell], 0),
            ForcingScope::House { house, .. } => {
                self.houses.insert(house);
            }
            ForcingScope::Intersection { source, target, .. } => {
                self.houses.extend([source, target]);
            }
            ForcingScope::NakedPair {
                house,
                cells,
                digits,
            }
            | ForcingScope::HiddenPair {
                house,
                cells,
                digits,
            } => {
                self.houses.insert(house);
                self.mark(cells, mask(digits));
            }
            ForcingScope::XWing {
                digit,
                bases,
                covers,
            } => self.fish(digit, &bases, &covers),
            ForcingScope::Guardians => {} // The enclosing Tridagon already marks every guardian.
        }
    }

    fn sets(&mut self, sets: &[AlmostLockedSet]) {
        for set in sets {
            self.mark(set.cells.iter().copied(), mask(set.digits.iter().copied()));
        }
    }

    fn candidate(&mut self, candidate: Candidate) {
        self.mark([candidate.cell], digit_bit(candidate.digit));
    }

    fn proposition(&mut self, node: &InferenceNode) {
        for candidate in node.candidates() {
            self.candidate(candidate);
        }
    }

    fn mark(&mut self, cells: impl IntoIterator<Item = usize>, mask: u16) {
        let Some(masks) = self.masks else { return };
        for cell in cells {
            self.cells.insert(cell);
            self.candidates
                .extend(digits(masks[cell] & mask).map(|digit| Candidate { cell, digit }));
        }
    }
}

fn mask(digits: impl IntoIterator<Item = u8>) -> u16 {
    digits
        .into_iter()
        .map(digit_bit)
        .fold(0, |all, digit| all | digit)
}
