use super::{LogicalSolve, SolveStatus, solve_position, traced_solve};
use crate::hints::unique_layouts;
use crate::position::Position;
use crate::{
    Analysis, Board, CELLS, Candidate, HintAction, HintError, PositionSnapshot, Technique,
    candidates,
};

/// The eight layouts in ascending digit order, skipping the omitted digit.
/// Each layout lists its nine cell indices in ascending order.
#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "wasm-api",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct EightDigitOverlayProof {
    pub omitted_digit: u8,
    pub layouts: [Vec<usize>; 8],
}

/// The jointly forced placements at a stall, certified by exhaustive overlay.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EightDigitOverlayCompletion {
    pub solution: Board,
    pub actions: Vec<HintAction>,
    pub proof: EightDigitOverlayProof,
}

/// A named solve and an exhaustive completion when the named path stalls.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompleteClassicSolve {
    pub named: LogicalSolve,
    pub completion: Option<EightDigitOverlayCompletion>,
}

/// Finish a uniquely solvable classic puzzle with no search or layout cap.
/// The named rating records only deductions in the supplied profile.
pub fn solve_position_completely(
    snapshot: &PositionSnapshot,
    order: &[Technique],
) -> Result<CompleteClassicSolve, HintError> {
    let named = match solve_position(snapshot, order) {
        Err(HintError::Puzzle(Analysis::SearchLimit)) => {
            let board = snapshot.values().map_err(HintError::Puzzle)?;
            let verified = overlay(&board, None, None)?;
            let mut position = Position::known_unique(&board);
            if !position.retain_eliminations(&snapshot.eliminations, &verified.solution) {
                return Err(HintError::InvalidEliminations);
            }
            traced_solve(snapshot.clone(), position, order).map_err(HintError::Puzzle)?
        }
        result => result?,
    };
    let completion = if named.status == SolveStatus::Stalled {
        let final_position = named.positions().last().unwrap();
        Some(overlay(&named.board, final_position.removals(), None)?)
    } else {
        None
    };
    Ok(CompleteClassicSolve { named, completion })
}

/// Recheck the certificate against the placed digits and independently
/// exhaust all alternative packings. Established removals must agree with
/// the unique solution even when supplied by an external caller.
pub fn replay_eight_digit_overlay_at(
    snapshot: &PositionSnapshot,
    proof: &EightDigitOverlayProof,
) -> Result<bool, HintError> {
    let board = snapshot.values().map_err(HintError::Puzzle)?;
    if !(1..=9).contains(&proof.omitted_digit) {
        return Ok(false);
    }
    let verified = overlay(&board, None, Some(usize::from(proof.omitted_digit - 1)))?;
    if !Position::known_unique(&board)
        .retain_eliminations(&snapshot.eliminations, &verified.solution)
    {
        return Err(HintError::InvalidEliminations);
    }
    Ok(&verified.proof == proof)
}

fn overlay(
    board: &Board,
    removals: Option<&[u16; CELLS]>,
    omitted: Option<usize>,
) -> Result<EightDigitOverlayCompletion, HintError> {
    let mut masks = candidates(board).ok_or(HintError::Puzzle(Analysis::Conflict))?;
    // By default leave out the digit with the most legal sites.
    let omitted = omitted.unwrap_or_else(|| {
        (0..9)
            .max_by_key(|&digit| {
                masks
                    .iter()
                    .filter(|&&mask| mask & (1 << digit) != 0)
                    .count()
            })
            .unwrap()
    });
    if let Some(removals) = removals {
        for (mask, removed) in masks.iter_mut().zip(removals) {
            *mask &= !removed;
        }
    }

    let layouts = unique_layouts(board, &masks, omitted).map_err(HintError::Puzzle)?;
    let sites = layouts.map(|mask| (0..CELLS).filter(move |&cell| mask & (1 << cell) != 0));
    let mut solution = [0; CELLS];
    let mut proof_layouts = Vec::with_capacity(8);
    for (digit, cells) in sites.into_iter().enumerate() {
        let cells: Vec<_> = cells.collect();
        for &cell in &cells {
            solution[cell] = digit as u8 + 1;
        }
        if digit != omitted {
            proof_layouts.push(cells);
        }
    }
    let actions = board
        .iter()
        .enumerate()
        .filter(|&(_, &digit)| digit == 0)
        .map(|(cell, _)| {
            HintAction::Place(Candidate {
                cell,
                digit: solution[cell],
            })
        })
        .collect();
    Ok(EightDigitOverlayCompletion {
        solution,
        actions,
        proof: EightDigitOverlayProof {
            omitted_digit: omitted as u8 + 1,
            layouts: proof_layouts.try_into().unwrap(),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_givens;

    const HARD: &str =
        "000000012000003004004020500001060005070008000300900000006010020080006000900700600";
    const SOLUTION: &str =
        "567489312129573864834621597291367485675148239348952176756814923483296751912735648";

    #[test]
    fn the_complement_produces_the_same_completion_for_each_omitted_digit() {
        let board = parse_givens(HARD).unwrap();
        let expected = parse_givens(SOLUTION).unwrap();
        let masks = candidates(&board).unwrap();
        for omitted in 0..9 {
            let layouts = unique_layouts(&board, &masks, omitted).unwrap();
            let occupied = layouts
                .iter()
                .enumerate()
                .filter(|&(digit, _)| digit != omitted)
                .fold(0, |cells, (_, layout)| cells | layout);
            assert_eq!(occupied.count_ones(), 72);
            assert_eq!(layouts[omitted], ((1 << 81) - 1) & !occupied);
            for (cell, digit) in expected.into_iter().enumerate() {
                assert_ne!(layouts[usize::from(digit - 1)] & (1 << cell), 0);
            }
            let completion = overlay(&board, None, Some(omitted)).unwrap();
            assert_eq!(completion.solution, expected);
            assert!(
                replay_eight_digit_overlay_at(&PositionSnapshot::new(board), &completion.proof)
                    .unwrap()
            );
        }
    }

    #[test]
    fn distinguishes_no_completion_and_multiple_completions() {
        let mut impossible = parse_givens(HARD).unwrap();
        impossible[19] = 1;
        assert_eq!(
            overlay(&impossible, None, None),
            Err(HintError::Puzzle(Analysis::Unsolvable))
        );
        let ambiguous = parse_givens(SOLUTION)
            .unwrap()
            .map(|digit| if digit >= 8 { 0 } else { digit });
        assert_eq!(
            overlay(&ambiguous, None, None),
            Err(HintError::Puzzle(Analysis::Multiple))
        );
    }
}
