use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantTechnique,
    VariantThermometerHouseProof,
};
use crate::{
    DIGITS,
    hints::{digit_bit, digits},
    variant::search::record_support,
};
use std::collections::BTreeMap;

fn increasing_assignments(domains: &[u16]) -> Vec<[u8; 9]> {
    fn visit(
        domains: &[u16],
        last: u8,
        prefix: usize,
        digits_so_far: &mut [u8; 9],
        assignments: &mut Vec<[u8; 9]>,
    ) {
        let Some((&domain, rest)) = domains.split_first() else {
            assignments.push(*digits_so_far);
            return;
        };
        for digit in
            digits(domain).filter(|&digit| digit > last && digit as usize + rest.len() <= 9)
        {
            digits_so_far[prefix] = digit;
            visit(rest, digit, prefix + 1, digits_so_far, assignments);
        }
    }
    let mut assignments = Vec::new();
    visit(domains, 0, 0, &mut [0; 9], &mut assignments);
    assignments
}

impl CompiledVariant {
    pub(super) fn thermometer_house_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        for clue in &self.pair_clues {
            if clue.source.id != "thermometer" {
                continue;
            }
            let line = &clue.cells;
            let line_mask = line.iter().fold(0u128, |mask, &cell| mask | 1 << cell);
            let open_line = line
                .iter()
                .filter(|&&cell| position.board[cell] == 0)
                .fold(0u128, |mask, &cell| mask | 1 << cell);
            if open_line == 0 {
                continue;
            }
            let line_domains: Vec<_> = line.iter().map(|&cell| position.domain(cell)).collect();
            let assignments = increasing_assignments(&line_domains);
            if assignments.is_empty() {
                continue;
            }

            let mut line_only = [0; 9];
            for assignment in &assignments {
                for (i, &digit) in assignment[..line.len()].iter().enumerate() {
                    line_only[i] |= digit_bit(digit);
                }
            }

            for &house_index in &self.search_houses {
                let house_mask = self.house_masks[house_index];
                if (house_mask & line_mask).count_ones() < 2 || house_mask & open_line == 0 {
                    continue;
                }
                let house = &self.houses[house_index];
                let domains = house.cells.map(|cell| position.domain(cell));
                let indices = house
                    .cells
                    .map(|cell| line.iter().position(|&other| cell == other));
                let remainder: Vec<_> = indices
                    .iter()
                    .enumerate()
                    .filter_map(|(i, index)| index.is_none().then_some(i))
                    .collect();
                let remainder_domains: Vec<_> = remainder.iter().map(|&i| domains[i]).collect();
                let mut supported_line = [0; 9];
                let mut supported_other = [0; 9];
                // Increasing digits fix their order at the shared cells. The
                // remaining house cells only depend on the set already used.
                let mut by_digits = BTreeMap::new();
                for assignment in &assignments {
                    let used = indices
                        .iter()
                        .filter_map(|&index| index)
                        .fold(0, |mask, i| mask | digit_bit(assignment[i]));
                    let fits = *by_digits.entry(used).or_insert_with(|| {
                        record_support::<9, 512>(
                            DIGITS & !used,
                            &remainder_domains,
                            &mut supported_other,
                            &mut [None; 512],
                        )
                    });
                    if fits {
                        for (slot, &digit) in
                            supported_line.iter_mut().zip(&assignment[..line.len()])
                        {
                            *slot |= digit_bit(digit);
                        }
                    }
                }
                if supported_line[0] == 0 {
                    continue;
                }

                let mut supported_house = [0; 9];
                for (i, &index) in remainder.iter().enumerate() {
                    supported_house[index] = supported_other[i];
                }
                if line_only == supported_line
                    && remainder.iter().all(|&i| domains[i] == supported_house[i])
                {
                    continue;
                }

                // Easier detectors keep removals already justified by the line
                // alone or by the house alone.
                let mut house_only = [0; 9];
                record_support::<9, 512>(DIGITS, &domains, &mut house_only, &mut [None; 512]);
                let mut actions = position.removals(
                    line,
                    (0..line.len()).map(|i| {
                        let house_mask = house
                            .cells
                            .iter()
                            .position(|&cell| cell == line[i])
                            .map_or(DIGITS, |j| house_only[j]);
                        supported_line[i] | !(line_only[i] & house_mask)
                    }),
                );
                actions.extend(position.removals(
                    &house.cells,
                    (0..9).map(|i| {
                        if indices[i].is_some() {
                            DIGITS
                        } else {
                            supported_house[i] | !house_only[i]
                        }
                    }),
                ));
                if actions.is_empty() {
                    continue;
                }
                actions.sort_unstable();
                let rejected = by_digits
                    .iter()
                    .filter_map(|(&used, &fits)| (!fits).then_some(used))
                    .collect();
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::ThermometerHouseSupport,
                    actions,
                    evidence: VariantEvidence::ThermometerHouse(Box::new(
                        VariantThermometerHouseProof {
                            rule: clue.source.indices[0],
                            line_cells: line.clone(),
                            line_domains: line_domains.clone(),
                            house: house.kind,
                            cells: house.cells,
                            domains,
                            tested: by_digits.len(),
                            rejected,
                        },
                    )),
                });
            }
        }
    }
}
