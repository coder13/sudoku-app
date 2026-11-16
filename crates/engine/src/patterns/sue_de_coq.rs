use super::{
    CELLS, ControlFlow, Deduction, HintEvidence, House, PatternSearch, Technique, bit_indices,
    cell_bit, cells, digits, house_cells, report_eliminations, visit_unions,
};
use crate::SectorSubset;

#[derive(Clone, Copy)]
struct Subset {
    cells: u128,
    digits: u16,
}

impl Subset {
    fn evidence(self, house: House) -> SectorSubset {
        SectorSubset {
            house,
            cells: cells(self.cells).collect(),
            digits: digits(self.digits).collect(),
        }
    }
}

pub(super) fn visit(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let positions = search.positions_by_digit();
    let blocks: [Vec<Subset>; 9] = std::array::from_fn(|i| subsets(House::Box(i), search.masks));
    for line in House::all().take(18) {
        let line_cells = house_cells(line);
        let line_sets = subsets(line, search.masks);
        for (box_index, block_sets) in blocks.iter().enumerate() {
            let block = House::Box(box_index);
            let block_cells = house_cells(block);
            for &intersection in &line_sets {
                let count = intersection.cells.count_ones();
                let gap = intersection.digits.count_ones().saturating_sub(count);
                if count < 2 || intersection.cells & !block_cells != 0 || gap < 2 {
                    continue;
                }
                let line_options = side_options(&line_sets, intersection, gap);
                let block_options = side_options(block_sets, intersection, gap);
                for line_demand in 1..gap {
                    for &(on_line, line_digits) in &line_options[line_demand as usize] {
                        for &(on_block, block_digits) in
                            &block_options[(gap - line_demand) as usize]
                        {
                            if line_digits & block_digits != 0
                                || on_line.cells & on_block.cells != 0
                            {
                                continue;
                            }
                            // The two sides need disjoint digits from the intersection. Every
                            // remaining intersection digit must occur in the intersection itself.
                            let mut targets = [0; 9];
                            let line_locked =
                                on_line.digits | (intersection.digits & !block_digits);
                            let block_locked =
                                on_block.digits | (intersection.digits & !line_digits);
                            for digit in bit_indices(line_locked) {
                                targets[digit] |= positions[digit]
                                    & line_cells
                                    & !(intersection.cells | on_line.cells);
                            }
                            for digit in bit_indices(block_locked) {
                                targets[digit] |= positions[digit]
                                    & block_cells
                                    & !(intersection.cells | on_block.cells);
                            }
                            report_eliminations(visit, Technique::SueDeCoq, targets, || {
                                HintEvidence::SueDeCoq {
                                    intersection: cells(intersection.cells).collect(),
                                    digits: digits(intersection.digits).collect(),
                                    line: on_line.evidence(line),
                                    block: on_block.evidence(block),
                                }
                            })?;
                        }
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}

fn subsets(house: House, masks: &[u16; CELLS]) -> Vec<Subset> {
    let house = house.cells();
    let masks = house.map(|cell| masks[cell]);
    let eligible = masks
        .iter()
        .enumerate()
        .fold(0, |bits, (i, &mask)| bits | (u16::from(mask != 0) << i));
    let mut subsets = Vec::new();
    for size in 1..=eligible.count_ones() {
        let _ = visit_unions::<false>(&masks, eligible, 9, size, 0, 0, &mut |subset, digits| {
            subsets.push(Subset {
                cells: bit_indices(subset).fold(0, |mask, i| mask | cell_bit(house[i])),
                digits,
            });
            ControlFlow::Continue(())
        });
    }
    subsets
}

fn side_options(subsets: &[Subset], intersection: Subset, gap: u32) -> [Vec<(Subset, u16)>; 8] {
    let mut by_demand: [Vec<(Subset, u16)>; 8] = std::array::from_fn(|_| Vec::new());
    for &side in subsets
        .iter()
        .filter(|side| side.cells & intersection.cells == 0)
    {
        let extra = (side.digits & !intersection.digits).count_ones();
        let demand = side.cells.count_ones().saturating_sub(extra);
        let shared = side.digits & intersection.digits;
        if (1..gap).contains(&demand) && demand <= shared.count_ones() {
            by_demand[demand as usize].push((side, shared));
        }
    }
    by_demand
}
