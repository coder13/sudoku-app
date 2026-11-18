"""Run four rounds of model-guided clue edits on classic, Killer and X populations."""
from collections import Counter, defaultdict
import gzip
import json
from pathlib import Path
import random
import sys

from edition import FAMILIES, RESEARCH, annotate, priors
from model import PathModel, split_records
from pool import EDGES, LEVELS, ROOT, Engine, definition, edit_mask, fingerprint, seed_for

ROUNDS = 4
ANCHORS = ["beginner-0-60", "easy-0-60", "medium-64-180", "tricky-0-90", "hard-0-140",
           "very-hard-0-130", "expert-0-130", "master-0-110", "edits-0-1450", "x-0-440",
           "killer-0-850", "graded-hard-330-1300", "graded-master-330-650", "graded-very-hard-370-1700"]


def connected(group):
    seen = {min(group)}
    queue = list(seen)
    for i in queue:
        for a, b in EDGES:
            j = b if a == i else a if b == i else -1
            if j in group and j not in seen:
                seen.add(j)
                queue.append(j)
    return len(seen) == len(group)


def mutate_cage(row, rng):
    groups = [set(c["cells"]) for c in row["puzzle"]["rules"][0]["cages"]]
    owner = {i: n for n, group in enumerate(groups) for i in group}
    moves = [(a, b) for x, y in EDGES for a, b in ((x, y), (y, x)) if owner[a] != owner[b]]
    rng.shuffle(moves)
    solution = row["solution"]
    for a, b in moves:
        donor, receiver = groups[owner[a]], groups[owner[b]]
        if len(donor) <= 1 or len(receiver) >= 5 or any(solution[a] == solution[i] for i in receiver):
            continue
        if not connected(donor - {a}):
            continue
        donor.remove(a)
        receiver.add(a)
        cages = [{"cells": sorted(g), "sum": sum(int(solution[i]) for i in g)} for g in groups]
        return definition("0" * 81, [{"type": "killer-cages", "coverGrid": True, "cages": cages}])


def guided(directory, research=RESEARCH):
    model = PathModel(json.loads((research / "model.json").read_text()))
    with gzip.open(research / "reference-traces.jsonl.gz", "rt") as file:
        train = split_records([json.loads(line) for line in file])["train"]
    for r in train:
        annotate(model, r, r["paths"])
    selectable = json.loads((ROOT / "src/sudoku/variant-seeds.json").read_text())
    groups = [(family, tier) for family, (_, variant) in FAMILIES.items() for tier in LEVELS
              if family == "classic" or tier in selectable[variant]]
    styles = {g: priors(model, train, *g)[0] for g in groups}
    pool = defaultdict(list)
    def rank(row):
        first = {"tier": row["difficulty"], "events": row["events"]}
        summary = dict(family=row["family"])
        annotate(model, summary, [first])
        return styles[row["family"], row["difficulty"]].distance(summary)
    for name in ANCHORS:
        path = directory / (name + ".jsonl")
        if not path.with_suffix(".counts.json").exists():
            raise ValueError(f"Complete anchor stream {name} first")
        for row in map(json.loads, path.open()):
            group = row["family"], row["difficulty"]
            if group in styles and (group[0] != "killer" or row["puzzle"]["givens"] == "0" * 81):
                row["loss"] = rank(row)
                pool[group].append(row)
    def parents(rows):
        unique = {}
        for r in sorted(rows, key=lambda x: (x["loss"], x["key"])):
            unique.setdefault(r["parent"], r)
        return list(unique.values())[:3]
    elite = {g: parents(pool[g]) for g in groups}
    before = {g: min((r["loss"] for r in elite[g]), default=None) for g in groups}
    path = directory / "guided-editions.jsonl"
    engine, stats, history, index = Engine(), Counter(), [], 0
    with path.open("w") as out:
        for gen in range(ROUNDS):
            accepted = 0
            for family, tier in groups:
                g = family, tier
                children = []
                for parent in elite[g]:
                    for child in range(3):
                        index += 1
                        seed = seed_for(f"Sinclair/guided/{gen}/{family}/{tier}/{parent['key']}/{child}")
                        rng = random.Random(seed)
                        p = parent["puzzle"]
                        if family == "killer":
                            new = mutate_cage(parent, rng)
                        else:
                            givens = edit_mask(p["givens"], parent["solution"], rng)
                            new = definition(givens, p.get("rules", []))
                            if family == "x" and engine.call("classic-unique", givens=givens):
                                new = None
                        if not new:
                            stats["miss"] += 1
                            continue
                        r = engine.call("trace", puzzle=new, budget=15_000)
                        if r["status"] != "solved":
                            stats[r["status"]] += 1
                            continue
                        stats[r["difficulty"]] += 1
                        r.update(key=fingerprint(r.pop("canonical")), family=family, parent=parent["parent"], puzzle=new,
                                 stream="guided", seed=seed, index=index, generation=gen + 1)
                        out.write(json.dumps(r, separators=(",", ":")) + "\n")
                        if r["difficulty"] == tier:
                            r["loss"] = rank(r)
                            children.append(r)
                            accepted += 1
                elite[g] = parents(elite[g] + children)
            history.append(dict(round=gen + 1, proposals=index, matchedChildren=accepted,
                                best={f + "/" + t: min((r["loss"] for r in elite[f, t]), default=None) for f, t in groups}))
            out.flush()
            print("Round", gen + 1, index, accepted, flush=True)
    engine.close()
    path.with_suffix(".counts.json").write_text(json.dumps(stats, sort_keys=True) + "\n")
    (research / "construction-rounds.json").write_text(json.dumps(dict(anchors=ANCHORS,
        initial={f + "/" + t: v for (f, t), v in before.items()}, rounds=history), separators=(",", ":")) + "\n")


if __name__ == "__main__":
    guided(Path(sys.argv[1]))
