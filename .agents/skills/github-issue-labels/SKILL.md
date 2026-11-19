---
name: github-issue-labels
description: Choose and maintain GitHub issue labels for this puzzle app when creating issues, triaging a backlog, or auditing label coverage. Label pull requests only when requested.
---

# GitHub issue labels

Use labels to describe the work and its main product areas. Read the maintained [label catalog](references/labels.json) for names, definitions and colors.
Use lowercase names exactly, including spaces in `new puzzle`, `new variant` and `grid size`.

## Choose labels from the issue's scope

Read the title, body and relevant discussion before classifying an issue. A keyword match does not establish its scope.
Use at least one work label and one area label for an actionable issue. Several work labels can apply to separate deliverables.
Prefer the few primary areas that help someone select the issue. Do not add every area mentioned in general acceptance requirements.

- Use `new puzzle` for a distinct puzzle family, such as Kakuro, Hidato, standalone Futoshiki or Calcudoku.
- Use `new variant` for a Sudoku rule, combined ruleset, region layout or grid size. Include the app integration of an existing engine rule.
- Use `generation` for puzzle construction, seed calibration and the New Puzzle flow. It is an area label, not a synonym for `new puzzle`.
- Use `enhancement` for another feature or improvement when a more specific work label does not fit.
- Use `bug` for existing behavior that fails its intended contract. Missing proposed features and honest search limits are not automatically bugs.
- Use `performance` for measured latency, throughput, memory or package work. A slow operation can also be a bug when it violates a stated contract.
- Use `research` for an unresolved deduction, rule meaning or algorithm question. Do not call an incomplete human path solved from its exact completion.
- Use `documentation` for documentation or instructions. Use `question` when answering a question is the issue's purpose.

Choose areas independently: `engine`, `ui`, `import`, `generation`, `hints`, `scoring`, `training`, `grid size`, `storage`, `sync`, `tooling` and `accessibility`.
Use `scoring` for rating behavior, costs or calibration. A performance patch that preserves ratings does not need it solely for timing a rating call.
Use `hints` for deductions, proofs, Finder and human solution paths. Use `training` for Learn and practice work.
Use `tooling` for repository workflows and agent skills. Use `engine` for puzzle behavior and engine contracts.

Examples from this repository:

| Issue | Classification |
| --- | --- |
| #240 standalone Futoshiki | `new puzzle`, `engine`, `ui` |
| #47 Sudoku inequalities | `new variant`, `engine`, `ui` |
| #189 New Puzzle generation parity | `enhancement`, `generation`, `engine`, `ui` |
| #158 stalled Renban reasoning | `research`, `engine`, `hints` |
| #101 hints on invalid candidates | `bug`, `engine`, `hints`, `ui` |
| #88 engine and worker audit | `performance`, `engine` |
| #224 sized Sudoku grids | `new variant`, `grid size`, `engine`, `ui` |
| #246 label policy and skill | `documentation`, `tooling` |

## Apply within the requested scope

For a new issue, supply its labels when creating it. For an existing issue, prefer additive updates that preserve other useful labels.
The GitHub connector's `add_issue_labels` operation adds labels atomically. Its `update_issue(labels=...)` operation replaces the whole set.
If replacement is necessary, fetch the current labels and preserve all unrelated labels. Remove a label only after establishing that it is incorrect or obsolete.

Read the repository's current label list before creating a missing label. Use the catalog description and color.
The connector can apply labels but does not expose label creation in every environment. Use `gh label create` when that capability is missing.
Do not rename or delete established labels during ordinary triage. Keep useful custom labels outside the catalog.

Labels do not assign ownership or change issue status. Keep implementation claims in pickup comments using the current agent identity.
Preserve issue bodies, state, assignees, milestones and existing pickup comments during a labeling pass.
Workflow labels such as `duplicate`, `invalid`, `wontfix`, `help wanted` and `good first issue` qualify an issue. They do not prove implementation or justify closure.

Audit open issues by default. Include closed issues when the user requests a complete repository audit.
GitHub's REST issue list includes pull requests, so exclude objects with `pull_request` unless the user includes PRs.
Follow pagination to completion. Re-read the inventory after updates to catch issues created during the pass.

## Audit and verify

Run the read-only helper from the repository root:

```sh
python3 .agents/skills/github-issue-labels/scripts/audit_issue_labels.py --state all
```

Use `--state open` for normal backlog maintenance or `--format json` for a machine-readable report.
The helper lists missing catalog labels and issues without a work or area label. It never changes GitHub.
Coverage is a first check. Review the proposed assignments against the actual issues before applying them.
After applying labels, inspect the live issue labels and re-run the audit. Report the audited scope and any remaining ambiguity.

Keep the catalog and examples current when the user changes the taxonomy. A new label requires a distinct recurring use.
