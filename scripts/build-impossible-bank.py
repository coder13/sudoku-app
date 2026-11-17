#!/usr/bin/env python3
"""Certify an ordered candidate list. Keep failures and timeouts in the evidence."""
import argparse
import concurrent.futures
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    parser.add_argument("--count", type=int, default=768)
    parser.add_argument("--jobs", type=int, default=6)
    parser.add_argument("--seconds", type=float, default=20)
    args = parser.parse_args()
    records = [json.loads(line) for line in args.output.read_text().splitlines()] if args.output.exists() else []
    seen = {row["source"] for row in records}
    accepted = {row["canonical"] for row in records if row.get("accepted")}
    candidates = iter(line.strip().replace(".", "0") for line in args.input.read_text().splitlines()
                      if len(line.strip()) == 81 and line.strip().replace(".", "0") not in seen)

    def certify(source):
        try:
            result = subprocess.run([str(ROOT / "target/release/examples/certify_bank")],
                                    input=source + "\n", text=True, capture_output=True,
                                    check=True, timeout=args.seconds)
            return json.loads(result.stdout)
        except subprocess.TimeoutExpired:
            return {"source": source, "accepted": False, "status": "timeout"}

    with args.output.open("a") as output, concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        pending = set()
        while len(accepted) < args.count or pending:
            while len(pending) < args.jobs and len(accepted) < args.count:
                source = next(candidates, None)
                if source is None:
                    break
                pending.add(pool.submit(certify, source))
            if not pending:
                break
            completed, pending = concurrent.futures.wait(pending, return_when=concurrent.futures.FIRST_COMPLETED)
            for future in completed:
                row = future.result()
                output.write(json.dumps(row, separators=(",", ":")) + "\n")
                output.flush()
                if row.get("accepted"):
                    accepted.add(row["canonical"])
                    print(f"certified={len(accepted)}", flush=True)
    print(f"Finished with {len(accepted)} distinct certified structures", flush=True)


if __name__ == "__main__":
    main()
