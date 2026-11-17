# Import, persistence, and offline coverage — November 17, 2026

This expands the live UAT with automated behavioral tests and source review on
`codex/uat-fixes`, based on `07eae53`, while preserving the initial five fixes.
This audit used no shared-browser actions, deployment, commits, or Rust rebuilds.
The root agent records browser results separately in `browser-cases.json` and
`full-coverage.md`.

## Confirmed issues fixed

### DATA-01 — A failed initialization write hides a readable puzzle library

**Reproduction:** retain a valid saved puzzle, active puzzle ID, and undo/redo
history in local storage; omit `sudoku-app:v1:initialized`; make storage writes
throw `QuotaExceededError`; reload the store.

**Before:** hydration throws while writing the initialization marker. The store
reports unavailable storage but exposes an empty library and a null active ID,
even though the saved puzzle can still be read. The new regression failed with
`actual: null`, `expected: 'read-only'` for the active puzzle ID.

**Fix:** treat marker persistence as a fallible write, continue hydrating readable
puzzles, and report `storageAvailable: false`. The saved position and redo history
remain available; no unreadable or historical records are deleted by recovery.

**Verification:** `readable puzzles remain available when initializing storage
cannot write` now passes in `tests/storage.test.ts`.

### DATA-02 — JSON object field order bypasses variant duplicate detection

**Reproduction:** export a supported variant, reorder only JSON object keys in its
`#variant=` payload, and compare/import it again. Keep all arrays, cells, givens,
and actual rule values unchanged. For example, `{version, givens, rules}` and
`{rules, givens, version}` describe the same variant.

**Before:** `puzzleIdentity` and `ImportPuzzle` compared raw `JSON.stringify`
output. Field order created another identity, allowing duplicate library items
and potentially another rating attempt for a replay.

**Fix:** share one canonical object-field ordering between identities and import
matching. Preserve the established engine field order, so ordinary historical
generated-puzzle identities stay unchanged. Preserve every array and rule order
and every field value; this deliberately avoids merging payloads based on an
unproven assumption about equivalent constraints.

Historical rating-outcome and seen-puzzle keys are normalized on read without
rewriting rating evidence. A missing variant technique-history key uses a legacy
key lookup; updates reuse that record in place. Normal direct IndexedDB lookups
do not scan the database, and no bulk or schema migration is performed.

**Verification:** regressions cover key permutations across all eight playable
variants, unchanged established keys, different actual givens/rule values/line
orders, old rating evidence, replay prevention after deleting a puzzle, and
reading/updating a legacy technique-history record without duplication.
Component duplicate selection is source-reviewed; the root browser replay is a
separate check.

## Automated checks

**72 tests passed, 0 failed.** The captured result is
[data-offline-tests.log](data-offline-tests.log).

```sh
node --experimental-strip-types --test tests/puzzle-import.test.ts tests/puzzle-identity.test.ts tests/storage.test.ts tests/offline.test.ts tests/technique-history-storage.test.ts tests/collection-downloads.test.ts tests/game.test.ts
npm run check
git diff --check
```

The focused suite includes 498 Classic export/import round-trips over 83 sparse,
dense, empty, and deterministic generated grids; 500 deterministic malformed
strings; and 180 placement/candidate/undo/redo operations with 20 intermediate
store reloads and a final reset/reload comparison. These are parser/store tests,
not 498 browser imports or 180 browser clicks.

### Import and share format matrix

| Format | Behavioral checks |
| --- | --- |
| Internal Classic puzzle link | Full URL and fragment-only URL; original givens preserved; extra/missing cells rejected |
| 81-character givens | Zeros/dots; empty/sparse/dense grids; 80/82 cells and oversized input rejected |
| 9-line text grid | Export round-trip; fenced text, separators, and comments; invalid grids rejected |
| HoDoKu library line | Round-trip; player placements prefixed with `+` excluded from givens; malformed field counts rejected |
| Sudoku Exchange | Long givens and compact digit-run links; malformed compact codes rejected |
| Sudoku Coach | Ordinary givens links, compressed version-7/base-32 codes, and supplied real Killer/Jigsaw fixtures; current-state player progress excluded |
| f-puzzles | Raw JSON, raw LZ-String Base64, `?load=` URL; diagonal direction, Killer sums/cells, and irregular region membership preserved |
| SudokuPad | Raw `scf`, `fpuz`, and `fpuzzles` codes; all three URL payloads on `sudokupad.app`, `beta.sudokupad.app`, `sudokupad.svencodes.com`, and `app.crackingthecryptic.com` |
| Internal variant link | All eight: Killer, Windoku, Diagonal, Jigsaw, Anti-Knight, Thermometer, Arrow, and Kropki; full URLs and fragments; field-order identity regression |
| Unsupported/damaged variants | Unsupported Coach version/rule/settings, short links, SudokuPad `scl`/`ctc`, custom f-puzzles rules, mixed unsupported rules, invalid regions, duplicate cells, invalid cage sums, wrong dimensions, and compressed payloads exceeding the decoded-size limit rejected |

Parser tests validate decoding and the supported rule shape. They do not assert
that every arbitrary decoded grid is uniquely solvable; the actual import flow
delegates uniqueness/conflict analysis to the engine before committing a new
puzzle.

### Persistence and restore/reset matrix

| Area | Behavioral checks |
| --- | --- |
| Reload fidelity | Positions, center/corner candidates, cell/candidate colors, past/future positions, action history, elapsed time, saved state, and active puzzle selection |
| Undo/redo versus reset | Undo and redo survive reload; reset clears position/history/time while preserving saved-puzzle metadata |
| Legacy prefix migration | `gridroom:v1:` records migrate; an existing newer `sudoku-app:v1:` record wins; session selection is retained; historical `unfair` difficulty survives |
| Corrupt-record isolation | Broken JSON, null records, and invalid positions cannot hide a separate valid puzzle; invalid optional metadata is discarded without discarding valid progress |
| Failed writes | Initialization write failure retains readable games; earlier downloaded grids survive quota failures; an unsaved new batch is never advertised as available offline |
| Rating evidence | Interrupted outcome persistence recovers from the saved attempt; resets/replays/deletion retain prior evidence; historical rating records remain unchanged; canonical variant replay identity respects old evidence |
| Imported puzzles saved for later | Saving another puzzle leaves the current puzzle selected, survives reload, and becomes active only when explicitly selected |
| IndexedDB technique history | Real module executed through Vite SSR with a deterministic asynchronous IndexedDB-shaped store; old reordered key is found and updated in place, unrelated records unchanged, normal direct lookup uses no cursor scan |

### Offline worker and downloads

The worker tests execute the actual `scripts/worker.js` in a Node VM with browser
API-shaped cache/event stubs. The manifest test executes the actual
`build-offline.mjs` against an isolated temporary build fixture. It uses a small
WASM file fixture to test manifest inclusion, not to run the Sudoku engine.

- Installation caches all shell assets with `cache: 'reload'` and does not call
  `skipWaiting` automatically. Only the explicit `SKIP_WAITING` message activates
  that path.
- Root and deep-route offline navigations use their cached `index.html`, including
  trailing slashes and query strings. Hashed JS/WASM assets are served from the
  current revision.
- Missing whitelisted assets fall back to the original request. External URLs,
  POST requests, optional collection grids, and unknown routes are not intercepted.
- Activation deletes only obsolete Sudoku/Gridroom shell caches, retains the
  current revision and unrelated caches, and claims clients.
- Interrupted installation does not delete the previous revision or claim/skip
  waiting. Rebuilding identical assets keeps the same revision; shell changes
  change it; optional collection-grid changes do not.
- Collection downloads cover zero defaults, exact batches, the complete
  collection, no duplicate requests, offline reload, invalid hashes, interruption,
  abort/retry, quota failure/retry, and overlapping-batch rejection.
- Existing offline source checks still cover explicit update gating and local
  development cleanup. Those two source-text checks are separate from the new
  worker behavioral tests.

## Source review and remaining browser/device checks

`ImportPuzzle` checks the engine result before adding a new puzzle, reselects a
matching existing non-draft puzzle, and checks cancellation before a link import
commits. The component keeps file-size, preview, and duplicate feedback paths.
`SharePuzzle` exports starting givens/rules rather than placed digits and attempts
clipboard copy with a text-selection fallback. `OfflineUpdates` offers waiting
workers explicitly and reloads after an established controller changes.

These statements are source review, not a claim that every component path was
clicked. Remaining device/API boundaries include real clipboard permission
denial, OS file selection, native IndexedDB transaction/quota failures, browser
storage eviction/private mode, installed-PWA lifecycle, multiple live tabs across
deploys, real network disconnection during a worker update, and real service-worker
controller transitions. The VM and fake-storage tests cannot establish those
browser behaviors. No traffic/concurrency load test against the production site
was performed by this audit.
