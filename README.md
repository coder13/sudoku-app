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

## Browse UI components

Run `npm run storybook` and open [Storybook on localhost](http://127.0.0.1:6006). The sidebar groups components by size, from hint cards and breadcrumbs to dialogs, the play workspace, and Learn pages. Use the Appearance and Viewport controls to check light, dark, and narrow layouts.

Open **Small → Hints → Copy review → All Techniques** to filter and compare hint copy. The difficulty folders also have one story for each engine technique. The stories use the app’s hint formatter and the engine’s verified lesson examples, so the catalog follows the engine when techniques change.

Run `npm run build-storybook` to create a static catalog in `storybook-static/`. Both commands prepare the browser engine and regenerate the technique stories. The play stories use a temporary puzzle library, so changes in Storybook do not affect your saved puzzles.

## Edit Learn articles

Run `npm run dev:lessons` and open [the local lesson editor](http://127.0.0.1:5180/__lesson-editor/). Select Overview or a technique and click the highlighted text to edit it on the rendered page. Use the left panel to add and move blocks, change diagram examples or crops, rename practice options, and edit links.

**Save to file** writes to `src/sudoku/learn-content.json` and refreshes the app preview. You can also press Cmd+S or Ctrl+S. **Preview** hides the editing controls so you can read the page and try its puzzles.

The editor runs on its own local preview server. Set `LESSON_EDITOR_PORT` to use another port. It uses the generated engine files from `npm run build:wasm` and builds them on first launch if they are missing.

## Play, create, and share

The grid accepts keyboard or touch input. It supports two types of candidates, cell colors, multi-select, undo, and redo. Open **Puzzles → New puzzle** to choose a variant and a difficulty. Jigsaw offers Easy through Hard. The other variants offer Easy through Extreme. The variant name above the grid opens its rules. The engine checks that the variant rule is needed for a unique solution, then rates a full logical solve using that rule. Hints explain the active rules and show the candidates or cells involved.

On mobile, press and hold a card for five seconds to rearrange the cards. Drag a card to move it. The hint card also appears in this mode so you can choose its position. The puzzle and timer stop while you rearrange cards. Press **X** to return to play. The browser saves the card order across refreshes and app updates.

Use **Create by hand** to enter givens for Classic Sudoku. Givens are the fixed starting digits. The app saves a hand-made puzzle for play after it finds exactly one solution.

Open **Puzzles → Collections** to browse Nikoli Classics (100 handmade puzzles) or Sudoku Exchange Selection (60 generated puzzles). Choose a difficulty, then play the next puzzle or preview a grid and save it for later. Opening a puzzle you already have resumes that game. After you finish, choose **Next puzzle in collection** to continue at the same difficulty. You can also change the collection difficulty or return to Puzzles to choose a different puzzle. The app includes both collections in its offline download and shows creator credits and reuse terms. Random generation remains available under **New puzzle**. See the [collection sources and update steps](src/sudoku/collections/README.md).

Open **Learn** for technique articles with diagrams and practice puzzles. In a practice puzzle, select an empty cell and a digit, then check your move.

If you have more than one saved puzzle, open Puzzle options and choose Switch puzzle.

The share menu copies a link to this app, an 81-character string, a nine-line grid, a HoDoKu library line, or a link for Sudoku Exchange or sudoku.coach. Import detects puzzle codes, links, and single-puzzle text files. It shows a board preview before you save or start the puzzle. On mobile, import and preview use a full page. On localhost, sharing defaults to a Sudoku Exchange link so anyone with the link can open the puzzle.

Variant puzzles use an app link that carries the givens and rules. Classic share formats carry the givens. Import also accepts Sudoku Coach `SCv7_32` codes and direct links, short Sudoku Exchange grids, f-puzzles exports, and SudokuPad links that contain an SCF or f-puzzles code. Imported puzzles can combine Jigsaw regions, Killer cages, either diagonal, extra regions, Anti-Knight, thermometers, arrows, and Kropki dots. White and black dots keep separate negative-rule settings. Preview and Play explain every active rule. Mixed puzzles retain their full definitions when saved or shared; after completion, choose another puzzle from the puzzle chooser. The app reports rules it cannot play. When you import a Sudoku Coach Current State code or a HoDoKu library line, you get the starting puzzle. Your progress stays in your browser.

### Player rating and Auto difficulty

Your player rating estimates your Sudoku skill. It starts at 855 and learns from the puzzles you play at Auto and fixed difficulties. Faster solves without hints can earn a small bonus based on your recent times at the same difficulty. Slow solves earn regular credit.

Choose Auto in New puzzle to let the app adjust the difficulty as you play. Auto starts at Medium. With little history, a fast solve without hints can move you up quickly, and requests for hints at multiple positions can move you down. As the app learns from more puzzles, it adjusts one difficulty at a time. The grid and results show the actual difficulty of the puzzle you play.

In Auto, use Solve all singles to finish an Easy puzzle without hints and move on to Medium with your rating intact. On harder puzzles, you can clear singles and get credit for solving the rest yourself.

Open Puzzles, then Statistics to see your rating, next Auto difficulty, and progress with each solving technique. The app credits the simplest technique that explains each move it can match. Classic Auto can pick a puzzle that gives you another chance to use a technique you have needed hints for. Your progress stays in your browser.

## Project layout

TanStack Start prerenders the app to static pages and assets in `dist/client`. Netlify or any static file server can publish that directory. The deployed app does not need an API or application server.

The same Rust engine in `crates/engine` runs in the browser as WebAssembly. A browser worker runs it off the UI thread. The engine generates puzzles, counts solutions up to two, and lists legal candidates. The build caches the page, assets, and engine so that play, generation, authoring, and import work offline after the first load.

See the [engine guide](crates/engine/README.md) for Rust, WebAssembly, and batch usage. Run `cargo doc --locked -p sudoku-app-engine --all-features --no-deps --open` to browse the API reference.

The [engine roadmap](SUDOKU_ENGINE_ROADMAP.md) records integration priorities and the criteria for additions. The [build guide](crates/engine/BUILD_FEATURES.md) describes optional Cargo capabilities and smaller Wasm profiles.

Client code calls `runEngine()` in `src/sudoku/engine.ts` for ratings, solve traces, hints, deduction searches, and targeted generation. Requests can supply a technique order by ID. If a request omits the order, the client uses the saved solver profile or the engine default.

## Engine requirements

A candidate is a possible digit for a cell. A deduction places a digit or removes one or more candidates. A technique is the rule that proves a deduction. These requirements apply to classic 9 × 9 Sudoku.

### Configurable logical solver

The user must be able to enable or disable each supported technique and change the order of enabled techniques. The solver must accept any combination, including an empty set. It must keep candidate removals as it applies each deduction.

For each move, the solver must try enabled techniques in the chosen order. It must apply a deduction from the first technique that can change the board or its candidates. Then it must start again at the top of the order. If that technique finds several deductions, the solver must choose consistently for the same position and configuration.

If the solver finishes, it must return the completed grid and the ordered list of deductions. Each deduction must include the technique, the evidence, and the placements or removals. If the solver runs out of allowed deductions, it must report that it stalled and return the partial list. The engine must report conflicts, no solution, multiple solutions, and search limits as separate outcomes. It can use exact search to check whether the puzzle has one solution. Every deduction in the logical solve must come from an enabled technique.

The `logical-solve` request takes givens in `values`, optional placed digits in `entries`, and established candidate removals in `eliminations`. Pass `includePositions: true` to include the starting position and the position after each deduction, even in a stalled trace. The client helper `replayStep(trace, index)` returns the position before a zero-based step, the deduction with its evidence, and the position after it.

On desktop, open **Puzzle actions → Show solution** to review a solve from the givens. Choose a step to see its grid and highlights. The solution uses the saved solver profile and can show a partial solve if that profile runs out of moves. Select **Return to puzzle** to resume play. The replay requests `includeStepDetails: true` for each position’s candidates and the next move’s proof pattern.

### Puzzle scoring

Each technique must have a point cost and a difficulty tier. A puzzle rating must start from the givens and use the chosen solver configuration. The score must add the cost of each deduction once, even when that deduction changes several candidates. Difficulty follows the hardest technique tier. Accumulated points never promote a puzzle. See [the ten difficulty levels](docs/difficulty-levels.md) for generation and learning rules.

The ten levels run from Beginner to Impossible, with Medium selected for a new player. The scoring policy is version 11. Existing point costs remain diagnostic values and do not define difficulty bands.

A complete rating must include the score, difficulty, hardest technique, and a count of deductions by technique. It must identify the solver configuration and version of the scoring rules so the rating can be reproduced. If the solve stalls or reaches a limit, any subtotal must be marked as partial.

### Ranked hints

The `hints` request returns up to `limit` distinct moves from the current grid. The default is ten, and a single available move is included. Hints rank by technique difficulty, then point cost. Smaller patterns, including shorter chains, break ties. Among equally sized proofs of one technique, fewer distinct houses come first. When several enabled techniques prove the same move, the engine keeps the first proof in that ranking.

During play, **View hint** shows up to ten ranked moves. **Analyze all moves** lists every ranked move from the enabled hint techniques.

The **Cell references** preference applies to hint actions, explanations, proof steps and solution lists for Classic and variants. Concise uses `r1c6`; Verbose uses `row 1, column 6`. Automatic uses concise references for techniques rated Tricky or higher and verbose references for easier techniques. The app formats the existing typed proof locally when this preference changes. Lesson diagrams keep their established notation when no preference is supplied.

Both `hints` and `next-deduction` accept established candidate removals and `disabledTechniques`. The app stores these hint preferences separately from the solver profile. To hide singles, disable `full-house`, `naked-single`, and `hidden-single`. To hide Locked Candidates, disable `pointing` and `claiming`.

The `deductions` request searches the selected techniques on the current grid and respects established candidate removals. Proofs with the same complete set of actions share one move. Each proof identifies the houses, cells, and candidates in its pattern. The move lists the cells and candidates named by its actions. An empty technique selection returns no moves.

### Trainer design

Hints open on the easiest enabled move. Each move starts at the technique, and the player controls the remaining reveals.

1. **Technique.** Name the technique.
2. **Digits.** Show the digits to look for.
3. **Location.** Highlight the houses or cells that form the pattern.
4. **Explanation.** Show why the pattern forces the move. Mark a placement with a ring and a removal with a strike. The player can then choose **Apply hint**.

The `next-deduction` request returns the easiest move from the same ranking as `hints`, even when it is the only choice. It accepts the current grid and any established candidate removals. It returns `null` when no move is available. The `technique` field identifies the rule, `pattern` gives the locations and candidates to inspect, and `deduction` gives the evidence and all placements or removals. For targeted practice, use `deductions` to look up all proofs for the requested technique.

Ask the engine about the current entries and previously applied candidate removals. If every empty cell has candidates, use those candidates for the proof and preview. If some cells have no candidates, use the engine's candidates and the applied removals. Dismissing the hint restores the player's candidate display. The same grid can render lesson diagrams from the evidence in a verified example.

Store applied removals with each undo position and read older saves as having no removals. If a player clears or replaces an entry, clear the applied removals because a proof can depend on that entry. Adding a digit keeps prior removals. Candidate generation uses the remaining masks. Applying a hint changes the entries or removals and updates the notes in one undoable move.

A request belongs to its puzzle and position, including candidate edits and applied removals. A change invalidates the proof and any pending response. If the engine finds a conflict or an impossible position, explain what the player can review. If it finds no supported move, say so. Give a separate retry state for a search limit or engine error.

The lesson library uses ordered blocks in `src/sudoku/lessons.ts`. An article can place paragraphs, headings, lists, board diagrams, and practice puzzles in any order. A diagram can specify a region with a starting row, starting column, height, and width. The diagram keeps the original board coordinates.

Practice starts from a verified version of the example with rows and columns swapped and digits renamed. The engine checks that version at build time and exports the moves proved by the requested technique. Each practice puzzle accepts any one of those moves. Later exercises can use new positions to test recognition.

For practice on a specific puzzle, send `practice-position` with the same starting position and technique order as `logical-solve`, plus the target technique ID in `technique`. It returns the position just before the first use of that technique, including placed digits, all established candidate removals, and the remaining candidates. It returns `null` when the solve path has no such step, including when the technique is disabled.

Send the practice position, target technique ID, and a proposed placement or removal in `action` to `check-practice-move`. The engine returns a proof from the target technique if any of its deductions supports the submitted action. It returns `null` for a move that has no proof from that technique.

Sudoku Coach informed the lesson and practice flow. HoDoKu shows how a solver can reveal a move in stages. SudokuWiki and Sudopedia give alternate names and rule definitions. Hodoku Revisited shows how a walkthrough can keep the reason and the answer on the same board. [Sudoku Coach techniques](https://sudoku.coach/en/learn/technique-overview) · [HoDoKu hints and practice](https://hodoku.dev/docs_play) · [SudokuWiki strategy families](https://www.sudokuwiki.org/Strategy_Families) · [Sudopedia technique index](https://sudopedia.sudocue.net/index.php?title=Solving_technique) · [Hodoku Revisited hints](https://hodokurevisited.com/manual/hints.html)

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
