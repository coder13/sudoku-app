use super::{
    CompiledVariant, ProofPosition, VariantConstraintScope, VariantDeduction, VariantEvidence,
    VariantLinkedClueProof, VariantTechnique, group_line_houses::count_conflict,
    scope_checks::Scope,
};
use crate::{
    CELLS, Candidate, HintAction,
    hints::{digit_bit, digits},
};

const MAX_PASSES: usize = 4;
const MAX_PROBES: usize = 192;
const MAX_PAIR_PATHS: usize = 256;
const MAX_CHANGES: usize = 24;
const MAX_PROOF_CHECKS: usize = 9;

#[derive(Clone, Copy)]
struct ScopedCells {
    scope: Scope,
    mask: u128,
}

fn includes_variant_checks(scopes: &[ScopedCells]) -> bool {
    scopes.len() >= 2
        && scopes
            .iter()
            .any(|item| !matches!(item.scope, Scope::House(_)))
}

fn linked_deduction(proof: VariantLinkedClueProof) -> VariantDeduction {
    VariantDeduction {
        technique: VariantTechnique::LinkedClueContradiction,
        actions: vec![HintAction::Eliminate(proof.assumption)],
        evidence: VariantEvidence::LinkedClue(Box::new(proof)),
    }
}

impl CompiledVariant {
    pub(super) fn linked_clue_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let pairs: Vec<_> = self.numeric_pair_scopes().collect();
        if pairs.is_empty() {
            return;
        }
        let domains = std::array::from_fn(|cell| position.domain(cell));
        self.between_refutations(domains, &pairs, proofs);
        if proofs.is_empty() {
            self.matching_cell_refutations(domains, &pairs, proofs);
        }
        proofs.sort_by_key(|proof| match &proof.evidence {
            VariantEvidence::LinkedClue(proof) => proof.checks.len(),
            _ => 0,
        });
    }

    fn between_refutations(
        &self,
        domains: [u16; CELLS],
        pairs: &[Scope],
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let lines: Vec<_> = self
            .lines
            .iter()
            .enumerate()
            .filter_map(|(index, line)| {
                (line.technique.id() == "between").then_some(Scope::Line(index))
            })
            .collect();
        if lines.is_empty() {
            return;
        }

        let targets = lines
            .iter()
            .chain(pairs)
            .fold(0, |mask, &scope| mask | self.scoped_cells(scope).mask);
        let scopes: Vec<_> = pairs
            .iter()
            .copied()
            .chain(self.search_houses.iter().copied().map(Scope::House))
            .chain(lines)
            .map(|scope| self.scoped_cells(scope))
            .collect();

        // Unconditional restrictions belong to the simpler techniques.
        if scopes
            .iter()
            .any(|item| !self.stable_scope(item.scope, &domains))
        {
            return;
        }

        let mut candidates: Vec<_> = (0..CELLS)
            .filter(|&cell| {
                targets & (1 << cell) != 0 && matches!(domains[cell].count_ones(), 2..=4)
            })
            .collect();
        candidates.sort_by_key(|&cell| (domains[cell].count_ones(), cell));
        for assumption in candidates
            .into_iter()
            .flat_map(|cell| digits(domains[cell]).map(move |digit| Candidate { cell, digit }))
            .take(MAX_PROBES)
        {
            if let Some(proof) = self.linked_refutation(domains, &scopes, assumption) {
                proofs.push(linked_deduction(proof));
            }
        }
    }

    fn matching_cell_refutations(
        &self,
        domains: [u16; CELLS],
        pairs: &[Scope],
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let matching = self
            .pair_clues
            .iter()
            .enumerate()
            .filter(|(_, clue)| matches!(clue.source.technique.id(), "palindrome" | "clone"))
            .flat_map(|(clue, source)| {
                (0..source.links().len()).map(move |link| Scope::Pair(clue, link))
            })
            .collect::<Vec<_>>();
        if matching.is_empty() {
            return;
        }
        let mut neighbors: [Vec<(Scope, usize)>; CELLS] = std::array::from_fn(|_| Vec::new());
        let mut mirrors: [Vec<(Scope, usize)>; CELLS] = std::array::from_fn(|_| Vec::new());
        for (graph, links) in [(&mut neighbors, pairs), (&mut mirrors, &matching)] {
            for &scope in links {
                if !self.stable_scope(scope, &domains) {
                    continue;
                }
                let &[left, right] = self.scope_cells(scope) else {
                    unreachable!("two-cell scope")
                };
                graph[left].push((scope, right));
                graph[right].push((scope, left));
            }
        }

        // Try the two numeric links first. A matching cell can extend either
        // end before the path closes in a shared house.
        let routes = neighbors.iter().enumerate().flat_map(|(middle, incident)| {
            incident
                .iter()
                .enumerate()
                .flat_map(move |(index, &(first, from))| {
                    incident[index + 1..]
                        .iter()
                        .filter_map(move |&(second, to)| {
                            (from != to).then_some((from, middle, to, first, second))
                        })
                })
        });
        let direct = routes
            .clone()
            .map(|(from, _, to, first, second)| (from, to, [Some(first), Some(second), None]));
        let extended = routes.flat_map(|(from, middle, to, first, second)| {
            let start = mirrors[from].iter().filter_map(move |&(mirror, source)| {
                (source != middle && source != to).then_some((
                    source,
                    to,
                    [Some(mirror), Some(first), Some(second)],
                ))
            });
            let end = mirrors[to].iter().filter_map(move |&(mirror, target)| {
                (target != middle && target != from).then_some((
                    from,
                    target,
                    [Some(first), Some(second), Some(mirror)],
                ))
            });
            start.chain(end)
        });
        let mut probed = 0;
        let mut removed = [0u16; CELLS];
        for (from, to, path) in direct.chain(extended).take(MAX_PAIR_PATHS) {
            let Some(&house) = self.memberships[from].iter().find(|&&house| {
                self.house_masks[house] & (1 << to) != 0
                    && self.search_houses.binary_search(&house).is_ok()
            }) else {
                continue;
            };
            if !self.stable_scope(Scope::House(house), &domains) {
                continue;
            }
            let mut scopes: Vec<_> = path
                .into_iter()
                .flatten()
                .map(|scope| self.scoped_cells(scope))
                .collect();
            for cell in [from, to] {
                if domains[cell].count_ones() >= 2 {
                    scopes.push(self.scoped_cells(Scope::House(house)));
                    for digit in digits(domains[cell] & !removed[cell]) {
                        if probed == MAX_PROBES {
                            return;
                        }
                        probed += 1;
                        let assumption = Candidate { cell, digit };
                        if let Some(proof) = self.linked_refutation(domains, &scopes, assumption) {
                            removed[cell] |= digit_bit(digit);
                            proofs.push(linked_deduction(proof));
                        }
                    }
                    scopes.pop();
                }
                scopes.reverse();
            }
        }
    }

    fn scoped_cells(&self, scope: Scope) -> ScopedCells {
        ScopedCells {
            scope,
            mask: self
                .scope_cells(scope)
                .iter()
                .fold(0, |mask, &cell| mask | 1u128 << cell),
        }
    }

    fn stable_scope(&self, scope: Scope, domains: &[u16; CELLS]) -> bool {
        let cells = self.scope_cells(scope);
        let mut before = [0; CELLS];
        for (index, &cell) in cells.iter().enumerate() {
            before[index] = domains[cell];
        }
        let mut after = [0; CELLS];
        self.scope_support(scope, &before[..cells.len()], &mut after[..cells.len()]);
        before[..cells.len()] == after[..cells.len()]
    }

    fn linked_refutation(
        &self,
        mut domains: [u16; CELLS],
        scopes: &[ScopedCells],
        assumption: Candidate,
    ) -> Option<VariantLinkedClueProof> {
        domains[assumption.cell] = digit_bit(assumption.digit);
        let dirty = 1u128 << assumption.cell;
        let mut used = Vec::new();
        self.walk_scopes(scopes, domains, dirty, |item, _, _| {
            if !used
                .iter()
                .any(|seen: &ScopedCells| seen.scope == item.scope)
            {
                used.push(item);
            }
        })?;
        used.sort_by_key(|item| scopes.iter().position(|source| source.scope == item.scope));
        if !includes_variant_checks(&used) {
            return None;
        }
        let mut index = 0;
        while index < used.len() {
            let item = used.remove(index);
            if self
                .walk_scopes(&used, domains, dirty, |_, _, _| {})
                .is_none()
            {
                used.insert(index, item);
                index += 1;
            }
        }
        if !includes_variant_checks(&used) {
            return None;
        }
        let mut checks = Vec::new();
        self.walk_scopes(&used, domains, dirty, |item, before, after| {
            checks.push(self.constraint_check(item.scope, before, after));
        })?;
        let conflict = checks.pop()?;
        let house_conflict =
            matches!(conflict.scope, VariantConstraintScope::House { .. }).then(|| {
                count_conflict(
                    conflict
                        .cells
                        .as_slice()
                        .try_into()
                        .expect("nine house cells"),
                    conflict
                        .domains
                        .as_slice()
                        .try_into()
                        .expect("nine house domains"),
                )
            });
        (checks.len() + 1 <= MAX_PROOF_CHECKS).then_some(VariantLinkedClueProof {
            assumption,
            checks,
            conflict,
            house_conflict,
        })
    }

    fn walk_scopes(
        &self,
        scopes: &[ScopedCells],
        mut domains: [u16; CELLS],
        mut dirty: u128,
        mut report: impl FnMut(ScopedCells, &[u16], &[u16]),
    ) -> Option<()> {
        let mut changes = 0;
        for _ in 0..MAX_PASSES {
            let mut next = 0;
            for &item in scopes {
                if item.mask & dirty == 0 {
                    continue;
                }
                let cells = self.scope_cells(item.scope);
                let mut before = [0; CELLS];
                let mut after = [0; CELLS];
                let before = &mut before[..cells.len()];
                let after = &mut after[..cells.len()];
                for (mask, &cell) in before.iter_mut().zip(cells) {
                    *mask = domains[cell];
                }
                self.scope_support(item.scope, before, after);
                if before == after {
                    continue;
                }
                report(item, before, after);
                if after.contains(&0) {
                    return Some(());
                }
                changes += 1;
                if changes == MAX_CHANGES {
                    return None;
                }
                for (&cell, &mask) in cells.iter().zip(after.iter()) {
                    if domains[cell] != mask {
                        domains[cell] = mask;
                        next |= 1 << cell;
                    }
                }
                dirty |= next;
            }
            if next == 0 {
                break;
            }
            dirty = next;
        }
        None
    }
}
