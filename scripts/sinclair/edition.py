"""Select ten checked, distinct solve paths per selectable level and export static puzzles."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import csv
from hashlib import sha256
import gzip
import json
from pathlib import Path

import numpy as np

from model import PathModel, band, features, split_records
from pool import Engine, LEVELS, ROOT, fingerprint, seed_for
from references import shape_key, transform

FAMILIES = {"classic": ("C", "classic"), "killer": ("K", "killer-cages"), "x": ("X", "diagonal")}
CATALOG = ROOT / "src/sudoku/collections"
RESEARCH = ROOT / "docs/research/sinclair"


def summary(model, family, path):
    vec = features(family, path["tier"], path["events"])
    return vec, model.score(family, path["tier"], path["events"]), model.human(vec, family)


class Style:
    def __init__(self, rows):
        bits = [r["bits"] for r in rows]
        self.bits = np.median(bits)
        self.bits_scale = max(.3, np.subtract(*np.percentile(bits, [75, 25])) / 1.35)
        players = np.array([r["human"] for r in rows if r.get("human")])
        if not len(players):
            players = np.array([r["prediction"] for r in rows])
        self.player_center = np.median(players, axis=0)
        self.player_scale = np.maximum(.08, players.std(axis=0))
        vectors = np.array([r["vector"][3:] for r in rows])
        self.center = np.median(vectors, axis=0)
        self.scale = np.maximum(vectors.std(axis=0), .09)

    def distance(self, row):
        bits = abs(row["bits"] - self.bits) / self.bits_scale
        walk = np.abs((row["prediction"] - self.player_center) / self.player_scale).mean()
        path = np.minimum(np.abs((row["vector"][3:] - self.center) / self.scale), 4).mean()
        return float(.45 * min(bits, 5) + .30 * walk + .25 * path)

    def difference(self, a, b):
        return float(np.minimum(np.abs(a["vector"][3:] - b["vector"][3:]) / self.scale, 3).mean())


def priors(model, training, family, tier):
    relevant = [r for r in training if r["family"] == family]
    exact = [r for r in relevant if r["paths"][0]["tier"] == tier]
    same_band = [r for r in relevant if band(r["paths"][0]["tier"]) == band(tier)]
    sample, label = (exact, "tier") if len(exact) >= 12 else (same_band, "band") if len(same_band) >= 12 else (relevant, "family")
    return Style(sample), dict(scope=label, references=len(sample), exactTierExamples=len(exact))


def annotate(model, row, paths):
    parts = [summary(model, row["family"], path) for path in paths]
    row["vector"], row["bits"], row["prediction"] = (np.mean(part, axis=0) for part in zip(*parts))


def read_candidates(directory, refs):
    datasets = json.loads((ROOT / "src/sudoku/variant-seeds.json").read_text())
    tiers = {f: [t for t in LEVELS if f == "classic" or t in datasets[variant]] for f, (_, variant) in FAMILIES.items()}
    excluded = {r["key"] for r in refs}
    groups = {r["group"] for r in refs}
    # The app's Impossible bank is already in canonical form.
    bank = (ROOT / "crates/engine/data/impossible.txt").read_text().splitlines()
    excluded.update(map(fingerprint, bank))
    groups.update(fingerprint("".join("1" if c != "0" else c for c in b)) for b in bank)
    e = Engine()
    # Cross-check additional shipped source collections under the same equivalences.
    for name in ("nikoli-100", "sudoku-exchange", "janko-killer"):
        for r in json.loads((CATALOG / (name + ".json")).read_text()):
            p = r.get("puzzle", {"version": 1, "givens": r["givens"]})
            k = e.call("trace", puzzle=p)["canonical"] if p.get("rules") else e.call("key", givens=p["givens"])
            excluded.add(fingerprint(k))
            groups.add(shape_key(p, k))
    eligible = defaultdict(list)
    stats = Counter()
    for file in sorted(directory.glob("*.jsonl")):
        if not file.with_suffix(".counts.json").exists():
            raise ValueError(f"Proposal stream is still incomplete: {file.name}")
        for line in file.open():
            r = json.loads(line)
            f, tier = r["family"], r["difficulty"]
            stats["completePaths"] += 1
            if tier not in tiers[f] or (f == "killer" and r["puzzle"]["givens"] != "0" * 81):
                continue
            if r["key"] in excluded:
                continue
            excluded.add(r["key"])
            p = r["puzzle"]
            canonical = e.call("key", givens=p["givens"]) if f == "classic" else None
            if f == "classic" and fingerprint(canonical) != r["key"]:
                raise ValueError("Incompatible construction engine")
            r["shape"] = shape_key(p, canonical)
            if r["shape"] not in groups:
                eligible[f, tier].append(r)
    e.close()
    return eligible, tiers, stats


def alternate_paths(rows, work):
    cache = work / "alternate.jsonl"
    existing = {r["key"]: r for r in map(json.loads, cache.read_text().splitlines())} if cache.exists() else {}
    pending = [r for r in rows if r["key"] not in existing]
    def solve_chunk(chunk):
        e, output = Engine(), []
        for r in chunk:
            p = transform(r["puzzle"], 6)
            t = e.call("trace", puzzle=p)
            solved = t["status"] == "solved"
            if solved and t["solution"] != r["solution"][::-1]:
                raise ValueError("Half-turn changed solution")
            output.append(dict(key=r["key"], path={"tier": t["difficulty"], "events": t["events"]} if solved else None))
        e.close()
        return output
    with ThreadPoolExecutor(max_workers=3) as pool, cache.open("a") as file:
        for chunk in pool.map(solve_chunk, [pending[i::3] for i in range(3)]):
            for r in chunk:
                existing[r["key"]] = r
                file.write(json.dumps(r, separators=(",", ":")) + "\n")
    return existing


def pick(items, style, used_shapes, used_parents):
    remaining = [r for r in items if r["shape"] not in used_shapes and r["parent"] not in used_parents]
    choices = []
    for _ in range(10):
        if not remaining:
            raise ValueError("Insufficient independent shapes and construction lineages")
        def objective(r):
            diversity = min((style.difference(r, other) for other in choices), default=0.)
            return (r["distance"] - .40 * min(diversity, 1.), r["key"])
        best = min(remaining, key=objective)
        choices.append(best)
        remaining = [r for r in remaining if r["shape"] != best["shape"] and r["parent"] != best["parent"]]
    return choices


def select(pool, work, research, catalog):
    model = PathModel(json.loads((research / "model.json").read_text()))
    with gzip.open(research / "reference-traces.jsonl.gz", "rt") as file:
        refs = [json.loads(line) for line in file]
    training = split_records(refs)["train"]
    for r in training:
        annotate(model, r, r["paths"])
    candidates, tiers, counts = read_candidates(pool, refs)
    styles, reports, shortlists = {}, {}, {}
    for f in tiers:
        for tier in tiers[f]:
            group = f, tier
            items = candidates[group]
            fresh = [r for r in items if not r["parent"].startswith("bank-")]
            fresh_only = f == "classic" and len({r["parent"] for r in fresh}) >= 20
            if fresh_only:
                items = fresh
            style, prior = priors(model, training, f, tier)
            styles[group] = style
            for r in items:
                annotate(model, r, [dict(tier=tier, events=r["events"])])
                r["distance"] = style.distance(r)
            # Preserve a fixed random comparison sample independent of the model ranking.
            random_order = sorted(items, key=lambda r: (seed_for("control/" + r["key"]), r["key"]))
            base = []
            for r in random_order:
                if not any(r["parent"] == b["parent"] or r["shape"] == b["shape"] for b in base):
                    base.append(r)
                if len(base) == 16: break
            top = sorted(items, key=lambda r: (r["distance"], r["key"]))[:45]
            shortlists[group] = list({r["key"]: r for r in top + base}.values())
            reports[group] = dict(prior, eligible=len(items), freshOnly=fresh_only, baselineKeys=[r["key"] for r in base])
    all_rows = [r for rows in shortlists.values() for r in rows]
    paths = alternate_paths(all_rows, work)
    for group, items in shortlists.items():
        ok = []
        for r in items:
            alt = paths[r["key"]]["path"]
            if alt:
                annotate(model, r, [dict(tier=r["difficulty"], events=r["events"]), alt])
                r["altTier"] = alt["tier"]
                r["distance"] = styles[group].distance(r)
                ok.append(r)
        shortlists[group] = ok
    used, parents, selected = set(), set(), {}
    # Fill the scarcest groups first, reserving each clue shape and solution lineage once.
    for group in sorted(shortlists, key=lambda k: (len(shortlists[k]), k)):
        items = shortlists[group]
        chosen = pick(items, styles[group], used, parents)
        used.update(r["shape"] for r in chosen)
        parents.update(r["parent"] for r in chosen)
        selected[group] = sorted(chosen, key=lambda r: seed_for("order/" + r["key"]))
        report = reports[group]
        keys = report.pop("baselineKeys")
        lookup = {r["key"]: r for r in items}
        baseline = [lookup[k] for k in keys if k in lookup][:10]
        report.update(twoPaths=len(items), baselineCount=len(baseline), chosenDistance=float(np.mean([r["distance"] for r in chosen])),
                      baselineDistance=float(np.mean([r["distance"] for r in baseline])))
    # Candidate caches belong to the original search. Publish the verified grades
    # with the current engine's scoring version, including when a cache predates it.
    engine = Engine()
    try:
        for chosen in selected.values():
            for row in chosen:
                rating = engine.call("trace", puzzle=row["puzzle"])
                if any(rating.get(k) != row[k] for k in ("difficulty", "points", "hardestTechnique")):
                    raise ValueError(f"Published grade changed for {row['key']}")
                row["scoringVersion"] = rating["scoringVersion"]
    finally:
        engine.close()
    audit, feedback = [], []
    for family, (prefix, _) in FAMILIES.items():
        output = []
        for tier in tiers[family]:
            for r in selected[family, tier]:
                code = f"{prefix}{len(output)+1:03d}"
                p = dict(r["puzzle"])
                if p.get("regions") == {"type": "boxes"}:
                    p.pop("regions")
                record = dict(id=code.lower(), title="Sinclair " + code, givens=p["givens"], difficulty=tier,
                              points=r["points"], hardestTechnique=r["hardestTechnique"], scoringVersion=r["scoringVersion"])
                if family != "classic":
                    record["puzzle"] = p
                output.append(record)
                feedback.append([code, family, tier, "", "", ""])
                audit.append(dict(id=code, family=family, tier=tier, alternateTier=r["altTier"], parent=r["parent"],
                                  stream=r["stream"], index=r["index"], seed=r["seed"], key=r["key"], shape=r["shape"],
                                  solutionSha256=sha256(r["solution"].encode()).hexdigest(), steps=len(r["events"]),
                                  bits=round(r["bits"], 5), distance=round(r["distance"], 5)))
        lines = [json.dumps(r, separators=(",", ":")) for r in output]
        (catalog / f"sinclair-{family}.json").write_text("[\n  " + ",\n  ".join(lines) + "\n]\n")
    with (research / "playtest.csv").open("w", newline="") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(["puzzle", "variant", "app_difficulty", "enjoyment_1_to_5", "felt_difficulty", "comment"])
        writer.writerows(feedback)
    evidence = dict(counts=counts, groups={f"{f}/{t}": v for (f, t), v in sorted(reports.items())}, puzzles=audit,
                    proposalStreams={p.name: json.loads(p.read_text()) for p in sorted(pool.glob("*.counts.json"))},
                    poolSha256={p.name: sha256(p.read_bytes()).hexdigest() for p in sorted(pool.glob("*.jsonl"))})
    (research / "selection.json").write_text(json.dumps(evidence, separators=(",", ":")) + "\n")
    print("Selected", len(audit), "puzzles")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pool", type=Path)
    parser.add_argument("work", type=Path)
    parser.add_argument("--research", type=Path, default=RESEARCH)
    parser.add_argument("--catalog", type=Path, default=CATALOG)
    args = parser.parse_args()
    select(args.pool, args.work, args.research, args.catalog)
