use crate::{CELLS, Random};

pub(crate) fn puzzle_permutation(random: &mut Random) -> ([usize; CELLS], [u8; 10]) {
    let rows = axis_order(random);
    let columns = axis_order(random);
    let transposed = random.index(2) == 1;
    let mut digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    random.shuffle(&mut digits[1..]);
    let cells = std::array::from_fn(|cell| {
        let (row, col) = (rows[cell / 9], columns[cell % 9]);
        if transposed {
            col * 9 + row
        } else {
            row * 9 + col
        }
    });
    (cells, digits)
}

fn axis_order(random: &mut Random) -> [usize; 9] {
    let mut groups = [0, 1, 2];
    random.shuffle(&mut groups);
    let mut axis = [0; 9];
    for (group, indices) in groups.into_iter().zip(axis.as_chunks_mut::<3>().0) {
        indices.copy_from_slice(&[group * 3, group * 3 + 1, group * 3 + 2]);
        random.shuffle(indices);
    }
    axis
}
