#![cfg(all(feature = "variants", feature = "teaching"))]

use sudoku_app_engine::{
    DEFAULT_VARIANT_SEARCH_NODES, Difficulty, SolveStatus, Technique, VARIANT_SCORING_VERSION,
    PuzzleRule, VariantDeduction, VariantEvidence, VariantExclusionPremise, VariantPuzzle, VariantTechnique,
    variant_practice_examples,
};

fn binary_choices(domains: &[u16]) -> u16 {
    domains
        .iter()
        .map(|domain| {
            let digits = domain.count_ones();
            assert_ne!(digits, 0);
            (u32::BITS - (digits - 1).leading_zeros()) as u16
        })
        .sum()
}

fn estimate(deduction: &VariantDeduction, puzzle: &VariantPuzzle) -> u16 {
    use VariantTechnique::*;
    let (cells, domains, supporting_rules): (&[usize], &[u16], u16) = match &deduction.evidence {
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
            let blockers: usize = proof.checks.iter().chain(std::iter::once(&proof.conflict))
                .map(|check| check.blocked.len()).sum();
            return 60 + 4 * blockers as u16 + 8 * proof.checks.len() as u16;
        }
        VariantEvidence::LinkedClue(proof) => {
            // Track the assumption, then verify each restriction and the final conflict.
            return 48 + 10 * (proof.checks.len() as u16 + 1);
        }
        VariantEvidence::KropkiHouse(proof) => {
            // Compare the dot’s number pairs against the house candidates.
            return 30 + 2 * binary_choices(&proof.domains) + 2 * proof.tested as u16;
        }
        VariantEvidence::ThermometerHouse(proof) => {
            // Read the line, then check enough remaining cells to fit the house.
            return 36 + 2 * proof.line_cells.len() as u16 + 2 * binary_choices(&proof.domains)
                + 2 * proof.rejected.len() as u16;
        }
        VariantEvidence::RegionSumHouse(proof) => {
            // Check the digits in the shared region and compare the totals
            // imposed by each line's remaining parts.
            let lines: u16 = proof.lines.iter().map(|line| {
                let span: u16 = line.parts.iter().map(|part| part.cells.len() as u16).sum();
                let choices: u16 = line.parts.iter().map(|part| binary_choices(&part.domains)).sum();
                4 + 3 * line.parts.len() as u16 + 2 * span + 2 * choices
            }).sum();
            return 32 + lines + 2 * proof.remainder.len() as u16 + 2 * binary_choices(&proof.remainder_domains);
        }
        VariantEvidence::RegionSumDistinct(proof) => {
            let span: u16 = proof.parts.iter().map(|part| part.cells.len() as u16).sum();
            let choices: u16 = proof.parts.iter().map(|part| binary_choices(&part.domains)).sum();
            // Inspect the candidates and compare each part's distinct-digit totals.
            return 24 + 2 * span + 2 * choices + 3 * proof.parts.len() as u16;
        }
        VariantEvidence::GroupLineHouseSupport(proof) => {
            let choices: u16 = proof.domains.iter()
                .map(|domain| (u32::BITS - (domain.count_ones() - 1).leading_zeros()) as u16)
                .sum();
            return 34 + 2 * choices + 2 * proof.cases.len() as u16;
        }
        VariantEvidence::GroupOrder(proof) => {
            let checks: u16 = proof.rejected.iter().map(|order| order.checks.len() as u16 + 1).sum();
            return 72 + 5 * checks + 2 * proof.rejected.len() as u16;
        }
        VariantEvidence::LineHouses(proof) => {
            let (cells, domains, houses) = (&proof.cells, &proof.domains, &proof.houses);
            return 24 + 2 * cells.len() as u16 + 2 * binary_choices(domains) + 3 * houses.len() as u16;
        }
        VariantEvidence::EntropyAreas(proof) => {
            // Inspect both rule types. An overlapping area adds a second group
            // check and has to agree with the choices in the shared cells.
            let overlap = (proof.windows.len() - 1) as u16;
            return 26 + 2 * proof.cells.len() as u16 + 2 * binary_choices(&proof.domains) + 10 * overlap;
        }
        VariantEvidence::Intersection { .. } => return Technique::Pointing.cost(),
        VariantEvidence::LockedDigit { clue, domains, .. } => (&clue.cells, domains, 0),
        VariantEvidence::Constraint { rules, .. } if deduction.technique == LetteredQuadruples => {
            // Establish the common key and check its digit occurrences at each circle.
            let circles: u16 = rules.iter().map(|&index| {
                let PuzzleRule::LetteredQuadruples { clues } = &puzzle.rules[index] else {
                    panic!("a letter-key proof must cite its circles");
                };
                clues.len() as u16
            }).sum();
            return 25 + 3 * circles;
        }
        VariantEvidence::Constraint { cells, domains, .. } => (cells, domains, 0),
        VariantEvidence::RayHouses(proof) => {
            (&proof.cells, &proof.domains, proof.houses.len() as u16)
        }
        VariantEvidence::RenbanGroupCounts(proof) => {
            // Read each affected line, count five cells, then re-check the
            // forced placement when one additional Renban set must be ruled out.
            return 74 + 5 * (proof.initial.len() + proof.subsequent.len()) as u16
                + proof.placement.as_ref().map_or(0, |step| 15 + 3 * step.rejected.len() as u16);
        }
        VariantEvidence::RenbanHouseSupport(proof) => (&proof.cells, &proof.domains[..], 0),
        VariantEvidence::RenbanSum(proof) => (&proof.cells, &proof.domains, 0),
        VariantEvidence::RenbanSumHouse(proof) => (&proof.cells, &proof.domains, 0),
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
    let choices = binary_choices(domains);
    match deduction.technique {
        Parity | AntiKing | AntiKnight | NonConsecutive | Inequality => 4 + span,
        Clone | Palindrome | ConsecutiveRun | DistinctCells => 8 + span + choices,
        // Read the shared set and check each inside row and column.
        InsideGrid => 20 + 4 * (cells.len() as u16).isqrt(),
        Kropki | Xv | AdjacentTotal | Thermometer | Between | Lockout | Whispers | Entropic | Modular | GlobalEntropy | Quadruple => 14 + span + choices,
        CageCombinations | Arrow | PillArrow | LittleKiller => 24 + span + 2 * choices,
        Renban | RegionSum => 28 + span + 2 * choices,
        RenbanLockedDigit => 24 + span + choices,
        RenbanHouseSupport => 22 + span + 2 * choices,
        // Compare each possible Renban interval's sum with the remainders on the ray.
        RenbanSum => 42 + span + 2 * choices,
        LittleKillerHouseSupport => 32 + span + 2 * choices + 3 * supporting_rules,
        RenbanSumRayHouses => 46 + span + 2 * choices + 3 * supporting_rules,
        // Match intervals in two lines and check the conflict in their house.
        RenbanSumHouse => 54 + span + 2 * choices,
        CageHouseSum => 34 + 18 + 3 * supporting_rules + span + 2 * choices,
        Skyscrapers | Sandwich | XSum => 40 + span + 2 * choices,
        technique => panic!("no variant scoring model for {}", technique.id()),
    }
}

#[test]
fn calibrated_costs_match_sample_proofs_and_bill_once_per_deduction() {
    let mut path_scores = Vec::new();
    let mut tiers = [0; Difficulty::Impossible as usize + 1];
    for &technique in VariantTechnique::DEFAULT_ORDER
        .iter()
        .chain(VariantTechnique::EXPLICIT_TECHNIQUES)
    {
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
            .map(|example| estimate(&example.deduction, &example.position.puzzle))
            .collect();
        estimates.sort_unstable();
        assert_eq!(estimates[1], technique.cost(), "{}", technique.id());
        let tier = match (technique, estimates[1]) {
            (VariantTechnique::MatchingLayoutForcing, _) => Difficulty::Extreme,
            (VariantTechnique::Arrow | VariantTechnique::PillArrow | VariantTechnique::CageCombinations, _) | (_, 0..=26) => {
                Difficulty::Easy
            }
            // Finding a relationship across overlapping clues or a shared key
            // needs more planning than confirming a single candidate.
            (VariantTechnique::EntropyQuadruple | VariantTechnique::LetteredQuadruples, _) => Difficulty::Hard,
            (_, 27..=68) => Difficulty::Medium,
            _ => Difficulty::Hard,
        };
        assert_eq!(technique.difficulty(), tier, "{}", technique.id());

        // Rate the actual path from each example, with its target first and
        // the standard variant solver order for the rest.
        let mut order: Vec<_> = std::iter::once(technique)
            .chain(
                VariantTechnique::DEFAULT_ORDER
                    .iter()
                    .copied()
                    .filter(|&other| other != technique),
            )
            .collect();
        if technique == VariantTechnique::LinkedClueContradiction {
            // The archived mixed-rule positions also need the pair techniques
            // available in the app before their later contradictions appear.
            order.extend([
                Technique::LockedPair,
                Technique::NakedPair,
                Technique::HiddenPair,
            ].map(VariantTechnique::Classic));
        }
        if technique == VariantTechnique::MatchingLayoutForcing {
            order.extend([
                VariantTechnique::MatchingDigitContradiction,
                VariantTechnique::LinkedClueContradiction,
                VariantTechnique::KropkiHouseSupport,
                VariantTechnique::Classic(Technique::LockedPair),
                VariantTechnique::Classic(Technique::NakedPair),
                VariantTechnique::Classic(Technique::HiddenPair),
            ]);
        }
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
        3 * (VariantTechnique::DEFAULT_ORDER.len() + VariantTechnique::EXPLICIT_TECHNIQUES.len() - 3)
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
