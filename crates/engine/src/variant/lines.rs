mod groups;
#[cfg(test)]
pub(super) mod renban_sum;

use std::{collections::HashMap, ops::Range};

use super::{ClueDirection, CompiledVariant, PuzzleRule, VariantDefinitionError, cell_mask};
use crate::{
    CELLS, DIGITS,
    hints::{digit_bit, digits},
};

#[derive(Clone, Debug)]
pub(super) struct LineConstraint {
    pub cells: Vec<usize>,
    pub rule_id: &'static str,
    pub rule_index: usize,
    kind: LineKind,
}

#[derive(Clone, Debug)]
enum LineKind {
    EqualSums(Vec<Range<usize>>),
    Sum(u16),
    Renban,
    ThreeGroups(groups::GroupLine),
    Between,
    Outside(OutsideClue),
}

#[derive(Clone, Copy, Debug)]
enum OutsideClue {
    Sandwich(u8),
    XSum(u8),
    Skyscrapers(u8),
}

impl LineConstraint {
    pub fn compile(
        puzzle: &mut CompiledVariant,
        index: usize,
        rule: &PuzzleRule,
    ) -> Result<Self, VariantDefinitionError> {
        let invalid = VariantDefinitionError::InvalidRule(index);
        let (cells, kind) = match rule {
            PuzzleRule::Arrow { circle, cells } => {
                if !(1..=9).contains(&cells.len()) {
                    return Err(invalid);
                }
                let cells: Vec<_> = std::iter::once(*circle)
                    .chain(cells.iter().copied())
                    .collect();
                let ranges = vec![0..1, 1..cells.len()];
                (cells, LineKind::EqualSums(ranges))
            }
            PuzzleRule::Renban { cells, segments } => {
                if !(1..=9).contains(&cells.len()) || !super::drawing_paths_cover(cells, segments) {
                    return Err(invalid);
                }
                puzzle.add_peers(cell_mask(cells).ok_or(invalid)?);
                (cells.clone(), LineKind::Renban)
            }
            PuzzleRule::Entropic { cells } | PuzzleRule::Modular { cells } => {
                let partition = if matches!(rule, PuzzleRule::Entropic { .. }) {
                    groups::DigitGroups::Entropic
                } else {
                    groups::DigitGroups::Modular
                };
                let (cells, line) = groups::GroupLine::compile(cells, partition).ok_or(invalid)?;
                // Different phases cannot contain the same digit. Equal phases
                // share only a digit group and remain free to repeat digits.
                for (i, &a) in cells.iter().enumerate() {
                    for (j, &b) in cells.iter().enumerate() {
                        if line.different_phases(i, j) {
                            puzzle.peers[a] |= 1 << b;
                        }
                    }
                }
                (cells, LineKind::ThreeGroups(line))
            }
            PuzzleRule::Between { cells } => {
                if cells.len() < 3 {
                    return Err(invalid);
                }
                (cells.clone(), LineKind::Between)
            }
            PuzzleRule::RegionSum {
                cells,
                group_by_region,
                segments,
            } => {
                if !super::drawing_paths_cover(cells, segments) {
                    return Err(invalid);
                }
                cell_mask(cells).ok_or(invalid)?;
                let region = |cell: usize| puzzle.memberships[cell][2];
                let mut cells = cells.clone();
                if *group_by_region {
                    cells.sort_by_key(|&cell| region(cell));
                }
                let mut start = 0;
                let segments: Vec<_> = cells
                    .chunk_by(|&a, &b| region(a) == region(b))
                    .map(|run| {
                        let range = start..start + run.len();
                        start = range.end;
                        range
                    })
                    .collect();
                if segments.len() < 2 {
                    return Err(invalid);
                }
                (cells, LineKind::EqualSums(segments))
            }
            PuzzleRule::LittleKiller {
                cells,
                direction,
                sum,
            } => {
                if !valid_ray(cells, *direction, true)
                    || !(cells.len() as u16..=9 * cells.len() as u16).contains(sum)
                {
                    return Err(invalid);
                }
                (cells.clone(), LineKind::Sum(*sum))
            }
            PuzzleRule::Sandwich {
                cells,
                direction,
                sum,
            } => {
                if *sum > 35 || !valid_ray(cells, *direction, false) {
                    return Err(invalid);
                }
                (
                    cells.clone(),
                    LineKind::Outside(OutsideClue::Sandwich(*sum as u8)),
                )
            }
            PuzzleRule::XSum {
                cells,
                direction,
                sum,
            } => {
                if !(1..=45).contains(sum) || !valid_ray(cells, *direction, false) {
                    return Err(invalid);
                }
                (
                    cells.clone(),
                    LineKind::Outside(OutsideClue::XSum(*sum as u8)),
                )
            }
            PuzzleRule::Skyscrapers {
                cells,
                direction,
                count,
            } => {
                if !(1..=9).contains(count) || !valid_ray(cells, *direction, false) {
                    return Err(invalid);
                }
                (
                    cells.clone(),
                    LineKind::Outside(OutsideClue::Skyscrapers(*count)),
                )
            }
            _ => unreachable!("other constraints compile separately"),
        };
        cell_mask(&cells).ok_or(invalid)?;
        Ok(Self {
            cells,
            kind,
            rule_id: rule.id(),
            rule_index: index,
        })
    }

    // Domains and support are in the same order as cells.
    pub fn support(&self, domains: &[u16], support: &mut [u16]) {
        debug_assert_eq!(domains.len(), self.cells.len());
        debug_assert_eq!(support.len(), domains.len());
        if domains.contains(&0) {
            return;
        }
        match &self.kind {
            LineKind::EqualSums(segments) => {
                let totals = segments.iter().fold(u128::MAX, |totals, range| {
                    totals & reachable(&domains[range.clone()])
                });
                if totals != 0 {
                    for range in segments {
                        sum_support(&domains[range.clone()], totals, &mut support[range.clone()]);
                    }
                }
            }
            LineKind::Sum(total) => sum_support(domains, 1 << total, support),
            LineKind::Renban => renban_support::<9, 512>(domains, support),
            LineKind::ThreeGroups(line) => line.support(domains, support),
            LineKind::Between => between_support(domains, support),
            LineKind::Outside(clue) => {
                clue.record_support(DIGITS, [0, 0], domains, support, &mut HashMap::new());
            }
        }
    }
}

pub(crate) fn renban_support<const N: usize, const CACHE: usize>(domains: &[u16], support: &mut [u16]) {
    match *domains {
        [single] => support[0] = single,
        [a, b] => support.copy_from_slice(&[a & (b << 1 | b >> 1), b & (a << 1 | a >> 1)]),
        [a, b, c] => {
            // For each ascending order of the cells, align all three masks
            // with the smallest digit. Shift the matches back to each cell.
            let abc = a & (b >> 1) & (c >> 2);
            let acb = a & (c >> 1) & (b >> 2);
            let bac = b & (a >> 1) & (c >> 2);
            let bca = b & (c >> 1) & (a >> 2);
            let cab = c & (a >> 1) & (b >> 2);
            let cba = c & (b >> 1) & (a >> 2);
            support.copy_from_slice(&[
                abc | acb | ((bac | cab) << 1) | ((bca | cba) << 2),
                bac | bca | ((abc | cba) << 1) | ((acb | cab) << 2),
                cab | cba | ((acb | bca) << 1) | ((abc | bac) << 2),
            ]);
        }
        _ => {
            let len = domains.len();
            let mut matches = [0; N];
            for first in 0..=N - len {
                let interval = ((1 << len) - 1) << first;
                super::search::record_support(interval, domains, &mut matches, &mut [None; CACHE]);
            }
            support.copy_from_slice(&matches[..len]);
        }
    }
}

/// Record all edges of perfect matchings for each possible consecutive interval.
/// Wider grids use matching and reachability to avoid exponential digit caches.
pub(crate) fn wide_renban_support(size: usize, domains: &[u16], support: &mut [u16]) {
    let length = domains.len();
    let full_interval = u16::MAX >> (u16::BITS as usize - length);
    for start in 0..=size - length {
        let interval = full_interval << start;
        let mut owners = [usize::MAX; u16::BITS as usize];
        if !(0..length).all(|cell| match_digit(domains, interval, cell, &mut owners, &mut 0)) {
            continue;
        }

        let reachable = &mut [0u16; u16::BITS as usize][..length];
        for (cell, (links, domain)) in reachable.iter_mut().zip(domains).enumerate() {
            *links = 1 << cell;
            for digit in start..start + length {
                if domain & (1 << digit) != 0 {
                    *links |= 1 << owners[digit];
                }
            }
        }
        for pivot in 0..length {
            let through = reachable[pivot];
            for links in reachable.iter_mut() {
                if *links & (1 << pivot) != 0 {
                    *links |= through;
                }
            }
        }
        for (cell, (mask, domain)) in support.iter_mut().zip(domains).enumerate() {
            for digit in start..start + length {
                // The edge from this cell to the digit's owner can be used
                // exactly when an alternating path from the owner closes a cycle.
                let bit = 1 << digit;
                if domain & bit != 0 && reachable[owners[digit]] & (1 << cell) != 0 {
                    *mask |= bit;
                }
            }
        }
        if support == domains {
            break;
        }
    }
}

fn match_digit(
    domains: &[u16],
    interval: u16,
    cell: usize,
    owners: &mut [usize; u16::BITS as usize],
    visited: &mut u16,
) -> bool {
    let mut available = domains[cell] & interval;
    while available & !*visited != 0 {
        let digit = (available & !*visited).trailing_zeros() as usize;
        let bit = 1 << digit;
        *visited |= bit;
        available &= !bit;
        if owners[digit] == usize::MAX || match_digit(domains, interval, owners[digit], owners, visited)
        {
            owners[digit] = cell;
            return true;
        }
    }
    false
}

// A ray must start on the edge, follow the declared direction and run to the
// opposite edge. This also bounds the length of each sum passed to the bitset.
pub(super) fn valid_ray(cells: &[usize], direction: ClueDirection, diagonal: bool) -> bool {
    let (dr, dc) = direction.delta();
    if (dr != 0 && dc != 0) != diagonal {
        return false;
    }
    let Some(&first) = cells.first().filter(|&&first| first < CELLS) else {
        return false;
    };
    let (mut r, mut c) = ((first / 9) as i8, (first % 9) as i8);
    let in_grid = |r, c| (0..9).contains(&r) && (0..9).contains(&c);
    if in_grid(r - dr, c - dc) {
        return false;
    }
    for &cell in cells {
        if !in_grid(r, c) || cell != 9 * r as usize + c as usize {
            return false;
        }
        r += dr;
        c += dc;
    }
    !in_grid(r, c)
}

fn add_digit(sums: u128, domain: u16) -> u128 {
    digits(domain).fold(0, |next, digit| next | (sums << digit))
}

fn reachable(domains: &[u16]) -> u128 {
    domains.iter().copied().fold(1, add_digit)
}

pub(super) fn sum_support(domains: &[u16], totals: u128, support: &mut [u16]) {
    let mut prefix = [0u128; 10];
    prefix[0] = 1;
    for (i, &domain) in domains.iter().enumerate() {
        prefix[i + 1] = add_digit(prefix[i], domain);
    }
    if prefix[domains.len()] & totals == 0 {
        return;
    }

    // Move from the allowed totals back toward the empty prefix. A digit
    // has support if its shift matches a reachable sum before this cell.
    let mut allowed = totals;
    for (i, &domain) in domains.iter().enumerate().rev() {
        let mut previous = 0;
        let mut supported = 0;
        for digit in digits(domain) {
            let shifted = allowed >> digit;
            if prefix[i] & shifted != 0 {
                supported |= digit_bit(digit);
            }
            previous |= shifted;
        }
        support[i] = supported;
        allowed = previous;
    }
}

fn between_support(domains: &[u16], support: &mut [u16]) {
    let last = domains.len() - 1;
    for left in digits(domains[0]) {
        for right in digits(domains[last]) {
            let lower = left.min(right);
            let upper = left.max(right);
            let interior = (digit_bit(upper) - 1) & !((1 << lower) - 1);
            if domains[1..last]
                .iter()
                .any(|&domain| domain & interior == 0)
            {
                continue;
            }
            support[0] |= digit_bit(left);
            support[last] |= digit_bit(right);
            for i in 1..last {
                support[i] |= domains[i] & interior;
            }
        }
    }
}

impl OutsideClue {
    // Every row or column is a permutation of 1–9. The digits remaining and
    // the incremental clue state determine which suffixes are possible.
    fn record_support(
        self,
        remaining: u16,
        state: [u8; 2],
        domains: &[u16],
        support: &mut [u16],
        cache: &mut HashMap<(u16, [u8; 2]), bool>,
    ) -> bool {
        if remaining == 0 {
            return true;
        }
        if let Some(&found) = cache.get(&(remaining, state)) {
            return found;
        }
        let cell = domains.len() - remaining.count_ones() as usize;
        let mut found = false;
        for digit in digits(domains[cell] & remaining) {
            let bit = digit_bit(digit);
            if let Some(next) = self.advance(remaining, digit, state)
                && self.record_support(remaining ^ bit, next, domains, support, cache)
            {
                support[cell] |= bit;
                found = true;
            }
        }
        cache.insert((remaining, state), found);
        found
    }

    fn advance(self, remaining: u16, digit: u8, [value, length]: [u8; 2]) -> Option<[u8; 2]> {
        const BREAD: u16 = 0b100000001;
        let bit = digit_bit(digit);
        match self {
            Self::Sandwich(target) if (remaining & BREAD).count_ones() == 1 => {
                if bit & BREAD != 0 {
                    (value == target).then_some([0, 0])
                } else {
                    (value + digit <= target).then_some([value + digit, 0])
                }
            }
            Self::Sandwich(_) => Some([0, 0]),
            Self::XSum(target) => {
                let first = remaining == DIGITS;
                let left = if first { digit } else { length };
                match left {
                    0 => Some([0, 0]),
                    1 => (value + digit == target).then_some([0, 0]),
                    _ => (value + digit < target).then_some([value + digit, left - 1]),
                }
            }
            Self::Skyscrapers(target) => {
                let highest = (DIGITS ^ remaining).checked_ilog2();
                let visible = value + u8::from(highest.is_none_or(|max| bit > 1 << max));
                if remaining & digit_bit(9) != 0 && digit != 9 {
                    (visible < target).then_some([visible, 0])
                } else {
                    (visible == target).then_some([visible, 0])
                }
            }
        }
    }
}

#[cfg(test)]
mod sum_support_tests {
    use super::sum_support;

    fn enumerate(
        domains: &[u16],
        targets: &[usize],
        chosen: &mut Vec<usize>,
        total: usize,
        support: &mut [u16],
    ) {
        if chosen.len() == domains.len() {
            if targets.contains(&total) {
                for (cell, &digit) in chosen.iter().enumerate() {
                    support[cell] |= 1 << (digit - 1);
                }
            }
            return;
        }
        for digit in 1..=9 {
            if domains[chosen.len()] & (1 << (digit - 1)) != 0 {
                chosen.push(digit);
                enumerate(domains, targets, chosen, total + digit, support);
                chosen.pop();
            }
        }
    }

    fn check(domains: &[u16], targets: &[usize]) {
        let mut expected = vec![0; domains.len()];
        enumerate(domains, targets, &mut vec![], 0, &mut expected);
        let totals = targets.iter().fold(0, |mask, &target| mask | (1 << target));
        let mut actual = vec![0; domains.len()];
        sum_support(domains, totals, &mut actual);
        assert_eq!(actual, expected, "{domains:?} with totals {targets:?}");
    }

    #[test]
    fn candidate_support_matches_direct_sum_enumeration() {
        for a in [0, 1, 3, 40, 320, 511] {
            for b in [1, 5, 10, 64, 384, 511] {
                for c in [0, 2, 7, 80, 256, 511] {
                    for targets in [&[][..], &[3], &[6, 15, 23], &[11, 19, 27, 127]] {
                        check(&[a, b, c], targets);
                    }
                }
            }
        }
        check(&[], &[0, 127]);
        check(&[511], &[0, 2, 9, 127]);
        check(&[384; 9], &[72, 76, 81, 127]);
        check(&[384; 9], &[76]);
    }
}

#[cfg(test)]
mod renban_support_tests {
    use super::*;

    // Independent digit enumeration. A valid completed set has no repeats and
    // max − min = length − 1, regardless of the order in which cells are drawn.
    fn enumerate(size: u8, domains: &[u16]) -> Vec<u16> {
        fn visit(size: u8, domains: &[u16], chosen: &mut Vec<u8>, support: &mut [u16]) {
            if chosen.len() == domains.len() {
                if chosen.iter().max().unwrap() - chosen.iter().min().unwrap()
                    == domains.len() as u8 - 1
                {
                    for (cell, &digit) in chosen.iter().enumerate() {
                        support[cell] |= 1 << (digit - 1)
                    }
                }
                return;
            }
            for digit in 1..=size {
                if domains[chosen.len()] & (1 << (digit - 1)) == 0 || chosen.contains(&digit) {
                    continue;
                }
                chosen.push(digit);
                visit(size, domains, chosen, support);
                chosen.pop();
            }
        }
        let mut support = vec![0; domains.len()];
        visit(size, domains, &mut vec![], &mut support);
        support
    }

    fn check(domains: &[u16]) {
        let constraint = LineConstraint {
            cells: (0..domains.len()).collect(),
            rule_id: "renban",
            rule_index: 0,
            kind: LineKind::Renban,
        };
        let mut support = vec![0; domains.len()];
        constraint.support(domains, &mut support);
        assert_eq!(support, enumerate(9, domains), "{domains:?}");
    }

    #[test]
    fn every_two_cell_domain_pair_matches_unordered_consecutive_digits() {
        for left in 0..=511 {
            for right in 0..=511 {
                check(&[left, right])
            }
        }
    }

    #[test]
    fn three_cell_domains_and_long_ranges_match_independent_assignments() {
        let windows = (1..=7).map(|first| [first, first + 1, first + 2]);
        for labels in windows.chain([[2, 4, 7], [2, 3, 8]]) {
            let masks: Vec<_> = (0..8)
                .map(|subset| {
                    labels.iter().enumerate().fold(0, |mask, (i, &digit)| {
                        mask | if subset & (1 << i) != 0 {
                            1 << (digit - 1)
                        } else {
                            0
                        }
                    })
                })
                .collect();
            for &a in &masks {
                for &b in &masks {
                    for &c in &masks {
                        check(&[a, b, c])
                    }
                }
            }
        }
        for domains in [
            vec![511],
            vec![511; 3],
            vec![0b000_000_111, 0b001_000_001, 0b000_000_110],
            vec![0b111_000_111, 0b111_000_101, 0b110_000_111],
            vec![511; 9],
            vec![3, 3, 3, 511],
            vec![15; 4],
            vec![1, 2, 4, 8, 16, 32, 64, 128, 256],
            vec![384, 384, 32, 16, 8, 4, 2, 1],
        ] {
            check(&domains)
        }
    }

    #[test]
    fn wide_renban_support_matches_independent_assignments() {
        let mut seed = 71u32;
        for size in [10, 12, 16] {
            let all = u16::MAX >> (16 - size);
            for length in 4..=7 {
                for _ in 0..80 {
                    let domains: Vec<_> = (0..length).map(|_| {
                        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                        ((seed >> 16) as u16) & ((seed >> 5) as u16) & all
                    }).collect();
                    let mut support = vec![0; length];
                    wide_renban_support(size, &domains, &mut support);
                    assert_eq!(support, enumerate(size as u8, &domains), "{domains:?}");
                }
            }
        }
    }

    #[test]
    fn a_full_sixteen_digit_line_filters_unmatchable_edges() {
        let mut domains = [u16::MAX; 16];
        domains[..2].fill(3);
        let mut support = [0; 16];
        wide_renban_support(16, &domains, &mut support);
        assert_eq!(support[..2], [3, 3]);
        assert_eq!(support[2..], [u16::MAX ^ 3; 14]);

        domains[2] = 3;
        support.fill(0);
        wide_renban_support(16, &domains, &mut support);
        assert_eq!(support, [0; 16]);
    }
}
