# Built-in puzzle collections

The app bundles these classic 9×9 puzzles for offline play. All 160 grids have
exactly one solution and a complete logical solve in the current engine.
Each record retains its source ID and original givens. Puzzle data is separate
from player progress, which uses the existing game store.

## Nikoli Classics

- Creator: **Nikoli**. Curated with Nikoli for SakanaAI's Sudoku-Bench.
- Source: <https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli>
- Revision: `9034906b4ec06ab1e08daf110c6b562ef72859fd`.
- Original file: `data/test-00000-of-00001.parquet` at that revision.
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- All 100 puzzles are included in source order, with their original IDs and titles.
- Changes: empty cells use `0` instead of `.`. App difficulty ratings were added.
  Original solutions and SudokuPad metadata are omitted from the app bundle.
- The initial import compared every engine solution with the published solution.

The collection page, each preview, and the play view retain creator credit and a
license link. Collection pages also link to the source and state the changes.
These puzzle permissions are separate from the app's code.

### Starter selection

New players see Nikoli first, with six puzzles at each available difficulty.
The 18 starter IDs in `../collections.ts` refer to the existing catalog records.
No puzzle grids are copied or added for this view. The original titles, credits,
IDs, and saved progress remain intact.

The Easy selection spans naked and hidden singles. Medium introduces locked
pairs, claiming, pointing, hidden pairs, naked triples, and hidden triples.
Hard includes X-Wings and Swordfish. Each selection progresses by app score.
These are app selections of puzzles authored by Nikoli, not a new endorsement
or selection by Nikoli. The solver checks correctness and technique coverage;
it does not replace a person's authorship or establish enjoyment.

Players can browse the full collection at any time. The next-puzzle action
plays the starter puzzles first, then continues through the remaining puzzles
at the same difficulty. It skips solved grids and preserves any existing game.
The completion screen shows the solved count without a large target total.

## Sudoku Exchange Selection

- Creator: **Grant McLean / Sudoku Exchange**.
- Source: <https://github.com/grantm/sudoku-exchange-puzzle-bank>
- Revision: `d8c8ebaee0c08c412cfba96af1923dfa61c83317`.
- License: [public-domain dedication](https://github.com/grantm/sudoku-exchange-puzzle-bank/blob/d8c8ebaee0c08c412cfba96af1923dfa61c83317/LICENSE.txt).
- Selection: take the first 100 records from each source file in this order:
  `easy.txt`, `medium.txt`, `hard.txt`, `diabolical.txt`. Rate them with the app's
  default technique order. Keep the first 12 distinct, fully solved grids for
  each app difficulty. Exclude grids already in Nikoli Classics.
- Sort the 60 selected puzzles by app difficulty, points, and source ID.
  Assign display titles `Exchange 01` through `Exchange 60`.
- The source ID and Sukaku Explainer rating remain in each record.
  The app displays its own difficulty, not the source's category.
- This is an automated selection of generated puzzles, not a handmade set.

This older collection remains accessible through **Browse all collections** and
saved puzzle links. It also remains visible for players who already opened one
of its puzzles. New players start with the handmade selection.

## Authorship and size

New collections need evidence of a person's authorship or editorial selection,
as well as explicit reuse terms. A bulk generator output or an automated
difficulty filter alone is not sufficient. Record that evidence alongside the
source and license. Label generated collections honestly.

The Sudoku Garden and Park datasets are not bundled. The LiveSudoku booklets
are not bundled because their license alone does not establish human authorship.
No new outside puzzle set was imported for the starter selection.

Store grids and source metadata as text. Do not bundle source PDFs, images,
solutions, or solve traces. The full serialized catalog has a test budget of
64 KiB uncompressed and 12 KiB gzip. The existing catalogs stay available
offline after the first app download, without per-puzzle network requests.
Measure the production client before and after any catalog expansion; a data
budget alone does not account for UI code or other cached assets.

## Update ratings

After a change to the engine's grading rules, run:

```sh
npm run build:wasm
node --experimental-strip-types scripts/rate-collections.mjs
npm run test:collections
```

The rating script checks uniqueness and logical completion before it writes
either catalog. It does not change givens, IDs, titles, source ratings, or order.
The WASM test checks every puzzle against its stored app rating. The regular
test suite checks identity, credits, progress, resuming, and storage reloads.

## Add another collection

Obtain a source with explicit puzzle reuse terms. Keep its revision and creator
credit. Add the normalized records and the catalog entry in `../collections.ts`.
Add the file to the rating script. Check every grid before release and review
the solving experience. A unique solution alone does not establish puzzle quality.

Collection progress reflects matching classic games saved on this device,
including earlier imports. Opening an existing puzzle preserves its title,
placed digits, candidates, timer, and history. Deleting a game also removes its
collection progress unless another saved copy remains. Restarting preserves
the source reference. The play view uses the current engine for player ratings.

Each collection opens with a required difficulty choice. Counts and progress in
the puzzle list apply to that difficulty. The completion screen and the next
puzzle shortcut continue in source order within the same collection difficulty.
The starter selection comes first, followed by the remaining source order.
They skip solved puzzles and wrap to earlier unfinished puzzles at the end.
They stop when the difficulty is complete. The catalog difficulty controls this
sequence, even if the player's current technique order produces a different rating.
Players can change the collection difficulty or return to Puzzles from the
completion screen.
