use crate::hints::{checked_position, digit_bit, digits};
use crate::position::Position;
use crate::{CELLS, Candidate, HintError, House, PositionSnapshot, coordinates};

mod discovery;
mod effort;
pub(crate) use discovery::discover_rank_deductions_in;
pub use discovery::{
    RankDiscovery, RankDiscoveryScan, discover_rank_at, discover_rank_deductions_at,
};
pub use effort::{RANK_PROOF_EFFORT_VERSION, RankProofEffort, rank_proof_effort_at};

const CONSTRAINTS: usize = 4 * CELLS;
type Occupied = [u16; CONSTRAINTS];

/// One classic Sudoku constraint in a rank pattern.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "kebab-case")
)]
pub enum RankConstraint {
    /// The candidates at one zero-based cell index.
    Cell(usize),
    /// The positions for one digit in a row, column, or box.
    HouseDigit {
        /// The house, with a zero-based index.
        house: House,
        /// The digit, from 1 through 9.
        digit: u8,
    },
}

impl RankConstraint {
    fn from_slot(slot: usize) -> Self {
        let index = slot % CELLS;
        let house = match slot / CELLS {
            0 => return Self::Cell(index),
            1 => House::Row(index / 9),
            2 => House::Column(index / 9),
            _ => House::Box(index / 9),
        };
        Self::HouseDigit {
            house,
            digit: (index % 9 + 1) as u8,
        }
    }

    fn slot(self) -> Option<usize> {
        let (offset, index, digit) = match self {
            Self::Cell(cell) => return (cell < CELLS).then_some(cell),
            Self::HouseDigit { house, digit } => {
                let (offset, index) = match house {
                    House::Row(index) => (CELLS, index),
                    House::Column(index) => (2 * CELLS, index),
                    House::Box(index) => (3 * CELLS, index),
                };
                (offset, index, digit)
            }
        };
        (index < 9 && (1..=9).contains(&digit)).then(|| offset + index * 9 + digit as usize - 1)
    }

    fn is_satisfied(self, position: &Position) -> bool {
        let board = position.board();
        match self {
            Self::Cell(cell) => board[cell] != 0,
            Self::HouseDigit { house, digit } => {
                house.cells().iter().any(|&cell| board[cell] == digit)
            }
        }
    }

    fn visit_candidates(self, masks: &[u16; CELLS], visit: impl FnMut(Candidate)) {
        match self {
            Self::Cell(cell) => digits(masks[cell])
                .map(|digit| Candidate { cell, digit })
                .for_each(visit),
            Self::HouseDigit { house, digit } => house
                .cells()
                .into_iter()
                .filter(|&cell| masks[cell] & digit_bit(digit) != 0)
                .map(|cell| Candidate { cell, digit })
                .for_each(visit),
        }
    }
}

/// A set of selected constraints at one position.
///
/// Each base must contain exactly one true candidate. Each cover can contain
/// at most one. A candidate satisfies every base that contains it and uses
/// all its cover slots at once. A constraint can appear once in each role.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize, serde::Deserialize))]
pub struct RankPattern {
    /// Constraints that must be satisfied.
    pub bases: Vec<RankConstraint>,
    /// Constraints that limit which choices can be made together.
    pub covers: Vec<RankConstraint>,
}

impl RankPattern {
    /// The number of covers minus the number of bases, for a valid pattern.
    pub fn rank(&self) -> i32 {
        self.covers.len() as i32 - self.bases.len() as i32
    }
}

/// One case split or contradiction in a rank proof.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize, serde::Deserialize))]
pub struct RankProofNode {
    /// Index into the pattern's bases.
    pub base: usize,
    /// All available candidates for this base, ordered by cell and digit.
    /// An empty list means the base has no remaining choice.
    pub cases: Vec<Candidate>,
}

/// A certificate that an active candidate must be removed.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "wasm-api", derive(serde::Serialize, serde::Deserialize))]
pub struct RankProof {
    /// The candidate assumed true at the root of the proof.
    pub target: Candidate,
    /// The constraints behind every case in the proof.
    pub pattern: RankPattern,
    /// The root followed by each case's subtree in case order.
    pub nodes: Vec<RankProofNode>,
}

/// Outcome of searching a rank pattern for a proof of one removal.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(tag = "status", content = "proof", rename_all = "kebab-case")
)]
pub enum RankOutcome {
    /// Every way to satisfy the bases with the target true hits a contradiction.
    Proven(RankProof),
    /// The selected constraints admit the target.
    Compatible,
    /// The search ran out of nodes before determining the result.
    SearchLimit,
}

/// Removals found by scanning the active candidates in a rank pattern.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize),
    serde(rename_all = "camelCase")
)]
pub struct RankScan {
    /// Proven removals in cell and digit order.
    pub proofs: Vec<RankProof>,
    /// Number of search nodes visited across all candidates.
    pub nodes_visited: u32,
    /// Whether every candidate in the pattern was checked.
    pub complete: bool,
}

/// An invalid position, constraint, or target.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RankError {
    /// The position failed the same validation used for classic hints.
    Position(HintError),
    /// The pattern did not contain a base.
    NoBases,
    /// A constraint had an invalid cell, house, or digit.
    InvalidConstraint(RankConstraint),
    /// A constraint appeared more than once in the same role.
    DuplicateConstraint(RankConstraint),
    /// A placed digit already fulfilled the constraint.
    SatisfiedConstraint(RankConstraint),
    /// The target was outside the grid or missing from the active candidates.
    InactiveTarget(Candidate),
    /// The target occurred in none of the selected constraints.
    UnconstrainedTarget(Candidate),
}

/// Check a proposed rank removal using only the selected bases and covers.
///
/// The starting snapshot is validated as for classic hints. Each visited
/// case split or contradiction consumes one search node. Use
/// [`replay_rank_proof_at`] to check the returned certificate later.
pub fn prove_rank_at(
    snapshot: &PositionSnapshot,
    pattern: &RankPattern,
    target: Candidate,
    mut node_budget: u32,
) -> Result<RankOutcome, RankError> {
    let position = position(snapshot)?;
    let search = RankSearch::new(&position, pattern)?;
    let target = search.target(&position, target)?;
    Ok(match search.prove(target, &mut node_budget) {
        Ok(Some(nodes)) => RankOutcome::Proven(RankProof {
            target: target.candidate,
            pattern: pattern.clone(),
            nodes,
        }),
        Ok(None) => RankOutcome::Compatible,
        Err(SearchLimit) => RankOutcome::SearchLimit,
    })
}

/// Find all removals supported by a selected pattern within a shared node budget.
///
/// Active candidates in the bases or covers are checked in cell and digit
/// order. If the budget runs out, the result keeps completed proofs and
/// sets [`RankScan::complete`] to false.
pub fn rank_deductions_at(
    snapshot: &PositionSnapshot,
    pattern: &RankPattern,
    node_budget: u32,
) -> Result<RankScan, RankError> {
    let position = position(snapshot)?;
    let search = RankSearch::new(&position, pattern)?;
    let mut remaining = node_budget;
    let mut proofs = Vec::new();
    let mut complete = true;
    for target in search.candidates(position.masks()) {
        match search.prove(target, &mut remaining) {
            Ok(Some(nodes)) => proofs.push(RankProof {
                target: target.candidate,
                pattern: pattern.clone(),
                nodes,
            }),
            Ok(None) => {}
            Err(SearchLimit) => {
                complete = false;
                break;
            }
        }
    }
    Ok(RankScan {
        proofs,
        nodes_visited: node_budget - remaining,
        complete,
    })
}

/// Verify every case and contradiction in a supplied certificate.
///
/// Returns false if the certificate fails on the current candidates, omits
/// a case, or has unused nodes. Invalid positions, patterns, or targets
/// return a [`RankError`].
pub fn replay_rank_proof_at(
    snapshot: &PositionSnapshot,
    proof: &RankProof,
) -> Result<bool, RankError> {
    let position = position(snapshot)?;
    let search = RankSearch::new(&position, &proof.pattern)?;
    let target = search.target(&position, proof.target)?;
    Ok(search.replays(target, &proof.nodes))
}

fn position(snapshot: &PositionSnapshot) -> Result<Position, RankError> {
    let values = snapshot
        .values()
        .map_err(|error| RankError::Position(HintError::Puzzle(error)))?;
    checked_position(&values, snapshot.removals()).map_err(RankError::Position)
}

#[derive(Clone, Copy)]
struct Choice {
    candidate: Candidate,
    slots: [usize; 4],
    count: usize,
}

impl Choice {
    fn new(candidate: Candidate, selected: &[bool; CONSTRAINTS]) -> Self {
        let (row, column, group) = coordinates(candidate.cell);
        let digit = usize::from(candidate.digit - 1);
        let constraints = [
            candidate.cell,
            CELLS + row * 9 + digit,
            2 * CELLS + column * 9 + digit,
            3 * CELLS + group * 9 + digit,
        ];
        let mut slots = [0; 4];
        let mut count = 0;
        for slot in constraints.into_iter().filter(|&slot| selected[slot]) {
            slots[count] = slot;
            count += 1;
        }
        Self {
            candidate,
            slots,
            count,
        }
    }

    fn slots(&self) -> &[usize] {
        &self.slots[..self.count]
    }

    fn fits(self, occupied: &Occupied) -> bool {
        self.slots().iter().all(|&slot| occupied[slot] == 0)
    }

    fn set_slots(self, occupied: &mut Occupied, value: u16) {
        for &slot in self.slots() {
            occupied[slot] = value;
        }
    }
}

struct Base {
    slot: usize,
    choices: Vec<Choice>,
}

struct RankSearch {
    bases: Vec<Base>,
    selected: [bool; CONSTRAINTS],
}

struct SearchLimit;

impl RankSearch {
    fn new(position: &Position, pattern: &RankPattern) -> Result<Self, RankError> {
        if pattern.bases.is_empty() {
            return Err(RankError::NoBases);
        }
        let mut selected = [false; CONSTRAINTS];
        let mut bases = Vec::with_capacity(pattern.bases.len().min(CONSTRAINTS));
        for (constraints, is_base) in [(&pattern.bases, true), (&pattern.covers, false)] {
            let mut seen_in_role = [false; CONSTRAINTS];
            for &constraint in constraints {
                let slot = constraint
                    .slot()
                    .ok_or(RankError::InvalidConstraint(constraint))?;
                if seen_in_role[slot] {
                    return Err(RankError::DuplicateConstraint(constraint));
                }
                if constraint.is_satisfied(position) {
                    return Err(RankError::SatisfiedConstraint(constraint));
                }
                seen_in_role[slot] = true;
                selected[slot] = true;
                if is_base {
                    bases.push(slot);
                }
            }
        }
        Ok(Self::compile(position, bases, selected))
    }

    fn all_active(position: &Position) -> Self {
        let selected =
            std::array::from_fn(|slot| !RankConstraint::from_slot(slot).is_satisfied(position));
        let bases = (0..CONSTRAINTS).filter(|&slot| selected[slot]);
        Self::compile(position, bases, selected)
    }

    fn compile(
        position: &Position,
        slots: impl IntoIterator<Item = usize>,
        selected: [bool; CONSTRAINTS],
    ) -> Self {
        let bases = slots
            .into_iter()
            .map(|slot| {
                let mut choices = Vec::new();
                RankConstraint::from_slot(slot).visit_candidates(position.masks(), |candidate| {
                    choices.push(Choice::new(candidate, &selected));
                });
                Base { slot, choices }
            })
            .collect();
        Self { bases, selected }
    }

    fn validate_target(position: &Position, target: Candidate) -> Result<(), RankError> {
        if target.cell >= CELLS
            || !(1..=9).contains(&target.digit)
            || position.masks()[target.cell] & digit_bit(target.digit) == 0
        {
            return Err(RankError::InactiveTarget(target));
        }
        Ok(())
    }

    fn target(&self, position: &Position, target: Candidate) -> Result<Choice, RankError> {
        Self::validate_target(position, target)?;
        let choice = Choice::new(target, &self.selected);
        (choice.count != 0)
            .then_some(choice)
            .ok_or(RankError::UnconstrainedTarget(target))
    }

    fn candidates<'a>(&'a self, masks: &'a [u16; CELLS]) -> impl Iterator<Item = Choice> + 'a {
        masks
            .iter()
            .enumerate()
            .flat_map(|(cell, &mask)| digits(mask).map(move |digit| Candidate { cell, digit }))
            .map(|candidate| Choice::new(candidate, &self.selected))
            .filter(|choice| choice.count != 0)
    }

    fn prove(
        &self,
        target: Choice,
        remaining: &mut u32,
    ) -> Result<Option<Vec<RankProofNode>>, SearchLimit> {
        let mut occupied = [0; CONSTRAINTS];
        target.set_slots(&mut occupied, 1);
        let mut nodes = Vec::new();
        let refuted = self.refute(&mut occupied, remaining, &mut nodes)?;
        Ok(refuted.then_some(nodes))
    }

    fn next_base(&self, occupied: &Occupied) -> Option<(usize, &Base)> {
        let mut next = None;
        let mut fewest = 10;
        for (index, base) in self.bases.iter().enumerate() {
            if occupied[base.slot] != 0 {
                continue;
            }
            let count = base
                .choices
                .iter()
                .filter(|choice| choice.fits(occupied))
                .count();
            if count < fewest {
                next = Some((index, base));
                fewest = count;
                if count == 0 {
                    break;
                }
            }
        }
        next
    }

    fn refute(
        &self,
        occupied: &mut Occupied,
        remaining: &mut u32,
        nodes: &mut Vec<RankProofNode>,
    ) -> Result<bool, SearchLimit> {
        *remaining = remaining.checked_sub(1).ok_or(SearchLimit)?;
        let Some((index, base)) = self.next_base(occupied) else {
            return Ok(false);
        };
        let node = nodes.len();
        nodes.push(RankProofNode {
            base: index,
            cases: Vec::new(),
        });
        for &choice in &base.choices {
            if choice.fits(occupied) {
                choice.set_slots(occupied, 1);
                let refuted = self.refute(occupied, remaining, nodes)?;
                choice.set_slots(occupied, 0);
                if !refuted {
                    return Ok(false);
                }
            }
        }
        // A compatible branch discards this transcript, so only record cases
        // after every branch has reached a contradiction.
        nodes[node].cases = base
            .choices
            .iter()
            .filter(|choice| choice.fits(occupied))
            .map(|choice| choice.candidate)
            .collect();
        Ok(true)
    }

    fn replays(&self, target: Choice, nodes: &[RankProofNode]) -> bool {
        let mut occupied = [0; CONSTRAINTS];
        target.set_slots(&mut occupied, 1);
        let mut nodes = nodes.iter();
        self.replay(&mut occupied, &mut nodes) && nodes.next().is_none()
    }

    fn replay(
        &self,
        occupied: &mut Occupied,
        nodes: &mut std::slice::Iter<'_, RankProofNode>,
    ) -> bool {
        let Some(node) = nodes.next() else {
            return false;
        };
        let Some(base) = self.bases.get(node.base) else {
            return false;
        };
        if occupied[base.slot] != 0 {
            return false;
        }
        let mut cases = node.cases.iter();
        for &choice in &base.choices {
            if choice.fits(occupied) {
                if cases.next() != Some(&choice.candidate) {
                    return false;
                }
                choice.set_slots(occupied, 1);
                let refuted = self.replay(occupied, nodes);
                choice.set_slots(occupied, 0);
                if !refuted {
                    return false;
                }
            }
        }
        cases.next().is_none()
    }
}
