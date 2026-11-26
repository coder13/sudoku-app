use super::{MAX_SIZE, SizedGrid};

const MAX_ARROW_CELLS: usize = 2 * MAX_SIZE - 1;

#[derive(Debug)]
pub(super) struct Arrow {
    pub(super) circle: usize,
    pub(super) cells: Vec<usize>,
    // Each partition groups shaft cells that cannot repeat a digit.
    partitions: Vec<Vec<Vec<usize>>>,
    value_offset: u8,
}

impl Arrow {
    pub(super) fn compile(
        layout: &SizedGrid,
        circle: usize,
        cells: &[usize],
        value_offset: u8,
    ) -> Option<Self> {
        let size = layout.size();
        // A shaft can contain at most one zero per row. Each other digit adds at least one.
        let max_length = if value_offset == 0 {
            size
        } else {
            2 * size - 1
        };
        let cell_count = if value_offset == 0 {
            layout.cell_count()
        } else {
            size * size
        };
        if circle >= cell_count
            || !(1..=max_length).contains(&cells.len())
            || cells.iter().enumerate().any(|(i, &cell)| {
                cell >= cell_count || cell == circle || cells[..i].contains(&cell)
            })
        {
            return None;
        }
        let mut partitions = Vec::new();
        if cells.len() > size {
            for axis in 0..layout.houses.len() / size {
                let mut groups = vec![Vec::new(); size];
                for (index, &cell) in cells.iter().enumerate() {
                    groups[layout.memberships[cell][axis] - axis * size].push(index);
                }
                groups.retain(|group| !group.is_empty());
                if groups.iter().any(|group| group.len() > 1) {
                    partitions.push(groups);
                }
            }
        }
        Some(Self {
            circle,
            cells: cells.to_vec(),
            partitions,
            value_offset,
        })
    }

    pub(super) fn support(&self, candidates: &[u16]) -> (u16, [u16; MAX_ARROW_CELLS]) {
        let (mut bulb, mut shaft) =
            arrow_masks(self.circle, &self.cells, candidates, self.value_offset);
        if bulb != 0 {
            for groups in &self.partitions {
                bulb = retain_house_support(groups, &mut shaft, bulb);
                if bulb == 0 {
                    break;
                }
            }
        }
        (bulb, shaft)
    }

    pub(super) fn permits(&self, digits: &[u8], full_mask: u16) -> bool {
        let Some(&bulb) = digits.get(self.circle) else {
            return false;
        };
        let bulb_mask = if bulb == 0 {
            full_mask
        } else {
            1 << (bulb - 1)
        };
        let shaft = self
            .cells
            .iter()
            .map(|&cell| digits.get(cell).copied().unwrap_or(0))
            .map(|digit| {
                if digit == 0 {
                    full_mask
                } else {
                    1 << (digit - 1)
                }
            });
        let mut candidates = vec![full_mask; digits.len()];
        candidates[self.circle] = bulb_mask;
        for (&cell, mask) in self.cells.iter().zip(shaft) {
            candidates[cell] = mask;
        }
        self.support(&candidates).0 != 0
    }
}

fn arrow_masks(
    circle: usize,
    cells: &[usize],
    candidates: &[u16],
    value_offset: u8,
) -> (u16, [u16; MAX_ARROW_CELLS]) {
    let mut support = [0; MAX_ARROW_CELLS];
    let min_value = u32::from(1 - value_offset);
    let totals = u32::from(candidates[circle]) << min_value;
    if totals == 0 {
        return (0, support);
    }

    // A bulb holds at most one digit. Prefix sums beyond its largest
    // candidate cannot contribute to a completion of this arrow.
    let limit = u32::MAX >> totals.leading_zeros();
    let mut prefix = [0; MAX_ARROW_CELLS + 1];
    prefix[0] = 1;
    for (index, &cell) in cells.iter().enumerate() {
        let mut domain = candidates[cell];
        let mut sums = 0;
        while domain != 0 {
            let value = domain.trailing_zeros() + min_value;
            domain &= domain - 1;
            sums |= prefix[index] << value;
        }
        prefix[index + 1] = sums & limit;
        if prefix[index + 1] == 0 {
            return (0, support);
        }
    }
    let matching = prefix[cells.len()] & totals;
    if matching == 0 {
        return (0, support);
    }

    let mut allowed = matching;
    for (index, &cell) in cells.iter().enumerate().rev() {
        let mut domain = candidates[cell];
        let mut previous = 0;
        while domain != 0 {
            let bit = domain & domain.wrapping_neg();
            domain ^= bit;
            let viable = prefix[index] & (allowed >> (bit.trailing_zeros() + min_value));
            if viable != 0 {
                support[index] |= bit;
                previous |= viable;
            }
        }
        allowed = previous;
    }
    ((matching >> min_value) as u16, support)
}

fn retain_house_support(groups: &[Vec<usize>], shaft: &mut [u16], bulb: u16) -> u16 {
    let max_total = u16::BITS - bulb.leading_zeros() - 1;
    let limit = (1 << (max_total + 1)) - 1;
    let mut totals = [0; MAX_SIZE];
    let mut prefix = [0; MAX_SIZE + 1];
    prefix[0] = 1;
    for (i, group) in groups.iter().enumerate() {
        let values = if let [cell] = group.as_slice() {
            u32::from(shaft[*cell]) & limit
        } else {
            let mut domains = [0; MAX_SIZE];
            for (mask, &cell) in domains.iter_mut().zip(group) {
                *mask = shaft[cell];
            }
            let mut possible = 0;
            group_assignments(&domains[..group.len()], max_total, |sum, _| {
                possible |= 1 << sum
            });
            possible
        };
        totals[i] = values;
        let mut remaining = values;
        while remaining != 0 {
            prefix[i + 1] |= prefix[i] << remaining.trailing_zeros();
            remaining &= remaining - 1;
        }
        prefix[i + 1] &= limit;
        if prefix[i + 1] == 0 {
            return 0;
        }
    }
    let matching = prefix[groups.len()] & u32::from(bulb);
    if matching == 0 {
        return 0;
    }

    let mut allowed = matching;
    for (i, group) in groups.iter().enumerate().rev() {
        let mut previous = 0;
        let mut viable_totals = 0;
        let mut remaining = totals[i];
        while remaining != 0 {
            let total = remaining.trailing_zeros();
            remaining &= remaining - 1;
            let viable_prefix = prefix[i] & (allowed >> total);
            if viable_prefix != 0 {
                previous |= viable_prefix;
                viable_totals |= 1 << total;
            }
        }
        if let [cell] = group.as_slice() {
            shaft[*cell] = viable_totals as u16;
        } else {
            let mut domains = [0; MAX_SIZE];
            let mut support = [0; MAX_SIZE];
            for (mask, &cell) in domains.iter_mut().zip(group) {
                *mask = shaft[cell];
            }
            group_assignments(&domains[..group.len()], max_total, |sum, bits| {
                if viable_totals & (1 << sum) != 0 {
                    for (mask, bit) in support.iter_mut().zip(bits) {
                        *mask |= *bit;
                    }
                }
            });
            for (&cell, mask) in group.iter().zip(support) {
                shaft[cell] = mask;
            }
        }
        allowed = previous;
    }
    matching as u16
}

fn group_assignments(domains: &[u16], limit: u32, mut found: impl FnMut(u32, &[u16])) {
    let count = domains.len() as u32;
    if count * count.saturating_sub(1) / 2 > limit {
        return;
    }

    fn visit(
        domains: &[u16],
        used: u16,
        sum: u32,
        limit: u32,
        chosen: &mut [u16; MAX_SIZE],
        index: usize,
        found: &mut impl FnMut(u32, &[u16]),
    ) {
        let Some((&mask, rest)) = domains.split_first() else {
            found(sum, &chosen[..index]);
            return;
        };
        let mut candidates = mask & !used;
        while candidates != 0 {
            let value = candidates.trailing_zeros();
            if sum + value > limit {
                break;
            }
            let bit = 1 << value;
            candidates ^= bit;
            chosen[index] = bit;
            visit(
                rest,
                used | bit,
                sum + value,
                limit,
                chosen,
                index + 1,
                found,
            );
        }
    }
    visit(domains, 0, 0, limit, &mut [0; MAX_SIZE], 0, &mut found);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_arrow_support_matches_the_general_sum_kernel() {
        fn check(candidates: &[u16]) {
            let shaft = &([1, 2, 3, 4])[..candidates.len() - 1];
            let mut support = [0; MAX_SIZE];
            let [matched] = crate::variant::sum_support_with_prefix(
                &candidates[1..],
                [u128::from(candidates[0]) << 1],
                &mut support[..shaft.len()],
                &mut [[0]; MAX_SIZE + 1],
            );
            let (bulb, shaft_support) = arrow_masks(0, shaft, candidates, 0);
            assert_eq!(bulb, (matched >> 1) as u16);
            assert_eq!(shaft_support[..shaft.len()], support[..shaft.len()]);
        }

        for bulb in 0..16 {
            for a in 0..16 {
                for b in 0..16 {
                    check(&[bulb, a, b]);
                    for c in 0..16 {
                        check(&[bulb, a, b, c]);
                    }
                }
            }
        }
        check(&[1 << 15, 1 << 15]);
        check(&[1 << 15, 1 << 15, 1]);
        check(&[u16::MAX, u16::MAX, u16::MAX, u16::MAX, u16::MAX]);
    }

    #[test]
    fn grouped_zero_based_support_matches_distinct_sums() {
        let groups = [vec![0, 2], vec![1, 3]];
        let mut seed = 17u32;
        for _ in 0..2000 {
            let mut next_mask = || {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                (seed >> 27) as u16
            };
            let bulb = next_mask();
            if bulb == 0 {
                continue;
            }
            let mut shaft = [next_mask(), next_mask(), next_mask(), next_mask()];
            let mut expected_bulb = 0;
            let mut expected_shaft = [0; 4];
            for a in 0..5 {
                for b in 0..5 {
                    for c in 0..5 {
                        for d in 0..5 {
                            let total = a + b + c + d;
                            let values = [a, b, c, d].map(|digit| 1 << digit);
                            if a != c
                                && b != d
                                && total < 5
                                && bulb & (1 << total) != 0
                                && values.iter().zip(shaft).all(|(&bit, mask)| bit & mask != 0)
                            {
                                expected_bulb |= 1 << total;
                                for (mask, bit) in expected_shaft.iter_mut().zip(values) {
                                    *mask |= bit;
                                }
                            }
                        }
                    }
                }
            }
            assert_eq!(
                retain_house_support(&groups, &mut shaft, bulb),
                expected_bulb
            );
            if expected_bulb != 0 {
                assert_eq!(shaft, expected_shaft);
            }
        }
    }
}
