# Branching

## Purpose

Branching lets a player explore what follows from an assumption without changing the main puzzle. It is a general reasoning activity, not a named Sudoku technique by itself. Some branch explorations become formal proofs; others are temporary investigations.

## The basic model

A branch starts from a particular board state and a premise, such as “If 7 is in R4C2” or “If 7 is not in R4C2.” The player explores that conditional state. Any placements, candidate removals, chains, and subsets created there remain conditional on the premise.

A branch can be:

- **Open** while the player explores it.
- **Contradicted** when the premise leads to an impossible state or a recorded proof of contradiction.
- **Consistent so far** when no contradiction has been found. This does not prove the premise true.
- **Resolved** when the player is done exploring, without deciding whether the premise is true.

The app can catch direct contradictions such as a duplicate placed digit, a cell with no candidates, or a house with no place for a digit. The player may also record a contradiction established by a chain or net. The UI should distinguish automatic checks from reasoning the player has supplied.

## How it relates to bookmarks

Keep Bookmarks and Branches in separate panels. A **bookmark** saves a board state for return; a **branch** explores a conditional path from a state. Starting a branch should capture its origin automatically, without adding a duplicate bookmark. A player can start a branch from a bookmark or save a bookmark from a branch state.

The branch origin and its later edits should remain available independently. Resolving or deleting a branch should not delete a separately saved bookmark.

## How it relates to chains and nets

A chain can be the proof made inside a branch. For example, assume a candidate is true and follow implications until they contradict the assumption. A **net** is a proof structure that forks into cases and uses the outcomes of those cases to establish a shared result. See [Nets](nets.md).

Not every branch is a net. A player may temporarily test a possibility, inspect the changed board, and return without constructing a formal proof. Conversely, a net's branches are logical cases within a proof, not necessarily separate, long-lived board workspaces. This distinction should remain visible in the data and UI.

A branch can contain chains and nets, but their conclusions are conditional until the premise is disproved or all relevant alternatives establish the same result. Do not transfer a branch-only candidate removal to the main puzzle as an unconditional elimination.

## How it relates to subsets and fish

Subsets and fish are structured candidate patterns. Their validity depends on the candidate state in which the player identifies them. A branch assumption may change that state: for example, removing a candidate from an ALS in a branch may leave a locked set. The branch can use that set in a chain or net.

A recorded structure must be rechecked if later branch edits change its supporting candidates. A subset or fish shown in the main puzzle should not silently stand in for a different structure that exists only under an assumption.

## Suggested interaction

1. From a candidate, choose **Assume true** or **Assume false**.
2. Keep the current main state as the branch origin and switch to an isolated working state.
3. Show the active premise on the board and in branch-local chains, nets, and subset explanations.
4. Let the player return to the parent state or create a sibling branch from the same origin.
5. Promote a conclusion only when the app or player has a proof: the premise contradicts, or all relevant alternatives force the same result.

The first release can support one explicit premise per branch and sibling branches. Nested branches and automatic candidate-combination generation can wait.

## Open product question

Branching is broader than nets, but a formal net is a kind of branched chaining. The product should decide whether the player starts a branch from a general **Assume** action and optionally builds a proof, or starts from a **Net** tool that asks for a proof structure immediately. Either way, Bookmarks stay separate.
