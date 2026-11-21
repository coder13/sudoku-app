use super::{
    CompiledVariant, ProofPosition, VariantDeduction, VariantEvidence, VariantMatchingLayoutCase,
    VariantMatchingLayoutProof, VariantTechnique, cells_in,
    matching_digits::{DigitPlacement, MatchingCells},
    scope_checks::Scope,
};
use crate::{
    CELLS, Candidate, HintAction,
    hints::{digit_bit, digits},
};

const MAX_LAYOUT_NODES: u16 = 2_048;
const MAX_LAYOUTS: usize = 24;
const MAX_PASSES: usize = 8;
const MAX_CASE_CHANGES: usize = 90;
type Domains = [u16; CELLS];

impl MatchingCells {
    fn layouts(&self, puzzle: &CompiledVariant, initial: DigitPlacement) -> Option<Vec<u128>> {
        let mut layouts = Vec::new();
        let mut nodes = MAX_LAYOUT_NODES;
        self.collect_layouts(puzzle, initial, &mut nodes, &mut layouts)?;
        Some(layouts)
    }

    fn collect_layouts(
        &self,
        puzzle: &CompiledVariant,
        state: DigitPlacement,
        nodes: &mut u16,
        layouts: &mut Vec<u128>,
    ) -> Option<()> {
        *nodes = nodes.checked_sub(1)?;
        let Some((_, sites)) = state.narrowest_house(puzzle) else {
            if layouts.len() == MAX_LAYOUTS {
                return None;
            }
            layouts.push(state.placed);
            return Some(());
        };
        for cell in cells_in(sites) {
            let mut next = state;
            next.place(self, cell);
            self.collect_layouts(puzzle, next, nodes, layouts)?;
        }
        Some(())
    }

    fn apply_matching(&self, domains: &mut Domains) {
        for cell in 0..CELLS {
            self.narrow_group(domains, cell, domains[cell]);
        }
    }

    fn narrow_group(&self, domains: &mut Domains, cell: usize, supported: u16) -> bool {
        let group = self.groups[cell];
        let common = cells_in(group).fold(supported, |mask, c| mask & domains[c]);
        let mut changed = false;
        for member in cells_in(group) {
            changed |= domains[member] != common;
            domains[member] = common;
        }
        changed
    }
}

struct LayoutCases<'a> {
    puzzle: &'a CompiledVariant,
    matching: &'a MatchingCells,
    scopes: Vec<Scope>,
}

struct CaseCheck {
    scope: Scope,
    before: [u16; 9],
    after: [u16; 9],
}

struct TestedLayout {
    cells: u128,
    initial: Domains,
    domains: Domains,
    checks: Vec<CaseCheck>,
    contradicted: bool,
}

impl LayoutCases<'_> {
    fn test_layout(&self, base: &Domains, digit: u8, cells: u128) -> TestedLayout {
        let bit = digit_bit(digit);
        let initial = std::array::from_fn(|cell| {
            base[cell] & if cells & (1 << cell) == 0 { !bit } else { bit }
        });
        let mut result = TestedLayout {
            cells,
            initial,
            domains: initial,
            checks: Vec::new(),
            contradicted: false,
        };
        for _ in 0..MAX_PASSES {
            let count = result.checks.len();
            for &scope in &self.scopes {
                let cells = self.puzzle.scope_cells(scope);
                let mut before = [0; 9];
                let mut after = [0; 9];
                for (mask, &cell) in before.iter_mut().zip(cells) {
                    *mask = result.domains[cell];
                }
                self.puzzle
                    .scope_support(scope, &before[..cells.len()], &mut after[..cells.len()]);
                if before == after {
                    continue;
                }
                result.checks.push(CaseCheck {
                    scope,
                    before,
                    after,
                });
                if after[..cells.len()].contains(&0) {
                    result.contradicted = true;
                    return result;
                }
                for (&cell, supported) in cells.iter().zip(after) {
                    self.matching
                        .narrow_group(&mut result.domains, cell, supported);
                }
                if result.checks.len() == MAX_CASE_CHANGES {
                    return result;
                }
            }
            if result.checks.len() == count {
                break;
            }
        }
        result
    }

    fn refute(&self, case: &TestedLayout, target: Candidate) -> VariantMatchingLayoutCase {
        let bit = digit_bit(target.digit);
        let target_group = self.matching.groups[target.cell];
        let endpoint = if case.initial[target.cell] & bit == 0 {
            None
        } else {
            case.checks
                .iter()
                .position(|check| {
                    self.puzzle
                        .scope_cells(check.scope)
                        .iter()
                        .zip(check.after)
                        .any(|(&cell, after)| target_group & (1 << cell) != 0 && after & bit == 0)
                })
                .or_else(|| case.contradicted.then(|| case.checks.len() - 1))
        };
        let Some(endpoint) = endpoint else {
            debug_assert_eq!(case.initial[target.cell] & bit, 0);
            return VariantMatchingLayoutCase {
                cells: cells_in(case.cells).collect(),
                contradicted: false,
                checks: Vec::new(),
            };
        };

        // Retain the changes that justify the final check's inputs. A changed
        // digit domain applies to every cell in its matching group.
        let mut needed = [0u16; CELLS];
        let mut selected = Vec::new();
        for (index, check) in case.checks[..=endpoint].iter().enumerate().rev() {
            let cells = self.puzzle.scope_cells(check.scope);
            let groups = cells
                .iter()
                .map(|&cell| self.matching.groups[cell].trailing_zeros() as usize);
            if index != endpoint
                && !groups
                    .clone()
                    .enumerate()
                    .any(|(slot, root)| needed[root] & check.before[slot] & !check.after[slot] != 0)
            {
                continue;
            }
            for (slot, root) in groups.clone().enumerate() {
                needed[root] &= !(check.before[slot] & !check.after[slot]);
            }
            for (slot, root) in groups.enumerate() {
                needed[root] |= case.initial[root] & !check.before[slot];
            }
            selected.push(self.puzzle.constraint_check(
                check.scope,
                &check.before[..cells.len()],
                &check.after[..cells.len()],
            ));
        }
        selected.reverse();
        VariantMatchingLayoutCase {
            cells: cells_in(case.cells).collect(),
            contradicted: case.contradicted && endpoint + 1 == case.checks.len(),
            checks: selected,
        }
    }
}

impl CompiledVariant {
    pub(super) fn matching_layout_proofs(
        &self,
        position: &ProofPosition<'_>,
        proofs: &mut Vec<VariantDeduction>,
        first_only: bool,
    ) {
        let Some(matching) = MatchingCells::new(self) else {
            return;
        };
        let mut domains = std::array::from_fn(|cell| position.domain(cell));
        matching.apply_matching(&mut domains);
        if domains.contains(&0) {
            return;
        }
        let scopes = self
            .numeric_pair_scopes()
            .chain(self.search_houses.iter().copied().map(Scope::House))
            .collect();
        let context = LayoutCases {
            puzzle: self,
            matching: &matching,
            scopes,
        };
        let mut layouts_by_digit: Vec<_> = (1..=9)
            .filter_map(|digit| {
                if position
                    .board
                    .iter()
                    .filter(|&&placed| placed == digit)
                    .count()
                    == 9
                {
                    return None;
                }
                let sites = matching.digit_sites(&domains, digit);
                let initial = matching.initial_placements(&position.board, digit, sites)?;
                let layouts = matching.layouts(self, initial)?;
                (!layouts.is_empty()).then_some((digit, layouts))
            })
            .collect();
        layouts_by_digit.sort_by_key(|(_, layouts)| layouts.len());
        let mut delivered = [0u16; CELLS];
        for (digit, layouts) in layouts_by_digit {
            let tested: Vec<_> = layouts
                .into_iter()
                .map(|cells| context.test_layout(&domains, digit, cells))
                .collect();
            let mut supported = [0; CELLS];
            for case in tested.iter().filter(|case| !case.contradicted) {
                for (mask, &other) in supported.iter_mut().zip(&case.domains) {
                    *mask |= other;
                }
            }
            if supported.contains(&0) {
                continue;
            }
            let mut targets: Vec<_> = (0..CELLS)
                .filter(|&cell| matching.groups[cell].trailing_zeros() as usize == cell)
                .flat_map(|cell| {
                    digits(
                        domains[cell] & !supported[cell] & position.masks[cell] & !delivered[cell],
                    )
                    .map(move |digit| Candidate { cell, digit })
                })
                .collect();
            targets.sort_by_key(|target| {
                tested
                    .iter()
                    .filter(|case| case.initial[target.cell] & digit_bit(target.digit) != 0)
                    .count()
            });
            for target in targets {
                delivered[target.cell] |= digit_bit(target.digit);
                let cases = tested
                    .iter()
                    .map(|case| context.refute(case, target))
                    .collect();
                let actions = cells_in(matching.groups[target.cell])
                    .map(|cell| {
                        HintAction::Eliminate(Candidate {
                            cell,
                            digit: target.digit,
                        })
                    })
                    .collect();
                proofs.push(VariantDeduction {
                    technique: VariantTechnique::MatchingLayoutForcing,
                    actions,
                    evidence: VariantEvidence::MatchingLayout(Box::new(
                        VariantMatchingLayoutProof {
                            digit,
                            target,
                            cases,
                        },
                    )),
                });
                if first_only {
                    return;
                }
            }
        }
    }
}
