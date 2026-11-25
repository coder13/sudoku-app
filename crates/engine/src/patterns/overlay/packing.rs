//! Complete joint template support with a bounded alternate witness order.

use std::cell::OnceCell;

use super::{Geometry, cell_bit, cells};

mod indexed;
mod interchangeable;
mod projection;

use indexed::WIDTH;

#[derive(Clone, Copy)]
pub(super) struct Family<'a> {
    pub(super) digit: usize,
    pub(super) allowed: u128,
    pub(super) layouts: &'a [u128],
}

// Equal domains permit any witness layout to be assigned to either digit.
fn layout_equivalences<const GROUP: usize>(families: &[Family<'_>]) -> [u8; GROUP] {
    let mut equivalent = [0; GROUP];
    if families.len() == equivalent.len() {
        for (index, family) in families.iter().enumerate() {
            for (other, candidate) in families[..index].iter().enumerate() {
                if family.allowed == candidate.allowed && family.layouts == candidate.layouts {
                    equivalent[index] |= 1 << other;
                    equivalent[other] |= 1 << index;
                }
            }
        }
    }
    equivalent
}

fn share_support<const GROUP: usize>(
    families: &[Family<'_>],
    equivalent: [u8; GROUP],
    support: &mut [u128; 9],
) {
    for (index, family) in families.iter().enumerate() {
        // Visit each pair once. The equivalence relation includes every pair
        // in each interchangeable set, so all members receive the union.
        for other in 0..index {
            if equivalent[index] & (1 << other) != 0 {
                let digit = families[other].digit;
                let shared = support[digit] | support[family.digit];
                support[digit] = shared;
                support[family.digit] = shared;
            }
        }
    }
}

// Preserve quick witnesses in the original order before trying the alternate.
// Its work limit counts every inspected layout, including rejected patterns.
const ORIGINAL_CHOICES: u16 = 64;
const ALTERNATE_CHECKS: u32 = 4096;

pub(super) fn compatible_support(
    families: &[Family<'_>],
    support: [u128; 9],
    geometry: Option<Geometry<'_>>,
) -> [u128; 9] {
    support_with_probes(
        families,
        support,
        ORIGINAL_CHOICES,
        ALTERNATE_CHECKS,
        projection::Search::new(families, geometry),
    )
}

/// Exact support for a wider scope, when the indexed search finishes in budget.
pub(super) fn bounded_support(
    families: &[Family<'_>],
    remaining_choices: &mut Option<u32>,
) -> Option<[u128; 9]> {
    match families.len() {
        5 => indexed_support::<5>(families, remaining_choices),
        6 => indexed_support::<6>(families, remaining_choices),
        7 => indexed_support::<7>(families, remaining_choices),
        _ => unreachable!("indexed wider overlays have five to seven digits"),
    }
}

fn indexed_support<const GROUP: usize>(
    families: &[Family<'_>],
    remaining_choices: &mut Option<u32>,
) -> Option<[u128; 9]> {
    let equivalent = layout_equivalences::<GROUP>(families);
    // A wide scan may check many five-digit subgroups as well. Use at most
    // 512 layouts per digit and share the same branching budget across them.
    let packing = indexed::Packing::<GROUP, 8>::new(families, equivalent)?;
    let mut support = [0; 9];
    let mut witness = [0; 9];
    for (index, family) in families.iter().enumerate() {
        for cell in cells(family.allowed) {
            if support[family.digit] & cell_bit(cell) == 0
                && packing.find_with_budget(index, cell, &mut witness, remaining_choices)?
            {
                for member in families {
                    support[member.digit] |= witness[member.digit];
                }
                share_support(families, equivalent, &mut support);
            }
        }
    }
    Some(support)
}

fn support_with_probes(
    families: &[Family<'_>],
    mut support: [u128; 9],
    choices: u16,
    checks: u32,
    mut projected: Option<projection::Search<'_>>,
) -> [u128; 9] {
    let mut witness = [0; 9];
    let indexed = OnceCell::new();
    let equivalent = layout_equivalences(families);
    if equivalent != [0; indexed::WIDTH] {
        share_support(families, equivalent, &mut support);
    }
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
            let probed = probed.or_else(|| {
                projected
                    .as_mut()?
                    .find(index, cell, families, &mut witness)
            });
            let found = if let Some(found) = probed {
                found
            } else if let Some(complete) = interchangeable::support(families, support) {
                return complete;
            } else if let Some(packing) =
                indexed.get_or_init(|| indexed::Packing::<WIDTH>::new(families, equivalent))
            {
                packing.find(index, cell, &mut witness)
            } else {
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
                if equivalent != [0; indexed::WIDTH] {
                    share_support(families, equivalent, &mut support);
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

    fn support_with_probes(
        families: &[Family<'_>],
        support: [u128; 9],
        choices: u16,
        checks: u32,
    ) -> [u128; 9] {
        super::support_with_probes(families, support, choices, checks, None)
    }

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
    fn bounded_wider_search_certifies_support_only_after_finishing() {
        let layouts: [[u128; 2]; 7] = std::array::from_fn(|digit| [cell_bit(digit), cell_bit(7)]);
        let families = std::array::from_fn::<_, 7, _>(|digit| Family {
            digit,
            allowed: layouts[digit][0] | layouts[digit][1],
            layouts: &layouts[digit],
        });
        for width in 5..=7 {
            let group = &families[..width];
            assert_eq!(bounded_support(group, &mut Some(1)), None);
            assert_eq!(
                bounded_support(group, &mut Some(1_000)),
                Some(direct(group))
            );
        }
    }

    #[test]
    fn projected_support_matches_direct_packings_with_classic_and_extra_peer_geometry() {
        use super::super::super::{House, PEERS, house_cells, templates};

        let mut solution = [0u128; 9];
        for cell in 0..81 {
            let row = cell / 9;
            let digit = (row * 3 + row / 3 + cell % 9) % 9;
            solution[digit] |= cell_bit(cell);
        }
        let a = cells(solution[4]).next().unwrap();
        let b = cells(solution[4]).last().unwrap();
        let houses: Vec<_> = House::all().map(house_cells).collect();
        let mut peers = PEERS;
        assert_eq!(peers[a] & cell_bit(b), 0);
        peers[a] |= cell_bit(b);
        peers[b] |= cell_bit(a);
        let extra_peer = Geometry {
            houses: &houses,
            peers: &peers,
        };
        let shared = solution[0] | solution[1];
        let allowed = [
            shared,
            shared,
            solution[2] | cell_bit(a),
            solution[3],
            solution[4],
        ];
        for geometry in [None, Some(extra_peer)] {
            let layouts = allowed.map(|sites| {
                geometry.map_or_else(
                    || templates::layouts(sites),
                    |geometry| templates::layouts_in_houses(sites, geometry.houses, geometry.peers),
                )
            });
            let families = std::array::from_fn::<_, WIDTH, _>(|digit| Family {
                digit,
                allowed: allowed[digit],
                layouts: &layouts[digit],
            });
            let expected = direct(&families);
            assert_eq!(expected[2] & cell_bit(a), 0);
            assert_eq!(expected[0] != 0, geometry.is_none());

            let mut search = projection::Search::new(&families, geometry).unwrap();
            let mut witness = [0; 9];
            assert_eq!(search.find(2, a, &families, &mut witness), Some(false));
            let target = cells(shared).next().unwrap();
            let supported = geometry.is_none();
            assert_eq!(
                search.find(0, target, &families, &mut witness),
                Some(supported)
            );
            if supported {
                assert_ne!(witness[0] & cell_bit(target), 0);
                for family in &families {
                    assert!(family.layouts.contains(&witness[family.digit]));
                }
            }
            assert_eq!(
                super::support_with_probes(
                    &families,
                    [0; 9],
                    0,
                    0,
                    projection::Search::new(&families, geometry),
                ),
                expected
            );
        }
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
    fn dense_fallback_finds_a_late_layout_and_rejects_an_occupied_target() {
        let mut many = vec![cell_bit(0); 65];
        many.push(cell_bit(80));
        let fixed = [0, 5, 63, 64].map(|cell| [cell_bit(cell)]);
        let mut families = [
            Family {
                digit: 0,
                allowed: cell_bit(0) | cell_bit(80),
                layouts: &many,
            },
            Family {
                digit: 1,
                allowed: fixed[0][0],
                layouts: &fixed[0],
            },
            Family {
                digit: 2,
                allowed: fixed[1][0],
                layouts: &fixed[1],
            },
            Family {
                digit: 3,
                allowed: fixed[2][0],
                layouts: &fixed[2],
            },
            Family {
                digit: 4,
                allowed: fixed[3][0],
                layouts: &fixed[3],
            },
        ];
        let expected = direct(&families);
        assert_eq!(expected[0], cell_bit(80));
        assert_eq!(support_with_probes(&families, [0; 9], 0, 0), expected);

        families[0].allowed = cell_bit(0);
        assert_eq!(support_with_probes(&families, [0; 9], 0, 0), [0; 9]);
    }

    #[test]
    fn mixed_identical_domains_match_direct_packings_across_layout_words() {
        let mut a = vec![cell_bit(80); 65];
        a.extend([63, 64, 72].map(cell_bit));
        let mut b = vec![cell_bit(0); 66];
        b.extend([8, 20].map(cell_bit));
        let fixed = [cell_bit(80) | cell_bit(0), cell_bit(63) | cell_bit(8)];
        let allowed = (1u128 << crate::CELLS) - 1;
        let mut families = [
            Family {
                digit: 7,
                allowed,
                layouts: &a,
            },
            Family {
                digit: 2,
                allowed,
                layouts: &b,
            },
            Family {
                digit: 1,
                allowed,
                layouts: &a,
            },
            Family {
                digit: 4,
                allowed,
                layouts: &fixed,
            },
            Family {
                digit: 0,
                allowed,
                layouts: &b,
            },
        ];
        for layout_edit in [false, true] {
            if layout_edit {
                families[1].allowed &= !cell_bit(20);
            }
            for order in [false, true] {
                if order {
                    families.reverse();
                }
                let expected = direct(&families);
                let seeded = std::array::from_fn(|digit| {
                    if matches!(digit, 2 | 7) {
                        expected[digit]
                    } else {
                        0
                    }
                });
                assert_eq!(support_with_probes(&families, [0; 9], 0, 0), expected);
                assert_eq!(support_with_probes(&families, seeded, 0, 0), expected);
                assert_eq!(
                    support_with_probes(&families, seeded, ORIGINAL_CHOICES, ALTERNATE_CHECKS),
                    expected
                );
                if order {
                    families.reverse();
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
        assert_eq!(
            support_with_probes(&families, [0; 9], ORIGINAL_CHOICES, ALTERNATE_CHECKS),
            exact
        );

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
