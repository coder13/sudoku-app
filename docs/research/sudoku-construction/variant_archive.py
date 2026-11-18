"""Compare two precise opening proofs with a fixed sample of Otto Janko's credited puzzles.

Pass an HTML cache directory, the native sudoku-engine binary, and an output JSON path.
Missing source pages are downloaded from the publisher. Only aggregate results ship here.
"""

import hashlib
import itertools
import json
import re
import statistics
import subprocess
import sys
import urllib.request
from collections import Counter
from pathlib import Path
from study import ROWS, COLUMNS, BOXES, HOUSES


ROOT = "https://www.janko.at/Raetsel/Sudoku/"
# Inclusive archive IDs, fixed before counting the motifs. Each page credits Otto Janko.
SAMPLES = {
    "Killer": [(701, 710), (737, 740), (747, 750), (757, 760), (767, 770),
               (777, 780), (787, 790), (794, 800), (804, 810), (815, 820), (825, 830)],
    "Chaos": [(568, 570), (576, 580), (586, 590), (597, 600), (607, 610),
              (617, 650), (656, 660), (666, 670), (676, 680)],
}


def definition(cache, series, number):
    name = f"{number:03d}.a.htm"
    file = cache / (series + "_" + name)
    if not file.is_file():
        with urllib.request.urlopen(ROOT + series + "/" + name, timeout=30) as response:
            file.write_bytes(response.read())
    page = file.read_text(encoding="utf-8")
    assert "Autoren/Otto-Janko-CC.htm" in page and "Creative Commons 3.0 BY-NC-SA" in page
    body = re.search(r'<script id="data"[^>]*>(.*?)</script>', page, re.S)[1]
    parts = re.split(r"\[([^\]]+)\]", body)
    data = dict(zip(parts[1::2], parts[2::2], strict=True))
    header = dict(line.split(" ", 1) for line in data["begin"].strip().splitlines() if " " in line)
    assert header["size"] == "9" and header["author"] == "Otto Janko"
    assert header["puzzle"] == ("killer" if series == "Killer" else "sudoku")
    labels, clues = data["areas"].split(), data["problem"].split()
    solution = "".join(data["solution"].split())
    assert len(labels) == len(clues) == len(solution) == 81 and set(solution) == set("123456789")
    groups = [[i for i, label in enumerate(labels) if label == key] for key in sorted(set(labels))]
    puzzle = {"version": 1, "givens": "0" * 81}
    if series == "Killer":
        cages = []
        for group in groups:
            sums = [int(clues[i]) for i in group if clues[i] != "-"]
            digits = [int(solution[i]) for i in group]
            assert sums == [sum(digits)] and len(set(digits)) == len(group)
            cages.append({"cells": group, "sum": sums[0]})
        puzzle["rules"] = [{"type": "killer-cages", "coverGrid": True, "cages": cages}]
        regions = BOXES
    else:
        regions = groups
        assert len(regions) == 9
        puzzle["givens"] = "".join("0" if s == "-" else s for s in clues)
        assert all(g in ("0", s) for g, s in zip(puzzle["givens"], solution))
        puzzle["regions"] = {"type": "jigsaw", "regions": regions}
    for unit in ROWS + COLUMNS + regions:
        assert len(unit) == 9 and {solution[i] for i in unit} == set("123456789")
    return puzzle, solution


def killer_remainders(puzzle, solution):
    cages = puzzle["rules"][0]["cages"]
    singletons = {c["cells"][0] for c in cages if len(c["cells"]) == 1}
    targets = set()
    for unit in HOUSES:
        inside = [c for c in cages if set(c["cells"]).issubset(unit)]
        missing = set(unit).difference(*(c["cells"] for c in inside))
        if len(missing) == 1:
            cell = next(iter(missing))
            if cell not in singletons and puzzle["givens"][cell] == "0":
                assert int(solution[cell]) == 45 - sum(c["sum"] for c in inside)
                targets.add(cell)
    return len(targets)


def jigsaw_leftovers(puzzle, solution):
    regions = puzzle["regions"]["regions"]
    strips = [set(sum(units[i:i + 3], [])) for units in (ROWS, COLUMNS) for i in (0, 3, 6)]
    pairs, targets = set(), set()
    for triple in itertools.combinations(regions, 3):
        area = set().union(*triple)
        for strip in strips:
            if len(strip - area) != 1:
                continue
            a, = strip - area
            b, = area - strip
            assert solution[a] == solution[b]
            pairs.add(tuple(sorted([a, b])))
            if (puzzle["givens"][a] == "0") != (puzzle["givens"][b] == "0"):
                targets.add(a if puzzle["givens"][a] == "0" else b)
    return len(pairs), len(targets)


def analyze(engine, rows, budget):
    requests = [{"operation": "analyze", "maxNodes": budget, "position": {"puzzle": p}} for p, _ in rows]
    records = subprocess.run([engine, "batch-variant"], input="".join(json.dumps(r) + "\n" for r in requests),
                             capture_output=True, text=True, check=True).stdout.splitlines()
    assert len(records) == len(rows)
    statuses = []
    for record in records:
        result = json.loads(record)["result"]
        assert result["status"] == "ok", result
        statuses.append(result["value"])
    return statuses


def main():
    cache, engine, output = map(Path, sys.argv[1:])
    cache.mkdir(exist_ok=True, parents=True)
    result = {}
    for series, ranges in SAMPLES.items():
        ids = [n for a, b in ranges for n in range(a, b + 1)]
        rows = [definition(cache, series, n) for n in ids]
        statuses = analyze(engine, rows, 100000)
        retry = [i for i, status in enumerate(statuses) if status == "search-limit"]
        if retry:
            for i, status in zip(retry, analyze(engine, [rows[i] for i in retry], 2000000), strict=True):
                statuses[i] = status
        checksum = hashlib.sha256(json.dumps(list(zip(ids, rows)), sort_keys=True).encode()).hexdigest()
        facts = {"n": len(rows), "normalizedSha256": checksum,
                 "budgetRetries": len(retry), "exactAnalysis": dict(Counter(statuses))}
        if series == "Killer":
            counts = [killer_remainders(p, s) for p, s in rows]
            facts["withOpening"] = sum(n > 0 for n in counts)
            facts["medianCages"] = statistics.median(len(p["rules"][0]["cages"]) for p, _ in rows)
        else:
            counts = [jigsaw_leftovers(p, s) for p, s in rows]
            facts["withOneCellGeometry"] = sum(a > 0 for a, _ in counts)
            facts["withOpening"] = sum(b > 0 for _, b in counts)
        result[series] = facts
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
