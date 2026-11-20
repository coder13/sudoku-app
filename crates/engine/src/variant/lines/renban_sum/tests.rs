use super::contained_support;

const ALL: u16 = 511;

fn mask(values: &[u8]) -> u16 {
    values.iter().fold(0, |mask, digit| mask | 1 << (digit - 1))
}

// Literal digit tuples, tested only at a full assignment. This uses neither
// interval matching nor the sum engine.
fn literal_support(domains: &[u16], members: u16, total: u16) -> [u16; 9] {
    let mut support = [0; 9];
    let mut tuple = vec![1u8; domains.len()];
    for _ in 0..9usize.pow(domains.len() as u32) {
        if tuple
            .iter()
            .zip(domains)
            .all(|(digit, domain)| domain & (1 << (digit - 1)) != 0)
            && tuple.iter().map(|&digit| u16::from(digit)).sum::<u16>() == total
        {
            let mut consecutive = tuple
                .iter()
                .enumerate()
                .filter_map(|(i, &digit)| (members & (1 << i) != 0).then_some(digit))
                .collect::<Vec<_>>();
            consecutive.sort_unstable();
            if consecutive.windows(2).all(|pair| pair[1] == pair[0] + 1) {
                for (support, &digit) in support.iter_mut().zip(&tuple) {
                    *support |= 1 << (digit - 1);
                }
            }
        }
        for digit in &mut tuple {
            if *digit < 9 {
                *digit += 1;
                break;
            }
            *digit = 1;
        }
    }
    support
}

#[test]
fn matches_all_totals_and_every_renban_placement_in_four_cells() {
    for members in 0u16..16 {
        if members.count_ones() < 2 {
            continue;
        }
        for total in 4..=36 {
            for domains in [
                [ALL; 4],
                [ALL, mask(&[2, 3, 8]), mask(&[4]), mask(&[1, 3, 9])],
            ] {
                assert_eq!(
                    contained_support(&domains, members, total),
                    literal_support(&domains, members, total)
                );
            }
        }
    }
}

#[test]
fn the_complete_mode_opening_has_multiple_two_rule_deductions() {
    // These four rays and contained sets occur in the untouched fixture.
    for (count, members, total) in [
        (4, 0b1110, 25),
        (4, 0b1110, 23),
        (5, 0b01110, 27),
        (5, 0b01110, 15),
    ] {
        let domains = [ALL; 5];
        assert_eq!(
            contained_support(&domains[..count], members, total),
            literal_support(&domains[..count], members, total)
        );
    }
    assert_eq!(
        contained_support(&[ALL; 4], 0b1110, 25)[0],
        mask(&[1, 4, 7])
    );
    assert_eq!(
        contained_support(&[ALL; 4], 0b1110, 23)[0],
        mask(&[2, 5, 8])
    );
    let low = contained_support(&[ALL; 5], 0b01110, 15);
    for &middle in &low[1..4] {
        assert_eq!(middle, mask(&[1, 2, 3, 4, 5]));
    }
    // The two printed rules alone still permit 8 at R9C5. A third clue and
    // real house geometry are needed to reproduce Agent D's stronger proof.
    assert_ne!(low[0] & mask(&[8]), 0);
}

#[test]
fn allows_legal_repeats_and_respects_explicit_candidate_removals() {
    let domains = [mask(&[1]), mask(&[2]), mask(&[1]), mask(&[1])];
    assert_eq!(contained_support(&domains, 0b0011, 5)[..4], domains);
    assert_eq!(contained_support(&domains, 0b0011, 6), [0; 9]);
    let mut domains = [ALL; 4];
    domains[0] &= !mask(&[4]);
    let support = contained_support(&domains, 0b1110, 25);
    assert_eq!(support, literal_support(&domains, 0b1110, 25));
    assert_eq!(support[0], mask(&[1, 7]));
    for &inside in &support[1..4] {
        assert_eq!(inside, mask(&[5, 6, 7, 8, 9]));
    }
}

#[test]
fn a_long_renban_uses_its_full_interval_and_keeps_the_placed_value() {
    let mut domains = [ALL; 9];
    domains[5] = mask(&[3]);
    let support = contained_support(&domains, ALL, 45);
    for (index, &domain) in support.iter().enumerate() {
        assert_eq!(
            domain,
            if index == 5 {
                mask(&[3])
            } else {
                ALL & !mask(&[3])
            }
        );
    }
    assert_eq!(contained_support(&domains, ALL, 46), [0; 9]);
}
