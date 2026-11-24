use std::{collections::BTreeMap, fs};

use sudoku_app_engine::{
    candidates, parse_givens, solve_logically, Difficulty, HintEvidence, PositionSnapshot,
};

#[derive(Clone)]
struct PuzzleRun {
    tier: Difficulty,
    base: f64,
    step_costs: Vec<f64>,
    givens: usize,
    steps: usize,
    densities: Vec<usize>,
    rectangles: BTreeMap<String, (usize, usize, u64, u64)>,
    techniques: BTreeMap<String, usize>,
    hardest: String,
}

fn tier_from_heading(line: &str) -> Option<Difficulty> {
    Some(match line.trim() {
        "### Medium" => Difficulty::Medium,
        "### Tricky" => Difficulty::Tricky,
        "### Hard" => Difficulty::Hard,
        "### Very Hard" => Difficulty::VeryHard,
        "### Expert" => Difficulty::Expert,
        "### Master" => Difficulty::Master,
        "### Extreme" => Difficulty::Extreme,
        "### Impossible" => Difficulty::Impossible,
        _ => return None,
    })
}

fn percentile(sorted: &[f64], fraction: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let index = ((sorted.len() - 1) as f64 * fraction).round() as usize;
    sorted[index]
}

fn median(values: &[f64]) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    if sorted.len() % 2 == 0 {
        (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0
    } else {
        sorted[sorted.len() / 2]
    }
}

fn density_at(snapshot: &PositionSnapshot) -> usize {
    let values = snapshot.values().expect("trace position is valid");
    let legal = candidates(&values).expect("trace position has legal candidates");
    legal
        .iter()
        .zip(snapshot.eliminations.iter())
        .zip(values.iter())
        .map(|((&mask, &removed), &digit)| {
            if digit == 0 {
                (mask & !removed).count_ones() as usize
            } else {
                0
            }
        })
        .sum()
}

fn analyze_puzzle(code: &str, tier: Difficulty) -> PuzzleRun {
    let board = parse_givens(code).expect("81-cell puzzle");
    let trace = solve_logically(&board, &tier.technique_order()).expect("logical solve");
    assert!(matches!(
        trace.status,
        sudoku_app_engine::SolveStatus::Solved(_)
    ));
    assert_eq!(
        trace.status,
        sudoku_app_engine::SolveStatus::Solved(tier),
        "the puzzle must still match its requested tier"
    );
    let densities: Vec<_> = trace
        .positions()
        .take(trace.steps.len())
        .map(|position| density_at(&position))
        .collect();
    let base = trace.score.points as f64;
    let mut rectangles = BTreeMap::new();
    let mut techniques = BTreeMap::new();
    for step in &trace.steps {
        *techniques
            .entry(step.technique.id().to_owned())
            .or_insert(0) += 1;
        let HintEvidence::UniqueRectangle {
            candidate_counts, ..
        } = &step.evidence
        else {
            continue;
        };
        let corner_candidates: usize = candidate_counts
            .iter()
            .map(|&count| usize::from(count))
            .sum();
        let old_cost = (100usize * corner_candidates / 9).max(50) as u64;
        let entry = rectangles
            .entry(format!("{:?}", step.technique))
            .or_insert((0, 0, 0, 0));
        entry.0 += 1;
        entry.1 += corner_candidates;
        entry.2 += u64::from(step.cost());
        entry.3 += old_cost;
    }
    PuzzleRun {
        tier,
        base,
        step_costs: trace
            .steps
            .iter()
            .map(|step| f64::from(step.cost()))
            .collect(),
        givens: board.iter().filter(|&&digit| digit != 0).count(),
        steps: trace.steps.len(),
        densities,
        rectangles,
        techniques,
        hardest: trace
            .score
            .hardest
            .expect("a completed trace has a hardest technique")
            .id()
            .to_owned(),
    }
}

fn average_ranks(values: &[f64]) -> Vec<f64> {
    let mut order: Vec<_> = (0..values.len()).collect();
    order.sort_by(|&left, &right| values[left].total_cmp(&values[right]));
    let mut ranks = vec![0.0; values.len()];
    let mut start = 0;
    while start < order.len() {
        let mut end = start + 1;
        while end < order.len() && values[order[end]] == values[order[start]] {
            end += 1;
        }
        let average = (start + 1 + end) as f64 / 2.0;
        for &index in &order[start..end] {
            ranks[index] = average;
        }
        start = end;
    }
    ranks
}

fn spearman(left: &[f64], right: &[f64]) -> f64 {
    let left = average_ranks(left);
    let right = average_ranks(right);
    let left_mean = left.iter().sum::<f64>() / left.len() as f64;
    let right_mean = right.iter().sum::<f64>() / right.len() as f64;
    let numerator: f64 = left
        .iter()
        .zip(&right)
        .map(|(&x, &y)| (x - left_mean) * (y - right_mean))
        .sum();
    let left_norm = left.iter().map(|x| (x - left_mean).powi(2)).sum::<f64>();
    let right_norm = right.iter().map(|y| (y - right_mean).powi(2)).sum::<f64>();
    numerator / (left_norm * right_norm).sqrt()
}

fn main() {
    let path = "docs/scoring-calibration-160-puzzles.md";
    let document = fs::read_to_string(path).expect("read 160-puzzle calibration report");
    let mut current_tier = None;
    let mut rows = Vec::new();
    for line in document.lines() {
        if let Some(tier) = tier_from_heading(line) {
            current_tier = Some(tier);
            continue;
        }
        let Some(tier) = current_tier else { continue };
        let Some(code) = line
            .split('`')
            .find(|part| part.len() == 81 && part.bytes().all(|byte| byte.is_ascii_digit()))
        else {
            continue;
        };
        rows.push((code.to_owned(), tier));
    }
    assert_eq!(rows.len(), 160, "expected 20 puzzles in each of 8 tiers");
    let mut runs = Vec::new();
    let mut tier_positions = BTreeMap::<Difficulty, usize>::new();
    for (code, tier) in rows {
        let index = tier_positions.entry(tier).or_default();
        *index += 1;
        eprintln!("solving {tier:?} puzzle {index}/20");
        runs.push(analyze_puzzle(&code, tier));
    }
    assert_eq!(
        runs.len(),
        160,
        "expected all 20 puzzles in each of 8 tiers"
    );

    let all_densities: Vec<f64> = runs
        .iter()
        .flat_map(|run| run.densities.iter().map(|&count| count as f64))
        .collect();
    let reference = median(&all_densities);
    let mut multipliers: Vec<f64> = all_densities
        .iter()
        .map(|&count| ((count / reference).sqrt()).clamp(0.5, 2.0))
        .collect();
    multipliers.sort_by(f64::total_cmp);

    println!("puzzles={}", runs.len());
    println!("trace_steps={}", all_densities.len());
    println!("candidate_density_reference_median={reference:.1}");
    println!(
        "candidate_density_min_median_p90_max={:.0}/{:.1}/{:.1}/{:.0}",
        all_densities.iter().copied().fold(f64::INFINITY, f64::min),
        median(&all_densities),
        percentile(
            &{
                let mut sorted = all_densities.clone();
                sorted.sort_by(f64::total_cmp);
                sorted
            },
            0.9
        ),
        all_densities.iter().copied().fold(0.0, f64::max),
    );
    println!(
        "absolute_multiplier_min_median_p90_max={:.3}/{:.3}/{:.3}/{:.3}",
        multipliers[0],
        median(&multipliers),
        percentile(&multipliers, 0.9),
        multipliers[multipliers.len() - 1],
    );

    let tiers = [
        Difficulty::Medium,
        Difficulty::Tricky,
        Difficulty::Hard,
        Difficulty::VeryHard,
        Difficulty::Expert,
        Difficulty::Master,
        Difficulty::Extreme,
        Difficulty::Impossible,
    ];
    let mut tier_ranks = Vec::new();
    let mut base_scores = Vec::new();
    let mut absolute_scores = Vec::new();
    let mut relative_scores = Vec::new();
    println!("tier,n,base_min,base_med,base_max,absolute_med,relative_med,base_p90,absolute_p90,relative_p90,median_abs_change_pct,median_steps,median_givens");
    for (tier_rank, tier) in tiers.into_iter().enumerate() {
        let sample: Vec<_> = runs.iter().filter(|run| run.tier == tier).collect();
        let base: Vec<_> = sample.iter().map(|run| run.base).collect();
        let absolute: Vec<_> = sample
            .iter()
            .map(|run| {
                run.step_costs
                    .iter()
                    .zip(&run.densities)
                    .map(|(&cost, &count)| {
                        cost * ((count as f64 / reference).sqrt()).clamp(0.5, 2.0)
                    })
                    .sum()
            })
            .collect();
        let relative: Vec<_> = sample
            .iter()
            .map(|run| {
                let initial = run.densities.first().copied().unwrap_or(1).max(1) as f64;
                run.step_costs
                    .iter()
                    .zip(&run.densities)
                    .map(|(&cost, &count)| cost * ((count as f64 / initial).sqrt()).clamp(0.5, 2.0))
                    .sum()
            })
            .collect();
        let mut base_sorted = base.clone();
        let mut absolute_sorted = absolute.clone();
        let mut relative_sorted = relative.clone();
        base_sorted.sort_by(f64::total_cmp);
        absolute_sorted.sort_by(f64::total_cmp);
        relative_sorted.sort_by(f64::total_cmp);
        let change = sample
            .iter()
            .zip(&absolute)
            .map(|(run, &weighted)| 100.0 * (weighted / run.base - 1.0))
            .collect::<Vec<_>>();
        let steps = sample
            .iter()
            .map(|run| run.steps as f64)
            .collect::<Vec<_>>();
        let givens = sample
            .iter()
            .map(|run| run.givens as f64)
            .collect::<Vec<_>>();
        println!(
            "{tier:?},{},{:.0},{:.0},{:.0},{:.0},{:.0},{:.0},{:.0},{:.0},{:.1},{:.0},{:.0}",
            sample.len(),
            base_sorted[0],
            median(&base),
            base_sorted[base_sorted.len() - 1],
            median(&absolute),
            median(&relative),
            percentile(&base_sorted, 0.9),
            percentile(&absolute_sorted, 0.9),
            percentile(&relative_sorted, 0.9),
            median(&change),
            median(&steps),
            median(&givens),
        );
        tier_ranks.extend(std::iter::repeat_n(tier_rank as f64, sample.len()));
        base_scores.extend(base);
        absolute_scores.extend(absolute);
        relative_scores.extend(relative);

        let mut technique_presence = BTreeMap::<String, (usize, usize)>::new();
        let mut hardest_presence = BTreeMap::<String, usize>::new();
        for run in &sample {
            *hardest_presence.entry(run.hardest.clone()).or_default() += 1;
            for (technique, &step_count) in &run.techniques {
                let counts = technique_presence.entry(technique.clone()).or_default();
                counts.0 += 1;
                counts.1 += step_count;
            }
        }
        let all_techniques = technique_presence
            .iter()
            .map(|(id, (puzzles, steps))| format!("{id}:{puzzles}/{steps}"))
            .collect::<Vec<_>>()
            .join(";");
        let hardest_techniques = hardest_presence
            .iter()
            .map(|(id, puzzles)| format!("{id}:{puzzles}"))
            .collect::<Vec<_>>()
            .join(";");
        println!("tier_techniques,{tier:?},hardest={hardest_techniques},all={all_techniques}");
    }
    println!(
        "spearman_tier_vs_score: base={:.3}, absolute_density={:.3}, relative_density={:.3}",
        spearman(&tier_ranks, &base_scores),
        spearman(&tier_ranks, &absolute_scores),
        spearman(&tier_ranks, &relative_scores),
    );
    let mut rectangle_totals = BTreeMap::<String, (usize, usize, u64, u64)>::new();
    for run in &runs {
        for (technique, &(count, candidates, new_cost, old_cost)) in &run.rectangles {
            let entry = rectangle_totals
                .entry(technique.clone())
                .or_insert((0, 0, 0, 0));
            entry.0 += count;
            entry.1 += candidates;
            entry.2 += new_cost;
            entry.3 += old_cost;
        }
    }
    println!("rectangle_technique,n,mean_corner_candidates,new_points,old_points");
    for (technique, (count, candidates, new_cost, old_cost)) in rectangle_totals {
        println!(
            "{technique},{count},{:.1},{new_cost},{old_cost}",
            candidates as f64 / count as f64
        );
    }
}
