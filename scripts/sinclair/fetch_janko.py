"""Cache a fixed, spread-out sample of the public classic and Killer archives."""
import argparse
import concurrent.futures
import json
import re
from pathlib import Path
import urllib.request

ROOT = "https://www.janko.at/Raetsel/Sudoku/"


def get(directory, path):
    local = directory / path.replace("/", "_")
    if not local.exists():
        req = urllib.request.Request(ROOT + path, headers={"User-Agent": "SudokuResearch/1.0"})
        with urllib.request.urlopen(req, timeout=45) as response:
            local.write_bytes(response.read())
    return local


if __name__ == "__main__":
    arg = argparse.ArgumentParser(description=__doc__)
    arg.add_argument("directory", type=Path)
    dest = arg.parse_args().directory
    dest.mkdir(parents=True, exist_ok=True)
    for prefix, cutoff, count in [("", 1290, 225), ("Killer/", 830, 180)]:
        index = get(dest, prefix + ("index.htm" if prefix else "index-2.htm")).read_text()
        row = re.search(r'<tr[^>]*>\s*<td[^>]*>\s*9x9.*?</tr>', index, re.S)
        ids = sorted(set(re.findall(r'href="(\d+\.a\.htm)"', row[0])), key=lambda s: int(s.split(".")[0]))
        ids = [name for name in ids if int(name.split(".")[0]) <= cutoff]
        if len(ids) < count:
            raise ValueError(f"Only {len(ids)} distinct 9×9 records in {prefix} index")
        sample = [ids[round(i * (len(ids) - 1) / (count - 1))] for i in range(count)]
        if not prefix:
            # The archive groups many of its explicitly marked X Sudokus in these
            # runs. The parser still checks the rules of every individual puzzle.
            sample = list(dict.fromkeys(sample + [name for name in ids
                if 901 <= int(name.split(".")[0]) <= 925 or 1191 <= int(name.split(".")[0]) <= 1250]))
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            pages = list(pool.map(lambda name: get(dest, prefix + name), sample))
        (dest / ("killer.json" if prefix else "classic.json")).write_text(json.dumps([p.name for p in pages]))
        print(prefix or "Classic", len(pages), flush=True)
