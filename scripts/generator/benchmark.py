"""Compare proposal methods with identical seeds and attempt budgets."""
import argparse
import json
import time
from concurrent.futures import ProcessPoolExecutor
from sample import sample


def measure(task):
    family, level, seed, budget, method = task
    start = time.monotonic()
    record = sample(family, level, seed, budget, method)
    record['elapsedMs'] = round((time.monotonic()-start)*1000, 1)
    return record


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('family', choices=['classic', 'killer', 'jigsaw'])
    parser.add_argument('--levels', nargs='+', required=True)
    parser.add_argument('--seeds', type=int, default=24)
    parser.add_argument('--attempts', type=int, default=6)
    parser.add_argument('--workers', type=int, default=1)
    parser.add_argument('--offset', type=int, default=0)
    parser.add_argument('--methods', nargs='+', choices=['current', 'learned', 'symmetry', 'trades', 'paired', 'size-only', 'current-zero'])
    args = parser.parse_args()
    methods = ['current', 'learned'] + (['symmetry'] if args.family == 'classic' else [])
    methods = args.methods or methods
    if args.family != 'classic' and any(m in {'symmetry', 'trades'} for m in methods):
        parser.error('Symmetry and clue trades apply to classic puzzles.')
    if args.family != 'jigsaw' and 'paired' in methods:
        parser.error('The paired experiment applies to Jigsaw puzzles.')
    if args.family != 'killer' and any(m in {'size-only', 'current-zero'} for m in methods):
        parser.error('Cage size and zero-given controls apply to Killer puzzles.')
    tasks = [(args.family, level, (0x75BCD15 + n*2654435761) & 0xffffffff, args.attempts, method)
             for n in range(args.offset, args.offset + args.seeds) for level in args.levels for method in methods]
    with ProcessPoolExecutor(args.workers) as pool:
        for record in pool.map(measure, tasks):
            print(json.dumps(record, separators=(',', ':')), flush=True)
