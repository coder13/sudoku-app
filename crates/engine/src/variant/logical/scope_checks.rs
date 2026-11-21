use super::{CompiledVariant, VariantConstraintCheck, VariantConstraintScope};
use crate::{DIGITS, variant::digit_set_support};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Scope {
    Pair(usize, usize),
    House(usize),
    Line(usize),
}

impl CompiledVariant {
    pub(super) fn numeric_pair_scopes(&self) -> impl Iterator<Item = Scope> + '_ {
        self.pair_clues
            .iter()
            .enumerate()
            .filter_map(|(index, clue)| {
                (matches!(
                    clue.source.technique.id(),
                    "kropki" | "xv" | "adjacent-total" | "inequality"
                ) && clue.binary_relation().is_some())
                .then_some(Scope::Pair(index, 0))
            })
    }

    pub(super) fn scope_cells(&self, scope: Scope) -> &[usize] {
        match scope {
            Scope::Pair(clue, link) => &self.pair_clues[clue].links()[link].cells,
            Scope::House(index) => &self.houses[index].cells,
            Scope::Line(index) => &self.lines[index].cells,
        }
    }

    pub(super) fn scope_support(&self, scope: Scope, before: &[u16], after: &mut [u16]) {
        match scope {
            Scope::Pair(clue, link) => after.copy_from_slice(
                &self.pair_clues[clue].links()[link].restrict([before[0], before[1]]),
            ),
            Scope::House(_) => {
                digit_set_support(DIGITS, before, after);
            }
            Scope::Line(index) => self.lines[index].support(before, after),
        }
    }

    pub(super) fn constraint_check(
        &self,
        scope: Scope,
        domains: &[u16],
        supported: &[u16],
    ) -> VariantConstraintCheck {
        let cells = self.scope_cells(scope).to_vec();
        let scope = match scope {
            Scope::Pair(index, _) => VariantConstraintScope::Pair {
                rules: self.pair_clues[index].source.indices.clone(),
            },
            Scope::House(index) => VariantConstraintScope::House {
                house: self.houses[index].kind,
            },
            Scope::Line(index) => VariantConstraintScope::Line {
                rule: self.lines[index].rule_index,
            },
        };
        VariantConstraintCheck {
            scope,
            cells,
            domains: domains.to_vec(),
            supported: supported.to_vec(),
        }
    }
}
