# Nets

## Purpose

A net is a branched proof: start with a premise, follow its implications, split when the premise allows different cases, and show that the cases lead to a contradiction or a shared result. A net is more general than a single linear chain, but it is still a proof. Merely trying a candidate and seeing what happens is not enough.

Terminology varies across Sudoku solvers. One useful distinction is that a chain proceeds by links that rely on the immediately previous inference, while a net may fork and later use the outcome of more than one branch. [HoDoKu describes this chain/net distinction](https://hodoku.sourceforge.net/en/tech_chains.php).

## A simple example

Suppose a cell has candidates 6, 7, and 9. Create one case for each candidate. If each case proves that R1C2 must be 5, then R1C2 is 5 regardless of which candidate occupies the starting cell. The cases form a proof with a split at the starting cell and a shared conclusion.

A contradiction can also settle a case. If assuming 7 in R4C2 leads to a contradiction, then 7 can be eliminated from R4C2 in the parent state. If a case remains consistent, it has not been proven true.

More complex nets can depend on consequences within a branch to unlock later inferences. Each branch and each merge therefore needs a visible reason; a picture that only shows colored paths is not a sufficient proof.

## How nets relate to chains

A linear chain is one path of implications. A net can contain several such paths and connect them through case splits and shared outcomes. The Chains tool could offer both forms under one reasoning model: **Chain** for a linear path and **Net** for a proof with forks or joins. Whether those are separate creation modes or progressively more complex chain structures remains open.

A net must distinguish:

- **Case split:** the listed alternatives cover every possible value of the starting proposition or cell.
- **Within-case inference:** each step follows from that case and earlier valid steps.
- **Join:** a result holds in every case, or a contradiction rules out a case.

A result found in only one unresolved case cannot be applied to the main board.

## How nets relate to branching

Branching is the activity or workspace of exploring a premise. A net is a formal proof that may use branches. A player may branch without recording a net; a net may contain short proof branches that do not need to become permanent board workspaces. See [Branching](branching.md).

This suggests storing the logical proof graph separately from the branch board states. The proof graph records premises, implications, forks, and joins. A branch workspace records the working board and notes under a premise. The UI can connect them without treating every exploratory edit as a proven inference.

## How nets relate to subsets and fish

A subset can act as a grouped inference inside a net. For example, a chain entering an ALS may remove a candidate from it; the remaining cells then form a locked set that supports the next inference. The subset belongs to the branch state where it was checked.

Fish can also contribute proven implications. An X-Wing may expose ordinary candidate links. A larger fish may need a grouped inference or a case split. A Kraken Fish combines a fish with chains that establish the same elimination for its relevant alternatives. The net should show which fish fact each path relies on, rather than treating the whole pattern as an unexplained link. [HoDoKu's forcing-technique examples include Kraken Fish built from chains](https://hodoku.sourceforge.net/en/tech_last.php).

## Suggested interaction

- Start a net from an explicit premise or from all candidates in a cell or house.
- Add a path of candidate links, grouped links, or structured objects such as subsets.
- Create a fork only when the cases are exhaustive.
- Show each path separately on the board; show the shared conclusion only after all required cases support it.
- Allow a path to be marked contradicted with the supporting chain or direct board conflict.

Nets can become difficult to read quickly. A first version should favor a few explicit branches, readable per-branch notation, and a way to inspect one branch at a time. Avoid automatic sprawling search as the initial user-facing model.

## Open product question

A net is conceptually part of chaining, so it likely belongs in the Chains tool rather than a separate Nets panel. A separate Net mode may still help explain the case-split workflow. The board overlay that displays a selected path is a visualization concern; it is described separately in [Overlays](overlays.md).
