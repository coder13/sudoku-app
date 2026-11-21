use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantRegionSumPart,
    VariantRegionSumProof, VariantTechnique,
};
use crate::{
    CELLS,
    hints::{digit_bit, digits},
    variant::digit_sum,
};

const DIGIT_SETS: usize = 512;

struct PartSums {
    // A set at depth i can be assigned to the first i cells in some order.
    prefixes: Vec<Vec<u16>>,
    totals: u64,
}

impl PartSums {
    fn new(domains: &[u16]) -> Self {
        let mut prefixes = vec![vec![0]];
        for &domain in domains {
            let mut seen = [false; DIGIT_SETS];
            let mut next = Vec::new();
            for &used in prefixes.last().expect("empty prefix") {
                for digit in digits(domain & !used) {
                    let with_digit = used | digit_bit(digit);
                    if !std::mem::replace(&mut seen[with_digit as usize], true) {
                        next.push(with_digit);
                    }
                }
            }
            prefixes.push(next);
        }
        let totals = prefixes
            .last()
            .expect("complete prefix")
            .iter()
            .fold(0, |mask, &set| mask | 1 << digit_sum(set));
        Self { prefixes, totals }
    }

    fn support(&self, domains: &[u16], totals: u64, support: &mut [u16]) {
        let mut viable = [false; DIGIT_SETS];
        for &set in &self.prefixes[domains.len()] {
            viable[set as usize] = totals & (1 << digit_sum(set)) != 0;
        }

        // Follow only the assignments that reach one of the common totals.
        for (index, &domain) in domains.iter().enumerate().rev() {
            let mut previous = [false; DIGIT_SETS];
            for &used in &self.prefixes[index] {
                for digit in digits(domain & !used) {
                    let bit = digit_bit(digit);
                    if viable[(used | bit) as usize] {
                        support[index] |= bit;
                        previous[used as usize] = true;
                    }
                }
            }
            viable = previous;
        }
    }
}

fn totals_list(mask: u64) -> Vec<u8> {
    (1..=45).filter(|&sum| mask & (1 << sum) != 0).collect()
}

impl CompiledVariant {
    pub(super) fn region_sum_distinct_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for line in &self.lines {
            let Some(parts) = line.region_sum_parts() else {
                continue;
            };
            if parts.iter().all(|part| part.len() == 1)
                || parts.iter().any(|part| {
                    let region = self.memberships[line.cells[part.start]][2];
                    self.search_houses.binary_search(&region).is_err()
                })
            {
                continue;
            }

            let mut domains = [0; CELLS];
            let domains = &mut domains[..line.cells.len()];
            for (domain, &cell) in domains.iter_mut().zip(&line.cells) {
                *domain = position.domain(cell);
            }
            let sums: Vec<_> = parts
                .iter()
                .map(|part| PartSums::new(&domains[part.clone()]))
                .collect();
            let common = sums.iter().fold(u64::MAX, |mask, part| mask & part.totals);
            if common == 0 {
                continue;
            }

            let mut strong = [0; CELLS];
            for (part, sums) in parts.iter().zip(&sums) {
                sums.support(&domains[part.clone()], common, &mut strong[part.clone()]);
            }
            if domains.iter().zip(strong).all(|(&domain, mask)| domain & !mask == 0) {
                continue;
            }

            // Leave removals already justified by the ordinary sum proof to that technique.
            let mut weak = [0; CELLS];
            line.support(domains, &mut weak[..line.cells.len()]);
            let actions = position.removals(&line.cells, weak.into_iter().zip(strong).map(
                |(weak, strong)| strong | !weak,
            ));
            if !actions.is_empty() {
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::RegionSumDistinct,
                    actions,
                    evidence: VariantEvidence::RegionSumDistinct(Box::new(VariantRegionSumProof {
                        rule: line.rule_index,
                        parts: parts
                            .iter()
                            .zip(sums)
                            .map(|(part, sums)| VariantRegionSumPart {
                                cells: line.cells[part.clone()].to_vec(),
                                domains: domains[part.clone()].to_vec(),
                                totals: totals_list(sums.totals),
                            })
                            .collect(),
                        common_totals: totals_list(common),
                    })),
                });
            }
        }
    }
}
