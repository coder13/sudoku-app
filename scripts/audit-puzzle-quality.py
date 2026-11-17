#!/usr/bin/env python3
"""Run a resumable sample of the unchanged normal classic generator.

Build quality_audit with --release --features wasm-api first. Each tier receives
the same fixed seed sequence. Failed generation calls remain in the evidence.
The next seed replaces a failed call until the requested sample is complete.
"""
import argparse
import concurrent.futures
import json
import itertools
import pathlib
import subprocess
import time

TIERS = ["beginner", "easy", "medium", "tricky", "hard", "very-hard", "expert", "master", "extreme", "impossible"]
ROOT = pathlib.Path(__file__).resolve().parents[1]


def run_one(tier, index, args):
    process = subprocess.run([str(args.binary), str(tier), str(index), "1"], capture_output=True, text=True)
    if process.returncode:
        raise RuntimeError(f"{TIERS[tier]} index={index}: {process.stderr}")
    return tier, json.loads(process.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=599)
    parser.add_argument("--jobs", type=int, default=6)
    parser.add_argument("--tiers", type=int, nargs="*", default=list(range(10)))
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--binary", type=pathlib.Path, default=ROOT / "target/release/examples/quality_audit")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    started = time.time()
    counts, used, outputs = {}, {}, {}
    for tier in args.tiers:
        path = args.output / f"{TIERS[tier]}.jsonl"
        rows = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
        counts[tier] = sum(row["status"] == "generated" for row in rows)
        used[tier] = {row["index"] for row in rows}
        outputs[tier] = path.open("a")
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
            while any(counts[tier] < args.count for tier in args.tiers):
                pending = []
                for tier in args.tiers:
                    missing = (index for index in range(args.count * 2) if index not in used[tier])
                    pending.extend((tier,index) for index in itertools.islice(missing,max(0,args.count-counts[tier])))
                if not pending:
                    break
                futures = [pool.submit(run_one,tier,index,args) for tier,index in pending]
                for future in concurrent.futures.as_completed(futures):
                    tier, row = future.result()
                    outputs[tier].write(json.dumps(row,separators=(",",":")) + "\n")
                    outputs[tier].flush()
                    used[tier].add(row["index"])
                    counts[tier] += row["status"] == "generated"
                    if counts[tier] % 25 == 0 or counts[tier] == args.count:
                        print(f"PROGRESS {TIERS[tier]} {counts[tier]}/{args.count} lastMs={row['generationMs']:.1f}", flush=True)
    finally:
        for output in outputs.values():
            output.close()
    results = [{"tier":TIERS[tier],"generated":counts[tier],"calls":len(used[tier])} for tier in args.tiers]
    print(json.dumps({"wallSeconds": time.time() - started, "results": results}), flush=True)


if __name__ == "__main__":
    main()
