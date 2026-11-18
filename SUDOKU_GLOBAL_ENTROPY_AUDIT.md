# Global Entropy integration audit

This work belongs to [issue 60](https://github.com/coder13/sudoku-app/issues/60). It is in the isolated `codex/sudoku-global-entropy-integration` worktree and is not yet merged. Package, performance and final release checks remain open.

## Rule and source controls

Every overlapping 2 × 2 area contains at least one low digit (1–3), one medium digit (4–6) and one high digit (7–9). All 64 areas apply, including those across box or Jigsaw borders. One group therefore appears twice. Equal digits may repeat at opposite corners when every other active rule permits it. The rule adds no binary peer relation.

The published control is Philip Newman's [Ordered Entropy](https://www.gmpuzzles.com/blog/2026/04/entropy-sudoku-by-philip-newman/), published on 2026-04-30. Its puzzle and solution PDFs were rendered and inspected. `tests/fixtures/global-entropy-newman.json` records both URLs and SHA-256 hashes. It has twenty givens. An independent digit-domain counter finds one completion with the rule and two without it. The PDF text extractor reverses row order; the fixture follows the visibly printed solution.

Three complete original Coach exports provide combined-rule controls. Their published diagrams were inspected and their printed completions checked against every clue. The fixtures retain their unmodified codes, authors, dates, image URLs and image hashes.

| Source | Givens | Complete rule inventory | Independent result |
| --- | ---: | --- | --- |
| [A2s7, Entropy Quads](https://sudoku.coach/en/s/A2s7), cyboogie | 5 | Ten Quadruple circles and Global Entropy | One printed completion |
| [CJhv, Entropy Quads 3](https://sudoku.coach/en/s/CJhv), cyboogie | 0 | Fourteen circles, including a repeated 3, and Global Entropy | One printed completion |
| [AdoP, sudoku² 25-11-14](https://sudoku.coach/en/s/AdoP), XH | 12 | Nine Disjoint Group houses and Global Entropy | One printed completion |

CJhv's dependency control retains two distinct completions that satisfy every Quadruple and Classic house after removing Global Entropy. Direct numeric checks validate both witnesses; only the printed one satisfies all 64 entropy areas. This avoids an expensive search for the second witness during every test.

The [versioned Coach compiler](https://sudoku.coach/js/jCfXtZs-1776367508519.js) generates all 64 areas independently of region layout. Its Global Entropy layer has empty settings and no local segments. Unknown settings, parameters and local cells reject explicitly.

## Encoded scope and authored rules

A complete encoded rule list can still omit instructions on the author's published page. The `custom` flag does not establish completeness. Keep the original source and distinguish decoding its payload from supporting its full authored meaning. Current short links explicitly ask the player to open Coach and use Copy → Puzzle; a future resolver must preserve the full author context.

| Preserved source | Remaining gap |
| --- | --- |
| [LEjN, Entropic Spiral](https://sudoku.coach/en/s/LEjN) | The export encodes Global Entropy and eighteen positive paths. Its author also forbids connections at spiral breaks. [Issue 168](https://github.com/coder13/sudoku-app/issues/168) tracks that mathematical rule. Decoding the positive payload does not establish complete authored support. |
| [7nms, Entropic Order](https://sudoku.coach/en/s/7nms) | Seven outside L/M/H letters order the specified group's digits from the clue direction. They are stored as cosmetic text and remain an explicit import error. [Issue 169](https://github.com/coder13/sudoku-app/issues/169) tracks the rule. |
| [K95q, That’s 3 in the corner](https://sudoku.coach/en/s/K95q) | The author states that all black dots are given; the encoded ratio settings omit the negative flag. Its positive payload cannot represent that complete instruction. |
| [HqJ9, Entropic 7/13 sums](https://sudoku.coach/en/s/HqJ9) | An empty Consecutive Line layer remains unverified. Do not drop it or guess that it means Renban. |
| [FLAb, AJT’s Bento: Entropy](https://sudoku.coach/en/s/FLAb) | Region geometry, Pill Arrows and cosmetic geometry remain unsupported. |
| [Hu9m, Entropy 7/13](https://sudoku.coach/en/s/Hu9m) | Modular Lines remain unsupported. Retain the global rule, every sum, thermometer and ratio marker. |
| [2j53, Coach Entropy collection](https://sudoku.coach/en/s/2j53) | The original export uses SCv4. Preserve it for the generic legacy decoder. |

AdoP is a useful contrary control: its custom Disjoint Group rule is fully encoded as nine explicit houses, despite their zero-opacity source styling. The app retains and explains all nine houses. No puzzle-specific denylist, uniqueness inference or automatic deletion of unsupported content resolves these gaps. [Issue 7](https://github.com/coder13/sudoku-app/issues/7) stays open.

## Native and app boundaries

The public typed rule is `{ "type": "global-entropy" }`. The compiler records the first rule index for work and proof evidence while preserving the original rule list. All 81 cells are marked as constrained for conservative uniqueness-technique eligibility. The rule is invariant under square symmetries. Numeric groups prevent arbitrary digit relabeling.

The private support kernel maps four three-bit group domains through a fixed 4,096-entry table. It restores only digits that remain in each original domain. The table is derived from coverage assignments and does not mix in Classic distinctness. Exact candidate propagation uses it to a fixed point. Givens and entries that make an area impossible report a conflict. Exact solving remains active when the human technique is disabled.

The human `global-entropy` technique emits the rule index, four actual cells, their input domains and all unsupported candidate actions. Its cost is **24 points, Easy**, calibrated against the same independent proof-effort measure as the existing catalog. Its three exercises cover a missing group, a constrained group pair and the published puzzle. Existing technique costs and scoring version 8 remain unchanged.

The app declares the rule in its existing registry. Import preview and Play obtain the readable rule from that registry. The board's accessible grid label names the three ranges and areas across region borders. This global rule has no permanent cell markers; hint patterns highlight the four relevant cells. Existing companion circles and houses remain visible.

Input cleanup and conflicts inspect placed digits. They clear incompatible Pencil marks in both modes and preserve history. Walkthrough masks retain candidate-based group deductions until an explained step applies them. Generic hints, paging, Finder, practice, storage and sharing use the complete typed puzzle. New puzzle does not offer this family before difficulty recipes are calibrated; the engine's targeted generation API is tested separately.

## Logical coverage and verification status

The independent counter uses direct numeric assignments, Classic houses and the actual companion rules. Its last-domain cache holds one support result per fixed clue and reruns direct enumeration whenever any participating domain changes. It shares no production support table or search code.

| Source | Native profile, points/steps | App profile, points/steps | App result |
| --- | --- | --- | --- |
| Newman | 856/79, Easy | 1,176/79, Easy | Complete printed solution |
| A2s7 | 1,347/31, stalled | 1,747/47, stalled | Partial human walkthrough |
| CJhv | 1,961/47, stalled | 2,336/63, stalled | Partial human walkthrough |
| AdoP | 688/31, stalled | 1,612/93, Medium | Complete printed solution |

The native kernel is compared with direct numeric enumeration on all 4,096 group-domain patterns, 2,048 sparse digit-domain samples and all 6,561 complete assignments. App placed-digit restrictions cover all 256 partial group patterns. Four full source completions are independently counted. Actual Wasm checks validate every action in both logical profiles against those completions and replay each Global Entropy proof numerically. Exact candidates and completions also work with an empty human technique order.

[Issue 172](https://github.com/coder13/sudoku-app/issues/172) tracks the two incomplete Quadruple combinations. Establish independent human deductions at their actual bottlenecks before adding a detector or claiming a full walkthrough.

Local checks cover multiple hints, collection bounds, Finder counts, three checked exercises, an invalid answer, a fresh drill, actual storage reload, undo/redo, mixed sharing, and generation with exact givens, first technique, score targets and independent rule dependence. Desktop/mobile component rendering checks accessible rules, all companion circles and houses, the real lesson, hint cards and solution steps. Live viewport interaction review remains open.

The all-symmetry completion audit found a pre-existing app bug: Quadruple and Odd/Even coordinates did not move with the givens. [PR 171](https://github.com/coder13/sudoku-app/pull/171) isolates that repair. Recheck all complete Global Entropy companions after the prerequisite reaches main.

Final native/feature/package/documentation gates, complete retained-response comparisons, paired old-family costs, new-family request costs, generation measurements and deployment CI must pass before this family merges. Timing results will include warmup and sample counts, complete versus stalled outcomes, artifact hashes, package size and memory limits. No performance result is claimed yet.
