use crate::{GenerationError, Random};

/// Progress reported at an attempt boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GenerationStep<T> {
    /// Continue advancing to search for a match.
    Pending {
        /// Attempts completed so far.
        attempts: u32,
    },
    /// The search found a puzzle that satisfies the request.
    Matched {
        /// Attempts completed, including the matching attempt.
        attempts: u32,
        /// The matching grid or rated puzzle.
        puzzle: T,
    },
    /// The search reached its budget without a match.
    Exhausted {
        /// Attempts completed before exhaustion.
        attempts: u32,
    },
    /// The caller cancelled the search.
    Cancelled {
        /// Attempts completed before cancellation.
        attempts: u32,
    },
}

type Attempt<'a, T> = dyn FnMut(&mut Random) -> Option<T> + 'a;

/// An owned search cursor. Each advance runs at most one attempt.
pub struct GenerationSearch<'a, T> {
    random: Random,
    attempt: Box<Attempt<'a, T>>,
    attempts: u32,
    budget: u32,
    finished: bool,
}

impl<'a, T> GenerationSearch<'a, T> {
    pub(crate) fn new(
        random: Random,
        budget: u32,
        attempt: impl FnMut(&mut Random) -> Option<T> + 'a,
    ) -> Self {
        Self {
            random,
            attempt: Box::new(attempt),
            attempts: 0,
            budget,
            finished: false,
        }
    }

    /// Return the next progress event. A terminal event closes the search.
    pub fn advance(&mut self) -> Option<GenerationStep<T>> {
        if self.finished {
            return None;
        }
        if self.attempts < self.budget {
            self.attempts += 1;
            if let Some(puzzle) = (self.attempt)(&mut self.random) {
                self.finished = true;
                return Some(GenerationStep::Matched {
                    attempts: self.attempts,
                    puzzle,
                });
            }
            if self.attempts < self.budget {
                return Some(GenerationStep::Pending {
                    attempts: self.attempts,
                });
            }
        }
        self.finished = true;
        Some(GenerationStep::Exhausted {
            attempts: self.attempts,
        })
    }

    /// Cancel at the current attempt boundary.
    pub fn cancel(&mut self) -> Option<GenerationStep<T>> {
        if self.finished {
            return None;
        }
        self.finished = true;
        Some(GenerationStep::Cancelled {
            attempts: self.attempts,
        })
    }

    pub(crate) fn finish(mut self) -> Result<T, GenerationError> {
        while let Some(step) = self.advance() {
            if let GenerationStep::Matched { puzzle, .. } = step {
                return Ok(puzzle);
            }
        }
        Err(GenerationError::SearchLimit)
    }

    /// Reject matched candidates without resetting the search budget or cursor.
    pub fn filter(mut self, mut accept: impl FnMut(&T) -> bool + 'a) -> Self
    where
        T: 'a,
    {
        let mut attempt = self.attempt;
        self.attempt = Box::new(move |random| attempt(random).filter(&mut accept));
        self
    }

    #[cfg(all(
        feature = "generation", feature = "wasm-api",
        any(target_arch = "wasm32", test, feature = "cli")
    ))]
    pub(crate) fn map<U>(self, mut convert: impl FnMut(T) -> U + 'a) -> GenerationSearch<'a, U>
    where
        T: 'a,
    {
        let Self {
            random,
            mut attempt,
            attempts,
            budget,
            finished,
        } = self;
        GenerationSearch {
            random,
            attempt: Box::new(move |random| attempt(random).map(&mut convert)),
            attempts,
            budget,
            finished,
        }
    }
}
