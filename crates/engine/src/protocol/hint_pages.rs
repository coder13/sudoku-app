use super::{HintWithPattern, ResultValue};
use crate::{CELLS, Hint};
use serde::Serialize;
use std::cell::RefCell;

const PAGE_SIZE: usize = 8;

// Keep one exhaustive result per worker. Other hints and zero-limit candidate
// requests do not replace it. A session ID protects against stale UI requests.
thread_local! {
    static SESSION: RefCell<Option<(u32, Choices)>> = const { RefCell::new(None) };
}

pub(super) enum Choices {
    Classic(Vec<Hint>, [u16; CELLS]),
    #[cfg(feature = "variants")]
    Variant(Vec<crate::VariantDeduction>),
}

#[derive(Serialize)]
pub(super) struct Page<T> {
    offset: usize,
    available: usize,
    choices: Vec<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    candidates: Option<Vec<u16>>,
}

#[derive(Serialize)]
#[serde(untagged)]
pub(super) enum HintPage {
    Classic(Page<HintWithPattern>),
    #[cfg(feature = "variants")]
    Variant(Page<crate::VariantDeduction>),
}

impl Choices {
    fn page(&self, index: usize, first: bool) -> ResultValue<HintPage> {
        let available = match self {
            Self::Classic(hints, _) => hints.len(),
            #[cfg(feature = "variants")]
            Self::Variant(hints) => hints.len(),
        };
        if index >= available && !(first && available == 0) {
            return Err(("invalid-hint-index", "Choose a hint from this result."));
        }
        let offset = index / PAGE_SIZE * PAGE_SIZE;
        let end = (offset + PAGE_SIZE).min(available);
        Ok(match self {
            Self::Classic(hints, masks) => HintPage::Classic(Page {
                offset,
                available,
                choices: hints[offset..end]
                    .iter()
                    .cloned()
                    .map(|hint| HintWithPattern::new(hint, masks))
                    .collect(),
                candidates: first.then(|| masks.to_vec()),
            }),
            #[cfg(feature = "variants")]
            Self::Variant(hints) => HintPage::Variant(Page {
                offset,
                available, choices: hints[offset..end].to_vec(), candidates: None,
            }),
        })
    }
}

pub(super) fn start(id: u32, hints: Choices) -> ResultValue<HintPage> {
    let page = hints.page(0, true)?;
    SESSION.with_borrow_mut(|slot| *slot = Some((id, hints)));
    Ok(page)
}

pub(super) fn read(id: u32, index: usize) -> ResultValue<HintPage> {
    SESSION.with_borrow(|slot| {
        let (_, hints) = slot.as_ref().filter(|(current, _)| *current == id)
            .ok_or(("expired-hints", "Analyze the moves again to load this hint."))?;
        hints.page(index, false)
    })
}

pub(super) fn release(id: u32) {
    SESSION.with_borrow_mut(|slot| {
        if slot.as_ref().is_some_and(|(current, _)| *current == id) {
            *slot = None;
        }
    });
}
