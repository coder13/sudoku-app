use super::{ContainedJoin, LineConstraint, LineKind, contained_joins, record_support};
use crate::{
    Candidate,
    hints::digit_bit,
    variant::{CompiledVariant, VariantHouseKind, VariantRenbanSumHouseWitness, cell_mask},
};

/// A Little Killer ray with a contained Renban and one further Renban.
pub(in crate::variant) struct HouseJoin<'a> {
    pub pair: ContainedJoin<'a>,
    pub other: &'a LineConstraint,
    pub house: VariantHouseKind,
    /// Index of the shared cell in the ray.
    pub pivot: usize,
    /// Index of the shared cell in the other Renban.
    pub other_pivot: usize,
    /// Index of the one additional ray cell in the same house as the other Renban.
    pub bridge: usize,
}

#[derive(Debug, Eq, PartialEq)]
pub(in crate::variant) struct HouseSupport {
    pub with_house: [u16; 9],
    pub without_house: [u16; 9],
}

impl HouseJoin<'_> {
    pub fn support(&self, ray: &[u16], other: &[u16]) -> HouseSupport {
        assert_eq!(ray.len(), self.pair.cells().len());
        assert_eq!(other.len(), self.other.cells.len());
        assert_eq!(ray[self.pivot], other[self.other_pivot]);

        let mut with_house = [0; 9];
        let mut viable_pivot = 0;
        let mut projected = [0; 9];
        let projected = &mut projected[..ray.len()];
        projected.copy_from_slice(ray);

        for (interval, pivot) in self.intervals(other) {
            viable_pivot |= pivot;
            projected[self.pivot] = pivot;
            // Every placement of this interval in the other Renban uses
            // every one of its digits in the shared house.
            projected[self.bridge] = ray[self.bridge] & !interval;
            let support = self.pair.support(projected);
            for (mask, supported) in with_house.iter_mut().zip(support.masks) {
                *mask |= supported;
            }
        }

        projected[self.pivot] = viable_pivot;
        projected[self.bridge] = ray[self.bridge];
        HouseSupport {
            with_house,
            without_house: self.pair.support(projected).masks,
        }
    }

    fn intervals<'a>(&'a self, other: &'a [u16]) -> impl Iterator<Item = (u16, u16)> + 'a {
        (0..=9 - other.len()).filter_map(move |first| {
            let interval = ((1 << other.len()) - 1) << first;
            let mut allowed = [0; 9];
            record_support::<9, 512>(interval, other, &mut allowed, &mut [None; 512])
                .then_some((interval, allowed[self.other_pivot]))
        })
    }

    /// Show the short contradiction when the assumed digit fixes the shared
    /// cell and the other Renban has a single interval.
    pub fn witness(
        &self,
        ray: &[u16],
        other: &[u16],
        candidate: Candidate,
    ) -> Option<VariantRenbanSumHouseWitness> {
        let target = self
            .pair
            .cells()
            .iter()
            .position(|&cell| cell == candidate.cell)?;
        let mut assumed = [0; 9];
        let assumed = &mut assumed[..ray.len()];
        assumed.copy_from_slice(ray);
        assumed[target] = digit_bit(candidate.digit);
        let pair = self.pair.support(assumed);
        let shared = pair.masks[self.pivot];
        if !shared.is_power_of_two() {
            return None;
        }

        let mut linked = [0; 9];
        let linked = &mut linked[..other.len()];
        linked.copy_from_slice(other);
        linked[self.other_pivot] = shared;
        let mut intervals = self.intervals(linked);
        let (interval, _) = intervals.next()?;
        let restricted_digits = pair.masks[self.bridge];
        if intervals.next().is_some() || restricted_digits & !interval != 0 {
            return None;
        }
        Some(VariantRenbanSumHouseWitness {
            candidate,
            shared_digit: shared.trailing_zeros() as u8 + 1,
            contained_start: pair
                .starts
                .is_power_of_two()
                .then(|| pair.starts.trailing_zeros() as u8 + 1),
            other_start: interval.trailing_zeros() as u8 + 1,
            restricted_digits,
        })
    }
}

/// Join through exactly one shared cell. A single additional ray cell in the
/// house lets its digit exclusion stand in for all cross-clue house conflicts.
pub(in crate::variant) fn house_joins(
    puzzle: &CompiledVariant,
) -> impl Iterator<Item = HouseJoin<'_>> {
    contained_joins(puzzle).flat_map(move |pair| {
        let ray = cell_mask(pair.cells()).expect("compiled ray");
        puzzle
            .lines
            .iter()
            .filter_map(move |other| {
                if !matches!(other.kind, LineKind::Renban) || other.cells.len() < 2 {
                    return None;
                }
                let cells = cell_mask(&other.cells).expect("compiled Renban");
                let shared = ray & cells;
                if !shared.is_power_of_two() {
                    return None;
                }
                Some((other, cells, shared.trailing_zeros() as usize))
            })
            .flat_map(move |(other, cells, shared)| {
                let pivot = pair
                    .cells()
                    .iter()
                    .position(|&cell| cell == shared)
                    .unwrap();
                let other_pivot = other.cells.iter().position(|&cell| cell == shared).unwrap();
                puzzle.memberships[shared].iter().filter_map(move |&index| {
                    let house = puzzle.house_masks[index];
                    if house & cells != cells || (house & ray).count_ones() != 2 {
                        return None;
                    }
                    let bridge = pair
                        .cells()
                        .iter()
                        .position(|&cell| cell != shared && house & (1 << cell) != 0)
                        .unwrap();
                    Some(HouseJoin {
                        pair,
                        other,
                        house: puzzle.houses[index].kind,
                        pivot,
                        other_pivot,
                        bridge,
                    })
                })
            })
    })
}

#[cfg(test)]
mod tests;
