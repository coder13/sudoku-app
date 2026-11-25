use super::{LetteredQuadruple, PuzzleRule, VariantDefinitionError, VariantPuzzle, quadruple};
use crate::{Board, CELLS, DIGITS, hints::digit_bit, variant::lines::digit_set_support};

const SYMBOL_LAYOUTS: u8 = 32;
const SYMBOL_SEARCH_NODES: u32 = 150_000;

#[derive(Clone, Debug)]
pub(super) struct LetteredQuadruples {
    pub(super) rule: usize,
    clues: Vec<([usize; 4], Vec<u8>)>,
    // An exhaustive list or no list. A partial search cannot rule out a key.
    layouts: Option<Vec<Board>>,
}

impl LetteredQuadruples {
    pub(super) fn compile(
        puzzle: &VariantPuzzle,
        rule: usize,
        clues: &[LetteredQuadruple],
        enforce_regions: bool,
    ) -> Result<Self, VariantDefinitionError> {
        let invalid = VariantDefinitionError::InvalidRule(rule);
        if !(1..=64).contains(&clues.len()) {
            return Err(invalid);
        }
        let mut corners = [false; CELLS];
        let mut alphabet = Vec::new();
        for clue in clues {
            if quadruple::cells(clue.top_left).is_none()
                || std::mem::replace(&mut corners[clue.top_left], true)
                || !(1..=4).contains(&clue.letters.len())
                || !clue
                    .letters
                    .bytes()
                    .all(|letter| letter.is_ascii_uppercase())
            {
                return Err(invalid);
            }
            alphabet.extend(clue.letters.bytes());
        }
        alphabet.sort_unstable();
        alphabet.dedup();
        if alphabet.len() > 9 {
            return Err(invalid);
        }
        let encoded: Vec<_> = clues
            .iter()
            .map(|clue| {
                let cells = quadruple::cells(clue.top_left).expect("validated corner");
                let digits = clue
                    .letters
                    .bytes()
                    .map(|letter| alphabet.binary_search(&letter).expect("known letter") as u8 + 1)
                    .collect::<Vec<_>>();
                (cells, digits)
            })
            .collect();
        let mut symbolic = VariantPuzzle::classic([0; CELLS]);
        symbolic.regions = puzzle.regions.clone();
        symbolic
            .rules
            .extend(encoded.iter().map(|(cells, digits)| PuzzleRule::Quadruple {
                top_left: cells[0],
                digits: digits.clone(),
            }));
        // A bijection preserves equality and difference. Include constraints
        // justified without knowing the numeric identities of the letters.
        for other in &puzzle.rules {
            match other {
                PuzzleRule::Diagonal { .. }
                | PuzzleRule::ExtraHouse { .. }
                | PuzzleRule::DistinctCells { .. }
                | PuzzleRule::Clone { .. }
                | PuzzleRule::Palindrome { .. }
                | PuzzleRule::InsideGrid { .. }
                | PuzzleRule::AntiKnight { .. }
                | PuzzleRule::AntiKing { .. } => {
                    symbolic.rules.push(other.clone());
                }
                PuzzleRule::Whispers {
                    cells,
                    min_difference,
                } if *min_difference > 0 => {
                    for pair in cells.windows(2) {
                        symbolic.rules.push(PuzzleRule::DistinctCells {
                            cells: pair.to_vec(),
                            color: None,
                        });
                    }
                }
                PuzzleRule::KillerCages { cages, .. } => {
                    for cage in cages {
                        if cage.cells.len() == 9 {
                            symbolic.rules.push(PuzzleRule::ExtraHouse {
                                cells: cage.cells.clone(),
                            });
                        } else if cage.cells.len() >= 2 {
                            symbolic.rules.push(PuzzleRule::DistinctCells {
                                cells: cage.cells.clone(),
                                color: None,
                            });
                        }
                    }
                }
                _ => {}
            }
        }
        // If another rule is invalid the main compiler reports that error.
        // An unavailable projection leaves ordinary key checks available.
        let layouts = symbolic
            .compile_with_regions(enforce_regions)
            .ok()
            .and_then(|grid| grid.complete_bounded(SYMBOL_LAYOUTS, SYMBOL_SEARCH_NODES));
        Ok(Self {
            rule,
            clues: encoded,
            layouts,
        })
    }

    /// Check all printed occurrences and the shared key. On a completed grid
    /// this is exact: different letters are paired with different digits.
    pub(super) fn permits(&self, domains: &[u16; CELLS]) -> bool {
        let mut key = [DIGITS; 9];
        for (cells, letters) in &self.clues {
            let local = cells.map(|cell| domains[cell]);
            for &letter in letters {
                let slot = usize::from(letter - 1);
                let count = letters.iter().filter(|&&other| other == letter).count();
                for digit in crate::hints::digits(key[slot]) {
                    let bit = digit_bit(digit);
                    if local.iter().filter(|&&mask| mask & bit != 0).count() < count {
                        key[slot] &= !bit;
                    }
                }
            }
        }
        digit_set_support(DIGITS, &key, &mut [0; 9])
    }

    /// Match a single key for each complete symbolic layout. Candidate masks
    /// constrain every occurrence of a letter at once.
    pub(super) fn support(&self, domains: &[u16; CELLS]) -> Option<[u16; CELLS]> {
        let layouts = self.layouts.as_ref()?;
        let mut supported = [0; CELLS];
        for letters in layouts {
            let mut key = [DIGITS; 9];
            for (&letter, domain) in letters.iter().zip(domains) {
                key[usize::from(letter - 1)] &= domain;
            }
            let mut allowed = [0; 9];
            if digit_set_support(DIGITS, &key, &mut allowed) {
                for (mask, &letter) in supported.iter_mut().zip(letters) {
                    *mask |= allowed[usize::from(letter - 1)];
                }
                if supported == *domains {
                    break;
                }
            }
        }
        Some(supported)
    }

    pub(super) fn hint_support(&self, domains: &[u16; CELLS]) -> [u16; CELLS] {
        self.support(domains).unwrap_or_else(|| {
            let mut supported = *domains;
            let mut trial = *domains;
            for cell in 0..CELLS {
                if domains[cell].count_ones() < 2
                    || !self.clues.iter().any(|(cells, _)| cells.contains(&cell))
                {
                    continue;
                }
                for digit in crate::hints::digits(domains[cell]) {
                    let bit = digit_bit(digit);
                    trial[cell] = bit;
                    if !self.permits(&trial) {
                        supported[cell] &= !bit;
                    }
                }
                trial[cell] = domains[cell];
            }
            supported
        })
    }
}
