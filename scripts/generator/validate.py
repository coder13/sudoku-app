"""Score held-out layouts, cross-check generated puzzles and summarize paired trials."""
import argparse
import hashlib
from collections import Counter, defaultdict
import json
import math
import random
from itertools import chain
import re
import statistics
from pathlib import Path
from urllib.request import urlopen

from sample import BIN, EMPTY, LEVELS, engine, invoke
from train import (BOXES, COLS, MODEL, ROOT, ROWS, classic_holdout,
                   mask_bits, mask_model, perimeter, split_key, train, variant_rows)

ISS = '7d9119de588fdab20e3c379db20839909c5f0785'
ISS_DIGEST = '3f469025273d9a02da2871ea441e99585eae4a9a7a79b1008466f277320b6612'
ISS_ROOT = f'https://raw.githubusercontent.com/sigh/iss-sudoku-index/{ISS}'
SETTERS = {'philip newman', 'bill murphy', 'sam cappleman-lynes', 'clover', 'clover!', 'thomas snyder', 'wei-hwa huang'}


def external_classics(folder):
    path = folder / 'iss-classic.json'
    if not path.exists():
        all_rows = json.loads(urlopen(f'{ISS_ROOT}/data/mappings-archive.json', timeout=60).read())['rows']
        rows = []
        for row in all_rows:
            if (row['constraint_types'] != ['Given'] or row['unique_solution'] is not True
                    or (row['author'] or '').lower() not in SETTERS):
                continue
            pid = row['puzzle_id']
            raw = urlopen(f'{ISS_ROOT}/data/puzzles/{pid}/puzzle.iss', timeout=30).read().decode()
            rows.append(dict(id=pid, author=row['author'], iss=raw, source=row['sources'][0]))
        path.write_text(json.dumps(rows))
    rows = json.loads(path.read_text())
    normalized = json.dumps(sorted(rows, key=lambda row: row['id']), sort_keys=True,
                            ensure_ascii=False, separators=(',', ':')).encode()
    if hashlib.sha256(normalized).hexdigest() != ISS_DIGEST:
        raise ValueError('The cached classic transcription records differ from the pinned source.')
    boards = {}
    seen = set()
    for row in rows:
        text = row['iss'].strip()
        if not re.fullmatch(r'\.(?:~R[1-9]C[1-9]_[1-9])+', text):
            continue
        board = list(EMPTY)
        for r, c, d in re.findall(r'~R(\d)C(\d)_(\d)', text):
            cell = (int(r)-1)*9 + int(c)-1
            if board[cell] != '0':
                raise ValueError(row['id'])
            board[cell] = d
        givens = ''.join(board)
        normalized = row['author'].lower().rstrip('!')
        if givens not in seen:
            boards[row['id']] = (givens, normalized)
            seen.add(givens)
    return boards


def as_mask(board):
    return [int(d != '0') for d in board]


def canonical(boards):
    rows = [dict(op='canonical', givens=b) for b in boards]
    return invoke(BIN / 'examples/generator_lab', [], rows)


def intervals(values):
    rng = random.Random(913)
    means = sorted(statistics.mean(rng.choices(values, k=len(values))) for _ in range(1500))
    return [round(means[int(len(means)*p)], 2) for p in [.025, .975]]


def compression(reference, external):
    fit = [as_mask(r['givens']) for r in reference if not r['held']]
    model, md = mask_model(fit)
    density = [1 + sum(map(sum, fit)), 2 + 81 * len(fit)]
    clue_counts = Counter(map(sum, fit))

    def measure(boards):
        results = []
        for board in boards:
            mask = as_mask(board)
            iid, symmetric, local = mask_bits(mask, model, density, md)
            k, same = sum(mask), mask == mask[::-1]
            flag = -math.log2((model['symmetry'][0] if same else model['symmetry'][1]-model['symmetry'][0]) / model['symmetry'][1])
            enumerative = flag - math.log2((clue_counts[k]+.5)/(len(fit)+41)) + math.log2(
                math.comb(40, k//2) if same else math.comb(81, k))
            results.append((iid, symmetric, enumerative, local))
        return dict(n=len(boards), meanBits=dict(zip(['density', 'symmetry', 'countAndSymmetry', 'context'],
                    (round(statistics.mean(col), 2) for col in zip(*results)))),
                    bitsSavedVsSymmetryCI=intervals([r[1]-r[3] for r in results]))

    return {label: measure(boards) for label, boards in {
        'nikoli': [r['givens'] for r in reference if r['held']],
        'independentSetters': list(external),
        'exchangeControl': [r['givens'] for r in json.loads((ROOT/'src/sudoku/collections/sudoku-exchange.json').read_text())],
    }.items()}


def cross_setter(reference, external):
    # Hold out an entire external setter each time. Each model gets equal weight
    # in the mixture, regardless of how many puzzles the setter contributed.
    nikoli = [as_mask(r['givens']) for r in reference if not r['held']]
    sources = defaultdict(list)
    for board, setter in external:
        sources[setter].append(as_mask(board))

    def code(mask, fitted):
        model, density = fitted
        return mask_bits(mask, model, density, density)[1:]

    def mixture(bits):
        shortest = min(bits)
        return shortest - math.log2(statistics.mean(2**(shortest-b) for b in bits))

    per_setter = {}
    scores = []
    for setter, tests in sorted(sources.items()):
        training = [nikoli, *(rows for name, rows in sources.items() if name != setter)]
        pooled = mask_model(list(chain.from_iterable(training)))
        specialists = [mask_model(rows) for rows in training]
        held_scores = []
        for mask in tests:
            simple, local = code(mask, pooled)
            # Include one global symmetry-only model as a general fallback.
            mixed = mixture([simple, *(code(mask, f)[1] for f in specialists)])
            held_scores.append((simple, local, mixed))
        per_setter[setter] = [round(statistics.mean(c), 2) for c in zip(*held_scores)]
        scores.extend(held_scores)
    return dict(order=['pooledSymmetry', 'pooledContext', 'mixture'], perSetter=per_setter,
                mean=[round(statistics.mean(c), 2) for c in zip(*scores)])


def singles_waves(board):
    houses = ROWS + COLS + BOXES
    values = list(board)
    waves = []
    while '0' in values:
        possible = [set() for _ in values]
        for i, d in enumerate(values):
            if d == '0':
                peers = ROWS[i//9]+COLS[i%9]+BOXES[i//27*3+i%9//3]
                possible[i] = set('123456789') - {values[j] for j in peers}
        moves = {i: next(iter(p)) for i, p in enumerate(possible) if len(p) == 1}
        for house in houses:
            for d in '123456789':
                locations = [i for i in house if d in possible[i]]
                if len(locations) == 1:
                    moves[locations[0]] = d
        if not moves:
            break
        waves.append(len(moves))
        for i, d in moves.items():
            values[i] = d
    return waves, values.count('0')


def metrics(family, out):
    board = out['givens'] if family == 'classic' else out['puzzle']['givens']
    mask = as_mask(board)
    values = dict(clues=sum(mask), symmetric=int(mask == mask[::-1]))
    if family == 'classic':
        waves, remaining = singles_waves(board)
        values.update(opening=waves[0] if waves else 0, singlesRemaining=remaining)
        if 'opening' in out:
            assert out['opening'] == values['opening']
    elif family == 'killer':
        cages = out['puzzle']['rules'][0]['cages']
        groups = [c['cells'] for c in cages]
        assert sorted(i for g in groups for i in g) == list(range(81))
        for cage in cages:
            digits = [int(out['solution'][i]) for i in cage['cells']]
            assert len(digits) == len(set(digits)) and sum(digits) == cage['sum']
        values.update(cages=len(groups), bent=sum(len({i//9 for i in g})>1 and len({i%9 for i in g})>1 for g in groups)/len(groups))
    else:
        groups = out['puzzle']['regions']['regions']
        assert sorted(i for g in groups for i in g) == list(range(81))
        assert all(len(g) == 9 for g in groups)
        values['perimeter'] = statistics.mean(perimeter(g) for g in groups)
    return values


def distribution(values):
    return {key: round(statistics.mean([v[key] for v in values]), 3) for key in values[0]} if values else {}


def evaluate(paths, reference, cache):
    bins = defaultdict(list)
    seen_masks, seen_classic, seen_variant = set(), [], defaultdict(list)
    controls = []
    for path in paths:
        for line in path.read_text().splitlines():
            row = json.loads(line)
            bins[row['family'], row['level'], row['method']].append(row)
    report = []
    for (family, level, method), rows in sorted(bins.items()):
        done = [r['result'] for r in rows if r['result'] is not None]
        for result in done:
            status = result['rating'] if family == 'classic' else result['rating']['status']
            assert status == {'solved': level}
            if method in {'size-only', 'current-zero'}:
                controls.append(result['puzzle'])
            if method in {'learned', 'trades', 'paired'}:
                if family == 'classic':
                    seen_classic.append(result['givens'])
                    seen_masks.add(split_key(as_mask(result['givens'])))
                else:
                    puzzle = result['puzzle']
                    seen_variant[family].append(puzzle)
        durations = sorted(r['elapsedMs'] for r in rows)
        report.append(dict(family=family, level=level, method=method, n=len(rows), hits=len(done),
                      medianMs=round(statistics.median(durations), 1),
                      p95Ms=durations[math.ceil(.95*len(rows))-1],
                      **distribution([metrics(family, r) for r in done])))
    source_keys = set(canonical(reference))
    generated_keys = canonical(seen_classic)
    exact = invoke(BIN/'examples/generator_lab', [], [dict(op='check', givens=g) for g in seen_classic])
    assert all(v is True for v in exact)
    novelty = dict(classicSamples=len(generated_keys), distinctClassic=len(set(generated_keys)),
                   classicSourceMatches=len(set(generated_keys)&source_keys),
                   distinctClassicMasksD4=len(seen_masks))
    for family, puzzles in seen_variant.items():
        # Recheck the returned board without the anchoring solution as input.
        checks = [dict(operation='analyze', position={'puzzle': p}, maxNodes=20_000) for p in puzzles]
        results = invoke(BIN/'sudoku-engine', ['batch-variant'], checks)
        assert all(r['result'].get('value') == 'unique' for r in results)
        novelty[family+'UniqueChecks'] = len(results)
        corpus, _ = variant_rows(cache, 'KillerSudoku' if family == 'killer' else 'JigsawSudoku')
        source_layouts = {r['key'] for r in corpus}
        keys = set()
        for puzzle in puzzles:
            groups = ([c['cells'] for c in puzzle['rules'][0]['cages']] if family == 'killer'
                      else puzzle['regions']['regions'])
            labels = [None] * 81
            for label, cells in enumerate(groups):
                for cell in cells:
                    labels[cell] = label
            keys.add(split_key(labels))
        novelty[family+'DistinctLayouts'] = len(keys)
        novelty[family+'SourceLayouts'] = len(keys & source_layouts)
    if controls:
        checks = [dict(operation='analyze', position={'puzzle': p}, maxNodes=20_000) for p in controls]
        outputs = invoke(BIN/'sudoku-engine', ['batch-variant'], checks)
        assert all(r['result'].get('value') == 'unique' for r in outputs)
    novelty['killerControlUniqueChecks'] = len(controls)
    comparisons = []
    for (family, level, method), rows in sorted(bins.items()):
        if method == 'current' or (family, level, 'current') not in bins:
            continue
        base = {row['seed']: row for row in bins[family, level, 'current']}
        wins = losses = ties = 0
        for row in rows:
            if row['seed'] not in base:
                continue
            hit = row['result'] is not None
            current_hit = base[row['seed']]['result'] is not None
            wins += hit and not current_hit
            losses += current_hit and not hit
            ties += hit == current_hit
        discordant = wins + losses
        tail = sum(math.comb(discordant, i) for i in range(min(wins, losses) + 1))
        p = min(1, 2 * tail / 2**discordant)
        comparisons.append(dict(family=family, level=level, method=method,
                                wins=wins, losses=losses, ties=ties, exactTwoSidedP=p))
    return report, novelty, comparisons


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', required=True, type=Path)
    parser.add_argument('runs', nargs='+', type=Path)
    args = parser.parse_args()
    records = json.loads((ROOT/'src/sudoku/collections/nikoli-100.json').read_text())
    for r in records:
        r['key'] = split_key(as_mask(r['givens']))
        r['level'] = r['difficulty']
    held = classic_holdout(records)
    for r in records:
        r['held'] = r['key'] in held
    external = list(external_classics(args.cache).values())
    refs = [r['givens'] for r in records]
    seen = set(canonical(refs))
    independently_unique, tagged, counts = [], [], Counter()
    all_external = [g for g, _ in external]
    # Confirm that the source encoding describes a uniquely solvable classic.
    checks = invoke(BIN/'examples/generator_lab', [], [dict(op='check', givens=g) for g in all_external])
    for (givens, setter), ident, valid in zip(external, canonical(all_external), checks):
        if ident not in seen and valid is True:
            independently_unique.append(givens)
            tagged.append((givens, setter))
            counts[setter] += 1
            seen.add(ident)
    report, novelty, paired = evaluate(args.runs, refs+independently_unique, args.cache)
    learned, holdout = train(args.cache)
    assert learned == json.loads(MODEL.read_text())
    held_classic = defaultdict(list)
    for r in records:
        if r['held']:
            held_classic[r['difficulty']].append(metrics('classic', r))
    print(json.dumps(dict(holdout=holdout, externalSetters=counts, compression=compression(records, independently_unique),
                     crossSetter=cross_setter(records, tagged),
                     sourceProfiles={k: distribution(v) for k, v in held_classic.items()}, generation=report, pairedVsCurrent=paired, novelty=novelty), indent=2))


if __name__ == '__main__':
    main()
