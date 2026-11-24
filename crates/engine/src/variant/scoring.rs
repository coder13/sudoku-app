//! Evidence-based point estimates for deductions that use variant rules.

use super::{
    PuzzleRule, VariantDeduction, VariantEvidence, VariantExclusionPremise, VariantTechnique,
};
use crate::{Technique, VariantPuzzle};

fn binary_choices(domains: &[u16]) -> u16 {
    domains
        .iter()
        .map(|domain| {
            let digits = domain.count_ones();
            debug_assert!(digits > 0);
            (u32::BITS - (digits.saturating_sub(1)).leading_zeros()) as u16
        })
        .sum()
}

pub(super) fn deduction_cost(deduction: &VariantDeduction, puzzle: &VariantPuzzle) -> u16 {
    use VariantTechnique::*;

    let (cells, domains, supporting_rules): (&[usize], &[u16], u16) = match &deduction.evidence {
        VariantEvidence::Classic { proof, .. } => {
            let VariantTechnique::Classic(technique) = deduction.technique else {
                return deduction.technique.cost();
            };
            return proof.estimated_cost(technique);
        }
        VariantEvidence::Single { .. } => return deduction.technique.cost(),
        VariantEvidence::Exclusion { premise, .. } => {
            let (base, alternatives, mut cells) = match premise {
                VariantExclusionPremise::Cell { cell, domain } => {
                    (14, domain.count_ones(), vec![*cell])
                }
                VariantExclusionPremise::House { cells, .. } => {
                    (12, cells.len() as u32, cells.clone())
                }
            };
            cells.extend(
                deduction
                    .actions
                    .iter()
                    .map(|action| action.candidate().cell),
            );
            cells.sort_unstable();
            cells.dedup();
            return base + 2 * cells.len() as u16 + 2 * alternatives as u16;
        }
        VariantEvidence::MatchingLayout(proof) => {
            let checks: usize = proof.cases.iter().map(|case| case.checks.len()).sum();
            return 120 + 18 * proof.cases.len() as u16 + 4 * checks as u16;
        }
        VariantEvidence::MatchingDigit(proof) => {
            let blockers: usize = proof
                .checks
                .iter()
                .chain(std::iter::once(&proof.conflict))
                .map(|check| check.blocked.len())
                .sum();
            return 60 + 4 * blockers as u16 + 8 * proof.checks.len() as u16;
        }
        VariantEvidence::LinkedClue(proof) => {
            return 48 + 10 * (proof.checks.len() as u16 + 1);
        }
        VariantEvidence::KropkiHouse(proof) => {
            return 30 + 2 * binary_choices(&proof.domains) + 2 * proof.tested as u16;
        }
        VariantEvidence::ThermometerHouse(proof) => {
            return 36
                + 2 * proof.line_cells.len() as u16
                + 2 * binary_choices(&proof.domains)
                + 2 * proof.rejected.len() as u16;
        }
        VariantEvidence::RegionSumHouse(proof) => {
            let lines: u16 = proof
                .lines
                .iter()
                .map(|line| {
                    let span: u16 = line.parts.iter().map(|part| part.cells.len() as u16).sum();
                    let choices: u16 = line
                        .parts
                        .iter()
                        .map(|part| binary_choices(&part.domains))
                        .sum();
                    4 + 3 * line.parts.len() as u16 + 2 * span + 2 * choices
                })
                .sum();
            return 32
                + lines
                + 2 * proof.remainder.len() as u16
                + 2 * binary_choices(&proof.remainder_domains);
        }
        VariantEvidence::RegionSumDistinct(proof) => {
            let span: u16 = proof.parts.iter().map(|part| part.cells.len() as u16).sum();
            let choices: u16 = proof
                .parts
                .iter()
                .map(|part| binary_choices(&part.domains))
                .sum();
            return 24 + 2 * span + 2 * choices + 3 * proof.parts.len() as u16;
        }
        VariantEvidence::GroupLineHouseSupport(proof) => {
            let choices: u16 = binary_choices(&proof.domains);
            return 34 + 2 * choices + 2 * proof.cases.len() as u16;
        }
        VariantEvidence::GroupOrder(proof) => {
            let checks: u16 = proof
                .rejected
                .iter()
                .map(|order| order.checks.len() as u16 + 1)
                .sum();
            return 72 + 5 * checks + 2 * proof.rejected.len() as u16;
        }
        VariantEvidence::GroupOrderElimination(proof) => {
            let checks: u16 = proof
                .branches
                .iter()
                .map(|branch| branch.checks.len() as u16)
                .sum();
            return 64 + 6 * checks;
        }
        VariantEvidence::LineHouses(proof) => {
            return 24
                + 2 * proof.cells.len() as u16
                + 2 * binary_choices(&proof.domains)
                + 3 * proof.houses.len() as u16;
        }
        VariantEvidence::EntropyAreas(proof) => {
            let overlap = (proof.windows.len().saturating_sub(1)) as u16;
            return 26
                + 2 * proof.cells.len() as u16
                + 2 * binary_choices(&proof.domains)
                + 10 * overlap;
        }
        VariantEvidence::Intersection { .. } => return Technique::Pointing.cost(),
        VariantEvidence::LockedDigit { clue, domains, .. } => (&clue.cells, domains, 0),
        VariantEvidence::GroupLineHouse { cells, domains, .. } => (&cells[..], &domains[..], 1),
        VariantEvidence::GroupLineHouseTriplet { cells, domains, .. } => {
            (&cells[..], &domains[..], 1)
        }
        VariantEvidence::Constraint { rules, .. } if deduction.technique == LetteredQuadruples => {
            let circles: u16 = rules
                .iter()
                .map(|&index| {
                    let PuzzleRule::LetteredQuadruples { clues } = &puzzle.rules[index] else {
                        return 0;
                    };
                    clues.len() as u16
                })
                .sum();
            return 25 + 3 * circles;
        }
        VariantEvidence::Constraint { cells, domains, .. } => (cells, domains, 0),
        VariantEvidence::RayHouses(proof) => {
            (&proof.cells, &proof.domains, proof.houses.len() as u16)
        }
        VariantEvidence::RenbanGroupCounts(proof) => {
            return 74
                + 5 * (proof.initial.len() + proof.subsequent.len()) as u16
                + proof
                    .placement
                    .as_ref()
                    .map_or(0, |step| 15 + 3 * step.rejected.len() as u16);
        }
        VariantEvidence::RenbanHouseSupport(proof) => (&proof.cells, &proof.domains, 0),
        VariantEvidence::RenbanSum(proof) => (&proof.cells, &proof.domains, 0),
        VariantEvidence::RenbanSumHouse(proof) => (&proof.cells, &proof.domains, 0),
        VariantEvidence::CageSum {
            cells,
            domains,
            cages,
            ..
        } => (cells, domains, cages.len() as u16),
        _ => return deduction.technique.cost(),
    };

    let span = 2 * cells.len() as u16;
    let choices = binary_choices(domains);
    match deduction.technique {
        Parity | DigitRestriction | AntiKing | AntiKnight | NonConsecutive | Inequality => 4 + span,
        Clone | Palindrome | ConsecutiveRun | DistinctCells => 8 + span + choices,
        InsideGrid => 20 + 4 * (cells.len() as u16).isqrt(),
        Kropki | Xv | AdjacentTotal | Thermometer | Between | Lockout | Whispers | Entropic
        | Modular | GlobalEntropy | Quadruple => 14 + span + choices,
        CageCombinations | Arrow | PillArrow | LittleKiller => 24 + span + 2 * choices,
        Renban | RegionSum => 28 + span + 2 * choices,
        RenbanLockedDigit => 24 + span + choices,
        RenbanHouseSupport => 22 + span + 2 * choices,
        RenbanSum => 42 + span + 2 * choices,
        LittleKillerHouseSupport => 32 + span + 2 * choices + 3 * supporting_rules,
        RenbanSumRayHouses => 46 + span + 2 * choices + 3 * supporting_rules,
        RenbanSumHouse => 54 + span + 2 * choices,
        CageHouseSum => 52 + 3 * supporting_rules + span + 2 * choices,
        Skyscrapers | Sandwich | XSum => 40 + span + 2 * choices,
        _ => deduction.technique.cost(),
    }
}
