#!/usr/bin/env python3
"""Summarize audit traces and check solutions with an independent Python solver.

These diagnostics describe the sampled solve path. They are not a calibrated
measure of human enjoyment and do not change the app's difficulty labels.
"""
import argparse
import collections
import csv
import json
import pathlib
import statistics

TIERS = ["beginner", "easy", "medium", "tricky", "hard", "very-hard", "expert", "master", "extreme", "impossible"]
SINGLES = {"full-house", "hidden-single-box", "naked-single", "hidden-single"}
ROOT = pathlib.Path(__file__).resolve().parents[1]
ALL = (1 << 9) - 1
BOX = [(cell // 27) * 3 + cell % 9 // 3 for cell in range(81)]
PEERS = [{other for other in range(81) if other != cell and (other // 9 == cell // 9 or other % 9 == cell % 9 or BOX[other] == BOX[cell])} for cell in range(81)]


def exact_solutions(text, node_limit=2_000_000):
    """Count up to two completions with row/column/box masks, independent of Rust."""
    board = [int(digit) for digit in text]
    rows, cols, boxes = [0]*9, [0]*9, [0]*9
    for cell, digit in enumerate(board):
        if digit:
            bit = 1 << (digit-1)
            row, col, box = cell//9, cell%9, BOX[cell]
            if (rows[row] | cols[col] | boxes[box]) & bit:
                return {"count":0,"nodes":0,"exhausted":False,"solution":None}
            rows[row] |= bit
            cols[col] |= bit
            boxes[box] |= bit
    solutions, nodes, exhausted = [], 0, False

    def visit():
        nonlocal nodes, exhausted
        if len(solutions) >= 2 or exhausted:
            return
        nodes += 1
        if nodes > node_limit:
            exhausted = True
            return
        best, mask, fewest = -1, 0, 10
        for cell, digit in enumerate(board):
            if digit == 0:
                available = ALL & ~(rows[cell//9] | cols[cell%9] | boxes[BOX[cell]])
                count = available.bit_count()
                if count == 0:
                    return
                if count < fewest:
                    best, mask, fewest = cell, available, count
                    if count == 1:
                        break
        if best < 0:
            solutions.append("".join(map(str,board)))
            return
        row, col, box = best//9, best%9, BOX[best]
        while mask and len(solutions) < 2 and not exhausted:
            bit = mask & -mask
            mask -= bit
            board[best] = bit.bit_length()
            rows[row] |= bit
            cols[col] |= bit
            boxes[box] |= bit
            visit()
            rows[row] ^= bit
            cols[col] ^= bit
            boxes[box] ^= bit
            board[best] = 0
    visit()
    return {"count":len(solutions),"nodes":nodes,"exhausted":exhausted,"solution":solutions[0] if solutions else None}


def replay_errors(record):
    board = [int(digit) for digit in record["puzzle"]]
    removed = [0]*81
    errors = []
    for index, step in enumerate(record["steps"]):
        for action in step["actions"]:
            kind, candidate = next(iter(action.items()))
            cell, digit = candidate["cell"], candidate["digit"]
            legal = board[cell] == 0 and not removed[cell] & (1 << (digit-1)) and all(board[peer] != digit for peer in PEERS[cell])
            if not legal:
                errors.append(f"step {index}: {kind} acts on unavailable candidate {cell}:{digit}")
            if kind == "place":
                board[cell] = digit
            else:
                removed[cell] |= 1 << (digit-1)
    if "".join(map(str,board)) != record["solution"]:
        errors.append("trace does not end at the recorded solution")
    return errors


def quantile(values, probability):
    values = sorted(values)
    position = (len(values)-1)*probability
    low = int(position)
    return values[low] + (values[min(low+1,len(values)-1)]-values[low])*(position-low)


def spread(values):
    return {"min":min(values),"p10":quantile(values,.1),"median":statistics.median(values),"p90":quantile(values,.9),"p95":quantile(values,.95),"max":max(values)}


def proof_sizes(evidence):
    """Count named links and forcing inferences, without conflating them."""
    links, assumptions, inferences, depth = 0, 0, 0, 0
    def visit(value, branch_depth=0):
        nonlocal links, assumptions, inferences, depth
        if isinstance(value, dict):
            if "assumption" in value and "steps" in value:
                assumptions += 1
                inferences += len(value["steps"])
                branch_depth += 1
                depth = max(depth,branch_depth)
            for key, child in value.items():
                if key == "links" and isinstance(child,list):
                    links += len(child)
                visit(child,branch_depth)
        elif isinstance(value,list):
            for child in value:
                visit(child,branch_depth)
    visit(evidence)
    return links, assumptions, inferences, depth


def describe(record, levels, uniqueness, quality_version=1):
    steps = record["steps"]
    tier = TIERS.index(record["tier"])
    non_singles = [index for index,step in enumerate(steps) if step["technique"] not in SINGLES]
    target = [index for index,step in enumerate(steps) if levels[step["technique"]] == record["tier"]]
    target_counts = collections.Counter(steps[index]["technique"] for index in target)
    technique_count = len({steps[index]["technique"] for index in non_singles})
    stretches = sum(index == 0 or steps[index-1]["technique"] in SINGLES for index in non_singles)
    trailing = len(steps)-1-non_singles[-1] if non_singles else len(steps)
    leading = non_singles[0] if non_singles else len(steps)
    errors = replay_errors(record)
    if record["unsoundActions"]:
        errors.append("actions conflict with solution")
    if record["rating"]["status"] != {"solved":record["tier"]}:
        errors.append("rating does not match requested tier")
    if tier and record["lower"]["rating"]["status"] != "stalled":
        errors.append("lower canonical profile completed")
    minimum = 4 if quality_version >= 2 else 2
    if record["givens"] > 40 or (tier >= 2 and len(non_singles) < minimum):
        errors.append("quality floor failed")
    if quality_version >= 2 and tier == 2 and (technique_count < 2 or stretches < 2):
        errors.append("Medium variety or repeated discovery floor failed")
    if uniqueness is not None and (uniqueness["count"] != 1 or uniqueness["exhausted"] or uniqueness["solution"] != record["solution"]):
        errors.append("independent uniqueness check failed or was inconclusive")
    sizes = [proof_sizes(step["evidence"]) for step in steps]
    target_sizes = [sizes[index] for index in target]
    flags = []
    if tier >= 2 and trailing >= 30:
        flags.append("30-plus-single-finish")
    if tier >= 2 and len(non_singles) == 2:
        flags.append("exactly-two-non-single-steps")
    if tier >= 2 and len(target) == 1:
        flags.append("one-target-tier-step")
    if tier >= 2 and leading >= 20:
        flags.append("20-plus-single-opening")
    if tier >= 2 and len(non_singles) == 2 and trailing >= .8*(81-record["givens"]):
        flags.append("two-eliminations-then-80-percent-single-finish")
    return {
        "tier":record["tier"],"index":record["index"],"seed":record["seed"],"puzzle":record["puzzle"],"canonical":record["canonical"],
        "givens":record["givens"],"steps":len(steps),"nonSingleSteps":len(non_singles),"targetTierSteps":len(target),
        "targetTechniques":";".join(sorted(target_counts)),"nonSingleTechniqueCount":technique_count,
        "eliminationStretches":stretches,"qualityVersion":quality_version,
        "initialSingles":leading,"finalSingles":trailing,"firstTargetStep":target[0] if target else None,
        "emptyAtFirstTarget":record["positions"][target[0]]["empty"] if target else None,
        "emptyAtLastNonSingle":record["positions"][non_singles[-1]+1]["empty"] if non_singles else None,
        "initialEasyChoices":record["availability"][0]["easyMoves"],
        "maxProofLinks":max((s[0] for s in sizes),default=0),"maxProofAssumptions":max((s[1] for s in sizes),default=0),
        "maxForcingInferences":max((s[2] for s in sizes),default=0),"maxBranchDepth":max((s[3] for s in sizes),default=0),
        "maxTargetProofLinks":max((s[0] for s in target_sizes),default=0),
        "maxTargetProofAssumptions":max((s[1] for s in target_sizes),default=0),
        "maxTargetForcingInferences":max((s[2] for s in target_sizes),default=0),
        "maxTargetBranchDepth":max((s[3] for s in target_sizes),default=0),
        "generationMs":record["generationMs"],"analysisMs":record["analysisMs"],"route":record["routes"][-1]["route"],
        "attempts":sum(route["attempts"] for route in record["routes"]),"check":"pass" if not errors else "fail",
        "flags":";".join(flags),"errors":";".join(errors),
        "techniqueCounts":record["rating"]["score"]["counts"],"targetCounts":dict(target_counts),
    }


def summarize(rows, calls, levels):
    by_tier = {}
    for tier in TIERS:
        sample = [row for row in rows if row["tier"] == tier]
        if not sample:
            continue
        target_occurrence = collections.Counter(technique for row in sample for technique in row["targetCounts"])
        target_moves = collections.Counter()
        for row in sample:
            target_moves.update(row["targetCounts"])
        structures = collections.Counter(row["canonical"] for row in sample)
        metrics = ["givens","nonSingleSteps","targetTierSteps","nonSingleTechniqueCount","eliminationStretches","initialSingles","finalSingles","initialEasyChoices","maxProofLinks","maxProofAssumptions","maxForcingInferences","maxBranchDepth","maxTargetProofLinks","maxTargetProofAssumptions","maxTargetForcingInferences","maxTargetBranchDepth","generationMs","analysisMs","attempts"]
        by_tier[tier] = {
            "sample":len(sample),"generationCalls":calls[tier],"failedCalls":calls[tier]-len(sample),
            "passed":sum(row["check"]=="pass" for row in sample),"distinctGrids":len({row["puzzle"] for row in sample}),
            "distinctStructures":len(structures),"largestStructureFamily":max(structures.values()),
            "effectiveStructureCount":len(sample)**2/sum(count*count for count in structures.values()),
            "routes":dict(collections.Counter(row["route"] for row in sample)),
            "flags":dict(collections.Counter(flag for row in sample for flag in row["flags"].split(";") if flag)),
            "targetTechniquePuzzles":dict(target_occurrence.most_common()),"targetTechniqueMoves":dict(target_moves.most_common()),
            "unseenTargetTechniques":[technique for technique,level in levels.items() if level==tier and technique not in target_occurrence],
            "metrics":{key:spread([row[key] for row in sample]) for key in metrics},
        }
    return by_tier


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input",type=pathlib.Path)
    parser.add_argument("--verify",action="store_true")
    parser.add_argument("--quality-version",type=int,choices=[1,2],default=1,
                        help="Use 1 for the original audit, 2 for the stronger generation rules")
    parser.add_argument("--tiers",nargs="*",default=TIERS)
    args=parser.parse_args()
    levels=json.loads((ROOT/"src/sudoku/generated/lesson-difficulties.json").read_text())
    rows,calls=[],collections.Counter()
    alternate_path=args.input/"alternate-orders.jsonl"
    alternatives={(row["tier"],row["index"]):row for row in map(json.loads,alternate_path.read_text().splitlines())} if alternate_path.exists() else {}
    verification_path=args.input/"independent-checks.jsonl"
    checks={row["puzzle"]:row for row in map(json.loads,verification_path.read_text().splitlines())} if verification_path.exists() else {}
    with verification_path.open("a") as output:
        for tier in args.tiers:
            path=args.input/f"{tier}.jsonl"
            if not path.exists():
                continue
            for line in path.read_text().splitlines():
                record=json.loads(line)
                calls[tier]+=1
                if record["status"] != "generated":
                    continue
                check=checks.get(record["puzzle"])
                if args.verify and check is None:
                    check={"puzzle":record["puzzle"],**exact_solutions(record["puzzle"])}
                    output.write(json.dumps(check,separators=(",",":"))+"\n")
                    output.flush()
                    checks[record["puzzle"]]=check
                row=describe(record,levels,check,args.quality_version)
                alternate=alternatives.get((row["tier"],row["index"]),{"results":[]})
                solved=[result for result in alternate["results"] if result["rating"]["status"]!="stalled"]
                row["alternateOrdersChecked"]=len(alternate["results"])
                row["lowerRouteFound"]=bool(solved)
                row["lowestObservedTier"]=min([row["tier"]]+[result["rating"]["status"]["solved"] for result in solved],key=TIERS.index)
                row["alternateTraceErrors"]=";".join(error for result in solved for error in replay_errors({"puzzle":row["puzzle"],"solution":record["solution"],"steps":result["steps"]}))
                rows.append(row)
            print(f"Summarized {tier}: {sum(row['tier']==tier for row in rows)}",flush=True)
    rows.sort(key=lambda row:(TIERS.index(row["tier"]),row["index"]))
    structure_counts=collections.Counter(row["canonical"] for row in rows)
    structure_tiers={}
    for row in rows:
        current=structure_tiers.get(row["canonical"],row["lowestObservedTier"])
        structure_tiers[row["canonical"]]=min([current,row["lowestObservedTier"]],key=TIERS.index)
    for row in rows:
        row["structureCopies"]=structure_counts[row["canonical"]]
        row["lowestEquivalentTier"]=structure_tiers[row["canonical"]]
        row["reviewStatus"]="lower-rating-proved" if TIERS.index(row["lowestEquivalentTier"])<TIERS.index(row["tier"]) else "thin-trace-review" if "two-eliminations-then-80-percent-single-finish" in row["flags"] else "repeat-family-review" if row["structureCopies"]>1 else "no-major-flag"
    summary=summarize(rows,calls,levels)
    for tier,result in summary.items():
        sample=[row for row in rows if row["tier"]==tier]
        result["alternateLowerSolved"]=sum(row["lowerRouteFound"] for row in sample)
        result["equivalentLowerSolved"]=sum(TIERS.index(row["lowestEquivalentTier"])<TIERS.index(tier) for row in sample)
        result["alternateTraceErrors"]=sum(bool(row["alternateTraceErrors"]) for row in sample)
    (args.input/"summary.json").write_text(json.dumps(summary,indent=2)+"\n")
    (args.input/"metrics.json").write_text(json.dumps(rows,separators=(",",":"))+"\n")
    if rows:
        fields=[key for key in rows[0] if key not in {"techniqueCounts","targetCounts"}]
        with (args.input/"puzzle-quality.csv").open("w",newline="") as output:
            writer=csv.DictWriter(output,fieldnames=fields,extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    print(json.dumps({"puzzles":len(rows),"failedChecks":sum(row["check"]!="pass" for row in rows),"independentlyVerified":len(checks)}),flush=True)


if __name__=="__main__":
    main()
