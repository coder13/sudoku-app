#![cfg(all(feature = "variants", feature = "teaching"))]

use sudoku_app_engine::{
    DEFAULT_VARIANT_SEARCH_NODES, Difficulty, SolveStatus, Technique, VARIANT_SCORING_VERSION,
    VariantDeduction, VariantEvidence, VariantExclusionPremise, VariantTechnique,
    variant_practice_examples,
};

fn estimate(deduction: &VariantDeduction) -> u16 {
    use VariantTechnique::*;
    let (cells, domains, cages) = match &deduction.evidence {
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
        VariantEvidence::LineHouses(proof) => {
            let (cells, domains, houses) = (&proof.cells, &proof.domains, &proof.houses);
            let choices: u16 = domains
                .iter()
                .map(|domain| {
                    let n = domain.count_ones();
                    (u32::BITS - (n - 1).leading_zeros()) as u16
                })
                .sum();
            return 24 + 2 * cells.len() as u16 + 2 * choices + 3 * houses.len() as u16;
        }
        VariantEvidence::Intersection { .. } => return Technique::Pointing.cost(),
        VariantEvidence::Constraint { cells, domains, .. } => (cells, domains, 0),
        VariantEvidence::CageSum {
            cells,
            domains,
            cages,
            ..
        } => (cells, domains, cages.len() as u16),
        evidence => panic!("no variant scoring model for {evidence:?}"),
    };
    // Count cells inspected and binary choices needed to narrow each domain.
    // The number of actions proved by a step is independent of search effort.
    let span = 2 * cells.len() as u16;
    let choices: u16 = domains
        .iter()
        .map(|domain| {
            let digits = domain.count_ones();
            assert_ne!(digits, 0);
            (u32::BITS - (digits - 1).leading_zeros()) as u16
        })
        .sum();
    match deduction.technique {
        Parity | AntiKing | AntiKnight | NonConsecutive | Inequality | MinMax => 4 + span,
        Clone | Palindrome => 8 + span + choices,
        Kropki | Xv | AdjacentTotal | Thermometer | Between | Whispers | Entropic | Modular | GlobalEntropy | Quadruple => 14 + span + choices,
        CageCombinations | Arrow | LittleKiller => 24 + span + 2 * choices,
        Renban | RegionSum => 28 + span + 2 * choices,
        CageHouseSum => 34 + 18 + 3 * cages + span + 2 * choices,
        Skyscrapers | Sandwich | XSum => 40 + span + 2 * choices,
        technique => panic!("no variant scoring model for {}", technique.id()),
    }
}

#[test]
fn calibrated_costs_match_sample_proofs_and_bill_once_per_deduction() {
    let mut path_scores = Vec::new();
    let mut tiers = [0; 5];
    for &technique in VariantTechnique::DEFAULT_ORDER {
        if matches!(
            technique,
            VariantTechnique::FullHouse
                | VariantTechnique::NakedSingle
                | VariantTechnique::HiddenSingle
        ) {
            continue;
        }
        let examples = variant_practice_examples(technique).unwrap();
        let mut estimates: Vec<_> = examples
            .iter()
            .map(|example| estimate(&example.deduction))
            .collect();
        estimates.sort_unstable();
        assert_eq!(estimates[1], technique.cost(), "{}", technique.id());
        let tier = match (technique, estimates[1]) {
            (VariantTechnique::Arrow | VariantTechnique::CageCombinations, _) | (_, 0..=26) => {
                Difficulty::Easy
            }
            (_, 27..=68) => Difficulty::Medium,
            _ => Difficulty::Hard,
        };
        assert_eq!(technique.difficulty(), tier, "{}", technique.id());

        // Rate the actual path from each example, with its target as the first
        // technique, then the rest of the standard variant solver order.
        let order: Vec<_> = std::iter::once(technique)
            .chain(
                VariantTechnique::DEFAULT_ORDER
                    .iter()
                    .copied()
                    .filter(|&other| other != technique),
            )
            .collect();
        for example in examples {
            let position = example.position;
            let trace = position.solve_logically(&order).unwrap();
            assert_eq!(trace.steps[0].technique, technique);
            assert!(
                position
                    .puzzle
                    .compile()
                    .unwrap()
                    .deductions(&position.entries, &position.eliminations, technique)
                    .unwrap()
                    .contains(&example.deduction)
            );
            assert_eq!(trace.rating, position.rate(&order).unwrap());
            let SolveStatus::Solved(difficulty) = trace.rating.status else {
                panic!("{} calibration path stalled", technique.id());
            };
            assert_eq!(trace.rating.technique_order, order);
            assert_eq!(trace.rating.scoring_version, VARIANT_SCORING_VERSION);
            assert_eq!(trace.rating.regions, position.puzzle.regions);
            assert_eq!(trace.rating.rules, position.puzzle.rules);
            let total: u32 = trace
                .steps
                .iter()
                .map(|step| u32::from(step.technique.cost()))
                .sum();
            assert_eq!(trace.rating.points, total);
            assert!(difficulty >= tier);
            let solution = position
                .puzzle
                .compile()
                .unwrap()
                .solve(
                    &position.entries,
                    &position.eliminations,
                    DEFAULT_VARIANT_SEARCH_NODES,
                )
                .unwrap();
            for (cell, &digit) in solution.iter().enumerate() {
                assert_eq!(
                    trace.end.entries[cell].max(position.puzzle.givens[cell]),
                    digit
                );
            }
            tiers[difficulty as usize] += 1;
            path_scores.push(total);
        }
    }
    assert_eq!(
        path_scores.len(),
        3 * (VariantTechnique::DEFAULT_ORDER.len() - 3)
    );
    path_scores.sort_unstable();
    println!(
        "{} verified calibration paths, {}–{} points, median {}. Difficulty counts {:?}.",
        path_scores.len(),
        path_scores[0],
        path_scores[path_scores.len() - 1],
        path_scores[path_scores.len() / 2],
        tiers,
    );
}
