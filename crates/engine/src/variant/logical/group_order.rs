use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantGroupOrderProof,
    VariantGroupOrderRefutation, VariantGroupOrderScope, VariantTechnique,
    group_line_houses::count_conflict, scope_checks::Scope,
};
use crate::{CELLS, DIGITS};

mod eliminations;

#[derive(Clone, Copy, Eq, PartialEq)]
enum ScopeResult {
    Unchanged,
    Restricted,
    Conflict,
}

const MAX_PASSES: usize = 4;
const MAX_EXPLANATION_CHECKS: usize = 8;
const MAX_SCOPES_TO_MINIMIZE: usize = 40;
type Domains = [u16; CELLS];

impl CompiledVariant {
    fn apply_order_scope_with(
        &self,
        scope: Scope,
        domains: &mut Domains,
        houses: &mut eliminations::HouseSupportCache,
        mut report: impl FnMut(Scope, &[u16], &[u16]),
    ) -> ScopeResult {
        let cells = self.scope_cells(scope);
        let mut before_storage = [0; CELLS];
        let before = &mut before_storage[..cells.len()];
        for (mask, &cell) in before.iter_mut().zip(cells) {
            *mask = domains[cell];
        }
        let mut after_storage = [0; CELLS];
        let after = &mut after_storage[..cells.len()];
        match scope {
            Scope::House(_) => {
                if before.iter().all(|&mask| mask == DIGITS) {
                    return ScopeResult::Unchanged;
                }
                let before_house: &[u16; 9] =
                    (&*before).try_into().expect("a house has nine cells");
                if let Some(supported) = houses.get(before_house) {
                    after.copy_from_slice(supported);
                } else {
                    self.scope_support(scope, before, after);
                    if houses.len() < 2048 {
                        houses.insert(
                            *before_house,
                            after.try_into().expect("nine supported masks"),
                        );
                    }
                }
            }
            Scope::Pair(..) | Scope::Line(_) => self.scope_support(scope, before, after),
        }
        if before == after {
            return ScopeResult::Unchanged;
        }
        report(scope, before, after);
        if after.contains(&0) {
            return ScopeResult::Conflict;
        }
        for (&cell, &mask) in cells.iter().zip(after.iter()) {
            domains[cell] = mask;
        }
        ScopeResult::Restricted
    }

    pub(super) fn group_order_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let pairs: Vec<_> = self.numeric_pair_scopes().collect();
        if pairs.is_empty() {
            return;
        }

        let baseline = std::array::from_fn(|cell| position.domain(cell));
        for (index, source) in self.lines.iter().enumerate() {
            let Some(line) = source.group_line() else {
                continue;
            };
            if source.cells.len() < 3 {
                continue;
            }
            let domains = source
                .cells
                .iter()
                .map(|&cell| baseline[cell])
                .collect::<Vec<_>>();
            let orders = line.possible_orders(&domains).collect::<Vec<_>>();
            if orders.len() < 2 {
                continue;
            }

            let scopes = pairs
                .iter()
                .copied()
                .chain(self.search_houses.iter().copied().map(Scope::House))
                .chain(self.lines.iter().enumerate().filter_map(|(i, clue)| {
                    (i != index && clue.group_line().is_some()).then_some(Scope::Line(i))
                }))
                .collect::<Vec<_>>();
            let mut remaining = Vec::new();
            let mut rejected = Vec::new();
            for order in orders {
                let mut assumed = baseline;
                for (&cell, &phase) in source.cells.iter().zip(line.phase_indices()) {
                    assumed[cell] &= order[phase];
                }
                match self.refute_order(&scopes, assumed, order) {
                    Some(refutation) => rejected.push(refutation),
                    None => remaining.push(order),
                }
            }
            if rejected.is_empty() || remaining.is_empty() {
                continue;
            }
            let supported = remaining.iter().fold([0; 3], |union, order| {
                std::array::from_fn(|i| union[i] | order[i])
            });
            let actions = position.removals(
                &source.cells,
                line.phase_indices().iter().map(|&phase| supported[phase]),
            );
            if actions.is_empty() {
                continue;
            }
            proofs.push(VariantDeduction {
                technique: VariantTechnique::GroupOrderContradiction,
                actions,
                evidence: VariantEvidence::GroupOrder(Box::new(VariantGroupOrderProof {
                    rule: source.rule_index,
                    cells: source.cells.clone(),
                    domains,
                    phases: line.phase_indices().to_vec(),
                    remaining,
                    rejected,
                })),
            });
        }
    }

    fn refute_order(
        &self,
        scopes: &[Scope],
        assumed: Domains,
        groups: [u16; 3],
    ) -> Option<VariantGroupOrderRefutation> {
        // Gather just the scopes that contributed restrictions, then try
        // omitting each of those to get a smaller explanation.
        let mut used = Vec::new();
        self.check_order(scopes, assumed, |scope, _, _| {
            if !used.contains(&scope) {
                used.push(scope);
            }
        })?;
        used = scopes
            .iter()
            .copied()
            .filter(|scope| used.contains(scope))
            .collect();
        if used.len() > MAX_SCOPES_TO_MINIMIZE {
            return None;
        }
        let mut index = 0;
        while index < used.len() {
            let scope = used.remove(index);
            if self.check_order(&used, assumed, |_, _, _| {}).is_none() {
                used.insert(index, scope);
                index += 1;
            }
        }
        if !used.iter().any(|scope| matches!(scope, Scope::Pair(..))) {
            return None;
        }

        let mut checks = Vec::new();
        self.check_order(&used, assumed, |scope, before, after| {
            checks.push(self.constraint_check(scope, before, after));
        })?;
        let conflict = checks.pop()?;
        let house_conflict =
            matches!(conflict.scope, VariantGroupOrderScope::House { .. }).then(|| {
                count_conflict(
                    conflict
                        .cells
                        .as_slice()
                        .try_into()
                        .expect("a house has nine cells"),
                    conflict
                        .domains
                        .as_slice()
                        .try_into()
                        .expect("a house has nine domains"),
                )
            });
        (checks.len() <= MAX_EXPLANATION_CHECKS).then_some(VariantGroupOrderRefutation {
            groups,
            checks,
            conflict,
            house_conflict,
        })
    }

    fn check_order(
        &self,
        scopes: &[Scope],
        mut domains: Domains,
        mut report: impl FnMut(Scope, &[u16], &[u16]),
    ) -> Option<()> {
        for _ in 0..MAX_PASSES {
            let mut changed = false;
            for &scope in scopes {
                let cells = self.scope_cells(scope);
                let mut before = [0; CELLS];
                let before = &mut before[..cells.len()];
                for (mask, &cell) in before.iter_mut().zip(cells) {
                    *mask = domains[cell];
                }
                let mut after = [0; CELLS];
                let after = &mut after[..cells.len()];
                if matches!(scope, Scope::House(_)) && before.iter().all(|&mask| mask == DIGITS) {
                    continue;
                }
                self.scope_support(scope, before, after);
                if before != after {
                    report(scope, before, after);
                    if after.contains(&0) {
                        return Some(());
                    }
                    for (&cell, &mask) in cells.iter().zip(after.iter()) {
                        domains[cell] = mask;
                    }
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{PuzzleRule, VariantPuzzle, hints::digit_bit};

    #[test]
    fn reversed_inequality_uses_the_canonical_pair_cell_order() {
        let mut puzzle = VariantPuzzle::classic([0; CELLS]);
        puzzle.rules.push(PuzzleRule::Inequality {
            less: 10,
            greater: 9,
        });
        let compiled = puzzle.compile().unwrap();
        let mut domains = [DIGITS; CELLS];
        domains[9] = digit_bit(4);
        domains[10] = digit_bit(2) | digit_bit(6);
        let scope = Scope::Pair(0, 0);
        assert_eq!(compiled.scope_cells(scope), &[9, 10]);

        let mut reports = Vec::new();
        assert_eq!(
            compiled.check_order(&[scope], domains, |_, _, after| reports
                .push(after.to_vec())),
            None,
        );
        assert_eq!(reports, vec![vec![digit_bit(4), digit_bit(2)]]);
        domains[10] = digit_bit(6);
        assert_eq!(
            compiled.check_order(&[scope], domains, |_, _, _| {}),
            Some(())
        );
        assert_eq!(compiled.check_order(&[], domains, |_, _, _| {}), None);
    }
}
