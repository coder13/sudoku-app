"""Explore clue exchanges around independently constructed X Sudoku solutions."""
from collections import Counter
import json
from pathlib import Path
import random
import sys
from pool import Engine, X_RULES, definition, edit_mask, fingerprint, seed_for


if __name__ == "__main__":
    directory, start, count = Path(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
    parents = []
    for name, cutoff in [("x-0-440", 300), ("x-440-460", 700), ("x-900-440", 1160)]:
        rows = [json.loads(line) for line in (directory / (name + ".jsonl")).open()]
        if max(r["index"] for r in rows) < cutoff:
            raise ValueError(f"Finish the first {cutoff} proposals of {name} first")
        parents.extend(r for r in rows if r["index"] < cutoff and r["difficulty"] not in ("beginner", "easy"))
    parents.sort(key=lambda r: r["seed"])
    e, counts = Engine(), Counter()
    path = directory / f"x-refined-{start}-{count}.jsonl"
    with path.open("w") as output:
        for i in range(start, start + count):
            seed = seed_for(f"Sinclair/1/x-refined/{i}")
            rng = random.Random(seed)
            parent = rng.choice(parents)
            old = parent["puzzle"]["givens"]
            givens = edit_mask(old, parent["solution"], rng)
            if e.call("classic-unique", givens=givens):
                counts["classic-unique"] += 1
                continue
            puzzle = definition(givens, X_RULES)
            row = e.call("trace", puzzle=puzzle, budget=15_000)
            if row["status"] == "solved":
                row.update(key=fingerprint(row.pop("canonical")), family="x", parent=parent["parent"],
                           puzzle=puzzle, seed=seed, stream="x-refined", index=i)
                output.write(json.dumps(row, separators=(",", ":")) + "\n")
                output.flush()
            counts[row.get("difficulty", row["status"])] += 1
    e.close()
    path.with_suffix(".counts.json").write_text(json.dumps(counts, sort_keys=True) + "\n")
