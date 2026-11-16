use std::{cell::OnceCell, ops::ControlFlow};

use super::{
    Candidate, ConjugatePair, Deduction, DeductionActions, HintAction, HintEvidence, House,
    bit_indices, digits, visit_unions,
};
use crate::{Board, CELLS, Technique, coordinates};

mod aligned_exclusion;
mod als;
mod chains;
mod coloring;
mod complex_fish;
mod exocet;
mod fish;
mod forcing;
mod inference;
mod inference_graph;
mod links;
mod multi_sector;
mod rank_zero;
mod single_digit;
mod sk_loop;
mod sue_de_coq;
mod tridagon;
mod uniqueness;
mod wings;

pub(super) struct PatternSearch<'a> {
    board: &'a Board,
    masks: &'a [u16; CELLS],
    positions: OnceCell<[u128; 9]>,
    bivalue: OnceCell<u128>,
    fish_lines: OnceCell<[fish::Lines; 2]>,
    conjugates: OnceCell<[u32; 9]>,
    inference: OnceCell<inference_graph::InferenceGraph>,
    rectangles: OnceCell<Vec<uniqueness::Rectangle>>,
    forcing: OnceCell<forcing::ForcingGraph>,
    als: OnceCell<als::AlsSearch>,
}

impl<'a> PatternSearch<'a> {
    pub(super) fn new(board: &'a Board, masks: &'a [u16; CELLS]) -> Self {
        Self {
            board,
            masks,
            positions: OnceCell::new(),
            bivalue: OnceCell::new(),
            fish_lines: OnceCell::new(),
            conjugates: OnceCell::new(),
            inference: OnceCell::new(),
            rectangles: OnceCell::new(),
            forcing: OnceCell::new(),
            als: OnceCell::new(),
        }
    }

    pub(super) fn visit(
        &self,
        technique: Technique,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        if let Some(rule) = fish::Rule::for_technique(technique) {
            let lines = self
                .fish_lines
                .get_or_init(|| fish::line_masks(self.positions_by_digit()));
            return rule.visit(lines, visit);
        }
        if let Some(rule) = inference::Rule::for_technique(technique) {
            let graph = self.inference.get_or_init(|| {
                inference_graph::InferenceGraph::new(self.masks, *self.positions_by_digit())
            });
            return rule.visit(graph, visit);
        }
        match technique {
            Technique::XYWing | Technique::XYZWing => {
                wings::visit_pivot_wings(self, technique, visit)
            }
            Technique::WWing => wings::visit_w_wings(self, visit),
            Technique::WxyzWing => wings::visit_wxyz_wings(self, visit),
            Technique::AlignedPairExclusion => {
                aligned_exclusion::visit::<2>(self.masks, technique, visit)
            }
            Technique::AlignedTripletExclusion => {
                aligned_exclusion::visit::<3>(self.masks, technique, visit)
            }
            Technique::Tridagon | Technique::TridagonForcingNet => {
                tridagon::visit(self, technique, visit)
            }
            Technique::Skyscraper | Technique::TwoStringKite | Technique::EmptyRectangle => {
                single_digit::visit(self.positions_by_digit(), technique, visit)
            }
            Technique::SimpleColoring | Technique::Medusa => {
                coloring::visit(&self.candidate_links(), technique, visit)
            }
            Technique::XChain | Technique::XYChain => {
                let bivalue = if technique == Technique::XYChain {
                    self.bivalue_cells()
                } else {
                    0
                };
                chains::visit(&self.candidate_links(), technique, bivalue, visit)
            }
            Technique::UniqueRectangle1
            | Technique::UniqueRectangle2
            | Technique::UniqueRectangle3
            | Technique::UniqueRectangle4
            | Technique::UniqueRectangle5
            | Technique::UniqueRectangle6
            | Technique::HiddenRectangle => uniqueness::visit_rectangles(self, technique, visit),
            Technique::BugPlusOne => uniqueness::visit_bug(self, visit),
            Technique::ForcingChain
            | Technique::ForcingNet
            | Technique::DynamicForcingNet
            | Technique::NestedForcingNet => self
                .forcing
                .get_or_init(|| forcing::ForcingGraph::new(self.masks, self.positions_by_digit()))
                .visit(technique, visit),
            Technique::AlsXz
            | Technique::AlsXyWing
            | Technique::AlsChain
            | Technique::DeathBlossom => self
                .als
                .get_or_init(|| als::AlsSearch::new(self.masks, self.positions_by_digit()))
                .visit(self.masks, self.positions_by_digit(), technique, visit),
            Technique::SueDeCoq => sue_de_coq::visit(self, visit),
            Technique::Exocet => exocet::visit(self, visit),
            Technique::SkLoop => sk_loop::visit(self, visit),
            Technique::MultiSectorLockedSets => multi_sector::visit(self, visit),
            Technique::FrankenFish | Technique::MutantFish => {
                complex_fish::visit(self.positions_by_digit(), technique, visit)
            }
            _ => unreachable!(),
        }
    }

    fn candidate_links(&self) -> links::CandidateLinks<'_> {
        let positions = self.positions_by_digit();
        let conjugates = self
            .conjugates
            .get_or_init(|| links::conjugate_houses(positions));
        links::CandidateLinks {
            masks: self.masks,
            positions,
            conjugates,
        }
    }

    fn positions_by_digit(&self) -> &[u128; 9] {
        self.positions.get_or_init(|| {
            let mut positions = [0; 9];
            for (cell, &mask) in self.masks.iter().enumerate() {
                for digit in bit_indices(mask) {
                    positions[digit] |= cell_bit(cell);
                }
            }
            positions
        })
    }

    fn bivalue_cells(&self) -> u128 {
        *self.bivalue.get_or_init(|| {
            self.masks
                .iter()
                .enumerate()
                .filter(|&(_, mask)| mask.count_ones() == 2)
                .fold(0, |set, (cell, _)| set | cell_bit(cell))
        })
    }
}

const fn cell_bit(cell: usize) -> u128 {
    1 << cell
}

const fn house_cells(house: House) -> u128 {
    const COLUMN: u128 = cell_bit(0)
        | cell_bit(9)
        | cell_bit(18)
        | cell_bit(27)
        | cell_bit(36)
        | cell_bit(45)
        | cell_bit(54)
        | cell_bit(63)
        | cell_bit(72);
    const BOX: u128 = 0b111 | (0b111 << 9) | (0b111 << 18);
    match house {
        House::Row(row) => 0x1ff << (row * 9),
        House::Column(column) => COLUMN << column,
        House::Box(group) => BOX << (group / 3 * 27 + group % 3 * 3),
    }
}

const PEERS: [u128; CELLS] = {
    let mut peers = [0; CELLS];
    let mut cell = 0;
    while cell < CELLS {
        let (row, column, group) = coordinates(cell);
        peers[cell] = (house_cells(House::Row(row))
            | house_cells(House::Column(column))
            | house_cells(House::Box(group)))
            & !cell_bit(cell);
        cell += 1;
    }
    peers
};

fn cells(mut set: u128) -> impl Iterator<Item = usize> {
    std::iter::from_fn(move || {
        if set == 0 {
            return None;
        }
        let cell = set.trailing_zeros() as usize;
        set &= set - 1;
        Some(cell)
    })
}

fn conjugate_pair(positions: u128, house: House) -> Option<ConjugatePair> {
    let positions = positions & house_cells(house);
    (positions.count_ones() == 2).then(|| ConjugatePair {
        house,
        cells: [
            positions.trailing_zeros() as usize,
            positions.ilog2() as usize,
        ],
    })
}

fn report(
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    technique: Technique,
    targets: u128,
    digit: u8,
    evidence: impl FnOnce() -> HintEvidence,
) -> ControlFlow<Deduction> {
    if targets == 0 {
        return ControlFlow::Continue(());
    }
    let actions = cells(targets)
        .map(|cell| HintAction::Eliminate(Candidate { cell, digit }))
        .collect();
    visit(Deduction {
        technique,
        evidence: evidence(),
        actions: DeductionActions::Eliminations(actions),
    })
}

fn report_eliminations(
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    technique: Technique,
    targets: [u128; 9],
    evidence: impl FnOnce() -> HintEvidence,
) -> ControlFlow<Deduction> {
    let mut actions: Vec<_> = targets
        .into_iter()
        .enumerate()
        .flat_map(|(index, targets)| {
            cells(targets).map(move |cell| {
                HintAction::Eliminate(Candidate {
                    cell,
                    digit: index as u8 + 1,
                })
            })
        })
        .collect();
    if actions.is_empty() {
        return ControlFlow::Continue(());
    }
    actions.sort_unstable();
    visit(Deduction {
        technique,
        evidence: evidence(),
        actions: DeductionActions::Eliminations(actions),
    })
}
