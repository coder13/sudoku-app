"""Compare the released edition with five normal ten-game libraries per variant and tier."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import csv
import gzip
from hashlib import sha256
import json
from pathlib import Path
from statistics import mean
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from edition import CATALOG, FAMILIES, RESEARCH, annotate, priors
from model import PathModel, split_records
from pool import Engine, LEVELS, definition, fingerprint
from references import shape_key, transform
from measure import completed_board_key, layout, pacing

METRICS = """givens fixed singleton_cages simple_opening opening cages cage_shapes paired_joins
paired_givens perfect_symmetry excess_symmetry steps elimination_steps elimination_actions
distinct_techniques opening_gap longest_gap mid_release release5 finish finish_fraction
cage_steps house45_steps diagonal_steps forcing_steps rule_essential points reference_distance""".split()
PATH = "steps elimination_steps distinct_techniques opening_gap longest_gap mid_release release5 finish diagonal_steps house45_steps".split()


def compressed(path, value):
    with path.open("wb") as file, gzip.GzipFile(filename="", mode="wb", fileobj=file, mtime=0) as gz:
        gz.write(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def write_results(output, report):
    (output / "results.json").write_text(json.dumps(report, sort_keys=True, separators=(",", ":")) + "\n")


def published_rows(family, ledger):
    rows = []
    for r in json.loads((CATALOG / f"sinclair-{family}.json").read_text()):
        code = r["id"].upper()
        record = ledger[code]
        assert (record["family"], record["tier"]) == (family, r["difficulty"])
        rows.append(dict(id=code, family=family, tier=r["difficulty"], arm="sinclair", points=r["points"],
                         expected=record, puzzle=r.get("puzzle", definition(r["givens"]))))
    return rows


def read_sample(location, output):
    if location.is_dir():
        data = {f.stem: json.loads(f.read_text()) for f in sorted(location.glob("*.json"))}
        compressed(output / "normal-draws.json.gz", data)
    else:
        with gzip.open(location, "rt") as file:
            data = json.load(file)
    return data


def measure_group(rows, style, model):
    engine, cache, output = Engine(), {}, []
    try:
        for source in rows:
            family, tier, p = source["family"], source["tier"], source["puzzle"]
            exact = fingerprint(p)
            if exact not in cache:
                a = engine.call("trace", puzzle=p)
                if a["status"] != "solved":
                    raise ValueError(f"Starting puzzle did not solve: {source['id']}, {a['status']}")
                b = engine.call("trace", puzzle=transform(p, 6))
                shape = shape_key(p, a["canonical"])
                events = a["events"]
                empty = p["givens"].count("0")
                geometry = layout(p, family, a["solution"])
                if family != "classic":
                    geometry["rule_essential"] = int(not engine.call("classic-unique", givens=p["givens"]))
                measures = pacing(events, empty)
                alt = None
                distance = None
                if b["status"] == "solved":
                    assert a["solution"][::-1] == b["solution"]
                    alt = pacing(b["events"], empty)
                    feature = dict(family=family)
                    annotate(model, feature, [{"tier": t["difficulty"], "events": t["events"]} for t in (a, b)])
                    distance = style.distance(feature)
                cache[exact] = dict(**geometry, **measures, exact=exact, key=fingerprint(a["canonical"]), shape=shape,
                    answer_key=fingerprint(completed_board_key(a["solution"], family)),
                    solution_hash=sha256(a["solution"].encode()).hexdigest(), reference_distance=distance, points=a["points"],
                    hardest=a["hardestTechnique"], grade=a["difficulty"], alternate=b.get("difficulty", b["status"]),
                    alternate_metrics=alt, steps_signature=fingerprint([e[0] for e in events]),
                    signature_sequence="".join("P" if e[2] else "E" for e in events))
            m = cache[exact]
            assert (m["grade"], m["points"]) == (tier, source["points"]), source["id"]
            if "expected" in source:
                expected = source["expected"]
                assert (m["key"], m["shape"], m["solution_hash"]) == (expected["key"], expected["shape"], expected["solutionSha256"])
                assert abs(m["reference_distance"] - expected["distance"]) < .000006
            output.append({**{k: v for k, v in source.items() if k not in ("expected", "puzzle")}, **m})
    finally:
        engine.close()
    return output


def metric_mean(rows, metric):
    values = [r[metric] for r in rows if r.get(metric) is not None]
    return mean(values) if values else None


def averages(rows, metrics=METRICS):
    return {k: v for k in metrics if (v := metric_mean(rows, k)) is not None}


def distribution(rows):
    by_key = defaultdict(list)
    for r in rows:
        by_key[r["key"]].append(r)
    return dict(n=len(rows), distinct=len(by_key), shapes=len({r["shape"] for r in rows}),
                printed=len({r["exact"] for r in rows}), answerForms=len({r["answer_key"] for r in rows}),
                fallback=(sum(r["sourceSeed"] != r["seed"] for r in rows)
                          if rows[0]["arm"] == "normal" and rows[0]["family"] != "classic" else None),
                altSolved=sum(r["alternate_metrics"] is not None for r in rows),
                altSameGrade=sum(r["alternate"] == r["tier"] for r in rows),
                techniques=dict(Counter(r["hardest"] for r in rows)),
                mean=averages(rows), distinctMean=averages([averages(copies) for copies in by_key.values()]),
                otherOrder=averages([r["alternate_metrics"] for r in rows if r["alternate_metrics"] is not None], PATH))


def summarize(rows):
    groups = defaultdict(list)
    for r in rows:
        groups[r["family"], r["tier"]].append(r)
    report = {}
    for (f, t), group in groups.items():
        si = [r for r in group if r["arm"] == "sinclair"]
        normal = [r for r in group if r["arm"] == "normal"]
        assert len(si) == 10 and len(normal) == 50
        rooms = []
        for i in range(1, 6):
            draws = [r for r in normal if r["room"] == i]
            assert sorted(r["slot"] for r in draws) == list(range(1, 11))
            rooms.append(dict(mean=averages(draws), distinct=len({r["key"] for r in draws}),
                              shapes=len({r["shape"] for r in draws}), hardest=len({r["hardest"] for r in draws})))
        report[f + "/" + t] = {"sinclair": distribution(si), "normal": distribution(normal), "rooms": rooms}
    return report


def per_puzzle_csv(file, rows):
    metrics = ["givens", "fixed", "opening", "elimination_steps", "longest_gap", "mid_release", "finish",
               "diagonal_steps", "house45_steps", "reference_distance"]
    normal = defaultdict(list)
    for r in rows:
        if r["arm"] == "normal":
            normal[r["family"], r["tier"]].append(r)
    with file.open("w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["puzzle", "family", "tier", "hardest_technique"] +
                   [label for m in metrics for label in (m, "normal_mean_" + m)])
        for r in sorted((r for r in rows if r["arm"] == "sinclair"), key=lambda r: r["id"]):
            ref = normal[r["family"], r["tier"]]
            values = [v for m in metrics for v in (r[m], metric_mean(ref, m))]
            w.writerow([r["id"], r["family"], r["tier"], r["hardest"]] +
                       [round(v, 3) if v is not None else "" for v in values])


def run(location, output, jobs):
    output.mkdir(parents=True, exist_ok=True)
    sample = read_sample(location, output)
    builds = {v["wasmSha256"] for v in sample.values()}
    assert len(builds) == 1
    with gzip.open(RESEARCH / "reference-traces.jsonl.gz", "rt") as f:
        train = split_records([json.loads(l) for l in f])["train"]
    model = PathModel(json.loads((RESEARCH / "model.json").read_text()))
    for r in train:
        annotate(model, r, r["paths"])
    selection = json.loads((RESEARCH / "selection.json").read_text())
    ledger = {r["id"]: r for r in selection["puzzles"]}
    batches = []
    for family in FAMILIES:
        released = published_rows(family, ledger)
        for tier in LEVELS:
            si = [r for r in released if r["tier"] == tier]
            if not si: continue
            block = sample[family + "-" + tier]
            normal = [dict(r, arm="normal") for r in block["rows"]]
            assert all((r["family"], r["tier"]) == (family, tier) for r in normal)
            batches.append((si + normal, priors(model, train, family, tier)[0], model))
    assert len(batches) == len(sample) == 23
    with ThreadPoolExecutor(max_workers=jobs) as workers:
        rows = [r for group in workers.map(lambda args: measure_group(*args), batches) for r in group]
    assert len(rows) == len({r["id"] for r in rows}) == 1380
    groups = summarize(rows)
    # Independent, visible construction benchmark, measured from the local Nikoli release.
    nikoli = json.loads((CATALOG / "nikoli-100.json").read_text())
    nikoli_sym = sum(all((x == "0") == (y == "0") for x,y in zip(r["givens"], r["givens"][::-1])) for r in nikoli)
    report = dict(wasmSha256=next(iter(builds)), failures={k: v["failed"] for k,v in sample.items() if v["failed"]},
                  nikoli=dict(n=len(nikoli), halfTurnMasks=nikoli_sym), groups=groups)
    write_results(output, report)
    compressed(output / "measurements.json.gz", rows)
    per_puzzle_csv(output / "by-puzzle.csv", rows)
    print(len(rows), "verified puzzles measured across", len(groups), "matched levels")


if __name__ == "__main__":
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("normal", type=Path, help="Sampler output directory or the frozen normal-draws.json.gz")
    arguments.add_argument("--output", type=Path, default=RESEARCH / "comparison")
    arguments.add_argument("--jobs", type=int, default=3)
    args = arguments.parse_args()
    run(args.normal, args.output, args.jobs)
