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

impl CompiledVariant {
    pub(super) fn linked_clue_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
    ) {
        let lines: Vec<_> = self
            .lines
            .iter()
            .enumerate()
            .filter_map(|(index, line)| (line.rule_id == "between").then_some(Scope::Line(index)))
            .collect();
        if lines.is_empty() {
            return;
        }
        let pairs: Vec<_> = self
            .pair_clues
            .iter()
            .enumerate()
            .filter_map(|(index, clue)| {
                (matches!(
                    clue.source.id,
                    "kropki" | "xv" | "adjacent-total" | "inequality"
                ) && clue.binary_relation().is_some())
                .then_some(Scope::Pair(index))
            })
            .collect();
        if pairs.is_empty() {
            return;
        }

        let footprint = |scope| {
            self.scope_cells(scope)
                .iter()
                .fold(0, |mask, &cell| mask | 1u128 << cell)
        };
        let targets = lines
            .iter()
            .chain(&pairs)
            .fold(0, |mask, &scope| mask | footprint(scope));
        let scopes: Vec<_> = pairs
            .into_iter()
            .chain(self.search_houses.iter().copied().map(Scope::House))
            .chain(lines)
            .map(|scope| ScopedCells {
                scope,
                mask: footprint(scope),
            })
            .collect();
        let domains = std::array::from_fn(|cell| position.domain(cell));

        // The individual checks must already fit the current position. This
        // keeps unconditional restrictions in their own, simpler techniques.
        if scopes.iter().any(|item| {
            let cells = self.scope_cells(item.scope);
            let before: Vec<_> = cells.iter().map(|&cell| domains[cell]).collect();
            let mut after = [0; CELLS];
            self.scope_support(item.scope, &before, &mut after[..cells.len()]);
            before != after[..cells.len()]
        }) {
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
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::LinkedClueContradiction,
                    actions: vec![HintAction::Eliminate(assumption)],
                    evidence: VariantEvidence::LinkedClue(Box::new(proof)),
                });
            }
        }
        proofs.sort_by_key(|proof| match &proof.evidence {
            VariantEvidence::LinkedClue(proof) => proof.checks.len(),
            _ => 0,
        });
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
