//! Complete joint template support with a bounded alternate witness order.

use super::{cell_bit, cells};

mod interchangeable;

#[derive(Clone, Copy)]
pub(super) struct Family<'a> {
    pub(super) digit: usize,
    pub(super) allowed: u128,
    pub(super) layouts: &'a [u128],
}

// Preserve quick witnesses in the original order before trying the alternate.
// Its work limit counts every inspected layout, including rejected patterns.
const ORIGINAL_CHOICES: u16 = 64;
const ALTERNATE_CHECKS: u32 = 4096;

pub(super) fn compatible_support(families: &[Family<'_>], support: [u128; 9]) -> [u128; 9] {
    support_with_probes(families, support, ORIGINAL_CHOICES, ALTERNATE_CHECKS)
}

fn support_with_probes(
    families: &[Family<'_>],
    mut support: [u128; 9],
    choices: u16,
    checks: u32,
) -> [u128; 9] {
    let mut witness = [0; 9];
    for (index, family) in families.iter().enumerate() {
        let followers: Vec<_> = families[..index]
            .iter()
            .chain(&families[index + 1..])
            .copied()
            .collect();
        for cell in cells(family.allowed & !support[family.digit]) {
            let target = cell_bit(cell);
            if support[family.digit] & target != 0 {
                continue;
            }
            // Reserve the candidate's cell while choosing the other digits.
            // Deferring this digit's full template can find a witness before
            // committing its other eight cells to an unsuitable pattern.
            let mut remaining = choices;
            let probed = probe_anchored(family, &followers, target, &mut witness, &mut remaining)
                .or_else(|| {
                    let mut remaining = checks;
                    probe_followers(
                        &followers,
                        target,
                        family,
                        target,
                        &mut witness,
                        &mut remaining,
                    )
                });
            let found = if let Some(found) = probed {
                found
            } else {
                if let Some(complete) = interchangeable::support(families, support) {
                    return complete;
                }
                let layout = family.layouts.iter().copied().find(|&layout| {
                    layout & target != 0
                        && layout & !family.allowed == 0
                        && disjoint_layouts(&followers, layout, &mut witness)
                });
                if let Some(layout) = layout {
                    witness[family.digit] = layout;
                    true
                } else {
                    false
                }
            };
            if found {
                // Every digit in this complete witness gains support.
                for (supported, used) in support.iter_mut().zip(witness) {
                    *supported |= used;
                }
            }
        }
    }
    support
}

fn probe_anchored(
    pinned: &Family<'_>,
    followers: &[Family<'_>],
    target: u128,
    witness: &mut [u128; 9],
    choices: &mut u16,
) -> Option<bool> {
    if *choices == 0 {
        return None;
    }
    for &layout in pinned.layouts {
        if layout & target != 0 && layout & !pinned.allowed == 0 {
            if *choices == 0 {
                return None;
            }
            *choices -= 1;
            if probe_disjoint(followers, layout, witness, choices)? {
                witness[pinned.digit] = layout;
                return Some(true);
            }
        }
    }
    Some(false)
}

fn probe_disjoint(
    families: &[Family<'_>],
    occupied: u128,
    witness: &mut [u128; 9],
    choices: &mut u16,
) -> Option<bool> {
    let Some((family, rest)) = families.split_first() else {
        return Some(true);
    };
    if *choices == 0 {
        return None;
    }
    let forbidden = occupied | !family.allowed;
    for &layout in family.layouts {
        if layout & forbidden == 0 {
            if *choices == 0 {
                return None;
            }
            *choices -= 1;
            if probe_disjoint(rest, occupied | layout, witness, choices)? {
                witness[family.digit] = layout;
                return Some(true);
            }
        }
    }
    Some(false)
}

/// `None` means the alternate order is inconclusive; `Some(false)` means its
/// entire search finished without a witness. Neither case truncates support.
fn probe_followers(
    families: &[Family<'_>],
    occupied: u128,
    pinned: &Family<'_>,
    required: u128,
    witness: &mut [u128; 9],
    checks: &mut u32,
) -> Option<bool> {
    if *checks == 0 {
        return None;
    }
    let Some((family, rest)) = families.split_first() else {
        let forbidden = (occupied & !required) | !pinned.allowed;
        for &layout in pinned.layouts {
            if *checks == 0 {
                return None;
            }
            *checks -= 1;
            if layout & required != 0 && layout & forbidden == 0 {
                witness[pinned.digit] = layout;
                return Some(true);
            }
        }
        return Some(false);
    };
    let forbidden = occupied | !family.allowed;
    for &layout in family.layouts {
        if *checks == 0 {
            return None;
        }
        *checks -= 1;
        if layout & forbidden == 0 {
            if probe_followers(rest, occupied | layout, pinned, required, witness, checks)? {
                witness[family.digit] = layout;
                return Some(true);
            }
        }
    }
    Some(false)
}

fn disjoint_layouts(families: &[Family<'_>], occupied: u128, witness: &mut [u128; 9]) -> bool {
    let Some((family, rest)) = families.split_first() else {
        return true;
    };
    let forbidden = occupied | !family.allowed;
    for &layout in family.layouts {
        if layout & forbidden == 0 && disjoint_layouts(rest, occupied | layout, witness) {
            witness[family.digit] = layout;
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    // Enumerate complete assignments independently of candidate pinning,
    // witness seeds, budgets or either production traversal order.
    fn direct(families: &[Family<'_>]) -> [u128; 9] {
        fn visit(
            families: &[Family<'_>],
            occupied: u128,
            used: &mut [u128; 9],
            support: &mut [u128; 9],
        ) {
            if let Some((family, rest)) = families.split_first() {
                for &layout in family.layouts {
                    if layout & !family.allowed == 0 && layout & occupied == 0 {
                        used[family.digit] = layout;
                        visit(rest, occupied | layout, used, support);
                    }
                }
            } else {
                for (support, used) in support.iter_mut().zip(used) {
                    *support |= *used;
                }
            }
        }
        let mut support = [0; 9];
        visit(families, 0, &mut [0; 9], &mut support);
        support
    }

    #[test]
    fn complete_support_matches_direct_assignments_with_edits_seeds_and_probe_exhaustion() {
        let mut random = crate::Random::from_seed(1792026);
        let sites = [0, 3, 8, 20, 63, 64, 72, 80];
        let digits = [8, 0, 5, 2, 7];
        for width in 2..=5 {
            for sample in 0..96 {
                let input: Vec<Vec<u128>> = (0..width)
                    .map(|index| {
                        let mut layouts: Vec<_> = (0..random.index(5))
                            .map(|_| {
                                let a = cell_bit(sites[random.index(sites.len())]);
                                a | if random.index(2) == 0 {
                                    0
                                } else {
                                    cell_bit(sites[random.index(sites.len())])
                                }
                            })
                            .collect();
                        if sample % 3 == 0 {
                            layouts.push(cell_bit(sites[index]));
                        }
                        layouts
                    })
                    .collect();
                let mut families: Vec<_> = input
                    .iter()
                    .enumerate()
                    .map(|(index, layouts)| Family {
                        digit: digits[index],
                        layouts,
                        allowed: sites.iter().enumerate().fold(0, |mask, (site, &cell)| {
                            mask | if random.index(4) != 0 || (sample % 3 == 0 && site == index) {
                                cell_bit(cell)
                            } else {
                                0
                            }
                        }),
                    })
                    .collect();
                for edit in 0..2 {
                    if edit != 0 {
                        families[0].allowed &= !cell_bit(sites[0]);
                    }
                    for reverse in 0..2 {
                        if reverse != 0 {
                            families.reverse();
                        }
                        let expected = direct(&families);
                        let seeded = std::array::from_fn(|digit| expected[digit] & (u128::MAX / 3));
                        for (budget, checks) in [
                            (0, 0),
                            (1, 0),
                            (0, 1),
                            (4, 4),
                            (ORIGINAL_CHOICES, ALTERNATE_CHECKS),
                        ] {
                            assert_eq!(
                                support_with_probes(&families, [0; 9], budget, checks),
                                expected
                            );
                            assert_eq!(
                                support_with_probes(&families, seeded, budget, checks),
                                expected
                            );
                        }
                        if reverse != 0 {
                            families.reverse();
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn full_scope_incompatibility_is_exhaustive_and_changed_domains_can_restore_support() {
        let four = [cell_bit(0), cell_bit(63), cell_bit(64), cell_bit(80)];
        let five = [
            cell_bit(0),
            cell_bit(63),
            cell_bit(64),
            cell_bit(80),
            cell_bit(8),
        ];
        let allowed = four.iter().fold(cell_bit(8), |mask, &site| mask | site);
        let mut families: Vec<_> = (0..5)
            .map(|digit| Family {
                digit,
                allowed,
                layouts: &four,
            })
            .collect();
        for (budget, checks) in [(0, 0), (1, 0), (0, 1), (ORIGINAL_CHOICES, ALTERNATE_CHECKS)] {
            assert_eq!(
                support_with_probes(&families, [0; 9], budget, checks),
                [0; 9]
            );
        }
        families[4].layouts = &five;
        let expected = direct(&families);
        assert!(expected[..5].iter().all(|&sites| sites != 0));
        for (budget, checks) in [(0, 0), (1, 0), (0, 1), (ORIGINAL_CHOICES, ALTERNATE_CHECKS)] {
            assert_eq!(
                support_with_probes(&families, [0; 9], budget, checks),
                expected
            );
        }
    }

    #[test]
    fn interchangeable_layout_domains_preserve_support_and_check_every_bitset_word() {
        let sites = [0, 1, 2, 63, 80].map(cell_bit);
        let shared = sites.iter().fold(0, |mask, site| mask | site);
        let mut layouts: Vec<_> = (0..66).map(|extra| (extra << 11) | shared).collect();
        layouts.extend(sites);
        let mut families: Vec<_> = (0..5)
            .map(|digit| Family {
                digit,
                allowed: u128::MAX,
                layouts: &layouts,
            })
            .collect();

        let exact = direct(&families);
        assert_eq!(&exact[..5], &[shared; 5]);
        let mut seeded = [0; 9];
        seeded[0] = sites[4];
        assert_eq!(support_with_probes(&families, seeded, 0, 0), exact);
        assert_eq!(compatible_support(&families, [0; 9]), exact);

        families[4].allowed &= !sites[4];
        assert!(interchangeable::support(&families, [0; 9]).is_none());
        assert_eq!(
            support_with_probes(&families, [0; 9], 0, 0),
            direct(&families)
        );

        for family in &mut families {
            family.allowed &= !sites[4];
        }
        assert_eq!(support_with_probes(&families, [0; 9], 0, 0), [0; 9]);
    }

    #[cfg(feature = "wasm-api")]
    #[test]
    fn dense_source_candidates_have_independently_checked_five_digit_witnesses() {
        use super::super::super::templates;
        let input: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/overlay-dense.json"
        ))
        .unwrap();
        let domains: Vec<u16> = input["domains"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_u64().unwrap() as u16)
            .collect();
        let houses: Vec<_> = super::super::House::all()
            .map(super::super::house_cells)
            .collect();
        let mut peers = [0; 81];
        for &house in &houses {
            for cell in cells(house) {
                peers[cell] |= house & !cell_bit(cell);
            }
        }
        let extra: Vec<[usize; 2]> = input["excludedPairs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| {
                [
                    p[0].as_u64().unwrap() as usize,
                    p[1].as_u64().unwrap() as usize,
                ]
            })
            .collect();
        for &[a, b] in &extra {
            peers[a] |= cell_bit(b);
            peers[b] |= cell_bit(a);
        }
        let layouts: Vec<_> = (0..9)
            .map(|digit| {
                let allowed = domains.iter().enumerate().fold(0, |mask, (cell, domain)| {
                    mask | if domain & (1 << digit) != 0 {
                        cell_bit(cell)
                    } else {
                        0
                    }
                });
                templates::layouts_in_houses(allowed, &houses, &peers)
            })
            .collect();
        let base: [u128; 9] = std::array::from_fn(|digit| {
            input["geometricWitness"][(digit + 1).to_string()]
                .as_array()
                .map_or(0, |sites| {
                    sites
                        .iter()
                        .fold(0, |mask, c| mask | cell_bit(c.as_u64().unwrap() as usize))
                })
        });
        let check = |witness: &[u128; 9], low: usize, target: usize| {
            let mut occupied = 0;
            for digit in [low, target, 6, 7, 8] {
                let layout = witness[digit];
                assert_eq!(layout.count_ones(), 9);
                assert_eq!(layout & occupied, 0);
                occupied |= layout;
                for cell in cells(layout) {
                    assert_ne!(domains[cell] & (1 << digit), 0);
                }
                for row in 0..9 {
                    assert_eq!(cells(layout).filter(|&cell| cell / 9 == row).count(), 1);
                }
                for col in 0..9 {
                    assert_eq!(cells(layout).filter(|&cell| cell % 9 == col).count(), 1);
                }
                for region in 0..9 {
                    assert_eq!(
                        cells(layout)
                            .filter(|&cell| cell / 27 * 3 + cell % 9 / 3 == region)
                            .count(),
                        1
                    );
                }
                for &[a, b] in &extra {
                    assert!(layout & cell_bit(a) == 0 || layout & cell_bit(b) == 0);
                }
            }
            assert_ne!(witness[target] & cell_bit(54), 0);
        };
        for low in 0..3 {
            for target in 3..6 {
                let mut supplied = [0; 9];
                supplied[low] = base[0];
                supplied[target] = base[3];
                supplied[6..].copy_from_slice(&base[6..]);
                check(&supplied, low, target);
                let mut families: Vec<_> = [low, target, 6, 7, 8]
                    .into_iter()
                    .map(|digit| Family {
                        digit,
                        allowed: layouts[digit].iter().fold(0, |mask, &layout| mask | layout),
                        layouts: &layouts[digit],
                    })
                    .collect();
                families.sort_unstable_by_key(|f| (f.layouts.len(), f.digit));
                let anchor = families.iter().find(|f| f.digit == target).unwrap();
                let followers: Vec<_> = families
                    .iter()
                    .filter(|f| f.digit != target)
                    .copied()
                    .collect();
                let mut actual = [0; 9];
                let mut remaining = ALTERNATE_CHECKS;
                assert_eq!(
                    probe_followers(
                        &followers,
                        cell_bit(54),
                        anchor,
                        cell_bit(54),
                        &mut actual,
                        &mut remaining
                    ),
                    Some(true)
                );
                check(&actual, low, target);
            }
        }
    }
}
