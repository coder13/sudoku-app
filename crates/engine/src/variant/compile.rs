//! Validate puzzle definitions and compile shared topology and rule data.

use std::sync::OnceLock;

use super::{
    AqreConstraint, CompiledConditionalNeighbor, CompiledMagicSquare, CompiledNeighborMatch,
    CompiledUnknownCageSums, CompiledVariant, LetteredQuadruples, LineConstraint, PuzzleRule,
    Quadruple, RegionLayout, VARIANT_FORMAT_VERSION, VariantDefinitionError, VariantHouse,
    VariantHouseKind, VariantPuzzle, cell_mask, cells_in,
    lines::{TerrainSandwichCache, compile_line_sums},
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
            search_degree: [0; CELLS],
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
            neighbor_matches: Vec::new(),
            conditional_neighbors: Vec::new(),
            magic_squares: Vec::new(),
            unknown_cage_sums: Vec::new(),
            global_entropy: None,
            global_entropy_groups: [0b000000111, 0b000111000, 0b111000000],
            entropy_window_groups: Vec::new(),
            aqre_rules: Vec::new(),
            pair_clues: Vec::new(),
            positive_sums: Vec::new(),
            pair_clue_memberships: std::array::from_fn(|_| Vec::new()),
            parity_clues: Vec::new(),
            digit_restriction_clues: Vec::new(),
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
        let mut terrain_sandwich_cache = TerrainSandwichCache::new();
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
                PuzzleRule::GlobalEntropy { groups } => {
                    let groups = if groups.is_empty() {
                        [0b000000111, 0b000111000, 0b111000000]
                    } else {
                        let mut masks = [0u16; 3];
                        let mut seen = 0u16;
                        if groups.len() != 3 {
                            return Err(VariantDefinitionError::InvalidRule(index));
                        }
                        for (group, digits) in groups.iter().enumerate() {
                            if digits.is_empty() {
                                return Err(VariantDefinitionError::InvalidRule(index));
                            }
                            for &digit in digits {
                                if !(1..=9).contains(&digit) || seen & (1 << (digit - 1)) != 0 {
                                    return Err(VariantDefinitionError::InvalidRule(index));
                                }
                                let bit = 1 << (digit - 1);
                                seen |= bit;
                                masks[group] |= bit;
                            }
                        }
                        if seen != 0b111111111 {
                            return Err(VariantDefinitionError::InvalidRule(index));
                        }
                        let mut canonical_masks = masks;
                        canonical_masks.sort_unstable();
                        if canonical_masks != [0b000000111, 0b000111000, 0b111000000] {
                            return Err(VariantDefinitionError::InvalidRule(index));
                        }
                        masks
                    };
                    compiled.global_entropy_groups = groups;
                    compiled.global_entropy.get_or_insert(index);
                }
                PuzzleRule::EntropyWindowGroup { cells, group } => {
                    let [top_left, top_right, bottom_left, bottom_right] = *cells;
                    if top_left >= 72
                        || top_left % 9 >= 8
                        || top_right != top_left + 1
                        || bottom_left != top_left + 9
                        || bottom_right != top_left + 10
                    {
                        return Err(VariantDefinitionError::InvalidRule(index));
                    }
                    compiled.entropy_window_groups.push((index, *cells, *group));
                }
                PuzzleRule::DigitOrder { .. } | PuzzleRule::ForbiddenEntropicConnection { .. } => {
                    let line = LineConstraint::compile(
                        &mut compiled,
                        index,
                        rule,
                        enforce_regions,
                        &mut terrain_sandwich_cache,
                    )?;
                    compiled.lines.push(line);
                }
                PuzzleRule::Aqre {
                    kind,
                    regions,
                    given_shades,
                } => {
                    if compiled.aqre_rules.len() > 0 {
                        return Err(VariantDefinitionError::InvalidRule(index));
                    }
                    let aqre = AqreConstraint::compile(*kind, regions, given_shades)
                        .map_err(|_| VariantDefinitionError::InvalidRule(index))?;
                    compiled.aqre_rules.push(aqre);
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
                PuzzleRule::NeighborMatch { clues } => {
                    compiled
                        .neighbor_matches
                        .extend(CompiledNeighborMatch::compile(index, clues)?);
                }
                PuzzleRule::ConditionalNeighbor {
                    trigger_digit,
                    alternatives,
                } => {
                    compiled
                        .conditional_neighbors
                        .extend(CompiledConditionalNeighbor::compile(
                            index,
                            *trigger_digit,
                            alternatives,
                        )?);
                }
                PuzzleRule::MagicSquare { cells } => {
                    compiled
                        .magic_squares
                        .push(CompiledMagicSquare::compile(index, cells)?);
                }
                PuzzleRule::UnknownCageSums {
                    cages,
                    consecutive_pairs,
                } => {
                    compiled
                        .unknown_cage_sums
                        .push(CompiledUnknownCageSums::compile(
                            index,
                            cages,
                            consecutive_pairs,
                            &mut occupied_cages,
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
                | PuzzleRule::TerrainSandwich { .. }
                | PuzzleRule::LittleKiller { .. }
                | PuzzleRule::XSum { .. }
                | PuzzleRule::Skyscrapers { .. } => {
                    let line = LineConstraint::compile(
                        &mut compiled,
                        index,
                        rule,
                        enforce_regions,
                        &mut terrain_sandwich_cache,
                    )?;
                    compiled.lines.push(line);
                }
                PuzzleRule::Parity { .. }
                | PuzzleRule::DigitRestriction { .. }
                | PuzzleRule::Clone { .. }
                | PuzzleRule::AntiKnight {}
                | PuzzleRule::AntiKing {}
                | PuzzleRule::NonConsecutive { .. }
                | PuzzleRule::DistantNeighbors { .. }
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
        for square in &mut compiled.magic_squares {
            square.use_normal_patterns_when_all_distinct(&compiled.peers);
        }
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
        for line in &compiled.lines {
            let mut seen = 0u128;
            for &cell in &line.cells {
                let bit = 1u128 << cell;
                if seen & bit == 0 {
                    compiled.search_degree[cell] += 1;
                    seen |= bit;
                }
            }
        }
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
            .chain(
                compiled
                    .digit_restriction_clues
                    .iter()
                    .map(|clue| 1u128 << clue.cell),
            )
            .chain(
                compiled
                    .neighbor_matches
                    .iter()
                    .flat_map(|clue| clue.neighbors.iter().map(|&cell| 1u128 << cell)),
            )
            .chain(compiled.conditional_neighbors.iter().flat_map(|clue| {
                std::iter::once(clue.source)
                    .chain(clue.alternatives.iter().map(|&(cell, _)| cell))
                    .map(|cell| 1u128 << cell)
            }))
            .fold(0, |cells, scope| cells | scope);
        if compiled.global_entropy.is_some()
            || compiled.lettered_quadruples.is_some()
            || !compiled.aqre_rules.is_empty()
        {
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
