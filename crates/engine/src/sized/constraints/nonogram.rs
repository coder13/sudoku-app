use super::MAX_SIZE;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(rename_all = "kebab-case")
)]
pub enum RunAxis {
    Row,
    Column,
}

/// Recognizes the ordered lengths of runs of selected digits along one house.
#[derive(Debug)]
pub(super) struct NonogramLine {
    pub(super) cells: Vec<usize>,
    marked: u16,
    stay: u32,
    advance_on_gap: u32,
    advance_on_mark: u32,
    end: u32,
}

impl NonogramLine {
    pub(super) fn compile(
        size: usize,
        axis: RunAxis,
        index: usize,
        digits: &[u8],
        runs: &[u8],
    ) -> Option<Self> {
        if index >= size
            || digits.is_empty()
            || digits.len() > size
            || runs.is_empty()
            || runs.len() > size
            || runs.contains(&0)
        {
            return None;
        }
        let mut marked = 0u16;
        for &digit in digits {
            if digit == 0 || usize::from(digit) > size || marked & (1 << (digit - 1)) != 0 {
                return None;
            }
            marked |= 1 << (digit - 1);
        }
        if runs.iter().map(|&run| usize::from(run)).sum::<usize>() != digits.len()
            || digits.len() + runs.len() - 1 > size
        {
            return None;
        }
        // States count consumed marks and mandatory separators. Extra gaps may
        // repeat before the first mark, after a separator, or after the last mark.
        let mut stay = 1;
        let mut advance_on_gap = 0;
        let mut advance_on_mark = 0;
        let mut at = 0;
        for (i, &run) in runs.iter().enumerate() {
            if i != 0 {
                advance_on_gap |= 1 << at;
                at += 1;
                stay |= 1 << at;
            }
            advance_on_mark |= ((1u32 << run) - 1) << at;
            at += run;
        }
        let end = 1 << at;
        stay |= end;
        let cells = (0..size)
            .map(|offset| match axis {
                RunAxis::Row => index * size + offset,
                RunAxis::Column => offset * size + index,
            })
            .collect();
        Some(Self {
            cells,
            marked,
            stay,
            advance_on_gap,
            advance_on_mark,
            end,
        })
    }

    fn advance(&self, states: u32, domain: u16) -> u32 {
        let mut next = 0;
        if domain & self.marked != 0 {
            next |= (states & self.advance_on_mark) << 1;
        }
        if domain & !self.marked != 0 {
            next |= (states & self.stay) | ((states & self.advance_on_gap) << 1);
        }
        next
    }

    /// Compute every mark and gap supported by a full path through the run clue.
    pub(super) fn support(&self, domains: &[u16]) -> Option<[u16; MAX_SIZE]> {
        let mut forward = [0; MAX_SIZE + 1];
        forward[0] = 1;
        for (i, &cell) in self.cells.iter().enumerate() {
            forward[i + 1] = self.advance(forward[i], domains[cell]);
        }
        if forward[self.cells.len()] & self.end == 0 {
            return None;
        }
        let mut suffix = self.end;
        let mut support = [0; MAX_SIZE];
        for (i, &cell) in self.cells.iter().enumerate().rev() {
            let digit_mask = domains[cell];
            let mark_sources = (suffix >> 1) & self.advance_on_mark;
            let gap_sources = (suffix & self.stay) | ((suffix >> 1) & self.advance_on_gap);
            suffix = 0;
            if digit_mask & self.marked != 0 {
                suffix |= mark_sources;
                if forward[i] & mark_sources != 0 {
                    support[i] |= digit_mask & self.marked;
                }
            }
            if digit_mask & !self.marked != 0 {
                suffix |= gap_sources;
                if forward[i] & gap_sources != 0 {
                    support[i] |= digit_mask & !self.marked;
                }
            }
        }
        Some(support)
    }

    pub(super) fn permits(&self, digits: &[u8]) -> bool {
        let states = self.cells.iter().fold(1, |states, &cell| {
            self.advance(
                states,
                if digits[cell] == 0 {
                    u16::MAX
                } else {
                    1 << (digits[cell] - 1)
                },
            )
        });
        states & self.end != 0
    }
}
