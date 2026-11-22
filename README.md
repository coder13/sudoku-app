Warning: truncated output (original token count: 6953)
Total output lines: 218

# Sudoku

Play Classic, Killer, Diagonal, Jigsaw, Anti-Knight, Thermometer, Arrow, and Kropki Sudoku. Start several puzzles and switch between them at any time. The app saves each puzzle, its placed digits, candidates, and undo history in the browser.

## Run locally

Install Node.js 22.12 or newer and stable Rust with Rustup. Add the Rust target for WebAssembly, which lets the browser run the Rust engine.

```sh
rustup target add wasm32-unknown-unknown
npm ci
npm run build
npm start
```

Open [Sudoku on localhost](http://127.0.0.1:8765).

Use `npm run dev` for frontend development, then open `http://twilight:8766`. This stable Vite address hot-reloads source changes. For offline play, open the production build online first. The browser needs localhost or HTTPS to install the service worker that serves the app offline.

Run `npm run check` for TypeScript, `npm test` for game and sharing tests, and `cargo test --locked` for Rust.

Run `npm run test:wasm` to build and test the browser engine. Run `cargo bench --locked -p sudoku-app-engine --bench engine` to measure ratings, exact search, and generation.

## Development workflow

This project is still in early, active development. Changes can be committed and pushed directly to `main`; pull requests are not required at this stage. Use a pull request only when a change specifically needs review or isolated discussion.

The coverage benchmark reports logical solve rates and rating times for fixed everyday, 17-clue, and expert grids. To save replayable stalled positions, redirect standard output to a JSON Lines file. The group totals and timings appear on standard error.

```sh
cargo bench --locked -p sudoku-app-engine --features wasm-api --bench coverage > stalls.jsonl
```

Each stall record contains the givens, entries, and 81 candidate-removal masks in row order. Bit zero represents digit 1. It also records the solver order and scoring version. See the [baseline results](SUDOKU_ENGINE_TODO.md#6-measure-coverage-on-expert-puzzles).

### Deploy a preview

See the [preview deployment guide](docs/deployment-previews.md) for Cloudflare and Netlify instructions. The Cloudflare pull request run checks code but does not deploy. Start the workflow manually to publish a pull request preview.

Pull requests run checks automatically. Pushes to `main` deploy to production. Leaving the pull request number blank in a manual run redeploys `main`.

## Browse UI components

Run `npm run storybook` and open [Storybook on localhost](http://127.0.0.1:6006). The sidebar groups components by size, from hint cards and breadcrumbs to dialogs, the play workspace, and Learn pages. Use the Appearance and Viewport controls to check light, dark, and narrow layouts.

Open **Small → Hints → Copy review → All Techniques** to filter and compare hint copy. The difficulty folders also have one story for each engine technique. The stories use the app’s hint formatter and the engine’s verified lesson examples, so the catalog follows the engine when techniques change.

Run `npm run build-storybook` to create a static catalog in `storybook-static/`. Both commands prepare the browser engine and regenerate the technique stories. The play stories use a temporary puzzle library, so changes in Storybook do not affect your saved puzzles.

Run `npx playwright install chromium --only-shell` once, then run `npm run test:visual` to compare isolated Storybook stories with their saved screenshots. Add visual tests in `tests/visual`. When a comparison fails, look for the actual image and diff in `test-results/`. Use `npm run test:visual -- --update-snapshots` after an intentional visual change and review the updated images. The checked-in screenshots are for macOS Chromium. Generate a baseline on each additional platform you use for comparisons.

## Edit Learn articles

Run `npm run dev:lessons` and open [the local lesson editor](http://127.0.0.1:5180/__lesson-editor/). Select Overview or a technique and click the highlighted text to edit it on the rendered page. Use the left panel to add and move blocks, change diagram examples or crops, rename practice options, and edit links.

**Save to file** writes to `src/sudoku/learn-content.json` and refreshes the app preview. You can also press Cmd+S or Ctrl+S. **Preview** hides the editing controls so you can read the page and try its puzzles.

The editor runs on its own local preview server. Set `LESSON_EDITOR_PORT` to use another port. It uses the generated engine files from `npm run build:wasm` and builds them on first launch if they are missing.

## Play, import, and share

The grid accepts keyboard or touch input. It supports two types of candidates, cell colors, multi-select, undo, and redo. Open **Puzzles → New puzzle** to choose a Sudoku mode and a difficulty. **Generate a custom puzzle** lets you choose rules for the generator and save the combination as a mode. The variant name above the grid opens its rules. The engine checks that generated Sudoku puzzles have a unique solution and rates their logical walkthroughs. Hints explain the active rules and show the candidates or cells involved.

On mobile, press and hold a card for five seconds to rearrange the cards. Drag a card to move it. The hint card also appears in this mode so you can choose its position. The puzzle and timer stop while you rearrange cards. Press **X** to return to play. The browser saves the card order across refreshes and app updates.

To play a puzzle made in another app, open **Import puzzle** and paste its link or puzzle code. Use an external puzzle editor to set givens and draw variant clues, then import its export here.

Open **Puzzles → Collections** to browse Nikoli Classics (100 handmade puzzles) or Sudoku Exchange Selection (60 generated puzzles). Choose a difficulty, then play the next puzzle or preview a grid and save it for later. Opening a puzzle you already have resumes that game. After you finish, choose **Next puzzle in collection** to continue at the same difficulty. You can also change the collection difficulty or return to Puzzles to choose a different puzzle. The app includes both collections in its offline download and shows creator credits and reuse terms. Random generation remains available under **New puzzle**. See the [collection sources and update steps](src/sudoku/collections/README.md).

Open **Learn** for technique articles with diagrams and practice puzzles. In a practice puzzle, select an empty cell and a digit, then check your move.

If you have more than one saved puzzle, open Puzzle options and choose Switch puzzle.

Choose **Share puzzle → Create link** to make an unlisted link. The link contains a UUID and opens a preview of the puzzle's starting grid and rules. When the recipient starts, the app saves their own copy in the browser and syncs it to their library if they have linked devices. Opening the same link again lets them resume their copy. The link keeps the definition that was shared, even if the original puzzle changes. Linked devices can still open their own synced attempts by the ordinary `?puzzle=` address.

Mini Sudoku can also be copied as 16 givens or a four-line grid. Classic puzzles can be copied as an 81-character string, a nine-line grid, a HoDoKu library line, or a link for Sudoku Exchange or sudoku.coach. Import detects puzzle codes, links, and single-puzzle text files and shows a grid preview before you save or play. It also accepts legacy hash links, Sudoku Coach `SCv7_32` codes and direct links, short Sudoku Exchange grids, f-puzzles exports, and SudokuPad links that contain an SCF or f-puzzles code.

Native and shared puzzles can combine all 27 supported rule types with Jigsaw regions, including line, Clone and outside-clue families. Supported Coach and f-puzzles imports preserve their encoded rules; unsupported encoded rules reject explicitly. White and black dots keep separate negative-rule settings, and Coach Non-Consecutive puzzles preserve their white…2953 tokens truncated…iew) · [HoDoKu hints and practice](https://hodoku.dev/docs_play) · [SudokuWiki strategy families](https://www.sudokuwiki.org/Strategy_Families) · [Sudopedia technique index](https://sudopedia.sudocue.net/index.php?title=Solving_technique) · [Hodoku Revisited hints](https://hodokurevisited.com/manual/hints.html)

The play screen fills singles with one `solve-singles` request. Classic and variant requests accept optional `displayedCandidates` masks and respect saved candidate removals.

For an exhaustive hint list, pass a numeric `collection` ID with the hints request. The response includes the first page and the total in `available`. Send `hint-page` with the same ID and a zero-based `index` to get the page containing that hint. Its `offset` gives the first index on the page. Each worker keeps one collection until another replaces it or the caller sends `release-hints`.

### Generation and training

The generator must accept a requested difficulty or opening technique. A puzzle that targets a difficulty must receive a complete rating at that difficulty under the chosen solver configuration. In either case, the generator must make sure that the puzzle has exactly one solution.

For `generate-targeted` and `generate-constrained`, set `includeRating` to `true` to receive `{ board, rating }`. The default response is the grid string. When a search checks the difficulty, the rating describes the accepted solve path.

The `generate-constrained` request accepts an exact clue count or an inclusive `[min, max]` range in `clues`. It can combine those bounds with a `difficulty` or an inclusive `score` range and a technique target. Pass a technique ID in `technique` to find it anywhere in the configured solve path, or pass an object with `id` and `mode`. The modes are `anywhere`, `first` for the first step of the configured path, and `exclusive-opening` for the only technique that can act on the givens. A difficulty or score target requires the configured solver to finish the puzzle.

For a requested opening, the engine must find at least one deduction of that technique from the untouched givens. It must reject the puzzle if any other supported technique can make a first move, including techniques disabled in the solver configuration. This rule still applies when a second technique proves the same deduction. Different names for the same technique count as one technique. The requested technique can have several valid opening deductions. If the generator reaches its search limit before it can verify a match, it must report the limit.

Generation returns `incompatible-targets` before searching when it can prove the constraints conflict. For example, every Full House placement is also a Naked Single, so an exclusive Full House request is incompatible. A technique in the configured solve path must be enabled and fit within the requested score ceiling or difficulty. A valid request that exhausts its attempt budget returns `search-limit`.

`generate-from-pool` takes the same targets and draws from a built-in pool of 17-clue and expert puzzles. The engine verifies each source puzzle once. It adds clues when needed, applies Sudoku symmetries, and returns the new grid with a rating computed under the requested solver profile. Rust callers can also pass their own `VerifiedTemplate` values to `generate_from_pool` and reuse them across searches.

Use `runGeneration(request, { signal, onProgress })` for a browser search that reports completed attempts and accepts an `AbortSignal`. It returns `matched`, `exhausted`, `cancelled`, or `invalid` with the number of attempts made. A cancellation stops the search at the next attempt boundary. Rust callers can use `start_matching`, `start_from_pool`, or `start_targeted` to advance or cancel a search explicitly.

The 17-clue templates come from Gordon Royle and The University of Western Australia's collection, licensed under Creative Commons Attribution 2.5. The native engine exposes `canonical_puzzle` to count distinct grids across Sudoku symmetries and digit renaming. The release benchmark reports those counts for generation targets from 17 through 20 clues. [Royle collection](https://web.archive.org/web/20131019184812if_/http://school.maths.uwa.edu.au/~gordon/sudokumin.php) · [Benchmark results](SUDOKU_ENGINE_TODO.md#8-add-variety-to-generation-and-practice)

### Batch rating and generation

```sh
cargo run --release --locked -p sudoku-app-engine --features cli --bin sudoku-engine -- batch-rate puzzles.txt
cargo run --release --locked -p sudoku-app-engine --features cli --bin sudoku-engine -- batch-generate requests.jsonl
```

Pass `-` or omit the file to read standard input. Both commands write one JSON record per nonblank input line. `batch-rate` accepts an 81-character puzzle or a JSON object with `values`, optional `techniqueOrder`, and an optional `seed` to carry forward. `batch-generate` accepts one JSON generation request per line and defaults to `generate-constrained` when `type` is omitted. Each output records the source line, seed, technique order, scoring version, and result. Invalid records carry an error and the batch continues. Generation results include the attempt count and, for a match, the grid and its rating or `ratingError` when the rating reaches its search limit.

### Solve-path analysis

Set `includeMoveAvailability` on a `logical-solve` request to count distinct moves from enabled Easy techniques at each position, including the starting and ending grids. An unfinished position with zero or one Easy move is marked as a bottleneck.

Use `compare-solve-paths` with a technique ID to compare two traces from the same position. The enabled trace keeps the technique's place in the configured order or appends it if absent. The other trace omits it. Each trace reports its scoring version, and a stalled trace reports a partial score.

Use `alternate-solve-path` with a technique ID and `maxPositions` to search alternative deductions under the remaining profile. The result is `found` with a replayable scored path, `no-path` when the search finishes, or `inconclusive` when the budget runs out. The budget counts distinct unfinished positions expanded during the search.

### Technique practice

Each catalog entry has a stable identifier, any alternate names, scoring rules, and three distinct verified practice grids. Use `Technique::practice_examples()` in Rust or request `practice-examples` with a technique ID through the worker. The worker returns the grid, its active candidates, accepted moves, and a suggested deduction with its proof. The practice collection includes examples drawn from the HoDoKu regression library and the app's existing lesson grids. [HoDoKu regression library](https://hodoku.sourceforge.net/libraries/reglib-1.3.txt)

Franken Fish and Mutant Fish are available for hints, targeted practice, and custom solver profiles under `franken-fish` and `mutant-fish`. Both detectors search two to four base houses and the same number of cover houses, including finned cases. Their costs are 420 and 460 points. Use an explicit technique order to include them when rating a puzzle.

## Research

Sudoku Exchange informed the touch and keyboard controls, two kinds of pencil marks, and the uniqueness check in the puzzle editor. Its share links use the `s` query parameter. [Sudoku Exchange source and example](https://github.com/grantm/sudoku-web-app)

sudoku.coach informed the separate center and corner marks and the way you can fill candidates on demand. Classic share links can carry an 81-digit grid in the path. [Candidate notation](https://sudoku.coach/en/learn/cell-candidate-notation) · [Text import](https://sudoku.coach/en/play/from-text)

HoDoKu supports plain text givens and its own library format. The app follows the upstream library syntax for classic givens. [HoDoKu manual](https://hodoku.dev/docs_play) · [Library format source](https://github.com/PseudoFish/Hodoku/blob/master/src/sudoku/Sudoku2.java#L1145)
