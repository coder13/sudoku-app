use super::{
    ControlFlow, Deduction, HintEvidence, House, Technique, bit_indices, cell_bit, cells, report,
};
use crate::{DIGITS, hints::visit_unions};

pub(super) type Lines = [[u16; 9]; 9];

pub(super) fn line_masks(positions: &[u128; 9]) -> [Lines; 2] {
    let mut rows = [[0; 9]; 9];
    let mut columns = [[0; 9]; 9];
    for (digit, &positions) in positions.iter().enumerate() {
        for cell in cells(positions) {
            let (row, col) = (cell / 9, cell % 9);
            rows[digit][row] |= 1 << col;
            columns[digit][col] |= 1 << row;
        }
    }
    [rows, columns]
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum Kind {
    Basic,
    Finned,
    Sashimi,
}

#[derive(Clone, Copy)]
pub(super) struct Rule {
    technique: Technique,
    size: u32,
    kind: Kind,
}

impl Rule {
    pub(super) fn for_technique(technique: Technique) -> Option<Self> {
        let (size, kind) = match technique {
            Technique::XWing => (2, Kind::Basic),
            Technique::Swordfish => (3, Kind::Basic),
            Technique::Jellyfish => (4, Kind::Basic),
            Technique::FinnedXWing => (2, Kind::Finned),
            Technique::FinnedSwordfish => (3, Kind::Finned),
            Technique::FinnedJellyfish => (4, Kind::Finned),
            Technique::SashimiXWing => (2, Kind::Sashimi),
            Technique::SashimiSwordfish => (3, Kind::Sashimi),
            Technique::SashimiJellyfish => (4, Kind::Sashimi),
            _ => return None,
        };
        Some(Self {
            technique,
            size,
            kind,
        })
    }

    pub(super) fn visit(
        self,
        lines: &[Lines; 2],
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        for (axis, digits) in [Axis::Row, Axis::Column].into_iter().zip(lines) {
            for (index, masks) in digits.iter().enumerate() {
                let fish = FishSearch {
                    rule: self,
                    axis,
                    lines: masks,
                    digit: index as u8 + 1,
                };
                match self.kind {
                    Kind::Basic => fish.basic(visit)?,
                    Kind::Finned | Kind::Sashimi => fish.finned(visit)?,
                }
            }
        }
        ControlFlow::Continue(())
    }
}

#[derive(Clone, Copy)]
enum Axis {
    Row,
    Column,
}

impl Axis {
    fn base(self, index: usize) -> House {
        match self {
            Self::Row => House::Row(index),
            Self::Column => House::Column(index),
        }
    }

    fn cover(self, index: usize) -> House {
        match self {
            Self::Row => House::Column(index),
            Self::Column => House::Row(index),
        }
    }

    fn cell(self, base: usize, cover: usize) -> usize {
        match self {
            Self::Row => base * 9 + cover,
            Self::Column => cover * 9 + base,
        }
    }
}

struct FishSearch<'a> {
    rule: Rule,
    axis: Axis,
    lines: &'a [u16; 9],
    digit: u8,
}

impl FishSearch<'_> {
    fn basic(
        &self,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let size = self.rule.size;
        let eligible = mask_where(|line| (2..=size).contains(&self.lines[line].count_ones()));
        visit_unions::<true>(
            self.lines,
            eligible,
            size,
            size,
            0,
            0,
            &mut |bases, covers| {
                let targets = self.cells_in(!bases & DIGITS, covers);
                self.report(bases, covers, 0, targets, visit)
            },
        )
    }

    fn finned(
        &self,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let eligible = mask_where(|line| self.lines[line].count_ones() >= 2);
        if eligible.count_ones() < self.rule.size {
            return ControlFlow::Continue(());
        }

        // The target is outside the bases and the fins are outside the covers.
        // A target can therefore see a fin only through their common box.
        for box_bases in BOX_SEGMENTS {
            for box_covers in BOX_SEGMENTS {
                let occupied = mask_where(|line| self.lines[line] & box_covers != 0) & box_bases;
                if occupied.count_ones() < 2 || occupied & eligible == 0 {
                    continue;
                }
                self.finned_in_box(eligible, box_bases, box_covers, visit)?;
            }
        }
        ControlFlow::Continue(())
    }

    fn finned_in_box(
        &self,
        eligible: u16,
        box_bases: u16,
        box_covers: u16,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        let size = self.rule.size;
        let mandatory = std::array::from_fn(|line| {
            let outside = if box_bases & (1 << line) == 0 {
                DIGITS
            } else {
                !box_covers
            };
            self.lines[line] & outside
        });

        visit_unions::<false>(
            &mandatory,
            eligible,
            size,
            size,
            0,
            0,
            &mut |bases, required_covers| {
                let fin_bases = bases & box_bases;
                let target_bases = !bases & box_bases;
                let optional = self.union_covers(fin_bases) & !required_covers;
                if optional == 0 || target_bases == 0 {
                    return ControlFlow::Continue(());
                }

                let target_covers = self.union_covers(target_bases) & box_covers;
                let needed = size - required_covers.count_ones();
                if optional.count_ones() <= needed
                    || target_covers & (required_covers | optional) == 0
                {
                    return ControlFlow::Continue(());
                }

                // Optional covers all pass through the fin box, so there are at most three.
                let mut extras = optional;
                loop {
                    let covers = required_covers | extras;
                    if extras.count_ones() == needed && covers & target_covers != 0 {
                        let mut sashimi = false;
                        let has_core = bit_indices(bases).all(|line| {
                            let count = (self.lines[line] & covers).count_ones();
                            sashimi |= count == 1;
                            count != 0
                        });
                        if has_core && sashimi == (self.rule.kind == Kind::Sashimi) {
                            let fins = self.cells_in(fin_bases, box_covers & !covers);
                            let targets = self.cells_in(target_bases, box_covers & covers);
                            self.report(bases, covers, fins, targets, visit)?;
                        }
                    }
                    if extras == 0 {
                        break;
                    }
                    extras = (extras - 1) & optional;
                }
                ControlFlow::Continue(())
            },
        )
    }

    fn union_covers(&self, bases: u16) -> u16 {
        bit_indices(bases).fold(0, |union, line| union | self.lines[line])
    }

    fn cells_in(&self, bases: u16, covers: u16) -> u128 {
        bit_indices(bases).fold(0, |set, base| {
            bit_indices(self.lines[base] & covers).fold(set, |set, cover| {
                set | cell_bit(self.axis.cell(base, cover))
            })
        })
    }

    fn report(
        &self,
        bases: u16,
        covers: u16,
        fins: u128,
        targets: u128,
        visit: &mut impl FnMut(Deduction) -> ControlFlow<Deduction>,
    ) -> ControlFlow<Deduction> {
        report(visit, self.rule.technique, targets, self.digit, || {
            if self.rule.technique == Technique::XWing {
                HintEvidence::XWing {
                    digit: self.digit,
                    bases: endpoints(bases).map(|index| self.axis.base(index)),
                    covers: endpoints(covers).map(|index| self.axis.cover(index)),
                }
            } else {
                HintEvidence::Fish {
                    digit: self.digit,
                    bases: bit_indices(bases)
                        .map(|index| self.axis.base(index))
                        .collect(),
                    covers: bit_indices(covers)
                        .map(|index| self.axis.cover(index))
                        .collect(),
                    fins: cells(fins).collect(),
                }
            }
        })
    }
}

const BOX_SEGMENTS: [u16; 3] = [0b000_000_111, 0b000_111_000, 0b111_000_000];

fn mask_where(mut include: impl FnMut(usize) -> bool) -> u16 {
    (0..9)
        .filter(|&line| include(line))
        .fold(0, |mask, line| mask | (1 << line))
}

fn endpoints(bits: u16) -> [usize; 2] {
    [bits.trailing_zeros() as usize, bits.ilog2() as usize]
}
