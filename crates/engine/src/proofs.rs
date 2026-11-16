use std::{
    collections::{BTreeMap, BTreeSet},
    ops::ControlFlow,
};

use super::{
    AlmostLockedSet, Board, CELLS, Candidate, ColoringReason, DeductionSearch, ForcingConflict,
    ForcingScope, Hint, HintAction, HintError, HintEvidence, House, InferenceNode, LinkSource,
    PositionSnapshot, RectangleSupport, Technique, checked_position, digit_bit, digits,
    visit_technique,
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
                    for endpoint in [&link.from, &link.to] {
                        match endpoint {
                            InferenceNode::Candidate(candidate) => self.candidate(*candidate),
                            InferenceNode::Group { digit, cells } => {
                                self.mark(cells.iter().copied(), digit_bit(*digit));
                            }
                        }
                    }
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
            HintEvidence::UniqueRectangle {
                corners,
                digits,
                support,
            } => {
                self.mark(*corners, mask(*digits));
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
                    RectangleSupport::StrongLinks { houses, .. } => {
                        self.houses.extend(houses.iter().copied())
                    }
                }
            }
            HintEvidence::BugPlusOne {
                cell,
                candidates,
                houses,
            } => {
                self.houses.extend(*houses);
                self.mark([*cell], mask(*candidates));
            }
            HintEvidence::Forcing { scope, branches } => {
                if let Some(scope) = scope {
                    self.scope(*scope);
                }
                for branch in branches {
                    self.candidate(branch.assumption.candidate);
                    for step in &branch.steps {
                        self.scope(step.scope);
                        self.candidate(step.effect.candidate);
                    }
                    if let Some(ForcingConflict::Exhausted { scope, .. }) = &branch.conflict {
                        self.scope(*scope);
                    }
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
                self.houses.extend(*cross_lines);
                self.mark(
                    bases.iter().chain(targets).copied(),
                    mask(covers.iter().map(|cover| cover.digit)),
                );
                for cover in covers {
                    self.houses.extend(cover.houses.iter().copied());
                    self.mark(cover.cells.iter().copied(), digit_bit(cover.digit));
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

    fn source(&mut self, source: LinkSource) {
        match source {
            LinkSource::Cell(cell) => self.mark([cell], 0),
            LinkSource::House(house) => {
                self.houses.insert(house);
            }
        }
    }

    fn scope(&mut self, scope: ForcingScope) {
        match scope {
            ForcingScope::Candidate(candidate) => self.candidate(candidate),
            ForcingScope::Cell(cell) => self.mark([cell], 0),
            ForcingScope::House { house, .. } => {
                self.houses.insert(house);
            }
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
