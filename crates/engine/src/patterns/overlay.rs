use super::{
    ControlFlow, Deduction, HintEvidence, House, PEERS, Technique, bit_indices,
    candidate_positions, cell_bit, cells, house_cells, report_eliminations, templates,
};
use crate::{
    Board, CELLS, DIGITS, PatternOverlayDigit, PatternOverlayGeometry, PatternOverlayProof,
    hints::placement,
};
use std::{cell::OnceCell, collections::BTreeMap};

pub(crate) struct OverlaySearch<'a> {
    geometry: Option<Geometry<'a>>,
    geometry_evidence: OnceCell<PatternOverlayGeometry>,
    positions: [u128; 9],
    allowed: [u128; 9],
    layouts: [OnceCell<Vec<u128>>; 9],
    supports: BTreeMap<u16, [u128; 9]>,
}

#[cfg(all(
    feature = "wasm-api",
    any(target_arch = "wasm32", test, feature = "cli")
))]
impl OverlaySearch<'static> {
    pub(crate) fn classic(board: &Board, masks: &[u16; CELLS]) -> Self {
        Self::new(board, candidate_positions(masks))
    }

    pub(crate) fn update_classic(&mut self, board: &Board, masks: &[u16; CELLS]) {
        self.positions = candidate_positions(masks);
        let mut changed = 0;
        for digit in 0..9 {
            let allowed = templates::with_placed(self.positions[digit], board, digit as u8 + 1);
            if self.allowed[digit] != allowed {
                self.allowed[digit] = allowed;
                self.layouts[digit].take();
                changed |= 1 << digit;
            }
        }
        // A group's support only depends on the layouts for its own digits.
        self.supports.retain(|group, _| group & changed == 0);
    }
}

impl<'a> OverlaySearch<'a> {
    pub(super) fn new(board: &Board, positions: [u128; 9]) -> Self {
        Self {
            geometry: None,
            geometry_evidence: OnceCell::new(),
            allowed: std::array::from_fn(|digit| {
                templates::with_placed(positions[digit], board, digit as u8 + 1)
            }),
            positions,
            layouts: Default::default(),
            supports: BTreeMap::new(),
        }
    }

    pub(crate) fn for_variant(
        board: &Board,
        masks: &[u16; CELLS],
        houses: &'a [u128],
        peers: &'a [u128; CELLS],
        classic_boxes: bool,
    ) -> Self {
        let mut search = Self::new(board, candidate_positions(masks));
        if !classic_boxes || houses.len() != 27 || peers != &PEERS {
            search.geometry = Some(Geometry { houses, peers });
        }
        search
    }

    pub(crate) fn visit(
        &mut self,
        technique: Technique,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let width = technique
            .pattern_overlay_width()
            .expect("overlay technique");
        for group in (1..=DIGITS).filter(|group| group.count_ones() == width) {
            let supported = self.support(group);
            if bit_indices(group).any(|digit| supported[digit] == 0) {
                continue;
            }
            let (before, already_forced) = self.narrower_support(group);
            for digit in bit_indices(group) {
                let live = self.positions[digit];
                let evidence = || {
                    HintEvidence::PatternOverlay(Box::new(PatternOverlayProof {
                        digit: digit as u8 + 1,
                        geometry: self.geometry.map(|geometry| {
                            Box::new(
                                self.geometry_evidence
                                    .get_or_init(|| geometry.evidence())
                                    .clone(),
                            )
                        }),
                        scopes: bit_indices(group)
                            .map(|index| PatternOverlayDigit {
                                digit: index as u8 + 1,
                                allowed: cells(self.allowed[index]).collect(),
                                supported: cells(supported[index]).collect(),
                            })
                            .collect(),
                    }))
                };
                let mut removed = [0; 9];
                removed[digit] = live & before[digit] & !supported[digit];
                report_eliminations(visit, technique, removed, evidence)?;
                for cell in cells(live & required(supported[digit]) & !already_forced[digit]) {
                    visit(placement(technique, evidence(), cell, digit as u8 + 1))?;
                }
            }
        }
        ControlFlow::Continue(())
    }

    fn narrower_support(&mut self, group: u16) -> ([u128; 9], [u128; 9]) {
        let mut before = self.allowed;
        let mut forced = [0; 9];
        if !group.is_power_of_two() {
            for omit in bit_indices(group) {
                let subgroup = group ^ (1 << omit);
                let support = self.support(subgroup);
                for digit in bit_indices(subgroup) {
                    before[digit] &= support[digit];
                    forced[digit] |= required(support[digit]);
                }
            }
        }
        (before, forced)
    }

    fn support(&mut self, group: u16) -> [u128; 9] {
        if let Some(&support) = self.supports.get(&group) {
            return support;
        }
        let mut support = [0; 9];
        if group.is_power_of_two() {
            let digit = group.trailing_zeros() as usize;
            support[digit] = if self.geometry.is_some() {
                self.layouts(digit)
                    .iter()
                    .fold(0, |supported, layout| supported | layout)
            } else {
                templates::possible(self.allowed[digit])
            };
        } else {
            let (before, _) = self.narrower_support(group);
            let mut families: Vec<_> = bit_indices(group)
                .map(|digit| Family {
                    digit,
                    allowed: before[digit],
                    layouts: self.layouts(digit),
                })
                .collect();
            families.sort_unstable_by_key(|family| (family.layouts.len(), family.digit));
            support = compatible_support(&families);
        }
        self.supports.insert(group, support);
        support
    }

    fn layouts(&self, digit: usize) -> &[u128] {
        self.layouts[digit].get_or_init(|| {
            let allowed = self.allowed[digit];
            self.geometry.map_or_else(
                || templates::layouts(allowed),
                |geometry| templates::layouts_in_houses(allowed, geometry.houses, geometry.peers),
            )
        })
    }
}

#[derive(Clone, Copy)]
struct Geometry<'a> {
    houses: &'a [u128],
    peers: &'a [u128; CELLS],
}

impl Geometry<'_> {
    fn evidence(self) -> PatternOverlayGeometry {
        let mut in_houses = [0; CELLS];
        let houses = self
            .houses
            .iter()
            .map(|&house| {
                let mut cell_iter = cells(house);
                std::array::from_fn(|_| {
                    let cell = cell_iter.next().expect("compiled nine-cell house");
                    in_houses[cell] |= house;
                    cell
                })
            })
            .collect();
        let excluded_pairs = (0..CELLS)
            .flat_map(|cell| {
                cells(self.peers[cell] & !in_houses[cell])
                    .filter(move |&other| other > cell)
                    .map(move |other| [cell, other])
            })
            .collect();
        PatternOverlayGeometry {
            houses,
            excluded_pairs,
        }
    }
}

fn required(support: u128) -> u128 {
    (0..9)
        .map(|row| support & house_cells(House::Row(row)))
        .filter(|sites| sites.is_power_of_two())
        .fold(0, |forced, sites| forced | sites)
}

#[derive(Clone, Copy)]
struct Family<'a> {
    digit: usize,
    allowed: u128,
    layouts: &'a [u128],
}

fn compatible_support(families: &[Family<'_>]) -> [u128; 9] {
    let mut support = [0; 9];
    let mut witness = [0; 9];
    for (index, family) in families.iter().enumerate() {
        let followers: Vec<_> = families[..index]
            .iter()
            .chain(&families[index + 1..])
            .copied()
            .collect();
        for cell in cells(family.allowed & !support[family.digit]) {
            let target = cell_bit(cell);
            if support[family.digit] & target != 0 {
                continue;
            }
            // One disjoint combination certifies each cell in each of its layouts.
            // Find additional witnesses only for cells that still need support.
            let result = family.layouts.iter().copied().find(|&layout| {
                layout & target != 0
                    && layout & !family.allowed == 0
                    && disjoint_layouts(&followers, layout, &mut witness)
            });
            if let Some(layout) = result {
                witness[family.digit] = layout;
                for (supported, used) in support.iter_mut().zip(witness) {
                    *supported |= used;
                }
            }
        }
    }
    support
}

fn disjoint_layouts(families: &[Family<'_>], occupied: u128, witness: &mut [u128; 9]) -> bool {
    let Some((family, rest)) = families.split_first() else {
        return true;
    };
    let forbidden = occupied | !family.allowed;
    for &layout in family.layouts {
        if layout & forbidden == 0 && disjoint_layouts(rest, occupied | layout, witness) {
            witness[family.digit] = layout;
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Candidate, HintAction, VerifiedTemplate, candidates, technique_deductions_at};

    #[cfg(feature = "wasm-api")]
    #[test]
    fn a_candidate_edit_keeps_support_for_groups_without_that_digit() {
        let board = crate::parse_givens(
            "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
        )
        .unwrap();
        let mut masks = candidates(&board).unwrap();
        let mut search = OverlaySearch::classic(&board, &masks);
        let unaffected = search.support(0b110);
        search.support(0b011);
        assert!(search.layouts[0].get().is_some());

        assert_ne!(masks[2] & 1, 0);
        masks[2] &= !1;
        search.update_classic(&board, &masks);

        assert_eq!(search.supports.get(&0b110), Some(&unaffected));
        assert!(!search.supports.contains_key(&0b011));
        assert!(search.layouts[0].get().is_none());
        assert_eq!(
            search.support(0b011),
            OverlaySearch::classic(&board, &masks).support(0b011),
        );
    }

    // Independent checker. Enumerate complete combinations from the row search
    // and build the union in each family without the detector's support pruning.
    fn replay(families: &[&[u128]], used: u128, support: &mut [u128]) -> bool {
        let Some((family, rest)) = families.split_first() else {
            return true;
        };
        let (current, later) = support.split_first_mut().unwrap();
        let mut found = false;
        for &layout in *family {
            if used & layout == 0 && replay(rest, used | layout, later) {
                *current |= layout;
                found = true;
            }
        }
        found
    }

    #[test]
    fn overlay_proofs_replay_the_exact_joint_support_and_need_their_full_scope() {
        for (width, technique) in [
            Technique::PatternOverlay,
            Technique::PairwisePatternOverlay,
            Technique::TriplePatternOverlay,
            Technique::QuadruplePatternOverlay,
            Technique::QuintuplePatternOverlay,
        ]
        .into_iter()
        .enumerate()
        {
            for example in technique.practice_examples() {
                let position = example.position().unwrap();
                let values = position.values().unwrap();
                let masks = candidates(&values).unwrap();
                let solution = VerifiedTemplate::verify(position.givens).unwrap();
                let hint = technique_deductions_at(&position, technique)
                    .unwrap()
                    .into_iter()
                    .find(|hint| hint.actions == example.expected_actions)
                    .expect("the exercise is reproducible");
                let HintEvidence::PatternOverlay(proof) = hint.evidence else {
                    panic!("expected overlay evidence");
                };
                assert_eq!(proof.scopes.len(), width + 1);
                let mut target = None;
                let mut input = Vec::new();
                for (index, scope) in proof.scopes.iter().enumerate() {
                    if scope.digit == proof.digit {
                        target = Some(index);
                    }
                    let allowed = (0..81).fold(0, |allowed, cell| {
                        let live = masks[cell] & !position.eliminations[cell];
                        let contains =
                            values[cell] == scope.digit || live & (1 << (scope.digit - 1)) != 0;
                        allowed | (u128::from(contains) << cell)
                    });
                    assert!(scope.allowed.iter().copied().eq(cells(allowed)));
                    input.push(templates::brute_layouts(allowed));
                }
                let families: Vec<_> = input.iter().map(Vec::as_slice).collect();
                let target = target.unwrap();
                let mut supported = vec![0; families.len()];
                assert!(replay(&families, 0, &mut supported));
                for (scope, support) in proof.scopes.iter().zip(&supported) {
                    assert!(scope.supported.iter().copied().eq(cells(*support)));
                }
                let check = |support, action: HintAction| {
                    let Candidate { cell, digit } = action.candidate();
                    assert_eq!(digit, proof.digit);
                    if matches!(action, HintAction::Place(_)) {
                        required(support) & cell_bit(cell) != 0
                    } else {
                        support & cell_bit(cell) == 0
                    }
                };
                for &action in &hint.actions {
                    let candidate = action.candidate();
                    assert!(check(supported[target], action));
                    assert_eq!(
                        solution.solution()[candidate.cell] == candidate.digit,
                        matches!(action, HintAction::Place(_))
                    );
                    for omit in (0..families.len()).filter(|&index| index != target) {
                        let mut smaller = families.clone();
                        smaller.remove(omit);
                        let mut smaller_support = vec![0; smaller.len()];
                        assert!(replay(&smaller, 0, &mut smaller_support));
                        assert!(!check(
                            smaller_support[target - usize::from(omit < target)],
                            action
                        ));
                    }
                }
            }
        }
    }
    fn variant_layouts(allowed: &[usize], geometry: &PatternOverlayGeometry) -> Vec<u128> {
        fn enumerate(
            rows: &[u128],
            chosen: u128,
            geometry: &PatternOverlayGeometry,
            solutions: &mut Vec<u128>,
        ) {
            if let Some((&row, remaining)) = rows.split_first() {
                for cell in cells(row) {
                    if cells(chosen).all(|previous| previous % 9 != cell % 9) {
                        enumerate(remaining, chosen | cell_bit(cell), geometry, solutions);
                    }
                }
            } else if geometry.houses.iter().all(|house| {
                house
                    .iter()
                    .filter(|&&cell| chosen & cell_bit(cell) != 0)
                    .count()
                    == 1
            }) && geometry
                .excluded_pairs
                .iter()
                .all(|&[a, b]| chosen & cell_bit(a) == 0 || chosen & cell_bit(b) == 0)
            {
                solutions.push(chosen);
            }
        }
        let mut rows = [0; 9];
        for &cell in allowed {
            rows[cell / 9] |= cell_bit(cell);
        }
        let mut layouts = Vec::new();
        enumerate(&rows, 0, geometry, &mut layouts);
        layouts
    }

    #[test]
    fn published_jigsaw_geometry_replays_all_five_overlay_sizes() {
        use crate::{
            Analysis, DEFAULT_VARIANT_SEARCH_NODES, SolveStatus, VariantEvidence, VariantPosition,
            VariantTechnique, variant_practice_examples,
        };

        let widths = [
            Technique::PatternOverlay,
            Technique::PairwisePatternOverlay,
            Technique::TriplePatternOverlay,
            Technique::QuadruplePatternOverlay,
            Technique::QuintuplePatternOverlay,
        ]
        .map(VariantTechnique::Classic);
        let example = variant_practice_examples(widths[0]).unwrap().remove(0);
        let position = &example.position;
        let compiled = position.puzzle.compile().unwrap();
        let entries = &position.entries;
        let eliminations = &position.eliminations;
        let exact = compiled
            .solve(entries, eliminations, DEFAULT_VARIANT_SEARCH_NODES)
            .unwrap();
        assert_eq!(
            compiled.analyze(entries, eliminations, DEFAULT_VARIANT_SEARCH_NODES),
            Ok(Analysis::Unique)
        );
        assert_eq!(
            example.deduction.actions,
            [HintAction::Eliminate(Candidate { cell: 76, digit: 7 })]
        );
        assert_eq!(
            compiled
                .check_practice_move(entries, eliminations, widths[0], example.suggestion)
                .unwrap(),
            Some(example.deduction.clone())
        );

        for (width, technique) in widths.into_iter().enumerate() {
            assert!(compiled.supports_technique(technique));
            let proof = compiled
                .deductions(entries, eliminations, technique)
                .unwrap()
                .remove(0);
            let VariantEvidence::Classic { proof, swap_cells } = proof.evidence else {
                panic!("expected the shared overlay proof")
            };
            let HintEvidence::PatternOverlay(proof) = *proof else {
                panic!("expected overlay evidence")
            };
            assert!(swap_cells.is_empty());
            assert_eq!(proof.scopes.len(), width + 1);
            let geometry = proof.geometry.as_ref().unwrap();
            assert_eq!(geometry.houses.len(), 27);
            for (encoded, compiled) in geometry.houses.iter().zip(compiled.houses()) {
                assert_eq!(*encoded, compiled.cells);
            }
            assert!(geometry.excluded_pairs.is_empty());
            let input: Vec<_> = proof
                .scopes
                .iter()
                .map(|scope| variant_layouts(&scope.allowed, geometry))
                .collect();
            if width == 0 {
                assert_eq!(input[0].len(), 16);
            }
            let borrowed: Vec<_> = input.iter().map(Vec::as_slice).collect();
            let mut supported = vec![0; borrowed.len()];
            assert!(replay(&borrowed, 0, &mut supported));
            for (scope, mask) in proof.scopes.iter().zip(supported) {
                assert!(scope.supported.iter().copied().eq(cells(mask)));
            }
        }

        let givens = VariantPosition::new(position.puzzle.clone());
        let mut order = VariantTechnique::DEFAULT_ORDER.to_vec();
        assert_eq!(givens.rate(&order).unwrap().status, SolveStatus::Stalled);
        order.extend(widths);
        let solved = givens.solve_logically(&order).unwrap();
        assert!(matches!(solved.rating.status, SolveStatus::Solved(_)));
        for &action in solved.steps.iter().flat_map(|step| &step.actions) {
            let candidate = action.candidate();
            assert_eq!(
                exact[candidate.cell] == candidate.digit,
                matches!(action, HintAction::Place(_))
            );
        }
        let trace = position.solve_logically(&order).unwrap();
        let replayed = trace.replay_step(0).unwrap();
        assert_eq!(replayed.deduction, &example.deduction);
        assert_eq!(replayed.before, *position);
        assert!(replayed.after.eliminations[76] & (1 << 6) != 0);
    }

    #[test]
    fn extra_houses_and_knight_conflicts_change_overlay_support() {
        use crate::{
            DEFAULT_VARIANT_SEARCH_NODES, Diagonal, PuzzleRule, VariantEvidence, VariantPuzzle,
            VariantTechnique, parse_givens,
        };

        let overlay = VariantTechnique::Classic(Technique::PatternOverlay);
        let solution = parse_givens(
            "658492731974316582132875694461523978387149256295768143849251367726934815513687429",
        )
        .unwrap();
        let mut givens = solution;
        for cell in [1, 6, 10, 15] {
            givens[cell] = 0;
        }
        let mut x = VariantPuzzle::classic(givens);
        let action = HintAction::Place(Candidate {
            cell: 10,
            digit: solution[10],
        });
        let proofs = |puzzle: &VariantPuzzle| {
            puzzle
                .compile()
                .unwrap()
                .deductions(&[0; CELLS], &[0; CELLS], overlay)
                .unwrap()
        };
        assert!(
            proofs(&x)
                .iter()
                .all(|proof| !proof.actions.contains(&action))
        );
        x.rules.push(PuzzleRule::Diagonal {
            diagonal: Diagonal::Main,
        });
        let proof = proofs(&x)
            .into_iter()
            .find(|proof| proof.actions.contains(&action))
            .unwrap();
        let VariantEvidence::Classic { proof, .. } = proof.evidence else {
            panic!("expected overlay proof")
        };
        let HintEvidence::PatternOverlay(proof) = *proof else {
            panic!("expected overlay evidence")
        };
        let geometry = proof.geometry.unwrap();
        assert_eq!(geometry.houses.len(), 28);
        assert_eq!(
            geometry.houses[27],
            std::array::from_fn(|offset| offset * 10)
        );
        assert!(geometry.excluded_pairs.is_empty());

        let mut givens = [0; CELLS];
        givens[38] = 1;
        givens[51] = 2;
        let mut miracle = VariantPuzzle::miracle(givens);
        let compiled = miracle.compile().unwrap();
        let solution = compiled
            .solve(&[0; CELLS], &[0; CELLS], DEFAULT_VARIANT_SEARCH_NODES)
            .unwrap();
        let action = HintAction::Eliminate(Candidate { cell: 1, digit: 1 });
        assert_ne!(solution[1], 1);
        assert!(!compiled.peers(38).unwrap().any(|cell| cell == 1));
        let proof = proofs(&miracle)
            .into_iter()
            .find(|proof| proof.actions.contains(&action))
            .unwrap();
        let VariantEvidence::Classic { proof, .. } = proof.evidence else {
            panic!("expected overlay proof")
        };
        let HintEvidence::PatternOverlay(proof) = *proof else {
            panic!("expected overlay evidence")
        };
        let geometry = proof.geometry.as_ref().unwrap();
        assert!(geometry.excluded_pairs.contains(&[6, 13]));
        let supported = variant_layouts(&proof.scopes[0].allowed, geometry)
            .into_iter()
            .fold(0, |mask, layout| mask | layout);
        assert!(
            proof.scopes[0]
                .supported
                .iter()
                .copied()
                .eq(cells(supported))
        );
        miracle
            .rules
            .retain(|rule| !matches!(rule, PuzzleRule::AntiKnight {}));
        assert!(
            proofs(&miracle)
                .iter()
                .all(|proof| !proof.actions.contains(&action))
        );
    }
}
