"""Independent count-to-two search and Sudoku equivalence checks for Classic Sudoku."""
from collections import defaultdict
from itertools import permutations, product


AXIS = tuple(tuple(3 * group + cell for group, band in zip(groups, bands) for cell in band)
             for groups in permutations(range(3)) for bands in product(permutations(range(3)), repeat=3))


def build_cover():
    placements = []
    constraint_rows = [0] * 324
    for cell in range(81):
        row, column = divmod(cell, 9)
        box = row // 3 * 3 + column // 3
        for digit in range(9):
            constraints = (cell, 81 + 9 * row + digit, 162 + 9 * column + digit, 243 + 9 * box + digit)
            for index in constraints:
                constraint_rows[index] |= 1 << len(placements)
            placements.append(constraints)
    covers = []
    for constraints in placements:
        incompatible = 0
        for index in constraints:
            incompatible |= constraint_rows[index]
        covers.append((sum(1 << index for index in constraints), incompatible))
    return constraint_rows, covers


CONSTRAINT_ROWS, COVERS = build_cover()


def count_solutions(puzzle, limit):
    # Each placement covers its cell and one occurrence of its digit in each house.
    open_constraints = (1 << 324) - 1
    open_placements = (1 << 729) - 1
    chosen = []
    for cell, digit in enumerate(puzzle):
        if digit == '0':
            continue
        placement = 9 * cell + int(digit) - 1
        if not open_placements & (1 << placement):
            return {'status': 'unsolvable', 'nodes': 0, 'first': None}
        covered, incompatible = COVERS[placement]
        open_constraints &= ~covered
        open_placements &= ~incompatible
        chosen.append(placement)

    nodes, solutions, first = 0, 0, None

    def visit(constraints, placements):
        nonlocal nodes, solutions, first
        if nodes == limit:
            return False
        nodes += 1
        if not constraints:
            solutions += 1
            if first is None:
                cells = ['0'] * 81
                for placement in chosen:
                    cell, digit = divmod(placement, 9)
                    cells[cell] = str(digit + 1)
                first = ''.join(cells)
            return True

        pending, choices, width = constraints, 0, 10
        while pending:
            lowest = pending & -pending
            pending -= lowest
            permitted = CONSTRAINT_ROWS[lowest.bit_length() - 1] & placements
            count = permitted.bit_count()
            if count < width:
                choices, width = permitted, count
                if width <= 1:
                    break
        while choices and solutions < 2:
            lowest = choices & -choices
            choices -= lowest
            placement = lowest.bit_length() - 1
            covered, incompatible = COVERS[placement]
            chosen.append(placement)
            complete = visit(constraints & ~covered, placements & ~incompatible)
            chosen.pop()
            if not complete:
                return False
        return True

    complete = visit(open_constraints, open_placements)
    status = ('unsolvable', 'unique', 'multiple')[solutions] if complete else 'node-limit'
    return {'status': status, 'nodes': nodes, 'first': first}


def transpose(puzzle):
    return ''.join(puzzle[column + 9 * row] for column in range(9) for row in range(9))


def invariant(puzzle):
    def line_signature(grid):
        counts = [grid[row:row + 9].count('0') for row in range(0, 81, 9)]
        return tuple(sorted(tuple(sorted(counts[start:start + 3])) for start in (0, 3, 6)))

    return tuple(sorted((line_signature(puzzle), line_signature(transpose(puzzle)))))


def equivalent(left, right):
    """Find a legal row, column and digit mapping, trying both orientations."""
    if left == right:
        return True
    if invariant(left) != invariant(right):
        return False
    target = tuple(right[start:start + 9] for start in range(0, 81, 9))
    target_masks = [sum(1 << col for col, digit in enumerate(row) if digit != '0') for row in target]
    target_counts = [sum(row[col] != '0' for row in target) for col in range(9)]

    for oriented in (left, transpose(left)):
        source = tuple(oriented[start:start + 9] for start in range(0, 81, 9))
        counts = [sum(row[col] != '0' for row in source) for col in range(9)]
        for columns in AXIS:
            if any(counts[col] != count for col, count in zip(columns, target_counts)):
                continue
            masks = [sum(1 << col for col, old in enumerate(columns) if row[old] != '0') for row in source]
            choices = []
            for target_band in range(0, 9, 3):
                matching = []
                for source_band in range(0, 9, 3):
                    for rows in permutations(range(source_band, source_band + 3)):
                        if all(masks[row] == target_masks[target_band + i] for i, row in enumerate(rows)):
                            matching.append(rows)
                if not matching:
                    break
                choices.append(matching)
            if len(choices) != 3:
                continue
            for bands in product(*choices):
                if len({band[0] // 3 for band in bands}) != 3:
                    continue
                rows = [row for band in bands for row in band]
                forward, reverse = {}, {}
                valid = True
                for old, new in zip(rows, target):
                    for j, digit in enumerate(new):
                        if digit == '0':
                            continue
                        original = source[old][columns[j]]
                        if forward.get(original, digit) != digit or reverse.get(digit, original) != original:
                            valid = False
                            break
                        forward[original] = digit
                        reverse[digit] = original
                    if not valid:
                        break
                if valid:
                    return True
    return False


def verify_identities(puzzle_keys):
    groups = defaultdict(list)
    checked = 0
    for puzzle, key in puzzle_keys.items():
        peers = groups[invariant(puzzle)]
        matched = False
        for other, other_key in peers:
            checked += 1
            same = equivalent(puzzle, other)
            assert same == (key == other_key), (puzzle, other, key, other_key)
            matched |= same
        if not matched:
            peers.append((puzzle, key))
    observed = [key for group in groups.values() for _, key in group]
    assert len(observed) == len(set(observed))
    return {'rawPuzzles': len(puzzle_keys), 'logicalIdentities': len(observed), 'comparisons': checked}
