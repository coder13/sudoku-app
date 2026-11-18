# Research log · Learning to construct Sudoku puzzles

## 17 November 2026 · Corpus and first test

The earlier ChatGPT link returned no conversation content. Research began from the project’s collections, generator, and primary sources.

The local catalog includes 100 Nikoli classics released with Sakana AI and 60 generated puzzles selected from Sudoku Exchange. All 100 Nikoli clue patterns have 180-degree rotational symmetry. The app grades 14 Beginner, 35 Easy, 44 Medium, and 7 Tricky. The publisher and the app measure different things, so the app’s grades will be identified explicitly. The Exchange collection has a different tier mix and is a control. [Nikoli dataset](https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli) · [Local collection provenance](../../../src/sudoku/collections/README.md)

The first experiment will count the distinct placements a player can find using singles, then place all of them and count again. This gives the same answer if two players find those placements in a different order. Before inspecting outcomes, the comparison chosen was whether the first count improves prediction of the second beyond clues and app tier. The generation test will draw an opening profile from training puzzles, select among a fixed batch of certified candidates, and compare the results with held-out puzzles. A judge of player preference will require separate human evidence. [Pelánek’s human difficulty study](https://arxiv.org/abs/1403.7373)

## 17 November 2026 · What survived the controls

Each of the 400 app-generated classics had a distinct canonical clue pattern. None had 180-degree clue symmetry. The 60 Exchange controls included 36 with that symmetry. Nikoli describes symmetry as an editorial choice. Thomas Snyder documents a classic built around an extremely narrow opening. These observations motivated treating a setter’s intentions as optional design goals. [Nikoli’s account](https://www.nikoli.co.jp/en/puzzles/sudoku/why_hand_made/) · [Snyder’s construction note](https://www.gmpuzzles.com/blog/2023/03/sudoku-by-thomas-snyder-20/)

Issue-prefix and canonical-mask grouping reduced the 100 Nikoli puzzles to 51 holdout groups. In 80 openings with a meaningful second count, knowing the first count saved 0.071 bits on average relative to the tier-and-clue-count model. The group bootstrap interval included zero. Applying the same model to 30 eligible Exchange controls cost an extra 0.103 bits. Choosing among four generated candidates reduced the first-wave distribution gap from 4.57 placements to 3.07. The third-wave gap moved only from 1.27 to 1.21. This shifted the proposal toward using an opening target as one construction control and testing later breakthroughs separately. [Numerical results](results.json)

## 17 November 2026 · How variant rules change the measurement

On 48 app-generated variant draws, allowing the Killer candidate rules or adding the irregular Jigsaw regions exposed more opening singles in every draw. Some Jigsaw recipes repeated. The unit here is a generator call. A rating change or increase in visible singles is meaningful only with a stated set of rules and solver operations.

Sakana AI’s current repository says Sudoku-Bench was discontinued and points specifically to the surviving Nikoli data. The historical paper describes creative variant openings, but a future collection should come from setters who opt in or a current release with clear reuse terms. The next experiment will construct one Killer and one Jigsaw with a checkable opening specific to that family. [Current repository notice](https://github.com/SakanaAI/Sudoku-Bench) · [Historical paper](https://arxiv.org/abs/2505.16135)

## 17 November 2026 · Changing how classics are constructed

In 83 of the 100 pools, even the narrowest first wave exceeded the sampled target. Choosing among more of the same output may be expensive. A follow-up will move one given to an empty cell using the same solution, preserving clue count. For each of the 44 Medium starts, both policies will consider the same 64 random swaps and have eight exact certification attempts. One tests swaps in draw order. The other prioritizes the two-wave target. The original puzzle is a fallback in both arms. This is an exploratory follow-up on the same collection.

The draw-order policy found one strict improvement and the guided policy found six. Of the 352 checks per arm, 16 draw-order edits and 9 guided edits passed. A policy that often locates a desired feature can still waste exact checks. Distinguishing alternative solutions during repair is a promising way to address that failure. [Swap outcomes](results.json) · [Public Rust acceptance function](../../../crates/engine/src/generation.rs)

## 17 November 2026 · Built and checked two examples

For both variants, the trial target was the median first-wave count of the Nikoli Easy puzzles, which was three. Killer proposed 31 complete cage layouts and rejected 27 for multiple solutions. The selected zero-given puzzle has an arithmetic opening at R3C3. Jigsaw proposed 13 layouts or carvings. Seven failed the layout or carving requirements and two already offered the target cell as a single. The selected grid has a region-based opening at R3C8. Neither selected grid hit three. This made the case for learning rule-specific actions stronger.

The Wasm solver produced a complete logical trace for each selected puzzle. The constructor checked placements and candidate removals against its known solution. The separate TypeScript enumeration code found exactly one solution for the Killer in 2,874 search nodes and for the Jigsaw in 105. Its search order differs from the app’s, so node counts describe this verification run only. [Generated definitions and seeds](examples.json) · [Independent counter](../../../tests/helpers/mixed-oracle.ts)

## 17 November 2026 · An external check against human difficulty

Sheng-Wei Wang publicly released two puzzle-level human-difficulty metrics from Cloud Sudoku. The source distinguishes a time-only metric from one combining time and completion. Before examining the associations, the chosen checks were rank correlations with clue count and with opening width, followed by a comparison holding exact clue count and app tier fixed. This dataset was located after the classic and variant experiments and supplies an external check on a feature. It contributes no training targets or preference votes. [Author’s release](https://github.com/synnwang/sudoku_dataset_difficulty)

All 344 source puzzles had a unique completion and different canonical structures, with zero structural overlap against the prior 560 classics. Opening width correlated −0.583 with the time-based score and −0.530 with the combined score. The corresponding rank correlations after centering within the 29 exact clue-count and app-tier groups were −0.438 and −0.383. Of the 344 puzzles, 336 belonged to groups with more than one member. The other eight have zero residuals. There were 115 Beginner, 205 Easy, 10 Medium, 6 Tricky, 6 Hard and 2 Very Hard. Only four puzzles had two or three opening placements. This limits conclusions about narrow openings. The published CSV contains puzzle-level metrics, so the comparison cannot account for player-by-player selection or identify a causal effect.

## 17 November 2026 · Comparing the two variant ideas with published puzzles

The two constructed variants already existed when Otto Janko’s published archive became available for comparison. The site credits the author on each puzzle and identifies terms for the named works. The construction method is unverified. The planned measurement is the frequency of our two precise proofs, a one-cell cage remainder in a house and a one-cell difference between a band or stack and three irregular regions. This comparison will use published puzzles as held-out examples. [Otto Janko’s puzzle archive](https://www.janko.at/Raetsel/) · [Source terms](https://www.janko.at/Raetsel/Creative-Commons.htm)

The comparison started with the highest 70 linked 9×9 IDs on each source index in the snapshot, retaining the supported ordinary rule definitions credited to Otto Janko with the stated CC BY-NC-SA 3.0 terms. That yielded 60 Killers and 70 Jigsaws. Every published solution satisfied the parsed rules. The exact counter found one solution for all 130. Two Jigsaws exceeded the initial 100,000-node budget and completed with the 2,000,000-node retry.

In 52 Killers, at least one house had eight cells covered by complete cages. In 10 Jigsaws, three irregular regions differed by one cell from a horizontal band or vertical stack. Six had exactly one of the two partner cells given. Each implied placement was checked against the published solution. These are rates per puzzle for explicit constructions in one archive. Local copies supplied the source pages for this run. The reproduction script can fetch the same IDs from the publisher, checks the page attribution, and emits aggregate counts and normalized data hashes. [Killer index](https://www.janko.at/Raetsel/Sudoku/Killer/index.htm) · [Jigsaw index](https://www.janko.at/Raetsel/Sudoku/Chaos/index.htm) · [Comparison results](archive-results.json)

## Data and split details

- Nikoli’s 100 source puzzles are available under CC BY 4.0 at revision `9034906b4ec06ab1e08daf110c6b562ef72859fd`. Credit belongs to Nikoli. Local normalization uses zeros for empty cells and adds the app’s versioned ratings. The figures show newly generated puzzles. The Nikoli IDs in the worked comparison identify the training and holdout examples. [Dataset card](https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli) · [License](https://creativecommons.org/licenses/by/4.0/)
- Grant McLean’s Sudoku Exchange bank is publicly dedicated. The 60 local records come from revision `d8c8ebaee0c08c412cfba96af1923dfa61c83317`. The app selected them from four source files and an earlier grade scale. The overlapping grades contribute 12 Beginner, 12 Medium, and 6 Tricky controls. Treat the sample as a diagnostic of a different source. [Bank and selection provenance](../../../src/sudoku/collections/README.md)
- The classic canonicalizer handles digit renaming, transposition, and legal row, column, band, and stack permutations. A canonical clue mask ignores digit identity in that key. There were 100 distinct Nikoli structures and 95 distinct masks. Linking matching masks and the `nhkYYMM` ID prefix produced 51 connected holdout groups, the largest containing seven puzzles. The nonmatching ID used its own identifier. The prefix is a proxy for issue membership. The release credits a single publisher, so this split measures within-publisher generalization. [Canonicalizer](../../../crates/engine/src/generation/canonical.rs)
- For each Nikoli holdout, the selector draws one same-tier target from the other groups using a fixed hash of the holdout ID, without looking at its feature values. Four independent app seeds are hashes of the ID and slot. Both the unselected and selected policies receive the same pool. Ties use the earlier slot. Across all 100 pools, no candidate shared a canonical mask with either reference collection.
- All 560 classic grids were rechecked for exact uniqueness and canonical-profile grade. A separate Python enumerator agreed with the Rust deduction engine on all 1,680 measured classic wave counts. After a stall or completion subsequent widths are coded as zero for distribution comparisons. For the predictive test, a puzzle must have a positive first wave and at least one remaining empty cell after it. This excludes the structural zero after a stall.
- The output ranges for a wave are 0, 1, 2–3, 4–7, and 8 or more. The clue-count bands are below 25, 25–29, 30–34, and at least 35. Global outcome counts use a half-count per bin. Each child table adds eight pseudo-observations distributed according to its parent (global, then tier, then tier and clue band, then first-wave band). The added context saved 0.057 bits with strength four and 0.075 with strength sixteen. The interval in the report resamples 49 contributing holdout groups 2,000 times with their already cross-fitted losses. It omits uncertainty from refitting and editorial sampling.
- Wave-distribution distances weight each difficulty tier equally, including the seven Tricky puzzles. They are descriptive sample estimates. In Beginner the selector improved the first-wave gap but worsened the second from 1.00 to 1.43. In Easy the third-wave gap went from 1.63 to 1.77. The exact clue-count control had a choice between candidates in 32 of 100 pools. The edit follow-up compared 2,816 proposed swaps and 649 distinct grids across the two arms’ 704 certification slots. Timing and human outcomes were outside this pilot.
- The variant sweep used 12 deterministic calls in each family and tier, with no saved game history. The comparison counted distinct forced placements in the same initial position. Killer compares row, column and box domains with the engine’s cage-aware candidates. Jigsaw compares row and column domains with those from rows, columns and irregular regions. Forced placements must agree with the exact solution. Sample medians are per call and can reflect repeated fallback outputs. In Easy and Medium respectively the Killer median widths were 3 to 31 and 0 to 3.5. Jigsaw medians were 5 to 15 and 0 to 5.5. These are candidate computations, not human discovery times. [Per-cohort statistics](results.json)

## Reproduce from the repository root

The measurements used Git revision `1576b7094c6ea30f7ade397c331f1723a61d8bfe` with the working tree’s Killer layout and seed updates. The browser engine SHA-256 was `16a4b9eeeecc2e7b4293148816e5e5cdd85acac094199cb2480a803af48cff45`. The source catalog SHA-256 values were `c6a9efdedb393c026c7c3ba0491d3b3aeffa7b1cc62fbdd28ff822b21184bf03` for Nikoli and `7b490f8014cc1bc4f5f7f4f7f6a0e4e9c88a28662e302fd55086d7ee71357310` for Exchange. The variant seed file was `56c235876b42572a0d60e084daa0e600926522ba47a489a0882e4c58dfa115a6` and the Killer layout source was `43c111fe4ea4c5707ca1750e0439d6ae04625c28320613d65330ee43079b50ca`. This identifies the snapshot even if the branch later moves. The run used Node 26.13, Rust 1.99, and Python 3.15.

The external Cloud Sudoku CSV is CC0 in the author’s repository. Its pinned SHA-256 is `908bb0d269e93e687e72ab92662a7a3c152fe2aff681f3db46c845227972141c`. The reproduction command retrieves that release and the collector verifies its digest. [Pinned source](https://github.com/synnwang/sudoku_dataset_difficulty/blob/22d77ccd10ae54db75c3226f7a7eb8acb83b5317/20240415.csv)

From a checkout with the app’s build dependencies installed, these commands write raw data, the native checker and repeat results in a temporary directory. The committed comparison files are small summaries. The grid inside each example’s `winner.puzzle` is in the app engine’s structured format. Its `solution` is a separate field in `winner`.

~~~sh
workdir=$(mktemp -d)
study=docs/research/sudoku-construction
node scripts/ensure-wasm.mjs
curl -fsSL 'https://raw.githubusercontent.com/synnwang/sudoku_dataset_difficulty/22d77ccd10ae54db75c3226f7a7eb8acb83b5317/20240415.csv' -o "$workdir/20240415.csv"
for job in references beginner easy medium tricky variants human
do
  node --experimental-strip-types "$study/collect.mts" "$workdir" "$job" || exit 1
done
cargo build --release --locked -p sudoku-app-engine --lib
rustc --edition=2024 "$study/check-medium.rs" \
  --extern sudoku_app_engine=target/release/libsudoku_app_engine.rlib \
  -L dependency=target/release/deps -o "$workdir/check-medium"
python3 "$study/study.py" "$workdir" "$workdir/results.json" "$workdir/check-medium"
node --experimental-strip-types "$study/construct-variants.mts" \
  "$workdir/results.json" "$workdir/examples.json"
diff -u "$study/results.json" "$workdir/results.json"
diff -u "$study/examples.json" "$workdir/examples.json"
cargo build --release --locked -p sudoku-app-engine --features cli --bin sudoku-engine
python3 -B "$study/variant_archive.py" "$workdir/janko" target/release/sudoku-engine "$workdir/archive-results.json"
diff -u "$study/archive-results.json" "$workdir/archive-results.json"
~~~
