# Sudoku practice mode

Start at the point where there’s a move to find. The player places one digit or removes one candidate, sees why it works, and moves to a fresh position. Give them two ways to start: **Find one move** mixes techniques and keeps their names hidden; **Practice a technique** names the pattern so the player can work on it directly. Keep both untimed and unrated.

The loop we can build around our app is **get stuck in a puzzle → practice that technique → spot it later without a cue**. The lesson explains the technique, Practice gives the player repetitions, and full puzzles show whether the skill carries over.

## What to borrow

| Reference | What it does | What we should take from it |
| --- | --- | --- |
| [Sudoku Coach](https://sudoku.coach/en/home) | Offers a Campaign for learning and a separate [Practice catalog](https://sudoku.coach/en/practice) grouped by technique. | Let players go straight to practice, with an entry from each lesson that already selects the technique. |
| [HoDoKu](https://hodoku.sourceforge.net/en/docs_play.php) and [SudokuBoku](https://sudokuboku.com/technique-trainer/) | HoDoKu’s Learning mode jumps to the technique; its Practising mode starts at the original givens. SudokuBoku starts at the target deduction and preserves earlier candidate removals. | Load the exact position and its candidates. Treat a full puzzle that features the technique as a follow-up. |
| [Sudoked](https://sudoked.com/sudoku-trainer/) and [Sudoku Online Puzzles](https://sudoku-online-puzzles.com/sudoku-trainer/) | Sudoked checks the full set of removals. Sudoku Online Puzzles checks the cells that form the pattern and offers hints in stages. | Ask for one consequence up front. After the check, show the pattern and every removal it justifies. Save full-pattern and full-removal checks for optional drills. |
| [SudoSuite](https://sudosuite.de/en/learn.html) | Can hide the technique and says it accepts another valid route when checking reasoning. | Mix techniques and recognize alternate deductions. Keep the first exercise about making a move; offer its explanation after the check. |
| [Lichess](https://lichess.org/training/themes) and [Chess.com](https://support.chess.com/en/articles/8608686-how-do-puzzles-work-on-chess-com) | Lichess offers one-move puzzles, themes, and [rating-based selection](https://lichess.org/page/blind-mode-tutorial#6-puzzles). Chess.com offers untimed, unrated practice with theme and difficulty filters and a way to revisit misses. | Make the next exercise one click away. Offer a fresh example of a missed technique and keep practice outside the full-puzzle rating. |

Named drills let players repeat a new procedure. Mixed positions ask them to choose the procedure for themselves. A [randomized study of math practice](https://doi.org/10.1037/edu0000367) supports testing that distinction; whether it improves Sudoku solving is a question for our playtest.

## The first practice session

Put **Practice** in Learn and link to a named drill from the corresponding lesson and technique row in Statistics. Start with Classic Sudoku, covering naked and hidden singles, locked candidates (pointing and claiming), and naked pairs. Include X-Wing in the named catalog; add it to Mixed when we have enough positions without easier moves. Have **Find one move** start a short set of five fresh positions by default, with the option to keep going. New players can start with singles or pick a technique directly.

1. **Show the position.** Display the givens, digits already placed, and the candidates left after earlier deductions. In a mixed set, use “Find one move” and show both **Place digit** and **Remove candidate**. Hiding either control would give away part of the answer.
2. **Check one action.** Let the player choose a cell and digit using the familiar grid and keypad. In Mixed, accept any move the engine can prove from that position, even if it differs from the example we picked. In a named drill, one action supported by the requested technique completes the exercise. If a different technique supports the action, say so and let the player keep looking or move on. A failed check leaves the position intact.
3. **Help without giving it all away.** A first hint names the technique in Mixed or narrows the search in a named drill. A second highlights where to look. **Show move** reveals the pattern, action, and reason. Keep ordinary retry feedback neutral so players don’t get the answer in pieces by checking guesses.
4. **Explain and continue.** On success, highlight the proof for the move the player actually made. For example, one candidate removal can finish a pointing drill; the explanation shows where the digit is confined in the box and which other candidates that rules out. Keep **Next position** visible while the explanation is open. At the end, offer more practice or a fresh example of something the player needed help with.

## How difficulty and progress work together

**Auto difficulty** can suggest a starting set, with a manual way to make it easier or harder. Full-puzzle difficulty reflects an entire solve. For a single position, start with the technique and how much of the grid the player needs to scan; use first-check results from fresh positions to tune selection once there’s enough evidence. A player can be comfortable with Hard puzzles and still want a few gentle X-Wing examples.

**Technique history** can suggest what to practice next. After a player uses hints for locked candidates across several puzzles, offer a link from Statistics or the puzzle results: “You’ve used hints for locked candidates recently. Practice a few?” An empty history for a technique means we haven’t observed enough: the current [progress summary](src/sudoku/technique-progress.ts) measures the moves players made or saw as hints and has no count of all the chances they had. Also, the engine attributes an action to its simplest proof. That explains the action; it cannot tell us which proof the player had in mind.

Keep practice attempts separate from full-puzzle history and rating. Record whether the first check was correct without help, the player got it after a retry or hint, the move was revealed, or the position was skipped. Keep named and mixed results distinct, and count replays or rearrangements of the same position as review. A first-check success on a fresh mixed position is useful evidence that the player can find a move without a cue. If more than one technique proves it, credit the move without assuming which technique the player saw.

## What the app can reuse

The [lesson exercise](src/components/LessonPractice.tsx) already has a grid, keypad, and a check for one action. The [engine](crates/engine/README.md#browser-and-webassembly) ships three practice examples per Classic technique, can extract a position from a solve trace, and can check a move for a named technique. The existing [lesson diagrams](src/sudoku/lesson-diagram.ts) can show the pattern after a check. The main work is the session loop, a pool of fresh positions, and proof checking for Mixed.

All 18 suggested actions passed their named check in a sample of three bundled exercises for each of the six starter techniques. They came from 13 distinct sets of givens. With the saved candidate removals in place, all three X-Wing positions also offered cheaper moves under the engine’s difficulty and cost order; one still had 18 available singles. A named exercise only needs a valid proof for the chosen technique. A mixed position intended to surface a harder technique should have no cheaper move available under a fixed reference order. If the player finds a different valid move anyway, accept it and explain it.

Start with a bundled pool checked against the engine so **Next position** also works offline. Use the current examples to prototype named practice and harvest extra positions from the app’s own solve traces. Store the starting grid, prior placements, and prior candidate removals together. Validate with all supported techniques before admitting a position to Mixed, and check the resulting answer list and proofs. Use rearrangements for variety after we have several distinct sources per technique. For an initial playtest, aim for at least one five-position set per named technique and enough distinct mixed positions for a second visit without repeats. Defer variants, timed streaks, and live searches for rare techniques.

## What to test

Watch players try a named drill, then give them fresh mixed positions with the name hidden. Check whether new players understand how to submit a candidate removal, whether experienced players find alternatives that the checker misses, and whether the explanation makes the rest of the deduction clear. On a return visit, compare first-check success on fresh mixed positions and use of hints for that technique in full puzzles where the opportunity is confirmed. Session completion can tell us whether the loop is easy to use; finding the move again without a cue is the better signal that it taught something.
