# Downloadable puzzle collections

The app bundles collection metadata and **zero collection grids**. Each grid is
an optional 81-byte text file. All 160 hosted grids have exactly one solution and a complete logical
solve in the current engine. Each record retains its source ID and original givens.
Downloaded grids are separate from player progress, which uses the existing game store.

## Nikoli Classics

- Creator: **Nikoli**. Curated with Nikoli for SakanaAI's Sudoku-Bench.
- Source: <https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli>
- Revision: `9034906b4ec06ab1e08daf110c6b562ef72859fd`.
- Original file: `data/test-00000-of-00001.parquet` at that revision.
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- All 100 puzzles are available to download in source order, with their original IDs and titles.
- Changes: empty cells use `0` instead of `.`. App difficulty ratings were added.
  Original solutions and SudokuPad metadata are omitted from the downloads.
- The initial import compared every engine solution with the published solution.

The collection page, each preview, and the play view retain creator credit and a
license link. Collection pages also link to the source and state the changes.
These puzzle permissions are separate from the app's code.

### Online and offline play

While online, players see all puzzles at the selected difficulty in one list.
Opening a puzzle or choosing the next puzzle loads its grid on demand. The app
stores a game when the player starts it or saves it for later.

The optional Download dialog shows the data size for the selected quantity.
Players can choose any number of remaining puzzles at their difficulty or across
the whole collection. They can also save the entire collection in one action
from the difficulty picker. Transfer sizes can vary with connection overhead.

The app fetches only the selected missing grids, with at most four requests at
once. It checks every grid against the catalog checksum before one storage write
commits the batch. Cancellation, network errors, invalid data, and storage errors
leave earlier downloads and games intact. Retrying skips puzzles already present.
No download creates game history or replaces a game in progress.

Downloaded grids persist in local storage under a separate collection key. App
updates preserve these keys. Existing collection games and matching imports also
count as available offline, so updates do not require another download for them.
While offline, the list and next-puzzle action use only grids available on the
device. The next-puzzle action stays at the same difficulty in either mode.

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

The Collections page lists both collections online. Offline, it lists collections
and difficulties with puzzles available on the device.

## Authorship and size

New collections need evidence of a person's authorship or editorial selection,
as well as explicit reuse terms. A bulk generator output or an automated
difficulty filter alone is not sufficient. Record that evidence alongside the
source and license. Label generated collections honestly.

The Sudoku Garden and Park datasets are not bundled. The LiveSudoku booklets
are not bundled because their license alone does not establish human authorship.
This change adds no new outside puzzle set.

Store grids and source metadata as text. Do not ship source PDFs, images,
solutions, or solve traces. The metadata catalog has a test budget of 64 KiB
uncompressed and 12 KiB gzip. Puzzle data has no default offline allocation.

`npm run build:collections` generates a metadata-only index in
`src/sudoku/generated/collection-index.json` and optional text files in
`public/collections/`. Client code never imports the source grid JSON files.
The offline build excludes `/collections/` from the service worker cache.
Grid requests use `cache: 'no-store'`. Explicit downloads save grids to the
collection store. Preview requests keep the grid in memory for the preview.

Measure the initial offline assets separately from optional hosted downloads.
After a production build, check that no collection text files appear in the
service worker asset list and no collection grids appear in JavaScript assets.
The checksum detects stale or damaged data. It is not a security credential.

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
test suite checks identity, credits, progress, resuming, batch downloads,
cancellation, invalid data, storage failures, retries, and offline reloads.

## Add another collection

Obtain a source with explicit puzzle reuse terms. Keep its revision and creator
credit. Add the normalized records and the catalog entry in `../collections.ts`.
Add the file to the rating and collection build scripts. Check every grid before release and review
the solving experience. A unique solution alone does not establish puzzle quality.

Collection progress reflects matching classic games saved on this device,
including earlier imports. Opening an existing puzzle preserves its title,
placed digits, candidates, timer, and history. Deleting a game also removes its
collection progress unless another saved copy remains. Restarting preserves
the source reference. The play view uses the current engine for player ratings.

Each collection opens with a required difficulty choice. Counts and progress in
the puzzle list apply to that difficulty. The completion screen and the next
puzzle shortcut continue in source order within the same collection difficulty.
They skip solved puzzles and wrap to earlier unfinished puzzles at the end.
They stop when the downloaded puzzles are complete. The catalog difficulty controls this
sequence, even if the player's current technique order produces a different rating.
Players can change the collection difficulty or return to Puzzles from the
completion screen.
