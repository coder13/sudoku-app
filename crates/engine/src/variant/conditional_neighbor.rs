//! Conditional digit requirements on relative neighboring cells.

use super::{ConditionalNeighborAlternative, VariantDefinitionError};
use crate::{Board, CELLS, hints::digit_bit};

#[derive(Clone, Debug)]
pub(super) struct CompiledConditionalNeighbor {
    pub(super) rule_index: usize,
    pub source: usize,
    pub trigger_digit: u8,
    pub alternatives: Vec<(usize, u8)>,
}

impl CompiledConditionalNeighbor {
    pub fn compile(
        rule: usize,
        trigger_digit: u8,
        alternatives: &[ConditionalNeighborAlternative],
    ) -> Result<Vec<Self>, VariantDefinitionError> {
        if !(1..=9).contains(&trigger_digit) || alternatives.is_empty() || alternatives.len() > 8 {
            return Err(VariantDefinitionError::InvalidRule(rule));
        }
        let mut seen = std::collections::BTreeSet::new();
        for alternative in alternatives {
            if !(-1..=1).contains(&alternative.row_offset)
                || !(-1..=1).contains(&alternative.column_offset)
                || alternative.row_offset.abs() + alternative.column_offset.abs() != 1
                || !(1..=9).contains(&alternative.digit)
                || !seen.insert((alternative.row_offset, alternative.column_offset))
            {
                return Err(VariantDefinitionError::InvalidRule(rule));
            }
        }

        Ok((0..CELLS)
            .map(|source| {
                let row = (source / 9) as i8;
                let column = (source % 9) as i8;
                let alternatives = alternatives
                    .iter()
                    .filter_map(|alternative| {
                        let target_row = row + alternative.row_offset;
                        let target_column = column + alternative.column_offset;
                        (0..9)
                            .contains(&target_row)
                            .then_some(())
                            .filter(|_| (0..9).contains(&target_column))
                            .map(|()| {
                                (
                                    (target_row as usize) * 9 + target_column as usize,
                                    alternative.digit,
                                )
                            })
                    })
                    .collect();
                Self {
                    rule_index: rule,
                    source,
                    trigger_digit,
                    alternatives,
                }
            })
            .collect())
    }

    pub fn permits(&self, board: &Board) -> bool {
        board[self.source] != self.trigger_digit
            || self
                .alternatives
                .iter()
                .any(|&(cell, digit)| board[cell] == digit)
    }

    pub fn restrict(&self, board: &Board, masks: &mut [u16; CELLS]) -> Result<bool, ()> {
        let trigger = digit_bit(self.trigger_digit);
        if board[self.source] != 0 && board[self.source] != self.trigger_digit
            || board[self.source] == 0 && masks[self.source] & trigger == 0
        {
            return Ok(false);
        }
        if self
            .alternatives
            .iter()
            .any(|&(cell, digit)| board[cell] == digit)
        {
            return Ok(false);
        }

        let possible: Vec<_> = self
            .alternatives
            .iter()
            .copied()
            .filter(|&(cell, digit)| board[cell] == 0 && masks[cell] & digit_bit(digit) != 0)
            .collect();
        if possible.is_empty() {
            if board[self.source] != 0 {
                return Err(());
            }
            masks[self.source] &= !trigger;
            return (masks[self.source] != 0).then_some(true).ok_or(());
        }

        let source_forced =
            board[self.source] == self.trigger_digit || masks[self.source] == trigger;
        if source_forced && possible.len() == 1 {
            let (cell, digit) = possible[0];
            let required = digit_bit(digit);
            if masks[cell] != required {
                masks[cell] = required;
                return Ok(true);
            }
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compiled() -> CompiledConditionalNeighbor {
        CompiledConditionalNeighbor::compile(
            0,
            5,
            &[
                ConditionalNeighborAlternative {
                    row_offset: -1,
                    column_offset: 0,
                    digit: 1,
                },
                ConditionalNeighborAlternative {
                    row_offset: 1,
                    column_offset: 0,
                    digit: 9,
                },
            ],
        )
        .unwrap()[40]
            .clone()
    }

    #[test]
    fn checks_the_trigger_and_accepts_either_required_neighbor() {
        let rule = compiled();
        let mut board = [0; CELLS];
        board[40] = 5;
        assert!(!rule.permits(&board));
        board[31] = 1;
        assert!(rule.permits(&board));
        board[49] = 9;
        assert!(rule.permits(&board));
        board[31] = 2;
        assert!(rule.permits(&board));
        board[49] = 8;
        assert!(!rule.permits(&board));
    }

    #[test]
    fn propagates_the_only_possible_alternative_and_removes_an_impossible_trigger() {
        let rule = compiled();
        let mut board = [0; CELLS];
        let mut masks = [0x1ff; CELLS];
        board[40] = 5;
        board[31] = 2;
        assert!(rule.restrict(&board, &mut masks).unwrap());
        assert_eq!(masks[49], digit_bit(9));

        board[40] = 0;
        board[49] = 8;
        assert!(rule.restrict(&board, &mut masks).unwrap());
        assert_eq!(masks[40] & digit_bit(5), 0);
    }

    #[test]
    fn rejects_invalid_relative_positions() {
        for alternatives in [
            vec![],
            vec![ConditionalNeighborAlternative {
                row_offset: 0,
                column_offset: 0,
                digit: 1,
            }],
            vec![
                ConditionalNeighborAlternative {
                    row_offset: -1,
                    column_offset: 0,
                    digit: 1,
                },
                ConditionalNeighborAlternative {
                    row_offset: -1,
                    column_offset: 0,
                    digit: 9,
                },
            ],
            vec![ConditionalNeighborAlternative {
                row_offset: 0,
                column_offset: 2,
                digit: 1,
            }],
        ] {
            assert!(CompiledConditionalNeighbor::compile(0, 5, &alternatives).is_err());
        }
    }
}
