"""Fit the offline generator. Requires only Python 3.10 or later."""
import argparse
import hashlib
import json
import math
import statistics
from collections import Counter
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
REVISION = 'f4b71bc9170c4a072fad7056e140c14968941c3d'
# SHA-256 of the upstream bytes, including the final newline.
FILES = {
    'JigsawSudoku': ['a3dccd9365866252553518b0f7841ab54efdd9f2f884773e27abe9e4a76aa5e7',
                     'ce414200aeee0ac6946d269f268a0cd56d3f971cd37624ce03568524c5ce5184'],
    'KillerSudoku': ['2cf280fb2312a440a19229a3de5ac8b80a6b4193ff0ea94e0ee79fcf30a5fa12',
                     'd8d87bbf758f34cf93001ebb1caf726a764b71b411a1d4863e1c83480cc74df7'],
}
MODEL = Path(__file__).with_name('model.json')
ROWS = [list(range(i * 9, i * 9 + 9)) for i in range(9)]
COLS = [list(range(i, 81, 9)) for i in range(9)]
BOXES = [[i for i in range(81) if i // 27 * 3 + i % 9 // 3 == b] for b in range(9)]
NEIGHBORS = [[j for j in range(81) if abs(i // 9 - j // 9) + abs(i % 9 - j % 9) == 1] for i in range(81)]


def orientations(points):
    for swap in (False, True):
        for sy in (-1, 1):
            for sx in (-1, 1):
                moved = [(sy * (x if swap else y), sx * (y if swap else x)) for y, x in points]
                top = min(y for y, _ in moved)
                left = min(x for _, x in moved)
                yield sorted((y - top, x - left) for y, x in moved)


def shape(cells):
    # Bounding-box coordinates in a 9-column grid, independent of orientation.
    return min(tuple(9 * y + x for y, x in points) for points in orientations([divmod(c, 9) for c in cells]))


def connected(cells):
    group = set(cells)
    reached = {cells[0]}
    todo = list(reached)
    while todo:
        new = (set(NEIGHBORS[todo.pop()]) & group) - reached
        reached.update(new)
        todo.extend(new)
    return reached == group


def perimeter(cells):
    return sum(4 - len(set(NEIGHBORS[c]) & set(cells)) for c in cells)


def split_key(labels):
    # A rotation, reflection, digit relabel, or new region numbering stays in one fold.
    grid = [divmod(i, 9) for i in range(81)]
    keys = []
    for swap in (False, True):
        for flip_y in (False, True):
            for flip_x in (False, True):
                ids = {}
                code = []
                for y, x in grid:
                    r, c = (x, y) if swap else (y, x)
                    v = labels[9 * (8-r if flip_y else r) + (8-c if flip_x else c)]
                    code.append(ids.setdefault(v, len(ids)))
                keys.append(bytes(code))
    return min(keys)


def is_test(key):
    return int.from_bytes(hashlib.sha256(key).digest()[:4], 'big') % 5 == 0


def classic_holdout(rows):
    # Give every represented grade a holdout. Group layouts before assigning folds.
    groups = {}
    for row in rows:
        groups.setdefault(row['key'], []).append(row['level'])
    levels = {}
    for key, labels in groups.items():
        most_common = Counter(sorted(labels)).most_common(1)[0][0]
        levels.setdefault(most_common, []).append(key)
    return {key for keys in levels.values()
            for key in sorted(keys, key=lambda k: hashlib.sha256(k).digest())[::5]}


def open_singles(givens):
    houses = ROWS + COLS + BOXES
    possible = [set() for _ in givens]
    for c, d in enumerate(givens):
        if d == '0':
            peers = ROWS[c // 9] + COLS[c % 9] + BOXES[c // 27 * 3 + c % 9 // 3]
            possible[c] = set('123456789') - {givens[i] for i in peers}
    singles = {c for c, digits in enumerate(possible) if len(digits) == 1}
    for house in houses:
        for d in '123456789':
            cells = [i for i in house if d in possible[i]]
            if len(cells) == 1:
                singles.add(cells[0])
    return len(singles)


def variant_rows(folder, kind):
    rows = []
    rejected = Counter()
    for n, digest in enumerate(FILES[kind]):
        name = f'{kind}_dataset_{n:03}.json'
        path = folder / name
        if not path.exists():
            folder.mkdir(parents=True, exist_ok=True)
            url = f'https://raw.githubusercontent.com/SmilingWayne/puzzlekit-dataset/{REVISION}/assets/data/{kind}/{name}'
            with urlopen(url, timeout=45) as response:
                raw = response.read()
            if hashlib.sha256(raw).hexdigest() != digest:
                raise ValueError(f'Unexpected checksum for {name}')
            path.write_bytes(raw)
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError(f'Unexpected checksum for {name}')
        for record in json.loads(raw)['data'].values():
            lines = record['problem'].splitlines()
            if lines[0] != '9 9':
                continue
            given, labels = (sum((line.split() for line in lines[i:i+9]), []) for i in (1, 10))
            sol = list(map(int, record['solution'].split()[2:]))
            if len(lines) != 19 or any(len(v) != 81 for v in [given, labels, sol]):
                raise ValueError(record['source'])
            groups = [[i for i, label in enumerate(labels) if label == k] for k in sorted(set(labels))]
            houses = ROWS + COLS + (groups if kind == 'JigsawSudoku' else BOXES)
            if any(sorted(sol[i] for i in house) != list(range(1, 10)) for house in houses):
                rejected['solution violates a house'] += 1
                continue
            if any(not connected(group) for group in groups):
                rejected['disconnected region'] += 1
                continue
            if kind == 'KillerSudoku':
                if any(len({sol[i] for i in group}) != len(group) or
                       [given[i] for i in group if given[i] != '-'] != [str(sum(sol[i] for i in group))]
                       for group in groups):
                    rejected['cage disagrees with solution'] += 1
                    continue
            elif any(d != '-' and d != str(s) for d, s in zip(given, sol)):
                rejected['clue disagrees with solution'] += 1
                continue
            rows.append(dict(key=split_key(labels), groups=groups, mask=[int(d != '-') for d in given]))
    return rows, dict(rejected)


def context(mask, i):
    row, col = divmod(i, 9)
    neighbors = (mask[i-9] if row else 0) + (mask[i-1] if col else 0)
    return 3 * ((row % 3 == 1) + (col % 3 == 1)) + neighbors


def mask_model(masks):
    counts = [[1, 2] for _ in range(9)]
    symmetric = 0
    total = [1, 2]
    for mask in masks:
        same = mask == mask[::-1]
        symmetric += same
        for i, bit in enumerate(mask[:41] if same else mask):
            slot = counts[context(mask, i)]
            slot[0] += bit
            slot[1] += 1
            total[0] += bit
            total[1] += 1
    return dict(symmetry=[symmetric + 1, len(masks) + 2], contexts=counts), total


def mask_bits(mask, model, density, masked_density):
    def bits(bit, counts):
        p = counts[0] / counts[1]
        return -math.log2(p if bit else 1-p)
    same = mask == mask[::-1]
    prefix = mask[:41] if same else mask
    flag = bits(same, model['symmetry'])
    return (sum(bits(b, density) for b in mask),
            flag + sum(bits(b, masked_density) for b in prefix),
            flag + sum(bits(b, model['contexts'][context(mask, i)]) for i, b in enumerate(prefix)))


def histogram(items):
    return sorted([value, count] for value, count in Counter(items).items())


def train(cache):
    nikoli = json.loads((ROOT / 'src/sudoku/collections/nikoli-100.json').read_text())
    classic = []
    for row in nikoli:
        mask = [int(d != '0') for d in row['givens']]
        classic.append(dict(key=split_key(mask), mask=mask, level=row['difficulty'],
                            singles=open_singles(row['givens'])))
    jigsaw, j_rejected = variant_rows(cache, 'JigsawSudoku')
    killer, k_rejected = variant_rows(cache, 'KillerSudoku')
    trained = {}
    report = {}
    for name, rows in [('classic', classic), ('jigsaw', jigsaw), ('killer', killer)]:
        held_keys = (classic_holdout(rows) if name == 'classic' else
                     {r['key'] for r in rows if is_test(r['key'])})
        fit = [r for r in rows if r['key'] not in held_keys]
        test = [r for r in rows if r['key'] in held_keys]
        stats = report[name] = dict(train=len(fit), holdout=len(test),
                                    trainLayouts=len({r['key'] for r in fit}),
                                    holdoutLayouts=len({r['key'] for r in test}))
        model = trained[name] = {}
        if name != 'killer':
            masks = [r['mask'] for r in fit]
            model['mask'], masked_density = mask_model(masks)
            density = [1 + sum(map(sum, masks)), 2 + 81 * len(fit)]
            scores = [mask_bits(r['mask'], model['mask'], density, masked_density) for r in test]
            stats['maskBits'] = dict(zip(['density', 'symmetryOnly', 'learned'],
                                         (round(statistics.mean(col), 3) for col in zip(*scores))))
            stats['holdoutClues'] = round(statistics.mean(sum(r['mask']) for r in test), 3)
            stats['holdoutSymmetric'] = sum(r['mask'] == r['mask'][::-1] for r in test)
        if name == 'classic':
            stats['tiers'] = {}
            model['profiles'] = {}
            for level in sorted({r['level'] for r in fit}):
                # A small joint histogram preserves the relation between clues and opening moves.
                group = [r for r in fit if r['level'] == level]
                model['profiles'][level] = [[c, s, n] for (c, s), n in sorted(Counter(
                    (sum(r['mask']), r['singles']) for r in group).items())]
                held = [r for r in test if r['level'] == level]
                stats['tiers'][level] = dict(train=len(group), holdout=len(held),
                    clues=[sum(r['mask']) for r in held], singles=[r['singles'] for r in held])
        if name == 'jigsaw':
            model['clues'] = histogram(sum(r['mask']) for r in fit)
            model['perimeters'] = histogram(sum(map(perimeter, r['groups'])) for r in fit)
            stats['holdoutMeanPerimeter'] = round(statistics.mean(perimeter(g) for r in test for g in r['groups']), 3)
        if name == 'killer':
            # All free polyominoes through size five are common geometric primitives.
            # Larger cages share one escape token in the held-out shape score.
            counts = Counter(shape(g) if len(g) <= 5 else () for r in fit for g in r['groups'])
            model['shapes'] = [[list(s), n] for s, n in sorted(counts.items()) if s]
            model['singletons'] = histogram(sum(len(g) == 1 for g in r['groups']) for r in fit)
            model['cageCounts'] = histogram(len(r['groups']) for r in fit)
            symbols = [shape(g) if len(g) <= 5 else () for r in test for g in r['groups']]
            stats['shapeBits'] = dict(uniform=round(math.log2(22), 3), learned=round(statistics.mean(
                -math.log2((counts[s] + .5) / (counts.total() + 11)) for s in symbols), 3))
            size_counts = Counter()
            for token, count in counts.items():
                size_counts[len(token)] += count
            classes = {1: 1, 2: 1, 3: 2, 4: 5, 5: 12, 0: 1}
            stats['shapeBits']['sizeOnly'] = round(statistics.mean(
                -math.log2((size_counts[len(token)] + .5 * classes[len(token)]) /
                           (counts.total() + 11) / classes[len(token)]) for token in symbols), 3)
            stats['holdoutMeanCages'] = round(statistics.mean(len(r['groups']) for r in test), 3)
            stats['holdoutBentFraction'] = round(statistics.mean(
                len({i//9 for i in g}) > 1 and len({i%9 for i in g}) > 1 for r in test for g in r['groups']), 4)
            stats['largeTrainingCages'] = counts[()]
    report['jigsaw']['rejected'] = j_rejected
    report['killer']['rejected'] = k_rejected
    return trained, report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=MODEL)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    trained, report = train(args.cache)
    encoded = json.dumps(trained, separators=(',', ':')) + '\n'
    if args.check:
        if args.output.read_text() != encoded:
            raise SystemExit('The checked-in model differs from the training result.')
    else:
        args.output.write_text(encoded)
    print(json.dumps(report, indent=2))
