use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantRenbanHouseProof,
    VariantTechnique,
};
use crate::{
    DIGITS,
    hints::{digit_bit, digits},
    variant::{cell_mask, cells_in, search::record_support},
};

impl CompiledVariant {
    pub(super) fn renban_house_support(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for line in self
            .lines
            .iter()
            .filter(|line| line.rule_id == "renban" && (2..9).contains(&line.cells.len()))
        {
            let length = line.cells.len();
            let scope = cell_mask(&line.cells).expect("compiled Renban");
            for &index in &self.memberships[line.cells[0]] {
                let house = self.house_masks[index];
                if scope & !house != 0 {
                    continue;
                }

                let mut cells = line.cells.clone();
                cells.extend(cells_in(house & !scope));
                let domains = std::array::from_fn(|i| position.domain(cells[i]));
                // An unrestricted complement can always fit the remaining digits.
                if domains[length..].iter().all(|&mask| mask == DIGITS) {
                    continue;
                }
                let support = renban_house_support(&domains, length);
                if support.starts == 0 {
                    continue;
                }

                // A deduction must depend on both the Renban and the house.
                // Exclusions explained by an ordinary Renban lock are cheaper.
                if cells.iter().enumerate().all(|(i, &cell)| {
                    position.masks[cell] & support.individual[i] & !support.joint[i] == 0
                }) {
                    continue;
                }
                let mut house_only = [0; 9];
                record_support::<9, 512>(DIGITS, &domains, &mut house_only, &mut [None; 512]);
                let mut actions = position.removals(
                    &cells,
                    (0..9).map(|i| support.joint[i] | !(support.individual[i] & house_only[i])),
                );
                if actions.is_empty() {
                    continue;
                }

                let mut evidence = VariantRenbanHouseProof {
                    rule: line.rule_index,
                    house: self.houses[index].kind,
                    cells,
                    line_length: length,
                    domains,
                    supported: support.joint,
                    starts: support.starts,
                    paired_cell: None,
                };
                let outside = &evidence.cells[length..];
                let pair = actions
                    .iter()
                    .filter_map(|action| {
                        let target = action.candidate();
                        if !outside.contains(&target.cell) {
                            return None;
                        }
                        outside
                            .iter()
                            .zip(&domains[length..])
                            .find_map(|(&cell, &mask)| {
                                (cell != target.cell
                                    && mask.count_ones() == 2
                                    && mask & digit_bit(target.digit) != 0
                                    && digits(support.line_starts)
                                        .all(|start| mask & interval(length, start) != 0))
                                .then_some((target.cell, cell, mask))
                            })
                    })
                    .min_by_key(|&(cell, _, _)| position.masks[cell].count_ones());
                if let Some((target, paired_cell, mask)) = pair {
                    let mut paired_actions = Vec::new();
                    actions.retain(|&action| {
                        let candidate = action.candidate();
                        if candidate.cell == target && mask & digit_bit(candidate.digit) != 0 {
                            paired_actions.push(action);
                            false
                        } else {
                            true
                        }
                    });
                    evidence.paired_cell = Some(paired_cell);
                    proofs.push(VariantDeduction {
                        technique: VariantTechnique::RenbanHouseSupport,
                        actions: paired_actions,
                        evidence: VariantEvidence::RenbanHouseSupport(Box::new(evidence.clone())),
                    });
                    evidence.paired_cell = None;
                }
                if !actions.is_empty() {
                    proofs.push(VariantDeduction {
                        technique: VariantTechnique::RenbanHouseSupport,
                        actions,
                        evidence: VariantEvidence::RenbanHouseSupport(Box::new(evidence)),
                    });
                }
            }
        }
    }
}

struct Support {
    joint: [u16; 9],
    individual: [u16; 9],
    starts: u16,
    line_starts: u16,
}

fn interval(length: usize, start: u8) -> u16 {
    ((1 << length) - 1) << (start - 1)
}

fn renban_house_support(domains: &[u16; 9], length: usize) -> Support {
    let mut support = Support {
        joint: [0; 9],
        individual: [0; 9],
        starts: 0,
        line_starts: 0,
    };
    let (line, outside) = domains.split_at(length);
    let mut outside_digits = 0;

    for start in 1..=10 - length as u8 {
        let set = interval(length, start);
        let mut line_matches = [0; 9];
        if !record_support::<9, 512>(set, line, &mut line_matches, &mut [None; 512]) {
            continue;
        }
        support.line_starts |= digit_bit(start);
        let complement = DIGITS ^ set;
        outside_digits |= complement;
        for (local, allowed) in support.individual.iter_mut().zip(line_matches).take(length) {
            *local |= allowed;
        }

        // In a house, the remaining cells must fit the interval's complement.
        // Each half is an independent matching once its digit set is fixed.
        let mut outside_matches = [0; 9];
        if !record_support::<9, 512>(complement, outside, &mut outside_matches, &mut [None; 512]) {
            continue;
        }
        support.starts |= digit_bit(start);
        for (local, allowed) in support.joint[..length].iter_mut().zip(line_matches) {
            *local |= allowed;
        }
        for (local, allowed) in support.joint[length..].iter_mut().zip(outside_matches) {
            *local |= allowed;
        }
    }
    for (local, &domain) in support.individual[length..].iter_mut().zip(outside) {
        *local = domain & outside_digits;
    }
    support
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CELLS, Candidate, HintAction, PuzzleRule, VariantHouseKind, VariantPuzzle};

    fn literal_support(domains: &[u16; 9], length: usize) -> ([u16; 9], u16) {
        fn visit(
            domains: &[u16; 9],
            length: usize,
            used: u16,
            prefix: &mut Vec<u8>,
            result: &mut ([u16; 9], u16),
        ) {
            if prefix.len() == 9 {
                let line = &prefix[..length];
                let start = *line.iter().min().unwrap();
                let end = *line.iter().max().unwrap();
                if (end - start) as usize + 1 == length {
                    result.1 |= digit_bit(start);
                    for (&digit, support) in prefix.iter().zip(&mut result.0) {
                        *support |= digit_bit(digit);
                    }
                }
                return;
            }
            for digit in 1..=9 {
                let bit = digit_bit(digit);
                if domains[prefix.len()] & !used & bit != 0 {
                    prefix.push(digit);
                    visit(domains, length, used | bit, prefix, result);
                    prefix.pop();
                }
            }
        }

        let mut result = ([0; 9], 0);
        visit(domains, length, 0, &mut Vec::new(), &mut result);
        result
    }

    #[test]
    fn projected_intervals_match_literal_house_assignments() {
        for length in 2..9 {
            for salt in 0..32 {
                let domains = std::array::from_fn(|i| {
                    let widths = [1, 2, 3, 5, 9];
                    let width = widths[(i + salt) % widths.len()];
                    let base = (i * (salt / 3 + 1) + salt) % (10 - width);
                    ((1 << width) - 1) << base
                });
                let actual = renban_house_support(&domains, length);
                let expected = literal_support(&domains, length);
                assert_eq!(
                    (actual.joint, actual.starts),
                    expected,
                    "{length}: {domains:?}"
                );
            }
        }
    }

    #[test]
    fn uses_only_actual_houses_and_remains_separate_from_a_single_renban() {
        let line = [20, 30, 40, 50, 60];
        let diagonal = [0, 10, 20, 30, 40, 50, 60, 70, 80];
        let entries = [0; CELLS];
        let mut puzzle = VariantPuzzle::classic(entries);
        puzzle.rules = vec![PuzzleRule::Renban {
            cells: line.to_vec(),
            segments: None,
        }];
        let mut eliminations = [0; CELLS];
        eliminations[0] = DIGITS & !(digit_bit(3) | digit_bit(6));
        eliminations[80] = DIGITS & !(digit_bit(3) | digit_bit(6) | digit_bit(9));
        let check = |puzzle: &VariantPuzzle, technique| {
            puzzle
                .compile()
                .unwrap()
                .deductions(&entries, &eliminations, technique)
                .unwrap()
        };
        assert!(check(&puzzle, VariantTechnique::RenbanHouseSupport).is_empty());
        puzzle.rules.push(PuzzleRule::ExtraHouse {
            cells: diagonal.to_vec(),
        });

        let actions = [3, 6].map(|digit| HintAction::Eliminate(Candidate { cell: 80, digit }));
        let proofs = check(&puzzle, VariantTechnique::RenbanHouseSupport);
        assert_eq!(proofs[0].actions, actions);
        let VariantEvidence::RenbanHouseSupport(evidence) = &proofs[0].evidence else {
            panic!("expected a Renban house proof");
        };
        assert_eq!(evidence.house, VariantHouseKind::Extra(1));
        assert_eq!(evidence.paired_cell, Some(0));
        assert_eq!(evidence.supported[8], digit_bit(9));
        assert_eq!(
            evidence.domains[8],
            digit_bit(3) | digit_bit(6) | digit_bit(9)
        );
        assert_eq!(evidence.starts, digit_bit(1) | digit_bit(4));
        assert!(
            check(&puzzle, VariantTechnique::Renban)
                .iter()
                .all(|proof| actions.iter().all(|action| !proof.actions.contains(action)))
        );
        assert!(
            check(&puzzle, VariantTechnique::RenbanLockedDigit)
                .iter()
                .all(|proof| actions.iter().all(|action| !proof.actions.contains(action)))
        );
    }

    #[test]
    fn uses_the_irregular_region_instead_of_standard_boxes() {
        let line = [10, 11, 12, 19, 20];
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.rules.push(PuzzleRule::Renban {
            cells: line.to_vec(),
            segments: None,
        });
        let mut eliminations = [0; CELLS];
        eliminations[0] = DIGITS & !(digit_bit(3) | digit_bit(6));
        eliminations[18] = DIGITS & !(digit_bit(3) | digit_bit(6) | digit_bit(9));
        let check = |puzzle: &VariantPuzzle| {
            puzzle
                .compile()
                .unwrap()
                .deductions(
                    &[0; CELLS],
                    &eliminations,
                    VariantTechnique::RenbanHouseSupport,
                )
                .unwrap()
        };
        assert!(check(&puzzle).is_empty());

        let mut regions: Vec<Vec<_>> = (0..9)
            .map(|index| {
                let top = 27 * (index / 3) + 3 * (index % 3);
                (0..9).map(|slot| top + 9 * (slot / 3) + slot % 3).collect()
            })
            .collect();
        regions[0][2] = 12;
        regions[1][3] = 2;
        puzzle.regions = crate::RegionLayout::Jigsaw { regions };
        let proofs = check(&puzzle);
        let VariantEvidence::RenbanHouseSupport(evidence) = &proofs[0].evidence else {
            panic!("expected an irregular region in the Renban proof");
        };
        assert_eq!(evidence.house, VariantHouseKind::Region(0));
        assert_eq!(evidence.paired_cell, Some(0));
        assert_eq!(
            proofs[0].actions,
            [3, 6].map(|digit| HintAction::Eliminate(Candidate { cell: 18, digit }))
        );
    }
}
