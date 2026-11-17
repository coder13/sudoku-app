use super::{
    Candidate, ControlFlow, Deduction, DeductionActions, HintAction, HintEvidence, PEERS,
    PatternSearch, Technique, cell_bit, digits, forcing::GuardianSearch, report_eliminations,
};
use crate::{DIGITS, ForcingBranch, LinkSource};

// The three even permutations precede the three odd permutations.
const PERMUTATIONS: [[usize; 3]; 6] = [
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
    [0, 2, 1],
    [1, 0, 2],
    [2, 1, 0],
];
const PAIRS: [[usize; 2]; 3] = [[0, 1], [0, 2], [1, 2]];

const TRIPLES: [u16; 84] = {
    let mut values = [0; 84];
    let mut index = 0;
    let mut mask: u16 = 0;
    while mask <= DIGITS {
        if mask.count_ones() == 3 {
            values[index] = mask;
            index += 1;
        }
        mask += 1;
    }
    values
};

const fn supported_triples(minimum: u32) -> [u128; 512] {
    let mut values = [0; 512];
    let mut mask = 0;
    while mask < values.len() {
        let mut i = 0;
        while i < TRIPLES.len() {
            if (mask as u16 & TRIPLES[i]).count_ones() >= minimum {
                values[mask] |= 1 << i;
            }
            i += 1;
        }
        mask += 1;
    }
    values
}

const PAIR_SUPPORT: [u128; 512] = supported_triples(2);
const TRIPLE_SUPPORT: [u128; 512] = supported_triples(3);

#[derive(Clone, Copy)]
struct Transversal {
    cells: [usize; 3],
    triples: u128,
    odd: bool,
}

struct Pattern {
    cells: [[usize; 3]; 4],
    digits: [u8; 3],
    guardians: Vec<Candidate>,
}

impl Pattern {
    fn evidence(&self, branches: Vec<ForcingBranch>) -> HintEvidence {
        HintEvidence::Tridagon {
            cells: self.cells,
            digits: self.digits,
            guardians: self.guardians.clone(),
            branches,
        }
    }

    fn requires_forcing(&self, action: HintAction) -> bool {
        !matches!(action, HintAction::Eliminate(target) if self.guardians.iter().all(|&guardian| conflicts(guardian, target)))
    }

    fn forcing_deduction(&self, action: HintAction, branches: Vec<ForcingBranch>) -> Deduction {
        let actions = match action {
            HintAction::Place(_) => DeductionActions::Placement(action),
            HintAction::Eliminate(_) => DeductionActions::Eliminations(vec![action]),
        };
        Deduction {
            technique: Technique::TridagonForcingNet,
            evidence: self.evidence(branches),
            actions,
        }
    }
}

pub(super) fn visit(
    search: &PatternSearch<'_>,
    technique: Technique,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    if technique == Technique::Tridagon {
        return visit_patterns(search, usize::MAX, &mut |pattern| {
            visit_direct(search, &pattern, visit)
        });
    }

    let mut forcing = None;
    visit_patterns(search, usize::MAX, &mut |pattern| {
        if pattern.guardians.len() >= 2 {
            let forcing = forcing.get_or_insert_with(|| {
                GuardianSearch::new(search.forcing.get_or_init(|| {
                    super::forcing::ForcingGraph::new(search.masks, search.positions_by_digit())
                }))
            });
            forcing.visit(
                &pattern.guardians,
                &mut |action| pattern.requires_forcing(action),
                &mut |action, branches| visit(pattern.forcing_deduction(action, branches)),
            )?;
        }
        ControlFlow::Continue(())
    })?;

    // Try shared conclusions first. Only scan other assumptions if the caller
    // still needs deductions after the simpler case analysis.
    if let Some(mut forcing) = forcing {
        let maximum = forcing.maximum_guardians_to_try();
        return visit_patterns(search, maximum, &mut |pattern| {
            if pattern.guardians.len() < 2 {
                return ControlFlow::Continue(());
            }
            forcing.visit_refutations(
                &pattern.guardians,
                &mut |action| pattern.requires_forcing(action),
                &mut |action, branches| visit(pattern.forcing_deduction(action, branches)),
            )
        });
    }
    ControlFlow::Continue(())
}

fn visit_patterns(
    search: &PatternSearch<'_>,
    maximum_guardians: usize,
    visit: &mut impl FnMut(Pattern) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let transversals: [Vec<_>; 9] = std::array::from_fn(|group| {
        let origin = (group / 3) * 27 + (group % 3) * 3;
        PERMUTATIONS
            .iter()
            .enumerate()
            .filter_map(|(index, columns)| {
                let cells = std::array::from_fn(|row| origin + row * 9 + columns[row]);
                let [a, b, c] = cells.map(|cell| search.masks[cell] as usize);
                // Each selected cell can take two core digits, and each box can take all three.
                let triples =
                    PAIR_SUPPORT[a] & PAIR_SUPPORT[b] & PAIR_SUPPORT[c] & TRIPLE_SUPPORT[a | b | c];
                (triples != 0).then_some(Transversal {
                    cells,
                    triples,
                    odd: index >= 3,
                })
            })
            .collect()
    });
    for [top, bottom] in PAIRS {
        for [left, right] in PAIRS {
            for a in &transversals[top * 3 + left] {
                for b in &transversals[top * 3 + right] {
                    let shared = a.triples & b.triples;
                    if shared == 0 {
                        continue;
                    }
                    for c in &transversals[bottom * 3 + left] {
                        let shared = shared & c.triples;
                        if shared == 0 {
                            continue;
                        }
                        for d in &transversals[bottom * 3 + right] {
                            // Along each row or column the colors must permute without fixed
                            // points, so their parity agrees. An odd number of row-to-column
                            // transversal flips makes the parities disagree around the loop.
                            if !(a.odd ^ b.odd ^ c.odd ^ d.odd) {
                                continue;
                            }
                            let mut shared = shared & d.triples;
                            let cells = [a.cells, b.cells, c.cells, d.cells];
                            if maximum_guardians != usize::MAX
                                && cells
                                    .iter()
                                    .flatten()
                                    .map(|&cell| search.masks[cell].count_ones() as usize)
                                    .sum::<usize>()
                                    > maximum_guardians + 36
                            {
                                // Twelve cells can contribute at most 36 core candidates.
                                continue;
                            }
                            while shared != 0 {
                                let core = TRIPLES[shared.trailing_zeros() as usize];
                                shared &= shared - 1;
                                if maximum_guardians != usize::MAX
                                    && cells
                                        .iter()
                                        .flatten()
                                        .map(|&cell| {
                                            (search.masks[cell] & !core).count_ones() as usize
                                        })
                                        .sum::<usize>()
                                        > maximum_guardians
                                {
                                    continue;
                                }
                                let guardians = cells
                                    .iter()
                                    .flatten()
                                    .flat_map(|&cell| {
                                        digits(search.masks[cell] & !core)
                                            .map(move |digit| Candidate { cell, digit })
                                    })
                                    .collect::<Vec<_>>();
                                let mut core_digits = digits(core);
                                let digits = std::array::from_fn(|_| core_digits.next().unwrap());
                                visit(Pattern {
                                    cells,
                                    digits,
                                    guardians,
                                })?;
                            }
                        }
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}

pub(super) fn visit_links(
    search: &PatternSearch<'_>,
    mut visit: impl FnMut([(u8, u128); 2], LinkSource),
) {
    // A two-node link can cover guardians of at most two digits, with one
    // occurrence of each digit per cell in the twelve-cell pattern.
    let _ = visit_patterns(search, 24, &mut |pattern| {
        if pattern.guardians.len() < 2 {
            return ControlFlow::Continue(());
        }
        let mut positions = [0; 9];
        let mut digits = 0u16;
        for guardian in pattern.guardians {
            let index = usize::from(guardian.digit - 1);
            positions[index] |= cell_bit(guardian.cell);
            digits |= 1 << index;
            if digits.count_ones() > 2 {
                return ControlFlow::Continue(());
            }
        }
        let source = LinkSource::Tridagon {
            // Sudoku has 81 cells. Keep this geometry compact in graph edges.
            cells: pattern.cells.map(|triple| triple.map(|cell| cell as u8)),
            digits: pattern.digits,
        };
        let first = digits.trailing_zeros() as usize;
        let last = digits.ilog2() as usize;
        let digit = first as u8 + 1;
        if first != last {
            visit(
                [(digit, positions[first]), (last as u8 + 1, positions[last])],
                source,
            );
        } else {
            let all = positions[first];
            let anchored = cell_bit(all.trailing_zeros() as usize);
            let optional = all ^ anchored;
            // Enumerate each complementary partition once.
            let mut subset = (optional - 1) & optional;
            loop {
                visit(
                    [(digit, anchored | subset), (digit, optional ^ subset)],
                    source,
                );
                if subset == 0 {
                    break;
                }
                subset = (subset - 1) & optional;
            }
        }
        ControlFlow::Continue(())
    });
}

fn visit_direct(
    search: &PatternSearch<'_>,
    pattern: &Pattern,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let Some(&first) = pattern.guardians.first() else {
        return ControlFlow::Continue(());
    };
    if pattern.guardians.len() == 1 {
        return visit(Deduction {
            technique: Technique::Tridagon,
            evidence: pattern.evidence(Vec::new()),
            actions: DeductionActions::Placement(HintAction::Place(first)),
        });
    }
    let mut targets = *search.positions_by_digit();
    for &candidate in &pattern.guardians {
        for (index, cells) in targets.iter_mut().enumerate() {
            *cells &= if index + 1 == usize::from(candidate.digit) {
                PEERS[candidate.cell]
            } else {
                cell_bit(candidate.cell)
            };
        }
        if targets.iter().all(|&cells| cells == 0) {
            return ControlFlow::Continue(());
        }
    }
    report_eliminations(visit, Technique::Tridagon, targets, || {
        pattern.evidence(Vec::new())
    })
}

fn conflicts(a: Candidate, b: Candidate) -> bool {
    (a.cell == b.cell && a.digit != b.digit)
        || (a.digit == b.digit && PEERS[a.cell] & cell_bit(b.cell) != 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guardian_links_cover_every_live_alternative() {
        let position = Technique::TridagonAic
            .practice_example()
            .position()
            .unwrap();
        let board = position.values().unwrap();
        let mut masks = crate::candidates(&board).unwrap();
        let source = LinkSource::Tridagon {
            cells: [[0, 10, 20], [3, 13, 23], [27, 37, 47], [32, 40, 48]],
            digits: [1, 2, 3],
        };
        let links = |masks: &[u16; crate::CELLS]| {
            let search = PatternSearch::new(&board, masks);
            let mut links = Vec::new();
            visit_links(&search, |endpoints, found| {
                if found == source {
                    links.push(endpoints);
                }
            });
            links
        };
        assert_eq!(links(&masks), [[(7, cell_bit(32)), (9, cell_bit(40))]]);

        // A third digit breaks that two-node link.
        masks[0] |= 1 << (4 - 1);
        assert!(links(&masks).is_empty());

        // Three guardians of one digit can be grouped without losing an alternative.
        masks[0] = (masks[0] & !(1 << (4 - 1))) | 1 << (7 - 1);
        masks[3] |= 1 << (7 - 1);
        masks[40] &= !(1 << (9 - 1));
        let links = links(&masks);
        assert_eq!(links.len(), 3);
        for [(first_digit, first), (second_digit, second)] in links {
            assert_eq!([first_digit, second_digit], [7, 7]);
            assert_eq!(first & second, 0);
            assert_eq!(first | second, cell_bit(0) | cell_bit(3) | cell_bit(32));
        }
    }
}
