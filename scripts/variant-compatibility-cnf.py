"""Write a DIMACS formula for the selected fixed 9×9 rules over standard boxes."""

import argparse
from itertools import combinations


def box(row, column):
    return [9 * (row + dr) + column + dc for dr in range(3) for dc in range(3)]


def variable(cell, digit):
    return 9 * cell + digit


def clauses_for(rules):
    digits = range(1, 10)
    houses = [[9 * row + col for col in range(9)] for row in range(9)]
    houses += [[9 * row + col for row in range(9)] for col in range(9)]
    houses += [box(row, col) for row in (0, 3, 6) for col in (0, 3, 6)]
    if "windoku" in rules:
        houses += [box(row, col) for row in (1, 5) for col in (1, 5)]
    if "diagonal-main" in rules:
        houses.append(list(range(0, 81, 10)))
    if "diagonal-anti" in rules:
        houses.append(list(range(8, 73, 8)))
    exactly_one = [[variable(cell, digit) for digit in digits] for cell in range(81)]
    exactly_one += [[variable(cell, digit) for cell in house] for house in houses for digit in digits]
    for group in exactly_one:
        yield group
        yield from ((-a, -b) for a, b in combinations(group, 2))

    for a, b in combinations(range(81), 2):
        dr, dc = abs(a // 9 - b // 9), abs(a % 9 - b % 9)
        if (("anti-king" in rules and dr == dc == 1) or
                ("anti-knight" in rules and dr * dc == 2)):
            yield from ((-variable(a, d), -variable(b, d)) for d in digits)
        if "non-consecutive" in rules and dr + dc == 1:
            for d in range(1, 9):
                yield -variable(a, d), -variable(b, d + 1)
                yield -variable(a, d + 1), -variable(b, d)

    if "global-entropy" in rules:
        for r in range(8):
            for c in range(8):
                start = 9 * r + c
                for first in (1, 4, 7):
                    yield [variable(start + delta, d) for delta in (0, 1, 9, 10)
                           for d in range(first, first + 3)]


def symmetry_clauses(rules):
    if "non-consecutive" in rules:
        # Digit reversal puts the center at 1–5. Transpose preserves every
        # supported rule and can order the two off-diagonal corners.
        yield from ((-variable(40, digit),) for digit in range(6, 10))
        for a in range(2, 10):
            yield from ((-variable(8, a), -variable(72, b)) for b in range(1, a))
    elif "global-entropy" in rules:
        # The three groups and the labels within each group are interchangeable.
        # Put first appearances in group order and digits within each group in order.
        precedence = [(1, 2), (2, 3), (4, 5), (5, 6), (7, 8), (8, 9), (1, 4), (4, 7)]
        for a, b in precedence:
            yield from ((-variable(left, a), -variable(right, b))
                        for left in range(9) for right in range(left))
    else:
        # Every permutation of the digit labels preserves the remaining rules.
        yield from ((variable(column, column + 1),) for column in range(9))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rules", nargs="+", choices=(
        "windoku", "diagonal-main", "diagonal-anti", "anti-king",
        "anti-knight", "non-consecutive", "global-entropy",
    ))
    parser.add_argument("--use-symmetries", action="store_true",
                        help="Keep one or more representatives of each symmetry class.")
    args = parser.parse_args()
    rules = set(args.rules)
    clauses = list(clauses_for(rules))
    if args.use_symmetries:
        clauses.extend(symmetry_clauses(rules))
    print("p cnf", 729, len(clauses))
    for clause in clauses:
        print(*clause, 0)
