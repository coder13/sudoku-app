"""Make the six-grid comparison figure and source-hidden pairs from the measured games."""
import argparse
from collections import defaultdict
import gzip
from hashlib import sha256
from itertools import groupby
import json
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/research/sinclair/comparison"
FAMILIES = {"classic": "Classic", "killer": "Killer", "x": "X Sudoku"}
LEVELS = "beginner easy medium tricky hard very-hard expert master extreme impossible".split()


def load_games(folder):
    with gzip.open(folder / "normal-draws.json.gz", "rt") as source:
        sample = json.load(source)
    games = {r["id"]: r["puzzle"] for block in sample.values() for r in block["rows"]}
    for family in FAMILIES:
        published = ROOT / "src/sudoku/collections" / f"sinclair-{family}.json"
        for r in json.loads(published.read_text()):
            games[r["id"].upper()] = r.get("puzzle", {"version": 1, "givens": r["givens"]})
    with gzip.open(folder / "measurements.json.gz", "rt") as source:
        rows = json.load(source)
    assert games.keys() == {r["id"] for r in rows}
    return games, rows


def font(size, bold=False, serif=False):
    mac = ("Georgia" if serif else "Arial") + (" Bold" if bold else "") + ".ttf"
    linux = ("DejaVuSerif" if serif else "DejaVuSans") + ("-Bold" if bold else "") + ".ttf"
    for name in ["/System/Library/Fonts/Supplemental/" + mac, linux]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def draw_grid(draw, x, y, cell, puzzle):
    bounding = (x, y, x + 9*cell, y + 9*cell)
    draw.rectangle(bounding, fill="#ffffff")
    rules = puzzle.get("rules", [])
    for rule in rules:
        if rule["type"] == "diagonal":
            a, b = (0, 9) if rule["diagonal"] == "main" else (9, 0)
            draw.line((x+a*cell, y, x+b*cell, y+9*cell), fill="#bbced9", width=3)
    for i in range(10):
        weight = 3 if i % 3 == 0 else 1
        color = "#344b53" if weight == 3 else "#aababd"
        draw.line((x+i*cell, y, x+i*cell, y+9*cell), fill=color, width=weight)
        draw.line((x, y+i*cell, x+9*cell, y+i*cell), fill=color, width=weight)
    cages = [c for rule in rules for c in rule.get("cages", [])]
    for cage in cages:
        members = set(cage["cells"])
        first = min(members)
        for i in members:
            r, c = divmod(i, 9)
            left = c == 0 or i-1 not in members
            right = c == 8 or i+1 not in members
            top, bottom = i-9 not in members, i+9 not in members
            x0, y0 = x+c*cell, y+r*cell
            inner = 4
            lx, rx = x0+inner*left, x0+cell-inner*right
            ty, by = y0+inner*top, y0+cell-inner*bottom
            # Paired inset edges distinguish each cage from its neighbor and from box edges.
            for enabled, start, end in ((top, (lx, ty), (rx, ty)), (bottom, (lx, by), (rx, by)),
                                        (left, (lx, ty), (lx, by)), (right, (rx, ty), (rx, by))):
                if not enabled:
                    continue
                dx, dy = int(end[0] != start[0]), int(end[1] != start[1])
                length = max(end[0]-start[0], end[1]-start[1])
                for step in range(0, length, 6):
                    stop = min(step+3, length)
                    draw.line((start[0]+dx*step, start[1]+dy*step, start[0]+dx*stop, start[1]+dy*stop),
                              fill="#60666e", width=1)
        row, col = divmod(first, 9)
        draw.text((x+col*cell+6, y+row*cell+3), str(cage["sum"]), fill="#333a44",
                  font=font(12, bold=True), anchor="lt", stroke_width=1, stroke_fill="#ffffff")
    for i, digit in enumerate(puzzle["givens"]):
        if digit != "0":
            row, col = divmod(i, 9)
            draw.text((x+(col+.5)*cell, y+(row+(.61 if cages else .51))*cell), digit,
                      font=font(23 if cages else 28), anchor="mm", fill="#172e39")


def make_figure(folder, games, rows):
    image = Image.new("RGB", (1512, 1234), "#f7f6f1")
    draw = ImageDraw.Draw(image)
    ink, muted, placement, removal = "#172e39", "#475b61", "#16746e", "#a6531d"
    def label(x, y, text, size, **kwargs):
        draw.text((x, y), text, font=font(size, kwargs.get("bold", False), kwargs.get("serif", False)),
                  fill=kwargs.get("color", ink), anchor="lt")
    label(48, 37, "How six Medium puzzles unfold", 49, serif=True)
    label(51, 104, "Read each strip left to right. Wider bands show more consecutive deductions of the same kind.", 24, color=muted)
    for x, color, text in [(51, placement, "Places a digit"), (326, removal, "Only removes candidates")]:
        draw.rectangle((x, 151, x+32, 166), fill=color)
        label(x+45, 148, text, 21)
    xs = [175, 635, 1095]
    cell = 39
    for x, family in zip(xs, FAMILIES.values()):
        label(x, 206, family, 29, bold=True)
    for arm, y in [("sinclair", 263), ("normal", 754)]:
        label(44, y+2, "Sinclair" if arm == "sinclair" else "New", 26, serif=True)
        if arm == "normal":
            label(44, y+34, "Puzzle", 26, serif=True)
        for x, family in zip(xs, FAMILIES):
            # Printed order and room/slot 1 determine examples before any of their metrics are inspected.
            row = next(r for r in rows if r["family"] == family and r["arm"] == arm and r["tier"] == "medium")
            draw_grid(draw, x, y, cell, games[row["id"]])
            seq = row["signature_sequence"]
            left = 0
            for kind, run in groupby(seq):
                right = left + len(list(run))
                draw.rectangle((x+round(9*cell*left/len(seq)), y+9*cell+19,
                                x+round(9*cell*right/len(seq))-1, y+9*cell+34),
                               fill=placement if kind == "P" else removal)
                left = right
            assert left == len(seq)
            label(x, y+9*cell+47, f"{row['steps']} steps  ·  {row['elimination_steps']} removal-only", 21)
            label(x, y+9*cell+77, f"{row['opening']} opening placements", 19, color=muted)
    draw.line((45, 719, 1464, 719), width=1, fill="#aebbb5")
    image.save(folder / "medium-examples.png", optimize=True)


def share(base, family, puzzle):
    if family == "classic":
        return base + "/#puzzle=" + puzzle["givens"]
    # Keep shared puzzle definitions neutral and omit all source and solution metadata.
    clean = {"version": 1, "givens": puzzle["givens"]}
    # Rule and cage order can affect which proof the app finds first.
    clean["rules"] = puzzle["rules"]
    return base + "/#variant=" + quote(json.dumps({"id": "diagonal" if family == "x" else "killer-cages",
                                                   "puzzle": clean}, separators=(",", ":")), safe="")


def make_pairs(folder, games, rows, base):
    groups = defaultdict(list)
    for r in rows:
        groups[r["family"], r["tier"]].append(r)
    def random_key(key):
        return sha256(("sinclair-blind-v1/" + key).encode()).digest()
    order = sorted(groups, key=lambda t: random_key("/".join(t)))
    lines = ["# Which puzzle would you play again?", "",
             "Each pair contains one Sinclair puzzle and one from New Puzzle at the same app difficulty. Choose a row and play both links. The links open your local Gridroom app. If yours runs elsewhere, paste the link into its Import a puzzle dialog.", "",
             "Before placing a digit, pick the grid you prefer looking at. After both solves, record which was more fun (A, B, or tie), how hard each felt and one moment that explains your choice. Flip a coin for which side to play first. The answer key is folded at the end.", "",
             "The starting clues can give away the source, particularly in Killer. If several people play a pair, save the reveal until everyone has recorded a choice.", ""]
    key = []
    for family, title in FAMILIES.items():
        lines += [f"## {title}", "", "| Difficulty | Puzzle A | Puzzle B |", "| --- | --- | --- |"]
        for tier in LEVELS:
            if (family, tier) not in groups: continue
            group = groups[family, tier]
            picks = []
            for arm in ("sinclair", "normal"):
                options = [r for r in group if r["arm"] == arm]
                # Medium examples in the labelled figure must stay out of these pairs, including reflections.
                if tier == "medium":
                    options = [r for r in options if r["key"] != options[0]["key"]]
                picks.append(min(options, key=lambda r: random_key(r["id"])))
            if order.index((family, tier)) % 2: picks.reverse()
            links = [share(base.rstrip("/"), family, games[r["id"]]) for r in picks]
            name = tier.replace("-", " ").title()
            lines.append(f"| {name} | [Play A]({links[0]}) | [Play B]({links[1]}) |")
            a, b = picks
            key.append(f"| {title} · {name} | {a['id']} | {b['id']} |")
        lines.append("")
    lines += ["<details>", "<summary>Reveal the sources after playing</summary>", "",
              "Short codes beginning with C, K or X identify Sinclair. The other code gives the normal generator’s variant, difficulty, room and draw.", "",
              "| Pair | A | B |", "| --- | --- | --- |", *key, "", "</details>", ""]
    (folder / "blind-pairs.md").write_text("\n".join(lines))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, default=EVIDENCE)
    parser.add_argument("--origin", default="http://127.0.0.1:5174")
    args = parser.parse_args()
    games, rows = load_games(args.evidence)
    make_figure(args.evidence, games, rows)
    make_pairs(args.evidence, games, rows, args.origin)
