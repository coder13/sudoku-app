use super::{
    ConjugatePair, ControlFlow, Deduction, HintEvidence, House, PEERS, Technique, cell_bit, cells,
    conjugate_pair, coordinates, house_cells, report,
};

type LineLinks = [Option<ConjugatePair>; 9];

pub(super) fn visit(
    positions_by_digit: &[u128; 9],
    technique: Technique,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    for (index, &positions) in positions_by_digit.iter().enumerate() {
        let digit = index as u8 + 1;
        let rows: LineLinks = std::array::from_fn(|row| conjugate_pair(positions, House::Row(row)));
        let columns: LineLinks =
            std::array::from_fn(|col| conjugate_pair(positions, House::Column(col)));
        match technique {
            Technique::Skyscraper => {
                skyscrapers(positions, digit, &rows, |cell| coordinates(cell).1, visit)?;
                skyscrapers(
                    positions,
                    digit,
                    &columns,
                    |cell| coordinates(cell).0,
                    visit,
                )?;
            }
            Technique::TwoStringKite => kites(positions, digit, &rows, &columns, visit)?,
            Technique::EmptyRectangle => rectangles(positions, digit, &rows, &columns, visit)?,
            _ => unreachable!(),
        }
    }
    ControlFlow::Continue(())
}

fn skyscrapers(
    positions: u128,
    digit: u8,
    links: &LineLinks,
    cover_line: impl Fn(usize) -> usize,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    for (index, &link) in links.iter().enumerate() {
        let Some(first) = link else {
            continue;
        };
        let first_covers = first.cells.map(&cover_line);
        for &second in links[index + 1..].iter().flatten() {
            let second_covers = second.cells.map(&cover_line);
            for a in 0..2 {
                for b in 0..2 {
                    if first_covers[a] == second_covers[b]
                        && first_covers[1 - a] != second_covers[1 - b]
                    {
                        report_chain(
                            positions,
                            digit,
                            Technique::Skyscraper,
                            [first, second],
                            [a, b],
                            visit,
                        )?;
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}

fn kites(
    positions: u128,
    digit: u8,
    rows: &LineLinks,
    columns: &LineLinks,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    for &row in rows.iter().flatten() {
        let boxes = row.cells.map(|cell| coordinates(cell).2);
        for &column in columns.iter().flatten() {
            if column.cells.iter().any(|cell| row.cells.contains(cell)) {
                continue;
            }
            let other_boxes = column.cells.map(|cell| coordinates(cell).2);
            for (a, group) in boxes.into_iter().enumerate() {
                for (b, other) in other_boxes.into_iter().enumerate() {
                    if group == other {
                        report_chain(
                            positions,
                            digit,
                            Technique::TwoStringKite,
                            [row, column],
                            [a, b],
                            visit,
                        )?;
                    }
                }
            }
        }
    }
    ControlFlow::Continue(())
}

fn report_chain(
    positions: u128,
    digit: u8,
    technique: Technique,
    links: [ConjugatePair; 2],
    [a, b]: [usize; 2],
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    let [first, second] = links.map(|link| link.cells);
    let bridge = [first[a], second[b]];
    let targets = positions
        & PEERS[first[1 - a]]
        & PEERS[second[1 - b]]
        & !cell_bit(bridge[0])
        & !cell_bit(bridge[1]);
    report(visit, technique, targets, digit, || {
        HintEvidence::SingleDigitChain {
            digit,
            links,
            bridge,
        }
    })
}

fn rectangles(
    positions: u128,
    digit: u8,
    rows: &LineLinks,
    columns: &LineLinks,
    visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
) -> ControlFlow<Deduction> {
    for group in 0..9 {
        let box_cells = house_cells(House::Box(group));
        let contained = positions & box_cells;
        if !(3..=5).contains(&contained.count_ones()) {
            continue;
        }

        for corner in cells(box_cells) {
            let (row, column, _) = coordinates(corner);
            let row_cells = house_cells(House::Row(row));
            let column_cells = house_cells(House::Column(column));
            if contained & !(row_cells | column_cells) != 0
                || contained & (row_cells & !column_cells) == 0
                || contained & (column_cells & !row_cells) == 0
            {
                continue;
            }
            for (near_line, far_line, links) in [
                (row_cells, column_cells, columns),
                (column_cells, row_cells, rows),
            ] {
                for &link in links.iter().flatten() {
                    let [first, second] = link.cells.map(cell_bit);
                    if (first | second) & box_cells != 0 {
                        continue;
                    }
                    let far = if first & near_line != 0 {
                        link.cells[1]
                    } else if second & near_line != 0 {
                        link.cells[0]
                    } else {
                        continue;
                    };
                    let targets = positions & far_line & PEERS[far] & !box_cells;
                    report(visit, Technique::EmptyRectangle, targets, digit, || {
                        HintEvidence::EmptyRectangle {
                            digit,
                            row,
                            column,
                            cells: cells(contained).collect(),
                            link,
                        }
                    })?;
                }
            }
        }
    }
    ControlFlow::Continue(())
}
