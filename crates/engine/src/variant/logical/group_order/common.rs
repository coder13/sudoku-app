use std::collections::HashMap;

use super::{Domains, Scope, ScopeResult};
use crate::{
    CELLS, Candidate, DIGITS, HintAction, VariantDeduction, VariantEvidence,
    VariantGroupOrderBranch, VariantGroupOrderEliminationProof, VariantTechnique,
    hints::{digit_bit, digits},
    variant::{CompiledVariant, digit_set_support, logical::ProofPosition},
};

const MAX_PASSES: usize = 3;
const MAX_PROOF_CHECKS: usize = 6;
const MAX_CACHED_HOUSES: usize = 2048;
type HouseSupportCache = HashMap<[u16; 9], [u16; 9]>;

struct Branch {
    groups: [u16; 3],
    assumed: Domains,
    end: Domains,
    visits: Vec<(Scope, u128)>,
    removed_at: [[usize; 9]; CELLS],
}

impl CompiledVariant {
    pub(in crate::variant::logical) fn group_order_eliminations(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let pairs = self.group_order_pairs();
        if pairs.is_empty() {
            return;
        }
        let baseline = std::array::from_fn(|cell| position.domain(cell));
        let mut houses = HouseSupportCache::new();
        for (index, source) in self.lines.iter().enumerate() {
            let Some(line) = source.group_line() else {
                continue;
            };
            if source.cells.len() < 3 {
                continue;
            }
            let domains: Vec<_> = source.cells.iter().map(|&cell| baseline[cell]).collect();
            let mut orders = line.possible_orders(&domains);
            let (Some(a), Some(b), None) = (orders.next(), orders.next(), orders.next()) else {
                continue;
            };

            let scopes = self.group_order_scopes(&pairs, index);
            let branches = [a, b].map(|groups| {
                let mut assumed = baseline;
                for (&cell, &phase) in source.cells.iter().zip(line.phases()) {
                    assumed[cell] &= groups[phase];
                }
                self.trace_group_order(&scopes, groups, assumed, &mut houses)
            });
            for cell in 0..CELLS {
                if position.board[cell] != 0 {
                    continue;
                }
                let lost = baseline[cell] & !(branches[0].end[cell] | branches[1].end[cell]);
                for digit in digits(lost) {
                    let target = Candidate { cell, digit };
                    let visits = branches
                        .each_ref()
                        .map(|branch| self.target_visits(branch, target, &mut houses));
                    if visits.iter().map(Vec::len).sum::<usize>() > MAX_PROOF_CHECKS
                        || !visits
                            .iter()
                            .flatten()
                            .any(|scope| matches!(scope, Scope::Pair(_)))
                    {
                        continue;
                    }
                    // A clue that already eliminates the candidate without either
                    // order has its own simpler explanation.
                    if visits.iter().any(|checks| {
                        self.replay_removal(checks, baseline, target, &mut houses, |_, _, _| {})
                    }) {
                        continue;
                    }
                    let cases = std::array::from_fn(|i| {
                        let branch = &branches[i];
                        let mut checks = Vec::with_capacity(visits[i].len());
                        let proved = self.replay_removal(
                            &visits[i],
                            branch.assumed,
                            target,
                            &mut houses,
                            |scope, before, after| {
                                checks.push(self.order_check(scope, before, after));
                            },
                        );
                        debug_assert!(proved, "the reduced checks must remove the candidate");
                        VariantGroupOrderBranch {
                            groups: branch.groups,
                            checks,
                        }
                    });
                    proofs.push(VariantDeduction {
                        technique: VariantTechnique::GroupOrderElimination,
                        actions: vec![HintAction::Eliminate(target)],
                        evidence: VariantEvidence::GroupOrderElimination(Box::new(
                            VariantGroupOrderEliminationProof {
                                rule: source.rule_index,
                                cells: source.cells.clone(),
                                phases: line.phases().to_vec(),
                                domains: domains.clone(),
                                branches: cases,
                            },
                        )),
                    });
                }
            }
        }
    }

    fn trace_group_order(
        &self,
        scopes: &[Scope],
        groups: [u16; 3],
        assumed: Domains,
        houses: &mut HouseSupportCache,
    ) -> Branch {
        let mut branch = Branch {
            groups,
            assumed,
            end: assumed,
            visits: Vec::new(),
            removed_at: [[0; 9]; CELLS],
        };
        for _ in 0..MAX_PASSES {
            let prior = branch.visits.len();
            for &scope in scopes {
                let mut narrowed = 0;
                let visit = branch.visits.len() + 1;
                let result = self.apply_cached_order_scope(
                    scope,
                    &mut branch.end,
                    houses,
                    |scope, before, after| {
                        if after.contains(&0) {
                            return;
                        }
                        for ((&old, &supported), &cell) in
                            before.iter().zip(after).zip(self.order_scope_cells(scope))
                        {
                            let removed = old & !supported;
                            if removed != 0 {
                                narrowed |= 1u128 << cell;
                                for digit in digits(removed) {
                                    branch.removed_at[cell][usize::from(digit - 1)] = visit;
                                }
                            }
                        }
                    },
                );
                match result {
                    ScopeResult::Conflict => return branch,
                    ScopeResult::Restricted => branch.visits.push((scope, narrowed)),
                    ScopeResult::Unchanged => {}
                }
            }
            if branch.visits.len() == prior {
                break;
            }
        }
        branch
    }

    fn target_visits(
        &self,
        branch: &Branch,
        target: Candidate,
        houses: &mut HouseSupportCache,
    ) -> Vec<Scope> {
        if branch.assumed[target.cell] & digit_bit(target.digit) == 0 {
            return Vec::new();
        }

        // A later check can depend only on earlier restrictions in its cells.
        let mut dependencies = 1u128 << target.cell;
        let mut visits = Vec::new();
        let end = branch.removed_at[target.cell][usize::from(target.digit - 1)];
        for &(scope, changed) in branch.visits[..end].iter().rev() {
            if dependencies & changed != 0 {
                visits.push(scope);
                for &cell in self.order_scope_cells(scope) {
                    dependencies |= 1u128 << cell;
                }
            }
        }
        visits.reverse();

        // Preserve the chronological order while discarding checks the target
        // does not actually need, including irrelevant reductions in a house.
        let mut index = visits.len();
        while index > 0 {
            index -= 1;
            let scope = visits.remove(index);
            if !self.replay_removal(&visits, branch.assumed, target, houses, |_, _, _| {}) {
                visits.insert(index, scope);
            }
        }
        visits
    }

    fn replay_removal(
        &self,
        visits: &[Scope],
        mut domains: Domains,
        target: Candidate,
        houses: &mut HouseSupportCache,
        mut report: impl FnMut(Scope, &[u16], &[u16]),
    ) -> bool {
        let mask = digit_bit(target.digit);
        for &scope in visits {
            if domains[target.cell] & mask == 0 {
                break;
            }
            if self.apply_cached_order_scope(scope, &mut domains, houses, &mut report)
                == ScopeResult::Conflict
            {
                return false;
            }
        }
        domains[target.cell] & mask == 0
    }

    fn apply_cached_order_scope(
        &self,
        scope: Scope,
        domains: &mut Domains,
        houses: &mut HouseSupportCache,
        report: impl FnMut(Scope, &[u16], &[u16]),
    ) -> ScopeResult {
        self.apply_order_scope_with(scope, domains, report, |before, after| {
            if let Some(supported) = houses.get(before) {
                after.copy_from_slice(supported);
                return;
            }
            digit_set_support(DIGITS, before, after);
            if houses.len() < MAX_CACHED_HOUSES {
                houses.insert(
                    *before,
                    (&*after).try_into().expect("a house has nine cells"),
                );
            }
        })
    }
}
