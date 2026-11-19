# Sparse Classic Sudoku generation

Fresh construction found three 20-given puzzles in 32,539 attempts and no 17-, 18-, or 19-given puzzles in 32,768 attempts at each count. All three 20-given puzzles have complete human paths. Two rate Easy and one rates Tricky. The given count alone gives little information about the path. [Research issue #270](https://github.com/coder13/sudoku-app/issues/270)

Pool selection returned a unique puzzle on every unfiltered request. At 17 givens, 32 replies represent 13 stored identities. At 18 and 19 givens, adding known solution digits to stored templates produced 32 distinct identities at each count. A single-clue exchange produced five unique 19-given and nine unique 20-given identities. The independent equivalence check found no stored-template identity among those 14.

## Methods and results

One attempt produces and checks one candidate on the stated route. Fresh construction starts from a newly randomized completion and checks each clue removal for uniqueness. The built-in pool selects and transforms a template. It can also add digits from that template's completion. For mutation, each attempt samples one of the 14 verified 17-given sources, removes one given, and adds digits from its solution at randomly selected, originally empty cells.

The table gives matches, attempts, and distinct identities. Cost is the sum of elapsed generation time over all jobs in a row, divided by the number of matches. It includes failed attempts and process startup for the native routes. The measurements ran in parallel and exclude later verification. A dash marks rows with zero matches.

| Route | Givens | Matches / attempts | Distinct | Yield | Cost per match |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fresh, 128 attempts per seed | 17 | 0 / 32,768 | 0 | 0% | — |
| Fresh, 128 attempts per seed | 18 | 0 / 32,768 | 0 | 0% | — |
| Fresh, 128 attempts per seed | 19 | 0 / 32,768 | 0 | 0% | — |
| Fresh, 128 attempts per seed | 20 | 3 / 32,539 | 3 | 0.0092% | 14.97 s |
| Fresh, default order | 21–23 | 32 / 154 | 32 | 20.8% | 8.98 ms |
| Fresh, default order | 24–28 | 32 / 32 | 32 | 100% | 2.54 ms |
| Fresh, Hard, default order | 24–28 | 31 / 225 | 31 | 13.8% | 13.22 ms |
| Fresh, Hard, eight techniques | 24–28 | 17 / 550 | 17 | 3.1% | 51.32 ms |
| Fresh, score 0–1,000 | 22–26 | 32 / 46 | 32 | 69.6% | 3.57 ms |
| Fresh, score 1,001–1,600 | 22–26 | 32 / 198 | 32 | 16.2% | 12.96 ms |
| Fresh, first Naked Single | 22–27 | 5 / 506 | 5 | 1.0% | 161.47 ms |
| Fresh, first X-Wing | 22–27 | 0 / 576 | 0 | 0% | — |
| Mutation, 60,000 nodes | 17 | 0 / 1,536 | 0 | 0% | — |
| Mutation, 60,000 nodes | 18 | 0 / 1,536 | 0 | 0% | — |
| Mutation, 60,000 nodes | 19 | 5 / 1,454 | 5 | 0.34% | 324.67 ms |
| Mutation, 60,000 nodes | 20 | 9 / 1,454 | 9 | 0.62% | 158.91 ms |
| Pool | 17 | 32 / 32 | 13 | 100% | 15.13 ms |
| Pool | 18 | 32 / 32 | 32 | 100% | 16.46 ms |
| Pool | 19 | 32 / 32 | 32 | 100% | 14.12 ms |
| Pool | 20 | 32 / 32 | 30 | 100% | 14.09 ms |
| Pool, score 0–1,000 | 17–20 | 24 / 44 | 24 | 54.5% | 14.83 ms |
| Pool, score 1,001–1,600 | 17–20 | 24 / 74 | 21 | 32.4% | 15.86 ms |
| Pool, first X-Wing | 17–20 | 0 / 576 | 0 | 0% | — |

The initial 24-attempt fresh sweep covered seeds 1–64 at each count from 17 through 20. It found zero matches in 1,536 attempts per count. The 128-attempt sweep covered seeds 1–256 at each count and repeated the first 24 attempts for seeds 1–64. The table reports the larger budget on its own. A miss shows what these seeds and budgets found. The fresh CLI has an attempt and wall-time limit. Its Classic clue-carving search has no per-attempt node setting.

The three fresh 20-given matches came from seed 87 at attempt 59, seed 132 at attempt 81, and seed 139 at attempt 15. The sweep retains their full grids and the replay retains their paths.

The paired mutation run used the same seeds and draws with a 128-node limit for each uniqueness check. It confirmed three 19-given and eight 20-given results. In order from 17 through 20 givens, the limit interrupted 63, 63, 66, and 59 checks. Those checks are inconclusive. At 60,000 nodes, every attempted mutation had a definitive answer. All 3,072 attempts at 17 or 18 givens had multiple solutions.

## Human paths and played history

All 385 accepted jobs, including repeated jobs and the tighter mutation run, passed independent count-to-two verification. They represent 361 distinct grids and 330 logical identities. The app Wasm agreed on every exact solution. It reproduced 372 distinct grid-and-profile human paths. Every placement and elimination agreed with the independent completion. All paths finished. For jobs with a native rating, the complete Wasm rating matched, including the score breakdown and technique order. Classic scoring version 11 applies to these results.

The Hard comparison uses the same 32 seeds. The full profile returned 31 Hard paths and the eight-technique profile returned 17. All 48 start with Hidden Single in a Box. Under the full order, scores of 1,010–1,580 included Medium through Very Hard paths. The three fresh 20-given scores range from 554 to 1,004. The 17-given pool yielded Easy through Master, from 656 to 6,786 points. A score band and a named difficulty select different paths.

For exact 17-given pool selection and fresh 24–28-given construction, a played grid and its transpose both led to the same replacement. The replacement has a different logical identity. Excluding all 14 eligible stored 17-given identities returned a search limit at 64 attempts. The independent identity checker enumerated legal row, column, transpose, and digit mappings on 383 grids including the history fixtures and source templates. The 78 comparisons within groups with compatible given distributions verified 334 identity classes.

## Reproduce

Engine baseline `2ac395a67d46db47db25e4e3af08dcc63ee50bbf`. The run used an AMD Ryzen 7 7840U with 16 logical CPUs on Arch Linux 7.1.8, Rust and Cargo 1.92.0, Node 22.23.1, and Python 3.14.10. Each run used six workers on logical CPUs 0, 2, 4, 8, 12, and 14. The job deadlines were 12 seconds and the independent verification limit was 500,000 nodes per grid. No job reached the wall limit. The 952-job initial sweep, 1,024-job larger fresh sweep, and 256-job tighter mutation sweep ran in 4.05, 30.51, and 1.07 seconds. These are parallel throughput measurements.

Build the CLI and app Wasm at the baseline. Run the research scripts from this report's checkout. Use a new directory for the two build targets and run files.

```sh
out=$(mktemp -d)
base=/path/to/baseline-worktree
(
  cd "$base"
  cargo build --locked --release -p sudoku-app-engine --features cli \
    --bin sudoku-engine --target-dir "$out/native"
  CARGO_TARGET_DIR="$out/wasm" node scripts/build-wasm.mjs app "$out/app"
)
cli="$out/native/release/sudoku-engine"
templates="$base/crates/engine/src/generation/templates.rs"
run_sweep() {
  taskset -c 0,2,4,8,12,14 timeout -s INT -k 5s 900s \
    python scripts/research/sparse-classic-calibration.py "$cli" "$templates" --workers 6 "$@"
}
run_sweep > "$out/sweep.jsonl"
run_sweep --extended-fresh > "$out/extended.jsonl"
run_sweep --tight-mutation > "$out/tight.jsonl"
timeout -s INT -k 5s 900s node --experimental-strip-types \
  scripts/research/replay-sparse-classic.mjs "$out/app/engine.wasm" \
  "$out/sweep.jsonl" "$out/extended.jsonl" "$out/tight.jsonl" > "$out/replay-all.jsonl"
timeout -s INT -k 5s 180s python scripts/research/summarize-sparse-classic.py \
  "$out/replay-all.jsonl" "$out/sweep.jsonl" "$out/extended.jsonl" "$out/tight.jsonl"
```

| Artifact | SHA-256 |
| --- | --- |
| Native CLI | `f83a5d423763e0d220196380cd41bf6be24abea269be952c4e2d27e3132fdd10` |
| App Wasm | `55a76d6475bab3f4cdffe3f23f878bab8a5f19fba42ba63de249ad2ba95c060c` |
| Source templates | `cf36e0a11c862a21afdf8456f9a872be1914bc1d6c48adc71b79bc891e5ef888` |
| Initial sweep | `d6150d0b08edb0af4a759acfbc228a3e0b3861f3c2e57d2b46047d818777cc2d` |
| Larger fresh sweep | `853128f15644ac9ef20b68568c7d76e5987a0bffff8b96d2f1fed70217ee12cf` |
| Tighter mutation sweep | `079109e2c359ae5093907cd8e384d5138e8e176fc3df9ccc0f10f32f403134ed` |
| Replay | `3dc1bf9214973dd52513cca64bd783ca3401763e2e3f79ba82ea569fd87b23cf` |

The JSONL files contain the seed, budgets, resolved orders, exact results, full human paths, and history checks. Results support pool selection for immediate 17-given delivery within the coverage of the tested templates. Fresh 24–28-given construction yields distinct Hard puzzles at a much higher rate than the narrow 17–20-given targets. This study leaves the production recipes with their current behavior.
