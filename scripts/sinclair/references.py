"""Recover source puzzles locally and publish only digit-free trace facts and attribution."""
import argparse
from collections import Counter
import gzip
import json
import re
from hashlib import sha256
from pathlib import Path

from pool import CELLS, ROOT, X_RULES, Engine, definition, fingerprint


def house(a, b):
    return a // 9 == b // 9 or a % 9 == b % 9 or (a // 27, a % 9 // 3) == (b // 27, b % 9 // 3)


def human_replay(text, givens, solution):
    # Janko Z2 stores column then row, a through i. Notes have '-' as their value.
    # Accept complete, unambiguous first-pass solves only; unrecognized edits are excluded.
    events = text.strip().removesuffix(";").split(";")
    if not events or events[0] != "Z2":
        return None
    placed, digits, notes = [], [], []
    for token in events[1:]:
        fields = token.strip().split(",")
        if len(fields) < 2 or not re.fullmatch("[a-i]{2}", fields[0]):
            return None
        cell = (ord(fields[0][1]) - 97) * 9 + ord(fields[0][0]) - 97
        digit = fields[1]
        if digit == "-":
            notes.append(len(placed))
        elif digit in "123456789" and len(digit) == 1:
            if givens[cell] != "0" or solution[cell] != digit or cell in placed:
                return None
            placed.append(cell)
            digits.append(digit)
        else:
            return None
    if len(placed) != givens.count("0") or len(placed) < 2:
        return None
    count = len(placed)
    quarter = (count + 3) // 4
    early_notes = sum(n < quarter for n in notes)
    return [sum(house(a, b) for a, b in zip(placed, placed[1:])) / (count - 1),
            sum(a == b for a, b in zip(digits, digits[1:])) / (count - 1),
            len(notes) / (len(notes) + count), early_notes / (early_notes + quarter)]


def janko(path):
    content = path.read_bytes()
    raw = re.search(r'<script id="data"[^>]*>(.*?)</script>', content.decode(), re.S)
    if not raw:
        return
    fields = re.split(r'\[([^]]+)\]', raw[1])
    data = {fields[i]: fields[i + 1].strip() for i in range(1, len(fields) - 1, 2)}
    header = dict(line.split(" ", 1) for line in data["begin"].splitlines() if " " in line)
    family = {"sudoku": "classic", "sudoku, diagonals": "x", "killer": "killer"}.get(header["puzzle"])
    if not family or set(data) - {"begin", "end", "problem", "solution", "areas", "moves"}:
        return
    solution = "".join(data["solution"].split())
    problem = data["problem"].split()
    if not re.fullmatch("[1-9]{81}", solution) or len(problem) != 81:
        return
    stem = path.name.replace("Killer_", "Killer/")
    rules = X_RULES if family == "x" else []
    if family == "killer":
        areas = data["areas"].split()
        if len(areas) != 81:
            return
        cages = []
        for label in sorted(set(areas)):
            cells = [i for i in CELLS if areas[i] == label]
            totals = [int(problem[i]) for i in cells if problem[i] != "-"]
            if totals != [sum(int(solution[i]) for i in cells)]:
                return
            cages.append({"cells": cells, "sum": totals[0]})
        rules = [{"type": "killer-cages", "coverGrid": True, "cages": cages}]
        givens = "0" * 81
    else:
        if "areas" in data:
            return
        givens = "".join(problem).replace("-", "0")
    if not re.fullmatch("[0-9]{81}", givens):
        return
    return dict(family=family, source="janko", id=stem, author=header.get("author"), solver=header.get("solver"),
                url="https://www.janko.at/Raetsel/Sudoku/" + stem, sha256=sha256(content).hexdigest(),
                puzzle=definition(givens, rules), solution=solution,
                human=human_replay(data.get("moves", ""), givens, solution) if header.get("solver") else None)


def transform(puzzle, symmetry):
    def move(i):
        r, c = divmod(i, 9)
        if symmetry & 1:
            r, c = c, r
        if symmetry & 2:
            r = 8 - r
        if symmetry & 4:
            c = 8 - c
        return 9 * r + c
    chars = list("0" * 81)
    for i in CELLS:
        chars[move(i)] = puzzle["givens"][i]
    rules = []
    for rule in puzzle.get("rules", []):
        if rule["type"] == "killer-cages":
            rules.append(dict(rule, cages=[dict(cage, cells=sorted(map(move, cage["cells"]))) for cage in rule["cages"]]))
        else:
            # X always declares both long diagonals, which are preserved as a pair.
            rules.append(rule)
    return definition("".join(chars), rules)


def shape_key(puzzle, canonical):
    if not puzzle.get("rules"):
        return fingerprint(re.sub("[1-9]", "1", canonical))
    layouts = []
    for sym in range(8):
        board = transform(puzzle, sym)
        mask = re.sub("[1-9]", "1", board["givens"])
        cages = sorted(tuple(c["cells"]) for r in board["rules"] for c in r.get("cages", []))
        layouts.append((mask, cages))
    return fingerprint(min(layouts))


def source_rows(directory, gp):
    for tag, fname in [("nikoli", "nikoli-100"), ("exchange-control", "sudoku-exchange")]:
        local = ROOT / f"src/sudoku/collections/{fname}.json"
        for row in json.loads(local.read_text()):
            yield dict(source=tag, family="classic", id=row["id"], puzzle=definition(row["givens"]),
                       author="Nikoli" if tag == "nikoli" else "Sudoku Exchange / QQWing", human=None,
                       sha256=sha256(row["givens"].encode()).hexdigest())
    for manifest in ("classic.json", "killer.json"):
        for name in json.loads((directory / manifest).read_text()):
            ref = janko(directory / name)
            if ref:
                yield ref
    if gp:
        yield from json.loads(gp.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--gp", type=Path)
    args = parser.parse_args()
    engine, stats = Engine(), Counter()
    seen = set()
    with args.output.open("wb") as file, gzip.GzipFile(fileobj=file, mode="wb", filename="", mtime=0) as dest:
        for row in source_rows(args.directory, args.gp):
            puzzle = row.pop("puzzle")
            published = row.pop("solution", None)
            source = row["source"]
            result = engine.call("trace", puzzle=puzzle, budget=100_000)
            stats[source, result["status"]] += 1
            if result["status"] != "solved":
                continue
            if published and result["solution"] != published:
                raise ValueError(f"Source/engine solution disagreement: {row['id']}")
            key = fingerprint(result["canonical"])
            if key in seen:
                stats[source, "duplicate"] += 1
                continue
            seen.add(key)
            alt = engine.call("trace", puzzle=transform(puzzle, 6), budget=100_000)
            paths = [dict(tier=result["difficulty"], events=result["events"])]
            if alt["status"] == "solved":
                assert alt["solution"] == result["solution"][::-1]
                paths.append(dict(tier=alt["difficulty"], events=alt["events"]))
            row.update(key=key, group=shape_key(puzzle, result["canonical"]), paths=paths)
            dest.write((json.dumps(row, separators=(",", ":")) + "\n").encode())
    engine.close()
    print(dict(stats))


if __name__ == "__main__":
    main()
