const CELLS: usize = 81;
const DIGITS: u16 = 0x1ff;
const SEARCH_LIMIT: u32 = 1_000_000;

pub type Board = [u8; CELLS];

#[repr(u32)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Analysis {
    Conflict,
    Unsolvable,
    Unique,
    Multiple,
    SearchLimit,
}

#[derive(Default)]
struct Units {
    rows: [u16; 9],
    columns: [u16; 9],
    boxes: [u16; 9],
}

fn coordinates(index: usize) -> (usize, usize, usize) {
    let (row, column) = (index / 9, index % 9);
    (row, column, (row / 3) * 3 + column / 3)
}

impl Units {
    fn from_board(board: &Board) -> Option<Self> {
        let mut units = Self::default();
        for (index, &digit) in board.iter().enumerate() {
            if digit == 0 {
                continue;
            }
            if digit > 9 {
                return None;
            }
            let bit = 1 << (digit - 1);
            if units.available(index) & bit == 0 {
                return None;
            }
            units.toggle(index, bit);
        }
        Some(units)
    }

    fn available(&self, index: usize) -> u16 {
        let (row, column, group) = coordinates(index);
        DIGITS & !(self.rows[row] | self.columns[column] | self.boxes[group])
    }

    fn toggle(&mut self, index: usize, bit: u16) {
        let (row, column, group) = coordinates(index);
        self.rows[row] ^= bit;
        self.columns[column] ^= bit;
        self.boxes[group] ^= bit;
    }

    fn next_cell(&self, board: &Board) -> Option<(usize, u16)> {
        let mut best = None;
        let mut fewest = 10;
        for (index, &digit) in board.iter().enumerate() {
            if digit != 0 {
                continue;
            }
            let choices = self.available(index);
            let count = choices.count_ones();
            if count < fewest {
                best = Some((index, choices));
                fewest = count;
            }
            if count == 0 {
                break;
            }
        }
        best
    }
}

pub fn parse_givens(text: &str) -> Option<Board> {
    if text.len() != CELLS {
        return None;
    }
    let mut board = [0; CELLS];
    for (index, byte) in text.bytes().enumerate() {
        board[index] = match byte {
            b'.' => 0,
            b'0'..=b'9' => byte - b'0',
            _ => return None,
        };
    }
    Some(board)
}

pub fn analyze(board: &Board) -> Analysis {
    let Some(mut units) = Units::from_board(board) else {
        return Analysis::Conflict;
    };
    let mut budget = SEARCH_LIMIT;
    let mut work = *board;
    match count_solutions(&mut work, &mut units, &mut budget, 2) {
        None => Analysis::SearchLimit,
        Some(0) => Analysis::Unsolvable,
        Some(1) => Analysis::Unique,
        Some(_) => Analysis::Multiple,
    }
}

fn count_solutions(
    board: &mut Board,
    units: &mut Units,
    budget: &mut u32,
    limit: u8,
) -> Option<u8> {
    *budget = budget.checked_sub(1)?;
    let Some((index, mut choices)) = units.next_cell(board) else {
        return Some(1);
    };
    let mut count = 0;
    while choices != 0 && count < limit {
        let offset = choices.trailing_zeros();
        let bit = 1 << offset;
        choices ^= bit;
        board[index] = offset as u8 + 1;
        units.toggle(index, bit);
        let found = count_solutions(board, units, budget, limit - count);
        units.toggle(index, bit);
        board[index] = 0;
        count += found?;
    }
    Some(count)
}

pub fn solve(board: &Board) -> Option<Board> {
    let mut units = Units::from_board(board)?;
    let mut work = *board;
    let mut budget = SEARCH_LIMIT;
    solve_one(&mut work, &mut units, &mut budget).then_some(work)
}

fn solve_one(board: &mut Board, units: &mut Units, budget: &mut u32) -> bool {
    let Some(remaining) = budget.checked_sub(1) else {
        return false;
    };
    *budget = remaining;
    let Some((index, mut choices)) = units.next_cell(board) else {
        return true;
    };
    while choices != 0 {
        let offset = choices.trailing_zeros();
        let bit = 1 << offset;
        choices ^= bit;
        board[index] = offset as u8 + 1;
        units.toggle(index, bit);
        if solve_one(board, units, budget) {
            return true;
        }
        units.toggle(index, bit);
    }
    board[index] = 0;
    false
}

pub fn candidates(board: &Board) -> Option<[u16; CELLS]> {
    let units = Units::from_board(board)?;
    Some(std::array::from_fn(|index| {
        if board[index] == 0 {
            units.available(index)
        } else {
            0
        }
    }))
}

struct Random(u32);

impl Random {
    fn index(&mut self, bound: usize) -> usize {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        self.0 as usize % bound
    }

    fn shuffle<T>(&mut self, values: &mut [T]) {
        for last in (1..values.len()).rev() {
            values.swap(last, self.index(last + 1));
        }
    }
}

fn fill(board: &mut Board, units: &mut Units, random: &mut Random) -> bool {
    let Some((index, choices)) = units.next_cell(board) else {
        return true;
    };
    let mut order = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    random.shuffle(&mut order);
    for digit in order {
        let bit = 1 << (digit - 1);
        if choices & bit == 0 {
            continue;
        }
        board[index] = digit;
        units.toggle(index, bit);
        if fill(board, units, random) {
            return true;
        }
        units.toggle(index, bit);
    }
    board[index] = 0;
    false
}

pub fn generate(seed: u32) -> Board {
    let mut random = Random(if seed == 0 { 0x9e3779b9 } else { seed });
    let mut board = [0; CELLS];
    assert!(fill(&mut board, &mut Units::default(), &mut random));
    let mut order = std::array::from_fn::<_, CELLS, _>(|index| index);
    random.shuffle(&mut order);
    let mut clues = CELLS;
    for index in order {
        let previous = std::mem::take(&mut board[index]);
        if analyze(&board) == Analysis::Unique {
            clues -= 1;
            if clues == 34 {
                break;
            }
        } else {
            board[index] = previous;
        }
    }
    board
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use std::cell::Cell;

    use super::*;

    // JS views these fixed-size buffers between synchronous calls on one worker.
    thread_local! {
        static BOARD: Cell<Board> = const { Cell::new([0; CELLS]) };
        static NOTES: Cell<[u16; CELLS]> = const { Cell::new([0; CELLS]) };
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn board_buffer() -> *mut u8 {
        BOARD.with(|board| board.as_ptr().cast())
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn notes_buffer() -> *mut u16 {
        NOTES.with(|notes| notes.as_ptr().cast())
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn analyze_board() -> u32 {
        BOARD.with(|board| analyze(&board.get()) as u32)
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn fill_notes() -> u32 {
        let Some(masks) = BOARD.with(|board| candidates(&board.get())) else {
            return 0;
        };
        NOTES.with(|notes| notes.set(masks));
        1
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn solve_board() -> u32 {
        let Some(solution) = BOARD.with(|board| solve(&board.get())) else {
            return 0;
        };
        BOARD.with(|board| board.set(solution));
        1
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn generate_board(seed: u32) {
        BOARD.with(|board| board.set(generate(seed)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WARMUP: &str =
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

    #[test]
    fn checks_solution_count_and_conflicts() {
        let mut board = parse_givens(WARMUP).unwrap();
        assert_eq!(analyze(&board), Analysis::Unique);
        board[2] = 1;
        assert_eq!(analyze(&board), Analysis::Unsolvable);
        board[2] = 3;
        assert_eq!(analyze(&board), Analysis::Conflict);
        assert_eq!(analyze(&[0; CELLS]), Analysis::Multiple);
    }

    #[test]
    fn returns_legal_candidates_only_for_empty_cells() {
        let board = parse_givens(WARMUP).unwrap();
        let masks = candidates(&board).unwrap();
        assert_eq!(masks[0], 0);
        assert_eq!(masks[2], 0b1011);
        assert_eq!(masks[40], 1 << 4);
    }

    #[test]
    fn solves_a_valid_puzzle() {
        let board = parse_givens(WARMUP).unwrap();
        let solution = solve(&board).unwrap();
        assert_eq!(analyze(&solution), Analysis::Unique);
        assert!(!solution.contains(&0));
        assert!(
            board
                .iter()
                .zip(solution)
                .all(|(&given, solved)| given == 0 || given == solved)
        );
    }

    #[test]
    fn generator_produces_distinct_unique_puzzles() {
        for seed in [0, 1, 42, u32::MAX] {
            let board = generate(seed);
            assert_eq!(analyze(&board), Analysis::Unique);
            assert!((34..=40).contains(&board.iter().filter(|&&digit| digit != 0).count()));
        }
        assert_ne!(generate(1), generate(42));
    }
}
