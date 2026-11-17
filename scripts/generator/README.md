# Learn a Sudoku generator from published puzzles

The experiment compares clue placement, Killer cages and Jigsaw regions. The Rust engine checks the solution and grade. The app can open the generated puzzles. Read the [research report](../../docs/research/learning-to-generate-sudoku.md) for the findings and design proposal. The [measurement file](results.json) includes every tested method and grade.

## Generate a puzzle

Use Python 3.10 or later and a stable Rust toolchain that supports the project. Run these commands from the repository root. Training is optional. The fitted model is included.

```sh
cargo build --locked --release -p sudoku-app-engine --features cli --bin sudoku-engine --example generator_lab
python3 scripts/generator/sample.py classic easy --seed 269428861 --format link
python3 scripts/generator/sample.py killer medium --seed 269428861 --method size-only --format link
python3 scripts/generator/sample.py jigsaw easy --seed 269428861 --method paired --format link
```

Open the printed link in the app. For the complete record, omit `--format link`. Results include the method, seed and number of attempts. A search that exhausts its budget returns a null result in JSON mode and an error in link mode. Use `--attempts` to change the budget.

The classic fit covers Beginner, Easy, Medium and Tricky. The `trades` option swaps pairs of classic clues. For Killer, `learned` uses shape frequencies and `size-only` gives equal weight to shapes of the same size. Both generate puzzles with zero starting digits. For Jigsaw, `paired` samples whether to put givens in opposite cells. Every variant must use its rule and pass the app's logical grader.

## Reproduce the study

The baseline is [main at 31573ea](https://github.com/coder13/sudoku-app/commit/31573ea73cfb173642624b82c5214ebe91792d63). Use a writable cache for the source data and raw output. Network access is needed on the first run. Later runs reuse the cache. Changing the worker count affects timings.

```sh
run_dir=$(mktemp -d)
lab=scripts/generator
python3 "$lab/train.py" --cache "$run_dir" --check
python3 "$lab/benchmark.py" classic --levels beginner easy medium tricky --seeds 64 --offset 1000 --attempts 6 --workers 4 > "$run_dir/classic.jsonl"
python3 "$lab/benchmark.py" classic --levels medium tricky --methods trades --seeds 64 --offset 1000 --attempts 6 --workers 4 > "$run_dir/trades.jsonl"
python3 "$lab/benchmark.py" killer --levels easy medium hard --seeds 64 --offset 1000 --attempts 4 --workers 4 > "$run_dir/killer.jsonl"
python3 "$lab/benchmark.py" jigsaw --levels easy medium tricky --methods current learned paired --seeds 64 --offset 1000 --attempts 4 --workers 4 > "$run_dir/jigsaw.jsonl"
python3 "$lab/benchmark.py" killer --levels medium --methods current-zero size-only --seeds 64 --offset 1000 --attempts 4 --workers 3 > "$run_dir/controls.jsonl"
python3 "$lab/validate.py" --cache "$run_dir" "$run_dir"/*.jsonl > "$run_dir/results.json"
```

The 1,984 requests include failed searches. Each method starts with the same request seeds. Methods can spend different amounts of time on one attempt. The current classic method uses fresh targeted search. The current variant method uses the app's difficulty recipes with fresh seeds. Full app sessions can also use a practice focus, templates and fallbacks. The study checks each accepted grade, rechecks generated solutions, compares canonical puzzles, scores reference layouts and calculates paired exact tests.

## Training data

- **Classic.** The app's 100 Nikoli puzzles supply the four difficulty profiles. The training set contains 79. The test set contains 21. [Nikoli and Sakana AI release](https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli).
- **Killer and Jigsaw.** The 9 by 9 subsets contain 486 Killer and 132 Jigsaw puzzles. The input parser checks each published solution and its cage or region map. The code verifies all four file hashes. [Puzzlekit source revision](https://github.com/SmilingWayne/puzzlekit-dataset/tree/f4b71bc9170c4a072fad7056e140c14968941c3d).
- **Independent classic test.** The parser accepts complete literal-givens transcriptions from six credited setters. It verifies unique solutions and removes equivalent puzzles. The 82 accepted puzzles test how the Nikoli model transfers. The follow-up model holds out each whole setter. [Transcription index revision](https://github.com/sigh/iss-sudoku-index/tree/7d9119de588fdab20e3c379db20839909c5f0785).
- **Generated control.** The app's 60 Sudoku Exchange puzzles give a separate test of the mask model. [Sudoku Exchange](https://github.com/grantm/sudoku-exchange-puzzle-bank).

The aggregate model is 1,590 bytes. Source puzzle files stay in the local cache. Fitting needs no neural network or third-party Python packages.
