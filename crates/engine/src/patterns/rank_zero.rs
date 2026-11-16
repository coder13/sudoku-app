use super::{House, bit_indices, digits, house_cells};
use crate::SectorLink;

pub(super) const HOUSES: [House; 27] = {
    let mut houses = [House::Row(0); 27];
    let mut index = 0;
    while index < 9 {
        houses[index] = House::Row(index);
        houses[9 + index] = House::Column(index);
        houses[18 + index] = House::Box(index);
        index += 1;
    }
    houses
};

pub(super) fn link(house: House, mask: u16) -> SectorLink {
    SectorLink {
        house,
        digits: digits(mask).collect(),
    }
}

pub(super) fn eliminations(
    body: u128,
    links: &[(House, u16)],
    positions: &[u128; 9],
) -> Option<[u128; 9]> {
    if links.iter().map(|(_, mask)| mask.count_ones()).sum::<u32>() != body.count_ones() {
        return None;
    }
    let mut covered = [0; 9];
    let mut twice = [0; 9];
    for &(house, mask) in links {
        for digit in bit_indices(mask) {
            let in_house = house_cells(house) & positions[digit];
            twice[digit] |= covered[digit] & in_house;
            covered[digit] |= in_house;
        }
    }
    for (&positions, &covered) in positions.iter().zip(&covered) {
        if positions & body & !covered != 0 {
            return None;
        }
    }
    // Each body cell uses one slot. Every extra candidate would need a further
    // slot, including a body candidate that would use two slots by itself.
    Some(std::array::from_fn(|digit| {
        (covered[digit] & !body) | twice[digit]
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hints::patterns::cell_bit;

    #[test]
    fn exact_capacity_excludes_extra_and_twice_covered_candidates() {
        let body = cell_bit(0) | cell_bit(3) | cell_bit(27);
        let mut positions = [0; 9];
        positions[0] = body | cell_bit(4);
        positions[1] = cell_bit(0);
        let links = [
            (House::Row(0), 1),
            (House::Column(0), 1),
            (House::Box(0), 2),
        ];
        let mut expected = [0; 9];
        expected[0] = cell_bit(0) | cell_bit(4);
        assert_eq!(eliminations(body, &links, &positions), Some(expected));
        assert_eq!(eliminations(body, &links[..2], &positions), None);
        positions[8] = cell_bit(27);
        assert_eq!(eliminations(body, &links, &positions), None);
    }
}
