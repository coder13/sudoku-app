# Sudoku engine build features

The engine always includes Classic validation, exact solving, candidates, hints, logical traces, ratings, and rank proofs.
Cargo features add complete capabilities. Use `default-features = false` to omit the optional code.
A solver profile selects the enabled techniques and their order within a build.

| Feature | Included capability |
| --- | --- |
| `variants` | Structured rules, combined constraints, variant validation, solving, hints, and ratings |
| `generation` | Seeded generation, targets, template pools, canonical puzzle keys, and resumable searches |
| `teaching` | Lesson diagrams, curated practice positions, and transformed exercises |
| `wasm-api` | JSON serialization and the WebAssembly request interface |
| `cli` | Batch commands with `wasm-api`, `variants`, `generation`, and `teaching` |

The default includes `variants`, `generation`, and `teaching` for compatibility with existing Rust callers.
The browser build selects its features explicitly with `--no-default-features`.
Use the `capabilities` request to read the capabilities in a WebAssembly build.
If an operation requires an omitted capability, the engine returns `unsupported-capability`.

```toml
[dependencies]
sudoku-app-engine = { path = "../sudoku-app/crates/engine", default-features = false }
```

Add `features = ["variants"]` for variant solving without generation or teaching fixtures.
Use the main crate README for the complete API guide with all default capabilities.

## Browser profiles

Run these commands from the repository root with stable Rust and the `wasm32-unknown-unknown` target installed.
The optional second argument sets the output directory.
The default command builds the production app profile under `src/sudoku/generated`.

| Profile | Features | Intended caller |
| --- | --- | --- |
| `solver` | `wasm-api` | Classic validation, solving, hints, and ratings |
| `variant-solver` | `wasm-api,variants` | Classic and variant solving without generation or teaching fixtures |
| `classic` | `wasm-api,generation,teaching` | A Classic client with generation and teaching |
| `app` | `wasm-api,variants,generation,teaching` | The complete current app |

```sh
npm run build:wasm
npm run build:wasm -- solver /tmp/sudoku-solver
npm run build:wasm -- variant-solver /tmp/sudoku-variant-solver
npm run build:wasm -- classic /tmp/sudoku-classic
```

Each output includes `engine.wasm` and `engine-profile.json`.
A teaching build also includes the generated lesson examples, difficulties, and aliases.
A build without teaching removes those three generated JSON files from its output directory.
The development launcher rebuilds the app profile if the saved profile differs.

The `capabilities` request returns the same flags as the manifest.
The structured API rejects operations for omitted capabilities with `unsupported-capability`.
The fixed-buffer `generate_board` export exists only with `generation`.
The app worker adapter also reports `unsupported-capability` for that missing export.

```js
const capabilities = request(instance.exports, { type: 'capabilities' }).value
// { classic: true, variants: false, generation: false, teaching: false }
```

Use the request-buffer helper in the main README to call `request`.
Serialize calls within one worker, because the module owns shared request and response buffers.
All four profiles preserve the Classic technique catalog, default order, rating results, and hint choices.

## Verify capability boundaries

The native matrix compiles all eight capability combinations with and without serialization.
It also exercises retained solver behavior and capability errors with serialization enabled.
Unit tests can include fixture modules for proof regressions even when their production feature is disabled.
The integration tests and compiled Wasm tests exercise the actual reduced library and module.

```sh
npm run test:engine-features
npm run test:wasm-profiles
cargo test --locked -p sudoku-app-engine --all-features
npm run test:wasm
```

The [engine workflow](../../.github/workflows/engine.yml) runs these checks for engine changes and for pushes to main.
It also runs the full native suite, strict Cargo documentation, and the Wasm and app contract tests.

The Wasm matrix instantiates each named release profile, compares Classic results, and exercises included and omitted operations.
It also reports raw and gzip sizes and rejects a size ordering that fails to omit code.
Use the same Rust toolchain when comparing these measurements.

The local release measurement used Rust 1.100.0 on Apple Silicon on 2026-11-17.
The complete app keeps all capabilities because its current flows use them.
A custom client can select a smaller profile.

| Profile | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| `solver` | 2,326,560 | 586,288 |
| `variant-solver` | 2,868,523 | 693,665 |
| `classic` | 2,864,624 | 686,972 |
| `app` | 3,741,413 | 883,946 |

The solver profile is approximately 34% smaller than the app profile after gzip.
Sizes describe the Wasm module and exclude the separate lesson JSON files.
These are measurements of this revision, rather than permanent byte limits.

## Feature dependencies and future splits

The three optional capabilities are independent.
Generation uses its own small seed-puzzle pool and a shared grid-transformation helper.
It does not depend on the complete teaching catalog.
Variant generation requires both `variants` and `generation`.
Variant lesson catalogs require both `variants` and `teaching`.

The lean foundation includes the complete current Classic detector catalog and rank proofs.
This release does not select individual detectors or individual variant rule families at compile time.
A saved solver profile still controls detector use at runtime.
Use the engine roadmap to evaluate a narrower compile boundary against actual client needs and measured savings.
