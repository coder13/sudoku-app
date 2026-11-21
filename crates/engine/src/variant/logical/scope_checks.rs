use super::{CompiledVariant, VariantConstraintCheck, VariantConstraintScope};
use crate::{DIGITS, variant::digit_set_support};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Scope {
    Pair(usize),
    House(usize),
    Line(usize),
}

impl CompiledVariant {
    pub(super) fn scope_cells(&self, scope: Scope) -> &[usize] {
        match scope {
            Scope::Pair(index) => {
                &self.pair_clues[index]
                    .binary_relation()
                    .expect("a selected binary clue")
                    .cells
            }
            Scope::House(index) => &self.houses[index].cells,
            Scope::Line(index) => &self.lines[index].cells,
        }
    }

    pub(super) fn scope_support(&self, scope: Scope, before: &[u16], after: &mut [u16]) {
        match scope {
            Scope::Pair(index) => after.copy_from_slice(
                &self.pair_clues[index]
                    .binary_relation()
                    .expect("a selected binary clue")
                    .restrict([before[0], before[1]]),
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
            Scope::Pair(index) => VariantConstraintScope::Pair {
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
