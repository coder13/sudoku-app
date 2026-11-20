use super::{LineKind, reachable, sum_support};
use crate::variant::{CompiledVariant, search::record_support};

/// The ordered sum clue and a consecutive set wholly contained in it.
pub(in crate::variant) struct ContainedJoin<'a> {
    pub rules: [usize; 2],
    pub cells: &'a [usize],
    members: u16,
    total: u16,
}

impl ContainedJoin<'_> {
    pub fn support(&self, domains: &[u16]) -> [u16; 9] {
        assert_eq!(domains.len(), self.cells.len());
        contained_support(domains, self.members, self.total)
    }
}

/// Find valid two-rule scopes without using authored drawing paths or house assumptions.
pub(in crate::variant) fn contained_joins(
    puzzle: &CompiledVariant,
) -> impl Iterator<Item = ContainedJoin<'_>> {
    let rays = puzzle.lines.iter().filter_map(|ray| match ray.kind {
        LineKind::Sum(total) => Some((ray, total)),
        _ => None,
    });
    rays.flat_map(move |(ray, total)| {
        puzzle.lines.iter().filter_map(move |renban| {
            if !matches!(renban.kind, LineKind::Renban) || renban.cells.len() < 2 {
                return None;
            }
            let mut members = 0u16;
            for cell in &renban.cells {
                members |= 1 << ray.cells.iter().position(|member| member == cell)?;
            }
            Some(ContainedJoin {
                rules: [renban.rule_index, ray.rule_index],
                cells: &ray.cells,
                members,
                total,
            })
        })
    })
}

/// Find the digits supported by a sum and a Renban completely inside its cells.
/// `members` marks positions in the sum's ordered cell list. Remaining cells
/// may repeat digits, including digits from the Renban.
fn contained_support(domains: &[u16], members: u16, total: u16) -> [u16; 9] {
    assert!(domains.len() <= 9 && members >> domains.len() == 0);
    let length = members.count_ones() as usize;
    assert!(length >= 2);

    let mut inside = [0; 9];
    let mut outside = [0; 9];
    let mut outside_count = 0;
    let mut inside_count = 0;
    for (index, &domain) in domains.iter().enumerate() {
        if members & (1 << index) != 0 {
            inside[inside_count] = domain;
            inside_count += 1;
        } else {
            outside[outside_count] = domain;
            outside_count += 1;
        }
    }
    let inside = &inside[..length];
    let outside = &outside[..outside_count];
    let outside_totals = reachable(outside);
    let mut inside_support = [0; 9];
    let mut supported_totals = 0;
    for first in 1..=10 - length {
        // The order of digits on the Renban does not affect its contribution.
        let interval_sum = length * (2 * first + length - 1) / 2;
        let Some(remainder) = usize::from(total).checked_sub(interval_sum) else {
            break;
        };
        if remainder > 9 * outside_count || outside_totals & (1 << remainder) == 0 {
            continue;
        }
        let interval = ((1 << length) - 1) << (first - 1);
        if record_support::<9, 512>(interval, inside, &mut inside_support, &mut [None; 512]) {
            supported_totals |= 1 << remainder;
        }
    }

    // The cells outside the Renban can use any assignment of a supported
    // remainder. No digit distinctness connects these two parts of the sum.
    let mut outside_support = [0; 9];
    sum_support(
        outside,
        supported_totals,
        &mut outside_support[..outside_count],
    );
    let mut inside = inside_support.into_iter();
    let mut outside = outside_support.into_iter();
    let mut support = [0; 9];
    for (index, slot) in support.iter_mut().take(domains.len()).enumerate() {
        *slot = if members & (1 << index) != 0 {
            inside.next().unwrap()
        } else {
            outside.next().unwrap()
        };
    }
    support
}

#[cfg(test)]
mod tests;
