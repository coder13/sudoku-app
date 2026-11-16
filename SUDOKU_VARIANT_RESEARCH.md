# Sudoku variant research

The [engine roadmap](SUDOKU_ENGINE_TODO.md#11-add-common-rule-families) already covers many common Sudoku rules. The best next additions are Fortress, parity lines, Outside Sudoku, and standard Quadruples. The first three reuse planned rules. Quadruples add a small rule for how often a digit appears, which also helps with cages and outside clues.

The order below reflects how much each rule changes the proposed engine. It does not reflect puzzle difficulty or popularity. Each linked source describes a published rule or gives an example puzzle.

## Extend the planned rules

These variants keep the 9×9 grid and use only its digits. Most fit the planned comparisons, lines, sums, or region definitions. Several need different marks in the editor even if they use the same rule in the solver.

| Variant or rule | What the solver sees | What the engine can reuse |
| --- | --- | --- |
| [Fortress and Min/Max cells](https://www.sudoku-u.org/constraints) | A Fortress cell exceeds each unshaded neighbor that shares an edge. A Min/Max cell is lower or higher than every neighbor that shares an edge. | Expand each mark into inequalities. Keep the original mark for hints. |
| [Parity lines](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000JKX) | The digits alternate odd and even along the line. | Reuse the odd and even digit sets. Relate each pair of adjacent cells on the path. |
| [Shout lines and numbered dots](https://www.sudoku-u.org/constraints) | Neighboring digits on a Shout line differ by at most a stated amount. A numbered dot specifies an exact difference or ratio. | Give the pair rule an explicit comparison and parameter. |
| [Anti-Quadruples](https://www.sudoku-u.org/constraints) | A digit in a circle cannot appear in any of the four cells that touch it. | Exclude each listed digit from each of the four cells. |
| [Nabner lines](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000JKX) | No two digits anywhere on the line can be equal or consecutive. | Apply the same comparison to every pair on the line. A partial line with no repeats is not a house. |
| [Lockout lines](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=0007FL) | The two endpoints differ by at least four. Each interior digit is below both endpoints or above both. | Reuse the endpoint roles from Between lines. Interior digits can repeat when other rules permit it. |
| [Pill and branching Arrows](https://www.sudoku-u.org/constraints) | A pill reads as a multi-digit number in a stated order. Each branch from a shared bulb or pill sums to its target separately. | Extend Arrow targets to ordered cells and let multiple paths share a target. |
| [Double Arrows](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000GQX) and [Zipper lines](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000GLC) | A Double Arrow equates the sum of its two endpoints with its interior sum. On a Zipper line, pairs at equal distances from the center all have the same sum. An odd length Zipper uses its center digit as the sum. | Express both as equal sums over specified cells. An even length Zipper has a shared sum with no center cell. |
| [Outside Sudoku and Serbian Frame](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2021/2021_SudokuRound2_IB.pdf) | Outside Sudoku lists digits that must appear among the first three cells from an edge. Serbian Frame sums positions 2 and 3 in a row, or 3 and 4 in a column, from the clue side. | Reuse directed paths. Model digit membership and sums over specified positions. |
| [Rossini](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2021/2021_SudokuRound2_IB.pdf) | An edge arrow gives the increasing or decreasing order of the first three cells. In the WPF version, those cells must be neither increasing nor decreasing at an edge without an arrow. | Reuse ordered comparisons. Give missing arrows an explicit meaning for this version. |
| [Toroidal Sudoku](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2015/2015_SudokuRound7.pdf) | Some replacement regions connect across opposite edges of the grid. | Reuse Jigsaw houses. Apply wraparound to region connectivity and show it in the editor. Other rules still use their own definitions of adjacency. |

On the six-cell Zipper `2–3–4–6–7–8`, all three pairs sum to 10. On the five-cell Zipper `1–2–6–4–5`, both pairs sum to the center digit, 6.

## Add rules that link several cells

These variants still solve for digits in a fixed grid. Some count occurrences. Others use one digit to choose which cell or part of a line another rule applies to.

| Variant or rule | What the solver sees | What the engine needs |
| --- | --- | --- |
| [Quadruples](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2025/2025_SudokuRound3_IB.pdf) and [Look-and-Say cages](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000TZ7) | A Quadruple lists digits that must occur in the four cells that touch its circle. Some versions count repeated digits in the clue. A Look-and-Say cage clue such as `23` means the cage contains exactly two 3s. | Store digit counts and distinguish exact counts from minimum counts. Keep repeat rules separate from cage shape or shading. |
| [Entropic and Modular lines](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000JKX) | Each run of three cells on an Entropic line contains one digit from each band: 123, 456, and 789. A Modular line instead uses the bands 147, 258, and 369, which group digits by remainder after division by three. | Use a digit-to-band mapping and require one cell from each band in every run of three. Digits can repeat elsewhere on the line. |
| [Global Entropy and Global Modularity](https://www.sudoku-u.org/constraints) | Every 2×2 area contains at least one digit from each of the three bands for that rule. | Reuse the band mappings with a four-cell coverage rule. One band occurs twice in each area. |
| [Anti-Diagonal](https://www.sudoku-u.org/constraints) and [Anti-Windoku](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2025/2025_SudokuRound3_IB.pdf) | Anti-Diagonal limits how many distinct digits appear on a diagonal. In the WPF Anti-Windoku example, each shaded region contains exactly four distinct digits. | Count distinct digits across the designated cells. Store the limit and whether it is exact. |
| [Numbered Rooms](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=0008WX) and [159 indexing](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000OCX) | In Numbered Rooms, the first digit from an edge gives the position of the outside clue digit. In 159, the digit in column 1 points to the column containing 1 in its row. Columns 5 and 9 do the same for their own digits. | Use a digit to select a cell from an ordered list. The outside clue 7 with a first digit of 4 puts 7 in the fourth cell from that edge. |
| [Dutch Flat Mates](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000OCX) | Every 5 has a 1 directly above it, a 9 directly below it, or both. | Apply a rule to every cell with a trigger digit. At the top or bottom edge, only the direction inside the grid can satisfy it. |
| [Ten Lines](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000H4L) | Split the whole line into consecutive segments that each sum to 10. The setter does not mark the cuts. | Find the cuts as part of the rule. Divisibility of the line total alone cannot prove that every segment works. |
| [Star Product](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2025/2025_SudokuRound3_IB.pdf) and [Mathrax](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2025/2025_SudokuRound7_IB.pdf) | Star Product multiplies the starred digits in a clued row or column. A Mathrax clue applies the same operation and target to both diagonally opposite pairs around a corner. | Extend arithmetic to products, exact ratios, and differences. Mathrax also has parity marks that apply to all four cells. |
| [Distances Sudoku](https://gp.worldpuzzle.org/sites/default/files/Puzzles/2025/2025_SudokuRound3_IB.pdf) | An edge clue names two digits in order and gives the distance between them in steps. | Find two positions on a directed path and compare their indices. Adjacent positions are one step apart. |
| [Off-by-one clues](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=de&id=000OUH) | In Knapp Daneben, a designated clue differs from the true result by exactly one. For example, an off-by-one sum of 15 accepts 14 or 16. | Allow an explicit relation between the displayed clue and the result. Preserve the displayed clue for hints and exports. |

Numbered Rooms and 159 are a good pair to add together. One uses an outside clue and the other uses marked cells, but both need the same way to select a cell. Use them to test that reversed directions and position 1 work correctly.

## Plan for rules that need more than digits

These variants ask players to find other parts of the solution, such as shading or region boundaries. The puzzle format can reserve room for these cases. Full support needs search, validation, hints, and player input for the added parts of the solution.

| Variant or rule | What the solver must also find | What changes |
| --- | --- | --- |
| [Doublers](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000ML3) and [Negators](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=de&id=000AWB) | Which cells change the value used by certain clues. A Doubler multiplies its digit by two. A Negator changes its sign. | Keep the placed digit separate from the value used by a clue. State how many modifiers each house contains and whether modified digits must be distinct. |
| [Liar clues](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000A28) and [ambiguous clues](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000RJY) | Which clues are false or which rule each clue represents. A puzzle can state how many clues of each kind appear. | Allow a clue to take one of several meanings and apply counts across clues. A false clue must fail its rule. |
| [Cipher clues](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000BTE) | Which digits the letters in clues represent. | Share each letter across clues. State whether different letters must stand for different digits. |
| [Japanese Sums Sudoku](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000EMJ) and [Yin Yang Sudoku](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=de&id=000R1I) | Which cells are shaded. Japanese Sums lists the sums of consecutive shaded runs. Yin Yang requires both colors to be separately connected by cell edges and forbids a single color from filling a 2×2 area. | Add a shading layer. Link it to sums, counts, or connectivity as the rules require. |
| [Chaos Construction](https://www.sudoku-u.org/constraints) | Where the boundaries of the nine connected regions are, as well as which digits belong in them. | Find region membership during search. When counting solutions, treat different names for the same regions as the same result. |

For puzzles with extra parts, decide what counts as a complete solution. One digit grid can admit two different shadings or two different assignments of modifiers. If the rules require the player to find those parts, a uniqueness check must also distinguish them.

## Choices to test in the puzzle format

The same mark can stand for different rules. The puzzle must record the rule and its parameters so that exports, hints, and solution counting agree. These cases are good candidates for small examples that test both accepted and rejected positions.

- For [Quadruples](https://www.sudoku-u.org/constraints), a clue `2, 2, 5` can require two 2s and a 5. Test that a single 2 fails when the clue counts repeats.
- For [Region Sum lines](https://www.sudoku-u.org/constraints), a path through regions A, B, A can count as three visits or combine both visits to A. Visit sums `2, 5, 3` pass when both visits to A combine, but fail when each visit counts separately. Save and load both versions and test that each keeps its behavior.
- For [Kropki](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000GF4), 1 and 2 satisfy both standard dot rules. Some puzzles allow either dot when all dots are given. Test completeness on a pair with no dot and on a pair with the other allowed dot.
- If a rule expands into several comparisons, preserve the link to the original mark. A Fortress hint can then point to the shaded cell that supplies the comparison.
- For [dynamic fog](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000O6S), a correct placement can reveal a distant cell. Treat reveal rules as part of play. A hint cannot treat a hidden dot as absent or use it before the player sees it.

Start with one source-backed puzzle per new family and one mixed puzzle. *[Lief, the Univeres, and Everythign](https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000JKX)* combines Quadruples, parity, Entropic, Modular, and Nabner lines with planned rules. Use original small positions for automated tests and link to published puzzles for manual play.
