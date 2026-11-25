use super::SizedGrid;
use crate::variant::QuadrupleSupport;

#[derive(Debug)]
pub(super) struct SizedQuadruple {
    pub(super) cells: [usize; 4],
    inner: QuadrupleSupport,
}

impl SizedQuadruple {
    pub(super) fn compile(
        layout: &SizedGrid,
        top_left: usize,
        digits: &[u8],
        diagonals: &[Vec<usize>],
        extra_houses: &[Vec<usize>],
    ) -> Option<Self> {
        let size = layout.size();
        if top_left >= size * (size - 1)
            || top_left % size == size - 1
            || !(1..=4).contains(&digits.len())
        {
            return None;
        }
        if digits
            .iter()
            .any(|&digit| digit == 0 || usize::from(digit) > size)
        {
            return None;
        }
        let cells = [top_left, top_left + 1, top_left + size, top_left + size + 1];
        let peers = cells.map(|cell| {
            cells.iter().enumerate().fold(0, |mask, (index, &other)| {
                let shares_house = cell != other
                    && (layout.memberships[cell].iter().any(|&house| {
                        house < layout.houses.len() && layout.memberships[other].contains(&house)
                    }) || diagonals
                        .iter()
                        .chain(extra_houses)
                        .any(|house| house.contains(&cell) && house.contains(&other)));
                mask | u8::from(shares_house) << index
            })
        });
        Some(Self {
            cells,
            inner: QuadrupleSupport::new(digits, peers),
        })
    }

    pub(super) fn support(&self, domains: &[u16]) -> Option<[u16; 4]> {
        let support = self.inner.support(self.cells.map(|cell| domains[cell]));
        (!support.contains(&0)).then_some(support)
    }

    pub(super) fn permits(&self, digits: &[u8], full_mask: u16) -> bool {
        self.inner
            .has_assignment(self.cells.map(|cell| match digits[cell] {
                0 => full_mask,
                rank => 1 << (rank - 1),
            }))
    }
}
