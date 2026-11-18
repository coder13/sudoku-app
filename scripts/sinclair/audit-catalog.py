"""Verify each published solution with an independent Z3 encoding of the rules."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import runpy
import subprocess
import time

certify = runpy.run_path(str(Path(__file__).with_name("audit-live.py")))["certify"]


def fingerprint(family, puzzle, solution):
    data = json.dumps([family, puzzle, solution], sort_keys=True, separators=(",", ":"))
    return sha256(data.encode()).hexdigest()


def check(item):
    key, family, puzzle, solution = item
    _, answer_hash = certify((key, (family, puzzle)))
    if sha256(solution.encode()).hexdigest() != answer_hash:
        raise ValueError(f"Published answer differs from the solver for {key}")
    return key


def inputs(path):
    if path.is_dir():
        for pack in sorted(path.glob("*/*.json")):
            data = json.loads(pack.read_text())
            for row in data["puzzles"]:
                puzzle, solution = row[:2]
                if isinstance(puzzle, str):
                    puzzle = {"version": 1, "givens": puzzle}
                yield data["variant"], puzzle, solution
    else:
        with path.open() as stream:
            for line in stream:
                if line.endswith("\n"):
                    row = json.loads(line)
                    yield row["family"], row["puzzle"], row["solution"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Published catalog directory or candidate JSONL file")
    parser.add_argument("receipts", type=Path, help="Resumable file of verified fingerprints")
    parser.add_argument("--jobs", type=int, default=3)
    parser.add_argument("--watch", action="store_true", help="Also check new rows appended to a pool")
    parser.add_argument("--report", type=Path, help="Write a summary bound to the exact checked input")
    args = parser.parse_args()
    done = set(args.receipts.read_text().splitlines()) if args.receipts.exists() else set()
    with ThreadPoolExecutor(args.jobs) as pool, args.receipts.open("a", buffering=1) as receipts:
        while True:
            pending, keys, counts = {}, [], Counter()
            for family, puzzle, solution in inputs(args.input):
                key = fingerprint(family, puzzle, solution)
                keys.append(key)
                counts[family] += 1
                if key not in done:
                    pending[key] = (key, family, puzzle, solution)
            for key in pool.map(check, pending.values()):
                print(key, file=receipts)
                done.add(key)
            if not args.watch:
                if not keys or not set(keys) <= done:
                    raise ValueError("Incomplete certificate set")
                if args.report:
                    if len(set(keys)) != len(keys):
                        raise ValueError("Repeated definition in release")
                    report = dict(solver=subprocess.check_output(["z3","--version"], text=True).strip(),
                        uniquePuzzles=len(keys), exactPublishedSolutions=len(keys),
                        requireVariantRule=sum(counts.values())-counts["classic"], byVariant=dict(sorted(counts.items())),
                        verifiedDefinitionAndSolutionSHA256=sha256("\n".join(sorted(keys)).encode()).hexdigest())
                    args.report.write_text(json.dumps(report,indent=2)+"\n")
                print("Verified all input solutions and required variant rules.")
                return
            time.sleep(3)


if __name__ == "__main__":
    main()
