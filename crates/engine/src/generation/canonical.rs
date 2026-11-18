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

// Every row of a completed Latin grid contains all nine digits. Choosing the
// first row fixes the digit names. The remaining legal row order is then the
// lexicographically least order within each band and between the two free bands.
fn completed_key(board: &Board, transposed: &Board) -> Board {
    let mut best = [u64::MAX; 9];
    for grid in [board, transposed] {
        for columns in axis_orders() {
            let rows: [[u8; 9]; 9] = std::array::from_fn(|r| columns.map(|c| grid[r * 9 + c]));
            for first in 0..9 {
                let mut digit = [0; 10];
                for (i, &d) in rows[first].iter().enumerate() {
                    digit[d as usize] = i as u64 + 1;
                }
                let encode = |r: usize| rows[r].iter().fold(0, |n, &d| n << 4 | digit[d as usize]);
                let band = first / 3;
                let a = encode(3 * band + (first + 1) % 3);
                let b = encode(3 * band + (first + 2) % 3);
                if (a.min(b), a.max(b)) > (best[1], best[2]) {
                    continue;
                }
                let other = |b: usize| {
                    let mut three = [encode(3 * b), encode(3 * b + 1), encode(3 * b + 2)];
                    three.sort_unstable();
                    three
                };
                let (x, y) = (other((band + 1) % 3), other((band + 2) % 3));
                let (x, y) = if x <= y { (x, y) } else { (y, x) };
                best = best.min([0x123456789, a.min(b), a.max(b), x[0], x[1], x[2], y[0], y[1], y[2]]);
            }
        }
    }
    std::array::from_fn(|i| ((best[i / 9] >> (4 * (8 - i % 9))) & 15) as u8)
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
    if [board, &transposed].into_iter().all(|grid| {
        grid.chunks_exact(9).all(|row| row.iter().all(|d| (1..=9).contains(d))
            && row.iter().fold(0u16, |m, d| m | 1 << d) == 0x3fe)
    }) {
        return completed_key(board, &transposed);
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completed_keys_cover_digit_axis_and_transpose_symmetries() {
        let grid = crate::parse_givens("394152867516978243287634915659817324472563189138429576725386491963241758841795632").unwrap();
        let key = crate::parse_givens("123456789457189236689327514291643857734598621865271943376815492512964378948732165").unwrap();
        assert_eq!(canonical_puzzle(&grid), key);
        assert_eq!(canonical_puzzle(&key), key);
        let rows = axis_orders()[937];
        let cols = axis_orders()[512];
        let transformed = std::array::from_fn(|i| 10 - grid[9 * rows[i % 9] + cols[i / 9]]);
        assert_eq!(canonical_puzzle(&transformed), key);
        // A Jigsaw solution can be Latin without satisfying the classic boxes.
        let latin = std::array::from_fn(|i| ((i / 9 + i % 9) % 9 + 1) as u8);
        let renamed = std::array::from_fn(|i| 10 - latin[9 * rows[i % 9] + cols[i / 9]]);
        assert_eq!(canonical_puzzle(&latin), canonical_puzzle(&renamed));
        assert_ne!(canonical_puzzle(&latin), key);
    }
}
