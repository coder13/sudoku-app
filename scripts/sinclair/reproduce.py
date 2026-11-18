"""Rebuild the released playtest in a separate directory using its recorded seed ranges."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess
import sys

from edition import RESEARCH, select
from guided import guided
from model import train
from pool import ROOT


def matches_release_stream(path, expected):
    data = path.read_bytes()
    if sha256(data).hexdigest() == expected:
        return True
    # Versions 7 and 8 added techniques for other variants. Compare every
    # puzzle, action and score byte to the first edition's version-5 ledger.
    original = sha256()
    for line in data.splitlines(keepends=True):
        row = json.loads(line)
        version = row["scoringVersion"]
        if row["family"] in ("killer", "x") and version in (7, 8):
            line = line.replace(f'"scoringVersion":{version},'.encode(), b'"scoringVersion":5,', 1)
        original.update(line)
    return original.hexdigest() == expected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--jobs", type=int, default=3)
    parser.add_argument("--candidate-cache", type=Path, help="Reuse verified seeded proposals and rerun guided construction and selection")
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error("--jobs must be positive")
    work = args.work.resolve()
    work.mkdir(parents=True, exist_ok=True)
    if any(work.iterdir()):
        parser.error("Choose an empty directory so another edition's seeds or model cannot enter the run.")
    catalog, research, pool = (work / n for n in ("catalog", "research", "pool"))
    for path in (catalog, research, pool):
        path.mkdir()
    subprocess.run(["cargo", "build", "--release", "-p", "sudoku-app-engine", "--features", "wasm-api",
                    "--example", "sinclair"], cwd=ROOT, check=True)
    corpus = research / "reference-traces.jsonl.gz"
    shutil.copyfile(RESEARCH / corpus.name, corpus)
    train(corpus, research)
    manifest = json.loads((RESEARCH / "selection.json").read_text())
    jobs = [n.removesuffix(".counts.json").rsplit("-", 2) for n in manifest["proposalStreams"]
            if n != "guided-editions.counts.json"]
    def run(job):
        stream, start, count = job
        if stream == "x-refined":
            argv = ["refine_x.py", str(pool), start, count]
        else:
            argv = ["pool.py", str(pool), stream, start, count]
        subprocess.run([sys.executable, *argv], cwd=Path(__file__).parent, check=True)
    if args.candidate_cache:
        for name, expected in manifest["poolSha256"].items():
            if name == "guided-editions.jsonl":
                continue
            source = args.candidate_cache / name
            if not matches_release_stream(source, expected):
                raise ValueError(f"Candidate cache differs from the release: {name}")
            shutil.copyfile(source, pool / name)
            counts = source.with_suffix(".counts.json").name
            (pool / counts).write_text(json.dumps(manifest["proposalStreams"][counts]))
    else:
        with ThreadPoolExecutor(max_workers=args.jobs) as workers:
            list(workers.map(run, (j for j in jobs if j[0] != "x-refined")))
            list(workers.map(run, (j for j in jobs if j[0] == "x-refined")))
    guided(pool, research)
    for name, expected in manifest["poolSha256"].items():
        if not matches_release_stream(pool / name, expected):
            raise ValueError(f"Regenerated candidate stream differs: {name}")
    select(pool, work, research, catalog)
    subprocess.run(["node", "--experimental-strip-types", "scripts/sinclair/verify.mts", str(catalog), str(research)], cwd=ROOT, check=True)
    for f in catalog.glob("sinclair-*.json"):
        published = ROOT / "src/sudoku/collections" / f.name
        if f.read_bytes() != published.read_bytes():
            raise ValueError(f"{f.name} differs from the released edition. Check engine and NumPy versions.")
    print("Reproduced and verified every released puzzle.")


if __name__ == "__main__":
    main()
