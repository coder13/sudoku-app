use std::{cell::OnceCell, ops::Range};

use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantRegionSumHouseLine,
    VariantRegionSumHouseProof, VariantRegionSumPart, VariantRegionSumProof, VariantTechnique,
};
use crate::{
    CELLS,
    variant::{cells_in, digit_sum, lines::{
        LineConstraint, region_sums::{DIGIT_SETS, PartSums},
    }},
};

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
                sums.support(
                    &domains[part.clone()],
                    |set| common & (1 << digit_sum(set)) != 0,
                    &mut strong[part.clone()],
                );
            }
            if domains
                .iter()
                .zip(strong)
                .all(|(&domain, mask)| domain & !mask == 0)
            {
                continue;
            }

            // Leave removals already justified by the ordinary sum proof to that technique.
            let mut weak = [0; CELLS];
            line.support(domains, &mut weak[..line.cells.len()]);
            let actions = position.removals(
                &line.cells,
                weak.into_iter()
                    .zip(strong)
                    .map(|(weak, strong)| strong | !weak),
            );
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

/// Each group must choose a digit set disjoint from the other groups. The
/// group's own matching has already been checked when its sets were built.
fn shared_region_sets(choices: &[Vec<u16>]) -> Option<Vec<[bool; DIGIT_SETS]>> {
    let mut prefixes = vec![vec![0]];
    for sets in choices {
        let mut seen = [false; DIGIT_SETS];
        let mut next = Vec::new();
        for &used in prefixes.last().expect("empty prefix") {
            for &set in sets {
                let combined = (used | set) as usize;
                if used & set == 0 && !std::mem::replace(&mut seen[combined], true) {
                    next.push(combined as u16);
                }
            }
        }
        if next.is_empty() {
            return None;
        }
        prefixes.push(next);
    }
    let mut viable = [false; DIGIT_SETS];
    viable[crate::DIGITS as usize] = true;
    let mut supported = vec![[false; DIGIT_SETS]; choices.len()];
    for index in (0..choices.len()).rev() {
        let mut previous = [false; DIGIT_SETS];
        for &used in &prefixes[index] {
            for &set in &choices[index] {
                if used & set == 0 && viable[(used | set) as usize] {
                    supported[index][set as usize] = true;
                    previous[used as usize] = true;
                }
            }
        }
        viable = previous;
    }
    viable[0].then_some(supported)
}

struct LineSums<'a> {
    line: &'a LineConstraint,
    parts: &'a [Range<usize>],
    domains: Vec<u16>,
    sums: Vec<PartSums>,
    common: u64,
}

impl<'a> LineSums<'a> {
    fn new(line: &'a LineConstraint, position: &ProofPosition<'_>) -> Self {
        let parts = line.region_sum_parts().expect("Region Sum line");
        let domains: Vec<_> = line
            .cells
            .iter()
            .map(|&cell| position.domain(cell))
            .collect();
        let sums: Vec<_> = parts
            .iter()
            .map(|part| PartSums::new(&domains[part.clone()]))
            .collect();
        let common = sums.iter().fold(u64::MAX, |mask, part| mask & part.totals);
        Self {
            line,
            parts,
            domains,
            sums,
            common,
        }
    }

    fn part_evidence(&self) -> Vec<VariantRegionSumPart> {
        self.parts
            .iter()
            .zip(&self.sums)
            .map(|(part, sum)| VariantRegionSumPart {
                cells: self.line.cells[part.clone()].to_vec(),
                domains: self.domains[part.clone()].to_vec(),
                totals: totals_list(sum.totals),
            })
            .collect()
    }
}

struct RegionPart {
    line: usize,
    part: usize,
    cells: u128,
}

impl CompiledVariant {
    pub(super) fn region_sum_house_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        // The compiler adds the nine regions after the rows and columns.
        const FIRST_REGION_HOUSE: usize = 18;
        let mut by_region: [Vec<RegionPart>; 9] = std::array::from_fn(|_| Vec::new());
        let mut lines = Vec::new();
        for line in &self.lines {
            let Some(parts) = line.region_sum_parts() else {
                continue;
            };
            if parts.iter().any(|part| {
                let region = self.memberships[line.cells[part.start]][2];
                self.search_houses.binary_search(&region).is_err()
            }) {
                continue;
            }
            for (part, range) in parts.iter().enumerate() {
                let cells = &line.cells[range.clone()];
                let region = self.memberships[cells[0]][2] - FIRST_REGION_HOUSE;
                let mask = cells.iter().fold(0, |mask, &cell| mask | 1u128 << cell);
                by_region[region].push(RegionPart {
                    line: lines.len(),
                    part,
                    cells: mask,
                });
            }
            lines.push((line, OnceCell::new()));
        }
        for (region, parts) in by_region
            .iter()
            .enumerate()
            .filter(|(_, parts)| parts.len() >= 2)
        {
            let mut covered = 0;
            let mut previous_line = None;
            if parts.iter().any(|part| {
                let overlapping = covered & part.cells != 0 || previous_line == Some(part.line);
                covered |= part.cells;
                previous_line = Some(part.line);
                overlapping
            }) {
                continue;
            }
            let house = FIRST_REGION_HOUSE + region;
            let remainder: Vec<_> = cells_in(self.house_masks[house] & !covered).collect();
            let linked: Vec<_> = parts
                .iter()
                .map(|part| {
                    let (line, cache) = &lines[part.line];
                    (
                        part.part,
                        cache.get_or_init(|| LineSums::new(line, position)),
                    )
                })
                .collect();
            let mut choices: Vec<_> = linked
                .iter()
                .map(|&(part, line)| {
                    line.sums[part]
                        .complete_sets()
                        .iter()
                        .copied()
                        .filter(|&set| line.common & (1 << digit_sum(set)) != 0)
                        .collect::<Vec<_>>()
                })
                .collect();
            let remainder_domains: Vec<_> = remainder
                .iter()
                .map(|&cell| position.domain(cell))
                .collect();
            let remainder_sum = PartSums::new(&remainder_domains);
            if !remainder.is_empty() {
                choices.push(remainder_sum.complete_sets().to_vec());
            }
            let Some(supported) = shared_region_sets(&choices) else {
                continue;
            };
            let mut actions = Vec::new();
            let mut remaining_totals = Vec::new();
            for (index, &(part, line)) in linked.iter().enumerate() {
                let remaining = choices[index]
                    .iter()
                    .filter(|&&mask| supported[index][mask as usize])
                    .fold(0, |mask, &set| mask | 1 << digit_sum(set));
                remaining_totals.push(remaining);
                for (other, range) in line.parts.iter().enumerate() {
                    let cells = &line.line.cells[range.clone()];
                    let domains = &line.domains[range.clone()];
                    let mut before = [0; 9];
                    let mut after = [0; 9];
                    line.sums[other].support(
                        domains,
                        |set| line.common & (1 << digit_sum(set)) != 0,
                        &mut before,
                    );
                    line.sums[other].support(
                        domains,
                        |set| {
                            if other == part {
                                supported[index][set as usize]
                            } else {
                                remaining & (1 << digit_sum(set)) != 0
                            }
                        },
                        &mut after,
                    );
                    actions.extend(
                        position.removals(
                            cells,
                            before
                                .into_iter()
                                .zip(after)
                                .map(|(before, after)| after | !before),
                        ),
                    );
                }
            }
            if !remainder.is_empty() {
                let mut before = [0; 9];
                let mut after = [0; 9];
                remainder_sum.support(&remainder_domains, |_| true, &mut before);
                remainder_sum.support(
                    &remainder_domains,
                    |set| supported[linked.len()][set as usize],
                    &mut after,
                );
                actions.extend(
                    position.removals(
                        &remainder,
                        before
                            .into_iter()
                            .zip(after)
                            .map(|(before, after)| after | !before),
                    ),
                );
            }
            if !actions.is_empty() {
                actions.sort_unstable();
                actions.dedup();
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::RegionSumHouse,
                    actions,
                    evidence: VariantEvidence::RegionSumHouse(Box::new(
                        VariantRegionSumHouseProof {
                            house: self.houses[house].kind,
                            lines: linked
                                .into_iter()
                                .zip(remaining_totals)
                                .map(|((in_region, line), remaining)| VariantRegionSumHouseLine {
                                    rule: line.line.rule_index,
                                    in_region,
                                    parts: line.part_evidence(),
                                    common_totals: totals_list(line.common),
                                    remaining_totals: totals_list(remaining),
                                })
                                .collect(),
                            remainder,
                            remainder_domains,
                        },
                    )),
                });
            }
        }
    }
}
