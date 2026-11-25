use super::super::SizedGrid;
use super::{EntropicLine, EqualSums, MAX_CELLS, MAX_SIZE, entropy_group_masks};

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize, serde::Deserialize),
    serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)
)]
pub enum SizedLineType {
    Entropic { groups: Vec<Vec<u8>> },
    RegionSum,
    Renban,
}

const MAX_TYPES: usize = 3;

#[derive(Debug)]
enum Line {
    Entropic(EntropicLine),
    RegionSum(EqualSums),
    Renban,
}

#[derive(Debug)]
struct Path {
    cells: Vec<usize>,
    types: Vec<Option<Line>>,
}

#[derive(Debug)]
pub(super) struct LineAssignments {
    pub cells: Vec<usize>,
    paths: Vec<Path>,
    choices: Vec<[usize; MAX_TYPES]>,
    size: usize,
    has_overlap: bool,
}

pub(super) struct AssignmentSupport {
    pub masks: [u16; MAX_CELLS],
    pub surviving: u8,
}

impl LineAssignments {
    pub fn compile(
        layout: &SizedGrid,
        paths: &[Vec<usize>],
        types: &[SizedLineType],
    ) -> Option<Self> {
        if paths.len() != types.len() || !(2..=MAX_TYPES).contains(&types.len()) {
            return None;
        }
        let size = layout.size();
        let mut groups: Option<[u16; 3]> = None;
        let mut kinds = 0;
        for kind in types {
            let bit = match kind {
                SizedLineType::Entropic { groups: digits } => {
                    groups = Some(entropy_group_masks(size, digits)?);
                    1
                }
                SizedLineType::RegionSum => 2,
                SizedLineType::Renban => 4,
            };
            if kinds & bit != 0 {
                return None;
            }
            kinds |= bit;
        }

        let mut used = [false; MAX_CELLS];
        let mut has_overlap = false;
        let mut compiled = Vec::with_capacity(paths.len());
        for (index, cells) in paths.iter().enumerate() {
            if !(2..=size * size).contains(&cells.len())
                || paths[..index]
                    .iter()
                    .any(|path| path == cells || path.iter().rev().eq(cells))
            {
                return None;
            }
            let mut seen = [false; MAX_CELLS];
            for &cell in cells {
                if cell >= size * size || std::mem::replace(&mut seen[cell], true) {
                    return None;
                }
                has_overlap |= std::mem::replace(&mut used[cell], true);
            }
            let types = types
                .iter()
                .map(|kind| match kind {
                    SizedLineType::Entropic { .. } => {
                        EntropicLine::compile(cells, groups.unwrap(), layout.cell_count())
                            .map(Line::Entropic)
                    }
                    SizedLineType::RegionSum => {
                        EqualSums::region_sum(layout, cells, false).map(Line::RegionSum)
                    }
                    SizedLineType::Renban => (cells.len() <= size).then_some(Line::Renban),
                })
                .collect();
            compiled.push(Path {
                cells: cells.clone(),
                types,
            });
        }

        let mut choices = Vec::new();
        for first in 0..types.len() {
            for second in 0..types.len() {
                if first == second {
                    continue;
                }
                let third = if types.len() == 3 {
                    3 - first - second
                } else {
                    0
                };
                let choice = [first, second, third];
                if compiled
                    .iter()
                    .zip(choice)
                    .all(|(path, kind)| path.types[kind].is_some())
                {
                    choices.push(choice);
                }
            }
        }
        let cells = used
            .into_iter()
            .enumerate()
            .filter_map(|(cell, used)| used.then_some(cell))
            .collect();
        Some(Self {
            cells,
            paths: compiled,
            choices,
            size,
            has_overlap,
        })
    }

    pub fn support(&self, domains: &[u16]) -> Option<AssignmentSupport> {
        let mut options = [[[0; MAX_CELLS]; MAX_TYPES]; MAX_TYPES];
        let mut feasible = [0u8; MAX_TYPES];
        for (path, (options, feasible)) in
            self.paths.iter().zip(options.iter_mut().zip(&mut feasible))
        {
            for (kind, (line, masks)) in path.types.iter().zip(options).enumerate() {
                if line
                    .as_ref()
                    .is_none_or(|line| !line.support(self.size, &path.cells, domains, masks))
                {
                    continue;
                }
                *feasible |= 1 << kind;
            }
        }
        let mut masks = [0; MAX_CELLS];
        let mut surviving = 0;
        let mut common = [0; MAX_CELLS];
        for (index, choice) in self.choices.iter().enumerate() {
            if feasible
                .iter()
                .zip(choice)
                .take(self.paths.len())
                .any(|(mask, kind)| mask & (1 << kind) == 0)
            {
                continue;
            }
            for &cell in &self.cells {
                common[cell] = domains[cell];
            }
            for (path, (options, &kind)) in self.paths.iter().zip(options.iter().zip(choice)) {
                for &cell in &path.cells {
                    common[cell] &= options[kind][cell];
                }
            }
            if self.cells.iter().any(|&cell| common[cell] == 0)
                || self.has_overlap && !self.restrict_assignment(choice, &mut common)
            {
                continue;
            }
            surviving |= 1 << index;
            for &cell in &self.cells {
                masks[cell] |= common[cell];
            }
        }
        (surviving != 0).then_some(AssignmentSupport { masks, surviving })
    }

    fn restrict_assignment(&self, choice: &[usize; MAX_TYPES], domains: &mut [u16]) -> bool {
        let mut masks = [0; MAX_CELLS];
        loop {
            let mut changed = false;
            for (path, &kind) in self.paths.iter().zip(choice) {
                let Some(line) = &path.types[kind] else {
                    return false;
                };
                if !line.support(self.size, &path.cells, domains, &mut masks) {
                    return false;
                }
                for &cell in &path.cells {
                    let allowed = domains[cell] & masks[cell];
                    changed |= domains[cell] != allowed;
                    domains[cell] = allowed;
                }
            }
            if !changed {
                return true;
            }
        }
    }
}

impl Line {
    fn support(&self, size: usize, cells: &[usize], domains: &[u16], masks: &mut [u16]) -> bool {
        match self {
            Self::Entropic(line) => {
                let Some(support) = line.support(domains) else {
                    return false;
                };
                for (&cell, mask) in line.cells.iter().zip(support) {
                    masks[cell] = mask;
                }
                true
            }
            Self::RegionSum(line) => {
                let totals = line.totals(domains);
                line.support_at_totals(domains, masks, totals)
            }
            Self::Renban => {
                let mut support = [0; MAX_SIZE];
                if size <= 6 {
                    crate::variant::renban_support::<6, 64>(
                        &cells.iter().map(|&cell| domains[cell]).collect::<Vec<_>>(),
                        &mut support[..cells.len()],
                    );
                } else if size <= 9 || cells.len() <= 3 {
                    crate::variant::renban_support::<9, 512>(
                        &cells.iter().map(|&cell| domains[cell]).collect::<Vec<_>>(),
                        &mut support[..cells.len()],
                    );
                } else {
                    crate::variant::wide_renban_support(
                        size,
                        &cells.iter().map(|&cell| domains[cell]).collect::<Vec<_>>(),
                        &mut support[..cells.len()],
                    );
                }
                if support[..cells.len()].contains(&0) {
                    return false;
                }
                for (&cell, mask) in cells.iter().zip(support) {
                    masks[cell] = mask;
                }
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::GridSpec;

    #[test]
    fn shared_cell_support_matches_full_enumeration() {
        let layout = SizedGrid::new(GridSpec {
            size: 4,
            box_rows: 2,
            box_columns: 2,
        })
        .unwrap();
        let paths = [vec![0, 1, 4], vec![4, 2, 3]];
        let assignments = LineAssignments::compile(
            &layout,
            &paths,
            &[
                SizedLineType::Entropic {
                    groups: vec![vec![1], vec![2], vec![3, 4]],
                },
                SizedLineType::Renban,
            ],
        )
        .unwrap();
        for seed in 0..96u32 {
            let domains: [u16; 16] = std::array::from_fn(|cell| {
                (((seed.wrapping_mul(3_575).wrapping_add(12_937)) as u16)
                    .rotate_right((cell * 3) as u32)
                    & 15)
                    | 1
            });
            let mut allowed = [0; 5];
            let mut viable = 0;
            for packed in 0..(1 << 10) {
                let ranks: [u8; 5] =
                    std::array::from_fn(|cell| 1 + ((packed >> (cell * 2)) & 3) as u8);
                if ranks
                    .iter()
                    .zip(domains)
                    .any(|(&rank, mask)| mask & (1 << (rank - 1)) == 0)
                {
                    continue;
                }
                let line = |path: &[usize]| {
                    let mut ranks = [ranks[path[0]], ranks[path[1]], ranks[path[2]]];
                    ranks.sort_unstable();
                    (
                        ranks[0] == 1 && ranks[1] == 2 && ranks[2] >= 3,
                        ranks[1] == ranks[0] + 1 && ranks[2] == ranks[1] + 1,
                    )
                };
                let (left, right) = (line(&paths[0]), line(&paths[1]));
                let choices = u8::from(left.0 && right.1) | (u8::from(left.1 && right.0) << 1);
                if choices != 0 {
                    viable |= choices;
                    for (mask, rank) in allowed.iter_mut().zip(ranks) {
                        *mask |= 1 << (rank - 1);
                    }
                }
            }
            let support = assignments.support(&domains);
            assert_eq!(
                support.as_ref().map(|support| support.surviving),
                (viable != 0).then_some(viable)
            );
            if let Some(support) = support {
                assert_eq!(support.masks[..5], allowed);
            }
        }
    }
}
