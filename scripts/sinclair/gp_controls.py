"""Read seven visually identified, plain X Sudokus as an external competition holdout."""
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
from xml.etree import ElementTree

from pool import X_RULES, definition

# Year-round, physical PDF page (one-based), puzzle number, position on page.
BOARDS = [("2015-02", 6, 9, "top"), ("2015-03", 6, 9, "top"), ("2015-04", 6, 9, "top"),
          ("2015-07", 5, 7, "top"), ("2016-06", 6, 11, "top"), ("2023-02", 6, 10, "top"),
          ("2025-02", 4, 8, "bottom")]


def extract(path, page_number, half):
    raw = subprocess.check_output(["pdftotext", "-f", str(page_number), "-l", str(page_number), "-bbox", str(path), "-"])
    page = ElementTree.fromstring(raw).find(".//{*}page")
    width, height = map(float, (page.attrib["width"], page.attrib["height"]))
    # PDF glyph positions are in points. Identify the lattice spacing by correlating
    # alignment across the full digit set; no puzzle values are transcribed into code.
    words = []
    for word in page.findall("{*}word"):
        if word.text not in list("123456789"):
            continue
        x1, y1, x2, y2 = (float(word.attrib[a]) for a in ("xMin", "yMin", "xMax", "yMax"))
        x, y = (x1 + x2) / 2, (y1 + y2) / 2
        ylo, yhi = (.125, .51) if half == "top" else (.55, .925)
        if x > .422 * width and ylo * height < y < yhi * height and y2 - y1 > .017 * height:
            words.append((x, y, word.text))
    if len(words) < 15:
        raise ValueError(f"Too few vector digits in {path.name}")
    def axis(coords):
        steps = Counter(round(abs(a - b), 1) for a in coords for b in coords if 27 < abs(a - b) < 38)
        pitch = steps.most_common(1)[0][0]
        return pitch
    sx, sy = (axis([w[dim] for w in words]) for dim in (0, 1))
    # The WPF templates right-align the grid (right edge close to 95% or 92%).
    # These seven reviewed puzzles all have at least one given in both outside columns.
    lx, rx = min(w[0] for w in words), max(w[0] for w in words)
    assert abs((rx - lx) / sx - 8) < .4, path
    sx = (rx - lx) / 8
    # One 2015 puzzle has empty first and last rows. Center from the visible grid
    # template and the observed lattice, then verify every row index.
    ly, ry = min(w[1] for w in words), max(w[1] for w in words)
    span = round((ry - ly) / sy)
    assert span in (6, 8), (path, span)
    sy = (ry - ly) / span
    top = ly - ((8 - span) // 2) * sy
    givens = list("0" * 81)
    for x, y, digit in words:
        dx, dy = (x - lx) / sx, (y - top) / sy
        c, r = round(dx), round(dy)
        assert 0 <= r < 9 and 0 <= c < 9 and abs(dx - c) < .15 and abs(dy - r) < .15
        assert givens[9 * r + c] == "0"
        givens[9 * r + c] = digit
    return "".join(givens)


if __name__ == "__main__":
    directory, out = map(Path, sys.argv[1:])
    rows = []
    for book, page, number, half in BOARDS:
        file = directory / f"GP-{book}-R.pdf"
        givens = extract(file, page, half)
        rows.append(dict(source="wpf-test", family="x", id=f"{book}-{number}", author="WPF Sudoku GP round team",
                         human=None, sha256=sha256(file.read_bytes()).hexdigest(), puzzle=definition(givens, X_RULES),
                         url=f"https://www.janko.at/Raetsel/Sudoku/Grand-Prix/{file.name}#page={page}"))
    out.write_text(json.dumps(rows))
