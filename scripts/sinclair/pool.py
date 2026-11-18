"""Create independent, reproducible candidate streams. All working data stays in OUT."""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import random
import subprocess

ROOT = Path(__file__).resolve().parents[2]
LEVELS = "beginner easy medium tricky hard very-hard expert master extreme impossible".split()
X_RULES = [{"type": "diagonal", "diagonal": axis} for axis in ("main", "anti")]
CELLS = list(range(81))
EDGES = [(a, b) for a in CELLS for b in (a + 1, a + 9)
         if b < 81 and (b == a + 9 or a // 9 == b // 9)]


class Engine:
    def __init__(self):
        self.process = subprocess.Popen([ROOT / "target/release/examples/sinclair"], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, text=True, encoding="utf-8")

    def call(self, op, **args):
        self.process.stdin.write(json.dumps({"op": op, **args}) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError(f"Engine exited during {op}: {self.process.wait()}")
        return json.loads(line)

    def close(self):
        self.process.stdin.close()
        if self.process.wait():
            raise RuntimeError("Engine exited unsuccessfully")


def seed_for(key):
    return int.from_bytes(sha256(key.encode()).digest()[:4], "big")


def definition(givens, rules=()):
    return {"version": 1, "givens": givens, **({"rules": list(rules)} if rules else {})}


def cages(solution, rng):
    # Contract adjacent pieces on a fresh completion. A short-cage edition has more
    # immediate arithmetic; larger pieces and fewer singletons allow longer discoveries.
    groups = [{i} for i in CELLS]
    owner = list(CELLS)
    limit = rng.choice([3, 4, 4, 5])
    target = rng.randrange(22, 39)
    for _ in range(81 - target):
        moves = set()
        for a, b in EDGES:
            left, right = sorted((owner[a], owner[b]))
            if left == right or len(groups[left]) + len(groups[right]) > limit:
                continue
            union = groups[left] | groups[right]
            if len({solution[i] for i in union}) == len(union):
                moves.add((left, right))
        if not moves:
            break
        pairs = sorted(moves)
        weights = [4 if min(len(groups[l]), len(groups[r])) == 1 else 1 for l, r in pairs]
        left, right = rng.choices(pairs, weights=weights)[0]
        for cell in groups[right]:
            owner[cell] = left
        groups[left].update(groups[right])
        groups[right].clear()
    return [{"sum": sum(int(solution[i]) for i in group), "cells": sorted(group)}
            for group in groups if group]


def edit_mask(base, solution, rng):
    # Add and exchange real givens before regrading. A later canonical check rejects
    # equivalence to any source or shipped template.
    board = list(base)
    add = rng.choices([1, 2, 3, 4, 5], weights=[6, 5, 3, 2, 1])[0]
    drop = rng.choice([0, 1, 1, 2, 2, 3, 4])
    for cell in rng.sample([i for i in CELLS if base[i] == "0"], add):
        board[cell] = solution[cell]
    for cell in rng.sample([i for i in CELLS if base[i] != "0"], drop):
        board[cell] = "0"
    return "".join(board)


def split_givens(puzzle, solution):
    """Express fixed digits as singleton sums. Regrade after any cage is split."""
    groups = []
    for cage in puzzle["rules"][0]["cages"]:
        remainder = set()
        for cell in cage["cells"]:
            if puzzle["givens"][cell] != "0":
                groups.append([cell])
            else:
                remainder.add(cell)
        while remainder:
            queue = [min(remainder)]
            remainder.remove(queue[0])
            for cell in queue:
                for a, b in EDGES:
                    neighbor = b if a == cell else a if b == cell else -1
                    if neighbor in remainder:
                        queue.append(neighbor)
                        remainder.remove(neighbor)
            groups.append(sorted(queue))
    rule = {"type": "killer-cages", "coverGrid": True, "cages": [
        {"cells": cells, "sum": sum(int(solution[i]) for i in cells)} for cells in groups]}
    return definition("0" * 81, [rule])


def propose(engine, stream, index, seed, bank):
    rng = random.Random(seed)
    if stream in LEVELS:
        givens = engine.call("classic", tier=stream, seed=seed, attempts=6)
        return ("classic", f"fresh-{seed}", definition(givens)) if givens else None
    if stream == "edits":
        parent = rng.randrange(len(bank))
        base = bank[parent]
        solution = engine.call("solve", givens=base)
        return "classic", f"bank-{parent}", definition(edit_mask(base, solution, rng))
    if stream == "x":
        solution = engine.call("solution", family="x", seed=seed)
        if not solution:
            return None
        order = CELLS.copy()
        rng.shuffle(order)
        givens = engine.call("carve-x", solution=solution, order=order, limit=rng.choice([17, 17, 18, 20, 22, 24, 27, 30]))
        if engine.call("classic-unique", givens=givens):
            return None
        return "x", f"fresh-{seed}", definition(givens, X_RULES)
    if stream == "killer":
        solution = engine.call("solution", family="classic", seed=seed)
        rule = {"type": "killer-cages", "cages": cages(solution, rng), "coverGrid": True}
        return "killer", f"fresh-{seed}", definition("0" * 81, [rule])
    if stream.startswith("graded-"):
        tier = stream.removeprefix("graded-")
        sizes = [2] * 8 + [3] * 7 + [4] * 6 + [5] * 4
        built = engine.call("graded-killer", tier=tier, seed=seed, sizes=sizes)
        if built:
            return "killer", f"fresh-{seed}", built["puzzle"]
        return None
    raise ValueError(stream)


def fingerprint(key):
    return sha256(json.dumps(key, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path)
    parser.add_argument("stream", choices=LEVELS + ["edits", "killer", "x", "graded-hard", "graded-very-hard", "graded-master"])
    parser.add_argument("start", type=int)
    parser.add_argument("count", type=int)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out / f"{args.stream}-{args.start}-{args.count}.jsonl"
    bank = (ROOT / "crates/engine/data/impossible.txt").read_text().splitlines()
    stats = Counter()
    engine = Engine()
    with path.open("w") as output:
        for i in range(args.start, args.start + args.count):
            seed = seed_for(f"Sinclair/1/{args.stream}/{i}")
            proposal = propose(engine, args.stream, i, seed, bank)
            if proposal:
                family, parent, puzzle = proposal
                result = engine.call("trace", puzzle=puzzle, budget=15_000 if args.stream.startswith("graded-") else 6000)
                status = result["status"]
                if status == "solved":
                    result["key"] = fingerprint(result.pop("canonical"))
                    row = dict(result, family=family, parent=parent, puzzle=puzzle, seed=seed,
                               stream=args.stream, index=i)
                    output.write(json.dumps(row, separators=(",", ":")) + "\n")
                    if args.stream.startswith("graded-"):
                        blank = split_givens(puzzle, result["solution"])
                        converted = engine.call("trace", puzzle=blank, budget=15_000)
                        if converted["status"] == "solved":
                            converted["key"] = fingerprint(converted.pop("canonical"))
                            other = dict(row, **converted, puzzle=blank)
                            output.write(json.dumps(other, separators=(",", ":")) + "\n")
                    output.flush()
                    status = result["difficulty"]
            else:
                status = "miss"
            stats[status] += 1
            if (i - args.start + 1) % 100 == 0:
                print(args.stream, i, dict(stats), flush=True)
    engine.close()
    path.with_suffix(".counts.json").write_text(json.dumps(stats, sort_keys=True) + "\n")
    print(args.stream, args.count, dict(stats), flush=True)


if __name__ == "__main__":
    main()
