"""Prove that released answers differ, independently of the constructor's canonicalizer."""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path


def answer_signature(grid):
    # Between two rows, the digits at each matching column form a permutation.
    # Renaming digits conjugates it and reordering columns leaves it intact.
    # Both operations preserve its cycle lengths, as does choosing the rows in reverse.
    rows = [list(map(int, grid[i:i+9])) for i in range(0, 81, 9)]
    def axis(units):
        pairs = {}
        for i, a in enumerate(units):
            for j, b in enumerate(units[:i]):
                perm = dict(zip(a, b))
                cycles = []
                while perm:
                    x = next(iter(perm))
                    length = 0
                    while x in perm:
                        x = perm.pop(x)
                        length += 1
                    cycles.append(length)
                pairs[i, j] = pairs[j, i] = tuple(sorted(cycles))
        profiles = []
        for i in range(9):
            bands = [tuple(sorted(pairs[i,j] for j in range(n,n+3) if j != i)) for n in range(0,9,3)]
            own = bands.pop(i//3)
            profiles.append((own, tuple(sorted(bands))))
        return tuple(sorted(tuple(sorted(profiles[i:i+3])) for i in (0,3,6)))
    return tuple(sorted((axis(rows), axis(list(zip(*rows))))))


def mask_signature(grid):
    # Pairwise intersections count common given positions. Counts survive any
    # column order. Record the pattern of intersections in each band as above.
    rows = [[d != '0' for d in grid[i:i+9]] for i in range(0,81,9)]
    def axis(units):
        summaries = []
        for i, a in enumerate(units):
            bands = [tuple(sorted((sum(b), sum(x and y for x,y in zip(a,b))) for b in units[n:n+3])) for n in (0,3,6)]
            own = bands.pop(i//3)
            summaries.append((sum(a), own, tuple(sorted(bands))))
        return tuple(sorted(tuple(sorted(summaries[i:i+3])) for i in (0,3,6)))
    return tuple(sorted((axis(rows), axis(list(zip(*rows))))))


def visible_signature(puzzle):
    def transformed(sym, i):
        row,col = divmod(i,9)
        if sym & 1:
            row,col = col,row
        return 9*(8-row if sym & 2 else row) + (8-col if sym & 4 else col)
    marks = []
    def edges(groups, inside):
        owner = {c:n for n,g in enumerate(groups) for c in g}
        for i in range(81):
            neighbors = ([i+1] if i%9<8 else []) + ([i+9] if i<72 else [])
            for j in neighbors:
                if (owner[i]==owner[j]) == inside:
                    marks.append(("edge",(i,j)))
    if puzzle.get("regions",{}).get("type") == "jigsaw":
        edges(puzzle["regions"]["regions"],False)
    for rule in puzzle.get("rules",[]):
        kind = rule["type"]
        if kind == "killer-cages":
            edges([c["cells"] for c in rule["cages"]],True)
        if kind == "thermometer":
            marks.append(("thermo",rule["cells"]))
        if kind == "arrow":
            marks.append(("arrow",[rule["circle"],*rule["cells"]]))
        if kind == "kropki":
            for color in ["consecutive","ratioTwo"]:
                marks.extend((color,pair) for pair in rule.get(color,{}).get("pairs",[]))
    givens = [i for i,d in enumerate(puzzle["givens"]) if d!="0"]
    forms = []
    for sym in range(8):
        shapes = []
        for kind,cells in marks:
            points = [transformed(sym,i) for i in cells]
            if kind in ("edge","consecutive","ratioTwo"):
                points.sort()
            shapes.append((kind,tuple(points)))
        forms.append((tuple(sorted(transformed(sym,i) for i in givens)),tuple(sorted(shapes))))
    return min(forms)


def killer_singletons(puzzle):
    assert puzzle["givens"] == "0" * 81
    rule = next(rule for rule in puzzle["rules"] if rule["type"] == "killer-cages")
    groups = [cage["cells"] for cage in rule["cages"]]
    assert rule["coverGrid"] and sorted(cell for group in groups for cell in group) == list(range(81))
    for group in groups:
        seen, queue = {group[0]}, [group[0]]
        for cell in queue:
            for neighbor in group:
                if neighbor not in seen and abs(cell//9-neighbor//9) + abs(cell%9-neighbor%9) == 1:
                    seen.add(neighbor)
                    queue.append(neighbor)
        assert seen == set(group), "Disconnected Killer cage"
    return sum(len(group) == 1 for group in groups)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    answers, masks, variants, per_family = set(), set(), set(), Counter()
    singleton_counts = Counter()
    edition = sha256()
    for file in sorted(args.catalog.glob("*/*.json")):
        pack = json.loads(file.read_text())
        edition.update(file.relative_to(args.catalog).as_posix().encode() + b'\0' + file.read_bytes())
        for puzzle, answer, key, *_ in pack["puzzles"]:
            if pack["variant"] == "killer-cages":
                singleton_counts[killer_singletons(puzzle)] += 1
            signature = answer_signature(answer)
            assert signature == answer_signature(key), f"Canonical key mismatches the answer in {file}"
            digest = sha256(repr(signature).encode()).hexdigest()
            assert digest not in answers, f"Repeated invariant needs exact investigation in {file}"
            answers.add(digest)
            if pack["variant"] == "classic":
                signature = sha256(repr(mask_signature(puzzle)).encode()).hexdigest()
                assert signature not in masks, f"Repeated mask invariant needs exact investigation in {file}"
                masks.add(signature)
            else:
                variant = (pack["variant"],visible_signature(puzzle))
                assert variant not in variants, f"Repeated variant clue positions or shapes in {file}"
                variants.add(variant)
            per_family[pack["variant"]] += 1
    args.report.write_text(json.dumps(dict(releaseSha256=edition.hexdigest(), independentAnswerSignatures=len(answers),
        independentClassicMaskSignatures=len(masks), distinctVariantLayouts=len(variants),
        counts=dict(sorted(per_family.items())), killerPuzzlesBySingleCellCageCount=dict(sorted(singleton_counts.items()))), indent=2) + "\n")


if __name__ == "__main__":
    main()
