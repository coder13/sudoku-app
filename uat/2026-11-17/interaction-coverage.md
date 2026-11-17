# Interaction coverage — November 17, 2026

This inventory covers settings, controls, keyboard shortcuts, lessons, trainers,
chain editing, and colors in source commit `07eae53` plus the local UAT fixes.
It is a source and automated-test audit. It does **not** claim every row below was
clicked in a browser. The root agent owns browser replays; their authoritative
results are in `browser-cases.json`, `full-coverage.md`, and `issues.md`.

## Confirmed issues and source fixes in this audit

| Finding | Evidence | Fix | Verification boundary |
| --- | --- | --- | --- |
| Shortcut capture feedback was invisible to sighted users | Conflict, invalid-key, cancel, and save messages were only in an `sr-only` paragraph | Reuse the visible status note for all capture feedback | Root replayed conflict, invalid input, cancellation and all 12 remap/reset bindings locally; no full assistive-technology audit |
| New chain looked actionable on an empty sketch but did nothing | `useChainSketch.addSketch` returns immediately when the active sketch has no edges | Disable New chain in that state | Source guard reviewed; root browser replay pending |
| Hidden Settings copies uncheck visible radio choices | Root confirmed both visible Candidate layout radios unchecked while hidden mobile Grid was checked | Give candidate layout, candidate highlight style and workspace mode per-instance radio-group IDs | Three SSR regression cases passed; root browser recheck pending |
| Chain candidates lacked keyboard access | All endpoint buttons had `tabIndex=-1`; keyboard clicks with `detail=0` were ignored; candidate navigation only applied to coloring | Share roving tab stops, focus tracking and arrow/Home/End navigation with chain candidates; accept native keyboard activation | SSR tab-stop and handler activation cases passed; real-browser keyboard drawing pending |

The earlier five UAT findings are tracked in `issues.md`. This file does not
replace their status or the root browser record.

## Automated checks run by this audit

- Focused existing suite: **152 passed, 0 failed** across 13 files listed below.
- New component regressions: **6 passed, 0 failed** in `tests/interaction-components.test.ts`.
- `npm run check`: passed after the component changes.
- No shared-browser actions, deployment, or commits were performed by this audit agent.

The new tests render the actual components with React server rendering through
Vite (network listeners and HMR disabled). They check chain tab order and keyboard
activation handlers, coloring keyboard activation, directional/Home/End navigation handlers with lightweight focus targets, and independent radio-group
names in two concurrent Settings copies. They do not simulate browser layout,
focus movement, native radio behavior, pointer hit testing, or a screen reader.

```sh
node --experimental-strip-types --test tests/shortcuts.test.ts tests/preferences.test.ts tests/themes.test.ts tests/selection.test.ts tests/selection-preferences.test.ts tests/play-preferences.test.ts tests/chains.test.ts tests/lesson-workbench.test.ts tests/lesson-curriculum.test.ts tests/foundation-visuals.test.ts tests/lesson-diagram.test.ts tests/highlighting.test.ts tests/hints.test.ts
node --experimental-strip-types --test tests/interaction-components.test.ts
```

| Suite | Exact scope covered | UI behavior still requiring browser checks |
| --- | --- | --- |
| Shortcuts | Unique defaults, partial/legacy preferences, invalid/conflicting keys, customized matching, Shift-digit detection, Ctrl/Command zoom guards | Capture focus, visible feedback, reset swapping, system/browser key conflicts |
| Preferences | Puzzle text percentages, defaults, bounds and step endpoints | Every setting, max/min disabled buttons, live updates and return navigation |
| Themes | All 14 themes in both modes: palette completeness, specified token contrast, distinct interface layers; Andoku rules | Actual rendered text, candidate overlap, links, focus rings, hover/disabled states and native controls |
| Selection | Rectangle selection and cells crossed between pointer samples | Mouse/touch drags, pointer cancellation, modifier selection and hit targets |
| Selection preferences | Per-puzzle selection/anchor persistence, malformed values, blocked storage | Real reload, multiple tabs, navigation and focus restoration |
| Play preferences | Mode exclusivity, saved digit/color/eraser state, open panels, badge positions, dimensions, malformed data, failed writes and cross-tab merges | Controls remaining usable after live setting changes, resizing, touch reordering and panel switching |
| Chains | Live candidate edges, X/XY chains, loop completion, discontinuities, branches, Medusa proofs and conflicts | Endpoint selection, hover, keyboard drawing, sketch controls, overlay alignment and Apply edits |
| Lesson workbench | Starting digits immutable; candidate move tracking, undo/redo and color exclusion; reveal action | Tool interaction, selection, feedback, proof stages, reset and keyboard behavior |
| Curriculum | Prerequisite order, route aliases, all concept questions/table validation, foundation route safety | Every article route, references, select controls, example generation and scroll restoration |
| Foundation visuals | Every visual/crop/endpoint checked; direct link truth; case splits, fish, coloring, chains, ALS, layouts and RCC logic | Every step control, annotation visibility, captions, mobile fit and keyboard focus |
| Lesson diagrams | Teaching wording rule and selected AIC/grouped/wing/ALS diagram explanations | Full visual and pedagogical review of every worked example |
| Highlighting | Selected/given/digit-driven matching; function keys and given-only selections | Every visual style under each mode/theme |
| Hints | Index wrap/bounds, reveal stages, recovery stages, coordinates, terminology and removals | Every available engine technique and responsive hint rendering |

## Complete theme and color-mode inventory

Every listed theme has Light and Dark palettes. System, Light and Dark are the
three topbar color-mode states. Token checks cover both palettes of every theme;
that is not equivalent to a rendered browser check for each combination.

| Theme ID | Visible name | Palette token checks | Browser matrix |
| --- | --- | --- | --- |
| `violet` | Violet | Light and Dark passed | Refer to root browser record |
| `ocean` | Ocean | Light and Dark passed | Refer to root browser record |
| `forest` | Forest | Light and Dark passed | Refer to root browser record |
| `rose-pine` | Rosé Pine | Light and Dark passed | Refer to root browser record |
| `catppuccin` | Catppuccin | Light and Dark passed | Refer to root browser record |
| `solarized` | Solarized | Light and Dark passed | Refer to root browser record |
| `nord` | Nord | Light and Dark passed | Refer to root browser record |
| `ayu` | Ayu | Light and Dark passed | Refer to root browser record |
| `github` | GitHub | Light and Dark passed | Refer to root browser record |
| `one` | One | Light and Dark passed | Refer to root browser record |
| `tokyo-night` | Tokyo Night | Light and Dark passed | Refer to root browser record |
| `gruvbox` | Gruvbox | Light and Dark passed | Refer to root browser record |
| `high-contrast` | High contrast | Light and Dark passed | Refer to root browser record |
| `andoku` | Andoku | Light and Dark passed | Refer to root browser record |

## Every Settings control

For each row, browser verification should check all options/endpoints, the
visible selected/disabled state, saving and returning to the originating page,
reload persistence, and mobile/desktop transitions. Defaults are source defaults;
the testing browser may already have saved preferences.

| Section | Control | Options/range | Default | Specific case |
| --- | --- | --- | --- | --- |
| Topbar/menu | Color mode | System → Light → Dark → System | System | System appearance changes; retain independently selected palettes |
| Look & feel | Workspace | Standard / Advanced | Standard | Mobile always uses standard; desktop preference returns after resize |
| Look & feel | Light theme | All 14 themes above | Violet | Dark palette preference remains independent |
| Look & feel | Dark theme | All 14 themes above | GitHub | Andoku intentionally uses its same distinctive grid in both modes |
| Look & feel | App text size | 75–125%, steps of 5 | 100% | Min/max disabled; keyboard reset; all dialogs and grids remain usable |
| Look & feel | Row and column numbers | On / Off | Off | Hidden labels do not leave accidental gaps; crops retain real coordinates |
| Look & feel | Puzzle text size | 50–100%, steps of 5 | 75% | Largest candidates and digits fit all cell states |
| Look & feel | Digit size | 162–234px input size, steps of 12 | 210px | Endpoint buttons disabled; keypad and compact panels remain within viewport |
| Look & feel | Advanced panel layout | Reset button, Advanced only | Default named panels | Restores named positions/sizes without resetting unrelated settings |
| Input controls | Candidate layout | Grid / Center and corner | Grid | Visible radio selection; switch with existing candidates |
| Input controls | Color mode | Enabled / Disabled | Disabled | Enabling reveals tools; disabling while coloring exits safely |
| Input controls | Multi-select button | On / Off | Off | Compact/mobile always show selection tool; desktop preference respected |
| Input controls | Double-click naked singles | On / Off | On | Single click must not place; double click places only displayed naked single |
| Highlighting | Related cells | On / Off | On | Classic versus variant peer rules |
| Highlighting | Matching digits | On / Off | On | Given, placed digit, and digit-pad selection |
| Highlighting | Matching candidates | On / Off | On | Disables style controls without losing saved style |
| Highlighting | Candidate highlight style | Candidate color / Candidate spot / Cell tint / Cell outline | Cell tint | Actual selected radio visible; each style in light/dark and colored cells |
| Solving style | Show timer | On / Off | On | Hiding timer does not stop tracked time |
| Solving style | Show pause button | On / Off | On | Pause/resume keyboard/focus and cover grid; no pause control before start |
| Solving style | Track solve time | On / Off | On | Current solve becomes untimed when disabled; re-enabling must not invent missing elapsed time |
| Solving style | Automatically generate candidates | On / Off | Off | Once per puzzle and again after reset; no extra undo loop |
| Solving style | Error display | All errors / Incorrect digits / No errors | All errors | Draft shows placeholder; independent from Check puzzle |
| Hints | Cell references | Automatic / Concise / Verbose | Automatic | Automatic uses concise references from Tricky upward; each reveal stage/removal group |

## Input modes and pointer gestures

| Mode/feature | Inventory | Browser checks |
| --- | --- | --- |
| Pen | Cell-first and digit-first entry; matching digit toggles in digit-first mode | Click blank/given/placed digit, keyboard/keypad, rapid input, undo/redo |
| Pencil | Fixed 3×3 slots; Center; Corner; Ctrl/Command + digit override | Add/remove existing/missing candidates; single and multi-selection; drag add/remove; undo one stroke |
| Temporary Pencil | Hold Ctrl/Command while in Pen, release or blur to exit | Desktop mouse and keyboard; modifier release outside page; trainer parity is not yet verified |
| Highlight | Persistent selected digit, cell selection, edits selected cells | One/many cells; click given; drag rectangle; mode switch |
| Color: cells | Rose, Peach, Yellow, Mint, Blue, Lavender; erase; clear; Done | Selected-cells-first and brush-first; givens; undo/redo; disable colors while active |
| Color: candidates | Same six colors; per-candidate painting; erase; clear; Done | Tab/arrow/Home/End, Enter/Space, Center/Corner and Grid, disappearing candidates |
| Erase | Erase selected cells or click-to-erase | Given safety; candidate versus placed digit; enter another digit exits erase |
| Multi-select | Toggle; Ctrl/Command additive clicks; Shift-click rectangle; Shift-arrows | Empty/given/mixed selections; disabling; change puzzles and reload |
| Candidate pairs | Actions → Highlight {x,y} cells | Toggle, preserve edit mode and candidate highlights |
| Double-click singles | Optional displayed naked-single placement | Suppress accidental second placement, undo and preference off |
| Mode badge | Cycle input mode; drag badge to top/right/bottom/left with offset | Pointer threshold, tap versus drag, persistence, tiny layouts |
| Panels | Standard outer width and input/puzzle split; Advanced dock tabs/sashes and collapse controls | Keyboard/mouse resizing, restore, narrow viewport, header access and active focus |
| Mobile cards | Long hold, reorder, Done; puzzle/hint/input/completion | Scroll while dragging, cancellation, restore order, no accidental grid edits |

## Every editable shortcut

Each binding accepts an unmodified letter or `?`, rejects Ctrl/Command/Alt,
rejects conflicting bindings, saves immediately, supports per-command Reset and
Reset all. When Reset needs a key owned by another command, the store swaps
bindings. Root has replayed remapping every command to X then resetting it.

| Action | Default | Availability/guard to verify |
| --- | --- | --- |
| Digit placement | D | Clears Pencil/Highlight/Color/Erase |
| Pencil | P | Active mode returns to Pen |
| Highlight | H | Persistent highlighted digit and selection; chain drawing clears its digit highlight |
| Color | C | Only when colors enabled |
| Erase | E | Clears incompatible modes and selection |
| Draw links | L | Desktop; starts/stops drawing; unavailable positions handled |
| New chain | B | Chains open and graph ready; empty active sketch is a no-op |
| Open Actions | A | Standard desktop/mobile; no blocked puzzle/modal |
| Generate all candidates | G | Unsolved, idle puzzle; conflict result |
| Solve all singles | S | Unsolved, idle, eligible candidates; no-singles feedback |
| Next puzzle | N | Completed puzzle only |
| Keyboard shortcuts | ? | Global unless typing/capturing another key |

## Fixed keyboard commands

| Command | Keys | Cases to verify |
| --- | --- | --- |
| Digit/current-mode input | 1–9 | Cell selection, digit-first, numpad, held key, IME/composition |
| Temporary Pencil | Hold Ctrl/Command | Release, blur, switching modes |
| Toggle candidate | Ctrl/Command + 1–9 | Focused cell without selection, selected group, repeat guard |
| Highlight digit | Shift + 1–9; F1–F9 | Digit-row code, no numpad-Shift shortcut, browser/system conflicts |
| Erase | 0 / Delete / Backspace | Selected cells, armed digit, color erase, chain highlight clear |
| Cell movement | Arrow keys | All edges, no row wrap, grid focus |
| Extend rectangle | Shift + arrows | Anchor, backwards rectangle, mixed givens |
| Undo | Ctrl/Command + Z | Grid change versus chain link; disabled boundary |
| Redo | Ctrl/Command + Shift + Z; Ctrl/Command + Y | Grid history only; history after new edits |
| End path / stop chain | Escape | Pending endpoint versus no pending endpoint |
| Close/cancel | Escape | Menus/dialogs, coloring, shortcut capture, focus return |
| App zoom | Ctrl/Command + Plus/Equals, Minus, 0 | 75/125% clamp; puzzle digit input unaffected |
| Candidate navigation | Arrows, Home, End; Enter/Space | Colors and chain endpoints; one roving tab stop |

Held P/H/C/E currently have no repeat guard in either Worktable or trainer source;
root was asked to verify whether repeated mode toggling needs a follow-up fix.
This is a source hypothesis, not a claimed reproduced UI defect.

## Every chain editor command

- Draw links / Done drawing (L); select/deselect endpoint; hover preview.
- Strong/weak alternating paths; reject nonexistent links, second alternation
  breaks and invalid targets; remove an existing edge by selecting it again.
- Type: Alternating (XY, AIC) / 3D Medusa. Type is disabled after links exist.
- Chain color: Blue, Orange, Purple, Teal, Pink, Green. Medusa has separate A/B
  selectors; choosing the other side's color swaps them to keep sides distinct.
- New chain (B): switch to an existing empty sketch or add a sketch after links.
- Select Chain N; Show/Hide chain; Delete chain (last empty sketch disabled).
- End path (Escape); Undo edit (Ctrl/Command+Z); Clear links (undoable).
- Complete loop: single-path button or per-component action; disabled when no
  completion exists; avoid candidates used by other sketches.
- Apply edits: alternating or Medusa proof results; grid undo; stale proof after
  candidate/position changes; unavailable while drafting or displaying a solution.
- Highlight digit: None or 1–9, digit keys while drawing, H clears highlight.
- Inspection mode: technique heading, results, link list, explanatory text.

## Lesson inventory and checks

Source inventory: **107 articles**, **19 concept-check blocks with 51 questions**,
**24 foundation visual blocks**, **106 authored diagram blocks**, **88 trainer
blocks with 112 drill choices**. Each article and drill is listed below.

For every article, verify heading/breadcrumb/level, prerequisites and alternate
names, all internal/external links, adjacent-article navigation and scroll. For
all text/list/table blocks, inspect mobile wrapping and horizontal table scroll.
For every concept question, choose wrong and correct answers and cycle New example.
For every foundation visual, traverse Previous/Next to both boundaries and inspect
all diagram annotations and proof branches. For each trainer drill, load an authored
example and Next example, previous boundary, generated example, and failure feedback;
make wrong/correct placement/removal, Check move, Reset, undo/redo, reveal all stages,
Hide steps, Apply one move and New example. These click-through steps are pending
unless the root browser record explicitly marks them passed.

| Article route | Kind | Concept questions | Foundation visuals | Diagram blocks | Trainer drills |
| --- | --- | --- | --- | --- | --- |
| `/learn/fundamentals` | fundamentals | — | diagram-key | 1 | `naked-single` |
| `/learn/cells-that-see` | foundation | 2 | seeing-cells | — | — |
| `/learn/full-house` | technique | — | — | 1 | `full-house` |
| `/learn/hidden-single-box` | technique | — | — | 1 | `hidden-single-box` |
| `/learn/hidden-single` | technique | — | — | 1 | `hidden-single` |
| `/learn/naked-single` | technique | — | — | 1 | `naked-single` |
| `/learn/candidate-logic` | foundation | 3 | candidate-elimination | — | — |
| `/learn/locked-candidates` | technique | — | — | 2 | `pointing`, `claiming` |
| `/learn/counting-cells-and-digits` | foundation | 3 | subset-count | — | — |
| `/learn/naked-subsets` | technique | — | — | 2 | `naked-pair`, `naked-triple`, `naked-quadruple`, `locked-pair`, `locked-triple` |
| `/learn/hidden-subsets` | technique | — | — | 2 | `hidden-pair`, `hidden-triple`, `hidden-quadruple` |
| `/learn/strong-weak-links` | foundation | 3 | weak-link, strong-link, cell-link | — | — |
| `/learn/fish-basics` | foundation | 2 | fish-count | — | — |
| `/learn/x-wing` | technique | — | — | 3 | `x-wing`, `finned-x-wing`, `sashimi-x-wing` |
| `/learn/skyscraper` | technique | — | — | 1 | `skyscraper` |
| `/learn/two-string-kite` | technique | — | — | 1 | `two-string-kite` |
| `/learn/empty-rectangle` | technique | — | — | 1 | `empty-rectangle` |
| `/learn/swordfish` | technique | — | — | 3 | `swordfish`, `finned-swordfish`, `sashimi-swordfish` |
| `/learn/bivalue-case-splits` | foundation | 3 | wing-cases | — | — |
| `/learn/xy-wing` | technique | — | — | 1 | `xy-wing` |
| `/learn/xyz-wing` | technique | — | — | 1 | `xyz-wing` |
| `/learn/w-wing` | technique | — | — | 1 | `w-wing` |
| `/learn/jellyfish` | technique | — | — | 3 | `jellyfish`, `finned-jellyfish`, `sashimi-jellyfish` |
| `/learn/uniqueness-assumption` | foundation | 3 | uniqueness-swap | — | — |
| `/learn/unique-rectangle` | technique | — | — | 7 | `unique-rectangle-1`, `unique-rectangle-2`, `unique-rectangle-3`, `unique-rectangle-4`, `unique-rectangle-5`, `unique-rectangle-6`, `hidden-rectangle` |
| `/learn/bug-plus-one` | technique | — | — | 1 | `bug-plus-one` |
| `/learn/chain-basics` | foundation | 3 | chain-walk | — | — |
| `/learn/coloring-basics` | foundation | 3 | coloring-states | — | — |
| `/learn/simple-coloring` | technique | — | — | 1 | `simple-coloring` |
| `/learn/x-chain` | technique | — | — | 1 | `x-chain` |
| `/learn/xy-chain` | technique | — | — | 1 | `xy-chain` |
| `/learn/3d-medusa` | technique | — | — | 1 | `3d-medusa` |
| `/learn/almost-locked-set-basics` | foundation | 3 | als-count | — | — |
| `/learn/wxyz-wing` | technique | — | — | 1 | `wxyz-wing` |
| `/learn/unique-loop` | technique | — | — | 1 | `unique-loop` |
| `/learn/chain-notation` | foundation | 3 | cell-link, chain-walk | — | — |
| `/learn/aic` | technique | — | — | 1 | `aic` |
| `/learn/closed-chains` | foundation | 2 | loop-matching-links, loop-alternating-links | — | — |
| `/learn/nice-loops` | technique | — | — | 2 | `discontinuous-nice-loop`, `continuous-nice-loop` |
| `/learn/grouped-candidates` | foundation | 3 | grouped-link | — | — |
| `/learn/grouped-aic` | technique | — | — | 1 | `grouped-aic` |
| `/learn/grouped-nice-loops` | technique | — | — | 2 | `grouped-discontinuous-nice-loop`, `grouped-continuous-nice-loop` |
| `/learn/restricted-common-candidates` | foundation | 3 | rcc-link | — | — |
| `/learn/als-links` | foundation | 2 | als-link | — | — |
| `/learn/almost-locked-sets` | technique | — | — | 1 | `als-xz`, `als-xy-wing`, `als-chain` |
| `/learn/death-blossom` | technique | — | — | 1 | `death-blossom` |
| `/learn/sue-de-coq` | technique | — | — | 1 | `sue-de-coq` |
| `/learn/als-aic` | technique | — | — | 1 | `als-aic` |
| `/learn/als-discontinuous-nice-loop` | technique | — | — | 1 | `als-discontinuous-nice-loop` |
| `/learn/als-continuous-nice-loop` | technique | — | — | 1 | `als-continuous-nice-loop` |
| `/learn/unique-rectangle-aic` | technique | — | — | 1 | `unique-rectangle-aic` |
| `/learn/unique-rectangle-discontinuous-nice-loop` | technique | — | — | 1 | `unique-rectangle-discontinuous-nice-loop` |
| `/learn/unique-rectangle-continuous-nice-loop` | technique | — | — | 1 | `unique-rectangle-continuous-nice-loop` |
| `/learn/fireworks` | technique | — | — | 1 | `fireworks` |
| `/learn/firework-w-wing` | technique | — | — | 1 | `firework-w-wing` |
| `/learn/firework-l-wing` | technique | — | — | 1 | `firework-l-wing` |
| `/learn/firework-als-wing` | technique | — | — | 1 | `firework-als-wing` |
| `/learn/firework-aic` | technique | — | — | 1 | `firework-aic` |
| `/learn/aligned-pair-exclusion` | technique | — | — | 1 | `aligned-pair-exclusion` |
| `/learn/forcing-proof-basics` | foundation | 3 | contradiction | — | — |
| `/learn/forcing-chain` | technique | — | — | 2 | `forcing-chain`, `forcing-net` |
| `/learn/tridagon-forcing-net` | technique | — | — | 1 | `tridagon-forcing-net` |
| `/learn/dynamic-forcing-net` | technique | — | — | 1 | `dynamic-forcing-net` |
| `/learn/advanced-forcing-net` | technique | — | — | 1 | `advanced-forcing-net` |
| `/learn/aligned-triplet-exclusion` | technique | — | — | 1 | `aligned-triplet-exclusion` |
| `/learn/tridagon` | technique | — | — | 1 | `tridagon` |
| `/learn/tridagon-aic` | technique | — | — | 1 | `tridagon-aic` |
| `/learn/house-digit-slots` | foundation | 2 | placement-capacity | — | — |
| `/learn/sk-loop` | technique | — | — | 1 | `sk-loop` |
| `/learn/multi-sector-locked-sets` | technique | — | — | 1 | `multi-sector-locked-sets` |
| `/learn/exocet` | technique | — | — | 1 | `exocet` |
| `/learn/senior-exocet` | technique | — | — | 1 | `senior-exocet` |
| `/learn/double-exocet` | technique | — | — | 1 | `double-exocet` |
| `/learn/franken-fish` | technique | — | — | 1 | `franken-fish` |
| `/learn/mutant-fish` | technique | — | — | 1 | `mutant-fish` |
| `/learn/kraken-fish-1` | technique | — | — | 1 | `kraken-fish-1` |
| `/learn/kraken-fish-2` | technique | — | — | 1 | `kraken-fish-2` |
| `/learn/nested-proofs-and-search` | foundation | 3 | nested-branches | — | — |
| `/learn/nested-forcing-net` | technique | — | — | 1 | `nested-forcing-net` |
| `/learn/digit-layouts` | foundation | 2 | complete-digit-layouts | — | — |
| `/learn/pattern-overlay` | technique | — | — | 1 | `pattern-overlay` |
| `/learn/pairwise-pattern-overlay` | technique | — | — | 1 | `pairwise-pattern-overlay` |
| `/learn/triple-pattern-overlay` | technique | — | — | 1 | `triple-pattern-overlay` |
| `/learn/quadruple-pattern-overlay` | technique | — | — | 1 | `quadruple-pattern-overlay` |
| `/learn/quintuple-pattern-overlay` | technique | — | — | 1 | `quintuple-pattern-overlay` |
| `/learn/diagonal-locked-candidates` | technique | — | — | 1 | `locked-candidates` |
| `/learn/cage-combinations` | technique | — | — | 1 | `cage-combinations` |
| `/learn/cage-house-sum` | technique | — | — | 1 | `cage-house-sum` |
| `/learn/anti-knight` | technique | — | — | 1 | `anti-knight` |
| `/learn/anti-king` | technique | — | — | 1 | `anti-king` |
| `/learn/thermometer` | technique | — | — | 1 | `thermometer` |
| `/learn/arrow` | technique | — | — | 1 | `arrow` |
| `/learn/kropki` | technique | — | — | 1 | `kropki` |
| `/learn/parity` | technique | — | — | 1 | `parity` |
| `/learn/non-consecutive` | technique | — | — | 1 | `non-consecutive` |
| `/learn/inequality` | technique | — | — | 1 | `inequality` |
| `/learn/clone` | technique | — | — | 1 | `clone` |
| `/learn/xv` | technique | — | — | 1 | `xv` |
| `/learn/palindrome` | technique | — | — | 1 | `palindrome` |
| `/learn/between` | technique | — | — | 1 | `between` |
| `/learn/whispers` | technique | — | — | 1 | `whispers` |
| `/learn/renban` | technique | — | — | 1 | `renban` |
| `/learn/region-sum` | technique | — | — | 1 | `region-sum` |
| `/learn/little-killer` | technique | — | — | 1 | `little-killer` |
| `/learn/skyscrapers` | technique | — | — | 1 | `skyscrapers` |
| `/learn/sandwich` | technique | — | — | 1 | `sandwich` |
| `/learn/x-sum` | technique | — | — | 1 | `x-sum` |

## Every foundation visual

All step data and listed marks have automated structural/logic coverage in
`foundation-visuals.test.ts`. Individual step-control/browser rendering remains
separate coverage.

| Visual ID | Title | Steps | Display |
| --- | --- | --- | --- |
| `diagram-key` | The markings you will see | 3 | Cropped grid |
| `candidate-elimination` | From candidates to a placement | 3 | Cropped grid |
| `weak-link` | Dashed line: at most one is true | 3 | Cropped grid |
| `strong-link` | Solid line: at least one is true | 3 | Cropped grid |
| `wing-cases` | Two cases, one removal | 4 | Cropped grid |
| `uniqueness-swap` | A swap that preserves every house | 2 | Cropped grid |
| `chain-walk` | Read a chain one link at a time | 6 | Cropped grid |
| `cell-link` | A link can stay inside one cell | 3 | Cropped grid |
| `als-count` | Two cells, three distinct digits | 4 | Cropped grid |
| `grouped-link` | Several candidates, one endpoint | 3 | Cropped grid |
| `rcc-link` | A weak link between two sets | 4 | Cropped grid |
| `contradiction` | A branch must fail for a specific reason | 5 | Cropped grid |
| `nested-branches` | A conclusion stays inside its branch | 2 | Proof branches |
| `seeing-cells` | Trace the three houses of R2C2 | 4 | Cropped grid |
| `subset-count` | Three cells need three digits | 3 | Cropped grid |
| `fish-count` | Three rows share three columns | 3 | Cropped grid |
| `coloring-states` | Two colors, two possible states | 5 | Cropped grid |
| `loop-matching-links` | Return through the same type of link | 5 | Cropped grid |
| `loop-alternating-links` | Read around the other side of a weak link | 3 | Cropped grid |
| `als-link` | A strong link between two digit groups | 4 | Cropped grid |
| `placement-capacity` | Four cells need four slots | 3 | Cropped grid |
| `complete-digit-layouts` | Every layout needs the last column | 5 | Cropped grid |

## Remaining browser and device gaps

- No physical iOS/Android test, actual pinch zoom, mobile virtual keyboard,
  operating-system reduced motion/forced colors, or screen reader was run here.
- No new network interruption, storage-permission interruption or multi-tab
  browser scenario was run by this audit agent. Other agents own those matrices.
- The all-theme token tests are not screenshot comparisons; the lesson content
  tests are not complete visual review of 107 articles or live generation of all
  112 trainer drill choices.
- Trainer source reads preferences on mount/storage events, and its interaction
  code differs from live play. Temporary Ctrl/Command Pencil mode, held-key
  repetition and cross-tab disabling of active coloring deserve direct parity
  checks. No trainer parity issue is marked browser-confirmed in this document.
