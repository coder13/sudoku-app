use super::{PuzzleRule, VariantPosition, cell_mask};
use crate::{CELLS, DIGITS};

/// The givens, rules, and candidate removals a player can use in a fog puzzle.
///
/// The puzzle's region layout and the player's placed digits are public.
/// A reveal policy can update this value without changing the full puzzle.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Deserialize, serde::Serialize),
    serde(deny_unknown_fields, rename_all = "camelCase")
)]
pub struct VariantVisibility {
    /// Cell indices whose givens are visible.
    pub cells: Vec<usize>,
    /// Indices of the visible constraints in the original puzzle's rule list.
    pub rules: Vec<usize>,
    /// The reveal policy confirms that all Kropki markers are visible.
    #[cfg_attr(feature = "wasm-api", serde(default))]
    pub complete_kropki: bool,
    /// The reveal policy confirms that all XV markers are visible,
    /// including generic adjacent totals of five and ten.
    #[cfg_attr(feature = "wasm-api", serde(default))]
    pub complete_xv: bool,
    /// Candidate removals established from clues the player has seen.
    #[cfg_attr(
        feature = "wasm-api",
        serde(default = "super::wire::empty_masks", with = "super::wire::masks")
    )]
    pub known_removals: [u16; CELLS],
}

impl VariantVisibility {
    /// Start with no revealed givens, rules, or candidate removals.
    pub fn new() -> Self {
        Self {
            cells: Vec::new(),
            rules: Vec::new(),
            complete_kropki: false,
            complete_xv: false,
            known_removals: [0; CELLS],
        }
    }
}

impl Default for VariantVisibility {
    fn default() -> Self {
        Self::new()
    }
}

/// Invalid visibility metadata for a fog puzzle.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VariantVisibilityError {
    /// The visible cell list has duplicate or out-of-range indices.
    InvalidCells,
    /// The visible rule list has duplicate or out-of-range indices.
    InvalidRules,
    /// The visibility claims that all markers of a family are visible, with some still hidden.
    HiddenMarkers,
    /// A candidate removal mask contains bits outside digits 1–9.
    InvalidRemovals,
}

impl VariantPosition {
    /// Create a position whose proof search can use only information exposed to the player.
    ///
    /// Proof rule indices refer to the returned position's rule list. A rule is visible
    /// as a unit. Author separate cage or line rules when they reveal independently.
    /// Negative marker rules apply only after the full marker family is visible.
    pub fn visible(&self, visibility: &VariantVisibility) -> Result<Self, VariantVisibilityError> {
        use VariantVisibilityError::*;
        let revealed = cell_mask(&visibility.cells).ok_or(InvalidCells)?;
        let mut visible_rules = vec![false; self.puzzle.rules.len()];
        for &rule in &visibility.rules {
            let visible = visible_rules.get_mut(rule).ok_or(InvalidRules)?;
            if std::mem::replace(visible, true) {
                return Err(InvalidRules);
            }
        }
        if visibility
            .known_removals
            .iter()
            .any(|&mask| mask & !DIGITS != 0)
        {
            return Err(InvalidRemovals);
        }
        let mut position = self.clone();
        for (cell, digit) in position.puzzle.givens.iter_mut().enumerate() {
            if revealed & (1u128 << cell) == 0 {
                *digit = 0;
            }
        }
        let rules = std::mem::take(&mut position.puzzle.rules);
        for (mut rule, visible) in rules.into_iter().zip(visible_rules) {
            match &mut rule {
                PuzzleRule::Kropki {
                    consecutive,
                    ratio_two,
                } => {
                    if visibility.complete_kropki && !visible {
                        return Err(HiddenMarkers);
                    }
                    consecutive.negative &= visibility.complete_kropki;
                    ratio_two.negative &= visibility.complete_kropki;
                }
                PuzzleRule::Xv { five, ten } => {
                    if visibility.complete_xv && !visible {
                        return Err(HiddenMarkers);
                    }
                    five.negative &= visibility.complete_xv;
                    ten.negative &= visibility.complete_xv;
                }
                PuzzleRule::AdjacentTotal { sum: 5 | 10, .. }
                    if visibility.complete_xv && !visible =>
                {
                    return Err(HiddenMarkers);
                }
                _ => {}
            }
            if visible {
                position.puzzle.rules.push(rule);
            }
        }
        position.eliminations = visibility.known_removals;
        Ok(position)
    }
}
