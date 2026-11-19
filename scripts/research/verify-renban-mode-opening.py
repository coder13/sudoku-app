"""Enumerate local digit tuples for the original Renban ModE opening."""
import argparse
from collections import defaultdict
from copy import deepcopy
from hashlib import sha256
from itertools import combinations, permutations, product
import json
from pathlib import Path

DIGITS = tuple(range(1, 10))
A = 36  # R5C1
B = 76  # R9C5
UPPER = (0, 4, 10)
JOINED = (3, 10, 13)


def label(cell):
    return f'R{cell // 9 + 1}C{cell % 9 + 1}'


def standard_boxes():
    return [[row * 9 + col for row in range(r, r + 3) for col in range(c, c + 3)]
            for r in range(0, 9, 3) for c in range(0, 9, 3)]


class Model:
    def __init__(self, puzzle, removals=None):
        regions = puzzle.get('regions', {})
        boxes = regions['regions'] if regions.get('type') == 'jigsaw' else standard_boxes()
        rows = [list(range(row * 9, row * 9 + 9)) for row in range(9)]
        columns = [list(range(column, 81, 9)) for column in range(9)]
        self.peers = [set() for _ in range(81)]
        for house in rows + columns + boxes:
            for cell in house:
                self.peers[cell].update(other for other in house if other != cell)
        blocked = removals or {}
        self.domains = [tuple(digit for digit in ((int(given),) if given != '0' else DIGITS)
                              if digit not in blocked.get(cell, ()))
                        for cell, given in enumerate(puzzle['givens'])]
        self.rules = puzzle['rules']
        self.sites = [tuple(rule['cells']) for rule in self.rules]
        self.tuples = [self.local_rows(rule, cells) for rule, cells in zip(self.rules, self.sites)]

    def local_rows(self, rule, cells):
        size = len(cells)
        peers = [(i, j) for j in range(size) for i in range(j) if cells[i] in self.peers[cells[j]]]
        domains = [self.domains[cell] for cell in cells]
        if rule['type'] == 'renban':
            rows = (values for start in range(1, 11 - size)
                    for values in permutations(range(start, start + size))
                    if all(digit in domain for digit, domain in zip(values, domains)))
        else:
            assert rule['type'] == 'little-killer'
            rows = (values for values in product(*domains) if sum(values) == rule['sum'])
        return [values for values in rows if all(values[i] != values[j] for i, j in peers)]

    def enumerate(self, indices, budget, pinned=None, stop_after_witness=False):
        pinned = pinned or {}
        values = [0] * 81
        for cell, digit in pinned.items():
            assert digit in self.domains[cell]
            assert all(values[peer] != digit for peer in self.peers[cell])
            values[cell] = digit

        known = set(pinned)
        available = set(indices)
        levels = []
        while available:
            rule = min(available, key=lambda i: (-len(known.intersection(self.sites[i])), len(self.tuples[i]), i))
            available.remove(rule)
            cells = self.sites[rule]
            shared = [(i, cell) for i, cell in enumerate(cells) if cell in known]
            new = [(i, cell) for i, cell in enumerate(cells) if cell not in known]
            rows = defaultdict(list)
            for row in self.tuples[rule]:
                rows[tuple(row[i] for i, _ in shared)].append(tuple((cell, row[i]) for i, cell in new))
            levels.append(([cell for _, cell in shared], rows))
            known.update(cells)

        cells = sorted(known)
        supports = {cell: set() for cell in cells}
        checks = solutions = 0
        witness = None

        def visit(level):
            nonlocal checks, solutions, witness
            if level == len(levels):
                solutions += 1
                for cell in cells:
                    supports[cell].add(values[cell])
                if witness is None:
                    witness = {label(cell): values[cell] for cell in cells}
                return stop_after_witness
            shared, possible = levels[level]
            for row in possible.get(tuple(values[cell] for cell in shared), ()):
                if checks == budget:
                    raise BudgetReached
                checks += 1
                if any(values[peer] == digit for cell, digit in row for peer in self.peers[cell]):
                    continue
                for cell, digit in row:
                    values[cell] = digit
                if visit(level + 1):
                    return True
                for cell, _ in row:
                    values[cell] = 0
            return False

        try:
            found = visit(0)
        except BudgetReached:
            return {'status': 'budget-exhausted', 'rowChecks': checks, 'partialTupleCount': solutions}
        return {'status': 'witness' if found else 'complete', 'rowChecks': checks, 'tupleCount': solutions,
                'support': {label(cell): sorted(digits) for cell, digits in supports.items()},
                'witness': witness}

    def connected_joins(self, max_rules):
        for size in range(2, max_rules + 1):
            for group in combinations(range(len(self.rules)), size):
                if len({self.rules[index]['type'] for index in group}) < 2:
                    continue
                reached = {group[0]}
                cells = set(self.sites[group[0]])
                while len(reached) < size:
                    next_rules = {index for index in group if index not in reached
                                  and cells.intersection(self.sites[index])}
                    if not next_rules:
                        break
                    reached.update(next_rules)
                    cells.update(cell for index in next_rules for cell in self.sites[index])
                if len(reached) == size:
                    yield group


class BudgetReached(Exception):
    pass


def output(kind, **record):
    print(json.dumps({'kind': kind, **record}, separators=(',', ':')), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fixture', type=Path)
    parser.add_argument('--budget', type=int, default=250_000, help='Per-scope row-check limit')
    args = parser.parse_args()
    assert args.budget > 0
    source = args.fixture.read_bytes()
    puzzle = json.loads(source)['puzzle']
    assert puzzle['givens'] == '0' * 81
    expected = {0: (25, (27, 19, 11, 3)), 3: (15, (76, 66, 56, 46, 36))}
    for index, (total, cells) in expected.items():
        assert puzzle['rules'][index]['sum'] == total and tuple(puzzle['rules'][index]['cells']) == cells
    assert [tuple(puzzle['rules'][index]['cells']) for index in (4, 10, 13)] == [
        (3, 11, 19), (27, 36, 45), (46, 56, 66),
    ]
    model = Model(puzzle)
    output('manifest', fixture=str(args.fixture), fixtureSha256=sha256(source).hexdigest(),
           maxRules=5, rowBudget=args.budget, tupleCounts=[len(rows) for rows in model.tuples],
           selectedRules=list(JOINED), domains=list(DIGITS))
    for indices in model.connected_joins(5):
        output('search', ruleIndices=indices)
        output('scope', ruleIndices=indices, **model.enumerate(indices, args.budget))

    cases = [
        ('upper-three', model, UPPER),
        ('lower-two', model, (3, 13)),
        ('three-clue-proof', model, JOINED),
        ('removed-2-at-R5C1', Model(puzzle, {A: {2}}), JOINED),
    ]
    altered = deepcopy(puzzle)
    boxes = standard_boxes()
    # Swap the two boundary cells across boxes 7 and 8 to keep both regions connected.
    boxes[6][boxes[6].index(56)] = 66
    boxes[7][boxes[7].index(66)] = 56
    altered['regions'] = {'type': 'jigsaw', 'regions': boxes}
    cases.append(('jigsaw-unrelated-boundary-swap', Model(altered), JOINED))
    for name, engine, indices in cases:
        output('control', name=name, ruleIndices=indices, **engine.enumerate(indices, args.budget))

    output('pinned', name='reject-8-at-R9C5', ruleIndices=JOINED, **model.enumerate(JOINED, args.budget, {B: 8}))
    for dropped in JOINED:
        indices = tuple(index for index in JOINED if index != dropped)
        output('pinned', name='drop-one-clue', dropped=dropped, ruleIndices=indices,
               **model.enumerate(indices, args.budget, {B: 8}, stop_after_witness=True))

    boxes = standard_boxes()
    # These cells shift the boundary between boxes 4 and 5 without disconnecting either region.
    boxes[3] = sorted(set(boxes[3]) - {46, 47} | {30, 31})
    boxes[4] = sorted(set(boxes[4]) - {30, 31} | {46, 47})
    altered['regions'] = {'type': 'jigsaw', 'regions': boxes}
    output('pinned', name='move-R6C2-outside-region', ruleIndices=JOINED,
           **Model(altered).enumerate(JOINED, args.budget, {B: 8}, stop_after_witness=True))
    output('pinned', name='repeat-outside-digits', ruleIndices=JOINED,
           **model.enumerate(JOINED, args.budget, {A: 3, B: 3}, stop_after_witness=True))


if __name__ == '__main__':
    main()
