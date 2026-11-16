# Sudoku

Play classic 9 × 9 Sudoku. Start several puzzles and switch between them at any time. The app saves each puzzle, its entries, notes, and undo history in the browser.

## Run locally

Install Node.js 22.12 or newer and stable Rust with Rustup. Add the Rust target for WebAssembly, which lets the browser run the Rust engine.

```sh
rustup target add wasm32-unknown-unknown
npm ci
npm run build
npm start
```

Open [Sudoku on localhost](http://127.0.0.1:8765). Set `SUDOKU_APP_ADDRESS` to use a different address or port.

Use `npm run dev` for frontend development. It prints the development URL. To test offline use, serve the production build and wait for the app to show Offline ready. The browser needs localhost or HTTPS to install the service worker that serves the app offline.

Run `npm run check` for TypeScript, `npm test` for game and sharing tests, and `cargo test --locked` for Rust.

## Play, create, and share

The board accepts keyboard or touch input. It supports two types of pencil marks, cell colors, multi-select, and undo and redo. Use New puzzle to generate a puzzle or enter givens by hand. Givens are the fixed starting digits. The app saves a hand-made puzzle for play after it finds exactly one solution.

The share menu copies a link to this app, an 81-character string, a nine-line grid, a HoDoKu library line, or a link for Sudoku Exchange or sudoku.coach. Import accepts the same formats and reads single-puzzle text files. On localhost, sharing defaults to a Sudoku Exchange link so anyone with the link can open the puzzle.

Share formats carry the givens. When the app imports a HoDoKu library line, it skips moves marked with `+`. Your progress stays in your browser.

## Project layout

TanStack Start renders React to a static page during the build. The Rust server in `crates/server` serves that page and assets from `dist/client`. It also serves `GET /api/health` and `POST /api/v1/puzzles/analyze`. The analysis endpoint accepts JSON with a `puzzle` field containing 81 digits or dots.

The same Rust engine in `crates/engine` runs in the browser as WebAssembly. A browser worker runs it off the UI thread. The engine generates puzzles, counts solutions up to two, and lists legal candidates. The build caches the page, assets, and engine so that play, generation, authoring, and import work offline after the first load.

## Research

Sudoku Exchange informed the touch and keyboard controls, two kinds of pencil marks, and the uniqueness check in the puzzle editor. Its share links use the `s` query parameter. [Sudoku Exchange source and example](https://github.com/grantm/sudoku-web-app)

sudoku.coach informed the separate center and corner marks and the way you can fill candidates on demand. Classic share links can carry an 81-digit grid in the path. [Candidate notation](https://sudoku.coach/en/learn/cell-candidate-notation) · [Text import](https://sudoku.coach/en/play/from-text)

HoDoKu supports plain text givens and its own library format. The app follows the upstream library syntax for classic givens. [HoDoKu manual](https://hodoku.dev/docs_play) · [Library format source](https://github.com/PseudoFish/Hodoku/blob/master/src/sudoku/Sudoku2.java#L1145)
