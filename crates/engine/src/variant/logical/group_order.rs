use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantGroupOrderCheck,
    VariantGroupOrderProof, VariantGroupOrderRefutation, VariantGroupOrderScope, VariantTechnique,
    group_line_houses::count_conflict,
};
use crate::{CELLS, DIGITS, variant::digit_set_support};

const MAX_PASSES: usize = 4;
const MAX_EXPLANATION_CHECKS: usize = 8;
const MAX_SCOPES_TO_MINIMIZE: usize = 40;
mod common;

type Domains = [u16; CELLS];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Scope {
    Pair(usize),
    House(usize),
    Line(usize),
}

impl CompiledVariant {
    pub(super) fn group_order_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let pairs = self.group_order_pairs();
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

            let scopes = self.group_order_scopes(&pairs, index);
            let mut remaining = Vec::new();
            let mut rejected = Vec::new();
            for order in orders {
                let mut assumed = baseline;
                for (&cell, &phase) in source.cells.iter().zip(line.phases()) {
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
                line.phases().iter().map(|&phase| supported[phase]),
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
                    phases: line.phases().to_vec(),
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
        if !used.iter().any(|scope| matches!(scope, Scope::Pair(_))) {
            return None;
        }

        let mut checks = Vec::new();
        self.check_order(&used, assumed, |scope, before, after| {
            checks.push(self.order_check(scope, before, after));
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

    fn group_order_pairs(&self) -> Vec<Scope> {
        self.pair_clues
            .iter()
            .enumerate()
            .filter_map(|(index, clue)| {
                (matches!(
                    clue.source.id,
                    "kropki" | "xv" | "adjacent-total" | "inequality"
                ) && clue.binary_relation().is_some())
                .then_some(Scope::Pair(index))
            })
            .collect()
    }

    fn group_order_scopes(&self, pairs: &[Scope], source: usize) -> Vec<Scope> {
        pairs
            .iter()
            .copied()
            .chain((0..self.houses.len()).map(Scope::House))
            .chain(self.lines.iter().enumerate().filter_map(|(i, clue)| {
                (i != source && clue.group_line().is_some()).then_some(Scope::Line(i))
            }))
            .collect()
    }

    fn order_check(&self, scope: Scope, before: &[u16], after: &[u16]) -> VariantGroupOrderCheck {
        let cells = self.order_scope_cells(scope).to_vec();
        let scope = match scope {
            Scope::Pair(i) => VariantGroupOrderScope::Pair {
                rules: self.pair_clues[i].source.indices.clone(),
            },
            Scope::House(i) => VariantGroupOrderScope::House {
                house: self.houses[i].kind,
            },
            Scope::Line(i) => VariantGroupOrderScope::Line {
                rule: self.lines[i].rule_index,
            },
        };
        VariantGroupOrderCheck {
            scope,
            cells,
            domains: before.to_vec(),
            supported: after.to_vec(),
        }
    }

    fn order_scope_cells(&self, scope: Scope) -> &[usize] {
        match scope {
            Scope::Pair(i) => {
                &self.pair_clues[i]
                    .binary_relation()
                    .expect("a selected binary clue")
                    .cells
            }
            Scope::House(i) => &self.houses[i].cells,
            Scope::Line(i) => &self.lines[i].cells,
        }
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
                match self.apply_order_scope(scope, &mut domains, &mut report) {
                    ScopeResult::Conflict => return Some(()),
                    ScopeResult::Restricted => changed = true,
                    ScopeResult::Unchanged => {}
                }
            }
            if !changed {
                break;
            }
        }
        None
    }

    fn apply_order_scope(
        &self,
        scope: Scope,
        domains: &mut Domains,
        report: impl FnMut(Scope, &[u16], &[u16]),
    ) -> ScopeResult {
        self.apply_order_scope_with(scope, domains, report, |before, after| {
            digit_set_support(DIGITS, before, after);
        })
    }

    fn apply_order_scope_with(
        &self,
        scope: Scope,
        domains: &mut Domains,
        mut report: impl FnMut(Scope, &[u16], &[u16]),
        house_support: impl FnOnce(&[u16; 9], &mut [u16]),
    ) -> ScopeResult {
        let cells = self.order_scope_cells(scope);
        let mut before = [0; CELLS];
        let before = &mut before[..cells.len()];
        for (mask, &cell) in before.iter_mut().zip(cells) {
            *mask = domains[cell];
        }
        let mut after = [0; CELLS];
        let after = &mut after[..cells.len()];
        match scope {
            Scope::Pair(i) => after.copy_from_slice(
                &self.pair_clues[i]
                    .binary_relation()
                    .expect("a selected binary clue")
                    .restrict([before[0], before[1]]),
            ),
            Scope::House(_) => {
                if before.iter().all(|&mask| mask == DIGITS) {
                    return ScopeResult::Unchanged;
                }
                house_support(
                    (&*before).try_into().expect("a house has nine cells"),
                    after,
                );
            }
            Scope::Line(i) => self.lines[i]
                .group_line()
                .expect("a selected repeating line")
                .support(before, after),
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
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum ScopeResult {
    Unchanged,
    Restricted,
    Conflict,
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
        let scope = Scope::Pair(0);
        assert_eq!(compiled.order_scope_cells(scope), &[9, 10]);

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
