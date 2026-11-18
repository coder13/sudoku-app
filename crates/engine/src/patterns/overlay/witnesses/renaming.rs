//! Bounded-size digit bijections with a required source/target assignment.

/// Each source digit chooses one allowed target, and every target has one owner.
/// The requested assignment remains fixed throughout the augmenting paths.
pub(super) fn matching(limits: &[u16; 9], from: usize, to: usize) -> Option<[u8; 9]> {
    if limits[from] & (1 << to) == 0 {
        return None;
    }
    let mut owners = [9; 9];
    owners[to] = from;
    for source in 0..9 {
        if source != from && !augment(source, from, limits, &mut owners, &mut 0) {
            return None;
        }
    }
    let mut rename = [0; 9];
    for (target, &source) in owners.iter().enumerate() {
        rename[source] = target as u8 + 1;
    }
    Some(rename)
}

fn augment(
    source: usize,
    fixed: usize,
    limits: &[u16; 9],
    owners: &mut [usize; 9],
    seen: &mut u16,
) -> bool {
    for target in 0..9 {
        let bit = 1 << target;
        if limits[source] & bit == 0 || *seen & bit != 0 || owners[target] == fixed {
            continue;
        }
        *seen |= bit;
        if owners[target] == 9 || augment(owners[target], fixed, limits, owners, seen) {
            owners[target] = source;
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_three_digit_domain_matrix_agrees_with_enumerated_bijections() {
        // Nonadjacent labels also exercise the actual nine-digit bit positions.
        let labels = [0, 4, 8];
        let permutations = [
            [0, 4, 8],
            [0, 8, 4],
            [4, 0, 8],
            [4, 8, 0],
            [8, 0, 4],
            [8, 4, 0],
        ];
        for matrix in 0..512 {
            let mut limits = std::array::from_fn(|digit| 1 << digit);
            for (row, &source) in labels.iter().enumerate() {
                limits[source] = labels.iter().enumerate().fold(0, |mask, (column, target)| {
                    mask | if matrix & (1 << (row * 3 + column)) != 0 {
                        1 << target
                    } else {
                        0
                    }
                });
            }
            let expected: Vec<[u8; 9]> = permutations
                .iter()
                .filter_map(|permutation| {
                    let mut rename = std::array::from_fn(|digit| digit as u8 + 1);
                    for (&source, &target) in labels.iter().zip(permutation) {
                        rename[source] = target + 1;
                    }
                    rename
                        .iter()
                        .zip(limits)
                        .all(|(&target, mask)| mask & (1 << (target - 1)) != 0)
                        .then_some(rename)
                })
                .collect();
            for from in 0..9 {
                for to in 0..9 {
                    let result = matching(&limits, from, to);
                    assert_eq!(
                        result.is_some(),
                        expected.iter().any(|rename| rename[from] == to as u8 + 1),
                        "matrix {matrix}, {from} -> {to}"
                    );
                    if let Some(rename) = result {
                        assert!(expected.contains(&rename));
                        assert_eq!(rename[from], to as u8 + 1);
                    }
                }
            }
        }
    }

    #[test]
    fn forced_assignment_can_require_displacing_every_other_digit() {
        let limits = std::array::from_fn(|source| (1 << source) | (1 << ((source + 1) % 9)));
        let rename = matching(&limits, 0, 1).unwrap();
        assert_eq!(rename, [2, 3, 4, 5, 6, 7, 8, 9, 1]);
    }
}
