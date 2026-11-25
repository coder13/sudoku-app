use std::{
    cell::{OnceCell, RefCell},
    ops::ControlFlow,
};

use super::{
    Candidate, ConjugatePair, Deduction, DeductionActions, HintAction, HintEvidence, House,
    bit_indices, digits, visit_unions,
};
use crate::{Board, CELLS, Technique, coordinates};

mod aligned_exclusion;
mod als;
mod chains;
mod coloring;
#[cfg(feature = "variants")]
mod completions;
mod complex_fish;
mod exocet;
mod fireworks;
mod fish;
mod forcing;
mod guardians;
mod inference;
#[cfg(feature = "variants")]
mod inference_cache;
#[cfg(feature = "variants")]
pub(crate) use inference_cache::RectangleInferenceCache;
mod inference_graph;
mod kraken;
mod links;
mod multi_coloring;
mod multi_sector;
mod overlay;
pub(crate) use overlay::{OverlaySearch, unique_layouts};
mod rank_zero;
mod single_digit;
mod sk_loop;
mod sue_de_coq;
mod templates;
#[cfg(feature = "variants")]
pub(crate) use templates::layouts_in_houses;
mod tridagon;
mod uniqueness;
#[cfg(feature = "variants")]
pub(crate) use uniqueness::has_rectangle_guardians;
mod wings;

pub(super) struct PatternSearch<'a> {
    pub(super) verified_solution: Option<&'a Board>,
    pub(super) completion_probe_nodes: u32,
    #[cfg(feature = "variants")]
    pub(super) completion_support: Option<&'a [u128; 9]>,
    #[cfg(feature = "variants")]
    pub(super) shared_rectangle_inference: Option<&'a RectangleInferenceCache>,
    board: &'a Board,
    masks: &'a [u16; CELLS],
    positions: OnceCell<[u128; 9]>,
    bivalue: OnceCell<u128>,
    fish_lines: OnceCell<[fish::Lines; 2]>,
    conjugates: OnceCell<[u32; 9]>,
    inference: OnceCell<inference_graph::InferenceGraph>,
    als_inference: OnceCell<Option<Box<inference_graph::InferenceGraph>>>,
    als_cell_inference: OnceCell<Option<Box<inference_graph::InferenceGraph>>>,
    firework_inference: OnceCell<Option<Box<inference_graph::InferenceGraph>>>,
    tridagon_inference: OnceCell<Option<Box<inference_graph::InferenceGraph>>>,
    rectangle_inference: OnceCell<Option<Box<inference_graph::InferenceGraph>>>,
    rectangles: OnceCell<Vec<uniqueness::Rectangle>>,
    complex_fish_targets: OnceCell<[u128; 9]>,
    overlay: OnceCell<Box<RefCell<OverlaySearch<'a>>>>,
    kraken: OnceCell<Box<kraken::Search>>,
    forcing: OnceCell<forcing::ForcingGraph>,
    als: OnceCell<als::AlsSearch>,
}

impl<'a> PatternSearch<'a> {
    pub(super) fn new(board: &'a Board, masks: &'a [u16; CELLS]) -> Self {
        Self {
            verified_solution: None,
            completion_probe_nodes: 0,
            #[cfg(feature = "variants")]
            completion_support: None,
            #[cfg(feature = "variants")]
            shared_rectangle_inference: None,
            board,
            masks,
            positions: OnceCell::new(),
            bivalue: OnceCell::new(),
            fish_lines: OnceCell::new(),
            conjugates: OnceCell::new(),
            inference: OnceCell::new(),
            als_inference: OnceCell::new(),
            als_cell_inference: OnceCell::new(),
            firework_inference: OnceCell::new(),
            tridagon_inference: OnceCell::new(),
            rectangle_inference: OnceCell::new(),
            rectangles: OnceCell::new(),
            complex_fish_targets: OnceCell::new(),
            overlay: OnceCell::new(),
            kraken: OnceCell::new(),
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
            let graph = match technique {
                Technique::AlsAic
                | Technique::AlsDiscontinuousNiceLoop
                | Technique::AlsContinuousNiceLoop => {
                    let ordinary = self
                        .als_inference
                        .get_or_init(|| {
                            inference_graph::InferenceGraph::for_almost_locked_sets(self)
                                .map(Box::new)
                        })
                        .as_deref();
                    // A shorter outside-cell link can change which loop a walk finds.
                    // Report the existing ALS proofs before searching the extended graph.
                    if let Some(graph) = ordinary {
                        rule.visit(graph, visit)?;
                    }
                    let external = self
                        .als_cell_inference
                        .get_or_init(|| {
                            inference_graph::InferenceGraph::with_als_cell_links(self, ordinary)
                                .map(Box::new)
                        })
                        .as_deref();
                    return external.map_or(ControlFlow::Continue(()), |graph| {
                        rule.with_als_cells().visit(graph, visit)
                    });
                }
                Technique::FireworkAic => self
                    .firework_inference
                    .get_or_init(|| {
                        inference_graph::InferenceGraph::for_fireworks(self).map(Box::new)
                    })
                    .as_deref(),
                Technique::TridagonAic => self
                    .tridagon_inference
                    .get_or_init(|| {
                        inference_graph::InferenceGraph::for_tridagons(self).map(Box::new)
                    })
                    .as_deref(),
                Technique::UniqueRectangleAic
                | Technique::UniqueRectangleDiscontinuousNiceLoop
                | Technique::UniqueRectangleContinuousNiceLoop => self.rectangle_graph(),
                _ => Some(self.inference_graph()),
            };
            return graph.map_or(ControlFlow::Continue(()), |graph| rule.visit(graph, visit));
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
            Technique::MultiColoring => multi_coloring::visit(&self.candidate_links(), visit),
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
            Technique::UniqueLoop => uniqueness::unique_loop::visit(self, visit),
            Technique::BugPlusOne => uniqueness::visit_bug(self, visit),
            Technique::ForcingChain
            | Technique::ForcingNet
            | Technique::DynamicForcingNet
            | Technique::AdvancedForcingNet
            | Technique::NestedForcingNet => self
                .forcing
                .get_or_init(|| forcing::ForcingGraph::new(self.masks, self.positions_by_digit()))
                .visit(technique, self, visit),
            Technique::AlsXz
            | Technique::AlsXyWing
            | Technique::AlsChain
            | Technique::DeathBlossom => {
                self.als()
                    .visit(self.masks, self.positions_by_digit(), technique, visit)
            }
            Technique::SueDeCoq => sue_de_coq::visit(self, visit),
            Technique::Exocet | Technique::SeniorExocet => exocet::visit(self, technique, visit),
            Technique::DoubleExocet => exocet::visit_double(self, visit),
            Technique::Fireworks => fireworks::visit(self, visit),
            Technique::FireworkWWing => fireworks::visit_w_wings(self, visit),
            Technique::FireworkLWing => fireworks::wings::visit_l_wings(self, visit),
            Technique::FireworkAlsWing => fireworks::wings::visit_als_wings(self, visit),
            Technique::SkLoop => sk_loop::visit(self, visit),
            Technique::MultiSectorLockedSets => multi_sector::visit(self, visit),
            Technique::FrankenFish | Technique::MutantFish => complex_fish::visit(
                self.positions_by_digit(),
                self.complex_fish_targets(),
                technique,
                visit,
            ),
            technique if technique.pattern_overlay_width().is_some() => self
                .overlay
                .get_or_init(|| {
                    Box::new(RefCell::new(OverlaySearch::new(
                        self.board,
                        *self.positions_by_digit(),
                    )))
                })
                .borrow_mut()
                .visit(technique, visit),
            Technique::KrakenFish1 | Technique::KrakenFish2 => {
                if self.masks.iter().all(|&mask| mask == crate::DIGITS) {
                    return ControlFlow::Continue(());
                }
                self.kraken
                    .get_or_init(|| Box::new(kraken::Search::new(self)))
                    .visit(technique, self, visit)
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

    fn inference_graph(&self) -> &inference_graph::InferenceGraph {
        self.inference.get_or_init(|| {
            inference_graph::InferenceGraph::new(self.masks, *self.positions_by_digit())
        })
    }

    fn rectangle_graph(&self) -> Option<&inference_graph::InferenceGraph> {
        #[cfg(feature = "variants")]
        if let Some(shared) = self.shared_rectangle_inference
            && let Some(graph) = shared.graph_for(self)
        {
            return graph.as_deref();
        }
        self.rectangle_inference
            .get_or_init(|| {
                inference_graph::InferenceGraph::for_unique_rectangles(self).map(Box::new)
            })
            .as_deref()
    }

    fn als(&self) -> &als::AlsSearch {
        self.als
            .get_or_init(|| als::AlsSearch::new(self.masks, self.positions_by_digit()))
    }

    fn positions_by_digit(&self) -> &[u128; 9] {
        self.positions
            .get_or_init(|| candidate_positions(self.masks))
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

    fn complex_fish_targets(&self) -> &[u128; 9] {
        self.complex_fish_targets.get_or_init(|| {
            let positions = self.positions_by_digit();
            std::array::from_fn(|index| {
                let sites = positions[index];
                if sites == 0 {
                    return 0;
                }
                // A single-digit fish can only remove a candidate absent from
                // every layout. Keep the original masks for finding the proof.
                let allowed = templates::with_placed(sites, self.board, index as u8 + 1);
                sites & !templates::possible(allowed)
            })
        })
    }
}

fn candidate_positions(masks: &[u16; CELLS]) -> [u128; 9] {
    let mut positions = [0; 9];
    for (cell, &mask) in masks.iter().enumerate() {
        for digit in bit_indices(mask) {
            positions[digit] |= cell_bit(cell);
        }
    }
    positions
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
