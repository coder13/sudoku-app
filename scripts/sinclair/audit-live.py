"""Independently prove unique answers and necessary variant rules with the Z3 CLI."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import gzip
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess

CELLS, DIGITS = range(81), range(1, 10)
VARS = [[f"v{i}_{d}" for d in range(10)] for i in CELLS]
ROWS = [[9*r+c for c in range(9)] for r in range(9)]
COLS = [list(row) for row in zip(*ROWS)]
BOXES = [[27*(b//3)+3*(b%3)+9*(i//3)+i%3 for i in range(9)] for b in range(9)]


def encode(variant, puzzle):
    clauses = ["(set-option :timeout 90000)", "(set-logic QF_FD)", "(declare-const useRule Bool)"]
    def require(expression, conditional=False):
        if conditional:
            expression = f"(=> useRule {expression})"
        clauses.append(f"(assert {expression})")
    def exactly_one(terms, conditional=False):
        names = " ".join(terms)
        require(f"(or {names})", conditional)
        require(f"((_ at-most 1) {names})", conditional)
    def house(cells, conditional=False):
        assert len(cells) == len(set(cells)) == 9
        for digit in DIGITS:
            exactly_one([VARS[i][digit] for i in cells], conditional)
    def pair(a, b, permitted):
        for digit in DIGITS:
            legal = [VARS[b][d] for d in DIGITS if permitted(digit, d)]
            allowed = "(or " + " ".join(legal) + ")" if legal else "false"
            require(f"(=> {VARS[a][digit]} {allowed})", True)
    def sum_equals(cells, target, circle=None):
        literals = [VARS[c][d] for c in cells for d in DIGITS]
        if circle is not None:
            # The nine negated circle indicators have weighted sum 45 minus its digit.
            literals.extend(f"(not {VARS[circle][d]})" for d in DIGITS)
        coeff = " ".join(str(d) for _ in range(len(literals)//9) for d in DIGITS)
        require(f"((_ pbeq {target} {coeff}) {' '.join(literals)})", True)
    for i in CELLS:
        for digit in DIGITS:
            clauses.append(f"(declare-const {VARS[i][digit]} Bool)")
        exactly_one(VARS[i][1:])
        if puzzle["givens"][i] != "0":
            require(VARS[i][int(puzzle["givens"][i])])
    for unit in ROWS + COLS:
        house(unit)
    if variant == "jigsaw":
        for region in puzzle["regions"]["regions"]:
            house(region, True)
    else:
        for box in BOXES:
            house(box)
    for rule in puzzle.get("rules", []):
        kind = rule["type"]
        if kind == "diagonal":
            house(list(range(0,81,10)) if rule["diagonal"] == "main" else list(range(8,73,8)), True)
        elif kind == "extra-house":
            house(rule["cells"], True)
        elif kind == "killer-cages":
            for cage in rule["cages"]:
                for d in DIGITS:
                    require(f"((_ at-most 1) {' '.join(VARS[i][d] for i in cage['cells'])})", True)
                sum_equals(cage["cells"], cage["sum"])
        elif kind == "anti-knight":
            for a in CELLS:
                for b in range(a):
                    if abs(a//9-b//9)*abs(a%9-b%9) == 2:
                        for d in DIGITS:
                            require(f"(or (not {VARS[a][d]}) (not {VARS[b][d]}))", True)
        elif kind == "thermometer":
            for a,b in zip(rule["cells"],rule["cells"][1:]):
                pair(a,b,lambda x,y: x < y)
        elif kind == "arrow":
            sum_equals(rule["cells"], 45, circle=rule["circle"])
        elif kind == "kropki":
            for color, related in [("consecutive", lambda x,y: abs(x-y)==1), ("ratioTwo", lambda x,y: x==2*y or y==2*x)]:
                marks = rule.get(color, {})
                drawn = {tuple(sorted(edge)) for edge in marks.get("pairs", [])}
                for a in CELLS:
                    for b in ([a+1] if a%9<8 else []) + ([a+9] if a<72 else []):
                        if (a,b) in drawn:
                            pair(a,b,related)
                        elif marks.get("negative"):
                            pair(a,b,lambda x,y: not related(x,y))
        else:
            raise ValueError(f"Unimplemented independent rule {kind}")
    return "\n".join(clauses)


def certify(item):
    key, (variant, puzzle) = item
    with subprocess.Popen(["z3", "-in", "-smt2"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True) as z3:
        def send(text):
            z3.stdin.write(text+"\n")
            z3.stdin.flush()
        def expect(answer):
            observed = z3.stdout.readline().strip()
            if observed != answer:
                raise ValueError((key, variant, answer, observed))
        try:
            send(encode(variant, puzzle) + "\n(check-sat-assuming (useRule))")
            expect("sat")
            names = " ".join(VARS[i][d] for i in CELLS for d in DIGITS)
            send(f'(get-value ({names}))\n(echo "end")')
            model = {}
            for line in z3.stdout:
                if line.strip() == "end":
                    break
                for i,d in re.findall(r"\(v(\d+)_(\d) true\)", line):
                    assert int(i) not in model
                    model[int(i)] = int(d)
            assert len(model) == 81
            block = " ".join(f"(not {VARS[i][model[i]]})" for i in CELLS)
            send(f"(assert (or {block}))\n(check-sat-assuming (useRule))")
            expect("unsat")
            if variant != "classic":
                send("(check-sat-assuming ((not useRule)))")
                expect("sat")
            solution = "".join(str(model[i]) for i in CELLS)
            return key, sha256(solution.encode()).hexdigest()
        finally:
            send("(exit)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("draws", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--jobs", type=int, default=2)
    args = parser.parse_args()
    with gzip.open(args.draws, "rt") as f:
        rows = [json.loads(s) for s in f][1:]
    unique, pairs = {}, defaultdict(dict)
    for r in rows:
        if "error" in r:
            continue
        key = sha256(json.dumps(r["puzzle"], sort_keys=True, separators=(",",":")).encode()).hexdigest()
        unique[key] = r["id"], r["puzzle"]
        pairs[r["id"],r["tier"],r["seed"]][r["mode"]] = key
    with ThreadPoolExecutor(args.jobs) as pool:
        answers = dict(pool.map(certify, unique.items()))
    same = Counter()
    for (variant, _, _), modes in pairs.items():
        if len(modes) == 2 and answers[modes["standard"]] == answers[modes["sinclair"]]:
            same[variant] += 1
    report = dict(z3=subprocess.check_output(["z3", "--version"], text=True).strip(),
                  drawFileSha256=sha256(args.draws.read_bytes()).hexdigest(), verifiedReturnedPuzzles=sum(map(len,pairs.values())),
                  distinctDefinitions=len(unique), uniqueSolutionsByFamily=dict(Counter(v for v,_ in unique.values())),
                  distinctVariantsWithNecessaryRule=sum(v != "classic" for v,_ in unique.values()),
                  sameDisplayedSolutionByFamily=dict(same), certificates=answers)
    args.output.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n")
    print("Verified", len(unique), "distinct definitions across", report["verifiedReturnedPuzzles"], "returned puzzles.")


if __name__ == "__main__":
    main()
