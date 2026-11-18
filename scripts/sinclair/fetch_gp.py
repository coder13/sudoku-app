"""Cache public WPF competition booklets for local analysis. No grids are published."""
import argparse
import concurrent.futures
import time
import urllib.request
from urllib.error import HTTPError
from pathlib import Path
from gp_controls import BOARDS

ROOT = "https://www.janko.at/Raetsel/Sudoku/Grand-Prix/"


def fetch(directory, name):
    path = directory / name
    if path.exists():
        return path
    for attempt in range(3):
        try:
            request = urllib.request.Request(ROOT + name, headers={"User-Agent": "SudokuResearch/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                data = response.read()
            if name.endswith(".pdf") and not data.startswith(b"%PDF"):
                raise ValueError(f"Invalid PDF: {name}")
            path.write_bytes(data)
            return path
        except HTTPError as error:
            if error.code == 404:
                return None
            raise
        except OSError:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    directory = parser.parse_args().directory
    directory.mkdir(parents=True, exist_ok=True)
    names = [f"GP-{book}-R.pdf" for book, *_ in BOARDS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for path in pool.map(lambda name: fetch(directory, name), names):
            if not path:
                raise FileNotFoundError("A pinned competition booklet is unavailable")
            print(path.name, flush=True)
