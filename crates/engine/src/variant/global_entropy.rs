//! Four-cell digit-group coverage, independent of equal-digit house rules.

use super::{CompiledVariant, EntropyGroup};

const GROUPS: [u16; 3] = [0b000000111, 0b000111000, 0b111000000];
const PATTERNS: usize = 1 << 12;
static SUPPORT: [u16; PATTERNS] = support_table();
static REPEATED_LOW_SUPPORT: [u16; PATTERNS] = repeated_group_support_table(0);
static REPEATED_MIDDLE_SUPPORT: [u16; PATTERNS] = repeated_group_support_table(1);
static REPEATED_HIGH_SUPPORT: [u16; PATTERNS] = repeated_group_support_table(2);

impl CompiledVariant {
    pub(super) fn entropy_windows(&self) -> impl Iterator<Item = (usize, [usize; 4])> {
        self.global_entropy.into_iter().flat_map(|rule| {
            (0..64).map(move |index| {
                let cell = index / 8 * 9 + index % 8;
                (rule, [cell, cell + 1, cell + 9, cell + 10])
            })
        })
    }

    pub(super) fn entropy_group_windows(
        &self,
    ) -> impl Iterator<Item = (usize, [usize; 4], EntropyGroup)> + '_ {
        self.entropy_window_groups.iter().copied()
    }
}

pub(super) fn support(domains: [u16; 4]) -> [u16; 4] {
    let pattern = domains
        .iter()
        .enumerate()
        .fold(0, |pattern, (cell, domain)| {
            let groups = GROUPS.iter().enumerate().fold(0, |mask, (group, digits)| {
                mask | (usize::from(domain & digits != 0) << group)
            });
            pattern | (groups << (3 * cell))
        });
    let supported = SUPPORT[pattern];
    std::array::from_fn(|cell| {
        let groups = supported >> (3 * cell);
        domains[cell]
            & GROUPS.iter().enumerate().fold(0, |mask, (group, digits)| {
                mask | if groups & (1 << group) != 0 {
                    *digits
                } else {
                    0
                }
            })
    })
}

pub(super) fn support_repeated_group(domains: [u16; 4], group: EntropyGroup) -> [u16; 4] {
    let pattern = group_domain_pattern(domains);
    let supported = match group {
        EntropyGroup::Low => REPEATED_LOW_SUPPORT[pattern],
        EntropyGroup::Middle => REPEATED_MIDDLE_SUPPORT[pattern],
        EntropyGroup::High => REPEATED_HIGH_SUPPORT[pattern],
    };
    std::array::from_fn(|cell| {
        let groups = supported >> (3 * cell);
        domains[cell]
            & GROUPS.iter().enumerate().fold(0, |mask, (group, digits)| {
                mask | if groups & (1 << group) != 0 {
                    *digits
                } else {
                    0
                }
            })
    })
}

fn group_domain_pattern(domains: [u16; 4]) -> usize {
    domains
        .iter()
        .enumerate()
        .fold(0, |pattern, (cell, domain)| {
            let groups = GROUPS.iter().enumerate().fold(0, |mask, (group, digits)| {
                mask | (usize::from(domain & digits != 0) << group)
            });
            pattern | (groups << (3 * cell))
        })
}

const fn support_table() -> [u16; PATTERNS] {
    let mut table = [0; PATTERNS];
    let mut assignment = 0usize;
    while assignment < PATTERNS {
        let [a, b, c, d] = [
            assignment & 7,
            (assignment >> 3) & 7,
            (assignment >> 6) & 7,
            assignment >> 9,
        ];
        if a.is_power_of_two()
            && b.is_power_of_two()
            && c.is_power_of_two()
            && d.is_power_of_two()
            && a | b | c | d == 7
        {
            let free = (PATTERNS - 1) ^ assignment;
            let mut extra = free;
            loop {
                table[assignment | extra] |= assignment as u16;
                if extra == 0 {
                    break;
                }
                extra = (extra - 1) & free;
            }
        }
        assignment += 1;
    }
    table
}

const fn repeated_group_support_table(repeated_group: usize) -> [u16; PATTERNS] {
    let mut table = [0; PATTERNS];
    let mut assignment = 0usize;
    while assignment < PATTERNS {
        let groups = [
            assignment & 7,
            (assignment >> 3) & 7,
            (assignment >> 6) & 7,
            assignment >> 9,
        ];
        let mut valid = 0usize;
        let mut seen = 0usize;
        let mut cell = 0;
        while cell < 4 {
            let group = groups[cell];
            if group.is_power_of_two() {
                seen |= group;
                if group == 1 << repeated_group {
                    valid += 1;
                }
            } else {
                valid = 0;
                break;
            }
            cell += 1;
        }
        if seen == 7 && valid == 2 {
            let free = (PATTERNS - 1) ^ assignment;
            let mut extra = free;
            loop {
                table[assignment | extra] |= assignment as u16;
                if extra == 0 {
                    break;
                }
                extra = (extra - 1) & free;
            }
        }
        assignment += 1;
    }
    table
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{DIGITS, EntropyGroup, PuzzleRule, VariantPuzzle, hints::digits};

    fn direct(domains: [u16; 4]) -> [u16; 4] {
        let mut supported = [0; 4];
        for a in digits(domains[0]) {
            for b in digits(domains[1]) {
                for c in digits(domains[2]) {
                    for d in digits(domains[3]) {
                        let assigned = [a, b, c, d];
                        if assigned.iter().any(|digit| *digit <= 3)
                            && assigned.iter().any(|digit| (4..=6).contains(digit))
                            && assigned.iter().any(|digit| *digit >= 7)
                        {
                            for (mask, digit) in supported.iter_mut().zip(assigned) {
                                *mask |= 1 << (digit - 1);
                            }
                        }
                    }
                }
            }
        }
        supported
    }

    #[test]
    fn every_group_domain_matches_direct_digit_assignments() {
        for pattern in 0..PATTERNS {
            let domains = std::array::from_fn(|cell| {
                GROUPS.iter().enumerate().fold(0, |mask, (group, digits)| {
                    mask | if pattern & (1 << (cell * 3 + group)) != 0 {
                        *digits
                    } else {
                        0
                    }
                })
            });
            assert_eq!(support(domains), direct(domains), "pattern {pattern}");
        }
        // Missing individual digits do not imply that the rest of their group is absent.
        let mut random = crate::Random::from_seed(602026);
        for _ in 0..2048 {
            let domains = std::array::from_fn(|_| random.index(512) as u16);
            assert_eq!(support(domains), direct(domains), "{domains:?}");
        }
        for assignment in 0..9usize.pow(4) {
            let domains =
                std::array::from_fn(|cell| 1 << (assignment / 9usize.pow(cell as u32) % 9));
            assert_eq!(support(domains), direct(domains));
        }
        assert_eq!(support([DIGITS; 4]), [DIGITS; 4]);
    }

    #[test]
    fn all_sixty_four_windows_include_shared_box_boundaries_without_wrapping() {
        let mut puzzle = VariantPuzzle::classic([0; 81]);
        assert_eq!(puzzle.compile().unwrap().entropy_windows().count(), 0);
        puzzle.rules.extend([
            PuzzleRule::AntiKing {},
            PuzzleRule::GlobalEntropy {},
            PuzzleRule::GlobalEntropy {},
        ]);
        let compiled = puzzle.compile().unwrap();
        let windows: Vec<_> = compiled.entropy_windows().collect();
        assert_eq!(windows.len(), 64);
        for row in 0..8 {
            for col in 0..8 {
                let cell = row * 9 + col;
                assert_eq!(
                    windows[row * 8 + col],
                    (1, [cell, cell + 1, cell + 9, cell + 10])
                );
            }
        }
        assert_eq!(windows[18].1, [20, 21, 29, 30]);
        assert_eq!(windows[63].1, [70, 71, 79, 80]);
    }

    fn direct_repeated_group(domains: [u16; 4], repeated: EntropyGroup) -> [u16; 4] {
        let target = match repeated {
            EntropyGroup::Low => 0,
            EntropyGroup::Middle => 1,
            EntropyGroup::High => 2,
        };
        let mut supported = [0; 4];
        for a in digits(domains[0]) {
            for b in digits(domains[1]) {
                for c in digits(domains[2]) {
                    for d in digits(domains[3]) {
                        let assigned = [a, b, c, d];
                        let groups = assigned.map(|digit| (digit - 1) / 3);
                        if groups.iter().filter(|&&group| group == target).count() == 2 &&
                            (0..3).all(|group| groups.contains(&group)) {
                            for (mask, digit) in supported.iter_mut().zip(assigned) {
                                *mask |= 1 << (digit - 1);
                            }
                        }
                    }
                }
            }
        }
        supported
    }

    #[test]
    fn every_fixed_entropy_group_domain_matches_direct_digit_assignments() {
        for repeated in [EntropyGroup::Low, EntropyGroup::Middle, EntropyGroup::High] {
            for pattern in 0..PATTERNS {
                let domains = std::array::from_fn(|cell| {
                    GROUPS.iter().enumerate().fold(0, |mask, (group, digits)| {
                        mask | if pattern & (1 << (cell * 3 + group)) != 0 {
                            *digits
                        } else {
                            0
                        }
                    })
                });
                assert_eq!(
                    support_repeated_group(domains, repeated),
                    direct_repeated_group(domains, repeated),
                    "pattern {pattern}, group {repeated:?}"
                );
            }
        }
    }

    #[test]
    #[cfg(feature = "wasm-api")]
    fn shape_group_constraints_parse_and_reject_invalid_windows() {
        let rule: PuzzleRule = serde_json::from_value(serde_json::json!({
            "type": "entropy-window-group",
            "cells": [20, 21, 29, 30],
            "group": "middle"
        })).unwrap();
        let mut puzzle = VariantPuzzle::classic([0; 81]);
        puzzle.rules.push(rule);
        assert!(puzzle.compile().is_ok());

        let invalid: PuzzleRule = serde_json::from_value(serde_json::json!({
            "type": "entropy-window-group",
            "cells": [20, 21, 29, 31],
            "group": "middle"
        })).unwrap();
        let mut puzzle = VariantPuzzle::classic([0; 81]);
        puzzle.rules.push(invalid);
        assert_eq!(puzzle.compile().unwrap_err(), crate::VariantDefinitionError::InvalidRule(0));
    }
}
