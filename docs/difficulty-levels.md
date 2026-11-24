# Difficulty levels

The default for a new player is **Medium**. A saved preference takes precedence.

Difficulty describes the knowledge used to solve a puzzle. A long sequence of easy moves does not earn a harder label. Each mode has one quality bar. There is no workload slider or light version of a mode.

| Level | Name | New skill |
| --- | --- | --- |
| 1 | Beginner | Full House and Hidden Singles in boxes, found by scanning |
| 2 | Easy | Naked Singles and Hidden Singles in rows and columns |
| 3 | Medium | Locked Candidates, pairs, and triples |
| 4 | Tricky | Single-digit patterns: X-Wing, Swordfish, Skyscraper, Two-String Kite, Empty Rectangle |
| 5 | Hard | XY-Wing, XYZ-Wing, W-Wing, plus larger fixed patterns |
| 6 | Very Hard | Simple Coloring, X-Chains, XY-Chains, 3D Medusa |
| 7 | Expert | General AICs and Nice Loops |
| 8 | Master | Grouped chains, almost locked sets, and their combinations |
| 9 | Extreme | Multiple forcing proofs, bounded nets, specialist structures |
| 10 | Impossible | Exceptionally hard puzzles without a promised practical human solution |

Each level includes earlier techniques. A puzzle needs something from its own tier, not every technique in that tier. A Hard puzzle need not require a wing; a wings-only training request is a separate contract.

Impossible puzzles still have exactly one solution. Some can be solved by a skilled human. Others may be practical only with computer help. Pattern Overlay and deeply nested nets belong here. Neither a failed search nor an unsupported technique proves that a puzzle is Impossible.

## Grading and generation

Classic scoring version 15 and variant scoring version 24 (25 for group-order elimination) remove promotion based on total points. Version 15 also experiments with a lower reference cost for Unique Rectangle 1. Candidate-density weighting is being measured separately and is not part of the engine score yet. Point totals remain trace diagnostics and do not choose the level. Re-rating under a newer scoring version may produce a different point total.

The Rust technique catalog is the source of truth. The browser's technique metadata is produced by `scripts/build-wasm.mjs`. The ten selectable names and order live in `src/sudoku/difficulty.ts`.

Normal classic generation uses the canonical profile up to the requested level, in increasing tier order. Personal solver profiles remain available for analysis and technique practice. They do not weaken the normal mode's quality contract.

A difficulty-targeted candidate must:

1. Have exactly one solution.
2. Finish using the requested profile, with a trace whose hardest technique has the requested tier.
3. Resist three profiles containing every supported lower-tier technique: canonical order, reversed order within each tier, and a half-rotation within each tier. Identical profiles are checked once.
4. Pass the same acceptance rules on every generation route, including templates and Auto.
5. Keep enough puzzle left to solve. Reject more than 40 givens. Classic Medium and higher require at least four productive non-single deductions in the trace. Medium also needs at least two technique types and two stretches of eliminations separated by a placement.
6. Avoid structures in the player's saved classic puzzle history. Digit renaming, transposition, and valid row, column, band, and stack permutations count as the same puzzle.

These are internal acceptance floors, not difficulty scores or user settings. Four deductions alone do not guarantee an interesting puzzle. The stricter Medium rule addresses the thin solves found in the 599-per-level audit. Harder modes can still center on one difficult breakthrough supported by simpler deductions. Beginner and Easy intentionally use singles only.

Fresh generation has a bounded search and can fall back to the verified template bank. Tricky and Very Hard first try a seed-selected technique for 32 attempts, then fall back to the normal search. This broadens the technique mix without promising equal frequencies or weakening acceptance. Auto may use the player's technique progress for this focus.

Impossible uses a larger, separately certified bank of distinct canonical structures; see `crates/engine/data/README.md` for provenance and rebuilding. It removes saved structures before searching, preserves each candidate's clue count, and checks every transformed board again. Source ratings never determine the app's grade. The bank is finite, and deleting saved games removes their duplicate protection.

The lower-tier checks explore three greedy orders. They reject all 15 known lower-tier counterexamples from the first audit, but are not an exhaustive proof that no human can find an easier route. Keep this distinction in any user-facing claim about a technique being required. The existing alternate-path API can strengthen certification for a curated bank; an inconclusive search must remain inconclusive.

This changes generation acceptance, not the technique grading scale. Historical ratings keep their recorded scoring version. Audit quality-policy version 2 records the new floors separately.

An attempt limit returns a search-limit result. It must not silently substitute an easier puzzle with the requested label. Impossible currently uses the implemented computer-oriented logical methods; an arbitrary solver timeout is never upgraded into a rating.

Generic score-targeted and technique-only engine APIs remain useful for experiments and small lesson positions. Their point ranges are not difficulty modes.

## Variants

Variant rules need their own technique definitions. Rule deductions retain their assigned skill tiers, and classic deductions use the same catalog as classic puzzles. Variant ratings also stop using point-total promotion. Generation checks the lower profile and the result's reported tier.

The app only offers variant levels backed by checked generation recipes. A classic tier should not be advertised for a variant merely because its name exists in the shared enum. Recheck recipes whenever the catalog, profile order, or scoring version changes. Jigsaw does not inherit classic box assumptions.

## Selecting a level

Desktop shows the difficulties in one vertical list. Mobile uses a decrease arrow, the current name and position, and an increase arrow. The endpoints disable their respective arrows. The control does not wrap. Arrow keys work while a difficulty arrow has focus. Changing a level does not start generation until the player presses Start or Continue.

Each difficulty shows personal results from saved games on this device: puzzles solved and average solve time. Results use the selected variant and the saved difficulty. Unstarted imports, incomplete puzzles, and drafts do not count. Games without a positive recorded time do not enter the average. An empty history shows zero solves and no average. The selector has no difficulty descriptions.

Auto is a separate checkbox, not an eleventh difficulty. It uses the same profiles and acceptance checks. Selecting a row or using an arrow returns to a fixed choice. Controls have mobile-friendly targets. The Start button keeps the same size across selections and during generation.

## Learning order

Overview, sidebar, and previous/next article links share the course order in `learn-content.json`. Every technique article has an explicit starting level and prerequisite links. Practice variants show their own tier, because a family article can contain later extensions.

Beginner has a dedicated box Hidden Single lesson and detector. The existing `hidden-single` ID remains valid. Learn ordinary wings before the full ALS family, restricted chains before general AICs, and ordinary AICs before grouped or ALS chains. Rare fish and uniqueness techniques are extensions rather than prerequisites for every later lesson.

Foundation pages teach concepts before the techniques that use them. Each has a visual walkthrough and short questions with explanations. The Learn first links point back to the relevant concepts.

Fundamentals introduces candidate slots, cell addresses, and the diagram key. The link lesson derives weak links from conflicts and strong links from required choices. Chain lessons connect solid and dashed lines to written notation and show each implication in order.

| Mark | Meaning |
| --- | --- |
| Blue ring | Candidate in the main pattern |
| Amber ring | Candidate in another group or role, not a truth value |
| Red strike | Candidate ruled out; conditional while inside an assumption |
| Green ring | Proved placement |
| Solid line, `=` | Strong link: at least one endpoint is true |
| Dashed line, `-` | Weak link: at most one endpoint is true |
| Arrow | Direction of an implication; line style still gives its strength |

The walkthroughs reuse `Board` and `BoardLinks`, including the same candidate slots and theme colors as later diagrams. Schematic examples state which candidates are omitted. Each conditional step names its assumption. Final steps restore unrelated branch marks and keep only proved results. Nested proof cards show which conclusions remain inside an outer assumption.

Definitions live in `src/sudoku/foundation-visuals.json`. The lesson editor can insert and select these walkthroughs. Tests check link rules, visible endpoints, and final deductions across all possible fillings of the small examples. Captions reserve the height of the longest step, so the controls and surrounding article stay in place.

| Level | Foundation pages | First uses |
| --- | --- | --- |
| Beginner | Which cells see each other? | Scanning and singles |
| Medium | Candidates and eliminations, counting cells and digits | Locked Candidates and subsets |
| Tricky | Strong and weak links, counting rows and columns | Skyscraper, Two-String Kite, Empty Rectangle, X-Wing and Swordfish |
| Hard | Bivalue cells and cases, the uniqueness assumption | Wings, Unique Rectangle, and BUG+1 |
| Very Hard | Following a chain, why two colors work, almost locked set basics | Chains, coloring, and WXYZ-Wing |
| Expert | Reading chain notation, when a chain closes | AIC and Nice Loops |
| Master | Grouped candidates, restricted common candidates, links inside an almost locked set | Grouped chains, grouped loops, and ALS techniques |
| Extreme | Assumptions and contradictions, counting placements across houses | Forcing proofs, Multi-Sector Locked Sets, and complex fish |
| Impossible | Nested proofs and search, complete layouts for a digit | Nested Forcing Nets and Pattern Overlay |

Grouped AIC and grouped Nice Loops have separate Master articles. Their existing technique URLs still work. The ordinary AIC and Nice Loops articles stay at Expert. Foundation review drills must never replace a technique's route in the lesson catalog.

Some family articles still contain several levels. Further course work can split those extensions into independent course steps while preserving their URLs and saved progress. The current metadata and practice labels make that distinction explicit without breaking old links.

## Saved data and compatibility

Keep saved puzzles and earned outcomes. Point totals may be recalculated under the current scoring version. A saved `unfair` grade still displays Unfair. A legacy `unfair` generation preference maps to Expert, and the engine accepts it as an input alias. New output and the selector use only the ten current levels. Do not relabel old puzzles as if they were newly rated under the current scoring policy.

New players start at 855 with Medium as the Auto recommendation. On upgrade, saved results without a player rating version use the original five levels when the app calculates the rating. New results continue from that rating and use the ten levels. An old Auto recommendation of Unfair becomes Expert. The browser keeps the existing records, including scores from puzzles the player deleted.

## Research behind the policy

These boundaries are product choices, not a universal Sudoku standard. Validate especially the Expert/Master boundary with representative puzzles and learners.

- [HoDoKu: creation and rating](https://hodoku.sourceforge.net/en/docs_cre.php). Explains technique levels plus accumulated costs, the source of the older promotion model.
- [HoDoKu: chains and loops](https://hodoku.sourceforge.net/en/tech_chains.php). Separates restricted chains, ordinary AICs, group nodes, and ALS nodes.
- [HoDoKu: last-resort methods](https://hodoku.sourceforge.net/en/tech_last.php). Explains forcing nets and computer-oriented template enumeration.
- [Sukaku Explainer ratings, version 1.17.8](https://github.com/SudokuMonster/SukakuExplainer/wiki/Difficulty-Ratings-in-Sukaku-Explainer-v1.17.8). Distinguishes box Hidden Singles, line Hidden Singles, and Naked Singles, as well as advanced families.
- [Sudoku Coach: difficulty](https://sudoku.coach/en/learn/sudoku-difficulty). Distinguishes the hardest technique from the amount of work and discusses solve-path dependence.
- [Sudoku Exchange: puzzle bank](https://www.sudokuexchange.com/puzzle-bank/). Demonstrates generation followed by grading; its category thresholds are explicitly product choices.
- [SudokuWiki: grading](https://www.sudokuwiki.org/Grading_Puzzles). Explains candidate density and filtering puzzles with uneven solve paths.
- [SudokuWiki: Weekly Unsolvable](https://www.sudokuwiki.org/Weekly-Sudoku.aspx). Its March 2026 update explains how new forcing-net support solved many older entries.
- [Pelánek: difficulty evaluation](https://arxiv.org/html/1403.7373v1). Human difficulty depends on individual steps and their dependencies; it does not establish an optimal number of named levels.
- [Nishikawa and Toda: strategy-solvable generation](https://www.mdpi.com/1999-4893/13/7/171). Studies construction under specified strategy constraints. It does not establish efficient generation for this entire advanced catalog.

## Technique mapping

Family assignments are the starting policy. Proof length, grouped nodes, branches, and nesting still vary within a family. A shorter valid lower-tier route takes precedence during generation.

| Technique ID | Level |
| --- | --- |
| `full-house` | Beginner |
| `hidden-single-box` | Beginner |
| `naked-single` | Easy |
| `hidden-single` | Easy |
| `pointing` | Medium |
| `claiming` | Medium |
| `naked-pair` | Medium |
| `hidden-pair` | Medium |
| `locked-pair` | Medium |
| `locked-triple` | Medium |
| `naked-triple` | Medium |
| `hidden-triple` | Medium |
| `naked-quadruple` | Hard |
| `hidden-quadruple` | Hard |
| `x-wing` | Tricky |
| `skyscraper` | Tricky |
| `two-string-kite` | Tricky |
| `empty-rectangle` | Tricky |
| `w-wing` | Hard |
| `xy-wing` | Hard |
| `xyz-wing` | Hard |
| `swordfish` | Tricky |
| `jellyfish` | Hard |
| `finned-x-wing` | Hard |
| `sashimi-x-wing` | Hard |
| `finned-swordfish` | Very Hard |
| `sashimi-swordfish` | Very Hard |
| `finned-jellyfish` | Very Hard |
| `sashimi-jellyfish` | Very Hard |
| `simple-coloring` | Very Hard |
| `multi-coloring` | Very Hard (hints and custom solver profiles) |
| `3d-medusa` | Very Hard |
| `x-chain` | Very Hard |
| `xy-chain` | Very Hard |
| `aic` | Expert |
| `discontinuous-nice-loop` | Expert |
| `continuous-nice-loop` | Expert |
| `grouped-aic` | Master |
| `grouped-discontinuous-nice-loop` | Master |
| `grouped-continuous-nice-loop` | Master |
| `unique-rectangle-1` | Hard |
| `unique-rectangle-2` | Hard |
| `unique-rectangle-3` | Hard |
| `unique-rectangle-4` | Hard |
| `unique-rectangle-5` | Hard |
| `unique-rectangle-6` | Hard |
| `unique-rectangle-aic` | Master |
| `unique-rectangle-discontinuous-nice-loop` | Master |
| `unique-rectangle-continuous-nice-loop` | Master |
| `hidden-rectangle` | Hard |
| `unique-loop` | Very Hard |
| `bug-plus-one` | Hard |
| `wxyz-wing` | Very Hard |
| `fireworks` | Master |
| `firework-w-wing` | Master |
| `firework-l-wing` | Master |
| `firework-als-wing` | Master |
| `firework-aic` | Master |
| `aligned-pair-exclusion` | Master |
| `aligned-triplet-exclusion` | Extreme |
| `tridagon` | Extreme |
| `tridagon-aic` | Extreme |
| `tridagon-forcing-net` | Extreme |
| `forcing-chain` | Extreme |
| `forcing-net` | Extreme |
| `dynamic-forcing-net` | Extreme |
| `advanced-forcing-net` | Extreme |
| `nested-forcing-net` | Impossible |
| `als-xz` | Master |
| `als-xy-wing` | Master |
| `als-chain` | Master |
| `als-aic` | Master |
| `als-discontinuous-nice-loop` | Master |
| `als-continuous-nice-loop` | Master |
| `sue-de-coq` | Master |
| `death-blossom` | Master |
| `exocet` | Extreme |
| `senior-exocet` | Extreme |
| `double-exocet` | Extreme |
| `sk-loop` | Extreme |
| `multi-sector-locked-sets` | Extreme |
| `franken-fish` | Extreme |
| `mutant-fish` | Extreme |
| `pattern-overlay` | Impossible |
| `pairwise-pattern-overlay` | Impossible |
| `triple-pattern-overlay` | Impossible |
| `quadruple-pattern-overlay` | Impossible |
| `quintuple-pattern-overlay` | Impossible |
| `kraken-fish-1` | Extreme |
| `kraken-fish-2` | Extreme |
