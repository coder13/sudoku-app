use super::{
    ControlFlow, Deduction, HintEvidence, House, PatternSearch, Technique, cell_bit, cells,
    house_cells, rank_zero, report_eliminations,
};
use crate::{SkLoopProof, coordinates};

pub(super) fn visit(
    search: &PatternSearch<'_>,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let mut active = 0;
    for (cell, &value) in search.board.iter().enumerate() {
        if value == 0 && search.masks[cell] != 0 {
            active |= cell_bit(cell);
        }
    }
    for top in 0..6 {
        for bottom in (top / 3 + 1) * 3..9 {
            for left in 0..6 {
                for right in (left / 3 + 1) * 3..9 {
                    let anchors = [
                        top * 9 + left,
                        top * 9 + right,
                        bottom * 9 + right,
                        bottom * 9 + left,
                    ];
                    if anchors.iter().any(|&cell| search.board[cell] == 0) {
                        continue;
                    }
                    let boxes = anchors.map(|cell| House::Box(coordinates(cell).2));
                    let houses = [
                        House::Row(top),
                        boxes[1],
                        House::Column(right),
                        boxes[2],
                        House::Row(bottom),
                        boxes[3],
                        House::Column(left),
                        boxes[0],
                    ];
                    let corners = anchors.iter().fold(0, |set, &cell| set | cell_bit(cell));
                    let arms: [u128; 8] = std::array::from_fn(|i| {
                        house_cells(houses[i])
                            & house_cells(houses[(i + 7) % 8])
                            & active
                            & !corners
                    });
                    if arms.contains(&0) {
                        continue;
                    }
                    let body = arms.iter().fold(0, |body, arm| body | arm);
                    let masks =
                        arms.map(|arm| cells(arm).fold(0, |mask, cell| mask | search.masks[cell]));
                    if masks.iter().map(|mask| mask.count_ones()).sum::<u32>()
                        != body.count_ones() * 2
                    {
                        continue;
                    }
                    visit_links(search, anchors, arms, houses, masks, body, visit)?;
                }
            }
        }
    }
    ControlFlow::Continue(())
}

fn visit_links(
    search: &PatternSearch<'_>,
    anchors: [usize; 4],
    arms: [u128; 8],
    houses: [House; 8],
    masks: [u16; 8],
    body: u128,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let shared = masks[0] & masks[7];
    let mut closing = shared;
    while closing != 0 {
        let next = (closing - 1) & shared;
        if let Some(links) = close_loop(masks, closing) {
            let links = std::array::from_fn(|i| (houses[i], links[i]));
            if let Some(targets) =
                rank_zero::eliminations(body, &links, search.positions_by_digit())
            {
                report_eliminations(visit, Technique::SkLoop, targets, || {
                    HintEvidence::SkLoop(Box::new(SkLoopProof {
                        anchors,
                        arms: arms.map(|arm| cells(arm).collect()),
                        links: links.map(|(house, mask)| rank_zero::link(house, mask)),
                    }))
                })?;
            }
        }
        closing = next;
    }
    ControlFlow::Continue(())
}

fn close_loop(masks: [u16; 8], closing: u16) -> Option<[u16; 8]> {
    let mut links = [0; 8];
    let mut incoming = closing;
    for (i, mask) in masks.into_iter().enumerate() {
        // Every digit in an arm belongs to exactly one of its two links.
        if incoming & !mask != 0 {
            return None;
        }
        let outgoing = mask & !incoming;
        if outgoing == 0 {
            return None;
        }
        links[i] = outgoing;
        incoming = outgoing;
    }
    (incoming == closing).then_some(links)
}
