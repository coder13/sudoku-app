# Learning to generate Sudoku from hand-set puzzles

A small model can learn where a setter puts clues. The clearest improvement came from learning how many cells belong in a Killer cage. In 64 Medium Killer requests, sampling cage sizes produced 54 qualifying puzzles. Learning individual shapes produced 52. The current fresh search produced 23.

I would pilot Medium Killer first. For classic Sudoku, I would train on several setters and learn which deductions lead to the next move. For Jigsaw, the new shapes look closer to the examples, but too few puzzles reach the requested grade.

### Two Easy puzzles from the same seed

**Current fresh search.** 34 givens, 12 opening singles. [Open this puzzle](https://coder13-sudoku.netlify.app/#puzzle=090706000000002590026900004048000030730804001610300080800060700060070209970201060).

**Learned clue placement.** 28 givens, 11 opening singles. [Open this puzzle](https://coder13-sudoku.netlify.app/#puzzle=400706028080000006000000100208010037000804000610090402002000000100000040970201005).

An opening single is a cell you can fill immediately by checking one cell, row, column or region. Count each cell once. A given is a digit printed at the start. The same grade can leave players with very different opening choices.

### What would count as better?

For the model, better means fewer bits to describe a new layout. For the generator, it means more valid puzzles at the requested grade and a greater variety of solving paths. For the player, it means a puzzle they would choose to solve again. The first two have measurements here. The third needs a blind trial.

## Where the examples came from

Nikoli provides a rare starting point. Its editors describe hand construction as a way to guide a solver through the puzzle. The released set contains 100 classic grids and credits Nikoli. The app already holds a graded copy. [1, 2]

| Collection | Fit / test | Use in this study |
| --- | --- | --- |
| Nikoli 100 | 79 / 21 | Classic clue locations, opening singles and four app grades. |
| Six named classic setters | 0 / 82 | Independent test of the Nikoli model. Each setter also forms a separate test group in a follow-up. |
| Janko Killer, via Puzzlekit | 415 / 71 | Connected cage partitions and sums checked against the published solution. |
| Janko Chaos, via Puzzlekit | 109 / 23 | Nine connected regions of nine cells. Checked givens and the published solution. |
| Sudoku Exchange | 0 / 60 | Computer-generated control from the app collection. |

The 82 classics come from transcriptions credited to Philip Newman (29), Bill Murphy (24), Sam Cappleman-Lynes (19), Wei-Hwa Huang (4), Thomas Snyder (3) and Clover (3). Of 103 candidate entries, 82 used the supported plain-givens format. All 82 encoded grids had one solution and differed from the Nikoli set under standard Sudoku transformations. Transcription errors in the source can still survive those checks. [11, 12]

The Janko archives credit setters on individual pages. They support a study of published variant designs. Each setter’s construction process and a consistent difficulty label are unavailable for these records. The variant model therefore learns shapes across grades. The app grades what it generates. [8, 9, 10]

### Keep related puzzles together

We group rotations and reflections before splitting. For classic, we group clue layouts and hold out about one fifth within each app grade. For variants, we group region or cage partitions and split by a fixed hash. Copies with the same group key stay on one side of the split. The harder classic tiers still need their own training examples.

Nikoli’s release lists CC BY 4.0. Collection records stay with their sources. The checked-in model contains aggregate counts. Record the setter, source, publication terms and transformations when adding a collection. Sudoku Exchange documents its computer generation process. [1, 13]

## What compression actually learned

A mask records which of the 81 cells contain a given. Suppose the top-left cell has a given. If the grid has half-turn symmetry, the bottom-right cell must also have one. A short description can state the symmetry once, then describe just 41 cells. A good prediction costs fewer bits. [3]

The local model predicts each cell from its position within a box and the number of givens directly above and to its left. Nine small tables hold these odds. The symmetry model uses one shared clue probability. A third method sends the clue count and the index of the pattern among all layouts with that count. All three pay for the symmetry flag.

| Held-out collection | Cells independent | Symmetry | Count + symmetry | Local model |
| --- | --- | --- | --- | --- |
| Nikoli (21) | 72.82 | 36.97 | 36.10 | 30.16 |
| Other setters (82) | 72.82 | 46.66 | 47.53 | 53.93 |
| Exchange (60) | 75.98 | 55.72 | 56.88 | 62.99 |

Mean bits per clue mask. Lower is better. Digit values, solutions and solving steps are outside this score. Given the fitted model, Nikoli layouts saved 6.80 bits over symmetry alone. A board-level bootstrap put the 95% interval at 4.32 to 9.10 bits. On other setters the local model spent 7.27 extra bits. The control moved in the same direction.

### Let several styles compete

A follow-up held out one entire setter at a time. It averaged the probabilities from the remaining setter models, a Nikoli model and a pooled symmetry model. On the 82 puzzles, that mixture used 44.01 bits on average. Pooled symmetry used 46.09, and one pooled local model used 47.27. The mixture improved on pooled symmetry for all six setters, including the two with just three examples.

The cross-setter result changes the design. Sample a style for each puzzle, then use its layout model throughout. Test this mixture on a new archive before using it as a generator. We chose the experiment after seeing the first external result.

### Charge the model for its own size

The three-family file is 1,590 bytes. The 21 Nikoli masks saved about 143 bits against symmetry. These conditional scores establish a recurring pattern. For a full minimum-description-length comparison, count what both sides need to send, including model parameters, or score each new batch before fitting it. Report the crossover as the collection grows. [3]

## Classic puzzles need a solving path

Start with a fresh solution. Sample a target clue count and opening-single count for the requested grade. Draw 12 clue masks and choose the closest clue count. Remove clues in the suggested order. Restore each removal that permits a second solution. Check the closest surviving boards with the app’s logical grader.

| App grade | Current fresh search | Symmetry only | Learned placement |
| --- | --- | --- | --- |
| Beginner | 64 | 64 | 64 |
| Easy | 64 | 64 | 64 |
| Medium | 15 | 3 | 9 |
| Tricky | 30 | 14 | 16 |

Requests that reached the exact app grade, out of 64 per cell. Each method had six starting grids per request. The symmetry control uses a random symmetric mask with the same target clue count. Each method can do a different amount of work per grid.

### A more human-looking opening only solves part of the problem

On Easy, the current search averaged 31.0 givens and 10.1 opening singles. Learned placement averaged 28.3 and 7.2. Symmetry alone gave 28.6 and 8.4. The learned version changed both the layout and how it ranked openings. The seven held-out Easy puzzles averaged 24.4 and 3.0. The change moved both measures toward the reference. It also left more singles than the setters did.

The classic fit used 11 Beginner, 28 Easy, 35 Medium and 5 Tricky puzzles. The test set contained 3, 7, 9 and 2. Sparse Tricky evidence and the absence of harder grades limit how far we can use the fit.

### Trade clues to change what the player must see

A second version tried up to 32 swaps between pairs of given and blank cells. It kept unique puzzles and preferred swaps that reached the grade or used more relevant techniques. It matched 15 of 64 Medium requests, level with the current search. It matched 39 of 64 Tricky requests against 30. It won on 22 paired seeds and lost on 13. The two-sided exact paired test gave p = 0.175.

For the next classic version, target a short chain of deductions. For example, a pointing move removes two candidates and opens a single. Test whether easier techniques can bypass that move. Pelánek found that both step complexity and dependencies helped explain human difficulty across more than 1,700 puzzles. [4]

## Killer Sudoku starts with the cages

Fit a distribution over connected cage shapes. Tile a new solution with random orientations of these shapes. Digits must be distinct within each cage. Compute the sums, test for a unique solution and split a cage when a repair is needed. Allow up to four repairs. The app then checks the requested grade and tests that the extra rule matters.

| App grade | Current fresh search | Learned cages, zero givens |
| --- | --- | --- |
| Easy | 64 | 20 |
| Medium | 23 | 52 |
| Hard | 2 | 0 |

**A first move from the sum** The shaded cage contains R1C6 and R2C6. It sums to 17. The only two distinct digits that work are 8 and 9. A player can mark both cells before placing a digit. [Open this puzzle](https://coder13-sudoku.netlify.app/#variant=%7B%22id%22%3A%22killer-cages%22%2C%22puzzle%22%3A%7B%22givens%22%3A%22000000000000000000000000000000000000000000000000000000000000000000000000000000000%22%2C%22regions%22%3A%7B%22type%22%3A%22boxes%22%7D%2C%22rules%22%3A%5B%7B%22cages%22%3A%5B%7B%22cells%22%3A%5B0%2C1%5D%2C%22sum%22%3A8%7D%2C%7B%22cells%22%3A%5B2%2C10%2C11%5D%2C%22sum%22%3A15%7D%2C%7B%22cells%22%3A%5B3%2C4%5D%2C%22sum%22%3A8%7D%2C%7B%22cells%22%3A%5B5%2C14%5D%2C%22sum%22%3A17%7D%2C%7B%22cells%22%3A%5B6%2C7%5D%2C%22sum%22%3A5%7D%2C%7B%22cells%22%3A%5B8%2C16%2C17%5D%2C%22sum%22%3A18%7D%2C%7B%22cells%22%3A%5B9%2C18%5D%2C%22sum%22%3A17%7D%2C%7B%22cells%22%3A%5B12%2C21%2C30%5D%2C%22sum%22%3A15%7D%2C%7B%22cells%22%3A%5B13%2C22%5D%2C%22sum%22%3A7%7D%2C%7B%22cells%22%3A%5B15%2C23%2C24%5D%2C%22sum%22%3A14%7D%2C%7B%22cells%22%3A%5B19%2C20%5D%2C%22sum%22%3A5%7D%2C%7B%22cells%22%3A%5B25%2C26%5D%2C%22sum%22%3A15%7D%2C%7B%22cells%22%3A%5B27%2C36%5D%2C%22sum%22%3A13%7D%2C%7B%22cells%22%3A%5B28%2C37%5D%2C%22sum%22%3A17%7D%2C%7B%22cells%22%3A%5B29%2C38%5D%2C%22sum%22%3A8%7D%2C%7B%22cells%22%3A%5B31%2C40%2C41%5D%2C%22sum%22%3A8%7D%2C%7B%22cells%22%3A%5B32%2C33%5D%2C%22sum%22%3A11%7D%2C%7B%22cells%22%3A%5B34%2C35%2C43%2C44%5D%2C%22sum%22%3A15%7D%2C%7B%22cells%22%3A%5B39%2C48%2C49%5D%2C%22sum%22%3A18%7D%2C%7B%22cells%22%3A%5B42%2C51%5D%2C%22sum%22%3A15%7D%2C%7B%22cells%22%3A%5B45%2C54%5D%2C%22sum%22%3A7%7D%2C%7B%22cells%22%3A%5B46%2C55%2C64%5D%2C%22sum%22%3A11%7D%2C%7B%22cells%22%3A%5B47%2C56%5D%2C%22sum%22%3A10%7D%2C%7B%22cells%22%3A%5B50%2C59%5D%2C%22sum%22%3A8%7D%2C%7B%22cells%22%3A%5B52%2C60%2C61%5D%2C%22sum%22%3A18%7D%2C%7B%22cells%22%3A%5B53%2C62%5D%2C%22sum%22%3A4%7D%2C%7B%22cells%22%3A%5B57%2C66%5D%2C%22sum%22%3A11%7D%2C%7B%22cells%22%3A%5B58%2C67%5D%2C%22sum%22%3A17%7D%2C%7B%22cells%22%3A%5B63%2C72%5D%2C%22sum%22%3A5%7D%2C%7B%22cells%22%3A%5B65%2C73%2C74%5D%2C%22sum%22%3A19%7D%2C%7B%22cells%22%3A%5B68%2C77%5D%2C%22sum%22%3A8%7D%2C%7B%22cells%22%3A%5B69%2C70%2C71%5D%2C%22sum%22%3A11%7D%2C%7B%22cells%22%3A%5B75%2C76%5D%2C%22sum%22%3A7%7D%2C%7B%22cells%22%3A%5B78%2C79%2C80%5D%2C%22sum%22%3A20%7D%5D%2C%22coverGrid%22%3Atrue%2C%22type%22%3A%22killer-cages%22%7D%5D%2C%22version%22%3A1%7D%7D).

Each result above is out of 64 requests with four attempts each. On Medium, the learned generator won on 31 paired seeds and lost on two. Its accepted puzzles averaged 34.9 cages and 15.6% bent cages. The current Medium sample averaged 29.4 cages, all straight, and 10.3 starting digits. The published holdout averaged 33.9 cages and 20.1% bent cages.

Most of the predictive gain came from cage size. On held-out cage tokens, a uniform code used 4.459 bits, size alone used 1.688 and exact shape used 1.684. The score ignores orientation, position and sums. In two follow-up tests on the same 64 Medium seeds, equal weights for shapes of a given size produced 54 matches. Requiring zero givens with the current cage recipe produced zero. The simpler size model merits the first player trial.

Use zero givens as one option. Thomas Snyder explains how he used starting digits in Eight Ouroboros to start a planned loop of deductions involving eights. A model should leave room for that choice. [14]

## Jigsaw Sudoku starts with the borders

Sample a target region perimeter from the archive. Starting with ordinary boxes, swap boundary cells between adjacent regions. Each swap must preserve nine connected cells in both regions. Generate a valid solution, remove givens, then ask the engine to prove uniqueness and the requested grade.

| App grade | Current fresh search | Learned regions | Regions + paired givens |
| --- | --- | --- | --- |
| Easy | 63 | 52 | 50 |
| Medium | 59 | 32 | 32 |
| Tricky | 5 | 1 | 0 |

**A placement from the region** The shaded region has one place for 8, at R4C4. Both its row and its column still have other candidates for 8. The region gives the deduction. [Open this puzzle](https://coder13-sudoku.netlify.app/#variant=%7B%22id%22%3A%22jigsaw%22%2C%22puzzle%22%3A%7B%22givens%22%3A%22004008030009000806900400013020000000001340008490671000000050900100004050805010009%22%2C%22regions%22%3A%7B%22regions%22%3A%5B%5B0%2C9%2C10%2C11%2C12%2C19%2C20%2C21%2C28%5D%2C%5B1%2C2%2C3%2C4%2C13%2C14%2C15%2C22%2C31%5D%2C%5B5%2C6%2C7%2C8%2C16%2C17%2C24%2C25%2C34%5D%2C%5B18%2C27%2C29%2C36%2C37%2C38%2C47%2C55%2C56%5D%2C%5B23%2C30%2C32%2C39%2C40%2C41%2C48%2C49%2C50%5D%2C%5B26%2C33%2C35%2C42%2C43%2C44%2C51%2C53%2C60%5D%2C%5B45%2C46%2C54%2C63%2C64%2C72%2C73%2C74%2C75%5D%2C%5B57%2C58%2C59%2C65%2C66%2C67%2C68%2C76%2C77%5D%2C%5B52%2C61%2C62%2C69%2C70%2C71%2C78%2C79%2C80%5D%5D%2C%22type%22%3A%22jigsaw%22%7D%2C%22rules%22%3A%5B%5D%2C%22version%22%3A1%7D%7D).

Each result is out of 64 requests with four attempts each. Count perimeter in unit cell edges. The published holdout averaged 16.69 per region. Easy puzzles from the current search averaged 13.94. Learned regions averaged 16.70 with either removal method. For paired removal, 45 of the 50 accepted Easy puzzles had symmetric givens. In the holdout, 17 of 23 did.

The Jigsaw local clue predictor used 48.15 bits per mask. Symmetry alone used 47.86. Learning a border length produced the intended outline, yet hitting Medium and Tricky became harder. Keep the current search for those grades while testing which boundaries lead to an actual deduction.

A next target is the Law of Leftovers. Choose the same number of complete rows and complete regions. Their unmatched cells must contain the same digits, with the same counts. Seek a boundary that makes this deduction available, then check whether the player needs it. [15]

## Teach the generator to plan a deduction

I would keep the Rust solver in charge of correctness. A small model proposes clues or constraints, the solver records what they make possible, and the generator edits the board. The proof gives us something we can inspect when a puzzle feels wrong.

### 1. Learn from moves as well as cells

For each source puzzle, replay the app’s techniques. Record the number of available moves at the start, where singles run out, the first productive harder move, and which moves it unlocks. Group moves that rely on the same candidate removal. Replay a few different orders of equally easy moves. A setter’s intended route can differ from one solver’s first route. Editor notes or human hint histories, when available for this purpose, give independent checks. [2, 4]

### 2. Build around a reason to use the rule

| Puzzle | Proposed target | How to test it |
| --- | --- | --- |
| Classic | Pointing opens a specific single. | Disable pointing. Check whether the same single appears through an easier route. |
| Killer | Cages covering most of a box use its total of 45. | Trace the crossing cage and the sum that becomes forced. Try an easier route. |
| Jigsaw | A border forces a digit outside a region. | Track which candidates the irregular boundary removes and when. |
| Diagonal or line variants | A diagonal single, thermometer bound or arrow sum starts a sequence. | Remove the rule and repeat the same proof search. Check that the deduction changes. |

Start with bounded search around the app’s existing technique generator. For a deliberate teaching example, an exact constraint model can require a permitted strategy set. Nishikawa and Toda show how to generate strategy-solvable clues this way. Limit costly searches to an offline puzzle bank. [5, 6]

### 3. Keep several different good answers

Store one strong puzzle in each combination of grade, opening choices and first essential technique. Replace it when a new candidate scores better in that group. This adapts the MAP-Elites approach and gives players more than one kind of Medium. A graph or sequence model could later rank clue edits from proof traces. First require it to beat the small models on unseen setters at the same compute cost. Diffusion research on valid completed grids addresses a different stage of the problem. [7, 16]

## Which version should reach players?

Pilot the size-only model for Medium Killer. Generate a small bank ahead of play. In the main benchmark, the full shape model had a median native search time of 135 ms, against 61 ms for the current search. Classic Easy belongs in a comparison of opening styles. Jigsaw Medium and Tricky need better search before a player pilot.

### Run a blind comparison within each grade

Recruit an initial 48 to 64 volunteers across relevant skill levels. Give each player two matched pairs across visits. Randomize puzzle source and order. Rotate puzzles across players. Include unseen hand-set examples with suitable reuse terms as a reference. Hide the source. After each pair, ask which they would choose to play again. Offer a tie and record unfinished puzzles.

Choose preference as the primary outcome before collecting data. Report wins, losses, ties and a 95% interval that accounts for both player and puzzle. Keep hint use, time to the first move, abandonment and perceived grade as separate outcomes. Check whether familiarity with a technique changes the result. Run a larger trial if the interval spans equal preference. A Sokoban study found that observed play added information about enjoyment beyond visual features. Sudoku needs its own trial. [17]

### Make adoption a decision per variant and grade

| Check | Proposed decision rule |
| --- | --- |
| Correctness | Every accepted board has one solution and passes the app grader. Removing the tested rule must permit multiple solutions. Reject failures and timeouts. |
| Novelty | Compare classic grids under Sudoku transformations and variant layouts under rotation, reflection and label changes. Count repeats between generated puzzles too. |
| Compute and coverage | Compare the full app, including fallbacks, on equal time budgets and representative phones. Keep the current fallback when a new proposal runs out of time. |
| Player preference | Promote one grade at a time when players prefer the new puzzles, the interval excludes a tie, and the grade and completion checks hold. |

In the run, 207 accepted learned or traded classics contained 185 distinct canonical puzzles and zero matches to the 182 reference classics. Across 167 accepted Jigsaw outputs, there were 79 distinct region layouts. All 72 accepted Killers had distinct cage layouts. None of these variant layouts matched their respective source collection under the transforms tested. A repeat can occur when two methods accept the same seed.

## How to reproduce the measurements

The experiment uses the engine and the collections from coder13/sudoku-app at main revision 31573ea. The prototype, training counts, benchmark and per-grade summary are in the research branch. The code pins the source revisions and checks the downloaded data.

| Part | Location in the project |
| --- | --- |
| Fit and held-out tests | scripts/generator/train.py and validate.py |
| Generate and compare | scripts/generator/sample.py and benchmark.py |
| Rust carving and grading | crates/engine/examples/generator_lab.rs and the existing engine |
| Model and study output | scripts/generator/model.json and results.json |
| Commands and source revisions | scripts/generator/README.md |

[Open code, commands and results on GitHub](https://github.com/coder13/sudoku-app/tree/codex/learned-puzzle-generator/scripts/generator).

### What the benchmark counts

One request asks for one family and one exact grade. A hit means a qualifying puzzle was found within the attempt budget. Every method in a family gets the same 64 request seeds, starting at sequence offset 1000. Classic has at most six grid attempts, variants four. The two extra experiments test classic clue trades on Medium and Tricky and paired givens on Jigsaw. The main run has 1,856 requests. Two more Medium Killer controls add 128, for 1,984 in total.

The current classic comparator calls the engine’s fresh targeted search. The current variant comparator starts from the app’s per-grade recipes. Normal app play can also use larger budgets, a technique focus, templates or a fallback. The results here apply to the specified searches. Recorded native times include process startup and concurrent jobs. Compare mobile end-to-end latency separately.

The verification pass rechecks unique solutions. For Killer it also checks coverage, sums and distinct digits within each cage. For classic it independently recomputes opening singles. Layout comparisons use a fixed set of transformations. They cannot identify every possible resemblance or alternate human solving path.

### Data to collect next

For harder classic tiers, invite setters to contribute packs with source, allowed uses, difficulty, intended first hard move and one sentence on the intended solve. Split by setter or publication before fitting. Keep one untouched source for the final model decision. For variants, collect examples with player grades and named deductions, including failures and routine puzzles. This would let us learn which features survive across editors and which serve one style.

## Sources and further reading

Numbers throughout the report refer to these sources. Select a title to open it.

1. Nikoli and Sakana AI. [Nikoli 100 dataset and reuse terms](https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli).

2. Nobuhiko Kanamoto and Maki Kaji. [Why hand made](https://www.nikoli.co.jp/en/puzzles/sudoku/why_hand_made/).

3. Peter Grünwald. [Model Selection Based on Minimum Description Length, 2000](https://iri.columbia.edu/~tippett/cv_papers/Grunwald.pdf).

4. Radek Pelánek. [Difficulty Rating of Sudoku Puzzles: An Overview and Evaluation, 2014](https://arxiv.org/abs/1403.7373).

5. Kohei Nishikawa and Takahisa Toda. [Exact Method for Generating Strategy-Solvable Sudoku Clues, 2020](https://doi.org/10.3390/a13070171).

6. Barbara De Kegel and Mads Haahr. [Procedural Puzzle Generation: A Survey, 2020](https://www.scss.tcd.ie/mads.haahr/papers/de-kegel-2020-transactions.pdf).

7. Mariia Drozdova. [Can Continuous-Time Diffusion Models Generate and Solve Globally Constrained Discrete Problems? A Study on Sudoku, 2026 preprint](https://arxiv.org/abs/2601.20363).

8. Angela and Otto Janko. [Killer Sudoku archive and individual setter credits](https://www.janko.at/Raetsel/Sudoku/Killer/index.htm).

9. Angela and Otto Janko. [Chaos Sudoku archive and individual setter credits](https://www.janko.at/Raetsel/Sudoku/Chaos/index.htm).

10. SmilingWayne. [Puzzlekit dataset, exact variant snapshot](https://github.com/SmilingWayne/puzzlekit-dataset/tree/f4b71bc9170c4a072fad7056e140c14968941c3d).

11. sigh. [CTC to ISS index, exact transcription snapshot](https://github.com/sigh/iss-sudoku-index/tree/7d9119de588fdab20e3c379db20839909c5f0785).

12. Genuinely Approachable Sudoku. [Setter credits and original puzzle compilations](https://www.sudokutheory.com/gas/).

13. Grant McLean. [Sudoku Exchange puzzle bank and generation method](https://github.com/grantm/sudoku-exchange-puzzle-bank).

14. Thomas Snyder. [Eight Ouroboros, construction notes and puzzle, 2023](https://www.gmpuzzles.com/blog/2023/04/killer-sudoku-by-thomas-snyder/).

15. Andrew Stuart. [The Law of Leftovers for Jigsaw Sudoku](https://www.sudokuwiki.org/Print_Law_of_Leftovers).

16. Jean-Baptiste Mouret and Jeff Clune. [Illuminating Search Spaces by Mapping Elites, 2015](https://arxiv.org/abs/1504.04909).

17. Junyi Chu, Kristine Zheng and Judith E. Fan. [What makes people think a puzzle is fun to solve?, 2025](https://cogtoolslab.github.io/pdf/chu_cogsci_2025.pdf).
