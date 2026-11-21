//! Killer cage compilation, exact support, and house-sum geometry.

use super::{
    CompiledVariant, KillerCage, VariantDefinitionError, VariantHouseKind, cell_mask, cells_in,
    digit_sum,
    lines::sum_support,
    search::{SearchPosition, record_support},
};
use crate::{Board, DIGITS, hints::digit_bit};

#[derive(Clone, Debug)]
pub(super) struct CompiledCage {
    pub cells: Vec<usize>,
    pub mask: u128,
    pub sum: u16,
    // The source rule and cage within it, for evidence and replay.
    pub reference: [usize; 2],
    combinations: Vec<u16>,
}

#[derive(Clone, Debug)]
pub(super) struct CageHouseSum {
    pub house: VariantHouseKind,
    pub cells: Vec<usize>,
    pub sum: u16,
    pub cages: Vec<[usize; 2]>,
    inside_combinations: Option<Vec<u16>>,
}

impl CompiledVariant {
    pub(super) fn add_cage(
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
        let combinations: Vec<_> = digit_sets(cage.cells.len(), cage.sum).collect();
        if combinations.is_empty() {
            return Err(VariantDefinitionError::InvalidCageSum(index));
        }
        self.add_peers(mask);
        self.cages.push(CompiledCage {
            cells: cage.cells.clone(),
            mask,
            sum: cage.sum,
            reference: [rule_index, cage_index],
            combinations,
        });
        *occupied |= mask;
        Ok(())
    }

    pub(super) fn cage_house_sum_scopes(&self) -> &[CageHouseSum] {
        if self.cages.is_empty() {
            return &[];
        }
        self.cage_house_sums.get_or_init(|| {
            let mut scopes = Vec::new();
            for (house, &house_mask) in self.houses.iter().zip(&self.house_masks) {
                let mut interior = house_mask;
                let mut interior_total = 45;
                let mut inside_cages = Vec::new();
                let mut covered = 0;
                let mut covering_total = 0;
                let mut covering_cages = Vec::new();
                for cage in &self.cages {
                    if cage.mask & house_mask == 0 {
                        continue;
                    }
                    if cage.mask & !house_mask == 0 {
                        interior &= !cage.mask;
                        interior_total -= i32::from(cage.sum);
                        inside_cages.push(cage.reference);
                    }
                    covered |= cage.mask;
                    covering_total += i32::from(cage.sum);
                    covering_cages.push(cage.reference);
                }
                let innies = (interior, interior_total, inside_cages, true);
                let outies = (
                    covered & !house_mask,
                    covering_total - 45,
                    covering_cages,
                    false,
                );
                for (residue, sum, cages, inside) in [innies, outies] {
                    if cages.is_empty()
                        || !(1..=9).contains(&residue.count_ones())
                        || !(1..=81).contains(&sum)
                        || !inside && covered & house_mask != house_mask
                    {
                        continue;
                    }
                    let cells: Vec<_> = cells_in(residue).collect();
                    let sum = sum as u16;
                    let inside_combinations =
                        inside.then(|| digit_sets(cells.len(), sum).collect());
                    scopes.push(CageHouseSum {
                        house: house.kind,
                        cells,
                        sum,
                        cages,
                        inside_combinations,
                    });
                }
            }
            scopes
        })
    }
}

impl CageHouseSum {
    pub(super) fn support(&self, domains: &[u16]) -> [u16; 9] {
        if let Some(sets) = &self.inside_combinations {
            distinct_support(domains, sets.iter().copied())
        } else {
            let mut support = [0; 9];
            sum_support(domains, 1 << self.sum, &mut support);
            support
        }
    }
}

impl CompiledCage {
    pub(super) fn permits_placements(&self, board: &Board) -> bool {
        let fixed = self.cells.iter().fold(0, |mask, &cell| match board[cell] {
            0 => mask,
            digit => mask | digit_bit(digit),
        });
        self.combinations.iter().any(|&set| set & fixed == fixed)
    }

    pub(super) fn support(&self, domains: &[u16]) -> [u16; 9] {
        self.support_with_placed_digits(domains, 0)
    }

    fn support_with_placed_digits(&self, domains: &[u16], fixed: u16) -> [u16; 9] {
        distinct_support(
            domains,
            self.combinations
                .iter()
                .copied()
                .filter(|&set| set & fixed == fixed)
                .map(|set| set & !fixed),
        )
    }

    pub(super) fn restrict(&self, position: &mut SearchPosition) {
        let mut candidates = [0; 9];
        let mut open = [0; 9];
        let mut fixed = 0;
        let mut len = 0;
        for &cell in &self.cells {
            let digit = position.board[cell];
            if digit == 0 {
                open[len] = cell;
                candidates[len] = position.masks[cell];
                len += 1;
            } else {
                fixed |= digit_bit(digit);
            }
        }
        if len == 0 {
            return;
        }

        let support = self.support_with_placed_digits(&candidates[..len], fixed);
        for (index, &cell) in open[..len].iter().enumerate() {
            position.masks[cell] &= support[index];
        }
    }
}

fn digit_sets(size: usize, sum: u16) -> impl Iterator<Item = u16> {
    (1..=DIGITS).filter(move |set| set.count_ones() as usize == size && digit_sum(*set) == sum)
}

fn distinct_support(domains: &[u16], sets: impl Iterator<Item = u16>) -> [u16; 9] {
    let mut support = [0; 9];
    // A digit set only supports a candidate if its digits can be assigned to the cells.
    for set in sets {
        record_support(set, domains, &mut support, &mut [None; 512]);
    }
    support
}
