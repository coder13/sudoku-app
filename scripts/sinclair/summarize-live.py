"""Summarize matched generation calls and draw actual starting puzzles from the study."""
import argparse
import gzip
import json
from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path
from statistics import mean, median
import subprocess
import sys
from urllib.parse import quote

import numpy as np
from PIL import Image, ImageDraw
from comparison.examples import draw_grid, font


NAMES = {"classic": "Classic", "killer-cages": "Killer", "windoku": "Windoku", "diagonal": "Diagonal",
         "jigsaw": "Jigsaw", "anti-knight": "Anti-Knight", "thermometer": "Thermometer", "arrow": "Arrow", "kropki": "Kropki"}


def summarize(rows):
    success = [r for r in rows if "error" not in r]
    times = [r["elapsedMs"] for r in rows]
    def average(values):
        values = [v for v in values if v is not None]
        return mean(values) if values else None
    excess = []
    for row in success:
        pairing = row["pairing"]["given"]
        if pairing is not None:
            grid = row["puzzle"]["givens"]
            noncentral = sum(d != "0" for i, d in enumerate(grid) if i != 40)
            excess.append(pairing - (noncentral - 1) / 79)
    return dict(requests=len(rows), returned=len(success), medianMs=median(times), p90Ms=float(np.percentile(times, 90)),
                maxMs=max(times), meanPairing=average(r["pairing"]["score"] for r in success),
                meanGivenPairing=average(r["pairing"]["given"] for r in success),
                meanShapes=average(r["pairing"]["shapes"] for r in success), meanGivenExcess=average(excess),
                meanDistance=average(r["distance"] for r in success), meanSteps=average(r["steps"] for r in success),
                methods=dict(Counter(r["style"]["method"] for r in success if "style" in r)))


def compare(group):
    modes = {mode: summarize([r for r in group if r["mode"] == mode]) for mode in ("standard", "sinclair")}
    pairs = defaultdict(dict)
    for r in group:
        if "error" not in r:
            pairs[r["id"], r["tier"], r["seed"]][r["mode"]] = r
    wins = Counter()
    for pair in pairs.values():
        if len(pair) == 2:
            delta = pair["sinclair"]["pairing"]["score"] - pair["standard"]["pairing"]["score"]
            wins["sinclair" if delta > 1e-12 else "standard" if delta < -1e-12 else "tied"] += 1
    return dict(**modes, betterPairing=dict(wins))


def draw_jigsaw(draw, x, y, cell, puzzle):
    labels = {i: r for r, region in enumerate(puzzle["regions"]["regions"]) for i in region}
    draw.rectangle([x, y, x + 9*cell, y + 9*cell], fill="white", outline="#344b53", width=3)
    for i, digit in enumerate(puzzle["givens"]):
        r, c = divmod(i, 9)
        left, top = x+c*cell, y+r*cell
        for neighbor, line in [(i-1, (left,top,left,top+cell)), (i-9, (left,top,left+cell,top))]:
            thick = labels.get(neighbor) != labels[i] or neighbor == i-1 and c == 0
            draw.line(line, fill="#344b53" if thick else "#aababd", width=3 if thick else 1)
        if digit != "0":
            draw.text((left+.5*cell, top+.51*cell), digit, font=font(28), fill="#172e39", anchor="mm")


def sample_pairs(rows):
    result = {}
    for variant in NAMES:
        pairs = defaultdict(dict)
        for row in rows:
            if row["id"] == variant and row["tier"] == "medium" and "error" not in row:
                pairs[row["seed"]][row["mode"]] = row
        options = [p for p in pairs.values() if len(p) == 2]
        middle = {k: median(p[k]["pairing"]["score"] for p in options) for k in ("standard", "sinclair")}
        result[variant] = min(options, key=lambda p: (sum(abs(p[k]["pairing"]["score"]-v) for k, v in middle.items()),
                                                       p["sinclair"]["seed"]))
    return result


def figure(folder, selected, caption=None, headings=None):
    img = Image.new("RGB", (1368, 1110), "#f7f6f1")
    draw = ImageDraw.Draw(img)
    def label(x, y, s, size, bold=False, muted=False):
        draw.text((x, y), s, anchor="lt", font=font(size, bold=bold), fill="#53646a" if muted else "#172e39")
    label(35, 27, "Half-turn patterns in three kinds of Sudoku", 42, True)
    label(36, 89, caption or "Each column uses one seed and the Medium setting. Percentages count visible clues with a rotated partner.", 21, muted=True)
    for col, variant in enumerate(["classic", "killer-cages", "jigsaw"]):
        x = 36 + 442*col
        label(x, 152, (headings or NAMES)[variant], 31, True)
        for row, mode in enumerate(["standard", "sinclair"]):
            item = selected[variant][mode]
            y = 229 + 445*row
            label(x, y-31, mode.capitalize(), 21, True)
            if variant == "jigsaw":
                draw_jigsaw(draw, x, y, 40, item["puzzle"])
            else:
                draw_grid(draw, x, y, 40, item["puzzle"])
            pairing = item["pairing"]
            parts = [f"Givens {pairing['given']:.0%}" if pairing["given"] is not None else "No off-center givens"]
            if pairing["shapes"] is not None:
                parts.append(f"{'Cage joins' if variant == 'killer-cages' else 'Region borders'} {pairing['shapes']:.0%}")
            label(x, y+375, "  ·  ".join(parts), 20, muted=True)
    img.save(folder / "examples.png", optimize=True)


def playable(folder, selected, rows, certificates, origin):
    def solution(row):
        key = sha256(json.dumps(row["puzzle"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        return certificates[key]
    lines = ["# Try the two generators blind", "",
             "Each row contains two Medium puzzles with different seeds, given counts and completed grids. The standard puzzle is the closest available match in app points among those choices. Flip a coin for which side to play first, and save the answer key until you have finished both.", "",
             "Before the first move, record which layout you prefer. After both solves, record which puzzle you would play again, or a tie. Name one deduction that influenced your choice. You can paste either link into the app’s import dialog if you use another address.", "",
             "| Variant | Puzzle A | Puzzle B |", "| --- | --- | --- |"]
    answers = []
    for variant, illustrated in selected.items():
        sinclair = illustrated["sinclair"]
        seed = sinclair["seed"]
        blanks = sinclair["puzzle"]["givens"].count("0")
        controls = [r for r in rows if r["id"] == variant and r["tier"] == "medium" and r["mode"] == "standard"
                    and "error" not in r and r["seed"] != seed and r["puzzle"]["givens"].count("0") != blanks
                    and solution(r) != solution(sinclair)]
        standard = min(controls, key=lambda r: (abs(r["points"] - sinclair["points"]), r["seed"]))
        pair = dict(standard=standard, sinclair=sinclair)
        order = ["standard", "sinclair"]
        if sha256(f"live-blind/{seed}".encode()).digest()[0] % 2:
            order.reverse()
        links = []
        for name, mode in zip("AB", order):
            puzzle = pair[mode]["puzzle"]
            fragment = ("puzzle=" + puzzle["givens"] if variant == "classic" else
                        "variant=" + quote(json.dumps(dict(id=variant, puzzle=puzzle), separators=(",", ":")), safe=""))
            links.append(f"[Play {name}]({origin.rstrip('/')}/#{fragment})")
        lines.append("| " + " | ".join([NAMES[variant], *links]) + " |")
        answers.append(f"- {NAMES[variant]} has Sinclair on side {'AB'[order.index('sinclair')]}.")
    lines += ["", "<details><summary>Reveal the generators</summary>", "", *answers, "", "</details>", ""]
    (folder / "play.md").write_text("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--origin", default="http://127.0.0.1:8766")
    parser.add_argument("--catalog-examples", action="store_true", help="Draw the six boards chosen by catalog-examples.mts")
    args = parser.parse_args()
    if args.catalog_examples:
        rows = json.loads(args.input.read_text())
        figure(args.output, {r["family"]: r for r in rows},
               "Each example is near the middle of its group for half-turn pairing. Percentages count clues with an opposite partner.",
               {r["family"]: r["name"] for r in rows})
        return
    data = args.input.read_bytes()
    parsed = [json.loads(line) for line in data.splitlines()]
    meta, rows = parsed[0], parsed[1:]
    cases = {(r["id"], r["tier"]) for r in rows}
    assert len(cases) == 66 and len({(r["id"], r["tier"], r["seed"], r["mode"]) for r in rows}) == len(rows)
    assert len(rows) == 2*(len(cases)*meta["allTiers"] + len(NAMES)*(meta["mediumTier"]-meta["allTiers"]))
    balanced = [r for r in rows if r["draw"] < meta["allTiers"]]
    medium = [r for r in rows if r["tier"] == "medium"]
    result = dict(**meta, requests=len(rows), balanced=compare(balanced), medium=compare(medium),
                  mediumFamilies={v: compare([r for r in medium if r["id"] == v]) for v in NAMES},
                  tiers={f"{v}/{t}": compare([r for r in rows if r["id"] == v and r["tier"] == t]) for v,t in sorted(cases)})
    selected = sample_pairs(rows)
    result["illustratedSeeds"] = {v: row["sinclair"]["seed"] for v,row in selected.items()}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
    raw = args.output / "draws.jsonl.gz"
    raw.write_bytes(gzip.compress(data, mtime=0))
    audit_path = args.output / "independent-check.json"
    audit = json.loads(audit_path.read_text()) if audit_path.exists() else {}
    if audit.get("drawFileSha256") != sha256(raw.read_bytes()).hexdigest():
        subprocess.run([sys.executable, str(Path(__file__).with_name("audit-live.py")), str(raw), str(audit_path)], check=True)
        audit = json.loads(audit_path.read_text())
    figure(args.output, selected)
    playable(args.output, selected, rows, audit["certificates"], args.origin)


if __name__ == "__main__":
    main()
