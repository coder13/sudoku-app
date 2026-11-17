#!/usr/bin/env python3
"""Resume alternate lower-tier order checks for a generated audit sample."""
import argparse
import concurrent.futures
import json
import pathlib
import subprocess

ROOT=pathlib.Path(__file__).resolve().parents[1]
TIERS=["beginner","easy","medium","tricky","hard","very-hard","expert","master","extreme","impossible"]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input",type=pathlib.Path)
    parser.add_argument("--tiers",nargs="*",default=TIERS)
    parser.add_argument("--jobs",type=int,default=6)
    args=parser.parse_args()
    destination=args.input/"alternate-orders.jsonl"
    existing=[json.loads(line) for line in destination.read_text().splitlines()] if destination.exists() else []
    done={(row["tier"],row["index"]) for row in existing}
    pending=[]
    for tier in args.tiers:
        for line in (args.input/f"{tier}.jsonl").read_text().splitlines():
            row=json.loads(line)
            if row["status"]=="generated" and (tier,row["index"]) not in done:
                pending.append({key:row[key] for key in ["tier","index","puzzle"]})
    def run(row):
        result=subprocess.run([str(ROOT/"target/release/examples/quality_recheck")],input=json.dumps(row)+"\n",capture_output=True,text=True,check=True)
        return json.loads(result.stdout)
    with destination.open("a") as output,concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures=[pool.submit(run,row) for row in pending]
        for index,future in enumerate(concurrent.futures.as_completed(futures),1):
            result=future.result()
            output.write(json.dumps(result,separators=(",",":"))+"\n")
            output.flush()
            if index%100==0 or any(r["rating"]["status"]!="stalled" for r in result["results"]):
                print(index,len(pending),result["tier"],result["index"],[r["rating"]["status"] for r in result["results"]],flush=True)
    print(f"Completed {len(pending)} new checks",flush=True)


if __name__=="__main__":
    main()
