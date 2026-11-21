//! Validate puzzle definitions and compile shared topology and rule data.

use std::sync::OnceLock;

use super::{
    CompiledVariant, LetteredQuadruples, LineConstraint, PuzzleRule, Quadruple, RegionLayout,
    VARIANT_FORMAT_VERSION, VariantDefinitionError, VariantHouse, VariantHouseKind, VariantPuzzle,
    cell_mask, cells_in,
    lines::compile_line_sums,
    pairs::{PairCompiler, positive_sums},
};
use crate::{CELLS, DIGITS};

impl VariantPuzzle {
    /// Validate the definition and precompute the topology and constraint data.
    ///
    /// The compiled puzzle can analyze multiple positions with the same givens and rules.
    pub fn compile(&self) -> Result<CompiledVariant, VariantDefinitionError> {
        self.compile_with_regions(true)
    }

    pub(super) fn compile_with_regions(
        &self,
        enforce_regions: bool,
    ) -> Result<CompiledVariant, VariantDefinitionError> {
        self.compile_with_xv_exemptions(enforce_regions, &[])
    }

    // A dependency check removes mathematical constraints, not the visible
    // locations of V/X marks that exempt edges from a negative rule.
    pub(super) fn compile_with_xv_exemptions(
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
            cage_house_sums: OnceLock::new(),
            rule_proofs: OnceLock::new(),
            allowed_digits: [DIGITS; CELLS],
            pairs: Vec::new(),
            lines: Vec::new(),
            modular_sums: Vec::new(),
            group_sum_houses: Vec::new(),
            group_sum_phases: Vec::new(),
            disjoint_group_sums: Vec::new(),
            group_sum_chains: Vec::new(),
            quadruples: Vec::new(),
            lettered_quadruples: None,
            global_entropy: None,
            pair_clues: Vec::new(),
            positive_sums: Vec::new(),
            pair_clue_memberships: std::array::from_fn(|_| Vec::new()),
            parity_clues: Vec::new(),
            extra_rule_cells: 0,
            kropki_marks: 0..0,
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
        let primary_house_count = compiled.houses.len();
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
                PuzzleRule::GlobalEntropy {} => {
                    compiled.global_entropy.get_or_insert(index);
                }
                PuzzleRule::Quadruple { top_left, digits }
                | PuzzleRule::QuadrupleSum { top_left, digits } => {
                    let is_sum = matches!(rule, PuzzleRule::QuadrupleSum { .. });
                    let clue = Quadruple::compile(
                        &compiled,
                        index,
                        *top_left,
                        digits,
                        is_sum,
                        enforce_regions,
                    )?;
                    compiled.quadruples.push(clue);
                }
                PuzzleRule::LetteredQuadruples { clues } => {
                    if compiled.lettered_quadruples.is_some() {
                        return Err(VariantDefinitionError::InvalidRule(index));
                    }
                    compiled.lettered_quadruples = Some(LetteredQuadruples::compile(
                        self,
                        index,
                        clues,
                        enforce_regions,
                    )?);
                }
                PuzzleRule::Arrow { .. }
                | PuzzleRule::PillArrow { .. }
                | PuzzleRule::Renban { .. }
                | PuzzleRule::ConsecutiveRun { .. }
                | PuzzleRule::DistinctCells { .. }
                | PuzzleRule::InsideGrid { .. }
                | PuzzleRule::Entropic { .. }
                | PuzzleRule::Modular { .. }
                | PuzzleRule::Between { .. }
                | PuzzleRule::Lockout { .. }
                | PuzzleRule::RegionSum { .. }
                | PuzzleRule::Sandwich { .. }
                | PuzzleRule::LittleKiller { .. }
                | PuzzleRule::XSum { .. }
                | PuzzleRule::Skyscrapers { .. } => {
                    let line = LineConstraint::compile(&mut compiled, index, rule, enforce_regions)?;
                    compiled.lines.push(line);
                }
                PuzzleRule::Parity { .. }
                | PuzzleRule::Clone { .. }
                | PuzzleRule::AntiKnight {}
                | PuzzleRule::AntiKing {}
                | PuzzleRule::NonConsecutive { .. }
                | PuzzleRule::Inequality { .. }
                | PuzzleRule::Minimum { .. }
                | PuzzleRule::Maximum { .. }
                | PuzzleRule::Kropki { .. }
                | PuzzleRule::LabeledDots { .. }
                | PuzzleRule::Xv { .. }
                | PuzzleRule::AdjacentTotal { .. }
                | PuzzleRule::Thermometer { .. }
                | PuzzleRule::Palindrome { .. }
                | PuzzleRule::Whispers { .. } => {
                    pairs.compile_rule(&mut compiled, index, rule)?;
                }
            }
        }
        pairs.finish(&mut compiled);
        // Region geometry can remain available for sum lines after a generation
        // dependency check removes its distinctness rule. Propagate only houses
        // whose cells are actually pairwise excluded by the compiled topology.
        compiled.search_houses = compiled
            .house_masks
            .iter()
            .enumerate()
            .filter_map(|(index, &mask)| {
                cells_in(mask)
                    .all(|cell| {
                        let others = mask & !(1u128 << cell);
                        compiled.peers[cell] & others == others
                    })
                    .then_some(index)
            })
            .collect();
        compiled.positive_sums = positive_sums(&self.rules);
        compile_line_sums(&mut compiled);
        compiled.extra_rule_cells = compiled.house_masks[primary_house_count..]
            .iter()
            .copied()
            .chain(compiled.cages.iter().map(|cage| cage.mask))
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
        if compiled.global_entropy.is_some() || compiled.lettered_quadruples.is_some() {
            compiled.extra_rule_cells = (1u128 << CELLS) - 1;
        }
        Ok(compiled)
    }
}

impl CompiledVariant {
    fn add_regions(&mut self, regions_layout: &RegionLayout) -> Result<(), VariantDefinitionError> {
        match regions_layout {
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
            RegionLayout::Jigsaw { regions } | RegionLayout::Partial { regions } => {
                if regions.len() > 9
                    || matches!(regions_layout, RegionLayout::Jigsaw { .. }) && regions.len() != 9
                {
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
                    if matches!(regions_layout, RegionLayout::Partial { .. }) && !connected(mask) {
                        return Err(VariantDefinitionError::DisconnectedRegion(i));
                    }
                    covered |= mask;
                    self.add_house(kind, cells)?;
                }
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

    pub(super) fn add_peers(&mut self, mask: u128) {
        for cell in cells_in(mask) {
            self.peers[cell] |= mask & !(1 << cell);
        }
    }
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
