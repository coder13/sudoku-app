"""Learn a backoff sequence model and a player-replay regression from solve paths."""
import argparse
from collections import Counter, defaultdict
import gzip
import json
from pathlib import Path

import numpy as np

from pool import LEVELS

VOCAB = ["full-house", "box-single", "hidden-single", "cell-single", "diagonal", "cage", "house-sum",
         "intersection", "subset", "fish", "wing", "chain", "uniqueness", "forcing", "overlay", "other"]
INDEX = {name: i for i, name in enumerate(VOCAB)}
OUTPUTS = ["consecutive placements sharing a house", "consecutive placements repeating a digit",
           "pencil-mark share", "opening pencil-mark share"]
ROUNDS = 100


def symbol(event):
    technique, scope, _, _, _ = event
    if scope == "diagonal": return "diagonal"
    if technique == "full-house": return "full-house"
    if technique == "hidden-single-box": return "box-single"
    if technique == "hidden-single": return "hidden-single"
    if technique == "naked-single": return "cell-single"
    if technique == "cage-house-sum": return "house-sum"
    if technique == "cage-combinations": return "cage"
    if technique in ("locked-candidates", "pointing", "claiming"): return "intersection"
    if any(s in technique for s in ("forcing", "exocet")): return "forcing"
    if "overlay" in technique: return "overlay"
    if any(s in technique for s in ("fish", "x-wing")): return "fish"
    if any(s in technique for s in ("pair", "triple", "quadruple")): return "subset"
    if any(s in technique for s in ("rectangle", "unique-loop", "bug-plus")): return "uniqueness"
    if any(s in technique for s in ("chain", "aic", "loop", "color", "medusa", "als-")): return "chain"
    if any(s in technique for s in ("wing", "kite", "skyscraper")): return "wing"
    return "other"


def band(tier):
    return min(3, LEVELS.index(tier) // 2)


def stream(family, tier, events):
    prev, last = "^", "^"
    placements = sum(e[2] for e in events)
    filled = 0
    for event in events:
        phase = min(3, filled * 4 // max(1, placements))
        token = symbol(event)
        contexts = ("*", family, f"{family}/{band(tier)}/{phase}", f"{family}/{phase}/{last}",
                    f"{last}/{phase}", f"{family}/{prev}/{last}")
        yield contexts, INDEX[token]
        prev, last = last, token
        filled += event[2]


def features(family, tier, events):
    # All inputs summarize a player-visible logical path. Digits, cell addresses,
    # givens, cage geometry, puzzle IDs and source identity are absent.
    n = len(events)
    count = Counter(symbol(e) for e in events)
    values = [int(family == "killer"), int(family == "x"), LEVELS.index(tier) / 9,
              np.log1p(n) / 5, np.log1p(len(count)) / 3]
    values.extend(count[t] / n for t in VOCAB)
    prev = None
    quarters = [[] for _ in range(4)]
    total = sum(e[2] for e in events)
    filled = 0
    for e in events:
        t = symbol(e)
        quarters[min(3, 4 * filled // max(1, total))].append(
            [float(e[2] > 0), min(e[3], 15) / 15, float(e[4]), float(prev == t)])
        filled += e[2]
        prev = t
    for phase in quarters:
        values.extend(np.mean(phase, axis=0).tolist() if phase else [0.] * 4)
    return np.array(values, dtype=float)


def split_records(rows):
    controls = {r["group"] for r in rows if r["source"] in ("wpf-test", "exchange-control")}
    by = defaultdict(list)
    for row in rows:
        src = row["source"]
        if src in ("wpf-test", "exchange-control"):
            by[src].append(row)
        elif row["group"] not in controls:
            bucket = int(row["group"][:8], 16) % 100
            by["train" if bucket < 70 else "validation" if bucket < 85 else "test"].append(row)
    return by


def component_counts(rows):
    tables = [defaultdict(Counter) for _ in range(6)]
    for r in rows:
        for p in r["paths"]:
            for keys, tok in stream(r["family"], p["tier"], p["events"]):
                for t, key in zip(tables, keys):
                    t[key][tok] += 1 / len(r["paths"])
    return [{k: {str(i): v for i, v in freq.items()} for k, freq in t.items()} for t in tables]


class PathModel:
    def __init__(self, data):
        self.data = data
        self.w = np.array(data["weights"])
        self.probs = []
        for j, table in enumerate(data["counts"]):
            result = {}
            for key, sparse in table.items():
                mass = np.array([sparse.get(str(i), 0.) for i in range(len(VOCAB))])
                prior = self.base if j else np.ones(len(VOCAB)) / len(VOCAB)
                strength = 10 if j else 4
                result[key] = (mass + strength * prior) / (mass.sum() + strength)
            self.probs.append(result)
            if not j:
                self.base = result["*"]

    def matrix(self, family, tier, events):
        return np.array([[table.get(key, self.base)[token] for table, key in zip(self.probs, keys)]
                         for keys, token in stream(family, tier, events)])

    def score(self, family, tier, events):
        return float(-np.log2(self.matrix(family, tier, events) @ self.w).mean())

    def human(self, vector, family):
        head = self.data["replay"]
        z = (vector - head["center"]) / head["scale"]
        pred = np.clip(np.array(head["offset"]) + z @ np.array(head["coefficients"]), 0, 1)
        return np.where(head["enabled"], pred, head["familyMeans"][family])


def sample_matrix(model, rows):
    matrices, weights = [], []
    for r in rows:
        for p in r["paths"]:
            m = model.matrix(r["family"], p["tier"], p["events"])
            matrices.append(m)
            weights.extend([1 / (len(r["paths"]) * len(m))] * len(m))
    return np.vstack(matrices), np.array(weights) / len(rows)


def length(matrix, mass, w):
    return float(-mass @ np.log2(matrix @ w))


def fit_replay(split):
    def dataset(rows):
        rows = [r for r in rows if r.get("human")]
        x = np.array([np.mean([features(r["family"], p["tier"], p["events"]) for p in r["paths"]], axis=0) for r in rows])
        return x, np.array([r["human"] for r in rows]), [r["family"] for r in rows]
    x, y, fam = dataset(split["train"])
    vx, vy, vf = dataset(split["validation"])
    center, scale, offset = x.mean(axis=0), np.maximum(x.std(axis=0), .075), y.mean(axis=0)
    means = {f: y[np.array(fam) == f].mean(axis=0) for f in set(fam)}
    def baseline(families):
        return np.array([means[f] for f in families])
    z, vz = (x - center) / scale, (vx - center) / scale
    w = np.zeros((z.shape[1], y.shape[1]))
    step = .9 / (np.linalg.norm(z, ord=2) ** 2 / len(z) + .1)
    best, log = None, []
    for epoch in range(1, ROUNDS + 1):
        w -= step * (z.T @ (z @ w + offset - y) / len(z) + .1 * w)
        val = np.abs(np.clip(vz @ w + offset, 0, 1) - vy).mean(axis=0)
        log.append([epoch, float(val.mean())])
        if best is None or val.mean() < best[0]:
            best = (float(val.mean()), epoch, w.copy(), val)
    _, epoch, w, val = best
    enabled = val < np.abs(baseline(vf) - vy).mean(axis=0)
    stats = {}
    for name in ("train", "validation", "test"):
        xx, yy, ff = dataset(split[name])
        pred = np.clip((xx - center) / scale @ w + offset, 0, 1)
        ref = baseline(ff)
        stats[name] = dict(n=len(xx), baselineMae=np.abs(ref - yy).mean(axis=0).tolist(),
                           modelMae=np.abs(np.where(enabled, pred, ref) - yy).mean(axis=0).tolist())
    head = dict(center=center.tolist(), scale=scale.tolist(), offset=offset.tolist(), coefficients=w.tolist(),
                enabled=enabled.tolist(), familyMeans={f: m.tolist() for f, m in means.items()})
    return head, dict(outputs=OUTPUTS, chosenRound=epoch, validationHistory=log, metrics=stats)


def train(corpus, directory):
    with gzip.open(corpus, "rt") as file:
        rows = [json.loads(line) for line in file]
    split = split_records(rows)
    data = dict(version=1, vocabulary=VOCAB, weights=[1 / 6] * 6, counts=component_counts(split["train"]))
    model = PathModel(data)
    matrices = {group: sample_matrix(model, items) for group, items in split.items()}
    train_mat, mass = matrices["train"]
    weights = model.w.copy()
    best, log = None, []
    for epoch in range(1, ROUNDS + 1):
        responsibilities = train_mat * weights / (train_mat @ weights)[:, None]
        weights = mass @ responsibilities
        # A weak uniform prior prevents abrupt loss of backoff components.
        weights = (weights + .0005) / (weights.sum() + len(weights) * .0005)
        val = length(*matrices["validation"], weights)
        log.append([epoch, length(train_mat, mass, weights), val])
        if best is None or val < best[0]:
            best = (val, epoch, weights.copy())
    _, epoch, weights = best
    data["weights"] = weights.tolist()
    data["replay"], replay_stats = fit_replay(split)
    report = dict(rounds=ROUNDS, chosenRound=epoch, history=log, replay=replay_stats, splits={})
    for name, (matrix, mass) in matrices.items():
        items = split[name]
        report["splits"][name] = dict(puzzles=len(items), paths=sum(len(r["paths"]) for r in items),
            events=len(matrix), families=dict(Counter(r["family"] for r in items)),
            unigramBits=length(matrix, mass, np.eye(6)[0]), previousFamilyPhaseBits=length(matrix, mass, np.eye(6)[3]),
            bits=length(matrix, mass, weights))
    for name, obj in [("model.json", data), ("training.json", report)]:
        (directory / name).write_text(json.dumps(obj, sort_keys=True, separators=(",", ":")) + "\n")
    print(json.dumps(report["splits"], indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("corpus", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    train(args.corpus, args.output)
