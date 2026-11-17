# Production frontend and offline bundle verification

Tested on 2026-11-17 from `codex/uat-fixes`, using the application source plus
the local UAT fixes. No deployment was performed.

## Build procedure and environment

The tested build commands were:

```sh
./node_modules/.bin/vite build
node scripts/build-offline.mjs
```

Vite compiled both the client and server bundles and successfully prerendered
152 pages in the initial snapshot. The first attempt reached prerendering but
the sandbox blocked its temporary listener with `listen EPERM`. Retrying with
the required execution permission succeeded. This was an execution-environment
restriction. Logs: [successful build](production-build.log),
[initial sandbox restriction](production-build-sandbox-blocked.log).

The full `npm run build` command was not executed in this pass. That command
unconditionally rebuilds the Rust WASM before Vite. The host has Homebrew Rust
and Cargo 1.99.0, no `rustup`, and no `wasm32-unknown-unknown` standard-library
directory. No Rust source changed, so this frontend/offline verification reused
the already validated `app` WASM described in [engine-coverage.md](engine-coverage.md).
The alternate WASM-profile rebuild was also skipped for this reason.

The build reported a main JavaScript chunk above Vite's 500 kB warning threshold
(approximately 1.895 MB minified, 463 kB gzip). The build succeeded; this warning
does not establish a user-visible performance defect.

## Initial offline bundle

[offline-bundle-manifest.json](offline-bundle-manifest.json) records the bundle
inventory:

- 174 precached assets, all present on disk.
- Cache revision `sudoku-app-shell-322ca956e899ff59`.
- 20,086,919 uncompressed bytes in the shell asset inventory.
- Packaged WASM SHA-256 matches the tested source artifact:
  `b3155357f4cfd0ad7d40cddb5ef9703470febe265f9c47ff99aec3e5d0965bcb`.
- Optional collection grids and source maps are excluded from shell precaching.

The standalone preview was started with:

```sh
./node_modules/.bin/vite preview --host 127.0.0.1 --port 8768 --strictPort
```

Read-only HTTP checks confirmed `/` returns 200 HTML and `/sw.js` returns 200
JavaScript. The preview is available for separate browser offline/PWA checks;
the development server on 8767 and unrelated service on 8766 were left running.

## Confirmed issue: Keyboard shortcuts omitted from offline shells

The application router contains `/shortcuts`, but Vite's explicit prerender
inventory omitted it. The production bundle consequently contained no
`/shortcuts/index.html`, and the generated service worker did not precache that
route. The worker handles only known cached navigation paths, so an offline
direct navigation or reload of `/shortcuts` falls through to the unavailable
network.

The source fix adds `/shortcuts` to `prerenderPages()` in `vite.config.ts`.
`tests/production-offline.mts` checks the actual built artifact against the
generated router inventory, verifies all generated HTML shells are precached
and every cached asset exists, and compares the packaged engine with the tested
source WASM. Against the initial snapshot, it correctly produced **2 passed,
1 failed**, identifying the missing `/shortcuts/index.html` shell. Evidence:
[production-offline-before.log](production-offline-before.log).

The original `dist` and production preview on 8768 were preserved for the
browser reproduction. The fixed frontend source and validated generated assets
were copied to `/private/tmp/sudoku-uat-fixed-IdKF1g`, with the same installed
dependencies, and built separately. Its preview is available on 8769. Neither
preview changes the deployed site.

The fixed production build and offline-bundle step both passed:

- 153 prerendered pages and 175 precached assets; none are missing on disk.
- `/shortcuts/index.html` is generated and precached.
- Cache revision `sudoku-app-shell-257dca2a0db49a2a`.
- 20,132,235 uncompressed bytes in the fixed shell asset inventory.
- The packaged WASM retains the exact validated hash.
- The actual-artifact regression passes **3 of 3 tests**.
- HTTP checks of `/shortcuts`, `/shortcuts/index.html`, and `/sw.js` all return
  200 with the expected HTML or JavaScript content type.

Evidence: [fixed build log](production-build-fixed.log),
[fixed offline inventory](offline-bundle-manifest-fixed.json),
[passing artifact regression](production-offline-fixed.log), and
[fixed preview log](production-preview-fixed.log).

Run the artifact regression after a production build and offline-bundle step:

```sh
node --experimental-strip-types --test tests/production-offline.mts
```

The test reads `dist/client` relative to its checkout. The fixed result above
was run inside the isolated build directory, and the pre-fix result was run
inside the original checkout. The original checkout's `dist` intentionally
remains the comparison snapshot until the main UAT coordinator rebuilds it.

## Native engine feature combinations

`npm run test:engine-features` completed with exit code 0. It exercised all eight
combinations of the optional `variants`, `generation`, and `teaching` features
on the native target:

- 16 successful `cargo check --all-targets` runs: each combination without and
  with `wasm-api`.
- 8 passed build-contract tests, including validation, solve, rate, and sound
  hint choices.
- 8 passed capability/omitted-operation tests, verifying that omitted
  capabilities preserve the core solver.

Some reduced-feature combinations emitted conditional dead-code warnings;
no check or test failed. Full evidence is in
[engine-features-native.log](engine-features-native.log).

## Limits

Build success, asset coverage, and HTTP availability are established here.
Browser installation, service-worker control, actual disconnected navigation,
updates, and physical-device PWA behavior are recorded separately in the main
UAT ledger. The frontend build does not substitute for rebuilding the Rust WASM
with an installed cross-compilation target.
