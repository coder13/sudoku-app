"""Analyze the output of collect.mts with the Python standard library."""

import hashlib
import json
import math
import random
import re
import statistics
import subprocess
import sys
from bisect import bisect_right
from collections import Counter, defaultdict
from itertools import chain
from pathlib import Path


LEVELS = ("beginner", "easy", "medium", "tricky")
ROWS = [list(range(r * 9, r * 9 + 9)) for r in range(9)]
COLUMNS = [list(range(c, 81, 9)) for c in range(9)]
BOXES = [[9 * (3 * br + r) + 3 * bc + c for r in range(3) for c in range(3)]
         for br in range(3) for bc in range(3)]
HOUSES = ROWS + COLUMNS + BOXES
ALL = (1 << 9) - 1


def stable_int(key):
    return int.from_bytes(hashlib.sha256(key.encode()).digest(), "big")


def house_domains(grid, houses):
    masks = [ALL if digit == "0" else 0 for digit in grid]
    for house in houses:
        used = 0
        for cell in house:
            if grid[cell] != "0":
                used |= 1 << (int(grid[cell]) - 1)
        for cell in house:
            masks[cell] &= ~used
    return masks


def singles(grid, houses, masks, solution):
    forced = set()
    for cell, mask in enumerate(masks):
        if grid[cell] == "0" and mask.bit_count() == 1:
            forced.add((cell, mask.bit_length()))
    for house in houses:
        for digit in range(1, 10):
            bit = 1 << (digit - 1)
            cells = [c for c in house if grid[c] == "0" and masks[c] & bit]
            if len(cells) == 1:
                forced.add((cells[0], digit))
    assert all(int(solution[cell]) == digit for cell, digit in forced)
    return sorted(forced)


def classic_features(row):
    grid = list(row["givens"])
    mask = [v != "0" for v in grid]
    widths = []
    for _ in range(3):
        moves = singles(grid, HOUSES, house_domains(grid, HOUSES), row["solution"])
        widths.append(len(moves))
        for cell, digit in moves:
            grid[cell] = str(digit)
    return {**row, "clues": sum(mask), "rotational": mask == mask[::-1], "w": widths}


def issue_groups(rows):
    # Protect both the ID-derived issue and the canonical clue mask when either recurs.
    parents = {r["id"]: r["id"] for r in rows}

    def root(key):
        while key != parents[key]:
            key = parents[key]
        return key

    first = {}
    for row in rows:
        issue = re.match(r"nhk[0-9]{4}", row["id"])
        keys = [("mask", row["mask"]), ("issue", issue[0] if issue else row["id"])]
        for key in keys:
            if key in first:
                parents[root(row["id"])] = root(first[key])
            first[key] = row["id"]
    for row in rows:
        row["group"] = root(row["id"])


def width_bin(width):
    return bisect_right((1, 2, 4, 8), width)


def contexts(row):
    tier = row["tier"]
    clue_band = bisect_right((25, 30, 35), row["clues"])
    return ((), (tier,), (tier, clue_band), (tier, clue_band, width_bin(row["w"][0])))


def has_second_wave_trial(row):
    return 0 < row["w"][0] < 81 - row["clues"]


def code_lengths(training, test, prior):
    counts = defaultdict(Counter)
    for row in training:
        if has_second_wave_trial(row):
            for key in contexts(row):
                counts[key][width_bin(row["w"][1])] += 1
    outcome = width_bin(test["w"][1])
    prob = 1 / 5
    bits = []
    for level, key in enumerate(contexts(test)):
        strength = 2.5 if level == 0 else prior
        table = counts[key]
        prob = (table[outcome] + strength * prob) / (table.total() + strength)
        bits.append(-math.log2(prob))
    return bits


def coding(rows, references, prior=8):
    losses = []
    groups = defaultdict(list)
    for row in rows:
        if not has_second_wave_trial(row):
            continue
        training = [r for r in references if r.get("group") != row.get("group")
                    and r["mask"] != row["mask"]]
        bits = code_lengths(training, row, prior)
        losses.append(bits)
        groups[row.get("group", row["id"])].append(bits[2] - bits[3])
    means = [statistics.mean(values) for values in zip(*losses)]
    rng = random.Random(4165)
    clusters = list(groups.values())
    differences = []
    for _ in range(2000):
        sample = rng.choices(clusters, k=len(clusters))
        differences.append(statistics.mean(chain.from_iterable(sample)))
    differences.sort()
    return {"n": len(losses), "groups": len(groups), "bits": means,
            "gain": means[2] - means[3], "bootstrap95": [differences[49], differences[1949]]}


def w_distance(left, right):
    # Univariate Wasserstein-1 for equal sample sizes.
    assert left and len(left) == len(right)
    return statistics.mean(abs(a - b) for a, b in zip(sorted(left), sorted(right)))


def target_for(held, nikoli):
    training = sorted((r for r in nikoli if r["group"] != held["group"]
                       and r["tier"] == held["tier"]), key=lambda r: r["id"])
    return training[stable_int("target/" + held["id"]) % len(training)]


def classic_experiment(nikoli, exchange, generated):
    issue_groups(nikoli)
    pools = defaultdict(list)
    for row in generated:
        pools[row["id"]].append(row)
        assert row["fullTier"] == {"solved": row["tier"]}
    masks = {r["mask"] for r in nikoli + exchange}
    assert all(r["mask"] not in masks for r in generated), "Reference geometry in trial pool"
    assert len({r["structure"] for r in generated}) == len(generated)
    arms = {key: [] for key in ("first", "clues", "sameClues", "opening")}
    support = Counter()
    example = None
    for held in nikoli:
        pool = sorted(pools[held["id"]], key=lambda r: r["slot"])
        assert len(pool) == 4
        target = target_for(held, nikoli)
        first = pool[0]
        clues = min(pool, key=lambda r: abs(r["clues"] - target["clues"]))
        def opening_error(row):
            return sum(abs(a - b) for a, b in zip(row["w"][:2], target["w"][:2]))

        opening = min(pool, key=opening_error)
        same_count = [r for r in pool if r["clues"] == clues["clues"]]
        support["sameClueChoice"] += len(same_count) > 1
        support["exactTargetPair"] += opening_error(opening) == 0
        support["targetBelowPool"] += target["w"][0] < min(r["w"][0] for r in pool)
        support["targetAbovePool"] += target["w"][0] > max(r["w"][0] for r in pool)
        for label, row in (("first", first), ("clues", clues), ("sameClues", min(same_count, key=opening_error)),
                           ("opening", opening)):
            arms[label].append(row)
        if example is None and held["tier"] == "medium" and opening["slot"] != 0:
            example = {"holdoutId": held["id"], "trainingId": target["id"], "target": target["w"],
                       "pool": [{"slot": r["slot"], "seed": r["seed"], "w": r["w"], "clues": r["clues"]}
                                for r in pool], "selected": opening["slot"], "grid": opening["givens"]}
    by_tier = {}
    for tier in LEVELS:
        refs = [r for r in nikoli if r["tier"] == tier]
        comparisons = {}
        for name, arm in arms.items():
            sample = [r for r in arm if r["tier"] == tier]
            comparisons[name] = [w_distance([r["w"][i] for r in refs], [r["w"][i] for r in sample])
                                 for i in range(3)]
        by_tier[tier] = {"n": len(refs), "distances": comparisons,
                         "medianWidths": [statistics.median(r["w"][i] for r in refs) for i in range(3)]}
    macro = {name: [statistics.mean(t["distances"][name][i] for t in by_tier.values())
                    for i in range(3)] for name in arms}

    def inventory(rows):
        return {"n": len(rows), "structures": len({r["structure"] for r in rows}),
                "masks": len({r["mask"] for r in rows}), "rotational": sum(r["rotational"] for r in rows),
                "tiers": dict(Counter(r["tier"] for r in rows))}

    return {"catalog": {name: inventory(rows) for name, rows in
                        (("nikoli", nikoli), ("exchange", exchange), ("app", generated))},
            "holdoutGroups": len({r["group"] for r in nikoli}),
            "maxGroup": max(Counter(r["group"] for r in nikoli).values()),
            "coding": coding(nikoli, nikoli),
            "priorSensitivity": {k: coding(nikoli, nikoli, k)["gain"] for k in (4, 16)},
            "exchangeCoding": coding([r for r in exchange if r["tier"] in LEVELS], nikoli),
            "byTier": by_tier, "meanDistance": macro, "poolSupport": dict(support), "example": example}


def edit_medium(nikoli, app, checker, reference_keys):
    starts = {r["id"]: r for r in app if r["tier"] == "medium" and r["slot"] == 0}
    trials = []
    requested = []
    for held in nikoli:
        if held["id"] not in starts:
            continue
        start = starts[held["id"]]
        target = target_for(held, nikoli)
        grid = start["givens"]
        swaps = [(a, b) for a, v in enumerate(grid) if v != "0"
                 for b, w in enumerate(grid) if w == "0"]
        rng = random.Random(stable_int("edit/" + held["id"]))
        proposals = []
        for a, b in rng.sample(swaps, 64):
            changed = list(grid)
            changed[a], changed[b] = "0", start["solution"][b]
            proposals.append(classic_features({**start, "givens": "".join(changed)}))
        def error(row):
            return sum(abs(a - b) for a, b in zip(row["w"][:2], target["w"][:2]))
        batches = {"drawOrder": proposals[:8], "guided": sorted(proposals, key=error)[:8]}
        for batch in batches.values():
            requested.extend(r["givens"] for r in batch)
        trials.append((held, start, target, batches))

    requests = list(dict.fromkeys(requested))
    report = subprocess.run([checker], input="\n".join(requests) + "\n", text=True,
                            capture_output=True, check=True).stdout.splitlines()
    keys = dict(zip(requests, report, strict=True))
    outputs = defaultdict(list)
    for held, start, target, batches in trials:
        for name, batch in batches.items():
            eligible = [r for r in batch if keys[r["givens"]] != "-"]
            def error(row):
                return sum(abs(a - b) for a, b in zip(row["w"][:2], target["w"][:2]))
            chosen = min([start, *eligible], key=error)
            changed = chosen["givens"] != start["givens"]
            key = hashlib.sha256(keys[chosen["givens"]].encode()).hexdigest() if changed else start["structure"]
            assert key not in reference_keys and chosen["clues"] == start["clues"]
            outputs[name].append((chosen, error(chosen), changed, len(eligible), key))
        outputs["start"].append((start, error(start), False, 0, start["structure"]))
    references = [r for r, *_ in trials]
    summary = {}
    for name, results in outputs.items():
        summary[name] = {"meanTargetError": statistics.mean(r[1] for r in results),
                         "changed": sum(r[2] for r in results), "passingEdits": sum(r[3] for r in results),
                         "distinct": len({r[4] for r in results}),
                         "distances": [w_distance([r["w"][i] for r in references],
                                                 [r[0]["w"][i] for r in results]) for i in range(3)]}
    return {"n": len(trials), "proposalsPerStart": 64, "checksPerArmPerStart": 8,
            "distinctChecksAcrossArms": len(requests), "arms": summary}


def variant_experiment(rows):
    cohorts = defaultdict(list)
    for row in rows:
        puzzle = row["puzzle"]
        grid, solution = puzzle["givens"], row["solution"]
        is_jigsaw = row["family"] == "jigsaw"
        units = ROWS + COLUMNS + (puzzle["regions"]["regions"] if is_jigsaw else BOXES)
        reduced = ROWS + COLUMNS if is_jigsaw else HOUSES
        base = singles(grid, reduced, house_domains(grid, reduced), solution)
        full = singles(grid, units, row["domains"], solution)
        assert set(base).issubset(full)
        cohorts[(row["family"], row["tier"])].append({
            "base": len(base), "full": len(full), "givens": 81 - grid.count("0"),
            "definition": json.dumps(puzzle, sort_keys=True),
            "first": row["techniques"][0], "fallbackSeed": row["seed"] != row["sourceSeed"],
        })
    output = {}
    for (family, tier), group in cohorts.items():
        output[family + "/" + tier] = {
            "n": len(group), "definitions": len({r["definition"] for r in group}),
            "medianBase": statistics.median(r["base"] for r in group),
            "medianFull": statistics.median(r["full"] for r in group),
            "increase": sum(r["full"] > r["base"] for r in group),
            "givensRange": [min(r["givens"] for r in group), max(r["givens"] for r in group)],
            "firstTechniques": dict(Counter(r["first"] for r in group)),
            "fallbackSeeds": sum(r["fallbackSeed"] for r in group),
        }
    return output


def ranks(values):
    ordered = sorted(range(len(values)), key=values.__getitem__)
    output = [0.0] * len(values)
    begin = 0
    while begin < len(ordered):
        end = begin + 1
        while end < len(ordered) and values[ordered[begin]] == values[ordered[end]]:
            end += 1
        for i in ordered[begin:end]:
            output[i] = (begin + end + 1) / 2
        begin = end
    return output


def human_check(raw, prior_rows):
    rows = [classic_features(r) for r in raw]
    assert all(r["w"] == r["engineWidths"] for r in rows)
    assert len({r["id"] for r in rows}) == len({r["structure"] for r in rows}) == len(rows)
    assert not {r["structure"] for r in rows}.intersection(r["structure"] for r in prior_rows)
    strata = defaultdict(list)
    for i, row in enumerate(rows):
        tier = row["fullTier"]
        strata[(row["clues"], tier if tier == "stalled" else tier["solved"])].append(i)

    def within(values):
        centered = list(values)
        for group in strata.values():
            mean = statistics.mean(values[i] for i in group)
            for i in group:
                centered[i] -= mean
        return centered

    width = ranks([r["w"][0] for r in rows])
    clues = ranks([r["clues"] for r in rows])
    result = {}
    for metric in ("time", "combined"):
        values = [r[metric] for r in rows]
        assert all(math.isfinite(v) and v > 0 for v in values)
        target = ranks(values)
        result[metric] = {"clues": statistics.correlation(clues, target),
                          "width": statistics.correlation(width, target),
                          "withinCountAndTier": statistics.correlation(within(width), within(target))}
    return {"n": len(rows), "strata": len(strata),
            "rowsInRepeatedStrata": sum(len(s) for s in strata.values() if len(s) > 1),
            "stalled": sum(r["fullTier"] == "stalled" for r in rows),
            "correlations": result}


def main():
    directory, output, checker = map(Path, sys.argv[1:])
    jobs = {name: json.loads((directory / (name + ".json")).read_text())
            for name in ("references", "variants", "human", *LEVELS)}
    digests = {job["wasm"] for job in jobs.values()}
    assert len(digests) == 1
    refs = [classic_features(r) for r in jobs["references"]["rows"]]
    app = [classic_features(r) for tier in LEVELS for r in jobs[tier]["rows"]]
    assert all(r["w"] == r["engineWidths"] for r in refs + app)
    nikoli = [r for r in refs if r["source"] == "nikoli"]
    classic = classic_experiment(nikoli, [r for r in refs if r["source"] == "exchange"], app)
    result = {"wasmSha256": digests.pop(), "classic": classic,
              "mediumEdits": edit_medium(nikoli, app, checker, {r["structure"] for r in refs}),
              "externalHuman": human_check(jobs["human"]["rows"], refs + app),
              "variants": variant_experiment(jobs["variants"]["rows"])}
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
