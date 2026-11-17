# UAT coverage and revised browser smoke test

The initial expansion was to test every part of the app. The user then narrowed
acceptance to practical Firefox and Chrome testing: “Actually don't try too hard.
Just test on firefox and chrome. I'm the only user of the app so far so you don't
need to do extensive testing.” The larger inventory below is retained as a record;
its deferred cases are not requirements for the revised smoke test.

The [issue log](issues.md) records confirmed findings and fixes.

## Current requested smoke-test scope

| Browser | Loading/generation | Digit entry | Pencil mode | Undo/Redo | Navigation/settings | Hints | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome (native Mac app) | Pass | Pass, with error feedback | Pass | Pass | Learn → Settings → Learn passed | Technique and digit reveal passed | Pass |
| Firefox (native Mac app) | Pass | Pass, with error feedback | Pass | Pass | Learn → Settings → Learn passed | Technique and digit reveal passed | Pass |

Both browsers passed against the fixed production preview at http://127.0.0.1:8769/.
Firefox first loaded the original snapshot at http://127.0.0.1:8768/; interrupted
attempts were not counted. A separate Firefox window then completed the core
checks without interruption. Browser case records are in `browser-cases.json`.

The native-browser results are recorded in [browser cases](browser-cases.json).
No deployment was performed.


Inventory status key: **Deferred by scope change**, **Pass**, **Partial**, **Automated only**, **Out of scope**.
A source review does not count as a browser pass. Physical-device behavior and
every possible combination of settings require separate evidence; gaps remain
explicit rather than being treated as passed.

## Test environments

- Deployed baseline: https://coder13-sudoku.netlify.app/.
- Local fix branch: `codex/uat-fixes`, http://127.0.0.1:8767/.
- In-app browser with measured desktop, tablet, phone portrait, and phone
  landscape CSS viewports.
- Native Chrome and Firefox are installed; both native browser smoke tests passed.
- No physical phone is connected through the available tools.

## Browser feature matrix

| ID | Feature and required cases | Status | Evidence / issues |
| --- | --- | --- | --- |
| B01 | Cell-first and digit-first placement; given protection; repeated digit toggle | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B02 | Grid keyboard arrows, rectangular selection, Ctrl/Command selection, mobile multi-select | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B03 | Pencil grid candidates; center/corner candidates; temporary Pencil modifier | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B04 | Candidate generation, automatic candidate initialization, peer cleanup | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B05 | Erase placed digits/candidates/colors; Undo/Redo by button and keyboard | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B06 | Highlight mode, digit shortcuts, completed digit styling, bivalue highlighting | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B07 | Cell colors, candidate colors, brush/eraser, persistence, undo | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B08 | Chain drawing: alternating, Medusa, paths, undo, clear, hide, color, multiple chains | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B09 | Every editable shortcut: edit, conflict, invalid key, cancel, reset, runtime command | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B10 | Check puzzle: correct partial, conflict, incorrect digit; three error display modes | Deferred by scope change | |
| B11 | Hint stages, previous/next, lesson link, apply/undo, edited-position invalidation | Deferred by scope change | |
| B12 | Technique finder counts, hide zeroes, scanning, selection, modal/breakpoint transition | Deferred by scope change | |
| B13 | Solution path: reveal, step navigation, highlights, return, cancel/error handling | Deferred by scope change | |
| B14 | Classic creation and all ten difficulties plus automatic difficulty choice | Deferred by scope change | UI generation + engine matrix |
| B15 | All variant UIs: Killer, Windoku, Diagonal, Jigsaw, Anti-Knight, Thermometer, Arrow, Kropki | Deferred by scope change | One UI flow per variant + engine matrix |
| B16 | Manual creation: valid/invalid save, name limits, duplicate givens, edit, cancel/discard | Deferred by scope change | |
| B17 | All six Classic share formats, clipboard feedback, variant share link | Deferred by scope change | |
| B18 | Imports: text/code/link/file, preview, edit, save another, duplicate, unsupported/invalid | Deferred by scope change | |
| B19 | Puzzle library: active/past/saved, switches, filters, rename/edit/stop/save/delete | Deferred by scope change | |
| B20 | Both collections: categories, filters, preview, save, play next, credit links | Deferred by scope change | |
| B21 | Downloads: partial/all, count limits, repeat/empty, persistence, offline use | Deferred by scope change | |
| B22 | Timer: first move, pause/resume, hidden page, untimed setting and completion | Deferred by scope change | |
| B23 | Completion: grid/results, history, next puzzle/difficulty/variant/collection | Deferred by scope change | |
| B24 | Statistics: counts, times, rating, techniques, historical difficulty | Deferred by scope change | |
| B25 | Appearance: every light/dark theme, mode cycle, text/grid/key sizing, labels, layouts | Deferred by scope change | |
| B26 | Input/solving/hint/highlighting settings: every control, persistence, reset interactions | Partial | Targeted browser cases in browser-cases.json; other cases deferred |
| B27 | Learn navigation: catalog, articles, breadcrumbs, adjacent links, mobile Articles panel | Deferred by scope change | |
| B28 | Every article: diagrams, example navigation, prerequisite links, trainer availability | Deferred by scope change | |
| B29 | Trainer: correct/incorrect move, candidate/placement exercises, walkthrough, reset/new example | Deferred by scope change | |
| B30 | Foundation concept checks and interactive teaching visuals | Deferred by scope change | |
| B31 | Advanced docking: tabs, visibility toggles, resize, drag/group, persistence, scroll | Deferred by scope change | |
| B32 | Mobile card reorder by hold, drag, keyboard, cancel, persistence and paused state | Deferred by scope change | |
| B33 | Routes: direct load, reload, Back/Forward, query/hash, Settings return, unknown route | Deferred by scope change | |
| B34 | Offline install/cache, reload while offline, updates, Later/Update, reconnect | Deferred by scope change | |
| B35 | Reload/tab synchronization, corrupt/blocked storage recovery, stale asynchronous results | Deferred by scope change | Automated coverage + browser cases |
| B36 | Keyboard accessibility: landmarks/names, tab order, focus traps/restoration, Escape | Deferred by scope change | |
| B37 | Contrast/large text/zoom/reduced motion and touch target/overflow inspection | Deferred by scope change | |
| B38 | Native Chrome smoke/regression coverage | Pass | Native Mac Chrome core flows; B38 records in browser-cases.json |
| B39 | Native Firefox smoke/regression coverage | Pass | Isolated native Mac Firefox window; B39 records in browser-cases.json |
| B40 | Physical iOS/Android touch/virtual keyboard/PWA verification | Out of scope | User selected Mac browsers and emulated sizes, then narrowed to Firefox/Chrome |

## Automated coverage ledgers

- Engine/variant matrix: `engine-coverage.md` (completed automated coverage).
- Import/share/storage/offline: `data-offline-coverage.md` (completed automated coverage).
- Settings/shortcuts/lessons/chains/colors: `interaction-coverage.md` (completed automated/component coverage).

## New findings

New confirmed issues will receive UAT IDs after UAT-05, with reproduction steps,
assigned owner, fix status, and separate local regression evidence.
