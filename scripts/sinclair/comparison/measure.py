"""Visible layout, direct opening placements and pacing of a verified logical path."""
from functools import lru_cache
from itertools import combinations, groupby

ROWS = [list(range(r * 9, r * 9 + 9)) for r in range(9)]
COLS = [list(range(c, 81, 9)) for c in range(9)]
BOXES = [[(b // 3 * 3 + r) * 9 + b % 3 * 3 + c for r in range(3) for c in range(3)] for b in range(9)]
DIAGONALS = [list(range(0, 81, 10)), list(range(8, 73, 8))]
EDGES = [(a, b) for a in range(81) for b in (a + 1, a + 9) if b < 81 and (b == a + 9 or a // 9 == b // 9)]
SUMS = {}
for size in range(1, 10):
    for digits in combinations(range(1, 10), size):
        SUMS.setdefault((size, sum(digits)), []).append(sum(1 << (d - 1) for d in digits))


@lru_cache(maxsize=32_768)
def cage_support(domains, total):
    """Union of all distinct-digit assignments that fit this single printed cage."""
    support = [0] * len(domains)
    order = sorted(range(len(domains)), key=lambda i: domains[i].bit_count())
    assignment = [0] * len(domains)
    def visit(depth, remaining):
        if depth == len(order):
            for i, bit in enumerate(assignment):
                support[i] |= bit
            return
        cell = order[depth]
        options = domains[cell] & remaining
        while options:
            bit = options & -options
            options ^= bit
            assignment[cell] = bit
            visit(depth + 1, remaining ^ bit)
    for digits in SUMS[len(domains), total]:
        if all(mask & digits for mask in domains):
            visit(0, digits)
    assert all(support)
    return tuple(support)


def opening(givens, houses, cages, solution):
    placed = [1 << (int(d) - 1) if d != "0" else 0 for d in givens]
    domains = [b or 511 for b in placed]
    for unit in houses:
        used = 0
        for i in unit:
            used |= placed[i]
        for i in unit:
            if not placed[i]:
                domains[i] &= ~used
    def immediate():
        moves = {(i, m.bit_length()) for i, m in enumerate(domains) if not placed[i] and m.bit_count() == 1}
        for unit in houses:
            for digit in range(1, 10):
                bit = 1 << (digit - 1)
                cells = [i for i in unit if domains[i] & bit]
                if len(cells) == 1 and not placed[cells[0]]:
                    moves.add((cells[0], digit))
        assert all(int(solution[i]) == d for i, d in moves)
        return moves
    plain = immediate()
    for cage in cages:
        cells = cage["cells"]
        allowed = cage_support(tuple(domains[i] for i in cells), cage["sum"])
        for cell, mask in zip(cells, allowed):
            domains[cell] = mask
        if len(cells) == 1 and not placed[cells[0]]:
            plain.add((cells[0], cage["sum"]))
    enabled = immediate()
    assert plain <= enabled
    return len(plain), len(enabled)


def cage_shape(cells):
    points = [divmod(i, 9) for i in cells]
    options = []
    for ax in (-1, 1):
        for ay in (-1, 1):
            for swap in (True, False):
                t = [(ax * (c if swap else r), ay * (r if swap else c)) for r, c in points]
                x, y = min(i for i, _ in t), min(j for _, j in t)
                options.append(tuple(sorted((i-x, j-y) for i, j in t)))
    return min(options)


def completed_board_key(solution, family):
    """Compare answer grids under the eight square orientations and permitted digit renaming."""
    rows = [solution[i:i+9] for i in range(0, 81, 9)]
    options = []
    for axes in (rows, list(zip(*rows))):
        for vertical in (axes, axes[::-1]):
            for direction in (1, -1):
                board = "".join("".join(row[::direction]) for row in vertical)
                if family != "killer":
                    # A complete first row contains every digit, in order of first appearance.
                    board = board.translate(str.maketrans(board[:9], "123456789"))
                options.append(board)
    return min(options)


def layout(puzzle, family, solution):
    givens = puzzle["givens"]
    given = {i for i, d in enumerate(givens) if d != "0"}
    cages = [c for r in puzzle.get("rules", []) for c in r.get("cages", [])]
    singles = {c["cells"][0] for c in cages if len(c["cells"]) == 1}
    simple, first = opening(givens, ROWS + COLS + BOXES + (DIAGONALS if family == "x" else []), cages, solution)
    off = given - {40}
    result = dict(givens=len(given), fixed=len(given | singles), singleton_cages=len(singles),
                  simple_opening=simple, opening=first)
    if family != "killer":
        paired = sum(80 - i in off for i in off) / len(off)
        chance = (len(off) - 1) / 79
        result.update(paired_givens=paired, perfect_symmetry=int(paired == 1), excess_symmetry=paired-chance)
    else:
        owner = {i: n for n, cage in enumerate(cages) for i in cage["cells"]}
        assert len(owner) == 81
        joins = {(a, b) for a, b in EDGES if owner[a] == owner[b]}
        paired = sum((80-b, 80-a) in joins for a, b in joins) / len(joins)
        result.update(cages=len(cages), cage_shapes=len({cage_shape(c["cells"]) for c in cages}),
                      paired_joins=paired, perfect_symmetry=int(paired == 1 and all(80-i in given for i in given)))
    return result


def pacing(events, empty):
    # A step can remove several candidates. Runs count placed digits or removal-only steps.
    assert events and sum(e[2] for e in events) == empty
    runs = [(placing, list(seq)) for placing, seq in groupby(events, key=lambda e: bool(e[2]))]
    dry = [len(run) for place, run in runs if not place]
    releases = [sum(e[2] for e in run) for i, (place, run) in enumerate(runs) if place and 0 < i < len(runs)-1]
    after_last = sum(e[2] for e in runs[-1][1]) if dry and runs[-1][0] else None
    assert not dry or after_last is not None
    return dict(steps=len(events), elimination_steps=len([e for e in events if not e[2]]),
                elimination_actions=sum(e[3] for e in events), distinct_techniques=len({e[0] for e in events}),
                opening_gap=0 if runs[0][0] else len(runs[0][1]), longest_gap=max(dry, default=0),
                mid_release=max(releases, default=0), release5=int(any(n >= 5 for n in releases)),
                finish=after_last, finish_fraction=after_last / empty if dry else None,
                cage_steps=sum(e[0] in ("cage-combinations", "cage-house-sum") for e in events),
                house45_steps=sum(e[0] == "cage-house-sum" for e in events),
                diagonal_steps=sum(e[1] == "diagonal" for e in events),
                forcing_steps=sum("forcing" in e[0] for e in events))
