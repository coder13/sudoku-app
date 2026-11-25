mod line;
mod regions;

use super::{MAX_CELLS, MAX_SIZE, SizedGrid};
use crate::Analysis;
use crate::variant::ClueDirection;
use line::{CrustLine, DigitSets, Edges, EndClue};
use regions::RegionGeometry;

fn valid_sized_ray(cells: &[usize], direction: ClueDirection, diagonal: bool, size: usize) -> bool {
    let (dr, dc) = match direction {
        ClueDirection::North => (-1, 0),
        ClueDirection::East => (0, 1),
        ClueDirection::South => (1, 0),
        ClueDirection::West => (0, -1),
        ClueDirection::NorthEast => (-1, 1),
        ClueDirection::SouthEast => (1, 1),
        ClueDirection::SouthWest => (1, -1),
        ClueDirection::NorthWest => (-1, -1),
    };
    if (dr != 0 && dc != 0) != diagonal {
        return false;
    }
    let Some(&first) = cells.first().filter(|&&first| first < size * size) else {
        return false;
    };
    let (mut row, mut column) = ((first / size) as isize, (first % size) as isize);
    let in_grid = |row: isize, column: isize| {
        row >= 0 && column >= 0 && row < size as isize && column < size as isize
    };
    if in_grid(row - dr, column - dc) {
        return false;
    }
    for &cell in cells {
        if !in_grid(row, column) || cell != size * row as usize + column as usize {
            return false;
        }
        row += dr;
        column += dc;
    }
    !in_grid(row, column)
}

/// The total ends at a region boundary. `crossed` counts the earlier
/// boundaries inside the sum, excluding the boundary that ends it.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(deny_unknown_fields)
)]
pub struct CrustClue {
    pub direction: ClueDirection,
    pub cells: Vec<usize>,
    pub sum: u16,
    #[cfg_attr(
        feature = "wasm-api",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub crossed: Option<u8>,
}

#[derive(Debug)]
struct HouseLine {
    cells: Vec<usize>,
    equation: CrustLine,
}

#[derive(Clone, Copy, Debug)]
struct GridEdge {
    line: usize,
    bit: u16,
    cells: [usize; 2],
}

#[derive(Debug)]
pub(super) struct Crust {
    size: usize,
    clues: Vec<CrustClue>,
    shared_region: Option<[usize; 2]>,
    fixed_edges: Vec<[usize; 2]>,
    fixed_edge_domains: Vec<GridEdge>,
    sets: DigitSets,
    lines: Vec<HouseLine>,
    edges: Vec<GridEdge>,
    geometry: RegionGeometry,
}

impl Crust {
    pub(super) fn compile(
        layout: &SizedGrid,
        clues: &[CrustClue],
        shared_region: Option<[usize; 2]>,
        fixed_edges: &[[usize; 2]],
    ) -> Option<Self> {
        let size = layout.size();
        if clues.is_empty() || clues.len() > 4 * size {
            return None;
        }
        let mut ends = vec![[None; 2]; 2 * size];
        for clue in clues {
            if !valid_sized_ray(&clue.cells, clue.direction, false, size)
                || !(1..=(size * (size + 1) / 2) as u16).contains(&clue.sum)
                || clue.crossed.is_some_and(|count| usize::from(count) >= size)
            {
                return None;
            }
            let start = clue.cells[0];
            let (line, end) = match clue.direction {
                ClueDirection::East => (start / size, 0),
                ClueDirection::West => (start / size, 1),
                ClueDirection::South => (size + start % size, 0),
                ClueDirection::North => (size + start % size, 1),
                _ => return None,
            };
            if ends[line][end]
                .replace(EndClue {
                    total: clue.sum,
                    crossed: clue.crossed,
                })
                .is_some()
            {
                return None;
            }
        }
        let sets = DigitSets::new(size);
        let lines: Vec<_> = ends
            .into_iter()
            .enumerate()
            .map(|(line, ends)| HouseLine {
                cells: if line < size {
                    (line * size..(line + 1) * size).collect()
                } else {
                    (line - size..size * size).step_by(size).collect()
                },
                equation: CrustLine::compile(&sets, ends),
            })
            .collect();
        let edges: Vec<GridEdge> = lines
            .iter()
            .enumerate()
            .flat_map(|(line, house)| {
                house
                    .cells
                    .windows(2)
                    .enumerate()
                    .map(move |(edge, cells)| GridEdge {
                        line,
                        bit: 1 << edge,
                        cells: [cells[0], cells[1]],
                    })
            })
            .collect();
        if shared_region.is_some_and(|[a, b]| a >= size * size || b >= size * size || a == b) {
            return None;
        }
        let mut fixed_edge_domains = Vec::with_capacity(fixed_edges.len());
        for &[a, b] in fixed_edges {
            if a >= size * size
                || b >= size * size
                || (a / size).abs_diff(b / size) + (a % size).abs_diff(b % size) != 1
            {
                return None;
            }
            let edge = edges
                .iter()
                .find(|edge| edge.cells == [a, b] || edge.cells == [b, a])?;
            if fixed_edge_domains
                .iter()
                .any(|prior: &GridEdge| prior.line == edge.line && prior.bit == edge.bit)
            {
                return None;
            }
            fixed_edge_domains.push(*edge);
        }
        Some(Self {
            size,
            clues: clues.to_vec(),
            shared_region,
            fixed_edges: fixed_edges.to_vec(),
            fixed_edge_domains,
            sets,
            lines,
            edges,
            geometry: RegionGeometry::new(size),
        })
    }

    pub(super) fn partition(
        &self,
        ranks: &[u8],
        budget: &mut u32,
    ) -> Result<Option<Vec<Vec<usize>>>, Analysis> {
        self.geometry
            .partition(
                self.size,
                ranks,
                &self.clues,
                self.shared_region,
                &self.fixed_edges,
                budget,
            )
            .map_err(|_| Analysis::SearchLimit)
    }

    /// Propagate digit candidates and possible region boundaries in both
    /// directions until the houses and connected components agree.
    pub(super) fn restrict(&self, candidates: &mut [u16]) -> Option<bool> {
        let mut boundaries = [Edges::open(self.size); 2 * MAX_SIZE];
        for edge in &self.fixed_edge_domains {
            boundaries[edge.line].internal &= !edge.bit;
        }
        let mut narrower = false;
        loop {
            let mut changed = false;
            for (line, edges) in self.lines.iter().zip(&mut boundaries) {
                let mut input = [0; MAX_SIZE];
                for (&cell, mask) in line.cells.iter().zip(&mut input) {
                    *mask = candidates[cell];
                }
                let (digits, supported) =
                    line.equation
                        .support(&self.sets, &input[..self.size], *edges)?;
                changed |= *edges != supported;
                *edges = supported;
                for (&cell, mask) in line.cells.iter().zip(digits) {
                    narrower |= candidates[cell] != mask;
                    changed |= candidates[cell] != mask;
                    candidates[cell] = mask;
                }
            }
            let (region_edges, region_digits) =
                self.restrict_regions(&mut boundaries, candidates)?;
            narrower |= region_digits;
            if !changed && !region_edges && !region_digits {
                return Some(narrower);
            }
        }
    }

    fn restrict_regions(
        &self,
        boundaries: &mut [Edges],
        candidates: &mut [u16],
    ) -> Option<(bool, bool)> {
        let size = self.size;
        let count = size * size;
        let mut forced = Components::new();
        let mut possible = Components::new();
        for edge in &self.edges {
            let [a, b] = edge.cells;
            let domain = boundaries[edge.line];
            if domain.boundary & edge.bit == 0 {
                forced.merge(a, b);
            }
            if domain.internal & edge.bit != 0 {
                possible.merge(a, b);
            }
        }

        let mut known = [0u16; MAX_CELLS];
        let mut zone_digits = [0u16; MAX_CELLS];
        for (cell, &digit) in candidates[..count].iter().enumerate() {
            if digit == 0 {
                return None;
            }
            let component = forced.find(cell);
            let zone = possible.find(cell);
            if forced.sizes[component] > size || possible.sizes[zone] % size != 0 {
                return None;
            }
            zone_digits[zone] |= digit;
            if digit.count_ones() == 1 {
                if known[component] & digit != 0 {
                    return None;
                }
                known[component] |= digit;
            }
        }

        let mut narrowed = false;
        for (cell, mask) in candidates[..count].iter_mut().enumerate() {
            let root = forced.find(cell);
            let zone = possible.find(cell);
            if zone_digits[zone].count_ones() as usize != size {
                return None;
            }
            if mask.count_ones() > 1 {
                let allowed = *mask & !known[root];
                if allowed == 0 {
                    return None;
                }
                narrowed |= *mask != allowed;
                *mask = allowed;
            }
        }

        let mut changed = false;
        for edge in &self.edges {
            let [left, right] = edge.cells;
            let [a, b] = [forced.find(left), forced.find(right)];
            let zone = possible.find(left);
            let exact_zone = zone == possible.find(right) && possible.sizes[zone] == size;
            let domain = &mut boundaries[edge.line];
            let before = *domain;
            if a == b || exact_zone {
                domain.boundary &= !edge.bit;
            } else if forced.sizes[a] + forced.sizes[b] > size || known[a] & known[b] != 0 {
                domain.internal &= !edge.bit;
            }
            if (domain.boundary | domain.internal) & edge.bit == 0 {
                return None;
            }
            changed |= before != *domain;
        }
        Some((changed, narrowed))
    }
}

struct Components {
    parents: [usize; MAX_CELLS],
    sizes: [usize; MAX_CELLS],
}

impl Components {
    fn new() -> Self {
        Self {
            parents: std::array::from_fn(|cell| cell),
            sizes: [1; MAX_CELLS],
        }
    }

    fn find(&mut self, mut cell: usize) -> usize {
        while cell != self.parents[cell] {
            self.parents[cell] = self.parents[self.parents[cell]];
            cell = self.parents[cell];
        }
        cell
    }

    fn merge(&mut self, a: usize, b: usize) {
        let (mut a, mut b) = (self.find(a), self.find(b));
        if a == b {
            return;
        }
        if self.sizes[a] < self.sizes[b] {
            std::mem::swap(&mut a, &mut b);
        }
        self.parents[b] = a;
        self.sizes[a] += self.sizes[b];
    }
}
