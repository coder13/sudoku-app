use std::sync::OnceLock;

use crate::Board;

const PERMUTATIONS: [[usize; 3]; 6] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
];

fn axis_orders() -> &'static [[usize; 9]] {
    static ORDERS: OnceLock<Vec<[usize; 9]>> = OnceLock::new();
    ORDERS.get_or_init(|| {
        let mut orders = Vec::with_capacity(6_usize.pow(4));
        for groups in PERMUTATIONS {
            for first in PERMUTATIONS {
                for second in PERMUTATIONS {
                    for third in PERMUTATIONS {
                        let within = [first, second, third];
                        orders.push(std::array::from_fn(|i| {
                            3 * groups[i / 3] + within[i / 3][i % 3]
                        }));
                    }
                }
            }
        }
        orders
    })
}

/// A key shared by grids related by Sudoku symmetries or digit renaming.
/// Digits are numbered in order of first occurrence after minimizing the clue layout.
pub fn canonical_puzzle(board: &Board) -> Board {
    let mut best_layout = [u16::MAX; 9];
    let mut best_digits = [u8::MAX; 81];
    if board.iter().all(|&digit| digit == 0) {
        return *board;
    }
    let transposed = std::array::from_fn(|i| board[i % 9 * 9 + i / 9]);
    let orders = axis_orders();
    for board in [board, &transposed] {
        for columns in orders {
            let rows = std::array::from_fn::<_, 9, _>(|row| {
                columns.iter().fold(0, |mask, &column| {
                    (mask << 1) | u16::from(board[row * 9 + column] != 0)
                })
            });
            // The smallest layout for these columns sorts within bands first,
            // then sorts the bands. Equal layouts can still have different digits.
            let mut bands = [[0; 3]; 3];
            for (band, pattern) in bands.iter_mut().zip(rows.as_chunks::<3>().0) {
                band.copy_from_slice(pattern);
                band.sort_unstable();
            }
            bands.sort_unstable();
            let layout = *bands.as_flattened().first_chunk::<9>().unwrap();
            if layout > best_layout {
                continue;
            }
            if layout < best_layout {
                best_layout = layout;
                best_digits.fill(u8::MAX);
            }
            for order in orders {
                if !order
                    .iter()
                    .zip(layout)
                    .all(|(&row, pattern)| rows[row] == pattern)
                {
                    continue;
                }
                let mut labels = [0; 10];
                let mut next = 1;
                let digits = std::array::from_fn(|i| {
                    let digit = board[order[i / 9] * 9 + columns[i % 9]] as usize;
                    if digit == 0 {
                        return 0;
                    }
                    let label = &mut labels[digit];
                    if *label == 0 {
                        *label = next;
                        next += 1;
                    }
                    *label
                });
                best_digits = best_digits.min(digits);
            }
        }
    }
    best_digits
}
