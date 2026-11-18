# Sinclair collection • first playtest

**230 playable puzzles.** Open **Puzzles → Collections**, choose a variant, then choose Sinclair. Each puzzle has a short code such as **C001**, **K001** or **X001**. A reply like “K014, 4/5, I liked the first cage deduction but the finish felt long” is enough to connect an impression to the construction record. The optional [playtest sheet](playtest.csv) has one row per puzzle.

The follow-up compares every Sinclair puzzle against the app’s normal generator at the same level. It includes six illustrated starting grids, measurements for all 230 puzzles, and playable source-hidden pairs. [Sinclair against New Puzzle](comparison/REPORT.md)

The downloadable library extends Sinclair to 100 puzzles at each of 66 variant and difficulty choices. The app fetches the chosen difficulty on demand. [Sinclair library and quality study](catalog/REPORT.md)

The earlier live generator tested a preference for half-turn symmetry across nine variants. Its study records generation time, clue geometry and the cost of preserving each difficulty. [Earlier live generator study](live/REPORT.md)

| Collection | Puzzles | Ten puzzles at each level |
| --- | ---: | --- |
| Sinclair Classic | 100 | Beginner, Easy, Medium, Tricky, Hard, Very Hard, Expert, Master, Extreme, Impossible |
| Sinclair Killer | 50 | Easy, Medium, Hard, Very Hard, Master |
| Sinclair X Sudoku | 80 | Easy, Medium, Tricky, Hard, Very Hard, Expert, Master, Extreme |

Every Killer starts with an empty grid and connected sum cages covering all 81 cells. Every X Sudoku uses both long diagonals and admits multiple completions if the diagonal rules are removed. The full definitions are available through the app’s normal puzzle downloads.

## Learning from a solve

A Sudoku solution grid tells us which digit belongs in each cell. It says little about the experience of finding those digits. Consider two puzzles with a single advanced deduction. In one, that deduction gives the player a series of easy placements. In the other, the player must find several more candidate eliminations before placing a digit. The app can give both puzzles the same difficulty. A sequence model can distinguish those paths.

For each source puzzle, the solver recorded a complete path, rotated the puzzle through 180°, and solved it again. The different scan order gives a second plausible path through the same clues. A move is represented by its deduction family, whether it places digits or removes candidates, the number of affected candidates and whether the next move stays in the same row, column or box. The encoding also distinguishes a deduction that cites a diagonal or the sum of a house. Training sees these events and the puzzle’s family and grade. Only the construction and verification code sees the grid.

Janko’s replays provide a second view. A replay records placements and pencil-mark edits in order. We accepted a replay only when every initially empty cell received its published digit exactly once. From those moves we measured how often consecutive placements share a house, how often they repeat a digit, and the proportion of pencil-mark edits in the opening and across the solve. Pencil marks reveal what the solver wrote. They rarely identify the reasoning behind a move. [Janko’s archive and replay guide](https://www.janko.at/Raetsel/Sudoku/index.htm)

| Source | Distinct puzzles with complete engine paths | Use |
| --- | ---: | --- |
| Nikoli | 100 classic | Handmade reference set curated with Nikoli. [Dataset and attribution](https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli) |
| Janko archive | 206 classic, 165 Killer, 64 X | Credited puzzles by multiple authors. The pages supplied 150 classic, 154 Killer and 35 X verified player replays. Construction methods vary by source. [Classic and X archive](https://www.janko.at/Raetsel/Sudoku/index.htm) · [Killer archive](https://www.janko.at/Raetsel/Sudoku/Killer/index.htm) |
| WPF Sudoku Grand Prix | 7 X | Hand-set competition puzzles reserved for an external test. Each page was checked for ordinary boxes and the two marked diagonals. [Competition booklets and round credits](https://www.janko.at/Raetsel/Sudoku/Grand-Prix/index.htm) |
| Sudoku Exchange | 60 classic | Generated comparison set reserved for testing. [Puzzle bank](https://github.com/grantm/sudoku-exchange-puzzle-bank) |

The 602 puzzles yielded 1,204 engine paths and 104,672 deduction events. Clue layouts stayed together across training, validation and testing, including their rotated paths. The two external sets were reserved before fitting. The downloadable research snapshot contains digit-free paths, replay summaries, source identifiers, attribution and hashes. [Reference snapshot](reference-traces.jsonl.gz)

## What compression learned

The sequence model predicts one of 16 deduction families at each step. It combines six estimates, from the overall move frequency to the last two moves in the same variant. It can still assign probability to an unfamiliar transition. We fitted the mixture for 100 rounds and selected the checkpoint with the shortest validation code length. Each reference puzzle has equal weight in the comparison.

| Evaluation set | Puzzles | Move frequency alone | Previous move, family and phase | Learned mixture |
| --- | ---: | ---: | ---: | ---: |
| Training | 352 | 2.127 | 1.151 | 1.144 |
| Validation | 88 | 2.153 | 1.178 | 1.168 |
| Held-out archive puzzles | 95 | 2.156 | 1.187 | **1.180** |
| WPF X Sudoku | 7 | 3.109 | 2.192 | **2.142** |
| Sudoku Exchange classic | 60 | 2.719 | 1.701 | **1.595** |

Values are bits per deduction. Lower values mean the next deduction family was easier to predict. On the 95 held-out archive puzzles, knowing the previous move, variant and solve phase accounts for most of the gain. The learned mixture reduced the cost by a further 0.007 bits per deduction. The seven competition puzzles were harder to predict under every model. [Training history and measurements](training.json)

A second model used 100 rounds of regularized regression to predict the four player-replay measurements from an engine path. Validation selected round 17. Among 57 held-out replays, using the model lowered mean absolute error for overall pencil-mark share from 7.73 to 6.98 percentage points and for opening pencil-mark share from 10.30 to 9.26. The family average did better for staying in the same house (5.74 versus 5.99 points) and repeating a digit (5.22 versus 5.37). Two credited solvers supplied 280 of the 339 replays. Individual preferences and pencil-mark habits remain important.

## Constructing the collection

1. **Make candidates.** For classic Sudoku, carve fresh completed grids. For difficult targets, also add or exchange clues on the app’s certified hardest-puzzle bank and regrade. For X Sudoku, carve a diagonal-valid solution while checking uniqueness, then try clue exchanges. For Killer, join orthogonally adjacent cells whose solution digits differ. A second Killer constructor searches for a target grade, converts any given digits to singleton cages, splits disconnected remainders and regrades. [Hardest-puzzle bank attribution](../../../crates/engine/data/README.md)
2. **Score the experience.** Compare the path’s code length, four predicted replay measurements and distribution of techniques with reference paths. A path can be too predictable for its group. An endless run of routine moves receives no automatic advantage. Where training contains at least 12 puzzles in the exact family and tier, use those puzzles as the reference. Otherwise broaden first to adjacent difficulty levels within the family and then to the whole family.
3. **Edit the promising puzzles.** Over four generations the model chose up to three parents per family and tier, edited their clues or moved a cage boundary, then re-solved the children. Of 804 attempted edits, 192 preserved the requested grade. The best reference-fit score improved in 10 of 23 groups and held steady in 13. This measures progress on the search objective. [Construction history](construction-rounds.json)
4. **Choose ten different paths.** Recheck shortlisted puzzles in the original and rotated orientations. Favor a range of paths within each group. A clue layout and construction lineage may each appear only once across the edition. Classic tiers with at least 20 independent fresh candidates draw exclusively from those lineages. The catalog uses the engine rating in the orientation the player sees. [Selection evidence](selection.json)

### Results of the search

Across 34 seed streams, the constructors tried **27,673 proposals**. Successful proposals and their cage conversions yielded 5,619 complete candidate paths. After checking difficulty, source overlap and edition requirements, the selector considered 832 classic, 784 Killer and 1,829 X candidates. It compared two complete paths on 1,132 shortlisted candidates.

The final 230 puzzles have 230 distinct construction lineages and 230 distinct clue layouts under the checks used here. The classic layout check allows legal row, column, band and stack permutations as well as transposition. The variant check compares the eight rotations and reflections of the square, ignoring cage sums when comparing Killer layouts. Twenty puzzles arrived through the four model-guided rounds. Twenty-eight classics use edited forum-bank positions, including eight Master, ten Extreme and ten Impossible puzzles. Their canonical clue patterns differ from every entry in the source bank. The other 72 classics descend from fresh grids. All 230 received the same app grade after the half-turn, although their legal move orders can differ.

In every one of the 23 groups, the selected ten had a lower average distance to the reference style than ten randomly chosen eligible candidates. Across groups the average was **1.080 versus 1.591** in the selector’s own units. The selector directly optimized this quantity, so the result demonstrates that it can steer the generated collection. Whether that difference matters to a player is what the playtest measures. [Per-group comparison and puzzle ledger](selection.json) · [Independent solution counts](verification.json)

**The weakest evidence is at the top of the scale.** The training split contained seven Easy and 102 Medium Killers, with zero harder Killers. Its 41 X puzzles reached Tricky. For these upper groups the app can verify the difficulty and the deductions, but the learned style target is an extrapolation. Impossible is also a solver-defined classic category, with no promise of a practical human solve. A low enjoyment score in one of these groups is especially informative.

## What to test by playing

Did the opening give you a fair way in? Was there a deduction you enjoyed finding? Did the ending stay interesting? One short comment about a specific moment can explain more than a rating alone. The feedback sheet also accepts a perceived difficulty if the app’s label felt off.

This first edition gives us baseline feedback on the selected puzzles. To establish whether the selector improves enjoyment, a later matched playtest should mix fresh model-selected puzzles with randomly selected candidates at the same grade and keep the selection method hidden until after scoring. [Original construction study](../sudoku-construction/REPORT.md) · [Reproduction instructions](../../../scripts/sinclair/README.md)

## Research notes

**November 17, 2026.** The app offers ten classic levels, five Killer levels and eight X levels. The first edition calls for ten puzzles at each selectable level. The app will serve the finished puzzles through its collection catalog. Construction, training data and model weights belong to the offline workflow.

**What the source material records.** Nikoli identifies its contributed set as handmade. Janko’s puzzle pages can include a credited solver and a replay of placements and pencil marks. The competition archive identifies its authors by round. A model can compare the order of discoveries, spatial continuity and use of notes with an actual replay. A pencil mark records an action, but usually leaves the solver’s reason unstated. [Nikoli dataset](https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli) · [Janko archive and replay description](https://www.janko.at/Raetsel/Sudoku/index.htm) · [WPF competition archive and credits](https://www.janko.at/Raetsel/Sudoku/Grand-Prix/index.htm)

**Early construction results.** In the first 850 fresh Killer partitions, 596 had multiple solutions, 105 reached the bounded search limit and five stalled in the logical solver. The engine certified 57 Easy, 84 Medium and three Master puzzles. Finding intermediate and upper levels requires a more directed search. The second constructor grades the puzzle during clue removal. It also tries replacing given digits with singleton cages and rerates the resulting puzzle.

**Release check.** An independent exhaustive counter found exactly one completion for each of the 230 puzzles and matched its solution hash to the final cell values reached by the native logical solver. The browser engine reproduced the published grades, point totals and hardest techniques. A second run retrained both models, verified the cached candidate streams by SHA-256, repeated all four guided generations, and reproduced the three released puzzle files byte for byte. [Independent verification](verification.json) · [Release ledger](selection.json)

**Delivery.** The production build contains 230 optional puzzle downloads for the playtest. The trained parameters, replay corpus and selection ledger live in the research directory. Packing the collection index into tuples keeps metadata for all 502 app puzzles and their collection headers at 46,500 bytes, or 11,754 bytes gzipped.
