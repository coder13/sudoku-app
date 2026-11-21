//! Candidate locks from two positive sums whose anchors share a house.

use super::*;

impl CompiledVariant {
    pub(super) fn sum_pair_proofs(
        &self,
        position: &ProofPosition<'_>,
        technique: VariantTechnique,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        if self.positive_sums.len() < 2 {
            return;
        }
        let sums: Vec<_> = self
            .positive_sums
            .iter()
            .filter_map(|sum| {
                let domains = sum.cells.map(|cell| position.domain(cell));
                let mut supported = [0; 2];
                for digit in digits(domains[0]) {
                    let partner = complement(sum.total, digit) & domains[1];
                    if partner != 0 {
                        supported[0] |= digit_bit(digit);
                        supported[1] |= partner;
                    }
                }
                // Avoiding one partner digit can force at most one anchor.
                (1..=2)
                    .contains(&supported[0].count_ones())
                    .then_some((sum, supported))
            })
            .collect();
        for (index, &(first, a)) in sums.iter().enumerate() {
            for &(second, b) in &sums[index + 1..] {
                if (technique == VariantTechnique::Xv) != (first.xv && second.xv)
                    || first.cells.iter().any(|cell| second.cells.contains(cell))
                {
                    continue;
                }
                for left in 0..2 {
                    for right in 0..2 {
                        let cells = [
                            first.cells[left],
                            first.cells[1 - left],
                            second.cells[right],
                            second.cells[1 - right],
                        ];
                        let [head, tail, other_head, other_tail] = cells;
                        if self.peers[head] & (1u128 << other_head) == 0
                            || self.peers[tail] & self.peers[other_tail] == 0
                        {
                            continue;
                        }
                        let totals = [first.total, second.total];
                        let locked =
                            locked_digits([a[left], b[right]], [a[1 - left], b[1 - right]], totals);
                        if locked == 0 {
                            continue;
                        }
                        if let Some(house) = self.shared_enforced_house(head, &[other_head])
                            && let Some((actions, houses)) =
                                self.sum_pair_targets(position, cells, locked)
                        {
                            proofs.push(VariantDeduction {
                                technique,
                                actions,
                                evidence: VariantEvidence::SumPair(Box::new(VariantSumPairProof {
                                    rules: [first.rule, second.rule],
                                    cells,
                                    totals,
                                    domains: cells.map(|cell| position.domain(cell)),
                                    house,
                                    houses,
                                })),
                            });
                        }
                    }
                }
            }
        }
    }

    fn sum_pair_targets(
        &self,
        position: &ProofPosition<'_>,
        cells: [usize; 4],
        locked: u16,
    ) -> Option<(Vec<HintAction>, Vec<VariantHouseKind>)> {
        let [_, tail, _, other_tail] = cells;
        let mut actions = Vec::new();
        let mut houses = Vec::new();
        for cell in cells_in(self.peers[tail] & self.peers[other_tail]) {
            let removed = position.masks[cell] & locked;
            if removed == 0 || cells.contains(&cell) {
                continue;
            }
            let Some(first) = self.shared_enforced_house(cell, &[tail]) else {
                continue;
            };
            let Some(second) = self.shared_enforced_house(cell, &[other_tail]) else {
                continue;
            };
            for house in [first, second] {
                if !houses.contains(&house) {
                    houses.push(house);
                }
            }
            actions.extend(
                digits(removed).map(|digit| HintAction::Eliminate(Candidate { cell, digit })),
            );
        }
        (!actions.is_empty()).then_some((actions, houses))
    }
}

fn complement(total: u8, digit: u8) -> u16 {
    let other = total.saturating_sub(digit);
    if other != digit && (1..=9).contains(&other) {
        digit_bit(other)
    } else {
        0
    }
}

fn locked_digits(anchors: [u16; 2], partners: [u16; 2], totals: [u8; 2]) -> u16 {
    if anchors[0] == anchors[1] && anchors[0].is_power_of_two() {
        return 0;
    }
    digits(partners[0] | partners[1]).fold(0, |locked, digit| {
        let avoid = anchors[0] & !complement(totals[0], digit);
        if avoid.is_power_of_two() && avoid == anchors[1] & !complement(totals[1], digit) {
            locked | digit_bit(digit)
        } else {
            locked
        }
    })
}
