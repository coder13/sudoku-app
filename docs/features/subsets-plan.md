# Subsets and chain integration plan

## Status

Product plan. Subsets and Chains remain separate panels. They share subset data and board highlighting so a chain can use a saved subset as a node.

Play supports saved subsets, live classification, and applying verified deductions in Subsets and Chains. A chain can link saved ALSes, use a saved ALS at the end of a candidate path, or link saved petals to a Death Blossom stem. Combining saved sets can verify XYZ-Wing, WXYZ-Wing, and Sue de Coq. The digit-focused hidden subset design is below.

## Goal

Let a player group cells, understand the candidate-count constraint that group represents, and reuse it in deductions. The player should be able to discover a useful set without knowing its technique name first.

A subset is a reasoning object, not only a colored group. It records its member cells and derives its candidate union and classification from the current puzzle state. It can be highlighted independently or referenced by a chain.

## Core rules

### Valid membership

Every pair of cells in a subset must see each other. When the player adds a cell, it must see every cell already in the subset. This makes the selected cells an all-different group and keeps candidate-count reasoning sound.

A pairwise-visible group may span multiple houses. The app should distinguish such a generalized peer set from familiar house-based names such as a locked set or ALS. Use the standard name only when the group also satisfies that technique's house-based definition.

### Automatic classification

For a subset with `n` cells, count the distinct candidates in the union of those cells. Let `extra = candidate count - n`.

- `extra = 0`: locked set when the cells share a house; otherwise a peer set with no extra candidates.
- `extra = 1`: ALS when the cells share a house; otherwise a peer set with one extra candidate.
- `extra >= 2`: show the extra-candidate count, such as `ALS+2`, when the cells share a house, and a peer-set label with the count when they do not.
- `extra < 0`: mark the group invalid for a consistent candidate state and explain that there are fewer candidates than cells.

`ALS+2` and higher are descriptive app labels, not a claim that every such set has a known deduction. Classification describes the group; a technique label is shown only when its required relationships and elimination are verified.

Candidate unions and classifications are derived from the current board candidates. If edits change the candidates, recalculate them. Keep the player's cell membership unless the player edits or removes the subset.

## Subset creation flows

### Select cells, then make a subset

1. The player multi-selects cells on the board.
2. The player right-clicks one of the selected cells or opens its context menu with **Shift+F10**. If any selected pair does not see each other, disable **Make subset**.
3. The player selects **Make subset** in the board menu. Opening the menu on a cell outside the selection makes that cell the sole target.
4. Add the new subset to the Subsets panel and highlight all its member cells with the subset's color.

### Subset mode

1. The player chooses **New subset** and selects a starting cell. Show a card for the set at the first selection.
2. Highlight cells that can be added: each candidate cell must see every cell already selected.
3. Recalculate eligible cells after each addition. Let the player remove a selected cell and recalculate again.
4. Update the card with the current membership, candidate digits, and classification. Keep visibility and deletion available.
5. Save the set when the player exits the mode. An empty selection creates no set.

Subset mode should make membership clear while the group is being built. Use a preview treatment for eligible cells and a consistent set color for selected members. Do not make the player infer membership from a candidate color alone.

## Subsets panel

The Subsets panel owns subset creation and management. It should:

- List the player's saved subsets, each with its type or extra-candidate count.
- Show member cells and the candidate digits. Place the digits directly under the set name.
- Highlight one subset's cells when the player selects it in the panel.
- Allow editing membership and removing a subset.
- Make clear when a group is generalized and does not share a single house.
- Keep colors and labels consistent with board highlights and chain references.

Keep Subsets and Chains as distinct panels for now. Do not combine their lists or rename Chains as a broader reasoning panel in this phase.

## Chains panel integration

The Chains panel continues to own candidate-chain creation and editing. Add a way to insert an existing subset into a chain as a node. The chain should reference the subset object so changes to its cells or candidate union are reflected wherever it is used.

Show set membership and chain relationships as different visual layers:

- A subset color identifies all cells belonging to that set.
- Candidate colors continue to describe chain state.
- An RCC has its own relationship color so it is not confused with unrestricted candidates.
- Hovering notation highlights the corresponding cell, candidate, or edge without changing its semantic color.

An RCC between two subsets is valid when the shared candidate occurrences are mutually exclusive: every occurrence in one subset sees every occurrence in the other. For ALS-XZ, explain the RCC candidate and show the resulting elimination candidate(s). A target candidate can be removed only when it sees all relevant occurrences of the eliminating digit across the linked sets.

## Tactic coverage

Support should be added in layers. Do not force every tactic into an ALS label.

| Tactic | Representation |
| --- | --- |
| XY chain | Candidate nodes and strong/weak links; no subset is required. |
| XY wing | Candidate-chain reasoning, with an optional grouped view of its cells. |
| XYZ wing and WXYZ wing | Generalized set/group nodes and links, with named-pattern recognition when the full pattern is verified. |
| ALS-XZ | Two ALS subset nodes joined by an RCC, with the verified Z elimination. |
| ALS chain | Multiple ALS nodes joined through valid RCC relationships. |
| Death Blossom | One stem cell branches to a petal ALS for each stem candidate through that candidate's RCC. If every petal shares a digit Z outside the stem, each stem branch makes its petal a locked set and forces Z into at least one petal. Remove Z from an outside cell that sees every Z occurrence across all petals. |
| Sue de Coq | Subset reasoning with the extra constraints from its intersecting houses. |

Death Blossom is a branched proof, not a single linear ALS chain. The Subsets panel owns and highlights the petal ALSs; the proof references those subsets and the stem candidate that connects to each one. Show the candidate-by-candidate branches and the common Z conclusion. Support valid petal overlap when all RCC and all-different conditions still hold; do not require petal sets to be disjoint by default.

### Groups with a larger surplus

An all-different group with two or more extra candidates can omit that many digits. Sue de Coq proves a deduction when the line and box demand disjoint intersection digits and their combined demand equals the surplus. WXYZ-Wing instead counts which digits can repeat across its cells.

For a general group, a future verifier could test whether its cells still admit distinct assignments after excluding specified digits. If every assignment needs at least one of those digits, that yields a verified group inference. The app labels larger groups by their surplus until a specific proof is available.

### Hidden subsets

Use a separate digit-focused mode in Subsets. The player chooses a house and selects digits with the keypad. Highlight the union of the selected digits' available cells in that house. With two or more selected digits, enable saving once each digit has a possible placement and the union has exactly as many cells as digits.

Store the house, digits, and member cells together. Use the existing subset card to display the digit selection and members. Recheck the group when the shared candidates change. If every selected digit still has a placement and all its placements remain in the saved cells, the group can remove other digits from those cells. A digit that loses all placements or gains one elsewhere in the house invalidates the saved proof.


## Color panel boundary

Subset creation, classification, and chain integration must not depend on the Colors panel. Set highlights and RCC colors are owned by the Subsets and Chains features. The existing Colors panel remains a separate manual coloring concept and is not part of this plan.

## Delivery sequence

1. **Subset objects and classification:** add the data model, pairwise-visibility validation, both creation flows, automatic classification, and board highlights.
2. **Subsets panel:** add the list, detail view, selection/highlighting, edit, and remove behavior.
3. **Chain references:** allow a chain to include an existing subset node and keep the board and notation synchronized.
4. **ALS relationships:** add RCC validation and explainable ALS-XZ and ALS-chain deductions.
5. **Branched set proofs:** represent a Death Blossom stem and its candidate-to-petal ALS branches, verify the shared digit, and explain the resulting elimination.
6. **Pattern expansion:** add verified wing and Sue de Coq representations, then investigate deductions using sets with larger surplus.
7. **Hidden subsets:** design a digit-focused flow separately from the initial cell-grouping interaction.

## Acceptance criteria

- A player can create a subset through either multi-select plus **Make subset** or subset mode.
- The app never creates a subset containing a pair of cells that do not see each other.
- Subset mode offers only cells that see every current member.
- The panel shows the exact member cells, candidate digits, and an accurate classification.
- A subset can be selected in the panel and its membership is clear on the board.
- A chain can reference an existing subset without duplicating or obscuring its membership.
- A Death Blossom proof has a valid petal ALS for every stem candidate, uses only verified RCCs, and removes the common digit only from targets that see all its possible occurrences in every petal.
- Death Blossom visuals distinguish the stem, each petal subset, each RCC, and the common-digit elimination, including valid overlaps between petals.
- RCC coloring is visibly distinct from unrestricted candidate coloring, and notation hover does not recolor the highlighted item.
- Named techniques and eliminations appear only when their logical conditions are verified.
- Subsets and Chains remain separate panels, and neither relies on the Colors panel.

## References

- [HoDoKu: ALS techniques and Death Blossom](https://hodoku.sourceforge.net/en/tech_als.php#db)
- [SudokuWiki: Death Blossom](https://www.sudokuwiki.org/Death_Blossom)
