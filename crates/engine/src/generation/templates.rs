use std::sync::OnceLock;

use crate::{Analysis, Board, Technique, logical, parse_givens};

/// A set of givens and the solution proved unique for those givens.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedTemplate {
    givens: Board,
    solution: Board,
}

impl VerifiedTemplate {
    /// Check that the givens have one solution and retain it for repeated searches.
    pub fn verify(givens: Board) -> Result<Self, Analysis> {
        let solution = logical::verified_position(&givens)?
            .verified_solution()
            .ok_or(Analysis::SearchLimit)?;
        Ok(Self { givens, solution })
    }

    /// Borrow the original givens.
    pub fn givens(&self) -> &Board {
        &self.givens
    }

    /// Borrow the verified unique solution.
    pub fn solution(&self) -> &Board {
        &self.solution
    }
}

/// The supplied sparse and expert puzzles, verified once and shared across requests.
pub fn builtin_templates() -> &'static [VerifiedTemplate] {
    static POOL: OnceLock<[VerifiedTemplate; 17]> = OnceLock::new();
    POOL.get_or_init(|| {
        [
            // Gordon Royle's 17-clue collection. These also serve as generation benchmarks.
            "050040000000010040009000300100000080002005000000300000000700502480000000600000000",
            "000000021900040000800070000027600000000000930000000000050200000300000400000105000",
            "050040000000010040003000600100000090002005000000300000000800502490000000700000000",
            "000000012008030000000000040120500000000004700060000000507000300000620000000100000",
            "500600020040000000000000000083000400090000100000200000700040001200000050000908000",
            "100000480007250000000300000000000025600004000000030000320000000000800100000000600",
            // Expert fixtures retain their provenance in the practice catalog.
            Technique::MultiSectorLockedSets.practice_example().givens,
            Technique::Exocet.practice_example().givens,
            Technique::AlsXz.practice_example().givens,
            // Additional selections from Royle's collection, including high-scoring solves.
            "000000010400000000020000000000050407008000300001090000300400200050100000000806000",
            "000000012050400000000000030700600400001000000000080000920000800000510700000003000",
            "000320000700600000100000800000081000060000030000000020004000107030400000000000500",
            "000000054700020000000010000060000730005400000000000000170000200200300000000500008",
            "280030000000500040000000000300000802000407000000100000064000070000010300005000000",
            "300700020000001600000000000000200070016000000050000000800420300900000100000000500",
            "710050000000600050000000000000001400006000080200070000060800000003000200000000107",
            "601000000000500700000000000400000026050900000000070010530000400000002800000010000",
        ]
        .map(|text| {
            let givens = parse_givens(text).expect("a builtin template has 81 cells");
            VerifiedTemplate::verify(givens).expect("a builtin template has a unique solution")
        })
    })
}
