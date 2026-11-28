# Generating Sudoku puzzles that need their variants

## What setters and solvers found

* A setter trying to force an X-Wing described generating completed grids, removing givens and checking the solution path. A solver pointed out that another elimination can destroy the X-Wing before it becomes necessary. In a separate setting discussion, constructors described solving their own puzzles during construction and finding simpler paths around the intended logic. These are two separate checks for a generator. It needs a complete solve at the target grade and it must try to beat that grade. [X-Wing construction discussion](https://puzzling.stackexchange.com/questions/614/how-do-i-necessitate-the-use-of-the-x-wing-pattern-during-sudoku-creation) · [Discussion among setters](https://www.reddit.com/r/sudoku/comments/1fvatr7/dear_setters_how_do_you_do_it/)
* The author of Sudoku Coach explained to a player why requiring an X-Wing, a Y-Wing and an XYZ-Wing together yields fewer puzzles. A count on one chosen solution path still permits a shortcut on another path. Sudoku Explainer's FAQ gives a further reason to check other orders. An easy elimination can also destroy a useful pattern and leave a harder finish. [Sudoku Coach generation discussion](https://www.reddit.com/r/sudoku/comments/13l8ev4/need_advice_on_how_to_use_sudoku_coach_to/) · [Sudoku Explainer FAQ](https://github.com/SudokuMonster/SukakuExplainer/wiki/SE121---FAQ)
* An enumeration of Non-Consecutive grids shows how rarely a random classic solution obeys that single global rule. Sample the completion with the global rules already active. For drawn clues, SumoCue's author describes the complementary approach of drawing cages over a completion and calculating their totals. This gives a generator a known solution while it changes the clue layout. [Non-Consecutive enumeration](https://puzzling.stackexchange.com/questions/119189/how-many-nonconsecutive-sudoku-solutions-are-there) · [SumoCue constructor's guide](https://www.sudocue.net/sumocue.php)
* A worked Killer solve uses the possible pairs for a sum of 13, then checks how the remaining cage digits fit a column of total 45. A Thermometer discussion shows how an increasing sequence can fix positions elsewhere in a box. Both are examples of a clue restricting candidates that another house needs. The same house and clue can supply links in a longer deduction. [Killer Thirteens solve](https://puzzling.stackexchange.com/questions/138242/killer-sudoku-thirteens) · [Thermometer construction challenge](https://puzzling.stackexchange.com/questions/92377/how-much-information-can-we-get-from-a-thermometer)
* An Arrow and Thermometer solve uses thermometer bounds to raise the minimum sum on two arrows sharing an endpoint. In a zero-given 5×5 Jigsaw Thermometer, a thermometer fixes a column and an irregular region determines which remaining cell can contain 1. Both examples show why testing each family in isolation misses mixed deductions. The 5×5 example demonstrates a method. Its size matters when drawing conclusions about 9×9 puzzles. [Arrow and Thermometer walkthrough](https://puzzling.stackexchange.com/questions/118883/pse-advent-calendar-2022-day-1-a-festive-sudoku) · [Jigsaw Thermometer walkthrough](https://puzzling.stackexchange.com/questions/129973/jigsaw-thermometer-sudoku-with-no-given-numbers)
* Players of Jeet Sampat's combination of Anti-Knight, Arrows, cages and white dots reported a smooth opening and a later stretch dominated by knight logic. That experience informed the decision to follow every rule through the complete solve. It can contribute its first essential move long after the opening. [Setter's rules and solvers' comments](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000847)
* Mitchell Lee's Chess puzzle starts with two givens. Independent enumerations found 72 labelled completions of its empty grid before identifying rotations, reflections or relabellings. A short proof suffices for the app. Replace each digit with 10 minus itself. Equalities and absolute differences stay the same, so rows, columns, boxes, Anti-King, Anti-Knight and Non-Consecutive still hold. Every completed grid contains 1, so its image is a different solution. [Setter's puzzle and discussion](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=0003FX) · [Empty-grid enumeration](https://puzzling.stackexchange.com/questions/98479/how-many-unique-miracle-sudokus-are-there)
* Two constructors exhibited and independently checked a unique 9×9 zero-given puzzle using two Killer cages and the rule that adjacent digits can neither be consecutive nor double. Their exhaustive one-cage check illustrates the distinction between a proved minimum and an unsuccessful search. A separate enumeration in the same community discusses why distinct labelled grids count even when they are related by symmetry. [Two-cage construction and minimum](https://puzzling.stackexchange.com/questions/132979/fewest-cages-for-unique-killer-kropki-less-sudoku) · [Counting Kropki completions](https://puzzling.stackexchange.com/questions/132952/how-many-full-kropki-sudoku-solutions-are-there)

HoDoKu's author separates targeting a technique for practice from assigning a configurable difficulty. Nishikawa and Toda describe an exact construction method for a *specified* strategy set and clue positions. Pelánek's comparison with human solving times finds that the difficulty of individual steps and their dependency structure both matter. The app's ten grades describe the strongest technique on its easiest verified path. They are ordinal predictions of human difficulty. [HoDoKu generator and rating](https://hodoku.sourceforge.net/en/docs_cre.php) · [Strategy-solvable clue generation](https://arxiv.org/abs/2005.14098) · [Evaluation against human solves](https://arxiv.org/abs/1403.7373)

## Acceptance checks

1. Sample a solution under the global rules. Construct lines, markers, cages and outside clues against that same completion. Look for the requested grade with checked recipes and seeded layout searches.
2. Count completions under the full rules up to two. Require exactly one. For a Miracle request, submit exactly zero givens to this check. A marker, cage total or outside clue may supply the opening.
3. Remove each selected variant separately. Preserve the other marks' meanings, including the edges that were exempt from negative rules. For Jigsaw, keep the region geometry for Region Sum lines and relax the uniqueness requirement inside those regions. Require a different completion under each omission.
4. Replay the full logical path against those alternative completions. For each omitted rule record the first placement or elimination that contradicts its alternative. The alternative satisfies every earlier action. This identifies an actual technique and step that needs the rule. One step can have witnesses for several rules.
5. Check the same given digits under classic rows, columns and standard boxes. The current acceptance policy requires multiple completions, conflicting givens or no completion. This is the strict case of the requested classic comparison. A search budget expiring supplies no proof.
6. Require a complete path at exactly the selected grade. Retry the easier techniques in canonical, reversed and rotated priority within each tier and reject a grid if any of those paths finishes. The search covers the implemented technique catalog and these orders. An untried move order or a new human technique can still lead to a simpler solve.

The logical solver shares one candidate graph across the active rules. A row, column, box, diagonal or extra region can require a digit in one of two places. A chess move, pair mark, line, cage or Quadruple can rule out a pair of candidates at those places. For a drawn clue the solver fixes one candidate and checks the finite assignments that remain inside that clue. These links supply evidence for locked candidates and alternating inference chains that cross rule families. A unary clue such as parity removes candidates directly and can leave a house with just two places. Hints use the same profile as generation.

The difficulty belongs to the deduction a player needs. An X-Sum of 45 fixes the edge digit at 9, a Skyscrapers clue of 1 puts 9 at the edge, and a Sandwich total of 0 places 1 and 9 next to each other. Those facts can narrow a digit to a single cell in a box at Beginner. Enumerating candidate arrangements along the entire clue is a separate, harder technique.

## Which zero-given combinations can work

| Rules | Conclusion | Reason |
| --- | --- | --- |
| Any mixture of ordinary extra houses, irregular regions, chess equality restrictions, matching cells, Non-Consecutive, white Kropki, parity, German or Dutch Whispers, Renban, Between, Entropic or Modular | A unique zero-given grid is impossible for these families alone. | Reversing 1–9 preserves every one of these relations, including marked positions and the absence of marks. |
| Sandwich alone, or with rules that preserve the exchange of 1 and 9 | A unique zero-given grid is impossible. | The two crust positions stay fixed as a set. Every interior digit and sum stays the same. |
| Black Kropki alone, V marks alone, X marks alone, and some combinations | A common digit exchange can prove impossibility. | For example, 5 and 7 never participate in a doubling pair. Swapping them preserves every black dot and every unmarked edge. The app tests the same exchange against all the selected rules. |
| Both V and X marks, including complete markings, with any digit-independent houses or chess moves | A unique zero-given grid is impossible. | Exchange 2 with 3 and 7 with 8 simultaneously. Every adjacent pair keeps its V, its X, or its unmarked state. The relabelled grid is a different completion. |
| Partial Killer cages + complete negative Kropki | Published zero-given construction. | Two printed cage totals and the absence of both kinds of Kropki mark can determine all 81 digits. The app's cage sampler currently builds full partitions. [Published construction and enumeration](https://puzzling.stackexchange.com/questions/132979/fewest-cages-for-unique-killer-kropki-less-sudoku) |
| Adding totals, printed digits or directed clues | Test the particular combination. | A companion can distinguish previously interchangeable digits. A bounded search miss leaves feasibility open. |

The symmetry check tries reversal and simple exchanges first. For rules expressed by digit classes and pair relations it then searches all bijections that preserve those relations, pruning a partial assignment as soon as a digit or pair changes class. Each reported obstruction proves impossibility for every layout of the selected rules. A layout-specific symmetry, spatial symmetry or other obstruction can still exist after this check. Some combinations also contain duplicate rules, such as negative white dots together with Non-Consecutive and only white dots. A unique puzzle can have those rules, but both cannot be independently necessary.

Across the 35 builder choices, a digit symmetry proves zero-given uniqueness impossible for **24 individual choices** and **240 of 589 distinct pairs**. The pair count excludes the six selections that combine a family with one of its own subtypes. The other 11 single choices and 349 pairs have no impossibility certificate from this test. Run `node --experimental-strip-types scripts/audit-variant-generation.mts --symmetry` for the full list. Append a comma-separated ruleset to inspect a specific combination of any size.

## Generation checks on 9×9 grids

The audit used the browser's WebAssembly engine in a worker with the same 15-second search limit as New Puzzle. For each success it checked the labelled solution, gave the same starting digits to the classic solver, and compared the recorded rule-dependent actions with their alternative completions. Each classic grid in the following table had multiple solutions.

| Rules | Generation seeds | Verified results |
| --- | --- | --- |
| Windoku | 7 | All ten grades. The strongest techniques included XY-Wing at Hard, Grouped AIC at Master and Pattern Overlay at Impossible. |
| Windoku + Arrows | 5 | All ten grades. Both rules were essential in every puzzle. The Medium puzzle used Locked Candidates and the Hard puzzle used a W-Wing. |
| X-Sums + main diagonal, zero givens | 5 for Hard, Very Hard, Expert and Impossible, 7 for Master, 21 for Extreme | All six eligible grades. On the Hard path the X-Sum was essential at step 1, the diagonal at step 76. On the Extreme path a forcing net set the grade. |
| X-Sums alone and Thermometers alone, zero givens | 5 and 7 respectively | A Hard puzzle from each family. The Thermometer solve reached a W-Wing. |
| Kropki + XV + Arrows, with all consecutive and sum-of-10 edges marked | 5 for Easy and Medium, 11 for Hard | Each puzzle needed all three families. The Hard grid started with one given. |
| Anti-King + Anti-Knight + Non-Consecutive (Chess) | 46, using the checked constructions | All ten grades. The Tricky puzzle had three givens and used an X-Wing. The five-given Master puzzle used a Grouped AIC. The four-given Impossible puzzle used Quintuple Pattern Overlay. Every puzzle needed all three rules. Reversal rules out zero givens at any grade. |

X-Sums plus the main diagonal missed Master and Extreme at seed 5 before succeeding with other seeds. Its six zero-given constructions and the ten Chess constructions now supply checked starting layouts. The generator verifies their grade, uniqueness and rule evidence again before play, excludes played layouts, and searches for fresh puzzles after the known ones. On the Master Chess path, Anti-Knight was first essential at step 5, Anti-King at step 76 and Non-Consecutive at step 130. A single Hard search also missed zero-given Kropki and zero-given Inequality. Those two searches leave feasibility open.

## Coverage across the ten grades

We requested one ordinary puzzle at each of the ten grades for every one of the 35 choices in the builder. This includes the individual marker types, both named Whispers gaps and each diagonal direction. Seed 7 produced 322 of the 350 targets. Retrying the 28 remaining targets at seed 21 found two more, Tricky Global Entropy and Extreme V marks. In all, **324 of 350 targets** produced a puzzle with the requested grade and rule evidence. Fourteen choices produced all ten grades. The table lists every target still open after those two seeds. A search limit leaves that grade's feasibility open.

| Rule choices | Grades still open |
| --- | --- |
| Windoku, both diagonals, main diagonal, anti-diagonal, Anti-Knight, Anti-King, German Whispers, Dutch Whispers, Entropic Lines, Modular Lines, Renban, Sandwich, Arrow, Two-cell sums | All ten verified |
| Global Entropy | Beginner |
| Jigsaw | Hard, Master, Extreme |
| Killer | Tricky, Impossible |
| Non-Consecutive | Hard, Very Hard, Impossible |
| Inequality, Palindrome, Odd/Even, Between Lines, Region Sum Lines, Little Killer, X-Sums, Skyscrapers, Clone, Thermometer, Kropki, XV, Quadruple, white Kropki dots, black Kropki dots, V marks, X marks | Impossible |

Across the 35 choices, Easy, Medium and Expert succeeded for all 35. The Impossible grade succeeded for 16. The mixed-rule and zero-given trials above were separate from this sweep.

## Reproducing the checks

Build the WebAssembly engine with `npm run build:wasm`. This command replays three different cases.

```sh
node --experimental-strip-types scripts/audit-variant-generation.mts \
  windoku,arrow/hard/5 \
  x-sum,diagonal-main/master/7/miracle \
  kropki,xv,arrow/hard/11/negative=kropki-white,xv-ten
```

Each argument lists the selected rules, target grade and seed. The optional final fields enable zero givens or complete markings. The output identifies the strongest technique and the first action that excludes each alternative. Exact search limits and wall-clock limits yield a separate outcome.

Use `node --experimental-strip-types scripts/audit-variant-generation.mts --matrix 7` to try all 350 single-rule targets. Append `windoku,arrow` to run just that combination across the ten grades.
