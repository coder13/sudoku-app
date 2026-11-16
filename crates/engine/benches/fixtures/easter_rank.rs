use sudoku_app_engine::{Candidate, House, RankConstraint, RankPattern};

use RankConstraint::{Cell, HouseDigit};

pub const EASTER_MONSTER: &str =
    "100000002090400050006000700050903000000070000000850040700000600030009080002000001";

pub const TARGET: Candidate = Candidate { cell: 51, digit: 1 };

fn house_digit(house: House, digit: u8) -> RankConstraint {
    HouseDigit { house, digit }
}

pub fn barker_pattern() -> RankPattern {
    use House::{Box, Column, Row};

    // The 23 bases and 23 covers for Barker's removal at r6c7.
    // https://sudoku.allanbarker.com/sweb/extra/easter/a_em.htm
    let mut bases: Vec<_> = [2, 3, 6, 7, 8]
        .map(|digit| house_digit(Row(1), digit))
        .into();
    bases.extend([
        house_digit(Row(3), 1),
        house_digit(Row(4), 2),
        house_digit(Column(5), 1),
        house_digit(Column(7), 1),
        house_digit(Column(1), 2),
        house_digit(Column(5), 2),
        house_digit(Column(7), 2),
        Cell(1),
        Cell(6),
        Cell(7),
        Cell(13),
        Cell(33),
        Cell(43),
        house_digit(Box(1), 1),
        house_digit(Box(6), 1),
        house_digit(Box(0), 2),
        house_digit(Box(2), 6),
        house_digit(Box(3), 7),
    ]);
    let covers = vec![
        house_digit(Row(2), 1),
        house_digit(Row(5), 1),
        house_digit(Row(6), 1),
        house_digit(Row(2), 2),
        house_digit(Row(6), 2),
        house_digit(Row(0), 4),
        house_digit(Row(0), 9),
        house_digit(Column(2), 1),
        house_digit(Column(2), 7),
        house_digit(Column(4), 1),
        house_digit(Column(6), 8),
        house_digit(Column(7), 6),
        Cell(9),
        Cell(11),
        Cell(14),
        Cell(17),
        Cell(46),
        house_digit(Box(0), 7),
        house_digit(Box(0), 8),
        house_digit(Box(2), 3),
        house_digit(Box(4), 2),
        house_digit(Box(5), 1),
        house_digit(Box(5), 2),
    ];
    RankPattern { bases, covers }
}
