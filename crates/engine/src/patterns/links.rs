use super::{CELLS, Candidate, House, cell_bit, house_cells};
use crate::hints::{CandidateLink, LinkSource, LinkStrength, digit_bit};

pub(super) const CANDIDATE_COUNT: usize = CELLS * 9;

pub(super) fn index(candidate: Candidate) -> usize {
    candidate.cell * 9 + usize::from(candidate.digit - 1)
}

pub(super) fn candidate(index: usize) -> Candidate {
    Candidate {
        cell: index / 9,
        digit: (index % 9) as u8 + 1,
    }
}

pub(super) fn conjugate_houses(positions: &[u128; 9]) -> [u32; 9] {
    positions.map(|positions| {
        House::all().fold(0, |flags, house| {
            if (positions & house_cells(house)).count_ones() == 2 {
                flags | house_flag(house)
            } else {
                flags
            }
        })
    })
}

fn house_flag(house: House) -> u32 {
    match house {
        House::Row(row) => 1 << row,
        House::Column(column) => 1 << (9 + column),
        House::Box(group) => 1 << (18 + group),
    }
}

pub(super) struct CandidateLinks<'a> {
    pub masks: &'a [u16; CELLS],
    pub positions: &'a [u128; 9],
    pub conjugates: &'a [u32; 9],
}

impl CandidateLinks<'_> {
    pub fn house_links(&self, from: Candidate) -> impl Iterator<Item = CandidateLink> + '_ {
        let digit_index = usize::from(from.digit - 1);
        House::at(from.cell).into_iter().filter_map(move |house| {
            if self.conjugates[digit_index] & house_flag(house) == 0 {
                return None;
            }
            let other = self.positions[digit_index] & house_cells(house) & !cell_bit(from.cell);
            let to = Candidate {
                cell: other.trailing_zeros() as usize,
                digit: from.digit,
            };
            Some(CandidateLink {
                from,
                to,
                source: LinkSource::House(house),
                strength: LinkStrength::Strong,
            })
        })
    }

    pub fn cell_link(&self, from: Candidate) -> Option<CandidateLink> {
        let other = self.masks[from.cell] & !digit_bit(from.digit);
        other.is_power_of_two().then(|| CandidateLink {
            from,
            to: Candidate {
                cell: from.cell,
                digit: other.trailing_zeros() as u8 + 1,
            },
            source: LinkSource::Cell(from.cell),
            strength: LinkStrength::Strong,
        })
    }
}

pub(super) fn weak_source(first: Candidate, second: Candidate) -> Option<LinkSource> {
    if first.cell == second.cell {
        return (first.digit != second.digit).then_some(LinkSource::Cell(first.cell));
    }
    if first.digit != second.digit {
        return None;
    }
    House::at(first.cell)
        .into_iter()
        .zip(House::at(second.cell))
        .find_map(|(a, b)| (a == b).then_some(LinkSource::House(a)))
}
