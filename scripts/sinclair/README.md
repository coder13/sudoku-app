# Reproduce the Sinclair playtest

Run from the repository root. The native constructor uses the project’s Rust toolchain. Training uses Python with NumPy (the published run used 2.3.5). The independent solution checker uses the project’s Node runtime. These tools are offline research dependencies.

## Retrain the two models

```sh
mkdir -p /tmp/sinclair-model
python3 scripts/sinclair/model.py docs/research/sinclair/reference-traces.jsonl.gz /tmp/sinclair-model
```

The checked-in reference snapshot is sufficient for this command. It contains two checked paths per puzzle and aggregate measurements of accepted player replays. The output includes the fitted weights, split sizes, baselines, test errors and all 100 validation rounds for both objectives.

## Rebuild and verify all 230 puzzles

```sh
python3 scripts/sinclair/reproduce.py /tmp/sinclair-rebuild --jobs 3
```

The command reads the edition’s recorded candidate streams and seed ranges, retrains the models, builds the native engine example, reruns independent candidate searches, and performs four generations of model-guided editing. It writes a separate catalog, recounts completions and compares all three output files byte for byte with the released edition. Use an empty destination. The most expensive stage is exact search on sparse X Sudoku candidates.

A completed candidate cache can shorten a repeat run. Pass `--candidate-cache /path/to/pool` to verify each seeded stream against its recorded SHA-256 and rerun model training, guided editing, selection and independent verification.

The original candidate ledger used variant scoring version 5. Versions 7 and 8 added techniques for other variants. Reproduction checks the historical stream hashes using the original version tag, then checks each selected puzzle’s difficulty, points and hardest technique against the current engine before recording its version.

These two commands check the released puzzles directly.

```sh
node --experimental-strip-types scripts/sinclair/verify.mts
npm run test:collections
```

The first command uses the independent exhaustive checker and matches solution hashes to the edition ledger. The second checks the browser engine’s published difficulty labels and the app’s collection loading flow.

## Rebuild the source snapshot

This step needs network access and Poppler’s `pdftotext`. The two downloaders use public puzzle pages and the seven identified competition booklets. Their original grids and the raw player replays stay in the working directory.

```sh
mkdir -p /tmp/sinclair-sources
python3 scripts/sinclair/fetch_janko.py /tmp/sinclair-sources/janko
python3 scripts/sinclair/fetch_gp.py /tmp/sinclair-sources/gp
python3 scripts/sinclair/gp_controls.py /tmp/sinclair-sources/gp /tmp/sinclair-sources/gp-controls.json
cargo build --release -p sudoku-app-engine --features wasm-api --example sinclair
python3 scripts/sinclair/references.py /tmp/sinclair-sources/janko /tmp/sinclair-sources/reference-traces.jsonl.gz --gp /tmp/sinclair-sources/gp-controls.json
```

Source pages can be revised. Each accepted Janko page and WPF booklet has its source hash in the published snapshot. The source parser checks the published solution when one is supplied. A second complete logical solve uses the board rotated through 180°.

## Files in the edition

| File | What it records |
| --- | --- |
| `reference-traces.jsonl.gz` | Digit-free engine events, shape hashes, source attribution and aggregate replay measurements |
| `model.json` and `training.json` | Sequence-model tables, fitted replay model, checkpoints and held-out results |
| `construction-rounds.json` | Model-guided parent search and its results at each generation |
| `selection.json` | Seed ranges, per-level selection comparisons, unique puzzle codes, lineage, clue shape and solution hashes |
| `verification.json` | Exact per-level counts and independent search results |
| `playtest.csv` | Spoiler-free list for recording enjoyment, perceived difficulty and comments |

The research files live under [the edition report](../../docs/research/sinclair/README.md). The app reads the three static collection files from its existing download pipeline.

## Earlier live Impossible Classic generator

The earlier live constructor used 256 hard positions derived from the app’s Impossible bank. The following commands rebuild those continuations. The scratch directory holds one certificate per source so a run can resume. The current New Puzzle option reads the downloadable library. [Earlier construction, timings and verification](../../docs/research/sinclair/live/REPORT.md#how-impossible-classic-starts-faster)

```sh
npm run build:wasm
node --experimental-strip-types scripts/sinclair/build-impossible.mts /tmp/impossible-cores.json /tmp/sinclair-core-cache 256 4
cmp /tmp/impossible-cores.json src/sudoku/sinclair-impossible-cores.json
node --experimental-strip-types --test scripts/sinclair/live-generator.test.mts
node --experimental-strip-types scripts/sinclair/benchmark-impossible.mts /tmp/impossible-engine.json 320 40
```

The benchmark first times the original four seeds and a growing library. Outside the timer it checks every supported starting mask with an independent solution counter and replays the full difficulty checks for a sample. The browser benchmark accepts `impossible` as its final argument to exercise the Classic Start button and an installed offline copy.

## The downloadable library

The 66 source files in `data/sinclair` contain the complete edition. A normal build writes the compact index and the 66 on-demand files to the Netlify publish directory. The build uses the checked-in puzzles and requires no candidate search. [Release results and measurements](../../docs/research/sinclair/catalog/REPORT.md)

```sh
npm run build
node --experimental-strip-types scripts/sinclair/audit-deploy.mjs
```

### Generate a new edition in GitHub Actions

Open **Actions → Generate Sinclair library → Run workflow**. The button becomes available after this workflow reaches the default branch. The optional seed names the candidate sequence. An empty seed uses the run ID, so a new run searches a fresh sequence. The selected commit supplies the solver, model and search code. [GitHub manual workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

GitHub searches all nine variants, selects 100 puzzles at each level, and checks all 6,600 against the browser engine and the independent solver. A successful run produces a downloadable artifact named `sinclair-library-RUN_ID`. It contains the 66 source packs, their verification records, the seed, and the source commit. The workflow has read-only repository permissions. Publishing a new edition is a separate, reviewed change to the committed files.

```sh
gh workflow run sinclair-library.yml --ref main
gh run list --workflow sinclair-library.yml
# Replace RUN_ID with the run number from the previous command's ID column.
gh run download RUN_ID --name sinclair-library-RUN_ID --dir /tmp/sinclair-new-edition
```

For a release, compare the artifact with the current edition, update the research measurements you plan to publish, and commit the chosen packs and verification records together. The next ordinary Netlify build reads those files. If one is missing, packaging reports an error. The packing test exercises this path in a directory with no native engine or research scripts.

### Generate locally

To build a new edition, use a scratch directory for the candidate records. Set `SINCLAIR_SEED` for a new search sequence. Use the same seed when resuming a scratch directory. The first search keeps 135 graded candidates at every selectable level. Subsequent searches improve Classic clue layouts and find empty-grid Killer puzzles. The selection command writes an edition only when every group has enough different answers and layouts. Expensive searches can resume from the same directory. Worker scheduling and time limits can change which candidates reach the new edition.

```sh
cargo build --release --locked -p sudoku-app-engine --features wasm-api --example sinclair
node --experimental-strip-types scripts/sinclair/catalog-pool.mts /tmp/sinclair-library 5 135
node --experimental-strip-types scripts/sinclair/catalog-polish.mts /tmp/sinclair-library 3
node --experimental-strip-types scripts/sinclair/catalog-cages.mts /tmp/sinclair-library 3 135 easy,medium
node --experimental-strip-types scripts/sinclair/catalog-cage-trades.mts /tmp/sinclair-library 4 140
node --experimental-strip-types scripts/sinclair/publish-catalog.mts /tmp/sinclair-library /tmp/sinclair-edition /tmp/sinclair-report
```

The independent solution check needs the Z3 command-line solver. The grade check uses the browser engine built by `npm run build`. These commands recheck the shipped puzzles. For a candidate edition, substitute its directory for `data/sinclair`. The grade and solution checks can resume from their output files. The deploy check links all source hashes and grade receipts to the built downloads.

```sh
python3 scripts/sinclair/audit-catalog.py data/sinclair /tmp/sinclair-solutions.txt --jobs 4 --report /tmp/sinclair-solutions.json
python3 scripts/sinclair/audit-variety.py data/sinclair /tmp/sinclair-variety.json
node --experimental-strip-types scripts/sinclair/audit-grades.mts data/sinclair /tmp/sinclair-grades.json
node --experimental-strip-types scripts/sinclair/audit-deploy.mjs /tmp/sinclair-grades.json
```

To repeat the Standard comparison, build the native example above. The control script requests 100 independent first draws at every level. The measurement script compares them with the shipped edition. It records unsuccessful requests and writes both raw and per-level results. To preserve the original research, copy its selection records to a scratch directory first.

```sh
mkdir -p /tmp/sinclair-comparison
cp docs/research/sinclair/catalog/selection.jsonl.gz /tmp/sinclair-comparison/
node --experimental-strip-types scripts/sinclair/catalog-controls.mts /tmp/sinclair-controls.jsonl
node --experimental-strip-types scripts/sinclair/catalog-measurements.mts /tmp/sinclair-comparison /tmp/sinclair-controls.jsonl
node --experimental-strip-types scripts/sinclair/catalog-examples.mts /tmp/sinclair-comparison /tmp/sinclair-examples.json
python3 scripts/sinclair/summarize-live.py /tmp/sinclair-examples.json /tmp/sinclair-comparison --catalog-examples
```
