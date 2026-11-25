const ORDERS: [[usize; 3]; 6] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
];

#[derive(Debug)]
pub(super) struct EntropicLine {
    pub cells: Vec<usize>,
    groups: [u16; 3],
    phases: Vec<usize>,
    consistent: bool,
}

impl EntropicLine {
    pub fn compile(cells: &[usize], groups: [u16; 3], cell_count: usize) -> Option<Self> {
        if cells.len() < 3
            || cells.len() > cell_count + 1
            || cells.iter().any(|&cell| cell >= cell_count)
        {
            return None;
        }
        let mut phase_by_cell = vec![None; cell_count];
        let mut unique_cells = Vec::new();
        let mut phases = Vec::new();
        let mut consistent = true;
        for (index, &cell) in cells.iter().enumerate() {
            let phase = index % 3;
            if let Some(previous) = phase_by_cell[cell] {
                consistent &= previous == phase;
            } else {
                phase_by_cell[cell] = Some(phase);
                unique_cells.push(cell);
                phases.push(phase);
            }
        }
        Some(Self {
            cells: unique_cells,
            groups,
            phases,
            consistent,
        })
    }

    pub fn support(&self, domains: &[u16]) -> Option<Vec<u16>> {
        if !self.consistent {
            return None;
        }
        let mut supported = vec![0; self.cells.len()];
        for order in ORDERS {
            let mut branch = Vec::with_capacity(self.cells.len());
            for (&cell, &phase) in self.cells.iter().zip(&self.phases) {
                let mask = domains[cell] & self.groups[order[phase]];
                if mask == 0 {
                    branch.clear();
                    break;
                }
                branch.push(mask);
            }
            if branch.len() == self.cells.len() {
                for (total, mask) in supported.iter_mut().zip(branch) {
                    *total |= mask;
                }
            }
        }
        supported.iter().all(|&mask| mask != 0).then_some(supported)
    }

    pub fn permits(&self, digits: &[u8], full: u16) -> bool {
        let domains: Vec<u16> = digits
            .iter()
            .map(|&digit| if digit == 0 { full } else { 1 << (digit - 1) })
            .collect();
        self.support(&domains).is_some()
    }
}
