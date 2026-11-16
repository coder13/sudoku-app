# Sudoku player rating and Auto difficulty

Give the player a personal rating that rises faster for harder solves. A hint reduces the credit for that solve, and repeated results tell **Auto** when to offer a harder or easier puzzle. Keep the existing puzzle difficulty and solve counts: a puzzle still counts as solved even when the player used hints. Show the rating change on the results screen and let players choose a difficulty at any time.

## What the research supports

[Pelánek’s work on adaptive practice](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf) adapts Elo so a player is matched against a task with a difficulty rating. The player’s rating changes according to how their result compares with the expected result. [Math Garden](https://www.dare.uva.nl/id/de65bb65-d198-4dbc-ac7b-bc25ca23e627) used that approach to select arithmetic tasks with an average success probability of 75%. That is a useful starting point for how often practice should feel manageable. A Sudoku puzzle takes longer, and the proposed model gives partial credit, so that figure does not predict a Sudoku solve rate.

A study of [on-demand hints in adaptive practice](https://pmc.ncbi.nlm.nih.gov/articles/PMC9073638/) found that its best model gave partial credit for correct answers with hints. It also found strong differences in how readily players asked for help. For Sudoku, a light penalty for seeing a hint and a larger penalty for letting the app do the move are reasonable starting rules. The exact penalties need playtesting.

| Approach | Fit for this app |
| --- | --- |
| Lifetime points for solves | Useful for milestones. Repeated Easy solves can eventually outweigh harder solves, so the total is a poor guide to the next puzzle. |
| Promotion after a set number of solves | Easy to explain and a good baseline for playtesting. A bare streak treats each result as a pass or fail and reacts abruptly when a player needs help. |
| Elo-style rating with fixed puzzle grades | Recommended. The same finish earns more on a harder puzzle; hints can reduce the gain or lower the rating. The puzzle grades can come from the existing engine. |

## Start with the engine’s difficulty tiers

The [engine](crates/engine/src/logical.rs) classifies a puzzle by the higher of its total deduction cost and its hardest technique. Use its final tier with a fixed reference solver profile. [Research on human Sudoku solving](https://arxiv.org/abs/1403.7373) found that both the difficulty of individual steps and the dependencies between steps matter. Treat the engine grade as a starting estimate that can improve with play data.

A local check generated 24 puzzles per tier with the default technique order, scoring version 10, seeds 1–24, and a budget of 64 attempts per request. All 120 matched. The raw scores overlap: for example, Medium ranged from 298 to 874 points and Hard ranged from 494 to 1,188 points. In that sample, 20 of 24 Hard puzzles fell below the raw Hard points cutoff. Auto should use the final tier and keep the raw points for later tuning.

| Engine tier | Initial rating for the puzzle |
| --- | ---: |
| Easy | 800 |
| Medium | 860 |
| Hard | 920 |
| Unfair | 980 |
| Extreme | 1,040 |

## Score each puzzle once

Start a new player at 855. Let `R` be the current player rating, `D` the puzzle rating, `C` the outcome credit, and `w` the weight of the outcome. Keep the full precision internally and round for display. All constants below are proposed defaults.

```text
expected_credit = 1 / (1 + exp((D - R) / 50))
new_rating = clamp(R + 32 × w × (C - expected_credit), 700, 1150)
```

| Outcome | Credit `C` | Weight `w` |
| --- | --- | ---: |
| Solve without rated assistance | 1.00 | 1 |
| Solve with hints | Subtract 0.10 per distinct hint shown and another 0.15 per hint applied. Floor the credit at 0.25. | 1 |
| Choose **Too hard** or reveal solving steps through **Show solution** before solving | 0.00; the player can still finish in practice mode. | 0.5 |
| Pause, close the app, switch puzzles, or encounter a generation error | No rating update. | — |

Count a hint when its deduction becomes visible, including when the player browses **Analyze all moves** or follows the move manually. Reopening the same move adds no charge; group alternate explanations by the placements and removals they reveal. Each digit filled by **Solve all singles** counts as one applied hint, including its reveal cost, and the same floor applies. Error checks, candidate tools, and the timer have no rating effect. Saving, undoing, and resetting the grid preserve the assistance already received.

At a rating of 855, a clean Easy solve earns about **+8**, a Medium solve **+17**, and a Hard solve **+25**. On that same Easy puzzle, one viewed hint earns about **+5**, one applied hint leaves the rating about unchanged, and two applied hints give **−8**. One applied hint on the Medium puzzle still earns about **+9**. The loss of credit follows the help received; the match with the puzzle determines whether the overall rating goes up or down.

## Let Auto move one tier at a time

Offer **Auto** beside the existing choices, show the tier it will use, and start it at Easy. Manual choices can bypass the recommendation. A fresh generated Classic puzzle at or above the current Auto tier can contribute to the rating if it has a complete reference grade; easier manual puzzles, custom or imported puzzles, lesson practice, and repeats stay available for practice. Use the current tier when the outcome is recorded so players cannot raise their rating by stockpiling easier puzzles. A player who already knows Sudoku can choose harder puzzles manually to establish their rating faster.

1. **Move up** one tier when the expected credit at the next tier reaches **0.65** and at least **three of the last four** rated outcomes since the last tier change earned **0.90** or more. A solve with one viewed hint can qualify.
2. **Move down** one tier when the expected credit at the current tier falls to **0.58** or less and at least **two of the last three** rated outcomes at that tier, since the last change, earned **0.60** or less. A single rough puzzle cannot trigger the move.
3. Start a fresh result window after a tier change. Apply the new recommendation only to the next generated puzzle. If the generator cannot find one in its attempt budget, offer a retry or an explicit easier choice and keep the rating unchanged.

The thresholds put a new match near 0.65 expected credit and give the player room to improve before another move. Expected credit is a model score that includes partial credit. For the first release, use the existing tier generator. Later, a pool of rated puzzles can let Auto choose gentler examples at the start of a tier and tougher examples before the next promotion. Compare puzzles within a tier using both the techniques and the total cost.

| Scripted results from a new rating | What Auto does |
| --- | --- |
| Every puzzle is solved without hints. | Medium after 6 puzzles, Hard after 15, Unfair after 23, Extreme after 32. |
| Solves alternate between no hints and one viewed hint. | Medium after 9 puzzles and Hard after 20. |
| Every Easy solve uses one applied hint. | Stays on Easy; the rating settles near 855. |
| The player chooses **Too hard** immediately after the first promotion. | Stays on Medium after one; returns to Easy after two. |
| The player solves 20 manual Easy puzzles after reaching Medium. | The rating and recommendation stay where they were. |

These sequences check the scoring rules. They do not estimate how many puzzles real players will need to advance.

## Fit the model to the app

- **Generation:** [The shared generator](src/components/usePuzzleGeneration.ts) targets a tier. Add Auto as a player preference and resolve it to an engine tier before generating. Pass an explicit reference technique order to the generator and grader, since [the engine wrapper](src/sudoku/solver-profile.ts) normally uses the player’s saved order. Store the grade, technique order, and scoring version from the reference rating. A stalled rating cannot qualify.
- **Assistance:** [The play workspace](src/components/Worktable.tsx) handles hints, automated placements, and the solution path. Record what the player was actually shown and what was applied. Failed lookups and stale results are free. Save assistance outside undo history and save any final hint application with the move that completes the puzzle. The solution panel already lists placements and removals when it loads, so revealing that list ends the rated attempt even if the player never selects a step.
- **Completion:** Keep a record of attempted puzzles and their first rated outcomes separate from the deletable puzzle library so a replay stays in practice mode. Use the givens as the minimum duplicate key; [the engine’s canonical key](crates/engine/README.md#targeted-generation) can also catch equivalent puzzles when building a pool. Make recording safe to retry after reload and from another tab. Keep old solves in Statistics without awarding retroactive rating credit, because older saves cannot tell us what assistance was used.
- **Display:** Put the change and its reason on [the completion screen](src/components/CompletedPuzzle.tsx), and show the current rating and recommended tier in [Statistics](src/components/PuzzlesPage.tsx). Example: “Rating 892 (+5) · 1 hint viewed. Next Auto puzzle: Medium.”

Before using Auto as a default, compare it with fixed difficulty or a simple promotion ladder in a small opt-in playtest. Check how many players finish, how often they ask for hints or choose **Too hard**, how often tier recommendations reverse, and whether players describe the next puzzle as too easy or too hard. Track unresolved puzzles separately from explicit skips: counting only completions can make a difficulty tier look easier than it is. Tune the hint weights if players avoid help to protect their rating, and adjust the tier boundaries if struggles cluster after a promotion.
