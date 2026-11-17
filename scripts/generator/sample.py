"""Generate one research puzzle with the app's native solver and a learned proposal."""
import argparse
import json
import os
import random
import subprocess
from collections import Counter
from functools import cache
from itertools import combinations
from pathlib import Path
from urllib.parse import quote

from train import BOXES, MODEL, NEIGHBORS, ROOT, connected, context, orientations, perimeter

LEVELS = ['beginner', 'easy', 'medium', 'tricky', 'hard', 'very-hard', 'expert', 'master', 'extreme', 'impossible']
EMPTY = '0' * 81
LEARNED = json.loads(MODEL.read_text())
BIN = Path(os.environ.get('CARGO_TARGET_DIR', ROOT / 'target')).resolve() / 'release'


def invoke(binary, args, rows):
    text = ''.join(json.dumps(row) + '\n' for row in rows)
    proc = subprocess.run([binary, *args], input=text, text=True, capture_output=True, check=True)
    outputs = [json.loads(line) for line in proc.stdout.splitlines()]
    if len(rows) != len(outputs):
        raise ValueError('The engine returned the wrong number of rows.')
    return outputs


def lab(row):
    result, = invoke(BIN / 'examples/generator_lab', [], [row])
    if isinstance(result, dict) and 'error' in result:
        raise ValueError(result['error'])
    return result


def engine(command, row):
    result, = invoke(BIN / 'sudoku-engine', [command], [row])
    result = result['result']
    if result['status'] == 'invalid':
        raise ValueError(result)
    return result


def weighted(rng, rows):
    return rng.choices(rows, weights=[row[-1] for row in rows], k=1)[0][:-1]


def draw_mask(rng, model):
    num, den = model['symmetry']
    symmetric = rng.randrange(den) < num
    mask = []
    for i in range(41 if symmetric else 81):
        num, den = model['contexts'][context(mask, i)]
        mask.append(int(rng.randrange(den) < num))
    return mask + mask[:40][::-1] if symmetric else mask


def classic(rng, seed, level, method):
    if method == 'current':
        result = engine('batch-generate', {'type': 'generate-targeted', 'seed': seed, 'maxAttempts': 1,
                        'target': {'type': 'difficulty', 'level': level, 'techniqueOrder': classic_order(level)}})
        if result['status'] != 'matched':
            return None
        return {'givens': result['puzzle'], 'rating': result['rating']['status'], 'hardest': result['rating']['score']['hardest']}
    model = LEARNED['classic']
    clues, singles = weighted(rng, model['profiles'][level])
    if method == 'symmetry':
        half = rng.sample(range(40), clues // 2)
        mask = [int(min(i, 80-i) in half or i == 40 and clues % 2) for i in range(81)]
        singles = None
    else:
        masks = [draw_mask(rng, model['mask']) for _ in range(12)]
        mask = min(masks, key=lambda m: abs(sum(m) - clues))
    groups = ([[i, 80-i] for i in range(40)] + [[40]] if mask == mask[::-1] else [[i] for i in range(81)])
    rng.shuffle(groups)
    groups.sort(key=lambda g: mask[g[0]])
    trades = [[rng.getrandbits(16), rng.getrandbits(16)] for _ in range(32)] if method == 'trades' else []
    return lab(dict(op='carve', seed=seed, level=level, groups=groups, clues=clues, singles=singles, trades=trades))


@cache
def technique_catalog():
    # The variant catalog includes classic techniques that work with structured puzzles.
    return engine('batch-variant', {'type': 'techniques', 'variant': True})['value']


@cache
def classic_order(level):
    # Use the Rust engine's canonical order, also used by accepts_difficulty.
    return lab({'op': 'classic-order', 'level': level})


@cache
def variant_order():
    catalog = technique_catalog()
    classic_ids = classic_order('impossible')
    omitted = {'forcing-net', 'multi-sector-locked-sets', 'sk-loop',
               'grouped-discontinuous-nice-loop', 'grouped-continuous-nice-loop'}
    tiers = {t['id']: LEVELS.index(t['difficulty']) for t in catalog['techniques']}
    order = dict.fromkeys(catalog['defaultOrder'] + [t for t in classic_ids if t not in omitted])
    return sorted(order, key=lambda t: tiers.get(t, len(LEVELS)-1))


def jigsaw_regions(rng):
    model = LEARNED['jigsaw']
    target, = weighted(rng, model['perimeters'])
    groups = [set(box) for box in BOXES]
    labels = [i//27*3 + i%9//3 for i in range(81)]
    length = 108
    best, best_gap = [sorted(g) for g in groups], abs(target - length)
    for _ in range(850):
        a = rng.randrange(81)
        other = [b for b in NEIGHBORS[a] if labels[b] != labels[a]]
        if not other:
            continue
        ia, ib = labels[a], labels[rng.choice(other)]
        ga, gb = groups[ia], groups[ib]
        eligible = [b for b in sorted(gb) if any(c in ga and c != a for c in NEIGHBORS[b])
                    and any(c in gb and c != b for c in NEIGHBORS[a])]
        if not eligible:
            continue
        b = rng.choice(eligible)
        na, nb = (ga - {a}) | {b}, (gb - {b}) | {a}
        if not connected(sorted(na)) or not connected(sorted(nb)):
            continue
        after = length + perimeter(na) + perimeter(nb) - perimeter(ga) - perimeter(gb)
        if abs(target - after) > abs(target - length) and rng.random() > .08:
            continue
        labels[a], labels[b] = ib, ia
        groups[ia], groups[ib] = na, nb
        length = after
        # Several different shapes can have the same perimeter.
        if abs(target - length) < best_gap:
            best, best_gap = [sorted(g) for g in groups], abs(target - length)
            if best_gap == 0:
                break
    return best


@cache
def cage_shapes(size_only=False):
    observations = LEARNED['killer']['shapes']
    size_totals = Counter()
    size_classes = Counter()
    if size_only:
        for cells, count in observations:
            size_totals[len(cells)] += count
            size_classes[len(cells)] += 1
    shapes = []
    for cells, weight in observations:
        if size_only:
            weight = size_totals[len(cells)] / size_classes[len(cells)]
        poses = set()
        for points in orientations([divmod(c, 9) for c in cells]):
            r, c = points[0]
            poses.add(tuple((y-r, x-c) for y, x in points))
        shapes.append((sorted(poses), weight))
    return shapes


def tile(rng, solution, size_only):
    # Each recursive step covers the first free square. The singleton limit prevents
    # a greedy choice from leaving a long tail of isolated cells.
    singletons, = weighted(rng, LEARNED['killer']['singletons'])
    budget = 1500

    def fill(free, remaining_singles):
        nonlocal budget
        if not free:
            return []
        if budget <= 0:
            return None
        budget -= 1
        first = min(free)
        y, x = divmod(first, 9)
        choices = []
        for poses, weight in cage_shapes(size_only):
            if len(poses[0]) == 1 and remaining_singles == 0:
                continue
            valid = []
            for pose in poses:
                if any(not (0 <= x+dx < 9 and y+dy < 9) for dy, dx in pose):
                    continue
                cells = [(y+dy)*9+x+dx for dy, dx in pose]
                if free.issuperset(cells) and len({solution[c] for c in cells}) == len(cells):
                    valid.append(cells)
            if valid:
                rng.shuffle(valid)
                # A weighted permutation of geometry classes. Choose the orientation within its class.
                choices.append((rng.expovariate(weight), valid))
        for _, poses in sorted(choices):
            for cells in poses:
                if budget <= 0:
                    return None
                rest = free.difference(cells)
                allowance = remaining_singles - (len(cells) == 1)
                isolated = sum(all(n not in rest for n in NEIGHBORS[c]) for c in rest)
                if isolated <= allowance:
                    tail = fill(rest, allowance)
                    if tail is not None:
                        return [cells, *tail]
        return None

    return fill(set(range(81)), singletons)


def variant_op(puzzle, op, order=None):
    options = {'position': {'puzzle': puzzle}, 'operation': op, 'maxNodes': 20_000}
    if order is not None:
        options['techniqueOrder'] = order
    return engine('batch-variant', options)


def killer(rng, seed, level, size_only):
    solution = lab(dict(op='solution', seed=seed))
    groups = tile(rng, solution, size_only)
    if not groups:
        return None
    # Split a cage and recalculate both sums if an alternative solution survives.
    # Limit repairs so a weak layout cannot become a grid of singleton cages.
    for _ in range(5):
        cages = [dict(cells=sorted(g), sum=sum(int(solution[i]) for i in g)) for g in groups]
        puzzle = dict(version=1, givens=EMPTY, rules=[dict(type='killer-cages', cages=cages, coverGrid=True)])
        exact = variant_op(puzzle, 'analyze')
        if exact.get('value') == 'unique':
            # Let the normal generation path certify the requested grade and rule dependency.
            # Anchoring its sampler to the solution cannot change the zero-given output.
            req = dict(type='generate-variant', seed=seed, maxAttempts=1, maxNodes=20_000,
                       template={**puzzle, 'givens': solution}, givens=0, requiredRule='killer-cages',
                       difficulty=level, techniqueOrder=variant_order())
            return matched_variant(req)
        large = [g for g in groups if len(g) >= 3]
        if not large:
            break
        group = rng.choice(large)
        for size in [2, 1]:
            splits = []
            for part in combinations(group, size):
                rest = [i for i in group if i not in part]
                if rest and connected(part) and connected(rest):
                    splits.append((list(part), rest))
            if splits:
                groups.remove(group)
                groups.extend(rng.choice(splits))
                break
    return None


def matched_variant(req):
    result = engine('batch-generate', req)
    if result['status'] != 'matched':
        return None
    return {k: result[k] for k in ('puzzle', 'solution', 'rating')}


def variant(rng, seed, family, level, method):
    if method in {'current', 'current-zero'}:
        bank = json.loads((ROOT / 'src/sudoku/variant-seeds.json').read_text())
        key = 'killer-cages' if family == 'killer' else family
        recipes = bank[key][level]
        recipe = recipes[seed % len(recipes)]
        template = dict(version=1, givens=recipe.get('layout', EMPTY))
        derived = []
        if family == 'jigsaw':
            template['regions'] = dict(type='jigsaw', regions=[[i for i, v in enumerate(recipe['regions']) if int(v)==k] for k in range(9)])
        else:
            derived = [dict(type='killer-cage-sizes', sizes=recipe['cageSizes'], coverGrid=True)]
        return matched_variant(dict(type='generate-variant', seed=seed, template=template, givens=0 if method == 'current-zero' else [0, recipe['maxGivens']],
                               derivedClues=derived, requiredRule=key, difficulty=level,
                               techniqueOrder=variant_order(), maxNodes=20_000, maxAttempts=1))
    if family == 'killer':
        return killer(rng, seed, level, size_only=method == 'size-only')
    groups = jigsaw_regions(rng)
    clues, = weighted(rng, LEARNED['jigsaw']['clues'])
    sym, total = LEARNED['jigsaw']['mask']['symmetry']
    half_turn = method == 'paired' and rng.randrange(total) < sym
    return matched_variant(dict(type='generate-variant', seed=seed, maxAttempts=1, maxNodes=20_000,
                           halfTurnGivens=half_turn, template=dict(version=1, givens=EMPTY, regions=dict(type='jigsaw', regions=groups)),
                           givens=[max(0, clues-3), min(40, clues+3)], requiredRule='jigsaw',
                           difficulty=level, techniqueOrder=variant_order()))


def sample(family, level, seed, budget, method='learned'):
    seeds = random.Random(seed)
    for index in range(budget):
        attempt_seed = seed if index == 0 else seeds.getrandbits(32)
        rng = random.Random(attempt_seed ^ 0x9E3779B9)
        if family == 'classic':
            candidate = classic(rng, attempt_seed, level, method)
        else:
            candidate = variant(rng, attempt_seed, family, level, method)
        if candidate is not None:
            return dict(family=family, level=level, seed=seed, method=method, attempts=index+1, result=candidate)
    return dict(family=family, level=level, seed=seed, method=method, attempts=budget, result=None)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('family', choices=['classic', 'killer', 'jigsaw'])
    parser.add_argument('level', choices=LEVELS)
    parser.add_argument('--seed', type=int, default=1)
    parser.add_argument('--attempts', type=int, default=8)
    parser.add_argument('--method', choices=['learned', 'trades', 'paired', 'size-only'], default='learned')
    parser.add_argument('--format', choices=['json', 'link'], default='json')
    args = parser.parse_args()
    if not 0 <= args.seed <= 0xffffffff or args.attempts < 1:
        parser.error('Use a 32-bit unsigned seed and at least one attempt.')
    if args.family == 'classic' and args.level not in LEARNED['classic']['profiles']:
        parser.error('The classic model covers beginner, easy, medium, and tricky.')
    if args.method == 'trades' and args.family != 'classic':
        parser.error('Clue trades apply to classic puzzles.')
    if args.method == 'paired' and args.family != 'jigsaw':
        parser.error('This experiment pairs clues in Jigsaw puzzles.')
    if args.method == 'size-only' and args.family != 'killer':
        parser.error('The cage-size model applies to Killer puzzles.')
    record = sample(args.family, args.level, args.seed, args.attempts, args.method)
    if args.format == 'json':
        print(json.dumps(record, indent=2))
    elif record['result'] is None:
        raise SystemExit('No puzzle matched within the attempt budget.')
    else:
        result = record['result']
        if args.family == 'classic':
            fragment = 'puzzle=' + result['givens']
        else:
            variant = 'killer-cages' if args.family == 'killer' else args.family
            shared = {'id': variant, 'puzzle': result['puzzle']}
            fragment = 'variant=' + quote(json.dumps(shared, separators=(',', ':')), safe='')
        print('https://coder13-sudoku.netlify.app/#' + fragment)
